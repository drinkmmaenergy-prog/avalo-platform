# PACK 297 - Pre-Launch Hardening Implementation Guide

## Overview

This pack implements critical pre-launch infrastructure for Avalo, separating STAGING and PRODUCTION environments, adding rate limits and abuse protection, implementing feature flags with kill switches, and establishing monitoring infrastructure.

**Important:** This pack makes **NO ECONOMIC CHANGES**. All existing monetization rules (65/35, 80/20 splits, token prices, package pricing) remain unchanged.

## 1. Environment Separation

### 1.1 Configuration Files

#### Shared Types
- **`shared/types/pack297-environment.ts`** - Environment configuration types and constants for STAGING and PRODUCTION

#### Key Configuration Elements:
```typescript
- STAGING_CONFIG: Development/QA environment
  - Firebase: avalo-staging project
  - API: api-staging.avalo.app
  - Web: web-staging.avalo.app
  - Stripe: Test keys
  - Mon itoring: Debug logs, optional Sentry

- PRODUCTION_CONFIG: Live environment
  - Firebase: avalo-c8c46 project  
  - API: api.avalo.app
  - Web: web.avalo.app
  - Stripe: Live keys
  - Monitoring: Warn-level logs, Sentry enabled
```

### 1.2 Mobile Build Targets

Create two build flavors in mobile app:
- **avalo-staging** - Debug/QA builds
- **avalo** - Production releases

### 1.3 Web Deployments

Separate deployments:
- **web-staging.avalo.app** - Internal testing
- **web.avalo.app** - Public production

## 2. Feature Flags & Kill Switches

### 2.1 Implementation Files

- **`shared/types/pack297-feature-flags.ts`** - Type definitions for feature flags
- **`functions/src/pack297-feature-flags.ts`** - Feature flag service with backend logic

### 2.2 Available Feature Flags

| Flag Key | Description | Default State |
|----------|-------------|---------------|
| `chat_paid_v1` | Paid chat monetization | Enabled globally |
| `calendar_v1` | Calendar booking system | Enabled globally |
| `events_v1` | Events & tickets | Regional rollout (PL, EE, LT, LV) |
| `feed_v1` | Social feed/reels | Enabled globally |
| `ai_assist_v1` | AI assistance features | Limited rollout (20%) |
| `web_token_store_v1` | Web token purchases | Enabled globally |
| `panic_button_v1` | Safety panic button | Enabled globally (critical) |

### 2.3 Feature Flag Logic

Flags support:
- **Environment targeting** (GLOBAL, STAGING, PRODUCTION)
- **Rollout percentage** (0-100% with stable hashing)
- **Country restrictions** (ISO codes array)
- **Version gating** (min/max app version)

### 2.4 Usage Example

```typescript
import { isFeatureEnabled } from './pack297-feature-flags';

const enabled = await isFeatureEnabled('events_v1', {
  userId: 'user123',
  country: 'PL',
  appVersion: '1.0.0',
  environment: 'PRODUCTION'
});

if (!enabled) {
  return createFeatureUnavailableError('Events');
}
```

## 3. Rate Limits & Abuse Protection

### 3.1 Implementation Files

- **`functions/src/pack297-rate-limits.ts`** - Rate limit configuration
- **`functions/src/rateLimit.ts`** - Existing rate limit engine (extended)

### 3.2 Rate Limit Configuration

```typescript
PACK_297_RATE_LIMITS = {
  // Authentication
  'auth:login': {
    perIp: { perHour: 50 },
    perUser: { perHour: 20 },
    hardLimit: true
  },
  
  // Chat & Messaging
  'chat:sendMessage': {
    perUser: { perMinute: 60, perHour: 500 },
    hardLimit: false
  },
  'chat:uploadMedia': {
    perUser: { perHour: 30, perDay: 100 },
    hardLimit: true
  },
  
  // Swipe & Discovery
  'swipe:action': {
    perUser: { perDay: 50 }, // Business rule
    hardLimit: false
  },
  'discovery:search': {
    perUser: { perHour: 60 },
    perIp: { perHour: 200 }
  },
  
  // Calendar & Events
  'calendar:createBooking': {
    perUser: { perDay: 20 },
    hardLimit: true
  },
  'events:purchaseTicket': {
    perUser: { perDay: 50 },
    hardLimit: true
  },
  
  // Wallet & Payments
  'wallet:purchaseTokens': {
    perUser: { perDay: 10 },
    hardLimit: true
  },
  'wallet:requestPayout': {
    perUser: { perDay: 3 },
    hardLimit: true
  },
  
  // Safety
  'safety:reportUser': {
    perUser: { perDay: 20 }
  },
  'safety:panicButton': {
    perUser: { perDay: 5 }
  }
}
```

