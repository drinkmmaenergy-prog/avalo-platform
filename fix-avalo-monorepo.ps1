#!/usr/bin/env pwsh

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AVALO MONOREPO COMPLETE REPAIR" -ForegroundColor Cyan
Write-Host "  Expo SDK 54 + React 18.3.1 + RN 0.76" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Continue"

function Remove-DirectoryIfExists {
    param([string]$Path)
    if (Test-Path $Path) {
        Write-Host "Removing: $Path" -ForegroundColor Yellow
        Remove-Item -Path $Path -Recurse -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
    }
}

function Remove-FileIfExists {
    param([string]$Path)
    if (Test-Path $Path) {
        Write-Host "Removing: $Path" -ForegroundColor Yellow
        Remove-Item -Path $Path -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "Step 1: Cleaning node_modules in all workspaces..." -ForegroundColor Green
Remove-DirectoryIfExists ".\node_modules"
Remove-DirectoryIfExists ".\app-mobile\node_modules"
Remove-DirectoryIfExists ".\app-web\node_modules"
Remove-DirectoryIfExists ".\shared\node_modules"
Remove-DirectoryIfExists ".\sdk\node_modules"
Remove-DirectoryIfExists ".\functions\node_modules"

Write-Host ""
Write-Host "Step 2: Cleaning Expo cache and build artifacts..." -ForegroundColor Green
Remove-DirectoryIfExists ".\app-mobile\.expo"
Remove-DirectoryIfExists ".\app-mobile\.expo-shared"
Remove-DirectoryIfExists ".\app-mobile\.cache"
Remove-DirectoryIfExists ".\app-mobile\android"
Remove-DirectoryIfExists ".\app-mobile\ios"
Remove-DirectoryIfExists ".\app-mobile\.next"

Write-Host ""
Write-Host "Step 3: Cleaning build outputs..." -ForegroundColor Green
Remove-DirectoryIfExists ".\shared\dist"
Remove-DirectoryIfExists ".\sdk\dist"
Remove-DirectoryIfExists ".\functions\lib"
Remove-DirectoryIfExists ".\app-web\.next"

Write-Host ""
Write-Host "Step 4: Removing lock files..." -ForegroundColor Green
Remove-FileIfExists ".\pnpm-lock.yaml"
Remove-FileIfExists ".\package-lock.json"
Remove-FileIfExists ".\yarn.lock"

Write-Host ""
Write-Host "Step 5: Clearing pnpm store..." -ForegroundColor Green
pnpm store prune

Write-Host ""
Write-Host "Step 6: Installing root dependencies..." -ForegroundColor Green
pnpm install --no-frozen-lockfile

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Root installation failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 7: Installing app-mobile dependencies..." -ForegroundColor Green
pnpm -F app-mobile install --no-frozen-lockfile

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: app-mobile installation failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 8: Building shared packages..." -ForegroundColor Green
pnpm --filter @avalo/shared build
pnpm --filter @avalo/sdk build

Write-Host ""
Write-Host "Step 9: Running Expo prebuild..." -ForegroundColor Green
Set-Location app-mobile
npx expo prebuild --clean

if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: Expo prebuild encountered issues" -ForegroundColor Yellow
}

Set-Location ..

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  REPAIR COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. cd app-mobile" -ForegroundColor White
Write-Host "2. npx expo start --clear" -ForegroundColor White
Write-Host ""
Write-Host "Or run development server directly:" -ForegroundColor Yellow
Write-Host "   pnpm mobile" -ForegroundColor White
Write-Host ""
