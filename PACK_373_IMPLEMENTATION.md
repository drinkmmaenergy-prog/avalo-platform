# PACK 373 — PUBLIC LAUNCH MARKETING AUTOMATION

**Stage:** D — Public Launch & Market Expansion  
**Status:** ✅ DEPLOYED  
**Date:** 2025-12-23

---

## 📋 OVERVIEW

PACK 373 delivers a fully automated, performance-controlled marketing engine with:

- **App Store Optimization (ASO)** — Automated A/B testing for store listings
- **Influencer Traffic Tracking** — Install-to-revenue attribution
- **Paid Ads ROI Control** — Auto-pause underperforming campaigns
- **Anti-Fraud Install Validation** — Device duplication and bot detection
- **Regional Budget Governance** — Country-specific spend limits
- **Automated Budget Protection** — Real-time firewall against runaway spend

This pack ensures **profit-first scaling** without traffic abuse.

---

## 🎯 OBJECTIVES ACHIEVED

### ✅ 1. ASO Automation Engine

**Collection:** [`asoControl`](firestore-pack373-marketing.rules)

**Purpose:** Automatically rotate and test App Store/Play Store listing variants

**Features:**
- Weekly automatic ASO A/B testing
- Country-specific optimization
- Conversion rate tracking with lift calculations
- Full attribution to PACK 370 (LTV & ROAS)

**Functions:**
- [`pack373_rotateASOVariants()`](functions/src/pack373-marketing-automation.ts:18) — Weekly rotation (Monday 00:00 UTC)
- [`pack373_trackStoreConversion()`](functions/src/pack373-marketing-automation.ts:69) — Real-time conversion tracking
- [`pack373_finalizeASOExperiments()`](functions/src/pack373-marketing-automation.ts:122) — Weekly finalization (Sunday 23:00 UTC)

**Data Schema:**
```typescript
{
  countryCode: string;           // ISO country code
  titleVariants: string[];       // Multiple title options
  subtitleVariants: string[];    // Multiple subtitle options
  keywordSets: string[][];       // Keyword combinations
  screenshotsVariantSet: string; // Screenshot set ID
  iconVariant: string;           // Icon version
  conversionRate: number;        // Current baseline rate
  lastUpdate: Timestamp;
  lastWinningExperiment?: {
    experimentId: string;
    lift: number;
    date: Timestamp;
  }
}
```

---

### ✅ 2. Influencer & Affiliate Tracking

**Collection:** [`marketingPartners`](firestore-pack373-marketing.rules)

**Purpose:** Track and attribute installs from marketing partners

**Features:**
- Install-to-revenue attribution
- Fraud detection via PACK 302 integration
- Commission calculation and payouts
- Partner performance rankings

**Functions:**
- [`pack373_trackPartnerInstall()`](functions/src/pack373-marketing-automation.ts:176) — Callable function for install tracking
- [`pack373_calculatePartnerCommission()`](functions/src/pack373-marketing-automation.ts:249) — Auto-calculate on revenue

**Partner Types:**
- `influencer` — Social media influencers
- `affiliate` — Performance-based affiliates
- `agency` — Marketing agencies

**Data Schema:**
```typescript
{
  partnerId: string;
  type: 'influencer' | 'affiliate' | 'agency';
  region: string;
  commissionRate: number;        // 0-1 (e.g., 0.15 = 15%)
  trackingCode: string;          // Unique code for attribution
  status: 'active' | 'pending' | 'suspended' | 'terminated';
  totalInstalls: number;
  validatedInstalls: number;
  totalRevenue: number;
  totalCommissionOwed: number;
  lastInstall?: Timestamp;
}
```

**Install Tracking:**
```typescript
// Sub-collection: marketingPartners/{partnerId}/installs/{installId}
{
  userId: string;
  partnerId: string;
  partnerCode: string;
  partnerType: string;
  timestamp: Timestamp;
  deviceInfo: object;
  fraudScore: number;            // 0-1 (higher = more fraudulent)
  validated: boolean;            // fraud score < 0.5
  revenue: number;
  commissionPaid: boolean;
  commissionAmount: number;
}
```

---

### ✅ 3. Paid Traffic ROI Control System

**Collection:** [`adCampaigns`](firestore-pack373-marketing.rules)

**Purpose:** Monitor and auto-control paid advertising campaigns

**Features:**
- Platform support: Meta, TikTok, Google, others
- Real-time ROI monitoring
- Automatic campaign pause rules
- Daily performance tracking

