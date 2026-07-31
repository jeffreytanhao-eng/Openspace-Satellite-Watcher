'use client';

// TREA-01 任务列表面板
// 进入任务中心后展示卫星对 AOI-A / AOI-B 的过境窗口,
// 支持单选 AOI 进行任务规划,并可触发相位调整建议或开始仿真。
//
// 设计要点:
//   - 不透明深色背景(用户偏好,不使用半透明/玻璃态)
//   - 进入时计算 48 小时过境窗口(useEffect,避免阻塞首帧)
//   - 单选 AOI:点击卡片选中,再次点击同一 AOI 取消选中
//   - 选中后:写入 treaMissionStore.setCurrentTask(含窗口字段) + setMissionPhase('PLANNED')
//   - 当选中 AOI 的窗口数 < 2 时显示「建议相位调整机动」按钮
//   - 「开始任务仿真」(M4 已接线):startTaskSimulation + 时间播放跳转+加速
//   - 「重置 TREA-01」(Story 5.2):reset store + 停止播放 + 时间回 now

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Target, Clock, TrendingUp, Rocket, Wrench, RefreshCw, CheckCircle2, MapPin, RotateCcw, PanelLeftClose, PanelLeftOpen, Sparkles, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AOI_A, AOI_B, AOI_LIST } from '@/lib/trea/constants';
import {
  computeAccessWindows,
  findNextWindow,
  type AccessWindow,
} from '@/lib/trea/access';
import {
  useTreaMissionStore,
  useTreaTle,
  useTreaMissionPhase,
  useTreaOrbitParams,
  useTreaBattery,
  useCollisionAlert,
  useEmergencyTask,
  type TreaMissionTask,
} from '@/store/treaMissionStore';
import { useTimeStore } from '@/store/timeStore';
import { buildAiRequestInput, buildCollisionRequestInput, type AiTaskPlanningOutput } from '@/lib/trea/ai-prompt';
import AiPlanningModal from '@/components/trea/AiPlanningModal';

// ============================================================
// 工具函数
// ============================================================

/** 格式化日期为 "YYYY-MM-DD HH:mm" 简洁格式 */
function formatTime(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 格式化持续秒数为 "X分Y秒" / "Y秒" */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}秒`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}分${s}秒` : `${m}分钟`;
}

/** 距离当前时间的相对描述("X小时Y分钟后") */
function formatRelative(target: Date, now: Date): string {
  const deltaSec = Math.max(0, (target.getTime() - now.getTime()) / 1000);
  if (deltaSec < 60) return `${Math.round(deltaSec)}秒后`;
  const h = Math.floor(deltaSec / 3600);
  const m = Math.floor((deltaSec % 3600) / 60);
  if (h > 0) return `${h}小时${m}分钟后`;
  return `${m}分钟后`;
}

/** 仰角颜色分级(越高越优) */
function elevationColor(elev: number): string {
  if (elev >= 45) return 'text-emerald-400';
  if (elev >= 20) return 'text-yellow-400';
  if (elev >= 5) return 'text-orange-400';
  return 'text-space-400';
}

// ============================================================
// 单个窗口卡片
// ============================================================

interface WindowCardProps {
  window: AccessWindow;
  now: Date;
  isHighlighted?: boolean;
}

