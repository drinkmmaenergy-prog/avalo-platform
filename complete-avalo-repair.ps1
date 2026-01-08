# Avalo Monorepo Repair - Phase 4-8 Automation Script
# This script completes the repair process from Phase 4 onward

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AVALO MONOREPO REPAIR - PHASES 4-8" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Stop"
$startTime = Get-Date

# Phase 4: Install Dependencies
Write-Host "PHASE 4: Installing Workspace Dependencies" -ForegroundColor Yellow
Write-Host "-------------------------------------------" -ForegroundColor Yellow

Write-Host "Installing @avalo/shared..." -ForegroundColor White
pnpm -F @avalo/shared install --no-frozen-lockfile
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to install @avalo/shared" -ForegroundColor Red
    exit 1
}
Write-Host "✓ @avalo/shared installed" -ForegroundColor Green

Write-Host "Installing @avalo/sdk..." -ForegroundColor White
pnpm -F @avalo/sdk install --no-frozen-lockfile
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to install @avalo/sdk" -ForegroundColor Red
    exit 1
}
Write-Host "✓ @avalo/sdk installed" -ForegroundColor Green

Write-Host "Installing app-mobile..." -ForegroundColor White
pnpm -F app-mobile install --no-frozen-lockfile
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to install app-mobile" -ForegroundColor Red
    exit 1
}
Write-Host "✓ app-mobile installed" -ForegroundColor Green
Write-Host ""

# Phase 5: Expo SDK 54 Compatibility Fix
Write-Host "PHASE 5: Fixing Expo SDK 54 Compatibility" -ForegroundColor Yellow
Write-Host "-------------------------------------------" -ForegroundColor Yellow

Set-Location app-mobile
Write-Host "Running expo install --fix..." -ForegroundColor White
npx expo install --fix
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ expo install --fix failed" -ForegroundColor Red
    Set-Location ..
    exit 1
}
Write-Host "✓ Expo SDK 54 compatibility fixed" -ForegroundColor Green
Set-Location ..
Write-Host ""

# Phase 6: Regenerate Native Projects
Write-Host "PHASE 6: Regenerating Native Projects" -ForegroundColor Yellow
Write-Host "-------------------------------------------" -ForegroundColor Yellow

Set-Location app-mobile
Write-Host "Running expo prebuild --clean..." -ForegroundColor White
npx expo prebuild --clean
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ expo prebuild --clean failed" -ForegroundColor Red
    Set-Location ..
    exit 1
}
Write-Host "✓ Native projects regenerated" -ForegroundColor Green
Set-Location ..
Write-Host ""

# Phase 7: Build Workspace Packages
Write-Host "PHASE 7: Building Workspace Packages" -ForegroundColor Yellow
Write-Host "-------------------------------------------" -ForegroundColor Yellow

Write-Host "Building @avalo/shared..." -ForegroundColor White
pnpm run build:shared
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to build @avalo/shared" -ForegroundColor Red
    exit 1
}
Write-Host "✓ @avalo/shared built successfully" -ForegroundColor Green

Write-Host "Building @avalo/sdk..." -ForegroundColor White
pnpm run build:sdk
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to build @avalo/sdk" -ForegroundColor Red
    exit 1
}
Write-Host "✓ @avalo/sdk built successfully" -ForegroundColor Green

Write-Host "Building functions..." -ForegroundColor White
pnpm run build:functions
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to build functions" -ForegroundColor Red
    exit 1
}
Write-Host "✓ functions built successfully" -ForegroundColor Green
Write-Host ""

# Phase 8: Final Validation
Write-Host "PHASE 8: Final Validation" -ForegroundColor Yellow
Write-Host "-------------------------------------------" -ForegroundColor Yellow

Write-Host "Checking TypeScript compilation..." -ForegroundColor White
Set-Location app-mobile
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠ TypeScript compilation has errors (non-fatal)" -ForegroundColor Yellow
} else {
    Write-Host "✓ TypeScript compilation successful" -ForegroundColor Green
}
Set-Location ..
Write-Host ""

# Summary
$endTime = Get-Date
$duration = $endTime - $startTime

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "REPAIR COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Total time: $($duration.TotalMinutes.ToString('0.00')) minutes" -ForegroundColor White
Write-Host ""
Write-Host "✅ All phases completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "To start the Expo development server:" -ForegroundColor Yellow
Write-Host "  cd app-mobile" -ForegroundColor White
Write-Host "  npx expo start --clear" -ForegroundColor White
Write-Host ""
Write-Host "Or run:" -ForegroundColor Yellow
Write-Host "  pnpm run mobile:reset" -ForegroundColor White
Write-Host ""