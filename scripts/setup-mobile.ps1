#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Avalo Mobile - Windows Setup Script
.DESCRIPTION
    Complete automated setup for Expo SDK 54 + React 19 + React Native 0.81.5
.NOTES
    Run from repository root: C:\Users\Drink\avaloapp
#>

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  AVALO MOBILE - AUTOMATED SETUP (Windows)" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the correct directory
$currentDir = Get-Location
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Error: Must run from repository root (avaloapp)" -ForegroundColor Red
    Write-Host "   Current directory: $currentDir" -ForegroundColor Yellow
    exit 1
}

Write-Host "📁 Repository root: $currentDir" -ForegroundColor Green
Write-Host ""

# Step 1: Check pnpm installation
Write-Host "═══ Step 1/8: Checking pnpm installation ═══" -ForegroundColor Cyan
try {
    $pnpmVersion = pnpm --version 2>$null
    Write-Host "✓ pnpm version: $pnpmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ pnpm is not installed or not in PATH" -ForegroundColor Red
    Write-Host "   Install with: npm install -g pnpm@9.0.0" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Step 2: Clean old artifacts
Write-Host "═══ Step 2/8: Cleaning old artifacts ═══" -ForegroundColor Cyan
$cleanPaths = @(
    "app-mobile/.expo",
    "app-mobile/.expo-shared",
    "app-mobile/.cache",
    "app-mobile/node_modules/.cache"
)

foreach ($cleanPath in $cleanPaths) {
    if (Test-Path $cleanPath) {
        Write-Host "🗑️  Removing $cleanPath..." -ForegroundColor Yellow
        Remove-Item -Path $cleanPath -Recurse -Force -ErrorAction SilentlyContinue
    }
}
Write-Host "✓ Cleanup completed" -ForegroundColor Green
Write-Host ""

# Step 3: Install root dependencies
Write-Host "═══ Step 3/8: Installing root dependencies ═══" -ForegroundColor Cyan
Write-Host "Running: pnpm install" -ForegroundColor Gray
pnpm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install root dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Root dependencies installed" -ForegroundColor Green
Write-Host ""

# Step 4: Install app-mobile dependencies
Write-Host "═══ Step 4/8: Installing app-mobile dependencies ═══" -ForegroundColor Cyan
Write-Host "Running: pnpm -F app-mobile install" -ForegroundColor Gray
pnpm -F app-mobile install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install app-mobile dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "✓ app-mobile dependencies installed" -ForegroundColor Green
Write-Host ""

# Step 5: Verify exact versions
Write-Host "═══ Step 5/8: Verifying package versions ═══" -ForegroundColor Cyan

$packageJsonPath = "app-mobile/package.json"
if (Test-Path $packageJsonPath) {
    $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
    
    $expectedVersions = @{
        "expo" = "54.0.23"
        "react" = "19.1.0"
        "react-native" = "0.81.5"
        "firebase" = "11.0.0"
        "typescript" = "5.9.2"
    }
    
    $allCorrect = $true
    foreach ($pkg in $expectedVersions.Keys) {
        $expected = $expectedVersions[$pkg]
        $actual = $null
        
        if ($packageJson.dependencies.PSObject.Properties[$pkg]) {
            $actual = $packageJson.dependencies.$pkg
        } elseif ($packageJson.devDependencies.PSObject.Properties[$pkg]) {
            $actual = $packageJson.devDependencies.$pkg
        }
        
        if ($actual -eq $expected) {
            Write-Host "  ✓ $pkg @ $actual" -ForegroundColor Green
        } else {
            Write-Host "  ✗ $pkg @ $actual (expected: $expected)" -ForegroundColor Red
            $allCorrect = $false
        }
    }
    
    if (-not $allCorrect) {
        Write-Host "⚠️  Some package versions don't match - continuing anyway" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️  Could not verify package versions" -ForegroundColor Yellow
}
Write-Host ""

# Step 6: Run auto-merge script
Write-Host "═══ Step 6/8: Running auto-merge script ═══" -ForegroundColor Cyan
if (Test-Path "scripts/auto-merge.js") {
    node scripts/auto-merge.js
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Auto-merge failed" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "⚠️  auto-merge.js not found - skipping" -ForegroundColor Yellow
}
Write-Host ""

# Step 7: Run React 19 codemod
Write-Host "═══ Step 7/8: Running React 19 codemod ═══" -ForegroundColor Cyan
if (Test-Path "scripts/codemod-react19.js") {
    node scripts/codemod-react19.js
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Codemod failed" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "⚠️  codemod-react19.js not found - skipping" -ForegroundColor Yellow
}
Write-Host ""

# Step 8: Validation
Write-Host "═══ Step 8/8: Validation ═══" -ForegroundColor Cyan

$criticalFiles = @(
    @{ Path = "app-mobile/package.json"; Name = "package.json" },
    @{ Path = "app-mobile/app.json"; Name = "app.json" },
    @{ Path = "app-mobile/index.js"; Name = "index.js" },
    @{ Path = "app-mobile/App.tsx"; Name = "App.tsx" },
    @{ Path = "app-mobile/babel.config.js"; Name = "babel.config.js" },
    @{ Path = "app-mobile/metro.config.js"; Name = "metro.config.js" },
    @{ Path = "app-mobile/node_modules"; Name = "node_modules" }
)

$allValid = $true
foreach ($file in $criticalFiles) {
    if (Test-Path $file.Path) {
        Write-Host "  ✓ $($file.Name)" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $($file.Name) - MISSING" -ForegroundColor Red
        $allValid = $false
    }
}

Write-Host ""

if ($allValid) {
    Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host "  ✅ SETUP COMPLETED SUCCESSFULLY!" -ForegroundColor Green
    Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host ""
    Write-Host "🚀 Next Steps:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  1. Navigate to app-mobile:" -ForegroundColor White
    Write-Host "     cd app-mobile" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  2. Start Expo development server:" -ForegroundColor White
    Write-Host "     npx expo start --clear" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  3. Scan QR code with Expo Go app" -ForegroundColor White
    Write-Host ""
    Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Red
    Write-Host "  ❌ SETUP INCOMPLETE - MISSING FILES" -ForegroundColor Red
    Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Red
    Write-Host ""
    exit 1
}