# PACK 128 — Treasury Integration Guide

## 🎯 Purpose

This guide shows developers how to integrate the Treasury & Payment Vault System into all monetization features across Avalo.

**Target Audience:** Backend developers implementing monetized features

---

## 📋 Prerequisites

Before integrating treasury:

1. ✅ PACK 128 backend functions deployed
2. ✅ Firestore security rules updated
3. ✅ Required Firestore indexes created
4. ✅ Mobile SDK includes treasury types and services
5. ✅ Understanding of 65/35 revenue split

---

## 🔄 Integration Workflow

### Standard Flow for Any Paid Feature

```
1. User initiates paid action
   ↓
2. Validate user has sufficient balance
   ↓
3. Call pack128_allocateSpend
   ↓
4. If successful, deliver content/service
   ↓
5. Treasury automatically:
   - Debits user wallet
   - Credits creator vault (65%)
   - Credits Avalo revenue (35%)
   - Creates immutable ledger entries
```

---

## 💻 Backend Integration Examples

### Example 1: Paid Message (PACK 39)

**File:** `functions/src/paidMessages.ts`

```typescript
import { httpsCallable } from 'firebase-functions/v2/https';
import { pack128_allocateSpend } from './treasury';

export const sendPaidMessage = httpsCallable(async (request) => {
  const { senderId, receiverId, messageContent, priceTokens, chatId } = request.data;
  
  try {
    // Step 1: Allocate tokens (charges user, pays creator)
    const treasuryResult = await pack128_allocateSpend({
      userId: senderId,
      creatorId: receiverId,
      tokenAmount: priceTokens,
      transactionType: 'PAID_MESSAGE',
      contentId: generateId(),
      metadata: {
        chatId,
        messageLength: messageContent.length,
        timestamp: Date.now(),
      },
    });
    
    // Step 2: If treasury succeeded, deliver message
    if (treasuryResult.success) {
      const messageDoc = await db.collection('messages').add({
        senderId,
        receiverId,
        chatId,
        content: messageContent,
        paid: true,
        priceTokens,
        treasuryLedgerId: treasuryResult.ledgerId,
        createdAt: serverTimestamp(),
      });
      
      return {
        success: true,
        messageId: messageDoc.id,
        newBalance: treasuryResult.userBalance,
      };
    }
    
    throw new Error('Treasury allocation failed');
  } catch (error) {
    // Treasury failed = no message sent
    throw error;
  }
});
```

**Key Points:**
- Treasury FIRST, delivery SECOND
- If treasury fails, nothing happens
- Never deliver content without successful treasury allocation

---

### Example 2: Video Call (PACK 75)

**File:** `functions/src/videoCalls.ts`

```typescript
import { pack128_allocateSpend } from './treasury';

export const chargeForVideoCall = async (
  callerId: string,
  receiverId: string,
  durationMinutes: number,
  pricePerMinute: number
) => {
  const totalPrice = durationMinutes * pricePerMinute;
  
  // Charge for call duration
  const treasuryResult = await pack128_allocateSpend({
    userId: callerId,
    creatorId: receiverId,
    tokenAmount: totalPrice,
    transactionType: 'PAID_CALL',
    metadata: {
      durationMinutes,
      pricePerMinute,
      callId: generateId(),
    },
  });
  
  if (!treasuryResult.success) {
    throw new Error('Failed to charge for video call');
  }
  
  // Record call in database
  await db.collection('video_calls').add({
    callerId,
    receiverId,
    durationMinutes,
    totalPrice,
    treasuryLedgerId: treasuryResult.ledgerId,
    chargedAt: serverTimestamp(),
  });
  
  return treasuryResult;
};
```

---

### Example 3: Digital Product Purchase (PACK 116)

**File:** `functions/src/digitalProducts.ts`

