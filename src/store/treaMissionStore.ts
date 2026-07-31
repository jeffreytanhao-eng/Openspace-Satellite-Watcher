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
  AOI_LIST,
  type MissionPhase,
  type AttitudeMode,
  type PayloadStatus,
} from '@/lib/trea/constants';
import { generateMissionTle } from '@/lib/tle/generateMissionTle';
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

/**
 * 躲避计划选项(用户在 CollisionAlertModal 中选择)
 * 每个计划包含:机动类型、Δv、执行时机、燃料消耗、机动后预测效果
 * 选择后由 prepareAvoidanceManeuver 准备(计算新 TLE),commitAvoidanceManeuver 提交(更新 tle)
 */
export interface CollisionAvoidancePlan {
  /** 计划 ID */
  id: string;
  /** 计划名称 */
  name: string;
  /** 机动类型描述 */
  maneuverType: string;
  /** 速度增量 (m/s) */
  deltaV: number;
  /** 执行时机(TCA 前 X 分钟) */
  executeMinutesBeforeTca: number;
  /** 燃料消耗 (%) */
  fuelCost: number;
  /** 机动后预测最近距离 (km) */
  missDistanceAfter: number;
  /** 机动后碰撞概率 (%) */
  probabilityAfter: number;
  /** 残余风险等级 */
  riskLevel: 'low' | 'medium' | 'high';
  /** 平均运动调整量 (rev/day, 用于生成新 TLE) */
  meanMotionDelta: number;
  /** 风险颜色 */
  riskColor: 'green' | 'yellow' | 'orange';
  /** 计划描述 */
  description: string;
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
  /** 虚拟任务轨道 TLE(任务执行期间临时使用,任务完成后清除)
   * 由 generateMissionTle 生成,使卫星在 windowStart 时刻经过 AOI 上空
   * CesiumGlobe / MissionSimulator / CinematicController 优先使用此 TLE
   * 为 null 时回退到 tle(原轨道) */
  missionOrbitTle: TLEData | null;
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
  /** 可选躲避计划列表(碰撞警报确认后生成 3 个选项供用户选择) */
  avoidancePlans: CollisionAvoidancePlan[];
  /** 最近执行的避撞机动(非 null 时 HomePage 监听并设置 maneuverEvent 触发大屏变轨演示) */
  lastAvoidanceExecution: {
    planId: string;
    planName: string;
    oldTle: TLEData;
    newTle: TLEData;
    deltaV: number;
    fuelCost: number;
    /** 唯一标识,每次执行递增,触发 useEffect 重执行 */
    id: number;
    // ---- prepare 暂存的 commit 数据(commit 时取出使用,避免重复计算) ----
    newFuel?: number;
    newOrbitParams?: OrbitParams | null;
    record?: ManeuverRecord;
  } | null;
  /** 变轨动画阶段(驱动 CollisionAlertModal 视图切换 + 防止重复 commit)
   *  - 'idle': 无动画
   *  - 'running': prepare 已完成,动画播放中(等待 t=3s commit)
   *  - 'committed': commit 已执行(t=3~5s 旧轨道渐隐中)
   *  - 'done': 动画结束,可弹出成功窗口 */
  maneuverAnimationPhase: 'idle' | 'running' | 'committed' | 'done';
}

export interface TreaMissionActions {
  /** 初始化(重置为初始状态并计算轨道参数) */
  initialize: () => void;
  /** 更新遥测缓存:根据给定时间传播 TLE,记录位置/速度 */
  updateTelemetry: (time: Date) => void;
  /** 执行机动:替换 TLE、扣除燃料、记录历史 */
  executeManeuver: (deltaV: number, newTle: TLEData, fuelCost: number) => void;
  /** 设置/清除虚拟任务轨道 TLE
   * - 设置后:卫星渲染与位置传播使用 missionOrbitTle
   * - 清除(null):回退到原 TLE,卫星「返回原轨道」 */
  setMissionOrbitTle: (tle: TLEData | null) => void;
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
  /** 生成躲避计划列表(3 个选项:沿迹微调/径向机动/组合机动) */
  generateAvoidancePlans: () => void;
  /** 准备避撞机动:计算新 TLE 并暂存到 lastAvoidanceExecution,启动动画阶段
   *  不更新 tle/fuel/maneuverHistory(留给 commitAvoidanceManeuver 在动画 t=3s 时执行) */
  prepareAvoidanceManeuver: (planId: string) => void;
  /** 准备手动变轨(ManeuverPanel):用已算好的 newTle 暂存到 lastAvoidanceExecution,
   *  启动 5s 动画;tle/fuel/历史在 t=3s 由 commitAvoidanceManeuver 提交,卫星延迟切换 */
  prepareManeuver: (newTle: TLEData, deltaV: number, fuelCost: number) => void;
  /** 提交避撞机动:用暂存数据更新 tle/fuel/maneuverHistory(幂等,仅 'running' 时生效) */
  commitAvoidanceManeuver: () => void;
  /** 设置变轨动画阶段 */
  setManeuverAnimationPhase: (phase: 'idle' | 'running' | 'committed' | 'done') => void;
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
  missionOrbitTle: null,
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
  avoidancePlans: [],
  lastAvoidanceExecution: null,
  maneuverAnimationPhase: 'idle',

