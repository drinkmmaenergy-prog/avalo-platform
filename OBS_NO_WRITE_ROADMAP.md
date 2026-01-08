# 📊 AVALO OBSERVABILITY ROADMAP
**Role:** Observability Lead  
**Mode:** READ-ONLY Analysis  
**Date:** 2025-11-09  
**Status:** ⚠️ CRITICAL OBSERVABILITY GAPS IDENTIFIED

---

## 📋 EXECUTIVE SUMMARY

Avalo currently operates with **basic custom monitoring** but lacks enterprise-grade observability. This document outlines a comprehensive plan to implement industry-standard monitoring, error tracking, performance analytics, and cost optimization across all platforms.

### 🎯 Current State
- ✅ Custom monitoring with auto-rollback
- ✅ Firebase Console access
- ❌ **NO error tracking** (Sentry/Bugsnag)
- ❌ **NO APM** for mobile/web
- ⚠️ **LIMITED metrics** collection
- ⚠️ **NO cost monitoring** automation

### 🚨 Critical Gaps
1. **No Real-Time Error Tracking:** Errors go undetected until users report
2. **No Performance Insights:** Can't diagnose slow queries or bottlenecks
3. **No Cost Visibility:** Firestore/Storage costs unknown until billing arrives
4. **Limited Alerting:** Only basic endpoint health checks
5. **No User Experience Monitoring:** Don't know actual user performance

---

## 📊 SECTION 1: CURRENT OBSERVABILITY STACK ANALYSIS

### 1.1 What We Have

#### ✅ Custom Monitoring System
**Location:** [`monitoring/`](monitoring/)  
**Components:**
- Endpoint health checks (5 endpoints)
- Auto-rollback on failures
- Discord + Email alerts
- Basic metrics collection

**Configuration:** [`monitoring/config.ts`](monitoring/config.ts:1-160)
```typescript
// Current monitoring endpoints
- Production Website (avalo-c8c46.web.app)
- Health Check (/ping)
- System Info API
- Exchange Rates API
- Purchase Tokens API

// Thresholds
- maxResponseTime: 1500ms
- criticalResponseTime: 3000ms
- consecutiveFailuresForRollback: 3
- checkInterval: 5 minutes
```

**Strengths:**
- ✅ Automated rollback capability
- ✅ Basic uptime monitoring
- ✅ Response time tracking
- ✅ Alert notifications

**Weaknesses:**
- ❌ Only monitors 5 endpoints (100+ functions exist)
- ❌ No error stack traces
- ❌ No performance profiling
- ❌ No user experience data
- ❌ No cost tracking

#### ✅ Firebase Built-in Tools
**Available but Underutilized:**

1. **Firebase Console**
   - Function logs (basic)
   - Firestore usage stats
   - Storage usage
   - Real-time database monitoring

2. **Firebase Performance SDK** (installed but not configured)
   - [`@firebase/performance`](package-lock.json:5021) in dependencies
   - [`@firebase/performance-compat`](package-lock.json:5038) available
   - **Status:** ❌ NOT INSTRUMENTED

3. **Firebase Analytics SDK** (installed but minimal usage)
   - [`@firebase/analytics`](package-lock.json:4027) in dependencies
   - [`@firebase/analytics-compat`](package-lock.json:4043) available
   - **Status:** ⚠️ BASIC USAGE ONLY

4. **Google Cloud Monitoring** (accessible but not integrated)
   - Cloud Functions metrics
   - Firestore metrics
   - Cloud Storage metrics
   - **Status:** ❌ NOT CONFIGURED FOR ALERTS

#### ❌ What We DON'T Have

1. **Error Tracking Platforms**
   - ❌ No Sentry
   - ❌ No Bugsnag
   - ❌ No Rollbar
   - ❌ No custom error aggregation

2. **Application Performance Monitoring (APM)**
   - ❌ No distributed tracing
   - ❌ No transaction profiling
   - ❌ No database query analysis

3. **Real User Monitoring (RUM)**
   - ❌ No client-side performance tracking
   - ❌ No mobile app performance metrics
   - ❌ No web vitals collection

4. **Cost Monitoring**
   - ❌ No automated cost alerts
   - ❌ No per-feature cost allocation
   - ❌ No anomaly detection

---

## 🔴 SECTION 2: SENTRY/BUGSNAG IMPLEMENTATION PLAN

### 2.1 Platform Selection

**Recommendation: SENTRY** (industry standard, better Firebase integration)

#### Why Sentry over Bugsnag?
| Feature | Sentry | Bugsnag |
|---------|--------|---------|
| **Pricing** | Free tier: 5k errors/month | Free tier: 7.5k errors/month |
| **Firebase Integration** | ✅ Excellent | ⚠️ Basic |
| **Performance Monitoring** | ✅ Built-in | ❌ Limited |
| **Release Tracking** | ✅ Advanced | ✅ Good |
| **Source Maps** | ✅ Automatic | ⚠️ Manual |
| **Community** | ✅ Larger | ⚠️ Smaller |

**Decision:** Implement Sentry across all platforms.

### 2.2 Sentry Setup - Mobile (React Native)

**Priority:** 🔴 CRITICAL  
**Estimated Setup Time:** 2-4 hours  

#### Installation
```bash
cd app-mobile
npm install --save @sentry/react-native
npx @sentry/wizard -i reactNative -p ios android
```

#### Configuration
**New File:** `app-mobile/sentry.config.ts`
```typescript
import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

export function initSentry() {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    
    // Environment
    environment: __DEV__ ? "development" : "production",
    
    // Release tracking
    release: Constants.expoConfig?.version || "1.0.0",
    dist: Constants.expoConfig?.ios?.buildNumber || 
          Constants.expoConfig?.android?.versionCode?.toString(),
    
    // Performance Monitoring
    tracesSampleRate: __DEV__ ? 1.0 : 0.2, // 20% in production
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 30000, // 30 seconds
    
    // Error tracking
    beforeSend(event, hint) {
      // Filter sensitive data
      if (event.request) {
        delete event.request.cookies;
      }
      return event;
    },
    
    // Network tracking
    enableNative: true,
    enableNativeCrashHandling: true,
    enableAutoPerformanceTracing: true,
    
    // Attachments
    attachStacktrace: true,
    attachScreenshot: true,
    
    // Integrations
    integrations: [
      new Sentry.ReactNativeTracing({
        routingInstrumentation: new Sentry.ReactNavigationInstrumentation(),
        tracingOrigins: [
          "localhost",
          "europe-west3-avalo-c8c46.cloudfunctions.net",
          /^\//,
        ],
      }),
    ],
  });
}
```

