# F7 — Full Monetization Inventory & Gate Verdict
Branch: stabilization/build-green-2026-04-15
Date: 2026-06-21
Commits: fd2bf247 (F1-F4) → 7a3587cf (F5) → d38f85f5 (F6)
tsc: EXIT 0 (clean build confirmed)

---

## 1. CANONICAL ACTIVE SURFACES

### 1A. Direct Chat — canonicalDirectChatCallables.ts → canonicalChatStateMachineV3.ts
| Function         | Billing trigger           | Wallet path                     | Earning path                                  | Status |
|------------------|---------------------------|---------------------------------|-----------------------------------------------|--------|
| c5_sendFanMessage | NEVER — always free      | none                            | none                                          | SAFE   |
| c5_deliverCreatorMessage (FREE_ACTIVE) | none | none              | none                                          | SAFE   |
| c5_deliverCreatorMessage (PAID_ACTIVE) | deliverPaidResponse | wallets/{fanId}.reservedTokens -= rate | creatorEarningAccounts/{creatorId}.pendingEarningTokens += rate; wallets/{creatorId}.balance += rate | SAFE [F1] |

Rules:
- payerTokensCharged = creatorEarningTokens (no delivery split) ✓
- billingEvents/{CHAT_BILL:{chatId}:{messageId}} immutable idempotency sentinel ✓
- deliverPaidResponse dual-writes wallets/{creatorId}.balance AND pendingEarningTokens — creator may spend earnings immediately; commission taken at payout time ⚠️ NOTED

### 1B. Voice/Video Calls — callMonetization.ts → canonicalCallBillingV2.ts
| Function            | Billing path                          | Earning path                                    | Status |
|---------------------|---------------------------------------|-------------------------------------------------|--------|
| endCallMonetized    | billCallWindow(callSessionId, windowId) | creatorEarningAccounts/{creatorId}.pendingEarningTokens += earnerTokens | SAFE [F2] |
| createCall / startRinging / acceptCall / rejectCall / markCallActive | non-billing state transitions | none | SAFE |
| checkCallBalance    | reads wallets/{uid}.balance only      | none                                            | SAFE |

Rules:
- earnerTokens = chargedTokens (no 80/20 split at delivery) ✓
- Idempotency: CALL_BILL:{callSessionId}:{billingWindowId} ✓
- billedMinutes = ceil(durationSeconds / 60) ✓
- KNOWN GAP: calls.ts writes to call_sessions/{id}; callMonetization.ts / canonicalCallBillingV2.ts reference calls/{id} — two parallel collections. Canonical billing operates on calls/{id}. Pre-existing architectural gap; not introduced by F1-F6.

### 1C. Multi-Room — canonicalMultiRoomV2.ts (c10_*)
| Operation         | Model                         | Wallet path                        | Status |
|-------------------|-------------------------------|------------------------------------|--------|
| joinRoom          | Reservation (not entry fee)   | wallets/{uid}.balance -= entryTokens; reservedTokens += entryTokens; participant.earnedByCreator = false | SAFE [F4] |
| sendFanRoomMessage | No billing                   | none                               | SAFE   |
| deliverCreatorRoomMessage (first) | Settles ALL unearned entries | wallets/{fanId}.reservedTokens = 0 per fan; creatorEarningAccounts/{creatorId}.pendingEarningTokens += sum | SAFE |
| leaveRoom         | Refunds unearned reservation  | wallets/{uid}.balance += reservedTokens if !earnedByCreator | SAFE |
| moderateParticipant BAN/KICK | Refunds unearned reservation | wallets/{userId}.balance += reservedTokens if !earnedByCreator | SAFE [F4 fix] |
| closeRoom / expire | Refunds all unearned participants | per-participant refund           | SAFE |
| Tips              | Voluntary, immediate          | transactTokens canonical          | SAFE |

Rules:
- Client must supply idempotencyKey (8-128 char UUID) — Date.now() never used ✓
- requireVerifiedAdult() on all entry points ✓
- escrowTotalTokens / escrowReturnedTokens accounting maintained ✓

### 1D. Token Purchase (Consumer)
| Module                     | Payment path     | Wallet credit                    | Status |
|----------------------------|------------------|----------------------------------|--------|
| pack288-mobile-purchases.ts | Apple/Google IAP | creditTokens → wallets/{uid}.balance | SAFE [F5] |
| pack288-web-stripe.ts       | Stripe checkout  | creditTokens → wallets/{uid}.balance | SAFE [F5] |

Rules:
- packageId as any → narrow type cast (F5) ✓
- Wallet: wallets/{uid}.balance (canonical path) ✓

---

## 2. HARD_DISABLED SURFACES

| Surface                             | Reason              | Commit  | Throws message |
|-------------------------------------|---------------------|---------|----------------|
| calls.ts endCall()                  | Legacy 80/20 split  | F1-F4   | HARD_DISABLED [F2] |
| callBilling.ts billCall()           | Legacy path         | P7      | HARD_DISABLED, use canonicalCallBillingV2 |
| earnerShop.ts (11 functions)        | Stubs, no impl      | F3      | HARD_DISABLED [F3] |
| earnerStore.ts (7 V1 functions)     | Stubs, no impl      | F3      | HARD_DISABLED [F3] |
| digitalProducts.ts purchaseDigitalProduct | No canonical impl | C1/F3 | C1 SHUTDOWN, HARD_DISABLED [F3] |
| All payout endpoints                | PAYOUTS_ENABLED=false | P1  | payoutGuard throws |

