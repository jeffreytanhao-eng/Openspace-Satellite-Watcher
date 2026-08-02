// POST /api/ai/task-planning
// 代理 LLM 调用:将 TREA-01 任务规划数据转发给火山引擎方舟(Doubao,OpenAI 兼容协议)
// 设计要点:
//   - API key/EP 通过环境变量读取,绝不返回给前端
//   - 使用 response_format: json_object 强制 JSON 输出
//   - 失败时返回结构化错误(不暴露内部细节)
//   - 超时 30s,避免长时间阻塞前端
//
// 环境变量:
//   LLM_API_KEY  - 火山引擎方舟 API key
//   LLM_API_URL  - 接入点 base URL(如 https://ark.cn-beijing.volces.com/api/v3)
//   LLM_MODEL    - 模型 EP(如 ep-20260408153341-2ztdd)

import { NextResponse } from 'next/server';
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  COLLISION_SYSTEM_PROMPT,
  buildCollisionPrompt,
  mapCollisionToTaskPlanning,
  type AiTaskPlanningInput,
  type AiTaskPlanningOutput,
  type AiCollisionAvoidanceInput,
  type AiCollisionAvoidanceOutput,
} from '@/lib/trea/ai-prompt';

// 强制动态渲染(避免被静态化缓存)
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel serverless 超时 60s(推理模型可能较慢)

/** LLM 调用超时(毫秒)— 留足余量应对网络抖动 */
const LLM_TIMEOUT_MS = 55_000;

interface LlmErrorResponse {
  success: false;
  error: string;
  code: 'MISSING_CONFIG' | 'INVALID_INPUT' | 'LLM_TIMEOUT' | 'LLM_ERROR' | 'PARSE_ERROR';
}

interface LlmSuccessResponse {
  success: true;
  data: AiTaskPlanningOutput;
  /** LLM 原始输出(调试用) */
  rawContent: string;
  /** 调用耗时(ms) */
  elapsedMs: number;
}

/**
 * 验证环境变量是否配置齐全
 */
function validateConfig(): { ok: boolean; error?: string } {
  const { LLM_API_KEY, LLM_API_URL, LLM_MODEL } = process.env;
  if (!LLM_API_KEY || !LLM_API_URL || !LLM_MODEL) {
    // 列出具体缺失项,便于在 Vercel Function Logs 中快速定位
    const missing = [
      !LLM_API_KEY && 'LLM_API_KEY',
      !LLM_API_URL && 'LLM_API_URL',
      !LLM_MODEL && 'LLM_MODEL',
    ].filter(Boolean).join(', ');
    console.error('[ai/task-planning] 环境变量缺失:', missing);
    return {
      ok: false,
      error: `LLM 配置缺失(缺少: ${missing})`,
    };
  }
  return { ok: true };
}

/**
 * 从 LLM 响应文本中提取 JSON 对象
 * 容错处理:LLM 可能在 JSON 前后加文字,或用 ```json 包裹
 */
function extractJson(content: string): unknown {
  // 1. 尝试直接解析
  try {
    return JSON.parse(content);
  } catch {
    // 继续尝试其他方式
  }

  // 2. 尝试提取 ```json ... ``` 代码块
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // 继续尝试
    }
  }

  // 3. 尝试提取第一个 { ... } 块
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // 继续尝试
    }
  }

  throw new Error('LLM 输出无法解析为 JSON');
}

/**
 * 校验 AI 输出结构是否符合预期
 * 缺字段时补默认值,类型错误时转换,确保前端能渲染
 */
