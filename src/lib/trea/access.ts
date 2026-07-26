// TREA-01 过境窗口计算(Access Window Computation)
// 纯函数模块,不依赖 React,可被任意 Store / 组件 / 测试脚本调用
//
// 核心能力:给定 TLE + AOI + 起始时间,采样未来若干小时的轨道位置,
// 对每个采样点计算传感器足迹(星下点附近的矩形),与 AOI 做相交检测,
// 聚合连续相交段为过境窗口 AccessWindow。
//
// 简化策略(按 M2 设计要求):
//   1. 足迹为星下点 ± SENSOR_FOOTPRINT_WIDTH_KM/2 的矩形(沿迹/跨迹同宽)
//   2. AOI 是矩形,直接使用 bounding box 重叠检测
//   3. 仰角由 AOI 中心观察卫星的几何关系计算(ECEF 直角坐标)
//
// 注意:propagateOrbit 返回的 geographic.lon 范围为 [0, 360),
//      本模块统一归一化到 [-180, 180] 与 AOI 多边形约定一致。

import { createSatrec, propagateOrbit } from '@/lib/tle/orbit';
import type { TLEData } from '@/lib/tle/parser';
import { EARTH_RADIUS_KM } from '@/lib/tle/constants';
import {
  SENSOR_FOOTPRINT_WIDTH_KM,
  type Aoi,
} from '@/lib/trea/constants';

// ============================================================
// 1. 类型定义
// ============================================================

/** 地理点(纬度/经度,单位:度) */
export interface GeoPoint {
  lat: number;
  lon: number;
}

/** 经纬度外接矩形(Bounding Box) */
export interface BoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

/**
 * 卫星星下点传感器足迹
 * 简化为以星下点为中心、widthKm × heightKm 的矩形(本模块两者相等)
 */
export interface Footprint {
  /** 足迹中心点(星下点) */
  center: GeoPoint;
  /** 沿迹方向宽度(km) */
  widthKm: number;
  /** 跨迹方向高度(km) */
  heightKm: number;
  /** 足迹外接矩形 */
  bbox: BoundingBox;
  /** 足迹多边形(矩形 4 顶点,顺时针闭合) */
  polygon: GeoPoint[];
}

/** 过境窗口:卫星传感器足迹与 AOI 相交的连续时间段 */
export interface AccessWindow {
  /** 窗口开始时间 */
  startTime: Date;
  /** 窗口结束时间(末个采样点 + 采样间隔) */
  endTime: Date;
  /** 窗口内最大仰角(度,从 AOI 中心观测) */
  maxElevation: number;
  /** 窗口持续时间(秒) */
  duration: number;
  /** 中心过境时刻(对应最大仰角的采样点) */
  centerPassTime: Date;
  /** 对应 AOI 的 id */
  aoiId: string;
}

// ============================================================
// 2. 几何辅助函数
// ============================================================

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/** 1 度纬度对应的地面距离(km,近似) */
const KM_PER_DEG_LAT = 111.32;

/**
 * 将经度归一化到 [-180, 180)
 * propagateOrbit 返回的 lon 在 [0, 360),需转换以匹配 AOI 约定
 */
export function normalizeLon(lon: number): number {
  let l = lon % 360;
  if (l >= 180) l -= 360;
  if (l < -180) l += 360;
  return l;
}

/**
 * 射线法判断点是否在多边形内部
 * @param point 待测点 {lat, lon}
 * @param polygon 多边形顶点数组(首尾不需重复)
 */
export function pointInPolygon(point: GeoPoint, polygon: GeoPoint[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  let inside = false;
  const x = point.lon;
  const y = point.lat;
  // 标准 PnPoly 算法:横向射线穿越多边形边界奇数次则在内部
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].lon;
    const yi = polygon[i].lat;
    const xj = polygon[j].lon;
    const yj = polygon[j].lat;
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * 判断两个外接矩形是否重叠(包含边界接触)
 * 标准 AABB 重叠测试
 */
export function rectanglesOverlap(r1: BoundingBox, r2: BoundingBox): boolean {
  return (
    r1.minLon <= r2.maxLon &&
    r1.maxLon >= r2.minLon &&
    r1.minLat <= r2.maxLat &&
    r1.maxLat >= r2.minLat
  );
}

/**
 * 将 AOI 多边形([lon, lat] 数组)转换为外接矩形 BoundingBox
 */
export function aoiToBBox(aoi: Aoi): BoundingBox {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of aoi.polygon) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLon, minLat, maxLon, maxLat };
}

