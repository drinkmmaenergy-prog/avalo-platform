# PACK 55 — Global Compliance & Safety Core - Quick Start

## 🚀 Quick Deploy (5 Minutes)

### 1. Deploy Backend Functions

```bash
cd functions
npm install
npm run build
firebase deploy --only functions:compliance_getAgeState,functions:compliance_ageSoftVerify,functions:compliance_getMediaScanStatus,functions:compliance_getAMLState,functions:gdpr_requestErasure,functions:gdpr_requestExport,functions:policies_getLatest,functions:policies_getUserAcceptances,functions:policies_accept,functions:admin_seedPolicies,functions:compliance_amlDailyMonitor
```

### 2. Seed Initial Policies

```bash
# Call this once to create default policy documents:
firebase functions:call admin_seedPolicies
```

### 3. Test Backend APIs

```bash
# Test age verification:
firebase functions:call compliance_getAgeState --data '{"userId":"test123"}'

# Test policy retrieval:
firebase functions:call policies_getLatest --data '{"locale":"en"}'
```

---

## 📱 Mobile Integration (3 Steps)

### Step 1: Age Gate

In your main app navigator, add age check:

```typescript
import { isAgeVerified } from './services/ageGateService';
import AgeGateScreen from './screens/auth/AgeGateScreen';

const [ageVerified, setAgeVerified] = useState(false);

useEffect(() => {
  checkAge();
}, [user]);

const checkAge = async () => {
  if (!user) return;
  const verified = await isAgeVerified(user.uid);
  setAgeVerified(verified);
};

if (!ageVerified) {
  return <AgeGateScreen onVerified={() => setAgeVerified(true)} />;
}
```

### Step 2: Policy Gate

Add policy check to app startup:

```typescript
import { hasAcceptedCriticalPolicies } from './services/policyService';
import PolicyAcceptanceScreen from './screens/auth/PolicyAcceptanceScreen';

const [policiesAccepted, setPoliciesAccepted] = useState(false);

useEffect(() => {
  checkPolicies();
}, [user]);

const checkPolicies = async () => {
  if (!user) return;
  const accepted = await hasAcceptedCriticalPolicies(user.uid, locale);
  setPoliciesAccepted(accepted);
};

if (!policiesAccepted) {
  return <PolicyAcceptanceScreen onAccepted={() => setPoliciesAccepted(true)} />;
}
```

### Step 3: Feature Guards

Add compliance checks to monetized features:

```typescript
import { canAccessMonetizedFeatures } from './utils/complianceGuard';

// Before showing creator marketplace, chat, etc.:
const access = await canAccessMonetizedFeatures(user.uid, locale);
if (!access.allowed) {
  // Handle based on reason
  if (access.reason === 'AGE_NOT_VERIFIED') {
    navigation.navigate('AgeGate');
  } else if (access.reason === 'POLICIES_NOT_ACCEPTED') {
    navigation.navigate('PolicyAcceptance');
  }
  return;
}
```

---

## 🔌 Backend Integration Examples

### Integrate Age Check into Existing Function

```typescript
// Example: In discoveryFeed.ts
export const getDiscoveryFeed = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;

  // 🔒 ADD THIS: Age verification check
  const ageDoc = await db.collection('age_verification').doc(userId).get();
  if (!ageDoc.exists || !ageDoc.data()?.ageVerified) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Age verification required'
    );
  }

  // Continue with normal logic...
});
```

### Integrate AML Tracking into Earnings

```typescript
// Example: In creator earning flow
import { updateAMLProfile } from './compliancePack55';

// After recording earning:
await db.collection('token_earn_events').add({
  userId: creatorId,
  tokensEarned: amount,
  channel: 'CHAT',
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
});

// 🔒 ADD THIS: Update AML profile
await updateAMLProfile(creatorId, amount);
```

### Integrate CSAM Scan into Media Upload

