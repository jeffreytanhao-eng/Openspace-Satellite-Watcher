'use client';

import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Volume1 } from 'lucide-react';

const AUDIO_SRC = '/audio/space-ambience.mp3';

export default function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [volume, setVolume] = useState(0.4);
  const [showSlider, setShowSlider] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const audio = new Audio(AUDIO_SRC);
    audio.loop = true;
    audio.volume = 0.4;
    audio.preload = 'auto';
    audioRef.current = audio;

    let interactionStarted = false;
    const startPlayback = () => {
      audio.play().catch(() => {});
    };

    const handleCanPlay = () => {
      setIsReady(true);
      // 尝试自动播放（大多数浏览器会阻止无用户交互的自动播放）
      startPlayback();
    };
    const handlePlay = () => {
      interactionStarted = true;
      setIsPlaying(true);
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
    };
    const handlePause = () => setIsPlaying(false);

    // 浏览器 autoplay policy：等待用户首次交互后自动播放
    // 注意：不在首次交互时移除监听，而是在 play 事件真正触发时才移除。
    // 否则如果音频还没加载完，play() 失败后后续交互不再触发重试，音乐永远不播放。
    const handleFirstInteraction = () => {
      if (interactionStarted) return;
      startPlayback();
    };

    audio.addEventListener('canplaythrough', handleCanPlay);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    document.addEventListener('click', handleFirstInteraction);
    document.addEventListener('keydown', handleFirstInteraction);
    document.addEventListener('touchstart', handleFirstInteraction);

    return () => {
      audio.pause();
      audio.removeEventListener('canplaythrough', handleCanPlay);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
      audioRef.current = null;
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      void audio.play().catch(() => {
        // Autoplay was blocked or network issue — ignore silently
      });
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioRef.current) {
      audioRef.current.volume = v;
      // 若音量被调到 0 之外且当前暂停，自动恢复播放
      if (v > 0 && !isPlaying) {
        void audioRef.current.play().catch(() => {});
      }
    }
  };

  const handleEnter = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setShowSlider(true);
  };

  const handleLeave = () => {
    hideTimer.current = setTimeout(() => setShowSlider(false), 400);
  };

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      className="fixed bottom-20 right-4 z-30 flex flex-col items-center gap-2"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {/* 垂直音量滑块 */}
      {showSlider && (
        <div className="mb-1 px-2 py-3 rounded-full bg-space-900/90 backdrop-blur-sm border border-space-700 shadow-lg">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={handleVolumeChange}
            aria-label="音量"
            orient="vertical"
            className="sat-volume-slider"
            style={{
              writingMode: 'vertical-lr' as const,
              direction: 'rtl' as const,
              width: '6px',
              height: '90px',
              WebkitAppearance: 'slider-vertical' as const,
            }}
          />
        </div>
      )}

      <button
        type="button"
        onClick={toggle}
        disabled={!isReady}
        aria-label={isPlaying ? '关闭背景音乐' : '开启背景音乐'}
        title={isReady ? (isPlaying ? '关闭背景音乐' : '开启背景音乐') : '音频加载中...'}
        className={`w-11 h-11 rounded-full border backdrop-blur-sm transition-all duration-300 flex items-center justify-center ${
          isPlaying
            ? 'bg-cosmic-blue/30 border-cosmic-blue/60 text-cosmic-blue shadow-[0_0_16px_rgba(0,212,255,0.4)]'
            : 'bg-space-900/70 border-space-700 text-space-400 hover:text-cosmic-blue hover:border-cosmic-blue/50'
        } ${!isReady ? 'opacity-40 cursor-wait' : 'cursor-pointer'} relative`}
      >
        <VolumeIcon className="w-5 h-5" />
        {isPlaying && (
          <span className="absolute inset-0 rounded-full border border-cosmic-blue/40 animate-ping" />
        )}
      </button>

      <style jsx>{`
        .sat-volume-slider {
          background: transparent;
          cursor: pointer;
        }
        .sat-volume-slider::-webkit-slider-runnable-track {
          width: 4px;
          height: 100%;
          background: rgba(0, 212, 255, 0.2);
          border-radius: 2px;
        }
        .sat-volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #00d4ff;
          margin-left: -5px;
          box-shadow: 0 0 8px rgba(0, 212, 255, 0.6);
          cursor: pointer;
        }
        .sat-volume-slider::-moz-range-track {
          width: 4px;
          background: rgba(0, 212, 255, 0.2);
          border-radius: 2px;
        }
        .sat-volume-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border: none;
          border-radius: 50%;
          background: #00d4ff;
          box-shadow: 0 0 8px rgba(0, 212, 255, 0.6);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
