# PACK 321B — Wallet & Token Store Testing Guide

## Overview
This document provides testing guidance for the completed PACK 321B wallet implementation, including test scenarios, expected behaviors, and QA checklist.

## Test Environment Setup

### Demo Mode Testing
1. Enable demo mode for test users:
   ```typescript
   await enableDemoModeForUser(userId, adminId);
   ```
2. Demo users receive 1,000 tokens automatically
3. Demo wallet operations don't affect real balances
4. Reset demo wallet between tests if needed

### Required Test Accounts
- **Payer Account**: User with sufficient token balance
- **Earner Account**: Creator/service provider
- **Admin Account**: For testing admin functions
- **Demo Account**: User with demo mode enabled

## 1. Token Pack Purchase Tests

### Test Case 1.1: View Token Packs
**Steps:**
1. Call `pack277_getTokenPacks()`
2. Verify all 7 packs are returned
3. Verify prices match:
   - Mini: 100 tokens = 31.99 PLN
   - Basic: 300 tokens = 85.99 PLN
   - Standard: 500 tokens = 134.99 PLN
   - Premium: 1,000 tokens = 244.99 PLN
   - Pro: 2,000 tokens = 469.99 PLN
   - Elite: 5,000 tokens = 1,125.99 PLN
   - Royal: 10,000 tokens = 2,149.99 PLN

**Expected:** All packs active and correctly priced

### Test Case 1.2: Purchase Token Pack (Web - Stripe)
**Steps:**
1. Call `pack277_purchaseTokensWeb({ packId: 'mini', paymentIntentId: 'pi_test_123' })`
2. Verify balance increases by pack amount
3. Verify transaction record created with type 'PURCHASE'
4. Verify lifetimePurchasedTokens incremented

**Expected:** Tokens added, transaction recorded, no duplicate purchase

### Test Case 1.3: Duplicate Purchase Prevention
**Steps:**
1. Attempt purchase with same paymentIntentId twice
2. Second attempt should fail

**Expected:** Error "Payment already processed"

### Test Case 1.4: Rate Limiting
**Steps:**
1. Attempt 4 purchases within 1 minute
2. 4th purchase should fail

**Expected:** Error "Too many purchases in short time"

## 2. Wallet Balance Tests

### Test Case 2.1: Get Wallet Balance
**Steps:**
1. Call `pack277_getBalance()`
2. Verify returned fields:
   - tokensBalance
   - lifetimePurchasedTokens
   - lifetimeSpentTokens
   - lifetimeEarnedTokens

**Expected:** All fields present and accurate

### Test Case 2.2: Balance Calculation
**Steps:**
1. Record initial balance
2. Perform purchase (+100)
3. Perform spend (-50)
4. Perform earn (+30)
5. Verify final balance = initial + 100 - 50 + 30

**Expected:** Balance calculations accurate

## 3. Spend & Revenue Split Tests

### Test Case 3.1: Chat Payment (65/35 split)
**Steps:**
1. Use helper: `chargeForPaidChat(payerId, earnerId, 100, chatId)`
2. Verify payer balance decreases by 100
3. Verify earner balance increases by 65
4. Verify platform revenue increases by 35
5. Verify transaction records created for both users

**Expected:** 65/35 split enforced, all transactions recorded

### Test Case 3.2: Voice Call Payment (65/35 split)
**Steps:**
1. Use helper: `chargeForVoiceCall(payerId, earnerId, 200, callId)`
2. Verify 65/35 split (130 to earner, 70 to platform)

**Expected:** Correct split applied

### Test Case 3.3: Video Call Payment (65/35 split)
**Steps:**
1. Use helper: `chargeForVideoCall(payerId, earnerId, 300, callId)`
2. Verify 65/35 split (195 to earner, 105 to platform)

**Expected:** Correct split applied

