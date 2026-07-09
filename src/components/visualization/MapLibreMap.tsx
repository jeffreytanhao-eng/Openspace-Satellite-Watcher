'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { SpaceObject } from '@/store/satelliteStore';
import { useSatelliteStore } from '@/store/satelliteStore';
import { useTimeStore } from '@/store/timeStore';
import { useMapLibre } from '@/hooks/useMapLibre';

interface MapLibreMapProps {
  satellites: SpaceObject[];
  selectedSatellite: SpaceObject | null;
  visibleSatellites: number[];
  onSatelliteClick: (satellite: SpaceObject) => void;
}

export default function MapLibreMap({ satellites, selectedSatellite, visibleSatellites, onSatelliteClick }: MapLibreMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    map,
    initMapLibre,
    destroyMapLibre,
    flyToSatellite,
    zoomToExtent,
    resetView,
    updateSatellitePositions,
    updateOrbits,
    setSelectedSatellite
  } = useMapLibre();
  
  const [isLoaded, setIsLoaded] = useState(false);
  const currentTime = useTimeStore(state => state.currentTime);
  const focusTrigger = useSatelliteStore(state => state.focusTrigger);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    initMapLibre(container);

    return () => {
      destroyMapLibre();
    };
  }, [initMapLibre, destroyMapLibre]);

  useEffect(() => {
    if (!map) return;

    // Map is already loaded at this point (setMapLibre is called inside load handler)
    setIsLoaded(true);

    const handleClick = (e: any) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ['satellites-layer']
      });

      if (features.length > 0) {
        const noradId = features[0].properties?.noradId;
        const satellite = satellites.find(s => s.noradId === noradId);
        if (satellite) {
          onSatelliteClick(satellite);
        }
      }
    };

    map.on('click', handleClick);

    return () => {
      map.off('click', handleClick);
    };
  }, [map, satellites, onSatelliteClick]);

  // Update satellite positions every frame (animation)
  useEffect(() => {
    if (!isLoaded) return;

    const visibleIds = new Set(visibleSatellites);
    const filteredSatellites = satellites.filter(s => visibleIds.has(s.noradId));

    updateSatellitePositions(filteredSatellites, currentTime);
  }, [satellites, currentTime, visibleSatellites, isLoaded, updateSatellitePositions]);

  // Update orbits only when satellite data or map changes (NOT every frame)
  // This keeps orbit lines stationary while the satellite moves along them
  useEffect(() => {
    if (!isLoaded || !map) return;

    const visibleIds = new Set(visibleSatellites);
    const filteredSatellites = satellites.filter(s => visibleIds.has(s.noradId));

    updateOrbits(filteredSatellites, new Date());
  }, [satellites, visibleSatellites, isLoaded, map, updateOrbits]);

  useEffect(() => {
    if (!isLoaded || !selectedSatellite) return;
    setSelectedSatellite(selectedSatellite.noradId);
    flyToSatellite(selectedSatellite);
  }, [selectedSatellite, isLoaded, flyToSatellite, setSelectedSatellite, focusTrigger]);

  const handleRightClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resetView();
  }, [resetView]);

  return (
    <div className="w-full h-full relative">
      <div
        ref={containerRef}
        className="w-full h-full"
        onContextMenu={handleRightClick}
      />
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-space-950 z-10">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-cosmic-blue border-t-transparent rounded-full animate-spin"></div>
            <p className="text-space-400">加载 2D 地图...</p>
          </div>
        </div>
      )}
    </div>
  );
}