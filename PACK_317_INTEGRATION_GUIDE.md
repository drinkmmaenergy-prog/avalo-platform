# PACK 317 — Integration Guide for Existing Code

Quick reference for integrating PACK 317 security features into existing Avalo endpoints.

---

## 🚀 QUICK START

### 1. Add Rate Limiting to Existing Endpoint

**Before:**
```typescript
export const myFunction = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;
  
  // Your logic here
  return { success: true };
});
```

**After (with PACK 317):**
```typescript
import { assertRateLimit } from './pack317-rate-limiting';

export const myFunction = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;
  
  // PACK 317: Add rate limiting
  await assertRateLimit({
    type: 'USER',
    identifier: userId,
    action: 'CHAT_SEND', // or appropriate action
  });
  
  // Your logic here
  return { success: true };
});
```

---

## 📝 INTEGRATION PATTERNS

### Pattern 1: Auth Functions (Registration/Login)

```typescript
import { assertRateLimit, hashIP } from './pack317-rate-limiting';
import { checkRegistrationAllowed, checkRegistrationAbuse } from './pack317-anti-bot';

export const signup = functions.https.onCall(async (data, context) => {
  const { email, password, deviceId } = data;
  const ipAddress = context.rawRequest.ip || '0.0.0.0';
  
  // Step 1: Check launch gate
  const gateCheck = await checkRegistrationAllowed();
  if (!gateCheck.allowed) {
    throw new functions.https.HttpsError('unavailable', gateCheck.maintenanceMessage);
  }
  
  // Step 2: Rate limit (IP-based for anonymous)
  const ipHash = hashIP(ipAddress);
  await assertRateLimit({ type: 'IP', identifier: ipHash, action: 'REGISTER' });
  
  // Step 3: Abuse detection
  const abuseCheck = await checkRegistrationAbuse({ email, ipHash, deviceId });
  if (!abuseCheck.allowed) {
    throw new functions.https.HttpsError('failed-precondition', abuseCheck.reason);
  }
  
  // Step 4: Create user (existing logic)
  const user = await admin.auth().createUser({ email, password });
  
  return { success: true, userId: user.uid };
});
```

### Pattern 2: Messaging Functions

```typescript
import { assertRateLimit } from './pack317-rate-limiting';
import { checkMessageSpam, triggerRiskEngineAction } from './pack317-anti-bot';
import { checkPaidFeaturesAllowed } from './pack317-launch-gate';

export const sendMessage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;
  const { chatId, messageText, recipientId } = data;
  
  // Step 1: Check launch gate
  const gateCheck = await checkPaidFeaturesAllowed('CHAT');
  if (!gateCheck.allowed) {
    throw new functions.https.HttpsError('unavailable', gateCheck.maintenanceMessage);
  }
  
  // Step 2: Rate limit
  await assertRateLimit({ type: 'USER', identifier: userId, action: 'CHAT_SEND' });
  
  // Step 3: Spam detection
  const spamCheck = await checkMessageSpam({ userId, messageText, recipientId });
  
  if (spamCheck.isSpam) {
    // Trigger limited mode
    await triggerRiskEngineAction(userId, {
      action: 'LIMIT_MODE',
      reason: 'Spam messaging detected',
      duration: 24 * 60 * 60 * 1000, // 24 hours
    });
    
    throw new functions.https.HttpsError('permission-denied', 'Message blocked');
  }
  
  // Step 4: Save message (existing logic from PACK 288)
  const message = await saveMessageToDB(chatId, messageText);
  
  return { success: true, messageId: message.id };
});
```

### Pattern 3: Swipe Functions

```typescript
import { assertRateLimit } from './pack317-rate-limiting';

export const processSwipe = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;
  const { targetUserId, action } = data;
  
  // PACK 317: Backend rate cap (prevents bot abuse)
  await assertRateLimit({
    type: 'USER',
    identifier: userId,
    action: 'SWIPE_ACTION',
  });
  
  // Continue with existing swipe logic (PACK 284)
  // This is ADDITIVE to product limits (50/day + 10/hour)
  const result = await processSwipeAction(userId, targetUserId, action);
  
  return result;
});
```

### Pattern 4: Booking/Event Functions

```typescript
import { assertRateLimit } from './pack317-rate-limiting';
import { checkPaidFeaturesAllowed } from './pack317-launch-gate';

export const bookMeeting = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;
  
  // Step 1: Check launch gate
  const gateCheck = await checkPaidFeaturesAllowed('MEETING');
  if (!gateCheck.allowed) {
    throw new functions.https.HttpsError('unavailable', gateCheck.maintenanceMessage);
  }
  
  // Step 2: Rate limit
  await assertRateLimit({
    type: 'USER',
    identifier: userId,
    action: 'CALENDAR_BOOKING_CREATE',
  });
  
  // Step 3: Create booking (existing logic)
  const booking = await createMeetingBooking(data);
  
  return { success: true, bookingId: booking.id };
});
```

