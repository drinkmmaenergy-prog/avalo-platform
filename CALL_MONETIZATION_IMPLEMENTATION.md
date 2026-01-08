# Call Monetization Implementation Summary

## Overview

This document describes the implementation of voice and video call monetization for the Avalo platform, including pricing rules, revenue splits, and calendar booking access controls.

**Implementation Date:** 2025-11-19  
**Status:** ✅ Complete

---

## 1. Call Pricing Rules

### 1.1 Who Pays

The payer is determined using the following priority order (identical to chat monetization logic):

#### Priority 1: Influencer Override
- If exactly ONE participant has `influencerBadge = ON` AND `earnOnChat = ON`
- That person becomes **earner**, the other becomes **payer**
- Gender is irrelevant in this case

#### Priority 2: Heterosexual Rule (M↔F)
**IMPORTANT:** In heterosexual male-female interactions:
- **The man ALWAYS pays** for both VOICE and VIDEO calls
- This applies **regardless of who initiates the call**
- This applies **regardless of earnOnChat flags**
- This applies **regardless of VIP/Royal status**

The earner in M↔F calls is:
- The woman if she has `earnOnChat = true`
- The man if he has `earnOnChat = true` and woman doesn't
- Avalo (null) if both have `earnOnChat = false`

#### Priority 3: All Other Cases (M↔M, F↔F, Other)
- **The call initiator pays**
- The earner is determined by `earnOnChat` flags:
  - If only one has `earnOnChat = true`, they earn
  - If both have `earnOnChat = true`, the receiver (non-initiator) earns
  - If both have `earnOnChat = false`, Avalo earns (earnerId = null)

### 1.2 Pricing - Voice Calls (per minute)

Pricing is based on the **payer's** subscription status:

| Payer Status | Cost per Minute |
|-------------|-----------------|
| **Royal**   | 6 tokens/min    |
| **VIP**     | 10 tokens/min   |
| **Standard** (no subscription) | 10 tokens/min |

**Revenue Split (always):**
- 80% to earner
- 20% to Avalo

### 1.3 Pricing - Video Calls (per minute)

Pricing is based on the **payer's** subscription status:

| Payer Status | Cost per Minute |
|-------------|-----------------|
| **Royal**   | 10 tokens/min   |
| **VIP**     | 15 tokens/min   |
| **Standard** (no subscription) | 15 tokens/min |

**Revenue Split (always):**
- 80% to earner
- 20% to Avalo

---

## 2. Billing Model

### 2.1 Billing Unit
- **1 minute** is the billing unit
- Any **started minute** is billed as a **full minute** (ceiling)
- Example: A 2 minute 15 second call = 3 minutes billed

### 2.2 Pre-Call Validation
Before starting a call:
- Payer must have **at least enough tokens for 1 minute** of that call type
- If insufficient balance → call cannot start
- User is shown an error with required token amount

### 2.3 During Call Billing
- Tokens are deducted at the end of the call based on actual duration
- If the call continues beyond the payer's balance:
  - Call stops immediately
  - Last started minute is still billed (no partial refunds)

### 2.4 Auto-Disconnect Failsafe
- If no activity/media/heartbeat for **6 minutes** from both sides
- Call ends automatically
- Normal billing applies for the duration before disconnect

---

## 3. Calendar Booking Access Rules

### 3.1 Visibility
- **Calendar slots are visible to ALL users**
- Anyone can see available time slots
- No subscription required to view calendars

### 3.2 Booking Ability
- **Only VIP or Royal subscribers can book calendar slots**
- Non-VIP/non-Royal users:
  - See the calendar and available slots
  - When attempting to book → receive a paywall prompt
  - Must upgrade to VIP or Royal to proceed

**Error Message:**
```
"Calendar bookings require an active VIP or Royal subscription. Please upgrade to continue."
```

### 3.3 Who Can Host Time Slots
- Any user with `earnOnChat = true` can configure themselves as a host
- They can expose calendar slots
- They earn tokens from bookings with the standard split

### 3.4 Booking Monetization (unchanged)

**On Booking:**
- Payer pays the booking price in tokens
- **20% goes to Avalo immediately** (non-refundable platform fee)
- **80% goes to booking escrow**

**After Verified Completion:**
- Escrow is released to host

**On Cancellation:**
- **If host cancels** → 100% escrow refund to payer (Avalo keeps its 20% fee)
- **If payer cancels:**
  - Early (>24h before) → partial refund per existing rules
  - Late (<24h before) → no refund, all escrow to host

---

## 4. Implementation Files

### 4.1 Configuration
**File:** [`app-mobile/config/monetization.ts`](app-mobile/config/monetization.ts)

Added two new configuration objects:

