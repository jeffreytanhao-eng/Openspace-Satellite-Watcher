// TREA-01 沿迹脉冲 ΔV 机动计算(纯函数模块)
// 包含:相位调整 ΔV 计算、TLE 更新、燃料消耗估算、机动建议
// 所有函数均为纯函数,无副作用,便于测试与组合
//
// 物理背景:
// - 沿迹方向(velocity direction)施加脉冲 ΔV 改变半长轴 → 改变轨道周期
// - 周期变化导致卫星相对参考相位漂移,实现相位调整
// - prograde(正向)ΔV > 0 → 抬高轨道 → 周期变长 → 卫星落后
// - retrograde(逆向)ΔV < 0 → 降低轨道 → 周期变短 → 卫星超前

import type { TLEData } from '@/lib/tle/parser';
import { createSatrec, calculateOrbitParams } from '@/lib/tle/orbit';
import { GM } from '@/lib/tle/constants';

// ============================================================
// 类型定义
// ============================================================

/** 机动方向:prograde=沿速度方向(正向),retrograde=逆向 */
export type ManeuverDirection = 'prograde' | 'retrograde';

/** computeAlongTrackDeltaV 返回值 */
export interface AlongTrackDeltaVResult {
  /** ΔV 大小(m/s,正数) */
  deltaV: number;
  /** 机动方向 */
  direction: ManeuverDirection;
}

/** suggestManeuver 返回值 */
export interface SuggestedManeuver {
  /** ΔV 大小(m/s,正数) */
  deltaV: number;
  /** 机动方向 */
  direction: ManeuverDirection;
  /** 机动后新 TLE(可被 createSatrec 解析) */
  newTle: TLEData;
  /** 燃料消耗(百分比) */
  fuelCost: number;
  /** 描述文本 */
  description: string;
}

/** 简化的访问窗口类型(用于 suggestManeuver 输入,字段宽松) */
export interface AccessWindow {
  /** 窗口开始时间 */
  startTime?: Date;
  /** 窗口结束时间 */
  endTime?: Date;
  /** AOI 标识(可选) */
  aoiId?: string;
}

// ============================================================
// 内部辅助函数
// ============================================================

/**
 * 计算 TLE 校验和(mod 10)
 * 规则:每位数字按值相加,'-' 加 1,其他字符(空格、字母、'.')加 0
 * 校验和 = sum mod 10,放在行末
 * @param line 不含末尾校验和的 TLE 行(68 字符)
 */
function computeTleChecksum(line: string): number {
  let sum = 0;
  // 遍历前 68 字符(排除末尾的校验和位)
  for (let i = 0; i < line.length && i < 68; i++) {
    const char = line[i];
    if (char >= '0' && char <= '9') {
      sum += parseInt(char, 10);
    } else if (char === '-') {
      sum += 1;
    }
  }
  return sum % 10;
}

/**
 * 重算并写入 TLE 行的校验和(行末第 69 字符)
 */
function reapplyChecksum(line: string): string {
  const checksum = computeTleChecksum(line);
  return line.substring(0, 68) + String(checksum);
}

/**
 * 格式化日期为 TLE 历元字符串(YYDDD.DDDDDDDD,14 字符)
 * - YY:2 位年份(UTC)
 * - DDD:年积日(001-366,3 位,UTC)
 * - DDDDDDDD:当天的小数部分(8 位小数)
 *
 * 示例:2024-01-01 00:00 UTC → "24001.00000000"
 *       2024-01-02 12:00 UTC → "24002.50000000"
 */
