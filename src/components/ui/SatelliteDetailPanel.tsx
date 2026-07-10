'use client';

import { useState } from 'react';
import { ChevronDown, X, Globe, Rocket, Clock, Activity, Info, Tag, Box, Crosshair } from 'lucide-react';
import { Button } from './button';
import { Separator } from './separator';
import type { SpaceObject } from '@/store/satelliteStore';
import { useSatelliteStore } from '@/store/satelliteStore';
import { createSatrec, calculateOrbitParams } from '@/lib/tle/orbit';
import OrbitParameters from './OrbitParameters';
import TLEViewer from './TLEViewer';
import TagSelector from './TagSelector';
import { apiClient } from '@/lib/api/client';
import SatelliteMedia from '@/components/visualization/SatelliteMedia';
import { translateSatelliteName, translateCountry, translateObjectType } from '@/lib/translations';

export interface Tag {
  id: string;
  name: string;
  color: string;
  objects?: { id: string; noradId: number; name: string }[];
}

interface SatelliteDetailPanelProps {
  satellite: SpaceObject;
  onClose: () => void;
  tags?: Tag[];
  getSatelliteTags?: (satellite: SpaceObject) => Tag[];
}

function calculateOrbitData(satellite: SpaceObject) {
  if (!satellite.tleData || satellite.tleData.length === 0) {
    return null;
  }

  try {
    const tle = satellite.tleData[0];
    const satrec = createSatrec(tle);
    const params = calculateOrbitParams(satrec);

    // Parse orbital elements from TLE line2 directly (satrec stores radians, convert to degrees)
    const toDeg = (rad: number) => rad * 180 / Math.PI;

    return {
      ...params,
      inclination: toDeg(satrec.inclo),
      raan: toDeg(satrec.nodeo),
      eccentricity: satrec.ecco,
      argPerigee: toDeg(satrec.argpo),
      meanAnomaly: toDeg(satrec.mo),
      meanMotion: satrec.no * 60 * 24 / (2 * Math.PI), // convert rad/min to rev/day
    };
  } catch {
    return null;
  }
}

