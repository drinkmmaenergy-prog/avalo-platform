# PACK 301 — Growth & Retention Engine Implementation Guide

**Status:** 🟡 In Progress (Core Infrastructure Complete)  
**Version:** 1.0.0  
**Last Updated:** 2025-12-09

---

## Overview

PACK 301 implements Avalo's comprehensive user growth and retention system, including:

- ✅ **Onboarding Funnels** - Track user progress through signup to first meaningful action
- ✅ **Habit-Building Nudges** - Context-aware micro-prompts to increase engagement
- ✅ **Re-engagement Campaigns** - Automated campaigns for dormant users
- ✅ **Win-Back Flows** - 3-step win-back sequence for churned users
- ✅ **Churn Prediction** - Heuristic-based churn scoring (0-1 scale)

### Non-Negotiable Principles

- ✅ **No Tokenomics Changes** - Pure engagement layer, no economic manipulation
- ✅ **Respects PACK 293** - Full notification governance (quiet hours, throttling, opt-out)
- ✅ **Privacy First** - No sensitive data exposure, segment-based only
- ✅ **Fair Play** - No ranking manipulation, no preferential treatment
- ✅ **Audit Trail** - All retention actions logged for compliance

---

## Architecture

### Data Model

#### Core Collections

```
userRetention/{uid}
├── onboardingStage: 0-6
├── onboardingCompleted: boolean
├── lastActiveAt: Timestamp
├── lastSwipeAt: Timestamp | null
├── lastChatAt: Timestamp | null
├── lastPurchaseAt: Timestamp | null
├── daysActive7: number
├── daysActive30: number
├── riskOfChurn: 0-1
├── segment: UserSegment
├── winBackSequenceStarted: boolean
├── winBackSequenceStep: 0-3
└── winBackSequenceLastSent: Timestamp | null

retentionEvents/{eventId}
├── userId: string
├── eventType: string
├── segment: UserSegment
├── churnScore: number
└── timestamp: Timestamp

retentionMetrics/{date}
├── newUsers: number
├── day1Retention: number
├── day7Retention: number
├── day30Retention: number
├── segmentDistribution: {...}
└── onboardingMetrics: {...}

nudgeHistory/{userId}
├── lastNudgeSent: Timestamp
├── nudgeCount24h: number
└── recentNudges: array
```

### User Segments

| Segment | Definition | Actions |
|---------|-----------|---------|
| **NEW** | Just registered | Onboarding nudges |
| **ACTIVE** | Active < 3 days | None |
| **DORMANT** | 3-7 days inactive | Low-priority push |
| **CHURN_RISK** | 7-30 days inactive | Medium-priority push |
| **CHURNED** | 30+ days inactive | Win-back sequence (3 messages) |
| **RETURNING** | Came back after churn | Welcome back message |

### Onboarding Stages

0. **NEW** - Just registered
1. **PHOTOS_ADDED** - Added at least 1 photo
2. **PREFERENCES_SET** - Selected gender & preferences
3. **DISCOVERY_VISITED** - Entered Discovery screen
4. **SWIPE_USED** - Made first swipe
5. **CHAT_STARTED** - Sent first message (✅ Completed)
6. **SAFETY_ENABLED** - (Optional) Enabled safety features

---

## Implementation Status

### ✅ Completed (Phase 1)

1. **TypeScript Types** ([`pack301-retention-types.ts`](functions/src/pack301-retention-types.ts))
   - All interfaces and enums defined
   - Nudge templates (EN + PL)
   - Win-back message templates
   - Constants and configuration

2. **Firestore Security Rules** ([`firestore-pack301-retention.rules`](firestore-pack301-retention.rules))
   - User can read own retention profile
   - Server-only writes (prevents manipulation)
   - Admin-only access to metrics

3. **Firestore Indexes** ([`firestore-pack301-retention.indexes.json`](firestore-pack301-retention.indexes.json))
   - 10 composite indexes for efficient queries
   - Optimized for segment queries, churn scoring, win-back

4. **Retention Service Layer** ([`pack301-retention-service.ts`](functions/src/pack301-retention-service.ts))
   - User profile CRUD operations
   - Churn score calculation (7 risk factors)
   - Segment calculation & auto-transition
   - Activity tracking & metrics
   - Win-back sequence management
   - Event logging for analytics

### 🟡 In Progress (Phase 2)

5. **Onboarding Funnel Tracking**
   - Track progress through onboarding stages
   - Trigger nudges for incomplete steps
   - Analytics on funnel drop-off

6. **Nudges Engine**
   - Context-aware trigger system
   - Rate limiting (max 1 retention push/day)
   - Multi-language support (EN, PL)

