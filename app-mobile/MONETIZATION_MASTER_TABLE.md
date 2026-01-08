# Avalo Monetization Master Table

**Last Updated:** 2025-11-18  
**Configuration Files:**
- [`config/monetization.ts`](./config/monetization.ts) - Token costs, fees, and tiers
- [`config/payout.ts`](./config/payout.ts) - Withdrawal methods and conversion rates

---

## 📊 Complete Monetization Overview

This table represents the **single source of truth** for all monetization in the Avalo app. All values reference configuration files for easy updates.

### Legend
- 💰 **Tokens** - In-app currency (1 token = €0.05)
- 💶 **EUR/USD** - Real money
- ⚖️ **Split** - Revenue distribution (Creator/Host → Avalo)

---

## 1️⃣ MESSAGING & CHAT

| Action | Cost | Who Pays | Who Earns | Avalo Fee | Config Reference |
|--------|------|----------|-----------|-----------|------------------|
| **First 3 Messages** | Free | Nobody | Nobody | N/A | [`MESSAGING_CONFIG.FREE_MESSAGES_COUNT`](./config/monetization.ts:51) |
| **Message (4th+)** | 10 tokens | Sender | Receiver | 30% (3 tokens) | [`MESSAGING_CONFIG.MESSAGE_COST`](./config/monetization.ts:54) |
| **Icebreaker Message** | 15 tokens | Sender | Nobody (Avalo) | 100% (15 tokens) | [`CONTENT_CONFIG.ICEBREAKER_COST`](./config/monetization.ts:89) |

**Example:** User A sends 5 messages to User B
- Messages 1-3: Free
- Message 4: 10 tokens → User B gets 7 tokens, Avalo gets 3 tokens
- Message 5: 10 tokens → User B gets 7 tokens, Avalo gets 3 tokens

---

## 2️⃣ DISCOVERY & MATCHING

| Action | Cost | Who Pays | Who Earns | Avalo Fee | Config Reference |
|--------|------|----------|-----------|-----------|------------------|
| **Regular Like** | Free | Nobody | Nobody | N/A | Free feature |
| **SuperLike** | 50 tokens | Liker | Nobody (Avalo) | 100% (50 tokens) | [`DISCOVERY_CONFIG.SUPERLIKE_COST`](./config/monetization.ts:67) |
| **60-Min Boost** | 100 tokens | User | Nobody (Avalo) | 100% (100 tokens) | [`DISCOVERY_CONFIG.BOOST_COST`](./config/monetization.ts:70) |

**SuperLike Breakdown:**
- Cost: 50 tokens
- Recipient: Gets notified but receives no tokens
- Avalo: Receives full 50 tokens
- Purpose: Premium visibility feature

---

## 3️⃣ CONTENT (FEED)

| Action | Cost | Who Pays | Who Earns | Avalo Fee | Config Reference |
|--------|------|----------|-----------|-----------|------------------|
| **Unlock Photo** | 20 tokens | Viewer | Creator | 30% (6 tokens) | [`CONTENT_CONFIG.FEED_PHOTO_UNLOCK_COST`](./config/monetization.ts:82) |
| **Unlock Video** | 50 tokens | Viewer | Creator | 30% (15 tokens) | [`CONTENT_CONFIG.FEED_VIDEO_UNLOCK_COST`](./config/monetization.ts:85) |

**Split:** 70% to Creator / 30% to Avalo ([`CONTENT_CONFIG.CONTENT_CREATOR_SPLIT`](./config/monetization.ts:92))

---

## 4️⃣ PAID CONTENT (Premium Photos/Videos)

| Content Type | Min Price | Max Price | Creator Split | Avalo Fee | Config Reference |
|--------------|-----------|-----------|---------------|-----------|------------------|
| **Paid Photo** | 20 tokens | 500 tokens | 70% | 30% | [`PAID_CONTENT_CONFIG`](./config/monetization.ts:117-125) |
| **Paid Video** | 50 tokens | 1000 tokens | 70% | 30% | [`PAID_CONTENT_CONFIG`](./config/monetization.ts:127-135) |

**Example:** Creator sells a photo for 100 tokens
- Creator receives: 70 tokens
- Avalo receives: 30 tokens

---

