# CANONICAL MONETIZATION SPECIFICATION — Single Source of Truth

> **Status:** LOCKED — Latest Canonical (supersedes all prior specs)
> **Date:** 2026-03-02
> **Authority:** Lead System Architect
> **Scope:** Chat monetization, deposit/escrow, multipliers, free pool, acceptance flow

All rules below are **final canonical** and override conflicting logic in any existing
code, doc, or PACK. No partial implementation, no parallel engines.

---

## 1. Role Logic — Payer / Earner Truth Table

### 1.1 Priority Order (evaluated top-to-bottom, first match wins)

| Priority | Rule | Condition | Payer | Earner |
|----------|------|-----------|-------|--------|
| **P1** | Influencer Override | Exactly ONE participant has `influencerBadge=ON` AND `earn_on=ON` | The other participant (fan) | The influencer-earner |
| **P1b** | Both Influencers | BOTH have `influencerBadge=ON` AND `earn_on=ON` | Falls through to P2/P3 (gender/initiator rules apply) | — |
| **P2** | Hetero: female `earn_on=ON` | M↔F pair, female has `earn_on=ON` | Male (always) | Female |
| **P2b** | Hetero: female `earn_on=OFF` | M↔F pair, female has `earn_on=OFF` | Male (always) | `null` → Avalo earns 100% |
| **P3** | Same-sex / NB: one `earn_on=ON` | Only one participant has `earn_on=ON` | The other participant | The `earn_on=ON` participant |
| **P3b** | Same-sex / NB: both `earn_on=ON` | Both have `earn_on=ON` | Initiator | Receiver |
| **P3c** | Same-sex / NB: both `earn_on=OFF` | Neither has `earn_on=ON` | Initiator | `null` → Avalo earns 100% |

### 1.2 Hard Invariants

- **Hetero rule:** Male **always** pays the chat deposit and all chat costs, regardless of who initiated.
- **Influencer override:** Any gender with `influencerBadge=ON` AND `earn_on=ON` becomes earner; the other participant becomes payer (fan pays). This replaces "male-only influencer" exception.
- **Earn eligibility:** A profile earns **only if** `earn_on=ON`. If `earn_on=OFF`, that profile cannot be earner regardless of gender.
- **Avalo as earner:** When `earnerId=null`, Avalo receives 100% of consumed escrow (no creator share).

### 1.3 Billing Direction (Hard Rule)

- **Only earner's words are billable.** The system counts words in each message sent by the earner and bills accordingly.
- **Payer never pays for payer's own messages.** If payer sends a message, cost = 0.
- When `earnerId=null` (Avalo earns), the system still bills earner-side words (in this case, those words burn escrow → 100% to Avalo).

---

## 2. Chat State Machine

```
┌──────────┐
│  MATCHED  │ ← Match created (mutual like or system match)
└────┬─────┘
     │ Earner sees pending chat
     ▼
┌───────────────────┐
│ PENDING_ACCEPTANCE │ ← Earner must explicitly accept
└────┬──────────────┘
     │ Earner accepts          │ Earner declines
     ▼                         ▼
┌────────────┐           ┌─────────┐
│ FREE_ACTIVE │           │ DECLINED │ (terminal)
└────┬───────┘           └─────────┘
     │ Free messages exhausted (per-participant)
     │ AND mode requires deposit
     ▼
┌─────────────────┐
│ AWAITING_DEPOSIT │ ← Payer must deposit ≥ 100 tokens
└────┬────────────┘
     │ Deposit paid (35% fee → Avalo, 65% → escrow)
     ▼
┌─────────────┐
│ PAID_ACTIVE  │ ← Escrow consumed bucket-by-bucket
└────┬────────┘
     │ Escrow depleted / Chat closed / 48h inactivity
     ▼
┌──────────────────┐
│ END / EXPIRY      │ ← Unused escrow refunded to payer
│                    │   Avalo fee NOT refunded
└──────────────────┘
```

### 2.1 Acceptance Flow (MUST be implemented)

1. After match creation, status = `MATCHED`.
2. Earner receives notification of pending chat.
3. Earner explicitly **accepts** → status transitions to `FREE_ACTIVE`.
4. Earner may **decline** → status = `DECLINED` (terminal).
5. Multiple chats can queue as `PENDING_ACCEPTANCE`.
6. Earner may also decline **after** the free phase (before deposit).

### 2.2 State Transitions

