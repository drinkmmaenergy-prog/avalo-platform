# AVALO — FULL FINANCIAL LOGIC AUDIT

**Audit Date:** 2026-03-01  
**Scope:** Settlement logic, token economy, revenue splits, payout flow, Stripe integration, security  
**Mode:** Read-only analysis — no code modifications  

---

## SECTION 1 — WORD COUNT LOGIC

### Files Involved

| File | Description |
|---|---|
| [`chats.ts`](functions/src/chats.ts:63) | Primary chat callable — `countWords()` at line 63 |
| [`chatMonetization.ts`](functions/src/chatMonetization.ts:406) | Monetization billing — `countBillableWords()` at line 406 |
| [`chatSystemNextGen.ts`](functions/src/chatSystemNextGen.ts:206) | Next-gen chat — `countWords()` at line 206 |
| [`pack253-royal-benefits.ts`](functions/src/pack253-royal-benefits.ts:24) | Royal benefits — word count at line 24 |
| [`pack273ChatEngine.ts`](functions/src/pack273ChatEngine.ts:482) | PACK 273 chat engine — `countBillableWords()` at line 482 |
| [`pack279-ai-chat-runtime.ts`](functions/src/pack279-ai-chat-runtime.ts:98) | AI chat — `countWords()` at line 98 |
| [`pack285FreeWindowFunnel.ts`](functions/src/pack285FreeWindowFunnel.ts:573) | Free window funnel — `countWords()` at line 573 |
| [`pack452-premium-burn-engine.ts`](functions/src/pack452-premium-burn-engine.ts:110) | Premium burn — `countBillableWords()` at line 110 |
| [`aiGenerationService.ts`](functions/src/aiGenerationService.ts:169) | AI generation — `countWords()` at line 169 |

### Functions Involved

1. **`countWords(text)`** — in [`chats.ts:63`](functions/src/chats.ts:63): Removes URLs via regex, removes emoji Unicode ranges, splits by `\s+`, filters Boolean, counts remaining.
2. **`countBillableWords(text)`** — in [`chatMonetization.ts:406`](functions/src/chatMonetization.ts:406): Removes URLs, removes emojis, splits by `\s+`, filters `w.length > 0`.
3. **`calculateTextCost(message, wordRatio)`** — in [`chatSystemNextGen.ts:213`](functions/src/chatSystemNextGen.ts:213): `Math.ceil(wordCount / wordRatio)`.
4. **`calculateTokens(wordCount, isRoyalEarner)`** — in [`chats.ts:79`](functions/src/chats.ts:79): `Math.ceil(wordCount / rate)`.

### Mathematical Formula

- **Standard Creator:** `tokens = Math.ceil(wordCount / 11)`
- **Royal Creator:** `tokens = Math.ceil(wordCount / 7)`

### Whether `Math.ceil` Is Used

**YES** — `Math.ceil` is used in:
- [`chats.ts:86`](functions/src/chats.ts:86)
- [`chatSystemNextGen.ts:215`](functions/src/chatSystemNextGen.ts:215)
- [`pack253-royal-benefits.ts:28`](functions/src/pack253-royal-benefits.ts:28)
- [`pack273ChatEngine.ts:489`](functions/src/pack273ChatEngine.ts:489)
- [`pack279-ai-chat-runtime.ts:401`](functions/src/pack279-ai-chat-runtime.ts:401)
- [`pack452-premium-burn-engine.ts:114`](functions/src/pack452-premium-burn-engine.ts:114)
- [`aiGenerationService.ts:279`](functions/src/aiGenerationService.ts:279)

**EXCEPTION:** In [`chatMonetization.ts:373`](functions/src/chatMonetization.ts:373), `Math.round` is used instead of `Math.ceil`:
```
const tokensCost = Math.round(wordCount / roles.wordsPerToken);
```
This is an **inconsistency** — all other implementations use `Math.ceil`.

### Whether Logic Differs for Standard / Royal Chat

**YES.** Constants defined in [`config.ts:18-19`](functions/src/config.ts:18):
- `WORDS_PER_TOKEN_STANDARD = 11`
- `WORDS_PER_TOKEN_ROYAL_EARNER = 7`

