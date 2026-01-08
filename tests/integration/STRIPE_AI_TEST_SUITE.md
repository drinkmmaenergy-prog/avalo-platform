# 💳🤖 AVALO Stripe & AI Moderation Test Suite

**Automated Testing for Payment & AI Integration**

---

## 📋 Overview

This test suite provides comprehensive automated testing for:

### Payment & Stripe Integration
- ✅ Token purchase flows (`purchaseTokensV2`)
- ✅ Transaction history tracking (`getTransactionHistoryV2`)
- ✅ User wallet management (`getUserWalletsV2`)
- ✅ Stripe webhook configuration and validation
- ✅ Token pricing logic (0.20 PLN baseline with volume discounts)
- ✅ Multi-currency support (PLN, USD, EUR, GBP)

### AI Content Moderation
- ✅ OpenAI integration testing
- ✅ Anthropic (Claude) integration testing
- ✅ NSFW content detection
- ✅ API authentication validation
- ✅ Performance & latency monitoring (≤2s threshold)
- ✅ Multi-language support

---

## 🚀 Quick Start

### Prerequisites

1. **Node.js & npm** installed
2. **Firebase Functions** configured
3. **Environment variables** set in `functions/.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   OPENAI_API_KEY=sk-...
   ANTHROPIC_API_KEY=sk-ant-...
   ```

### Running the Tests

#### On Windows:
```bash
cd tests/integration
run-stripe-ai-tests.bat
```

#### On Linux/Mac:
```bash
cd tests/integration
chmod +x run-stripe-ai-tests.sh
./run-stripe-ai-tests.sh
```

#### Using npm:
```bash
cd tests/integration
npm install
npx ts-node runStripeAiTests.ts
```

---

## 📊 Test Categories

### 1. Environment Setup ✓
- Load and validate configuration
- Check required environment variables
- Verify API key formats

### 2. Stripe Configuration ✓
- API key format validation
- Test mode verification
- Webhook secret validation

### 3. Payment API Tests ✓
Tests the following endpoints:
- `purchaseTokensV2` - Token purchase flow
- `getTransactionHistoryV2` - Transaction retrieval
- `getUserWalletsV2` - Wallet balance management

### 4. Token Pricing Logic ✓
- Baseline pricing (0.20 PLN/token)
- Volume discount tiers:
  - 10 tokens: 0.20 PLN (0% discount)
  - 50 tokens: 0.19 PLN (5% discount)
  - 100 tokens: 0.18 PLN (10% discount)
  - 500 tokens: 0.17 PLN (15% discount)
  - 1000 tokens: 0.16 PLN (20% discount)
- Currency conversion validation

### 5. Stripe Webhook Tests ✓
- Webhook endpoint accessibility
- Payment event simulation
- Event type validation

### 6. OpenAI Moderation ✓
- API key validation
- Content moderation endpoint testing
- NSFW detection capabilities
- Latency benchmarking (≤2s)

### 7. Anthropic Moderation ✓
- API key validation
- Content analysis testing
- Multi-language support
- Performance monitoring

### 8. Performance Metrics ✓
- AI moderation latency (target: ≤2s)
- Payment flow latency (target: ≤3s)
- Error rate monitoring

---

## 📈 Generated Reports

The test suite generates two report files in the `reports/` directory:

### 1. JSON Report (`stripe_ai_verification.json`)
Machine-readable format containing:
- Test results with timestamps
- Performance metrics
- Error details
- Configuration status

### 2. Markdown Report (`stripe_ai_verification.md`)
Human-readable format with:
- Executive summary
- Stripe integration status
- AI moderation status
- Detailed test results
- Key findings & recommendations
- Token pricing matrix

---

## 🎯 Success Criteria

### ✅ All Tests Pass When:
- All required environment variables are set
- Stripe is configured in test mode
- OpenAI and Anthropic API keys are valid
- All payment endpoints are accessible
- AI moderation latency is under 2 seconds
- Token pricing logic validates correctly

### ⚠️ Warnings May Occur For:
- Endpoints requiring authentication (expected in production)
- Emulators not running (optional for some tests)
- High latency (>2s for AI, >3s for payments)
- Live mode Stripe keys (should use test mode)

---

## 🔧 Configuration

### Required Environment Variables

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...          # Stripe API key (test mode)
STRIPE_WEBHOOK_SECRET=whsec_...        # Webhook signing secret

# AI Configuration
OPENAI_API_KEY=sk-...                  # OpenAI API key
ANTHROPIC_API_KEY=sk-ant-...           # Anthropic API key

# Firebase Configuration
FUNCTIONS_REGION=europe-west3          # Firebase region
NODE_ENV=development                   # Environment
```

### Optional Configuration

Edit [`config.ts`](config.ts) to customize:
- Emulator ports
- API endpoints
- Timeout values
- Required environment variables

---

## 📊 Performance Thresholds

| Metric | Threshold | Status |
|--------|-----------|--------|
| AI Moderation Latency | ≤ 2000ms | ✅ Monitor |
| Payment API Latency | ≤ 3000ms | ✅ Monitor |
| Error Rate | < 10% | ✅ Monitor |
| Pass Rate | > 90% | ✅ Target |

---

## 🐛 Troubleshooting

### Common Issues

#### 1. "Endpoint unreachable"
**Solution:** Ensure Firebase emulators are running:
```bash
firebase emulators:start
```

#### 2. "Missing required environment variables"
**Solution:** Check `functions/.env` file contains all required keys:
```bash
cat functions/.env | grep -E "STRIPE|OPENAI|ANTHROPIC"
```

#### 3. "Invalid API key format"
**Solution:** Verify API keys:
- Stripe test keys start with `sk_test_`
- OpenAI keys start with `sk-`
- Anthropic keys start with `sk-ant-`

#### 4. "High latency warnings"
**Solution:** 
- Check network connectivity
- Verify API service status
- Consider caching strategies

#### 5. "Authentication required"
**Solution:** This is expected for protected endpoints. Tests validate endpoint accessibility, not full functionality without auth.

---

## 🔄 CI/CD Integration

### GitHub Actions Example

```yaml
name: Stripe & AI Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          cd tests/integration
          npm install
      
      - name: Run Stripe & AI tests
        env:
          STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}
          STRIPE_WEBHOOK_SECRET: ${{ secrets.STRIPE_WEBHOOK_SECRET }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          cd tests/integration
          ./run-stripe-ai-tests.sh
      
      - name: Upload reports
        uses: actions/upload-artifact@v2
        with:
          name: test-reports
          path: reports/stripe_ai_verification.*
```

---

## 📚 Additional Resources

- [Stripe Testing Guide](https://stripe.com/docs/testing)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Anthropic API Documentation](https://docs.anthropic.com/)
- [Firebase Functions Testing](https://firebase.google.com/docs/functions/unit-testing)

---

## 🤝 Contributing

To add new tests:

1. Add test method to [`stripeAiTestSuite.ts`](stripeAiTestSuite.ts)
2. Update report generation in [`runStripeAiTests.ts`](runStripeAiTests.ts)
3. Document new tests in this README
4. Submit PR with test results

---

## 📝 License

Part of the Avalo project. See main project LICENSE for details.

---

**Last Updated:** 2025-11-06  
**Version:** 1.0.0  
**Maintainer:** Avalo Development Team