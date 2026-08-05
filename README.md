# 卫星守望者 · Satellite Watcher

一个开源的 Web 端空间态势感知（SSA, Space Situational Awareness）应用，基于 TLE 轨道数据实时计算并可视化近地轨道卫星的位置与轨迹。支持 2D / 3D 双视角切换、时间回放、星座临时导入、标签管理与卫星图片管理；内置 **TREA-01 遥感任务仿真闭环**（任务规划 → 变轨可视化 → 成像仿真 → 报告导出）与 **第一视角驾驶舱**，并集成 **AI 大模型辅助任务规划**。默认视角为东亚区域（中国上空）。

---

## 功能介绍

### 可视化引擎

- **2D / 3D 双视角**：基于 MapLibre GL 的 2D 地图与基于 CesiumJS 的 3D 地球，一键无缝切换
- **默认东亚视角**：打开页面时地球/地图自动聚焦中国区域（经度 110°E，纬度 35°N）
- **实时轨道渲染**：使用 satellite.js 的 SGP4/SDP4 算法实时计算卫星位置，绘制多圈预测轨道线
- **高清地球底图**：态势感知、任务中心、第一视角三处统一使用 **Esri World Imagery 高清卫星影像**（免费、无需 token，城市分辨率达 0.3m），替代默认低清 NaturalEarthII；可通过 `NEXT_PUBLIC_EARTH_IMAGERY=naturalearth` 一键回退
- **卫星定位**：点击详情面板的定位图标，相机平滑飞至卫星当前位置
- **3D 模型**：部分卫星预置 GLB 3D 模型，**选中卫星时在 Cesium 内渲染**（统一初始大小，支持鼠标滚轮缩放）；未选中或无模型时显示光点
- **NASA 图片搜索**：集成 NASA 媒体库，一键搜索卫星配图
- **全屏按钮**：三处界面（态势感知 / 任务中心 / 第一视角）右上角提供全屏切换按钮，支持 ESC 退出并自动同步图标

### 卫星管理

- **卫星搜索**：支持按 NORAD ID / 名称快速搜索（筛选面板已精简，数据预导入为 PAYLOAD 载荷，无需国别/类型筛选）
- **批量操作**：一键显示/隐藏卫星
- **详情面板**：展示卫星元数据、TLE 原文、轨道参数（近地点 / 远地点 / 周期 / 倾角 / 偏心率）、图片和3D模型
- **标签系统**：查看预设标签分类（当前版本标签写入功能暂不开放）

### TREA-01 遥感任务仿真闭环

进入"任务中心"后，主屏切换为 TREA-01 专用任务视图，仅显示 TREA-01 卫星光点与轨道，隐藏默认 13 颗卫星：

- **任务规划**：左侧面板自动计算未来 48 小时内 TREA-01 对两个 AOI（南海西沙—菲律宾海域 / 霍尔木兹海峡）的过境窗口（最大仰角、持续时间、中心时刻），支持单选 AOI 进入规划态
- **AI 辅助规划**：调用 LLM 大模型（火山引擎方舟 Doubao）综合分析轨道力学、光学遥感约束、卫星资源，输出 AOI 评分对比、推荐窗口、机动建议、风险评估与执行步骤，一键应用建议
- **变轨可视化**：执行相位调整机动后，渲染 5 秒新旧轨道渐变对比动画（旧轨道灰色虚线渐隐、新轨道青色发光实线渐显），TLE 自动更新驱动位置传播切换；轨道线使用 CallbackProperty 实时跟随 TLE 变化，避免变轨后轨道线停留在旧位置
- **成像仿真**：任务状态机驱动 EXECUTING → IMAGING → COMPLETED 转换，实时渲染传感器成像足迹（200km 刈幅），扫描覆盖 AOI
- **任务报告**：任务完成后弹出报告模态框，含任务摘要、成像时间、AOI 覆盖、机动记录与模拟遥感影像，支持导出打印
- **电影回放**：对地遥感扫描任务完成后可一键播放 4 阶段电影回放（接受任务 → 变轨飞向目标区域 → 成像扫描视频 → 任务报告），任务期间自动生成经过 AOI 上空的虚拟轨道使卫星跳转至目标区域，完成后返回原轨道；仅对地遥感任务可用，紧急避撞任务不触发
- **紧急避撞任务**：突发碎片接近警报触发红色预警模态框，生成 3 个躲避计划（沿迹微调/径向机动/组合机动）供选择；选择计划后执行机动切换轨道，播放 12 秒避撞机动视频，随后自动回到大屏显示成功画面并演示新旧轨道对比动画；跟踪状态下执行变轨会持续跟踪卫星，直至变轨完成
- **TREA-01 卫星视图**：右侧遥测面板上方展示卫星线框示意图，含跟踪按钮（点击后相机自动跟随 TREA-01 轨迹）
- **面板折叠**：左侧"任务规划"面板与右侧"遥测仪表盘"面板均支持一键缩进折叠，大屏复位键可将视角重置为东亚上空

