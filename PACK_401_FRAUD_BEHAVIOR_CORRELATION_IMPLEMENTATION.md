# PACK 401 — Fraud Detection via Behavior & Support Correlation

**Status**: ✅ Implemented  
**Version**: 1.0  
**Date**: 2025-12-20  
**Replaces**: PACK 352 (mis-numbered)

---

## Overview

PACK 401 implements a comprehensive fraud detection correlation layer that combines:
- **User behavior** (wallet + engagement + retention)
- **Support tickets** (fraud-related complaints)
- **Safety events** (reports, bans, flags)

Into unified fraud-risk profiles per user. This system complements PACK 302 (Fraud Detection via Support Signals) by adding behavioral and engagement anomaly detection.

---

## Architecture

### Data Model

**Collection**: `fraudBehaviorProfiles`  
**Doc ID**: `userId`

```typescript
interface FraudBehaviorSignals {
  userId: string;
  lastUpdatedAt: Timestamp;
  
  // Behavior metrics
  chargebackCount: number;
  refundRequestCount: number;
  cancelledBookingsLast30d: number;
  
  // Support & safety metrics
  supportFraudTicketsLast30d: number;
  safetyFlagsLast30d: number;
  
  // Anomaly scores (0-1)
  manyPaymentsFewMessagesScore: number;
  multiRegionLoginScore: number;
  deviceInconsistencyScore: number;
  
  // Aggregate
  aggregateScore: number;  // 0-1
  riskLevel: FraudRiskLevel;
  notes?: string;
}

type FraudRiskLevel = 
  | 'NORMAL'              // < 0.3
  | 'WATCHLIST'           // 0.3 - 0.5
  | 'HIGH_RISK'           // 0.5 - 0.75
  | 'BANNED_RECOMMENDED'; // > 0.75
```

---

## Scoring Algorithm

### Inputs

The system aggregates data from multiple sources:

#### 1. Wallet Data (PACK 255/277)
- `chargebackCount`: Total chargebacks ever
- `refundRequestCount`: Refund requests in last 30 days
- `totalTokenSpends`: Total tokens spent

#### 2. Support Data (PACK 300/302)
- `supportFraudTicketsLast30d`: Tickets categorized as fraud/chargeback/scam in last 30 days

#### 3. Safety Data (PACK 267-268, 190)
- `safetyFlagsLast30d`: HIGH or CRITICAL severity safety reports in last 30 days

#### 4. Engagement Data (PACK 400 RetentionEngine)
- `totalMessages`: Total messages sent
- `totalCalls`: Total calls made
- `loginLocations`: Recent login locations with timestamps
- `deviceIds`: Device IDs and usage timestamps

### Scoring Components

#### A. manyPaymentsFewMessagesScore (0-1)
Detects users who spend heavily but interact minimally (possible stolen account/card).

**Algorithm**:
```typescript
totalInteractions = totalMessages + totalCalls
ratio = totalTokenSpends / max(1, totalInteractions)
score = clamp01(ratio / 100)

Special cases:
- If totalTokenSpends ≥ 1000 AND totalInteractions < 10 → score = 1.0
```

**Examples**:
- 5000 tokens spent, 5 messages → Score: 1.0 (very suspicious)
- 1000 tokens spent, 100 messages → Score: 0.1 (normal)
- 50 tokens spent, 200 messages → Score: 0.0025 (normal)

#### B. multiRegionLoginScore (0-1)
Detects impossible travel or account sharing.

**Algorithm**:
```typescript
recentLogins = last 10 logins
uniqueCountries = unique countries in recentLogins
timeSpan = time between first and last login

If uniqueCountries ≥ 3:
  - timeSpan < 24 hours → score = 1.0
  - timeSpan < 7 days → score = 0.7
  - otherwise → score = 0.3
  
If uniqueCountries == 2:
  - timeSpan < 12 hours → score = 0.8
  - otherwise → score = 0.0
  
If uniqueCountries == 1:
  - score = 0.0
```

**Examples**:
- USA, Germany, Japan in 6 hours → Score: 1.0 (impossible travel)
- USA, Canada in 3 days → Score: 0.0 (normal)
- France, UK, Spain in 2 days → Score: 0.7 (suspicious)

#### C. deviceInconsistencyScore (0-1)
Detects frequent device switching (possible account compromise).

**Algorithm**:
```typescript
recentDevices = last 10 device uses
uniqueDevices = unique device IDs in recent activity

If uniqueDevices ≥ 5 → score = 1.0
If uniqueDevices ≥ 3 → score = 0.6
If totalUniqueDevices > 5 → score = 0.4
Otherwise → score = 0.0
```

**Examples**:
- 6 different devices in recent activity → Score: 1.0
- 3 different devices in recent activity → Score: 0.6
- Same 2 devices always → Score: 0.0

