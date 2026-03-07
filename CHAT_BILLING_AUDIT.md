# CHAT_BILLING_AUDIT.md — Canonical Chat Billing Pipeline

**Generated:** 2026-03-05  
**Version:** 2.0.0 — Updated with canonical file/line references from deep scan  
**Status:** Live production reference

---

## 1. Canonical Billing Pipeline Definition

The **one and only** chat billing pipeline is defined in:

| Component | File | Lines |
|---|---|---|
| State machine + types | [`functions/src/types/canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:1) | 1–414 |
| Engine implementation | [`functions/src/canonical-chat-engine.ts`](functions/src/canonical-chat-engine.ts:1) | 1–800+ |
| Economy constants | [`functions/src/config/economyConfig.ts`](functions/src/config/economyConfig.ts:1) | 1–190+ |
| Unit tests (existing) | [`functions/src/__tests__/canonical-chat-engine.test.ts`](functions/src/__tests__/canonical-chat-engine.test.ts:1) | 1–700+ |
| Billing pipeline tests | [`functions/src/__tests__/chat-billing-pipeline.test.ts`](functions/src/__tests__/chat-billing-pipeline.test.ts:1) | 1–300+ |

---

## 2. Invariants

### 2.1 Creator-Only Word Counting

- **Canonical file:** [`canonical-chat-engine.ts`](functions/src/canonical-chat-engine.ts:653) — `processMessage()`
- **Rule:** Only earner messages are billed. If `senderId === roles.payerId`, billing returns `billed: false`.
- **Word counting:** `countBillableWords()` counts words in the earner's message text.
- **Bucket formula:** `newBuckets = floor((accumulatedEarnerWords + newWords) / wordsPerToken) - priorBuckets`
- **Constants:**
  - Standard: 11 words/token — [`canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:89)
  - Royal: 7 words/token — [`canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:92)

### 2.2 chargedTokens = max(minCharge, computedCost)

- **Minimum deposit:** `MIN_DEPOSIT_TOKENS = 100` — [`canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:101)
- **Central config:** `MIN_CHAT_CHARGE_TOKENS = 100` — [`config/economyConfig.ts`](functions/src/config/economyConfig.ts)
- **Enforcement:** Deposit function rejects deposits below minimum.

### 2.3 Platform Fee Captured Upfront, Non-Refundable

- **Fee:** `PLATFORM_FEE_PCT = 35` — [`canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:95)
- **Capture moment:** At deposit time, immediately — [`canonical-chat-engine.ts`](functions/src/canonical-chat-engine.ts) (deposit handler)
- **Storage:** `billingState.platformFeeChargedTokens`
- **Refund rule:** `RefundResult.platformFeeRetained` — fee is NEVER returned — [`canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:387)

### 2.4 Refund Returns Unused Conversation Tokens Only

- **Canonical:** [`canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:382) — `RefundResult`
- **Formula:** `refundedTokens = escrowRemainingTokens`
- **Triggers:** Chat close (user-initiated), chat expiry (48h inactivity), system migration
- **Earner credits:** Already paid out, NOT clawed back

### 2.5 Ledger is Double-Entry + Idempotent

- **Double-entry invariant:** `platformFee + totalConsumed + escrowRemaining = deposit` (always)
- **Credit split:** `earnerCredit + avaloCredit = tokensConsumed` (for every event)
- **Idempotency:** Firestore transaction at [`canonical-chat-engine.ts`](functions/src/canonical-chat-engine.ts:660) ensures atomic reads/writes
- **Remaining gap:** No explicit idempotency key on ledger entries (see SYSTEM_ERRORS.md ERR-020)

---

## 3. State Machine

```
MATCHED → AWAITING_EARNER_ACCEPT → FREE_ACTIVE → AWAITING_DEPOSIT → PAID_ACTIVE → CLOSED
                                 ↘ CLOSED (decline)                                 ↗ EXPIRED
```

- **Canonical file:** [`canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:41)
- **Logic version:** `v2_canonical` — all new chats MUST have this tag

---

## 4. Revenue Split (Chat Surface)

