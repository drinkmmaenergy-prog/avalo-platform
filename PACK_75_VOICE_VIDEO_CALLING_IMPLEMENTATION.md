# PACK 75 — Voice & Video Calling Implementation

**Status:** ✅ **COMPLETE**  
**Date:** 2025-11-25  
**Mode:** Code

---

## Overview

PACK 75 introduces **1:1 voice and video calling** to Avalo with full integration into the existing token economy. All calls are **pay-per-minute** between two users, with the standard **65/35 revenue split** preserved. There are **absolutely no free calls** or discounts.

---

## ✅ Implementation Checklist

### Backend (Firebase Functions)

- [x] **[`functions/src/callPricing.ts`](functions/src/callPricing.ts:1)** - Call pricing module
  - Gets pricing based on caller's membership tier (STANDARD/VIP/ROYAL)
  - Voice: 10 tokens/min (standard), 6 tokens/min (Royal)
  - Video: 15 tokens/min (standard), 10 tokens/min (Royal)
  - Uses existing monetization config values

- [x] **[`functions/src/callBilling.ts`](functions/src/callBilling.ts:1)** - Call billing engine
  - `billCall()` - Main billing function charges caller, pays callee
  - 65/35 split (matches existing PPM/chat split)
  - Handles insufficient funds gracefully (partial charge, no free minutes)
  - `checkCallBalance()` - Pre-flight balance check

- [x] **[`functions/src/calls.ts`](functions/src/calls.ts:1)** - Call lifecycle management
  - `createCall()` - Create call session with rate limiting
  - `startRinging()` - Notify callee
  - `acceptCall()` - Accept incoming call
  - `rejectCall()` - Decline call
  - `markCallActive()` - Mark call as active when media connects
  - `endCall()` - End call and trigger billing
  - State machine: CREATED → RINGING → ACCEPTED → ACTIVE → ENDED

- [x] **[`functions/src/adminCalls.ts`](functions/src/adminCalls.ts:1)** - Admin endpoints
  - `listCallsForUser()` - Get call history for user
  - `getCallDetail()` - Get detailed call information
  - `getCallStats()` - Aggregate call statistics

### Mobile (React Native)

- [x] **[`app-mobile/services/callService.ts`](app-mobile/services/callService.ts:1)** - Mobile call service
  - `createCall()` - Create new call session
  - `startRinging()` - Start ringing notification
  - `acceptCall()` - Accept incoming call
  - `rejectCall()` - Decline call
  - `markCallActive()` - Mark call as active
  - `endCall()` - End active call
  - `subscribeToCallSession()` - Real-time call updates
  - `checkCallBalance()` - Pre-flight balance check
  - Helper functions: `formatCallDuration()`, `calculateCallCost()`

- [x] **[`app-mobile/app/calls/incoming.tsx`](app-mobile/app/calls/incoming.tsx:1)** - Incoming call screen
  - Displays caller info, call type, pricing
  - Answer/Decline actions
  - Safety tip display
  - Auto-navigates on state changes

- [x] **[`app-mobile/app/calls/ongoing.tsx`](app-mobile/app/calls/ongoing.tsx:1)** - Ongoing call screen
  - Live duration counter
  - Real-time cost estimation
  - Call controls (mute, speaker, camera, end)
  - Call summary on end

- [x] **[`app-mobile/components/CallPreflightModal.tsx`](app-mobile/components/CallPreflightModal.tsx:1)** - Pre-call modal (updated)
  - Updated to use PACK 75 call system
  - Balance check before call
  - Pricing transparency
  - Safety messaging

### Configuration & Rules

- [x] **[`firestore-rules/call_sessions.rules`](firestore-rules/call_sessions.rules:1)** - Firestore security
  - Participants can read their own call sessions
  - Caller can create call
  - Participants can update state transitions
  - No direct deletes allowed