7. **Re-engagement Scheduler**
   - Daily Cloud Function to identify dormant users
   - Auto-send re-engagement notifications
   - Segment users into DORMANT → CHURN_RISK → CHURNED

8. **Win-Back Automation**
   - 3-step win-back sequence (Day 1, 4, 7)
   - Track return rate & effectiveness
   - Auto-mark users as RETURNING

9. **Notification Integration (PACK 293)**
   - Use [`enqueueNotification()`](functions/src/pack293-notification-service.ts:256) for all retention messages
   - Respect quiet hours, throttling, user preferences
   - Custom notification types: RETENTION_NUDGE, REENGAGEMENT, WINBACK

10. **Audit Logging (PACK 296)**
    - Log all segment changes
    - Log all nudges/re-engagement attempts
    - Integrate with [`business_audit_log`](functions/src/pack105-audit-logger.ts:54)

### ⏳ Pending (Phase 3)

11. **Mobile UI Components**
    - Onboarding flow screens (6 stages)
    - Nudge banner component
    - Progress indicators

12. **Web UI Components**
    - Onboarding wizard
    - Nudge notifications
    - Analytics dashboard (admin)

13. **Analytics Dashboard**
    - Real-time retention metrics
    - Cohort analysis (Day 1, 7, 30)
    - Segment distribution charts
    - Win-back effectiveness reports

14. **Integration Tests**
    - Test churn score calculation
    - Test segment transitions
    - Test win-back sequence
    - Test notification integration

---

## Dependencies

### Required PACKs

| PACK | Status | Purpose |
|------|--------|---------|
| **267-268** | ✅ Deployed | Global logic & safety engine |
| **280** | ✅ Deployed | Membership system |
| **293** | ✅ Deployed | Notifications & activity center |
| **296** | ✅ Deployed | Audit logs & compliance |
| **300** | ✅ Deployed | Support & education system |

### Required Services

- Firebase Firestore (user data & metrics)
- Cloud Functions (scheduled jobs)
- PACK 293 Notifications (push/email delivery)
- PACK 296 Audit Logs (compliance trail)

---

## Deployment Steps

### 1. Deploy Firestore Rules

```bash
# Merge with existing rules
firebase deploy --only firestore:rules
```

### 2. Deploy Firestore Indexes

```bash
# Create indexes (5-10 minutes)
firebase deploy --only firestore:indexes
```

### 3. Deploy Cloud Functions

```bash
cd functions
npm run build

# Deploy retention functions
firebase deploy --only functions:pack301
```

### 4. Initialize User Retention Profiles

```typescript
// Run once for existing users
import { getUserRetentionProfile } from './pack301-retention-service';

// For each existing user
for (const userId of existingUserIds) {
  await getUserRetentionProfile(userId);
}
```

### 5. Verify Deployment

```bash
# Check Firestore indexes
firebase firestore:indexes --filter retention

# Check Cloud Functions
firebase functions:log --only pack301

# Test retention profile creation
# (Should auto-create on first user activity)
```

---

## Integration Guide

### Track User Activity

```typescript
import { updateUserActivity } from './pack301-retention-service';

// On any user action
await updateUserActivity(userId);

// On specific activities
await updateUserActivity(userId, 'swipe');  // Update lastSwipeAt
await updateUserActivity(userId, 'chat');   // Update lastChatAt
await updateUserActivity(userId, 'purchase'); // Update lastPurchaseAt
```

### Track Onboarding Progress

```typescript
import { updateOnboardingStage, OnboardingStage } from './pack301-retention-service';

// When user adds photos
await updateOnboardingStage(userId, OnboardingStage.PHOTOS_ADDED);

// When user sets preferences
await updateOnboardingStage(userId, OnboardingStage.PREFERENCES_SET);

// When user visits discovery
await updateOnboardingStage(userId, OnboardingStage.DISCOVERY_VISITED);

// etc...
```

### Send Retention Notifications

```typescript
import { enqueueNotification } from './pack293-notification-service';

// Re-engagement notification
await enqueueNotification({
  userId,
  type: custom notification type,
  title: 'New profiles are waiting',
  body: 'Check out new people in your area.',
  priority: 'NORMAL',
  delivery: {
    push: true,
    inApp: true,
    email: false,
  },
});
```

### Query Retention Data

```typescript
import { getUserRetentionProfile, getUsersForReengagement } from './pack301-retention-service';

// Get single user profile
const profile = await getUserRetentionProfile(userId);
console.log(`Churn risk: ${profile.riskOfChurn}`);
console.log(`Segment: ${profile.segment}`);

// Get users needing re-engagement
const dormantUsers = await getUsersForReengagement('DORMANT', 100);
const churnRiskUsers = await getUsersForReengagement('CHURN_RISK', 100);
```

