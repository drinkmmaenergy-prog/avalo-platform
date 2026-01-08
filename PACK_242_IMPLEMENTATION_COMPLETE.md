# PACK 242 - Dynamic Chat Pricing Modifier Implementation

**Status:** ✅ COMPLETE  
**Date:** December 3, 2024  
**Version:** 1.0

---

## Overview

PACK 242 implements a **performance-based dynamic chat pricing system** that allows elite creators to increase their chat entry price from 100 tokens (baseline) to 500 tokens (maximum). This system replaces PACK 219 with stricter, performance-based eligibility criteria.

### Key Features

✅ **Performance-Based Unlock** - Earned through metrics, not purchased  
✅ **Gender-Inclusive** - Women/nonbinary eligible by default; men need Influencer Badge  
✅ **6 Strict Requirements** - 60+ days active, 250+ partners OR 100+ bookings, 70%+ reply rate, 4.3★+ rating, 35k+ tokens/month, 0 safety violations  
✅ **Price Lock Protection** - Locks pricing on 3 consecutive months of earnings drop  
✅ **Anti-Bait & Switch** - Cannot reduce price after increasing  
✅ **Discovery Feed Protection** - Automatically adjusts visibility to protect conversion rates  
✅ **30-Day Cooldown** - Prices can only change once every 30 days  

### Economics (Unchanged)

- **Revenue Split:** 65% to creator, 35% to Avalo
- **Word Billing:** 11 words = 1 token (standard), 7 words = 1 token (Royal)
- **Base Price:** 100 tokens for everyone
- **Maximum Price:** 500 tokens for highest performers

---

## Architecture

### Collections

**`pack242_dynamic_pricing`** - Main pricing documents
```typescript
{
  userId: string;
  eligible: boolean;
  currentPrice: number; // 100-500
  currentLevel: 0 | 1 | 2 | 3 | 4 | 5;
  lastPriceChange: Timestamp | null;
  lockedReason: 'earningsDrop' | 'violation' | null;
  monthlyEarnings: { [monthKey: string]: number };
  consecutiveDropMonths: number;
  requirements: { /* performance metrics */ };
  gender: 'male' | 'female' | 'other';
  hasInfluencerBadge: boolean;
}
```

**`pack242_dynamic_pricing/{userId}/history`** - Price change history
```typescript
{
  fromLevel: number;
  toLevel: number;
  fromPrice: number;
  toPrice: number;
  reason: 'manual' | 'earningsDrop' | 'violation';
  changedAt: Timestamp;
  analytics: { monthlyEarnings, replyRate, reviewRating };
}
```

**`pack242_discovery_adjustments`** - Feed visibility adjustments
```typescript
{
  userId: string;
  priceLevel: 0-5;
  showToHighBudget: number; // 100-200%
  showToMediumBudget: number; // 50-100%
  showToLowBudget: number; // 10-100%
}
```

---

## Price Tiers

| Level | Name | Token Cost | Description |
|-------|------|------------|-------------|
| 0 | Level 0 (Default) | 100 | Default entry price for all chats |
| 1 | Level 1 | 150 | First tier for proven performers |
| 2 | Level 2 | 200 | Mid tier for consistent earners |
| 3 | Level 3 | 300 | High tier for top performers |
| 4 | Level 4 | 400 | Elite tier for exceptional earners |
| 5 | Level 5 (Maximum) | 500 | Maximum tier for highest performers |

---

## Eligibility Requirements

All 6 requirements must be met simultaneously:

### 1. Active Days
- **Requirement:** ≥ 60 days since account creation
- **Check:** Account age calculation

### 2. Fan-Base Size
- **Requirement:** 250+ unique paid chat partners **OR** 100+ calendar bookings
- **Check:** Count unique users in PAID chats with `billing.totalConsumed > 0`

### 3. Engagement Quality
- **Requirement:** 70%+ reply rate within 6 hours average
- **Check:** Track messages in last 90 days, calculate reply % and avg time

### 4. Safety Violations
- **Requirement:** 0 violations
- **Check:** Count medium/high/critical safety incidents

### 5. Review Rating
- **Requirement:** 4.3★ or higher
- **Check:** User's `stats.reviewRating`

