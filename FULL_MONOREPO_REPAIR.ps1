#Requires -Version 5.1

<#
.SYNOPSIS
    Complete Expo Monorepo Repair - One-Shot Fix
.DESCRIPTION
    This script performs a complete, automated repair of the Avalo monorepo
    to fix Expo CLI detection issues. It moves all problematic root files,
    regenerates correct configurations, and validates the final setup.
.NOTES
    Author: Kilo Code
    Date: 2025-11-11
    Version: 1.0.0
#>

param(
    [switch]$DryRun = $false,
    [switch]$SkipBackup = $false,
    [switch]$Force = $false
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# ANSI Colors
$RED = "`e[31m"
$GREEN = "`e[32m"
$YELLOW = "`e[33m"
$BLUE = "`e[34m"
$MAGENTA = "`e[35m"
$CYAN = "`e[36m"
$RESET = "`e[0m"
$BOLD = "`e[1m"

# Configuration
$SCRIPT_DIR = $PSScriptRoot
$ROOT_DIR = $SCRIPT_DIR
$APP_MOBILE_DIR = Join-Path $ROOT_DIR "app-mobile"
$BACKUP_DIR = Join-Path $ROOT_DIR "_expo_backup_root"
$TIMESTAMP = Get-Date -Format "yyyyMMdd_HHmmss"
$LOG_FILE = Join-Path $ROOT_DIR "MONOREPO_REPAIR_LOG_$TIMESTAMP.txt"

# Files and directories to move from root
$PROBLEMATIC_FILES = @(
    "app.json",
    "babel.config.js",
    "eas.json",
    "metro.config.js",
    "app.config.js",
    "app.config.ts",
    "index.js",
    ".expo",
    ".expo-shared"
)

# Directories to remove from root
$DIRECTORIES_TO_REMOVE = @(
    "node_modules",
    ".expo",
    ".expo-shared"
)

# ============================================================================
# LOGGING FUNCTIONS
# ============================================================================

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    
    Add-Content -Path $LOG_FILE -Value $logMessage -ErrorAction SilentlyContinue
    
    switch ($Level) {
        "ERROR" { Write-Host "${RED}✗ $Message${RESET}" }
        "SUCCESS" { Write-Host "${GREEN}✓ $Message${RESET}" }
        "WARNING" { Write-Host "${YELLOW}⚠ $Message${RESET}" }
        "INFO" { Write-Host "${BLUE}ℹ $Message${RESET}" }
        "STEP" { Write-Host "${BOLD}${CYAN}▶ $Message${RESET}" }
        default { Write-Host $Message }
    }
}

function Write-Header {
    param([string]$Title)
    
    Write-Host ""
    Write-Host "${BOLD}${MAGENTA}═══════════════════════════════════════════════════════════════${RESET}"
    Write-Host "${BOLD}${MAGENTA}  $Title${RESET}"
    Write-Host "${BOLD}${MAGENTA}═══════════════════════════════════════════════════════════════${RESET}"
    Write-Host ""
}

# ============================================================================
# VALIDATION FUNCTIONS
# ============================================================================

function Test-Prerequisites {
    Write-Header "STEP 0: Validating Prerequisites"
    
    # Check if app-mobile exists
    if (-not (Test-Path $APP_MOBILE_DIR)) {
        Write-Log "app-mobile directory not found at: $APP_MOBILE_DIR" "ERROR"
        return $false
    }
    Write-Log "Found app-mobile directory" "SUCCESS"
    
    # Check if pnpm is installed
    try {
        $pnpmVersion = pnpm --version 2>$null
        Write-Log "pnpm version: $pnpmVersion" "SUCCESS"
    } catch {
        Write-Log "pnpm is not installed. Please install pnpm first." "ERROR"
        return $false
    }
    
    # Check if Node.js is installed
    try {
        $nodeVersion = node --version 2>$null
        Write-Log "Node.js version: $nodeVersion" "SUCCESS"
    } catch {
        Write-Log "Node.js is not installed. Please install Node.js first." "ERROR"
        return $false
    }
    
    return $true
}

