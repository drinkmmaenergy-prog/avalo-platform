# Firestore Payment System Collections Schema

## Overview

This document defines the complete Firestore database schema for the Avalo payment system, including wallet management, transactions, escrow, and settlements.

## Collections

### 1. `/paymentSessions/{sessionId}`

Payment session tracking for Stripe and Apple IAP purchases.

```typescript
{
  sessionId: string;                    // Unique session identifier
  userId: string;                       // User making purchase
  provider: "stripe" | "apple_iap";    // Payment provider
  platform: "ios" | "android" | "web"; // Platform
  productType: "tokens" | "subscription" | "unlock";
  tokens?: number;                      // Tokens to credit
  amount: number;                       // Money amount
  currency: string;                     // ISO 4217 code
  providerSessionId: string;            // External provider ID
  providerProductId?: string;           // Product identifier
  status: "pending" | "processing" | "completed" | "failed" | "cancelled" | "refunded";
  idempotencyKey: string;               // Deduplication key
  webhookProcessedAt?: Timestamp;
  webhookAttempts: number;
  metadata: Record<string, any>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
  expiresAt?: Timestamp;                // 30 minutes for pending
}
```

**Indexes:**
```javascript
[
  { fields: ["userId", "createdAt"], orders: ["ASCENDING", "DESCENDING"] },
  { fields: ["providerSessionId", "provider"], orders: ["ASCENDING", "ASCENDING"] },
  { fields: ["status", "createdAt"], orders: ["ASCENDING", "DESCENDING"] }
]
```

---

### 2. `/transactions/{txId}`

All wallet transactions (deposits, earnings, spending, refunds).

```typescript
{
  txId: string;                         // tx_{provider}_{timestamp}_{random}
  userId: string;                       // Transaction owner
  type: "deposit" | "earning" | "spending" | "refund" | "settlement" | "escrow_hold" | "escrow_release";
  subtype?: "token_purchase" | "chat_fee" | "video_fee" | "calendar_fee" | "tip" | "subscription";
  tokens: number;                       // Token amount (+ or -)
  fiatAmount?: number;                  // Fiat equivalent
  fiatCurrency?: string;
  provider?: "stripe" | "apple_iap" | "internal";
  providerTxId?: string;                // External transaction ID
  paymentSessionId?: string;            // Link to paymentSession
  escrowStatus?: "held" | "released" | "refunded";
  escrowReleaseAt?: Timestamp;
  relatedUserId?: string;               // For P2P transactions
  relatedChatId?: string;
  relatedPostId?: string;
  relatedBookingId?: string;
  splits?: {
    platformFee: number;
    platformFeePercent: number;
    creatorAmount: number;
    creatorPercent: number;
  };
  balanceBefore: number;
  balanceAfter: number;
  status: "pending" | "completed" | "failed" | "reversed";
  description: string;
  metadata: Record<string, any>;
  createdAt: Timestamp;
  completedAt?: Timestamp;
}
```

**Indexes:**
```javascript
[
  { fields: ["userId", "type", "createdAt"], orders: ["ASCENDING", "ASCENDING", "DESCENDING"] },
  { fields: ["relatedChatId", "createdAt"], orders: ["ASCENDING", "DESCENDING"] },
  { fields: ["escrowStatus", "escrowReleaseAt"], orders: ["ASCENDING", "ASCENDING"] }
]
```

---

### 3. `/users/{userId}/wallet/main`

User wallet document (sub-collection under users).

