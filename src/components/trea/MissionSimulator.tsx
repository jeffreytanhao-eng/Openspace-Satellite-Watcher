'use client';

// ============================================================
// TREA-01 任务仿真状态机驱动器(M4 / Task 12)v2
// ------------------------------------------------------------
// 纯逻辑组件,返回 null(无 UI)。挂载在 CesiumGlobe 内(missionMode=true),
// 通过订阅 useCurrentTime() 驱动任务状态机:
//
//   EXECUTING + currentTime >= windowStart
//     → enterImagingPhase() + addImagingFootprint(卫星当前位置)
//     → highlightAoi(当前任务 AOI)  [V2-B 抵达反馈]
//     → addScanBeam(扫描光束首帧)    [V3-B 扫描锥]
//     → addContinuousSwathPoint(首点)[V3-C 连续 swath]
//
//   IMAGING + windowStart <= currentTime < windowEnd
//     → updateImagingFootprint(卫星当前位置)
//     → updateScanBeam(每帧更新扫描光束)
//     → addContinuousSwathPoint(每帧累积连续 swath)
//     → 累积足迹采样点(用于覆盖率计算)
//
//   IMAGING + currentTime >= windowEnd
//     → clearImagingFootprint() + clearScanBeam()
//     → 保留 continuous swath 和 AOI 高亮(到报告弹出/退出任务模式)
//     → completeTask(MissionResult)
//
// V2-B/V3 改进:
//   - 正常任务模式也具备 AOI 高亮反馈(与电影模式一致)
//   - 正常任务模式也使用连续累积 swath + 扫描光束(与电影共享 useCesium 方法)
// ============================================================

import { useEffect, useRef } from 'react';
import { useCurrentTime, useTimeStore } from '@/store/timeStore';
import {
  useTreaMissionStore,
  useTreaMissionPhase,
  useTreaCurrentTask,
  useTreaTle,
  type MissionResult,
} from '@/store/treaMissionStore';
import { useCinematicStore } from '@/store/cinematicStore';
import { propagateToGeographic } from '@/lib/tle/orbit';
import { normalizeLon, pointInPolygon, type GeoPoint } from '@/lib/trea/access';
import { AOI_LIST, SENSOR_FOOTPRINT_WIDTH_KM, type Aoi } from '@/lib/trea/constants';
import type { TLEData } from '@/lib/tle/parser';

// ============================================================
// Props 接口
// ============================================================

interface MissionSimulatorProps {
  /** 添加成像足迹实体(瞬时刈幅,V3-A) */
  addImagingFootprint?: (centerLonLat: { lon: number; lat: number }, widthKm: number) => void;
  /** 更新成像足迹位置(每帧调用) */
  updateImagingFootprint?: (centerLonLat: { lon: number; lat: number }, widthKm: number) => void;
  /** 移除成像足迹实体 */
  clearImagingFootprint?: () => void;
  /** 扫描光束(扫描锥,V3-B):从卫星到地面的半透明光束 */
  addScanBeam?: (
    satelliteGeo: { lon: number; lat: number; altM: number },
    groundCorners: Array<{ lon: number; lat: number }>
  ) => void;
  updateScanBeam?: (
    satelliteGeo: { lon: number; lat: number; altM: number },
    groundCorners: Array<{ lon: number; lat: number }>
  ) => void;
  clearScanBeam?: () => void;
  /** 连续累积扫描带(V3-C) */
  addContinuousSwathPoint?: (centerLonLat: { lon: number; lat: number }, widthKm: number) => void;
  clearContinuousSwath?: () => void;
  /** AOI 高亮(V2-B 抵达反馈) */
  highlightAoi?: (aoi: Aoi) => void;
  unhighlightAoi?: (aoiId: string) => void;
}

// ============================================================
// 辅助函数
// ============================================================

/** 成像阶段燃料消耗(百分比,侧摆姿态机动成本,简化固定值) */
const IMAGING_FUEL_COST = 0.3;

/** 足迹采样点上限(避免内存溢出) */
const MAX_FOOTPRINT_POINTS = 500;

/**
 * 计算 AOI 外接矩形面积(km²)
 * 1° 纬度 ≈ 111.32km,1° 经度 ≈ 111.32 × cos(lat) km
 */
function aoiBboxAreaKm2(aoi: Aoi): number {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lon, lat] of aoi.polygon) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const dLon = maxLon - minLon;
  const dLat = maxLat - minLat;
  const centerLat = (minLat + maxLat) / 2;
  const kmPerDegLat = 111.32;
  const kmPerDegLon = 111.32 * Math.cos((centerLat * Math.PI) / 180);
  return dLon * kmPerDegLon * dLat * kmPerDegLat;
}

/**
 * 计算卫星在给定时刻的星下点经纬度 + 高度(归一化到 [-180, 180])
 * @returns {lon, lat, alt} 或 null(传播失败时)
 */
