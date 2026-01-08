# PACK 220 - Fan & Kiss Economy - Quick Reference

## TL;DR

Fans earn milestone badges (💋) by spending tokens through natural chat/call interactions. No subscriptions, no cashback, just romantic loyalty progression.

---

## Quick Integration

### Backend (Auto-Integrated)

Fan tracking is **already integrated** with:
- ✅ [`chatMonetization.ts`](functions/src/chatMonetization.ts:668) - Tracks after message billing
- ✅ [`callMonetization.ts`](functions/src/callMonetization.ts:538) - Tracks after call ends

No additional backend code needed!

### Frontend Usage

```typescript
// 1. Import fan components
import FanBadge, { FanProgressBar } from '@/components/FanBadge';
import { getFanStatus } from '@/services/fanService'; // You need to create this wrapper

// 2. Get fan status
const fanStatus = await getFanStatus(suitorId, creatorId);

// 3. Display badge (visible only to creator)
{currentUser.uid === creatorId && fanStatus && (
  <FanBadge 
    level={fanStatus.currentLevel} 
    size="medium" 
    showLabel={true}
  />
)}

// 4. Show progress (visible to fan)
{currentUser.uid === suitorId && fanStatus && (
  <FanProgressBar
    currentTokens={fanStatus.totalTokensSpent}
    currentLevel={fanStatus.currentLevel}
    nextLevel={getNextLevel(fanStatus.currentLevel)}
  />
)}
```

---

## The 5 Milestones

| Level | Tokens | Badge | Key Reward |
|-------|--------|-------|------------|
| Kiss 1 | 200 | 💋 | Inbox priority |
| Kiss 2 | 600 | 💋💋 | Charm bonus |
| Kiss 3 | 1,200 | 💋💋💋 | Romantic phrases |
| Kiss 4 | 2,500 | 👑💋 | Attraction magnet |
| Eternal | 5,000 | ♾️💋 | Profile banner |

---

## Key Functions (Backend)

```typescript
// Import
import { 
  trackTokenSpend,        // Auto-called by chat/call
  getFanStatus,           // Query fan relationship
  getFanRankings,         // Get creator's fan list
  getCreatorFanStats,     // Analytics
  triggerEmotionEvent     // Create progression event
} from './fanKissEconomy';

// Query fan status
const status = await getFanStatus(suitorId, creatorId);
// Returns: { currentLevel, totalTokensSpent, lastActivityAt, ... }

// Get creator's fan rankings (creator-only view)
const rankings = await getFanRankings(creatorId);
// Returns: { eternalFans: [...], royalFans: [...], ... }

// Get analytics
const stats = await getCreatorFanStats(creatorId);
// Returns: { totalFans, eternalFans, totalTokensReceived, ... }
```

---

## Privacy Rules

✅ **Creator sees**: Fan badge in their inbox, fan rankings  
✅ **Fan sees**: Their own progress bar, milestone achievements  
❌ **Others see**: Nothing (completely private)

---

## Where to Display

### Inbox (Creator View)
```typescript
// Show fan badge next to user name
<View style={styles.inboxItem}>
  <Text>{userName}</Text>
  <FanBadge level={fanLevel} size="small" showLabel={false} />
</View>
```

### Chat Header (Both See)
```typescript
// Fan sees their progress, creator sees fan badge
{isCreator ? (
  <FanBadge level={fanLevel} size="medium" />
) : (
  <FanProgressBar currentTokens={tokens} />
)}
```

### Profile Screen (Fan View)
```typescript
// Show all fanships (who I'm a fan of)
const myFanships = await getUserFanships(currentUserId);
myFanships.map(fanship => (
  <View>
    <Text>{creatorName}</Text>
    <FanBadge level={fanship.currentLevel} />
  </View>
))
```

### Fan Rankings (Creator-Only Screen)
```typescript
// Creator's "My Fans" screen
const rankings = await getFanRankings(creatorId);

<Section title="Eternal Fans">
  {rankings.eternalFans.map(userId => <UserCard userId={userId} />)}
</Section>
<Section title="Royal Fans">
  {rankings.royalFans.map(userId => <UserCard userId={userId} />)}
</Section>
// ... etc
```

---

## Token Tracking Flow

```
User sends message in PAID chat
         ↓
Earner's words billed (e.g., 30 tokens)
         ↓
chatMonetization.processMessageBilling() succeeds
         ↓
trackTokenSpend(payerId, earnerId, 30, 'chat') called async
         ↓
fan_status doc updated: totalTokensSpent += 30
         ↓
Check if milestone reached (e.g., 200 → Kiss Level 1)
         ↓
If leveled up:
  - currentLevel updated
  - Milestone logged
  - Emotion event triggered
  - Rankings updated (async)
```

---

## Testing Commands

```typescript
// Check if user is a fan
const isFan = await isFanOfLevel(suitorId, creatorId, 'KISS_1');

// Get all fans of a creator
const fans = await getCreatorFans(creatorId);

// Get user's fanships
const fanships = await getUserFanships(userId);

// Check reward eligibility
const hasReward = await hasFanReward(suitorId, creatorId, 'inbox_priority');
```

---

## Common Questions

**Q: Do fans get free tokens?**  
A: No. Fans maintain status through natural spending only.

**Q: Can fans lose their level?**  
A: No. Progress is cumulative and never resets.

**Q: Are fan badges public?**  
A: No. Only the creator sees them (privacy-protected).

**Q: What if tokens spent when Avalo is the earner?**  
A: No fan tracking (earnerId must exist).

**Q: Does PACK 219 dynamic pricing affect this?**  
A: No. Fan tracking counts actual tokens spent, regardless of entry price.

---

## Files Reference

- **Backend**: [`functions/src/fanKissEconomy.ts`](functions/src/fanKissEconomy.ts)
- **Chat Integration**: [`functions/src/chatMonetization.ts`](functions/src/chatMonetization.ts:668)
- **Call Integration**: [`functions/src/callMonetization.ts`](functions/src/callMonetization.ts:538)
- **Frontend Component**: [`app-mobile/app/components/FanBadge.tsx`](app-mobile/app/components/FanBadge.tsx)
- **Security Rules**: [`firestore-pack220-fan-kiss-economy.rules`](firestore-pack220-fan-kiss-economy.rules)
- **Indexes**: [`firestore-pack220-fan-kiss-economy.indexes.json`](firestore-pack220-fan-kiss-economy.indexes.json)
- **Full Docs**: [`PACK_220_IMPLEMENTATION_COMPLETE.md`](PACK_220_IMPLEMENTATION_COMPLETE.md)

---

## Deployment Checklist

- [ ] Deploy functions: `firebase deploy --only functions`
- [ ] Deploy rules: `firebase deploy --only firestore:rules`
- [ ] Deploy indexes: `firebase deploy --only firestore:indexes`
- [ ] Add FanBadge to inbox UI
- [ ] Add progress bar to profile screen
- [ ] Create "My Fans" screen for creators
- [ ] Test milestone progression
- [ ] Monitor fan_status collection

---

**Status**: ✅ Ready for Production  
**Version**: 1.0  
**Last Updated**: 2025-12-02