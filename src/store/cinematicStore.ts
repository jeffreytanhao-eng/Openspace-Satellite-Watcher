// 电影回放模式独立 Zustand Store
// 完全隔离于 treaMissionStore,不污染任务状态
// 只管理电影模式的播放状态(当前镜头/暂停/已用时长)
//
// 时间推进不在此 store 中 — 由 CinematicController 的 RAF 直接调 timeStore.setCurrentTime
// 此 store 只记录播放状态供 UI(进度条/字幕)消费

import { create } from 'zustand';

export interface CinematicState {
  /** 是否处于电影模式 */
  isActive: boolean;
  /** 当前镜头索引(0-based,指向 CINEMATIC_SHOTS) */
  currentShotIndex: number;
  /** 是否暂停 */
  isPaused: boolean;
  /** 当前镜头已用时长(实时秒) */
  shotElapsedSec: number;
  /** 总已用时长(实时秒) */
  totalElapsedSec: number;
}

export interface CinematicActions {
  /** 启动电影模式:重置状态并激活 */
  startCinematic: () => void;
  /** 暂停 */
  pauseCinematic: () => void;
  /** 继续 */
  resumeCinematic: () => void;
  /** 切换到下一镜头(重置 shotElapsedSec) */
  advanceShot: () => void;
  /** 退出电影模式(重置所有状态) */
  exitCinematic: () => void;
  /** RAF 每帧调用:累加已用时长(暂停时不累加) */
  tick: (deltaSec: number) => void;
}

export const useCinematicStore = create<CinematicState & CinematicActions>((set, get) => ({
  isActive: false,
  currentShotIndex: 0,
  isPaused: false,
  shotElapsedSec: 0,
  totalElapsedSec: 0,

  startCinematic: () =>
    set({
      isActive: true,
      currentShotIndex: 0,
      isPaused: false,
      shotElapsedSec: 0,
      totalElapsedSec: 0,
    }),

  pauseCinematic: () => set({ isPaused: true }),

  resumeCinematic: () => set({ isPaused: false }),

  advanceShot: () => {
    const { currentShotIndex } = get();
    set({ currentShotIndex: currentShotIndex + 1, shotElapsedSec: 0 });
  },

  exitCinematic: () =>
    set({
      isActive: false,
      currentShotIndex: 0,
      isPaused: false,
      shotElapsedSec: 0,
      totalElapsedSec: 0,
    }),

  tick: (deltaSec) => {
    const { isPaused } = get();
    if (isPaused) return;
    set((state) => ({
      shotElapsedSec: state.shotElapsedSec + deltaSec,
      totalElapsedSec: state.totalElapsedSec + deltaSec,
    }));
  },
}));
