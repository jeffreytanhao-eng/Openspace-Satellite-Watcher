# Reset database to 12 default satellites (deletes all test data like BeiDou)
$ErrorActionPreference = "Stop"
$SERVER = "47.82.118.133"
$USER = "root"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$REMOTE_SCRIPT = Join-Path $SCRIPT_DIR "deploy\reset-db.sh"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Database Reset - restore 12 default sats" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/2] Uploading reset script..." -ForegroundColor Yellow
& scp -o StrictHostKeyChecking=no $REMOTE_SCRIPT "${USER}@${SERVER}:/tmp/reset-db.sh"
if ($LASTEXITCODE -ne 0) { Write-Host "Upload failed" -ForegroundColor Red; exit 1 }

Write-Host "[2/2] Running reset on server..." -ForegroundColor Yellow
& ssh -o StrictHostKeyChecking=no "${USER}@${SERVER}" "bash /tmp/reset-db.sh"

if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "Done! Verify at https://www.wanzhixuexi.cn/api/space-objects" -ForegroundColor Green
} else {
  Write-Host "Reset failed, check errors above" -ForegroundColor Red
}
