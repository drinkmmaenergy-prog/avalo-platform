# 🚀 Avalo Post-Deployment Verification - Quick Start

## Prerequisites

1. **Firebase Emulators Running**
   ```bash
   firebase emulators:start
   ```

2. **Environment Configured**
   - `functions/.env` file exists with all required keys

## Run Verification

### Windows
```bash
cd tests\verification
run-verification.bat
```

### Linux/Mac
```bash
cd tests/verification
chmod +x run-verification.sh
./run-verification.sh
```

### Direct
```bash
npx ts-node tests/verification/index.ts
```

## What Gets Tested

✅ **Core Health** - Emulators, endpoints, build validation  
✅ **Backend-Frontend** - App config, Firebase services  
✅ **Payments** - Stripe integration, webhooks  
✅ **Loyalty** - Gamification, rewards system  
✅ **AI** - OpenAI/Anthropic, content moderation  
✅ **i18n** - Translations (5 languages)  
✅ **Security** - Rules, keys, CORS, JWT  
✅ **Performance** - Latency (p50/p95/p99), concurrency  
✅ **Firestore** - Rules, indexes, security checks  

## Results

Reports saved to `/reports/`:
- `avalo_post_deploy_verification.md` - Detailed report
- `avalo_post_deploy_verification.json` - Machine-readable
- `logs/post_deploy_run.log` - Execution log

## Exit Codes

- **0** - Passed (may have warnings)
- **1** - Failed (critical issues)

## Next Steps

### If PASSED ✅
→ Proceed with deployment

### If WARNINGS ⚠️
→ Review warnings, assess risk, fix critical issues

### If FAILED ❌
→ Fix failures, re-run verification, DO NOT DEPLOY

---

**Full Documentation:** [`README.md`](README.md)  
**Implementation Details:** [`AVALO_POST_DEPLOYMENT_VERIFICATION_SUITE.md`](../../AVALO_POST_DEPLOYMENT_VERIFICATION_SUITE.md)