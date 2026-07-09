# 卫星守望者 · Satellite Watcher

一个隶属于开源太空计划 Openspace 的 Web 端空间态势感知（SSA, Space Situational Awareness）应用，基于 TLE 轨道数据实时计算并可视化近地轨道卫星的位置与轨迹。支持 2D / 3D 双视角切换、时间回放、星座批量导入与标签管理。

---

## 功能介绍

### 可视化引擎

- **2D / 3D 双视角**：基于 MapLibre GL 的 2D 地图与基于 CesiumJS 的 3D 地球，一键无缝切换
- **实时轨道渲染**：使用 satellite.js 的 SGP4/SDP4 算法实时计算卫星位置，绘制多圈预测轨道线
- **卫星定位**：点击详情面板的定位图标，相机平滑飞至卫星当前位置
- **NASA 3D 模型**：集成 NASA 媒体库，为部分卫星加载真实 3D 模型（基于 `<model-viewer>`）

### 卫星管理

- **卫星列表**：支持按 NORAD ID、名称、国家、对象类型（载荷 / 火箭体 / 碎片）、发射年份、轨道高度、活跃状态多维度筛选
- **批量可见性控制**：一键清空 / 全选可见卫星，轨道与标记同步更新
- **详情面板**：展示卫星元数据、TLE 原文、轨道参数（近地点 / 远地点 / 周期 / 倾角 / 偏心率）
- **标签系统**：自定义标签与颜色，为卫星打标分类

### 数据导入

- **Celestrak API 导入**：按关键字或 NORAD ID 从 Celestrak 实时拉取 TLE
- **星座批量导入**：预置主流星座（Starlink、Iridium、GPS 等）一键导入
- **文件导入**：支持上传标准 TLE 格式文本文件

### 时间控制

- **时间回放**：可拖动时间轴查看历史或未来时刻的卫星位置
- **播放控制**：支持多档倍速播放 / 暂停 / 重置至当前时刻
- **轨道预测**：基于 TLE 轨道根数预测未来多圈轨迹，不随时间播放而变形

### API 服务

| 路由 | 功能 |
|------|------|
| `GET/POST /api/space-objects` | 卫星元数据增删改查 |
| `GET /api/space-objects/search` | 多条件检索卫星 |
| `POST /api/tle/import/celestrak` | 从 Celestrak 导入 TLE |
| `POST /api/tle/import/constellation` | 按星座批量导入 |
| `POST /api/tle/import/file` | 从文件导入 TLE |
| `GET /api/tle/import/search` | 搜索 Celestrak 目录 |
| `GET /api/nasa-media` | 检索 NASA 媒体库 |
| `GET /api/nasa-image/proxy` | NASA 图片代理（解决跨域） |
| `GET/POST /api/tags` | 标签管理 |

---

## 技术框架

| 层级 | 技术 | 说明 |
|------|------|------|
| **框架** | Next.js 14 (App Router) | React 全栈框架，支持 SSR / API Routes |
| **语言** | TypeScript 5.5 | 全量类型安全 |
| **UI 库** | React 18 | 函数组件 + Hooks |
| **样式** | Tailwind CSS 3 + shadcn/ui | 原子化 CSS + 可定制组件库 |
| **图标** | lucide-react | 轻量 SVG 图标 |
| **3D 地球** | CesiumJS (@cesium/engine) | WebGL 3D 地球渲染 |
| **2D 地图** | MapLibre GL | 开源矢量瓦片地图 |
| **轨道计算** | satellite.js | SGP4/SDP4 轨道传播算法 |
| **3D 模型** | @google/model-viewer | WebGL 模型查看器 |
| **状态管理** | Zustand | 轻量全局状态，支持选择器订阅 |
| **数据库** | PostgreSQL + Prisma ORM | 关系型数据库与类型安全 ORM |
| **包管理** | npm | 标准包管理器 |

### 项目结构