Also duplicated as local constants in:
- [`chatMonetization.ts:93-94`](functions/src/chatMonetization.ts:93)
- [`pack253-royal-types.ts:174`](functions/src/pack253-royal-types.ts:174) (`ROYAL_BENEFITS.EARNINGS_RATIO = 7`)
- [`pack452-premium-burn-engine.ts:42-46`](functions/src/pack452-premium-burn-engine.ts:42)

Royal status is determined by whether the earner has `isRoyalMember` / `roles.royal` flag.

---

## SECTION 2 — TOKEN DEDUCTION FLOW

### Step-by-Step Flow (Primary Path — `chats.ts`)

1. **User calls** [`sendMessageCallable`](functions/src/chats.ts:226) (`onCall`)
2. **Auth check** — `request.auth.uid`
3. **Moderation check** — `containsBannedTerms(text)` at [`chats.ts:243`](functions/src/chats.ts:243)
4. **Chat lookup** — Firestore `chats/{chatId}`
5. **Word count** — [`countWords(text)`](functions/src/chats.ts:271) at line 271
6. **Royal check** — reads user profile, checks `sender.roles?.royal && chat.roles.earner === senderUid`
7. **Token calculation** — [`calculateTokens(wordCount, isRoyalEarner)`](functions/src/chats.ts:279) at line 279
8. **Balance check** — `chat.billing.currentBalance < tokensCharged` at [`chats.ts:288`](functions/src/chats.ts:288)
9. **Firestore transaction** — [`db.runTransaction()`](functions/src/chats.ts:308) at line 308:
   - Updates `billing.currentBalance` by `increment(-tokensCharged)` (escrow deduction)
   - Credits earner wallet: `balance: increment(tokensCharged)` at [`chats.ts:328`](functions/src/chats.ts:328)
   - Updates payer `pending: increment(-tokensCharged)` at [`chats.ts:341`](functions/src/chats.ts:341)
   - Saves message document with `wordCount` and `tokensCharged`

### Step-by-Step Flow (Secondary Path — `chatMonetization.ts`)

1. **Caller invokes** [`processMessageBilling(chatId, senderId, messageText)`](functions/src/chatMonetization.ts:478)
2. **Content moderation** (CSAM shield + content moderation engine)
3. **Chat lookup** from Firestore
4. **PACK 452 Premium burn check** — if premium/exclusive state, uses multiplied burn
5. **Free message check** — decrements `freeMessagesRemaining`
6. **Transition to paid** — sets chat state to `AWAITING_DEPOSIT` when free messages exhausted
7. **Billing calculation** — [`calculateMessageBilling()`](functions/src/chatMonetization.ts:353)
8. **Escrow deduction** — updates `escrowBalance` by `increment(-billing.tokensCost)` at line 704 (continued from line 700)

### Step-by-Step Flow (Tertiary Path — `pack277-wallet-service.ts`)

1. **Caller invokes** [`spendTokens(request)`](functions/src/pack277-wallet-service.ts:154)
2. **Balance check** — reads `tokensBalance - reservedTokens` vs `amountTokens` at [`pack277-wallet-service.ts:200`](functions/src/pack277-wallet-service.ts:200)
3. **Atomic transaction** — `db.runTransaction()` at line 192
4. **Deduction** — `tokensBalance: afterBalance` (direct set) at line 209
5. **Revenue split** — context-based or legacy split
6. **Creator credit** — `tokensBalance + creatorEarned` at line 230
7. **Platform revenue** — `platformRevenue.total` incremented at line 256
8. **Transaction record** — written to `walletTransactions` collection at line 140

### Exact Places Where Tokens Are Deducted

