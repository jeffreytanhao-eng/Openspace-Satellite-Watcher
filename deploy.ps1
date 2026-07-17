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
$ENV_FILE = Join-Path $SCRIPT_DIR ".env.hk"
$ECOSYSTEM_FILE = Join-Path $SCRIPT_DIR "ecosystem.config.cjs"
$DB_SETUP_SCRIPT = Join-Path $SCRIPT_DIR "deploy\setup-local-db.sh"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Satellite Watcher - HK Server Deploy" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Check package
if (-not (Test-Path $PKG)) {
    Write-Host "[ERROR] Package not found. Run 'npm run build' first." -ForegroundColor Red
    exit 1
}
$pkgSize = [math]::Round((Get-Item $PKG).Length / 1MB, 2)
Write-Host "[1/6] Package ready: $pkgSize MB" -ForegroundColor Green

# Upload package
Write-Host "[2/6] Uploading package to $SERVER ..." -ForegroundColor Yellow
Write-Host "(Enter server password when prompted)" -ForegroundColor DarkGray
& scp -o StrictHostKeyChecking=no $PKG "${USER}@${SERVER}:/tmp/app-pkg.tar.gz"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Upload failed" -ForegroundColor Red
    exit 1
}
Write-Host "Upload done" -ForegroundColor Green

# Upload Nginx config
Write-Host "[3/6] Uploading Nginx secure config ..." -ForegroundColor Yellow
& scp -o StrictHostKeyChecking=no $NGINX_CONF "${USER}@${SERVER}:/tmp/nginx-secure.conf"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] Nginx config upload failed, skipping" -ForegroundColor Yellow
}

# Upload environment and PM2 config
Write-Host "[4/6] Uploading config files ..." -ForegroundColor Yellow
& scp -o StrictHostKeyChecking=no $ENV_FILE "${USER}@${SERVER}:/app/.env"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Environment file upload failed" -ForegroundColor Red
    exit 1
}
& scp -o StrictHostKeyChecking=no $ECOSYSTEM_FILE "${USER}@${SERVER}:/app/ecosystem.config.cjs"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] PM2 config upload failed" -ForegroundColor Red
    exit 1
}

# Upload DB setup script
Write-Host "[5/6] Uploading database setup script ..." -ForegroundColor Yellow
& scp -o StrictHostKeyChecking=no $DB_SETUP_SCRIPT "${USER}@${SERVER}:/tmp/setup-local-db.sh"

# Remote deploy commands (bash)
Write-Host "[6/6] Running remote deployment ..." -ForegroundColor Yellow

$remoteScript = @'
set -e

echo ">> Backup old version..."
cp -r /app /app.bak 2>/dev/null || true

echo ">> Extracting new version..."
cd /app && tar xzf /tmp/app-pkg.tar.gz

echo ">> Checking local PostgreSQL..."
if ! systemctl is-active --quiet postgresql 2>/dev/null; then
  echo ">> PostgreSQL not running, running setup script..."
  bash /tmp/setup-local-db.sh
else
  echo "  PostgreSQL is running"
  # Verify database exists and has data
  SATELLITE_COUNT=$(sudo -u postgres psql -d "satellite-watcher" -t -c "SELECT COUNT(*) FROM \"SpaceObject\";" 2>/dev/null | xargs || echo "0")
  if [ "$SATELLITE_COUNT" = "0" ]; then
    echo "  Database empty, running seed..."
    cd /app && DATABASE_URL="postgresql://postgres:postgres@localhost:5432/satellite-watcher?schema=public" npx prisma db push
    DATABASE_URL="postgresql://postgres:postgres@localhost:5432/satellite-watcher?schema=public" npx tsx prisma/seed.ts
  else
    echo "  Database has $SATELLITE_COUNT satellites"
  fi
fi

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

echo ">> Restarting PM2 with local database..."
pm2 delete satellite 2>/dev/null || true
cd /app && pm2 start ecosystem.config.cjs
pm2 save

echo ">> Waiting for service to start..."
sleep 5

echo ">> Checking PM2 status..."
pm2 status

echo ">> Health check..."
if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/space-objects | grep -q "^200$"; then
  echo "  API health: HTTP 200 OK"
  echo ">> Response time test..."
  time curl -s -o /dev/null http://127.0.0.1:3000/api/space-objects
else
  echo "  API health: FAILED - checking logs..."
  pm2 logs satellite --lines 20
fi

echo ">> Cleaning up..."
rm -f /tmp/app-pkg.tar.gz /tmp/nginx-secure.conf /tmp/setup-local-db.sh

echo "========================================="
echo "  DEPLOY COMPLETE!"
echo "========================================="
'@

$remoteScriptFile = Join-Path $env:TEMP "deploy-remote.sh"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($remoteScriptFile, $remoteScript, $utf8NoBom)

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
    Write-Host "[6/6] Deploy completed!" -ForegroundColor Green
}

Write-Host ""
Write-Host "Visit https://www.wanzhixuexi.cn to verify" -ForegroundColor Cyan
