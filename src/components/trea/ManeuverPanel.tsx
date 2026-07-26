'use client';

// TREA-01 变轨控制面板
// 提供:当前轨道参数展示、相位调整机动建议、执行变轨按钮、燃料状态、机动历史
// 不透明深色背景(用户偏好,不使用半透明/玻璃态)
//
// 数据来源:treaMissionStore(tle, orbitParams, fuel, maneuverHistory)
// 机动计算:src/lib/trea/maneuver.ts(纯函数)
// Cesium 通知:通过 onManeuverExecuted 回调,由父组件处理轨道对比可视化

import { useMemo, useCallback } from 'react';
import { Orbit, Zap, Fuel, History, AlertTriangle, Gauge, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useTreaTle,
  useTreaOrbitParams,
  useTreaFuel,
  useTreaManeuverHistory,
  useTreaMissionStore,
} from '@/store/treaMissionStore';
import {
  suggestManeuver,
  type AccessWindow,
  type SuggestedManeuver,
} from '@/lib/trea/maneuver';
import type { TLEData } from '@/lib/tle/parser';

// ============================================================
// 类型定义
// ============================================================

interface ManeuverPanelProps {
  /** 机动执行后回调,用于通知 Cesium 渲染新旧轨道对比 */
  onManeuverExecuted?: (newTle: TLEData, oldTle: TLEData) => void;
  /** 访问窗口列表(用于 suggestManeuver 判断是否需要机动),默认空数组 */
  accessWindows?: AccessWindow[];
  /** 可选 className,允许父组件调整布局 */
  className?: string;
}

// ============================================================
// 辅助函数
// ============================================================

/** 格式化日期为中文短格式(YYYY-MM-DD HH:mm:ss) */
function formatTime(date: Date): string {
  try {
    return date.toLocaleString('zh-CN', { hour12: false });
  } catch {
    return date.toISOString();
  }
}

/** 根据 ΔV 符号判断机动方向 */
function getDirectionLabel(deltaV: number): string {
  return deltaV >= 0 ? '正向(prograde)' : '逆向(retrograde)';
}

// ============================================================
// 子组件:轨道参数卡片
// ============================================================