### Test Case 3.4: Calendar Booking (80/20 split)
**Steps:**
1. Use helper: `chargeForCalendarBooking(bookerId, creatorId, 1000, bookingId, futureDate)`
2. Verify 80/20 split (800 to earner, 200 to platform)

**Expected:** Correct split applied

### Test Case 3.5: Event Ticket (80/20 split)
**Steps:**
1. Use helper: `chargeForEventTicket(attendeeId, organizerId, 500, eventId, ticketId, futureDate)`
2. Verify 80/20 split (400 to earner, 100 to platform)

**Expected:** Correct split applied

### Test Case 3.6: Tip (90/10 split)
**Steps:**
1. Use helper: `chargeForTip(tipperId, receiverId, 100, relatedId)`
2. Verify 90/10 split (90 to receiver, 10 to platform)

**Expected:** Correct split applied

### Test Case 3.7: AI Session (65/35 split)
**Steps:**
1. Use helper: `chargeForAISession(userId, aiOwnerId, 150, sessionId)`
2. Verify 65/35 split

**Expected:** Correct split applied

### Test Case 3.8: Media Purchase (65/35 split)
**Steps:**
1. Use helper: `chargeForMediaPurchase(buyerId, creatorId, 100, mediaId, 'photo')`
2. Verify 65/35 split

**Expected:** Correct split applied

### Test Case 3.9: Insufficient Balance
**Steps:**
1. Attempt spend with balance=50, amount=100
2. Should fail

**Expected:** Error "Insufficient token balance"

## 4. Refund Tests

### Test Case 4.1: Calendar Booking - Payer Cancels ≥72h Before
**Steps:**
1. Create booking for 5 days from now (amount: 1000 tokens)
2. Call `refundCalendarBooking(bookerId, earnerId, 1000, bookingId, startTime, 'PAYER')`
3. Verify 100% refund (1000 tokens) to payer
4. Verify earner balance unchanged (platform keeps 20%)

**Expected:** Full refund to payer

### Test Case 4.2: Calendar Booking - Payer Cancels 48-24h Before
**Steps:**
1. Create booking for 30 hours from now (amount: 1000 tokens)
2. Cancel as payer
3. Verify 50% refund (500 tokens) to payer

**Expected:** 50% refund to payer

### Test Case 4.3: Calendar Booking - Payer Cancels <24h Before
**Steps:**
1. Create booking for 12 hours from now (amount: 1000 tokens)
2. Cancel as payer
3. Verify 0% refund

**Expected:** No refund, error message

### Test Case 4.4: Calendar Booking - Earner Cancels (Any Time)
**Steps:**
1. Create booking (amount: 1000 tokens)
2. Call `refundCalendarBooking(bookerId, earnerId, 1000, bookingId, startTime, 'EARNER')`
3. Verify 100% refund to payer (1000 tokens)
4. Verify platform commission also refunded
5. Verify earner balance decreases by 800

**Expected:** Full refund to payer, platform and earner both refund their shares

### Test Case 4.5: Event Ticket - Similar Time Window Tests
**Steps:**
1. Test same scenarios as Test Cases 4.1-4.4 but with events
2. Use `refundEventTicket()` helper

**Expected:** Same refund behavior as calendar bookings

### Test Case 4.6: Chat/Call Refund (No Time Windows)
**Steps:**
1. Perform chat payment (100 tokens)
2. Call `refundChatTokens(userId, 50, chatId, 'Early disconnect')`
3. Verify partial refund (no commission refund)

**Expected:** Tokens refunded, platform keeps commission

## 5. Payout Tests

### Test Case 5.1: Request Payout (Valid)
**Steps:**
1. Ensure user has ≥1000 earned tokens
2. Ensure KYC verified
3. Call `pack277_requestPayout({ amountTokens: 1000, payoutMethod: 'stripe_connect', currency: 'PLN' })`
4. Verify payout record created with status 'PENDING'
5. Verify calculated amount = 1000 × 0.20 = 200 PLN

**Expected:** Payout request created successfully