## 5️⃣ TIPS & DONATIONS

| Action | Amount Range | Who Pays | Who Earns | Creator Split | Avalo Fee | Config Reference |
|--------|--------------|----------|-----------|---------------|-----------|------------------|
| **Tip/Donation** | 10-10,000 tokens | Tipper | Creator | 85% | 15% | [`TIPS_CONFIG`](./config/monetization.ts:103-115) |

**Example:** Fan tips 100 tokens
- Creator receives: 85 tokens
- Avalo receives: 15 tokens

---

## 6️⃣ CHAT ROOMS

| Action | Cost | Who Pays | Who Earns | Host Split | Avalo Fee | Config Reference |
|--------|------|----------|-----------|------------|-----------|------------------|
| **Enter Chat Room** | 50 tokens | Participant | Host | 70% | 30% | [`CHAT_ROOM_CONFIG`](./config/monetization.ts:97-101) |

**Example:** 10 users join a chat room at 50 tokens each
- Total: 500 tokens
- Host receives: 350 tokens (70%)
- Avalo receives: 150 tokens (30%)

---

## 7️⃣ CALENDAR & MEETUPS

| Action | Cost | Who Pays | Who Earns | Host Split | Avalo Fee | Config Reference |
|--------|------|----------|-----------|------------|-----------|------------------|
| **Make Booking** | 100 tokens | Guest | Host | 75% | 25% | [`CALENDAR_CONFIG.BOOKING_FEE`](./config/monetization.ts:142) |
| **Cancel < 24h** | 50 tokens penalty | Guest | Host (partial) | Varies | Varies | [`CALENDAR_CONFIG.CANCELLATION_FEE`](./config/monetization.ts:145) |

**Cancellation Policies:**
- **Host Cancels:** Guest gets 100% refund ([`HOST_CANCELLATION_REFUND`](./config/monetization.ts:154))
- **Guest Cancels >24h:** Guest gets 50% refund ([`GUEST_CANCELLATION_REFUND`](./config/monetization.ts:157))
- **Guest Cancels <24h:** 50 token fee, no refund

---

## 8️⃣ LIVESTREAMING

| Action | Cost | Who Pays | Who Earns | Streamer Split | Avalo Fee | Config Reference |
|--------|------|----------|-----------|----------------|-----------|------------------|
| **Entry Fee (Paid Stream)** | 50 tokens | Viewer | Streamer | 70% | 30% | [`LIVESTREAM_CONFIG.ENTRY_FEE`](./config/monetization.ts:165) |
| **Livestream Tip** | 10-5,000 tokens | Viewer | Streamer | 85% | 15% | [`LIVESTREAM_CONFIG`](./config/monetization.ts:171-174) |

**Example:** 100 viewers join paid livestream + tips
- Entry fees: 100 × 50 = 5,000 tokens → Streamer gets 3,500, Avalo gets 1,500
- Tips: 10,000 tokens total → Streamer gets 8,500, Avalo gets 1,500
- **Total:** Streamer earns 12,000 tokens, Avalo earns 3,000 tokens

---

## 9️⃣ TOKEN PURCHASE PACKS

| Pack | Tokens | Bonus | Total | Price (USD) | Value per Token | Config Reference |
|------|--------|-------|-------|-------------|-----------------|------------------|
| **Starter** | 50 | 0 | 50 | $4.99 | $0.10/token | [`TOKEN_PACKS[0]`](./config/monetization.ts:24-29) |
| **Popular** ⭐ | 200 | 20 | 220 | $14.99 | $0.07/token | [`TOKEN_PACKS[1]`](./config/monetization.ts:30-36) |
| **Value** | 500 | 50 | 550 | $29.99 | $0.05/token | [`TOKEN_PACKS[2]`](./config/monetization.ts:37-43) |
| **Premium** | 1000 | 150 | 1150 | $49.99 | $0.04/token | [`TOKEN_PACKS[3]`](./config/monetization.ts:44-49) |

**Note:** Larger packs offer better value through bonus tokens.

---

## 🔟 VIP SUBSCRIPTIONS