### 第一视角驾驶舱（First-Person Cockpit）

通过任务中心或直接访问 `/cockpit` 进入 TREA-01 第一视角追尾驾驶舱，沉浸式体验卫星轨道飞行：

- **独立 Cesium 实现**：驾驶舱使用独立的轻量化 Cesium 实例，直接操作 Model Primitive（而非 Entity 系统），避免连续渲染模式下模型抖动与消失
- **追尾视角相机**：相机锁定在 TREA-01 卫星后方，支持滚轮缩放调整距离、方向键控制视角偏转
- **交通卫星系统**：5 颗交通卫星按 Round-robin 轮换调度，首次启动后 **20 秒内（10x 倍速）** 出现第一颗，之后每 **30-45 秒** 交会一次；卫星以 3D 模型形式从视野中飞越，支持距离判断与可见时长控制
- **昼夜变化**：白天使用 Esri World Imagery 高清影像，夜间叠加 NASA Black Marble 城市灯光纹理，地球随光照自转呈现真实昼夜过渡
- **遥测仪表盘**：向第一视角驾驶舱与任务中心复用高密度紧凑遥测面板，3×3 网格无需滚动即展示位置、速度、姿态、燃料、电池、载荷、链路、告警与轨道参数
- **卫星线框示意图**：驾驶舱内显示 TREA-01 卫星线框图，增强驾驶舱沉浸感

> 驾驶舱与任务中心之间通过全页面跳转（`window.location.href`）切换，避免 Next.js RSC 请求竞态导致的导航失效。

### 数据导入（临时）

- **Celestrak 导入**：按分类（stations/visual/starlink/gps等）或 NORAD ID/名称 从 Celestrak 实时拉取 TLE
- **星座批量导入**：预置主流星座（Starlink、Iridium、GPS、北斗、风云等）一键导入；**自动过滤非 PAYLOAD**（碎片/火箭体），仅导入有效载荷卫星；同星座卫星共享 3D 模型与图片
- **文件导入**：支持标准 TLE 格式文本文件（纯前端解析，不上传服务器）
- **单次导入上限**：100颗卫星，页面总数上限 200颗
- **数据隔离**：用户导入/删除/隐藏操作仅在当前浏览器会话中生效，刷新页面恢复服务器默认数据

### 数据管理（需密码）

- **轨道数据刷新（TLE）**：输入密码后从 Celestrak 同步所有默认卫星的最新 TLE，自动写入数据库，永久生效
- **图片上传**：输入密码后为卫星上传自定义图片（base64 存储，≤2MB），写入数据库永久保存
- **密码记忆**：密码验证通过后保存在当前标签页会话中（sessionStorage），关闭标签页清除

### 时间控制

- **时间回放**：可拖动时间轴查看历史或未来时刻的卫星位置
- **播放控制**：默认 **10× 倍速播放**（非暂停），支持多档倍速 / 暂停 / 重置至当前时刻
- **轨道预测**：基于 TLE 轨道根数预测未来多圈轨迹
- **轨道缓存**：自动缓存计算好的轨道点，重复查看同一时刻无需重新计算

---

## API 服务