| Location | Mechanism | Collection |
|---|---|---|
| [`chats.ts:311`](functions/src/chats.ts:311) | `billing.currentBalance: increment(-tokensCharged)` | `chats/{chatId}` (escrow) |
| [`chats.ts:145`](functions/src/chats.ts:145) | `balance: increment(-CHAT_INITIAL_DEPOSIT_TOKENS)` | `users/{uid}/wallet/current` (deposit) |
| [`pack277-wallet-service.ts:209`](functions/src/pack277-wallet-service.ts:209) | `tokensBalance: afterBalance` | `wallets/{userId}` |
| [`payments.ts:181`](functions/src/payments.ts:181) | `purchased: increment(pack.tokens)` | `users/{uid}/wallet/current` (credit) |
| [`paymentsComplete.ts:448`](functions/src/paymentsComplete.ts:448) | `balance: FieldValue.increment(tokens)` | `users/{uid}/wallet/main` (credit) |

---

## SECTION 3 — REVENUE SPLIT 65/35

### Where Split Is Calculated

| File | Line | Constant/Function |
|---|---|---|
| [`config.ts:14-15`](functions/src/config.ts:14) | `CHAT_PLATFORM_FEE_PCT = 35`, `CHAT_ESCROW_PCT = 65` | Hardcoded |
| [`chatMonetization.ts:99`](functions/src/chatMonetization.ts:99) | `PLATFORM_FEE_PERCENT = 35` | Hardcoded |
| [`pack277-wallet-service.ts:37-41`](functions/src/pack277-wallet-service.ts:37) | `getWalletSplitForContext()` returns `{ platformShare: 0.35, earnerShare: 0.65 }` | Hardcoded per context |
| [`pack277-wallet-service.ts:60-68`](functions/src/pack277-wallet-service.ts:60) | `REVENUE_SPLIT` object | Hardcoded legacy |
| [`types/pack303-creator-earnings.types.ts:237-243`](functions/src/types/pack303-creator-earnings.types.ts:237) | `REVENUE_SPLITS` const | Hardcoded |
| [`pack242DynamicChatPricing.ts:180-181`](functions/src/pack242DynamicChatPricing.ts:180) | `EARNER_SHARE = 0.65`, `PLATFORM_SHARE = 0.35` | Hardcoded |
| [`pack354-influencer-service.ts:228-234`](functions/src/pack354-influencer-service.ts:228) | `ECONOMY_RULES` | Hardcoded |

### Whether It Is Fixed

**YES.** The 65/35 split is declared as a non-negotiable constant in headers of 100+ files across all PACKs. Comments repeatedly state: "65/35 split is immutable".

### Whether It Is Configurable

**NO.** There is no database configuration or environment variable for the split. All values are hardcoded constants in source files.

### Whether It Is Hardcoded

**YES.** Hardcoded in:
- [`config.ts`](functions/src/config.ts:14) — `CHAT_PLATFORM_FEE_PCT = 35`
- [`pack277-wallet-service.ts`](functions/src/pack277-wallet-service.ts:37) — `platformShare: 0.35, earnerShare: 0.65`
- [`pack147-escrow-engine.ts:30`](functions/src/pack147-escrow-engine.ts:30) — `PLATFORM_FEE_PERCENTAGE = 0.35`
- Multiple pack-specific local constants

### Whether It Applies Per Message or Per Batch

**Per chat deposit (batch/upfront)** in the primary flow (`chats.ts`):
- 35% taken at deposit time (line 134): `platformFee = Math.ceil(100 * 0.35) = 35`
- 65% goes to escrow (line 137): `escrow = 100 - 35 = 65`
- Per-message billing then deducts from escrow and credits earner directly

**Per transaction** in the PACK 277 unified wallet service:
- Split is calculated per spending event inside [`spendTokens()`](functions/src/pack277-wallet-service.ts:218)

### Revenue Split by Product

| Product | Creator | Avalo | Source |
|---|---|---|---|
| Chat | 65% | 35% | [`pack277-wallet-service.ts:37`](functions/src/pack277-wallet-service.ts:37) |
| Voice Call | 65% | 35% | Line 38 |
| Video Call | 65% | 35% | Line 39 |
| AI Session | 65% | 35% | Line 40 |
| Media Purchase | 65% | 35% | Line 41 |
| Calendar Booking | 80% | 20% | Line 44 |
| Event Ticket | 80% | 20% | Line 45 |
| Tip | 90% | 10% | Line 48 |
| Avalo AI (no owner) | 0% | 100% | Line 51-52 |