**Auto-Pause Rules:**
- ROAS < 0.8 → pause
- CPI > regional threshold → pause
- Fraud rate > 15% → freeze

**Functions:**
- [`pack373_autoPauseCampaign()`](functions/src/pack373-marketing-automation.ts:305) — Hourly monitoring
- [`pack373_updateCampaignMetrics()`](functions/src/pack373-marketing-automation.ts:401) — Daily at 01:00 UTC

**Data Schema:**
```typescript
{
  name: string;
  platform: 'meta' | 'tiktok' | 'google' | 'others';
  country: string;
  status: 'active' | 'paused' | 'completed';
  dailyBudget: number;
  totalSpend: number;
  totalInstalls: number;
  validatedInstalls: number;
  fraudInstalls: number;
  totalRevenue: number;
  cpi: number;                   // Cost Per Install
  ltv: number;                   // Lifetime Value
  roas: number;                  // Return On Ad Spend
  lastMetricsUpdate?: Timestamp;
  autoPaused?: boolean;
  pauseReason?: string;
}
```

**Performance Tracking:**
```typescript
// Sub-collection: adCampaigns/{campaignId}/performance/{date}
{
  date: string;                  // YYYY-MM-DD
  campaignId: string;
  totalInstalls: number;
  validatedInstalls: number;
  fraudInstalls: number;
  totalRevenue: number;
  totalSpend: number;
  cpi: number;
  ltv: number;
  roas: number;
  timestamp: Timestamp;
}
```

---

### ✅ 4. Anti-Fraud Install Validation

**Collection:** [`installValidation`](firestore-pack373-marketing.rules)

**Purpose:** Validate every install for fraud indicators

**Fraud Checks:**
1. **Device Duplication** — Same device used 3+ times
2. **VPN/Proxy Detection** — IP intelligence checks
3. **Bot Patterns** — Headless browser detection
4. **Click Farms** — Suspicious IP/device patterns

**Fraud Score Calculation:**
```
fraudScore = (deviceDup * 0.3) + (vpnProxy * 0.2) + (botPattern * 0.3) + (clickFarm * 0.2)
Validated = fraudScore < 0.5
```

**Functions:**
- [`pack373_validateInstall()`](functions/src/pack373-marketing-automation.ts:487) — On user creation

**Data Schema:**
```typescript
{
  userId: string;
  campaignId?: string;
  timestamp: Timestamp;
  fraudScore: number;            // 0-1
  validated: boolean;
  checks: {
    deviceDuplication: boolean;
    vpnProxy: boolean;
    botPattern: boolean;
    clickFarm: boolean;
  };
  deviceInfo: object;
  ip: string;
  userAgent: string;
}
```

**Integration:**
- Links to PACK 302 (Fraud Detection)
- Links to PACK 371 (Store Defense)

---

### ✅ 5. Regional Marketing Governance

**Collection:** [`regionalMarketingLimits`](firestore-pack373-marketing.rules)

**Purpose:** Enforce country-specific marketing budgets and limits

**Features:**
- Max monthly budget per country
- Max daily installs per country
- Max influencer payout caps
- Auto-scaling controls

**Functions:**
- [`pack373_checkRegionalLimits()`](functions/src/pack373-marketing-automation.ts:559) — Every 6 hours

**Data Schema:**
```typescript
{
  countryCode: string;
  maxMonthlyBudget: number;      // USD
  maxDailyInstalls: number;
  maxInfluencerPayout: number;   // USD
  maxCPI: number;                // Max cost per install
  autoScalingAllowed: boolean;
}
```

**Budget Tracking:**
```typescript
// Sub-collections for usage tracking
marketingBudgetUsage/{countryCode}/daily/{date}
marketingBudgetUsage/{countryCode}/monthly/{month}

{
  spend: number;
  installs: number;
  revenue: number;
  timestamp: Timestamp;
}
```

**Integration:**
- Controlled by PACK 372 (Global Launch Orchestrator) country states

---

### ✅ 6. Admin Marketing Control Panel

**Location:** [`admin-web/app/marketing/page.tsx`](admin-web/app/marketing/page.tsx)

**Features:**
- Real-time dashboard with key metrics
- Campaign management (pause/resume)
- ROI monitoring by platform
- Active alerts display
- Fraud rate tracking
- Partner performance rankings

**Dashboards:**
1. **Overview Stats:**
   - Total spend
   - Total installs
   - Average CPI
   - Average ROAS
   - Active alerts

2. **Campaign Management:**
   - Platform breakdown
   - Country performance
   - One-click pause/resume
   - Fraud percentage tracking

