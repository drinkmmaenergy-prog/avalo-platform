# PACK 302 — Quick Reference Guide

## 🎯 What This Pack Does

Unifies all token purchases and subscriptions (web + mobile) into one canonical wallet and subscription system.

**Key Features:**
- ✅ Web token checkout via Stripe
- ✅ Mobile IAP verification (iOS/Android)
- ✅ Web subscriptions (VIP/Royal) via Stripe
- ✅ Mobile subscription sync
- ✅ Unified wallet with real-time sync
- ✅ VIP/Royal call discounts (30%/50% off)
- ✅ Idempotent transaction processing
- ✅ Complete audit trail

## 📦 Token Packages

| ID       | Tokens  | Price PLN | $/Token |
|----------|---------|-----------|---------|
| MINI     | 100     | 31.99     | 0.32    |
| BASIC    | 300     | 85.99     | 0.29    |
| STANDARD | 500     | 134.99    | 0.27    |
| PREMIUM  | 1,000   | 244.99    | 0.24    |
| PRO      | 2,000   | 469.99    | 0.23    |
| ELITE    | 5,000   | 1,125.99  | 0.23    |
| ROYAL    | 10,000  | 2,149.99  | 0.21    |

**Payout Rate:** 1 token = 0.20 PLN (fixed)

## 🔑 Environment Variables

```bash
# Stripe (Required)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_VIP_PRICE_ID=price_...
STRIPE_ROYAL_PRICE_ID=price_...

# iOS (Required for Apple IAP)
APPLE_SHARED_SECRET=...

# Android (Required for Google Play)
GOOGLE_PACKAGE_NAME=com.avalo.app
```

## 🚀 API Endpoints

### Web Token Purchase
```
POST /billing/web/create-token-checkout
Body: { userId, packageId, locale, currencyOverride? }
Returns: { checkoutUrl, sessionId }
```

### Web Subscription
```
POST /billing/web/create-subscription-checkout
Body: { userId, tier, locale }
Returns: { checkoutUrl, sessionId }
```

### Mobile Token Purchase
```
POST /billing/mobile/verify-purchase
Body: { userId, platform, packageId, receipt }
Returns: { success, tokensAdded, newBalance, transactionId }
```

### Mobile Subscription Sync
```
POST /billing/mobile/sync-subscription
Body: { userId, platform, tier, status, currentPeriodEnd, originalTransactionId }
Returns: { success, subscriptionUpdated }
```

### Get User Benefits (Callable)
```typescript
const benefits = await httpsCallable(functions, 'pack302_resolveUserBenefits')({});
// Returns: { vipActive, royalActive, callDiscountFactor }
```

### Get User Wallet (Callable)
```typescript
const wallet = await httpsCallable(functions, 'pack302_getUserWallet')({});
// Returns wallet with tokensBalance, lifetimePurchased, etc.
```

## 💡 Usage Examples

### Calculate Call Price with Discount

```typescript
import { resolveUserBenefits, getUserSubscriptions } from './pack302-helpers';

async function calculateCallPrice(userId: string, isVideo: boolean, minutes: number) {
  const subscription = await getUserSubscriptions(userId);
  const benefits = resolveUserBenefits(subscription);
  
  const baseRate = isVideo ? 20 : 10; // tokens/minute
  const discountedRate = baseRate * benefits.callDiscountFactor;
  
  return Math.ceil(discountedRate * minutes);
}

// Example: Royal user, 5-minute video call
// Base: 20 tokens/min * 5 = 100 tokens
// Royal discount (50% off): 100 * 0.5 = 50 tokens
```

### Check Subscription Status

```typescript
import { getUserSubscriptions, resolveUserBenefits } from './pack302-helpers';

const sub = await getUserSubscriptions(userId);
const benefits = resolveUserBenefits(sub);

if (benefits.royalActive) {
  console.log('User has Royal Club - 50% off calls');
} else if (benefits.vipActive) {
  console.log('User has VIP - 30% off calls');
}
```

### Add Tokens After Purchase (Internal)

```typescript
import { addTokensToWallet } from './pack302-helpers';

// Called by webhook/verification endpoints only
const result = await addTokensToWallet(
  userId,
  100, // tokens
  'stripe_session_id', // externalId
  'STRIPE', // provider
  'MINI' // packageId
);

console.log(`New balance: ${result.newBalance}`);
```

## 📊 Firestore Collections

