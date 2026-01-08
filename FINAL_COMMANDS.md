# PHASE 2: FINAL COMMANDS - EXECUTION GUIDE

**Status:** ✅ All Phase 2 fixes have been applied  
**Next Action:** Run these commands to complete the repair

---

## 🪟 WINDOWS USERS

Open PowerShell as Administrator and execute these commands in sequence:

### Step 1: Clean Everything
```powershell
# Navigate to project root
cd C:\Users\Drink\avaloapp

# Clear pnpm store
pnpm store prune

# Remove all node_modules
Get-ChildItem -Path . -Include node_modules -Recurse -Directory | Remove-Item -Recurse -Force

# Remove pnpm lock file
Remove-Item pnpm-lock.yaml -ErrorAction SilentlyContinue

# Clear Metro cache
Remove-Item -Recurse -Force app-mobile\.expo -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force node_modules\.cache -ErrorAction SilentlyContinue

# Clear user Expo cache
Remove-Item -Recurse -Force $env:USERPROFILE\.expo -ErrorAction SilentlyContinue
```

### Step 2: Fresh Install
```powershell
# Install all dependencies
pnpm install
```

### Step 3: Build Packages
```powershell
# Build shared package
pnpm --filter @avalo/shared build

# Build SDK package
pnpm --filter @avalo/sdk build
```

### Step 4: Verify Builds
```powershell
# Type check all packages
pnpm typecheck

# Build functions
pnpm --filter functions build

# Build web app
pnpm --filter app-web build
```

### Step 5: Test Metro (Mobile)
```powershell
# Navigate to mobile app
cd app-mobile

# Start Expo with reset cache
$env:EXPO_NO_DOCTOR = "1"
pnpm start --reset-cache
```

**Expected Output:** Metro bundler should start without "Body is unusable" error

### Alternative: Use Automated Script
```powershell
# From project root
.\scripts\dev-win.ps1
```

---

## 🍎 macOS / 🐧 LINUX USERS

Open Terminal and execute these commands in sequence:

### Step 1: Clean Everything
```bash
# Navigate to project root
cd ~/avaloapp  # Adjust path as needed

# Clear pnpm store
pnpm store prune

# Remove all node_modules
find . -name "node_modules" -type d -prune -exec rm -rf '{}' +

# Remove pnpm lock file
rm -f pnpm-lock.yaml

# Clear Metro cache
rm -rf app-mobile/.expo
rm -rf node_modules/.cache

# Clear user Expo cache
rm -rf ~/.expo
```

### Step 2: Fresh Install
```bash
# Install all dependencies
pnpm install
```

### Step 3: Build Packages
```bash
# Build shared package
pnpm --filter @avalo/shared build

# Build SDK package
pnpm --filter @avalo/sdk build
```

### Step 4: Verify Builds
```bash
# Type check all packages
pnpm typecheck

# Build functions
pnpm --filter functions build

# Build web app
pnpm --filter app-web build
```

### Step 5: Test Metro (Mobile)
```bash
# Navigate to mobile app
cd app-mobile

# Start Expo with reset cache
export EXPO_NO_DOCTOR=1
pnpm start --reset-cache
```

**Expected Output:** Metro bundler should start without "Body is unusable" error

### Alternative: Use Automated Script
```bash
# From project root
chmod +x scripts/dev-unix.sh
./scripts/dev-unix.sh
```

---

## 🧪 VERIFICATION COMMANDS

Run these to verify all fixes are working:

### Check Metro Resolution
```bash
# Should show all Metro packages at 0.80.12
pnpm list metro metro-config metro-resolver metro-runtime --filter app-mobile
```

### Check Expo Version
```bash
# Should show 54.0.23
pnpm list expo --filter app-mobile
```

### Check Firebase Admin
```bash
# Should show 13.6.0
pnpm list firebase-admin --filter functions
```

### Test Workspace Links
```bash
# Should resolve to local packages
pnpm list @avalo/shared @avalo/sdk --filter app-mobile
```

### Run Linter
```bash
pnpm lint
```

### Run Type Checker
```bash
pnpm typecheck
```

---