---

## 🔒 PRIVACY-SAFE LOGGING

### Replace Raw Logging

**Before:**
```typescript
console.log('User action:', {
  userId,
  email: user.email,
  phone: user.phone,
  messageText: 'Hello world'
});
```

**After (with PACK 317):**
```typescript
import { logSafeTechEvent } from './pack317-privacy-logger';

await logSafeTechEvent({
  level: 'INFO',
  category: 'FUNCTION',
  functionName: 'myFunction',
  message: 'User action completed',
  context: {
    userId,
    email: user.email,        // Auto-sanitized to 'use***@example.com'
    phone: user.phone,        // Auto-sanitized to '***1234'
    messageText: 'Hello'      // Auto-redacted to '[MESSAGE_REDACTED]'
  }
});
```

### Manual Sanitization

```typescript
import { sanitizeLogDetails } from './pack317-privacy-logger';

const unsafeData = {
  email: 'user@example.com',
  card: '4111111111111111',
  safeField: 'value'
};

const safe = sanitizeLogDetails(unsafeData);
console.log(safe);
// { email: 'use***@example.com', card: '****-****-****-1111', safeField: 'value' }
```

---

## 🚪 LAUNCH GATE USAGE

### Check Before Critical Operations

```typescript
import { checkPaidFeaturesAllowed } from './pack317-launch-gate';

// Before token purchase
const check = await checkPaidFeaturesAllowed('TOKEN_PURCHASE');
if (!check.allowed) {
  return { error: check.reason, message: check.maintenanceMessage };
}

// Before starting paid chat
const chatCheck = await checkPaidFeaturesAllowed('CHAT');
if (!chatCheck.allowed) {
  return { error: chatCheck.reason, message: chatCheck.maintenanceMessage };
}
```

### Admin: Enable Maintenance Mode

```typescript
import { updateLaunchConfig } from './pack317-launch-gate';

// Emergency maintenance (block everything)
await updateLaunchConfig({
  status: 'PRELAUNCH',
  blockNewRegistrations: true,
  blockPaidFeatures: true,
  maintenanceMessage: 'Critical maintenance in progress. Back in 30 minutes.',
  updatedBy: adminUid,
});

// Selective block (e.g., only new chats)
await updateLaunchConfig({
  status: 'OPEN',
  blockNewChats: true,
  maintenanceMessage: 'Chat system upgrading, existing chats work normally.',
  updatedBy: adminUid,
});

// Return to normal
await updateLaunchConfig({
  status: 'OPEN',
  blockNewRegistrations: false,
  blockPaidFeatures: false,
  blockNewChats: false,
  updatedBy: adminUid,
});
```

---

## 📊 MONITORING & ALERTS

### Security Dashboard (Admin Panel)

```typescript
import { getSecurityDashboardStats, querySecurityEvents } from './pack317-analytics-events';

// Get overview stats
const stats = await getSecurityDashboardStats();
console.log('Today:', stats.today);
console.log('Last 7 days:', stats.last7Days);

// Query specific events
const spamEvents = await querySecurityEvents({
  eventType: 'SPAM_SUSPECT_DETECTED',
  startDate: new Date('2025-12-01'),
  limit: 100,
});

console.log(`Found ${spamEvents.total} spam detections`);
```

### Set Up Alerts

Monitor these metrics and alert if thresholds exceeded:

```typescript
// Example alert conditions
if (stats.today.rateLimitHits > 1000) {
  await sendAdminAlert('High rate limit hit count: possible attack');
}

if (stats.today.spamDetections > 50) {
  await sendAdminAlert('High spam detection: review spam suspects');
}

if (stats.today.registrationBlocks > 100) {
  await sendAdminAlert('High registration block rate: check disposable email list');
}
```

---

## 🧪 TESTING CHECKLIST

### Local Testing

1. **Rate Limiting:**
```bash
# Test rate limit enforcement
curl -X POST http://localhost:5001/project/region/pack317_checkRateLimit_callable \
  -H "Content-Type: application/json" \
  -d '{"action":"LOGIN","identifier":"test123","type":"USER"}'
```

2. **Registration Abuse:**
```bash
# Test with disposable email
curl -X POST http://localhost:5001/project/region/pack317_checkRegistration_callable \
  -H "Content-Type: application/json" \
  -d '{"email":"test@tempmail.com","ipAddress":"1.2.3.4"}'
```

3. **Launch Check:**
```bash
# Verify system health
curl http://localhost:5001/project/region/pack317_launchCheck_http
```

### Staging Testing

