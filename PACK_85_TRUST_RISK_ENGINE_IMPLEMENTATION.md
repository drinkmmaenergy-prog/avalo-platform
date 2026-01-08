# PACK 85 — Trust & Risk Engine v1 Implementation Guide

## Overview

The Trust & Risk Engine is a backend layer that assigns risk scores and flags to users based on their behavior patterns (reports, blocks, KYC issues, payment fraud, abuse signals). It exposes enforcement decisions to other modules (chat, paid features, payouts, discovery) to control access and throttle suspicious activity.

**Critical Constraints:**
- ✅ No free tokens, bonuses, discounts, cashback, or promo codes
- ✅ No token price changes
- ✅ No revenue split changes (always 65% creator / 35% Avalo)
- ✅ Risk engine does NOT reverse transactions or issue refunds
- ✅ Only controls access/throttling of future actions
- ✅ All decisions are explainable through structured flags (no opaque magic)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Trust & Risk Engine                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Event       │    │   Scoring    │    │ Enforcement  │  │
│  │  Ingestion   │───▶│   Engine     │───▶│   Hooks      │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                    │                    │          │
│         ▼                    ▼                    ▼          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Firestore Collections                       │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │  • user_trust_profile  (risk scores)                 │  │
│  │  • user_trust_events   (event history)               │  │
│  │  • user_trust_audit    (change audit)                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
         │                      │                      │
         ▼                      ▼                      ▼
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   Reports   │       │     KYC     │       │   Payouts   │
│   & Blocks  │       │  Rejection  │       │Restrictions │
└─────────────┘       └─────────────┘       └─────────────┘
```

## Data Model

### 1. `user_trust_profile` Collection

**Document ID:** `userId`

```typescript
{
  userId: string;
  riskScore: number;              // 0-100, higher = riskier
  enforcementLevel: string;       // "NONE" | "SOFT_LIMIT" | "HARD_LIMIT"
  flags: string[];                // e.g., ["POTENTIAL_SPAMMER", "HIGH_REPORT_RATE"]
  lastUpdatedAt: Timestamp;
  version: number;                // Scoring model version (currently 1)
  
  // Optional: Manual override by admin
  manualOverride?: {
    appliedBy: string;            // Admin user ID
    appliedAt: Timestamp;
    reason: string;
    overrideScore?: number;
    overrideEnforcement?: string;
  };
}
```

### 2. `user_trust_events` Collection

**Document ID:** Auto-generated UUID

```typescript
{
  id: string;
  userId: string;                 // User being evaluated
  type: string;                   // Event type (see below)
  weight: number;                 // Numeric contribution to risk score
  meta: {
    reporterId?: string;
    reason?: string;
    sourceModule?: string;
    // ... additional context
  };
  createdAt: Timestamp;
}
```

**Event Types:**
- `REPORT_RECEIVED` (weight: +8)
- `BLOCK_RECEIVED` (weight: +5)
- `KYC_REJECTED` (weight: +20)
- `KYC_BLOCKED` (weight: +40)
- `CHARGEBACK_FILED` (weight: +25)
- `MASS_MESSAGING` (weight: +15)
- `MASS_GIFTING` (weight: +12)
- `PAYOUT_FRAUD_ATTEMPT` (weight: +30)
- `GOOD_BEHAVIOR_DECAY` (weight: -2)

### 3. `user_trust_audit` Collection

**Document ID:** Auto-generated UUID

```typescript
{
  id: string;
  userId: string;
  action: string;                 // "SCORE_CHANGE" | "FLAG_ADDED" | etc.
  previousScore?: number;
  newScore?: number;
  previousEnforcement?: string;
  newEnforcement?: string;
  flags?: string[];
  triggeredBy: string;            // "SYSTEM" or admin user ID
  reason?: string;
  createdAt: Timestamp;
}
```

## Risk Scoring Model

### Base Score
- New users start with risk score = `10` (low risk)

### Thresholds
- **0-24**: `NONE` (no restrictions)
- **25-49**: `SOFT_LIMIT` (throttling, reduced visibility)
- **50-100**: `HARD_LIMIT` (block actions)

### Event Weights
Events from the last **90 days** are summed to calculate the risk score:

```
Risk Score = Base Score (10) + Σ(event weights from last 90 days)
```

Clamped to 0-100 range.

### Decay
Users with no new risk events receive **-2 score reduction every 30 days** (good behavior decay).
Score never goes below 0.

### Flags
Flags are automatically assigned based on patterns:

| Flag | Trigger |
|------|---------|
| `POTENTIAL_SPAMMER` | 5+ blocks OR 3+ reports in 30 days |
| `POTENTIAL_SCAMMER` | 2+ financial harm reports in 30 days |
| `HIGH_REPORT_RATE` | 5+ reports in 30 days |
| `KYC_FRAUD_RISK` | KYC blocked or rejected |
| `PAYMENT_FRAUD_RISK` | Chargebacks or payout fraud attempts |
| `AGGRESSIVE_SENDER` | Mass messaging or gifting detected |

## Backend Integration

### File Structure

```
functions/src/
├── types/
│   └── trustRisk.types.ts          # TypeScript types
├── trustRiskEngine.ts               # Core engine logic
├── trustRiskEndpoints.ts            # Cloud Functions
├── trustRiskIntegrations.ts         # Integration helpers
├── profileSafety.ts                 # ✅ Integrated (reports/blocks)
├── kyc.ts                           # ✅ Integrated (KYC events)
└── index.ts                         # ✅ Exports added

