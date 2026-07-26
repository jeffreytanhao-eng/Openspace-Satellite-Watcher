// TREA-01 任务报告生成模块(M4 / Task 13)
// ------------------------------------------------------------
// 纯函数模块,提供任务执行结果(MissionResult)到展示报告(MissionReport)的转换
// 包含:
//   1. MissionResult / MissionReport 接口定义
//   2. generateReport(result): 组装报告数据
//   3. 结论模板库(5 段,按覆盖率/燃料/云量场景选用)
//   4. generateMockImage(seed): SVG 伪彩色遥感影像占位图(data URI)
//
// 不依赖 React,可被任意 Store / 组件 / 测试脚本调用

import type { AttitudeMode, PayloadStatus } from '@/lib/trea/constants';

// ============================================================
// 1. 类型定义
// ============================================================

/**
 * 任务执行结果(由任务状态机在成像窗口结束时收集)
 * 描述一次过境成像任务的客观执行数据
 */
export interface MissionResult {
  /** 任务 ID(与 TreaMissionTask.id 一致) */
  taskId: string;
  /** 目标 AOI ID(aoi-a / aoi-b,用于选择 mock 影像) */
  aoiId: string;
  /** 目标 AOI 名称 */
  aoiName: string;
  /** 目标 AOI 中心坐标 */
  aoiCenter: { lat: number; lon: number };
  /** 实际过境窗口开始时间 */
  windowStart: Date;
  /** 实际过境窗口结束时间 */
  windowEnd: Date;
  /** 成像持续时间(秒) */
  duration: number;
  /** 目标区域覆盖率(0-100) */
  coveragePercent: number;
  /** 有效成像面积(km²) */
  imagingAreaKm2: number;
  /** 本次任务燃料消耗(百分比) */
  fuelConsumed: number;
  /** 任务结束后剩余燃料(百分比) */
  finalFuel: number;
  /** 任务结束后卫星状态快照 */
  satelliteState: {
    fuel: number;
    battery: number;
    attitude: AttitudeMode;
    payloadStatus: PayloadStatus;
  };
  /** 成像足迹采样点序列(星下点经纬度) */
  footprintPoints: Array<{ lat: number; lon: number }>;
}

/**
 * 展示用任务报告(由 generateReport 从 MissionResult 组装)
 * 供 MissionReportModal 直接渲染
 */
export interface MissionReport {
  /** 报告标题 */
  reportTitle: string;
  /** 任务编号 */
  missionId: string;
  /** 报告生成时间 */
  execTime: Date;
  /** 卫星名称 */
  satelliteName: string;
  /** 目标区域名称 */
  targetArea: string;
  /** 目标区域中心坐标 */
  targetCoord: { lat: number; lon: number };
  /** 实际过境窗口 */
  actualWindow: { start: Date; end: Date };
  /** 目标区域覆盖率(0-100) */
  coveragePercent: number;
  /** 有效成像面积(km²) */
  imagingArea: number;
  /** 传感器类型 */
  sensorType: string;
  /** 成像模式 */
  imagingMode: string;
  /** 燃料消耗(百分比) */
  fuelConsumed: number;
  /** 任务结束后卫星最终状态 */
  finalState: {
    fuel: number;
    battery: number;
    attitude: AttitudeMode;
    payloadStatus: PayloadStatus;
  };
  /** 结论与建议文本 */
  conclusion: string;
  /** 仿真声明标签 */
  simOnlyLabel: string;
  /** 伪彩色遥感影像占位图 data URI */
  mockImageUrl: string;
}

// ============================================================
// 2. 结论模板库(5 段,按覆盖率/燃料/云量场景选用)
// ============================================================

/** 结论模板上下文(用于选用与填充) */
interface ConclusionContext {
  coveragePercent: number;
  fuelConsumed: number;
  finalFuel: number;
}

/**
 * 5 段预置结论模板,按场景选用:
 * 0 - 高覆盖率,正常燃料(优良场景)
 * 1 - 低覆盖率(覆盖不足)
 * 2 - 高燃料消耗(燃料告警)
 * 3 - 云量影响(质量存疑)
 * 4 - 边缘覆盖率(可用但需补充)
 */
