# Payment System Deployment Guide

**Version:** 1.0.0  
**Date:** 2025-11-09  
**Status:** Ready for Deployment

---

## 📋 Pre-Deployment Checklist

### 1. Environment Configuration

Copy and configure environment variables:

```bash
cd functions
cp .env.payments.example .env.local
```

Edit `.env.local` and set:

```bash
# REQUIRED - Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLIC_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# REQUIRED - Apple IAP
APPLE_SHARED_SECRET=your_shared_secret
APPLE_SANDBOX=false  # Set to true for testing

# REQUIRED - URLs
WEB_URL=https://avalo.app
FUNCTIONS_URL=https://europe-west3-avalo.cloudfunctions.net

# REQUIRED - Settlement
SETTLEMENT_RATE=0.20
DEFAULT_CURRENCY=PLN
```

### 2. Apple App Store Setup

1. **Create In-App Purchase Products** in App Store Connect:
   - `avalo.tokens.mini.100` - 100 Tokens
   - `avalo.tokens.basic.300` - 300 Tokens
   - `avalo.tokens.standard.500` - 500 Tokens
   - `avalo.tokens.premium.1000` - 1000 Tokens
   - `avalo.tokens.pro.2000` - 2000 Tokens
   - `avalo.tokens.elite.5000` - 5000 Tokens

2. **Set Pricing** for each tier in all supported regions

3. **Generate Shared Secret**:
   - App Store Connect → Apps → In-App Purchases → App-Specific Shared Secret
   - Copy to `APPLE_SHARED_SECRET` environment variable

4. **Configure Server Notifications**:
   - Production URL: `https://europe-west3-avalo.cloudfunctions.net/appleWebhook`
   - Version: V2 notifications

### 3. Stripe Setup

1. **Configure Webhook Endpoint**:
   ```
   URL: https://europe-west3-avalo.cloudfunctions.net/stripeWebhookV2
   Events to listen:
   - checkout.session.completed
   - customer.subscription.created
   - customer.subscription.updated
   - customer.subscription.deleted
   - charge.refunded
   ```

2. **Copy Webhook Signing Secret** to `STRIPE_WEBHOOK_SECRET`

3. **Enable Payment Methods**:
   - Cards
   - SEPA Direct Debit (EU)
   - iDEAL (Netherlands)
   - Bancontact (Belgium)

### 4. Mobile App Configuration

Install iOS payment dependencies:

```bash
cd app-mobile
npm install react-native-iap@^12.15.0
npx pod-install
```

---

## 🚀 Deployment Steps

### Step 1: Deploy Firestore Indexes

```bash
firebase deploy --only firestore:indexes
```

Verify in Firebase Console → Firestore → Indexes that all indexes are created.

### Step 2: Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

Test rules with Firestore Rules Playground.

### Step 3: Build and Deploy Functions

```bash
cd functions
npm run build
```

Verify build succeeds with no TypeScript errors.

Deploy all payment functions:

```bash
firebase deploy --only functions:createStripeCheckoutSession,functions:stripeWebhookV2,functions:validateAppleReceipt,functions:initiateChat,functions:releaseEscrowIncremental,functions:autoRefundInactiveEscrows,functions:createCalendarBooking,functions:completeCalendarBooking,functions:cancelCalendarBooking,functions:generateMonthlySettlements,functions:getWalletBalance,functions:getTransactionHistory,functions:requestPayout,functions:getCreatorSettlements,functions:getPendingSettlements
```

### Step 4: Test in Sandbox

#### Test Stripe (Web)

```bash
# 1. Start web app
cd app-web
npm run dev

# 2. Navigate to wallet page
# 3. Purchase tokens using test card: 4242 4242 4242 4242
# 4. Verify tokens credited
# 5. Check transaction in Firestore
```

#### Test Apple IAP (iOS)

```bash
# 1. Build iOS app
cd app-mobile
npx expo run:ios

# 2. Sign in with sandbox account (Settings → App Store → Sandbox Account)
# 3. Purchase token pack
# 4. Verify tokens credited
# 5. Test restore purchases
```

### Step 5: Verify Webhooks

```bash
# Stripe CLI for local testing
stripe listen --forward-to localhost:5001/avalo/europe-west3/stripeWebhookV2

# Trigger test events
stripe trigger checkout.session.completed
```

Verify in logs:
- Webhook received
- Signature verified
- Tokens credited
- No errors

### Step 6: Test Escrow Flows

```bash
# 1. Create test chat with 100 token deposit
# 2. Verify escrow created (65 tokens available)
# 3. Send creator message → verify 1 token released
# 4. Wait or manually trigger auto-refund
# 5. Verify remaining tokens refunded to user
```

### Step 7: Test Settlement Generation

```bash
# Manually trigger settlement for testing
firebase functions:shell
> generateMonthlySettlements()

# Verify settlements created in Firestore
# Check VAT calculations
# Test payout request flow
```