| Recipient | Percentage | Source |
|---|---|---|
| Earner (creator) | 65% | [`canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:107) |
| Avalo (platform) | 35% | [`canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:110) |
| Central config | 65% / 35% | [`config/economyConfig.ts`](functions/src/config/economyConfig.ts) — `SPLITS_BY_SURFACE.CHAT` |

**Implementation:** [`canonical-chat-engine.ts`](functions/src/canonical-chat-engine.ts:611)
```typescript
earnerCredit = Math.floor(tokensToConsume * EARNER_REVENUE_SPLIT); // 0.65
avaloCredit = tokensToConsume - earnerCredit; // Remainder
```

---

## 5. Deposit Flow

1. Payer initiates deposit of `N` tokens (N ≥ 100)
2. Platform fee: `platformFee = floor(N * 0.35)` — captured immediately, non-refundable
3. Escrow: `escrow = N - platformFee` — refundable unused portion
4. Paid session created with frozen config snapshot (wordsPerToken, burnMultiplier)

---

## 6. Message Billing Flow

1. Earner sends message with `W` words
2. `accumulatedEarnerWords += W`
3. `totalBuckets = floor(accumulatedEarnerWords / wordsPerToken)`
4. `newBuckets = totalBuckets - previousBuckets`
5. If `newBuckets > 0`:
   - `tokenCost = newBuckets × 1 × burnMultiplier`
   - `tokenCost = min(tokenCost, escrowRemainingTokens)` — cap at remaining
   - Credit: `earnerCredit = floor(tokenCost × 0.65)`, `avaloCredit = tokenCost - earnerCredit`
   - Update: `escrowRemainingTokens -= tokenCost`
6. If `escrowRemainingTokens <= 0` → transition to `AWAITING_DEPOSIT` or `CLOSED`

---

## 7. Refund Flow

1. Trigger: user closes chat OR 48h inactivity expiry
2. `refundedTokens = escrowRemainingTokens`
3. `platformFeeRetained = platformFeeChargedTokens` (never refunded)
4. `earnerCreditsRetained = totalEarnerCredited` (never clawed back)
5. Return `refundedTokens` to payer's wallet

---

## 8. Known Issues

See [`SYSTEM_ERRORS.md`](SYSTEM_ERRORS.md) for full list. Key chat-related issues:

| ID | Issue | Severity |
|---|---|---|
| ERR-020 | No explicit idempotency key on ledger entries | 🔴 CRITICAL |
| ERR-024 | Platform fee 35% at deposit + 35% of escrow consumption = 57.75% total to Avalo | 🔴 CRITICAL (needs business confirmation) |
| ERR-019 | Free message count varies across legacy paths (3, 4, 8, 9, 10) | 🟡 MEDIUM |
| ERR-025 | Dual processing risk if logicVersion field missing | 🟠 HIGH |

---

## 9. Test Suite

### Run tests:
```bash
cd avalo/functions
npm test -- --testPathPattern='chat-billing-pipeline'
```

### Test coverage:
| Test ID | Description | Status |
|---|---|---|
| T1 | User paid 100, creator used 30, refund 35, platform fee not refunded | ✅ |
| T2 | Expiry closes chat, refund unused | ✅ |
| T3 | Idempotency: same event twice does not double-charge | ✅ |
| T4 | chargedTokens = max(minCharge, computedCost) | ✅ |
| T5 | Platform fee captured upfront is not refundable | ✅ |
| T6 | Refund returns unused conversation tokens only | ✅ |
| T7 | Ledger is double-entry (platformFee + consumed + remaining = deposit) | ✅ |

---

## 10. Superseded Files

These files are LEGACY and should NOT be used for new chat billing:

| File | Status | Reason |
|---|---|---|
| `chats.ts` | SUPERSEDED | Billed payer's messages (wrong direction) |
| `chatMonetization.ts` | SUPERSEDED | FREE_A/FREE_B modes removed |
| `pack273ChatEngine.ts` | REDIRECTED | pack273_chats collection → chats collection |
| `pack328b-chat-session-timeouts.ts` | SUPERSEDED | 48h/72h divergence → canonical 48h |
| `pack242DynamicChatPricing.ts` | SUPERSEDED | Deposit modifiers removed |
| `pack285FreeWindowFunnel.ts` | MERGED | Separate free funnel merged into canonical |
