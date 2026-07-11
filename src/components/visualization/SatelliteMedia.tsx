'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, X, Check, AlertCircle } from 'lucide-react';

interface SatelliteMediaProps {
  satelliteName: string;
  noradId: number;
  model3dUrl?: string | null;
  imageUrl?: string | null;
  onImageUploadRequest?: (noradId: number, file: File) => void;
  onImageUploaded?: (imageUrl: string) => void;
}

export default function SatelliteMedia({ satelliteName, noradId, model3dUrl, imageUrl, onImageUploadRequest, onImageUploaded }: SatelliteMediaProps) {
  const [modelError, setModelError] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelViewerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (model3dUrl && typeof window !== 'undefined') {
      import('@google/model-viewer').catch(() => setModelError(true));
    }
  }, [model3dUrl]);

  useEffect(() => {
    const el = modelViewerRef.current;
    if (!el || !model3dUrl) return;
    const handleError = () => setModelError(true);
    el.addEventListener('error', handleError);
    return () => el.removeEventListener('error', handleError);
  }, [model3dUrl]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setUploadError('请选择图片文件');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError('图片大小不能超过 2MB');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    try {
      onImageUploadRequest?.(noradId, file);
      // 本地预览（密码验证后会永久保存）
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setUploadSuccess(true);
        onImageUploaded?.(dataUrl);
        setImageFailed(false);
        setTimeout(() => setUploadSuccess(false), 3000);
        setUploading(false);
      };
      reader.onerror = () => { setUploadError('图片读取失败'); setUploading(false); };
      reader.readAsDataURL(file);
    } catch (err) {
      setUploadError((err as Error).message || '上传失败');
      setUploading(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const hasModel = model3dUrl && !modelError;
  const hasImage = imageUrl && !imageFailed;
  const noMedia = !hasModel && !hasImage;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 text-xs text-space-500 hover:text-cosmic-blue transition-colors"
          title="上传图片（需要密码，永久保存到服务器）"
        >
          <Upload className="h-3 w-3" />
          <span>{hasImage ? '替换图片' : '上传图片'}</span>
        </button>
      </div>

      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleFileSelect} />

      {noMedia && (
        <div className="flex flex-col items-center justify-center h-32 bg-space-800/30 rounded-lg border border-space-700/50">
          <svg className="w-8 h-8 text-space-600 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <p className="text-space-500 text-xs">暂无资料</p>
        </div>
      )}

      {uploading && (
        <div className="flex items-center justify-center gap-2 py-2 text-cosmic-blue text-xs">
          <div className="w-3 h-3 border-2 border-cosmic-blue border-t-transparent rounded-full animate-spin" />
          处理中...
        </div>
      )}
      {uploadError && (
        <div className="flex items-center justify-center gap-2 py-2 text-red-400 text-xs">
          <AlertCircle className="h-3 w-3" />
          {uploadError}
        </div>
      )}
      {uploadSuccess && (
        <div className="flex items-center justify-center gap-2 py-2 text-green-400 text-xs">
          <Check className="h-3 w-3" />
          已上传（需输入密码后永久保存）
        </div>
      )}

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
            <span className="text-space-500 text-xs">3D模型</span>
            <span className="text-space-600 text-xs">拖拽旋转 · 滚轮缩放</span>
          </div>
        </div>
      )}

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
          <span className="text-space-500 text-xs">卫星图像</span>

          {showFullImage && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
              onClick={() => setShowFullImage(false)}
            >
              <div className="relative max-w-4xl max-h-[90vh] w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl!} alt={satelliteName} referrerPolicy="no-referrer" className="max-w-full max-h-[90vh] object-contain rounded-lg" />
                <button onClick={() => setShowFullImage(false)} className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
