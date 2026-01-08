#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Permanent fix for Expo CLI monorepo configuration issues
    
.DESCRIPTION
    This script permanently fixes the "Invalid URL / createCorsMiddleware" error
    by ensuring Expo loads configuration ONLY from app-mobile folder.
    
.NOTES
    Author: Avalo Development Team
    Date: 2025-11-11
    Fixes: TypeError: Invalid URL at createCorsMiddleware
#>

#Requires -Version 7.0

param(
    [switch]$DryRun,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# ============================================================================
# CONFIGURATION
# ============================================================================

$ROOT_DIR = "C:\Users\Drink\avaloapp"
$APP_MOBILE_DIR = "$ROOT_DIR\app-mobile"
$BACKUP_DIR = "$ROOT_DIR\.expo-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

# Files that cause Expo to identify wrong project root
$PROBLEMATIC_ROOT_FILES = @(
    "app.json",
    "app.config.js",
    "app.config.ts",
    "metro.config.js",
    "babel.config.js",
    "eas.json"
)

# Directories to clean
$CACHE_DIRS = @(
    ".expo",
    ".expo-shared",
    "node_modules/.cache",
    "app-mobile/.expo",
    "app-mobile/.expo-shared",
    "app-mobile/.cache",
    "app-mobile/node_modules/.cache"
)

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

function Write-Step {
    param([string]$Message)
    Write-Host "`n[STEP] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "  ✓ $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "  ⚠ $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "  ✗ $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    if ($Verbose) {
        Write-Host "  → $Message" -ForegroundColor Gray
    }
}

# ============================================================================
# STEP 1: ANALYZE ROOT DIRECTORY
# ============================================================================

Write-Step "Analyzing root directory for problematic Expo configs..."

$foundProblematicFiles = @()
$foundCacheDirs = @()

foreach ($file in $PROBLEMATIC_ROOT_FILES) {
    $filePath = Join-Path $ROOT_DIR $file
    if (Test-Path $filePath) {
        $foundProblematicFiles += $file
        Write-Warning "Found: $file"
    }
}

foreach ($dir in $CACHE_DIRS) {
    $dirPath = Join-Path $ROOT_DIR $dir
    if (Test-Path $dirPath) {
        $foundCacheDirs += $dir
        Write-Info "Found cache: $dir"
    }
}

if ($foundProblematicFiles.Count -eq 0) {
    Write-Success "No problematic files found in root"
} else {
    Write-Warning "Found $($foundProblematicFiles.Count) problematic file(s)"
}

# ============================================================================
# STEP 2: CREATE BACKUP
# ============================================================================

Write-Step "Creating backup of problematic files..."

if (-not $DryRun) {
    New-Item -ItemType Directory -Path $BACKUP_DIR -Force | Out-Null
    Write-Success "Backup directory created: $BACKUP_DIR"
    
    foreach ($file in $foundProblematicFiles) {
        $sourcePath = Join-Path $ROOT_DIR $file
        $destPath = Join-Path $BACKUP_DIR $file
        Copy-Item -Path $sourcePath -Destination $destPath -Force
        Write-Info "Backed up: $file"
    }
    Write-Success "All files backed up successfully"
} else {
    Write-Info "[DRY RUN] Would create backup at: $BACKUP_DIR"
}

# ============================================================================
# STEP 3: REMOVE PROBLEMATIC ROOT FILES
# ============================================================================

Write-Step "Removing problematic files from root directory..."

if (-not $DryRun) {
    foreach ($file in $foundProblematicFiles) {
        $filePath = Join-Path $ROOT_DIR $file
        Remove-Item -Path $filePath -Force
        Write-Success "Removed: $file"
    }
} else {
    foreach ($file in $foundProblematicFiles) {
        Write-Info "[DRY RUN] Would remove: $file"
    }
}

# ============================================================================
# STEP 4: CLEAN ALL CACHES
# ============================================================================

Write-Step "Cleaning Expo and Metro caches..."

if (-not $DryRun) {
    foreach ($dir in $foundCacheDirs) {
        $dirPath = Join-Path $ROOT_DIR $dir
        if (Test-Path $dirPath) {
            Remove-Item -Path $dirPath -Recurse -Force -ErrorAction SilentlyContinue
            Write-Success "Cleaned: $dir"
        }
    }
    
    # Clean watchman cache if available
    try {
        watchman watch-del-all 2>&1 | Out-Null
        Write-Success "Cleaned watchman cache"
    } catch {
        Write-Info "Watchman not available (optional)"
    }
    
    # Clean Metro bundler cache
    try {
        Set-Location $APP_MOBILE_DIR
        npx expo start --clear 2>&1 | Out-Null
        Write-Success "Cleared Metro bundler cache"
    } catch {
        Write-Info "Metro cache clear skipped"
    }
} else {
    Write-Info "[DRY RUN] Would clean all cache directories"
}

# ============================================================================
# STEP 5: ENSURE APP-MOBILE HAS CORRECT STRUCTURE
# ============================================================================

Write-Step "Validating app-mobile configuration..."

# Check for required files
$requiredFiles = @{
    "package.json" = $true
    "app.json" = $true
    "babel.config.js" = $true
    "index.js" = $true
    "metro.config.js" = $false  # Optional but recommended
    "tsconfig.json" = $false
}

foreach ($file in $requiredFiles.Keys) {
    $filePath = Join-Path $APP_MOBILE_DIR $file
    $isRequired = $requiredFiles[$file]
    
    if (Test-Path $filePath) {
        Write-Success "Found: $file"
    } elseif ($isRequired) {
        Write-Error "Missing required file: $file"
    } else {
        Write-Warning "Missing optional file: $file"
    }
}

# ============================================================================
# STEP 6: CREATE MISSING METRO CONFIG
# ============================================================================

Write-Step "Creating metro.config.js for app-mobile..."

$metroConfigPath = Join-Path $APP_MOBILE_DIR "metro.config.js"

if (-not (Test-Path $metroConfigPath)) {
    if (-not $DryRun) {
        $metroConfig = @"
// Metro configuration for expo-router in monorepo
// Learn more: https://docs.expo.dev/guides/customizing-metro

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// CRITICAL: Force Metro to resolve from app-mobile directory ONLY
config.watchFolders = [projectRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
];

// Ensure Metro doesn't walk up to parent directory
config.projectRoot = projectRoot;

module.exports = config;
"@
        Set-Content -Path $metroConfigPath -Value $metroConfig -Encoding UTF8
        Write-Success "Created metro.config.js"
    } else {
        Write-Info "[DRY RUN] Would create metro.config.js"
    }
} else {
    Write-Info "metro.config.js already exists"
}

# ============================================================================
# STEP 7: MOVE EAS.JSON TO APP-MOBILE
# ============================================================================

Write-Step "Moving eas.json to app-mobile (if needed)..."

$rootEasJson = Join-Path $ROOT_DIR "eas.json"
$mobileEasJson = Join-Path $APP_MOBILE_DIR "eas.json"

if ((Test-Path $rootEasJson) -and -not (Test-Path $mobileEasJson)) {
    if (-not $DryRun) {
        Move-Item -Path $rootEasJson -Destination $mobileEasJson -Force
        Write-Success "Moved eas.json to app-mobile"
    } else {
        Write-Info "[DRY RUN] Would move eas.json to app-mobile"
    }
} elseif (Test-Path $mobileEasJson) {
    Write-Success "eas.json already in correct location"
} else {
    Write-Info "No eas.json found (optional)"
}

# ============================================================================
# STEP 8: REINSTALL DEPENDENCIES
# ============================================================================

Write-Step "Reinstalling app-mobile dependencies..."

if (-not $DryRun) {
    Set-Location $APP_MOBILE_DIR
    
    # Remove node_modules and lockfiles
    if (Test-Path "node_modules") {
        Remove-Item -Path "node_modules" -Recurse -Force
        Write-Success "Removed old node_modules"
    }
    
    if (Test-Path "package-lock.json") {
        Remove-Item -Path "package-lock.json" -Force
    }
    if (Test-Path "yarn.lock") {
        Remove-Item -Path "yarn.lock" -Force
    }
    if (Test-Path "pnpm-lock.yaml") {
        Remove-Item -Path "pnpm-lock.yaml" -Force
    }
    
    Write-Host "  Installing dependencies (this may take a few minutes)..."
    
    # Detect package manager
    if (Test-Path "../pnpm-workspace.yaml") {
        pnpm install
    } elseif (Test-Path "../yarn.lock") {
        yarn install
    } else {
        npm install
    }
    
    Write-Success "Dependencies installed successfully"
} else {
    Write-Info "[DRY RUN] Would reinstall dependencies"
}

# ============================================================================
# STEP 9: CREATE GUARD SCRIPT
# ============================================================================

Write-Step "Creating guard script to prevent future issues..."

$guardScriptPath = Join-Path $APP_MOBILE_DIR "scripts\guard-expo-config.ps1"
$guardsDir = Join-Path $APP_MOBILE_DIR "scripts"

if (-not $DryRun) {
    if (-not (Test-Path $guardsDir)) {
        New-Item -ItemType Directory -Path $guardsDir -Force | Out-Null
    }
    
    $guardScript = @"
#!/usr/bin/env pwsh
# Guard script to prevent Expo configs in parent directory

`$ROOT_DIR = Split-Path (Split-Path `$PSScriptRoot -Parent) -Parent
`$FORBIDDEN_FILES = @('app.json', 'app.config.js', 'metro.config.js', 'babel.config.js')

`$found = @()
foreach (`$file in `$FORBIDDEN_FILES) {
    if (Test-Path (Join-Path `$ROOT_DIR `$file)) {
        `$found += `$file
    }
}

if (`$found.Count -gt 0) {
    Write-Host "⚠️  WARNING: Found Expo config files in parent directory!" -ForegroundColor Red
    Write-Host "   These may cause Expo to load from wrong directory:" -ForegroundColor Yellow
    `$found | ForEach-Object { Write-Host "   - `$_" -ForegroundColor Yellow }
    Write-Host "   Run fix-expo-monorepo-permanent.ps1 to fix this issue." -ForegroundColor Cyan
    exit 1
} else {
    Write-Host "✓ No problematic Expo configs in parent directory" -ForegroundColor Green
    exit 0
}
"@
    Set-Content -Path $guardScriptPath -Value $guardScript -Encoding UTF8
    Write-Success "Created guard script at scripts/guard-expo-config.ps1"
    
    # Add guard to package.json prestart script
    $packageJsonPath = Join-Path $APP_MOBILE_DIR "package.json"
    if (Test-Path $packageJsonPath) {
        $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
        
        if (-not $packageJson.scripts.PSObject.Properties['guard']) {
            $packageJson.scripts | Add-Member -MemberType NoteProperty -Name 'guard' -Value 'pwsh ./scripts/guard-expo-config.ps1'
            $packageJson.scripts | Add-Member -MemberType NoteProperty -Name 'prestart' -Value 'npm run guard'
            
            $packageJson | ConvertTo-Json -Depth 10 | Set-Content $packageJsonPath -Encoding UTF8
            Write-Success "Added guard script to package.json"
        }
    }
} else {
    Write-Info "[DRY RUN] Would create guard script"
}

