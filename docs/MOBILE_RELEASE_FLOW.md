# Mobile App Release Flow

## Overview

Avalo uses Expo Application Services (EAS) for building and submitting mobile apps to app stores. This document outlines the complete release process for both Android and iOS.

## Build Profiles

### Development
- **Purpose**: Local testing with development client
- **Distribution**: Internal only
- **Environment**: DEV

### Staging  
- **Purpose**: Pre-production testing
- **Distribution**: Internal testing (TestFlight/Internal Test)
- **Environment**: STAGING

### Production
- **Purpose**: Live user releases
- **Distribution**: App Store/Google Play
- **Environment**: PRODUCTION

## Android Release Flow

### 1. Internal Testing
```bash
# Build for staging
cd app-mobile
npx eas-cli build --platform android --profile staging

# Submit to Google Play Internal Test
npx eas-cli submit --platform android --latest --track internal
```

### 2. Closed Testing
Once internal testing passes:
```bash
# Promote from Internal to Closed Testing in Google Play Console
# Or rebuild and submit directly to closed
npx eas-cli submit --platform android --track closed
```

### 3. Open Testing (Optional)
For wider beta testing:
```bash
# Promote to Open Testing track
# Via Google Play Console
```

### 4. Production Release
```bash
# Build production
npx eas-cli build --platform android --profile production

# Submit to production with staged rollout (10%)
npx eas-cli submit --platform android --latest --track production
```

### Gradual Rollout
- **Day 1**: 10% of users
- **Day 3**: 25% of users (if no critical issues)
- **Day 7**: 50% of users
- **Day 14**: 100% rollout

### Emergency Halt
If critical issues detected:
```bash
# Halt rollout in Google Play Console
# Fix issues
# Release as new version
```

## iOS Release Flow

### 1. TestFlight (Internal)
```bash
# Build for staging
cd app-mobile
npx eas-cli build --platform ios --profile staging

# Submit to TestFlight
npx eas-cli submit --platform ios --latest
```

### 2. TestFlight (External)
Once internal testing passes:
- Add external testers in App Store Connect
- Requires App Store review for first external test
- Review typically takes 24-48 hours

### 3. App Store Submission
```bash
# Build production
npx eas-cli build --platform ios --profile production

# Submit to App Store
npx eas-cli submit --platform ios --latest
```

### 4. App Store Review
- Prepare review information
- Screenshots for all device sizes
- App description and keywords
- Privacy policy and terms
- Review typically takes 1-3 days

### Phased Release
Enable in App Store Connect:
- **Day 1**: 1% of users
- **Day 2**: 2% of users
- **Day 3**: 5% of users
- **Day 4**: 10% of users
- **Day 5**: 20% of users
- **Day 6**: 50% of users
- **Day 7**: 100% of users

## Feature Flags for Mobile

Control features remotely without app updates:

```typescript
import { getRemoteConfig, getValue } from 'firebase/remote-config';

const remoteConfig = getRemoteConfig();

// Get feature flag
const aiCompanionsEnabled = getValue(remoteConfig, 'ai_companions_enabled').asBoolean();
const videoCallsEnabled = getValue(remoteConfig, 'video_calls_enabled').asBoolean();
```

### Kill Switch Features
Features that can be disabled remotely in emergencies:
- AI Companions
- Video Calls
- Calendar Payments
- Events
- Wallet operations (critical emergency only)

### Activating Kill Switch
```bash
# Via Firebase Console
# Remote Config → ai_companions_enabled → false → Publish

# Or via CLI
firebase remoteconfig:set \
  --data '{"ai_companions_enabled": false}' \
  --project production
```

## Version Numbering

### Format
`MAJOR.MINOR.PATCH (BUILD)`

Example: `1.2.3 (45)`

### Increment Rules
- **MAJOR**: Breaking changes, major new features
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes, minor improvements
- **BUILD**: Auto-incremented for each build

### Update Version
```json
// app.json
{
  "expo": {
    "version": "1.2.3",
    "android": {
      "versionCode": 45
    },
    "ios": {
      "buildNumber": "45"
    }
  }
}
```

