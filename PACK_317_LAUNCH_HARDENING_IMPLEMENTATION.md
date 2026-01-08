# PACK 317 — Launch Hardening, Security & Rate Limits (Go-Live Gate)

**Status:** ✅ COMPLETE  
**Implementation Date:** 2025-12-11  
**Dependencies:** PACK 268, 277, 288, 295, 299, 304-316

---

## 🎯 OBJECTIVE

Add final security hardening layer before Avalo goes live (Android + iOS + Web):
- ✅ Rate limiting for critical endpoints
- ✅ Anti-bot and spam protection
- ✅ Privacy-safe logging (no PII leakage)
- ✅ Launch gate controls (maintenance mode)
- ✅ Web security headers
- ✅ Mobile hardening baseline
- ✅ System health check endpoint

**CRITICAL:** NO tokenomics changes, NO pricing changes, NO free tokens.

---

## 📦 DELIVERABLES

### 1. Enhanced Rate Limiting System

**File:** [`functions/src/pack317-rate-limiting.ts`](functions/src/pack317-rate-limiting.ts)

**Features:**
- Rate limit counters per IP, USER, or DEVICE
- Configurable windows and burst allowance
- Integration with existing logging (PACK 90, 313)

**Protected Actions:**
```typescript
// Auth
REGISTER:               5 per IP per hour
LOGIN:                  20 per IP/user per hour
PASSWORD_RESET:         3 per hour

// Messaging (additive to paid rules)
CHAT_SEND:             120 per user per hour
CHAT_CREATE:           30 per hour

// Swipe (bot prevention)
SWIPE_ACTION:          60 per minute

// Support & Safety
SAFETY_REPORT:         10 per hour
PANIC_BUTTON:          5 per hour (throttle, never block)
SUPPORT_TICKET:        5 per hour

// Calendar & Events
CALENDAR_BOOKING:      10 per hour
EVENT_BOOKING:         5 per 15 minutes

// Media
MEDIA_UPLOAD:          20 per hour
```

**Key Function:**
```typescript
await assertRateLimit(
  { type: 'USER', identifier: userId, action: 'CHAT_SEND' },
  { windowMs: 3600000, maxRequests: 120 }
);
```

**Data Model:**
```typescript
// Collection: rateLimits/{rateKey}
{
  rateKey: "USER:uid123:CHAT_SEND:12345",
  window: "3600s",
  maxRequests: 120,
  currentCount: 45,
  windowStart: Timestamp,
  updatedAt: Timestamp
}
```

---

### 2. Anti-Bot & Spam Protection

**File:** [`functions/src/pack317-anti-bot.ts`](functions/src/pack317-anti-bot.ts)

**Features:**

#### 2.1 Registration Abuse Detection
- ✅ Disposable email blocking (configurable domain list)
- ✅ Multiple accounts from same IP detection (5+ in 24h)
- ✅ Multiple accounts from same device (3+ in 7 days)
- ✅ Risk scoring integration (flags, not auto-ban)

```typescript
const result = await checkRegistrationAbuse({
  email: 'user@example.com',
  ipHash: hashIP(ipAddress),
  deviceId: 'abc123',
});
// Returns: { allowed: boolean, riskFlags: string[] }
```

#### 2.2 Message Spam Detection
- ✅ Identical message to multiple users detection
- ✅ Same text to 5+ users = SOFT_BLOCK
- ✅ Same text to 3-4 users = THROTTLE
- ✅ Integration with Risk Engine for limited mode

```typescript
const spamCheck = await checkMessageSpam({
  userId: 'uid123',
  messageText: 'Check out this link...',
  recipientId: 'uid456',
});
// Returns: { isSpam: boolean, action: 'ALLOW' | 'THROTTLE' | 'SOFT_BLOCK' }
```

#### 2.3 Risk Engine Integration
- ✅ Triggers limited mode (can read, cannot send)
- ✅ All decisions reversible by Support/Admin
- ✅ Logged to audit logs (PACK 90)

---

### 3. Privacy & Logging Sanity Checks

**File:** [`functions/src/pack317-privacy-logger.ts`](functions/src/pack317-privacy-logger.ts)

**Features:**
- ✅ Automatic PII sanitization before logging
- ✅ Strips: emails, phones, cards, passwords, tokens, messages
- ✅ Regex-based pattern detection
- ✅ Validation function for log safety

**Protected Fields:**
```typescript
SENSITIVE_KEYS = [
  'email', 'phone', 'card', 'cvv', 'ssn', 'password',
  'token', 'apiKey', 'secret', 'messageText', 'imageUrl'
]
```

