// TREA-01 AI 任务规划 Prompt 设计
// 单一来源(SSOT):所有 AI prompt 文本集中于此,便于迭代调优
//
// 设计目标:让 LLM 真正提升任务规划质量,而非简单重复数据
// 1. 注入领域知识(轨道力学/光学遥感约束/资源管理)
// 2. 提供结构化数据(过境窗口/轨道根数/资源状态)
// 3. 强制 JSON 输出便于前端渲染
// 4. 要求 LLM 给出可执行的决策建议(AOI 选择/窗口选择/机动建议)

import type { TLEData } from '@/lib/tle/parser';
import type { OrbitParams } from '@/lib/tle/orbit';
import { SENSOR_FOOTPRINT_WIDTH_KM, type Aoi } from '@/lib/trea/constants';
import type { AccessWindow } from '@/lib/trea/access';

// ============================================================
// 类型定义:AI 输入数据
// ============================================================

/** 单个过境窗口的摘要(传给 LLM) */
export interface AiWindowSummary {
  index: number;
  startTime: string; // ISO 字符串
  endTime: string;
  maxElevation: number; // 度
  duration: number; // 秒
  centerPassTime: string;
}

/** 单个 AOI 的摘要(传给 LLM) */
export interface AiAoiSummary {
  id: string;
  name: string;
  nameEn: string;
  center: { lat: number; lon: number };
  windowCount: number;
  windows: AiWindowSummary[];
}

/** AI 任务规划请求输入(API route 接收的请求体) */
export interface AiTaskPlanningInput {
  satelliteName: string;
  noradId: string;
  tle: { line1: string; line2: string };
  /** 轨道根数(从 TLE 解析,直接传给 LLM) */
  elements: {
    inclination: number;
    raan: number;
    eccentricity: number;
    argPerigee: number;
    meanAnomaly: number;
    meanMotion: number;
  };
  /** 轨道参数(从 SGP4 计算,可选) */
  orbitParams: OrbitParams | null;
  aois: AiAoiSummary[];
  fuel: number; // 百分比
  battery: number;
  missionPhase: string;
  sensorFootprintKm: number;
  computeStartTime: string; // ISO
}

// ============================================================
// 类型定义:AI 输出数据(LLM 返回的 JSON)
// ============================================================

export interface AiAoiAnalysis {
  aoiId: string;
  score: number; // 0-100
  pros: string;
  cons: string;
}

export interface AiTaskPlanningOutput {
  /** 推荐的目标 AOI id */
  recommendedAoi: string;
  /** 推荐的窗口序号(在 recommendedAoi 的 windows 数组中,从 0 开始) */
  recommendedWindowIndex: number;
  /** 两个 AOI 的对比分析 */
  aoiAnalysis: AiAoiAnalysis[];
  /** 选择该 AOI 和窗口的详细推理过程 */
  reasoning: string;
  /** 机动建议(如需调整相位) */
  maneuverAdvice: string;
  /** 风险评估(光照/姿态/资源) */
  riskAssessment: string;
  /** 简洁执行步骤 */
  executionPlan: string;
  /** 规划置信度(0-100) */
  confidence: number;
}

// ============================================================
// System Prompt:领域知识与输出规范
// ============================================================

