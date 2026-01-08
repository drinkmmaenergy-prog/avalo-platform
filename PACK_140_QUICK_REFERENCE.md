# PACK 140 — Reputation System 2.0 Quick Reference

**One-page developer guide for reputation system**

---

## 🎯 What Is It?

Professional reputation tracking based on **verified activity only** - never beauty, popularity, or spending.

### The 5 Dimensions

| Icon | Dimension | What It Tracks |
|------|-----------|----------------|
| ⏰ | **Reliability** | Shows up on time, keeps commitments |
| 💬 | **Communication** | Resolves disputes, professional conduct |
| ✅ | **Delivery** | Completes services, delivers products |
| 🎓 | **Expertise** | Finishes curricula, receives good reviews |
| 🛡️ | **Safety** | No violations, maintains safety compliance |

**Overall Score** = Average of 5 dimensions (0-100)

---

## 🔗 Quick Integration

### Record an Event

```typescript
import { recordReputationEvent } from './reputation-system';
import { ReputationEventType } from './types/reputation.types';

await recordReputationEvent({
  userId: 'user-123',
  eventType: ReputationEventType.SESSION_COMPLETED,
  context: {
    type: 'mentorship_session',
    referenceId: 'session-456',
    description: 'Session completed successfully'
  },
  source: 'pack136_mentorship'
});
```

### Use Integration Helpers

```typescript
import { trackMentorshipSessionCompleted } from './reputation-integrations';

// Simpler one-liner
await trackMentorshipSessionCompleted(expertId, userId, sessionId);
```

### Display Reputation Badge

```typescript
import { ReputationBadge } from '../components/ReputationBadge';

<ReputationBadge 
  overallScore={85}
  context="MENTORSHIP_BOOKING"
  variant="detailed"
/>
```

---

## 📊 Common Event Types

| Event | Impact | Use When |
|-------|--------|----------|
| `SESSION_ATTENDED` | +2 | User shows up for scheduled session |
| `SESSION_NO_SHOW` | -8 | User misses session without notice |
| `SESSION_COMPLETED` | +3 | Session successfully finished |
| `DISPUTE_RESOLVED` | +5 | Dispute settled positively |
| `PRODUCT_DELIVERED` | +3 | Digital product delivered |
| `PRODUCT_REFUNDED` | -8 | Product refunded to buyer |
| `CURRICULUM_COMPLETED` | +10 | Full curriculum finished |
| `CHALLENGE_COMPLETED` | +5 | Challenge finished (80%+ completion) |
| `NO_SAFETY_INCIDENTS` | +1 | 30 days without violations |
| `SAFETY_VIOLATION` | -10 | Safety policy broken |
| `CONSENT_VIOLATION` | -15 | Consent not respected |
| `HARASSMENT_DETECTED` | -20 | Harassment behavior found |

---

## 🎨 Where to Show Reputation

### ✅ SHOW in these contexts:
- Mentorship booking screens
- Digital product purchase pages
- Paid club join screens
- Paid event registration pages

### ❌ DON'T SHOW in:
- Discovery feed
- Swipe/match interfaces
- Search results
- Profile rankings
- Recommendation algorithms

---

## 🔧 API Functions

### User Functions

```typescript
// Get user's own score
const score = await getReputationScore();

// Get detailed insights
const insights = await getReputationInsights();

// Check if target user meets requirement
const check = await checkReputationRequirement(targetUserId, 60);

// Start recovery program
await startRecovery('RELIABILITY');
```

### Integration Functions

```typescript
// Mentorship
await trackMentorshipSessionCompleted(expertId, userId, sessionId);
await trackMentorshipNoShow(userId, sessionId, 'user');
await trackExpertReview(expertId, reviewId, averageRating);

// Events
await trackEventAttended(userId, eventId);
await trackEventNoShow(userId, eventId);

// Safety
await trackConsentViolation(userId, violationId, 'severe');
await trackHarassmentDetected(userId, caseId, 'HIGH');
await trackSafetyViolation(userId, 'inappropriate_content', caseId);

// Products
await trackProductDelivered(creatorId, productId, transactionId);
await trackProductRefunded(creatorId, productId, transactionId, reason);
```

---

## 🛡️ Anti-Weaponization Features

| Protection | How It Works |
|------------|--------------|
| **Blocked Reporters** | Users who weaponize reporting are ignored |
| **Mass Campaign Detection** | 5+ reports in 1 hour = campaign flagged |
| **Score Floor** | Never drops below 40 from user ratings alone |
| **AI Flag Verification** | AI Patrol flags require human approval first |
| **Competitive Protection** | Creators can't mass-downvote rivals |

---

## 📋 Integration Checklist

- [ ] Import integration helpers
- [ ] Add event tracking after core actions
- [ ] Test events recorded correctly
- [ ] Verify score calculations
- [ ] Confirm no economic impact
- [ ] Add reputation badge to booking screens
- [ ] Ensure NOT shown in discovery
- [ ] Handle errors gracefully
- [ ] Monitor event volumes
- [ ] Test anti-weaponization

---

## ⚠️ Non-Negotiables

### NEVER:
- ❌ Use reputation to affect token pricing
- ❌ Give reputation bonuses or discounts
- ❌ Boost discovery ranking based on reputation
- ❌ Show reputation in feed or profiles
- ❌ Allow purchasing reputation improvements
- ❌ Judge users on attractiveness or appearance
- ❌ Track popularity or follower metrics
- ❌ Create unfair monetization advantages

### ALWAYS:
- ✅ Track verified professional activity only
- ✅ Show reputation in trust contexts only
- ✅ Allow recovery through good behavior
- ✅ Protect against weaponized reporting
- ✅ Maintain score transparency
- ✅ Respect 40-point floor for users
- ✅ Require human verification for AI flags
- ✅ Keep token economy untouched

---

## 🔍 Debugging

### Check if event recorded:
```typescript
// View in Firebase Console
// Collection: reputation_events
// Filter by: userId == 'user-123'
```

### Check score calculated:
```typescript
// View in Firebase Console
// Collection: reputation_scores
// Document: userId
```

### Check integration working:
```typescript
// Cloud Functions logs
// Search for: "Reputation event recorded"
```

### Common Issues:

| Issue | Solution |
|-------|----------|
| Event not recorded | Check authentication, verify source parameter |
| Score not updating | Check if calculateReputationScore called |
| Badge not showing | Verify context is trust-relevant |
| Integration errors | Wrap in try-catch, log errors |

---

## 📞 Quick Help

**Files to Check:**
- Types: [`functions/src/types/reputation.types.ts`](functions/src/types/reputation.types.ts:1)
- Core: [`functions/src/reputation-system.ts`](functions/src/reputation-system.ts:1)
- Functions: [`functions/src/reputation-endpoints.ts`](functions/src/reputation-endpoints.ts:1)
- Integration: [`functions/src/reputation-integrations.ts`](functions/src/reputation-integrations.ts:1)
- Mobile Service: [`app-mobile/services/reputationService.ts`](app-mobile/services/reputationService.ts:1)
- UI Component: [`app-mobile/app/components/ReputationBadge.tsx`](app-mobile/app/components/ReputationBadge.tsx:1)

**Collections:**
- `reputation_scores` - User scores
- `reputation_events` - All events
- `reputation_history` - User timeline
- `reputation_protection` - Anti-weaponization
- `reputation_recovery` - Recovery programs

---

**Version:** 1.0.0  
**Status:** Production-Ready ✨  
**Last Updated:** November 28, 2025