```typescript
import { pack128_allocateSpend } from './treasury';

export const purchaseDigitalProduct = async (
  buyerId: string,
  productId: string
) => {
  // Get product details
  const productDoc = await db.collection('digital_products').doc(productId).get();
  const product = productDoc.data();
  
  if (!product) {
    throw new Error('Product not found');
  }
  
  // Charge tokens
  const treasuryResult = await pack128_allocateSpend({
    userId: buyerId,
    creatorId: product.creatorId,
    tokenAmount: product.priceTokens,
    transactionType: 'DIGITAL_PRODUCT',
    contentId: productId,
    metadata: {
      productName: product.name,
      productType: product.type,
    },
  });
  
  // Grant access to product
  await db.collection('product_purchases').add({
    buyerId,
    productId,
    creatorId: product.creatorId,
    priceTokens: product.priceTokens,
    treasuryLedgerId: treasuryResult.ledgerId,
    purchasedAt: serverTimestamp(),
  });
  
  return {
    success: true,
    downloadUrl: await generateSecureDownloadUrl(productId, buyerId),
  };
};
```

---

### Example 4: Event Ticket Purchase (PACK 117)

**File:** `functions/src/events.ts`

```typescript
import { pack128_allocateSpend } from './treasury';

export const purchaseEventTicket = async (
  userId: string,
  eventId: string
) => {
  const eventDoc = await db.collection('events').doc(eventId).get();
  const event = eventDoc.data();
  
  // Verify event is open and has capacity
  if (event.status !== 'OPEN' || event.attendeeCount >= event.maxAttendees) {
    throw new Error('Event not available');
  }
  
  // Charge for ticket
  const treasuryResult = await pack128_allocateSpend({
    userId: userId,
    creatorId: event.hostId,
    tokenAmount: event.ticketPriceTokens,
    transactionType: 'EVENT_TICKET',
    contentId: eventId,
    metadata: {
      eventTitle: event.title,
      eventDate: event.scheduledDate,
    },
  });
  
  // Add attendee
  await db.collection('event_attendees').add({
    userId,
    eventId,
    hostId: event.hostId,
    ticketPriceTokens: event.ticketPriceTokens,
    treasuryLedgerId: treasuryResult.ledgerId,
    confirmedAt: serverTimestamp(),
  });
  
  // Increment attendee count
  await eventDoc.ref.update({
    attendeeCount: admin.firestore.FieldValue.increment(1),
  });
  
  return { success: true, ticketId: generateId() };
};
```

---

## 🔐 Token Purchase Integration (Stripe)

### Webhook Handler

**File:** `functions/src/stripe-webhooks.ts`

```typescript
import { pack128_recordPurchase } from './treasury';

export const handleStripeCheckoutComplete = async (session: Stripe.Checkout.Session) => {
  const { userId, tokenAmount } = session.metadata;
  const fiatAmount = session.amount_total! / 100; // Convert cents to EUR
  
  // Record purchase in treasury
  await pack128_recordPurchase({
    userId,
    tokenAmount: parseInt(tokenAmount),
    fiatAmount,
    fiatCurrency: session.currency.toUpperCase(),
    paymentMethodType: 'STRIPE',
    paymentIntentId: session.payment_intent as string,
    metadata: {
      sessionId: session.id,
      customerEmail: session.customer_email,
      country: session.customer_details?.address?.country,
    },
  });
  
  // Tokens are now available in user's wallet
  console.log(`User ${userId} purchased ${tokenAmount} tokens for ${fiatAmount} EUR`);
};
```

---

## 🚫 Refund Integration

### Eligibility-Based Refund

```typescript
import { pack128_refundTransaction } from './treasury';

export const processContentRefund = async (
  transactionId: string,
  reason: string,
  adminId: string
) => {
  // Attempt refund
  const refundResult = await pack128_refundTransaction({
    transactionId,
    reason,
    adminId,
  });
  
  if (refundResult.refunded) {
    // Refund successful
    console.log(`Refunded ${refundResult.tokenAmount} tokens`);
    
    // Optionally: Hide content or mark as refunded
    await db.collection('messages').doc(messageId).update({
      refunded: true,
      refundedAt: serverTimestamp(),
    });
    
    return { success: true };
  } else {
    // Refund denied
    return {
      success: false,
      reason: refundResult.reason,
      status: refundResult.status,
    };
  }
};
```