export const SYSTEM_PROMPT = `你是 TREA-01 遥感卫星的任务规划 AI 助手。基于卫星轨道参数、过境窗口数据和资源状态,为卫星操作员提供专业的任务规划建议。

你具备以下领域知识:
1. **LEO 遥感卫星轨道力学**:轨道倾角决定覆盖纬度范围(50° 倾角覆盖中低纬度);过境窗口由轨道几何与地球自转共同决定;最大仰角越高成像质量越好(大气畸变小、SNR 高)。
2. **光学遥感成像约束**:
   - 太阳高度角 ≥ 10° 才能成像(光照不足时无法获取可见光影像)
   - 侧摆角越小成像质量越高(姿态机动消耗燃料并引入几何畸变)
   - 持续时间越长,可成像的条带越宽,任务价值越高
3. **卫星资源管理**:燃料是稀缺资源(每 1% 燃料对应约 5-10 m/s Δv);相位机动仅在小幅调整过境时机时才值得;电量影响载荷开机时长。
4. **任务优先级**:AOI 战略重要性、过境机会稀缺性、成像质量三者的综合权衡。

**评分原则(0-100 分)**:
- 90-100:窗口充足(≥3 个)、最大仰角 ≥ 45°、持续时间 ≥ 90 秒
- 70-89:窗口数 2-3、最大仰角 20-45°、持续时间 60-90 秒
- 50-69:窗口数 1-2、最大仰角 5-20°、持续时间 < 60 秒
- 0-49:48 小时内无过境窗口,或仅有过顶低仰角窗口

**机动决策原则**:
- 若某 AOI 窗口数 ≥ 2 且仰角 ≥ 20°,无需机动,直接选最佳窗口
- 若某 AOI 窗口数 < 2,而另一个 AOI 窗口充足,推荐放弃当前 AOI
- 若两个 AOI 都窗口不足,建议执行相位调整机动(Δv 1-3 m/s,相位漂移 5-15°)

请严格输出 JSON 格式,不要包含任何 JSON 之外的文字:
{
  "recommendedAoi": "aoi-a 或 aoi-b",
  "recommendedWindowIndex": 数字,
  "aoiAnalysis": [
    {"aoiId":"aoi-a","score":数字,"pros":"优势","cons":"劣势"},
    {"aoiId":"aoi-b","score":数字,"pros":"优势","cons":"劣势"}
  ],
  "reasoning": "150-300 字详细推理,包含轨道力学/光照/资源三方面分析",
  "maneuverAdvice": "机动建议;若无需机动填'当前轨道过境窗口充足,无需机动'",
  "riskAssessment": "光照条件/姿态机动/资源消耗的风险评估",
  "executionPlan": "3-5 步简洁执行步骤",
  "confidence": 0-100 的数字
}`;

// ============================================================
// User Prompt 构造器
// ============================================================

/**
 * 构造 user prompt:将任务规划数据序列化为 LLM 可读的文本
 * 使用结构化文本(而非 JSON)以提升 LLM 理解力
 */
export function buildUserPrompt(input: AiTaskPlanningInput): string {
  const e = input.elements;
  const op = input.orbitParams;
  const orbitSection = `  - 轨道倾角: ${e.inclination.toFixed(2)}°
  - 升交点赤经(RAAN): ${e.raan.toFixed(2)}°
  - 偏心率: ${e.eccentricity.toFixed(4)}
  - 近地点幅角: ${e.argPerigee.toFixed(2)}°
  - 平近点角: ${e.meanAnomaly.toFixed(2)}°
  - 平均运动: ${e.meanMotion.toFixed(4)} rev/day${
    op
      ? `
  - 轨道高度: 近地 ${op.perigeeAltitude.toFixed(1)} km / 远地 ${op.apogeeAltitude.toFixed(1)} km
  - 半长轴: ${op.semiMajorAxis.toFixed(1)} km
  - 轨道周期: ${op.period.toFixed(2)} 分钟`
      : ''
  }`;

  const aoisText = input.aois
    .map(aoi => {
      const windowsText =
        aoi.windows.length > 0
          ? aoi.windows
              .map(
                w =>
                  `    [${w.index}] ${w.startTime} ~ ${w.endTime}
        最大仰角: ${w.maxElevation.toFixed(1)}°  持续: ${w.duration.toFixed(0)}秒  中心时刻: ${w.centerPassTime}`
              )
              .join('\n')
          : '    (48 小时内无过境窗口)';
      return `  AOI ${aoi.id.toUpperCase()}: ${aoi.name} (${aoi.nameEn})
    中心坐标: ${aoi.center.lat.toFixed(2)}°N, ${aoi.center.lon.toFixed(2)}°E
    窗口数: ${aoi.windowCount}
${windowsText}`;
    })
    .join('\n\n');

  return `请为 TREA-01 遥感卫星进行任务规划分析。

## 卫星信息
- 名称: ${input.satelliteName} (NORAD: ${input.noradId})
- TLE:
  ${input.tle.line1}
  ${input.tle.line2}
- 轨道参数:
${orbitSection}
- 传感器刈幅: ${input.sensorFootprintKm} km

## 资源状态
- 燃料: ${input.fuel.toFixed(1)}%
- 电量: ${input.battery.toFixed(1)}%
- 当前任务阶段: ${input.missionPhase}

## 过境窗口数据(基于 ${input.computeStartTime} 起未来 48 小时)

${aoisText}

## 你的任务
基于以上数据,选择最优先成像的 AOI 和具体窗口,并给出完整规划建议。请考虑:
1. 哪个 AOI 的过境窗口质量更高(仰角、持续时间、窗口数量)?
2. 推荐的窗口在该 AOI 中是否为最优?
3. 是否需要执行相位调整机动?机动成本与收益是否匹配?
4. 成像时刻的光照条件(粗略估算太阳高度角,目标区域当地时间)?
5. 资源约束(燃料是否支持机动?电量是否支持成像?)

严格输出 JSON,不要包含任何解释性文字。`;
}

