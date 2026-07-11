# ============================================================
# FIX deploy script - full clean deploy + DB reset
# Run in PowerShell: powershell -ExecutionPolicy Bypass -File deploy-fix.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$SERVER = "47.82.118.133"
$USER = "root"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PKG = Join-Path $SCRIPT_DIR "app-pkg.tar.gz"
$NGINX_CONF = Join-Path $SCRIPT_DIR "deploy\nginx-secure.conf"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Satellite Watcher - FULL FIX Deploy" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Check package
if (-not (Test-Path $PKG)) {
    Write-Host "[ERROR] Package not found: $PKG" -ForegroundColor Red
    Write-Host "Run build first: npx next build, then package" -ForegroundColor Yellow
    exit 1
}
$pkgSize = [math]::Round((Get-Item $PKG).Length / 1MB, 2)
$pkgTime = (Get-Item $PKG).LastWriteTime
Write-Host "[1/6] Package: $pkgSize MB ($pkgTime)" -ForegroundColor Green

# Upload package
Write-Host "[2/6] Uploading package to $SERVER ..." -ForegroundColor Yellow
& scp -o StrictHostKeyChecking=no $PKG "${USER}@${SERVER}:/tmp/app-pkg.tar.gz"
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] Upload failed" -ForegroundColor Red; exit 1 }

# Upload Nginx config
Write-Host "[3/6] Uploading Nginx config ..." -ForegroundColor Yellow
& scp -o StrictHostKeyChecking=no $NGINX_CONF "${USER}@${SERVER}:/tmp/nginx-secure.conf"

# Remote script - FULL CLEAN DEPLOY
$remoteScript = @'
set -e
echo "============================================"
echo "  FULL CLEAN DEPLOY"
echo "============================================"

echo ">> Stopping PM2..."
pm2 stop satellite 2>/dev/null || true

echo ">> Backing up old app..."
rm -rf /app.bak
cp -r /app /app.bak 2>/dev/null || true

echo ">> Cleaning old app files..."
rm -rf /app/.next
rm -rf /app/public
mkdir -p /app/.next/static

echo ">> Extracting new package..."
cd /app && tar xzf /tmp/app-pkg.tar.gz
echo "   Extracted files:"
ls -la /app/server.js

echo ">> Updating Nginx site config..."
cp /tmp/nginx-secure.conf /etc/nginx/sites-available/satellite-watcher 2>/dev/null || true

# Add rate limit zones if not present
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

echo ">> Starting PM2..."
cd /app
pm2 delete satellite 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo ">> Waiting for app to start..."
sleep 5

echo ">> Health check..."
for i in 1 2 3 4 5; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/space-objects || echo "fail")
  if [ "$STATUS" = "200" ]; then
    echo "   App is UP (HTTP 200)"
    break
  fi
  echo "   Attempt $i: HTTP $STATUS, retrying..."
  sleep 3
done

echo ">> Resetting database to default 12 satellites (clearing test data)..."
ADMIN_PWD=$(grep ADMIN_PASSWORD /app/ecosystem.config.cjs | head -1 | sed "s/.*ADMIN_PASSWORD: '\(.*\)'.*/\1/" | tr -d "', ")
echo "   Calling seed API with reset=true..."
curl -s -X POST http://127.0.0.1:3000/api/admin/seed \
  -H "Content-Type: application/json" \
  -H "x-admin-password: $ADMIN_PWD" \
  -d '{"reset":true}'
echo ""

echo ">> Verifying satellite count..."
SATS=$(curl -s http://127.0.0.1:3000/api/space-objects | grep -o '"noradId"' | wc -l)
echo "   Total satellites in DB: $SATS"

echo ">> Cleaning up temp files..."
rm -f /tmp/app-pkg.tar.gz /tmp/nginx-secure.conf

echo ""
echo "============================================"
echo "  DEPLOY COMPLETE!"
echo "============================================"
pm2 status
'@

$remoteScriptFile = Join-Path $env:TEMP "deploy-fix.sh"
[System.IO.File]::WriteAllText($remoteScriptFile, $remoteScript, [System.Text.Encoding]::UTF8)

Write-Host "[4/6] Uploading deploy script ..." -ForegroundColor Yellow
& scp -o StrictHostKeyChecking=no $remoteScriptFile "${USER}@${SERVER}:/tmp/deploy-fix.sh"
Remove-Item $remoteScriptFile -ErrorAction SilentlyContinue

Write-Host "[5/6] Running full deploy (this will take ~30s) ..." -ForegroundColor Yellow
& ssh -o StrictHostKeyChecking=no "${USER}@${SERVER}" "bash /tmp/deploy-fix.sh"

if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] Deploy had issues, check logs above" -ForegroundColor Yellow
} else {
    Write-Host "[6/6] Deploy completed!" -ForegroundColor Green
}

Write-Host ""
Write-Host "Verifying live site ..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
try {
    $resp = Invoke-WebRequest -Uri "https://www.wanzhixuexi.cn/api/space-objects" -UseBasicParsing -TimeoutSec 15
    $json = $resp.Content | ConvertFrom-Json
    Write-Host "Live API: HTTP $($resp.StatusCode), satellites: $($json.data.Count)" -ForegroundColor Green
    $json.data | Format-Table noradId, name -AutoSize | Out-Host
} catch {
    Write-Host "Verification failed: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "IMPORTANT: Please CLEAR BROWSER CACHE (Ctrl+Shift+R) when testing!" -ForegroundColor Red
Write-Host "Visit https://www.wanzhixuexi.cn" -ForegroundColor Cyan
