// TREA-01 电影回放镜头脚本 v5(2 阶段简化版)
// ------------------------------------------------------------
// 用户需求:去掉阶段1/2的3D过程(远景/变轨),直接播放视频,之后显示任务报告结束。
//   1. 视频播放窗口(6秒真实视频)
//   2. 任务报告窗口(结束)
// 无进度条,无3D相机动画过程。

export type CameraAction =
  | 'resetView'    // 重置视角到东亚上空(远景)
  | 'focusTrea01'  // 飞向 TREA-01(拉近显示)
  | 'hold';        // 保持当前相机(视频/报告阶段不切换)

export interface CinematicShot {
  /** 镜头 ID */
  id: string;
  /** 阶段名称(用于日志) */
  name: string;
  /** 相机动作 */
  cameraAction: CameraAction;
  /** 阶段时长与时间推进 */
  transition: {
    /** 最大持续时长(实时秒) */
    maxDurationSec: number;
    /** 仿真时间倍速(0=不推进3D时间,用于视频/报告阶段) */
    timeScale: number;
  };
  /** 底部显示的文字(null=不显示) */
  subtitle?: string | null;
  /** 阶段3:显示视频播放窗口 */
  showVideo?: boolean;
  /** 阶段4:显示任务报告窗口 */
  showReport?: boolean;
}

export const CINEMATIC_SHOTS: CinematicShot[] = [
  {
    id: 'shot-01',
    name: '成像扫描',
    // hold:无3D相机过程,直接进入视频播放
    cameraAction: 'hold',
    transition: { maxDurationSec: 6, timeScale: 0 },
    subtitle: null,
    showVideo: true,
  },
  {
    id: 'shot-02',
    name: '任务报告',
    // 报告阶段恢复大屏播放:配合 CesiumGlobe 报告阶段不拦截跟踪,大屏卫星在跟踪状态下播放。
    // timeScale 用 10(与任务中心默认倍速一致):若用 1 倍速,LEO 卫星周期约 90 分钟,
    // 播放几秒内卫星位移肉眼不可见,看起来仍像"暂停"。
    cameraAction: 'hold',
    transition: { maxDurationSec: 999, timeScale: 10 },
    subtitle: null,
    showReport: true,
  },
];
