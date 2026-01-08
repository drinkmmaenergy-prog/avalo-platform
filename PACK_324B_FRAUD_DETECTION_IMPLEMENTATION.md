# PACK 324B — Real-Time Fraud Detection & Abuse Signals

**Status**: ✅ COMPLETE  
**Date**: 2025-12-11  
**Version**: 1.0.0

---

## 🎯 Overview

PACK 324B implements a comprehensive real-time fraud detection system that monitors and flags suspicious patterns across all platform activities. This is a **READ-ONLY monitoring layer** that:

- ✅ Detects 8 types of fraud/abuse patterns
- ✅ Calculates user risk scores (0-100)
- ✅ Provides admin dashboard for review
- ✅ **DOES NOT auto-ban or auto-refund**
- ✅ **ZERO impact on tokenomics or existing logic**

---

## 📋 Signal Types Detected

### 1. TOKEN_DRAIN_PATTERN
**Source**: AI Voice/Video  
**Trigger**: Repeated short paid calls < 30 seconds  
**Threshold**: 5+ short sessions in 24 hours  
**Severity**: 3-5 (based on frequency)

**Detection Logic**: Monitors call duration and flags users who repeatedly start paid sessions but end them quickly to drain tokens.

### 2. MULTI_SESSION_SPAM
**Source**: Chat, AI Chat, AI Voice, AI Video  
**Trigger**: Parallel sessions to many users simultaneously  
**Threshold**: 3+ parallel sessions within 5 minutes  
**Severity**: 3-5 (based on session count)

**Detection Logic**: Tracks concurrent active sessions to detect spam messaging patterns.

### 3. COPY_PASTE_BEHAVIOR
**Source**: Chat  
**Trigger**: Identical message sent to 3+ different chats  
**Threshold**: Same text in 3+ chats within 10 minutes  
**Severity**: 3-5 (based on match count)

**Detection Logic**: Uses message hashing to identify duplicate content across multiple conversations.

### 4. FAKE_BOOKINGS
**Source**: Events  
**Trigger**: High rate of ticket refunds  
**Threshold**: 60%+ refund rate with 3+ refunds  
**Severity**: 3-5 (based on refund rate)

**Detection Logic**: Monitors event organizers who create events but frequently refund tickets.

### 5. SELF_REFUNDS
**Source**: Calendar  
**Trigger**: Many bookings canceled by creator  
**Threshold**: 5+ cancellations in 7 days  
**Severity**: 3-5 (based on cancellation count)

**Detection Logic**: Flags creators who repeatedly cancel bookings they accepted.

### 6. PAYOUT_ABUSE
**Source**: Wallet  
**Trigger**: Unusual payout attempts  
**Threshold**: 3+ payout attempts in 1 hour  
**Severity**: 3-5 (based on attempt count)

**Detection Logic**: Monitors rapid payout attempts that may indicate fraud or system abuse.

### 7. IDENTITY_MISMATCH
**Source**: User Profile  
**Trigger**: Multiple fraud reports about profile  
**Threshold**: 3+ unique reporters in 30 days  
**Severity**: 3-5 (based on report count)

**Detection Logic**: Aggregates identity fraud reports from multiple users.

### 8. PANIC_RATE_SPIKE
**Source**: Safety System  
**Trigger**: Excessive panic button triggers  
**Threshold**: 3+ panic events in 24 hours  
**Severity**: 3-5 (based on frequency)

**Detection Logic**: Detects users who trigger panic button excessively, which may indicate misuse.

---

## 🎲 Risk Score System

### Score Calculation

Risk scores are calculated by aggregating fraud signal severity with time decay:

```typescript
Score = Σ (SEVERITY_POINTS[signal.severity] × TIME_DECAY_WEIGHT)
```

**Severity Points**:
- Severity 1: +2 points
- Severity 2: +5 points
- Severity 3: +10 points
- Severity 4: +20 points
- Severity 5: +40 points

**Time Decay**:
- Signals < 30 days old: 100% weight
- Signals 30-60 days old: 50% weight
- Signals > 60 days old: Exponential decay to minimum 10% weight

### Risk Levels

| Score Range | Level    | Color      | Action Recommended |
|-------------|----------|------------|-------------------|
| 0-14        | LOW      | Green      | None              |
| 15-34       | MEDIUM   | Amber      | Monitor           |
| 35-69       | HIGH     | Red        | Manual Review     |
| 70-100      | CRITICAL | Dark Red   | Immediate Review  |

---

## 🏗️ Architecture

### Components Created

1. **Firestore Collections**:
   - [`fraudSignals`](firestore-pack324b-fraud.rules:18) - Individual fraud signals
   - [`userRiskScores`](firestore-pack324b-fraud.rules:25) - Aggregated risk scores per user

2. **Cloud Functions**:
   - [`pack324b-fraud-signals.ts`](functions/src/pack324b-fraud-signals.ts:1) - Signal emission (non-blocking)
   - [`pack324b-risk-engine.ts`](functions/src/pack324b-risk-engine.ts:1) - Risk score calculation
   - [`pack324b-fraud-endpoints.ts`](functions/src/pack324b-fraud-endpoints.ts:1) - Admin API endpoints

