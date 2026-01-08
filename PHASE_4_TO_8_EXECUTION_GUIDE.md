# 🚀 AVALO MONOREPO REPAIR - PHASE 4-8 EXECUTION GUIDE

## Current Status
- ✅ Phases 1-3 COMPLETED
- ⏳ Phase 4 IN PROGRESS: `pnpm -F @avalo/shared install --no-frozen-lockfile` is running

---

## OPTION 1: Automated Execution (RECOMMENDED)

Once the current `pnpm -F @avalo/shared install` completes, run:

```powershell
.\complete-avalo-repair.ps1
```

This script will automatically execute:
- ✅ Phase 4: Install @avalo/sdk and app-mobile
- ✅ Phase 5: Run `expo install --fix`
- ✅ Phase 6: Run `expo prebuild --clean`
- ✅ Phase 7: Build all workspace packages
- ✅ Phase 8: Validate TypeScript compilation

---

## OPTION 2: Manual Step-by-Step Execution

If you prefer manual control, execute these commands in sequence:

### Step 1: Complete Phase 4 - Install Remaining Packages

```bash
# After @avalo/shared completes, run:
pnpm -F @avalo/sdk install --no-frozen-lockfile
pnpm -F app-mobile install --no-frozen-lockfile
```

### Step 2: Phase 5 - Fix Expo SDK 54 Compatibility

```bash
cd app-mobile
npx expo install --fix
cd ..
```

**What this does:**
- Automatically detects Expo SDK 54
- Updates ALL native modules to exact SDK 54 versions
- Fixes version mismatches for:
  - expo-camera, expo-constants, expo-location
  - expo-image-picker, expo-splash-screen
  - react-native-gesture-handler, react-native-reanimated
  - react-native-safe-area-context, react-native-screens

### Step 3: Phase 6 - Regenerate Native Projects

```bash
cd app-mobile
npx expo prebuild --clean
cd ..
```

**What this does:**
- Generates fresh `android/` directory
- Generates fresh `ios/` directory
- Applies all plugins from app.json
- Configures native permissions and deep linking

### Step 4: Phase 7 - Build Workspace Packages

```bash
pnpm run build:shared
pnpm run build:sdk
pnpm run build:functions
```

**What this does:**
- Compiles @avalo/shared to dist/
- Compiles @avalo/sdk to dist/
- Compiles Firebase functions to lib/

### Step 5: Phase 8 - Final Validation & Start

```bash
# Validate TypeScript
cd app-mobile
npx tsc --noEmit

# Start Expo
npx expo start --clear
```

---

## ⚠️ POTENTIAL ISSUES & FIXES

### Issue 1: `expo install --fix` Changes Package Versions

**Expected Behavior:**
- This command WILL modify app-mobile/package.json
- It will update native module versions to SDK 54 compatible versions
- This is INTENTIONAL and CORRECT

**No action needed** - the changes are necessary for SDK 54 compatibility.

---

### Issue 2: `expo prebuild --clean` Fails

**Possible causes:**
- Missing app.json plugins
- Invalid bundle identifier

**Fix:**
Check that app.json has:
```json
{
  "expo": {
    "sdkVersion": "54.0.0",
    "ios": {
      "bundleIdentifier": "com.avalo.app"
    },
    "android": {
      "package": "com.avalo.app"
    }
  }
}
```

---

### Issue 3: "Cannot find module @avalo/sdk" or "@avalo/shared"

**Possible causes:**
- Workspace packages not built yet
- Metro cache issues

**Fix:**
```bash
# Build workspace packages first
pnpm run build:shared
pnpm run build:sdk

# Then clear Metro cache
cd app-mobile
npx expo start --clear
```

---

### Issue 4: TypeScript Errors in app-mobile

**Common errors:**
1. `Cannot find module 'expo/tsconfig.base'`
   - **Fix:** This is expected before expo prebuild runs. It will be fixed after prebuild.

