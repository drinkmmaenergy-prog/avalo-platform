# PACK 441 — Growth Safety Net & Viral Abuse Control

> **Protecting growth against abuse**  
> Viral loop, invitation, and referral controls to ensure growth scales without fraud, account farming, or artificial traffic.

## Quick Start

```typescript
import { initializePack441, canPerformGrowthAction, recordGrowthAction } from './pack441';

// Initialize modules
const modules = initializePack441(db);

// Check if user can send invite
const check = await canPerformGrowthAction('user-id', 'invite', modules);
if (check.allowed) {
  // Process invite
  await recordGrowthAction('user-id', 'invite', modules);
} else {
  console.log('Blocked:', check.reason);
}
```

## Modules

### 1. ViralLoopRiskScorer
Analyzes invitation patterns to distinguish organic from abusive growth.

```typescript
const riskScore = await modules.riskScorer.calculateRiskScore('user-id');
// Returns: { overallScore, classification, metadata }
```

### 2. ReferralAbuseDetector
Detects invite rings, self-referrals, and account farms.

```typescript
const signals = await modules.abuseDetector.analyzeUser('user-id');
// Returns: fraud signals and confidence score
```

### 3. AdaptiveGrowthThrottle
Dynamic limits that scale with user trust scores.

```typescript
const canInvite = await modules.throttle.canSendInvite('user-id');
const canReward = await modules.throttle.canClaimReward('user-id');
const canPayout = await modules.throttle.canProcessPayout('user-id');
```

### 4. AbuseRetentionCorrelationModel
Connects abuse patterns to churn and LTV metrics.

```typescript
const analysis = await modules.correlationModel.analyzeSource('source-id');
// Returns: quality score and recommendation (continue/monitor/throttle/disable)
```

### 5. GrowthSafetyDashboard
Admin-only monitoring and ROI analysis.

```typescript
const metrics = await modules.dashboard.getMetrics(startDate, endDate);
const alerts = await modules.dashboard.getActiveAlerts();
const summary = await modules.dashboard.getRealTimeSummary();
```

## Configuration

```typescript
const customConfig = {
  riskScoring: {
    entropyThreshold: 0.5,      // Source diversity threshold
    reuseThreshold: 5,          // Max device/IP reuse
    velocityThreshold: 10,       // Max invites per hour
    weights: { entropy: 0.35, reuse: 0.35, velocity: 0.30 }
  },
  fraudDetection: {
    ringDetectionEnabled: true,
    selfReferralCheckEnabled: true,
    farmDetectionEnabled: true,
    confidenceThreshold: 70      // Trigger action at 70% confidence
  },
  throttling: {
    defaultLimits: {
      invitesPerDay: 10,
      invitesPerWeek: 50,
      rewardsPerDay: 5,
      referralPayoutsPerMonth: 10
    },
    trustScoreScaling: true,     // Scale limits with trust score
    minimumTrustScore: 20        // Block entirely below this score
  }
};

const modules = initializePack441(db, customConfig);
```

## Data Flow

```
User Action → Throttle Check → Risk Assessment → Fraud Detection → Decision
                ↓                   ↓                  ↓              ↓
           Counter Update    Score Calculation   Signal Analysis   Allow/Block
```

## Key Metrics

- **Risk Score:** 0-100 (higher = more risky)
- **Trust Score:** 0-100 (higher = more trusted)
- **Quality Score:** 0-100 (higher = better source)
- **Confidence Score:** 0-100 (higher = more certain of fraud)

## Classifications

### Risk Classifications
- **Organic:** 0-24 (natural growth)
- **Incentivized:** 25-49 (reward-driven)
- **Suspicious:** 50-74 (concerning patterns)
- **Abusive:** 75-100 (fraud detected)

### Quality Classifications
- **High Quality:** 75-100
- **Medium Quality:** 50-74
- **Low Quality:** 25-49
- **Fraudulent:** 0-24

## Firestore Collections

