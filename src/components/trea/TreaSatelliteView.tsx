'use client';

// ============================================================
// TREA-01 卫星线框示意图 + 跟踪按钮
// ------------------------------------------------------------
// 位于遥测仪表盘上方,展示卫星构型的线框示意图
// 左上角有跟踪按钮:点击后 Cesium 相机自动跟踪 TREA-01 轨迹
//
// 线框示意:SVG 绘制简化的对地观测卫星构型
//   - 中央本体(六面体展开)
//   - 两侧太阳能帆板
//   - 对地观测相机(底部)
//   - 通信天线(顶部)
// ============================================================

import { useState, useCallback } from 'react';
import { Crosshair, Satellite } from 'lucide-react';
import { useCesium } from '@/hooks/useCesium';

export default function TreaSatelliteView() {
  const { startTrackingTrea01, stopTrackingTrea01, isReady } = useCesium();
  const [tracking, setTracking] = useState(false);

  const handleToggleTrack = useCallback(() => {
    if (!isReady) return;
    if (tracking) {
      stopTrackingTrea01();
      setTracking(false);
    } else {
      startTrackingTrea01();
      setTracking(true);
    }
  }, [tracking, isReady, startTrackingTrea01, stopTrackingTrea01]);

  return (
    <div className="w-full bg-slate-950 rounded-xl border border-cyan-500/30 p-3 shadow-[0_0_20px_rgba(34,211,238,0.12)]">
      {/* ===== 顶部标题栏(含跟踪按钮) ===== */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-700/60">
        <button
          type="button"
          onClick={handleToggleTrack}
          disabled={!isReady}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
            tracking
              ? 'bg-cyan-500/20 border border-cyan-400/60 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.4)]'
              : 'bg-slate-800 border border-slate-600 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
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

      {/* ===== 卫星线框示意图 ===== */}
      <div className="relative flex items-center justify-center py-2">
        <svg
          viewBox="0 0 240 140"
          className="w-full h-auto max-h-32"
          style={{ filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.3))' }}
        >
          {/* ---- 左侧太阳能帆板 ---- */}
          <g stroke="#22d3ee" strokeWidth="1.2" fill="none" opacity="0.8">
            {/* 帆板框架 */}
            <rect x="10" y="50" width="70" height="40" rx="2" />
            {/* 帆板内部网格 */}
            <line x1="27" y1="50" x2="27" y2="90" />
            <line x1="45" y1="50" x2="45" y2="90" />
            <line x1="63" y1="50" x2="63" y2="90" />
            <line x1="10" y1="63" x2="80" y2="63" />
            <line x1="10" y1="77" x2="80" y2="77" />
          </g>
          {/* 连接杆(左) */}
          <line x1="80" y1="70" x2="95" y2="70" stroke="#64748b" strokeWidth="2" />

          {/* ---- 中央卫星本体 ---- */}
          <g stroke="#22d3ee" strokeWidth="1.5" fill="rgba(34,211,238,0.05)">
            <rect x="95" y="48" width="50" height="44" rx="4" />
          </g>
          {/* 本体内部细节 */}
          <g stroke="#22d3ee" strokeWidth="0.8" fill="none" opacity="0.6">
            <line x1="95" y1="62" x2="145" y2="62" />
            <line x1="95" y1="76" x2="145" y2="76" />
            <rect x="108" y="54" width="24" height="6" rx="1" fill="rgba(34,211,238,0.15)" />
          </g>
          {/* 本体标识 */}
          <text x="120" y="86" textAnchor="middle" fontSize="7" fill="#67e8f9" fontFamily="monospace" opacity="0.9">
            TREA-01
          </text>

          {/* 连接杆(右) */}
          <line x1="145" y1="70" x2="160" y2="70" stroke="#64748b" strokeWidth="2" />

          {/* ---- 右侧太阳能帆板 ---- */}
          <g stroke="#22d3ee" strokeWidth="1.2" fill="none" opacity="0.8">
            <rect x="160" y="50" width="70" height="40" rx="2" />
            <line x1="177" y1="50" x2="177" y2="90" />
            <line x1="195" y1="50" x2="195" y2="90" />
            <line x1="213" y1="50" x2="213" y2="90" />
            <line x1="160" y1="63" x2="230" y2="63" />
            <line x1="160" y1="77" x2="230" y2="77" />
          </g>

          {/* ---- 顶部通信天线 ---- */}
          <g stroke="#a855f7" strokeWidth="1.2" fill="none">
            <line x1="120" y1="48" x2="120" y2="28" />
            <circle cx="120" cy="24" r="4" />
            <line x1="116" y1="22" x2="124" y2="22" />
            <line x1="116" y1="26" x2="124" y2="26" />
          </g>
          <text x="134" y="30" fontSize="6" fill="#c084fc" fontFamily="monospace" opacity="0.7">ANT</text>

          {/* ---- 底部对地观测相机 ---- */}
          <g stroke="#34d399" strokeWidth="1.2" fill="rgba(52,211,153,0.08)">
            <rect x="110" y="92" width="20" height="14" rx="2" />
            <circle cx="120" cy="103" r="4" />
          </g>
          {/* 相机视场指示线 */}
          <g stroke="#34d399" strokeWidth="0.6" fill="none" opacity="0.4" strokeDasharray="2,2">
            <line x1="116" y1="106" x2="95" y2="130" />
            <line x1="124" y1="106" x2="145" y2="130" />
          </g>
          <text x="134" y="108" fontSize="6" fill="#6ee7b7" fontFamily="monospace" opacity="0.7">CAM</text>

          {/* ---- 姿态指示(飞行方向箭头) ---- */}
          <g stroke="#fbbf24" strokeWidth="1" fill="none" opacity="0.6">
            <line x1="200" y1="110" x2="225" y2="110" />
            <polyline points="220,106 225,110 220,114" fill="none" />
          </g>
          <text x="200" y="122" fontSize="6" fill="#fbbf24" fontFamily="monospace" opacity="0.6">VEL</text>
        </svg>
      </div>
    </div>
  );
}