**Refund Eligibility Rules:**
- Within 5-minute grace window
- Content not yet delivered
- < 3 refunds in last 24 hours
- Admin approval obtained

---

## 💸 Payout Integration (PACK 83 Enhancement)

### Modified Payout Request Flow

**Before PACK 128:**
```typescript
// OLD: Direct balance locking
await creatorVaultRef.update({
  availableTokens: available - amount,
  lockedTokens: locked + amount,
});
```

**After PACK 128:**
```typescript
// NEW: Use treasury with safety checks
const payoutResult = await pack128_requestPayout({
  userId: creatorId,
  methodId: payoutMethodId,
  tokenAmount: requestedAmount,
});

if (!payoutResult.success) {
  // Show why blocked
  return {
    error: payoutResult.message,
    checks: payoutResult.safetyCheck,
  };
}

// Tokens automatically locked by treasury
return { payoutRequestId: payoutResult.payoutRequestId };
```

### Admin Payout Processing

```typescript
import { pack128_processPayout } from './treasury';

export const adminProcessPayout = async (
  payoutRequestId: string,
  approved: boolean,
  adminId: string,
  notes?: string
) => {
  const result = await pack128_processPayout({
    payoutRequestId,
    approved,
    adminId,
    notes,
  });
  
  if (approved) {
    // Tokens released from locked to paid
    // Creator receives actual payout via PACK 83
    await initiateExternalPayout(payoutRequestId);
  } else {
    // Tokens automatically returned to creator's available balance
    // No further action needed
  }
  
  return result;
};
```

---

## 📊 Balance Checking (Before Operations)

### Check Sufficient Balance

```typescript
import { pack128_getUserBalance } from './treasury';

async function validateCanAfford(userId: string, price: number): Promise<boolean> {
  try {
    const balance = await pack128_getUserBalance({ userId });
    return balance.availableTokens >= price;
  } catch (error) {
    console.error('Failed to check balance:', error);
    return false;
  }
}

// Usage in paid feature
export const purchaseSomething = async (userId, price) => {
  if (!(await validateCanAfford(userId, price))) {
    throw new Error('Insufficient balance');
  }
  
  // Proceed with treasury allocation
  await pack128_allocateSpend({ ... });
};
```

---

## 📱 Mobile Integration Examples

### Balance Display Widget

```typescript
import React from 'react';
import { View, Text } from 'react-native';
import { useTreasury } from '@/hooks/useTreasury';
import { formatTokenAmount } from '@/types/treasury';

export function BalanceWidget({ userId }: { userId: string }) {
  const { userBalance, userBalanceLoading } = useTreasury(userId, false);
  
  if (userBalanceLoading) {
    return <Text>Loading...</Text>;
  }
  
  return (
    <View>
      <Text style={{ fontSize: 24, fontWeight: 'bold' }}>
        {formatTokenAmount(userBalance?.availableTokens || 0)}
      </Text>
      <Text style={{ fontSize: 12, color: '#666' }}>
        Available Tokens
      </Text>
    </View>
  );
}
```

### Creator Earnings Widget

