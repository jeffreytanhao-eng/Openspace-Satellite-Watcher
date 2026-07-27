'use client';

// ============================================================
// TREA-01 遥感任务报告模态框 (M4 / Story 5.1 — v1.1 核心新增)
// ------------------------------------------------------------
// 任务完成后自动弹出,展示一份专业 mock 遥感报告。
// 数据来源:treaMissionStore.lastReport(由 generateReport 从 MissionResult 组装)
//
// 报告字段(规格 Story 5.1 强制要求):
//   - 报告标题 / 任务编号 / 执行时间 / 卫星名称
//   - 目标区域名称与中心坐标
//   - 过境窗口实际时间
//   - 覆盖率(百分比) + 有效成像面积
//   - 传感器类型与成像模式
//   - 燃料消耗与卫星最终状态
//   - 简要结论与建议
//   - mock 影像占位图
//   - 「SIMULATION ONLY / 仿真生成」标注(底部醒目)
//
// 风格:深色专业文档,不透明背景(用户偏好),关键数据大号数字+进度条可视化
// ============================================================

import {
  X, Satellite, Target, Clock, MapPin, TrendingUp, Camera,
  Fuel, Battery, Gauge, Activity, FileText, AlertTriangle, Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MissionReport } from '@/lib/trea/report';
import type { AttitudeMode, PayloadStatus } from '@/lib/trea/constants';

// ============================================================
// 打印样式:仅打印报告模态框,隐藏背景与页面其他元素
// ============================================================
const PRINT_STYLE = `
@media print {
  body * { visibility: hidden !important; }
  .trea-report-print, .trea-report-print * { visibility: visible !important; }
  .trea-report-print {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    max-height: none !important;
    border: none !important;
    background: white !important;
    color: black !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .trea-report-print * {
    background: white !important;
    color: black !important;
    border-color: #ddd !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }
  .trea-report-print .trea-report-scroll { max-height: none !important; overflow: visible !important; }
  .trea-report-bg, .trea-report-footer-btns { display: none !important; }
}
`;

interface MissionReportModalProps {
  /** 任务报告数据(null 时不渲染) */
  report: MissionReport | null;
  /** 是否打开 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
}

// ============================================================
// 显示辅助
// ============================================================

/** 格式化日期为中文长格式(YYYY-MM-DD HH:mm:ss) */
function formatDateTime(date: Date): string {
  try {
    return date.toLocaleString('zh-CN', { hour12: false });
  } catch {
    return date.toISOString();
  }
}

/** 纬度格式化:数字 → "xx.xx°N/S" */
function formatLat(lat: number): string {
  const dir = lat >= 0 ? 'N' : 'S';
  return `${Math.abs(lat).toFixed(4)}° ${dir}`;
}

/** 经度格式化:数字 → "xx.xx°E/W" */
function formatLon(lon: number): string {
  const dir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lon).toFixed(4)}° ${dir}`;
}

/** 根据覆盖率返回颜色等级 */
function coverageColor(pct: number): { text: string; bar: string; glow: string } {
  if (pct >= 70) {
    return { text: 'text-emerald-400', bar: 'bg-emerald-400', glow: 'shadow-[0_0_20px_rgba(52,211,153,0.4)]' };
  }
  if (pct >= 40) {
    return { text: 'text-yellow-400', bar: 'bg-yellow-400', glow: 'shadow-[0_0_20px_rgba(250,204,21,0.4)]' };
  }
  return { text: 'text-red-400', bar: 'bg-red-400', glow: 'shadow-[0_0_20px_rgba(239,68,68,0.4)]' };
}

/** 燃料颜色分级 */
function fuelColor(pct: number): { text: string; bar: string } {
  if (pct > 50) return { text: 'text-emerald-400', bar: 'bg-emerald-400' };
  if (pct >= 20) return { text: 'text-yellow-400', bar: 'bg-yellow-400' };
  return { text: 'text-red-400', bar: 'bg-red-400' };
}

/** 姿态模式中文标签 */
const ATTITUDE_LABELS: Record<AttitudeMode, string> = {
  Nominal: '标称',
  Roll: '侧摆',
  Pitch: '俯仰',
  Yaw: '偏航',
};

/** 载荷状态中文标签 */
const PAYLOAD_LABELS: Record<PayloadStatus, string> = {
  STANDBY: '待机',
  IMAGING: '成像',
  OFF: '关闭',
};

// ============================================================
// 子组件:进度条
// ============================================================

interface ProgressBarProps {
  value: number; // 0-100
  barClass: string;
  glowClass?: string;
}

function ProgressBar({ value, barClass, glowClass = '' }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="w-full h-2 bg-space-800 rounded-full overflow-hidden">
      <div
        className={`h-full ${barClass} ${glowClass} rounded-full transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ============================================================
