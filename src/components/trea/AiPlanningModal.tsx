'use client';

// TREA-01 AI 任务规划结果展示模态框
// 调用 /api/ai/task-planning 获取 LLM 规划建议,以结构化卡片形式呈现
// 用户可"应用建议":自动选中推荐的 AOI + 高亮推荐窗口
//
// 设计要点:
//   - 不透明深色背景(用户偏好,不使用半透明/玻璃态)
//   - 模态框居中,遮罩点击关闭
//   - 加载态:旋转图标 + "AI 正在分析..."
//   - 错误态:红色提示 + 重试按钮
//   - 成功态:推荐 AOI 卡片 + AOI 评分对比 + 推理/风险/执行计划分节
//   - 置信度进度条 + 耗时显示

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, RefreshCw, AlertTriangle, CheckCircle2, Loader2, Zap, Shield, ListChecks, Brain, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AiTaskPlanningOutput } from '@/lib/trea/ai-prompt';

interface AiPlanningModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** LLM 调用函数(由父组件注入,便于复用) */
  onInvoke: () => Promise<AiTaskPlanningOutput>;
  /** 应用建议:选中推荐的 AOI(父组件实现选中逻辑) */
  onApplyRecommendation: (aoiId: string, windowIndex: number) => void;
}

type Status = 'idle' | 'loading' | 'success' | 'error';

// 加载阶段(分步展示分析进度,减少用户等待焦虑)
// LLM 调用是单次请求无法真正知道后端进度,这里用定时器模拟分阶段推进
const LOADING_STAGES = [
  { icon: Brain, label: '正在初始化分析环境', desc: '连接 LLM 服务,加载分析模型' },
  { icon: Target, label: '准备卫星轨道数据', desc: '解析 TLE,计算轨道根数与过境窗口' },
  { icon: ListChecks, label: '计算窗口与约束条件', desc: '评估光照、覆盖范围与资源约束' },
  { icon: Zap, label: 'LLM 正在深度推理', desc: '综合轨道/光照/资源生成最优方案' },
  { icon: Sparkles, label: '生成规划方案', desc: '结构化输出推荐 AOI 与机动建议' },
  { icon: CheckCircle2, label: '整合分析结果', desc: '校验输出格式,准备展示' },
] as const;

