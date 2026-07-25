'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { SpaceObject } from '@/store/satelliteStore';
import { useSatelliteStore } from '@/store/satelliteStore';
import { useTimeStore } from '@/store/timeStore';
import { useCesium } from '@/hooks/useCesium';

interface CesiumGlobeProps {
  satellites: SpaceObject[];
  selectedSatellite: SpaceObject | null;
  visibleSatellites: number[];
}

export default function CesiumGlobe({ satellites, selectedSatellite, visibleSatellites }: CesiumGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initStarted = useRef(false);
  const initCompleted = useRef(false);
  const {
    isReady,
    loadError: cesiumLoadError,
    viewer,
    initCesium,
    destroyCesium,
    flyToSatellite,
    resetView,
    updateSatellitePositions,
    updateOrbits,
    setSelectedSatellite,
    startTracking,
    stopTracking,
    regenerateOrbit,
  } = useCesium();

  const [loadError, setLoadError] = useState<string | null>(null);
  const currentTime = useTimeStore(state => state.currentTime);
  const focusTrigger = useSatelliteStore(state => state.focusTrigger);
  const trackingNoradId = useSatelliteStore(state => state.trackingNoradId);
  const setTracking = useSatelliteStore(state => state.setTracking);
  const allSatellites = useSatelliteStore(state => state.satellites);
  const setSelectedSatelliteStore = useSatelliteStore(state => state.setSelectedSatellite);

  // Initialize Cesium viewer once - use a ref to track init state across StrictMode
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Guard: only init if not already started for this container
    if (initStarted.current) return;
    initStarted.current = true;
    initCompleted.current = false;

    let destroyed = false;

    initCesium(container)
      .then(() => {
        if (destroyed) return;
        initCompleted.current = true;
      })
      .catch((err: unknown) => {
        if (destroyed) return;
        console.error('[CesiumGlobe] Init failed:', err);
        setLoadError(err instanceof Error ? err.message : String(err));
        initStarted.current = false;
      });

    return () => {
      destroyed = true;
      initStarted.current = false;
      initCompleted.current = false;
      destroyCesium();
    };
  }, [initCesium, destroyCesium]);

  // Update satellite positions when time changes (every frame during playback)
  useEffect(() => {
    if (!isReady || !viewer || !initCompleted.current) return;

    const visibleIds = new Set(visibleSatellites);
    const filteredSatellites = satellites.filter(s => visibleIds.has(s.noradId));

    // 即使卫星列表为空也要执行，以清理 Cesium 中残留的卫星实体
    updateSatellitePositions(filteredSatellites, currentTime);
  }, [satellites, currentTime, visibleSatellites, isReady, viewer, updateSatellitePositions]);

  // Update orbits ONLY when satellite data or visibility changes (not on time change)
  // Orbit shape is a fixed ellipse determined by TLE elements, not by current time.
  // Skip orbit updates while tracking to prevent visual jumping.
  const isTrackingRef = useRef(false);
  useEffect(() => {
    if (!isReady || !viewer || !initCompleted.current) return;
    if (isTrackingRef.current) return; // Freeze orbits during tracking

    const visibleIds = new Set(visibleSatellites);
    const filteredSatellites = satellites.filter(s => visibleIds.has(s.noradId));

    // 即使卫星列表为空也要执行，以清理 Cesium 中残留的轨道实体
    updateOrbits(filteredSatellites, currentTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satellites, visibleSatellites, isReady, viewer, updateOrbits]);

  // Handle selected satellite: 选中时显示 3D 模型 + 飞向卫星;取消选中切回光点
  useEffect(() => {
    if (!isReady) return;
    if (selectedSatellite) {
      setSelectedSatellite(selectedSatellite.noradId);
      flyToSatellite(selectedSatellite);
    } else {
      // 取消选中:切回光点显示
      setSelectedSatellite(null);
    }
  }, [selectedSatellite, isReady, flyToSatellite, setSelectedSatellite, focusTrigger]);

  // Handle tracking: start/stop continuous tracking when trackingNoradId changes
  useEffect(() => {
    if (!isReady || !viewer) return;

    if (trackingNoradId !== null) {
      const sat = allSatellites.find(s => s.noradId === trackingNoradId);
      if (sat) {
        isTrackingRef.current = true;
        // Regenerate orbit at current sim time so it matches the satellite's path
        regenerateOrbit(sat);
        startTracking(sat);
      }
    } else {
      isTrackingRef.current = false;
      stopTracking();
    }
  }, [trackingNoradId, isReady, viewer, allSatellites, startTracking, stopTracking, regenerateOrbit]);

  // Click on globe: pick satellite entity → enter detail + auto-tracking;
  // click empty space → stop tracking
  useEffect(() => {
    if (!isReady || !viewer) return;
    const Cesium = (window as unknown as { Cesium: typeof import('cesium') }).Cesium;
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: { position: { x: number; y: number } }) => {
      // 先检测是否点中了卫星实体
      const picked = viewer.scene.pick(movement.position);
      if (Cesium.defined(picked) && picked.id && typeof picked.id === 'object' && 'id' in picked.id) {
        const entityId = String((picked.id as { id: unknown }).id);
        const match = entityId.match(/^satellite-(\d+)$/);
        if (match) {
          const noradId = parseInt(match[1], 10);
          const sat = useSatelliteStore.getState().satellites.find(s => s.noradId === noradId);
          if (sat) {
            setSelectedSatelliteStore(sat);
            setTracking(noradId);
            return;
          }
        }
      }
      // 没点中卫星：如果在 tracking，停止
      if (useSatelliteStore.getState().trackingNoradId !== null) {
        setTracking(null);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
    };
  }, [isReady, viewer, setTracking, setSelectedSatelliteStore]);

  const handleResetView = useCallback(() => {
    resetView();
  }, [resetView]);

  const handleRightClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const displayError = loadError || cesiumLoadError;

  return (
    <div className="w-full h-full relative bg-black">
      <div
        ref={containerRef}
        className="w-full h-full absolute inset-0"
        onContextMenu={handleRightClick}
      />

      {/* Reset view button */}
      {isReady && !displayError && (
        <button
          onClick={handleResetView}
          className="absolute top-4 left-4 z-20 w-10 h-10 flex items-center justify-center rounded-lg bg-space-900/80 backdrop-blur-sm border border-space-700 text-space-300 hover:text-cosmic-blue hover:bg-space-800/90 hover:border-cosmic-blue/50 transition-all"
          title="重置视图 - 回到全局视角"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            <circle cx="12" cy="12" r="10" />
          </svg>
        </button>
      )}

      {!isReady && !displayError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">加载 3D 地球...</p>
          </div>
        </div>
      )}
      {displayError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="flex flex-col items-center gap-4 text-center px-4 max-w-md">
            <p className="text-red-400 font-medium">3D 地球加载失败</p>
            <p className="text-slate-500 text-sm">{displayError}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-sm transition-colors"
            >
              重试
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
