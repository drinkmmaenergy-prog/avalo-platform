# PACK 90 — System Audit, Event Logging & Technical Observability

## Overview

PACK 90 introduces a comprehensive audit and event logging infrastructure for Avalo, providing production-ready monitoring, debugging, and compliance capabilities without changing any business logic or tokenomics.

### Goals
- **Business Audit Log**: Track high-value events tied to users and money
- **Technical Event Log**: Monitor system health, errors, and performance
- **Metrics Aggregation**: Pre-aggregated counters for dashboards
- **Compliance**: Immutable audit trail for forensic investigations

### Non-Negotiable Rules
✅ No free tokens, no discounts, no promo codes, no cashback, no bonuses  
✅ Token price per unit remains unchanged  
✅ Revenue split stays 65% creator / 35% Avalo  
✅ Audit logs are read-only and never mutate financial data  

---

## Architecture

### Three-Layer System

```
┌─────────────────────────────────────────────────────────┐
│                   APPLICATION LAYER                     │
│  (Payments, Payouts, KYC, Disputes, Enforcement, etc.)  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   LOGGING LAYER                         │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Business Audit  │  │  Tech Events │  │  Metrics   │ │
│  │      Log        │  │     Log      │  │   Daily    │ │
│  └─────────────────┘  └──────────────┘  └────────────┘ │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   STORAGE LAYER                         │
│              (Firestore Collections)                    │
│  • business_audit_log  • tech_event_log  • metrics_daily│
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Files

### Core Modules

1. **[`functions/src/pack90-logging.ts`](functions/src/pack90-logging.ts:1)**
   - Core logging utilities and types
   - Business audit logging functions
   - Technical event logging functions
   - Metrics aggregation functions
   - Query helpers

2. **[`functions/src/pack90-scheduled.ts`](functions/src/pack90-scheduled.ts:1)**
   - `rebuildDailyMetrics()` - Scheduled job (runs daily at 2 AM UTC)
   - Rebuilds metrics from actual events for redundancy

3. **[`functions/src/pack90-admin.ts`](functions/src/pack90-admin.ts:1)**
   - `admin_getDailyMetrics()` - Query metrics for date range
   - `admin_listBusinessEvents()` - Query business audit logs
   - `admin_listTechEvents()` - Query technical event logs
   - `admin_getUserAuditTrail()` - Get complete user audit history
   - `admin_getMetricsSummary()` - Get all metrics for a date

4. **[`functions/src/pack90-integrations.ts`](functions/src/pack90-integrations.ts:1)**
   - Integration examples and patterns
   - Copy-paste templates for existing modules

5. **[`firestore-rules/pack90-audit.rules`](firestore-rules/pack90-audit.rules:1)**
   - Security rules for audit collections
   - Prevents direct client access
   - Backend-only write access

---

## Firestore Collections

### 1. `business_audit_log`

**Purpose**: High-value business events (payments, earnings, payouts, KYC, disputes, enforcement)

**Document Structure**:
```typescript
{
  id: string;                    // UUID
  eventType: BusinessEventType;  // e.g., "PAYMENT_COMPLETED"
  actorUserId?: string | null;   // User who triggered event
  subjectUserId?: string | null; // User event is about
  relatedId?: string | null;     // Related object ID (transactionId, payoutId, etc.)
  metadata: Record<string, any>; // Structured payload (sanitized)
  createdAt: Timestamp;          // Server timestamp
  source: EventSource;           // "BACKEND_FUNCTION" | "ADMIN_PANEL" | "SYSTEM"
  functionName?: string | null;  // Cloud Function name
  ipCountry?: string | null;     // Country code if available
}
```

**Retention**: Indefinite (compliance requirement)

**Indexed Fields**:
- `eventType`
- `actorUserId`
- `subjectUserId`
- `relatedId`
- `createdAt`

### 2. `tech_event_log`

**Purpose**: System health, errors, debugging information

**Document Structure**:
```typescript
{
  id: string;                     // UUID
  level: TechEventLevel;          // "INFO" | "WARN" | "ERROR"
  category: TechEventCategory;    // "FUNCTION" | "JOB" | "SERVICE" | "SECURITY"
  functionName: string;           // Function/module name
  message: string;                // Short summary
  context?: Record<string, any>;  // Structured context
  createdAt: Timestamp;           // Server timestamp
}
```

**Retention**: 30-90 days (configurable)

**Indexed Fields**:
- `level`
- `category`
- `functionName`
- `createdAt`

### 3. `metrics_daily`

**Purpose**: Pre-aggregated daily metrics for dashboards

**Document Structure**:
```typescript
{
  id: string;           // "METRICKEY_YYYY-MM-DD"
  date: string;         // "YYYY-MM-DD"
  metricKey: MetricKey; // e.g., "TOTAL_PAYMENTS"
  value: number;        // Aggregated count
  updatedAt: Timestamp; // Last update time
}
```

**Metric Keys**:
- `TOTAL_PAYMENTS` - Total payment events
- `TOTAL_EARNINGS_EVENTS` - Total earnings credited
- `GIFTS_SENT` - Gifts sent count
- `PREMIUM_STORIES_SOLD` - Premium stories purchased
- `PAYOUT_REQUESTS` - Payout requests created
- `PAYOUTS_COMPLETED` - Payouts completed
- `KYC_SUBMISSIONS` - KYC applications submitted
- `KYC_APPROVALS` - KYC approvals
- `KYC_REJECTIONS` - KYC rejections
- `DISPUTES_CREATED` - Disputes created
- `DISPUTES_RESOLVED` - Disputes resolved
- `ENFORCEMENT_CHANGES` - Enforcement state changes
- `MODERATOR_ACTIONS` - Moderator actions taken
- `NEW_USERS` - New user registrations

---

## Integration Guide

### Quick Start

1. **Import logging functions in your module**:
```typescript
import {
  logBusinessEvent,
  logPaymentEvent,
  logPayoutEvent,
  logKycEvent,
  logDisputeEvent,
  logEnforcementEvent,
  logModeratorAction,
  incrementMetric,
} from './pack90-logging';
```

2. **Add logging after successful operations**:
```typescript
// Example: After payment transaction
try {
  // ... your transaction logic ...
  
  // PACK 90: Log the event (non-blocking)
  await logPaymentEvent(
    payerId,
    earnerId,
    tokens,
    'gift',
    giftId
  );
} catch (error) {
  console.error('[Pack90] Failed to log:', error);
  // Don't fail the operation if logging fails
}
```

### Integration Patterns

#### 1. Monetization Events (Chat, Gifts, Premium Stories, etc.)

**Location**: [`chatMonetization.ts`](functions/src/chatMonetization.ts:1), gift modules, story modules

```typescript
// After successful payment transaction
await logPaymentEvent(
  payerId,
  earnerId,
  tokens,
  'chat_message', // or 'gift', 'premium_story', etc.
  chatId
);

