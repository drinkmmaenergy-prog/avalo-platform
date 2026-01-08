# AVALO_FUNCTIONS_API_SPEC_v1.md

Spec for Firebase HTTPS Callable + HTTP endpoints. All responses JSON `{ ok:boolean, data?, error? }`.

## Naming
Region: `europe-west3`. Runtime: Node 20. Prefix: `/v1/*` for HTTP. Callable uses camelCase.

---

## Auth & Headers
- Require Firebase ID token for all endpoints unless noted.
- For HTTP: `Authorization: Bearer <ID_TOKEN>`.
- For Callable: context.auth required.

---

## Error Codes
`INVALID_ARGUMENT`, `UNAUTHENTICATED`, `PERMISSION_DENIED`, `FAILED_PRECONDITION`, `NOT_FOUND`, `ALREADY_EXISTS`, `RESOURCE_EXHAUSTED`, `INTERNAL`.

---

## Chat
### `startChatCallable`
Start paid chat after 3 free messages.
- **Input**: `{ receiverUid:string }`
- **Rules**:
  - Create `chats/{chatId}` if not exists.
  - Add `deposit: { amount:100, fee:35, escrow:65, paidBy:senderUid }`.
  - Status `active`, timers set for expiry 48h.
- **Output**: `{ chatId, deposit:{amount,fee,escrow} }`

### `sendMessageCallable`
Bill tokens per message. Moderation first.
- **Input**: `{ chatId:string, text?:string, media?:{type:'photo'|'voice', url?:string, durationSec?:number} }`
- **Rules**:
  - If `text`: tokens = `ceil(words/11)` or `ceil(words/7)` for Royal earner.
  - Voice: `ceil(durationSec/30)` tokens.
  - Deduct from `escrow`, if `<20` and `autoReload=true` → add 100.
  - Save message, update billing counters.
- **Output**: `{ messageId, tokensCharged }`

### `closeChatCallable`
Manual close by either user.
- **Input**: `{ chatId }`
- **Rules**: refund UNUSED escrow to payer; platform fee untouched.
- **Output**: `{ refundedTokens }`

### `refundByEarnerCallable`
Earner voluntary refund after conversation or booking.
- **Input**: `{ chatId }`
- **Rules**: Refund remaining escrow 100%; platform fee not refunded.
- **Output**: `{ refundedTokens }`

### `expireStaleChats` (CRON)
- Close chats after 48h inactivity; refund unused escrow.

### `enqueueRoyalCallable`
- **Input**: `{ chatId }`
- Mark message priority and bypass queue if payer is Royal male.

---

## Calendar
### `bookSlotCallable`
- **Input**: `{ creatorUid, start:ISO, end:ISO, priceTokens:number, meetingType:string, location:{type:'public'|'hotel'|'private', name?:string} , acknowledgments:{socialOnly:boolean, noEscort:boolean, noSexWork:boolean, paymentForTime:boolean, banAware:boolean} }`
- **Rules**:
  - Verify acknowledgments.
  - Charge `priceTokens` up-front.
  - `payment.platformFeeTokens = ceil(priceTokens*0.20)`
  - `escrowTokens = priceTokens - platformFeeTokens`
  - Status `pending`.
- **Output**: `{ bookingId, priceTokens, platformFeeTokens, escrowTokens }`

### `confirmBookingCallable`
- **Input**: `{ bookingId }` (creator)
- **Result**: status `confirmed`.

### `cancelBookingCallable`
- **Input**: `{ bookingId, by:'creator'|'booker' }`
- **Rules**:
  - `by='creator'` before start → **full refund of escrow** to booker; platform fee kept by Avalo.
  - `by='booker'` ≥24h → refund 50% of escrow; `<24h` → 0%. Platform fee never refunded.
- **Output**: `{ refundTokens }`

### `verifyMeetingCallable`
- **Input**: `{ bookingId, method:'gps'|'qr'|'selfie' }`
- **Rules**: if verified, release escrow 80% to creator.

### `calendarSweep` (CRON)
- Auto-complete or mark no-show per policy.

---

## Payments
### `stripeWebhook` (HTTP)
- Raw body verify. Handle `checkout.session.completed`, `payment_intent.succeeded`, `customer.subscription.*`.
- Map `price.product` to token pack or subscription tier.
- For token pack: credit tokens to `users/{uid}.wallet.balance` and write `transactions`.
- For subscription: set roles `vip/royal/aiBasic/aiPlus/aiPremium`.

### `creditTokens` (Callable)
- **Input**: `{ uid, tokens:number, source:string }` (admin-only RBAC).

### `requestPayout` (Callable)
- **Input**: `{ method:'bank'|'paypal'|'crypto', amountTokens:number, details:{} }`
- **Rules**: ensure `amountTokens <= earned`, min thresholds, convert at 0.20 PLN per token.

---

## Instagram
### `linkInstagram` (HTTP)
- Start OAuth (redirect to FB/IG).

### `instagramCallback` (HTTP)
- Exchange code, fetch profile, followers.
- If `followers >= 1000` → grant `royal` role.

### `syncInstagram` (Callable)
- Refresh followers and validity.

---

## Moderation
### `moderateContent` (Callable)
- **Input**: `{ kind:'text'|'image', contentRef:string }`
- Check banned phrases and policy.
- **Output**: `{ allowed:boolean, reasons?:string[] }`

---

## Config
### `getConfig` (Callable)
- Read Remote Config for client thresholds, ads flags, words/token, etc.

---

## Admin
- Role in custom claims. `admin`, `moderator`, `finance`, `legal`.
- HTTP endpoints require session cookie + RBAC.