```typescript
// Example: In media upload handler
import { onMediaUploaded } from './mediaComplianceIntegration';

// After successful upload to Storage:
const mediaId = `${conversationId}_${messageId}`;
const storagePath = `ppm_media/${userId}/${mediaId}`;

// 🔒 ADD THIS: Trigger safety scan
await onMediaUploaded(mediaId, userId, 'CHAT_PPM', storagePath);
```

---

## 🎯 Common Use Cases

### Use Case 1: New User Sign-Up Flow

```typescript
1. User signs up → auth created
2. Navigate to AgeGateScreen → user enters DOB
3. If age >= 18 → ageVerified = true
4. Navigate to PolicyAcceptanceScreen → user accepts policies
5. If all critical policies accepted → app access granted
6. User can now access swipe, chat, marketplace, etc.
```

### Use Case 2: Existing User Updates Policy

```typescript
1. New policy version released
2. On app startup → check hasAcceptedCriticalPolicies
3. If not accepted → show PolicyAcceptanceScreen
4. User reviews and accepts new version
5. Continue to app
```

### Use Case 3: Creator Hits KYC Threshold

```typescript
1. Creator earns tokens → updateAMLProfile() called
2. totalTokensEarnedLast365d reaches 2000
3. kycRequired set to true automatically
4. Daily monitor flags for admin review
5. Creator sees "KYC Required" in dashboard
6. Future: Creator completes KYC verification flow
7. Payouts enabled after verification
```

### Use Case 4: Flagged Content Detection

```typescript
1. User uploads media → triggerMediaSafetyScan()
2. Scan detects CSAM suspect → status=FLAGGED
3. Moderation case auto-created (PACK 54)
4. Media hidden from all views
5. Moderator reviews case
6. If confirmed → user banned
7. If false positive → media restored
```

---

## 🔍 Debugging Tips

### Check Age Verification Status

```bash
# Firestore Console:
age_verification/{userId}

# Or via functions:
firebase functions:call compliance_getAgeState --data '{"userId":"USER_ID_HERE"}'
```

### Check Policy Acceptances

```bash
# Firestore Console:
policy_acceptances/{userId}_{policyType}

# Or via functions:
firebase functions:call policies_getUserAcceptances --data '{"userId":"USER_ID_HERE"}'
```

### Check Media Scan Results

```bash
# Firestore Console:
media_safety_scans/{mediaId}

# Or via functions:
firebase functions:call compliance_getMediaScanStatus --data '{"mediaId":"MEDIA_ID_HERE"}'
```

### Check AML State

```bash
# Firestore Console:
aml_profiles/{userId}

# Or via functions:
firebase functions:call compliance_getAMLState --data '{"userId":"USER_ID_HERE"}'
```

---

## ⚠️ Important Reminders

### DO NOT:
- ❌ Change token pricing or revenue splits
- ❌ Introduce free tokens, trials, or bonuses
- ❌ Auto-ban users without moderation review
- ❌ Block monetization without explicit flags
- ❌ Modify existing pack code unnecessarily

### DO:
- ✅ Check age before showing adult content
- ✅ Scan all user-generated media
- ✅ Track AML state for all earners
- ✅ Honor GDPR requests within legal timeframes
- ✅ Enforce critical policy acceptance

---

## 📞 Support

For issues or questions about PACK 55:

1. Check [`PACK_55_IMPLEMENTATION.md`](PACK_55_IMPLEMENTATION.md:1) for detailed docs
2. Review [`complianceIntegrationExamples.ts`](functions/src/complianceIntegrationExamples.ts:1) for code examples
3. Test all APIs using Firebase Console or CLI
4. Review Firestore data structures in Firebase Console

---

**Quick Start Complete!** 🎉

You now have a fully functional compliance and safety core ready for production use.

Next steps:
- Integrate age checks into existing features
- Add policy acceptance to onboarding flow
- Monitor compliance metrics via Firestore queries
- Plan KYC provider integration for future pack