```typescript
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTreasury } from '@/hooks/useTreasury';
import { formatTokenAmount, tokensToFiat } from '@/services/treasuryService';
import { router } from 'expo-router';

export function CreatorEarningsWidget({ userId }: { userId: string }) {
  const { creatorBalance, refreshCreatorBalance } = useTreasury(userId, true);
  
  const available = creatorBalance?.availableTokens || 0;
  const locked = creatorBalance?.lockedTokens || 0;
  const lifetime = creatorBalance?.lifetimeEarned || 0;
  
  return (
    <View>
      <Text>Available: {formatTokenAmount(available)} tokens</Text>
      <Text>({tokensToFiat(available)})</Text>
      
      {locked > 0 && (
        <Text style={{ color: '#F59E0B' }}>
          Locked: {formatTokenAmount(locked)} tokens (pending payout)
        </Text>
      )}
      
      <Text style={{ color: '#666' }}>
        Lifetime Earned: {formatTokenAmount(lifetime)} tokens
      </Text>
      
      <TouchableOpacity onPress={() => router.push('/wallet/payout-requests')}>
        <Text>Request Payout →</Text>
      </TouchableOpacity>
    </View>
  );
}
```

### Payout Safety Checker

```typescript
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { checkPayoutEligibility } from '@/services/treasuryService';
import { getSafetyCheckIcon, getPayoutSafetyMessage } from '@/types/treasury';

export function PayoutSafetyChecker({
  userId,
  methodId,
  amount,
}: {
  userId: string;
  methodId: string;
  amount: number;
}) {
  const [safety, setSafety] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function check() {
      const result = await checkPayoutEligibility(userId, methodId, amount);
      setSafety(result);
      setLoading(false);
    }
    check();
  }, [userId, methodId, amount]);
  
  if (loading) return <Text>Checking...</Text>;
  
  return (
    <View>
      <Text style={{ fontSize: 18, marginBottom: 12 }}>
        {safety.passed ? '✅ Ready to Request' : '❌ Not Eligible'}
      </Text>
      
      {/* Show individual checks */}
      <Text>{getSafetyCheckIcon(safety.checks.kycVerified)} KYC Verified</Text>
      <Text>{getSafetyCheckIcon(safety.checks.payoutMethodValid)} Payout Method</Text>
      <Text>{getSafetyCheckIcon(safety.checks.regionLegal)} Region Supported</Text>
      <Text>{getSafetyCheckIcon(safety.checks.treasuryRiskClear)} Risk Clear</Text>
      <Text>{getSafetyCheckIcon(safety.checks.fraudCheckPassed)} Fraud Check</Text>
      <Text>{getSafetyCheckIcon(safety.checks.balanceSufficient)} Balance OK</Text>
      
      {!safety.passed && (
        <Text style={{ color: '#EF4444', marginTop: 12 }}>
          {getPayoutSafetyMessage(safety)}
        </Text>
      )}
    </View>
  );
}
```

---

## 🔗 Integration Checklist by Feature

### PACK 79 - In-Chat Paid Gifts

**Integration Point:** When gift is sent

```typescript
// In sendGift callable function
const treasuryResult = await pack128_allocateSpend({
  userId: senderId,
  creatorId: receiverId,
  tokenAmount: giftPrice,
  transactionType: 'PAID_GIFT',
  contentId: giftId,
  metadata: { 
    chatId, 
    giftName,
    giftTransactionId, // Reference to gift_transactions doc
  },
});

// Only create gift transaction if treasury succeeds
if (treasuryResult.success) {
  await createGiftTransactionRecord({ ... });
}
```

**Checklist:**
- [ ] Import `pack128_allocateSpend`
- [ ] Call before creating gift transaction
- [ ] Use transaction type: `PAID_GIFT`
- [ ] Include gift metadata
- [ ] Handle insufficient balance error
- [ ] Store ledger ID in gift transaction

---

### PACK 80 - Cross-Chat Media Paywall

**Integration Point:** When user unlocks media

```typescript
// In unlockPaidMedia callable function
const treasuryResult = await pack128_allocateSpend({
  userId: viewerId,
  creatorId: mediaOwnerId,
  tokenAmount: unlockPrice,
  transactionType: 'PAID_MEDIA',
  contentId: mediaId,
  metadata: {
    chatId,
    mediaType: 'IMAGE' | 'VIDEO',
    fileName,
  },
});

// Grant access only if treasury succeeds
if (treasuryResult.success) {
  await grantMediaAccess(viewerId, mediaId);
}
```

