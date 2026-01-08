# Android Build Setup Guide - Expo 54 + React Native 0.81

## Prerequisites Verification

Before building, verify:

1. **Node.js**: Installed and in PATH
   ```powershell
   node --version  # Should show v18+ or v20+
   ```

2. **pnpm**: Installed globally
   ```powershell
   pnpm --version
   ```

3. **Android SDK**: Located at `C:\Users\Drink\AppData\Local\Android\Sdk`
   - SDK Platform 36 installed
   - Build Tools 35.0.2 installed
   - NDK 27.2.12479018 installed

4. **JDK**: Java 17 or 21 recommended
   ```powershell
   java -version
   ```

## Configuration Files Updated

The following files have been configured for Windows + Expo 54 + RN 0.81:

### 1. `android/local.properties`
- Sets SDK location: `C:\Users\Drink\AppData\Local\Android\Sdk`

### 2. `android/gradle.properties`
Key configurations:
- JVM heap: 4GB (`-Xmx4096m`)
- New Architecture: **ENABLED** (`newArchEnabled=true`)
- Hermes: **ENABLED** (`hermesEnabled=true`)
- compileSdk: 36
- targetSdk: 36
- minSdk: 24
- NDK: 27.2.12479018
- Build Tools: 35.0.2

### 3. `android/build.gradle`
- Android Gradle Plugin: 8.9.1
- Kotlin: 2.1.0
- Proper SDK version configuration

### 4. `android/settings.gradle`
- **NODE_BINARY** support for Windows
- Proper node executable resolution

### 5. `android/app/build.gradle`
- **NODE_BINARY** support in all node commands
- Proper path resolution for Expo entry file
- New Architecture support
- Hermes configuration

### 6. `babel.config.js`
- **react-native-reanimated/plugin** enabled (required for Reanimated v4)
- Module resolver for `@` alias

### 7. `android/app/proguard-rules.pro`
- ProGuard rules for React Native, Reanimated, Gesture Handler, Expo

## Build Methods

### Method 1: Using PowerShell Script (Recommended)
```powershell
cd avalo/app-mobile
.\android-build.ps1
```

This script:
- Auto-detects Node.js path
- Sets NODE_BINARY environment variable
- Validates Android SDK
- Runs `pnpm expo run:android`

### Method 2: Manual Command
```powershell
cd avalo/app-mobile

# Set NODE_BINARY (replace path if different)
$env:NODE_BINARY = (Get-Command node).Source

# Verify
Write-Host "NODE_BINARY: $env:NODE_BINARY"

# Build
pnpm expo run:android
```

### Method 3: Direct pnpm (if NODE_BINARY already in system env)
```powershell
cd avalo/app-mobile
pnpm expo run:android
```

## Troubleshooting

### Issue: "node: command not found"
**Solution**: Set NODE_BINARY explicitly
```powershell
$env:NODE_BINARY = "C:\Program Files\nodejs\node.exe"
```

### Issue: Android SDK not found
**Solution**: Verify `android/local.properties` has correct path
```properties
sdk.dir=C:\\Users\\Drink\\AppData\\Local\\Android\\Sdk
```

### Issue: Out of memory during build
**Solution**: Increase heap in `gradle.properties`
```properties
org.gradle.jvmargs=-Xmx6144m -XX:MaxMetaspaceSize=1536m
```

### Issue: Reanimated build errors
**Solution**: Verify `babel.config.js` has reanimated plugin as **last** plugin

### Issue: Gradle version mismatch
**Solution**: Use wrapper (included)
```powershell
cd android
.\gradlew.bat --version
```

### Issue: NDK not found
**Solution**: Install via Android Studio SDK Manager
- Tools → SDK Manager → SDK Tools → NDK (27.2.12479018)

## Clean Build

If you encounter persistent issues:

```powershell
cd avalo/app-mobile

# Clean Gradle cache
cd android
.\gradlew.bat clean
cd ..

# Clean Metro bundler
pnpm expo start --clear

# Clean node_modules (if needed)
Remove-Item -Recurse -Force node_modules
pnpm install

# Rebuild
.\android-build.ps1
```

## Verification Checklist

- [ ] Node.js in PATH and NODE_BINARY set
- [ ] Android SDK at correct location
- [ ] Emulator or device connected (`adb devices`)
- [ ] gradle.properties has `newArchEnabled=true`
- [ ] babel.config.js has reanimated plugin
- [ ] All dependencies installed (`pnpm install`)

## Key Features Enabled

✅ New Architecture (Fabric + TurboModules)  
✅ Hermes Engine  
✅ react-native-reanimated v4  
✅ react-native-gesture-handler  
✅ @gorhom/bottom-sheet  
✅ expo-dev-client  
✅ Edge-to-edge display  

## Expected Build Time

- First build: 5-15 minutes
- Incremental builds: 1-3 minutes

## Success Indicators

When build succeeds, you'll see:
```
✔ Built the app successfully, and it is running in the emulator.
```

The app will automatically open on your emulator/device.
