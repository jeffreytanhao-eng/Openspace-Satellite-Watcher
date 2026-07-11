# ============================================================
# Deploy script for Satellite Watcher -> HK Server
# Run in PowerShell: powershell -ExecutionPolicy Bypass -File deploy.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$SERVER = "47.82.118.133"
$USER = "root"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PKG = Join-Path $SCRIPT_DIR "app-pkg.tar.gz"
$NGINX_CONF = Join-Path $SCRIPT_DIR "deploy\nginx-secure.conf"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Satellite Watcher - HK Server Deploy" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Check package
if (-not (Test-Path $PKG)) {
    Write-Host "[ERROR] Package not found. Run 'npx next build' first." -ForegroundColor Red
    exit 1
}
$pkgSize = [math]::Round((Get-Item $PKG).Length / 1MB, 2)
Write-Host "[1/5] Package ready: $pkgSize MB" -ForegroundColor Green

# Upload package
Write-Host "[2/5] Uploading package to $SERVER ..." -ForegroundColor Yellow
Write-Host "(Enter server password when prompted)" -ForegroundColor DarkGray
& scp -o StrictHostKeyChecking=no $PKG "${USER}@${SERVER}:/tmp/app-pkg.tar.gz"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Upload failed" -ForegroundColor Red
    exit 1
}
Write-Host "Upload done" -ForegroundColor Green

# Upload Nginx config
Write-Host "[3/5] Uploading Nginx secure config ..." -ForegroundColor Yellow
& scp -o StrictHostKeyChecking=no $NGINX_CONF "${USER}@${SERVER}:/tmp/nginx-secure.conf"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] Nginx config upload failed, skipping" -ForegroundColor Yellow
}

# Remote deploy commands (bash)
Write-Host "[4/5] Running remote deployment ..." -ForegroundColor Yellow

$remoteScript = @'
set -e
echo ">> Backup old version..."
cp -r /app /app.bak 2>/dev/null || true

echo ">> Extracting new version..."
cd /app && tar xzf /tmp/app-pkg.tar.gz

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

echo ">> Testing Nginx config..."
nginx -t && systemctl reload nginx || echo "  (Nginx reload failed, check config)"

echo ">> Restarting PM2..."
pm2 restart satellite || (cd /app && pm2 start ecosystem.config.cjs)
pm2 save

echo ">> Cleaning up..."
rm -f /tmp/app-pkg.tar.gz /tmp/nginx-secure.conf

echo ">> Health check..."
sleep 3
curl -s -o /dev/null -w "  API health: HTTP %{http_code}\n" http://127.0.0.1:3000/api/space-objects

echo "========================================="
echo "  DEPLOY COMPLETE!"
echo "========================================="
pm2 status
'@

# Write remote script to temp file to avoid escaping issues
$remoteScriptFile = Join-Path $env:TEMP "deploy-remote.sh"
[System.IO.File]::WriteAllText($remoteScriptFile, $remoteScript, [System.Text.Encoding]::UTF8)

# Upload remote script and execute
& scp -o StrictHostKeyChecking=no $remoteScriptFile "${USER}@${SERVER}:/tmp/deploy.sh"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to upload deploy script" -ForegroundColor Red
    exit 1
}
& ssh -o StrictHostKeyChecking=no "${USER}@${SERVER}" "bash /tmp/deploy.sh; rm -f /tmp/deploy.sh"
Remove-Item $remoteScriptFile -ErrorAction SilentlyContinue

if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] Remote deploy had errors, check logs above" -ForegroundColor Yellow
} else {
    Write-Host "[5/5] Deploy completed!" -ForegroundColor Green
}

# Verify
Write-Host ""
Write-Host "Verifying live site ..." -ForegroundColor Yellow
try {
    $resp = Invoke-WebRequest -Uri "https://www.wanzhixuexi.cn/api/space-objects" -UseBasicParsing -TimeoutSec 15
    Write-Host "Live API status: $($resp.StatusCode) OK" -ForegroundColor Green
} catch {
    Write-Host "Live verification failed (PM2 may still be starting): $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Visit https://www.wanzhixuexi.cn to verify" -ForegroundColor Cyan
