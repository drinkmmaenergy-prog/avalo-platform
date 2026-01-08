# AVALO Architecture Repair Analysis

**Date**: 2025-11-09  
**Status**: 🔴 CRITICAL ISSUES IDENTIFIED  
**Action**: IMMEDIATE REPAIR REQUIRED

---

## Executive Summary

The AVALO project has **critical architectural conflicts** that prevent it from building/running correctly:

1. ❌ **CONFLICTING ROOT `app/` DIRECTORY** - Duplicate expo-router structure
2. ❌ **REACT VERSION MISMATCH** - app-web uses React 19 instead of 18
3. ❌ **ROOT CONFIG FILES OBSOLETE** - Point to wrong directories
4. ⚠️ **MONOREPO PACKAGE CONFIGURATION** - ESM vs CommonJS issues

---

## Critical Issues Breakdown

### 1. CONFLICTING ROOT `app/` DIRECTORY ❌

**Problem**: 
- Root `app/` directory exists with expo-router structure
- `app-mobile/` already has proper React Navigation 7.x

**Files Found**:
```
app/
├── _layout.tsx          (expo-router root)
├── index.tsx
├── (tabs)/
├── auth/
├── components/
├── store/
└── ...
```

**Conflicts**:
- Root [`app.json`](app.json:114) has `"expo-router"` plugin on line 114
- Root [`babel.config.js`](babel.config.js:26-30) has aliases pointing to `./app`
- Root [`tsconfig.json`](tsconfig.json:22-26) has paths pointing to `app/*`

**Impact**: 
- Metro bundler confusion (which app to build?)
- TypeScript resolution errors
- Expo trying to use expo-router when app-mobile uses React Navigation

**Solution**: 
- ✅ DELETE entire root `app/` directory
- ✅ Update root `app.json` to remove expo-router plugin
- ✅ Update root `babel.config.js` to remove app aliases
- ✅ Update root `tsconfig.json` to remove app paths

---

### 2. REACT VERSION MISMATCH ❌

**Current State**:
| Package | React Version | React-DOM Version | Status |
|---------|---------------|-------------------|--------|
| Root | 18.3.1 | 18.3.1 | ✅ |
| app-mobile | 18.3.1 | 18.3.1 | ✅ |
| **app-web** | **19.0.0** | **19.0.0** | ❌ |
| shared | - | - | ✅ |
| sdk | - | - | ✅ |

**Problem**:
- [`app-web/package.json`](app-web/package.json:20-21) uses React 19.0.0
- Next.js 14.2.0 officially supports React 18, not 19
- React 19 is still in beta/RC and causes type conflicts
- Monorepo pnpm overrides expect React 18.3.1

**Impact**:
- TypeScript errors in app-web
- Potential runtime issues
- Build failures
- Type definition conflicts

**Solution**:
- ✅ Downgrade app-web React to 18.3.1
- ✅ Downgrade app-web React-DOM to 18.3.1
- ✅ Update app-web types to ~18.3.0

---

### 3. ROOT CONFIGURATION FILES OBSOLETE ❌

**Root [`app.json`](app.json:114)**:
```json
{
  "plugins": [
    "expo-router",  // ❌ WRONG - should NOT be here
    ...
  ]
}
```

**Root [`babel.config.js`](babel.config.js:26-30)**:
```javascript
alias: {
  '@': './app',              // ❌ Points to wrong directory
  '@components': './app/components',
  '@lib': './app/lib',
  ...
}
```

**Root [`tsconfig.json`](tsconfig.json:22-26)**:
```json
{
  "paths": {
    "@/*": ["app/*"],         // ❌ Points to wrong directory
    "@components/*": ["app/components/*"],
    ...
  }
}
```

**Impact**:
- Import resolution fails
- TypeScript can't find modules
- Babel transpilation errors
- Metro bundler confusion

