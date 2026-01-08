# QA Hooks & Testing Tools Guide

**Version:** 1.0  
**Last Updated:** 2025-12-09  
**Purpose:** Guide for using QA testing hooks and tools in STAGING environment.

---

## 1. Overview

QA Hooks provide shortcuts for testing Avalo features without going through full user flows. These tools are **ONLY available in STAGING environment** and are automatically disabled in PRODUCTION builds for security.

### 1.1 Key Features
- Grant tokens to test accounts
- Mark profiles as verified
- Simulate different popularity levels
- Reset swipe limits
- Unlock chats for free
- Simulate bookings and cancellations
- Toggle feature flags per user

### 1.2 Security
- All functions check environment (staging only)
- All functions require authorized test user
- All changes are logged and flagged
- Completely disabled in production builds

---

## 2. Setup

### 2.1 Test User IDs

Update the test user ID list in [`app-mobile/lib/qa-hooks.ts`](../../app-mobile/lib/qa-hooks.ts:20):

```typescript
const TEST_USER_IDS = [
  'test-user-001',
  'test-user-002',
  'qa-admin-001',
];
```

Add your QA team's user IDs to this array.

### 2.2 Environment Configuration

Ensure your staging environment is properly configured:

**app.config.js or app.json:**
```json
{
  "extra": {
    "environment": "staging"
  }
}
```

**Or via environment variable:**
```bash
export EXPO_PUBLIC_ENV=staging
```

---

## 3. Using QA Hooks

### 3.1 Via UI (Recommended for Manual Testing)

**Step 1:** Launch app in staging environment

**Step 2:** Look for the red "QA" floating button in the bottom right

**Step 3:** Tap the button to open the QA Panel

**Step 4:** Use the various tools:
- **Token Management:** Grant or reset tokens
- **Verification:** Mark profile as verified
- **Popularity:** Set high/low/medium popularity level
- **Swipe Limits:** Reset or enable unlimited swipes

### 3.2 Via Code (Recommended for Automated Tests)

Import QA hooks in your test files:

```typescript
import { QAHooks } from '../lib/qa-hooks';

// Grant 1000 tokens to a user
await QAHooks.grantTokens('user-id-123', 1000);

// Mark user as verified
await QAHooks.markAsVerified('user-id-123');

// Set popularity level
await QAHooks.setPopularityLevel('user-id-123', 'high');

// Reset swipe limits
await QAHooks.resetSwipeLimits('user-id-123');

// Enable unlimited swipes
await QAHooks.setUnlimitedSwipes('user-id-123', true);
```

---

## 4. Available Functions

### 4.1 Token Management

#### `grantTokens(userId: string, amount: number)`
Grants a specific number of tokens to a user.

**Example:**
```typescript
await QAHooks.grantTokens('user-123', 5000);
// User now has 5000 tokens
```

**Use Case:** Testing paid features without real purchases

---

#### `resetTokenBalance(userId: string)`
Resets user's token balance to 0.

**Example:**
```typescript
await QAHooks.resetTokenBalance('user-123');
// User now has 0 tokens
```

**Use Case:** Testing "insufficient tokens" scenarios

---

### 4.2 Profile Management

#### `markAsVerified(userId: string)`
Marks a user profile as verified, bypassing age/selfie verification.

**Example:**
```typescript
await QAHooks.markAsVerified('user-123');
// User profile now shows verified badge
```

**Use Case:** Testing features requiring verified profiles

---

#### `setPopularityLevel(userId: string, level: 'high' | 'low' | 'medium')`
Sets user's popularity level to test different message limits.

**Popularity Levels:**
- **High:** 6 free messages per side (12 total)
- **Low:** 10 free messages per side (20 total)
- **Medium:** 8 free messages per side (16 total, if implemented)

**Example:**
```typescript
await QAHooks.setPopularityLevel('user-123', 'high');
// User now has high popularity limits
```

**Use Case:** Testing different free message allocations

---

### 4.3 Swipe Limits

#### `resetSwipeLimits(userId: string)`
Resets daily and hourly swipe counters to 0.

**Example:**
```typescript
await QAHooks.resetSwipeLimits('user-123');
// User can swipe again immediately
```

**Use Case:** Testing swipe functionality beyond limits

---

#### `setUnlimitedSwipes(userId: string, enabled: boolean)`
Enables or disables unlimited swipes for a user.

**Example:**
```typescript
await QAHooks.setUnlimitedSwipes('user-123', true);
// User can now swipe without limits
```

