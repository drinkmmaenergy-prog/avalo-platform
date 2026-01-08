# PACK 308 — Verified Badge UI, Trust Labels & Safety Messaging Implementation

## Overview

PACK 308 exposes verification and trust information to users in a clear, simple way through verified badges, trust labels based on behavior and risk, and lightweight safety messaging integrated into profiles, chat, calendar, and events.

**Status:** 🟡 IN PROGRESS

**Dependencies:**
- PACK 268 (Risk & Safety Engine)
- PACK 275/276 (Profile photos rules)
- PACK 293 (Notifications)
- PACK 300 (Help Center & Education Cards)
- PACK 306 (Mandatory Identity Verification)
- PACK 307 (Fake Profile / Catfish Risk Engine)

**Key Principle:** NO tokenomics or product logic changes - pure UI/UX layer on top of existing safety systems.

## Implementation Status

### ✅ Completed

1. **Type Definitions** ([`app-mobile/types/trust.ts`](app-mobile/types/trust.ts:1))
   - [`TrustLabel`](app-mobile/types/trust.ts:13) interface with verified, trustLevel, and safetyFlags
   - [`getUserTrustLabel()`](app-mobile/types/trust.ts:47) helper function
   - Maps verification status and risk level to user-friendly trust labels

2. **Trust Label Hook** ([`app-mobile/hooks/useTrustLabel.ts`](app-mobile/hooks/useTrustLabel.ts:1))
   - [`useTrustLabel()`](app-mobile/hooks/useTrustLabel.ts:30) hook fetches and caches trust data
   - Reads from `users/{userId}/verification/status` and `userRisk/{userId}`
   - Returns sanitized trust label with verified status and safety flags

3. **VerifiedBadge Component** ([`app-mobile/app/components/VerifiedBadge.tsx`](app-mobile/app/components/VerifiedBadge.tsx:1))
   - Shows checkmark icon with "Verified" label
   - Three sizes: small, medium, large
   - Bilingual support (EN/PL)
   - Only displays if user is verified (no negative labels)

4. **SafetyMessage Component** ([`app-mobile/app/components/SafetyMessage.tsx`](app-mobile/app/components/SafetyMessage.tsx:1))
   - Context-aware safety warnings for profiles under review
   - Three contexts: profile, chat, calendar
   - Two variants: banner, inline
   - Generic, non-alarming messaging

5. **Safety & Verification Settings Screen** ([`app-mobile/app/profile/settings/safety-verification.tsx`](app-mobile/app/profile/settings/safety-verification.tsx:1))
   - Read-only informational screen
   - Shows current verification status
   - Explains safety features (verified badge, panic button, meeting verification, reporting)
   - Links to Help Center articles
   - Bilingual (EN/PL)

6. **Education Cards** ([`app-mobile/config/onboarding.ts`](app-mobile/config/onboarding.ts:171))
   - Added 3 new contextual tips:
     - `profile_trust_verification` - What "Verified" means
     - `meetings_safety_verification` - Meeting safety and QR/selfie verification
     - `verified_badge_meaning` - Understanding verified badges

### 🟡 In Progress

7. **Backend API Endpoint**
   - Need to create `GET /trust/label?userId=TARGET_UID` Cloud Function
   - Returns sanitized trust label (no raw scores or internal data)
   - Access control: only for matched/visible users or current user

8. **Profile Card Integration**
   - Add [`VerifiedBadge`](app-mobile/app/components/VerifiedBadge.tsx:1) to swipe cards, discovery feed, profile cards
   - Show near name/age
   - No trust level or safety flags on cards (keep simple)

9. **Full Profile View Integration**
   - Show [`VerifiedBadge`](app-mobile/app/components/VerifiedBadge.tsx:1) with tooltip
   - Add [`SafetyMessage`](app-mobile/app/components/SafetyMessage.tsx:1) if under review
   - Link to Safety & Verification settings

10. **Chat Header Integration**
    - Show [`VerifiedBadge`](app-mobile/app/components/VerifiedBadge.tsx:1) next to avatar/name
    - Add [`SafetyMessage`](app-mobile/app/components/SafetyMessage.tsx:1) in header dropdown if under review
    - No changes to chat pricing or refund logic