### Aggregate Score Calculation

```typescript
aggregateScore = clamp01(
  0.3 * normalizeCount(chargebackCount, 3) +
  0.2 * normalizeCount(supportFraudTicketsLast30d, 5) +
  0.2 * manyPaymentsFewMessagesScore +
  0.15 * multiRegionLoginScore +
  0.15 * deviceInconsistencyScore
)
```

**Weight Breakdown**:
- 30% - Chargebacks (strongest signal)
- 20% - Fraud tickets (verified complaints)
- 20% - Payment/message anomaly (behavioral)
- 15% - Multi-region logins (account compromise)
- 15% - Device inconsistency (account sharing/compromise)

### Risk Level Mapping

| Aggregate Score | Risk Level          | Action                          |
|-----------------|---------------------|---------------------------------|
| < 0.3           | NORMAL              | No action                       |
| 0.3 - 0.5       | WATCHLIST           | Monitor closely                 |
| 0.5 - 0.75      | HIGH_RISK           | Manual review required          |
| > 0.75          | BANNED_RECOMMENDED  | Immediate moderator review      |

---

## Cloud Functions

### 1. `pack401_recomputeFraudProfileForUser`
**Type**: Callable HTTPS  
**Access**: Admin/Moderator only  
**Timeout**: 300s  
**Memory**: 512MB

**Purpose**: Manually trigger fraud profile recomputation for a specific user.

**Input**:
```typescript
{
  userId: string
}
```

**Output**:
```typescript
{
  success: boolean;
  message: string;
}
```

**Usage**:
```typescript
const result = await functions.httpsCallable('pack401_recomputeFraudProfileForUser')({
  userId: 'user123'
});
```

### 2. `pack401_cronRecomputeFraudProfiles`
**Type**: Scheduled (Cron)  
**Schedule**: Every 6 hours  
**Timeout**: 540s  
**Memory**: 1GB

**Purpose**: Automatically recompute fraud profiles for users with recent activity (last 6 hours).

**Behavior**:
- Queries users with recent wallet transactions
- Queries users with recent support tickets
- Queries users with recent safety reports
- Recomputes profiles for all affected users (max 1500)

### 3. `pack401_batchRecomputeFraudProfiles`
**Type**: Callable HTTPS  
**Access**: Admin only  
**Timeout**: 540s  
**Memory**: 1GB

**Purpose**: Manual batch recomputation with custom time window.

**Input**:
```typescript
{
  hoursAgo?: number  // 1-168 (7 days), default: 24
}
```

**Output**:
```typescript
{
  success: boolean;
  message: string;
}
```

---

## Integration Points

### Read-Only Dependencies

This pack **reads** from (does NOT modify):

1. **PACK 255/277** - Wallet & Token Store
   - Collections: `wallets`, `wallets/{userId}/transactions`
   - Data: chargebacks, token spends, refund requests

2. **PACK 267-268** - Global Safety & Policy
   - Collection: `safetyReports`
   - Data: reports, severity, timestamps

3. **PACK 280** - Membership Tiers
   - Collection: `users`
   - Data: membership tier (for context)

4. **PACK 293** - Notifications
   - Used to notify admins of HIGH_RISK users (optional)

5. **PACK 296** - Audit / Risk Graph
   - Can log fraud profile updates as risk graph nodes

6. **PACK 300/300A/300B** - Support & Tickets
   - Collection: `supportTickets`
   - Data: fraud-related tickets

7. **PACK 301/301A/301B/400** - RetentionEngine
   - Collection: `userAnalytics`
   - Data: message counts, call counts, engagement metrics

8. **PACK 302** - Fraud Detection via Support Signals
   - Complementary system - this pack adds behavioral layer

9. **User Sessions & Devices**
   - Collections: `userSessions`, `userDevices`
   - Data: login locations, device IDs

### Write Operations

This pack **writes** to:
- `fraudBehaviorProfiles` collection only

### Future Integrations

**Admin Panel** (future PACK):
- Display fraud risk badges in user profiles
- Show risk level in moderator queue
- Drill-down into risk factors

**Automated Actions** (future):
- Auto-freeze accounts at HIGH_RISK level
- Auto-notify moderators at BANNED_RECOMMENDED level
- Require 2FA at WATCHLIST level

---

## Usage Examples

### For Moderators

#### Viewing Fraud Profile
```typescript
const profile = await db.collection('fraudBehaviorProfiles')
  .doc(userId)
  .get();

if (profile.exists) {
  const data = profile.data();
  console.log(`Risk Level: ${data.riskLevel}`);
  console.log(`Aggregate Score: ${data.aggregateScore.toFixed(3)}`);
  console.log(`Notes: ${data.notes}`);
}
```

#### Interpreting Risk Levels