```typescript
export const CALL_CONFIG = {
  VOICE: {
    BASE_COST_VIP: 10,
    BASE_COST_ROYAL: 6,
    BASE_COST_STANDARD: 10,
    AVALO_CUT_PERCENT: 20,
    EARNER_CUT_PERCENT: 80,
  },
  VIDEO: {
    BASE_COST_VIP: 15,
    BASE_COST_ROYAL: 10,
    BASE_COST_STANDARD: 15,
    AVALO_CUT_PERCENT: 20,
    EARNER_CUT_PERCENT: 80,
  },
  AUTO_DISCONNECT_IDLE_MINUTES: 6,
};

export const CALENDAR_CONFIG = {
  // ... existing config ...
  AVALO_FEE_PERCENT: 20,
  EARNER_ESCROW_PERCENT: 80,
  BOOKING_REQUIRES_VIP_OR_ROYAL: true,
};
```

### 4.2 Backend - Call Monetization
**File:** [`functions/src/callMonetization.ts`](functions/src/callMonetization.ts)

**Key Functions:**
- [`determineCallPayerAndEarner()`](functions/src/callMonetization.ts:88) - Reuses chat role logic with call-specific overrides
- [`getCallMinuteCost()`](functions/src/callMonetization.ts:230) - Returns per-minute cost based on payer status
- [`startCall()`](functions/src/callMonetization.ts:243) - Validates balance and creates call session
- [`endCall()`](functions/src/callMonetization.ts:306) - Calculates duration, applies billing and split
- [`autoDisconnectIdleCalls()`](functions/src/callMonetization.ts:428) - Scheduled cleanup for idle calls
- [`checkCallBalance()`](functions/src/callMonetization.ts:474) - Pre-call balance validation

**Integration:**
- Reuses [`getUserContext()`](functions/src/chatMonetization.ts:705) from chatMonetization.ts
- Maintains consistency with chat role resolution
- All transactions logged to Firestore `calls` and `transactions` collections

### 4.3 Frontend - Call Service
**File:** [`app-mobile/services/callService.ts`](app-mobile/services/callService.ts)

**Key Functions:**
- [`checkCallBalance()`](app-mobile/services/callService.ts:52) - Check if user can afford call
- [`startCall()`](app-mobile/services/callService.ts:75) - Initiate call session
- [`updateCallActivity()`](app-mobile/services/callService.ts:91) - Prevent auto-disconnect
- [`endCall()`](app-mobile/services/callService.ts:100) - End and bill call
- [`canInitiateCall()`](app-mobile/services/callService.ts:141) - Pre-flight check
- [`getCallPricingInfo()`](app-mobile/services/callService.ts:175) - Display pricing to user

**UI Integration Points:**
- Call button should call `canInitiateCall()` first
- Display pricing via `getCallPricingInfo()` before starting
- Send activity heartbeats every 2-3 minutes via `updateCallActivity()`
- Handle insufficient balance errors gracefully

### 4.4 Calendar Booking Access Control
**File:** [`functions/src/calendar.ts`](functions/src/calendar.ts:49)

**Updated:** [`bookSlotCallable()`](functions/src/calendar.ts:19) function

Added VIP/Royal check at the start of booking creation:
```typescript
// Check user profile for VIP or Royal status
const hasVIP = bookerProfile.roles?.vip || bookerProfile.vipSubscription?.status === 'active';
const hasRoyal = bookerProfile.roles?.royal || bookerProfile.royalClubTier !== undefined;

if (!hasVIP && !hasRoyal) {
  throw new HttpsError(
    "permission-denied",
    "Calendar bookings require an active VIP or Royal subscription."
  );
}
```

---

## 5. Example Scenarios

