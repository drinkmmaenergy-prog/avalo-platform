# PACK 302 — Unified Token & Subscription Checkout Implementation

## Overview

PACK 302 implements a unified billing system that handles all token purchases and subscriptions across web (Stripe) and mobile (Google Play / App Store) platforms. All purchases write to a single, canonical wallet and subscription state without changing existing tokenomics.

**Status:** ✅ COMPLETE

**Dependencies:**
- PACK 277 (Wallet & Transactions)
- PACK 288 (Token Store)
- PACK 289 (Payouts)
- PACK 295 (Localization & currencies)
- PACK 297 (Environments, feature flags)

## Core Principles

### Fixed Economics (DO NOT MODIFY)
- **Payout Rate:** 0.20 PLN/token (fixed)
- **Revenue Splits:**
  - Chat/Calls/Tips: 65% creator / 35% Avalo
  - Calendar/Events: 80% creator / 20% Avalo
- **Call Discounts:**
  - VIP: 30% off (0.7x multiplier)
  - Royal: 50% off (0.5x multiplier)
  - Applies to calls ONLY (not chat, calendar, or other services)
- **No Promotions:** No free tokens, promo codes, cashback, or bonuses

### Token Packages (FINAL)

| Package  | Tokens  | Price (PLN) | Price/Token |
|----------|---------|-------------|-------------|
| Mini     | 100     | 31.99       | 0.3199      |
| Basic    | 300     | 85.99       | 0.2866      |
| Standard | 500     | 134.99      | 0.2700      |
| Premium  | 1,000   | 244.99      | 0.2450      |
| Pro      | 2,000   | 469.99      | 0.2350      |
| Elite    | 5,000   | 1,125.99    | 0.2252      |
| Royal    | 10,000  | 2,149.99    | 0.2150      |

Mobile app store prices may differ locally due to platform FX rates, but token amounts remain the same.

## Architecture

### Data Collections

#### 1. Wallets (`wallets/{userId}`)
```typescript
{
  userId: string;
  tokensBalance: number;              // Current available tokens
  lifetimePurchasedTokens: number;    // Total tokens ever purchased
  lifetimeEarnedTokens: number;       // Total tokens earned from others
  lifetimeWithdrawnTokens: number;    // Total tokens withdrawn as fiat
  updatedAt: Timestamp;
}
```

#### 2. User Subscriptions (`userSubscriptions/{userId}`)
```typescript
{
  userId: string;
  
  vipActive: boolean;
  vipPlanId: string | null;
  vipProvider: 'STRIPE' | 'GOOGLE' | 'APPLE' | 'NONE';
  vipCurrentPeriodEnd: string | null;  // ISO datetime
  
  royalActive: boolean;
  royalPlanId: string | null;
  royalProvider: 'STRIPE' | 'GOOGLE' | 'APPLE' | 'NONE';
  royalCurrentPeriodEnd: string | null;  // ISO datetime
  
  updatedAt: Timestamp;
}
```

#### 3. Wallet Transactions (`walletTransactions/{txId}`)
```typescript
{
  txId: string;
  userId: string;
  type: 'TOKEN_PURCHASE' | 'CHAT_SPEND' | 'CALL_SPEND' | 
        'CALENDAR_BOOKING' | 'CALENDAR_REFUND' | 
        'EVENT_TICKET' | 'EVENT_REFUND' | 
        'PAYOUT' | 'ADJUSTMENT';
  direction: 'IN' | 'OUT';
  amountTokens: number;
  externalId: string | null;  // Stripe or Store transaction ID
  provider: 'STRIPE' | 'GOOGLE' | 'APPLE' | 'SYSTEM' | 'USER';
  createdAt: Timestamp;
  meta: {
    packageId?: string | null;
    chatId?: string | null;
    bookingId?: string | null;
    eventId?: string | null;
    reason?: string | null;
  };
}
```

#### 4. Billing Audit Logs (`billingAuditLogs/{logId}`)
```typescript
{
  logId: string;
  action: 'TOKEN_PURCHASE' | 'SUBSCRIPTION_STARTED' | 
          'SUBSCRIPTION_UPDATED' | 'SUBSCRIPTION_CANCELLED' |
          'MOBILE_PURCHASE_VERIFIED' | 'MOBILE_SUBSCRIPTION_SYNCED';
  userId: string;
  provider: 'STRIPE' | 'GOOGLE' | 'APPLE' | 'SYSTEM' | 'USER';
  timestamp: Timestamp;
  amount?: number;
  packageId?: string;
  tier?: 'VIP' | 'ROYAL';
  externalId?: string;
}
```

