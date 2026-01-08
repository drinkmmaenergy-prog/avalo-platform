# 📦 PACK 386 — Global Marketing Automation, Influencer Engine & Paid Acquisition Control

**Stage**: D — Public Launch & Market Expansion

**Status**: ✅ IMPLEMENTED

---

## 🎯 OBJECTIVE

Create a fully controlled, fraud-safe, ROI-driven global marketing engine that:
- Automates paid traffic across regions
- Manages influencers & creators at scale
- Blocks fake installs, review fraud, and ad abuse
- Synchronizes UA spend with real monetization
- Protects CAC/LTV ratios during hyper-growth

---

## 📋 DEPENDENCIES

This pack integrates with:
- ✅ PACK 277 (Wallet & Token Store)
- ✅ PACK 300 + 300A (Support & Safety)
- ✅ PACK 301 + 301B (Growth & Retention)
- ✅ PACK 302 (Fraud Detection)
- ✅ PACK 384 (App Store Defense & Reviews)
- ✅ PACK 385 (Public Launch Orchestration)

---

## 🏗 ARCHITECTURE OVERVIEW

### Core Components

1. **Campaign Automation Engine** - Manages paid ads across platforms
2. **Influencer Management System** - Tracks creator partnerships
3. **Attribution Tracking** - Multi-touch, fraud-safe attribution
4. **Review Reputation Engine** - Smart review prompting
5. **Marketing Fraud Detection** - Protects ad spend from fraud
6. **Budget Guardian** - Global spending controls

---

## 1️⃣ GLOBAL CAMPAIGN AUTOMATION ENGINE

### Collections

#### `marketingCampaigns`
```typescript
{
  campaignId: string
  platform: 'Meta' | 'TikTok' | 'Google' | 'X'
  geoTargeting: string[]
  dailyBudget: number
  cpiTarget: number
  cpaTarget: number
  launchPhase?: string
  status: 'ACTIVE' | 'PAUSED' | 'THROTTLED' | 'KILLED'
  metrics: {
    spend: number
    installs: number
    conversions: number
    tokenPurchases: number
    actualCPI: number
    actualCPA: number
    roi: number
  }
}
```

### Cloud Functions

#### [`pack386_createCampaign`](functions/src/pack386-campaigns.ts)
- **Trigger**: HTTPS Callable
- **Auth**: Admin only
- **Purpose**: Create new paid ad campaign
- **Validations**:
  - Daily budget limits
  - Platform validation
  - Geo targeting rules

#### [`pack386_updateCampaignBudget`](functions/src/pack386-campaigns.ts)
- **Trigger**: HTTPS Callable
- **Auth**: Admin only
- **Purpose**: Adjust campaign budget/settings

#### [`pack386_autoPauseLowROI`](functions/src/pack386-campaigns.ts)
- **Trigger**: Scheduled (every 1 hour)
- **Purpose**: Auto-pause campaigns with low ROI
- **Rules**:
  - CPI > 1.5x target → THROTTLED
  - ROI < 0.3x → PAUSED
  - Minimum 100 installs to judge

#### [`pack386_scaleHighROI`](functions/src/pack386-campaigns.ts)
- **Trigger**: Scheduled (every 6 hours)
- **Purpose**: Auto-scale high-performing campaigns
- **Rules**:
  - ROI > 2.0x → increase budget by 1.5x
  - Requires 50+ real token purchases
  - Max budget cap: $10k per campaign

---

## 2️⃣ INFLUENCER & CREATOR ACQUISITION ENGINE

### Collections

#### `influencerProfiles`
```typescript
{
  influencerId: string
  name: string
  platform: string[]
  socialHandles: Record<string, string>
  tier: 'NANO' | 'MICRO' | 'MID' | 'MACRO' | 'MEGA'
  status: 'ACTIVE' | 'SUSPENDED' | 'CHURNED'
  payoutModel: 'CPI' | 'REVENUE_SHARE' | 'HYBRID'
  payoutRate: number
  metrics: {
    totalInstalls: number
    verifiedAccounts: number
    tokenPurchases: number
    totalRevenue: number
    churnRate: number
    fraudScore: number
  }
}
```