---

## SECTION 4 — TOKEN STORAGE

### Data Type

**`number`** (JavaScript/TypeScript `number` = IEEE 754 double-precision floating-point).

All wallet interfaces declare token fields as `number`:
- [`types/pack277-wallet.types.ts:15`](functions/src/types/pack277-wallet.types.ts:15): `tokensBalance: number`
- [`types.ts:70`](functions/src/types.ts:70): `balance: number`

### Precision Level

JavaScript `number` type provides 53-bit integer precision (up to 2^53 - 1 = 9,007,199,254,740,991). For integer token values, this is more than sufficient.

### Whether Micro-Units Are Used

**NO.** Tokens are stored as whole numbers (integer values). There is no micro-unit or sub-token denomination.

### How Fractional Tokens Like 0.65 Are Stored

**They are NOT stored as fractional tokens.** The 65/35 split produces integer results because:
- `Math.floor(amount * 0.65)` → integer result at [`pack277-wallet-service.ts:220`](functions/src/pack277-wallet-service.ts:220)
- `Math.floor(price * 0.35)` → integer result, remainder goes to creator
- `Math.ceil()` is used for word-to-token conversion, always producing integers

However, the `number` type does not prevent fractional values from being written. The payout rate is stored as a float: `TOKEN_PAYOUT_USD = 0.03` and `TOKEN_PAYOUT_PLN = 0.12`.

### Rounding Strategy

- **Split rounding:** `Math.floor(amount * earnerShare)`, platform gets remainder (`amount - creatorEarned`). This ensures tokens sum to original amount — no token creation or destruction.
- **Word-to-token:** `Math.ceil(wordCount / wordsPerToken)` — always rounds up, favoring the earner.
- **Exception:** [`chatMonetization.ts:373`](functions/src/chatMonetization.ts:373) uses `Math.round()` — inconsistent with the rest of the codebase.

---

## SECTION 5 — LEDGER

### Whether a Transaction Table Exists

**YES.** Multiple transaction/ledger collections exist:

| Collection | File | Purpose |
|---|---|---|
| `transactions` | [`chats.ts:185`](functions/src/chats.ts:185) | Platform fee records from chat deposits |
| `transactions` | [`paymentsComplete.ts:424`](functions/src/paymentsComplete.ts:424) | Stripe purchase transaction records |
| `walletTransactions` | [`pack277-wallet-service.ts:140`](functions/src/pack277-wallet-service.ts:140) | Unified wallet transaction log |
| `purchases` | [`payments.ts:164`](functions/src/payments.ts:164) | Stripe session idempotency + purchase records |
| `paymentSessions` | [`paymentsComplete.ts:279`](functions/src/paymentsComplete.ts:279) | Payment session tracking |
| `settlements` | [`paymentsComplete.ts:1033`](functions/src/paymentsComplete.ts:1033) | Monthly settlement records |
| `platformRevenue` | [`pack277-wallet-service.ts:254`](functions/src/pack277-wallet-service.ts:254) | Running total of Avalo's share |

### Whether Each Operation Is Logged

**Partially.** In the PACK 277 wallet service, every `spendTokens()` call creates a `walletTransactions` doc (line 270-295). In the `chats.ts` primary path, a `transactions` doc is created only for the platform fee at deposit time (line 185-198), but NOT for individual per-message escrow deductions.

### Whether Operation Types Are Stored

**YES.** Transaction types are defined in:
- [`config.ts:126-139`](functions/src/config.ts:126): `TransactionType` enum: `PURCHASE`, `MESSAGE`, `VOICE_CALL`, `VIDEO_CALL`, `CALENDAR`, `TIP`, `SUBSCRIPTION`, `REFUND`, `PAYOUT`, `AI_CHAT`, `AI_IMAGE`, `AI_VOICE`
- [`types/pack277-wallet.types.ts:25-30`](functions/src/types/pack277-wallet.types.ts:25): `TransactionType`: `PURCHASE`, `SPEND`, `EARN`, `REFUND`, `PAYOUT`
- [`types/pack277-wallet.types.ts:32-41`](functions/src/types/pack277-wallet.types.ts:32): `TransactionSource`: `CHAT`, `CALL`, `CALENDAR`, `EVENT`, `TIP`, `STORE`, `BONUS`, `MEDIA`, `DIGITAL_PRODUCT`

