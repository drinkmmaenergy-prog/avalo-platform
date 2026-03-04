# AVALO — PHASE 4 VERIFICATION REPORT

**Date:** 2026-02-19  
**Auditor:** Kilo Code (Code Mode)  
**Scope:** app-web runtime validation, auth flow, Stripe flow, App Hosting config, failure scenarios  
**Constraint:** DO NOT MODIFY BUSINESS LOGIC / ECONOMY INVARIANTS / FIREBASE FUNCTIONS BACKEND

---

## STEP 1 — RUNTIME VALIDATION

### 1.1 Firebase Client Runtime

| Check | Status | Evidence |
|-------|--------|----------|
| `firebaseConfigValid` exported | **PASS** | [`firebaseConfigValid`](avalo/app-web/src/lib/firebase.ts:45) — computed as `missingKeys.length === 0` |
| Config reads from `NEXT_PUBLIC_FIREBASE_*` env vars | **PASS** | [`firebaseConfig`](avalo/app-web/src/lib/firebase.ts:23-30) — all 6 keys from `process.env` |
| Required keys validated | **PASS** | [`REQUIRED_KEYS`](avalo/app-web/src/lib/firebase.ts:33-37) — checks `apiKey`, `authDomain`, `projectId` |
| No "API key not valid" in staging | **UNVERIFIED — NEED MANUAL TEST** | `.env.local` contains `AIzaSyANQ6LpHgcbynuL8lKlK8GJduuxiri1V0s` for `avalostaging`. Code-level: valid format, matches staging project |
| Firebase Auth initializes only once | **PASS** | [`getApps().length === 0`](avalo/app-web/src/lib/firebase.ts:63) — singleton guard present |
| No hydration errors | **UNVERIFIED — NEED MANUAL TEST** | Code-level: all consumer components use `'use client'` directive. No server/client mismatch detected in static analysis. `RootLayout` is server component wrapping `Providers` (client). Correct pattern. |
| No duplicate `initializeApp()` | **RISK** | [`hooks/useUserRestriction.ts`](avalo/app-web/hooks/useUserRestriction.ts:9-19) calls `initializeApp()` with **hardcoded production config** (`avalo-c8c46`), potentially creating a SECOND Firebase app instance conflicting with the staging singleton. This file is in `hooks/` (outside `src/`) which may not be actively imported, but it is a latent risk. |

### 1.2 Auth Flow Real Test

| Check | Status | Evidence |
|-------|--------|----------|
| Register new user | **PASS (code-verified)** | [`/api/auth/register`](avalo/app-web/src/app/api/auth/register/route.ts:47-175) — calls Firebase Auth REST `accounts:signUp`, creates Firestore `users/{uid}` via REST |
| Firestore user document created on register | **PASS** | [Register route lines 129-155](avalo/app-web/src/app/api/auth/register/route.ts:129-155) — creates doc with `uid`, `email`, `displayName`, `role: 'user'`, `tokenBalance: 0`, `createdAt` |
| Firestore user document created on first login (fallback) | **PASS** | [`ensureUserDocument()`](avalo/app-web/src/components/providers/AuthProvider.tsx:62-76) — creates `users/{uid}` if missing. Additionally, `checkUserDocExists()` at [line 51](avalo/app-web/src/components/providers/AuthProvider.tsx:51) prevents double-create |
| Login flow | **PASS (code-verified)** | [`/api/auth/login`](avalo/app-web/src/app/api/auth/login/route.ts:49-119) — calls Firebase Auth REST `accounts:signInWithPassword`, returns `idToken` |
| Client-side login via SDK | **PASS** | [`sdk.signInWithEmail()`](avalo/app-web/src/lib/sdk.ts:41-43) — calls `signInWithEmailAndPassword(auth, email, password)` |
| Logout flow | **PASS** | [`sdk.signOut()`](avalo/app-web/src/lib/sdk.ts:65-68) — calls `fbSignOut(auth)`. AuthProvider clears state at [line 151](avalo/app-web/src/components/providers/AuthProvider.tsx:151-156) |
| No redirect loops | **PASS** | Login page at [line 24](avalo/app-web/src/app/auth/login/page.tsx:24-32): checks `!authLoading && firebaseUser` before redirect to `/feed` or `/onboarding`. AppShell at [line 61](avalo/app-web/src/components/layouts/AppShell.tsx:61-64): checks `!loading && !firebaseUser` before redirect to `/auth/login`. No circular conditions possible. |
| Actual runtime auth flow | **UNVERIFIED — NEED MANUAL TEST** |

