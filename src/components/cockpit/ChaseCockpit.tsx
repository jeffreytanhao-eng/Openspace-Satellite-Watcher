'use client';

// ============================================================
// TREA-01 赛车视角驾驶舱 — /cockpit 路由容器
// ------------------------------------------------------------
// 顶部:独立 Cesium Viewer(useChaseViewer)——TREA-01 居前景,
//       地球局部在下方流动,星空在前上方,近处合成交通卫星掠过。
// 底部:HUD 数据面板 —— 复用 TelemetryDashboard(8 卡遥测,只读)
//       + 驾驶舱线框图(静态 TRACKING,不触发 store 跟踪开关)
//       + 仿真时间控制(播放/倍速,由用户操作,不自动改 store)。
//
// 完全独立:不修改任何现有文件;复用 treaMissionStore/timeStore(只读为主)。
// ============================================================

import { memo, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Satellite,
  Play,
  Pause,
} from 'lucide-react';
import { useChaseViewer } from '@/hooks/useChaseViewer';
import FullscreenButton from '@/components/FullscreenButton';
import TelemetryDashboard from '@/components/trea/TelemetryDashboard';
import {
  useTimeStore,
  useCurrentTime,
  useIsPlaying,
  usePlaybackRate,
  usePlaybackRates,
} from '@/store/timeStore';

// ============================================================
// 仿真时间控制(独立订阅,避免父级每帧重渲染)
// ============================================================
const TimeControl = memo(function TimeControl() {
  const currentTime = useCurrentTime();
  const isPlaying = useIsPlaying();
  const rate = usePlaybackRate();
  const rates = usePlaybackRates();
  const togglePlay = useTimeStore((s) => s.togglePlay);
  const setRate = useTimeStore((s) => s.setRate);

  return (
    <div className={`${TIME_CONTROL_POS} flex items-center gap-2.5 px-3 py-2 bg-space-900/95 backdrop-blur-sm border border-space-800 rounded-lg shadow-lg`}>
      {/* 播放/暂停按钮(与态势感知 TimeControlBar 一致的圆形样式) */}
      <button
        type="button"
        onClick={togglePlay}
        className={`flex items-center justify-center w-10 h-10 rounded-full transition-all ${
          isPlaying
            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 shadow-lg shadow-red-500/20'
            : 'bg-cosmic-blue/20 text-cosmic-blue hover:bg-cosmic-blue/30 shadow-lg shadow-cosmic-blue/20'
        }`}
        title={isPlaying ? '暂停' : '播放'}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>
      {/* 当前时间显示(与态势感知一致的深色圆角框) */}
      <span className="font-mono text-xs text-cosmic-blue bg-space-800/50 px-2.5 py-1.5 rounded-md border border-space-700 whitespace-nowrap">
        {currentTime.toISOString().slice(0, 19)}Z
      </span>
      {/* 变速选择(与态势感知一致的下拉样式) */}
      <select
        value={rate}
        onChange={(e) => setRate(Number(e.target.value))}
        className="bg-space-800 text-space-200 text-xs px-2 py-1.5 rounded-md border border-space-700 focus:border-cosmic-blue focus:outline-none cursor-pointer hover:border-space-600"
        title="仿真倍速"
      >
        {rates.map((r) => (
          <option key={r} value={r}>
            {r === 0 ? '暂停' : `${r}x`}
          </option>
        ))}
      </select>
    </div>
  );
});

// ============================================================
// 时间控制条(播放框) — 定位常量
// ------------------------------------------------------------
// 用户反馈:顶部居中的"播放框"会遮挡 TREA-01 模型。
// 将播放/变速窗口移动到右下角,视觉样式与态势感知大屏的
// TimeControlBar(space/cosmic-blue 主题)保持一致。
// 底部居中仍保留方向控制按,右下角播放框互不重叠。
const TIME_CONTROL_POS = 'absolute bottom-4 right-4';