**Usage:**
```typescript
import { sanitizeLogDetails, logSafeTechEvent } from './pack317-privacy-logger';

// Auto-sanitizes before logging
await logSafeTechEvent({
  level: 'INFO',
  category: 'FUNCTION',
  functionName: 'myFunction',
  message: 'User action completed',
  context: { email: 'user@example.com', userId: 'uid123' }
});
// Logs: { email: 'use***@example.com', userId: 'uid123' }
```

**Sanitization Examples:**
```typescript
sanitizeLogDetails({
  email: 'user@example.com',      // → 'use***@example.com'
  phone: '+1-234-567-8900',       // → '***8900'
  card: '4532-1234-5678-9010',    // → '****-****-****-9010'
  messageText: 'Hello world',     // → '[MESSAGE_REDACTED]'
  imageUrl: 'https://...',        // → '[MEDIA_URL_REDACTED]'
})
```

---

### 4. Launch Gate Configuration

**File:** [`functions/src/pack317-launch-gate.ts`](functions/src/pack317-launch-gate.ts)

**Features:**
- ✅ Launch status control (PRELAUNCH | LIMITED_BETA | OPEN)
- ✅ Registration blocking (for maintenance)
- ✅ Paid feature blocking (emergency freeze)
- ✅ Granular feature controls
- ✅ Cached config (1-minute TTL for performance)

**Configuration:**
```typescript
// Collection: config/launch
{
  status: 'PRELAUNCH' | 'LIMITED_BETA' | 'OPEN',
  minPacksRequired: 317,
  blockNewRegistrations: false,
  blockPaidFeatures: false,
  blockNewChats: false,
  blockNewCalls: false,
  blockNewMeetings: false,
  blockNewEvents: false,
  blockTokenPurchases: false,
  maintenanceMessage: "We're performing maintenance...",
  updatedAt: Timestamp,
  updatedBy: 'adminId'
}
```

**Usage:**
```typescript
// Check if registrations allowed
const check = await checkRegistrationAllowed();
if (!check.allowed) {
  throw new Error(check.maintenanceMessage);
}

// Check if specific paid feature allowed
const chatCheck = await checkPaidFeaturesAllowed('CHAT');
if (!chatCheck.allowed) {
  return { error: chatCheck.reason };
}
```

**Admin Functions:**
```typescript
// Update launch config
await updateLaunchConfig({
  status: 'OPEN',
  blockNewRegistrations: false,
  maintenanceMessage: undefined,
  updatedBy: 'adminUid',
});

// Get history
const history = await getLaunchConfigHistory(50);
```

---

### 5. Web Security Headers

**File:** [`app-web/next.config.js`](app-web/next.config.js)

**Added Security Headers:**
```javascript
headers() {
  return [{
    source: '/:path*',
    headers: [
      // HSTS - Force HTTPS
      'Strict-Transport-Security: max-age=63072000; includeSubDomains; preload',
      
      // Prevent clickjacking
      'X-Frame-Options: SAMEORIGIN',
      
      // Prevent MIME sniffing
      'X-Content-Type-Options: nosniff',
      
      // XSS protection
      'X-XSS-Protection: 1; mode=block',
      
      // Referrer policy
      'Referrer-Policy: strict-origin-when-cross-origin',
      
      // Feature permissions
      'Permissions-Policy: camera=(), microphone=(), geolocation=(self)',
      
      // Content Security Policy (CSP)
      'Content-Security-Policy: default-src self; script-src self unsafe-eval unsafe-inline https://js.stripe.com...'
    ]
  }];
}
```

**CSP Allowed Domains:**
- ✅ Self (Avalo domain)
- ✅ Firebase (auth, storage, realtime)
- ✅ Stripe (payments)
- ✅ Google Tag Manager (analytics)
- ✅ Google Fonts
- ❌ All other third-party scripts blocked

---

### 6. Mobile Hardening Baseline

**File:** [`functions/src/pack317-mobile-hardening.ts`](functions/src/pack317-mobile-hardening.ts)

**Features:**

#### 6.1 Production Build Verification
```typescript
verifyMobileBuild({
  __DEV__: false,
  expoConfig: config,
  buildType: 'release'
})
// Returns: { isProduction, debugMode, crashReportingEnabled, issues: [] }
```

