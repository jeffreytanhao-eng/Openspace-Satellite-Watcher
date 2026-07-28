'use client';

// 电影回放模式 UI 覆层(进度条 + 控制按钮)
// 去掉字幕区(用户要求不需要旁白文字)
// 用 React Portal 渲染到 document.body

import { createPortal } from 'react-dom';
import { Pause, Play, X } from 'lucide-react';
import { useCinematicStore } from '@/store/cinematicStore';
import { CINEMATIC_SHOTS } from '@/lib/trea/cinematicShots';

export default function CinematicOverlay() {
  const isActive = useCinematicStore(s => s.isActive);
  const currentShotIndex = useCinematicStore(s => s.currentShotIndex);
  const isPaused = useCinematicStore(s => s.isPaused);
  const shotElapsedSec = useCinematicStore(s => s.shotElapsedSec);
  const pauseCinematic = useCinematicStore(s => s.pauseCinematic);
  const resumeCinematic = useCinematicStore(s => s.resumeCinematic);
  const exitCinematic = useCinematicStore(s => s.exitCinematic);

  if (!isActive || typeof document === 'undefined') return null;

  const shot = CINEMATIC_SHOTS[currentShotIndex];
  if (!shot) return null;

  const shotProgress = Math.min(100, (shotElapsedSec / shot.transition.maxDurationSec) * 100);
  const totalProgress = Math.min(
    100,
    ((currentShotIndex + shotElapsedSec / shot.transition.maxDurationSec) / CINEMATIC_SHOTS.length) * 100
  );

  return createPortal(
    <div className="fixed inset-0 z-[200] pointer-events-none select-none">
      {/* 控制区(右上角) */}
      <div className="absolute top-4 right-4 flex items-center gap-2 pointer-events-auto">
        <button
          onClick={() => (isPaused ? resumeCinematic() : pauseCinematic())}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-950 border border-white/20 text-white hover:bg-slate-800 transition-colors"
          title={isPaused ? '继续' : '暂停'}
        >
          {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
        </button>
        <button
          onClick={exitCinematic}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-red-700 border border-red-400/40 text-white hover:bg-red-600 transition-colors"
          title="退出电影模式"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 进度条(底部居中) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-80 max-w-[80vw]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-white/60 text-xs">
            {currentShotIndex + 1} / {CINEMATIC_SHOTS.length}
          </span>
          <span className="text-white text-xs font-medium">{shot.name}</span>
        </div>
        {/* 当前镜头进度 */}
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-cyan-400 transition-all duration-100"
            style={{ width: `${shotProgress}%` }}
          />
        </div>
        {/* 总进度 */}
        <div className="h-0.5 bg-slate-800 rounded-full overflow-hidden mt-1">
          <div
            className="h-full bg-cyan-400/40 transition-all duration-100"
            style={{ width: `${totalProgress}%` }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