```
src/
├── app/                      # Next.js App Router
│   ├── api/                  # API 路由
│   │   ├── nasa-image/       # NASA 图片代理
│   │   ├── nasa-media/       # NASA 媒体检索
│   │   ├── space-objects/    # 卫星数据接口
│   │   ├── tags/             # 标签接口
│   │   └── tle/import/       # TLE 导入接口
│   ├── layout.tsx
│   └── page.tsx              # 主页面
├── components/
│   ├── ui/                   # 业务 UI 组件
│   │   ├── FilterPanel.tsx       # 筛选面板
│   │   ├── ImportModal.tsx       # 导入弹窗
│   │   ├── SatelliteDetailPanel.tsx  # 卫星详情
│   │   ├── SatelliteList.tsx     # 卫星列表
│   │   ├── TimeControlBar.tsx    # 时间控制
│   │   ├── ViewSwitcher.tsx      # 2D/3D 切换
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
│   └── translations.ts       # 国家/类型翻译
└── store/                    # Zustand 状态
    ├── satelliteStore.ts
    └── timeStore.ts
```

---

## 本地开发

### 环境要求

- Node.js ≥ 18.17
- PostgreSQL ≥ 14
- npm ≥ 9

### 安装与启动

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 PostgreSQL 连接字符串

# 3. 初始化数据库
npx prisma db push

# 4. 启动开发服务器
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

### 环境变量

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 |
| `NEXTAUTH_URL` | 应用回调地址（本地开发填 `http://localhost:3000`） |
| `NEXTAUTH_SECRET` | NextAuth 密钥（可用 `openssl rand -base64 32` 生成） |

---

## 部署建议

### 方式一：Vercel 部署（推荐，零配置）

Vercel 是 Next.js 的官方托管平台，原生支持 SSR、API Routes 与边缘函数，适合快速上线。

#### 前置准备