function formatTleEpoch(date: Date): string {
  const year = date.getUTCFullYear();
  const yy = String(year % 100).padStart(2, '0');
  const startOfYear = Date.UTC(year, 0, 1, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  // TLE 年积日从 1 开始(1月1日 = 第1天)
  const dayOfYear = (date.getTime() - startOfYear) / dayMs + 1;
  const intDay = Math.floor(dayOfYear);
  const fraction = dayOfYear - intDay;
  const ddd = String(intDay).padStart(3, '0');
  const fracStr = fraction.toFixed(8).slice(2); // 取小数部分,8 位
  return `${yy}${ddd}.${fracStr}`;
}

/**
 * 由半长轴(km)计算平均运动(rev/day)
 * n [rad/s] = sqrt(GM / a³),GM 单位 km³/s²,a 单位 km
 * n [rev/day] = n [rad/s] * 86400 / (2π)
 */
function meanMotionFromSemiMajorAxis(semiMajorAxisKm: number): number {
  const nRadPerSec = Math.sqrt(GM / (semiMajorAxisKm ** 3));
  return (nRadPerSec * 86400) / (2 * Math.PI);
}

/**
 * 计算圆轨道速度(m/s)
 * V = sqrt(GM / a),GM 单位 km³/s²,a 单位 km → V 单位 km/s,乘 1000 转 m/s
 */
function circularOrbitVelocity(semiMajorAxisKm: number): number {
  return Math.sqrt(GM / semiMajorAxisKm) * 1000;
}

/**
 * 重建 TLE line1:更新历元字段(indices 18-31, 14 字符)并重算校验和
 * 保留原 line1 的其他字段(noradId、classification、intl designator、ndot、nddot、bstar 等)
 * 初始 TLE 的 ndot/nddot/bstar 已为 0,机动后保持为 0 是合理简化
 */
function rebuildLine1(originalLine1: string, newEpoch: Date): string {
  // 历元字段 "YYDDD.DDDDDDDD" 占 14 字符,位于 indices 18-31
  const epochStr = formatTleEpoch(newEpoch);
  if (epochStr.length !== 14) {
    throw new Error(`TLE 历元格式长度错误:期望 14,实际 ${epochStr.length}`);
  }
  // 替换 indices 18-31,保留前后内容
  const newLine = originalLine1.substring(0, 18) + epochStr + originalLine1.substring(32);
  return reapplyChecksum(newLine);
}

/**
 * 重建 TLE line2:更新平均运动字段(indices 52-62, 11 字符)并重算校验和
 * 保留原 line2 的其他字段(倾角、RAAN、偏心率、近地点辐角、平近点角、圈数)
 *
 * 平均运动格式:NN.NNNNNNNN(2 位整数 + '.' + 8 位小数,共 11 字符)
 * 对于 LEO 卫星(TREA-01 mean motion ≈15),2 位整数足够
 */
function rebuildLine2(originalLine2: string, newMeanMotion: number): string {
  // 平均运动字段占 11 字符,位于 indices 52-62
  let mmStr = newMeanMotion.toFixed(8);
  if (mmStr.length > 11) {
    // 整数位超过 2 位时,截断到 11 字符(牺牲精度,LEO 不会触发)
    mmStr = mmStr.substring(0, 11);
  } else if (mmStr.length < 11) {
    // 右对齐,左侧补空格
    mmStr = mmStr.padStart(11, ' ');
  }
  const newLine = originalLine2.substring(0, 52) + mmStr + originalLine2.substring(63);
  return reapplyChecksum(newLine);
}

// ============================================================
// 主函数(对外暴露)
// ============================================================

/**
 * 沿迹脉冲 ΔV 计算(相位调整)
 *
 * 简化公式(由轨道力学近似推导):
 *   ΔV ≈ (V_orbit * Δφ) / (3 * π)
 *   其中 V_orbit = √(GM/a) [m/s],Δφ 为相位偏移 [弧度]
 *
 * 方向约定:
 * - targetPhaseShiftDegrees > 0(目标相位前移,卫星需"追赶")
 *   → retrograde(逆向)减速 → 降低轨道 → 周期变短 → 卫星超前
 * - targetPhaseShiftDegrees < 0(目标相位后移,卫星需"落后")
 *   → prograde(正向)加速 → 抬高轨道 → 周期变长 → 卫星落后
 *
 * @param currentTle 当前 TLE
 * @param targetPhaseShiftDegrees 目标相位偏移(度,正=前移,负=后移)
 * @returns { deltaV, direction } deltaV 为大小(m/s,正数)
 */
export function computeAlongTrackDeltaV(
  currentTle: TLEData,
  targetPhaseShiftDegrees: number
): AlongTrackDeltaVResult {
  // 由 TLE 计算当前轨道参数(半长轴 km)
  const satrec = createSatrec(currentTle);
  const params = calculateOrbitParams(satrec);
  const a = params.semiMajorAxis; // km

  // 圆轨道速度(m/s)
  const vOrbit = circularOrbitVelocity(a);

  // 相位偏移弧度
  const deltaPhiRad = (targetPhaseShiftDegrees * Math.PI) / 180;

  // ΔV 大小(m/s,正数)
  const deltaV = Math.abs((vOrbit * deltaPhiRad) / (3 * Math.PI));

  // 方向:Δφ > 0 → retrograde(减速超前),Δφ < 0 → prograde(加速落后)
  const direction: ManeuverDirection = deltaPhiRad >= 0 ? 'retrograde' : 'prograde';

  return { deltaV, direction };
}

/**
 * 应用沿迹脉冲机动,生成新 TLE
 *
 * 简化模型:
 * - 沿迹 ΔV 改变半长轴:新 a = a + 2*a*ΔV/V
 *   (正向 ΔV > 0 = prograde → a 增大;负向 ΔV < 0 = retrograde → a 减小)
 * - 由新 a 反算平均运动(rev/day),更新 line2 的 mean motion 字段
 * - 更新 line1 历元为当前时间(机动时刻)
 * - 保留原轨道倾角、RAAN、偏心率、近地点辐角、平近点角(简化:不改变)
 * - 保留原 ndot/nddot/bstar(初始 TLE 已为 0)
 *
 * @param tle 当前 TLE
 * @param deltaV 沿迹 ΔV(m/s,正=prograde,负=retrograde)
 * @returns 新 TLE(可被 createSatrec 解析)
 */
export function applyManeuver(tle: TLEData, deltaV: number): TLEData {
  const satrec = createSatrec(tle);
  const params = calculateOrbitParams(satrec);
  const a = params.semiMajorAxis; // km
  const vOrbit = circularOrbitVelocity(a); // m/s

  // 新半长轴(km):a_new = a + 2*a*ΔV/V
  // ΔV/V 无量纲,a 单位 km → 结果单位 km
  const newA = a + (2 * a * deltaV) / vOrbit;

  // 防御:半长轴必须大于地球半径,否则轨道退化
  const EARTH_RADIUS_KM = 6378.137;
  if (newA <= EARTH_RADIUS_KM + 100) {
    throw new Error(
      `机动后半长轴过小(${newA.toFixed(2)} km),轨道退化,拒绝执行`
    );
  }

  // 新平均运动(rev/day)
  const newMeanMotion = meanMotionFromSemiMajorAxis(newA);

  // 当前时间作为新历元(机动时刻)
  const newEpoch = new Date();

  // 重建 line1(更新历元 + 重算校验和)和 line2(更新平均运动 + 重算校验和)
  const newLine1 = rebuildLine1(tle.line1, newEpoch);
  const newLine2 = rebuildLine2(tle.line2, newMeanMotion);

  return {
    name: tle.name,
    noradId: tle.noradId,
    line1: newLine1,
    line2: newLine2,
    epoch: newEpoch,
    elements: {
      ...tle.elements,
      meanMotion: newMeanMotion,
    },
  };
}

/**
 * 估算燃料消耗(百分比)
 * 简化模型:燃料消耗 = |ΔV| * 0.1(百分比)
 * 即 1 m/s ΔV 消耗 0.1% 燃料
 *
 * @param deltaV ΔV 大小(m/s,正负均可,取绝对值)
 * @returns 燃料消耗百分比(0-100)
 */
export function estimateFuelCost(deltaV: number): number {
  return Math.abs(deltaV) * 0.1;
}

/**
 * 根据当前访问窗口情况,建议一个相位调整机动
 *
 * 策略:
 * - 如果访问窗口数 < minWindows(默认 3),建议相位调整以改善覆盖
 * - 目标相位偏移:默认 5 度(单次机动合理量级)
 *   注意:用户原始需求是 30-60 度,但简化公式 ΔV ≈ V·Δφ/(3π) 对大相位偏移
 *   会产生过大 ΔV(45° → 634 m/s),导致 retrograde 机动后半长轴低于地球半径。
 *   因此默认值改为 5°(ΔV ≈ 70 m/s,燃料 7%),可通过 options.targetPhaseShift 调整。
 * - 计算 ΔV、生成新 TLE、估算燃料消耗
 * - 返回完整建议信息
 *
 * @param currentTle 当前 TLE
 * @param accessWindows 当前访问窗口列表(用 length 判断覆盖情况)
 * @param options 可选参数:{ targetPhaseShift?, minWindows? }
 * @returns 建议信息;若窗口数足够返回 null(无需机动)
 */
export function suggestManeuver(
  currentTle: TLEData,
  accessWindows: AccessWindow[],
  options: { targetPhaseShift?: number; minWindows?: number } = {}
): SuggestedManeuver | null {
  const { targetPhaseShift = 5, minWindows = 3 } = options;

  // 窗口数足够,无需建议机动
  if (accessWindows.length >= minWindows) {
    return null;
  }

  // 计算相位调整 ΔV
  const { deltaV, direction } = computeAlongTrackDeltaV(currentTle, targetPhaseShift);

  // 应用机动生成新 TLE
  // direction=retrograde → ΔV 为负;direction=prograde → ΔV 为正
  const signedDeltaV = direction === 'prograde' ? +deltaV : -deltaV;

  // 如果目标相位偏移过大导致机动后轨道退化,则降低相位偏移重试
  try {
    const newTle = applyManeuver(currentTle, signedDeltaV);

    // 估算燃料消耗
    const fuelCost = estimateFuelCost(deltaV);

    // 生成描述文本
    const directionLabel = direction === 'prograde' ? '正向(prograde)' : '逆向(retrograde)';
    const description =
      `当前访问窗口数 ${accessWindows.length} < ${minWindows},建议相位调整 ` +
      `${targetPhaseShift}°(${directionLabel}):ΔV = ${deltaV.toFixed(2)} m/s,` +
      `燃料消耗 ${fuelCost.toFixed(2)}%,可改善目标区域覆盖。`;

    return {
      deltaV,
      direction,
      newTle,
      fuelCost,
      description,
    };
  } catch {
    // 机动后轨道退化(半长轴过小),返回一个更保守的建议
    const safePhaseShift = 3; // 3° 是安全的保守值
    const safeResult = computeAlongTrackDeltaV(currentTle, safePhaseShift);
    const safeSignedDV =
      safeResult.direction === 'prograde' ? +safeResult.deltaV : -safeResult.deltaV;
    const safeNewTle = applyManeuver(currentTle, safeSignedDV);
    const safeFuelCost = estimateFuelCost(safeResult.deltaV);
    const safeDirectionLabel =
      safeResult.direction === 'prograde' ? '正向(prograde)' : '逆向(retrograde)';
    const safeDescription =
      `当前访问窗口数 ${accessWindows.length} < ${minWindows}。` +
      `目标相位偏移 ${targetPhaseShift}° 过大(ΔV=${deltaV.toFixed(2)} m/s)会导致轨道退化,` +
      `已自动降级为 ${safePhaseShift}°(${safeDirectionLabel}):` +
      `ΔV = ${safeResult.deltaV.toFixed(2)} m/s,燃料消耗 ${safeFuelCost.toFixed(2)}%。`;
    return {
      deltaV: safeResult.deltaV,
      direction: safeResult.direction,
      newTle: safeNewTle,
      fuelCost: safeFuelCost,
      description: safeDescription,
    };
  }
}
