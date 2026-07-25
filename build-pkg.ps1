# ============================================================
# Build production package (app-pkg.tar.gz) for HK server deploy
# Run in PowerShell: powershell -ExecutionPolicy Bypass -File build-pkg.ps1
# ============================================================
$ErrorActionPreference = "Stop"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$STANDALONE = Join-Path $SCRIPT_DIR ".next\standalone"
$PKG_DIR = Join-Path $SCRIPT_DIR "app-pkg"
$PKG = Join-Path $SCRIPT_DIR "app-pkg.tar.gz"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Build Production Package" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Step 1: Build (skip if already built and standalone exists)
if (Test-Path $STANDALONE) {
    Write-Host "[1/4] Standalone already built, skipping npm run build" -ForegroundColor Green
} else {
    Write-Host "[1/4] Running npm run build (next build standalone)..." -ForegroundColor Yellow
    # Temporarily relax ErrorActionPreference: next build writes progress to stderr
    # which PowerShell treats as error records and would abort the script under "Stop".
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & npm run build
    $buildExit = $LASTEXITCODE
    $ErrorActionPreference = $prevEAP
    if ($buildExit -ne 0) {
        Write-Host "[ERROR] Build failed (exit $buildExit)" -ForegroundColor Red
        exit 1
    }
    if (-not (Test-Path $STANDALONE)) {
        Write-Host "[ERROR] .next/standalone not found. Check next.config.mjs output: 'standalone'" -ForegroundColor Red
        exit 1
    }
    Write-Host "Build OK" -ForegroundColor Green
}

# Step 2: Prepare package directory
Write-Host "[2/4] Preparing package directory..." -ForegroundColor Yellow
if (Test-Path $PKG_DIR) { Remove-Item $PKG_DIR -Recurse -Force }
New-Item -ItemType Directory -Path $PKG_DIR -Force | Out-Null
New-Item -ItemType Directory -Path "$PKG_DIR\.next" -Force | Out-Null
New-Item -ItemType Directory -Path "$PKG_DIR\deploy" -Force | Out-Null

# Copy standalone output (server.js + node_modules + package.json)
Write-Host "  Copying standalone output..." -ForegroundColor DarkGray
Copy-Item "$STANDALONE\*" $PKG_DIR -Recurse -Force

# Copy static assets (not included in standalone by default)
if (Test-Path "$SCRIPT_DIR\.next\static") {
    Write-Host "  Copying .next/static..." -ForegroundColor DarkGray
    Copy-Item "$SCRIPT_DIR\.next\static" "$PKG_DIR\.next\static" -Recurse -Force
}

# Copy public assets
if (Test-Path "$SCRIPT_DIR\public") {
    Write-Host "  Copying public/..." -ForegroundColor DarkGray
    Copy-Item "$SCRIPT_DIR\public" $PKG_DIR -Recurse -Force
}

# Copy prisma schema + seed
if (Test-Path "$SCRIPT_DIR\prisma") {
    Write-Host "  Copying prisma/..." -ForegroundColor DarkGray
    Copy-Item "$SCRIPT_DIR\prisma" $PKG_DIR -Recurse -Force
}

# Copy PM2 config
Copy-Item "$SCRIPT_DIR\ecosystem.config.cjs" $PKG_DIR -Force

# Copy DB seed script (used by deploy.sh)
$seedScript = Join-Path $SCRIPT_DIR "deploy\seed-db.sh"
if (Test-Path $seedScript) {
    Copy-Item $seedScript "$PKG_DIR\deploy\seed-db.sh" -Force
}

# Step 3: Create tar.gz
Write-Host "[3/4] Creating app-pkg.tar.gz..." -ForegroundColor Yellow
# Use tar from git or system (Windows 10+ has bsdtar)
if (Test-Path $PKG) { Remove-Item $PKG -Force }
& tar -czf $PKG -C $PKG_DIR .
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] tar failed" -ForegroundColor Red
    exit 1
}

$pkgSize = [math]::Round((Get-Item $PKG).Length / 1MB, 2)
Write-Host "Package created: $pkgSize MB" -ForegroundColor Green

# Step 4: Cleanup
Write-Host "[4/4] Cleaning up temp directory..." -ForegroundColor Yellow
Remove-Item $PKG_DIR -Recurse -Force

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  BUILD COMPLETE!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "Package: $PKG ($pkgSize MB)" -ForegroundColor Cyan
Write-Host "Next: run deploy-hk.ps1 to deploy to HK server" -ForegroundColor Cyan