app-mobile/
└── lib/
    └── trustRiskErrors.ts           # Mobile error handling

firestore-rules/
└── pack85-trust-risk-rules.rules   # Security rules
```

### Integration Points

#### 1. **Reports & Blocks** (in [`profileSafety.ts`](functions/src/profileSafety.ts:1))

```typescript
import { onUserReported, onUserBlocked } from './trustRiskIntegrations';

// When user is reported
await onUserReported(reportedUserId, reporterId, reason);

// When user is blocked
await onUserBlocked(blockedUserId, blockerId);
```

#### 2. **KYC Events** (in [`kyc.ts`](functions/src/kyc.ts:1))

```typescript
import { onKycRejected, onKycBlocked } from './trustRiskIntegrations';

// When KYC is rejected
await onKycRejected(userId, documentId, reason);

// When user is blocked from KYC
await onKycBlocked(userId, reason);
```

#### 3. **Chat/Messaging Enforcement**

Before allowing message send:

```typescript
import { checkMessageSendPermission } from './trustRiskIntegrations';

const permission = await checkMessageSendPermission(userId);
if (!permission.allowed) {
  throw new Error(permission.reason); // "ACCOUNT_RESTRICTED"
}
```

#### 4. **Monetized Actions Enforcement**

Before processing paid media, gifts, etc.:

```typescript
import { checkMonetizedContentPermission } from './trustRiskIntegrations';

const permission = await checkMonetizedContentPermission(userId);
if (!permission.allowed) {
  throw new Error(permission.reason); // "FEATURE_RESTRICTED"
}
```

#### 5. **Payout Enforcement**

Before processing payout request:

```typescript
import { checkPayoutPermission } from './trustRiskIntegrations';

