# AVALO MONETIZATION MASTER TABLE

**Last Updated:** 2025-11-19 (Phase 3)  
**Source of Truth:** `app-mobile/config/monetization.ts`

---

## 📊 TOKEN PURCHASE PACKS

| Pack ID | Tokens | Bonus | Total Tokens | Price (USD) | Popular |
|---------|--------|-------|--------------|-------------|---------|
| starter | 50 | 0 | 50 | $4.99 | |
| popular | 200 | 20 | 220 | $14.99 | ⭐ |
| value | 500 | 50 | 550 | $29.99 | |
| premium | 1000 | 150 | 1150 | $49.99 | |

---

## 💬 MESSAGING COSTS

| Feature | Cost | Free Messages | Avalo Fee | Creator Earnings |
|---------|------|---------------|-----------|------------------|
| Regular Messages | 10 tokens/msg | First 3 per chat | 30% | 70% |

---

## 💰 EARN-TO-CHAT (Human-to-Human Paid Messaging)

| Parameter | Value | Notes |
|-----------|-------|-------|
| Initial Deposit | 100 tokens | Required to start conversation |
| Instant Fee | 35 tokens | Charged immediately (non-refundable) |
| Escrow Amount | 65 tokens | Remaining after instant fee |
| Words per Token | 11 words | Standard rate |
| Creator Split | 80% | From escrow |
| Avalo Cut | 20% | From escrow |
| Min Escrow Balance | 10 tokens | Before requiring new deposit |

**Royal Klub Bonus:** 15 words/token (43% increase)

---

## 🤖 AI CHAT (Companions)

| Tier | Cost per Message | Avalo Revenue Share |
|------|-----------------|---------------------|
| Basic | 1 token | 100% |
| Premium | 2 tokens | 100% |
| NSFW | 4 tokens | 100% |

**Note:** All AI revenue goes to Avalo (platform owns AI infrastructure)

---

## 🔥 DISCOVERY & MATCHING FEATURES

### SuperLike

| Parameter | Value | Notes |
|-----------|-------|-------|
| Cost | **10 tokens** | Updated in Phase 3 |
| Free per Day (VIP) | 1 | Down from 5 in Phase 2 |
| Free (Royal) | Unlimited | |
| Avalo Cut | 100% | No creator split |

### Profile Boost

| Parameter | Value |
|-----------|-------|
| Cost | 100 tokens |
| Duration | 30 minutes |
| Priority Multiplier | 10× |
| Avalo Cut | 100% |

### Rewind

| Parameter | Value | Notes |
|-----------|-------|-------|
| Cost | **10 tokens** | Updated in Phase 3 |
| Time Window | 5 minutes | After swipe |
| Free per Day (VIP) | 5 | |
| Free (Royal) | Unlimited | |
| Avalo Cut | 100% | No creator split |
| SuperLike Refund | Yes | 10 tokens refunded if rewinding SuperLike |

---

## 📸 FEED & CONTENT

### Content Unlocks

| Content Type | Cost | Creator Split | Avalo Cut |
|--------------|------|---------------|-----------|
| Photo Unlock | 20 tokens | 70% | 30% |
| Video Unlock | 50 tokens | 70% | 30% |

### Tips

| Parameter | Value | Notes |
|-----------|-------|-------|
| Min Tip | **5 tokens** | Updated in Phase 3 |
| Max Tip | 10,000 tokens | |
| Creator Split | **80%** | Updated in Phase 3 |
| Avalo Fee | **20%** | Updated in Phase 3 |

### Icebreakers

| Feature | Cost | Notes |
|---------|------|-------|
| Icebreaker Message | 15 tokens | Pre-match message |

---

## 📅 CALENDAR & MEETUPS

