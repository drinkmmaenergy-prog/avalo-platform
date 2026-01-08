# 🚀 Quick Start: Expo Monorepo Fix

## The Problem
```
TypeError: Invalid URL
    at createCorsMiddleware (...)
```

Expo CLI loads configuration from **wrong directory** (root) instead of `app-mobile/`.

---

## ⚡ Quick Fix (30 seconds)

### Windows - Option 1 (Easiest)
```batch
.\fix-expo-monorepo.bat
```

### Windows - Option 2 (PowerShell)
```powershell
pwsh ./fix-expo-monorepo-permanent.ps1
```

### Want to Preview First?
```powershell
pwsh ./fix-expo-monorepo-permanent.ps1 -DryRun -Verbose
```

---

## ✅ What Gets Fixed

| Issue | Before | After |
|-------|--------|-------|
| Root `app.json` | ❌ Exists | ✅ Removed |
| Root `babel.config.js` | ❌ Exists | ✅ Removed |
| Root `metro.config.js` | ❌ May exist | ✅ Removed |
| `app-mobile/metro.config.js` | ❌ Missing | ✅ Created |
| `.expo` caches | ❌ Corrupted | ✅ Cleaned |
| Dependencies | ❌ Broken | ✅ Reinstalled |
| Guard script | ❌ None | ✅ Installed |

---

## 🎯 After Fix

### Start Expo (No More Errors!)
```powershell
cd app-mobile
expo start
```

### Verify Fix
```powershell
cd app-mobile
npm run guard
```
Should output: ✅ `No problematic Expo configs in parent directory`

---

## 📁 Correct Structure

```
avaloapp/              ← NO expo configs here!
└── app-mobile/        ← Expo project root ✅
    ├── app/
    ├── package.json   ✅
    ├── app.json       ✅
    ├── babel.config.js ✅
    ├── metro.config.js ✅
    └── index.js       ✅
```

---

## 🛡️ Protection

Guard script now prevents future issues:
```powershell
cd app-mobile
npm run guard  # Checks for problems
npm start      # Auto-runs guard first
```

---

## 📖 Full Documentation

See [`EXPO_MONOREPO_FIX_GUIDE.md`](EXPO_MONOREPO_FIX_GUIDE.md) for:
- Detailed explanation
- Troubleshooting guide
- Manual verification steps
- CI/CD integration

---

## ⚠️ Troubleshooting

### Issue: Script won't run
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Issue: Error still persists
```powershell
# Clear global cache
npx expo start --clear

# Restart VS Code
# Re-run fix
pwsh ./fix-expo-monorepo-permanent.ps1
```

---

## 💾 Backup

Created automatically at: `.expo-backup-YYYYMMDD-HHMMSS/`

To restore:
```powershell
Copy-Item .\.expo-backup-*\* . -Force
```

---

**This fix is permanent. The guard script prevents future issues.**

Run time: ~2-5 minutes (depending on `npm install`)