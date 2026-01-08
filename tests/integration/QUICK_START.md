# 🚀 Quick Start Guide - Avalo Firebase Integration Tests

**Time to first test:** < 2 minutes  
**Prerequisites:** Node.js 20+, npm

---

## ⚡ Fastest Way to Run Tests

### Windows

```bash
cd tests\integration
run-tests.bat
```

### Linux/macOS

```bash
cd tests/integration
chmod +x run-tests.sh
./run-tests.sh
```

### Using npm (All Platforms)

```bash
cd tests/integration
npm install
npm test
```

---

## 📋 What Gets Tested

✅ **Environment** - All API keys and configuration  
✅ **Build** - TypeScript compilation  
✅ **Emulators** - Auth, Firestore, Functions, Storage  
✅ **Endpoints** - All 6 HTTP functions  
✅ **Integrations** - Stripe, OpenAI, Anthropic  
✅ **Security** - Key validation and exposure checks  
✅ **Performance** - Response times and latency  

**Total:** 32 automated tests in ~45 seconds

---

## 📊 Expected Output

```
╔════════════════════════════════════════════════════════════════════════╗
║                                                                        ║
║          🔥 AVALO FIREBASE FULL INTEGRATION TEST SUITE 🔥             ║
║                                                                        ║
╚════════════════════════════════════════════════════════════════════════╝

🔍 1. ENVIRONMENT VALIDATION
   ─────────────────────────

   ✅ Environment: Load .env file (2ms)
      Loaded 13 environment variables
   ✅ Environment: Required variables (1ms)
   ...

📊 TEST SUMMARY
   ────────────

   Total Tests:    32
   ✅ Passed:      28
   🔥 Failed:      0
   ⚠️  Warnings:    4
   📈 Pass Rate:   87.50%

   📄 Report saved to: /reports/avalo_full_test_report.md
```

---

## 📄 Generated Reports

After running tests, find reports here:

```
reports/
├── avalo_full_test_report.md    # Human-readable
└── avalo_full_test_report.json  # Machine-readable
```

---

## 🔧 Common Options

### Run with Emulator Auto-Start

```bash
./run-tests.sh --with-emulators
```

### Run with Fresh Build

```bash
./run-tests.sh --build-first
```

### Both Together

```bash
./run-tests.sh --build-first --with-emulators
```

---

## ⚠️ Troubleshooting

### "Emulators not running" warnings

**Solution:**
```bash
# In separate terminal:
firebase emulators:start

# Then run tests:
npm test
```

### "Build failed" errors

**Solution:**
```bash
cd ../../functions
npm install
npm run build
```

### "Cannot find module" errors

**Solution:**
```bash
cd tests/integration
npm install
```

---

## 🎯 Next Steps

1. ✅ Run the tests
2. 📊 Review the report in `/reports/`
3. 🔧 Fix any failures
4. ♻️ Re-run to verify fixes
5. 🚀 Integrate into CI/CD pipeline

---

## 📞 Need Help?

- **Full Documentation:** [`README.md`](./README.md)
- **Main Guide:** [`AVALO_FIREBASE_INTEGRATION_TEST_SUITE.md`](../../AVALO_FIREBASE_INTEGRATION_TEST_SUITE.md)
- **Sample Report:** [`reports/SAMPLE_TEST_REPORT.md`](../../reports/SAMPLE_TEST_REPORT.md)

---

**Ready?** Run the tests now! 🔥