| Parameter | Value | Notes |
|-----------|-------|-------|
| **Min Booking Price** | **100 tokens** | Creator sets price | 
| **Max Booking Price** | **100,000 tokens** | Creator sets price |
| **Instant Avalo Fee** | **20%** | Non-refundable, taken immediately |
| **Escrow to Creator** | **80%** | Held until meetup verified |
| Cancellation Fee | 50 tokens | If cancelled <24h |
| Host Cancel Refund | 100% | Full escrow refund to booker |
| Guest Cancel (>24h) | 50% | Partial refund |

**Verification Flow:**
1. Payment: 100% deducted from booker
2. Split: 20% to Avalo instantly, 80% to escrow
3. Completion: Both parties confirm OR creator confirms + time passes
4. Release: 80% escrow released to creator

---

## 💎 PAID CONTENT (Profile Media)

| Content Type | Min Price | Max Price | Creator Split | Avalo Fee |
|--------------|-----------|-----------|---------------|-----------|
| Photo | 20 tokens | 500 tokens | 70% | 30% |
| Video | 50 tokens | 1,000 tokens | 70% | 30% |

---

## 🎭 CHAT ROOMS

| Parameter | Value |
|-----------|-------|
| Entry Cost | 50 tokens |
| Host Split | 70% |
| Avalo Fee | 30% |

---

## 📺 LIVESTREAM

| Feature | Value |
|---------|-------|
| Entry Fee | 50 tokens |
| Min Tip | 10 tokens |
| Max Tip | 5,000 tokens |
| **Entry Splits** | |
| - Streamer | 70% |
| - Avalo | 30% |
| **Tip Splits** | |
| - Streamer | 85% |
| - Avalo | 15% |

---

## 👑 VIP MEMBERSHIP

### Pricing Tiers

| Tier | Duration | Price | Effective Monthly | Discount | Popular |
|------|----------|-------|-------------------|----------|---------|
| VIP Monthly | 1 month | $19.99 | $19.99 | - | |
| VIP Quarterly | 3 months | $49.99 | $16.66 | 17% | ⭐ |
| VIP Yearly | 12 months | $149.99 | $12.50 | 38% | |

### VIP Benefits

| Benefit | Value |
|---------|-------|
| Free SuperLikes | 1 per day |
| Free Rewinds | 5 per day |
| Video/Voice Discount | 50% |
| Discovery Priority | 2× multiplier |
| Can See Who Liked You | ✓ |
| VIP Badge Display | 👑 VIP |

---

## ♛ ROYAL KLUB MEMBERSHIP

### Benefits

| Benefit | Value |
|---------|-------|
| **All VIP Benefits** | ✓ |
| SuperLikes | Unlimited (free) |
| Rewinds | Unlimited (free) |
| Discovery Priority | 7× multiplier (2× VIP + 5× Royal) |
| Earn-to-Chat Bonus | 15 words/token (vs 11 standard) |
| Video/Voice Discount | 50% |
| Royal Badge Display | ♛ ROYAL |
| Early Feature Access | ✓ |

**Pricing:** TBD (Premium tier above VIP)

---

## 💸 PAYOUTS (CREATOR EARNINGS)

### Token to Currency Conversion

| Parameter | Value |
|-----------|-------|
| Token to EUR Rate | €0.05 per token |
| Example: 1,000 tokens | = €50.00 |

### Payout Methods

| Method | Fee Type | Fee Value | Min Withdrawal | Max Withdrawal | Processing Time |
|--------|----------|-----------|----------------|----------------|-----------------|
| **PayPal** | Percentage | 7% | 100 tokens (€5) | 100,000 tokens (€5,000) | 1-3 days |
| | | Min: €0.50 | | | |
| | | Max: €50.00 | | | |
| **Bank (SEPA)** | Flat | €4.00 | 200 tokens (€10) | 200,000 tokens (€10,000) | 3-5 days |
| **Revolut** | Percentage | 5% | 100 tokens (€5) | 150,000 tokens (€7,500) | 1-2 days |
| | | Min: €0.25 | | | |
| | | Max: €25.00 | | | |
| **Crypto (USDT/USDC)** | Percentage | 2% | 200 tokens (€10) | 500,000 tokens (€25,000) | 1 day |
| | | Min: €1.00 | | | |
| | | Max: €100.00 | | | |