3. **Alert System:**
   - Critical alerts (auto-pauses)
   - Budget warnings
   - Fraud detection
   - Regional limit breaches

**Access Control:**
- Admin-only access
- Role: `admin` required
- Secured via Firebase Auth

---

### ✅ 7. Automated Budget Protection

**Function:** [`pack373_budgetFirewall()`](functions/src/pack373-marketing-automation.ts:653)

**Schedule:** Every 30 minutes

**Protection Rules:**

1. **Runaway Campaign Detection:**
   - Daily spend > 2x daily budget → emergency pause
   
2. **Bot Traffic Spike:**
   - 10+ installs from same IP in 1 hour → alert
   
3. **Device Farming:**
   - 5+ installs from same device in 1 hour → alert
   
4. **Influencer Payout Abuse:**
   - Partner fraud rate > threshold → suspend

**Auto-Actions:**
- Emergency campaign pause
- Critical alerts via PACK 293
- Fraud investigation triggers
- Regional budget freeze

**Alert Severity Levels:**
- `critical` — Immediate action required
- `high` — Review within 1 hour
- `medium` — Review within 24 hours
- `low` — Informational

---

## 📊 COLLECTIONS & INDEXES

### Firestore Collections

| Collection | Purpose | Access |
|------------|---------|--------|
| [`asoControl`](firestore-pack373-marketing.rules) | ASO variant management | Admin |
| [`asoExperiments`](firestore-pack373-marketing.rules) | A/B test tracking | Functions only |
| [`marketingPartners`](firestore-pack373-marketing.rules) | Partner registry | Admin + Partner |
| `marketingPartners/{id}/installs` | Install tracking | Functions only |
| [`adCampaigns`](firestore-pack373-marketing.rules) | Campaign management | Admin |
| `adCampaigns/{id}/performance` | Daily metrics | Functions only |
| [`installValidation`](firestore-pack373-marketing.rules) | Fraud checks | Functions only |
| [`regionalMarketingLimits`](firestore-pack373-marketing.rules) | Budget limits | Admin |
| `marketingBudgetUsage` | Spending tracking | Functions only |
| [`marketingAlerts`](firestore-pack373-marketing.rules) | Alert system | Functions only |

### Firestore Indexes

**File:** [`firestore-pack373-marketing.indexes.json`](firestore-pack373-marketing.indexes.json)

**Key Indexes:**
- Marketing partners by type, region, status
- Campaign performance by country, ROAS
- Install validation by fraud score
- ASO experiments by conversion lift
- Alerts by severity and creation time

---

## ⚡ CLOUD FUNCTIONS

### Scheduled Functions

| Function | Schedule | Purpose |
|----------|----------|---------|
| [`pack373_rotateASOVariants`](functions/src/pack373-marketing-automation.ts:18) | Weekly (Mon 00:00 UTC) | Start new ASO experiments |
| [`pack373_finalizeASOExperiments`](functions/src/pack373-marketing-automation.ts:122) | Weekly (Sun 23:00 UTC) | Finalize experiment results |
| [`pack373_autoPauseCampaign`](functions/src/pack373-marketing-automation.ts:305) | Every 1 hour | Check campaign performance |
| [`pack373_updateCampaignMetrics`](functions/src/pack373-marketing-automation.ts:401) | Daily (01:00 UTC) | Update all campaign metrics |
| [`pack373_checkRegionalLimits`](functions/src/pack373-marketing-automation.ts:559) | Every 6 hours | Enforce regional budgets |
| [`pack373_budgetFirewall`](functions/src/pack373-marketing-automation.ts:653) | Every 30 minutes | Budget protection |

### Triggered Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| [`pack373_trackStoreConversion`](functions/src/pack373-marketing-automation.ts:69) | User onCreate | Track store conversion |
| [`pack373_calculatePartnerCommission`](functions/src/pack373-marketing-automation.ts:249) | Transaction onCreate | Calculate commission |
| [`pack373_validateInstall`](functions/src/pack373-marketing-automation.ts:487) | User onCreate | Validate for fraud |

### Callable Functions

| Function | Purpose | Parameters |
|----------|---------|------------|
| [`pack373_trackPartnerInstall`](functions/src/pack373-marketing-automation.ts:176) | Record partner install | `partnerCode`, `userId`, `deviceInfo`, `installMetadata` |

---

## 🎯 FEATURE FLAGS

**Location:** Firebase Remote Config

```json
{
  "marketing": {
    "aso": {
      "enabled": true
    },
    "influencers": {
      "enabled": true
    },
    "ads": {
      "enabled": true
    },
    "roi": {
      "firewall": {
        "enabled": true
      }
    }
  }
}
```