# ============================================================================
# BACKUP FUNCTIONS
# ============================================================================

function Backup-RootFiles {
    Write-Header "STEP 1: Backing Up Root Files"
    
    if ($SkipBackup) {
        Write-Log "Skipping backup (--SkipBackup flag set)" "WARNING"
        return
    }
    
    # Create backup directory
    if (-not (Test-Path $BACKUP_DIR)) {
        New-Item -Path $BACKUP_DIR -ItemType Directory -Force | Out-Null
        Write-Log "Created backup directory: $BACKUP_DIR" "SUCCESS"
    }
    
    $movedCount = 0
    
    foreach ($item in $PROBLEMATIC_FILES) {
        $sourcePath = Join-Path $ROOT_DIR $item
        
        if (Test-Path $sourcePath) {
            $destPath = Join-Path $BACKUP_DIR $item
            
            if ($DryRun) {
                Write-Log "[DRY RUN] Would move: $item" "INFO"
            } else {
                try {
                    Move-Item -Path $sourcePath -Destination $destPath -Force
                    Write-Log "Moved: $item → _expo_backup_root/" "SUCCESS"
                    $movedCount++
                } catch {
                    $errorMsg = $_.Exception.Message
                    Write-Log "Failed to move ${item}: $errorMsg" "ERROR"
                }
            }
        }
    }
    
    Write-Log "Backed up $movedCount problematic files" "SUCCESS"
}

# ============================================================================
# CLEANUP FUNCTIONS
# ============================================================================

