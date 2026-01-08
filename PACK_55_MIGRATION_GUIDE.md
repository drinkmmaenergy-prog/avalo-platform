# PACK 55 — Migration Guide for Existing Features

This guide shows how to integrate PACK 55 compliance checks into existing packs (1-54) without breaking changes.

---

## 🎯 Integration Strategy

**Principle:** All integrations are **opt-in** and **backward compatible**

- Existing code continues to work unchanged
- Add compliance checks incrementally
- No forced refactors required
- Future packs SHOULD use compliance from the start

---

## 📋 Step-by-Step Integration

### Step 1: Add Age Gate to Discovery Feed (PACK 51)

**File:** `functions/src/discoveryFeed.ts`

**Before:**
```typescript
export const getDiscoveryFeed = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;
  
  // Build feed...
});
```

**After:**
```typescript
export const getDiscoveryFeed = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;
  
  // 🔒 ADD: Age verification check
  const ageDoc = await db.collection('age_verification').doc(userId).get();
  if (!ageDoc.exists || !ageDoc.data()?.ageVerified) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Age verification required to access discovery feed',
      { code: 'age_verification_required' }
    );
  }
  
  // Build feed...
  // 🔒 ADD: Filter profiles with flagged media
  const profiles = await buildFeedProfiles(userId);
  const safeProfiles = await filterFlaggedMedia(profiles);
  
  return { profiles: safeProfiles };
});

// 🔒 ADD: Helper function
async function filterFlaggedMedia(profiles: any[]): Promise<any[]> {
  const safe: any[] = [];
  
  for (const profile of profiles) {
    const flaggedScans = await db.collection('media_safety_scans')
      .where('ownerUserId', '==', profile.userId)
      .where('source', '==', 'PROFILE_MEDIA')
      .where('scanStatus', '==', 'FLAGGED')
      .limit(1)
      .get();
    
    if (flaggedScans.empty) {
      safe.push(profile);
    }
  }
  
  return safe;
}
```

---

### Step 2: Add Age Gate to Creator Marketplace (PACK 52)

**File:** `functions/src/creator/index.ts`

**Before:**
```typescript
export const getCreatorMarketplace = functions.https.onCall(async (data, context) => {
  // Get creators...
});
```

**After:**
```typescript
export const getCreatorMarketplace = functions.https.onCall(async (data, context) => {
  // 🔒 ADD: Require authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const userId = context.auth.uid;
  
  // 🔒 ADD: Age verification check
  const ageDoc = await db.collection('age_verification').doc(userId).get();
  if (!ageDoc.exists || !ageDoc.data()?.ageVerified) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Age verification required to access creator marketplace',
      { code: 'age_verification_required' }
    );
  }
  
  // Get creators...
});
```

---

### Step 3: Add AML Tracking to Earnings (PACK 52)

**File:** `functions/src/creator/index.ts`

**Before:**
```typescript
// When creator earns tokens:
await db.collection('token_earn_events').add({
  userId: creatorId,
  tokensEarned: amount,
  channel: 'CHAT',
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
});

// Credit wallet...
```

**After:**
```typescript
import { updateAMLProfile } from '../compliancePack55';

// When creator earns tokens:
await db.collection('token_earn_events').add({
  userId: creatorId,
  tokensEarned: amount,
  channel: 'CHAT',
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
});

// 🔒 ADD: Update AML profile
await updateAMLProfile(creatorId, amount);

// Credit wallet...
```

---

### Step 4: Add CSAM Scan to Media Upload (PACK 47)

**File:** `functions/src/mediaUploadHandler.ts` (or wherever media upload is handled)

**Before:**
```typescript
export const uploadMedia = functions.https.onCall(async (data, context) => {
  // Upload to Storage...
  const storagePath = await uploadToStorage(file);
  
  // Save metadata to Firestore...
  await db.collection('media').add({
    userId,
    storagePath,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  
  return { success: true };
});
```

