'use client';

// ============================================================
// TREA-01 任务仿真状态机驱动器(M4 / Task 12)
// ------------------------------------------------------------
// 纯逻辑组件,返回 null(无 UI)。挂载在 CesiumGlobe 内(missionMode=true),
// 通过订阅 useCurrentTime() 驱动任务状态机:
//
//   EXECUTING + currentTime >= windowStart
//     → enterImagingPhase() + addImagingFootprint(卫星当前位置)
//
//   IMAGING + windowStart <= currentTime < windowEnd
//     → updateImagingFootprint(卫星当前位置) + 累积足迹点
//
//   IMAGING + currentTime >= windowEnd
//     → clearImagingFootprint() + completeTask(MissionResult)
//
// 说明:
//   - useCesium() 每次调用产生独立 state,无法跨组件共享实例
//     因此成像足迹方法由父组件(CesiumGlobe)通过 props 注入
//   - 卫星地面位置由 propagateToGeographic(tle, time) 直接计算
//     不依赖 TelemetryDashboard 是否挂载
//   - 覆盖率 = 落入 AOI 多边形的足迹采样点占比
//   - 成像面积 = 覆盖率 × AOI 外接矩形面积
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
import { propagateToGeographic } from '@/lib/tle/orbit';
import { normalizeLon, pointInPolygon, type GeoPoint } from '@/lib/trea/access';
import { AOI_LIST, SENSOR_FOOTPRINT_WIDTH_KM, type Aoi } from '@/lib/trea/constants';

// ============================================================
// Props 接口
// ============================================================

interface MissionSimulatorProps {
  /** 添加成像足迹实体(由 CesiumGlobe 通过 useCesium 注入) */
  addImagingFootprint?: (centerLonLat: { lon: number; lat: number }, widthKm: number) => void;
  /** 更新成像足迹位置(每帧调用) */
  updateImagingFootprint?: (centerLonLat: { lon: number; lat: number }, widthKm: number) => void;
  /** 移除成像足迹实体 */
  clearImagingFootprint?: () => void;
}

// ============================================================
// 辅助函数
// ============================================================

/** 成像阶段燃料消耗(百分比,侧摆姿态机动成本,简化固定值) */
const IMAGING_FUEL_COST = 0.3;

/** LEO 卫星地面速度近似(km/s),用于成像面积估算 */
const GROUND_SPEED_KM_PER_S = 7.0;

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
 * 计算卫星在给定时刻的星下点经纬度(归一化到 [-180, 180])
 * @returns {lon, lat} 或 null(传播失败时)
 */
function getSatGroundPos(
  tle: ReturnType<typeof useTreaTle>,
  time: Date
): { lon: number; lat: number } | null {
  const geo = propagateToGeographic(tle, time);
  if (!geo) return null;
  return {
    lon: normalizeLon(geo.lon),
    lat: geo.lat,
  };
}

/**
 * 计算覆盖率:落入 AOI 多边形的足迹点占比(0-100)
 * @param footprintPoints 足迹采样点序列
 * @param aoi 目标 AOI
 */
function computeCoveragePercent(
  footprintPoints: Array<{ lat: number; lon: number }>,
  aoi: Aoi
): number {
  if (footprintPoints.length === 0) return 0;
  // AOI 多边形 [lon, lat] → GeoPoint {lon, lat}
  const polygon: GeoPoint[] = aoi.polygon.map(([lon, lat]) => ({ lon, lat }));
  let inside = 0;
  for (const p of footprintPoints) {
    if (pointInPolygon(p, polygon)) inside++;
  }
  return (inside / footprintPoints.length) * 100;
}

// ============================================================
// 主组件
// ============================================================

export default function MissionSimulator({
  addImagingFootprint,
  updateImagingFootprint,
  clearImagingFootprint,
}: MissionSimulatorProps) {
  const currentTime = useCurrentTime();
  const missionPhase = useTreaMissionPhase();
  const currentTask = useTreaCurrentTask();
  const tle = useTreaTle();

  // 状态机 Actions(直接从 store 取,避免 Hook 顺序问题)
  const enterImagingPhase = useTreaMissionStore(s => s.enterImagingPhase);
  const completeTask = useTreaMissionStore(s => s.completeTask);
  const fuel = useTreaMissionStore(s => s.fuel);
  const battery = useTreaMissionStore(s => s.battery);
  const attitude = useTreaMissionStore(s => s.attitude);
  const payloadStatus = useTreaMissionStore(s => s.payloadStatus);

  // 时间播放控制:任务完成时停止播放,避免时间继续推进越过报告展示
  const stopPlayback = useTimeStore(s => s.stopPlayback);

  // 累积足迹采样点(不放入 store,避免每帧触发全局重渲染)
  const footprintPointsRef = useRef<Array<{ lat: number; lon: number }>>([]);

  // 防止重复完成任务的守卫(phase 切换有过渡帧)
  const completedRef = useRef<boolean>(false);

  useEffect(() => {
    // 无任务或缺少窗口信息 → 跳过
    if (!currentTask || !currentTask.windowStart || !currentTask.windowEnd) return;

    const t = currentTime.getTime();
    const ws = currentTask.windowStart.getTime();
    const we = currentTask.windowEnd.getTime();

    // ---------- 转换 1:EXECUTING → IMAGING(窗口开始) ----------
    if (missionPhase === 'EXECUTING' && t >= ws) {
      const pos = getSatGroundPos(tle, currentTime);
      if (pos) {
        addImagingFootprint?.(pos, SENSOR_FOOTPRINT_WIDTH_KM);
        footprintPointsRef.current = [pos];
      } else {
        footprintPointsRef.current = [];
      }
      completedRef.current = false;
      enterImagingPhase();
      return;
    }

    // ---------- 转换 2:IMAGING 中(窗口内,更新足迹 + 累积点) ----------
    if (missionPhase === 'IMAGING' && t >= ws && t < we) {
      const pos = getSatGroundPos(tle, currentTime);
      if (pos) {
        updateImagingFootprint?.(pos, SENSOR_FOOTPRINT_WIDTH_KM);
        // 累积足迹点(上限保护)
        if (footprintPointsRef.current.length < MAX_FOOTPRINT_POINTS) {
          footprintPointsRef.current.push(pos);
        }
      }
      return;
    }

    // ---------- 转换 3:IMAGING → COMPLETED(窗口结束) ----------
    if (missionPhase === 'IMAGING' && t >= we && !completedRef.current) {
      completedRef.current = true;
      clearImagingFootprint?.();
      // 停止时间播放:任务已完成,冻结时间便于用户查看报告
      stopPlayback();

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
          payloadStatus: 'STANDBY', // 完成后载荷待机
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
    tle,
    fuel,
    battery,
    attitude,
    payloadStatus,
    enterImagingPhase,
    completeTask,
    addImagingFootprint,
    updateImagingFootprint,
    clearImagingFootprint,
    stopPlayback,
  ]);

  // 纯逻辑组件,无 UI
  return null;
}
