# PACK 304 — Quick Reference Guide

## TL;DR

**Admin Financial Console & Reconciliation** - Read-only financial visibility for Avalo's internal finance team. Track revenue, creator earnings, payouts, and detect anomalies.

---

## Key Endpoints

| Function | Purpose | Access |
|----------|---------|--------|
| `pack304_getMonthlyOverview` | Get monthly financial summary | FINANCE, SUPERADMIN |
| `pack304_getMonthlyTrends` | Get last N months trend | FINANCE, SUPERADMIN |
| `pack304_getUserFinancialSummary` | User balance reconciliation | FINANCE, SUPERADMIN |
| `pack304_listAnomalies` | List detected anomalies | FINANCE, SUPERADMIN |
| `pack304_updateAnomalyStatus` | Review/resolve anomaly | FINANCE, SUPERADMIN |
| `pack304_exportMonthlyFinance` | Export platform data (CSV/JSON) | FINANCE, SUPERADMIN |
| `pack304_exportCreatorSummary` | Export creator data (CSV/JSON) | FINANCE, SUPERADMIN |
| `pack304_admin_triggerAggregation` | Manual aggregation trigger | SUPERADMIN |
| `pack304_cronDailyAggregation` | Scheduled daily job (2 AM UTC) | SYSTEM |

---

## Revenue Splits (Read-Only)

| Feature | Creator | Avalo |
|---------|---------|-------|
| Chat | 65% | 35% |
| Calls | 80% | 20% |
| Calendar | 80% | 20% |
| Events | 80% | 20% |
| Other | 65% | 35% |

**Payout Rate:** 1 token = 0.20 PLN (fixed)

---

## Quick Start

### View Dashboard

```typescript
import { httpsCallable } from 'firebase/functions';

const getOverview = httpsCallable(functions, 'pack304_getMonthlyOverview');
const { data } = await getOverview({ year: 2025, month: 1 });

console.log(`GMV: ${data.gmvTokens} tokens (${data.gmvFiatPLN} PLN)`);
console.log(`Avalo Fees: ${data.totalAvaloShareTokens} tokens`);
console.log(`Creator Share: ${data.totalCreatorShareTokens} tokens`);
console.log(`Payouts: ${data.totalPayoutTokens} tokens`);
console.log(`Outstanding Liability: ${data.outstandingCreatorLiabilityTokens} tokens`);
```

### Check User Balance

```typescript
const getUserSummary = httpsCallable(functions, 'pack304_getUserFinancialSummary');
const { data } = await getUserSummary({ userId: 'user123' });

console.log(`Wallet Balance: ${data.walletBalance}`);
console.log(`Expected Balance: ${data.expectedBalance}`);
console.log(`Discrepancy: ${data.balanceDiscrepancy}`);
```

### List Anomalies

```typescript
const listAnomalies = httpsCallable(functions, 'pack304_listAnomalies');
const { data } = await listAnomalies({ 
  status: 'OPEN',
  limit: 20 
});

data.anomalies.forEach(anomaly => {
  console.log(`${anomaly.type} - ${anomaly.severity}: ${anomaly.details}`);
});
```

### Export Data

```typescript
const exportMonthly = httpsCallable(functions, 'pack304_exportMonthlyFinance');
const { data } = await exportMonthly({ 
  year: 2025, 
  month: 1, 
  format: 'csv' 
});

window.open(data.downloadUrl); // Valid for 24 hours
```

---

## Collections

### `platformFinanceMonthly/{year}_{month}`

Monthly platform aggregation:

```typescript
{
  year: 2025,
  month: 1,
  gmvTokens: 1000000,
  gmvFiatPLN: 200000,
  totalCreatorShareTokens: 700000,
  totalAvaloShareTokens: 300000,
  totalTokenPurchasesTokens: 500000,
  totalTokenPurchasesFiatPLN: 150000,
  totalPayoutTokens: 100000,
  outstandingCreatorLiabilityTokens: 600000,
  feesFromChatTokens: 100000,
  feesFromCallsTokens: 80000,
  feesFromCalendarTokens: 70000,
  feesFromEventsTokens: 40000,
  refundsTokens: 5000,
  netRevenueTokens: 295000
}
```

### `financeAnomalies/{anomalyId}`

Detected issues:

```typescript
{
  anomalyId: "uuid",
  type: "MISMATCH_BALANCE",
  userId: "user123",
  severity: "HIGH",
  status: "OPEN",
  details: "Balance discrepancy: 5 tokens",
  createdAt: "2025-01-05T03:00:00Z"
}
```

---

## Anomaly Types

| Type | Description | Severity |
|------|-------------|----------|
| NEGATIVE_BALANCE | Wallet balance < 0 | CRITICAL |
| MISMATCH_BALANCE | Wallet ≠ expected | MEDIUM-HIGH |
| INVALID_SPLIT | Wrong revenue split | MEDIUM |
| PAYOUT_GREATER_THAN_EARNINGS | Withdrawals > earnings | HIGH |
| REFUND_INCONSISTENT | Refund issues | LOW-MEDIUM |

---

## Deploy

```bash
# 1. Create storage bucket (one-time)
gsutil mb -l europe-west3 gs://avalo-finance-exports

# 2. Deploy everything
firebase deploy --only firestore:rules,firestore:indexes,functions
```

Or use the deployment script:

```bash
chmod +x deploy-pack304.sh
./deploy-pack304.sh
```

---

## Monitoring

```bash
# Check aggregation logs
gcloud logging read "resource.labels.function_name=pack304_cronDailyAggregation" --limit 10

# Count open anomalies
firebase firestore:query financeAnomalies --where "status == 'OPEN'"

# View recent exports
firebase firestore:query auditLogs \
  --where "actionType == 'ADMIN_EXPORT_CREATED'" \
  --limit 10
```

---

## Formulas

### Net Earnings
```
netEarned = (chat + calls + calendar + events + other) - (refunds)
```

### Creator Share
```
creatorShare = floor(
  chat × 0.65 +
  calls × 0.80 +
  calendar × 0.80 +
  events × 0.80 +
  other × 0.65
)
```

### Outstanding Liability
```
liability = lifetimeCreatorShare - lifetimePayouts
```

### Fiat Conversion
```
fiatPLN = tokens × 0.20
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Empty dashboard | Run `pack304_admin_triggerAggregation` |
| Export fails | Check storage bucket exists |
| Balance mismatch | Use `getUserFinancialSummary` to investigate |
| Missing months | Backfill by triggering aggregation per month |

---

## Security

**Users CANNOT:**
- ❌ Access financial console
- ❌ View platform data
- ❌ See other users' balances

**FINANCE Role CAN:**
- ✅ View all financial data
- ✅ Export reports
- ✅ Review anomalies
- ❌ Modify transactions

**SUPERADMIN Role CAN:**
- ✅ All FINANCE permissions
- ✅ Trigger manual jobs
- ✅ Manage admin users

**All access is logged to `auditLogs`**

---

## Critical Rules

### ❌ NEVER:
- Change token prices
- Modify payout rate (0.20 PLN)
- Alter revenue splits (65/35, 80/20)
- Edit walletTransactions
- Approve payouts from here

### ✅ ALWAYS:
- Log admin actions
- Validate roles
- Use read-only queries
- Export via signed URLs (24h max)
- Respect privacy

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
- `PACK_304_IMPLEMENTATION.md` (Full guide)
- `PACK_304_QUICK_REFERENCE.md` (This file)

---

**Version:** 1.0.0  
**Status:** ✅ Production Ready  
**Last Updated:** 2025-12-09