#### App Integration
**File:** [`app-mobile/App.tsx`](app-mobile/App.tsx:1-33)
```typescript
import { initSentry } from './sentry.config';

// Initialize Sentry BEFORE React
initSentry();

export default Sentry.wrap(App);
```

#### Environment Variables
**File:** `app-mobile/.env`
```bash
EXPO_PUBLIC_SENTRY_DSN=https://xxx@yyy.ingest.sentry.io/zzz
EXPO_PUBLIC_SENTRY_ORG=avalo
EXPO_PUBLIC_SENTRY_PROJECT=avalo-mobile
```

### 2.3 Sentry Setup - Web (Next.js)

**Priority:** 🔴 CRITICAL  
**Estimated Setup Time:** 2-3 hours  

#### Installation
```bash
cd app-web
npm install --save @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

#### Configuration
**New File:** `app-web/sentry.client.config.ts`
```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  environment: process.env.NODE_ENV,
  
  tracesSampleRate: 0.1, // 10% performance traces
  
  replaysSessionSampleRate: 0.1, // 10% sessions
  replaysOnErrorSampleRate: 1.0, // 100% on error
  
  integrations: [
    new Sentry.Replay({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
});
```

**New File:** `app-web/sentry.server.config.ts`
```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  tracesSampleRate: 0.1,
  
  // Server-specific options
  debug: false,
});
```

#### Next.js Config Update
**File:** [`app-web/next.config.js`](app-web/next.config.js:1-23)
```javascript
const { withSentryConfig } = require('@sentry/nextjs');

const nextConfig = {
  // ... existing config
  
  sentry: {
    hideSourceMaps: true,
    widenClientFileUpload: true,
  },
};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  org: "avalo",
  project: "avalo-web",
});
```

### 2.4 Sentry Setup - Cloud Functions

**Priority:** 🔴 CRITICAL  
**Estimated Setup Time:** 3-4 hours  

#### Installation
```bash
cd functions
npm install --save @sentry/node @sentry/profiling-node
```

#### Configuration
**New File:** `functions/src/sentry.ts`
```typescript
import * as Sentry from "@sentry/node";
import { ProfilingIntegration } from "@sentry/profiling-node";

export function initSentry() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    
    environment: process.env.FIREBASE_CONFIG ? "production" : "development",
    
    // Performance & Profiling
    tracesSampleRate: 0.1, // 10% traces
    profilesSampleRate: 0.1, // 10% profiles
    
    integrations: [
      new ProfilingIntegration(),
    ],
    
    // Context capture
    beforeSend(event, hint) {
      // Add Cloud Functions context
      event.contexts = {
        ...event.contexts,
        runtime: {
          name: "Cloud Functions",
          version: process.version,
        },
      };
      return event;
    },
  });
}

// Wrap Cloud Function handlers
export function sentryWrapper(handler: any) {
  return Sentry.wrapCloudEventFunction(handler);
}
```

#### Function Integration
**File:** [`functions/src/index.ts`](functions/src/index.ts:1-430)
```typescript
import { initSentry, sentryWrapper } from "./sentry";

// Initialize Sentry FIRST
initSentry();

// Wrap critical functions
export const stripeWebhook = sentryWrapper(
  onRequest(
    { /* config */ },
    async (req, res) => {
      // Implementation
    }
  )
);

// Manual error capture
export const purchaseTokensV2 = onCall(
  { /* config */ },
  async (request) => {
    try {
      // Implementation
    } catch (error) {
      Sentry.captureException(error, {
        tags: { 
          userId: request.auth?.uid,
          function: "purchaseTokensV2" 
        },
      });
      throw error;
    }
  }
);
```

### 2.5 Sentry Cost Estimation

**Monthly Costs (50k MAU):**
```
FREE TIER:
- 5,000 errors/month: $0
- Limited performance monitoring

TEAM PLAN ($26/month):
- 50,000 errors/month
- 100,000 performance traces/month
- 50 replays/month
- Source map uploads
- Release tracking

BUSINESS PLAN ($80/month):
- 250,000 errors/month
- 500,000 performance traces/month
- 500 replays/month
- Advanced features
- Priority support

RECOMMENDATION: Start with Team Plan ($26/month)
```

### 2.6 Verification Steps

```bash
# 1. Deploy with Sentry
npm run deploy

# 2. Trigger test errors
curl -X POST https://your-function.com/test-error

# 3. Check Sentry dashboard
# - Verify errors appear
# - Check source maps work
# - Validate stack traces

# 4. Test performance traces
# - Check transaction list
# - Verify timing data
# - Validate sampling rate
```

---

## 🔵 SECTION 3: FIREBASE PERFORMANCE MONITORING

### 3.1 Mobile Performance Monitoring

**Priority:** 🟡 HIGH  
**Files:** [`app-mobile/App.tsx`](app-mobile/App.tsx), [`app-mobile/config/firebase.ts`](app-mobile/config/firebase.ts)

#### Setup
```typescript
// app-mobile/config/firebase.ts
import { getPerformance } from 'firebase/performance';

const performance = getPerformance(app);

// Enable data collection
performance.dataCollectionEnabled = true;
performance.instrumentationEnabled = true;
```

#### Custom Traces
```typescript
// Track screen load time
import { trace } from 'firebase/performance';