| 路由 | 方法 | 需要密码 | 说明 |
|------|------|---------|------|
| `/api/space-objects` | GET | 否 | 获取所有默认卫星（含 TLE、图片），5min 内存缓存 |
| `/api/tle/refresh` | POST | **是** | 从 Celestrak 刷新 TLE 并写入数据库 |
| `/api/tle/import/celestrak` | POST | 否 | 按分类从 Celestrak 导入（代理，单次≤100颗） |
| `/api/tle/import/constellation` | GET/POST | 否 | 获取/导入星座列表（自动过滤非 PAYLOAD） |
| `/api/tle/import/search` | GET | 否 | 按名称/ID搜索 Celestrak |
| `/api/nasa-media` | GET | 否 | 检索 NASA 媒体库 |
| `/api/nasa-image/proxy` | GET | 否 | NASA 图片代理（解决跨域） |
| `/api/admin/verify` | POST | 否 | 密码验证（敏感操作前置校验） |
| `/api/admin/upload-image` | POST | **是** | 上传卫星图片到数据库（base64） |
| `/api/admin/seed` | POST | **是** | 初始化种子数据 |
| `/api/ai/task-planning` | POST | 否 | AI 辅助任务规划（代理 LLM，需配置 LLM 环境变量） |
| `/api/tags` | GET | 否 | 获取标签列表 |

> 写操作（新增/删除/修改卫星、标签）暂不开放，将在用户系统版本中引入。

---

## 安全防护

应用部署在公网环境下，已实施多层防护抵御 DDoS 与滥用：

| 防护层 | 机制 |
|-------|------|
| **Vercel 平台层** | 自带 DDoS 防护、全球 CDN 加速、自动 HTTPS；Serverless Functions 自动扩缩容 |
| **Next.js Middleware 层** | 内存级 IP 限流；全局并发≤50 返回 503；安全响应头（X-Frame-Options、X-Content-Type-Options、CSP） |
| **API 参数校验层** | Celestrak GROUP 白名单防注入；搜索参数长度≤100字符；pageSize 上限100；导入结果截断到100颗；星座导入过滤非 PAYLOAD；AI 路由输入校验 + 55s 超时 |
| **密码验证** | `crypto.timingSafeEqual` 时序安全比较；敏感操作（TLE刷新、图片上传）需先经 `/api/admin/verify` 前置校验；密码保存在 sessionStorage |
| **密钥隔离** | LLM API key/EP 通过环境变量读取，仅存于 Vercel 服务器环境变量（`.env.local` 本地开发），绝不返回前端；`.env.local` 已在 `.gitignore` |

---

## 技术框架

| 层级 | 技术 | 说明 |
|------|------|------|
| **框架** | Next.js 14 (App Router) | React 全栈框架，支持 SSR / API Routes / Standalone 输出 |
| **语言** | TypeScript 5.5 | 全量类型安全 |
| **UI 库** | React 18 | 函数组件 + Hooks |
| **样式** | Tailwind CSS 3 + shadcn/ui | 原子化 CSS + 可定制组件库 |
| **图标** | lucide-react | 轻量 SVG 图标 |
| **3D 地球** | CesiumJS (@cesium/engine) | WebGL 3D 地球渲染 |
| **2D 地图** | MapLibre GL JS | 开源矢量瓦片地图 |
| **轨道计算** | satellite.js | SGP4/SDP4 轨道传播算法 |
| **3D 模型** | Cesium 内置 GLB 渲染 | 选中卫星时加载 GLB 模型（统一初始大小 + 滚轮缩放） |
| **状态管理** | Zustand | 轻量全局状态，支持选择器订阅 |
| **数据库** | PostgreSQL + Prisma ORM | 关系型数据库与类型安全 ORM |
| **AI/LLM** | 火山引擎方舟 Ark（Doubao） | OpenAI 兼容协议，AI 辅助任务规划（禁用 thinking 降至 ~23s） |

### 项目结构

