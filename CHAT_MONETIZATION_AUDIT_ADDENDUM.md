# AVALO Chat Monetization Audit Addendum — Source of Truth Report

**Date:** 2026-03-01  
**Scope:** Free → Paid transition, Who Pays, Expiry/Refunds, Non-Earn/Low-Popularity, Multipliers  
**Status:** Read-only audit — no code changes proposed  

---

## 1. FREE MESSAGES

### 1.1 How many free messages exist by default?

**⚠️ CRITICAL: Conflicting values across 6 execution paths.** There is no single canonical answer.

| File | Constant | Value | Notes |
|------|----------|-------|-------|
| [`config.ts`](functions/src/config.ts:13) | `CHAT_FREE_MESSAGES_PER_USER` | **3** | Used by `chats.ts` |
| [`chatMonetization.ts`](functions/src/chatMonetization.ts:95) | `FREE_MESSAGES_PER_PARTICIPANT` | **3** | Primary monetization path |
| [`pack246-contract-types.ts`](functions/src/pack246-contract-types.ts:28) | `CONTRACT_RULES.CHAT.FREE_MESSAGES_PER_PARTICIPANT` | **3** | Contract enforcement |
| [`pack273ChatEngine.ts`](functions/src/pack273ChatEngine.ts:123) | `FREE_MESSAGES_LOW_POP` | **10** | Low-popularity path |
| [`pack273ChatEngine.ts`](functions/src/pack273ChatEngine.ts:124) | `FREE_MESSAGES_ROYAL` | **6** | Royal members |
| [`pack285FreeWindowFunnel.ts`](functions/src/pack285FreeWindowFunnel.ts:75) | `FREE_MESSAGES_LOW_POPULARITY_PER_USER` | **10** | Low-pop funnel |
| [`pack285FreeWindowFunnel.ts`](functions/src/pack285FreeWindowFunnel.ts:76) | `FREE_MESSAGES_ROYAL_PER_USER` | **6** | Royal funnel |
| [`pack285FreeWindowFunnel.ts`](functions/src/pack285FreeWindowFunnel.ts:77) | `FREE_MESSAGES_STANDARD_PER_USER` | **8** | Standard funnel |
| [`matchingEngine.ts`](functions/src/matchingEngine.ts:43) | `FREE_MESSAGES_PER_CHAT` | **4** | Matching engine |
| [`chatMonetization.ts`](functions/src/chatMonetization.ts:96) | `FREE_B_MESSAGE_LIMIT` | **50** | Mid-popularity free-pool cap |

### 1.2 Where are free messages configured?

All constants are **hardcoded in source files** (no DB or remote config). The values listed above are local `const` declarations within each module. There is no centralized configuration system governing these limits.

### 1.3 Are free messages per chat, per user, per day, per match, or per session?

They are **per participant per chat** in the primary paths:

- [`chatMonetization.ts`](functions/src/chatMonetization.ts:458-461): Stored as `billing.freeMessagesRemaining: { [userId]: 3, [userId]: 3 }` — each participant gets 3 free messages within a single chat.
- [`pack273ChatEngine.ts`](functions/src/pack273ChatEngine.ts:342-344): Stored as `freeMessagesUsed: { [userId]: 0, [userId]: 0 }` — per participant, per chat.
- [`pack285FreeWindowFunnel.ts`](functions/src/pack285FreeWindowFunnel.ts:40-45): Stored as `freeWindow.perUserLimit` and `freeWindow.used` — per user per chat.
- [`matchingEngine.ts`](functions/src/matchingEngine.ts:86): `freeMessagesRemaining` is a flat number on the match document — per chat total, not per participant.

Free messages do **NOT** reset daily. They are a one-time allowance per chat initiation.

### 1.4 Do free messages apply to both sides or only one side?

**Both sides.** In all implementations, each participant receives their own free message allowance independently:

- [`chatMonetization.ts`](functions/src/chatMonetization.ts:458-461): Both `participantIds[0]` and `participantIds[1]` receive `FREE_MESSAGES_PER_PARTICIPANT` (3).
- [`pack273ChatEngine.ts`](functions/src/pack273ChatEngine.ts:342-344): Both participants start with `0` used and have the same limit.
- [`pack285FreeWindowFunnel.ts`](functions/src/pack285FreeWindowFunnel.ts:137-140): Both are assigned the same `perUserLimit`.

### 1.5 Are free messages deducted by sender or shared counter?

**By sender.** When a user sends a message, only *their own* counter is decremented:

- [`chatMonetization.ts`](functions/src/chatMonetization.ts:637-638): `billing.freeMessagesRemaining.${senderId}` is decremented by 1.
- [`pack273ChatEngine.ts`](functions/src/pack273ChatEngine.ts:410-411): `freeMessagesUsed.${senderId}` is incremented by 1.
- [`pack285FreeWindowFunnel.ts`](functions/src/pack285FreeWindowFunnel.ts:276-277): `freeWindow.used.${senderId}` is incremented by 1.

Transition to paid phase occurs when the **total** of both participants' free messages is exhausted:
- [`chatMonetization.ts`](functions/src/chatMonetization.ts:648-651): `totalFreeUsed >= FREE_MESSAGES_PER_PARTICIPANT * 2`
- [`pack273ChatEngine.ts`](functions/src/pack273ChatEngine.ts:426-429): `totalFreeUsed >= totalFreeLimit` (limit × 2)

---

## 2. WHO PAYS IN THE RELATIONSHIP

### 2.1 Which side pays tokens when paid mode starts?

The payer is determined **at chat initialization** by [`determineChatRoles()`](functions/src/chatMonetization.ts:115-290) and does not change during the chat lifecycle.

**Priority resolution order** (from [`chatMonetization.ts`](functions/src/chatMonetization.ts:1-13)):

| Priority | Condition | Payer | Earner |
|----------|-----------|-------|--------|
| 1 | Exactly one has `influencerBadge=ON` + `earnOnChat=ON` | The other participant | Influencer-earner |
| 2 | Heterosexual (M+F) | **Male always** | Female if `earnOnChat=ON`; Avalo (null) if `earnOnChat=OFF` |
| 3 | One has `earnOnChat=ON` | The one with `earnOnChat=OFF` | The one with `earnOnChat=ON` |
| 4 | Both have `earnOnChat=ON` | Chat initiator | Chat receiver |
| 5 | Both have `earnOnChat=OFF` | Chat initiator | `null` (Avalo earns) |

### 2.2 Is payer determined by roles, by who sends message, or by chat type?

