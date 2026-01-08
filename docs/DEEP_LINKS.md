# Avalo Deep Links & Universal Links Guide

Complete guide for implementing and testing deep links and universal links in Avalo.

## Table of Contents
- [Overview](#overview)
- [Deep Link Types](#deep-link-types)
- [Configuration](#configuration)
- [Link Patterns](#link-patterns)
- [iOS Universal Links](#ios-universal-links)
- [Android App Links](#android-app-links)
- [Implementation](#implementation)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## Overview

Avalo supports three types of deep linking:

1. **Custom Scheme** (`avalo://`) - Opens app directly
2. **Universal Links (iOS)** (`https://avalo.app/...`) - Web fallback
3. **App Links (Android)** (`https://avalo.app/...`) - Web fallback

### Benefits

- ✅ Seamless app opening from web/email/SMS
- ✅ Enhanced user experience
- ✅ Attribution tracking
- ✅ Deferred deep linking (install then open)
- ✅ Better engagement rates

## Deep Link Types

### Custom URL Scheme

**Format**: `avalo://path/to/resource`

**Pros**:
- Simple to implement
- Works immediately
- No domain verification needed

**Cons**:
- No web fallback
- Less secure
- Can conflict with other apps

### Universal Links (iOS)

**Format**: `https://avalo.app/path/to/resource`

**Pros**:
- Web fallback if app not installed
- More secure (domain verified)
- Better user experience
- No confirmation dialog

**Cons**:
- Requires domain verification
- More complex setup

### App Links (Android)

**Format**: `https://avalo.app/path/to/resource`

**Pros**:
- Web fallback if app not installed
- Domain verified
- No app chooser dialog

**Cons**:
- Requires domain verification
- Requires HTTPS

## Configuration

### Current Configuration

Located in [`app.json`](../app.json):

```json
{
  "expo": {
    "scheme": "avalo",
    "ios": {
      "associatedDomains": [
        "applinks:avalo.app",
        "applinks:*.avalo.app",
        "webcredentials:avalo.app"
      ]
    },
    "android": {
      "intentFilters": [
        {
          "action": "VIEW",
          "autoVerify": true,
          "data": [
            {
              "scheme": "https",
              "host": "avalo.app",
              "pathPrefix": "/ul"
            },
            {
              "scheme": "https",
              "host": "avalo.app",
              "pathPrefix": "/chat"
            },
            {
              "scheme": "https",
              "host": "avalo.app",
              "pathPrefix": "/profile"
            },
            {
              "scheme": "https",
              "host": "avalo.app",
              "pathPrefix": "/event"
            },
            {
              "scheme": "https",
              "host": "avalo.app",
              "pathPrefix": "/calendar"
            },
            {
              "scheme": "https",
              "host": "avalo.app",
              "pathPrefix": "/ai"
            },
            {
              "scheme": "https",
              "host": "avalo.app",
              "pathPrefix": "/checkout"
            },
            {
              "scheme": "https",
              "host": "avalo.app",
              "pathPrefix": "/invite"
            },
            {
              "scheme": "avalo",
              "host": "*"
            }
          ],
          "category": [
            "BROWSABLE",
            "DEFAULT"
          ]
        }
      ]
    }
  }
}
```

## Link Patterns

### User Profile
```
Custom:    avalo://profile/USER_ID
Universal: https://avalo.app/profile/USER_ID
```

**Example**:
```
avalo://profile/abc123xyz
https://avalo.app/profile/abc123xyz
```

### Chat Conversation
```
Custom:    avalo://chat/CHAT_ID
Universal: https://avalo.app/chat/CHAT_ID
```

**Example**:
```
avalo://chat/chat_abc123
https://avalo.app/chat/chat_abc123
```

### AI Companion
```
Custom:    avalo://ai/COMPANION_ID
Universal: https://avalo.app/ai/COMPANION_ID
```

**Example**:
```
avalo://ai/companion_emma
https://avalo.app/ai/companion_emma
```

### Event/Calendar
```
Custom:    avalo://event/EVENT_ID
Universal: https://avalo.app/event/EVENT_ID
```

**Example**:
```
avalo://event/evt_2024_party
https://avalo.app/event/evt_2024_party
```

### Checkout/Payment
```
Custom:    avalo://checkout?type=premium
Universal: https://avalo.app/checkout?type=premium
```

**Example**:
```
avalo://checkout?type=premium&plan=monthly
https://avalo.app/checkout?type=premium&plan=monthly
```

### Invite Link
```
Custom:    avalo://invite/INVITE_CODE
Universal: https://avalo.app/invite/INVITE_CODE
```

**Example**:
```
avalo://invite/FRIEND2024
https://avalo.app/invite/FRIEND2024
```

### Universal Link (Shortened)
```
Universal: https://avalo.app/ul/SHORT_CODE
```

**Example**:
```
https://avalo.app/ul/a1b2c3
```

## iOS Universal Links

### Step 1: Create Apple App Site Association File

Create `apple-app-site-association` (no extension) in your web root:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM_ID.com.avalo.app",
        "paths": [
          "/profile/*",
          "/chat/*",
          "/event/*",
          "/calendar/*",
          "/ai/*",
          "/checkout/*",
          "/invite/*",
          "/ul/*"
        ]
      }
    ]
  },
  "webcredentials": {
    "apps": [
      "TEAM_ID.com.avalo.app"
    ]
  }
}
```

**Replace**:
- `TEAM_ID` with your Apple Team ID (found in Apple Developer account)
- `com.avalo.app` with your actual bundle ID

### Step 2: Host the File

Upload to your web server at:
```
https://avalo.app/.well-known/apple-app-site-association
https://avalo.app/apple-app-site-association
```

**Requirements**:
- Must be served over HTTPS
- Content-Type: `application/json`
- No redirects
- File size < 128 KB
- Accessible without authentication

### Step 3: Verify Apple Configuration

Test your configuration:
```bash
# Check if file is accessible
curl -v https://avalo.app/.well-known/apple-app-site-association

# Validate with Apple's tool
# Open in browser:
https://search.developer.apple.com/appsearch-validation-tool/
```

### Step 4: Configure Xcode (Done via app.json)

The `associatedDomains` in [`app.json`](../app.json) automatically configures:

```json
"associatedDomains": [
  "applinks:avalo.app",
  "applinks:*.avalo.app",
  "webcredentials:avalo.app"
]
```

This adds the Associated Domains entitlement in Xcode.

## Android App Links

### Step 1: Create Digital Asset Links File

Create `assetlinks.json` in `.well-known/` directory:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.avalo.app",
      "sha256_cert_fingerprints": [
        "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99"
      ]
    }
  }
]
```

### Step 2: Get SHA-256 Certificate Fingerprint

#### For Debug Builds:
```bash
# Windows
keytool -list -v -keystore %USERPROFILE%\.android\debug.keystore -alias androiddebugkey -storepass android -keypass android

# macOS/Linux
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

#### For Production Builds (via Google Play):
1. Go to Google Play Console
2. Navigate to **Release** → **Setup** → **App signing**
3. Copy **SHA-256 certificate fingerprint**

#### For Production Builds (local keystore):
```bash
keytool -list -v -keystore /path/to/your-release-key.keystore
```

### Step 3: Host the File

Upload to:
```
https://avalo.app/.well-known/assetlinks.json
```

**Requirements**:
- Must be HTTPS
- Content-Type: `application/json`
- Publicly accessible
- No redirects

### Step 4: Verify Configuration

Test your configuration:
```bash
# Check if file is accessible
curl https://avalo.app/.well-known/assetlinks.json

# Validate with Google's tool
# https://developers.google.com/digital-asset-links/tools/generator
```

### Step 5: Test App Links

```bash
# Test via ADB
adb shell am start -a android.intent.action.VIEW -d "https://avalo.app/profile/test123" com.avalo.app

# Check verification status
adb shell pm get-app-links com.avalo.app
```

## Implementation

### React Native / Expo Router

Avalo uses Expo Router for navigation, which handles deep links automatically.

#### Link Handling in App

File: [`app/_layout.tsx`](../app/_layout.tsx)

```typescript
import { useEffect } from 'react';
import { Linking } from 'react-native';
import { useRouter, useSegments } from 'expo-router';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Handle initial URL (app opened via deep link)
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink(url);
      }
    });

    // Handle URL changes while app is running
    const listener = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      listener.remove();
    };
  }, []);

  const handleDeepLink = (url: string) => {
    const route = parseDeepLink(url);
    if (route) {
      router.push(route);
    }
  };

  const parseDeepLink = (url: string): string | null => {
    try {
      // Handle custom scheme: avalo://
      if (url.startsWith('avalo://')) {
        const path = url.replace('avalo://', '');
        return `/${path}`;
      }

      // Handle universal links: https://avalo.app/
      if (url.startsWith('https://avalo.app/')) {
        const path = url.replace('https://avalo.app/', '');
        return `/${path}`;
      }

      return null;
    } catch (error) {
      console.error('Error parsing deep link:', error);
      return null;
    }
  };

  return (
    <Stack>
      {/* Your app screens */}
    </Stack>
  );
}
```

### Creating Deep Links

#### Generate Link Function

```typescript
// app/utils/deepLinks.ts
export const DeepLinks = {
  // Profile link
  profile: (userId: string) => ({
    custom: `avalo://profile/${userId}`,
    universal: `https://avalo.app/profile/${userId}`,
  }),

  // Chat link
  chat: (chatId: string) => ({
    custom: `avalo://chat/${chatId}`,
    universal: `https://avalo.app/chat/${chatId}`,
  }),

  // Event link
  event: (eventId: string) => ({
    custom: `avalo://event/${eventId}`,
    universal: `https://avalo.app/event/${eventId}`,
  }),

  // AI Companion link
  aiCompanion: (companionId: string) => ({
    custom: `avalo://ai/${companionId}`,
    universal: `https://avalo.app/ai/${companionId}`,
  }),

  // Checkout link
  checkout: (params: { type: string; plan?: string }) => {
    const query = new URLSearchParams(params).toString();
    return {
      custom: `avalo://checkout?${query}`,
      universal: `https://avalo.app/checkout?${query}`,
    };
  },

  // Invite link
  invite: (code: string) => ({
    custom: `avalo://invite/${code}`,
    universal: `https://avalo.app/invite/${code}`,
  }),

  // Short link
  short: (code: string) => ({
    universal: `https://avalo.app/ul/${code}`,
  }),
};
```

#### Usage Example

```typescript
import { Share } from 'react-native';
import { DeepLinks } from '@/utils/deepLinks';

