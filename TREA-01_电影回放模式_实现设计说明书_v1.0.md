# TREA-01 电影回放模式（Cinematic Director Mode）
## 实现设计说明书 v1.0

**适用对象**：可直接导入 vibe coding 应用进行开发任务拆解与执行  
**版本**：v1.0  
**日期**：2026-07-28  
**关联文档**：`TREA-01_遥感任务仿真闭环_Phase0_开发规格说明书与开发计划书_v1.1`  
**目标**：在现有 TREA-01 任务中心基础上，增加一键「电影回放」能力，让任务全过程（规划确认 → 变轨 → 飞向目标 → 成像扫描 → 报告生成）以专业镜头语言自动呈现，形成强叙事、强视觉冲击的演示体验。

---

## 1. 设计目标与原则

### 1.1 核心目标
- 提供一键「电影回放」入口，自动完成完整任务叙事。
- 相机、仿真时间、任务状态机、可视化效果（燃烧弧、成像足迹等）完全同步。
- 演示时形成 60–90 秒的微型航天纪录片效果，适合复赛路演。

### 1.2 设计原则
- **不重写现有系统**：完全复用 `treaMissionStore`、`timeStore`、`MissionSimulator`、`useCesium` 的相机与实体能力。
- **时间驱动**：回放时强制接管仿真时间（加速 + 关键节点卡点），同时驱动相机序列。
- **可中断**：用户随时可暂停、跳过、退出回放，回到正常任务模式。
- **确定性**：预设镜头序列 + 任务阶段强绑定，保证每次演示效果一致。
- **低侵入**：用独立状态管理电影模式，不污染日常操作逻辑。

---

## 2. 用户流程

1. 用户在任务中心完成规划（选择 AOI，可选执行变轨）。
2. 点击「开始电影回放」按钮（或任务开始按钮旁的「电影模式」开关）。
3. 系统进入 `CINEMATIC` 状态：
   - 时间轴被接管，按预设节奏加速播放。
   - 相机按镜头脚本自动运动。
   - 关键节点叠加简短字幕 / 旁白文字（可选）。
4. 任务自然走到 `COMPLETED` 后，自动弹出报告，并提供「再看一次」和「退出电影模式」。
5. 用户可随时按 `Esc` 或点击「退出电影」返回正常交互模式。

---

## 3. 状态管理扩展

建议在 `treaMissionStore` 中增加以下字段（或新建独立 `cinematicStore`）：

```ts
cinematic: {
  isActive: boolean;          // 是否处于电影模式
  currentShotId: string;      // 当前镜头 ID
  isPaused: boolean;
  startTime: Date | null;     // 回放开始时的仿真时间
  // 可选：字幕队列、音效触发点
}
```

**核心 Action**：
- `startCinematic(missionPlan)`
- `pauseCinematic()` / `resumeCinematic()`
- `skipToShot(shotId)` / `exitCinematic()`
- `advanceShot()`（内部由时间或镜头完成回调触发）

---

## 4. 镜头脚本设计（核心）

定义一个声明式的镜头序列，建议放在 `src/lib/trea/cinematicShots.ts` 作为 SSOT。

### 4.1 镜头数据结构

```ts
type CinematicShot = {
  id: string;
  name: string;                    // 用于调试和字幕
  durationSec: number;             // 该镜头持续的仿真时间（秒）
  timeScale: number;               // 该镜头的时间倍速（相对正常）
  camera: {
    type: 'flyTo' | 'lookAt' | 'orbit' | 'hold';
    target: 'trea01' | 'aoi' | 'earth' | 'burnArc' | 'footprint';
    offset?: { heading: number; pitch: number; range: number };
    duration?: number;             // 相机运动时间（真实秒）
  };
  onEnter?: () => void;            // 进入镜头时触发（高亮、字幕、音效）
  onExit?: () => void;
  syncPhase?: 'PLANNING' | 'MANEUVER' | 'EXECUTING' | 'IMAGING' | 'COMPLETED';
};
```

### 4.2 推荐镜头序列（完整版约 70 秒）

| 镜头 ID   | 名称         | 时长（仿真） | 时间倍速 | 相机行为                                      | 同步阶段          |
|-----------|--------------|--------------|----------|-----------------------------------------------|-------------------|
| shot-01   | 全局开场     | 8s           | 1x       | 从东亚高空缓慢拉远，展示整圈轨道 + 两个 AOI   | PLANNING          |
| shot-02   | 聚焦卫星     | 6s           | 2x       | flyTo TREA-01，中等距离                       | -                 |
| shot-03   | 变轨燃烧     | 10s          | 5x       | 特写燃烧弧 + 新旧轨道对比，相机轻微环绕       | MANEUVER          |
| shot-04   | 飞向目标     | 12s          | 20x      | lookAt TREA-01，保持跟踪，时间快速推进到过境前 | EXECUTING         |
| shot-05   | 过境准备     | 5s           | 5x       | 拉近，显示即将进入的 AOI                      | EXECUTING         |
| shot-06   | 成像扫描     | 15s          | 3x       | 跟随卫星 + 实时成像足迹高亮，轻微俯视         | IMAGING           |
| shot-07   | 覆盖展示     | 8s           | 1x       | 拉高，展示已扫描区域 + 覆盖率数字             | IMAGING → COMPLETED |
| shot-08   | 收尾         | 6s           | 1x       | 缓慢拉远到全球视角，报告模态框淡入            | COMPLETED         |

