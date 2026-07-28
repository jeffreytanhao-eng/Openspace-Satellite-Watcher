'use client';

// TREA-01 任务中心 Header
// missionMode=true 时替代原 HomePage 的 header,提供返回按钮和任务状态概览
// 不透明深色背景(用户偏好,不使用半透明/玻璃态)

import { Rocket, ArrowLeft, Satellite, Fuel, Battery, Activity, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useTreaMissionPhase,
  useTreaFuel,
  useTreaBattery,
  useTreaAttitude,
  useTreaPayloadStatus,
} from '@/store/treaMissionStore';
import { useCinematicStore } from '@/store/cinematicStore';
import type { MissionPhase } from '@/lib/trea/constants';

interface MissionHeaderProps {
  /** 退出任务中心,回到主页 */
  onExit: () => void;
}

// 任务阶段中文标签
const PHASE_LABELS: Record<MissionPhase, string> = {
  IDLE: '待命',
  PLANNED: '已规划',
  EXECUTING: '执行中',
  IMAGING: '成像中',
  COMPLETED: '已完成',
};

// 任务阶段对应颜色
const PHASE_COLORS: Record<MissionPhase, string> = {
  IDLE: 'text-space-400',
  PLANNED: 'text-cosmic-blue',
  EXECUTING: 'text-yellow-400',
  IMAGING: 'text-red-400',
  COMPLETED: 'text-emerald-400',
};

// 姿态模式中文标签
const ATTITUDE_LABELS: Record<string, string> = {
  Nominal: '标称',
  Roll: '侧摆',
  Pitch: '俯仰',
  Yaw: '偏航',
};

// 载荷状态中文标签
const PAYLOAD_LABELS: Record<string, string> = {
  STANDBY: '待机',
  IMAGING: '成像',
  OFF: '关闭',
};

export default function MissionHeader({ onExit }: MissionHeaderProps) {
  const missionPhase = useTreaMissionPhase();
  const fuel = useTreaFuel();
  const battery = useTreaBattery();
  const attitude = useTreaAttitude();
  const payloadStatus = useTreaPayloadStatus();
  // 电影回放模式状态(按钮文字/样式切换)
  const cinematicActive = useCinematicStore(s => s.isActive);
  const startCinematic = useCinematicStore(s => s.startCinematic);
  const exitCinematic = useCinematicStore(s => s.exitCinematic);

  return (
    <header className="h-16 bg-space-900 border-b border-space-800 flex items-center justify-between px-4 z-10">
      {/* 左侧:返回按钮 + 标题 */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className="h-9 bg-space-800 hover:bg-space-700 border-space-700 text-space-300"
          onClick={onExit}
          title="退出任务中心,回到主页"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回
        </Button>
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cosmic-purple to-cosmic-blue flex items-center justify-center">
          <Rocket className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-space-100">TREA-01 任务中心</h1>
          <p className="text-xs text-space-400">Remote Sensing Mission Simulation</p>
        </div>
      </div>

      {/* 中间:任务阶段 */}
      <div className="flex items-center gap-2 px-4 py-1.5 bg-space-800 border border-space-700 rounded-lg">
        <Activity className="h-4 w-4 text-cosmic-blue" />
        <span className="text-xs text-space-500">任务阶段</span>
        <span className={`text-sm font-semibold ${PHASE_COLORS[missionPhase]}`}>
          {PHASE_LABELS[missionPhase]}
        </span>
      </div>

      {/* 右侧:电影回放按钮 + 遥测状态(燃料/电量/姿态/载荷) */}
      <div className="flex items-center gap-4">
        {/* 电影回放按钮:紫色渐变(激活时变红) */}
        <Button
          variant="outline"
          size="sm"
          className={
            cinematicActive
              ? 'h-9 bg-red-700 hover:bg-red-600 border-red-400/40 text-white'
              : 'h-9 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 border-purple-400/40 text-white'
          }
          onClick={() => (cinematicActive ? exitCinematic() : startCinematic())}
          title={cinematicActive ? '退出电影模式' : '一键播放电影回放'}
        >
          <Film className="h-4 w-4 mr-1.5" />
          {cinematicActive ? '退出电影' : '电影回放'}
        </Button>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-space-800 border border-space-700 rounded-lg">
          <Satellite className="h-4 w-4 text-cosmic-blue" />
          <div className="flex flex-col">
            <span className="text-[10px] text-space-500 leading-tight">卫星</span>
            <span className="text-xs text-space-200 leading-tight">TREA-01</span>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-space-800 border border-space-700 rounded-lg">
          <Fuel className="h-4 w-4 text-emerald-400" />
          <div className="flex flex-col">
            <span className="text-[10px] text-space-500 leading-tight">燃料</span>
            <span className={`text-xs font-medium leading-tight ${fuel < 20 ? 'text-red-400' : 'text-space-200'}`}>
              {fuel.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-space-800 border border-space-700 rounded-lg">
          <Battery className="h-4 w-4 text-yellow-400" />
          <div className="flex flex-col">
            <span className="text-[10px] text-space-500 leading-tight">电量</span>
            <span className={`text-xs font-medium leading-tight ${battery < 20 ? 'text-red-400' : 'text-space-200'}`}>
              {battery.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-space-800 border border-space-700 rounded-lg">
          <div className="flex flex-col">
            <span className="text-[10px] text-space-500 leading-tight">姿态</span>
            <span className="text-xs text-space-200 leading-tight">{ATTITUDE_LABELS[attitude] ?? attitude}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-space-800 border border-space-700 rounded-lg">
          <div className="flex flex-col">
            <span className="text-[10px] text-space-500 leading-tight">载荷</span>
            <span className="text-xs text-space-200 leading-tight">{PAYLOAD_LABELS[payloadStatus] ?? payloadStatus}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