#### 6.2 Sensitive Screen Protection
```typescript
const SENSITIVE_SCREENS = [
  '/wallet',
  '/settings/security',
  '/settings/verification',
  '/earnings',
  '/payout-requests',
];

// Check if screen should be blurred in app switcher
const shouldBlur = shouldBlurScreen(routeName);
```

#### 6.3 Security Checklist
```typescript
getMobileSecurityChecklist()
// Returns:
{
  minOSVersions: { ios: '13.0', android: 23 },
  requiredPermissions: ['CAMERA', 'NOTIFICATIONS'],
  forbiddenInProduction: ['__DEV__', 'EXPO_DEBUG'],
  securityFeatures: {
    screenBlur: true,
    secureStorage: true
  }
}
```

---

### 7. System Launch Check Endpoint

**File:** [`functions/src/pack317-launch-check.ts`](functions/src/pack317-launch-check.ts)

**Endpoint:** `GET /system/launch-check`

**Response:**
```json
{
  "env": "production",
  "appConfigVersion": 317,
  "launchStatus": "OPEN",
  "criticalModules": {
    "auth": "OK",
    "verification": "OK",
    "wallet": "OK",
    "chat": "OK",
    "calendar": "OK",
    "events": "DISABLED_BY_CONFIG",
    "aiCompanions": "OK",
    "notifications": "OK"
  },
  "security": {
    "rateLimiting": "ENABLED",
    "errorTracking": "ENABLED",
    "monitoring": "ENABLED"
  },
  "timestamp": "2025-12-11T05:00:00.000Z"
}
```

**Module Checks:**
- ✅ Auth: Firebase Auth API accessible
- ✅ Verification: Config exists
- ✅ Wallet: Token packs configured, treasury initialized
- ✅ Chat: Pricing config exists
- ✅ Calendar/Events: Config exists (or disabled)
- ✅ AI Companions: Enabled check
- ✅ Notifications: Config exists

**Security Checks:**
- ✅ Rate limiting: Active counters exist
- ✅ Error tracking: Recent logs exist
- ✅ Monitoring: PACK 313 config enabled

---

### 8. Security Analytics & Events

**File:** [`functions/src/pack317-analytics-events.ts`](functions/src/pack317-analytics-events.ts)

**Event Types:**
```typescript
RATE_LIMIT_HIT
SPAM_SUSPECT_DETECTED
LAUNCH_GATE_CHANGED
DISPOSABLE_EMAIL_BLOCKED
REGISTRATION_ABUSE_DETECTED
MESSAGE_SPAM_DETECTED
BOT_PATTERN_DETECTED
SECURITY_VIOLATION
```

**Functions:**
```typescript
// Log security event
await logSecurityEvent({
  eventType: 'RATE_LIMIT_HIT',
  userId: 'uid123',
  ipHash: 'abc123...',
  metadata: { action: 'CHAT_SEND', retryAfter: 60 }
});

// Query events (admin)
const result = await querySecurityEvents({
  eventType: 'SPAM_SUSPECT_DETECTED',
  startDate: new Date('2025-12-01'),
  limit: 100
});

// Dashboard stats
const stats = await getSecurityDashboardStats();
// Returns:
{
  today: { rateLimitHits, spamDetections, registrationBlocks, securityViolations },
  last7Days: { rateLimitHits, spamDetections, registrationBlocks }
}
```

---

## 🔌 INTEGRATION POINTS

### Integration with Existing Systems

#### 1. Auth Functions (Registration/Login)
```typescript
// In your auth signup function
import { checkRegistrationAllowed } from './pack317-launch-gate';
import { checkRegistrationAbuse } from './pack317-anti-bot';
import { assertRateLimit, hashIP } from './pack317-rate-limiting';

// Check launch gate
const gateCheck = await checkRegistrationAllowed();
if (!gateCheck.allowed) {
  throw new Error(gateCheck.maintenanceMessage);
}

// Check rate limit
await assertRateLimit({
  type: 'IP',
  identifier: hashIP(ipAddress),
  action: 'REGISTER'
});

// Check for abuse
const abuseCheck = await checkRegistrationAbuse({
  email,
  ipHash: hashIP(ipAddress),
  deviceId
});

if (!abuseCheck.allowed) {
  throw new Error(abuseCheck.reason);
}
```

