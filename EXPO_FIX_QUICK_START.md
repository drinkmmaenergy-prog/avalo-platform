# 🚀 Expo Monorepo Fix - Quick Start

## The Problem
Expo is starting from the wrong directory (`C:\Users\Drink\avaloapp`) instead of `app-mobile/`, causing:
```
TypeError: Invalid URL at createCorsMiddleware
```

## The Solution (One Command)

```powershell
.\FULL_MONOREPO_REPAIR.ps1
```

That's it! This single command will:
1. ✅ Move all problematic root files to backup
2. ✅ Remove root node_modules
3. ✅ Clear all caches
4. ✅ Regenerate correct configs
5. ✅ Reinstall dependencies
6. ✅ Validate everything

## After Running the Fix

```powershell
cd app-mobile
pnpm start
```

## What This Fixes

### Before (Broken):
```
C:\Users\Drink\avaloapp\
├── app.json          ← ❌ Makes Expo confused
├── babel.config.js   ← ❌ Wrong location
├── eas.json          ← ❌ Wrong location
├── .expo/            ← ❌ Cache in wrong place
└── node_modules/     ← ❌ Package conflicts
```

### After (Fixed):
```
C:\Users\Drink\avaloapp\
├── _expo_backup_root/     ← ✅ Backup of removed files
└── app-mobile/            ← ✅ ONLY Expo project here
    ├── app.json           ← ✅ Correct location
    ├── babel.config.js    ← ✅ Correct location
    ├── metro.config.js    ← ✅ NEW! Monorepo config
    ├── eas.json           ← ✅ Correct location
    └── node_modules/      ← ✅ Local packages only
```

## Options

### Preview Changes (Safe)
```powershell
.\FULL_MONOREPO_REPAIR.ps1 -DryRun
```

### Skip Confirmation
```powershell
.\FULL_MONOREPO_REPAIR.ps1 -Force
```

### Skip Backup
```powershell
.\FULL_MONOREPO_REPAIR.ps1 -SkipBackup
```

## Verification

Run the guard script to check if everything is fixed:
```powershell
node app-mobile/scripts/guard-root-expo.cjs
```

Expected output:
```
✅ Root directory is clean - no Expo config conflicts
✅ app-mobile/ has all required files
✅ Ready to start Expo!
```

## Troubleshooting

### If Expo still fails:
```powershell
# Clear everything
cd app-mobile
Remove-Item -Recurse -Force node_modules
pnpm install

# Start with cache clear
pnpm start --clear
```

### If TypeScript errors persist:
- Press `Ctrl+Shift+P` in VSCode
- Type: `TypeScript: Restart TS Server`
- Press Enter

## Full Documentation

For detailed information, see:
- 📘 [`EXPO_MONOREPO_REPAIR_GUIDE.md`](./EXPO_MONOREPO_REPAIR_GUIDE.md) - Complete guide
- 📜 `MONOREPO_REPAIR_LOG_[timestamp].txt` - Execution log
- 📊 `EXPO_REPAIR_REPORT_[timestamp].md` - Detailed report

## Emergency Rollback

If something goes wrong, restore from backup:
```powershell
Copy-Item -Recurse _expo_backup_root\* .
```

---

**Ready?** Run: `.\FULL_MONOREPO_REPAIR.ps1`