// For specific gift events
await logBusinessEvent({
  eventType: 'GIFT_SENT',
  actorUserId: senderId,
  subjectUserId: receiverId,
  relatedId: giftId,
  metadata: { tokens, giftType },
  functionName: 'sendGift',
});

await incrementMetric('GIFTS_SENT');
```

#### 2. Payout Events

**Location**: [`payouts.ts`](functions/src/payouts.ts:1), [`payoutRequests.ts`](functions/src/payoutRequests.ts:1)

```typescript
// After payout request creation
await logPayoutEvent(
  'PAYOUT_REQUESTED',
  userId,
  requestId,
  { tokensRequested, amountFiat }
);

// After status change
await logPayoutEvent(
  'PAYOUT_STATUS_CHANGED',
  userId,
  requestId,
  { oldStatus, newStatus, reason }
);

// After completion
await logPayoutEvent('PAYOUT_COMPLETED', userId, requestId);
```

#### 3. KYC Events

**Location**: [`kyc.ts`](functions/src/kyc.ts:1)

```typescript
// After KYC submission
await logKycEvent(
  'KYC_SUBMITTED',
  userId,
  documentId,
  undefined,
  { documentType, country }
);

// After KYC approval
await logKycEvent(
  'KYC_APPROVED',
  userId,
  documentId,
  reviewerId
);