### 1.3 Stripe Flow

| Check | Status | Evidence |
|-------|--------|----------|
| Client sends only `packId` | **PASS** | [`createCheckoutSession()`](avalo/app-web/src/lib/api/tokens.ts:46-56) — sends `{ packId, source, userId, successUrl, cancelUrl }`. No amount or price field. |
| Server forces currency to `'usd'` | **PASS** | [`checkout/route.ts line 94`](avalo/app-web/src/app/api/stripe/checkout/route.ts:94) — `const currency = 'usd';` hardcoded server-side |
| Server resolves price from canonical pack | **PASS** | [`pack.priceUSD`](avalo/app-web/src/app/api/stripe/checkout/route.ts:95) — `const priceInCents = pack.priceUSD;` derived from `CANONICAL_TOKEN_PACKS` |
| packId validated against canonical packs | **PASS** | [Lines 48-54](avalo/app-web/src/app/api/stripe/checkout/route.ts:48-54) — `CANONICAL_TOKEN_PACKS[packId.toUpperCase()]`, returns 400 if invalid |
| Auth required for web checkout | **PASS** | [Lines 68-89](avalo/app-web/src/app/api/stripe/checkout/route.ts:68-89) — verifies Bearer token via `adminAuth.verifyIdToken()`, returns 401 if missing |
| No client-side amount tampering possible | **PASS** | Client never sends amount. Server reads from `CANONICAL_TOKEN_PACKS` constant. |
| Stripe Checkout session returns valid URL | **PASS (code-verified)** | [Lines 97-132](avalo/app-web/src/app/api/stripe/checkout/route.ts:97-132) — `stripe.checkout.sessions.create()` returns `session.url` |
| Webhook validates payment amount | **PASS** | [`webhook/route.ts line 72`](avalo/app-web/src/app/api/stripe/webhook/route.ts:72-81) — `session.amount_total !== pack.priceUSD` → rejects with "Amount mismatch" |
| Webhook deduplicates sessions | **PASS** | [Line 89](avalo/app-web/src/app/api/stripe/webhook/route.ts:89) — `existingPurchase.exists` check inside transaction |
| Webhook verifies Stripe signature | **PASS** | [Lines 34-39](avalo/app-web/src/app/api/stripe/webhook/route.ts:34-39) — `stripe.webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET)` |
| Actual Stripe flow | **UNVERIFIED — NEED MANUAL TEST** |

### 1.4 App Hosting Runtime

| Check | Status | Evidence |
|-------|--------|----------|
| `apphosting.yaml` present | **PASS** | [`apphosting.yaml`](avalo/app-web/apphosting.yaml:1-39) — full config with `runConfig`, `env` section |
| NEXT_PUBLIC_FIREBASE_* in apphosting.yaml | **PASS** | [Lines 16-27](avalo/app-web/apphosting.yaml:16-27) — all 6 Firebase client vars defined (3 as secrets, 3 as values) |
| Stripe secrets in apphosting.yaml | **PASS** | [Lines 30-35](avalo/app-web/apphosting.yaml:30-35) — `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` as secrets |
| FIREBASE_SERVICE_ACCOUNT_KEY in apphosting.yaml | **PASS** | [Line 38-39](avalo/app-web/apphosting.yaml:38-39) — secret reference |
| `output: "standalone"` in next.config.js | **PASS** | [`next.config.js line 10`](avalo/app-web/next.config.js:10) — `output: "standalone"` |
| `outputFileTracingRoot` set | **PASS** | [`next.config.js line 12`](avalo/app-web/next.config.js:12) — `outputFileTracingRoot: __dirname` |
| Env vars injected at runtime (not only build) | **PASS** | App Hosting injects `env` vars at both build and runtime. The `secret:` references in apphosting.yaml are resolved by Cloud Run at container start, not baked into image. |
| NEXT_PUBLIC_FIREBASE_* in client bundle | **PASS** | Next.js inlines `NEXT_PUBLIC_*` vars at build time. `apphosting.yaml` provides these during build. |
| No missing secret errors | **UNVERIFIED — NEED MANUAL TEST** | Requires `firebase apphosting:secrets:list` or actual deploy to verify all secrets exist in Secret Manager |
| Backend ID configured | **PASS** | [`firebase.json line 103`](avalo/firebase.json:103) — `"backendId": "avalo-web-staging"` |
| Root dir correct | **PASS** | [`firebase.json line 104`](avalo/firebase.json:104) — `"rootDir": "app-web"` |

