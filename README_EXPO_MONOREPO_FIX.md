# 🚀 Expo Monorepo Complete Repair Solution

## 📋 Overview

This is a **complete, automated, one-shot repair solution** for fixing Expo CLI detection issues in the Avalo monorepo. The problem was that Expo was starting from the wrong directory (root instead of `app-mobile/`), causing the fatal error:

```
TypeError: Invalid URL
    at createCorsMiddleware ...
```

## 🎯 What This Solution Includes

### 1. Main Repair Script
**`FULL_MONOREPO_REPAIR.ps1`** - Comprehensive PowerShell script that:
- ✅ Backs up all problematic root files to `_expo_backup_root/`
- ✅ Removes root `node_modules/` and caches
- ✅ Clears all Expo and Metro caches
- ✅ Regenerates correct configurations in `app-mobile/`
- ✅ Rebuilds dependencies properly
- ✅ Validates the final setup
- ✅ Generates detailed reports

### 2. Configuration Files
All generated/updated in `app-mobile/`:
- ✅ **`metro.config.js`** - Monorepo-aware Metro bundler config
- ✅ **`app.json`** - Complete Expo app configuration
- ✅ **`babel.config.js`** - Babel with module resolver
- ✅ **`tsconfig.json`** - TypeScript with path mappings
- ✅ **`eas.json`** - EAS Build configuration (moved from root)

### 3. Guard Mechanism
**`app-mobile/scripts/guard-root-expo.cjs`** - Prevention script that:
- ✅ Detects problematic files in root before build
- ✅ Validates app-mobile configuration
- ✅ Provides clear error messages
- ✅ Prevents future issues

### 4. Validation Script
**`VALIDATE_EXPO_SETUP.ps1`** - Comprehensive validation that:
- ✅ Checks root directory is clean
- ✅ Verifies app-mobile has all required files
- ✅ Validates configuration files
- ✅ Runs guard script
- ✅ Provides detailed report

### 5. Documentation
- 📘 **`EXPO_MONOREPO_REPAIR_GUIDE.md`** - Complete detailed guide
- 🚀 **`EXPO_FIX_QUICK_START.md`** - Quick start instructions
- 📄 **`README_EXPO_MONOREPO_FIX.md`** - This file

## ⚡ Quick Start (3 Steps)

### Step 1: Run the Repair
```powershell
.\FULL_MONOREPO_REPAIR.ps1
```

### Step 2: Verify the Fix
```powershell
.\VALIDATE_EXPO_SETUP.ps1
```

### Step 3: Start Expo
```powershell
cd app-mobile
pnpm start
```

That's it! ✅

## 📖 Detailed Usage

### Running the Repair Script

#### Interactive Mode (Recommended)
```powershell
.\FULL_MONOREPO_REPAIR.ps1
```
- Asks for confirmation before proceeding
- Shows progress for each step
- Creates backup of all moved files
- Generates detailed reports

#### Force Mode (No Confirmation)
```powershell
.\FULL_MONOREPO_REPAIR.ps1 -Force
```
- Skips confirmation prompt
- Runs automatically
- Still creates backups

#### Dry Run Mode (Preview Changes)
```powershell
.\FULL_MONOREPO_REPAIR.ps1 -DryRun
```
- Shows what would be changed
- No actual modifications
- Safe to run anytime

#### Skip Backup Mode
```powershell
.\FULL_MONOREPO_REPAIR.ps1 -SkipBackup
```
- Doesn't create `_expo_backup_root/`
- Use only if you have other backups
- Not recommended for first run

### Running the Validation Script

```powershell
.\VALIDATE_EXPO_SETUP.ps1
```

This checks:
1. ✅ Root directory is clean (no Expo configs)
2. ✅ app-mobile has all required files
3. ✅ Metro config is correct
4. ✅ app.json is valid
5. ✅ Babel config is correct
6. ✅ TypeScript config is valid
7. ✅ Guard script passes

### Running the Guard Script Manually

```powershell
node app-mobile/scripts/guard-root-expo.cjs
```

Expected output when everything is correct:
```
🔍 Checking for Expo configuration conflicts...

✅ Root directory is clean - no Expo config conflicts
✅ app-mobile/ has all required files
✅ Ready to start Expo!
```

## 🗂️ File Structure Changes