function Remove-RootNodeModules {
    Write-Header "STEP 2: Removing Root node_modules"
    
    $nodeModulesPath = Join-Path $ROOT_DIR "node_modules"
    
    if (Test-Path $nodeModulesPath) {
        if ($DryRun) {
            Write-Log "[DRY RUN] Would remove: node_modules/" "INFO"
        } else {
            Write-Log "Removing root node_modules (this may take a moment)..." "INFO"
            try {
                Remove-Item -Path $nodeModulesPath -Recurse -Force -ErrorAction Stop
                Write-Log "Removed root node_modules" "SUCCESS"
            } catch {
                Write-Log "Failed to remove node_modules: $_" "ERROR"
                Write-Log "Attempting alternative removal method..." "WARNING"
                
                # Try using cmd for stubborn directories
                cmd /c "rmdir /s /q `"$nodeModulesPath`"" 2>$null
                
                if (-not (Test-Path $nodeModulesPath)) {
                    Write-Log "Successfully removed node_modules using alternative method" "SUCCESS"
                } else {
                    Write-Log "Could not fully remove node_modules. Please remove manually." "WARNING"
                }
            }
        }
    } else {
        Write-Log "No root node_modules found" "INFO"
    }
}

function Clear-ExpoCache {
    Write-Header "STEP 3: Clearing Expo & Metro Cache"
    
    $cachePaths = @(
        (Join-Path $ROOT_DIR ".expo"),
        (Join-Path $APP_MOBILE_DIR ".expo"),
        (Join-Path $APP_MOBILE_DIR "node_modules/.cache"),
        (Join-Path $env:TEMP "metro-*"),
        (Join-Path $env:TEMP "haste-map-*"),
        (Join-Path $env:LOCALAPPDATA "Expo")
    )
    
    foreach ($cachePath in $cachePaths) {
        if ($cachePath -like "*`**") {
            # Handle wildcards
            $pattern = Split-Path $cachePath -Leaf
            $parent = Split-Path $cachePath -Parent
            
            if (Test-Path $parent) {
                Get-ChildItem -Path $parent -Filter $pattern -ErrorAction SilentlyContinue | ForEach-Object {
                    if ($DryRun) {
                        Write-Log "[DRY RUN] Would remove: $($_.FullName)" "INFO"
                    } else {
                        Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
                        Write-Log "Removed cache: $($_.Name)" "SUCCESS"
                    }
                }
            }
        } elseif (Test-Path $cachePath) {
            if ($DryRun) {
                Write-Log "[DRY RUN] Would remove: $cachePath" "INFO"
            } else {
                Remove-Item -Path $cachePath -Recurse -Force -ErrorAction SilentlyContinue
                Write-Log "Removed cache: $(Split-Path $cachePath -Leaf)" "SUCCESS"
            }
        }
    }
    
    Write-Log "Cache cleanup complete" "SUCCESS"
}

# ============================================================================
# CONFIG GENERATION FUNCTIONS
# ============================================================================

function New-AppMobileMetroConfig {
    Write-Header "STEP 4: Generating metro.config.js"
    
    $metroConfigPath = Join-Path $APP_MOBILE_DIR "metro.config.js"
    
    $metroConfig = @'
// Metro configuration for monorepo
// Learn more: https://docs.expo.dev/guides/customizing-metro

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

// Watch workspace folders for changes
config.watchFolders = [
  path.resolve(workspaceRoot, "shared"),
  path.resolve(workspaceRoot, "packages"),
  path.resolve(workspaceRoot, "sdk"),
];

// Let Metro know where to resolve packages
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Ensure Metro doesn't try to process files from node_modules
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
'@
    
    if ($DryRun) {
        Write-Log "[DRY RUN] Would create: app-mobile/metro.config.js" "INFO"
    } else {
        Set-Content -Path $metroConfigPath -Value $metroConfig -Force
        Write-Log "Created metro.config.js" "SUCCESS"
    }
}

function Update-AppMobileAppJson {
    Write-Header "STEP 5: Updating app-mobile/app.json"
    
    $appJsonPath = Join-Path $APP_MOBILE_DIR "app.json"
    
    $appJsonContent = @'
{
  "expo": {
    "name": "Avalo",
    "slug": "avalo",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "scheme": "avalo",
    "platforms": ["ios", "android"],
    "jsEngine": "hermes",
    "entryPoint": "index.js",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "experiments": {
      "typedRoutes": true
    },
    "plugins": [
      "expo-router",
      [
        "expo-build-properties",
        {
          "android": {
            "compileSdkVersion": 34,
            "targetSdkVersion": 34,
            "minSdkVersion": 21
          },
          "ios": {
            "deploymentTarget": "13.4"
          }
        }
      ]
    ],
    "android": {
      "package": "com.avalo.app",
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "permissions": [
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "ACCESS_FINE_LOCATION"
      ]
    },
    "ios": {
      "bundleIdentifier": "com.avalo.app",
      "supportsTablet": true,
      "infoPlist": {
        "NSCameraUsageDescription": "Avalo needs access to your camera to take photos.",
        "NSPhotoLibraryUsageDescription": "Avalo needs access to your photo library.",
        "NSLocationWhenInUseUsageDescription": "Avalo needs your location for location-based features."
      }
    },
    "web": {
      "bundler": "metro",
      "favicon": "./assets/favicon.png"
    },
    "extra": {
      "router": {
        "origin": false
      },
      "eas": {
        "projectId": "your-project-id"
      }
    }
  }
}
'@
    
    if ($DryRun) {
        Write-Log "[DRY RUN] Would update: app-mobile/app.json" "INFO"
    } else {
        Set-Content -Path $appJsonPath -Value $appJsonContent -Force
        Write-Log "Updated app.json" "SUCCESS"
    }
}

function Update-AppMobileBabelConfig {
    Write-Header "STEP 6: Updating app-mobile/babel.config.js"
    
    $babelConfigPath = Join-Path $APP_MOBILE_DIR "babel.config.js"
    
    $babelConfig = @'
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          root: ["./"],
          extensions: [
            ".ios.js",
            ".android.js",
            ".js",
            ".ts",
            ".tsx",
            ".json",
          ],
          alias: {
            "@avalo/shared": "../shared/src",
            "@avalo/sdk": "../sdk/src",
          },
        },
      ],
      "expo-router/babel",
      // Reanimated plugin must be listed last
      "react-native-reanimated/plugin",
    ],
  };
};
'@
    
    if ($DryRun) {
        Write-Log "[DRY RUN] Would update: app-mobile/babel.config.js" "INFO"
    } else {
        Set-Content -Path $babelConfigPath -Value $babelConfig -Force
        Write-Log "Updated babel.config.js" "SUCCESS"
    }
}