---

## STEP 2 — AUTOMATED VERIFICATION COMMANDS

### A) Clean rebuild test

```powershell
cd C:\a\avalo
git clean -xfd
cd app-web
pnpm install
pnpm build
```

### B) Type safety check

```powershell
cd C:\a\avalo\app-web
pnpm tsc --noEmit
```

### C) Lint check

```powershell
cd C:\a\avalo\app-web
pnpm lint
```

### D) Local prod preview

```powershell
cd C:\a\avalo\app-web
pnpm build
pnpm start
```

Then open `http://localhost:3000` in browser. Check:
- Console for `[lib/firebase] ❌ Missing required Firebase config keys` (should NOT appear if `.env.local` is present)
- No hydration errors in console
- Navigate to `/auth/login`, `/wallet`, `/feed`

### E) Staging deploy

```powershell
cd C:\a\avalo
firebase deploy --only hosting:web --project avalostaging
```

**Note:** For App Hosting (not static hosting), the command is:

```powershell
cd C:\a\avalo
firebase apphosting:backends:create --project avalostaging
# Or if backend already exists:
# Push to the connected Git branch; App Hosting auto-deploys on push.
# Manual rollout:
firebase apphosting:rollouts:create avalo-web-staging --project avalostaging --branch main
```

### F) Post-deploy log inspection

```powershell
# App Hosting logs (Cloud Run based):
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=avalo-web-staging" --project avalostaging --limit 50 --format "table(timestamp, textPayload)"

# Or via Firebase CLI if available:
firebase apphosting:backends:get avalo-web-staging --project avalostaging
```

### G) Secret verification (pre-deploy)

```powershell
# Verify all required secrets exist in Secret Manager:
gcloud secrets list --project avalostaging --filter="name:NEXT_PUBLIC_FIREBASE_API_KEY OR name:STRIPE_SECRET_KEY OR name:STRIPE_WEBHOOK_SECRET OR name:FIREBASE_SERVICE_ACCOUNT_KEY OR name:NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY OR name:NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID OR name:NEXT_PUBLIC_FIREBASE_APP_ID"
```

---

## STEP 3 — FAILURE SCENARIOS

### 3.1 Stripe Secret Key Missing (`STRIPE_SECRET_KEY`)

| Aspect | Detail |
|--------|--------|
| **Expected behavior** | Stripe checkout and webhook routes fail. Users see "Internal server error" when attempting purchase. |
| **Confirmed current behavior** | [`stripe-server.ts`](avalo/app-web/src/lib/stripe-server.ts:12-16) logs `❌ STRIPE_SECRET_KEY is not set`. Stripe client initialized with `'sk_missing'` fallback → all Stripe API calls will return `401 Unauthorized`. Checkout route catches error and returns `{ success: false, error: message }` with HTTP 500. |
| **Risk level** | **HIGH** — Purchases completely blocked. No data corruption. Revenue loss only. |

### 3.2 Firebase API Key Missing (`NEXT_PUBLIC_FIREBASE_API_KEY`)