function FeedScreen() {
  useEffect(() => {
    const loadTrace = trace(performance, 'feed_screen_load');
    loadTrace.start();
    
    // Measure data load
    const dataTrace = trace(performance, 'feed_data_fetch');
    dataTrace.start();
    
    fetchFeedData().then(() => {
      dataTrace.stop();
      loadTrace.stop();
    });
  }, []);
}
```

#### Network Monitoring
```typescript
// Automatically tracks:
// - API calls
// - Response times
// - Success/failure rates
// - Payload sizes
```

### 3.2 Web Performance Monitoring

**Priority:** 🟡 HIGH  
**Files:** [`app-web/src/app/layout.tsx`](app-web/src/app/layout.tsx)

#### Setup
```typescript
// app-web/src/lib/firebase.ts
import { getPerformance } from 'firebase/performance';

export const performance = getPerformance(firebaseApp);
```

#### Web Vitals Integration
```typescript
// app-web/src/app/layout.tsx
import { onCLS, onFID, onLCP, onFCP, onTTFB } from 'web-vitals';
import { trace } from 'firebase/performance';

function reportWebVitals() {
  onCLS((metric) => {
    const t = trace(performance, 'CLS');
    t.putMetric(metric.name, metric.value);
    t.start();
    t.stop();
  });
  
  onFID((metric) => {
    const t = trace(performance, 'FID');
    t.putMetric(metric.name, metric.value);
    t.start();
    t.stop();
  });
  
  onLCP((metric) => {
    const t = trace(performance, 'LCP');
    t.putMetric(metric.name, metric.value);
    t.start();
    t.stop();
  });
}
```

### 3.3 Custom Metrics

**Critical Paths to Monitor:**

```typescript
// 1. Authentication Flow
const authTrace = trace(performance, 'auth_flow');
authTrace.putAttribute('auth_method', 'email');
authTrace.start();
// ... auth logic
authTrace.stop();

// 2. Payment Flow
const paymentTrace = trace(performance, 'token_purchase');
paymentTrace.putMetric('amount', tokenAmount);
paymentTrace.putAttribute('currency', currency);
paymentTrace.start();
// ... payment logic
paymentTrace.stop();

// 3. Content Loading
const contentTrace = trace(performance, 'content_load');
contentTrace.putMetric('item_count', posts.length);
contentTrace.start();
// ... load content
contentTrace.stop();
```

---

## 🟠 SECTION 4: CLOUD MONITORING & LOGGING

### 4.1 Google Cloud Monitoring Setup

**Priority:** 🔴 CRITICAL  
**Cost:** Included in Firebase plan + $0.50/GB logs

#### Enable APIs
```bash
gcloud services enable monitoring.googleapis.com
gcloud services enable logging.googleapis.com
gcloud services enable cloudtrace.googleapis.com
```

#### Cloud Functions Metrics

**Automatic Metrics Available:**
- ✅ Invocations per second
- ✅ Execution time (p50/p95/p99)
- ✅ Memory usage
- ✅ Active instances
- ✅ Error rate
- ✅ Network egress

**Configuration:** Access via Firebase Console > Functions > Metrics

### 4.2 Structured Logging Implementation

**Priority:** 🟡 HIGH  
**Files:** All Cloud Functions

#### Create Logging Utility
**New File:** `functions/src/logging.ts`
```typescript
import { logger } from "firebase-functions/v2";

export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARNING = "warning",
  ERROR = "error",
  CRITICAL = "critical",
}

export interface LogContext {
  userId?: string;
  requestId?: string;
  functionName?: string;
  duration?: number;
  [key: string]: any;
}

export class StructuredLogger {
  private context: LogContext;
  
  constructor(context: LogContext = {}) {
    this.context = context;
  }
  
  log(level: LogLevel, message: string, data?: any) {
    const logEntry = {
      message,
      ...this.context,
      ...data,
      timestamp: new Date().toISOString(),
    };
    
    switch (level) {
      case LogLevel.DEBUG:
        logger.debug(logEntry);
        break;
      case LogLevel.INFO:
        logger.info(logEntry);
        break;
      case LogLevel.WARNING:
        logger.warn(logEntry);
        break;
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        logger.error(logEntry);
        break;
    }
  }
  
  info(message: string, data?: any) {
    this.log(LogLevel.INFO, message, data);
  }
  
  error(message: string, error: Error, data?: any) {
    this.log(LogLevel.ERROR, message, {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      ...data,
    });
  }
  
  // Performance logging
  performance(operation: string, duration: number, data?: any) {
    this.log(LogLevel.INFO, `Performance: ${operation}`, {
      duration,
      operation,
      ...data,
    });
  }
}
```

#### Usage in Functions
```typescript
// Example: Payment function with structured logging
export const purchaseTokensV2 = onCall(async (request) => {
  const log = new StructuredLogger({
    userId: request.auth?.uid,
    functionName: "purchaseTokensV2",
    requestId: crypto.randomUUID(),
  });
  
  const startTime = Date.now();
  
  try {
    log.info("Purchase initiated", {
      amount: request.data.amount,
      currency: request.data.currency,
    });
    
    // ... processing
    
    log.performance("purchase_complete", Date.now() - startTime, {
      tokenAmount: result.tokens,
    });
    
    return result;
  } catch (error) {
    log.error("Purchase failed", error as Error, {
      amount: request.data.amount,
    });
    throw error;
  }
});
```

### 4.3 Log-Based Metrics

**Create Custom Metrics from Logs:**

```bash
# 1. Payment success rate
gcloud logging metrics create payment_success_rate \
  --description="Payment success rate" \
  --log-filter='resource.type="cloud_function"
    AND jsonPayload.operation="purchase_complete"'

# 2. Average response time
gcloud logging metrics create avg_response_time \
  --description="Average function response time" \
  --log-filter='resource.type="cloud_function"
    AND jsonPayload.duration>0' \
  --value-extractor='EXTRACT(jsonPayload.duration)'

# 3. Error rate by function
gcloud logging metrics create function_error_rate \
  --description="Error rate per function" \
  --log-filter='resource.type="cloud_function"
    AND severity="ERROR"'
```

---

## 🟣 SECTION 5: KEY METRICS & SLIs

### 5.1 Service Level Indicators (SLIs)

#### **Availability SLI**
```
Target: 99.9% uptime (43 minutes downtime/month allowed)

Measurement:
- Successful requests / Total requests
- Window: Rolling 30 days
- Threshold: > 99.9%

