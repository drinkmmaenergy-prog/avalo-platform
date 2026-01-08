# PACK 104 — Anti-Ring & Anti-Collusion Detection Implementation

**Status**: ✅ COMPLETE  
**Date**: 2025-11-26  
**Version**: 1.0.0

---

## 📋 Overview

PACK 104 implements a comprehensive fraud detection system to identify and neutralize:
- **Collusion rings**: Groups coordinating to manipulate earnings
- **Artificial paid-interaction inflation**: Fake payers boosting creators
- **Commercial spam networks**: Bot-like accounts posing as real profiles
- **Coordinated rule-violating activity**: Multi-account abuse patterns

## 🎯 Core Principles (NON-NEGOTIABLE)

✅ **Token price per unit never changes**  
✅ **Revenue split always 65% creator / 35% Avalo**  
✅ **No punishment fees, appeal fees, or paid enforcement bypass**  
✅ **Detection never reduces already-completed legitimate earnings**  
✅ **Only restricts future abuse potential**

---

## 🏗️ Architecture

### Component Structure

```
pack104-types.ts              → Type definitions and configs
pack104-fraudGraph.ts         → Fraud graph edge management
pack104-collusionDetection.ts → Collusion ring detection
pack104-spamDetection.ts      → Commercial spam clustering
pack104-enforcement.ts        → Graduated enforcement logic
pack104-caseManagement.ts     → Moderation case generation
pack104-scheduled.ts          → Automated detection jobs
pack104-notifications.ts      → User-facing messages
```

### Data Model

#### Firestore Collections

```typescript
// Fraud Graph
fraud_graph_edges/
  {edgeId}/
    userA: string
    userB: string
    edgeType: 'DEVICE' | 'NETWORK' | 'PAYMENT' | 'BEHAVIOR' | 'SOCIAL' | 'ENFORCEMENT'
    weight: number (0-1)
    metadata: object
    lastSeenAt: timestamp

// Collusion Rings
collusion_rings/
  {ringId}/
    memberUserIds: string[]
    ringSize: number
    collusionProbability: number (0-1)
    riskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'
    characteristics: object
    signals: array
    status: 'DETECTED' | 'UNDER_REVIEW' | 'CONFIRMED' | 'FALSE_POSITIVE'

// Commercial Spam Clusters
commercial_spam_clusters/
  {clusterId}/
    memberUserIds: string[]
    clusterSize: number
    spamProbability: number (0-1)
    riskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'
    characteristics: object
    signals: array
    status: 'DETECTED' | 'UNDER_REVIEW' | 'CONFIRMED' | 'FALSE_POSITIVE'

// Enforcement Actions
collusion_enforcement_actions/
  {actionId}/
    targetUserId: string
    enforcementLevel: 'NONE' | 'VISIBILITY_REDUCED' | 'MONETIZATION_THROTTLED' | 'MANUAL_REVIEW_REQUIRED'
    reason: string
    appliedAt: timestamp
    expiresAt: timestamp (nullable)
    reversedAt: timestamp (nullable)

// Moderation Cases
cluster_moderation_cases/
  {caseId}/
    caseType: 'COLLUSION_RING' | 'COMMERCIAL_SPAM_CLUSTER'
    linkedUserIds: string[]
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'ESCALATED'
    evidenceSummary: object
```

---

## 🔍 Detection Algorithms

### 1. Fraud Graph Construction

**Edge Types and Weights:**

| Edge Type | Weight | Description |
|-----------|--------|-------------|
| DEVICE | 1.0 | Strongest: Shared device ID |
| ENFORCEMENT | 0.9 | Very strong: Enforcement correlation |
| PAYMENT | 0.3-0.9 | Variable: Based on transaction frequency |
| NETWORK | 0.7 | Strong: Shared IP/network |
| BEHAVIOR | 0.0-1.0 | Variable: Behavioral similarity score |
| SOCIAL | 0.0-1.0 | Variable: Audience overlap percentage |

**Edge Decay:**
- Edges not reinforced in 30 days decay by 5% per period
- Edges below 0.1 weight are automatically removed