---

## 3. UNREACHABLE DEAD CODE (not exported from index.ts)

| File                   | Issue                                    | Classification |
|------------------------|------------------------------------------|----------------|
| live.ts sendLiveTipCallable | Uses users/{uid}.wallet.balance (FORBIDDEN PATH); 80/20 split | DEAD_CODE — not in index.ts |
| chat/multiChatRoom.ts sendTip | Date.now() in idempotency key     | DEAD_CODE — not in index.ts |
| chat/multiChatRoom.ts joinRoom | Date.now() in idempotency key    | DEAD_CODE — not in index.ts |

These files must remain unexported and should be formally archived or deleted before any future developer attempts to activate them.

---

## 4. TYPE-SAFETY STATUS (F5)

| Pattern              | Active production count | Notes |
|----------------------|------------------------|-------|
| @ts-nocheck          | 0                      | callBilling.ts has only a comment noting it was removed |
| @ts-ignore           | 0                      |       |
| @ts-expect-error     | 0                      |       |
| as any (financial)   | 0                      | Fixed in pack288 (both), init.ts |
| as any (P7-exempt)   | 2                      | Stripe apiVersion in 2 locations — SDK v14 constraint |
| Empty catch blocks   | 0                      | All catch blocks have error handling body |
| require() hacks      | 0                      |       |

---

## 5. MULTIPLIER / BADGE CONFIG

Canonical multiplier set: [2, 3, 5, 7, 10, 20, 30, 50, 70, 100] — implemented in
chat/canonicalMultiplierTiers.ts. ALL_MULTIPLIERS exported and enforced server-side.
Badge tiers: STANDARD, VIP, ELITE, CREATOR, VERIFIED_CREATOR, APEX — server-gated.
Multiplier eligibility: badge-gated, server-enforced by assertMultiplierEligibility().

---

## 6. EMULATOR VALIDATION EVIDENCE (F6)

Unit tests (no emulator required) — ACTUAL CAPTURED OUTPUT:
  PASS tests/unit/f6-unit.test.ts (22.439 s)
  ✓ F6-T01 PAYOUTS_ENABLED = false as const     [9 ms]
  ✓ F6-T05 endCall() HARD_DISABLED [F2]         [20 ms]
  ✓ F6-T06 billCall() throws canonicalCallBillingV2 [1 ms]
  ✓ F6-T08 Idempotency key format               [<1 ms]
  ✓ F6-T09 Commission math (400/80/320)         [1 ms]
  ✓ F6-T10 ceil(60/60)=1, ceil(61/60)=2 ... (5 subtests) [<1 ms each]
  Tests: 10 passed, 10 total

Emulator-backed tests (T02-T04, T07, T11-T14) — WRITTEN, NOT YET RUN:
  File: functions/tests/integration/f6-emulator-validation.test.ts
  Blocked in CI: network policy prevents emulator jar download
  Run locally: firebase emulators:start --only firestore,auth && npm run test:emulator

npm scripts provisioned:
  test:emulator       ✓
  test:rules          ✓
  test:storage-rules  ✓
  validate:deploy     ✓

---

## 7. GATE VERDICT

### VERDICT 3 — F6_EMULATOR_INCOMPLETE

**Definition:** All F1–F5 blockers cleared and build is clean, but the emulator-backed
test suite (F6 T02–T04, T07, T11–T14) has not produced captured evidence due to
infrastructure restriction. No production claim may be made until these 8 tests pass
with actual emulator output captured.

**What is confirmed:**
- tsc -p tsconfig.build.json --noEmit: EXIT 0 ✓
- PAYOUTS_ENABLED = false as const ✓
- endCall HARD_DISABLED ✓ (proven by test + code)
- billCall HARD_DISABLED ✓ (proven by test + code)
- Fan messages never debit wallet (proven by code audit + F1 test file)
- Commission math: gross = tokens×4; avalo = floor(gross×0.20); net = gross−commission ✓
- Idempotency key: CALL_BILL:{callSessionId}:{billingWindowId} (no Date.now()) ✓
- billedMinutes = ceil(durationSeconds/60) ✓
- earnerTokens = chargedTokens (no 80/20 delivery split) ✓
- Room join is reservation not entry fee ✓
- Ban/kick refunds unearned reservation ✓
- as any = 0 in active financial code ✓

**What remains before Verdict 1 or 2 can be issued:**
1. Run: firebase emulators:start --only firestore,auth
         npm run test:emulator
   Capture output showing all 14 F6 tests passing.

2. Resolve call_sessions vs calls collection mismatch:
   createCall writes call_sessions/{id}; canonicalCallBillingV2 expects calls/{id}.
   Either migrate createCall to write calls/{id} or add a lookup bridge.

3. Archive/delete dead-code files before any developer activation:
   - live.ts (forbidden wallet path + 80/20 split)
   - chat/multiChatRoom.ts (Date.now() idempotency keys)

**These do NOT block current soft-launch with PAYOUTS_ENABLED=false:**
- earnerShop / earnerStore / digitalProducts.purchaseDigitalProduct — all HARD_DISABLED
- All payouts — kill switch active
- No live.ts or multiChatRoom.ts reachable (not in index.ts exports)

