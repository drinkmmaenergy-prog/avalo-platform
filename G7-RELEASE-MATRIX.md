# G7 — Final Release Matrix
## Branch: stabilization/build-green-2026-04-15
## Generated: 2026-06-21

---

## Gate Status

| Task | Description | Evidence | Status |
|------|-------------|----------|--------|
| G1 | Creator earnings removed from consumer wallets | Commit 2162d547; deliverPaidResponse step 4 removed; consumeFromReservation step 4 removed; g1-creator-wallet-separation.integration.test.ts (5 tests written) | ✅ CODE COMPLETE |
| G2 | Call collection migrated to callSessions | Commit c0f57d8e; calls.ts + callMonetization.ts use 'callSessions'; 13/13 unit tests PASS (captured) | ✅ CODE COMPLETE |
| G3 | Media PPV + drops earnings routed to creatorEarningAccounts | Commit 874c5efd; chatMediaMonetization + dropsEngine fixed; earnerShop/earnerStore/digitalProducts all HARD_DISABLED | ✅ CODE COMPLETE |
| G4 | Multi-room participant fields normalized | Commit eb44669e; entryReservationTokens/remainingRoomBudgetTokens/roomSpentTokens; 13/13 unit tests PASS (captured) | ✅ CODE COMPLETE |
| G5 | Legacy source eradication + CI guard | Commit f6200aba; 30 files ARCHIVED; AI companion billing HARD_DISABLED; CI guard script created; forbidden paths in exported functions fixed or guarded | ✅ CODE COMPLETE |
| G6 | Actual P8 emulator execution | Unit: 26/26 PASS (captured). Emulator tests (G1, G2, F6) require Windows host — Firebase jars blocked in sandbox. Commands in G6-P8-EMULATOR-RUN.md | ⚠️ UNIT COMPLETE / EMULATOR PENDING HOST RUN |

---

## Absolute Constraint Verification

| Constraint | Status | Evidence |
|-----------|--------|----------|
| PAYOUTS_ENABLED = false as const | ✅ ENFORCED | wallet/payoutGuard.ts:23; F6-T01 + G2-T07 pass |
| wallets/{uid} = consumer spending wallet ONLY | ✅ ENFORCED | G1 removed all illegal creator writes; G3 fixed media/drops; G5 guarded remaining |
| creatorEarningAccounts/{id}.pendingEarningTokens = creator earning | ✅ ENFORCED | All earning flows route through recordCreatorEarning() |
| payerTokensCharged = creatorEarningTokens (no split at delivery) | ✅ ENFORCED | Direct chat: deliverPaidResponse step 7-8; Calls: billCallWindow earnerTokens = chargedTokens; Media: earnerTokens via recordCreatorEarning |
| grossUsdCents = earningTokens × 4; commission = floor(gross × 0.20) | ✅ ENFORCED | canonicalEarningService.ts TOKEN_PAYOUT_USD_GROSS=0.04; AVALO_COMMISSION_RATE=0.20 |
| Idempotency key = CALL_BILL:{callSessionId}:{billingWindowId} | ✅ ENFORCED | F6-T08 passes; canonicalCallBillingV2 uses this format |
| No Date.now() idempotency keys in active billing | ✅ ENFORCED | G5 archived multiChatRoom.ts; no active billing uses Date.now() |
| callSessions/{id} = single canonical call collection | ✅ ENFORCED | G2 migrated both calls.ts and callMonetization.ts |
| @ts-nocheck / as any / ts-ignore prohibited in financial code | ✅ ENFORCED | P7 sweep complete; G5 removed EARNER_CUT_PERCENT |
| No fake success responses / empty catch blocks / stub returns | ✅ ENFORCED | All stubs throw HARD_DISABLED errors |
| Multiplier set: [2,3,5,7,10,20,30,50,70,100] | ✅ ENFORCED | canonicalChatStateMachineV3 VALID_MULTIPLIERS |
| Canonical wallet path: wallets/{uid} with balance/reservedTokens/updatedAt | ✅ ENFORCED | walletService.walletRef() used exclusively |

---

## Commit History (G-Series)

```
f6200aba G5: Legacy source eradication + CI forbidden-pattern guard
eb44669e G4: multi-room participant field normalization
874c5efd G3: route media PPV + drop purchase earnings to creatorEarningAccounts
c0f57d8e G2: migrate calls to callSessions — one canonical collection, one billing path
2162d547 G1: Remove creator earnings from consumer wallets — critical economic integrity fix
0601b5a7 F7: Full monetization inventory + gate verdict
d38f85f5 F6: Emulator validation — 10/10 unit tests PASS (captured)
```

---

## GATE VERDICT

```
VERDICT 3 — G6_EMULATOR_INCOMPLETE

All G1–G5 code changes are complete with TypeScript EXIT 0 and 26/26 unit
tests passing (captured). G6 emulator tests are written and ready but
require Firebase emulator execution on the Windows host (Firebase jars are
blocked in the sandbox environment).

To upgrade to VERDICT 1 (SHIP):
1. Run G6-P8-EMULATOR-RUN.md on Windows host
2. All 5 emulator test suites must show "Tests: N passed" with 0 failures
3. Fill in the verdict matrix in G6-P8-EMULATOR-RUN.md
4. Update this file to VERDICT 1

PAYOUTS_ENABLED = false is enforced and cannot be changed by any active
code path. No money moves until an operator explicitly changes this constant
and re-deploys.
```

---

## Known Remaining Items (post-G-series, non-blocking for PAYOUTS_ENABLED=false)

| Item | Scope | Priority |
|------|-------|---------|
| AI companion billing full migration | aiCompanionFunctions/aiCompanions/aiCompanionsPack48 | Medium |
| Calendar booking canonical billing | calendar.ts → canonicalCalendarBillingV2 | Medium |
| expireStaleChats canonical refund | scheduled.ts → walletService.releaseReservation | Low |
| 26 archived files full deletion | Non-exported legacy files | Low |
| Emulator test for G3 media billing | chatMediaMonetization integration test | Medium |