### 2. Collusion Ring Detection

**Algorithm:** Connected component analysis + risk scoring

**Detection Criteria:**
- Minimum ring size: 3 users
- Strong edge threshold: 0.7 weight
- High isolation score: >80% internal connections

**Risk Scoring (0-100%):**

```typescript
Score Components:
- Shared devices (up to 40%)
- Payment loops (up to 30%)
- Network isolation (up to 20%)
- Edge strength (up to 10%)
- Multiple signals bonus (+10%)
```

**Risk Levels:**
- **LOW**: 30-60% probability
- **MEDIUM**: 60-85% probability
- **HIGH**: >85% probability

### 3. Commercial Spam Cluster Detection

**Algorithm:** Time-window clustering + similarity analysis

**Detection Criteria:**
- Account creation window: ≤48 hours
- Bio similarity: ≥70%
- Profile similarity: ≥60%
- Mass messaging: ≥50 outbound messages
- Reply rate: ≤10%
- KYC progression: ≤20%

**Risk Scoring:**

```typescript
Score Components:
- Rapid creation (up to 30%)
- Bio/profile similarity (up to 25%)
- Mass messaging (up to 20%)
- Low engagement (up to 15%)
- No KYC (up to 10%)
- Multiple signals bonus (+10%)
```

---

## ⚖️ Enforcement Logic

### Graduated Enforcement Levels

| Level | Action | Duration | Trigger |
|-------|--------|----------|---------|
| **NONE** | No action | N/A | Risk below 30% |
| **VISIBILITY_REDUCED** | Lower discovery ranking | 72 hours | LOW risk (30-60%) |
| **MONETIZATION_THROTTLED** | Temporary earning restrictions | 7 days | MEDIUM risk (60-85%) |
| **MANUAL_REVIEW_REQUIRED** | Hard block until review | Indefinite | HIGH risk (>85%) |

### Enforcement Flow

```
1. Detection Job Runs (Daily)
   ↓
2. Ring/Cluster Identified
   ↓
3. Risk Score Calculated
   ↓
4. Enforcement Level Determined
   ↓
5. Apply to All Members
   ↓
6. Create Moderation Case
   ↓
7. Notify Users (Generic Message)
   ↓
8. Human Review (if HIGH risk)
   ↓
9. Resolution or Appeal
```

### What Gets Restricted

| Level | Discovery | Messaging | Monetization | Profile |
|-------|-----------|-----------|--------------|---------|
| VISIBILITY_REDUCED | ⚠️ Reduced | ✅ Normal | ✅ Normal | ✅ Visible |
| MONETIZATION_THROTTLED | ⚠️ Reduced | ✅ Normal | ⚠️ Throttled | ✅ Visible |
| MANUAL_REVIEW_REQUIRED | ❌ Hidden | ⚠️ Limited | ❌ Blocked | ⚠️ Shadow |

**Critical Guarantee:** Already-earned tokens are NEVER affected.

---

## 📅 Scheduled Jobs

### Job Schedule

```typescript
updateFraudGraphEdges()        // Daily at 2 AM UTC
detectCollusionRingsJob()      // Daily at 3 AM UTC
detectCommercialSpamClustersJob() // Daily at 4 AM UTC
cleanupExpiredEnforcementsJob() // Every 6 hours
cleanupOldDataJob()            // Weekly on Sundays at 1 AM UTC
```

### Manual Trigger Functions (Admin Only)

```typescript
// Cloud Functions
triggerRingDetection()
triggerSpamDetection()
```

---

## 📱 Mobile Integration

### Updated Components

**app-mobile/app/enforcement/info.tsx**
- Added new reason codes:
  - `COLLUSION_RISK`
  - `COLLUSION_RISK_LOW`
  - `COLLUSION_RISK_MEDIUM`
  - `COLLUSION_RISK_HIGH`
  - `COMMERCIAL_SPAM_RISK`

### User-Facing Messages

