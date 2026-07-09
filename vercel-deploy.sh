#!/bin/bash

set -e

echo "=========================================="
echo "  Satellite Watcher - Vercel 部署脚本"
echo "=========================================="

echo ""
echo "[1/4] 检查环境..."

if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI 未安装，正在安装..."
    npm install -g vercel
else
    echo "✅ Vercel CLI 已安装"
fi

echo ""
echo "[2/4] 构建项目..."

npm run build

if [ $? -ne 0 ]; then
    echo "❌ 构建失败，请检查错误信息"
    exit 1
fi

echo "✅ 构建成功"

echo ""
echo "[3/4] 部署到 Vercel..."

vercel deploy --prod

if [ $? -ne 0 ]; then
    echo "❌ 部署失败，请检查错误信息"
    exit 1
fi

echo ""
echo "[4/4] 部署完成！"
echo "=========================================="
echo "  部署成功！项目已上线"
echo "=========================================="