# AVALO Development Environment Setup Script - Windows
# This script sets up and starts the development environment for AVALO monorepo

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "AVALO Development Environment Setup" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check Node version
Write-Host "[1/6] Checking Node.js version..." -ForegroundColor Yellow
$nodeVersion = node --version
Write-Host "Node version: $nodeVersion" -ForegroundColor Green

if ($nodeVersion -notmatch "v20\.") {
    Write-Host "WARNING: Node 20.x is recommended. Current version: $nodeVersion" -ForegroundColor Red
    $continue = Read-Host "Continue anyway? (y/n)"
    if ($continue -ne "y") {
        exit 1
    }
}

# Step 2: Install dependencies
Write-Host ""
Write-Host "[2/6] Installing dependencies with pnpm..." -ForegroundColor Yellow
pnpm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: pnpm install failed" -ForegroundColor Red
    exit 1
}

# Step 3: Build shared package
Write-Host ""
Write-Host "[3/6] Building @avalo/shared package..." -ForegroundColor Yellow
pnpm --filter @avalo/shared build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: shared build failed" -ForegroundColor Red
    exit 1
}

# Step 4: Build SDK package
Write-Host ""
Write-Host "[4/6] Building @avalo/sdk package..." -ForegroundColor Yellow
pnpm --filter @avalo/sdk build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: SDK build failed" -ForegroundColor Red
    exit 1
}

# Step 5: Ask which platform to start
Write-Host ""
Write-Host "[5/6] Select development target:" -ForegroundColor Yellow
Write-Host "  1) Mobile (Expo)" -ForegroundColor White
Write-Host "  2) Web (Next.js)" -ForegroundColor White
Write-Host "  3) Both (separate terminals)" -ForegroundColor White
Write-Host "  4) Backend only (Firebase Emulators)" -ForegroundColor White

$choice = Read-Host "Enter choice (1-4)"

Write-Host ""
Write-Host "[6/6] Starting development servers..." -ForegroundColor Yellow

switch ($choice) {
    "1" {
        Write-Host "Starting Expo development server..." -ForegroundColor Green
        Set-Location app-mobile
        $env:EXPO_NO_DOCTOR = "1"
        pnpm start --reset-cache
    }
    "2" {
        Write-Host "Starting Next.js development server..." -ForegroundColor Green
        Set-Location app-web
        pnpm dev
    }
    "3" {
        Write-Host "Starting both servers in separate terminals..." -ForegroundColor Green
        Write-Host "Opening Mobile terminal..." -ForegroundColor Cyan
        Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd app-mobile; `$env:EXPO_NO_DOCTOR='1'; pnpm start --reset-cache"
        
        Write-Host "Opening Web terminal..." -ForegroundColor Cyan
        Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd app-web; pnpm dev"
        
        Write-Host ""
        Write-Host "Both servers started in separate terminals!" -ForegroundColor Green
    }
    "4" {
        Write-Host "Starting Firebase Emulators..." -ForegroundColor Green
        pnpm dev:backend
    }
    default {
        Write-Host "Invalid choice. Exiting." -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Development environment ready!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan