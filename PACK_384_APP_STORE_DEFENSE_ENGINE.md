# PACK 384 — App Store Defense, Reviews, Reputation & Trust Engine

**Stage:** D — Public Launch, Trust & Market Protection

**Status:** ✅ **PRODUCTION READY**

---

## 🎯 OBJECTIVE

Build a full-spectrum App Store & Reputation Defense System to:

- ✅ Protect Avalo from review bombing
- ✅ Detect and block fake accounts boosting ratings
- ✅ Prevent store bans and shadow penalties
- ✅ Stabilize ASO rankings
- ✅ Automate user review acquisition
- ✅ Integrate trust scoring & public credibility

This pack is **mandatory** for safe public scaling on App Store & Google Play.

---

## 📦 COMPONENTS DEPLOYED

### 1️⃣ App Store Review Defense Engine

**Collections:**
- [`storeReviewSignals`](firestore-pack384-store.rules) - Tracks all review signals with device, IP, and behavioral data
- [`storeAbuseSignals`](firestore-pack384-store.rules) - Records detected abuse patterns
- [`reviewBombingDetections`](firestore-pack384-store.rules) - Stores bombing detection results

**Functions:**
- [`detectReviewBombing()`](functions/src/pack384-review-defense.ts) - Detects coordinated review attacks
- [`recordStoreReviewSignal()`](functions/src/pack384-review-defense.ts) - Records and analyzes review signals
- [`detectCopyPasteReviews()`](functions/src/pack384-review-defense.ts) - Scheduled bot detection (every 6 hours)

**Triggers:**
- Velocity spike detected (>5x normal)
- Low-trust accounts dominate reviews (>30%)
- Geo-cluster anomalies appear

---

### 2️⃣ Automated Review Acquisition Engine (Safe Mode)

**Function:**
- [`requestStoreReview(userId)`](functions/src/pack384-review-defense.ts)

**Rules:**
- ✅ Only after successful actions (completed chat, meeting, payout, 7+ day retention)
- ✅ Max 1 request per 30 days per user
- ❌ Never after failed transaction
- ❌ Never during churn-risk state
- ❌ Never during open support ticket

**Collection:**
- [`storeReviewRequests`](firestore-pack384-store.rules) - Tracks review prompt history

---

### 3️⃣ Trust Score & Public Reputation Index

**Collection:**
- [`publicTrustScores`](firestore-pack384-store.rules) - Public trust scores (0-1000 scale)

**Functions:**
- [`computePublicTrustScore(userId)`](functions/src/pack384-trust-score.ts) - Computes comprehensive trust score
- [`batchRecomputeTrustScores()`](functions/src/pack384-trust-score.ts) - Daily batch update (scheduled)
- [`getPublicTrustScore(userId)`](functions/src/pack384-trust-score.ts) - Retrieves trust score for display
- [`applyTrustScoreToRankings(category)`](functions/src/pack384-trust-score.ts) - Applies scores to discovery/calendar
- [`flagLowTrustUser()`](functions/src/pack384-trust-score.ts) - Auto-flags users below threshold

**Trust Tiers:**
- 🔴 **Untrusted** (0-299): High risk, limited visibility
- 🟡 **New** (300-499): Normal new user
- 🟤 **Bronze** (500-649): Established user
- ⚪ **Silver** (650-799): Trusted user
- 🟡 **Gold** (800-899): Highly trusted
- 💎 **Platinum** (900-1000): Elite trust level

**Factors:**
- Account age
- Verification tier
- Payout history
- Fraud flags (severe penalty)
- Abuse reports
- Successful meetings
- Positive reviews
- Response rate
- Completion rate
- Cancellation rate
- Dispute rate

---

### 4️⃣ Ban & Store Takedown Prevention Layer

**Function:**
- [`storePolicyViolationMonitor()`](functions/src/pack384-store-policy-monitor.ts) - Detects policy violations
- [`scheduledStorePolicyCheck()`](functions/src/pack384-store-policy-monitor.ts) - Every 12 hours
- [`autoRemediateViolation()`](functions/src/pack384-store-policy-monitor.ts) - Auto-blocks violating users

**Collections:**
- [`storeSafetyAlerts`](firestore-pack384-store.rules) - Policy violation alerts

**Monitored Violations:**
- ❌ Inappropriate content
- ❌ Payment fraud patterns
- ❌ Privacy violations
- ❌ Review manipulation
- ❌ Minor protection issues
- ❌ High crash rates (>5 per 1000 sessions)
- ❌ Deceptive practices

**Risk Levels:**
- 🟢 Low: Monitor only
- 🟡 Medium: Review within 7 days
- 🟠 High: Address within 48 hours
- 🔴 Critical: **Immediate action required** (auto-escalates to support)

