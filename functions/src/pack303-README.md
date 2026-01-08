# PACK 303 — Creator Earnings Dashboard & Monthly Statements

## Overview

PACK 303 provides complete transparency for creator earnings in Avalo through:

- **Unified earnings dashboard** (mobile + web)
- **Breakdown per source** (chat, calls, calendar, events, etc.)  
- **Monthly statements** (exportable as PDF/CSV)
- **Full alignment** with existing 65/35, 80/20, 0.20 PLN/token rules
- **NO changes** to tokenomics, prices, or refund logic

## Dependencies

- **PACK 277** (Wallet & Transactions) - Source of truth for all token flows
- **PACK 288** (Token Store) - Token purchase tracking
- **PACK 289** (Payouts) - Payout request and processing
- **PACK 295** (Localization & currencies) - Currency formatting
- **PACK 299** (Analytics Engine & Creator Metrics) - Analytics aggregation patterns
- **PACK 302** (Unified checkout & subscriptions) - Billing integration

## Architecture

### Data Flow

```
walletTransactions (PACK 277)
         ↓
  Aggregation Cron Job (daily at 2 AM UTC)
         ↓
creatorEarningsMonthly/{userId}_{year}_{month}
         ↓
  Dashboard & Statement APIs
         ↓
  Mobile/Web UI + PDF/CSV Export
```

### Collections

#### `creatorEarningsMonthly/{docId}`

Monthly aggregated earnings per user.

**Document ID Format:** `${userId}_${year}_${month}` (e.g., `user123_2025_01`)

**Schema:**
```typescript
{
  userId: string;
  year: number;
  month: number; // 1–12

  // Tokens earned by source (before refunds)
  tokensEarnedChat: number;
  tokensEarnedCalls: number;
  tokensEarnedCalendar: number;
  tokensEarnedEvents: number;
  tokensEarnedOther: number;

  // Tokens refunded (returned to payers)
  tokensRefundedChat: number;
  tokensRefundedCalendar: number;
  tokensRefundedEvents: number;

  // Net calculations
  tokensNetEarned: number; // after refunds, before Avalo split
  tokensAvaloShare: number; // Avalo commission
  tokensCreatorShare: number; // Creator's portion

  // Payout tracking
  payoutTokensRequested: number;
  payoutTokensPaid: number;

  // Fiat tracking
  payoutFiatPaid: number; // in payoutCurrency
  payoutCurrency: string; // e.g., "PLN"
  currencyFxRate: number; // FX rate if not PLN

  // Timestamps
  generatedAt: string; // ISO_DATETIME
  updatedAt: string; // ISO_DATETIME
}
```

#### `statementAuditLogs/{logId}`

Audit trail for all statement access and exports.

**Schema:**
```typescript
{
  logId: string;
  actorType: 'USER' | 'ADMIN' | 'SYSTEM';
  actorId: string;
  action: 'STATEMENT_VIEWED' | 'STATEMENT_EXPORTED_PDF' | 'STATEMENT_EXPORTED_CSV' | 'AGGREGATION_RUN';
  userId: string; // User whose statement was accessed
  year: number;
  month: number;
  format?: 'pdf' | 'csv';
  timestamp: Timestamp;
  metadata?: Record<string, any>;
}
```

## Cloud Functions

### User Functions

| Function | Type | Description |
|----------|------|-------------|
| `pack303_getEarningsDashboard` | Callable | Get earnings dashboard (summary + breakdown + timeline) |
| `pack303_getMonthlyStatement` | Callable | Get full statement for specific month |
| `pack303_exportStatement` | Callable | Export statement as PDF or CSV |
| `pack303_checkEarningsCapability` | Callable | Check if user has any earnings |

### Admin Functions

| Function | Type | Description |
|----------|------|-------------|
| `pack303_admin_triggerAggregation` | Callable | Manually trigger aggregation for user/month |
| `pack303_admin_backfillAggregation` | Callable | Process multiple months for a user |
| `pack303_admin_viewUserEarnings` | Callable | View any user's earnings (audited) |

### Scheduled Functions

