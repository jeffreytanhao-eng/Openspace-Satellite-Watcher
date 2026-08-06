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
  truncated?: boolean;
  limit?: number;
  skippedExisting?: number;   // 因 NORAD ID 已入库而跳过（支持分批导入）
  skippedNonPayload?: number;  // 因非 PAYLOAD（碎片/火箭体）被过滤
}

interface ImportedSatellite {
  noradId: number;
  name: string;
  line1: string;
  line2: string;
  // 完整元数据字段（星座导入 API 返回，搜索模式不返回这些字段所以都设为可选）
  // 让前端 normalizeSatellite 直接消费，避免 fallback 到 inferCountryFromName 推断
  country?: string | null;
  objectType?: string;
  launchDate?: string | null;
  launchSite?: string | null;
  owner?: string | null;
  isActive?: boolean;
  model3dUrl?: string | null;
  imageUrl?: string | null;
}

export interface ImportSummary {
  imported: number;
  skipped: number;
  remaining: number;
  message?: string;
}

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (satellites?: ImportedSatellite[]) => Promise<ImportSummary | void> | ImportSummary | void;
  onFileImport?: (file: File) => Promise<ImportSummary>;
  // 星座导入已写入数据库，前端将返回的卫星 merge 到当前视图（不替换全部）
  onConstellationImported?: (satellites?: ImportedSatellite[]) => Promise<void> | void;
  importLimit?: number;
  totalLimit?: number;
  currentCount?: number;
}

type ImportMode = 'celestrak' | 'file';

