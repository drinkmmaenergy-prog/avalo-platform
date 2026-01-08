# PACK 384 — Quick Start Guide

**App Store Defense, Reviews, Reputation & Trust Engine**

---

## 🚀 5-Minute Setup

### Step 1: Deploy PACK 384

```bash
# Make deployment script executable
chmod +x deploy-pack384.sh

# Run deployment
./deploy-pack384.sh
```

This will:
- ✅ Deploy Firestore rules
- ✅ Deploy Firestore indexes
- ✅ Deploy all cloud functions
- ✅ Set up scheduled jobs

### Step 2: Verify Deployment

```bash
# Check all functions are live
firebase functions:list | grep pack384

# View function logs
firebase functions:log --only detectReviewBombing
```

### Step 3: Initialize Trust Scores

Run initial trust score computation for existing users:

```typescript
// In Firebase Console or Functions Shell
const fn = httpsCallable(functions, 'batchRecomputeTrustScores');
await fn();
```

### Step 4: Access Admin Dashboard

Navigate to: `/admin/store-defense`

You should see:
- ASO Health Status
- Review Bombing Alerts
- Trust Score Distribution
- Active Threats

---

## 📱 Client Integration

### Request Store Review (Mobile)

```typescript
// app-mobile/lib/store-review.ts
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import * as StoreReview from 'expo-store-review';

export async function requestReviewIfEligible(actionType: string) {
  try {
    const fn = httpsCallable(functions, 'requestStoreReview');
    const result = await fn({ actionType });
    
    if (result.data.eligible && result.data.shouldShow) {
      // Show native store review prompt
      const available = await StoreReview.isAvailableAsync();
      if (available) {
        await StoreReview.requestReview();
      }
    }
  } catch (error) {
    console.error('Review request failed:', error);
  }
}

// Usage examples:
// After successful chat
await requestReviewIfEligible('completed_chat');

// After successful meeting
await requestReviewIfEligible('completed_meeting');

// After successful payout
await requestReviewIfEligible('successful_payout');

// After 7-day retention
await requestReviewIfEligible('7d_retention');
```

### Display Trust Score (Public Profile)

```typescript
// app-mobile/components/TrustBadge.tsx
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

export function TrustBadge({ userId }: { userId: string }) {
  const [trustScore, setTrustScore] = useState(null);
  
  useEffect(() => {
    const loadTrust = async () => {
      const fn = httpsCallable(functions, 'getPublicTrustScore');
      const result = await fn({ userId });
      setTrustScore(result.data);
    };
    loadTrust();
  }, [userId]);
  
  if (!trustScore) return null;
  
  const tierColors = {
    untrusted: 'bg-red-500',
    new: 'bg-gray-400',
    bronze: 'bg-amber-700',
    silver: 'bg-gray-300',
    gold: 'bg-yellow-400',
    platinum: 'bg-blue-400'
  };
  
  return (
    <div className={`px-3 py-1 rounded-full ${tierColors[trustScore.tier]}`}>
      <span className="text-white font-semibold capitalize">
        {trustScore.tier} • {trustScore.score}
      </span>
    </div>
  );
}
```

---

## 🎯 Common Admin Tasks

### 1. Check for Review Bombing

```typescript
// In admin dashboard or functions shell
const detectFn = httpsCallable(functions, 'detectReviewBombing');
const result = await detectFn({ windowHours: 24 });

console.log('Detected:', result.data.detected);
console.log('Severity:', result.data.severity);
console.log('Reasons:', result.data.reasons);
```

### 2. Monitor ASO Health

```typescript
const healthFn = httpsCallable(functions, 'monitorASOHealth');
const health = await healthFn({ platform: 'both' });

console.log('Health:', health.data.health);
console.log('Alerts:', health.data.alerts);
console.log('Crash Rate:', health.data.crashRate);
```

### 3. Detect Paid Review Farms

```typescript
const farmFn = httpsCallable(functions, 'detectPaidReviewFarms');
const farms = await farmFn({ windowHours: 48 });

console.log('Confidence:', farms.data.confidenceScore);
console.log('Severity:', farms.data.severity);
console.log('VPN Clusters:', farms.data.vpnClusters);
```

### 4. Generate Defense Dossier

```typescript
// When you need to submit evidence to Apple/Google
const dossierFn = httpsCallable(functions, 'generateStoreDefenseDossier');
const dossier = await dossierFn({
  platform: 'ios', // or 'android' or 'both'
  incidentType: 'review_bombing'
});

console.log('Dossier ID:', dossier.data.dossierId);
console.log('Summary:', dossier.data.summary);
```

### 5. Block Malicious IP Ranges

```typescript
const blockFn = httpsCallable(functions, 'blockReviewFarmIPRanges');
await blockFn({
  ipRanges: ['192.168.1.', '10.0.0.'],
  reason: 'coordinated_review_attack'
});
```

---

## 📊 Monitoring Schedule

### Automatic Checks
- ✅ **Every 4 hours**: Coordinated attack detection
- ✅ **Every 6 hours**: Copy-paste review detection
- ✅ **Every 6 hours**: ASO health check
- ✅ **Every 12 hours**: Store policy monitoring
- ✅ **Every 24 hours**: Trust score batch update