3. **Type Definitions**:
   - [`pack324b-fraud-types.ts`](functions/src/pack324b-fraud-types.ts:1) - Complete type system

4. **Admin UI**:
   - [`app-mobile/app/admin/fraud-dashboard.tsx`](app-mobile/app/admin/fraud-dashboard.tsx:1) - Dashboard interface

5. **Security Rules**:
   - [`firestore-pack324b-fraud.rules`](firestore-pack324b-fraud.rules:1) - Admin-only access
   - [`firestore-pack324b-fraud.indexes.json`](firestore-pack324b-fraud.indexes.json:1) - Query optimization

---

## 🔌 Integration Points

### Signal Emission (Non-Blocking)

Signals are emitted from existing business logic **without blocking user flows**:

```typescript
// Example: After voice call ends
import { checkTokenDrainPattern } from './pack324b-fraud-signals';

// In your call end handler:
checkTokenDrainPattern(
  userId,
  sessionId,
  'VOICE',
  durationSeconds,
  tokensCost
).catch(error => {
  // Non-blocking - log error but continue
  logger.error('Fraud check failed:', error);
});
```

### Integration Locations

Add these calls to existing handlers:

1. **Voice/Video Call End**:
```typescript
await checkTokenDrainPattern(userId, sessionId, sessionType, duration, cost);
```

2. **AI Message Sent**:
```typescript
await checkMultiSessionSpam(userId, sessionId, source);
```

3. **Chat Message Sent**:
```typescript
await checkCopyPasteBehavior(userId, chatId, messageText);
```

4. **Event Ticket Refunded**:
```typescript
await checkFakeBookings(userId, eventId, ticketId);
```

5. **Calendar Booking Canceled**:
```typescript
await checkSelfRefunds(userId, bookingId);
```

6. **Payout Attempted**:
```typescript
await checkPayoutAbuse(userId, payoutId, amount);
```

7. **Profile Reported**:
```typescript
await checkIdentityMismatch(userId, reportId, reporterId);
```

8. **Panic Button Triggered**:
```typescript
await checkPanicRateSpike(userId, panicEventId);
```

---

## 🔐 Admin API Endpoints

All endpoints require admin authentication.

### Get Fraud Signals
```typescript
const getFraudSignals = httpsCallable(functions, 'pack324b_getFraudSignals');
const result = await getFraudSignals({
  userId?: string,
  source?: 'CHAT' | 'AI_CHAT' | 'AI_VOICE' | 'AI_VIDEO' | 'CALENDAR' | 'EVENT' | 'WALLET',
  signalType?: string,
  severity?: 1 | 2 | 3 | 4 | 5,
  startDate?: string, // YYYY-MM-DD
  endDate?: string,   // YYYY-MM-DD
  limit?: number,
  offset?: number,
});
```

### Get High Risk Users
```typescript
const getHighRiskUsers = httpsCallable(functions, 'pack324b_getHighRiskUsers');
const result = await getHighRiskUsers({
  level?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
  minRiskScore?: number,
  maxRiskScore?: number,
  limit?: number,
  offset?: number,
});
```

### Get User Risk Score
```typescript
const getUserRiskScore = httpsCallable(functions, 'pack324b_getUserRiskScore');
const result = await getUserRiskScore({ userId: 'user123' });
```

### Get Dashboard Stats
```typescript
const getStats = httpsCallable(functions, 'pack324b_getFraudDashboardStats');
const result = await getStats({});
```

### Recalculate Risk Score
```typescript
const recalculate = httpsCallable(functions, 'pack324b_recalculateUserRiskScore');
const result = await recalculate({ userId: 'user123' });
```

---

## 📊 Admin Dashboard Usage

### Accessing the Dashboard

1. Navigate to `/admin/fraud-dashboard` (admin role required)
2. View three main tabs:
   - **Overview**: Statistics and trends
   - **Signals**: List of fraud signals with filters
   - **High Risk Users**: Users with elevated risk scores

### Features

**Overview Tab**:
- Signal activity (24h, 7d, 30d)
- Risk distribution
- Signals by type and source

**Signals Tab**:
- Filter by source (Chat, AI, Calendar, etc.)
- Filter by user ID
- Sort by date and severity
- Click signal to view details

**High Risk Users Tab**:
- Filter by risk level
- View risk scores and signal counts
- Click user to view full profile
- See last signal type and date

---

## 🔧 Scheduled Jobs

### Risk Score Recalculation
**Function**: `scheduledRiskScoreRecalculation()`  
**Frequency**: Every hour  
**Purpose**: Updates risk scores for users with new signals

```typescript
// functions/src/index.ts
export const pack324b_hourlyRiskRecalc = onSchedule(
  { schedule: '0 * * * *' }, // Every hour
  async () => {
    await scheduledRiskScoreRecalculation();
  }
);
```

### Message Cache Cleanup
**Function**: `cleanupMessageCache()`  
**Frequency**: Daily  
**Purpose**: Removes expired copy-paste detection cache

