# PACK 223 - Destiny Weeks - Quick Reference

## TL;DR

Weekly engagement engine with themed chemistry events. Rewards visibility/reach, NOT tokens. Fully integrated with Breakup Recovery (PACK 222).

---

## Quick Integration

### Backend

```typescript
// Import
import { 
  trackDestinyAction,
  getUserDestinyState,
  getActiveRewards 
} from './pack-223-destiny-weeks';

// Track actions (use integration hooks)
import {
  onSwipeMatch,
  onFirstMessage,
  onChatCompleted,
  onVoiceCallCompleted
} from './pack-223-destiny-weeks-integration';

// Auto-tracking
await onSwipeMatch(user1, user2);
await onFirstMessage(sender, receiver, chatId);
await onChatCompleted(user1, user2, chatId, 25);
await onVoiceCallCompleted(user1, user2, callId, 15);
```

### Frontend

```typescript
// Import components
import DestinyWeekBanner from '@/components/DestinyWeekBanner';
import DestinyScoreTracker from '@/components/DestinyScoreTracker';
import DestinyRewardCard from '@/components/DestinyRewardCard';

// Display
<DestinyWeekBanner theme={theme} currentScore={score} />
<DestinyScoreTracker state={userState} />
{rewards.map(r => <DestinyRewardCard reward={r} />)}
```

---

## Action Scores (Theme-Dependent)

| Action | Score Range | Trigger |
|--------|-------------|---------|
| Swipe Match | 3-12 | Both match |
| First Message | 10-30 | Message sent |
| Complete Chat | 50-100 | 20+ messages |
| Voice Call | 100-200 | Call ends |
| Video Call | 150-280 | Call ends |
| Meeting Verified | 300-600 | QR scan |
| Join Event | 200-400 | Event join |
| Host Event | 500-800 | Host event |

---

## Milestones & Rewards

| Score | Reward | Duration |
|-------|--------|----------|
| 100 | Trending Badge | 7 days |
| 300 | Chat Priority | 72 hours |
| 500 | Golden Glow | 48 hours |
| 1000 | Discovery Boost (2x) | 48 hours |
| 2000 | Fate Matches | 7 days |
| 5000 | Discover Highlight | Next week |

---

## Weekly Themes

| Theme | Icon | Soft Mode | Best For |
|-------|------|-----------|----------|
| Chemistry Sparks | 🔥 | No | High engagement |
| Flirty Vibes | 💋 | **Yes** | Post-breakup |
| Romantic Energy | 💞 | No | Serious dating |
| Midnight Connections | 🌙 | No | Late-night |
| Confident/Generous | ✨ | No | Premium users |
| Passport Romance | 🗝 | **Yes** | Cross-border |

**Soft Mode** = Suitable during breakup recovery

---

## Breakup Recovery Sync

### Auto-Integration with PACK 222

```typescript
// During cooldown (0-48h)
- Destiny UI: HIDDEN
- Action tracking: DISABLED
- Theme: N/A

// During rebuild (2-5 days)
- Destiny UI: VISIBLE
- Action tracking: ENABLED
- Theme: Soft themes preferred

// During restart (5-10 days)
- Destiny UI: VISIBLE
- Action tracking: ENABLED
- Theme: All themes available
```

### Sync Code

```typescript
import { syncBreakupRecoveryStatus } from './pack-223-destiny-weeks';

// Journey ended → cooldown
await syncBreakupRecoveryStatus(userId, true, 'cooldown');

// Progress → rebuild
await syncBreakupRecoveryStatus(userId, true, 'rebuild');

// Recovery complete
await syncBreakupRecoveryStatus(userId, false);
```

---

## Matching Priority

```typescript
import { 
  getDestinyBoostMultiplier,
  hasGoldenGlow,
  hasChatPriority 
} from './pack-223-destiny-weeks';

// Discovery ranking
const boost = await getDestinyBoostMultiplier(userId); // 1.0-2.0x
const adjustedScore = baseScore * boost;

// Visual indicators
const showGolden = await hasGoldenGlow(userId);
const prioritizeChat = await hasChatPriority(userId);
```

---

## Database Collections

```
destiny_weekly_themes/       - Active and archived themes
destiny_user_states/         - User scores and progress
destiny_milestones/          - Unlocked milestones
destiny_rewards/             - Active and expired rewards
destiny_leaderboards/        - Weekly leaderboards
destiny_week_recaps/         - Weekly summaries
```

---

## Scheduled Functions

```typescript
// Monday 00:00 - Rotate theme
export const rotateDestinyTheme = functions.pubsub
  .schedule('0 0 * * 1').timeZone('UTC')
  .onRun(() => rotateWeeklyTheme());

// Sunday 23:00 - Generate recaps
export const generateRecaps = functions.pubsub
  .schedule('0 23 * * 0').timeZone('UTC')
  .onRun(() => generateWeekRecaps());

// Daily 12:00 - Update leaderboard
export const updateLeaderboard = functions.pubsub
  .schedule('0 12 * * *').timeZone('UTC')
  .onRun(() => generateLeaderboard(100));
```