export default function ImportModal({
  isOpen,
  onClose,
  onSuccess,
  onFileImport,
  onConstellationImported,
  importLimit = 100,
  totalLimit = 200,
  currentCount = 0,
}: ImportModalProps) {
  const [importMode, setImportMode] = useState<ImportMode>('celestrak');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConstellation, setSelectedConstellation] = useState<string>('');
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
    setSelectedConstellation('');
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

  const CONSTELLATIONS = [
    { name: 'Starlink', label: 'Starlink', description: 'SpaceX Starlink 星座（截断至100颗）' },
    { name: 'GPS', label: 'GPS', description: '美国 GPS 导航星座' },
    { name: 'GLONASS', label: 'GLONASS', description: '俄罗斯 GLONASS 导航星座' },
    { name: 'Galileo', label: 'Galileo', description: '欧洲 Galileo 导航星座' },
    { name: '北斗', label: '北斗', description: '中国北斗导航星座' },
    { name: '风云', label: '风云', description: '中国遥感卫星' },
    { name: 'SBIRS', label: 'SBIRS', description: '美国军用导弹预警卫星' },
    { name: 'SKYNET', label: 'SKYNET', description: '英国军事通信卫星' },
  ];

  const startImport = async () => {
    setIsImporting(true);
    setProgress(0);
    setImportResult(null);
    setError(null);

    // 检查总数限制
    if (currentCount >= totalLimit) {
      setError(`当前已有 ${currentCount} 颗卫星，已达到上限 ${totalLimit} 颗。请先删除一些卫星再导入。`);
      setIsImporting(false);
      return;
    }

    try {
      if (importMode === 'file' && onFileImport && uploadFile) {
        setProgress(50);
        const summary = await onFileImport(uploadFile);
        setProgress(100);
        setImportResult({
          total: summary.imported + summary.skipped,
          success: summary.imported,
          failed: 0,
          failures: [],
        });
        setImportSummary(summary);
        return;
      }

      let response;
      setProgress(30);

      if (importMode === 'celestrak') {
        if (searchQuery.trim()) {
          response = await apiClient.searchTLEFromCelestrak(searchQuery.trim());
        } else if (selectedConstellation) {
          response = await apiClient.importTLEFromConstellation(selectedConstellation);
        } else {
          setError('请输入 NORAD ID/名称或选择星座');
          setIsImporting(false);
          return;
        }
      }

      // 星座导入已写入数据库：触发前端从DB重新加载（不调用 onSuccess 临时添加，避免重复）
      const isConstellationImport = importMode === 'celestrak' && !!selectedConstellation && !searchQuery.trim();

      if (!response) {
        setError('无响应数据');
        return;
      }

      setProgress(100);

      if (response.success && response.data) {
        const data = response.data as { importReport?: ImportResult; satellites?: ImportedSatellite[] };
        const report = data.importReport;

        // 应用导入上限（单批100颗）
        let satellites = data.satellites || [];
        let truncated = false;
        if (satellites.length > importLimit) {
          satellites = satellites.slice(0, importLimit);
          truncated = true;
        }

        // 检查总数限制
        const availableSlots = totalLimit - currentCount;
        if (satellites.length > availableSlots) {
          satellites = satellites.slice(0, availableSlots);
          truncated = true;
        }

        setImportResult({
          total: report?.total || satellites.length,
          success: satellites.length,
          failed: report?.failed || 0,
          failures: report?.failures || [],
          truncated: truncated || !!report?.truncated,
          limit: importLimit,
          skippedExisting: report?.skippedExisting ?? 0,
          skippedNonPayload: report?.skippedNonPayload ?? 0,
        });

        if (isConstellationImport) {
          // 星座导入：后端已写入数据库，前端只需重新加载
          // skipped 汇总：已入库跳过 + 非 PAYLOAD 过滤
          const skippedExisting = report?.skippedExisting ?? 0;
          const skippedNonPayload = report?.skippedNonPayload ?? 0;
          const totalSkipped = skippedExisting + skippedNonPayload;

          // 拼接提示消息：区分截断 / 已全部导入 / 非 PAYLOAD 过滤
          const parts: string[] = [];
          if (skippedNonPayload > 0) {
            parts.push(`已过滤 ${skippedNonPayload} 颗非有效载荷（碎片/火箭体）`);
          }
          if (satellites.length === 0 && skippedExisting > 0) {
            parts.push('该星座所有卫星已导入，无需重复操作');
          } else {
            parts.push(`已永久保存 ${satellites.length} 颗到数据库`);
          }
          if (truncated) {
            parts.push('超出部分已截断');
          }

          setImportSummary({
            imported: satellites.length,
            skipped: totalSkipped,
            remaining: truncated ? satellites.length - importLimit : 0,
            message: parts.join('；'),
          });
          await onConstellationImported?.(satellites);
        } else {
          // 搜索模式：临时添加到前端
          if (satellites.length > 0) {
            const summary = await onSuccess?.(satellites);
            if (summary) {
              setImportSummary(summary);
            }
          } else {
            await onSuccess?.();
          }
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
    setSelectedConstellation('');
    setUploadFile(null);
    setProgress(0);
    setImportResult(null);
    setImportSummary(null);
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-space-950/80 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-2xl mx-4 max-h-[90vh] bg-space-900 border border-space-700 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-space-700 shrink-0">
          <h2 className="text-space-100 font-semibold text-lg">批量导入卫星数据</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-space-400 hover:text-space-100 hover:bg-space-700/50" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          {/* 容量提示 */}
          <div className="mb-4 p-2 bg-space-800/50 rounded-lg text-xs text-space-500 flex justify-between">
            <span>当前已有 {currentCount} 颗卫星</span>
            <span>上限 {totalLimit} 颗</span>
          </div>

          {/* 提示：星座导入永久保存到数据库 */}
          <div className="mb-4 p-2 bg-space-800/50 rounded-lg text-xs text-space-500">
            星座导入会永久保存到数据库，刷新页面不会丢失。
            <br />单次导入最多 {importLimit} 颗，总数不超过 {totalLimit} 颗。
          </div>

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

              {importResult.truncated && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-yellow-400 text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  为保证性能，结果已截断至 {importResult.limit} 颗卫星
                </div>
              )}

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
                      <p className="text-space-400 text-xs">超出限制</p>
                    </div>
                  </div>
                  {importSummary.message && (
                    <p className="text-yellow-400 text-xs mt-3 text-center">{importSummary.message}</p>
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
                      <div key={index} className="flex items-start gap-3 bg-space-700/30 rounded-lg p-3">
                        <XCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-space-100 text-sm font-medium truncate">{failure.name}</span>
                            <span className="text-space-500 text-xs">NORAD: {failure.noradId}</span>
                          </div>
                          <p className="text-red-400 text-xs">{failure.reason}</p>
                        </div>
                      </div>
                    ))}
                    {importResult.failures.length > 20 && (
                      <p className="text-space-500 text-xs text-center py-2">还有 {importResult.failures.length - 20} 条失败记录未显示</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button variant="outline" className="bg-space-800/50 hover:bg-space-700/50 border-space-700" onClick={resetImport}>继续导入</Button>
                <Button onClick={handleClose}>关闭</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-6 p-1 bg-space-800/50 rounded-lg">
                <button
                  onClick={() => setImportMode('celestrak')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    importMode === 'celestrak' ? 'bg-cosmic-blue text-white shadow-lg' : 'text-space-400 hover:text-space-100 hover:bg-space-700/50'
                  }`}
                >
                  <Download className="h-4 w-4" />
                  导入美国Celestrack数据
                </button>
                <button
                  onClick={() => setImportMode('file')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    importMode === 'file' ? 'bg-cosmic-blue text-white shadow-lg' : 'text-space-400 hover:text-space-100 hover:bg-space-700/50'
                  }`}
                >
                  <Upload className="h-4 w-4" />
                  上传国产AOE卫星数据
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
                    <div className="h-full bg-gradient-to-r from-cosmic-blue to-cosmic-purple transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}

              {importMode === 'celestrak' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-space-400 text-sm">按 NORAD ID 或名称搜索：</p>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-space-500" />
                        <Input
                          type="text"
                          placeholder="NORAD ID (如 25544) 或名称 (如 Hubble)"
                          value={searchQuery}
                          onChange={(e) => { setSearchQuery(e.target.value); setSelectedConstellation(''); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' && searchQuery.trim()) startImport(); }}
                          className="pl-9 bg-space-800/50 border-space-700"
                        />
                      </div>
                      <Button onClick={startImport} disabled={isImporting || !searchQuery.trim()} className="bg-cosmic-blue hover:bg-cosmic-blue/80">搜索</Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-space-700" />
                    <span className="text-space-500 text-xs">按星座导入</span>
                    <div className="flex-1 h-px bg-space-700" />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {CONSTELLATIONS.map((c) => (
                      <button
                        key={c.name}
                        onClick={() => { setSelectedConstellation(c.name); setSearchQuery(''); }}
                        className={`p-2 rounded-lg border text-left transition-all text-sm ${
                          selectedConstellation === c.name ? 'border-cosmic-blue bg-cosmic-blue/20' : 'border-space-700 bg-space-800/30 hover:bg-space-700/50'
                        }`}
                      >
                        <p className="text-space-100 font-medium">{c.label}</p>
                        <p className="text-space-500 text-xs mt-0.5">{c.description}</p>
                      </button>
                    ))}
                  </div>

                  {!searchQuery.trim() && (
                    <div className="flex justify-end gap-3 pt-2">
                      <Button variant="outline" className="bg-space-800/50 hover:bg-space-700/50 border-space-700" onClick={handleClose}>取消</Button>
                      <Button onClick={startImport} disabled={isImporting || (!searchQuery.trim() && !selectedConstellation)} className="bg-cosmic-blue hover:bg-cosmic-blue/80">
                        {isImporting ? <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />导入中...</span> : '开始导入'}
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
                      uploadFile ? 'border-cosmic-blue bg-cosmic-blue/10' : 'border-space-700 bg-space-800/30 hover:border-space-600 hover:bg-space-700/30'
                    }`}
                  >
                    <input ref={fileInputRef} type="file" accept=".txt,.tle" onChange={handleFileChange} className="hidden" />
                    <Upload className={`h-8 w-8 mx-auto mb-3 ${uploadFile ? 'text-cosmic-blue' : 'text-space-500'}`} />
                    {uploadFile ? (
                      <>
                        <p className="text-cosmic-blue font-medium">{uploadFile.name}</p>
                        <p className="text-space-500 text-xs mt-1">{(uploadFile.size / 1024).toFixed(2)} KB</p>
                      </>
                    ) : (
                      <>
                        <p className="text-space-300 text-sm">点击或拖拽文件到此处</p>
                        <p className="text-space-500 text-xs mt-1">支持 .txt 和 .tle 格式，客户端解析不上传</p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {importMode === 'file' && (
                <div className="flex justify-end gap-3 mt-6">
                  <Button variant="outline" className="bg-space-800/50 hover:bg-space-700/50 border-space-700" onClick={handleClose}>取消</Button>
                  <Button onClick={startImport} disabled={isImporting || !uploadFile} className="bg-cosmic-blue hover:bg-cosmic-blue/80">
                    {isImporting ? <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />导入中...</span> : '开始导入'}
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
