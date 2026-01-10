# Avalo Platform Logic — Current Implementation Specification

**Last Updated:** January 9, 2026  
**Source:** Reverse-engineered from TypeScript/React Native/Node/Firebase codebase  
**Scope:** READ-ONLY analysis of the current implementation state

---

## Table of Contents

1. [User Roles & Accounts](#1-user-roles--accounts)
2. [Token Economy & Credits](#2-token-economy--credits)
3. [Paid Chat & Earn-to-Chat Logic](#3-paid-chat--earn-to-chat-logic)
4. [Calls, Gifts, Tips, Boosts](#4-calls-gifts-tips-boosts)
5. [Revenue Split & Payout Logic](#5-revenue-split--payout-logic)
6. [Regions, Currencies, Stripe Integration](#6-regions-currencies-stripe-integration)
7. [Free Features vs Paid Features](#7-free-features-vs-paid-features)
8. [Moderation, Safety, Legal](#8-moderation-safety-legal)
9. [PACKS & Implementation Status](#9-packs--implementation-status)

---

## 1. User Roles & Accounts

### 1.1 User Roles in the Current Code

Based on the codebase analysis, Avalo implements the following user roles:

#### 1.1.1 Fan / Consumer
- **Definition:** Standard user who spends tokens to interact with creators
- **Primary actions:** Swipe, match, send paid messages, purchase tokens, watch content
- **Storage:** `users/{userId}` in Firestore with standard profile fields
- **Profile fields:** Defined in [`app-mobile/types/profile.ts`](../app-mobile/types/profile.ts:1)
  - `gender`: `'male' | 'female' | 'nonbinary'`
  - `orientation`: `'female' | 'male' | 'both'`
  - `age`, `birthdate`, `country`, `city`
  - `photos`: Array of ProfilePhoto (10 max, face-first for slots 1-6)
  - `verification`: Verification status (unverified/pending/verified)
  - `profileScore`: 0-100 score
  - `safetyFlags`: mismatchReports, fraudRisk, banRisk, shadowBanned

#### 1.1.2 Creator / Earner
- **Definition:** User who earns tokens by receiving messages, calls, gifts
- **Mode switch:** No explicit "become creator" action in code; any user with `earnsFromChat: true` is treated as creator
- **Profile summary:** Defined in [`app-mobile/services/creatorService.ts`](../app-mobile/services/creatorService.ts:18)
  - `displayName`, `avatarUrl`, `shortBio`
  - `languages`, `mainLocationCity`, `mainLocationCountry`
  - `earnsFromChat`: boolean
  - `baseMessageTokenCost`: number
  - `ppmMediaFromTokens`: number
  - `royalTier`: `'NONE' | 'ROYAL_SILVER' | 'ROYAL_GOLD' | 'ROYAL_PLATINUM'`
  - `trustScore`: number
  - `isHighRisk`: boolean
- **Earnings tracked in:** `creator_earnings_daily`, `creator_analytics_daily`

#### 1.1.3 VIP / Royal Members
- **Levels:** Defined in [`app-mobile/services/vipService.ts`](../app-mobile/services/vipService.ts:27)
  - `'none' | 'bronze' | 'silver' | 'gold' | 'royal'`
- **Score thresholds:** 0 (none), 20 (bronze), 40 (silver), 60 (gold), 80 (royal)
- **Privileges by level:**
  - Bronze: Visibility boost in Discover
  - Silver: Early chat invitations, +0.5 queue priority boost
  - Gold: +1.0 queue priority, romantic conversation starters
  - Royal: +2.0 queue priority, exclusive recognition badge, early story access
- **Storage:** `vipProfiles/{userId}`, `vipSettings/{userId}`, `vipScoreComponents/{userId}`

#### 1.1.4 Admin / Moderator
- **Identified by:** `isModerator: true` flag in Firebase Auth custom claims
- **Dashboard:** Implemented in `app-web/app/admin/moderation/*`
- **Capabilities:**
  - View incidents and appeals (PACK 1)
  - Take moderation actions (PACK 2)
  - Real-time queue (PACK 3)
  - AI analytics (PACK 4-5)

#### 1.1.5 AI Companions / Bots
- **Defined in:** [`app-mobile/services/aiCompanionService.ts`](../app-mobile/services/aiCompanionService.ts:27)
- **Data structure:**
  - `companionId`, `displayName`, `avatarUrl`, `shortBio`
  - `personalityPreset`, `language`, `isNsfw`
  - `basePrompt`: AI configuration
- **Conversations:** Stored in `ai_conversations/{conversationId}/messages`
- **Billing:** Per-message token cost (no free messages)

### 1.2 Registration, Login & Onboarding

#### Authentication Methods
- **Firebase Auth:** Primary authentication provider
- **Methods available:** Email/password (implied by Firebase Auth defaults)
- **2FA:** Implemented via [`app-mobile/services/securityService.ts`](../app-mobile/services/securityService.ts) and `types/twoFactor.ts`

#### Onboarding Flow
- **Steps:** Defined in [`app-mobile/types/profile.ts`](../app-mobile/types/profile.ts:167)
  - `'gender' | 'orientation' | 'birthdate' | 'location' | 'photos' | 'verification' | 'complete'`
- **Profile completion tracking:** `OnboardingProgress` type with `completed` array
- **Minimum requirements:**
  - Age 18+ (region-dependent, some 19-21)
  - At least 3 face photos in slots 1-6
  - Basic profile info (gender, orientation, birthdate, location)

### 1.3 Verification & KYC

#### Selfie Verification (Profile)
- **Service:** [`app-mobile/services/onboardingProfileService.ts`](../app-mobile/services/onboardingProfileService.ts)
- **Flow:**
  1. User uploads selfie during onboarding
  2. AI face detection validates face presence
  3. Comparison with profile photos
  4. Status: `unverified → pending → verified/rejected`

#### KYC for Payouts (PACK 84)
- **Service:** [`app-mobile/services/kycService.ts`](../app-mobile/services/kycService.ts:1)
- **Status values:** `NOT_STARTED | PENDING | VERIFIED | REJECTED | BLOCKED`
- **Level:** `NONE | BASIC`
- **Required documents:**
  - Front image of ID
  - Back image (optional for passport)
  - Live selfie
- **Form data:**
  - `documentType`: `ID_CARD | PASSPORT | DRIVERS_LICENSE`
  - `country`: ISO 2-letter code
  - `fullName`, `dateOfBirth`
- **Age validation:** Must be 18+ (calculated at submission time)
- **Payout eligibility:** `canRequestPayout: true` only when `status === 'VERIFIED' && level === 'BASIC'`

### 1.4 Account Status & Lifecycle

#### Account States
- **Defined in:** [`app-mobile/services/accountService.ts`](../app-mobile/services/accountService.ts:11)
- **Values:** `'active' | 'suspended' | 'deleted_soft' | 'deleted_hard'`

#### Available Operations
- `suspendAccount()`: Pause account, retains data
- `reactivateAccount()`: Resume suspended account
- `softDeleteAccount()`: Delete with option to save preferences
- `hardDeleteAccount()`: Permanent deletion

#### Deletion Eligibility Checks
- **Blockers checked:**
  - Active escrows
  - Pending bookings
  - Pending withdrawals
  - Total escrowed tokens > 0

---

## 2. Token Economy & Credits

### 2.1 Token Unit Name

The main currency unit is called **"tokens"** throughout the codebase.
- Type definitions: [`app-mobile/types/tokens.ts`](../app-mobile/types/tokens.ts:1)
- Configuration: [`app-mobile/config/monetization.ts`](../app-mobile/config/monetization.ts:1)

### 2.2 Token Balance Storage

#### Firestore Location
- **Path:** `balances/{userId}/wallet`
- **Fields:**
  - `tokens`: number (current balance)
  - `lastUpdated`: Timestamp

#### Service
- **File:** [`app-mobile/services/tokenService.ts`](../app-mobile/services/tokenService.ts:1)
- **Key functions:**
  - `getTokenBalance(userId)`: Returns current balance
  - `subscribeToTokenBalance(userId, callback)`: Real-time listener
  - `deductTokens(userId, amount)`: Decrements balance
  - `addTokensAfterPurchase(userId, tokens)`: Adds tokens post-payment

### 2.3 Token Purchase Packs

#### Defined in [`config/monetization.ts`](../app-mobile/config/monetization.ts:22)

| Pack ID | Tokens | Price (USD) | Display Name |
|---------|--------|-------------|--------------|
| mini | 100 | $7.99 | Mini |
| basic | 300 | $21.49 | Basic |
| standard | 500 | $33.74 | Standard (Popular) |
| premium | 1,000 | $61.24 | Premium |
| pro | 2,000 | $117.49 | Pro |
| elite | 5,000 | $281.49 | Elite |
| royal | 10,000 | $537.49 | Royal |

#### PLN Pricing (Poland)
Display prices for Poland region (backend still uses USD):

| Pack ID | PLN Price |
|---------|-----------|
| mini | 31.99 zł |
| basic | 85.99 zł |
| standard | 134.99 zł |
| premium | 244.99 zł |
| pro | 469.99 zł |
| elite | 1,125.99 zł |
| royal | 2,149.99 zł |

### 2.4 How Balances Increase

1. **Token Purchases via Stripe**
   - Service: [`app-mobile/services/stripeService.ts`](../app-mobile/services/stripeService.ts:1)
   - Flow: Create checkout session → User pays → Webhook confirms → Tokens added
   - Transaction recorded with `transactionType: 'purchase'`

2. **Earn-to-Chat Earnings (Creators)**
   - When messages are sent to a creator with escrow
   - 80% to creator, 20% to Avalo (see escrow service)

3. **Content Sales (Creators)**
   - Photo/video unlocks
   - Tips received
   - Gift receipts
   - Call payments

### 2.5 How Balances Decrease

#### Messaging Costs
- **Free messages:** First 3 messages per conversation are free
- **Paid messages:** 10 tokens per message after free tier
- **Message fee:** 30% to Avalo, 70% to receiver

#### Escrow-Based Chat (Earn-to-Chat)
- **Initial deposit:** 100 tokens
- **Instant fee:** 35 tokens (non-refundable)
- **Billing:** ~11 words per token (calculated per message)
- **Split:** 80% creator, 20% Avalo

#### Discovery Features
- **SuperLike:** 50 tokens
- **Boost (30 min):** 100 tokens
- **Rewind:** 10 tokens

#### Content Unlocks
- **Feed photo unlock:** 20 tokens
- **Feed video unlock:** 50 tokens
- **Icebreaker:** 15 tokens

#### AI Chat
- **Basic AI message:** 1 token
- **Premium AI message:** 2 tokens
- **NSFW AI message:** 4 tokens

#### Calls
- **Voice (standard):** 10 tokens/min
- **Voice (Royal):** 6 tokens/min
- **Video (standard):** 15 tokens/min
- **Video (Royal):** 10 tokens/min

---

## 3. Paid Chat & Earn-to-Chat Logic

### 3.1 Core Chat Service Location

- **Main service:** [`app-mobile/services/chatService.ts`](../app-mobile/services/chatService.ts:1)
- **Escrow service:** [`app-mobile/services/escrowService.ts`](../app-mobile/services/escrowService.ts:1)
- **Pricing service:** [`app-mobile/services/chatPricingService.ts`](../app-mobile/services/chatPricingService.ts)
- **Message pricing:** [`app-mobile/services/messagePricingService.ts`](../app-mobile/services/messagePricingService.ts)

### 3.2 Match vs Non-Match Chat Flow

#### Matched Users (Free Chat)
When two users have mutually liked each other:
- **Check:** `areUsersMatched()` queries `matches` collection
- **Behavior:** Chat is free, no escrow created
- **Property:** `isMatched: true` on chat document

#### Non-Matched Users (Earn-to-Chat)
When initiating conversation without mutual like:
- **Escrow required:** Yes
- **Initial deposit:** 100 tokens from sender's wallet
- **Instant fee:** 35 tokens taken immediately (non-refundable)
- **Remaining escrow:** 65 tokens available for messages
- **Property:** `hasEscrow: true` on chat document

### 3.3 Token Charging Rules

#### Message Pricing (PACK 39)
```typescript
// From config/monetization.ts
MESSAGING_CONFIG = {
  FREE_MESSAGES_COUNT: 3,
  MESSAGE_COST: 10,
  MESSAGE_FEE_PERCENTAGE: 0.30, // 30% to Avalo
}
```

- First 3 messages in a conversation: FREE
- Messages 4+: 10 tokens per message
- Split: 70% to receiver, 30% to Avalo

#### Earn-to-Chat Word-Based Billing
```typescript
// From config/monetization.ts
EARN_TO_CHAT_CONFIG = {
  INITIAL_DEPOSIT: 100,
  INSTANT_FEE: 35,
  WORDS_PER_TOKEN: 11,
  CREATOR_SPLIT: 0.80,
  AVALO_CUT: 0.20,
  MIN_ESCROW_BALANCE: 10,
}
```

- **Calculation:** `Math.round(wordCount / 11)` tokens per message
- **Example:** 22 words = 2 tokens
- **Low balance warning:** When escrow < 10 tokens, notification sent

### 3.4 Chat Creation Flow (Code Path)

From [`chatService.ts:createChat()`](../app-mobile/services/chatService.ts:143):

1. Check if users are matched (`areUsersMatched()`)
2. Create chat document in Firestore
3. If NOT matched:
   - Call `createEscrow(chatId, senderId, receiverId)`
   - Deduct 100 tokens from sender
   - Create escrow document with 65 token balance (100 - 35 instant fee)
   - Record instant fee transaction
4. Add initial message to `chats/{chatId}/messages`
5. PACK 43: Register streak activity
6. PACK 44/45: Sync to backend (non-blocking)
7. PACK 49: Record personalization event
8. Update profile signals (PACK 40)

### 3.5 Message Sending Flow

From [`chatService.ts:sendMessage()`](../app-mobile/services/chatService.ts:274):

1. Get chat and identify receiver
2. Get message price from `getChatPrice(chatId)`
3. If chat has escrow and is not matched:
   - Calculate word count
   - `deductFromEscrow(chatId, wordCount)` removes tokens
   - `releaseEscrow(chatId, tokensDeducted)` pays creator (80/20 split)
4. Write message document with `status: 'local'`
5. Update chat `lastMessage` and `unreadCountPerUser`
6. PACK 43: Register streak activity
7. PACK 44/45: Backend sync (non-blocking)
8. PACK 49: Personalization events
9. PACK 40: Update profile signals

### 3.6 AI Chat vs Human Chat

#### AI Chat (PACK 48)
- **Service:** [`app-mobile/services/aiCompanionService.ts`](../app-mobile/services/aiCompanionService.ts:1)
- **No free messages:** Every message is charged
- **Tiers and costs:**
  - Basic: 1 token
  - Premium: 2 tokens
  - NSFW: 4 tokens
- **Revenue:** 100% to Avalo (no creator split)
- **Storage:** `ai_conversations/{conversationId}/messages`

#### Human Chat
- **Free tier:** 3 messages per conversation for matched users
- **Paid after free:** 10 tokens per message OR escrow word-based billing
- **Revenue split:** Creator receives 70-80% depending on mechanism

### 3.7 Related PACKs Referenced in Code

- **PACK 39:** Chat paywall, base message pricing
- **PACK 40:** Profile signals/rank
- **PACK 41:** Token-boosted replies (message boost for priority)
- **PACK 42:** Pay-per-action media (photo/audio/video attachments)
- **PACK 43:** Loyal Lover Streaks (engagement tracking)
- **PACK 44:** Hybrid backend sync
- **PACK 45:** Firestore chat sync & delivery guarantees
- **PACK 48:** AI Companions
- **PACK 49:** Personalization events
- **PACK 50:** Royal Club tracking

---

## 4. Calls, Gifts, Tips, Boosts

### 4.1 Voice & Video Calls

#### Service Location
- **Mobile:** [`app-mobile/services/callService.ts`](../app-mobile/services/callService.ts:1)
- **Backend:** `functions/src/callBilling.ts`, `callMonetization.ts`, `calls.ts`

#### Call Types & Statuses
```typescript
type CallMode = 'VOICE' | 'VIDEO';
type CallStatus = 'CREATED' | 'RINGING' | 'ACCEPTED' | 'ACTIVE' | 'ENDED' | 'CANCELLED' | 'MISSED' | 'FAILED' | 'INSUFFICIENT_FUNDS';
```

#### Pricing Structure
From [`config/monetization.ts`](../app-mobile/config/monetization.ts:294):

| Type | Standard | VIP | Royal |
|------|----------|-----|-------|
| Voice | 10 tokens/min | 10 tokens/min | 6 tokens/min |
| Video | 15 tokens/min | 15 tokens/min | 10 tokens/min |

#### Revenue Split
- Earner: 80%
- Avalo: 20%

#### Call Flow
1. `createCall()`: Caller initiates, session created
2. `startRinging()`: Notify callee
3. `acceptCall()` or `rejectCall()`: Callee responds
4. `markCallActive()`: Media connected, billing starts
5. `endCall()`: Session ends, final billing calculated
6. Tokens deducted per minute (rounded up)

#### Storage
- Collection: `call_sessions/{callId}`
- Fields: `callId`, `signalingChannelId`, `mode`, `tokensPerMinute`, `status`, `billedMinutes`, `totalTokensCharged`

### 4.2 Gifts

#### Service Location
- **Mobile:** [`app-mobile/services/giftService.ts`](../app-mobile/services/giftService.ts:1)
- **Backend:** `functions/src/gifts/`

#### Available Gifts
From [`config/monetization.ts`](../app-mobile/config/monetization.ts:382):

| Gift | Token Cost |
|------|------------|
| 🌹 Rose | 5 |
| ❤️ Heart | 10 |
| ⭐ Star | 25 |
| 💎 Diamond | 50 |
| 👑 Crown | 100 |
| 🔥 Fire | 250 |
| 🚀 Rocket | 500 |
| 🏆 Trophy | 1,000 |

#### Revenue Split
- Creator: 65% (calculated as `priceTokens - Math.floor(priceTokens * 0.35)`)
- Avalo: 35%

#### Gift Flow
1. Sender selects gift in chat
2. `sendGift(giftId, receiverId, chatId)` called
3. Validation: sufficient tokens, not self-gifting, gift active
4. Firebase Function processes transaction
5. Gift message appears in chat
6. Creator receives 65% of gift value

### 4.3 Tips

#### Configuration
From [`config/monetization.ts`](../app-mobile/config/monetization.ts:218):

```typescript
TIPS_CONFIG = {
  MIN_TIP_AMOUNT: 5,
  MAX_TIP_AMOUNT: 10000,
  CREATOR_SPLIT: 0.80,
  TIP_FEE_PERCENTAGE: 0.20,
}
```

#### Revenue Split
- Creator: 80%
- Avalo: 20%

### 4.4 Boosts

#### Service Location
- **Mobile:** [`app-mobile/services/boostService.ts`](../app-mobile/services/boostService.ts:1)
- **Backend:** `functions/src/boostEngine.ts`

#### Boost Types
```typescript
type BoostType = 'DISCOVERY_PROFILE' | 'CHAT_RETARGET';
```

#### Discovery Boost Tiers
```typescript
BOOST_CONFIG = {
  discovery: {
    basic: { tokens: 80, durationMinutes: 30 },
    plus: { tokens: 180, durationMinutes: 90 },
    max: { tokens: 400, durationMinutes: 240 },
  },
  chatRetarget: {
    ping: { tokens: 60, durationMinutes: 60 },
  },
}
```

#### Boost Effects
- **Discovery boost:** 10x visibility multiplier in swipe/discover
- **Chat retarget:** Re-engage inactive chat partner

#### Functions
- `createDiscoveryBoost(userId, tier)`: Start profile boost
- `createChatRetargetBoost(userId, chatId)`: Ping inactive chat
- `getActiveDiscoveryBoost(userId)`: Check active boost
- `isProfileBoosted(userId)`: Quick status check

### 4.5 SuperLikes & Rewinds

#### SuperLike
- **Cost:** 50 tokens
- **VIP benefit:** 1 free per day
- **Effect:** Higher priority in recipient's queue

#### Rewind
- **Cost:** 10 tokens
- **Time limit:** 5 minutes after swipe
- **VIP benefit:** 5 free per day, unlimited for Royal

---

## 5. Revenue Split & Payout Logic

### 5.1 Revenue Split Configuration

Found in multiple config files with these splits:

| Feature | Creator % | Avalo % | Source |
|---------|-----------|---------|--------|
| Earn-to-Chat (Escrow) | 80% | 20% | `EARN_TO_CHAT_CONFIG.CREATOR_SPLIT` |
| Basic Messages | 70% | 30% | `MESSAGING_CONFIG.MESSAGE_FEE_PERCENTAGE` |
| Paid Content | 70% | 30% | `PAID_CONTENT_CONFIG.CREATOR_SPLIT` |
| Tips | 80% | 20% | `TIPS_CONFIG.CREATOR_SPLIT` |
| Calls (Voice/Video) | 80% | 20% | `CALL_CONFIG.*.EARNER_CUT_PERCENT` |
| Live Gifts | 80% | 20% | `LIVE_ROOM_CONFIG.CREATOR_SPLIT` |
| Gifts | 65% | 35% | `calculateReceiverEarnings()` in giftService |
| Calendar Bookings | 80% | 20% | `CALENDAR_CONFIG.HOST_SPLIT` |
| Premium Stories | 65% | 35% | `PREMIUM_STORIES_CONFIG.CREATOR_SPLIT` |
| Content Unlocks | 70% | 30% | `CONTENT_CONFIG.CONTENT_CREATOR_SPLIT` |
| Livestream Tips | 85% | 15% | `LIVESTREAM_CONFIG.STREAMER_TIP_SPLIT` |
| Creator Subscriptions | 70% | 30% | `CREATOR_SUBSCRIPTIONS.CREATOR_SPLIT` |

### 5.2 Creator Earnings Ledger

#### Payout Config (PACK 83)
From [`functions/src/config/payouts.config.ts`](../functions/src/config/payouts.config.ts:1):

```typescript
PAYOUT_CONFIG = {
  MIN_PAYOUT_TOKENS: 5000,
  PAYOUT_TOKEN_TO_EUR_RATE: 0.20, // 1 token = €0.20
  SUPPORTED_PAYOUT_METHODS: ['BANK_TRANSFER', 'WISE', 'STRIPE_CONNECT'],
  MAX_PAYOUT_METHODS_PER_USER: 5,
  DEFAULT_CURRENCY: 'EUR',
  SUPPORTED_CURRENCIES: ['EUR', 'USD', 'GBP', 'PLN'],
}
```

#### Payout Status Flow
```
PENDING → UNDER_REVIEW → APPROVED → PAID
              ↓
          REJECTED
```

### 5.3 Payout Service

#### Location
- **Mobile:** [`app-mobile/services/payoutService.ts`](../app-mobile/services/payoutService.ts:1)
- **Types:** [`app-mobile/types/payouts.ts`](../app-mobile/types/payouts.ts)

#### Payout Method Types
- `BANK_TRANSFER`: Requires IBAN, account holder name, bank name, country
- `WISE`: Requires Wise profile ID, email
- `STRIPE_CONNECT`: Requires Stripe account ID

#### Service Functions
- `getPayoutConfig()`: Get min tokens, conversion rate, etc.
- `getPayoutMethods(userId)`: List user's payout methods
- `createPayoutMethod(userId, payload)`: Add new method
- `createPayoutRequest(userId, methodId, requestedTokens)`: Request payout
- `getPayoutRequests(userId)`: List payout history

#### NON-NEGOTIABLE RULES (from config comments)
- Token price per unit remains fixed (config-driven)
- No bonuses, no free tokens, no discounts, no promo codes, no cashback
- Tokens deducted on payout request are permanent
- No refunds on completed payouts (only on rejected requests)

### 5.4 Tax/VAT Handling

- **Tax service:** [`app-mobile/services/taxService.ts`](../app-mobile/services/taxService.ts)
- **Backend:** `functions/src/tax-engine/`
- **Status:** Tax calculation exists in code but appears to be externally handled for most transactions
- **Pack 195:** Legal & Tax compliance referenced

---

## 6. Regions, Currencies, Stripe Integration

### 6.1 Supported Countries/Regions

#### Full Region Config
From [`packages/i18n/src/regions.ts`](../packages/i18n/src/regions.ts:1):

**Europe (Full Support):**
- PL (Poland) - Home market, PLN payouts
- DE, FR, ES, IT, NL, GB (UK), CZ, RO

**Content Restrictions by Region:**

| Region | Bikini | Lingerie | Soft Erotic | Adult Web |
|--------|--------|----------|-------------|-----------|
| PL, DE, FR, ES, IT, NL, CZ, RO | ✅ | ✅ | ✅ | ❌ |
| GB | ✅ | ✅ | ✅ | ❌ |
| US | ✅ | ✅ | ✅ | ❌ |
| RU | ✅ | ❌ | ❌ | ❌ |
| SA | ❌ | ❌ | ❌ | ❌ |
| TR | ✅ | ❌ | ❌ | ❌ |
| JP | ✅ | ✅ | ✅ | ❌ |
| KR | ✅ | ✅ | ✅ | ❌ |
| CN | ✅ | ❌ | ❌ | ❌ |

**Minimum Age by Region:**
- Standard (18): PL, DE, FR, ES, IT, NL, CZ, RO, UA, RU, TR, CN
- 19: KR (South Korea)
- 20: JP (Japan)
- 21: SA (Saudi Arabia)

### 6.2 Currency Support

#### Supported Currencies
From [`packages/i18n/src/currencies.ts`](../packages/i18n/src/currencies.ts:6):

```typescript
SUPPORTED_CURRENCIES = [
  "PLN", "EUR", "USD", "GBP", "RON", "BGN", "CZK", "HUF", 
  "HRK", "RSD", "UAH", "RUB", "NOK", "SEK", "DKK", "CHF",
  "TRY", "SAR", "AED", "JPY", "KRW", "CNY", "TWD"
]
```

#### Currency by Country Default
From [`REGION_DEFAULT_CURRENCY`](../packages/i18n/src/currencies.ts:37):

| Country | Currency |
|---------|----------|
| Poland | PLN |
| Germany, France, Spain, Italy, etc. | EUR |
| United Kingdom | GBP |
| United States | USD |
| Czech Republic | CZK |
| Romania | RON |
| Japan | JPY |
| South Korea | KRW |
| China | CNY |
| Default fallback | EUR |

### 6.3 Stripe Integration

#### Service Location
- **Mobile:** [`app-mobile/services/stripeService.ts`](../app-mobile/services/stripeService.ts:1)
- **Backend:** `functions/src/` (various payment files)

#### Current Implementation

**Token Purchase Flow:**
1. `createCheckoutSession(userId, pack)`: Creates pending purchase record
2. Generates Stripe Checkout URL (mock in dev)
3. 30-minute expiration on pending purchases
4. Webhook confirms payment → tokens added

**Pending Purchase Storage:**
```typescript
// Collection: pending_purchases/{purchaseId}
{
  userId: string,
  packId: string,
  tokens: number,
  priceUSD: number,
  status: 'pending' | 'completed' | 'failed',
  createdAt: Timestamp,
  expiresAt: Timestamp,
}
```

**Transaction Recording:**
```typescript
// Collection: transactions
{
  senderUid: 'stripe' | 'system' | userId,
  receiverUid: userId,
  tokensAmount: number,
  avaloFee: number,
  transactionType: 'purchase' | 'message' | 'refund' | 'superlike',
  createdAt: Timestamp,
}
```

#### Stripe Keys Location
- Keys expected in environment variables (not exposed in code)
- Functions config: `.env.payments.example` references needed variables

---

## 7. Free Features vs Paid Features

### 7.1 Always Free Features

1. **Registration & Profile Creation**
2. **Swiping & Matching** (basic discovery)
3. **Viewing Profiles**
4. **First 3 Messages** per conversation (between matched users)
5. **Receiving Messages** (no charge to receive)
6. **Basic Chat** with matches (after initial free messages, see paid)
7. **Viewing Non-Premium Stories**
8. **Safety Features:**
   - Blocking users
   - Reporting users
   - Safety center access
   - Panic button
9. **Settings & Profile Management**
10. **Notifications**
11. **Location Services** (basic)

### 7.2 Always Paid Features

1. **Token Purchases** (no free token grants in current code)
2. **Sending Messages Beyond Free Tier** (10 tokens each)
3. **Initiating Chat with Non-Matches** (100 token escrow deposit)
4. **SuperLikes** (50 tokens, 1 free/day for VIP)
5. **Boosts** (80-400 tokens)
6. **Rewinds** (10 tokens, free for VIP)
7. **Sending Gifts** (5-1,000 tokens)
8. **Voice/Video Calls** (6-15 tokens/min)
9. **Content Unlocks** (20-50 tokens)
10. **Premium Stories** (50-500 tokens)
11. **AI Companion Chat** (1-4 tokens per message)
12. **Calendar Bookings** (100+ tokens)

### 7.3 VIP/Subscription Benefits

#### VIP Monthly ($19.99)
- Unlimited likes
- 5 SuperLikes per day → 1 free SuperLike per day
- 5 Rewinds per day
- See who liked you
- 50% discount on Voice/Video calls
- Priority in discovery (2x multiplier)
- VIP badge displayed

#### VIP Quarterly ($49.99)
- All Monthly features
- 10 SuperLikes per day
- Boost once per week
- Advanced filters
- No ads

#### VIP Yearly ($149.99)
- All Quarterly features
- Unlimited SuperLikes
- Unlimited boosts
- Exclusive VIP badge
- Early access to new features
- Free monthly token bonus

#### Royal Benefits
- Unlimited SuperLikes & Rewinds
- All VIP benefits included
- 15 words per token in Earn-to-Chat (vs 11 standard)
- 5x discovery priority multiplier
- 50% call discount (6/10 tokens/min vs 10/15)

### 7.4 Hybrid Features

1. **Matching:** Free to match, paid to message non-matches
2. **Discovery:** Free basic, paid boost for priority
3. **Chat:** Free first 3, then paid OR free with mutual matches
4. **Content:** Free to view basic, paid to unlock premium

---

## 8. Moderation, Safety, Legal

### 8.1 User Reporting & Blocking

#### Safety Service
- **Location:** [`app-mobile/services/safetyService.ts`](../app-mobile/services/safetyService.ts:1)

#### Safety Status Structure
```typescript
interface SafetyStatus {
  userId: string;
  penaltyLevel: number;
  penaltyLevelName: string;
  incidentCount30d: number;
  minorIncidents: number;
  moderateIncidents: number;
  severeIncidents: number;
  restrictions: {
    slowDownActive: boolean;
    slowDownUntil?: Date;
    featuresBanned: string[];
    featureBansUntil?: Date;
    platformBanned: boolean;
    platformBanUntil?: Date;
    platformBanReason?: string;
  };
  cleanStreak: number;
  reputationImpactApplied: boolean;
}
```

#### Available Functions
- `evaluateMessage()`: Check content before sending
- `getSafetyStatus()`: Get user's current safety status
- `getMyIncidents()`: List user's incidents
- `getBlockedMessages()`: See blocked content
- `submitSafetyAppeal()`: Appeal an incident

### 8.2 Content Safety

#### Message Evaluation
```typescript
interface EvaluateMessageResult {
  allowed: boolean;
  action: string;
  violationType?: string;
  severity?: string;
  messageToUser: string;
  educationTipId?: string;
  incidentId?: string;
}
```

- Pre-send validation for messages
- Violation types tracked
- Education tips provided for violations
- Incidents logged automatically

### 8.3 Safety Profile Flags

From [`types/profile.ts`](../app-mobile/types/profile.ts:35):

```typescript
interface SafetyFlags {
  mismatchReports: number;    // Appearance mismatch reports
  fraudRisk: boolean;         // Flagged for fraud
  banRisk: boolean;           // Risk of ban
  lastMismatchCheck?: string;
  shadowBanned?: boolean;     // Temporary restriction
}
```

### 8.4 Voice/Video/Livestream Safety

#### Voice Analysis (PACK 153)
- `startVoiceAnalysis(callId, participantIds)`
- `processVoiceTranscript(sessionId, transcript)`
- `endVoiceAnalysis(sessionId)`

#### Livestream Moderation
- `startLivestreamModeration(streamId, moderatorIds)`
- `moderateLivestreamMessage(sessionId, message)`
- `getLivestreamStats(sessionId)`
- `endLivestreamModeration(sessionId)`

### 8.5 Romance Scam Protection (PACK 248)

- **File:** [`app-mobile/PACK_248_ROMANCE_SCAM_PROTECTION.md`](../app-mobile/PACK_248_ROMANCE_SCAM_PROTECTION.md:1)
- **Service:** `romanceScamService.ts`
- Detection system for common scam patterns
- Preserves dating/romance while protecting users

### 8.6 Legal & Evidence Vault

#### Legal Case Types (from `LegalCaseCard.tsx` context)
- Evidence collection for legal cases
- Case status tracking
- Export capabilities for legal proceedings

#### Related PACKs
- PACK 158: Legal Vault (Firestore rules exist: `firestore-pack158-legal-vault.rules`)
- PACK 159: Safety Enhancement
- PACK 173: Abuse Protection
- PACK 174: Fraud Shield
- PACK 175: Cyberstalking
- PACK 176: Extortion Protection
- PACK 177: Media Integrity
- PACK 178: Minor Protection

### 8.7 AI Moderation

#### Implementation
- Backend: `functions/src/aiModeration.ts`, `aiModerationEngine.ts`
- PACK 446: AI Governance & Explainability
- Content moderation engine integration

### 8.8 Regional Compliance Requirements

From [`packages/i18n/src/regions.ts`](../packages/i18n/src/regions.ts:27):

| Region | Extra Data Consent | Cookie Consent | Age Doc Required |
|--------|-------------------|----------------|------------------|
| DE, FR, ES, IT, NL, CZ, RO | ✅ | ✅ | ❌ |
| GB | ✅ | ✅ | ✅ |
| PL | ❌ | ✅ | ❌ |
| US | ❌ | ❌ | ❌ |
| KR | ❌ | ❌ | ✅ |
| CN | ❌ | ❌ | ✅ |

---

## 9. PACKS & Implementation Status

### 9.1 Core Economy PACKs (Implemented)

| PACK | Name | Status | Location |
|------|------|--------|----------|
| 39 | Chat Paywall | ✅ Implemented | `messagePricingService.ts`, `chatService.ts` |
| 40 | Profile Rank/Signals | ✅ Implemented | `profileRankService.ts` |
| 41 | Token-Boosted Replies | ✅ Implemented | `messageBoostService.ts` |
| 42 | Pay-Per-Action Media | ✅ Implemented | `paidMediaService.ts` |
| 43 | Loyal Lover Streaks | ✅ Implemented | `loyalStreakService.ts` |
| 44 | Hybrid Backend Sync | ✅ Implemented | `backSyncService.ts` |
| 45 | Firestore Chat Sync | ✅ Implemented | `chatSyncService.ts` |
| 46 | Trust Engine | ✅ Implemented | `trustService.ts`, components |
| 48 | AI Companions | ✅ Implemented | `aiCompanionService.ts` |
| 49 | Personalization | ✅ Implemented | `personalizationService.ts` |
| 50 | Royal Club | ✅ Implemented | References in tokenService |
| 75 | Call Service | ✅ Implemented | `callService.ts` |
| 78 | Premium Stories | ✅ Implemented | `premiumStoryService.ts` |
| 79 | In-Chat Gifts | ✅ Implemented | `giftService.ts` |
| 83 | Creator Payouts | ✅ Implemented | `payoutService.ts`, config |
| 84 | KYC | ✅ Implemented | `kycService.ts` |

### 9.2 Safety & Moderation PACKs (Implemented)

| PACK | Name | Status | Location |
|------|------|--------|----------|
| 103 | Community Governance | ✅ Implemented | Functions (governance, appeals) |
| 104 | Anti-Fraud | ✅ Implemented | Functions (fraud detection) |
| 153 | Safety Service | ✅ Implemented | `safetyService.ts` |
| 158 | Legal Vault | ✅ Rules exist | `firestore-pack158-legal-vault.rules` |
| 248 | Romance Scam Protection | ✅ Implemented | `romanceScamService.ts` |

### 9.3 Infrastructure PACKs (Implemented)

| PACK | Name | Status | Location |
|------|------|--------|----------|
| 100 | Launch Readiness | ✅ Implemented | Full implementation doc |
| 101 | Creator Success | ✅ Implemented | Functions |
| 102 | Audience Growth | ✅ Implemented | Functions |
| 105 | Business Audit | ✅ Implemented | Functions |
| 295 | Globalization | ✅ Implemented | `packages/i18n/` |
| 302 | Token Checkout | ✅ Implemented | `stripeService.ts`, Functions |
| 303 | Creator Earnings Dashboard | ✅ Implemented | Functions |
| 333 | Orchestration Layer | ✅ Implemented | Functions |

### 9.4 Admin & Moderator Dashboard PACKs

| PACK | Name | Status | Location |
|------|------|--------|----------|
| PACK 1 | Read-only foundation | ✅ Implemented | `app-web/app/admin/` |
| PACK 2 | Moderation actions | ✅ Implemented | Actions, modals |
| PACK 3 | Real-time queue | ✅ Implemented | Priority queue |
| PACK 4 | AI Analytics | ✅ Implemented | Insights dashboard |
| PACK 5 | AI Assistant | ✅ Implemented | Auto-moderator |

### 9.5 Post-Launch Hardening PACKs (400+ Range)

| PACK | Name | Status | Location |
|------|------|--------|----------|
| 437 | Revenue Protection | ✅ Implemented | Functions |
| 441 | Growth Safety Net | ✅ Implemented | `functions/src/pack441/` |
| 442 | Pricing Elasticity | ✅ Implemented | `functions/src/pack442/` |
| 443 | Offer Experimentation | ✅ Implemented | `functions/src/pack443/` |
| 444 | UX Integrity | ✅ Implemented | Functions |
| 445 | Enterprise Readiness | ✅ Implemented | Due diligence toolkit |
| 446 | AI Governance | ✅ Implemented | `functions/src/pack446-ai-governance/` |
| 447 | Data Residency | ✅ Implemented | Sovereignty control |
| 448 | Incident Response | ✅ Implemented | Crisis playbooks |
| 449 | Access Control | ✅ Implemented | Insider risk defense |
| 450 | Platform Sustainability | ✅ Implemented | Tech debt governance |

### 9.6 Desktop Application (PACK 125)

- **Location:** `app-desktop/`
- **Technology:** Electron
- **Status:** ✅ Implemented
- **Purpose:** High-productivity environment for creators/moderators
- **Features:** Full parity with mobile/web

### 9.7 Firestore Rules Files Present

The following PACK-specific Firestore rules files exist in the repository root:

- `firestore-pack119-agencies.rules`
- `firestore-pack130-patrol.rules`
- `firestore-pack138-vip-access.rules`
- `firestore-pack141-ai-companions.rules`
- `firestore-pack142-identity.rules`
- `firestore-pack144-royalclub.rules`
- `firestore-pack149-tax-engine.rules`
- `firestore-pack150-integrations.rules`
- `firestore-pack151-sponsorships.rules`
- `firestore-pack152-ambassadors.rules`
- `firestore-pack158-legal-vault.rules`
- `firestore-pack159-safety.rules`
- `firestore-pack160-encryption.rules`
- `firestore-pack161-smart-social-graph.rules`
- `firestore-pack163-brands.rules`
- `firestore-pack164-accelerator.rules`
- `firestore-pack167-affiliates.indexes.json`
- `firestore-pack169-notifications.indexes.json`
- `firestore-pack173-abuse.rules`
- `firestore-pack174-fraud.rules`
- `firestore-pack175-cyberstalking.rules`
- `firestore-pack176-extortion.rules`
- `firestore-pack177-media-integrity.rules`
- `firestore-pack178-minor-protection.rules`
- `firestore-pack179-reputation.rules`
- `firestore-pack180-social-guardian.rules`
- And many more (181-217+)

### 9.8 Missing/Partial PACKs (from Audit Report)

According to the platform closure audit report, the following PACK ranges have gaps:

**Note:** This does not indicate failed implementation, but rather PACKs that may not have dedicated implementation files visible in the scanned directories.

- Some PACKs in 1-100 range (particularly 6-7, 45, 47, 49-54, 56-88, 94)
- Various PACKs in 100-200 range (111, 116-118, 123-125, etc.)
- Some PACKs in 200-450 range (scattered)

The presence of Firestore rules and index files suggests partial implementation exists even where full code files weren't found.

---

## Summary

This document captures the current implementation state of the Avalo platform based on direct code analysis. Key takeaways:

1. **Token Economy:** Fully implemented with 7 purchase tiers, word-based billing for Earn-to-Chat, and multiple spending mechanisms
2. **Revenue Splits:** Range from 65/35 to 85/15 creator/Avalo depending on feature
3. **User Roles:** Fan, Creator, VIP (5 tiers), Admin/Moderator, AI Companion
4. **Safety:** Comprehensive system with reporting, blocking, AI moderation, and legal vault
5. **Regional:** 20+ countries supported with content restrictions and age requirements
6. **Payouts:** Manual review system with KYC requirement, €0.20 per token conversion

---

*This document was generated through READ-ONLY analysis of the Avalo codebase. No code was modified.*
