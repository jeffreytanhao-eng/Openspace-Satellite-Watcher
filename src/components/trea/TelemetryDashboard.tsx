'use client';

// ============================================================
// TREA-01 紧凑遥测仪表盘 (M1 / Task 5)
// ------------------------------------------------------------
// 高信息密度布局:在有限高度内展示全部状态,无需滚动。
// 独立深色风格:不透明背景 (bg-slate-900) + 霓虹边框/发光效果
// 不使用半透明/玻璃态(用户偏好)
//
// 数据来源:
//   - useCurrentTime() 订阅仿真时间
//   - treaMissionStore.updateTelemetry(time) 每帧更新遥测缓存
//   - useTreaFuel / useTreaBattery / useTreaPayloadStatus 读取状态
//   - useTreaTelemetry() 读取 ECI 位置(km)/ 速度(km/s)/ 地理坐标
//
// 展示卡片(9 项,3 列布局):
//   1. 实时位置  :经度/纬度/高度(由 ECI → 地理坐标)
//   2. 轨道速度  :相邻两帧 ECI 位置差 / dt → km/s
//   3. 姿态指示  :pitch/roll/yaw + 模式
//   4. 燃料      :百分比 + 进度条
//   5. 电量      :百分比 + 进度条
//   6. 载荷状态  :STANDBY/IMAGING/OFF + 状态灯
//   7. 链路质量  :dBm + 信号强度条
//   8. 告警      :燃料低/电量低/姿态异常 → 红灯
//   9. 轨道参数  :倾角/偏心率/平均运动/周期
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
  return `${Math.abs(lat).toFixed(2)}°${dir}`;
}

/** 经度格式化:store 中 lon 为 0~360,转换为 -180~180 → "xx.xxxx° E/W" */
function formatLon(lon: number): string {
  let l = lon;
  if (l > 180) l -= 360;
  if (l < -180) l += 360;
  const dir = l >= 0 ? 'E' : 'W';
  return `${Math.abs(l).toFixed(2)}°${dir}`;
}

/** 高度格式化:km → "xxx.x km" */
function formatAlt(altKm: number): string {
  return `${altKm.toFixed(0)}km`;
}