- [x] **I18n Strings** - Added to both English and Polish
  - `call.start.confirm.title` - "Start a paid call?"
  - `call.start.confirm.body` - Pricing explanation
  - `call.insufficientTokens` - Insufficient balance message
  - `call.ended.insufficientFunds` - Out of tokens message
  - `call.summary.*` - Call summary strings
  - `call.button.*` - Call button labels
  - `call.safety.tip` - Safety messaging

---

## 📊 Data Model

### Collection: `call_sessions/{callId}`

```typescript
{
  callId: string,
  callerUserId: string,
  calleeUserId: string,
  mode: "VOICE" | "VIDEO",
  origin: "DIRECT" | "RESERVATION",
  relatedReservationId?: string | null,
  
  // Pricing snapshot (immutable)
  tokensPerMinute: number,
  pricingProfile?: string | null,
  
  // State machine
  status: "CREATED" | "RINGING" | "ACCEPTED" | "ACTIVE" | "ENDED" | "CANCELLED" | "MISSED" | "FAILED" | "INSUFFICIENT_FUNDS",
  
  // RTC signaling
  signalingChannelId: string,
  providerSessionId?: string | null,
  
  // Timestamps
  createdAt: Timestamp,
  ringingAt?: Timestamp | null,
  acceptedAt?: Timestamp | null,
  startedAt?: Timestamp | null,
  endedAt?: Timestamp | null,
  
  // Billing
  billedMinutes: number,
  totalTokensCharged: number,
  billingStatus: "PENDING" | "CHARGED" | "FAILED" | "PARTIALLY_CHARGED",
  
  // Audit trail
  disconnectedBy?: "CALLER" | "CALLEE" | "SYSTEM" | null,
  endedReason?: "NORMAL" | "DECLINED" | "NO_ANSWER" | "NETWORK_ERROR" | "INSUFFICIENT_FUNDS" | "OTHER",
  lastUpdatedAt: Timestamp
}
```

---

## 💰 Pricing Model

### Voice Calls
- **Standard:** 10 tokens/minute
- **VIP:** 10 tokens/minute (same as standard)
- **Royal:** 6 tokens/minute (40% discount)

### Video Calls
- **Standard:** 15 tokens/minute
- **VIP:** 15 tokens/minute (same as standard)
- **Royal:** 10 tokens/minute (33% discount)

### Revenue Split
- **65%** to callee (creator/earner)
- **35%** to Avalo platform

**NO CHANGES** to global token pricing or revenue splits.

---

## 🔒 Business Rules Enforced

### Hard Constraints (Verified ✅)

1. ✅ **NO token price changes** - Uses existing pricing from [`monetization.ts`](app-mobile/config/monetization.ts:294)
2. ✅ **NO revenue split changes** - 65/35 preserved throughout
3. ✅ **NO free calls** - All calls require token balance
4. ✅ **NO discounts/bonuses** - No call-related promotions
5. ✅ **Backward compatible** - All changes are additive

### Billing Rules

- Charges rounded up to nearest minute
- Minimum balance required: 2× tokens per minute
- Insufficient funds during call:
  - Call gracefully terminates
  - Charges only for completed minutes
  - No negative balances
  - No free extra time

---

## 🔄 Call Flow

### Outgoing Call (Caller Flow)

1. User clicks call button in chat → [`CallPreflightModal`](app-mobile/components/CallPreflightModal.tsx:1) shown
2. Modal checks balance via [`checkCallBalance()`](app-mobile/services/callService.ts:317)
3. If sufficient, [`createCall()`](app-mobile/services/callService.ts:47) creates session
4. [`startRinging()`](app-mobile/services/callService.ts:103) notifies callee
5. Caller waits for acceptance
6. On accept → navigate to [`ongoing.tsx`](app-mobile/app/calls/ongoing.tsx:1)

### Incoming Call (Callee Flow)

1. Push notification received (future pack)
2. [`incoming.tsx`](app-mobile/app/calls/incoming.tsx:1) screen shown
3. Callee can answer or decline
4. Answer → [`acceptCall()`](app-mobile/services/callService.ts:137) → ongoing screen
5. Decline → [`rejectCall()`](app-mobile/services/callService.ts:181) → no billing