#### `influencerCampaigns`
```typescript
{
  campaignId: string
  influencerId: string
  name: string
  targetInstalls: number
  bonusThreshold?: number
  metrics: {
    installs: number
    conversions: number
    revenue: number
    pendingPayout: number
    paidOut: number
  }
}
```

### Cloud Functions

#### [`pack386_registerInfluencer`](functions/src/pack386-influencers.ts)
- **Trigger**: HTTPS Callable
- **Auth**: Admin only
- **Purpose**: Register new influencer partnership

#### [`pack386_assignInfluencerCampaign`](functions/src/pack386-influencers.ts)
- **Trigger**: HTTPS Callable
- **Auth**: Admin only
- **Purpose**: Create campaign for influencer

#### [`pack386_setInfluencerPayoutModel`](functions/src/pack386-influencers.ts)
- **Trigger**: HTTPS Callable
- **Auth**: Admin only
- **Purpose**: Configure payout structure
- **Models**:
  - **CPI**: Fixed $ per install
  - **Revenue Share**: % of user spending
  - **Hybrid**: CPI + Revenue Share

#### [`pack386_trackInfluencerAttribution`](functions/src/pack386-influencers.ts)
- **Trigger**: Firestore onCreate (`acquisitionAttribution`)
- **Purpose**: Auto-update influencer metrics on new install

#### [`pack386_calculateInfluencerROI`](functions/src/pack386-influencers.ts)
- **Trigger**: Scheduled (every 24 hours)
- **Purpose**: Calculate and flag low-performing influencers

---

## 3️⃣ ATTRIBUTION & MULTI-TOUCH TRACKING

### Collection

#### `acquisitionAttribution`
```typescript
{
  attributionId: string
  userId: string
  source: 'PAID_ADS' | 'ORGANIC_STORE' | 'INFLUENCER' | 'REFERRAL' | 'WEB_TO_APP'
  platform?: string
  campaignId?: string
  influencerId?: string
  referrerId?: string
  deviceInfo: {
    deviceId: string
    platform: string
    ipAddress: string
    userAgent: string
  }
  fraudChecks: {
    isVPN: boolean
    isEmulator: boolean
    isDuplicateDevice: boolean
    isMassIPReuse: boolean
  }
  fraudScore: number
  blocked: boolean
  blockReason?: string
  hasVerified: boolean
  hasTokenPurchase: boolean
  totalSpent: number
  hasChurned: boolean
}
```

### Cloud Functions

#### [`pack386_validateAttribution`](functions/src/pack386-attribution.ts)
- **Trigger**: HTTPS Callable
- **Auth**: User
- **Purpose**: Create attribution record with fraud checks
- **Fraud Checks**:
  - ✅ VPN detection
  - ✅ Emulator detection
  - ✅ Duplicate device detection
  - ✅ Mass IP reuse detection
- **Auto-blocks**: Fraud score ≥ 0.8

#### [`pack386_updateAttributionOnVerification`](functions/src/pack386-attribution.ts)
- **Trigger**: Firestore onUpdate (`users`)
- **Purpose**: Update attribution when user verifies

#### [`pack386_updateAttributionOnPurchase`](functions/src/pack386-attribution.ts)
- **Trigger**: Firestore onCreate (`tokenTransactions`)
- **Purpose**: Track first purchase for attribution

#### [`pack386_detectChurn`](functions/src/pack386-attribution.ts)
- **Trigger**: Scheduled (every 24 hours)
- **Purpose**: Mark inactive users as churned (30 days)

#### [`pack386_blockAttributionSource`](functions/src/pack386-attribution.ts)
- **Trigger**: HTTPS Callable
- **Auth**: Admin only
- **Purpose**: Manually block fraudulent sources
- **Blocks**: Campaign, Influencer, IP, Device

---

## 4️⃣ REVIEW & STORE REPUTATION BOOST ENGINE

### Collection

