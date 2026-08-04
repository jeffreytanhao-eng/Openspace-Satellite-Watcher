'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ViewSwitcher, TimeControlBar, SatelliteList, SearchBar, SatelliteDetailPanel, ImportModal } from '@/components/ui';
import type { ImportSummary } from '@/components/ui/ImportModal';
import { useSatelliteStore, useSatellites, useSelectedSatellite, useVisibleSatellites, useViewMode } from '@/store/satelliteStore';
import { useTimeStore } from '@/store/timeStore';
import type { SpaceObject } from '@/store/satelliteStore';
import { buildSatellitesFromTLE, parseTLETextClient, IMPORT_LIMIT_PER_BATCH, MAX_TOTAL_SATELLITES } from '@/lib/default-satellites';
import { inferCountryFromName } from '@/lib/translations';
import { apiClient } from '@/lib/api/client';
import { Upload, RefreshCw, RotateCcw, Lock, Rocket, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MissionHeader from '@/components/trea/MissionHeader';
import TaskListPanel from '@/components/trea/TaskListPanel';
import TelemetryDashboard from '@/components/trea/TelemetryDashboard';
import ManeuverPanel from '@/components/trea/ManeuverPanel';
import MissionReportModal from '@/components/trea/MissionReportModal';
import TreaSatelliteView from '@/components/trea/TreaSatelliteView';
import CollisionAlertModal from '@/components/trea/CollisionAlertModal';
import { useTreaLastReport, useTreaMissionPhase, useTreaMissionStore, useLastAvoidanceExecution } from '@/store/treaMissionStore';
import type { TLEData } from '@/lib/tle/parser';

const CesiumGlobe = dynamic(() => import('@/components/visualization/CesiumGlobe'), {
  ssr: false,
  loading: () => <div className="h-full flex items-center justify-center text-space-400">加载 3D 引擎...</div>,
});

const MapLibreMap = dynamic(() => import('@/components/visualization/MapLibreMap'), {
  ssr: false,
  loading: () => <div className="h-full flex items-center justify-center text-space-400">加载地图...</div>,
});

function normalizeSatellite(raw: any): SpaceObject {
  const tleData = (raw.tleData || []).map((t: any) => ({
    id: t.id, name: t.name || raw.name, line1: t.line1, line2: t.line2,
    epoch: new Date(t.epoch),
  }));
  return {
    id: raw.id || `db-${raw.noradId}`,
    noradId: Number(raw.noradId), name: raw.name,
    country: raw.country || inferCountryFromName(raw.name),
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
  onSubmit: (password: string) => Promise<boolean> | boolean;
  title: string;
  description?: string;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => { if (isOpen) { setPassword(''); setError(null); setVerifying(false); } }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!password.trim()) { setError('请输入密码'); return; }
    setVerifying(true);
    setError(null);
    try {
      const ok = await onSubmit(password);
      if (!ok) {
        setError('密码错误');
        setVerifying(false);
      }
    } catch {
      setError('验证失败，请重试');
      setVerifying(false);
    }
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
          disabled={verifying}
          className="w-full px-3 py-2 bg-space-800 border border-space-700 rounded-lg text-space-100 text-sm focus:outline-none focus:border-cosmic-blue disabled:opacity-50"
        />
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        <div className="flex gap-2 mt-4 justify-end">
          <Button variant="outline" size="sm" className="bg-space-800/50 border-space-700" onClick={onClose} disabled={verifying}>取消</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!password.trim() || verifying}>{verifying ? '验证中...' : '确认'}</Button>
        </div>
      </div>
    </div>
  );
}

const SAVED_PASSWORD_KEY = 'satellite-op-password';

