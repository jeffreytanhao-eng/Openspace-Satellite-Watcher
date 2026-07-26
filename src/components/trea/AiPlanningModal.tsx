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

export default function AiPlanningModal({ isOpen, onClose, onInvoke, onApplyRecommendation }: AiPlanningModalProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<AiTaskPlanningOutput | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [applied, setApplied] = useState(false);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
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
          {/* 加载态 */}
          {status === 'loading' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="h-10 w-10 text-cosmic-blue animate-spin" />
              <p className="text-space-300 text-sm">AI 正在深度分析过境窗口与轨道参数...</p>
              <p className="text-space-500 text-xs">通常需要 15-30 秒,请稍候</p>
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
    </div>
  );
}