// After KYC rejection
await logKycEvent(
  'KYC_REJECTED',
  userId,
  documentId,
  reviewerId,
  { reason }
);
```

#### 4. Dispute Events

**Location**: [`disputes.ts`](functions/src/disputes.ts:1)

```typescript
// After dispute creation
await logDisputeEvent(
  'DISPUTE_CREATED',
  userId,
  disputeId,
  undefined,
  { type, title }
);

// After dispute resolution
await logDisputeEvent(
  'DISPUTE_RESOLVED',
  userId,
  disputeId,
  reviewerId,
  { outcome, resolution }
);
```

#### 5. Enforcement Events

**Location**: [`enforcementEngine.ts`](functions/src/enforcementEngine.ts:1)

```typescript
// After enforcement state change
await logEnforcementEvent(
  userId,
  accountStatus,
  reviewerId,
  {
    reviewNote,
    featureLocks,
    manual: true
  }
);
```

#### 6. Moderator Actions

**Location**: [`moderationCaseHooks.ts`](functions/src/moderationCaseHooks.ts:1), moderation endpoints

```typescript
// After case resolution
await logModeratorAction(
  moderatorId,
  'RESOLVE_CASE',
  userId,
  caseId,
  { caseType, outcome }
);

// After KYC approval through moderation
await logModeratorAction(
  moderatorId,
  'APPROVE_KYC',
  userId,
  caseId,
  { documentId }
);
```

### Error Logging

```typescript
// Wrap critical operations
try {
  await criticalOperation();
} catch (error: any) {
  await logTechEvent({
    level: 'ERROR',
    category: 'FUNCTION',
    functionName: 'criticalOperation',
    message: error.message,
    context: {
      errorName: error.name,
      errorCode: error.code,
    },
  });
  throw error;
}
```

---

## API Reference

### Business Event Logging

#### `logBusinessEvent(params)`

```typescript
await logBusinessEvent({
  eventType: 'PAYMENT_COMPLETED',
  actorUserId: 'user123',
  subjectUserId: 'creator456',
  relatedId: 'txn789',
  metadata: { tokens: 100, context: 'gift' },
  source: 'BACKEND_FUNCTION',
  functionName: 'sendGift',
});
```

#### Convenience Functions

```typescript
// Payment events (auto-logs PAYMENT_COMPLETED + EARNINGS_CREDITED + metrics)
await logPaymentEvent(payerId, earnerId, tokens, context, relatedId);

// Payout events
await logPayoutEvent(eventType, userId, payoutRequestId, metadata);

// KYC events
await logKycEvent(eventType, userId, documentId, reviewerId, metadata);

// Dispute events
await logDisputeEvent(eventType, userId, disputeId, reviewerId, metadata);

// Enforcement events
await logEnforcementEvent(userId, accountStatus, reviewerId, metadata);

// Moderator actions
await logModeratorAction(moderatorId, action, targetUserId, caseId, metadata);
```

### Technical Event Logging

```typescript
await logTechEvent({
  level: 'ERROR',
  category: 'FUNCTION',
  functionName: 'processPayment',
  message: 'Payment processing failed',
  context: { error: 'Insufficient funds', userId: 'user123' },
});
```

### Metrics

```typescript
// Increment a metric
await incrementMetric('TOTAL_PAYMENTS');
await incrementMetric('PAYOUT_REQUESTS');

// Get metric value
const value = await getMetricValue('TOTAL_PAYMENTS', '2025-01-15');

// Get metrics range
const metrics = await getMetricsRange(
  'TOTAL_PAYMENTS',
  '2025-01-01',
  '2025-01-31'
);
```

### Query Functions

```typescript
// Query business events
const result = await queryBusinessEvents({
  eventType: 'PAYMENT_COMPLETED',
  actorUserId: 'user123',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31'),
  limit: 50,
});