1. 注册 [Vercel](https://vercel.com) 账号
2. 将代码推送到 GitHub / GitLab / Bitbucket 仓库
3. 在 Vercel 创建 PostgreSQL 数据库（或使用外部数据库）

#### 部署步骤

**方式 A：通过 Vercel Dashboard（推荐）**

1. 在 Vercel 控制台点击 **Add New → Project**
2. 导入你的 Git 仓库
3. 在 **Environment Variables** 中配置：
   ```
   DATABASE_URL=postgresql://...（Vercel Postgres 或外部数据库）
   NEXTAUTH_URL=https://你的域名.vercel.app
   NEXTAUTH_SECRET=<随机密钥>
   ```
4. 点击 **Deploy**，Vercel 会自动识别 Next.js 框架并使用 `vercel.json` 配置

**方式 B：通过 Vercel CLI**

```bash
# 1. 安装 Vercel CLI
npm install -g vercel

# 2. 登录
vercel login

# 3. 首次关联项目（按提示选择账户、项目名）
vercel link

# 4. 添加环境变量
vercel env add DATABASE_URL
vercel env add NEXTAUTH_URL
vercel env add NEXTAUTH_SECRET

# 5. 部署到生产环境
vercel deploy --prod
```

项目已内置 `vercel.json`，关键配置：

- API 路由使用 `@vercel/node@3` 运行时，内存 1024MB，超时 60s
- 部署区域：`hkg1`（香港）、`sfo1`（旧金山）
- 构建时启用 `NEXT_PRIVATE_STANDALONE` 生成独立产物
- 静态资源全局缓存 1 小时

#### 数据库初始化

部署完成后，执行一次 Prisma 迁移：

```bash
# 设置生产数据库连接后运行
npx prisma db push
```

或在 Vercel 的 **Settings → Functions** 中配置构建后钩子自动执行。

---

### 方式二：阿里云部署（自有服务器）

适用于需要数据本地化、自定义域名备案或成本可控的场景。推荐使用阿里云 ECS + RDS PostgreSQL 组合。

#### 架构建议

```
用户 → CDN (可选) → SLB → ECS (Next.js) → RDS PostgreSQL
```

#### 资源清单

| 服务 | 规格 | 说明 |
|------|------|------|
| ECS 云服务器 | 2核 4G 起步 | 运行 Next.js，需支持 WebGL 构建 |
| RDS PostgreSQL | 2核 4G 100G | 托管数据库，自动备份 |
| OSS 对象存储 | 按需 | 存储上传的 TLE 文件（可选） |
| CDN | 按需 | 加速静态资源（可选） |
| 域名 + ICP 备案 | - | 国内访问必需 |

#### 部署步骤

**1. 准备服务器**

```bash
# 安装 Node.js 18+ (推荐使用 nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18

# 安装 PM2 进程管理器
npm install -g pm2
```

**2. 拉取代码并安装依赖**

```bash
git clone <你的仓库地址> satellite-watcher
cd satellite-watcher
npm install
```

**3. 配置环境变量**

```bash
cp .env.example .env
```

编辑 `.env`：

```env
# 使用阿里云 RDS 内网地址（更安全、延迟更低）
DATABASE_URL=postgresql://用户名:密码@rm-xxxx.pg.rds.aliyuncs.com:5432/satellite_watcher?schema=public

NEXTAUTH_URL=https://你的域名.com
NEXTAUTH_SECRET=<openssl rand -base64 32 生成的密钥>
```

**4. 初始化数据库**

```bash
# 确保 RDS 白名单已添加 ECS 内网 IP
npx prisma db push
```

**5. 构建生产产物**

```bash
npm run build
```

**6. 使用 PM2 启动并守护进程**

```bash
pm2 start npm --name "satellite-watcher" -- start
pm2 save

# 设置开机自启
pm2 startup
# 按提示执行返回的命令
```

**7. 配置 Nginx 反向代理**

```nginx
# /etc/nginx/conf.d/satellite-watcher.conf
server {
    listen 80;
    server_name 你的域名.com;

    # 静态资源缓存
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        expires 365d;
        add_header Cache-Control "public, immutable";
    }

    # Cesium 静态资源
    location /cesium/ {
        proxy_pass http://127.0.0.1:3000;
        expires 30d;
    }

    # API 与页面
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        # 长连接支持（API 超时 60s）
        proxy_read_timeout 60s;
    }
}
```

```bash
# 测试并重载 Nginx
nginx -t
nginx -s reload
```

**8. 配置 HTTPS（推荐）**

使用阿里云免费 SSL 证书或 Let's Encrypt：

```bash
# 安装 certbot
yum install -y certbot python3-certbot-nginx   # CentOS
apt install -y certbot python3-certbot-nginx    # Ubuntu

# 申请并自动配置证书
certbot --nginx -d 你的域名.com
```

**9. 更新部署流程**

后续代码更新时：

```bash
git pull
npm install
npm run build
pm2 restart satellite-watcher
```

#### 阿里云注意事项

- **安全组**：ECS 安全组开放 80 / 443 端口，关闭 3000 端口对外访问
- **RDS 白名单**：将 ECS 内网 IP 加入 RDS 白名单，禁止公网访问数据库
- **ICP 备案**：使用阿里云国内节点需完成域名备案（约 7-20 个工作日）
- **Cesium 资源**：首次构建会从 `node_modules/cesium/Build/` 拷贝静态资源到 `public/cesium/`，确保磁盘空间 ≥ 1GB
- **内存优化**：构建过程内存消耗较大，ECS 建议配置 4GB+ swap：

  ```bash
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ```

---

## 两种部署方式对比

| 维度 | Vercel | 阿里云 ECS |
|------|--------|-----------|
| 上手难度 | 低，一键部署 | 中，需运维知识 |
| 成本 | 免费额度充足，超出按量计费 | 固定月费（ECS + RDS） |
| 国内访问速度 | 一般（香港节点） | 快（国内节点 + CDN） |
| 数据合规 | 数据在海外 | 可选国内地域，满足合规 |
| 扩展性 | 自动扩缩容 | 需手动加机器 / SLB |
| 自定义程度 | 受平台限制 | 完全可控 |
| 适用场景 | 原型验证、海外用户 | 国内生产环境、数据本地化 |

---

## 许可证

MIT License