Payer is determined by **participant profile attributes** (gender, `earnOnChat`, `influencerBadge`) evaluated once at chat creation. The identity of who sends individual messages does not change the payer.

**Code references:**
- [`chatMonetization.ts`](functions/src/chatMonetization.ts:115-290): `determineChatRoles()` — primary
- [`chats.ts`](functions/src/chats.ts:20-58): `determineChatRoles()` — legacy (simpler, no influencer/free-pool)
- [`pack273ChatEngine.ts`](functions/src/pack273ChatEngine.ts:146-312): `determinePack273ChatRoles()` — parallel implementation

### 2.3 Are there cases where both sides pay?

**No.** In all code paths, exactly one participant is designated as `payerId`. There is no bilateral payment logic.

However, there is a billing asymmetry:
- [`chatMonetization.ts`](functions/src/chatMonetization.ts:359-367): **Only the earner's messages are billed.** If the sender is NOT the earner, `tokensCost = 0`. The payer's own messages are free of charge. Billing is triggered by the earner writing words.
- [`chats.ts`](functions/src/chats.ts:286): **Only the payer is charged.** If `senderUid === chat.roles.payer && tokensCharged > 0`, tokens are deducted from escrow. (Note: This is the OPPOSITE billing direction — `chats.ts` bills the *payer's* messages, not the earner's.)

**⚠️ CONFLICT:** [`chatMonetization.ts`](functions/src/chatMonetization.ts:359-360) bills on **earner's messages** while [`chats.ts`](functions/src/chats.ts:286) bills on **payer's messages**. These are contradictory billing directions in the same repository.

### 2.4 Exact decision logic

**chatMonetization.ts** (primary path, lines 115–290):

```
IF (A.influencerBadge && A.earnOnChat && !B.influencerBadge):
  payer=B, earner=A
IF (B.influencerBadge && B.earnOnChat && !A.influencerBadge):
  payer=A, earner=B
IF heterosexual:
  payer=male
  IF female.earnOnChat:
    earner=female
  ELSE:
    checkFreePoolEligibility(female):
      IF low popularity + earnOff + account>5days → FREE_A (unlimited free)
      IF mid popularity + earnOff + account>5days → FREE_B (50 msgs)
      ELSE → PAID, earner=null (Avalo gets 100%)
IF one.earnOnChat && !other.earnOnChat:
  payer=other, earner=one
IF both.earnOnChat:
  payer=initiator, earner=receiver
IF both.earnOff:
  checkFreePoolEligibility(receiver)
  payer=initiator, earner=null (Avalo)
```

---

## 3. NON-EARN / LOW-POPULARITY FREE CHAT SYSTEM

### 3.1 What is the exact rule that makes a user eligible for free chat?

**In [`chatMonetization.ts`](functions/src/chatMonetization.ts:306-338)** — `checkFreePoolEligibility()`:

| Condition | Required Value | Effect |
|-----------|---------------|--------|
| `earnOnChat` | `false` (OFF) | Must be OFF |
| `accountAgeDays` | `> 5` | New users (0–5 days) are NEVER free |
| Trust engine | `canUseFreePool()` returns `true` | High/critical risk users excluded |
| `popularity` | `'low'` | → `FREE_A` mode (unlimited) |
| `popularity` | `'mid'` | → `FREE_B` mode (50 messages) |
| `popularity` | `'high'` | → `PAID` mode (not eligible) |

**In [`pack285FreeWindowFunnel.ts`](functions/src/pack285FreeWindowFunnel.ts:432-517)** — `isLowPopularityPromoEligible()`:

| Condition | Threshold | Logic |
|-----------|-----------|-------|
| `swipeRightRate` | ≤ 5% | OR condition |
| `matchesPerDay` | ≤ 1 | OR condition |
| `activeChatsPerWeek` | ≤ 2 | OR condition |
| Daily regional promos | < 100 per day per region | Hard limit |
| Regional concurrent | < 1000 per region | Hard limit |

### 3.2 How is that detected?

**Popularity** in [`chatMonetization.ts`](functions/src/chatMonetization.ts:952-957) — `getUserContext()`:
```typescript
if (user.stats?.followers < 100) → 'low'
else if (user.stats?.followers > 1000) → 'high'
else → 'mid'
```
This is based on `user.stats.followers` from the user document.

**Low-pop promo** in [`pack285FreeWindowFunnel.ts`](functions/src/pack285FreeWindowFunnel.ts:449-463):
Uses `user.stats.swipes.right / swipes.total`, `stats.matchesPerDay`, and `stats.activeChatsPerWeek`.

### 3.3 Does free chat for non-earn apply to both sides?

**Yes.** When a chat is classified as `FREE_A` or `FREE_B` / `FREE_LP` / `FULL_FREE`:
- Both sides can send messages without token deduction
- No escrow is required
- The `needsEscrow: false` flag prevents deposit requirement

References:
- [`chatMonetization.ts`](functions/src/chatMonetization.ts:188-192): `mode: 'FREE_A', needsEscrow: false, freeMessageLimit: Infinity`
- [`pack273ChatEngine.ts`](functions/src/pack273ChatEngine.ts:236-237): `mode: 'FREE_LP', freeMessageLimit: Infinity`
- [`pack285FreeWindowFunnel.ts`](functions/src/pack285FreeWindowFunnel.ts:106-116): `state: 'FULL_FREE'`, limits set to 9999

### 3.4 Does it bypass the payment gate entirely?

**Yes.** For `FREE_A` mode, after the initial 3+3 free messages are used, the chat stays FREE_ACTIVE forever:
- [`chatMonetization.ts`](functions/src/chatMonetization.ts:653-661): `if (chat.mode === 'FREE_A') { state: 'FREE_ACTIVE' /* stays free forever */ }`

For `FREE_B` mode, the chat is free up to 50 messages, then transitions to `AWAITING_DEPOSIT`:
- [`chatMonetization.ts`](functions/src/chatMonetization.ts:664-677): Checks `messageCount >= FREE_B_MESSAGE_LIMIT`

For `FREE_LP` in pack273:
- [`pack273ChatEngine.ts`](functions/src/pack273ChatEngine.ts:430-438): `if (chat.mode === 'FREE_LP') { /* stays free forever */ }`

---

## 4. CHAT ACCEPTANCE BY EARNING USER

### 4.1 Is there a required acceptance step before chat becomes active?

