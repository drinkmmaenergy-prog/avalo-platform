# PACK 402 — Global KPI & Monitoring Engine

## 🎯 Overview

**PACK 402** is the **canonical KPI monitoring engine** for the Avalo platform. This pack **REPLACES** the previously mis-numbered "PACK 353" KPI specification. 

**Important:** Treat old PACK 353 as **invalid**. Only PACK 402 is the authoritative KPI engine specification and implementation.

## 📦 What This Pack Does

- **Aggregates platform KPIs** across 5 dimensions: Growth, Engagement, Revenue, Safety, and Support
- **Scheduled snapshots** (hourly and daily) of key metrics
- **Admin dashboard** for viewing KPI trends
- **Time-bounded queries** ensuring efficient reads from existing collections
- **No tokenomics changes**, no new payment flows

## 🔗 Dependencies (Read-Only)

This pack depends on data from:

| Pack | Category | What We Read |
|------|----------|-------------|
| **PACK 255 / 277** | Wallet & Revenue | Token purchases, spending, payouts |
| **PACK 267-268 / 296 / 302 / 401** | Safety & Risk | Abuse reports, fraud profiles, account actions |
| **PACK 301 / 301A / 301B / 400** | Retention | Retention profiles, onboarding stages |
| **PACK 300 / 300A / 300B** | Support | Support tickets, response times |
| **PACK 293** | Notifications | (Future: notification engagement) |
| **PACK 280** | Membership | User verification, membership status |
| **PACK 351** | Technical Launch | Overall platform health |

All dependencies are **read-only**. PACK 402 does not modify any upstream data.

---

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    RAW EVENT DATA                           │
│  users • swipes • matches • calls • transactions            │
│  events • tickets • reports • fraud profiles                │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│              AGGREGATION FUNCTIONS                          │
│  ┌─────────────┐  ┌─────────────┐                          │
│  │ pack402_    │  │ pack402_    │                          │
│  │ build       │  │ build       │                          │
│  │ HourlyKpis  │  │ DailyKpis   │                          │
│  └──────┬──────┘  └──────┬──────┘                          │
│         │                │                                  │
│    (Every hour)     (Daily 02:00)                          │
└─────────┼────────────────┼─────────────────────────────────┘
          │                │
          ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│              KPI SNAPSHOT COLLECTIONS                       │
│                                                             │
│  • kpiGrowth         • kpiEngagement                        │
│  • kpiRevenue        • kpiSafety                            │
│  • kpiSupport                                               │
│                                                             │
│  Doc IDs:  day_YYYY-MM-DD  |  hour_YYYY-MM-DD_HH          │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│          ADMIN API & DASHBOARD                              │
│  ┌──────────────────┐   ┌──────────────────┐               │
│  │ pack402_getKpis  │   │ Admin Web UI     │               │
│  │ (Callable)       │◄──┤ /kpi/index.tsx   │               │
│  └──────────────────┘   └──────────────────┘               │
│                                                             │
│  • Date range queries (7d, 30d)                            │
│  • Tabbed views (Growth, Engagement, etc.)                 │
│  • Summary cards + line/bar charts                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 File Structure

```
functions/src/
├── pack402-kpi-types.ts          # TypeScript type definitions
├── pack402-kpi-service.ts        # Aggregation logic
└── pack402-kpi-functions.ts      # Cloud Functions (scheduled + callable)

admin-web/kpi/
└── index.tsx                     # Admin dashboard UI

firestore-pack402-kpi.rules       # Security rules (admin-only reads)
firestore-pack402-kpi.indexes.json # Firestore indexes for range queries

PACK_402_KPI_MONITORING_IMPLEMENTATION.md  # This file
```

---

## 🗂️ Data Model

### KPI Collections

| Collection | Description |
|-----------|-------------|
| `kpiGrowth` | User acquisition, verification, onboarding stages |
| `kpiEngagement` | Swipes, matches, chats, calls, events, AI interactions |
| `kpiRevenue` | Token purchases, spending, creator earnings, payouts |
| `kpiSafety` | Abuse reports, safety tickets, account actions, fraud risk |
| `kpiSupport` | Support tickets, response times, resolution times |

