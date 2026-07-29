// TREA-01 虚拟任务轨道 TLE 生成器
// ------------------------------------------------------------
// 给定原 TLE + AOI 中心 + 任务窗口起始时刻,生成一条「虚拟 TLE」,
// 使卫星在 windowStart 时刻星下点经过 AOI 中心。
//
// 物理模型(e=0 圆轨道简化):
//   - 真近点角 ν = 偏近点角 E = 平近点角 M
//   - 纬度幅角 u = ω + ν = ω + M
//   - 星下点纬度:lat = asin(sin(i) * sin(u))
//   - 星下点经度:lon = atan2(cos(i)*sin(u), cos(u)) + Ω - GMST(t)
//
// 求解策略:
//   1. 由 AOI 纬度反解 u:u = asin(sin(lat) / sin(i))
//   2. 由 AOI 经度反解 Ω:Ω = lon + GMST(windowStart) - atan2(cos(i)*sin(u), cos(u))
//   3. 由 u 求 M:M = u - ω(因 e=0,ω=0,故 M = u)
//   4. 将 TLE 历元对齐到 windowStart,使 M_epoch = M,Ω_epoch = Ω
//      (避免 SGP4 J2 摄动多日累积漂移)

import type { TLEData } from '@/lib/tle/parser';
import type { Aoi } from '@/lib/trea/constants';
import { getGmst } from '@/lib/tle/orbit';
import {
  rebuildLine1WithEpoch,
  rebuildLine2WithRaan,
  rebuildLine2WithMeanAnomaly,
} from '@/lib/tle/tleFormat';

// ============================================================
// 常量
// ============================================================

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

// ============================================================
// 类型定义
// ============================================================

export interface GenerateMissionTleOptions {
  /** 选择升交 pass(u ∈ [0, 90°])或降交 pass(u ∈ [90°, 180°])
   * 默认 'ascending'。降交 pass 卫星向南飞行 */
  pass?: 'ascending' | 'descending';
}

export interface GenerateMissionTleResult {
  /** 生成的虚拟 TLE;失败时为 null */
  tle: TLEData | null;
  /** 错误原因(tle 为 null 时填充) */
  error?: string;
  /** 调试信息:求解得到的轨道根数 */
  debug?: {
    argumentOfLatitudeDeg: number;
    raanDeg: number;
    meanAnomalyDeg: number;
    epoch: Date;
    pass: 'ascending' | 'descending';
  };
}

// ============================================================
// 辅助函数
// ============================================================

/** 将角度归一化到 [0, 360) */
function normalize360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

// ============================================================
// 主函数
// ============================================================

/**
 * 生成虚拟任务 TLE,使卫星在 windowStart 时刻星下点经过 AOI 中心
 *
 * @param originalTle 原 TLE(提供倾角、偏心率、近地点幅角、平均运动等不变量)
 * @param aoi 目标 AOI(使用 center.lat / center.lon)
 * @param windowStart 任务窗口起始时刻(卫星应在此刻抵达 AOI 上空)
 * @param options 可选参数
 * @returns GenerateMissionTleResult
 */
