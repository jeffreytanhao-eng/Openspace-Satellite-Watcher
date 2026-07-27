// TREA-01 遥感任务仿真闭环 — 独立 Zustand Store
// 完全隔离于 satelliteStore,不与默认 13 颗卫星逻辑耦合
// 负责管理 TREA-01 卫星的 TLE、轨道参数、燃料、电量、姿态、
// 载荷状态、任务阶段、机动历史和遥测缓存

import { create } from 'zustand';
import type { TLEData } from '@/lib/tle/parser';
import { createSatrec, propagateOrbit, calculateOrbitParams, type OrbitParams } from '@/lib/tle/orbit';
import {
  TREA01_INITIAL_TLE,
  getTrea01InitialState,
  type MissionPhase,
  type AttitudeMode,
  type PayloadStatus,
} from '@/lib/trea/constants';
// M4 / Task 12-13:任务执行结果与报告类型 + 报告生成函数
import {
  generateReport,
  type MissionResult,
  type MissionReport,
} from '@/lib/trea/report';

// ============================================================
// 类型定义
// ============================================================

/** 遥测缓存:位置(km ECI)/ 速度(km/s)/ 地理坐标 */
export interface TelemetryCache {
  /** ECI 位置 {x,y,z},单位 km */
  position: { x: number; y: number; z: number };
  /** ECI 速度 {x,y,z},单位 km/s */
  velocity: { x: number; y: number; z: number };
  /** 地理坐标 {lat, lon, alt} */
  geographic: { lat: number; lon: number; alt: number };
  /** 遥测对应时刻 */
  time: Date;
}

/**
 * 任务对象
 * M0:基础结构(id/aoiId/aoiName/plannedTime/status)
 * M4:扩展过境窗口字段(windowStart/windowEnd/aoiCenter),供任务状态机驱动仿真
 */
export interface TreaMissionTask {
  id: string;
  aoiId: string;
  aoiName: string;
  /** 计划成像时刻(通常为过境窗口中心时刻) */
  plannedTime: Date;
  status: 'PENDING' | 'EXECUTING' | 'DONE' | 'FAILED';
  /** 过境窗口开始时间(M4 仿真状态机使用,可选) */
  windowStart?: Date;
  /** 过境窗口结束时间(M4 仿真状态机使用,可选) */
  windowEnd?: Date;
  /** 目标 AOI 中心坐标(M4 报告生成使用,可选) */
  aoiCenter?: { lat: number; lon: number };
}

/** 机动历史记录 */
export interface ManeuverRecord {
  /** 机动时刻 */
  time: Date;
  /** 速度增量 (m/s) */
  deltaV: number;
  /** 机动前 TLE line1 */
  oldLine1: string;
  /** 机动后 TLE line1 */
  newLine1: string;
  /** 燃料消耗 (百分比) */
  fuelCost: number;
  /** 备注 */
  note?: string;
}

/**
 * 碰撞警报数据(突发任务:碎片接近风险)
 * 由 triggerCollisionAlert 生成模拟数据,驱动 CollisionAlertModal 弹出红色警报
 */
export interface CollisionAlert {
  /** 碎片名称(如 COSMOS 1408 DEB) */
  debrisName: string;
  /** 碎片 NORAD ID */
  debrisNoradId: number;
  /** 最近接近时刻 TCA (Time of Closest Approach) */
  tca: Date;
  /** 最近接近距离 (km) */
  missDistance: number;
  /** 相对速度 (km/s) */
  relativeVelocity: number;
  /** 碰撞概率 (%) */
  collisionProbability: number;
}

// 注意:MissionReport 类型现在从 @/lib/trea/report 导入(见文件顶部)
// 旧版 MissionReport(generatedAt/phase/fuel/summary)已被 M4 新版替换,
// 新版字段更丰富,适配 MissionReportModal 渲染需求

// ============================================================
// Store State / Actions 接口
// ============================================================