### Before (Broken)
```
C:\Users\Drink\avaloapp\
├── app.json              ❌ Causes Expo to detect root as project
├── babel.config.js       ❌ Conflicts with Expo Router
├── eas.json              ❌ Forces workspace detection
├── metro.config.js       ❌ (if existed) Wrong bundler config
├── .expo/                ❌ Cache in wrong location
├── node_modules/         ❌ Package resolution conflicts
├── .env                  ❌ Variables loaded incorrectly
├── app-mobile/
│   ├── app/
│   ├── components/
│   ├── app.json          ✓ Correct but overridden by root
│   ├── babel.config.js   ✓ Correct but overridden by root
│   └── package.json
├── app-web/
├── functions/
├── shared/
├── sdk/
└── packages/
```

### After (Fixed)
```
C:\Users\Drink\avaloapp\
├── _expo_backup_root/         ✅ Backup of removed files
│   ├── app.json
│   ├── babel.config.js
│   ├── eas.json
│   └── ...
├── pnpm-workspace.yaml        ✅ Workspace config only
├── tsconfig.base.json         ✅ Base TypeScript config
├── package.json               ✅ Root workspace manifest
├── FULL_MONOREPO_REPAIR.ps1   ✅ Repair script
├── VALIDATE_EXPO_SETUP.ps1    ✅ Validation script
├── EXPO_MONOREPO_REPAIR_GUIDE.md
├── EXPO_FIX_QUICK_START.md
├── README_EXPO_MONOREPO_FIX.md
├── app-mobile/                ✅ ONLY Expo project root
│   ├── app/
│   ├── components/
│   ├── assets/
│   ├── scripts/
│   │   └── guard-root-expo.cjs  ✅ Prevention mechanism
│   ├── node_modules/          ✅ Local packages only
│   ├── app.json               ✅ Complete Expo config
│   ├── babel.config.js        ✅ With module resolver
│   ├── metro.config.js        ✅ NEW! Monorepo-aware
│   ├── eas.json               ✅ Moved from root
│   ├── tsconfig.json          ✅ With path mappings
│   ├── package.json
│   └── index.js
├── app-web/
├── functions/
├── shared/
├── sdk/
└── packages/
```

## 🔧 What Gets Fixed

### 1. Root Directory Issues
- **Problem**: Expo configs in root made Expo detect wrong project root
- **Solution**: Moved to `_expo_backup_root/`, root is now clean

### 2. Metro Bundler Configuration
- **Problem**: No `metro.config.js` or wrong configuration
- **Solution**: Created monorepo-aware config with proper `watchFolders`

### 3. Package Resolution
- **Problem**: Root `node_modules` conflicted with app-mobile
- **Solution**: Removed root `node_modules`, packages only in app-mobile

### 4. TypeScript Errors
- **Problem**: Wrong path resolution, conflicting configs
- **Solution**: Updated `tsconfig.json` with correct path mappings

### 5. Cache Issues
- **Problem**: Stale caches from wrong project root
- **Solution**: Cleared all Expo and Metro caches

### 6. Babel Configuration
- **Problem**: Missing or wrong plugins, wrong order
- **Solution**: Regenerated with correct plugins in right order

## 📊 Generated Reports

After running the repair, you'll find:

### 1. Execution Log
**`MONOREPO_REPAIR_LOG_[timestamp].txt`**
- Complete log of all operations
- Success/failure status for each step
- Error messages if any issues occurred

### 2. Repair Report
**`EXPO_REPAIR_REPORT_[timestamp].md`**
- Summary of actions taken
- List of moved files
- Validation results
- Next steps and instructions

### 3. Backup Directory
**`_expo_backup_root/`**
- All removed files backed up here
- Can restore if needed
- Safe to delete after verification

## 🛡️ Safety Features

1. **Automatic Backup**: All removed files backed up before deletion
2. **Dry Run Mode**: Preview changes without modifying anything
3. **Confirmation Prompt**: Requires explicit "yes" to proceed
4. **Detailed Logging**: Everything logged with timestamps
5. **Validation**: Checks prerequisites and final state
6. **Rollback Capability**: Can restore from backup if needed

## 🔍 Troubleshooting

### Issue: Script Execution Policy Error
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Issue: Expo Still Starts from Wrong Directory
```powershell
# Clear everything
cd app-mobile
Remove-Item -Recurse -Force node_modules
pnpm install

# Start with cache clear
pnpm start --clear
```

### Issue: TypeScript Errors in VSCode
1. Press `Ctrl+Shift+P`
2. Type: `TypeScript: Restart TS Server`
3. Press Enter

