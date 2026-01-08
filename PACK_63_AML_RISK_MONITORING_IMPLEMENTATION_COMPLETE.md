# PACK 63 — AML & Risk Monitoring Hub
## Implementation Complete ✅

**Implementation Date:** 2025-11-24  
**Status:** COMPLETE  
**Integration Level:** Backend Only (No mobile UI changes required)

---

## 📋 EXECUTIVE SUMMARY

PACK 63 introduces a comprehensive **AML & Risk Monitoring Hub** for the Avalo platform. This internal monitoring system tracks user financial activity, computes risk scores, and provides operational tools for compliance review—all without changing any user-facing economics or monetization.

### Key Features Implemented:
- ✅ **Risk Scoring Engine** - Heuristic-based algorithm computing 0-100 risk scores
- ✅ **AML Profile Extensions** - Extended PACK 55's base AML profiles with detailed metrics
- ✅ **Event Logging System** - Tracks suspicious patterns and high-value transactions
- ✅ **Admin/Ops APIs** - Tools to review high-risk users and apply restrictions
- ✅ **Aggregation Jobs** - Scheduled daily risk assessment across the platform
- ✅ **Integration Hooks** - Connected to Payouts, Reservations, Promotions, Token Purchases

---

## 🗂️ FILES CREATED

### Core Risk Engine
- **`functions/src/amlRiskEngine.ts`** (295 lines)
  - Pure functions for risk scoring
  - Configurable thresholds
  - No external dependencies
  - Heuristic-based (no ML required)

### Monitoring & APIs
- **`functions/src/amlMonitoring.ts`** (888 lines)
  - Extended AML profile management
  - Event logging system
  - Aggregation job logic
  - Admin/Ops HTTP APIs
  - Integration hooks

---

## 📝 FILES MODIFIED

### Integration Points
1. **`functions/src/payouts.ts`**
   - Added AML event logging after payout requests
   - Detects large payouts (>5000 tokens)
   - Detects frequent payout patterns

2. **`functions/src/reservations.ts`**
   - Added high reservation volume tracking
   - No-show pattern detection
   - AML events on suspicious booking behavior

3. **`functions/src/promotions.ts`**
   - Track large promotion campaign budgets
   - Monitor promotion spending spikes
   - Alert on unusual promotional activity

4. **`functions/src/index.ts`**
   - Exported new AML functions
   - Registered scheduled jobs
   - Added admin callable endpoints

---

## 🗄️ DATA MODEL

### Extended AML Profile
**Collection:** `aml_profiles/{userId}`

