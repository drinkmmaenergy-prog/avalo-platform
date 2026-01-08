#Requires -Version 5.1

<#
.SYNOPSIS
    Validate Expo Monorepo Setup
.DESCRIPTION
    This script validates that the Expo monorepo is correctly configured
    and identifies any issues that need to be fixed.
.NOTES
    Author: Kilo Code
    Date: 2025-11-11
#>

$ErrorActionPreference = "Stop"

# ANSI Colors
$RED = "`e[31m"
$GREEN = "`e[32m"
$YELLOW = "`e[33m"
$BLUE = "`e[34m"
$CYAN = "`e[36m"
$RESET = "`e[0m"
$BOLD = "`e[1m"

$SCRIPT_DIR = $PSScriptRoot
$ROOT_DIR = $SCRIPT_DIR
$APP_MOBILE_DIR = Join-Path $ROOT_DIR "app-mobile"

$validationPassed = $true
$errors = @()
$warnings = @()
$recommendations = @()

function Write-Header {
    param([string]$Title)
    Write-Host ""
    Write-Host "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}"
    Write-Host "${BOLD}${CYAN}  $Title${RESET}"
    Write-Host "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}"
    Write-Host ""
}

function Test-RootDirectory {
    Write-Header "CHECK 1: Root Directory (Should be Clean)"
    
    $problematicFiles = @(
        "app.json",
        "babel.config.js",
        "metro.config.js",
        "app.config.js",
        "app.config.ts",
        "index.js"
    )
    
    $problematicDirs = @(
        ".expo",
        ".expo-shared"
    )
    
    $foundIssues = $false
    
    foreach ($file in $problematicFiles) {
        $filePath = Join-Path $ROOT_DIR $file
        if (Test-Path $filePath) {
            Write-Host "  ${RED}✗ Found: $file${RESET}"
            $script:errors += "Root contains forbidden file: $file"
            $foundIssues = $true
            $script:validationPassed = $false
        }
    }
    
    foreach ($dir in $problematicDirs) {
        $dirPath = Join-Path $ROOT_DIR $dir
        if (Test-Path $dirPath) {
            Write-Host "  ${RED}✗ Found: $dir/${RESET}"
            $script:errors += "Root contains forbidden directory: $dir/"
            $foundIssues = $true
            $script:validationPassed = $false
        }
    }
    
    # Check for node_modules in root
    $rootNodeModules = Join-Path $ROOT_DIR "node_modules"
    if (Test-Path $rootNodeModules) {
        Write-Host "  ${YELLOW}⚠ Found: node_modules/ (may cause conflicts)${RESET}"
        $script:warnings += "Root contains node_modules (may cause module resolution conflicts)"
    }
    
    if (-not $foundIssues) {
        Write-Host "  ${GREEN}✓ Root directory is clean${RESET}"
    }
}

function Test-AppMobileDirectory {
    Write-Header "CHECK 2: app-mobile Directory (Should have all configs)"
    
    if (-not (Test-Path $APP_MOBILE_DIR)) {
        Write-Host "  ${RED}✗ app-mobile directory not found${RESET}"
        $script:errors += "app-mobile directory does not exist"
        $script:validationPassed = $false
        return
    }
    
    Write-Host "  ${GREEN}✓ app-mobile directory exists${RESET}"
    
    $requiredFiles = @{
        "app.json" = "Expo app configuration"
        "babel.config.js" = "Babel configuration"
        "metro.config.js" = "Metro bundler configuration"
        "tsconfig.json" = "TypeScript configuration"
        "package.json" = "Package manifest"
    }
    
    foreach ($file in $requiredFiles.Keys) {
        $filePath = Join-Path $APP_MOBILE_DIR $file
        if (Test-Path $filePath) {
            Write-Host "  ${GREEN}✓ Found: $file${RESET}"
        } else {
            Write-Host "  ${RED}✗ Missing: $file${RESET}"
            $script:errors += "app-mobile missing required file: $file ($($requiredFiles[$file]))"
            $script:validationPassed = $false
        }
    }
    
    # Check for node_modules
    $appNodeModules = Join-Path $APP_MOBILE_DIR "node_modules"
    if (Test-Path $appNodeModules) {
        Write-Host "  ${GREEN}✓ Found: node_modules/${RESET}"
    } else {
        Write-Host "  ${YELLOW}⚠ Missing: node_modules/${RESET}"
        $script:warnings += "app-mobile/node_modules not found. Run: cd app-mobile && pnpm install"
    }
    
    # Check for guard script
    $guardScript = Join-Path $APP_MOBILE_DIR "scripts/guard-root-expo.cjs"
    if (Test-Path $guardScript) {
        Write-Host "  ${GREEN}✓ Found: scripts/guard-root-expo.cjs${RESET}"
    } else {
        Write-Host "  ${YELLOW}⚠ Missing: scripts/guard-root-expo.cjs${RESET}"
        $script:recommendations += "Create guard script to prevent future issues"
    }
}