**After:**
```typescript
import { onMediaUploaded } from './mediaComplianceIntegration';

export const uploadMedia = functions.https.onCall(async (data, context) => {
  // Upload to Storage...
  const storagePath = await uploadToStorage(file);
  
  // Save metadata to Firestore...
  const mediaDoc = await db.collection('media').add({
    userId,
    storagePath,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  
  // 🔒 ADD: Trigger safety scan
  await onMediaUploaded(
    mediaDoc.id,
    userId,
    'PROFILE_MEDIA', // or 'CHAT_PPM', 'MARKETPLACE', etc.
    storagePath
  );
  
  return { success: true };
});
```

---

### Step 5: Mobile - Add Age Gate to App Startup

**File:** `app-mobile/navigation/MainNavigator.tsx` (or main app entry)

**Before:**
```typescript
export default function MainNavigator() {
  const { user } = useAuth();
  
  if (!user) {
    return <AuthStack />;
  }
  
  return <MainTabs />;
}
```

**After:**
```typescript
import { isAgeVerified } from '../services/ageGateService';
import AgeGateScreen from '../screens/auth/AgeGateScreen';

export default function MainNavigator() {
  const { user } = useAuth();
  const [ageVerified, setAgeVerified] = useState<boolean | null>(null);
  
  useEffect(() => {
    if (user) {
      checkAge();
    }
  }, [user]);
  
  const checkAge = async () => {
    if (!user) return;
    const verified = await isAgeVerified(user.uid);
    setAgeVerified(verified);
  };
  
  if (!user) {
    return <AuthStack />;
  }
  
  // 🔒 ADD: Age gate check
  if (ageVerified === null) {
    return <LoadingScreen />;
  }
  
  if (!ageVerified) {
    return <AgeGateScreen onVerified={() => setAgeVerified(true)} />;
  }
  
  return <MainTabs />;
}
```

---

### Step 6: Mobile - Add Policy Gate to App Startup

**After age gate, add policy check:**

```typescript
import { hasAcceptedCriticalPolicies } from '../services/policyService';
import PolicyAcceptanceScreen from '../screens/auth/PolicyAcceptanceScreen';

export default function MainNavigator() {
  const { user } = useAuth();
  const { locale } = useLocaleContext();
  const [ageVerified, setAgeVerified] = useState<boolean | null>(null);
  const [policiesAccepted, setPoliciesAccepted] = useState<boolean | null>(null);
  
  useEffect(() => {
    if (user && ageVerified) {
      checkPolicies();
    }
  }, [user, ageVerified]);
  
  const checkPolicies = async () => {
    if (!user) return;
    const accepted = await hasAcceptedCriticalPolicies(user.uid, locale);
    setPoliciesAccepted(accepted);
  };
  
  if (!user) {
    return <AuthStack />;
  }
  
  if (ageVerified === null) {
    return <LoadingScreen />;
  }
  
  if (!ageVerified) {
    return <AgeGateScreen onVerified={() => setAgeVerified(true)} />;
  }
  
  // 🔒 ADD: Policy gate check
  if (policiesAccepted === null) {
    return <LoadingScreen />;
  }
  
  if (!policiesAccepted) {
    return <PolicyAcceptanceScreen onAccepted={() => setPoliciesAccepted(true)} />;
  }
  
  return <MainTabs />;
}
```

---

### Step 7: Mobile - Guard Monetized Features

**In any monetized feature screen:**

```typescript
import { canAccessMonetizedFeatures } from '../utils/complianceGuard';

const CreatorDashboard = () => {
  const { user } = useAuth();
  const { locale } = useLocaleContext();
  const [canAccess, setCanAccess] = useState(false);
  
  useEffect(() => {
    checkAccess();
  }, [user]);
  
  const checkAccess = async () => {
    if (!user) return;
    
    const result = await canAccessMonetizedFeatures(user.uid, locale);
    
    if (!result.allowed) {
      if (result.reason === 'AGE_NOT_VERIFIED') {
        navigation.navigate('AgeGate');
      } else if (result.reason === 'POLICIES_NOT_ACCEPTED') {
        navigation.navigate('PolicyAcceptance');
      }
      return;
    }
    
    setCanAccess(true);
  };
  
  if (!canAccess) {
    return <LoadingScreen />;
  }
  
  return <ActualDashboard />;
};
```

---

### Step 8: Mobile - Check Media Safety Before Display

**In chat message component or media viewer:**

