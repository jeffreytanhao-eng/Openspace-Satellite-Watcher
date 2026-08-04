#!/bin/sh
# ============================================================
# TREA 卫星观测平台 — HK 服务器一键部署脚本
# 用法:sh deploy/deploy.sh
# 前置:
#   1) DNS 已解析 wanzhixuexi.cn → 服务器 IP
#   2) 已安装 Docker + Docker Compose(v2)
#   3) 已 git clone 本仓库到服务器
# ============================================================
set -e

# 定位仓库根目录(脚本位于 deploy/ 下)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

cd "$REPO_ROOT"

# ---- 1. 生成 .env(若不存在) ----
if [ ! -f "$ENV_FILE" ]; then
    echo "==> 首次部署:从 .env.example 生成 .env"
    cp "$SCRIPT_DIR/.env.example" "$ENV_FILE"
    # 生成随机 hex DB 密码(无特殊字符,免 URL 编码)
    PG_PASS=$(openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
    sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$PG_PASS|" "$ENV_FILE"
    echo "    ✓ 已生成随机 POSTGRES_PASSWORD"
fi

# ---- 2. 检查必填项 ----
# shellcheck disable=SC1090
. "$ENV_FILE"
WARN=0
if [ -z "$ACME_EMAIL" ] || [ "$ACME_EMAIL" = "<填写你的邮箱>" ]; then
    echo "⚠️  ACME_EMAIL 未填写 → 编辑 $ENV_FILE 设置你的邮箱(Let's Encrypt 证书到期通知)"
    WARN=1
fi
if [ -z "$LLM_API_KEY" ] || [ "$LLM_API_KEY" = "<填写>" ]; then
    echo "⚠️  LLM_API_KEY 未填写 → AI 任务规划将返回 MISSING_CONFIG"
    echo "    编辑 $ENV_FILE,从本地 .env.local 复制 LLM_API_KEY 的值"
    WARN=1
fi
if [ "$WARN" = "1" ]; then
    echo "    (其余功能不受影响,可稍后填写并 docker compose restart app)"
fi

# ---- 3. 构建并启动 ----
echo "==> 构建并启动服务(postgres / migrate / app / caddy)..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" --env-file "$ENV_FILE" up -d --build

echo ""
echo "=========================================="
echo "  部署已启动"
echo "=========================================="
echo "首次启动 migrate 会从 Celestrak 拉取 8 个星座(~30-60s),完成后 app 自动启动。"
echo ""
echo "查看 migrate 进度:"
echo "  docker compose -f $SCRIPT_DIR/docker-compose.yml logs -f migrate"
echo ""
echo "查看 Caddy 证书申请(看到 'certificate obtained successfully' 即成功):"
echo "  docker compose -f $SCRIPT_DIR/docker-compose.yml logs -f caddy"
echo ""
echo "服务状态:"
echo "  docker compose -f $SCRIPT_DIR/docker-compose.yml ps"
echo ""
echo "访问: https://$DOMAIN  (证书申请可能需 1-2 分钟)"