| Function | Schedule | Description |
|----------|----------|-------------|
| `pack303_cronDailyAggregation` | Daily 2 AM UTC | Aggregate earnings for all active creators |

### HTTP Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `pack303_httpTriggerAggregation` | GET | Manual aggregation trigger (requires admin auth) |

## Usage Examples

### Get Earnings Dashboard (Mobile/Web)

```typescript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const getDashboard = httpsCallable(functions, 'pack303_getEarningsDashboard');

// Get current month earnings
const response = await getDashboard({});

// Result structure:
{
  success: true,
  summary: {
    currentMonthTokens: 5000,
    availableForPayout: 12000,
    totalPayoutsLifetime: 2400, // in PLN
    currency: 'PLN'
  },
  breakdown: {
    year: 2025,
    month: 1,
    bySource: [
      {
        source: 'CHAT',
        tokensEarned: 3000,
        tokensRefunded: 200,
        tokensCreatorShare: 1950
      },
      // ... other sources
    ],
    totalNetTokens: 5000,
    totalCreatorShare: 4100
  },
  timeline: [
    { date: '2025-01-01', tokensNetEarned: 100 },
    { date: '2025-01-02', tokensNetEarned: 250 },
    // ... daily data points
  ]
}
```

### Get Monthly Statement

```typescript
const getStatement = httpsCallable(functions, 'pack303_getMonthlyStatement');

const response = await getStatement({
  year: 2025,
  month: 1
});

// Returns full statement with transaction list
```

### Export Statement as PDF

```typescript
const exportStatement = httpsCallable(functions, 'pack303_exportStatement');

const response = await exportStatement({
  year: 2025,
  month: 1,
  format: 'pdf' // or 'csv'
});

// Result:
{
  success: true,
  downloadUrl: 'https://storage.googleapis.com/...',
  expiresAt: '2025-01-10T12:00:00.000Z'
}

// Download the file before it expires
window.open(response.data.downloadUrl);
```

## Revenue Splits (Read-Only)

PACK 303 **does not modify** these splits - only reports them:

| Source | Creator Share | Avalo Share |
|--------|---------------|-------------|
| Chat | 65% | 35% |
| Calls (Voice/Video) | 80% | 20% |
| Calendar Bookings | 80% | 20% |
| Events | 80% | 20% |
| Other (Media, etc.) | 65% | 35% |

## Payout Rate (Fixed)

**1 token = 0.20 PLN** (immutable)

FX conversion to local currency follows PACK 289 logic.

## Aggregation Logic

### How It Works

1. **Cron job runs daily at 2 AM UTC**
2. **For each active creator:**
   - Scans `walletTransactions` for the current month
   - Categorizes transactions by source (CHAT, CALLS, CALENDAR, EVENTS, OTHER)
   - Calculates earnings and refunds
   - Applies revenue splits to compute creator vs Avalo shares
   - Queries `withdrawalRequests` for payout data
   - Writes aggregated data to `creatorEarningsMonthly/{docId}`

3. **Idempotent:** Re-running yields identical results

### What Gets Aggregated

**Earning Transactions (IN direction):**
- `CHAT_SPEND` → tokensEarnedChat
- `CALL_SPEND` → tokensEarnedCalls
- `CALENDAR_BOOKING` → tokensEarnedCalendar
- `EVENT_TICKET` → tokensEarnedEvents

**Refund Transactions:**
- `CALENDAR_REFUND` → tokensRefundedCalendar
- `EVENT_REFUND` → tokensRefundedEvents
- Chat refunds → tokensRefundedChat

**Payout Data:**
- From `withdrawalRequests` where status = PAID
- Tracks `payoutTokensPaid` and `payoutFiatPaid`

## Security & Privacy

### Access Control

✅ **Users can:**
- View their own earnings dashboard
- Export their own statements
- Check their own earnings capability

❌ **Users cannot:**
- View other creators' earnings
- See counterpart identities in transaction details (only `relatedId`)

✅ **FINANCE_ADMIN can:**
- View any user's earnings (with audit log)
- Trigger manual aggregations
- Backfill historical data