### Document ID Format

- **Daily snapshots:** `day_YYYY-MM-DD` (e.g., `day_2025-12-20`)
- **Hourly snapshots:** `hour_YYYY-MM-DD_HH` (e.g., `hour_2025-12-20_14`)

### Key Type Interfaces

```typescript
interface KpiKey {
  date: string;      // YYYY-MM-DD
  hour?: number;     // 0–23 (only for hourly snapshots)
}

interface GrowthKpi {
  key: KpiKey;
  interval: 'day' | 'hour';
  newUsers: number;
  verifiedUsers: number;
  onboardingStageCounts: Record<string, number>;
  retentionSegmentCounts: Record<string, number>;
}

interface EngagementKpi {
  key: KpiKey;
  interval: 'day' | 'hour';
  totalSwipes: number;
  uniqueSwipers: number;
  totalMatches: number;
  paidChatsStarted: number;
  paidChatWordsBilled: number;
  voiceMinutes: number;
  videoMinutes: number;
  calendarBookings: number;
  eventsCreated: number;
  eventTickets: number;
  aiChats: number;
  aiVoiceMinutes: number;
}

interface RevenueKpi {
  key: KpiKey;
  interval: 'day' | 'hour';
  tokenPurchasesCount: number;
  tokenPurchasedTotal: number;
  tokensSpentTotal: number;
  creatorEarningsTokens: number;
  avaloRevenueTokens: number;
  payoutsRequestedTokens: number;
  payoutsApprovedTokens: number;
  payingUsersCount: number;
}

interface SafetyKpi {
  key: KpiKey;
  interval: 'day' | 'hour';
  abuseReports: number;
  safetyTickets: number;
  criticalSafetyTickets: number;
  accountsFrozen: number;
  accountsBanned: number;
  fraudRiskDistribution: Record<string, number>;  // NORMAL/WATCHLIST/HIGH_RISK/CRITICAL
}

interface SupportKpi {
  key: KpiKey;
  interval: 'day' | 'hour';
  ticketsCreated: number;
  ticketsResolved: number;
  avgFirstResponseMinutes: number | null;
  avgResolveMinutes: number | null;
}
```

---

## ⚙️ Cloud Functions

### 1. `pack402_buildHourlyKpis`

**Type:** Scheduled (PubSub)  
**Schedule:** Every hour at minute 5 (`5 * * * *`)  
**Timezone:** UTC

**What it does:**
- Runs every hour
- Aggregates KPIs for the current hour
- Writes 5 snapshot documents (one per KPI type) to Firestore
- Uses time-bounded queries (start/end of hour)

**Example execution:**
```
Time: 2025-12-20 14:05 UTC
Aggregates: 2025-12-20 hour 14 (14:00:00 to 14:59:59)
Writes:
  - kpiGrowth/hour_2025-12-20_14
  - kpiEngagement/hour_2025-12-20_14
  - kpiRevenue/hour_2025-12-20_14
  - kpiSafety/hour_2025-12-20_14
  - kpiSupport/hour_2025-12-20_14
```

### 2. `pack402_buildDailyKpis`

**Type:** Scheduled (PubSub)  
**Schedule:** Daily at 02:00 UTC (`0 2 * * *`)  
**Timezone:** UTC

**What it does:**
- Runs once per day at 02:00 UTC
- Aggregates KPIs for the **previous day** (full 24 hours)
- Writes 5 snapshot documents (one per KPI type)
- Uses time-bounded queries (00:00:00 to 23:59:59 of previous day)

**Example execution:**
```
Time: 2025-12-21 02:00 UTC
Aggregates: 2025-12-20 (full day)
Writes:
  - kpiGrowth/day_2025-12-20
  - kpiEngagement/day_2025-12-20
  - kpiRevenue/day_2025-12-20
  - kpiSafety/day_2025-12-20
  - kpiSupport/day_2025-12-20
```

### 3. `pack402_getKpis`

**Type:** HTTPS Callable  
**Auth:** Required (Admin only)