// Share profile
const shareProfile = async (userId: string) => {
  const link = DeepLinks.profile(userId);
  
  await Share.share({
    message: `Check out my Avalo profile: ${link.universal}`,
    url: link.universal, // iOS uses this
    title: 'My Avalo Profile',
  });
};

// Navigate to chat
const openChat = (chatId: string) => {
  const link = DeepLinks.chat(chatId);
  Linking.openURL(link.universal);
};
```

## Testing

### Manual Testing

#### iOS Simulator
```bash
# Using xcrun simctl
xcrun simctl openurl booted "avalo://profile/test123"
xcrun simctl openurl booted "https://avalo.app/profile/test123"
```

#### iOS Device
1. Send link via Messages, Email, or Notes
2. Tap the link
3. App should open directly (no Safari)

If Safari opens instead:
- Long press the banner at top
- Tap "Open in Avalo"
- This sets the preference

#### Android Emulator
```bash
# Using ADB
adb shell am start -a android.intent.action.VIEW -d "avalo://profile/test123"
adb shell am start -a android.intent.action.VIEW -d "https://avalo.app/profile/test123"
```

#### Android Device
1. Send link via any app
2. Tap the link
3. Choose "Avalo" if prompted
4. Check "Always" to remember choice

### Automated Testing

#### Test Script

Create `scripts/test-deep-links.sh`:

```bash
#!/bin/bash

