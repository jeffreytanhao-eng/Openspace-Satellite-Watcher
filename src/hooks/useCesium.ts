'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type * as CesiumType from 'cesium';
import type { SpaceObject } from '@/store/satelliteStore';
import { useTimeStore } from '@/store/timeStore';
import { createSatelliteEntity, getSatelliteColor } from '@/components/visualization/SatelliteEntity';
import { createOrbitTrail } from '@/components/visualization/OrbitTrail';
import { calculateSatellitePosition, generateOrbitPoints } from '@/lib/cesium/positions';

type CesiumNS = typeof CesiumType;

const CESIUM_CDN = 'https://cdn.jsdelivr.net/npm/cesium@1.142.0/Build/Cesium';

// Access Cesium from window (loaded via CDN script)
function getCesium(): CesiumNS {
  if (typeof window === 'undefined' || !(window as unknown as { Cesium?: CesiumNS }).Cesium) {
    throw new Error('Cesium not loaded yet');
  }
  return (window as unknown as { Cesium: CesiumNS }).Cesium;
}

// Set CESIUM_BASE_URL for workers/assets/widgets
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).CESIUM_BASE_URL = CESIUM_CDN + '/';
}

interface CesiumInstance {
  viewer: CesiumType.Viewer;
  scene: CesiumType.Scene;
  Cesium: CesiumNS;
  satelliteEntities: Map<number, { update: (config: Record<string, unknown>) => void; destroy: () => void }>;
  orbitEntities: Map<number, { update: (config: Record<string, unknown>) => void; destroy: () => void }>;
  trackingRemoveListener?: () => void;
}

const MAX_VISIBLE_SATELLITES = 2000;

