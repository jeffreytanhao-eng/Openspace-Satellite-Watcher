# 香港轻量服务器部署指南

将 Next.js 应用部署到阿里云香港轻量服务器，Nginx 反向代理 + PM2 进程管理 + 本地 PostgreSQL。

**线上域名**：https://www.wanzhixuexi.cn

---

## 服务器环境

- **服务商**：阿里云轻量应用服务器
- **系统**：Ubuntu 22.04 LTS
- **数据库**：本地 PostgreSQL（卫星数据存储）
- **SSL**：Let's Encrypt 免费证书

---

## 一、服务器环境初始化

```bash
# SSH 登录
ssh root@<服务器IP>

# 更新系统
apt update && apt upgrade -y

# 安装 Nginx、Node.js、PM2、Certbot、PostgreSQL
apt install -y nginx postgresql postgresql-contrib
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs
npm install -g pm2
apt install -y certbot python3-certbot-nginx

# 验证
node -v  # v20.x
nginx -v
pm2 -v

# 开机自启
systemctl enable nginx
systemctl enable postgresql
pm2 startup
```

---

## 二、配置本地 PostgreSQL

```bash
# 启动 PostgreSQL
systemctl start postgresql

# 创建数据库和设置密码
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres psql -c "CREATE DATABASE \"satellite-watcher\";"

# 验证连接
sudo -u postgres psql -d "satellite-watcher" -c "SELECT 1;"
```

### PostgreSQL 内存优化

编辑 `/etc/postgresql/<version>/main/postgresql.conf`：

```ini
shared_buffers = 128MB
work_mem = 16MB
effective_cache_size = 256MB
max_connections = 50
```

重启生效：`systemctl restart postgresql`

---

## 三、创建应用目录

```bash
mkdir -p /app
```

---

## 四、配置 PM2 生态文件

在 `/app/ecosystem.config.cjs`：

```javascript
module.exports = {
  apps: [{
    name: 'satellite',
    script: 'node',
    args: 'node_modules/next/dist/bin/next start -p 3000',
    cwd: '/app',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/satellite-watcher?schema=public',
      ADMIN_PASSWORD: '<your-operation-password>',
      NEXTAUTH_URL: 'https://www.wanzhixuexi.cn',
    },
    error_file: '/var/log/satellite-error.log',
    out_file: '/var/log/satellite-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
};
```

> 注意：PM2 的 `env` 字段直接声明环境变量，确保 DATABASE_URL 正确加载。

---

## 五、本地构建与一键部署

### 方式 A：使用部署脚本（推荐）

在开发机（Windows PowerShell）执行：

```powershell
# 1. 构建
npm run build

# 2. 打包
tar -czf app-pkg.tar.gz .next public node_modules ecosystem.config.cjs package.json

# 3. 一键部署（自动上传、解压、数据库迁移、PM2重启、健康检查）
powershell -ExecutionPolicy Bypass -File deploy.ps1
```

部署脚本会自动：
- 上传打包文件、Nginx配置、环境变量、PM2配置到服务器
- 检测 PostgreSQL 是否运行，未运行则自动安装和初始化
- 检测数据库是否为空，为空则自动执行迁移和种子
- 重启 PM2 并进行健康检查和响应时间测试

### 方式 B：手动部署

```powershell
# 1. 上传打包文件
scp app-pkg.tar.gz root@<服务器IP>:/tmp/

# 2. 服务器上解压
ssh root@<服务器IP> "cd /app && tar xzf /tmp/app-pkg.tar.gz"

# 3. 首次部署：数据库迁移和种子
ssh root@<服务器IP> "cd /app && \
  DATABASE_URL='postgresql://postgres:postgres@localhost:5432/satellite-watcher?schema=public' \
  POSTGRES_URL_NON_POOLING='postgresql://postgres:postgres@localhost:5432/satellite-watcher?schema=public' \
  node_modules/.bin/prisma db push && \
  DATABASE_URL='postgresql://postgres:postgres@localhost:5432/satellite-watcher?schema=public' \
  POSTGRES_URL_NON_POOLING='postgresql://postgres:postgres@localhost:5432/satellite-watcher?schema=public' \
  node_modules/.bin/tsx prisma/seed.ts"

# 4. 重启 PM2
ssh root@<服务器IP> "cd /app && pm2 delete satellite 2>/dev/null; pm2 start ecosystem.config.cjs && pm2 save"
```

> 注意：Prisma schema 使用 `POSTGRES_URL_NON_POOLING` 环境变量，迁移时需同时设置 `DATABASE_URL` 和 `POSTGRES_URL_NON_POOLING`。

---

## 六、配置 Nginx（含限流安全防护）

### 6.1 添加限流区域（必须！）

编辑 `/etc/nginx/nginx.conf`，在 `http {}` 块内添加：