### Scenario 1: Heterosexual Voice Call (M→F)
- **Participants:** John (male, Standard) and Sarah (female, earnOnChat=true)
- **Initiator:** John
- **Call Type:** VOICE
- **Payer:** John (man always pays in M↔F)
- **Cost:** 10 tokens/min (John's Standard rate)
- **Duration:** 5 minutes 30 seconds → billed as 6 minutes
- **Total Cost:** 60 tokens
- **Split:** Sarah receives 48 tokens, Avalo receives 12 tokens

### Scenario 2: Heterosexual Video Call (F→M)
- **Participants:** Emma (female, VIP) and Mike (male, earnOnChat=false)
- **Initiator:** Emma (woman initiates)
- **Call Type:** VIDEO
- **Payer:** Mike (man ALWAYS pays in M↔F, even though woman initiated)
- **Cost:** 15 tokens/min (Mike's Standard rate)
- **Duration:** 3 minutes exactly → billed as 3 minutes
- **Total Cost:** 45 tokens
- **Split:** Emma receives 0 (earnOff), Avalo receives 45 tokens

### Scenario 3: Same-Gender Voice Call (M↔M)
- **Participants:** Alex (male, Royal, earnOnChat=true) and Ben (male, VIP, earnOnChat=false)
- **Initiator:** Ben
- **Call Type:** VOICE
- **Payer:** Ben (initiator pays in same-gender)
- **Cost:** 10 tokens/min (Ben's VIP rate)
- **Duration:** 8 minutes 5 seconds → billed as 9 minutes
- **Total Cost:** 90 tokens
- **Split:** Alex receives 72 tokens, Avalo receives 18 tokens

### Scenario 4: Calendar Booking Attempt (Non-VIP)
- **User:** Chris (Standard user, no VIP/Royal)
- **Action:** Attempts to book a calendar slot
- **Result:** ❌ **Blocked with error:**
  ```
  "Calendar bookings require an active VIP or Royal subscription.
   Please upgrade to continue."
  ```
- **UI:** Show paywall/upgrade prompt

### Scenario 5: Calendar Booking Success (Royal User)
- **User:** Diana (Royal member)
- **Action:** Books 1-hour slot with creator for 500 tokens
- **Result:** ✅ **Success**
- **Immediate:** 100 tokens to Avalo (20% platform fee, non-refundable)
- **Escrow:** 400 tokens held until meeting verified
- **After Verification:** 400 tokens released to creator

---

## 6. Data Models

### Call Session Document
**Collection:** `calls/{callId}`

```typescript
{
  callId: string;
  callType: 'VOICE' | 'VIDEO';
  payerId: string;
  earnerId: string | null;  // null = Avalo earns
  pricePerMinute: number;
  state: 'ACTIVE' | 'ENDED';
  startedAt: Timestamp;
  endedAt?: Timestamp;
  durationMinutes?: number;
  totalTokens?: number;
  lastActivityAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Transaction Types
New transaction types added:
- `call_earning` - Tokens earned by earner from call
- `call_charge` - Tokens charged to payer for call
- `call_fee` - Avalo platform fee from call

---

## 7. Testing Checklist

### Call Monetization Tests
- [ ] Heterosexual M→F: Man pays (woman initiates)
- [ ] Heterosexual F→M: Man pays (man initiates)
- [ ] Same-gender M↔M: Initiator pays
- [ ] Same-gender F↔F: Initiator pays
- [ ] Royal payer: Correct discounted rate applied
- [ ] VIP payer: Correct VIP rate applied
- [ ] Standard payer: Correct standard rate applied
- [ ] Insufficient balance: Call blocked with clear error
- [ ] Call duration ceiling: 2min 30sec = 3min billed
- [ ] Auto-disconnect: 6min idle triggers automatic end
- [ ] Revenue split: 80/20 correctly applied
- [ ] Influencer override: Works for calls like chat

### Calendar Access Tests
- [ ] Standard user: Can view calendar
- [ ] Standard user: Blocked from booking with error
- [ ] VIP user: Can book successfully
- [ ] Royal user: Can book successfully
- [ ] UI: Paywall shown to non-VIP/Royal users
- [ ] Booking flow: 20% immediate fee, 80% escrow
- [ ] Host cancellation: Full escrow refund
- [ ] Guest cancellation: Partial/no refund per rules

---

## 8. Migration Notes

### Backward Compatibility
✅ **All existing chat monetization logic is UNCHANGED**
- Chat uses existing 7/11 words-per-token system
- Free pool logic untouched
- 48h auto-close preserved
- Escrow and deposit flows identical

### Breaking Changes
❌ **None** - This is a pure addition

### Deprecated Features
- Old per-5-seconds call tariffs (if any existed) are replaced by per-minute pricing

---

## 9. Future Enhancements

Potential improvements for future releases:

1. **Call Quality Tiers**
   - HD video at premium rate
   - Standard video at current rate

2. **Call Packages**
   - Bulk minute purchases at discounted rates
   - Subscription bundles (e.g., 100 min/month)

3. **Dynamic Pricing**
   - Peak/off-peak hours
   - Surge pricing for high-demand creators

4. **Call Recording**
   - Optional recording feature
   - Additional fee for recorded calls

5. **Group Calls**
   - Multi-party call billing
   - Split or per-participant pricing

---

## 10. Support & Troubleshooting

### Common Issues

**Issue:** "Insufficient tokens" error
- **Cause:** User balance < 1 minute cost
- **Solution:** Prompt user to purchase tokens

**Issue:** Call ends abruptly
- **Cause:** Payer ran out of tokens mid-call
- **Solution:** Show low-balance warning during call

**Issue:** Calendar booking blocked
- **Cause:** User lacks VIP/Royal subscription
- **Solution:** Show upgrade screen with subscription options

**Issue:** Auto-disconnect triggered
- **Cause:** 6 minutes of inactivity
- **Solution:** Remind users to keep app active or send heartbeats

---

## 11. Compliance & Legal

### Terms of Service
All users must acknowledge:
- Payment is for time and social companionship only
- No escort or sex work services
- Violation results in permanent ban

### Regional Compliance
- Calendar/meeting features comply with local laws
- Platform maintains zero-tolerance for illegal activity
- All transactions logged for audit compliance

---

## 12. Conclusion

The call monetization system is now fully integrated with:
- ✅ Voice and video call pricing based on payer status
- ✅ Heterosexual rule: Man always pays in M↔F calls
- ✅ 80/20 revenue split (earner/Avalo)
- ✅ Per-minute billing with ceiling
- ✅ Calendar booking restricted to VIP/Royal
- ✅ All existing chat monetization preserved
- ✅ Consistent role resolution across chat and calls

**Status:** Ready for testing and deployment

---

**Document Version:** 1.0  
**Last Updated:** 2025-11-19  
**Maintained By:** Kilo Code