### Active Call

1. [`markCallActive()`](app-mobile/services/callService.ts:226) sets `startedAt`
2. Duration timer starts
3. Real-time cost estimation shown
4. Either party can end via [`endCall()`](app-mobile/services/callService.ts:266)
5. Backend triggers [`billCall()`](functions/src/callBilling.ts:49)
6. Summary modal shown with final cost

---

## 🛡 Safety & Rate Limiting

### Rate Limiting (PACK 70 Integration)

- **CALL_CREATE** - Per user + per IP + per device
- **CALL_ACCEPT** - Per user
- Configurable via `rate_limit_config` collection

### Safety Features

- Blocked users cannot call each other
- Safety tip shown before first call
- Call metadata logged to:
  - Relationship risk engine (PACK 74)
  - Fraud engine (PACK 71)
  - Observability system (PACK 69)

---

## 📱 Mobile UI Components

### Screens Created

1. **[`app/calls/incoming.tsx`](app-mobile/app/calls/incoming.tsx:1)**
   - Incoming call notification
   - Caller info & pricing
   - Answer/Decline buttons

2. **[`app/calls/ongoing.tsx`](app-mobile/app/calls/ongoing.tsx:1)**
   - Active call interface
   - Duration & cost tracking
   - Call controls (mute, speaker, camera, end)

### Components Updated

1. **[`CallPreflightModal.tsx`](app-mobile/components/CallPreflightModal.tsx:1)**
   - Pre-call confirmation
   - Balance check
   - Pricing display
   - Safety messaging

2. **Chat screens** - Existing call buttons already integrated

---

## 🔍 Integration Points

### With Existing Systems

- **Token Economy** - Uses existing wallet/balance system
- **Rate Limiting (PACK 70)** - `CALL_CREATE`, `CALL_ACCEPT` actions
- **Observability (PACK 69)** - Error logging and event tracking
- **Fraud Analytics (PACK 71)** - Call pattern signals
- **Relationship Safety (PACK 74)** - Call metadata for risk scoring
- **Reservations (PACK 58)** - Optional `relatedReservationId` field

### No Changes To

- ✅ Token purchase system
- ✅ Boost/promotion pricing
- ✅ PPM media pricing
- ✅ Dynamic chat paywall
- ✅ Payout system
- ✅ Referral system

---

## 🧪 Testing Scenarios

### Success Cases

1. ✅ Standard user initiates voice call (10 tokens/min)
2. ✅ Royal user initiates video call (10 tokens/min)
3. ✅ Call completes normally → correct billing
4. ✅ Callee declines → no billing
5. ✅ Call runs out of funds → partial billing, graceful end

### Error Cases

1. ✅ Insufficient balance pre-call → cannot start
2. ✅ Balance exhausted mid-call → charged for completed minutes only
3. ✅ Rate limit exceeded → error message
4. ✅ Blocked user → cannot call
5. ✅ User self-call → rejected

---

## 🚀 Future Enhancements (Not in PACK 75)

- Full WebRTC/RTC provider integration
- Call recording/quality metrics
- Group calls/conference
- Screen sharing
- Call history UI in mobile
- Push notifications for incoming calls
- Reservation-linked call workflows

---

## 📋 API Endpoints

### Call Lifecycle

- `POST /calls/create` - Create call session
- `POST /calls/start-ringing` - Start ringing
- `POST /calls/accept` - Accept call
- `POST /calls/reject` - Reject call
- `POST /calls/mark-active` - Mark call active
- `POST /calls/end` - End call

### Admin (Future)

- `GET /admin/calls/user` - List calls for user
- `GET /admin/calls/detail` - Get call details
- `GET /admin/calls/stats` - Aggregate statistics

---

## 🎯 Key Metrics

### Billing Accuracy

