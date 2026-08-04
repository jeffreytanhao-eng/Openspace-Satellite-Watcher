# TREA 卫星观测平台 — HK 服务器部署指南

本目录把整个平台打包为 Docker Compose，一键部署到香港服务器，复刻 Vercel 上的完整能力
（含 PostgreSQL 数据库、星座导入、AI 任务规划、Cesium 3D 地球、HTTPS 自动证书）。

## 架构

```
            ┌───────────┐ :80/:443
  用户 ───► │   Caddy   │ ◄── 自动申请+续期 Let's Encrypt 证书 (wanzhixuexi.cn)
            └─────┬─────┘
                  │ 反代
            ┌─────▼─────┐ :3000
            │    App    │  Next.js standalone (node server.js)
            │ (Cesium)  │  Cesium 走 jsdelivr CDN
            └─────┬─────┘
                  │ DATABASE_URL
            ┌─────▼─────┐
            │ PostgreSQL │  13 默认卫星 + 8 星座 + 标签(卷持久化)
            └───────────┘
            (migrate 一次性服务:首次启动跑 prisma db push + seed)
```

| 服务 | 作用 |
|------|------|
| `postgres` | postgres:16-alpine，数据卷持久化，仅内部网络可达 |
| `migrate` | 一次性，同步 schema + 幂等 seed（upsert，重跑安全），app 启动前跑完 |
| `app` | Next.js standalone 运行时（node:20-alpine），监听 3000 |
| `caddy` | caddy:2-alpine，反代 + 自动 HTTPS，HTTP→HTTPS 跳转 |

---

## 前置条件

1. **服务器**：47.82.118.133（root 可登录，已装或可装 Docker）
2. **域名 DNS**：`wanzhixuexi.cn` 的 A 记录指向 `47.82.118.133`
   - ⚠️ **必须在 Caddy 启动前完成 DNS 解析**，否则 Let's Encrypt 证书申请会失败并重试
3. **防火墙**：开放 `80` 和 `443` 端口（Caddy 申请证书 + 对外服务都需要）
4. **Docker**：服务器已装 Docker Engine + Docker Compose v2

---

## 部署步骤

### 1. 配置 DNS

到域名注册商把 `wanzhixuexi.cn` 的 **A 记录**指向 `47.82.118.133`。
等 DNS 生效（可用 `dig wanzhixuexi.cn` 或在线工具验证返回 47.82.118.133）。

### 2. SSH 登录服务器并装 Docker（如未装）

```bash
ssh root@47.82.118.133
# 装 Docker（如已装跳过）
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker --version && docker compose version
```

### 3. 拉取代码

```bash
cd /opt   # 或任意目录
git clone https://github.com/jeffreytanhao-eng/Openspace-Satellite-Watcher.git satwatch
cd satwatch
```

### 4. 配置环境变量

```bash
cp deploy/.env.example deploy/.env
```

编辑 `deploy/.env`，**必填两项**：

| 变量 | 值 | 说明 |
|------|------|------|
| `ACME_EMAIL` | 你的邮箱 | Let's Encrypt 证书到期通知 |
| `LLM_API_KEY` | `569ada4e-...`（从本地 .env.local 复制） | 豆包模型 key，留空则 AI 规划返回 MISSING_CONFIG |

> `POSTGRES_PASSWORD` 由 `deploy.sh` 自动生成强随机密码，无需手填。
> `deploy/.env` 已被 `.gitignore` 忽略，不会进 git。

### 5. 一键部署

```bash
sh deploy/deploy.sh
```

脚本会：
1. 若 `deploy/.env` 不存在则从模板生成 + 随机 DB 密码
2. 检查 `ACME_EMAIL` / `LLM_API_KEY` 是否填写（未填会警告但不阻塞）
3. `docker compose up -d --build`：构建镜像 + 启动四服务
4. `migrate` 服务先跑 `prisma db push` + seed（首次会从 Celestrak 拉 8 个星座，约 30-60s）

### 6. 验证

```bash
# 服务状态：postgres/app/caddy 应 Up，migrate 应 Exited 0
docker compose -f deploy/docker-compose.yml ps

# 看 migrate 是否完成（应看到 "Seed completed successfully!"）
docker compose -f deploy/docker-compose.yml logs migrate

# 看 Caddy 证书申请（应看到 "certificate obtained successfully"）
docker compose -f deploy/docker-compose.yml logs caddy
```

