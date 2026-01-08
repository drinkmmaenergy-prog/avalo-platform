# Avalo Backend Tests

This directory contains automated tests for Avalo's backend functions.

## Test Structure

```
tests/
├── setup.ts                    # Global test configuration
├── utils/
│   └── testData.ts            # Test data utilities
├── unit/                       # Unit tests (fast, isolated)
│   ├── chatMonetization.test.ts
│   ├── callMonetization.test.ts
│   └── eventsEngine.test.ts
├── integration/                # Integration tests (with emulators)
│   └── chatLifecycle.integration.test.ts
└── smoke/                      # Smoke tests (quick validation)
    └── health.smoke.test.ts
```

## Running Tests

### Quick Start

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run specific test suite
npm run test:unit
npm run test:integration
npm run test:smoke

# Watch mode (for development)
npm run test:watch
```

### Test Coverage

```bash
# Generate coverage report
npm test -- --coverage

# View HTML report
open coverage/index.html
```

## Test Types

### Unit Tests
- Test core business logic in isolation
- No external dependencies (mocked)
- Fast execution (<1s per test)
- Located in `tests/unit/`

**Example:**
```typescript
import { calculateMessageBilling } from '../../src/chatMonetization';

it('should charge 1 token for 11 words (standard)', () => {
  const billing = calculateMessageBilling(message, earnerId, roles);
  expect(billing.tokensCost).toBe(1);
});
```

### Integration Tests
- Test complete workflows with Firebase emulators
- Real database operations (test data)
- Slower execution (5-30s per test)
- Located in `tests/integration/`

**Example:**
```typescript
it('should complete full paid chat session', async () => {
  const roles = await determineChatRoles(userA, userB, context);
  await initializeChat(chatId, roles, participants);
  // ... full lifecycle test
});
```

### Smoke Tests
- Quick validation before deployment
- Test critical functionality only
- Very fast execution (<5s total)
- Located in `tests/smoke/`

**Usage in CI/CD:**
```bash
npm run test:smoke || exit 1  # Fail deployment if smoke fails
```

## Test Data Conventions

### All Test Data MUST Include:
```typescript
{
  isTestAccount: true
}
```

### Creating Test Users:
```typescript
import { createTestMale, createTestFemale, createTestInfluencer } from '../utils/testData';

const man = createTestMale({ userId: 'test_m1' });
const woman = createTestFemale({ userId: 'test_w1', earnOnChat: true });
const influencer = createTestInfluencer({ userId: 'test_inf1' });
```

### Test Wallets:
```typescript
import { createTestWallet } from '../utils/testData';

const wallet = createTestWallet(1000); // 1000 tokens balance
```

## Firebase Emulators

Integration tests use Firebase emulators to avoid touching production data.

### Starting Emulators:
```bash
# In project root
firebase emulators:start
```

### Emulator Ports:
- Firestore: `localhost:8080`
- Authentication: `localhost:9099`
- Functions: `localhost:5001`

### Environment Variables:
```bash
export FIRESTORE_EMULATOR_HOST=localhost:8080
export FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
```

These are set automatically in `tests/setup.ts`.

## Writing New Tests

### 1. Create Test File
```typescript
// tests/unit/myFeature.test.ts
describe('My Feature', () => {
  it('should do something', () => {
    expect(result).toBe(expected);
  });
});
```

### 2. Use Test Data Utilities
```typescript
import { createTestUser, generateTestChatId } from '../utils/testData';

const user = createTestUser({ earnOnChat: true });
const chatId = generateTestChatId();
```

### 3. Follow Naming Conventions
- Test files: `*.test.ts`
- Describe blocks: Feature name
- It blocks: "should [expected behavior]"
- Test IDs: Descriptive, lowercase with hyphens

### 4. Clean Up After Tests
```typescript
afterEach(async () => {
  await testEnv.clearFirestore();
});
```

## Best Practices

### ✅ DO:
- Use descriptive test names
- Test one thing per test
- Use test data utilities
- Mark all test data with `isTestAccount: true`
- Clean up after integration tests
- Mock external services (Stripe, AI)

### ❌ DON'T:
- Touch production data
- Use real API keys
- Make tests depend on each other
- Test multiple features in one test
- Commit real user data

## Coverage Goals

- **Unit Tests:** >80% line coverage
- **Integration Tests:** All critical user flows
- **Smoke Tests:** 100% pass rate before deploy

## Troubleshooting

### Tests Failing Locally

1. **Check Firebase Emulators:**
   ```bash
   firebase emulators:start
   ```

2. **Clear Test Data:**
   ```bash
   rm -rf .firebase-cache
   ```

3. **Reinstall Dependencies:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

### TypeScript Errors in Tests

Jest types are loaded at runtime. These errors are expected and don't affect test execution:
```
Cannot find name 'describe'
Cannot find name 'it'
Cannot find name 'expect'
```

To suppress (optional):
```json
// tsconfig.json
{
  "compilerOptions": {
    "types": ["jest", "node"]
  }
}
```

### Slow Integration Tests

Integration tests are slower because they use real Firebase operations. To speed up:

```bash
# Run tests in parallel (unit tests only)
npm run test:unit -- --maxWorkers=4

# Run integration tests sequentially
npm run test:integration -- --runInBand
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - name: Install Dependencies
        run: |
          cd functions
          npm install
      
      - name: Run Smoke Tests
        run: |
          cd functions
          npm run test:smoke
      
      - name: Run Unit Tests
        run: |
          cd functions
          npm run test:unit
      
      - name: Run Integration Tests
        run: |
          cd functions
          npm run test:integration
```

## Test Specifications Verified

This test suite verifies:

### PACK 288 - Chat Monetization
- ✅ Free messages: 6 total (3 per participant)
- ✅ Word counting: 11 standard, 7 Royal
- ✅ Only bill earner messages
- ✅ 35% platform fee, 65% escrow
- ✅ Free pool logic (low/mid popularity)

### PACK 294-299 - Calls & Calendar
- ✅ Voice: 10 tokens/min (standard)
- ✅ Video: 20 tokens/min (standard)
- ✅ VIP discount: 30%
- ✅ Royal discount: 50%
- ✅ 80/20 event commission split
- ✅ 70% attendance threshold

### PACK 267-268 - Safety & Verification
- ✅ 18+ verification required
- ✅ Selfie verification at events
- ✅ Panic button functionality
- ✅ QR code validation

### PACK 277 - Wallet & Transactions
- ✅ Token balances
- ✅ Escrow management
- ✅ Payout rate: 0.20 PLN/token
- ✅ Transaction logging

## Support

For questions or issues:
- Review this README
- Check [`PACK_319_TESTING_IMPLEMENTATION.md`](../../PACK_319_TESTING_IMPLEMENTATION.md)
- See inline code comments in test files
- Refer to original PACK 319 specification

## License

Internal Avalo project - see main LICENSE file.
