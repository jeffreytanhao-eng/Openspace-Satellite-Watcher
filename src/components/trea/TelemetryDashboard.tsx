'use client';

// ============================================================
// TREA-01 酷炫遥测仪表盘 (M1 / Task 5)
// ------------------------------------------------------------
// 独立深色风格:不透明背景 (bg-slate-900) + 霓虹边框/发光效果
// 不使用半透明/玻璃态(用户偏好)
//
// 数据来源:
//   - useCurrentTime() 订阅仿真时间
//   - treaMissionStore.updateTelemetry(time) 每帧更新遥测缓存
//   - useTreaFuel / useTreaBattery / useTreaPayloadStatus 读取状态
//   - useTreaTelemetry() 读取 ECI 位置(km)/ 速度(km/s)/ 地理坐标
//
// 展示卡片(8 项):
//   1. 实时位置卡  :经度/纬度/高度(由 ECI → 地理坐标)
//   2. 速度卡      :相邻两帧 ECI 位置差 / dt → km/s
//   3. 姿态指示    :pitch/roll/yaw(基于时间正弦模拟)
//   4. 燃料条      :百分比 + 颜色变化(>50绿/20-50黄/<20红)
//   5. 电量条      :同燃料条样式
//   6. 载荷状态    :STANDBY/IMAGING/OFF + 状态灯
//   7. 链路质量    :dBm(基于高度/纬度模拟)+ 信号强度条
//   8. 告警灯      :燃料低/电量低/姿态异常 → 红灯
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Satellite,
  Gauge,
  Compass,
  Fuel,
  Battery,
  Camera,
  Radio,
  AlertTriangle,
  Activity,
} from 'lucide-react';
import { useCurrentTime } from '@/store/timeStore';
import {
  useTreaMissionStore,
  useTreaTle,
  useTreaFuel,
  useTreaBattery,
  useTreaTelemetry,
  useTreaPayloadStatus,
  useTreaAttitude,
} from '@/store/treaMissionStore';
import type { PayloadStatus } from '@/lib/trea/constants';

// ============================================================
// 显示辅助
// ============================================================

/** 纬度格式化:-90~90 → "xx.xxxx° N/S" */
function formatLat(lat: number): string {
  const dir = lat >= 0 ? 'N' : 'S';
  return `${Math.abs(lat).toFixed(4)}° ${dir}`;
}

/** 经度格式化:store 中 lon 为 0~360,转换为 -180~180 → "xx.xxxx° E/W" */
function formatLon(lon: number): string {
  let l = lon;
  if (l > 180) l -= 360;
  if (l < -180) l += 360;
  const dir = l >= 0 ? 'E' : 'W';
  return `${Math.abs(l).toFixed(4)}° ${dir}`;
}

/** 高度格式化:km → "xxx.x km" */
function formatAlt(altKm: number): string {
  return `${altKm.toFixed(2)} km`;
}

/** 资源(燃料/电量)等级颜色 */
function levelColor(pct: number) {
  if (pct > 50) {
    return {
      bar: 'bg-emerald-400',
      text: 'text-emerald-400',
      glow: 'shadow-[0_0_10px_rgba(52,211,153,0.6)]',
      ring: 'border-emerald-400/50',
    };
  }
  if (pct >= 20) {
    return {
      bar: 'bg-yellow-400',
      text: 'text-yellow-400',
      glow: 'shadow-[0_0_10px_rgba(250,204,21,0.6)]',
      ring: 'border-yellow-400/50',
    };
  }
  return {
    bar: 'bg-red-500',
    text: 'text-red-400',
    glow: 'shadow-[0_0_10px_rgba(239,68,68,0.6)]',
    ring: 'border-red-500/50',
  };
}

/** 载荷状态显示配置(状态灯颜色随状态变化) */
const PAYLOAD_DISPLAY: Record<
  PayloadStatus,
  { label: string; color: string; dot: string }
> = {
  STANDBY: {
    label: '待机',
    color: 'text-yellow-400',
    dot: 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)]',
  },
  IMAGING: {
    label: '成像中',
    color: 'text-emerald-400',
    dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse',
  },
  OFF: {
    label: '关闭',
    color: 'text-slate-500',
    dot: 'bg-slate-600',
  },
};