## 🚀 QUICK START OPTIONS

### Option 1: Mobile Development
```bash
pnpm --filter app-mobile start --reset-cache
```

### Option 2: Web Development
```bash
pnpm --filter app-web dev
```

### Option 3: Backend Development
```bash
pnpm dev:backend
```

### Option 4: Full Stack (Windows)
```powershell
.\scripts\dev-win.ps1
# Select option 3 for both mobile and web
```

### Option 5: Full Stack (macOS/Linux)
```bash
./scripts/dev-unix.sh
# Select option 3 for tmux multi-pane
```

---

## 📱 MOBILE APP - ADDITIONAL STEPS

### Generate Native Projects (First Time Only)
```bash
cd app-mobile

# iOS (requires macOS with Xcode)
expo prebuild --platform ios

# Android (requires Android Studio)
expo prebuild --platform android

# Both platforms
expo prebuild
```

### Run on Physical Device
```bash
# iOS
expo run:ios

# Android
expo run:android
```

### Build for Production
```bash
# iOS
eas build --platform ios

# Android
eas build --platform android
```

---

## 🐛 TROUBLESHOOTING

### If Metro Still Crashes

1. **Nuclear option - Complete reset:**
```bash
# Windows
Remove-Item -Recurse -Force node_modules, pnpm-lock.yaml, app-mobile\.expo, $env:USERPROFILE\.expo
pnpm install

# macOS/Linux
rm -rf node_modules pnpm-lock.yaml app-mobile/.expo ~/.expo
pnpm install
```

2. **Check for port conflicts:**
```bash
# Kill processes on port 8081 (Metro)
# Windows
netstat -ano | findstr :8081
taskkill /PID <PID> /F

# macOS/Linux
lsof -ti:8081 | xargs kill -9
```

3. **Verify Node version:**
```bash
node --version
# Must be v20.x.x
```

4. **Verify pnpm version:**
```bash
pnpm --version
# Must be 8.15.0 or higher
```

### If Builds Fail

1. **Check TypeScript errors:**
```bash
pnpm typecheck
```

2. **Check for outdated dependencies:**
```bash
pnpm outdated
```

3. **Rebuild from scratch:**
```bash
pnpm clean
pnpm install
pnpm --filter @avalo/shared build
pnpm --filter @avalo/sdk build
```

---

## ✅ SUCCESS INDICATORS

After running the commands, you should see:

✅ `pnpm install` completes without errors  
✅ Shared package builds successfully  
✅ SDK package builds successfully  
✅ Metro bundler starts without crash  
✅ No "Body is unusable" errors  
✅ No version conflict warnings  
✅ TypeScript compiles without errors  
✅ Linter passes all checks  

---

## 📊 COMMAND SUMMARY

| Task | Windows | macOS/Linux |
|------|---------|-------------|
| **Clean** | `pnpm store prune` | `pnpm store prune` |
| **Install** | `pnpm install` | `pnpm install` |
| **Build Shared** | `pnpm --filter @avalo/shared build` | `pnpm --filter @avalo/shared build` |
| **Build SDK** | `pnpm --filter @avalo/sdk build` | `pnpm --filter @avalo/sdk build` |
| **Start Mobile** | `pnpm --filter app-mobile start --reset-cache` | `pnpm --filter app-mobile start --reset-cache` |
| **Start Web** | `pnpm --filter app-web dev` | `pnpm --filter app-web dev` |
| **Auto Setup** | `.\scripts\dev-win.ps1` | `./scripts/dev-unix.sh` |
| **Clean Caches** | `pnpm clean:caches` | `pnpm clean:caches` |

---

## 🎯 NEXT PHASE

Once Metro starts successfully, proceed to **PHASE 3**:

1. Generate iOS/Android native projects with `expo prebuild`
2. Test on physical devices
3. Configure EAS Build for production
4. Set up Firebase deployment pipeline
5. Complete monitoring and analytics setup

---

**Generated:** 2025-11-09  
**Last Updated:** Phase 2 Complete  
**Support:** Run `.\scripts\dev-win.ps1` or `./scripts/dev-unix.sh` for guided setup