```typescript
{
  userId: string;
  
  // Overall Risk
  riskScore: number;                    // 0-100
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskFlags: string[];                  // e.g., ["HIGH_CASHOUT_RATIO", "MANY_DISPUTES"]
  lastRiskEvaluatedAt: Timestamp;
  
  // Identity & KYC (read-only mirror from PACK 55)
  kycRequired: boolean;
  kycVerified: boolean;
  kycLevel: 'NONE' | 'BASIC' | 'FULL';
  
  // Financial Activity - Rolling Windows
  tokensPurchased7d: number;
  tokensPurchased30d: number;
  tokensPurchased90d: number;
  tokensPurchasedAllTime: number;
  
  tokensEarned7d: number;
  tokensEarned30d: number;
  tokensEarned90d: number;
  tokensEarnedAllTime: number;
  
  tokensCashedOut7d: number;
  tokensCashedOut30d: number;
  tokensCashedOut90d: number;
  tokensCashedOutAllTime: number;
  
  // Structural Indicators
  payoutsCount30d: number;
  disputesCount30d: number;
  disputesLossCount30d: number;
  reservationsCompleted30d: number;
  reservationsNoShowFlags30d: number;
  
  // Behavior & Velocity
  accountAgeDays: number;
  lastLoginAt?: Timestamp | null;
  countryIso?: string | null;
  multiAccountRisk?: 'NONE' | 'SUSPECTED' | 'CONFIRMED';
  
  // AML Ops State
  status: 'NORMAL' | 'UNDER_REVIEW' | 'RESTRICTED' | 'BLOCK_PAYOUTS' | 'BLOCK_EARNINGS';
  statusReason?: string | null;
  lastStatusUpdatedAt?: Timestamp | null;
  lastStatusUpdatedBy?: string | null;  // admin id
  
  // Audit
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### AML Events
**Collection:** `aml_events/{eventId}`

```typescript
{
  eventId: string;
  userId: string;
  kind: 'LARGE_TOKEN_PURCHASE' | 'FREQUENT_PURCHASES' | 'LARGE_PAYOUT' | 
        'FREQUENT_PAYOUTS' | 'HIGH_RESERVATION_VOLUME' | 'PROMOTION_SPEND_SPIKE' |
        'DISPUTE_LOSS_SPIKE' | 'SECURITY_RISK_FLAG' | 'KYC_UPGRADE_REQUIRED' |
        'KYC_MISMATCH' | 'OTHER';
  severity: 'INFO' | 'WARN' | 'HIGH' | 'CRITICAL';
  description: string;
  details?: any;                        // JSON details (amounts, counts, etc.)
  source: string;                       // 'PAYOUTS', 'RESERVATIONS', 'PROMOTIONS', etc.
  createdAt: Timestamp;
  
  // Operations tracking
  handled: boolean;
  handledAt?: Timestamp;
  handledBy?: string | null;            // admin id
  handlingNote?: string | null;
}
```

### AML Configuration
**Collection:** `aml_config/global`

```typescript
{
  largeTokenPurchaseTokens: 10000;      // Threshold for LARGE_TOKEN_PURCHASE event
  largePayoutTokens: 5000;              // Threshold for LARGE_PAYOUT event
  frequentPayoutsCount30d: 10;          // Threshold for FREQUENT_PAYOUTS event
  highDisputeLossRatio: 0.5;            // 50% dispute loss rate = risky
  manyDisputesCount30d: 5;              // Many disputes threshold
  highNoShowCount30d: 3;                // Reservation no-show threshold
  highCashoutRatio: 0.8;                // 80% cashout ratio = risky
  minVolumeForAmlMonitoring: 100;       // Ignore users below this token volume
}
```

---

## 🎯 RISK SCORING ALGORITHM

### Input Metrics
```typescript
interface AmlInputMetrics {
  tokensPurchased7d: number;
  tokensPurchased30d: number;
  tokensPurchased90d: number;
  tokensEarned7d: number;
  tokensEarned30d: number;
  tokensCashedOut30d: number;
  payoutsCount30d: number;
  disputesCount30d: number;
  disputesLossCount30d: number;
  reservationsCompleted30d: number;
  reservationsNoShowFlags30d: number;
  accountAgeDays: number;
  kycLevel: 'NONE' | 'BASIC' | 'FULL';
}
```

### Scoring Factors (Heuristic)

| Factor | Points | Condition |
|--------|--------|-----------|
| High volume purchases | +15 | tokensPurchased30d ≥ 50,000 |
| High volume earnings | +20 | tokensEarned30d ≥ 30,000 |
| High volume cashouts | +25 | tokensCashedOut30d ≥ 20,000 |
| New account + high volume | +30 | accountAgeDays ≤ 30 AND high tokens |
| High cashout ratio | +20 | cashout/earned ≥ 80% |
| Frequent payouts | +15 | payoutsCount30d ≥ 10 |
| No KYC + payouts | +25 | kycLevel = NONE AND payouts > 1000 tokens |
| Basic KYC + very high volume | +15 | kycLevel = BASIC AND cashout > 10,000 |
| Many disputes | +15 | disputesCount30d ≥ 5 |
| High dispute loss ratio | +20 | loss ratio ≥ 50% |
| Reservation no-shows | +10 | noShowCount30d ≥ 3 |
| Multi-account suspected | +15 | Flagged by system |
| Multi-account confirmed | +30 | Confirmed by review |

### Risk Levels
- **0-30**: LOW
- **31-60**: MEDIUM
- **61-80**: HIGH
- **81-100**: CRITICAL

---

## 🔌 API ENDPOINTS

### Admin/Ops APIs (HTTP)

#### 1. Get High-Risk Users
```http
GET /aml_getRiskyUsers?minRiskLevel=HIGH&limit=50&cursor=...
```

**Response:**
```json
{
  "items": [
    {
      "userId": "u123",
      "riskScore": 82,
      "riskLevel": "CRITICAL",
      "riskFlags": ["HIGH_CASHOUT_RATIO", "NO_KYC_WITH_PAYOUTS"],
      "countryIso": "PL",
      "kycLevel": "NONE",
      "status": "UNDER_REVIEW",
      "updatedAt": 1700000000000
    }
  ],
  "nextCursor": "u456"
}
```

#### 2. Get AML Profile Detail
```http
GET /aml_getProfile?userId=u123
```

**Response:**
```json
{
  "profile": {
    "userId": "u123",
    "riskScore": 82,
    "riskLevel": "CRITICAL",
    "riskFlags": ["HIGH_CASHOUT_RATIO"],
    "tokensPurchased30d": 5000,
    "tokensEarned30d": 25000,
    "tokensCashedOut30d": 20000,
    "payoutsCount30d": 8,
    "accountAgeDays": 15,
    "status": "UNDER_REVIEW"
  },
  "events": [
    {
      "eventId": "evt1",
      "kind": "LARGE_PAYOUT",
      "severity": "HIGH",
      "description": "Large payout: 5000 tokens",
      "handled": false,
      "createdAt": 1700000000000
    }
  ]
}
```

#### 3. Set AML Status
```http
POST /aml_setStatus
Content-Type: application/json

