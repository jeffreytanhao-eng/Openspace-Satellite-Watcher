'use client';

import { useState, useCallback } from 'react';
import { useTimeStore } from '@/store/timeStore';
import { formatDateTime } from '@/lib/utils';

type DragHandle = 'start' | 'end' | null;

export default function TimeRangeSlider() {
  const { startTime, endTime, setStartTime, setEndTime, resetToNow } = useTimeStore(state => ({
    startTime: state.startTime,
    endTime: state.endTime,
    setStartTime: state.setStartTime,
    setEndTime: state.setEndTime,
    resetToNow: state.resetToNow
  }));

  const [dragging, setDragging] = useState<DragHandle>(null);
  const [localStartValue, setLocalStartValue] = useState(0);
  const [localEndValue, setLocalEndValue] = useState(100);

  const totalDuration = 2 * 24 * 60 * 60 * 1000;

  const now = Date.now();
  const startPosition = ((startTime.getTime() - (now - 24 * 60 * 60 * 1000)) / totalDuration) * 100;
  const endPosition = ((endTime.getTime() - (now - 24 * 60 * 60 * 1000)) / totalDuration) * 100;

  const handleSliderMouseDown = useCallback((handle: 'start' | 'end') => {
    setDragging(handle);
    if (handle === 'start') {
      setLocalStartValue(startPosition);
    } else {
      setLocalEndValue(endPosition);
    }
  }, [startPosition, endPosition]);

  const handleSliderMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragging) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));

    const baseTime = Date.now() - 24 * 60 * 60 * 1000;

    if (dragging === 'start') {
      setLocalStartValue(percentage);
      const newStartTime = new Date(baseTime + (percentage / 100) * totalDuration);
      if (newStartTime.getTime() < endTime.getTime()) {
        setStartTime(newStartTime);
      }
    } else {
      setLocalEndValue(percentage);
      const newEndTime = new Date(baseTime + (percentage / 100) * totalDuration);
      if (newEndTime.getTime() > startTime.getTime()) {
        setEndTime(newEndTime);
      }
    }
  }, [dragging, setStartTime, setEndTime, startTime, endTime, totalDuration]);

  const handleSliderMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  const handleSliderMouseLeave = useCallback(() => {
    if (dragging) {
      setDragging(null);
    }
  }, [dragging]);

  return (
    <div className="bg-space-900/80 backdrop-blur-sm rounded-lg p-4 border border-space-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-space-200 font-medium text-sm">时间范围设置</h3>
        <button
          onClick={resetToNow}
          className="text-xs text-cosmic-blue hover:text-cosmic-blue/80 px-3 py-1 bg-cosmic-blue/10 rounded-md transition-colors"
        >
          重置为当前时间
        </button>
      </div>

      <div className="space-y-3">
        <div
          className="relative h-3 bg-space-800 rounded-full cursor-pointer select-none"
          onMouseMove={handleSliderMouseMove}
          onMouseUp={handleSliderMouseUp}
          onMouseLeave={handleSliderMouseLeave}
        >
          <div
            className="absolute inset-y-0 bg-gradient-to-r from-cosmic-blue/30 to-cosmic-purple/30 rounded-full"
            style={{
              left: `${startPosition}%`,
              width: `${endPosition - startPosition}%`
            }}
          />

          <div
            className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-cosmic-blue rounded-full border-2 border-space-900 shadow-lg cursor-grab active:cursor-grabbing transition-transform ${
              dragging === 'start' ? 'scale-125' : 'hover:scale-110'
            }`}
            style={{ left: `calc(${startPosition}% - 10px)` }}
            onMouseDown={() => handleSliderMouseDown('start')}
          />

          <div
            className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-cosmic-purple rounded-full border-2 border-space-900 shadow-lg cursor-grab active:cursor-grabbing transition-transform ${
              dragging === 'end' ? 'scale-125' : 'hover:scale-110'
            }`}
            style={{ left: `calc(${endPosition}% - 10px)` }}
            onMouseDown={() => handleSliderMouseDown('end')}
          />
        </div>

        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            <label className="text-xs text-space-500 mb-1">开始时间</label>
            <div className="font-mono text-sm text-cosmic-blue bg-space-800/50 px-3 py-1.5 rounded border border-space-700">
              {formatDateTime(startTime)}
            </div>
          </div>

          <div className="flex flex-col items-center">
            <div className="text-xs text-space-500 mb-1">→</div>
            <div className="text-xs text-space-400">
              {(endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60 * 24)} 天
            </div>
          </div>

          <div className="flex flex-col items-end">
            <label className="text-xs text-space-500 mb-1">结束时间</label>
            <div className="font-mono text-sm text-cosmic-purple bg-space-800/50 px-3 py-1.5 rounded border border-space-700">
              {formatDateTime(endTime)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}