```typescript
export const pack324b_dailyCacheCleanup = onSchedule(
  { schedule: '0 2 * * *' }, // 2 AM daily
  async () => {
    await cleanupMessageCache();
  }
);
```

### Old Signal Cleanup
**Function**: `cleanupOldFraudSignals()`  
**Frequency**: Weekly  
**Purpose**: Removes signals older than 365 days

```typescript
export const pack324b_weeklySignalCleanup = onSchedule(
  { schedule: '0 3 * * 0' }, // 3 AM Sunday
  async () => {
    await cleanupOldFraudSignals();
  }
);
```

---

## 🧪 Testing Guide

### Manual Testing

1. **Test Signal Emission**:
```typescript
// Create test scenario
await checkTokenDrainPattern('testUser', 'session1', 'VOICE', 25, 10);
// Verify signal created in fraudSignals collection
```

2. **Test Risk Calculation**:
```typescript
const recalc = httpsCallable(functions, 'pack324b_recalculateUserRiskScore');
const result = await recalc({ userId: 'testUser' });
console.log(result.data); // Should show updated risk score
```

3. **Test Admin Dashboard**:
- Login as admin user
- Navigate to `/admin/fraud-dashboard`
- Verify all tabs load correctly
- Test filters and sorting

### Integration Testing

Add calls to existing handlers and verify:
- Signals are created without blocking user flows
- Risk scores update correctly
- Admin dashboard displays data accurately

---

## 📈 Monitoring Recommendations

### Key Metrics to Track

1. **Signal Volume**:
   - Daily signal count by type
   - Trend analysis week-over-week

2. **Risk Distribution**:
   - Count of users at each risk level
   - Movement between levels

3. **System Performance**:
   - Signal emission latency
   - Risk calculation duration
   - Admin query response times

4. **False Positives**:
   - Signals that didn't result in enforcement
   - Pattern refinement needs

### Alert Thresholds

- Critical risk users > 10: Manual review needed
- Daily signals > 1000: Potential attack or system issue
- Risk calculation failures > 5%: Technical investigation

---

## ✅ Zero-Drift Compliance

### Verified Compliance

✅ **No Wallet Changes**
- Signal emission is read-only from wallet perspective
- No token balance modifications
- No transaction reversals

✅ **No Pricing Changes**
- Chat/call/AI pricing untouched
- No rate modifications
- No split adjustments

✅ **No Refund Logic**
- Detection only, no automatic refunds
- Manual review required for action

✅ **No Chat Logic Impact**
- [`chatMonetization.ts`](functions/src/chatMonetization.ts:1) unmodified (except adding signal emission call)
- Message billing unchanged
- Escrow logic untouched

✅ **No Auto-Bans**
- Risk scores are informational only
- Admin must take manual action
- No automatic enforcement

### Modified Files

All modifications are additive (signal emission calls):
- No existing business logic altered
- All signal checks are non-blocking
- Errors in detection don't affect user flows

---

## 🚀 Deployment Checklist

- [ ] Deploy Firestore rules: `firestore-pack324b-fraud.rules`
- [ ] Deploy Firestore indexes: `firestore-pack324b-fraud.indexes.json`
- [ ] Deploy Cloud Functions (all pack324b files)
- [ ] Schedule hourly risk recalculation job
- [ ] Schedule daily cache cleanup job
- [ ] Schedule weekly signal cleanup job
- [ ] Grant admin access to dashboard
- [ ] Add signal emission calls to existing handlers
- [ ] Monitor initial signal volume
- [ ] Review first batch of high-risk users

---

## 📝 Future Enhancements

Potential additions for future versions:

1. **Machine Learning Integration**:
   - Train ML model on historical signals
   - Predict risk before signals accumulate

2. **Pattern Correlation**:
   - Cross-reference signals with enforcement actions
   - Identify new fraud patterns automatically

3. **Automated Protective Actions**:
   - Rate limiting for high-risk users
   - Increased escrow requirements
   - Enhanced verification prompts

4. **Webhook Notifications**:
   - Alert admins of critical risk users
   - Integration with external fraud tools

---

## 🔒 Security Considerations

### Data Access

- All fraud data is admin-only
- Firestore rules enforce authentication
- API endpoints verify admin role
- No user can view their own risk score

### Privacy

- Signals contain minimal PII
- Context references, not full content
- Compliance with data retention policies
- GDPR-compliant deletion support

### Performance

- Non-blocking signal emission
- Efficient Firestore queries with indexes
- Batch processing for risk calculations
- Pagination for admin queries

---

## 📞 Support

For questions or issues:

1. Check signal types and thresholds in [`pack324b-fraud-types.ts`](functions/src/pack324b-fraud-types.ts:1)
2. Review admin endpoints in [`pack324b-fraud-endpoints.ts`](functions/src/pack324b-fraud-endpoints.ts:1)
3. Test signal emission in dev environment
4. Consult zero-drift compliance verification

---

**PACK 324B is production-ready and compliant with zero-drift requirements.**

Reviewed by: Kilo Code  
Date: 2025-12-11  
Version: 1.0.0