'use client';

// 电影回放模式 UI 覆盖层 v4(4 阶段简化版)
// ------------------------------------------------------------
// 阶段1-2:底部显示阶段文字(subtitle)+ 右上角暂停/退出按钮
// 阶段3:全屏 ScanVideoModal(视频占位符,5秒自动关闭)
// 阶段4:全屏 MissionReportModal(任务报告,用户关闭后退出)
// 无进度条

import { createPortal } from 'react-dom';
import { Pause, Play, X } from 'lucide-react';
import { useCinematicStore } from '@/store/cinematicStore';
import { useTreaLastReport } from '@/store/treaMissionStore';
import { CINEMATIC_SHOTS } from '@/lib/trea/cinematicShots';
import ScanVideoModal from '@/components/trea/ScanVideoModal';
import MissionReportModal from '@/components/trea/MissionReportModal';

export default function CinematicOverlay() {
  const isActive = useCinematicStore(s => s.isActive);
  const currentShotIndex = useCinematicStore(s => s.currentShotIndex);
  const isPaused = useCinematicStore(s => s.isPaused);
  const pauseCinematic = useCinematicStore(s => s.pauseCinematic);
  const resumeCinematic = useCinematicStore(s => s.resumeCinematic);
  const exitCinematic = useCinematicStore(s => s.exitCinematic);
  const lastReport = useTreaLastReport();

  if (!isActive || typeof document === 'undefined') return null;

  const shot = CINEMATIC_SHOTS[currentShotIndex];
  if (!shot) return null;

  // 阶段4:任务报告(独立渲染,需要 pointer-events-auto 接收点击)
  if (shot.showReport) {
    return createPortal(
      lastReport ? (
        <MissionReportModal
          report={lastReport}
          isOpen={true}
          onClose={exitCinematic}
        />
      ) : (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black">
          <span className="text-white/60 text-sm">正在生成任务报告…</span>
        </div>
      ),
      document.body
    );
  }

  // 阶段3:视频播放窗口(全屏占位符)
  if (shot.showVideo) {
    return createPortal(<ScanVideoModal />, document.body);
  }

  // 阶段1-2:底部文字 + 控制按钮
  return createPortal(
    <div className="fixed inset-0 z-[200] pointer-events-none select-none">
      {/* 控制区(右上角) */}
      <div className="absolute top-4 right-4 flex items-center gap-2 pointer-events-auto">
        <button
          onClick={() => (isPaused ? resumeCinematic() : pauseCinematic())}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-950/90 border border-white/20 text-white hover:bg-slate-800 transition-colors"
          title={isPaused ? '继续' : '暂停'}
        >
          {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
        </button>
        <button
          onClick={exitCinematic}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-red-700/90 border border-red-400/40 text-white hover:bg-red-600 transition-colors"
          title="退出电影模式"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 底部阶段文字 */}
      {shot.subtitle && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <div className="px-6 py-2 rounded-full bg-black/70 border border-white/15">
            <span className="text-white text-base font-medium tracking-wide">
              {shot.subtitle}
            </span>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