**Input:**
```typescript
{
  type: 'growth' | 'engagement' | 'revenue' | 'safety' | 'support',
  fromDate: 'YYYY-MM-DD',
  toDate: 'YYYY-MM-DD',
  interval: 'day' | 'hour'
}
```

**Validation:**
- Max 90 days for daily KPIs
- Max 7 days for hourly KPIs
- Admin role required

**Output:**
```typescript
{
  success: true,
  type: 'growth',
  interval: 'day',
  fromDate: '2025-12-13',
  toDate: '2025-12-20',
  count: 8,
  data: [...] // Array of KPI documents
}
```

### 4. `pack402_backfillDailyKpis`

**Type:** HTTPS Callable  
**Auth:** Required (Admin only)  
**Timeout:** 540 seconds (9 minutes)  
**Memory:** 2GB

**Purpose:** Historical data recovery (use sparingly)

**Input:**
```typescript
{
  fromDate: 'YYYY-MM-DD',
  toDate: 'YYYY-MM-DD'
}
```

**Validation:**
- Max 30 days per backfill
- Admin role required

**Output:**
```typescript
{
  success: true,
  message: 'Backfilled daily KPIs from 2025-11-01 to 2025-11-30',
  daysProcessed: 30
}
```

### 5. `pack402_getKpisHttp`

**Type:** HTTPS Request (HTTP endpoint)  
**Auth:** Bearer token in `Authorization` header  
**Method:** GET

**Query Parameters:**
- `type`: KPI type
- `fromDate`: Start date
- `toDate`: End date
- `interval`: 'day' or 'hour'

**Example:**
```bash
curl -X GET \
  "https://us-central1-avalo.cloudfunctions.net/pack402_getKpisHttp?type=growth&fromDate=2025-12-13&toDate=2025-12-20&interval=day" \
  -H "Authorization: Bearer <firebase-id-token>"
```

---

## 🔐 Security & Access Control

### Firestore Rules

**Collections:** `kpiGrowth`, `kpiEngagement`, `kpiRevenue`, `kpiSafety`, `kpiSupport`

**Rules:**
```javascript
// Read: Admin only
allow read: if isAdmin();

// Write: DENY all client writes (Cloud Functions only)
allow write: if false;

function isAdmin() {
  return request.auth != null && 
    exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role 
      in ['admin', 'super_admin', 'moderator'];
}
```

### Access Summary

| User Role | Read KPIs | Write KPIs | Trigger Backfill |
|-----------|-----------|------------|------------------|
| Admin | ✅ | ❌ | ✅ |
| Super Admin | ✅ | ❌ | ✅ |
| Moderator | ✅ | ❌ | ✅ |
| Normal User | ❌ | ❌ | ❌ |
| Anonymous | ❌ | ❌ | ❌ |

**Note:** All writes are performed exclusively by Cloud Functions (scheduled or manual).

---

## 🎨 Admin Dashboard

**Location:** [`admin-web/kpi/index.tsx`](admin-web/kpi/index.tsx)

### Features

1. **Tabbed Navigation**
   - Growth
   - Engagement
   - Revenue
   - Safety
   - Support

2. **Controls**
   - Interval selector: Daily / Hourly
   - Date range: Last 7 Days / Last 30 Days
   - Refresh button

3. **Summary Cards**
   - Quick overview of key metrics
   - Auto-calculated from fetched data

4. **Data Table**
   - Sortable, filterable
   - Shows detailed metrics per day/hour

### Usage

```bash
# Run admin web app
cd admin-web
npm install
npm run dev

# Navigate to:
http://localhost:3000/kpi
```

**Authentication:** Must be logged in as admin role.

---

## 🚀 Deployment

### 1. Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

### 2. Deploy Firestore Indexes

```bash
firebase deploy --only firestore:indexes
```

### 3. Deploy Cloud Functions

```bash
cd functions
npm install
firebase deploy --only functions:pack402_buildHourlyKpis,functions:pack402_buildDailyKpis,functions:pack402_getKpis,functions:pack402_backfillDailyKpis,functions:pack402_getKpisHttp
```

### 4. Deploy Admin UI

```bash
cd admin-web
npm install
npm run build
firebase deploy --only hosting:admin
```

---

## 📊 Aggregation Logic