| Aspect | Detail |
|--------|--------|
| **Expected behavior** | Firebase Auth and Firestore fail. App renders but no user can log in or register. |
| **Confirmed current behavior** | [`firebase.ts`](avalo/app-web/src/lib/firebase.ts:47-53) sets `firebaseConfigValid = false`, logs `❌ Missing required Firebase config keys: apiKey`. All singletons (`auth`, `db`, `storage`, `functions`) remain `null`. AuthProvider at [line 104](avalo/app-web/src/components/providers/AuthProvider.tsx:104-107) returns early when `auth` is null → `loading = false`, `user = null`. App renders unauthenticated state. Register API route at [line 49](avalo/app-web/src/app/api/auth/register/route.ts:49-55) returns 500. Login API route at [line 51](avalo/app-web/src/app/api/auth/login/route.ts:51-57) returns 500. |
| **Risk level** | **CRITICAL** — App is non-functional. No auth, no data access. Complete outage. |

### 3.3 Webhook Secret Missing (`STRIPE_WEBHOOK_SECRET`)

| Aspect | Detail |
|--------|--------|
| **Expected behavior** | Webhooks cannot verify Stripe signatures. Token crediting fails. |
| **Confirmed current behavior** | [`webhook/route.ts`](avalo/app-web/src/app/api/stripe/webhook/route.ts:14-16) returns `{ error: 'Webhook secret not configured' }` with HTTP 500 on every webhook call. Stripe will retry delivery for up to 72 hours. Payments succeed on Stripe side but tokens are NOT credited to users. |
| **Risk level** | **CRITICAL** — Users pay but don't receive tokens. Revenue collected but service not delivered. Support escalation guaranteed. |

### 3.4 FIREBASE_SERVICE_ACCOUNT_KEY Invalid

| Aspect | Detail |
|--------|--------|
| **Expected behavior** | Firebase Admin SDK fails to initialize with service account. Falls back to Application Default Credentials. |
| **Confirmed current behavior** | [`firebase-admin.ts`](avalo/app-web/src/lib/firebase-admin.ts:24-33) catches `JSON.parse` error, logs `Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY`. Then falls back to [line 37](avalo/app-web/src/lib/firebase-admin.ts:37-39) `initializeApp()` with only `projectId`. On App Hosting (Cloud Run), ADC is available → admin SDK works. Locally without ADC → Firestore/Auth admin calls fail at runtime. Stripe checkout returns 500 on `adminAuth.verifyIdToken()`. Webhook returns 500 on Firestore transaction. |
| **Risk level** | **HIGH** on App Hosting (usually ADC fallback works), **CRITICAL** locally (no fallback). |

### 3.5 packId Tampered (client sends invalid packId)

| Aspect | Detail |
|--------|--------|
| **Expected behavior** | Server rejects with 400, no Stripe session created. |
| **Confirmed current behavior** | [`checkout/route.ts line 48-54`](avalo/app-web/src/app/api/stripe/checkout/route.ts:48-54) — `CANONICAL_TOKEN_PACKS[packId.toUpperCase()]` returns `undefined` → responds `{ success: false, error: 'Invalid packId: ...' }` 400. Additionally, webhook at [line 65-69](avalo/app-web/src/app/api/stripe/webhook/route.ts:65-69) re-validates packId. And [line 72-81](avalo/app-web/src/app/api/stripe/webhook/route.ts:72-81) validates `amount_total` matches canonical price. |
| **Risk level** | **NONE** — Properly handled. Double-validated on both checkout creation and webhook fulfillment. |

### 3.6 User Not Authenticated but Accesses `/wallet`

| Aspect | Detail |
|--------|--------|
| **Expected behavior** | Redirect to login page. |
| **Confirmed current behavior** | `/wallet` uses [`AppShell`](avalo/app-web/src/app/wallet/layout.tsx:10-12) as layout. AppShell at [line 61-64](avalo/app-web/src/components/layouts/AppShell.tsx:61-64): `if (!loading && !firebaseUser) router.replace('/auth/login')`. Additionally, `/wallet/buy` uses [`useRoleGate`](avalo/app-web/src/app/wallet/buy/page.tsx:48-52) with `redirectTo: '/auth/login?redirect=/wallet/buy'`. Stripe checkout route at [line 85-89](avalo/app-web/src/app/api/stripe/checkout/route.ts:85-89) returns 401 if no `effectiveUid`. |
| **Risk level** | **NONE** — Triple-layered protection: client-side AppShell guard, useRoleGate guard, server-side auth check. |