## API Endpoints

### Web Token Purchase (Stripe)

#### 1. Create Token Checkout Session
```http
POST /billing/web/create-token-checkout
Content-Type: application/json

{
  "userId": "UID",
  "packageId": "MINI | BASIC | STANDARD | PREMIUM | PRO | ELITE | ROYAL",
  "locale": "pl-PL | en-GB | en-US | ...",
  "currencyOverride": "PLN | EUR | USD | GBP | null"
}
```

**Response:**
```json
{
  "checkoutUrl": "https://checkout.stripe.com/...",
  "sessionId": "cs_test_..."
}
```

**Flow:**
1. Resolve package → tokens + PLN price
2. Resolve currency from locale (or use override)
3. Convert price to target currency
4. Create Stripe Checkout Session with metadata
5. Return checkout URL for client redirect

#### 2. Stripe Webhook Handler
```http
POST /billing/web/stripe-webhook
Stripe-Signature: t=...,v1=...
Content-Type: application/json

[Stripe Event Payload]
```

**Handled Events:**
- `checkout.session.completed` → Token purchase
- `customer.subscription.created` → Subscription started
- `customer.subscription.updated` → Subscription renewed/modified
- `customer.subscription.deleted` → Subscription cancelled

**Processing:**
1. Verify webhook signature
2. Check idempotency via `externalId`
3. Create `walletTransactions` entry
4. Update `wallets` (increment balance & lifetime)
5. Write `billingAuditLogs` entry

### Web Subscription Purchase (Stripe)

#### 3. Create Subscription Checkout Session
```http
POST /billing/web/create-subscription-checkout
Content-Type: application/json

{
  "userId": "UID",
  "tier": "VIP | ROYAL",
  "locale": "pl-PL | en-GB | ..."
}
```

**Response:**
```json
{
  "checkoutUrl": "https://checkout.stripe.com/...",
  "sessionId": "cs_test_..."
}
```

**Flow:**
1. Validate tier
2. Get price ID from env (`STRIPE_VIP_PRICE_ID` or `STRIPE_ROYAL_PRICE_ID`)
3. Create Stripe Checkout Session (mode: subscription)
4. Return checkout URL

**Webhook Processing:**
- Subscription webhooks update `userSubscriptions/{userId}`
- Sets `{tier}Active`, `{tier}PlanId`, `{tier}Provider`, `{tier}CurrentPeriodEnd`

### Mobile Token Purchase (IAP)

#### 4. Verify Mobile Purchase
```http
POST /billing/mobile/verify-purchase
Content-Type: application/json

{
  "userId": "UID",
  "platform": "GOOGLE | APPLE",
  "packageId": "MINI | BASIC | STANDARD | PREMIUM | PRO | ELITE | ROYAL",
  "receipt": "platform-specific-receipt-string"
}
```

**Response:**
```json
{
  "success": true,
  "tokensAdded": 100,
  "newBalance": 250,
  "transactionId": "tx_..."
}
```

**Flow:**
1. Verify receipt with Google Play / App Store API
2. Confirm product ID matches `packageId`
3. Check transaction is not refunded/cancelled
4. Check idempotency via platform transaction ID
5. Add tokens to wallet
6. Create `walletTransactions` entry
7. Write audit log

### Mobile Subscription Sync

#### 5. Sync Mobile Subscription
```http
POST /billing/mobile/sync-subscription
Content-Type: application/json

{
  "userId": "UID",
  "platform": "GOOGLE | APPLE",
  "tier": "VIP | ROYAL",
  "status": "ACTIVE | CANCELLED | EXPIRED",
  "currentPeriodEnd": "2025-01-15T00:00:00Z",
  "originalTransactionId": "platform-tx-id"
}
```

**Response:**
```json
{
  "success": true,
  "subscriptionUpdated": true
}
```

**Flow:**
1. Validate input
2. Check idempotency via `originalTransactionId`
3. Update `userSubscriptions/{userId}`
4. Write audit log

### Helper Functions (Callable)

#### 6. Resolve User Benefits
```http
POST /pack302_resolveUserBenefits
Authorization: Firebase Auth Token

{
  "userId": "UID" (optional, defaults to authenticated user)
}
```

**Response:**
```json
{
  "success": true,
  "benefits": {
    "vipActive": false,
    "royalActive": true,
    "callDiscountFactor": 0.5  // 50% discount for Royal
  }
}
```

**Usage:** Call pricing logic uses this to determine discounted rates.