### 6. Monthly Earnings
- **Requirement:** ≥ 35,000 tokens per month (before 35% Avalo share)
- **Check:** Calculate last complete month's earnings from transactions

### 7. Gender-Based Permission
- **Women/Nonbinary:** Eligible if meet performance requirements
- **Men:** Must have Influencer Badge + meet performance requirements

---

## Discovery Feed Algorithm

High-price creators are shown more to high-budget users and less to low-budget users.

### User Budget Classification

```typescript
// Based on last 30 days spending
if (totalSpent >= 5000) return 'high';
if (totalSpent >= 1000) return 'medium';
return 'low';
```

### Visibility Adjustments

| Price Level | High Budget | Medium Budget | Low Budget |
|-------------|-------------|---------------|------------|
| Level 0 (100) | 100% | 100% | 100% |
| Level 1 (150) | 100% | 100% | 80% |
| Level 2 (200) | 120% | 100% | 60% |
| Level 3 (300) | 150% | 90% | 40% |
| Level 4 (400) | 180% | 70% | 20% |
| Level 5 (500) | 200% | 50% | 10% |

**Example:** A Level 5 creator (500 tokens) appears **twice as often** to high-budget users but only **10% as often** to low-budget users.

---

## Implementation Files

### Backend (Cloud Functions)

1. **[`functions/src/pack242DynamicChatPricing.ts`](functions/src/pack242DynamicChatPricing.ts:1)** (914 lines)
   - Core eligibility checking
   - Price tier management
   - Monthly earnings tracking
   - Earnings drop detection

2. **[`functions/src/pack242Functions.ts`](functions/src/pack242Functions.ts:1)** (251 lines)
   - Callable Cloud Functions
   - Scheduled jobs (weekly eligibility, monthly tracking, daily analytics)

3. **[`functions/src/pack242DiscoveryIntegration.ts`](functions/src/pack242DiscoveryIntegration.ts:1)** (252 lines)
   - Discovery feed adjustments
   - Budget classification
   - Visibility calculations

4. **[`functions/src/chatMonetization.ts`](functions/src/chatMonetization.ts:23)** (updated)
   - Integrated with chat deposit flow
   - Uses `getPack242ChatEntryPrice()` instead of PACK 219

### Frontend (React Native)

5. **[`app-mobile/app/profile/settings/dynamic-pricing.tsx`](app-mobile/app/profile/settings/dynamic-pricing.tsx:1)** (482 lines)
   - UI for creators to view eligibility
   - Price tier selection
   - Performance metrics display
   - Progress tracking

### Database

6. **[`firestore-pack242-dynamic-pricing.rules`](firestore-pack242-dynamic-pricing.rules:1)** (44 lines)
   - Security rules for pricing documents

7. **[`firestore-pack242-dynamic-pricing.indexes.json`](firestore-pack242-dynamic-pricing.indexes.json:1)** (98 lines)
   - Composite indexes for queries

---

## API Reference

### Cloud Functions

#### checkPack242EligibilityCallable
```typescript
// Client call
const result = await functions.httpsCallable('checkPack242EligibilityCallable')();
// Returns: { eligible, reasons, requirements, canUse }
```

#### changePack242PriceTierCallable
```typescript
// Client call
const result = await functions.httpsCallable('changePack242PriceTierCallable')({ 
  newLevel: 2 // 0-5
});
// Returns: { success, message }
```

#### getPack242ChatPriceCallable
```typescript
// Get current price
const result = await functions.httpsCallable('getPack242ChatPriceCallable')();
// Returns: { success, price }
```

#### getPack242AnalyticsCallable (Admin Only)
```typescript
// Get system-wide analytics
const result = await functions.httpsCallable('getPack242AnalyticsCallable')();
// Returns: { totalEligible, totalLocked, priceDistribution, avgEarnings, topEarners }
```

#### unlockPack242PricingCallable (Admin Only)
```typescript
// Unlock a locked user
const result = await functions.httpsCallable('unlockPack242PricingCallable')({
  targetUserId: 'user123'
});
// Returns: { success, message }
```

### Scheduled Functions

**Weekly Eligibility Check**
- **Schedule:** Every Sunday at 2 AM UTC
- **Function:** `pack242WeeklyEligibilityCheck`
- **Action:** Evaluates all earners, updates eligibility status

