'use client';

import { useState, useEffect, useRef } from 'react';

interface NasaImage {
  title: string;
  description: string;
  nasaId: string;
  thumbnail: string;
  fullSize: string;
}

interface SatelliteMediaProps {
  satelliteName: string;
}

// Wrap NASA image URLs through our proxy to avoid ERR_ABORTED / ERR_CONNECTION_CLOSED
function proxyUrl(url: string): string {
  if (!url) return url;
  return `/api/nasa-image/proxy?src=${encodeURIComponent(url)}`;
}

export default function SatelliteMedia({ satelliteName }: SatelliteMediaProps) {
  const [images, setImages] = useState<NasaImage[]>([]);
  const [model3dUrl, setModel3dUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modelError, setModelError] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showFullImage, setShowFullImage] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set());
  const modelViewerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!satelliteName) return;

    setLoading(true);
    setCurrentImageIndex(0);
    setImages([]);
    setModel3dUrl(null);
    setModelError(false);
    setFailedImages(new Set());

    fetch(`/api/nasa-media?q=${encodeURIComponent(satelliteName)}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setImages(data.data.images || []);
          setModel3dUrl(data.data.model3dUrl || null);
        }
      })
      .catch(() => {
        // Silent fail
      })
      .finally(() => setLoading(false));
  }, [satelliteName]);

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
  }, [model3dUrl, loading]);

  // Auto-advance past failed images
  useEffect(() => {
    if (images.length > 0 && failedImages.size > 0) {
      // If current image failed, try to find next valid one
      if (failedImages.has(currentImageIndex)) {
        const nextValid = images.findIndex((_, idx) => !failedImages.has(idx));
        if (nextValid !== -1) {
          setCurrentImageIndex(nextValid);
        }
      }
    }
  }, [failedImages, currentImageIndex, images.length]);

  const handleImageError = (index: number) => {
    setFailedImages(prev => new Set(prev).add(index));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 bg-space-800/30 rounded-lg">
        <div className="w-8 h-8 border-2 border-cosmic-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Priority 1: 3D Model (only if URL exists and no load error)
  if (model3dUrl && !modelError) {
    return (
      <div className="space-y-2">
        <div className="h-64 bg-space-900/50 rounded-lg overflow-hidden border border-space-700">
          <model-viewer
            ref={modelViewerRef as any}
            src={model3dUrl}
            alt={`${satelliteName} 3D model`}
            auto-rotate
            camera-controls
            shadow-intensity="1"
            environment-image="neutral"
            className="w-full h-full"
            style={{ width: '100%', height: '100%' }}
          />
        </div>
        <p className="text-space-500 text-xs text-center">拖拽旋转 · 滚轮缩放</p>
      </div>
    );
  }

  // Check if all images failed
  const validImages = images.filter((_, idx) => !failedImages.has(idx));

  // Priority 2: NASA Images (via proxy)
  if (images.length > 0 && validImages.length > 0) {
    const currentImage = images[currentImageIndex] || images[validImages.length > 0 ? images.findIndex((_, idx) => !failedImages.has(idx)) : 0];
    if (!currentImage) return null;

    return (
      <div className="space-y-2">
        {images.length > 1 && (
          <div className="flex items-center justify-end">
            <span className="text-space-500 text-xs">{currentImageIndex + 1} / {images.length}</span>
          </div>
        )}

        <div
          className="relative h-48 bg-space-900/50 rounded-lg overflow-hidden border border-space-700 cursor-pointer group"
          onClick={() => setShowFullImage(true)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proxyUrl(currentImage.thumbnail)}
            alt={currentImage.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-contain"
            onError={() => handleImageError(currentImageIndex)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
            <p className="text-white text-xs line-clamp-2">{currentImage.title}</p>
          </div>
        </div>

        {images.length > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                let next = currentImageIndex;
                for (let i = 0; i < images.length; i++) {
                  next = (next - 1 + images.length) % images.length;
                  if (!failedImages.has(next)) break;
                }
                setCurrentImageIndex(next);
              }}
              className="p-1 rounded text-space-400 hover:text-space-100 hover:bg-space-700/50 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="flex-1 flex gap-1 justify-center">
              {images.slice(0, 6).map((img, idx) => (
                <button
                  key={img.nasaId}
                  onClick={() => !failedImages.has(idx) && setCurrentImageIndex(idx)}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${
                    failedImages.has(idx) ? 'bg-red-500/30' :
                    idx === currentImageIndex ? 'bg-cosmic-blue w-4' : 'bg-space-600 hover:bg-space-500'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={() => {
                let next = currentImageIndex;
                for (let i = 0; i < images.length; i++) {
                  next = (next + 1) % images.length;
                  if (!failedImages.has(next)) break;
                }
                setCurrentImageIndex(next);
              }}
              className="p-1 rounded text-space-400 hover:text-space-100 hover:bg-space-700/50 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        )}

        {/* Full size image modal */}
        {showFullImage && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setShowFullImage(false)}
          >
            <div className="relative max-w-4xl max-h-[90vh] w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={proxyUrl(currentImage.fullSize)}
                alt={currentImage.title}
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[90vh] object-contain rounded-lg"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 rounded-b-lg">
                <p className="text-white text-sm font-medium">{currentImage.title}</p>
                {currentImage.description && (
                  <p className="text-space-300 text-xs mt-1 line-clamp-3">{currentImage.description}</p>
                )}
                <p className="text-space-500 text-xs mt-2">Source: NASA Image and Video Library</p>
              </div>
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
    );
  }

  // Priority 3: No media available (or all images failed to load)
  return (
    <div className="flex flex-col items-center justify-center h-32 bg-space-800/30 rounded-lg border border-space-700/50">
      <svg className="w-8 h-8 text-space-600 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
      <p className="text-space-500 text-xs">暂无图像</p>
    </div>
  );
}