function normalizeOutput(raw: unknown): AiTaskPlanningOutput {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown, fallback = ''): string =>
    typeof v === 'string' ? v : fallback;
  const num = (v: unknown, fallback = 0): number =>
    typeof v === 'number' && !Number.isNaN(v) ? v : fallback;
  const arr = (v: unknown): AiTaskPlanningOutput['aoiAnalysis'] => {
    if (!Array.isArray(v)) return [];
    return v.map((item, idx) => {
      const a = (item ?? {}) as Record<string, unknown>;
      return {
        aoiId: str(a.aoiId, `unknown-${idx}`),
        score: num(a.score, 0),
        pros: str(a.pros),
        cons: str(a.cons),
      };
    });
  };

  return {
    recommendedAoi: str(obj.recommendedAoi, 'aoi-a'),
    recommendedWindowIndex: num(obj.recommendedWindowIndex, 0),
    aoiAnalysis: arr(obj.aoiAnalysis),
    reasoning: str(obj.reasoning, '(未提供推理过程)'),
    maneuverAdvice: str(obj.maneuverAdvice, '当前轨道过境窗口充足,无需机动'),
    riskAssessment: str(obj.riskAssessment, '(未提供风险评估)'),
    executionPlan: str(obj.executionPlan, '(未提供执行计划)'),
    confidence: Math.min(100, Math.max(0, num(obj.confidence, 50))),
  };
}