// Query tech events
const techResult = await queryTechEvents({
  level: 'ERROR',
  category: 'FUNCTION',
  functionName: 'processPayment',
  limit: 100,
});
```

---

## Admin Endpoints

All admin endpoints are callable functions that require admin role verification.

### `admin_getDailyMetrics`

```typescript
// Request
{
  dateRange: {
    startDate: '2025-01-01',
    endDate: '2025-01-31'
  },
  metricKeys: ['TOTAL_PAYMENTS', 'PAYOUT_REQUESTS'] // optional
}

// Response
{
  metrics: [
    { date: '2025-01-01', metricKey: 'TOTAL_PAYMENTS', value: 1234 },
    { date: '2025-01-02', metricKey: 'TOTAL_PAYMENTS', value: 1567 },
    ...
  ]
}
```

### `admin_listBusinessEvents`

```typescript
// Request
{
  filters: {
    eventType: 'PAYMENT_COMPLETED',
    actorUserId: 'user123',
    startDate: '2025-01-01T00:00:00Z',
    endDate: '2025-01-31T23:59:59Z'
  },
  pagination: {
    limit: 50,
    cursor: 'lastEventId'
  }
}

// Response
{
  events: [...],
  nextCursor: 'nextEventId'
}
```

### `admin_listTechEvents`

```typescript
// Request
{
  filters: {
    level: 'ERROR',
    category: 'FUNCTION',
    functionName: 'processPayment',
    startDate: '2025-01-01T00:00:00Z'
  },
  pagination: {
    limit: 100
  }
}

// Response
{
  events: [...],
  nextCursor: 'nextEventId'
}
```

### `admin_getUserAuditTrail`

```typescript
// Request
{
  userId: 'user123',
  limit: 100
}

// Response
{
  events: [
    {
      id: 'evt1',
      eventType: 'PAYMENT_COMPLETED',
      role: 'ACTOR', // or 'SUBJECT'
      relatedId: 'txn789',
      metadata: {...},
      createdAt: '2025-01-15T10:30:00Z',
      source: 'BACKEND_FUNCTION'
    },
    ...
  ]
}
```

### `admin_getMetricsSummary`

```typescript
// Request
{
  date: '2025-01-15' // optional, defaults to today
}

// Response
{
  date: '2025-01-15',
  summary: {
    payments: { total: 1234, earnings: 1234 },
    payouts: { requests: 56, completed: 45 },
    kyc: { submissions: 23, approvals: 18, rejections: 5 },
    disputes: { created: 12, resolved: 10 },
    enforcement: { changes: 8, moderatorActions: 15 },
    users: { newUsers: 89 }
  }
}
```

---

## Scheduled Jobs

### `rebuildDailyMetrics`

**Schedule**: Daily at 2:00 AM UTC  
**Runtime**: ~2-5 minutes  
**Purpose**: Rebuild yesterday's metrics by counting actual events

**What it does**:
1. Counts events from `business_audit_log` for yesterday
2. Updates `metrics_daily` with accurate counts
3. Provides redundancy if real-time increments are missed
4. Logs completion to `tech_event_log`

**Monitoring**:
- Check Cloud Functions logs for "MetricsJob" entries
- Monitor function execution time
- Alert if job fails or takes >10 minutes

---

## Security & Compliance

### Firestore Security Rules

```javascript
// All audit collections are backend-only
match /business_audit_log/{logId} {
  allow read: if false;   // No direct reads
  allow write: if false;  // Backend only via Admin SDK
}

match /tech_event_log/{logId} {
  allow read: if false;
  allow write: if false;
}