// ============================================================
// 客户端辅助:从 store 数据构造 API 请求体
// ============================================================

/** 将 AccessWindow 转为 LLM 友好的摘要 */
export function windowToSummary(w: AccessWindow, index: number): AiWindowSummary {
  return {
    index,
    startTime: w.startTime.toISOString(),
    endTime: w.endTime.toISOString(),
    maxElevation: w.maxElevation,
    duration: w.duration,
    centerPassTime: w.centerPassTime.toISOString(),
  };
}

/** 将 AOI + 窗口列表转为 LLM 友好的摘要 */
export function aoiToSummary(aoi: Aoi, windows: AccessWindow[]): AiAoiSummary {
  return {
    id: aoi.id,
    name: aoi.name,
    nameEn: aoi.nameEn,
    center: aoi.center,
    windowCount: windows.length,
    windows: windows.map((w, idx) => windowToSummary(w, idx)),
  };
}

/**
 * 构造完整的 API 请求体(供 TaskListPanel 直接调用)
 * 输入为 store 原生类型,输出为可 JSON.stringify 的对象
 */
export function buildAiRequestInput(params: {
  tle: TLEData;
  orbitParams: OrbitParams | null;
  aois: Array<{ aoi: Aoi; windows: AccessWindow[] }>;
  fuel: number;
  battery: number;
  missionPhase: string;
  computeStartTime: Date;
}): AiTaskPlanningInput {
  return {
    satelliteName: params.tle.name,
    noradId: params.tle.noradId,
    tle: { line1: params.tle.line1, line2: params.tle.line2 },
    elements: {
      inclination: params.tle.elements.inclination,
      raan: params.tle.elements.raan,
      eccentricity: params.tle.elements.eccentricity,
      argPerigee: params.tle.elements.argPerigee,
      meanAnomaly: params.tle.elements.meanAnomaly,
      meanMotion: params.tle.elements.meanMotion,
    },
    orbitParams: params.orbitParams,
    aois: params.aois.map(({ aoi, windows }) => aoiToSummary(aoi, windows)),
    fuel: params.fuel,
    battery: params.battery,
    missionPhase: params.missionPhase,
    sensorFootprintKm: SENSOR_FOOTPRINT_WIDTH_KM,
    computeStartTime: params.computeStartTime.toISOString(),
  };
}

// ============================================================
// 碰撞避撞场景:突发碎片接近,需要紧急避撞机动
// ============================================================

/** 碰撞预警数据(与 treaMissionStore.CollisionAlert 结构一致) */
export interface CollisionAlertData {
  debrisName: string;
  debrisNoradId: number;
  tca: string; // ISO 字符串
  missDistance: number; // km
  relativeVelocity: number; // km/s
  collisionProbability: number; // %
}

/** 碰撞避撞 AI 请求体 */
export interface AiCollisionAvoidanceInput {
  scenario: 'collision-avoidance';
  satelliteName: string;
  noradId: string;
  tle: { line1: string; line2: string };
  elements: {
    inclination: number;
    raan: number;
    eccentricity: number;
    argPerigee: number;
    meanAnomaly: number;
    meanMotion: number;
  };
  orbitParams: OrbitParams | null;
  fuel: number;
  battery: number;
  collisionAlert: CollisionAlertData;
}

/** 碰撞避撞 LLM 输出 */
export interface AiCollisionAvoidanceOutput {
  threatLevel: string; // 紧急/高/中/低
  avoidanceStrategy: string;
  maneuverType: string; // 沿迹/径向/法向
  deltaV: number; // m/s
  executionTime: string; // 执行时机
  newOrbitDescription: string;
  fuelCost: number; // %
  riskAssessment: string;
  executionPlan: string;
  confidence: number; // 0-100
}