**Visibility Reduced:**
```
Your account visibility has been temporarily adjusted while we 
review recent activity patterns. You can continue using Avalo normally.
```

**Monetization Throttled:**
```
Your ability to use some features has been temporarily limited 
while we review activity linked to your account. This is a 
precautionary measure and will be resolved after review.
```

**Manual Review Required:**
```
Your account is currently under review due to unusual activity 
patterns detected by our security systems. Some features are 
temporarily restricted until the review is complete.
```

**Key Principles:**
- ✅ Never reveal other cluster members
- ✅ Never reveal specific detection methods
- ✅ Always provide appeal option
- ✅ Messages are generic and neutral

---

## 🔧 Configuration

### Collusion Detection Config

```typescript
DEFAULT_COLLUSION_CONFIG = {
  minRingSize: 3,
  strongEdgeThreshold: 0.7,
  isolationThreshold: 0.8,
  lowRiskThreshold: 0.3,
  mediumRiskThreshold: 0.6,
  highRiskThreshold: 0.85,
  edgeDecayDays: 30,
}
```

### Spam Detection Config

```typescript
DEFAULT_SPAM_CLUSTER_CONFIG = {
  maxCreationWindow: 48,         // hours
  minBioSimilarity: 0.7,
  minProfileSimilarity: 0.6,
  minOutboundMessages: 50,
  maxReplyRate: 0.1,             // 10%
  maxKycProgressRate: 0.2,       // 20%
  lowRiskThreshold: 0.3,
  mediumRiskThreshold: 0.6,
  highRiskThreshold: 0.85,
}
```

---

## 🔌 Integration Points

### Creating Graph Edges

```typescript
// From transaction events
import { createPaymentEdge } from './pack104-fraudGraph';

await createPaymentEdge(payerId, receiverId, {
  transactionId: 'tx_123',
  amount: 100,
  timestamp: now,
});
```

```typescript
// From device trust events
import { createDeviceEdge } from './pack104-fraudGraph';

await createDeviceEdge(userA, userB, deviceId);
```

```typescript
// From network signals
import { createNetworkEdge } from './pack104-fraudGraph';

await createNetworkEdge(userA, userB, ipHash);
```

### Checking Enforcement Status

```typescript
import { hasActiveEnforcement } from './pack104-enforcement';

const { hasEnforcement, level, reason } = 
  await hasActiveEnforcement(userId);

if (hasEnforcement) {
  // Show enforcement banner
  // Restrict features based on level
}
```

### Analyzing User Risk

```typescript
import { analyzeUserForCollusion } from './pack104-collusionDetection';
import { analyzeUserForSpamCluster } from './pack104-spamDetection';

const collusionAnalysis = await analyzeUserForCollusion(userId);
const spamAnalysis = await analyzeUserForSpamCluster(userId);

if (collusionAnalysis.inRing || spamAnalysis.inCluster) {
  // User is flagged
}
```

---

## 🛡️ Safety Guarantees

### Privacy Protection

1. **Never reveal cluster members**
   - Users only see their own status
   - No information about connected accounts
   - Generic "activity patterns" messaging

2. **Method opacity**
   - Detection algorithms not revealed
   - No specific edge types mentioned
   - Prevents gaming the system

### Fairness

1. **False positive handling**
   - All HIGH risk cases require human review
   - Appeal system for all enforcement levels
   - Automatic expiry for temporary restrictions

2. **Graduated response**
   - Starts with soft restrictions
   - Progressive escalation based on evidence
   - Manual review before permanent action

### Financial Protection

1. **Earnings preservation**
   - Completed earnings NEVER reversed
   - No retroactive penalties
   - Only future earning potential restricted

2. **No paid bypass**
   - Cannot pay to remove restrictions
   - No "appeal fees" or "clearance fees"
   - Appeals are always free

---

## 📊 Monitoring & Observability

### Key Metrics to Track

```typescript
// Detection Metrics
- Rings detected per day
- Clusters detected per day
- False positive rate
- Time to resolution

// Enforcement Metrics
- Active enforcements by level
- Expired enforcements per day
- Appeal rate
- Appeal success rate

// Graph Metrics
- Total edges
- Average edge weight
- Edge decay rate
- Graph density
```