export function useCesium() {
  const [cesium, setCesium] = useState<CesiumInstance | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const cesiumRef = useRef<CesiumInstance | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    cesiumRef.current = cesium;
  }, [cesium]);

  const initCesium = useCallback(async (container: HTMLDivElement) => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    try {
      const Cesium = getCesium();
      Cesium.Ion.defaultAccessToken = '';

      const viewer = new Cesium.Viewer(container, {
        baseLayerPicker: false,
        fullscreenButton: false,
        homeButton: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        animation: false,
        navigationHelpButton: false,
        geocoder: false,
        infoBox: false,
        shouldAnimate: true,
        imageryProvider: false as unknown as CesiumType.ImageryProvider,
      });

      const scene = viewer.scene;

      // ---------- Starfield skybox ----------
      scene.skyBox = new Cesium.SkyBox({
        sources: {
          positiveX: CESIUM_CDN + '/Assets/Textures/SkyBox/tycho2t3_80_px.jpg',
          negativeX: CESIUM_CDN + '/Assets/Textures/SkyBox/tycho2t3_80_mx.jpg',
          positiveY: CESIUM_CDN + '/Assets/Textures/SkyBox/tycho2t3_80_py.jpg',
          negativeY: CESIUM_CDN + '/Assets/Textures/SkyBox/tycho2t3_80_my.jpg',
          positiveZ: CESIUM_CDN + '/Assets/Textures/SkyBox/tycho2t3_80_pz.jpg',
          negativeZ: CESIUM_CDN + '/Assets/Textures/SkyBox/tycho2t3_80_mz.jpg',
        },
      }) as CesiumType.SkyBox;
      scene.skyBox.show = true;

      // ---------- Globe appearance ----------
      scene.globe.baseColor = Cesium.Color.fromCssColorString('#1a3a5c');
      if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
      scene.backgroundColor = Cesium.Color.BLACK;
      scene.globe.enableLighting = false;
      scene.fog.enabled = false;
      scene.sun.show = false;
      scene.moon.show = false;
      scene.globe.showGroundAtmosphere = false;
      scene.globe.showSkirts = false;
      scene.globe.depthTestAgainstTerrain = true;

      // ---------- Earth imagery ----------
      let imageryOk = false;
      try {
        const ne2Provider = await Cesium.TileMapServiceImageryProvider.fromUrl(
          CESIUM_CDN + '/Assets/Textures/NaturalEarthII/',
          { maximumLevel: 2 }
        );
        viewer.imageryLayers.addImageryProvider(ne2Provider);
        imageryOk = true;
      } catch (e) {
        console.warn('[useCesium] TMS fromUrl failed, trying constructor:', e);
      }

      if (!imageryOk) {
        try {
          const ne2Provider = new (Cesium as unknown as { TileMapServiceImageryProvider: new (opts: Record<string, unknown>) => CesiumType.ImageryProvider }).TileMapServiceImageryProvider({
            url: CESIUM_CDN + '/Assets/Textures/NaturalEarthII/',
            maximumLevel: 2,
          });
          viewer.imageryLayers.addImageryProvider(ne2Provider);
          imageryOk = true;
        } catch (e2) {
          console.warn('[useCesium] TMS constructor also failed:', e2);
        }
      }

      if (!imageryOk) {
        try {
          viewer.imageryLayers.addImageryProvider(
            new Cesium.GridImageryProvider({
              cells: 8,
              color: Cesium.Color.WHITE.withAlpha(0.5),
              glowColor: Cesium.Color.CYAN.withAlpha(0.3),
              glowWidth: 2,
            })
          );
        } catch { /* ignore */ }
      }

      viewer.requestRenderMode = false;

      try {
        const creditContainer = viewer.cesiumWidget.creditContainer as HTMLElement;
        if (creditContainer) creditContainer.style.display = 'none';
      } catch { /* ignore */ }

      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(0, 0, 45000000),
        orientation: {
          heading: 0.0,
          pitch: Cesium.Math.toRadians(-90),
          roll: 0.0,
        },
      });

      scene.requestRender();

      const instance: CesiumInstance = {
        viewer,
        scene,
        Cesium,
        satelliteEntities: new Map(),
        orbitEntities: new Map(),
      };

      cesiumRef.current = instance;
      setCesium(instance);
      console.log('[useCesium] Viewer initialized, imagery layers:', viewer.imageryLayers.length);
    } catch (err) {
      console.error('[useCesium] Failed to initialize Viewer:', err);
      setLoadError(err instanceof Error ? err.message : String(err));
      initializedRef.current = false;
      throw err;
    }
  }, []);

  const destroyCesium = useCallback(() => {
    const inst = cesiumRef.current;
    if (!inst) return;
    try {
      inst.satelliteEntities.forEach(e => e.destroy());
      inst.orbitEntities.forEach(e => e.destroy());
      inst.satelliteEntities.clear();
      inst.orbitEntities.clear();
      if (!inst.viewer.isDestroyed()) {
        inst.viewer.destroy();
      }
    } catch (e) {
      console.warn('[useCesium] Cleanup error:', e);
    }
    cesiumRef.current = null;
    initializedRef.current = false;
    setCesium(null);
  }, []);

  const flyToSatellite = useCallback((satellite: SpaceObject) => {
    const inst = cesiumRef.current;
    if (!inst) return;
    const { Cartesian3, HeadingPitchRange, Math: CesiumMath } = inst.Cesium;
    const entity = inst.viewer.entities.getById(`satellite-${satellite.noradId}`);
    if (entity) {
      inst.viewer.flyTo(entity, {
        offset: new HeadingPitchRange(0, CesiumMath.toRadians(-45), 2000000),
        duration: 1.5,
      });
    } else {
      const pos = calculateSatellitePosition(satellite.tleData, new Date());
      if (pos) {
        const mag = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
        const offsetMag = mag + 2000000;
        const camX = (pos.x / mag) * offsetMag;
        const camY = (pos.y / mag) * offsetMag;
        const camZ = (pos.z / mag) * offsetMag;
        inst.viewer.camera.flyTo({
          destination: new Cartesian3(camX, camY, camZ),
          orientation: {
            heading: 0,
            pitch: CesiumMath.toRadians(-45),
            roll: 0,
          },
          duration: 1.5,
        });
      }
    }
  }, []);

  const resetView = useCallback(() => {
    const inst = cesiumRef.current;
    if (!inst) return;
    inst.viewer.camera.flyTo({
      destination: inst.Cesium.Cartesian3.fromDegrees(0, 0, 45000000),
      orientation: {
        heading: 0.0,
        pitch: inst.Cesium.Math.toRadians(-90),
        roll: 0.0,
      },
      duration: 1.5,
    });
  }, []);

  const updateSatellitePositions = useCallback(
    (satellites: SpaceObject[], time: Date) => {
      const inst = cesiumRef.current;
      if (!inst) return;

      const visible = satellites.length > MAX_VISIBLE_SATELLITES
        ? satellites.slice(0, MAX_VISIBLE_SATELLITES)
        : satellites;

      const existingIds = new Set(inst.satelliteEntities.keys());
      const currentIds = new Set(visible.map(s => s.noradId));

      existingIds.forEach(id => {
        if (!currentIds.has(id)) {
          const ent = inst.satelliteEntities.get(id);
          if (ent) { ent.destroy(); inst.satelliteEntities.delete(id); }
        }
      });

      const C = inst.Cesium;
      visible.forEach(sat => {
        const pos = calculateSatellitePosition(sat.tleData, time);
        if (!pos) return;
        const color = getSatelliteColor(sat.objectType);
        const existing = inst.satelliteEntities.get(sat.noradId);
        if (existing) {
          existing.update({ position: pos, color });
        } else {
          const result = createSatelliteEntity(C, inst.viewer.entities, {
            noradId: sat.noradId,
            name: sat.name,
            position: pos,
            color,
            isSelected: false,
            showLabel: true,
          });
          inst.satelliteEntities.set(sat.noradId, { update: result.update, destroy: result.destroy });
        }
      });
    },
    []
  );

  const updateOrbits = useCallback((satellites: SpaceObject[], time: Date) => {
    const inst = cesiumRef.current;
    if (!inst) return;

    const existingIds = new Set(inst.orbitEntities.keys());
    const currentIds = new Set(satellites.map(s => s.noradId));

    existingIds.forEach(id => {
      if (!currentIds.has(id)) {
        const e = inst.orbitEntities.get(id);
        if (e) { e.destroy(); inst.orbitEntities.delete(id); }
      }
    });

    const orbitSats = satellites.slice(0, 200);
    const C = inst.Cesium;

    orbitSats.forEach(sat => {
      const points = generateOrbitPoints(sat.tleData, time);
      const color = getSatelliteColor(sat.objectType);
      const existing = inst.orbitEntities.get(sat.noradId);

      if (existing) {
        existing.update({ points, color });
      } else {
        const trailResult = createOrbitTrail(C, inst.viewer.entities, {
          noradId: sat.noradId, points, color, isSelected: false,
        });
        inst.orbitEntities.set(sat.noradId, { update: trailResult.update, destroy: trailResult.destroy });
      }
    });
  }, []);

  const setSelectedSatellite = useCallback((noradId: number | null) => {
    const inst = cesiumRef.current;
    if (!inst) return;
    inst.satelliteEntities.forEach((ent, id) => ent.update({ isSelected: id === noradId }));
    inst.orbitEntities.forEach((ent, id) => ent.update({ isSelected: id === noradId }));
  }, []);

  // --- Continuous satellite tracking ---
  // Uses preUpdate event to keep camera centered on the satellite.
  // Avoids viewer.trackedEntity which can cause orbit entity re-evaluation.
  const trackedSatRef = useRef<{ satellite: SpaceObject; listener: () => void } | null>(null);

  const startTracking = useCallback((satellite: SpaceObject) => {
    const inst = cesiumRef.current;
    if (!inst) return;

    // Stop any previous tracking
    if (trackedSatRef.current) {
      trackedSatRef.current.listener();
      trackedSatRef.current = null;
    }

    const { Cesium } = inst;
    const viewer = inst.viewer;

    // Fly to satellite first
    flyToSatellite(satellite);

    // Track via preUpdate: on each frame, center camera on satellite position
    // using the app's simulation time (NOT viewer.clock.currentTime).
    const TRACKING_RANGE = 2500000; // 2500 km, fixed to avoid RangeError

    const listener = viewer.scene.preUpdate.addEventListener(() => {
      const simTime = useTimeStore.getState().currentTime;
      const pos = calculateSatellitePosition(satellite.tleData, simTime);
      if (!pos) return;
      viewer.camera.lookAt(
        pos,
        new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), TRACKING_RANGE)
      );
    });

    trackedSatRef.current = { satellite, listener };
  }, [flyToSatellite]);

  const stopTracking = useCallback(() => {
    if (trackedSatRef.current) {
      trackedSatRef.current.listener();
      trackedSatRef.current = null;
    }
    // Release camera from lookAt lock
    const inst = cesiumRef.current;
    if (inst) {
      inst.viewer.camera.lookAtTransform(inst.Cesium.Matrix4.IDENTITY);
    }
  }, []);

  // Regenerate orbit trail for a specific satellite at the current sim time.
  // Used when tracking starts to ensure the orbit matches the satellite's path.
  const regenerateOrbit = useCallback((satellite: SpaceObject) => {
    const inst = cesiumRef.current;
    if (!inst) return;
    const simTime = useTimeStore.getState().currentTime;
    const points = generateOrbitPoints(satellite.tleData, simTime);
    const color = getSatelliteColor(satellite.objectType);
    const existing = inst.orbitEntities.get(satellite.noradId);
    if (existing) {
      existing.update({ points, color });
    }
  }, []);

  // Cleanup tracking on unmount
  useEffect(() => {
    return () => {
      if (trackedSatRef.current) {
        trackedSatRef.current.listener();
        trackedSatRef.current = null;
      }
    };
  }, []);

  return {
    isReady: !!cesium,
    loadError,
    viewer: cesium?.viewer ?? null,
    scene: cesium?.scene ?? null,
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
  };
}