2. `Cannot find module '@avalo/shared'` or '@avalo/sdk'`
   - **Fix:** Ensure paths in tsconfig.json are correct:
   ```json
   {
     "compilerOptions": {
       "paths": {
         "@avalo/sdk": ["../sdk/src"],
         "@avalo/shared": ["../shared/src"]
       }
     }
   }
   ```

---

### Issue 5: Metro Bundler Can't Resolve Workspace Packages

**Symptoms:**
```
Error: Unable to resolve module @avalo/sdk
```

**Fix:**
Verify metro.config.js has:
```javascript
config.resolver.extraNodeModules = {
  '@avalo/shared': path.resolve(workspaceRoot, 'shared/src'),
  '@avalo/sdk': path.resolve(workspaceRoot, 'sdk/src'),
};
```

✅ This is already configured - if error persists, try:
```bash
cd app-mobile
rm -rf .expo
npx expo start --clear
```

---

### Issue 6: Duplicate React Warning

**Symptoms:**
```
Warning: Invalid hook call. Hooks can only be called inside the body of a function component.
```

**Fix:**
This is already fixed via pnpm overrides in root package.json:
```json
{
  "pnpm": {
    "overrides": {
      "react": "18.3.1",
      "react-dom": "18.3.1"
    }
  }
}
```

If issue persists:
```bash
# Clear all node_modules and reinstall
pnpm clean
pnpm install --no-frozen-lockfile
```

---

## ✅ SUCCESS CRITERIA

The repair is complete when:

1. ✅ All workspace packages build without errors:
   ```bash
   pnpm run build:shared  # No errors
   pnpm run build:sdk     # No errors
   pnpm run build:functions # No errors
   ```

2. ✅ TypeScript compiles without fatal errors:
   ```bash
   cd app-mobile
   npx tsc --noEmit  # No fatal errors
   ```

3. ✅ Expo starts successfully:
   ```bash
   cd app-mobile
   npx expo start --clear
   ```
   - Metro bundler starts
   - No "Cannot find module" errors
   - QR code appears
   - Can scan and load app in Expo Go

4. ✅ App loads without crashes:
   - Home screen appears
   - No red error screens
   - Navigation works

---

## 📋 FINAL CHECKLIST

Before considering the repair complete, verify:

- [ ] Phase 4: All workspace packages installed (shared, sdk, app-mobile)
- [ ] Phase 5: `expo install --fix` completed successfully
- [ ] Phase 6: `expo prebuild --clean` generated android/ and ios/ folders
- [ ] Phase 7: All builds successful (shared, sdk, functions)
- [ ] Phase 8: Expo starts with `npx expo start --clear`
- [ ] App loads in Expo Go without errors
- [ ] No "Cannot find module" errors
- [ ] No duplicate React warnings
- [ ] TypeScript compilation successful (or only minor warnings)

---

## 🎯 NEXT STEPS AFTER SUCCESS

Once the app starts successfully:

1. **Test core functionality:**
   - Login/signup
   - Navigation between tabs
   - Profile loading
   - Feed loading

2. **Create a production build:**
   ```bash
   cd app-mobile
   eas build --platform android --profile production
   eas build --platform ios --profile production
   ```

3. **Document any remaining issues:**
   - Note any TypeScript warnings
   - Document any runtime warnings
   - List any missing features

---

## 🆘 IF ALL ELSE FAILS

If you encounter persistent errors after following all steps:

1. **Nuclear option - complete clean reinstall:**
   ```bash
   # Delete everything
   rd /s /q node_modules app-mobile\node_modules app-web\node_modules shared\node_modules sdk\node_modules functions\node_modules
   rd /s /q app-mobile\android app-mobile\ios app-mobile\.expo
   del pnpm-lock.yaml

   # Reinstall from scratch
   pnpm install --no-frozen-lockfile
   cd app-mobile
   npx expo install --fix
   npx expo prebuild --clean
   cd ..
   pnpm run build:shared
   pnpm run build:sdk
   cd app-mobile
   npx expo start --clear
   ```

2. **Check for environment issues:**
   - Node version: Should be >= 20.0.0
   - pnpm version: Should be >= 9.0.0
   - No antivirus blocking node_modules operations

3. **Review configuration files:**
   - Ensure no BOM characters were re-introduced
   - Verify all paths use forward slashes or correct Windows paths
   - Check that workspace:* references are intact

---

**Current Time:** The repair process is approximately 60% complete.
**Estimated Time to Complete:** 10-20 minutes (depending on download speeds and build times)

**Status:** Wait for @avalo/shared install to complete, then proceed with the steps above.