# Test deep links on connected devices

echo "Testing Deep Links..."

# iOS
echo "\n📱 Testing iOS..."
xcrun simctl openurl booted "avalo://profile/test123"
sleep 2
xcrun simctl openurl booted "https://avalo.app/chat/test456"

# Android
echo "\n🤖 Testing Android..."
adb shell am start -a android.intent.action.VIEW -d "avalo://profile/test123"
sleep 2
adb shell am start -a android.intent.action.VIEW -d "https://avalo.app/chat/test456"

echo "\n✅ Deep link tests complete"
```

Run tests:
```bash
chmod +x scripts/test-deep-links.sh
./scripts/test-deep-links.sh
```

### Test Cases

| Link Type | URL | Expected Behavior |
|-----------|-----|-------------------|
| Profile | `avalo://profile/user123` | Opens user profile screen |
| Chat | `https://avalo.app/chat/chat456` | Opens specific chat |
| Event | `https://avalo.app/event/evt789` | Opens event details |
| AI Companion | `avalo://ai/emma` | Opens AI chat with Emma |
| Checkout | `https://avalo.app/checkout?type=premium` | Opens premium checkout |
| Invite | `avalo://invite/FRIEND2024` | Applies invite code |
| Short Link | `https://avalo.app/ul/abc123` | Redirects to full URL |

