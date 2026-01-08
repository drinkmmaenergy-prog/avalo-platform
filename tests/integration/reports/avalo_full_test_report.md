# 🔥 AVALO Firebase Integration Test Report

**Generated:** 5.11.2025, 22:21:11  
**Project ID:** avalo-c8c46  
**Region:** europe-west3  
**Duration:** 138ms

---

## 📊 Summary

| Metric | Value |
|--------|-------|
| Total Tests | 28 |
| ✅ Passed | 6 |
| 🔥 Failed | 12 |
| ⚠️ Warnings | 6 |
| ⏭️ Skipped | 4 |
| **Pass Rate** | **21.43%** |

---

## 📋 Test Results

### Environment

🔥 **Environment: Load .env file** - 1ms
   ❌ Error: `Failed to load .env file: Error: ENOENT: no such file or directory, open 'c:\Users\Drink\avaloapp\tests\integration\functions\.env'`

🔥 **Environment: Required variables** - 0ms
   ❌ Error: `Missing required variables: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, GOOGLE_CLIENT_ID, OPENAI_API_KEY, ANTHROPIC_API_KEY, NODE_ENV, FUNCTIONS_REGION`

✅ **Environment: Forbidden variables** - 0ms
   📝 No forbidden variables found

✅ **Environment: API key validation** - 0ms
   📝 All API keys have valid formats

✅ **Security: Environment variable exposure** - 0ms
   📝 No obvious security issues in environment variables

### Build

🔥 **Build: TypeScript compilation** - 8ms
   ❌ Error: `Build failed: spawn C:\Windows\system32\cmd.exe ENOENT`

🔥 **Build: Output validation** - 0ms
   ❌ Error: `lib/index.js not found after build`

### Emulators

⚠️ **Emulator: Functions emulator** - 49ms
   📝 Functions emulator not running. Start with: firebase emulators:start

⚠️ **Emulator: Firestore emulator** - 28ms
   📝 Firestore emulator not running

✅ **Emulator: Auth emulator** - 5ms
   📝 Auth emulator running on port 9099

⚠️ **Emulator: Storage emulator** - 4ms
   📝 Storage emulator not running

⏭️ **Firestore: Emulator connectivity** - 3ms
   📝 Firestore emulator not running

✅ **Auth: Emulator connectivity** - 2ms
   📝 Auth emulator accessible

⏭️ **Storage: Emulator connectivity** - 2ms
   📝 Storage emulator not running

### Endpoints

🔥 **Endpoint: ping** - 4ms
   ❌ Error: `Request failed: Body is unusable: Body has already been read`

🔥 **Endpoint: getSystemInfo** - 3ms
   ❌ Error: `Request failed: Body is unusable: Body has already been read`

🔥 **Endpoint: getGlobalFeedV1** - 2ms
   ❌ Error: `Request failed: Body is unusable: Body has already been read`

🔥 **Endpoint: purchaseTokensV2** - 2ms
   ❌ Error: `Request failed: Body is unusable: Body has already been read`

🔥 **Endpoint: getTransactionHistoryV2** - 2ms
   ❌ Error: `Request failed: Body is unusable: Body has already been read`

🔥 **Endpoint: connectWalletV1** - 3ms
   ❌ Error: `Request failed: Body is unusable: Body has already been read`

### Integrations

⚠️ **Emulator: Storage emulator** - 4ms
   📝 Storage emulator not running

🔥 **Stripe: API key validation** - 0ms
   ❌ Error: `STRIPE_SECRET_KEY not found`

🔥 **Stripe: Webhook endpoint** - 8ms
   ❌ Error: `Request failed: Body is unusable: Body has already been read`

⏭️ **Storage: Emulator connectivity** - 2ms
   📝 Storage emulator not running

⚠️ **AI: OpenAI API key** - 0ms
   📝 OPENAI_API_KEY not configured

⚠️ **AI: Anthropic API key** - 0ms
   📝 ANTHROPIC_API_KEY not configured

### Security

✅ **Security: Environment variable exposure** - 0ms
   📝 No obvious security issues in environment variables

✅ **Security: API key formats** - 0ms
   📝 All API keys have correct formats

### Performance

⏭️ **Performance: Ping latency** - 3ms
   📝 Endpoint unreachable

⏭️ **Performance: System info response** - 2ms
   📝 Endpoint unreachable

---

## 🎯 Recommendations

### 🔥 Critical Issues

- **Environment: Load .env file**: Failed to load .env file: Error: ENOENT: no such file or directory, open 'c:\Users\Drink\avaloapp\tests\integration\functions\.env'
- **Environment: Required variables**: Missing required variables: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, GOOGLE_CLIENT_ID, OPENAI_API_KEY, ANTHROPIC_API_KEY, NODE_ENV, FUNCTIONS_REGION
- **Build: TypeScript compilation**: Build failed: spawn C:\Windows\system32\cmd.exe ENOENT
- **Build: Output validation**: lib/index.js not found after build
- **Endpoint: ping**: Request failed: Body is unusable: Body has already been read
- **Endpoint: getSystemInfo**: Request failed: Body is unusable: Body has already been read
- **Endpoint: getGlobalFeedV1**: Request failed: Body is unusable: Body has already been read
- **Endpoint: purchaseTokensV2**: Request failed: Body is unusable: Body has already been read
- **Endpoint: getTransactionHistoryV2**: Request failed: Body is unusable: Body has already been read
- **Endpoint: connectWalletV1**: Request failed: Body is unusable: Body has already been read
- **Stripe: API key validation**: STRIPE_SECRET_KEY not found
- **Stripe: Webhook endpoint**: Request failed: Body is unusable: Body has already been read

### ⚠️ Warnings

- **Emulator: Functions emulator**: Functions emulator not running. Start with: firebase emulators:start
- **Emulator: Firestore emulator**: Firestore emulator not running
- **Emulator: Storage emulator**: Storage emulator not running
- **Auth: OAuth configuration**: GOOGLE_CLIENT_ID not configured
- **AI: OpenAI API key**: OPENAI_API_KEY not configured
- **AI: Anthropic API key**: ANTHROPIC_API_KEY not configured

---

*Report generated by Avalo Integration Test Suite v1.0.0*
