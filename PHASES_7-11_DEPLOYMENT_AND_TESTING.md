# Avalo - Phases 7-11: Deployment and Testing Guide

**Date**: January 2025
**Phases**: 7 (Education), 8 (Fraud Prevention), 9 (Live Streaming), 10 (Loyalty), 11 (Global Expansion)
**Region**: europe-west3

---

## Table of Contents

1. [Files Created/Modified](#files-createdmodified)
2. [Deployment Instructions](#deployment-instructions)
3. [Environment Variables](#environment-variables)
4. [Test Scenarios](#test-scenarios)
5. [Firestore Collections](#firestore-collections)
6. [API Endpoints](#api-endpoints)

---

## Files Created/Modified

### Phase 7 - Education & Onboarding

**Mobile App (React Native)**
- ✅ `app/lib/education.ts` - Education state management
- ✅ `app/components/Tooltip.tsx` - Auto-showing tooltip component
- ✅ `app/components/Callout.tsx` - Inline callout for warnings/info
- ✅ `app/onboarding/intro.tsx` - Main onboarding flow
- ✅ `app/onboarding/slides/tokens.tsx` - Token economy slide
- ✅ `app/onboarding/slides/chats.tsx` - Chat pricing slide
- ✅ `app/onboarding/slides/calendar.tsx` - Calendar meetings slide
- ✅ `app/onboarding/slides/ai.tsx` - AI subscriptions slide
- ✅ `app/onboarding/slides/safety.tsx` - Safety features slide

**i18n**
- ✅ `i18n/en/education.json` - English translations (100+ strings)
- ✅ `i18n/pl/education.json` - Polish translations (100+ strings)

**Firestore Rules**
- ✅ `firestore.rules` - Added rules for `users/{uid}/education`

### Phase 8 - Fraud Prevention & Moderation

**Firebase Functions**
- ✅ `functions/src/heuristics.ts` - Fraud detection algorithms
  - Spam detection
  - Escort/sex work keyword detection
  - PII detection
  - Bot behavior detection
  - Trust score calculation

- ✅ `functions/src/moderation.ts` - Moderation callable functions
  - `queueMessageForScanCallable` - Auto-scan messages
  - `reportUserCallable` - User reporting
  - `resolveFlagCallable` - Moderator resolution
  - `banUserCallable` - Admin ban function

**Firestore Rules**
- ✅ `firestore.rules` - Added rules for:
  - `moderationFlags/{flagId}` - Moderation queue
  - `users/{uid}/trust` - Trust scores

### Phase 9 - Live Streaming

**Firebase Functions**
- ✅ `functions/src/live.ts` - Live streaming system
  - `createLiveSessionCallable` - Create 1:1 or public stream
  - `joinLiveSessionCallable` - Join a live stream
  - `endLiveSessionCallable` - End stream
  - `sendLiveTipCallable` - Send tip during stream
  - `tickBillingScheduler` - Scheduled billing (every 10s)

**Firestore Rules**
- ✅ `firestore.rules` - Added rules for:
  - `liveSessions/{id}` - Live session documents
  - `liveTips/{id}` - Tip records

### Phase 10 - Loyalty & Rankings

**Firebase Functions**
- ✅ `functions/src/loyalty.ts` - Loyalty and ranking system
  - `awardPointsOnTx` - Firestore trigger on transactions
  - `claimRewardCallable` - Claim level-up rewards
  - `getUserLoyaltyCallable` - Get user loyalty stats
  - `getRankingsCallable` - Get rankings by period
  - `rebuildRankingsScheduler` - Daily ranking rebuild (2 AM UTC)

**Firestore Rules**
- ✅ `firestore.rules` - Added rules for:
  - `users/{uid}/loyalty` - User loyalty data
  - `rankings/{period}` - Ranking documents

### Phase 11 - Global Expansion

**Firebase Functions**
- ✅ `functions/src/payments.providers.ts` - Multi-provider payment gateway
  - Stripe (existing, global)
  - Przelewy24 (P24) - Poland
  - Blik - Poland (mobile)
  - PayU - Central/Eastern Europe
  - Coinbase Commerce - Cryptocurrency
  - `createPaymentSessionCallable` - Create payment with any provider
  - `handleProviderWebhook` - Unified webhook handler

- ✅ `functions/src/currency.ts` - Currency conversion utilities
  - Live exchange rates (PLN, EUR, USD, GBP, BTC, ETH)
  - Token package pricing in all currencies
  - Auto currency detection by country

**Updated**
- ✅ `functions/src/index.ts` - Export all new functions
- ✅ `firestore.rules` - Complete security rules for all phases

---

## Deployment Instructions

### Prerequisites

1. **Firebase CLI** installed and authenticated:
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

2. **Node.js** v18+ and npm installed

3. **Project configured** for Firebase:
   ```bash
   firebase use avalo-production  # or your project ID
   ```

### Step 1: Install Dependencies

```bash
# Root directory
npm install

# Functions directory
cd functions
npm install
cd ..
```

### Step 2: Set Environment Variables

Create `functions/.env` with the following:

```env
# Existing (from earlier phases)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Phase 11 - Payment Providers
P24_MERCHANT_ID=your_merchant_id
P24_POS_ID=your_pos_id
P24_API_KEY=your_api_key
P24_CRC_KEY=your_crc_key
P24_SANDBOX=false

PAYU_POS_ID=your_pos_id
PAYU_CLIENT_ID=your_client_id
PAYU_CLIENT_SECRET=your_client_secret
PAYU_SANDBOX=false

COINBASE_COMMERCE_API_KEY=your_api_key
COINBASE_WEBHOOK_SECRET=your_webhook_secret

# Currency API (optional, falls back to static rates)
EXCHANGE_RATE_API_KEY=your_api_key

# URLs
WEB_URL=https://avalo.app
FUNCTIONS_URL=https://europe-west3-avalo.cloudfunctions.net
```

Set Firebase config:

```bash
cd functions

# Stripe (existing)
firebase functions:config:set stripe.secret_key="sk_live_..." \
  stripe.webhook_secret="whsec_..."

# Przelewy24
firebase functions:config:set p24.merchant_id="..." \
  p24.pos_id="..." \
  p24.api_key="..." \
  p24.crc_key="..." \
  p24.sandbox="false"

# PayU
firebase functions:config:set payu.pos_id="..." \
  payu.client_id="..." \
  payu.client_secret="..." \
  payu.sandbox="false"

# Coinbase
firebase functions:config:set coinbase.api_key="..." \
  coinbase.webhook_secret="..."

# Exchange rates
firebase functions:config:set exchange_rate.api_key="..."

# URLs
firebase functions:config:set app.web_url="https://avalo.app" \
  app.functions_url="https://europe-west3-avalo.cloudfunctions.net"

cd ..
```

### Step 3: Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

### Step 4: Deploy Firestore Indexes

```bash
firebase deploy --only firestore:indexes
```

### Step 5: Deploy Functions

**Option A: Deploy All Functions**
```bash
firebase deploy --only functions --region europe-west3
```

**Option B: Deploy by Phase**

```bash
# Phase 8 - Moderation
firebase deploy --only functions:queueMessageForScanCallable,functions:reportUserCallable,functions:resolveFlagCallable,functions:banUserCallable

# Phase 9 - Live Streaming
firebase deploy --only functions:createLiveSessionCallable,functions:joinLiveSessionCallable,functions:endLiveSessionCallable,functions:sendLiveTipCallable,functions:tickBillingScheduler

# Phase 10 - Loyalty
firebase deploy --only functions:awardPointsOnTx,functions:claimRewardCallable,functions:getUserLoyaltyCallable,functions:getRankingsCallable,functions:rebuildRankingsScheduler

# Phase 11 - Payment Providers
firebase deploy --only functions:createPaymentSessionCallable,functions:handleProviderWebhook
```

### Step 6: Configure Webhooks

After deployment, configure webhooks for each payment provider:

**Przelewy24 (P24)**
- Webhook URL: `https://europe-west3-avalo.cloudfunctions.net/handleProviderWebhook/p24`

**PayU**
- Webhook URL: `https://europe-west3-avalo.cloudfunctions.net/handleProviderWebhook/payu`

**Coinbase Commerce**
- Webhook URL: `https://europe-west3-avalo.cloudfunctions.net/handleProviderWebhook/coinbase`

### Step 7: Verify Deployment

```bash
# List deployed functions
firebase functions:list

# Check function logs
firebase functions:log --only queueMessageForScanCallable --limit 10
firebase functions:log --only tickBillingScheduler --limit 10
```

---

## Environment Variables

### Required for Production

| Variable | Description | Phase | Example |
|----------|-------------|-------|---------|
| `STRIPE_SECRET_KEY` | Stripe API key | Existing | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | Existing | `whsec_...` |
| `P24_MERCHANT_ID` | Przelewy24 merchant ID | 11 | `12345` |
| `P24_POS_ID` | Przelewy24 POS ID | 11 | `12345` |
| `P24_API_KEY` | Przelewy24 API key | 11 | `abc123...` |
| `P24_CRC_KEY` | Przelewy24 CRC key | 11 | `xyz789...` |
| `PAYU_POS_ID` | PayU POS ID | 11 | `300046` |
| `PAYU_CLIENT_ID` | PayU OAuth client ID | 11 | `12345` |
| `PAYU_CLIENT_SECRET` | PayU OAuth secret | 11 | `abc123...` |
| `COINBASE_COMMERCE_API_KEY` | Coinbase API key | 11 | `abc123...` |
| `EXCHANGE_RATE_API_KEY` | Exchange rate API key | 11 | `abc123...` |
| `WEB_URL` | Web app URL | All | `https://avalo.app` |
| `FUNCTIONS_URL` | Functions base URL | All | `https://europe-west3-avalo.cloudfunctions.net` |

### Optional (Development)

| Variable | Description | Default |
|----------|-------------|---------|
| `P24_SANDBOX` | Use P24 sandbox | `false` |
| `PAYU_SANDBOX` | Use PayU sandbox | `false` |

---

## Test Scenarios

### Phase 7 - Education & Onboarding

#### Test Case 7.1: First-Time User Onboarding
**Objective**: Verify onboarding flow for new users

**Steps**:
1. Create new user account
2. App should automatically show onboarding intro
3. Swipe through all 5 slides (Tokens, Chats, Calendar, AI, Safety)
4. Tap "Get Started" on final slide
5. Verify redirect to main app

**Expected**:
- All slides render correctly
- Skip button available on all slides
- Progress dots show current slide
- Education state saved to Firestore: `users/{uid}/education/state`
- `seenIntro: true` in education document

**Analytics Events**:
- `intro_shown`
- `intro_completed` (with slides_viewed count)

---

#### Test Case 7.2: Tooltip Auto-Show
**Objective**: Verify tooltips auto-show up to 2 times

**Steps**:
1. Navigate to a screen with tooltip (e.g., chat deposit screen)
2. First visit: Tooltip should appear automatically
3. Close tooltip
4. Navigate away and return
5. Second visit: Tooltip should appear again
6. Close tooltip
7. Navigate away and return
8. Third visit: Tooltip should NOT appear automatically
9. Tap info icon to show tooltip manually

**Expected**:
- Tooltip shows automatically first 2 times
- After 2 views, only shows via info icon
- View count stored in AsyncStorage: `tooltip_views_{id}`

**Analytics Events**:
- `tooltip_shown` (context: tooltip_id)

---

### Phase 8 - Fraud Prevention & Moderation

#### Test Case 8.1: Auto-Scan Message for Spam
**Objective**: Verify automatic message scanning

**Steps**:
1. Send message with spam content: "Click here to buy Viagra! http://spam.com"
2. Verify function `queueMessageForScanCallable` is called
3. Check Firestore `moderationFlags` collection

**Expected**:
- Message flagged as HIGH or CRITICAL risk
- Flag created in `moderationFlags/{flagId}`
- Flag contains: `type: "message"`, `autoFlagged: true`, `reasons: ["Spam patterns detected"]`
- User receives immediate warning if CRITICAL

**Data Structure**:
```json
{
  "id": "flag_...",
  "type": "message",
  "status": "pending",
  "targetUserId": "user123",
  "contentId": "msg456",
  "content": "Click here...",
  "riskLevel": "critical",
  "reasons": ["Spam patterns detected"],
  "autoFlagged": true,
  "createdAt": "..."
}
```

**Analytics Events**:
- `moderation_flag_created`

---

#### Test Case 8.2: Escort Keyword Detection
**Objective**: Verify legal compliance detection

**Steps**:
1. Send message: "I offer escort services, incall/outcall available"
2. Verify immediate flagging

**Expected**:
- Message flagged as CRITICAL
- User receives warning immediately
- Trust score decremented

---

#### Test Case 8.3: User Reporting
**Objective**: Verify user-initiated reporting

**Steps**:
1. User A reports User B for harassment
2. Call `reportUserCallable({ targetUserId: "userB", reason: "Harassment" })`
3. Check `moderationFlags` collection

**Expected**:
- Flag created with `type: "user_report"`, `autoFlagged: false`
- `reporterId` set to User A
- Target user's report count incremented

---

#### Test Case 8.4: Moderator Flag Resolution
**Objective**: Verify moderator actions

**Steps**:
1. Moderator logs in (user with `roles.moderator: true`)
2. Fetch pending flags
3. Resolve flag with action "strike"
4. Call `resolveFlagCallable({ flagId: "...", action: "strike", notes: "Inappropriate content" })`

**Expected**:
- Flag status updated to "resolved"
- Target user receives strike
- Trust score reduced by 15 points
- If 3 strikes: User auto-banned

**Permission Check**:
- Non-moderator should get `permission-denied` error

---

#### Test Case 8.5: Trust Score Calculation
**Objective**: Verify trust scoring system

**Initial State**:
- New user: Trust score = 50 (default)

**Scenario 1**: User gets verified
- Trust score: +20 → 70

**Scenario 2**: User completes 10 transactions
- Trust score: +10 → 80

**Scenario 3**: User receives 1 report
- Trust score: -10 → 70

**Scenario 4**: User receives 1 strike
- Trust score: -15 → 55

**Scenario 5**: User receives 3 strikes
- Trust score: 0
- `isBanned: true`
- Firebase Auth account disabled

---

### Phase 9 - Live Streaming

#### Test Case 9.1: Create Public Live Stream
**Objective**: Verify public stream creation

**Steps**:
1. Host creates live session:
   ```javascript
   createLiveSession({
     type: "public",
     title: "Coffee Chat",
     description: "Let's talk!"
   })
   ```
2. Verify session created in Firestore

**Expected**:
- Session document in `liveSessions/{id}`
- `status: "live"`
- `viewerIds: []`
- `tokensPerTick: undefined` (public is free to watch)

**Analytics Events**:
- `live_session_created`

---

#### Test Case 9.2: Create 1:1 Paid Stream
**Objective**: Verify 1:1 video call with billing

**Steps**:
1. Host creates 1:1 session:
   ```javascript
   createLiveSession({
     type: "1on1",
     title: "Private Video Call",
     tokensPerTick: 10  // 10 tokens per 10 seconds
   })
   ```
2. Viewer joins session
3. Verify wallet balance checked (minimum 100 tokens = 10 ticks)

**Expected**:
- Session created with `maxViewers: 1`
- Viewer needs minimum balance
- If balance < 100 tokens: `failed-precondition` error

---

#### Test Case 9.3: Join Live Stream
**Objective**: Verify viewer joining stream

**Steps**:
1. Viewer calls `joinLiveSession({ sessionId: "..." })`
2. Verify viewer added to `viewerIds` array

**Expected**:
- Viewer added: `viewerIds: ["viewer123"]`
- `totalViewers` incremented
- Viewer receives session data

**Edge Cases**:
- Session full (1:1 with 1 viewer): `resource-exhausted` error
- Session not live: `failed-precondition` error

---

#### Test Case 9.4: Send Tip During Stream
**Objective**: Verify tipping during live stream

**Steps**:
1. Viewer sends tip:
   ```javascript
   sendLiveTip({
     sessionId: "...",
     amount: 50,  // 50 tokens
     message: "Great content!"
   })
   ```
2. Verify wallet transactions

**Expected**:
- Viewer balance: -50 tokens
- Host balance: +40 tokens (80% of 50)
- Platform fee: 10 tokens (20%)
- Tip record in `liveTips/{id}`
- Session `totalTips` incremented by 50
- Session `totalRevenue` incremented by 40

**Analytics Events**:
- `live_tip_sent`

---

#### Test Case 9.5: Tick Billing (1:1 Sessions)
**Objective**: Verify 10-second billing

**Setup**:
- Host streaming 1:1 session
- Viewer joined with balance = 150 tokens
- `tokensPerTick: 10`

**Scenario**:
1. Scheduler runs after 10 seconds
2. Viewer charged 10 tokens
3. Host credited 7 tokens (70%)
4. Platform keeps 3 tokens (30%)

**After 10 Ticks (100 seconds)**:
- Viewer balance: 150 - 100 = 50 tokens
- Host balance: +70 tokens
- Session duration: 100 seconds

**After 15 Ticks (150 seconds)**:
- Viewer balance: 0 tokens
- Viewer removed from session (insufficient balance)
- Session continues for host

**Scheduler**: `tickBillingScheduler` (runs every 10 seconds)

---

### Phase 10 - Loyalty & Rankings

#### Test Case 10.1: Points Awarded on Transaction
**Objective**: Verify automatic points award

**Trigger**: `awardPointsOnTx` (Firestore trigger)

**Scenario 1**: User sends chat message
- Transaction type: `chat_message`
- Points awarded: 5 points

**Scenario 2**: User sends tip (50 tokens)
- Transaction type: `tip_sent`
- Points awarded: 10 (base) + 50 (tokens) = 60 points

**Scenario 3**: User receives tip (50 tokens)
- Transaction type: `tip_received`
- Points awarded: 15 (base) + 100 (tokens × 2) = 115 points

**Scenario 4**: User earns from chat (30 tokens)
- Transaction type: `chat_earned`
- Points awarded: 60 points (30 tokens × 2)

**Expected**:
- Points added to `users/{uid}/loyalty/stats`
- Stats incremented (messagesCount, tokensSpent, tokensEarned, etc.)

---

#### Test Case 10.2: Level Progression
**Objective**: Verify level-up system

**Thresholds**:
- Bronze: 0 points
- Silver: 1,000 points
- Gold: 5,000 points
- Platinum: 25,000 points
- Diamond: 100,000 points

**Scenario**:
1. New user starts at Bronze (0 points)
2. User earns 1,500 points
3. Verify level = Silver

**Query**:
```javascript
getUserLoyalty({ targetUserId: "user123" })
```

**Expected Response**:
```json
{
  "userId": "user123",
  "points": 1500,
  "level": "silver",
  "tokensSpent": 200,
  "tokensEarned": 500,
  ...
}
```

---

#### Test Case 10.3: Claim Loyalty Reward
**Objective**: Verify level-up bonus claiming

**Rewards**:
- Bronze: 0 tokens
- Silver: 100 tokens
- Gold: 500 tokens
- Platinum: 2,000 tokens
- Diamond: 10,000 tokens

**Scenario**:
1. User reaches Silver level
2. Call `claimReward()`
3. Verify 100 tokens credited

**Expected**:
- Wallet balance: +100 tokens
- `rewardsClaimedCount` incremented
- Transaction record created: `type: "loyalty_reward"`

**Edge Case**:
- User tries to claim again → `failed-precondition: "Reward already claimed for this level"`

---

#### Test Case 10.4: Rankings - Daily/Weekly/Monthly
**Objective**: Verify ranking system

**Scheduler**: `rebuildRankingsScheduler` (daily at 2 AM UTC)

**Rankings**:
1. **Top Earners**: Sorted by `tokensEarned`
2. **Top Spenders**: Sorted by `tokensSpent`
3. **Top Socializers**: Sorted by `points`

**Data**:
```json
{
  "period": "daily",
  "periodKey": "2025-01-20",
  "topEarners": [
    {
      "userId": "user1",
      "userName": "Alice",
      "score": 5000,
      "rank": 1,
      "level": "gold",
      "badges": ["top_earner", "verified"]
    },
    ...
  ],
  "topSpenders": [...],
  "topSocializers": [...],
  "lastUpdated": "2025-01-20T02:00:00Z"
}
```

**Test**:
```javascript
getRankings({ period: "daily" })
getRankings({ period: "weekly" })
getRankings({ period: "monthly" })
getRankings({ period: "all_time" })
```

---

### Phase 11 - Global Expansion

#### Test Case 11.1: Currency Conversion
**Objective**: Verify multi-currency support

**Example**:
```javascript
// Convert 30 PLN to EUR
convertCurrency(30, "PLN", "EUR")
// Result: ~6.90 EUR

// Convert 30 PLN to USD
convertCurrency(30, "PLN", "USD")
// Result: ~7.50 USD
```

**Token Packages in Different Currencies**:
```javascript
getTokenPackages("PLN")
// [{tokens: 150, price: 30.00, currency: "PLN"}, ...]

getTokenPackages("EUR")
// [{tokens: 150, price: 6.90, currency: "EUR"}, ...]

getTokenPackages("USD")
// [{tokens: 150, price: 7.50, currency: "USD"}, ...]
```

**Expected**:
- Prices calculated from live exchange rates (cached 1 hour)
- Fallback to static rates if API unavailable

---

#### Test Case 11.2: Przelewy24 (P24) Payment
**Objective**: Verify Polish payment method

**Steps**:
1. User selects P24 as payment method
2. Create payment session:
   ```javascript
   createPaymentSession({
     provider: "p24",
     amount: 30,
     currency: "PLN",
     tokens: 150
   })
   ```
3. Redirect to P24 payment page
4. User completes payment
5. P24 webhook triggered
6. Verify tokens credited

**Expected**:
- Payment session created in `paymentSessions/{id}`
- Redirect URL returned
- After payment: Webhook → `handleProviderWebhook/p24`
- User wallet: +150 tokens

---

#### Test Case 11.3: PayU Payment (Multi-Currency)
**Objective**: Verify PayU for EUR/PLN payments

**Steps**:
1. User in Germany selects PayU
2. Create payment:
   ```javascript
   createPaymentSession({
     provider: "payu",
     amount: 7.50,
     currency: "EUR",
     tokens: 150
   })
   ```
3. PayU OAuth flow
4. Payment completed
5. Webhook triggered

**Expected**:
- EUR payment accepted
- Tokens calculated: 7.50 EUR → ~30 PLN → 150 tokens
- Webhook → `handleProviderWebhook/payu`

---

#### Test Case 11.4: Coinbase Crypto Payment
**Objective**: Verify cryptocurrency payments

**Steps**:
1. User selects Coinbase
2. Create payment:
   ```javascript
   createPaymentSession({
     provider: "coinbase",
     amount: 7.50,
     currency: "USD",
     tokens: 150
   })
   ```
3. User pays with BTC/ETH
4. Coinbase webhook on confirmation

**Expected**:
- Charge created on Coinbase Commerce
- User can pay with BTC, ETH, USDC, etc.
- After confirmation (6 blocks for BTC):
  - Webhook → `handleProviderWebhook/coinbase`
  - Event type: `charge:confirmed`
  - Tokens credited: 150

---

#### Test Case 11.5: Auto Currency Detection
**Objective**: Verify currency selection by country

**Examples**:
```javascript
getCurrencyByCountryCode("PL")  // → PLN
getCurrencyByCountryCode("DE")  // → EUR
getCurrencyByCountryCode("US")  // → USD
getCurrencyByCountryCode("GB")  // → GBP
getCurrencyByCountryCode("XX")  // → EUR (default)
```

**Integration**:
- Web app detects user's country via IP geolocation
- Sets default currency automatically
- User can override in settings

---

## Firestore Collections

### Phase 7 - Education
```
users/{uid}/education/state
  - seenIntro: boolean
  - seenChatTips: boolean
  - seenCalendarTips: boolean
  - seenAITips: boolean
  - seenWalletTips: boolean
  - tooltips: { [tooltipId]: { count: number, lastSeen: timestamp } }
```

### Phase 8 - Moderation
```
moderationFlags/{flagId}
  - id, type, status, targetUserId, reporterId
  - contentId, content, riskLevel, reasons
  - autoFlagged, createdAt, reviewedAt, reviewedBy
  - resolution, resolutionNotes

users/{uid}/trust/score
  - userId, trustScore, strikes, warnings
  - isBanned, bannedAt, bannedReason
  - lastStrikeAt, lastWarningAt, updatedAt
```

### Phase 9 - Live Streaming
```
liveSessions/{id}
  - id, type, status, hostId, hostName, title
  - tokensPerTick, viewerIds, maxViewers
  - startedAt, endedAt, duration
  - totalViewers, totalTips, totalRevenue
  - streamUrl, rtcToken

liveTips/{id}
  - id, sessionId, senderId, recipientId
  - amount, message, createdAt
```

### Phase 10 - Loyalty
```
users/{uid}/loyalty/stats
  - userId, points, level, badges
  - tokensSpent, tokensEarned, messagesCount
  - tipsGiven, tipsReceived, liveMinutes
  - rewardsClaimedCount, lastRewardClaim

rankings/{period}_{key}
  - period, periodKey, lastUpdated
  - topEarners: [{ userId, userName, score, rank, level, badges }]
  - topSpenders: [...]
  - topSocializers: [...]
```

### Phase 11 - Payment Providers
```
paymentSessions/{id}
  - id, provider, userId, amount, currency, tokens
  - status, paymentUrl, providerSessionId
  - createdAt, completedAt
```

---

## API Endpoints

### Phase 8 - Moderation
```
POST /queueMessageForScanCallable
  { messageId, chatId, content }
  → { flagged, flagId?, riskLevel, reasons? }

POST /reportUserCallable
  { targetUserId, reason, contentId?, contentType? }
  → { success, flagId }

POST /resolveFlagCallable (Moderator only)
  { flagId, action, notes? }
  → { success }

POST /banUserCallable (Admin only)
  { targetUserId, reason }
  → { success }
```

### Phase 9 - Live Streaming
```
POST /createLiveSessionCallable
  { type, title, description?, tokensPerTick?, scheduledFor? }
  → { success, sessionId, session }

POST /joinLiveSessionCallable
  { sessionId }
  → { success, role, session }

POST /endLiveSessionCallable
  { sessionId }
  → { success, duration, totalViewers, totalRevenue }

POST /sendLiveTipCallable
  { sessionId, amount, message? }
  → { success, amount, recipientAmount, platformFee }
```

### Phase 10 - Loyalty
```
POST /claimRewardCallable
  { }
  → { success, rewardAmount, level }

POST /getUserLoyaltyCallable
  { targetUserId? }
  → { userId, points, level, badges, stats... }

POST /getRankingsCallable
  { period, periodKey? }
  → { period, periodKey, topEarners, topSpenders, topSocializers }
```

### Phase 11 - Payment Providers
```
POST /createPaymentSessionCallable
  { provider, amount, currency, tokens }
  → { success, sessionId, paymentUrl }

POST /handleProviderWebhook/{provider}
  (Webhook from payment provider)
  → { received: true }
```

---

## Scheduled Functions

### Phase 9 - Live Streaming
- **tickBillingScheduler**: Every 10 seconds
  - Bills active 1:1 viewers
  - Removes viewers with insufficient balance

### Phase 10 - Loyalty
- **rebuildRankingsScheduler**: Daily at 2 AM UTC
  - Rebuilds daily, weekly, monthly, all-time rankings
  - Top 100 users per category

---

## Analytics Events

### Phase 7
- `intro_shown`
- `intro_completed` (slides_viewed)
- `tooltip_shown` (context: tooltip_id)

### Phase 8
- `moderation_flag_created` (userId, flagType, riskLevel, autoFlagged)
- `user_reported` (reporterId, targetUserId, reason)
- `flag_resolved` (moderatorId, flagId, action, targetUserId)
- `user_banned` (adminId, targetUserId, reason)

### Phase 9
- `live_session_created` (sessionId, hostId, type)
- `live_session_joined` (sessionId, userId, type)
- `live_session_ended` (sessionId, hostId, duration, totalViewers, totalTips)
- `live_tip_sent` (sessionId, senderId, recipientId, amount)

### Phase 10
- `loyalty_reward_claimed` (userId, level, rewardAmount)

### Phase 11
- `payment_session_created` (userId, provider, amount, currency, tokens)
- `tokens_purchased` (userId, tokens, transactionId)

---

## Success Criteria

### Phase 7
✅ Onboarding flow shows for new users
✅ All 5 slides render correctly
✅ Tooltips auto-show up to 2 times
✅ Education state persisted to Firestore
✅ i18n works for EN and PL

### Phase 8
✅ Messages auto-scanned for spam/violations
✅ Escort keywords flagged as CRITICAL
✅ Users can report other users
✅ Moderators can resolve flags
✅ Admins can ban users
✅ Trust scores calculated correctly
✅ 3 strikes = auto-ban

### Phase 9
✅ Hosts can create live sessions (1:1 and public)
✅ Viewers can join sessions
✅ Tips processed with 80/20 split
✅ 1:1 billing every 10 seconds (70/30 split)
✅ Viewers removed when balance insufficient

### Phase 10
✅ Points awarded on transactions
✅ User levels progress correctly
✅ Level-up rewards claimable
✅ Rankings rebuild daily
✅ Top 100 displayed per category

### Phase 11
✅ Multi-currency support (PLN, EUR, USD, GBP, BTC, ETH)
✅ P24 payments work for Poland
✅ PayU payments work for Central/Eastern Europe
✅ Coinbase crypto payments work
✅ Currency auto-detection by country
✅ Live exchange rates (1hr cache)

---

## Rollback Plan

If critical issues arise after deployment:

1. **Functions Rollback**:
   ```bash
   firebase functions:delete FUNCTION_NAME
   ```

2. **Firestore Rules Rollback**:
   - Revert to previous rules:
   ```bash
   git checkout HEAD~1 firestore.rules
   firebase deploy --only firestore:rules
   ```

3. **Disable Features**:
   - Add feature flags in `config` collection
   - Check flags in functions before executing

---

## Monitoring & Alerts

### Key Metrics to Monitor

**Phase 8 - Moderation**:
- Flags created per day
- Auto-flag rate (% of messages flagged)
- Average resolution time
- Ban rate

**Phase 9 - Live Streaming**:
- Active sessions
- Average session duration
- Tips per session
- Billing errors (insufficient balance)

**Phase 10 - Loyalty**:
- Points awarded per day
- Level distribution (Bronze/Silver/Gold/etc.)
- Reward claims per day

**Phase 11 - Payments**:
- Payment success rate by provider
- Average transaction value
- Conversion rate by currency

### Firebase Console Dashboards

1. **Functions → Logs**: Check for errors
2. **Functions → Usage**: Monitor invocations
3. **Firestore → Usage**: Monitor reads/writes
4. **Analytics**: Track custom events

---

## Support & Troubleshooting

### Common Issues

**Issue**: Function deployment fails
- **Solution**: Check TypeScript errors with `npm run build` in functions/
- **Solution**: Verify all environment variables set

**Issue**: Webhook not receiving events
- **Solution**: Check webhook URL in provider dashboard
- **Solution**: Verify webhook signature validation

**Issue**: Tick billing not working
- **Solution**: Check scheduler logs: `firebase functions:log --only tickBillingScheduler`
- **Solution**: Verify schedule: `*/10 * * * * *` (every 10 seconds)

**Issue**: Currency conversion showing wrong prices
- **Solution**: Check API key for exchange rate service
- **Solution**: Verify cache: Rates update every 1 hour

---

**End of Deployment & Testing Guide**

For questions or issues, contact: support@avalo.app