function OrbitParamsCard() {
  const orbitParams = useTreaOrbitParams();

  if (!orbitParams) {
    return (
      <div className="px-3 py-2 bg-space-800 border border-space-700 rounded-lg">
        <div className="flex items-center gap-2 mb-1">
          <Orbit className="h-3.5 w-3.5 text-cosmic-blue" />
          <span className="text-xs font-medium text-space-300">当前轨道参数</span>
        </div>
        <div className="text-xs text-space-500">无法计算(请检查 TLE)</div>
      </div>
    );
  }

  // 周期由秒转分钟
  const periodMin = orbitParams.period / 60;
  // 平均高度(近地点 + 远地点 / 2,圆轨道 = 两者相等)
  const avgAlt = (orbitParams.perigeeAltitude + orbitParams.apogeeAltitude) / 2;

  return (
    <div className="px-3 py-2 bg-space-800 border border-space-700 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <Orbit className="h-3.5 w-3.5 text-cosmic-blue" />
        <span className="text-xs font-medium text-space-300">当前轨道参数</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-space-500">半长轴</span>
          <span className="text-space-200 font-mono">{orbitParams.semiMajorAxis.toFixed(2)} km</span>
        </div>
        <div className="flex justify-between">
          <span className="text-space-500">周期</span>
          <span className="text-space-200 font-mono">{periodMin.toFixed(2)} min</span>
        </div>
        <div className="flex justify-between">
          <span className="text-space-500">平均高度</span>
          <span className="text-space-200 font-mono">{avgAlt.toFixed(2)} km</span>
        </div>
        <div className="flex justify-between">
          <span className="text-space-500">偏心率</span>
          <span className="text-space-200 font-mono">{orbitParams.eccentricity.toFixed(4)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-space-500">近地点</span>
          <span className="text-space-200 font-mono">{orbitParams.perigeeAltitude.toFixed(2)} km</span>
        </div>
        <div className="flex justify-between">
          <span className="text-space-500">远地点</span>
          <span className="text-space-200 font-mono">{orbitParams.apogeeAltitude.toFixed(2)} km</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 子组件:燃料状态卡片
// ============================================================

function FuelStatusCard() {
  const fuel = useTreaFuel();
  const isLow = fuel < 20;
  const isCritical = fuel < 5;

  return (
    <div className="px-3 py-2 bg-space-800 border border-space-700 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Fuel className={`h-3.5 w-3.5 ${isCritical ? 'text-red-500' : isLow ? 'text-yellow-400' : 'text-emerald-400'}`} />
          <span className="text-xs font-medium text-space-300">燃料状态</span>
        </div>
        <span className={`text-sm font-bold font-mono ${isCritical ? 'text-red-400' : isLow ? 'text-yellow-400' : 'text-emerald-400'}`}>
          {fuel.toFixed(1)}%
        </span>
      </div>
      {/* 燃料进度条 */}
      <div className="mt-2 h-1.5 bg-space-900 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isCritical ? 'bg-red-500' : isLow ? 'bg-yellow-400' : 'bg-emerald-400'
          }`}
          style={{ width: `${Math.max(0, Math.min(100, fuel))}%` }}
        />
      </div>
      {isLow && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-yellow-400">
          <AlertTriangle className="h-3 w-3" />
          <span>{isCritical ? '燃料严重不足,禁止机动' : '燃料不足,请谨慎机动'}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 子组件:机动建议卡片
// ============================================================

interface SuggestionCardProps {
  suggestion: SuggestedManeuver | null;
  fuel: number;
  onExecute: () => void;
}

function SuggestionCard({ suggestion, fuel, onExecute }: SuggestionCardProps) {
  if (!suggestion) {
    return (
      <div className="px-3 py-2 bg-space-800 border border-space-700 rounded-lg">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="h-3.5 w-3.5 text-cosmic-blue" />
          <span className="text-xs font-medium text-space-300">建议相位调整机动</span>
        </div>
        <div className="text-xs text-emerald-400">访问窗口充足,当前无需机动</div>
      </div>
    );
  }

  // 燃料是否足够
  const fuelSufficient = fuel >= suggestion.fuelCost;
  const directionLabel =
    suggestion.direction === 'prograde' ? '正向(prograde)' : '逆向(retrograde)';

  return (
    <div className="px-3 py-2 bg-space-800 border border-space-700 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <Zap className="h-3.5 w-3.5 text-orange-400" />
        <span className="text-xs font-medium text-space-300">建议相位调整机动</span>
      </div>

      {/* ΔV 与方向 */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mb-2">
        <div className="flex justify-between">
          <span className="text-space-500">ΔV</span>
          <span className="text-orange-400 font-mono font-semibold">
            {suggestion.deltaV.toFixed(2)} m/s
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-space-500">方向</span>
          <span className="text-space-200">{directionLabel}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-space-500">燃料消耗</span>
          <span className={`font-mono ${fuelSufficient ? 'text-yellow-400' : 'text-red-400'}`}>
            {suggestion.fuelCost.toFixed(2)}%
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-space-500">机动后燃料</span>
          <span className={`font-mono ${fuel - suggestion.fuelCost < 20 ? 'text-red-400' : 'text-space-200'}`}>
            {Math.max(0, fuel - suggestion.fuelCost).toFixed(2)}%
          </span>
        </div>
      </div>

      {/* 描述文本 */}
      <div className="text-[11px] text-space-400 leading-relaxed mb-2 px-2 py-1.5 bg-space-900/60 rounded border border-space-700/50">
        {suggestion.description}
      </div>

      {/* 执行按钮 */}
      <Button
        size="sm"
        className="w-full h-8 bg-orange-600 hover:bg-orange-500 text-white border-orange-500"
        onClick={onExecute}
        disabled={!fuelSufficient}
        title={fuelSufficient ? '执行变轨机动' : '燃料不足,无法执行'}
      >
        <Rocket className="h-3.5 w-3.5 mr-1.5" />
        {fuelSufficient ? '执行变轨' : '燃料不足'}
      </Button>
    </div>
  );
}

// ============================================================
// 子组件:机动历史列表
// ============================================================

function ManeuverHistoryList() {
  const maneuverHistory = useTreaManeuverHistory();

  return (
    <div className="px-3 py-2 bg-space-800 border border-space-700 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <History className="h-3.5 w-3.5 text-cosmic-blue" />
        <span className="text-xs font-medium text-space-300">
          机动历史 ({maneuverHistory.length})
        </span>
      </div>

      {maneuverHistory.length === 0 ? (
        <div className="text-xs text-space-500 py-1">暂无机动记录</div>
      ) : (
        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
          {/* 倒序显示,最新的在前 */}
          {[...maneuverHistory].reverse().map((record, idx) => {
            const directionLabel = getDirectionLabel(record.deltaV);
            const magnitude = Math.abs(record.deltaV);
            return (
              <div
                key={`${record.time.getTime()}-${idx}`}
                className="px-2 py-1.5 bg-space-900/60 rounded border border-space-700/50 text-[11px]"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-space-400 font-mono">
                    #{maneuverHistory.length - idx} {formatTime(record.time)}
                  </span>
                  <span className="text-orange-400 font-mono font-semibold">
                    Δv = {magnitude.toFixed(2)} m/s
                  </span>
                </div>
                <div className="flex items-center justify-between text-space-500">
                  <span>{directionLabel}</span>
                  <span className="text-yellow-400/80">燃料 -{record.fuelCost.toFixed(2)}%</span>
                </div>
                {record.note && (
                  <div className="mt-0.5 text-space-500 text-[10px] truncate" title={record.note}>
                    {record.note}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================

export default function ManeuverPanel({
  onManeuverExecuted,
  accessWindows = [],
  className,
}: ManeuverPanelProps) {
  const tle = useTreaTle();
  const fuel = useTreaFuel();
  const executeManeuver = useTreaMissionStore(state => state.executeManeuver);

  // 计算建议机动(依赖 tle,机动后自动重算)
  const suggestion = useMemo(() => {
    return suggestManeuver(tle, accessWindows);
  }, [tle, accessWindows]);

  // 执行变轨
  const handleExecute = useCallback(() => {
    if (!suggestion) return;
    if (fuel < suggestion.fuelCost) return; // 安全检查

    // 转换为有符号 ΔV:prograde = +, retrograde = -
    const signedDeltaV =
      suggestion.direction === 'prograde' ? +suggestion.deltaV : -suggestion.deltaV;

    // 捕获旧 TLE(执行前),用于回调通知 Cesium 渲染轨道对比
    const oldTle = tle;

    // 调用 store 执行机动(更新 tle、燃料、历史)
    executeManeuver(signedDeltaV, suggestion.newTle, suggestion.fuelCost);

    // 通知父组件渲染 Cesium 新旧轨道对比
    onManeuverExecuted?.(suggestion.newTle, oldTle);
  }, [suggestion, fuel, tle, executeManeuver, onManeuverExecuted]);

  return (
    <div
      className={`flex flex-col gap-2 p-2 bg-space-900 border border-space-800 rounded-lg ${className ?? ''}`}
    >
      {/* 标题栏 */}
      <div className="flex items-center gap-2 px-1 pb-1 border-b border-space-800">
        <Gauge className="h-4 w-4 text-cosmic-purple" />
        <h2 className="text-sm font-bold text-space-100">变轨控制</h2>
      </div>

      {/* 当前轨道参数 */}
      <OrbitParamsCard />

      {/* 建议机动 + 执行按钮 */}
      <SuggestionCard suggestion={suggestion} fuel={fuel} onExecute={handleExecute} />

      {/* 燃料状态 */}
      <FuelStatusCard />

      {/* 机动历史 */}
      <ManeuverHistoryList />
    </div>
  );
}