match /metrics_daily/{metricId} {
  allow read: if false;
  allow write: if false;
}
```

### Admin Access Control

Admin endpoints verify role via `admin_roles` collection:

```typescript
async function verifyAdminRole(context) {
  if (!context.auth) throw new Error('Unauthenticated');
  
  const adminDoc = await db.collection('admin_roles')
    .doc(context.auth.uid)
    .get();
  
  if (!adminDoc.exists || !adminDoc.data()?.active) {
    throw new Error('Admin access required');
  }
}
```

### Data Sanitization

All metadata is automatically sanitized:
- Sensitive keys are redacted (password, token, secret, apiKey, card, cvv, ssn)
- Strings are limited to 500 characters
- Objects are stringified and limited
- URLs, emails, and long hex strings are redacted

### Compliance Features

✅ **Immutable Logs**: Once written, logs cannot be modified  
✅ **Complete Audit Trail**: All user and money events are logged  
✅ **Data Privacy**: Sensitive information is automatically redacted  
✅ **Admin Access Only**: Regular users cannot access logs  
✅ **Forensic Capability**: Full user audit trail for investigations  

---

## Best Practices

### 1. Always Use Try-Catch for Logging

```typescript
try {
  await logBusinessEvent({...});
} catch (error) {
  console.error('[Pack90] Failed to log:', error);
  // Don't throw - logging failure shouldn't break operations
}
```

### 2. Use Convenience Functions

```typescript
// ✅ Good
await logPaymentEvent(payerId, earnerId, tokens, 'gift', giftId);

// ❌ Avoid (more error-prone)
await logBusinessEvent({ eventType: 'PAYMENT_COMPLETED', ... });
await logBusinessEvent({ eventType: 'EARNINGS_CREDITED', ... });
await incrementMetric('TOTAL_PAYMENTS');
await incrementMetric('TOTAL_EARNINGS_EVENTS');
```

### 3. Log After Success, Not Before

```typescript
// ✅ Good
await db.runTransaction(async (t) => {
  // ... transaction logic ...
});
await logPaymentEvent(...);

// ❌ Bad
await logPaymentEvent(...);
await db.runTransaction(async (t) => {
  // ... might fail, log is already written ...
});
```

### 4. Include Relevant Context

```typescript
// ✅ Good
await logBusinessEvent({
  eventType: 'PAYMENT_COMPLETED',
  metadata: {
    tokens: 100,
    context: 'gift',
    giftType: 'rose',
    giftId: 'gift123',
  },
});

// ❌ Bad
await logBusinessEvent({
  eventType: 'PAYMENT_COMPLETED',
  metadata: {},
});
```

### 5. Increment Metrics After Events

```typescript
await logPaymentEvent(...);
await incrementMetric('TOTAL_PAYMENTS');
await incrementMetric('GIFTS_SENT'); // if applicable
```

---

## Monitoring & Alerting

### Key Metrics to Monitor

1. **Event Volumes**
   - Daily payment counts
   - Payout request rates
   - KYC submission rates
   - Dispute creation rates

2. **Error Rates**
   - Count of ERROR level tech events
   - Failed payout attempts
   - KYC rejection rates

3. **Performance**
   - `rebuildDailyMetrics` execution time
   - Admin query response times

### Recommended Alerts

```yaml
alerts:
  - name: High Error Rate
    condition: tech_event_log.level == ERROR > 100/hour
    severity: HIGH
    
  - name: Daily Metrics Job Failed
    condition: rebuildDailyMetrics failed
    severity: CRITICAL
    
  - name: Unusual Payout Volume
    condition: PAYOUT_REQUESTS > 2x average
    severity: MEDIUM
    
  - name: KYC Rejection Spike
    condition: KYC_REJECTIONS > 50% of submissions
    severity: MEDIUM
