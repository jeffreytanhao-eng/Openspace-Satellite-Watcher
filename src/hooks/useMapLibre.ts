'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { SpaceObject } from '@/store/satelliteStore';
import { createSatelliteMarker, getSatelliteColor, createSatelliteIcon } from '@/components/visualization/SatelliteMarker';
import { createOrbitLine } from '@/components/visualization/OrbitLine';
import { createSatrec, propagateOrbit } from '@/lib/tle/orbit';

interface MapLibreInstance {
  map: maplibregl.Map;
  satelliteMarkers: Map<number, { update: (config: any) => void }>;
  orbitLines: Map<number, { update: (config: any) => void }>;
  satelliteSource: maplibregl.GeoJSONSource;
  orbitSource: maplibregl.GeoJSONSource;
}

const MAX_VISIBLE_SATELLITES = 1000;

export function useMapLibre() {
  const [mapLibre, setMapLibre] = useState<MapLibreInstance | null>(null);
  const mapLibreRef = useRef<MapLibreInstance | null>(null);
  const lastViewTime = useRef(0);

  useEffect(() => {
    mapLibreRef.current = mapLibre;
  }, [mapLibre]);

  const initMapLibre = useCallback(async (container: HTMLDivElement) => {
    const maplibre = await import('maplibre-gl').then(m => m.default || m);

    const map = new maplibre.Map({
      container,
      style: createDarkMapStyle(),
      center: [0, 0],
      zoom: 2,
      minZoom: 1,
      maxZoom: 10,
      attributionControl: false,
      logoPosition: 'bottom-left'
    });

    map.addControl(new maplibre.NavigationControl({
      showCompass: true,
      showZoom: true
    }), 'top-right');

    map.on('load', async () => {
      map.addSource('satellites', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        },
        cluster: true,
        clusterMaxZoom: 8,
        clusterRadius: 50
      });

      map.addSource('orbits', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'satellites',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 2
        }
      });

      map.addLayer({
        id: 'orbits-layer',
        type: 'line',
        source: 'orbits',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': [
            'case',
            ['boolean', ['get', 'isSelected'], false],
            3,
            1
          ],
          'line-opacity': 0.6,
          'line-dasharray': [5, 5]
        }
      });

      map.addLayer({
        id: 'satellites-layer',
        type: 'symbol',
        source: 'satellites',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': ['concat', 'satellite-icon-', ['get', 'color']],
          'icon-size': ['get', 'size'],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'text-field': ['get', 'name'],
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 11,
          'text-offset': [0, 1.5],
          'text-anchor': 'top',
          'text-allow-overlap': true,
          'text-ignore-placement': true
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 2
        }
      });

      const satelliteSource = map.getSource('satellites') as maplibregl.GeoJSONSource;
      const orbitSource = map.getSource('orbits') as maplibregl.GeoJSONSource;

      // Load satellite marker icons properly (wait for Image onload)
      const colors = ['#00d4ff', '#ff4444', '#ffaa00', '#00ff88', '#888888', '#ffd700'];
      const loadImage = (id: string, canvas: HTMLCanvasElement) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            if (!map.hasImage(id)) {
              map.addImage(id, img, { sdf: false });
            }
            resolve();
          };
          img.onerror = () => resolve();
          img.src = canvas.toDataURL();
        });

      await Promise.all(
        colors.flatMap(color => [
          loadImage(`satellite-icon-${color}`, createSatelliteIcon(color, 8, false)),
          loadImage(`satellite-icon-${color}-selected`, createSatelliteIcon(color, 16, true)),
        ])
      );

      const instance: MapLibreInstance = {
        map,
        satelliteMarkers: new Map(),
        orbitLines: new Map(),
        satelliteSource,
        orbitSource
      };

      setMapLibre(instance);
    });

    return () => {
      if (mapLibreRef.current) {
        mapLibreRef.current.map.remove();
        setMapLibre(null);
      }
    };
  }, []);

  const destroyMapLibre = useCallback(() => {
    if (mapLibreRef.current) {
      mapLibreRef.current.map.remove();
      setMapLibre(null);
    }
  }, []);

  const flyTo = useCallback((center: [number, number], zoom?: number, options?: Partial<maplibregl.FlyToOptions>) => {
    const instance = mapLibreRef.current;
    if (!instance) return;

    instance.map.flyTo({
      center,
      zoom: zoom || 5,
      duration: 1500,
      easing: (t: number) => t * (2 - t),
      ...options
    });
  }, []);

  const zoomTo = useCallback((zoom: number) => {
    const instance = mapLibreRef.current;
    if (!instance) return;

    instance.map.zoomTo(zoom, { duration: 1000 });
  }, []);

  const resetView = useCallback(() => {
    const instance = mapLibreRef.current;
    if (!instance) return;

    instance.map.flyTo({
      center: [0, 0],
      zoom: 2,
      duration: 1500
    });
  }, []);

  const zoomToExtent = useCallback((satellites: SpaceObject[]) => {
    const instance = mapLibreRef.current;
    if (!instance || satellites.length === 0) return;

    const bounds = new (instance.map as any).LngLatBounds();
    
    satellites.forEach(satellite => {
      const position = calculateSatelliteGeographic(satellite);
      if (position) {
        bounds.extend([position.lng, position.lat]);
      }
    });

    instance.map.fitBounds(bounds, {
      padding: 50,
      duration: 1500
    });
  }, []);

  const isSatelliteInViewport = useCallback((satellite: SpaceObject, time: Date, map: maplibregl.Map): boolean => {
    const position = calculateSatelliteGeographic(satellite, time);
    if (!position) return false;

    const bounds = map.getBounds();
    return bounds.contains([position.lng, position.lat] as any);
  }, []);

  const calculateSatelliteGeographic = (satellite: SpaceObject, time?: Date): { lng: number; lat: number } | null => {
    if (satellite.tleData.length === 0) return null;
    
    const latestTle = satellite.tleData[satellite.tleData.length - 1];
    const satrec = createSatrec(latestTle);
    const state = propagateOrbit(satrec, time || new Date());
    
    if (!state) return null;
    
    return {
      lng: state.geographic.lon,
      lat: state.geographic.lat
    };
  };

  const updateSatellitePositions = useCallback((satellites: SpaceObject[], time: Date) => {
    const instance = mapLibreRef.current;
    if (!instance) return;

    const now = Date.now();
    const shouldCull = now - lastViewTime.current > 100;

    let visibleSatellites = satellites;
    
    if (satellites.length > 500 && shouldCull) {
      visibleSatellites = satellites.filter(satellite => isSatelliteInViewport(satellite, time, instance.map));
    }

    if (visibleSatellites.length > MAX_VISIBLE_SATELLITES) {
      visibleSatellites = visibleSatellites.slice(0, MAX_VISIBLE_SATELLITES);
    }

    lastViewTime.current = now;

    const existingIds = new Set(instance.satelliteMarkers.keys());
    const currentIds = new Set(visibleSatellites.map(s => s.noradId));

    existingIds.forEach(id => {
      if (!currentIds.has(id)) {
        instance.satelliteMarkers.delete(id);
      }
    });

    const features: GeoJSON.Feature[] = [];

    visibleSatellites.forEach(satellite => {
      const position = calculateSatelliteGeographic(satellite, time);
      
      if (!position) return;

      const color = getSatelliteColor(satellite.objectType);
      const existingMarker = instance.satelliteMarkers.get(satellite.noradId);

      if (existingMarker) {
        existingMarker.update({ position, color });
      } else {
        const result = createSatelliteMarker({
          noradId: satellite.noradId,
          name: satellite.name,
          position,
          color,
          isSelected: false
        });
        
        instance.satelliteMarkers.set(satellite.noradId, {
          update: result.update
        });
      }

      const feature: GeoJSON.Feature = {
        type: 'Feature',
        id: `satellite-${satellite.noradId}`,
        properties: {
          noradId: satellite.noradId,
          name: satellite.name,
          color,
          size: 0.5,
          objectType: satellite.objectType
        },
        geometry: {
          type: 'Point',
          coordinates: [position.lng, position.lat]
        }
      };
      
      features.push(feature);
    });

    instance.satelliteSource.setData({
      type: 'FeatureCollection',
      features
    });
  }, [isSatelliteInViewport]);

  const updateOrbits = useCallback((satellites: SpaceObject[], time: Date) => {
    const instance = mapLibreRef.current;
    if (!instance) return;

    // Get source directly from map to avoid stale references
    const orbitSource = instance.map.getSource('orbits') as maplibregl.GeoJSONSource | undefined;
    if (!orbitSource) return;

    const existingIds = new Set(instance.orbitLines.keys());
    const currentIds = new Set(satellites.map(s => s.noradId));

    existingIds.forEach(id => {
      if (!currentIds.has(id)) {
        instance.orbitLines.delete(id);
      }
    });

    const features: GeoJSON.Feature[] = [];
    const orbitSatellites = satellites.slice(0, 200);

    orbitSatellites.forEach(satellite => {
      const color = getSatelliteColor(satellite.objectType);

      // Create orbit line once and reuse its feature
      const orbit = createOrbitLine({
        noradId: satellite.noradId,
        tleData: satellite.tleData,
        startTime: time,
        predictOrbits: 3,
        color,
        isSelected: false
      });

      instance.orbitLines.set(satellite.noradId, {
        update: orbit.update
      });

      features.push(orbit.feature);
    });

    orbitSource.setData({
      type: 'FeatureCollection',
      features
    });
  }, []);

  const setSelectedSatellite = useCallback((noradId: number | null) => {
    const instance = mapLibreRef.current;
    if (!instance) return;

    const satelliteSource = instance.map.getSource('satellites') as maplibregl.GeoJSONSource;
    const orbitSource = instance.map.getSource('orbits') as maplibregl.GeoJSONSource;

    const rawSatelliteData = satelliteSource?.serialize() as { data?: GeoJSON.FeatureCollection };
    if (rawSatelliteData?.data) {
      const satelliteData = { ...rawSatelliteData.data };
      (satelliteData.features as GeoJSON.Feature[]).forEach(feature => {
        const id = feature.properties?.noradId;
        if (id === noradId) {
          feature.properties!.isSelected = true;
          feature.properties!.color = '#ffd700';
        } else {
          feature.properties!.isSelected = false;
        }
      });
      satelliteSource.setData(satelliteData);
    }

    const rawOrbitData = orbitSource?.serialize() as { data?: GeoJSON.FeatureCollection };
    if (rawOrbitData?.data) {
      const orbitData = { ...rawOrbitData.data };
      (orbitData.features as GeoJSON.Feature[]).forEach(feature => {
        const id = feature.properties?.noradId;
        feature.properties!.isSelected = id === noradId;
      });
      orbitSource.setData(orbitData);
    }
  }, []);

  const flyToSatellite = useCallback((satellite: SpaceObject) => {
    const position = calculateSatelliteGeographic(satellite);
    if (position) {
      flyTo([position.lng, position.lat], 6);
    }
  }, [flyTo]);

  return {
    map: mapLibre?.map || null,
    initMapLibre,
    destroyMapLibre,
    flyTo,
    zoomTo,
    resetView,
    zoomToExtent,
    updateSatellitePositions,
    updateOrbits,
    setSelectedSatellite,
    flyToSatellite
  };
}

function createDarkMapStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    name: 'Dark Satellite',
    metadata: {},
    sources: {
      'osm-tiles': {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
        maxzoom: 19,
      }
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': '#0a0e1a'
        }
      },
      {
        id: 'osm-tiles',
        type: 'raster',
        source: 'osm-tiles',
        paint: {
          'raster-opacity': 0.7,
          'raster-saturation': -0.8,
          'raster-contrast': 0.3,
        }
      }
    ],
    center: [0, 0],
    zoom: 2,
    pitch: 0,
    bearing: 0
  };
}