❌ **FINANCE_ADMIN cannot:**
- Export statements "as if" they are the user (security boundary)

### Audit Logging

**Every action is logged:**
- STATEMENT_VIEWED
- STATEMENT_EXPORTED_PDF
- STATEMENT_EXPORTED_CSV
- AGGREGATION_RUN

**Log includes:**
- actorType (USER/ADMIN/SYSTEM)
- actorId
- userId (whose data was accessed)
- year, month
- timestamp

## Statement Exports

### CSV Format

```csv
Avalo Creator Earnings Statement
Period: 2025-01
Currency: PLN
Token Payout Rate: 0.2 PLN

Summary
Metric,Value
Net Tokens Earned,5000
Creator Share (Tokens),4100
Avalo Share (Tokens),900
Payout Tokens Paid,2000
Payout Fiat Paid,400.00

Earnings by Source
Source,Tokens Earned,Tokens Refunded,Creator Share
CHAT,3000,200,1950
CALLS,1500,0,1200
...

Transactions
Date,Type,Direction,Amount (Tokens),Related ID,Note
2025-01-01T10:00:00Z,CHAT_SPEND,IN,100,chatId123,
...
```

### PDF Format

- **Header:** Avalo branding + creator name + period
- **Summary section:** Net earned, creator share, Avalo share, payouts
- **By source table:** Breakdown of earnings per source
- **Transactions table:** First 50 transactions (note if more exist)
- **Disclaimer:** "Not tax advice - consult qualified professional"
- **Footer:** Generation timestamp + Avalo copyright

**Note:** Current implementation generates HTML. For production PDF, integrate Puppeteer:

```typescript
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.setContent(htmlContent);
const pdfBuffer = await page.pdf({ format: 'A4' });
await browser.close();
```

## Mobile Integration

### Entry Point

In [`app-mobile/app/profile/`](../../app-mobile/app/profile/):
- Add "Earnings & Wallet" button in settings for creators
- Link to [`earnings-dashboard.tsx`](../../app-mobile/app/profile/earnings-dashboard.tsx)

```tsx
// Profile screen
{hasEarningsCapability && (
  <TouchableOpacity 
    onPress={() => router.push('/profile/earnings-dashboard')}
  >
    <Text>Earnings & Wallet</Text>
  </TouchableOpacity>
)}
```

### Dashboard Components

**Summary Cards:**
- This Month (estimated tokens)
- Available for Payout
- Total Payouts Lifetime

**Breakdown Section:**
- Bar chart or list by source
- Shows earned, refunded, your share

**Timeline Section:**
- Daily earnings for current month
- Simple bar chart or list view

**Actions:**
- Request Payout button
- View Monthly Statements button
- Export Statement (PDF/CSV)

## Web Integration

### Dashboard Route

```
/dashboard/earnings
```

**For creators only** - check `hasEarningsCapability` before showing link.

### Components Structure

```typescript
// EarningsDashboard.tsx
import { getEarningsDashboard } from '@/lib/api/earnings';

export default function EarningsDashboard() {
  const { summary, breakdown, timeline } = useEarningsDashboard();
  
  return (
    <div>
      <SummaryCards summary={summary} />
      <SourceBreakdown breakdown={breakdown} />
      <EarningsTimeline timeline={timeline} />
      <PayoutSection />
    </div>
  );
}
```

## Localization

### Required Translations

**Polish (pl.json):**
```json
{
  "earnings": {
    "title": "Zarobki",
    "thisMonth": "Ten miesiąc",
    "available": "Dostępne",
    "totalPayouts": "Całkowite wypłaty",
    "bySource": "Według źródła",
    "chat": "Chat",
    "calls": "Rozmowy",
    "calendar": "Kalendarz",
    "events": "Wydarzenia",
    "earned": "Zarobione",
    "refunded": "Zwrócone",
    "yourShare": "Twój udział",
    "exportPDF": "Eksportuj PDF",
    "exportCSV": "Eksportuj CSV",
    "requestPayout": "Zlecić wypłatę"
  }
}
```