---

## 🔍 Post-Deployment Verification

### Critical Checks

- [ ] Stripe webhook endpoint is accessible (200 OK)
- [ ] Apple server notification endpoint is accessible (200 OK)
- [ ] Test purchase completes successfully
- [ ] Tokens credit to wallet atomically
- [ ] Transaction records created correctly
- [ ] Escrow holds and releases work
- [ ] Auto-refund scheduler runs hourly
- [ ] Settlement generator runs monthly
- [ ] VAT calculations are correct
- [ ] Firestore security rules block direct writes
- [ ] All indexes are active (not building)

### Monitoring Setup

Enable alerts for:

```typescript
// Firebase Functions logs
- Error rate > 1%
- Webhook processing time > 5s
- Failed transactions > 0.1%
- Escrow refund failures

// Firestore
- Read/write errors
- Permission denied events
- Index performance degradation
```

### Dashboard Queries

```sql
-- Revenue by day
SELECT DATE(createdAt) as date, 
       SUM(tokens) as total_tokens,
       SUM(tokens * 0.20) as revenue_pln
FROM transactions
WHERE type = 'earning' AND userId = 'platform'
GROUP BY date
ORDER BY date DESC;

-- Active escrows
SELECT COUNT(*) as count, 
       SUM(availableTokens) as total_tokens
FROM escrow
WHERE status = 'active';

-- Pending settlements
SELECT COUNT(*) as count,
       SUM(grossAmount) as total_payout
FROM settlements
WHERE status = 'pending';
```

---

## 🔧 Troubleshooting

### Issue: Tokens not credited after Stripe payment

**Diagnosis:**
```bash
# Check webhook logs
firebase functions:log --only stripeWebhookV2

# Verify payment session
firestore.collection('paymentSessions').doc('session_id').get()
```

**Solutions:**
1. Check webhook signature is correct
2. Verify session exists in Firestore
3. Check for idempotency conflicts
4. Manually credit via admin function

### Issue: Apple IAP receipt validation failed

**Diagnosis:**
```bash
# Check if using correct environment
# Sandbox receipts must go to sandbox.itunes.apple.com
# Production receipts must go to buy.itunes.apple.com
```

**Solutions:**
1. Verify `APPLE_SANDBOX` environment variable
2. Check shared secret is correct
3. Ensure receipt is base64 encoded
4. Check Apple service status

### Issue: Escrow not auto-refunding

**Diagnosis:**
```bash
# Check scheduler is running
firebase functions:log --only autoRefundInactiveEscrows

# Verify Firestore index exists
# escrow: status (ASC), autoReleaseAt (ASC)
```

**Solutions:**
1. Verify scheduler is deployed and enabled
2. Check index is active (not building)
3. Manually trigger for testing: `firebase functions:shell`

### Issue: Settlement calculation incorrect

**Diagnosis:**
```sql
-- Manual calculation
SELECT SUM(tokens) as total_earned
FROM transactions
WHERE userId = 'creator_id'
  AND type = 'earning'
  AND createdAt >= start_date
  AND createdAt < end_date;
```

**Solutions:**
1. Verify earning transactions exist
2. Check platform fee was deducted correctly
3. Recalculate VAT manually
4. Contact support if discrepancy persists

---

## 📞 Support Contacts

**Payment Issues:**
- Stripe: https://support.stripe.com
- Apple: https://developer.apple.com/contact/

**Avalo Team:**
- Engineering: dev@avalo.app
- Operations: ops@avalo.app
- Emergency: Use Firebase Console alerts

---

## 🔄 Rollback Procedure

If issues arise, rollback to previous version:

```bash
# List recent deployments
firebase functions:list

# Rollback specific function
firebase functions:delete createStripeCheckoutSession
firebase deploy --only functions:createStripeCheckoutSession@previous

# Or rollback all functions
firebase rollback functions
```

**Important:** Coordinate with payment providers after rollback to handle in-flight transactions.

---

## 📊 Success Metrics

Track these KPIs post-deployment:

- **Payment Success Rate:** >99%  
- **Webhook Processing Time:** <2s  
- **Duplicate Prevention:** 100%  
- **Escrow Auto-Refund:** 100% after 48h  
- **Settlement Accuracy:** 100%  
- **Error Rate:** <0.1%

---

## 🎯 Next Steps

After successful deployment:

1. **Monitor for 48 hours** - Watch for any errors or issues
2. **Test all flows** - Run through complete user journeys
3. **Review settlements** - Wait for first monthly settlement
4. **Optimize performance** - Review webhook processing times
5. **Document learnings** - Update runbooks based on production experience

---

**Deployment Lead:** [Your Name]  
**Approval Required:** Platform Owner, CTO  
**Estimated Downtime:** 0 minutes (rolling deployment)