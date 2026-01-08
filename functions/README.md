# Avalo Firebase Functions

Complete backend implementation for the Avalo platform.

## Overview

This directory contains all Firebase Cloud Functions for:
- Chat system with token billing
- Calendar booking and verification
- Payment webhooks (Stripe)
- Content moderation
- Scheduled tasks (CRON jobs)

## Structure

```
functions/
├── src/
│   ├── index.ts           # Main export file
│   ├── init.ts            # Firebase Admin initialization
│   ├── config.ts          # System constants and configuration
│   ├── types.ts           # TypeScript type definitions
│   ├── chats.ts           # Chat system callables
│   ├── calendar.ts        # Calendar booking callables
│   ├── payments.ts        # Stripe webhooks and token management
│   ├── moderation.ts      # Content moderation
│   └── scheduled.ts       # CRON jobs
├── package.json
└── tsconfig.json
```

## Setup

### 1. Install Dependencies

```bash
cd functions
npm install
```

### 2. Configure Environment Variables

Set Stripe secrets in Firebase Functions config:

```bash
firebase functions:config:set \
  stripe.secret_key="sk_test_..." \
  stripe.webhook_secret="whsec_..."
```

### 3. Build Functions

```bash
npm run build
```

## API Reference

### Chat System

#### `startChatCallable`
Start a paid chat after free messages.

**Request:**
```typescript
{
  receiverUid: string;
  chatId?: string;
}
```

**Response:**
```typescript
{
  ok: boolean;
  data?: {
    chatId: string;
    deposit: {
      amount: 100;
      fee: 35;
      escrow: 65;
    };
  };
  error?: string;
}
```

#### `sendMessageCallable`
Send a message and bill tokens.

**Request:**
```typescript
{
  chatId: string;
  text?: string;
  media?: {
    type: "photo" | "voice";
    url?: string;
    durationSec?: number;
  };
}
```

**Response:**
```typescript
{
  ok: boolean;
  data?: {
    messageId: string;
    tokensCharged: number;
  };
  error?: string;
}
```

#### `closeChatCallable`
Close chat and refund unused escrow.

**Request:**
```typescript
{
  chatId: string;
}
```

**Response:**
```typescript
{
  ok: boolean;
  data?: {
    refundedTokens: number;
  };
  error?: string;
}
```

#### `refundByEarnerCallable`
Earner voluntary refund.

**Request:**
```typescript
{
  chatId: string;
}
```

**Response:**
```typescript
{
  ok: boolean;
  data?: {
    refundedTokens: number;
  };
  error?: string;
}
```

---

### Calendar Booking

#### `bookSlotCallable`
Book a calendar slot.

**Request:**
```typescript
{
  creatorUid: string;
  start: string; // ISO timestamp
  end: string;
  priceTokens: number;
  meetingType: string;
  location: {
    type: "public" | "hotel" | "private";
    name?: string;
  };
  acknowledgments: {
    socialOnly: boolean;
    noEscort: boolean;
    noSexWork: boolean;
    paymentForTime: boolean;
    banAware: boolean;
  };
}
```

#### `confirmBookingCallable`
Creator confirms booking.

**Request:**
```typescript
{
  bookingId: string;
}
```

#### `cancelBookingCallable`
Cancel booking with refund policy.

**Request:**
```typescript
{
  bookingId: string;
  by: "creator" | "booker";
}
```

#### `verifyMeetingCallable`
Verify meeting completion.

**Request:**
```typescript
{
  bookingId: string;
  method: "gps" | "qr" | "selfie";
}
```

---

### Payments

#### `stripeWebhook` (HTTP endpoint)
Handles Stripe webhooks.

**Endpoint:** `POST /stripeWebhook`

**Events handled:**
- `checkout.session.completed` - Credit tokens
- `payment_intent.succeeded` - Confirm payment
- `customer.subscription.created` - Grant subscription role
- `customer.subscription.updated` - Update subscription
- `customer.subscription.deleted` - Revoke subscription role

