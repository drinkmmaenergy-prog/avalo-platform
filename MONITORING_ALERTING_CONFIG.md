# Avalo Monitoring & Alerting Configuration

## Overview

This document outlines the complete monitoring and alerting setup for Avalo's production environment, covering application health, performance metrics, error tracking, and incident response.

---

## Table of Contents

1. [Monitoring Stack](#1-monitoring-stack)
2. [Health Check Endpoints](#2-health-check-endpoints)
3. [Application Monitoring](#3-application-monitoring)
4. [Error Tracking](#4-error-tracking)
5. [Performance Monitoring](#5-performance-monitoring)
6. [Infrastructure Monitoring](#6-infrastructure-monitoring)
7. [Alert Rules](#7-alert-rules)
8. [Notification Channels](#8-notification-channels)
9. [Dashboards](#9-dashboards)
10. [On-Call & Incident Response](#10-on-call--incident-response)

---

## 1. Monitoring Stack

### Core Components

| Component | Purpose | Platform |
|-----------|---------|----------|
| **Firebase Performance** | Web/Mobile app performance | Firebase |
| **Cloud Monitoring** | Infrastructure & functions monitoring | Google Cloud |
| **Cloud Logging** | Centralized logging | Google Cloud |
| **Sentry** | Error tracking & debugging | Sentry.io |
| **UptimeRobot** | External uptime monitoring | UptimeRobot.com |
| **Firebase Analytics** | User behavior analytics | Firebase |
| **Custom Metrics** | Business metrics | Firestore + Cloud Functions |

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      MONITORING FLOW                         │
└─────────────────────────────────────────────────────────────┘
                              │
                 ┌────────────┴────────────┐
                 │                         │
        ┌────────▼────────┐      ┌────────▼────────┐
        │   Applications   │      │  Infrastructure │
        │  (Web/Mobile)    │      │  (Firebase/GCP) │
        └────────┬────────┘      └────────┬────────┘
                 │                         │
     ┌───────────┴───────────┐  ┌─────────┴─────────┐
     │                       │  │                    │
┌────▼─────┐         ┌──────▼──▼───┐        ┌──────▼──────┐
│ Firebase │         │    Sentry    │        │   Cloud     │
│  Perf    │         │ (Errors)     │        │ Monitoring  │
└────┬─────┘         └──────┬───────┘        └──────┬──────┘
     │                      │                        │
     └──────────────────────┴────────────────────────┘
                            │
                  ┌─────────▼──────────┐
                  │  Alert Manager     │
                  │  (Cloud Monitoring)│
                  └─────────┬──────────┘
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
     ┌────▼─────┐      ┌────▼────┐      ┌────▼────┐
     │  Slack   │      │  Email  │      │   SMS   │
     └──────────┘      └─────────┘      └─────────┘
```

---

## 2. Health Check Endpoints

### Available Endpoints

#### API Health Check
```
GET /health
Response: {
  "status": "healthy" | "degraded" | "unhealthy",
  "timestamp": "2025-11-28T18:00:00Z",
  "version": "1.0.0",
  "services": {
    "database": "healthy",
    "storage": "healthy",
    "auth": "healthy"
  },
  "uptime": 123456
}
```

#### Web App Health Check
```
GET /api/health
Response: {
  "status": "healthy",
  "timestamp": "2025-11-28T18:00:00Z",
  "build": "abc123def"
}
```

#### Feature Flags Health Check
```
GET /api/featureFlags/health
Response: {
  "status": "healthy",
  "service": "feature-flags",
  "timestamp": "2025-11-28T18:00:00Z",
  "version": "1.0.0"
}
```

### Health Check Implementation

Location: [`functions/src/api/health.ts`](functions/src/api/health.ts)

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export const health = functions.https.onRequest(async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Check Firestore
    const firestoreHealthy = await checkFirestore();
    
    // Check Auth
    const authHealthy = await checkAuth();
    
    // Check Storage
    const storageHealthy = await checkStorage();
    
    const allHealthy = firestoreHealthy && authHealthy && storageHealthy;
    
    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || '1.0.0',
      services: {
        database: firestoreHealthy ? 'healthy' : 'unhealthy',
        auth: authHealthy ? 'healthy' : 'unhealthy',
        storage: storageHealthy ? 'healthy' : 'unhealthy',
      },
      responseTime: Date.now() - startTime,
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

async function checkFirestore(): Promise<boolean> {
  try {
    await admin.firestore().collection('_health').doc('check').get();
    return true;
  } catch {
    return false;
  }
}

async function checkAuth(): Promise<boolean> {
  try {
    await admin.auth().listUsers(1);
    return true;
  } catch {
    return false;
  }
}

async function checkStorage(): Promise<boolean> {
  try {
    await admin.storage().bucket().exists();
    return true;
  } catch {
    return false;
  }
}
```

---

## 3. Application Monitoring

### Firebase Performance Monitoring

Configuration in mobile and web apps:

```typescript
// Web: app-web/src/lib/monitoring.ts
import { getPerformance } from 'firebase/performance';

const perf = getPerformance(app);

// Automatic monitoring:
// - Page load times
// - Network requests
// - Resource loading
```

```typescript
// Mobile: app-mobile/lib/monitoring.ts
import { getPerformance } from '@react-native-firebase/perf';

const perf = getPerformance();

// Custom traces
const trace = await perf.startTrace('user_registration');
await trace.incrementMetric('step_completed', 1);
await trace.stop();
```

### Key Metrics

| Metric | Description | Threshold |
|--------|-------------|-----------|
| **App Start Time** | Time to interactive | < 3s |
| **API Response Time** | Average API latency | < 500ms |
| **Error Rate** | Errors / total requests | < 1% |
| **Crash Rate** | Crashes / sessions | < 0.1% |
| **Page Load Time** | First contentful paint | < 2s |

---

## 4. Error Tracking

### Sentry Configuration

```typescript
// Web: app-web/src/lib/sentry.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1, // 10% of transactions
  beforeSend(event, hint) {
    // Filter sensitive data
    if (event.request) {
      delete event.request.cookies;
      delete event.request.headers?.Authorization;
    }
    return event;
  },
});
```

```typescript
// Mobile: app-mobile/lib/sentry.ts
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? 'development' : 'production',
  tracesSampleRate: 0.1,
  enableAutoSessionTracking: true,
  sessionTrackingIntervalMillis: 30000,
});
```

### Error Categories

- **Critical**: System crashes, payment failures, data loss
- **High**: Feature unavailable, major bugs
- **Medium**: Minor bugs, UI issues
- **Low**: Cosmetic issues, edge cases

---

## 5. Performance Monitoring

### Cloud Functions Metrics

Track in Cloud Monitoring:

```yaml
metrics:
  - name: function_execution_count
    type: DELTA
    filter: resource.type="cloud_function"
    
  - name: function_execution_times
    type: DISTRIBUTION
    filter: resource.type="cloud_function"
    
  - name: function_memory_usage
    type: GAUGE
    filter: resource.type="cloud_function"
    
  - name: function_error_count
    type: DELTA
    filter: resource.type="cloud_function" AND severity>=ERROR
```

### Database Performance

```yaml
firestore_metrics:
  - name: document_reads
    threshold: 100000/min
    
  - name: document_writes  
    threshold: 50000/min
    
  - name: query_latency
    threshold_p95: 500ms
```

---

## 6. Infrastructure Monitoring

### Firebase Quotas

Monitor and alert on:

| Resource | Quota | Alert At |
|----------|-------|----------|
| Firestore Reads | 1M/day (free tier) | 80% |
| Firestore Writes | 200K/day (free tier) | 80% |
| Storage | 5GB (free tier) | 80% |
| Functions Invocations | 2M/month (free tier) | 80% |
| Authentication | Unlimited | N/A |

### Cloud Resource Usage

```yaml
cloud_monitoring:
  - metric: compute.googleapis.com/instance/cpu/utilization
    threshold: 80%
    
  - metric: storage.googleapis.com/storage/total_bytes
    threshold: 1TB
    
  - metric: cloudfunctions.googleapis.com/function/execution_count
    threshold: 1M/day
```

---

## 7. Alert Rules

### Critical Alerts (Page Immediately)

```yaml
critical_alerts:
  - name: "Platform Down"
    condition: "Health check failing for > 5 minutes"
    severity: P0
    notification: SMS + Slack + Email
    
  - name: "Payment Processing Failed"
    condition: "Payment error rate > 5%"
    severity: P0
    notification: SMS + Slack
    
  - name: "Database Unavailable"
    condition: "Firestore connection errors > 10/min"
    severity: P0
    notification: SMS + Slack
    
  - name: "Authentication Down"
    condition: "Firebase Auth errors > 20/min"
    severity: P0
    notification: SMS + Slack
```

### High Priority Alerts (Page During Business Hours)

```yaml
high_priority_alerts:
  - name: "High Error Rate"
    condition: "Error rate > 5% for > 10 minutes"
    severity: P1
    notification: Slack + Email
    
  - name: "Slow Response Times"
    condition: "P95 latency > 3s for > 15 minutes"
    severity: P1
    notification: Slack + Email
    
  - name: "High Memory Usage"
    condition: "Function memory > 90% for > 5 minutes"
    severity: P1
    notification: Slack
```

### Medium Priority Alerts (Email Only)

```yaml
medium_priority_alerts:
  - name: "Elevated Error Rate"
    condition: "Error rate > 2% for > 30 minutes"
    severity: P2
    notification: Email
    
  - name: "Storage Quota Warning"
    condition: "Storage usage > 80% of quota"
    severity: P2
    notification: Email
    
  - name: "Unusual Traffic Pattern"
    condition: "Traffic 200% above baseline"
    severity: P2
    notification: Slack
```

### Alert Rule Configuration

```yaml
# Cloud Monitoring Alert Policy
apiVersion: monitoring.googleapis.com/v3
kind: AlertPolicy
metadata:
  name: high-error-rate
spec:
  displayName: "High Error Rate Alert"
  conditions:
    - displayName: "Error rate > 5%"
      conditionThreshold:
        filter: |
          metric.type="logging.googleapis.com/user/error_count"
          resource.type="cloud_function"
        comparison: COMPARISON_GT
        thresholdValue: 0.05
        duration: 600s
        aggregations:
          - alignmentPeriod: 60s
            perSeriesAligner: ALIGN_RATE
  notificationChannels:
    - projects/PROJECT_ID/notificationChannels/SLACK_CHANNEL
    - projects/PROJECT_ID/notificationChannels/EMAIL_CHANNEL
  alertStrategy:
    autoClose: 86400s
```

---

## 8. Notification Channels

### Slack Integration

```yaml
slack_config:
  webhook_url: "${SLACK_WEBHOOK_URL}"
  channels:
    critical: "#avalo-critical-alerts"
    high: "#avalo-alerts"
    medium: "#avalo-monitoring"
  message_format: |
    🚨 *{SEVERITY}*: {ALERT_NAME}
    
    *Details:* {ALERT_DESCRIPTION}
    *Time:* {TIMESTAMP}
    *Duration:* {DURATION}
    
    <{CONSOLE_URL}|View in Console>
```

### Email Configuration

```yaml
email_config:
  recipients:
    critical:
      - on-call@avalo.app
      - cto@avalo.app
    high:
      - dev-team@avalo.app
    medium:
      - dev-team@avalo.app
  from: alerts@avalo.app
  subject_prefix: "[Avalo Alert]"
```

### SMS/Phone (PagerDuty)

```yaml
pagerduty_config:
  integration_key: "${PAGERDUTY_KEY}"
  severity_mapping:
    P0: "critical"
    P1: "warning"
  escalation_policy:
    - level: 1
      delay: 0
      targets: ["on-call-engineer"]
    - level: 2
      delay: 15min
      targets: ["engineering-manager"]
    - level: 3
      delay: 30min
      targets: ["cto"]
```

---

## 9. Dashboards

### Cloud Monitoring Dashboards

#### System Health Dashboard

```yaml
widgets:
  - title: "Overall System Status"
    type: scorecard
    metrics:
      - uptime_percentage
      - active_users
      - error_rate
      
  - title: "API Response Times"
    type: line_chart
    metrics:
      - p50_latency
      - p95_latency
      - p99_latency
      
  - title: "Error Rate by Function"
    type: stacked_bar
    metrics:
      - errors_by_function
      
  - title: "Resource Usage"
    type: gauge
    metrics:
      - cpu_utilization
      - memory_utilization
      - storage_usage
```

#### Application Performance Dashboard

```yaml
widgets:
  - title: "User Sessions"
    type: line_chart
    metrics:
      - active_sessions
      - new_sessions
      - bounce_rate
      
  - title: "Feature Usage"
    type: bar_chart
    metrics:
      - messages_sent
      - profiles_viewed
      - matches_made
      
  - title: "Revenue Metrics"
    type: scorecard
    metrics:
      - tokens_purchased
      - subscriptions_active
      - revenue_today
```

### Custom Dashboard URLs

- **System Health**: `https://console.cloud.google.com/monitoring/dashboards/custom/avalo-health`
- **Performance**: `https://console.cloud.google.com/monitoring/dashboards/custom/avalo-performance`
- **Business Metrics**: `https://console.firebase.google.com/project/avalo-prod/analytics`

---

## 10. On-Call & Incident Response

### On-Call Schedule

```yaml
rotation:
  schedule: "weekly"
  timezone: "UTC"
  handoff: "Monday 09:00 UTC"
  
  primary_on_call:
    - week1: "Engineer A"
    - week2: "Engineer B"
    - week3: "Engineer C"
    
  secondary_on_call:
    - week1: "Engineering Manager"
```

### Incident Response Runbook

#### P0 - Critical (Immediate Response)

1. **Acknowledge alert** within 5 minutes
2. **Assess impact**: How many users affected?
3. **Communicate**: Post in #incident-response channel
4. **Mitigate**: Apply immediate fix or rollback
5. **Monitor**: Verify issue resolved
6. **Document**: Create incident report

#### P1 - High (15-minute Response)

1. **Acknowledge alert** within 15 minutes
2. **Investigate**: Gather logs and metrics
3. **Communicate**: Update team in #avalo-alerts
4. **Fix**: Apply patch or workaround
5. **Verify**: Test and monitor
6. **Document**: Update runbook if needed

#### P2 - Medium (1-hour Response)

1. **Acknowledge alert** within 1 hour
2. **Create ticket**: Log in issue tracker
3. **Investigate**: During business hours
4. **Schedule fix**: Next sprint if non-urgent

### Common Issues & Solutions

| Issue | Symptoms | Solution |
|-------|----------|----------|
| **High Latency** | Response times > 3s | Scale Cloud Functions, optimize queries |
| **Firestore Quota** | DocumentExists errors | Upgrade plan, optimize reads |
| **Memory Errors** | Function OOM | Increase memory allocation |
| **Auth Failures** | Login/signup broken | Check Firebase Auth status |
| **Storage Errors** | Upload failures | Check Cloud Storage rules & quotas |

---

## 11. Monitoring Checklist

### Pre-Launch

- [ ] All health check endpoints responding
- [ ] Sentry configured and receiving errors
- [ ] Firebase Performance enabled
- [ ] Cloud Monitoring dashboards created
- [ ] Alert rules configured and tested
- [ ] Notification channels functional
- [ ] On-call schedule established
- [ ] Runbooks documented
- [ ] Uptime monitoring active
- [ ] Quotas and limits reviewed

### Post-Launch

- [ ] Monitor error rates for 48 hours
- [ ] Review and adjust alert thresholds
- [ ] Verify all alerts working correctly
- [ ] Check dashboard accuracy
- [ ] Validate incident response process
- [ ] Document any new issues
- [ ] Update runbooks as needed
- [ ] Performance baseline established

---

## 12. Metrics & SLOs

### Service Level Objectives

| Service | SLO | Measurement |
|---------|-----|-------------|
| **API Availability** | 99.9% uptime | Health checks every 1 min |
| **API Latency** | P95 < 500ms | Cloud Monitoring |
| **Error Rate** | < 0.1% | Sentry + Cloud Logging |
| **App Crash Rate** | < 0.1% | Firebase Crashlytics |

### Key Performance Indicators

```yaml
kpis:
  technical:
    - api_uptime: 99.9%
    - average_latency: <300ms
    - error_rate: <0.1%
    
  business:
    - daily_active_users: track
    - retention_rate: track
    - revenue_per_user: track
```

---

## Status: ✅ MONITORING CONFIGURED

All monitoring and alerting systems are documented and ready for production deployment.

**Next Steps:**
1. Configure alert notification channels
2. Set up on-call rotation
3. Test all alert rules
4. Create custom dashboards
5. Document incident response procedures

Last Updated: 2025-11-28