#### 7. Get User Subscriptions
```http
POST /pack302_getUserSubscriptions
Authorization: Firebase Auth Token

{
  "userId": "UID" (optional)
}
```

**Response:**
```json
{
  "success": true,
  "subscription": {
    "userId": "UID",
    "vipActive": false,
    "vipPlanId": null,
    "vipProvider": "NONE",
    "vipCurrentPeriodEnd": null,
    "royalActive": true,
    "royalPlanId": "sub_xxx",
    "royalProvider": "STRIPE",
    "royalCurrentPeriodEnd": "2025-01-15T00:00:00Z",
    "updatedAt": "..."
  }
}
```

#### 8. Get User Wallet
```http
POST /pack302_getUserWallet
Authorization: Firebase Auth Token

{
  "userId": "UID" (optional)
}
```

**Response:**
```json
{
  "success": true,
  "wallet": {
    "userId": "UID",
    "tokensBalance": 1500,
    "lifetimePurchasedTokens": 5000,
    "lifetimeEarnedTokens": 2000,
    "lifetimeWithdrawnTokens": 500,
    "updatedAt": "..."
  }
}
```

## Integration Guide

### Call Pricing Integration

Update your call pricing logic to use `resolveUserBenefits()`:

```typescript
import { resolveUserBenefits, getUserSubscriptions } from './pack302-helpers';

async function calculateCallPrice(
  userId: string,
  isVideo: boolean,
  durationMinutes: number
): Promise<number> {
  // Get subscription status
  const subscription = await getUserSubscriptions(userId);
  const benefits = resolveUserBenefits(subscription);
  
  // Base rates
  const baseRate = isVideo ? 20 : 10; // tokens per minute
  
  // Apply discount
  const discountedRate = baseRate * benefits.callDiscountFactor;
  
  return Math.ceil(discountedRate * durationMinutes);
}
```

### Wallet Balance Check

```typescript
import { getUserWallet } from './pack302-helpers';

async function checkSufficientBalance(userId: string, required: number): Promise<boolean> {
  const wallet = await getUserWallet(userId);
  return wallet.tokensBalance >= required;
}
```

### Multi-Platform Consistency

All token purchases (web or mobile) automatically sync to the unified wallet via Firestore. Mobile apps should:

1. **Listen to wallet updates:**
```typescript
// React Native / Mobile
import { doc, onSnapshot } from 'firebase/firestore';

const walletRef = doc(db, 'wallets', userId);
const unsubscribe = onSnapshot(walletRef, (snapshot) => {
  const wallet = snapshot.data();
  updateUI(wallet.tokensBalance);
});
```

2. **After successful mobile purchase:**
```typescript
// Call verification endpoint
const response = await fetch(
  'https://europe-west3-[PROJECT].cloudfunctions.net/pack302_verifyMobilePurchase',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      platform: 'GOOGLE', // or 'APPLE'
      packageId: 'MINI',
      receipt: purchaseReceipt
    })
  }
);

const result = await response.json();
// Result contains new balance
```

## Setup Instructions

### 1. Environment Variables

Set required environment variables:

```bash
# Required for Stripe
firebase functions:config:set stripe.secret_key="sk_live_..."
firebase functions:config:set stripe.webhook_secret="whsec_..."

# Required for subscriptions
firebase functions:config:set stripe.vip_price_id="price_..."
firebase functions:config:set stripe.royal_price_id="price_..."

# Required for iOS IAP
firebase functions:config:set apple.shared_secret="..."

# Required for Android IAP
firebase functions:config:set google.package_name="com.avalo.app"
```

### 2. Stripe Product Setup

In Stripe Dashboard, create products:

**Token Packages:**
1. Mini Package - 100 tokens - 31.99 PLN
2. Basic Package - 300 tokens - 85.99 PLN
3. Standard Package - 500 tokens - 134.99 PLN
4. Premium Package - 1,000 tokens - 244.99 PLN
5. Pro Package - 2,000 tokens - 469.99 PLN
6. Elite Package - 5,000 tokens - 1,125.99 PLN
7. Royal Package - 10,000 tokens - 2,149.99 PLN

**Subscriptions:**
1. VIP Membership - Recurring monthly
2. Royal Club - Recurring monthly

**Important:** Store price IDs in environment variables.

### 3. Stripe Webhook Configuration

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://europe-west3-[PROJECT-ID].cloudfunctions.net/pack302_stripeWebhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy webhook signing secret to environment

### 4. Mobile App Store Configuration

