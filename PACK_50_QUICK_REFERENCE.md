# PACK 50 — Royal Club Quick Reference

## 📋 TL;DR

**Royal Club** is a **status + recognition layer** that identifies high-spending users and VIP subscribers. It provides badges, exclusive UI, and a dedicated hub screen—**WITHOUT changing token prices, message costs, or granting free tokens**.

---

## 🎯 Royal Tiers

| Tier | Requirement | Benefits |
|------|------------|----------|
| **NONE** | Default | Standard experience |
| **ROYAL_SILVER** | 1,000+ tokens/month | VIP badge, Royal Club hub |
| **ROYAL_GOLD** | 5,000+ tokens/month OR Gold subscription | Enhanced badge, priority labels |
| **ROYAL_PLATINUM** | 15,000+ tokens/month OR Platinum subscription | Premium badge, full benefits |

**Subscription Override**: Active Royal subscription grants **at least GOLD tier**. With high spend, upgrades to **PLATINUM**.

---

## 🔧 Quick Integration

### Display Royal Badge
```typescript
import RoyalBadge from '../components/RoyalBadge';
import { useRoyalState } from '../hooks/useRoyalState';

function Profile({ userId }) {
  const { state, isRoyal } = useRoyalState(userId);
  
  return (
    <View>
      {isRoyal && <RoyalBadge tier={state.tier} />}
    </View>
  );
}
```

### Add Royal Club to Navigation
```typescript
<TouchableOpacity onPress={() => navigate('RoyalClubScreen', { userId })}>
  <Text>Royal Club</Text>
</TouchableOpacity>
```

### Check Royal Status
```typescript
const { state } = useRoyalState(userId);
if (state.tier === 'ROYAL_PLATINUM') {
  console.log('Platinum member!');
}
```

---

## 📊 Data Model

### Collections

**royal_memberships/{userId}**
- Stores current tier and spend stats
- Read-only for clients, writable by backend only

**royal_spend_stats/{userId}**
- Rolling daily spend records
- Auto-cleanup after 90 days

**royal_subscriptions/{userId}**
- Stripe subscription details
- Synced via webhooks

---

## 🚀 API Endpoints

### Mobile → Backend

```typescript
// Get Royal state
const { tier, source, spendLast30DaysTokens } = 
  await callable('royal_getState_callable', { userId });

// Get next tier preview
const { currentTier, nextTier, tokensNeededForNextTier } = 
  await callable('royal_getPreview_callable', { userId });

// Record token spend (automatic from tokenService)
await callable('royal_recordSpend_callable', { userId, tokensSpent });
```

---

## 🎨 Colors

```typescript
ROYAL_SILVER:   '#C0C0C0' // Metallic silver
ROYAL_GOLD:     '#D4AF37' // Gold
ROYAL_PLATINUM: '#E5E4E2' // Platinum/light gradient
```

---

## ⚙️ Configuration

### Tier Thresholds (30-day spend)
```typescript
SILVER:   1,000 tokens
GOLD:     5,000 tokens
PLATINUM: 15,000 tokens
```

### Subscription Tiers
- **Royal Gold**: Monthly subscription → GOLD tier minimum
- **Royal Platinum**: Monthly subscription → potential PLATINUM tier

### Cache Duration
- **Mobile**: 5 minutes (AsyncStorage)
- **Backend**: Real-time (Firestore)

---

## 🔒 Security

- ✅ Users can only read their own Royal data
- ✅ No client-side writes (backend admin SDK only)
- ✅ Firestore rules enforce user-level access
- ✅ Cloud Functions validate `auth.uid === userId`

---

## 🐛 Troubleshooting

### Royal state not updating?
1. Check if `royal_recordSpend_callable` is being called
2. Verify daily recompute job is running
3. Check Firestore collections for data

### Subscription not granting tier?
1. Verify Stripe webhook is configured
2. Check product metadata includes `type: royal_club`
3. Review webhook logs in Firebase console

### Mobile cache stale?
1. Cache expires after 5 minutes automatically
2. Call `refreshRoyalState()` to force refresh
3. Clear cache with `clearRoyalCache(userId)`

---