**NORMAL** (< 0.3):
- No action needed
- User has clean history
- Continue normal monitoring

**WATCHLIST** (0.3 - 0.5):
- Monitor user activity more closely
- Review recent transactions
- Check for pattern changes
- No immediate action required

**HIGH_RISK** (0.5 - 0.75):
- **Manual review required**
- Investigate specific risk factors (see `notes`)
- Review support tickets
- Check wallet activity
- Consider temporary restrictions
- May require identity verification

**BANNED_RECOMMENDED** (> 0.75):
- **Immediate moderator review**
- Strong evidence of fraud/abuse
- Review all risk factors
- Contact user for verification
- Consider account freeze
- Escalate to senior moderators

### For Developers

#### Trigger Manual Recomputation
```typescript
// From admin panel
const functions = getFunctions();
const recompute = httpsCallable(functions, 'pack401_recomputeFraudProfileForUser');

try {
  const result = await recompute({ userId: 'user123' });
  console.log(result.data.message);
} catch (error) {
  console.error('Failed to recompute:', error);
}
```

#### Batch Recomputation
```typescript
// Recompute last 48 hours
const functions = getFunctions();
const batchRecompute = httpsCallable(functions, 'pack401_batchRecomputeFraudProfiles');

const result = await batchRecompute({ hoursAgo: 48 });
console.log(result.data.message);
```

#### Query High-Risk Users
```typescript
const highRiskUsers = await db.collection('fraudBehaviorProfiles')
  .where('riskLevel', 'in', ['HIGH_RISK', 'BANNED_RECOMMENDED'])
  .orderBy('aggregateScore', 'desc')
  .limit(50)
  .get();

highRiskUsers.forEach(doc => {
  const data = doc.data();
  console.log(`User ${doc.id}: ${data.riskLevel} (${data.aggregateScore.toFixed(3)})`);
  console.log(`  ${data.notes}`);
});
```

---

## Firestore Indexes

Required indexes for efficient queries:

```json
{
  "indexes": [
    {
      "collectionGroup": "fraudBehaviorProfiles",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "riskLevel", "order": "ASCENDING" },
        { "fieldPath": "aggregateScore", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "fraudBehaviorProfiles",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "lastUpdatedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "supportTickets",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "safetyReports",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "reportedUserId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" },
        { "fieldPath": "severity", "order": "ASCENDING" }
      ]
    }
  ]
}
```

---

## Security Rules

Add to `firestore.rules`:

```javascript
// Fraud behavior profiles - admin read only
match /fraudBehaviorProfiles/{userId} {
  // Only admins/moderators can read
  allow read: if isAdmin() || isModerator();
  
  // Only backend can write
  allow write: if false;
}

function isAdmin() {
  return request.auth != null && request.auth.token.admin == true;
}

function isModerator() {
  return request.auth != null && request.auth.token.moderator == true;
}
```

---

## Monitoring & Alerts

### Log Events

The system logs important events:

```typescript
// High-risk user detected
logger.warn('[PACK401] HIGH RISK USER DETECTED', {
  userId: 'user123',
  riskLevel: 'HIGH_RISK',
  aggregateScore: 0.68,
  notes: 'Multiple fraud tickets; High payment-to-interaction ratio'
});

// Profile recomputation
logger.info('[PACK401] Updated fraud profile', {
  userId: 'user123',
  riskLevel: 'WATCHLIST',
  aggregateScore: 0.42
});
```

### Recommended Alerts

Set up Cloud Monitoring alerts for:

1. **HIGH_RISK or BANNED_RECOMMENDED detected**
   - Log-based metric: `jsonPayload.message =~ "HIGH RISK USER DETECTED"`
   - Alert moderator team immediately

2. **High error rate in recomputation**
   - Function error rate > 5%
   - Investigate data availability

3. **Unusual spike in fraud profiles**
   - Count of HIGH_RISK users increases >50% in 1 hour
   - Possible data issue or actual fraud wave

---

## Testing

### Manual Testing

```typescript
// 1. Create test user with fraud signals
await db.collection('wallets').doc('test_user').set({
  chargebackCount: 2,
  balance: 0
});

await db.collection('supportTickets').add({
  userId: 'test_user',
  category: 'fraud',
  createdAt: Timestamp.now()
});

// 2. Trigger recomputation
const functions = getFunctions();
const recompute = httpsCallable(functions, 'pack401_recomputeFraudProfileForUser');
await recompute({ userId: 'test_user' });

// 3. Verify profile
const profile = await db.collection('fraudBehaviorProfiles').doc('test_user').get();
console.log(profile.data());
// Expected: riskLevel = 'WATCHLIST' or higher
```

### Edge Cases

Test these scenarios:
- User with no data (should handle gracefully)
- User with extreme values (10+ chargebacks)
- User with normal activity (should be NORMAL)
- Recent vs. old activity (only last 30 days count for some metrics)