function Test-MetroConfig {
    Write-Header "CHECK 3: Metro Configuration"
    
    $metroConfigPath = Join-Path $APP_MOBILE_DIR "metro.config.js"
    
    if (-not (Test-Path $metroConfigPath)) {
        Write-Host "  ${RED}✗ metro.config.js not found${RESET}"
        $script:errors += "metro.config.js missing in app-mobile"
        $script:validationPassed = $false
        return
    }
    
    $content = Get-Content -Path $metroConfigPath -Raw
    
    # Check for monorepo configuration
    if ($content -match "watchFolders") {
        Write-Host "  ${GREEN}✓ Contains watchFolders configuration${RESET}"
    } else {
        Write-Host "  ${YELLOW}⚠ No watchFolders configuration${RESET}"
        $script:warnings += "metro.config.js should include watchFolders for monorepo support"
    }
    
    if ($content -match "expo/metro-config") {
        Write-Host "  ${GREEN}✓ Uses expo/metro-config${RESET}"
    } else {
        Write-Host "  ${RED}✗ Not using expo/metro-config${RESET}"
        $script:errors += "metro.config.js should use require('expo/metro-config')"
        $script:validationPassed = $false
    }
}

function Test-AppJson {
    Write-Header "CHECK 4: app.json Configuration"
    
    $appJsonPath = Join-Path $APP_MOBILE_DIR "app.json"
    
    if (-not (Test-Path $appJsonPath)) {
        Write-Host "  ${RED}✗ app.json not found${RESET}"
        $script:errors += "app.json missing in app-mobile"
        $script:validationPassed = $false
        return
    }
    
    try {
        $appJson = Get-Content -Path $appJsonPath -Raw | ConvertFrom-Json
        
        if ($appJson.expo) {
            Write-Host "  ${GREEN}✓ Contains expo configuration${RESET}"
            
            if ($appJson.expo.scheme) {
                Write-Host "  ${GREEN}✓ Scheme configured: $($appJson.expo.scheme)${RESET}"
            } else {
                Write-Host "  ${YELLOW}⚠ No scheme configured${RESET}"
            }
            
            if ($appJson.expo.plugins) {
                Write-Host "  ${GREEN}✓ Plugins configured (count: $($appJson.expo.plugins.Count))${RESET}"
            } else {
                Write-Host "  ${YELLOW}⚠ No plugins configured${RESET}"
            }
        } else {
            Write-Host "  ${RED}✗ No expo configuration found${RESET}"
            $script:errors += "app.json missing expo configuration object"
            $script:validationPassed = $false
        }
    } catch {
        Write-Host "  ${RED}✗ Failed to parse app.json: $_${RESET}"
        $script:errors += "app.json is not valid JSON"
        $script:validationPassed = $false
    }
}

function Test-BabelConfig {
    Write-Header "CHECK 5: Babel Configuration"
    
    $babelConfigPath = Join-Path $APP_MOBILE_DIR "babel.config.js"
    
    if (-not (Test-Path $babelConfigPath)) {
        Write-Host "  ${RED}✗ babel.config.js not found${RESET}"
        $script:errors += "babel.config.js missing in app-mobile"
        $script:validationPassed = $false
        return
    }
    
    $content = Get-Content -Path $babelConfigPath -Raw
    
    if ($content -match "babel-preset-expo") {
        Write-Host "  ${GREEN}✓ Uses babel-preset-expo${RESET}"
    } else {
        Write-Host "  ${RED}✗ Not using babel-preset-expo${RESET}"
        $script:errors += "babel.config.js should use 'babel-preset-expo'"
        $script:validationPassed = $false
    }
    
    if ($content -match "expo-router") {
        Write-Host "  ${GREEN}✓ Includes expo-router plugin${RESET}"
    } else {
        Write-Host "  ${YELLOW}⚠ No expo-router plugin${RESET}"
    }
    
    if ($content -match "react-native-reanimated") {
        Write-Host "  ${GREEN}✓ Includes reanimated plugin${RESET}"
    } else {
        Write-Host "  ${YELLOW}⚠ No reanimated plugin${RESET}"
    }
}

