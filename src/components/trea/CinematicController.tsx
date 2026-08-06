'use client';

// ============================================================
// TREA-01 电影回放控制器 v4(4 阶段简化版)
// ------------------------------------------------------------
// 阶段1(2秒):远景卫星移动,底部"接受任务"
// 阶段2(3秒):卫星拉近,底部"变轨飞向目标区域"
// 阶段3(5秒):视频播放窗口(ScanVideoModal 占位符)
// 阶段4(无限):任务报告窗口(用户关闭后退出)
//
// 无进度条,无复杂相机动画,无实时3D扫描
// 使用 ref 存储回调,避免 useEffect 依赖导致的潜在无限循环
// ============================================================

import { useEffect, useRef } from 'react';
import { useCinematicStore } from '@/store/cinematicStore';
import { useTreaMissionStore } from '@/store/treaMissionStore';
import { useTimeStore } from '@/store/timeStore';
import { CINEMATIC_SHOTS } from '@/lib/trea/cinematicShots';
import { generateReport } from '@/lib/trea/report';
import type { MissionResult } from '@/store/treaMissionStore';

interface CinematicControllerProps {
  resetView: () => void;
  focusTrea01: () => void;
  stopTrackingTrea01: () => void;
}

export default function CinematicController({
  resetView,
  focusTrea01,
  stopTrackingTrea01,
}: CinematicControllerProps) {
  const isActive = useCinematicStore(s => s.isActive);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  const resetViewRef = useRef(resetView);
  const focusTrea01Ref = useRef(focusTrea01);
  const stopTrackingTrea01Ref = useRef(stopTrackingTrea01);

  useEffect(() => {
    resetViewRef.current = resetView;
  }, [resetView]);
  useEffect(() => {
    focusTrea01Ref.current = focusTrea01;
  }, [focusTrea01]);
  useEffect(() => {
    stopTrackingTrea01Ref.current = stopTrackingTrea01;
  }, [stopTrackingTrea01]);

  // 退出电影模式时恢复 timeStore + 清除虚拟轨道(独立 effect,避免 StrictMode 双重调用冲突)
  // 只在 isActive 从 true → false 时执行一次
  const prevIsActiveRef = useRef(false);
  useEffect(() => {
    if (prevIsActiveRef.current && !isActive) {
      const t = useTimeStore.getState();
      t.resetToNow();
      t.startPlayback();
      // 退出电影模式:清除虚拟任务轨道 TLE,卫星回到原轨道
      // 但检查 missionPhase 避免打断正在执行的非电影任务
      const treaState = useTreaMissionStore.getState();
      if (treaState.missionPhase !== 'IMAGING' && treaState.missionPhase !== 'EXECUTING') {
        treaState.setMissionOrbitTle(null);
      }
    }
    prevIsActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    if (!isActive) {
      startedRef.current = false;
      return;
    }

    if (startedRef.current) return;
    startedRef.current = true;

    const treaState = useTreaMissionStore.getState();
    const task = treaState.currentTask;
    // 严格防御:仅对地遥感扫描任务完成后才允许启动电影回放
    if (
      !task
      || task.aoiId === 'COLLISION_AVOIDANCE'
      || !task.aoiCenter
      || !task.windowStart
      || treaState.missionPhase !== 'COMPLETED'
      || !treaState.lastReport
    ) {
      console.warn('[CinematicController] 电影回放仅在对地遥感扫描任务完成后可用');
      useCinematicStore.getState().exitCinematic();
      startedRef.current = false;
      return;
    }

    const ts = useTimeStore.getState();
    ts.stopPlayback();
    ts.setCurrentTime(new Date());

    function executeCameraAction(shotIndex: number) {
      const shot = CINEMATIC_SHOTS[shotIndex];
      if (!shot) return;
      switch (shot.cameraAction) {
        case 'resetView': resetViewRef.current?.(); break;
        case 'focusTrea01': focusTrea01Ref.current?.(); break;
        case 'hold': break;
      }
    }

    function ensureReport() {
      const state = useTreaMissionStore.getState();
      if (state.lastReport) return;

      const t = state.currentTask;
      if (!t) return;

      const mockResult: MissionResult = {
        taskId: t.id,
        aoiId: t.aoiId,
        aoiName: t.aoiName,
        aoiCenter: t.aoiCenter ?? { lat: 0, lon: 0 },
        windowStart: t.windowStart ?? new Date(),
        windowEnd: t.windowEnd ?? new Date(),
        duration: 60,
        coveragePercent: 87.5,
        imagingAreaKm2: 4200,
        fuelConsumed: 0.3,
        finalFuel: Math.max(0, state.fuel - 0.3),
        satelliteState: {
          fuel: Math.max(0, state.fuel - 0.3),
          battery: state.battery,
          attitude: state.attitude,
          payloadStatus: 'STANDBY',
        },
        footprintPoints: [],
      };

      const report = generateReport(mockResult);
      state.setLastReport(report);
    }

    executeCameraAction(0);

    let lastTimestamp: number | null = null;
    let shotElapsed = 0;

    const loop = (timestamp: number) => {
      const cs = useCinematicStore.getState();
      if (!cs.isActive) {
        rafRef.current = null;
        return;
      }

      if (cs.isPaused) {
        lastTimestamp = timestamp;
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      if (lastTimestamp === null) {
        lastTimestamp = timestamp;
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const deltaSec = Math.min(0.1, (timestamp - lastTimestamp) / 1000);
      lastTimestamp = timestamp;

      const shot = CINEMATIC_SHOTS[cs.currentShotIndex];
      if (!shot) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      if (shot.transition.timeScale > 0) {
        const simDelta = deltaSec * shot.transition.timeScale;
        const t = useTimeStore.getState();
        t.setCurrentTime(new Date(t.currentTime.getTime() + simDelta * 1000));
      }

      cs.tick(deltaSec);
      shotElapsed += deltaSec;

      if (shotElapsed >= shot.transition.maxDurationSec) {
        const nextIndex = cs.currentShotIndex + 1;

        if (nextIndex < CINEMATIC_SHOTS.length) {
          useCinematicStore.getState().advanceShot();
          shotElapsed = 0;
          executeCameraAction(nextIndex);

          const nextShot = CINEMATIC_SHOTS[nextIndex];
          if (nextShot?.showReport) {
            ensureReport();
          }
        } else {
          useCinematicStore.getState().exitCinematic();
          rafRef.current = null;
          startedRef.current = false;
          return;
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      startedRef.current = false;
      stopTrackingTrea01Ref.current?.();
      // 双保险:清除虚拟 TLE(主清除逻辑在 isActive 监听 effect 中)
      useTreaMissionStore.getState().setMissionOrbitTle(null);
      // timeStore 恢复已移到独立的 isActive 监听 effect 中,避免 StrictMode 双重调用冲突
    };
  }, [isActive]);

  return null;
}
