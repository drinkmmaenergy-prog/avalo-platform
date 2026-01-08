# Expo Monorepo Repair Guide

## 🚨 Problem Summary

Your Expo React Native app was experiencing a critical issue where Expo CLI started from the **wrong directory** (root instead of `app-mobile/`), causing:

```
TypeError: Invalid URL
    at createCorsMiddleware ...
```

## 🔍 Root Causes Identified

### 1. **Root Directory Expo Contamination**
The following files in `C:\Users\Drink\avaloapp\` caused Expo to misidentify the project root:

- ❌ `app.json` - Made Expo think root is a project
- ❌ `babel.config.js` - Conflicted with Expo Router
- ❌ `eas.json` - Forced workspace detection
- ❌ `.expo/` - Cache directory in wrong location
- ❌ `node_modules/` - Package resolution conflicts
- ❌ `.env` - Environment variables loaded incorrectly

### 2. **Metro Bundler Confusion**
Metro couldn't determine the correct project root, leading to:
- Invalid URLs in CORS middleware
- Module resolution failures
- Development server crashes

### 3. **TypeScript Resolution Issues**
VSCode couldn't resolve types correctly because:
- Root `tsconfig.json` overrode app-mobile settings
- Duplicate package installations
- Path mapping conflicts

## ✅ The Complete Solution

### Automated Repair Script

We've created **`FULL_MONOREPO_REPAIR.ps1`** - a comprehensive, one-shot fix that:

1. ✅ Backs up all problematic root files to `_expo_backup_root/`
2. ✅ Removes root `node_modules/`
3. ✅ Clears all Expo and Metro caches
4. ✅ Regenerates correct configurations in `app-mobile/`
5. ✅ Rebuilds dependencies properly
6. ✅ Validates the final setup
7. ✅ Generates detailed reports

### What Gets Fixed

#### Before (Broken):
```
C:\Users\Drink\avaloapp
 ├── app.json              ← ❌ WRONG! Expo config in root
 ├── babel.config.js       ← ❌ WRONG! Babel in root
 ├── eas.json              ← ❌ WRONG! EAS in root
 ├── .expo/                ← ❌ WRONG! Cache in root
 ├── node_modules/         ← ❌ WRONG! Packages in root
 └── app-mobile/
     ├── app.json          ← ✅ Correct but overridden
     └── ...
```

#### After (Fixed):
```
C:\Users\Drink\avaloapp
 ├── _expo_backup_root/    ← ✅ Backed up problematic files
 │   ├── app.json
 │   ├── babel.config.js
 │   └── eas.json
 ├── pnpm-workspace.yaml   ← ✅ Workspace config only
 ├── tsconfig.base.json    ← ✅ Base TS config
 └── app-mobile/           ← ✅ ONLY Expo project root
     ├── app/
     ├── components/
     ├── scripts/
     │   └── guard-root-expo.cjs  ← ✅ Prevention mechanism
     ├── node_modules/     ← ✅ Local packages
     ├── app.json          ← ✅ Complete Expo config
     ├── babel.config.js   ← ✅ With module resolver
     ├── metro.config.js   ← ✅ Monorepo-aware
     ├── eas.json          ← ✅ Build configuration
     ├── tsconfig.json     ← ✅ TS with path mapping
     └── package.json
```

## 🚀 How to Run the Repair

### Step 1: Run the Repair Script

**Option A: Interactive Mode (Recommended)**
```powershell
.\FULL_MONOREPO_REPAIR.ps1
```

**Option B: Force Mode (No Confirmation)**
```powershell
.\FULL_MONOREPO_REPAIR.ps1 -Force
```

**Option C: Dry Run (Preview Changes)**
```powershell
.\FULL_MONOREPO_REPAIR.ps1 -DryRun
```

### Step 2: Review the Results

The script generates:
- ✅ `MONOREPO_REPAIR_LOG_[timestamp].txt` - Full execution log
- ✅ `EXPO_REPAIR_REPORT_[timestamp].md` - Detailed report
- ✅ `_expo_backup_root/` - Backup of moved files

### Step 3: Start Expo

```powershell
cd app-mobile
pnpm start
```

Or use the batch file:
```powershell
.\START_AVALO_MOBILE.bat
```

## 📋 Generated Configuration Files

### 1. `app-mobile/metro.config.js`

Monorepo-aware Metro configuration that:
- Watches workspace folders (`shared/`, `packages/`, `sdk/`)
- Resolves node_modules from both local and workspace
- Prevents hierarchical lookup issues

```javascript
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  path.resolve(workspaceRoot, "shared"),
  path.resolve(workspaceRoot, "packages"),
  path.resolve(workspaceRoot, "sdk"),
];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
```

### 2. `app-mobile/app.json`

Complete Expo configuration with:
- ✅ Proper scheme configuration
- ✅ Platform-specific settings
- ✅ Hermes engine enabled
- ✅ Expo Router integration
- ✅ Build properties for iOS/Android

### 3. `app-mobile/babel.config.js`

Babel configuration with:
- ✅ `babel-preset-expo`
- ✅ Module resolver for workspace packages
- ✅ `expo-router/babel` plugin
- ✅ `react-native-reanimated/plugin` (must be last)

### 4. `app-mobile/tsconfig.json`

TypeScript configuration with:
- ✅ Extends `expo/tsconfig.base`
- ✅ Path mappings for `@avalo/shared` and `@avalo/sdk`
- ✅ Strict mode enabled
- ✅ Proper module resolution

### 5. `app-mobile/scripts/guard-root-expo.cjs`

Prevention mechanism that:
- ✅ Checks for problematic files in root
- ✅ Validates app-mobile configuration
- ✅ Prevents builds if issues detected
- ✅ Provides clear error messages

## 🛡️ Prevention Mechanism

The guard script runs automatically before starting Expo (if added to package.json):

```json
{
  "scripts": {
    "prestart": "node scripts/guard-root-expo.cjs",
    "start": "expo start"
  }
}
```

It will:
1. Check root directory for forbidden Expo files
2. Verify app-mobile has required files
3. Block execution if issues found
4. Provide fix instructions

## 🔧 Troubleshooting

### Issue: Expo Still Starts from Root

**Solution:**
```powershell
# Clear all caches
pnpm store prune

