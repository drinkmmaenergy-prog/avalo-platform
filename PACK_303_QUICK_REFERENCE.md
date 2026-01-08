# PACK 303 — Quick Reference Guide

## TL;DR

**Creator Earnings Dashboard & Monthly Statements** - Full transparency for creator earnings with dashboards, breakdowns, and exportable statements. Read-only reporting layer, no changes to tokenomics.

---

## Key Endpoints

| Function | Type | Purpose |
|----------|------|---------|
| `pack303_getEarningsDashboard` | Callable | Get dashboard (summary + breakdown + timeline) |
| `pack303_getMonthlyStatement` | Callable | Get full statement with transactions |
| `pack303_exportStatement` | Callable | Export as PDF or CSV (24h URL) |
| `pack303_checkEarningsCapability` | Callable | Check if user has earnings |
| `pack303_cronDailyAggregation` | Scheduled | Daily at 2 AM UTC |

---

## Revenue Splits (Read-Only)

| Source | Creator | Avalo |
|--------|---------|-------|
| Chat | 65% | 35% |
| Calls | 80% | 20% |
| Calendar | 80% | 20% |
| Events | 80% | 20% |
| Other | 65% | 35% |

**Payout Rate:** 1 token = 0.20 PLN (fixed)

---

## Quick Start

### Mobile

```tsx
import { httpsCallable } from 'firebase/functions';

// Check if creator
const check = httpsCallable(functions, 'pack303_checkEarningsCapability');
const { hasEarningsCapability } = (await check({})).data;

// Get dashboard
const getDashboard = httpsCallable(functions, 'pack303_getEarningsDashboard');
const { summary, breakdown, timeline } = (await getDashboard({})).data;

// Export statement
const exportStmt = httpsCallable(functions, 'pack303_exportStatement');
const { downloadUrl } = (await exportStmt({ year: 2025, month: 1, format: 'csv' })).data;
window.open(downloadUrl);
```

### Admin

```typescript
// Trigger aggregation for user
const trigger = httpsCallable(functions, 'pack303_admin_triggerAggregation');
await trigger({ userId: 'user123', year: 2025, month: 1 });

// Backfill multiple months
const backfill = httpsCallable(functions, 'pack303_admin_backfillAggregation');
await backfill({
  userId: 'user123',
  startYear: 2024,
  startMonth: 1,
  endYear: 2024,
  endMonth: 12
});

// View any user's earnings (audited)
const view = httpsCallable(functions, 'pack303_admin_viewUserEarnings');
const data = await view({ userId: 'user123', year: 2025, month: 1 });
```

---

## Deploy

```bash
chmod +x deploy-pack303.sh
./deploy-pack303.sh
```

Or manually:
```bash
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions:pack303_getEarningsDashboard,functions:pack303_getMonthlyStatement,functions:pack303_exportStatement,functions:pack303_cronDailyAggregation
gsutil mb -l europe-west3 gs://avalo-statements
```

---

## Collections

### `creatorEarningsMonthly/{userId}_{year}_{month}`

```typescript
{
  userId: string;
  year: number;
  month: number;
  
  // Earnings by source
  tokensEarnedChat: number;
  tokensEarnedCalls: number;
  tokensEarnedCalendar: number;
  tokensEarnedEvents: number;
  tokensEarnedOther: number;
  
  // Refunds by source
  tokensRefundedChat: number;
  tokensRefundedCalendar: number;
  tokensRefundedEvents: number;
  
  // Calculated
  tokensNetEarned: number;
  tokensCreatorShare: number;
  tokensAvaloShare: number;
  
  // Payouts
  payoutTokensRequested: number;
  payoutTokensPaid: number;
  payoutFiatPaid: number;
  payoutCurrency: string;
  
  generatedAt: string;
  updatedAt: string;
}
```

### `statementAuditLogs/{logId}`

```typescript
{
  logId: string;
  actorType: 'USER' | 'ADMIN' | 'SYSTEM';
  actorId: string;
  action: string;
  userId: string;
  year: number;
  month: number;
  format?: 'pdf' | 'csv';
  timestamp: Timestamp;
}
```