const permission = await checkPayoutPermission(userId);
if (!permission.allowed) {
  throw new Error(permission.reason); // "FEATURE_RESTRICTED"
}
```

## Cloud Functions

### User Functions

#### `trustRisk_getUserProfile_callable`
Get user's trust profile with sanitized data.

**Input:**
```typescript
// Uses authenticated user ID
```

**Output:**
```typescript
{
  success: true,
  profile: {
    userId: string,
    riskScore: number,
    enforcementLevel: string,
    flags: string[],
    canSendMessages: boolean,
    canSendGifts: boolean,
    canRequestPayout: boolean,
    canUsePaidFeatures: boolean,
    lastUpdatedAt: string
  }
}
```

### Internal Functions (called by other modules)

#### `trustRisk_logEvent_callable`
Log a trust event.

**Input:**
```typescript
{
  userId: string,
  type: "REPORT_RECEIVED" | "BLOCK_RECEIVED" | ...,
  weightOverride?: number,  // Optional manual weight
  meta?: {
    reporterId?: string,
    reason?: string,
    // ... additional context
  }
}
```

#### `trustRisk_recalculate_callable`
Manually trigger risk score recalculation.

**Input:**
```typescript
{
  userId: string
}
```

### Admin Functions

#### `trustRisk_admin_applyOverride_callable`
Apply manual override (for false positives).

**Input:**
```typescript
{
  userId: string,
  reason: string,              // Required explanation
  overrideScore?: number,      // 0-100
  overrideEnforcement?: string // "NONE" | "SOFT_LIMIT" | "HARD_LIMIT"
}
```

#### `trustRisk_admin_removeOverride_callable`
Remove manual override, return to system calculation.

**Input:**
```typescript
{
  userId: string
}
```

#### `trustRisk_admin_triggerDecay_callable`
Manually trigger good behavior decay (for testing).

#### `trustRisk_admin_triggerRebuild_callable`
Manually rebuild risk scores (use with caution).

### Scheduled Functions

#### `trustRisk_scheduledDecay_scheduled`
Runs daily at 2 AM UTC. Applies good behavior decay to eligible users.

#### `trustRisk_scheduledRebuild_scheduled`
Runs weekly (Sunday 3 AM UTC). Rebuilds all risk scores for consistency.

## Mobile Integration

### Error Handling

Import error utilities:

```typescript
import { handleTrustRiskError } from '@/lib/trustRiskErrors';
```

Example usage in message send:

```typescript
try {
  await sendMessage(recipientId, text);
} catch (error) {
  const errorInfo = handleTrustRiskError(error, 'sendMessage');
  
  if (errorInfo.isTrustRiskError) {
    Alert.alert(
      'Action Restricted',
      errorInfo.message,
      [
        { text: 'OK' },
        { text: 'Contact Support', onPress: () => navigateToSupport() }
      ]
    );
  } else {
    // Handle other errors
  }
}
```

### User-Facing Messages

All error messages are **compliance-safe** and do not reveal internal details:

- ✅ "Your account is currently restricted. Please contact support if you believe this is a mistake."
- ✅ "This feature is currently restricted on your account."
- ❌ Never show: "You have risk score 75" or "Flag: POTENTIAL_SCAMMER"

## Firestore Security Rules

Merge the rules from [`pack85-trust-risk-rules.rules`](firestore-rules/pack85-trust-risk-rules.rules:1) into your main `firestore.rules`:

**Key principles:**
- Users can **read** their own trust profile (sanitized)
- Users **cannot write** trust data (Cloud Functions only)
- Trust events are **not readable** by users (sensitive)
- Admins can read all trust data

## Configuration & Tuning

Default configuration is in [`trustRiskEngine.ts`](functions/src/trustRiskEngine.ts:1):

```typescript
const CONFIG = {
  version: 1,
  baseScore: 10,
  
  eventWeights: {
    REPORT_RECEIVED: 8,
    BLOCK_RECEIVED: 5,
    KYC_REJECTED: 20,
    KYC_BLOCKED: 40,
    CHARGEBACK_FILED: 25,
    MASS_MESSAGING: 15,
    MASS_GIFTING: 12,
    PAYOUT_FRAUD_ATTEMPT: 30,
    GOOD_BEHAVIOR_DECAY: -2,
  },
  
  thresholds: {
    softLimit: 25,
    hardLimit: 50,
  },
  
  decay: {
    enabled: true,
    daysInterval: 30,
    decreaseAmount: 2,
    minimumScore: 0,
  },
  
  flagTriggers: {
    potentialSpammer: {
      blocksReceivedThreshold: 5,
      reportsReceivedThreshold: 3,
      timePeriodDays: 30,
    },
    // ... more triggers
  },
};
```

**To tune:**
1. Adjust event weights for your platform's needs
2. Modify thresholds based on user feedback
3. Change decay rate for forgiveness speed
4. Update flag triggers for detection sensitivity

## Testing

### Manual Testing

1. **Create test user:**
   ```
   Test User ID: test_user_123
   ```

2. **Log test events:**
   ```typescript
   await trustRisk_logEvent_callable({
     userId: 'test_user_123',
     type: 'REPORT_RECEIVED',
     meta: { reason: 'testing' }
   });
   ```

3. **Check profile:**
   ```typescript
   const profile = await trustRisk_getUserProfile_callable();
   console.log(profile);
   ```

4. **Test enforcement:**
   ```typescript
   const permission = await checkMessageSendPermission('test_user_123');
   console.log(permission.allowed); // false if score >= 50
   ```

### Edge Cases

1. **New user:** Score = 10, no flags, NONE enforcement
2. **One report:** Score = 18, no flags, NONE enforcement
3. **Three reports:** Score = 34, POTENTIAL_SPAMMER flag, SOFT_LIMIT
4. **Ten reports:** Score = 90, multiple flags, HARD_LIMIT
5. **Manual override:** Admin sets score = 0, overrides to NONE
6. **Decay:** User with score 30, no events for 30 days → score 28

## Monitoring & Observability

### Key Metrics to Track

1. **Risk Score Distribution**
   - How many users at each enforcement level?
   - Average risk score across platform

2. **Event Volume**
   - Reports per day
   - Blocks per day
   - KYC rejections per day

3. **Enforcement Actions**
   - Messages blocked per day (HARD_LIMIT)
   - Gifts blocked per day
   - Payouts blocked per day

4. **False Positives**
   - Manual overrides applied per week
   - Reasons for overrides

### Logging

The engine logs important events:
```
[TrustRisk] Event logged: REPORT_RECEIVED for user abc123 (weight: 8)
[TrustRisk] Risk recalculated for user abc123: score=35, enforcement=SOFT_LIMIT
[TrustRisk] Manual override applied to user xyz789 by admin (reason: ...)
```

## Admin Operations

### Handling False Positives

When a user is incorrectly flagged:

1. **Investigate:**
   - Review `user_trust_events` for the user
   - Check `user_trust_audit` for history
   - Verify reports/blocks are legitimate

2. **Apply override:**
   ```typescript
   await trustRisk_admin_applyOverride_callable({
     userId: 'affected_user',
     reason: 'False positive: verified good user with coordinated harassment',
     overrideScore: 10,
     overrideEnforcement: 'NONE'
   });
   ```

3. **Monitor:**
   - Override is logged in audit trail
   - User returns to normal scoring after override removed

### Bulk Operations

For platform-wide changes:

1. **Update config** in [`trustRiskEngine.ts`](functions/src/trustRiskEngine.ts:1)
2. **Deploy functions**
3. **Trigger rebuild:**
   ```typescript
   await trustRisk_admin_triggerRebuild_callable({
     batchSize: 50
   });
   ```

## Migration & Deployment

### Initial Deployment

1. **Deploy Cloud Functions:**
   ```bash
   firebase deploy --only functions
   ```

2. **Deploy Firestore Rules:**
   ```bash
   firebase deploy --only firestore:rules
   ```

3. **Initialize for existing users:**
   - New users auto-initialize on first event
   - Existing users: Call `rebuildAllRiskScores` for batch init

### Backwards Compatibility

- ✅ Engine is **additive only** - doesn't break existing features
- ✅ Enforcement hooks are **optional** - other modules work without them
- ✅ Trust profiles are **lazy-initialized** - created on first event
- ✅ No database migrations required

## FAQ

### Q: What happens if a user is falsely flagged?
**A:** Admins can apply manual overrides to set specific scores/enforcement levels. This is logged in the audit trail.

### Q: Can users see their risk score?
**A:** Users can see their enforcement level and what actions are restricted, but not the numeric score or internal flags (privacy/abuse prevention).

### Q: What if the Trust Engine fails?
**A:** All integrations use try-catch blocks. If trust logging fails, the primary operation (report, block, etc.) still succeeds. Enforcement checks default to allowing the action if the engine is unavailable.

### Q: How do I tune the scoring for my platform?
**A:** Adjust weights in `CONFIG` based on your moderation data. Start conservative (current weights) and increase if you see abuse patterns.

### Q: Does this affect tokenomics?
**A:** No. The engine only controls **access** to future actions. It never reverses transactions, issues refunds, or changes pricing/splits.

### Q: Can I add custom event types?
**A:** Yes. Add new types to `TrustEventType` enum and define weights in `CONFIG.eventWeights`. Then call `logTrustEvent` from your module.

## Next Steps

### Recommended Enhancements (Future Packs)

1. **Device/IP Tracking**
   - Detect multi-account patterns
   - Add `MULTI_ACCOUNT_SUSPECT` flag logic

2. **ML-Based Scoring**
   - Replace deterministic scoring with ML model
   - Train on historical abuse patterns

3. **User Appeals System**
   - Let users appeal restrictions
   - Automated review workflow

4. **Real-time Alerts**
   - Notify admins of critical events (HARD_LIMIT hit)
   - Dashboard for monitoring

5. **Graduated Enforcement**
   - Temporary restrictions (24h cooldown)
   - Progressive penalties

## Support

For technical questions or issues:
- Check audit logs: `user_trust_audit` collection
- Review event history: `user_trust_events` collection
- Contact platform security team for override requests

---

**Implementation Status:** ✅ Complete

**Files Created:**
- [`functions/src/types/trustRisk.types.ts`](functions/src/types/trustRisk.types.ts:1)
- [`functions/src/trustRiskEngine.ts`](functions/src/trustRiskEngine.ts:1)
- [`functions/src/trustRiskEndpoints.ts`](functions/src/trustRiskEndpoints.ts:1)
- [`functions/src/trustRiskIntegrations.ts`](functions/src/trustRiskIntegrations.ts:1)
- [`app-mobile/lib/trustRiskErrors.ts`](app-mobile/lib/trustRiskErrors.ts:1)
- [`firestore-rules/pack85-trust-risk-rules.rules`](firestore-rules/pack85-trust-risk-rules.rules:1)

**Files Modified:**
- [`functions/src/index.ts`](functions/src/index.ts:2408) (exports added)
- [`functions/src/profileSafety.ts`](functions/src/profileSafety.ts:1) (integrated)
- [`functions/src/kyc.ts`](functions/src/kyc.ts:1) (integrated)

**Ready for Production:** ✅ Yes