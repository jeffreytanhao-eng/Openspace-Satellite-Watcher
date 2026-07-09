# 部署指南 · Deployment Guide

本文档详细说明「卫星守望者」项目的两种部署方式：**Vercel**（零配置托管）和 **阿里云 ECS**（自有服务器）。

---

## 目录

- [环境要求](#环境要求)
- [环境变量参考](#环境变量参考)
- [数据库表结构](#数据库表结构)
- [方式一：Vercel 部署](#方式一vercel-部署)
- [方式二：阿里云 ECS 部署](#方式二阿里云-ecs-部署)
- [数据库初始化与种子数据](#数据库初始化与种子数据)
- [部署后验证](#部署后验证)
- [常见问题排查](#常见问题排查)
- [两种方式对比](#两种方式对比)

---

## 环境要求

| 组件 | 最低版本 | 说明 |
|------|---------|------|
| Node.js | 18.17+ | 推荐 20.x LTS |
| npm | 9+ | 随 Node 安装 |
| PostgreSQL | 14+ | Vercel Postgres 或阿里云 RDS |
| Git | 任意 | 代码版本管理 |

---

## 环境变量

项目依赖以下环境变量，部署时必须全部配置：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串（Prisma 读取此变量） | `postgresql://user:pass@host:5432/db?schema=public` |
| `NEXTAUTH_URL` | 应用的外部访问地址 | `https://your-domain.com` |
| `NEXTAUTH_SECRET` | NextAuth 加密密钥 | `openssl rand -base64 32` 生成 |

> **注意**：`DATABASE_URL` 必须是**不带连接池参数**的直连地址。Vercel Postgres 会提供两个地址，请使用 `POSTGRES_URL_NON_POOLING` 的值。

---

## 数据库表结构

项目使用 Prisma ORM，共 6 张表，定义在 `prisma/schema.prisma`：

```
SpaceObject (卫星元数据)
  ├── TLEData (TLE 轨道根数, 1:N)
  ├── OrbitCache (轨道计算缓存, 1:N)
  └── SpaceObjectTag (标签关联, M:N)
        └── UserTag (用户自定义标签)

Constellation (星座定义, 独立表)
```

| 表名 | 用途 | 初始数据 |
|------|------|---------|
| `SpaceObject` | 卫星元数据（NORAD ID、名称、国家、类型等） | 9 颗（种子数据） |
| `TLEData` | TLE 轨道根数（line1、line2、epoch） | 9 条（随卫星导入） |
| `UserTag` | 用户自定义标签 | 4 个（种子数据） |
| `SpaceObjectTag` | 标签-卫星关联 | 无（运行时生成） |
| `OrbitCache` | 轨道计算缓存 | 无（运行时生成） |
| `Constellation` | 星座定义 | 无（硬编码在 API 中） |

> **降级机制**：如果数据库不可用，API 会自动回退到 `src/lib/mock/satellites.ts` 中的 mock 数据，应用仍可运行，但数据不会持久化。

---

## 方式一：Vercel 部署

Vercel 是 Next.js 官方托管平台，支持自动构建、Serverless Functions 和托管 Postgres 数据库。适合快速上线、无运维负担。

### 前置准备

1. 注册 [Vercel](https://vercel.com) 账号
2. 将代码推送到 GitHub 仓库
3. 确保本地已安装 [Vercel CLI](https://vercel.com/cli)（可选，用于命令行操作）

### 步骤 1：创建 Vercel Postgres 数据库

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 选择你的项目 → 顶部标签栏点击 **Storage**
3. 点击 **Create Database** → 选择 **Postgres (Neon)**
4. 输入数据库名称：`satellite-watcher-db`
5. 选择区域：
   - **新加坡 (sin1)** — 适合亚洲用户，延迟最低
   - **法兰克福 (fra1)** — 适合欧洲用户
6. 点击 **Create**，等待 5-10 秒创建完成

创建后，Vercel 自动注入以下环境变量到你的项目：

```
POSTGRES_URL=postgres://default:xxx@ep-xxx.sin1.aws.neon.tech/satellite-watcher
POSTGRES_PRISMA_URL=postgres://default:xxx@...?pgbouncer=true&connect_timeout=15
POSTGRES_URL_NON_POOLING=postgres://default:xxx@...    ← Prisma 用这个
POSTGRES_USER=default
POSTGRES_PASSWORD=xxx
POSTGRES_DATABASE=satellite-watcher
POSTGRES_HOST=ep-xxx.sin1.aws.neon.tech
```

### 步骤 2：配置环境变量

进入项目 **Settings → Environment Variables**，添加以下变量：

| 变量名 | 值 | Environments |
|--------|-----|-------------|
| `DATABASE_URL` | 复制 `POSTGRES_URL_NON_POOLING` 的完整值 | Production, Preview, Development |
| `NEXTAUTH_URL` | `https://你的项目名.vercel.app`（部署后获取域名） | Production |
| `NEXTAUTH_SECRET` | 终端运行 `openssl rand -base64 32` 生成 | Production, Preview |

> **重要**：`DATABASE_URL` 必须手动添加。Prisma 的 `schema.prisma` 第 7 行读取的是 `DATABASE_URL`，而不是 Vercel 默认的 `POSTGRES_URL`。请确保使用 `POSTGRES_URL_NON_POOLING` 的值（不带 `?pgbouncer=true` 参数），否则 Prisma 迁移会报错。

### 步骤 3：部署代码

**方式 A：通过 GitHub 自动部署（推荐）**

1. 将代码推送到 GitHub
2. Vercel 会自动检测 `vercel.json` 配置并触发构建
3. 构建配置已内置于 `vercel.json`：
   - 框架：Next.js
   - 安装命令：`npm install`
   - 构建命令：`npm run build`
   - API 路由运行时：`@vercel/node@3`，内存 1024MB，超时 60s
   - 部署区域：`hkg1`（香港）、`sfo1`（旧金山）
   - 构建环境变量：`NEXT_PRIVATE_STANDALONE=true`

**方式 B：通过 Vercel CLI 手动部署**

```bash
# 安装 Vercel CLI
npm install -g vercel

# 登录
vercel login

# 关联项目
vercel link

# 部署到预览环境
vercel

# 部署到生产环境
vercel --prod
```

### 步骤 4：初始化数据库

部署成功后，需要在本地执行数据库初始化：

```bash
# 1. 将 Vercel Postgres 连接串配到本地 .env
# 编辑 .env 文件，将 DATABASE_URL 替换为 Vercel Postgres 的 NON_POOLING 地址
# DATABASE_URL="postgres://default:xxx@ep-xxx.sin1.aws.neon.tech/satellite-watcher"

# 2. 一键建表 + 生成 Client + 导入种子数据
npm run db:seed
```

此命令执行三步操作：
1. `prisma db push` — 创建 6 张表
2. `prisma generate` — 生成 Prisma Client
3. `tsx prisma/seed.ts` — 导入 9 颗卫星 + 4 个标签

### 步骤 5：验证部署

1. 访问 Vercel 分配的域名（如 `https://satellite-watcher.vercel.app`）
2. 确认卫星列表加载出 9 颗种子卫星
3. 点击「导入数据」→ 尝试从 Celestrak 导入一组星座
4. 刷新页面，确认导入的卫星持久化存在

---

## 方式二：阿里云 ECS 部署

适用于需要数据本地化、国内低延迟访问、自定义域名备案的场景。

### 架构设计

```
用户 → CDN(可选) → SLB(可选) → Nginx(80/443) → Next.js(3000) → RDS PostgreSQL
```

### 资源清单

| 阿里云服务 | 推荐规格 | 月费用参考 | 说明 |
|-----------|---------|-----------|------|
| ECS 云服务器 | 2核 4G | ¥60-120 | 运行 Next.js + Nginx |
| RDS PostgreSQL | 2核 4G 100G | ¥100-200 | 托管数据库，自动备份 |
| 域名 | - | ¥35-55/年 | 需 ICP 备案 |
| SSL 证书 | 免费 | ¥0 | 阿里云免费 DV 证书 |
| CDN（可选） | 按流量 | ¥10-30 | 加速静态资源 |
| OSS（可选） | 按存储 | ¥1-5 | 存储上传的 TLE 文件 |

> **提示**：个人/学生用户可选择「轻量应用服务器」（2核 4G ¥60/月），自带 Nginx 环境，更简单。

### 步骤 1：购买并初始化 ECS

1. 登录 [阿里云控制台](https://ecs.console.aliyun.com) → 创建实例
2. 配置选择：
   - 地域：华东 1（杭州）或 华北 2（北京）
   - 实例规格：2核 4G（ecs.g6.large 或共享型 s6.large）
   - 镜像：Ubuntu 22.04 LTS
   - 系统盘：40G SSD
   - 带宽：按固定带宽 5Mbps 或按使用流量
3. 安全组规则：开放以下端口

| 端口 | 协议 | 来源 | 用途 |
|------|------|------|------|
| 22 | TCP | 你的 IP | SSH |
| 80 | TCP | 0.0.0.0/0 | HTTP |
| 443 | TCP | 0.0.0.0/0 | HTTPS |
| 3000 | TCP | 127.0.0.1 | Next.js（仅本地） |

### 步骤 2：安装运行环境

SSH 登录 ECS 后执行：

```bash
# ========== 1. 安装 Node.js 18 ==========
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证
node -v   # 应输出 v18.x
npm -v    # 应输出 9.x+

# ========== 2. 安装 PM2 进程管理器 ==========
sudo npm install -g pm2

# ========== 3. 安装 Nginx ==========
sudo apt-get install -y nginx

# ========== 4. 安装 certbot（HTTPS 证书） ==========
sudo apt-get install -y certbot python3-certbot-nginx
```

### 步骤 3：配置 RDS PostgreSQL

1. 登录 [RDS 控制台](https://rds.console.aliyun.com) → 创建实例
   - 数据库类型：PostgreSQL 14
   - 规格：2核 4G（pg.n2.medium.1）
   - 存储：100G SSD
   - 网络：选择与 ECS 相同的 VPC 和交换机
2. 创建数据库账号：
   - 数据库名：`satellite_watcher`
   - 用户名：`satwatcher`
   - 密码：设置强密码
3. 配置白名单：
   - 进入实例 → **数据安全性 → 白名单设置**
   - 添加 ECS 的内网 IP（如 `172.16.0.0/16`）
   - 禁止公网访问（仅允许内网）
4. 获取内网连接地址：
   - 实例详情 → **数据库连接** → 内网地址（如 `rm-xxxx.pg.rds.aliyuncs.com`）
   - 端口：默认 `5432`

连接字符串格式：
```
postgresql://satwatcher:密码@rm-xxxx.pg.rds.aliyuncs.com:5432/satellite_watcher?schema=public
```

### 步骤 4：拉取代码并配置

```bash
# 创建项目目录
sudo mkdir -p /var/www/satellite-watcher
sudo chown $USER:$USER /var/www/satellite-watcher
cd /var/www/satellite-watcher

# 克隆代码
git clone https://github.com/你的用户名/Openspace-Satellite-Watcher.git .

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
```

编辑 `.env` 文件：

```bash
# 使用 RDS 内网地址（安全、低延迟）
DATABASE_URL="postgresql://satwatcher:你的密码@rm-xxxx.pg.rds.aliyuncs.com:5432/satellite_watcher?schema=public"

# 你的域名（备案后填写）
NEXTAUTH_URL="https://你的域名.com"

# 生成随机密钥
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
```

### 步骤 5：初始化数据库

```bash
# 创建所有表 + 导入种子数据
npm run db:seed
```

验证数据导入成功：

```bash
# 安装 PostgreSQL 客户端（可选，用于验证）
sudo apt-get install -y postgresql-client

# 连接 RDS 查看数据
psql "postgresql://satwatcher:密码@rm-xxxx.pg.rds.aliyuncs.com:5432/satellite_watcher" \
  -c "SELECT count(*) FROM \"SpaceObject\";"
# 应输出 9

psql "postgresql://satwatcher:密码@rm-xxxx.pg.rds.aliyuncs.com:5432/satellite_watcher" \
  -c "SELECT count(*) FROM \"UserTag\";"
# 应输出 4
```

### 步骤 6：构建生产产物

```bash
# 构建 Next.js 生产版本
npm run build
```

> **内存不足时**：如果 ECS 内存只有 2G，构建可能失败。添加 swap：
> ```bash
> sudo fallocate -l 4G /swapfile
> sudo chmod 600 /swapfile
> sudo mkswap /swapfile
> sudo swapon /swapfile
> echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
> ```

### 步骤 7：使用 PM2 启动

```bash
# 启动 Next.js（监听 3000 端口）
pm2 start npm --name "satellite-watcher" -- start

# 保存进程列表
pm2 save

# 设置开机自启
pm2 startup
# 按提示执行返回的 sudo 命令

# 验证运行状态
pm2 status
pm2 logs satellite-watcher --lines 20
```

### 步骤 8：配置 Nginx 反向代理

创建 Nginx 配置文件：

```bash
sudo nano /etc/nginx/conf.d/satellite-watcher.conf
```

写入以下内容：

```nginx
server {
    listen 80;
    server_name 你的域名.com;

    # Next.js 静态资源（长期缓存）
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        expires 365d;
        add_header Cache-Control "public, immutable";
    }

    # Cesium 静态资源（由 next.config.mjs 拷贝到 public/cesium/）
    location /cesium/ {
        proxy_pass http://127.0.0.1:3000;
        expires 30d;
        add_header Cache-Control "public";
    }

    # API 路由和页面
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

        # API 超时 60s（Celestrak 导入可能较慢）
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    # 上传文件大小限制（TLE 文件导入）
    client_max_body_size 10m;
}
```

测试并重载 Nginx：

```bash
sudo nginx -t          # 测试配置语法
sudo nginx -s reload   # 重载配置
```

### 步骤 9：配置 HTTPS

**方式 A：使用 Let's Encrypt（免费，推荐）**

```bash
# 自动申请证书并配置 Nginx
sudo certbot --nginx -d 你的域名.com

# 测试自动续期
sudo certbot renew --dry-run
```

**方式 B：使用阿里云免费 SSL 证书**

1. 阿里云控制台 → **数字证书管理服务** → 申请免费证书
2. 域名验证后下载证书（Nginx 格式）
3. 上传到 ECS：

```bash
sudo mkdir -p /etc/nginx/ssl
# 上传 .pem 和 .key 文件到 /etc/nginx/ssl/
```

4. 修改 Nginx 配置：

```nginx
server {
    listen 443 ssl;
    server_name 你的域名.com;

    ssl_certificate     /etc/nginx/ssl/你的域名.pem;
    ssl_certificate_key /etc/nginx/ssl/你的域名.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # ... 其余 location 配置同上
}

# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name 你的域名.com;
    return 301 https://$host$request_uri;
}
```

```bash
sudo nginx -t && sudo nginx -s reload
```

### 步骤 10：域名备案

> 国内服务器 + 国内域名必须完成 ICP 备案（约 7-20 个工作日）。

1. 阿里云控制台 → **备案** → 新增备案
2. 按提示上传身份证、域名证书、服务器信息
3. 备案通过后在域名 DNS 解析中添加 A 记录指向 ECS 公网 IP

### 阿里云日常运维

**更新部署**：

```bash
cd /var/www/satellite-watcher
git pull
npm install
npm run build
pm2 restart satellite-watcher
```

**查看日志**：

```bash
# 实时日志
pm2 logs satellite-watcher

# 最近 100 行
pm2 logs satellite-watcher --lines 100

# Nginx 日志
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

**数据库备份**：
- RDS 默认每日自动备份，保留 7 天
- 手动备份：RDS 控制台 → 实例 → 备份恢复 → 创建备份

---

## 数据库初始化与种子数据

两种部署方式都需要执行数据库初始化。项目已内置种子脚本。

### 一键初始化

```bash
# 确保已配置 DATABASE_URL 环境变量
npm run db:seed
```

此命令执行：
1. `prisma db push` — 根据 `schema.prisma` 创建 6 张表
2. `prisma generate` — 生成 Prisma Client 类型
3. `tsx prisma/seed.ts` — 导入初始数据

### 种子数据内容

| 数据 | 数量 | 来源 |
|------|------|------|
| 卫星（`SpaceObject`） | 9 颗 | `src/lib/mock/satellites.ts` |
| TLE 轨道根数（`TLEData`） | 9 条 | 同上 |
| 标签（`UserTag`） | 4 个 | 同上 `mockTags` |

**9 颗种子卫星**：

| NORAD ID | 名称 | 国家 | 类型 |
|----------|------|------|------|
| 25544 | ISS (ZARYA) | USA/RUS | 有效载荷 |
| 20580 | HUBBLE SPACE TELESCOPE | USA | 有效载荷 |
| 48274 | CSS (TIANHE) | CHN | 有效载荷 |
| 53421 | CSS (WENTIAN) | CHN | 有效载荷 |
| 54219 | CSS (MENGTIAN) | CHN | 有效载荷 |
| 40730 | METOP-A | USA | 有效载荷 |
| 44231 | NOAA 19 | USA | 有效载荷 |
| 41270 | NOAA 16 DEB | UNK | 碎片 |
| 72341 | UNKNOWN OBJECT | UNK | 未知 |

**4 个种子标签**：载人航天、导航卫星、空间望远镜、空间站。

### 单独执行各步骤

如果只需要执行某一步：

```bash
# 仅建表
npm run db:push

# 仅导入种子数据（表已存在）
npm run seed

# 重置数据库（删除所有表后重建）
npx prisma db push --force-reset
npm run seed
```

---

## 部署后验证

### 1. 基础功能检查

| 检查项 | 操作 | 预期结果 |
|--------|------|---------|
| 页面加载 | 访问首页 | 显示卫星列表，至少 9 颗卫星 |
| 2D 地图 | 切换到 2D 视图 | MapLibre 地图加载，卫星标记可见 |
| 3D 地球 | 切换到 3D 视图 | Cesium 地球加载，卫星实体可见 |
| 卫星定位 | 点击卫星详情中的定位图标 | 相机飞至卫星位置 |
| 时间回放 | 拖动时间轴 | 卫星位置实时更新 |
| 国别筛选 | 选择「中国」 | 列表显示中国卫星 |

### 2. 数据库连接检查

```bash
# Vercel：在 Vercel Dashboard → Functions → Logs 查看是否有
# "Database unavailable, using mock data" 警告

# 阿里云：查看 PM2 日志
pm2 logs satellite-watcher | grep -i "database"
```

如果有上述警告，说明数据库连接失败，正在使用 mock 降级数据。

### 3. API 接口检查

```bash
# 替换为你的域名
curl https://你的域名/api/space-objects | jq .

# 应返回 success: true，data 包含卫星数组
```

### 4. TLE 导入测试

1. 点击「导入数据」按钮
2. 选择「星座导入」→ 选择「Starlink」
3. 等待导入完成（可能需要 10-30 秒）
4. 刷新页面，确认新导入的卫星持久化存在

---

## 常见问题排查

### 构建失败

**问题：`prisma generate` 报错**

```bash
Error: Could not load @prisma/client
```

**解决**：确保 `DATABASE_URL` 已正确配置，然后执行：

```bash
npx prisma generate
npm run build
```

---

**问题：Cesium 构建资源缺失**

```
[next.config] Cesium build directory not found
```

**解决**：确保 `node_modules/cesium` 已安装：

```bash
npm install cesium @cesium/engine
npm run build
```

`next.config.mjs` 会在构建时自动从 `node_modules/cesium/Build/` 拷贝静态资源到 `public/cesium/`。

---

### 数据库连接失败

**问题：Vercel 部署后 API 返回 mock 数据**

日志显示：`Database unavailable, using mock data`

**排查步骤**：

1. 检查 `DATABASE_URL` 环境变量是否已添加（不是 `POSTGRES_URL`）
2. 确认 `DATABASE_URL` 使用的是 `POSTGRES_URL_NON_POOLING` 值（不带 `?pgbouncer=true`）
3. 确认环境变量已应用于 Production 环境
4. 执行 `npm run db:seed` 初始化表结构

---

**问题：阿里云 RDS 连接超时**

```
Error: connect ETIMEDOUT rm-xxxx.pg.rds.aliyuncs.com:5432
```

**排查步骤**：

1. 确认 ECS 和 RDS 在同一 VPC
2. 确认 RDS 白名单已添加 ECS 内网 IP
3. 确认 RDS 没有设置「禁止外网访问」限制内网也禁了
4. 测试连通性：`telnet rm-xxxx.pg.rds.aliyuncs.com 5432`

---

### Cesium 3D 地球不显示

**问题**：3D 视图白屏或报错

**排查步骤**：

1. 检查浏览器控制台是否有 `CESIUM_BASE_URL` 相关错误
2. 确认 `/cesium/` 路径可访问：`curl https://你的域名/cesium/Cesium.js`
3. 确认 `next.config.mjs` 中的 `copyCesiumAssets()` 已执行（检查 `public/cesium/` 目录是否存在）
4. 如果是阿里云部署，确保 Nginx 配置了 `/cesium/` 的代理

---

### GitHub 推送失败（国内网络）

```bash
fatal: unable to access 'https://github.com/...': Failed to connect
```

**解决**：配置 git 代理（假设本地代理端口 7897）：

```bash
git config --global http.proxy socks5h://127.0.0.1:7897
git config --global https.proxy socks5h://127.0.0.1:7897
git config --global http.sslBackend openssl
```

---

### 阿里云构建内存不足

```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed
```

**解决**：添加 4G swap：

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 两种方式对比

| 维度 | Vercel | 阿里云 ECS |
|------|--------|-----------|
| **部署难度** | 低（Git push 即部署） | 中（需配置服务器） |
| **初始成本** | 免费（Hobby 计划） | ECS ¥60/月 + RDS ¥100/月 |
| **国内访问速度** | 一般（香港节点 ~100ms） | 快（国内节点 <30ms） |
| **数据库** | Vercel Postgres（Neon，免费 60h/月） | 阿里云 RDS（更稳定，自动备份） |
| **数据合规** | 数据在海外 | 可选国内地域，满足合规 |
| **弹性扩展** | 自动扩缩容 | 需手动升配或加 SLB |
| **自定义程度** | 受平台限制 | 完全可控 |
| **运维负担** | 零运维 | 需维护系统、Nginx、PM2 |
| **HTTPS 证书** | 自动配置 | 手动申请（Let's Encrypt 或阿里云） |
| **适用场景** | 原型验证、海外用户、快速上线 | 国内生产环境、数据本地化、高合规要求 |

### 推荐选择

- **个人项目 / 比赛 Demo / 海外用户** → Vercel（零成本、零运维）
- **国内生产环境 / 需要备案域名** → 阿里云（低延迟、数据合规）
- **混合方案** → 阿里云 RDS（数据库）+ Vercel（前端），兼顾两者优势
