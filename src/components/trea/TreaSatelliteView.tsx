'use client';

// ============================================================
// TREA-01 卫星示意图 + 跟踪按钮
// ------------------------------------------------------------
// 位于遥测仪表盘上方,展示卫星的专业渲染图
// 左上角有跟踪按钮:点击后经 treaMissionStore 切换跟踪状态,
// CesiumGlobe 监听该状态并调用 startTrackingTrea01(持有 Cesium 实例)
//
// 注意:之前直接调用 useCesium() 导致 isReady 永远 false(独立 hook 实例),
// 按钮被 disabled 无法点击。现改为通过 store 共享跟踪状态修复此 bug。
// ============================================================

import { useCallback } from 'react';
import { Crosshair, Satellite } from 'lucide-react';
import { useTreaMissionStore, useTrea01Tracking } from '@/store/treaMissionStore';

export default function TreaSatelliteView() {
  const tracking = useTrea01Tracking();
  const setTrea01Tracking = useTreaMissionStore(s => s.setTrea01Tracking);

  const handleToggleTrack = useCallback(() => {
    setTrea01Tracking(!tracking);
  }, [tracking, setTrea01Tracking]);

  return (
    <div className="w-full bg-slate-950 rounded-xl border border-cyan-500/30 p-3 shadow-[0_0_20px_rgba(34,211,238,0.12)]">
      {/* ===== 顶部标题栏(含跟踪按钮) ===== */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-700/60">
        <button
          type="button"
          onClick={handleToggleTrack}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
            tracking
              ? 'bg-cyan-500/20 border border-cyan-400/60 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.4)]'
              : 'bg-slate-800 border border-slate-600 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300'
          }`}
          title={tracking ? '取消跟踪' : '自动跟踪 TREA-01'}
        >
          <Crosshair className={`h-3.5 w-3.5 ${tracking ? 'animate-pulse' : ''}`} />
          {tracking ? '跟踪中' : '跟踪'}
        </button>
        <div className="flex items-center gap-1.5">
          <Satellite className="h-4 w-4 text-cyan-400" />
          <span className="text-xs font-semibold text-slate-200 tracking-wide">
            TREA-01
          </span>
        </div>
      </div>

      {/* ===== 卫星专业渲染图 ===== */}
      <div className="relative flex items-center justify-center py-1">
        <img
          src="/trea/trea01-satellite.jpg?v=2"
          alt="TREA-01 对地观测卫星"
          className="w-full h-auto max-h-44 object-contain rounded-lg"
          style={{ filter: 'drop-shadow(0 0 8px rgba(34,211,238,0.35))' }}
        />
        {/* 右下角状态标签 */}
        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm border border-cyan-500/30">
          <span className="text-[9px] font-mono text-cyan-400 tracking-wider">EO SATELLITE</span>
        </div>
        {/* 跟踪中状态指示 */}
        {tracking && (
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/20 backdrop-blur-sm border border-cyan-400/50">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[9px] font-mono text-cyan-300">TRACKING</span>
          </div>
        )}
      </div>
    </div>
  );
}