```typescript
{
  userId: string;
  balance: number;                      // Available tokens
  pendingBalance: number;               // Tokens in escrow
  earnedBalance: number;                // Lifetime earnings (creators)
  spentBalance: number;                 // Lifetime spending
  stripeCustomerId?: string;
  appleCustomerId?: string;
  preferredCurrency: string;            // User's fiat preference
  paymentMethods: Array<{
    id: string;
    type: "card" | "sepa_debit" | "paypal";
    brand?: string;
    last4?: string;
    expiryMonth?: number;
    expiryYear?: number;
    isDefault: boolean;
  }>;
  totalDeposits: number;
  totalEarnings: number;
  totalSpending: number;
  totalRefunds: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### 4. `/escrow/{escrowId}`

Escrow records for chat and calendar bookings.

```typescript
{
  escrowId: string;                     // esc_{chatId|bookingId}_{timestamp}
  payerId: string;                      // User who paid
  recipientId: string;                  // User who will earn
  type: "chat" | "booking" | "unlock";
  relatedId: string;                    // chatId, bookingId, postId
  totalTokens: number;                  // Total held
  platformFee: number;                  // Avalo's cut (deducted)
  availableTokens: number;              // Available for release
  consumedTokens: number;               // Already released
  status: "active" | "completed" | "refunded" | "expired";
  releaseType: "incremental" | "milestone" | "time-based";
  autoReleaseAt?: Timestamp;            // 48h for chats
  refundEligible: boolean;
  refundReason?: string;
  refundedAt?: Timestamp;
  refundedAmount?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
}
```

**Indexes:**
```javascript
[
  { fields: ["status", "autoReleaseAt"], orders: ["ASCENDING", "ASCENDING"] },
  { fields: ["recipientId", "status"], orders: ["ASCENDING", "ASCENDING"] }
]
```

---

### 5. `/settlements/{settlementId}`

Monthly creator settlements and payouts.

```typescript
{
  settlementId: string;                 // stl_{creatorId}_{period}
  creatorId: string;
  creatorEmail: string;
  periodStart: Timestamp;
  periodEnd: Timestamp;
  periodLabel: string;                  // "2024-11"
  totalTokensEarned: number;
  platformFeesDeducted: number;
  netTokensPayable: number;
  settlementRate: number;               // 0.20 PLN per token
  fiatAmount: number;
  fiatCurrency: string;
  vatApplicable: boolean;
  vatRate: number;
  vatAmount: number;
  grossAmount: number;
  payoutMethod?: "sepa" | "ach" | "paypal" | "crypto" | "wise";
  payoutDestination?: string;
  status: "pending" | "processing" | "paid" | "failed" | "disputed";
  payoutProviderId?: string;
  payoutReference?: string;
  transactionIds: string[];
  createdAt: Timestamp;
  processedAt?: Timestamp;
  paidAt?: Timestamp;
}
```

**Indexes:**
```javascript
[
  { fields: ["creatorId", "periodStart"], orders: ["ASCENDING", "DESCENDING"] },
  { fields: ["status", "createdAt"], orders: ["ASCENDING", "ASCENDING"] }
]
```

---

### 6. `/subscriptions/{subscriptionId}`

Royal Club and creator subscriptions.

```typescript
{
  subscriptionId: string;
  userId: string;                       // Subscriber
  creatorId?: string;                   // For creator subscriptions
  type: "royal_club" | "creator_tier";
  tierId?: string;
  tokens: number;                       // Token cost per period
  fiatAmount?: number;
  currency?: string;
  period: "monthly" | "annual";
  provider: "apple_iap" | "stripe";
  providerSubscriptionId: string;
  providerProductId: string;
  status: "active" | "cancelled" | "expired" | "past_due" | "paused";
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: Timestamp;
  currentPeriodEnd: Timestamp;
  cancelledAt?: Timestamp;
  lastWebhookAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

## Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Payment sessions - read own, admin write
    match /paymentSessions/{sessionId} {
      allow read: if request.auth != null && 
        (resource.data.userId == request.auth.uid || isAdmin());
      allow write: if false; // Only via Cloud Functions
    }
    
    // Transactions - read own
    match /transactions/{txId} {
      allow read: if request.auth != null && 
        (resource.data.userId == request.auth.uid || isAdmin());
      allow write: if false; // Only via Cloud Functions
    }
    
    // User wallets - read own
    match /users/{userId}/wallet/{walletId} {
      allow read: if request.auth != null && 
        (userId == request.auth.uid || isAdmin());
      allow write: if false; // Only via Cloud Functions
    }
    
    // Escrow - read if participant
    match /escrow/{escrowId} {
      allow read: if request.auth != null && 
        (resource.data.payerId == request.auth.uid || 
         resource.data.recipientId == request.auth.uid || 
         isAdmin());
      allow write: if false; // Only via Cloud Functions
    }
    
    // Settlements - read own
    match /settlements/{settlementId} {
      allow read: if request.auth != null && 
        (resource.data.creatorId == request.auth.uid || isAdmin());
      allow write: if false; // Only via Cloud Functions
    }
    
    // Subscriptions - read own
    match /subscriptions/{subscriptionId} {
      allow read: if request.auth != null && 
        (resource.data.userId == request.auth.uid || isAdmin());
      allow write: if false; // Only via Cloud Functions
    }
    
    function isAdmin() {
      return request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
    }
  }
}
```

---

## Token Economy Rules

### Commission Splits

| Product Type | Platform Fee | Creator Earnings | Fee Refundable? |
|--------------|-------------|------------------|-----------------|
| Chat Messages | 35% | 65% | ❌ No |
| Video Unlocks | 30% | 70% | ❌ No |
| Calendar Bookings | 20% | 80% | ❌ No |
| Tips | 20% | 80% | ❌ No |
| Subscriptions | 30% | 70% | ❌ No |

### Escrow Rules

- **Chat deposits:** 100 tokens, 35% platform fee (non-refundable), 65% held in escrow
- **Auto-refund:** After 48 hours of creator inactivity
- **Incremental release:** 1 token per 11 words (standard), 1 token per 7 words (Royal members)
- **Platform fee:** Deducted immediately, non-refundable

### Settlement

- **Rate:** 1 token = 0.20 PLN (fixed)
- **Frequency:** Monthly (1st of month)
- **Minimum:** 50 EUR/USD equivalent
- **VAT:** Calculated based on creator country

---

## Data Flow Examples

### Token Purchase (Stripe)

```
1. Client calls createStripeCheckoutSession()
2. Function creates paymentSessions/{id} (status: pending)
3. User redirected to Stripe
4. Payment completed
5. Stripe webhook → stripeWebhookV2()
6. Webhook creates transaction, updates wallet (atomic)
7. paymentSessions/{id} updated (status: completed)
```

### Chat Deposit with Escrow

```
1. Client calls initiateChat()
2. Function checks user balance
3. Atomic transaction:
   - Deduct 100 tokens from user wallet
   - Create escrow/{escrowId} (65 tokens available)
   - Create platform fee transaction (35 tokens)
   - Create escrow hold transaction
4. Creator sends message (11 words)
5. Function calls releaseEscrowIncremental(1 token)
6. Atomic transaction:
   - Increment creator wallet (+1)
   - Decrement escrow available (-1)
   - Increment escrow consumed (+1)
   - Create escrow_release transaction
```

### Monthly Settlement

```
1. Scheduled function runs (1st of month)
2. Query all creator earnings for previous month
3. For each creator:
   - Sum total tokens earned
   - Calculate fiat: tokens × 0.20 PLN
   - Calculate VAT based on country
   - Create settlements/{id} (status: pending)
4. Admin reviews and approves
5. Process payout via chosen method
6. Update settlement (status: paid)
```

---

## Migration Checklist

- [ ] Create Firestore indexes
- [ ] Deploy security rules
- [ ] Initialize wallet for existing users
- [ ] Test payment flows in sandbox
- [ ] Configure webhook endpoints
- [ ] Set up monitoring alerts
- [ ] Document runbooks for support team