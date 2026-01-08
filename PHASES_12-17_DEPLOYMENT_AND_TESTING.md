# Avalo - Phases 12-17: Deployment and Testing Guide

**Date**: January 2025
**Phases**: 12-17 (Core Engines)
**Region**: europe-west3

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Firebase Emulator Setup](#firebase-emulator-setup)
3. [Deployment Instructions](#deployment-instructions)
4. [Testing Guide](#testing-guide)
5. [Synthetic Data Generation](#synthetic-data-generation)
6. [Performance Benchmarking](#performance-benchmarking)
7. [Monitoring](#monitoring)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software
```bash
# Node.js 18+
node --version  # Should be v18.0.0 or higher

# npm
npm --version  # Should be 9.0.0 or higher

# Firebase CLI
npm install -g firebase-tools
firebase --version  # Should be 12.0.0 or higher

# Java (for Firestore Emulator)
java -version  # Should be Java 11 or higher
```

### Project Setup
```bash
# Clone repository
cd /path/to/avaloapp

# Install root dependencies
npm install

# Install functions dependencies
cd functions
npm install
cd ..
```

### Dependencies Added

**functions/package.json**:
```json
{
  "devDependencies": {
    "@types/jest": "^29.5.14",
    "jest": "^29.7.0",
    "ts-jest": "^29.4.5"
  },
  "dependencies": {
    "zod": "^3.22.4"
  }
}
```

---

## Firebase Emulator Setup

### 1. Install Emulators

```bash
# Install all required emulators
firebase setup:emulators:firestore
firebase setup:emulators:auth
firebase setup:emulators:functions
```

### 2. Configure Emulators

Ensure `firebase.json` has emulator configuration:

```json
{
  "emulators": {
    "auth": {
      "port": 9099
    },
    "functions": {
      "port": 5001
    },
    "firestore": {
      "port": 8080
    },
    "ui": {
      "enabled": true,
      "port": 4000
    }
  }
}
```

### 3. Start Emulators

```bash
# Start all emulators
npm run emulators

# Or manually
firebase emulators:start --only auth,firestore,functions
```

**Expected Output**:
```
┌─────────────────────────────────────────────────────────────┐
│ ✔  All emulators ready! It is now safe to connect.         │
├─────────────────────────────────────────────────────────────┤
│ Emulator  │ Host:Port         │ View in Emulator UI        │
├───────────┼───────────────────┼────────────────────────────┤
│ Auth      │ localhost:9099    │ http://localhost:4000/auth │
│ Functions │ localhost:5001    │ http://localhost:4000/func │
│ Firestore │ localhost:8080    │ http://localhost:4000/fire │
└─────────────────────────────────────────────────────────────┘
```

### 4. Emulator UI

Access the Emulator UI at: **http://localhost:4000**

Features:
- View Firestore data
- Inspect functions logs
- Monitor Auth users
- Trigger functions manually

---

## Deployment Instructions

### Step 1: Build Functions

```bash
cd functions
npm run build
```

**Verify**: Check `lib/` directory exists with compiled JavaScript

### Step 2: Deploy Individual Engines

**Phase 12 - Event Engine**:
```bash
firebase deploy --only functions:enqueueEventCallable,functions:processEventScheduler,functions:retryFailedEventsScheduler,functions:cleanupExpiredEventsScheduler --region europe-west3
```

**Phase 13 - Risk Engine**:
```bash
firebase deploy --only functions:updateRiskProfileTrigger,functions:updateRiskProfileOnReportTrigger,functions:calculateTrustScoreCallable,functions:banUserCallable --region europe-west3
```

**Phase 14 - Economy Engine**:
```bash
firebase deploy --only functions:logTransactionTrigger,functions:recalculateEconomyScheduler,functions:analyzeFlowCallable --region europe-west3
```

**Phase 15 - Content Engine**:
```bash
firebase deploy --only functions:scanNewPostTrigger,functions:scanNewPhotoTrigger,functions:reviewContentFlagCallable --region europe-west3
```

**Phase 16 - Insight Engine**:
```bash
firebase deploy --only functions:updateUserInsightOnMessageTrigger,functions:updateUserInsightOnVisitTrigger,functions:updateUserInsightOnSwipeTrigger,functions:recommendProfilesCallable,functions:recommendAICompanionsCallable --region europe-west3
```

**Phase 17 - Compliance Engine**:
```bash
firebase deploy --only functions:generateAuditReportCallable,functions:detectAMLPatternsScheduler --region europe-west3
```

**Tools**:
```bash
firebase deploy --only functions:generateTestDataCallable --region europe-west3
```

### Step 3: Deploy All at Once

```bash
firebase deploy --only functions --region europe-west3
```

**Estimated time**: 10-15 minutes for all functions

### Step 4: Verify Deployment

```bash
# List deployed functions
firebase functions:list

# Check function logs
firebase functions:log --only enqueueEventCallable --limit 10
```

---

## Testing Guide

### Jest Configuration

**Location**: `functions/jest.config.js`

**Key settings**:
- Test environment: Node.js
- Timeout: 60 seconds
- Test pattern: `tests/**/*.test.ts`
- Coverage: Source files in `src/engines/` and `src/tools/`

### Running Tests

**All tests**:
```bash
cd functions
npm test
```

**Specific engine**:
```bash
npm test -- eventEngine.test.ts
```

**With coverage**:
```bash
npm test -- --coverage
```

**Watch mode**:
```bash
npm test -- --watch
```

### Test Structure

```
functions/
├── tests/
│   ├── setup.ts                    # Test setup
│   ├── engines/
│   │   ├── eventEngine.test.ts     # Event Engine tests
│   │   ├── riskEngine.test.ts      # Risk Engine tests
│   │   ├── economyEngine.test.ts   # Economy Engine tests
│   │   ├── contentEngine.test.ts   # Content Engine tests
│   │   ├── insightEngine.test.ts   # Insight Engine tests
│   │   └── complianceEngine.test.ts # Compliance Engine tests
│   └── integration/
│       ├── avaloIntegration.test.ts # End-to-end stories
│       └── performanceBench.test.ts # Performance benchmarks
```

### Integration Test Stories

**Story 1 - Token Economy Flow**:
```typescript
// 1. Credit tokens
await creditTokensCallable(uid, 1000);

// 2. Start chat
await startChatCallable();

// 3. Send message
await sendMessageCallable();

// 4. Verify transaction logged
// 5. Verify no AML flag

✅ Asserts:
- Token balance updated
- Ledger entry created
- Economy snapshot updated
- AML clean
```

**Story 2 - High-Value Calendar Booking**:
```typescript
// 1. Royal female lists calendar @ 3000 tokens
await createCalendarSlot({ price: 3000 });

// 2. User books slot
await bookSlotCallable();

// 3. Compliance flags >1000 token event
// 4. Risk engine increases trust score

✅ Asserts:
- AML flag created (high_volume)
- Transaction completed (NOT blocked)
- Escrow held (80% = 2400 tokens)
- Platform fee collected (20% = 600 tokens)
```

**Story 3 - Fraud Suspicion & Ban**:
```typescript
// 1. Simulate 5 fake transactions
for (let i = 0; i < 5; i++) {
  await simulateFraudTransaction();
}

// 2. Risk engine calculates trust score
const trustScore = await calculateTrustScore();

// 3. Trust score < 30 → ban triggered
await banUserCallable();

✅ Asserts:
- userRiskProfiles/{uid}.bannedUntil !== null
- Firebase Auth disabled
- User document marked banned
```

**Story 4 - Content Flagging & Recommendation**:
```typescript
// 1. Post with NSFW content
await createPost({ caption: "nude photo" });

// 2. Content engine scans and flags
// 3. Insight engine still recommends user

✅ Asserts:
- Content flagged with confidence >0.7
- Post still visible (flag-only)
- User still in recommendations
```

**Story 5 - AI Companion Personalization**:
```typescript
// 1. Start AI chat
await startAIChatCallable({ aiId: "companion_1" });

// 2. Send AI message
await sendAIMessageCallable({ message: "Hello" });

// 3. Insight engine updates preferences

✅ Asserts:
- userInsights/{uid}.aiPreferences.favoriteAIIds includes "companion_1"
- Recommendations updated
```

### Running Integration Tests

**With emulator**:
```bash
# Terminal 1: Start emulators
firebase emulators:start

# Terminal 2: Run tests
cd functions
npm test -- integration
```

---

## Synthetic Data Generation

### Purpose
Seed Firestore with realistic test data for:
- Development testing
- Integration testing
- Performance benchmarking
- Demo environments

### Usage

**Via Firebase Shell**:
```bash
firebase functions:shell

# In shell
> generateTestDataCallable()
```

**Via HTTP (after deployment)**:
```bash
curl -X POST \
  https://europe-west3-avalo.cloudfunctions.net/generateTestDataCallable \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Generated Data

**20 Users** (10 female / 10 male):
- IDs: `test_female_1` to `test_female_10`, `test_male_1` to `test_male_10`
- Ages: 20-40
- Locations: Warsaw, Poland (with random offsets)
- Wallets: 400-1500 tokens
- Verification: First 5 of each gender verified

**30 Chats**:
- IDs: `test_chat_1` to `test_chat_30`
- 20 with deposits (100 tokens: 35 fee + 65 escrow)
- 10 free (3 messages remaining)
- 1-10 messages per chat

**15 Transactions**:
- IDs: `test_tx_1` to `test_tx_15`
- Types: purchase, chat_payment, chat_earned, tip_sent, tip_received, calendar_booking, live_tip, refund
- Amounts: 50-750 tokens

**5 AI Subscriptions**:
- Tiers: free, plus, intimate, creator, plus
- Users: `test_female_1` to `test_female_5`

**5 Calendar Bookings**:
- IDs: `test_booking_1` to `test_booking_5`
- Booking 5: Royal female @ 3000 tokens
- Others: 100-250 tokens

**3 AML Flags**:
- IDs: `test_aml_flag_1` to `test_aml_flag_3`
- Types: structuring, circular_transfer, high_volume
- Severities: medium, high, low

### Verification

After generation, verify in Firestore:
```bash
# Via Firebase Console
https://console.firebase.google.com/project/YOUR_PROJECT/firestore

# Or via Emulator UI
http://localhost:4000/firestore
```

Expected collections:
- `users`: 20 documents
- `chats`: 30 documents
- `transactions`: 15 documents
- `calendarBookings`: 5 documents
- `amlFlags`: 3 documents

---

## Performance Benchmarking

### Running Benchmarks

**Via Firebase Shell**:
```bash
firebase functions:shell

# In shell
> const bench = require('./lib/tools/benchmark');
> bench.runBenchmarkSuite()
```

**Benchmark Suite Tests**:
1. **Firestore read single**: Read 1 document
2. **Firestore query 10**: Query 10 documents
3. **Firestore write single**: Write 1 document
4. **Firestore transaction**: Read + write in transaction
5. **Firestore batch write 5**: Batch write 5 documents

### Viewing Results

**Real-time**:
```bash
# Watch function logs
firebase functions:log --only benchmark

# Or in Emulator UI
http://localhost:4000/logs
```

**Firestore**:
```javascript
// Collection: engineLogs/benchmarks/{date}/report
{
  results: [
    {
      fnName: "firestore_read_single",
      ms: 12.34,
      reads: 1,
      writes: 0,
      diag: { memoryDeltaBytes: 1024 }
    },
    // ... more results
  ],
  lastUpdated: Timestamp
}

// Collection: engineLogs/benchmarks/{date}/summary
{
  totalTests: 5,
  averageMs: 45.67,
  totalReads: 12,
  totalWrites: 6,
  timestamp: Timestamp
}
```

### Performance Targets

| Metric | Target | Critical |
|--------|--------|----------|
| Execution time | <500ms | <1000ms |
| Firestore reads | <50 | <100 |
| Firestore writes | <20 | <50 |
| Memory delta | <5MB | <10MB |

### Custom Benchmarks

```typescript
import { bench } from './tools/benchmark';

// Benchmark custom function
const result = await bench('my_function', async () => {
  // Your code here
  return result;
});

console.log(`Execution time: ${result.ms}ms`);
```

---

## Monitoring

### Engine Logs

All engines log to:
```
engineLogs/{engine}/{date}/entries
```

**Engines**:
- `eventEngine`
- `riskEngine`
- `economyEngine`
- `contentEngine`
- `insightEngine`
- `complianceEngine`
- `tools`
- `benchmarks`

**Query logs**:
```javascript
// Get today's logs for Event Engine
const today = '2025-01-20';
const logs = await db
  .collection('engineLogs')
  .doc('eventEngine')
  .collection(today)
  .orderBy('timestamp', 'desc')
  .limit(100)
  .get();

logs.forEach(doc => {
  const log = doc.data();
  console.log(`[${log.action}]`, log.metadata);
});
```

### Key Metrics to Monitor

**Event Engine**:
- Events queued per hour
- Events processed per hour
- Retry rate (failed events / total events)
- Average processing time

**Risk Engine**:
- Users by risk level distribution
- Average trust score
- Bans per day
- Risk profile updates per hour

**Economy Engine**:
- Total inflow/outflow
- Platform fees by category
- ARPU trend
- Escrow held

**Content Engine**:
- Posts scanned per day
- Flags by category
- Confidence score distribution
- Moderator review rate

**Insight Engine**:
- Recommendations generated per day
- Average recommendation score
- Profile views from recommendations

**Compliance Engine**:
- Audit logs per day
- AML flags by type
- AML flags by severity
- False positive rate

### Cloud Monitoring

**Firebase Console**:
```
https://console.firebase.google.com/project/YOUR_PROJECT/functions
```

**Key dashboards**:
- Function invocations
- Execution time
- Error rate
- Memory usage
- Active instances

**Alerts** (recommended):
1. Error rate >5% for 5 minutes
2. Execution time >1s p95 for 10 minutes
3. AML flags >10 per hour
4. Risk engine trust score average <40

---

## Troubleshooting

### Common Issues

#### Issue 1: Emulator won't start

**Error**: "Port 8080 already in use"

**Solution**:
```bash
# Kill process on port
lsof -ti:8080 | xargs kill -9

# Or use different port
firebase emulators:start --only firestore --port 8081
```

#### Issue 2: Tests timeout

**Error**: "Timeout - Async callback was not invoked within the 60000 ms timeout"

**Solution**:
```bash
# Increase timeout in jest.config.js
{
  testTimeout: 120000  // 2 minutes
}

# Or per test
test('slow test', async () => {
  // test code
}, 120000);
```

#### Issue 3: Functions not deploying

**Error**: "Failed to create function"

**Solution**:
```bash
# Check TypeScript compilation
cd functions
npm run build

# Check for errors in lib/
ls -la lib/

# Re-deploy with force
firebase deploy --only functions --force
```

#### Issue 4: Synthetic data generation fails

**Error**: "Permission denied"

**Solution**:
```bash
# Ensure user is admin
// In Firestore
users/{your_uid}/roles/admin = true

# Or via Firebase Console
// Add custom claim: { admin: true }
```

#### Issue 5: Benchmarks show high I/O

**Problem**: >100 reads/writes per function

**Solution**:
```typescript
// Add batching
const batch = db.batch();
items.forEach(item => {
  batch.set(ref, item);
});
await batch.commit();

// Add caching
const cache = new Map();
if (cache.has(key)) return cache.get(key);

// Limit queries
.limit(100)  // Don't fetch all docs
```

### Debug Mode

**Enable debug logs**:
```bash
# Set environment variable
export DEBUG=*

# Or in firebase.json
{
  "functions": {
    "predeploy": [
      "npm --prefix \"$RESOURCE_DIR\" run build"
    ],
    "source": "functions"
  },
  "emulators": {
    "functions": {
      "port": 5001,
      "host": "0.0.0.0"
    }
  }
}
```

**Function logs**:
```bash
# Real-time logs
firebase functions:log --follow

# Specific function
firebase functions:log --only enqueueEventCallable

# Time range
firebase functions:log --since 1h
```

### Reset Emulator Data

```bash
# Stop emulators
Ctrl+C

# Clear data
rm -rf ~/.config/firebase/emulators

# Restart
firebase emulators:start
```

---

## Best Practices

### Development Workflow

1. **Start emulators**
   ```bash
   npm run emulators
   ```

2. **Generate test data**
   ```bash
   firebase functions:shell
   > generateTestDataCallable()
   ```

3. **Run tests**
   ```bash
   npm test
   ```

4. **Make changes** to engine files

5. **Re-run tests** to verify

6. **Commit** when tests pass

7. **Deploy** to production
   ```bash
   firebase deploy --only functions
   ```

### Testing Workflow

**Unit tests** (fast, isolated):
```bash
npm test -- eventEngine.test.ts
```

**Integration tests** (slower, end-to-end):
```bash
npm test -- integration/
```

**Performance tests** (benchmarks):
```bash
npm test -- performanceBench.test.ts
```

### Deployment Workflow

**Development** (emulator):
```bash
firebase emulators:start
```

**Staging** (test project):
```bash
firebase use staging
firebase deploy --only functions
```

**Production** (live project):
```bash
firebase use production
firebase deploy --only functions
```

---

## Commands Reference

### Firebase CLI

```bash
# List projects
firebase projects:list

# Switch project
firebase use PROJECT_ID

# List functions
firebase functions:list

# Delete function
firebase functions:delete FUNCTION_NAME

# View logs
firebase functions:log

# Shell (interactive)
firebase functions:shell
```

### npm Scripts

```bash
# Build
npm run build

# Test
npm run test
npm run test:watch
npm run test:coverage

# Emulators
npm run emulators

# Lint
npm run lint
```

---

## Support

For questions or issues:
- Email: support@avalo.app
- Documentation: This file
- GitHub Issues: (if applicable)

---

**Generated**: January 2025
**Version**: 1.0
**Platform**: Avalo Social Dating
**Region**: europe-west3