## 📦 Files Created

### Backend
- `functions/src/royalEngine.ts` - Core tier logic
- `functions/src/royalEndpoints.ts` - API endpoints
- `functions/src/royalWebhooks.ts` - Stripe integration
- `functions/src/royalSpendTracking.ts` - Spend tracking helpers
- `functions/src/royalEngine.test.ts` - Unit tests
- `firestore-royal.rules` - Security rules

### Mobile
- `app-mobile/services/royalService.ts` - Service layer
- `app-mobile/screens/royal/RoyalClubScreen.tsx` - Hub screen
- `app-mobile/components/RoyalBadge.tsx` - Badge component
- `app-mobile/hooks/useRoyalState.ts` - React hook

### Documentation
- `PACK_50_IMPLEMENTATION.md` - Full implementation details
- `PACK_50_INTEGRATION_GUIDE.md` - Integration examples
- `PACK_50_QUICK_REFERENCE.md` - This file

---

## ✅ Success Checklist

### Must Verify
- [ ] No token pricing changed
- [ ] No message costs changed
- [ ] No free tokens granted
- [ ] No discounts applied
- [ ] Revenue split unchanged (65/35)
- [ ] All changes backward-compatible
- [ ] Graceful fallback on errors
- [ ] TypeScript compiles without errors

### Royal-Specific
- [ ] `royal_memberships` collection populates
- [ ] `royal_spend_stats` tracks spend accurately
- [ ] Stripe subscriptions sync via webhooks
- [ ] Mobile displays Royal badges correctly
- [ ] Royal Club screen loads without crashes
- [ ] Cache expires and refreshes properly
- [ ] Daily recompute job runs successfully

---

## 🎯 Key Principles

1. **Recognition, Not Rewards** - Royal Club is about status, not discounts
2. **Non-Blocking** - Royal tracking never blocks core operations
3. **Backward Compatible** - Works with or without Royal data
4. **Graceful Degradation** - Falls back to normal behavior on errors
5. **Zero Impact on Pricing** - All monetization rules unchanged

---

## 📞 Support

### Check User's Royal Status (Admin)
```javascript
// In Firebase Console or admin script
const membership = await admin.firestore()
  .collection('royal_memberships')
  .doc(userId)
  .get();
  
console.log('Tier:', membership.data()?.tier);
console.log('30-day spend:', membership.data()?.spendLast30DaysTokens);
```

### Manual Tier Override (Admin Only)
```javascript
await admin.firestore()
  .collection('royal_memberships')
  .doc(userId)
  .update({
    tier: 'ROYAL_PLATINUM',
    source: 'MANUAL',
    notes: 'Manual override by admin',
    lastRecomputedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
```

### Force Recompute
```javascript
const { recomputeRoyalMembership } = require('./royalEngine');
await recomputeRoyalMembership(userId);
```

---

## 📈 Monitoring

### Cloud Functions Logs
```bash
# Watch Royal endpoints
firebase functions:log --only royal_getState_callable

# Watch daily job
firebase functions:log --only royal_dailyRecompute

# Watch spend tracking
firebase functions:log --only royal_recordSpend_callable
```

### Firestore Queries
```javascript
// Count users by tier
const silverCount = await db.collection('royal_memberships')
  .where('tier', '==', 'ROYAL_SILVER').count().get();

const goldCount = await db.collection('royal_memberships')
  .where('tier', '==', 'ROYAL_GOLD').count().get();

const platinumCount = await db.collection('royal_memberships')
  .where('tier', '==', 'ROYAL_PLATINUM').count().get();
```

---

## 🎉 That's It!

Royal Club is **live and ready**. Users will automatically receive Royal status as they spend, and you can offer Royal subscriptions through Stripe for instant GOLD tier access.

**Remember**: This is a **retention tool**, not a discount system. Royal Club recognizes your best users without disrupting your monetization model.

---

**Questions?** See [`PACK_50_IMPLEMENTATION.md`](PACK_50_IMPLEMENTATION.md) for full details or [`PACK_50_INTEGRATION_GUIDE.md`](PACK_50_INTEGRATION_GUIDE.md) for integration examples.