#### `reviewPrompts`
```typescript
{
  promptId: string
  userId: string
  trigger: 'SUCCESSFUL_CHAT' | 'FIRST_MEETING' | 'FIRST_PAYOUT' | 'MILESTONE_REACHED'
  triggered: boolean
  shown: boolean
  completed: boolean
  suppressedReason?: string
}
```

### Cloud Functions

#### [`pack386_triggerSmartReviewPrompt`](functions/src/pack386-review-trigger.ts)
- **Trigger**: HTTPS Callable
- **Auth**: User or Admin
- **Purpose**: Request review prompt
- **Eligibility Checks**:
  - ✅ User verified
  - ❌ Unresolved support ticket (PACK 300)
  - ❌ Fraud flag (PACK 302)
  - ❌ Churn risk > 0.7 (PACK 301)
  - ❌ Banned/suspended status
  - ✅ Activity score ≥ 50

#### [`pack386_autoTriggerOnChat`](functions/src/pack386-review-trigger.ts)
- **Trigger**: Firestore onCreate (`chats/{chatId}/messages/{messageId}`)
- **Purpose**: Auto-trigger after 10 messages

#### [`pack386_autoTriggerOnMeeting`](functions/src/pack386-review-trigger.ts)
- **Trigger**: Firestore onCreate (`calls`)
- **Purpose**: Auto-trigger after first video call

#### [`pack386_autoTriggerOnPayout`](functions/src/pack386-review-trigger.ts)
- **Trigger**: Firestore onUpdate (`payoutRequests`)
- **Purpose**: Auto-trigger after first successful payout

---

## 5️⃣ MARKETING-FRAUD FUSION LAYER

### Collection

#### `marketingFraudSignals`
```typescript
{
  signalId: string
  type: 'FAKE_INSTALLS' | 'BURST_REVIEWS' | 'CPI_ANOMALY' | 'INFLUENCER_FARM' | 'REFUND_LOOP'
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  source: string
  sourceId: string
  details: Record<string, any>
  actionTaken?: string
}
```

### Cloud Functions

#### [`pack386_marketingFraudShield`](functions/src/pack386-marketing-fraud.ts)
- **Trigger**: Scheduled (every 1 hour)
- **Purpose**: Detect and block marketing fraud
- **Detection Algorithms**:

##### 1. Fake Installs
- Groups installs by campaign
- Alerts if >30% blocked or high fraud score
- **Action**: Pause campaign

##### 2. Burst Reviews
- Detects >10 reviews in 1 hour from same source
- **Action**: Block source from future reviews

##### 3. CPI Anomalies
- Alerts if actual CPI > 200% of target
- **Action**: Pause campaign if >300%

##### 4. Influencer Farms
- Checks:
  - IP diversity (<50% unique IPs)
  - Average fraud score (>0.6)
  - Block rate (>30%)
  - Zero conversions with 30+ installs
- **Action**: Suspend influencer, block payouts

##### 5. Refund Loops
- Detects users with 3+ refunds in 7 days from ads
- **Action**: Suspend user

#### [`pack386_reviewFraudSignal`](functions/src/pack386-marketing-fraud.ts)
- **Trigger**: HTTPS Callable
- **Auth**: Admin only
- **Purpose**: Manual review and unblock signals

---

## 6️⃣ ROI & LTV CONTROL DASHBOARD

### Admin Web Path
```
admin-web/marketing/
```

### Panels

1. **CAC vs LTV per GEO**
   - Cost per acquisition vs lifetime value
   - Regional profitability analysis

2. **Ad Spend vs Token Purchases**
   - Real-time ROI tracking
   - Conversion funnel

3. **Influencer ROI Ranking**
   - Top performers by revenue
   - Fraud score tracking

4. **Churn by Acquisition Source**
   - Source quality comparison
   - Retention metrics

5. **Fraud Overlays**
   - Real-time fraud alerts
   - Blocked source tracking

### Analytics Functions

