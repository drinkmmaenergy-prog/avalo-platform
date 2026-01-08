#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Validate Expo monorepo configuration fix
    
.DESCRIPTION
    This script validates that the Expo configuration fix was successful
    and that Expo will load configs from the correct directory.
#>

$ErrorActionPreference = "Stop"

$ROOT_DIR = "C:\Users\Drink\avaloapp"
$APP_MOBILE_DIR = "$ROOT_DIR\app-mobile"

function Write-TestResult {
    param(
        [string]$TestName,
        [bool]$Passed,
        [string]$Message = ""
    )
    
    if ($Passed) {
        Write-Host "  ✅ PASS: $TestName" -ForegroundColor Green
        if ($Message) {
            Write-Host "      → $Message" -ForegroundColor Gray
        }
    } else {
        Write-Host "  ❌ FAIL: $TestName" -ForegroundColor Red
        if ($Message) {
            Write-Host "      → $Message" -ForegroundColor Yellow
        }
    }
    
    return $Passed
}

Write-Host "`n═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  EXPO MONOREPO CONFIGURATION VALIDATION" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan

$allPassed = $true

# TEST 1: No problematic files in root
Write-Host "[TEST 1] Checking for problematic files in root directory..." -ForegroundColor Cyan

$prohibitedFiles = @("app.json", "app.config.js", "app.config.ts", "metro.config.js", "babel.config.js")
$foundInRoot = @()

foreach ($file in $prohibitedFiles) {
    $filePath = Join-Path $ROOT_DIR $file
    if (Test-Path $filePath) {
        $foundInRoot += $file
    }
}

$test1 = Write-TestResult `
    -TestName "No Expo configs in root directory" `
    -Passed ($foundInRoot.Count -eq 0) `
    -Message $(if ($foundInRoot.Count -eq 0) { "Clean ✓" } else { "Found: $($foundInRoot -join ', ')" })

$allPassed = $allPassed -and $test1

# TEST 2: Required files exist in app-mobile
Write-Host "`n[TEST 2] Checking for required files in app-mobile..." -ForegroundColor Cyan

$requiredFiles = @{
    "package.json" = $true
    "app.json" = $true
    "babel.config.js" = $true
    "index.js" = $true
}

$missingFiles = @()
foreach ($file in $requiredFiles.Keys) {
    $filePath = Join-Path $APP_MOBILE_DIR $file
    if (-not (Test-Path $filePath)) {
        $missingFiles += $file
    }
}

$test2 = Write-TestResult `
    -TestName "All required files present in app-mobile" `
    -Passed ($missingFiles.Count -eq 0) `
    -Message $(if ($missingFiles.Count -eq 0) { "All present ✓" } else { "Missing: $($missingFiles -join ', ')" })

$allPassed = $allPassed -and $test2

# TEST 3: Metro config exists
Write-Host "`n[TEST 3] Checking metro.config.js..." -ForegroundColor Cyan

$metroConfigPath = Join-Path $APP_MOBILE_DIR "metro.config.js"
$hasMetroConfig = Test-Path $metroConfigPath

$test3 = Write-TestResult `
    -TestName "metro.config.js exists in app-mobile" `
    -Passed $hasMetroConfig `
    -Message $(if ($hasMetroConfig) { "Present ✓" } else { "Missing - create it!" })

$allPassed = $allPassed -and $test3

# TEST 4: No .expo cache in root
Write-Host "`n[TEST 4] Checking for cache directories..." -ForegroundColor Cyan

$cacheDirs = @(".expo", ".expo-shared")
$foundCaches = @()

foreach ($dir in $cacheDirs) {
    $dirPath = Join-Path $ROOT_DIR $dir
    if (Test-Path $dirPath) {
        $foundCaches += $dir
    }
}