**Use Case:** Testing discovery without interruptions

---

### 4.4 Feature Flags

#### `toggleFeatureForUser(userId: string, feature: string, enabled: boolean)`
Toggles a specific feature flag for a user.

**Example:**
```typescript
await QAHooks.toggleFeatureForUser('user-123', 'passportMode', true);
// User can now access passport mode
```

**Use Case:** Testing features before general release

---

### 4.5 Bookings & Meetings

#### `simulateBooking(creatorId: string, userId: string, tokens: number)`
Creates a simulated booking for testing.

**Example:**
```typescript
await QAHooks.simulateBooking('creator-456', 'user-123', 500);
// Booking created for 500 tokens
```

**Use Case:** Testing booking flows and calendar display

---

#### `cancelBooking(bookingId: string, refundPercentage: number)`
Cancels a booking with specified refund percentage.

**Example:**
```typescript
await QAHooks.cancelBooking('booking-789', 100);
// Booking cancelled with 100% refund
```

**Use Case:** Testing cancellation and refund logic

---

### 4.6 Chat Management

#### `unlockChatForFree(chatId: string)`
Unlocks a chat without requiring token payment.

**Example:**
```typescript
await QAHooks.unlockChatForFree('chat-abc');
// Chat unlocked for free
```

**Use Case:** Testing paid chat features without spending tokens

---

### 4.7 Data Management

#### `clearUserData(userId: string)`
Clears all user data for testing fresh flows.

**⚠️ WARNING:** This is a destructive operation. Use with caution.

**Example:**
```typescript
await QAHooks.clearUserData('user-123');
// All user data deleted (not fully implemented yet)
```

**Use Case:** Resetting test accounts to initial state

---

## 5. Test Scenarios

### 5.1 Scenario: Test Free-to-Paid Chat Flow

```typescript
// Setup
const userA = 'test-user-001';
const userB = 'test-user-002';

// Both users start with no tokens
await QAHooks.resetTokenBalance(userA);
await QAHooks.resetTokenBalance(userB);

// Set userB as high popularity
await QAHooks.setPopularityLevel(userB, 'high');

// Create match and start chat
// ... (normal app flow)

// Send 6 free messages from userA to userB
// Message 7 should trigger paywall

// Grant tokens to userA
await QAHooks.grantTokens(userA, 1000);

// Unlock chat (should deduct 100 tokens)
// Verify balance is now 900

// Continue testing paid messaging
```

### 5.2 Scenario: Test Swipe Limits

```typescript
const user = 'test-user-001';

// Enable unlimited swipes for testing
await QAHooks.setUnlimitedSwipes(user, true);

// Swipe through many profiles
// Verify no limit messages appear

// Disable unlimited swipes
await QAHooks.setUnlimitedSwipes(user, false);

// Reset limits
await QAHooks.resetSwipeLimits(user);

// Swipe 50 times (daily limit)
// Verify limit message appears
```

### 5.3 Scenario: Test Booking Cancellation Policies

```typescript
const creator = 'test-creator-001';
const user = 'test-user-001';

// Grant tokens
await QAHooks.grantTokens(user, 5000);

// Simulate booking (500 tokens)
await QAHooks.simulateBooking(creator, user, 500);

// Test cancellation: >72h (100% refund)
await QAHooks.cancelBooking('booking-id', 100);
// Verify: 500 tokens refunded

// Test cancellation: 48-72h (50% refund)
await QAHooks.cancelBooking('booking-id-2', 50);
// Verify: 250 tokens refunded

// Test cancellation: <24h (0% refund)
await QAHooks.cancelBooking('booking-id-3', 0);
// Verify: 0 tokens refunded
```

---

## 6. Best Practices

### 6.1 Always Clean Up After Tests
```typescript
// After each test
await QAHooks.resetTokenBalance(userId);
await QAHooks.resetSwipeLimits(userId);
```

### 6.2 Use Descriptive Test User IDs
```typescript
// Good
'test-user-highpop-verified'
'test-creator-calendar-enabled'

// Bad
'test123'
'user1'
```

### 6.3 Log Your Actions
```typescript
console.log('[TEST] Granting 1000 tokens to user-123');
await QAHooks.grantTokens('user-123', 1000);
console.log('[TEST] Tokens granted successfully');
```

### 6.4 Test Both Success and Failure Cases
```typescript
// Test success
await QAHooks.grantTokens('user-123', 1000);

// Test failure (insufficient tokens)
await QAHooks.resetTokenBalance('user-123');
// Try to purchase something expensive
// Verify error handling
```