export async function POST(request: Request): Promise<NextResponse<LlmSuccessResponse | LlmErrorResponse>> {
  const startTime = Date.now();

  // 1. 验证环境变量
  const cfg = validateConfig();
  if (!cfg.ok) {
    return NextResponse.json<LlmErrorResponse>(
      { success: false, error: cfg.error!, code: 'MISSING_CONFIG' },
      { status: 503 }
    );
  }

  const { LLM_API_KEY, LLM_API_URL, LLM_MODEL } = process.env;

  // 2. 解析请求体(支持 task-planning 和 collision-avoidance 两种场景)
  let systemPrompt: string;
  let userPrompt: string;
  let scenario: string;
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      throw new Error('请求体必须是 JSON 对象');
    }
    // 基础校验(两种场景都需要 TLE 和轨道根数)
    if (!body.tle || !body.tle.line1 || !body.tle.line2) {
      throw new Error('缺少 TLE 数据');
    }
    if (!body.elements || typeof body.elements !== 'object') {
      throw new Error('缺少轨道根数(elements)字段');
    }
    scenario = body.scenario || 'task-planning';
    if (scenario === 'collision-avoidance') {
      // 碰撞避撞场景:需要 collisionAlert 字段
      if (!body.collisionAlert) {
        throw new Error('缺少碰撞预警数据(collisionAlert)');
      }
      const collisionInput = body as AiCollisionAvoidanceInput;
      systemPrompt = COLLISION_SYSTEM_PROMPT;
      userPrompt = buildCollisionPrompt(collisionInput);
    } else {
      // 任务规划场景(默认):需要 AOI 列表
      if (!Array.isArray(body.aois)) {
        throw new Error('缺少 AOI 列表');
      }
      const input = body as AiTaskPlanningInput;
      systemPrompt = SYSTEM_PROMPT;
      userPrompt = buildUserPrompt(input);
    }
  } catch (e) {
    return NextResponse.json<LlmErrorResponse>(
      { success: false, error: `输入无效: ${e instanceof Error ? e.message : String(e)}`, code: 'INVALID_INPUT' },
      { status: 400 }
    );
  }

  // 4. 调用 LLM(OpenAI 兼容协议)
  const url = `${LLM_API_URL}/chat/completions`;
  console.log('[ai/task-planning] 开始调用 LLM', {
    scenario,
    model: LLM_MODEL,
    url,
    timeoutMs: LLM_TIMEOUT_MS,
    ts: new Date().toISOString(),
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const llmResp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        // 强制 JSON 输出(火山方舟支持)
        response_format: { type: 'json_object' },
        // 适度温度:规划需要严谨但允许一定灵活推理
        temperature: 0.3,
        max_tokens: 3000,
        // 禁用深度思考(thinking):doubao-seed 推理模型默认会消耗大量推理 token,
        // 禁用后响应时间从 ~107s 降至 ~23s,且规划质量仍优秀(评分/推理/建议完整)
        thinking: { type: 'disabled' },
      }),
      signal: controller.signal,
    });

    if (!llmResp.ok) {
      const errText = await llmResp.text().catch(() => '');
      console.error('[ai/task-planning] LLM API 错误:', llmResp.status, errText.slice(0, 500));
      return NextResponse.json<LlmErrorResponse>(
        {
          success: false,
          error: `LLM 服务返回错误(HTTP ${llmResp.status})`,
          code: 'LLM_ERROR',
        },
        { status: 502 }
      );
    }

    const llmData = await llmResp.json();
    const content: string = llmData?.choices?.[0]?.message?.content ?? '';

    if (!content) {
      return NextResponse.json<LlmErrorResponse>(
        { success: false, error: 'LLM 返回空内容', code: 'LLM_ERROR' },
        { status: 502 }
      );
    }

    // 5. 解析 JSON
    let parsed: unknown;
    try {
      parsed = extractJson(content);
    } catch (e) {
      console.error('[ai/task-planning] JSON 解析失败:', content.slice(0, 500));
      return NextResponse.json<LlmErrorResponse>(
        {
          success: false,
          error: 'LLM 输出无法解析为结构化数据',
          code: 'PARSE_ERROR',
        },
        { status: 502 }
      );
    }

    // 6. 标准化输出(根据 scenario 选择映射函数)
    const data = scenario === 'collision-avoidance'
      ? mapCollisionToTaskPlanning(parsed as AiCollisionAvoidanceOutput)
      : normalizeOutput(parsed);
    const elapsedMs = Date.now() - startTime;
    console.log('[ai/task-planning] 调用成功', { elapsedMs, contentLength: content.length });

    return NextResponse.json<LlmSuccessResponse>({
      success: true,
      data,
      rawContent: content,
      elapsedMs,
    });
  } catch (e) {
    // fetch 失败时,Node(undici)会把网络层错误包装为 `TypeError: fetch failed`,
    // 真实原因(DNS/连接重置/TLS/超时等)在 e.cause 里,必须取出才能定位。
    const cause = (e as { cause?: unknown }).cause;

    // 超时(abort):undici abort 时 e.name 可能是 'TypeError'(而非 'AbortError'),
    // 真实 AbortError 在 e.cause 中,需同时检查 cause.name / cause.code。
    const isAbort =
      (e instanceof Error && e.name === 'AbortError') ||
      (cause instanceof Error && cause.name === 'AbortError') ||
      (cause instanceof Error && (cause as { code?: string }).code === 'ABORT_ERR');
    if (isAbort) {
      console.error('[ai/task-planning] LLM 调用超时(abort)', { timeoutMs: LLM_TIMEOUT_MS });
      return NextResponse.json<LlmErrorResponse>(
        { success: false, error: 'LLM 调用超时,请稍后重试', code: 'LLM_TIMEOUT' },
        { status: 504 }
      );
    }

    // 记录真实原因(如 ECONNRESET / ENOTFOUND / ETIMEDOUT / UNABLE_TO_VERIFY_LEAF_SIGNATURE)
    const causeInfo =
      cause instanceof Error
        ? { name: cause.name, message: cause.message, code: (cause as { code?: string }).code }
        : cause;
    console.error('[ai/task-planning] 调用失败:', e, '| cause:', causeInfo);

    // 在错误信息中附上 cause 摘要,前端可见,便于排查(不含敏感信息)
    const causeSuffix =
      cause instanceof Error && cause.message ? ` [${cause.name}: ${cause.message}]` : '';
    return NextResponse.json<LlmErrorResponse>(
      {
        success: false,
        error: `LLM 调用失败: ${e instanceof Error ? e.message : String(e)}${causeSuffix}`,
        code: 'LLM_ERROR',
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

// OPTIONS 预检(CORS,虽然同源不需要,但保留扩展性)
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204 });
}
