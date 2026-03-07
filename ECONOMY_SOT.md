# ECONOMY_SOT.md — Avalo Economy Source of Truth

**Generated:** 2026-03-05  
**Source:** Deep scan of `avalo/functions/src`, `avalo/app-web/src`, audit-out/  
**Status:** Authoritative — live production reference

---

## 1. TOKEN_PAYOUT_USD (Creator Payout Rate)

| Source File | Value | Status |
|---|---|---|
| [`functions/src/config/economyConfig.ts`](functions/src/config/economyConfig.ts:14) | **0.03 USD** | ✅ **CANONICAL** |
| [`functions/src/core/canonicalEconomy.ts`](functions/src/core/canonicalEconomy.ts:5) | 0.03 USD | ⚠️ Duplicate (should import) |
| [`app-web/src/lib/economyConfig.ts`](app-web/src/lib/economyConfig.ts:11) | **0.01 USD** | ❌ **CONFLICT** |
| [`functions/src/types/shared/compliance/pack418-compliance-constants.ts`](functions/src/types/shared/compliance/pack418-compliance-constants.ts:44) | **0.04 USD** | ❌ **CONFLICT** |
| [`functions/src/pack114-earnings-integration.ts`](functions/src/pack114-earnings-integration.ts:237) | **0.10 USD** | ❌ **HARDCODED LOCAL** |
| [`functions/src/payments.ts`](functions/src/payments.ts:331) | 0.03 USD | ⚠️ Hardcoded local (matches canonical) |

**Canonical value:** `TOKEN_PAYOUT_USD = 0.03` (from [`functions/src/config/economyConfig.ts`](functions/src/config/economyConfig.ts:14))

---

## 2. PLATFORM_LAYOUT_FEE (Payout Processing Fee)

| Source File | Value | Status |
|---|---|---|
| [`functions/src/config/economyConfig.ts`](functions/src/config/economyConfig.ts:25) | **5% (0.05)** | ✅ **CANONICAL** |
| [`functions/src/config/payouts.config.ts`](functions/src/config/payouts.config.ts:60) | 5% (0.05) | ✅ Imports from economyConfig |

**Canonical:** `PAYOUT_FEE_PLATFORM_PERCENT = 0.05` — charged to creator on payout, not subsidized by Avalo.

---

## 3. Revenue Splits Per Surface (Discovered Values)

See full matrix in [`docs/SOT_SPLITS_MATRIX.md`](docs/SOT_SPLITS_MATRIX.md).

### Summary (Canonical Intent):

| Surface | Creator | Avalo | Canonical File |
|---|---|---|---|
| Chat (human) | 65% | 35% | [`types/canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:107) |
| Calls (voice/video) | 80% | 20% | [`pack354-influencer-service.ts`](functions/src/pack354-influencer-service.ts:230) |
| Calendar (1:1 meetings) | 80% | 20% | [`pack286-calendar-events-economics.ts`](functions/src/pack286-calendar-events-economics.ts:33) |
| Events (tickets) | 80% | 20% | [`pack286-calendar-events-economics.ts`](functions/src/pack286-calendar-events-economics.ts:34) |
| Tips | 90% | 10% | [`pack277-wallet-service.ts`](functions/src/pack277-wallet-service.ts:48) |
| Subscriptions | 70% | 30% | [`config.ts`](functions/src/config.ts:36) |
| Live streams (gifts) | 70% | 30% | [`config/liveMonetization.ts`](functions/src/config/liveMonetization.ts:182) |
| AI companions | 80% | 20% | [`aiChatEngine.ts`](functions/src/aiChatEngine.ts:40) |
| Boosts (creator) | 65% | 35% | [`pack347-boost-products.ts`](functions/src/pack347-boost-products.ts:74) |
| Boosts (promo/Avalo) | 0% | 100% | [`pack327-types.ts`](functions/src/pack327-types.ts:183) |
| Digital products/media | 65% | 35% | [`chatMediaMonetization.ts`](functions/src/chatMediaMonetization.ts:149) |
| Drops | 70% | 30% | [`dropsEngine.ts`](functions/src/dropsEngine.ts:39) |
| Avatar templates | 65% | 35% | [`pack331-ai-avatar-template.types.ts`](functions/src/types/pack331-ai-avatar-template.types.ts:187) |

---

## 4. Tokens-Per-Word (Chat Billing)

| Mode | Words/Token | Source |
|---|---|---|
| Standard earner | 11 | [`types/canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:89) |
| Royal earner | 7 | [`types/canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:92) |

Burn multiplier enum: `[1, 2, 3, 4, 5, 7, 10, 12, 15, 20]` — applied per session deposit.

**Bucket formula:** `newBuckets = floor((accumulatedEarnerWords + newWords) / wordsPerToken) - priorBuckets`  
**Token cost:** `newBuckets × 1 × burnMultiplier`

---

## 5. Chat Minimum Charge (MIN_DEPOSIT_TOKENS)

| Source File | Value | Status |
|---|---|---|
| [`types/canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:101) | **100 tokens** | ✅ **CANONICAL** |
| [`config.ts`](functions/src/config.ts:12) | 100 tokens | ✅ Matches |

