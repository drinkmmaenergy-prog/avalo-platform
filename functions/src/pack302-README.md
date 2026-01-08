# PACK 302 — Unified Token & Subscription Checkout

## Implementation Summary

This pack implements unified billing across web and mobile platforms, ensuring all token purchases and subscriptions write to the same canonical wallet and subscription state.

## Files Structure

```
functions/src/
├── pack302-types.ts           # TypeScript types and constants
├── pack302-helpers.ts         # Helper functions (wallet, subscriptions, benefits)
├── pack302-web-billing.ts     # Web endpoints (Stripe checkout & webhooks)
├── pack302-mobile-billing.ts  # Mobile endpoints (IAP verification & sync)
├── pack302-billing.ts         # Main exports
└── index.ts                   # Function exports (lines 5395+)

firestore-pack302-billing.rules         # Security rules
firestore-pack302-billing.indexes.json  # Query indexes
deploy-pack302.sh                       # Deployment script
```

## Key Functions

### Exported Cloud Functions

| Function Name | Type | Purpose |
|---------------|------|---------|
| `pack302_createTokenCheckout` | HTTP | Create Stripe checkout for tokens (web) |
| `pack302_stripeWebhook` | HTTP | Handle Stripe webhooks |
| `pack302_createSubscriptionCheckout` | HTTP | Create Stripe checkout for subscriptions (web) |
| `pack302_verifyMobilePurchase` | HTTP | Verify iOS/Android purchase receipts |
| `pack302_syncMobileSubscription` | HTTP | Sync mobile subscription status |
| `pack302_resolveUserBenefits` | Callable | Get VIP/Royal discount multiplier |
| `pack302_getUserSubscriptions` | Callable | Get subscription status |
| `pack302_getUserWallet` | Callable | Get wallet balance and stats |

### Helper Functions (Internal)

| Function | Purpose |
|----------|---------|
| `resolveUserBenefits()` | Calculate call discount factor based on subscriptions |
| `getUserWallet()` | Get or initialize user wallet |
| `getUserSubscriptions()` | Get or initialize subscription state |
| `addTokensToWallet()` | Credit tokens with idempotency check |
| `updateSubscriptionStatus()` | Update VIP/Royal subscription state |
| `writeBillingAuditLog()` | Write immutable audit log |
| `isTransactionProcessed()` | Check if purchase was already processed |
| `getTokenPackage()` | Validate and get package details |
| `resolveCurrency()` | Determine currency from locale |
| `convertPrice()` | Convert PLN to target currency |

## Usage in Call Pricing

```typescript
import { resolveUserBenefits, getUserSubscriptions } from './pack302-helpers';

async function calculateCallRate(userId: string, isVideo: boolean): Promise<number> {
  const subscription = await getUserSubscriptions(userId);
  const benefits = resolveUserBenefits(subscription);
  
  const baseRate = isVideo ? 20 : 10; // tokens per minute
  return Math.ceil(baseRate * benefits.callDiscountFactor);
}

// Examples:
// Standard user, video call: 20 tokens/min * 1.0 = 20 tokens/min
// VIP user, video call: 20 tokens/min * 0.7 = 14 tokens/min
// Royal user, video call: 20 tokens/min * 0.5 = 10 tokens/min
```

## Webhook Configuration

### Stripe Webhook Endpoint

```
URL: https://europe-west3-[PROJECT-ID].cloudfunctions.net/pack302_stripeWebhook
Events:
  - checkout.session.completed
  - customer.subscription.created
  - customer.subscription.updated
  - customer.subscription.deleted
```

**IMPORTANT:** Copy webhook signing secret to environment:
```bash
firebase functions:config:set stripe.webhook_secret="whsec_..."
```

## Mobile App Integration

### iOS (App Store)

1. **Create In-App Products:**
   - Type: Consumable (for tokens)
   - Product IDs: `MINI`, `BASIC`, `STANDARD`, `PREMIUM`, `PRO`, `ELITE`, `ROYAL`

2. **Create Auto-Renewable Subscriptions:**
   - Product IDs: `VIP`, `ROYAL`
   - Duration: 1 month

3. **After Purchase:**
```swift
// Get receipt
let receiptURL = Bundle.main.appStoreReceiptURL
let receiptData = try? Data(contentsOf: receiptURL!)
let receiptString = receiptData?.base64EncodedString()

// Verify with backend
POST /billing/mobile/verify-purchase
{
  "userId": currentUserId,
  "platform": "APPLE",
  "packageId": "MINI",
  "receipt": receiptString
}
```

### Android (Google Play)

1. **Create Managed Products:**
   - Product IDs: Must match package IDs

2. **Create Subscriptions:**
   - Product IDs: `VIP`, `ROYAL`

3. **After Purchase:**
```kotlin
// Get purchase token
val purchaseToken = purchase.purchaseToken
val receipt = JSONObject().apply {
    put("purchaseToken", purchaseToken)
    put("packageName", "com.avalo.app")
    put("productId", packageId)
}.toString()

// Verify with backend
POST /billing/mobile/verify-purchase
{
  "userId": currentUserId,
  "platform": "GOOGLE",
  "packageId": "MINI",
  "receipt": receipt
}
```