### 3.3 Anti-Scraping Measures

```typescript
ANTI_SCRAPING_LIMITS = {
  maxResultsPerPage: 50,
  maxPagesPerSession: 20,
  minDelayBetweenRequests: 100, // ms
  maxProfileViewsPerHour: 100,
  maxProfileViewsPerDay: 500
}
```

## 4. User Behavior Tracking

### 4.1 Implementation

- **`functions/src/pack297-behavior-tracking.ts`** - Behavior tracking and abuse detection

### 4.2 Tracked Metrics

```typescript
interface UserBehaviorStats {
  outgoingMessagesLast24h: number;
  uniqueRecipientsLast24h: number;
  safetyReportsAgainstLast30d: number;
  blockedByCountLast30d: number;
  lastMessageSentAt?: Timestamp;
}
```

### 4.3 Abuse Detection Thresholds

```typescript
BEHAVIOR_THRESHOLDS = {
  maxOutgoingMessages24h: 500,
  maxUniqueRecipients24h: 100,
  spamIndicatorMessages: 200,
  spamIndicatorRecipients: 50,
  maxSafetyReports30d: 10,
  maxBlockedBy30d: 20,
  criticalSafetyReports: 5,
  criticalBlockedBy: 10
}
```

### 4.4 Integration Points

Behavior tracking integrates with:
- Chat message sending
- User blocks
- Safety reports
- Risk scoring engine

## 5. Health Checks & Monitoring

### 5.1 Implementation Files

- **`functions/src/pack297-health-check.ts`** - Health check endpoints
- **`functions/src/pack297-monitoring.ts`** - Logging and monitoring utilities

### 5.2 Health Check Endpoints

#### GET /health
Public endpoint for uptime monitoring:
```json
{
  "status": "ok",
  "env": "PRODUCTION",
  "services": {
    "firebase": "ok",
    "stripe": "ok"
  },
  "time": "2024-01-01T00:00:00.000Z"
}
```

#### GET /health/detailed
Admin endpoint with metrics:
```json
{
  "status": "ok",
  "env": "PRODUCTION",
  "services": {
    "firebase": { "status": "ok", "responseTime": "45ms" },
    "stripe": { "status": "ok", "responseTime": "120ms" }
  },
  "metrics": {
    "activeUsers": 1234,
    "pendingTransactions": 5,
    "totalCheckTime": "165ms"
  },
  "time": "2024-01-01T00:00:00.000Z"
}
```

### 5.3 Logging Interface

```typescript
// Unified logging functions
logError(error, context);      // Error tracking
logInfo(message, context);     // Info messages  
logWarn(message, context);     // Warnings
logCritical(message, context); // Critical alerts
logDebug(message, context);    // Debug (staging only)

// Performance monitoring
await withPerformanceMonitoring('operationName', async () => {
  // ... operation
});
```

## 6. Localized Error Messages

### 6.1 Implementation

- **`shared/types/pack297-errors.ts`** - Error codes and localization

### 6.2 Supported Error Codes

```typescript
type ErrorCode =
  | 'rate_limit_exceeded'
  | 'feature_temporarily_unavailable'
  | 'daily_limit_reached'
  | 'too_many_requests'
  | 'account_restricted'
  | 'service_unavailable';
```

### 6.3 Supported Languages

- **English (en)** - Primary language
- **Polish (pl)** - Launch market language