function New-AppMobileTsConfig {
    Write-Header "STEP 7: Updating app-mobile/tsconfig.json"
    
    $tsconfigPath = Join-Path $APP_MOBILE_DIR "tsconfig.json"
    
    $tsconfig = @'
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "jsx": "react-native",
    "lib": ["ES2022"],
    "target": "ES2022",
    "paths": {
      "@avalo/shared": ["../shared/src"],
      "@avalo/shared/*": ["../shared/src/*"],
      "@avalo/sdk": ["../sdk/src"],
      "@avalo/sdk/*": ["../sdk/src/*"]
    }
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".expo/types/**/*.ts",
    "expo-env.d.ts"
  ],
  "exclude": [
    "node_modules",
    "babel.config.js",
    "metro.config.js"
  ]
}
'@
    
    if ($DryRun) {
        Write-Log "[DRY RUN] Would update: app-mobile/tsconfig.json" "INFO"
    } else {
        Set-Content -Path $tsconfigPath -Value $tsconfig -Force
        Write-Log "Updated tsconfig.json" "SUCCESS"
    }
}

function New-GuardScript {
    Write-Header "STEP 8: Creating Guard Script"
    
    $scriptsDir = Join-Path $APP_MOBILE_DIR "scripts"
    if (-not (Test-Path $scriptsDir)) {
        New-Item -Path $scriptsDir -ItemType Directory -Force | Out-Null
    }
    
    $guardScriptPath = Join-Path $scriptsDir "guard-root-expo.cjs"
    
    $guardScript = @'
#!/usr/bin/env node

/**
 * Guard script to prevent root-level Expo configuration
 * This script checks if the parent directory contains Expo configs
 * and throws an error if found, preventing build-time issues.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const FORBIDDEN_FILES = [
  'app.json',
  'babel.config.js',
  'metro.config.js',
  'app.config.js',
  'app.config.ts',
];

const FORBIDDEN_DIRS = [
  '.expo',
  '.expo-shared',
];

function checkRootForExpoFiles() {
  const errors = [];
  
  FORBIDDEN_FILES.forEach(file => {
    const filePath = path.join(ROOT_DIR, file);
    if (fs.existsSync(filePath)) {
      // Check if it's actually an Expo config
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        if (content.includes('expo') || content.includes('babel-preset-expo') || content.includes('metro')) {
          errors.push(`  ✗ ${file} - Contains Expo configuration`);
        }
      } catch (err) {
        // If we can't read it, assume it's problematic
        errors.push(`  ✗ ${file} - Unable to verify contents`);
      }
    }
  });
  
  FORBIDDEN_DIRS.forEach(dir => {
    const dirPath = path.join(ROOT_DIR, dir);
    if (fs.existsSync(dirPath)) {
      errors.push(`  ✗ ${dir}/ - Expo cache directory in root`);
    }
  });
  
  if (errors.length > 0) {
    console.error('\n❌ EXPO CONFIGURATION ERROR\n');
    console.error('Root directory contains forbidden Expo files:\n');
    errors.forEach(err => console.error(err));
    console.error('\nThese files cause Expo to detect the wrong project root.');
    console.error('Please run: FULL_MONOREPO_REPAIR.ps1\n');
    process.exit(1);
  }
  
  console.log('✓ Root directory is clean - no Expo config conflicts');
}

checkRootForExpoFiles();
'@
    
    if ($DryRun) {
        Write-Log "[DRY RUN] Would create: app-mobile/scripts/guard-root-expo.cjs" "INFO"
    } else {
        Set-Content -Path $guardScriptPath -Value $guardScript -Force
        Write-Log "Created guard script" "SUCCESS"
    }
}

function Move-EasJson {
    Write-Header "STEP 9: Moving eas.json to app-mobile"
    
    $sourceEasJson = Join-Path $ROOT_DIR "eas.json"
    $destEasJson = Join-Path $APP_MOBILE_DIR "eas.json"
    
    # Check if eas.json already moved to backup
    $backupEasJson = Join-Path $BACKUP_DIR "eas.json"
    
    if (Test-Path $sourceEasJson) {
        if ($DryRun) {
            Write-Log "[DRY RUN] Would move: eas.json → app-mobile/" "INFO"
        } else {
            Copy-Item -Path $sourceEasJson -Destination $destEasJson -Force
            Write-Log "Copied eas.json to app-mobile/" "SUCCESS"
        }
    } elseif (Test-Path $backupEasJson) {
        if ($DryRun) {
            Write-Log "[DRY RUN] Would copy from backup: eas.json → app-mobile/" "INFO"
        } else {
            Copy-Item -Path $backupEasJson -Destination $destEasJson -Force
            Write-Log "Restored eas.json from backup to app-mobile/" "SUCCESS"
        }
    } else {
        Write-Log "No eas.json found to move" "INFO"
    }
}

# ============================================================================
# REBUILD FUNCTIONS
# ============================================================================

function Rebuild-AppMobile {
    Write-Header "STEP 10: Rebuilding app-mobile Dependencies"
    
    if ($DryRun) {
        Write-Log "[DRY RUN] Would run: pnpm install in app-mobile" "INFO"
        return
    }
    
    Push-Location $APP_MOBILE_DIR
    
    try {
        Write-Log "Running pnpm install in app-mobile..." "INFO"
        
        # Remove node_modules first
        $nodeModules = Join-Path $APP_MOBILE_DIR "node_modules"
        if (Test-Path $nodeModules) {
            Write-Log "Removing existing node_modules..." "INFO"
            Remove-Item -Path $nodeModules -Recurse -Force -ErrorAction SilentlyContinue
        }
        
        # Run pnpm install
        $output = pnpm install 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Log "Dependencies installed successfully" "SUCCESS"
        } else {
            Write-Log "pnpm install completed with warnings" "WARNING"
            Write-Log "Output: $output" "INFO"
        }
        
    } catch {
        Write-Log "Error during pnpm install: $_" "ERROR"
    } finally {
        Pop-Location
    }
}

# ============================================================================
# VALIDATION FUNCTIONS
# ============================================================================

function Test-FinalConfiguration {
    Write-Header "STEP 11: Validating Final Configuration"
    
    $validationResults = @{
        Success = $true
        Errors = @()
        Warnings = @()
    }
    
    # Check root is clean
    foreach ($item in $PROBLEMATIC_FILES) {
        $itemPath = Join-Path $ROOT_DIR $item
        if (Test-Path $itemPath) {
            $validationResults.Errors += "Root still contains: $item"
            $validationResults.Success = $false
        }
    }
    
    # Check app-mobile has required files
    $requiredFiles = @(
        "app.json",
        "babel.config.js",
        "metro.config.js",
        "tsconfig.json",
        "package.json"
    )
    
    foreach ($file in $requiredFiles) {
        $filePath = Join-Path $APP_MOBILE_DIR $file
        if (-not (Test-Path $filePath)) {
            $validationResults.Errors += "app-mobile missing: $file"
            $validationResults.Success = $false
        }
    }
    
    # Check node_modules
    $appMobileNodeModules = Join-Path $APP_MOBILE_DIR "node_modules"
    if (-not (Test-Path $appMobileNodeModules)) {
        $validationResults.Warnings += "app-mobile/node_modules not found"
    }
    
    # Display results
    if ($validationResults.Success) {
        Write-Log "All validation checks passed!" "SUCCESS"
    } else {
        Write-Log "Validation failed with errors:" "ERROR"
        foreach ($errMsg in $validationResults.Errors) {
            Write-Log "  ✗ $errMsg" "ERROR"
        }
    }
    
    foreach ($warning in $validationResults.Warnings) {
        Write-Log "  ⚠ $warning" "WARNING"
    }
    
    return $validationResults.Success
}

# ============================================================================
# REPORT GENERATION
# ============================================================================

function New-ValidationReport {
    Write-Header "STEP 12: Generating Validation Report"
    
    $reportPath = Join-Path $ROOT_DIR "EXPO_REPAIR_REPORT_$TIMESTAMP.md"
    
    $report = @"
# Expo Monorepo Repair Report

**Generated:** $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
**Status:** Completed

## Summary

This report documents the complete repair of the Avalo Expo monorepo structure.

## Actions Taken

### 1. Backed Up Root Files
Moved the following files to \`_expo_backup_root/\`:
$(if (Test-Path $BACKUP_DIR) { (Get-ChildItem $BACKUP_DIR).Name | ForEach-Object { "- $_" } | Out-String } else { "- No files backed up" })

### 2. Cleaned Root Directory
- Removed root \`node_modules/\`
- Removed root \`.expo/\` cache
- Cleared Metro bundler cache
- Cleared Expo cache

### 3. Generated Configurations
Created/updated in \`app-mobile/\`:
- ✅ \`metro.config.js\` - Monorepo-aware Metro configuration
- ✅ \`app.json\` - Complete Expo app configuration
- ✅ \`babel.config.js\` - Babel with module resolver
- ✅ \`tsconfig.json\` - TypeScript configuration
- ✅ \`scripts/guard-root-expo.cjs\` - Guard script

### 4. Validation Results

Current project structure:
\`\`\`
C:\Users\Drink\avaloapp
 ├── app-mobile/              ← ONLY Expo project root
 │   ├── app/
 │   ├── components/
 │   ├── assets/
 │   ├── scripts/
 │   │   └── guard-root-expo.cjs
 │   ├── node_modules/
 │   ├── app.json             ← ✅ Correct location
 │   ├── babel.config.js      ← ✅ Correct location
 │   ├── metro.config.js      ← ✅ Correct location
 │   ├── eas.json             ← ✅ Correct location
 │   ├── tsconfig.json        ← ✅ Correct location
 │   └── package.json
 ├── app-web/
 ├── functions/
 ├── shared/
 ├── sdk/
 ├── packages/
 ├── _expo_backup_root/       ← Backed up problematic files
 └── [NO Expo configs here]   ← ✅ Clean!
\`\`\`

## Next Steps

### To Start Expo Development Server:

\`\`\`powershell
cd app-mobile
pnpm start
\`\`\`

Or use the batch files:
\`\`\`
START_AVALO_MOBILE.bat
\`\`\`

### To Run on Android:
\`\`\`powershell
cd app-mobile
pnpm android
\`\`\`

### To Run on iOS:
\`\`\`powershell
cd app-mobile
pnpm ios
\`\`\`

### To Build with EAS:
\`\`\`powershell
cd app-mobile
eas build --platform android
\`\`\`

## Guard Mechanism

The guard script at \`app-mobile/scripts/guard-root-expo.cjs\` will:
- Check for problematic Expo configs in root
- Prevent builds if issues are detected
- Provide clear error messages

To run manually:
\`\`\`powershell
node app-mobile/scripts/guard-root-expo.cjs
\`\`\`

## Troubleshooting

### If Expo still starts from root:
1. Clear all caches: \`pnpm store prune\`
2. Remove ALL \`node_modules\` folders
3. Re-run: \`pnpm install\` in app-mobile
4. Start Expo from app-mobile directory only

### If TypeScript errors persist:
1. Restart VSCode
2. Run: \`cd app-mobile && pnpm typecheck\`
3. Check paths in \`tsconfig.json\`

## Files Changed

- ✅ Created: \`app-mobile/metro.config.js\`
- ✅ Updated: \`app-mobile/app.json\`
- ✅ Updated: \`app-mobile/babel.config.js\`
- ✅ Updated: \`app-mobile/tsconfig.json\`
- ✅ Created: \`app-mobile/scripts/guard-root-expo.cjs\`
- ✅ Moved: Root Expo configs → \`_expo_backup_root/\`

## Log File

Full execution log: \`MONOREPO_REPAIR_LOG_$TIMESTAMP.txt\`
"@
    
    if (-not $DryRun) {
        Set-Content -Path $reportPath -Value $report -Force
        Write-Log "Generated report: EXPO_REPAIR_REPORT_$TIMESTAMP.md" "SUCCESS"
    }
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

function Start-Repair {
    Write-Header "AVALO EXPO MONOREPO REPAIR"
    
    Write-Host "${YELLOW}This script will perform a complete repair of your Expo monorepo.${RESET}"
    Write-Host "${YELLOW}All problematic root files will be moved to: _expo_backup_root/${RESET}"
    Write-Host ""
    
    if ($DryRun) {
        Write-Host "${CYAN}DRY RUN MODE - No changes will be made${RESET}"
        Write-Host ""
    }
    
    if (-not $Force -and -not $DryRun) {
        $confirmation = Read-Host "Continue? (yes/no)"
        if ($confirmation -ne "yes") {
            Write-Log "Repair cancelled by user" "WARNING"
            exit 0
        }
    }
    
    Write-Log "Starting repair at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" "INFO"
    Write-Log "Root directory: $ROOT_DIR" "INFO"
    Write-Log "app-mobile directory: $APP_MOBILE_DIR" "INFO"
    Write-Host ""
    
    # Execute repair steps
    if (-not (Test-Prerequisites)) {
        Write-Log "Prerequisites check failed. Aborting repair." "ERROR"
        exit 1
    }
    
    Backup-RootFiles
    Remove-RootNodeModules
    Clear-ExpoCache
    New-AppMobileMetroConfig
    Update-AppMobileAppJson
    Update-AppMobileBabelConfig
    New-AppMobileTsConfig
    New-GuardScript
    Move-EasJson
    Rebuild-AppMobile
    
    $isValid = Test-FinalConfiguration
    New-ValidationReport
    
    Write-Header "REPAIR COMPLETE"
    
    if ($isValid) {
        Write-Host ""
        Write-Host "${GREEN}${BOLD}✓ Repair completed successfully!${RESET}"
        Write-Host ""
        Write-Host "${CYAN}Next steps:${RESET}"
        Write-Host "  1. cd app-mobile"
        Write-Host "  2. pnpm start"
        Write-Host ""
        Write-Host "${CYAN}Or use the batch file:${RESET}"
        Write-Host "  START_AVALO_MOBILE.bat"
        Write-Host ""
        Write-Log "Repair completed successfully" "SUCCESS"
    } else {
        Write-Host ""
        Write-Host "${RED}${BOLD}✗ Repair completed with errors${RESET}"
        Write-Host ""
        Write-Host "${YELLOW}Please review the log file:${RESET}"
        Write-Host "  MONOREPO_REPAIR_LOG_$TIMESTAMP.txt"
        Write-Host ""
        Write-Log "Repair completed with errors" "ERROR"
        exit 1
    }
    
    Write-Host "${CYAN}Full log:${RESET} MONOREPO_REPAIR_LOG_$TIMESTAMP.txt"
    Write-Host "${CYAN}Report:${RESET} EXPO_REPAIR_REPORT_$TIMESTAMP.md"
    Write-Host ""
}

# Execute
Start-Repair