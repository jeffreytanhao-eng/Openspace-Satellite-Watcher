'use client';

import { useState, useRef } from 'react';
import { X, Upload, Download, Search, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import { apiClient } from '@/lib/api/client';

export interface ImportFailure {
  noradId: string;
  name: string;
  reason: string;
}

export interface ImportResult {
  total: number;
  success: number;
  failed: number;
  failures: ImportFailure[];
}

interface ImportedSatellite {
  noradId: number;
  name: string;
  line1: string;
  line2: string;
}

export interface ImportSummary {
  imported: number;
  skipped: number;
  remaining: number;
}

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (satellites?: ImportedSatellite[]) => ImportSummary | void;
}

const CELESTRAK_CATEGORIES = [
  { name: 'starlink', label: 'Starlink', description: 'SpaceX Starlink (可能受限)', disabled: false },
  { name: 'gps-ops', label: 'GPS', description: 'GPS 运营卫星' },
  { name: 'glo-ops', label: 'GLONASS', description: 'GLONASS 运营卫星' },
  { name: 'galileo', label: 'Galileo', description: 'Galileo 卫星' },
  { name: 'beidou', label: '北斗', description: '北斗导航卫星' },
  { name: 'iridium', label: 'Iridium', description: 'Iridium 卫星' },
  { name: 'oneweb', label: 'OneWeb', description: 'OneWeb 卫星' },
  { name: 'weather', label: '气象卫星', description: '气象卫星' },
  { name: 'geo', label: 'GEO', description: '地球静止轨道卫星' },
  { name: 'iss', label: 'ISS', description: '国际空间站' },
  { name: 'science', label: '科学卫星', description: '科学研究卫星' },
  { name: 'military', label: '军事卫星', description: '军事卫星' },
];

type ImportMode = 'celestrak' | 'file';