**Solution**:
- ✅ Remove expo-router from root app.json plugins
- ✅ Remove app/* aliases from babel.config.js
- ✅ Remove app/* paths from tsconfig.json

---

### 4. MONOREPO PACKAGE CONFIGURATION ⚠️

**Current State**:
- [`shared/package.json`](shared/package.json:5): `"type": "module"` (ESM)
- [`sdk/package.json`](sdk/package.json:4): `"type": "module"` (ESM)

**Potential Issues**:
- React Native Metro bundler may have issues with ESM packages
- Need to verify workspace protocol resolution
- Need proper tsup build configuration

**Status**: ⏳ NEEDS VERIFICATION (may work, will test)

---

## Monorepo Structure (Current)

```
avaloapp/
├── package.json              # ✅ Root monorepo config
├── pnpm-workspace.yaml       # ⏳ (need to verify)
├── app.json                  # ❌ Has expo-router plugin
├── babel.config.js           # ❌ Has wrong aliases
├── tsconfig.json             # ❌ Has wrong paths
├── app/                      # ❌ DELETE THIS - expo-router residue
│   ├── _layout.tsx
│   ├── index.tsx
│   └── ...
├── app-mobile/               # ✅ CORRECT - React Navigation 7.x
│   ├── App.tsx               # ✅ Uses React Navigation
│   ├── app.json              # ✅ Correct config
│   ├── babel.config.js       # ✅ Correct aliases
│   ├── tsconfig.json         # ✅ Correct paths
│   ├── metro.config.js       # ✅ Monorepo support
│   ├── package.json          # ✅ Correct deps
│   ├── src/
│   │   ├── navigation/       # ✅ React Navigation
│   │   ├── screens/
│   │   └── lib/
│   └── config/
│       └── firebase.ts       # ✅ Single source
├── app-web/                  # ⚠️ React 19 version issue
│   ├── package.json          # ❌ React 19.0.0
│   └── ...
├── shared/                   # ✅ Shared types/utils
│   ├── package.json          # ✅ ESM config
│   └── src/
├── sdk/                      # ✅ SDK package
│   ├── package.json          # ✅ ESM config
│   └── src/
└── functions/                # ✅ Firebase functions
    └── ...
```

---

## Required Fixes (Priority Order)

### HIGH PRIORITY 🔴
1. ✅ DELETE root `app/` directory entirely
2. ✅ Remove expo-router plugin from root `app.json`
3. ✅ Fix root `babel.config.js` aliases
4. ✅ Fix root `tsconfig.json` paths
5. ✅ Fix app-web React version to 18.3.1

### MEDIUM PRIORITY 🟡
6. ✅ Verify app-web Next.js configuration
7. ✅ Verify Firebase configuration across platforms
8. ✅ Test monorepo workspace resolution

### LOW PRIORITY 🟢
9. ✅ Build and test shared package
10. ✅ Build and test sdk package
11. ✅ Test app-mobile native builds
12. ✅ Test app-web builds

---

## App-Mobile Status (Per AVALO_MOBILE_COMPLETE_REBUILD_SUMMARY.md)

✅ **COMPLETED AND OPERATIONAL**:
- Expo SDK 54.0.23
- React Native 0.76.5
- React Navigation 7.x (NOT expo-router)
- TypeScript 5.6.3
- All business logic preserved 100%
- Native folders can be generated via `expo prebuild`
- Ready for Android/iOS builds

**Key Files**:
- [`app-mobile/App.tsx`](app-mobile/App.tsx:1) - Root with React Navigation
- [`app-mobile/src/navigation/AppNavigator.tsx`](app-mobile/src/navigation/AppNavigator.tsx:1) - Main navigator
- [`app-mobile/config/firebase.ts`](app-mobile/config/firebase.ts:1) - Single Firebase config

---

## App-Web Issues

**Current**:
- Next.js 14.2.0
- React 19.0.0 ❌
- React-DOM 19.0.0 ❌

**Should Be**:
- Next.js 14.2.0 ✅
- React 18.3.1 ✅
- React-DOM 18.3.1 ✅

**TypeScript Types**:
- Current: `@types/react@^19.0.0` ❌
- Should be: `@types/react@~18.3.0` ✅

---

## Root Package.json Issues

**Current Overrides** (root [`package.json`](package.json:93-103)):
```json
{
  "pnpm": {
    "overrides": {
      "react": "18.3.1",           // ✅ Correct
      "react-dom": "18.3.1",       // ✅ Correct
      "react-native": "0.76.5",    // ✅ Correct
      "expo": "~54.0.0",           // ✅ Correct
      "@types/react": "~18.3.0",   // ✅ Correct
      "@types/react-dom": "~18.3.0" // ✅ Correct
    }
  }
}
```

**Problem**: app-web package.json explicitly uses React 19, overriding these settings locally.

---

## Firebase Configuration

**Current Status**:
- ✅ [`app-mobile/config/firebase.ts`](app-mobile/config/firebase.ts:1) - Single source of truth
- ⏳ Need to verify app-web Firebase setup
- ⏳ Need to verify functions Firebase setup

**Requirements**:
- All platforms should share Firebase client config
- Functions use firebase-admin
- Web compatibility for Firebase v11

---

## Metro Bundler Configuration

**app-mobile Metro** ([`app-mobile/metro.config.js`](app-mobile/metro.config.js:1)):
```javascript
// ✅ CORRECT
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  projectRoot/node_modules,
  workspaceRoot/node_modules
];
config.resolver.extraNodeModules = {
  "@avalo/sdk": "../sdk/src",
  "@avalo/shared": "../shared/src"
};
```

**Status**: ✅ Properly configured for monorepo

---

## Action Plan

### Phase 1: Clean Up Root Conflicts
```bash
# 1. Delete root app/ directory
rm -rf app/

# 2. Update root app.json (remove expo-router)
# 3. Update root babel.config.js (remove app aliases)
# 4. Update root tsconfig.json (remove app paths)
```

### Phase 2: Fix React Versions
```bash
# In app-web/package.json
# Change React 19.0.0 → 18.3.1
# Change React-DOM 19.0.0 → 18.3.1
# Change @types/react ^19.0.0 → ~18.3.0
# Change @types/react-dom ^19.0.0 → ~18.3.0
```

### Phase 3: Verify Builds
```bash
# Build shared package
cd shared && pnpm build

# Build SDK package
cd sdk && pnpm build

# Test app-mobile
cd app-mobile && pnpm typecheck && pnpm prebuild

# Test app-web
cd app-web && pnpm typecheck && pnpm build
```

### Phase 4: Integration Testing
```bash
# Root typecheck (all packages)
pnpm typecheck

# Test Firebase integration
# Test authentication flows
# Test navigation
# Test business logic
```

---

## Expected Results After Fixes

1. ✅ No conflicting app/ directory
2. ✅ Consistent React 18.3.1 across all packages
3. ✅ Root configs don't interfere with app-mobile/app-web
4. ✅ TypeScript compiles without errors
5. ✅ app-mobile builds for Android/iOS
6. ✅ app-web builds successfully
7. ✅ All business logic preserved
8. ✅ Monorepo workspace resolution works
9. ✅ Firebase works on all platforms

---

## Verification Checklist

| Check | Status | Command |
|-------|--------|---------|
| Root typecheck | ⏳ | `pnpm typecheck` |
| Shared builds | ⏳ | `cd shared && pnpm build` |
| SDK builds | ⏳ | `cd sdk && pnpm build` |
| app-mobile typecheck | ⏳ | `cd app-mobile && pnpm typecheck` |
| app-mobile prebuild | ⏳ | `cd app-mobile && pnpm prebuild` |
| app-web typecheck | ⏳ | `cd app-web && pnpm typecheck` |
| app-web build | ⏳ | `cd app-web && pnpm build` |
| Firebase emulators | ⏳ | `firebase emulators:start` |
| Integration tests | ⏳ | Tests suite |

---

## Conclusion

The AVALO project needs **immediate architectural fixes** to resolve:
1. Root app/ directory conflict with app-mobile
2. React version mismatch in app-web
3. Obsolete root configuration files

Once fixed, the project will be fully operational with:
- ✅ app-mobile: React Native 0.76.5 + Expo 54 + React Navigation 7.x
- ✅ app-web: Next.js 14.2 + React 18.3.1
- ✅ Shared monorepo packages (@avalo/shared, @avalo/sdk)
- ✅ Firebase integration across platforms
- ✅ All business logic preserved

**Status**: 🔴 CRITICAL FIXES REQUIRED  
**Timeline**: Immediate  
**Risk**: HIGH (project cannot build properly in current state)

---

**End of Analysis**