| From | To | Trigger |
|------|----|---------|
| `MATCHED` | `PENDING_ACCEPTANCE` | Chat created after match |
| `PENDING_ACCEPTANCE` | `FREE_ACTIVE` | Earner accepts |
| `PENDING_ACCEPTANCE` | `DECLINED` | Earner declines |
| `FREE_ACTIVE` | `AWAITING_DEPOSIT` | Free messages exhausted + mode requires escrow |
| `FREE_ACTIVE` | `CLOSED` | Participant closes chat / inactivity |
| `AWAITING_DEPOSIT` | `PAID_ACTIVE` | Payer deposits ≥ min deposit |
| `AWAITING_DEPOSIT` | `CLOSED` | Participant closes / inactivity |
| `PAID_ACTIVE` | `PAID_ACTIVE` | Additional deposit (top-up) |
| `PAID_ACTIVE` | `CLOSED` | Escrow depleted / close / inactivity 48h |

---

## 3. Deposit / Escrow Math

### 3.1 Constants

| Constant | Value | Notes |
|----------|-------|-------|
| Minimum deposit | **100 tokens** | Hard floor. Never below 100. |
| Avalo fee | **35%** of deposit | Charged immediately. Non-refundable. |
| Escrow | **65%** of deposit | Remaining balance for earner consumption. |
| Inactivity timeout | **48 hours** | Chat expires → unused escrow refunded. |

### 3.2 Earner-Set Deposit

- Earner may set a **higher deposit** for the **next** session. Never below 100 tokens.
- Deposit amount and multiplier can be changed **only between sessions**, never mid-session.
- The deposit set by earner replaces algorithmic pricing systems (PACK 242).

### 3.3 Deposit Flow

```
Payer deposits D tokens (D ≥ 100, or earner's custom minimum)
  ├── Avalo fee    = ceil(D × 0.35)  → immediately transferred to Avalo, non-refundable
  └── Escrow       = D − avaloFee    → held for bucket-by-bucket consumption
```

### 3.4 Escrow Consumption

- Each earner message → words counted → `tokens = ceil(wordCount / wordsPerToken)`
- `tokens × multiplier` deducted from escrow (see §5 Multiplier Rules)
- If `earnerId != null`: tokens transferred from escrow to earner wallet
- If `earnerId == null`: tokens transferred from escrow to Avalo

### 3.5 On Chat End / Expiry

- **Unused escrow** → refunded to payer
- **Avalo fee** → NOT refunded (non-reversible)

### 3.6 Fraud / Selfie Mismatch Refund

- 100% refund (including Avalo fee) applies **ONLY** to meeting/calendar/events
- Does **NOT** apply to chat

### 3.7 Worked Examples

#### Example A: Standard earner, 100-token deposit, no multiplier

```
Deposit           = 100 tokens
Avalo fee (35%)   = 35 tokens  → Avalo (non-refundable)
Escrow            = 65 tokens

Earner sends message: "Hello, how are you doing today?" (6 words)
tokens = ceil(6 / 11) = 1 token
Escrow: 65 → 64  |  Earner wallet: +1

Earner sends message: "I had a really wonderful day at the beach with friends
and we watched the sunset together" (16 words)
tokens = ceil(16 / 11) = 2 tokens
Escrow: 64 → 62  |  Earner wallet: +2

Payer sends message: "That sounds amazing tell me more" (6 words)
tokens = 0  (payer's words are NEVER billed)

Chat closed with 62 tokens unused:
  → 62 tokens refunded to payer
  → Avalo fee (35 tokens) NOT refunded
```

#### Example B: Royal earner, 200-token deposit, 3x multiplier

```
Deposit           = 200 tokens
Avalo fee (35%)   = 70 tokens  → Avalo
Escrow            = 130 tokens

Earner sends: "Hey there" (2 words)
base tokens  = ceil(2 / 7) = 1 token
with 3x mult = 1 × 3 = 3 tokens burned
Escrow: 130 → 127  |  Earner wallet: +3

Earner sends: "I love this beautiful evening we should plan something fun
together for the weekend" (13 words)
base tokens  = ceil(13 / 7) = 2 tokens
with 3x mult = 2 × 3 = 6 tokens burned
Escrow: 127 → 121  |  Earner wallet: +6
```

#### Example C: earn_on=OFF (Avalo earns), 100-token deposit

```
Deposit           = 100 tokens
Avalo fee (35%)   = 35 tokens  → Avalo
Escrow            = 65 tokens

Non-earner's words are still billed (Avalo is the "earner"):
Message: "Hello nice to meet you" (5 words)
tokens = ceil(5 / 11) = 1 token
Escrow: 65 → 64  |  Avalo receives: +1 (total Avalo = 36)

Chat closed with 64 tokens unused → 64 refunded to payer
Final Avalo take = 35 (fee) + 1 (escrow consumed) = 36
```

---

## 4. Text Chat Buckets (Hard Rule)