#### [`pack386_getCampaignAnalytics`](functions/src/pack386-campaigns.ts)
#### [`pack386_getInfluencerAnalytics`](functions/src/pack386-influencers.ts)
#### [`pack386_getAttributionAnalytics`](functions/src/pack386-attribution.ts)
#### [`pack386_getReviewAnalytics`](functions/src/pack386-review-trigger.ts)
#### [`pack386_getFraudDashboard`](functions/src/pack386-marketing-fraud.ts)

---

## 7️⃣ GLOBAL BUDGET GUARDRAILS

### Collection

#### `marketingBudgets`
```typescript
{
  budgetId: string
  date: string
  geo?: string
  dailyMax: number
  dailySpend: number
  campaigns: Record<string, number>
  status: 'ACTIVE' | 'WARNING' | 'CAPPED' | 'KILLED'
  alerts: string[]
}
```

### Budget Limits

| Geo | Daily Max |
|-----|-----------|
| Global | $50,000 |
| US | $20,000 |
| UK | $10,000 |
| EU | $15,000 |
| Other | $5,000 |

### Cloud Functions

#### [`pack386_checkBudgetLimit`](functions/src/pack386-budget-guardian.ts)
- **Trigger**: HTTPS Callable
- **Purpose**: Check if spend allowed before execution
- **Thresholds**:
  - 80% → Warning
  - 90% → Alert
  - 95% → Auto-pause

#### [`pack386_recordSpend`](functions/src/pack386-budget-guardian.ts)
- **Trigger**: HTTPS Callable
- **Purpose**: Record actual spend after execution

#### [`pack386_monitorBudgets`](functions/src/pack386-budget-guardian.ts)
- **Trigger**: Scheduled (every 15 minutes)
- **Purpose**: Monitor and auto-pause over-budget campaigns

#### [`pack386_budgetKillSwitch`](functions/src/pack386-budget-guardian.ts)
- **Trigger**: HTTPS Callable
- **Auth**: Admin only
- **Purpose**: Emergency stop all campaigns
- **Actions**:
  - Set budgets to KILLED
  - Pause ALL campaigns (global or by geo)
  - Log critical audit event
  - Send alerts

#### [`pack386_resetDailyBudgets`](functions/src/pack386-budget-guardian.ts)
- **Trigger**: Scheduled (midnight UTC)
- **Purpose**: Archive yesterday's budgets and reset for new day

---

## 🗂 SYSTEM FILES

### Cloud Functions
```
functions/src/
├── pack386-campaigns.ts           # Campaign automation
├── pack386-influencers.ts         # Influencer management
├── pack386-attribution.ts         # Attribution tracking
├── pack386-review-trigger.ts      # Review prompts
├── pack386-marketing-fraud.ts     # Fraud detection
└── pack386-budget-guardian.ts     # Budget controls
```

### Firestore Rules
```
firestore-pack386-marketing.rules
```

**Security Model:**
- Admin-only: Campaigns, budgets, fraud signals
- User read-only: Own attribution, review prompts
- Cloud Functions only: Writes to most collections

### Firestore Indexes
```
firestore-pack386-marketing.indexes.json
```

**39 composite indexes** for optimal query performance:
- Campaign status + platform + ROI
- Influencer tier + revenue ranking
- Attribution by source, IP, device
- Fraud signals by type + severity
- Budget tracking by date + geo

---

## 🚀 DEPLOYMENT

### 1. Deploy Firestore Indexes
```bash
firebase deploy --only firestore:indexes
```

