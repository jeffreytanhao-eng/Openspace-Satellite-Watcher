'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ViewSwitcher, TimeControlBar, SatelliteList, FilterPanel, SearchBar, SatelliteDetailPanel, ImportModal, TagManager, AudioPlayer } from '@/components/ui';
import type { ImportSummary } from '@/components/ui/ImportModal';
import { useSatelliteStore, useSatellites, useSelectedSatellite, useVisibleSatellites, useViewMode } from '@/store/satelliteStore';
import { useTimeStore } from '@/store/timeStore';
import type { SpaceObject } from '@/store/satelliteStore';
import type { FilterState } from '@/components/ui/FilterPanel';
import { createSatrec, calculateOrbitParams } from '@/lib/tle/orbit';
import { translateCountry } from '@/lib/translations';
import { buildSatellitesFromTLE, parseTLETextClient, IMPORT_LIMIT_PER_BATCH, MAX_TOTAL_SATELLITES } from '@/lib/default-satellites';
import { apiClient } from '@/lib/api/client';
import { Upload, Tags, RefreshCw, RotateCcw, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CesiumGlobe = dynamic(() => import('@/components/visualization/CesiumGlobe'), {
  ssr: false,
  loading: () => <div className="h-full flex items-center justify-center text-space-400">加载 3D 引擎...</div>,
});

const MapLibreMap = dynamic(() => import('@/components/visualization/MapLibreMap'), {
  ssr: false,
  loading: () => <div className="h-full flex items-center justify-center text-space-400">加载地图...</div>,
});

export interface Tag { id: string; name: string; color: string; }

function inferCountry(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes('CSS') || upper.includes('TIANHE') || upper.includes('WENTIAN') || upper.includes('MENGTIAN')) return 'CHN';
  if (upper.includes('BEIDOU') || upper.includes('BD-')) return 'CHN';
  if (upper.includes('ISS') || upper.includes('ZARYA')) return 'INT';
  if (upper.includes('STARLINK') || upper.includes('FALCON')) return 'USA';
  if (upper.includes('GPS') || upper.includes('NOAA') || upper.includes('TERRA') || upper.includes('AQUA') || upper.includes('HST') || upper.includes('LANDSAT') || upper.includes('AURA')) return 'USA';
  if (upper.includes('SENTINEL')) return 'EU';
  if (upper.includes('GLONASS') || upper.includes('SOYUZ') || upper.includes('PROGRESS')) return 'RUS';
  return 'Unknown';
}

function normalizeSatellite(raw: any): SpaceObject {
  const tleData = (raw.tleData || []).map((t: any) => ({
    id: t.id, name: t.name || raw.name, line1: t.line1, line2: t.line2,
    epoch: new Date(t.epoch),
  }));
  return {
    id: raw.id || `db-${raw.noradId}`,
    noradId: Number(raw.noradId), name: raw.name,
    country: raw.country || inferCountry(raw.name),
    objectType: raw.objectType || 'PAYLOAD',
    launchDate: raw.launchDate ? new Date(raw.launchDate) : null,
    launchSite: raw.launchSite || null, owner: raw.owner || null,
    isActive: raw.isActive !== false,
    model3dUrl: raw.model3dUrl || null, imageUrl: raw.imageUrl || null,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : new Date(),
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : new Date(),
    tleData: tleData.length > 0 ? tleData : [], tags: raw.tags || [],
  };
}

// 全局密码输入弹窗（用于 TLE 刷新、图片上传等需要密码的操作）
function PasswordModal({
  isOpen, onClose, onSubmit, title, description,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (password: string) => void;
  title: string;
  description?: string;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (isOpen) { setPassword(''); setError(null); } }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!password.trim()) { setError('请输入密码'); return; }
    onSubmit(password);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-space-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-space-900 border border-space-700 rounded-xl p-6 w-80 shadow-2xl">
        <h3 className="text-space-100 font-semibold mb-2 flex items-center gap-2">
          <Lock className="h-5 w-5 text-cosmic-blue" /> {title}
        </h3>
        {description && <p className="text-space-500 text-xs mb-4">{description}</p>}
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="请输入操作密码"
          autoFocus
          className="w-full px-3 py-2 bg-space-800 border border-space-700 rounded-lg text-space-100 text-sm focus:outline-none focus:border-cosmic-blue"
        />
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        <div className="flex gap-2 mt-4 justify-end">
          <Button variant="outline" size="sm" className="bg-space-800/50 border-space-700" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!password.trim()}>确认</Button>
        </div>
      </div>
    </div>
  );
}

