'use client';

// TREA-01 电影回放模式核心控制器 v2(8 镜头完整版)
//
// 新增功能:
//   - shot-03: 自动变轨 + 轨道渐显/渐隐动画
//   - shot-06: 成像扫描带累积动画
//   - 每 3 秒刷新轨道线(修复卫星位置与轨道线不重合)
//   - 8 镜头 32 秒完整流程

import { useEffect, useRef } from 'react';
import { useCinematicStore } from '@/store/cinematicStore';
import { useTreaMissionStore } from '@/store/treaMissionStore';
import { useTimeStore } from '@/store/timeStore';
import { CINEMATIC_SHOTS, CINEMATIC_LEAD_TIME_SEC } from '@/lib/trea/cinematicShots';
import { AOI_LIST } from '@/lib/trea/constants';
import { computeAccessWindows, findNextWindow, normalizeLon } from '@/lib/trea/access';
import { propagateToGeographic } from '@/lib/tle/orbit';
import type { TLEData } from '@/lib/tle/parser';
import type { TreaMissionTask } from '@/store/treaMissionStore';

interface CinematicControllerProps {
  focusTrea01: () => void;
  startTrackingTrea01: () => void;
  stopTrackingTrea01: () => void;
  resetView: () => void;
  refreshTrea01Orbit: (tle: TLEData, time: Date) => void;
  addOrbitTransition: (oldTle: TLEData, newTle: TLEData, time: Date) => void;
  addScanTrailPoint: (centerLonLat: { lon: number; lat: number }, widthKm: number) => void;
  clearScanTrail: () => void;
  clearManeuverEntities: () => void;
  addScanBeam: (
    satelliteGeo: { lon: number; lat: number; altM: number },
    groundCorners: Array<{ lon: number; lat: number }>
  ) => void;
  updateScanBeam: (
    satelliteGeo: { lon: number; lat: number; altM: number },
    groundCorners: Array<{ lon: number; lat: number }>
  ) => void;
  clearScanBeam: () => void;
  zoomOutCoverage: (center: { lon: number; lat: number }, heightM?: number) => void;
}

/** 生成变轨新 TLE(修改平均运动,复用 store 中 collision avoidance 的逻辑) */
function generateManeuverTle(oldTle: TLEData, meanMotionDelta: number): TLEData {
  const line2 = oldTle.line2;
  const meanMotionStr = line2.substring(52, 63);
  const meanMotion = parseFloat(meanMotionStr);
  const newMeanMotion = meanMotion + meanMotionDelta;
  const newMeanMotionStr = newMeanMotion.toFixed(7).padStart(11, ' ').substring(0, 11);
  const newLine2 = line2.substring(0, 52) + newMeanMotionStr + line2.substring(63);

  // 同步更新 line1 的历元
  const now = new Date();
  const year = now.getUTCFullYear() % 100;
  const dayOfYear = Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400000);
  const fractionOfDay = ((now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds()) / 86400).toFixed(8).substring(2);
  const newEpoch = `${year.toString().padStart(2, '0')}${dayOfYear.toString().padStart(3, '0')}.${fractionOfDay}`;
  const newLine1 = oldTle.line1.substring(0, 18) + newEpoch.padEnd(14, '0').substring(0, 14) + oldTle.line1.substring(32);

  return { ...oldTle, line1: newLine1, line2: newLine2 };
}

const SENSOR_WIDTH_KM = 200;

/** 计算地面扫描矩形4角(用于三角形光束底面)
 * 与 useCesium.computeFootprintCorners 一致,顺时针闭合 */
function computeGroundCorners(
  center: { lon: number; lat: number },
  widthKm: number
): Array<{ lon: number; lat: number }> {
  const halfKm = widthKm / 2;
  const KM_PER_DEG = 111.32;
  const halfLat = halfKm / KM_PER_DEG;
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const halfLon = cosLat > 1e-6 ? halfKm / (KM_PER_DEG * cosLat) : 0;
  return [
    { lon: center.lon - halfLon, lat: center.lat - halfLat },
    { lon: center.lon + halfLon, lat: center.lat - halfLat },
    { lon: center.lon + halfLon, lat: center.lat + halfLat },
    { lon: center.lon - halfLon, lat: center.lat + halfLat },
  ];
}

