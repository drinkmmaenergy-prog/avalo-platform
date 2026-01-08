# PACK 304 — Admin Financial Console & Reconciliation

**Status:** ✅ Complete  
**Version:** 1.0.0  
**Last Updated:** 2025-12-09

---

## Overview

PACK 304 provides Avalo's internal finance team with a comprehensive read-only admin console for:

- **Platform Revenue Visibility**: Track Avalo fees, creator earnings, token purchases, and payouts
- **Financial Reconciliation**: Detect and investigate balance mismatches and anomalies
- **Compliance & Audit**: Export financial data for accounting and regulatory purposes
- **Anomaly Detection**: Automatically identify suspicious or inconsistent financial states

### Key Principle: Read-Only Control Layer

This pack is **strictly read-only** with **zero modifications** to:
- Token prices or packages
- Payout rate (0.20 PLN/token)
- Revenue splits (65/35 for standard, 80/20 for calendar/events)
- Any existing monetization logic

---

## Architecture

### Data Flow

```
walletTransactions (PACK 277) ──┐
creatorEarningsMonthly (PACK 303) ──┼──> Aggregation Engine ──> platformFinanceMonthly
withdrawalRequests (PACK 289) ──┘          ↓
                                    Anomaly Detection ──> financeAnomalies
```

### Collections

#### `platformFinanceMonthly/{year}_{month}`
Monthly aggregated platform financial data.

```typescript
{
  year: 2025,
  month: 1,
  gmvTokens: 1000000,              // Total GMV in tokens
  gmvFiatPLN: 200000,              // GMV * 0.20 PLN
  totalCreatorShareTokens: 700000,
  totalAvaloShareTokens: 300000,
  totalTokenPurchasesTokens: 500000,
  totalTokenPurchasesFiatPLN: 150000,
  totalPayoutTokens: 100000,
  totalPayoutFiatPLN: 20000,
  totalPayoutTransactions: 50,
  outstandingCreatorLiabilityTokens: 600000,
  outstandingCreatorLiabilityFiatPLN: 120000,
  feesFromChatTokens: 100000,
  feesFromCallsTokens: 80000,
  feesFromCalendarTokens: 70000,
  feesFromEventsTokens: 40000,
  feesFromOtherTokens: 10000,
  refundsTokens: 5000,
  netRevenueTokens: 295000,
  generatedAt: "2025-01-05T02:00:00Z",
  updatedAt: "2025-01-05T02:00:00Z"
}
```

#### `financeAnomalies/{anomalyId}`
Detected financial inconsistencies.

```typescript
{
  anomalyId: "UUID",
  type: "MISMATCH_BALANCE" | "NEGATIVE_BALANCE" | "PAYOUT_GREATER_THAN_EARNINGS" | ...,
  userId: "user123" | null,
  period: { year: 2025, month: 1 } | null,
  details: "Wallet balance (100) doesn't match expected (95). Discrepancy: 5 tokens",
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  status: "OPEN" | "UNDER_REVIEW" | "RESOLVED",
  resolvedByAdminId: "admin456" | null,
  resolvedAt: "2025-01-06T10:00:00Z" | null,
  resolutionNote: "Corrected via manual adjustment" | null,
  createdAt: "2025-01-05T03:00:00Z"
}
```

#### `adminUsers/{adminId}`
Admin role definitions (extends PACK 296).

```typescript
{
  adminId: "UUID",
  email: "finance@avalo.app",
  role: "FINANCE" | "SUPERADMIN",
  createdAt: Timestamp
}
```

---

## Security Model

### Role Requirements

**FINANCE Role:**
- ✅ View platform financial data
- ✅ View user financial summaries
- ✅ View and update anomalies
- ✅ Export financial data
- ❌ Modify transactions or wallets
- ❌ Approve payouts (handled by PACK 289)

**SUPERADMIN Role:**
- ✅ All FINANCE permissions
- ✅ Manage admin users
- ✅ Trigger manual aggregations

### Audit Logging

All admin actions are logged to `auditLogs` (PACK 296):
- Console access
- User summary views
- Anomaly reviews/resolutions
- Data exports

---

## API Reference

### 1. Monthly Overview

**Endpoint:** `pack304_getMonthlyOverview`

**Request:**
```typescript
{
  year: 2025,
  month: 1
}
```

**Response:**
```typescript
{
  success: true,
  data: PlatformFinanceMonthly
}
```

**Access:** FINANCE, SUPERADMIN

---

### 2. Monthly Trends

**Endpoint:** `pack304_getMonthlyTrends`

**Request:**
```typescript
{
  months: 6  // Last 6 months (default)
}
```

**Response:**
```typescript
{
  success: true,
  data: PlatformFinanceMonthly[]
}
```

**Access:** FINANCE, SUPERADMIN

---

### 3. User Financial Summary

**Endpoint:** `pack304_getUserFinancialSummary`

**Request:**
```typescript
{
  userId: "user123"
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    userId: "user123",
    tokensPurchased: 1000,
    tokensEarned: 500,
    tokensSpent: 800,
    tokensRefunded: 50,
    tokensWithdrawn: 100,
    walletBalance: 650,
    expectedBalance: 650,
    balanceDiscrepancy: 0,
    hasDiscrepancy: false
  }
}
```