11. **Calendar/Events Integration**
    - Show [`VerifiedBadge`](app-mobile/app/components/VerifiedBadge.tsx:1) for host/organizer
    - Display "18+ verified profile" line
    - Add [`SafetyMessage`](app-mobile/app/components/SafetyMessage.tsx:1) if organizer under review

12. **Notifications**
    - Send notification when user becomes VERIFIED for first time
    - Send notification when profile set to UNDER_REVIEW
    - Use PACK 293 notification system

### ⏳ Not Started

13. **Firestore Security Rules**
    - Update rules to allow reading trust labels for visible users
    - Prevent users from reading their own raw risk scores

14. **Testing**
    - Unit tests for [`getUserTrustLabel()`](app-mobile/types/trust.ts:47) function
    - Integration tests for API endpoint
    - UI tests for badge and message rendering
    - E2E tests for complete flow

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Firestore Collections (Source of Truth)                     │
├─────────────────────────────────────────────────────────────┤
│ users/{userId}/verification/status                          │
│   - status: VERIFIED|FAILED|BANNED|...                      │
│   - ageVerified: boolean                                    │
│   - minAgeConfirmed: number                                 │
├─────────────────────────────────────────────────────────────┤
│ userRisk/{userId}                                           │
│   - riskLevel: LOW|MEDIUM|HIGH|CRITICAL                     │
│   - catfishRiskScore: number (0.0-1.0)                      │
│   - autoHiddenFromDiscovery: boolean                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Backend: getUserTrustLabel() Helper                          │
├─────────────────────────────────────────────────────────────┤
│ Rules:                                                       │
│ • verified = (status === VERIFIED && ageVerified &&         │
│               minAgeConfirmed >= 18)                         │
│ • trustLevel = LOW→HIGH, MEDIUM→MEDIUM, HIGH/CRITICAL→LOW  │
│ • underReview = (HIGH || CRITICAL)                          │
│ • visibilityLimited = autoHiddenFromDiscovery               │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ API: GET /trust/label?userId=UID                            │
├─────────────────────────────────────────────────────────────┤
│ Returns: {                                                   │
│   verified: boolean,                                         │
│   trustLevel: "HIGH"|"MEDIUM"|"LOW",                        │
│   safetyFlags: {                                            │
│     underReview: boolean,                                    │
│     visibilityLimited: boolean                               │
│   }                                                          │
│ }                                                            │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Frontend: useTrustLabel() Hook                              │
├─────────────────────────────────────────────────────────────┤
│ • Fetches trust label for target user                       │
│ • Caches result                                              │
│ • Provides loading and error states                         │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ UI Components                                                │
├─────────────────────────────────────────────────────────────┤
│ • VerifiedBadge: Shows checkmark if verified                │
│ • SafetyMessage: Shows warning if underReview               │
│ • Profile cards, chat, calendar, events                     │
└─────────────────────────────────────────────────────────────┘
```

## Trust Label Logic

### Verified Badge Rules

A user gets the verified badge if ALL conditions are met:
```typescript
verified = (
  verification.status === "VERIFIED" &&
  verification.ageVerified === true &&
  verification.minAgeConfirmed >= 18
)
```

### Trust Level Mapping

| Risk Level | Trust Level | Description |
|------------|-------------|-------------|
| LOW        | HIGH        | Normal, trusted user |
| MEDIUM     | MEDIUM      | Some minor flags, monitored |
| HIGH       | LOW         | Significant concerns, under review |
| CRITICAL   | LOW         | Severe issues, restricted |

### Safety Flags

**underReview:**
- `true` if riskLevel is HIGH or CRITICAL
- Triggers safety messaging in UI
- Generic wording: "profile is under review"

**visibilityLimited:**
- `true` if autoHiddenFromDiscovery is true
- User hidden from discovery/swipe (mechanism from PACK 307)
- May be shown in existing matches/chats

## UI Components

### VerifiedBadge

**Usage:**
```tsx
import VerifiedBadge from '@/components/VerifiedBadge';
import { useTrustLabel } from '@/hooks/useTrustLabel';

