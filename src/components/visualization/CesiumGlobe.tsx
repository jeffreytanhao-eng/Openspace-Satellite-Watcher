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
  } = useCesium();

  const [loadError, setLoadError] = useState<string | null>(null);
  const currentTime = useTimeStore(state => state.currentTime);
  const focusTrigger = useSatelliteStore(state => state.focusTrigger);

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
    if (!isReady || !viewer || !initCompleted.current || !satellites.length) return;

    const visibleIds = new Set(visibleSatellites);
    const filteredSatellites = satellites.filter(s => visibleIds.has(s.noradId));

    updateSatellitePositions(filteredSatellites, currentTime);
  }, [satellites, currentTime, visibleSatellites, isReady, viewer, updateSatellitePositions]);

  // Update orbits ONLY when satellite data or visibility changes (not on time change)
  // Orbit shape is determined by TLE elements, not by current time
  useEffect(() => {
    if (!isReady || !viewer || !initCompleted.current || !satellites.length) return;

    const visibleIds = new Set(visibleSatellites);
    const filteredSatellites = satellites.filter(s => visibleIds.has(s.noradId));

    updateOrbits(filteredSatellites, new Date());
  }, [satellites, visibleSatellites, isReady, viewer, updateOrbits]);

  // Handle selected satellite
  useEffect(() => {
    if (!isReady || !selectedSatellite) return;
    setSelectedSatellite(selectedSatellite.noradId);
    flyToSatellite(selectedSatellite);
  }, [selectedSatellite, isReady, flyToSatellite, setSelectedSatellite, focusTrigger]);

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