### Payout Limits

| Limit Type | Value |
|------------|-------|
| Global Minimum | 100 tokens (€5) |
| Max Daily Withdrawal | 50,000 tokens (€2,500) |
| Max Monthly Withdrawal | 400,000 tokens (€20,000) |
| Max Pending Requests | 3 |
| Cooldown Between Withdrawals | 24 hours |

### Verification Requirements

| Threshold | Verification Level |
|-----------|-------------------|
| 10,000 tokens (€500) | Basic verification required |
| 50,000 tokens (€2,500) | Enhanced verification required |
| 200,000 tokens/month (€10,000) | Monthly volume review |

---

## 📈 REVENUE SPLIT SUMMARY

| Feature | Avalo Cut | Creator/Earner Cut | Notes |
|---------|-----------|-------------------|-------|
| **Messages** | 30% | 70% | After free messages |
| **Earn-to-Chat** | 20% (escrow) + 35 tokens (instant) | 80% (escrow) | Instant fee non-refundable |
| **AI Chat** | 100% | 0% | Platform feature |
| **SuperLike** | 100% | 0% | Platform feature |
| **Boost** | 100% | 0% | Platform feature |
| **Rewind** | 100% | 0% | Platform feature |
| **Tips** | 20% | 80% | Direct creator support |
| **Content Unlocks** | 30% | 70% | Photo/Video |
| **Paid Content** | 30% | 70% | Profile media |
| **Calendar/Bookings** | 20% (instant) | 80% (escrow) | Fee non-refundable |
| **Chat Rooms** | 30% | 70% (host) | Entry fees |
| **Livestream Entry** | 30% | 70% (streamer) | |
| **Livestream Tips** | 15% | 85% (streamer) | |
| **Icebreakers** | Variable | Variable | Pre-match messages |

---

## 🔐 PLATFORM FEE DEFAULTS

| Default Fee Type | Value | Notes |
|------------------|-------|-------|
| AVALO_PLATFORM_FEE | 30% | Applied when feature-specific fee not defined |

---

## 🎯 PHASE 3 UPDATES (2025-11-19)

### Changes Made

1. **SuperLike Cost:** 50 tokens → **10 tokens** ✅
2. **Rewind Cost:** 30 tokens → **10 tokens** ✅
3. **Tips Min:** 10 tokens → **5 tokens** ✅
4. **Tips Split:** 85/15 → **80/20** (Creator/Avalo) ✅
5. **VIP Free SuperLikes:** 5/day → **1/day** ✅
6. **Calendar Booking:** Fixed fee → **100-100,000 tokens range** ✅
7. **Calendar Split:** 75/25 → **80/20** (Creator/Avalo) ✅
8. **Calendar Fee:** Now **20% instant + 80% escrow** ✅

### Alignment with Business Master Spec

- ✅ SuperLike: 10 tokens, 1 free/day VIP, unlimited Royal, 100% Avalo
- ✅ Rewind: 10 tokens for normal, 5 free/day VIP, unlimited Royal, 100% Avalo
- ✅ Tips: 5-10,000 tokens, 20% Avalo / 80% Creator
- ✅ Calendar: 100-100,000 tokens, 20% instant fee (non-refundable), 80% escrow

---

## 💡 NOTES FOR DEVELOPERS

1. **Always use config values** from `app-mobile/config/monetization.ts`
2. **Never hardcode prices** in components or services
3. **Token transactions** must go through `tokenService.ts`
4. **All splits** are calculated using helper functions in monetization.ts
5. **Escrow logic** for Calendar and Earn-to-Chat is handled separately
6. **VIP/Royal benefits** are checked before charging tokens

---

**End of Monetization Master Table**