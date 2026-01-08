# 🧩 Avalo System Functions Test Suite

Comprehensive validation of Avalo's scheduled functions, Firestore triggers, callable functions, and notification systems.

## 📋 Overview

This test suite validates:

- **Scheduled Functions (CRON jobs):**
  - `syncExchangeRatesScheduler` - Exchange rate synchronization every 5 minutes
  - `generateComplianceReportsScheduler` - Daily compliance reports at 2 AM
  - `rebuildRankingsScheduler` - Daily rankings rebuild at 2 AM
  - `expireStaleChats` - Hourly chat expiry sweep
  - `calendarSweep` - Calendar booking sweep every 30 minutes
  - `updateRoyalEligibility` - Daily Royal Club eligibility at 3 AM

- **Firestore Triggers:**
  - `awardPointsOnTx` - Loyalty points on transaction creation

- **Callable Functions:**
  - `updatePresenceV1` - User presence tracking
  - And 8+ other callable functions

- **Notification Systems:**
  - SendGrid configuration validation
  - Email notification implementation status

## 🚀 Quick Start

### Prerequisites

1. Firebase Admin SDK credentials (`avalo-main-firebase-adminsdk.json` in project root)
2. Environment variables configured in `functions/.env`
3. Node.js 18+ installed

### Installation

```bash
cd tests/system-functions
npm install
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests with watch mode
npm run test:watch

# Generate report only
npm run report
```

## 📊 Test Reports

After running tests, reports are generated in two formats:

1. **JSON Report:** `reports/system_functions_test.json`
2. **Markdown Report:** `reports/system_functions_test.md`

### Report Contents

- Executive summary with pass/fail statistics
- Scheduled functions status and uptime
- Firestore triggers validation
- Callable functions health checks
- Notification system configuration
- Detailed test results with logs
- Recommendations for issues
- Missing triggers and permissions audit

## 🧪 Test Coverage

### Scheduled Functions (6 tests)

| Function | Schedule | Status |
|----------|----------|--------|
| syncExchangeRatesScheduler | Every 5 min | ✅ |
| generateComplianceReportsScheduler | Daily 2 AM | ✅ |
| rebuildRankingsScheduler | Daily 2 AM | ✅ |
| expireStaleChats | Every hour | ✅ |
| calendarSweep | Every 30 min | ✅ |
| updateRoyalEligibility | Daily 3 AM | ✅ |

### Firestore Triggers (2 tests)

| Trigger | Collection | Status |
|---------|------------|--------|
| awardPointsOnTx | transactions | ✅ |

### Callable Functions (2 tests)

| Function | Purpose | Status |
|----------|---------|--------|
| updatePresenceV1 | Presence tracking | ✅ |

### Notification Systems (2 tests)

| Component | Status |
|-----------|--------|
| SendGrid Config | ⚠️ Not Configured |
| Email Implementation | ⏭️ TODO |

## 🔍 What This Suite Tests

### 1. Exchange Rate Synchronization
- Validates exchange rates are fetched regularly
- Checks rate freshness (< 5 minutes old)
- Verifies rate structure and TTL

### 2. Compliance Reporting
- Confirms daily reports are generated
- Validates AML review queue processing
- Checks for overdue items

### 3. Rankings System
- Verifies daily/weekly/monthly rankings exist
- Validates leaderboard structure
- Checks ranking freshness

### 4. Loyalty Points Trigger
- Tests trigger activation on transaction creation
- Validates points calculation accuracy
- Verifies loyalty document updates

### 5. Presence Tracking
- Tests presence status updates
- Validates stale presence detection
- Checks presence data structure

### 6. Notification Configuration
- Validates SendGrid API key
- Checks email notification implementation
- Identifies missing integrations

## 📈 Understanding Test Results

### Status Indicators

- ✅ **PASS** - Test passed successfully
- ❌ **FAIL** - Test failed, action required
- ⚠️ **WARN** - Test passed with warnings
- ⏭️ **SKIP** - Test skipped (feature not implemented)

### Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed

## 🛠️ Troubleshooting

### Common Issues

**Issue:** Firebase Admin SDK initialization fails
```
Solution: Ensure avalo-main-firebase-adminsdk.json exists in project root
```

**Issue:** Exchange rates are stale
```
Solution: Check if syncExchangeRatesScheduler is deployed and running
Firebase Console → Functions → Check scheduler status
```

**Issue:** Loyalty points not awarded
```
Solution: Verify awardPointsOnTx trigger is deployed
Check Firestore rules allow trigger access
```

**Issue:** SendGrid warnings
```
Solution: Configure SENDGRID_API_KEY in functions/.env
Implement email notification functions (currently TODO)
```

## 📝 Adding New Tests

To add a new test:

1. Open `systemFunctionsTest.ts`
2. Add a new test method:

```typescript
async testYourFunction(): Promise<void> {
  await this.runTest(
    "yourFunction",
    "Test description",
    async () => {
      // Your test logic here
      // Throw error if test fails
    }
  );
}
```

3. Call it in `runAllTests()`:

```typescript
await this.testYourFunction();
```

## 🔐 Security Notes

- Test suite requires Firebase Admin credentials
- Uses production Firebase project (be careful!)
- Creates temporary test data (auto-cleaned)
- Does NOT send real emails or notifications

## 📚 Related Documentation

- [Firebase Scheduled Functions](https://firebase.google.com/docs/functions/schedule-functions)
- [Firestore Triggers](https://firebase.google.com/docs/functions/firestore-events)
- [SendGrid Integration](https://sendgrid.com/docs/)

## 🤝 Contributing

When adding new scheduled functions or triggers:

1. Update the test suite to include validation
2. Document the function's schedule/trigger
3. Add to the function lists in this README
4. Run tests to ensure everything works

## 📞 Support

For questions or issues:
- Check test logs for detailed error messages
- Review generated markdown report
- Contact DevOps team for production issues

---

**Version:** 1.0.0  
**Last Updated:** 2025-01-20  
**Maintainer:** Avalo DevOps Team