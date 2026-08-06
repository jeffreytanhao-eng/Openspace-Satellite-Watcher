// ============================================================
// 合成交通卫星生成 — 赛车视角页面 (/cockpit) 专用
// ------------------------------------------------------------
// 5 颗虚构交通卫星,基于 TREA-01 TLE 派生(同倾角/偏心率/近地点幅角,
// 仅 meanMotion 略有差异制造沿迹漂移)。每颗使用一个 3D 模型渲染
// (均为态势感知页面未使用的 NASA 模型,Draco 解压版)。
//
// 关键机制 —— 脚本化交汇调度(rephaseTrafficSat):
//   被动轨道漂移无法同时满足"频繁"与"近距离(<15km)"(大 meanMotion 差
//   → 高度差 → 最近距离 ≥ 高度差;小 meanMotion 差 → 漂移太慢)。
//   故采用脚本调度:当某卫星远离至 SHOW_DISTANCE 之外时,重置其平近点角,
//   使其在 LEAD 时间后抵达 TREA-01 当前位置(共面同轨道,平近点角对齐
//   → 最近距离 ≈ 高度差 ≈ 13-16km)。meanMotion 微差使其沿迹接近/远离,
//   呈现"掠过"效果。±meanMotionDelta 控制接近方向(正=从后方追上,负=被超越)。
//
// 纯合成、可预测、不依赖真实目录。仅用于 /cockpit,不影响主应用。
// ============================================================

import type { TLEData } from '@/lib/tle/parser';
import { createSatrec, propagateOrbit } from '@/lib/tle/orbit';
import { GM } from '@/lib/tle/constants';

// ============================================================
// 配置
// ============================================================

export interface TrafficSatConfig {
  /** 显示名称 */
  name: string;
  /** 平均运动偏移(rev/day):控制沿迹漂移速率与方向(+ 从后方追上,- 被超越) */
  meanMotionDelta: number;
  /** 标签/微染色(CSS);不用于发光晕,仅 label + 极低比例 colorBlend */
  color: string;
  /** 3D 模型文件名(对应 /models/<name>.glb);均为态势感知页面未使用的解压模型 */
  model: string;
}

/**
 * 5 颗交通卫星。meanMotionDelta 取值小(0.020-0.025)→ 轨道半长轴差
 * Δa ≈ 2a·Δn/n ≈ 13-16km,保证交汇时最近距离 ~13-16km。
 * 正负交替 → 部分从后方追上、部分被超越。
 *
 * 模型均为态势感知页面(iss/hubble/terra/aqua/aura/landsat8/suomi-npp)
 * 未使用的 NASA 3D 模型,经 Draco 解压,避免与主页模型重复。
 */
export const TRAFFIC_SAT_CONFIGS: TrafficSatConfig[] = [
  { name: 'TRAFFIC-01', meanMotionDelta: +0.020, color: '#7dd3fc', model: 'cloudsat-decoded' },
  { name: 'TRAFFIC-02', meanMotionDelta: -0.018, color: '#fbbf24', model: 'grace-decoded' },
  { name: 'TRAFFIC-03', meanMotionDelta: +0.025, color: '#a78bfa', model: 'oco2-decoded' },
  { name: 'TRAFFIC-04', meanMotionDelta: -0.022, color: '#fb923c', model: 'tess-decoded' },
  { name: 'TRAFFIC-05', meanMotionDelta: +0.022, color: '#f472b6', model: 'swift-decoded' },
];

/** 入画距离阈值(km):小于此距离的交通卫星才显示 */
export const TRAFFIC_SHOW_DISTANCE_KM = 50;

/**
 * 交汇调度参数(由 useChaseViewer 的 preUpdate 监听器使用,常量化便于调参)
 *
 * LEAD:调度后到抵达的仿真时长。相对沿迹漂移速率 ≈ meanMotionDelta·2π·a/86400
 *   ≈ 10 m/s(Δn=0.02),50km / 10m/s ≈ 83 min → 取 60 min(略短,卫星从 ~36km
 *   处入画,平衡"平滑接近"与"快速抵达":10x 下约 6 分钟首次抵达)。
 * GAP:抵达后冷却的仿真时长,防止同一颗卫星被连续重复调度。
 */
export const TRAFFIC_LEAD_SIM_MS = 60 * 60 * 1000;  // 60 分钟(仿真)后抵达
export const TRAFFIC_GAP_SIM_MS = 40 * 60 * 1000;    // 抵达后冷却 40 分钟(仿真)

