'use client';

import { useState, useEffect } from 'react';
import { Checkbox } from './checkbox';
import { Button } from './button';
import type { SpaceObject } from '@/store/satelliteStore';
import { createSatrec, calculateOrbitParams } from '@/lib/tle/orbit';
import { translateSatelliteName, translateCountry } from '@/lib/translations';

interface SatelliteListProps {
  satellites: SpaceObject[];
  selectedSatellite: SpaceObject | null;
  visibleSatellites: number[];
  onSelectSatellite: (satellite: SpaceObject) => void;
  onToggleVisibility: (noradId: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDeleteSatellite?: (noradId: number) => void;
  onBatchShow?: (noradIds: number[]) => void;
  onBatchHide?: (noradIds: number[]) => void;
  onBatchDelete?: (noradIds: number[]) => void;
}

function calculateAltitude(satellite: SpaceObject): number | null {
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
}

export default function SatelliteList({
  satellites,
  selectedSatellite,
  visibleSatellites,
  onSelectSatellite,
  onToggleVisibility,
  onSelectAll,
  onDeselectAll,
  onDeleteSatellite,
  onBatchShow,
  onBatchHide,
  onBatchDelete,
}: SatelliteListProps) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // Reset to page 1 when satellite list changes
  useEffect(() => {
    setCurrentPage(1);
  }, [satellites.length]);

  const totalPages = Math.ceil(satellites.length / pageSize);
  const paginatedSatellites = satellites.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleSelectAllItems = () => {
    setSelectedItems(satellites.map(s => s.noradId));
    onSelectAll();
  };

  const handleDeselectAllItems = () => {
    setSelectedItems([]);
    onDeselectAll();
  };

  const handleItemClick = (satellite: SpaceObject) => {
    if (isSelecting) {
      const newSelection = selectedItems.includes(satellite.noradId)
        ? selectedItems.filter(id => id !== satellite.noradId)
        : [...selectedItems, satellite.noradId];
      setSelectedItems(newSelection);
    } else {
      onSelectSatellite(satellite);
    }
  };

  const handleVisibilityToggle = (noradId: number) => {
    onToggleVisibility(noradId);
  };

  const isSelected = (noradId: number) => selectedItems.includes(noradId);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-space-800">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-space-100 font-semibold text-sm">卫星列表</h2>
          <span className="text-xs text-space-400">{satellites.length} 颗</span>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-7 text-xs bg-space-800/50 hover:bg-space-700/50 border-space-700"
            onClick={() => {
              setIsSelecting(!isSelecting);
              setSelectedItems([]);
            }}
          >
            {isSelecting ? '退出选择' : '批量选择'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-7 text-xs bg-cosmic-blue/20 hover:bg-cosmic-blue/30 border-cosmic-blue/50 text-cosmic-blue"
            onClick={handleSelectAllItems}
          >
            全选
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-7 text-xs bg-space-800/50 hover:bg-space-700/50 border-space-700"
            onClick={handleDeselectAllItems}
          >
            清空
          </Button>
        </div>
        
        {isSelecting && (
          <div className="mt-2 space-y-2">
            <div className="text-xs text-space-400">
              已选择 {selectedItems.length} 个目标
            </div>
            {selectedItems.length > 0 && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7 text-xs bg-cosmic-blue/10 hover:bg-cosmic-blue/20 border-cosmic-blue/30 text-cosmic-blue"
                  onClick={() => {
                    onBatchShow?.(selectedItems);
                  }}
                  title="显示选中的卫星"
                >
                  <svg className="w-3.5 h-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  显示
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7 text-xs bg-space-800/50 hover:bg-space-700/50 border-space-700 text-space-300"
                  onClick={() => {
                    onBatchHide?.(selectedItems);
                  }}
                  title="隐藏选中的卫星"
                >
                  <svg className="w-3.5 h-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                  隐藏
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7 text-xs bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-400"
                  onClick={() => {
                    onBatchDelete?.(selectedItems);
                    setSelectedItems([]);
                    setIsSelecting(false);
                  }}
                  title="删除选中的卫星"
                >
                  <svg className="w-3.5 h-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  删除
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        <div className="p-2 space-y-1">
          {satellites.length === 0 ? (
            <div className="text-center text-space-500 py-8">
              <p className="text-sm">暂无卫星数据</p>
              <p className="text-xs mt-1">请导入 TLE 数据</p>
            </div>
          ) : (
            paginatedSatellites.map(satellite => {
              const altitude = calculateAltitude(satellite);
              const isVisible = visibleSatellites.includes(satellite.noradId);

              return (
                <div
                  key={satellite.noradId}
                  onClick={() => handleItemClick(satellite)}
                  className={`group relative p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                    selectedSatellite?.noradId === satellite.noradId
                      ? 'bg-cosmic-blue/20 border border-cosmic-blue/50'
                      : isSelected(satellite.noradId)
                      ? 'bg-cosmic-purple/20 border border-cosmic-purple/50'
                      : 'bg-space-800/30 hover:bg-space-800/60 border border-transparent'
                  } ${!isVisible ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    {isSelecting && (
                      <Checkbox
                        checked={isSelected(satellite.noradId)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-0.5"
                      />
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="min-w-0 flex-1">
                          <span className="text-space-100 font-medium text-sm truncate block">
                            {satellite.name}
                          </span>
                          {translateSatelliteName(satellite.name) && (
                            <span className="text-space-400 text-xs">
                              {translateSatelliteName(satellite.name)}
                            </span>
                          )}
                        </div>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                          satellite.isActive
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {satellite.isActive ? '活跃' : '退役'}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 text-xs text-space-400 flex-wrap">
                        <span>NORAD: {satellite.noradId}</span>
                        {altitude !== null && (
                          <span className="text-cosmic-cyan">
                            {altitude} km
                          </span>
                        )}
                        {satellite.country && (
                          <span>
                            {satellite.country}
                            {translateCountry(satellite.country) && ` · ${translateCountry(satellite.country)}`}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleVisibilityToggle(satellite.noradId);
                      }}
                      className={`p-1.5 rounded transition-colors ${
                        isVisible
                          ? 'text-cosmic-blue hover:bg-cosmic-blue/20'
                          : 'text-space-600 hover:bg-space-700'
                      }`}
                      title={isVisible ? '隐藏卫星' : '显示卫星'}
                    >
                      {isVisible ? (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      )}
                    </button>
                    {onDeleteSatellite && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSatellite(satellite.noradId);
                        }}
                        className="p-1.5 rounded transition-colors text-space-600 hover:text-red-400 hover:bg-red-500/20"
                        title="删除卫星"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-space-800">
          <span className="text-[10px] text-space-500">
            第 {currentPage}/{totalPages} 页 · 共 {satellites.length} 颗
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded text-space-400 hover:text-space-100 hover:bg-space-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded text-space-400 hover:text-space-100 hover:bg-space-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}