export default function ImportModal({ isOpen, onClose, onSuccess }: ImportModalProps) {
  const [importMode, setImportMode] = useState<ImportMode>('celestrak');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    setImportMode('celestrak');
    setSearchQuery('');
    setSelectedCategory('');
    setUploadFile(null);
    setIsImporting(false);
    setProgress(0);
    setImportResult(null);
    setImportSummary(null);
    setError(null);
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.txt') && !file.name.endsWith('.tle')) {
        setError('仅支持 .txt 或 .tle 格式的文件');
        return;
      }
      setUploadFile(file);
      setError(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      if (!file.name.endsWith('.txt') && !file.name.endsWith('.tle')) {
        setError('仅支持 .txt 或 .tle 格式的文件');
        return;
      }
      setUploadFile(file);
      setError(null);
    }
  };

  const startImport = async () => {
    setIsImporting(true);
    setProgress(0);
    setImportResult(null);
    setError(null);

    try {
      let response;

      if (importMode === 'celestrak') {
        // If search query is entered, search by NORAD/name; otherwise use category
        if (searchQuery.trim()) {
          setProgress(30);
          response = await apiClient.searchTLEFromCelestrak(searchQuery.trim());
        } else {
          if (!selectedCategory) {
            setError('请输入 NORAD ID/名称或选择分类');
            setIsImporting(false);
            return;
          }
          setProgress(30);
          response = await apiClient.importTLEFromCelestrak(selectedCategory);
        }
      } else {
        if (!uploadFile) {
          setError('请选择文件');
          setIsImporting(false);
          return;
        }
        setProgress(30);
        response = await apiClient.importTLEFromFile(uploadFile);
      }

      setProgress(100);

      if (response.success && response.data) {
        const data = response.data as { importReport?: ImportResult; satellites?: ImportedSatellite[] } & ImportResult;
        const report = data.importReport || data;
        setImportResult({
          total: report.total,
          success: report.success,
          failed: report.failed,
          failures: report.failures || []
        });
        if (data.satellites && data.satellites.length > 0) {
          const summary = onSuccess?.(data.satellites);
          if (summary) setImportSummary(summary);
        } else {
          onSuccess?.();
        }
      } else {
        setError(response.error || '导入失败');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsImporting(false);
    }
  };

  const resetImport = () => {
    setImportMode('celestrak');
    setSearchQuery('');
    setSelectedCategory('');
    setUploadFile(null);
    setProgress(0);
    setImportResult(null);
    setImportSummary(null);
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-space-950/80 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div className="relative w-full max-w-2xl mx-4 bg-space-900 border border-space-700 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-space-700">
          <h2 className="text-space-100 font-semibold text-lg">批量导入卫星数据</h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-space-400 hover:text-space-100 hover:bg-space-700/50"
            onClick={handleClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6">
          {importResult ? (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-space-800/50 rounded-lg p-4 text-center">
                  <p className="text-space-400 text-xs mb-1">总数</p>
                  <p className="text-space-100 font-bold text-xl">{importResult.total}</p>
                </div>
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-center">
                  <p className="text-green-400 text-xs mb-1">成功</p>
                  <p className="text-green-400 font-bold text-xl">{importResult.success}</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
                  <p className="text-red-400 text-xs mb-1">失败</p>
                  <p className="text-red-400 font-bold text-xl">{importResult.failed}</p>
                </div>
              </div>

              {/* Actual import summary (deduplication + 200 limit) */}
              {importSummary && (
                <div className="bg-cosmic-blue/10 border border-cosmic-blue/30 rounded-lg p-4">
                  <h3 className="text-cosmic-blue text-sm font-medium mb-3 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    导入结果
                  </h3>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-green-400 font-bold text-lg">{importSummary.imported}</p>
                      <p className="text-space-400 text-xs">本次导入</p>
                    </div>
                    <div>
                      <p className="text-space-300 font-bold text-lg">{importSummary.skipped}</p>
                      <p className="text-space-400 text-xs">跳过(已存在)</p>
                    </div>
                    <div>
                      <p className="text-cosmic-cyan font-bold text-lg">{importSummary.remaining}</p>
                      <p className="text-space-400 text-xs">可下次导入</p>
                    </div>
                  </div>
                  {importSummary.remaining > 0 && (
                    <p className="text-space-400 text-xs mt-3 text-center">
                      点击"继续导入"可导入剩余 {importSummary.remaining} 颗卫星
                    </p>
                  )}
                </div>
              )}

              {importResult.failed > 0 && importResult.failures.length > 0 && (
                <div className="bg-space-800/30 rounded-lg p-4">
                  <h3 className="text-space-300 text-sm font-medium mb-3 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-400" />
                    失败详情
                  </h3>
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {importResult.failures.slice(0, 20).map((failure, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-3 bg-space-700/30 rounded-lg p-3"
                      >
                        <XCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-space-100 text-sm font-medium truncate">
                              {failure.name}
                            </span>
                            <span className="text-space-500 text-xs">NORAD: {failure.noradId}</span>
                          </div>
                          <p className="text-red-400 text-xs">{failure.reason}</p>
                        </div>
                      </div>
                    ))}
                    {importResult.failures.length > 20 && (
                      <p className="text-space-500 text-xs text-center py-2">
                        还有 {importResult.failures.length - 20} 条失败记录未显示
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  className="bg-space-800/50 hover:bg-space-700/50 border-space-700"
                  onClick={resetImport}
                >
                  继续导入
                </Button>
                <Button onClick={handleClose}>
                  关闭
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-6 p-1 bg-space-800/50 rounded-lg">
                <button
                  onClick={() => setImportMode('celestrak')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    importMode === 'celestrak'
                      ? 'bg-cosmic-blue text-white shadow-lg'
                      : 'text-space-400 hover:text-space-100 hover:bg-space-700/50'
                  }`}
                >
                  <Download className="h-4 w-4" />
                  Celestrak
                </button>
                <button
                  onClick={() => setImportMode('file')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    importMode === 'file'
                      ? 'bg-cosmic-blue text-white shadow-lg'
                      : 'text-space-400 hover:text-space-100 hover:bg-space-700/50'
                  }`}
                >
                  <Upload className="h-4 w-4" />
                  本地文件
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-400" />
                  <span className="text-red-400 text-sm">{error}</span>
                </div>
              )}

              {isImporting && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-space-400 text-sm">导入进度</span>
                    <span className="text-cosmic-blue text-sm">{progress}%</span>
                  </div>
                  <div className="h-2 bg-space-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cosmic-blue to-cosmic-purple transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {importMode === 'celestrak' && (
                <div className="space-y-4">
                  {/* Search by NORAD or name */}
                  <div className="space-y-2">
                    <p className="text-space-400 text-sm">按 NORAD ID 或名称搜索特定卫星：</p>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-space-500" />
                        <Input
                          type="text"
                          placeholder="输入 NORAD ID (如 25544) 或卫星名称 (如 Hubble)"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && searchQuery.trim()) {
                              startImport();
                            }
                          }}
                          className="pl-9 bg-space-800/50 border-space-700"
                        />
                      </div>
                      <Button
                        onClick={startImport}
                        disabled={isImporting || !searchQuery.trim()}
                        className="bg-cosmic-blue hover:bg-cosmic-blue/80"
                      >
                        搜索
                      </Button>
                    </div>
                    <p className="text-space-500 text-xs">输入 NORAD ID 精确查找，或输入名称模糊搜索</p>
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-space-700" />
                    <span className="text-space-500 text-xs">或按分类批量导入</span>
                    <div className="flex-1 h-px bg-space-700" />
                  </div>

                  {/* Category selection */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {CELESTRAK_CATEGORIES.map((category) => (
                      <button
                        key={category.name}
                        onClick={() => {
                          setSelectedCategory(category.name);
                          setSearchQuery('');
                        }}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          selectedCategory === category.name && !searchQuery
                            ? 'border-cosmic-blue bg-cosmic-blue/20'
                            : 'border-space-700 bg-space-800/30 hover:bg-space-700/50 hover:border-space-600'
                        }`}
                      >
                        <p className="text-space-100 font-medium text-sm">{category.label}</p>
                        <p className="text-space-500 text-xs mt-1">{category.description}</p>
                      </button>
                    ))}
                  </div>

                  {/* Start import button for category mode */}
                  {!searchQuery.trim() && (
                    <div className="flex justify-end gap-3 pt-2">
                      <Button
                        variant="outline"
                        className="bg-space-800/50 hover:bg-space-700/50 border-space-700"
                        onClick={handleClose}
                      >
                        取消
                      </Button>
                      <Button
                        onClick={startImport}
                        disabled={isImporting || (!searchQuery.trim() && !selectedCategory)}
                        className="bg-cosmic-blue hover:bg-cosmic-blue/80"
                      >
                        {isImporting ? (
                          <span className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            导入中...
                          </span>
                        ) : (
                          '开始导入'
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {importMode === 'file' && (
                <div className="space-y-3">
                  <p className="text-space-400 text-sm">上传 TLE 文件（.txt 或 .tle）：</p>
                  <div
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                      uploadFile
                        ? 'border-cosmic-blue bg-cosmic-blue/10'
                        : 'border-space-700 bg-space-800/30 hover:border-space-600 hover:bg-space-700/30'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,.tle"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <Upload className={`h-8 w-8 mx-auto mb-3 ${uploadFile ? 'text-cosmic-blue' : 'text-space-500'}`} />
                    {uploadFile ? (
                      <>
                        <p className="text-cosmic-blue font-medium">{uploadFile.name}</p>
                        <p className="text-space-500 text-xs mt-1">{(uploadFile.size / 1024).toFixed(2)} KB</p>
                      </>
                    ) : (
                      <>
                        <p className="text-space-300 text-sm">点击或拖拽文件到此处</p>
                        <p className="text-space-500 text-xs mt-1">支持 .txt 和 .tle 格式</p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {importMode === 'file' && (
                <div className="flex justify-end gap-3 mt-6">
                  <Button
                    variant="outline"
                    className="bg-space-800/50 hover:bg-space-700/50 border-space-700"
                    onClick={handleClose}
                  >
                    取消
                  </Button>
                  <Button
                    onClick={startImport}
                    disabled={isImporting}
                    className="bg-cosmic-blue hover:bg-cosmic-blue/80"
                  >
                    {isImporting ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        导入中...
                      </span>
                    ) : (
                      '开始导入'
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