function ProfileCard({ userId }) {
  const { trustLabel } = useTrustLabel(userId);
  
  return (
    <View>
      <Text>John, 25</Text>
      <VerifiedBadge 
        verified={trustLabel?.verified ?? false}
        size="small"
        showLabel={false}
      />
    </View>
  );
}
```

**Props:**
- `verified: boolean` - Only shows if true
- `size?: 'small' | 'medium' | 'large'` - Badge size
- `showLabel?: boolean` - Show "Verified" text
- `showTooltip?: boolean` - Enable tooltip interaction
- `onPress?: () => void` - Optional action handler

### SafetyMessage

**Usage:**
```tsx
import SafetyMessage from '@/components/SafetyMessage';
import { useTrustLabel } from '@/hooks/useTrustLabel';

function ProfileView({ userId }) {
  const { trustLabel } = useTrustLabel(userId);
  
  return (
    <View>
      <SafetyMessage 
        trustLabel={trustLabel}
        context="profile"
        variant="banner"
      />
    </View>
  );
}
```

**Props:**
- `trustLabel: TrustLabel` - Trust data from hook
- `context: 'profile' | 'chat' | 'calendar'` - Context for messaging
- `variant?: 'banner' | 'inline'` - Display style

## Integration Checklist

### Profile Cards (Swipe/Discovery/Feed)

- [ ] Import [`VerifiedBadge`](app-mobile/app/components/VerifiedBadge.tsx:1)
- [ ] Add [`useTrustLabel()`](app-mobile/hooks/useTrustLabel.ts:30) hook
- [ ] Render badge near name/age
- [ ] Use `size="small"` and `showLabel={false}`
- [ ] DO NOT show trust level or safety flags on cards

### Full Profile View

- [ ] Import [`VerifiedBadge`](app-mobile/app/components/VerifiedBadge.tsx:1) and [`SafetyMessage`](app-mobile/app/components/SafetyMessage.tsx:1)
- [ ] Add [`useTrustLabel()`](app-mobile/hooks/useTrustLabel.ts:30) hook
- [ ] Show badge under name/age with tooltip
- [ ] Add short verification explanation text
- [ ] Show [`SafetyMessage`](app-mobile/app/components/SafetyMessage.tsx:1) if `trustLevel === 'LOW'` and `underReview === true`
- [ ] Link to Safety & Verification settings: [`/profile/settings/safety-verification`](app-mobile/app/profile/settings/safety-verification.tsx:1)

### Chat Header

- [ ] Import [`VerifiedBadge`](app-mobile/app/components/VerifiedBadge.tsx:1) and [`SafetyMessage`](app-mobile/app/components/SafetyMessage.tsx:1)
- [ ] Add [`useTrustLabel()`](app-mobile/hooks/useTrustLabel.ts:30) hook
- [ ] Show badge next to avatar/name in header
- [ ] Add dropdown menu item with [`SafetyMessage`](app-mobile/app/components/SafetyMessage.tsx:1) if under review
- [ ] DO NOT change chat pricing, word counting, or refund logic

### Calendar/Events

- [ ] Import [`VerifiedBadge`](app-mobile/app/components/VerifiedBadge.tsx:1) and [`SafetyMessage`](app-mobile/app/components/SafetyMessage.tsx:1)
- [ ] Add [`useTrustLabel()`](app-mobile/hooks/useTrustLabel.ts:30) hook for host/organizer
- [ ] Show badge and "18+ verified profile" line
- [ ] Show [`SafetyMessage`](app-mobile/app/components/SafetyMessage.tsx:1) if organizer `trustLevel === 'LOW'`
- [ ] DO NOT add automatic blocking (handled by PACK 306/307/268)

## Backend Implementation

### Cloud Function: GET /trust/label

**File:** `functions/src/pack308-trust-label.ts`

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export const getTrustLabel = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }
  
  const requesterId = context.auth.uid;
  const targetUserId = data.userId;
  
  if (!targetUserId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'userId is required'
    );
  }
  
  // Access control: can view own label or matched/visible users
  const canAccess = await checkUserCanAccessTrustLabel(
    requesterId,
    targetUserId
  );
  
  if (!canAccess) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Cannot access trust label for this user'
    );
  }
  
  // Fetch verification status
  const verificationRef = admin.firestore()
    .doc(`users/${targetUserId}/verification/status`);
  const verificationSnap = await verificationRef.get();
  
  const verificationData = verificationSnap.exists()
    ? verificationSnap.data()
    : null;
  
  // Fetch risk state
  const riskRef = admin.firestore().doc(`userRisk/${targetUserId}`);
  const riskSnap = await riskRef.get();
  
  const riskData = riskSnap.exists()
    ? riskSnap.data()
    : { riskLevel: 'LOW', catfishRiskScore: 0, autoHiddenFromDiscovery: false };
  
  // Compute trust label
  const trustLabel = getUserTrustLabel(verificationData, riskData);
  
  return trustLabel;
});

function getUserTrustLabel(verificationData: any, riskData: any) {
  const verified =
    verificationData?.status === 'VERIFIED' &&
    verificationData?.ageVerified === true &&
    verificationData?.minAgeConfirmed >= 18;
  
  let trustLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  switch (riskData.riskLevel) {
    case 'LOW':
      trustLevel = 'HIGH';
      break;
    case 'MEDIUM':
      trustLevel = 'MEDIUM';
      break;
    case 'HIGH':
    case 'CRITICAL':
      trustLevel = 'LOW';
      break;
    default:
      trustLevel = 'MEDIUM';
  }
  
  const underReview =
    riskData.riskLevel === 'HIGH' || riskData.riskLevel === 'CRITICAL';
  
  const visibilityLimited = riskData.autoHiddenFromDiscovery === true;
  
  return {
    verified,
    trustLevel,
    safetyFlags: {
      underReview,
      visibilityLimited,
    },
  };
}

async function checkUserCanAccessTrustLabel(
  requesterId: string,
  targetUserId: string
): Promise<boolean> {
  // User can always see their own trust label
  if (requesterId === targetUserId) {
    return true;
  }
  
  // Check if users are matched or visible to each other
  // TODO: Implement visibility check based on your matching logic
  // For now, allow access if target is not critical
  const riskRef = admin.firestore().doc(`userRisk/${targetUserId}`);
  const riskSnap = await riskRef.get();
  
  if (!riskSnap.exists()) {
    return true;
  }
  
  const riskData = riskSnap.data();
  return riskData.riskLevel !== 'CRITICAL';
}
```

