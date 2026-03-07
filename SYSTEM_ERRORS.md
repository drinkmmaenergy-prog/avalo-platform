# SYSTEM_ERRORS.md — Avalo Economy Inconsistencies & Risks

**Generated:** 2026-03-05  
**Scope:** Inconsistencies, duplicates, legacy contamination, missing idempotency, race conditions, double-charge risks  
**Severity levels:** 🔴 CRITICAL | 🟠 HIGH | 🟡 MEDIUM | ⚪ LOW

---

## 1. TOKEN_PAYOUT_USD Value Conflicts

### 🔴 ERR-001: Web frontend uses TOKEN_PAYOUT_USD = 0.01 (backend = 0.03)

- **File:** [`app-web/src/lib/economyConfig.ts`](app-web/src/lib/economyConfig.ts:11)
- **Canonical:** [`functions/src/config/economyConfig.ts`](functions/src/config/economyConfig.ts:14) → 0.03
- **Impact:** Creator payout previews on web show 3× less than actual backend payout. Misleading UI.
- **Risk:** Users may underclaim, or dispute amounts.
- **Fix:** Set web `TOKEN_PAYOUT_USD = 0.03` or import from shared config.

### 🔴 ERR-002: pack418-compliance-constants uses TOKEN_TOKEN_PAYOUT_USD = 0.04

- **File:** [`functions/src/types/shared/compliance/pack418-compliance-constants.ts`](functions/src/types/shared/compliance/pack418-compliance-constants.ts:44)
- **Canonical:** 0.03
- **Impact:** Compliance validation rejects valid payouts (threshold comparison off by 33%).
- **Risk:** False compliance violations in production.
- **Fix:** Import from `config/economyConfig.ts` instead of hardcoding.

### 🟠 ERR-003: pack114-earnings-integration uses local TOKEN_PAYOUT_USD = 0.10

- **File:** [`functions/src/pack114-earnings-integration.ts`](functions/src/pack114-earnings-integration.ts:237)
- **Impact:** Agency earnings calculations off by 233% if this path is hit.
- **Risk:** Agency overpayment.
- **Fix:** Import `TOKEN_PAYOUT_USD` from `config/economyConfig.ts`.

### 🟡 ERR-004: payments.ts hardcodes TOKEN_PAYOUT_USD = 0.03 locally

- **File:** [`functions/src/payments.ts`](functions/src/payments.ts:331)
- **Impact:** Value matches canonical, but is not centralized.
- **Risk:** Drift if canonical changes.
- **Fix:** Import from `config/economyConfig.ts`.

---

## 2. Revenue Split Conflicts

### 🔴 ERR-005: Web frontend uses 70/30 split (backend canonical = 65/35 for chat)

