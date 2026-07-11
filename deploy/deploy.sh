#!/bin/bash
set -e
echo "============================================"
echo "  DEPLOY NEW CODE"
echo "============================================"

echo ">> Stopping PM2..."
pm2 stop satellite 2>/dev/null || true

echo ">> Cleaning old build..."
rm -rf /app/.next
rm -rf /app/public
mkdir -p /app/.next/static

echo ">> Extracting new package..."
cd /app && tar xzf /tmp/app-pkg.tar.gz
ls -la /app/server.js

echo ">> Updating Nginx config..."
cp /tmp/nginx-secure.conf /etc/nginx/sites-available/satellite-watcher 2>/dev/null || true

if ! grep -q "limit_req_zone" /etc/nginx/nginx.conf 2>/dev/null; then
  echo ">> Adding Nginx rate limit zones..."
  cat > /tmp/nginx-limits.conf << 'NGINXEOF'
limit_req_zone  $binary_remote_addr zone=static:10m rate=30r/s;
limit_req_zone  $binary_remote_addr zone=api_read:10m rate=10r/s;
limit_req_zone  $binary_remote_addr zone=api_import:10m rate=2r/s;
limit_req_zone  $binary_remote_addr zone=api_sensitive:10m rate=5r/m;
limit_conn_zone $binary_remote_addr zone=conn_per_ip:10m;
limit_conn_zone $server_name zone=conn_total:10m;
NGINXEOF
  sed -i '/^http {/r /tmp/nginx-limits.conf' /etc/nginx/nginx.conf
  if ! grep -q "server_tokens off" /etc/nginx/nginx.conf; then
    sed -i '/^http {/a\    server_tokens off;' /etc/nginx/nginx.conf
  fi
  rm -f /tmp/nginx-limits.conf
fi

echo ">> Testing Nginx..."
nginx -t && systemctl reload nginx

echo ">> Restarting PM2..."
cd /app
pm2 delete satellite 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo ">> Waiting for app to start..."
sleep 5

for i in 1 2 3 4 5; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/space-objects || echo "fail")
  if [ "$STATUS" = "200" ]; then
    echo "   App is UP (HTTP 200)"
    break
  fi
  echo "   Attempt $i: HTTP $STATUS, retrying..."
  sleep 3
done

SATS=$(curl -s http://127.0.0.1:3000/api/space-objects | grep -o '"noradId"' | wc -l)
echo "   Total satellites in DB: $SATS"

rm -f /tmp/app-pkg.tar.gz /tmp/nginx-secure.conf
echo ""
echo "============================================"
echo "  DEPLOY COMPLETE!"
echo "============================================"
pm2 status