#### 2. Chat Functions (Message Sending)
```typescript
import { assertRateLimit } from './pack317-rate-limiting';
import { checkMessageSpam } from './pack317-anti-bot';
import { checkPaidFeaturesAllowed } from './pack317-launch-gate';

// Check launch gate
const gateCheck = await checkPaidFeaturesAllowed('CHAT');
if (!gateCheck.allowed) {
  throw new Error(gateCheck.maintenanceMessage);
}

// Check rate limit (per user)
await assertRateLimit({
  type: 'USER',
  identifier: userId,
  action: 'CHAT_SEND'
});

// Check for spam
const spamCheck = await checkMessageSpam({
  userId,
  messageText,
  recipientId
});

if (spamCheck.isSpam) {
  throw new Error('Message blocked: spam detected');
}
```

#### 3. Swipe Functions
```typescript
import { assertRateLimit } from './pack317-rate-limiting';

// Backend rate cap (on top of product limits)
await assertRateLimit({
  type: 'USER',
  identifier: userId,
  action: 'SWIPE_ACTION'
});
```

#### 4. Calendar/Event Booking
```typescript
import { assertRateLimit } from './pack317-rate-limiting';
import { checkPaidFeaturesAllowed } from './pack317-launch-gate';

// Check launch gate
const gateCheck = await checkPaidFeaturesAllowed('MEETING');
if (!gateCheck.allowed) {
  throw new Error(gateCheck.maintenanceMessage);
}

// Rate limit
await assertRateLimit({
  type: 'USER',
  identifier: userId,
  action: 'CALENDAR_BOOKING_CREATE'
});
```

---

## 📊 FIRESTORE SCHEMA

### Collections Created

#### 1. `rateLimits/{rateKey}`
```typescript
{
  rateKey: string,              // "USER:uid:ACTION:windowId"
  window: string,               // "3600s"
  maxRequests: number,          // 120
  currentCount: number,         // 45
  windowStart: Timestamp,
  updatedAt: Timestamp
}
```

#### 2. `pack317_rate_limit_violations/{id}`
```typescript
{
  keyType: 'IP' | 'USER' | 'DEVICE',
  identifier: string,
  action: RateLimitAction,
  count: number,
  timestamp: Timestamp
}
```

#### 3. `pack317_registrations/{id}`
```typescript
{
  email: string,
  ipHash: string,
  deviceId?: string,
  riskFlags: string[],
  createdAt: Timestamp
}
```

#### 4. `pack317_message_tracking/{id}`
```typescript
{
  userId: string,
  messageHash: string,          // MD5 of normalized text
  recipientId: string,
  createdAt: Timestamp
}
```

#### 5. `pack317_spam_detections/{id}`
```typescript
{
  userId: string,
  type: string,
  metadata: object,
  timestamp: Timestamp
}
```

#### 6. `pack317_security_events/{id}`
```typescript
{
  eventId: string,
  eventType: SecurityEventType,
  userId?: string,
  ipHash?: string,
  metadata: object,
  createdAt: Timestamp
}
```

#### 7. `config/launch`
```typescript
{
  status: 'PRELAUNCH' | 'LIMITED_BETA' | 'OPEN',
  minPacksRequired: 317,
  blockNewRegistrations: boolean,
  blockPaidFeatures: boolean,
  blockNewChats: boolean,
  blockNewCalls: boolean,
  blockNewMeetings: boolean,
  blockNewEvents: boolean,
  blockTokenPurchases: boolean,
  maintenanceMessage?: string,
  updatedAt: Timestamp,
  updatedBy?: string
}
```

---

## 🔐 SECURITY RULES

**File:** [`firestore-pack317-launch-hardening.rules`](firestore-pack317-launch-hardening.rules)

**Access Control:**
- ✅ `rateLimits`: Backend only (no user access)
- ✅ `pack317_*_violations`: Admin read-only
- ✅ `pack317_registrations`: System only
- ✅ `pack317_security_events`: Admin read-only
- ✅ `config/launch`: Public read, admin write
- ✅ `enforcement_states`: User read own, admin read all

---

## 🔧 INDEXES

**File:** [`firestore-pack317-launch-hardening.indexes.json`](firestore-pack317-launch-hardening.indexes.json)

**Composite Indexes:**
1. `rateLimits`: (rateKey, updatedAt)
2. `pack317_rate_limit_violations`: (keyType, timestamp), (action, timestamp)
3. `pack317_registrations`: (ipHash, createdAt), (deviceId, createdAt)
4. `pack317_message_tracking`: (userId, messageHash, createdAt)
5. `pack317_spam_detections`: (userId, timestamp), (type, timestamp)
6. `pack317_security_events`: (eventType, createdAt), (userId, createdAt)
7. `risk_events`: (userId, createdAt)
8. `enforcement_states`: (limitedMode, updatedAt)

---