/** 资源(燃料/电量)等级颜色 */
function levelColor(pct: number) {
  if (pct > 50) {
    return {
      bar: 'bg-emerald-400',
      text: 'text-emerald-400',
      dot: 'bg-emerald-400',
    };
  }
  if (pct >= 20) {
    return {
      bar: 'bg-yellow-400',
      text: 'text-yellow-400',
      dot: 'bg-yellow-400',
    };
  }
  return {
    bar: 'bg-red-500',
    text: 'text-red-400',
    dot: 'bg-red-500',
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
    dot: 'bg-yellow-400',
  },
  IMAGING: {
    label: '成像中',
    color: 'text-emerald-400',
    dot: 'bg-emerald-400 animate-pulse',
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
// 紧凑卡片容器(不透明深色 + 霓虹边框/发光)
// ============================================================

interface CardProps {
  title: string;
  icon: React.ReactNode;
  accent?: 'cyan' | 'emerald' | 'yellow' | 'red' | 'purple';
  children: React.ReactNode;
  className?: string;
}

const ACCENT_BORDER: Record<string, string> = {
  cyan: 'border-cyan-500/40',
  emerald: 'border-emerald-500/40',
  yellow: 'border-yellow-500/40',
  red: 'border-red-500/40',
  purple: 'border-purple-500/40',
};

const ACCENT_ICON: Record<string, string> = {
  cyan: 'text-cyan-400',
  emerald: 'text-emerald-400',
  yellow: 'text-yellow-400',
  red: 'text-red-400',
  purple: 'text-purple-400',
};

function MiniCard({ title, icon, accent = 'cyan', children, className = '' }: CardProps) {
  return (
    <div
      className={`bg-slate-900 border ${ACCENT_BORDER[accent]} rounded-md px-2 py-1.5 flex flex-col min-h-0 ${className}`}
    >
      <div className="flex items-center gap-1 mb-1 shrink-0">
        <span className={ACCENT_ICON[accent]}>{icon}</span>
        <span className="text-[9px] font-medium text-slate-400 tracking-wide uppercase truncate">
          {title}
        </span>
      </div>
      <div className="flex-1 flex flex-col justify-center min-h-0">{children}</div>
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================

interface TelemetryDashboardProps {
  /** 网格列数(默认 2;cockpit 传 3 实现 3×3 布局) */
  columns?: 2 | 3;
}

export default function TelemetryDashboard({ columns = 2 }: TelemetryDashboardProps) {
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

  // ----- 轨道根数(来自 TLE,仅 3 列布局时显示第 9 张卡) -----
  const el = tle?.elements;
  const inclination = el?.inclination ?? 0;
  const eccentricity = el?.eccentricity ?? 0;
  const meanMotion = el?.meanMotion ?? 0;
  const periodMin = meanMotion > 0 ? 1440 / meanMotion : 0; // 周期(分钟)= 1440 / meanMotion

  return (
    <div className="w-full bg-slate-950 rounded-lg border border-cyan-500/30 p-2">
      {/* ===== 顶部标题栏(紧凑) ===== */}
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Satellite className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
          <h2 className="text-[11px] font-bold text-slate-100 tracking-wide truncate">
            {satName} · 遥测仪表盘
          </h2>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[9px] text-slate-400 font-mono">
            {currentTime.toISOString().slice(11, 19)}Z
          </span>
          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-800 border border-emerald-500/40 rounded">
            <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[8px] text-emerald-400 font-medium">LIVE</span>
          </span>
        </div>
      </div>

      {/* ===== 卡片网格(紧凑,3 列时 3×3 无滚动) ===== */}
      <div className={`grid ${columns === 3 ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5`}>
        {/* 1. 实时位置卡 */}
        <MiniCard title="实时位置" icon={<Satellite className="h-3 w-3" />} accent="cyan">
          <div className="grid grid-cols-3 gap-0.5 text-center">
            <GeoCell label="LAT" value={geo ? formatLat(geo.lat) : '—'} />
            <GeoCell label="LON" value={geo ? formatLon(geo.lon) : '—'} />
            <GeoCell label="ALT" value={geo ? formatAlt(geo.alt) : '—'} />
          </div>
        </MiniCard>

        {/* 2. 轨道速度卡 */}
        <MiniCard title="轨道速度" icon={<Gauge className="h-3 w-3" />} accent="purple">
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-base font-bold text-purple-300 font-mono leading-none">
              {speedKmPerSec.toFixed(2)}
            </span>
            <span className="text-[8px] text-slate-500">km/s</span>
          </div>
          <div className="text-center text-[8px] text-slate-500 font-mono">
            {(speedKmPerSec * 3600).toFixed(0)} km/h
          </div>
        </MiniCard>

        {/* 3. 姿态指示 */}
        <MiniCard title="姿态 PRY" icon={<Compass className="h-3 w-3" />} accent="cyan">
          <div className="grid grid-cols-3 gap-0.5 text-center">
            <AttMini label="P" value={pitch} />
            <AttMini label="R" value={roll} />
            <AttMini label="Y" value={yaw} />
          </div>
          <div className="text-center text-[8px] text-slate-500 mt-0.5">
            {ATTITUDE_LABELS[attitudeMode] ?? attitudeMode}
          </div>
        </MiniCard>

        {/* 4. 燃料 */}
        <MiniCard title="燃料" icon={<Fuel className="h-3 w-3" />} accent="emerald">
          <ResourceMini pct={fuel} color={fuelCol} />
        </MiniCard>

        {/* 5. 电量 */}
        <MiniCard title="电量" icon={<Battery className="h-3 w-3" />} accent="yellow">
          <ResourceMini pct={battery} color={battCol} />
        </MiniCard>

        {/* 6. 载荷状态 */}
        <MiniCard title="载荷" icon={<Camera className="h-3 w-3" />} accent="cyan">
          <div className="flex items-center justify-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${payloadInfo.dot}`} />
            <span className={`text-sm font-semibold ${payloadInfo.color}`}>
              {payloadInfo.label}
            </span>
          </div>
          <div className="text-center text-[8px] text-slate-500 font-mono">{payloadStatus}</div>
        </MiniCard>

        {/* 7. 链路质量 */}
        <MiniCard title="链路" icon={<Radio className="h-3 w-3" />} accent="purple">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-sm font-bold text-purple-300 font-mono leading-none">
              {dBm.toFixed(0)}
            </span>
            <span className="text-[8px] text-slate-500">dBm</span>
          </div>
          <div className="flex items-center gap-0.5">
            {signalBars.map((on, i) => (
              <div
                key={i}
                className={`flex-1 h-1.5 rounded-sm ${
                  on ? 'bg-purple-400' : 'bg-slate-700'
                }`}
              />
            ))}
          </div>
        </MiniCard>

        {/* 8. 告警灯(2 列布局时跨满,3 列布局时单列) */}
        <MiniCard
          title="告警"
          icon={<AlertTriangle className="h-3 w-3" />}
          accent={hasAlert ? 'red' : 'cyan'}
          className={columns === 2 ? 'col-span-2' : ''}
        >
          <div className="grid grid-cols-3 gap-1">
            <AlertMini label="燃料" triggered={fuelLow} />
            <AlertMini label="电量" triggered={batteryLow} />
            <AlertMini label="姿态" triggered={attitudeAnomaly} />
          </div>
        </MiniCard>

        {/* 9. 轨道参数(仅 3 列布局时显示,补满 3×3 网格) */}
        {columns === 3 && (
          <MiniCard title="轨道参数" icon={<Gauge className="h-3 w-3" />} accent="cyan">
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
              <ParamCell label="倾角" value={`${inclination.toFixed(1)}°`} />
              <ParamCell label="偏心率" value={eccentricity.toFixed(3)} />
              <ParamCell label="平均运动" value={meanMotion.toFixed(1)} />
              <ParamCell label="周期" value={`${periodMin.toFixed(1)}m`} />
            </div>
          </MiniCard>
        )}
      </div>

      {/* ===== 底部状态条(紧凑) ===== */}
      <div className="mt-1.5 pt-1 border-t border-slate-700/60 flex items-center justify-between text-[8px] text-slate-500 font-mono">
        <span>ECI:</span>
        <span className="truncate ml-1">
          {telemetry
            ? `(${telemetry.position.x.toFixed(0)}, ${telemetry.position.y.toFixed(0)}, ${telemetry.position.z.toFixed(0)}) km`
            : '计算中…'}
        </span>
      </div>
    </div>
  );
}

// ============================================================
// 子组件:地理坐标单元
// ============================================================

function GeoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[8px] text-slate-500">{label}</div>
      <div className="text-[11px] text-cyan-300 font-mono truncate">{value}</div>
    </div>
  );
}

// ============================================================
// 子组件:姿态单行
// ============================================================

function AttMini({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <div className="text-[8px] text-slate-500">{label}</div>
      <div
        className={`text-[11px] font-mono ${
          Math.abs(value) > 5 ? 'text-red-400' : 'text-cyan-300'
        }`}
      >
        {value >= 0 ? '+' : ''}
        {value.toFixed(1)}°
      </div>
    </div>
  );
}

// ============================================================
// 子组件:资源(燃料/电量)紧凑进度条
// ============================================================

function ResourceMini({
  pct,
  color,
}: {
  pct: number;
  color: ReturnType<typeof levelColor>;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-0.5">
        <span className="text-[8px] text-slate-500">剩余</span>
        <span className={`text-sm font-bold font-mono leading-none ${color.text}`}>
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-1.5 w-full bg-slate-700/70 rounded-full overflow-hidden">
        <div
          className={`h-full ${color.bar} rounded-full transition-all duration-300`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================
// 子组件:告警灯(紧凑)
// ============================================================

function AlertMini({ label, triggered }: { label: string; triggered: boolean }) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-1 rounded border ${
        triggered
          ? 'bg-red-950/60 border-red-500/50'
          : 'bg-slate-800/60 border-slate-700/60'
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full mb-0.5 ${
          triggered ? 'bg-red-500 animate-pulse' : 'bg-slate-600'
        }`}
      />
      <span
        className={`text-[8px] ${
          triggered ? 'text-red-300 font-semibold' : 'text-slate-500'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

// ============================================================
// 子组件:轨道参数单元
// ============================================================

function ParamCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-1 min-w-0">
      <span className="text-[8px] text-slate-500 shrink-0">{label}</span>
      <span className="text-[10px] text-cyan-300 font-mono truncate">{value}</span>
    </div>
  );
}