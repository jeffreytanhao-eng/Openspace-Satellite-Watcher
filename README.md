# 卫星守望者 · Satellite Watcher

一个开源的 Web 端空间态势感知（SSA, Space Situational Awareness）应用，基于 TLE 轨道数据实时计算并可视化近地轨道卫星的位置与轨迹。支持 2D / 3D 双视角切换、时间回放、星座临时导入、标签管理与卫星图片管理。默认视角为东亚区域（中国上空）。

**线上地址**：[https://www.wanzhixuexi.cn](https://www.wanzhixuexi.cn)（部署于阿里云香港轻量服务器）

---

## 功能介绍

### 可视化引擎

- **2D / 3D 双视角**：基于 MapLibre GL 的 2D 地图与基于 CesiumJS 的 3D 地球，一键无缝切换
- **默认东亚视角**：打开页面时地球/地图自动聚焦中国区域（经度 110°E，纬度 35°N）
- **实时轨道渲染**：使用 satellite.js 的 SGP4/SDP4 算法实时计算卫星位置，绘制多圈预测轨道线
- **卫星定位**：点击详情面板的定位图标，相机平滑飞至卫星当前位置
- **3D 模型**：部分卫星预置 GLB 3D 模型，基于 `<model-viewer>` 渲染，自动旋转展示
- **NASA 图片搜索**：集成 NASA 媒体库，一键搜索卫星配图

### 卫星管理

- **卫星列表**：支持按 NORAD ID、名称、国家、对象类型（载荷 / 火箭体 / 碎片）、发射年份、轨道高度、活跃状态多维度筛选
- **批量操作**：一键显示/隐藏卫星
- **详情面板**：展示卫星元数据、TLE 原文、轨道参数（近地点 / 远地点 / 周期 / 倾角 / 偏心率）、图片和3D模型
- **标签系统**：查看预设标签分类（当前版本标签写入功能暂不开放）

### 数据导入（临时）

- **Celestrak 导入**：按分类（stations/visual/starlink/gps等）或 NORAD ID/名称 从 Celestrak 实时拉取 TLE
- **星座批量导入**：预置主流星座（Starlink、Iridium、GPS、北斗等）一键导入
- **文件导入**：支持标准 TLE 格式文本文件（纯前端解析，不上传服务器）
- **单次导入上限**：100颗卫星，页面总数上限 200颗
- **数据隔离**：用户导入/删除/隐藏操作仅在当前浏览器会话中生效，刷新页面恢复服务器默认数据

### 数据管理（需密码）

- **轨道数据刷新（TLE）**：输入密码后从 Celestrak 同步所有默认卫星的最新 TLE，自动写入数据库，永久生效
- **图片上传**：输入密码后为卫星上传自定义图片（≤2MB），写入数据库永久保存
- **密码记忆**：密码验证通过后保存在当前标签页会话中（sessionStorage），关闭标签页清除

### 时间控制

- **时间回放**：可拖动时间轴查看历史或未来时刻的卫星位置
- **播放控制**：支持多档倍速播放 / 暂停 / 重置至当前时刻
- **轨道预测**：基于 TLE 轨道根数预测未来多圈轨迹
- **轨道缓存**：自动缓存计算好的轨道点，重复查看同一时刻无需重新计算

---

## API 服务

| 路由 | 方法 | 需要密码 | 说明 |
|------|------|---------|------|
| `/api/space-objects` | GET | 否 | 获取所有默认卫星（含 TLE、图片） |
| `/api/tle/refresh` | POST | **是** | 从 Celestrak 刷新 TLE 并写入数据库 |
| `/api/tle/import/celestrak` | POST | 否 | 按分类从 Celestrak 导入（代理，单次≤100颗） |
| `/api/tle/import/constellation` | GET/POST | 否 | 获取/导入星座列表 |
| `/api/tle/import/search` | GET | 否 | 按名称/ID搜索 Celestrak |
| `/api/nasa-media` | GET | 否 | 检索 NASA 媒体库 |
| `/api/nasa-image/proxy` | GET | 否 | NASA 图片代理（解决跨域） |
| `/api/admin/upload-image` | POST | **是** | 上传卫星图片到数据库 |
| `/api/admin/seed` | POST | **是** | 初始化种子数据 |
| `/api/tags` | GET | 否 | 获取标签列表 |

> 写操作（新增/删除/修改卫星、标签）暂不开放，将在用户系统版本中引入。

---

## 安全防护

应用部署在公网环境下，已实施多层防护抵御 DDoS 与滥用：

| 防护层 | 机制 |
|-------|------|
| **Nginx 层** | 分层限流（静态资源30r/s、普通API 10r/s、导入API 2r/s、敏感操作5r/min）；每IP并发连接≤10；全局并发≤100；`client_max_body_size 3m`；隐藏版本号；HTTP→HTTPS跳转 |
| **Next.js Middleware 层** | 内存级 IP 限流；全局并发≤50 返回 503；安全响应头（X-Frame-Options、X-Content-Type-Options、CSP） |
| **API 参数校验层** | Celestrak GROUP 白名单防注入；搜索参数长度≤100字符；pageSize 上限100；导入结果截断到100颗；文件上传API禁用 |
| **密码验证** | `crypto.timingSafeEqual` 时序安全比较；敏感操作（TLE刷新、图片上传）需密码；密码保存在 sessionStorage |

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
| **3D 模型** | @google/model-viewer | WebGL glTF/GLB 模型查看器 |
| **状态管理** | Zustand | 轻量全局状态，支持选择器订阅 |
| **数据库** | PostgreSQL + Prisma ORM | 关系型数据库与类型安全 ORM |

### 项目结构

```
src/
├── app/                      # Next.js App Router
│   ├── api/                  # API 路由
│   │   ├── admin/            # 管理员接口（seed、图片上传，需密码）
│   │   ├── nasa-image/       # NASA 图片代理
│   │   ├── nasa-media/       # NASA 媒体检索
│   │   ├── space-objects/    # 卫星数据查询
│   │   ├── tags/             # 标签查询
│   │   └── tle/
│   │       ├── import/       # TLE 导入（Celestrak代理/星座/搜索）
│   │       └── refresh/      # TLE 刷新（需密码，写DB）
│   ├── layout.tsx
│   └── page.tsx              # 主页面
├── components/
│   ├── HomePage.tsx          # 主页面布局与逻辑（含密码弹窗）
│   ├── ui/                   # 业务 UI 组件
│   │   ├── FilterPanel.tsx       # 筛选面板
│   │   ├── ImportModal.tsx       # 导入弹窗（支持滚动）
│   │   ├── SatelliteDetailPanel.tsx  # 卫星详情面板
│   │   ├── SatelliteList.tsx     # 卫星列表
│   │   ├── TimeControlBar.tsx    # 时间控制
│   │   └── ...
│   └── visualization/        # 可视化组件
│       ├── CesiumGlobe.tsx       # 3D 地球（默认东亚视角）
│       ├── MapLibreMap.tsx       # 2D 地图（默认东亚视角）
│       └── ...
├── lib/
│   ├── api/client.ts         # API 客户端
│   ├── security.ts           # 密码验证（timingSafeEqual）
│   ├── tle/                  # TLE 解析与轨道计算
│   ├── prisma.ts             # Prisma 客户端
│   ├── translations.ts       # 国家/类型翻译
│   └── mock/satellites.ts    # 默认卫星数据（DB不可用时fallback）
├── middleware.ts             # 全局IP限流+安全头
└── store/                    # Zustand 状态
    ├── satelliteStore.ts
    └── timeStore.ts

deploy/
└── nginx-secure.conf         # Nginx 安全加固配置（含限流）

prisma/
└── schema.prisma             # 数据库模型定义

public/
├── models/                   # 预置 3D 模型（GLB）
└── cesium/                   # Cesium 静态资源（Workers、Assets）
```

---

## 生产架构

```
┌─────────────┐    HTTPS     ┌──────────────────────────┐    HTTPS   ┌──────────────────┐
│  国内用户    │ ───────────→ │ 阿里云香港轻量服务器       │ ────────→ │ Celestrak / NASA │
│             │  (BGP线路)   │                          │           │ (外部数据API)     │
│             │              │  Nginx (443)             │           └──────────────────┘
│             │              │  · SSL终端                │
│             │              │  · IP限流/并发限制         │
│             │              │  · 静态缓存/Gzip          │
│             │              │    ↓ proxy_pass          │
│             │              │  PM2 → Next.js (3000)    │
│             │              │  · SSR页面/API            │
│             │              │  · API内存缓存             │
│             │              │  · 密码验证+限流           │ ────┐
│             │              │  · 客户端状态隔离          │     │
│             │              │                          │     ↓
│             │              │                          │  PostgreSQL (本地)
│             │              │                          │  · 13颗默认卫星
│             │              │                          │  · TLE/标签/图片
└─────────────┘              └──────────────────────────┘
```

核心链路：**国内用户 → 香港轻量服务器（Nginx + Next.js + 本地 PostgreSQL）→ 外部 API（Celestrak/NASA）**

- **Nginx**：HTTPS 终端（Let's Encrypt）、HTTP→HTTPS、IP 频率限制、并发连接限制、静态资源缓存、Gzip、安全响应头、隐藏版本信息
- **PM2**：进程守护、开机自启、内存限制（512MB）
- **本地 PostgreSQL**：卫星数据存储，API 响应 <25ms（首次 ~200ms + 内存缓存 5min TTL）
- **API 内存缓存**：`/api/space-objects` 等读接口 5 分钟 TTL 缓存，缓存命中 <25ms

### 数据模型说明

- **服务器默认数据**：数据库中存储 13 颗默认卫星的基础信息和 TLE 数据，所有用户共享
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

### 方式一：Vercel（零配置）

1. 将代码推送到 GitHub
2. 在 Vercel 控制台导入仓库
3. 添加环境变量：`DATABASE_URL`、`ADMIN_PASSWORD`
4. Deploy

### 方式二：自建香港轻量服务器（当前生产环境）

适用于国内用户访问、免备案场景。

详细部署文档参见 [HK_Deploy.md](./HK_Deploy.md)。

部署要点：
- 服务器安装本地 PostgreSQL，数据存储在本地，API 响应 <25ms
- 一键部署脚本 `deploy.ps1`：自动上传、解压、迁移、启动
- Nginx 配置 SSL + 限流（使用 [deploy/nginx-secure.conf](./deploy/nginx-secure.conf)）
- PM2 进程管理 + API 内存缓存（5min TTL）

### 部署更新流程

```powershell
# 1. 本地构建
npm run build

# 2. 打包（含 node_modules，非 standalone）
tar -czf app-pkg.tar.gz .next public node_modules ecosystem.config.cjs package.json

# 3. 一键部署
powershell -ExecutionPolicy Bypass -File deploy.ps1
```

---

## 许可证

Apache License 2.0