### wallets/{userId}
```typescript
{
  userId: "UID",
  tokensBalance: 1500,
  lifetimePurchasedTokens: 5000,
  lifetimeEarnedTokens: 2000,
  lifetimeWithdrawnTokens: 500,
  updatedAt: Timestamp
}
```

### userSubscriptions/{userId}
```typescript
{
  userId: "UID",
  vipActive: false,
  vipPlanId: null,
  vipProvider: "NONE",
  vipCurrentPeriodEnd: null,
  royalActive: true,
  royalPlanId: "sub_xxx",
  royalProvider: "STRIPE",
  royalCurrentPeriodEnd: "2025-01-15T00:00:00Z",
  updatedAt: Timestamp
}
```

### walletTransactions/{txId}
```typescript
{
  txId: "UUID",
  userId: "UID",
  type: "TOKEN_PURCHASE",
  direction: "IN",
  amountTokens: 100,
  externalId: "cs_test_...",
  provider: "STRIPE",
  createdAt: Timestamp,
  meta: {
    packageId: "MINI"
  }
}
```

## 🛡️ Security Rules Summary

- **Wallets:** Users read own, Cloud Functions write only
- **Subscriptions:** Users read own, Cloud Functions write only
- **Transactions:** Users read own (filtered), Cloud Functions write only
- **Audit Logs:** Admins read only, Cloud Functions write only

## 🔄 Real-Time Sync

Mobile apps automatically receive wallet updates:

```typescript
// React Native
import { doc, onSnapshot } from 'firebase/firestore';

const unsubscribe = onSnapshot(
  doc(db, 'wallets', userId),
  (snapshot) => {
    const balance = snapshot.data()?.tokensBalance || 0;
    updateUI(balance);
  }
);
```

## 🚫 Explicitly Forbidden

This pack does NOT support:
- ❌ Promo codes or coupons
- ❌ Free token bonuses
- ❌ Cashback or rewards
- ❌ Referral purchase bonuses
- ❌ Dynamic/surge pricing
- ❌ Discount campaigns

All promotional features must be implemented in separate packs.

<function_calls>
## 🎯 Call Discount Rules

**ONLY applies to voice and video calls - NOT to:**
- ❌ Text chat
- ❌ Calendar bookings
- ❌ Event tickets
- ❌ Media purchases
- ❌ Tips or gifts

**Discount Tiers:**
- **Standard:** 1.0x (no discount)
- **VIP:** 0.7x (30% off)
- **Royal:** 0.5x (50% off)

**If both active:** Royal wins (always take the better discount)

## 📱 Mobile Integration

### iOS (React Native)

```typescript
import * as InAppPurchases from 'expo-in-app-purchases';

// After successful purchase
const { transactionReceipt } = purchaseResult;

const response = await fetch(API_URL + '/pack302_verifyMobilePurchase', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: auth.currentUser.uid,
    platform: 'APPLE',
    packageId: 'MINI',
    receipt: transactionReceipt
  })
});
```

### Android (React Native)

```typescript
import * as InAppPurchases from 'expo-in-app-purchases';

// After successful purchase
const { purchaseToken } = purchaseResult;

const response = await fetch(API_URL + '/pack302_verifyMobilePurchase', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: auth.currentUser.uid,
    platform: 'GOOGLE',
    packageId: 'MINI',
    receipt: JSON.stringify({
      purchaseToken,
      packageName: 'com.avalo.app',
      productId: 'MINI'
    })
  })
});
```

## 🧪 Testing Checklist

- [ ] Web token purchase (Stripe test mode)
- [ ] Stripe webhook processing
- [ ] Web subscription checkout
- [ ] Subscription webhook events
- [ ] iOS purchase verification (sandbox)
- [ ] Android purchase verification (test)
- [ ] Mobile subscription sync
- [ ] Real-time balance updates
- [ ] Idempotency (duplicate webhooks)
- [ ] Call discount calculation
- [ ] Audit log creation
- [ ] Error handling

## 📞 Support

**Cloud Functions Logs:**
```bash
firebase functions:log --only pack302
```

**Check Webhook Delivery:**
- Stripe Dashboard → Developers → Webhooks → Event Log

**Firestore Console:**
- Check collections: `wallets`, `userSubscriptions`, `walletTransactions`, `billingAuditLogs`

---

**Quick Deploy:** `./deploy-pack302.sh`  
**Full Docs:** [`PACK_302_IMPLEMENTATION.md`](PACK_302_IMPLEMENTATION.md)