Query:
SELECT
  COUNT(*) as total_requests,
  COUNTIF(status_code < 500) as successful_requests,
  (COUNTIF(status_code < 500) / COUNT(*)) * 100 as availability
FROM logs
WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
```

#### **Latency SLI (p50/p95/p99)**
```
Targets:
- p50 latency: < 200ms
- p95 latency: < 500ms
- p99 latency: < 1000ms

Measurement per endpoint:
- ping: p95 < 100ms
- getExchangeRatesV1: p95 < 500ms
- purchaseTokensV2: p95 < 1000ms
- stripeWebhook: p95 < 200ms (CRITICAL)

Dashboard Query:
SELECT
  function_name,
  APPROX_QUANTILES(execution_time_ms, 100)[OFFSET(50)] as p50,
  APPROX_QUANTILES(execution_time_ms, 100)[OFFSET(95)] as p95,
  APPROX_QUANTILES(execution_time_ms, 100)[OFFSET(99)] as p99
FROM function_metrics
WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
GROUP BY function_name
```

#### **Error Rate SLI**
```
Target: < 1% error rate

Measurement:
- 5xx errors / Total requests
- Window: Rolling 1 hour
- Threshold: < 1%

Alert Conditions:
- 🟡 WARNING: > 0.5%
- 🔴 CRITICAL: > 1%
- 🚨 INCIDENT: > 5%
```

#### **Cold Start Rate SLI**
```
Target: < 5% of requests experience cold starts

Measurement:
- Cold start instances / Total invocations
- Window: Rolling 1 hour

Cold Start Definition:
- First invocation after instance scale-up
- Execution time > 3x median

Query:
SELECT
  COUNT(*) as total_invocations,
  COUNTIF(is_cold_start) as cold_starts,
  (COUNTIF(is_cold_start) / COUNT(*)) * 100 as cold_start_rate
FROM function_invocations
WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
```

### 5.2 Cost Metrics (Critical!)

#### **Firestore Cost Tracking**
```
Daily Budget: $5/day ($150/month)

Metrics to Track:
1. Document Reads: Target < 10M/day
2. Document Writes: Target < 2M/day
3. Document Deletes: Target < 500k/day
4. Storage: Target < 10GB

Cost Calculation:
- Reads: $0.06 per 100k
- Writes: $0.18 per 100k
- Deletes: $0.02 per 100k
- Storage: $0.18/GB/month

Alert Thresholds:
- 🟡 WARNING: 70% of daily budget ($3.50/day)
- 🔴 CRITICAL: 90% of daily budget ($4.50/day)
- 🚨 INCIDENT: 100% of daily budget ($5/day)
```

#### **Cloud Functions Cost Tracking**
```
Monthly Budget: $100/month

Metrics to Track:
1. Invocations: Target < 5M/month
2. Compute Time: Target < 400k GB-seconds/month
3. Network Egress: Target < 10GB/month

Cost Calculation:
- Invocations: $0.40 per 1M
- Compute: $0.0000025 per GB-second
- Network: $0.12/GB (first 5GB free)

Alert Thresholds:
- 🟡 WARNING: $70/month
- 🔴 CRITICAL: $90/month
- 🚨 INCIDENT: $100/month
```

#### **Cloud Storage Cost Tracking**
```
Monthly Budget: $10/month

Metrics to Track:
1. Storage Used: Target < 50GB
2. Downloads: Target < 100GB/month
3. Operations: Target < 1M/month

Cost Calculation:
- Storage: $0.026/GB/month
- Download: $0.12/GB
- Class A ops: $0.05 per 10k
- Class B ops: $0.004 per 10k

Alert Thresholds:
- 🟡 WARNING: $7/month
- 🔴 CRITICAL: $9/month
```

### 5.3 Business Metrics

#### **User Experience Metrics**
```
1. App Crash Rate: < 0.1%
2. ANR Rate (Android): < 0.1%
3. API Success Rate: > 99.5%
4. Payment Success Rate: > 99%
5. Sign-up Completion Rate: > 60%
```

#### **Performance Benchmarks**
```
Mobile App:
- App Start Time: < 2s (p50), < 4s (p95)
- Screen Load Time: < 1s (p50), < 2s (p95)
- API Response Time: < 500ms (p50), < 1000ms (p95)

Web App:
- First Contentful Paint: < 1.8s
- Largest Contentful Paint: < 2.5s
- Time to Interactive: < 3.8s
- Cumulative Layout Shift: < 0.1

