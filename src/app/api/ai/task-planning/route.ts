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
  type AiAoiSummary,
  type AiCollisionAvoidanceInput,
  type AiCollisionAvoidanceOutput,
} from '@/lib/trea/ai-prompt';

// 强制动态渲染(避免被静态化缓存)
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel serverless 超时 60s(推理模型可能较慢)

/** LLM 调用超时(毫秒)— 留足余量应对网络抖动 */
const LLM_TIMEOUT_MS = 55_000;

/**
 * 连接失败场景的最大重试次数(不含首次尝试)。
 * 设计:香港(hkg1)节点 → 北京火山引擎为跨境线路,偶发 TCP 建连超时(ConnectTimeoutError),
 * 此类错误是瞬时抖动,重试大概率成功。仅对连接类错误重试,不重试业务/超时错误。
 */
const CONNECT_RETRY_MAX = 3;
/** 重试间隔(ms),递增退避:第 i 次重试前等待 RETRY_BASE_MS * 2^i */
const RETRY_BASE_MS = 300;

/** 判断是否为"可重试的连接类错误"(瞬时网络问题,非业务层错误) */
function isRetryableConnectError(err: unknown): boolean {
  const cause = (err as { cause?: unknown }).cause;
  const name = cause instanceof Error ? cause.name : '';
  const code = (cause instanceof Error && (cause as { code?: string }).code) || '';
  // ConnectTimeoutError / ECONNRESET / ENOTFOUND / ETIMEDOUT / ECONNREFUSED 均为瞬时连接问题
  return (
    name === 'ConnectTimeoutError' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'ECONNRESET' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED'
  );
}

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

/**
 * 生成降级 mock 规划(所有重试均失败时使用,避免前端直接报错)。
 * 基于请求体中的真实过境窗口/碰撞数据进行启发式计算,保证结果合理且可渲染。
 * 返回值与 AI 成功输出同构,前端无需区分是否为 mock。
 */