### Time-Bounded Queries

**Critical principle:** Never scan entire collections without date range.

**Example (New Users):**
```typescript
const newUsersSnap = await db.collection('users')
  .where('createdAt', '>=', startTime)
  .where('createdAt', '<=', endTime)
  .count()
  .get();
```

### Data Sources

| KPI Type | Source Collections |
|----------|-------------------|
| Growth | `users`, `retentionProfiles` |
| Engagement | `swipes`, `matches`, `chatTransactions`, `calls`, `calendarBookings`, `events`, `eventTickets`, `aiChats`, `aiCalls` |
| Revenue | `walletTransactions`, `payouts` |
| Safety | `abuseReports`, `safetyTickets`, `users` (status changes), `fraudProfiles` |
| Support | `supportTickets` |

### Calculation Examples

#### Revenue Split (70/30 Creator/Platform)

```typescript
spendSnap.forEach((doc) => {
  const amount = Math.abs(doc.data().amount || 0);
  const creatorShare = Math.floor(amount * 0.7);
  const avaloShare = amount - creatorShare;
  
  creatorEarningsTokens += creatorShare;
  avaloRevenueTokens += avaloShare;
});
```

#### Average Response Time

```typescript
resolvedSnap.forEach((doc) => {
  const createdAt = doc.data().createdAt?.toDate();
  const firstResponseAt = doc.data().firstResponseAt?.toDate();
  
  if (createdAt && firstResponseAt) {
    const minutes = (firstResponseAt - createdAt) / 60000;
    totalFirstResponseMinutes += minutes;
    firstResponseCount++;
  }
});

const avgFirstResponseMinutes = firstResponseCount > 0
  ? totalFirstResponseMinutes / firstResponseCount
  : null;
```

---

## 🔄 Backfill Process

### When to Backfill

- **Initial setup:** Fill historical data for first-time deployment
- **Data recovery:** Recover missing snapshots after outage
- **Schema migration:** Rebuild snapshots after type definition changes

### How to Backfill

#### Option 1: Via Admin Dashboard (Recommended)

```typescript
// In admin dashboard:
const backfillButton = () => {
  const functions = getFunctions();
  const backfill = httpsCallable(functions, 'pack402_backfillDailyKpis');
  
  await backfill({
    fromDate: '2025-11-01',
    toDate: '2025-11-30'
  });
};
```

#### Option 2: Via Firebase CLI (Admin SDK)

```bash
# Create a script: scripts/backfill-kpis.ts

import { backfillDailyKpis } from '../functions/src/pack402-kpi-service';

async function main() {
  await backfillDailyKpis('2025-11-01', '2025-11-30');
}

main();
```

### Backfill Limits

| Constraint | Limit | Reason |
|------------|-------|--------|
| Max days per call | 30 days | Prevent timeout |
| Timeout | 540 seconds | Cloud Function limit |
| Memory | 2GB | Handle large aggregations |

**Tip:** For larger backfills (>30 days), split into multiple calls:

```typescript
// Backfill 90 days in 3 batches
await backfill({ fromDate: '2025-09-01', toDate: '2025-09-30' });
await backfill({ fromDate: '2025-10-01', toDate: '2025-10-31' });
await backfill({ fromDate: '2025-11-01', toDate: '2025-11-30' });
```

---

## 📈 Monitoring & Alerts

### Function Logs

```bash
# View hourly build logs
firebase functions:log --only pack402_buildHourlyKpis

# View daily build logs
firebase functions:log --only pack402_buildDailyKpis
```

### Key Metrics to Monitor

1. **Function Execution Time**
   - Target: < 60 seconds per KPI type
   - Alert: > 120 seconds

2. **Snapshot Write Success**
   - Target: 100% success rate
   - Alert: Any failures

3. **Data Freshness**
   - Target: Hourly snapshots within 10 minutes of hour boundary
   - Target: Daily snapshots completed by 02:15 UTC

4. **Query Costs**
   - Monitor Firestore read counts
   - Optimize indexes if costs spike

---

## 🧪 Testing

### Unit Tests

```bash
cd functions
npm test -- pack402
```

### Integration Tests