---

## Security

**Users can:**
- ✅ View own earnings
- ✅ Export own statements
- ✅ Check own capability

**Users cannot:**
- ❌ View others' earnings
- ❌ See counterpart identities
- ❌ Modify earnings data

**FINANCE_ADMIN can:**
- ✅ View any earnings (audited)
- ✅ Trigger manual aggregations
- ✅ Backfill historical data

**All access is logged** to `statementAuditLogs`.

---

## Formulas

### Net Earnings
```
tokensNetEarned = (earned_chat + earned_calls + earned_calendar + earned_events + earned_other) - (refunded_chat + refunded_calendar + refunded_events)
```

### Creator Share
```
tokensCreatorShare = floor(
  earned_chat × 0.65 +
  earned_calls × 0.80 +
  earned_calendar × 0.80 +
  earned_events × 0.80 +
  earned_other × 0.65
)
```

### Avalo Share
```
tokensAvaloShare = tokensNetEarned - tokensCreatorShare
```

### Fiat Value
```
payoutFiatPaid = payoutTokensPaid × 0.20 PLN × currencyFxRate
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Dashboard empty | Check `walletTransactions` → trigger manual aggregation |
| Export fails | Verify storage bucket exists → check function logs |
| Wrong amounts | Re-run aggregation → verify transaction types |
| Slow dashboard | Increase cache TTL → optimize queries |
| Missing months | Run backfill aggregation |

---

## Monitoring

```bash
# Check aggregation status
gcloud logging read "resource.labels.function_name=pack303_cronDailyAggregation" --limit 10

# Check export usage
firebase firestore:query statementAuditLogs \
  --where "action IN ['STATEMENT_EXPORTED_PDF','STATEMENT_EXPORTED_CSV']" \
  --where "timestamp >=` date -u +%Y-%m-%dT00:00:00Z`" \
  --limit 100

# List top earners
firebase firestore:query creatorEarningsMonthly \
  --where "year == 2025" \
  --where "month == 1" \
  --orderBy "tokensCreatorShare DESC" \
  --limit 10
```

---

## Critical Rules

### ❌ NEVER:
- Change token prices
- Change payout rate (0.20 PLN)
- Change revenue splits (65/35, 80/20)
- Add bonuses or promotions
- Modify walletTransactions

### ✅ ALWAYS:
- Read from walletTransactions as source of truth
- Log all admin access
- Validate year/month before processing
- Maintain idempotency
- Respect user privacy

---

## Files

**Backend:**
- [`types/pack303-creator-earnings.types.ts`](./functions/src/types/pack303-creator-earnings.types.ts)
- [`pack303-aggregation.ts`](./functions/src/pack303-aggregation.ts)
- [`pack303-earnings-service.ts`](./functions/src/pack303-earnings-service.ts)
- [`pack303-statement-export.ts`](./functions/src/pack303-statement-export.ts)
- [`pack303-endpoints.ts`](./functions/src/pack303-endpoints.ts)
- [`pack303-creator-earnings.ts`](./functions/src/pack303-creator-earnings.ts)

**Frontend:**
- [`earnings-dashboard.tsx`](./app-mobile/app/profile/earnings-dashboard.tsx)

**Config:**
- [`firestore-pack303-creator-earnings.rules`](./firestore-pack303-creator-earnings.rules)
- [`firestore-pack303-creator-earnings.indexes.json`](./firestore-pack303-creator-earnings.indexes.json)
- [`deploy-pack303.sh`](./deploy-pack303.sh)

**Docs:**
- [`PACK_303_IMPLEMENTATION.md`](./PACK_303_IMPLEMENTATION.md) (Full guide)
- [`pack303-README.md`](./functions/src/pack303-README.md) (Technical reference)
- [`PACK_303_QUICK_REFERENCE.md`](./PACK_303_QUICK_REFERENCE.md) (This file)

---

**Version:** 1.0.0  
**Status:** ✅ Production Ready  
**Last Updated:** 2025-12-09