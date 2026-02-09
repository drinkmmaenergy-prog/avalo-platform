#!/usr/bin/env pwsh
<#
.SYNOPSIS
  OPS_BOOT.ps1 — Avalo Monorepo Boot Script
  Clears env, installs deps, builds web + functions, starts emulators.

.DESCRIPTION
  Brings the Avalo monorepo to a stable BOOT_OK state:
    1. Clears NODE_ENV to avoid production-mode install issues
    2. Installs workspace dependencies via pnpm
    3. Builds functions (TypeScript → lib/)
    4. Builds app-web (Next.js production build)
    5. Starts Firebase emulators (functions, firestore, auth)
    6. Prints emulator URLs

.NOTES
  Run from the avalo/ repo root:
    pwsh -File OPS_BOOT.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ============================================================================
# STEP 0: Environment Safety
# ============================================================================
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  AVALO OPS_BOOT — Repo Boot Sequence" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Clear NODE_ENV to prevent pnpm from skipping devDependencies
if ($env:NODE_ENV) {
    Write-Host "[ENV] Clearing NODE_ENV (was: $env:NODE_ENV)" -ForegroundColor Yellow
    Remove-Item Env:\NODE_ENV -ErrorAction SilentlyContinue
} else {
    Write-Host "[ENV] NODE_ENV is not set (OK)" -ForegroundColor Green
}

# ============================================================================
# STEP 1: Install Dependencies
# ============================================================================
Write-Host "`n[1/4] Installing workspace dependencies..." -ForegroundColor Cyan
pnpm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] pnpm install failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Dependencies installed" -ForegroundColor Green

# ============================================================================
# STEP 2: Build Functions
# ============================================================================
Write-Host "`n[2/4] Building functions (TypeScript)..." -ForegroundColor Cyan
Push-Location functions
pnpm run build
$funcExit = $LASTEXITCODE
Pop-Location
if ($funcExit -ne 0) {
    Write-Host "[FAIL] Functions build failed with exit code $funcExit" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Functions build passed" -ForegroundColor Green

# ============================================================================
# STEP 3: Build App-Web
# ============================================================================
Write-Host "`n[3/4] Building app-web (Next.js)..." -ForegroundColor Cyan
Push-Location app-web
pnpm run build
$webExit = $LASTEXITCODE
Pop-Location
if ($webExit -ne 0) {
    Write-Host "[FAIL] app-web build failed with exit code $webExit" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] app-web build passed" -ForegroundColor Green

# ============================================================================
# STEP 4: Start Firebase Emulators
# ============================================================================
Write-Host "`n[4/4] Starting Firebase Emulators..." -ForegroundColor Cyan
Write-Host ""
Write-Host "  Emulator UI:    http://127.0.0.1:4000" -ForegroundColor White
Write-Host "  Functions:      http://127.0.0.1:5001" -ForegroundColor White
Write-Host "  Firestore:      http://127.0.0.1:8080" -ForegroundColor White
Write-Host "  Auth:           http://127.0.0.1:9099" -ForegroundColor White
Write-Host ""
Write-Host "  Smoke test URL: http://127.0.0.1:5001/avalostaging/europe-west1/healthCheckEndpoints-health" -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  BOOT_OK — Press Ctrl+C to stop" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

npx firebase emulators:start --only functions,firestore,auth --project avalostaging