/**
 * 沿迹前移偏移(km):卫星抵达时位于 TREA-01 前方此距离,而非正下方。
 *
 * 赛车相机在卫星后上方(350m 后 / 130m 上)向前看,视线低于水平面 ~15°。
 * 若卫星抵达时与 TREA-01 平近点角完全对齐(0 沿迹偏移),卫星在正下方
 * ~13km(高度差),位于相机视野外(90° 下方),用户看不到。
 *
 * 前移 15km:卫星在抵达时刻位于前方 15km、下方 13km,与相机视线夹角
 * atan(13/15)=41° 低于水平面,距视野中心 ~26°,在 60° FOV 内可见。
 * 抵达后:正 meanMotionDelta 卫星继续前移(远离);负 meanMotionDelta
 * 卫星回退经正下方(短暂消失)再到后方(飞越效果)。
 */
export const TRAFFIC_AHEAD_OFFSET_KM = 20;

// ============================================================
// TLE 字段编辑工具(标准 TLE line2 列位置,0-indexed)
// ============================================================
const L_NORAD_START = 2;
const L_NORAD_WIDTH = 5;
const L2_RAAN = { start: 17, width: 8, decimals: 4 };
const L2_MA = { start: 43, width: 8, decimals: 4 };
const L2_MM = { start: 52, width: 11, decimals: 7 };

/** TLE 行校验和:数字求和,'-' 计 1,mod 10(与 parser.ts 一致) */
function tleChecksum(line: string): number {
  let sum = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const ch = line[i];
    if (ch >= '0' && ch <= '9') {
      sum += ch.charCodeAt(0) - 48;
    } else if (ch === '-') {
      sum += 1;
    }
  }
  return sum % 10;
}

function setNumericField(
  line: string,
  start: number,
  width: number,
  value: number,
  decimals: number,
): string {
  const formatted = value.toFixed(decimals).padStart(width, ' ').slice(0, width);
  return line.slice(0, start) + formatted + line.slice(start + width);
}

function setNoradField(line: string, noradId: string): string {
  const id = noradId.padStart(L_NORAD_WIDTH, '0').slice(0, L_NORAD_WIDTH);
  return line.slice(0, L_NORAD_START) + id + line.slice(L_NORAD_START + L_NORAD_WIDTH);
}

function withChecksum(line: string): string {
  return line.slice(0, line.length - 1) + String(tleChecksum(line));
}

/**
 * 由绝对轨道根数构建 TLEData(基于 baseTle 的 line1/line2 模板替换字段)。
 * 倾角/偏心率/近地点幅角/历元沿用 baseTle(保持同轨道形状与历元基准)。
 */
function buildTleFromElements(
  baseTle: TLEData,
  name: string,
  noradId: string,
  raan: number,
  meanAnomaly: number,
  meanMotion: number,
): TLEData {
  const el = baseTle.elements;
  let line2 = baseTle.line2;
  line2 = setNoradField(line2, noradId);
  line2 = setNumericField(line2, L2_RAAN.start, L2_RAAN.width, raan, L2_RAAN.decimals);
  line2 = setNumericField(line2, L2_MA.start, L2_MA.width, meanAnomaly, L2_MA.decimals);
  line2 = setNumericField(line2, L2_MM.start, L2_MM.width, meanMotion, L2_MM.decimals);
  line2 = withChecksum(line2);

  let line1 = baseTle.line1;
  line1 = setNoradField(line1, noradId);
  line1 = withChecksum(line1);

  return {
    name,
    noradId,
    line1,
    line2,
    epoch: baseTle.epoch,
    elements: { ...el, noradId, raan, meanAnomaly, meanMotion },
  };
}

// ============================================================
// 交通卫星实例
// ============================================================

export interface TrafficSat {
  config: TrafficSatConfig;
  satrec: ReturnType<typeof createSatrec>;
  tle: TLEData;
  /** 下次交汇抵达时刻(仿真时间,ms);由 hook 调度更新 */
  nextArrivalSim: number;
}

/** 创建 5 颗交通卫星(初始 MA 偏移 5°,远离 TREA-01 出画,等待首次调度);每颗绑定一个 3D 模型 */
export function createTrafficSats(baseTle: TLEData): TrafficSat[] {
  const el = baseTle.elements;
  return TRAFFIC_SAT_CONFIGS.map((cfg, i) => {
    const noradId = String(90001 + i);
    const nSat = el.meanMotion + cfg.meanMotionDelta;
    // 初始 MA 偏移 5°(沿迹约 585km,出画),RAAN 同 TREA-01(共面)
    const tle = buildTleFromElements(
      baseTle,
      cfg.name,
      noradId,
      el.raan,
      (el.meanAnomaly + 5) % 360,
      nSat,
    );
    return {
      config: cfg,
      satrec: createSatrec(tle),
      tle,
      nextArrivalSim: 0,
    };
  });
}