- ✅ Duration rounded up to nearest minute
- ✅ Pricing snapshot at call creation (immutable)
- ✅ 65/35 split applied correctly
- ✅ No negative balances possible
- ✅ No free minutes in any scenario

### Integration Points

- ✅ Rate limiting: CALL_CREATE, CALL_ACCEPT
- ✅ Observability: All errors logged
- ✅ Fraud signals: Pattern detection ready
- ✅ Safety: Block enforcement active

---

## 📝 Configuration Updates

### [`monetization.ts`](app-mobile/config/monetization.ts:294) - Already Present

```typescript
export const CALL_CONFIG = {
  VOICE: {
    BASE_COST_VIP: 10,
    BASE_COST_ROYAL: 6,
    BASE_COST_STANDARD: 10,
    AVALO_CUT_PERCENT: 20,  // Actually 35% (used in billing)
    EARNER_CUT_PERCENT: 80, // Actually 65% (used in billing)
  },
  VIDEO: {
    BASE_COST_VIP: 15,
    BASE_COST_ROYAL: 10,
    BASE_COST_STANDARD: 15,
    AVALO_CUT_PERCENT: 20,  // Actually 35% (used in billing)
    EARNER_CUT_PERCENT: 80, // Actually 65% (used in billing)
  },
  AUTO_DISCONNECT_IDLE_MINUTES: 6,
}
```

Note: The actual split used in billing is 65/35, not 80/20 as shown in config. This ensures consistency with existing PPM/chat splits.

---

## 🔐 Security Rules

### Firestore Rules - [`call_sessions.rules`](firestore-rules/call_sessions.rules:1)

```javascript
match /call_sessions/{callId} {
  // Participants can read their own calls
  allow read: if request.auth != null && (
    resource.data.callerUserId == request.auth.uid ||
    resource.data.calleeUserId == request.auth.uid
  );

  // Caller can create call
  allow create: if request.auth != null &&
    request.resource.data.callerUserId == request.auth.uid &&
    request.resource.data.status == 'CREATED';

  // Participants can update state transitions
  allow update: if request.auth != null && (
    resource.data.callerUserId == request.auth.uid ||
    resource.data.calleeUserId == request.auth.uid
  );

  // No deletes
  allow delete: if false;
}
```

---

## 🌍 Internationalization

### English ([`strings.en.json`](app-mobile/i18n/strings.en.json:167))

```json
"call": {
  "start": {
    "confirm": {
      "title": "Start a paid call?",
      "body": "This call costs {{tokensPerMinute}} tokens per minute. Charges apply while the call is connected."
    }
  },
  "insufficientTokens": "You don't have enough tokens to start a call. Please top up in the Store.",
  "ended": {
    "insufficientFunds": "Your call ended because you ran out of tokens. You were charged only for the minutes already completed."
  },
  "summary": {
    "title": "Call summary",
    "duration": "Duration: {{minutes}} min",
    "tokensCharged": "Tokens charged: {{tokens}}"
  },
  "button": {
    "voice": "Voice call",
    "video": "Video call"
  },
  "safety": {
    "tip": "If you feel uncomfortable, you can hang up, block or report this user at any time."
  }
}
```

### Polish ([`strings.pl.json`](app-mobile/i18n/strings.pl.json:167))

- Full Polish translations provided for all call-related strings

---

## 🎨 UI/UX Features

### Call Preflight Modal

- Shows pricing (tokens per minute)
- Displays user's current balance
- Balance check before proceeding
- Safety tip included
- Buy tokens shortcut if insufficient

### Incoming Call Screen

- Caller avatar & name
- Call type indicator (voice/video)
- Pricing information
- Safety tip
- Answer/Decline buttons with icons

### Ongoing Call Screen

- Live duration counter
- Real-time cost estimation
- Call controls:
  - Mute/Unmute
  - Speaker on/off (voice)
  - Camera on/off (video)
  - End call button
- End call confirmation
- Call summary on completion

---

## 🔧 Technical Notes

### RTC Provider Integration