## Release Checklist

### Pre-Build
- [ ] Update version numbers
- [ ] Update changelog
- [ ] Test all features thoroughly
- [ ] Run automated tests
- [ ] Check feature flags configuration

### Android Pre-Submit
- [ ] Test APK on physical devices
- [ ] Verify signing configuration
- [ ] Check ProGuard rules (if enabled)
- [ ] Verify permissions
- [ ] Test in-app purchases
- [ ] Verify deep linking

### iOS Pre-Submit
- [ ] Test on physical devices
- [ ] Verify provisioning profiles
- [ ] Check Info.plist
- [ ] Test on different iOS versions
- [ ] Verify in-app purchases
- [ ] Test push notifications

### Post-Submit
- [ ] Monitor crash reports (Crashlytics)
- [ ] Check user reviews
- [ ] Monitor server logs
- [ ] Track key metrics
- [ ] Be ready for hotfix if needed

## Emergency Procedures

### Critical Bug After Release

#### Option 1: Remote Fix (Preferred)
1. Disable affected feature via Remote Config
2. Fix bug in codebase
3. Release patch version
4. Re-enable feature

#### Option 2: Emergency Patch
1. Create hotfix branch
2. Fix critical bug
3. Fast-track testing
4. Build and submit urgently
5. Request expedited review

### App Store Rejection

#### Common Reasons
- Crashes on launch
- Broken features
- Privacy policy issues
- In-app purchase problems
- Design guideline violations

#### Response Process
1. Read rejection reason carefully
2. Fix the issue
3. Respond to reviewer with explanation
4. Resubmit immediately
5. Request phone call if unclear

## Monitoring

### Crashlytics
```typescript
import crashlytics from '@react-native-firebase/crashlytics';

// Log non-fatal error
crashlytics().recordError(new Error('Something went wrong'));

// Set user attributes
crashlytics().setUserId(userId);
crashlytics().setAttribute('subscription', 'premium');
```

### Analytics
Track key metrics:
- App opens
- Feature usage
- Conversion rates
- Crash-free users
- Retention rates

### Alerts
Set up alerts for:
- Crash rate > 1%
- ANR rate > 0.5%
- API errors > 5%
- Payment failures > 2%

## App Store Credentials

### Android (Google Play)
Required:
- Service account JSON key
- Play Console access

Store in GitHub Secrets:
- `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY`

### iOS (App Store)
Required:
- Apple Developer account
- App Store Connect access
- API Key (for automation)

Store in GitHub Secrets:
- `APPLE_KEY_ID`
- `APPLE_ISSUER_ID`
- `APPLE_PRIVATE_KEY`

## Testing Requirements

### Before Internal Release
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing on dev environment
- [ ] No known critical bugs

### Before Production Release
- [ ] All staging tests pass
- [ ] Performance testing complete
- [ ] Security audit passed
- [ ] Legal compliance verified
- [ ] Internal team approval
- [ ] Staged rollout plan ready

## Rollback Strategy

### If Critical Issue Found

#### Android
1. Halt rollout in Google Play Console
2. Use previous APK/AAB to roll forward
3. Or wait for users to naturally upgrade when fixed

#### iOS
1. Remove from sale temporarily
2. Submit fixed version with expedited review
3. Re-enable sales when fixed

### Cannot Rollback
Mobile apps cannot be rolled back to previous versions. Users keep what they downloaded. Must roll forward with fixes.

## Best Practices

1. **Always test on real devices** before production
2. **Use staged rollouts** for gradual deployment
3. **Monitor actively** during first 48 hours
4. **Have hotfix ready** for critical issues
5. **Use feature flags** for risky features
6. **Keep version notes** updated
7. **Communicate** with users about issues
8. **Learn from incidents** and improve process

## Resources

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [EAS Submit Documentation](https://docs.expo.dev/submit/introduction/)
- [Google Play Console](https://play.google.com/console)
- [App Store Connect](https://appstoreconnect.apple.com/)
- [Firebase Remote Config](https://firebase.google.com/docs/remote-config)