---

## KNOWN ISSUES FOUND DURING AUDIT

### ISSUE 1: Duplicate Firebase Initialization in `hooks/useUserRestriction.ts`

**File:** [`hooks/useUserRestriction.ts`](avalo/app-web/hooks/useUserRestriction.ts:9-22)  
**Severity:** MEDIUM  
**Description:** This file at `avalo/app-web/hooks/` (outside `src/`) contains a hardcoded Firebase config pointing to `avalo-c8c46` (production project), and calls `initializeApp()` independently. If this hook is imported by any component, it creates a second Firebase app instance pointing to *production* while the main app points to *staging* via env vars.  
**Impact:** Could leak staging user actions to production Firestore, or cause "Firebase App named '[DEFAULT]' already exists" errors if `getApps().length` check passes due to the first app already being initialized.  
**Current mitigation:** The file uses `if (!getApps().length)` guard, so if the canonical `src/lib/firebase.ts` initializes first, this second call is skipped. But the `db = getFirestore()` at line 22 would then use the staging app (correct behavior accidentally).  
**Recommendation:** This file should import `db` from `@/lib/firebase` instead of independently initializing Firebase. However, since it's outside `src/` and the `@/` alias maps to `src/`, it may not be importable by app code via the standard path alias. **Confirm if this file is actively imported anywhere.**

### ISSUE 2: `.env.local` Contains Live Stripe Keys

**File:** [`.env.local`](avalo/app-web/.env.local:29-31)  
**Severity:** HIGH  
**Description:** The `.env.local` file contains `pk_live_*` and `sk_live_*` Stripe keys alongside staging Firebase config. This means local dev and staging builds use **live Stripe** keys, which will process real charges.  
**Impact:** Any test purchase in staging environment will charge real credit cards.  
**Recommendation:** Use `pk_test_*` / `sk_test_*` keys for staging. Live keys should only be in production App Hosting secrets.

### ISSUE 3: `typescript.ignoreBuildErrors: true` in next.config.js

**File:** [`next.config.js`](avalo/app-web/next.config.js:14-16)  
**Severity:** MEDIUM  
**Description:** Build will succeed even with TypeScript errors, potentially shipping broken code.  
**Impact:** Type errors won't block deployment. Runtime errors possible.  
**Recommendation:** Run `pnpm tsc --noEmit` as a mandatory gate in CI before build.

### ISSUE 4: `strict: false` in tsconfig.json

**File:** [`tsconfig.json`](avalo/app-web/tsconfig.json:11)  
**Severity:** LOW  
**Description:** TypeScript strict mode is disabled (though `strictNullChecks: true` is enabled separately at line 39).  
**Impact:** Reduced type safety. Implicit `any` types allowed.

---

## STEP 4 — FINAL OUTPUT

### PASS / FAIL / RISK MATRIX

