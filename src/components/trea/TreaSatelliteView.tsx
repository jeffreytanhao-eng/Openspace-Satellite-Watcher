'use client';

// ============================================================
// TREA-01 卫星示意图 + 跟踪按钮
// ------------------------------------------------------------
// 使用用户上传的专业卫星等轴测线框图(技术制图风格),
// 黑色背景 + 彩色线条勾勒(青/蓝/紫/金/绿)。
// 左上角跟踪按钮:点击后经 treaMissionStore 切换跟踪状态,
// CesiumGlobe 监听该状态并调用 startTrackingTrea01
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
    <div className="w-full bg-black rounded-xl border border-cyan-500/30 p-3 shadow-[0_0_20px_rgba(34,211,238,0.12)]">
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

      {/* ===== 卫星线框图(用户上传图片) ===== */}
      <div className="relative flex items-center justify-center py-1 bg-black rounded-lg overflow-hidden">
        <img
          src="/trea/trea01-wireframe.jpg"
          alt="TREA-01 对地观测卫星技术线图"
          className="w-full h-auto max-h-52 object-contain"
          style={{
            filter: tracking
              ? 'drop-shadow(0 0 10px rgba(34,211,238,0.5)) brightness(1.1)'
              : 'drop-shadow(0 0 4px rgba(34,211,238,0.2))',
          }}
        />
        {/* 右下角状态标签 */}
        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm border border-cyan-500/30">
          <span className="text-[9px] font-mono text-cyan-400 tracking-wider">EO SATELLITE</span>
        </div>
        {/* 左下角标注 */}
        <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm">
          <span className="text-[8px] font-mono text-slate-500 tracking-wider">ISOMETRIC VIEW</span>
        </div>
        {/* 跟踪中状态指示 */}
        {tracking && (
          <div className="absolute top-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/20 backdrop-blur-sm border border-cyan-400/50">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[9px] font-mono text-cyan-300">TRACKING</span>
          </div>
        )}
      </div>
    </div>
  );
}
