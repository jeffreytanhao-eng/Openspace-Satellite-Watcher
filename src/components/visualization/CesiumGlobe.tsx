'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { SpaceObject } from '@/store/satelliteStore';
import { useSatelliteStore } from '@/store/satelliteStore';
import { useTimeStore } from '@/store/timeStore';
import { useCesium } from '@/hooks/useCesium';
import { AOI_A, AOI_B } from '@/lib/trea/constants';
import { useTreaTle, useTreaMissionStore } from '@/store/treaMissionStore';
import { generateOrbitPointsECEF } from '@/lib/cesium/positions';
import type { TLEData } from '@/lib/tle/parser';
import MissionSimulator from '@/components/trea/MissionSimulator';
import CinematicController from '@/components/trea/CinematicController';
import CinematicOverlay from '@/components/trea/CinematicOverlay';

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
    startTrackingTrea01,
    stopTrackingTrea01,
    refreshTrea01Orbit,
    addOrbitTransition,
    addScanBeam,
    updateScanBeam,
    clearScanBeam,
    // V2-B/V3-C/V1/V3-D 新增方法
    highlightAoi,
    unhighlightAoi,
    addContinuousSwathPoint,
    clearContinuousSwath,
    focusOrbitChange,
    frameSatAndAoi,
    lookDownAtScan,
    zoomOutCoverage,
  } = useCesium();

  const [loadError, setLoadError] = useState<string | null>(null);
  const currentTime = useTimeStore(state => state.currentTime);
  // 订阅 store 中的当前 TLE(变轨后自动更新,替代硬编码 TREA01_INITIAL_TLE)
  const treaTle = useTreaTle();
  // 虚拟任务轨道 TLE(任务执行期间使用,使卫星经过 AOI 上空)
  const missionOrbitTle = useTreaMissionStore(s => s.missionOrbitTle);
  // 活跃 TLE:任务期间使用虚拟 TLE,否则使用原 TLE
  const activeTle = missionOrbitTle ?? treaTle;
  // TREA-01 跟踪状态(由 TreaSatelliteView 按钮切换,本组件监听并调用 startTrackingTrea01)
  const trea01Tracking = useTreaMissionStore(s => s.trea01Tracking);
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

  // 轨道线更新节流:记录上次更新的真实时间(与卫星位置更新共用同一 effect)
  const lastOrbitUpdateRealRef = useRef(0);

  // ============================================================
  // TREA-01 任务模式:渲染 AOI、TREA-01 卫星实体 + 轨道线
  // ============================================================
  // missionMode=true: 添加 AOI_A、AOI_B、TREA-01 卫星实体 + 轨道线,并飞向 TREA-01
  // missionMode=false: 清理所有任务实体
  // 依赖 activeTle:虚拟轨道 TLE 变化 → 重新添加卫星实体 + 更新轨道线
  // 注意:只在首次进入 missionMode 时调用 focusTrea01(),
  //   activeTle 变化(任务开始/结束)时不重复调用,避免打断跟踪状态。
  const missionInitializedRef = useRef(false);
  useEffect(() => {
    if (!isReady || !viewer || !initCompleted.current) return;

    if (missionMode) {
      // 添加两个 AOI 多边形
      addAoiEntity(AOI_A);
      addAoiEntity(AOI_B);
      // 添加 TREA-01 卫星实体(使用活跃 TLE,虚拟轨道/变轨后自动更新)
      addTrea01Entity(activeTle);
      // 添加 TREA-01 轨道线(紫色发光线,用当前仿真时间采样)
      addTrea01OrbitLine(activeTle, useTimeStore.getState().currentTime);
      lastOrbitUpdateRealRef.current = 0; // 重置,让下方 effect 立即触发首次更新
      // 只在首次进入 missionMode 时飞向 TREA-01,避免 activeTle 变化时打断跟踪
      if (!missionInitializedRef.current) {
        missionInitializedRef.current = true;
        // 延迟一帧执行 flyTo,确保实体已添加到场景
        const timeoutId = setTimeout(() => focusTrea01(), 100);
        return () => {
          clearTimeout(timeoutId);
        };
      }
    } else {
      missionInitializedRef.current = false;
      // 退出任务模式:清理所有任务实体(含轨道线、变轨可视化)
      clearMissionEntities();
      clearManeuverEntities();
    }
  }, [missionMode, isReady, viewer, activeTle, addAoiEntity, addTrea01Entity, addTrea01OrbitLine, focusTrea01, clearMissionEntities, clearManeuverEntities]);

  // TREA-01 卫星位置 + 轨道线更新:跟随仿真时间传播
  // 轨道线与卫星位置使用相同的 currentTime 生成,确保 GMST 一致,不会偏差
  // 节流:轨道线每 1 秒真实时间更新一次(避免每帧采样 180 个点),卫星位置每帧更新
  // addTrea01OrbitLine 已改为"更新 positions"而非"删除重建",不会闪烁
  useEffect(() => {
    if (!isReady || !viewer || !initCompleted.current || !missionMode) return;
    // 卫星位置:每帧更新
    updateTrea01Position(activeTle, currentTime);
    // 轨道线:每 1 秒真实时间更新一次,用当前 currentTime 确保与卫星位置时间基准一致
    const nowReal = Date.now();
    if (lastOrbitUpdateRealRef.current === 0 || nowReal - lastOrbitUpdateRealRef.current > 1000) {
      addTrea01OrbitLine(activeTle, currentTime);
      lastOrbitUpdateRealRef.current = nowReal;
    }
  }, [missionMode, currentTime, isReady, viewer, activeTle, updateTrea01Position, addTrea01OrbitLine]);

  // TREA-01 跟踪:trea01Tracking 状态变化时启动/停止持续跟踪
  // 跟踪状态由 TreaSatelliteView 的按钮切换(经 treaMissionStore 共享)
  // 本组件持有 Cesium 实例,负责实际调用 startTrackingTrea01/stopTrackingTrea01
  useEffect(() => {
    if (!isReady || !viewer || !missionMode) return;
    if (trea01Tracking) {
      startTrackingTrea01();
    } else {
      stopTrackingTrea01();
    }
  }, [trea01Tracking, missionMode, isReady, viewer, startTrackingTrea01, stopTrackingTrea01]);

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

    // 生成新旧轨道点(各一整圈,180 点,ECEF 坐标与 Cesium FIXED 一致)
    const oldPoints = generateOrbitPointsECEF([oldTle], now, 180);
    const newPoints = generateOrbitPointsECEF([newTle], now, 180);

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

  // 退出任务中心时(missionMode true→false)自动重置视角到东亚上空
  // 确保退出后主大屏视角与首次打开应用时一致
  const prevMissionMode = useRef(missionMode);
  useEffect(() => {
    if (prevMissionMode.current && !missionMode && isReady) {
      resetView();
    }
    prevMissionMode.current = missionMode;
  }, [missionMode, isReady, resetView]);

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
          成像足迹/扫描光束/连续 swath/AOI 高亮方法由 useCesium 注入
          V2-B/V3:正常任务模式也具备 AOI 高亮 + 连续 swath + 扫描光束 */}
      {missionMode && isReady && !displayError && (
        <MissionSimulator
          addImagingFootprint={addImagingFootprint}
          updateImagingFootprint={updateImagingFootprint}
          clearImagingFootprint={clearImagingFootprint}
          addScanBeam={addScanBeam}
          updateScanBeam={updateScanBeam}
          clearScanBeam={clearScanBeam}
          addContinuousSwathPoint={addContinuousSwathPoint}
          clearContinuousSwath={clearContinuousSwath}
          highlightAoi={highlightAoi}
          unhighlightAoi={unhighlightAoi}
        />
      )}

      {/* 电影回放模式控制器(纯逻辑,missionMode 时挂载)
          v4 简化版:4 阶段(远景→拉近→视频→报告),无进度条 */}
      {missionMode && isReady && !displayError && (
        <CinematicController
          resetView={resetView}
          focusTrea01={focusTrea01}
          stopTrackingTrea01={stopTrackingTrea01}
        />
      )}
      {/* 电影回放模式 UI 覆层(底部文字 + 视频/报告弹窗,用 Portal 渲染到 body) */}
      {missionMode && <CinematicOverlay />}

      {/* Reset view button - 左下角,避免遮挡顶部信息与侧边栏 */}
      {isReady && !displayError && (
        <button
          onClick={handleResetView}
          className="absolute bottom-4 left-4 z-30 w-10 h-10 flex items-center justify-center rounded-lg bg-space-900/90 backdrop-blur-sm border border-space-700 text-space-300 hover:text-cosmic-blue hover:bg-space-800/90 hover:border-cosmic-blue/50 transition-all"
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