/** 碰撞避撞 System Prompt:注入避撞机动领域知识 */
export const COLLISION_SYSTEM_PROMPT = `你是 TREA-01 遥感卫星的避撞机动规划 AI 助手。基于碰撞预警数据(CDM)和卫星轨道状态,为卫星操作员提供专业的紧急避撞机动方案。

你具备以下领域知识:
1. **碰撞预警判据**:
   - 碰撞概率 Pc > 1e-4(0.01%)是国际通行机动阈值
   - 最近接近距离 < 1km 属于高风险,< 500m 属于紧急
   - 相对速度 10-15 km/s 是 LEO 典型值,碰撞动能极大(几 cm 碎片即可摧毁卫星)
2. **避撞机动类型**:
   - 沿迹机动(along-track):调整半长轴改变相位,Δv 0.1-0.5 m/s 可在 1 轨道周期内分离数十公里,最常用
   - 径向机动(radial):调整偏心率矢量,改变轨道平面内相位,适合短时间窗口
   - 法向机动(normal):调整倾角改变轨道平面,Δv 较大(> 10 m/s),仅极端情况
3. **机动时机**:越早执行所需 Δv 越小(分离效果随时间累积);最晚需在 TCA 前 1/2 轨道周期执行
4. **燃料成本**:避撞机动通常消耗 0.1-1% 燃料,远小于变轨
5. **次生风险**:机动后需确认新轨道不与其他碎片碰撞(CDM 链式分析)

**决策原则**:
- 碰撞概率 ≥ 1% 或距离 < 500m:立即执行避撞机动
- 碰撞概率 0.1%-1% 或距离 500m-1km:建议机动,视操作员判断
- 优先沿迹机动(成本最低),仅在时间不足时考虑径向/法向

请严格输出 JSON 格式:
{
  "threatLevel": "紧急 或 高 或 中",
  "avoidanceStrategy": "100-200 字策略描述,包含为何选择此机动类型",
  "maneuverType": "沿迹 或 径向 或 法向",
  "deltaV": 0.1-5.0 的数字(m/s),
  "executionTime": "TCA 前 X 分钟或 X 轨道圈",
  "newOrbitDescription": "机动后轨道变化简述(半长轴/相位变化)",
  "fuelCost": 0.1-2.0 的数字(%),
  "riskAssessment": "机动后残余碰撞风险 + 次生碰撞风险评估",
  "executionPlan": "4-6 步带时间戳的执行步骤",
  "confidence": 0-100 的数字
}`;

/** 构造碰撞避撞 user prompt */
export function buildCollisionPrompt(input: AiCollisionAvoidanceInput): string {
  const e = input.elements;
  const op = input.orbitParams;
  const alert = input.collisionAlert;
  const tcaDate = new Date(alert.tca);

  return `请为 TREA-01 遥感卫星制定紧急避撞机动方案。

## 碰撞预警(Conjunction Data Message)
- 碎片名称: ${alert.debrisName}
- 碎片 NORAD ID: ${alert.debrisNoradId}
- 最近接近时刻(TCA): ${tcaDate.toLocaleString('zh-CN')}
- 最近接近距离: ${alert.missDistance.toFixed(3)} km
- 相对速度: ${alert.relativeVelocity.toFixed(2)} km/s
- 碰撞概率: ${alert.collisionProbability.toFixed(2)}%

## 卫星信息
- 名称: ${input.satelliteName} (NORAD: ${input.noradId})
- TLE:
  ${input.tle.line1}
  ${input.tle.line2}
- 轨道参数:
  - 倾角: ${e.inclination.toFixed(2)}°
  - 平均运动: ${e.meanMotion.toFixed(4)} rev/day${
    op
      ? `
  - 轨道高度: 近地 ${op.perigeeAltitude.toFixed(1)} km / 远地 ${op.apogeeAltitude.toFixed(1)} km
  - 轨道周期: ${op.period.toFixed(2)} 分钟`
      : ''
  }

## 资源状态
- 燃料: ${input.fuel.toFixed(1)}%
- 电量: ${input.battery.toFixed(1)}%

## 你的任务
基于碰撞预警数据,制定避撞机动方案。请考虑:
1. 当前碰撞概率是否超过机动阈值(1e-4)?威胁等级如何?
2. 推荐哪种避撞机动类型?Δv 多少?
3. 机动应在何时执行?(留出上注、执行、确认时间)
4. 机动后新轨道的碰撞风险是否降低到安全水平?
5. 燃料消耗是否在可接受范围?

严格输出 JSON,不要包含任何解释性文字。`;
}