---

## 7. Automated Testing Integration

### 7.1 Jest/Vitest Setup

```typescript
import { QAHooks } from '../lib/qa-hooks';

describe('Chat Monetization', () => {
  const testUserId = 'test-user-automated';
  
  beforeEach(async () => {
    // Setup
    await QAHooks.resetTokenBalance(testUserId);
    await QAHooks.grantTokens(testUserId, 1000);
  });
  
  afterEach(async () => {
    // Cleanup
    await QAHooks.resetTokenBalance(testUserId);
  });
  
  it('should unlock chat for 100 tokens', async () => {
    // Test implementation
  });
});
```

### 7.2 Detox E2E Testing

```typescript
describe('Paid Chat Flow', () => {
  beforeAll(async () => {
    // Login as test user
    await device.launchApp({ newInstance: true });
    await loginAsTestUser('test-user-001');
    
    // Grant tokens via QA hook
    // (Call Firebase function or use admin SDK)
  });
  
  it('should show paywall after free messages', async () => {
    // Navigate to chat
    // Send free messages
    // Verify paywall appears
  });
});
```

---

## 8. Troubleshooting

### 8.1 QA Panel Not Appearing

**Problem:** Floating QA button doesn't show up

**Solutions:**
- Check environment: Must be `staging` or `development`
- Check user ID: Must be in `TEST_USER_IDS` array
- Check build: Rebuild app after code changes
- Check console: Look for QA hook logs

### 8.2 Functions Not Working

**Problem:** QA functions return errors or don't execute

**Solutions:**
```typescript
// Check if QA hooks are available
import { isQAHooksAvailable } from '../lib/qa-hooks';

if (!isQAHooksAvailable()) {
  console.error('QA hooks not available');
}

// Check authorization
// Ensure logged-in user is in TEST_USER_IDS
```

### 8.3 Production Builds Still Show QA Tools

**Problem:** QA tools visible in production build

**Solutions:**
- Verify environment variable: `EXPO_PUBLIC_ENV=production`
- Clear build cache: `expo start -c`
- Check app.config.js: Ensure `extra.environment` is correct
- Rebuild with correct environment

---

## 9. FAQ

### Q: Can I use QA hooks in production?
**A:** No. QA hooks are automatically disabled in production for security. They will return early and log warnings if called in production.

### Q: How do I add my user to the test user list?
**A:** Edit [`app-mobile/lib/qa-hooks.ts`](../../app-mobile/lib/qa-hooks.ts:20) and add your Firebase Auth user ID to the `TEST_USER_IDS` array.

### Q: Will QA changes affect production data?
**A:** No. QA hooks only work in staging environment, which uses a separate Firebase project (`avalo-staging`). Production data is never affected.

### Q: Can I automate QA hook usage?
**A:** Yes. QA hooks can be called from automated tests, scripts, or CI/CD pipelines as long as the environment is set to staging.

### Q: What happens if I try to use QA hooks in production?
**A:** The functions will detect the production environment and return immediately without doing anything. A warning will be logged to console.

---

## 10. Security Considerations

### 10.1 Never Commit Production User IDs
```typescript
// ❌ BAD - Don't do this
const TEST_USER_IDS = [
  'real-user-with-production-data',
];

// ✅ GOOD - Use dedicated test accounts
const TEST_USER_IDS = [
  'test-account-qa-001',
  'test-account-qa-002',
];
```

### 10.2 All Changes Are Logged
Every QA hook action adds a flag to the affected documents:
```typescript
{
  qaGranted: true,
  qaOverride: true,
  qaCancelled: true,
  // etc.
}
```

This makes it easy to identify test data.

### 10.3 Environment Checks Are Enforced
```typescript
if (!IS_STAGING) {
  console.warn('[QA] Function not available in production');
  return;
}
```

All functions check the environment before executing.

---

## 11. Maintenance

### 11.1 Update Test User IDs Regularly
- Remove inactive test accounts
- Add new QA team members
- Use descriptive naming conventions

### 11.2 Review QA Hooks After Major Changes
- Update hooks when feature logic changes
- Add new hooks for new features
- Deprecate unused hooks

### 11.3 Keep Documentation Updated
- Document new QA functions
- Update examples with latest patterns
- Add troubleshooting tips as issues arise

---

## End of QA Hooks Guide

For questions or issues with QA hooks, contact the QA team lead or refer to the implementation in [`app-mobile/lib/qa-hooks.ts`](../../app-mobile/lib/qa-hooks.ts:1).