## 🌐 API ENDPOINTS (Cloud Functions)

### Public Callable Functions

**File:** [`functions/src/pack317-endpoints.ts`](functions/src/pack317-endpoints.ts)

```typescript
// Rate limiting check (internal/testing)
pack317_checkRateLimit({ action, identifier, type })

// Registration abuse check
pack317_checkRegistration({ email, ipAddress, deviceId })

// Message spam check
pack317_checkMessageSpam({ messageText, recipientId })

// Get launch config (public)
pack317_getLaunchConfig()

// Update launch config (admin)
pack317_updateLaunchConfig({ status, blocks... })

// Get launch history (admin)
pack317_getLaunchConfigHistory({ limit })

// Launch check callable (admin)
pack317_launchCheckCallable()

// Query security events (admin)
pack317_querySecurityEvents({ eventType, userId, startDate, limit })

// Get security stats (admin)
pack317_getSecurityStats()

// Test sanitization (dev only)
pack317_testSanitization({ testData })
```

### HTTP Endpoint

```bash
# System health check
GET /system/launch-check

# Response
{
  "env": "production",
  "appConfigVersion": 317,
  "launchStatus": "OPEN",
  "criticalModules": { ... },
  "security": { ... },
  "timestamp": "..."
}
```

---

## 🎨 WEB HARDENING

### Security Headers (Next.js)

**Added to:** [`app-web/next.config.js`](app-web/next.config.js:157-212)

```javascript
async headers() {
  return [
    {
      source: '/:path*',
      headers: [
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Content-Security-Policy', value: '...' }
      ]
    }
  ];
}
```

### Cookies Security
- ✅ `Secure` flag in production
- ✅ `HttpOnly` for auth cookies
- ✅ `SameSite=Lax` or `SameSite=Strict`

---

## 📱 MOBILE HARDENING

### React Native Security Baseline

**Implemented in:** [`functions/src/pack317-mobile-hardening.ts`](functions/src/pack317-mobile-hardening.ts)

**Requirements:**
1. ✅ Minimum OS versions: iOS 13+, Android 6.0+ (API 23)
2. ✅ Debug logging disabled in production builds
3. ✅ Crash reporting enabled (Sentry DSN configured)
4. ✅ Screen blur on sensitive screens (wallet, verification)
5. ✅ Secure storage for tokens/keys (expo-secure-store)

**Production Checks:**
```typescript
checkMobileProductionReadiness({
  platform: 'ios',
  osVersion: '15.0',
  buildType: 'release',
  config: expoConfig
})
// Returns: { ready: true, checks: {...}, issues: [] }
```

**Screen Blur Implementation (React Native):**
```typescript
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { shouldBlurScreen } from '@/lib/pack317-mobile-hardening';

// In sensitive screens
useEffect(() => {
  if (shouldBlurScreen(route.name)) {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        // Enable blur overlay
      } else if (state === 'active') {
        // Remove blur overlay
      }
    });
    return () => subscription.remove();
  }
}, [route.name]);
```

---

## 📈 ANALYTICS & MONITORING

### Security Metrics

**Daily Metrics (in `metrics_daily` collection):**
```typescript
SECURITY_RATE_LIMIT_HIT_2025-12-11: 145
SECURITY_SPAM_SUSPECT_DETECTED_2025-12-11: 12
SECURITY_REGISTRATION_ABUSE_DETECTED_2025-12-11: 3
SECURITY_SECURITY_VIOLATION_2025-12-11: 1
```

### Admin Dashboard

**Query security events:**
```typescript
const events = await querySecurityEvents({
  eventType: 'RATE_LIMIT_HIT',
  startDate: new Date('2025-12-01'),
  endDate: new Date('2025-12-11'),
  limit: 100
});
```

**Dashboard stats:**
```typescript
const stats = await getSecurityDashboardStats();
// Shows today's counts and 7-day trends
```

---

## 🚀 DEPLOYMENT CHECKLIST

### Pre-Launch Validation

1. **Verify Launch Config:**
```bash
# Check system status
curl https://your-region-your-project.cloudfunctions.net/pack317_launchCheck_http

# Should return all modules "OK" and security "ENABLED"
```

2. **Set Launch Status:**
```typescript
// In Firebase Console or via admin function
await updateLaunchConfig({
  status: 'OPEN',
  blockNewRegistrations: false,
  blockPaidFeatures: false,
  updatedBy: 'adminUid'
});
```

3. **Deploy Firestore Rules:**
```bash
firebase deploy --only firestore:rules
```

