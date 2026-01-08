# PACK 50 — Royal Club (High-Spender Retention & VIP Layer)

## Implementation Summary

This pack implements a **STATUS + UI/EXPERIENCE layer** for high-spending users and VIP subscribers. It does **NOT** change token prices, message costs, or grant free tokens. This is purely a retention and recognition system.

---

## ✅ What Was Implemented

### Backend (Firebase Functions)

#### 1. **Royal Engine** (`functions/src/royalEngine.ts`)
- **Core Logic**: `computeRoyalTier()` - Pure deterministic function
- **Tier Thresholds** (30-day spend):
  - `ROYAL_SILVER`: 1,000+ tokens
  - `ROYAL_GOLD`: 5,000+ tokens
  - `ROYAL_PLATINUM`: 15,000+ tokens
- **Spend Aggregation**: `recordTokenSpend()` - Updates rolling spend stats
- **Membership Recomputation**: `recomputeRoyalMembership()` - Updates tier based on spend + subscription
- **Subscription Management**: Stripe integration for Royal subscriptions
- **Read APIs**: `getRoyalState()`, `getRoyalPreview()`
- **Cleanup**: `cleanupOldSpendRecords()` - Removes data >90 days old

#### 2. **Royal Endpoints** (`functions/src/royalEndpoints.ts`)
- `royal_getState_callable`: Get user's Royal membership state
- `royal_getPreview_callable`: Get next tier preview and tokens needed
- `royal_recompute_callable`: Manual recompute (debugging/admin)
- `royal_recordSpend_callable`: Record token spend from mobile
- **Security**: Users can only query/update their own Royal data

#### 3. **Royal Webhooks** (`functions/src/royalWebhooks.ts`)
- Handles Stripe subscription events:
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Extracts Royal tier from subscription metadata
- Triggers automatic membership recomputation

#### 4. **Scheduled Jobs** (`functions/src/index.ts`)
- `royal_dailyRecompute`: Daily job (midnight UTC) to recompute all memberships
- Ensures tier accuracy even if spend tracking misses events

#### 5. **Firestore Collections**

**royal_memberships/{userId}**
```typescript
{
  userId: string;
  tier: "NONE" | "ROYAL_SILVER" | "ROYAL_GOLD" | "ROYAL_PLATINUM";
  source: "SPEND_BASED" | "SUBSCRIPTION" | "MANUAL" | "NONE";
  spendLast30DaysTokens: number;
  spendLast90DaysTokens: number;
  activatedAt: Timestamp | null;
  expiresAt: Timestamp | null;
  lastRecomputedAt: Timestamp;
}
```

**royal_spend_stats/{userId}**
```typescript
{
  userId: string;
  rollingTokenSpendByDay: {
    "YYYY-MM-DD": number; // tokens spent that day
  };
  totalTokensLast30Days: number;
  totalTokensLast90Days: number;
  lastUpdatedAt: Timestamp;
}
```