const CONCLUSION_TEMPLATES: Array<(ctx: ConclusionContext) => string> = [
  // 模板 0:高覆盖率,正常燃料
  (ctx) =>
    `本次任务执行顺利,目标区域覆盖率达 ${ctx.coveragePercent.toFixed(1)}%,` +
    `成像质量良好。机动与成像阶段燃料消耗 ${ctx.fuelConsumed.toFixed(2)}%,` +
    `剩余燃料 ${ctx.finalFuel.toFixed(1)}%,处于健康水平。` +
    `建议继续按当前轨道维持观测节奏,后续可考虑增加侧摆成像以拓展覆盖范围。`,

  // 模板 1:低覆盖率
  (ctx) =>
    `本次任务目标区域覆盖率为 ${ctx.coveragePercent.toFixed(1)}%,低于预期。` +
    `主要原因为过境窗口偏短及轨道几何条件受限。` +
    `燃料消耗 ${ctx.fuelConsumed.toFixed(2)}%,剩余 ${ctx.finalFuel.toFixed(1)}%。` +
    `建议规划下次过境时执行相位调整机动,优化覆盖几何,` +
    `或选择更高仰角的过境窗口提升成像效果。`,

  // 模板 2:高燃料消耗
  (ctx) =>
    `本次任务覆盖率 ${ctx.coveragePercent.toFixed(1)}%,达成本次观测目标。` +
    `但燃料消耗较大(${ctx.fuelConsumed.toFixed(2)}%),剩余燃料 ${ctx.finalFuel.toFixed(1)}%。` +
    `建议后续任务减少机动频次,优先使用自然过境窗口成像,` +
    `并将燃料预算留给必要的相位保持与避碰机动。`,

  // 模板 3:云量影响(模拟)
  (ctx) =>
    `本次过境覆盖率 ${ctx.coveragePercent.toFixed(1)}%,` +
    `根据气象预报目标区域存在局部云覆盖,可能影响光学影像质量。` +
    `燃料消耗 ${ctx.fuelConsumed.toFixed(2)}%,剩余 ${ctx.finalFuel.toFixed(1)}%。` +
    `建议结合 SAR 载荷或下次云量较低的窗口补充观测,` +
    `并叠加气象数据进行影像质量评估。`,

  // 模板 4:边缘覆盖率
  (ctx) =>
    `本次任务覆盖率为 ${ctx.coveragePercent.toFixed(1)}%,处于边缘可用水平。` +
    `燃料消耗 ${ctx.fuelConsumed.toFixed(2)}%,剩余 ${ctx.finalFuel.toFixed(1)}%。` +
    `建议在地面段对获取影像进行几何校正与辐射校正,` +
    `并优先验证目标区域关键地物的识别度,` +
    `必要时安排补充成像任务以提升整体覆盖完整性。`,
];

/**
 * 根据覆盖率和燃料消耗选用结论模板
 * 优先级:高燃料消耗 > 低覆盖率 > 边缘覆盖率 > 高覆盖率 > 云量场景(默认)
 */
function pickConclusionTemplate(ctx: ConclusionContext): string {
  // 高燃料消耗优先告警
  if (ctx.fuelConsumed > 5) {
    return CONCLUSION_TEMPLATES[2](ctx);
  }
  // 低覆盖率
  if (ctx.coveragePercent < 40) {
    return CONCLUSION_TEMPLATES[1](ctx);
  }
  // 边缘覆盖率
  if (ctx.coveragePercent < 70) {
    return CONCLUSION_TEMPLATES[4](ctx);
  }
  // 高覆盖率,正常
  if (ctx.coveragePercent >= 85) {
    return CONCLUSION_TEMPLATES[0](ctx);
  }
  // 默认:云量场景
  return CONCLUSION_TEMPLATES[3](ctx);
}

// ============================================================
// 3. SVG 伪彩色遥感影像占位图生成
// ============================================================

/**
 * 生成 SVG 伪彩色遥感影像占位图(data URI)
 * 模拟遥感影像:深色背景 + 渐变色块(植被绿/水体蓝/城市红/裸地黄)
 *              + 经纬网格 + 中心十字标 + 角落标注
 *
 * @param seed 种子字符串(用于生成确定性图案,同一 seed 生成同一图)
 * @returns data URI 字符串,可直接作为 <img src> 使用
 */