$test4 = Write-TestResult `
    -TestName "No Expo cache directories in root" `
    -Passed ($foundCaches.Count -eq 0) `
    -Message $(if ($foundCaches.Count -eq 0) { "Clean ✓" } else { "Found: $($foundCaches -join ', ')" })

$allPassed = $allPassed -and $test4

# TEST 5: Guard script exists
Write-Host "`n[TEST 5] Checking guard script..." -ForegroundColor Cyan

$guardScriptPath = Join-Path $APP_MOBILE_DIR "scripts\guard-expo-config.ps1"
$hasGuardScript = Test-Path $guardScriptPath

$test5 = Write-TestResult `
    -TestName "Guard script installed" `
    -Passed $hasGuardScript `
    -Message $(if ($hasGuardScript) { "Installed ✓" } else { "Not found - run fix script" })

$allPassed = $allPassed -and $test5

# TEST 6: package.json has guard script
Write-Host "`n[TEST 6] Checking package.json scripts..." -ForegroundColor Cyan

$packageJsonPath = Join-Path $APP_MOBILE_DIR "package.json"
if (Test-Path $packageJsonPath) {
    $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
    $hasGuardScript = $packageJson.scripts.PSObject.Properties.Name -contains 'guard'
    
    $test6 = Write-TestResult `
        -TestName "Guard script in package.json" `
        -Passed $hasGuardScript `
        -Message $(if ($hasGuardScript) { "Configured ✓" } else { "Missing - add to scripts" })
    
    $allPassed = $allPassed -and $test6
} else {
    $test6 = Write-TestResult `
        -TestName "package.json exists" `
        -Passed $false `
        -Message "package.json not found!"
    
    $allPassed = $false
}

# TEST 7: Dependencies installed
Write-Host "`n[TEST 7] Checking dependencies..." -ForegroundColor Cyan

$nodeModulesPath = Join-Path $APP_MOBILE_DIR "node_modules"
$hasDependencies = Test-Path $nodeModulesPath

$test7 = Write-TestResult `
    -TestName "Dependencies installed" `
    -Passed $hasDependencies `
    -Message $(if ($hasDependencies) { "Installed ✓" } else { "Run: cd app-mobile && npm install" })

$allPassed = $allPassed -and $test7

# TEST 8: Expo config validation
Write-Host "`n[TEST 8] Validating Expo configuration..." -ForegroundColor Cyan

Set-Location $APP_MOBILE_DIR

try {
    $expoConfigJson = npx expo config --json 2>&1 | Out-String
    
    if ($expoConfigJson -match '"error"') {
        $test8 = Write-TestResult `
            -TestName "Expo config reads correctly" `
            -Passed $false `
            -Message "Expo config has errors"
    } else {
        $test8 = Write-TestResult `
            -TestName "Expo config reads correctly" `
            -Passed $true `
            -Message "Valid ✓"
    }
} catch {
    $test8 = Write-TestResult `
        -TestName "Expo config reads correctly" `
        -Passed $false `
        -Message "Could not read config: $($_.Exception.Message)"
}

$allPassed = $allPassed -and $test8

# FINAL RESULTS
Write-Host "`n═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan

if ($allPassed) {
    Write-Host "  ✅ ALL TESTS PASSED" -ForegroundColor Green
    Write-Host "═══════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan
    
    Write-Host "✅ Configuration is correct!" -ForegroundColor Green
    Write-Host "`nYou can now run:" -ForegroundColor Cyan
    Write-Host "  cd app-mobile" -ForegroundColor White
    Write-Host "  expo start" -ForegroundColor White
    Write-Host "`nThe 'Invalid URL' error should be gone! 🎉`n" -ForegroundColor Green
    
    exit 0
} else {
    Write-Host "  ⚠️  SOME TESTS FAILED" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan
    
    Write-Host "⚠️  Configuration needs fixes!" -ForegroundColor Yellow
    Write-Host "`nRun the fix script:" -ForegroundColor Cyan
    Write-Host "  pwsh ./fix-expo-monorepo-permanent.ps1" -ForegroundColor White
    Write-Host ""
    
    exit 1
}