/**
 * 根据星下点和传感器宽度计算足迹矩形
 * 简化:沿迹与跨迹均取 SENSOR_FOOTPRINT_WIDTH_KM,矩形对齐经纬度网格
 * @param center 星下点 {lat, lon}(经度需为 [-180, 180])
 * @param widthKm 足迹宽度(km)
 */
export function computeFootprint(center: GeoPoint, widthKm: number): Footprint {
  const halfKm = widthKm / 2;
  // 纬度方向:1° ≈ 111.32km(与纬度无关)
  const halfLat = halfKm / KM_PER_DEG_LAT;
  // 经度方向:1° ≈ 111.32 * cos(lat) km(高纬度变窄,极点退化)
  const cosLat = Math.cos(center.lat * DEG2RAD);
  const halfLon = cosLat > 1e-6 ? halfKm / (KM_PER_DEG_LAT * cosLat) : 0;

  const bbox: BoundingBox = {
    minLon: center.lon - halfLon,
    maxLon: center.lon + halfLon,
    minLat: center.lat - halfLat,
    maxLat: center.lat + halfLat,
  };

  // 4 顶点顺时针闭合
  const polygon: GeoPoint[] = [
    { lon: bbox.minLon, lat: bbox.minLat },
    { lon: bbox.maxLon, lat: bbox.minLat },
    { lon: bbox.maxLon, lat: bbox.maxLat },
    { lon: bbox.minLon, lat: bbox.maxLat },
  ];

  return {
    center,
    widthKm,
    heightKm: widthKm,
    bbox,
    polygon,
  };
}

/**
 * 计算从地面观察点看卫星的仰角(度)
 * 使用 ECEF 直角坐标:仰角 = asin( (observer→sat · observer_zenith) / |observer→sat| )
 * @param observer 观察点 {lat, lon}(alt=0,海平面)
 * @param satGeo 卫星地理坐标 {lat, lon, alt},alt 单位 km
 */
export function computeElevation(
  observer: GeoPoint,
  satGeo: { lat: number; lon: number; alt: number },
): number {
  const lat0 = observer.lat * DEG2RAD;
  const lon0 = observer.lon * DEG2RAD;
  const lat1 = satGeo.lat * DEG2RAD;
  const lon1 = normalizeLon(satGeo.lon) * DEG2RAD;

  // 观察点 ECEF(alt=0)
  const ox = EARTH_RADIUS_KM * Math.cos(lat0) * Math.cos(lon0);
  const oy = EARTH_RADIUS_KM * Math.cos(lat0) * Math.sin(lon0);
  const oz = EARTH_RADIUS_KM * Math.sin(lat0);

  // 卫星 ECEF
  const r1 = EARTH_RADIUS_KM + satGeo.alt;
  const sx = r1 * Math.cos(lat1) * Math.cos(lon1);
  const sy = r1 * Math.cos(lat1) * Math.sin(lon1);
  const sz = r1 * Math.sin(lat1);

  // observer → sat 向量
  const dx = sx - ox;
  const dy = sy - oy;
  const dz = sz - oz;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 1e-6) return 90;

  // 观察点天顶方向单位向量(从地心指向观察点)
  const ux = ox / EARTH_RADIUS_KM;
  const uy = oy / EARTH_RADIUS_KM;
  const uz = oz / EARTH_RADIUS_KM;

  // 投影分量 / 距离 = sin(elevation)
  const sinE = (dx * ux + dy * uy + dz * uz) / dist;
  const clamped = Math.max(-1, Math.min(1, sinE));
  return Math.asin(clamped) * RAD2DEG;
}

// ============================================================
// 3. 主函数:过境窗口计算
// ============================================================

/** 默认采样间隔(秒)— 每 30 秒一个采样点 */
export const DEFAULT_SAMPLING_INTERVAL_SEC = 30;

/** 默认预测时长(小时) */
export const DEFAULT_FORECAST_HOURS = 24;

/**
 * 计算 TLE 对应卫星对指定 AOI 的过境窗口列表
 *
 * 算法:
 *   1. 用 createSatrec 构建 SGP4 卫星记录
 *   2. 从 startTime 起每隔 30s 采样一次 propagateOrbit,共 hours*120 个点
 *   3. 每个采样点:
 *      - 计算传感器足迹 bbox(星下点 ± 40km 矩形)
 *      - 与 AOI bbox 做 AABB 重叠检测
 *      - 计算从 AOI 中心观测卫星的仰角
 *   4. 聚合连续相交的采样段为一个 AccessWindow:
 *      - startTime = 段首采样时刻
 *      - endTime = 段尾采样时刻 + 采样间隔
 *      - maxElevation / centerPassTime = 段内最大仰角及其时刻
 *
 * @param tle 卫星 TLE 数据
 * @param aoi 关注区域
 * @param startTime 起始时间(通常为 now)
 * @param hours 预测时长(小时),默认 24
 * @param samplingIntervalSec 采样间隔(秒),默认 30
 * @returns AccessWindow[] 按时间升序排列
 */
