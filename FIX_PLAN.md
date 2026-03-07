# FIX_PLAN.md — Economy Config Centralization

**Generated:** 2026-03-05  
**Scope:** TASK B — Refactor hardcoded economy values to import from `config/economyConfig.ts`

---

## 1. Changes Made

### Extended: `functions/src/config/economyConfig.ts`

Added (all additive — no existing exports removed):
- `PLATFORM_LAYOUT_FEE` = 0.05
- `MIN_CHAT_CHARGE_TOKENS` = 100
- `SPLITS_BY_SURFACE` — all discovered split values per surface
- `getSplitForSurface()` — helper function
- `CHAT_PRICING` — wordsPerToken, freeMessages, multipliers, fees
- `createEconomyAuditEntry()` — governance audit hook
- `PAYOUT_FX_RATES` — display-only FX rates
- Build-time invariant: split sum check

---

## 2. Refactoring Plan (Files to Update)

Each file below should import from `config/economyConfig.ts` instead of hardcoding.

### Priority 1 — TOKEN_PAYOUT_USD conflicts (MUST FIX)

| # | File | Current Value | Action |
|---|---|---|---|
| 1 | `app-web/src/lib/economyConfig.ts:11` | 0.01 | Change to 0.03 to match backend |
| 2 | `functions/src/types/shared/compliance/pack418-compliance-constants.ts:44` | 0.04 | Import `TOKEN_PAYOUT_USD` from `../../../config/economyConfig` |
| 3 | `functions/src/pack114-earnings-integration.ts:237` | 0.10 | Import `TOKEN_PAYOUT_USD` from `./config/economyConfig` |
| 4 | `functions/src/payments.ts:331` | 0.03 (local) | Import `TOKEN_PAYOUT_USD` from `./config/economyConfig` |
| 5 | `functions/src/core/canonicalEconomy.ts:5` | 0.03 (dup) | Import `TOKEN_PAYOUT_USD` from `../config/economyConfig` |

### Priority 2 — Split conflicts (import from SPLITS_BY_SURFACE)

| # | File | Current | Expected | Action |
|---|---|---|---|---|
| 6 | `pack402-kpi-service.ts:293` | 70/30 hardcoded | Surface-specific | Import `getSplitForSurface()` |
| 7 | `pack191-live-arena.ts:159` | 70/30 | 70/30 | Import `SPLITS_BY_SURFACE.LIVE_STREAMS` |
| 8 | `liveVipRoom.ts:244` | 80/20 | 80/20 | Import `SPLITS_BY_SURFACE.LIVE_VIP` |
| 9 | `aiCompanionFunctions.ts:405` | 65/35 | 80/20 | ⚠️ REPORT CONFLICT — verify with business owner |
| 10 | `webOperations.ts:80` | 70/30 | 65/35 | ⚠️ REPORT CONFLICT — verify with business owner |
| 11 | `pack345-types.ts:158` | voice/video 65/35 | 80/20 | ⚠️ REPORT CONFLICT — verify with business owner |

### Priority 3 — Duplicate split declarations (import from SPLITS_BY_SURFACE)

| # | File | Action |
|---|---|---|
| 12 | `types/pack303-creator-earnings.types.ts:237` | Import from `SPLITS_BY_SURFACE` |
| 13 | `types/pack304-admin-finance.types.ts:262` | Import from `SPLITS_BY_SURFACE` |
| 14 | `pack354-influencer-service.ts:228` | Import from `SPLITS_BY_SURFACE` |
| 15 | `pack277-wallet-service.ts:39-52` | Import from `SPLITS_BY_SURFACE` |
| 16 | `reservations.ts:120-121` | Import from `SPLITS_BY_SURFACE.CHAT` |
| 17 | `pack242DynamicChatPricing.ts:181` | Import from `SPLITS_BY_SURFACE.CHAT` |
| 18 | `dynamicChatPricing.ts:135` | Import from `SPLITS_BY_SURFACE.CHAT` |
| 19 | `pack148-types.ts:441` | Import from `SPLITS_BY_SURFACE.CHAT` |
| 20 | `config/treasury.config.ts:20` | Import from `SPLITS_BY_SURFACE.CHAT` |

---

## 3. Verification Commands

```powershell
# Step 1: Build functions to verify no compile errors
cd avalo/functions ; npm run build

# Step 2: Run existing tests
cd avalo/functions ; npm test

# Step 3: Verify TOKEN_PAYOUT_USD is canonical (0.03) everywhere
Select-String -Path "avalo/functions/src/**/*.ts" -Pattern "TOKEN_PAYOUT_USD\s*=\s*" -Recurse | 
  Where-Object { $_.Line -notmatch "import" -and $_.Line -notmatch "//" }

# Step 4: Verify no hardcoded 0.04 or 0.10 payout rates remain
Select-String -Path "avalo/functions/src/**/*.ts" -Pattern "0\.04|0\.10.*USD|TOKEN_PAYOUT.*=.*0\.(0[^3]|[1-9])" -Recurse

# Step 5: Run economy gate check
cd avalo ; pwsh tools/ci/avalo-monetization-gates.ps1
```

---

## 4. Expected Results

After all Priority 1 fixes:
- `TOKEN_PAYOUT_USD` = 0.03 in all runtime paths
- No hardcoded payout rates outside `config/economyConfig.ts`
- Build passes with no type errors
- Existing test suite passes (0.03 assertions unchanged)

After Priority 2+3 fixes:
- All split calculations use `SPLITS_BY_SURFACE` from `config/economyConfig.ts`
- `getSplitForSurface()` available for dynamic routing
- Split sum invariant enforced at build time

---

## 5. Conflict Report (requires business owner decision)

| # | Question | Files | Options |
|---|---|---|---|
| 1 | Should calls (voice/video) be 80/20 or 65/35? | pack354 vs pack345 | Most code says 80/20 |
| 2 | Should tips be 90/10 or 80/20? | pack277-wallet vs config/monetization | Most code says 90/10 |
| 3 | Should AI companions be 80/20 or 65/35? | aiChatEngine vs aiCompanionFunctions | aiChatEngine is newer |
| 4 | Should media unlock be 65/35 or 80/20? | chatMediaMonetization vs media.ts | chatMediaMonetization is newer |
| 5 | Should live streams be 70/30 or 80/20? | liveMonetization vs liveVipRoom | May be intentionally different |
| 6 | Is ERR-024 (double 35% fee) intentional? | canonical-chat.types | Need business confirmation |

---

## 6. Risk Assessment

- **Zero-downside changes:** Priority 1 items #4 and #5 (import instead of hardcode, same value)
- **High-impact fixes:** Items #1, #2, #3 (wrong values in production)
- **Business-gated:** Priority 2 split conflicts require decision before change