**English (en.json):**
```json
{
  "earnings": {
    "title": "Earnings",
    "thisMonth": "This Month",
    "available": "Available",
    "totalPayouts": "Total Payouts",
    "bySource": "By Source",
    "chat": "Chat",
    "calls": "Calls",
    "calendar": "Calendar",
    "events": "Events",
    "earned": "Earned",
    "refunded": "Refunded",
    "yourShare": "Your Share",
    "exportPDF": "Export PDF",
    "exportCSV": "Export CSV",
    "requestPayout": "Request Payout"
  }
}
```

## Deployment

### 1. Deploy Firestore Rules & Indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Specifically:
- `firestore-pack303-creator-earnings.rules`
- `firestore-pack303-creator-earnings.indexes.json`

### 2. Deploy Cloud Functions

```bash
firebase deploy --only functions:pack303_getEarningsDashboard,functions:pack303_getMonthlyStatement,functions:pack303_exportStatement,functions:pack303_checkEarningsCapability,functions:pack303_cronDailyAggregation
```

Or use the deployment script:

```bash
./deploy-pack303.sh
```

### 3. Verify Deployment

```bash
# Check function URLs
firebase functions:list | grep pack303

# Test endpoint
curl -X GET "https://europe-west3-[PROJECT-ID].cloudfunctions.net/pack303_httpTriggerAggregation?year=2025&month=1" \
  -H "Authorization: Bearer [ADMIN_TOKEN]"
```

### 4. Backfill Historical Data

For existing creators with earnings before PACK 303:

```typescript
const functions = getFunctions();
const backfill = httpsCallable(functions, 'pack303_admin_backfillAggregation');

// Backfill 2024 data
await backfill({
  userId: 'creatorId',
  startYear: 2024,
  startMonth: 1,
  endYear: 2024,
  endMonth: 12
});
```

## Testing Checklist

Before production:

- [ ] Aggregation runs without errors
- [ ] Dashboard loads for creators with earnings
- [ ] Dashboard shows zero data for users without earnings
- [ ] Source breakdown matches wallet transactions
- [ ] Timeline shows correct daily data
- [ ] CSV export downloads successfully
- [ ] PDF/HTML export renders correctly
- [ ] Export URLs expire after 24 hours
- [ ] Audit logs created for all exports
- [ ] Admin can view any user's earnings (with audit)
- [ ] Non-admin cannot access other users' data
- [ ] Localization works in both PL and EN
- [ ] Mobile UI displays correctly on iOS and Android
- [ ] Revenue splits match wallet service (65/35, 80/20)
- [ ] Payout rate shows correct 0.20 PLN
- [ ] No changes to tokenomics or prices

## Monitoring

### Key Metrics

```typescript
// Active creators with monthly earnings
db.collection('creatorEarningsMonthly')
  .where('year', '==', 2025)
  .where('month', '==', 1)
  .where('tokensCreatorShare', '>', 0)
  .get()
  .then(snap => console.log(`${snap.size} creators earned this month`));

// Total creator earnings this month
const monthlyDocs = await db.collection('creatorEarningsMonthly')
  .where('year', '==', 2025)
  .where('month', '==', 1)
  .get();

const totalCreatorShare = monthlyDocs.docs
  .reduce((sum, doc) => sum + doc.data().tokensCreatorShare, 0);

console.log(`Total creator earnings: ${totalCreatorShare} tokens = ${totalCreatorShare * 0.20} PLN`);

// Statement exports
db.collection('statementAuditLogs')
  .where('action', 'in', ['STATEMENT_EXPORTED_PDF', 'STATEMENT_EXPORTED_CSV'])
  .where('timestamp', '>=', startOfDay)
  .get()
  .then(snap => console.log(`${snap.size} statements exported today`));
```

### Logs to Monitor

```bash
# Aggregation job
gcloud logging read "resource.type=cloud_function AND resource.labels.function_name=pack303_cronDailyAggregation" --limit 50

# Export operations
gcloud logging read "resource.type=cloud_function AND resource.labels.function_name=pack303_exportStatement" --limit 50

# Errors
gcloud logging read "resource.type=cloud_function AND severity>=ERROR AND resource.labels.function_name:pack303" --limit 50
```

