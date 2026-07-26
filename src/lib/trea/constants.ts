// TREA-01 遥感任务仿真闭环 — 常量与初始状态定义
// 完全独立模块，不依赖 satelliteStore / 默认 13 颗卫星逻辑
// 所有 TREA-01 相关的状态由 treaMissionStore 管理

import type { TLEData } from '@/lib/tle/parser';

// ============================================================
// 1. TREA-01 初始 TLE 数据
// ============================================================
// 设计目标:近圆 LEO,轨道高度 ≈500km,轨道倾角 ≈50°
// NORAD ID 使用虚构值 99999,避免与真实卫星冲突
// 历元:2026-07-01 00:00:00 UTC (YYDDD = 26182.00000000)
// 平均运动 15.216 rev/day → 半长轴 ≈6879.9km → 高度 ≈501.8km
// 偏心率 0 → 近圆轨道
// 校验和已计算并验证通过 (line1=6, line2=9)
//
// 重要:历元必须保持近期(距当前 ≤30天),否则 SGP4 传播结果失真,
// 会导致 computeAccessWindows 找不到过境窗口。
// 如需更新历元,使用 scripts/regen-trea-tle.mjs 重新生成校验和。

/**
 * TREA-01 卫星初始 TLE 数据(虚构,仅用于仿真)
 * - name: TREA-01
 * - noradId: 99999 (虚构)
 * - line1/line2: 标准 TLE 格式,共 69 字符,checksum 已验证
 * - epoch: 2026-07-01 UTC
 * - elements: 轨道根数,便于直接使用,无需重新解析
 */
export const TREA01_INITIAL_TLE: TLEData = {
  name: 'TREA-01',
  noradId: '99999',
  line1: '1 99999U 26182A   26182.00000000  .00000000  00000-0  00000+0 0    16',
  line2: '2 99999  50.0000 100.0000 0000000   0.0000   0.0000 15.21600000    19',
  epoch: new Date(Date.UTC(2026, 6, 1, 0, 0, 0)),
  elements: {
    noradId: '99999',
    inclination: 50.0,
    raan: 100.0,
    eccentricity: 0.0,
    argPerigee: 0.0,
    meanAnomaly: 0.0,
    meanMotion: 15.216,
    revolutionNumber: 1,
  },
};

// ============================================================
// 2. AOI (Area of Interest) 关注区域定义
// ============================================================

/**
 * AOI 多边形顶点格式:[lon, lat] (经度在前,纬度在后)
 * 与 Cesium Cartesian3.fromDegreesArray 的输入顺序一致
 */
export interface AoiPolygonVertex {
  lon: number;
  lat: number;
}

export interface Aoi {
  /** AOI 唯一标识 */
  id: string;
  /** AOI 显示名称 */
  name: string;
  /** 中心点 {lat, lon} */
  center: { lat: number; lon: number };
  /** 多边形顶点 [lon, lat] 数组 */
  polygon: Array<[number, number]>;
}

/**
 * AOI_A: 南海西沙-菲律宾海域
 * 中心 {lat: 16.5, lon: 113.5}
 * 矩形多边形: 经度 111~117°E, 纬度 15~18°N
 */
export const AOI_A: Aoi = {
  id: 'aoi-a',
  name: 'Xisha-Philippine Sea AOI',
  center: { lat: 16.5, lon: 113.5 },
  polygon: [
    [111, 15],
    [117, 15],
    [117, 18],
    [111, 18],
  ],
};

/**
 * AOI_B: 霍尔木兹海峡
 * 中心 {lat: 26.5, lon: 56.5}
 * 矩形多边形: 经度 55.5~57.5°E, 纬度 25.5~27.5°N
 */
export const AOI_B: Aoi = {
  id: 'aoi-b',
  name: 'Strait of Hormuz AOI',
  center: { lat: 26.5, lon: 56.5 },
  polygon: [
    [55.5, 25.5],
    [57.5, 25.5],
    [57.5, 27.5],
    [55.5, 27.5],
  ],
};

/** AOI 列表,供 Cesium 渲染和任务规划使用 */
export const AOI_LIST: Aoi[] = [AOI_A, AOI_B];

// ============================================================
// 3. 传感器参数
// ============================================================

/** 传感器刈幅宽度(km),TREA-01 遥感载荷覆盖范围
 * 200km 对应中等分辨率光学遥感卫星典型刈幅(如 Sentinel-2 290km)
 * 宽度影响:过境窗口时长 + 成像足迹可视化 + 覆盖率计算
 */
export const SENSOR_FOOTPRINT_WIDTH_KM = 200;

/** 最小太阳高度角(度),低于此值视为光照条件不足,不建议成像 */
export const MIN_SUN_ELEVATION = 10;

// ============================================================
// 4. 初始状态常量
// ============================================================

/** 初始燃料量(百分比) */
export const FUEL_INITIAL = 100;

/** 初始电量(百分比) */
export const BATTERY_INITIAL = 100;

/** 初始姿态模式 */
export const ATTITUDE_INITIAL = 'Nominal' as const;

/** 初始载荷状态 */
export const PAYLOAD_INITIAL = 'STANDBY' as const;

// ============================================================
// 5. 任务阶段类型与初始状态工厂
// ============================================================

/** 任务阶段枚举 */
export type MissionPhase = 'IDLE' | 'PLANNED' | 'EXECUTING' | 'IMAGING' | 'COMPLETED';

/** 姿态模式类型 */
export type AttitudeMode = 'Nominal' | 'Roll' | 'Pitch' | 'Yaw';

/** 载荷状态类型 */
export type PayloadStatus = 'STANDBY' | 'IMAGING' | 'OFF';

/** TREA-01 完整初始状态 */
export interface Trea01InitialState {
  tle: TLEData;
  fuel: number;
  battery: number;
  attitude: AttitudeMode;
  payloadStatus: PayloadStatus;
  missionPhase: MissionPhase;
}

/**
 * 获取 TREA-01 完整初始状态
 * 用于 treaMissionStore.initialize() 和 reset()
 * 返回新对象,避免外部修改污染常量
 */
export function getTrea01InitialState(): Trea01InitialState {
  return {
    tle: { ...TREA01_INITIAL_TLE },
    fuel: FUEL_INITIAL,
    battery: BATTERY_INITIAL,
    attitude: ATTITUDE_INITIAL,
    payloadStatus: PAYLOAD_INITIAL,
    missionPhase: 'IDLE',
  };
}
