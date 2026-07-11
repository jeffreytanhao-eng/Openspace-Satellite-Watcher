# 卫星守望者 · Satellite Watcher

一个开源的 Web 端空间态势感知（SSA, Space Situational Awareness）应用，基于 TLE 轨道数据实时计算并可视化近地轨道卫星的位置与轨迹。支持 2D / 3D 双视角切换、时间回放、星座批量导入、标签管理与卫星图片管理。

**线上地址**：[https://www.wanzhixuexi.cn](https://www.wanzhixuexi.cn)（部署于阿里云香港轻量服务器）

---

## 功能介绍

### 可视化引擎

- **2D / 3D 双视角**：基于 MapLibre GL 的 2D 地图与基于 CesiumJS 的 3D 地球，一键无缝切换
- **实时轨道渲染**：使用 satellite.js 的 SGP4/SDP4 算法实时计算卫星位置，绘制多圈预测轨道线
- **卫星定位**：点击详情面板的定位图标，相机平滑飞至卫星当前位置
- **3D 模型**：支持为卫星上传自定义 3D 模型（glTF/GLB 格式），基于 `<model-viewer>` 渲染
- **NASA 图片搜索**：集成 NASA 媒体库，一键搜索并为卫星设置配图

### 卫星管理

- **卫星列表**：支持按 NORAD ID、名称、国家、对象类型（载荷 / 火箭体 / 碎片）、发射年份、轨道高度、活跃状态、标签多维度筛选
- **批量操作**：一键显示/隐藏、批量删除、批量打标签
- **详情面板**：展示卫星元数据、TLE 原文、轨道参数（近地点 / 远地点 / 周期 / 倾角 / 偏心率）、自定义图片
- **标签系统**：自定义标签与颜色，为卫星打标分类

### 数据导入

- **Celestrak API 导入**：按关键字或 NORAD ID 从 Celestrak 实时拉取 TLE
- **星座批量导入**：预置主流星座（Starlink、Iridium、GPS、OneWeb、北斗等）一键导入
- **文件导入**：支持上传标准 TLE 格式文本文件
- **轨道数据刷新**：一键从 Celestrak 同步所有已收录卫星的最新 TLE，自动写入数据库并清除轨道缓存

### 时间控制

- **时间回放**：可拖动时间轴查看历史或未来时刻的卫星位置
- **播放控制**：支持多档倍速播放 / 暂停 / 重置至当前时刻
- **轨道预测**：基于 TLE 轨道根数预测未来多圈轨迹，不随时间播放而变形
- **轨道缓存**：自动缓存计算好的轨道点，重复查看同一时刻无需重新计算

### 管理员功能

- **密码保护**：管理员操作（添加/删除/导入/刷新）需输入管理密码
- **图片上传**：支持为卫星上传自定义图片
- **种子数据初始化**：`POST /api/admin/seed` 一键初始化默认卫星数据集

### API 服务

| 路由 | 功能 |
|------|------|
| `GET /api/space-objects` | 获取所有卫星（含 TLE、标签、图片） |
| `POST /api/space-objects` | 新增/更新卫星 |
| `DELETE /api/space-objects` | 删除卫星 |
| `GET /api/space-objects/search` | 多条件检索卫星 |
| `POST /api/tle/refresh` | 从 Celestrak 刷新所有卫星的最新 TLE |
| `POST /api/tle/import/celestrak` | 从 Celestrak 按关键字/ID 导入 TLE |
| `POST /api/tle/import/constellation` | 按星座批量导入 |
| `POST /api/tle/import/file` | 从文件导入 TLE |
| `GET /api/tle/import/search` | 搜索 Celestrak 卫星目录 |
| `GET /api/nasa-media` | 检索 NASA 媒体库 |
| `GET /api/nasa-image/proxy` | NASA 图片代理（解决跨域） |
| `POST /api/admin/upload-image` | 上传卫星图片（管理员） |
| `POST /api/admin/seed` | 初始化种子数据（管理员） |
| `GET/POST /api/tags` | 标签管理 |

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
| **包管理** | npm | 标准包管理器 |

### 项目结构

```
src/
├── app/                      # Next.js App Router
│   ├── api/                  # API 路由
│   │   ├── admin/            # 管理员接口（seed、图片上传）
│   │   ├── nasa-image/       # NASA 图片代理
│   │   ├── nasa-media/       # NASA 媒体检索
│   │   ├── space-objects/    # 卫星数据 CRUD
│   │   ├── tags/             # 标签接口
│   │   └── tle/
│   │       ├── import/       # TLE 导入接口（Celestrak/星座/文件/搜索）
│   │       └── refresh/      # TLE 刷新接口（从 Celestrak 同步最新数据）
│   ├── layout.tsx
│   └── page.tsx              # 主页面
├── components/
│   ├── HomePage.tsx          # 主页面布局与逻辑
│   ├── ui/                   # 业务 UI 组件
│   │   ├── FilterPanel.tsx       # 筛选面板
│   │   ├── ImportModal.tsx       # 导入弹窗
│   │   ├── SatelliteDetailPanel.tsx  # 卫星详情面板
│   │   ├── SatelliteList.tsx     # 卫星列表
│   │   ├── TimeControlBar.tsx    # 时间控制
│   │   ├── TagManager.tsx        # 标签管理
│   │   └── ...
│   └── visualization/        # 可视化组件
│       ├── CesiumGlobe.tsx       # 3D 地球
│       ├── MapLibreMap.tsx       # 2D 地图
│       ├── OrbitLine.tsx         # 轨道线
│       └── SatelliteMarker.tsx   # 卫星标记
├── hooks/                    # 自定义 Hooks
│   ├── useCesium.ts
│   └── useMapLibre.ts
├── lib/                      # 工具库
│   ├── api/client.ts         # API 客户端
│   ├── tle/                  # TLE 解析与轨道计算
│   ├── cesium/positions.ts   # Cesium 坐标转换
│   ├── prisma.ts             # Prisma 客户端
│   ├── translations.ts       # 国家/类型翻译
│   └── mock/satellites.ts    # 种子卫星数据
└── store/                    # Zustand 状态
    ├── satelliteStore.ts
    └── timeStore.ts

prisma/
└── schema.prisma             # 数据库模型定义

public/
├── models/                   # 预置 3D 模型（GLB）
└── cesium/                   # Cesium 静态资源（Workers、Assets）
```

---

## 生产架构

```
┌─────────────┐    HTTPS     ┌──────────────────────┐    TLS     ┌──────────────────┐
│  国内用户    │ ───────────→ │ 阿里云香港轻量服务器   │ ────────→  │ Neon Postgres    │
│             │  (BGP线路)   │                      │  (公网)    │  (新加坡, Serverless)
│             │              │  Nginx (443/80)      │            └──────────────────┘
│             │              │    ↓ proxy_pass      │
│             │              │  PM2 → Next.js       │ ────────→  ┌──────────────────┐
│             │              │  standalone (3000)   │  (HTTPS)   │ Celestrak / NASA │
└─────────────┘              │  - SSR 页面渲染       │            │ (外部数据 API)    │
                             │  - API Routes        │            └──────────────────┘
                             │  - 静态资源/3D模型    │
                             └──────────────────────┘
```

核心链路：**国内用户 → 香港轻量服务器（Nginx + Next.js 全栈应用）→ 新加坡 Neon Postgres 数据库**

- **Nginx**：HTTPS 终端（Let's Encrypt 证书）、HTTP→HTTPS 跳转、静态资源缓存、Gzip 压缩
- **PM2**：进程守护、开机自启、内存限制（500MB）
- **Neon Postgres**：Serverless PostgreSQL，按用量计费，免运维
- **Vercel**：持续部署备份（`openspace-satellite-watcher.vercel.app`）

---

## 本地开发

### 环境要求

- Node.js ≥ 18.17
- PostgreSQL ≥ 14（或使用 Neon 云端数据库）
- npm ≥ 9

### 安装与启动

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 DATABASE_URL 和 ADMIN_PASSWORD

# 3. 初始化数据库
npx prisma db push

# 4. （可选）初始化种子卫星数据
# 启动后通过 UI 导入或调用 POST /api/admin/seed

# 5. 启动开发服务器
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

### 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串（Pooled 连接，用于 Prisma 操作） | ✅ |
| `POSTGRES_URL_NON_POOLING` | PostgreSQL 直连字符串（无 PgBouncer，用于迁移） | 推荐 |
| `ADMIN_PASSWORD` | 管理员操作密码（导入/删除/刷新/上传图片等） | ✅ |
| `NODE_ENV` | 运行环境（`development` / `production`） | 生产必填 |

### 默认种子卫星

初始化种子数据后包含 12 颗默认卫星：

| NORAD ID | 名称 | 说明 |
|----------|------|------|
| 25544 | ISS (ZARYA) | 国际空间站 |
| 48274 | CSS (TIANHE) | 中国空间站-天和核心舱 |
| 53239 | CSS (WENTIAN) | 中国空间站-问天实验舱 |
| 54216 | CSS (MENGTIAN) | 中国空间站-梦天实验舱 |
| 20580 | HST | 哈勃太空望远镜 |
| 27424 | AQUA | NASA 地球观测卫星 |
| 25994 | TERRA | NASA 地球观测卫星 |
| 39634 | SENTINEL-1A | 欧空局雷达卫星 |
| 43013 | NOAA 20 (JPSS-1) | NOAA 气象卫星 |
| 44714 | STARLINK-1008 | Starlink 卫星 |
| 53421 | STARLINK-4545 | Starlink 卫星 |
| 41270 | NOAA 16 DEB | NOAA 16 碎片（演示用） |

---

## 部署方式

### 方式一：Vercel（推荐，零配置）

Vercel 是 Next.js 官方托管平台，适合快速上线与原型验证。

1. 将代码推送到 GitHub
2. 在 Vercel 控制台导入仓库
3. 在 Storage 中创建 Neon Postgres 数据库
4. 添加环境变量：`ADMIN_PASSWORD`
5. Deploy，自动完成构建与部署

Vercel 会自动配置 Neon 连接串，部署后在 Vercel 域名设置中添加自定义域名即可。

### 方式二：自建服务器（香港轻量服务器方案，免备案）

适用于国内用户访问、免备案、成本可控的场景。核心思路：本地构建 Next.js standalone 产物，上传到服务器运行。

详细部署文档参见 [HK_Deploy.md](./HK_Deploy.md)。

#### 快速概要

```bash
# 服务器环境（Ubuntu/Debian）
apt install nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs
npm install -g pm2

# 本地构建（在开发机执行，避免服务器内存不足）
# next.config.mjs 中设置 output: 'standalone'
npm run build
# 将 .next/standalone/、.next/static/、public/ 打包上传到服务器 /app

# 服务器启动
cd /app
cat > ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [{
    name: 'satellite',
    script: './server.js',
    cwd: '/app',
    node_args: '--max-old-space-size=500',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      HOSTNAME: '0.0.0.0',
      DATABASE_URL: 'postgresql://...',
      POSTGRES_URL_NON_POOLING: 'postgresql://...',
      ADMIN_PASSWORD: 'your-password'
    }
  }]
};
EOF
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup

# Nginx 配置 HTTPS 反代
certbot --nginx -d your-domain.com -d www.your-domain.com
```

### 方式三：阿里云国内 ECS（需 ICP 备案）

适用于生产环境、数据本地化、需要极低延迟的场景。需域名备案（约 7-20 工作日）。架构：

```
用户 → CDN → ECS（Next.js）→ RDS PostgreSQL
```

部署流程与方式二类似，但需额外配置安全组、RDS 白名单、ICP 备案等。建议服务器规格 2 核 2GB 以上，构建时添加 4GB swap。

---

## 两种部署方式对比

| 维度 | Vercel + Neon | 自建香港服务器 |
|------|---------------|---------------|
| 上手难度 | 低，一键部署 | 中，需基础运维 |
| 月成本 | 免费额度内可用 | ~28 元/月（轻量服务器） |
| 国内访问速度 | 一般（无中国大陆节点） | 快（BGP 线路 ~30-60ms） |
| 备案要求 | 不需要 | 不需要（香港节点） |
| 数据库 | Neon Serverless 免运维 | Neon 或自建 |
| 扩展性 | 自动扩缩容 | 需手动升级配置 |
| 数据持久化 | 云端数据库 | 云端数据库 |
| 适用场景 | 原型、海外用户、快速验证 | 国内用户生产环境 |

---

## 后续更新部署

**Vercel**：推送到 GitHub 自动部署。

**香港服务器**（增量更新，单文件 API 变更时）：

```bash
# 本地构建（临时加上 output: 'standalone'）
npm run build
# 上传变更的编译文件
scp .next/standalone/.next/server/app/api/xxx/route.js root@server:/app/.next/server/app/api/xxx/route.js
# 重启
ssh root@server "pm2 restart satellite"
```

完整重新部署参见 [HK_Deploy.md](./HK_Deploy.md)。

---

## 许可证

Apache License 2.0