function Test-TypeScriptConfig {
    Write-Header "CHECK 6: TypeScript Configuration"
    
    $tsconfigPath = Join-Path $APP_MOBILE_DIR "tsconfig.json"
    
    if (-not (Test-Path $tsconfigPath)) {
        Write-Host "  ${RED}✗ tsconfig.json not found${RESET}"
        $script:errors += "tsconfig.json missing in app-mobile"
        $script:validationPassed = $false
        return
    }
    
    try {
        $tsconfig = Get-Content -Path $tsconfigPath -Raw | ConvertFrom-Json
        
        if ($tsconfig.extends -match "expo") {
            Write-Host "  ${GREEN}✓ Extends expo/tsconfig.base${RESET}"
        } else {
            Write-Host "  ${YELLOW}⚠ Not extending expo/tsconfig.base${RESET}"
        }
        
        if ($tsconfig.compilerOptions.paths) {
            Write-Host "  ${GREEN}✓ Contains path mappings${RESET}"
        } else {
            Write-Host "  ${YELLOW}⚠ No path mappings configured${RESET}"
        }
    } catch {
        Write-Host "  ${RED}✗ Failed to parse tsconfig.json${RESET}"
        $script:warnings += "tsconfig.json might not be valid JSON (comments allowed)"
    }
}

function Test-GuardScript {
    Write-Header "CHECK 7: Guard Script"
    
    $guardScriptPath = Join-Path $APP_MOBILE_DIR "scripts/guard-root-expo.cjs"
    
    if (Test-Path $guardScriptPath) {
        Write-Host "  ${GREEN}✓ Guard script exists${RESET}"
        
        # Try to run it
        try {
            $output = node $guardScriptPath 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  ${GREEN}✓ Guard script passes${RESET}"
            } else {
                Write-Host "  ${RED}✗ Guard script failed${RESET}"
                Write-Host "  Output: $output"
                $script:errors += "Guard script detected issues"
                $script:validationPassed = $false
            }
        } catch {
            Write-Host "  ${YELLOW}⚠ Could not run guard script${RESET}"
        }
    } else {
        Write-Host "  ${YELLOW}⚠ Guard script not found${RESET}"
        $script:recommendations += "Run FULL_MONOREPO_REPAIR.ps1 to create guard script"
    }
}

function Show-Summary {
    Write-Header "VALIDATION SUMMARY"
    
    if ($validationPassed) {
        Write-Host "${GREEN}${BOLD}✓ ALL CHECKS PASSED!${RESET}"
        Write-Host ""
        Write-Host "${CYAN}Your Expo monorepo is correctly configured.${RESET}"
        Write-Host ""
        Write-Host "You can start Expo with:"
        Write-Host "  ${BOLD}cd app-mobile${RESET}"
        Write-Host "  ${BOLD}pnpm start${RESET}"
        Write-Host ""
    } else {
        Write-Host "${RED}${BOLD}✗ VALIDATION FAILED${RESET}"
        Write-Host ""
        Write-Host "${RED}Errors (${errors.Count}):${RESET}"
        foreach ($err in $errors) {
            Write-Host "  ${RED}✗ $err${RESET}"
        }
        Write-Host ""
        Write-Host "${YELLOW}To fix these issues, run:${RESET}"
        Write-Host "  ${BOLD}.\FULL_MONOREPO_REPAIR.ps1${RESET}"
        Write-Host ""
    }
    
    if ($warnings.Count -gt 0) {
        Write-Host "${YELLOW}Warnings (${warnings.Count}):${RESET}"
        foreach ($warn in $warnings) {
            Write-Host "  ${YELLOW}⚠ $warn${RESET}"
        }
        Write-Host ""
    }
    
    if ($recommendations.Count -gt 0) {
        Write-Host "${CYAN}Recommendations (${recommendations.Count}):${RESET}"
        foreach ($rec in $recommendations) {
            Write-Host "  ${CYAN}ℹ $rec${RESET}"
        }
        Write-Host ""
    }
}

# Run all checks
Write-Header "EXPO MONOREPO VALIDATION"
Write-Host "Checking: $ROOT_DIR"
Write-Host ""

Test-RootDirectory
Test-AppMobileDirectory
Test-MetroConfig
Test-AppJson
Test-BabelConfig
Test-TypeScriptConfig
Test-GuardScript
Show-Summary

if (-not $validationPassed) {
    exit 1
}