---

## Performance Considerations

### Scalability

- **Single user recomputation**: ~2-5 seconds (multiple collection reads)
- **Batch recomputation**: Processes up to 1500 users per run
- **Scheduled cron**: Runs every 6 hours, processes recent activity only

### Optimization Tips

1. **Indexes**: Ensure all required indexes are deployed
2. **Batching**: Cron job limits queries to prevent timeouts
3. **Caching**: Consider caching frequent lookups (e.g., analytics data)
4. **Parallelization**: Service could be enhanced with Promise.all() for independent reads

### Cost Estimation

Per 1000 recomputations:
- Firestore reads: ~10,000 (10 reads per user average)
- Firestore writes: ~1,000 (1 write per user)
- Function invocations: 1 (cron) or 1000 (individual calls)

---

## Complement to PACK 302

This pack (PACK 401) complements PACK 302 in the following ways:

### PACK 302: Fraud Detection via Support Signals
- Focuses on **support ticket patterns**
- Detects fraud based on **complaint types**
- Reactive (responds to tickets)

### PACK 401: Fraud Detection via Behavior Correlation
- Focuses on **behavioral anomalies**
- Detects fraud based on **usage patterns**
- Proactive (identifies suspicious behavior before complaints)

### Combined Power

Use both systems together:
1. PACK 302 flags users with fraud-related tickets
2. PACK 401 assigns risk score based on behavior + tickets
3. Moderators see unified view of both support signals and behavioral risk

Example:
- User has 1 fraud ticket (PACK 302 flag)
- User also has 5000 token spends but only 3 messages (PACK 401 flag)
- Combined: HIGH_RISK profile → immediate review

---

## Future Enhancements

### Planned Features

1. **Machine Learning Integration**
   - Replace heuristic scoring with ML model
   - Train on historical fraud cases
   - Continuous learning from moderator actions

2. **Real-Time Triggers**
   - Firestore triggers on fraud signals
   - Instant profile updates
   - Immediate alerts for extreme cases

3. **Risk Graph Integration (PACK 296)**
   - Add fraud profiles as risk graph nodes
   - Connect related fraudulent accounts
   - Detect fraud rings

4. **Automated Actions**
   - Auto-freeze at BANNED_RECOMMENDED level
   - Auto-require 2FA at HIGH_RISK level
   - Auto-notify moderators

5. **Enhanced Signals**
   - Payment velocity (rapid successive purchases)
   - Time-of-day patterns (unusual activity hours)
   - Social graph anomalies (connecting only to fraud accounts)
   - IP address reputation scores

### Extensibility

To add new fraud signals:

1. Add field to `FraudBehaviorSignals` in types
2. Update `gatherUserData()` to fetch new data
3. Add scoring function (e.g., `computeNewScore()`)
4. Update `computeFraudProfile()` aggregate formula
5. Document in this guide

---

## Files Reference

### Implementation Files

- [`functions/src/pack401-fraud-correlation-types.ts`](functions/src/pack401-fraud-correlation-types.ts)
  - Type definitions and interfaces

- [`functions/src/pack401-fraud-correlation-service.ts`](functions/src/pack401-fraud-correlation-service.ts)
  - Core correlation logic and scoring algorithms

- [`functions/src/pack401-fraud-correlation-functions.ts`](functions/src/pack401-fraud-correlation-functions.ts)
  - Cloud Functions (callable and scheduled)

### Documentation

- `PACK_401_FRAUD_BEHAVIOR_CORRELATION_IMPLEMENTATION.md` (this file)
  - Comprehensive implementation guide

---

## Deployment Checklist

- [x] Create type definitions
- [x] Implement correlation service
- [x] Create cloud functions
- [ ] Deploy Firestore indexes
- [ ] Update security rules
- [ ] Deploy cloud functions
- [ ] Configure monitoring alerts
- [ ] Test with sample data
- [ ] Train moderator team
- [ ] Update admin panel UI

---

## Support & Maintenance

### Troubleshooting

**Issue**: Profiles not updating
- Check cron scheduler is running
- Verify function logs for errors
- Ensure required collections exist

**Issue**: Scores seem incorrect
- Review input data in logs
- Check scoring algorithm weights
- Verify data freshness (30-day windows)

**Issue**: Performance degradation
- Check Firestore indexes are deployed
- Review function timeout settings
- Consider increasing memory allocation

### Contact

For questions about PACK 401:
- Review this documentation
- Check function logs in Cloud Console
- Consult PACK 302 for support signal context

---

## Version History

### v1.0 (2025-12-20)
- Initial implementation
- Replaces mis-numbered PACK 352
- Core scoring algorithm
- Cloud functions (callable + scheduled)
- Comprehensive documentation

---

**End of PACK 401 Implementation Guide**
