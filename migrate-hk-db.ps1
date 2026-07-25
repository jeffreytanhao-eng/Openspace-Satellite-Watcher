# ============================================================
# Migrate HK database: schema reset + seed
# Run AFTER deploy-hk.ps1 when DB schema is outdated
# WARNING: This will DROP and recreate the database (data loss)
#          Old data is backed up to /tmp/satellite-watcher-backup-*.sql
# ============================================================
$ErrorActionPreference = "Stop"
$SERVER = "47.82.118.133"
$USER = "root"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$MIGRATE_SH = Join-Path $SCRIPT_DIR "deploy\migrate-db.sh"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Migrate HK Database" -ForegroundColor Cyan
Write-Host "  (schema reset + seed)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "WARNING: This will DROP the existing database!" -ForegroundColor Red
Write-Host "         Old data will be backed up to /tmp/ on the server." -ForegroundColor Yellow
Write-Host "         Make sure deploy-hk.ps1 was run first (new code + prisma schema)." -ForegroundColor Yellow
Write-Host ""

if (-not (Test-Path $MIGRATE_SH)) {
    Write-Host "[ERROR] migrate-db.sh not found: $MIGRATE_SH" -ForegroundColor Red
    exit 1
}

# Upload migrate script
Write-Host "[1/2] Uploading migrate-db.sh to $SERVER ..." -ForegroundColor Yellow
& scp -o StrictHostKeyChecking=no $MIGRATE_SH "${USER}@${SERVER}:/tmp/migrate-db.sh"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Upload failed" -ForegroundColor Red
    exit 1
}
Write-Host "Upload done" -ForegroundColor Green

# Run migration
Write-Host "[2/2] Running migration (DROP + CREATE + prisma db push + seed)..." -ForegroundColor Yellow
Write-Host "(Enter server password when prompted)" -ForegroundColor DarkGray
& ssh -o StrictHostKeyChecking=no "${USER}@${SERVER}" "bash /tmp/migrate-db.sh; rm -f /tmp/migrate-db.sh"

if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] Migration had issues, check logs above" -ForegroundColor Yellow
} else {
    Write-Host "Migration completed!" -ForegroundColor Green
}

# Verify live site
Write-Host ""
Write-Host "Verifying live site..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
try {
    $resp = Invoke-WebRequest -Uri "https://www.wanzhixuexi.cn/api/space-objects" -UseBasicParsing -TimeoutSec 15
    $json = $resp.Content | ConvertFrom-Json
    $count = if ($json.data) { $json.data.Count } else { 0 }
    Write-Host "Live API: HTTP $($resp.StatusCode), satellites: $count" -ForegroundColor Green
} catch {
    Write-Host "Verify failed: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Visit https://www.wanzhixuexi.cn (Ctrl+Shift+R hard refresh)" -ForegroundColor Cyan