  // ---------- Actions ----------

  initialize: () => {
    const init = getTrea01InitialState();
    set({
      tle: init.tle,
      missionOrbitTle: null,
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
      avoidancePlans: [],
      lastAvoidanceExecution: null,
      maneuverAnimationPhase: 'idle',
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

  setMissionOrbitTle: (tle) => {
    set({ missionOrbitTle: tle ? { ...tle } : null });
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

    // 自动生成虚拟任务轨道 TLE(任务期间卫星跳转到 AOI 上空)
    const { tle } = get();
    let missionOrbitTle: TLEData | null = null;
    if (task.windowStart && task.aoiId) {
      const aoi = AOI_LIST.find(a => a.id === task.aoiId);
      if (aoi) {
        const result = generateMissionTle(tle, aoi, task.windowStart);
        missionOrbitTle = result.tle;
        if (!result.tle) {
          console.warn('[treaMissionStore] 虚拟轨道生成失败,使用原 TLE:', result.error);
        }
      }
    }

    set({
      currentTask: task,
      missionPhase: 'EXECUTING',
      taskStartTime: new Date(),
      lastReport: null, // 清空上一次报告
      missionOrbitTle, // 设置虚拟 TLE(失败时为 null,回退到原 TLE)
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
      missionOrbitTle: null, // 任务完成,清除虚拟 TLE,卫星回到原轨道
    });
  },

  reset: () => {
    get().initialize();
  },

  setTrea01Tracking: (tracking) => {
    set({ trea01Tracking: tracking });
  },

  // 触发碰撞警报:模拟太空碎片接近事件
  // 碎片名称固定为 Unknown-011(贴近现实的不明碎片预警)
  // 生成 TCA(最近接近时刻)在 40-60 分钟后的警报,距离 < 1km(高风险)
  triggerCollisionAlert: () => {
    const debrisName = 'Unknown-011';
    const debrisNoradId = 90011 + Math.floor(Math.random() * 99);
    const tca = new Date(Date.now() + (40 + Math.random() * 20) * 60_000); // 40-60 分钟后
    const alert: CollisionAlert = {
      debrisName,
      debrisNoradId,
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
    // 关闭警报:清除躲避计划 + 重置变轨动画状态(用户已看完成功画面,数据不再需要)
    set({
      collisionAlert: null,
      avoidancePlans: [],
      maneuverAnimationPhase: 'idle',
      lastAvoidanceExecution: null,
    });
  },

  setEmergencyTask: (task) => {
    set({ emergencyTask: task });
  },

  // 生成躲避计划列表(3 个选项,贴近真实避撞机动策略)
  // 方案A:沿迹微调(最小燃料,沿轨道方向加速,轻微改变周期)
  // 方案B:径向机动(中等燃料,垂直轨道方向,效果显著)
  // 方案C:组合机动(最大燃料,沿迹+径向组合,最保守)
  generateAvoidancePlans: () => {
    const plans: CollisionAvoidancePlan[] = [
      {
        id: 'plan-a-parallel',
        name: '方案 A · 沿迹微调',
        maneuverType: '沿迹方向加速 (Along-track)',
        deltaV: 0.03,
        executeMinutesBeforeTca: 30,
        fuelCost: 0.2,
        missDistanceAfter: 5.2,
        probabilityAfter: 0.001,
        riskLevel: 'low',
        meanMotionDelta: 0.00001, // rev/day, 增大平均运动(周期变短)
        riskColor: 'green',
        description: '沿轨道方向施加微小速度增量,轻微改变轨道周期。燃料消耗最低,机动后预测距离 > 5km,残余风险低。',
      },
      {
        id: 'plan-b-radial',
        name: '方案 B · 径向机动',
        maneuverType: '径向方向机动 (Radial)',
        deltaV: 0.08,
        executeMinutesBeforeTca: 20,
        fuelCost: 0.6,
        missDistanceAfter: 12.5,
        probabilityAfter: 0.0001,
        riskLevel: 'low',
        meanMotionDelta: -0.00002, // 径向机动主要通过改变偏心率,这里用平均运动近似
        riskColor: 'green',
        description: '垂直轨道方向施加径向速度增量,改变轨道偏心率。机动后预测距离 > 12km,残余风险极低。',
      },
      {
        id: 'plan-c-combined',
        name: '方案 C · 组合机动',
        maneuverType: '沿迹 + 径向组合 (Combined)',
        deltaV: 0.15,
        executeMinutesBeforeTca: 25,
        fuelCost: 1.2,
        missDistanceAfter: 25.8,
        probabilityAfter: 0.00001,
        riskLevel: 'low',
        meanMotionDelta: 0.00003,
        riskColor: 'green',
        description: '同时施加沿迹和径向速度增量,组合机动效果最显著。机动后预测距离 > 25km,残余风险近零。燃料消耗较高。',
      },
    ];
    set({ avoidancePlans: plans });
  },

  // 准备避撞机动:计算新 TLE 并暂存到 lastAvoidanceExecution,启动动画阶段
  // 不更新 tle/fuel/maneuverHistory(留给 commitAvoidanceManeuver 在动画 t=3s 时执行)
  // 这样卫星在动画 t=0~3s 仍在原轨道运行,t=3s commit 后才切到新轨道
  prepareAvoidanceManeuver: (planId) => {
    const { avoidancePlans, tle, fuel, maneuverAnimationPhase } = get();
    // 幂等:动画进行中不重复 prepare(防止重复触发)
    if (maneuverAnimationPhase === 'running' || maneuverAnimationPhase === 'committed') return;
    const plan = avoidancePlans.find(p => p.id === planId);
    if (!plan) return;

    // 保存旧 TLE(用于 maneuverEvent 新旧轨道对比)
    const oldTle = { ...tle };

    // 生成新 TLE:调整 line2 中的平均运动字段(列 53-63, 0-indexed 52-62, 11 字符)
    // 平均运动格式: "xxxx.xxxxxxx"
    // meanMotionDelta 为正 -> 平均运动增大(周期变短,轨道降低)
    const line2 = tle.line2;
    const meanMotionStr = line2.substring(52, 63);
    const meanMotion = parseFloat(meanMotionStr);
    const newMeanMotion = meanMotion + plan.meanMotionDelta;
    // 保留原格式(11 字符,5 位整数 + . + 7 位小数)
    const newMeanMotionStr = newMeanMotion.toFixed(7).padStart(11, ' ').substring(0, 11);
    const newLine2 = line2.substring(0, 52) + newMeanMotionStr + line2.substring(63);

    // 同步更新 line1 的历元(模拟机动后重新测定轨道)
    // 历元字段位置:列 19-32(0-indexed 18-31)
    const now = new Date();
    const year = now.getUTCFullYear() % 100;
    const dayOfYear = Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400000);
    const fractionOfDay = ((now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds()) / 86400).toFixed(8).substring(2);
    const newEpoch = `${year.toString().padStart(2, '0')}${dayOfYear.toString().padStart(3, '0')}.${fractionOfDay}`;
    const newLine1 = tle.line1.substring(0, 18) + newEpoch.padEnd(14, '0').substring(0, 14) + tle.line1.substring(32);

    const newTle: TLEData = {
      ...tle,
      line1: newLine1,
      line2: newLine2,
    };

    // 暂存 commit 所需数据(避免 commit 重复计算,保证一致性)
    const newFuel = Math.max(0, fuel - plan.fuelCost);
    const newOrbitParams = computeOrbitParams(newTle);
    const record: ManeuverRecord = {
      time: new Date(),
      deltaV: plan.deltaV,
      oldLine1: oldTle.line1,
      newLine1: newTle.line1,
      fuelCost: plan.fuelCost,
      note: `避撞机动 [${plan.name}] Δv=${plan.deltaV.toFixed(2)} m/s, 燃料 ${plan.fuelCost.toFixed(2)}%`,
    };

    set({
      // 设置 lastAvoidanceExecution(含暂存数据) -> 触发 HomePage maneuverEvent -> CesiumGlobe 启动动画
      lastAvoidanceExecution: {
        planId: plan.id,
        planName: plan.name,
        oldTle,
        newTle,
        deltaV: plan.deltaV,
        fuelCost: plan.fuelCost,
        id: Date.now(),
        newFuel,
        newOrbitParams,
        record,
      },
      maneuverAnimationPhase: 'running',
      // 清除虚拟轨道,强制 activeTle 回退到 treaTle(原轨道),保证动画期间卫星在原轨道
      missionOrbitTle: null,
      // 紧急任务已处理
      emergencyTask: null,
    });
  },

  // 准备手动变轨(ManeuverPanel):与避撞共用 commit/done 动画流程
  // newTle 已由 suggestManeuver 算好,这里只做暂存 + 启动动画
  // t=3s 由 commitAvoidanceManeuver 提交(tle/fuel/历史),t=5s onDone 置 'done'
  prepareManeuver: (newTle, deltaV, fuelCost) => {
    const { tle, fuel, maneuverAnimationPhase } = get();
    // 幂等:动画进行中不重复 prepare(防止连点)
    if (maneuverAnimationPhase === 'running' || maneuverAnimationPhase === 'committed') return;

    const oldTle = { ...tle };
    const newFuel = Math.max(0, fuel - fuelCost);
    const newOrbitParams = computeOrbitParams(newTle);
    const record: ManeuverRecord = {
      time: new Date(),
      deltaV,
      oldLine1: oldTle.line1,
      newLine1: newTle.line1,
      fuelCost,
      note: `手动变轨 Δv=${deltaV.toFixed(2)} m/s, 燃料消耗 ${fuelCost.toFixed(2)}%`,
    };

    set({
      lastAvoidanceExecution: {
        planId: 'manual',
        planName: '手动变轨',
        oldTle,
        newTle,
        deltaV,
        fuelCost,
        id: Date.now(),
        newFuel,
        newOrbitParams,
        record,
      },
      maneuverAnimationPhase: 'running',
      // 清除虚拟轨道,动画期间 activeTle 回退到 treaTle(原轨道),t=3s commit 后才切新轨道
      missionOrbitTle: null,
    });
  },

  // 提交避撞机动:在动画 t=3s 时由 CesiumGlobe onSwitch 回调触发
  // 用 prepare 暂存的数据更新 tle/fuel/orbitParams/maneuverHistory -> 卫星切到新轨道
  commitAvoidanceManeuver: () => {
    const { lastAvoidanceExecution, maneuverAnimationPhase } = get();
    // 幂等守卫:仅在 'running' 时 commit(防止 StrictMode 双跑等重复触发)
    if (maneuverAnimationPhase !== 'running' || !lastAvoidanceExecution) return;
    const { newTle, newFuel, newOrbitParams, record } = lastAvoidanceExecution;
    if (!newTle || newFuel === undefined || !record) return;
    set({
      tle: { ...newTle },
      fuel: newFuel,
      orbitParams: newOrbitParams ?? null,
      maneuverHistory: [...get().maneuverHistory, record],
      maneuverAnimationPhase: 'committed',
    });
  },

  // 设置变轨动画阶段(供 CesiumGlobe onDone 设 'done',CollisionAlertModal 重置 'idle')
  setManeuverAnimationPhase: (phase) => {
    set({ maneuverAnimationPhase: phase });
  },
}));

// ============================================================
// 便捷 Selector Hooks(参考 satelliteStore 模式)
// ============================================================

export const useTreaTle = () => useTreaMissionStore(state => state.tle);
export const useTreaMissionOrbitTle = () => useTreaMissionStore(state => state.missionOrbitTle);
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
export const useAvoidancePlans = () => useTreaMissionStore(state => state.avoidancePlans);
export const useLastAvoidanceExecution = () => useTreaMissionStore(state => state.lastAvoidanceExecution);
export const useManeuverAnimationPhase = () => useTreaMissionStore(state => state.maneuverAnimationPhase);

// 重新导出常量,方便调用方一站式引用
export { TREA01_INITIAL_TLE };
// 重新导出 M4 报告类型,方便调用方一站式引用
export type { MissionResult, MissionReport };