**Monthly Earnings Tracking**
- **Schedule:** 1st of each month at 3 AM UTC
- **Function:** `pack242MonthlyEarningsTracking`
- **Action:** Tracks earnings, detects drops, applies locks

**Daily Analytics Snapshot**
- **Schedule:** Every day at 4 AM UTC
- **Function:** `pack242DailyAnalyticsSnapshot`
- **Action:** Records analytics for monitoring

---

## Integration Guide

### Step 1: Deploy Functions

```bash
cd functions
npm install
firebase deploy --only functions:pack242WeeklyEligibilityCheck,functions:pack242MonthlyEarningsTracking,functions:pack242DailyAnalyticsSnapshot
firebase deploy --only functions:checkPack242EligibilityCallable,functions:changePack242PriceTierCallable,functions:getPack242ChatPriceCallable
```

### Step 2: Deploy Firestore Rules

```bash
# Add pack242 rules to your main firestore.rules file
firebase deploy --only firestore:rules
```

### Step 3: Create Indexes

```bash
firebase deploy --only firestore:indexes
```

### Step 4: Integrate with Discovery Feed

```typescript
import { applyPack242DiscoveryAdjustments } from './pack242DiscoveryIntegration';

// In your discovery feed algorithm
const profiles = await getDiscoveryProfiles(userId);
const adjustedProfiles = await applyPack242DiscoveryAdjustments(profiles, userId);
// Use adjustedProfiles sorted by adjustedScore
```

### Step 5: Add UI Navigation

```typescript
// In settings menu
<TouchableOpacity onPress={() => router.push('/profile/settings/dynamic-pricing')}>
  <Text>Dynamic Pricing</Text>
</TouchableOpacity>
```

---

## Usage Examples

### Check Eligibility

```typescript
const functions = getFunctions();
const checkEligibility = httpsCallable(functions, 'checkPack242EligibilityCallable');

try {
  const result = await checkEligibility();
  const data = result.data as { data: EligibilityData };
  
  if (data.data.eligible) {
    console.log('✅ User is eligible for dynamic pricing');
  } else {
    console.log('❌ Not eligible:', data.data.reasons);
  }
} catch (error) {
  console.error('Error:', error);
}
```

### Change Price Tier

```typescript
const changePrice = httpsCallable(functions, 'changePack242PriceTierCallable');

try {
  const result = await changePrice({ newLevel: 3 }); // Set to Level 3 (300 tokens)
  const data = result.data as { success: boolean; message: string };
  
  if (data.success) {
    Alert.alert('Success', data.message);
  } else {
    Alert.alert('Error', data.message);
  }
} catch (error) {
  console.error('Error:', error);
}
```

### Admin: View Analytics

```typescript
const getAnalytics = httpsCallable(functions, 'getPack242AnalyticsCallable');

try {
  const result = await getAnalytics();
  const data = result.data as { data: Analytics };
  
  console.log('Total Eligible:', data.data.totalEligible);
  console.log('Total Locked:', data.data.totalLocked);
  console.log('Price Distribution:', data.data.priceDistribution);
  console.log('Top Earners:', data.data.topEarners);
} catch (error) {
  console.error('Error:', error);
}
```

---

## Business Logic

### Price Change Rules

1. **Cannot Reduce Price** - Once increased, price can only go up
2. **30-Day Cooldown** - Must wait 30 days between manual changes
3. **Eligibility Required** - Must meet all 6 requirements
4. **Gender Check** - Men must have Influencer Badge

### Automatic Price Lock

Price automatically locks to Level 0 when:
- **3 Consecutive Months** of earnings drops below 85% of previous month
- **Safety Violation** occurs

### Unlock Conditions

- Admin can manually unlock via `unlockPack242PricingCallable`
- Locked users must re-qualify to change price again

---

## Testing Checklist