```
src/
├── app/                      # Next.js App Router
│   ├── api/                  # API 路由
│   │   ├── admin/            # 管理员接口（verify 密码校验、seed、图片上传，需密码）
│   │   ├── ai/task-planning/ # AI 辅助任务规划（代理 LLM）
│   │   ├── nasa-image/       # NASA 图片代理
│   │   ├── nasa-media/       # NASA 媒体检索
│   │   ├── space-objects/    # 卫星数据查询（5min 内存缓存）
│   │   ├── tags/             # 标签查询
│   │   └── tle/
│   │       ├── import/       # TLE 导入（Celestrak代理/星座/搜索）
│   │       └── refresh/      # TLE 刷新（需密码，写DB）
│   ├── cockpit/
│   │   └── page.tsx          # 第一视角驾驶舱页面（SSR disabled）
│   ├── layout.tsx
│   └── page.tsx              # 主页面
├── components/
│   ├── HomePage.tsx          # 主页面布局与逻辑（含密码弹窗、任务模式切换、面板折叠）
│   ├── cockpit/
│   │   └── ChaseCockpit.tsx  # 第一视角驾驶舱主组件（追尾视角 + 遥测 + 线框图）
│   ├── trea/                 # TREA-01 任务中心组件
│   │   ├── MissionHeader.tsx       # 任务中心顶部栏（含电影回放按钮）
│   │   ├── TaskListPanel.tsx       # 任务规划面板（过境窗口 + AI 辅助按钮）
│   │   ├── AiPlanningModal.tsx    # AI 规划结果展示模态框
│   │   ├── TelemetryDashboard.tsx  # 遥测仪表盘（任务中心与驾驶舱共用，紧凑高密度）
│   │   ├── TreaSatelliteView.tsx   # TREA-01 卫星线框示意图 + 跟踪
│   │   ├── ManeuverPanel.tsx       # 变轨控制面板
│   │   ├── MissionSimulator.tsx    # 任务仿真状态机（纯逻辑）
│   │   ├── MissionReportModal.tsx  # 任务报告模态框（含导出）
│   │   ├── CinematicController.tsx # 电影回放控制器（4 阶段流程调度）
│   │   ├── CinematicOverlay.tsx    # 电影回放 UI 覆盖层（字幕/视频/报告）
│   │   ├── ScanVideoModal.tsx      # 成像扫描视频播放窗口
│   │   ├── AvoidanceVideoModal.tsx # 避撞机动视频播放窗口
│   │   └── CollisionAlertModal.tsx # 碰撞警报模态框（躲避计划选择）
│   ├── FullscreenButton.tsx  # 全屏切换按钮（三处界面复用，支持 ESC）
│   ├── ui/                   # 业务 UI 组件
│   │   ├── ImportModal.tsx       # 导入弹窗（支持滚动）
│   │   ├── SatelliteDetailPanel.tsx  # 卫星详情面板
│   │   ├── SatelliteList.tsx     # 卫星列表
│   │   ├── TimeControlBar.tsx    # 时间控制
│   │   └── ...
│   └── visualization/        # 可视化组件
│       ├── CesiumGlobe.tsx       # 3D 地球（默认东亚视角 + 任务模式 + 变轨可视化）
│       ├── MapLibreMap.tsx       # 2D 地图（默认东亚视角）
│       └── ...
├── hooks/
│   ├── useCesium.ts         # Cesium 主视图封装（实体管理、跟踪、AOI、变轨弧）
│   ├── useChaseViewer.ts    # Cesium 驾驶舱封装（追尾视角、交通卫星调度、滚轮缩放）
│   └── useFullscreen.ts     # 全屏状态管理（全屏/退出 + fullscreenchange 监听 + webkit 兼容）
├── lib/
│   ├── api/client.ts         # API 客户端
│   ├── security.ts           # 密码验证（timingSafeEqual）
│   ├── cesium/
│   │   └── imagery.ts        # 地球影像源模块（Esri World Imagery / NaturalEarthII 可切换）
│   ├── cockpit/
│   │   └── traffic-sats.ts   # 交通卫星 TLE 生成与调度算法（Round-robin）
│   ├── tle/                  # TLE 解析与轨道计算（SSOT）
│   │   ├── parser.ts            # TLE 解析
│   │   ├── orbit.ts             # SGP4 轨道传播与参数计算
│   │   ├── generateMissionTle.ts # 生成经过 AOI 上空的虚拟任务轨道 TLE
│   │   └── tleFormat.ts        # TLE 字段替换与校验和工具
│   ├── trea/                 # TREA-01 任务逻辑
│   │   ├── constants.ts        # AOI 定义、传感器参数、初始 TLE
│   │   ├── access.ts           # 过境窗口计算（仰角/持续时间）
│   │   ├── ai-prompt.ts        # AI Prompt 设计（SSOT）+ 请求体构造
│   │   ├── cinematicShots.ts   # 电影回放镜头脚本（4 阶段配置）
│   │   └── report.ts           # 任务报告生成
│   ├── prisma.ts             # Prisma 客户端
│   ├── translations.ts       # 国家/类型翻译
│   └── mock/satellites.ts    # 默认卫星数据（DB不可用时fallback）
├── middleware.ts             # 全局IP限流+安全头
└── store/                    # Zustand 状态
    ├── satelliteStore.ts      # 卫星列表/选中/跟踪
    ├── timeStore.ts           # 时间播放（默认 10x）
    ├── treaMissionStore.ts    # TREA-01 任务状态（TLE/轨道/燃料/任务阶段/避撞）
    └── cinematicStore.ts      # 电影回放播放状态（当前镜头/暂停/已用时长）

prisma/
└── schema.prisma             # 数据库模型定义

public/
├── models/                   # 预置 3D 模型（GLB）
├── textures/                 # 地球纹理（Black Marble 夜间灯光）
├── trea/                     # TREA-01 资源（模拟遥感影像 + 成像/避撞视频 + 线框图）
└── cesium/                   # Cesium 静态资源（Workers、Assets）

deploy/                       # Docker 自托管部署
├── Dockerfile                # 三阶段构建（deps → builder → runner）
├── docker-compose.yml        # 四服务编排（postgres + migrate + app + caddy）
├── Caddyfile                 # Caddy 反向代理 + 自动 HTTPS
├── deploy.sh                 # 一键部署脚本
└── README.md                 # 部署详细文档
```

