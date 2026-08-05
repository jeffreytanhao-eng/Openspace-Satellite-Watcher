'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type * as CesiumType from 'cesium';
import type { SpaceObject } from '@/store/satelliteStore';
import { useTimeStore } from '@/store/timeStore';
import { createSatelliteEntity, getSatelliteColor } from '@/components/visualization/SatelliteEntity';
import { createOrbitTrail } from '@/components/visualization/OrbitTrail';
import { calculateSatellitePosition, generateOrbitPointsECEF } from '@/lib/cesium/positions';
import { createEarthImageryProvider } from '@/lib/cesium/imagery';
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
  // 成像扫描带实体集合(持久化的足迹矩形,累积形成扫描覆盖区)
  // clearScanTrail/clearMissionEntities 清理这些
  missionScanTrailEntities: CesiumType.Entity[];
  // 成像扫描三角形光束实体集合(随卫星移动的金字塔光束,每帧更新位置)
  // clearScanBeam 清理这些
  missionScanBeamEntities: CesiumType.Entity[];
  // AOI 高亮临时实体(粗边框 polyline + 脉冲动画)
  // highlightAoi 创建,unhighlightAoi 清理;只高亮当前任务 AOI
  missionAoiHighlightEntity: CesiumType.Entity | null;
  // 连续累积扫描带实体(单个长条带 polygon,随卫星移动逐步扩展)
  // 替代旧版 addScanTrailPoint 的零散矩形,实现"连续 swath"
  missionContinuousSwathEntity: CesiumType.Entity | null;
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
        const { provider, ok } = await createEarthImageryProvider(Cesium, CESIUM_CDN);
        if (ok && provider) {
          viewer.imageryLayers.addImageryProvider(provider);
          imageryOk = true;
        }
      } catch (e) {
        console.warn('[useCesium] Earth imagery provider failed:', e);
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
        missionScanTrailEntities: [],
        missionScanBeamEntities: [],
        missionAoiHighlightEntity: null,
        missionContinuousSwathEntity: null,
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
      // 清理扫描带
      inst.missionScanTrailEntities.forEach(e => {
        try { inst.viewer.entities.remove(e); } catch { /* ignore */ }
      });
      inst.missionScanTrailEntities = [];
      // 清理扫描光束
      inst.missionScanBeamEntities.forEach(e => {
        try { inst.viewer.entities.remove(e); } catch { /* ignore */ }
      });
      inst.missionScanBeamEntities = [];
      // 清理 AOI 高亮实体
      if (inst.missionAoiHighlightEntity) {
        try { inst.viewer.entities.remove(inst.missionAoiHighlightEntity); } catch { /* ignore */ }
        inst.missionAoiHighlightEntity = null;
      }
      // 清理连续累积扫描带
      if (inst.missionContinuousSwathEntity) {
        try { inst.viewer.entities.remove(inst.missionContinuousSwathEntity); } catch { /* ignore */ }
        inst.missionContinuousSwathEntity = null;
      }
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
        const existing = inst.satelliteEntities.get(sat.noradId);
        if (!pos) {
          // 无有效位置(如已衰减/再入的卫星 SGP4 外推失败):隐藏已有实体,避免冻结在旧位置
          // 用户选中跟踪中的卫星除外(保留可见,否则跟踪相机失去目标会报错)
          if (existing && trackedSatRef.current?.satellite.noradId !== sat.noradId) {
            const ent = inst.viewer.entities.getById(`satellite-${sat.noradId}`);
            if (ent) ent.show = false;
          }
          return;
        }
        const color = getSatelliteColor(sat.objectType);
        if (existing) {
          existing.update({ position: pos, color });
          // 恢复可见(之前可能因位置无效被隐藏)
          const ent = inst.viewer.entities.getById(`satellite-${sat.noradId}`);
          if (ent) ent.show = true;
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
      const points = generateOrbitPointsECEF(sat.tleData, time);
      const color = getSatelliteColor(sat.objectType);
      const existing = inst.orbitEntities.get(sat.noradId);

      if (existing) {
        existing.update({ points, color });
        // 轨道点为空(已衰减卫星外推不可靠)时隐藏轨道线,避免残留上一帧的垃圾形状
        const ent = inst.viewer.entities.getById(`orbit-${sat.noradId}`);
        if (ent) ent.show = points.length >= 2;
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
    const points = generateOrbitPointsECEF(satellite.tleData, simTime);
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

    // 计算初始位置(使用仿真时间,与轨道线 currentTime 一致,避免 GMST 不匹配导致卫星偏离轨道)
    const pos = calculateSatellitePosition([tle], useTimeStore.getState().currentTime);
    if (!pos) {
      console.warn('[useCesium] TREA-01 初始位置计算失败');
      return;
    }

    // TREA-01 专用颜色:紫色,与默认卫星(青色/绿色)区分
    const treaColor = '#b366ff';
    const noradId = 99999;

    // TREA-01 复用 CALIPSO 3D 模型(对地观测激光雷达卫星,形态匹配 EO 卫星)
    // 任务模式下默认显示 3D 模型(非光点),跟踪时支持滚轮缩放
    // 使用 calipso-decoded.glb:已用 gltf-transform 解压 Draco 压缩,
    // 避免 Cesium 未配置 Draco 解码器导致模型不显示的问题
    const result = createSatelliteEntity(Cesium, viewer.entities, {
      noradId,
      name: tle.name,
      position: pos,
      color: treaColor,
      isSelected: false,
      showLabel: true,
      model3dUrl: '/models/calipso-decoded.glb',
      useModel: true,
    });

    inst.missionTrea01Entity = { update: result.update, destroy: result.destroy };
  }, []);

  // TREA-01 轨道线 positions 引用:CallbackProperty 每帧读取,确保 positions 持续更新
  // (直接赋值 raw array 给 polyline.positions 可能不触发 Cesium 重新渲染,
  //  导致变轨后紫色轨道线仍停留在旧轨道,相机跟踪新轨道卫星后旧轨道在视野外 → 看似"轨道消失")
  const trea01OrbitPositionsRef = useRef<CesiumType.Cartesian3[] | null>(null);

  /**
   * 添加/更新 TREA-01 轨道线(紫色 Polyline,一整圈闭合轨道)
   * 使用 CallbackProperty 读取 trea01OrbitPositionsRef,确保变轨后 positions 立即生效
   * 实体只创建一次,后续每帧仅更新 ref → 无闪烁且 positions 始终最新
   *
   * @param tle TREA-01 当前 TLE(变轨后传入新 TLE)
   * @param time 采样起始时间(通常为仿真当前时间)
   */
  const addTrea01OrbitLine = useCallback((tle: TLEData, time: Date) => {
    const inst = cesiumRef.current;
    if (!inst) return;
    const { Cesium, viewer } = inst;

    // 采样一整圈轨道点(ECEF 米制,与 Cesium FIXED 坐标系一致)
    const points = generateOrbitPointsECEF([tle], time, 180);
    if (!points || points.length < 2) {
      console.warn('[DIAG addTrea01OrbitLine] points invalid:', { pointsLen: points?.length ?? 0, tleName: tle.name });
      return;
    }

    // 转换为 Cesium.Cartesian3,更新 ref(CallbackProperty 每帧读取)
    const positions = points.map(p => new Cesium.Cartesian3(p.x, p.y, p.z));
    trea01OrbitPositionsRef.current = positions;

    // 紫色发光轨道线(与 TREA-01 卫星颜色一致 #b366ff)
    const orbitColor = Cesium.Color.fromCssColorString('#b366ff').withAlpha(0.85);

    // 检查旧实体是否仍在 viewer 中(热重载/StrictMode 重挂载后引用可能失效)
    const existing = inst.missionTrea01OrbitEntity;
    const stillInViewer = existing && viewer.entities.contains(existing);

    if (stillInViewer) {
      // 实体存在:CallbackProperty 自动读取 ref,无需手动更新 positions
      // 仅确保 show=true(防止被某处隐藏)+ disableDepthTestDistance 生效(不被地球遮挡)
      try {
        existing.polyline.show = new Cesium.ConstantProperty(true);
        existing.polyline.disableDepthTestDistance = new Cesium.ConstantProperty(Number.POSITIVE_INFINITY);
      } catch { /* ignore */ }
      return;
    }

    // 旧实体失效(已从 viewer 移除):清理引用后重新创建
    if (existing) {
      inst.missionTrea01OrbitEntity = null;
    }

    console.log('[DIAG addTrea01OrbitLine] creating new orbit entity, points:', points.length);

    // 创建紫色轨道线
    // positions 用 CallbackProperty 读取 ref:变轨后仅更新 ref 即可让轨道线立即切到新轨道
    // disableDepthTestDistance: 禁用深度测试,让轨道线不被地球遮挡
    // (跟踪相机 800km 近距视角下,大部分轨道位于地平线以下,会被 depthTestAgainstTerrain 遮挡)
    const entity = viewer.entities.add({
      id: `trea01-orbit-${Date.now()}`,
      name: 'TREA-01 Orbit',
      polyline: {
        positions: new Cesium.CallbackProperty(() => trea01OrbitPositionsRef.current ?? [], false),
        width: 3,
        material: orbitColor,
        arcType: Cesium.ArcType.NONE,
        show: true,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    inst.missionTrea01OrbitEntity = entity;
    console.log('[DIAG addTrea01OrbitLine] entity created, in viewer:', viewer.entities.contains(entity));
  }, []);

  /**
   * 飞向 TREA-01 卫星:优先飞向实体,实体不存在则飞向当前位置
   * 距离 800km:进入任务中心时就能看到 3D 模型(150km 大小在 800km 外约占屏幕 18%)
   * 之前 2500km 太远,模型只占屏幕 ~5%,用户看不到
   */
  const focusTrea01 = useCallback(() => {
    const inst = cesiumRef.current;
    if (!inst) return;
    const { Cesium, viewer } = inst;
    const noradId = 99999;
    const entity = viewer.entities.getById(`satellite-${noradId}`);
    if (entity) {
      viewer.flyTo(entity, {
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), 800000),
        duration: 1.5,
      });
    }
  }, []);

  // ============================================================
  // TREA-01 持续跟踪(preUpdate 监听器,避免 viewer.trackedEntity 轨道不稳定)
  // ============================================================
  // trea01TrackingRef 存储 preUpdate 监听器引用,startTrackingTrea01 注册,
  // stopTrackingTrea01 注销。跟踪时相机跟随 TREA-01 位置移动(固定偏移距离)
  const trea01TrackingRef = useRef<(() => void) | null>(null);

  /** 启动 TREA-01 持续跟踪:注册 preUpdate 监听器,相机跟随卫星位置
   *  支持鼠标滚轮拉近拉远(复用 trackingRangeRef 管理跟踪距离)
   *  带动态模型缩放:拉近时模型变大,拉远时变小(复用 startTracking 的动态缩放逻辑)
   */
  const startTrackingTrea01 = useCallback(() => {
    const inst = cesiumRef.current;
    if (!inst) return;
    const { Cesium, viewer } = inst;
    // 防御:viewer 已销毁(CesiumGlobe 重新挂载/卸载时旧实例可能已 destroy)
    if (viewer.isDestroyed?.()) return;

    // 先清理旧监听器(清理函数内部已有 isDestroyed 检查,安全调用)
    if (trea01TrackingRef.current) {
      trea01TrackingRef.current();
      trea01TrackingRef.current = null;
    }

    const noradId = 99999;
    const entity = viewer.entities.getById(`satellite-${noradId}`);
    if (!entity) return;

    // 读取模型基础 scale(来自 SatelliteEntity.tsx 的 MODEL_SCALE_BY_TYPE,calipso-decoded=627)
    // 用于动态缩放计算:拉近(range 小)→ scale 增大 → 模型变大
    let baseScale = 627;
    if (entity.model?.scale) {
      const val = entity.model.scale.getValue?.(viewer.clock.currentTime);
      if (typeof val === 'number' && val > 0) baseScale = val;
    }
    // 基准距离:range=REF_RANGE 时 dynamicScale=baseScale(初始不变)
    const REF_RANGE = 800000;

    // 重置跟踪距离(与 focusTrea01 一致,800km 进入时就能看到模型)
    trackingRangeRef.current = REF_RANGE;

    // 先飞向 TREA-01,然后启动持续跟踪
    viewer.flyTo(entity, {
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), trackingRangeRef.current),
      duration: 1.0,
    });

    // 禁用 Cesium 默认缩放(避免与自定义滚轮事件冲突,同 startTracking)
    viewer.scene.screenSpaceCameraController.enableZoom = false;

    // preUpdate 监听器:每帧更新相机位置,跟随 TREA-01
    // 同时手动动态缩放模型 scale(解决固定 scale 在远距离模型太小看不到的问题)
    // 每帧动态获取实体引用,避免 activeTle 变化导致实体重建后引用失效
    const listener = () => {
      const inst2 = cesiumRef.current;
      if (!inst2 || inst2.viewer.isDestroyed?.()) return;
      // 每帧动态获取实体,避免实体重建后闭包中的引用失效
      const dynamicEntity = inst2.viewer.entities.getById(`satellite-${noradId}`);
      if (!dynamicEntity) return;
      const pos = dynamicEntity.position?.getValue?.(inst2.viewer.clock.currentTime);
      if (!pos) return;
      const heading = 0;
      const pitch = inst2.Cesium.Math.toRadians(-45);
      inst2.viewer.camera.lookAt(pos, new inst2.Cesium.HeadingPitchRange(heading, pitch, trackingRangeRef.current));
      // 动态缩放:拉近(range 小)→ scale 增大 → 模型变大;拉远 → 缩小
      // 让用户滚轮拉近时能看到卫星模型细节
      if (dynamicEntity.model) {
        const range = trackingRangeRef.current;
        const dynamicScale = baseScale * (REF_RANGE / range);
        dynamicEntity.model.scale = new inst2.Cesium.ConstantProperty(dynamicScale);
      }
    };

    // 滚轮缩放:原生 DOM 事件(同 startTracking 实现,deltaY>0=拉远,<0=拉近)
    const canvas = viewer.scene.canvas as HTMLCanvasElement;
    const wheelListener = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const factor = e.deltaY > 0 ? 1.15 : 0.87;
      // 最小 100km 让用户能拉近看卫星细节;最大 20000km
      trackingRangeRef.current = Math.max(100000, Math.min(20000000, trackingRangeRef.current * factor));
    };
    canvas.addEventListener('wheel', wheelListener, { capture: true, passive: false });

    // 延迟 1.2s 启动持续跟踪(等待 flyTo 完成)
    // 延迟回调内部再次检查 viewer 是否已销毁(可能在 flyTo 期间组件被卸载)
    const timeoutId = setTimeout(() => {
      if (viewer.isDestroyed?.()) return;
      viewer.scene.preUpdate.addEventListener(listener);
    }, 1200);

    // 清理函数:所有 viewer.scene 访问前都检查 isDestroyed,
    // 防止 CesiumGlobe 重新挂载时旧清理函数引用已销毁的 viewer 导致
    // "Cannot read properties of undefined (reading 'scene')" 错误
    // 同时恢复模型 scale 到 baseScale(停止手动动态缩放)
    trea01TrackingRef.current = () => {
      clearTimeout(timeoutId);
      if (!viewer.isDestroyed?.()) {
        viewer.scene.preUpdate.removeEventListener(listener);
        viewer.scene.screenSpaceCameraController.enableZoom = true;
        // 恢复模型 scale 到基础值
        if (entity.model) {
          entity.model.scale = new Cesium.ConstantProperty(baseScale);
        }
      }
      canvas.removeEventListener('wheel', wheelListener, { capture: true } as EventListenerOptions);
    };
  }, []);

  /** 停止 TREA-01 持续跟踪:注销 preUpdate 监听器,释放相机控制 */
  const stopTrackingTrea01 = useCallback(() => {
    const inst = cesiumRef.current;
    if (!inst) return;
    // 防御:viewer 已销毁时只清理 ref,不访问 viewer 属性
    if (trea01TrackingRef.current) {
      trea01TrackingRef.current();
      trea01TrackingRef.current = null;
    }
    if (inst.viewer.isDestroyed?.()) return;
    // 释放 lookAt 锁定,让用户可以自由操控相机
    inst.viewer.camera.lookAtTransform(inst.Cesium.Matrix4.IDENTITY);
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
    // 清理扫描带
    inst.missionScanTrailEntities.forEach(e => {
      try { inst.viewer.entities.remove(e); } catch { /* ignore */ }
    });
    inst.missionScanTrailEntities = [];
    // 清理 AOI 高亮实体
    if (inst.missionAoiHighlightEntity) {
      try { inst.viewer.entities.remove(inst.missionAoiHighlightEntity); } catch { /* ignore */ }
      inst.missionAoiHighlightEntity = null;
    }
    // 清理连续累积扫描带
    if (inst.missionContinuousSwathEntity) {
      try { inst.viewer.entities.remove(inst.missionContinuousSwathEntity); } catch { /* ignore */ }
      inst.missionContinuousSwathEntity = null;
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

      // V3-A:高对比瞬时刈幅 — #00E5A0 填充 opacity 0.65 + 亮色边界线
      const fillColor = Cesium.Color.fromCssColorString('#00E5A0').withAlpha(0.65);
      const outlineColor = Cesium.Color.fromCssColorString('#00FFC8');

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
  // AOI 高亮(卫星抵达任务区域的明确视觉反馈)
  // ------------------------------------------------------------
  // 创建独立的粗边框 polyline(亮黄色)+ 脉冲透明度动画(1.5s)
  // 不修改原 AOI 多边形实体,避免退出高亮后样式错乱
  // 同时将原 AOI 填充临时提亮(通过修改 polygon.material)
  // ============================================================

  /** 高亮开始时间戳(用于脉冲动画) */
  const aoiHighlightStartRef = useRef<number>(0);

  /**
   * 高亮指定 AOI(卫星抵达任务区域时调用)
   * - 创建亮黄色粗边框 polyline(脉冲动画 1.5s)
   * - 修改原 AOI 填充为高亮色(亮黄半透明)
   * - 高亮状态持续到调用 unhighlightAoi
   *
   * @param aoi 目标 AOI(使用其 polygon 顶点 [lon, lat])
   */
  const highlightAoi = useCallback((aoi: Aoi) => {
    const inst = cesiumRef.current;
    if (!inst) return;
    const { Cesium, viewer } = inst;

    // 清理旧的高亮实体
    if (inst.missionAoiHighlightEntity) {
      try { viewer.entities.remove(inst.missionAoiHighlightEntity); } catch { /* ignore */ }
      inst.missionAoiHighlightEntity = null;
    }

    aoiHighlightStartRef.current = Date.now();

    // 将 [lon, lat] 顶点转为 Cartesian3(闭合 polyline)
    const positions = aoi.polygon.map(([lon, lat]) =>
      Cesium.Cartesian3.fromDegrees(lon, lat)
    );
    // 闭合:首尾相连
    if (positions.length >= 3) {
      positions.push(positions[0]);
    }

    const highlightColor = Cesium.Color.fromCssColorString('#ffeb3b'); // 亮黄色

    // 粗边框 polyline(脉冲透明度动画)
    const outlineEntity = viewer.entities.add({
      id: `trea-aoi-highlight-${Date.now()}`,
      name: `AOI Highlight: ${aoi.name}`,
      polyline: {
        positions: new Cesium.ConstantProperty(positions),
        width: new Cesium.ConstantProperty(6),
        material: new Cesium.ColorMaterialProperty(
          new Cesium.CallbackProperty(() => {
            const elapsed = (Date.now() - aoiHighlightStartRef.current) / 1000;
            // 前 1.5s 脉冲(透明度在 0.6~1.0 之间振荡),之后保持 0.9
            let alpha: number;
            if (elapsed < 1.5) {
              alpha = 0.8 + 0.2 * Math.sin(elapsed * 12);
            } else {
              alpha = 0.95;
            }
            return highlightColor.withAlpha(alpha);
          }, false)
        ),
        arcType: new Cesium.ConstantProperty(Cesium.ArcType.NONE),
        disableDepthTestDistance: new Cesium.ConstantProperty(Number.POSITIVE_INFINITY),
      },
    });
    inst.missionAoiHighlightEntity = outlineEntity;

    // 同时提亮原 AOI 多边形填充(改为亮黄半透明)
    const aoiEntity = inst.missionAoiEntities.get(aoi.id);
    if (aoiEntity?.polygon) {
      aoiEntity.polygon.material = new Cesium.ColorMaterialProperty(
        highlightColor.withAlpha(0.55)
      );
    }
  }, []);

  /**
   * 取消 AOI 高亮,恢复原 AOI 样式
   * - 移除高亮边框 polyline
   * - 恢复原 AOI 填充为橙色半透明(#ff6b35 alpha 0.4)
   */
  const unhighlightAoi = useCallback((aoiId: string) => {
    const inst = cesiumRef.current;
    if (!inst) return;
    const { Cesium, viewer } = inst;

    // 移除高亮边框
    if (inst.missionAoiHighlightEntity) {
      try { viewer.entities.remove(inst.missionAoiHighlightEntity); } catch { /* ignore */ }
      inst.missionAoiHighlightEntity = null;
    }

    // 恢复原 AOI 填充样式
    const aoiEntity = inst.missionAoiEntities.get(aoiId);
    if (aoiEntity?.polygon) {
      const origColor = Cesium.Color.fromCssColorString('#ff6b35').withAlpha(0.4);
      aoiEntity.polygon.material = new Cesium.ColorMaterialProperty(origColor);
    }
  }, []);

  // ============================================================
  // 连续累积扫描带(Continuous Swath)
  // ------------------------------------------------------------
  // 替代旧版 addScanTrailPoint 的零散矩形,实现"真正的连续 swath"
  // 维护单个长条带 polygon,随卫星运动逐步扩展左右边界
  // 左右边界沿星下点轨迹外推半刈幅宽度(SENSOR_FOOTPRINT_WIDTH_KM/2)
  // ============================================================

  /** 扫描带累积的星下点轨迹点(用于构建连续条带左右边界) */
  const swathTrailRef = useRef<Array<{ lon: number; lat: number; alt: number }>>([]);

  /** 1 度纬度对应的地面距离(km,近似) */
  const KM_PER_DEG_LAT_SWATH = 111.32;

  /**
   * 添加连续扫描带点(每帧调用,累积形成连续覆盖带)
   * - 累积星下点轨迹点到 swathTrailRef
   * - 重建条带 polygon:左右边界沿轨迹外推半刈幅宽度
   * - 单个 polygon 实体,视觉连续无中断
   *
   * @param centerLonLat 星下点中心 {lon, lat}(经度 [-180, 180])
   * @param widthKm 刈幅宽度(km)
   */
  const addContinuousSwathPoint = useCallback(
    (centerLonLat: { lon: number; lat: number }, widthKm: number) => {
      const inst = cesiumRef.current;
      if (!inst) return;
      const { Cesium, viewer } = inst;

      // 累积轨迹点(上限保护,避免内存溢出)
      const MAX_SWATH_POINTS = 300;
      swathTrailRef.current.push({ ...centerLonLat, alt: 0 });
      if (swathTrailRef.current.length > MAX_SWATH_POINTS) {
        swathTrailRef.current.shift();
      }

      const trail = swathTrailRef.current;
      if (trail.length < 2) return;

      const halfKm = widthKm / 2;

      // 构建条带左右边界:对每个轨迹点,沿"垂直于运动方向"外推半刈幅
      // 运动方向由前后轨迹点确定,垂直方向旋转 90°
      // 右边界:沿轨迹顺序(运动方向右侧)
      // 左边界:沿轨迹逆序(运动方向左侧,闭合 polygon)
      const rightBoundary: CesiumType.Cartesian3[] = [];
      const leftBoundary: CesiumType.Cartesian3[] = [];

      for (let i = 0; i < trail.length; i++) {
        const p = trail[i];
        // 用前后点计算运动方向(中心差分)
        const prev = trail[Math.max(0, i - 1)];
        const next = trail[Math.min(trail.length - 1, i + 1)];
        const dLon = next.lon - prev.lon;
        const dLat = next.lat - prev.lat;
        const cosLat = Math.cos((p.lat * Math.PI) / 180);
        // 等效平面坐标中的运动方向(经度方向乘以 cosLat 转等效)
        const dx = dLon * cosLat;
        const dy = dLat;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-10) continue;
        // 垂直方向(右侧,旋转 90° 顺时针):(dy, -dx) 归一化
        const px = dy / len;   // 等效经度方向分量
        const py = -dx / len;  // 纬度方向分量
        // 半刈幅偏移(度)
        const halfDeg = halfKm / KM_PER_DEG_LAT_SWATH;
        const offsetLon = (px * halfDeg) / (cosLat > 1e-6 ? cosLat : 1e-6);
        const offsetLat = py * halfDeg;
        // 右边界(运动方向右侧)
        rightBoundary.push(Cesium.Cartesian3.fromDegrees(p.lon + offsetLon, p.lat + offsetLat));
      }
      for (let i = trail.length - 1; i >= 0; i--) {
        const p = trail[i];
        const prev = trail[Math.max(0, i - 1)];
        const next = trail[Math.min(trail.length - 1, i + 1)];
        const dLon = next.lon - prev.lon;
        const dLat = next.lat - prev.lat;
        const cosLat = Math.cos((p.lat * Math.PI) / 180);
        const dx = dLon * cosLat;
        const dy = dLat;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-10) continue;
        const px = dy / len;
        const py = -dx / len;
        const halfDeg = halfKm / KM_PER_DEG_LAT_SWATH;
        const offsetLon = (px * halfDeg) / (cosLat > 1e-6 ? cosLat : 1e-6);
        const offsetLat = py * halfDeg;
        // 左边界(运动方向左侧),逆序收集以闭合
        leftBoundary.push(Cesium.Cartesian3.fromDegrees(p.lon - offsetLon, p.lat - offsetLat));
      }

      // 合并:右边界(顺序) + 左边界(逆序) = 闭合多边形
      const polygonPositions = [...rightBoundary, ...leftBoundary];

      // 扫描带样式:深青蓝色半透明(与瞬时足迹 #00ff88 区分)
      const swathColor = Cesium.Color.fromCssColorString('#00b8d4').withAlpha(0.45);

      // 已存在则更新 polygon hierarchy,否则创建
      if (inst.missionContinuousSwathEntity) {
        inst.missionContinuousSwathEntity.polygon!.hierarchy = new Cesium.ConstantProperty(
          new Cesium.PolygonHierarchy(polygonPositions)
        );
      } else {
        const entity = viewer.entities.add({
          id: `trea-continuous-swath-${Date.now()}`,
          name: 'TREA-01 Continuous Swath',
          polygon: {
            hierarchy: new Cesium.ConstantProperty(
              new Cesium.PolygonHierarchy(polygonPositions)
            ),
            material: swathColor,
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#00e5ff').withAlpha(0.8),
            outlineWidth: 2,
          },
        });
        inst.missionContinuousSwathEntity = entity;
      }
    },
    []
  );

  /**
   * 清理连续扫描带实体 + 重置轨迹累积
   */
  const clearContinuousSwath = useCallback(() => {
    const inst = cesiumRef.current;
    if (!inst) return;
    if (inst.missionContinuousSwathEntity) {
      try { inst.viewer.entities.remove(inst.missionContinuousSwathEntity); } catch { /* ignore */ }
      inst.missionContinuousSwathEntity = null;
    }
    swathTrailRef.current = [];
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

  /**
   * 刷新 TREA-01 轨道线(用当前时间重新生成)
   * 修复:卫星位置每帧用 currentTime 计算,但轨道线只在初始化时画一次
   * 时间推进后(尤其 20x 加速)轨道线与卫星位置不重合 — 定期刷新解决
   */
  const refreshTrea01Orbit = useCallback((tle: TLEData, time: Date) => {
    addTrea01OrbitLine(tle, time);
  }, [addTrea01OrbitLine]);

  /**
   * 变轨轨道对比动画(无燃烧效果,符合 V1 要求)
   * 时间线(5 秒,对应 shot-03 maxDurationSec=5):
   *   t=0~1.5s:   新轨道渐显(亮青色实线 alpha 0→1.0),旧轨道完全可见(灰色虚线 alpha 0.85)
   *   t=1.5~3s:   两者同时完全可见,突出"旧/新轨道明显分离"
   *   t=3s:        卫星切换新轨道(由 CinematicController 调 executeManeuver)
   *   t=3~5s:      旧轨道渐隐(alpha 0.85→0),新轨道保持完全可见
   *
   * 视觉效果(严格遵守 V1 禁止事项:无任何燃烧弧/火焰/粒子):
   *   - 旧轨道:灰色虚线(#888888,表达"当前轨道")
   *   - 新轨道:亮青色发光粗实线(#00ffcc,表达"目标轨道")
   *   - 无燃烧点、无推力火焰、无粒子喷射
   */
  const addOrbitTransition = useCallback(
    (
      oldTle: TLEData,
      newTle: TLEData,
      time: Date,
      onSwitch?: () => void,   // t=3s 触发(卫星切新轨道)
      onDone?: () => void       // t=5s 触发(动画结束)
    ): (() => void) => {
      const inst = cesiumRef.current;
      if (!inst) return () => {};
      const { Cesium, viewer } = inst;

      // 先清理旧的变轨实体
      inst.missionManeuverEntities.forEach(e => {
        try { viewer.entities.remove(e); } catch { /* ignore */ }
      });
      inst.missionManeuverEntities = [];

      const startTime = Date.now();

      // ---- 旧轨道:灰色虚线,前期完全可见,t=3s 后渐隐 ----
      // disableDepthTestDistance: 禁用深度测试,让轨道线不被地球遮挡
      // (与 addTrea01OrbitLine 一致:大部分轨道位于地平线以下,会被 depthTestAgainstTerrain 遮挡)
      const oldPoints = generateOrbitPointsECEF([oldTle], time, 180);
      if (oldPoints && oldPoints.length >= 2) {
        const oldPositions = oldPoints.map(p => new Cesium.Cartesian3(p.x, p.y, p.z));
        const oldEntity = viewer.entities.add({
          id: `trea-transition-old-${startTime}`,
          name: 'TREA-01 Old Orbit (fading)',
          polyline: {
            positions: new Cesium.ConstantProperty(oldPositions),
            width: new Cesium.ConstantProperty(2.5),
            material: new Cesium.PolylineDashMaterialProperty({
              color: new Cesium.CallbackProperty(() => {
                const elapsed = (Date.now() - startTime) / 1000;
                // t=0~3s: alpha 0.85;t=3~5s: 渐隐到 0
                let alpha = 0.85;
                if (elapsed > 3) alpha = Math.max(0, 0.85 * (1 - (elapsed - 3) / 2));
                return Cesium.Color.fromCssColorString('#888888').withAlpha(alpha);
              }, false),
              dashLength: 16.0,
            }),
            arcType: new Cesium.ConstantProperty(Cesium.ArcType.NONE),
            disableDepthTestDistance: new Cesium.ConstantProperty(Number.POSITIVE_INFINITY),
          },
        });
        inst.missionManeuverEntities.push(oldEntity);
      }

      // ---- 新轨道:亮青色发光粗实线,渐显后保持 ----
      // disableDepthTestDistance: 禁用深度测试,让轨道线不被地球遮挡(与旧轨道一致)
      const newPoints = generateOrbitPointsECEF([newTle], time, 180);
      if (newPoints && newPoints.length >= 2) {
        const newPositions = newPoints.map(p => new Cesium.Cartesian3(p.x, p.y, p.z));
        const newEntity = viewer.entities.add({
          id: `trea-transition-new-${startTime}`,
          name: 'TREA-01 New Orbit (fading in)',
          polyline: {
            positions: new Cesium.ConstantProperty(newPositions),
            width: new Cesium.ConstantProperty(4.0),
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.35,
              color: new Cesium.CallbackProperty(() => {
                const elapsed = (Date.now() - startTime) / 1000;
                // t=0~1.5s: alpha 0→1.0(渐显);t>1.5s: alpha 1.0(保持)
                let alpha = Math.min(1.0, elapsed / 1.5);
                return Cesium.Color.fromCssColorString('#00ffcc').withAlpha(alpha);
              }, false),
            }),
            arcType: new Cesium.ConstantProperty(Cesium.ArcType.NONE),
            disableDepthTestDistance: new Cesium.ConstantProperty(Number.POSITIVE_INFINITY),
          },
        });
        inst.missionManeuverEntities.push(newEntity);
      }

      // t=3s 触发卫星切换(onSwitch),t=5s 动画结束(onDone)
      const switchTimer = onSwitch ? setTimeout(onSwitch, 3000) : null;
      const doneTimer = onDone ? setTimeout(onDone, 5000) : null;

      // 返回 cleanup:清理 setTimeout + 变轨实体(避免 CallbackProperty 卸载后继续计算)
      return () => {
        if (switchTimer) clearTimeout(switchTimer);
        if (doneTimer) clearTimeout(doneTimer);
        inst.missionManeuverEntities.forEach(e => {
          try { viewer.entities.remove(e); } catch { /* ignore */ }
        });
        inst.missionManeuverEntities = [];
      };
    },
    []
  );

  /**
   * 添加持久化扫描带点(要求 5)
   * 成像期间每帧调用,累积形成扫描覆盖区
   * 暗绿色半透明矩形,不随卫星移动(持久化)
   */
  const addScanTrailPoint = useCallback(
    (centerLonLat: { lon: number; lat: number }, widthKm: number) => {
      const inst = cesiumRef.current;
      if (!inst) return;
      const { Cesium, viewer } = inst;

      const corners = computeFootprintCorners(centerLonLat, widthKm);
      const positions = corners.map(c => Cesium.Cartesian3.fromDegrees(c.lon, c.lat));

      // 扫描带:亮绿色半透明 + 亮色轮廓线,确保在地球表面可见
      const fillColor = Cesium.Color.fromCssColorString('#00ff88').withAlpha(0.45);
      const outlineColor = Cesium.Color.fromCssColorString('#00ff88').withAlpha(0.9);
      const entity = viewer.entities.add({
        id: `trea-scan-trail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: 'TREA-01 Scan Trail',
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(positions),
          material: fillColor,
          outline: true,
          outlineColor,
          outlineWidth: 2,
        },
      });
      inst.missionScanTrailEntities.push(entity);
    },
    []
  );

  /**
   * 清理扫描带
   */
  const clearScanTrail = useCallback(() => {
    const inst = cesiumRef.current;
    if (!inst) return;
    inst.missionScanTrailEntities.forEach(e => {
      try { inst.viewer.entities.remove(e); } catch { /* ignore */ }
    });
    inst.missionScanTrailEntities = [];
  }, []);

  // ============================================================
  // ============================================================
  // 成像扫描光束(卫星→地面扇形锥形光束)
  // 方案:20+条发光polyline从卫星射向地面矩形各边,形成锥形光束
  // 比 polygon 可靠:polyline 渲染稳定,线条密集后产生"面"的错觉
  // ============================================================

  /** 沿矩形周长插值 N 个点(含4角,顺时针闭合) */
  function interpolatePerimeter(
    corners: Array<{ lon: number; lat: number }>,
    n: number
  ): Array<{ lon: number; lat: number }> {
    const result: Array<{ lon: number; lat: number }> = [];
    // 每条边插值 ceil(n/4) 个点(首尾共享)
    const perEdge = Math.max(2, Math.ceil(n / 4));
    for (let e = 0; e < 4; e++) {
      const a = corners[e];
      const b = corners[(e + 1) % 4];
      for (let i = 0; i < perEdge; i++) {
        const t = i / (perEdge - 1);
        result.push({
          lon: a.lon + (b.lon - a.lon) * t,
          lat: a.lat + (b.lat - a.lat) * t,
        });
      }
    }
    // 去掉最后一个点(与第一个点重复)
    if (result.length > 0) result.pop();
    return result;
  }

  /**
   * 创建成像扫描锥形光束
   * - 20条扇形射线:从卫星射向地面矩形各边,亮青色发光
   * - 4条角线更粗更亮,中间射线更细半透明
   * - 地面足印矩形:亮青色半透明填充+轮廓
   * - 卫星光点:亮青色脉动点
   *
   * @param satelliteGeo 卫星地理坐标 {lon, lat, altM}(altM=高度米)
   * @param groundCorners 地面扫描矩形4角 [{lon, lat}...],顺时针闭合
   */
  const addScanBeam = useCallback(
    (satelliteGeo: { lon: number; lat: number; altM: number }, groundCorners: Array<{ lon: number; lat: number }>) => {
      const inst = cesiumRef.current;
      if (!inst) return;
      const { Cesium, viewer } = inst;

      // 清理旧光束
      inst.missionScanBeamEntities.forEach(e => {
        try { viewer.entities.remove(e); } catch { /* ignore */ }
      });
      inst.missionScanBeamEntities = [];

      if (groundCorners.length < 3) return;

      const satCart = Cesium.Cartesian3.fromDegrees(satelliteGeo.lon, satelliteGeo.lat, satelliteGeo.altM);
      const groundCarts = groundCorners.map(c => Cesium.Cartesian3.fromDegrees(c.lon, c.lat));

      const beamColor = Cesium.Color.fromCssColorString('#00ffcc');

      // ---- 20条扇形射线:卫星→地面矩形各边 ----
      const perimeterPts = interpolatePerimeter(groundCorners, 20);
      const perimeterCarts = perimeterPts.map(p => Cesium.Cartesian3.fromDegrees(p.lon, p.lat));

      // 找出4个角点在 perimeterCarts 中的索引(角点对应 corners[0..3])
      // 角点坐标完全匹配,用经纬度比较
      const isCorner = (i: number) => {
        const pt = perimeterPts[i];
        return groundCorners.some(c => Math.abs(c.lon - pt.lon) < 1e-10 && Math.abs(c.lat - pt.lat) < 1e-10);
      };

      for (let i = 0; i < perimeterCarts.length; i++) {
        const corner = isCorner(i);
        const lineEntity = viewer.entities.add({
          id: `trea-beam-fan-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          name: 'TREA-01 Scan Beam Fan',
          polyline: {
            positions: new Cesium.ConstantProperty([satCart, perimeterCarts[i]]),
            width: new Cesium.ConstantProperty(corner ? 4 : 1.5),
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: corner ? 0.5 : 0.2,
              color: beamColor.withAlpha(corner ? 1.0 : 0.6),
            }),
            arcType: new Cesium.ConstantProperty(Cesium.ArcType.NONE),
          },
        });
        inst.missionScanBeamEntities.push(lineEntity);
      }

      // ---- 地面足印矩形边框(亮青色) ----
      const footprintOutline = viewer.entities.add({
        id: `trea-beam-footprint-outline-${Date.now()}`,
        name: 'TREA-01 Scan Footprint Outline',
        polyline: {
          positions: new Cesium.ConstantProperty([
            groundCarts[0], groundCarts[1], groundCarts[2], groundCarts[3], groundCarts[0],
          ]),
          width: new Cesium.ConstantProperty(4),
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.5,
            color: beamColor.withAlpha(1.0),
          }),
          arcType: new Cesium.ConstantProperty(Cesium.ArcType.NONE),
        },
      });
      inst.missionScanBeamEntities.push(footprintOutline);

      // ---- 地面足印填充矩形(半透明亮青色) ----
      const footprintFill = viewer.entities.add({
        id: `trea-beam-footprint-fill-${Date.now()}`,
        name: 'TREA-01 Scan Footprint Fill',
        polygon: {
          hierarchy: new Cesium.ConstantProperty(
            new Cesium.PolygonHierarchy(groundCarts)
          ),
          material: beamColor.withAlpha(0.35),
          outline: false,
        },
      });
      inst.missionScanBeamEntities.push(footprintFill);

      // ---- 卫星光点(亮青色脉动) ----
      const satPoint = viewer.entities.add({
        id: `trea-beam-sat-point-${Date.now()}`,
        name: 'TREA-01 Scan Source',
        position: new Cesium.ConstantProperty(satCart),
        point: {
          pixelSize: 10,
          color: Cesium.Color.fromCssColorString('#00ffff').withAlpha(1.0),
          outlineColor: Cesium.Color.fromCssColorString('#ffffff').withAlpha(0.8),
          outlineWidth: 2,
          disableDepthTestDistance: new Cesium.ConstantProperty(Number.POSITIVE_INFINITY),
        },
      });
      inst.missionScanBeamEntities.push(satPoint);
    },
    []
  );

  /**
   * 更新扫描光束位置(每帧调用,随卫星移动)
   *
   * 实体顺序:
   *   [0..N-1]: 扇形射线(20条)
   *   [N]:      地面矩形边框
   *   [N+1]:    地面矩形填充
   *   [N+2]:    卫星光点
   */
  const updateScanBeam = useCallback(
    (satelliteGeo: { lon: number; lat: number; altM: number }, groundCorners: Array<{ lon: number; lat: number }>) => {
      const inst = cesiumRef.current;
      if (!inst || inst.missionScanBeamEntities.length === 0) return;
      const { Cesium } = inst;

      const satCart = Cesium.Cartesian3.fromDegrees(satelliteGeo.lon, satelliteGeo.lat, satelliteGeo.altM);
      const groundCarts = groundCorners.map(c => Cesium.Cartesian3.fromDegrees(c.lon, c.lat));

      // 重算周长插值点
      const perimeterPts = interpolatePerimeter(groundCorners, 20);
      const perimeterCarts = perimeterPts.map(p => Cesium.Cartesian3.fromDegrees(p.lon, p.lat));

      const totalFanLines = perimeterCarts.length; // 20
      const outlineIdx = totalFanLines;
      const fillIdx = totalFanLines + 1;
      const pointIdx = totalFanLines + 2;

      // 更新扇形射线
      for (let i = 0; i < totalFanLines; i++) {
        const ent = inst.missionScanBeamEntities[i];
        if (ent?.polyline) {
          ent.polyline.positions = new Cesium.ConstantProperty([satCart, perimeterCarts[i]]);
        }
      }

      // 更新地面边框
      const outlineEnt = inst.missionScanBeamEntities[outlineIdx];
      if (outlineEnt?.polyline) {
        outlineEnt.polyline.positions = new Cesium.ConstantProperty([
          groundCarts[0], groundCarts[1], groundCarts[2], groundCarts[3], groundCarts[0],
        ]);
      }

      // 更新地面填充
      const fillEnt = inst.missionScanBeamEntities[fillIdx];
      if (fillEnt?.polygon) {
        fillEnt.polygon.hierarchy = new Cesium.ConstantProperty(
          new Cesium.PolygonHierarchy(groundCarts)
        );
      }

      // 更新卫星光点
      const pointEnt = inst.missionScanBeamEntities[pointIdx];
      if (pointEnt?.position) {
        pointEnt.position = new Cesium.ConstantProperty(satCart);
      }
    },
    []
  );

  /**
   * 清理扫描光束
   */
  const clearScanBeam = useCallback(() => {
    const inst = cesiumRef.current;
    if (!inst) return;
    inst.missionScanBeamEntities.forEach(e => {
      try { inst.viewer.entities.remove(e); } catch { /* ignore */ }
    });
    inst.missionScanBeamEntities = [];
  }, []);

  // ============================================================
  // V1/V2-B/V3-D 新增相机动作(focusOrbitChange / frameSatAndAoi / lookDownAtScan)
  // ------------------------------------------------------------
  // 所有方法都通过 trea01TrackingRef 管理 preUpdate 监听器,
  // 可被 zoomOutCoverage / stopTrackingTrea01 统一停止。
  // ============================================================

  /**
   * 变轨特写相机(focusOrbitChange) — V1 要求
   * 飞到能同时看清旧/新轨道分离的视角
   * range 1000km,pitch -30°(轻微侧视,突出轨道变化,不依赖燃烧效果)
   * 不启动持续跟踪(静态视角,shot-03 期间卫星位置变化不大)
   */
  const focusOrbitChange = useCallback(() => {
    const inst = cesiumRef.current;
    if (!inst) return;
    const { Cesium, viewer } = inst;
    if (viewer.isDestroyed?.()) return;

    // 停止现有跟踪,释放 lookAt 锁定
    if (trea01TrackingRef.current) {
      trea01TrackingRef.current();
      trea01TrackingRef.current = null;
    }
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

    const noradId = 99999;
    const entity = viewer.entities.getById(`satellite-${noradId}`);
    if (!entity) return;

    viewer.flyTo(entity, {
      offset: new Cesium.HeadingPitchRange(
        0,
        Cesium.Math.toRadians(-30),  // 轻微侧视,突出轨道分离
        1000000                       // 1000km,能看清轨道对比
      ),
      duration: 1.5,
    });
  }, []);

  /**
   * 卫星+AOI 同框相机(frameSatAndAoi) — V2-B 要求
   * 启动 preUpdate 监听器,相机始终看向"卫星位置与 AOI 中心的中点"
   * range 4000km,pitch -45°,确保卫星在画面上半部,AOI 在下半部
   *
   * @param aoiCenter 当前任务 AOI 中心 {lon, lat}(必须来自 currentTask)
   */
  const frameSatAndAoi = useCallback((aoiCenter: { lon: number; lat: number }) => {
    const inst = cesiumRef.current;
    if (!inst) return;
    const { Cesium, viewer } = inst;
    if (viewer.isDestroyed?.()) return;

    // 停止现有跟踪
    if (trea01TrackingRef.current) {
      trea01TrackingRef.current();
      trea01TrackingRef.current = null;
    }

    const noradId = 99999;
    const entity = viewer.entities.getById(`satellite-${noradId}`);
    if (!entity) return;

    const aoiCart = Cesium.Cartesian3.fromDegrees(aoiCenter.lon, aoiCenter.lat);

    // 先飞向 AOI 上空 5000km,然后启动持续跟踪
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(aoiCenter.lon, aoiCenter.lat, 5000000),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-45),
        roll: 0,
      },
      duration: 1.0,
    });

    viewer.scene.screenSpaceCameraController.enableZoom = false;

    // preUpdate 监听器:每帧计算卫星与 AOI 中点,相机看向中点
    const listener = () => {
      const inst2 = cesiumRef.current;
      if (!inst2 || inst2.viewer.isDestroyed?.()) return;
      const satPos = entity.position?.getValue?.(inst2.viewer.clock.currentTime);
      if (!satPos) return;
      // 中点 = (satPos + aoiCart) / 2
      const mid = new inst2.Cesium.Cartesian3();
      inst2.Cesium.Cartesian3.midpoint(satPos, aoiCart, mid);
      // 相机看向中点,range 4000km,pitch -45°
      inst2.viewer.camera.lookAt(
        mid,
        new inst2.Cesium.HeadingPitchRange(0, inst2.Cesium.Math.toRadians(-45), 4000000)
      );
    };

    // 延迟 1.1s 启动跟踪(等待 flyTo 完成)
    const timeoutId = setTimeout(() => {
      if (viewer.isDestroyed?.()) return;
      viewer.scene.preUpdate.addEventListener(listener);
    }, 1100);

    trea01TrackingRef.current = () => {
      clearTimeout(timeoutId);
      if (!viewer.isDestroyed?.()) {
        viewer.scene.preUpdate.removeEventListener(listener);
        viewer.scene.screenSpaceCameraController.enableZoom = true;
      }
    };
  }, []);

  /**
   * 俯视扫描相机(lookDownAtScan) — V3-D 要求
   * 启动 preUpdate 跟踪卫星的星下点(地面投影点),pitch -60°,range 1500km
   *
   * 关键:相机看向"星下点"(地面)而非卫星本身,确保地面扫描在画面中心
   * 卫星在画面上方,扫描锥从卫星延伸到地面,累积带在画面中央
   *
   * 画面布局(pitch -60°,range 1500km):
   *   - 星下点(地面扫描)在画面中心
   *   - 卫星在画面上方约 9° 处
   *   - 扫描锥从卫星延伸到地面
   *   - 累积 swath 覆盖星下点轨迹
   */
  const lookDownAtScan = useCallback(() => {
    const inst = cesiumRef.current;
    if (!inst) return;
    const { Cesium, viewer } = inst;
    if (viewer.isDestroyed?.()) return;

    // 停止现有跟踪
    if (trea01TrackingRef.current) {
      trea01TrackingRef.current();
      trea01TrackingRef.current = null;
    }

    const noradId = 99999;
    const entity = viewer.entities.getById(`satellite-${noradId}`);
    if (!entity) return;

    // 1500km:相机离星下点的距离,平衡视野范围与实体可见性
    trackingRangeRef.current = 1500000;

    // 先飞向卫星附近(初始定位),然后 listener 会切换到看向星下点
    viewer.flyTo(entity, {
      offset: new Cesium.HeadingPitchRange(
        0,
        Cesium.Math.toRadians(-60),
        trackingRangeRef.current
      ),
      duration: 1.0,
    });

    viewer.scene.screenSpaceCameraController.enableZoom = false;

    // preUpdate 监听器:每帧计算星下点,相机看向星下点(地面)
    const listener = () => {
      const inst2 = cesiumRef.current;
      if (!inst2 || inst2.viewer.isDestroyed?.()) return;
      const pos = entity.position?.getValue?.(inst2.viewer.clock.currentTime);
      if (!pos) return;

      // 计算星下点:卫星位置投影到地面(高度 0)
      const carto = inst2.Cesium.Cartographic.fromCartesian(pos);
      const groundPoint = inst2.Cesium.Cartesian3.fromRadians(
        carto.longitude,
        carto.latitude,
        0
      );

      // 相机看向星下点(地面),pitch -60°,range 1500km
      // 这样地面扫描在画面中心,卫星在画面上方
      inst2.viewer.camera.lookAt(
        groundPoint,
        new inst2.Cesium.HeadingPitchRange(
          0,
          inst2.Cesium.Math.toRadians(-60),
          trackingRangeRef.current
        )
      );
    };

    // 延迟 1.1s 启动跟踪(等待 flyTo 完成)
    const timeoutId = setTimeout(() => {
      if (viewer.isDestroyed?.()) return;
      viewer.scene.preUpdate.addEventListener(listener);
    }, 1100);

    trea01TrackingRef.current = () => {
      clearTimeout(timeoutId);
      if (!viewer.isDestroyed?.()) {
        viewer.scene.preUpdate.removeEventListener(listener);
        viewer.scene.screenSpaceCameraController.enableZoom = true;
      }
    };
  }, []);

  /**
   * 覆盖展示拉远效果:停止跟踪后飞向 AOI 上空俯视位置
   * 距离 3000km,俯视看整个 AOI 和扫描覆盖区域
   *
   * @param center AOI 中心坐标 {lon, lat}
   * @param heightM 相机高度(米),默认 3000000(3000km)
   */
  const zoomOutCoverage = useCallback((center: { lon: number; lat: number }, heightM?: number) => {
    const inst = cesiumRef.current;
    if (!inst) return;
    const { Cesium, viewer } = inst;

    // 停止跟踪监听器(与 stopTrackingTrea01 相同逻辑)
    if (trea01TrackingRef.current) {
      trea01TrackingRef.current();
      trea01TrackingRef.current = null;
    }
    // 关键:释放 lookAt 锁定,否则 flyTo 会被 preUpdate 中的 lookAt 覆盖
    if (!viewer.isDestroyed?.()) {
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      // 恢复缩放控制
      viewer.scene.screenSpaceCameraController.enableZoom = true;
    }

    const h = heightM ?? 3000000;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(center.lon, center.lat, h),
      orientation: {
        heading: 0.0,
        pitch: Cesium.Math.toRadians(-60),
        roll: 0.0,
      },
      duration: 1.5,
    });
  }, []);

  return {
    isReady: !!cesium,
    loadError,
    viewer: cesium?.viewer ?? null,
    scene: cesium?.scene ?? null,
    Cesium: cesium?.Cesium ?? null,
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
    startTrackingTrea01,
    stopTrackingTrea01,
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
    // 电影回放模式专用方法
    refreshTrea01Orbit,
    addOrbitTransition,
    addScanTrailPoint,
    clearScanTrail,
    // 成像扫描三角形光束
    addScanBeam,
    updateScanBeam,
    clearScanBeam,
    // AOI 高亮(卫星抵达任务区域反馈)
    highlightAoi,
    unhighlightAoi,
    // 连续累积扫描带(V3-C:替代零散矩形)
    addContinuousSwathPoint,
    clearContinuousSwath,
    // 新增相机动作(V1/V2-B/V3-D)
    focusOrbitChange,
    frameSatAndAoi,
    lookDownAtScan,
    // 覆盖展示拉远
    zoomOutCoverage,
  };
}