| Collection | Purpose | Access |
|------------|---------|--------|
| `pack441_risk_scores` | User risk scores | User (own), Admin (all) |
| `pack441_fraud_signals` | Fraud detection results | Admin only |
| `pack441_fraud_actions` | Applied fraud actions | User (own), Admin (all) |
| `pack441_trust_scores` | User trust scores | User (own), Admin (all) |
| `pack441_throttle_configs` | Throttle configurations | User (own), Admin (all) |
| `pack441_throttle_counters` | Active counters | User (own), Admin (all) |
| `pack441_throttle_events` | Event log | User (own), Admin (all) |
| `pack441_invite_quality` | Invite quality scores | All authenticated |
| `pack441_correlations` | Source analysis | Admin only |
| `pack441_source_quality` | Source metrics | Admin only |
| `pack441_alerts` | Abuse alerts | Admin only |

## Automatic Actions

| Action | Trigger | Effect |
|--------|---------|--------|
| `reward_throttle` | Low signal | Slow reward issuance |
| `delayed_unlock` | Medium signal | Delay reward redemption |
| `soft_cap` | Self-referral | Apply per-source limits |
| `manual_review` | High signal | Flag for human review |
| `account_flag` | Farm indicators | Mark for monitoring |

## Integration Example

### In Invitation Flow

```typescript
// Before sending invite
const modules = initializePack441(db);
const check = await canPerformGrowthAction(userId, 'invite', modules);

if (!check.allowed) {
  return res.status(429).json({ 
    error: 'Rate limit exceeded',
    reason: check.reason 
  });
}

// Send invite
await sendInvitation(userId, recipientEmail);

// Record action
await recordGrowthAction(userId, 'invite', modules);
```

### In Reward Claiming

```typescript
const check = await canPerformGrowthAction(userId, 'reward', modules);

if (!check.allowed) {
  return res.status(403).json({ 
    error: 'Reward claim blocked',
    reason: check.reason 
  });
}

// Process reward
await processReward(userId, rewardId);

// Record action
await recordGrowthAction(userId, 'reward', modules);
```

### Scheduled Analysis

```typescript
import { runDailyAbuseAnalysis } from './pack441';

// Cloud Function scheduled daily at 02:00 UTC
export const dailyAbuseAnalysis = functions.pubsub
  .schedule('0 2 * * *')
  .onRun(async (context) => {
    const modules = initializePack441(admin.firestore());
    await runDailyAbuseAnalysis(modules);
  });
```

## Testing

```bash
cd functions
npm test -- pack441
```

## Deployment

```bash
chmod +x deploy-pack441.sh
./deploy-pack441.sh
```

## Monitoring

### Real-time Dashboard
```typescript
const summary = await modules.dashboard.getRealTimeSummary();
console.log(`Active Alerts: ${summary.activeAlerts}`);
console.log(`Blocked Invites (24h): ${summary.recentBlockedInvites}`);
console.log(`Avg Risk Score: ${summary.avgRiskScore}`);
console.log(`Top Issue: ${summary.topIssue}`);
```

### Export Reports
```typescript
const report = await modules.dashboard.exportDashboardData(
  new Date('2024-01-01'),
  new Date('2024-01-31')
);
// Returns: metrics, alerts, statistics, distributions
```

## Dependencies

- PACK 301B — Retention
- PACK 309 — Swipe Limits
- PACK 324B — Fraud Detection
- PACK 347 — Growth Engine
- PACK 355 — Referrals
- PACK 437 — Guardrails

## Best Practices

1. **Always check before allowing** growth actions
2. **Record every action** for audit trail
3. **Monitor dashboard** daily for anomalies
4. **Tune thresholds** based on your user base
5. **Review alerts** within 24 hours
6. **Correlate with LTV** regularly

## Troubleshooting

### High Block Rate
- Lower confidence threshold
- Increase default limits
- Review trust score distribution

### Low Detection Rate
- Lower entropy threshold
- Decrease reuse threshold
- Enable all fraud detection features

### Performance Issues
- Check index builds
- Review cache hit rates
- Consider batch processing

## Support

- **Logs:** `firebase functions:log --only pack441`
- **Alerts:** Check `pack441_alerts` collection
- **Metrics:** Use Growth Safety Dashboard

---

**Version:** v1.0  
**Status:** ACTIVE  
**Maintained by:** Avalo CTO Team
