#!/bin/bash
set -e
cd /app
echo ">> Seeding database via prisma/seed.ts (single source of truth)..."

# 直接运行 prisma/seed.ts（tsx 已在 dependencies 中，生产环境可用）
# seed.ts 会：
#   1. 导入 13 颗缺省卫星（含补图）+ 3 个中文标签
#   2. 预入库 8 个星座（Starlink/GPS/GLONASS/Galileo/北斗/风云/SBIRS/SKYNET）
#      skipIfExists=true 保证幂等，已入库星座会跳过
node_modules/.bin/tsx prisma/seed.ts

echo ""
echo ">> Done!"