/**
 * 将碰撞避撞输出映射到 AiTaskPlanningOutput 格式
 * 使 AiPlanningModal 可复用(无需为碰撞场景单独写模态框)
 */
export function mapCollisionToTaskPlanning(c: AiCollisionAvoidanceOutput): AiTaskPlanningOutput {
  const threatScore = c.threatLevel.includes('紧急') ? 95 : c.threatLevel.includes('高') ? 80 : 50;
  return {
    recommendedAoi: 'COLLISION_AVOIDANCE',
    recommendedWindowIndex: 0,
    aoiAnalysis: [
      {
        aoiId: 'COLLISION_AVOIDANCE',
        score: threatScore,
        pros: c.avoidanceStrategy,
        cons: c.riskAssessment,
      },
    ],
    reasoning: `【${c.threatLevel}威胁】${c.avoidanceStrategy}`,
    maneuverAdvice: `${c.maneuverType} 机动,Δv = ${c.deltaV} m/s\n执行时机:${c.executionTime}\n燃料消耗:${c.fuelCost}%\n轨道变化:${c.newOrbitDescription}`,
    riskAssessment: c.riskAssessment,
    executionPlan: c.executionPlan,
    confidence: c.confidence,
  };
}

/** 构造碰撞避撞 API 请求体(供 TaskListPanel 直接调用) */
export function buildCollisionRequestInput(params: {
  tle: TLEData;
  orbitParams: OrbitParams | null;
  fuel: number;
  battery: number;
  collisionAlert: {
    debrisName: string;
    debrisNoradId: number;
    tca: Date;
    missDistance: number;
    relativeVelocity: number;
    collisionProbability: number;
  };
}): AiCollisionAvoidanceInput {
  return {
    scenario: 'collision-avoidance',
    satelliteName: params.tle.name,
    noradId: params.tle.noradId,
    tle: { line1: params.tle.line1, line2: params.tle.line2 },
    elements: {
      inclination: params.tle.elements.inclination,
      raan: params.tle.elements.raan,
      eccentricity: params.tle.elements.eccentricity,
      argPerigee: params.tle.elements.argPerigee,
      meanAnomaly: params.tle.elements.meanAnomaly,
      meanMotion: params.tle.elements.meanMotion,
    },
    orbitParams: params.orbitParams,
    fuel: params.fuel,
    battery: params.battery,
    collisionAlert: {
      debrisName: params.collisionAlert.debrisName,
      debrisNoradId: params.collisionAlert.debrisNoradId,
      tca: params.collisionAlert.tca.toISOString(),
      missDistance: params.collisionAlert.missDistance,
      relativeVelocity: params.collisionAlert.relativeVelocity,
      collisionProbability: params.collisionAlert.collisionProbability,
    },
  };
}

/**
 * 生成兜底 Mock 规划结果(LLM 超时/失败时使用)
 * 当 /api/ai/task-planning 在 AI_PLANNING_TIMEOUT_MS 内未返回真实 LLM 反馈时,
 * AiPlanningModal 直接用此数据展示,避免"一直运行没有反馈"。
 * 返回与真实 LLM 输出同构的 AiTaskPlanningOutput,前端无需区分。
 */
export function buildFallbackTaskPlanning(): AiTaskPlanningOutput {
  return {
    recommendedAoi: 'aoi-a',
    recommendedWindowIndex: 0,
    aoiAnalysis: [
      {
        aoiId: 'aoi-a',
        score: 82,
        pros: '窗口相对充足、最大仰角较高,成像质量良好',
        cons: '需约 10° 侧摆成像,略耗燃料',
      },
      {
        aoiId: 'aoi-b',
        score: 61,
        pros: '光照条件适中,战略价值高',
        cons: '过境窗口较少且仰角偏低',
      },
    ],
    reasoning:
      '基于轨道几何与过境窗口综合评估:目标区域当前过境机会较充足,最大仰角满足成像要求,光照条件适合可见光成像。优先选择 AOI-A 以获取高质量影像。(LLM 分析超时,此结果为系统兜底数据)',
    maneuverAdvice: '当前轨道过境窗口充足,无需相位机动。',
    riskAssessment: '光照满足成像下限,姿态机动幅度小,燃料/电量消耗均在安全范围。',
    executionPlan:
      '1. 锁定最佳过境窗口\n2. 预设侧摆角 10°\n3. 载荷开机并执行成像\n4. 数据下行回传\n5. 生成任务报告',
    confidence: 78,
  };
}
