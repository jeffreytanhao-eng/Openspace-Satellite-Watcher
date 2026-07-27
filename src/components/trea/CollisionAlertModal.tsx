'use client';

// ============================================================
// 碰撞警报模态框(突发任务:碎片接近风险)
// ------------------------------------------------------------
// 当 treaMissionStore.collisionAlert 非 null 时,屏幕正中弹出红色警报
// 视图状态机:
//   'alert'  → 显示警报详情 + "立即制定躲避计划" 按钮
//   'plans'  → 显示 3 个躲避计划卡片供用户选择
//   'executing' → 显示执行中动画(1.5s)
//   'success' → 显示成功提示 + 关闭按钮
// 选择计划后调用 executeCollisionAvoidance → store 设置 lastAvoidanceExecution
// → HomePage 监听并设置 maneuverEvent → CesiumGlobe 渲染变轨演示
// ============================================================

import { useState, useEffect } from 'react';
import { AlertTriangle, X, Satellite, Zap, Gauge, Clock, Rocket, CheckCircle2, ChevronRight, Fuel, TrendingDown, Target } from 'lucide-react';
import { useCollisionAlert, useTreaMissionStore, useAvoidancePlans } from '@/store/treaMissionStore';

type View = 'alert' | 'plans' | 'executing' | 'success';

