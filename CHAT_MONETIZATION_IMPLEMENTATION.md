# Chat Monetization Implementation - Avalo

## Overview

This document describes the complete implementation of the chat monetization logic for Avalo, as specified in the requirements. The implementation is located in [`functions/src/chatMonetization.ts`](functions/src/chatMonetization.ts:1).

## Implementation Status

✅ **COMPLETE** - All specification requirements have been implemented.

## Core Components

### 1. Role Determination Logic

The [`determineChatRoles()`](functions/src/chatMonetization.ts:71) function implements the complete priority order:

1. **Influencer Override** (Priority 1)
   - If exactly ONE participant has `influencerBadge = ON` AND `earnOnChat = ON`
   - That person becomes earner, the other becomes payer
   - Gender is irrelevant in this case

2. **Heterosexual Rule** (Priority 2)  
   - Man ALWAYS pays in heterosexual interactions (Man ↔ Woman)
   - If woman has `earnOnChat = ON` → she is the earner
   - If woman has `earnOnChat = OFF` → Avalo is the earner
   - Free-pool logic applies when woman has `earnOnChat = OFF`

3. **earnOnChat Rules** (Priority 3)
   - Only one has `earnOnChat = ON` → that person earns, other pays
   - Both have `earnOnChat = ON` → receiver earns, initiator pays
   - Both have `earnOnChat = OFF` → initiator pays, Avalo earns

4. **Free-Pool Eligibility** (Priority 4)
   - Only applies when `earnOnChat = OFF`
   - NEW users (0-5 days) are NEVER free
   - **FREE A**: `popularity = low` AND `earnOnChat = OFF` → completely free, no limit
   - **FREE B**: `popularity = mid` AND `earnOnChat = OFF` → 50 free messages, then paid

### 2. Billing Logic

The [`calculateMessageBilling()`](functions/src/chatMonetization.ts:267) function implements:

✅ **Only bill words from the EARNER**
- Words from payer are NEVER billed
- Conversion rates:
  - Royal member earner: **7 words = 1 token**
  - Standard earner: **11 words = 1 token**
- Calculation: `Math.round(words / wordsPerToken)`

### 3. Free Messages

Every chat starts with **3 free messages per participant** (6 total):
- First 3 payer messages are free
- First 3 earner messages are free
- After 6 messages total, billing begins

### 4. Chat Lifecycle

#### Initialization
[`initializeChat()`](functions/src/chatMonetization.ts:339) creates chat with:
- Mode: `FREE_A`, `FREE_B`, or `PAID`
- State: `FREE_ACTIVE` → `AWAITING_DEPOSIT` → `PAID_ACTIVE` → `CLOSED`
- Free message counters
- Billing configuration

#### Message Processing
[`processMessageBilling()`](functions/src/chatMonetization.ts:361) handles:
- Free message deduction
- Mode transitions (FREE_B → PAID after 50 messages)
- Escrow balance checks
- Token billing and crediting

#### Deposit Processing
[`processChatDeposit()`](functions/src/chatMonetization.ts:548) implements:
- 100 token deposit
- **35% platform fee** (immediate, non-refundable)
- **65% to escrow** (available for billing)
- Atomic wallet transaction

#### Chat Closing
[`closeAndSettleChat()`](functions/src/chatMonetization.ts:603) handles:
- Manual close via "End Chat" button
- Auto-close after 48h inactivity (via [`autoCloseInactiveChats()`](functions/src/chatMonetization.ts:676))
- Refund unused escrow to payer
- Record refund transaction

### 5. Settlement

Settlement logic implemented:
- Earner receives consumed tokens immediately (real-time)
- Avalo takes 35% platform fee at deposit (non-refundable)
- Unused escrow returns to payer on chat close
- After settlement, both profiles return to Swipe (unless BLOCK was pressed)

## Data Types

### ChatParticipantContext
```typescript
{
  userId: string;
  gender: 'male' | 'female' | 'other';
  earnOnChat: boolean;
  influencerBadge: boolean;
  isRoyalMember: boolean;
  popularity: 'low' | 'mid' | 'high';
  accountAgeDays: number;
}
```

### ChatMonetizationRoles
```typescript
{
  payerId: string;
  earnerId: string | null;  // null = Avalo earns
  wordsPerToken: number;    // 7 or 11
  mode: 'FREE_A' | 'FREE_B' | 'PAID';
  needsEscrow: boolean;
  freeMessageLimit: number; // 0, 50, or Infinity
}
```

### ChatState
```typescript
'FREE_ACTIVE'       // Free chat (no billing)
'AWAITING_DEPOSIT'  // Waiting for 100 token deposit
'PAID_ACTIVE'       // Active with escrow
'CLOSED'            // Settled and closed
```

## Integration Guide

### Step 1: Import the Module

```typescript
import {
  determineChatRoles,
  getUserContext,
  initializeChat,
  processMessageBilling,
  processChatDeposit,
  closeAndSettleChat,
  autoCloseInactiveChats,
  type ChatParticipantContext
} from './chatMonetization.js';
```

### Step 2: Determine Roles When Chat Starts

```typescript
// Get user contexts
const userAContext = await getUserContext(userAId);
const userBContext = await getUserContext(userBId);

// Determine monetization roles
const roles = await determineChatRoles(
  userAContext,
  userBContext,
  { initiatorId: userAId }
);

// Initialize chat
await initializeChat(chatId, roles, [userAId, userBId]);
```

### Step 3: Process Messages

```typescript
const result = await processMessageBilling(
  chatId,
  senderId,
  messageText
);

if (!result.allowed) {
  // Show deposit prompt or error
  return { error: result.reason };
}

// Save message and continue
```

