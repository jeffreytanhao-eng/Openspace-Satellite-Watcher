'use client';

// ============================================================
// 避撞机动视频播放窗口
// ------------------------------------------------------------
// 紧急避撞任务:用户选择躲避计划并执行机动(切换轨道)后,
// 弹出此窗口播放 6 秒"卫星变轨规避碎片"的视频。
// 视频播放结束后(或 6 秒兜底超时)自动回调 onEnded,
// 由 CollisionAlertModal 切换到 success(大屏成功画面)。
//
// 设计:
//   - 全屏深色背景遮罩
//   - 视频以原始宽高比居中显示(object-contain,不拉伸)
//   - 弹出框尺寸自适应视频内容
//   - 自动播放、静音(浏览器自动播放策略要求)
//   - 无进度条、无文字覆盖
// ============================================================

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface AvoidanceVideoModalProps {
  /** 视频播放结束(或兜底超时)后的回调 */
  onEnded: () => void;
}

export default function AvoidanceVideoModal({ onEnded }: AvoidanceVideoModalProps) {
  const [videoRatio, setVideoRatio] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // 用 ref 标记是否已触发 onEnded,避免 onEnded 与兜底 setTimeout 重复调用
  const endedRef = useRef(false);

  // 6 秒兜底超时:即使视频 onEnded 未触发(如加载失败),6 秒后也强制结束
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!endedRef.current) {
        endedRef.current = true;
        onEnded();
      }
    }, 6500);
    return () => clearTimeout(timer);
  }, [onEnded]);

  if (typeof document === 'undefined') return null;

  /** 视频元数据加载后,读取原始宽高比,让弹出框适配视频比例 */
  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (v && v.videoWidth > 0 && v.videoHeight > 0) {
      setVideoRatio(v.videoWidth / v.videoHeight);
    }
  };

  /** 视频播放结束回调(优先于兜底超时) */
  const handleEnded = () => {
    if (!endedRef.current) {
      endedRef.current = true;
      onEnded();
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
          src="/trea/avoidance-video.mp4"
          autoPlay
          muted
          playsInline
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          className="w-full h-full object-contain"
        />
      </div>
    </div>,
    document.body
  );
}
