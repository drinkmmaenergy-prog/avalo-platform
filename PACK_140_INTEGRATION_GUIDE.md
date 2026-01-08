# PACK 140 — Reputation System 2.0 Integration Guide

**Quick reference for integrating reputation tracking into existing Avalo systems**

---

## 🎯 Core Principle

Reputation tracks **professionalism and reliability** through verified activity only. It NEVER considers:
- ❌ Beauty, attractiveness, appearance
- ❌ Popularity, followers, likes
- ❌ Token spending or earnings
- ❌ Discovery ranking or visibility

---

## 📋 Integration Checklist

### PACK 136: Mentorship System

**Location:** [`functions/src/expertMarketplace.ts`](functions/src/expertMarketplace.ts:1)

**Add these imports:**
```typescript
import {
  trackMentorshipSessionCompleted,
  trackMentorshipNoShow,
  trackMentorshipLateCancellation,
  trackExpertReview,
  trackCurriculumCompleted,
  trackCurriculumModuleCompleted
} from './reputation-integrations';
```

**Hook Points:**

1. **Session Completion** (in `completeMentorshipSession` function):
```typescript
// After marking session as COMPLETED
await trackMentorshipSessionCompleted(expertId, userId, sessionId);
```

2. **Session No-Show** (in session monitoring):
```typescript
// If session time passed and not marked complete
await trackMentorshipNoShow(expertId, sessionId, 'expert');
await trackMentorshipNoShow(userId, sessionId, 'user');
```

3. **Late Cancellation** (in `cancelMentorshipSession` function):
```typescript
// If cancellation is < 24 hours before scheduled time
if (hoursUntilSession < 24) {
  await trackMentorshipLateCancellation(userId, sessionId);
}
```

4. **Expert Review** (in `leaveExpertReview` function):
```typescript
// After review submitted
const avgRating = (ratings.expertise + ratings.clarity + ratings.professionalism + ratings.helpfulness) / 4;
await trackExpertReview(expertId, reviewId, avgRating);
```

5. **Curriculum Progress** (in curriculum functions):
```typescript
// Module completed
await trackCurriculumModuleCompleted(userId, curriculumId, moduleNumber);

// Full curriculum completed
await trackCurriculumCompleted(userId, curriculumId);
```

---

### PACK 117: Events System

**Location:** [`functions/src/events.ts`](functions/src/events.ts:1)

**Add these imports:**
```typescript
import {
  trackEventAttended,
  trackEventNoShow
} from './reputation-integrations';
```

**Hook Points:**

1. **Event Check-In** (in `pack117_checkInToEvent` function):
```typescript
// After successful check-in verification
await trackEventAttended(userId, eventId);
```

2. **Event No-Show Detection** (scheduled job or manual trigger):
```typescript
// After event ends, check attendees without check-in
if (!attendee.checkedIn && event.ended) {
  await trackEventNoShow(userId, eventId);
}
```

---

### PACK 139: Clubs System

**Location:** [`functions/src/clubs.ts`](functions/src/clubs.ts:1)

**Add these imports:**
```typescript
import { trackClubParticipation } from './reputation-integrations';
```

**Hook Points:**

1. **Monthly Participation Tracking** (scheduled job):
```typescript
// Run monthly: calculate active days per member
const activeDays = await calculateMemberActiveDays(userId, clubId, last30Days);
if (activeDays >= 20) {
  await trackClubParticipation(userId, clubId, activeDays);
}
```

---

### PACK 137: Challenges System

**Location:** [`functions/src/challenges.ts`](functions/src/challenges.ts:1)

**Add these imports:**
```typescript
import { trackChallengeCompleted } from './reputation-integrations';
```

**Hook Points:**

1. **Challenge Completion** (when challenge ends):
```typescript
// After challenge ends, check completion rate
const completionRate = (participant.tasksCompleted / participant.tasksRequired) * 100;
if (completionRate >= 80) {
  await trackChallengeCompleted(userId, challengeId, completionRate);
}
```

---

### PACK 126: Safety Engine

**Location:** Safety-related files ([`functions/src/pack126-*.ts`](functions/src/pack126-consent-protocol.ts:1))

**Add these imports:**
```typescript
import {
  trackDisputeResolved,
  trackConsentViolation,
  trackHarassmentDetected,
  trackSafetyViolation
} from './reputation-integrations';
```

**Hook Points:**

1. **Dispute Resolution** (in dispute center):
```typescript
// After mediation/resolution
await trackDisputeResolved(userId, disputeId, outcome); // 'resolved' or 'unresolved'
```

2. **Consent Violations** (in consent protocol):
```typescript
// When consent violation detected
await trackConsentViolation(userId, violationId, severity); // 'minor' | 'major' | 'severe'
```

3. **Harassment Detection** (in harassment shield):
```typescript
// When shield activates at HIGH or CRITICAL
await trackHarassmentDetected(userId, caseId, level); // 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
```

4. **Safety Violations** (in safety engine):
```typescript
// When policy violation detected
await trackSafetyViolation(userId, violationType, caseId);
```

---

### PACK 130: Patrol AI

**Location:** [`functions/src/pack130-*.ts`](functions/src/pack130-patrol-ai.ts:1)

**Add these imports:**
```typescript
import {
  trackTrustFlagAdded,
  trackTrustFlagRemoved,
  trackUserReport
} from './reputation-integrations';
```

**Hook Points:**

1. **AI Flag Detection** (when AI detects issue):
```typescript
// Flag for human verification first
await trackTrustFlagAdded(userId, flagType, flagId);
// Note: This only logs, doesn't affect score until verified
```