```bash
# Test hourly aggregation for current hour
firebase functions:shell
> pack402_buildHourlyKpis()

# Test daily aggregation for yesterday
> pack402_buildDailyKpis()

# Test fetch API
> pack402_getKpis({
    type: 'growth',
    fromDate: '2025-12-13',
    toDate: '2025-12-20',
    interval: 'day'
  })
```

### Manual Testing

1. **Verify scheduled functions:**
   ```bash
   # Check Cloud Scheduler
   gcloud scheduler jobs list --project=avalo
   ```

2. **Verify snapshots exist:**
   ```bash
   # Check Firestore console
   # Navigate to kpiGrowth collection
   # Verify documents exist with correct doc IDs
   ```

3. **Test admin dashboard:**
   ```bash
   cd admin-web
   npm run dev
   # Login as admin
   # Navigate to /kpi
   # Select different tabs, intervals, ranges
   # Verify data loads correctly
   ```

---

## 📝 Migration from PACK 353

**PACK 353 is deprecated. PACK 402 is the canonical replacement.**

### If You Previously Implemented PACK 353

1. **Remove PACK 353 files:**
   ```bash
   rm functions/src/pack353-*
   rm firestore-pack353-*
   rm admin-web/pack353-*
   ```

2. **Remove old collections** (if safe):
   ```bash
   # Only if you're sure no production data relies on these:
   # - kpi353Growth
   # - kpi353Engagement
   # - etc.
   ```

3. **Deploy PACK 402:**
   ```bash
   # Follow deployment steps above
   firebase deploy --only functions,firestore
   ```

4. **Backfill historical data:**
   ```bash
   # Use pack402_backfillDailyKpis to restore history
   ```

5. **Update admin dashboard:**
   ```bash
   # Update import paths from pack353 → pack402
   # Deploy admin UI
   ```

---

## ❓ FAQ

### Q: Why replace PACK 353?
**A:** PACK 353 was mis-numbered and created confusion. PACK 402 is the correct, canonical specification.

### Q: Do I need to migrate existing data?
**A:** Only if you deployed PACK 353 in production. Use the backfill function to rebuild snapshots under PACK 402 collections.

### Q: Can I query KPIs from client apps?
**A:** No. KPI reads are **admin-only**. Client apps should not have access to aggregated platform metrics.

### Q: How do I add a new KPI metric?
**A:** 
1. Update type definitions in `pack402-kpi-types.ts`
2. Update aggregation logic in `pack402-kpi-service.ts`
3. Update admin UI in `admin-web/kpi/index.tsx`
4. Re-deploy functions and UI
5. Backfill historical snapshots if needed

### Q: What if a scheduled function fails?
**A:** 
- Check logs: `firebase functions:log --only pack402_buildHourlyKpis`
- Identify the cause (timeout, permission, data issue)
- Fix the issue
- Manually run the function or wait for next scheduled execution
- Backfill missing snapshots if necessary

### Q: Can I fetch KPIs via REST API?
**A:** Yes. Use `pack402_getKpisHttp` endpoint with Bearer token authentication.

### Q: How do I optimize query costs?
**A:** 
- Ensure Firestore indexes are deployed
- Use `.count()` for simple counts instead of `.get()` when possible
- Monitor slow queries in Firestore console
- Add composite indexes for multi-field queries

---

## 🎉 Summary

**PACK 402** provides a robust, scalable KPI monitoring engine for Avalo:

- ✅ **5 KPI dimensions** (Growth, Engagement, Revenue, Safety, Support)
- ✅ **Automated snapshots** (hourly + daily)
- ✅ **Admin dashboard** for visualization
- ✅ **Time-bounded queries** for efficiency
- ✅ **Security-first** design (admin-only access)
- ✅ **Backfill support** for historical data
- ✅ **No tokenomics changes** or payment flow impacts

This is the **canonical KPI engine** for Avalo. Treat PACK 353 as invalid.

---

## 📞 Support

For questions or issues:
- Check logs: `firebase functions:log`
- Review documentation: This file
- Test in emulator: `firebase emulators:start`

**Remember:** PACK 402 is read-only. It aggregates existing data but never modifies upstream collections.