**No.** There is **no explicit earner acceptance step** implemented anywhere in the codebase. Chats become active immediately upon creation. The chat is initialized in `FREE_ACTIVE` state directly by:
- [`chatMonetization.ts`](functions/src/chatMonetization.ts:455): `state: 'FREE_ACTIVE'`
- [`pack273ChatEngine.ts`](functions/src/pack273ChatEngine.ts:341): `state: 'FREE_ACTIVE'`

### 4.2 What is the state machine for chat acceptance?

**Implementation missing.** There is no acceptance state machine. The `ChatStatus` enum in [`config.ts`](functions/src/config.ts:118-123) includes `QUEUED` but this status is never used in chat initialization or acceptance flows. It appears to be a placeholder.

### 4.3 What happens if the earning user does not accept?

**Not applicable.** Since there is no acceptance gate, the earning user cannot reject or decline a chat.

### 4.4 Is there any cap/limit of concurrent accepted chats for an earner?

There are **generic** concurrent chat limits (not earner-specific):
- [`config.ts`](functions/src/config.ts:72-73): `MAX_ACTIVE_CHATS_DEFAULT = 50`, `MAX_ACTIVE_CHATS_ROYAL = 100`
- [`pack385-traffic-guard.ts`](functions/src/pack385-traffic-guard.ts:231-238): `checkChatLimit()` counts active chats for a user against a max concurrent limit.

These are **per-user** limits, not earner-specific limits. There is no "earner must pick a subset of chats to continue" mechanism.

### 4.5 How is "earner must pick subset" implemented?

**Implementation missing.** No such logic exists in the codebase. The closest related concept is **Exclusive Mode** in PACK 452 ([`pack452-exclusive-mode.ts`](functions/src/pack452-exclusive-mode.ts)), where a payer pays a premium multiplier (≥10x) to lock the earner to their chat exclusively for a session, but this is payer-initiated, not earner-initiated.

---

## 5. FREE → PAID TRANSITION (PAYMENT GATE)

### 5.1 What triggers the payment gate?

In [`chatMonetization.ts`](functions/src/chatMonetization.ts:647-683) — `processMessageBilling()`:

The gate is triggered when **all free messages from both participants are exhausted** AND the chat mode requires escrow:

```
totalFreeUsed = sum of (FREE_MESSAGES_PER_PARTICIPANT - remaining) for each participant
IF totalFreeUsed >= FREE_MESSAGES_PER_PARTICIPANT * 2 (i.e., 6 total)
  AND chat.state === 'FREE_ACTIVE':
    IF mode === 'FREE_A': stay free forever
    IF mode === 'FREE_B': check 50-message cap, then AWAITING_DEPOSIT
    IF mode === 'PAID' + needsEscrow: → AWAITING_DEPOSIT
```

In [`pack273ChatEngine.ts`](functions/src/pack273ChatEngine.ts:429-451):
```
IF state === 'FREE_ACTIVE' AND totalFreeUsed >= totalFreeLimit:
    IF mode === 'FREE_LP': stay free forever
    ELSE: → AWAITING_PREPAID
```

### 5.2 What happens at the gate?

**Deposit/escrow model.** The state transitions to `AWAITING_DEPOSIT` (or `AWAITING_PREPAID` in pack273):
- Messages are **blocked** ([`chatMonetization.ts`](functions/src/chatMonetization.ts:681): returns `allowed: false, reason: 'Deposit required to continue chat'`)
- Payer must invoke [`processChatDeposit()`](functions/src/chatMonetization.ts:749-818) to pay the entry fee
- Deposit is split: 35% platform fee (non-refundable) + 65% escrow (refundable)
- Chat transitions to `PAID_ACTIVE`

### 5.3 Is there an "awaiting deposit" / "awaiting approval" state?

**Yes.** `AWAITING_DEPOSIT` is an explicit state:
- [`chatMonetization.ts`](functions/src/chatMonetization.ts:57): `'AWAITING_DEPOSIT'` in `ChatState` type
- [`pack273ChatEngine.ts`](functions/src/pack273ChatEngine.ts:43): `'AWAITING_PREPAID'` in `ChatState` type
- [`pack328b-chat-session-timeouts-types.ts`](functions/src/pack328b-chat-session-timeouts-types.ts:57): Includes both in state union

### 5.4 Does the system block sending until deposit is paid?

**Yes.** During `AWAITING_DEPOSIT`:
- [`chatMonetization.ts`](functions/src/chatMonetization.ts:680-681): Returns `{ allowed: false, reason: 'Deposit required to continue chat' }`
- [`pack273ChatEngine.ts`](functions/src/pack273ChatEngine.ts:454-460): Returns `{ allowed: false, reason: 'Waiting for prepaid deposit' }`

### 5.5 Exact state transitions

```
FREE_ACTIVE  ──(all free messages used)──→  AWAITING_DEPOSIT
                                                │
                                    (payer calls processChatDeposit)
                                                │
                                                ▼
                                          PAID_ACTIVE  ──(escrow depleted / close)──→  CLOSED
                                                │
                                    (48h/72h inactivity)
                                                │
                                                ▼
                                             CLOSED
```

For FREE_A/FREE_LP modes:
```
FREE_ACTIVE  ──(unlimited)──→  FREE_ACTIVE  ──(48h/72h inactivity)──→  CLOSED
```

For FREE_B mode:
```
FREE_ACTIVE  ──(50 msgs exhausted)──→  AWAITING_DEPOSIT  ──(deposit)──→  PAID_ACTIVE
```

---

## 6. PAID SESSION MODEL

### 6.1 Does the repo implement "sessions"?

**Partially.** Two different session models coexist:

**Model A — Escrow model** (chatMonetization.ts):
- State stored on `chats/{chatId}` document
- Fields: `billing.escrowBalance`, `billing.totalConsumed`, `billing.messageCount`, `billing.freeMessagesRemaining`
- Tokens are deducted from escrow per-message based on word count
- File: [`chatMonetization.ts`](functions/src/chatMonetization.ts:447-471)

**Model B — Prepaid bucket model** (pack273ChatEngine.ts):
- State stored on `pack273_chats/{chatId}` document
- Fields: `prepaidBucket.totalTokens`, `prepaidBucket.remainingTokens`, `prepaidBucket.wordsPerToken`, `prepaidBucket.remainingWords`, `prepaidBucket.usedWords`
- Word-bucket based: tokens map to word budgets
- File: [`pack273ChatEngine.ts`](functions/src/pack273ChatEngine.ts:75-81)

**Model C — Legacy model** (chats.ts):
- State stored on `chats/{chatId}` document
- Fields: `billing.currentBalance`, `billing.totalSpent`, `billing.wordsSent`, `billing.tokensSent`
- Simpler flat billing: payer charged per message
- File: [`chats.ts`](functions/src/chats.ts:90-95)

