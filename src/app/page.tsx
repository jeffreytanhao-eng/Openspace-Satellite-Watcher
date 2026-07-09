'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import CesiumGlobe from '@/components/visualization/CesiumGlobe';
import MapLibreMap from '@/components/visualization/MapLibreMap';
import { ViewSwitcher, TimeControlBar, SatelliteList, FilterPanel, SearchBar, SatelliteDetailPanel, ImportModal, TagManager } from '@/components/ui';
import type { ImportSummary } from '@/components/ui/ImportModal';
import { useSatelliteStore, useSatellites, useSelectedSatellite, useVisibleSatellites, useViewMode } from '@/store/satelliteStore';
import { fetchSpaceObjects, apiClient } from '@/lib/api/client';
import type { SpaceObject } from '@/store/satelliteStore';
import type { FilterState } from '@/components/ui/FilterPanel';
import { createSatrec, calculateOrbitParams } from '@/lib/tle/orbit';
import { translateCountry } from '@/lib/translations';
import { Upload, Tags, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface Tag {
  id: string;
  name: string;
  color: string;
  objects?: { id: string; noradId: number; name: string }[];
}

export default function Home() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const viewMode = useViewMode();
  const setViewMode = useSatelliteStore(state => state.setViewMode);
  
  const allSatellites = useSatellites();
  const selectedSatellite = useSelectedSatellite();
  const visibleSatellites = useVisibleSatellites();
  const setSatellites = useSatelliteStore(state => state.setSatellites);
  const setSelectedSatellite = useSatelliteStore(state => state.setSelectedSatellite);
  const setVisibleSatellites = useSatelliteStore(state => state.setVisibleSatellites);
  
  const [isLoading, setIsLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(480);
  const isResizing = useRef(false);
  const [filters, setFilters] = useState<FilterState>({
    noradId: '',
    name: '',
    country: '',
    objectType: '',
    launchYear: '',
    minAltitude: 0,
    maxAltitude: 40000,
    isActive: '',
  });
  const [searchQuery, setSearchQuery] = useState('');
  
  const [showImportModal, setShowImportModal] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [isRefreshingTLE, setIsRefreshingTLE] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  useEffect(() => {
    const viewParam = searchParams.get('view');
    if (viewParam === '2d' || viewParam === '3d') {
      setViewMode(viewParam);
    }
  }, [searchParams, setViewMode]);

  const loadSatellites = async () => {
    try {
      const data = await fetchSpaceObjects();
      setSatellites(data);
      if (data.length > 0) {
        setVisibleSatellites(data.slice(0, 100).map(s => s.noradId));
      }
    } catch (error) {
      if (error instanceof Error && error.message === '请求已取消') return;
      console.error('Failed to load satellites:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTags = async () => {
    try {
      const response = await apiClient.getTags();
      if (response.success && response.data) {
        setTags(response.data as Tag[]);
      }
    } catch (error) {
      if (error instanceof Error && error.message === '请求已取消') return;
      console.error('Failed to load tags:', error);
    }
  };

  useEffect(() => {
    loadSatellites();
  }, [setSatellites, setVisibleSatellites]);

  useEffect(() => {
    loadTags();
  }, []);

  const handleImportSuccess = (importedSatellites?: { noradId: number; name: string; line1: string; line2: string }[]): ImportSummary | void => {
    if (importedSatellites && importedSatellites.length > 0) {
      // Convert imported TLE data to SpaceObject format and add to store
      const newSatellites: SpaceObject[] = importedSatellites.map(sat => ({
        noradId: sat.noradId,
        name: sat.name,
        country: 'UNK',
        objectType: 'PAYLOAD',
        launchDate: '',
        launchSite: '',
        owner: '',
        isActive: true,
        tleData: [{
          name: sat.name,
          line1: sat.line1,
          line2: sat.line2,
        }],
      }));

      // Merge with existing satellites (avoid duplicates by noradId)
      const existingIds = new Set(allSatellites.map(s => s.noradId));
      const uniqueNew = newSatellites.filter(s => !existingIds.has(s.noradId));
      const skippedCount = newSatellites.length - uniqueNew.length;

      // Limit to 200 new satellites per import batch
      const IMPORT_LIMIT = 200;
      const toImport = uniqueNew.slice(0, IMPORT_LIMIT);
      const remainingCount = uniqueNew.length - toImport.length;

      if (toImport.length > 0) {
        const updated = [...allSatellites, ...toImport];
        setSatellites(updated);
      }

      // Show import summary
      const parts: string[] = [`成功导入 ${toImport.length} 颗卫星`];
      if (skippedCount > 0) parts.push(`跳过 ${skippedCount} 颗已存在`);
      if (remainingCount > 0) parts.push(`剩余 ${remainingCount} 颗可下次导入`);
      console.log(parts.join('，'));

      return {
        imported: toImport.length,
        skipped: skippedCount,
        remaining: remainingCount,
      };
    } else {
      loadSatellites();
    }
  };

  const handleRefreshTLE = async () => {
    if (allSatellites.length === 0 || isRefreshingTLE) return;

    setIsRefreshingTLE(true);
    setRefreshMessage(null);

    try {
      const noradIds = allSatellites.map(s => s.noradId);
      const response = await fetch('/api/tle/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noradIds }),
      });

      const result = await response.json();

      if (!result.success) {
        setRefreshMessage(`刷新失败: ${result.error}`);
        return;
      }

      const { updated, failed, updatedCount, failedCount, total } = result.data;

      if (updatedCount === 0) {
        setRefreshMessage('未能获取任何卫星的最新 TLE 数据');
        return;
      }

      const tleMap = new Map(updated.map((t: { noradId: number; name: string; line1: string; line2: string }) => [t.noradId, t]));

      const updatedSatellites = allSatellites.map(sat => {
        const newTle = tleMap.get(sat.noradId);
        if (newTle) {
          return {
            ...sat,
            name: newTle.name,
            tleData: [{
              name: newTle.name,
              line1: newTle.line1,
              line2: newTle.line2,
            }],
          };
        }
        return sat;
      });

      setSatellites(updatedSatellites);

      const failedInfo = failedCount > 0 ? `，${failedCount} 颗失败` : '';
      setRefreshMessage(`已刷新 ${updatedCount}/${total} 颗卫星的 TLE 数据${failedInfo}`);
    } catch {
      setRefreshMessage('刷新失败，请检查网络连接');
    } finally {
      setIsRefreshingTLE(false);
      setTimeout(() => setRefreshMessage(null), 5000);
    }
  };

  const handleTagManagerClose = () => {
    setShowTagManager(false);
    loadTags();
  };

  const calculateAltitude = (satellite: SpaceObject): number | null => {
    if (!satellite.tleData || satellite.tleData.length === 0) {
      return null;
    }
    
    try {
      const satrec = createSatrec(satellite.tleData[0]);
      const params = calculateOrbitParams(satrec);
      return Math.round((params.perigeeAltitude + params.apogeeAltitude) / 2);
    } catch {
      return null;
    }
  };

  const filteredSatellites = useMemo(() => {
    return allSatellites.filter(satellite => {
      if (filters.noradId && !satellite.noradId.toString().includes(filters.noradId)) {
        return false;
      }
      
      if (filters.name && !satellite.name.toLowerCase().includes(filters.name.toLowerCase())) {
        return false;
      }
      
      if (filters.country) {
        const KNOWN_COUNTRIES = ['中国', '美国', '俄罗斯', '欧洲', '日本', '印度'];
        const codes = (satellite.country || '').split('/').map(c => c.trim()).filter(Boolean);
        const translated = codes.map(code => translateCountry(code)).filter(Boolean) as string[];

        if (filters.country === '其他') {
          if (translated.some(c => KNOWN_COUNTRIES.includes(c))) {
            return false;
          }
        } else {
          if (!translated.includes(filters.country)) {
            return false;
          }
        }
      }
      
      // Map Chinese type labels to English objectType values
      const typeMap: Record<string, string> = {
        '有效载荷': 'PAYLOAD',
        '火箭体': 'ROCKET_BODY',
        '碎片': 'DEBRIS',
        '未知': 'UNKNOWN',
      };
      if (filters.objectType && satellite.objectType !== typeMap[filters.objectType]) {
        return false;
      }
      
      if (filters.launchYear && satellite.launchDate) {
        const launchYear = new Date(satellite.launchDate).getFullYear().toString();
        if (launchYear !== filters.launchYear) {
          return false;
        }
      }
      
      if (filters.isActive) {
        const isActive = filters.isActive === 'active';
        if (satellite.isActive !== isActive) {
          return false;
        }
      }
      
      const altitude = calculateAltitude(satellite);
      if (altitude !== null) {
        if (altitude < filters.minAltitude || altitude > filters.maxAltitude) {
          return false;
        }
      }
      
      if (searchQuery) {
        const queryLower = searchQuery.toLowerCase();
        const nameMatch = satellite.name.toLowerCase().includes(queryLower);
        const noradMatch = satellite.noradId.toString().includes(queryLower);
        if (!nameMatch && !noradMatch) {
          return false;
        }
      }
      
      return true;
    });
  }, [allSatellites, filters, searchQuery]);

  const handleSatelliteClick = (satellite: SpaceObject) => {
    setSelectedSatellite(satellite);
  };

  const handleToggleVisibility = (noradId: number) => {
    const newVisible = visibleSatellites.includes(noradId)
      ? visibleSatellites.filter(id => id !== noradId)
      : [...visibleSatellites, noradId];
    setVisibleSatellites(newVisible);
  };

  const handleSelectAll = () => {
    setVisibleSatellites(filteredSatellites.map(s => s.noradId));
  };

  const handleDeselectAll = () => {
    setVisibleSatellites([]);
  };

  const handleDeleteSatellite = (noradId: number) => {
    const updated = allSatellites.filter(s => s.noradId !== noradId);
    setSatellites(updated);
    setVisibleSatellites(visibleSatellites.filter(id => id !== noradId));
    if (selectedSatellite?.noradId === noradId) {
      setSelectedSatellite(null);
    }
  };

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const getSatelliteTags = (satellite: SpaceObject): Tag[] => {
    return tags.filter(tag => 
      tag.objects?.some(obj => obj.noradId === satellite.noradId)
    );
  };

  return (
    <div className="h-screen bg-space-950 flex flex-col overflow-hidden">
      <header className="h-16 bg-space-900/80 backdrop-blur-sm border-b border-space-800 flex items-center justify-between px-4 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cosmic-blue to-cosmic-purple flex items-center justify-center">
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="2.5" />
              <line x1="12" y1="5" x2="12" y2="9.5" />
              <line x1="12" y1="14.5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="9.5" y2="12" />
              <line x1="14.5" y1="12" x2="19" y2="12" />
              <rect x="3" y="10" width="3" height="4" rx="0.5" />
              <rect x="18" y="10" width="3" height="4" rx="0.5" />
              <path d="M12 9.5 L15 5 M12 9.5 L9 5 M12 14.5 L15 19 M12 14.5 L9 19" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-space-100">卫星守望者</h1>
            <p className="text-xs text-space-400">Satellite Watcher</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="h-9 bg-space-800/50 hover:bg-space-700/50 border-space-700 text-space-300"
            onClick={handleRefreshTLE}
            disabled={isRefreshingTLE || allSatellites.length === 0}
            title="从 Celestrak 同步所有卫星的最新 TLE 轨道数据"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshingTLE ? 'animate-spin' : ''}`} />
            {isRefreshingTLE ? '刷新中...' : '轨道数据刷新'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 bg-space-800/50 hover:bg-space-700/50 border-space-700 text-space-300"
            onClick={() => setShowImportModal(true)}
          >
            <Upload className="h-4 w-4 mr-2" />
            导入数据
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 bg-space-800/50 hover:bg-space-700/50 border-space-700 text-space-300"
            onClick={() => setShowTagManager(true)}
          >
            <Tags className="h-4 w-4 mr-2" />
            标签管理
          </Button>
          <ViewSwitcher />
        </div>

        <button
          onClick={() => setShowSidebar(!showSidebar)}
          className="p-2 text-space-400 hover:text-cosmic-blue transition-colors"
        >
          {showSidebar ? '◀' : '▶'}
        </button>
      </header>

      {refreshMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-space-800/95 backdrop-blur-sm border border-space-700 text-sm text-space-100 shadow-lg">
          {refreshMessage}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {showSidebar && (
          <>
          <aside style={{ width: sidebarWidth }} className="bg-space-900/50 border-r border-space-800 flex flex-col overflow-hidden shrink-0">
            <div className="p-3 border-b border-space-800">
              <SearchBar
                satellites={allSatellites}
                onSearch={handleSearch}
                onSelectSatellite={handleSatelliteClick}
              />
            </div>

            <div className="flex-1 flex overflow-hidden">
              <div className="w-48 border-r border-space-800 shrink-0">
                <FilterPanel
                  satellites={allSatellites}
                  onFilterChange={handleFilterChange}
                  filteredCount={filteredSatellites.length}
                />
              </div>

              <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                {isLoading ? (
                  <div className="flex items-center justify-center flex-1">
                    <div className="w-8 h-8 border-2 border-cosmic-blue border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 overflow-hidden">
                      <SatelliteList
                        satellites={filteredSatellites}
                        selectedSatellite={selectedSatellite}
                        visibleSatellites={visibleSatellites}
                        onSelectSatellite={handleSatelliteClick}
                        onToggleVisibility={handleToggleVisibility}
                        onSelectAll={handleSelectAll}
                        onDeselectAll={handleDeselectAll}
                        onDeleteSatellite={handleDeleteSatellite}
                        tags={tags}
                        getSatelliteTags={getSatelliteTags}
                      />
                    </div>
                    {selectedSatellite && (
                      <div className="border-t border-space-800 p-3">
                        <SatelliteDetailPanel
                          satellite={selectedSatellite}
                          onClose={() => setSelectedSatellite(null)}
                          tags={tags}
                          getSatelliteTags={getSatelliteTags}
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
              e.preventDefault();
              isResizing.current = true;
              const startX = e.clientX;
              const startWidth = sidebarWidth;
              const handleMouseMove = (ev: MouseEvent) => {
                if (!isResizing.current) return;
                const newWidth = Math.max(320, Math.min(800, startWidth + (ev.clientX - startX)));
                setSidebarWidth(newWidth);
              };
              const handleMouseUp = () => {
                isResizing.current = false;
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
              };
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
            }}
            className="w-1 bg-space-700 hover:bg-cosmic-blue/50 cursor-col-resize shrink-0 transition-colors"
          />
          </>
        )}

        <main className="flex-1 relative overflow-hidden min-h-0">
          {viewMode === '3d' ? (
            <CesiumGlobe
              satellites={allSatellites}
              selectedSatellite={selectedSatellite}
              visibleSatellites={visibleSatellites}
            />
          ) : (
            <MapLibreMap
              satellites={allSatellites}
              selectedSatellite={selectedSatellite}
              visibleSatellites={visibleSatellites}
              onSatelliteClick={handleSatelliteClick}
            />
          )}

          <div className="absolute top-4 right-4 bg-space-900/80 backdrop-blur-sm border border-space-700 rounded-lg p-3 text-xs text-space-400 z-20">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-cosmic-blue"></div>
              <span>卫星</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-0.5 bg-cosmic-blue/50"></div>
              <span>轨道</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-0.5 bg-cosmic-blue/20"></div>
              <span>预测轨道</span>
            </div>
          </div>
        </main>
      </div>

      <TimeControlBar />

      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={handleImportSuccess}
      />

      <TagManager
        isOpen={showTagManager}
        onClose={handleTagManagerClose}
      />
    </div>
  );
}