**Control:**
- Enable/disable ASO testing
- Enable/disable influencer tracking
- Enable/disable paid ads
- Enable/disable budget firewall

---

## 🌱 SEED DATA

**Default ASO Variants:**
- US market (3 title variants, 3 subtitle variants, 3 keyword sets)
- GB market (3 title variants, 3 subtitle variants, 3 keyword sets)

**Regional Limits:**
- US: $100k monthly, 5k daily installs, $5 max CPI
- GB: $50k monthly, 2k daily installs, $4 max CPI
- CA: $30k monthly, 1k daily installs, $4.5 max CPI

**Sample Partner Template:**
- Type: influencer
- Commission: 15%
- Status: pending
- Region: US

---

## 🔗 DEPENDENCIES

### Required Packs

| Pack | Purpose |
|------|---------|
| **PACK 300 + 300A** | Support & Safety Operations |
| **PACK 301 + 301B** | Retention & Segmentation |
| **PACK 302** | Fraud Detection (install validation) |
| **PACK 371** | Store Defense & Reputation |
| **PACK 372** | Global Launch Orchestrator (regional states) |
| **PACK 293** | Notifications (alerts) |
| **PACK 296** | Audit Logs (campaign actions) |

### Integration Points

1. **PACK 302 Fraud Detection:**
   - Used in install validation
   - Shares fraud scoring logic
   - Syncs device fingerprinting

2. **PACK 371 Store Defense:**
   - ASO experiment coordination
   - Review monitoring integration
   - Rating impact tracking

3. **PACK 372 Global Launch:**
   - Regional budget sync
   - Country launch state checks
   - Market expansion coordination

4. **PACK 293 Notifications:**
   - Critical alert delivery
   - Campaign status changes
   - Budget threshold warnings

5. **PACK 296 Audit Logs:**
   - Campaign modifications logged
   - Partner status changes tracked
   - Budget adjustments recorded

---

## 🚀 DEPLOYMENT

### Prerequisites

```bash
# Firebase CLI installed
npm install -g firebase-tools

# Firebase project configured
firebase login
firebase use <project-id>
```

### Deployment Steps

```bash
# Run deployment script
chmod +x deploy-pack373.sh
./deploy-pack373.sh
```

**Script Actions:**
1. Deploy Firestore rules
2. Deploy Firestore indexes
3. Deploy Cloud Functions (10 functions)
4. Configure feature flags
5. Seed default data
6. Verify deployment

**Deployment Time:** ~10-15 minutes (includes index build time)

---

## 📊 MONITORING & ALERTS

### Key Metrics to Monitor

1. **Campaign Performance:**
   - ROAS by platform
   - CPI trends by country
   - Fraud rate percentage
   - Daily spend vs budget

2. **ASO Performance:**
   - Conversion rate by country
   - Experiment lift percentage
   - Store listing impressions

3. **Partner Performance:**
   - Install validation rate
   - Revenue per partner
   - Commission amounts

4. **Budget Health:**
   - Daily/monthly burn rate
   - Regional limit proximity
   - Auto-pause frequency

### Alert Types

| Type | Severity | Action Required |
|------|----------|-----------------|
| `campaign_auto_paused` | High | Review campaign settings |
| `monthly_budget_limit_reached` | Critical | Adjust budgets or pause |
| `fraud_install_detected` | Medium | Review fraud patterns |
| `runaway_campaign` | Critical | Immediate investigation |
| `bot_traffic_spike` | Critical | Pause related campaigns |
| `device_farming` | Critical | Block device/IP |

---

## 🎓 USAGE GUIDE

### Creating a Campaign

```typescript
// Admin action
await db.collection('adCampaigns').add({
  name: 'Meta US Launch',
  platform: 'meta',
  country: 'US',
  status: 'active',
  dailyBudget: 1000,
  totalSpend: 0,
  totalInstalls: 0,
  validatedInstalls: 0,
  fraudInstalls: 0,
  cpi: 0,
  ltv: 0,
  roas: 0,
  createdAt: serverTimestamp()
});
```

### Adding a Marketing Partner

```typescript
// Admin action
await db.collection('marketingPartners').add({
  partnerId: 'influencer_123',
  type: 'influencer',
  region: 'US',
  commissionRate: 0.15,  // 15%
  trackingCode: 'INF123',
  status: 'active',
  totalInstalls: 0,
  validatedInstalls: 0,
  totalRevenue: 0,
  totalCommissionOwed: 0,
  createdAt: serverTimestamp()
});
```