# Remove all node_modules
Remove-Item -Recurse -Force node_modules
Remove-Item -Recurse -Force app-mobile/node_modules

# Reinstall in app-mobile only
cd app-mobile
pnpm install

# Start Expo
pnpm start
```

### Issue: TypeScript Errors Persist

**Solution:**
```powershell
# Restart VSCode TypeScript server
# Press: Ctrl+Shift+P
# Type: TypeScript: Restart TS Server

# Or run typecheck
cd app-mobile
pnpm typecheck
```

### Issue: Metro Bundler Cache Issues

**Solution:**
```powershell
# Clear Metro cache
cd app-mobile
pnpm start --clear
```

### Issue: Module Not Found Errors

**Solution:**
```powershell
# Verify metro.config.js exists
cat app-mobile/metro.config.js

# Check watchFolders paths are correct
# Ensure shared/, packages/, sdk/ exist

# Rebuild
cd app-mobile
pnpm install
```

## 📱 Running the App

### Development Server
```powershell
cd app-mobile
pnpm start
```

### Android
```powershell
cd app-mobile
pnpm android
```

### iOS
```powershell
cd app-mobile
pnpm ios
```

### Web
```powershell
cd app-mobile
pnpm web
```

## 🏗️ Building with EAS

### Development Build
```powershell
cd app-mobile
eas build --profile development --platform android
```

### Preview Build
```powershell
cd app-mobile
eas build --profile preview --platform all
```

### Production Build
```powershell
cd app-mobile
eas build --profile production --platform all
```

## 📊 Validation Checklist

After running the repair, verify:

- [ ] Root directory has NO `app.json`
- [ ] Root directory has NO `babel.config.js`
- [ ] Root directory has NO `.expo/` folder
- [ ] Root directory has NO `node_modules/`
- [ ] `app-mobile/app.json` exists and is valid
- [ ] `app-mobile/babel.config.js` exists
- [ ] `app-mobile/metro.config.js` exists
- [ ] `app-mobile/tsconfig.json` exists
- [ ] `app-mobile/node_modules/` exists
- [ ] `app-mobile/scripts/guard-root-expo.cjs` exists
- [ ] Expo starts without "Invalid URL" error
- [ ] Metro bundler runs successfully
- [ ] TypeScript has no errors

## 🎯 Key Commands Reference

```powershell
# Run the repair
.\FULL_MONOREPO_REPAIR.ps1

# Run guard check manually
node app-mobile/scripts/guard-root-expo.cjs

# Start Expo (from app-mobile)
cd app-mobile
pnpm start

# Start with cache clear
cd app-mobile
pnpm start --clear

# Type check
cd app-mobile
pnpm typecheck

# Build for development
cd app-mobile
eas build --profile development

# View logs
Get-Content MONOREPO_REPAIR_LOG_*.txt

# Restore from backup (if needed)
Copy-Item -Recurse _expo_backup_root/* .
```

## 📝 What the Script Does NOT Touch

The repair script is safe and does NOT modify:

- ✅ Your app source code in `app-mobile/app/`
- ✅ Your components in `app-mobile/components/`
- ✅ Your assets in `app-mobile/assets/`
- ✅ Other workspace packages (`app-web/`, `functions/`, etc.)
- ✅ Your git repository
- ✅ Firebase configuration
- ✅ Environment variables (except moving root `.env` if problematic)

## 🔒 Safety Features

1. **Backup First**: All removed files are backed up to `_expo_backup_root/`
2. **Dry Run Mode**: Preview changes with `-DryRun` flag
3. **Confirmation Prompt**: Requires "yes" to proceed (unless `-Force`)
4. **Detailed Logging**: Everything logged to timestamped file
5. **Validation**: Checks prerequisites before starting
6. **Rollback Info**: Can restore from backup if needed

## 📞 Support

If the repair doesn't fix your issue:

1. Check the log file: `MONOREPO_REPAIR_LOG_[timestamp].txt`
2. Review the report: `EXPO_REPAIR_REPORT_[timestamp].md`
3. Run guard script: `node app-mobile/scripts/guard-root-expo.cjs`
4. Check [Expo Documentation](https://docs.expo.dev/)
5. Review [Metro Configuration Guide](https://docs.expo.dev/guides/customizing-metro/)

## 🎉 Success Indicators

You'll know the repair worked when:

1. ✅ Expo starts without "Invalid URL" error
2. ✅ Metro bundler connects successfully
3. ✅ No TypeScript errors in VSCode
4. ✅ App loads on device/simulator
5. ✅ Hot reload works correctly
6. ✅ Guard script passes all checks

---

**Last Updated:** 2025-11-11  
**Version:** 1.0.0  
**Script:** FULL_MONOREPO_REPAIR.ps1