- [ ] Eligibility check returns correct status for all 6 requirements
- [ ] Price change succeeds when eligible
- [ ] Price change fails when not eligible
- [ ] Cannot reduce price (bait & switch protection)
- [ ] 30-day cooldown enforced
- [ ] Men without Influencer Badge blocked
- [ ] Women/nonbinary can access if eligible
- [ ] Monthly earnings tracking runs successfully
- [ ] Earnings drop detection works (3 consecutive months)
- [ ] Automatic lock applied correctly
- [ ] Discovery feed adjustments calculated correctly
- [ ] Budget classification works for all tiers
- [ ] UI shows correct eligibility status
- [ ] UI prevents invalid price changes
- [ ] Admin analytics accessible
- [ ] Admin unlock function works

---

## Monitoring & Analytics

### Key Metrics to Track

1. **Adoption Rate** - % of eligible creators using dynamic pricing
2. **Price Distribution** - How many creators at each tier
3. **Earnings Impact** - Revenue changes after price increases
4. **Conversion Rates** - Chat initiation rates by price tier
5. **Lock Rate** - % of users locked due to earnings drops
6. **Budget Distribution** - Balance of high/medium/low budget users

### Dashboard Queries

```typescript
// Get current stats
const analytics = await getPack242Analytics();

// Get locked users
const lockedUsers = await db.collection('pack242_dynamic_pricing')
  .where('lockedReason', '!=', null)
  .get();

// Get price tier distribution
const tierDist = analytics.priceDistribution;
console.log('Level 0:', tierDist[0]);
console.log('Level 5:', tierDist[5]);
```

---

## Migration from PACK 219

PACK 242 replaces PACK 219 with stricter requirements. Migration steps:

1. ✅ Update imports in [`chatMonetization.ts`](functions/src/chatMonetization.ts:23)
2. ⚠️ Existing PACK 219 users need re-evaluation
3. 📊 Run weekly eligibility check to classify users
4. 🔄 Users not meeting PACK 242 requirements revert to 100 tokens
5. 📝 Communicate changes to creators via app notification

---

## Support & Troubleshooting

### Common Issues

**Issue:** User meets requirements but shows not eligible
- **Solution:** Check `canUse` field - men need Influencer Badge

**Issue:** Price change fails with cooldown error
- **Solution:** Check `lastPriceChange` - must be 30+ days ago

**Issue:** User locked unexpectedly
- **Solution:** Check `monthlyEarnings` - 3 consecutive drops triggers lock

**Issue:** Discovery feed not adjusting
- **Solution:** Verify `pack242_discovery_adjustments` document exists

### Admin Actions

```typescript
// Unlock a user (admin only)
const unlock = httpsCallable(functions, 'unlockPack242PricingCallable');
await unlock({ targetUserId: 'user123' });

// Check user's detailed status
const userPricing = await db.collection('pack242_dynamic_pricing').doc('user123').get();
console.log(userPricing.data());
```

---

## Compliance & Safety

### Anti-Abuse Measures

✅ **Safety Violations Block** - Any violation = lose eligibility  
✅ **Earnings Verification** - Tracked from actual transactions  
✅ **Reply Rate Validation** - Based on real message timestamps  
✅ **No Price Reduction** - Prevents bait & switch tactics  
✅ **Admin Override** - Manual control for edge cases  

### Data Privacy

- User pricing data visible only to user and admins
- Discovery adjustments visible to recommendation engine
- History tracked for transparency

---

## Confirmation String

```
PACK 242 COMPLETE — Dynamic Chat Pricing Modifier implemented. 
Elite creators who meet performance requirements (60+ days active, 
250+ partners OR 100+ bookings, 70%+ reply rate, 4.3★+ rating, 
35k+ tokens/month, 0 violations) can increase chat price from 
100-500 tokens. Gender-inclusive (men need Influencer Badge). 
Discovery feed automatically adjusts to protect conversion. 
No price reduction allowed. 30-day cooldown. 3-month earnings 
drop triggers automatic lock to baseline.
```

---

## Next Steps

1. **Deploy Functions** - Run deployment commands
2. **Test Eligibility** - Verify checking logic with test users
3. **Monitor Adoption** - Track how many creators qualify
4. **Gather Feedback** - Survey creators about the feature
5. **Optimize Thresholds** - Adjust requirements based on data
6. **A/B Test Discovery** - Compare conversion rates with/without adjustments

---

**Implementation Complete ✅**

All PACK 242 components successfully implemented and ready for deployment.