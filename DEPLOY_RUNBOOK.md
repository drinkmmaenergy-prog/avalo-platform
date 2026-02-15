# Avalo Production Deploy Runbook

## Pre-Deploy Checklist

### A — Install & Build
```powershell
# Functions
cd avalo/functions
pnpm install
pnpm run build
# Expected: Exit code 0, no errors

# Web
cd avalo/app-web
pnpm install
# Expected: "Already up to date" or successful install
```

### B — Smoke Tests (Functions)
```powershell
cd avalo/functions
pnpm run test:smoke -- --testPathPattern=tests/smoke/boot
# Expected: 8/8 tests pass
```

### C — Set Secrets (ONE-TIME, before first deploy)
```powershell
# Set Stripe secrets in Firebase Gen2 secret manager
firebase functions:secrets:set STRIPE_SECRET_KEY --project avalo-c8c46
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project avalo-c8c46
```

### D — Deploy Functions (staged rollout)
```powershell
# Step 1: Deploy ONLY health first to verify boot + secrets
firebase deploy --only functions:health --project avalo-c8c46 --non-interactive

# Step 2: Verify secrets are bound via gcloud
gcloud functions describe health --gen2 --region=europe-west1 --project avalo-c8c46 --format="yaml(serviceConfig.secretEnvironmentVariables)"
# Expected output should show STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET

# Step 3: Deploy smokeCheck
firebase deploy --only functions:smokeCheck --project avalo-c8c46 --non-interactive

# Step 4: Verify smokeCheck secrets binding
gcloud functions describe smokeCheck --gen2 --region=europe-west1 --project avalo-c8c46 --format="yaml(serviceConfig.secretEnvironmentVariables)"

# Step 5: Deploy all functions (after boot verification passes)
firebase deploy --only functions --project avalo-c8c46 --non-interactive
```

### E — Verify Cloud Run Boot
```powershell
# Call smokeCheck endpoint to verify container boots
Invoke-RestMethod -Uri "https://europe-west1-avalo-c8c46.cloudfunctions.net/smokeCheck"

# Or with curl:
curl https://europe-west1-avalo-c8c46.cloudfunctions.net/smokeCheck

# Expected response:
# {
#   "status": "ok",
#   "environment": "cloud_run",
#   "hasStripeSecretKey": true,
#   "hasStripeWebhookSecret": true,
#   "secretsPresent": {
#     "STRIPE_SECRET_KEY": true,
#     "STRIPE_WEBHOOK_SECRET": true
#   },
#   "nodeEnv": "production",
#   "projectId": "avalo-c8c46",
#   "region": "europe-west1"
# }
```

### F — Verify Health Endpoint
```powershell
Invoke-RestMethod -Uri "https://europe-west1-avalo-c8c46.cloudfunctions.net/health"
# Or:
curl https://europe-west1-avalo-c8c46.cloudfunctions.net/health

# Expected: status 200, "healthy"
```

### G — Web Smoke Tests (requires dev server running)
```powershell
cd avalo/app-web
pnpm run dev &
# Wait for "Ready in X.Xs"
pnpm run smoke:web
```

---

## Architecture: Secret Wiring Flow

```
setGlobalOptions({ secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] })
    ↓
Cloud Run injects secrets as process.env.*
    ↓
init.ts → startupValidator.ts → validates secrets exist
    ↓
Container boots successfully
    ↓
smokeCheck endpoint confirms secrets are present
```

## Key Files Modified

| File | Change |
|------|--------|
| `functions/src/runtime.ts` | Added `defineSecret()` + `secrets` to `setGlobalOptions` |
| `functions/src/api/smokeCheck.ts` | New: smoke endpoint for boot verification |
| `functions/src/index.ts` | Added `smokeCheck` export |
| `functions/jest.config.js` | New: Jest test configuration |
| `functions/tests/setup.ts` | New: Test environment setup |
| `functions/tests/smoke/boot.test.ts` | New: 8 boot verification tests |
| `functions/package.json` | Added `smoke:functions` script |
| `app-web/tests/e2e/smoke.spec.ts` | New: 5 web smoke E2E tests |
| `app-web/package.json` | Added `smoke:web` script |

## Invariants Preserved

- ✅ No business logic modified
- ✅ No tokenomics changed
- ✅ No pricing changes
- ✅ USD canonical invariant (TOKEN_PAYOUT_USD = 0.03) verified by smoke test
- ✅ No eligibility rules modified
- ✅ startupValidator still enforces production safety
- ✅ Stripe test-key-in-production guard still active