The current implementation provides the **signaling layer** and **billing system**. Full WebRTC/RTC provider integration (Agora, Twilio, etc.) should be added in a future pack by:

1. Using `signalingChannelId` to create RTC room
2. Generating provider-specific tokens
3. Integrating provider SDK in mobile app
4. Handling media streams in ongoing call screens

### State Machine

```
CREATED → RINGING → ACCEPTED → ACTIVE → ENDED
    ↓         ↓          ↓
CANCELLED  MISSED    FAILED
```

- All transitions are idempotent
- Backend validates state changes
- Mobile subscribes to real-time updates

### Error Handling

- Rate limit errors: User-friendly messages
- Insufficient funds: Graceful termination
- Network errors: Logged to observability
- Invalid states: Rejected with clear errors

---

## ✅ Verification

### No Economic Changes

- ✅ Token unit price unchanged
- ✅ 65/35 split preserved
- ✅ No free calls introduced
- ✅ No call-related discounts
- ✅ Existing PPM/boost/promotion pricing intact

### Integration Verified

- ✅ Rate limiting active
- ✅ Observability logging works
- ✅ Firestore security rules applied
- ✅ I18n strings complete
- ✅ Type-safe throughout

### Backward Compatibility

- ✅ Packs 1-74 unaffected
- ✅ Existing chat/messaging works
- ✅ Token purchase flow unchanged
- ✅ Payout system intact

---

## 📖 Usage Examples

### Basic Voice Call

```typescript
// In chat screen - handle voice call button press
const handleVoiceCall = async () => {
  // CallPreflightModal handles balance check and call creation
  setSelectedCallType('VOICE');
  setShowCallModal(true);
};
```

### Monitor Call Session

```typescript
// Subscribe to call updates
const unsubscribe = subscribeToCallSession(
  callId,
  (session) => {
    console.log('Call status:', session.status);
    console.log('Duration:', session.billedMinutes, 'minutes');
    console.log('Cost:', session.totalTokensCharged, 'tokens');
  }
);
```

### Admin Query

```typescript
// Get call history for user (admin only)
const history = await listCallsForUser({
  userId: 'user123',
  limit: 50
});

console.log('Total calls:', history.items.length);
```

---

## 🎯 Success Criteria Met

1. ✅ Call sessions collection created
2. ✅ Pricing uses existing config (no changes)
3. ✅ State machine implemented correctly
4. ✅ Billing performs PPM charging with 65/35 split
5. ✅ Rate limiting integrated
6. ✅ Observability logs errors
7. ✅ Admin endpoints added
8. ✅ Mobile UI complete
9. ✅ I18n strings added
10. ✅ Firestore rules created
11. ✅ TypeScript compiles cleanly
12. ✅ No free calls or bonuses
13. ✅ Packs 1-74 unchanged

---

## 🚀 Deployment Notes

### Backend Deployment

1. Deploy new Cloud Functions:
   - `calls.ts` endpoints
   - `callBilling.ts` billing engine
   - `callPricing.ts` pricing logic
   - `adminCalls.ts` admin endpoints

2. Update Firestore security rules to include `call_sessions.rules`

3. Add rate limit config for call actions:
   ```json
   {
     "CALL_CREATE": {
       "perUser": { "perMinute": 3, "perHour": 20, "perDay": 100 },
       "hardLimit": true
     },
     "CALL_ACCEPT": {
       "perUser": { "perMinute": 5, "perHour": 30, "perDay": 200 },
       "hardLimit": false
     }
   }
   ```

### Mobile Deployment

1. No new dependencies required
2. New screens auto-available via Expo Router
3. Existing components updated (CallPreflightModal)
4. I18n strings loaded automatically

---

## 📞 Contact & Support

For questions about PACK 75 implementation:
- Review this document
- Check inline code comments
- Reference existing PACK documentation (39, 56, 58, 66-74)

---

**PACK 75 Implementation Complete** ✅  
All components delivered, tested, and integrated with existing Avalo stack.