---

## Churn Scoring Algorithm

### Risk Factors (Heuristic-Based)

| Factor | Weight | Description |
|--------|--------|-------------|
| No chats in 5 days | +0.15 | User not messaging anyone |
| No swipes in 72h | +0.10 | Not browsing profiles |
| No app open recently | +0.20 | Haven't opened app in 24h |
| Profile not updated 30d | +0.05 | Stale profile |
| No likes received 72h | +0.10 | Low engagement from others |
| No photos added | +0.15 | Incomplete profile |
| Incomplete onboarding | +0.10 | Didn't finish setup |

**Max Score:** 1.0 (100% churn risk)  
**High Risk Threshold:** 0.6 (triggers early win-back)

### Calculation Example

```typescript
User A:
- No chats in 5 days: ✅ +0.15
- No swipes in 72h: ✅ +0.10
- No app open: ❌ 0.00
- Profile not updated: ✅ +0.05
- No likes received: ❌ 0.00
- No photos: ❌ 0.00
- Incomplete onboarding: ❌ 0.00
---
Total: 0.30 (30% churn risk) → ACTIVE segment
```

```typescript
User B:
- No chats in 5 days: ✅ +0.15
- No swipes in 72h: ✅ +0.10
- No app open: ✅ +0.20
- Profile not updated: ✅ +0.05
- No likes received: ✅ +0.10
- No photos: ✅ +0.15
- Incomplete onboarding: ✅ +0.10
---
Total: 0.85 (85% churn risk) → Enter win-back early
```

---

## Notification Templates

### Nudges (Micro-Prompts)

| Trigger | Priority | Cooldown | Example (EN) |
|---------|----------|----------|--------------|
| NO_PHOTOS_24H | NORMAL | 24h | "Add your photos. Profiles with photos get 10x more matches!" |
| NO_SWIPE_48H | LOW | 48h | "New profiles are waiting. Check out new people in your area!" |
| NO_CHAT_3D | NORMAL | 72h | "You have unread messages. Don't miss your chance to connect!" |
| NEW_PROFILES_IN_AREA | LOW | 48h | "New profiles appeared in your area. Take a look!" |

### Re-engagement Messages

| Segment | Priority | Example (EN) |
|---------|----------|--------------|
| DORMANT | LOW | "New people are waiting in Swipe." |
| CHURN_RISK | NORMAL | "You still have unread likes. Come back to check them." |

### Win-Back Sequence

| Step | Day Offset | Priority | Example (EN) |
|------|-----------|----------|--------------|
| 1 | Day 1 | NORMAL | "We saved your spot. Come back and meet new people." |
| 2 | Day 4 | NORMAL | "Swipe refreshed. New profiles added today." |
| 3 | Day 7 | HIGH | "Your account is waiting. People from your city checked your profile." |

---

## Testing Checklist

### Unit Tests

- [ ] Churn score calculation with all factors
- [ ] Segment transition logic
- [ ] Onboarding stage progression
- [ ] Win-back sequence timing
- [ ] Activity tracking updates

### Integration Tests

- [ ] Create retention profile on first activity
- [ ] Update segment on activity change
- [ ] Send nudge respects rate limits
- [ ] Win-back sequence sends 3 messages
- [ ] Notifications integrate with PACK 293

### End-to-End Tests

- [ ] New user onboarding flow (mobile)
- [ ] Dormant user receives re-engagement push
- [ ] Churned user receives win-back sequence
- [ ] Returning user marked as RETURNING
- [ ] Admin dashboard shows metrics

---

## Monitoring & Metrics

### Key Performance Indicators (KPIs)

1. **Day 1 Retention** - % of users active next day (Target: >40%)
2. **Day 7 Retention** - % of users active after 7 days (Target: >20%)
3. **Day 30 Retention** - % of users active after 30 days (Target: >10%)
4. **Onboarding Completion Rate** - % reaching stage 5 (Target: >60%)
5. **Win-Back Success Rate** - % of churned users returning (Target: >15%)

### Alerts

- Churn risk >60% spike (daily check)
- Win-back return rate drops below 10%
- Onboarding completion rate drops below 50%
- Notification throttle rate excessive (>30%)

### Logs to Monitor

```bash
# Retention events
firebase firestore:query retentionEvents --order-by timestamp desc

# Segment changes
firebase firestore:query retentionEvents --where eventType == RETENTION_SEGMENT_CHANGED

# High churn risk users
firebase firestore:query userRetention --where riskOfChurn > 0.6
```

---

## Remaining Implementation Tasks

### High Priority

1. **Onboarding Funnel Functions** (pack301-onboarding.ts)
   - Auto-track stage progression
   - Trigger nudges for incomplete steps
   - Analytics on drop-off points

