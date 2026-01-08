# PACK 219 - Royal Dynamic Chat Pricing Evolution
## Implementation Complete ✅

## Overview

PACK 219 implements dynamic chat entry pricing, allowing qualified earners to increase their chat entry price from the base 100 tokens to 120-500 tokens based on demand, chemistry, and reputation. This system maintains economic balance while rewarding high-performing creators.

**Key Principle**: The base chat deposit price REMAINS 100 tokens. Only qualified earners can raise their price through strict eligibility requirements.

## Implementation Status

✅ **COMPLETE** - All specification requirements implemented

## Core Features Implemented

### 1. Price Tiers

Six predefined tiers with increasing token costs:

| Tier | Name | Cost | Description | Min Reputation |
|------|------|------|-------------|----------------|
| STANDARD | Standard | 100 | Default for all | - |
| GLOW | Glow | 120 | Subtle boost | 50 |
| DESIRE | Desire | 175 | Medium boost | 75 |
| STAR | Star | 250 | High attraction | 85 |
| ROYAL | Royal | 350 | Elite tier | 90 |
| FANTASY | Fantasy | 500 | Maximum demand | 95 |

### 2. Eligibility Requirements

All conditions MUST be met for dynamic pricing eligibility:

| Requirement | Threshold | Purpose |
|-------------|-----------|---------|
| Verified Identity | Completed selfie + document match | Prevent fraud |
| Verified Appearance | 2+ completed dates with selfie match | Confirm authenticity |
| Clean Reputation | No safety flags in last 60 days | Safety first |
| Activity Level | 20+ completed chats | Proven track record |
| Chemistry Score | 6+ "Good Vibe" marks from 6+ different users | Quality validation |
| Recent Engagement | Activity in last 14 days | Active users only |

### 3. Economic Rules (Non-Negotiable)

- **65% to earner** (unchanged from base system)
- **35% to Avalo** (unchanged from base system)
- No bonus multipliers
- No discount mechanisms
- No compensation for low performers
- Word-to-token ratio (7/11) **stays unchanged**

**Revenue Flow Example**:
- User selects ROYAL tier (350 tokens)
- Platform fee: 35% × 350 = 123 tokens (to Avalo)
- Escrow: 65% × 350 = 227 tokens (available for billing)
- Earner receives consumed tokens from escrow
- Unused escrow refunded to payer on chat close

### 4. Anti-Abuse Mechanisms

#### Price Change Cooldown
- Changes allowed **once per 7 days**
- Prevents price manipulation
- Applies only to manual changes (not auto-fallback)

#### Demand-Based Auto-Fallback
- Monitors chat demand over 14-day periods
- If chat rate drops ≥65%, automatic tier reduction
- Runs daily as background job
- Example: ROYAL → STAR if demand drops 65%

#### Transparency
- Price visible before chat starts
- Clear tier display in Discovery
- No hidden costs or surprises

#### New User Protection
- New users cannot select FANTASY tier immediately
- Progressive unlocking based on reputation growth

### 5. Analytics for Earners

Real-time pricing analytics include:

```typescript
{
  currentTier: 'ROYAL',
  currentPrice: 350,
  chatsInitiated: 45,        // Last 14 days
  chatsCompleted: 38,        // Successful chats
  conversionRate: 0.84,      // 84% completion
  averageEarnings: 280,      // Per chat
  demandTrend: 'rising',     // rising | stable | falling
  recommendedAction: 'maintain' // increase | maintain | decrease
}
```

**Analytics Page Features**:
- Price → Views → Chats → Earnings correlation
- Demand trends visualization
- Conversion rate tracking
- Recommended pricing actions
- Historical performance data

## Files Created/Modified

### 1. Core Implementation
**File**: [`functions/src/dynamicChatPricing.ts`](functions/src/dynamicChatPricing.ts) (744 lines)

✅ Complete eligibility evaluator
✅ Price tier management with validation
✅ Auto-fallback mechanism
✅ Analytics calculation engine
✅ Integration hooks for chat system
✅ Scheduled job orchestration

**Key Functions**:
- `evaluatePricingEligibility()` - Checks all 6 requirements
- `changePricingTier()` - Validates and applies tier changes
- `checkAndApplyDemandFallback()` - Auto-fallback logic
- `getChatEntryPrice()` - Returns current price for user
- `getPricingAnalytics()` - Real-time performance data