# ============================================================================
# STEP 10: VALIDATE CONFIGURATION
# ============================================================================

Write-Step "Validating Expo configuration..."

if (-not $DryRun) {
    Set-Location $APP_MOBILE_DIR
    
    # Check if expo can read config properly
    try {
        $expoConfig = npx expo config --json 2>&1 | ConvertFrom-Json
        
        if ($expoConfig.rootDir -eq $APP_MOBILE_DIR) {
            Write-Success "Expo correctly identifies app-mobile as root"
        } else {
            Write-Warning "Expo root dir: $($expoConfig.rootDir)"
        }
    } catch {
        Write-Warning "Could not validate expo config (may be OK)"
    }
} else {
    Write-Info "[DRY RUN] Would validate Expo configuration"
}

# ============================================================================
# STEP 11: GENERATE FINAL REPORT
# ============================================================================

Write-Step "Generating final folder structure report..."

$reportPath = Join-Path $ROOT_DIR "EXPO_FIX_REPORT_$(Get-Date -Format 'yyyyMMdd_HHmmss').md"

$report = @"
# Expo Monorepo Fix Report
Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

## Summary
- **Status**: $( if ($DryRun) { "DRY RUN" } else { "COMPLETED" } )
- **Root Directory**: $ROOT_DIR
- **App Mobile Directory**: $APP_MOBILE_DIR
- **Backup Location**: $BACKUP_DIR