**royal_subscriptions/{userId}**
```typescript
{
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  currentTier: "ROYAL_GOLD" | "ROYAL_PLATINUM";
  status: "active" | "canceled" | "incomplete" | "past_due";
  currentPeriodStart: Timestamp;
  currentPeriodEnd: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### Mobile (React Native)

#### 1. **Royal Service** (`app-mobile/services/royalService.ts`)
- **Types**: `RoyalTier`, `RoyalState`, `RoyalPreview`
- **AsyncStorage Caching**: 5-minute cache duration
  - `royal_state_v1_${userId}`
  - `royal_preview_v1_${userId}`
- **API Functions**:
  - `fetchRoyalState()`: Load from cache (non-blocking)
  - `refreshRoyalState()`: Fetch from backend (blocking)
  - `fetchRoyalPreview()`: Load from cache (non-blocking)
  - `refreshRoyalPreview()`: Fetch from backend (blocking)
  - `clearRoyalCache()`: Clear on logout
- **Helper Functions**:
  - `isRoyalTier()`: Check if tier is active
  - `isHighRoyalTier()`: Check if GOLD or PLATINUM
  - `getRoyalTierDisplayName()`: Get display name
  - `getRoyalTierColor()`: Get tier color

#### 2. **Royal Club Screen** (`app-mobile/screens/royal/RoyalClubScreen.tsx`)
- **Displays**:
  - Current Royal tier with visual badge
  - 30-day and 90-day spend stats
  - Next tier preview with tokens needed
  - Royal Club benefits list
- **Actions**:
  - "Browse Creators" → Navigate to discovery
  - "Upgrade to Royal" → Navigate to Stripe checkout (if not PLATINUM)
- **Refresh**: Pull-to-refresh functionality
- **Styling**: Tier-specific colors (Silver/Gold/Platinum)

#### 3. **Royal Badge Component** (`app-mobile/components/RoyalBadge.tsx`)
- Reusable badge component for displaying Royal status
- Sizes: small, medium, large
- Auto-hides for NONE tier
- Tier-specific colors and icon

#### 4. **Royal State Hook** (`app-mobile/hooks/useRoyalState.ts`)
- React hook for managing Royal state
- Auto-loads on mount, refreshes from backend
- Provides: `state`, `preview`, `loading`, `error`, `refresh`, `isRoyal`, `isHighRoyal`

#### 5. **Token Service Integration** (`app-mobile/services/tokenService.ts`)
- Modified `spendTokensForMessage()` to record Royal spend
- Non-blocking async call to `royal_recordSpend_callable`
- Silent failure - Royal tracking doesn't block token operations

---

### I18n Strings

#### English (`app-mobile/i18n/strings.en.json`)
```json
"royal": {
  "clubTitle": "Royal Club",
  "currentTier": "Your tier: {tier}",
  "spend30": "Tokens spent (last 30 days): {amount}",
  "spend90": "Tokens spent (last 90 days): {amount}",
  "nextTier": "Next tier: {tier}",
  "tokensToNext": "Tokens needed for next tier: {amount}",
  "badge": {
    "silver": "Royal Silver",
    "gold": "Royal Gold",
    "platinum": "Royal Platinum"
  },
  "upgradeCta": "Upgrade to Royal",
  "memberLabel": "Royal Club member"
}
```

#### Polish (`app-mobile/i18n/strings.pl.json`)
```json
"royal": {
  "clubTitle": "Royal Club",
  "currentTier": "Twój poziom: {tier}",
  "spend30": "Tokeny wydane (ostatnie 30 dni): {amount}",
  "spend90": "Tokeny wydane (ostatnie 90 dni): {amount}",
  "nextTier": "Kolejny poziom: {tier}",
  "tokensToNext": "Brakuje tokenów do kolejnego poziomu: {amount}",
  "badge": {
    "silver": "Royal Silver",
    "gold": "Royal Gold",
    "platinum": "Royal Platinum"
  },
  "upgradeCta": "Przejdź do Royal",
  "memberLabel": "Członek Royal Club"
}
```

---

## 🎯 Key Features

### 1. **Tier System**
- **NONE** (default) - No Royal status
- **ROYAL_SILVER** - 1,000+ tokens/month spend
- **ROYAL_GOLD** - 5,000+ tokens/month spend OR active Gold subscription
- **ROYAL_PLATINUM** - 15,000+ tokens/month spend OR active Platinum subscription

### 2. **Subscription Override**
- Active Royal subscription → **at least GOLD tier**
- High spend + subscription → **PLATINUM tier**
- Subscriptions processed via Stripe webhooks

### 3. **Spend Tracking**
- Rolling 30-day and 90-day totals
- Daily spend records in `rollingTokenSpendByDay`
- Automatic cleanup of records >90 days old
- Triggered by existing token spend events (PACK 39/41/42/48/49)

### 4. **VIP Perks** (Non-Monetary)
- ✨ VIP badge on profile and chat
- 👑 Dedicated "Royal Club" hub screen
- ⭐ Priority visibility labels in UI
- 💬 Optional "priority support" label

---

## ❌ What This Does NOT Do

1. **Does NOT reduce per-message costs** - All pricing from PACK 39/41/42 unchanged
2. **Does NOT grant free tokens** - No bonus credits, no rebates
3. **Does NOT offer discounts** - No price reductions of any kind
4. **Does NOT change revenue split** - Still 65/35 as defined in previous packs
5. **Does NOT modify Dynamic Paywall** - PACK 39 formulas untouched
6. **Does NOT alter Trust Engine** - PACK 46 semantics preserved

---

## 🔄 Integration Points

### Token Spending (All Packs)
Any code that spends tokens should ideally call `recordTokenSpend()` on the backend, but this is **optional and non-blocking**. The mobile app now calls `royal_recordSpend_callable` after spending tokens, but if this fails, the token operation still succeeds.

### Stripe Integration
Royal subscription webhooks are integrated into the existing `handleStripeWebhook` handler in `functions/src/index.ts`. Royal subscription events are processed first, then fall through to standard payment handling.

### UI Components
Royal badges can be added to:
- User profile screens (show user's own tier)
- Chat headers (show user's own tier)
- Token purchase screen (informational label only)

---

## 🚀 Deployment Steps

### 1. Deploy Firebase Functions
```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