### Whether Full Balance Reconstruction Is Possible

**Implementation incomplete.** While the PACK 277 wallet service stores `beforeBalance` and `afterBalance` per transaction (line 78, type definition), the `chats.ts` flow does NOT record per-message wallet balance snapshots. The `purchases` collection provides idempotency but not a complete double-entry ledger. Reconstruction would require combining multiple collections and is not guaranteed to be lossless for the escrow-based chat path.

---

## SECTION 6 — PAYOUT LOGIC

### Where Tokens Are Converted to USD

| File | Line | Code |
|---|---|---|
| [`config/economyConfig.ts:30`](functions/src/config/economyConfig.ts:30) | `TOKEN_PAYOUT_USD = 0.03` | Canonical source |
| [`config/economyConfig.ts:58`](functions/src/config/economyConfig.ts:58) | `TOKEN_PAYOUT_PLN = 0.03 * 4.0 = 0.12` | PLN derivation |
| [`paymentsComplete.ts:1025`](functions/src/paymentsComplete.ts:1025) | `settlementRate = TOKEN_PAYOUT_PLN` | Settlement calculation |
| [`pack289-withdrawals.ts:51`](functions/src/pack289-withdrawals.ts:51) | `PAYOUT_RATE_PLN = TOKEN_PAYOUT_PLN` | Withdrawal calculation |
| [`payments.ts:331`](functions/src/payments.ts:331) | `TOKEN_PAYOUT_USD = 0.03` (local copy) | Payout request |

### Whether 0.03 USD Is Hardcoded or Configurable

**Hardcoded** at [`config/economyConfig.ts:30`](functions/src/config/economyConfig.ts:30): `export const TOKEN_PAYOUT_USD = 0.03;`

Not configurable via environment variable or database. All other files import from this single source of truth.

### Whether Minimum Payout Threshold Exists

**YES.**
- [`types/pack277-wallet.types.ts:159`](functions/src/types/pack277-wallet.types.ts:159): `MIN_PAYOUT_TOKENS = 1000` (1000 × 0.12 = 120 PLN)
- [`pack289-withdrawals.ts`](functions/src/pack289-withdrawals.ts) — `LIMITS` imported from `DEFAULT_WITHDRAWAL_LIMITS`
- [`creatorHub.ts:420`](functions/src/creatorHub.ts:420) — `amount < 100` minimum withdrawal check

### Whether Payout Is Manual or Automatic

**Both exist:**
- **Automatic:** [`paymentsComplete.ts:983`](functions/src/paymentsComplete.ts:983) — `generateMonthlySettlements` (scheduled function) creates settlement records automatically.
- **Manual:** [`pack289-withdrawals.ts`](functions/src/pack289-withdrawals.ts) — withdrawal request flow: user requests → admin approves → tokens burned → fiat paid.

### Whether Stripe Connect Is Used

**YES, partially implemented.**
- [`integrations/stripeConnect.ts`](functions/src/integrations/stripeConnect.ts:1) — Full Stripe Connect Express account creation and onboarding link generation.
- [`payoutProviders/stripe.ts`](functions/src/payoutProviders/stripe.ts:1) — `StripeProvider` class with `name = 'Stripe Connect'` — actual transfer marked as **TODO**.
- [`workers/payoutProcessor.ts`](functions/src/workers/payoutProcessor.ts:4) — Imports `createStripeTransfer` from `stripeConnect`.
- [`pack390-payouts.ts:471`](functions/src/pack390-payouts.ts:471) — `executeStripeConnectTransfer` — **TODO: Integrate with Stripe Connect** (not implemented).
- [`paymentsComplete.ts:1609-1659`](functions/src/paymentsComplete.ts:1609) — SEPA, PayPal, Crypto payout handlers all contain **placeholder implementations** with logging only.

