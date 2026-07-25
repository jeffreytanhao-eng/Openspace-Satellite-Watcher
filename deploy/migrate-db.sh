#!/bin/bash
# 数据库迁移脚本:处理 schema 不兼容的旧数据库
# 会 DROP 并重建数据库,然后重新 seed
# 数据会丢失,但会先备份
set -e
cd /app

DB_NAME="satellite-watcher"
DB_URL="postgresql://postgres:postgres@localhost:5432/${DB_NAME}?schema=public"

echo "============================================"
echo "  DATABASE MIGRATION"
echo "  (schema reset + seed)"
echo "============================================"

# 1. 停止应用释放 DB 连接
echo ">> [1/6] Stopping PM2 app to release DB connections..."
pm2 stop satellite 2>/dev/null || true

# 2. 备份旧数据库(以防万一,虽然旧 schema 可能不兼容)
echo ">> [2/6] Backing up old database..."
BACKUP_FILE="/tmp/${DB_NAME}-backup-$(date +%Y%m%d%H%M%S).sql"
if sudo -u postgres pg_dump "$DB_NAME" > "$BACKUP_FILE" 2>/dev/null; then
  BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "   Backup saved: $BACKUP_FILE ($BACKUP_SIZE)"
else
  echo "   (backup skipped - old schema may be incompatible, this is OK)"
fi

# 3. 终止活动连接(否则 DROP 会失败)
echo ">> [3/6] Terminating active connections..."
sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB_NAME' AND pid <> pg_backend_pid();" 2>/dev/null || true

# 4. 删除并重建数据库(完全清空,解决表名/字段名不兼容问题)
echo ">> [4/6] Dropping and recreating database '$DB_NAME'..."
sudo -u postgres psql -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" >/dev/null
sudo -u postgres psql -c "CREATE DATABASE \"$DB_NAME\";" >/dev/null
echo "   Database recreated (empty)"

# 5. 用 prisma 创建最新 schema
echo ">> [5/6] Creating schema from prisma/schema.prisma (prisma db push)..."
DATABASE_URL="$DB_URL" POSTGRES_URL_NON_POOLING="$DB_URL" npx prisma db push
echo "   Schema created"

# 6. 播种数据(13 颗缺省 + 8 个预导入星座)
echo ">> [6/6] Seeding database (13 defaults + 8 constellations)..."
echo "   This will call Celestrak API to pre-import constellations..."
if [ -x "node_modules/.bin/tsx" ]; then
  DATABASE_URL="$DB_URL" POSTGRES_URL_NON_POOLING="$DB_URL" node_modules/.bin/tsx prisma/seed.ts
else
  DATABASE_URL="$DB_URL" POSTGRES_URL_NON_POOLING="$DB_URL" npx tsx prisma/seed.ts
fi
echo "   Seed complete"

# 启动应用
# 必须 delete + start,不能 start || restart:
# 如果 PM2 已有旧进程,pm2 start 会报 "already exists" 被吞掉,
# fallback 到 pm2 restart 会用旧配置(可能缺少新增的环境变量),
# 导致应用启动失败。
echo ">> Starting PM2 app (delete + start to ensure fresh config)..."
pm2 delete satellite 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

# 验证
echo ">> Waiting for app to start..."
sleep 5
for i in 1 2 3 4 5; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/space-objects || echo "fail")
  if [ "$STATUS" = "200" ]; then
    break
  fi
  echo "   Attempt $i: HTTP $STATUS, retrying..."
  sleep 3
done

SATS=$(curl -s http://127.0.0.1:3000/api/space-objects | grep -o '"noradId"' | wc -l)
echo "   Total satellites in API response: $SATS"

echo ""
echo "============================================"
echo "  MIGRATION COMPLETE!"
echo "============================================"
echo "  Old backup: $BACKUP_FILE"
echo "  New schema: per prisma/schema.prisma"
echo "  Data: 13 defaults + pre-imported constellations"
pm2 status