2. **Flag Verification** (admin approves/dismisses):
```typescript
// If approved, reputation event recorded automatically via pack140_admin_verifyFlag
// If dismissed, flag removed without reputation impact
```

3. **Trust Flag Removal** (after successful appeal):
```typescript
// When flag removed after review
await trackTrustFlagRemoved(userId, flagType, flagId);
```

4. **User Reports** (when user reports another):
```typescript
// Check for weaponization before recording
await trackUserReport(reportedUserId, reporterId, reportType, reportId);
```

---

### Digital Products System

**Location:** Digital product delivery/purchase handling

**Add these imports:**
```typescript
import {
  trackProductDelivered,
  trackProductRefunded
} from './reputation-integrations';
```

**Hook Points:**

1. **Product Delivered**:
```typescript
// After successful delivery
await trackProductDelivered(creatorId, productId, transactionId);
```

2. **Product Refunded**:
```typescript
// After refund processed
await trackProductRefunded(creatorId, productId, transactionId, reason);
```

---

## 🎨 Display Integration

### Show Reputation Badge

**In creator profiles (mentorship booking, product purchase, etc.):**

```typescript
import { ReputationBadge } from '../components/ReputationBadge';
import { checkReputationRequirement } from '../services/reputationService';

// Fetch creator's reputation
const repCheck = await checkReputationRequirement(creatorId);

// Display badge (context-aware)
<ReputationBadge 
  overallScore={repCheck.currentScore}
  context="MENTORSHIP_BOOKING" // or DIGITAL_PRODUCT_PURCHASE, PAID_CLUB_JOIN, PAID_EVENT_JOIN
  variant="detailed" // or "compact"
/>
```

### Do NOT Show Reputation In:
- ❌ Discovery feed
- ❌ Swipe/match suggestions
- ❌ Search results
- ❌ Profile rankings
- ❌ Recommendation algorithms

---

## ⚙️ Configuration

### Score Impact Customization

Edit [`functions/src/types/reputation.types.ts`](functions/src/types/reputation.types.ts:366):

```typescript
export const REPUTATION_SCORE_IMPACTS: Record<ReputationEventType, number> = {
  SESSION_ATTENDED: 2,        // Adjust as needed
  SESSION_NO_SHOW: -8,        // Adjust as needed
  // ... etc
};
```

### Minimum Score Floor

Default: 40 (user can never drop below 40 from user ratings alone)

To change, edit [`functions/src/reputation-system.ts`](functions/src/reputation-system.ts:107):

```typescript
const minimumScoreFloor = 40; // Adjust if needed
```

### Recovery Program Duration

Default: 30 days of good behavior

To change, edit [`functions/src/reputation-system.ts`](functions/src/reputation-system.ts:540):

```typescript
requiredStreak: 30, // Days of good behavior
targetPoints: 50,   // Points needed
```

---

## 🔧 Testing Integration

### Test Event Recording

```typescript
import { recordReputationEvent } from './reputation-system';
import { ReputationEventType } from './types/reputation.types';

// Test function
async function testReputationIntegration() {
  await recordReputationEvent({
    userId: 'test-user-123',
    eventType: ReputationEventType.SESSION_ATTENDED,
    context: {
      type: 'mentorship_session',
      referenceId: 'session-456',
      description: 'Test session completion'
    },
    source: 'test_integration'
  });
  
  // Check score updated
  const score = await getReputationScore('test-user-123');
  console.log('Updated score:', score);
}
```

### Verify No Economic Impact

```typescript
// Confirm reputation does not affect:
const tokenPrice = await getTokenPrice(); // Should be unchanged
const creatorSplit = await getRevenueSplit(); // Should be 65/35
const discoveryRank = await getDiscoveryRank(userId); // Should be unchanged
```

---

## 📊 Monitoring Integration

### Log Events

All reputation events are automatically logged to `reputation_events` collection.

### Track Metrics

```typescript
// Daily metric collection
const totalEvents = await db.collection('reputation_events')
  .where('createdAt', '>', last24Hours)
  .get().size;

const eventsByType = await getEventDistribution();
const averageScore = await getAverageUserScore();
```

---

## ⚠️ Important Notes

1. **Call Integration Functions AFTER Core Action**
   - Record event AFTER session completes, not before
   - Track attendance AFTER check-in verified
   - Award points AFTER curriculum completion confirmed

2. **Handle Errors Gracefully**
   - If reputation recording fails, log but don't block core action
   - Wrap in try-catch to prevent breaking main flow

3. **Respect Anti-Weaponization**
   - System automatically detects mass report campaigns
   - Blocked reporters are ignored
   - AI flags require human verification

4. **Never Override Score Directly**
   - Always use `recordReputationEvent`
   - System recalculates automatically
   - Manual overrides are admin-only

5. **Test Thoroughly**
   - Verify events recorded correctly
   - Confirm score calculations accurate
   - Check no impact on discovery/pricing
   - Validate anti-weaponization works

---

## 🚀 Deployment Order

1. Deploy reputation functions first
2. Deploy security rules and indexes
3. Add integration hooks to existing systems
4. Test each integration individually
5. Deploy mobile app with reputation UI
6. Monitor for issues

---

## 📞 Support

If integration issues arise:
1. Check Cloud Functions logs
2. Verify event recording succeeded
3. Confirm score calculation triggered
4. Review Firestore security rules
5. Check for integration hook errors

---

**Implementation Complete:** November 28, 2025  
**Status:** PRODUCTION-READY ✨