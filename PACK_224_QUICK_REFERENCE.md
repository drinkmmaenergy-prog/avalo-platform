# PACK 224 - Dynamic Romantic Momentum Engine - Quick Reference

## TL;DR

Real-time heat system that boosts visibility and reach based on romantic activity. Hidden momentum score (0-100). Rewards engagement, NOT tokens. Integrated with PACKs 221-223.

---

## Quick Integration

### Backend

```typescript
// Import core functions
import { 
  trackMomentumAction,
  getMomentumBoostMultiplier,
  getMomentumVisualIndicator
} from './pack-224-romantic-momentum';

// Import integration hooks
import {
  onFirstMessageOfDay,
  onPaidMessages20,
  onVoiceCallCompleted,
  onVideoCallCompleted,
  onMeetingVerified,
  onEventParticipation,
  onEventHosting
} from './pack-224-romantic-momentum-integration';

// Track actions
await onFirstMessageOfDay(userId, receiverId, chatId);
await onPaidMessages20(userId, receiverId, chatId, messageTexts);
await onVoiceCallCompleted(userId, partnerId, callId, durationSeconds);
await onMeetingVerified(userId, partnerId, meetingId, selfieMatchScore);
```

### Frontend

```typescript
// Import components
import MomentumIndicator from '@/components/MomentumIndicator';
import MomentumTrendCard from '@/components/MomentumTrendCard';

// Display on profile
<MomentumIndicator userId={userId} size="medium" showBadge={true} />

// Show user's own momentum
<MomentumTrendCard
  trend={state.trend}
  visualLevel={indicator.indicatorLevel}
  actionsToday={state.actionsToday}
  consecutiveDays={state.consecutiveDaysActive}
/>
```

---

## Momentum Gains

| Action | Change | Notes |
|--------|--------|-------|
| 20 paid messages | +12 | Checks for spam |
| First message/day | +2 | Daily bonus |
| Voice call 10+ min | +8 | Verified duration |
| Video call | +11 | Requires 5+ min |
| Meeting verified | +18 | QR + selfie |
| Event participation | +15 | Join event |
| Event hosting | +25 | Host event |
| Destiny reward | +4 | PACK 223 |
| Recovery complete | +6 | PACK 222 |

**Tier Bonuses:**
- Royal: 1.25x multiplier
- Influencer: +10% bonus

---

## Momentum Penalties

| Action | Change | Trigger |
|--------|--------|---------|
| 7 days inactive | -10 | Auto-check |
| 14 days inactive | -25 | Auto-check |
| Streak broken | -2 | 3+ days |
| Call cancelled | -3 | <2h notice |
| Meeting no-show | -10 | Failed attend |
| Safety complaint | -40 | Verified |

---

## Visibility Effects

| Score | Effect | Visual | Boost |
|-------|--------|--------|-------|
| 0-19 | Low visibility | None | 1.0x |
| 20-49 | Standard | Soft purple | 1.0x |
| 50-69 | "Good Match" | Neon purple | 1.3x |
| 70-84 | Trending | Pink + sparks | 1.6x |
| 85-100 | Peak Chemistry | Golden anim | 2.0x |

---

## Matchmaking Integration

```typescript
// Import matchmaking functions
import {
  calculateMatchRanking,
  getTrendingUsers,
  getPeakChemistryUsers,
  getGoodMatchCandidates
} from './pack-224-matchmaking-integration';

// Calculate match score with momentum
const finalScore = await calculateMatchRanking(
  viewerId, 
  candidateId, 
  baseScore
);

// Get trending users (70-84 score)
const trending = await getTrendingUsers(viewerId, 20);

// Get peak chemistry users (85-100 score)
const peak = await getPeakChemistryUsers(viewerId, 10);

// Boost existing matches
const boosted = await getGoodMatchCandidates(viewerId, baseMatches, 50);
```

---

## PACK Integrations

### PACK 221: Romantic Journeys

```typescript
import { onJourneyMilestoneUnlocked } from './pack-224-pack-integrations';

// Journey milestone reached
await onJourneyMilestoneUnlocked(userId, partnerId, journeyId, 'first_month');
// Adds momentum to both users
```

### PACK 222: Breakup Recovery

```typescript
import {
  initiateBreakupRecovery,
  completeBreakupRecovery
} from './pack-224-pack-integrations';

// Journey ends
await initiateBreakupRecovery(userId, partnerId, journeyId, 'mutual');
// Starts recovery, pauses momentum tracking

// Recovery complete
await completeBreakupRecovery(userId, recoveryId);
// Gives +6 momentum bonus
```

### PACK 223: Destiny Weeks

```typescript
import { onDestinyMilestoneClaimed } from './pack-224-pack-integrations';

// Destiny reward claimed
await onDestinyMilestoneClaimed(userId, milestoneId, rewardType, score);
// Adds +4 momentum
```

