# Phase 5: Production APK Build Guide

## Prerequisites

Before building the APK, ensure you have:

1. **Node.js & npm installed** (v18 or higher)
2. **Android Studio** with Android SDK installed
3. **Java Development Kit (JDK)** 11 or higher
4. **Expo CLI** installed globally: `npm install -g expo-cli`

## Environment Setup

### 1. Install Dependencies

```bash
cd app-mobile
npm install
```

### 2. Configure Environment Variables

Create or update `.env` file in `app-mobile/`:

```env
ANTHROPIC_API_KEY=your_actual_anthropic_api_key
STRIPE_PUBLISHABLE_KEY=your_actual_stripe_publishable_key
ENABLE_REAL_AI=true
ENABLE_NSFW_FILTER=true
ENABLE_STRIPE_PAYMENTS=false
```

### 3. Update app.json

Ensure `app-mobile/app.json` has correct configuration:

```json
{
  "expo": {
    "name": "Avalo",
    "slug": "avalo-app",
    "version": "1.0.0",
    "android": {
      "package": "com.avalo.app",
      "versionCode": 1,
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "permissions": [
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "NOTIFICATIONS"
      ]
    }
  }
}
```

## Build Process

### Option 1: Development Build (Recommended for Testing)

```bash
cd app-mobile

# Build for Android
npx expo run:android

# This will:
# 1. Install dependencies
# 2. Start Metro bundler
# 3. Build and install APK on connected device/emulator
```

### Option 2: Production APK (EAS Build)

```bash
cd app-mobile

# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure EAS
eas build:configure

# Build production APK
eas build --platform android --profile production
```

### Option 3: Local Production Build

```bash
cd app-mobile/android

# Clean previous builds
./gradlew clean

# Build release APK
./gradlew assembleRelease

# APK will be at:
# android/app/build/outputs/apk/release/app-release.apk
```

## Pre-Build Checklist

- [ ] All dependencies installed (`package.json` up to date)
- [ ] Environment variables configured (`.env` file)
- [ ] Firebase configuration active (`lib/sdk.ts` initialized)
- [ ] Android SDK and tools installed
- [ ] Signing key generated (for production builds)
- [ ] App icons and splash screens ready
- [ ] Permissions configured in `app.json`

## Testing Checklist

After building, test these critical paths:

### 1. Onboarding Flow
- [ ] Welcome screen loads
- [ ] Registration works
- [ ] Profile setup completes
- [ ] Selfie verification works

### 2. Core Features
- [ ] Home feed displays
- [ ] Discovery grid works
- [ ] Swipe deck functional
- [ ] AI chat responds (with Anthropic API if configured)
- [ ] Messages send/receive
- [ ] Profile editing works

### 3. Monetization
- [ ] Token balance displays correctly
- [ ] Wallet screen accessible
- [ ] Token purchase flow (mock or Stripe)
- [ ] Tips/gifts deduct tokens correctly
- [ ] Calendar bookings work

### 4. Phase 5 Features
- [ ] LIVE tab visible in bottom nav
- [ ] "Coming Soon" banner displays
- [ ] ErrorBoundary catches crashes
- [ ] Dev Menu accessible (8-second long-press on logo)
- [ ] Notifications work (if device supports)
- [ ] Analytics events log correctly

### 5. Navigation
- [ ] All tabs accessible
- [ ] Profile incomplete → redirects to onboarding
- [ ] Low balance → shows wallet CTA
- [ ] Deep links work (if configured)

## Common Build Issues

### Issue: Metro bundler fails to start
**Solution:** Clear cache and restart
```bash
npx expo start --clear
```

### Issue: Gradle build fails
**Solution:** Clean and rebuild
```bash
cd android
./gradlew clean
cd ..
npx expo run:android
```

### Issue: Dependencies conflict
**Solution:** Clear node_modules and reinstall
```bash
rm -rf node_modules
npm install
```

### Issue: Android SDK not found
**Solution:** Set ANDROID_HOME environment variable
```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

## APK Distribution

### Development Distribution
1. Copy APK from `android/app/build/outputs/apk/debug/`
2. Share via email, Google Drive, or Firebase App Distribution

### Production Distribution
1. Sign APK with release keystore
2. Generate signed bundle for Play Store
3. Or distribute as signed APK via internal channels

## Firebase Setup (Required)

Ensure Firebase is properly initialized:

1. **Firebase Console:** Create/verify project
2. **Download google-services.json** → place in `android/app/`
3. **Enable Firestore, Auth, Storage**
4. **Deploy Cloud Functions** (from `functions/` directory)

```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

## Cloud Functions Deployment

```bash
cd functions

# Install dependencies
npm install

# Build TypeScript
npm run build

# Deploy to Firebase
firebase deploy --only functions

# Verify deployment
firebase functions:log
```

## Post-Build Steps

1. **Test on physical device** (not just emulator)
2. **Verify all API integrations** work
3. **Check analytics events** are logging
4. **Test payment flows** (Stripe sandbox)
5. **Verify notifications** on real device
6. **Test offline behavior**
7. **Check crash reporting** (ErrorBoundary)

## Production Release Checklist

Before releasing to production:

- [ ] All environment variables set to production values
- [ ] Stripe in production mode (live keys)
- [ ] Anthropic API production key configured
- [ ] Firebase security rules enabled
- [ ] Cloud Functions deployed and tested
- [ ] Analytics tracking verified
- [ ] Crash reporting configured
- [ ] Version numbers updated
- [ ] Release notes prepared
- [ ] App Store/Play Store assets ready

## Support & Debugging

### Enable Debug Mode
In development builds, long-press the Avalo logo for 8 seconds to access Dev Menu:
- View user info
- Add test tokens
- Reset onboarding
- Test crash reporting
- View feature flags

### Logs
- Metro bundler logs: Check terminal
- Android logs: `adb logcat`
- Firebase logs: Firebase Console → Functions → Logs

## Version Information

- **Phase 5 Version:** 1.0.0
- **Build Date:** 2025-11-19
- **Target SDK:** Android 13+ (API 33+)
- **Min SDK:** Android 8.0+ (API 26+)

---

**Ready to build?** Run `npx expo run:android` from `app-mobile/` directory.