```

---

## Troubleshooting

### Issue: Metrics are missing or inaccurate

**Cause**: Real-time increment failed or was missed  
**Solution**: 
1. Wait for next `rebuildDailyMetrics` run (2 AM UTC)
2. Or manually trigger rebuild for specific date
3. Check Cloud Functions logs for errors

### Issue: Admin endpoints return permission denied

**Cause**: User doesn't have admin role  
**Solution**:
1. Verify user exists in `admin_roles` collection
2. Check `active: true` field
3. Verify Firebase Authentication token

### Issue: Logs are not being written

**Cause**: Backend function error or quota exceeded  
**Solution**:
1. Check Cloud Functions logs for errors
2. Verify Firestore quota hasn't been exceeded
3. Check if logging is wrapped in try-catch properly

### Issue: Query returns no results

**Cause**: Incorrect filters or date format  
**Solution**:
1. Verify date format is ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)
2. Check eventType spelling
3. Verify userId exists in logs

---

## Migration & Rollout

### Phase 1: Install (Week 1)
1. Deploy PACK 90 modules to production
2. Deploy Firestore security rules
3. Deploy scheduled job
4. Verify admin endpoints work

### Phase 2: Integrate (Week 2-3)
1. Add logging to payments/earnings (highest priority)
2. Add logging to payouts
3. Add logging to KYC
4. Add logging to disputes
5. Add logging to enforcement
6. Add logging to moderator actions

### Phase 3: Monitor (Week 4+)
1. Verify metrics are accurate
2. Set up monitoring dashboards
3. Configure alerts
4. Train support team on using admin endpoints

### Rollback Plan

If issues arise:
1. Remove logging calls from modules (logging failures are non-blocking)
2. Keep scheduled job running to rebuild metrics
3. Admin endpoints remain functional for viewing existing logs

---

## Cost Analysis

### Storage Costs

**Business Audit Log**: ~1KB per event
- 10,000 events/day = 10MB/day = 300MB/month
- Indefinite retention
- Est. cost: $0.54/month (300MB × $0.18/GB)

**Tech Event Log**: ~500 bytes per event
- 5,000 events/day = 2.5MB/day = 75MB/month
- 90-day retention
- Est. cost: $0.01/month

**Metrics Daily**: ~200 bytes per metric
- 15 metrics/day = 3KB/day = 90KB/month
- Indefinite retention
- Est. cost: negligible

### Operation Costs

**Writes**: 
- Business events: ~10,000/day = 300K/month = $0.18
- Tech events: ~5,000/day = 150K/month = $0.09
- Metrics: ~15/day = 450/month = negligible

**Reads** (admin queries):
- ~1,000/month = $0.06

**Scheduled Job**:
- 1 run/day × 30 days = 30 invocations
- ~2-5 minutes runtime = $0.15/month

**Total Estimated Cost**: ~$1.03/month

### Optimization Tips

1. Use TTL for tech_event_log (reduce retention)
2. Export old business_audit_log to BigQuery
3. Batch admin queries when possible
4. Use metrics_daily instead of counting events

---

## Summary

PACK 90 provides enterprise-grade observability for Avalo:

✅ **Complete Audit Trail**: Every payment, payout, KYC, dispute, and enforcement action is logged  
✅ **Compliance Ready**: Immutable logs with data sanitization  
✅ **Production Monitoring**: Technical event logging for debugging  
✅ **Dashboard Ready**: Pre-aggregated daily metrics  
✅ **Secure**: Backend-only access with admin verification  
✅ **Non-Breaking**: Logging failures don't break operations  
✅ **Cost Effective**: ~$1/month for typical usage  

### Next Steps

1. Deploy modules to production
2. Integrate logging into existing code (use [`pack90-integrations.ts`](functions/src/pack90-integrations.ts:1) examples)
3. Set up monitoring dashboards
4. Train support team on admin endpoints
5. Configure alerts for critical metrics

---

## Support & Maintenance

### Regular Maintenance

- **Daily**: Monitor scheduled job execution
- **Weekly**: Review error rates and alert thresholds
- **Monthly**: Analyze metric trends and storage costs
- **Quarterly**: Review retention policies and export old logs

### Documentation

- API Reference: See code comments in [`pack90-logging.ts`](functions/src/pack90-logging.ts:1)
- Integration Guide: See [`pack90-integrations.ts`](functions/src/pack90-integrations.ts:1)
- Admin Guide: See [`pack90-admin.ts`](functions/src/pack90-admin.ts:1)

### Contact

For questions or issues with PACK 90, contact the backend team or refer to this documentation.

---

**PACK 90 Implementation Complete** ✅