### 6.2 PACK 452 Extension: Premium sessions

PACK 452 adds `ChatMonetizationState` enum:
- [`pack452-monetization-vnext.types.ts`](functions/src/types/pack452-monetization-vnext.types.ts:111-115):
  - `FREE_PHASE`, `PAID_STANDARD`, `PAID_PREMIUM`, `EXCLUSIVE_ACTIVE`
- Premium context stored as `ChatPremiumContext` on the chat document
- Premium offers stored in `premiumOffers/{offerId}` collection

---

## 7. ENTRY FEE / DEPOSIT / UPFRONT PRICE

### 7.1 Is there a default entry fee currently implemented?

**Yes.** Multiple overlapping values:

| Source | Name | Default | Range |
|--------|------|---------|-------|
| [`chatMonetization.ts`](functions/src/chatMonetization.ts:98) | `CHAT_DEPOSIT_TOKENS` | **100** | Fixed |
| [`config.ts`](functions/src/config.ts:12) | `CHAT_INITIAL_DEPOSIT_TOKENS` | **100** | Fixed |
| [`pack273ChatEngine.ts`](functions/src/pack273ChatEngine.ts:125) | `BASE_CHAT_PRICE` | **100** | Fixed (max 500 via `priceModeration`) |
| [`pack242DynamicChatPricing.ts`](functions/src/pack242DynamicChatPricing.ts:119) | `PACK_242_BASELINE_PRICE` | **100** | 100–500 via tiers |
| [`pack452-entry-threshold.ts`](functions/src/pack452-entry-threshold.ts:39-43) | `ENTRY_THRESHOLD_LIMITS.DEFAULT` | **100** | 100–50,000 |

### 7.2 Is it called entry fee, deposit, or something else?

It is called different names across the codebase:
- `deposit` in [`chats.ts`](functions/src/chats.ts:155-161) and [`chatMonetization.ts`](functions/src/chatMonetization.ts:797-803)
- `chatEntryTokens` in [`pack452-entry-threshold.ts`](functions/src/pack452-entry-threshold.ts:34)
- `entryPrice` / `depositAmount` in [`chatMonetization.ts`](functions/src/chatMonetization.ts:772)
- `price` in [`pack273ChatEngine.ts`](functions/src/pack273ChatEngine.ts:57)
- `tokenCost` in [`pack242DynamicChatPricing.ts`](functions/src/pack242DynamicChatPricing.ts:36)

### 7.3 Is it charged once per chat or repeatedly?

**Once per chat.** The deposit is charged during the `AWAITING_DEPOSIT → PAID_ACTIVE` transition:
- [`chatMonetization.ts`](functions/src/chatMonetization.ts:786-815): Single transaction deducting from payer
- [`pack273ChatEngine.ts`](functions/src/pack273ChatEngine.ts:577-613): Single prepaid deposit

There is no auto-reload/replenish logic in the deposit flow itself. However, [`config.ts`](functions/src/config.ts:39-40) defines `AUTO_RELOAD_THRESHOLD_TOKENS = 20` and `AUTO_RELOAD_AMOUNT_TOKENS = 100`, and [`chats.ts`](functions/src/chats.ts:291-298) checks for `chat.autoReload` but only throws an error to retry rather than executing an auto-reload.

### 7.4 Is it refundable?

**Partially.**
- **Platform fee (35%):** Non-refundable. Charged immediately at deposit time ([`chatMonetization.ts`](functions/src/chatMonetization.ts:807-814)).
- **Escrow portion (65%):** Refundable upon chat close. The remaining `billing.escrowBalance` is returned to the payer's balance ([`chatMonetization.ts`](functions/src/chatMonetization.ts:841-868)).
- **Exception — Mismatch selfie** ([`pack273ChatEngine.ts`](functions/src/pack273ChatEngine.ts:648-654)): The payer also receives Avalo's 35% share of *used* tokens back.

### 7.5 Effective deposit calculation

In [`chatMonetization.ts`](functions/src/chatMonetization.ts:768-772) — `processChatDeposit()`:
```typescript
const pack452EntryTokens = await getEffectiveChatEntryTokens(earnerId); // 100–50,000
const pack242Price = await getPack242ChatEntryPrice(earnerId);           // 100–500
const depositAmount = Math.max(pack452EntryTokens, pack242Price);
```
The actual deposit is the **maximum** of the PACK 452 threshold and the PACK 242 dynamic price.

---

## 8. MULTIPLIER / DYNAMIC PRICING

### 8.1 Does the repo support a chat multiplier / popularity multiplier?

**Yes, two systems:**

**PACK 242 — Dynamic Entry Price** ([`pack242DynamicChatPricing.ts`](functions/src/pack242DynamicChatPricing.ts)):
- Not a multiplier on burn rate — modifies the **deposit amount** (100–500 tokens)
- Tiers: 0(100), 1(150), 2(200), 3(300), 4(400), 5(500)
- Eligibility: 60+ days active, 250+ partners, 70%+ reply rate, 4.3★+, 35k+ tokens/month
- Cannot be reduced once increased; 30-day cooldown between changes
- Locked to baseline (100) on 3 consecutive months of earnings drop (>15% drop)

**PACK 452 — Premium Burn Multiplier** ([`pack452-premium-burn-engine.ts`](functions/src/pack452-premium-burn-engine.ts)):
- Multiplies the **burn rate** per word bucket (1 × multiplier tokens per bucket instead of 1)
- Allowed values: `[2, 3, 5, 10, 15, 20]` ([`pack452-monetization-vnext.types.ts`](functions/src/types/pack452-monetization-vnext.types.ts:50))
- Exclusive mode requires multiplier ≥ 10 ([`pack452-monetization-vnext.types.ts`](functions/src/types/pack452-monetization-vnext.types.ts:54))

### 8.2 Can it be changed mid-chat?

- **PACK 242:** No. Only affects NEW chat sessions. Existing chats unaffected. ([`pack452-entry-threshold.ts`](functions/src/pack452-entry-threshold.ts:12))
- **PACK 452:** Yes. Premium offers can be sent mid-chat. A new offer with higher multiplier replaces the previous one. ([`pack452-premium-burn-engine.ts`](functions/src/pack452-premium-burn-engine.ts:16-17): "Premium applies from the next bucket after ACCEPT")

### 8.3 Does it apply immediately or to the next billing segment?