function getSatGroundPos(
  tle: TLEData,
  time: Date
): { lon: number; lat: number; alt: number } | null {
  const geo = propagateToGeographic(tle, time);
  if (!geo) return null;
  return {
    lon: normalizeLon(geo.lon),
    lat: geo.lat,
    alt: geo.alt,
  };
}

/**
 * 计算覆盖率:落入 AOI 多边形的足迹点占比(0-100)
 */
function computeCoveragePercent(
  footprintPoints: Array<{ lat: number; lon: number }>,
  aoi: Aoi
): number {
  if (footprintPoints.length === 0) return 0;
  const polygon: GeoPoint[] = aoi.polygon.map(([lon, lat]) => ({ lon, lat }));
  let inside = 0;
  for (const p of footprintPoints) {
    if (pointInPolygon(p, polygon)) inside++;
  }
  return (inside / footprintPoints.length) * 100;
}

/**
 * 计算地面扫描矩形4角(用于扫描光束底面)
 * 与 useCesium.computeFootprintCorners 一致,顺时针闭合
 */
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

// ============================================================
// 主组件
// ============================================================

export default function MissionSimulator({
  addImagingFootprint,
  updateImagingFootprint,
  clearImagingFootprint,
  addScanBeam,
  updateScanBeam,
  clearScanBeam,
  addContinuousSwathPoint,
  clearContinuousSwath,
  highlightAoi,
  unhighlightAoi,
}: MissionSimulatorProps) {
  const currentTime = useCurrentTime();
  const missionPhase = useTreaMissionPhase();
  const currentTask = useTreaCurrentTask();
  const tle = useTreaTle();
  // 虚拟任务轨道 TLE(任务执行期间使用,使卫星经过 AOI 上空)
  const missionOrbitTle = useTreaMissionStore(s => s.missionOrbitTle);
  // 活跃 TLE:任务期间使用虚拟 TLE,否则使用原 TLE
  const activeTle = missionOrbitTle ?? tle;

  // 电影模式激活标志:电影模式下 CinematicController 独占视觉实体创建,
  // MissionSimulator 只负责状态转换(enterImagingPhase/completeTask),避免重复调用导致闪烁
  const cinematicActive = useCinematicStore(s => s.isActive);

  const enterImagingPhase = useTreaMissionStore(s => s.enterImagingPhase);
  const completeTask = useTreaMissionStore(s => s.completeTask);
  const fuel = useTreaMissionStore(s => s.fuel);
  const battery = useTreaMissionStore(s => s.battery);
  const attitude = useTreaMissionStore(s => s.attitude);
  const payloadStatus = useTreaMissionStore(s => s.payloadStatus);

  const stopPlayback = useTimeStore(s => s.stopPlayback);

  // 累积足迹采样点(不放入 store,避免每帧触发全局重渲染)
  const footprintPointsRef = useRef<Array<{ lat: number; lon: number }>>([]);

  // 防止重复完成任务的守卫(phase 切换有过渡帧)
  const completedRef = useRef<boolean>(false);

  // 扫描光束是否已创建(首帧创建,后续帧更新)
  const scanBeamCreatedRef = useRef<boolean>(false);

  useEffect(() => {
    // 无任务或缺少窗口信息 → 跳过
    if (!currentTask || !currentTask.windowStart || !currentTask.windowEnd) return;

    // 电影模式下完全跳过:CinematicController v4 全权负责,不需要状态机
    if (cinematicActive) return;

    const t = currentTime.getTime();
    const ws = currentTask.windowStart.getTime();
    const we = currentTask.windowEnd.getTime();

    // 电影模式下 CinematicController 独占视觉实体,MissionSimulator 只处理状态转换
    // 避免两者同时调用 addScanBeam/addContinuousSwathPoint 导致实体闪烁和轨迹点翻倍
    const createVisuals = !cinematicActive;

    // ---------- 转换 1:EXECUTING → IMAGING(窗口开始,卫星抵达任务区域) ----------
    if (missionPhase === 'EXECUTING' && t >= ws) {
      const pos = getSatGroundPos(activeTle, currentTime);
      if (pos) {
        footprintPointsRef.current = [pos];

        if (createVisuals) {
          // 瞬时刈幅(高对比足迹)
          addImagingFootprint?.(pos, SENSOR_FOOTPRINT_WIDTH_KM);

          // V2-B:AOI 高亮(卫星抵达任务区域)
          const aoi = AOI_LIST.find(a => a.id === currentTask.aoiId);
          if (aoi) {
            highlightAoi?.(aoi);
          }

          // V3-B:扫描光束(首帧创建)
          const groundCorners = computeGroundCorners(pos, SENSOR_FOOTPRINT_WIDTH_KM);
          addScanBeam?.(
            { lon: pos.lon, lat: pos.lat, altM: pos.alt * 1000 },
            groundCorners
          );
          scanBeamCreatedRef.current = true;

          // V3-C:连续累积 swath(首点)
          addContinuousSwathPoint?.(pos, SENSOR_FOOTPRINT_WIDTH_KM);
        }
      } else {
        footprintPointsRef.current = [];
      }
      completedRef.current = false;
      enterImagingPhase();
      return;
    }

    // ---------- 转换 2:IMAGING 中(窗口内,更新足迹 + 扫描光束 + 累积 swath) ----------
    if (missionPhase === 'IMAGING' && t >= ws && t < we) {
      const pos = getSatGroundPos(activeTle, currentTime);
      if (pos) {
        if (createVisuals) {
          // 更新瞬时刈幅位置
          updateImagingFootprint?.(pos, SENSOR_FOOTPRINT_WIDTH_KM);

          // 更新扫描光束位置
          if (scanBeamCreatedRef.current) {
            const groundCorners = computeGroundCorners(pos, SENSOR_FOOTPRINT_WIDTH_KM);
            updateScanBeam?.(
              { lon: pos.lon, lat: pos.lat, altM: pos.alt * 1000 },
              groundCorners
            );
          }

          // 累积连续 swath(每帧添加点,形成连续覆盖带)
          addContinuousSwathPoint?.(pos, SENSOR_FOOTPRINT_WIDTH_KM);
        }

        // 累积足迹采样点(用于覆盖率计算,上限保护)—— 两种模式都需要
        if (footprintPointsRef.current.length < MAX_FOOTPRINT_POINTS) {
          footprintPointsRef.current.push(pos);
        }
      }
      return;
    }

    // ---------- 转换 3:IMAGING → COMPLETED(窗口结束) ----------
    if (missionPhase === 'IMAGING' && t >= we && !completedRef.current) {
      completedRef.current = true;

      if (createVisuals) {
        // 清理瞬时刈幅 + 扫描光束(成像结束)
        // 注意:保留 continuous swath 和 AOI 高亮(到报告弹出/退出任务模式)
        clearImagingFootprint?.();
        clearScanBeam?.();
        scanBeamCreatedRef.current = false;
      }

      // 电影模式下不停止时间播放(由 CinematicController 控制)
      if (!cinematicActive) {
        stopPlayback();
      }

      // 查找目标 AOI(用于覆盖率与面积计算)
      const aoi = AOI_LIST.find(a => a.id === currentTask.aoiId);
      const footprintPoints = footprintPointsRef.current;

      // 覆盖率:落入 AOI 的足迹点占比
      const coveragePercent = aoi
        ? computeCoveragePercent(footprintPoints, aoi)
        : 0;

      // 成像面积:覆盖率 × AOI 外接矩形面积
      const aoiArea = aoi ? aoiBboxAreaKm2(aoi) : 0;
      const imagingAreaKm2 = (coveragePercent / 100) * aoiArea;

      // 燃料消耗:成像姿态机动成本(简化固定值)
      const fuelConsumed = IMAGING_FUEL_COST;
      const finalFuel = Math.max(0, fuel - fuelConsumed);

      // 持续时间(秒)
      const duration = (we - ws) / 1000;

      // 组装 MissionResult
      const result: MissionResult = {
        taskId: currentTask.id,
        aoiId: currentTask.aoiId,
        aoiName: currentTask.aoiName,
        aoiCenter: currentTask.aoiCenter ?? (aoi?.center ?? { lat: 0, lon: 0 }),
        windowStart: new Date(currentTask.windowStart),
        windowEnd: new Date(currentTask.windowEnd),
        duration,
        coveragePercent,
        imagingAreaKm2,
        fuelConsumed,
        finalFuel,
        satelliteState: {
          fuel: finalFuel,
          battery,
          attitude,
          payloadStatus: 'STANDBY',
        },
        footprintPoints: [...footprintPoints],
      };

      completeTask(result);
      // 清空累积点(为下次任务准备)
      footprintPointsRef.current = [];
      return;
    }
  }, [
    currentTime,
    missionPhase,
    currentTask,
    activeTle,
    fuel,
    battery,
    attitude,
    payloadStatus,
    cinematicActive,
    enterImagingPhase,
    completeTask,
    addImagingFootprint,
    updateImagingFootprint,
    clearImagingFootprint,
    addScanBeam,
    updateScanBeam,
    clearScanBeam,
    addContinuousSwathPoint,
    clearContinuousSwath,
    highlightAoi,
    unhighlightAoi,
    stopPlayback,
  ]);

  // 组件卸载时清理 continuous swath 和 AOI 高亮(退出任务模式时执行)
  // 双重保险:clearMissionEntities 也会清理,这里确保不残留
  useEffect(() => {
    return () => {
      clearContinuousSwath?.();
      const task = useTreaMissionStore.getState().currentTask;
      if (task?.aoiId) {
        unhighlightAoi?.(task.aoiId);
      }
    };
  }, [clearContinuousSwath, unhighlightAoi]);

  // 纯逻辑组件,无 UI
  return null;
}
