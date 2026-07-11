# Deploy new code to HK server
$ErrorActionPreference = "Stop"
$SERVER = "47.82.118.133"
$USER = "root"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PKG = Join-Path $SCRIPT_DIR "app-pkg.tar.gz"
$NGINX_CONF = Join-Path $SCRIPT_DIR "deploy\nginx-secure.conf"
$DEPLOY_SH = Join-Path $SCRIPT_DIR "deploy\deploy.sh"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Deploy to HK Server" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

if (-not (Test-Path $PKG)) { Write-Host "Package not found" -ForegroundColor Red; exit 1 }
Write-Host "[1/3] Uploading package..." -ForegroundColor Yellow
& scp -o StrictHostKeyChecking=no $PKG "${USER}@${SERVER}:/tmp/app-pkg.tar.gz"
& scp -o StrictHostKeyChecking=no $NGINX_CONF "${USER}@${SERVER}:/tmp/nginx-secure.conf"
& scp -o StrictHostKeyChecking=no $DEPLOY_SH "${USER}@${SERVER}:/tmp/deploy.sh"
if ($LASTEXITCODE -ne 0) { Write-Host "Upload failed" -ForegroundColor Red; exit 1 }

Write-Host "[2/3] Running deploy..." -ForegroundColor Yellow
& ssh -o StrictHostKeyChecking=no "${USER}@${SERVER}" "bash /tmp/deploy.sh"

Write-Host "[3/3] Verifying..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
try {
  $resp = Invoke-WebRequest -Uri "https://www.wanzhixuexi.cn/api/space-objects" -UseBasicParsing -TimeoutSec 15
  $json = $resp.Content | ConvertFrom-Json
  Write-Host "Live: HTTP $($resp.StatusCode), satellites: $($json.data.Count)" -ForegroundColor Green
} catch {
  Write-Host "Verify failed: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "IMPORTANT: Press Ctrl+Shift+R to hard-refresh browser!" -ForegroundColor Red
Write-Host "https://www.wanzhixuexi.cn" -ForegroundColor Cyan