### Tracking Partner Install (Mobile App)

```typescript
// In app after user signs up with partner code
const trackInstall = httpsCallable(functions, 'pack373_trackPartnerInstall');

await trackInstall({
  partnerCode: 'INF123',
  userId: currentUser.uid,
  deviceInfo: {
    deviceId: await getDeviceId(),
    platform: Platform.OS,
    osVersion: Platform.Version,
    appVersion: Constants.manifest?.version
  },
  installMetadata: {
    ip: await getIPAddress(),
    userAgent: navigator.userAgent,
    referrer: document.referrer
  }
});
```

### Setting Regional Limits

```typescript
// Admin action
await db.collection('regionalMarketingLimits').doc('US').set({
  countryCode: 'US',
  maxMonthlyBudget: 100000,
  maxDailyInstalls: 5000,
  maxInfluencerPayout: 50000,
  maxCPI: 5.0,
  autoScalingAllowed: true
});
```

---

## 🧪 TESTING

### Test Campaign Creation

1. Create test campaign with low daily budget
2. Verify auto-pause at ROAS threshold
3. Check alert generation
4. Confirm metrics calculation

### Test Influencer Tracking

1. Create test partner with tracking code
2. Simulate install with code
3. Verify fraud validation
4. Check commission calculation

### Test Budget Firewall

1. Set low regional limit
2. Simulate rapid installs
3. Verify auto-pause trigger
4. Check alert delivery

---

## 📈 PERFORMANCE METRICS

### Expected Results

**ASO Optimization:**
- 5-15% conversion lift from winning experiments
- Weekly iteration cycle
- Country-specific optimization

**Campaign ROI:**
- ROAS > 1.0 (breakeven)
- Target ROAS: 2.0-3.0x
- CPI optimization by region

**Fraud Prevention:**
- <10% fraud rate target
- Real-time validation
- Automated blocking

**Budget Protection:**
- Zero runaway campaigns
- 100% compliance with regional limits
- 30-minute detection window

---

## 🔒 SECURITY

### Access Control

- All admin functions require `role == 'admin'`
- Partner data isolated by partnerId
- Sensitive metrics functions-only write

### Data Privacy

- Device info encrypted at rest
- IP addresses hashed
- User attribution anonymized after 90 days

### Audit Trail

- All campaign changes logged (PACK 296)
- Partner status changes tracked
- Budget modifications recorded

---

## ⚠️ IMPORTANT NOTES

1. **Index Build Time:** Firestore indexes take 5-15 minutes to build after deployment
2. **ASO Schedule:** Experiments rotate Monday 00:00 UTC, finalize Sunday 23:00 UTC
3. **Budget Firewall:** Runs every 30 minutes for real-time protection
4. **Metrics Update:** Daily at 01:00 UTC for all campaigns
5. **Admin Access:** Marketing dashboard at `/admin/marketing`

---

## 🎯 CTO VERDICT

**PACK 373 transforms Avalo into:**

✅ **Self-Optimizing Growth Machine**
- Automated ASO testing finds winning variants
- Real-time campaign optimization
- Data-driven budget allocation

✅ **ROI-Protected Acquisition System**
- Auto-pause underperforming campaigns
- Regional budget enforcement
- Fraud-resistant install validation

✅ **Globally Scalable Launch Engine**
- Country-specific optimization
- Multi-platform campaign management
- Influencer partnership infrastructure

**Without this pack, paid growth is financially dangerous.**

**With this pack, Avalo can scale profitably and safely.**

---

## 📚 RELATED DOCUMENTATION

- [`firestore-pack373-marketing.rules`](firestore-pack373-marketing.rules) — Security rules
- [`firestore-pack373-marketing.indexes.json`](firestore-pack373-marketing.indexes.json) — Composite indexes
- [`functions/src/pack373-marketing-automation.ts`](functions/src/pack373-marketing-automation.ts) — Cloud Functions
- [`admin-web/app/marketing/page.tsx`](admin-web/app/marketing/page.tsx) — Admin dashboard
- [`deploy-pack373.sh`](deploy-pack373.sh) — Deployment script

---

## 📞 SUPPORT

For issues or questions:

1. Check Firebase Console logs for function errors
2. Review marketing alerts in admin panel
3. Verify Firestore indexes are built
4. Check feature flag configuration
5. Review PACK 302, 371, 372 integration status

---

**PACK 373 — DEPLOYED AND OPERATIONAL** ✅

*Last Updated: 2025-12-23*