Backend:
- Function Cold Start: < 2s (p95)
- Function Warm Start: < 200ms (p95)
- Database Query: < 100ms (p95)
```

---

## 🔴 SECTION 6: ALERTING STRATEGY

### 6.1 Alert Channels

#### **1. Slack Integration** (Recommended)
**Priority:** 🔴 CRITICAL  
**Setup Time:** 30 minutes  

```typescript
// New file: functions/src/alerts/slack.ts
export async function sendSlackAlert(alert: {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  metric?: string;
  value?: number;
  threshold?: number;
}) {
  const color = {
    info: '#36a64f',
    warning: '#ff9800',
    critical: '#f44336',
  }[alert.severity];
  
  const webhook = process.env.SLACK_WEBHOOK_URL;
  
  await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'Avalo Monitoring',
      icon_emoji: ':chart_with_upwards_trend:',
      attachments: [{
        color,
        title: alert.title,
        text: alert.message,
        fields: alert.metric ? [{
          title: 'Metric',
          value: `${alert.metric}: ${alert.value} (threshold: ${alert.threshold})`,
          short: false,
        }] : [],
        footer: 'Avalo Monitoring',
        ts: Math.floor(Date.now() / 1000),
      }],
    }),
  });
}
```

**Slack Channels:**
```
#alerts-critical    → All P0/P1 incidents
#alerts-warnings    → Performance degradation, cost overruns
#alerts-info        → Deployments, capacity changes
#dev-team           → For development alerts
#ops-team           → For infrastructure alerts
```

#### **2. Email Alerts** (Existing)
**Status:** ✅ CONFIGURED  
**Provider:** SendGrid  
**Config:** [`monitoring/config.ts`](monitoring/config.ts:134-146)

```typescript
// Already configured:
email: {
  enabled: !!process.env.SENDGRID_API_KEY,
  sendgridApiKey: process.env.SENDGRID_API_KEY,
  fromEmail: 'monitoring@avaloapp.com',
  toEmails: process.env.ALERT_TO_EMAILS.split(','),
}
```

#### **3. Discord Webhook** (Existing)
**Status:** ✅ CONFIGURED  
**Config:** [`monitoring/config.ts`](monitoring/config.ts:134-146)

```typescript
discord: {
  enabled: !!process.env.MONITORING_DISCORD_WEBHOOK,
  webhookUrl: process.env.MONITORING_DISCORD_WEBHOOK,
}
```

#### **4. PagerDuty Integration** (Optional)
**Priority:** 🟢 LOW (for later)  
**Use Case:** 24/7 on-call rotation  
**Cost:** $21/user/month  

### 6.2 Alert Rules

#### **Availability Alerts**

**Rule 1: Service Down (P0 - Critical)**
```yaml
name: service_down_critical
condition: uptime < 99.9% over 5 minutes
severity: CRITICAL
channels: [slack-critical, email, pagerduty]
action: auto-rollback
message: "🚨 CRITICAL: Service availability dropped to {uptime}%"
runbook: https://wiki.avalo.com/runbooks/service-down
```

**Rule 2: High Error Rate (P1 - High)**
```yaml
name: high_error_rate
condition: error_rate > 1% over 10 minutes
severity: HIGH
channels: [slack-critical, email]
action: investigate
message: "🔴 HIGH: Error rate at {error_rate}% (threshold: 1%)"
runbook: https://wiki.avalo.com/runbooks/high-errors
```

**Rule 3: Elevated Error Rate (P2 - Medium)**
```yaml
name: elevated_error_rate
condition: error_rate > 0.5% over 15 minutes
severity: MEDIUM
channels: [slack-warnings]
action: monitor
message: "🟡 MEDIUM: Error rate at {error_rate}% (threshold: 0.5%)"
```

#### **Performance Alerts**

**Rule 4: Slow Response Time (P1 - High)**
```yaml
name: slow_response_time
condition: p95_latency > 1000ms over 5 minutes
severity: HIGH
channels: [slack-critical, email]
action: investigate
message: "🔴 HIGH: p95 latency at {p95_latency}ms (threshold: 1000ms)"
runbook: https://wiki.avalo.com/runbooks/slow-performance
```

**Rule 5: High Cold Start Rate (P2 - Medium)**
```yaml
name: high_cold_start_rate
condition: cold_start_rate > 10% over 15 minutes
severity: MEDIUM
channels: [slack-warnings]
action: increase_min_instances
message: "🟡 MEDIUM: Cold start rate at {cold_start_rate}% (threshold: 10%)"
runbook: https://wiki.avalo.com/runbooks/cold-starts
```

#### **Cost Alerts**

**Rule 6: High Firestore Cost (P2 - Medium)**
```yaml
name: high_firestore_cost
condition: daily_firestore_cost > $3.50
severity: MEDIUM
channels: [slack-warnings, email]
action: review_queries
message: "💰 MEDIUM: Firestore cost at ${daily_cost}/day (threshold: $3.50)"
runbook: https://wiki.avalo.com/runbooks/cost-optimization
```

**Rule 7: Budget Exceeded (P1 - High)**
```yaml
name: budget_exceeded
condition: daily_cost > daily_budget
severity: HIGH
channels: [slack-critical, email]
action: rate_limit
message: "🚨 HIGH: Daily budget exceeded! ${daily_cost} > ${daily_budget}"
runbook: https://wiki.avalo.com/runbooks/budget-exceeded
```

#### **Security Alerts**

**Rule 8: Failed Authentication Spike (P1 - High)**
```yaml
name: auth_failure_spike
condition: failed_auth_rate > 10% over 5 minutes
severity: HIGH
channels: [slack-critical, email]
action: investigate
message: "🔐 HIGH: Authentication failure spike detected ({failed_auth_rate}%)"
runbook: https://wiki.avalo.com/runbooks/auth-anomaly
```

**Rule 9: Suspicious Payment Activity (P0 - Critical)**
```yaml
name: suspicious_payments
condition: payment_failures > 10 consecutive OR
           payment_velocity > 100/minute
severity: CRITICAL
channels: [slack-critical, email, pagerduty]
action: lock_payments
message: "🚨 CRITICAL: Suspicious payment activity detected"
runbook: https://wiki.avalo.com/runbooks/payment-fraud
```

### 6.3 Alerting Thresholds Summary

| Metric | WARNING | CRITICAL | INCIDENT |
|--------|---------|----------|----------|
| **Availability** | < 99.95% | < 99.9% | < 99% |
| **Error Rate** | > 0.5% | > 1% | > 5% |
| **p95 Latency** | > 800ms | > 1000ms | > 2000ms |
| **Cold Starts** | > 10% | > 20% | > 30% |
| **Firestore Cost** | > $3.50/day | > $4.50/day | > $5/day |
| **Functions Cost** | > $70/month | > $90/month | > $100/month |
| **Memory Usage** | > 80% | > 90% | > 95% |
| **Failed Auth** | > 5% | > 10% | > 20% |

### 6.4 Alert Fatigue Prevention

**Principles:**
1. ✅ **Group correlated alerts** (e.g., don't send 100 alerts for same issue)
2. ✅ **Use severity levels** appropriately
3. ✅ **Set proper thresholds** (not t oo sensitive)
4. ✅ **Include actionable context** in every alert
5. ✅ **Auto-resolve** when condition clears

**Implementation:**
```typescript
// Alert deduplication (5-minute window)
const alertCache = new Map<string, number>();

function shouldSendAlert(alertKey: string): boolean {
  const lastSent = alertCache.get(alertKey);
  if (lastSent && Date.now() - lastSent < 300000) {
    return false; // Already sent within 5 minutes
  }
  alertCache.set(alertKey, Date.now());
  return true;
}
```

---

## 📘 SECTION 7: RUNBOOKS

### 7.1 Runbook Template

```markdown
# Runbook: {TITLE}