const SAVED_PASSWORD_KEY = 'satellite-op-password';

export default function HomePage() {
  const searchParams = useSearchParams();
  const viewMode = useViewMode();
  const setViewMode = useSatelliteStore(state => state.setViewMode);

  const allSatellites = useSatellites();
  const selectedSatellite = useSelectedSatellite();
  const visibleSatellites = useVisibleSatellites();
  const setSatellites = useSatelliteStore(state => state.setSatellites);
  const addSatellitesAction = useSatelliteStore(state => state.addSatellites);
  const removeSatellite = useSatelliteStore(state => state.removeSatellite);
  const removeSatellites = useSatelliteStore(state => state.removeSatellites);
  const setSelectedSatellite = useSatelliteStore(state => state.setSelectedSatellite);
  const setVisibleSatellites = useSatelliteStore(state => state.setVisibleSatellites);
  const clearOrbitCache = useSatelliteStore(state => state.clearOrbitCache);
  const updateSatelliteImage = useSatelliteStore(state => state.updateSatelliteImage);

  const [isLoading, setIsLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(480);
  const isResizing = useRef(false);
  const [filters, setFilters] = useState<FilterState>({
    noradId: '', name: '', country: '', objectType: '', launchYear: '',
    minAltitude: 0, maxAltitude: 40000, isActive: '',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);

  const [showImportModal, setShowImportModal] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [isRefreshingTLE, setIsRefreshingTLE] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  // 密码弹窗状态
  const [passwordModal, setPasswordModal] = useState<{
    isOpen: boolean; action: 'refreshTLE' | 'uploadImage'; noradId?: number; file?: File;
  }>({ isOpen: false, action: 'refreshTLE' });
  const startPlayback = useTimeStore(state => state.startPlayback);

  // 初始化：从数据库加载默认卫星
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const [satsResp, tagsResp] = await Promise.all([
          apiClient.getSpaceObjects(), apiClient.getTags(),
        ]);
        const dbSats = (satsResp.data || []).map(normalizeSatellite);
        setSatellites(dbSats);
        setVisibleSatellites(dbSats.map(s => s.noradId));
        setTags((tagsResp.data || []).map((t: any) => ({ id: t.id, name: t.name, color: t.color })));
      } catch (err) {
        console.error('Failed to load data:', err);
        const { getDefaultSatellites } = await import('@/lib/default-satellites');
        const defaults = getDefaultSatellites();
        setSatellites(defaults);
        setVisibleSatellites(defaults.map(s => s.noradId));
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [setSatellites, setVisibleSatellites]);

  useEffect(() => {
    const viewParam = searchParams.get('view');
    if (viewParam === '2d' || viewParam === '3d') setViewMode(viewParam);
  }, [searchParams, setViewMode]);

  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => startPlayback(), 500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, startPlayback]);

  // 普通导入：临时添加到前端（不写DB，刷新恢复默认）
  const handleImportSuccess = useCallback((importedSatellites?: { noradId: number; name: string; line1: string; line2: string }[]): ImportSummary | void => {
    if (!importedSatellites || importedSatellites.length === 0) return;
    const existingIds = new Set(allSatellites.map(s => s.noradId));
    const uniqueNew = importedSatellites.filter(sat => !existingIds.has(sat.noradId));
    const skippedCount = importedSatellites.length - uniqueNew.length;
    const toImport = uniqueNew.slice(0, IMPORT_LIMIT_PER_BATCH);
    const truncated = uniqueNew.length > IMPORT_LIMIT_PER_BATCH;
    const newSats = buildSatellitesFromTLE(toImport, existingIds);
    addSatellitesAction(newSats);
    setVisibleSatellites([...visibleSatellites, ...newSats.map(s => s.noradId)]);
    return {
      imported: newSats.length, skipped: skippedCount,
      remaining: truncated ? uniqueNew.length - toImport.length : 0,
      message: truncated
        ? `临时显示 ${newSats.length} 颗，超出部分已忽略（刷新页面恢复默认）`
        : `临时添加 ${newSats.length} 颗（刷新页面恢复默认）`,
    };
  }, [allSatellites, visibleSatellites, addSatellitesAction, setVisibleSatellites]);

  const handleFileImport = useCallback(async (file: File): Promise<ImportSummary> => {
    const text = await file.text();
    const parsed = parseTLETextClient(text);
    if (parsed.length === 0) return { imported: 0, skipped: 0, remaining: 0, message: '文件中未找到有效的 TLE 数据' };
    const result = handleImportSuccess(parsed);
    return result || { imported: 0, skipped: 0, remaining: 0 };
  }, [handleImportSuccess]);

  // TLE 刷新：需要密码验证
  const handleRefreshTLE = async () => {
    const savedPw = typeof window !== 'undefined' ? sessionStorage.getItem(SAVED_PASSWORD_KEY) : null;
    if (savedPw) {
      await doRefreshTLE(savedPw);
    } else {
      setPasswordModal({ isOpen: true, action: 'refreshTLE' });
    }
  };

  const doRefreshTLE = async (password: string) => {
    if (allSatellites.length === 0 || isRefreshingTLE) return;
    setPasswordModal(m => ({ ...m, isOpen: false }));
    sessionStorage.setItem(SAVED_PASSWORD_KEY, password);
    setIsRefreshingTLE(true);
    setRefreshMessage(null);
    try {
      const headers: Record<string, string> = { 'x-admin-password': password };
      const resp = await fetch('/api/tle/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({}),
      });
      const result = await resp.json();
      if (resp.status === 401) {
        sessionStorage.removeItem(SAVED_PASSWORD_KEY);
        setRefreshMessage('密码错误，请重试');
        return;
      }
      if (!result.success) { setRefreshMessage(`刷新失败: ${result.error}`); return; }
      const { updated, failed, updatedCount, failedCount, total } = result.data;
      if (updatedCount === 0) { setRefreshMessage('未能获取任何卫星的最新 TLE 数据'); return; }
      const tleMap = new Map<number, { name: string; line1: string; line2: string }>();
      for (const t of updated) tleMap.set(t.noradId, t);
      const updatedSatellites = allSatellites.map(sat => {
        const newTle = tleMap.get(sat.noradId);
        if (newTle) return { ...sat, name: newTle.name, tleData: [{ name: newTle.name, line1: newTle.line1, line2: newTle.line2, epoch: new Date() }] };
        return sat;
      });
      setSatellites(updatedSatellites);
      clearOrbitCache();
      const failedInfo = failedCount > 0 ? `，${failedCount} 颗失败` : '';
      setRefreshMessage(`已刷新 ${updatedCount}/${total} 颗卫星的 TLE 数据${failedInfo}，已保存到数据库`);
    } catch {
      setRefreshMessage('刷新失败，请检查网络连接');
    } finally {
      setIsRefreshingTLE(false);
      setTimeout(() => setRefreshMessage(null), 5000);
    }
  };

  // 图片上传：需要密码验证（写入DB永久保存）
  const handleImageUploadRequest = (noradId: number, file: File) => {
    const savedPw = typeof window !== 'undefined' ? sessionStorage.getItem(SAVED_PASSWORD_KEY) : null;
    if (savedPw) {
      doImageUpload(noradId, file, savedPw);
    } else {
      setPasswordModal({ isOpen: true, action: 'uploadImage', noradId, file });
    }
  };

  const doImageUpload = async (noradId: number, file: File, password: string) => {
    setPasswordModal(m => ({ ...m, isOpen: false }));
    sessionStorage.setItem(SAVED_PASSWORD_KEY, password);
    try {
      const resp = await apiClient.uploadSatelliteImage(noradId, file, password);
      if (resp.success && resp.data) {
        updateSatelliteImage(noradId, (resp.data as any).imageUrl);
      }
    } catch (e) {
      if ((e as Error).message.includes('401') || (e as Error).message.includes('权限')) {
        sessionStorage.removeItem(SAVED_PASSWORD_KEY);
      }
      console.error('Image upload failed:', e);
    }
  };

  // 重置为数据库默认数据
  const handleReset = useCallback(async () => {
    setIsLoading(true);
    try {
      const resp = await apiClient.getSpaceObjects();
      const dbSats = (resp.data || []).map(normalizeSatellite);
      setSatellites(dbSats);
      setVisibleSatellites(dbSats.map(s => s.noradId));
      setSelectedSatellite(null);
      clearOrbitCache();
    } finally { setIsLoading(false); }
  }, [setSatellites, setVisibleSatellites, setSelectedSatellite, clearOrbitCache]);

  // 删除始终是临时的（不调用DB）
  const handleDeleteSatellite = (noradId: number) => removeSatellite(noradId);
  const handleBatchDelete = (noradIds: number[]) => removeSatellites(noradIds);

  const calculateAltitude = (satellite: SpaceObject): number | null => {
    if (!satellite.tleData || satellite.tleData.length === 0) return null;
    try {
      const satrec = createSatrec(satellite.tleData[0]);
      const params = calculateOrbitParams(satrec);
      return Math.round((params.perigeeAltitude + params.apogeeAltitude) / 2);
    } catch { return null; }
  };

  const filteredSatellites = useMemo(() => {
    return allSatellites.filter(satellite => {
      if (filters.noradId && !satellite.noradId.toString().includes(filters.noradId)) return false;
      if (filters.name && !satellite.name.toLowerCase().includes(filters.name.toLowerCase())) return false;
      if (filters.country) {
        const KNOWN_COUNTRIES = ['中国', '美国', '俄罗斯', '欧洲', '日本', '印度'];
        const codes = (satellite.country || '').split('/').map(c => c.trim()).filter(Boolean);
        const translated = codes.map(code => translateCountry(code)).filter(Boolean) as string[];
        if (filters.country === '其他') {
          if (translated.some(c => KNOWN_COUNTRIES.includes(c))) return false;
        } else { if (!translated.includes(filters.country)) return false; }
      }
      const typeMap: Record<string, string> = { '有效载荷': 'PAYLOAD', '火箭体': 'ROCKET_BODY', '碎片': 'DEBRIS', '未知': 'UNKNOWN' };
      if (filters.objectType && satellite.objectType !== typeMap[filters.objectType]) return false;
      if (filters.launchYear && satellite.launchDate) {
        const launchYear = new Date(satellite.launchDate).getFullYear().toString();
        if (launchYear !== filters.launchYear) return false;
      }
      if (filters.isActive) {
        if (satellite.isActive !== (filters.isActive === 'active')) return false;
      }
      const altitude = calculateAltitude(satellite);
      if (altitude !== null && (altitude < filters.minAltitude || altitude > filters.maxAltitude)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!satellite.name.toLowerCase().includes(q) && !satellite.noradId.toString().includes(q)) return false;
      }
      return true;
    });
  }, [allSatellites, filters, searchQuery]);

  const handleSatelliteClick = (satellite: SpaceObject) => setSelectedSatellite(satellite);
  const handleToggleVisibility = (noradId: number) => {
    setVisibleSatellites(visibleSatellites.includes(noradId) ? visibleSatellites.filter(id => id !== noradId) : [...visibleSatellites, noradId]);
  };
  const handleSelectAll = () => setVisibleSatellites(filteredSatellites.map(s => s.noradId));
  const handleDeselectAll = () => setVisibleSatellites([]);
  const handleBatchShow = (noradIds: number[]) => setVisibleSatellites([...new Set([...visibleSatellites, ...noradIds])]);
  const handleBatchHide = (noradIds: number[]) => setVisibleSatellites(visibleSatellites.filter(id => !noradIds.includes(id)));
  const handleFilterChange = (newFilters: FilterState) => setFilters(newFilters);
  const handleSearch = (query: string) => setSearchQuery(query);
  const getSatelliteTags = (_s: SpaceObject): Tag[] => [];

  const handlePasswordSubmit = (password: string) => {
    if (passwordModal.action === 'refreshTLE') {
      doRefreshTLE(password);
    } else if (passwordModal.action === 'uploadImage' && passwordModal.noradId && passwordModal.file) {
      doImageUpload(passwordModal.noradId, passwordModal.file, password);
    }
  };

  return (
    <div className="h-screen bg-space-950 flex flex-col overflow-hidden">
      <header className="h-16 bg-space-900/80 backdrop-blur-sm border-b border-space-800 flex items-center justify-between px-4 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cosmic-blue to-cosmic-purple flex items-center justify-center">
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="2.5" /><line x1="12" y1="5" x2="12" y2="9.5" /><line x1="12" y1="14.5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="9.5" y2="12" /><line x1="14.5" y1="12" x2="19" y2="12" />
              <rect x="3" y="10" width="3" height="4" rx="0.5" /><rect x="18" y="10" width="3" height="4" rx="0.5" />
              <path d="M12 9.5 L15 5 M12 9.5 L9 5 M12 14.5 L15 19 M12 14.5 L9 19" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-space-100">卫星守望者</h1>
            <p className="text-xs text-space-400">Satellite Watcher</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9 bg-space-800/50 hover:bg-space-700/50 border-space-700 text-space-300"
            onClick={handleRefreshTLE} disabled={isRefreshingTLE || allSatellites.length === 0}
            title="从 Celestrak 同步最新 TLE 轨道数据（需要密码）">
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshingTLE ? 'animate-spin' : ''}`} />
            {isRefreshingTLE ? '刷新中...' : '轨道数据刷新'}
          </Button>
          <Button variant="outline" size="sm" className="h-9 bg-space-800/50 hover:bg-space-700/50 border-space-700 text-space-300" onClick={() => setShowImportModal(true)}>
            <Upload className="h-4 w-4 mr-2" />导入数据
          </Button>
          <Button variant="outline" size="sm" className="h-9 bg-space-800/50 hover:bg-space-700/50 border-space-700 text-space-300" onClick={handleReset} title="重置为服务器默认卫星">
            <RotateCcw className="h-4 w-4 mr-2" />重置
          </Button>
          <Button variant="outline" size="sm" className="h-9 bg-space-800/50 hover:bg-space-700/50 border-space-700 text-space-300" onClick={() => setShowTagManager(true)}>
            <Tags className="h-4 w-4 mr-2" />标签管理
          </Button>
          <ViewSwitcher />
        </div>

        <button onClick={() => setShowSidebar(!showSidebar)} className="p-2 text-space-400 hover:text-cosmic-blue transition-colors">
          {showSidebar ? '◀' : '▶'}
        </button>
      </header>

      {refreshMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-space-800/95 backdrop-blur-sm border border-space-700 text-sm text-space-100 shadow-lg">
          {refreshMessage}
        </div>
      )}

      {allSatellites.length > 0 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 px-3 py-1 text-xs text-space-500 pointer-events-none">
          {allSatellites.length} 颗卫星（导入/删除仅本次有效 · TLE刷新和图片上传需密码）
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {showSidebar && (
          <>
          <aside style={{ width: sidebarWidth }} className="bg-space-900/50 border-r border-space-800 flex flex-col overflow-hidden shrink-0">
            <div className="p-3 border-b border-space-800">
              <SearchBar satellites={allSatellites} onSearch={handleSearch} onSelectSatellite={handleSatelliteClick} />
            </div>
            <div className="flex-1 flex overflow-hidden">
              <div className="w-48 border-r border-space-800 shrink-0">
                <FilterPanel satellites={allSatellites} onFilterChange={handleFilterChange} filteredCount={filteredSatellites.length} />
              </div>
              <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                {isLoading ? (
                  <div className="flex items-center justify-center flex-1"><div className="w-8 h-8 border-2 border-cosmic-blue border-t-transparent rounded-full animate-spin"></div></div>
                ) : (
                  <>
                    <div className="flex-1 overflow-hidden">
                      <SatelliteList
                        satellites={filteredSatellites} selectedSatellite={selectedSatellite}
                        visibleSatellites={visibleSatellites} onSelectSatellite={handleSatelliteClick}
                        onToggleVisibility={handleToggleVisibility} onSelectAll={handleSelectAll}
                        onDeselectAll={handleDeselectAll} onDeleteSatellite={handleDeleteSatellite}
                        onBatchShow={handleBatchShow} onBatchHide={handleBatchHide}
                        onBatchDelete={handleBatchDelete} tags={tags} getSatelliteTags={getSatelliteTags}
                      />
                    </div>
                    {selectedSatellite && (
                      <div className="border-t border-space-800 p-3">
                        <SatelliteDetailPanel
                          satellite={selectedSatellite} onClose={() => setSelectedSatellite(null)}
                          tags={tags} getSatelliteTags={getSatelliteTags}
                          onImageUploaded={(imageUrl) => updateSatelliteImage(selectedSatellite.noradId, imageUrl)}
                          onImageUploadRequest={handleImageUploadRequest}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </aside>
          <div
            onMouseDown={(e) => {
              e.preventDefault(); isResizing.current = true;
              const startX = e.clientX; const startWidth = sidebarWidth;
              const handleMM = (ev: MouseEvent) => { if (!isResizing.current) return; setSidebarWidth(Math.max(320, Math.min(800, startWidth + (ev.clientX - startX)))); };
              const handleMU = () => { isResizing.current = false; document.removeEventListener('mousemove', handleMM); document.removeEventListener('mouseup', handleMU); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
              document.addEventListener('mousemove', handleMM); document.addEventListener('mouseup', handleMU); document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
            }}
            className="w-1 bg-space-700 hover:bg-cosmic-blue/50 cursor-col-resize shrink-0 transition-colors"
          />
          </>
        )}

        <main className="flex-1 relative overflow-hidden min-h-0">
          {viewMode === '3d' ? (
            <CesiumGlobe satellites={allSatellites} selectedSatellite={selectedSatellite} visibleSatellites={visibleSatellites} />
          ) : (
            <MapLibreMap satellites={allSatellites} selectedSatellite={selectedSatellite} visibleSatellites={visibleSatellites} onSatelliteClick={handleSatelliteClick} />
          )}
          <div className="absolute top-4 right-4 bg-space-900/80 backdrop-blur-sm border border-space-700 rounded-lg p-3 text-xs text-space-400 z-20">
            <div className="flex items-center gap-2 mb-2"><div className="w-3 h-3 rounded-full bg-cosmic-blue"></div><span>卫星</span></div>
            <div className="flex items-center gap-2 mb-2"><div className="w-6 h-0.5 bg-cosmic-blue/50"></div><span>轨道</span></div>
            <div className="flex items-center gap-2"><div className="w-6 h-0.5 bg-cosmic-blue/20"></div><span>预测轨道</span></div>
          </div>
        </main>
      </div>

      <TimeControlBar />

      <ImportModal
        isOpen={showImportModal} onClose={() => setShowImportModal(false)}
        onSuccess={handleImportSuccess} onFileImport={handleFileImport}
        importLimit={IMPORT_LIMIT_PER_BATCH} totalLimit={MAX_TOTAL_SATELLITES} currentCount={allSatellites.length}
      />

      <TagManager isOpen={showTagManager} onClose={() => setShowTagManager(false)} />

      <PasswordModal
        isOpen={passwordModal.isOpen}
        onClose={() => setPasswordModal(m => ({ ...m, isOpen: false }))}
        onSubmit={handlePasswordSubmit}
        title={passwordModal.action === 'refreshTLE' ? 'TLE 轨道数据刷新' : '上传图片'}
        description={passwordModal.action === 'refreshTLE'
          ? '刷新操作将批量请求 Celestrak 获取最新 TLE 数据，请输入操作密码。'
          : '图片将永久保存到服务器，请输入操作密码。'}
      />

      <AudioPlayer />
    </div>
  );
}