1. ✅ Create 21 login attempts → verify 21st is blocked
2. ✅ Send same message to 6 users → verify spam detection
3. ✅ Register 6 accounts from same IP → verify 6th is flagged
4. ✅ Check logs contain no raw emails/phones
5. ✅ Enable maintenance mode → verify new signups blocked
6. ✅ Verify launch check returns all "OK"

---

## 🎯 DEPLOYMENT STEPS

### Step 1: Deploy Functions

```bash
# Deploy PACK 317 functions
firebase deploy --only functions:pack317_launchCheck_http
firebase deploy --only functions:pack317_getLaunchConfig_callable
firebase deploy --only functions:pack317_updateLaunchConfig_callable
firebase deploy --only functions:pack317_checkRegistration_callable
firebase deploy --only functions:pack317_checkMessageSpam_callable
firebase deploy --only functions:pack317_querySecurityEvents_callable
firebase deploy --only functions:pack317_getSecurityStats_callable
```

### Step 2: Deploy Firestore Rules & Indexes

```bash
# Deploy security rules
firebase deploy --only firestore:rules

# Deploy indexes
firebase deploy --only firestore:indexes
```

### Step 3: Initialize Launch Config

```typescript
// Run once via Firebase Console or admin script
await db.collection('config').doc('launch').set({
  status: 'PRELAUNCH', // Start in prelaunch
  minPacksRequired: 317,
  blockNewRegistrations: false,
  blockPaidFeatures: false,
  blockNewChats: false,
  blockNewCalls: false,
  blockNewMeetings: false,
  blockNewEvents: false,
  blockTokenPurchases: false,
  updatedAt: admin.firestore.Timestamp.now(),
  updatedBy: 'SYSTEM_INIT',
});
```

### Step 4: Deploy Web App

```bash
cd app-web
npm run build
npm run start

# Verify security headers
curl -I https://your-domain.com
```

### Step 5: Build Mobile Apps

```bash
cd app-mobile

# iOS
eas build --platform ios --profile production

# Android
eas build --platform android --profile production
```

### Step 6: Run Final Verification

```bash
# Check system health
curl https://your-region-your-project.cloudfunctions.net/pack317_launchCheck_http

# Expected response (all OK):
{
  "env": "production",
  "launchStatus": "PRELAUNCH",
  "criticalModules": {
    "auth": "OK",
    "wallet": "OK",
    "chat": "OK",
    ...
  },
  "security": {
    "rateLimiting": "ENABLED",
    "errorTracking": "ENABLED",
    "monitoring": "ENABLED"
  }
}
```

### Step 7: Go Live

```typescript
// When ready, flip to OPEN
await updateLaunchConfig({
  status: 'OPEN',
  blockNewRegistrations: false,
  blockPaidFeatures: false,
  updatedBy: adminUid,
});
```

---

## 🆘 EMERGENCY PROCEDURES

### Emergency: Spam Attack Detected

```typescript
// 1. Enable limited mode for affected users (via admin panel)
await db.collection('enforcement_states').doc(suspiciousUserId).update({
  limitedMode: true,
  limitedModeReason: 'Spam investigation',
  limitedModeExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 24*60*60*1000)
});

// 2. Tighten rate limits temporarily
// Edit pack317-rate-limiting.ts, change CHAT_SEND maxRequests from 120 to 60
// Redeploy functions

// 3. Monitor security dashboard
const stats = await getSecurityDashboardStats();
```

### Emergency: System Under Attack

```typescript
// Enable full lockdown
await updateLaunchConfig({
  status: 'PRELAUNCH',
  blockNewRegistrations: true,
  blockPaidFeatures: true,
  maintenanceMessage: 'System under maintenance for security updates.',
  updatedBy: adminUid,
});

// Existing users can still:
// - Read messages
// - View profiles
// - Access wallet (read-only)

// Blocked:
// - New signups
// - New chats
// - Token purchases
// - Paid actions
```

### Recovery from Lockdown

```typescript
// Gradual recovery (step by step)

// Step 1: Allow existing users, block new signups
await updateLaunchConfig({
  status: 'LIMITED_BETA',
  blockNewRegistrations: true,
  blockPaidFeatures: false, // Allow existing users to use paid features
  updatedBy: adminUid,
});

// Step 2: Monitor for 1 hour, check security stats

// Step 3: Full recovery
await updateLaunchConfig({
  status: 'OPEN',
  blockNewRegistrations: false,
  blockPaidFeatures: false,
  updatedBy: adminUid,
});
```

---

## 📋 CODE REVIEW CHECKLIST

When adding new endpoints, verify:

- [ ] Rate limiting added for user actions
- [ ] Launch gate checked for paid features
- [ ] No raw PII in console.log (use logSafeTechEvent)
- [ ] Error messages don't expose sensitive data
- [ ] IP addresses hashed before storage
- [ ] Spam checks for user-generated content
- [ ] All security events logged properly

---

## 🔍 DEBUGGING