### Step 4: Handle Deposits

```typescript
const depositResult = await processChatDeposit(chatId, payerId);
// depositResult = { success: true, escrowAmount: 65, platformFee: 35 }
```

### Step 5: Close Chats

```typescript
// Manual close
await closeAndSettleChat(chatId, userId);

// Or scheduled auto-close (run every hour)
const closedCount = await autoCloseInactiveChats();
```

## Word Counting Logic

The [`countBillableWords()`](functions/src/chatMonetization.ts:309) function:
- ✅ Removes URLs (not counted)
- ✅ Removes emojis (not counted)
- ✅ Splits by whitespace
- ✅ Filters empty strings
- Returns accurate word count

## Edge Cases Handled

1. ✅ Both participants are influencers → falls through to next rule
2. ✅ New users with earnOff → NEVER free (always PAID)
3. ✅ Free-pool users after 5 days → can become free
4. ✅ FREE_B transition to PAID after 50 messages
5. ✅ Escrow balance check before billing
6. ✅ Atomic transactions prevent race conditions
7. ✅ 48h auto-close prevents indefinite escrow locks
8. ✅ Platform fee taken immediately (non-refundable)

## Revenue Protection

✅ **Zero revenue risk for Avalo** when `earnOnChat = OFF`:
- Free-pool chats generate NO revenue but cost nothing
- When free-pool users transition to PAID, Avalo earns 35% + 65% escrow
- New users (0-5 days) are ALWAYS paid (even with earnOff)

## Testing Checklist

- [ ] Influencer override (one influencer earner)
- [ ] Heterosexual man pays, woman earnOn
- [ ] Heterosexual man pays, woman earnOff → FREE_A
- [ ] Heterosexual man pays, woman earnOff → FREE_B → PAID
- [ ] MM both earnOn → initiator pays, receiver earns
- [ ] FF both earnOff → FREE_A or FREE_B
- [ ] New user (3 days old) with earnOff → PAID (not free)
- [ ] Royal member → 7 words per token
- [ ] Standard user → 11 words per token
- [ ] First 6 messages free (3 per participant)
- [ ] FREE_B → PAID transition at 50 messages
- [ ] Deposit: 100 tokens → 35 fee + 65 escrow
- [ ] Billing only from earner messages
- [ ] Escrow deduction and earner credit
- [ ] Manual chat close → refund
- [ ] 48h auto-close → refund
- [ ] Word counting (URLs and emojis excluded)

## Configuration Constants

Located at top of [`chatMonetization.ts`](functions/src/chatMonetization.ts:53):

```typescript
WORDS_PER_TOKEN_ROYAL = 7
WORDS_PER_TOKEN_STANDARD = 11
FREE_MESSAGES_PER_PARTICIPANT = 3
FREE_B_MESSAGE_LIMIT = 50
NEW_USER_THRESHOLD_DAYS = 5
CHAT_DEPOSIT_TOKENS = 100
PLATFORM_FEE_PERCENT = 35
INACTIVITY_TIMEOUT_HOURS = 48
```

## Database Schema

### Chat Document
```typescript
{
  chatId: string;
  participants: string[];
  roles: {
    payerId: string;
    earnerId: string | null;
  };
  mode: 'FREE_A' | 'FREE_B' | 'PAID';
  state: ChatState;
  billing: {
    wordsPerToken: number;
    freeMessagesRemaining: { [userId]: number };
    escrowBalance: number;
    totalConsumed: number;
    messageCount: number;
  };
  freeMessageLimit: number;
  needsEscrow: boolean;
  deposit?: {
    amount: 100;
    platformFee: 35;
    escrowAmount: 65;
    paidAt: Timestamp;
  };
  createdAt: Timestamp;
  lastActivityAt: Timestamp;
  updatedAt: Timestamp;
  closedAt?: Timestamp;
  closedBy?: string;
}
```

## Files Modified/Created

1. ✅ **Created**: `functions/src/chatMonetization.ts` (730 lines)
   - Complete monetization logic
   - All specification requirements
   - Zero-revenue-risk free-pool implementation

2. ✅ **Modified**: `functions/src/init.ts`
   - Added missing `getFirestore` import

## Specification Compliance

This implementation follows the specification EXACTLY:

✅ Priority order strictly enforced  
✅ Influencer override implemented  
✅ Heterosexual rule: man always pays  
✅ earnOnChat logic fully implemented  
✅ Free-pool with zero Avalo revenue risk  
✅ New users never free (0-5 days)  
✅ Royal vs standard word rates  
✅ Only bill earner words  
✅ First 6 messages free  
✅ 35%/65% split  
✅ 48h auto-close  
✅ Settlement logic  
✅ No UI modifications needed  

## Next Steps

1. **Install Dependencies** (if needed):
   ```bash
   cd functions
   npm install
   ```

2. **Update Existing Chat Functions**:
   - Replace current `determineChatRoles()` calls with new implementation
   - Use `processMessageBilling()` for all message sends
   - Add deposit handling for PAID mode

3. **Add Scheduled Function** for auto-close:
   ```typescript
   export const autoCloseInactiveChatsScheduled = onSchedule(
     { schedule: 'every 1 hours' },
     async () => {
       const closed = await autoCloseInactiveChats();
       logger.info(`Auto-closed ${closed} inactive chats`);
     }
   );
   ```

4. **Test Thoroughly**:
   - Use integration tests
   - Test all rule combinations
   - Verify escrow math
   - Test free-pool transitions

## Support

For questions or issues with this implementation, refer to:
- This document
- Inline code comments in [`chatMonetization.ts`](functions/src/chatMonetization.ts:1)
- Original specification document