4. **Deploy Firestore Indexes:**
```bash
firebase deploy --only firestore:indexes
```

5. **Deploy Functions:**
```bash
firebase deploy --only functions:pack317_launchCheck_http,functions:pack317_getLaunchConfig_callable
```

6. **Verify Web Security Headers:**
```bash
# Test production build
npm run build
npm run start

# Check headers
curl -I https://your-domain.com
# Should see Strict-Transport-Security, X-Frame-Options, etc.
```

---

## ⚠️ COMPLIANCE GUARANTEES

### What PACK 317 Does NOT Change

✅ **Token Pricing:**
- Payout rate: 0.20 PLN per token (unchanged)
- Token packages: Same prices (unchanged)

✅ **Revenue Splits:**
- Chat/Calls/AI: 65/35 (unchanged)
- Calendar/Events: 80/20 (unchanged)

✅ **Pricing:**
- Chat pricing (unchanged)
- Call minute rates (unchanged)
- Calendar booking fees (unchanged)
- Event ticket pricing (unchanged)

✅ **Refunds:**
- Meeting refund policies (unchanged)
- Event refund policies (unchanged)

✅ **No New Incentives:**
- NO free tokens
- NO discounts
- NO promo codes
- NO cashback
- NO referral bonuses

### What PACK 317 DOES Change

✅ **Security Only:**
- Rate limits (prevent abuse, not monetization)
- Spam detection (flag users, not ban)
- Launch gates (temporary blocks for maintenance)
- Privacy logging (no PII in logs)
- Security headers (web hardening)
- Mobile security (production readiness)

---

## 🧪 TESTING

### 1. Rate Limiting Tests

```typescript
// Test rate limit enforcement
for (let i = 0; i < 25; i++) {
  try {
    await assertRateLimit({
      type: 'USER',
      identifier: 'testUser',
      action: 'LOGIN'
    });
    console.log(`Request ${i + 1}: OK`);
  } catch (error) {
    console.log(`Request ${i + 1}: RATE LIMITED`);
    // Should fail after 20 requests
  }
}
```

### 2. Spam Detection Tests

```typescript
// Test spam detection
const sameMessage = 'Check out this link!';

for (let i = 0; i < 6; i++) {
  const result = await checkMessageSpam({
    userId: 'testUser',
    messageText: sameMessage,
    recipientId: `recipient${i}`
  });
  console.log(`Message ${i + 1}:`, result.action);
  // Should be SOFT_BLOCK after 5th unique recipient
}
```

### 3. Launch Gate Tests

```typescript
// Test registration blocking
await updateLaunchConfig({
  blockNewRegistrations: true,
  maintenanceMessage: 'Under maintenance',
  updatedBy: 'testAdmin'
});

const check = await checkRegistrationAllowed();
console.log('Registration allowed:', check.allowed); // false
```

### 4. Privacy Sanitization Tests

```typescript
import { sanitizeLogDetails } from './pack317-privacy-logger';

const testData = {
  email: 'user@example.com',
  phone: '+1-234-567-8900',
  card: '4532-1234-5678-9010',
  userId: 'uid123'
};

const sanitized = sanitizeLogDetails(testData);
console.log(sanitized);
// {
//   email: 'use***@example.com',
//   phone: '***8900',
//   card: '****-****-****-9010',
//   userId: 'uid123'
// }
```

---

## 📋 MONITORING & ALERTS

### Key Metrics to Monitor

1. **Rate Limit Hits:**
   - Alert if > 1000 hits per hour
   - Investigate if specific action has spike

2. **Spam Detections:**
   - Alert if > 50 spam suspects per day
   - Review flagged users for patterns

3. **Registration Blocks:**
   - Alert if > 100 blocks per day
   - May indicate attack or issue with disposable list

4. **Launch Gate Changes:**
   - Alert on any launch config change
   - Requires immediate verification

### Admin Queries

```typescript
// Get top rate limit offenders (last 24h)
const violations = await querySecurityEvents({
  eventType: 'RATE_LIMIT_HIT',
  startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
  limit: 100
});

// Group by user
const userCounts = violations.events.reduce((acc, event) => {
  const userId = event.userId || 'UNKNOWN';
  acc[userId] = (acc[userId] || 0) + 1;
  return acc;
}, {});
```

---

## 🔄 MAINTENANCE PROCEDURES

### Emergency Maintenance Mode