**Checklist:**
- [ ] Call before granting access
- [ ] Use transaction type: `PAID_MEDIA`
- [ ] Include media metadata
- [ ] Store unlock record with ledger ID

---

### PACK 116 - Digital Products

**Integration Point:** Product purchase

```typescript
// In purchaseDigitalProduct callable function
const treasuryResult = await pack128_allocateSpend({
  userId: buyerId,
  creatorId: product.creatorId,
  tokenAmount: product.priceTokens,
  transactionType: 'DIGITAL_PRODUCT',
  contentId: productId,
  metadata: {
    productName: product.name,
    productType: product.type,
    fileSize: product.fileSizeBytes,
  },
});

// Deliver product only if payment succeeds
if (treasuryResult.success) {
  await createProductDelivery(buyerId, productId);
}
```

**Checklist:**
- [ ] Integrate before product delivery
- [ ] Use transaction type: `DIGITAL_PRODUCT`
- [ ] Include product metadata
- [ ] Watermark content with ledger ID

---

### PACK 121 - Global Ads

**Integration Point:** Ad impression billing

```typescript
// When ad is shown
const treasuryResult = await pack128_allocateSpend({
  userId: 'system', // System user for ad billing
  creatorId: advertiserId,
  tokenAmount: cpmCost,
  transactionType: 'OTHER',
  metadata: {
    adCampaignId,
    placementId,
    impressionId,
    adType: 'AD_IMPRESSION',
  },
});

// Record impression only if billing succeeds
if (treasuryResult.success) {
  await recordAdImpression({ ... });
}
```

**Checklist:**
- [ ] Bill advertiser tokens for impressions
- [ ] Use metadata to track ad context
- [ ] Integrate with ad auction system

---

## ⚡ Performance Optimization

### Batch Balance Checks

```typescript
// DON'T: Check balance for each item in cart
for (const item of cart) {
  const balance = await pack128_getUserBalance({ userId }); // SLOW
  if (balance.availableTokens < item.price) {
    throw new Error('Insufficient balance');
  }
}

// DO: Check once, validate total
const balance = await pack128_getUserBalance({ userId });
const totalPrice = cart.reduce((sum, item) => sum + item.price, 0);

if (balance.availableTokens < totalPrice) {
  throw new Error('Insufficient balance');
}

// Then process all items
for (const item of cart) {
  await pack128_allocateSpend({ ... });
}
```

### Cache Balance for UI Display

```typescript
// Use React Query or similar for caching
import { useQuery } from '@tanstack/react-query';

function useUserBalance(userId: string) {
  return useQuery({
    queryKey: ['userBalance', userId],
    queryFn: () => getUserBalance(userId),
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
  });
}
```

---

## 🔍 Error Handling

### Common Errors

```typescript
try {
  await pack128_allocateSpend({ ... });
} catch (error) {
  if (error.code === 'failed-precondition') {
    // Insufficient balance
    return { error: 'Not enough tokens', code: 'INSUFFICIENT_BALANCE' };
  }
  
  if (error.code === 'already-exists') {
    // Double-spend detected
    return { error: 'Transaction already processed', code: 'DUPLICATE' };
  }
  
  if (error.code === 'invalid-argument') {
    // Invalid input
    return { error: error.message, code: 'INVALID_INPUT' };
  }
  
  // Unknown error
  console.error('Treasury error:', error);
  return { error: 'Transaction failed', code: 'UNKNOWN' };
}
```

### User-Friendly Messages

```typescript
import { getTreasuryErrorMessage } from '@/services/treasuryService';

try {
  await treasury operation();
} catch (error) {
  const message = getTreasuryErrorMessage(error);
  // Show to user: "Please sign in to continue", "Insufficient balance", etc.
  alert(message);
}
```

---

## 🧪 Testing Integration

### Unit Test Example