| Tier | Duration | Price | Monthly Equivalent | Discount | Config Reference |
|------|----------|-------|-------------------|----------|------------------|
| **VIP Monthly** | 1 month | $19.99 | $19.99/mo | 0% | [`VIP_TIERS[0]`](./config/monetization.ts:223-231) |
| **VIP Quarterly** ⭐ | 3 months | $49.99 | $16.66/mo | 17% | [`VIP_TIERS[1]`](./config/monetization.ts:232-242) |
| **VIP Yearly** | 12 months | $149.99 | $12.50/mo | 38% | [`VIP_TIERS[2]`](./config/monetization.ts:243-254) |

**VIP Benefits:**
- Unlimited likes
- SuperLikes (5-unlimited per day)
- Boosts (weekly-unlimited)
- See who liked you
- Advanced filters
- No ads
- Priority support
- Exclusive badges

---

## 1️⃣1️⃣ WITHDRAWALS & PAYOUTS

### Token → EUR Conversion
**Global Rate:** 1 token = €0.05 ([`TOKEN_TO_EUR_RATE`](./config/payout.ts:13))

### Withdrawal Methods

| Method | Fee Type | Fee % | Min Fee | Max Fee | Min Withdrawal | Max Withdrawal | Processing Time | Config Reference |
|--------|----------|-------|---------|---------|----------------|----------------|-----------------|------------------|
| **PayPal** | Percentage | 7% | €0.50 | €50.00 | 100 tokens (€5) | 100,000 tokens (€5,000) | 1-3 days | [`PAYOUT_METHODS.paypal`](./config/payout.ts:54-64) |
| **Bank Transfer** | Flat | €4.00 | N/A | N/A | 200 tokens (€10) | 200,000 tokens (€10,000) | 3-5 days | [`PAYOUT_METHODS.bank`](./config/payout.ts:66-74) |
| **Revolut** | Percentage | 5% | €0.25 | €25.00 | 100 tokens (€5) | 150,000 tokens (€7,500) | 1-2 days | [`PAYOUT_METHODS.revolut`](./config/payout.ts:76-84) |
| **Crypto (USDT)** | Percentage | 2% | €1.00 | €100.00 | 200 tokens (€10) | 500,000 tokens (€25,000) | 1 day | [`PAYOUT_METHODS.crypto`](./config/payout.ts:86-94) |

### Withdrawal Examples

**Example 1: PayPal Withdrawal (1,000 tokens)**
- Gross: 1,000 tokens = €50.00
- Fee (7%): €3.50
- Net Payout: €46.50

**Example 2: Bank Transfer (5,000 tokens)**
- Gross: 5,000 tokens = €250.00
- Fee (flat): €4.00
- Net Payout: €246.00

**Example 3: Crypto Withdrawal (10,000 tokens)**
- Gross: 10,000 tokens = €500.00
- Fee (2%): €10.00
- Net Payout: €490.00

### Withdrawal Limits

| Limit Type | Amount | Config Reference |
|------------|--------|------------------|
| **Global Minimum** | 100 tokens (€5) | [`WITHDRAWAL_LIMITS.GLOBAL_MIN_TOKENS`](./config/payout.ts:100) |
| **Daily Maximum** | 50,000 tokens (€2,500) | [`WITHDRAWAL_LIMITS.MAX_DAILY_TOKENS`](./config/payout.ts:103) |
| **Monthly Maximum** | 400,000 tokens (€20,000) | [`WITHDRAWAL_LIMITS.MAX_MONTHLY_TOKENS`](./config/payout.ts:106) |
| **Cooldown Period** | 24 hours | [`WITHDRAWAL_LIMITS.WITHDRAWAL_COOLDOWN_HOURS`](./config/payout.ts:112) |

---

## 📈 REVENUE DISTRIBUTION SUMMARY

### By Feature Category

| Feature | Avalo Cut | Creator/User Cut | Notes |
|---------|-----------|------------------|-------|
| **Messaging** | 30% | 70% | After free messages |
| **SuperLike** | 100% | 0% | Premium feature |
| **Boost** | 100% | 0% | Premium feature |
| **Content Unlocks** | 30% | 70% | Photos/videos in feed |
| **Paid Content** | 30% | 70% | Premium user content |
| **Tips** | 15% | 85% | Lowest Avalo cut |
| **Chat Rooms** | 30% | 70% | Per entry fee |
| **Bookings** | 25% | 75% | Calendar/meetup |
| **Livestream Entry** | 30% | 70% | Paid stream access |
| **Livestream Tips** | 15% | 85% | During streams |
| **VIP Subscriptions** | 100% | 0% | Direct revenue |
| **Token Purchases** | 100% | 0% | Direct revenue |