---

## 6. Refund Model

### Chat Refund:
- **Platform fee (35% of deposit)** → captured at deposit time → **NEVER refunded**
- **Unused escrow** → refunded to payer on chat close/expiry
- Earner credits already paid → NOT clawed back
- Defined in [`types/canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:382)

### Calendar/Events Refund:
- 72+ hours before start: 100% of earner share refunded (platform fee retained)
- 24-72 hours: 50% of earner share refunded
- Under 24 hours: No refund
- Defined in [`pack286-calendar-events-economics.ts`](functions/src/pack286-calendar-events-economics.ts:67)

---

## 7. Ledger Invariants

1. **Double-entry:** Every token debit must have a corresponding credit (payer→escrow→earner+avalo)
2. **Idempotency:** Transactions must be keyed by `sessionId + messageIndex` or equivalent
3. **No Math.round:** Deterministic `Math.floor` only for splits (earner gets floor, Avalo gets remainder)
4. **Platform fee is immediate:** Captured at deposit, not at consumption
5. **Escrow remainder = refund amount:** `refundedTokens = escrowRemainingTokens`

---

## 8. Canonical Implementations

### A) Word Counting (creator-only words)
- **File:** [`canonical-chat-engine.ts`](functions/src/canonical-chat-engine.ts:653)
- **Rule:** Only earner messages are billed. Payer messages = always free.
- **Implementation:** `processMessage()` → if sender == payer → return billed=false

### B) Token Deduction Moment
- **File:** [`canonical-chat-engine.ts`](functions/src/canonical-chat-engine.ts:596)
- **Rule:** Tokens consumed from escrow on each earner message, per bucket completion
- **Escrow funded at deposit:** `escrow = deposit × 0.65`

### C) Fee Capture (non-refundable)
- **File:** [`types/canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:94)
- **Rule:** `platformFee = deposit × 0.35`, charged immediately at deposit, stored in `platformFeeChargedTokens`
- **NEVER refunded** — confirmed by `RefundResult.platformFeeRetained`

### D) Refund Unused Conversation Pool
- **File:** [`types/canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:382)
- **Rule:** `refundedTokens = escrowRemainingTokens` (unused escrow returned to payer)
- Trigger: chat close (user-initiated), chat expiry (48h inactivity), system migration

---

## 9. Payout Pipeline

```
Creator earns tokens → credited to wallet.balanceTokens
→ Creator requests withdrawal (min 1000 tokens)
→ grossUsd = tokensRequested × TOKEN_PAYOUT_USD (0.03)
→ platformFee = grossUsd × PAYOUT_FEE_PLATFORM_PERCENT (5%)
→ netUsd = grossUsd - platformFee
→ Payout via STRIPE / WISE
```

Canonical file: [`wallet/payoutService.ts`](functions/src/wallet/payoutService.ts:93)

---

## 10. Key Constants Summary

| Constant | Value | File |
|---|---|---|
| `TOKEN_PAYOUT_USD` | 0.03 | [`config/economyConfig.ts`](functions/src/config/economyConfig.ts:14) |
| `PAYOUT_FEE_PLATFORM_PERCENT` | 0.05 (5%) | [`config/economyConfig.ts`](functions/src/config/economyConfig.ts:25) |
| `MIN_DEPOSIT_TOKENS` | 100 | [`types/canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:101) |
| `PLATFORM_FEE_PCT` | 35 | [`types/canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:95) |
| `ESCROW_PCT` | 65 | [`types/canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:98) |
| `WORDS_PER_TOKEN_STANDARD` | 11 | [`types/canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:89) |
| `WORDS_PER_TOKEN_ROYAL` | 7 | [`types/canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:92) |
| `INACTIVITY_EXPIRY_MS` | 172800000 (48h) | [`types/canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:113) |
| `FREE_MESSAGES_STANDARD` | 9 | [`types/canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:79) |
| `FREE_MESSAGES_ROYAL_EARNER` | 5 | [`types/canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:82) |
| `MIN_PAYOUT_TOKENS` | 1000 | [`config/payouts.config.ts`](functions/src/config/payouts.config.ts:57) |
