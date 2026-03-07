# MIGRATION_FUNCTIONS_CONFIG_TO_PARAMS.md

**Generated:** 2026-03-05  
**Scope:** Migrate `functions.config()` (Gen1) → `defineString` / `defineSecret` (Gen2 params)

---

## 1. Current State Analysis

### functions.config() Usage

The codebase has **already mostly migrated** away from `functions.config()`. The Gen1 API is only accessed through a compatibility shim:

| File | Usage | Status |
|---|---|---|
| [`functions/src/runtime.ts`](functions/src/runtime.ts:78) | `functionsConfig()` shim — wraps `functions.config()` in try/catch | ✅ Shim (safe) |
| [`functions/src/common.ts`](functions/src/common.ts:38) | `functionsConfig()` shim — duplicate of runtime.ts | ⚠️ Duplicate shim |
| [`functions/src/aiBotEngine.ts`](functions/src/aiBotEngine.ts:401) | Comment only: `// functions.config().claude.api_key` | ⚪ No live usage |

### functionsConfig() Shim Consumers

| File | Import From | What It Does |
|---|---|---|
| [`walletFintech.ts`](functions/src/walletFintech.ts:40) | `runtime.ts` | Imports `functionsConfig` — likely unused; Stripe key comes from `defineSecret` |
| [`pack339-types.ts`](functions/src/pack339-types.ts:7) | `runtime.ts` | Type definition references `functionsConfig` in disaster recovery |
| [`pack339-disaster-recovery.ts`](functions/src/pack339-disaster-recovery.ts:22) | `runtime.ts` | Backup/restore — `functionsConfig` used as status flag in backup metadata |

### Already Migrated to params/defineSecret

| File | Param Type | Key Name | Status |
|---|---|---|---|
| [`functions/src/runtime.ts`](functions/src/runtime.ts:5) | `defineSecret` | `STRIPE_SECRET_KEY` | ✅ Active |
| [`functions/src/runtime.ts`](functions/src/runtime.ts:6) | `defineSecret` | `STRIPE_WEBHOOK_SECRET` | ✅ Active |
| [`functions/src/params.ts`](functions/src/params.ts:3) | `defineString` | `STRIPE_SECRET` | ⚠️ Duplicate (different name!) |
| [`functions/src/params.ts`](functions/src/params.ts:4) | `defineString` | `STRIPE_WEBHOOK_SECRET` | ⚠️ Duplicate (different name!) |
| [`functions/src/params.ts`](functions/src/params.ts:5) | `defineString` | `FIREBASE_REGION` | ✅ Not used in production |
| [`brandStrategy/index.ts`](functions/src/brandStrategy/index.ts:2) | `defineSecret` | (unknown, needs verification) | ✅ Per-module |

---

## 2. Key Mapping: config() → params

| Gen1 Key (functions.config()) | Gen2 Param | Type | Status |
|---|---|---|---|
| `stripe.secret_key` | `STRIPE_SECRET_KEY` | `defineSecret` | ✅ Already migrated in `runtime.ts` |
| `stripe.webhook_secret` | `STRIPE_WEBHOOK_SECRET` | `defineSecret` | ✅ Already migrated in `runtime.ts` |
| `claude.api_key` | (not migrated) | Should be `defineSecret` | ❌ Referenced in comment only |
| N/A | `STRIPE_SECRET` | `defineString` (wrong!) | ⚠️ Should be `defineSecret`, and name should match |
| N/A | `FIREBASE_REGION` | `defineString` | 🟡 Not used at runtime |

---

## 3. Migration Steps

### Step 1: Remove duplicate shim in common.ts

```diff
- // Gen2 shim: functions.config() is unavailable in v2, return empty object
- export const functionsConfig = (): Record<string, any> => {
-   try {
-     return functions.config();
-   } catch {
-     return {};
-   }
- };
```

All consumers should import from `runtime.ts`, which already has the canonical shim.

### Step 2: Consolidate params.ts into runtime.ts

[`functions/src/params.ts`](functions/src/params.ts) defines:
- `STRIPE_SECRET` (defineString) — conflicts with `STRIPE_SECRET_KEY` (defineSecret) in runtime.ts
- `STRIPE_WEBHOOK_SECRET` (defineString) — conflicts with same name in runtime.ts but wrong type
- `FIREBASE_REGION` (defineString) — not used

**Action:** Delete `params.ts` or align it. The canonical Stripe secrets are in `runtime.ts` as `defineSecret`.

```diff
# Delete params.ts or replace with:
- import { defineString } from "firebase-functions/params";
- export const STRIPE_SECRET = defineString("STRIPE_SECRET");
- export const STRIPE_WEBHOOK_SECRET = defineString("STRIPE_WEBHOOK_SECRET");
- export const FIREBASE_REGION = defineString("FIREBASE_REGION");
+ // All params are defined in runtime.ts
+ // Re-export for backward compatibility if needed:
+ export { stripeSecretKey, stripeWebhookSecret } from './runtime';
```

### Step 3: Add claude.api_key as defineSecret (if AI features are live)

```typescript
// In runtime.ts:
export const claudeApiKey = defineSecret("CLAUDE_API_KEY");
```

Then update `aiBotEngine.ts` to use it:
```typescript
import { claudeApiKey } from './runtime';
// In function handler: const apiKey = claudeApiKey.value();
```

### Step 4: Remove functionsConfig() usage from consumers

| File | Action |
|---|---|
| `walletFintech.ts` | Remove `functionsConfig` from import if unused |
| `pack339-types.ts` | Remove `functionsConfig` from import |
| `pack339-disaster-recovery.ts` | Replace `functionsConfig` boolean with a constant `true` (it's a backup status flag) |

### Step 5: Verify

```powershell
# Find remaining functions.config() usage
Select-String -Path "avalo/functions/src/**/*.ts" -Pattern "functions\.config\(\)" -Recurse

# Find remaining functionsConfig references (should only be in runtime.ts)
Select-String -Path "avalo/functions/src/**/*.ts" -Pattern "functionsConfig" -Recurse

# Build
cd avalo/functions ; npm run build

# Deploy test
cd avalo ; npx firebase deploy --only functions --dry-run
```

---

## 4. Build & Deploy Gate Check

After migration:

1. `npm run build` in `functions/` → must pass with 0 errors
2. `npx firebase deploy --only functions --dry-run` → verifies function discovery
3. Secrets must be set in Firebase:
   ```bash
   firebase functions:secrets:set STRIPE_SECRET_KEY
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   # If AI features active:
   firebase functions:secrets:set CLAUDE_API_KEY
   ```

---

## 5. Risk Assessment

| Risk | Level | Mitigation |
|---|---|---|
| Breaking Stripe payments by removing wrong param | 🔴 HIGH | Canonical params are in `runtime.ts` (defineSecret). Test Stripe webhook before deploy. |
| Removing functionsConfig shim breaks disaster recovery | 🟡 MEDIUM | The shim returns `{}` on Gen2 already. Removing it only removes the `{}` fallback. |
| FIREBASE_REGION param unused but referenced | ⚪ LOW | Safe to remove — region is hardcoded via setGlobalOptions. |

---

## 6. Summary

The migration is **90% complete**. The remaining work:

1. **Delete or align `params.ts`** (duplicate definitions with wrong types)
2. **Remove duplicate shim** in `common.ts`
3. **Clean up `functionsConfig` imports** in 3 consumer files
4. **(Optional)** Add `CLAUDE_API_KEY` as `defineSecret` if AI bot features go live
5. **Rebuild and test**

Total estimated effort: ~30 minutes of code changes + test verification.