### 6.4 Usage Example

```typescript
import { getLocalizedError, createErrorResponse } from './pack297-errors';

// Get localized error
const error = getLocalizedError('daily_limit_reached', 'pl', {
  hours: getHoursUntilNextDay()
});

// Create API response
const response = createErrorResponse('rate_limit_exceeded', 'en');
```

## 7. Firestore Security & Indexes

### 7.1 Security Rules

- **`firestore-pack297-hardening.rules`** - Security rules for new collections

Key rules:
- Feature flags: Read by authenticated users, write by backend only
- Rate limits: Backend-managed entirely
- Behavior stats: Users can read own, backend writes
- Health check: Internal use only

### 7.2 Indexes

- **`firestore-pack297-hardening.indexes.json`** - Required composite indexes

## 8. Launch Strategy & Rollout Plan

### 8.1 Phase 1: Production Soft Launch

**Target Countries (Eastern & Central Europe):**
- Poland (PL)
- Estonia (EE)
- Lithuania (LT)
- Latvia (LV)
- Ukraine (UA)
- Czech Republic (CZ)
- Slovakia (SK)
- Slovenia (SI)
- Croatia (HR)
- Romania (RO)
- Bulgaria (BG)
- Serbia (RS)

**Enabled Features:**
```typescript
{
  chat_paid_v1: true,        // Full monetization
  calendar_v1: true,         // With 80/20 split
  events_v1: true,           // PL, EE, LT, LV only initially
  feed_v1: true,             // All regions
  ai_assist_v1: true,        // 20% rollout
  web_token_store_v1: true,  // Where payment ready
  panic_button_v1: true      // Safety critical
}
```

### 8.2 Phase 2: Gradual Expansion

Monitor metrics for 2-4 weeks:
- User acquisition rate
- Retention (D1, D7, D30)
- Revenue per user
- Support ticket volume
- Abuse/spam reports

If metrics are healthy:
1. Increase AI Assist rollout to 50%
2. Enable Events in additional countries
3. Expand to Western Europe

### 8.3 Phase 3: Global Rollout

After 2-3 months of stable operation:
- Open to all European countries
- Increase AI Assist to 100%
- Enable all features globally
- Monitor and adjust rate limits based on usage patterns

## 9. Monitoring & Alerts

### 9.1 Key Metrics to Monitor

**System Health:**
- API response times
- Error rates by endpoint
- Database query performance
- Rate limit violations

**User Behavior:**
- New user signups
- Active users (DAU/MAU)
- Average session duration
- Feature adoption rates

**Abuse & Safety:**
- Rate limit violations per hour
- Users flagged for suspicious behavior
- Safety reports per day
- Blocked users

**Business Metrics:**
- Token purchases per day
- Revenue per user
- Payout requests
- Chat engagement

### 9.2 Alert Thresholds

**Critical (Immediate Response):**
- Health check fails
- Error rate > 5%
- Payment processing failures
- Multiple rate limit violations from same IP

**Warning (Monitor Closely):**
- Response time > 2s
- Error rate > 1%
- Unusual spike in new users
- High abuse detection rate

## 10. Deployment Checklist

### 10.1 Backend Deployment

- [ ] Deploy Firebase Functions with PACK 297 functions
- [ ] Update Firestore rules with pack297-hardening.rules
- [ ] Deploy Firestore indexes
- [ ] Initialize default feature flags
- [ ] Set environment variables (FUNCTION_ENV, STRIPE keys, SENTRY_DSN)
- [ ] Verify health check endpoint responds

### 10.2 Mobile Deployment

- [ ] Configure STAGING build flavor
- [ ] Configure PRODUCTION build flavor
- [ ] Update app to load environment config
- [ ] Test feature flag integration
- [ ] Test rate limit error handling
- [ ] Submit to app stores (internal track first)

### 10.3 Web Deployment

- [ ] Deploy to web-staging.avalo.app
- [ ] Test all features with staging config
- [ ] Deploy to web.avalo.app
- [ ] Verify production config loaded
- [ ] Test token store integration

### 10.4 Post-Deployment Verification