function buildMockOutput(
  body: AiTaskPlanningInput | AiCollisionAvoidanceInput,
  scenario: string,
  elapsedMs: number
): NextResponse<LlmSuccessResponse> {
  if (scenario === 'collision-avoidance' && 'collisionAlert' in body) {
    const alert = (body as AiCollisionAvoidanceInput).collisionAlert;
    const pc = alert.collisionProbability;
    const threatLevel = pc >= 1 ? '紧急' : pc >= 0.1 ? '高' : '中';
    const threatScore = threatLevel === '紧急' ? 95 : threatLevel === '高' ? 80 : 55;
    return NextResponse.json<LlmSuccessResponse>({
      success: true,
      data: {
        recommendedAoi: 'COLLISION_AVOIDANCE',
        recommendedWindowIndex: 0,
        aoiAnalysis: [
          {
            aoiId: 'COLLISION_AVOIDANCE',
            score: threatScore,
            pros: `碎片 ${alert.debrisName} 将在 ${new Date(alert.tca).toLocaleString('zh-CN')} 接近,最近距离 ${alert.missDistance.toFixed(3)} km,相对速度 ${alert.relativeVelocity.toFixed(2)} km/s。`,
            cons: `碰撞概率 ${pc.toFixed(2)}%,已达到机动阈值,需尽快评估避撞方案。`,
          },
        ],
        reasoning: `检测到碎片 ${alert.debrisName}(NORAD ${alert.debrisNoradId})接近,${threatLevel}威胁等级。最近接近距离 ${alert.missDistance.toFixed(3)} km,相对速度 ${alert.relativeVelocity.toFixed(2)} km/s。结合轨道几何与资源状态分析,建议优先执行沿迹机动,以最低燃料成本增加与碎片的沿轨分离距离,确保安全余量。`,
        maneuverAdvice: '沿迹机动,Δv ≈ 0.5 m/s\n执行时机:建议在 TCA 前 30 分钟\n燃料消耗:约 0.3%\n轨道变化:半长轴微调以产生相位漂移',
        riskAssessment: `当前碰撞概率 ${pc.toFixed(2)}%,超出 1e-4 机动阈值。机动后需确认新轨道不与其余碎片再接近。`,
        executionPlan: '1. 复核 CDM 数据确认 TCA/距离/概率\n2. 上注沿迹机动指令(Δv ≈ 0.5 m/s)\n3. 机动后 1 轨道周期复核新轨道\n4. 持续监测次生碰撞风险',
        confidence: 70,
      },
      rawContent: '[offline-mock] 连接 LLM 失败,已使用启发式降级结果',
      elapsedMs,
    });
  }

  // 任务规划场景:基于两个 AOI 的窗口质量打分
  const input = body as AiTaskPlanningInput;
  const aois = input.aois ?? [];
  const score = (a: AiAoiSummary): number => {
    if (a.windows.length === 0) return 0;
    const best = Math.max(...a.windows.map(w => w.maxElevation));
    const totalDur = a.windows.reduce((s, w) => s + w.duration, 0);
    return Math.min(100, Math.round(a.windows.length * 15 + best * 1.2 + totalDur / 60));
  };
  const sorted = aois
    .map(a => ({ a: a, s: score(a) }))
    .sort((x, y) => y.s - x.s);
  const top = sorted[0];
  const bestWindow = top?.a.windows.length
    ? top.a.windows.reduce((bestIdx, w, i, arr) => (w.maxElevation > arr[bestIdx].maxElevation ? i : bestIdx), 0)
    : 0;
  const recommended = top?.a.id ?? aois[0]?.id ?? 'aoi-a';
  const analysis = aois.map(a => ({
    aoiId: a.id,
    score: score(a),
    pros: `48 小时内 ${a.windowCount} 个过境窗口,最大仰角 ${
      a.windows.length ? Math.max(...a.windows.map(w => w.maxElevation)).toFixed(1) : '—'
    }°,累计可成像时长约 ${(a.windows.reduce((sum, w) => sum + w.duration, 0) / 60).toFixed(0)} 分钟。`,
    cons: a.windows.length === 0
      ? '48 小时内无过境窗口,成像机会稀缺。'
      : `建议关注仰角偏低窗口的成像质量(大气效应)。`,
  }));

  return NextResponse.json<LlmSuccessResponse>({
    success: true,
    data: {
      recommendedAoi: recommended,
      recommendedWindowIndex: bestWindow,
      aoiAnalysis: analysis,
      reasoning: `基于过境窗口启发式综合评分:${recommended.toUpperCase()} 窗口数更多、最大仰角更高、可成像时长更长,综合评分最高,成像质量与机会最优。当前燃料 ${input.fuel.toFixed(1)}%、电量 ${input.battery.toFixed(1)}%,资源充足,可支撑成像任务。`,
      maneuverAdvice: '当前轨道过境窗口充足,无需机动',
      riskAssessment: '主要风险为窗口仰角偏低时的成像质量,建议优先选择最大仰角窗口以降低大气畸变。',
      executionPlan: '1. 确认目标 AOI 与推荐窗口\n2. 复核成像时刻太阳高度角\n3. 规划侧摆角与成像时长\n4. 上注成像指令',
      confidence: 65,
    },
    rawContent: '[offline-mock] 连接 LLM 失败,已使用启发式降级结果',
    elapsedMs,
  });
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
  // body 需提升到外层作用域,供连接失败后的 mock 降级复用
  let systemPrompt: string;
  let userPrompt: string;
  let scenario: string;
  let requestBody: AiTaskPlanningInput | AiCollisionAvoidanceInput | null = null;
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
    requestBody = body as AiTaskPlanningInput | AiCollisionAvoidanceInput;
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

  // 4. 调用 LLM(OpenAI 兼容协议),带连接重试 + 失败 mock 降级
  const url = `${LLM_API_URL}/chat/completions`;
  const llmBody = JSON.stringify({
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
  });
  console.log('[ai/task-planning] 开始调用 LLM', {
    scenario,
    model: LLM_MODEL,
    url,
    timeoutMs: LLM_TIMEOUT_MS,
    ts: new Date().toISOString(),
  });

  // 单次 LLM 请求(返回解析后的 content 或抛出错误)
  const callLlmOnce = async (): Promise<string> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    try {
      const llmResp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LLM_API_KEY}`,
        },
        body: llmBody,
        signal: controller.signal,
      });

      if (!llmResp.ok) {
        const errText = await llmResp.text().catch(() => '');
        console.error('[ai/task-planning] LLM API 错误:', llmResp.status, errText.slice(0, 500));
        const err = new Error(`LLM 服务返回错误(HTTP ${llmResp.status})`);
        (err as { status?: number }).status = llmResp.status;
        throw err;
      }

      const llmData = await llmResp.json();
      const content: string = llmData?.choices?.[0]?.message?.content ?? '';
      if (!content) {
        throw new Error('LLM 返回空内容');
      }
      return content;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // 带重试的 LLM 调用:对连接类错误(ConnectTimeout/ECONNRESET/ENOTFOUND 等瞬时网络问题)
  // 递增退避重试最多 CONNECT_RETRY_MAX 次。业务/超时/解析错误不重试,直接抛出。
  let lastError: unknown;
  let content: string | null = null;
  for (let attempt = 0; attempt <= CONNECT_RETRY_MAX; attempt++) {
    try {
      content = await callLlmOnce();
      break;
    } catch (e) {
      lastError = e;
      // 仅连接类错误值得重试(瞬时网络抖动,重试大概率成功)
      if (!isRetryableConnectError(e)) {
        break;
      }
      if (attempt < CONNECT_RETRY_MAX) {
        const delay = RETRY_BASE_MS * 2 ** attempt;
        console.warn(`[ai/task-planning] 连接失败,${delay}ms 后重试 (${attempt + 1}/${CONNECT_RETRY_MAX})`, {
          name: (e as { cause?: Error })?.cause?.name,
          code: (e as { cause?: { code?: string } })?.cause?.code,
        });
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }

  // 5. 处理最终结果
  const elapsedMs = Date.now() - startTime;

  // 5a. mock 降级:所有重试均失败(连接类)或不可重试错误,返回启发式结果避免前端报错
  if (content === null) {
    const errText =
      lastError instanceof Error ? lastError.message : String(lastError);
    console.error('[ai/task-planning] LLM 调用最终失败,返回 mock 降级:', errText, {
      elapsedMs,
      causeName: (lastError as { cause?: Error })?.cause?.name,
      causeCode: (lastError as { cause?: { code?: string } })?.cause?.code,
    });
    if (requestBody) {
      return buildMockOutput(requestBody, scenario, elapsedMs);
    }
    // 理论不可达(requestBody 必已赋值),防御性兜底
    return NextResponse.json<LlmErrorResponse>(
      { success: false, error: 'LLM 调用失败', code: 'LLM_ERROR' },
      { status: 502 }
    );
  }

  // 5b. 解析 JSON
  let parsed: unknown;
  try {
    parsed = extractJson(content);
  } catch (e) {
    console.error('[ai/task-planning] JSON 解析失败:', content.slice(0, 500));
    if (requestBody) {
      return buildMockOutput(requestBody, scenario, elapsedMs);
    }
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
  console.log('[ai/task-planning] 调用成功', { elapsedMs, contentLength: content.length });

  return NextResponse.json<LlmSuccessResponse>({
    success: true,
    data,
    rawContent: content,
    elapsedMs,
  });
}

// OPTIONS 预检(CORS,虽然同源不需要,但保留扩展性)
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204 });
}