**Status: Stripe Connect account creation is implemented. Actual money transfer is NOT implemented (placeholder/TODO).**

---

## SECTION 7 — STRIPE PURCHASE FLOW

### Purchase Endpoint

| Endpoint | File | Description |
|---|---|---|
| `createStripeCheckoutSession` | [`paymentsComplete.ts:200`](functions/src/paymentsComplete.ts:200) | onCall — creates Stripe Checkout session with token metadata |
| Web flow | [`pack302-web-billing.ts`](functions/src/pack302-web-billing.ts) | Web-specific billing |
| Token store | [`pack288-web-stripe.ts`](functions/src/pack288-web-stripe.ts) | Web token store checkout |

### Webhook Implementation

**YES — Multiple webhook implementations exist:**

| Handler | File | Status |
|---|---|---|
| `stripeWebhook` | [`payments.ts:38`](functions/src/payments.ts:38) | **Active** — Full implementation with signature verification, idempotency, atomic credit |
| `stripeWebhookV2` | [`paymentsComplete.ts:308`](functions/src/paymentsComplete.ts:308) | **Active** — Enhanced version with subscription/refund handling |
| `tokens_stripeWebhook` | [`pack288-web-stripe.ts:178`](functions/src/pack288-web-stripe.ts:178) | **Active** — Web token store webhook |
| `stripeWebhook` (PACK 302) | [`pack302-web-billing.ts:129`](functions/src/pack302-web-billing.ts:129) | **Active** — Web billing webhook |
| `stripeWebhookV1` | [`payments/stripe/webhook.ts:5`](functions/src/payments/stripe/webhook.ts:5) | **Active** — Legacy V1 webhook |
| `pack278_stripeWebhook` | [`pack278-subscription-endpoints.ts:339`](functions/src/pack278-subscription-endpoints.ts:339) | **Commented-out** signature verification — onCall wrapper |
| `pack350_stripeWebhook` | [`pack350-endpoints.ts:231`](functions/src/pack350-endpoints.ts:231) | **Placeholder** — contains TODO comments |

All active webhooks use `stripe.webhooks.constructEvent()` for signature verification.

### Where Tokens Are Credited

| Flow | File | Collection | Field |
|---|---|---|---|
| `payments.ts` | [`payments.ts:180`](functions/src/payments.ts:180) | `users/{uid}/wallet/current` | `purchased: increment(pack.tokens)` |
| `paymentsComplete.ts` | [`paymentsComplete.ts:448`](functions/src/paymentsComplete.ts:448) | `users/{uid}/wallet/main` | `balance: FieldValue.increment(tokens)` |

**Note:** Two different wallet document paths exist: `wallet/current` and `wallet/main`. This is a structural concern.

### Whether `price → tokenQuantity` Mapping Exists

**YES.** Token packs are defined in:
- [`config.ts:92-100`](functions/src/config.ts:92) — `TOKEN_PACKAGES` with PLN prices
- [`pack277-token-packs.ts`](functions/src/pack277-token-packs.ts) — `DEFAULT_TOKEN_PACKS` with multi-currency USD prices

### Whether `tokenQuantity` Is in Metadata or Hardcoded

**In metadata.** At checkout creation ([`paymentsComplete.ts:245-249`](functions/src/paymentsComplete.ts:245)):
```typescript
metadata: {
  userId,
  tokens: tokens.toString(),
  productType: "tokens",
  idempotencyKey,
}
```

At webhook processing ([`payments.ts:94`](functions/src/payments.ts:94)):
```typescript
const tokensFromMeta = parseInt(session.metadata?.tokens || '0', 10);
```

The webhook then **validates** `tokensFromMeta !== pack.tokens` at line 132, rejecting mismatches.

---

## SECTION 8 — SECURITY

### Whether Balance Is Validated Before Sending a Message

**YES**, in multiple paths:
- [`chats.ts:126`](functions/src/chats.ts:126): `wallet.balance < CHAT_INITIAL_DEPOSIT_TOKENS` — checked before chat start
- [`chats.ts:288`](functions/src/chats.ts:288): `chat.billing.currentBalance < tokensCharged` — checked before message send (escrow)
- [`chatMonetization.ts:699`](functions/src/chatMonetization.ts:699): `chat.billing.escrowBalance < billing.tokensCost` — checked before deduction
- [`pack277-wallet-service.ts:200`](functions/src/pack277-wallet-service.ts:200): `availableBalance < amountTokens` — checked inside transaction (considers reserved tokens)