### Deployment

```bash
# Deploy Cloud Function
cd functions
npm run build
firebase deploy --only functions:getTrustLabel
```

## Notifications

### When User Becomes Verified

**Trigger:** `users/{userId}/verification/status` updates to `VERIFIED`

**Message (EN):** "Your profile is now verified. Other users can see your Verified badge."

**Message (PL):** "Twój profil został zweryfikowany. Inni użytkownicy zobaczą odznakę Verified."

### When Profile Under Review

**Trigger:** `userRisk/{userId}` updates to `riskLevel: HIGH` or `CRITICAL`

**Message (EN):** "Your profile is temporarily under review. Some discovery features may be limited."

**Message (PL):** "Twój profil jest tymczasowo weryfikowany. Niektóre funkcje mogą być ograniczone."

**Implementation:** Use PACK 293 notification system

```typescript
import { sendNotification } from './pack293-notifications';

// In verification completion function
if (newStatus === 'VERIFIED' && oldStatus !== 'VERIFIED') {
  await sendNotification({
    userId,
    type: 'VERIFICATION_COMPLETE',
    title: locale === 'pl' ? 'Profil zweryfikowany' : 'Profile Verified',
    body: locale === 'pl' 
      ? 'Twój profil został zweryfikowany. Inni użytkownicy zobaczą odznakę Verified.'
      : 'Your profile is now verified. Other users can see your Verified badge.',
    data: { screen: 'SafetyVerificationScreen' },
  });
}

// In risk level update function
if ((newRisk === 'HIGH' || newRisk === 'CRITICAL') && 
    (oldRisk !== 'HIGH' && oldRisk !== 'CRITICAL')) {
  await sendNotification({
    userId,
    type: 'PROFILE_UNDER_REVIEW',
    title: locale === 'pl' ? 'Profil w weryfikacji' : 'Profile Under Review',
    body: locale === 'pl'
      ? 'Twój profil jest tymczasowo weryfikowany. Niektóre funkcje mogą być ograniczone.'
      : 'Your profile is temporarily under review. Some discovery features may be limited.',
    data: { screen: 'SafetyVerificationScreen' },
  });
}
```