## Overview
- **Severity:** P0/P1/P2/P3
- **Service:** Mobile/Web/Functions
- **Symptoms:** What users/monitors see
- **Impact:** Business/user impact

## Diagnosis
1. Check {monitoring dashboard link}
2. Query logs: `{log query}`
3. Look for {specific indicators}

## Resolution Steps
1. **Immediate action:** {quick fix}
2. **Investigation:** {how to diagnose root cause}
3. **Fix:** {permanent solution}
4. **Verification:** {how to confirm fixed}

## Prevention
- Long-term solution
- Monitoring improvements
- Code changes needed

## Escalation
- On-call: {contact}
- Slack: {channel}
- Email: {distribution list}
```

### 7.2 Critical Runbooks (To Create)

**Required Runbooks:**
1. ✅ `runbooks/service-down.md` - Service unavailable
2. ✅ `runbooks/high-errors.md` - Error rate spike
3. ✅ `runbooks/slow-performance.md` - Latency issues
4. ✅ `runbooks/cold-starts.md` - High cold start rate
5. ✅ `runbooks/cost-optimization.md` - Cost overruns
6. ✅ `runbooks/budget-exceeded.md` - Budget alerts
7. ✅ `runbooks/auth-anomaly.md` - Authentication issues
8. ✅ `runbooks/payment-fraud.md` - Suspicious payments
9. ✅ `runbooks/database-slow.md` - Firestore performance
10. ✅ `runbooks/memory-leak.md` - Memory issues

**Example Runbook:**
```markdown
# Runbook: Service Down

## Overview
- **Severity:** P0 (Critical)
- **Service:** All (Cloud Functions)
- **Symptoms:** HTTP 500/502/503 errors, timeouts
- **Impact:** Users cannot access platform

## Diagnosis
1. Check monitoring dashboard: https://console.cloud.google.com/monitoring
2. Query recent deployments:
   ```bash
   gcloud functions list --filter="updateTime>-1h"
   ```
3. Check error logs:
   ```bash
   gcloud logging read "severity>=ERROR" --limit 50
   ```

## Resolution Steps

### 1. Immediate Action (< 5 minutes)
- Trigger rollback:
  ```bash
  cd monitoring
  npm run rollback
  ```
- Notify team in #alerts-critical

### 2. Investigation (5-15 minutes)
- Identify failed function:
  ```bash
  gcloud functions describe {function-name} --gen2
  ```
- Check recent changes:
  ```bash
  git log --since="1 hour ago"
  ```

### 3. Fix (15-30 minutes)
- If deployment issue: Rollback to last known good version
- If dependency issue: Check package.json changes
- If config issue: Verify environment variables

### 4. Verification (5 minutes)
- Test critical endpoints:
  ```bash
  curl https://europe-west3-avalo-c8c46.cloudfunctions.net/ping
  ```
- Monitor error rate drops below 1%
- Check user reports stop coming in

## Prevention
- [ ] Add integration tests for this scenario
- [ ] Improve deployment validation
- [ ] Set up canary deployments

## Escalation
- **On-call:** Check PagerDuty schedule
- **Slack:** #alerts-critical
- **Email:** ops-team@avalo.com
```

---

## 📊 SECTION 8: DASHBOARDS

### 8.1 Required Dashboards

#### **Dashboard 1: Service Health**
**Purpose:** High-level overview of all services  
**Tool:** Google Cloud Monitoring  

**Widgets:**
1. Service Uptime (gauge) - 99.9% target
2. Request Rate (line chart) - requests/second
3. Error Rate (line chart) - % of requests
4. p50/p95/p99 Latency (line chart)
5. Active Instances (stacked area chart)
6. Recent Deployments (timeline)
7. Alert Status (table)

#### **Dashboard 2: Application Performance**
**Purpose:** Deep dive into app performance  
**Tool:** Firebase Performance Monitoring  

**Widgets:**
1. Mobile App Start Time (histogram)
2. Screen Load Times by Screen (table)
3. Network Request Duration (line chart)
4. Crash-Free Users (gauge) - 99.9% target
5. ANR Rate (Android) (line chart)
6. Web Vitals (LCP, FID, CLS) (multi-series)

#### **Dashboard 3: Cost Monitoring**
**Purpose:** Track infrastructure costs  
**Tool:** Google Cloud Billing Dashboard  

**Widgets:**
1. Daily Cost Trend (line chart)
2. Cost by Service (pie chart)
3. Firestore Operations (stacked area)
4. Functions Invocations (line chart)
5. Storage Usage (gauge)
6. Budget vs Actual (bar chart)
7. Cost Forecast (line chart)

#### **Dashboard 4: Business Metrics**
**Purpose:** KPIs and user experience  
**Tool:** Custom Dashboard (Firebase + BigQuery)  

**Widgets:**
1. Daily Active Users (line chart)
2. Sign-up Conversion Rate (gauge)
3. Payment Success Rate (gauge)
4. Average Session Duration (line chart)
5. Feature Usage (table)
6. User Retention Cohort (heatmap)

### 8.2 Dashboard Access

**Access Control:**
```
Read-Only Access:
- All team members
- Investors (business metrics only)

Full Access:
- DevOps team
- On-call engineers
- Engineering leads

Admin Access:
- CTO
- VP Engineering
```

---

## 💰 SECTION 9: COST BREAKDOWN

### 9.1 Monthly Observability Costs

```
CURRENT STATE (Basic):
- Firebase Console: $0 (included)
- Custom monitoring: $0 (self-hosted)
- Alert emails: $0 (SendGrid free tier)
TOTAL: $0/month

PROPOSED STATE (Enterprise-Grade):

Error Tracking (Sentry):
- Team Plan: $26/month
- 50k errors/month
- 100k performance traces/month

Application Performance Monitoring:
- Firebase Performance: $0 (included)
- Google Cloud Monitoring: ~$5/month
  * Ingestion: $0.50/GB (first 50GB free)
  * Retention: $0.01/GB/month

Logging:
- Cloud Logging: ~$10/month
  * Ingestion: $0.50/GB (first 50GB free)
  * Storage: $0.01/GB/month (30-day retention)