### Whether Atomic Transactions Are Used

**YES.** `db.runTransaction()` is used in:
- [`chats.ts:140`](functions/src/chats.ts:140) — Chat start deposit
- [`chats.ts:308`](functions/src/chats.ts:308) — Message billing
- [`payments.ts:151`](functions/src/payments.ts:151) — Stripe webhook token credit
- [`paymentsComplete.ts:377`](functions/src/paymentsComplete.ts:377) — Stripe webhook V2 token credit
- [`pack277-wallet-service.ts:192`](functions/src/pack277-wallet-service.ts:192) — Spend tokens

### Whether Double-Spend Protection Exists

**YES**, via multiple mechanisms:
1. **Stripe idempotency:** [`payments.ts:153`](functions/src/payments.ts:153) — `purchases/{sessionId}` checked **inside** transaction
2. **Session status check:** [`paymentsComplete.ts:389`](functions/src/paymentsComplete.ts:389) — `paymentSession.status === "completed"` checked **inside** transaction
3. **Escrow balance check:** [`chats.ts:288`](functions/src/chats.ts:288) — prevents spending more than available escrow
4. **PACK 452 reserved tokens:** [`pack277-wallet-service.ts:198-200`](functions/src/pack277-wallet-service.ts:198) — `availableBalance = tokensBalance - reservedTokens`

### Whether Balance Updates Are Locked

**Partially.** Firestore transactions provide optimistic concurrency control (OCC). If a concurrent write occurs, the transaction is retried. However:
- The `chats.ts:sendMessageCallable` balance check at line 288 is **outside** the transaction (reads `chat` before entering `runTransaction`). The escrow reads are stale.
- The `pack277-wallet-service.ts` balance check at line 194-200 reads the wallet **inside** the transaction — this is correct.

### Whether Negative Balances Are Possible

**YES, theoretically**, due to the stale-read issue in `chats.ts`:
1. User sends two messages concurrently
2. Both read `chat.billing.currentBalance = 5` before the transaction
3. Both pass the balance check
4. Both enter separate `runTransaction` calls
5. One transaction uses `increment(-3)`, succeeds → balance = 2
6. Second transaction uses `increment(-4)`, succeeds → balance = -2

This is because `increment()` does not enforce a minimum. Only an explicit zero-floor check **inside** the transaction would prevent this.

In `pack277-wallet-service.ts`, the wallet read IS inside the transaction, and a direct set (not `increment`) is used at line 209: `tokensBalance: afterBalance`. This is safe.

---

## SECTION 9 — POTENTIAL RISKS

### Balance Mismatch May Occur

1. **Two wallet collections:** `users/{uid}/wallet/current` (used by `payments.ts` + `chats.ts`) vs `users/{uid}/wallet/main` (used by `paymentsComplete.ts`) vs `wallets/{userId}` (used by `pack277-wallet-service.ts`). Three separate wallet locations exist. Token credits go to one, debits come from another.

2. **Stale chat read:** [`chats.ts:288`](functions/src/chats.ts:288) — escrow balance read outside transaction could lead to inconsistency.

### Rounding Errors May Occur

1. **`Math.round` vs `Math.ceil` inconsistency:** [`chatMonetization.ts:373`](functions/src/chatMonetization.ts:373) uses `Math.round(wordCount / roles.wordsPerToken)`, while every other file uses `Math.ceil`. This means a 5-word message at standard rate: `Math.round(5/11) = 0` (no charge!) vs `Math.ceil(5/11) = 1` (1 token). This is a billing discrepancy.

2. **Platform fee rounding direction inconsistency:** Some files use `Math.floor(amount * 0.35)` (platform gets less), others use `Math.ceil(amount * 0.35)` (platform gets more). For amounts not divisible by 20, this creates 1-token variance.