export function generateMissionTle(
  originalTle: TLEData,
  aoi: Aoi,
  windowStart: Date,
  options: GenerateMissionTleOptions = {}
): GenerateMissionTleResult {
  const { pass = 'ascending' } = options;

  try {
    // ---------- 1. 提取原 TLE 轨道根数 ----------
    const i = originalTle.elements.inclination; // 倾角(度)
    const omega = originalTle.elements.argPerigee; // 近地点幅角(度)
    const ecc = originalTle.elements.eccentricity; // 偏心率
    const lat = aoi.center.lat;
    const lon = aoi.center.lon;

    // ---------- 2. 边界检查:AOI 纬度必须在轨道覆盖范围内 ----------
    const sinLat = Math.sin(lat * DEG2RAD);
    const sinI = Math.sin(i * DEG2RAD);
    if (Math.abs(sinLat) > sinI - 1e-6) {
      return {
        tle: null,
        error: `AOI 纬度 ${lat.toFixed(2)}° 超出轨道倾角覆盖范围(±${i.toFixed(2)}°),轨道不可达`,
      };
    }

    // ---------- 3. 反解纬度幅角 u ----------
    // sin(u) = sin(lat) / sin(i)
    // 升交 pass:u = asin(...)(卫星向北飞行)
    // 降交 pass:u = 180° - asin(...)(卫星向南飞行)
    const sinU = sinLat / sinI;
    const uAsinRad = Math.asin(Math.max(-1, Math.min(1, sinU)));
    const uRad = pass === 'ascending' ? uAsinRad : Math.PI - uAsinRad;
    const uDeg = normalize360(uRad * RAD2DEG);

    // ---------- 4. 反解 RAAN Ω ----------
    // lon = atan2(cos(i)*sin(u), cos(u)) + Ω - GMST(windowStart)
    // Ω = lon + GMST(windowStart) - atan2(cos(i)*sin(u), cos(u))
    const gmstRad = getGmst(windowStart); // satellite.js gstime 返回弧度
    const gmstDeg = normalize360(gmstRad * RAD2DEG);
    const cosI = Math.cos(i * DEG2RAD);
    const cosU = Math.cos(uRad);
    const sinUVal = Math.sin(uRad);
    const atanTermRad = Math.atan2(cosI * sinUVal, cosU); // 升交节点的经度因子
    const atanTermDeg = normalize360(atanTermRad * RAD2DEG);
    const raanDeg = normalize360(lon + gmstDeg - atanTermDeg);

    // ---------- 5. 反解平近点角 M ----------
    // 圆轨道(e=0):M = E = ν = u - ω
    if (ecc > 1e-6) {
      console.warn(
        `[generateMissionTle] 偏心率 e=${ecc} > 0,按圆轨道近似(M=E=ν)可能产生误差`
      );
    }
    const meanAnomalyDeg = normalize360(uDeg - omega);

    // ---------- 6. 历元对齐:设 epoch = windowStart ----------
    // 避免 SGP4 J2 摄动多日累积漂移(28 天漂移可达 140°)
    const newEpoch = new Date(windowStart);

    // ---------- 7. 重构 TLE 字符串 ----------
    // line1:替换历元字段(indices 18-31)
    const newLine1 = rebuildLine1WithEpoch(originalTle.line1, newEpoch);

    // line2:先替换 RAAN(indices 17-24),再替换 M(indices 43-50)
    // 每次替换都会重算校验和,所以下一步基于上一步的输出
    const line2AfterRaan = rebuildLine2WithRaan(originalTle.line2, raanDeg);
    const newLine2 = rebuildLine2WithMeanAnomaly(line2AfterRaan, meanAnomalyDeg);

    // ---------- 8. 组装 TLEData ----------
    const virtualTle: TLEData = {
      name: originalTle.name,
      noradId: originalTle.noradId,
      line1: newLine1,
      line2: newLine2,
      epoch: new Date(newEpoch),
      elements: {
        ...originalTle.elements,
        raan: raanDeg,
        meanAnomaly: meanAnomalyDeg,
        // 倾角、偏心率、近地点幅角、平均运动、圈号保持不变
      },
    };

    return {
      tle: virtualTle,
      debug: {
        argumentOfLatitudeDeg: uDeg,
        raanDeg,
        meanAnomalyDeg: meanAnomalyDeg,
        epoch: newEpoch,
        pass,
      },
    };
  } catch (e) {
    return {
      tle: null,
      error: `虚拟 TLE 生成失败:${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * 便捷包装:生成虚拟 TLE,失败时返回原 TLE(降级策略)
 * 适用于「失败时仍需继续执行任务」的场景
 */
export function generateMissionTleOrFallback(
  originalTle: TLEData,
  aoi: Aoi,
  windowStart: Date,
  options?: GenerateMissionTleOptions
): TLEData {
  const result = generateMissionTle(originalTle, aoi, windowStart, options);
  if (result.tle) return result.tle;
  console.warn(`[generateMissionTle] ${result.error},回退到原 TLE`);
  return originalTle;
}