- **PACK 242:** Not applicable (deposit-time only).
- **PACK 452:** Applies from the **next bucket** after the earner accepts the premium offer. ([`pack452-premium-burn-engine.ts`](functions/src/pack452-premium-burn-engine.ts:16): "Premium applies from the next bucket after ACCEPT")

---

## 9. CHAT EXPIRATION / CLOSING / REFUND OR FORFEIT

### 9.1 What happens to tokens when a chat expires or closes?

**Unused escrow/deposit/prepaid tokens:**
- [`chatMonetization.ts`](functions/src/chatMonetization.ts:839-858): **Refunded.** `remainingEscrow` is added back to payer's `balance` and deducted from `pending`.
- [`chats.ts`](functions/src/chats.ts:444-473): **Refunded.** `billing.currentBalance` returned to payer.
- [`pack273ChatEngine.ts`](functions/src/pack273ChatEngine.ts:646): **Refunded.** `prepaidBucket.remainingTokens` returned to payer.

**Accumulated/consumed tokens:**
- Already transferred to earner's wallet during message processing. Not reversed on close.

**Platform fee (35% of deposit):**
- **Never refunded.** Charged at deposit time, not included in escrow.
- Exception: mismatch selfie in pack273 ([`pack273ChatEngine.ts`](functions/src/pack273ChatEngine.ts:648-654)) — Avalo's share of *used* tokens is also refunded to payer.

**Pending/reserved tokens (PACK 452):**
- [`chatMonetization.ts`](functions/src/chatMonetization.ts:897-902): `releasePremiumOnChatEnd(chatId)` is called on close to release reserved premium offer tokens.

### 9.2 Are tokens refunded, forfeited, or partially refunded?

