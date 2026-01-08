# 📦 PACK 386 — Quick Start Guide

## 🚀 5-Minute Setup

### Step 1: Deploy PACK 386
```bash
chmod +x deploy-pack386.sh
./deploy-pack386.sh
```

### Step 2: Initialize Budget Rules
```typescript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const initBudgets = httpsCallable(functions, 'pack386_initializeBudgetRules');

await initBudgets({});
// ✅ Creates default budget rules for US, UK, EU
```

### Step 3: Create Your First Campaign
```typescript
const createCampaign = httpsCallable(functions, 'pack386_createCampaign');

const result = await createCampaign({
  platform: 'Meta',
  geoTargeting: ['US'],
  dailyBudget: 500,
  cpiTarget: 3.50,
  cpaTarget: 10.00,
  launchPhase: 'soft-launch'
});

console.log('Campaign ID:', result.data.campaignId);
```

### Step 4: Register Your First Influencer
```typescript
const registerInfluencer = httpsCallable(functions, 'pack386_registerInfluencer');

const result = await registerInfluencer({
  name: 'Jane Doe',
  platform: ['Instagram', 'TikTok'],
  socialHandles: {
    instagram: '@janedoe',
    tiktok: '@janedoe'
  },
  tier: 'MICRO'
});

console.log('Influencer ID:', result.data.influencerId);
```

### Step 5: Track User Attribution
```typescript
// Call this when user installs from a campaign/influencer
const validateAttribution = httpsCallable(functions, 'pack386_validateAttribution');

const result = await validateAttribution({
  userId: auth.currentUser.uid,
  source: 'INFLUENCER',
  influencerId: 'inf_xxx',
  deviceInfo: {
    deviceId: await getDeviceId(),
    platform: Platform.OS,
    ipAddress: await getIPAddress(),
    userAgent: navigator.userAgent
  }
});

if (result.data.blocked) {
  console.warn('Attribution blocked - fraud detected');
}
```

---

## 📊 View Analytics

### Campaign Performance
```typescript
const getCampaignAnalytics = httpsCallable(functions, 'pack386_getCampaignAnalytics');

// All campaigns
const allCampaigns = await getCampaignAnalytics({});

// Single campaign
const campaign = await getCampaignAnalytics({ campaignId: 'camp_xxx' });
```

### Influencer Performance
```typescript
const getInfluencerAnalytics = httpsCallable(functions, 'pack386_getInfluencerAnalytics');

// All influencers (ranked by revenue)
const influencers = await getInfluencerAnalytics({});

// Single influencer
const influencer = await getInfluencerAnalytics({ influencerId: 'inf_xxx' });
```

### Attribution Sources
```typescript
const getAttributionAnalytics = httpsCallable(functions, 'pack386_getAttributionAnalytics');

const analytics = await getAttributionAnalytics({
  period: 'month' // or 'day', 'week'
});

console.log('Total installs:', analytics.data.summary.totalInstalls);
console.log('Conversion rate:', analytics.data.summary.conversionRate);
```

### Fraud Dashboard
```typescript
const getFraudDashboard = httpsCallable(functions, 'pack386_getFraudDashboard');

const fraud = await getFraudDashboard({ period: 'week' });

console.log('Fraud signals:', fraud.data.totalSignals);
console.log('By type:', fraud.data.byType);
```

### Budget Status
```typescript
const getBudgetDashboard = httpsCallable(functions, 'pack386_getBudgetDashboard');

const budget = await getBudgetDashboard({});

console.log('Daily spend:', budget.data.totalSpend);
console.log('Remaining:', budget.data.remaining);
console.log('Status:', budget.data.status); // HEALTHY, WARNING, CRITICAL
```

---

## 🎮 Admin Controls

### Pause Campaign
```typescript
const updateCampaign = httpsCallable(functions, 'pack386_updateCampaignBudget');

await updateCampaign({
  campaignId: 'camp_xxx',
  status: 'PAUSED'
});
```

### Adjust Budget
```typescript
await updateCampaign({
  campaignId: 'camp_xxx',
  dailyBudget: 1000
});
```

### Block Fraudulent Source
```typescript
const blockSource = httpsCallable(functions, 'pack386_blockAttributionSource');

await blockSource({
  sourceType: 'influencer', // or 'campaign', 'ip', 'device'
  sourceId: 'inf_xxx',
  reason: 'High fraud score detected'
});
```

### Emergency Kill Switch
```typescript
const killSwitch = httpsCallable(functions, 'pack386_budgetKillSwitch');

await killSwitch({
  reason: 'Fraud spike detected',
  geo: 'US' // or omit for global
});
// ⚠️ This pauses ALL campaigns immediately
```

---

## 🔔 Review Prompts

