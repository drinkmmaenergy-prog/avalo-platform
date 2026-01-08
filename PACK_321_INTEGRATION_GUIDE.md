# PACK 321 — Integration Guide for Feature Teams

This guide shows how to integrate the enhanced PACK 321 wallet system into your features.

---

## Quick Start

Import the enhanced wallet functions:

```typescript
import { spendTokens } from './pack277-wallet-service';
import type { WalletRevenueContextType } from './types/pack277-wallet.types';
```

---

## 1. Chat Integration (CHAT_PAID)

### When to Call
- User sends paid message (after free quota exceeded)
- User purchases word packages
- Any paid chat interaction

### Implementation

```typescript
// File: functions/src/chat-monetization-service.ts

import { spendTokens } from './pack277-wallet-service';

async function processPaidChatMessage(
  payerId: string,
  earnerId: string | null, // null for AVALO_ONLY_REVENUE
  chatId: string,
  messageId: string,
  costTokens: number
) {
  const result = await spendTokens({
    userId: payerId,
    amountTokens: costTokens,
    source: 'CHAT',
    relatedId: chatId,
    creatorId: earnerId, // null triggers AVALO_ONLY_REVENUE if needed
    contextType: earnerId ? 'CHAT_PAID' : 'AVALO_ONLY_REVENUE',
    contextRef: `chat:${chatId}:msg:${messageId}`,
    metadata: {
      messageId,
      messageType: 'text', // or 'image', 'voice'
      wordCount: 10, // if applicable
    }
  });

  if (!result.success) {
    throw new Error(result.error || 'Payment failed');
  }

  return result;
}
```

### Earner Logic (from PACK R2.1-R6)
```typescript
function determineEarner(payer: User, creator: User) {
  // Heterosexual: male pays, female earns
  if (payer.gender === 'male' && creator.gender === 'female') {
    return creator.userId;
  }
  
  // Influencer exception
  if (creator.hasInfluencerBadge) {
    return creator.userId;
  }
  
  // Low-pop free chat
  if (isLowPopulationMarket(creator.country)) {
    return null; // Free chat, no payment needed
  }
  
  // Avalo-only revenue (earn OFF, not low-pop)
  if (payer.earnState === 'OFF') {
    return null; // Use AVALO_ONLY_REVENUE context
  }
  
  // ... other cases per R2.1-R6
}
```

---

## 2. Calls Integration (CALL_VOICE / CALL_VIDEO)

### When to Call
- Voice or video call starts (per-minute billing)
- Call ends (final charge)

### Implementation

```typescript
// File: functions/src/calls-monetization-service.ts

import { spendTokens } from './pack277-wallet-service';

async function chargeForCall(
  payerId: string,
  earnerId: string,
  callId: string,
  durationMinutes: number,
  baseRatePerMinute: number,
  isVideo: boolean,
  membership?: 'VIP' | 'ROYAL'
) {
  // Apply VIP/Royal discounts BEFORE spending tokens
  let discount = 0;
  if (membership === 'VIP') discount = 0.30; // 30% off
  if (membership === 'ROYAL') discount = 0.50; // 50% off
  
  const discountedRate = baseRatePerMinute * (1 - discount);
  const totalCost = Math.ceil(durationMinutes * discountedRate);

  const result = await spendTokens({
    userId: payerId,
    amountTokens: totalCost,
    source: 'CALL',
    relatedId: callId,
    creatorId: earnerId,
    contextType: isVideo ? 'CALL_VIDEO' : 'CALL_VOICE',
    contextRef: `call:${callId}`,
    metadata: {
      durationMinutes,
      baseRate: baseRatePerMinute,
      discountedRate,
      discount,
      membership,
      isVideo,
    }
  });

  // Revenue split is 65/35 on the DISCOUNTED amount
  // Earner gets 65% of totalCost, Avalo gets 35%

  return result;
}
```

---

## 3. Calendar Integration (CALENDAR_BOOKING)

### When to Call
- User books 1:1 meeting
- User cancels booking (with time-window refund)
- Host cancels booking (full refund)

### Implementation

```typescript
// File: functions/src/calendar-service.ts

import { spendTokens, refundTokens } from './pack277-wallet-service';

// BOOKING
async function createBooking(
  bookerId: string,
  hostId: string,
  bookingId: string,
  costTokens: number,
  scheduledTime: Date
) {
  const result = await spendTokens({
    userId: bookerId,
    amountTokens: costTokens,
    source: 'CALENDAR',
    relatedId: bookingId,
    creatorId: hostId,
    contextType: 'CALENDAR_BOOKING',
    contextRef: `calendar:${bookingId}`,
    metadata: {
      scheduledTime: scheduledTime.toISOString(),
      bookingType: '1:1',
    }
  });

  return { ...result, txId: result.txId };
}

// USER CANCELLATION (time-window refund)
async function cancelBookingByUser(
  bookerId: string,
  hostId: string,
  bookingId: string,
  originalTxId: string,
  originalCost: number,
  scheduledTime: Date
) {
  const now = new Date();
  const hoursUntilMeeting = (scheduledTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  
  let refundPercent = 0;
  if (hoursUntilMeeting >= 72) refundPercent = 1.0; // 100%
  else if (hoursUntilMeeting >= 24) refundPercent = 0.5; // 50%
  // else 0% (no refund if <24h)
  
  if (refundPercent === 0) {
    return { success: false, error: 'No refund available (<24h)' };
  }

  const refundAmount = Math.floor(originalCost * refundPercent);

  return await refundTokens({
    userId: bookerId,
    amountTokens: refundAmount,
    source: 'CALENDAR',
    relatedId: bookingId,
    reason: 'CANCELLED_BY_PAYER',
    contextType: 'CALENDAR_BOOKING',
    refundPlatformShare: false, // Commission stays with Avalo
    originalTransactionId: originalTxId,
    earnerUserId: hostId,
    metadata: {
      hoursUntilMeeting,
      refundPercent,
      scheduledTime: scheduledTime.toISOString(),
    }
  });
}

// HOST CANCELLATION (full refund including commission)
async function cancelBookingByHost(
  bookerId: string,
  hostId: string,
  bookingId: string,
  originalTxId: string,
  originalCost: number
) {
  return await refundTokens({
    userId: bookerId,
    amountTokens: originalCost, // Full amount
    source: 'CALENDAR',
    relatedId: bookingId,
    reason: 'CANCELLED_BY_EARNER',
    contextType: 'CALENDAR_BOOKING',
    refundPlatformShare: true, // Platform MUST refund commission
    originalTransactionId: originalTxId,
    earnerUserId: hostId,
    metadata: {
      cancelledByHost: true,
    }
  });
}
```