**Access:** FINANCE, SUPERADMIN

---

### 4. List Anomalies

**Endpoint:** `pack304_listAnomalies`

**Request:**
```typescript
{
  type?: "NEGATIVE_BALANCE" | "MISMATCH_BALANCE" | ...,
  status?: "OPEN" | "UNDER_REVIEW" | "RESOLVED",
  userId?: "user123",
  limit?: 50,
  startAfter?: "anomalyId"
}
```

**Response:**
```typescript
{
  success: true,
  anomalies: FinanceAnomaly[],
  hasMore: boolean
}
```

**Access:** FINANCE, SUPERADMIN

---

### 5. Update Anomaly Status

**Endpoint:** `pack304_updateAnomalyStatus`

**Request:**
```typescript
{
  anomalyId: "UUID",
  status: "UNDER_REVIEW" | "RESOLVED",
  resolutionNote?: "Fixed via support ticket #123"
}
```

**Response:**
```typescript
{
  success: true
}
```

**Access:** FINANCE, SUPERADMIN

---

### 6. Export Monthly Finance

**Endpoint:** `pack304_exportMonthlyFinance`

**Request:**
```typescript
{
  year: 2025,
  month: 1,
  format: "csv" | "json"
}
```

**Response:**
```typescript
{
  success: true,
  downloadUrl: "https://storage.googleapis.com/..."  // Valid for 24h
}
```

**Access:** FINANCE, SUPERADMIN

---

### 7. Export Creator Summary

**Endpoint:** `pack304_exportCreatorSummary`

**Request:**
```typescript
{
  year: 2025,
  month: 1,
  format: "csv" | "json"
}
```

**Response:**
```typescript
{
  success: true,
  downloadUrl: "https://storage.googleapis.com/..."  // Valid for 24h
}
```

**Access:** FINANCE, SUPERADMIN

---

### 8. Trigger Aggregation (Admin)

**Endpoint:** `pack304_admin_triggerAggregation`

**Request:**
```typescript
{
  year: 2025,
  month: 1
}
```

**Response:**
```typescript
{
  success: true,
  data: PlatformFinanceMonthly,
  processingTimeMs: 1234
}
```

**Access:** SUPERADMIN

---

### 9. Trigger Anomaly Detection (Admin)

**Endpoint:** `pack304_admin_triggerAnomalyDetection`

**Request:**
```typescript
{
  userId?: "user123",
  year?: 2025,
  month?: 1
}
```

**Response:**
```typescript
{
  success: true,
  anomaliesFound: 5,
  anomalies: FinanceAnomaly[]
}
```

**Access:** SUPERADMIN

---

## Scheduled Jobs

### Daily Aggregation

**Function:** `pack304_cronDailyAggregation`  
**Schedule:** 2 AM UTC daily  
**Actions:**
1. Aggregate current month
2. Re-aggregate previous month (catch late transactions)
3. Run anomaly detection for current month

---

## Revenue Split Logic

### Standard Features (65/35)
- Chat: 65% creator, 35% Avalo
- Other monetized features: 65% creator, 35% Avalo

### Premium Features (80/20)
- Voice/Video Calls: 80% creator, 20% Avalo
- Calendar Bookings: 80% creator, 20% Avalo
- Event Tickets: 80% creator, 20% Avalo

### Payout Rate
- **Fixed:** 1 token = 0.20 PLN
- Used for all liability calculations

---

## Anomaly Detection

### Types

1. **NEGATIVE_BALANCE**: User wallet balance < 0
2. **MISMATCH_BALANCE**: Wallet balance ≠ calculated balance
3. **INVALID_SPLIT**: Transaction split doesn't match 65/35 or 80/20
4. **PAYOUT_GREATER_THAN_EARNINGS**: Withdrawals > lifetime earnings
5. **REFUND_INCONSISTENT**: Refund issues (missing original tx, exceeds amount)

### Severity Levels

- **LOW**: Minor discrepancies, self-correcting
- **MEDIUM**: Requires review, no immediate impact
- **HIGH**: Significant issue, may affect payouts
- **CRITICAL**: Urgent, potential data corruption

---

## Deployment

### 1. Prerequisites

```bash
# Ensure finance export bucket exists
gsutil mb -l europe-west3 gs://avalo-finance-exports
gsutil iam ch allUsers:objectViewer gs://avalo-finance-exports
```

### 2. Deploy

```bash
# Deploy Firestore rules and indexes
firebase deploy --only firestore:rules,firestore:indexes \
  --config firestore-pack304-admin-finance.rules \
  --config firestore-pack304-admin-finance.indexes.json

# Deploy Cloud Functions
firebase deploy --only functions:pack304_getMonthlyOverview,\
functions:pack304_getMonthlyTrends,\
functions:pack304_getUserFinancialSummary,\
functions:pack304_listAnomalies,\
functions:pack304_updateAnomalyStatus,\
functions:pack304_exportMonthlyFinance,\
functions:pack304_exportCreatorSummary,\
functions:pack304_admin_triggerAggregation,\
functions:pack304_admin_triggerAnomalyDetection,\
functions:pack304_cronDailyAggregation
```