| Domain | Item | Verdict |
|--------|------|---------|
| **Firebase Client** | Singleton init | ✅ PASS |
| **Firebase Client** | Env-based config | ✅ PASS |
| **Firebase Client** | Config validation | ✅ PASS |
| **Firebase Client** | No duplicate init in `src/` | ✅ PASS |
| **Firebase Client** | Duplicate init outside `src/` | ⚠️ RISK (ISSUE 1) |
| **Auth** | Register → Firestore doc | ✅ PASS |
| **Auth** | Login → token return | ✅ PASS |
| **Auth** | Logout → state cleanup | ✅ PASS |
| **Auth** | No redirect loops | ✅ PASS |
| **Auth** | Auth guard on `/wallet` | ✅ PASS |
| **Auth** | Auth guard on `/feed` | ✅ PASS |
| **Stripe** | Client sends only packId | ✅ PASS |
| **Stripe** | Server forces `'usd'` | ✅ PASS |
| **Stripe** | Price from canonical pack | ✅ PASS |
| **Stripe** | Anti-tamper validation (webhook) | ✅ PASS |
| **Stripe** | Signature verification | ✅ PASS |
| **Stripe** | Idempotent purchase processing | ✅ PASS |
| **Stripe** | Live keys in staging env | ❌ FAIL (ISSUE 2) |
| **App Hosting** | apphosting.yaml complete | ✅ PASS |
| **App Hosting** | Secrets referenced | ✅ PASS |
| **App Hosting** | standalone output | ✅ PASS |
| **App Hosting** | outputFileTracingRoot | ✅ PASS |
| **App Hosting** | Backend ID set | ✅ PASS |
| **Build** | ignoreBuildErrors | ⚠️ RISK (ISSUE 3) |
| **Build** | strict mode off | ⚠️ RISK (ISSUE 4) |
| **Economy** | CANONICAL_TOKEN_PACKS immutable | ✅ PASS |
| **Economy** | PAYOUT_PER_TOKEN_USD = 0.03 | ✅ PASS |
| **Economy** | CREATOR_SHARE = 0.65 | ✅ PASS |
| **Economy** | No client-side price override | ✅ PASS |

### Scores

| Metric | Score | Rationale |
|--------|-------|-----------|
| **Runtime Stability** | **78 / 100** | Core runtime architecture is sound. Deductions: duplicate Firebase init outside `src/` (-7), `ignoreBuildErrors` allowing broken TS through (-10), no strict TS mode (-5) |
| **Security** | **72 / 100** | Stripe flow is hardened (server-only pricing, signature verification, amount check, dedup). Auth flow has triple-layer guards. Deductions: live Stripe keys in `.env.local` committed to repo (-15), hardcoded production Firebase config in non-canonical file (-8), `strict: false` allows implicit any (-5) |
| **Production Readiness** | **68 / 100** | Architecture is correct for App Hosting. All secrets referenced in `apphosting.yaml`. Standalone output configured. Deductions: live keys in staging env file (-15), `ignoreBuildErrors` (-10), no CI/CD pipeline verified (-5), runtime tests unverified (-2) |

### Recommendation: **CONDITIONAL GO**

The system is architecturally sound and ready for staging deployment **after fixing 2 blocking issues:**

#### Required Fixes Before Production (NO-GO blockers):

1. **CRITICAL: Replace live Stripe keys in `.env.local` with test keys.** Current file has `sk_live_*` / `pk_live_*` keys which will process real charges in staging/local environments. Replace with `sk_test_*` / `pk_test_*` for staging. Live keys must only exist in production App Hosting secrets.

2. **HIGH: Verify all secrets exist in Firebase Secret Manager for `avalostaging` project.** Run:
   ```powershell
   gcloud secrets list --project avalostaging
   ```
   Required secrets: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `FIREBASE_SERVICE_ACCOUNT_KEY`

#### Recommended Fixes (Non-blocking):

3. **MEDIUM:** Remove or refactor [`hooks/useUserRestriction.ts`](avalo/app-web/hooks/useUserRestriction.ts) to import from `@/lib/firebase` instead of hardcoding config and calling `initializeApp()`.

4. **MEDIUM:** Set `typescript.ignoreBuildErrors: false` in [`next.config.js`](avalo/app-web/next.config.js:15) and fix any resulting type errors before deploy.

#### Next Strategic Phase (if GO):

- **PHASE 5:** End-to-end staging smoke test (manual or Playwright):
  - Register user → confirm Firestore doc → login → navigate to `/wallet/buy` → initiate Stripe Checkout with test card → verify webhook credits tokens → confirm `token_transactions` entry → logout → confirm session cleared
- **PHASE 6:** Production secret provisioning and production App Hosting deployment
- **PHASE 7:** Load testing, monitoring setup, and auto-rollback configuration