浏览器访问 **https://wanzhixuexi.cn**：
- ✅ Cesium 3D 地球加载 + 13 颗默认卫星显示
- ✅ TREA 任务中心、AI 辅助任务规划、避撞视频回放正常
- ✅ 星座导入功能可用（DB 已 seed 8 个星座）

证书首次申请可能需 1-2 分钟，期间 HTTPS 可能不可用，刷新即可。

---

## 常用运维命令

```bash
# 查看实时日志
docker compose -f deploy/docker-compose.yml logs -f

# 只看某服务
docker compose -f deploy/docker-compose.yml logs -f app
docker compose -f deploy/docker-compose.yml logs -f caddy

# 重启某服务
docker compose -f deploy/docker-compose.yml restart app

# 停止全部
docker compose -f deploy/docker-compose.yml down

# 停止并删除数据卷（⚠️ 清空数据库，谨慎）
docker compose -f deploy/docker-compose.yml down -v

# 重新构建（代码更新后）
git pull
docker compose -f deploy/docker-compose.yml up -d --build
```

---

## 更新代码

```bash
cd /opt/satwatch
git pull
docker compose -f deploy/docker-compose.yml up -d --build
# migrate 会自动重跑（幂等，安全）；app 重建后自动重启
```

---

## 常见问题

### Q: Caddy 一直拿不到证书 / 访问 HTTPS 报错
- 检查 DNS：`dig wanzhixuexi.cn` 是否返回 `47.82.118.133`
- 检查防火墙：`80` 和 `443` 是否开放
- 看 Caddy 日志：`docker compose -f deploy/docker-compose.yml logs caddy`
- Caddy 会自动重试，DNS 生效后会成功

### Q: AI 任务规划报错 "MISSING_CONFIG"
→ `deploy/.env` 的 `LLM_API_KEY` 未填或为空。填好后 `docker compose -f deploy/docker-compose.yml restart app`。

### Q: 首页卫星为空 / 数据库相关功能报错
→ 检查 postgres 与 migrate 状态：
```bash
docker compose -f deploy/docker-compose.yml ps
docker compose -f deploy/docker-compose.yml logs migrate
```
migrate 应 Exited 0；若非 0，看日志排查（多半是 postgres 未就绪或 seed 报错）。

### Q: 星座只有部分 / Celestrak 拉取失败
seed 是 best-effort：Celestrak 不可达时单个星座失败不影响其余，13 颗默认卫星一定会入库。
可手动重跑 seed：`docker compose -f deploy/docker-compose.yml run --rm migrate`。

### Q: 视频回放卡顿
本部署已包含"视频播放时停止 Cesium 渲染循环"的修复（`useDefaultRenderLoop=false`），
12 秒避撞视频应流畅播放。若仍卡，检查服务器是否有其他 GPU/内存争用。

### Q: 服务器内存不足，构建 OOM
若服务器内存 < 2GB，`next build` 可能 OOM。改用本地构建镜像传到服务器：
```bash
# 本地构建
docker build -f deploy/Dockerfile -t satwatch-app:latest --target runner .
docker save satwatch-app:latest | gzip > satwatch-app.tar.gz
# 传到服务器
scp satwatch-app.tar.gz root@47.82.118.133:/opt/
# 服务器加载
gunzip -c /opt/satwatch-app.tar.gz | docker load
# 修改 docker-compose.yml 的 app.build 改为 image: satwatch-app:latest,再 up -d
```

---

## 文件说明

| 文件 | 作用 |
|------|------|
| `deploy/Dockerfile` | 三阶段构建（deps → builder → runner） |
| `deploy/docker-compose.yml` | 四服务编排 |
| `deploy/Caddyfile` | Caddy 反代 + 自动 HTTPS + 静态缓存 |
| `deploy/.env.example` | 环境变量模板（提交到 git） |
| `deploy/.env` | 实际环境变量（gitignored，含密钥，仅服务器本地） |
| `deploy/deploy.sh` | 一键部署脚本 |
| `.dockerignore` | 构建上下文排除规则 |

## 安全说明
- `deploy/.env`（含 `LLM_API_KEY` / `POSTGRES_PASSWORD`）已被 `.gitignore` 忽略，不会提交。
- PostgreSQL 仅 compose 内部网络可达，不暴露宿主机端口。
- Caddy 自动管理证书续期，无需 cron。