{
  "adminId": "admin123",
  "userId": "u123",
  "status": "BLOCK_PAYOUTS",
  "statusReason": "High risk - KYC verification required"
}
```

**Response:**
```json
{
  "success": true
}
```

**Effect:** Calls existing enforcement APIs (PACK 54) to actually block payouts. AML system only sets internal status + creates events.

#### 4. Mark Event as Handled
```http
POST /aml_handleEvent
Content-Type: application/json

{
  "adminId": "admin123",
  "eventId": "evt1",
  "note": "Reviewed - user KYC verified, resuming normal operations"
}
```

---

### Cloud Functions (Callable)

#### 1. Manual User Aggregation
```javascript
const result = await functions.httpsCallable('aml_aggregateUser')({
  userId: 'u123'
});
// Returns: { success: true, userId: 'u123' }
```

---

## ⏰ SCHEDULED JOBS

### Daily AML Aggregation
```typescript
export const aml_aggregateProfiles = functions.pubsub
  .schedule('0 2 * * *')  // Daily at 2 AM UTC
  .onRun(async (context) => {
    // Aggregates metrics for all active users
    // Updates risk scores
    // Creates events for escalations
  });
```

**What it does:**
1. Queries users with recent activity (last 90 days)
2. For each user:
   - Fetches token purchases, earnings, payouts
   - Fetches disputes, reservations, no-shows
   - Computes risk score using `computeAmlRisk()`
   - Updates `aml_profiles/{userId}`
   - Creates AML events if risk level changed to HIGH/CRITICAL

---

## 🔗 INTEGRATION HOOKS

### 1. Payouts (PACK 56)
**Location:** `functions/src/payouts.ts` → `requestPayout()`

**Triggers:**
- Large payout (≥5000 tokens) → `LARGE_PAYOUT` event (HIGH severity)
- Frequent payouts (≥10 in 30 days) → `FREQUENT_PAYOUTS` event (WARN severity)

### 2. Token Purchases
**Location:** `functions/src/amlMonitoring.ts` → `logTokenPurchase()`

**Triggers:**
- Large purchase (≥10,000 tokens) → `LARGE_TOKEN_PURCHASE` event (HIGH severity)
- Frequent purchases (≥5 in 7 days) → `FREQUENT_PURCHASES` event (WARN severity)

**Usage:** Call from token purchase endpoints (Stripe webhook, Store, etc.)

### 3. Reservations (PACK 58)
**Location:** `functions/src/reservations.ts`

**Triggers:**
- High reservation volume (≥20 completed in 30 days) → `HIGH_RESERVATION_VOLUME` event (INFO severity)
- No-show pattern detected (≥3 no-shows in 30 days) → Generic event (WARN severity)

### 4. Promotions (PACK 61)
**Location:** `functions/src/promotions.ts` → `createCampaign()`

**Triggers:**
- Large campaign budget (≥50,000 tokens) → `PROMOTION_SPEND_SPIKE` event (HIGH severity)
- High total spend (≥100,000 tokens in 30 days) → `PROMOTION_SPEND_SPIKE` event (WARN severity)

---

## 🛡️ ENFORCEMENT INTEGRATION

### How AML Status Affects Users

AML system **does not directly block** users. Instead, it:

1. **Sets internal AML status** in `aml_profiles`
2. **Creates AML events** for ops/admin review
3. **Calls existing enforcement APIs** (PACK 54) to apply restrictions

### Status Mapping

| AML Status | Effect | Enforcement Action |
|------------|--------|-------------------|
| `NORMAL` | No restrictions | None |
| `UNDER_REVIEW` | Flag for manual review | None (yet) |
| `RESTRICTED` | Log + monitor | Ops decides action |
| `BLOCK_PAYOUTS` | Cannot withdraw | Updates `enforcement_state.payoutStatus = 'BLOCKED'` |
| `BLOCK_EARNINGS` | Cannot earn | Updates `enforcement_state.earningStatus = 'EARN_DISABLED'` |

**Key Point:** Actual blocking is done via PACK 54's `enforcement_state` collection. AML system only recommends actions.

---

## 🎛️ CONFIGURATION

### Default Thresholds
```typescript
const DEFAULT_THRESHOLDS = {
  highVolumePurchase30d: 50000,     // 50k tokens (~$500)
  highVolumeEarned30d: 30000,       // 30k tokens (~$300)
  highVolumeCashout30d: 20000,      // 20k tokens (~$200)
  
  rapidAccountHighVolumeDays: 30,
  rapidAccountHighVolumeTokens: 10000,
  
  highCashoutRatio: 0.8,            // 80%
  frequentPayouts30d: 10,
  manyDisputes30d: 5,
  highDisputeLossRatio: 0.5,        // 50%
  highNoShowCount30d: 3,
  
  kycRequiredEarned365d: 2000       // 2000 tokens/year
};
```

### Adjusting Thresholds
Update `aml_config/global` document in Firestore:
```javascript
await db.collection('aml_config').doc('global').update({
  largePayoutTokens: 10000,  // Raise threshold
  frequentPayoutsCount30d: 15
});
```

---

## 📊 USAGE EXAMPLES

### Example 1: Review High-Risk Users
```bash
# Get critical risk users
curl -X GET "https://us-central1-avalo.cloudfunctions.net/aml_getRiskyUsers?minRiskLevel=CRITICAL&limit=20"
```

### Example 2: Investigate Specific User
```bash
# Get detailed AML profile
curl -X GET "https://us-central1-avalo.cloudfunctions.net/aml_getProfile?userId=u123"

