#!/bin/bash
# HK <-> Neon 数据库每2小时自动同步
# crontab 配置: 0 */2 * * * /app/scripts/sync-cron.sh >> /var/log/sync-cron.log 2>&1

cd /app || exit 1

# 从 .env 读取 ADMIN_PASSWORD
ADMIN_PW=$(grep '^ADMIN_PASSWORD=' .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")

if [ -z "$ADMIN_PW" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] ADMIN_PASSWORD not found in .env"
  exit 1
fi

RESPONSE=$(curl -s -X POST -H "x-admin-password: $ADMIN_PW" http://127.0.0.1:3000/api/sync 2>&1)
echo "$(date '+%Y-%m-%d %H:%M:%S') $RESPONSE"