## Troubleshooting

### Problem: Aggregation not running

**Check:**
1. Cron job is deployed: `firebase functions:list | grep pack303_cron`
2. Function logs: Look for "Starting daily earnings aggregation"
3. Permissions: Function has Firestore write access

**Fix:**
```bash
# Manually trigger aggregation
curl -X GET "https://europe-west3-[PROJECT-ID].cloudfunctions.net/pack303_httpTriggerAggregation" \
  -H "Authorization: Bearer [ADMIN_TOKEN]"
```

### Problem: Dashboard shows zero earnings

**Check:**
1. User actually has earnings: Query `walletTransactions` for EARN transactions
2. Aggregation ran for current month: Check `creatorEarningsMonthly` doc exists
3. Transactions categorized correctly: Verify transaction types match expected values

**Fix:**
```typescript
// Trigger manual aggregation
const triggerAgg = httpsCallable(functions, 'pack303_admin_triggerAggregation');
await triggerAgg({ userId, year: 2025, month: 1 });
```

### Problem: Export fails

**Check:**
1. Cloud Storage bucket exists: `avalo-statements`
2. Function has Storage write permissions
3. Statement data exists for requested month

**Fix:**
```bash
# Create bucket if missing
gsutil mb gs://avalo-statements

# Grant function permission
gcloud projects add-iam-policy-binding [PROJECT-ID] \
  --member="serviceAccount:[PROJECT-ID]@appspot.gserviceaccount.com" \
  --role="roles/storage.objectCreator"
```

### Problem: Earnings don't match wallet transactions

**Investigate:**
1. Check transaction types and sources
2. Verify revenue split calculations
3. Look for refunds that weren't accounted
4. Re-run aggregation to recalculate

## Business Rules (IMMUTABLE)

### ❌ PACK 303 MUST NOT:

1. **Change token packages or prices** (defined in PACK 302)
2. **Change payout rate** (0.20 PLN per token is fixed)
3. **Change revenue splits:**
   - 65/35 for chat and other standard interactions
   - 80/20 for calendar and events
4. **Alter pricing** for chat/call/calendar/event features
5. **Introduce bonuses, promotions, discounts, or cashback**

### ✅ PACK 303 MUST:

1. **Read-only reporting** on existing economic logic
2. **Source of truth:** `walletTransactions` collection
3. **Transparent calculations** - show exactly what creators earned
4. **Privacy-safe** - no counterpart identities in exports
5. **Audit logged** - every access is tracked

## Performance Considerations

### Optimization Strategies

1. **Batch processing:** Process 50-100 creators per aggregation run
2. **Incremental updates:** Only aggregate for creators with recent activity
3. **Caching:** Consider caching current month dashboard in memory
4. **Lazy loading:** Generate statements on-demand, not pre-computed
5. **Pagination:** Limit transaction list to 500 most recent

### Scalability

- **Target:** 10,000+ creators per month
- **Aggregation time:** ~5-10 min for 100 creators
- **Statement generation:** <3 seconds per export
- **Storage:** ~1 KB per monthly doc, ~50 KB per PDF

## Future Enhancements

Potential improvements (NOT in PACK 303):

- [ ] Real-time PDF generation with Puppeteer
- [ ] Tax withholding preview in statements
- [ ] Multi-year comparison charts
- [ ] Earnings forecasting based on trends
- [ ] Email delivery of monthly statements
- [ ] Downloadable tax forms (1099/W-9 equivalent)
- [ ] Earnings by hour-of-day heatmap
- [ ] Top-paying fans list (anonymized)

## Support & Documentation

- **Implementation Guide:** [PACK_303_IMPLEMENTATION.md](../../PACK_303_IMPLEMENTATION.md)
- **API Reference:** See function exports in [`pack303-creator-earnings.ts`](./pack303-creator-earnings.ts)
- **Type Definitions:** See [`types/pack303-creator-earnings.types.ts`](./types/pack303-creator-earnings.types.ts)

---

**Version:** 1.0.0  
**Last Updated:** 2025-12-09  
**Maintainer:** PACK 303 Implementation Team