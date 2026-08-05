'use client';

import { Maximize2, Minimize2 } from 'lucide-react';
import { useFullscreen } from '@/hooks/useFullscreen';

// 全屏切换按钮(共享组件,三处复用)
// - 放在各界面顶部右上角,位置一致
// - 不透明深色背景(用户偏好,不用半透明/玻璃态)
// - 图标随全屏状态切换,ESC 退出后自动同步
export default function FullscreenButton() {
  const { isFullscreen, toggle } = useFullscreen();

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      className="flex items-center justify-center w-8 h-8 rounded-lg bg-space-800 border border-space-700 text-space-300 hover:text-cosmic-blue hover:border-cosmic-blue/50 transition-colors"
      title={isFullscreen ? '退出全屏 (ESC)' : '全屏'}
    >
      {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
    </button>
  );
}