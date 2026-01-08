# PACK 301A — Growth & Retention Automation Engine (Execution Layer)

**Status:** ✅ IMPLEMENTED  
**Date:** 2025-12-10  
**Dependencies:** PACK 301, 301B, 293 (Notifications), 296 (Audit Logs)

---

## Overview

PACK 301A transforms PACK 301 from a static data layer into a **live automation engine** that actively manages user retention, onboarding completion, and win-back campaigns. This execution layer adds:

- **Real-time activity tracking** (login, swipe, chat, calls, purchases, profile updates)
- **Automated churn risk recalculation** (daily sweep)
- **Win-back campaign automation** (3-step sequence: Day 1, Day 4, Day 7)
- **Onboarding nudge automation** (stuck users get contextual nudges)
- **Admin tools** for manual profile rebuilds

---

## Implementation Files

### Core Functions
- **[`functions/src/pack301-retention-functions.ts`](functions/src/pack301-retention-functions.ts:1)** — 6 new Cloud Functions (callable + scheduled)

### Extended Service Layer
- **[`functions/src/pack301-retention-service.ts`](functions/src/pack301-retention-service.ts:448)** — Extended with PACK 301A automation helpers

### Firestore Indexes
- **[`firestore-pack301-retention.indexes.json`](firestore-pack301-retention.indexes.json:1)** — Added 2 new indexes for sweep queries

### Exports
- **[`functions/src/index.ts`](functions/src/index.ts:5395)** — 6 new function exports

---

## New Cloud Functions

### 1. `pack301a_logUserActivity` (Callable)

**Purpose:** Log user activity and update retention profile in real-time

**Input:**
```typescript
{
  activityType: 'login' | 'swipe' | 'chat_message' | 'call_started' | 'purchase' | 'profile_update',
  metadata?: {
    source?: string;
    platform?: 'android' | 'ios' | 'web';
    countryCode?: string;
  }
}
```

**Behavior:**
- Updates `lastActiveAt` timestamp
- Updates specific activity timestamps (`lastSwipeAt`, `lastChatAt`, `lastPurchaseAt`)
- Recomputes churn risk score
- Recomputes user segment (NEW → ACTIVE → DORMANT → CHURN_RISK → CHURNED → RETURNING)
- Updates onboarding stage if activity completes a stage
- Logs audit event `retention.activity_logged`

**Returns:**
```typescript
{
  success: true,
  segment: UserSegment,
  riskOfChurn: number,
  lastActivityAt: Timestamp,
  onboardingStage: OnboardingStage
}
```

**Client Integration:**
```typescript
// Call from mobile/web when user performs key actions
await pack301a_logUserActivity({
  activityType: 'login',
  metadata: { platform: 'ios', countryCode: 'PL' }
});

await pack301a_logUserActivity({
  activityType: 'chat_message',
  metadata: { source: 'match_conversation' }
});
```

---

### 2. `pack301a_updateOnboardingStage` (Callable)

**Purpose:** Manually update user's onboarding progress

**Input:**
```typescript
{
  stage: OnboardingStage // 0-6
}
```

**Behavior:**
- Only moves forward (blocks attempts to go back)
- Updates `onboardingStage` and `onboardingStageUpdatedAt`
- Marks onboarding as completed when reaching `CHAT_STARTED` (stage 5)
- Potentially resets onboarding-nudge counters
- Logs audit event `retention.onboarding_stage_changed` with old/new stage

**Returns:**
```typescript
{
  success: true,
  currentStage: OnboardingStage,
  previousStage: OnboardingStage
}
```

---

### 3. `pack301a_dailyRetentionSweep` (Scheduled)

**Purpose:** Daily recalculation of all user churn scores and segments

**Schedule:** `every 24 hours` (runs at midnight UTC)

**Behavior:**
- Processes users in batches of 500
- Fetches retention profiles where `lastActiveAt < 1 day ago`
- For each user:
  - Recalculates churn risk score
  - Recalculates segment
  - Logs audit event if segment changed
  - Marks user for win-back if entering `CHURN_RISK` or `CHURNED`
- Continues until all eligible users are processed

**Win-Back Initialization:**
When a user transitions to `CHURN_RISK` or `CHURNED`, the sweep automatically:
```typescript
{
  winBackSequenceStarted: true,
  winBackSequenceStep: 0,
  winBackSequenceLastSent: null
}
```