Alerting:
- Slack: $0 (existing workspace)
- SendGrid: $0 (free tier sufficient)
- PagerDuty: $0 (optional, not needed yet)

Dashboards:
- Google Cloud Monitoring: $0 (included)
- Custom Dashboards: $0 (self-hosted)

TOTAL MONTHLY COST: ~$41/month
COST PER USER (50k MAU): $0.00082/user/month

ROI:
- 1 hour of debugging saved: ~$100 (engineer time)
- 1 incident prevented: ~$500 (downtime cost)
- Break-even: 1 incident/month

VERDICT: ✅ EXCELLENT ROI
```

### 9.2 Cost Optimization Tips

**How to Keep Costs Low:**
1. ✅ Use sampling (10-20% trace rate)
2. ✅ Set proper log retention (30 days max)
3. ✅ Filter noisy logs (debug in production)
4. ✅ Aggregate before storing
5. ✅ Use free tiers fully before upgrading

---

## 🚀 SECTION 10: IMPLEMENTATION ROADMAP

### Phase 1: Foundation (Week 1-2)
**Goal:** Get basic error tracking in place  
**Duration:** 10-15 hours  

**Week 1:**
- [ ] **Day 1-2:** Set up Sentry account and configure projects
  - Create organization
  - Set up 3 projects (mobile, web, functions)
  - Configure source maps
  - **Owner:** DevOps Lead
  
- [ ] **Day 3-4:** Implement Sentry in Cloud Functions
  - Install @sentry/node
  - Wrap critical functions
  - Test error capture
  - **Owner:** Backend Team

- [ ] **Day 5:** Deploy and verify
  - Deploy functions with Sentry
  - Trigger test errors
  - Verify dashboard
  - **Owner:** DevOps + Backend

**Week 2:**
- [ ] **Day 6-7:** Implement Sentry in Mobile App
  - Install @sentry/react-native
  - Configure navigation tracking
  - Test crash reports
  - **Owner:** Mobile Team

- [ ] **Day 8-9:** Implement Sentry in Web App
  - Install @sentry/nextjs
  - Configure session replay
  - Test error capture
  - **Owner:** Web Team

- [ ] **Day 10:** Verify Phase 1
  - Check all platforms reporting
  - Validate source maps
  - Test alert notifications
  - **Owner:** All Teams

**Deliverables:**
✅ Sentry integrated across all platforms  
✅ Error tracking operational  
✅ Source maps working  
✅ Basic alerts configured  

---

### Phase 2: Performance Monitoring (Week 3-4)
**Goal:** Instrument performance monitoring  
**Duration:** 10-15 hours  

**Week 3:**
- [ ] **Day 11-12:** Configure Firebase Performance (Mobile)
  - Enable Performance SDK
  - Add custom traces
  - Track critical paths
  - **Owner:** Mobile Team

- [ ] **Day 13-14:** Configure Firebase Performance (Web)
  - Enable Performance SDK
  - Track Web Vitals
  - Measure page loads
  - **Owner:** Web Team

- [ ] **Day 15:** Set up Cloud Monitoring
  - Enable APIs
  - Configure metrics
  - Create dashboards
  - **Owner:** DevOps Lead

**Week 4:**
- [ ] **Day 16-17:** Implement Structured Logging
  - Create logging utility
  - Add to critical functions
  - Test log queries
  - **Owner:** Backend Team

- [ ] **Day 18-19:** Configure Log-Based Metrics
  - Create custom metrics
  - Set up alerts
  - Test thresholds
  - **Owner:** DevOps Lead

- [ ] **Day 20:** Verify Phase 2
  - Check performance data
  - Validate dashboards
  - Test alerts
  - **Owner:** All Teams

**Deliverables:**
✅ Performance monitoring active  
✅ Custom traces working  
✅ Structured logging implemented  
✅ Log-based metrics configured  

---

### Phase 3: Cost Monitoring & Alerting (Week 5-6)
**Goal:** Full observability with cost tracking  
**Duration:** 10-15 hours  

**Week 5:**
- [ ] **Day 21-22:** Implement Cost Tracking
  - Set up billing exports
  - Create cost dashboards
  - Configure budget alerts
  - **Owner:** DevOps + Finance

- [ ] **Day 23-24:** Configure Advanced Alerts
  - Set up Slack integration
  - Create alert rules
  - Test notifications
  - **Owner:** DevOps Lead

- [ ] **Day 25:** Create Runbooks
  - Write 10 critical runbooks
  - Document procedures
  - Train team
  - **Owner:** SRE Team

**Week 6:**
- [ ] **Day 26-27:** Build Dashboards
  - Service health dashboard
  - Performance dashboard
  - Cost dashboard
  - Business metrics dashboard
  - **Owner:** DevOps + Product

- [ ] **Day 28-29:** Final Testing & Tuning
  - Load test monitoring
  - Validate all alerts
  - Fine-tune thresholds
  - **Owner:** All Teams

- [ ] **Day 30:** Go Live & Documentation
  - Enable all monitoring
  - Document configuration
  - Train team on tools
  - **Owner:** All Teams

**Deliverables:**
✅ Cost monitoring automated  
✅ Complete alert suite  
✅ Runbooks documented  
✅ Dashboards operational  
✅ Team trained  

---

### Phase 4: Optimization & Hardening (Month 2)
**Goal:** Refine based on real data  
**Duration:** Ongoing  

**Activities:**
- [ ] **Week 7-8:** Monitor and tune
  - Adjust alert thresholds
  - Reduce false positives
  - Optimize sampling rates
  - Review cost data

- [ ] **Week 9-10:** Advanced features
  - Set up distributed tracing
  - Implement anomaly detection
  - Add custom instrumentation
  - Create advanced dashboards

- [ ] **Ongoing:** Continuous improvement
  - Weekly monitoring review
  - Monthly cost optimization
  - Quarterly runbook updates
  - Annual platform review

**Success Criteria:**
✅ < 5 false positive alerts/week  
✅ > 99.9% service availability  
✅ < $50/month observability cost  
✅ < 5 minutes MTTR for P0 incidents  

---

## 📊 SECTION 11: SUCCESS METRICS

### 11.1 Observability KPIs

**Track Monthly:**
```
1. Mean Time to Detection (MTTD): < 5 minutes
   - Time from issue occurrence to alert

