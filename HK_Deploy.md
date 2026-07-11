# 香港轻量服务器反代 Vercel 部署指南

解决国内访问 Vercel 部署缓慢/不稳定问题。通过香港服务器 Nginx 反向代理，国内用户经 CN2/BGP 专线到香港（10-40ms），香港回源 Vercel，Vercel 部署流程完全不变。

---

## 一、购买服务器

### 推荐选项

| 服务商 | 套餐 | 带宽 | 月付 | 年付 | 线路 | 推荐度 |
|--------|------|------|------|------|------|--------|
| 腾讯云轻量 | 2核2G/50G SSD/1TB流量 | 30Mbps | ~24元 | ~288元 | 普通BGP | ⭐⭐⭐ |
| 阿里云轻量 | 2核1G/40G ESSD | 30Mbps | 25元 | 300元 | 普通BGP | ⭐⭐⭐ |
| 恒创科技 | 1核1G/50G SSD | 5-10M CN2 GIA | ~21元 | ~252元 | 双向CN2 GIA | ⭐⭐⭐⭐⭐ |

**建议**：反代不需要高配置，1核1G 足够。线路质量 > 配置，**优先选 CN2 GIA 线路**。

**购买要点**：
- 地域选 **中国香港**（不要选新加坡/日本）
- 系统镜像选 **Ubuntu 22.04 LTS**
- 无需 ICP 备案，付款后 5 分钟可用
- 记录好 **公网IP** 和 **root密码**

---

## 二、连接服务器

Windows PowerShell：

```bash
ssh root@<服务器IP>
```

首次连接输入 `yes` 确认指纹，输入密码登录。

---

## 三、安装 Nginx

```bash
apt update && apt upgrade -y
apt install -y nginx certbot python3-certbot-nginx
systemctl enable nginx
systemctl start nginx
```

验证：浏览器访问 `http://<服务器IP>` 看到 Nginx 欢迎页。

---

## 四、配置反向代理

### 4.1 创建站点配置

```bash
nano /etc/nginx/sites-available/satellite-watcher
```

写入以下内容，将 `your-domain.com` 替换为你的域名：

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # 静态资源缓存（3D模型、JS/CSS）
    location /models/ {
        proxy_pass https://openspace-satellite-watcher.vercel.app;
        proxy_set_header Host openspace-satellite-watcher.vercel.app;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_ssl_server_name on;
        proxy_ssl_name openspace-satellite-watcher.vercel.app;
        proxy_cache_valid 200 30d;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /_next/static/ {
        proxy_pass https://openspace-satellite-watcher.vercel.app;
        proxy_set_header Host openspace-satellite-watcher.vercel.app;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_ssl_server_name on;
        proxy_ssl_name openspace-satellite-watcher.vercel.app;
        proxy_cache_valid 200 365d;
        expires 365d;
        add_header Cache-Control "public, immutable";
    }

    location /uploads/ {
        proxy_pass https://openspace-satellite-watcher.vercel.app;
        proxy_set_header Host openspace-satellite-watcher.vercel.app;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_ssl_server_name on;
        proxy_ssl_name openspace-satellite-watcher.vercel.app;
        proxy_cache_valid 200 7d;
        expires 7d;
    }

    # 主站反代
    location / {
        proxy_pass https://openspace-satellite-watcher.vercel.app;
        proxy_set_header Host openspace-satellite-watcher.vercel.app;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 支持（Next.js HMR 开发热更新）
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # 缓冲配置
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
        proxy_busy_buffers_size 8k;

        # SSL 回源
        proxy_ssl_server_name on;
        proxy_ssl_name openspace-satellite-watcher.vercel.app;

        # 动态页面不缓存
        proxy_no_cache $cookie_session;
        proxy_cache_bypass $cookie_session;
    }
}
```

### 4.2 启用配置

```bash
ln -s /etc/nginx/sites-available/satellite-watcher /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

`nginx -t` 显示 `test is successful` 则配置正确。

---

## 五、配置域名解析

在域名服务商添加 DNS 记录：