**Performance:**
- Batch size: 500 users/run
- Estimated runtime: 2-5 minutes for 10,000 users
- Cursor-based pagination for reliability

---

### 4. `pack301a_dailyWinbackSweep` (Scheduled)

**Purpose:** Send win-back messages to churned users (3-step sequence)

**Schedule:** `every 24 hours` (runs at midnight UTC, after retention sweep)

**Win-Back Sequence:**

| Step | Timing | Template | Priority |
|------|--------|----------|----------|
| 1 | Day 1 after entering churn | "We saved your spot" | NORMAL |
| 2 | Day 4 (3 days after Step 1) | "Swipe refreshed" | NORMAL |
| 3 | Day 7 (3 days after Step 2) | "Your account is waiting" | HIGH |

**Behavior:**
- Processes users with `segment IN [CHURN_RISK, CHURNED]` and `winBackSequenceStarted = true`
- For each user:
  - Checks if user returned (segment became ACTIVE/RETURNING)
    - If yes: marks `winbackState.completed = true` and stops sequence
  - Determines which step to send based on `winBackSequenceStep` and `winBackSequenceLastSent`
  - Builds notification content (EN/PL based on user language)
  - Sends via PACK 293 (push + in-app)
  - Updates `winBackSequenceStep` and `winBackSequenceLastSent`
  - Logs audit event `retention.winback_triggered`

**Auto-Completion:**
If a user becomes ACTIVE or RETURNING during the sequence, the next sweep automatically marks the sequence as completed and stops sending messages.

---

### 5. `pack301a_onboardingNudgeSweep` (Scheduled)

**Purpose:** Send nudges to users stuck in onboarding funnel

**Schedule:** `every 6 hours` (4x daily to maximize conversion)

**Onboarding Stage Thresholds:**

| Stage | Stale After | Nudge Trigger |
|-------|-------------|---------------|
| NEW (0) | 24 hours | NO_PHOTOS_24H |
| PHOTOS_ADDED (1) | 48 hours | NO_DISCOVERY_48H |
| PREFERENCES_SET (2) | 48 hours | NO_DISCOVERY_48H |
| DISCOVERY_VISITED (3) | 72 hours | NO_SWIPE_48H |
| SWIPE_USED (4) | 72 hours | NO_CHAT_3D |
| CHAT_STARTED (5+) | N/A | Onboarding complete |

**Behavior:**
- Processes users with `onboardingCompleted = false` and `lastActiveAt < 24h ago`
- For each user:
  - Checks if user has been stale at current stage for threshold period
  - Respects quiet hours (22:00-08:00 local time)
  - Checks opt-out flags from `nudgeHistory` collection
  - Enforces per-user rate limiting (max 1 onboarding nudge per 24h)
  - Selects appropriate nudge template based on stage
  - Sends via PACK 293 (push + in-app)
  - Updates `lastOnboardingNudge` timestamp
  - Logs audit event `retention.onboarding_nudge_sent`

**Rate Limiting:**
- Max 1 onboarding nudge per user per 24 hours
- Stored in `nudgeHistory/{userId}.lastOnboardingNudge`
- Users can opt out via PACK 301B functions

---

### 6. `pack301a_rebuildRetentionProfile` (Admin Callable)

**Purpose:** Manual admin tool to recompute a user's retention profile

**Input:**
```typescript
{
  userId: string // Explicit userId (NOT context.auth.uid)
}
```

**Authentication:** SuperAdmin only (verified via [`isSuperAdmin()`](functions/src/pack296-audit-helpers.ts:501))

**Behavior:**
- Verifies admin access using PACK 296 RBAC
- Recomputes full retention profile:
  - Churn risk score
  - User segment
  - Activity metrics (best-effort from existing data)
- Overwrites retention profile with recomputed values
- Logs audit event `retention.profile_rebuilt` with adminId and userId

**Use Cases:**
- Debugging retention issues
- Fixing corrupted profiles
- Testing churn score algorithm
- Manual override after data migration

---

## Service Layer Extensions

### New Helper Functions in [`pack301-retention-service.ts`](functions/src/pack301-retention-service.ts:448)

