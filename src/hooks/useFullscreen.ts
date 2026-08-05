'use client';

import { useCallback, useEffect, useState } from 'react';

// Fullscreen API 兼容前缀(旧版 Safari/Chrome)
interface FullscreenDocument extends Document {
  webkitExitFullscreen?: () => Promise<void>;
  webkitFullscreenElement?: Element | null;
}
interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void>;
}

// 全屏状态管理 Hook:
// - toggle(): 进入/退出全屏(优先 documentElement,兼容 webkit 前缀)
// - isFullscreen: 当前是否全屏(监听 fullscreenchange 自动同步)
// - 浏览器原生支持 ESC 退出全屏并触发 fullscreenchange,按钮图标随之自动切换
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => {
      const doc = document as FullscreenDocument;
      setIsFullscreen(
        !!(document.fullscreenElement || doc.webkitFullscreenElement),
      );
    };
    document.addEventListener('fullscreenchange', onChange);
    if ('webkitfullscreenchange' in document) {
      document.addEventListener('webkitfullscreenchange' as never, onChange);
    }
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if ('webkitfullscreenchange' in document) {
        document.removeEventListener('webkitfullscreenchange' as never, onChange);
      }
    };
  }, []);

  const toggle = useCallback(() => {
    const doc = document as FullscreenDocument;
    const el = document.documentElement as FullscreenElement;
    const isFs = !!(document.fullscreenElement || doc.webkitFullscreenElement);
    try {
      if (isFs) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen().catch(() => {});
        }
      } else {
        if (el.requestFullscreen) {
          el.requestFullscreen().catch(() => {});
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen().catch(() => {});
        }
      }
    } catch (e) {
      console.warn('[useFullscreen] 全屏切换失败:', e);
    }
  }, []);

  return { isFullscreen, toggle };
}