### Global Platform Fee
**Default Avalo Fee:** 30% ([`AVALO_PLATFORM_FEE`](./config/monetization.ts:260))

Most features use this default, with tips/donations having a lower 15% fee to incentivize creators.

---

## 🎯 CREATOR ECONOMY

### Requirements
- **Minimum Withdrawal:** 100 tokens ([`CREATOR_CONFIG.MIN_TOKENS_TO_WITHDRAW`](./config/monetization.ts:268))
- **Verification Required:** Yes ([`CREATOR_CONFIG.REQUIRES_VERIFICATION`](./config/monetization.ts:271))
- **Default Split:** 70% to creator ([`CREATOR_CONFIG.DEFAULT_CREATOR_SPLIT`](./config/monetization.ts:265))

### Creator Earnings Potential

**Example: Active Female Creator (Monthly)**
- Messages received: 500 × 10 tokens × 70% = 3,500 tokens
- Content unlocks: 100 × 30 tokens × 70% = 2,100 tokens
- Tips received: 1,000 tokens × 85% = 850 tokens
- Livestream: 50 viewers × 50 tokens × 70% + 2,000 tip tokens × 85% = 1,750 + 1,700 = 3,450 tokens
- **Total Monthly: 9,900 tokens = €495**

**Withdrawal:**
- Via Revolut (5% fee): €495 - €24.75 = **€470.25 net**

---

## 🔧 HOW TO UPDATE MONETIZATION

### Single Source of Truth
All monetization values are centralized in two files:

1. **[`config/monetization.ts`](./config/monetization.ts)** - Token costs, splits, tiers
2. **[`config/payout.ts`](./config/payout.ts)** - Conversion rates, withdrawal fees

### To Change a Value:
1. Open the relevant config file
2. Locate the constant (use table references above)
3. Update the value
4. Changes propagate automatically to all code

### Example: Change Message Cost
```typescript
// In config/monetization.ts
export const MESSAGING_CONFIG = {
  FREE_MESSAGES_COUNT: 3,
  MESSAGE_COST: 15, // Changed from 10 to 15
  MESSAGE_FEE_PERCENTAGE: 0.30,
} as const;
```

No other code changes needed - the entire app uses this single source.

---

## ✅ COMPLIANCE & TRANSPARENCY

### User-Facing Displays
- All costs shown **before** action
- Clear fee breakdown on withdrawal screens
- Transparent splits explained to creators
- Terms of Service reference monetization terms

### Reporting
- Users can view full transaction history
- Creators have earnings dashboard
- Withdrawal history with fee breakdown
- Monthly statements available

### Legal
- Compliant with EU payment regulations
- VAT handling for EU users
- Creator tax documentation (1099/equivalent)
- Anti-money laundering checks for large withdrawals

---

## 📞 SUPPORT QUERIES

### Common Questions

**Q: Why are the first 3 messages free?**  
A: To encourage meaningful connections before monetization.

**Q: Why does Avalo take 30%?**  
A: Platform fees cover servers, payment processing, moderation, support, and development.

**Q: Why are tips only 15% fee?**  
A: Lower fee to maximize creator earnings and incentivize quality content.

**Q: Which withdrawal method is cheapest?**  
A: For large amounts, bank transfer (flat €4). For small amounts, crypto (2%).

---

## 📚 RELATED DOCUMENTATION

- [`TOKEN_ECONOMY_IMPLEMENTATION.md`](./TOKEN_ECONOMY_IMPLEMENTATION.md) - Technical implementation
- [`PAYOUT_SYSTEM_IMPLEMENTATION.md`](./PAYOUT_SYSTEM_IMPLEMENTATION.md) - Withdrawal system
- [`config/monetization.ts`](./config/monetization.ts) - Monetization configuration
- [`config/payout.ts`](./config/payout.ts) - Payout configuration

---

**Configuration Version:** 1.0  
**Last Audit:** 2025-11-18  
**Next Review:** Quarterly or on major feature launch