```typescript
import { isMediaSafe } from '../services/contentSafetyService';

const MediaMessage = ({ messageId, mediaUrl }) => {
  const [isSafe, setIsSafe] = useState<boolean | null>(null);
  
  useEffect(() => {
    checkSafety();
  }, [messageId]);
  
  const checkSafety = async () => {
    const safe = await isMediaSafe(messageId);
    setIsSafe(safe);
  };
  
  if (isSafe === null) {
    return <ActivityIndicator />;
  }
  
  if (!isSafe) {
    return (
      <View style={styles.blocked}>
        <Text style={styles.blockedText}>Content unavailable</Text>
      </View>
    );
  }
  
  return <Image source={{ uri: mediaUrl }} style={styles.media} />;
};
```

---

## 🔄 Rollback Plan

If issues arise, compliance features are isolated and can be disabled:

### Disable Age Gate

```typescript
// In mobile app, temporarily bypass:
const checkAge = async () => {
  setAgeVerified(true); // Skip check
};
```

### Disable Policy Gate

```typescript
// In mobile app,temporarily bypass:
const checkPolicies = async () => {
  setPoliciesAccepted(true); // Skip check
};  
```

### Disable CSAM Scanning

```typescript
// In mediaComplianceIntegration.ts:
export async function onMediaUploaded(...) {
  // Comment out or return early
  return; // Disabled temporarily
}
```

### Disable AML Tracking

```typescript
// In earning flows:
// await updateAMLProfile(userId, amount); // Comment out temporarily
```

**Important:** These are temporary bypasses for emergencies only. Re-enable ASAP to maintain compliance.

---

## 📊 Monitoring Integration Health

### Firestore Queries to Verify Integration

```javascript
// Check how many users are age-verified:
db.collection('age_verification')
  .where('ageVerified', '==', true)
  .count()
  .get();

// Check media scan coverage:
db.collection('media_safety_scans')
  .where('scanStatus', '==', 'SCANNED')
  .count()
  .get();

// Check AML profile creation rate:
db.collection('aml_profiles')
  .orderBy('lastUpdatedAt', 'desc')
  .limit(100)
  .get();

// Check policy acceptance rate:
db.collection('policy_acceptances')
  .count()
  .get();
```

### Cloud Functions Logs

```bash
# Monitor age verification attempts:
firebase functions:log --only compliance_ageSoftVerify

# Monitor media scans:
firebase functions:log | grep "MediaCompliance"

# Monitor AML updates:
firebase functions:log --only compliance_amlDailyMonitor

# Monitor GDPR requests:
firebase functions:log --only gdpr_requestErasure,gdpr_requestExport
```

---

## 🧪 Testing Checklist

### Backend Integration Tests

- [ ] Age verification API responds correctly
- [ ] Under-18 users are blocked
- [ ] Policy acceptance API works
- [ ] Media scans are triggered on upload
- [ ] Flagged media creates moderation cases
- [ ] AML profiles update on earnings
- [ ] KYC flags activate at threshold
- [ ] GDPR requests are queued
- [ ] Policy seeding works

### Mobile Integration Tests

- [ ] Age gate screen appears for unverified users
- [ ] Age verification persists after restart
- [ ] Policy screen appears for non-accepting users
- [ ] Policy acceptance persists
- [ ] Flagged media shows "Content unavailable"
- [ ] Compliance guards block access correctly
- [ ] Cache invalidation works
- [ ] Error handling is graceful

### Cross-Pack Integration Tests

- [ ] Discovery feed checks age ✓
- [ ] Creator marketplace checks age ✓
- [ ] Chat features check age ✓
- [ ] AI companions check age ✓
- [ ] Earnings update AML profiles ✓
- [ ] Media uploads trigger scans ✓
- [ ] Moderation integrates with scans ✓

---

## 🚨 Common Issues & Solutions

### Issue 1: "Age verification required" error

**Cause:** User hasn't submitted age verification  
**Solution:**  
- Guide user to Age Gate screen
- Call `submitSoftAgeVerification()` with valid DOB
- Ensure DOB calculation is correct (18+ requirement)

### Issue 2: Policy acceptance not persisting

