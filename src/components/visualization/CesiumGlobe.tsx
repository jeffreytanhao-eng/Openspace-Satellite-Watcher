'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { SpaceObject } from '@/store/satelliteStore';
import { useSatelliteStore } from '@/store/satelliteStore';
import { useTimeStore } from '@/store/timeStore';
import { useCesium } from '@/hooks/useCesium';
import { AOI_A, AOI_B } from '@/lib/trea/constants';
import { useTreaTle } from '@/store/treaMissionStore';
import { generateOrbitPoints } from '@/lib/cesium/positions';
import type { TLEData } from '@/lib/tle/parser';
import MissionSimulator from '@/components/trea/MissionSimulator';

/** 变轨事件:ManeuverPanel 执行变轨后触发,包含新旧 TLE 供 Cesium 渲染轨道对比 */
interface ManeuverEvent {
  newTle: TLEData;
  oldTle: TLEData;
  /** 唯一标识,每次变轨递增,触发 useEffect 重执行 */
  id: number;
}

interface CesiumGlobeProps {
  satellites: SpaceObject[];
  selectedSatellite: SpaceObject | null;
  visibleSatellites: number[];
  /** TREA-01 任务模式:开启后渲染 AOI 和 TREA-01 卫星 */
  missionMode?: boolean;
  /** 变轨事件:执行变轨后渲染燃烧弧 + 新旧轨道对比 */
  maneuverEvent?: ManeuverEvent | null;
}