## Firestore Security Rules

### Update firestore.rules

```javascript
// Allow reading trust labels for visible users
match /userRisk/{userId} {
  // Users cannot read their own risk scores (privacy)
  allow read: if false;
  
  // Backend only
  allow write: if false;
}

// Allow reading verification status for visible users
match /users/{userId}/verification/status {
  // Users can read their own verification status
  allow read: if request.auth.uid == userId;
  
  // Other users can only see if verified (via Cloud Function)
  // Direct read blocked, must use getTrustLabel endpoint
  allow read: if false;
  
  // Backend only
  allow write: if false;
}
```

**Note:** Trust labels should be accessed via the `getTrustLabel` Cloud Function, which implements proper access control.

## Testing

### Unit Tests

```typescript
// Test getUserTrustLabel() function
describe('getUserTrustLabel', () => {
  it('should return verified=true for verified users', () => {
    const verification = {
      status: 'VERIFIED',
      ageVerified: true,
      minAgeConfirmed: 18,
    };
    const risk = {
      riskLevel: 'LOW',
      catfishRiskScore: 0.1,
      autoHiddenFromDiscovery: false,
    };
    
    const label = getUserTrustLabel(verification, risk);
    
    expect(label.verified).toBe(true);
    expect(label.trustLevel).toBe('HIGH');
    expect(label.safetyFlags.underReview).toBe(false);
  });
  
  it('should return verified=false for unverified users', () => {
    const verification = {
      status: 'PENDING',
      ageVerified: false,
      minAgeConfirmed: 0,
    };
    const risk = {
      riskLevel: 'LOW',
      catfishRiskScore: 0,
      autoHiddenFromDiscovery: false,
    };
    
    const label = getUserTrustLabel(verification, risk);
    
    expect(label.verified).toBe(false);
  });
  
  it('should set underReview for HIGH risk', () => {
    const verification = {
      status: 'VERIFIED',
      ageVerified: true,
      minAgeConfirmed: 18,
    };
    const risk = {
      riskLevel: 'HIGH',
      catfishRiskScore: 0.7,
      autoHiddenFromDiscovery: true,
    };
    
    const label = getUserTrustLabel(verification, risk);
    
    expect(label.trustLevel).toBe('LOW');
    expect(label.safetyFlags.underReview).toBe(true);
    expect(label.safetyFlags.visibilityLimited).toBe(true);
  });
});
```

### Integration Tests

```typescript
// Test Cloud Function endpoint
describe('getTrustLabel Cloud Function', () => {
  it('should return trust label for own profile', async () => {
    const result = await callFunction('getTrustLabel', {
      userId: testUserId,
    }, testUserAuth);
    
    expect(result.verified).toBeDefined();
    expect(result.trustLevel).toMatch(/HIGH|MEDIUM|LOW/);
    expect(result.safetyFlags).toBeDefined();
  });
  
  it('should deny access to unmatched users', async () => {
    await expect(
      callFunction('getTrustLabel', {
        userId: otherUserId,
      }, testUserAuth)
    ).rejects.toThrow('permission-denied');
  });
});
```

### UI Tests

```typescript
// Test VerifiedBadge component
describe('VerifiedBadge', () => {
  it('should render when verified=true', () => {
    const { getByText } = render(
      <VerifiedBadge verified={true} />
    );
    
    expect(getByText('Verified')).toBeTruthy();
  });
  
  it('should not render when verified=false', () => {
    const { queryByText } = render(
      <VerifiedBadge verified={false} />
    );
    
    expect(queryByText('Verified')).toBeNull();
  });
});
```