// 子组件:元数据项
// ============================================================

interface MetaItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}

function MetaItem({ icon, label, value, mono = false }: MetaItemProps) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-space-800/60 border border-space-700/60">
      <div className="text-cosmic-blue mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] text-space-500 uppercase tracking-wide">{label}</div>
        <div className={`text-sm text-space-100 leading-tight break-words ${mono ? 'font-mono' : ''}`}>
          {value}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================

export default function MissionReportModal({ report, isOpen, onClose }: MissionReportModalProps) {
  if (!isOpen || !report) return null;

  const cov = coverageColor(report.coveragePercent);
  const fuel = fuelColor(report.finalState.fuel);

  /** 导出报告:调用浏览器打印,在打印对话框中选择「另存为 PDF」即可存到本地 */
  const handleExport = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 打印样式注入(仅影响 @media print) */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLE }} />

      {/* 背景遮罩(深色不透明倾向,符合用户偏好;保留轻微透明度便于感知主视图) */}
      <div className="trea-report-bg absolute inset-0 bg-black/85" onClick={onClose} />

      {/* 模态框主体 */}
      <div className="trea-report-print relative w-full max-w-3xl mx-4 max-h-[92vh] bg-space-900 border border-cosmic-blue/30 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* ============================================================ */}
        {/* 头部:标题 + 任务编号 + 关闭按钮 */}
        {/* ============================================================ */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-space-700 bg-gradient-to-r from-space-900 to-space-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-cosmic-blue/20 border border-cosmic-blue/40 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-cosmic-blue" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-space-100 truncate">{report.reportTitle}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-space-800 border border-space-700 text-space-400 font-mono">
                  {report.missionId}
                </span>
                <span className="text-[11px] text-space-500">{report.satelliteName}</span>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-space-400 hover:text-space-100 hover:bg-space-700/50 shrink-0"
            onClick={onClose}
            title="关闭报告"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* ============================================================ */}
        {/* 报告主体(可滚动) */}
        {/* ============================================================ */}
        <div className="trea-report-scroll flex-1 overflow-y-auto p-5 space-y-5">

          {/* ---------- 1. 任务元数据 ---------- */}
          <section>
            <h3 className="text-xs font-semibold text-cosmic-blue uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Satellite className="h-3.5 w-3.5" />
              任务元数据
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <MetaItem
                icon={<Clock className="h-3.5 w-3.5" />}
                label="执行时间"
                value={formatDateTime(report.execTime)}
                mono
              />
              <MetaItem
                icon={<Satellite className="h-3.5 w-3.5" />}
                label="卫星"
                value={report.satelliteName}
              />
              <MetaItem
                icon={<Target className="h-3.5 w-3.5" />}
                label="目标区域"
                value={report.targetArea}
              />
              <MetaItem
                icon={<MapPin className="h-3.5 w-3.5" />}
                label="中心坐标"
                value={`${formatLat(report.targetCoord.lat)}, ${formatLon(report.targetCoord.lon)}`}
                mono
              />
            </div>
          </section>

          {/* ---------- 2. 过境窗口 ---------- */}
          <section>
            <h3 className="text-xs font-semibold text-cosmic-blue uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              过境窗口(实际执行)
            </h3>
            <div className="px-3 py-2.5 rounded-lg bg-space-800/60 border border-space-700/60">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-mono text-space-200">{formatDateTime(report.actualWindow.start)}</span>
                <span className="text-space-500 text-xs">→</span>
                <span className="font-mono text-space-200">{formatDateTime(report.actualWindow.end)}</span>
              </div>
            </div>
          </section>

          {/* ---------- 3. 覆盖率(核心指标,大号数字+进度条) ---------- */}
          <section>
            <h3 className="text-xs font-semibold text-cosmic-blue uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              成像覆盖
            </h3>
            <div className="px-4 py-3 rounded-lg bg-space-800/60 border border-space-700/60">
              <div className="flex items-end justify-between mb-2">
                <div>
                  <div className="text-[10px] text-space-500 uppercase tracking-wide">目标区域覆盖率</div>
                  <div className={`text-4xl font-bold ${cov.text} ${cov.glow} leading-none mt-1`}>
                    {report.coveragePercent.toFixed(1)}<span className="text-2xl">%</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-space-500 uppercase tracking-wide">有效成像面积</div>
                  <div className="text-lg font-semibold text-space-100 font-mono mt-1">
                    {report.imagingArea.toFixed(0)} <span className="text-xs text-space-400">km²</span>
                  </div>
                </div>
              </div>
              <ProgressBar value={report.coveragePercent} barClass={cov.bar} glowClass={cov.glow} />
            </div>
          </section>

          {/* ---------- 4. 成像影像预览 ---------- */}
          <section>
            <h3 className="text-xs font-semibold text-cosmic-blue uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Camera className="h-3.5 w-3.5" />
              成像影像预览
            </h3>
            <div className="rounded-lg overflow-hidden border border-space-700/60 bg-space-950">
              <img
                src={report.mockImageUrl}
                alt={`TREA-01 ${report.targetArea} mock 影像`}
                className="w-full h-48 object-cover"
              />
              <div className="px-3 py-1.5 text-[10px] text-space-500 font-mono bg-space-900 border-t border-space-700/60 flex items-center justify-between">
                <span>SENSOR: {report.sensorType}</span>
                <span>MODE: {report.imagingMode}</span>
              </div>
            </div>
          </section>

          {/* ---------- 5. 燃料消耗与卫星最终状态 ---------- */}
          <section>
            <h3 className="text-xs font-semibold text-cosmic-blue uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Fuel className="h-3.5 w-3.5" />
              燃料消耗与卫星最终状态
            </h3>
            <div className="space-y-2">
              {/* 燃料消耗 */}
              <div className="px-3 py-2 rounded-lg bg-space-800/60 border border-space-700/60">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-space-400">本次燃料消耗</span>
                  <span className="text-sm font-mono text-cosmic-orange">
                    -{report.fuelConsumed.toFixed(2)}%
                  </span>
                </div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-space-400">剩余燃料</span>
                  <span className={`text-sm font-mono font-semibold ${fuel.text}`}>
                    {report.finalState.fuel.toFixed(1)}%
                  </span>
                </div>
                <ProgressBar value={report.finalState.fuel} barClass={fuel.bar} />
              </div>

              {/* 其他状态 */}
              <div className="grid grid-cols-3 gap-2">
                <MetaItem
                  icon={<Battery className="h-3.5 w-3.5" />}
                  label="电量"
                  value={`${report.finalState.battery.toFixed(1)}%`}
                  mono
                />
                <MetaItem
                  icon={<Gauge className="h-3.5 w-3.5" />}
                  label="姿态"
                  value={ATTITUDE_LABELS[report.finalState.attitude] ?? report.finalState.attitude}
                />
                <MetaItem
                  icon={<Activity className="h-3.5 w-3.5" />}
                  label="载荷"
                  value={PAYLOAD_LABELS[report.finalState.payloadStatus] ?? report.finalState.payloadStatus}
                />
              </div>
            </div>
          </section>

          {/* ---------- 6. 结论与建议 ---------- */}
          <section>
            <h3 className="text-xs font-semibold text-cosmic-blue uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              结论与建议
            </h3>
            <div className="px-4 py-3 rounded-lg bg-space-800/60 border-l-4 border-l-cosmic-blue/60 border border-space-700/60">
              <p className="text-sm text-space-200 leading-relaxed">
                {report.conclusion}
              </p>
            </div>
          </section>
        </div>

        {/* ============================================================ */}
        {/* 底部:SIMULATION ONLY 标注 + 关闭按钮 */}
        {/* ============================================================ */}
        <div className="shrink-0 border-t border-space-700 bg-space-900">
          {/* 仿真声明(醒目琥珀色) */}
          <div className="px-5 py-2 flex items-center gap-2 bg-amber-500/10 border-b border-amber-500/20">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="text-[11px] text-amber-300 font-mono tracking-wide">
              {report.simOnlyLabel}
            </span>
          </div>

          {/* 操作按钮 */}
          <div className="trea-report-footer-btns px-5 py-3 flex items-center justify-end gap-2">
            <span className="text-[10px] text-space-500 mr-auto">
              💡 在打印对话框中选择「另存为 PDF」即可保存到本地
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-9 bg-space-800 hover:bg-space-700 border-space-700 text-space-300"
              onClick={onClose}
            >
              关闭报告
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-9"
              onClick={handleExport}
              title="打开打印对话框,选择「另存为 PDF」保存到本地电脑"
            >
              <Download className="h-4 w-4 mr-1.5" />
              导出 PDF
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
