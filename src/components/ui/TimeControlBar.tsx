'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTimeStore, useCurrentTime, useIsPlaying, usePlaybackRate, usePlaybackRates } from '@/store/timeStore';
import { formatDateTime } from '@/lib/utils';

export default function TimeControlBar() {
  const [mounted, setMounted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const currentTime = useCurrentTime();
  const isPlaying = useIsPlaying();
  const rate = usePlaybackRate();
  const rates = usePlaybackRates();
  const togglePlay = useTimeStore(state => state.togglePlay);
  const setRate = useTimeStore(state => state.setRate);
  const setCurrentTime = useTimeStore(state => state.setCurrentTime);
  const { startTime, endTime } = useTimeStore(state => ({
    startTime: state.startTime,
    endTime: state.endTime
  }));
  const skipBackward = useTimeStore(state => state.skipBackward);
  const skipForward = useTimeStore(state => state.skipForward);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const totalDuration = endTime.getTime() - startTime.getTime();
  const currentPosition = (currentTime.getTime() - startTime.getTime()) / totalDuration;
  const sliderValue = Math.max(0, Math.min(100, currentPosition * 100));

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    const newTime = new Date(startTime.getTime() + (value / 100) * totalDuration);
    setCurrentTime(newTime);
  }, [startTime, totalDuration, setCurrentTime]);

  const formatRateLabel = (r: number) => {
    if (r === 0) return '暂停';
    return `${r}x`;
  };

  return (
    <div className="bg-space-900/95 backdrop-blur-sm border-t border-space-800 px-4 py-3">
      <div className="flex items-center gap-3">
        {/* 跳过按钮组 - 快退 */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => skipBackward(300)}
            className="flex flex-col items-center px-2 py-1 rounded-lg text-space-400 hover:text-space-200 hover:bg-space-800 transition-all"
            title="后退5分钟"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
            </svg>
            <span className="text-[9px] mt-0.5">5分</span>
          </button>
          <button
            onClick={() => skipBackward(60)}
            className="flex flex-col items-center px-2 py-1 rounded-lg text-space-400 hover:text-space-200 hover:bg-space-800 transition-all"
            title="后退1分钟"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
            <span className="text-[9px] mt-0.5">1分</span>
          </button>
        </div>

        {/* 播放/暂停按钮 */}
        <button
          onClick={togglePlay}
          className={`flex items-center justify-center w-11 h-11 rounded-full transition-all ${
            isPlaying
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 shadow-lg shadow-red-500/20'
              : 'bg-cosmic-blue/20 text-cosmic-blue hover:bg-cosmic-blue/30 shadow-lg shadow-cosmic-blue/20'
          }`}
          title={isPlaying ? '暂停' : '播放'}
        >
          {isPlaying ? (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg className="w-5 h-5 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="8 5 19 12 8 19 8 5" />
            </svg>
          )}
        </button>

        {/* 跳过按钮组 - 快进 */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => skipForward(60)}
            className="flex flex-col items-center px-2 py-1 rounded-lg text-space-400 hover:text-space-200 hover:bg-space-800 transition-all"
            title="前进1分钟"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
            <span className="text-[9px] mt-0.5">1分</span>
          </button>
          <button
            onClick={() => skipForward(300)}
            className="flex flex-col items-center px-2 py-1 rounded-lg text-space-400 hover:text-space-200 hover:bg-space-800 transition-all"
            title="前进5分钟"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
            </svg>
            <span className="text-[9px] mt-0.5">5分</span>
          </button>
        </div>

        {/* 时间轴滑块 */}
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          <div className="relative h-2 bg-space-800 rounded-full overflow-hidden cursor-pointer group">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-cosmic-blue to-cosmic-purple rounded-full transition-all"
              style={{ width: `${mounted ? sliderValue : 0}%` }}
            />
            <input
              type="range"
              min="0"
              max="100"
              value={mounted ? sliderValue : 0}
              onChange={handleSliderChange}
              onMouseDown={() => setIsDragging(true)}
              onMouseUp={() => setIsDragging(false)}
              onTouchStart={() => setIsDragging(true)}
              onTouchEnd={() => setIsDragging(false)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div
              className={`absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg transition-all ${
                isDragging ? 'scale-125' : 'group-hover:scale-110'
              }`}
              style={{ left: `calc(${mounted ? sliderValue : 0}% - 7px)` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-space-500">
            <span suppressHydrationWarning>{mounted ? formatDateTime(startTime) : '--'}</span>
            <span suppressHydrationWarning>{mounted ? formatDateTime(endTime) : '--'}</span>
          </div>
        </div>

        {/* 当前时间显示和速率选择 */}
        <div className="flex items-center gap-3">
          <div
            className="font-mono text-xs text-cosmic-blue bg-space-800/50 px-2.5 py-1.5 rounded-md border border-space-700 whitespace-nowrap"
            suppressHydrationWarning
          >
            {mounted ? formatDateTime(currentTime) : '--:--:--'}
          </div>

          <select
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            className="bg-space-800 text-space-200 text-xs px-2 py-1.5 rounded-md border border-space-700 focus:border-cosmic-blue focus:outline-none cursor-pointer hover:border-space-600"
          >
            {rates.map(r => (
              <option key={r} value={r}>
                {formatRateLabel(r)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