- [ ] Health check returns OK
- [ ] Feature flags loading correctly
- [ ] Rate limits enforcing properly
- [ ] Behavior tracking recording stats
- [ ] Localized errors displaying correctly
- [ ] Monitoring logs flowing to Sentry

## 11. Troubleshooting

### 11.1 Feature Unexpectedly Disabled

Check:
1. Feature flag `enabled` field in Firestore
2. Rollout percentage for user's hash
3. User's country in allowed countries
4. App version in range (min/max)
5. Environment matches (STAGING/PRODUCTION)

### 11.2 Rate Limit Too Restrictive

Adjust in `pack297-rate-limits.ts`:
1. Increase limit values
2. Change `hardLimit` to false for soft enforcement
3. Redeploy backend functions
4. Monitor impact

### 11.3 Abuse Detection False Positives

Review thresholds in `pack297-behavior-tracking.ts`:
1. Check user's behavior stats
2. Review safety reports against them
3. Adjust `BEHAVIOR_THRESHOLDS` if needed
4. Consider adding whitelist for power users

### 11.4 Health Check Fails

Investigate:
1. Check Firebase connectivity
2. Verify Stripe API keys
3. Review function logs
4. Check network connectivity
5. Verify environment variables set

## 12. Economics Verification

**PACK 297 MAKES NO ECONOMIC CHANGES:**

✅ Token price remains 0.20 PLN baseline for payouts
✅ Chat earnings split stays 65% creator / 35% platform
✅ Calendar/Events split stays 80% creator / 20% platform
✅ No free tokens introduced
✅ No promotions or discounts added
✅ No changes to chat, voice, video, calendar, or event pricing
✅ No changes to token packages or pricing

This pack **only** adds:
- Environment separation
- Feature control mechanisms
- Abuse protection
- Monitoring infrastructure

## 13. Support & Maintenance

### 13.1 Adjusting Feature Flags

Edit Firestore document directly:
```javascript
db.collection('featureFlags').doc('events_v1').update({
  enabled: false,  // Emergency kill switch
  updatedAt: new Date()
});
```

### 13.2 Adjusting Rate Limits

Edit `functions/src/pack297-rate-limits.ts` and redeploy:
```typescript
'chat:sendMessage': {
  perUser: {
    perMinute: 100,  // Increased from 60
    perHour: 1000    // Increased from 500
  }
}
```

### 13.3 Monitoring Dashboard

Recommended tools:
- **Firebase Console** - Real-time usage and errors
- **Sentry** - Error tracking and performance
- **DataDog/New Relic** - APM and metrics (optional)
- **Custom Dashboard** - Build using admin API

## 14. Files Created

### Shared Types
- `shared/types/pack297-environment.ts` - Environment configuration
- `shared/types/pack297-feature-flags.ts` - Feature flag types
- `shared/types/pack297-errors.ts` - Localized error messages

### Backend Functions
- `functions/src/pack297-feature-flags.ts` - Feature flag service
- `functions/src/pack297-rate-limits.ts` - Rate limit configuration
- `functions/src/pack297-behavior-tracking.ts` - User behavior tracking
- `functions/src/pack297-health-check.ts` - Health check endpoints
- `functions/src/pack297-monitoring.ts` - Logging utilities

### Firestore
- `firestore-pack297-hardening.rules` - Security rules
- `firestore-pack297-hardening.indexes.json` - Database indexes

### Documentation
- `PACK_297_IMPLEMENTATION_GUIDE.md` - This file

## 15. Next Steps

After PACK 297 deployment:

1. **Monitor for 1 week** - Observe all metrics, fix issues
2. **Adjust limits** - Fine-tune based on real usage patterns
3. **User feedback** - Collect and address any UX concerns
4. **Scale testing** - Verify system handles expected load
5. **Regional expansion** - Gradually enable more countries
6. **Feature optimization** - Improve performance of popular features

---

**Implementation Status:** ✅ COMPLETE
**Economic Changes:** ✅ NONE (as required)
**Ready for Deployment:** ✅ YES after testing