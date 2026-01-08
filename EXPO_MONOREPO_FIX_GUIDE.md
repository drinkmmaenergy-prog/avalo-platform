# Expo Monorepo Configuration Fix - Complete Guide

## Problem Description

**Error:** `TypeError: Invalid URL at createCorsMiddleware`

**Root Cause:** Expo CLI in a monorepo context loads configuration from the **wrong directory** (parent root `C:\Users\Drink\avaloapp`) instead of the correct project folder (`C:\Users\Drink\avaloapp\app-mobile`).

This occurs when Expo configuration files exist in the parent directory, causing Expo to misidentify the project root.

---

## Files That Cause This Issue

The following files in the **root directory** confuse Expo CLI:

1. ❌ `app.json` - Full Expo configuration
2. ❌ `babel.config.js` - Contains babel-preset-expo
3. ❌ `metro.config.js` - Metro bundler configuration  
4. ❌ `app.config.js` / `app.config.ts` - Dynamic Expo config
5. ❌ `eas.json` - EAS Build configuration
6. ❌ `.expo` / `.expo-shared` - Cache directories

---

## Automated Solution

### Quick Fix (Recommended)

**Option 1: Run Batch File (Windows)**
```batch
.\fix-expo-monorepo.bat
```

**Option 2: Run PowerShell Script Directly**
```powershell
pwsh ./fix-expo-monorepo-permanent.ps1
```

**Option 3: Dry Run First (Preview Changes)**
```powershell
pwsh ./fix-expo-monorepo-permanent.ps1 -DryRun -Verbose
```

---

## What The Script Does

### Step 1: Analyze
- Scans root directory for problematic Expo config files
- Identifies cache directories that need cleaning
- Reports findings

### Step 2: Backup
- Creates timestamped backup folder: `.expo-backup-YYYYMMDD-HHMMSS`
- Backs up all problematic files before removal
- Ensures safe recovery if needed

### Step 3: Remove Problematic Files
Removes from root directory:
- `app.json`
- `babel.config.js`
- `metro.config.js`
- `eas.json`
- Any other Expo-related configs

### Step 4: Clean Caches
Cleans all Expo and Metro caches:
- `.expo`
- `.expo-shared`
- `node_modules/.cache`
- `app-mobile/.expo`
- `app-mobile/.cache`
- Watchman cache (if available)

### Step 5: Validate app-mobile Structure
Ensures correct structure in `app-mobile/`:
```
app-mobile/
├── app/              ← Expo Router directory
├── components/       ← React components
├── assets/          ← Images, fonts, etc.
├── scripts/         ← Guard and utility scripts
├── tools/           ← Development tools
├── package.json     ✅ Mobile dependencies
├── app.json         ✅ Expo configuration
├── babel.config.js  ✅ Babel configuration
├── metro.config.js  ✅ Metro bundler config
├── index.js         ✅ Entry point
├── eas.json         ✅ EAS Build config
└── tsconfig.json    ✅ TypeScript config
```

### Step 6: Create/Fix Metro Config
Creates proper `metro.config.js` in `app-mobile/` with:
- Force Metro to resolve from `app-mobile` directory ONLY
- Prevent walking up to parent directory
- Monorepo-safe configuration

### Step 7: Move EAS Config
- Moves `eas.json` from root to `app-mobile/` (if needed)
- Ensures EAS builds target correct directory

### Step 8: Reinstall Dependencies
- Removes old `node_modules`
- Clears lock files
- Fresh install in `app-mobile/`
- Detects package manager (pnpm/yarn/npm)

### Step 9: Install Guard Script
Creates `app-mobile/scripts/guard-expo-config.ps1`:
- Monitors parent directory for forbidden files
- Prevents accidental creation of Expo configs in root
- Integrated into `npm run guard` and `npm run prestart`

### Step 10: Validate Configuration
- Verifies Expo correctly identifies `app-mobile` as root
- Tests configuration with `expo config --json`
- Confirms no conflicts

### Step 11: Generate Report
Creates detailed markdown report with:
- Summary of actions taken
- Backup location
- Final folder structure
- Verification checklist
- Troubleshooting guide

---

## Manual Verification

After running the script, verify the fix:

### 1. Check Root Directory (Should Have NO Expo Configs)
```powershell
cd C:\Users\Drink\avaloapp
ls app.json, babel.config.js, metro.config.js, eas.json
# All should return "Cannot find path"
```