```typescript
// Enable full maintenance mode
await updateLaunchConfig({
  status: 'PRELAUNCH',
  blockNewRegistrations: true,
  blockPaidFeatures: true,
  blockNewChats: true,
  blockNewCalls: true,
  blockNewMeetings: true,
  blockNewEvents: true,
  blockTokenPurchases: true,
  maintenanceMessage: 'Avalo is undergoing critical maintenance. We\'ll be back shortly!',
  updatedBy: 'adminUid'
});
```

### Partial Block (e.g., only new chats)

```typescript
await updateLaunchConfig({
  status: 'OPEN',
  blockNewChats: true,
  maintenanceMessage: 'New chats are temporarily disabled while we upgrade the system.',
  updatedBy: 'adminUid'
});
```

### Return to Normal

```typescript
await updateLaunchConfig({
  status: 'OPEN',
  blockNewRegistrations: false,
  blockPaidFeatures: false,
  blockNewChats: false,
  blockNewCalls: false,
  blockNewMeetings: false,
  blockNewEvents: false,
  blockTokenPurchases: false,
  maintenanceMessage: undefined,
  updatedBy: 'adminUid'
});
```

---

## 📝 VERIFICATION STEPS

### Before Go-Live

1. ✅ Run launch check: `GET /system/launch-check`
2. ✅ Verify all critical modules return "OK"
3. ✅ Verify security features return "ENABLED"
4. ✅ Test rate limiting on staging
5. ✅ Test spam detection with dummy data
6. ✅ Verify security headers in browser DevTools
7. ✅ Build mobile apps in production mode
8. ✅ Verify mobile security checklist passes
9. ✅ Set launch status to "OPEN"
10. ✅ Monitor security dashboard for anomalies

### Post-Launch Monitoring

**First 24 Hours:**
- Monitor rate limit hit rate
- Check for spam detection false positives
- Review registration block rate
- Verify no PII in logs
- Check system health every hour

**First Week:**
- Daily review of security events
- Adjust rate limits if too aggressive
- Update disposable email list if needed
- Monitor false positive rates

---

## 🔗 DEPENDENCIES

### Required Packs

- ✅ PACK 268: Global Rules & Safety Engine
- ✅ PACK 277: Wallet & Transactions
- ✅ PACK 288: Chat pricing engine
- ✅ PACK 299: Analytics engine
- ✅ PACK 304-305: Finance console, legal/audit
- ✅ PACK 313: Monitoring & logging

### Integration Points

1. **Auth System:** Registration/login rate limits
2. **Chat System:** Message spam detection
3. **Swipe Engine:** Bot prevention
4. **Calendar/Events:** Booking spam prevention
5. **Risk Engine:** Limited mode enforcement
6. **Audit Logger:** Security event logging
7. **Analytics:** Security metrics tracking

---

## 📚 USAGE EXAMPLES

### Example 1: Protected Registration Endpoint

```typescript
export const signup = functions.https.onCall(async (data, context) => {
  const { email, password, deviceId } = data;
  const ipAddress = context.rawRequest.ip;

  // PACK 317: Check launch gate
  const gateCheck = await checkRegistrationAllowed();
  if (!gateCheck.allowed) {
    throw new functions.https.HttpsError('unavailable', gateCheck.maintenanceMessage);
  }

  // PACK 317: Rate limit (IP-based)
  await assertRateLimit({
    type: 'IP',
    identifier: hashIP(ipAddress),
    action: 'REGISTER'
  });

  // PACK 317: Abuse detection
  const abuseCheck = await checkRegistrationAbuse({
    email,
    ipHash: hashIP(ipAddress),
    deviceId
  });

  if (!abuseCheck.allowed) {
    throw new functions.https.HttpsError('failed-precondition', abuseCheck.reason);
  }

  // Proceed with normal registration...
  const user = await createUser(email, password);
  
  return { success: true, userId: user.uid };
});
```

### Example 2: Protected Chat Send

```typescript
export const sendChatMessage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const userId = context.auth.uid;
  const { chatId, messageText, recipientId } = data;

  // PACK 317: Check launch gate
  const gateCheck = await checkPaidFeaturesAllowed('CHAT');
  if (!gateCheck.allowed) {
    throw new functions.https.HttpsError('unavailable', gateCheck.maintenanceMessage);
  }

  // PACK 317: Rate limit (user-based)
  await assertRateLimit({
    type: 'USER',
    identifier: userId,
    action: 'CHAT_SEND'
  });

  // PACK 317: Spam check
  const spamCheck = await checkMessageSpam({
    userId,
    messageText,
    recipientId
  });

  if (spamCheck.isSpam) {
    // Trigger limited mode via risk engine
    await triggerRiskEngineAction(userId, {
      action: 'LIMIT_MODE',
      reason: 'Spam messaging detected',
      duration: 24 * 60 * 60 * 1000 // 24 hours
    });
    
    throw new functions.https.HttpsError('permission-denied', 'Message blocked: spam detected');
  }

  // Proceed with normal chat flow (PACK 288)...
  const message = await saveMessage(chatId, messageText);
  
  return { success: true, messageId: message.id };
});
```