---

### 5️⃣ Fake Review & Paid Boost Detection

**Integrated with:**
- PACK 302 (fraud detection)
- PACK 301 (retention analytics)

**Functions:**
- [`detectPaidReviewFarms()`](functions/src/pack384-paid-review-detection.ts) - Detects review farms
- [`analyzeDeviceFingerprint()`](functions/src/pack384-paid-review-detection.ts) - Validates device authenticity
- [`detectCoordinatedAttack()`](functions/src/pack384-paid-review-detection.ts) - Scheduled every 4 hours
- [`blockReviewFarmIPRanges(ipRanges)`](functions/src/pack384-paid-review-detection.ts) - Blocks IP ranges
- [`generateAuthenticityReport()`](functions/src/pack384-paid-review-detection.ts) - Monthly authenticity report

**Detects:**
- ✅ Paid review farms
- ✅ VPN clusters
- ✅ Device emulation
- ✅ Copy-paste review content
- ✅ Bot sentiment patterns

**Collections:**
- [`reviewFarmDetections`](firestore-pack384-store.rules)
- [`coordinatedAttacks`](firestore-pack384-store.rules)
- [`deviceFingerprints`](firestore-pack384-store.rules)
- [`blockedIPRanges`](firestore-pack384-store.rules)

---

### 6️⃣ App Store ASO Stability Engine

**Function:**
- [`monitorASOHealth()`](functions/src/pack384-aso-monitor.ts) - Comprehensive ASO health check
- [`scheduledASOHealthCheck()`](functions/src/pack384-aso-monitor.ts) - Every 6 hours
- [`detectCrashReviewCorrelation()`](functions/src/pack384-aso-monitor.ts) - Correlates crashes with reviews
- [`trackUninstallSpike()`](functions/src/pack384-aso-monitor.ts) - Triggers on uninstall surges

**Collections:**
- [`asoHealthMetrics`](firestore-pack384-store.rules) - ASO health snapshots
- [`asoIncidents`](firestore-pack384-store.rules) - Critical incidents

**Tracks:**
- 📊 Keyword ranking volatility
- 📉 Uninstall spikes (>2x baseline)
- 💥 Crash-to-review correlation
- 😞 Negative sentiment cascades
- 📱 Daily downloads/uninstalls
- 🔄 7-day retention rate
- ⭐ Average rating trends
- 🔄 Store page conversion rate

**Health States:**
- 🟢 **Excellent**: All metrics healthy
- 🔵 **Good**: Normal operation
- 🟡 **Warning**: Some concerns detected
- 🔴 **Critical**: Immediate action required

---

### 7️⃣ Admin Store Defense Dashboard

**Path:**
- [`admin-web/store-defense/StoreDefenseDashboard.tsx`](admin-web/store-defense/StoreDefenseDashboard.tsx)

**Screens:**
1. **Overview** - Real-time threat status
2. **Reviews** - Review bombing analysis
3. **Trust** - Trust score distribution
4. **ASO** - App store health metrics

**Features:**
- 🔴 Live review stream
- 🌡️ Trust score heatmap
- 🚨 Bombing detection alerts
- 🛡️ Fake review suppression
- 📈 ASO trend charts
- 🌍 Market-specific risk flags

**Admin Actions:**
- Run bombing detection
- Check ASO health
- Generate defense dossier
- Block IP ranges
- Compute trust scores

---

### 8️⃣ Automated Response & Escalation

**Function:**
- [`generateStoreDefenseDossier()`](functions/src/pack384-store-policy-monitor.ts)

**When Detected:**
- Review bombing (critical severity)
- Coordinated attacks
- False mass reporting

**System Auto-Generates:**
- ✅ Incident report
- ✅ Moderation queue entry
- ✅ Legal-ready audit trail (PACK 296)
- ✅ Complaint packet for Apple/Google
- ✅ Support ticket (PACK 300)

**Collection:**
- [`storeDefenseDossiers`](firestore-pack384-store.rules) - Legal-ready documentation

---

## 🗂️ FIRESTORE COLLECTIONS

| Collection | Purpose | Access |
|------------|---------|--------|
| `storeReviewSignals` | Review signal tracking | Auth users (read), Owners (create) |
| `storeAbuseSignals` | Abuse pattern storage | Admin only |
| `publicTrustScores` | Trust scores | Public (read), Admin (write) |
| `asoHealthMetrics` | ASO health snapshots | Admin only |
| `reviewBombingDetections` | Bombing detections | Admin only |
| `reviewFarmDetections` | Farm detections | Admin only |
| `coordinatedAttacks` | Attack patterns | Admin only |
| `deviceFingerprints` | Device validation | Owner/Admin |
| `blockedIPRanges` | IP blocklist | Admin only |
| `storeSafetyAlerts` | Policy violations | Admin only |
| `storeDefenseDossiers` | Legal documentation | Admin only |
| `storeReviewRequests` | Review prompt history | Owner/Admin |
| `authenticityReports` | Monthly reports | Admin only |