**iOS (App Store Connect):**
1. Create in-app purchases matching package IDs:
   - `com.avalo.tokens.mini`
   - `com.avalo.tokens.basic`
   - `com.avalo.tokens.standard`
   - `com.avalo.tokens.premium`
   - `com.avalo.tokens.pro`
   - `com.avalo.tokens.elite`
   - `com.avalo.tokens.royal`

2. Create auto-renewable subscriptions:
   - `com.avalo.subscription.vip`
   - `com.avalo.subscription.royal`

**Android (Google Play Console):**
1. Create managed products matching package IDs (same as above)
2. Create subscriptions for VIP and Royal

### 5. Deploy PACK 302

```bash
chmod +x deploy-pack302.sh
./deploy-pack302.sh
```

Or manually:
```bash
# Build functions
cd functions && npm run build && cd ..

# Deploy rules and indexes
firebase deploy --only firestore:rules,firestore:indexes

# Deploy functions
firebase deploy --only functions:pack302_createTokenCheckout,functions:pack302_stripeWebhook,functions:pack302_createSubscriptionCheckout,functions:pack302_verifyMobilePurchase,functions:pack302_syncMobileSubscription,functions:pack302_resolveUserBenefits,functions:pack302_getUserSubscriptions,functions:pack302_getUserWallet
```

## Testing Guide

### Test Token Purchase (Web)

```bash
# 1. Create checkout session
curl -X POST https://europe-west3-[PROJECT].cloudfunctions.net/pack302_createTokenCheckout \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "packageId": "MINI",
    "locale": "pl-PL"
  }'

# 2. Complete checkout in Stripe test mode
# 3. Verify wallet updated:
#    - Check wallets/{userId}.tokensBalance
#    - Check walletTransactions collection
#    - Check billingAuditLogs collection
```

### Test Mobile Purchase

```typescript
// Mobile app after successful IAP
const response = await fetch(CLOUD_FUNCTIONS_URL + '/pack302_verifyMobilePurchase', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: auth.currentUser.uid,
    platform: Platform.OS === 'ios' ? 'APPLE' : 'GOOGLE',
    packageId: 'MINI',
    receipt: purchaseReceipt
  })
});

const result = await response.json();
console.log('New balance:', result.newBalance);
```

### Test Subscription Benefits

```typescript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const resolveUserBenefits = httpsCallable(functions, 'pack302_resolveUserBenefits');

const result = await resolveUserBenefits({});
console.log('Benefits:', result.data.benefits);
// { vipActive: true, royalActive: false, callDiscountFactor: 0.7 }
```

## Security & Idempotency

### Idempotency Guarantees

1. **Token Purchases:**
   - Each `externalId` (Stripe session ID or mobile transaction ID) can only be processed once
   - Duplicate webhook calls are safely ignored
   - Check performed via query: `walletTransactions WHERE externalId == X AND userId == Y`

2. **Subscription Syncs:**
   - Each mobile subscription sync with same `originalTransactionId` processed once
   - Prevents duplicate subscription activations

### Security Rules

- **Wallets:** Read-only for owner, write-only by Cloud Functions
- **Subscriptions:** Read-only for owner, write-only by Cloud Functions
- **Transactions:** Read-only for owner (filtered by userId), write-only by Cloud Functions
- **Audit Logs:** Read-only for admins, write-only by Cloud Functions

## Error Handling

### Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `invalid-argument` | Missing required fields or invalid package ID | Check request payload |
| `already-exists` | Transaction already processed | Safe to ignore - already credited |
| `failed-precondition` | Subscription price not configured | Set environment variables |
| `invalid` | Receipt verification failed | Check receipt format and platform |

### Retry Logic

- **Webhooks:** Stripe automatically retries failed webhooks (exponential backoff)
- **Mobile verification:** Client should retry on network errors only
- **Idempotency:** Safe to retry any operation - duplicates are detected and rejected

## Monitoring & Observability

### Key Metrics to Monitor

1. **Purchase Success Rate:**
   ```
   successful_purchases / total_purchase_attempts
   ```

2. **Webhook Processing Time:**
   ```
   Monitor Cloud Functions execution time for pack302_stripeWebhook
   ```

3. **Mobile Verification Failures:**
   ```
   Count failed receipt verifications by platform
   ```

4. **Subscription Churn:**
   ```
   cancelled_subscriptions / active_subscriptions (monthly)
   ```

### Audit Queries

