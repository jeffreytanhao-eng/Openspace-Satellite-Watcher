// TREA-01 电影回放模式镜头脚本 SSOT
// 8 镜头完整版,总时长 32 秒
//
// 镜头切换由两个条件驱动:时长上限(maxDurationSec) + 阶段触发(triggerPhase)
// timeScale 控制仿真时间推进速度(不用 timeStore.setRate,因为它只支持 [0,1,10,100,1000])

/** 相机行为类型(进入镜头时执行) */
export type CameraAction =
  | 'resetView'        // 重置视角到东亚上空(20000km)
  | 'focusTrea01'      // 飞向 TREA-01(800km,能看到 3D 模型)
  | 'startTracking'    // 开始跟踪 TREA-01(preUpdate + lookAt)
  | 'stopTracking'     // 停止跟踪(释放 preUpdate 监听器)
  | 'zoomOutCoverage'  // 覆盖展示:停止跟踪后飞向 AOI 上空 5000km 拉远
  | 'hold';            // 保持当前相机(不切换)

/** 镜头切换条件 */
export interface ShotTransition {
  /** 最大持续时长(实时秒,用户感知时间) */
  maxDurationSec: number;
  /** 时间倍速(仿真秒/实时秒) */
  timeScale: number;
  /** 阶段触发:当 missionPhase 匹配时立即切换(可选) */
  triggerPhase?: 'IMAGING' | 'COMPLETED';
}

/** 单个镜头定义 */
export interface CinematicShot {
  id: string;
  name: string;
  nameEn: string;
  cameraAction: CameraAction;
  transition: ShotTransition;
}

/** 镜头序列(8 镜头,32 秒)
 *
 * 时间线设计:
 *   启动时 currentTime = windowStart - 170s
 *   shot-01: 3s×1x  = +3s   → 全局展示
 *   shot-02: 3s×2x  = +6s   → 聚焦卫星
 *   shot-03: 4s×1x  = +4s   → 变轨燃烧(轨道渐变动画)
 *   shot-04: 进入时直接跳到 windowStart-10s(不受原轨道限制)
 *           5s×2x  = +10s  → 到达 windowStart,进入 IMAGING
 *   shot-05: 3s×5x  = +15s  → 过境准备
 *   shot-06: 6s×3x  = +18s  → 成像扫描(扫描带累积)
 *   shot-07: 4s×1x  = +4s   → 覆盖展示
 *   shot-08: 4s×1x  = +4s   → 收尾
 */
export const CINEMATIC_SHOTS: CinematicShot[] = [
  {
    id: 'shot-01',
    name: '全局开场',
    nameEn: 'Opening',
    cameraAction: 'resetView',
    transition: { maxDurationSec: 3, timeScale: 1 },
  },
  {
    id: 'shot-02',
    name: '聚焦卫星',
    nameEn: 'Focus',
    cameraAction: 'focusTrea01',
    transition: { maxDurationSec: 3, timeScale: 2 },
  },
  {
    id: 'shot-03',
    name: '变轨燃烧',
    nameEn: 'Maneuver',
    cameraAction: 'hold',
    transition: { maxDurationSec: 4, timeScale: 1 },
  },
  {
    id: 'shot-04',
    name: '飞向目标',
    nameEn: 'Approach',
    cameraAction: 'startTracking',
    transition: { maxDurationSec: 5, timeScale: 2, triggerPhase: 'IMAGING' },
  },
  {
    id: 'shot-05',
    name: '过境准备',
    nameEn: 'Preparation',
    cameraAction: 'hold',
    transition: { maxDurationSec: 3, timeScale: 5 },
  },
  {
    id: 'shot-06',
    name: '成像扫描',
    nameEn: 'Imaging',
    cameraAction: 'hold',
    transition: { maxDurationSec: 6, timeScale: 3, triggerPhase: 'COMPLETED' },
  },
  {
    id: 'shot-07',
    name: '覆盖展示',
    nameEn: 'Coverage',
    cameraAction: 'zoomOutCoverage',
    transition: { maxDurationSec: 4, timeScale: 1 },
  },
  {
    id: 'shot-08',
    name: '收尾',
    nameEn: 'Complete',
    cameraAction: 'resetView',
    transition: { maxDurationSec: 4, timeScale: 1 },
  },
];

/** 电影模式启动时的仿真时间提前量(秒) */
export const CINEMATIC_LEAD_TIME_SEC = 170;