```typescript
// Activity tracking
async function recordActivity(
  userId: string,
  activityType: ActivityType,
  metadata?: ActivityMetadata
): Promise<RetentionProfile>

// Churn & segment recalculation
async function recalculateChurnScore(userId: string): Promise<RetentionProfile>
async function recalculateSegment(userId: string): Promise<RetentionProfile>

// Batch queries for sweeps
async function getUsersForRetentionSweep(
  batchSize: number,
  cursor?: string
): Promise<{ users: RetentionProfile[]; nextCursor?: string }>

async function getUsersForWinbackSweep(
  batchSize: number,
  cursor?: string
): Promise<{ users: RetentionProfile[]; nextCursor?: string }>

async function getUsersForOnboardingNudges(
  batchSize: number,
  cursor?: string
): Promise<{ users: RetentionProfile[]; nextCursor?: string }>

// Win-back state management
async function markWinbackStepSent(userId: string, stepIndex: number): Promise<void>
async function markWinbackCompleted(userId: string): Promise<void>
```

### Constants

```typescript
export const RETENTION_THRESHOLDS = {
  DORMANT_AFTER_DAYS: 3,
  CHURN_RISK_AFTER_DAYS: 7,
  CHURNED_AFTER_DAYS: 30,
  ONBOARDING_STAGE_STALE_AFTER_HOURS: {
    0: 24,  // NEW -> 24h
    1: 48,  // PHOTOS_ADDED -> 48h
    2: 48,  // PREFERENCES_SET -> 48h
    3: 72,  // DISCOVERY_VISITED -> 72h
    4: 72,  // SWIPE_USED -> 72h
    5: 0,   // CHAT_STARTED (complete)
    6: 0,   // SAFETY_ENABLED
  },
};
```

---

## Cron Schedule Summary

| Function | Schedule | Runtime | Purpose |
|----------|----------|---------|---------|
| `pack301a_dailyRetentionSweep` | Every 24 hours (midnight UTC) | 2-5 min | Recalculate churn & segment for all users |
| `pack301a_dailyWinbackSweep` | Every 24 hours (midnight UTC) | 1-3 min | Send win-back messages (3-step sequence) |
| `pack301a_onboardingNudgeSweep` | Every 6 hours | 1-2 min | Send nudges to stuck onboarding users |

**Total Daily Automation:**
- 1x retention sweep (midnight)
- 1x win-back sweep (midnight)
- 4x onboarding nudge sweeps (every 6 hours)

---

## Integration with Other Packs

### PACK 293 — Notifications
**Used for:** Sending nudges and win-back messages

```typescript
import { enqueueNotification } from './pack293-notification-service';

await enqueueNotification({
  userId: user.uid,
  type: 'WINBACK',
  title: 'We saved your spot',
  body: 'Come back and meet new people.',
  context: { step: 1, dayOffset: 1 },
  priority: 'NORMAL',
  delivery: {
    push: true,
    inApp: true,
    email: false,
  },
});
```

**Respects:**
- Quiet hours (22:00-08:00 local time)
- Marketing/engagement opt-out flags
- Per-user rate limits (1 retention push per day)

### PACK 296 — Audit Logs
**Used for:** Logging all retention events

```typescript
import { writeAuditLog } from './pack296-audit-helpers';

await writeAuditLog({
  actorType: 'SYSTEM',
  actionType: 'retention.segment_change',
  resourceType: 'USER',
  resourceId: userId,
  metadata: {
    oldSegment: 'ACTIVE',
    newSegment: 'DORMANT',
    oldRisk: 0.2,
    newRisk: 0.4,
  },
});
```

**Logged Events:**
- `retention.activity_logged` — User performed an action
- `retention.onboarding_stage_changed` — User progressed in onboarding
- `retention.segment_change` — User moved between segments
- `retention.winback_triggered` — Win-back message sent
- `retention.onboarding_nudge_sent` — Onboarding nudge sent
- `retention.profile_rebuilt` — Admin manually rebuilt profile

---

## How Other Packs Can Read Retention Data

### ASO/Reviews Engine
```typescript
import { getUserRetentionProfile } from './pack301-retention-service';

const profile = await getUserRetentionProfile(userId);

// Use segment to target high-value users for review requests
if (profile.segment === 'ACTIVE' && profile.riskOfChurn < 0.3) {
  // Request app store review
}
```

