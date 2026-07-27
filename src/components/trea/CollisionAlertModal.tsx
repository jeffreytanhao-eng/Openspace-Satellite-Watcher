'use client';

// ============================================================
// 碰撞警报模态框(突发任务:碎片接近风险)
// ------------------------------------------------------------
// 当 treaMissionStore.collisionAlert 非 null 时,屏幕正中弹出红色警报
// 展示碎片名称、NORAD ID、TCA、最近距离、相对速度、碰撞概率
// 用户确认后关闭模态框,紧急避撞任务已在 store 中,TaskListPanel 自动显示
// ============================================================

import { AlertTriangle, X, Satellite, Zap, Gauge, Clock } from 'lucide-react';
import { useCollisionAlert, useTreaMissionStore } from '@/store/treaMissionStore';

export default function CollisionAlertModal() {
  const alert = useCollisionAlert();
  const dismissCollisionAlert = useTreaMissionStore(s => s.dismissCollisionAlert);

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
            onClick={dismissCollisionAlert}
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