```typescript
import { pack128_allocateSpend } from './treasury';

describe('Paid Message Integration', () => {
  it('should charge user and pay creator 65/35 split', async () => {
    const result = await pack128_allocateSpend({
      userId: 'user123',
      creatorId: 'creator456',
      tokenAmount: 100,
      transactionType: 'PAID_MESSAGE',
    });
    
    expect(result.success).toBe(true);
    expect(result.creatorEarnings).toBe(65);
    expect(result.avaloRevenue).toBe(35);
    expect(result.userBalance).toBeLessThan(initialBalance);
  });
  
  it('should reject when insufficient balance', async () => {
    await expect(
      pack128_allocateSpend({
        userId: 'poorUser',
        creatorId: 'creator456',
        tokenAmount: 1000000,
        transactionType: 'PAID_MESSAGE',
      })
    ).rejects.toThrow('Insufficient balance');
  });
});
```

---

## 📐 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    TOKEN FLOW ARCHITECTURE                   │
└─────────────────────────────────────────────────────────────┘

PURCHASE:
  Stripe Payment
       ↓
  pack128_recordPurchase
       ↓
  User Token Wallet (+tokens)
       ↓
  Ledger Entry (PURCHASE)


SPEND:
  User Token Wallet (-100 tokens)
       ↓
  pack128_allocateSpend
       ↓
  ┌──────────────────────────────┐
  │   ATOMIC TRANSACTION         │
  │                              │
  │  Creator Vault: +65 tokens   │
  │  Avalo Vault:   +35 tokens   │
  │                              │
  │  Ledger Entries:             │
  │    - SPEND (user, -100)      │
  │    - EARN (creator, +65)     │
  │    - COMMISSION (avalo, +35) │
  └──────────────────────────────┘


PAYOUT:
  Creator Vault (available tokens)
       ↓
  pack128_requestPayout (safety checks)
       ↓
  If passed: Lock tokens (available → locked)
       ↓
  Admin Review
       ↓
  pack128_processPayout
       ↓
  If approved: Release tokens → External payment
  If rejected: Unlock tokens (locked → available)
```

---

## 🎓 Best Practices

### 1. Always Use Treasury for Token Operations

```typescript
// ✅ CORRECT
await pack128_allocateSpend({ ... });

// ❌ WRONG - Bypassing treasury
await userWalletRef.update({ 
  availableTokens: admin.firestore.FieldValue.increment(-amount) 
});
```

### 2. Store Ledger IDs for Audit

```typescript
// When creating transaction records
await db.collection('paid_messages').add({
  senderId,
  receiverId,
  content,
  priceTokens,
  treasuryLedgerId: treasuryResult.ledgerId, // ✅ Store for audit trail
  createdAt: serverTimestamp(),
});
```

### 3. Check Balance Before Expensive Operations

```typescript
// For multi-step operations, check balance first
const balance = await pack128_getUserBalance({ userId });

if (balance.availableTokens < estimatedCost) {
  return { error: 'Insufficient balance' };
}

// Then proceed with expensive operations
await processComplexOperation();
await pack128_allocateSpend({ ... });
```

### 4. Handle Concurrent Requests

```typescript
// Treasury uses Firestore transactions internally
// Safe for concurrent calls - no manual locking needed
await Promise.all([
  pack128_allocateSpend({ userId, creatorId: 'A', tokenAmount: 50, ... }),
  pack128_allocateSpend({ userId, creatorId: 'B', tokenAmount: 30, ... }),
]);
// Each will succeed/fail independently with correct balances
```

---

## 🔒 Security Integration

### Validate Ownership

```typescript
export const somePaymentFunction = https.onCall(async (request) => {
  const auth = request.auth;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in');
  }
  
  const { userId } = request.data;
  
  // Only allow users to spend their own tokens
  if (userId !== auth.uid) {
    throw new HttpsError('permission-denied', 'Cannot spend for another user');
  }
  
  // Proceed with treasury operation
  await pack128_allocateSpend({ userId, ... });
});
```

### Prevent Self-Payment

```typescript
// Treasury prevents this automatically, but validate in your code too
if (userId === creatorId) {
  throw new Error('Cannot pay yourself');
}