### 2. Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
```

Note: You may need to merge `firestore-royal.rules` into your main `firestore.rules` file.

### 3. Set Up Stripe Products
Create Stripe products for Royal subscriptions:

**Royal Gold Monthly**
- Product ID: `royal_gold_monthly`
- Price: Set your pricing (e.g., $9.99/month)
- Metadata:
  - `type`: `royal_club`
  - `tier`: `ROYAL_GOLD`

**Royal Platinum Monthly**
- Product ID: `royal_platinum_monthly`
- Price: Set your pricing (e.g., $29.99/month)
- Metadata:
  - `type`: `royal_club`
  - `tier`: `ROYAL_PLATINUM`

### 4. Update Mobile App
```bash
cd app-mobile
npm install
# Build and deploy to app stores
```

---

## 📊 Monitoring & Analytics

### Firestore Queries

**Check user's Royal tier:**
```javascript
const membership = await db.collection('royal_memberships').doc(userId).get();
console.log('Tier:', membership.data()?.tier);
```

**Check spend stats:**
```javascript
const stats = await db.collection('royal_spend_stats').doc(userId).get();
console.log('30-day spend:', stats.data()?.totalTokensLast30Days);
```

**Check active subscriptions:**
```javascript
const sub = await db.collection('royal_subscriptions').doc(userId).get();
console.log('Subscription status:', sub.data()?.status);
```

### Cloud Functions Logs

Watch for Royal-related logs:
```bash
firebase functions:log --only royal_getState_callable,royal_recordSpend_callable,royal_dailyRecompute
```

---

## 🧪 Testing Checklist

### Backend Tests
- [ ] `computeRoyalTier()` returns correct tier for various spend levels
- [ ] `recordTokenSpend()` updates rolling totals correctly
- [ ] `recomputeRoyalMembership()` syncs with spend and subscription
- [ ] Stripe webhook creates/updates/deletes subscriptions
- [ ] `royal_getState_callable` returns correct data
- [ ] `royal_getPreview_callable` calculates next tier correctly
- [ ] Daily scheduled job processes memberships

### Mobile Tests
- [ ] `royalService.ts` caches and fetches data correctly
- [ ] `RoyalClubScreen` displays tier and stats
- [ ] `RoyalBadge` component renders with correct colors
- [ ] `useRoyalState` hook loads and refreshes data
- [ ] Token spend triggers Royal tracking (non-blocking)
- [ ] Cache expires after 5 minutes
- [ ] Fallback to default state if APIs fail

### Integration Tests
- [ ] Spend 1,000 tokens → achieves SILVER
- [ ] Spend 5,000 tokens → achieves GOLD
- [ ] Spend 15,000 tokens → achieves PLATINUM
- [ ] Subscribe to Royal Gold → achieves GOLD (even with <5k spend)
- [ ] Cancel subscription → tier recalculates based on spend only
- [ ] 30-day window rolls correctly
- [ ] Old spend records are cleaned up after 90 days

---

## 🎨 UI Integration Examples

### Example 1: Display Royal Badge on Profile
```typescript
import { useRoyalState } from '../hooks/useRoyalState';
import RoyalBadge from '../components/RoyalBadge';

function ProfileScreen({ userId }) {
  const { state, isRoyal } = useRoyalState(userId);
  
  return (
    <View>
      {isRoyal && <RoyalBadge tier={state.tier} size="medium" />}
      {/* Rest of profile */}
    </View>
  );
}
```

### Example 2: Add Royal Club to Navigation
```typescript
// In your main navigation or profile menu:
<TouchableOpacity onPress={() => navigation.navigate('RoyalClubScreen', { userId })}>
  <Text>Royal Club</Text>
</TouchableOpacity>
```

### Example 3: Display Label on Token Purchase Screen
```typescript
import { useRoyalState } from '../hooks/useRoyalState';