**Cause:** Cache not being cleared after acceptance  
**Solution:**
- Check `clearPolicyCaches()` is called after acceptance
- Verify Firestore write succeeded
- Check policy version matches latest version

### Issue 3: Media scans timing out

**Cause:** External scanner not responding (when integrated)  
**Solution:**
- Check scanner provider credentials
- Implement timeout and retry logic
- Fall back to manual review if automated scan fails

### Issue 4: AML profiles not updating

**Cause:** `updateAMLProfile()` not called in earning flow  
**Solution:**
- Review earning event handlers
- Ensure all token crediting paths call AML update
- Run daily monitor to catch up missed earnings

### Issue 5: GDPR requests not processing

**Cause:** No automated processing queue yet (as designed)  
**Solution:**
- Implement scheduled processor function
- Or handle manually via admin UI
- Or integrate with support ticketing system

---

## 🎓 Best Practices

### 1. Always Check Age Before Adult Content

```typescript
// ✅ Good
const ageDoc = await db.collection('age_verification').doc(userId).get();
if (!ageDoc.data()?.ageVerified) {
  throw new functions.https.HttpsError('failed-precondition', 'Age verification required');
}

// ❌ Bad
// Skipping age check for "trusted" users or admins
```

### 2. Scan All User-Generated Media

```typescript
// ✅ Good
await onMediaUploaded(mediaId, userId, source, storagePath);

// ❌ Bad
// Skipping scans for "premium" users or small files
```

### 3. Update AML on All Earnings

```typescript
// ✅ Good
await updateAMLProfile(creatorId, tokensEarned);

// ❌ Bad
// Only updating for large amounts or certain channels
```

### 4. Honor GDPR Requests Promptly

```typescript
// ✅ Good
// Process within 30 days as required by law
// Provide clear status updates to users

// ❌ Bad
// Ignoring requests or delaying indefinitely
```

### 5. Keep Policies Up-to-Date

```typescript
// ✅ Good
// Version all policy changes
// Require re-acceptance on material changes
// Log all acceptances with timestamps

// ❌ Bad
// Updating policies without versioning
// Not tracking user consent
```

---

## 📈 Gradual Rollout Plan

### Phase 1 (Week 1): Backend Only
- Deploy compliance functions
- Seed policy documents
- Monitor but don't enforce

### Phase 2 (Week 2): Policy Gate
- Add PolicyAcceptanceScreen to mobile
- Require acceptance for new users only
- Grandfather existing users (optional)

### Phase 3 (Week 3): Age Gate
- Add AgeGateScreen to mobile
- Require verification for new users
- Prompt existing users on next app update

### Phase 4 (Week 4): Full Enforcement
- Enable all compliance checks
- Enforce on all users
- Monitor metrics and adjust

---

## 🔗 Integration Dependencies

### Required for Full Compliance:

1. **PACK 47 (Media Cloud Delivery):**
   - Media upload handlers must call `onMediaUploaded()`

2. **PACK 52 (Creator Earnings):**
   - Earning events must call `updateAMLProfile()`

3. **PACK 54 (Moderation):**
   - Flagged media creates moderation cases
   - Trust system integrates with risk scores

4. **Mobile Auth Flow:**
   - Age gate integrated into login/signup
   - Policy acceptance before app access

---

## 📝 Code Review Checklist

Before merging compliance integrations:

- [ ] Age checks don't break existing user flows
- [ ] Error messages are user-friendly
- [ ] Cache invalidation is properly implemented
- [ ] No performance degradation from additional checks
- [ ] Compliance data is properly secured (Firestore rules)
- [ ] All sensitive data is server-side only
- [ ] Graceful fallbacks if compliance services fail
- [ ] No free tokens or discounts introduced
- [ ] Economic formulas remain unchanged
- [ ] TypeScript compiles without errors

---

## 🎉 Success = Zero Disruption

**Goal:** Add compliance infrastructure with ZERO negative impact on:
- ✅ User experience (except necessary gates)
- ✅ App performance
- ✅ Existing functionality
- ✅ Token economics
- ✅ Revenue flows
- ✅ Developer workflow

PACK 55 is fully backward compatible and ready for production deployment.

---

**Migration Guide Version:** 1.0.0  
**Last Updated:** January 24, 2025