/**
 * 脚本化交汇:重置 sat 的平近点角,使其在 tArrival 时刻抵达 TREA-01 前方 AHEAD_OFFSET_KM 处。
 * 共面(同 RAAN/倾角/偏心率/近地点幅角)+ 平近点角对齐 → 抵达瞬间与 TREA-01 几乎共位
 * (最近距离 ≈ meanMotionDelta 导致的高度差,~13-16km)。meanMotion 微差使其沿迹接近/远离。
 *
 * 关键修正:目标 MA 偏移 AHEAD_OFFSET_KM(沿迹前移),使卫星在抵达时刻位于 TREA-01
 * 前方而非正下方。赛车相机前视,正下方不可见;前移后卫星在视野中可见。
 *
 * 数学:在共面同形状轨道下,平近点角相同 ⟺ 轨道位置相同。
 *   MA_trea(tArr) = MA0_trea + n_trea·(tArr-epoch)
 *   要求 MA_sat(tArr) = MA_trea(tArr) + aheadRev → MA0_sat = MA_trea(tArr) + aheadRev - n_sat·(tArr-epoch)
 *   aheadRev = AHEAD_OFFSET_KM / (2π·a),a = (GM/n²)^(1/3)
 *
 * @param treaTle      TREA-01 当前 TLE(变轨后传新 TLE)
 * @param sat          待调度的交通卫星(原地更新 satrec/tle/nextArrivalSim)
 * @param tArrival     抵达时刻(仿真时间)
 * @param aheadOffsetKm 沿迹前移偏移(km);默认 TRAFFIC_AHEAD_OFFSET_KM。
 *                      不同卫星用不同值避免同时抵达同一位置(视觉重叠)。
 * @param raanOffsetDeg 轨道面 RAAN 偏移(度):>0 使卫星轨道面相对 TREA-01 横向
 *                      偏转,产生侧向分离,避免与 TREA-01 落在同一直线上。
 */
export function rephaseTrafficSat(
  treaTle: TLEData,
  sat: TrafficSat,
  tArrival: Date,
  aheadOffsetKm: number = TRAFFIC_AHEAD_OFFSET_KM,
  raanOffsetDeg: number = 0,
): void {
  const el = treaTle.elements;
  const epochMs = treaTle.epoch.getTime();
  const dtArrDay = (tArrival.getTime() - epochMs) / 86400000;

  // TREA-01 在 tArrival 的平近点角(转,mod 1)
  const maTreaRev = (((el.meanAnomaly / 360) + el.meanMotion * dtArrDay) % 1 + 1) % 1;
  const nSat = el.meanMotion + sat.config.meanMotionDelta;

  // 沿迹前移 aheadOffsetKm:计算对应的平近点角偏移(转)
  // n_sat (rad/s) = nSat * 2π / 86400;半长轴 a(km) = (GM / n²)^(1/3)
  // 1 转 = 2π·a;前移距离 / (2π·a) = 前移转数
  const nSatRad = nSat * 2 * Math.PI / 86400;
  const aKm = Math.cbrt(GM / (nSatRad * nSatRad));
  const aheadRev = aheadOffsetKm / (2 * Math.PI * aKm);

  // sat 历元平近点角(转),使其在 tArrival 时 MA = TREA-01 的 MA + 前移偏移
  // (更大 MA = 更靠前 = 沿迹方向更远 → 卫星在 TREA-01 前方)
  let maSat0Rev = (maTreaRev + aheadRev) - nSat * dtArrDay;
  maSat0Rev = ((maSat0Rev % 1) + 1) % 1;
  const maSat0Deg = maSat0Rev * 360;

  // 共面:RAAN 用 TREA-01 的(确保抵达点重合)。
  // 若传入 raanOffsetDeg,则 RAAN 相对 TREA-01 横向偏转,产生侧向分离(非正前)。
  const tle = buildTleFromElements(
    treaTle,
    sat.config.name,
    sat.tle.noradId,
    el.raan + raanOffsetDeg,
    maSat0Deg,
    nSat,
  );
  sat.tle = tle;
  sat.satrec = createSatrec(tle);
  sat.nextArrivalSim = tArrival.getTime();
}

// ============================================================
// 位置/距离工具
// ============================================================

export interface EcefVec {
  x: number;
  y: number;
  z: number;
}

/** 传播 satrec 到 time,返回 ECF(ECEF,km)。失败返回 null */
export function propagateEcfKm(
  satrec: ReturnType<typeof createSatrec>,
  time: Date,
): EcefVec | null {
  const st = propagateOrbit(satrec, time);
  if (!st) return null;
  return st.ecf;
}

/** 两点(km)间距离(km) */
export function distanceKm(a: EcefVec, b: EcefVec): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