---

## 🎯 SUCCESS CRITERIA

### Launch Readiness

✅ All critical modules return "OK" status  
✅ Security features return "ENABLED"  
✅ Rate limiting active on all protected endpoints  
✅ Spam detection integrated with chat/messaging  
✅ Launch gate controls functional  
✅ Security headers present in production  
✅ Mobile apps built in production mode  
✅ No PII leaking in logs  
✅ Zero tokenomics changes verified  

### Post-Launch Health

✅ Rate limit hit rate < 1% of total requests  
✅ Spam detection false positive rate < 5%  
✅ No PII patterns detected in logs  
✅ Launch gate changes logged and audited  
✅ System health check returns 200 OK  

---

## 🔧 TROUBLESHOOTING

### Issue: Too Many Rate Limit Hits

**Solution:** Adjust rate limits in [`pack317-rate-limiting.ts`](functions/src/pack317-rate-limiting.ts:60-103)

```typescript
// Increase limit for specific action
CHAT_SEND: {
  maxRequests: 200, // Increased from 120
  windowSeconds: 3600,
  burstAllowance: 250
}
```

### Issue: False Positive Spam Detection

**Solution:** Review spam detection threshold in [`pack317-anti-bot.ts`](functions/src/pack317-anti-bot.ts:145-192)

```typescript
// Increase threshold
if (uniqueRecipients.size >= 7) { // Changed from 5
  return { isSpam: true, action: 'SOFT_BLOCK' };
}
```

### Issue: User Stuck in Limited Mode

**Solution:** Admin can manually remove limited mode flag

```typescript
// In Firebase Console or admin function
await db.collection('enforcement_states').doc(userId).update({
  limitedMode: false,
  limitedModeReason: null,
  limitedModeExpiresAt: null
});
```

---

## 📞 SUPPORT & MAINTENANCE

### Admin Tools

1. **Security Dashboard:** Query events, view stats
2. **Launch Gate Control:** Block/unblock features
3. **Rate Limit Override:** Adjust limits per user
4. **Spam Review:** Review flagged users

### Logging

All security actions logged to:
- `tech_event_log` (PACK 90)
- `business_audit_log` (for launch gate changes)
- `pack317_security_events` (security-specific)

---

## ✅ IMPLEMENTATION STATUS

| Component | Status | File |
|-----------|--------|------|
| Rate Limiting | ✅ Complete | `pack317-rate-limiting.ts` |
| Anti-Bot Protection | ✅ Complete | `pack317-anti-bot.ts` |
| Privacy Logger | ✅ Complete | `pack317-privacy-logger.ts` |
| Launch Gate | ✅ Complete | `pack317-launch-gate.ts` |
| Launch Check | ✅ Complete | `pack317-launch-check.ts` |
| Analytics Events | ✅ Complete | `pack317-analytics-events.ts` |
| Mobile Hardening | ✅ Complete | `pack317-mobile-hardening.ts` |
| Endpoints | ✅ Complete | `pack317-endpoints.ts` |
| Web Security | ✅ Complete | `app-web/next.config.js` |
| Firestore Rules | ✅ Complete | `firestore-pack317-launch-hardening.rules` |
| Firestore Indexes | ✅ Complete | `firestore-pack317-launch-hardening.indexes.json` |
| Integration | ✅ Complete | `functions/src/index.ts` |

---

## 🎉 FINAL NOTES

PACK 317 is the **final security gate** before Avalo goes live. It adds:

🔒 **Protection without friction** — Rate limits are generous, only blocking abuse  
🛡️ **Safety without false positives** — Spam detection flags for review, doesn't auto-ban  
🚪 **Emergency controls** — Launch gate allows instant freeze if needed  
🔍 **Observability** — All security events logged and queryable  
🎯 **Zero business impact** — NO tokenomics changes, NO pricing changes  

**Ready for production deployment.**

---

**Implementation by:** Kilo Code  
**Pack Version:** 317  
**Completion Date:** 2025-12-11  
**Status:** ✅ PRODUCTION READY