```typescript antml:function_calls>
// Get all purchases for a user
db.collection('walletTransactions')
  .where('userId', '==', userId)
  .where('type', '==', 'TOKEN_PURCHASE')
  .orderBy('createdAt', 'desc')
  .limit(50);

// Get subscription history
db.collection('billingAuditLogs')
  .where('userId', '==', userId)
  .where('action', 'in', ['SUBSCRIPTION_STARTED', 'SUBSCRIPTION_CANCELLED'])
  .orderBy('timestamp', 'desc');

// Check for duplicate transactions (should be 0)
db.collection('walletTransactions')
  .where('externalId', '==', transactionId)
  .get();
```

## Migration Notes

### From Existing Systems

If you have existing wallet/billing code:

1. **DO NOT delete old code immediately** - run in parallel during migration
2. **Wallet reconciliation:** Run script to migrate old wallet balances to new schema
3. **Transaction history:** Backfill `walletTransactions` from old transaction ledgers
4. **Subscriptions:** Import active subscriptions into `userSubscriptions`

### Backward Compatibility

PACK 302 is designed to be additive:
- Old wallet references (e.g., `users/{uid}/wallet/current`) can coexist
- Gradually migrate calling code to use new `wallets/{userId}` structure
- Both systems can write to same collections during transition period

## Troubleshooting

### Webhook Not Receiving Events

1. Check webhook endpoint is publicly accessible
2. Verify webhook secret matches in Stripe Dashboard and environment
3. Check Stripe Dashboard → Developers → Webhooks → Event Log
4. Enable request logging in Cloud Functions

### Mobile Receipt Verification Failing

**iOS:**
- Ensure `APPLE_SHARED_SECRET` is set correctly
- Check receipt format (base64-encoded)
- Verify product IDs match exactly
- Test sandbox vs. production environment

**Android:**
- Ensure Google Play Developer API is enabled
- Check service account has proper permissions
- Verify `GOOGLE_PACKAGE_NAME` matches app package

### Balance Not Updating

1. Check Firestore listeners are active on client
2. Verify transaction was created in `walletTransactions`
3. Check Cloud Functions logs for errors
4. Ensure no Firestore rule violations

## Files Created

### Cloud Functions
- [`functions/src/pack302-types.ts`](functions/src/pack302-types.ts) - TypeScript types and constants
- [`functions/src/pack302-helpers.ts`](functions/src/pack302-helpers.ts) - Helper functions
- [`functions/src/pack302-web-billing.ts`](functions/src/pack302-web-billing.ts) - Web/Stripe endpoints
- [`functions/src/pack302-mobile-billing.ts`](functions/src/pack302-mobile-billing.ts) - Mobile IAP endpoints
- [`functions/src/pack302-billing.ts`](functions/src/pack302-billing.ts) - Main exports
- [`functions/src/index.ts`](functions/src/index.ts:5395) - Exported callable functions

### Firestore Configuration
- [`firestore-pack302-billing.rules`](firestore-pack302-billing.rules) - Security rules
- [`firestore-pack302-billing.indexes.json`](firestore-pack302-billing.indexes.json) - Query indexes

### Deployment
- [`deploy-pack302.sh`](deploy-pack302.sh) - Deployment automation script

### Configuration
- [`functions/src/config.ts`](functions/src/config.ts:87) - Updated with final token packages

## Compliance & Audit

### GDPR Compliance
- All purchases logged in `walletTransactions` (immutable ledger)
- Users can request data export via PACK 93
- Audit logs retained for financial compliance (7 years minimum)

### Financial Audit Trail
- Every purchase creates immutable `walletTransactions` entry
- Every state change creates `billingAuditLogs` entry
- `externalId` links to provider transaction for reconciliation
- No deletion allowed - append-only ledger

### Tax Reporting
- All transactions include provider and amount in tokens
- Can calculate revenue via: `tokens * 0.20 PLN`
- Integrates with PACK 129 tax engine for regional compliance

## Future Enhancements

Forbidden in this pack (create separate packs if needed):
- ❌ Promo codes or discount coupons
- ❌ Free token grants or bonuses
- ❌ Dynamic pricing or A/B price testing
- ❌ Cashback or loyalty rewards
- ❌ Referral purchase bonuses

Allowed in future packs:
- ✅ Alternative payment methods (crypto, local payment)
- ✅ Bulk purchase discounts (new packages only)
- ✅ Gifting tokens to other users
- ✅ Subscription bundling with tokens

## Support

For issues or questions:
1. Check Cloud Functions logs: `firebase functions:log --only pack302`
2. Review Stripe webhook delivery logs
3. Check mobile app receipt validation logs
4. Verify Firestore rules and indexes deployed correctly

---

**Implementation Date:** 2025-12-09  
**Version:** 1.0.0  
**Status:** Production Ready ✅