---

## Abuse Prevention

System automatically detects:

- **Copy/Paste Spam:** >70% duplicate messages
- **Fake Calls:** Pattern of <6 min calls
- **Meeting Fraud:** Failed selfie verification
- **Farming:** Rapid repeated actions

Penalties:
- Low: -5 momentum
- Medium: -10 momentum
- High: -20 momentum + violation record

---

## Database Collections

```
romantic_momentum_states/     - User scores (hidden from user)
momentum_actions_log/        - Action tracking
momentum_history/            - Daily snapshots
momentum_violations/         - Abuse records
momentum_boost_cache/        - Matchmaking cache
momentum_visual_indicators/  - Visual assignments
momentum_analytics/          - Platform stats
```

---

## Scheduled Functions

```typescript
// Daily inactivity check (00:00 UTC)
export const checkDailyInactivity = functions.pubsub
  .schedule('0 0 * * *').timeZone('UTC')
  .onRun(() => checkAllUsersInactivity());

// Daily snapshot (23:45 UTC)
export const createMomentumSnapshot = functions.pubsub
  .schedule('45 23 * * *').timeZone('UTC')
  .onRun(() => createDailySnapshot());

// Recovery progress (12:00 UTC)
export const progressBreakupRecovery = functions.pubsub
  .schedule('0 12 * * *').timeZone('UTC')
  .onRun(() => checkBreakupRecoveryProgress());
```

---

## Economy Rules

### ✅ What Changes
- Visibility and profile impressions
- Discovery ranking priority
- Visual effects and badges
- Reach in "Good Match" sections

### ❌ No Changes
- Chat pricing (100-500 tokens)
- Call/video pricing
- Meeting pricing
- 65/35 split
- Token economy
- Payment features

**Result:** More engagement → More matches → More revenue (no pricing changes)

---

## Testing Checklist

Backend:
- [ ] Momentum state created on first action
- [ ] Royal tier 1.25x multiplier applied
- [ ] Influencer badge +10% bonus applied
- [ ] Abuse detection working
- [ ] Inactivity penalties applied
- [ ] Visual indicators updated
- [ ] Boost cache for matchmaking

Frontend:
- [ ] Indicator displays on profiles
- [ ] Visual effects animate correctly
- [ ] Trend card shows stats
- [ ] Badges display for high momentum

Integration:
- [ ] Journey milestones add momentum
- [ ] Breakup recovery synced
- [ ] Destiny rewards add momentum
- [ ] Matchmaking boost applied

---

## Files Reference

**Backend:**
- [`functions/src/pack-224-romantic-momentum.ts`](functions/src/pack-224-romantic-momentum.ts)
- [`functions/src/pack-224-romantic-momentum-integration.ts`](functions/src/pack-224-romantic-momentum-integration.ts)
- [`functions/src/pack-224-matchmaking-integration.ts`](functions/src/pack-224-matchmaking-integration.ts)
- [`functions/src/pack-224-pack-integrations.ts`](functions/src/pack-224-pack-integrations.ts)

**Frontend:**
- [`app-mobile/types/pack-224-romantic-momentum.ts`](app-mobile/types/pack-224-romantic-momentum.ts)
- [`app-mobile/app/components/MomentumIndicator.tsx`](app-mobile/app/components/MomentumIndicator.tsx)
- [`app-mobile/app/components/MomentumTrendCard.tsx`](app-mobile/app/components/MomentumTrendCard.tsx)

**Database:**
- [`firestore-pack224-romantic-momentum.rules`](firestore-pack224-romantic-momentum.rules)
- [`firestore-pack224-romantic-momentum.indexes.json`](firestore-pack224-romantic-momentum.indexes.json)

**Docs:**
- [`PACK_224_ROMANTIC_MOMENTUM_IMPLEMENTATION.md`](PACK_224_ROMANTIC_MOMENTUM_IMPLEMENTATION.md)

---

## Deployment

```bash
# 1. Deploy rules
firebase deploy --only firestore:rules

# 2. Deploy indexes (wait 5-10 min)
firebase deploy --only firestore:indexes

# 3. Deploy functions
cd functions && firebase deploy --only functions

# 4. Deploy mobile app
# Build and deploy mobile app with new components
```

---

## Support

**Issue:** Momentum not updating  
**Fix:** Verify integration hooks are called

**Issue:** Visual indicators not showing  
**Fix:** Check Firestore rules allow reads

**Issue:** Abuse too strict  
**Fix:** Adjust thresholds in detectMomentumAbuse

**Issue:** Penalties too harsh  
**Fix:** Adjust MOMENTUM_PENALTIES values

---

## Confirmation String

```
PACK 224 COMPLETE — Dynamic Romantic Momentum Engine integrated with PACK 221–223.
```

---

**Status:** ✅ Ready for Production  
**Version:** 1.0  
**Last Updated:** 2025-12-02