function WindowCard({ window: w, now, isHighlighted }: WindowCardProps) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 transition-colors ${
        isHighlighted
          ? 'bg-cosmic-blue/15 border-cosmic-blue/60'
          : 'bg-space-800/80 border-space-700'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-xs text-space-300">
          <Clock className="h-3.5 w-3.5 text-cosmic-blue" />
          <span className="font-mono">{formatTime(w.startTime)}</span>
        </div>
        <span className="text-[10px] text-space-500">
          {formatRelative(w.startTime, now)}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-space-400">
          <TrendingUp className="h-3.5 w-3.5" />
          <span>最大仰角</span>
          <span className={`font-mono font-semibold ${elevationColor(w.maxElevation)}`}>
            {w.maxElevation.toFixed(1)}°
          </span>
        </div>
        <div className="text-space-400">
          持续 <span className="text-space-200 font-mono">{formatDuration(w.duration)}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// AOI 区域块
// ============================================================

interface AoiSectionProps {
  aoiId: string;
  aoiName: string;
  aoiNameEn: string;
  aoiCenter: { lat: number; lon: number };
  windows: AccessWindow[];
  now: Date;
  selected: boolean;
  onSelect: () => void;
}

function AoiSection({
  aoiId,
  aoiName,
  aoiNameEn,
  aoiCenter,
  windows,
  now,
  selected,
  onSelect,
}: AoiSectionProps) {
  const nextWindow = useMemo(() => findNextWindow(windows, now), [windows, now]);

  return (
    <div
      className={`rounded-xl border transition-colors ${
        selected
          ? 'bg-space-800 border-cosmic-blue bg-cosmic-blue/10'
          : 'bg-space-900 border-space-800 hover:border-space-700'
      }`}
    >
      {/* AOI 头部(可点击选中) */}
      <button
        type="button"
        onClick={onSelect}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              selected ? 'bg-cosmic-blue text-white' : 'bg-space-800 text-cosmic-blue'
            }`}
          >
            {selected ? <CheckCircle2 className="h-5 w-5" /> : <Target className="h-5 w-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-space-100">{aoiName}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-space-800 text-space-400 font-mono">
                {aoiId.toUpperCase()}
              </span>
            </div>
            <span className="block text-[10px] text-space-500 mt-0.5">{aoiNameEn}</span>
            <div className="flex items-center gap-1 text-[11px] text-space-500 mt-0.5">
              <MapPin className="h-3 w-3" />
              <span className="font-mono">
                {aoiCenter.lat.toFixed(1)}°N, {aoiCenter.lon.toFixed(1)}°E
              </span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-space-400">
            <span className="text-space-200 font-semibold">{windows.length}</span> 个窗口
          </div>
          <div className="text-[10px] text-cosmic-blue mt-0.5">
            {nextWindow ? `下次 ${formatRelative(nextWindow.startTime, now)}` : '48h 内无窗口'}
          </div>
        </div>
      </button>

      {/* 窗口卡片列表 */}
      {windows.length > 0 && (
        <div className="px-3 pb-3 space-y-1.5">
          {windows.slice(0, 5).map((w, idx) => (
            <WindowCard
              key={`${aoiId}-${idx}`}
              window={w}
              now={now}
              isHighlighted={selected && nextWindow === w}
            />
          ))}
          {windows.length > 5 && (
            <div className="text-center text-[11px] text-space-500 pt-1">
              另有 {windows.length - 5} 个窗口未展示
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 主面板
// ============================================================

export default function TaskListPanel() {
  const tle = useTreaTle();
  const orbitParams = useTreaOrbitParams();
  const battery = useTreaBattery();
  const setCurrentTask = useTreaMissionStore(s => s.setCurrentTask);
  const setMissionPhase = useTreaMissionStore(s => s.setMissionPhase);
  const executeManeuver = useTreaMissionStore(s => s.executeManeuver);
  const startTaskSimulation = useTreaMissionStore(s => s.startTaskSimulation);
  const resetMission = useTreaMissionStore(s => s.reset);
  const fuel = useTreaMissionStore(s => s.fuel);
  const missionPhase = useTreaMissionPhase();
  // 突发碰撞任务:碰撞警报 + 紧急避撞任务
  const collisionAlert = useCollisionAlert();
  const emergencyTask = useEmergencyTask();
  const triggerCollisionAlert = useTreaMissionStore(s => s.triggerCollisionAlert);
  const setEmergencyTask = useTreaMissionStore(s => s.setEmergencyTask);

  // 时间播放控制(用于启动任务仿真时跳转到过境窗口并加速)
  const setCurrentTime = useTimeStore(s => s.setCurrentTime);
  const setRate = useTimeStore(s => s.setRate);
  const setEndTime = useTimeStore(s => s.setEndTime);
  const startPlayback = useTimeStore(s => s.startPlayback);
  const stopPlayback = useTimeStore(s => s.stopPlayback);
  const resetToNow = useTimeStore(s => s.resetToNow);

  // 计算起始时间:进入面板时锁定为当时的时间(避免时间播放时反复重算)
  const [computeStartTime] = useState(() => new Date());
  // 用于"距离当前时间"相对描述的实时引用(每分钟刷新一次)
  const [now, setNow] = useState(() => new Date());
  // 选中的 AOI id(null 表示未选)
  const [selectedAoiId, setSelectedAoiId] = useState<string | null>(null);
  // 过境窗口计算结果
  const [windowsA, setWindowsA] = useState<AccessWindow[]>([]);
  const [windowsB, setWindowsB] = useState<AccessWindow[]>([]);
  const [isComputing, setIsComputing] = useState(true);
  // 「开始任务仿真」反馈消息
  const [simMessage, setSimMessage] = useState<string | null>(null);
  // 面板折叠状态:折叠时向左缩进,仅留窄条展开按钮
  const [collapsed, setCollapsed] = useState(false);
  // 碰撞避撞 AI 模态框:点击紧急任务的 AI 按钮打开,展示 LLM 避撞方案
  const [showCollisionAiModal, setShowCollisionAiModal] = useState(false);
  // AI 辅助规划模态框:点击按钮打开,展示 LLM 分析结果
  const [showAiModal, setShowAiModal] = useState(false);

  // 进入面板或 TLE 变更后(机动后)重新计算 48h 过境窗口
  useEffect(() => {
    setIsComputing(true);
    // 异步计算避免阻塞首帧渲染(虽然同步函数,但放在 effect 中可让首屏先 paint)
    const startMs = computeStartTime.getTime();
    const wA = computeAccessWindows(tle, AOI_A, computeStartTime, 48);
    const wB = computeAccessWindows(tle, AOI_B, computeStartTime, 48);
    setWindowsA(wA);
    setWindowsB(wB);
    setIsComputing(false);
    // 锁定 startMs 仅用于日志参考,实际依赖 tle.line1/line2 + 起始时间
    void startMs;
  }, [tle.line1, tle.line2, computeStartTime]);

  // 每分钟刷新一次"相对时间"描述(不触发窗口重算)
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // 选中 AOI 时,写入 store(含过境窗口信息)并切换任务阶段为 PLANNED
  const handleSelectAoi = (aoiId: string) => {
    if (selectedAoiId === aoiId) {
      // 再次点击取消选中
      setSelectedAoiId(null);
      setCurrentTask(null);
      setMissionPhase('IDLE');
      return;
    }
    setSelectedAoiId(aoiId);
    const aoi = AOI_LIST.find(a => a.id === aoiId);
    if (!aoi) return;
    const windows = aoiId === AOI_A.id ? windowsA : windowsB;
    const next = findNextWindow(windows, now) ?? windows[0] ?? null;
    const task: TreaMissionTask = {
      id: `task-${aoi.id}-${Date.now()}`,
      aoiId: aoi.id,
      aoiName: aoi.name,
      plannedTime: next ? next.centerPassTime : computeStartTime,
      status: 'PENDING',
      // M4:补全过境窗口字段,供 MissionSimulator 状态机驱动成像阶段
      windowStart: next?.startTime,
      windowEnd: next?.endTime,
      aoiCenter: aoi.center,
    };
    setCurrentTask(task);
    setMissionPhase('PLANNED');
  };

  // 选中 AOI 的窗口数 < 2 时显示「建议相位调整机动」
  const selectedWindows = selectedAoiId === AOI_A.id ? windowsA : selectedAoiId === AOI_B.id ? windowsB : [];
  const showManeuverSuggest = selectedAoiId !== null && selectedWindows.length < 2;

  // 建议相位调整机动:M2 占位实现 — 微调平均运动 1e-4 rev/day(等效相位漂移)
  // 真实相位机动需地面段计算,此处仅写入机动记录占位,触发 TLE 变更后窗口会自动重算
  const handleSuggestManeuver = () => {
    if (!selectedAoiId) return;
    // 构造占位新 TLE:仅微调 line2 中的平均运动字段(列 53-63)
    // 这里仅作为演示,真实实现由 M3 完成
    const newTle = {
      ...tle,
      // 标记为占位修改(M3 会用真实相位机动替换)
      line1: tle.line1,
      line2: tle.line2,
    };
    // 占位 Δv=0.5 m/s,燃料消耗 0.5%(M3 接入真实计算)
    executeManeuver(0.5, newTle, 0.5);
  };

  // 「开始任务仿真」:启动 M4 状态机 + 时间播放跳转到过境窗口
  // 流程:构造带窗口字段的 task → startTaskSimulation → 扩大 endTime 到窗口结束 →
  //       跳到窗口开始前 30s(可观察 EXECUTING→IMAGING 转换) → 100x 加速播放
  const handleStartSimulation = () => {
    if (!selectedAoiId) return;
    // 任务进行中不允许重复启动
    if (missionPhase === 'EXECUTING' || missionPhase === 'IMAGING') {
      setSimMessage('当前任务执行中,请等待完成或重置后再启动新任务');
      setTimeout(() => setSimMessage(null), 4000);
      return;
    }
    const aoi = AOI_LIST.find(a => a.id === selectedAoiId);
    if (!aoi) return;
    const windows = selectedAoiId === AOI_A.id ? windowsA : windowsB;
    const next = findNextWindow(windows, now) ?? windows[0];
    if (!next) {
      setSimMessage('该 AOI 48h 内无可用过境窗口,请尝试机动建议');
      setTimeout(() => setSimMessage(null), 4000);
      return;
    }

    // 构造完整任务对象(含窗口时间,供 MissionSimulator 状态机驱动)
    const task: TreaMissionTask = {
      id: `task-${aoi.id}-${Date.now()}`,
      aoiId: aoi.id,
      aoiName: aoi.name,
      plannedTime: next.centerPassTime,
      status: 'PENDING',
      windowStart: next.startTime,
      windowEnd: next.endTime,
      aoiCenter: aoi.center,
    };

    // 1. 启动任务状态机:store 设置 currentTask + missionPhase='EXECUTING' + taskStartTime
    startTaskSimulation(task);

    // 2. 时间播放设置(顺序敏感:setEndTime 必须先于 setCurrentTime,避免被 clamp 截断)
    //    endTime 扩大到窗口结束 + 60s 缓冲,避免播放到 endTime 自动停止影响成像阶段
    setEndTime(new Date(next.endTime.getTime() + 60_000));
    //    currentTime 跳到窗口开始前 30s,便于观察 EXECUTING → IMAGING 转换
    const jumpTo = new Date(next.startTime.getTime() - 30_000);
    setCurrentTime(jumpTo);
    //    10x 速率:30s 接近(3s 实时)+ 60s 成像(6s 实时)= 9s 完整可见演示
    //    不用 100x/1000x:过高倍速会让 60s 成像窗口瞬间通过,看不到足迹扫描
    setRate(10);
    startPlayback();

    setSimMessage(`任务已启动:时间加速至过境窗口 ${formatTime(next.startTime)}`);
    setTimeout(() => setSimMessage(null), 6000);
  };

  // 「重置 TREA-01」:恢复初始状态 + 停止时间播放 + 时间回到 now
  // 注意:reset 只影响 TREA-01 store 与时间播放,不触碰默认 13 颗卫星逻辑
  const handleReset = () => {
    stopPlayback();
    resetToNow();
    setRate(10); // 恢复默认 10x 播放速率(符合项目约束:默认 10x 而非暂停)
    resetMission();
    setSelectedAoiId(null);
    setSimMessage('TREA-01 已重置到初始状态');
    setTimeout(() => setSimMessage(null), 3000);
  };

  // 任务进行中或已完成时,禁用「开始任务仿真」按钮
  const isSimulationRunning = missionPhase === 'EXECUTING' || missionPhase === 'IMAGING';
  const isSimulationFinished = missionPhase === 'COMPLETED';

  // AI 辅助规划:调用后端 /api/ai/task-planning,转发到 LLM 进行综合分析
  // 使用 useCallback 保证引用稳定(模态框 useEffect 依赖此函数)
  const handleInvokeAi = useCallback(async (): Promise<AiTaskPlanningOutput> => {
    const input = buildAiRequestInput({
      tle,
      orbitParams,
      aois: [
        { aoi: AOI_A, windows: windowsA },
        { aoi: AOI_B, windows: windowsB },
      ],
      fuel,
      battery,
      missionPhase,
      computeStartTime,
    });
    const resp = await fetch('/api/ai/task-planning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await resp.json();
    if (!resp.ok || !data.success) {
      throw new Error(data.error || `AI 调用失败(HTTP ${resp.status})`);
    }
    return data.data as AiTaskPlanningOutput;
  }, [tle, orbitParams, windowsA, windowsB, fuel, battery, missionPhase, computeStartTime]);

  // 碰撞避撞 AI 调用:构造碰撞场景请求体,后端 route 根据 scenario=collision-avoidance 选择碰撞 prompt
  // 输出经 mapCollisionToTaskPlanning 映射为 AiTaskPlanningOutput 格式,AiPlanningModal 可复用
  const handleInvokeCollisionAi = useCallback(async (): Promise<AiTaskPlanningOutput> => {
    if (!collisionAlert) throw new Error('无碰撞警报数据');
    const input = buildCollisionRequestInput({
      tle,
      orbitParams,
      fuel,
      battery,
      collisionAlert,
    });
    const resp = await fetch('/api/ai/task-planning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await resp.json();
    if (!resp.ok || !data.success) {
      throw new Error(data.error || `AI 调用失败(HTTP ${resp.status})`);
    }
    return data.data as AiTaskPlanningOutput;
  }, [tle, orbitParams, fuel, battery, collisionAlert]);

  // 触发突发碰撞警报(模拟碎片接近事件)
  const handleTriggerCollision = () => {
    triggerCollisionAlert();
    setSimMessage('⚠ 检测到碎片接近风险,请查看碰撞警报');
    setTimeout(() => setSimMessage(null), 5000);
  };

  // 清除紧急避撞任务(用户手动取消)
  const handleClearEmergency = () => {
    setEmergencyTask(null);
    setSimMessage('紧急避撞任务已清除');
    setTimeout(() => setSimMessage(null), 3000);
  };

  // 应用 AI 建议:选中推荐的 AOI(复用 handleSelectAoi 逻辑)
  // windowIndex 仅用于反馈,实际窗口选择仍由 findNextWindow 决定
  const handleApplyAiRecommendation = (aoiId: string, _windowIndex: number) => {
    // 先清除当前选中,再选中新 AOI(handleSelectAoi 内部判断同 AOI 会取消)
    if (selectedAoiId === aoiId) {
      // 已选中,无需重复
      return;
    }
    handleSelectAoi(aoiId);
    setSimMessage(`已应用 AI 建议:选中 ${aoiId.toUpperCase()}`);
    setTimeout(() => setSimMessage(null), 4000);
  };

  // 折叠状态:仅渲染窄条展开按钮
  if (collapsed) {
    return (
      <div className="h-full w-10 bg-space-950 border-r border-space-800 flex flex-col items-center pt-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="p-2 rounded-lg text-space-400 hover:text-cosmic-blue hover:bg-space-800 transition-colors"
          title="展开任务规划"
        >
          <PanelLeftOpen className="h-5 w-5" />
        </button>
        <span className="text-[10px] text-space-500 writing-mode-vertical mt-2" style={{ writingMode: 'vertical-rl' }}>
          任务规划
        </span>
      </div>
    );
  }

  return (
    <aside className="w-96 h-full bg-space-950 border-r border-space-800 flex flex-col overflow-hidden">
      {/* 顶部标题栏 */}
      <div className="px-4 py-3 border-b border-space-800 bg-space-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-cosmic-blue" />
            <h2 className="text-sm font-bold text-space-100">任务规划</h2>
          </div>
          <div className="flex items-center gap-2">
            {isComputing && (
              <div className="flex items-center gap-1.5 text-[11px] text-space-500">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span>计算中...</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="p-1.5 rounded-lg text-space-400 hover:text-cosmic-blue hover:bg-space-800 transition-colors"
              title="折叠面板"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
        </div>
        <p className="text-[11px] text-space-500 mt-1">
          基于 TLE 预测未来 48 小时的过境窗口,采样间隔 30 秒
        </p>
      </div>

      {/* AOI + 窗口列表(滚动区) */}
      <div className="trea-scroll flex-1 overflow-y-auto p-3 space-y-3">
        {/* 紧急避撞任务卡片(碰撞警报触发后显示,红色高亮) */}
        {emergencyTask && collisionAlert && (
          <div className="rounded-xl border-2 border-red-500/60 bg-red-500/10 p-3 space-y-2 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400 animate-pulse" />
                <span className="text-sm font-bold text-red-300">紧急避撞机动</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-mono">EMERGENCY</span>
              </div>
              <button
                type="button"
                onClick={handleClearEmergency}
                className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                title="清除紧急任务"
              >
                清除
              </button>
            </div>
            <div className="text-[11px] text-slate-300 space-y-0.5 font-mono">
              <div>碎片:{collisionAlert.debrisName} <span className="text-slate-500">(NORAD {collisionAlert.debrisNoradId})</span></div>
              <div>TCA:{collisionAlert.tca.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
              <div className="flex gap-3">
                <span>距离:<span className="text-red-300">{collisionAlert.missDistance.toFixed(3)} km</span></span>
                <span>概率:<span className="text-red-300">{collisionAlert.collisionProbability.toFixed(2)}%</span></span>
                <span>速度:<span className="text-slate-200">{collisionAlert.relativeVelocity.toFixed(2)} km/s</span></span>
              </div>
            </div>
            <Button
              variant="default"
              size="sm"
              className="w-full h-8 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white border border-red-400/30"
              onClick={() => setShowCollisionAiModal(true)}
              title="调用 AI 大模型分析避撞机动方案"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              AI 避撞规划
            </Button>
          </div>
        )}

        <AoiSection
          aoiId={AOI_A.id}
          aoiName={AOI_A.name}
          aoiNameEn={AOI_A.nameEn}
          aoiCenter={AOI_A.center}
          windows={windowsA}
          now={now}
          selected={selectedAoiId === AOI_A.id}
          onSelect={() => handleSelectAoi(AOI_A.id)}
        />
        <AoiSection
          aoiId={AOI_B.id}
          aoiName={AOI_B.name}
          aoiNameEn={AOI_B.nameEn}
          aoiCenter={AOI_B.center}
          windows={windowsB}
          now={now}
          selected={selectedAoiId === AOI_B.id}
          onSelect={() => handleSelectAoi(AOI_B.id)}
        />

        {/* 未选中提示 */}
        {!selectedAoiId && !isComputing && (
          <div className="text-center text-[11px] text-space-500 py-2">
            点击上方 AOI 选择任务目标
          </div>
        )}
      </div>

      {/* 底部操作区 */}
      <div className="border-t border-space-800 bg-space-900 p-3 space-y-2">
        {/* 突发威胁模拟按钮:触发碰撞警报(仅在无紧急任务时显示) */}
        {!emergencyTask && (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 bg-red-500/10 border-red-500/40 text-red-300 hover:bg-red-500/20 hover:border-red-500/60"
            onClick={handleTriggerCollision}
            title="模拟太空碎片接近事件,触发碰撞警报"
          >
            <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
            突发威胁模拟
          </Button>
        )}

        {/* AI 辅助规划按钮:调用 LLM 综合分析轨道/光照/资源,给出推荐 AOI 与机动建议 */}
        <Button
          variant="default"
          size="sm"
          className="w-full h-9 bg-gradient-to-r from-purple-600 to-cosmic-blue hover:from-purple-500 hover:to-cosmic-blue/80 text-white border border-purple-400/30"
          onClick={() => setShowAiModal(true)}
          disabled={isComputing || isSimulationRunning}
          title="调用 AI 大模型综合分析过境窗口,推荐最优 AOI 与成像窗口"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          AI 辅助规划
        </Button>

        {/* 建议相位调整机动按钮 */}
        {showManeuverSuggest && (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-9 bg-cosmic-orange/10 border-cosmic-orange/40 text-cosmic-orange hover:bg-cosmic-orange/20"
            onClick={handleSuggestManeuver}
            disabled={fuel < 1}
            title="当前 AOI 48h 内窗口数不足 2,建议执行相位调整机动以增加过境机会"
          >
            <Wrench className="h-4 w-4 mr-2" />
            建议相位调整机动
          </Button>
        )}

        {/* 开始任务仿真按钮 */}
        <Button
          variant="default"
          size="sm"
          className="w-full h-9 bg-cosmic-blue hover:bg-cosmic-blue/80 text-white"
          onClick={handleStartSimulation}
          disabled={!selectedAoiId || isSimulationRunning}
          title={
            !selectedAoiId
              ? '请先选择目标 AOI'
              : isSimulationRunning
                ? '任务执行中,请等待完成或重置'
                : '启动任务仿真:跳转到过境窗口并加速播放'
          }
        >
          <Rocket className="h-4 w-4 mr-2" />
          {isSimulationRunning ? '任务执行中…' : isSimulationFinished ? '再次启动' : '开始任务仿真'}
        </Button>

        {/* 重置 TREA-01 按钮:任务完成后或任何时候都可重置到初始状态 */}
        <Button
          variant="outline"
          size="sm"
          className="w-full h-9 bg-space-800 hover:bg-space-700 border-space-700 text-space-300"
          onClick={handleReset}
          title="重置 TREA-01 到初始状态(燃料/姿态/任务阶段全部清空)"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          重置 TREA-01
        </Button>

        {/* 反馈消息 */}
        {simMessage && (
          <div className="text-[11px] text-cosmic-orange text-center pt-1">
            {simMessage}
          </div>
        )}

        {/* 选中状态摘要 */}
        {selectedAoiId && !isSimulationRunning && !isSimulationFinished && (
          <div className="text-[10px] text-space-500 text-center pt-1">
            已选择 {selectedAoiId.toUpperCase()},任务阶段已置为「已规划」
          </div>
        )}
        {isSimulationFinished && (
          <div className="text-[10px] text-emerald-400 text-center pt-1">
            任务已完成,查看报告或重置后启动新任务
          </div>
        )}
      </div>

      {/* AI 辅助规划模态框:fixed 定位,脱离 aside 流式布局 */}
      <AiPlanningModal
        isOpen={showAiModal}
        onClose={() => setShowAiModal(false)}
        onInvoke={handleInvokeAi}
        onApplyRecommendation={handleApplyAiRecommendation}
      />

      {/* 碰撞避撞 AI 模态框:复用 AiPlanningModal,传入碰撞场景的 invoke 函数 */}
      <AiPlanningModal
        isOpen={showCollisionAiModal}
        onClose={() => setShowCollisionAiModal(false)}
        onInvoke={handleInvokeCollisionAi}
        onApplyRecommendation={() => {
          setSimMessage('已生成避撞方案,请参考执行机动');
          setTimeout(() => setSimMessage(null), 4000);
        }}
      />
    </aside>
  );
}