### Issue: Metro Bundler Cache Issues
```powershell
cd app-mobile
pnpm start --reset-cache
```

### Issue: Module Not Found Errors
```powershell
# Verify metro.config.js exists
cat app-mobile/metro.config.js

# Rebuild
cd app-mobile
Remove-Item -Recurse -Force node_modules
pnpm install
```

## 📱 Development Commands

### Start Development Server
```powershell
cd app-mobile
pnpm start
```

### Run on Android
```powershell
cd app-mobile
pnpm android
```

### Run on iOS
```powershell
cd app-mobile
pnpm ios
```

### Run on Web
```powershell
cd app-mobile
pnpm web
```

### Type Check
```powershell
cd app-mobile
pnpm typecheck
```

### Clear Cache and Start
```powershell
cd app-mobile
pnpm start --clear
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

## 📋 Validation Checklist

After repair, verify:

- [ ] ✅ Root has NO `app.json`
- [ ] ✅ Root has NO `babel.config.js`
- [ ] ✅ Root has NO `.expo/` directory
- [ ] ✅ Root has NO `metro.config.js` (unless intentional)
- [ ] ✅ `app-mobile/app.json` exists and is valid
- [ ] ✅ `app-mobile/babel.config.js` exists
- [ ] ✅ `app-mobile/metro.config.js` exists
- [ ] ✅ `app-mobile/tsconfig.json` exists
- [ ] ✅ `app-mobile/node_modules/` exists
- [ ] ✅ `app-mobile/scripts/guard-root-expo.cjs` exists
- [ ] ✅ Expo starts without "Invalid URL" error
- [ ] ✅ Metro bundler runs successfully
- [ ] ✅ No TypeScript errors in VSCode
- [ ] ✅ Guard script passes validation
- [ ] ✅ Hot reload works correctly

## 🔄 Recovery / Rollback

If you need to undo the changes:

```powershell
# Restore from backup
Copy-Item -Recurse _expo_backup_root/* .

# Remove new metro.config.js if needed
Remove-Item app-mobile/metro.config.js

# Reinstall dependencies
cd app-mobile
Remove-Item -Recurse -Force node_modules
pnpm install
```

## 📚 Additional Resources

- [Expo Documentation](https://docs.expo.dev/)
- [Metro Bundler Guide](https://docs.expo.dev/guides/customizing-metro/)
- [Monorepo Configuration](https://docs.expo.dev/guides/monorepos/)
- [Expo Router Documentation](https://docs.expo.dev/router/introduction/)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)

## 🎯 Success Indicators

You'll know it worked when:

1. ✅ `VALIDATE_EXPO_SETUP.ps1` passes all checks
2. ✅ Expo starts without "Invalid URL" error
3. ✅ Metro bundler connects successfully
4. ✅ No TypeScript errors in VSCode
5. ✅ App loads on device/simulator
6. ✅ Hot reload works correctly
7. ✅ Guard script outputs: "Ready to start Expo!"

## 📞 Support

If issues persist after repair:

1. Check **`MONOREPO_REPAIR_LOG_[timestamp].txt`** for errors
2. Review **`EXPO_REPAIR_REPORT_[timestamp].md`** for details
3. Run **`VALIDATE_EXPO_SETUP.ps1`** for diagnostics
4. Run **`node app-mobile/scripts/guard-root-expo.cjs`** for validation
5. Check [EXPO_MONOREPO_REPAIR_GUIDE.md](./EXPO_MONOREPO_REPAIR_GUIDE.md) for detailed troubleshooting

## 📄 Files in This Solution

```
C:\Users\Drink\avaloapp\
├── FULL_MONOREPO_REPAIR.ps1           ← Main repair script
├── VALIDATE_EXPO_SETUP.ps1            ← Validation script
├── EXPO_MONOREPO_REPAIR_GUIDE.md      ← Complete guide
├── EXPO_FIX_QUICK_START.md            ← Quick start
├── README_EXPO_MONOREPO_FIX.md        ← This file
└── app-mobile/
    └── scripts/
        └── guard-root-expo.cjs        ← Guard mechanism
```

## 🚀 Ready to Fix?

```powershell
# 1. Run the repair
.\FULL_MONOREPO_REPAIR.ps1

# 2. Validate the fix
.\VALIDATE_EXPO_SETUP.ps1

# 3. Start Expo
cd app-mobile
pnpm start
```

---

**Version:** 1.0.0  
**Last Updated:** 2025-11-11  
**Status:** Production Ready ✅