---

## 生产架构

支持两种部署方式：**Vercel Serverless**（零运维）与 **Docker Compose 自托管**（全可控）。

### Vercel 部署架构

```
┌─────────────┐    HTTPS     ┌──────────────────────────┐    HTTPS   ┌──────────────────┐
│  全球用户    │ ───────────→ │  Vercel (Serverless)      │ ────────→ │ Celestrak / NASA │
│             │   (CDN)     │                          │           │ (外部数据API)     │
│             │              │  · 自动 HTTPS / CDN       │           └──────────────────┘
│             │              │  · Next.js SSR + API      │
│             │              │  · API内存缓存             │ ────┐
│             │              │  · 密码验证+限流           │     │
│             │              │  · 客户端状态隔离          │     ↓
└─────────────┘              │                          │  Vercel Postgres (Neon)
                             │                          │  · 13颗默认卫星
                             │                          │  · TLE/标签/图片
                             └──────────────────────────┘
```

### Docker Compose 自托管架构

```
┌─────────────┐    HTTPS     ┌───────────┐  反代  ┌─────────────┐
│   用户      │ ───────────→ │   Caddy   │ ─────→ │  Next.js App │
│             │              │ (自动HTTPS)│ :3000  │ (Standalone) │
└─────────────┘              └─────┬─────┘       └──────┬──────┘
                                    │                     │
                                    │                ┌────▼──────┐
                                    │                │ PostgreSQL │
                                    │                │ (卷持久化) │
                                    │                └───────────┘
                                    │
                                    └─ migrate 一次性服务: prisma db push + seed
```

- **Caddy**：自动申请/续期 Let's Encrypt 证书，HTTP→HTTPS 跳转，反向代理到 Next.js
- **Next.js Standalone**：Node 服务运行 `server.js`，Cesium 走 CDN
- **PostgreSQL**：13 颗默认卫星 + 8 星座 + 标签，Docker 卷持久化
- **migrate**：容器启动时一次性跑 `prisma db push` + 幂等 seed，完成后退出

详细部署文档见 [deploy/README.md](deploy/README.md)。

---

### 数据模型说明

- **服务器默认数据**：数据库中存储 13 颗默认卫星 + 8 个预导入星座（Starlink/Iridium/GPS/北斗/风云等 PAYLOAD 卫星）的基础信息和 TLE 数据，所有用户共享；页面初始仅显示 13 颗默认卫星，其他预导入数据需用户显式导入后显示
- **用户操作（临时）**：导入、删除、隐藏卫星等操作在浏览器端 Zustand store 中完成，刷新页面恢复默认
- **管理员操作（永久）**：TLE 刷新和图片上传需密码验证，成功后写入数据库，所有用户可见

---

## 本地开发

### 环境要求

- Node.js ≥ 18.17
- PostgreSQL ≥ 14（或使用 Neon 云端数据库；本地无数据库时自动使用内置默认数据）
- npm ≥ 9

### 安装与启动

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 DATABASE_URL 和 ADMIN_PASSWORD（本地开发可不填DATABASE_URL，使用内置默认数据）

# 3. 启动开发服务器
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

> 本地开发无需配置 PostgreSQL，API 会自动 fallback 到内置的 13 颗默认卫星数据。