---

## Admin Functions

```typescript
// Theme management
await createCustomTheme('chemistry_sparks', config);
await activateTheme(themeId);
await forceThemeRotation();

// Rewards
await grantRewardToUser(userId, 'discover_boost', config);
await revokeReward(rewardId, reason);

// Analytics
const stats = await getPlatformStats();
const themeStats = await getThemeStats(themeId);
```

---

## Economy Rules

### ❌ NO Changes

- Chat pricing (100-500 tokens)
- Call/video pricing
- Meeting pricing
- Event pricing
- 65/35 split
- Royal benefits
- Dynamic pricing (PACK 242)

### ✅ What Changes

**Indirect engagement boost:**
- More activity → More matches → More revenue
- Better retention → Higher LTV
- Premium appearance → More interest

**Rewards give visibility, NOT tokens:**
- Discovery boost = ranking multiplier
- Golden glow = visual premium
- Chat priority = inbox placement

---

## Psychology Rules

### ✅ Allowed

- "Take your time — when you're ready"
- "Your vibe attracts attention"
- "High chemistry potential"
- "Someone with your energy"

### ❌ Forbidden

- "Don't be sad — keep swiping"
- "Replace your ex"
- "Forget about the past"
- "Someone better than the last one"
- Any exploitative emotional triggers

---

## Testing Checklist

Backend:
- [ ] Theme rotation (Monday 00:00)
- [ ] Action tracking with correct scores
- [ ] Milestone unlocking
- [ ] Reward activation and expiration
- [ ] Breakup recovery sync (all phases)
- [ ] Discovery boost application
- [ ] Leaderboard generation

Frontend:
- [ ] Banner displays correctly
- [ ] Score tracker shows progress
- [ ] Reward cards active/expired
- [ ] Recovery UI hiding during cooldown
- [ ] Theme icons and colors

Integration:
- [ ] All action hooks tracking
- [ ] Chat completion at 20 messages
- [ ] Call/video tracking
- [ ] Meeting verification
- [ ] Event join/host tracking

---

## Files Reference

**Backend:**
- [`functions/src/pack-223-destiny-weeks.ts`](functions/src/pack-223-destiny-weeks.ts)
- [`functions/src/pack-223-destiny-weeks-integration.ts`](functions/src/pack-223-destiny-weeks-integration.ts)
- [`functions/src/pack-223-destiny-weeks-admin.ts`](functions/src/pack-223-destiny-weeks-admin.ts)

**Frontend:**
- [`app-mobile/types/pack-223-destiny-weeks.ts`](app-mobile/types/pack-223-destiny-weeks.ts)
- [`app-mobile/app/components/DestinyWeekBanner.tsx`](app-mobile/app/components/DestinyWeekBanner.tsx)
- [`app-mobile/app/components/DestinyScoreTracker.tsx`](app-mobile/app/components/DestinyScoreTracker.tsx)
- [`app-mobile/app/components/DestinyRewardCard.tsx`](app-mobile/app/components/DestinyRewardCard.tsx)

**Database:**
- [`firestore-pack223-destiny-weeks.rules`](firestore-pack223-destiny-weeks.rules)
- [`firestore-pack223-destiny-weeks.indexes.json`](firestore-pack223-destiny-weeks.indexes.json)

**Docs:**
- [`PACK_223_DESTINY_WEEKS_IMPLEMENTATION.md`](PACK_223_DESTINY_WEEKS_IMPLEMENTATION.md)

---

## Deployment

```bash
# 1. Deploy functions
cd functions && firebase deploy --only functions

# 2. Deploy rules
firebase deploy --only firestore:rules

# 3. Deploy indexes
firebase deploy --only firestore:indexes

# 4. Initialize first theme (one-time)
# Run in Firebase Console or Cloud Function:
# await generateWeeklyTheme('UTC');
```

---

## Support

**Issue:** Users not seeing Destiny UI  
**Fix:** Check `activeThemeId`, verify theme is active

**Issue:** Actions not tracking  
**Fix:** Verify integration hooks called, check rules

**Issue:** Rewards not appearing  
**Fix:** Check expiration, verify `isActive` flag

**Issue:** Recovery not syncing  
**Fix:** Verify PACK 222 calling sync function

---

## Confirmation String

```
PACK 223 COMPLETE — Destiny Weeks implemented with full dating alignment and no token giveaways
```

---

**Status:** ✅ Ready for Production  
**Version:** 1.0  
**Last Updated:** 2025-12-02