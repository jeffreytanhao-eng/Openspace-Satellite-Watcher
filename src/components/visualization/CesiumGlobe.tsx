'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { SpaceObject } from '@/store/satelliteStore';
import { useSatelliteStore } from '@/store/satelliteStore';
import { useTimeStore } from '@/store/timeStore';
import { useCesium } from '@/hooks/useCesium';
import { AOI_A, AOI_B } from '@/lib/trea/constants';
import { useTreaTle, useTreaMissionStore } from '@/store/treaMissionStore';
import { useCinematicStore } from '@/store/cinematicStore';
import { generateOrbitPointsECEF } from '@/lib/cesium/positions';
import type { TLEData } from '@/lib/tle/parser';
import MissionSimulator from '@/components/trea/MissionSimulator';
import CinematicController from '@/components/trea/CinematicController';
import CinematicOverlay from '@/components/trea/CinematicOverlay';
import { CINEMATIC_SHOTS } from '@/lib/trea/cinematicShots';

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
    Cesium: CesiumNS,
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
  // 变轨动画:订阅 store 用于判定 maneuverEvent 来源 + commit + 阶段控制
  const lastAvoidanceExecution = useTreaMissionStore(s => s.lastAvoidanceExecution);
  const commitAvoidanceManeuver = useTreaMissionStore(s => s.commitAvoidanceManeuver);
  const setManeuverAnimationPhase = useTreaMissionStore(s => s.setManeuverAnimationPhase);
  const maneuverAnimationPhase = useTreaMissionStore(s => s.maneuverAnimationPhase);
  // 电影回放状态(回放期间暂停跟踪,退出后自动恢复)
  const cinematicActive = useCinematicStore(s => s.isActive);
  // 电影回放当前镜头索引:报告阶段(showReport)不拦截跟踪,让大屏卫星恢复跟踪+播放
  const cinematicShotIndex = useCinematicStore(s => s.currentShotIndex);
  const isCinematicReport =
    cinematicActive && !!CINEMATIC_SHOTS[cinematicShotIndex]?.showReport;
  // 视频播放中:暂停 Cesium 渲染(requestRenderMode)释放 GPU 给视频解码
  const videoPlaying = useTreaMissionStore(s => s.videoPlaying);
  // 变轨动画 cleanup 句柄(effect 清理 + 卸载时清理 setTimeout,避免重复 commit)
  const animationCleanupRef = useRef<(() => void) | null>(null);
  // TREA-01 跟踪状态(由 TreaSatelliteView 按钮切换,本组件监听并调用 startTrackingTrea01)
  const trea01Tracking = useTreaMissionStore(s => s.trea01Tracking);
  // 任务仿真阶段:任务执行(EXECUTING/IMAGING)期间相机由 MissionSimulator 的
  // frameSatAndAoi(卫星+AOI 同框近景)独占控制,本组件不启动卫星跟踪避免冲突。
  // 任务完成后(COMPLETED)此 effect 因 missionPhase 变化重新执行,自动恢复卫星跟踪。
  const missionPhase = useTreaMissionStore(s => s.missionPhase);
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

  // Update orbits: ECEF 下轨道线随地球自转偏移,需随 currentTime 节流重新生成
  // 才能与卫星位置(GMST 一致)重合。跟踪时延长节流至 3 秒,平衡视觉稳定性与精度。
  const isTrackingRef = useRef(false);
  // 轨道线更新节流:记录上次更新的真实时间(普通模式与 TREA-01 轨道线共用)
  const lastOrbitUpdateRealRef = useRef(0);
  useEffect(() => {
    if (!isReady || !viewer || !initCompleted.current) return;

    // 任务模式下无条件隐藏默认轨道,仅显示 TREA-01 轨道线
    // 必须在 isTrackingRef 判断之前执行:即使进入任务中心前正在跟踪某缺省卫星,
    // 也要先移除默认轨道,避免 14 颗缺省轨道残留在任务中心
    if (missionMode) {
      updateOrbits([], currentTime);
      return;
    }

    const visibleIds = new Set(visibleSatellites);
    const filteredSatellites = satellites.filter(s => visibleIds.has(s.noradId));

    // 轨道线在 ECEF(固定)坐标系下会随地球自转而偏移,必须用最新 currentTime
    // 重新生成才能与卫星位置(GMST 一致)重合。
    // 跟踪时使用 3 秒节流(平衡视觉稳定性与轨道精度),非跟踪时 1 秒。
    const nowReal = Date.now();
    const throttleMs = isTrackingRef.current ? 3000 : 1000;
    if (lastOrbitUpdateRealRef.current === 0 || nowReal - lastOrbitUpdateRealRef.current > throttleMs) {
      // 即使卫星列表为空也要执行,以清理 Cesium 中残留的轨道实体
      updateOrbits(filteredSatellites, currentTime);
      lastOrbitUpdateRealRef.current = nowReal;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satellites, visibleSatellites, currentTime, isReady, viewer, missionMode, updateOrbits]);

  // ============================================================
  // TREA-01 任务模式:渲染 AOI、TREA-01 卫星实体 + 轨道线
  // ============================================================
  // missionMode=true: 添加 AOI_A、AOI_B、TREA-01 卫星实体 + 轨道线
  // missionMode=false: 清理所有任务实体
  // 依赖 activeTle:虚拟轨道 TLE 变化 → 重新添加卫星实体 + 更新轨道线
  // 相机定位由 trea01Tracking(startTrackingTrea01)负责,与"定位键"行为一致
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
      console.log('[DIAG missionMode init] orbit line added, tle:', activeTle.name, 'time:', useTimeStore.getState().currentTime.toISOString());
      lastOrbitUpdateRealRef.current = 0; // 重置,让下方 effect 立即触发首次更新
      missionInitializedRef.current = true;
    } else {
      missionInitializedRef.current = false;
      // 退出任务模式:清理所有任务实体(含轨道线、变轨可视化)
      clearMissionEntities();
      clearManeuverEntities();
      // 重置轨道线节流:让默认卫星轨道 effect 立即重新生成(否则节流会跳过,轨道消失)
      lastOrbitUpdateRealRef.current = 0;
    }
  }, [missionMode, isReady, viewer, activeTle, addAoiEntity, addTrea01Entity, addTrea01OrbitLine, clearMissionEntities, clearManeuverEntities]);

  // TREA-01 卫星位置 + 轨道线更新:跟随仿真时间传播
  // 轨道线与卫星位置每帧用相同 currentTime 生成,确保 GMST 一致、完全重合、不闪烁
  // 单条轨道每帧采样 180 点开销可忽略(<1ms),无需节流(节流会导致 10x 播放时轨道 1s 跳变闪烁)
  useEffect(() => {
    if (!isReady || !viewer || !initCompleted.current || !missionMode) return;
    // 卫星位置 + 轨道线:每帧更新(同一 currentTime,GMST 一致,不会偏差或闪烁)
    updateTrea01Position(activeTle, currentTime);
    addTrea01OrbitLine(activeTle, currentTime);
  }, [missionMode, currentTime, isReady, viewer, activeTle, updateTrea01Position, addTrea01OrbitLine]);

  // 同步 Cesium 时钟与仿真时间
  // Cesium 用 viewer.clock.currentTime 决定地球旋转角度(ECEF→INERTIAL 变换)
  // 若不同步,ECEF 坐标会被 Cesium 用错误的 GMST 渲染到地球错误位置
  // 仿真 10x 播放时偏差会累积,导致卫星视觉位置偏离轨道线
  useEffect(() => {
    if (!isReady || !viewer || !CesiumNS) return;
    viewer.clock.currentTime = CesiumNS.JulianDate.fromDate(currentTime);
  }, [currentTime, isReady, viewer, CesiumNS]);

  // TREA-01 跟踪:trea01Tracking 状态变化时启动/停止持续跟踪
  // 跟踪状态由 TreaSatelliteView 的按钮切换(经 treaMissionStore 共享)
  // 本组件持有 Cesium 实例,负责实际调用 startTrackingTrea01/stopTrackingTrea01
  // 变轨动画(focusOrbitChange)和电影回放(CinematicController)会临时停止跟踪监听器,
  // 但 trea01Tracking store 状态不变。此 effect 依赖 maneuverAnimationPhase/cinematicActive,
  // 当动画/回放结束后(state 从 'running'→'done'/'idle' 或 cinematicActive false→true),
  // effect 重新触发并自动恢复跟踪,无需用户重新点击按钮。
  useEffect(() => {
    if (!isReady || !viewer) return;
    // 退出任务中心(missionMode=false)时仍需停止跟踪,否则 enableZoom=false 和
    // wheel 监听器残留,导致态势感知页面滚轮缩放失效
    if (!missionMode) {
      stopTrackingTrea01();
      return;
    }
    if (trea01Tracking) {
      // 变轨动画运行中(running/committed/done)或电影回放期间不启动跟踪
      // (让 focusOrbitChange / 电影相机控制;动画结束后 phase 回到 'idle' 自动恢复)
      // 特例:电影回放的"任务报告"阶段允许跟踪——报告弹出后大屏卫星应在跟踪状态下播放
      if (maneuverAnimationPhase !== 'idle' || (cinematicActive && !isCinematicReport)) return;
      // 任务执行阶段(EXECUTING/IMAGING)不启动卫星跟踪:
      //   - EXECUTING:保持挂载时已启动的卫星跟踪(相机跟随卫星接近目标)
      //   - IMAGING:相机由 MissionSimulator 的 frameSatAndAoi(卫星+AOI 同框)接管
      // 任务完成后(COMPLETED)此 effect 因 missionPhase 变化重新执行,自动恢复卫星跟踪,
      // 避免 frameSatAndAoi 的 preUpdate 监听器引用已销毁实体导致"跟踪失效"。
      if (missionPhase === 'EXECUTING' || missionPhase === 'IMAGING') return;
      startTrackingTrea01();
    } else {
      stopTrackingTrea01();
    }
  }, [trea01Tracking, missionPhase, missionMode, isReady, viewer, startTrackingTrea01, stopTrackingTrea01, maneuverAnimationPhase, cinematicActive, isCinematicReport]);

  // 视频回放期间暂停 Cesium 渲染,释放 GPU 给视频解码
  // ------------------------------------------------------------
  // 关键:仅用 requestRenderMode 不够——当场景有持续更新(跟踪 preUpdate 移相机、
  // 仿真时钟 10x 运行导致卫星位置每帧变化)时,Cesium 仍会每帧渲染,与 <video> 解码
  // 抢 GPU,使视频缓冲耗尽后卡死。故这里额外设 viewer.useDefaultRenderLoop=false,
  // 彻底停掉 rAF 渲染循环。
  //
  // 作用域安全:仅在 videoPlaying=true 时生效。videoPlaying 只由电影回放/避撞回放
  // 视频弹窗(AvoidanceVideoModal/ScanVideoModal)挂载时置 true,态势感知主大屏与
  // 任务系统正常渲染(EXECUTING/IMAGING/变轨动画/扫描光束)均不会置 true,故不受影响。
  useEffect(() => {
    if (!isReady || !viewer) return;
    const scene = viewer.scene;
    if (videoPlaying) {
      scene.requestRenderMode = true;
      scene.maximumRenderTimeChange = Infinity;
      viewer.useDefaultRenderLoop = false; // 真正停止渲染循环,释放 GPU
    } else {
      viewer.useDefaultRenderLoop = true; // 恢复渲染循环
      scene.requestRenderMode = false;
      scene.requestRender();
    }
  }, [videoPlaying, isReady, viewer]);

  // ============================================================
  // TREA-01 变轨可视化:新旧轨道渐变动画(无燃烧弧)
  // ============================================================
  // maneuverEvent 变化时触发 addOrbitTransition 5s 动画:
  // - 紧急避撞路径(id === lastAvoidanceExecution.id):挂 onSwitch(commit t=3s) + onDone(phase='done')
  // - ManeuverPanel 路径:仅播放动画(已立即更新 tle,卫星 t=0 在新轨道)
  useEffect(() => {
    if (!isReady || !viewer || !initCompleted.current || !missionMode) return;
    if (!maneuverEvent) return;

    const { newTle, oldTle, id } = maneuverEvent;
    // 使用仿真时间(而非真实时间 new Date())生成轨道点,确保轨道线与卫星位置(GMST 一致)重合
    const simNow = useTimeStore.getState().currentTime;

    // 判定来源:走 prepare/commit 延迟切换(避撞 + 手动变轨共用流程)
    // vs 旧版 maneuver-panel 立即切换(已废弃,但保留兼容)
    const isPrepareCommitFlow =
      !!lastAvoidanceExecution && id === lastAvoidanceExecution.id;

    // 仅 prepare/commit 路径挂回调:t=3s commit(卫星切新轨道),t=5s 动画结束
    const onSwitch = isPrepareCommitFlow ? () => commitAvoidanceManeuver() : undefined;
    const onDone = isPrepareCommitFlow
      ? () => setManeuverAnimationPhase('done')
      : undefined;

    // 聚焦相机到卫星变轨位置(1000km 近距侧视,突出新旧轨道分离)
    // 仅在任务模式下执行,不影响态势感知界面
    // 若用户已开启跟踪,保持跟踪状态(相机继续跟随卫星),不切换到侧视角度
    const isTrackingNow = useTreaMissionStore.getState().trea01Tracking;
    if (!isTrackingNow) {
      focusOrbitChange();
    }

    // 启动 5s 动画序列(addOrbitTransition 内部先清理旧变轨实体,无需手动清理)
    // 卫星位置由下方 position effect 用 activeTle 自动更新,无需此处处理
    const cleanup = addOrbitTransition(oldTle, newTle, simNow, onSwitch, onDone);
    animationCleanupRef.current = cleanup;

    // cleanup:清理 setTimeout + 实体(避免卸载/重触发后 setTimeout 残留导致重复 commit)
    // commitAvoidanceManeuver 自带幂等守卫,即使 StrictMode 双跑也安全
    return () => {
      cleanup();
      animationCleanupRef.current = null;
    };
  }, [
    maneuverEvent,
    isReady,
    viewer,
    missionMode,
    addOrbitTransition,
    focusOrbitChange,
    lastAvoidanceExecution,
    commitAvoidanceManeuver,
    setManeuverAnimationPhase,
  ]);

  // 组件卸载时清理变轨动画(清理 setTimeout + 实体)
  useEffect(() => {
    return () => {
      if (animationCleanupRef.current) {
        animationCleanupRef.current();
        animationCleanupRef.current = null;
      }
    };
  }, []);

  // 变轨动画结束(phase='done')或退出(phase='idle')时清理变轨演示实体,恢复大屏原始状态
  useEffect(() => {
    if (maneuverAnimationPhase === 'done' || maneuverAnimationPhase === 'idle') {
      clearManeuverEntities();
    }
  }, [maneuverAnimationPhase, clearManeuverEntities]);

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
          frameSatAndAoi={frameSatAndAoi}
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