```nginx
http {
    # ... 现有配置 ...

    # ---- IP 限流区域定义 ----
    limit_req_zone  $binary_remote_addr zone=static:10m      rate=30r/s;
    limit_req_zone  $binary_remote_addr zone=api_read:10m    rate=10r/s;
    limit_req_zone  $binary_remote_addr zone=api_import:10m  rate=2r/s;
    limit_req_zone  $binary_remote_addr zone=api_sensitive:10m rate=5r/m;
    limit_conn_zone $binary_remote_addr zone=conn_per_ip:10m;
    limit_conn_zone $server_name        zone=conn_total:10m;

    # 隐藏版本号
    server_tokens off;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1000;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml application/xml+rss text/javascript
               image/svg+xml application/wasm;
}
```

### 6.2 创建站点配置

将项目中的 `deploy/nginx-secure.conf` 复制到服务器：

```bash
# 本地执行
scp deploy/nginx-secure.conf root@<服务器IP>:/etc/nginx/sites-available/satellite-watcher

# 服务器上修改域名（如有变化），然后启用
ssh root@<服务器IP> "
  ln -sf /etc/nginx/sites-available/satellite-watcher /etc/nginx/sites-enabled/
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
"
```

### Nginx 安全配置要点

| 功能 | 配置 |
|------|------|
| HTTP→HTTPS 跳转 | 80端口 server 块 return 301 |
| SSL | TLSv1.2/1.3，强加密套件 |
| 静态资源缓存 | `_next/static/` 1年 immutable；`models/`/`cesium/` 7天 |
| IP 限流 | 静态30r/s，读API 10r/s，导入2r/s，敏感操作5次/分钟 |
| 并发限制 | 每IP≤10连接，全局≤100连接 |
| 请求体限制 | `client_max_body_size 3m`（防大文件上传） |
| 超时设置 | `client_body_timeout 10s`，`send_timeout 30s` |
| 安全响应头 | X-Frame-Options DENY、X-Content-Type-Options nosniff、CSP |
| 隐藏文件 | 禁止访问 `.` 开头的文件/目录 |
| 429/503 错误 | 返回 JSON 友好提示 |

---

## 七、配置 SSL 证书

```bash
certbot --nginx -d wanzhixuexi.cn -d www.wanzhixuexi.cn
```

按提示输入邮箱、同意协议，Certbot 自动修改 Nginx 配置添加 SSL。

验证：访问 https://www.wanzhixuexi.cn 应看到绿色锁。

自动续期：
```bash
systemctl status certbot.timer  # 应显示 active
certbot renew --dry-run         # 手动测试续期
```

---

## 八、防火墙

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```

阿里云轻量服务器还需在控制台 **防火墙规则** 中放行 80/443 端口。

---

## 九、fail2ban 防暴力破解（可选）

```bash
apt install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban
```

---

## 日常更新部署

```powershell
# 一键部署（推荐）
npm run build
tar -czf app-pkg.tar.gz .next public node_modules ecosystem.config.cjs package.json
powershell -ExecutionPolicy Bypass -File deploy.ps1
```

---

## 常用运维命令

```bash
# PM2 管理
sudo pm2 status              # 查看状态
sudo pm2 logs satellite      # 查看日志
sudo pm2 restart satellite   # 重启
sudo pm2 monit               # 监控面板
sudo pm2 env 0 | grep DATABASE_URL  # 检查环境变量

# PostgreSQL 管理
sudo -u postgres psql -d "satellite-watcher" -c 'SELECT COUNT(*) FROM "SpaceObject";'
sudo systemctl status postgresql
sudo systemctl restart postgresql

# Nginx 管理
nginx -t                # 测试配置
systemctl reload nginx  # 重载配置
systemctl status nginx  # 状态

# 日志查看
sudo pm2 logs satellite --lines 50
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# 更新 Nginx 安全配置
scp deploy/nginx-secure.conf root@<server>:/etc/nginx/sites-available/satellite-watcher
ssh root@<server> "nginx -t && systemctl reload nginx"
```

---

## 架构

```
国内用户 → HTTPS → Nginx(443) → proxy_pass → PM2 → Next.js:3000 → PostgreSQL(本地)
                                ↓
                          限流/缓存/SSL/安全头
                                         ↓
                               Celestrak / NASA (外部API)
```

### 为什么用本地 PostgreSQL？

- **低延迟**：本地查询 <25ms，远端 Neon 数据库 ~400ms+
- **高可用**：不依赖外部数据库服务，服务器自身即可运行
- **API 缓存**：配合内存缓存（5min TTL），缓存命中响应 <25ms
- **零成本**：PostgreSQL 包含在服务器中，无需额外数据库服务

### 为什么不用反代 Vercel？

直接部署比反代 Vercel 更稳定：
- 不依赖 Vercel 国际链路，不受 Vercel 限流影响
- 数据库本地直连，延迟更低
- 完全自主控制 Nginx 限流和安全策略

### 数据库初始化脚本

首次部署或数据库重置时，使用 `deploy/setup-local-db.sh`：

```bash
sudo bash deploy/setup-local-db.sh
```

该脚本自动：安装 PostgreSQL → 创建数据库 → 优化配置 → 执行迁移 → 导入种子数据