### 2. Check app-mobile Directory (Should Have ALL Configs)
```powershell
cd app-mobile
ls app.json, babel.config.js, metro.config.js, index.js
# All should exist
```

### 3. Run Guard Script
```powershell
cd app-mobile
npm run guard
# Should output: "✓ No problematic Expo configs in parent directory"
```

### 4. Start Expo
```powershell
cd app-mobile
expo start
# Should start Metro bundler WITHOUT "Invalid URL" error
```

---

## Final Folder Structure

```
C:\Users\Drink\avaloapp\                   ← ROOT (NO expo configs!)
│
├── package.json                           ← Monorepo root package
├── pnpm-workspace.yaml                   ← Workspace configuration
├── firebase.json                          ← Firebase config
├── .gitignore
├── .github/                               ← CI/CD workflows
│
├── functions/                             ← Firebase Cloud Functions
│   ├── src/
│   └── package.json
│
├── shared/                                ← Shared packages
│   ├── src/
│   └── package.json
│
├── sdk/                                   ← SDK packages
│   ├── src/
│   └── package.json
│
├── app-web/                               ← Next.js web app
│   ├── src/
│   ├── next.config.js
│   └── package.json
│
└── app-mobile/                            ← EXPO PROJECT ROOT ✅
    ├── app/                               ← Expo Router
    │   ├── (tabs)/
    │   ├── _layout.tsx
    │   └── index.tsx
    │
    ├── components/                        ← React components
    │   ├── ui/
    │   └── screens/
    │
    ├── assets/                            ← Images, fonts
    │   ├── icon.png
    │   └── splash.png
    │
    ├── scripts/                           ← Scripts
    │   └── guard-expo-config.ps1         ← Guard script ✅
    │
    ├── tools/                             ← Development tools
    │
    ├── android/                           ← Android native
    ├── ios/                               ← iOS native (if exists)
    │
    ├── node_modules/                      ← Dependencies
    │
    ├── package.json                       ✅ Mobile dependencies
    ├── app.json                           ✅ Expo configuration
    ├── babel.config.js                    ✅ Babel config
    ├── metro.config.js                    ✅ Metro config
    ├── index.js                           ✅ Entry point
    ├── eas.json                           ✅ EAS Build config
    ├── tsconfig.json                      ✅ TypeScript config
    └── .gitignore                         ✅ Git ignore
```

---

## Guard Mechanism

### Automatic Protection

The guard script runs automatically before `expo start`:

```json
{
  "scripts": {
    "guard": "pwsh ./scripts/guard-expo-config.ps1",
    "prestart": "npm run guard",
    "start": "expo start"
  }
}
```

### Manual Check Anytime
```powershell
cd app-mobile
npm run guard
```

### What It Does
- Scans parent directory for forbidden files
- Alerts if any Expo configs found in root
- Prevents accidental "Invalid URL" errors
- Exits with error code 1 if issues found

---

## Troubleshooting

### Issue: Script Execution Policy Error

**Error:** "cannot be loaded because running scripts is disabled"

**Fix:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Issue: "Invalid URL" Error Persists

**Causes:**
1. Global Expo cache not cleared
2. Hidden `.expo` folders still exist
3. VSCode terminal cached old environment

**Fix:**
```powershell
# 1. Clear global Expo cache
npx expo start --clear

# 2. Search for hidden .expo folders
Get-ChildItem -Path . -Filter ".expo" -Recurse -Directory -Force

# 3. Restart VS Code completely
# Close all terminals and restart VS Code

# 4. Re-run the fix script
pwsh ./fix-expo-monorepo-permanent.ps1
```

### Issue: Dependencies Installation Failed

**Fix:**
```powershell
cd app-mobile

# Remove everything
Remove-Item -Path node_modules -Recurse -Force
Remove-Item -Path package-lock.json -Force -ErrorAction SilentlyContinue
Remove-Item -Path yarn.lock -Force -ErrorAction SilentlyContinue
Remove-Item -Path pnpm-lock.yaml -Force -ErrorAction SilentlyContinue

# Clean pnpm store (if using pnpm)
pnpm store prune

# Reinstall
pnpm install
# or: npm install
# or: yarn install
```

### Issue: Metro Bundler Won't Start

