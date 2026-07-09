'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import * as Cesium from 'cesium';
import type { SpaceObject } from '@/store/satelliteStore';
import { createSatelliteEntity, getSatelliteColor } from '@/components/visualization/SatelliteEntity';
import { createOrbitTrail } from '@/components/visualization/OrbitTrail';
import { calculateSatellitePosition, generateOrbitPoints } from '@/lib/cesium/positions';

// CESIUM_BASE_URL must be set for workers/assets/widgets to resolve.
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).CESIUM_BASE_URL = '/cesium/';
}

// Disable Cesium Ion to prevent external network requests and access token errors.
Cesium.Ion.defaultAccessToken = '';

interface CesiumInstance {
  viewer: Cesium.Viewer;
  scene: Cesium.Scene;
  Cesium: typeof Cesium;
  satelliteEntities: Map<number, { update: (config: Record<string, unknown>) => void; destroy: () => void }>;
  orbitEntities: Map<number, { update: (config: Record<string, unknown>) => void; destroy: () => void }>;
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
    // Prevent double-initialization (React StrictMode in dev)
    if (initializedRef.current) return;
    initializedRef.current = true;

    try {
      // Create viewer with NO default imagery layer
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
        imageryProvider: false as unknown as Cesium.ImageryProvider,
      });

      const scene = viewer.scene;

      // ---------- Starfield skybox ----------
      scene.skyBox = new Cesium.SkyBox({
        sources: {
          positiveX: '/cesium/Assets/Textures/SkyBox/tycho2t3_80_px.jpg',
          negativeX: '/cesium/Assets/Textures/SkyBox/tycho2t3_80_mx.jpg',
          positiveY: '/cesium/Assets/Textures/SkyBox/tycho2t3_80_py.jpg',
          negativeY: '/cesium/Assets/Textures/SkyBox/tycho2t3_80_my.jpg',
          positiveZ: '/cesium/Assets/Textures/SkyBox/tycho2t3_80_pz.jpg',
          negativeZ: '/cesium/Assets/Textures/SkyBox/tycho2t3_80_mz.jpg',
        },
      }) as Cesium.SkyBox;
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
      // Enable depth test against globe so satellites/orbits behind Earth are occluded
      scene.globe.depthTestAgainstTerrain = true;

      // ---------- Earth imagery: Use Cesium's built-in TileMapServiceImageryProvider
      // which correctly reads tilemapresource.xml for tiling scheme ----------
      let imageryOk = false;
      try {
        const ne2Provider = await Cesium.TileMapServiceImageryProvider.fromUrl(
          '/cesium/Assets/Textures/NaturalEarthII/',
          { maximumLevel: 2 }
        );
        viewer.imageryLayers.addImageryProvider(ne2Provider);
        imageryOk = true;
      } catch (e) {
        console.warn('[useCesium] TMS fromUrl failed, trying constructor:', e);
      }

      if (!imageryOk) {
        try {
          // Legacy constructor approach for older Cesium versions
          const ne2Provider = new (Cesium as any).TileMapServiceImageryProvider({
            url: '/cesium/Assets/Textures/NaturalEarthII/',
            maximumLevel: 2,
          });
          viewer.imageryLayers.addImageryProvider(ne2Provider);
          imageryOk = true;
        } catch (e2) {
          console.warn('[useCesium] TMS constructor also failed:', e2);
        }
      }

      if (!imageryOk) {
        // Fallback: grid
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

      // Continuous rendering
      viewer.requestRenderMode = false;

      // Hide credit container
      try {
        const creditContainer = viewer.cesiumWidget.creditContainer as HTMLElement;
        if (creditContainer) creditContainer.style.display = 'none';
      } catch { /* ignore */ }

      // ---------- Disable entity clustering for small datasets ----------
      // Clustering merges nearby satellites into pins, hiding individual labels
      // For now, disable it so labels and points are always visible
      // (We'll re-enable with proper settings later when dealing with large datasets)

      // ---------- Camera: view Earth straight down, centered on screen ----------
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
    // Use Cesium's built-in flyTo to center the satellite entity
    const entity = inst.viewer.entities.getById(`satellite-${satellite.noradId}`);
    if (entity) {
      inst.viewer.flyTo(entity, {
        offset: new HeadingPitchRange(0, CesiumMath.toRadians(-45), 2000000),
        duration: 1.5,
      });
    } else {
      // Fallback: calculate camera position manually
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
      destination: Cesium.Cartesian3.fromDegrees(0, 0, 45000000),
      orientation: {
        heading: 0.0,
        pitch: Cesium.Math.toRadians(-90),
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

      // Remove satellites no longer in list
      existingIds.forEach(id => {
        if (!currentIds.has(id)) {
          const ent = inst.satelliteEntities.get(id);
          if (ent) { ent.destroy(); inst.satelliteEntities.delete(id); }
        }
      });

      const C = inst.Cesium;
      // Add/update satellites - all entities go into viewer.entities (single collection)
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

    // Remove orbits no longer needed
    existingIds.forEach(id => {
      if (!currentIds.has(id)) {
        const e = inst.orbitEntities.get(id);
        if (e) { e.destroy(); inst.orbitEntities.delete(id); }
      }
    });

    const orbitSats = satellites.slice(0, 200);
    const C = inst.Cesium;

    // Each satellite gets exactly ONE orbit trail (no duplicate predicted orbits)
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
  };
}