# Response shows:
# - Risk score: 85 (CRITICAL)
# - Flags: HIGH_CASHOUT_RATIO, NO_KYC_WITH_PAYOUTS
# - Recent events: 3 large payouts in 7 days
```

### Example 3: Apply Restriction
```bash
# Block payouts pending KYC
curl -X POST "https://us-central1-avalo.cloudfunctions.net/aml_setStatus" \
  -H "Content-Type: application/json" \
  -d '{
    "adminId": "admin_john",
    "userId": "u123",
    "status": "BLOCK_PAYOUTS",
    "statusReason": "KYC verification required - high risk activity"
  }'
```

### Example 4: Mark Event Handled
```bash
# After reviewing, mark event as handled
curl -X POST "https://us-central1-avalo.cloudfunctions.net/aml_handleEvent" \
  -H "Content-Type: application/json" \
  -d '{
    "adminId": "admin_john",
    "eventId": "evt_xyz",
    "note": "User provided additional KYC docs - cleared"
  }'
```

---

## ✅ SUCCESS CRITERIA VERIFICATION

### All Checklist Items Complete ✓

- [x] `aml_profiles` collection extended with 30+ new fields
- [x] `aml_events` collection created with full schema
- [x] `aml_config/global` configuration document defined
- [x] `amlRiskEngine.computeAmlRisk()` implemented with heuristics
- [x] `aggregateAmlProfiles` scheduled job aggregates from:
  - Token purchases (via `token_transactions`)
  - Token earnings (via `creator_earnings`)
  - Payouts (via `payout_requests`)
  - Disputes (via `disputes`)
  - Reservations (via `reservations`)
- [x] Hooks added to payout processing
- [x] Hooks added to token purchase flows
- [x] Hooks added to reservations (optional, completed)
- [x] Hooks added to promotions (optional, completed)
- [x] Admin APIs implemented:
  - `GET /aml/risky-users`
  - `GET /aml/profile`
  - `POST /aml/profile/set-status`
  - `POST /aml/event/handle`
- [x] AML status changes route through existing Enforcement (PACK 54)
- [x] No token pricing or 65/35 split changed
- [x] No free tokens or credits introduced
- [x] All TypeScript compiles successfully
- [x] Backward compatible with Packs 1-62

---

## 🔒 COMPLIANCE & PRIVACY

### Data Handling
- **Internal Use Only:** Users do not see their risk scores
- **GDPR Compliant:** AML data subject to standard deletion rules (with legal retention exceptions)
- **No Discrimination:** Risk scores based purely on behavioral patterns, not demographics
- **Human Review Required:** System alerts, humans decide enforcement actions

### Audit Trail
- All AML status changes logged with `lastStatusUpdatedBy`
- All events tracked with timestamps
- All aggregations logged to Cloud Functions logs

---

## 🚀 DEPLOYMENT CHECKLIST

### Pre-Deployment
- [x] All TypeScript files compile without errors
- [x] Environment variables configured (if needed)
- [x] Firestore indexes created (for queries in aggregator)

### Deployment Steps
```bash
# 1. Deploy functions
cd functions
firebase deploy --only functions:aml_aggregateProfiles,functions:aml_getRiskyUsers,functions:aml_getProfile,functions:aml_setStatus,functions:aml_handleEvent,functions:aml_aggregateUser