// ============================================================
// 驾驶舱线框图(静态,不触发 trea01Tracking store 开关)
// 与 TreaSatelliteView 视觉一致,但移除跟踪按钮避免返回主页时副作用
// ============================================================
function CockpitWireframe() {
  return (
    <div className="w-[300px] shrink-0 bg-black rounded-xl border border-cyan-500/30 p-3 flex flex-col shadow-[0_0_20px_rgba(34,211,238,0.12)]">
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-700/60">
        <span className="flex items-center gap-1.5">
          <Satellite className="h-4 w-4 text-cyan-400" />
          <span className="text-xs font-semibold text-slate-200 tracking-wide">TREA-01</span>
        </span>
        <span className="flex items-center gap-1 px-2 py-0.5 bg-cyan-500/20 border border-cyan-400/50 rounded">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[9px] font-mono text-cyan-300">TRACKING</span>
        </span>
      </div>
      <div className="relative flex items-center justify-center bg-black rounded-lg overflow-hidden flex-1">
        <img
          src="/trea/trea01-wireframe.jpg"
          alt="TREA-01 对地观测卫星技术线图"
          className="w-full h-auto max-h-[260px] object-contain"
          style={{
            filter:
              'drop-shadow(0 0 10px rgba(34,211,238,0.5)) brightness(1.1)',
          }}
        />
        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-slate-900 border border-cyan-500/30">
          <span className="text-[9px] font-mono text-cyan-400 tracking-wider">CHASE CAM</span>
        </div>
        <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-slate-900">
          <span className="text-[8px] font-mono text-slate-500 tracking-wider">ISOMETRIC</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================
export default function ChaseCockpit() {
  const { containerRef, ready, loadError, setDirection } = useChaseViewer();
  // 全页面跳转进入 /cockpit 会重置 zustand 内存态,此处主动启动仿真播放,保证进入即播放
  useEffect(() => {
    useTimeStore.getState().setRate(10);
    useTimeStore.getState().startPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 使用 window.location.href 全页面导航,避免 Cesium viewer 销毁与 Next.js RSC 请求竞态(ERR_ABORTED)
  const goBack = () => {
    window.location.href = '/?mission=1';
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-black overflow-hidden">
      {/* ===== 顶部:Cesium 大屏(赛车视角) ===== */}
      <div className="flex-1 relative bg-black min-h-0">
        <div ref={containerRef} className="absolute inset-0" />

        {/* 左下:标题 + 返回(返回 TREA-01 任务中心) */}
        <button
          type="button"
          onClick={goBack}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute bottom-4 left-3 flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-cyan-500/40 rounded-lg shadow-[0_0_15px_rgba(34,211,238,0.2)] hover:border-cyan-400/80 transition-colors z-30"
        >
          <ArrowLeft className="h-4 w-4 text-cyan-300" />
          <span className="text-xs font-medium text-slate-200">返回任务中心</span>
        </button>

        {/* 顶部居中:时间控制 */}
        <TimeControl />

        {/* 右上:视角标识 + 全屏按钮 */}
        <div className="absolute top-3 right-3 flex flex-col items-end gap-1 z-10">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 border border-purple-500/50 rounded-md shadow-[0_0_12px_rgba(168,85,247,0.25)]">
            <Satellite className="h-3.5 w-3.5 text-purple-300" />
            <span className="text-[10px] font-mono text-purple-300 tracking-wider">CHASE COCKPIT</span>
          </div>
          <div className="px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-[9px] font-mono text-slate-400">
            滚轮缩放 · ←→方向 · 后上方追踪
          </div>
          <FullscreenButton />
        </div>

        {/* 底部居中:飞行方向控制(左右箭头) */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 z-30 pointer-events-auto">
          <button
            type="button"
            onPointerDown={(e) => { e.stopPropagation(); setDirection('left'); }}
            onPointerUp={(e) => { e.stopPropagation(); setDirection('center'); }}
            onPointerLeave={() => setDirection('center')}
            onPointerCancel={() => setDirection('center')}
            className="flex items-center justify-center w-12 h-12 bg-slate-950/90 border border-cyan-500/50 rounded-xl text-cyan-300 hover:bg-cyan-500/15 hover:border-cyan-400 active:scale-95 transition-all shadow-lg shadow-cyan-500/20"
            title="向左(←)"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <span className="text-[10px] font-mono text-slate-500 select-none">方向</span>
          <button
            type="button"
            onPointerDown={(e) => { e.stopPropagation(); setDirection('right'); }}
            onPointerUp={(e) => { e.stopPropagation(); setDirection('center'); }}
            onPointerLeave={() => setDirection('center')}
            onPointerCancel={() => setDirection('center')}
            className="flex items-center justify-center w-12 h-12 bg-slate-950/90 border border-cyan-500/50 rounded-xl text-cyan-300 hover:bg-cyan-500/15 hover:border-cyan-400 active:scale-95 transition-all shadow-lg shadow-cyan-500/20"
            title="向右(→)"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>

        {/* 加载 / 错误提示 */}
        {!ready && !loadError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-3">
            <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-cyan-300 font-mono">初始化卫星视角…</span>
          </div>
        )}
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black p-6">
            <div className="max-w-md bg-slate-900 border border-red-500/50 rounded-lg p-4 text-center">
              <p className="text-sm text-red-300 mb-2">视角初始化失败</p>
              <p className="text-xs text-slate-400 font-mono break-all">{loadError}</p>
              <Link href="/?mission=1" className="inline-block mt-3 px-3 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-slate-200 hover:border-cyan-500/50">
                返回任务中心
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* ===== 底部:HUD 数据面板(顶部6卡 + 底部3卡,紧凑无滚动) ===== */}
      <div className="h-[24vh] min-h-[200px] flex gap-3 p-3 bg-slate-950 border-t border-cyan-500/30 overflow-hidden">
        <CockpitWireframe />
        <div className="flex-1 min-w-0">
          <TelemetryDashboard columns={3} />
        </div>
      </div>
    </div>
  );
}