| Earner Tier | Words per Token (bucket) |
|-------------|--------------------------|
| **Standard** | 11 words = 1 token |
| **Royal** | 7 words = 1 token |

- System counts **words**, not messages.
- Calculation: `tokensCost = ceil(wordCount / wordsPerToken)`
- URLs and emoji are excluded from word count.

---

## 5. Multiplier Rules

### 5.1 Allowed Multipliers

```
[2, 3, 4, 5, 7, 10, 12, 15, 20]
```

### 5.2 Default Multiplier

- Default = **1** (not user-selectable; it's the implicit base rate)
- Multiplier 1 is never listed in the UI selection.

### 5.3 Multiplier Behavior

- Multiplier affects **burn rate only**: `tokens_burned = base_tokens × multiplier`
- Higher multiplier = earner earns more per word, escrow depletes faster
- Multiplier does NOT affect the 35% Avalo fee at deposit

### 5.4 Multiplier Change Rules

- Earner may change the multiplier **only for the next paid session**
- Multiplier **cannot** be changed mid-session
- Deposit amount and multiplier travel together as "next session config"

---

## 6. Free Messages

### 6.1 Per-Participant Free Messages

| Earner Tier | Free Messages per User per Chat |
|-------------|----------------------------------|
| **Standard** | 9 |
| **Royal** (earner has Royal) | 5 |

- Free messages are **per participant**, not shared.
- In a standard chat, each user gets 9 free messages = 18 total messages before deposit required.
- In a Royal-earner chat, each user gets 5 free messages = 10 total messages before deposit required.

### 6.2 Free Message Accounting

- Free messages decrement per-sender.
- Once both participants exhaust their free messages and the mode requires deposit, state → `AWAITING_DEPOSIT`.

---

## 7. Non-Earn Free Pool (Latest)

### 7.1 Applicability

Applies **only** to profiles with `earn_on=OFF` (non-earning).

### 7.2 Rules

| Profile Type | Rule |
|-------------|------|
| Low-popularity non-earning women | 4 random free chats per 72 hours (region-based if possible) |
| Other non-earning profiles | 20 free messages per user, then paywall |

### 7.3 When Paid Mode Starts with `earner=null`

- If both participants have `earn_on=OFF` and paid mode starts:
- 100% of consumed escrow goes to Avalo (no creator share)

### 7.4 Constraints

- Free pool eligibility is checked at chat creation time
- Trust engine may block risky users from free pool
- Region-based allocation is best-effort

---

## 8. Prohibited Actions

The following are **explicitly prohibited** and must not exist in any code path:

1. **Discounts** on token purchases or chat pricing
2. **Promo codes** of any kind
3. **Free token grants** (bonuses, rewards, cashback)
4. **Dynamic algorithmic pricing** that overrides earner-set deposit (PACK 242 price tiers)
5. **Loyalty discounts** on token pack pricing
6. **Partner coupons** that grant economic advantage

---

## 9. Revenue Split Summary

| Context | Avalo | Creator/Earner | When Applied |
|---------|-------|----------------|-------------|
| Chat deposit | 35% | 65% (escrow) | At deposit time |
| Escrow consumption | 0% | 100% of deducted tokens | Per-message billing |
| Escrow consumption (earner=null) | 100% | 0% | Per-message billing |
| On chat end (unused escrow) | 0% (non-refundable fee retained) | Refund to payer | On close/expiry |

**Note:** The 35/65 split happens **once** at deposit. There is no additional platform cut when escrow is consumed — the earner receives 100% of each token deducted from escrow. This is because Avalo's fee was already extracted upfront.

---

## 10. Canonical Constants Reference

```typescript
// === CHAT MONETIZATION CANONICAL CONSTANTS ===
const CHAT_MIN_DEPOSIT_TOKENS = 100;
const CHAT_AVALO_FEE_PERCENT = 35;
const CHAT_ESCROW_PERCENT = 65;

const WORDS_PER_TOKEN_STANDARD = 11;
const WORDS_PER_TOKEN_ROYAL = 7;

const FREE_MESSAGES_STANDARD = 9;   // per user per chat
const FREE_MESSAGES_ROYAL = 5;      // per user per chat (earner has Royal)

const ALLOWED_MULTIPLIERS = [2, 3, 4, 5, 7, 10, 12, 15, 20] as const;
const DEFAULT_MULTIPLIER = 1;       // implicit, not user-selectable

const FREE_POOL_LOW_POP_CHATS_PER_72H = 4;
const FREE_POOL_OTHER_MESSAGE_LIMIT = 20;

const CHAT_INACTIVITY_TIMEOUT_HOURS = 48;
```

---

*END OF CANONICAL SPECIFICATION*