| 类型 | 主机记录 | 记录值 |
|------|---------|--------|
| A | @ | `<服务器IP>` |
| A | www | `<服务器IP>` |

等待 5-10 分钟生效，验证：

```bash
ping your-domain.com
```

应返回香港服务器 IP。

---

## 六、配置 HTTPS

```bash
certbot --nginx -d your-domain.com -d www.your-domain.com
```

按提示输入邮箱、同意协议，Certbot 自动申请 Let's Encrypt 证书并配置 HTTP→HTTPS 重定向。

验证：`https://your-domain.com` 可访问且 SSL 锁为绿色。

---

## 七、自动续期证书

Let's Encrypt 证书 90 天过期，Certbot 自动创建 systemd timer 续期：

```bash
systemctl status certbot.timer
```

显示 `active (waiting)` 即可，无需手动操作。

---

## 八、Gzip 压缩优化

编辑 `/etc/nginx/nginx.conf`，在 `http {}` 块中确认：

```nginx
gzip on;
gzip_vary on;
gzip_min_length 1000;
gzip_types text/plain text/css application/json application/javascript
           text/xml application/xml application/xml+rss text/javascript
           image/svg+xml application/wasm;
```

重载：`nginx -t && systemctl reload nginx`

---

## 九、防火墙

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

---

## 十、系统安全加固（可选）

```bash
# 禁止 root 密码登录（改用密钥后执行）
# nano /etc/ssh/sshd_config
#   PasswordAuthentication no
#   PermitRootLogin prohibit-password
# systemctl restart sshd

# 安装 fail2ban 防暴力破解
apt install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban
```

---

## 架构示意

```
国内用户 → 你的域名 → 香港服务器(Nginx反代) → Vercel源站
              ↓              ↓                     ↓
         DNS解析到     SSL终结/缓存/压缩      Next.js SSR + 数据库
         香港IP       CN2线路回国           Vercel全球CDN回源
```

| 环节 | 延迟 |
|------|------|
| 国内用户 → 香港服务器 | 10-40ms（CN2 GIA）/ 30-50ms（普通BGP） |
| 香港服务器 → Vercel | ~30-80ms（国际线路） |
| 总计（首字节） | ~50-150ms（对比直连 Vercel 200-500ms+） |

---

## 日常维护

```bash
# 查看 Nginx 状态
systemctl status nginx

# 查看访问日志
tail -f /var/log/nginx/access.log

# 查看错误日志
tail -f /var/log/nginx/error.log

# 重载配置（修改后执行）
nginx -t && systemctl reload nginx

# 续期证书（自动执行，手动测试）
certbot renew --dry-run

# 更新系统
apt update && apt upgrade -y
```

---

## Vercel 自定义域名配置（推荐）

为了让 Vercel 识别自定义域名、正确生成页面链接：

1. 打开 Vercel Dashboard → openspace-satellite-watcher → Settings → Domains
2. 添加 `your-domain.com`
3. 按提示验证域名（由于 DNS 已指向香港服务器，Vercel 验证会失败——这没关系，我们只需要 Vercel 接受该 Host 头）
4. 如果验证失败，可以在香港服务器上临时添加一条验证路径，或跳过（Nginx 已设置正确的 Host 头）

---

## 常见问题

**Q: 上传图片（管理员功能）能正常工作吗？**
A: 可以。POST 请求通过反代原样转发到 Vercel，不影响。

**Q: Vercel 自动部署需要改什么？**
A: 不需要。`git push` 后 Vercel 自动构建部署，香港反代自动获取最新版本。

**Q: 静态资源缓存不更新怎么办？**
A: Next.js 静态资源文件名带 content hash（`/_next/static/xxx.abc123.js`），内容变化后文件名自动变化，不存在缓存不更新问题。`/models/` 目录的模型文件如更新可手动清除缓存：`rm -rf /var/cache/nginx/*`。

**Q: 如何测试香港服务器到国内的延迟？**
A: 在国内电脑 `ping your-domain.com`，观察延迟和丢包率。优质 CN2 线路延迟 <50ms，丢包率 0%。