### Check if Rate Limited

```typescript
// In your function, catch rate limit errors
try {
  await assertRateLimit({ type: 'USER', identifier: userId, action: 'CHAT_SEND' });
} catch (error) {
  if (error.code === 'RATE_LIMIT_EXCEEDED') {
    console.log('User rate limited:', error.details);
    // { action: 'CHAT_SEND', retryAfter: 120, resetAt: 1234567890 }
    
    return {
      error: 'RATE_LIMITED',
      retryAfter: error.details.retryAfter,
      message: `Too many requests. Try again in ${error.details.retryAfter} seconds.`
    };
  }
  throw error;
}
```

### Check Launch Gate Status

```typescript
import { getLaunchConfig } from './pack317-launch-gate';

// In any function, check current status
const config = await getLaunchConfig();

if (config.blockNewChats) {
  console.log('New chats are blocked');
  console.log('Reason:', config.maintenanceMessage);
}

console.log('Current launch status:', config.status);
```

### Verify Log Sanitization

```typescript
import { sanitizeLogDetails, validateLogSafety } from './pack317-privacy-logger';

const logData = {
  email: 'user@example.com',
  userId: 'uid123',
  action: 'purchase'
};

const sanitized = sanitizeLogDetails(logData);
const validation = validateLogSafety(sanitized);

console.log('Sanitized:', sanitized);
console.log('Is safe:', validation.safe);
console.log('Violations:', validation.violations);
```

---

## 📞 SUPPORT

### Common Issues

**Issue 1: "RATE_LIMIT_EXCEEDED" errors**
- Check if user is making too many requests
- Review rate limit config for that action
- Increase limits if legitimate use case

**Issue 2: "REGISTRATION_TEMPORARILY_DISABLED"**
- Check launch config: `config/launch`
- Verify `blockNewRegistrations` is false
- Admin can update via `pack317_updateLaunchConfig_callable`

**Issue 3: "Message blocked: spam detected"**
- User sent identical message to 5+ users
- Flag will auto-expire after 24 hours
- Admin can manually remove via enforcement_states

**Issue 4: Launch check returns "FAIL" for module**
- Check that module config exists in Firestore
- Verify module dependencies are deployed
- Review module-specific requirements

---

## 🎓 BEST PRACTICES

### 1. Always Check Launch Gate for Paid Features

```typescript
// Good ✅
const check = await checkPaidFeaturesAllowed('CHAT');
if (!check.allowed) {
  return { error: check.reason };
}

// Bad ❌ (no launch gate check)
await processPayment(userId, amount);
```

### 2. Use Appropriate Rate Limit Type

```typescript
// Good ✅ (user-specific for logged-in actions)
await assertRateLimit({ type: 'USER', identifier: userId, action: 'CHAT_SEND' });

// Good ✅ (IP-based for anonymous actions)
await assertRateLimit({ type: 'IP', identifier: hashIP(ip), action: 'REGISTER' });

// Bad ❌ (using user ID for anonymous action)
await assertRateLimit({ type: 'USER', identifier: 'anonymous', action: 'REGISTER' });
```

### 3. Sanitize All Logs

```typescript
// Good ✅
await logSafeTechEvent({
  level: 'INFO',
  functionName: 'myFunc',
  message: 'Action completed',
  context: { userId, email, phone } // Auto-sanitized
});

// Bad ❌
console.log('User:', { email, phone, messageText }); // Raw PII in logs
```

### 4. Handle Rate Limit Errors Gracefully

```typescript
// Good ✅
try {
  await assertRateLimit({ ... });
  await performAction();
} catch (error) {
  if (error.code === 'RATE_LIMIT_EXCEEDED') {
    return {
      error: 'TOO_MANY_REQUESTS',
      retryAfter: error.details.retryAfter,
      userMessage: `Please wait ${error.details.retryAfter} seconds before trying again.`
    };
  }
  throw error;
}

// Bad ❌
await assertRateLimit({ ... }); // Unhandled error crashes function
```

---

## 🔗 RELATED DOCUMENTATION

- [PACK_317_LAUNCH_HARDENING_IMPLEMENTATION.md](./PACK_317_LAUNCH_HARDENING_IMPLEMENTATION.md) - Full implementation details
- [functions/src/pack317-rate-limiting.ts](functions/src/pack317-rate-limiting.ts) - Rate limiting core
- [functions/src/pack317-anti-bot.ts](functions/src/pack317-anti-bot.ts) - Spam protection
- [functions/src/pack317-launch-gate.ts](functions/src/pack317-launch-gate.ts) - Launch controls
- [functions/src/pack317-launch-check.ts](functions/src/pack317-launch-check.ts) - Health checks

---

**Last Updated:** 2025-12-11  
**Pack Version:** 317  
**Status:** ✅ Ready for Integration