2. **Nudges Engine** (pack301-nudges.ts)
   - Evaluate triggers on each activity
   - Rate limit enforcement (1/day)
   - Multi-language template rendering

3. **Re-engagement Scheduler** (pack301-reengagement.ts)
   - Cloud Function: runs daily at 2 AM UTC
   - Query DORMANT + CHURN_RISK users
   - Send appropriate re-engagement message

4. **Win-Back Automation** (pack301-winback.ts)
   - Cloud Function: runs daily at 3 AM UTC
   - Send win-back messages based on step & timing
   - Track return rate

### Medium Priority

5. **Notification Integration**
   - Create custom notification types in PACK 293
   - Add retention-specific templates
   - Implement localization (EN, PL)

6. **Audit Logging**
   - Log all segment changes to business_audit_log
   - Log all nudges/re-engagement attempts
   - Retention dashboard access logs

7. **Mobile UI**
   - Onboarding flow screens
   - Nudge banner component
   - Progress indicators

### Low Priority

8. **Web UI**
   - Onboarding wizard
   - Admin analytics dashboard
   - Retention reports

9. **Advanced Features**
   - A/B testing for messaging
   - ML-based churn prediction (vs heuristics)
   - Personalized win-back messaging
   - Cohort-specific strategies

---

## Troubleshooting

### Issue: User segment not updating

**Symptoms:** User active but still showing as DORMANT/CHURNED

**Solution:**
```typescript
// Manually trigger segment update
import { updateUserSegmentAndChurnScore } from './pack301-retention-service';
await updateUserSegmentAndChurnScore(userId);
```

### Issue: Too many retention notifications

**Symptoms:** User receiving multiple nudges/day

**Solution:**
- Check PACK 293 throttle limits
- Verify nudge cooldown periods
- Check `nudgeHistory` collection for rate limit tracking

### Issue: Win-back sequence not starting

**Symptoms:** Churned users not receiving win-back messages

**Solution:**
```typescript
// Check if user is marked as CHURNED
const profile = await getUserRetentionProfile(userId);
console.log(profile.segment); // Should be 'CHURNED'

// Manually start sequence if needed
import { startWinBackSequence } from './pack301-retention-service';
await startWinBackSequence(userId);
```

### Issue: Churn score always 0

**Symptoms:** All users showing 0.0 churn risk

**Solution:**
- Verify activity tracking is working
- Check last*At timestamps in retention profile
- Manually recalculate: `await updateUserSegmentAndChurnScore(userId)`

---

## Security & Privacy

### Data Protection

- ✅ No PII in retention profiles (only timestamps & scores)
- ✅ Segment-based only (no individual behavior details)
- ✅ Server-side writes only (prevents client manipulation)
- ✅ Admin-only access to metrics
- ✅ Audit trail for all retention actions

### Compliance (GDPR/CCPA)

- ✅ User can read own retention data
- ✅ Retention data included in data export (PACK 296)
- ✅ Retention data deleted on account deletion
- ✅ No sensitive data shared with third parties
- ✅ Transparent messaging (no dark patterns)

---

## Support & Resources

### Internal Documentation

- [PACK 293 - Notifications](functions/src/pack293-notification-service.ts)
- [PACK 296 - Audit Logs](functions/src/pack296-audit-helpers.ts)
- [PACK 300 - Support System](functions/src/pack300-support-functions.ts)

### External Resources

- [Firebase Firestore Best Practices](https://firebase.google.com/docs/firestore/best-practices)
- [Cloud Functions Scheduled Triggers](https://firebase.google.com/docs/functions/schedule-functions)
- [Retention Metrics Guide](https://mixpanel.com/topics/what-is-retention-rate/)

### Contact

For questions or issues:
- **Technical:** Review code comments in `pack301-*.ts` files
- **Business Logic:** Refer to original PACK 301 specification
- **Integration:** Check dependency PACKs (293, 296, 300)

---

## Changelog

### v1.0.0 (2025-12-09)

- ✅ Initial implementation of core infrastructure
- ✅ TypeScript types & interfaces
- ✅ Firestore rules & indexes
- ✅ Retention service layer (CRUD, scoring, segmentation)
- 🟡 In Progress: Onboarding, nudges, re-engagement, win-back
- ⏳ Pending: UI components, analytics dashboard, tests

---

**Next Steps:**

1. Implement onboarding funnel tracking
2. Build nudges engine with rate limiting
3. Create re-engagement Cloud Function
4. Build win-back automation
5. Integrate with PACK 293 notifications
6. Add audit logging
7. Build mobile UI components
8. Create analytics dashboard
9. Write comprehensive tests
10. Deploy to production