export function computeAccessWindows(
  tle: TLEData,
  aoi: Aoi,
  startTime: Date,
  hours: number = DEFAULT_FORECAST_HOURS,
  samplingIntervalSec: number = DEFAULT_SAMPLING_INTERVAL_SEC,
): AccessWindow[] {
  // 构建 satrec(失败则返回空数组,不抛异常)
  let satrec: ReturnType<typeof createSatrec>;
  try {
    satrec = createSatrec(tle);
  } catch (e) {
    console.warn('[access] createSatrec 失败:', e);
    return [];
  }

  const totalSamples = Math.max(0, Math.floor((hours * 3600) / samplingIntervalSec));
  const aoiBBox = aoiToBBox(aoi);
  const intervalMs = samplingIntervalSec * 1000;

  // 采样循环:仅保留与 AOI 相交的采样点
  interface Hit {
    time: Date;
    elevation: number;
  }
  const hits: Hit[] = [];

  for (let i = 0; i <= totalSamples; i++) {
    const time = new Date(startTime.getTime() + i * intervalMs);
    let state: ReturnType<typeof propagateOrbit> | null = null;
    try {
      state = propagateOrbit(satrec, time);
    } catch {
      // 单点传播失败,跳过(不中断整体采样)
      continue;
    }
    if (!state) continue;

    const geo = state.geographic;
    const lon = normalizeLon(geo.lon);
    const center: GeoPoint = { lat: geo.lat, lon };

    const footprint = computeFootprint(center, SENSOR_FOOTPRINT_WIDTH_KM);
    if (!rectanglesOverlap(footprint.bbox, aoiBBox)) continue;

    const elevation = computeElevation(aoi.center, { ...geo, lon });
    hits.push({ time, elevation });
  }

  // 聚合连续相邻采样点(时间差 = 采样间隔)为窗口
  // 若两相邻命中点之间有空缺(连续段断裂),则切分为不同窗口
  const windows: AccessWindow[] = [];
  let segStartIdx = 0;
  for (let i = 0; i < hits.length; i++) {
    const isLast = i === hits.length - 1;
    const gap =
      !isLast &&
      hits[i + 1].time.getTime() - hits[i].time.getTime() > intervalMs + 1; // 1ms 容差
    if (isLast || gap) {
      // [segStartIdx, i] 为一个连续段
      const seg = hits.slice(segStartIdx, i + 1);
      let maxElev = -Infinity;
      let maxElevTime = seg[0].time;
      for (const h of seg) {
        if (h.elevation > maxElev) {
          maxElev = h.elevation;
          maxElevTime = h.time;
        }
      }
      const wStart = new Date(seg[0].time);
      const wEnd = new Date(seg[seg.length - 1].time.getTime() + intervalMs);
      const durationSec = (wEnd.getTime() - wStart.getTime()) / 1000;
      windows.push({
        startTime: wStart,
        endTime: wEnd,
        maxElevation: maxElev,
        duration: durationSec,
        centerPassTime: new Date(maxElevTime),
        aoiId: aoi.id,
      });
      segStartIdx = i + 1;
    }
  }

  return windows;
}

// ============================================================
// 4. 便捷工具函数
// ============================================================

/**
 * 批量计算多个 AOI 的过境窗口
 * @returns Map<aoiId, AccessWindow[]>
 */
export function computeAccessWindowsForAois(
  tle: TLEData,
  aois: Aoi[],
  startTime: Date,
  hours: number = DEFAULT_FORECAST_HOURS,
): Map<string, AccessWindow[]> {
  const map = new Map<string, AccessWindow[]>();
  for (const aoi of aois) {
    map.set(aoi.id, computeAccessWindows(tle, aoi, startTime, hours));
  }
  return map;
}

/**
 * 从窗口列表中找出距离 startTime 最近的下一个窗口
 * @param windows 已计算的窗口列表
 * @param fromTime 起始参考时间
 */
export function findNextWindow(
  windows: AccessWindow[],
  fromTime: Date,
): AccessWindow | null {
  let best: AccessWindow | null = null;
  let bestDelta = Infinity;
  for (const w of windows) {
    const delta = w.startTime.getTime() - fromTime.getTime();
    if (delta >= 0 && delta < bestDelta) {
      bestDelta = delta;
      best = w;
    }
  }
  return best;
}
