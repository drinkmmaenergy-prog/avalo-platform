# PACK 252 — Boosts Marketplace Quick Reference

## 🚀 Quick Start Guide

### Files Created

**Backend:**
- `functions/src/types/boosts.types.ts` - Type definitions
- `functions/src/services/boosts.service.ts` - Core boost logic
- `functions/src/services/boosts-ranking.service.ts` - Ranking algorithm
- `functions/src/services/boosts-stats.service.ts` - Stats tracking
- `functions/src/boosts.functions.ts` - Cloud Functions

**Frontend:**
- `app-mobile/app/components/BoostCard.tsx` - Boost card UI
- `app-mobile/app/components/BoostStatsCard.tsx` - Stats display
- `app-mobile/app/profile/boosts/index.tsx` - Marketplace screen

---

## 💰 Boost Types & Pricing

| Type | Duration | Price | Effect |
|------|----------|-------|--------|
| Spotlight | 24h | 50 💎 | First in discovery |
| Super Visibility | 24h | 75 💎 | x3 visibility |
| Trending Badge | 24h | 50 💎 | Purple badge + boost |
| Location Jump | 72h | 75 💎 | Show in other city |
| Boost Pack | 48h | 100 💎 | All combined |

---

## 🔧 API Usage

### Purchase Boost
```typescript
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

const purchaseBoost = httpsCallable(functions, 'purchaseBoostV1');
await purchaseBoost({ boostType: 'spotlight' });
```

### Get Active Boosts
```typescript
const getActiveBoosts = httpsCallable(functions, 'getActiveBoostsV1');
const result = await getActiveBoosts({});
// result.data.activeBoosts
```

### Check Eligibility
```typescript
const checkEligibility = httpsCallable(functions, 'checkBoostEligibilityV1');
const result = await checkEligibility({});
// result.data.eligible, result.data.reason
```

---

## 📊 Stats Tracking Integration

### Track Profile View
```typescript
import { trackBoostView } from './services/boosts-stats.service';

// When user views a profile
await trackBoostView(viewedUserId);
```

### Track Like
```typescript
import { trackBoostLike } from './services/boosts-stats.service';

// When user receives a like
await trackBoostLike(likedUserId);
```

### Track Match
```typescript
import { trackBoostMatch } from './services/boosts-stats.service';

// When users match
await trackBoostMatch(userId);
```

### Track Messages
```typescript
import { trackBoostMessageSent, trackBoostMessageReceived } from './services/boosts-stats.service';

// When message sent
await trackBoostMessageSent(senderId);

// When message received
await trackBoostMessageReceived(recipientId);
```

---

## 🎯 Ranking Integration

### Apply Boost Ranking to Discovery Feed
```typescript
import { applyBoostRanking } from './services/boosts-ranking.service';

// Before returning discovery results
const userIds = ['user1', 'user2', 'user3'];
const rankedUserIds = await applyBoostRanking(userIds);
// Returns users sorted by boost priority
```

### Get User Ranking Modifier
```typescript
import { calculateRankingModifier } from './services/boosts-ranking.service';

const modifier = await calculateRankingModifier(userId);
// modifier.priorityScore, modifier.multiplier, modifier.badges
```

### Check Location Override
```typescript
import { getEffectiveLocation } from './services/boosts-ranking.service';

const location = await getEffectiveLocation(userId, defaultLocation);
// Returns overridden location if Location Jump active
```

---

## 🔒 Eligibility Rules

✅ **Required:**
- Account verified
- Risk score ≤ 75
- Not banned or suspended
- Not under review
- Sufficient token balance

❌ **Blocked if:**
- Risk score > 75
- Account suspended/banned
- Under review
- Unverified account
- Insufficient tokens

---

## 📈 Revenue Model

- **100% Avalo Revenue** (no 65/35 split)
- Tokens deducted from user balance
- No creator earnings
- Direct platform profit

---

## 🛡️ Safety Guarantees

Boosts **DO NOT** affect:
- Chat/call pricing
- Free chat rules
- 65/35 payouts
- Royal pricing
- Meeting pricing
- Safety features
- Ban rules
- Scam detection
- NSFW consent

---

## 🔄 Scheduled Tasks

### Add to Cloud Scheduler
```typescript
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { deactivateExpiredBoosts } from './services/boosts.service';

export const deactivateExpiredBoostsTask = onSchedule(
  { schedule: 'every 1 hours', region: 'europe-west3' },
  async () => {
    await deactivateExpiredBoosts();
  }
);
```

---

## 📱 Navigation

Navigate to marketplace:
```typescript
router.push('/profile/boosts');
```

---

## 🎨 UI Components

### Display Boost Card
```tsx
import { BoostCard } from '../components/BoostCard';

<BoostCard
  type="spotlight"
  name="Spotlight"
  description="First position in discovery"
  duration={86400000}
  tokenPrice={50}
  icon="🔦"
  benefits={['Appear first', 'Max visibility', 'Stand out']}
  onPress={() => handlePurchase()}
/>
```

### Display Stats
```tsx
import { BoostStatsCard } from '../components/BoostStatsCard';

<BoostStatsCard
  icon="👀"
  label="Profile Views"
  value={1234}
  trend="up"
  trendValue="+15%"
/>
```

---

## 🗄️ Firestore Structure

### Collection: `boosts`
```
boosts/{boostId}
  - userId: string
  - type: string
  - startTime: number
  - endTime: number
  - isActive: boolean
  - tokensPaid: number
  - stats: object
```

### User Document Update
```
users/{userId}
  - activeBoosts: string[]
  - boostHistory: object
```

---

## ⚡ Performance Tips

1. **Cache Rankings**: Cache ranking modifiers for 1-2 minutes
2. **Batch Stats**: Update stats in batches every 30 seconds
3. **Index Queries**: Ensure Firestore indexes are created
4. **Lazy Load**: Load stats only when user views them
5. **Optimize Images**: Use compressed icons and graphics

---

## 🐛 Common Issues

**Issue**: Boost not activating
**Fix**: Check token balance and eligibility

**Issue**: Stats not updating
**Fix**: Wait 1-2 minutes, refresh screen

**Issue**: Purchase fails
**Fix**: Verify account status and balance

**Issue**: Location jump not working
**Fix**: Ensure valid coordinates provided

---

## 📊 Analytics Events

Track these events for analysis:
- `boost_viewed` - User viewed boost marketplace
- `boost_clicked` - User clicked on boost
- `boost_purchased` - Successful purchase
- `boost_activated` - Boost started
- `boost_expired` - Boost ended
- `boost_stats_viewed` - User checked stats

---

## ✅ Deployment Checklist

- [ ] Deploy Cloud Functions
- [ ] Create Firestore indexes
- [ ] Add scheduled tasks
- [ ] Update mobile app
- [ ] Test purchase flow
- [ ] Verify stats tracking
- [ ] Monitor error logs
- [ ] Track revenue metrics

---

## 📞 Support

For issues or questions:
1. Check [`PACK_252_BOOSTS_MARKETPLACE_IMPLEMENTATION.md`](./PACK_252_BOOSTS_MARKETPLACE_IMPLEMENTATION.md) for detailed docs
2. Review error logs in Firebase Console
3. Test with staging environment first
4. Monitor user feedback

---

*Quick Reference v1.0.0*
*Last Updated: 2025-12-03*