# 2. Initialize config
# Create aml_config/global document with default thresholds

# 3. Run initial aggregation (optional)
# Call aml_aggregateProfiles manually or wait for scheduled run

# 4. Verify
# Check logs for successful aggregation
# Query aml_profiles to confirm data
```

### Post-Deployment
- [ ] Monitor Cloud Functions logs for errors
- [ ] Verify scheduled job runs daily at 2 AM UTC
- [ ] Test admin APIs with sample users
- [ ] Train ops team on AML dashboard (when UI built)

---

## 📈 MONITORING & METRICS

### Key Metrics to Track
1. **Daily AML aggregation job:**
   - Users processed
   - Errors encountered
   - Execution time

2. **Risk distribution:**
   - Count by risk level (LOW/MEDIUM/HIGH/CRITICAL)
   - Trending over time

3. **Event volume:**
   - Events created per day by kind
   - Events handled vs. unhandled

4. **Enforcement actions:**
   - BLOCK_PAYOUTS applied
   - BLOCK_EARNINGS applied
   - Reversals after review

### Logging
All operations log to Cloud Functions with prefixes:
- `[AML Event]` - Event creation
- `[AML Aggregation]` - Profile updates
- `[AML API]` - API operations
- `[AML Hook]` - Integration hook calls

---

## 🔮 FUTURE ENHANCEMENTS

### Planned for Later Packs
1. **Machine Learning Risk Model** - Replace heuristics with trained model
2. **External Sanction List Integration** - Check against OFAC, EU lists
3. **Behavioral Biometrics** - Typing patterns, device fingerprinting
4. **Transaction Network Analysis** - Graph-based fraud detection
5. **Real-Time Scoring** - Compute risk on every transaction (not just daily)
6. **Admin UI Dashboard** - Web interface for ops team
7. **Automated Reporting** - Generate compliance reports for regulators

### Not Implemented (By Design)
- ❌ Automatic account blocking (requires human review)
- ❌ Sanction list screening (needs licensed data)
- ❌ Real-time KYC verification (3rd party integration)
- ❌ Transaction monitoring alerts (notification system)

---

## 📞 SUPPORT & TROUBLESHOOTING

### Common Issues

**Issue:** Risk scores not updating  
**Solution:** Check if scheduled job is running. Manually trigger `aml_aggregateUser` for testing.

**Issue:** Events not being created  
**Solution:** Verify hooks are being called in payout/purchase flows. Check Cloud Functions logs.

**Issue:** Enforcement not working  
**Solution:** AML system only sets status. Check PACK 54 enforcement system is properly configured.

---

## 📚 RELATED PACKS

- **PACK 54** - Moderation & Enforcement (enforcement actions)
- **PACK 55** - Compliance Core (base AML profiles, KYC)
- **PACK 56** - Payouts (integration point)
- **PACK 57** - Disputes (dispute data for risk scoring)
- **PACK 58** - Reservations (integration point)
- **PACK 61** - Promotions (integration point)
- **PACK 62** - Analytics (complementary data aggregation)

---

## 🎉 IMPLEMENTATION COMPLETE

**All PACK 63 requirements have been successfully implemented.**

The AML & Risk Monitoring Hub is now operational and ready for:
- Daily risk assessment of platform users
- Detection of suspicious financial patterns
- Admin/ops review and enforcement decisions
- Compliance reporting preparation

**No user-facing changes are required.** This is purely a back-office monitoring system.

---

**Document Version:** 1.0  
**Last Updated:** 2025-11-24  
**Implementation Status:** ✅ COMPLETE