export default function AiPlanningModal({ isOpen, onClose, onInvoke, onApplyRecommendation }: AiPlanningModalProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<AiTaskPlanningOutput | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [applied, setApplied] = useState(false);
  // SSR 安全:确保 document 可用后再渲染 portal(脱离 TaskListPanel 的 stacking context)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // 加载阶段进度:每 3 秒推进一个阶段,给用户"分析正在进行"的感知
  // LLM 实际是单次请求,这里用定时器模拟分阶段(避免一直显示同一个文案)
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (status !== 'loading') {
      setStage(0);
      return;
    }
    const timer = setInterval(() => {
      setStage(prev => Math.min(prev + 1, LOADING_STAGES.length - 1));
    }, 3000);
    return () => clearInterval(timer);
  }, [status]);

  // 模态框打开时自动调用 AI
  useEffect(() => {
    if (!isOpen) return;
    setStatus('loading');
    setResult(null);
    setErrorMsg('');
    setApplied(false);
    let cancelled = false;
    (async () => {
      try {
        const t0 = Date.now();
        const r = await onInvoke();
        if (cancelled) return;
        setResult(r);
        setElapsedMs(Date.now() - t0);
        setStatus('success');
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, onInvoke]);

  if (!isOpen) return null;

  const handleRetry = () => {
    setStatus('loading');
    setErrorMsg('');
    (async () => {
      try {
        const t0 = Date.now();
        const r = await onInvoke();
        setResult(r);
        setElapsedMs(Date.now() - t0);
        setStatus('success');
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();
  };

  const handleApply = () => {
    if (!result) return;
    onApplyRecommendation(result.recommendedAoi, result.recommendedWindowIndex);
    setApplied(true);
    setTimeout(() => onClose(), 800);
  };

  if (!mounted) return null;

  // 使用 createPortal 渲染到 document.body,脱离 TaskListPanel 的 stacking context
  // 否则模态框的 z-50 被限制在左侧面板 z-20 context 内,被右侧面板遮挡
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* 遮罩:不透明深色背景 */}
      <div className="absolute inset-0 bg-black/85" onClick={status === 'loading' ? undefined : onClose} />

      {/* 模态框主体 */}
      <div className="relative bg-space-900 border border-cosmic-blue/40 rounded-xl shadow-2xl w-[640px] max-w-[92vw] max-h-[88vh] flex flex-col">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-space-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cosmic-blue/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-cosmic-blue" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-space-100">AI 辅助任务规划</h3>
              <p className="text-[10px] text-space-500">基于 LLM 的轨道/光照/资源综合分析</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={status === 'loading'}
            className="p-1.5 rounded-lg text-space-400 hover:text-space-100 hover:bg-space-800 transition-colors disabled:opacity-30"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* 加载态:分阶段展示分析进度,减少等待焦虑 */}
          {status === 'loading' && (
            <div className="flex flex-col items-center justify-center py-10 gap-5 px-6">
              {/* 主图标(旋转) */}
              <Loader2 className="h-10 w-10 text-cosmic-blue animate-spin" />

              {/* 当前阶段标题 */}
              <div className="text-center">
                <p className="text-space-100 text-sm font-semibold">{LOADING_STAGES[stage].label}...</p>
                <p className="text-space-500 text-xs mt-1">{LOADING_STAGES[stage].desc}</p>
              </div>

              {/* 总进度条 + 阶段列表 */}
              <div className="w-full max-w-md">
                <div className="h-1.5 bg-space-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cosmic-blue to-cyan-400 rounded-full transition-all duration-1000"
                    style={{ width: `${((stage + 1) / LOADING_STAGES.length) * 100}%` }}
                  />
                </div>

                {/* 阶段步骤列表 */}
                <div className="space-y-1.5 mt-4">
                  {LOADING_STAGES.map((s, idx) => {
                    const Icon = s.icon;
                    return (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        {idx < stage ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                        ) : idx === stage ? (
                          <Loader2 className="h-3.5 w-3.5 text-cosmic-blue animate-spin flex-shrink-0" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border border-space-700 flex-shrink-0" />
                        )}
                        <span className={idx <= stage ? 'text-space-200' : 'text-space-600'}>
                          {s.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 耗时提示 */}
              <p className="text-space-500 text-xs">
                通常需要 15-30 秒,已耗时 {(elapsedMs / 1000).toFixed(1)} 秒
              </p>
            </div>
          )}

          {/* 错误态 */}
          {status === 'error' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <AlertTriangle className="h-10 w-10 text-red-400" />
              <p className="text-red-300 text-sm font-medium">AI 规划失败</p>
              <p className="text-space-500 text-xs text-center max-w-md break-all">{errorMsg}</p>
              <Button
                size="sm"
                onClick={handleRetry}
                className="mt-2 bg-cosmic-blue hover:bg-cosmic-blue/80 text-white"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                重新分析
              </Button>
            </div>
          )}

          {/* 成功态 */}
          {status === 'success' && result && (
            <div className="space-y-4">
              {/* 推荐 AOI 横幅 */}
              <div className="rounded-lg border border-cosmic-blue/50 bg-cosmic-blue/10 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-6 w-6 text-cosmic-blue" />
                    <div>
                      <div className="text-[10px] text-space-500 uppercase tracking-wider">推荐目标</div>
                      <div className="text-base font-bold text-space-100">
                        {result.recommendedAoi.toUpperCase()}
                        <span className="ml-2 text-sm font-normal text-cosmic-blue">
                          窗口 #{result.recommendedWindowIndex}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-space-500 uppercase tracking-wider">置信度</div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-space-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cosmic-blue to-emerald-400"
                          style={{ width: `${result.confidence}%` }}
                        />
                      </div>
                      <span className="text-sm font-mono text-space-200">{result.confidence}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* AOI 评分对比 */}
              {result.aoiAnalysis.length > 0 && (
                <section>
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold text-space-200 mb-2">
                    <Target className="h-3.5 w-3.5 text-cosmic-blue" />
                    AOI 评分对比
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {result.aoiAnalysis.map(a => (
                      <div
                        key={a.aoiId}
                        className={`rounded-lg border px-3 py-2 ${
                          a.aoiId === result.recommendedAoi
                            ? 'border-cosmic-blue/60 bg-cosmic-blue/10'
                            : 'border-space-800 bg-space-950'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-space-100">{a.aoiId.toUpperCase()}</span>
                          <span className={`text-sm font-mono font-bold ${
                            a.score >= 70 ? 'text-emerald-400' : a.score >= 50 ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            {a.score}
                          </span>
                        </div>
                        {a.pros && (
                          <div className="text-[10px] text-emerald-300/90 mb-0.5">
                            <span className="font-semibold">优势:</span>{a.pros}
                          </div>
                        )}
                        {a.cons && (
                          <div className="text-[10px] text-orange-300/90">
                            <span className="font-semibold">劣势:</span>{a.cons}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 推理过程 */}
              <section>
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-space-200 mb-2">
                  <Brain className="h-3.5 w-3.5 text-cosmic-blue" />
                  推理过程
                </h4>
                <p className="text-xs text-space-300 leading-relaxed bg-space-950 rounded-lg border border-space-800 px-3 py-2">
                  {result.reasoning}
                </p>
              </section>

              {/* 机动建议 */}
              <section>
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-space-200 mb-2">
                  <Zap className="h-3.5 w-3.5 text-cosmic-orange" />
                  机动建议
                </h4>
                <p className="text-xs text-space-300 leading-relaxed bg-space-950 rounded-lg border border-space-800 px-3 py-2">
                  {result.maneuverAdvice}
                </p>
              </section>

              {/* 风险评估 */}
              <section>
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-space-200 mb-2">
                  <Shield className="h-3.5 w-3.5 text-yellow-400" />
                  风险评估
                </h4>
                <p className="text-xs text-space-300 leading-relaxed bg-space-950 rounded-lg border border-space-800 px-3 py-2">
                  {result.riskAssessment}
                </p>
              </section>

              {/* 执行计划 */}
              <section>
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-space-200 mb-2">
                  <ListChecks className="h-3.5 w-3.5 text-emerald-400" />
                  执行步骤
                </h4>
                <pre className="text-xs text-space-300 leading-relaxed bg-space-950 rounded-lg border border-space-800 px-3 py-2 whitespace-pre-wrap font-sans">
                  {result.executionPlan}
                </pre>
              </section>

              {/* 耗时 */}
              <div className="text-[10px] text-space-500 text-right">
                AI 分析耗时 {(elapsedMs / 1000).toFixed(1)} 秒
              </div>
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        {status === 'success' && result && (
          <div className="border-t border-space-800 px-5 py-3 flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              className="bg-space-800 border-space-700 text-space-300 hover:bg-space-700"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              重新分析
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              disabled={applied}
              className="bg-cosmic-blue hover:bg-cosmic-blue/80 text-white"
            >
              {applied ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  已应用
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  应用建议(选中 {result.recommendedAoi.toUpperCase()})
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