2. Mean Time to Resolution (MTTR): < 30 minutes
   - Time from alert to fix deployed

3. Alert Accuracy: > 95%
   - True positives / Total alerts

4. Coverage: 100% of critical paths
   - Instrumented functions / Total critical functions

5. Cost Efficiency: < $0.001 per user
   - Observability cost / Monthly Active Users
```

### 11.2 Quarterly Review Checklist

- [ ] Review all runbooks (update if needed)
- [ ] Audit alert thresholds (reduce noise)
- [ ] Check dashboard usage (remove unused)
- [ ] Analyze cost trends (optimize if needed)
- [ ] Update documentation (keep current)
- [ ] Train new team members (onboarding)
- [ ] Evaluate new tools (stay current)

---

## 🔧 SECTION 12: TOOLS & RESOURCES

### 12.1 Required Tools

**Error Tracking:**
- Sentry: https://sentry.io
- Cost: $26/month
- Setup time: 2-3 hours per platform

**Performance Monitoring:**
- Firebase Performance: https://firebase.google.com/products/performance
- Cost: Included
- Setup time: 1-2 hours per platform

**Infrastructure Monitoring:**
- Google Cloud Monitoring: https://cloud.google.com/monitoring
- Cost: ~$5/month
- Setup time: 2-3 hours

**Logging:**
- Cloud Logging: https://cloud.google.com/logging
- Cost: ~$10/month
- Setup time: 1-2 hours

**Alerting:**
- Slack: https://slack.com
- Cost: $0 (existing)
- Setup time: 30 minutes

### 12.2 Documentation Links

**Official Docs:**
- Sentry Docs: https://docs.sentry.io
- Firebase Performance: https://firebase.google.com/docs/perf-mon
- Cloud Monitoring: https://cloud.google.com/monitoring/docs
- Cloud Logging: https://cloud.google.com/logging/docs

**Best Practices:**
- SRE Book: https://sre.google/sre-book/table-of-contents/
- Observability Engineering: https://www.oreilly.com/library/view/observability-engineering/9781492076438/

### 12.3 Training Resources

**Team Training (Required):**
1. ✅ Sentry 101 (1 hour) - All developers
2. ✅ Firebase Performance (1 hour) - Mobile/Web teams
3. ✅ Cloud Monitoring (2 hours) - DevOps team
4. ✅ Runbook Usage (30 min) - All team
5. ✅ On-Call Training (2 hours) - Senior engineers

**External Courses:**
- Google Cloud Observability: https://www.cloudskillsboost.google/course_templates/99
- Site Reliability Engineering: https://www.coursera.org/learn/site-reliability-engineering-slos

---

## 🎯 SECTION 13: NEXT STEPS

### Immediate Actions (This Week)

**1. Get Buy-In**
- [ ] Present roadmap to engineering team
- [ ] Get budget approval ($41/month)
- [ ] Assign team responsibilities

**2. Set Up Accounts**
- [ ] Create Sentry organization
- [ ] Configure Firebase projects
- [ ] Enable Cloud Monitoring APIs

**3. Start Phase 1**
- [ ] Install Sentry in functions
- [ ] Test error capture
- [ ] Configure first alerts

### Quick Wins (Next 2 Weeks)

1. ✅ Sentry in Cloud Functions (catch backend errors)
2. ✅ Basic performance monitoring (identify slow functions)
3. ✅ Structured logging (easier debugging)
4. ✅ Cost alerts (prevent billing surprises)

### Long-Term Goals (Next Quarter)

1. ✅ Full platform observability
2. ✅ < 5 minute MTTR for P0 incidents
3. ✅ 99.9% service reliability
4. ✅ Proactive issue detection
5. ✅ Data-driven optimization

---

## 📝 APPENDIX

### A. Environment Variables Required

**Mobile App (.env):**
```bash
EXPO_PUBLIC_SENTRY_DSN=https://xxx@yyy.ingest.sentry.io/zzz
EXPO_PUBLIC_SENTRY_ORG=avalo
EXPO_PUBLIC_SENTRY_PROJECT=avalo-mobile
```

**Web App (.env.local):**
```bash
NEXT_PUBLIC_SENTRY_DSN=https://xxx@yyy.ingest.sentry.io/zzz
SENTRY_ORG=avalo
SENTRY_PROJECT=avalo-web
SENTRY_AUTH_TOKEN=sntrys_xxx
```

**Functions (.env):**
```bash
SENTRY_DSN=https://xxx@yyy.ingest.sentry.io/zzz
SENTRY_ENVIRONMENT=production
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
```

### B. Alert Configuration Files

**Example:** `monitoring/alerts/critical.yaml`
```yaml
alerts:
  - name: service_down
    condition: uptime < 99.9%
    duration: 5m
    severity: critical
    channels: [slack, email, pagerduty]
    
  - name: high_error_rate
    condition: error_rate > 1%
    duration: 10m
    severity: high
    channels: [slack, email]
```

### C. SLA Template

```markdown
# Avalo Service Level Agreement (SLA)

## Service Availability
- Target: 99.9% uptime
- Measurement: Monthly rolling window
- Downtime allowed: 43 minutes/month

## Performance
- p50 latency: < 200ms
- p95 latency: < 500ms  
- p99 latency: < 1000ms

## Support
- P0 incidents: < 15 minute response
- P1 incidents: < 1 hour response
- P2 incidents: < 4 hour response

## Remediation
- Service credits for SLA breaches
- Detailed incident reports
- Preventive action plans
```

---

**Document Version:** 1.0  
**Last Updated:** 2025-11-09  
**Status:** ✅ READY FOR IMPLEMENTATION  
**Estimated Completion:** 6 weeks  
**Expected Cost:** $41/month  
**Expected ROI:** 🚀 EXCELLENT (1 incident/month = break-even)

---

_This is a READ-ONLY analysis document. No code changes have been made. All recommendations require engineering team approval and implementation._