---

## 🔐 SECURITY RULES

**File:** [`firestore-pack384-store.rules`](firestore-pack384-store.rules)

**Key Rules:**
- ✅ Public trust scores are **publicly readable**
- ✅ Review signals recordable by authenticated users
- ✅ All detection/monitoring data is **admin-only**
- ✅ Device fingerprints readable by owners
- ✅ IP blocking is admin-only
- ✅ Store requests tracked per user

---

## 📊 FIRESTORE INDEXES

**File:** [`firestore-pack384-store.indexes.json`](firestore-pack384-store.indexes.json)

**Key Indexes:**
- Review signals by timestamp + suspicious flag
- Review signals by IP cluster + timestamp
- Abuse signals by type + status + timestamp
- Trust scores by score (descending)
- Trust scores by tier + score
- ASO metrics by timestamp + platform
- Device fingerprints by deviceId
- Fraud alerts by userId + status + timestamp

---

## 🚀 DEPLOYMENT

### Quick Start

```bash
chmod +x deploy-pack384.sh
./deploy-pack384.sh
```

### Manual Deployment

```bash
# 1. Deploy Firestore Rules
firebase deploy --only firestore:rules

# 2. Deploy Firestore Indexes
firebase deploy --only firestore:indexes

# 3. Deploy All Functions
firebase deploy --only functions

# Or deploy specific function groups:
firebase deploy --only functions:detectReviewBombing,functions:computePublicTrustScore
firebase deploy --only functions:monitorASOHealth,functions:detectPaidReviewFarms
```

### Verify Deployment

```bash
# List all functions
firebase functions:list

# Check logs
firebase functions:log

# Test a function
firebase functions:shell
> detectReviewBombing({ windowHours: 24 })
```

---

## 🔧 USAGE

### Client-Side (Mobile/Web)

```typescript
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

// Request store review (safe mode)
const requestReview = async (actionType: string) => {
  const fn = httpsCallable(functions, 'requestStoreReview');
  const result = await fn({ actionType });
  
  if (result.data.eligible && result.data.shouldShow) {
    // Show native store review prompt
    await showStoreReviewPrompt();
  }
};

// Get public trust score
const getTrustScore = async (userId: string) => {
  const fn = httpsCallable(functions, 'getPublicTrustScore');
  const result = await fn({ userId });
  return result.data; // { score, tier, factors }
};

// Record review signal (for tracking purposes)
const recordReview = async (data: {
  rating: number;
  reviewText: string;
  deviceFingerprint: string;
  ipAddress: string;
}) => {
  const fn = httpsCallable(functions, 'recordStoreReviewSignal');
  await fn(data);
};
```

### Admin Actions

```typescript
// Detect review bombing
const detectBombing = async () => {
  const fn = httpsCallable(functions, 'detectReviewBombing');
  const result = await fn({ windowHours: 24 });
  console.log('Bombing detection:', result.data);
};

// Check ASO health
const checkHealth = async () => {
  const fn = httpsCallable(functions, 'monitorASOHealth');
  const result = await fn({ platform: 'both' });
  console.log('ASO health:', result.data);
};

// Detect paid review farms
const detectFarms = async () => {
  const fn = httpsCallable(functions, 'detectPaidReviewFarms');
  const result = await fn({ windowHours: 48 });
  console.log('Farm detection:', result.data);
};

// Generate defense dossier
const generateDossier = async () => {
  const fn = httpsCallable(functions, 'generateStoreDefenseDossier');
  const result = await fn({ 
    platform: 'both',
    incidentType: 'review_bombing'
  });
  console.log('Dossier ID:', result.data.dossierId);
};

// Block IP ranges
const blockIPs = async (ranges: string[]) => {
  const fn = httpsCallable(functions, 'blockReviewFarmIPRanges');
  await fn({ ipRanges: ranges, reason: 'review_farm' });
};
```

---

## 📅 SCHEDULED FUNCTIONS

| Function | Schedule | Purpose |
|----------|----------|---------|
| `detectCopyPasteReviews` | Every 6 hours | Detect bot review patterns |
| `batchRecomputeTrustScores` | Every 24 hours | Update all trust scores |
| `scheduledASOHealthCheck` | Every 6 hours | Monitor ASO health |
| `detectCoordinatedAttack` | Every 4 hours | Detect coordinated attacks |
| `scheduledStorePolicyCheck` | Every 12 hours | Check policy violations |

---