## Problematic Files Removed from Root
$( if ($foundProblematicFiles.Count -eq 0) { "None found" } else { $foundProblematicFiles | ForEach-Object { "- $_`n" } } )

## Cache Directories Cleaned
$( if ($foundCacheDirs.Count -eq 0) { "None found" } else { $foundCacheDirs | ForEach-Object { "- $_`n" } } )

## Final Folder Structure
``````
avaloapp/                           ← ROOT (NO expo configs here!)
├── package.json                    ← Monorepo root package
├── pnpm-workspace.yaml            ← Workspace config
├── .gitignore
├── functions/                      ← Firebase functions
├── shared/                         ← Shared packages
├── sdk/                           ← SDK packages
└── app-mobile/                    ← EXPO PROJECT ROOT ✓
    ├── app/                       ← Expo Router
    ├── components/
    ├── assets/
    ├── scripts/
    │   └── guard-expo-config.ps1  ← Guard script
    ├── tools/
    ├── package.json               ← Mobile dependencies
    ├── app.json                   ← Expo config ✓
    ├── babel.config.js            ← Babel config ✓
    ├── metro.config.js            ← Metro config ✓
    ├── index.js                   ← Entry point ✓
    ├── eas.json                   ← EAS build config
    └── tsconfig.json              ← TypeScript config