export default function CinematicController({
  focusTrea01,
  startTrackingTrea01,
  stopTrackingTrea01,
  resetView,
  refreshTrea01Orbit,
  addOrbitTransition,
  addScanTrailPoint,
  clearScanTrail,
  clearManeuverEntities,
  addScanBeam,
  updateScanBeam,
  clearScanBeam,
  zoomOutCoverage,
}: CinematicControllerProps) {
  const isActive = useCinematicStore(s => s.isActive);

  const cameraRef = useRef({ focusTrea01, startTrackingTrea01, stopTrackingTrea01, resetView, zoomOutCoverage });
  cameraRef.current = { focusTrea01, startTrackingTrea01, stopTrackingTrea01, resetView, zoomOutCoverage };
  const cesiumMethodsRef = useRef({ refreshTrea01Orbit, addOrbitTransition, addScanTrailPoint, clearScanTrail, clearManeuverEntities, addScanBeam, updateScanBeam, clearScanBeam });
  cesiumMethodsRef.current = { refreshTrea01Orbit, addOrbitTransition, addScanTrailPoint, clearScanTrail, clearManeuverEntities, addScanBeam, updateScanBeam, clearScanBeam };

  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isActive) return;

    // ========== 启动流程 ==========

    // 1. 准备任务
    const treaState = useTreaMissionStore.getState();
    let task = treaState.currentTask;

    if (!task || treaState.missionPhase === 'IDLE') {
      const aoi = AOI_LIST[0];
      const now = new Date();
      const windows = computeAccessWindows(treaState.tle, aoi, now, 48);
      const next = findNextWindow(windows, now) ?? windows[0];

      if (!next) {
        console.warn('[CinematicController] 无可用过境窗口,退出电影模式');
        useCinematicStore.getState().exitCinematic();
        return;
      }

      task = {
        id: `cinematic-${aoi.id}-${Date.now()}`,
        aoiId: aoi.id,
        aoiName: aoi.name,
        plannedTime: next.centerPassTime,
        status: 'PENDING' as const,
        windowStart: next.startTime,
        windowEnd: next.endTime,
        aoiCenter: aoi.center,
      };

      treaState.startTaskSimulation(task);

      const ts = useTimeStore.getState();
      ts.setEndTime(new Date(next.endTime.getTime() + 60_000));
      ts.setCurrentTime(new Date(next.startTime.getTime() - CINEMATIC_LEAD_TIME_SEC * 1000));
    } else if (task.windowStart) {
      const ts = useTimeStore.getState();
      const endTime = task.windowEnd ?? new Date(Date.now() + 3600_000);
      ts.setEndTime(new Date(endTime.getTime() + 60_000));
      ts.setCurrentTime(new Date(task.windowStart.getTime() - CINEMATIC_LEAD_TIME_SEC * 1000));
      if (treaState.missionPhase === 'COMPLETED') {
        treaState.setMissionPhase('EXECUTING');
      }
    }

    // 2. 停掉 timeStore RAF
    useTimeStore.getState().stopPlayback();

    // 3. 清理旧的扫描带、扫描光束和变轨实体
    cesiumMethodsRef.current.clearScanTrail();
    cesiumMethodsRef.current.clearScanBeam();
    cesiumMethodsRef.current.clearManeuverEntities();

    // 相机动作执行
    function executeCameraAction(shotIndex: number) {
      const shot = CINEMATIC_SHOTS[shotIndex];
      if (!shot) return;
      const cam = cameraRef.current;
      switch (shot.cameraAction) {
        case 'resetView': cam.resetView(); break;
        case 'focusTrea01': cam.focusTrea01(); break;
        case 'startTracking': cam.startTrackingTrea01(); break;
        case 'stopTracking': cam.stopTrackingTrea01(); break;
        case 'zoomOutCoverage': {
          // 覆盖展示:飞向 AOI 上空 3000km 倾斜俯视,看扫描覆盖范围
          const task = useTreaMissionStore.getState().currentTask;
          const center = task?.aoiCenter ?? AOI_LIST[0].center;
          cam.zoomOutCoverage(center);
          break;
        }
        case 'hold': break;
      }
    }

    // shot-03 变轨状态跟踪
    let maneuverExecuted = false;
    let maneuverOldTle: TLEData | null = null;
    let maneuverNewTle: TLEData | null = null;

    // shot-06 扫描带节流(每 3 帧添加一个点,避免过多实体)
    let scanFrameCounter = 0;
    // shot-06 三角形光束是否已创建(首帧创建,后续帧更新)
    let scanBeamCreated = false;

    // 轨道刷新计时器(每 3 秒刷新,修复轨道线不重合)
    let orbitRefreshTimer = 0;

    executeCameraAction(0);

    // ========== RAF 循环 ==========
    let lastTimestamp: number | null = null;
    let shotElapsed = 0;

    const loop = (timestamp: number) => {
      const cs = useCinematicStore.getState();
      if (!cs.isActive) return;

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

      // 推进仿真时间
      const simDelta = deltaSec * shot.transition.timeScale;
      const ts = useTimeStore.getState();
      const newTime = new Date(ts.currentTime.getTime() + simDelta * 1000);
      ts.setCurrentTime(newTime);

      cs.tick(deltaSec);
      shotElapsed += deltaSec;

      const currentTle = useTreaMissionStore.getState().tle;
      const currentTime = useTimeStore.getState().currentTime;

      // --- 轨道刷新(每 3 秒,shot-03 期间跳过避免干扰动画) ---
      if (shot.id !== 'shot-03') {
        orbitRefreshTimer += deltaSec;
        if (orbitRefreshTimer >= 3) {
          cesiumMethodsRef.current.refreshTrea01Orbit(currentTle, currentTime);
          orbitRefreshTimer = 0;
        }
      }

      // --- shot-03 变轨逻辑 ---
      if (shot.id === 'shot-03') {
        if (!maneuverExecuted) {
          // t=0: 初始化变轨,启动轨道渐变动画
          maneuverOldTle = { ...currentTle };
          maneuverNewTle = generateManeuverTle(currentTle, 0.00002);
          cesiumMethodsRef.current.addOrbitTransition(maneuverOldTle, maneuverNewTle, currentTime);
          maneuverExecuted = true; // 标记已初始化(不是已执行)
        }

        // t=3s: 切换 TLE(卫星跳到新轨道)
        if (shotElapsed >= 3 && maneuverNewTle) {
          useTreaMissionStore.getState().executeManeuver(0.03, maneuverNewTle, 0.2);
          maneuverNewTle = null; // 避免重复执行
        }
      }

      // --- shot-06 成像扫描带 + 三角形光束 ---
      if (shot.id === 'shot-06') {
        // 获取卫星地理坐标(lat, lon, alt-km)
        const geo = propagateToGeographic(currentTle, currentTime);
        if (geo) {
          // 三角形光束:用地理坐标构建(与地面点同坐标系)
          // alt 单位 km → 转 m
          const satGeo = {
            lon: normalizeLon(geo.lon),
            lat: geo.lat,
            altM: geo.alt * 1000,
          };

          const centerLonLat = { lon: normalizeLon(geo.lon), lat: geo.lat };
          const groundCorners = computeGroundCorners(centerLonLat, SENSOR_WIDTH_KM);

          // 首帧创建光束实体,后续帧更新位置
          if (!scanBeamCreated) {
            cesiumMethodsRef.current.addScanBeam(satGeo, groundCorners);
            scanBeamCreated = true;
          } else {
            cesiumMethodsRef.current.updateScanBeam(satGeo, groundCorners);
          }
        }

        // 扫描带累积:每 3 帧添加一个持久化地面矩形
        scanFrameCounter++;
        if (scanFrameCounter >= 3) {
          if (geo) {
            cesiumMethodsRef.current.addScanTrailPoint(
              { lon: normalizeLon(geo.lon), lat: geo.lat },
              SENSOR_WIDTH_KM
            );
          }
          scanFrameCounter = 0;
        }
      }

      // --- 镜头切换检查 ---
      const phase = useTreaMissionStore.getState().missionPhase;
      let shouldAdvance = false;
      if (shotElapsed >= shot.transition.maxDurationSec) shouldAdvance = true;
      if (shot.transition.triggerPhase && phase === shot.transition.triggerPhase) shouldAdvance = true;

      if (shouldAdvance) {
        const nextIndex = cs.currentShotIndex + 1;

        // shot-03 退出时:清理变轨实体 + 刷新主轨道线
        if (shot.id === 'shot-03') {
          cesiumMethodsRef.current.clearManeuverEntities();
          cesiumMethodsRef.current.refreshTrea01Orbit(
            useTreaMissionStore.getState().tle,
            useTimeStore.getState().currentTime
          );
        }

        // shot-06 退出时:清理三角形光束(成像结束,进入覆盖展示)
        if (shot.id === 'shot-06') {
          cesiumMethodsRef.current.clearScanBeam();
        }

        if (nextIndex < CINEMATIC_SHOTS.length) {
          // shot-04 特殊处理:直接跳到目标附近(不受原轨道限制)
          if (CINEMATIC_SHOTS[nextIndex]?.id === 'shot-04') {
            const task = useTreaMissionStore.getState().currentTask;
            if (task?.windowStart) {
              useTimeStore.getState().setCurrentTime(
                new Date(task.windowStart.getTime() - 10_000) // windowStart - 10s
              );
            }
          }
          useCinematicStore.getState().advanceShot();
          shotElapsed = 0;
          executeCameraAction(nextIndex);
        } else {
          useCinematicStore.getState().exitCinematic();
          return;
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    // ========== 清理函数 ==========
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;

      cameraRef.current.stopTrackingTrea01();

      // 清理扫描光束和变轨实体
      cesiumMethodsRef.current.clearScanBeam();
      cesiumMethodsRef.current.clearManeuverEntities();

      // 恢复 timeStore
      const ts = useTimeStore.getState();
      ts.resetToNow();
      ts.startPlayback();
    };
  }, [isActive]);

  return null;
}