export default function CollisionAlertModal() {
  const alert = useCollisionAlert();
  const plans = useAvoidancePlans();
  const dismissCollisionAlert = useTreaMissionStore(s => s.dismissCollisionAlert);
  const generateAvoidancePlans = useTreaMissionStore(s => s.generateAvoidancePlans);
  const executeCollisionAvoidance = useTreaMissionStore(s => s.executeCollisionAvoidance);

  const [view, setView] = useState<View>('alert');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  // 警报出现时重置视图为 'alert'(每次新警报都从详情开始)
  useEffect(() => {
    if (alert) {
      setView('alert');
      setSelectedPlanId(null);
    }
  }, [alert]);

  // 警报关闭后重置状态
  useEffect(() => {
    if (!alert) {
      setView('alert');
      setSelectedPlanId(null);
    }
  }, [alert]);

  if (!alert) return null;

  const tcaStr = alert.tca.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const minsToTca = Math.max(0, Math.round((alert.tca.getTime() - Date.now()) / 60_000));

  // 威胁等级判定(用于颜色和文案)
  const isCritical = alert.collisionProbability >= 1 || alert.missDistance < 0.5;
  const threatLabel = isCritical ? '紧急' : '高';
  const threatColor = isCritical ? 'red' : 'orange';

  // 点击"立即制定躲避计划":生成计划列表 + 切换到 plans 视图
  const handleMakePlan = () => {
    generateAvoidancePlans();
    setView('plans');
  };

  // 选择躲避计划:执行机动 + 切换到 executing → success
  const handleSelectPlan = (planId: string) => {
    setSelectedPlanId(planId);
    setView('executing');
    // 模拟执行 1.5s 后切换到成功视图
    setTimeout(() => {
      executeCollisionAvoidance(planId);
      setView('success');
    }, 1500);
  };

  // 关闭成功视图(已执行完毕)
  const handleCloseSuccess = () => {
    dismissCollisionAlert();
  };

  // ============================================================
  // 视图:执行中
  // ============================================================
  if (view === 'executing') {
    const plan = plans.find(p => p.id === selectedPlanId);
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-auto">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
        <div className="relative w-[440px] max-w-[90vw] rounded-2xl border-2 border-cyan-500 bg-slate-950 shadow-2xl overflow-hidden">
          <div className="px-5 py-12 flex flex-col items-center gap-4">
            <div className="relative">
              <Rocket className="h-12 w-12 text-cyan-400 animate-pulse" />
              <div className="absolute inset-0 rounded-full bg-cyan-500/20 animate-ping" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-cyan-300">正在执行避撞机动...</p>
              <p className="text-xs text-slate-500 mt-1">{plan?.name}</p>
              <p className="text-[10px] text-slate-600 mt-2 font-mono">Δv = {plan?.deltaV.toFixed(2)} m/s · 燃料消耗 {plan?.fuelCost.toFixed(1)}%</p>
            </div>
            {/* 执行进度条 */}
            <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500"
                style={{ animation: 'avoidance-exec 1.5s ease-out forwards' }}
              />
            </div>
          </div>
          <style>{`
            @keyframes avoidance-exec {
              0% { width: 0%; }
              100% { width: 100%; }
            }
          `}</style>
        </div>
      </div>
    );
  }

  // ============================================================
  // 视图:执行成功
  // ============================================================
  if (view === 'success') {
    const plan = plans.find(p => p.id === selectedPlanId);
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-auto">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        <div className="relative w-[440px] max-w-[90vw] rounded-2xl border-2 border-emerald-500 bg-slate-950 shadow-2xl overflow-hidden">
          {/* 顶部条 */}
          <div className="flex items-center gap-2 px-5 py-3 bg-emerald-500/15 border-b border-emerald-500/30">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <span className="text-sm font-bold text-emerald-300">避撞机动执行成功</span>
          </div>

          {/* 主体 */}
          <div className="px-5 py-4 space-y-3">
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-700">
              <div className="text-xs text-slate-500 mb-1">执行计划</div>
              <div className="text-sm font-semibold text-slate-100">{plan?.name}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{plan?.maneuverType}</div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-700/60">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-1">
                  <TrendingDown className="h-3 w-3" />
                  <span>预测最近距离</span>
                </div>
                <div className="text-sm font-mono font-semibold text-emerald-300">
                  {plan?.missDistanceAfter.toFixed(1)} km
                </div>
                <div className="text-[10px] text-slate-600 mt-0.5">↑ from {alert.missDistance.toFixed(2)} km</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-700/60">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-1">
                  <Target className="h-3 w-3" />
                  <span>残余碰撞概率</span>
                </div>
                <div className="text-sm font-mono font-semibold text-emerald-300">
                  {plan?.probabilityAfter.toFixed(4)}%
                </div>
                <div className="text-[10px] text-slate-600 mt-0.5">↓ from {alert.collisionProbability.toFixed(2)}%</div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <p className="text-xs text-emerald-200">
                ✓ 轨道已调整,预测最近距离提升至 {plan?.missDistanceAfter.toFixed(1)} km,碰撞风险已规避。大屏正在演示新旧轨道对比与燃烧弧。
              </p>
            </div>
          </div>

          {/* 底部按钮 */}
          <div className="px-5 py-3 bg-slate-900/80 border-t border-slate-700">
            <button
              type="button"
              onClick={handleCloseSuccess}
              className="w-full px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 text-white text-sm font-semibold transition-colors shadow-lg"
            >
              查看大屏演示
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // 视图:躲避计划选择
  // ============================================================
  if (view === 'plans') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-auto">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        <div className="relative w-[520px] max-w-[90vw] max-h-[85vh] rounded-2xl border-2 border-cyan-500 bg-slate-950 shadow-2xl overflow-hidden flex flex-col">
          {/* 顶部条 */}
          <div className="flex items-center justify-between px-5 py-3 bg-cyan-500/10 border-b border-cyan-500/30 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-cyan-400" />
              <span className="text-sm font-bold text-cyan-300">选择躲避计划</span>
            </div>
            <button
              type="button"
              onClick={dismissCollisionAlert}
              className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* 警报摘要(精简) */}
          <div className="px-5 py-3 border-b border-slate-700/50 flex-shrink-0">
            <div className="flex items-center gap-3 text-xs">
              <span className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-300 font-mono">{alert.debrisName}</span>
              <span className="text-slate-400">TCA {tcaStr} (T-{minsToTca}min)</span>
              <span className="text-red-300">距离 {alert.missDistance.toFixed(2)} km</span>
              <span className="text-red-300">概率 {alert.collisionProbability.toFixed(2)}%</span>
            </div>
          </div>

          {/* 计划列表 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => handleSelectPlan(plan.id)}
                className="w-full text-left p-4 rounded-xl bg-slate-900/80 border border-slate-700 hover:border-cyan-500/60 hover:bg-slate-800/80 transition-all group"
              >
                {/* 计划标题行 */}
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-sm font-bold text-slate-100 group-hover:text-cyan-300 transition-colors">{plan.name}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 font-mono">{plan.maneuverType}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
                </div>

                {/* 描述 */}
                <p className="text-[11px] text-slate-400 leading-relaxed mb-3">{plan.description}</p>

                {/* 关键参数网格 */}
                <div className="grid grid-cols-4 gap-2 text-[10px]">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-slate-600">Δv</span>
                    <span className="text-cyan-300 font-mono font-semibold">{plan.deltaV.toFixed(2)} m/s</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-slate-600 flex items-center gap-0.5"><Fuel className="h-2.5 w-2.5" />燃料</span>
                    <span className="text-orange-300 font-mono font-semibold">{plan.fuelCost.toFixed(1)}%</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-slate-600 flex items-center gap-0.5"><Gauge className="h-2.5 w-2.5" />机动后距离</span>
                    <span className="text-emerald-300 font-mono font-semibold">{plan.missDistanceAfter.toFixed(1)} km</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-slate-600 flex items-center gap-0.5"><Target className="h-2.5 w-2.5" />残余概率</span>
                    <span className="text-emerald-300 font-mono font-semibold">{plan.probabilityAfter.toFixed(4)}%</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* 底部提示 */}
          <div className="px-5 py-3 bg-slate-900/80 border-t border-slate-700 flex-shrink-0">
            <p className="text-[10px] text-slate-500 text-center">
              选择计划后将执行避撞机动,大屏将演示新旧轨道对比与燃烧弧
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // 视图:警报详情(默认)
  // ============================================================
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-auto">
      {/* 半透明遮罩 */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* 警报卡片:红色脉动边框 */}
      <div
        className={`relative w-[440px] max-w-[90vw] rounded-2xl border-2 ${
          threatColor === 'red' ? 'border-red-500' : 'border-orange-500'
        } bg-slate-950 shadow-2xl overflow-hidden`}
        style={{
          animation: 'collision-pulse 1.5s ease-in-out infinite',
          boxShadow: `0 0 40px ${
            threatColor === 'red' ? 'rgba(239,68,68,0.4)' : 'rgba(249,115,22,0.4)'
          }`,
        }}
      >
        {/* 内联 keyframes(collision-pulse 脉动效果) */}
        <style>{`
          @keyframes collision-pulse {
            0%, 100% { box-shadow: 0 0 30px ${
              threatColor === 'red' ? 'rgba(239,68,68,0.3)' : 'rgba(249,115,22,0.3)'
            }; }
            50% { box-shadow: 0 0 50px ${
              threatColor === 'red' ? 'rgba(239,68,68,0.6)' : 'rgba(249,115,22,0.6)'
            }; }
          }
        `}</style>

        {/* 顶部条:威胁等级 + 关闭按钮 */}
        <div
          className={`flex items-center justify-between px-5 py-3 ${
            threatColor === 'red' ? 'bg-red-500/15' : 'bg-orange-500/15'
          } border-b ${
            threatColor === 'red' ? 'border-red-500/30' : 'border-orange-500/30'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle
              className={`h-5 w-5 ${threatColor === 'red' ? 'text-red-400' : 'text-orange-400'} animate-pulse`}
            />
            <span className={`text-sm font-bold ${threatColor === 'red' ? 'text-red-300' : 'text-orange-300'}`}>
              碰撞预警 · {threatLabel}级威胁
            </span>
          </div>
          <button
            type="button"
            onClick={dismissCollisionAlert}
            className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            title="关闭警报"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 主体:碎片信息 */}
        <div className="px-5 py-4 space-y-4">
          {/* 警报摘要 */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/80 border border-slate-700">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
              <Satellite className="h-5 w-5 text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-slate-500">接近碎片</div>
              <div className="text-sm font-semibold text-slate-100 truncate">{alert.debrisName}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-xs text-slate-500">NORAD ID</div>
              <div className="text-sm font-mono text-cyan-400">{alert.debrisNoradId}</div>
            </div>
          </div>

          {/* 关键数据网格 */}
          <div className="grid grid-cols-2 gap-2">
            {/* TCA */}
            <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-700/60">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-1">
                <Clock className="h-3 w-3" />
                <span>最近接近时刻 TCA</span>
              </div>
              <div className="text-sm font-mono text-slate-100">{tcaStr}</div>
              <div className="text-[10px] text-orange-400 mt-0.5">T-{minsToTca} 分钟</div>
            </div>

            {/* 碰撞概率 */}
            <div className={`p-3 rounded-lg border ${
              threatColor === 'red' ? 'bg-red-500/10 border-red-500/40' : 'bg-orange-500/10 border-orange-500/40'
            }`}>
              <div className={`flex items-center gap-1.5 text-[10px] mb-1 ${
                threatColor === 'red' ? 'text-red-400' : 'text-orange-400'
              }`}>
                <AlertTriangle className="h-3 w-3" />
                <span>碰撞概率</span>
              </div>
              <div className={`text-lg font-bold font-mono ${
                threatColor === 'red' ? 'text-red-300' : 'text-orange-300'
              }`}>
                {alert.collisionProbability.toFixed(2)}%
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">阈值 1e-4(0.01%)</div>
            </div>

            {/* 最近距离 */}
            <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-700/60">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-1">
                <Gauge className="h-3 w-3" />
                <span>最近距离</span>
              </div>
              <div className={`text-sm font-mono font-semibold ${
                alert.missDistance < 0.5 ? 'text-red-300' : 'text-orange-300'
              }`}>
                {alert.missDistance.toFixed(3)} km
              </div>
            </div>

            {/* 相对速度 */}
            <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-700/60">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-1">
                <Zap className="h-3 w-3" />
                <span>相对速度</span>
              </div>
              <div className="text-sm font-mono font-semibold text-slate-100">
                {alert.relativeVelocity.toFixed(2)} km/s
              </div>
            </div>
          </div>

          {/* 操作建议 */}
          <div className={`p-3 rounded-lg ${
            threatColor === 'red' ? 'bg-red-500/10 border border-red-500/30' : 'bg-orange-500/10 border border-orange-500/30'
          }`}>
            <p className={`text-xs ${threatColor === 'red' ? 'text-red-200' : 'text-orange-200'}`}>
              {isCritical
                ? '⚠ 碰撞概率超过 1% 或距离 < 500m,建议立即制定避撞机动方案。'
                : '⚠ 碰撞概率超过机动阈值,建议尽快制定避撞机动方案。'}
            </p>
          </div>
        </div>

        {/* 底部操作按钮 */}
        <div className="flex gap-2 px-5 py-3 bg-slate-900/80 border-t border-slate-700">
          <button
            type="button"
            onClick={dismissCollisionAlert}
            className="flex-1 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 text-sm transition-colors"
          >
            稍后处理
          </button>
          <button
            type="button"
            onClick={handleMakePlan}
            className={`flex-1 px-4 py-2 rounded-lg ${
              threatColor === 'red'
                ? 'bg-red-600 hover:bg-red-500 border border-red-400'
                : 'bg-orange-600 hover:bg-orange-500 border border-orange-400'
            } text-white text-sm font-semibold transition-colors shadow-lg`}
          >
            立即制定躲避计划
          </button>
        </div>
      </div>
    </div>
  );
}