- **File:** [`app-web/src/lib/economyConfig.ts`](app-web/src/lib/economyConfig.ts:14) — `CREATOR_REVENUE_SHARE = 0.70`
- **Canonical:** 65/35 from [`types/canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:107)
- **Impact:** Investor/creator dashboards show wrong split expectations.

### 🟠 ERR-006: goals.ts uses 70/30 split (should be 65/35)

- **File:** [`functions/src/types/goals.ts`](functions/src/types/goals.ts:233) — `CREATOR_SPLIT: 0.70, AVALO_SPLIT: 0.30`
- **Impact:** Goal funding contributions use wrong split calculation.

### 🟠 ERR-007: pack402-kpi-service uses 70/30 split (should use surface-specific)

- **File:** [`functions/src/pack402-kpi-service.ts`](functions/src/pack402-kpi-service.ts:293) — `Math.floor(amount * 0.7)`
- **Impact:** KPI revenue attribution incorrect across all surfaces.

### 🟠 ERR-008: pack191-live-arena uses 70/30 (live canonical = 70/30 per liveMonetization.ts)

- **File:** [`functions/src/pack191-live-arena.ts`](functions/src/pack191-live-arena.ts:159)
- **vs.:** [`liveVipRoom.ts`](functions/src/liveVipRoom.ts:244) — uses **80/20**
- **Impact:** Two different live stream engines use different splits.
- **Resolution needed:** Is live 70/30 or 80/20? Both exist.

### 🟠 ERR-009: aiCompanionFunctions.ts uses 65/35 (AI canonical = 80/20)

- **File:** [`functions/src/aiCompanionFunctions.ts`](functions/src/aiCompanionFunctions.ts:405) — `Math.floor(tokensCharged * 0.65)`
- **vs.:** [`aiChatEngine.ts`](functions/src/aiChatEngine.ts:40) — `CREATOR_SHARE_PERCENT = 80`
- **Impact:** Different AI companion paths pay creators differently.

### 🟠 ERR-010: webOperations.ts uses 70/30 for paid content (others use 65/35)

- **File:** [`functions/src/webOperations.ts`](functions/src/webOperations.ts:80) — `PAID_CONTENT_CONFIG.CREATOR_SPLIT`
- **vs.:** [`paidMedia.ts`](functions/src/paidMedia.ts:73) and [`premiumStories.ts`](functions/src/premiumStories.ts:24) → 65/35

### 🟠 ERR-011: Calls split conflict (65/35 vs 80/20)

- **File:** [`pack345-types.ts`](functions/src/pack345-types.ts:158) — voice/video: `creatorShare: 65, platformShare: 35`
- **vs.:** [`pack354-influencer-service.ts`](functions/src/pack354-influencer-service.ts:230) — `calls: { creatorShare: 0.80, avaloShare: 0.20 }`
- **vs.:** [`config/monetization.ts`](functions/src/config/monetization.ts:16) — `CREATOR_SPLIT: 0.80`
- **Impact:** Launch audit (pack345) verifies wrong split for calls.

### 🟡 ERR-012: Tips split conflict (90/10 vs 80/20)

- **File:** [`pack277-wallet-service.ts`](functions/src/pack277-wallet-service.ts:48) — `TIP: { platformShare: 0.10, earnerShare: 0.90 }`
- **vs.:** [`config/monetization.ts`](functions/src/config/monetization.ts:42) — `CREATOR_SPLIT: 0.80`
- **Impact:** Different code paths for tips may pay differently.

### 🟡 ERR-013: media.ts uses 80/20 for media unlock (others use 65/35)

- **File:** [`functions/src/media.ts`](functions/src/media.ts:441) — `Math.floor(unlockPrice * 0.8)`
- **vs.:** [`chatMediaMonetization.ts`](functions/src/chatMediaMonetization.ts:149) → 65/35
- **Impact:** Same media unlock, different split depending on code path.

---

## 3. Duplicate Config Declarations

### 🟠 ERR-014: setGlobalOptions called TWICE at boot

- **File 1:** [`functions/src/index.ts`](functions/src/index.ts:3) — `setGlobalOptions({ region: "europe-west1", memory: "512MiB", timeoutSeconds: 60, maxInstances: 10 })`
- **File 2:** [`functions/src/runtime.ts`](functions/src/runtime.ts:11) — `setGlobalOptions({ region: "europe-west1", secrets: [...] })`
- **Impact:** Second call overwrites first. `memory`, `timeoutSeconds`, `maxInstances` from index.ts may be lost. Secrets from runtime.ts may not propagate if order changes.
- **Fix:** Call `setGlobalOptions` exactly once.

### 🟡 ERR-015: Duplicate Stripe param definitions

- **File 1:** [`functions/src/params.ts`](functions/src/params.ts:3) — `defineString("STRIPE_SECRET")`, `defineString("STRIPE_WEBHOOK_SECRET")`
- **File 2:** [`functions/src/runtime.ts`](functions/src/runtime.ts:5) — `defineSecret("STRIPE_SECRET_KEY")`, `defineSecret("STRIPE_WEBHOOK_SECRET")`
- **Impact:** Different names (`STRIPE_SECRET` vs `STRIPE_SECRET_KEY`), different types (`defineString` vs `defineSecret`).
- **Risk:** Confusion about which is canonical. `defineSecret` is correct for secrets.

### 🟡 ERR-016: canonicalEconomy.ts duplicates economyConfig.ts values

- **File:** [`functions/src/core/canonicalEconomy.ts`](functions/src/core/canonicalEconomy.ts:1)
- **Impact:** Has `TOKEN_PAYOUT_USD: 0.03` and `SPLIT: { CREATOR: 0.65, PLATFORM: 0.35 }` duplicated from economyConfig.
- **Fix:** Should import from economyConfig.

### 🟡 ERR-017: FUNCTIONS_REGION duplicated across files

- [`functions/src/config.ts`](functions/src/config.ts:80): `FUNCTIONS_REGION = "europe-west1"`
- [`functions/src/params.ts`](functions/src/params.ts:5): `FIREBASE_REGION = defineString("FIREBASE_REGION")`
- Both `setGlobalOptions` calls also hardcode `"europe-west1"`
- **Fix:** Single source.

---

## 4. Legacy Contamination

### 🟡 ERR-018: *.legacy.ts files still export used symbols

- [`functions/src/pack302-types.legacy.ts`](functions/src/pack302-types.legacy.ts:253) — exports `TOKEN_PAYOUT_USD_PER_TOKEN`
- [`functions/src/pack261-earnings.legacy.ts`](functions/src/pack261-earnings.legacy.ts:9) — exports `CREATOR_SHARE = 0.65`
- **Impact:** Legacy files correctly import from economyConfig, but remain in build. Any file importing from `.legacy.ts` gets indirect access.
- **Risk:** Build includes dead weight; confusion about canonical vs legacy.

### 🟡 ERR-019: Free message count varies across legacy paths

- [`config.ts`](functions/src/config.ts:13): `CHAT_FREE_MESSAGES_PER_USER = 3`
- [`types/canonical-chat.types.ts`](functions/src/types/canonical-chat.types.ts:79): `FREE_MESSAGES_STANDARD = 9`
- [`pack285FreeWindowFunnel.ts`](functions/src/pack285FreeWindowFunnel.ts:77): `FREE_MESSAGES_STANDARD_PER_USER = 8`
- [`matchingEngine.ts`](functions/src/matchingEngine.ts:43): `FREE_MESSAGES_PER_CHAT = 4`
- **Canonical:** 9 per user (from canonical-chat.types.ts, v2_canonical)
- **Risk:** Legacy paths still active would have different free message counts.

---

## 5. Missing Idempotency Keys

### 🔴 ERR-020: Chat billing lacks idempotency key in wallet transactions

- **File:** [`canonical-chat-engine.ts`](functions/src/canonical-chat-engine.ts:660)
- The Firestore transaction ensures atomicity within a single `processMessage` call, but there's no explicit idempotency key (e.g., `chatId_sessionId_messageIndex`) on the ledger entry.
- **Risk:** If a client retries the same message, a new transaction could be created with the same logical event.
- **Mitigation:** Firestore transactions are atomic, but the entry point (API layer) must deduplicate.

### 🟠 ERR-021: Payout requests lack idempotency guard

- **File:** [`pack289-withdrawals.ts`](functions/src/pack289-withdrawals.ts:340)
- No explicit idempotency key on `withdrawals_createRequest`.
- **Risk:** Double-tap on payout button could create duplicate withdrawal requests.

---

## 6. Race Conditions

### 🔴 ERR-022: Concurrent messages in same chat can race on escrow

- **File:** [`canonical-chat-engine.ts`](functions/src/canonical-chat-engine.ts:660)
- Uses `db.runTransaction()` which handles document-level contention.
- ✅ **Mitigated** by Firestore transaction semantics (retry on contention).
- **Residual risk:** High-frequency messages (>1/sec) may cause excessive retries.

### 🟠 ERR-023: Concurrent deposits could create multiple active sessions

- Multiple deposit requests arriving simultaneously are each wrapped in a transaction checking `chat.state === 'AWAITING_DEPOSIT'`.
- ✅ **Likely mitigated** by transaction, but should be verified with load test.

---

## 7. Double-Charge Risks

### 🔴 ERR-024: Platform fee charged at deposit AND escrow consumption split both reference 35%

- **Deposit:** 35% taken as platform fee immediately → `platformFeeChargedTokens`
- **Consumption:** Remaining 65% (escrow) split 65/35 (earner/Avalo)
- **Actual Avalo take:** `0.35 × deposit (upfront) + 0.35 × 0.65 × deposit (from escrow) = 0.35 + 0.2275 = 0.5775` → **57.75% of deposit goes to Avalo**
- ⚠️ This is EITHER intentional (Avalo gets ~58% total) OR a double-dip error.
- **Must clarify with business owner.**

### 🟠 ERR-025: pack277-wallet-service and canonical-chat-engine may both process same transaction

- If both legacy wallet service and canonical chat engine are active, a chat message could be processed by both paths.
- **Mitigation:** `logicVersion = 'v2_canonical'` field on chat document should gate routing.
- **Risk:** Chats without `logicVersion` field could hit both paths.

---

## 8. Structural Issues

### 🟡 ERR-026: functionsConfig() shim defined in two places

- [`functions/src/runtime.ts`](functions/src/runtime.ts:78) and [`functions/src/common.ts`](functions/src/common.ts:38)
- Both wrap `functions.config()` in try/catch for Gen2 compatibility.
- **Fix:** Single definition in `runtime.ts` (already the recommended import point).

### 🟡 ERR-027: No build-time enforcement of split consistency

- Revenue splits are hardcoded constants scattered across 30+ files.
- No CI gate validates that all files agree on the same splits per surface.
- **Fix:** Centralize in `economyConfig.ts` and add build-time assertion.

### ⚪ ERR-028: PAYOUT_FX_RATES referenced in tests but not in economyConfig

- [`functions/src/__tests__/stripe-e2e-audit.test.ts`](functions/src/__tests__/stripe-e2e-audit.test.ts:24) imports `PAYOUT_FX_RATES`
- Not exported from `config/economyConfig.ts`.
- **Fix:** Either export from economyConfig or remove from test.

---

## Summary

| Severity | Count |
|---|---|
| 🔴 CRITICAL | 5 (ERR-001, ERR-002, ERR-005, ERR-020, ERR-024) |
| 🟠 HIGH | 10 (ERR-003, ERR-006–011, ERR-014, ERR-021, ERR-025) |
| 🟡 MEDIUM | 10 (ERR-004, ERR-012–013, ERR-015–019, ERR-026–027) |
| ⚪ LOW | 1 (ERR-028) |

**Total issues found:** 28