### Manual Checks (Recommended)
- 📅 **Daily**: Review admin dashboard
- 📅 **Weekly**: Generate authenticity report
- 📅 **Monthly**: Review trust score distribution

---

## 🚨 Critical Alerts

### What Triggers Escalation?

1. **Review Bombing (Critical)**
   - Velocity spike >5x
   - >30% suspicious accounts
   - Negative sentiment cascade

2. **Store Policy Violation (Critical)**
   - Confirmed fraud patterns
   - Privacy violations
   - Minor protection issues

3. **ASO Health (Critical)**
   - Crash rate >10 per 1000
   - >50% negative reviews in 24h
   - Retention <20%

### Where Alerts Go

- ✅ `storeSafetyAlerts` collection
- ✅ Support ticket (PACK 300)
- ✅ Email to admin team
- ✅ Slack notification (if configured)

---

## 🎓 Best Practices

### Review Requests
```typescript
// ✅ DO: Request after positive experiences
await requestReviewIfEligible('completed_meeting');

// ❌ DON'T: Spam users
// Already rate-limited to 1 per 30 days

// ✅ DO: Check user state
// System auto-checks: no churn risk, no open tickets

// ❌ DON'T: Request after failed transactions
// System auto-blocks these
```

### Trust Scores
```typescript
// ✅ DO: Display trust badges publicly
<TrustBadge userId={userId} />

// ✅ DO: Use in discovery rankings
// System auto-applies via applyTrustScoreToRankings()

// ❌ DON'T: Discriminate based solely on trust
// Use as one factor among many

// ✅ DO: Allow users to improve scores
// Scores update based on behavior
```

### ASO Monitoring
```typescript
// ✅ DO: Establish baselines first
// Monitor for 30 days before enabling alerts

// ✅ DO: Account for seasonality
// Holidays may have different patterns

// ❌ DON'T: Over-react to small changes
// System uses statistical thresholds

// ✅ DO: Correlate with marketing campaigns
// Track when you run ads/promotions
```

---

## 🐛 Troubleshooting

### "Review requests not showing"

**Check:**
1. User hasn't requested in last 30 days
2. No failed transactions in last 7 days
3. User not in churn-risk state
4. No open support tickets
5. Platform rate limits not exceeded

**Debug:**
```typescript
const fn = httpsCallable(functions, 'requestStoreReview');
const result = await fn({ actionType: 'test' });
console.log('Eligible:', result.data.eligible);
console.log('Reason:', result.data.reason);
```

### "Trust scores not updating"

**Fix:**
```bash
# Manually trigger batch update
firebase functions:shell
> batchRecomputeTrustScores()

# Or for specific user
> computePublicTrustScore({ userId: 'USER_ID_HERE' })
```

### "High false positive rate in review detection"

**Adjust sensitivity:**
```typescript
// In pack384-review-defense.ts
// Increase thresholds for suspicious detection
const SUSPICIOUS_THRESHOLD = 0.5; // Increase to 0.7 for less sensitivity
```

### "ASO health always shows critical"

**Check baselines:**
```typescript
// View recent metrics
const metrics = await db.collection('asoHealthMetrics')
  .orderBy('timestamp', 'desc')
  .limit(10)
  .get();

metrics.forEach(doc => console.log(doc.data()));
```

---

## 📈 Success Checklist

After 7 days of operation, verify:

- [ ] Trust scores computed for all active users
- [ ] ASO health checks running every 6 hours
- [ ] No critical alerts unaddressed
- [ ] Review bombing detection tested
- [ ] Admin dashboard accessible
- [ ] At least 1 genuine review request sent
- [ ] Baseline metrics established
- [ ] Team trained on alert response

---

## 🔗 Quick Links

- **Main Documentation**: [`PACK_384_APP_STORE_DEFENSE_ENGINE.md`](PACK_384_APP_STORE_DEFENSE_ENGINE.md)
- **Deployment Script**: [`deploy-pack384.sh`](deploy-pack384.sh)
- **Firestore Rules**: [`firestore-pack384-store.rules`](firestore-pack384-store.rules)
- **Indexes**: [`firestore-pack384-store.indexes.json`](firestore-pack384-store.indexes.json)
- **Admin Dashboard**: [`admin-web/store-defense/StoreDefenseDashboard.tsx`](admin-web/store-defense/StoreDefenseDashboard.tsx)

---

## 💡 Pro Tips

1. **Baseline Period**: Run for 30 days before enabling aggressive alerts
2. **Review Timing**: Request reviews within 24h of positive experiences
3. **Trust Display**: Show trust badges on all public profiles
4. **Regular Audits**: Review defense dossiers monthly
5. **Team Training**: Ensure support team knows how to respond to alerts

---

## 🆘 Need Help?

1. Check function logs: `firebase functions:log`
2. Review admin dashboard alerts
3. Consult main documentation
4. Contact security team
5. Check PACK 300 support tickets

---

**PACK 384 is now protecting your app store presence!** 🛡️

*Last Updated: 2025-12-30*