### 2. Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
```

### 3. Deploy Cloud Functions
```bash
firebase deploy --only functions:pack386_createCampaign,functions:pack386_updateCampaignBudget,functions:pack386_autoPauseLowROI,functions:pack386_scaleHighROI,functions:pack386_updateCampaignMetrics,functions:pack386_getCampaignAnalytics,functions:pack386_registerInfluencer,functions:pack386_assignInfluencerCampaign,functions:pack386_setInfluencerPayoutModel,functions:pack386_trackInfluencerAttribution,functions:pack386_updateInfluencerConversion,functions:pack386_calculateInfluencerROI,functions:pack386_getInfluencerAnalytics,functions:pack386_validateAttribution,functions:pack386_updateAttributionOnVerification,functions:pack386_updateAttributionOnPurchase,functions:pack386_detectChurn,functions:pack386_blockAttributionSource,functions:pack386_getAttributionAnalytics,functions:pack386_triggerSmartReviewPrompt,functions:pack386_markReviewShown,functions:pack386_markReviewCompleted,functions:pack386_autoTriggerOnChat,functions:pack386_autoTriggerOnMeeting,functions:pack386_autoTriggerOnPayout,functions:pack386_getReviewAnalytics,functions:pack386_marketingFraudShield,functions:pack386_reviewFraudSignal,functions:pack386_getFraudDashboard,functions:pack386_initializeBudgetRules,functions:pack386_checkBudgetLimit,functions:pack386_recordSpend,functions:pack386_monitorBudgets,functions:pack386_budgetKillSwitch,functions:pack386_resetDailyBudgets,functions:pack386_getBudgetDashboard
```

### 4. Initialize Budget Rules
```typescript
const initBudgets = functions.httpsCallable('pack386_initializeBudgetRules');
await initBudgets({});
```

---

## 🎛 USAGE EXAMPLES

### Create Campaign
```typescript
const createCampaign = functions.httpsCallable('pack386_createCampaign');
const result = await createCampaign({
  platform: 'Meta',
  geoTargeting: ['US', 'UK'],
  dailyBudget: 1000,
  cpiTarget: 3.50,
  cpaTarget: 10.00,
  launchPhase: 'soft-launch'
});
```

### Register Influencer
```typescript
const registerInfluencer = functions.httpsCallable('pack386_registerInfluencer');
const result = await registerInfluencer({
  name: 'Jane Doe',
  platform: ['Instagram', 'TikTok'],
  socialHandles: {
    instagram: '@janedoe',
    tiktok: '@janedoe'
  },
  tier: 'MICRO'
});
```

### Validate Attribution
```typescript
const validateAttribution = functions.httpsCallable('pack386_validateAttribution');
const result = await validateAttribution({
  userId: 'user123',
  source: 'INFLUENCER',
  influencerId: 'inf456',
  deviceInfo: {
    deviceId: 'device789',
    platform: 'iOS',
    ipAddress: '1.2.3.4',
    userAgent: 'Mozilla/5.0...'
  }
});
```

### Emergency Kill Switch
```typescript
const killSwitch = functions.httpsCallable('pack386_budgetKillSwitch');
const result = await killSwitch({
  reason: 'Fraud spike detected',
  geo: 'US' // or omit for global
});
```

---

## 📊 MONITORING & ALERTS

### Key Metrics to Track

1. **Campaign Performance**
   - Daily spend vs budget
   - CPI vs target
   - ROI per campaign
   - Conversion rate

2. **Influencer Performance**
   - Install quality (fraud score)
   - Conversion rate
   - Revenue per install
   - Churn rate

3. **Fraud Indicators**
   - Blocked attribution rate
   - Fraud signal count by type
   - IP diversity score
   - Burst activity patterns

4. **Budget Health**
   - Daily burn rate
   - Budget utilization %
   - Campaigns paused due to budget
   - Emergency kills triggered

### Alert Triggers

| Alert Type | Trigger | Action |
|------------|---------|--------|
| Budget Warning | 80% spent | Email notification |
| Budget Critical | 95% spent | Auto-pause campaigns |
| Fraud Detected | High severity signal | Block source + alert |
| Low ROI | ROI < 0.3x | Auto-pause campaign |
| Influencer Farm | Multiple fraud indicators | Suspend + block payout |
| CPI Anomaly | CPI > 2x target | Pause + investigate |

---

## ✅ CTO FINAL VERDICT

PACK 386 ensures:
- ✅ Zero blind ad spend
- ✅ Zero fake influencer growth
- ✅ Zero unsafe review manipulation
- ✅ Full synchronization between marketing → monetization → fraud → retention
- ✅ Scalable acquisition without destroying profit margins

**This pack is mandatory before scaling paid ads beyond test budgets.**

---

## 🔗 INTEGRATION POINTS

### With PACK 277 (Wallet & Token Store)
- Tracks token purchases from attributed users
- Calculates true ROI including monetization

### With PACK 300 (Support & Safety)
- Suppresses review prompts for users with open tickets
- Flags campaigns with high support ticket rates

### With PACK 301 (Growth & Retention)
- Uses churn prediction to prevent review prompts
- Tracks retention by acquisition source

### With PACK 302 (Fraud Detection)
- Inherits fraud scores for attribution
- Blocks payouts to fraudulent sources
- Feeds marketing fraud signals into global fraud system

### With PACK 384 (App Store Defense)
- Coordinates review timing with store defense
- Prevents review bombing detection

### With PACK 385 (Launch Orchestration)
- Syncs campaigns with launch phases
- Throttles by region and timing

---

## 📈 SUCCESS METRICS

### Before PACK 386
- ❌ Manual campaign management
- ❌ Blind ad spend
- ❌ Untracked influencer ROI
- ❌ Generic review prompts
- ❌ Fraud leaking into campaigns

### After PACK 386
- ✅ Automated campaign optimization
- ✅ Real-time ROI tracking
- ✅ Influencer performance ranking
- ✅ Smart, eligible-user-only reviews
- ✅ Fraud-protected attribution
- ✅ Budget guardrails prevent overspend

---

## 🎓 BEST PRACTICES

### Campaign Management
1. Start with test budgets ($100-500/day)
2. Wait for 100+ installs before judging performance
3. Require 50+ token purchases before scaling
4. Set conservative CPI targets initially
5. Monitor daily, optimize weekly

### Influencer Partnerships
1. Start with CPI model for new influencers
2. Move to hybrid once proven (>100 installs)
3. Reserve revenue share for top performers
4. Check fraud score weekly
5. Suspend immediately if IP diversity drops

### Review Requests
1. Only prompt verified, active users
2. Never prompt users with support issues
3. Trigger after positive experiences
4. Respect platform rate limits
5. Track completion rates by trigger type

### Fraud Prevention
1. Review fraud signals daily
2. Block sources proactively, not reactively
3. Investigate CPI spikes immediately
4. Cross-reference with PACK 302
5. Archive data for audit trails

### Budget Management
1. Set conservative daily limits
2. Monitor every 15 minutes (automated)
3. Keep emergency kill switch accessible
4. Archive historical spend data
5. Review geo performance monthly

---

## 🔒 SECURITY NOTES

1. **Admin-Only Operations**: All campaign and budget management requires admin role
2. **Function-Only Writes**: Most collections only writable by Cloud Functions
3. **Fraud Score Integration**: Attribution validated against PACK 302
4. **Budget Hard Caps**: Cannot exceed daily limits, enforced at function level
5. **Audit Logging**: All critical operations logged to `adminAuditLog`
6. **Kill Switch Protection**: Requires admin auth + reason + confirmation

---

## 🐛 TROUBLESHOOTING

### Campaign Not Spending
1. Check budget status (ACTIVE vs CAPPED)
2. Verify geo targeting matches users
3. Review fraud block rate
4. Check platform integration

### Influencer Not Getting Credit
1. Verify attribution record created
2. Check fraud score < 0.8
3. Confirm influencerId in attribution
4. Review IP diversity

### Reviews Not Triggering
1. Check eligibility requirements
2. Verify user activity score ≥ 50
3. Confirm no support tickets
4. Review churn risk score

### Budget Alerts Not Firing
1. Verify scheduled functions running
2. Check alert configuration
3. Review budget document status
4. Confirm threshold calculations

---

## 📚 ADDITIONAL RESOURCES

- [PACK 302 - Fraud Detection](./PACK_302_FRAUD_DETECTION.md)
- [PACK 301 - Growth & Retention](./PACK_301_GROWTH_RETENTION.md)
- [PACK 384 - App Store Defense](./PACK_384_STORE_DEFENSE.md)
- [PACK 385 - Launch Orchestration](./PACK_385_LAUNCH_ORCHESTRATION.md)

---

**Implementation Date**: 2025-12-30
**Version**: 1.0.0
**Status**: Production Ready ✅