export interface TreaMissionState {
  /** TLE 数据(机动后会被替换) */
  tle: TLEData;
  /** 轨道参数(由 TLE 计算) */
  orbitParams: OrbitParams | null;
  /** 燃料百分比 (0-100) */
  fuel: number;
  /** 电量百分比 (0-100) */
  battery: number;
  /** 当前姿态模式 */
  attitude: AttitudeMode;
  /** 载荷状态 */
  payloadStatus: PayloadStatus;
  /** 任务阶段 */
  missionPhase: MissionPhase;
  /** 当前任务(预留) */
  currentTask: TreaMissionTask | null;
  /** 任务仿真启动时刻(M4 状态机使用,EXECUTING 阶段记录) */
  taskStartTime: Date | null;
  /** 机动历史 */
  maneuverHistory: ManeuverRecord[];
  /** 最近一次任务报告 */
  lastReport: MissionReport | null;
  /** 遥测缓存(位置/速度) */
  telemetryCache: TelemetryCache | null;
  /** 是否已初始化 */
  initialized: boolean;
  /** TREA-01 持续跟踪开关(由 TreaSatelliteView 按钮切换,CesiumGlobe 监听执行) */
  trea01Tracking: boolean;
  /** 碰撞警报(非 null 时屏幕正中弹出红色警报,触发突发避撞任务) */
  collisionAlert: CollisionAlert | null;
  /** 紧急避撞任务(碰撞警报确认后生成,显示在任务规划面板) */
  emergencyTask: TreaMissionTask | null;
}