export default function CesiumGlobe({ satellites, selectedSatellite, visibleSatellites, missionMode = false, maneuverEvent = null }: CesiumGlobeProps) {
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
    addAoiEntity,
    addTrea01Entity,
    addTrea01OrbitLine,
    focusTrea01,
    clearMissionEntities,
    updateTrea01Position,
    addImagingFootprint,
    updateImagingFootprint,
    clearImagingFootprint,
    addManeuverArc,
    addOrbitComparison,
    clearManeuverEntities,
  } = useCesium();

  const [loadError, setLoadError] = useState<string | null>(null);
  const currentTime = useTimeStore(state => state.currentTime);
  // 订阅 store 中的当前 TLE(变轨后自动更新,替代硬编码 TREA01_INITIAL_TLE)
  const treaTle = useTreaTle();
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

    // 任务模式下隐藏默认 13 颗卫星,仅显示 TREA-01(由 missionMode 效果单独管理)
    if (missionMode) {
      updateSatellitePositions([], currentTime);
      return;
    }

    const visibleIds = new Set(visibleSatellites);
    const filteredSatellites = satellites.filter(s => visibleIds.has(s.noradId));

    // 即使卫星列表为空也要执行，以清理 Cesium 中残留的卫星实体
    updateSatellitePositions(filteredSatellites, currentTime);
  }, [satellites, currentTime, visibleSatellites, isReady, viewer, missionMode, updateSatellitePositions]);

  // Update orbits ONLY when satellite data or visibility changes (not on time change)
  // Orbit shape is a fixed ellipse determined by TLE elements, not by current time.
  // Skip orbit updates while tracking to prevent visual jumping.
  const isTrackingRef = useRef(false);
  useEffect(() => {
    if (!isReady || !viewer || !initCompleted.current) return;
    if (isTrackingRef.current) return; // Freeze orbits during tracking

    // 任务模式下隐藏默认轨道,仅显示 TREA-01 轨道线
    if (missionMode) {
      updateOrbits([], currentTime);
      return;
    }

    const visibleIds = new Set(visibleSatellites);
    const filteredSatellites = satellites.filter(s => visibleIds.has(s.noradId));

    // 即使卫星列表为空也要执行，以清理 Cesium 中残留的轨道实体
    updateOrbits(filteredSatellites, currentTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satellites, visibleSatellites, isReady, viewer, missionMode, updateOrbits]);

  // ============================================================
  // TREA-01 任务模式:渲染 AOI、TREA-01 卫星实体 + 轨道线
  // ============================================================
  // missionMode=true: 添加 AOI_A、AOI_B、TREA-01 卫星实体 + 轨道线,并飞向 TREA-01
  // missionMode=false: 清理所有任务实体
  // 依赖 treaTle:变轨后 TLE 变化 → 重新添加卫星实体 + 更新轨道线
  // 依赖 initCompleted 确保 Cesium viewer 完全初始化后再操作
  useEffect(() => {
    if (!isReady || !viewer || !initCompleted.current) return;

    if (missionMode) {
      // 添加两个 AOI 多边形
      addAoiEntity(AOI_A);
      addAoiEntity(AOI_B);
      // 添加 TREA-01 卫星实体(使用 store 当前 TLE,变轨后自动更新)
      addTrea01Entity(treaTle);
      // 添加 TREA-01 轨道线(紫色发光线)
      addTrea01OrbitLine(treaTle, currentTime);
      // 飞向 TREA-01 卫星
      // 延迟一帧执行 flyTo,确保实体已添加到场景
      const timeoutId = setTimeout(() => focusTrea01(), 100);
      return () => {
        clearTimeout(timeoutId);
      };
    } else {
      // 退出任务模式:清理所有任务实体(含轨道线、变轨可视化)
      clearMissionEntities();
      clearManeuverEntities();
    }
  }, [missionMode, isReady, viewer, treaTle, addAoiEntity, addTrea01Entity, addTrea01OrbitLine, focusTrea01, clearMissionEntities, clearManeuverEntities, currentTime]);

  // TREA-01 卫星位置更新:跟随仿真时间传播
  // 仅在 missionMode=true 时执行,与默认卫星位置更新独立
  // 使用 store 当前 TLE(变轨后位置传播自动切换到新轨道)
  useEffect(() => {
    if (!isReady || !viewer || !initCompleted.current || !missionMode) return;
    updateTrea01Position(treaTle, currentTime);
  }, [missionMode, currentTime, isReady, viewer, treaTle, updateTrea01Position]);

  // ============================================================
  // TREA-01 变轨可视化:燃烧弧 + 新旧轨道对比
  // ============================================================
  // maneuverEvent 变化时(ManeuverPanel 执行变轨)触发:
  // 1. 生成旧轨道点(灰色虚线) + 新轨道点(青色实线) → addOrbitComparison
  // 2. 燃烧弧(亮橙色,取旧轨道最后 N 段) → addManeuverArc
  // 3. 更新 TREA-01 轨道线为新 TLE
  useEffect(() => {
    if (!isReady || !viewer || !initCompleted.current || !missionMode) return;
    if (!maneuverEvent) return;

    const { newTle, oldTle } = maneuverEvent;
    const now = new Date();

    // 生成新旧轨道点(各一整圈,180 点)
    const oldPoints = generateOrbitPoints([oldTle], now, 180);
    const newPoints = generateOrbitPoints([newTle], now, 180);

    // 渲染轨道对比(旧=灰色虚线,新=青色实线)
    if (oldPoints.length >= 2 && newPoints.length >= 2) {
      addOrbitComparison(oldPoints, newPoints);
    }

    // 燃烧弧:取旧轨道最后 10% 段(变轨点附近的高亮)
    const burnStart = Math.floor(oldPoints.length * 0.9);
    const burnArc = oldPoints.slice(burnStart);
    if (burnArc.length >= 2) {
      addManeuverArc(burnArc);
    }

    // 更新 TREA-01 轨道线为新 TLE
    addTrea01OrbitLine(newTle, now);
  }, [maneuverEvent, isReady, viewer, missionMode, addOrbitComparison, addManeuverArc, addTrea01OrbitLine]);

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

      {/* TREA-01 任务仿真状态机:纯逻辑组件无 UI,missionMode 时挂载
          通过 useCurrentTime() 驱动 EXECUTING→IMAGING→COMPLETED 状态转换
          成像足迹方法由 useCesium 注入(每次调用产生独立 state,必须挂在 CesiumGlobe 内) */}
      {missionMode && isReady && !displayError && (
        <MissionSimulator
          addImagingFootprint={addImagingFootprint}
          updateImagingFootprint={updateImagingFootprint}
          clearImagingFootprint={clearImagingFootprint}
        />
      )}

      {/* Reset view button - 任务模式下居中避免被侧边栏遮挡 */}
      {isReady && !displayError && (
        <button
          onClick={handleResetView}
          className={`absolute top-4 z-30 w-10 h-10 flex items-center justify-center rounded-lg bg-space-900/90 backdrop-blur-sm border border-space-700 text-space-300 hover:text-cosmic-blue hover:bg-space-800/90 hover:border-cosmic-blue/50 transition-all ${
            missionMode ? 'left-1/2 -translate-x-1/2' : 'left-4'
          }`}
          title="复位视角 - 东亚上空"
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
