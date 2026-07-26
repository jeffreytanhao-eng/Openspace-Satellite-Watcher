'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type * as CesiumType from 'cesium';
import type { SpaceObject } from '@/store/satelliteStore';
import { useTimeStore } from '@/store/timeStore';
import { createSatelliteEntity, getSatelliteColor } from '@/components/visualization/SatelliteEntity';
import { createOrbitTrail } from '@/components/visualization/OrbitTrail';
import { calculateSatellitePosition, generateOrbitPoints } from '@/lib/cesium/positions';
import type { Aoi } from '@/lib/trea/constants';
import type { TLEData } from '@/lib/tle/parser';

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
  // TREA-01 任务专用实体集合(AOI 多边形 + TREA-01 卫星 + 轨道线)
  // 与 satelliteEntities/orbitEntities 完全隔离,clearMissionEntities 只清理这些
  missionAoiEntities: Map<string, CesiumType.Entity>;
  missionTrea01Entity: { update: (config: Record<string, unknown>) => void; destroy: () => void } | null;
  // TREA-01 轨道线实体:紫色 Polyline,跟随 TLE 变化(变轨后更新)
  missionTrea01OrbitEntity: CesiumType.Entity | null;
  // 成像足迹实体(M4 / Task 11):随卫星移动的矩形传感器足印多边形
  // 与 missionAoiEntities/missionTrea01Entity 隔离,clearImagingFootprint 只清理此实体
  missionFootprintEntity: CesiumType.Entity | null;
  // 变轨可视化专用实体集合(燃烧弧 + 新旧轨道对比)
  // 与 missionAoiEntities/missionTrea01Entity 隔离,clearManeuverEntities 只清理这些
  missionManeuverEntities: CesiumType.Entity[];
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
        destination: Cesium.Cartesian3.fromDegrees(110, 30, 20000000),
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
        missionAoiEntities: new Map(),
        missionTrea01Entity: null,
        missionTrea01OrbitEntity: null,
        missionFootprintEntity: null,
        missionManeuverEntities: [],
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
      // 清理 TREA-01 任务实体
      inst.missionAoiEntities.forEach(e => {
        try { inst.viewer.entities.remove(e); } catch { /* ignore */ }
      });
      inst.missionAoiEntities.clear();
      if (inst.missionTrea01Entity) {
        inst.missionTrea01Entity.destroy();
        inst.missionTrea01Entity = null;
      }
      // 清理 TREA-01 轨道线实体
      if (inst.missionTrea01OrbitEntity) {
        try { inst.viewer.entities.remove(inst.missionTrea01OrbitEntity); } catch { /* ignore */ }
        inst.missionTrea01OrbitEntity = null;
      }
      // 清理成像足迹实体
      if (inst.missionFootprintEntity) {
        try { inst.viewer.entities.remove(inst.missionFootprintEntity); } catch { /* ignore */ }
        inst.missionFootprintEntity = null;
      }
      // 清理变轨可视化实体
      inst.missionManeuverEntities.forEach(e => {
        try { inst.viewer.entities.remove(e); } catch { /* ignore */ }
      });
      inst.missionManeuverEntities = [];
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
      destination: inst.Cesium.Cartesian3.fromDegrees(110, 30, 20000000),
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
            model3dUrl: sat.model3dUrl,  // 有 GLB 模型时创建隐藏的 model graphics,跟踪时才显示
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
    // 选中时切换为 3D 模型显示(有 GLB 模型的卫星),取消选中切回光点
    inst.satelliteEntities.forEach((ent, id) => {
      const isSelected = id === noradId;
      ent.update({ isSelected, useModel: isSelected });
    });
    inst.orbitEntities.forEach((ent, id) => ent.update({ isSelected: id === noradId }));
  }, []);

  // --- Continuous satellite tracking ---
  // Uses preUpdate event to keep camera centered on the satellite.
  // Avoids viewer.trackedEntity which can cause orbit entity re-evaluation.
  const trackedSatRef = useRef<{
    satellite: SpaceObject;
    listener: () => void;
    wheelHandler: () => void;
    trackedEntity: any;
    baseScale: number;
  } | null>(null);
  const trackingRangeRef = useRef(2500000);

  const startTracking = useCallback((satellite: SpaceObject) => {
    const inst = cesiumRef.current;
    if (!inst) return;

    // Stop any previous tracking
    if (trackedSatRef.current) {
      trackedSatRef.current.listener();
      trackedSatRef.current.wheelHandler();
      // 恢复模型 scale 到 baseScale(停止手动动态缩放)
      if (trackedSatRef.current.trackedEntity?.model && trackedSatRef.current.baseScale) {
        trackedSatRef.current.trackedEntity.model.scale = new inst.Cesium.ConstantProperty(trackedSatRef.current.baseScale);
      }
      trackedSatRef.current = null;
    }

    const { Cesium } = inst;
    const viewer = inst.viewer;

    // Reset tracking range on new tracking session
    trackingRangeRef.current = 2500000;

    // Fly to satellite first
    flyToSatellite(satellite);

    // 模型显示由选中状态控制(setSelectedSatellite),跟踪不再切换 useModel

    // 获取被跟踪实体和基础 scale(用于手动动态缩放)
    // 某些模型(如 LANDSAT 8/AURA)的 Cesium 自动透视缩放失效(bounding sphere 异常),
    // 改为每帧手动设 scale = baseScale * (REF_RANGE / range)
    // 拉近(range 小)→ scale 增大 → 模型变大;拉远 → 缩小
    const trackedEntity = inst.viewer.entities.getById(`satellite-${satellite.noradId}`);
    let baseScale = 3000;
    if (trackedEntity?.model?.scale) {
      const val = trackedEntity.model.scale.getValue?.(viewer.clock.currentTime);
      if (typeof val === 'number' && val > 0) baseScale = val;
    }

    // Disable Cesium's default zoom so it doesn't conflict with our custom wheel handler.
    // lookAt() locks the camera each frame; default zoom tries to move camera position
    // which gets overwritten, causing inconsistent zoom behavior (especially zoom-out).
    viewer.scene.screenSpaceCameraController.enableZoom = false;

    const REF_RANGE = 2500000; // 基准距离,range=REF_RANGE 时 scale=baseScale(初始不变)

    // Track via preUpdate: on each frame, center camera on satellite position
    // using the app's simulation time (NOT viewer.clock.currentTime).
    // 同时手动动态缩放模型 scale(解决部分模型不能随滚轮缩放的问题)
    const listener = viewer.scene.preUpdate.addEventListener(() => {
      const simTime = useTimeStore.getState().currentTime;
      const pos = calculateSatellitePosition(satellite.tleData, simTime);
      if (!pos) return;
      viewer.camera.lookAt(
        pos,
        new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), trackingRangeRef.current)
      );
      // 手动动态缩放:拉近(range 小)→ scale 增大 → 模型变大
      if (trackedEntity?.model) {
        const range = trackingRangeRef.current;
        const dynamicScale = baseScale * (REF_RANGE / range);
        trackedEntity.model.scale = new Cesium.ConstantProperty(dynamicScale);
      }
    });

    // Use native DOM wheel event instead of Cesium's ScreenSpaceEventHandler.
    // Cesium's internal WHEEL handler can swallow/alter the event before our handler runs,
    // causing zoom-out (deltaY > 0) to not work reliably. Native listener with
    // preventDefault + capture phase ensures we receive the raw event first.
    const canvas = viewer.scene.canvas as HTMLCanvasElement;
    const wheelListener = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // deltaY > 0 = 滚轮向下 = 拉远；deltaY < 0 = 滚轮向上 = 拉近
      const factor = e.deltaY > 0 ? 1.15 : 0.87;
      // 最小 100km 让用户能拉近看模型细节;最大 20000km
      trackingRangeRef.current = Math.max(100000, Math.min(20000000, trackingRangeRef.current * factor));
    };
    canvas.addEventListener('wheel', wheelListener, { capture: true, passive: false });

    trackedSatRef.current = {
      satellite,
      listener,
      wheelHandler: () => canvas.removeEventListener('wheel', wheelListener, { capture: true } as EventListenerOptions),
      trackedEntity,
      baseScale,
    };
  }, [flyToSatellite]);

  const stopTracking = useCallback(() => {
    const inst = cesiumRef.current;
    if (trackedSatRef.current) {
      trackedSatRef.current.listener();
      trackedSatRef.current.wheelHandler();
      // 恢复模型 scale 到 baseScale(停止手动动态缩放)
      // 模型显示由选中状态控制,跟踪停止不切回光点(保持选中状态)
      if (inst && trackedSatRef.current.trackedEntity?.model && trackedSatRef.current.baseScale) {
        trackedSatRef.current.trackedEntity.model.scale = new inst.Cesium.ConstantProperty(trackedSatRef.current.baseScale);
      }
      trackedSatRef.current = null;
    }
    // Release camera from lookAt lock and restore default zoom
    if (inst) {
      inst.viewer.camera.lookAtTransform(inst.Cesium.Matrix4.IDENTITY);
      inst.viewer.scene.screenSpaceCameraController.enableZoom = true;
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
        trackedSatRef.current.wheelHandler();
        trackedSatRef.current = null;
      }
    };
  }, []);

  // ============================================================
  // TREA-01 任务专用方法
  // ============================================================

  /**
   * 添加 AOI(关注区域)实体到 Cesium 场景
   * 渲染为半透明多边形(不透明度 0.4)+ 名称标签
   * 与默认卫星实体完全隔离,存入 missionAoiEntities
   */
  const addAoiEntity = useCallback((aoi: Aoi) => {
    const inst = cesiumRef.current;
    if (!inst) return;
    const { Cesium, viewer } = inst;

    // 已存在则先移除,避免重复
    const existing = inst.missionAoiEntities.get(aoi.id);
    if (existing) {
      try { viewer.entities.remove(existing); } catch { /* ignore */ }
      inst.missionAoiEntities.delete(aoi.id);
    }

    // 将 [lon, lat] 顶点数组转为 Cesium.Cartesian3 数组
    const positions = aoi.polygon.map(([lon, lat]) =>
      Cesium.Cartesian3.fromDegrees(lon, lat)
    );

    // 半透明多边形(不透明度 0.4)+ 边界线
    const aoiColor = Cesium.Color.fromCssColorString('#ff6b35').withAlpha(0.4);
    const outlineColor = Cesium.Color.fromCssColorString('#ff6b35');

    const entity = viewer.entities.add({
      id: `trea-aoi-${aoi.id}`,
      name: aoi.name,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(positions),
        material: aoiColor,
        outline: true,
        outlineColor,
      },
      // 中心点标签
      position: Cesium.Cartesian3.fromDegrees(aoi.center.lon, aoi.center.lat),
      label: {
        text: aoi.name,
        font: 'bold 13px "Microsoft YaHei", sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -12),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        showBackground: true,
        backgroundColor: new Cesium.Color(0, 0, 0, 0.75),
        backgroundPadding: new Cesium.Cartesian2(6, 3),
      },
    });

    inst.missionAoiEntities.set(aoi.id, entity);
  }, []);

  /**
   * 添加 TREA-01 卫星实体到 Cesium 场景
   * 复用 createSatelliteEntity,实体 id 为 satellite-99999(虚构 NORAD ID)
   * 存入 missionTrea01Entity,与默认卫星实体集合隔离
   */
  const addTrea01Entity = useCallback((tle: TLEData) => {
    const inst = cesiumRef.current;
    if (!inst) return;
    const { Cesium, viewer } = inst;

    // 已存在则先销毁
    if (inst.missionTrea01Entity) {
      inst.missionTrea01Entity.destroy();
      inst.missionTrea01Entity = null;
    }

    // 计算初始位置(米制 ECI)
    const pos = calculateSatellitePosition([tle], new Date());
    if (!pos) {
      console.warn('[useCesium] TREA-01 初始位置计算失败');
      return;
    }

    // TREA-01 专用颜色:紫色,与默认卫星(青色/绿色)区分
    const treaColor = '#b366ff';
    const noradId = 99999;

    const result = createSatelliteEntity(Cesium, viewer.entities, {
      noradId,
      name: tle.name,
      position: pos,
      color: treaColor,
      isSelected: false,
      showLabel: true,
    });

    inst.missionTrea01Entity = { update: result.update, destroy: result.destroy };
  }, []);

  /**
   * 添加/更新 TREA-01 轨道线(紫色 Polyline,一整圈闭合轨道)
   * 使用 generateOrbitPoints 采样一整圈轨道,绘制发光紫色线
   * 变轨后重新调用即可更新轨道线(先清理旧实体)
   *
   * @param tle TREA-01 当前 TLE(变轨后传入新 TLE)
   * @param time 采样起始时间(通常为仿真当前时间)
   */
  const addTrea01OrbitLine = useCallback((tle: TLEData, time: Date) => {
    const inst = cesiumRef.current;
    if (!inst) return;
    const { Cesium, viewer } = inst;

    // 清理旧轨道线
    if (inst.missionTrea01OrbitEntity) {
      try { viewer.entities.remove(inst.missionTrea01OrbitEntity); } catch { /* ignore */ }
      inst.missionTrea01OrbitEntity = null;
    }

    // 采样一整圈轨道点(ECI 米制)
    const points = generateOrbitPoints([tle], time, 180);
    if (!points || points.length < 2) return;

    // 转换为 Cesium.Cartesian3
    const positions = points.map(p => new Cesium.Cartesian3(p.x, p.y, p.z));

    // 紫色发光轨道线(与 TREA-01 卫星颜色一致 #b366ff)
    const orbitColor = Cesium.Color.fromCssColorString('#b366ff').withAlpha(0.8);
    const entity = viewer.entities.add({
      id: `trea01-orbit-${Date.now()}`,
      name: 'TREA-01 Orbit',
      polyline: {
        positions: new Cesium.ConstantProperty(positions),
        width: new Cesium.ConstantProperty(2),
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.25,
          color: orbitColor,
        }),
        arcType: new Cesium.ConstantProperty(Cesium.ArcType.NONE),
        show: new Cesium.ConstantProperty(true),
      },
    });

    inst.missionTrea01OrbitEntity = entity;
  }, []);

  /**
   * 飞向 TREA-01 卫星:优先飞向实体,实体不存在则飞向当前位置
   */
  const focusTrea01 = useCallback(() => {
    const inst = cesiumRef.current;
    if (!inst) return;
    const { Cesium, viewer } = inst;
    const noradId = 99999;
    const entity = viewer.entities.getById(`satellite-${noradId}`);
    if (entity) {
      viewer.flyTo(entity, {
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), 2500000),
        duration: 1.5,
      });
    }
  }, []);

  /**
   * 清理所有 TREA-01 任务实体(AOI 多边形 + TREA-01 卫星 + 成像足迹)
   * 不影响默认卫星实体和轨道
   */
  const clearMissionEntities = useCallback(() => {
    const inst = cesiumRef.current;
    if (!inst) return;
    // 清理 AOI
    inst.missionAoiEntities.forEach(e => {
      try { inst.viewer.entities.remove(e); } catch { /* ignore */ }
    });
    inst.missionAoiEntities.clear();
    // 清理 TREA-01 卫星
    if (inst.missionTrea01Entity) {
      inst.missionTrea01Entity.destroy();
      inst.missionTrea01Entity = null;
    }
    // 清理 TREA-01 轨道线
    if (inst.missionTrea01OrbitEntity) {
      try { inst.viewer.entities.remove(inst.missionTrea01OrbitEntity); } catch { /* ignore */ }
      inst.missionTrea01OrbitEntity = null;
    }
    // 清理成像足迹
    if (inst.missionFootprintEntity) {
      try { inst.viewer.entities.remove(inst.missionFootprintEntity); } catch { /* ignore */ }
      inst.missionFootprintEntity = null;
    }
  }, []);

  /**
   * 更新 TREA-01 卫星位置(每帧调用,跟随仿真时间传播)
   * 仅在 missionTrea01Entity 存在时生效
   */
  const updateTrea01Position = useCallback((tle: TLEData, time: Date) => {
    const inst = cesiumRef.current;
    if (!inst || !inst.missionTrea01Entity) return;
    const pos = calculateSatellitePosition([tle], time);
    if (pos) {
      inst.missionTrea01Entity.update({ position: pos });
    }
  }, []);

  // ============================================================
  // TREA-01 成像足迹可视化(M4 / Task 11)
  // ============================================================
  // 传感器足迹:以星下点为中心、widthKm × widthKm 的矩形多边形
  // 亮色 #00ff88 半透明(不透明度 0.5),随卫星移动
  // 用于 IMAGING 阶段实时显示传感器覆盖范围

  /** 1 度纬度对应的地面距离(km,近似) */
  const KM_PER_DEG_LAT_FP = 111.32;

  /**
   * 根据星下点和传感器宽度计算足迹矩形 4 顶点(顺时针闭合)
   * 矩形对齐经纬度网格:沿迹/跨迹均取 widthKm
   * @param center 星下点 {lon, lat}(经度需为 [-180, 180])
   * @param widthKm 足迹宽度(km)
   */
  function computeFootprintCorners(
    center: { lon: number; lat: number },
    widthKm: number
  ): Array<{ lon: number; lat: number }> {
    const halfKm = widthKm / 2;
    // 纬度方向:1° ≈ 111.32km(与纬度无关)
    const halfLat = halfKm / KM_PER_DEG_LAT_FP;
    // 经度方向:1° ≈ 111.32 * cos(lat) km(高纬度变窄,极点退化)
    const cosLat = Math.cos((center.lat * Math.PI) / 180);
    const halfLon = cosLat > 1e-6 ? halfKm / (KM_PER_DEG_LAT_FP * cosLat) : 0;

    // 4 顶点顺时针闭合(左下 → 右下 → 右上 → 左上)
    return [
      { lon: center.lon - halfLon, lat: center.lat - halfLat },
      { lon: center.lon + halfLon, lat: center.lat - halfLat },
      { lon: center.lon + halfLon, lat: center.lat + halfLat },
      { lon: center.lon - halfLon, lat: center.lat + halfLat },
    ];
  }

  /**
   * 添加成像足迹实体到 Cesium 场景
   * 渲染为亮色 #00ff88 半透明矩形(不透明度 0.5)+ 边界线
   * 若已存在则先移除,避免重复
   *
   * @param centerLonLat 星下点中心 {lon, lat}(经度 [-180, 180])
   * @param widthKm 足迹宽度(km)
   */
  const addImagingFootprint = useCallback(
    (centerLonLat: { lon: number; lat: number }, widthKm: number) => {
      const inst = cesiumRef.current;
      if (!inst) return;
      const { Cesium, viewer } = inst;

      // 已存在则先移除
      if (inst.missionFootprintEntity) {
        try { viewer.entities.remove(inst.missionFootprintEntity); } catch { /* ignore */ }
        inst.missionFootprintEntity = null;
      }

      const corners = computeFootprintCorners(centerLonLat, widthKm);
      const positions = corners.map(c => Cesium.Cartesian3.fromDegrees(c.lon, c.lat));

      // 亮色 #00ff88 半透明填充(不透明度 0.5)+ 亮色边界线
      const fillColor = Cesium.Color.fromCssColorString('#00ff88').withAlpha(0.5);
      const outlineColor = Cesium.Color.fromCssColorString('#00ff88');

      const entity = viewer.entities.add({
        id: `trea-imaging-footprint-${Date.now()}`,
        name: 'TREA-01 Imaging Footprint',
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(positions),
          material: fillColor,
          outline: true,
          outlineColor,
        },
      });

      inst.missionFootprintEntity = entity;
    },
    []
  );

  /**
   * 更新成像足迹位置(随卫星移动,每帧调用)
   * 通过替换 polygon hierarchy 实现位置更新
   * 若足迹实体不存在则静默跳过(避免每帧日志噪声)
   *
   * @param centerLonLat 星下点中心 {lon, lat}(经度 [-180, 180])
   * @param widthKm 足迹宽度(km)
   */
  const updateImagingFootprint = useCallback(
    (centerLonLat: { lon: number; lat: number }, widthKm: number) => {
      const inst = cesiumRef.current;
      if (!inst || !inst.missionFootprintEntity) return;
      const { Cesium } = inst;

      const corners = computeFootprintCorners(centerLonLat, widthKm);
      const positions = corners.map(c => Cesium.Cartesian3.fromDegrees(c.lon, c.lat));

      // 替换 polygon hierarchy(每帧更新位置)
      inst.missionFootprintEntity.polygon!.hierarchy = new Cesium.ConstantProperty(
        new Cesium.PolygonHierarchy(positions)
      );
    },
    []
  );

  /**
   * 移除成像足迹实体
   * 不影响 AOI、TREA-01 卫星、默认卫星实体和默认轨道
   */
  const clearImagingFootprint = useCallback(() => {
    const inst = cesiumRef.current;
    if (!inst || !inst.missionFootprintEntity) return;
    try { inst.viewer.entities.remove(inst.missionFootprintEntity); } catch { /* ignore */ }
    inst.missionFootprintEntity = null;
  }, []);

  // ============================================================
  // TREA-01 变轨可视化专用方法
  // ============================================================

  /**
   * 添加燃烧弧高亮(变轨机动点可视化)
   * 使用亮橙色(#ff6b00)粗线 PolylineGraphics 标识机动燃烧段
   *
   * @param positions 燃烧弧位置点数组(ECI 米制 {x,y,z},与 generateOrbitPoints 输出一致)
   */
  const addManeuverArc = useCallback((positions: Array<{ x: number; y: number; z: number }>) => {
    const inst = cesiumRef.current;
    if (!inst) return;
    const { Cesium, viewer } = inst;

    // 点数不足,无法构成线
    if (!positions || positions.length < 2) return;

    // 转换为 Cesium.Cartesian3(ECI 米制,直接传入,与 OrbitTrail 模式一致)
    const cartesianPositions = positions.map(
      p => new Cesium.Cartesian3(p.x, p.y, p.z)
    );

    // 燃烧弧样式:亮橙色 + 粗线 + 发光效果,强调机动段
    const arcColor = Cesium.Color.fromCssColorString('#ff6b00').withAlpha(0.95);
    const entity = viewer.entities.add({
      id: `trea-maneuver-arc-${Date.now()}`,
      name: 'TREA-01 Maneuver Arc',
      polyline: {
        positions: new Cesium.ConstantProperty(cartesianPositions),
        width: new Cesium.ConstantProperty(5),
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.3,
          color: arcColor,
        }),
        arcType: new Cesium.ConstantProperty(Cesium.ArcType.NONE),
        show: new Cesium.ConstantProperty(true),
      },
    });

    inst.missionManeuverEntities.push(entity);
  }, []);

  /**
   * 添加新旧轨道对比可视化
   * - 旧轨道:灰色虚线(参考轨道)
   * - 新轨道:亮青色实线(机动后轨道)
   *
   * @param oldPoints 旧轨道点数组(ECI 米制)
   * @param newPoints 新轨道点数组(ECI 米制)
   */
  const addOrbitComparison = useCallback(
    (oldPoints: Array<{ x: number; y: number; z: number }>, newPoints: Array<{ x: number; y: number; z: number }>) => {
      const inst = cesiumRef.current;
      if (!inst) return;
      const { Cesium, viewer } = inst;

      const ts = Date.now();

      // ---- 旧轨道:灰色虚线 ----
      if (oldPoints && oldPoints.length >= 2) {
        const oldPositions = oldPoints.map(
          p => new Cesium.Cartesian3(p.x, p.y, p.z)
        );
        const oldColor = Cesium.Color.fromCssColorString('#888888').withAlpha(0.7);
        viewer.entities.add({
          id: `trea-maneuver-old-orbit-${ts}`,
          name: 'TREA-01 Old Orbit',
          polyline: {
            positions: new Cesium.ConstantProperty(oldPositions),
            width: new Cesium.ConstantProperty(1.5),
            material: new Cesium.PolylineDashMaterialProperty({
              color: oldColor,
              dashLength: 16.0,
            }),
            arcType: new Cesium.ConstantProperty(Cesium.ArcType.NONE),
            show: new Cesium.ConstantProperty(true),
          },
        });
        // 记录到 missionManeuverEntities 以便后续清理
        const oldEntity = viewer.entities.getById(`trea-maneuver-old-orbit-${ts}`);
        if (oldEntity) inst.missionManeuverEntities.push(oldEntity);
      }

      // ---- 新轨道:亮青色实线 ----
      if (newPoints && newPoints.length >= 2) {
        const newPositions = newPoints.map(
          p => new Cesium.Cartesian3(p.x, p.y, p.z)
        );
        const newColor = Cesium.Color.fromCssColorString('#00ffcc').withAlpha(0.9);
        viewer.entities.add({
          id: `trea-maneuver-new-orbit-${ts}`,
          name: 'TREA-01 New Orbit',
          polyline: {
            positions: new Cesium.ConstantProperty(newPositions),
            width: new Cesium.ConstantProperty(2.5),
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.2,
              color: newColor,
            }),
            arcType: new Cesium.ConstantProperty(Cesium.ArcType.NONE),
            show: new Cesium.ConstantProperty(true),
          },
        });
        const newEntity = viewer.entities.getById(`trea-maneuver-new-orbit-${ts}`);
        if (newEntity) inst.missionManeuverEntities.push(newEntity);
      }
    },
    []
  );

  /**
   * 清理所有变轨可视化实体(燃烧弧 + 新旧轨道对比)
   * 不影响 AOI、TREA-01 卫星、默认卫星实体和默认轨道
   */
  const clearManeuverEntities = useCallback(() => {
    const inst = cesiumRef.current;
    if (!inst) return;
    inst.missionManeuverEntities.forEach(e => {
      try { inst.viewer.entities.remove(e); } catch { /* ignore */ }
    });
    inst.missionManeuverEntities = [];
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
    addAoiEntity,
    addTrea01Entity,
    addTrea01OrbitLine,
    focusTrea01,
    clearMissionEntities,
    updateTrea01Position,
    // 成像足迹可视化方法(M4 / Task 11)
    addImagingFootprint,
    updateImagingFootprint,
    clearImagingFootprint,
    // 变轨可视化方法
    addManeuverArc,
    addOrbitComparison,
    clearManeuverEntities,
  };
}