export default function HomePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
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
  const setTracking = useSatelliteStore(state => state.setTracking);
  const setVisibleSatellites = useSatelliteStore(state => state.setVisibleSatellites);
  const clearOrbitCache = useSatelliteStore(state => state.clearOrbitCache);
  const updateSatelliteImage = useSatelliteStore(state => state.updateSatelliteImage);

  const [isLoading, setIsLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(480);
  const isResizing = useRef(false);
  // TREA-01 任务中心模式:开启后隐藏原侧边栏与 header,渲染 MissionHeader 和任务专用 Cesium 视图
  const [missionMode, setMissionMode] = useState(false);
  // TREA-01 变轨事件:ManeuverPanel 执行变轨后设置,传递给 CesiumGlobe 渲染燃烧弧+轨道对比
  const [maneuverEvent, setManeuverEvent] = useState<{ newTle: TLEData; oldTle: TLEData; id: number } | null>(null);
  // 监听避撞机动执行(用户选择躲避计划后触发):同步到 maneuverEvent 让 CesiumGlobe 渲染变轨演示
  const lastAvoidanceExecution = useLastAvoidanceExecution();
  useEffect(() => {
    if (!lastAvoidanceExecution) return;
    setManeuverEvent({
      newTle: lastAvoidanceExecution.newTle,
      oldTle: lastAvoidanceExecution.oldTle,
      id: lastAvoidanceExecution.id,
    });
  }, [lastAvoidanceExecution]);
  // 右侧面板折叠状态:折叠时向右缩进,仅留窄条展开按钮
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  // TREA-01 任务报告模态框关闭状态(任务完成后弹出,用户关闭后不再自动弹出直到下次新任务完成)
  const [reportDismissed, setReportDismissed] = useState(false);
  // TREA-01 store:任务报告与阶段(用于驱动 MissionReportModal 显示)
  const treaLastReport = useTreaLastReport();
  const treaMissionPhase = useTreaMissionPhase();
  // 时间播放控制(退出任务中心时恢复缺省 10x 播放)
  const timeStartPlayback = useTimeStore(s => s.startPlayback);
  const timeResetToNow = useTimeStore(s => s.resetToNow);
  const timeSetRate = useTimeStore(s => s.setRate);
  const [searchQuery, setSearchQuery] = useState('');

  const [showImportModal, setShowImportModal] = useState(false);
  const [isRefreshingTLE, setIsRefreshingTLE] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  // TLE 刷新进度：{done, total, failed}，刷新期间实时更新，用于显示"已刷新 XX/YY 颗"
  const [refreshProgress, setRefreshProgress] = useState<{ done: number; total: number; failed: number } | null>(null);

  // 密码弹窗状态
  const [passwordModal, setPasswordModal] = useState<{
    isOpen: boolean; action: 'refreshTLE' | 'uploadImage' | 'advanced'; noradId?: number;
  }>({ isOpen: false, action: 'refreshTLE' });
  // 高级功能解锁状态：控制"轨道数据刷新"敏感按钮的可见性
  const [advancedUnlocked, setAdvancedUnlocked] = useState(false);
  // 图片上传授权时间戳（密码验证通过后递增，触发子组件打开文件选择器）
  const [uploadAuthTs, setUploadAuthTs] = useState<{ noradId: number; ts: number } | null>(null);
  const startPlayback = useTimeStore(state => state.startPlayback);

  // 初始化：从数据库加载默认卫星
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const satsResp = await apiClient.getSpaceObjects();
        const dbSats = (satsResp.data || []).map(normalizeSatellite);
        setSatellites(dbSats);
        setVisibleSatellites(dbSats.map(s => s.noradId));
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

  // ?mission=1 直接进入 TREA-01 任务中心(从 /cockpit 返回时使用)
  // 使用 exitingRef 防止退出时 effect 立即重新进入(因为 URL 仍含 ?mission=1)
  // 当 URL 清除 ?mission=1 后,exitingRef 重置为 false,下次 ?mission=1 可再次触发
  const exitingRef = useRef(false);
  useEffect(() => {
    const missionParam = searchParams.get('mission');
    if (missionParam === '1' && !missionMode && !exitingRef.current) {
      timeResetToNow();
      timeSetRate(10);
      timeStartPlayback();
      setReportDismissed(false);
      useTreaMissionStore.getState().setTrea01Tracking(true);
      setMissionMode(true);
    }
    // URL 不再含 ?mission=1 时重置退出标志
    if (missionParam !== '1') {
      exitingRef.current = false;
    }
  }, [searchParams, missionMode, timeResetToNow, timeSetRate, timeStartPlayback]);

  // 高级功能默认隐藏，用户必须点击"高级功能"按钮才能解锁
  // （即使 sessionStorage 中有密码，页面加载后也不自动解锁）
  // 解锁后，敏感操作（TLE刷新/图片上传/同步）可在本会话内复用密码，无需重复输入

  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => startPlayback(), 500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, startPlayback]);

  // 普通导入：临时添加到前端（仅用于按 NORAD ID/名称搜索场景；星座导入走 onConstellationImported 从DB重新加载）
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

  // 星座导入回调：将后端返回的星座卫星 merge 到当前视图（不替换 13 颗缺省卫星）
  // 后端已将数据写入数据库，这里只更新前端显示
  const handleConstellationImported = useCallback(async (
    importedSatellites?: { noradId: number; name: string; line1: string; line2: string }[]
  ) => {
    if (!importedSatellites || importedSatellites.length === 0) {
      clearOrbitCache();
      return;
    }
    try {
      // 过滤掉已在当前视图中的卫星（避免重复）
      const existingIds = new Set(allSatellites.map(s => s.noradId));
      // 将导入响应转换为 normalizeSatellite 期望的格式
      // 后端返回完整字段（country/imageUrl/objectType/launchDate 等），全部透传给 normalizeSatellite
      // 避免前端因缺失 country 而回退到 inferCountryFromName 推断（SBIRS/SKYNET 等可能推断为 UNK）
      const newSats = importedSatellites
        .filter(sat => !existingIds.has(sat.noradId))
        .map(sat => normalizeSatellite({
          noradId: sat.noradId,
          name: sat.name,
          country: sat.country,
          objectType: sat.objectType,
          launchDate: sat.launchDate,
          launchSite: sat.launchSite,
          owner: sat.owner,
          isActive: sat.isActive,
          model3dUrl: sat.model3dUrl,
          imageUrl: sat.imageUrl,
          tleData: [{ name: sat.name, line1: sat.line1, line2: sat.line2, epoch: new Date() }],
        }));
      if (newSats.length > 0) {
        // merge 到当前视图（不替换 13 颗缺省），同时扩展 visibleSatellites 让新卫星立即可见
        setSatellites([...allSatellites, ...newSats]);
        setVisibleSatellites([...visibleSatellites, ...newSats.map(s => s.noradId)]);
        console.log(`[HomePage] 星座导入：新增 ${newSats.length} 颗卫星，当前总数 ${allSatellites.length + newSats.length}`);
      } else {
        console.log('[HomePage] 星座导入：所有卫星已在当前视图中，跳过 merge');
      }
    } catch (err) {
      console.error('[HomePage] 星座导入回调异常：', err);
    }
    clearOrbitCache();
  }, [allSatellites, visibleSatellites, setSatellites, setVisibleSatellites, clearOrbitCache]);

  const handleFileImport = useCallback(async (file: File): Promise<ImportSummary> => {
    const text = await file.text();
    const parsed = parseTLETextClient(text);
    if (parsed.length === 0) return { imported: 0, skipped: 0, remaining: 0, message: '文件中未找到有效的 TLE 数据' };
    const result = handleImportSuccess(parsed);
    return result || { imported: 0, skipped: 0, remaining: 0 };
  }, [handleImportSuccess]);

  // 高级功能按钮：未解锁→弹密码框；已解锁→重新锁定
  const handleAdvancedClick = () => {
    if (advancedUnlocked) {
      setAdvancedUnlocked(false);
      return;
    }
    const savedPw = typeof window !== 'undefined' ? sessionStorage.getItem(SAVED_PASSWORD_KEY) : null;
    if (savedPw) {
      setAdvancedUnlocked(true);
    } else {
      setPasswordModal({ isOpen: true, action: 'advanced' });
    }
  };

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
    setRefreshProgress({ done: 0, total: allSatellites.length, failed: 0 });
    try {
      const resp = await fetch('/api/tle/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
        body: JSON.stringify({}),
      });
      // 401 密码错误：响应体仍是 JSON
      if (resp.status === 401) {
        sessionStorage.removeItem(SAVED_PASSWORD_KEY);
        setRefreshMessage('密码错误，请重试');
        return;
      }
      if (!resp.body) { setRefreshMessage('刷新失败：无响应流'); return; }

      // 读取 NDJSON 流：按行解析事件 {type:'start'|'progress'|'done'|'error', ...}
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let updated: { noradId: number; name: string; line1: string; line2: string }[] = [];
      let total = allSatellites.length;
      let updatedCount = 0;
      let failedCount = 0;
      let errorMsg: string | null = null;
      let streamEnded = false;

      while (!streamEnded) {
        const { done, value } = await reader.read();
        if (done) { streamEnded = true; }
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // 保留最后未满一行
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const evt = JSON.parse(line);
              if (evt.type === 'start') {
                total = evt.total;
                setRefreshProgress({ done: 0, total, failed: 0 });
              } else if (evt.type === 'progress') {
                setRefreshProgress({ done: evt.done, total: evt.total, failed: evt.failed });
              } else if (evt.type === 'done') {
                updated = evt.updated || [];
                total = evt.total;
                updatedCount = evt.updatedCount;
                failedCount = evt.failedCount;
                setRefreshProgress({ done: evt.updatedCount + evt.failedCount, total: evt.total, failed: evt.failedCount });
              } else if (evt.type === 'error') {
                errorMsg = evt.error;
              }
            } catch { /* ignore malformed line */ }
          }
        }
      }

      if (errorMsg) { setRefreshMessage(`刷新失败: ${errorMsg}`); return; }
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
      setRefreshProgress(null);
      setTimeout(() => setRefreshMessage(null), 5000);
    }
  };

  // 图片上传第一步：请求密码验证 -> 密码通过后触发子组件打开文件选择器
  const handleRequestUploadAuth = (noradId: number) => {
    const savedPw = typeof window !== 'undefined' ? sessionStorage.getItem(SAVED_PASSWORD_KEY) : null;
    if (savedPw) {
      // 密码已验证过，直接授权打开文件选择器
      setUploadAuthTs({ noradId, ts: Date.now() });
    } else {
      setPasswordModal({ isOpen: true, action: 'uploadImage', noradId });
    }
  };

  // 图片上传第二步：用户选完文件后，用已验证的密码上传到服务器
  const handleImageUploadFile = async (noradId: number, file: File) => {
    const password = typeof window !== 'undefined' ? sessionStorage.getItem(SAVED_PASSWORD_KEY) : null;
    if (!password) {
      window.dispatchEvent(new CustomEvent('satellite-image-upload-error', { detail: { noradId, error: '未验证密码，请重试' } }));
      return;
    }
    try {
      const resp = await apiClient.uploadSatelliteImage(noradId, file, password);
      if (resp.success && resp.data) {
        const respData = resp.data as any;
        if (respData.shared) {
          // 星座卫星:后端批量更新了同星座所有卫星的 imageUrl
          // 重新获取所有卫星数据,确保前端 store 一致(所有同星座卫星都有新图片)
          const refreshResp = await apiClient.getSpaceObjects();
          const dbSats = (refreshResp.data || []).map(normalizeSatellite);
          setSatellites(dbSats);
        } else {
          // 默认卫星(不属于星座):只更新当前卫星
          updateSatelliteImage(noradId, respData.imageUrl);
        }
        window.dispatchEvent(new CustomEvent('satellite-image-upload-success', {
          detail: { noradId, success: true, updatedCount: respData.updatedCount || 1 }
        }));
      } else {
        throw new Error((resp as any).error || '上传失败');
      }
    } catch (e) {
      const msg = (e as Error).message || '上传失败';
      if (msg.includes('401') || msg.includes('权限')) {
        sessionStorage.removeItem(SAVED_PASSWORD_KEY);
        window.dispatchEvent(new CustomEvent('satellite-image-upload-error', { detail: { noradId, error: '密码错误，请重新输入' } }));
      } else {
        window.dispatchEvent(new CustomEvent('satellite-image-upload-error', { detail: { noradId, error: msg } }));
      }
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

  // 简化后的过滤逻辑：仅按搜索框（NORAD ID 或名称）过滤，移除了左侧的 FilterPanel
  // 原有的国别/类型/状态/发射年份/轨道高度筛选已不再需要（数据已预导入为 PAYLOAD）
  const filteredSatellites = useMemo(() => {
    if (!searchQuery) return allSatellites;
    const q = searchQuery.toLowerCase();
    return allSatellites.filter(satellite =>
      satellite.name.toLowerCase().includes(q) ||
      satellite.noradId.toString().includes(q)
    );
  }, [allSatellites, searchQuery]);

  const handleSatelliteClick = (satellite: SpaceObject) => setSelectedSatellite(satellite);
  const handleToggleVisibility = (noradId: number) => {
    setVisibleSatellites(visibleSatellites.includes(noradId) ? visibleSatellites.filter(id => id !== noradId) : [...visibleSatellites, noradId]);
  };
  const handleSelectAll = () => setVisibleSatellites(filteredSatellites.map(s => s.noradId));
  const handleDeselectAll = () => setVisibleSatellites([]);
  const handleBatchShow = (noradIds: number[]) => setVisibleSatellites([...new Set([...visibleSatellites, ...noradIds])]);
  const handleBatchHide = (noradIds: number[]) => setVisibleSatellites(visibleSatellites.filter(id => !noradIds.includes(id)));
  const handleSearch = (query: string) => setSearchQuery(query);

  const handlePasswordSubmit = async (password: string): Promise<boolean> => {
    // 先验证密码是否正确（调用验证API）
    try {
      const verifyResp = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
      });
      if (verifyResp.status === 401) {
        sessionStorage.removeItem(SAVED_PASSWORD_KEY);
        return false;
      }
      if (!verifyResp.ok) return false;
    } catch {
      return false;
    }

    // 密码正确，执行对应操作
    sessionStorage.setItem(SAVED_PASSWORD_KEY, password);
    if (passwordModal.action === 'refreshTLE') {
      setPasswordModal(m => ({ ...m, isOpen: false }));
      doRefreshTLE(password);
    } else if (passwordModal.action === 'uploadImage' && passwordModal.noradId) {
      setPasswordModal(m => ({ ...m, isOpen: false }));
      // 密码验证通过，授权打开文件选择器
      setUploadAuthTs({ noradId: passwordModal.noradId, ts: Date.now() });
    } else if (passwordModal.action === 'advanced') {
      setPasswordModal(m => ({ ...m, isOpen: false }));
      setAdvancedUnlocked(true);
    }
    return true;
  };

  // ============================================================
  // TREA-01 任务中心:进入/退出与报告模态框控制
  // ============================================================
  // 进入任务中心:重置报告关闭状态 + 自动定位到 TREA-01(与"定位键"行为一致)
  const handleEnterMission = () => {
    setReportDismissed(false);
    // 进入即自动持续跟踪 TREA-01:相机锁定到卫星,与点击"定位键"后的显示相同
    useTreaMissionStore.getState().setTrea01Tracking(true);
    setMissionMode(true);
  };

  // 退出任务中心:恢复到态势感知主页缺省状态(10x 播放 + 默认卫星轨道可见)
  // 1. 设置 exitingRef 防止 effect 立即重新进入任务中心
  // 2. 清除 URL 中的 ?mission=1(防止 effect 重新触发)
  // 3. 重置 TREA-01 store + 时间 + 跟踪状态
  // 4. 视角与默认轨道由 CesiumGlobe 监听 missionMode 变化自动恢复
  const handleExitMission = () => {
    exitingRef.current = true;      // 阻止 effect 重新进入任务中心
    router.replace('/');            // 清除 URL 中的 ?mission=1
    timeResetToNow();
    timeSetRate(10);
    timeStartPlayback(); // 恢复缺省 10x 播放(若已播放则幂等)
    useTreaMissionStore.getState().reset(); // 重置 TREA-01 store(含 trea01Tracking=false)
    setSelectedSatellite(null); // 清除选中卫星
    setTracking(null); // 嵌入跟踪
    setMissionMode(false);
    setManeuverEvent(null);
    setRightPanelCollapsed(false);
  };

  // 任务阶段离开 COMPLETED(新任务启动或重置)时,重置报告关闭状态
  // 使下次任务完成时 MissionReportModal 能再次自动弹出
  useEffect(() => {
    if (treaMissionPhase !== 'COMPLETED') {
      setReportDismissed(false);
    }
  }, [treaMissionPhase]);

  // 是否显示 MissionReportModal:任务完成 + 有报告 + 用户未关闭
  const showReportModal = missionMode
    && treaMissionPhase === 'COMPLETED'
    && treaLastReport !== null
    && !reportDismissed;

  return (
    <div className="h-screen bg-space-950 flex flex-col overflow-hidden">
      {missionMode ? (
        <MissionHeader onExit={handleExitMission} />
      ) : (
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
            <h1 className="text-lg font-bold text-space-100">开源太空 - 卫星守望者</h1>
            <p className="text-xs text-space-400">OpenSpace - Satellite Watcher</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {advancedUnlocked && (
            <>
              <Button variant="outline" size="sm" className="h-9 bg-space-800/50 hover:bg-space-700/50 border-space-700 text-space-300"
                onClick={handleRefreshTLE} disabled={isRefreshingTLE || allSatellites.length === 0}
                title="从 Celestrak 同步最新 TLE 轨道数据（仅刷新TLE，不影响元数据）">
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshingTLE ? 'animate-spin' : ''}`} />
                {isRefreshingTLE && refreshProgress
                  ? `刷新中 ${refreshProgress.done}/${refreshProgress.total}`
                  : isRefreshingTLE ? '刷新中...' : '轨道数据刷新'}
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" className="h-9 bg-space-800/50 hover:bg-space-700/50 border-space-700 text-space-300" onClick={() => setShowImportModal(true)}>
            <Upload className="h-4 w-4 mr-2" />导入数据
          </Button>
          <Button variant="outline" size="sm" className="h-9 bg-space-800/50 hover:bg-space-700/50 border-space-700 text-space-300" onClick={handleReset} title="重置为服务器默认卫星">
            <RotateCcw className="h-4 w-4 mr-2" />重置
          </Button>
          <Button variant="outline" size="sm" className={`h-9 border-space-700 text-space-300 ${advancedUnlocked ? 'bg-cosmic-blue/20 border-cosmic-blue/50 text-cosmic-blue' : 'bg-space-800/50 hover:bg-space-700/50'}`}
            onClick={handleAdvancedClick}
            title={advancedUnlocked ? '点击重新隐藏高级功能' : '输入密码解锁轨道刷新'}>
            <Lock className="h-4 w-4 mr-2" />
            {advancedUnlocked ? '已解锁' : '高级功能'}
          </Button>
          <Button variant="outline" size="sm" className="h-9 bg-cosmic-purple/20 hover:bg-cosmic-purple/30 border-cosmic-purple/50 text-cosmic-purple"
            onClick={handleEnterMission}
            title="进入 TREA-01 遥感任务仿真闭环">
            <Rocket className="h-4 w-4 mr-2" />
            TREA-01 任务中心
          </Button>
          <ViewSwitcher />
        </div>

        <div className="flex items-center">
          <span className="text-space-500/30 text-[10px] font-medium tracking-[0.15em] pointer-events-none select-none mr-3 hidden sm:inline">谭谈</span>
          <button onClick={() => setShowSidebar(!showSidebar)} className="p-2 text-space-400 hover:text-cosmic-blue transition-colors">
            {showSidebar ? '◀' : '▶'}
          </button>
        </div>
      </header>
      )}

      {!missionMode && (refreshMessage || (isRefreshingTLE && refreshProgress)) && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-space-800/95 backdrop-blur-sm border border-space-700 text-sm text-space-100 shadow-lg">
          {isRefreshingTLE && refreshProgress
            ? `正在刷新轨道数据 ${refreshProgress.done}/${refreshProgress.total} 颗${refreshProgress.failed > 0 ? `（${refreshProgress.failed} 颗失败）` : ''}…`
            : refreshMessage}
        </div>
      )}

      {!missionMode && allSatellites.length > 0 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 px-3 py-1 text-xs text-space-500 pointer-events-none">
          {allSatellites.length} 颗卫星（星座导入永久保存 · 高级功能需密码）
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {!missionMode && showSidebar && (
          <>
          <aside style={{ width: sidebarWidth }} className="bg-space-900/50 border-r border-space-800 flex flex-col overflow-hidden shrink-0">
            <div className="p-3 border-b border-space-800">
              <SearchBar satellites={allSatellites} onSearch={handleSearch} onSelectSatellite={handleSatelliteClick} />
            </div>
            <div className="flex-1 flex overflow-hidden">
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
                        onBatchDelete={handleBatchDelete}
                      />
                    </div>
                    {selectedSatellite && (
                      <div className="border-t border-space-800 p-3">
                        <SatelliteDetailPanel
                          satellite={selectedSatellite} onClose={() => setSelectedSatellite(null)}
                          onRequestUploadAuth={handleRequestUploadAuth}
                          onImageUploadFile={handleImageUploadFile}
                          uploadGrantedAt={uploadAuthTs && uploadAuthTs.noradId === selectedSatellite.noradId ? uploadAuthTs.ts : 0}
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
          {missionMode ? (
            <CesiumGlobe
              satellites={allSatellites}
              selectedSatellite={selectedSatellite}
              visibleSatellites={visibleSatellites}
              missionMode={true}
              maneuverEvent={maneuverEvent}
            />
          ) : viewMode === '3d' ? (
            <CesiumGlobe
              satellites={allSatellites}
              selectedSatellite={selectedSatellite}
              visibleSatellites={visibleSatellites}
              missionMode={false}
            />
          ) : (
            <MapLibreMap satellites={allSatellites} selectedSatellite={selectedSatellite} visibleSatellites={visibleSatellites} onSatelliteClick={handleSatelliteClick} />
          )}
          {!missionMode && (
            <div className="absolute top-4 right-4 bg-space-900/80 backdrop-blur-sm border border-space-700 rounded-lg p-3 text-xs text-space-400 z-20">
              <div className="flex items-center gap-2 mb-2"><div className="w-3 h-3 rounded-full bg-cosmic-blue"></div><span>卫星</span></div>
              <div className="flex items-center gap-2"><div className="w-6 h-0.5 bg-cosmic-blue/50"></div><span>轨道</span></div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TREA-01 任务中心浮层面板(missionMode 时显示) */}
          {/* ---------------------------------------------------------- */}
          {/* 左侧:任务列表/规划面板(侧边栏式) */}
          {/* 右侧:遥测仪表盘 + 变轨控制面板(上下分栏,可滚动) */}
          {/* 底部正中:进入第一视角按钮 */}
          {/* 均为不透明深色背景(用户偏好),不与默认 13 颗卫星逻辑耦合 */}
          {/* ============================================================ */}
          {missionMode && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  // 全页面导航:避免 Cesium viewer 与 Next.js RSC 请求竞态
                  window.location.href = '/cockpit';
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="px-6 py-2.5 bg-slate-950 border border-cyan-500/50 rounded-xl text-cyan-300 text-sm font-medium hover:bg-cyan-500/10 hover:border-cyan-400 hover:text-cyan-200 transition-all shadow-lg shadow-cyan-500/20"
              >
                进入第一视角
              </button>
            </div>
          )}
          {missionMode && (
            <>
              {/* 左侧任务列表面板 */}
              <div className="absolute top-0 left-0 bottom-0 z-20 pointer-events-auto">
                <TaskListPanel />
              </div>

              {/* 右侧浮层:卫星示意图 + 遥测仪表盘 + 变轨控制(可滚动) */}
              {/* 折叠时向右缩进,仅留窄条展开按钮 */}
              {rightPanelCollapsed ? (
                <div className="absolute top-4 right-4 bottom-4 z-20 w-10 bg-slate-950 border border-cyan-500/30 rounded-xl flex flex-col items-center pt-3 pointer-events-auto">
                  <button
                    type="button"
                    onClick={() => setRightPanelCollapsed(false)}
                    className="p-2 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
                    title="展开遥测面板"
                  >
                    <PanelRightOpen className="h-5 w-5" />
                  </button>
                  <span className="text-[10px] text-slate-500 mt-2" style={{ writingMode: 'vertical-rl' }}>
                    遥测仪表盘
                  </span>
                </div>
              ) : (
                <div className="absolute top-4 right-4 bottom-4 z-20 w-80 flex flex-col gap-3 overflow-y-auto pointer-events-auto">
                  {/* 折叠按钮(右上角浮动) */}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setRightPanelCollapsed(true)}
                      className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/50 transition-colors"
                      title="折叠面板"
                    >
                      <PanelRightClose className="h-4 w-4" />
                    </button>
                  </div>
                  <TreaSatelliteView />
                  <TelemetryDashboard />
                  <ManeuverPanel />
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <TimeControlBar />

      <ImportModal
        isOpen={showImportModal} onClose={() => setShowImportModal(false)}
        onSuccess={handleImportSuccess} onFileImport={handleFileImport}
        onConstellationImported={handleConstellationImported}
        importLimit={IMPORT_LIMIT_PER_BATCH} totalLimit={MAX_TOTAL_SATELLITES} currentCount={allSatellites.length}
      />

      {/* TREA-01 任务报告模态框:任务完成后弹出,展示 mock 遥感报告 */}
      <MissionReportModal
        report={treaLastReport}
        isOpen={showReportModal}
        onClose={() => setReportDismissed(true)}
      />

      {/* TREA-01 碰撞警报模态框:突发碎片接近时屏幕正中弹出红色警报(仅任务中心) */}
      {missionMode && <CollisionAlertModal />}

      <PasswordModal
        isOpen={passwordModal.isOpen}
        onClose={() => setPasswordModal(m => ({ ...m, isOpen: false }))}
        onSubmit={handlePasswordSubmit}
        title={
          passwordModal.action === 'refreshTLE' ? 'TLE 轨道数据刷新'
          : passwordModal.action === 'advanced' ? '解锁高级功能'
          : '上传图片'
        }
        description={
          passwordModal.action === 'refreshTLE'
            ? '刷新操作将批量请求 Celestrak 获取最新 TLE 数据（仅刷新TLE，不影响元数据），请输入操作密码。'
            : passwordModal.action === 'advanced'
            ? '解锁后将显示轨道数据刷新功能，请输入操作密码。'
            : '图片将永久保存到服务器，请输入操作密码。'
        }
      />
    </div>
  );
}
