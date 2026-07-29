'use client';

// ============================================================
// 卫星扫描视频播放窗口(正式版)
// ------------------------------------------------------------
// 电影回放阶段3:弹出此窗口,播放 6 秒"卫星扫描任务区域"的真实视频。
// 6 秒后由 CinematicController 自动切换到阶段4(任务报告)。
//
// 设计:
//   - 全屏深色背景遮罩
//   - 视频以原始宽高比居中显示(object-contain,不拉伸)
//   - 弹出框尺寸自适应视频内容
//   - 自动播放、静音(浏览器自动播放策略要求)
//   - 无进度条、无文字覆盖
// ============================================================

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCinematicStore } from '@/store/cinematicStore';
import { CINEMATIC_SHOTS } from '@/lib/trea/cinematicShots';

export default function ScanVideoModal() {
  const isActive = useCinematicStore(s => s.isActive);
  const currentShotIndex = useCinematicStore(s => s.currentShotIndex);
  const [videoRatio, setVideoRatio] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  if (typeof document === 'undefined') return null;

  const shot = CINEMATIC_SHOTS[currentShotIndex];
  if (!isActive || !shot?.showVideo) return null;

  /** 视频元数据加载后,读取原始宽高比,让弹出框适配视频比例 */
  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (v && v.videoWidth > 0 && v.videoHeight > 0) {
      setVideoRatio(v.videoWidth / v.videoHeight);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black">
      {/*
        弹出框容器:根据视频原始宽高比设定容器尺寸
        - 宽屏视频(16:9 等):宽度优先,高度按比例
        - 竖屏视频(9:16 等):高度优先,宽度按比例
        - 未加载时回退到接近全屏的安全尺寸
      */}
      <div
        className="relative"
        style={
          videoRatio
            ? videoRatio >= 1
              ? { width: 'min(92vw, calc(90vh * ' + videoRatio + '))', aspectRatio: String(videoRatio) }
              : { height: 'min(90vh, calc(92vw / ' + videoRatio + '))', aspectRatio: String(videoRatio) }
            : { width: '92vw', height: '90vh' }
        }
      >
        <video
          ref={videoRef}
          src="/trea/scan-video.mp4"
          autoPlay
          muted
          playsInline
          onLoadedMetadata={handleLoadedMetadata}
          className="w-full h-full object-contain"
        />
      </div>
    </div>,
    document.body
  );
}