## 🔔 ALERTS & NOTIFICATIONS

### Critical Alerts (Auto-Escalated)

1. **Review Bombing Detected (Critical)**
   - Creates support ticket
   - Generates defense dossier
   - Notifies admin team

2. **Store Policy Violation (Critical)**
   - Auto-blocks content/users
   - Escalates to compliance team
   - Logs audit trail

3. **ASO Health Critical**
   - Creates incident record
   - Alerts operations team

### Warning Alerts

- High uninstall rate
- Low conversion rate
- Negative sentiment trend
- Keyword rank drops

---

## 🎯 SUCCESS METRICS

### Review Defense
- ✅ Suspicious review detection rate
- ✅ False positive rate (<5%)
- ✅ Review bombing response time (<1 hour)

### Trust Scores
- ✅ Average trust score (target: >650)
- ✅ Low trust user percentage (<10%)
- ✅ Trust score accuracy

### ASO Health
- ✅ App store health status
- ✅ Crash rate (<5 per 1000 sessions)
- ✅ 7-day retention rate (>40%)
- ✅ Average rating (>4.0)

### Fake Review Detection
- ✅ Review farm detection accuracy (>90%)
- ✅ Coordinated attack detection (<2 hour response)
- ✅ Device emulation blocking rate

---

## 🔗 DEPENDENCIES

### Required Packs
- ✅ **PACK 277** - Wallet & Token Store (payment fraud detection)
- ✅ **PACK 296** - Audit Logs (legal trail)
- ✅ **PACK 300 + 300A** - Support & Safety (escalation)
- ✅ **PACK 301 + 301B** - Growth & Retention (user behavior)
- ✅ **PACK 302** - Fraud Detection (review fraud)
- ✅ **PACK 383** - Global Compliance (KYC/AML verification)

---

## ⚠️ IMPORTANT NOTES

### Review Request Best Practices
1. **Never spam users** - Respect the 30-day cooldown
2. **Time it right** - Only after positive experiences
3. **Check user state** - No requests during issues
4. **Respect platform limits** - Both Apple and Google have rate limits

### Trust Score Guidelines
1. **Transparent calculation** - Users should understand factors
2. **Appeal process** - Allow users to dispute low scores
3. **No discrimination** - Trust scores should not discriminate
4. **Regular updates** - Recompute periodically for accuracy

### ASO Monitoring
1. **Baseline establishment** - Monitor for 30 days before alerts
2. **Platform differences** - iOS and Android have different norms
3. **Seasonal variance** - Account for holidays and events

### Legal Compliance
1. **Data retention** - Store defense dossiers for at least 1 year
2. **GDPR compliance** - Trust scores are personal data
3. **Platform TOS** - Ensure compliance with Apple/Google policies

---

## 📈 ROADMAP

### Phase 1 (Current) ✅
- Review bombing detection
- Trust score computation
- ASO health monitoring
- Basic fake review detection

### Phase 2 (Q1 2025)
- Machine learning for sentiment analysis
- Advanced bot detection with ML
- Predictive ASO risk scoring
- Integration with external ASO tools

### Phase 3 (Q2 2025)
- Multi-language sentiment analysis
- Competitor analysis integration
- Advanced keyword tracking
- Real-time review translation

---

## 🆘 TROUBLESHOOTING

### High False Positive Rate
```typescript
// Adjust sensitivity in detection functions
const SENSITIVITY_THRESHOLD = 0.5; // Lower = less sensitive
```

### Trust Scores Not Updating
```bash
# Manually trigger batch update
firebase functions:shell
> batchRecomputeTrustScores()
```

### ASO Health Always Critical
- Check baseline metrics
- Verify crash reporting integration
- Review alert thresholds

### Review Requests Not Showing
- Verify 30-day cooldown
- Check user eligibility criteria
- Ensure no open support tickets

---

## 📞 SUPPORT

For issues or questions about PACK 384:
1. Check function logs: `firebase functions:log`
2. Review Firestore rules debugger
3. Check admin dashboard alerts
4. Consult PACK 300 support system

---

## ✅ CTO FINAL VERDICT

PACK 384 makes Avalo:
- ✅ **Resilient** to store manipulation
- ✅ **Resistant** to fake reputation attacks
- ✅ **Protected** from ASO sabotage
- ✅ **Equipped** for investor-grade public credibility

**Without this pack:**
- ❌ Growth can be silently throttled
- ❌ Store bans become existential risk
- ❌ Fake reviews damage reputation
- ❌ ASO penalties hurt discovery

---

**PACK 384 Status:** ✅ **PRODUCTION READY**

**Deployment Date:** 2025-12-30

**Next Review:** Q1 2025

**Maintainer:** CTO / Security Team

---

*End of PACK 384 Documentation*