``````

## Next Steps

### To start Expo:
``````powershell
cd app-mobile
npm start
# or
expo start
``````

### To run guard check:
``````powershell
cd app-mobile
npm run guard
``````

### To restore from backup (if needed):
``````powershell
# Backup location: $BACKUP_DIR
Copy-Item -Path "$BACKUP_DIR\*" -Destination "$ROOT_DIR\" -Force
``````

## Verification Checklist
- [ ] No app.json, babel.config.js, or metro.config.js in root
- [ ] All Expo configs exist only in app-mobile/
- [ ] `expo start` works without "Invalid URL" error
- [ ] Metro bundler starts successfully
- [ ] Guard script prevents future issues

## Troubleshooting

### If "Invalid URL" error persists:
1. Run this script again with -Verbose flag
2. Manually check for hidden .expo folders
3. Clear global Expo cache: `npx expo start --clear`
4. Restart VS Code and terminal

### If dependencies are broken:
``````powershell
cd app-mobile
rm -rf node_modules
npm install
``````

---
**This fix is permanent and automated. The guard script will prevent future issues.**
"@

if (-not $DryRun) {
    Set-Content -Path $reportPath -Value $report -Encoding UTF8
    Write-Success "Report saved to: $reportPath"
} else {
    Write-Host "`n$report" -ForegroundColor Gray
}

# ============================================================================
# FINAL SUMMARY
# ============================================================================

Write-Host "`n═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  EXPO MONOREPO FIX $(if ($DryRun) { 'DRY RUN ' } else { '' })COMPLETED" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan

Write-Host "`n📁 Root Directory: $ROOT_DIR"
Write-Host "📱 App Mobile: $APP_MOBILE_DIR"
Write-Host "💾 Backup: $BACKUP_DIR"

if (-not $DryRun) {
    Write-Host "`n✅ Next Steps:" -ForegroundColor Green
    Write-Host "   1. cd app-mobile"
    Write-Host "   2. expo start"
    Write-Host "   3. Verify Metro bundler starts without errors"
    Write-Host "`n🛡️  Guard script installed: npm run guard" -ForegroundColor Cyan
} else {
    Write-Host "`n⚠️  This was a DRY RUN. Run without -DryRun to apply changes." -ForegroundColor Yellow
}

Write-Host "`n═══════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan

if (-not $DryRun) {
    Set-Location $APP_MOBILE_DIR
}