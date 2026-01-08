# ⚡ Stripe & AI Test Suite - Quick Start Guide

## 🎯 Run Tests in 3 Simple Steps

### Step 1: Ensure Prerequisites
Make sure you have:
- ✅ Node.js installed (v16 or higher)
- ✅ Firebase Functions configured
- ✅ Environment variables set in `functions/.env`

### Step 2: Navigate to Test Directory
```bash
cd tests/integration
```

### Step 3: Run Tests

**Windows:**
```bash
run-stripe-ai-tests.bat
```

**Linux/macOS:**
```bash
chmod +x run-stripe-ai-tests.sh
./run-stripe-ai-tests.sh
```

---

## 📊 What Gets Tested

✅ **Payment Flow** - purchaseTokensV2, getTransactionHistoryV2, getUserWalletsV2  
✅ **Stripe Webhooks** - Configuration and event handling  
✅ **Token Pricing** - 0.20 PLN baseline with volume discounts  
✅ **OpenAI Moderation** - Content analysis and NSFW detection  
✅ **Anthropic Moderation** - AI-powered content filtering  
✅ **Performance** - Latency monitoring (≤2s for AI, ≤3s for payments)

---

## 📈 View Results

After running tests, check:
- 📄 **reports/stripe_ai_verification.md** - Human-readable report
- 📊 **reports/stripe_ai_verification.json** - Machine-readable data

---

## ⚙️ Required Environment Variables

Create or update `functions/.env`:

```bash
# Stripe (Test Mode)
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_secret_here

# AI Services
OPENAI_API_KEY=sk-your_openai_key_here
ANTHROPIC_API_KEY=sk-ant-your_anthropic_key_here

# Firebase
FUNCTIONS_REGION=europe-west3
NODE_ENV=development
```

---

## 🎯 Success Indicators

### ✅ All Good
```
📊 SUMMARY:
   Total Tests:    25
   ✅ Passed:      23
   🔥 Failed:      0
   ⚠️  Warnings:    2
   ⏭️  Skipped:     0
   📈 Pass Rate:   92.00%
```

### ⚠️ Needs Attention
- Failed tests indicate configuration issues
- Warnings may require investigation
- Check the generated reports for details

---

## 🐛 Quick Troubleshooting

### Error: "Missing environment variables"
**Fix:** Add required keys to `functions/.env`

### Error: "Endpoint unreachable"
**Fix:** Start Firebase emulators:
```bash
firebase emulators:start
```

### Error: "Invalid API key"
**Fix:** Verify API keys in `.env`:
- Stripe test keys start with `sk_test_`
- OpenAI keys start with `sk-`
- Anthropic keys start with `sk-ant-`

---

## 📚 Full Documentation

For detailed information, see [`STRIPE_AI_TEST_SUITE.md`](STRIPE_AI_TEST_SUITE.md)

---

**Need Help?** Check the troubleshooting section in the full documentation.