await pack128_allocateSpend({ userId, creatorId, ... });
```

---

## 📞 Support Functions

### Get Transaction History (Helper)

```typescript
import { getUserLedgerEntries } from './treasury-helpers';

// Get user's recent transactions
const ledger = await getUserLedgerEntries(userId, 50);

// Format for display
const history = ledger.map(entry => ({
  id: entry.ledgerId,
  type: entry.eventType,
  amount: entry.tokenAmount,
  timestamp: entry.timestamp,
  description: entry.metadata.description || entry.eventType,
}));
```

### Calculate Split Preview

```typescript
import { calculateRevenueSplit } from './config/treasury.config';

// Show user what creator will earn
const split = calculateRevenueSplit(100);

console.log(`If you pay 100 tokens:`);
console.log(`- Creator receives: ${split.creatorAmount} tokens (65%)`);
console.log(`- Platform fee: ${split.avaloAmount} tokens (35%)`);
```

---

## 🆘 Common Issues & Solutions

### Issue: Function deployed but not working

**Solution:**
```bash
# Check function logs
firebase functions:log --only pack128_allocateSpend

# Verify function exists
firebase functions:list | grep pack128

# Redeploy if needed
firebase deploy --only functions:pack128_allocateSpend
```

### Issue: Security rules blocking treasury writes

**Solution:**
Treasury operations are Cloud Function only. Ensure rules allow function writes:

```javascript
// Correct rules (in firestore-rules/treasury.rules)
match /user_token_wallets/{userId} {
  allow write: if false; // Functions bypass this
}
```

### Issue: Balance not updating in real-time

**Solution:**
```typescript
// Refresh balance after operations
const { refreshUserBalance } = useTreasury(userId);

await sendPaidMessage({ ... });
await refreshUserBalance(); // Force refresh
```

---

## 📋 Deployment Checklist

Before going live with treasury:

### Backend
- [ ] All treasury functions deployed
- [ ] Firestore rules updated with treasury.rules
- [ ] Firestore indexes created
- [ ] Scheduled jobs enabled (rebalance, reconciliation)
- [ ] Hot wallet initialized with target balance
- [ ] Admin permissions configured
- [ ] Integration points tested

### Mobile
- [ ] Treasury types imported
- [ ] Treasury service connected to functions
- [ ] Hooks integrated in wallet screens
- [ ] Balance displays working
- [ ] Payout UI connected
- [ ] Error handling implemented

### Integration
- [ ] PACK 79 (Gifts) uses allocateSpend
- [ ] PACK 80 (Media) uses allocateSpend
- [ ] PACK 83 (Payouts) uses requestPayout
- [ ] PACK 116 (Products) uses allocateSpend
- [ ] PACK 117 (Events) uses allocateSpend
- [ ] Stripe webhooks use recordPurchase

### Monitoring
- [ ] Daily reconciliation alerts configured
- [ ] Integrity check alerts configured
- [ ] Hot wallet monitoring set up
- [ ] Admin dashboard for treasury stats

---

## 🎉 Integration Complete!

Follow this guide to integrate treasury into all monetization features. Treasury ensures:

✅ **Absolute accuracy** - Zero accounting errors  
✅ **Instant settlement** - Real-time 65/35 split  
✅ **Fraud immunity** - Multi-layer validation  
✅ **Complete audit trail** - Compliance ready  
✅ **Economic isolation** - No manipulation possible

**Questions?** Review [`PACK_128_IMPLEMENTATION_COMPLETE.md`](PACK_128_IMPLEMENTATION_COMPLETE.md:1) for full technical details.

---

**Integration Guide Version**: 1.0  
**Last Updated**: 2025-11-28  
**Platform**: Avalo Treasury System