Reviews are triggered automatically, but you can also trigger manually:

```typescript
const triggerReview = httpsCallable(functions, 'pack386_triggerSmartReviewPrompt');

const result = await triggerReview({
  userId: 'user_xxx',
  trigger: 'SUCCESSFUL_CHAT' // or FIRST_MEETING, FIRST_PAYOUT, MILESTONE_REACHED
});

if (result.data.eligible) {
  // Show review prompt in your UI
}
```

---

## 🔍 Monitoring

### Auto-Scaling (Every 6 hours)
- ✅ Scales high-ROI campaigns (ROI > 2.0x)
- ❌ Pauses low-ROI campaigns (ROI < 0.3x)

### Fraud Detection (Every 1 hour)
- ✅ Detects fake installs
- ✅ Detects burst reviews
- ✅ Detects CPI anomalies
- ✅ Detects influencer farms
- ✅ Detects refund loops

### Budget Monitoring (Every 15 minutes)
- ✅ Checks budget utilization
- ✅ Auto-pauses at 95% spent
- ✅ Sends alerts at 90%

### Churn Detection (Daily)
- ✅ Marks users inactive for 30 days as churned
- ✅ Updates attribution records
- ✅ Logs churn events

---

## 📈 Key Metrics

### Campaign Health
- **CPI (Cost Per Install)**: Should be ≤ target
- **CPA (Cost Per Acquisition)**: Should be ≤ target
- **ROI**: Should be ≥ 1.0x (breakeven), ideally ≥ 2.0x
- **Conversion Rate**: % of installs that make token purchase

### Influencer Quality
- **Fraud Score**: Should be < 0.3 (low), flags at > 0.6
- **IP Diversity**: Should be ≥ 50% unique IPs
- **Churn Rate**: Should be < 30%
- **Revenue per Install**: Higher is better

### Attribution Quality
- **Block Rate**: Should be < 10%
- **Verification Rate**: % of installs that verify account
- **Purchase Rate**: % of installs that buy tokens

---

## ⚠️ Common Issues

### High CPI
- **Cause**: Poor targeting or saturated audience
- **Fix**: Adjust geo targeting, refresh creative, pause and test new approach

### Low Conversion Rate
- **Cause**: Poor user quality or onboarding issues
- **Fix**: Review attribution sources, improve onboarding, check fraud scores

### Fraud Signals
- **Cause**: Fake installs, click farms, VPNs
- **Fix**: Block source immediately, review attribution patterns, tighten fraud thresholds

### Budget Exceeded
- **Cause**: Manual override or burst spending
- **Fix**: Review budget dashboard, check campaign status, investigate spikes

---

## 🎯 Best Practices

### Campaign Setup
1. ✅ Start with $100-500/day test budgets
2. ✅ Set realistic CPI targets based on region
3. ✅ Wait for 100+ installs before optimizing
4. ✅ Require 50+ purchases before scaling

### Influencer Management
1. ✅ Start with CPI model for new influencers
2. ✅ Monitor fraud score weekly
3. ✅ Block at first sign of farm behavior
4. ✅ Reward top performers with better rates

### Review Strategy
1. ✅ Only prompt happy, verified users
2. ✅ Trigger after positive experiences
3. ✅ Never prompt users with support issues
4. ✅ Track completion rates by trigger type

### Fraud Prevention
1. ✅ Review fraud signals daily
2. ✅ Block proactively, not reactively
3. ✅ Cross-reference with PACK 302
4. ✅ Keep audit trails for investigations

---

## 🔗 Next Steps

1. Read full documentation: [`PACK_386_GLOBAL_MARKETING_AUTOMATION.md`](./PACK_386_GLOBAL_MARKETING_AUTOMATION.md)
2. Set up admin dashboard at `admin-web/marketing/`
3. Configure platform integrations (Meta, TikTok, etc.)
4. Set up alert notifications
5. Train team on fraud signal review

---

## 📞 Support

For issues or questions:
1. Check [`PACK_386_GLOBAL_MARKETING_AUTOMATION.md`](./PACK_386_GLOBAL_MARKETING_AUTOMATION.md) troubleshooting section
2. Review Cloud Function logs in Firebase Console
3. Check Firestore collections for data issues
4. Verify security rules are deployed correctly

---

**Quick Reference**
- 📊 Analytics: [View details](./PACK_386_GLOBAL_MARKETING_AUTOMATION.md#-roi--ltv-control-dashboard)
- 🔒 Security: [View rules](./firestore-pack386-marketing.rules)
- 🗄 Indexes: [View indexes](./firestore-pack386-marketing.indexes.json)
- 🚀 Deploy: [`./deploy-pack386.sh`](./deploy-pack386.sh)