### Fraud Detection
```typescript
// Check if user is churned before flagging as fraud
if (profile.segment === 'CHURNED' && profile.daysActive30 < 2) {
  // Likely a throwaway account
}
```

### Growth Engine
```typescript
// Skip re-engagement campaigns for users already in win-back
if (profile.winBackSequenceStarted) {
  // Don't send duplicate retention messages
}

// Target onboarding users for first-time offers
if (!profile.onboardingCompleted && profile.onboardingStage === 2) {
  // Offer first swipe boost
}
```

### Creator Analytics
```typescript
// Identify at-risk creators for retention campaigns
if (profile.segment === 'CHURN_RISK' && creatorData.lifetimeEarnings > 1000) {
  // High-value creator at risk - priority retention
}
```

---

## Firestore Indexes

### New Indexes Added for PACK 301A

```json
{
  "collectionGroup": "userRetention",
  "fields": [
    { "fieldPath": "segment", "order": "ASCENDING" },
    { "fieldPath": "winBackSequenceStarted", "order": "ASCENDING" },
    { "fieldPath": "winBackSequenceLastSent", "order": "ASCENDING" }
  ]
}
```
**Purpose:** Win-back sweep query

```json
{
  "collectionGroup": "userRetention",
  "fields": [
    { "fieldPath": "onboardingCompleted", "order": "ASCENDING" },
    { "fieldPath": "lastActiveAt", "order": "ASCENDING" }
  ]
}
```
**Purpose:** Onboarding nudge sweep query

---

## Manual Test Checklist (Staging Environment)

### ✅ Activity Logging Tests

1. **Login Activity**
   ```bash
   # Call from authenticated client
   pack301a_logUserActivity({ activityType: 'login', metadata: { platform: 'web' } })
   
   # Verify:
   # - lastActiveAt updated
   # - segment recalculated
   # - audit log created
   ```

2. **Swipe Activity**
   ```bash
   pack301a_logUserActivity({ activityType: 'swipe' })
   
   # Verify:
   # - lastSwipeAt updated
   # - lastActiveAt updated
   # - churn risk decreased
   ```

3. **Purchase Activity**
   ```bash
   pack301a_logUserActivity({ activityType: 'purchase' })
   
   # Verify:
   # - lastPurchaseAt updated
   # - segment improved (if was dormant)
   ```

### ✅ Onboarding Stage Tests

4. **Forward Stage Update**
   ```bash
   pack301a_updateOnboardingStage({ stage: 1 }) # PHOTOS_ADDED
   
   # Verify:
   # - onboardingStage = 1
   # - audit log "onboarding_stage_changed"
   # - returns previousStage: 0, currentStage: 1
   ```

5. **Backward Stage Blocked**
   ```bash
   # User at stage 3, tries to go back to stage 1
   pack301a_updateOnboardingStage({ stage: 1 })
   
   # Verify:
   # - returns success: true, message: "Stage already completed"
   # - onboardingStage unchanged
   ```

### ✅ Daily Retention Sweep Tests

6. **Trigger Manual Sweep**
   ```bash
   # Firebase console: Cloud Functions → pack301a_dailyRetentionSweep → Test
   
   # Verify logs show:
   # - "Starting daily retention sweep..."
   # - "X users processed, Y segment changes"
   # - Audit logs for segment changes
   ```

7. **Verify Segment Transitions**
   ```typescript
   // Create test user, make inactive for 4 days
   // Run sweep
   // Verify segment: NEW → DORMANT
   
   // Make inactive for 8 days
   // Run sweep again
   // Verify segment: DORMANT → CHURN_RISK
   // Verify winBackSequenceStarted: true
   ```

### ✅ Win-Back Sweep Tests

8. **Win-Back Step 1 (Day 1)**
   ```bash
   # Create user in CHURNED segment
   # Set winBackSequenceStarted: true, winBackSequenceStep: 0
   # Set winBackSequenceLastSent: 25 hours ago
   
   # Trigger: pack301a_dailyWinbackSweep
   
   # Verify:
   # - Notification sent: "We saved your spot"
   # - winBackSequenceStep = 1
   # - winBackSequenceLastSent = now
   # - Audit log "retention.winback_triggered" with step: 1
   ```

