'use client';

import { useState, useEffect, useRef } from 'react';

interface SatelliteMediaProps {
  satelliteName: string;
  model3dUrl?: string | null;
  imageUrl?: string | null;
}

export default function SatelliteMedia({ satelliteName, model3dUrl, imageUrl }: SatelliteMediaProps) {
  const [modelError, setModelError] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);
  const modelViewerRef = useRef<HTMLElement | null>(null);

  // Determine model source based on URL
  const modelSource = model3dUrl?.includes('change') || model3dUrl?.includes('tianwen')
    ? 'NADC / CASCI'
    : 'NASA 3D Resources';

  // Dynamically import model-viewer on client side
  useEffect(() => {
    if (model3dUrl && typeof window !== 'undefined') {
      import('@google/model-viewer').then(() => {
        // Component is auto-registered as <model-viewer>
      }).catch(() => {
        setModelError(true);
      });
    }
  }, [model3dUrl]);

  // Listen for model-viewer load errors
  useEffect(() => {
    const el = modelViewerRef.current;
    if (!el || !model3dUrl) return;
    const handleError = () => setModelError(true);
    el.addEventListener('error', handleError);
    return () => el.removeEventListener('error', handleError);
  }, [model3dUrl]);

  const hasModel = model3dUrl && !modelError;
  const hasImage = imageUrl && !imageFailed;

  // No media at all
  if (!hasModel && !hasImage) {
    return (
      <div className="flex flex-col items-center justify-center h-32 bg-space-800/30 rounded-lg border border-space-700/50">
        <svg className="w-8 h-8 text-space-600 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <p className="text-space-500 text-xs">暂无资料</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 3D Model */}
      {hasModel && (
        <div className="space-y-1">
          <div className="h-56 bg-space-900/50 rounded-lg overflow-hidden border border-space-700">
            <model-viewer
              ref={modelViewerRef as any}
              src={model3dUrl!}
              alt={`${satelliteName} 3D model`}
              auto-rotate
              camera-controls
              shadow-intensity="1"
              environment-image="neutral"
              className="w-full h-full"
              style={{ width: '100%', height: '100%' }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-space-500 text-xs">3D模型 · {modelSource}</span>
            <span className="text-space-600 text-xs">拖拽旋转 · 滚轮缩放</span>
          </div>
        </div>
      )}

      {/* Satellite Image */}
      {hasImage && (
        <div className="space-y-1">
          <div
            className="relative h-44 bg-space-900/50 rounded-lg overflow-hidden border border-space-700 cursor-pointer group"
            onClick={() => setShowFullImage(true)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl!}
              alt={satelliteName}
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
              onError={() => setImageFailed(true)}
            />
          </div>
          <span className="text-space-500 text-xs">卫星图像 · {modelSource}</span>

          {/* Full size image modal */}
          {showFullImage && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
              onClick={() => setShowFullImage(false)}
            >
              <div className="relative max-w-4xl max-h-[90vh] w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl!}
                  alt={satelliteName}
                  referrerPolicy="no-referrer"
                  className="max-w-full max-h-[90vh] object-contain rounded-lg"
                />
                <button
                  onClick={() => setShowFullImage(false)}
                  className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