### 2. Chat Integration
**File**: [`functions/src/chatMonetization.ts`](functions/src/chatMonetization.ts) (Modified)

✅ Import dynamic pricing module
✅ Modified `processChatDeposit()` to use dynamic prices
✅ Revenue split calculation using tier prices
✅ Maintains backward compatibility

**Changes**:
```typescript
// Before: Fixed 100 token deposit
const depositAmount = 100;

// After: Dynamic price based on earner tier
const depositAmount = await getChatEntryPrice(chat.roles.earnerId);
const { earnerAmount, platformAmount } = calculateRevenueSplit(depositAmount);
```

### 3. Firestore Security Rules
**File**: [`firestore-pack219-dynamic-pricing.rules`](firestore-pack219-dynamic-pricing.rules) (79 lines)

✅ `/dynamic_pricing/{userId}` - Pricing configurations
✅ `/dynamic_pricing/{userId}/history/{historyId}` - Change history
✅ `/chemistry_marks/{markId}` - Good Vibe tracking
✅ `/safety_incidents/{incidentId}` - Safety flag checks
✅ `/user_activity/{activityId}` - Engagement tracking

**Security Model**:
- Users can READ their own pricing data
- Only backend functions can WRITE pricing
- Prevents client-side price manipulation
- Admin override for investigations

### 4. Firestore Indexes
**File**: [`firestore-pack219-dynamic-pricing.indexes.json`](firestore-pack219-dynamic-pricing.indexes.json) (103 lines)

✅ Composite indexes for eligibility checks
✅ Query optimization for analytics
✅ Auto-fallback performance indexes
✅ Chemistry mark lookups

**Key Indexes**:
- `safety_incidents`: userId + createdAt + severity
- `chemistry_marks`: receiverId + mark
- `user_activity`: userId + timestamp
- `chats`: earnerId + createdAt + state
- `dynamic_pricing`: currentTier

## Integration Points

### With Existing Packs

#### PACK 213 (Reputation System)
- High reputation → higher max tier allowed
- Reputation score determines FANTASY tier eligibility
- Safety flags block dynamic pricing

#### PACK 214 (Re-engagement Boosters)
- Re-engagement campaigns can activate after price increases
- Demand drop triggers both systems

#### PACK 216 (Leaderboards)
- Top performers can raise prices
- Leaderboard position influences visibility

#### PACK 217 (Live Arena)
- Arena demand spikes can unlock faster tier upgrades
- Popular streamers qualify for premium tiers

#### PACK 210-211 (Safety Systems)
- Safety flags immediately disqualify from dynamic pricing
- Clean record required for participation

### Database Schema