### Test Case 5.2: Payout Below Minimum
**Steps:**
1. Request payout of 500 tokens
2. Should fail

**Expected:** Error "Minimum payout is 1000 tokens"

### Test Case 5.3: Payout Without KYC
**Steps:**
1. Request payout without KYC verification
2. Should fail

**Expected:** Error "KYC verification required for payouts"

### Test Case 5.4: Payout Exceeds Balance
**Steps:**
1. Request payout of 5000 tokens with balance of 2000
2. Should fail

**Expected:** Error "Insufficient balance"

### Test Case 5.5: Cannot Cash Out Purchased Tokens
**Steps:**
1. User has 1500 purchased tokens, 500 earned tokens
2. Request payout of 1000 tokens
3. Should fail

**Expected:** Error "Insufficient earned tokens for payout"

### Test Case 5.6: Payout Rate Verification
**Steps:**
1. Request payout of 2000 tokens
2. Verify calculated amounts:
   - PLN: 400.00
   - USD: ~100.00 (at 0.25 rate)
   - EUR: ~92.00 (at 0.23 rate)
   - GBP: ~80.00 (at 0.20 rate)

**Expected:** Correct payout calculations for all currencies

## 6. Transaction History Tests

### Test Case 6.1: Get All Transactions
**Steps:**
1. Call `pack277_getTransactionHistory({ limit: 50 })`
2. Verify transactions returned in reverse chronological order

**Expected:** All transactions visible, sorted by timestamp DESC

### Test Case 6.2: Filter by Type
**Steps:**
1. Call with filter: `{ limit: 50, type: 'PURCHASE' }`
2. Verify only purchase transactions returned

**Expected:** Filtered results accurate

### Test Case 6.3: Transaction Metadata
**Steps:**
1. Perform operation with context (e.g., chat payment)
2. Fetch transaction
3. Verify metadata includes:
   - contextType
   - contextRef
   - split details (creatorAmount, avaloAmount, splitPercent)

**Expected:** Rich metadata present

## 7. Demo Mode Tests

### Test Case 7.1: Enable Demo Mode
**Steps:**
1. Call `enableDemoModeForUser(userId, adminId)`
2. Verify user has demo flag set
3. Verify demo wallet created with 1000 tokens

**Expected:** Demo wallet created, user in demo mode

### Test Case 7.2: Demo Wallet Isolation
**Steps:**
1. Perform operations in demo mode
2. Verify real wallet unchanged
3. Disable demo mode
4. Verify real wallet still intact

**Expected:** Demo operations don't affect real wallet

### Test Case 7.3: Reset Demo Wallet
**Steps:**
1. Spend demo tokens
2. Call `resetDemoWallet(userId)`
3. Verify balance reset to 1000 tokens

**Expected:** Demo wallet reset successfully

## 8. UI/UX Tests

### Mobile App Tests
1. **Wallet Home Screen**
   - Balance displays correctly
   - Fiat equivalent accurate
   - Quick actions functional
   - Stats visible

2. **Token Store**
   - All 7 packs visible
   - Popular badge on Standard pack
   - Purchase flow works
   - Currency display correct

3. **Transactions**
   - List renders
   - Filters work
   - Icons and colors correct
   - Infinite scroll (if implemented)

4. **Payout Screen**
   - KYC status visible
   - Amount input validated
   - Quick amounts work
   - Method selection works

### Web App Tests
1. Test all 4 pages:
   - `/wallet` - main overview
   - `/wallet/buy` - token store
   - `/wallet/transactions` - history
   - `/wallet/payouts` - payout request

2. Responsive design on desktop, tablet, mobile

## 9. Edge Cases

### Test Case 9.1: Concurrent Transactions
**Steps:**
1. Initiate two spends simultaneously from same user
2. Verify atomicity (no double-spend)

**Expected:** Only one succeeds or both fail safely