### Verification Checklist

- [ ] Custom scheme links work (avalo://)
- [ ] Universal links work (https://avalo.app/)
- [ ] Links open app when installed
- [ ] Links fallback to web when app not installed
- [ ] Deep link routing works correctly
- [ ] Parameters parsed correctly
- [ ] Authentication state preserved
- [ ] Analytics tracked
- [ ] Error handling works

## Troubleshooting

### iOS Issues

**Problem**: Universal links open Safari instead of app

**Solutions**:
1. Check Associated Domains capability enabled
2. Verify `apple-app-site-association` file is accessible
3. Clear iOS cache: Settings → Safari → Clear History
4. Reinstall app
5. Long-press link banner → "Open in Avalo"

**Problem**: Associated domains not working

**Solutions**:
1. Verify Team ID is correct
2. Check certificate signing
3. Rebuild app after domain changes
4. Wait 15-30 minutes for Apple CDN propagation

### Android Issues

**Problem**: App Links not working (shows app chooser)

**Solutions**:
1. Verify `assetlinks.json` is accessible
2. Check SHA-256 fingerprint matches
3. Ensure `autoVerify: true` in intent filters
4. Clear app data and reinstall
5. Check verification status:
   ```bash
   adb shell pm get-app-links com.avalo.app
   ```

**Problem**: "App not verified" error

**Solutions**:
1. Verify digital asset links file
2. Wait 15-20 minutes after deployment
3. Clear Play Store cache
4. Force verification:
   ```bash
   adb shell pm verify-app-links --re-verify com.avalo.app
   ```

### General Issues

**Problem**: Deep link not navigating to correct screen

**Solution**: Check route parsing logic and navigation implementation

**Problem**: Parameters not being passed

**Solution**: Verify URL parsing and query string handling

**Problem**: Deep link works in dev but not production

**Solution**: Ensure production domains are configured correctly

### Debug Logging

Add logging to track deep link flow:

```typescript
const handleDeepLink = (url: string) => {
  console.log('[Deep Link] Received:', url);
  
  const route = parseDeepLink(url);
  console.log('[Deep Link] Parsed route:', route);
  
  if (route) {
    console.log('[Deep Link] Navigating to:', route);
    router.push(route);
  } else {
    console.warn('[Deep Link] No valid route found');
  }
};
```

## Best Practices

1. **Always provide fallback**: Universal links should work as web URLs
2. **Track analytics**: Monitor deep link performance
3. **Test thoroughly**: Different devices, OS versions, scenarios
4. **Handle errors gracefully**: Invalid links shouldn't crash app
5. **Update documentation**: Keep link patterns documented
6. **Version URLs**: Include version info if link structure changes
7. **Use short links**: For sharing, use shortened URLs
8. **Monitor metrics**: Track conversion from links

## Resources

### Apple Documentation
- [Universal Links](https://developer.apple.com/ios/universal-links/)
- [Associated Domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains)

### Android Documentation
- [App Links](https://developer.android.com/training/app-links)
- [Verify App Links](https://developer.android.com/training/app-links/verify-android-applinks)

### Expo Documentation
- [Linking](https://docs.expo.dev/guides/linking/)
- [Deep Linking with Expo Router](https://docs.expo.dev/router/reference/linking/)

### Testing Tools
- [Apple App Search Validation Tool](https://search.developer.apple.com/appsearch-validation-tool/)
- [Google Digital Asset Links Tool](https://developers.google.com/digital-asset-links/tools/generator)
- [Branch.io Link Tester](https://branch.io/resources/universal-links/)

---

**Last Updated**: 2024-11-04  
**Version**: 1.0.0