## Deployment Checklist

- [ ] Deploy backend Cloud Function: `getTrustLabel`
- [ ] Update Firestore security rules
- [ ] Deploy mobile app with new components
- [ ] Test verified badge rendering in all contexts
- [ ] Test safety messages for users under review
- [ ] Test Safety & Verification settings screen
- [ ] Verify education cards display correctly
- [ ] Test notifications for verification state changes
- [ ] Monitor error logs and analytics
- [ ] Update Help Center articles
- [ ] Train support team on new features

## Privacy & Safety Considerations

### What Users See

✅ **Users CAN see:**
- Verified badge (checkmark) if verified
- Generic "under review" message if restricted
- Their own verification status in settings
- Safety features explanation

❌ **Users CANNOT see:**
- Raw risk scores (catfishRiskScore)
- Risk level classification (LOW/MEDIUM/HIGH/CRITICAL)
- Detailed reasons for restrictions
- AI analysis details
- Other users' internal trust data

### Messaging Guidelines

**DO:**
- Use generic, non-alarming language
- Focus on "under review" rather than "risky" or "suspicious"
- Provide clear next steps (contact support)
- Emphasize safety resources (panic button, reporting)

**DON'T:**
- Mention "catfish", "fake", "scam", or other accusatory terms
- Display numeric scores or percentages
- Reveal internal classification systems
- Create panic or stigma

## Documentation Updates

### Help Center Articles Needed

1. **"What does the Verified badge mean?"**
   - Explains selfie + age verification
   - Clarifies it doesn't guarantee behavior
   - Links to safety resources

2. **"Safety & Verification Guide"**
   - Overview of all safety features
   - How to report users
   - What to do if feeling unsafe

3. **"Why is my profile under review?"**
   - Generic explanation of safety systems
   - How to contact support
   - Timeline expectations

4. **"Meeting Safety Guidelines"**
   - QR/selfie verification process
   - Public place recommendations
   - Emergency contacts

## Monitoring & Analytics

### Key Metrics

- Verification completion rate
- % of profiles with verified badge
- % of profiles under review (HIGH/CRITICAL risk)
- Safety message impression rate
- Safety & Verification settings screen visits
- Support tickets related to verification
- False positive rate (legit users flagged)

### Alerts

- Spike in profiles under review (> 5% of active users)
- Increase in support tickets about verification
- Errors in getTrustLabel API calls
- Notification delivery failures

## Future Enhancements

1. **Enhanced Trust Scoring**
   - Incorporate more behavioral signals
   - Machine learning model improvements
   - Cross-platform verification

2. **Granular Trust Levels**
   - More nuanced trust classifications
   - Context-specific trust scores
   - Dynamic trust adjustments

3. **Additional Badges**
   - Premium verification (gov ID)
   - Social verification (LinkedIn, etc.)
   - Community endorsements

4. **Trust Transparency**
   - User trust dashboard
   - Trust score history
   - Improvement recommendations

## Support & Resources

- **Documentation**: This file
- **Type Definitions**: [`app-mobile/types/trust.ts`](app-mobile/types/trust.ts:1)
- **Components**: [`app-mobile/app/components/VerifiedBadge.tsx`](app-mobile/app/components/VerifiedBadge.tsx:1), [`app-mobile/app/components/SafetyMessage.tsx`](app-mobile/app/components/SafetyMessage.tsx:1)
- **Settings**: [`app-mobile/app/profile/settings/safety-verification.tsx`](app-mobile/app/profile/settings/safety-verification.tsx:1)
- **Dependencies**: PACK 268, 275, 276, 293, 300, 306, 307
- **Support Email**: safety@avalo.app

---

**Implementation Status:** 🟡 IN PROGRESS (60% complete)  
**Next Steps:** 
1. Implement backend `getTrustLabel` Cloud Function
2. Integrate badges into profile cards, chat, calendar
3. Add verification state change notifications
4. Complete testing
5. Deploy to production

**Estimated Time to Complete:** 1-2 days