# Avalo QA & Automation Guide

Comprehensive quality assurance and automation testing guide for Avalo.

## Table of Contents
- [Overview](#overview)
- [Automated Testing Strategy](#automated-testing-strategy)
- [CI/CD Integration](#cicd-integration)
- [Security Checks](#security-checks)
- [Performance Testing](#performance-testing)
- [Manual QA Checklist](#manual-qa-checklist)
- [Test Data & Environments](#test-data--environments)
- [Monitoring & Analytics](#monitoring--analytics)

## Overview

Avalo implements a comprehensive testing and QA strategy across multiple layers:

- **Unit Tests** - Individual function/component testing
- **Integration Tests** - API and service integration testing
- **E2E Tests** - End-to-end user flow testing
- **Security Tests** - Vulnerability scanning and compliance checks
- **Performance Tests** - Load testing and optimization
- **Manual QA** - Critical user flows and UI/UX validation

## Automated Testing Strategy

### Unit Testing

#### Firebase Functions Unit Tests

Location: [`functions/src/`](../functions/src/)

Run tests:
```bash
cd functions
npm test
```

**Coverage Requirements**:
- Minimum 70% code coverage
- 100% coverage for critical payment/security functions

Example test structure:
```typescript
// functions/src/__tests__/payments.test.ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { processPayment } from '../payments';

describe('Payment Processing', () => {
  beforeEach(() => {
    // Setup test environment
  });

  it('should process valid payment', async () => {
    const result = await processPayment({
      amount: 1000,
      currency: 'USD',
      userId: 'test_user_123',
    });
    expect(result.status).toBe('succeeded');
  });

  it('should reject invalid amount', async () => {
    await expect(
      processPayment({ amount: -100, currency: 'USD', userId: 'test' })
    ).rejects.toThrow('Invalid amount');
  });
});
```

#### Run Specific Test Suites

```bash
# Payment tests
npm test -- payments.test.ts

# AI Companion tests
npm test -- aiCompanions.test.ts

# Device Trust tests
npm test -- deviceTrust.test.ts

# KYC tests
npm test -- kyc.test.ts

# With coverage
npm test -- --coverage
```

### Integration Testing

Location: [`functions/tests/integration/`](../functions/tests/integration/)

**Integration tests verify**:
- Firebase service connections
- Stripe API integration
- External API calls
- Database operations

Run integration tests:
```bash
cd functions
npm run test:integration
```

Example:
```typescript
// functions/tests/integration/critical.integration.test.ts
import { describe, it, expect } from '@jest/globals';
import * as admin from 'firebase-admin';

describe('Critical Integration Tests', () => {
  it('should connect to Firestore', async () => {
    const db = admin.firestore();
    const doc = await db.collection('_health').doc('check').get();
    expect(doc).toBeDefined();
  });

  it('should verify Stripe connection', async () => {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const balance = await stripe.balance.retrieve();
    expect(balance).toHaveProperty('available');
  });
});
```

### End-to-End Testing

**Tools**: Detox (React Native), Playwright (Web)

#### Mobile E2E with Detox

Setup:
```bash
# Install Detox
npm install -g detox-cli
cd app
npm install detox --save-dev

# Build test app
detox build --configuration ios.sim.debug

# Run tests
detox test --configuration ios.sim.debug
```

Example test:
```typescript
// e2e/login.test.ts
describe('Login Flow', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  it('should login successfully', async () => {
    await element(by.id('email-input')).typeText('test@avalo.app');
    await element(by.id('password-input')).typeText('TestPassword123!');
    await element(by.id('login-button')).tap();
    await expect(element(by.id('home-screen'))).toBeVisible();
  });
});
```

#### Web E2E with Playwright

Setup:
```bash
cd web
npm install -D @playwright/test
npx playwright install
```

Example:
```typescript
// web/e2e/checkout.spec.ts
import { test, expect } from '@playwright/test';

test('premium checkout flow', async ({ page }) => {
  await page.goto('https://avalo.app/checkout');
  await page.click('[data-testid="premium-plan"]');
  await page.fill('[data-testid="card-number"]', '4242424242424242');
  await page.fill('[data-testid="card-expiry"]', '12/25');
  await page.fill('[data-testid="card-cvc"]', '123');
  await page.click('[data-testid="submit-payment"]');
  await expect(page).toHaveURL(/.*success/);
});
```

## CI/CD Integration

### GitHub Actions Workflow

Located at: [`.github/workflows/release.yml`](../.github/workflows/release.yml)

**Automated checks run on**:
- Every PR
- Merge to develop/main
- Manual workflow dispatch

### Testing Jobs

#### 1. Lint & Test Job

```yaml
lint-and-test:
  runs-on: ubuntu-latest
  steps:
    - name: Run ESLint
      run: pnpm run lint
    
    - name: Run Unit Tests
      run: cd functions && npm test
    
    - name: Check Coverage
      run: cd functions && npm test -- --coverage
```

#### 2. Security Checks Job

```yaml
security-checks:
  runs-on: ubuntu-latest
  steps:
    - name: Run npm audit
      run: pnpm audit --audit-level=moderate
    
    - name: Check for secrets
      run: |
        if grep -r "api[_-]key.*=.*['\"][^'\"]*['\"]" --include="*.ts" .; then
          echo "Warning: Found potential API keys"
          exit 1
        fi
```

### Pre-Deploy Validation

Before deployment, CI/CD validates:
- ✅ All tests passing
- ✅ Lint checks passing
- ✅ Security audit clean
- ✅ Build successful
- ✅ Environment variables set

## Security Checks

### Automated Security Scanning

#### 1. Dependency Vulnerabilities

```bash
# Check for known vulnerabilities
pnpm audit

# Fix automatically where possible
pnpm audit --fix

# Check specific severity
pnpm audit --audit-level=moderate
```

#### 2. Secrets Detection

Prevent committing secrets:

```bash
# Install git-secrets
git clone https://github.com/awslabs/git-secrets
cd git-secrets
make install

# Setup in repo
cd /path/to/avalo
git secrets --install
git secrets --register-aws
```

Add custom patterns:
```bash
git secrets --add 'sk_live_[0-9a-zA-Z]{24}'  # Stripe live keys
git secrets --add 'sk-ant-api[0-9]+-[0-9a-zA-Z-]+'  # Anthropic keys
git secrets --add '[0-9]+-[0-9a-z]+\.apps\.googleusercontent\.com'  # Google
```

#### 3. Code Quality Analysis

Using ESLint with security rules:

```bash
# Run ESLint
pnpm run lint

# Fix automatically
pnpm run lint:fix
```

### Security Testing Checklist

- [ ] **Authentication**
  - [ ] Password strength requirements enforced
  - [ ] Rate limiting on login attempts
  - [ ] Session expiration working
  - [ ] JWT tokens properly validated
  - [ ] OAuth flows secure

- [ ] **Authorization**
  - [ ] User can only access own data
  - [ ] Admin endpoints protected
  - [ ] Role-based access control (RBAC) working
  - [ ] API endpoints require authentication

- [ ] **Data Protection**
  - [ ] Sensitive data encrypted at rest
  - [ ] HTTPS enforced everywhere
  - [ ] No sensitive data in logs
  - [ ] Personal data can be deleted (GDPR)

- [ ] **Payment Security**
  - [ ] PCI DSS compliance (via Stripe)
  - [ ] No card numbers stored directly
  - [ ] Webhook signatures verified
  - [ ] Transaction limits enforced

- [ ] **API Security**
  - [ ] Rate limiting active
  - [ ] Input validation on all endpoints
  - [ ] SQL injection prevention (Firestore)
  - [ ] XSS prevention
  - [ ] CSRF protection

### Play Integrity & App Attest

#### Google Play Integrity (Android)

Verify in Cloud Functions:

```typescript
// functions/src/secops.ts
import { PlayIntegrity } from '@google-cloud/play-integrity';

export const verifyPlayIntegrity = async (token: string) => {
  const client = new PlayIntegrity.PlayIntegrityClient();
  
  const response = await client.decodeIntegrityToken({
    packageName: 'com.avalo.app',
    integrityToken: token,
  });
  
  return {
    appIntegrity: response.appIntegrity,
    deviceIntegrity: response.deviceIntegrity,
    accountDetails: response.accountDetails,
  };
};
```

#### Apple App Attest (iOS)

Verify device attestation:

```typescript
// functions/src/secops.ts
import { AppAttest } from '@apple/app-attest';

export const verifyAppAttest = async (attestation: string, challenge: string) => {
  const isValid = await AppAttest.validateAttestation({
    attestation,
    challenge,
    bundleId: 'com.avalo.app',
    teamId: 'YOUR_TEAM_ID',
  });
  
  return isValid;
};
```

## Performance Testing

### Load Testing

#### Artillery Configuration

Create `artillery.yml`:

```yaml
config:
  target: "https://europe-west3-avalo-c8c46.cloudfunctions.net"
  phases:
    - duration: 60
      arrivalRate: 5
      name: "Warm up"
    - duration: 120
      arrivalRate: 10
      name: "Sustained load"
    - duration: 60
      arrivalRate: 20
      name: "Spike"
  
scenarios:
  - name: "User Login Flow"
    flow:
      - post:
          url: "/api/auth/login"
          json:
            email: "test@avalo.app"
            password: "TestPassword123!"
      
      - get:
          url: "/api/user/profile"
          headers:
            Authorization: "Bearer {{ token }}"
```

Run load test:
```bash
npm install -g artillery
artillery run artillery.yml
```

### Performance Benchmarks

Monitor key metrics:

| Metric | Target | Critical |
|--------|--------|----------|
| API Response Time (p95) | < 500ms | < 1000ms |
| Page Load Time | < 2s | < 4s |
| Time to Interactive | < 3s | < 5s |
| First Contentful Paint | < 1.5s | < 3s |
| Crash-Free Rate | > 99.5% | > 98% |
| Cold Start (Functions) | < 2s | < 5s |

### Firebase Performance Monitoring

Enable in app:
```typescript
// app/firebaseConfig.ts
import { getPerformance } from 'firebase/performance';

const perf = getPerformance(app);

// Trace custom operations
export const traceOperation = async (name: string, operation: () => Promise<any>) => {
  const trace = perf.trace(name);
  trace.start();
  try {
    const result = await operation();
    trace.stop();
    return result;
  } catch (error) {
    trace.stop();
    throw error;
  }
};
```

## Manual QA Checklist

### Pre-Release Testing

#### Authentication & Onboarding
- [ ] New user registration works
- [ ] Email verification sent and works
- [ ] Phone verification works (if enabled)
- [ ] Profile creation flow smooth
- [ ] Profile photo upload works
- [ ] Social login (Google) works
- [ ] Password reset works
- [ ] Logout works correctly

#### Core Features
- [ ] User can browse feed
- [ ] Like/comment on posts
- [ ] Create new post with photo
- [ ] Search for users works
- [ ] Filter/sort results work
- [ ] Location-based discovery functional
- [ ] Notifications received and actionable

#### Chat & Messaging
- [ ] Start new conversation
- [ ] Send text messages
- [ ] Send photos/videos
- [ ] Real-time message updates
- [ ] Read receipts work (if enabled)
- [ ] Typing indicators work
- [ ] Push notifications for messages
- [ ] Block/report user works

#### AI Companions
- [ ] Access AI companion
- [ ] Start conversation
- [ ] Responses are coherent
- [ ] Context maintained across messages
- [ ] Premium features gated correctly
- [ ] Usage limits enforced

#### Calendar & Events
- [ ] Create event
- [ ] Book appointment
- [ ] View calendar
- [ ] Receive event reminders
- [ ] Cancel/reschedule works
- [ ] Calendar sync (if enabled)

#### Payments & Subscriptions
- [ ] Premium checkout flow
- [ ] Card payment successful
- [ ] Subscription activated
- [ ] Premium features unlocked
- [ ] Subscription management works
- [ ] Cancellation works
- [ ] Refunds processed correctly

#### Settings & Privacy
- [ ] Update profile information
- [ ] Change password
- [ ] Toggle privacy settings
- [ ] Manage notifications
- [ ] Delete account works
- [ ] Data export works (GDPR)

### Device Testing Matrix

| Device Category | iOS | Android |
|----------------|-----|---------|
| Phone - Small | iPhone SE (2022) | Pixel 4a |
| Phone - Medium | iPhone 13 | Samsung Galaxy S21 |
| Phone - Large | iPhone 15 Pro Max | Pixel 8 Pro |
| Tablet | iPad Air | Samsung Tab S8 |

### Browser Testing (Web)

- [ ] Chrome (latest)
- [ ] Safari (latest)
- [ ] Firefox (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

### Regression Testing

Run before each release:
- [ ] Critical user flows
- [ ] Payment processing
- [ ] Authentication flows
- [ ] Data integrity
- [ ] Performance benchmarks

## Test Data & Environments

### Test User Accounts

```
# Standard User
Email: test@avalo.app
Password: TestPassword123!
Role: User

# Premium User
Email: premium@avalo.app
Password: TestPassword123!
Role: Premium User

# Admin User
Email: admin@avalo.app
Password: AdminPassword123!
Role: Admin

# Test Credit Card (Stripe)
Number: 4242 4242 4242 4242
Expiry: Any future date
CVC: Any 3 digits
ZIP: Any 5 digits
```

### Environment Setup

#### Development
```bash
# Use emulators
export EXPO_PUBLIC_USE_EMULATORS=true
npm run emulators
npm run dev
```

#### Staging/Preview
```bash
# Use preview environment
export EXPO_PUBLIC_ENV=preview
npm run build:preview
```

#### Production
```bash
# Use production environment
export EXPO_PUBLIC_ENV=production
npm run build:production
```

## Monitoring & Analytics

### Firebase Crashlytics

Monitor crashes in real-time:
- [Firebase Console](https://console.firebase.google.com) → Crashlytics
- Set up alerts for crash rate > 1%
- Review stack traces daily

### Firebase Analytics

Track key events:
- User sign-ups
- Premium conversions
- Feature usage
- Retention metrics
- User engagement

### Custom Monitoring

```typescript
// Track custom errors
import crashlytics from '@react-native-firebase/crashlytics';

try {
  await riskyOperation();
} catch (error) {
  crashlytics().recordError(error);
  crashlytics().log('Risky operation failed');
}
```

### Performance Monitoring

```typescript
import perf from '@react-native-firebase/perf';

const trace = await perf().startTrace('checkout_flow');
await processCheckout();
await trace.stop();
```

## QA Sign-Off Process

### Before Release

1. **Developer Testing**
   - [ ] Unit tests pass
   - [ ] Integration tests pass
   - [ ] Manual testing of changes

2. **QA Testing**
   - [ ] Full regression suite
   - [ ] New feature testing
   - [ ] Cross-device testing
   - [ ] Performance testing

3. **Stakeholder Review**
   - [ ] Product owner approval
   - [ ] Design review (UI/UX)
   - [ ] Security review (if major changes)

4. **Final Checks**
   - [ ] Release notes prepared
   - [ ] Documentation updated
   - [ ] Rollback plan ready
   - [ ] Monitoring configured

### Sign-Off Template

```
Release Version: X.Y.Z
Release Date: YYYY-MM-DD

QA Lead: ________________  Date: ________
Developer: ______________  Date: ________
Product Manager: ________  Date: ________

Test Summary:
- Total Test Cases: ___
- Passed: ___
- Failed: ___
- Blocked: ___

Known Issues:
1. [Issue description - severity - workaround]
2. ...

Approval: [ ] APPROVED  [ ] REJECTED

Notes:
_________________________________
```

## Automated QA Scripts

### Health Check Script

Create `scripts/health-check.sh`:

```bash
#!/bin/bash

echo "🏥 Running Avalo Health Checks..."

# Check Firebase connection
echo "\n📊 Checking Firebase..."
curl -f https://avalo-c8c46.firebaseapp.com/__/firebase/init.json > /dev/null
if [ $? -eq 0 ]; then
  echo "✅ Firebase OK"
else
  echo "❌ Firebase FAILED"
  exit 1
fi

# Check Functions endpoint
echo "\n⚡ Checking Cloud Functions..."
curl -f https://europe-west3-avalo-c8c46.cloudfunctions.net/health > /dev/null
if [ $? -eq 0 ]; then
  echo "✅ Functions OK"
else
  echo "❌ Functions FAILED"
  exit 1
fi

# Check Stripe webhook
echo "\n💳 Checking Stripe webhook..."
curl -f https://europe-west3-avalo-c8c46.cloudfunctions.net/stripeWebhook > /dev/null
if [ $? -eq 0 ]; then
  echo "✅ Stripe webhook OK"
else
  echo "❌ Stripe webhook FAILED"
  exit 1
fi

echo "\n✅ All health checks passed!"
```

### Run All Tests Script

Create `scripts/run-all-tests.sh`:

```bash
#!/bin/bash

echo "🧪 Running All Avalo Tests..."

# Unit tests
echo "\n📦 Running unit tests..."
cd functions
npm test
if [ $? -ne 0 ]; then
  echo "❌ Unit tests failed"
  exit 1
fi

# Integration tests
echo "\n🔗 Running integration tests..."
npm run test:integration
if [ $? -ne 0 ]; then
  echo "❌ Integration tests failed"
  exit 1
fi

# Lint check
echo "\n📝 Running lint check..."
cd ..
pnpm run lint
if [ $? -ne 0 ]; then
  echo "❌ Lint check failed"
  exit 1
fi

# Security audit
echo "\n🔒 Running security audit..."
pnpm audit --audit-level=moderate
if [ $? -ne 0 ]; then
  echo "⚠️  Security audit found issues"
fi

echo "\n✅ All tests completed successfully!"
```

## Best Practices

1. **Test Early, Test Often** - Don't wait until release
2. **Automate Everything** - Manual testing is slow and error-prone
3. **Test in Production-Like Environment** - Catch environment-specific issues
4. **Monitor Real Users** - Analytics reveal issues tests miss
5. **Maintain Test Data** - Keep realistic, up-to-date test data
6. **Document Test Cases** - Make testing repeatable
7. **Review Failed Tests** - Don't just re-run, understand why
8. **Performance Matters** - Test under load, not just happy path

---

**Last Updated**: 2024-11-04  
**Version**: 1.0.0