---

## 4. Events Integration (EVENT_TICKET)

### Implementation

```typescript
// File: functions/src/events-service.ts

import { spendTokens, refundTokens } from './pack277-wallet-service';

// TICKET PURCHASE
async function purchaseTicket(
  attendeeId: string,
  organizerId: string,
  eventId: string,
  ticketPrice: number
) {
  return await spendTokens({
    userId: attendeeId,
    amountTokens: ticketPrice,
    source: 'EVENT',
    relatedId: eventId,
    creatorId: organizerId,
    contextType: 'EVENT_TICKET',
    contextRef: `event:${eventId}:ticket`,
    metadata: {
      eventType: 'group',
    }
  });
}

// REFUND (same time-window logic as calendar)
async function refundTicket(
  attendeeId: string,
  organizerId: string,
  eventId: string,
  originalTxId: string,
  ticketPrice: number,
  eventTime: Date,
  cancelledByOrganizer: boolean
) {
  if (cancelledByOrganizer) {
    // Organizer cancelled: full refund including commission
    return await refundTokens({
      userId: attendeeId,
      amountTokens: ticketPrice,
      source: 'EVENT',
      relatedId: eventId,
      reason: 'CANCELLED_BY_EARNER',
      contextType: 'EVENT_TICKET',
      refundPlatformShare: true,
      originalTransactionId: originalTxId,
      earnerUserId: organizerId,
    });
  }

  // User cancelled: time-window refund (same as calendar)
  const hoursUntilEvent = (eventTime.getTime() - Date.now()) / (1000 * 60 * 60);
  let refundPercent = 0;
  if (hoursUntilEvent >= 72) refundPercent = 1.0;
  else if (hoursUntilEvent >= 24) refundPercent = 0.5;

  const refundAmount = Math.floor(ticketPrice * refundPercent);
  
  return await refundTokens({
    userId: attendeeId,
    amountTokens: refundAmount,
    source: 'EVENT',
    relatedId: eventId,
    reason: 'CANCELLED_BY_PAYER',
    contextType: 'EVENT_TICKET',
    refundPlatformShare: false,
    originalTransactionId: originalTxId,
    earnerUserId: organizerId,
  });
}
```

---

## 5. AI, Tips, Media Integration

### AI Sessions

```typescript
await spendTokens({
  userId: userId,
  amountTokens: sessionCost,
  source: 'CHAT', // or custom
  relatedId: sessionId,
  creatorId: aiCompanionOwnerId, // or null for Avalo AI
  contextType: 'AI_SESSION',
  contextRef: `ai:${sessionId}`,
});
// 65/35 split applies
```

### Tips

```typescript
await spendTokens({
  userId: tipperId,
  amountTokens: tipAmount,
  source: 'TIP',
  relatedId: tipId,
  creatorId: receiverId,
  contextType: 'TIP',
  contextRef: `tip:${tipId}`,
});
// 90/10 split applies (90% to creator)
```

### Media/Products

```typescript
await spendTokens({
  userId: buyerId,
  amountTokens: productPrice,
  source: 'MEDIA', // or 'DIGITAL_PRODUCT'
  relatedId: productId,
  creatorId: creatorId,
  contextType: 'MEDIA_PURCHASE',
  contextRef: `media:${productId}`,
});
// 65/35 split applies
```

---

## 6. Review Mode Support

Add review mode detection to wallet operations:

```typescript
import { isReviewMode } from './pack316-review-mode';

async function ensureWallet(userId: string) {
  const reviewMode = await isReviewMode(userId);
  const collection = reviewMode ? 'demoWallets' : 'wallets';
  // ... use appropriate collection
}
```

---

## Testing Checklist

For each integration:

- [ ] Test spending tokens (verify correct split)
- [ ] Test insufficient balance error
- [ ] Test refund (if applicable)
- [ ] Test edge cases (null earner, AVALO_ONLY_REVENUE)
- [ ] Verify transaction history shows correct context
- [ ] Test review mode isolation

---

## Common Patterns

### Error Handling

```typescript
const result = await spendTokens({...});
if (!result.success) {
  if (result.error === 'Insufficient token balance') {
    // Show "Buy tokens" prompt
  } else {
    // Show generic error
  }
}
```

### Transaction Reference

Always store the returned `txId` for refund operations:

```typescript
const { txId } = await spendTokens({...});
await saveToDatabase({ originalTxId: txId });
```

### Context Ref Format

Use consistent format for `contextRef`:
- Chat: `chat:${chatId}:msg:${messageId}`
- Calls: `call:${callId}`
- Calendar: `calendar:${bookingId}`
- Events: `event:${eventId}:ticket`

---

## Support

Questions? Check:
1. PACK_321_IMPLEMENTATION_SUMMARY.md
2. functions/src/pack277-wallet-service.ts (source code)
3. PACK R2.1-R6 (business rules)