#### dynamic_pricing Collection
```typescript
{
  userId: string;
  currentTier: 'STANDARD' | 'GLOW' | 'DESIRE' | 'STAR' | 'ROYAL' | 'FANTASY';
  currentPrice: number;
  lastChangedAt: Timestamp;
  lastChangedFrom: PriceTier;
  eligibility: {
    eligible: boolean;
    reasons: string[];
    requirements: { ... };
    maxTierAllowed: PriceTier;
  };
  lastEvaluatedAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### chemistry_marks Collection
```typescript
{
  markId: string;
  senderId: string;
  receiverId: string;
  mark: 'good_vibe' | 'neutral' | 'no_chemistry';
  chatId?: string;
  createdAt: Timestamp;
}
```

#### Pricing History Subcollection
```typescript
{
  historyId: string;
  userId: string;
  tier: PriceTier;
  price: number;
  changedAt: Timestamp;
  changedFrom?: PriceTier;
  reason: string; // 'manual_change' | 'auto_fallback_demand_drop_XX%'
  analytics: {
    chatsLast14Days: number;
    earningsLast14Days: number;
    conversionRate: number;
  };
}
```

## Scheduled Jobs Required

### 1. Weekly Eligibility Evaluation
**Function**: `runWeeklyEligibilityEvaluation()`
**Schedule**: Every Sunday at 02:00 UTC
**Purpose**: Update eligibility for all earners

```typescript
export const weeklyPricingEligibilityCheck = onSchedule(
  { schedule: 'every sunday 02:00' },
  async () => {
    const count = await runWeeklyEligibilityEvaluation();
    logger.info(`Evaluated ${count} users for pricing eligibility`);
  }
);
```

### 2. Daily Demand Fallback Check
**Function**: `runDailyDemandFallbackCheck()`
**Schedule**: Every day at 03:00 UTC
**Purpose**: Auto-fallback for low-demand profiles

```typescript
export const dailyDemandFallbackCheck = onSchedule(
  { schedule: 'every day 03:00' },
  async () => {
    const count = await runDailyDemandFallbackCheck();
    logger.info(`Applied auto-fallback to ${count} users`);
  }
);
```

## UX Guidelines

### Allowed Messaging

✅ **Attraction-focused**:
- "This creator has high attraction & chemistry scores"
- "Premium experience with top-rated creator"
- "Exclusive access to high-demand profile"

✅ **Confidence-celebrating**:
- "Celebrating success and popularity"
- "Recognized for exceptional engagement"
- "Top-tier creator experience"

### Prohibited Messaging

❌ **Shaming language**:
- "Only rich men can talk to her"
- "Pay more or go away"
- "Low-tier users not welcome"

❌ **Auction wording**:
- "Bid for this creator's time"
- "Highest bidder gets priority"
- "Outbid others to chat"

❌ **Transactional romance**:
- "Buy her attention"
- "Purchase exclusive access"
- "Pay for love"

### UI Display Requirements

**Before Chat Starts**:
```
┌────────────────────────────────┐
│ ⭐ Sarah's Chat                │
│                                │
│ Entry Price: 350 tokens        │
│ Tier: Royal                    │
│                                │
│ High attraction & chemistry    │
│ scores — demand influences     │
│ pricing                        │
│                                │
│ [Start Chat]  [View Profile]   │
└────────────────────────────────┘
```

**Discovery Sorting**:
- Price tier influences visibility
- Optional lightweight sorting hooks
- Does NOT override safety/quality filters

## Testing Checklist

### Eligibility Tests
- [ ] User with all requirements met → eligible
- [ ] User without verified identity → not eligible
- [ ] User with safety flags (< 60 days) → not eligible
- [ ] User with < 20 chats → not eligible
- [ ] User with < 6 Good Vibes → not eligible
- [ ] Inactive user (> 14 days) → not eligible
- [ ] New user with high rep → max tier allowed correctly

### Tier Change Tests
- [ ] Valid tier change within cooldown → rejected
- [ ] Valid tier change after cooldown → accepted
- [ ] Tier above max allowed → rejected
- [ ] Downgrade always allowed → accepted
- [ ] Price change recorded in history
- [ ] Analytics captured correctly

### Auto-Fallback Tests
- [ ] 65% demand drop triggers fallback
- [ ] 50% demand drop no fallback
- [ ] STANDARD tier no fallback (already lowest)
- [ ] Fallback recorded with correct reason
- [ ] Multiple tier drops if needed

### Integration Tests
- [ ] Chat deposit uses dynamic price
- [ ] 65/35 split calculated correctly
- [ ] Escrow balance correct for tier
- [ ] Platform fee matches tier price
- [ ] Refund works correctly
- [ ] Word-to-token ratio unchanged
- [ ] Free messages unaffected

### Economic Tests
- [ ] 100 token chat → 35 fee + 65 escrow
- [ ] 350 token chat → 123 fee + 227 escrow
- [ ] 500 token chat → 175 fee + 325 escrow
- [ ] Earner receives only consumed tokens
- [ ] Unused escrow refunds correctly
- [ ] No revenue leakage

## Impact Analysis

### On User Experience

**For Payers**:
- ✅ Clear pricing before chat starts
- ✅ Price transparency
- ✅ Quality indicator (high-demand = higher price)
- ⚠️ May deter price-sensitive users at higher tiers

**For Earners**:
- ✅ Reward for quality and popularity
- ✅ Incentive to maintain reputation
- ✅ Analytics-driven pricing decisions
- ⚠️ Risk of losing matches at higher tiers

**For Avalo**:
- ✅ Higher revenue from premium chats
- ✅ Quality creators stay engaged
- ✅ Market-driven pricing discovery
- ✅ No destabilization of economy

### Economic Model

**Base Case (100 tokens)**:
- Payer pays: 100
- Avalo receives: 35
- Earner can receive: up to 65

**Premium Case (500 tokens)**:
- Payer pays: 500
- Avalo receives: 175 (5× base revenue)
- Earner can receive: up to 325 (5× base earnings)

**Market Dynamics**:
- Higher prices = higher earnings (if demand holds)
- Auto-fallback ensures market equilibrium
- No artificial inflation (demand-driven only)
- Quality creators naturally rise to top

### Safety Considerations

✅ **Fraud Prevention**:
- Verified identity required
- Verified appearance on dates
- No new user exploitation

✅ **Safety Integration**:
- Safety flags block pricing
- Reputation requirements
- Activity validation

✅ **Economic Protection**:
- Cooldown prevents manipulation
- Auto-fallback prevents overpricing
- Transparent pricing

## What Does NOT Change

❌ Meeting pricing
❌ Event pricing  
❌ Call pricing
❌ Refund rules
❌ Cancellation policy
❌ Safety systems
❌ Chat message counting logic
❌ Word-to-token ratios (7 Royal / 11 Standard)
❌ Free message allocation (3 per participant)
❌ 65/35 revenue split percentage

**Only the chat ENTRY PRICE becomes dynamic.**

## Deployment Steps

1. **Deploy Firestore Rules**:
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Deploy Firestore Indexes**:
   ```bash
   firebase deploy --only firestore:indexes
   ```

3. **Deploy Cloud Functions**:
   ```bash
   cd functions
   npm run build
   firebase deploy --only functions
   ```

4. **Schedule Background Jobs**:
   - Configure weekly eligibility check
   - Configure daily demand fallback check

5. **Verify Integration**:
   - Test chat deposit with various tiers
   - Verify analytics tracking
   - Confirm auto-fallback works

## Monitoring & Metrics

### Key Metrics to Track

1. **Adoption Rate**:
   - % of earners using dynamic pricing
   - Distribution across tiers
   - Time to tier progression

2. **Economic Impact**:
   - Average revenue per chat by tier
   - Total platform revenue increase
   - Earner income distribution

3. **Demand Signals**:
   - Chat completion rate by tier
   - Auto-fallback frequency
   - Price elasticity of demand

4. **Quality Indicators**:
   - Chemistry scores by tier
   - Reputation progression
   - Safety incident correlation

### Alert Conditions

⚠️ **System Health**:
- Eligibility eval failures > 5%
- Auto-fallback failures > 10%
- Analytics calculation errors

⚠️ **Economic Anomalies**:
- Sudden tier distribution changes
- Revenue split miscalculations
- Unusual pricing patterns

⚠️ **Abuse Signals**:
- Rapid tier cycling
- Coordinated Good Vibe marking
- Suspicious eligibility patterns

## Future Enhancements

### Phase 1.5 (Optional)
- A/B testing framework for tier pricing
- Dynamic adjustment based on market conditions
- Regional pricing variations

### Phase 2.0 (Optional)
- ML-based pricing recommendations
- Predictive demand modeling
- Automated tier optimization

### Phase 3.0 (Optional)
- Seasonal tier adjustments
- Event-based pricing (holidays, etc.)
- Creator-set custom constraints

## Support & Troubleshooting

### Common Issues

**Issue**: User eligible but can't change tier
**Solution**: Check cooldown period (7 days)

**Issue**: Auto-fallback not triggering
**Solution**: Verify scheduled job running daily

**Issue**: Analytics showing zero
**Solution**: Ensure chats completed in last 14 days

**Issue**: Revenue split incorrect
**Solution**: Verify calculateRevenueSplit() using tier price

### Debug Commands

```typescript
// Check eligibility
const eligibility = await evaluatePricingEligibility(userId);
console.log(eligibility);

// Get current tier
const tier = await getUserPricingTier(userId);
console.log(tier);

// Get analytics
const analytics = await getPricingAnalytics(userId);
console.log(analytics);

// Force fallback check
const applied = await checkAndApplyDemandFallback(userId);
console.log(`Fallback applied: ${applied}`);
```

## Confirmation String

**PACK 219 COMPLETE** — Royal Dynamic Chat Pricing Evolution integrated ✅

All components implemented:
- ✅ Core pricing engine
- ✅ Eligibility evaluator
- ✅ Auto-fallback mechanism  
- ✅ Analytics system
- ✅ Chat integration
- ✅ Security rules
- ✅ Database indexes
- ✅ Scheduled jobs
- ✅ Documentation

**Ready for deployment and testing.**