## Idempotency & Edge Cases

### Duplicate Webhook Handling

Stripe may send the same webhook multiple times. PACK 302 handles this:

```typescript
// Check if already processed
const existingTx = await db
  .collection('walletTransactions')
  .where('externalId', '==', session.id)
  .where('userId', '==', userId)
  .limit(1)
  .get();

if (!existingTx.empty) {
  // Already processed - safe to ignore
  return;
}
```

### User Refreshes Success Page

If user refreshes the Stripe success page:
- Checkout session already completed
- Webhook already processed
- Second verification attempt returns `already-exists` error
- No tokens credited twice ✅

### Concurrent Mobile Purchases

If user makes multiple purchases quickly:
- Each has unique transaction ID
- All verified and processed independently
- No race conditions due to transaction IDs

### Subscription Overlaps

If user has both VIP and Royal active:
- `resolveUserBenefits()` returns Royal (better discount)
- Both flags remain true in database
- Call pricing always uses best available discount

## Migration from Existing Systems

### If you have old wallet collection:

```typescript
// Migration script (run once)
const oldWallets = await db.collection('users')
  .get();

for (const doc of oldWallets.docs) {
  const oldData = doc.data();
  const oldWallet = oldData.wallet || {};
  
  await db.collection('wallets').doc(doc.id).set({
    userId: doc.id,
    tokensBalance: oldWallet.balance || 0,
    lifetimePurchasedTokens: oldWallet.purchased || 0,
    lifetimeEarnedTokens: oldWallet.earned || 0,
    lifetimeWithdrawnTokens: oldWallet.withdrawn || 0,
    updatedAt: admin.firestore.Timestamp.now()
  });
}
```

## Monitoring

### Key Metrics

```typescript
// Total revenue (lifetime)
const allPurchases = await db.collection('walletTransactions')
  .where('type', '==', 'TOKEN_PURCHASE')
  .get();

const totalTokensSold = allPurchases.docs
  .reduce((sum, doc) => sum + doc.data().amountTokens, 0);

const totalRevenuePLN = totalTokensSold * 0.20; // Payout rate

// Active subscriptions
const activeSubs = await db.collection('userSubscriptions')
  .where('vipActive', '==', true)
  .get();

const activeVipCount = activeSubs.size;

const activeRoyal = await db.collection('userSubscriptions')
  .where('royalActive', '==', true)
  .get();

const activeRoyalCount = activeRoyal.size;
```

### Audit Queries

```typescript
// All purchases by a user
db.collection('walletTransactions')
  .where('userId', '==', userId)
  .where('type', '==', 'TOKEN_PURCHASE')
  .orderBy('createdAt', 'desc');

// All subscription events
db.collection('billingAuditLogs')
  .where('userId', '==', userId)
  .orderBy('timestamp', 'desc');

// Purchases by provider
db.collection('walletTransactions')
  .where('provider', '==', 'STRIPE')
  .where('type', '==', 'TOKEN_PURCHASE')
  .orderBy('createdAt', 'desc');
```

## Troubleshooting

### Problem: Webhook returns 400

**Cause:** Signature verification failed

**Fix:**
1. Check `STRIPE_WEBHOOK_SECRET` matches Stripe Dashboard
2. Verify endpoint URL is correct
3. Check Cloud Functions logs for exact error

### Problem: Mobile verification fails

**iOS:**
- Ensure receipt is base64-encoded
- Check `APPLE_SHARED_SECRET` is set
- Verify using sandbox for testing

**Android:**
- Ensure Google Play Developer API enabled
- Check service account permissions
- Verify package name matches

### Problem: Balance not updating

**Check:**
1. Transaction created in `walletTransactions`?
2. Wallet document exists in `wallets/{userId}`?
3. Client has Firestore listener active?
4. Any Firestore rule violations?

## Production Checklist

Before going live:

- [ ] All environment variables set
- [ ] Stripe webhook endpoint configured
- [ ] Stripe test purchases successful
- [ ] Mobile test purchases successful (iOS sandbox + Android test)
- [ ] Firestore rules deployed
- [ ] Firestore indexes deployed
- [ ] Real-time sync tested on multiple devices
- [ ] Idempotency tested (duplicate webhooks)
- [ ] Subscription benefits working in call pricing
- [ ] Audit logs populating correctly
- [ ] Error handling tested
- [ ] Monitoring alerts configured

## Additional Resources

- [Full Implementation Guide](../PACK_302_IMPLEMENTATION.md)
- [Quick Reference](../PACK_302_QUICK_REFERENCE.md)
- [Stripe API Documentation](https://stripe.com/docs/api)
- [Google Play Billing](https://developer.android.com/google/play/billing)
- [App Store Server API](https://developer.apple.com/documentation/appstoreserverapi)

---

**Version:** 1.0.0  
**Last Updated:** 2025-12-09  
**Maintainer:** PACK 302 Implementation Team