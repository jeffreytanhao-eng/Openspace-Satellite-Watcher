import { createSatrec, propagateOrbit, calculateOrbitParams, getGmst } from '@/lib/tle/orbit';
import { EARTH_RADIUS_KM } from '@/lib/tle/constants';
import type { TLEData } from '@/lib/tle/parser';

/**
 * 校验传播位置是否有效。
 *
 * 已衰减/再入的卫星(如 NOAA 16,2024 年再入)用陈旧 TLE 外推到当前时间时,
 * SGP4 会返回 NaN、Infinity 或地表以下/远超轨道范围的垃圾坐标,
 * 导致轨道线每次重新生成都形变(闪烁)。此处统一过滤这类无效坐标。
 *
 * 合法轨道半径范围:地表下 100km(容忍再入尾段)至 60000km(覆盖高轨)。
 */
const MIN_ORBIT_RADIUS_KM = EARTH_RADIUS_KM - 100; // 6271 km
const MAX_ORBIT_RADIUS_KM = 60000;

function isValidRadius(xKm: number, yKm: number, zKm: number): boolean {
  if (!Number.isFinite(xKm) || !Number.isFinite(yKm) || !Number.isFinite(zKm)) return false;
  const r = Math.sqrt(xKm * xKm + yKm * yKm + zKm * zKm);
  return r >= MIN_ORBIT_RADIUS_KM && r <= MAX_ORBIT_RADIUS_KM;
}

/**
 * Calculate satellite ECEF position in meters at a given time.
 *
 * Cesium 的 ConstantPositionProperty 默认使用 FIXED(ECEF)坐标系,
 * 因此必须返回 ECEF(state.ecf)而非 ECI(state.position)。
 * 之前返回 ECI 会导致卫星位置偏移一个 GMST 旋转角度,
 * 仿真时间快进时偏差增大。
 */
export function calculateSatellitePosition(
  tleData: TLEData[],
  time: Date
): { x: number; y: number; z: number } | null {
  if (!tleData || tleData.length === 0) return null;

  const latestTle = tleData[0];
  try {
    const satrec = createSatrec(latestTle);
    const state = propagateOrbit(satrec, time);
    if (!state) return null;

    // 过滤已衰减卫星的垃圾坐标(NaN/超范围),避免卫星跳到地心或飞到无穷远
    if (!isValidRadius(state.ecf.x, state.ecf.y, state.ecf.z)) return null;

    // 返回 ECEF 坐标(米制),Cesium ConstantPositionProperty 期望 ECEF
    return {
      x: state.ecf.x * 1000,
      y: state.ecf.y * 1000,
      z: state.ecf.z * 1000,
    };
  } catch {
    return null;
  }
}

/**
 * Generate closed orbit trail points (ECI, meters) for visualization.
 * Uses TLE meanMotion to calculate the exact orbital period, then generates
 * points for one complete revolution so the orbit forms a closed ellipse.
 */
export function generateOrbitPoints(
  tleData: TLEData[],
  startTime: Date,
  numPoints: number = 180
): Array<{ x: number; y: number; z: number }> {
  if (!tleData || tleData.length === 0) return [];

  const latestTle = tleData[0];
  const points: Array<{ x: number; y: number; z: number }> = [];

  try {
    const satrec = createSatrec(latestTle);

    // Calculate orbital period from satrec.no (mean motion in radians/minute)
    // satrec.no is set by satellite.js twoline2satrec and is always valid
    // Convert: rad/min → rev/day → period in minutes
    // rev/day = no * (1440 / (2*π)),  period_minutes = 1440 / rev/day = 1440 * 2*π / (no * 1440) = 2*π / no
    const meanMotionRadPerMin = satrec.no;
    let periodMinutes: number;
    if (meanMotionRadPerMin > 0) {
      periodMinutes = (2 * Math.PI) / meanMotionRadPerMin;
    } else {
      // Fallback: try elements.meanMotion
      const mm = latestTle.elements?.meanMotion;
      if (mm && mm > 0) {
        periodMinutes = 1440 / mm;
      } else {
        return []; // Cannot determine period
      }
    }

    // Clamp to reasonable range (LEO ~88min to GEO ~1436min, plus some buffer)
    periodMinutes = Math.max(80, Math.min(1500, periodMinutes));

    const periodMs = periodMinutes * 60 * 1000;
    const stepMs = periodMs / numPoints;

    // Start a few minutes before current time so the trail shows history + future
    const trailStartOffset = -periodMs * 0.1; // 10% before current time
    const trailStart = new Date(startTime.getTime() + trailStartOffset);

    // Generate points for exactly one full orbit (closed loop)
    let skipped = 0;
    for (let i = 0; i <= numPoints; i++) {
      const t = new Date(trailStart.getTime() + i * stepMs);
      const state = propagateOrbit(satrec, t);
      // 过滤无效坐标(已衰减卫星 SGP4 会返回 NaN/地表以下/超范围值)
      if (state && isValidRadius(state.position.x, state.position.y, state.position.z)) {
        points.push({
          x: state.position.x * 1000,
          y: state.position.y * 1000,
          z: state.position.z * 1000,
        });
      } else {
        skipped++;
      }
    }

    // 已衰减卫星(如 NOAA 16)外推时大量采样点无效,轨道线会因每次有效点集合
    // 不同而闪烁。当无效比例过高时判定轨道不可靠,直接隐藏(返回空数组)。
    if (skipped > numPoints * 0.5) {
      return [];
    }

    // Ensure closure: if first and last points are close enough,
    // duplicate first point as last to guarantee visual closure
    if (points.length >= 2) {
      const first = points[0];
      const last = points[points.length - 1];
      const dx = last.x - first.x;
      const dy = last.y - first.y;
      const dz = last.z - first.z;
      const gapDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // If gap > 10km, close the loop by adding first point
      if (gapDist > 10000) {
        points.push({ ...first });
      }
    }
  } catch {
    return [];
  }

  return points;
}

/**
 * Generate closed orbit trail points in ECEF (Fixed frame) for Cesium.
 *
 * 先用 generateOrbitPoints 生成 ECI 闭合椭圆(轨道形状不随地球自转变化),
 * 再用采样起始时刻的 GMST 把所有点旋转到 ECEF。
 * 使用同一 GMST 保证轨道线仍为闭合椭圆(而非 ECEF 下的螺旋),
 * 同时与 Cesium ConstantPositionProperty(FIXED)坐标系一致。
 *
 * 注意:因地球自转,ECEF 下的轨道线会随时间偏移,调用方需定期重新生成。
 */
export function generateOrbitPointsECEF(
  tleData: TLEData[],
  startTime: Date,
  numPoints: number = 180
): Array<{ x: number; y: number; z: number }> {
  // 1. 生成 ECI 轨道点(闭合椭圆,米制)
  const eciPoints = generateOrbitPoints(tleData, startTime, numPoints);
  if (eciPoints.length === 0) return [];

  // 2. 用采样起始时间的 GMST 把 ECI 旋转到 ECEF
  const gmst = getGmst(startTime);
  const cosGmst = Math.cos(gmst);
  const sinGmst = Math.sin(gmst);

  return eciPoints.map(p => ({
    x: p.x * cosGmst + p.y * sinGmst,
    y: -p.x * sinGmst + p.y * cosGmst,
    z: p.z,
  }));
}
