// TREA-01 电影回放镜头脚本 v4(4 阶段简化版)
// ------------------------------------------------------------
// 用户需求:去掉之前复杂的相机动画和扫描效果,简化为4阶段
//   1. 远景卫星移动 + "接受任务"(2秒)
//   2. 卫星拉近 + "变轨飞向目标区域"(3秒)
//   3. 视频播放窗口(6秒真实视频)
//   4. 任务报告窗口(结束)
// 无进度条,底部只显示阶段文字

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
    name: '接受任务',
    cameraAction: 'resetView',
    transition: { maxDurationSec: 2, timeScale: 1 },
    subtitle: '接受任务',
  },
  {
    id: 'shot-02',
    name: '变轨飞向目标区域',
    cameraAction: 'focusTrea01',
    transition: { maxDurationSec: 3, timeScale: 1 },
    subtitle: '变轨飞向目标区域',
  },
  {
    id: 'shot-03',
    name: '成像扫描',
    cameraAction: 'hold',
    transition: { maxDurationSec: 6, timeScale: 0 },
    subtitle: null,
    showVideo: true,
  },
  {
    id: 'shot-04',
    name: '任务报告',
    cameraAction: 'hold',
    transition: { maxDurationSec: 999, timeScale: 0 },
    subtitle: null,
    showReport: true,
  },
];
