'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, Lock, X, Check, AlertCircle } from 'lucide-react';

interface SatelliteMediaProps {
  satelliteName: string;
  noradId: number;
  model3dUrl?: string | null;
  imageUrl?: string | null;
  onImageUploaded?: (imageUrl: string) => void;
}

export default function SatelliteMedia({ satelliteName, noradId, model3dUrl, imageUrl, onImageUploaded }: SatelliteMediaProps) {
  const [modelError, setModelError] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelViewerRef = useRef<HTMLElement | null>(null);

  // Load admin verification state from sessionStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsVerified(sessionStorage.getItem('admin_verified') === 'true');
    }
  }, []);

  // Determine model source based on URL
  const modelSource = model3dUrl?.includes('change') || model3dUrl?.includes('tianwen')
    ? 'NADC / CASCI'
    : model3dUrl?.includes('/uploads/') || model3dUrl?.startsWith('data:')
      ? '管理员上传'
      : 'NASA 3D Resources';
  const imageSource = imageUrl?.includes('/uploads/') || imageUrl?.startsWith('data:')
    ? '管理员上传'
    : modelSource;

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

  const handleVerifyPassword = () => {
    // We verify by making a test API call - the server checks the password
    // Since we can't do that without uploading, store in sessionStorage after successful upload
    // For now, just show the file picker if password is not empty
    if (adminPassword.trim()) {
      setShowAdminModal(false);
      fileInputRef.current?.click();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    try {
      const formData = new FormData();
      formData.append('noradId', String(noradId));
      formData.append('file', file);

      const res = await fetch('/api/admin/upload-image', {
        method: 'POST',
        headers: { 'x-admin-password': adminPassword },
        body: formData,
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        if (res.status === 401) {
          setUploadError('密码错误');
          setIsVerified(false);
          sessionStorage.removeItem('admin_verified');
        } else {
          setUploadError(result.error || '上传失败');
        }
        return;
      }

      setUploadSuccess(true);
      setIsVerified(true);
      sessionStorage.setItem('admin_verified', 'true');
      onImageUploaded?.(result.data.imageUrl);

      setTimeout(() => {
        setUploadSuccess(false);
        setAdminPassword('');
      }, 2000);
    } catch {
      setUploadError('网络错误，请重试');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAdminClick = () => {
    if (isVerified) {
      fileInputRef.current?.click();
    } else {
      setShowAdminModal(true);
      setUploadError(null);
    }
  };

  const hasModel = model3dUrl && !modelError;
  const hasImage = imageUrl && !imageFailed;
  const noMedia = !hasModel && !hasImage;

  return (
    <div className="space-y-3">
      {/* Upload button - shown when no media or when admin is verified */}
      <div className="flex items-center justify-end">
        <button
          onClick={handleAdminClick}
          className="flex items-center gap-1 text-xs text-space-500 hover:text-cosmic-blue transition-colors"
          title="管理员上传图片"
        >
          {isVerified ? <Upload className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
          <span>{hasImage ? '替换图片' : '上传图片'}</span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* No media at all */}
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

      {/* Upload status messages */}
      {uploading && (
        <div className="flex items-center justify-center gap-2 py-2 text-cosmic-blue text-xs">
          <div className="w-3 h-3 border-2 border-cosmic-blue border-t-transparent rounded-full animate-spin" />
          上传中...
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
          上传成功
        </div>
      )}

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
          <span className="text-space-500 text-xs">卫星图像 · {imageSource}</span>

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

      {/* Admin Password Modal */}
      {showAdminModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShowAdminModal(false)}
        >
          <div
            className="bg-space-900 border border-space-700 rounded-lg p-6 w-80 max-w-full"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-space-100 font-medium text-sm">管理员验证</h3>
              <button onClick={() => setShowAdminModal(false)} className="text-space-500 hover:text-space-300">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-space-400 text-xs mb-3">请输入管理员密码以上传卫星图片</p>
            <input
              type="password"
              value={adminPassword}
              onChange={e => setAdminPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleVerifyPassword()}
              placeholder="管理员密码"
              className="w-full bg-space-800 border border-space-700 rounded px-3 py-2 text-sm text-space-100 placeholder:text-space-600 focus:outline-none focus:border-cosmic-blue mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAdminModal(false)}
                className="px-3 py-1.5 text-xs text-space-400 hover:text-space-200"
              >
                取消
              </button>
              <button
                onClick={handleVerifyPassword}
                disabled={!adminPassword.trim() || uploading}
                className="px-4 py-1.5 text-xs bg-cosmic-blue text-white rounded hover:bg-cosmic-blue/80 disabled:opacity-50"
              >
                {uploading ? '上传中...' : '验证并上传'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