| Scenario | Unused Escrow | Platform Fee (35%) | Consumed Tokens |
|----------|---------------|-------------------|-----------------|
| Manual close by either party | **Refunded** to payer | **Forfeited** (kept by Avalo) | Already credited to earner |
| Auto-expire (inactivity) | **Refunded** to payer | **Forfeited** | Already credited to earner |
| Mismatch selfie (pack273) | **Refunded** + Avalo share of used | **Forfeited** (but Avalo's 35% of used refunded) | Already credited to earner |
| Earner voluntary refund | **Refunded** to payer | Not affected | Already credited to earner |
| Close during FREE phase | No escrow exists | N/A | N/A (no billing) |

### 9.3 What timeouts control expiration?

| Timeout | Value | Source |
|---------|-------|--------|
| General inactivity | **48 hours** | [`chatMonetization.ts`](functions/src/chatMonetization.ts:100): `INACTIVITY_TIMEOUT_HOURS = 48` |
| Config-level expiry | **48 hours** | [`config.ts`](functions/src/config.ts:43-44): `CHAT_EXPIRY_HOURS = 48` |
| Pack273: post-paid inactivity | **48 hours** | [`pack273ChatEngine.ts`](functions/src/pack273ChatEngine.ts:129): `INACTIVITY_TIMEOUT_48H` |
| Pack273: total inactivity | **72 hours** | [`pack273ChatEngine.ts`](functions/src/pack273ChatEngine.ts:130): `TOTAL_INACTIVITY_TIMEOUT_72H` |
| Pack328b: free chat timeout | **48 hours** | [`pack328b-chat-session-timeouts-types.ts`](functions/src/pack328b-chat-session-timeouts-types.ts:31): `FREE_CHAT_TIMEOUT_HOURS: 48` |
| Pack328b: paid chat timeout | **72 hours** | [`pack328b-chat-session-timeouts-types.ts`](functions/src/pack328b-chat-session-timeouts-types.ts:34): `PAID_CHAT_TIMEOUT_HOURS: 72` |
| Pack452: exclusive inactivity | **30 minutes** | [`pack452-monetization-vnext.types.ts`](functions/src/types/pack452-monetization-vnext.types.ts:153): `EXCLUSIVE_INACTIVITY_TIMEOUT_MS` |
| Premium offer validity | **12 hours** | [`pack452-monetization-vnext.types.ts`](functions/src/types/pack452-monetization-vnext.types.ts:57): `PREMIUM_OFFER_VALIDITY_MS` |

**⚠️ DISCREPANCY:** chatMonetization.ts uses 48h flat while pack273/pack328b distinguish between 48h (free) and 72h (paid).

---

## A) CHAT MONETIZATION TRUTH TABLE

| Scenario | Who Pays | Message Allowed | Tokens Deducted | Split Applied | Refund Behavior | State Fields | File:Line |
|----------|----------|----------------|-----------------|---------------|-----------------|--------------|-----------|
| **Earner vs Non-earner, Free phase** | Non-earner (payer) designated but not charged | ✅ Yes | 0 | None | N/A | `state: FREE_ACTIVE`, `billing.freeMessagesRemaining > 0` | [`chatMonetization.ts:631-644`](functions/src/chatMonetization.ts:631) |
| **Earner vs Non-earner, Paid phase (earner sends)** | Non-earner wallet → escrow depleted | ✅ Yes | `wordCount / wordsPerToken` from escrow | 65/35 at deposit time | Unused escrow refunded on close | `state: PAID_ACTIVE`, `billing.escrowBalance > 0` | [`chatMonetization.ts:686-728`](functions/src/chatMonetization.ts:686) |
| **Earner vs Non-earner, Paid phase (payer sends)** | No charge | ✅ Yes | 0 | None (payer messages free) | N/A | `state: PAID_ACTIVE` | [`chatMonetization.ts:359-367`](functions/src/chatMonetization.ts:359) |
| **Non-earn FREE_A (low pop)** | Designated payer never charged | ✅ Yes (unlimited) | 0 | None | N/A (no deposit) | `mode: FREE_A`, `needsEscrow: false` | [`chatMonetization.ts:188-192`](functions/src/chatMonetization.ts:188) |
| **Non-earn FREE_B (mid pop)** | Designated payer, charged after 50 msgs | ✅ ≤50 msgs / ❌ after | 0 during free, deposit after | 65/35 at deposit | Unused escrow refunded | `mode: FREE_B`, limit 50 msgs | [`chatMonetization.ts:200-203`](functions/src/chatMonetization.ts:200) |
| **Both Earn OFF, PAID** | Initiator pays, Avalo earns | ✅ after deposit | Full token cost → Avalo (100%) | 100% to Avalo | Unused escrow refunded | `earnerId: null`, `mode: PAID` | [`chatMonetization.ts:282-289`](functions/src/chatMonetization.ts:282) |
| **Chat expired during free** | N/A | ❌ (closed) | 0 | None | N/A (no deposit) | `state: CLOSED` | [`chatMonetization.ts:911-931`](functions/src/chatMonetization.ts:911) |
| **Chat expired during paid** | N/A | ❌ (closed) | 0 (at close time) | N/A | Remaining escrow refunded to payer | `state: CLOSED`, `billing.escrowBalance → 0` | [`chatMonetization.ts:824-904`](functions/src/chatMonetization.ts:824) |
| **Premium burn (PACK 452)** | Payer wallet (reserved + available) | ✅ Yes | `bucketCount × multiplier` | 65/35 per burn | Reserved tokens released on chat end | `monetizationState: PAID_PREMIUM` | [`chatMonetization.ts:590-620`](functions/src/chatMonetization.ts:590) |
| **Exclusive mode (PACK 452)** | Payer wallet (reserved + available) | ✅ Earner locked to this chat | `bucketCount × multiplier (≥10)` | 65/35 per burn | Released on 30min inactivity or close | `monetizationState: EXCLUSIVE_ACTIVE` | [`chatMonetization.ts:590-620`](functions/src/chatMonetization.ts:590) |

---

## B) STATE MACHINE DIAGRAM (TEXT FORM)

```
                             ┌──────────────────────────────┐
                             │        CHAT CREATED           │
                             │   (determineChatRoles called) │
                             └──────────────┬───────────────┘
                                            │
                                            ▼
                             ┌──────────────────────────────┐
                             │       FREE_ACTIVE             │
                             │  freeMessagesRemaining > 0    │
                             │  per-participant counters      │
                             └──────────────┬───────────────┘
                                            │
                     ┌──────────────────────┼──────────────────────┐
                     │                      │                      │
              mode=FREE_A            mode=FREE_B             mode=PAID
              (low pop)              (mid pop)               (earner exists)
                     │                      │                      │
                     ▼                      ▼                      ▼
            ┌────────────────┐   ┌──────────────────┐   ┌──────────────────┐
            │  FREE_ACTIVE   │   │   FREE_ACTIVE    │   │ AWAITING_DEPOSIT │
            │  (unlimited)   │   │   (≤50 msgs)     │   │ (blocked until   │
            │  needsEscrow=F │   │   needsEscrow=F  │   │  payer deposits) │
            └───────┬────────┘   └────────┬─────────┘   └────────┬─────────┘
                    │                     │                       │
             (48h inactivity)      (50 msgs OR 48h)        (payer pays deposit)
                    │                     │                       │
                    ▼                     ▼                       ▼
            ┌────────────────┐   ┌──────────────────┐   ┌──────────────────┐
            │    CLOSED      │   │ AWAITING_DEPOSIT  │   │   PAID_ACTIVE    │
            │ (no refund     │   │ OR CLOSED          │   │ escrowBalance>0  │
            │  needed)       │   └──────────────────┘   └────────┬─────────┘
            └────────────────┘                                    │
                                                    ┌─────────────┼─────────────┐
                                                    │             │             │
                                              (escrow=0)   (48/72h timeout)  (manual close)
                                                    │             │             │
                                                    ▼             ▼             ▼
                                              ┌──────────────────────────────────────┐
                                              │              CLOSED                   │
                                              │  remainingEscrow → refund to payer    │
                                              │  platformFee → kept by Avalo          │
                                              └──────────────────────────────────────┘
```

**PACK 452 Premium Extension:**
```
   PAID_ACTIVE (PAID_STANDARD)
        │
   (payer creates premium offer)
        │
        ▼
   PENDING_OFFER  ──(12h expire)──→  PAID_STANDARD (offer expired, tokens unreserved)
        │
   (earner ACCEPTS)───(earner DECLINES)──→  PAID_STANDARD (tokens unreserved)
        │
        ▼
   PAID_PREMIUM  ──(multiplier × burn per bucket)
        │
   (exclusive=true, multiplier≥10)
        │
        ▼
   EXCLUSIVE_ACTIVE  ──(earner locked to this chat)──(30min inactivity)──→  PAID_PREMIUM
```

**Triggers and code references:**
| Transition | Trigger | Code Reference |
|------------|---------|----------------|
| Created → FREE_ACTIVE | `initializeChat()` | [`chatMonetization.ts:455`](functions/src/chatMonetization.ts:455) |
| FREE_ACTIVE → AWAITING_DEPOSIT | All free messages exhausted + PAID mode | [`chatMonetization.ts:679-681`](functions/src/chatMonetization.ts:679) |
| AWAITING_DEPOSIT → PAID_ACTIVE | `processChatDeposit()` called | [`chatMonetization.ts:794-795`](functions/src/chatMonetization.ts:794) |
| PAID_ACTIVE → CLOSED | `closeAndSettleChat()` | [`chatMonetization.ts:862`](functions/src/chatMonetization.ts:862) |
| ANY_ACTIVE → CLOSED | 48h inactivity | [`chatMonetization.ts:911-931`](functions/src/chatMonetization.ts:911) |
| FREE_B exhausted → AWAITING_DEPOSIT | 50 messages reached | [`chatMonetization.ts:666-668`](functions/src/chatMonetization.ts:666) |

---

## C) CONFIG SOURCES

### Free Message Limits

| Constant | Value | File:Line |
|----------|-------|-----------|
| `CHAT_FREE_MESSAGES_PER_USER` | 3 | [`config.ts:13`](functions/src/config.ts:13) |
| `FREE_MESSAGES_PER_PARTICIPANT` | 3 | [`chatMonetization.ts:95`](functions/src/chatMonetization.ts:95) |
| `CONTRACT_RULES.CHAT.FREE_MESSAGES_PER_PARTICIPANT` | 3 | [`pack246-contract-types.ts:28`](functions/src/pack246-contract-types.ts:28) |
| `FREE_MESSAGES_LOW_POP` | 10 | [`pack273ChatEngine.ts:123`](functions/src/pack273ChatEngine.ts:123) |
| `FREE_MESSAGES_ROYAL` | 6 | [`pack273ChatEngine.ts:124`](functions/src/pack273ChatEngine.ts:124) |
| `FREE_MESSAGES_LOW_POPULARITY_PER_USER` | 10 | [`pack285FreeWindowFunnel.ts:75`](functions/src/pack285FreeWindowFunnel.ts:75) |
| `FREE_MESSAGES_ROYAL_PER_USER` | 6 | [`pack285FreeWindowFunnel.ts:76`](functions/src/pack285FreeWindowFunnel.ts:76) |
| `FREE_MESSAGES_STANDARD_PER_USER` | 8 | [`pack285FreeWindowFunnel.ts:77`](functions/src/pack285FreeWindowFunnel.ts:77) |
| `FREE_MESSAGES_PER_CHAT` | 4 | [`matchingEngine.ts:43`](functions/src/matchingEngine.ts:43) |
| `FREE_B_MESSAGE_LIMIT` | 50 | [`chatMonetization.ts:96`](functions/src/chatMonetization.ts:96) |

### Words Per Token

| Constant | Value | File:Line |
|----------|-------|-----------|
| `WORDS_PER_TOKEN_STANDARD` | 11 | [`chatMonetization.ts:94`](functions/src/chatMonetization.ts:94) |
| `WORDS_PER_TOKEN_ROYAL` | 7 | [`chatMonetization.ts:93`](functions/src/chatMonetization.ts:93) |
| `WORDS_PER_TOKEN_STANDARD` | 11 | [`config.ts:18`](functions/src/config.ts:18) |
| `WORDS_PER_TOKEN_ROYAL_EARNER` | 7 | [`config.ts:19`](functions/src/config.ts:19) |
| `WORDS_PER_TOKEN_STANDARD` | 11 | [`pack273ChatEngine.ts:121`](functions/src/pack273ChatEngine.ts:121) |
| `WORDS_PER_TOKEN_ROYAL` | 7 | [`pack273ChatEngine.ts:122`](functions/src/pack273ChatEngine.ts:122) |
| `WORDS_PER_TOKEN_STANDARD` | 11 | [`pack452-premium-burn-engine.ts:43`](functions/src/pack452-premium-burn-engine.ts:43) |
| `WORDS_PER_TOKEN_ROYAL` | 7 | [`pack452-premium-burn-engine.ts:46`](functions/src/pack452-premium-burn-engine.ts:46) |
| `CONTRACT_RULES.CHAT.WORDS_PER_TOKEN_STANDARD` | 11 | [`pack246-contract-types.ts:26`](functions/src/pack246-contract-types.ts:26) |
| `CONTRACT_RULES.CHAT.WORDS_PER_TOKEN_ROYAL` | 7 | [`pack246-contract-types.ts:27`](functions/src/pack246-contract-types.ts:27) |

All consistent: **Standard = 11, Royal = 7.**

### Default Entry Fee / Deposit

| Constant | Value | File:Line |
|----------|-------|-----------|
| `CHAT_DEPOSIT_TOKENS` | 100 | [`chatMonetization.ts:98`](functions/src/chatMonetization.ts:98) |
| `CHAT_INITIAL_DEPOSIT_TOKENS` | 100 | [`config.ts:12`](functions/src/config.ts:12) |
| `BASE_CHAT_PRICE` | 100 | [`pack273ChatEngine.ts:125`](functions/src/pack273ChatEngine.ts:125) |
| `PACK_242_BASELINE_PRICE` | 100 | [`pack242DynamicChatPricing.ts:119`](functions/src/pack242DynamicChatPricing.ts:119) |
| `ENTRY_THRESHOLD_LIMITS.DEFAULT` | 100 | [`pack452-monetization-vnext.types.ts:41`](functions/src/types/pack452-monetization-vnext.types.ts:41) |
| `ENTRY_THRESHOLD_LIMITS.MIN` | 100 | [`pack452-monetization-vnext.types.ts:40`](functions/src/types/pack452-monetization-vnext.types.ts:40) |
| `ENTRY_THRESHOLD_LIMITS.HARD_CAP` | 50,000 | [`pack452-monetization-vnext.types.ts:42`](functions/src/types/pack452-monetization-vnext.types.ts:42) |
| `CONTRACT_RULES.CHAT.STANDARD_PRICE` | 100 | [`pack246-contract-types.ts:23`](functions/src/pack246-contract-types.ts:23) |
| `CONTRACT_RULES.CHAT.MAX_PRICE` | 500 | [`pack246-contract-types.ts:25`](functions/src/pack246-contract-types.ts:25) |

All consistent on base: **100 tokens.**

### Expiry Times

| Constant | Value | File:Line |
|----------|-------|-----------|
| `INACTIVITY_TIMEOUT_HOURS` | 48h | [`chatMonetization.ts:100`](functions/src/chatMonetization.ts:100) |
| `CHAT_EXPIRY_HOURS` | 48h | [`config.ts:43`](functions/src/config.ts:43) |
| `INACTIVITY_TIMEOUT_48H` | 48h | [`pack273ChatEngine.ts:129`](functions/src/pack273ChatEngine.ts:129) |
| `TOTAL_INACTIVITY_TIMEOUT_72H` | 72h | [`pack273ChatEngine.ts:130`](functions/src/pack273ChatEngine.ts:130) |
| `FREE_CHAT_TIMEOUT_HOURS` | 48h | [`pack328b-chat-session-timeouts-types.ts:31`](functions/src/pack328b-chat-session-timeouts-types.ts:31) |
| `PAID_CHAT_TIMEOUT_HOURS` | 72h | [`pack328b-chat-session-timeouts-types.ts:34`](functions/src/pack328b-chat-session-timeouts-types.ts:34) |
| `EXCLUSIVE_INACTIVITY_TIMEOUT_MS` | 30min | [`pack452-monetization-vnext.types.ts:153`](functions/src/types/pack452-monetization-vnext.types.ts:153) |

### Non-Earn Free Chat Eligibility

| Parameter | Threshold | File:Line |
|-----------|-----------|-----------|
| `earnOnChat` | Must be OFF | [`chatMonetization.ts:311`](functions/src/chatMonetization.ts:311) |
| `accountAgeDays` | > 5 days | [`chatMonetization.ts:316`](functions/src/chatMonetization.ts:316), constant at [`chatMonetization.ts:97`](functions/src/chatMonetization.ts:97) |
| `popularity` low (followers < 100) | → FREE_A | [`chatMonetization.ts:327`](functions/src/chatMonetization.ts:327) |
| `popularity` mid (100–1000 followers) | → FREE_B | [`chatMonetization.ts:332`](functions/src/chatMonetization.ts:332) |
| Trust engine | `canUseFreePool()` must return true | [`chatMonetization.ts:321`](functions/src/chatMonetization.ts:321) |
| Low-pop promo: swipeRightRate | ≤ 5% | [`pack285FreeWindowFunnel.ts:455`](functions/src/pack285FreeWindowFunnel.ts:455) |
| Low-pop promo: matchesPerDay | ≤ 1 | [`pack285FreeWindowFunnel.ts:456`](functions/src/pack285FreeWindowFunnel.ts:456) |
| Low-pop promo: activeChatsPerWeek | ≤ 2 | [`pack285FreeWindowFunnel.ts:457`](functions/src/pack285FreeWindowFunnel.ts:457) |

### Multiplier Rules

| Parameter | Value | File:Line |
|-----------|-------|-----------|
| PACK 242 tiers | [100, 150, 200, 300, 400, 500] | [`pack242DynamicChatPricing.ts:121-158`](functions/src/pack242DynamicChatPricing.ts:121) |
| PACK 452 premium multipliers | [2, 3, 5, 10, 15, 20] | [`pack452-monetization-vnext.types.ts:50`](functions/src/types/pack452-monetization-vnext.types.ts:50) |
| Exclusive min multiplier | 10 | [`pack452-monetization-vnext.types.ts:54`](functions/src/types/pack452-monetization-vnext.types.ts:54) |
| Revenue split | 65% earner / 35% platform (chat) | [`pack277-wallet-service.ts:41`](functions/src/pack277-wallet-service.ts:41), [`chatMonetization.ts:99`](functions/src/chatMonetization.ts:99) |

### Payout Rate

| Constant | Value | File:Line |
|----------|-------|-----------|
| `TOKEN_PAYOUT_USD` | 0.03 USD | [`config/economyConfig.ts:30`](functions/src/config/economyConfig.ts:30) |
| `TOKEN_PAYOUT_PLN` | 0.12 PLN (derived) | [`config/economyConfig.ts:58`](functions/src/config/economyConfig.ts:58) |

---

## D) CONSISTENCY CHECK ACROSS EXECUTION PATHS

### Path 1: `chatMonetization.ts` (PRIMARY)

| Aspect | Implementation |
|--------|---------------|
| Free messages | 3 per participant (6 total) |
| Who pays | Priority: influencer → heterosexual → earnOnChat → initiator |
| Free pool | Low pop = unlimited; Mid pop = 50 msgs |
| Payment gate | AWAITING_DEPOSIT state, blocks messages |
| Deposit | `max(pack452, pack242)` dynamic pricing |
| Billing direction | **Earner's messages** trigger token deduction |
| Expiry/refund | 48h timeout; remaining escrow refunded; 35% fee kept |
| Multiplier | PACK 452 premium burn (2-20×) applies mid-chat |
| Collection | `chats/{chatId}` |

### Path 2: `chats.ts` (LEGACY)

| Aspect | Implementation |
|--------|---------------|
| Free messages | 3 per user (set at deposit time, not tracked during free phase) |
| Who pays | Simpler: heterosexual → initiator pays |
| Free pool | **Not implemented** |
| Payment gate | No gate — deposit happens immediately via `startChatCallable` |
| Deposit | Fixed 100 tokens (`CHAT_INITIAL_DEPOSIT_TOKENS`) |
| Billing direction | **Payer's messages** trigger token deduction (⚠️ OPPOSITE) |
| Expiry/refund | No auto-expire; manual close refunds `billing.currentBalance` |
| Multiplier | **Not supported** |
| Collection | `chats/{chatId}` (same collection, different schema) |

### Path 3: `pack273ChatEngine.ts` (PARALLEL)

| Aspect | Implementation |
|--------|---------------|
| Free messages | 10 (low-pop) or 6 (Royal) per participant |
| Who pays | Male influencer exception + heterosexual + earnMode |
| Free pool | `FREE_LP` mode for low-pop users (infinite) |
| Payment gate | AWAITING_PREPAID state, blocks messages |
| Deposit | Configurable 100-500 tokens via priceModeration |
| Billing direction | **Earner's messages** trigger token deduction |
| Expiry/refund | 48h (post-paid) / 72h (total); unused bucket refunded; mismatch selfie = full refund |
| Multiplier | **Not supported** (base price moderation only) |
| Collection | `pack273_chats/{chatId}` (different collection) |

### Path 4: `pack285FreeWindowFunnel.ts` (FUNNEL LAYER)

| Aspect | Implementation |
|--------|---------------|
| Free messages | 10 (low-pop), 6 (Royal), 8 (standard) per user |
| Who pays | Delegates to PACK 273 roles |
| Free pool | `LOW_POP_FREE` / `FULL_FREE` modes; regional daily limits |
| Payment gate | `PAID` state blocks payer until deposit |
| Deposit | Delegates to PACK 273 |
| Billing direction | Delegates to PACK 273 |
| Expiry/refund | **Not implemented** in this module (delegates) |
| Multiplier | **Not supported** |
| Collection | `chats/{chatId}` (overwrites!) |

### Path 5: `pack277-wallet-service.ts` (WALLET SERVICE)

| Aspect | Implementation |
|--------|---------------|
| Free messages | **Not aware** — wallet service is called after billing decision |
| Who pays | Receives `userId` (payer) as parameter |
| Free pool | **Not aware** |
| Payment gate | Balance check: `availableBalance < amountTokens` → INSUFFICIENT_FUNDS |
| Deposit | Not handled directly (chat deposit is in chatMonetization.ts) |
| Billing direction | Direction-agnostic: processes spend/earn/refund requests |
| Expiry/refund | Full refund support via `refundTokens()`, with optional platform share claw-back |
| Multiplier | **Not aware** — receives final token amount |
| Reserved tokens | PACK 452 support: `reservedTokens` field deducted from available balance |

### ⚠️ CRITICAL CONFLICTS IDENTIFIED

1. **Billing direction mismatch:** [`chatMonetization.ts:360`](functions/src/chatMonetization.ts:360) bills on earner's messages. [`chats.ts:286`](functions/src/chats.ts:286) bills on payer's messages. Both operate on the same `chats` Firestore collection.

2. **Free message count divergence:** 3 (chatMonetization + config), 4 (matchingEngine), 6 (pack273 Royal), 8 (pack285 standard), 10 (pack273/pack285 low-pop). No single source of truth; each module defines its own constants independently.

3. **Collection collision:** Both `chatMonetization.ts` and `pack285FreeWindowFunnel.ts` write to `chats/{chatId}` with different document schemas. `pack273ChatEngine.ts` writes to `pack273_chats/{chatId}` (separate collection).

4. **No acceptance flow:** Chat acceptance by earners is not implemented despite being referenced in spec documents.

5. **Free-pool race condition:** [`chatMonetization.ts`](functions/src/chatMonetization.ts:316) uses `accountAgeDays > 5` threshold but popularity is determined by `user.stats.followers` which may not exist for new accounts.

---

*End of audit addendum.*