export default function SatelliteDetailPanel({ satellite, onClose, tags = [], getSatelliteTags }: SatelliteDetailPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedSection, setExpandedSection] = useState<'orbit' | 'tle'>('orbit');
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const triggerFocus = useSatelliteStore(state => state.triggerFocus);
  const trackingNoradId = useSatelliteStore(state => state.trackingNoradId);
  const setTracking = useSatelliteStore(state => state.setTracking);
  const displayImageUrl = uploadedImageUrl || satellite.imageUrl;
  const orbitData = calculateOrbitData(satellite);
  const tleData = satellite.tleData && satellite.tleData.length > 0 ? satellite.tleData[0] : null;
  const isTracking = trackingNoradId === satellite.noradId;
  
  const satelliteTags = getSatelliteTags ? getSatelliteTags(satellite) : [];
  const [selectedTags, setSelectedTags] = useState<Tag[]>(satelliteTags);

  const formatPeriod = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const handleTagChange = async (newTags: Tag[]) => {
    setSelectedTags(newTags);
    
    const newTagIds = newTags.map(t => t.id);
    const currentTagIds = satelliteTags.map(t => t.id);
    
    const addedTags = newTags.filter(t => !currentTagIds.includes(t.id));
    const removedTags = satelliteTags.filter(t => !newTagIds.includes(t.id));

    for (const tag of addedTags) {
      await apiClient.patchTag({
        id: tag.id,
        name: tag.name,
        color: tag.color
      });
    }
    
    setShowTagSelector(false);
  };

  const handleCreateTag = async (name: string, color: string) => {
    try {
      const response = await apiClient.createTag({ name, color });
      if (response.success && response.data) {
        const newTag = response.data as Tag;
        setSelectedTags(prev => [...prev, newTag]);
      }
    } catch (error) {
      console.error('Failed to create tag:', error);
    }
  };

  const handleClose = () => {
    if (isTracking) {
      setTracking(null);
    }
    onClose();
  };

  return (
    <div className="bg-space-900/80 backdrop-blur-sm border border-space-800 rounded-lg overflow-hidden max-h-[60vh] flex flex-col">
      <div className="p-4 border-b border-space-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cosmic-blue to-cosmic-purple flex items-center justify-center">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="2.5" />
                <line x1="12" y1="5" x2="12" y2="9.5" />
                <line x1="12" y1="14.5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="9.5" y2="12" />
                <line x1="14.5" y1="12" x2="19" y2="12" />
                <rect x="3" y="10" width="3" height="4" rx="0.5" />
                <rect x="18" y="10" width="3" height="4" rx="0.5" />
              </svg>
            </div>
            <div>
              <h3 className="text-space-100 font-semibold text-sm">{satellite.name}</h3>
              {translateSatelliteName(satellite.name) && (
                <p className="text-xs text-space-400">{translateSatelliteName(satellite.name)}</p>
              )}
              <p className="text-xs text-space-400">NORAD ID: {satellite.noradId}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${
                isTracking
                  ? 'text-cosmic-blue bg-cosmic-blue/20 border border-cosmic-blue/50'
                  : 'text-space-400 hover:text-cosmic-blue hover:bg-space-700/50'
              }`}
              onClick={() => {
                if (isTracking) {
                  setTracking(null);
                } else {
                  triggerFocus();
                  setTracking(satellite.noradId);
                }
              }}
              title={isTracking ? '停止跟踪' : '持续跟踪卫星'}
            >
              <Crosshair className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-space-400 hover:text-space-100 hover:bg-space-700/50"
              onClick={handleClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        <div className="p-4 space-y-4">
          {/* 3D模型/图像 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-space-300 text-xs font-medium">
              <Box className="h-3.5 w-3.5" />
              <span>3D模型/图像</span>
            </div>
            <SatelliteMedia
              satelliteName={satellite.name}
              noradId={satellite.noradId}
              model3dUrl={satellite.model3dUrl}
              imageUrl={displayImageUrl}
              onImageUploaded={(imageUrl) => {
                setUploadedImageUrl(imageUrl);
              }}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-space-300 text-xs font-medium">
              <Info className="h-3.5 w-3.5" />
              <span>基本信息</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-space-800/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="h-3 w-3 text-cosmic-cyan" />
                  <span className="text-space-400 text-xs">国家</span>
                </div>
                <p className="text-space-100 text-sm font-medium">
                  {satellite.country || '未知'}
                </p>
                {satellite.country && translateCountry(satellite.country) && (
                  <p className="text-space-400 text-xs">{translateCountry(satellite.country)}</p>
                )}
              </div>
              <div className="bg-space-800/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Rocket className="h-3 w-3 text-cosmic-purple" />
                  <span className="text-space-400 text-xs">类型</span>
                </div>
                <p className="text-space-100 text-sm font-medium">
                  {satellite.objectType}
                </p>
                {translateObjectType(satellite.objectType) && (
                  <p className="text-space-400 text-xs">{translateObjectType(satellite.objectType)}</p>
                )}
              </div>
              <div className="bg-space-800/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="h-3 w-3 text-cosmic-green" />
                  <span className="text-space-400 text-xs">状态</span>
                </div>
                <p className={`text-sm font-medium ${satellite.isActive ? 'text-green-400' : 'text-red-400'}`}>
                  {satellite.isActive ? '活跃' : '退役'}
                </p>
              </div>
              <div className="bg-space-800/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-3 w-3 text-cosmic-orange" />
                  <span className="text-space-400 text-xs">发射日期</span>
                </div>
                <p className="text-space-100 text-sm font-medium">
                  {satellite.launchDate ? new Date(satellite.launchDate).toLocaleDateString() : '未知'}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-space-300 text-xs font-medium">
              <div className="flex items-center gap-2">
                <Tag className="h-3.5 w-3.5" />
                <span>标签</span>
              </div>
              <button
                onClick={() => setShowTagSelector(!showTagSelector)}
                className="text-cosmic-blue hover:text-cosmic-blue/80 text-xs"
              >
                {showTagSelector ? '收起' : '管理'}
              </button>
            </div>
            
            {showTagSelector ? (
              <div className="bg-space-800/30 rounded-lg p-3">
                <TagSelector
                  tags={tags}
                  selectedTags={selectedTags}
                  onSelectTags={handleTagChange}
                  onCreateTag={handleCreateTag}
                />
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {satelliteTags.length > 0 ? (
                  satelliteTags.map(tag => (
                    <span
                      key={tag.id}
                      className="px-2 py-1 rounded-full text-xs"
                      style={{
                        backgroundColor: tag.color + '20',
                        color: tag.color,
                      }}
                    >
                      {tag.name}
                    </span>
                  ))
                ) : (
                  <span className="text-space-500 text-xs">暂无标签，点击管理添加</span>
                )}
              </div>
            )}
          </div>

          <Separator className="bg-space-700" />

          {orbitData && (
            <div className="space-y-3">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between text-space-300 text-xs font-medium hover:text-space-100 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5" />
                  轨道参数
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
              </button>

              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}
              >
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="bg-space-800/50 rounded-lg p-3 text-center">
                    <p className="text-space-400 text-xs mb-1">近地点</p>
                    <p className="text-cosmic-blue font-semibold text-sm">
                      {Math.round(orbitData.perigeeAltitude)} km
                    </p>
                  </div>
                  <div className="bg-space-800/50 rounded-lg p-3 text-center">
                    <p className="text-space-400 text-xs mb-1">远地点</p>
                    <p className="text-cosmic-purple font-semibold text-sm">
                      {Math.round(orbitData.apogeeAltitude)} km
                    </p>
                  </div>
                  <div className="bg-space-800/50 rounded-lg p-3 text-center">
                    <p className="text-space-400 text-xs mb-1">轨道周期</p>
                    <p className="text-cosmic-cyan font-semibold text-sm">
                      {formatPeriod(orbitData.period / 60)}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      variant={expandedSection === 'orbit' ? 'default' : 'outline'}
                      size="sm"
                      className={`text-xs h-7 ${expandedSection === 'orbit' ? 'bg-cosmic-blue/20 hover:bg-cosmic-blue/30 border-cosmic-blue/50 text-cosmic-blue' : 'bg-space-800/50 hover:bg-space-700/50 border-space-700'}`}
                      onClick={() => setExpandedSection('orbit')}
                    >
                      轨道六要素
                    </Button>
                    <Button
                      variant={expandedSection === 'tle' ? 'default' : 'outline'}
                      size="sm"
                      className={`text-xs h-7 ${expandedSection === 'tle' ? 'bg-cosmic-blue/20 hover:bg-cosmic-blue/30 border-cosmic-blue/50 text-cosmic-blue' : 'bg-space-800/50 hover:bg-space-700/50 border-space-700'}`}
                      onClick={() => setExpandedSection('tle')}
                    >
                      TLE 原始数据
                    </Button>
                  </div>

                  {expandedSection === 'orbit' ? (
                    <div className="bg-space-800/30 rounded-lg p-3">
                      <OrbitParameters
                        inclination={orbitData.inclination}
                        raan={orbitData.raan}
                        eccentricity={orbitData.eccentricity}
                        argPerigee={orbitData.argPerigee}
                        meanAnomaly={orbitData.meanAnomaly}
                        meanMotion={orbitData.meanMotion}
                      />
                    </div>
                  ) : tleData ? (
                    <div className="bg-space-800/30 rounded-lg p-3">
                      <TLEViewer
                        name={tleData.name}
                        line1={tleData.line1}
                        line2={tleData.line2}
                      />
                    </div>
                  ) : (
                    <div className="text-center text-space-500 py-4 text-xs">
                      暂无 TLE 数据
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {!orbitData && satellite.tleData && satellite.tleData.length > 0 && (
            <div className="space-y-3">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between text-space-300 text-xs font-medium hover:text-space-100 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5" />
                  TLE 数据
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
              </button>

              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'}`}
              >
                <TLEViewer
                  name={satellite.tleData[0].name}
                  line1={satellite.tleData[0].line1}
                  line2={satellite.tleData[0].line2}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}