function TokenPurchaseScreen({ userId }) {
  const { state, isRoyal } = useRoyalState(userId);
  
  return (
    <View>
      {isRoyal && (
        <Text style={styles.royalLabel}>
          You are {state.tier.replace('ROYAL_', 'Royal ')} – your activity is recognized.
        </Text>
      )}
      {/* Rest of purchase UI */}
    </View>
  );
}
```

---

## 📈 Royal Club Tier Logic

### Priority Order

1. **SUBSCRIPTION OVERRIDE**
   - If `hasActiveRoyalSubscription === true`:
     - Base tier: `ROYAL_GOLD`
     - If `spendLast30Days >= 15,000`: `ROYAL_PLATINUM`

2. **SPEND-BASED TIERS**
   - `spendLast30Days < 1,000`: `NONE`
   - `1,000 <= spendLast30Days < 5,000`: `ROYAL_SILVER`
   - `5,000 <= spendLast30Days < 15,000`: `ROYAL_GOLD`
   - `spendLast30Days >= 15,000`: `ROYAL_PLATINUM`

### Calculation Flow

```
User spends tokens
  ↓
Mobile calls royal_recordSpend (async, non-blocking)
  ↓
Backend updates royal_spend_stats
  ↓
Backend triggers recomputeRoyalMembership
  ↓
Backend checks:
  1. Active subscription? → GOLD or PLATINUM (based on spend)
  2. No subscription → Spend-based tier
  ↓
Backend updates royal_memberships
  ↓
Mobile fetches updated state on next refresh
```

---

## 🔒 Security Rules

**Read Access**: Users can read their own Royal data only  
**Write Access**: Only backend (admin SDK) can write  

See [`firestore-royal.rules`](firestore-royal.rules) for complete rules.

---

## 🛠️ Maintenance

### Weekly Monitoring
- Check daily recompute job logs
- Verify spend aggregation accuracy
- Monitor subscription webhook processing

### Monthly Tasks
- Analyze tier distribution
- Review subscription retention
- Optimize tier thresholds if needed

### Cleanup
The system automatically:
- Removes spend records >90 days old
- Recalculates tiers daily
- Handles subscription cancellations

---

## 📝 Notes

### Backward Compatibility
- All changes are **additive only**
- If Royal APIs fail, app falls back to normal behavior
- No crashes or blocking behavior
- Existing pricing/billing unchanged

### Performance
- Spend tracking is **async and non-blocking**
- Mobile uses **aggressive caching** (5-minute TTL)
- Backend uses **batch operations** for daily jobs
- Old data is **automatically cleaned up**

### Future Enhancements
Potential future additions (NOT in this pack):
- Royal-exclusive features (e.g., custom profile themes)
- Royal-only events or content
- Enhanced analytics for Royal members
- Royal referral bonuses (cosmetic only)

---

## ✅ Success Verification

Run through this checklist to verify PACK 50 is working:

### Backend
- [ ] `royal_memberships` collection exists and updates
- [ ] `royal_spend_stats` collection tracks spend correctly
- [ ] `royal_subscriptions` collection syncs with Stripe
- [ ] `royal_getState_callable` returns valid data
- [ ] `royal_getPreview_callable` calculates next tier
- [ ] `royal_recordSpend_callable` updates spend stats
- [ ] Daily job runs without errors
- [ ] Stripe webhooks process Royal subscriptions

### Mobile
- [ ] `royalService.ts` caches data in AsyncStorage
- [ ] `RoyalClubScreen` displays tier and stats
- [ ] `RoyalBadge` component renders correctly
- [ ] `useRoyalState` hook works in components
- [ ] Token spending records Royal spend (async)
- [ ] Cache expires and refreshes properly
- [ ] Fallback works if backend fails

### Integration
- [ ] No token pricing changed
- [ ] No message costs changed
- [ ] No free tokens granted
- [ ] No discounts applied
- [ ] Revenue split still 65/35
- [ ] Dynamic Paywall formulas unchanged
- [ ] Trust Engine semantics preserved
- [ ] App compiles without errors

---

## 🎉 Implementation Complete

PACK 50 — Royal Club is now fully implemented as a **recognition and retention layer** for high-value users. The system:

✅ Identifies high spenders automatically  
✅ Supports Royal subscriptions via Stripe  
✅ Provides VIP badges and exclusive UI  
✅ Maintains all existing pricing/billing  
✅ Is fully backward-compatible  
✅ Falls back gracefully on errors  

**NO FREE TOKENS • NO DISCOUNTS • NO PRICE CHANGES**

This is a **pure status layer** to recognize and retain your most valuable users.