9. **Win-Back Step 2 (Day 4)**
   ```bash
   # Set winBackSequenceStep: 1
   # Set winBackSequenceLastSent: 73 hours ago (3+ days)
   
   # Trigger sweep
   
   # Verify:
   # - Notification sent: "Swipe refreshed"
   # - winBackSequenceStep = 2
   ```

10. **Win-Back Auto-Complete on Return**
    ```bash
    # User in win-back sequence becomes ACTIVE again
    # Trigger sweep
    
    # Verify:
    # - winBackSequenceStarted = false
    # - winBackSequenceStep = 0
    # - No further messages sent
    ```

### ✅ Onboarding Nudge Sweep Tests

11. **Stuck at NEW Stage**
    ```bash
    # Create user: onboardingStage = 0, lastActiveAt = 25h ago
    
    # Trigger: pack301a_onboardingNudgeSweep
    
    # Verify:
    # - Notification sent: "Add your photos" (or Polish equivalent)
    # - lastOnboardingNudge timestamp updated
    # - Audit log "retention.onboarding_nudge_sent"
    ```

12. **Rate Limiting Enforcement**
    ```bash
    # User just received nudge 12 hours ago
    # Trigger sweep again
    
    # Verify:
    # - No notification sent (rate limited)
    # - Logs: "Rate limit reached for user X"
    ```

13. **Quiet Hours Enforcement**
    ```bash
    # Set user timezone to Europe/Warsaw
    # Run sweep at 23:00 Warsaw time (quiet hours)
    
    # Verify:
    # - No notification sent
    # - Logs: "User X in quiet hours"
    ```

### ✅ Admin Rebuild Tests

14. **Admin Profile Rebuild**
    ```bash
    # As SUPERADMIN:
    pack301a_rebuildRetentionProfile({ userId: 'test-user-123' })
    
    # Verify:
    # - Profile recalculated
    # - Returns updated segment, riskOfChurn
    # - Audit log "retention.profile_rebuilt" with adminId
    ```

15. **Non-Admin Access Denied**
    ```bash
    # As regular user, try to rebuild another user's profile
    pack301a_rebuildRetentionProfile({ userId: 'other-user' })
    
    # Verify:
    # - Error: "permission-denied"
    # - Error message: "Admin access required"
    ```

### ✅ Integration Tests

16. **Segment Change Triggers Win-Back**
    ```bash
    # User becomes inactive for 31 days
    # Trigger daily retention sweep
    
    # Verify:
    # - segment: CHURNED
    # - winBackSequenceStarted: true
    # - winBackSequenceStep: 0
    
    # Next day, trigger win-back sweep
    # Verify: Step 1 message sent
    ```

17. **Activity Breaks Win-Back Sequence**
    ```bash
    # User in win-back sequence (step 1 sent)
    # User logs in
    
    pack301a_logUserActivity({ activityType: 'login' })
    
    # Verify:
    # - segment: RETURNING (or ACTIVE)
    
    # Trigger win-back sweep
    # Verify:
    # - winBackSequenceStarted: false (auto-completed)
    # - No step 2 message sent
    ```

18. **Onboarding Nudge → Stage Update → Nudge Stops**
    ```bash
    # User at stage 0 for 26 hours
    # Nudge sweep sends "Add photos" nudge
    
    # User adds photos
    pack301a_updateOnboardingStage({ stage: 1 })
    
    # Next nudge sweep (6 hours later)
    # Verify:
    # - New nudge trigger: NO_DISCOVERY_48H (different nudge)
    # - OR no nudge if user completed stage in < threshold time
    ```

---

## Performance Metrics

### Expected Load
- **10,000 users:**
  - Retention sweep: ~2 min (500 batch)
  - Win-back sweep: ~30 sec (only churned users, ~5-10% of base)
  - Onboarding nudge sweep: ~45 sec (only incomplete onboarding, ~20% of base)

- **100,000 users:**
  - Retention sweep: ~20 min
  - Win-back sweep: ~3 min
  - Onboarding nudge sweep: ~7 min

### Resource Usage
- **Firestore reads:** ~2-4 reads per user per sweep
- **Firestore writes:** 1 write per user (only if changed)
- **Notifications sent:** ~1-5% of user base per day
- **Audit logs:** ~0.5-2% of user base per day

---

## Data Model Impact

### UserRetentionProfile (No Breaking Changes)