每个镜头的 `onEnter` 可触发：
- 字幕（例如「执行相位调整机动」「开始对霍尔木兹海峡成像」）
- 音效
- 临时高亮某个实体

可额外准备一套「短版演示」（30 秒）镜头序列，方便快速路演。

---

## 5. 与现有系统的同步机制

### 5.1 时间控制
- 电影模式下，`timeStore` 的播放由 cinematic 控制器接管。
- 每个镜头有自己的 `timeScale` 和 `durationSec`（仿真时间）。
- 使用 `requestAnimationFrame` 或现有时间更新循环，精确推进到下一个镜头切换点。

### 5.2 任务状态机
- 复用 `MissionSimulator` 的阶段转换逻辑。
- 镜头脚本通过 `syncPhase` 与任务阶段对齐，确保成像足迹、报告弹出等效果在正确时机出现。
- 如果用户之前已执行过变轨，回放时直接使用当前 TLE；如果没有，可自动触发一次预设机动。

### 5.3 相机控制
- 完全复用 `useCesium` 已有的 `flyTo`、`lookAt`、`startTrackingTrea01`、`stopTrackingTrea01`。
- 新增轻量 `cinematicCameraController`，在 `preUpdate` 中根据当前镜头插值相机参数（可用 Cesium 的 `CameraFlightPath` 或手动 lerp）。

### 5.4 实体可见性
- 回放期间可临时隐藏不必要的 UI 面板，只保留必要的字幕层和退出按钮。
- 变轨相关实体（燃烧弧、旧轨道）在对应镜头自动显示。

---

## 6. 实现分层建议

```
src/
├── lib/trea/
│   └── cinematicShots.ts          // 镜头脚本定义（SSOT）
├── store/
│   └── treaMissionStore.ts        // 增加 cinematic 状态（或独立 cinematicStore）
├── components/trea/
│   ├── CinematicController.tsx    // 核心控制器（无 UI，纯逻辑）
│   ├── CinematicOverlay.tsx       // 字幕、进度条、退出按钮
│   └── MissionHeader.tsx          // 增加「电影回放」按钮
└── hooks/
    └── useCinematicCamera.ts      // 可选，封装镜头切换逻辑
```

**CinematicController 职责**：
1. 监听 `isActive`
2. 按时间推进当前镜头
3. 调用相机 API
4. 触发 `onEnter` / `onExit`
5. 与 `MissionSimulator` 和 `timeStore` 同步
6. 处理暂停 / 跳过 / 退出

---

## 7. 关键技术点与注意事项

1. **相机与时间解耦**：镜头的真实时长（用户感知）和仿真时长可以不同，通过 `timeScale` 控制。
2. **避免抖动**：切换镜头时先 `stopTracking`，再执行新的 `flyTo`/`lookAt`，并在过渡期间锁定用户输入。
3. **性能**：回放期间可临时降低轨道采样密度或关闭部分标签。
4. **可配置性**：镜头序列做成数组，方便后续增加「短版演示」和「完整版」两套脚本。
5. **字幕实现**：用绝对定位的 React 层即可，不必嵌入 Cesium。
6. **退出清理**：退出时必须恢复 `timeStore` 的正常控制权，并清理临时高亮与字幕。

---

## 8. 推荐开发顺序（Story 拆解）

| Story ID | 内容 | 优先级 |
|----------|------|--------|
| C1 | 定义镜头脚本数据结构 + 静态配置文件（`cinematicShots.ts`） | P0 |
| C2 | 在 store 中增加 cinematic 状态与基础 action | P0 |
| C3 | 实现 `CinematicController` 的时间推进与镜头切换逻辑（先不接相机） | P0 |
| C4 | 接入 Cesium 相机 API，完成前 3 个镜头 | P0 |
| C5 | 补全完整镜头序列 + 与任务阶段同步 | P0 |
| C6 | 字幕层 + 退出/暂停 UI + 音效触发点 | P1 |
| C7 | 打磨过渡、边界情况、短版/完整版切换 | P1 |

---

## 9. 预期效果与验收标准

**预期效果**：  
演示时只需点击一次「电影回放」，系统自动完成：  
全局展示 → 聚焦卫星 → 变轨特写 → 高速飞向目标 → 成像扫描 → 覆盖结果 → 报告弹出。

整个过程像一部 60–90 秒的微型航天纪录片，视觉连贯、叙事清晰。

**验收标准**：
- 一键启动后，无需人工干预即可完整走完全部镜头并弹出报告。
- 相机运动平滑，无明显抖动或穿模。
- 时间推进与任务阶段、成像足迹、变轨可视化严格同步。
- 用户可随时暂停 / 退出，退出后系统状态恢复正常。
- 支持短版（约 30s）与完整版两套脚本切换。

---

## 10. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 相机切换抖动 | 切换前强制 stopTracking，使用 Cesium 官方飞行路径或平滑插值 |
| 时间与阶段不同步 | 镜头脚本增加 syncPhase 约束，关键节点强制对齐任务状态机 |
| 回放中用户误操作 | 电影模式下锁定大部分交互，仅保留暂停/退出 |
| 性能下降 | 回放期间临时降低轨道采样点与标签数量 |

---

**文档结束**

本设计说明书可直接拆解为 vibe coding 任务列表。建议按 Story 顺序迭代，优先完成 C1–C5 即可获得可演示的核心效果。