### Negative Balances May Occur

1. **Concurrent message sends** in `chats.ts` — balance check outside transaction, deduction uses `increment()`.
2. No explicit `>=0` constraint in Firestore; no security rule enforces non-negative wallet balance.

### Exploits May Occur

1. **Zero-cost messages:** Via the `Math.round()` bug in `chatMonetization.ts` — a 5-word message costs 0 tokens at the standard rate, effectively giving free messaging for short messages.
2. **Wallet collection mismatch:** Tokens credited to `wallet/current` or `wallet/main` cannot be spent from `wallets/{userId}` (PACK 277) without additional synchronization. A user could appear to have tokens in one view but not another.

### Revenue Split May Break

1. **Multiple hardcoded split values:** The 65/35 constant is duplicated in 15+ files. A partial update to one file without updating others would create inconsistency.
2. **`Math.floor` vs `Math.ceil` for platform fee:** Creates ±1 token variance per transaction. Over millions of transactions, this accumulates.

---

## SECTION 10 — PLATFORM WALLET

### Whether a Platform Wallet Exists as a Separate Entity

**YES**, but fragmented across multiple implementations:

| Collection/Path | File | Usage |
|---|---|---|
| `platformRevenue/total` | [`pack277-wallet-service.ts:254`](functions/src/pack277-wallet-service.ts:254) | Incremental revenue counter |
| `system/avalo_wallet` | [`meetingMonetization.ts:317`](functions/src/meetingMonetization.ts:317) | Meeting platform fees |
| `platform_wallet/earnings` | [`pack147-escrow-engine.ts:214`](functions/src/pack147-escrow-engine.ts:214) | Escrow release platform fees |
| `wallets/AVALO_PLATFORM` | [`eventsEngine.ts:116`](functions/src/eventsEngine.ts:116) | Event platform fees |
| `balances/avalo_platform/wallet/wallet` | [`meetEngine.ts:407`](functions/src/meetEngine.ts:407) | Meet engine platform fees |

**There is no single, unified platform wallet.** Platform revenue is tracked in at least 5 separate Firestore locations.

---

## EXECUTIVE SUMMARY

1. **Internal consistency:** The system is internally consistent **within each individual PACK** but **inconsistent across PACKs**. Three separate wallet document paths exist (`wallet/current`, `wallet/main`, `wallets/{userId}`), and five separate platform revenue locations exist. Token credits and debits may target different collections.

2. **65/35 split correctness:** The 65/35 split is **correctly implemented** in all files where it is applied. It is hardcoded consistently across 15+ files. The `Math.floor(amount * earnerShare)` with remainder to platform ensures no tokens are created or destroyed. However, `Math.ceil` is used for platform fee in some paths ([`chats.ts:134`](functions/src/chats.ts:134)), which takes 1 extra token from the creator on edge cases.

3. **0.03 USD payout logic:** **Correctly implemented.** Single source of truth at [`config/economyConfig.ts:30`](functions/src/config/economyConfig.ts:30). All payout calculations reference this constant. PLN and EUR rates are correctly derived. Tests exist to verify the value is exactly 0.03.

4. **Production safety:** The system is **NOT fully production-safe** due to:
   - `Math.round` bug enabling zero-cost messages in [`chatMonetization.ts:373`](functions/src/chatMonetization.ts:373)
   - Stale balance reads before transactions in [`chats.ts:288`](functions/src/chats.ts:288) enabling potential negative balances
   - Three separate wallet locations creating potential balance desynchronization
   - Five separate platform wallet locations preventing consolidated platform accounting
   - Payout transfer functions contain placeholder/TODO implementations (no actual money movement)

5. **Financial foundation stability:** The **design** is sound — escrow model, word-based billing, configurable splits per product, idempotent webhook processing, atomic transactions in the newer PACK 277 path. The **implementation** has divergence across evolutionary layers (chats.ts vs chatMonetization.ts vs pack277-wallet-service.ts), creating multiple paths for the same operation with slightly different semantics. The Stripe webhook handlers have proper signature verification and idempotency protection. The settlement layer exists but payout execution is incomplete.