**Existing fields (unchanged):**
- `uid`, `onboardingStage`, `onboardingCompleted`
- `lastActiveAt`, `lastSwipeAt`, `lastChatAt`, `lastPurchaseAt`
- `daysActive7`, `daysActive30`
- `riskOfChurn`, `segment`
- `winBackSequenceStarted`, `winBackSequenceStep`, `winBackSequenceLastSent`
- `createdAt`, `updatedAt`

**No new fields added** — PACK 301A only reads and updates existing fields.

### NudgeHistory (Extended, Backward Compatible)

**New optional fields:**
- `lastOnboardingNudge: Timestamp` — Last time onboarding nudge was sent
- `nudgeCount24h: number` — Count of nudges in last 24h (for rate limiting)
- `recentNudges: Array<{trigger, sentAt}>` — Recent nudge history

---

## Security & Compliance

### ✅ No Token Balance Changes
PACK 301A does NOT:
- Modify wallet balances
- Issue refunds
- Grant free tokens
- Change pricing or revenue splits

### ✅ No Wallet Logic Changes
PACK 301A does NOT:
- Alter PACK 277 (Wallet & Token Store)
- Modify PACK 280 (Memberships)
- Change PACK 293 (Notification System)
- Modify PACK 296 (Audit Logs)

### ✅ Firestore Rules Unchanged
All retention writes are server-only. Client writes remain blocked:
```javascript
match /userRetention/{uid} {
  allow read: if isOwner(uid);
  allow write: if false; // Server-only writes
}
```

---

## Monitoring & Observability

### Key Metrics to Monitor

1. **Retention Sweep Performance**
   - Users processed per run
   - Segment changes detected
   - Execution time
   - Batch count

2. **Win-Back Effectiveness**
   - Messages sent per step
   - Return rate by step
   - Sequence completion rate
   - Auto-completions (user returned)

3. **Onboarding Nudge Impact**
   - Nudges sent per sweep
   - Stage progression rate post-nudge
   - Opt-out rate
   - Rate-limited attempts

4. **Audit Trail Completeness**
   - All segment changes logged
   - All win-back sends logged
   - All onboarding nudges logged
   - Admin actions logged

### Cloud Function Logs

**Key log patterns:**
```
[PACK 301A] Activity logged for user X: login
[PACK 301A] Onboarding stage updated for user X: 0 → 1
[PACK 301A] Daily retention sweep complete: 5000 users processed, 123 segment changes
[PACK 301A] Marked user X for win-back (CHURNED)
[PACK 301A] Sent win-back step 1 to user X
[PACK 301A] Sent onboarding nudge to user X: NO_PHOTOS_24H
[PACK 301A] User X returned - win-back sequence completed
```

---

## Deployment Instructions

### 1. Deploy Firebase Functions
```bash
cd functions
npm run build
firebase deploy --only functions:pack301a_logUserActivity,functions:pack301a_updateOnboardingStage,functions:pack301a_dailyRetentionSweep,functions:pack301a_dailyWinbackSweep,functions:pack301a_onboardingNudgeSweep,functions:pack301a_rebuildRetentionProfile
```

### 2. Deploy Firestore Indexes
```bash
firebase deploy --only firestore:indexes
```

### 3. Verify Deployment
```bash
# Check function logs
firebase functions:log --only pack301a_dailyRetentionSweep --limit 10

# Check scheduled runs
gcloud scheduler jobs list --project avalo-prod
```

---

## Backward Compatibility

### ✅ Existing PACK 301 Functions Unchanged
- All existing exports preserved
- No renamed functions
- No removed types
- Service helpers extended, not replaced

### ✅ Existing PACK 301B Functions Unchanged
- Onboarding tracking still works
- Nudge system still works
- Activity hooks still work
- Analytics still works

### ✅ Data Migration Not Required
- All new fields are optional
- Existing retention profiles work as-is
- Service layer gracefully handles missing fields

---

## Known Limitations

1. **Activity Logs Not Stored Long-Term**
   - Only timestamps stored (`lastSwipeAt`, `lastChatAt`, etc.)
   - Full activity history would require separate event store
   - Decision: Keep lightweight, timestamps sufficient for retention

2. **Onboarding Stage Stale Thresholds Are Static**
   - Different stages have different thresholds (24h, 48h, 72h)
   - Could be made dynamic per user based on engagement patterns
   - Decision: Start with static, measure effectiveness

