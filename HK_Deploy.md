# 香港轻量服务器部署指南

将 Next.js standalone 应用直接部署到阿里云香港轻量服务器，Nginx 反向代理 + PM2 进程管理。

**线上域名**：https://www.wanzhixuexi.cn

---

## 服务器规格

- **服务商**：阿里云轻量应用服务器
- **配置**：1 核 1GB / 40GB ESSD
- **带宽**：30Mbps（BGP线路）
- **系统**：Ubuntu 22.04 LTS
- **月费**：~25元
- **数据库**：Neon Postgres（新加坡，Serverless）
- **SSL**：Let's Encrypt 免费证书

---

## 一、服务器环境初始化

```bash
# SSH 登录
ssh root@<服务器IP>

# 更新系统
apt update && apt upgrade -y

# 安装 Nginx、Node.js、PM2、Certbot
apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs
npm install -g pm2
apt install -y certbot python3-certbot-nginx

# 验证
node -v  # v20.x
nginx -v
pm2 -v

# 开机自启
systemctl enable nginx
pm2 startup
```

---

## 二、创建应用目录

```bash
mkdir -p /app
```

---

## 三、配置 PM2 生态文件

在 `/app/ecosystem.config.cjs`：

```javascript
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
      DATABASE_URL: 'postgresql://<neon-connection-string>',
      ADMIN_PASSWORD: '<your-operation-password>',
    }
  }]
};
```

---

## 四、本地构建与部署

在开发机（Windows）执行：

```powershell
# 1. 构建（确保 next.config.mjs 中 output: 'standalone'）
npm run build

# 2. 打包 standalone 产物
Remove-Item -Recurse -Force "app-pkg" -ErrorAction SilentlyContinue
Remove-Item -Force "app-pkg.tar.gz" -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path "app-pkg" | Out-Null
Copy-Item -Recurse ".next/standalone/." "app-pkg/"
New-Item -ItemType Directory -Path "app-pkg/.next/static" -Force | Out-Null
Copy-Item -Recurse ".next/static/." "app-pkg/.next/static/"
Copy-Item -Recurse "public" "app-pkg/public"
Compress-Archive -Path "app-pkg/*" -DestinationPath "app-pkg.tar.gz" -Force

# 3. 上传到服务器
scp app-pkg.tar.gz root@<服务器IP>:/tmp/

# 4. 服务器上解压并重启
ssh root@<服务器IP> "cd /app && tar xzf /tmp/app-pkg.tar.gz -C /app/ && pm2 restart satellite || pm2 start ecosystem.config.cjs && pm2 save"
```

---

## 五、配置 Nginx（含限流安全防护）

### 5.1 添加限流区域（必须！）

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

### 5.2 创建站点配置

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

## 六、配置 SSL 证书

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

## 七、防火墙

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```

阿里云轻量服务器还需在控制台 **防火墙规则** 中放行 80/443 端口。

---

## 八、fail2ban 防暴力破解（可选）

```bash
apt install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban
```

---

## 日常更新部署

```powershell
# 本地构建并部署（一条命令）
npm run build; Remove-Item -Recurse -Force "app-pkg" -ErrorAction SilentlyContinue; Remove-Item -Force "app-pkg.tar.gz" -ErrorAction SilentlyContinue; New-Item -ItemType Directory -Path "app-pkg" | Out-Null; Copy-Item -Recurse ".next/standalone/." "app-pkg/"; New-Item -ItemType Directory -Path "app-pkg/.next/static" -Force | Out-Null; Copy-Item -Recurse ".next/static/." "app-pkg/.next/static/"; Copy-Item -Recurse "public" "app-pkg/public"; Compress-Archive -Path "app-pkg/*" -DestinationPath "app-pkg.tar.gz" -Force; scp app-pkg.tar.gz root@<服务器IP>:/tmp/; ssh root@<服务器IP> "cd /app && tar xzf /tmp/app-pkg.tar.gz -C /app/ && pm2 restart satellite"
```

### 单文件增量更新（仅API变更时）

```bash
scp .next/standalone/.next/server/app/api/tle/refresh/route.js root@<server>:/app/.next/server/app/api/tle/refresh/route.js
ssh root@<server> "pm2 restart satellite"
```

---

## 常用运维命令

```bash
# PM2 管理
pm2 status              # 查看状态
pm2 logs satellite      # 查看日志
pm2 restart satellite   # 重启
pm2 monit               # 监控面板

# Nginx 管理
nginx -t                # 测试配置
systemctl reload nginx  # 重载配置
systemctl status nginx  # 状态

# 日志查看
tail -f /app/.pm2/logs/satellite-out.log
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# 更新 Nginx 安全配置
scp deploy/nginx-secure.conf root@<server>:/etc/nginx/sites-available/satellite-watcher
ssh root@<server> "nginx -t && systemctl reload nginx"
```

---

## 架构

```
国内用户 → HTTPS → Nginx(443) → proxy_pass → PM2 → Next.js:3000 → Neon Postgres(新加坡)
                                ↓
                          限流/缓存/SSL/安全头
```

### 为什么不用反代 Vercel？

直接 standalone 部署比反代 Vercel 更稳定：
- 不依赖 Vercel 国际链路，不受 Vercel 限流影响
- 数据库直连 Neon（新加坡），延迟更低
- 完全自主控制 Nginx 限流和安全策略
- 内存限制 500MB，1核1G 服务器足够运行