**Fix:**
```powershell
cd app-mobile

# Kill all Node and Metro processes
taskkill /F /IM node.exe
taskkill /F /IM watchman.exe

# Clear all caches
npx expo start --clear

# Start fresh
expo start
```

### Issue: Need to Restore Backup

**Fix:**
```powershell
# Find your backup
ls .expo-backup-*

# Restore specific file
Copy-Item -Path .\.expo-backup-YYYYMMDD-HHMMSS\app.json -Destination .\ -Force

# Restore all files
Copy-Item -Path .\.expo-backup-YYYYMMDD-HHMMSS\* -Destination .\ -Force
```

---

## Testing the Fix

### Test 1: Verify No Root Configs
```powershell
cd C:\Users\Drink\avaloapp
Test-Path app.json          # Should be False
Test-Path babel.config.js   # Should be False
Test-Path metro.config.js   # Should be False
```

### Test 2: Verify app-mobile Configs
```powershell
cd app-mobile
Test-Path app.json          # Should be True
Test-Path babel.config.js   # Should be True
Test-Path metro.config.js   # Should be True
Test-Path index.js          # Should be True
```

### Test 3: Run Guard
```powershell
cd app-mobile
npm run guard
# Expected output: "✓ No problematic Expo configs in parent directory"
```

### Test 4: Start Expo
```powershell
cd app-mobile
expo start
# Should NOT show "Invalid URL" error
# Metro bundler should start successfully
```

### Test 5: Verify expo config
```powershell
cd app-mobile
npx expo config --json | ConvertFrom-Json | Select-Object -ExpandProperty rootDir
# Should output: C:\Users\Drink\avaloapp\app-mobile
```

---

## Prevention Guidelines

### ✅ DO
- Keep ALL Expo configs in `app-mobile/` directory
- Run `npm run guard` before major changes
- Use the guard script in CI/CD pipelines
- Run fix script if you suspect issues

### ❌ DON'T
- Don't create `app.json` in root directory
- Don't create `babel.config.js` with `babel-preset-expo` in root
- Don't create `metro.config.js` in root
- Don't run `expo init` or `expo install` from root directory
- Don't copy Expo configs from app-mobile to root

---

## Integration with CI/CD

Add guard check to your CI pipeline:

```yaml
# .github/workflows/ci.yml
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Check Expo config location
        run: |
          cd app-mobile
          npm run guard
        
      - name: Test Expo start
        run: |
          cd app-mobile
          timeout 30 expo start --non-interactive || true
```

---

## Script Options

### Dry Run Mode
Preview changes without applying them:
```powershell
pwsh ./fix-expo-monorepo-permanent.ps1 -DryRun
```

### Verbose Mode
See detailed output:
```powershell
pwsh ./fix-expo-monorepo-permanent.ps1 -Verbose
```

### Combined
```powershell
pwsh ./fix-expo-monorepo-permanent.ps1 -DryRun -Verbose
```

---

## Support & Maintenance

### Regular Maintenance
Run monthly to ensure configuration integrity:
```powershell
pwsh ./fix-expo-monorepo-permanent.ps1 -DryRun -Verbose
```

### After Team Changes
If another developer accidentally creates root configs:
```powershell
pwsh ./fix-expo-monorepo-permanent.ps1
```

### Before Major Updates
Before updating Expo SDK:
```powershell
# 1. Verify current state
npm run guard

# 2. Run fix if needed
pwsh ./fix-expo-monorepo-permanent.ps1

# 3. Update Expo
cd app-mobile
npx expo install expo@latest
```

---

## Success Criteria

After running the fix, you should have:

- ✅ No `app.json`, `babel.config.js`, or `metro.config.js` in root
- ✅ All Expo configs present in `app-mobile/`
- ✅ Metro bundler starts without "Invalid URL" error
- ✅ `expo start` works correctly
- ✅ Guard script installed and functional
- ✅ Backup created in `.expo-backup-*` folder
- ✅ Detailed report generated
- ✅ Dependencies installed successfully

---

## Quick Reference

### One-Line Fix
```powershell
pwsh ./fix-expo-monorepo-permanent.ps1
```

### Start Expo (After Fix)
```powershell
cd app-mobile && expo start
```

### Check Status
```powershell
cd app-mobile && npm run guard
```

### View Report
```powershell
ls EXPO_FIX_REPORT_*.md | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Get-Content
```

---

**This solution is permanent and automated. The guard mechanism will prevent future occurrences of this issue.**