### Test Case 9.2: Balance Precision
**Steps:**
1. Perform operations with various split percentages
2. Verify no rounding errors accumulate
3. Verify Math.floor() used for splits

**Expected:** No token fractions, consistent rounding

### Test Case 9.3: Large Token Amounts
**Steps:**
1. Test with Royal pack (10,000 tokens)
2. Test payouts of 5,000+ tokens

**Expected:** No overflow or precision issues

## 10. QA Checklist

### Tokenomics Compliance
- [ ] All token packs match specification
- [ ] Payout rate fixed at 0.20 PLN/token
- [ ] Revenue splits correct:
  - [ ] Chat/Calls/AI/Media: 65/35
  - [ ] Calendar/Events: 80/20
  - [ ] Tips: 90/10
- [ ] No free tokens (except demo mode)
- [ ] No promo codes
- [ ] No discounts
- [ ] 18+ enforcement mentioned

### Refund Policy Compliance
- [ ] Calendar booking time windows enforced
- [ ] Event ticket time windows enforced
- [ ] Earner cancellation = full refund
- [ ] Platform commission handling correct

### Security
- [ ] User can only access own wallet
- [ ] Admin functions require admin token
- [ ] Firestore transactions used for atomicity
- [ ] No duplicate purchases possible
- [ ] Rate limiting works

### Data Integrity
- [ ] All wallet operations atomic
- [ ] Transaction records always created
- [ ] Balance calculations accurate
- [ ] No orphaned transactions
- [ ] Platform revenue tracked

### UI/UX
- [ ] Loading states present
- [ ] Error messages clear
- [ ] Success confirmations shown
- [ ] Navigation intuitive
- [ ] Mobile-responsive

## Sample Test Data

### Test Scenario: Complete User Journey
```typescript
// 1. New user
const userId = 'test_user_123';

// 2. Purchase tokens
await purchaseTokens({ userId, packId: 'basic', paymentIntentId: 'pi_test_001' });
// Balance: 300 tokens

// 3. Use paid chat
await chargeForPaidChat(userId, 'creator_456', 50, 'chat_789');
// Balance: 250 tokens
// Creator earned: 32.5 tokens (65%)
// Platform: 17.5 tokens (35%)

// 4. Book calendar meeting
await chargeForCalendarBooking(userId, 'creator_456', 100, 'booking_123', futureDate);
// Balance: 150 tokens
// Creator earned: 80 tokens (80%)
// Platform: 20 tokens (20%)

// 5. Cancel booking (>72h before)
await refundCalendarBooking(userId, 'creator_456', 100, 'booking_123', futureDate, 'PAYER');
// Balance: 250 tokens (100% refund)

// 6. Final balance verification
const wallet = await getWalletBalance(userId);
// Expected:
// - tokensBalance: 250
// - lifetimePurchasedTokens: 300
// - lifetimeSpentTokens: 50 (only chat counted, booking refunded)
// - lifetimeEarnedTokens: 0
```

## Performance Tests

1. **Load Test**: 100 concurrent purchases
2. **Stress Test**: 1000 transactions in 1 minute
3. **Balance Query**: <100ms response time
4. **Transaction List**: <200ms for 50 records

## Monitoring & Alerts

- Monitor platform revenue accumulation
- Alert on negative balances (should never happen)
- Alert on failed transactions >5% rate
- Monitor demo mode usage
- Track payout processing times

## Notes for QA Team

1. Always test in demo mode first to avoid affecting real data
2. Use separate test accounts for payer/earner roles
3. Reset demo wallets between test runs
4. Document any deviations from expected behavior
5. Test all integration helpers, not just direct wallet functions
6. Verify Firebase indexes exist for transaction queries
7. Test error messages are user-friendly
8. Verify all monetary amounts display with 2 decimal places

## Test Completion Criteria

✅ All test cases pass
✅ No tokenomics deviations
✅ No security vulnerabilities found
✅ UI/UX meets requirements
✅ Performance targets met
✅ Documentation complete