### 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | 生产必填 |
| `POSTGRES_URL_NON_POOLING` | Prisma schema 使用的数据库连接字符串 | 生产必填 |
| `ADMIN_PASSWORD` | 操作密码（TLE刷新、图片上传） | ✅ |
| `NODE_ENV` | 运行环境 | 生产必填 |
| `LLM_API_KEY` | 火山引擎方舟 API key（AI 辅助任务规划） | AI 功能必填 |
| `LLM_API_URL` | LLM 接入点 base URL（如 `https://ark.cn-beijing.volces.com/api/v3`） | AI 功能必填 |
| `LLM_MODEL` | LLM 模型 EP（如 `ep-xxxxxxxxxxxx-xxxxxx`） | AI 功能必填 |
| `NEXT_PUBLIC_EARTH_IMAGERY` | 地球影像源：`esri`（World Imagery 高清卫星影像，默认）或 `naturalearth`（回退至低清 NaturalEarthII） | 否 |

> LLM 凭据仅存于服务器端（`.env.local` 本地开发 / Vercel 环境变量），已在 `.gitignore`，不入库。未配置时 AI 路由返回 503 `MISSING_CONFIG`，其余功能不受影响。

### 默认卫星

初始化后包含 13 颗默认卫星：

| NORAD ID | 名称 | 说明 |
|----------|------|------|
| 25544 | ISS (ZARYA) | 国际空间站 |
| 48274 | CSS (TIANHE) | 中国空间站-天和核心舱 |
| 53239 | CSS (WENTIAN) | 中国空间站-问天实验舱 |
| 54216 | CSS (MENGTIAN) | 中国空间站-梦天实验舱 |
| 20580 | HST | 哈勃太空望远镜 |
| 27424 | AQUA | NASA 地球观测卫星 |
| 25994 | TERRA | NASA 地球观测卫星 |
| 28376 | AURA | NASA 大气观测卫星 |
| 39084 | LANDSAT 8 | NASA 陆地观测卫星 |
| 39634 | SENTINEL-1A | 欧空局雷达卫星 |
| 43013 | NOAA 20 (JPSS-1) | NOAA 气象卫星 |
| 44714 | STARLINK-1008 | Starlink 卫星 |
| 41270 | NOAA 16 DEB | NOAA 16 碎片（演示用） |

---

## 部署方式

支持两种部署方式，按需选择。

### Vercel 部署（零运维，推荐）

1. 将代码推送到 GitHub
2. 在 Vercel 控制台导入仓库
3. 创建 Vercel Postgres 数据库（Storage → Create Database → Postgres）
4. 添加环境变量：`DATABASE_URL`（使用 `POSTGRES_URL_NON_POOLING` 值）、`ADMIN_PASSWORD`、`LLM_API_KEY`、`LLM_API_URL`、`LLM_MODEL`
5. Deploy
6. 部署成功后，在本地执行 `npm run db:seed` 初始化数据库表结构和种子数据
7. AI 路由已配置 `maxDuration = 60`，Hobby plan 支持（AI 调用实测 ~23s）；添加环境变量后需 Redeploy 生效

### Docker Compose 自托管

适用于有自有服务器、需要完全控制权的场景。使用 Caddy 自动申请 HTTPS 证书，PostgreSQL 数据卷持久化，一键部署。

**前置条件：**
- Linux 服务器（已装 Docker Engine + Docker Compose v2）
- 域名已解析到服务器 IP（用于 HTTPS 证书）
- 防火墙开放 80 和 443 端口

**快速开始：**

```bash
# 克隆代码
git clone <你的仓库地址>
cd satellite-watcher

# 配置环境变量
cp deploy/.env.example deploy/.env
# 编辑 deploy/.env，填入 DOMAIN / ACME_EMAIL / LLM_API_KEY / ADMIN_PASSWORD 等

# 一键部署
sh deploy/deploy.sh
```

部署后首次启动会自动：
- 构建 Next.js 镜像（三阶段 Dockerfile）
- 启动 PostgreSQL 并持久化数据卷
- 跑 `prisma db push` + 幂等 seed（13 颗默认卫星 + 8 星座 + 标签）
- Caddy 自动申请 Let's Encrypt HTTPS 证书
- 反向代理到 Next.js 应用

详细文档见 [deploy/README.md](deploy/README.md)。

### 部署更新流程

**Vercel**：代码推送到 GitHub 后自动重新部署。

**Docker 自托管**：

```bash
git pull
docker compose -f deploy/docker-compose.yml up -d --build
```

---

## 许可证

Apache License 2.0
