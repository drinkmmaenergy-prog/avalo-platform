# PACK 379 — Global ASO, Reviews, Reputation & Store Defense Engine
## Quick Start Guide

**Version:** 1.0.0  
**Stage:** D — Public Launch & Market Expansion  
**Status:** ✅ Production Ready

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Dependencies](#dependencies)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Feature Modules](#feature-modules)
6. [Admin Dashboard](#admin-dashboard)
7. [Crisis Mode](#crisis-mode)
8. [Integration Guide](#integration-guide)
9. [API Reference](#api-reference)
10. [Monitoring & Alerts](#monitoring--alerts)
11. [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

PACK 379 is Avalo's comprehensive defense and growth system that:

- **Protects** against store bans, review attacks, and reputation manipulation
- **Optimizes** App Store & Google Play rankings automatically
- **Calculates** user trust scores for security and compliance
- **Monitors** store policy changes and compliance risks
- **Automates** crisis response and review dispute handling
- **Provides** executive dashboard with real-time analytics

### Key Capabilities

| Module | Function | Status |
|--------|----------|--------|
| Review Defense | Detects and mitigates review attacks | ✅ Active |
| ASO Engine | Optimizes keywords and conversion rates | ✅ Active |
| Trust Scores | Calculates user reputation scores | ✅ Active |
| Compliance Monitor | Watches for policy violations | ✅ Active |
| Crisis Mode | Emergency reputation shield | ✅ Ready |
| Dispute Automation | Generates legal dispute packets | ✅ Active |
| Executive Dashboard | Real-time analytics and control | ✅ Active |

---

## 📦 Dependencies

PACK 379 requires the following PACKs to be deployed:

- **PACK 277** — Wallet & Token Store (payment behavior tracking)
- **PACK 296** — Audit Logs (event tracking)
- **PACK 300 + 300A** — Support & Safety Ops (support history, escalations)
- **PACK 301 + 301B** — Growth, Retention & Winback (user engagement data)
- **PACK 302** — Fraud Detection (fraud scores)
- **PACK 378** — Tax, VAT & Legal Compliance (compliance status)

### Optional External APIs

- **App Store Connect API** — iOS metrics (requires Apple Developer account)
- **Google Play Developer API** — Android metrics (requires Google Play Console access)

---

## 🚀 Installation

### Step 1: Deploy Infrastructure

```bash
# Make the deployment script executable
chmod +x deploy-pack379.sh

# Run deployment
./deploy-pack379.sh
```

The script will:
1. Deploy Firestore security rules
2. Deploy Firestore indexes (takes 5-10 minutes)
3. Deploy 16 Cloud Functions
4. Initialize feature flags
5. Set up default configuration
6. Configure scheduled jobs
7. Deploy admin dashboard (optional)

### Step 2: Wait for Index Building

```bash
# Check index building status
firebase firestore:indexes

# Expected output:
# ✓ All indexes are ready
```

### Step 3: Verify Deployment

```bash
# Check function logs
firebase functions:log --only pack379_reviewAttackDetector

# Monitor in real-time
firebase functions:log --only pack379 --follow
```

---

## ⚙️ Configuration

### Feature Flags

Feature flags are stored in Firestore: `pack379Config/featureFlags`

Access via Admin Dashboard or Firebase Console.

Key flags:

```json
{
  "aso.engine.enabled": true,
  "review.defense.enabled": true,
  "store.dispute.auto.enabled": false,
  "trust.score.enabled": true,
  "crisis.mode.enabled": true
}
```

### Trust Score Thresholds

Configure in Firestore: `pack379Config/trustThresholds`

```json
{
  "minimumScoreForReview": 50,
  "minimumScoreForPublicContent": 60,
  "minimumScoreForMarketplace": 70,
  "crisisModeActive": false
}
```

**Note:** Crisis mode automatically raises these thresholds by +20 points.

### Review Prompts Configuration

Configure in Firestore: `pack379Config/reviewPrompts`

```json
{
  "enabled": true,
  "minimumTrustScore": 50,
  "promptThrottleDays": 90,
  "maxPromptsPerUser": 2
}
```

---

## 🛡️ Feature Modules

### 1. Review Defense & Manipulation Detection

**Automatically detects:**
- Review velocity attacks (e.g., 20+ 1-star reviews in 15 minutes)
- Repetitive text patterns (fake reviews)
- Coordinated attacks (same IP/device)
- Bot-generated content

**Functions:**
- `pack379_reviewAttackDetector` — Runs every 15 minutes
- `pack379_fakeReviewClassifier` — Real-time classification
- `pack379_reviewVelocityGuard` — Runs every 5 minutes

**Auto-Actions:**
- Flags suspicious reviews
- Notifies trust team
- Triggers crisis mode (if critical)
- Generates dispute bundle

**Testing:**
```bash
# Simulate review ingestion
firebase functions:call pack379_fakeReviewClassifier \
  --data '{"platform":"ios","rating":1,"text":"bad","country":"US"}'
```

### 2. Store Dispute Automation

**Capabilities:**
- Generates legal dispute packets
- Includes GDPR, DSA, and FTC references
- Links to fraud detection system
- Analyzes timestamp patterns and IP clusters

**Functions:**
- `pack379_storeDisputeGenerator` — Callable function
- `pack379_storeAppealAutoSubmit` — Prepares for submission

**Usage:**

```typescript
// Call from admin dashboard or script
const result = await functions.httpsCallable('pack379_storeDisputeGenerator')({
  reviewIds: ['review1', 'review2', 'review3'],
  disputeReason: 'fake_reviews',
  platform: 'ios'
});

console.log('Dispute bundle:', result.data.bundleId);
```

### 3. ASO Boost Engine

**Optimizes:**
- Keyword rankings
- Conversion rates
- Screenshot CTR
- Store page metadata

**Functions:**
- `pack379_asoBoostOptimizer` — Runs every 6 hours
- `pack379_keywordClusteringEngine` — Callable function
- `pack379_storeAlgorithmResponse` — Runs every 12 hours

**View Optimizations:**

Admin Dashboard → ASO Performance → Optimization Suggestions

**Manual Optimization:**
```typescript
// Get keyword clusters
const clusters = await functions.httpsCallable('pack379_keywordClusteringEngine')({
  platform: 'ios',
  keywords: [
    { keyword: 'dating app', searchVolume: 10000, difficulty: 85 },
    { keyword: 'meet people', searchVolume: 5000, difficulty: 70 }
  ]
});
```

### 4. User Trust Score Engine

**Calculated from:**
- Support history (15% weight)
- Fraud history (25% weight)
- Payment behavior (20% weight)
- Report behavior (15% weight)
- Verification depth (15% weight)
- Account age (10% weight)

**Functions:**
- `pack379_trustScoreEngine` — Triggered on user updates

**Score Ranges:**
- 86-100: Excellent (low risk)
- 71-85: High (medium risk)
- 41-70: Medium (high risk)
- 0-40: Low (critical risk)

**Access User Trust Score:**

```typescript
const userTrustDoc = await db.collection('userTrustScores').doc(userId).get();
const trustScore = userTrustDoc.data();

console.log('Trust score:', trustScore.score);
console.log('Risk level:', trustScore.riskLevel);
```

### 5. Store Compliance Monitoring

**Monitors for:**
- Content moderation compliance
- Payment policy violations
- Age rating accuracy
- Data privacy compliance

**Functions:**
- `pack379_storePolicyWatcher` — Runs daily
- `pack379_preemptiveRiskAlert` — Callable function

**View Alerts:**

Admin Dashboard → Compliance → Active Alerts

### 6. Crisis Mode & Reputation Shield

**Triggers:**
- Review bomb (20+ negative reviews in 15 min)
- Rating drop (> 0.5 stars in 24 hours)
- Support ticket spike (100+ in 3 hours)
- Manual activation

**Auto-Actions:**
- ✅ Freezes review prompts
- ✅ Raises trust thresholds
- ✅ Locks suspicious accounts
- ✅ Enables discovery suppression
- ✅ Activates emergency support routing

**Functions:**
- `pack379_crisisReputationShield` — Callable function

**Activate Crisis Mode:**

```typescript
// Manual activation (admin only)
const result = await functions.httpsCallable('pack379_crisisReputationShield')({
  action: 'activate',
  reason: 'Manual activation due to negative PR'
});

// Deactivate
const result = await functions.httpsCallable('pack379_crisisReputationShield')({
  action: 'deactivate',
  crisisId: 'crisis_event_id'
});
```

Or via Admin Dashboard: **Emergency Controls → Activate Crisis Mode**

### 7. Store-Safe Review Prompts

**Compliant Rules:**
- ✅ Zero monetary incentive
- ✅ Only value-based prompts
- ✅ Post-success triggers only
- ✅ Review throttling (90 days between prompts)
- ✅ Max 2 prompts per user lifetime

**Valid Triggers:**
- `successful_match` — After confirmed match
- `successful_date` — After positive date interaction
- `positive_interaction` — After milestone achievement
- `milestone_achieved` — After completing goals
- `premium_upgrade` — After subscribing (must be genuine experience)

**Functions:**
- `pack379_storeSafeReviewTrigger` — Callable function
- `pack379_recordReviewCompletion` — Callable function

**Implementation:**

```typescript
// Check if user should be prompted
const shouldPrompt = await functions.httpsCallable('pack379_storeSafeReviewTrigger')({
  platform: 'ios',
  triggerEvent: 'successful_match'
});

if (shouldPrompt.data.shouldPrompt) {
  // Show native review prompt
  StoreReview.requestReview();
  
  // Record completion
  await functions.httpsCallable('pack379_recordReviewCompletion')({
    platform: 'ios',
    completed: true
  });
}
```

### 8. Executive Dashboard & Analytics

**Real-Time Metrics:**
- Overall health score
- ASO performance (iOS & Android)
- Review health indicators
- Trust score distribution
- Active alerts
- Country reputation map

**Functions:**
- `pack379_execReputationDashboard` — Callable function
- `pack379_dailyExecutiveReport` — Scheduled daily at 8 AM EST

**Access Dashboard:**
```
https://your-project.web.app/admin/reputation
```

**Roles Required:** `admin` or `executive`

---

## 📊 Admin Dashboard

### Access

1. Navigate to: `https://your-project.web.app/admin/reputation`
2. Sign in with admin credentials
3. Dashboard auto-refreshes every 5 minutes

### Features

#### 1. Health Score Cards
- Overall health
- Review health
- Trust distribution
- Active alerts count

#### 2. ASO Performance
- Platform-specific metrics (iOS & Android)
- Conversion rates
- Average ratings
- Total installs
- Trend indicators

#### 3. Review Health Details
- Total reviews
- Average rating
- Flagged reviews
- High suspicion count
- Health score gauge

#### 4. Trust Score Distribution
- Excellent (86-100)
- High (71-85)
- Medium (41-70)
- Low (0-40)

#### 5. Active Alerts
- Real-time attack notifications
- Severity indicators
- Affected review counts
- Detection timestamps

#### 6. Country Reputation Map
- Per-country scores
- Risk levels
- Review counts
- Country flags

#### 7. Emergency Controls
- Crisis mode toggle
- Time range selector
- Real-time status updates

---

## 🚨 Crisis Mode

### When to Activate

**Automatic Triggers:**
- Review bomb attack detected
- Severe rating drop
- Massive support ticket spike
- Store policy violation alert

**Manual Triggers:**
- Negative PR incident
- Legal threat
- Creator abuse scandal
- Proactive defense

### What Happens

1. **Review Prompts Frozen** — No new users prompted for reviews
2. **Trust Thresholds Raised** — Stricter content publishing rules
3. **Suspicious Accounts Locked** — Users with low trust scores restricted
4. **Discovery Suppression** — Reduced volatility in app discovery
5. **Emergency Support** — Priority routing to senior agents

### Duration

Crisis mode remains active until manually deactivated by an admin.

**Recommended duration:** 24-72 hours minimum

### Deactivation

```typescript
// Via Cloud Function
await functions.httpsCallable('pack379_crisisReputationShield')({
  action: 'deactivate',
  crisisId: 'crisis_event_id'
});

// Or via Admin Dashboard
```

---

## 🔗 Integration Guide

### Mobile App Integration

#### 1. Review Prompt Integration

```typescript
// app-mobile/lib/review-prompt.ts
import { getFunctions, httpsCallable } from 'firebase/functions';

export async function checkReviewPrompt(
  triggerEvent: string
): Promise<{ shouldPrompt: boolean; message?: string }> {
  const functions = getFunctions();
  const checkPrompt = httpsCallable(functions, 'pack379_storeSafeReviewTrigger');
  
  try {
    const result = await checkPrompt({
      platform: Platform.OS,
      triggerEvent
    });
    
    return result.data as any;
  } catch (error) {
    console.error('Review prompt check failed:', error);
    return { shouldPrompt: false };
  }
}

// Usage after successful match
const prompt = await checkReviewPrompt('successful_match');
if (prompt.shouldPrompt) {
  // Show native review dialog
  await StoreReview.requestReview();
  
  // Record completion
  await recordReviewCompletion(true);
}
```

#### 2. Trust Score Display

```typescript
// app-mobile/lib/trust-score.ts
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export async function getUserTrustScore(userId: string) {
  const scoreDoc = await getDoc(doc(db, 'userTrustScores', userId));
  
  if (!scoreDoc.exists()) {
    return null;
  }
  
  return {
    score: scoreDoc.data().score,
    riskLevel: scoreDoc.data().riskLevel,
    factors: scoreDoc.data().factors
  };
}
```

### Backend Integration

#### 1. Event Tracking

```typescript
// Trigger trust score recalculation on events
import { getFirestore } from 'firebase-admin/firestore';

export async function onUserEventUpdate(userId: string, eventType: string) {
  const db = getFirestore();
  
  // Update user document to trigger trust score recalculation
  await db.collection('users').doc(userId).update({
    lastTrustScoreUpdate: new Date(),
    lastEventType: eventType
  });
}

// Call after: payment, support ticket, report submission, verification
```

#### 2. Review Data Ingestion

```typescript
// Ingest reviews from App Store Connect / Google Play API
import { getFirestore } from 'firebase-admin/firestore';

export async function ingestStoreReview(review: any) {
  const db = getFirestore();
  
  await db.collection('storeReviewSecurity').add({
    platform: review.platform,
    rating: review.rating,
    text: review.text,
    country: review.country,
    reviewId: review.id,
    authorId: review.authorId,
    ipAddress: review.ip,
    deviceFingerprint: review.deviceId,
    createdAt: new Date(review.timestamp)
  });
  
  // Classification and attack detection run automatically
}
```

---

## 📚 API Reference

### Cloud Functions

#### Review Defense

**`pack379_reviewAttackDetector`**
- Type: Scheduled (every 15 minutes)
- Purpose: Detects review attack patterns
- Returns: `{ analyzed: number, attacks: number }`

**`pack379_fakeReviewClassifier`**
- Type: Firestore Trigger (onCreate)
- Purpose: Classifies reviews as genuine or suspicious
- Trigger: `storeReviewSecurity/{reviewId}`

**`pack379_reviewVelocityGuard`**
- Type: Scheduled (every 5 minutes)
- Purpose: Monitors review velocity by country
- Returns: `{ alerts: Alert[] }`

#### Store Disputes

**`pack379_storeDisputeGenerator`**
- Type: Callable (HTTPS)
- Auth: Required (admin/trust_team)
- Params: `{ reviewIds: string[], disputeReason: string, platform: string }`
- Returns: `{ bundleId: string, packet: DisputePacket }`

**`pack379_storeAppealAutoSubmit`**
- Type: Callable (HTTPS)
- Auth: Required (admin/trust_team)
- Params: `{ bundleId: string }`
- Returns: `{ success: boolean, status: string }`

#### ASO Engine

**`pack379_asoBoostOptimizer`**
- Type: Scheduled (every 6 hours)
- Purpose: Generates ASO optimization suggestions
- Returns: `{ generated: number }`

**`pack379_keywordClusteringEngine`**
- Type: Callable (HTTPS)
- Auth: Required (admin)
- Params: `{ platform: string, keywords: Keyword[] }`
- Returns: `{ clusters: KeywordCluster[] }`

**`pack379_storeAlgorithmResponse`**
- Type: Scheduled (every 12 hours)
- Purpose: Monitors algorithm volatility
- Returns: `null`

#### Trust Scores

**`pack379_trustScoreEngine`**
- Type: Firestore Trigger (onWrite)
- Purpose: Calculates user trust scores
- Trigger: `users/{userId}`

#### Compliance

**`pack379_storePolicyWatcher`**
- Type: Scheduled (daily)
- Purpose: Checks store policy compliance
- Returns: `{ checks: number }`

**`pack379_preemptiveRiskAlert`**
- Type: Callable (HTTPS)
- Auth: Required (admin)
- Params: `{}`
- Returns: `{ risks: Risk[] }`

#### Crisis Mode

**`pack379_crisisReputationShield`**
- Type: Callable (HTTPS)
- Auth: Required (admin only)
- Params: `{ action: 'activate' | 'deactivate', reason?: string, crisisId?: string }`
- Returns: `{ success: boolean, crisisId?: string, actions?: string[] }`

#### Review Prompts

**`pack379_storeSafeReviewTrigger`**
- Type: Callable (HTTPS)
- Auth: Required
- Params: `{ platform: string, triggerEvent: string }`
- Returns: `{ shouldPrompt: boolean, message?: string, reason?: string }`

**`pack379_recordReviewCompletion`**
- Type: Callable (HTTPS)
- Auth: Required
- Params: `{ platform: string, completed: boolean }`
- Returns: `{ success: boolean }`

#### Analytics

**`pack379_execReputationDashboard`**
- Type: Callable (HTTPS)
- Auth: Required (admin/executive)
- Params: `{ timeRange?: string }`
- Returns: `DashboardData`

**`pack379_dailyExecutiveReport`**
- Type: Scheduled (daily 8 AM EST)
- Purpose: Generates daily executive report
- Returns: `{ success: boolean }`

---

## 🔔 Monitoring & Alerts

### Alert Types

| Alert Type | Severity | Channels | Auto-Actions |
|------------|----------|----------|--------------|
| Review Attack | Critical | Email, Slack, Dashboard | Flag reviews, notify team, trigger crisis |
| Compliance Risk | High | Email, Dashboard | Create alert, notify admins |
| ASO Decline | Medium | Dashboard | Generate optimization suggestions |
| Trust Score Anomaly | Medium | Dashboard | Flag user, notify trust team |

### Notification Channels

Configure in `config/pack379-feature-flags.json`:

```json
{
  "monitoring": {
    "alerts": {
      "reviewAttack": {
        "enabled": true,
        "severity": "critical",
        "channels": ["email", "slack", "dashboard"]
      }
    }
  }
}
```

### Setting Up Alerts

1. **Email Notifications** — Configure SMTP in Firebase Functions
2. **Slack Notifications** — Add Slack webhook URL to environment
3. **Dashboard Alerts** — Automatically enabled

---

## 🛠️ Troubleshooting

### Common Issues

#### 1. Firestore Indexes Not Building

**Symptom:** Functions failing with "index required" error

**Solution:**
```bash
firebase firestore:indexes
# Wait for all indexes to show "READY" status
```

#### 2. Cloud Functions Timing Out

**Symptom:** Functions exceed execution time limit

**Solution:**
- Increase timeout in `functions/src/index.ts`:
```typescript
export const pack379_trustScoreEngine = functions
  .runWith({ timeoutSeconds: 540, memory: '2GB' })
  .firestore.document('users/{userId}')
  .onWrite(async (change, context) => { /* ... */ });
```

#### 3. Review Prompts Not Showing

**Symptom:** Users never see review prompts

**Check:**
1. Feature flag: `review.prompts.enabled = true`
2. User trust score > minimum threshold (default: 50)
3. User hasn't been prompted in last 90 days
4. User hasn't reached max prompts (default: 2)

**Debug:**
```typescript
const result = await functions.httpsCallable('pack379_storeSafeReviewTrigger')({
  platform: 'ios',
  triggerEvent: 'successful_match'
});

console.log('Prompt check:', result.data);
// Check 'reason' field for why prompt was blocked
```

#### 4. Trust Scores Not Updating

**Symptom:** User trust scores remain unchanged

**Solution:**
- Manually trigger recalculation:
```typescript
await db.collection('users').doc(userId).update({
  lastUpdated: admin.firestore.FieldValue.serverTimestamp()
});
```

#### 5. Dashboard Not Loading Data

**Symptom:** Admin dashboard shows "Loading..." indefinitely

**Check:**
1. User has `admin` or `executive` role
2. API endpoints are deployed
3. Browser console for errors

**Test API:**
```bash
curl -X POST https://your-region-your-project.cloudfunctions.net/pack379_execReputationDashboard \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"timeRange":"30d"}'
```

### Debug Logs

```bash
# View all PACK 379 logs
firebase functions:log --only pack379

# View specific function
firebase functions:log --only pack379_reviewAttackDetector

# Monitor in real-time
firebase functions:log --only pack379 --follow

# Filter by severity
firebase functions:log --only pack379 --severity error
```

### Performance Monitoring

Enable in Firebase Console:
1. Go to Functions → Performance
2. Monitor P50, P95, P99 latencies
3. Check error rates and success rates

---

## 📈 Best Practices

### 1. Regular Review Health Checks

- Check dashboard daily
- Monitor for unusual patterns
- Review flagged reviews weekly
- Update dispute bundles as needed

### 2. Trust Score Maintenance

- Audit trust score weights quarterly
- Adjust thresholds based on user growth
- Monitor distribution for anomalies
- Review low-score users manually

### 3. ASO Optimization

- Review optimization suggestions weekly
- Implement high-priority changes first
- A/B test screenshot and metadata changes
- Track conversion rate improvements

### 4. Crisis Preparedness

- Document crisis response procedures
- Train team on crisis mode activation
- Maintain updated contact lists
- Review crisis logs after incidents

### 5. Compliance Monitoring

- Review policy alerts daily
- Update compliance checks as policies change
- Maintain store guideline documentation
- Schedule quarterly compliance audits

---

## 📞 Support

### Documentation
- Full API docs: `/docs/pack379-api.md`
- Architecture guide: `/docs/pack379-architecture.md`
- Integration examples: `/docs/pack379-examples.md`

### Contact
- Technical issues: Create GitHub issue
- Emergency: Contact CTO directly
- Feature requests: Submit via admin dashboard

---

## 🚀 What's Next?

After PACK 379 is deployed:

1. **Monitor First 48 Hours** — Watch for any anomalies
2. **Configure External APIs** — Set up App Store Connect & Google Play APIs
3. **Train Team** — Ensure admins understand crisis mode
4. **Review Thresholds** — Adjust based on your user base
5. **Document Procedures** — Create runbooks for common scenarios

---

## ✅ Success Checklist

- [ ] All Cloud Functions deployed successfully
- [ ] Firestore indexes built (check status)
- [ ] Feature flags configured
- [ ] Admin dashboard accessible
- [ ] Review prompts tested
- [ ] Trust scores calculating correctly
- [ ] Crisis mode tested (activate/deactivate)
- [ ] Alert notifications working
- [ ] Team trained on dashboard
- [ ] Documentation reviewed

---

**PACK 379 Status:** ✅ **PRODUCTION READY**

Without PACK 379: ❌ Defenseless against store attacks  
With PACK 379: ✅ **Full protection, growth automation, and crisis response**

---

*Last Updated: 2025-12-23*  
*Version: 1.0.0*