### Logging

All enforcement actions are logged to:
- `collusion_enforcement_actions` collection
- `cluster_moderation_cases` collection
- Trust profile updates

---

## 🧪 Testing

### Unit Testing

```typescript
// Test collusion detection
const mockRing = {
  memberUserIds: ['user1', 'user2', 'user3'],
  characteristics: {
    sharedDevices: 2,
    isolationScore: 0.9,
  },
};

const probability = calculateCollusionProbability(mockRing);
expect(probability).toBeGreaterThan(0.7);
```

### Integration Testing

```typescript
// Test end-to-end flow
1. Create fraud graph edges
2. Run detection job
3. Verify ring/cluster created
4. Verify enforcement applied
5. Verify moderation case opened
6. Verify user notification sent
```

---

## 🚀 Deployment Checklist

- [ ] Deploy backend functions
- [ ] Deploy scheduled jobs
- [ ] Update Firestore indexes
- [ ] Update security rules
- [ ] Deploy mobile app update
- [ ] Monitor error logs for 48 hours
- [ ] Review initial detection results
- [ ] Adjust thresholds if needed

### Firestore Indexes Required

```
fraud_graph_edges:
- userA (ASC), userB (ASC)
- weight (DESC)
- lastSeenAt (ASC)

collusion_rings:
- status (ASC), riskLevel (DESC), collusionProbability (DESC)
- memberUserIds (ARRAY)

commercial_spam_clusters:
- status (ASC), riskLevel (DESC), spamProbability (DESC)
- memberUserIds (ARRAY)

cluster_moderation_cases:
- status (ASC), priority (DESC), openedAt (ASC)
- assignedTo (ASC), status (ASC)
```

---

## 📝 Maintenance

### Weekly Tasks
- Review false positive rate
- Audit high-priority cases
- Check edge decay performance
- Validate threshold effectiveness

### Monthly Tasks
- Analyze detection accuracy
- Review appeal outcomes
- Adjust configuration if needed
- Clean up resolved cases

### Quarterly Tasks
- Full system audit
- Algorithm effectiveness review
- Update documentation
- Security assessment

---

## 🎓 Training Materials

### For Moderators

**What is PACK 104?**
An automated system that detects coordinated abuse by creating a "social graph" of suspicious connections between accounts.

**What should I look for in cases?**
- Unusual device/network sharing patterns
- Closed-loop payment behavior
- Rapid account creation with similar profiles
- Mass messaging with low engagement

**How to resolve cases?**
1. Review evidence summary
2. Check graph snapshot
3. Investigate user histories
4. Make determination: NO_ACTION, SOFT_RESTRICTION, or SUSPENSION
5. Document reasoning clearly

---

## 📞 Support

### For Users

**Help Center Articles:**
- Why was my account visibility reduced?
- Why are my features limited?
- Account under review
- How to submit an appeal

**Support Contact:**
- In-app: Settings → Help Center → Contact Support
- Email: support@avalo.app
- Expected response: 24-48 hours

### For Developers

**Documentation:**
- Type definitions: [`pack104-types.ts`](functions/src/pack104-types.ts)
- API reference: This document
- Integration guide: See "Integration Points" section

**Questions:**
- Internal Slack: #pack104-support
- Code reviews: Tag @safety-team

---

## ✅ Implementation Complete

All components of PACK 104 are implemented and ready for deployment:

✅ Fraud graph edge management  
✅ Collusion ring detection algorithm  
✅ Commercial spam cluster detection  
✅ Graduated enforcement system  
✅ Case generation and prioritization  
✅ Scheduled job automation  
✅ User notification templates  
✅ Mobile app integration  
✅ Privacy and safety guarantees  

**No token economy changes**  
**No pricing or revenue split modifications**  
**No paid enforcement bypass mechanisms**  

System is production-ready and complies with all non-negotiable requirements.

---

**End of Implementation Document**