export function generateMockImage(seed: string): string {
  // 简单 hash 生成确定性的伪随机数(同一 seed 产生同一序列)
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const rng = (n: number) => {
    const x = Math.sin(hash + n) * 10000;
    return x - Math.floor(x);
  };

  // 生成 6 个色块(伪彩色:植被绿/水体蓝/城市红/裸地黄/阴影/混色)
  const blocks: string[] = [];
  const colors = ['#2d5a3d', '#1a4d6e', '#6e2d2d', '#6e5e2d', '#3d5a6e', '#2d6e4d'];
  for (let i = 0; i < 6; i++) {
    const x = (rng(i) * 100).toFixed(2);
    const y = (rng(i + 10) * 100).toFixed(2);
    const w = (20 + rng(i + 20) * 30).toFixed(2);
    const h = (20 + rng(i + 30) * 30).toFixed(2);
    const op = (0.4 + rng(i + 40) * 0.5).toFixed(2);
    blocks.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${colors[i]}" opacity="${op}"/>`
    );
  }

  // 经纬网格线(8×8)
  const gridLines: string[] = [];
  for (let i = 1; i < 8; i++) {
    const p = (i * 12.5).toFixed(2);
    gridLines.push(
      `<line x1="${p}" y1="0" x2="${p}" y2="100" stroke="#00ff88" stroke-width="0.2" opacity="0.3"/>`
    );
    gridLines.push(
      `<line x1="0" y1="${p}" x2="100" y2="${p}" stroke="#00ff88" stroke-width="0.2" opacity="0.3"/>`
    );
  }

  // 中心十字标(目标点)
  const crosshair = `
    <line x1="50" y1="45" x2="50" y2="55" stroke="#ffcc00" stroke-width="0.5"/>
    <line x1="45" y1="50" x2="55" y2="50" stroke="#ffcc00" stroke-width="0.5"/>
    <circle cx="50" cy="50" r="3" fill="none" stroke="#ffcc00" stroke-width="0.4"/>
  `;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0a1a2a"/>
        <stop offset="100%" stop-color="#1a2a3a"/>
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill="url(#bg)"/>
    ${blocks.join('\n    ')}
    ${gridLines.join('\n    ')}
    ${crosshair}
    <text x="2" y="6" font-family="monospace" font-size="3" fill="#00ff88">TREA-01 IMG</text>
    <text x="2" y="97" font-family="monospace" font-size="2.5" fill="#00ff88" opacity="0.7">SIM MOCK · ${escapeXml(seed)}</text>
  </svg>`;

  // 转 data URI(encodeURIComponent 处理特殊字符)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** XML 转义(用于 SVG 文本内容) */
function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

// ============================================================
// 4. 主函数:生成报告
// ============================================================

/**
 * 根据 MissionResult 组装 MissionReport
 * - 选用结论模板(按覆盖率/燃料消耗)
 * - 生成伪彩色影像占位图(以 taskId 为种子,确定性)
 * - 填充传感器类型/成像模式等固定字段
 *
 * @param result 任务执行结果
 * @returns 展示用任务报告
 */
export function generateReport(result: MissionResult): MissionReport {
  const conclusion = pickConclusionTemplate({
    coveragePercent: result.coveragePercent,
    fuelConsumed: result.fuelConsumed,
    finalFuel: result.finalFuel,
  });

  // Mock 影像:按 AOI 选择静态图片,无匹配时回退到 SVG 占位图
  const mockImageUrl = result.aoiId === 'aoi-a'
    ? '/trea/mock-aoi-a.jpg'
    : result.aoiId === 'aoi-b'
      ? '/trea/mock-aoi-b.jpg'
      : generateMockImage(result.taskId);

  return {
    reportTitle: 'TREA-01 遥感任务执行报告',
    missionId: result.taskId,
    execTime: new Date(),
    satelliteName: 'TREA-01',
    targetArea: result.aoiName,
    targetCoord: { ...result.aoiCenter },
    actualWindow: {
      start: new Date(result.windowStart),
      end: new Date(result.windowEnd),
    },
    coveragePercent: result.coveragePercent,
    imagingArea: result.imagingAreaKm2,
    sensorType: '光学推扫式相机',
    imagingMode: '推扫成像',
    fuelConsumed: result.fuelConsumed,
    finalState: {
      fuel: result.satelliteState.fuel,
      battery: result.satelliteState.battery,
      attitude: result.satelliteState.attitude,
      payloadStatus: result.satelliteState.payloadStatus,
    },
    conclusion,
    simOnlyLabel: 'SIMULATION ONLY / 本报告为仿真生成,仅供演示',
    mockImageUrl,
  };
}