/** 姿态模式中文标签 */
const ATTITUDE_LABELS: Record<string, string> = {
  Nominal: '标称',
  Roll: '侧摆',
  Pitch: '俯仰',
  Yaw: '偏航',
};

// ============================================================
// 卡片容器(不透明深色 + 霓虹边框/发光)
// ============================================================

interface CardProps {
  title: string;
  icon: React.ReactNode;
  accent?: 'cyan' | 'emerald' | 'yellow' | 'red' | 'purple';
  children: React.ReactNode;
  className?: string;
}

const ACCENT_BORDER: Record<string, string> = {
  cyan: 'border-cyan-500/50 shadow-[0_0_15px_rgba(34,211,238,0.25)]',
  emerald: 'border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.25)]',
  yellow: 'border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.25)]',
  red: 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.25)]',
  purple: 'border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.25)]',
};

const ACCENT_ICON: Record<string, string> = {
  cyan: 'text-cyan-400',
  emerald: 'text-emerald-400',
  yellow: 'text-yellow-400',
  red: 'text-red-400',
  purple: 'text-purple-400',
};

function NeonCard({ title, icon, accent = 'cyan', children, className = '' }: CardProps) {
  return (
    <div
      className={`bg-slate-900 border ${ACCENT_BORDER[accent]} rounded-lg p-3 flex flex-col ${className}`}
    >
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-700/60">
        <span className={ACCENT_ICON[accent]}>{icon}</span>
        <span className="text-xs font-medium text-slate-300 tracking-wide uppercase">
          {title}
        </span>
      </div>
      <div className="flex-1 flex flex-col justify-center">{children}</div>
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================

export default function TelemetryDashboard() {
  // ----- 订阅仿真时间 + TREA 状态 -----
  const currentTime = useCurrentTime();
  const updateTelemetry = useTreaMissionStore((s) => s.updateTelemetry);
  const tle = useTreaTle();
  const fuel = useTreaFuel();
  const battery = useTreaBattery();
  const payloadStatus = useTreaPayloadStatus();
  const attitudeMode = useTreaAttitude();
  const telemetry = useTreaTelemetry();

  // ----- 每帧调用 updateTelemetry,把当前仿真时间写入遥测缓存 -----
  useEffect(() => {
    updateTelemetry(currentTime);
  }, [currentTime, updateTelemetry]);

  // ----- 速度:相邻两帧 ECI 位置差 / dt(km/s) -----
  const prevPosRef = useRef<
    { x: number; y: number; z: number; t: number } | null
  >(null);
  const [speedKmPerSec, setSpeedKmPerSec] = useState<number>(0);

  useEffect(() => {
    if (!telemetry) return;
    const cur = {
      x: telemetry.position.x,
      y: telemetry.position.y,
      z: telemetry.position.z,
      t: telemetry.time.getTime(),
    };
    const prev = prevPosRef.current;
    prevPosRef.current = cur;

    if (prev) {
      const dt = (cur.t - prev.t) / 1000; // 秒(仿真时间)
      if (dt > 0) {
        const dx = cur.x - prev.x;
        const dy = cur.y - prev.y;
        const dz = cur.z - prev.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz); // km
        setSpeedKmPerSec(dist / dt);
        return;
      }
    }
    // 回退:使用 SGP4 速度矢量模长(初次渲染或时间回溯时)
    const v = telemetry.velocity;
    setSpeedKmPerSec(Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z));
  }, [telemetry]);

  // ----- 姿态模拟:基于时间正弦波动(度) -----
  const geo = telemetry?.geographic;
  const tSec = currentTime.getTime() / 1000;
  const pitch = 2.5 * Math.sin(tSec / 6);
  const roll = 3.0 * Math.sin(tSec / 8 + 1.2);
  const yaw = 1.5 * Math.sin(tSec / 10 + 0.5);

  // ----- 链路质量模拟:基于高度/纬度 + 时间扰动(dBm) -----
  const altKm = geo?.alt ?? 500;
  const latAbs = Math.abs(geo?.lat ?? 0);
  const dBm =
    -78 + (altKm - 500) * 0.05 - latAbs * 0.15 + 3 * Math.sin(tSec / 3.7) + 1.5 * Math.cos(tSec / 2.3);
  const signalPct = Math.max(0, Math.min(100, ((dBm + 100) / 30) * 100));

  // ----- 告警判定 -----
  const fuelLow = fuel < 20;
  const batteryLow = battery < 20;
  const attitudeAnomaly =
    Math.abs(pitch) > 5 || Math.abs(roll) > 5 || Math.abs(yaw) > 5;
  const hasAlert = fuelLow || batteryLow || attitudeAnomaly;

  // ----- 资源颜色 -----
  const fuelCol = levelColor(fuel);
  const battCol = levelColor(battery);
  const payloadInfo = PAYLOAD_DISPLAY[payloadStatus];

  // ----- TLE 名称(展示用) -----
  const satName = tle?.name ?? 'TREA-01';

  // ----- 信号强度条分段(5 段) -----
  const signalBars = useMemo(() => {
    const bars: boolean[] = [];
    const threshold = signalPct / 100;
    for (let i = 0; i < 5; i++) {
      bars.push(threshold > i / 5);
    }
    return bars;
  }, [signalPct]);

  return (
    <div className="w-full bg-slate-950 rounded-xl border border-cyan-500/30 p-3 shadow-[0_0_25px_rgba(34,211,238,0.15)]">
      {/* ===== 顶部标题栏 ===== */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-700/60">
        <div className="flex items-center gap-2">
          <Satellite className="h-5 w-5 text-cyan-400" />
          <h2 className="text-sm font-bold text-slate-100 tracking-wide">
            {satName} · 遥测仪表盘
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 font-mono">
            {currentTime.toISOString().slice(0, 19)}Z
          </span>
          <span className="flex items-center gap-1 px-2 py-0.5 bg-slate-800 border border-emerald-500/40 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
            <span className="text-[10px] text-emerald-400 font-medium">LIVE</span>
          </span>
        </div>
      </div>

      {/* ===== 卡片网格(2 列 / 大屏 3 列) ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {/* 1. 实时位置卡 */}
        <NeonCard title="实时位置" icon={<Satellite className="h-4 w-4" />} accent="cyan">
          <div className="space-y-1.5 font-mono">
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-slate-400">纬度 LAT</span>
              <span className="text-sm text-cyan-300">
                {geo ? formatLat(geo.lat) : '— —'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-slate-400">经度 LON</span>
              <span className="text-sm text-cyan-300">
                {geo ? formatLon(geo.lon) : '— —'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-slate-400">高度 ALT</span>
              <span className="text-sm text-cyan-300">
                {geo ? formatAlt(geo.alt) : '— —'}
              </span>
            </div>
          </div>
        </NeonCard>

        {/* 2. 速度卡 */}
        <NeonCard title="轨道速度" icon={<Gauge className="h-4 w-4" />} accent="purple">
          <div className="flex flex-col items-center justify-center py-1">
            <span className="text-3xl font-bold text-purple-300 font-mono leading-none">
              {speedKmPerSec.toFixed(3)}
            </span>
            <span className="text-[11px] text-slate-400 mt-1">km / s</span>
            <span className="text-[10px] text-slate-500 mt-0.5">
              {(speedKmPerSec * 3600).toFixed(0)} km/h
            </span>
          </div>
        </NeonCard>

        {/* 3. 姿态指示 */}
        <NeonCard title="姿态 (PRY)" icon={<Compass className="h-4 w-4" />} accent="cyan">
          <div className="space-y-1.5 font-mono">
            <AttitudeRow label="PITCH" value={pitch} />
            <AttitudeRow label="ROLL" value={roll} />
            <AttitudeRow label="YAW" value={yaw} />
            <div className="flex justify-between items-center pt-1 border-t border-slate-700/60">
              <span className="text-[10px] text-slate-500">模式</span>
              <span className="text-[11px] text-cyan-300">
                {ATTITUDE_LABELS[attitudeMode] ?? attitudeMode}
              </span>
            </div>
          </div>
        </NeonCard>

        {/* 4. 燃料条 */}
        <NeonCard title="燃料" icon={<Fuel className="h-4 w-4" />} accent="emerald">
          <ResourceBar pct={fuel} color={fuelCol} />
        </NeonCard>

        {/* 5. 电量条 */}
        <NeonCard title="电量" icon={<Battery className="h-4 w-4" />} accent="yellow">
          <ResourceBar pct={battery} color={battCol} />
        </NeonCard>

        {/* 6. 载荷状态 */}
        <NeonCard title="载荷状态" icon={<Camera className="h-4 w-4" />} accent="cyan">
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${payloadInfo.dot}`} />
              <span className={`text-lg font-semibold ${payloadInfo.color}`}>
                {payloadInfo.label}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              {payloadStatus}
            </span>
          </div>
        </NeonCard>

        {/* 7. 链路质量 */}
        <NeonCard title="链路质量" icon={<Radio className="h-4 w-4" />} accent="purple">
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] text-slate-400">信号强度</span>
              <span className="text-sm text-purple-300 font-mono">
                {dBm.toFixed(1)} dBm
              </span>
            </div>
            {/* 5 段信号条 */}
            <div className="flex items-end gap-1 h-6">
              {signalBars.map((on, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-sm transition-all ${
                    on
                      ? 'bg-purple-400 shadow-[0_0_6px_rgba(168,85,247,0.7)]'
                      : 'bg-slate-700'
                  }`}
                  style={{ height: `${(i + 1) * 20}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-500">质量</span>
              <span
                className={`text-[11px] font-mono ${
                  signalPct > 60
                    ? 'text-emerald-400'
                    : signalPct > 30
                      ? 'text-yellow-400'
                      : 'text-red-400'
                }`}
              >
                {signalPct.toFixed(0)}%
              </span>
            </div>
          </div>
        </NeonCard>

        {/* 8. 告警灯 */}
        <NeonCard
          title="告警"
          icon={<AlertTriangle className="h-4 w-4" />}
          accent={hasAlert ? 'red' : 'cyan'}
          className="lg:col-span-2"
        >
          <div className="grid grid-cols-3 gap-2">
            <AlertLight label="燃料低" triggered={fuelLow} />
            <AlertLight label="电量低" triggered={batteryLow} />
            <AlertLight label="姿态异常" triggered={attitudeAnomaly} />
          </div>
        </NeonCard>
      </div>

      {/* ===== 底部状态条 ===== */}
      <div className="mt-3 pt-2 border-t border-slate-700/60 flex items-center justify-between text-[10px] text-slate-500 font-mono">
        <div className="flex items-center gap-1">
          <Activity className="h-3 w-3" />
          <span>遥测刷新:跟随仿真时钟</span>
        </div>
        <span>
          ECI 位置:{' '}
          {telemetry
            ? `(${telemetry.position.x.toFixed(1)}, ${telemetry.position.y.toFixed(1)}, ${telemetry.position.z.toFixed(1)}) km`
            : '计算中…'}
        </span>
      </div>
    </div>
  );
}

// ============================================================
// 子组件:姿态单行
// ============================================================

function AttitudeRow({ label, value }: { label: string; value: number }) {
  const sign = value >= 0 ? '+' : '';
  return (
    <div className="flex justify-between items-center">
      <span className="text-[11px] text-slate-400">{label}</span>
      <span
        className={`text-sm font-mono ${
          Math.abs(value) > 5 ? 'text-red-400' : 'text-cyan-300'
        }`}
      >
        {sign}
        {value.toFixed(2)}°
      </span>
    </div>
  );
}

// ============================================================
// 子组件:资源(燃料/电量)进度条
// ============================================================

function ResourceBar({
  pct,
  color,
}: {
  pct: number;
  color: ReturnType<typeof levelColor>;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline">
        <span className="text-[11px] text-slate-400">剩余</span>
        <span className={`text-2xl font-bold font-mono ${color.text}`}>
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="h-2.5 w-full bg-slate-700/70 rounded-full overflow-hidden">
        <div
          className={`h-full ${color.bar} ${color.glow} rounded-full transition-all duration-300`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-slate-500 font-mono">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

// ============================================================
// 子组件:告警灯
// ============================================================

function AlertLight({
  label,
  triggered,
}: {
  label: string;
  triggered: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-2 rounded-md border ${
        triggered
          ? 'bg-red-950/60 border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.4)]'
          : 'bg-slate-800/60 border-slate-700/60'
      }`}
    >
      <span
        className={`w-3 h-3 rounded-full mb-1 ${
          triggered
            ? 'bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.9)]'
            : 'bg-slate-600'
        }`}
      />
      <span
        className={`text-[10px] ${
          triggered ? 'text-red-300 font-semibold' : 'text-slate-500'
        }`}
      >
        {label}
      </span>
    </div>
  );
}