### 3. Create Admin Users

```typescript
// In Firebase Console or admin script
await db.collection('adminUsers').doc('finance-admin-uid').set({
  adminId: 'finance-admin-uid',
  email: 'finance@avalo.app',
  role: 'FINANCE',
  createdAt: admin.firestore.FieldValue.serverTimestamp()
});
```

---

## Integration Points

### Depends On:
- **PACK 277**: `walletTransactions` (source of truth for all token movements)
- **PACK 288**: Token store (prices, packages)
- **PACK 289**: `withdrawalRequests` (payout data)
- **PACK 296**: `auditLogs` (admin action logging)
- **PACK 299**: Analytics engine (optional)
- **PACK 302**: Billing system (token purchases)
- **PACK 303**: `creatorEarningsMonthly` (creator earnings)

### Used By:
- Internal finance team (web console)
- Accounting/compliance systems (exports)
- Monitoring/alerting (anomalies)

---

## Testing

### Unit Tests

```bash
cd functions
npm test -- pack304
```

### Manual Testing

```typescript
// 1. Trigger aggregation
const trigger = firebase.functions().httpsCallable('pack304_admin_triggerAggregation');
await trigger({ year: 2025, month: 1 });

// 2. View dashboard
const getOverview = firebase.functions().httpsCallable('pack304_getMonthlyOverview');
const { data } = await getOverview({ year: 2025, month: 1 });
console.log(data);

// 3. Check user balance
const getUserSummary = firebase.functions().httpsCallable('pack304_getUserFinancialSummary');
const summary = await getUserSummary({ userId: 'test-user-123' });
console.log(summary.data);

// 4. List anomalies
const listAnomalies = firebase.functions().httpsCallable('pack304_listAnomalies');
const anomalies = await listAnomalies({ status: 'OPEN' });
console.log(anomalies.data);
```

---

## Monitoring

### Key Metrics

```bash
# Aggregation health
gcloud logging read "resource.labels.function_name=pack304_cronDailyAggregation" --limit 10

# Anomaly count
firebase firestore:query financeAnomalies --where "status == 'OPEN'"

# Export usage
firebase firestore:query auditLogs \
  --where "actionType == 'ADMIN_EXPORT_CREATED'" \
  --where "timestamp >= $(date -u +%Y-%m-%dT00:00:00Z)"
```

### Alerts (Recommended)

- **Critical anomalies**: Alert when severity='CRITICAL' detected
- **Aggregation failures**: Alert if daily job fails
- **Large balance discrepancies**: Alert if |discrepancy| > 1000 tokens
- **Outstanding liability spike**: Alert if liability increases >20% month-over-month

---

## Troubleshooting

### Issue: Aggregation shows zero GMV

**Cause:** No transactions in period or query issues

**Solution:**
1. Check `walletTransactions` collection has data
2. Verify date range query (UTC timestamps)
3. Run manual aggregation with `forceRecalculation: true`

---

### Issue: Balance discrepancies

**Cause:** Transaction missing or duplicated

**Solution:**
1. Use `pack304_getUserFinancialSummary` to see breakdown
2. Check `walletTransactions` for user
3. Look for missing or duplicate `externalId`
4. Review anomaly details for hints

---

### Issue: Export fails

**Cause:** Storage bucket not configured or permissions issue

**Solution:**
```bash
# Check bucket exists
gsutil ls gs://avalo-finance-exports

# Create if missing
gsutil mb -l europe-west3 gs://avalo-finance-exports

# Set permissions
gsutil iam ch allUsers:objectViewer gs://avalo-finance-exports
```

---

## Constraints & Rules

### ❌ **NEVER:**
- Modify token prices or packages
- Change payout rate (0.20 PLN/token)
- Alter revenue splits (65/35, 80/20)
- Write to `walletTransactions` or `wallets`
- Approve/reject payouts from this console
- Edit transaction history

### ✅ **ALWAYS:**
- Log all admin actions to `auditLogs`
- Validate admin role before access
- Use signed URLs for exports (max 24h)
- Maintain idempotency in aggregations
- Respect user privacy (no PII in exports beyond userId)

---

## Files

**Backend:**
- `functions/src/types/pack304-admin-finance.types.ts`
- `functions/src/pack304-aggregation.ts`
- `functions/src/pack304-anomaly-detection.ts`
- `functions/src/pack304-endpoints.ts`
- `functions/src/pack304-exports.ts`

**Config:**
- `firestore-pack304-admin-finance.rules`
- `firestore-pack304-admin-finance.indexes.json`

**Docs:**
- `PACK_304_IMPLEMENTATION.md` (this file)
- `PACK_304_QUICK_REFERENCE.md`

---

## Support

For questions or issues:
- **Internal:** Slack #finance-console
- **Technical:** dev@avalo.app
- **Compliance:** compliance@avalo.app

---

**Version:** 1.0.0  
**Status:** ✅ Production Ready  
**Last Updated:** 2025-12-09