export interface TreaMissionActions {
  /** 初始化(重置为初始状态并计算轨道参数) */
  initialize: () => void;
  /** 更新遥测缓存:根据给定时间传播 TLE,记录位置/速度 */
  updateTelemetry: (time: Date) => void;
  /** 执行机动:替换 TLE、扣除燃料、记录历史 */
  executeManeuver: (deltaV: number, newTle: TLEData, fuelCost: number) => void;
  /** 设置任务阶段 */
  setMissionPhase: (phase: MissionPhase) => void;
  /** 设置当前任务 */
  setCurrentTask: (task: TreaMissionTask | null) => void;
  /** 设置最近一次任务报告 */
  setLastReport: (report: MissionReport | null) => void;
  /** 重置到初始状态 */
  reset: () => void;
  /** 切换 TREA-01 持续跟踪 */
  setTrea01Tracking: (tracking: boolean) => void;
  /** 触发碰撞警报(生成模拟碎片接近数据,弹出红色警报) */
  triggerCollisionAlert: () => void;
  /** 关闭碰撞警报(不清理 emergencyTask,任务规划中保留避撞任务) */
  dismissCollisionAlert: () => void;
  /** 设置紧急避撞任务 */
  setEmergencyTask: (task: TreaMissionTask | null) => void;
  // ---------- M4 / Task 12:任务执行状态机 Actions ----------
  /**
   * 启动任务仿真:设置 currentTask,missionPhase='EXECUTING',记录 taskStartTime
   * 由调用方(TaskListPanel)在启动前完成时间播放设置(setRate/startPlayback/setCurrentTime)
   */
  startTaskSimulation: (task: TreaMissionTask) => void;
  /** 进入成像阶段:missionPhase='IMAGING',payloadStatus='IMAGING'(传感器开机) */
  enterImagingPhase: () => void;
  /**
   * 完成任务:missionPhase='COMPLETED',payloadStatus='STANDBY'(传感机关机),
   * 组装 MissionResult → 调用 generateReport 生成报告存入 lastReport,
   * 扣除燃料(result.finalFuel 写回 store)
   */
  completeTask: (result: MissionResult) => void;
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 根据 TLE 计算轨道参数
 * 失败时返回 null,不抛异常
 */
function computeOrbitParams(tle: TLEData): OrbitParams | null {
  try {
    const satrec = createSatrec(tle);
    return calculateOrbitParams(satrec);
  } catch (e) {
    console.warn('[treaMissionStore] 计算轨道参数失败:', e);
    return null;
  }
}

/**
 * 根据时间传播 TLE,生成遥测缓存
 * 失败时返回 null,不抛异常
 */
function computeTelemetry(tle: TLEData, time: Date): TelemetryCache | null {
  try {
    const satrec = createSatrec(tle);
    const state = propagateOrbit(satrec, time);
    if (!state) return null;
    return {
      position: state.position,
      velocity: state.velocity,
      geographic: state.geographic,
      time: new Date(time),
    };
  } catch (e) {
    console.warn('[treaMissionStore] 计算遥测失败:', e);
    return null;
  }
}

// ============================================================
// Store 实现
// ============================================================

const initialState = getTrea01InitialState();

export const useTreaMissionStore = create<TreaMissionState & TreaMissionActions>((set, get) => ({
  // ---------- State ----------
  tle: initialState.tle,
  orbitParams: computeOrbitParams(initialState.tle),
  fuel: initialState.fuel,
  battery: initialState.battery,
  attitude: initialState.attitude,
  payloadStatus: initialState.payloadStatus,
  missionPhase: initialState.missionPhase,
  currentTask: null,
  taskStartTime: null,
  maneuverHistory: [],
  lastReport: null,
  telemetryCache: null,
  initialized: true, // 默认调用 initialize() 后即为已初始化状态
  trea01Tracking: false,
  collisionAlert: null,
  emergencyTask: null,

  // ---------- Actions ----------

  initialize: () => {
    const init = getTrea01InitialState();
    set({
      tle: init.tle,
      orbitParams: computeOrbitParams(init.tle),
      fuel: init.fuel,
      battery: init.battery,
      attitude: init.attitude,
      payloadStatus: init.payloadStatus,
      missionPhase: init.missionPhase,
      currentTask: null,
      taskStartTime: null,
      maneuverHistory: [],
      lastReport: null,
      telemetryCache: null,
      initialized: true,
      trea01Tracking: false,
      collisionAlert: null,
      emergencyTask: null,
    });
  },

  updateTelemetry: (time) => {
    const { tle } = get();
    const cache = computeTelemetry(tle, time);
    if (cache) {
      set({ telemetryCache: cache });
    }
  },

  executeManeuver: (deltaV, newTle, fuelCost) => {
    const { tle, fuel, maneuverHistory } = get();
    const newFuel = Math.max(0, fuel - fuelCost);
    const newOrbitParams = computeOrbitParams(newTle);

    const record: ManeuverRecord = {
      time: new Date(),
      deltaV,
      oldLine1: tle.line1,
      newLine1: newTle.line1,
      fuelCost,
      note: `Δv=${deltaV.toFixed(2)} m/s, 燃料消耗 ${fuelCost.toFixed(2)}%`,
    };

    set({
      tle: { ...newTle },
      orbitParams: newOrbitParams,
      fuel: newFuel,
      maneuverHistory: [...maneuverHistory, record],
    });
  },

  setMissionPhase: (phase) => {
    set({ missionPhase: phase });
  },

  setCurrentTask: (task) => {
    set({ currentTask: task });
  },

  setLastReport: (report) => {
    set({ lastReport: report });
  },

  // ---------- M4 / Task 12:任务执行状态机 Actions ----------

  startTaskSimulation: (task) => {
    // 设置当前任务、进入执行阶段、记录启动时刻
    // 调用方负责时间播放设置(setRate/startPlayback/setCurrentTime)
    set({
      currentTask: task,
      missionPhase: 'EXECUTING',
      taskStartTime: new Date(),
      lastReport: null, // 清空上一次报告
    });
  },

  enterImagingPhase: () => {
    // 进入成像阶段:任务阶段置为 IMAGING,载荷开机
    set({
      missionPhase: 'IMAGING',
      payloadStatus: 'IMAGING',
      attitude: 'Roll', // 成像时通常侧摆对准目标
    });
  },

  completeTask: (result) => {
    // 完成任务:阶段置为 COMPLETED,载荷待机,扣除燃料,生成报告
    // result.finalFuel 为 MissionSimulator 计算的任务后燃料(已扣除本次消耗)
    const report = generateReport(result);
    set({
      missionPhase: 'COMPLETED',
      payloadStatus: 'STANDBY',
      attitude: 'Nominal', // 成像结束恢复标称姿态
      fuel: result.finalFuel,
      lastReport: report,
    });
  },

  reset: () => {
    get().initialize();
  },

  setTrea01Tracking: (tracking) => {
    set({ trea01Tracking: tracking });
  },

  // 触发碰撞警报:模拟太空碎片接近事件(真实历史碎片名称)
  // 生成 TCA(最近接近时刻)在 40-60 分钟后的警报,距离 < 1km(高风险)
  triggerCollisionAlert: () => {
    const debrisOptions = [
      { name: 'COSMOS 1408 DEB', noradId: 54000 + Math.floor(Math.random() * 999) },
      { name: 'FENGYUN 1C DEB', noradId: 30000 + Math.floor(Math.random() * 999) },
      { name: 'IRIDIUM 33 DEB', noradId: 34000 + Math.floor(Math.random() * 999) },
    ];
    const debris = debrisOptions[Math.floor(Math.random() * debrisOptions.length)];
    const tca = new Date(Date.now() + (40 + Math.random() * 20) * 60_000); // 40-60 分钟后
    const alert: CollisionAlert = {
      debrisName: debris.name,
      debrisNoradId: debris.noradId,
      tca,
      missDistance: 0.3 + Math.random() * 0.5, // 0.3-0.8 km(危险阈值,通常 < 1km 需机动)
      relativeVelocity: 10.5 + Math.random() * 4, // 10.5-14.5 km/s(典型轨道相对速度)
      collisionProbability: 0.5 + Math.random() * 1.5, // 0.5%-2%(远超 1e-4 机动阈值)
    };
    // 同时生成紧急避撞任务(TCA 前 15 分钟执行机动,留出预警与执行时间)
    const task: TreaMissionTask = {
      id: `emergency-collision-${Date.now()}`,
      aoiId: 'COLLISION_AVOIDANCE',
      aoiName: '紧急避撞机动',
      plannedTime: new Date(tca.getTime() - 15 * 60_000),
      status: 'PENDING',
    };
    set({ collisionAlert: alert, emergencyTask: task });
  },

  dismissCollisionAlert: () => {
    set({ collisionAlert: null });
  },

  setEmergencyTask: (task) => {
    set({ emergencyTask: task });
  },
}));

// ============================================================
// 便捷 Selector Hooks(参考 satelliteStore 模式)
// ============================================================

export const useTreaTle = () => useTreaMissionStore(state => state.tle);
export const useTreaOrbitParams = () => useTreaMissionStore(state => state.orbitParams);
export const useTreaFuel = () => useTreaMissionStore(state => state.fuel);
export const useTreaBattery = () => useTreaMissionStore(state => state.battery);
export const useTreaAttitude = () => useTreaMissionStore(state => state.attitude);
export const useTreaPayloadStatus = () => useTreaMissionStore(state => state.payloadStatus);
export const useTreaMissionPhase = () => useTreaMissionStore(state => state.missionPhase);
export const useTreaCurrentTask = () => useTreaMissionStore(state => state.currentTask);
export const useTreaTaskStartTime = () => useTreaMissionStore(state => state.taskStartTime);
export const useTreaManeuverHistory = () => useTreaMissionStore(state => state.maneuverHistory);
export const useTreaLastReport = () => useTreaMissionStore(state => state.lastReport);
export const useTreaTelemetry = () => useTreaMissionStore(state => state.telemetryCache);
export const useTrea01Tracking = () => useTreaMissionStore(state => state.trea01Tracking);
export const useCollisionAlert = () => useTreaMissionStore(state => state.collisionAlert);
export const useEmergencyTask = () => useTreaMissionStore(state => state.emergencyTask);

// 重新导出常量,方便调用方一站式引用
export { TREA01_INITIAL_TLE };
// 重新导出 M4 报告类型,方便调用方一站式引用
export type { MissionResult, MissionReport };