3. **Win-Back Sequence Is Linear**
   - All users get same 3-step sequence
   - No personalization based on segment or past behavior
   - Decision: Start simple, A/B test variations later

4. **No Email Channel**
   - Win-back and nudges only sent via push + in-app
   - Email integration would require SMTP/SendGrid setup
   - Decision: Mobile-first strategy, add email if needed

---

## Next Steps (Post-Launch)

### Phase 1: Monitor & Optimize (Weeks 1-2)
- [ ] Track win-back return rates by step
- [ ] Measure onboarding nudge conversion rates
- [ ] Identify optimal nudge timing per stage
- [ ] A/B test message copy variations

### Phase 2: Personalization (Weeks 3-4)
- [ ] Personalize win-back messages based on user's last activity
- [ ] Dynamic nudge timing based on user behavior patterns
- [ ] Segment-specific nudge templates

### Phase 3: ML Enhancement (Month 2+)
- [ ] Train churn prediction model on historical data
- [ ] Replace heuristic score with ML probability
- [ ] Predict optimal nudge timing per user
- [ ] Lifetime value (LTV) prediction for prioritization

---

## Success Metrics (30-Day Target)

| Metric | Baseline | Target | Stretch |
|--------|----------|--------|---------|
| Day 7 Retention | 30% | 35% | 40% |
| Day 30 Retention | 15% | 20% | 25% |
| Onboarding Completion Rate | 40% | 50% | 60% |
| Win-Back Return Rate | 5% | 10% | 15% |
| Churn Risk Segment Size | 15% | 12% | 10% |

---

## Support & Troubleshooting

### Common Issues

**Issue:** Users not receiving nudges
**Solutions:**
1. Check `nudgeHistory/{userId}.optedOut = false`
2. Verify quiet hours not blocking (check user timezone)
3. Check rate limits not exceeded
4. Verify notification settings in PACK 293

**Issue:** Win-back sequence not progressing
**Solutions:**
1. Verify `winBackSequenceStarted = true`
2. Check `winBackSequenceLastSent` timestamp (must be 3+ days ago)
3. Verify user still in CHURN_RISK or CHURNED segment
4. Check Cloud Scheduler is running daily

**Issue:** Segment not updating
**Solutions:**
1. Verify daily retention sweep is running
2. Check `lastActiveAt` timestamp is accurate
3. Run manual recalculation: `pack301a_rebuildRetentionProfile`
4. Check for errors in Cloud Function logs

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    PACK 301A AUTOMATION                     │
└─────────────────────────────────────────────────────────────┘
                               │
                ┌──────────────┼──────────────┐
                │              │              │
         ┌──────▼──────┐ ┌────▼─────┐ ┌─────▼──────┐
         │  Activity   │ │ Onboard  │ │   Daily    │
         │   Logging   │ │  Stage   │ │  Sweeps    │
         │  (Callable) │ │(Callable)│ │(Scheduled) │
         └──────┬──────┘ └────┬─────┘ └─────┬──────┘
                │              │              │
                └──────────────┼──────────────┘
                               │
                    ┌──────────▼──────────┐
                    │  PACK 301 Service   │
                    │   Layer (Extended)  │
                    └──────────┬──────────┘
                               │
               ┌───────────────┼───────────────┐
               │               │               │
        ┌──────▼──────┐ ┌─────▼──────┐ ┌─────▼──────┐
        │  Firestore  │ │  PACK 293  │ │  PACK 296  │
        │  Retention  │ │   Notifs   │ │   Audit    │
        │   Profiles  │ │            │ │    Logs    │
        └─────────────┘ └────────────┘ └────────────┘
```

---

## Contact & References

**Primary Files:**
- Functions: [`pack301-retention-functions.ts`](functions/src/pack301-retention-functions.ts:1)
- Service: [`pack301-retention-service.ts`](functions/src/pack301-retention-service.ts:448)
- Types: [`pack301-retention-types.ts`](functions/src/pack301-retention-types.ts:1)

**Dependencies:**
- PACK 301: Foundation data layer
- PACK 301B: UI/Analytics over retention data
- PACK 293: Notification system
- PACK 296: Audit logging

**Maintainer:** Backend Team  
**Last Updated:** 2025-12-10  
**Version:** 1.0.0