#### `creditTokensCallable` (Admin only)
Manually credit tokens to user.

**Request:**
```typescript
{
  uid: string;
  tokens: number;
  source: string;
}
```

#### `requestPayoutCallable`
Creator requests payout.

**Request:**
```typescript
{
  method: "bank" | "paypal" | "crypto";
  amountTokens: number;
  details: any;
}
```

---

### Moderation

#### `moderateContentCallable`
Moderate text or image content.

**Request:**
```typescript
{
  kind: "text" | "image";
  contentRef: string;
  chatId?: string;
  messageId?: string;
}
```

**Response:**
```typescript
{
  ok: boolean;
  data?: {
    allowed: boolean;
    reasons?: string[];
  };
  error?: string;
}
```

#### `reportContentCallable`
User reports content or user.

**Request:**
```typescript
{
  reportedUid: string;
  reason: string;
  chatId?: string;
  messageId?: string;
  screenshot?: string;
}
```

#### `reviewFlagCallable` (Moderator only)
Review and action on flag.

**Request:**
```typescript
{
  flagId: string;
  action: "warn" | "ban" | "dismiss";
}
```

---

### Scheduled Jobs (CRON)

#### `expireStaleChats`
Expires chats inactive for 48+ hours and refunds escrow.

**Schedule:** Every hour (`0 * * * *`)

#### `calendarSweep`
Handles overdue bookings and no-shows.

**Schedule:** Every 30 minutes (`*/30 * * * *`)

#### `updateRoyalEligibility`
Updates Royal Club eligibility based on Instagram followers and earnings.

**Schedule:** Daily at 3 AM (`0 3 * * *`)

---

## Configuration Constants

See `src/config.ts` for all system constants:

- **Chat:** 100 token deposit, 35% platform fee, 11 words/token (standard), 7 words/token (Royal)
- **Calendar:** 20% platform fee, min 100 tokens
- **Tips:** 20% platform fee
- **Subscriptions:** 30% platform fee
- **Settlement Rate:** 1 token = 0.20 PLN

## Business Logic

### Chat Roles (Who Pays, Who Earns)

1. **Hetero (M↔F):** Woman always earns, man always pays
2. **Homo (M↔M or F↔F):** Initiator pays, receiver earns if "Earn from chat" is ON
3. **Non-Binary:** Initiator pays, receiver earns if "Earn from chat" is ON

### Refund Rules

- **Platform fee:** NEVER refunded (non-refundable)
- **48h chat inactivity:** Unused escrow → payer
- **Earner voluntary refund:** 100% escrow → payer
- **Calendar creator cancels:** Full escrow → booker
- **Calendar booker cancels (≥24h):** 50% → booker, 30% → creator
- **Calendar booker cancels (<24h):** 0% → booker, 80% → creator

## Deployment

### Deploy all functions

```bash
firebase deploy --only functions
```

### Deploy specific function

```bash
firebase deploy --only functions:startChatCallable
```

### View logs

```bash
npm run logs
# or
firebase functions:log
```

## Testing

### Emulator

```bash
npm run serve
# Functions available at http://localhost:5001
```

### Call function via emulator

```bash
curl -X POST http://localhost:5001/avalo-c8c46/europe-west3/startChatCallable \
  -H "Content-Type: application/json" \
  -d '{"data": {"receiverUid": "test123"}}'
```

## Security

- All monetary operations use Firestore transactions
- Platform fees are instant and non-refundable
- Server-side validation for all inputs
- Role-based access control (RBAC) for admin functions
- Webhook signature verification for Stripe

## Monitoring

Key metrics to track:
- Chat completion rate
- Platform fee revenue
- Refund rate
- Calendar booking completion rate
- Token purchase volume
- Payout requests

---

**Phase 2 Complete** ✅

All backend functions are implemented and ready for deployment.
