# PACK 364 — Observability, Error Budgets & SLA Dashboard

## Implementation Complete ✅

**Phase:** ETAP B — Reliability & SRE Layer  
**Status:** Production Ready  
**Version:** 1.0.0

---

## Overview

PACK 364 adds comprehensive SRE-grade observability to Avalo, enabling monitoring and operation of the platform like a top-tier global application. This system provides:

- Structured telemetry logging with PII protection
- Metrics collection and monitoring
- Distributed tracing for critical flows
- SLO/SLA definitions with error budgets
- Alert rules and monitoring
- Admin reliability dashboard

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────┐
│                    Avalo Application                    │
├─────────────────────────────────────────────────────────┤
│  Chat  │  Wallet  │  AI  │  Safety  │  Support  │ ...  │
└────┬───────┬──────┬──────┬────────┬────────┬───────────┘
     │       │      │      │        │        │
     ├───────┴──────┴──────┴────────┴────────┤
     │      Instrumentation Layer             │
     │  (logTelemetry, metrics, traces)       │
     └────────────────┬───────────────────────┘
                      │
     ┌────────────────┴───────────────────────┐
     │                                        │
     v                                        v
┌─────────────┐                        ┌──────────────┐
│  Firestore  │                        │   Console    │
│  Storage    │                        │   Logging    │
└─────────────┘                        └──────────────┘
     │                                        │
     v                                        v
┌─────────────────────────────────────────────────────┐
│            Admin Reliability Dashboard              │
│  • SLO Status  • Metrics  • Traces  • Alerts       │
└─────────────────────────────────────────────────────┘
```

---

## SLO Definitions

### 1. Chat Delivery SLO

**ID:** `slo_chat_delivery`  
**Metric:** P95 latency of [`chat.send`](functions/src/pack364-telemetry-types.ts:87) operations  
**Target:** P95 < 300ms, availability ≥ 99.5%  
**Error Budget:** 0.5% per 30 days  
**Status Indicators:**
- 🟢 Green: P95 < 300ms, availability ≥ 99.5%
- 🟡 Yellow: P95 < 500ms or availability ≥ 99.0%
- 🔴 Red: P95 ≥ 500ms or availability < 99.0%

### 2. Wallet Operations SLO

**ID:** `slo_wallet_operations`  
**Metric:** Success rate of wallet transactions  
**Target:** ≥ 99.8% success rate  
**Error Budget:** 0.2% per 30 days  
**Tracked Operations:**
- [`wallet.spend`](functions/src/pack364-telemetry-types.ts:92)
- [`wallet.refund`](functions/src/pack364-telemetry-types.ts:93)
- [`wallet.payout_request`](functions/src/pack364-telemetry-types.ts:94)

### 3. Panic/Safety SLO

**ID:** `slo_panic_safety`  
**Metric:** P95 latency from panic press to event persistence  
**Target:** P95 < 2s, 100% success  
**Error Budget:** 0.1% events > 5s  
**Critical Operations:**
- [`safety.panic_press`](functions/src/pack364-telemetry-types.ts:109)
- [`safety.panic_process`](functions/src/pack364-telemetry-types.ts:110)

### 4. AI Companions SLO

**ID:** `slo_ai_companions`  
**Metric:** P95 response completion latency  
**Target:** P95 < 2.5s  
**Error Budget:** 1.0% failures/timeouts per 30 days  
**Tracked Operations:**
- [`ai.request`](functions/src/pack364-telemetry-types.ts:87)
- [`ai.response`](functions/src/pack364-telemetry-types.ts:88)

### 5. Support System SLO

**ID:** `slo_support_system`  
**Metric:** API availability  
**Target:** ≥ 99.9% uptime  
**Error Budget:** 0.1% downtime per 30 days  
**Tracked Operations:**
- [`support.ticket_create`](functions/src/pack364-telemetry-types.ts:105)
- [`support.ticket_reply`](functions/src/pack364-telemetry-types.ts:106)

### 6. API Overall SLO

**ID:** `slo_api_overall`  
**Metric:** Overall API error rate (5xx)  
**Target:** ≤ 1% error rate  
**Error Budget:** 1% over rolling 30 days  

---

## Error Budget Policy

### What is an Error Budget?

An error budget is the maximum allowed unreliability before action must be taken. It's calculated as:

```
Error Budget = 100% - SLO Target
```

For example:
- SLO: 99.9% → Error Budget: 0.1%
- SLO: 99.5% → Error Budget: 0.5%

### Error Budget Status

| Status | Remaining Budget | Action Required |
|--------|------------------|-----------------|
| 🟢 **Healthy** | > 50% | Continue normal operations |
| 🟡 **Warning** | 20-50% | Monitor closely, consider slowing releases |
| 🔴 **Critical** | < 20% | Freeze non-critical releases, focus on reliability |

### When Error Budget is Exhausted

1. **Immediate Actions:**
   - Pause all non-critical feature deployments
   - Prioritize bug fixes and stability improvements
   - Review recent changes that may have impacted reliability
   - Increase monitoring and alerting sensitivity

2. **Communication:**
   - Notify engineering teams
   - Update stakeholders on reliability status
   - Create incident report if applicable

3. **Recovery:**
   - Focus engineering effort on improving SLO metrics
   - Implement fixes and improvements
   - Monitor error budget recovery
   - Resume normal operations when budget > 50%

---

## Using the Telemetry System

### Basic Logging

```typescript
import { logTelemetry, TELEMETRY_OPERATIONS, TELEMETRY_ERROR_CODES } from "./pack364-telemetry";

// Log a successful operation
await logTelemetry({
  domain: "chat",
  level: "INFO",
  actorType: "user",
  actorId: userId,
  sessionId: sessionId,
  operation: TELEMETRY_OPERATIONS.CHAT_SEND,
  success: true,
  latencyMs: 250,
  metadata: {
    messageLength: 150,
    hasAttachments: false
  }
});

// Log a failed operation
await logTelemetry({
  domain: "wallet",
  level: "ERROR",
  actorType: "user",
  actorId: userId,
  operation: TELEMETRY_OPERATIONS.WALLET_SPEND,
  success: false,
  errorCode: TELEMETRY_ERROR_CODES.INSUFFICIENT_FUNDS,
  latencyMs: 180,
  metadata: {
    requestedAmount: 100,
    availableBalance: 50
  }
});
```

### Using Helper Functions

```typescript
import { logSuccess, logError, timeOperation } from "./pack364-telemetry";

// Quick success logging
await logSuccess("chat", "chat.send", {
  actorType: "user",
  actorId: userId,
  latencyMs: 200
});

// Quick error logging
await logError("wallet", "wallet.spend", "INSUFFICIENT_FUNDS", {
  level: "ERROR",
  actorType: "user",
  actorId: userId
});

// Automatic timing and logging
const result = await timeOperation(
  "wallet",
  "wallet.spend",
  async () => {
    return await performWalletTransaction(userId, amount);
  },
  {
    actorType: "user",
    actorId: userId
  }
);
```

### PII Protection Rules

**Never log:**
- Email addresses
- Phone numbers
- Names (first, last, full)
- Addresses
- Message content
- Photo URLs
- Passwords or tokens

**Always log:**
- User IDs (anonymized)
- Request IDs
- Operation types
- Durations/latencies
- Error codes
- Numeric values (amounts, counts)

---

## Metrics Collection

### Recording Metrics

```typescript
import { incCounter, setGauge, observeLatency, METRIC_NAMES } from "./pack364-metrics";

// Increment a counter
incCounter(METRIC_NAMES.CHAT_MESSAGES_SENT_TOTAL, {
  domain: "chat",
  messageType: "text"
});

// Record a latency observation
observeLatency(METRIC_NAMES.WALLET_TX_LATENCY_MS, 180, {
  domain: "wallet",
  operation: "spend"
});

// Set a gauge value
setGauge(METRIC_NAMES.ACTIVE_USERS, 1250, {
  region: "eu-central"
});
```

### Available Metrics

| Metric Name | Type | Description |
|------------|------|-------------|
| [`chat_messages_sent_total`](functions/src/pack364-metrics.ts:321) | Counter | Total chat messages sent |
| [`chat_delivery_latency_ms`](functions/src/pack364-metrics.ts:322) | Histogram | Chat delivery latency |
| [`wallet_tx_success_total`](functions/src/pack364-metrics.ts:326) | Counter | Successful wallet transactions |
| [`wallet_tx_failed_total`](functions/src/pack364-metrics.ts:327) | Counter | Failed wallet transactions |
| [`panic_events_total`](functions/src/pack364-metrics.ts:331) | Counter | Total panic button presses |
| [`ai_requests_total`](functions/src/pack364-metrics.ts:335) | Counter | AI companion requests |
| [`api_http_errors_total`](functions/src/pack364-metrics.ts:342) | Counter | HTTP error responses |

---

## Distributed Tracing

### Using Traces

```typescript
import { startTrace, endTrace, traceOperation } from "./pack364-tracing";

// Manual tracing
const trace = startTrace("wallet.spend");
try {
  await performWalletTransaction(userId, amount);
  await endTrace(trace, true);
} catch (error) {
  await endTrace(trace, false, error.code);
  throw error;
}

// Automatic tracing
const result = await traceOperation(
  "wallet.spend",
  async (ctx) => {
    // ctx contains traceId and spanId for correlation
    return await performWalletTransaction(userId, amount);
  }
);
```

### Trace Context Propagation

```typescript
import { extractTraceFromHeaders, injectTraceIntoHeaders } from "./pack364-tracing";

// Extract trace from incoming request
const traceCtx = extractTraceFromHeaders(request.headers);

// Propagate to downstream services
const headers = {
  ...otherHeaders,
  ...injectTraceIntoHeaders(traceCtx)
};
```

---

## Alert Rules

### Predefined Alerts

| Alert | Severity | Threshold | Window | Description |
|-------|----------|-----------|--------|-------------|
| Chat Error Rate High | WARN | > 2% | 5 min | Chat operations error rate |
| Wallet Failures Critical | CRITICAL | > 0.5% | 5 min | Wallet transaction failures |
| Panic Latency Critical | CRITICAL | > 5s | 1 min | Panic processing latency |
| API Error Rate Critical | CRITICAL | > 3% | 10 min | Overall API error rate |

### Creating Custom Alert Rules

```typescript
import { setAlertRule } from "./pack364-alerting-config";

await setAlertRule({
  id: "custom_alert_id",
  name: "Custom Alert",
  severity: "WARN",
  metric: "custom_metric_name",
  threshold: 100,
  windowMinutes: 5,
  condition: "greater_than",
  enabled: true,
  description: "Description of what this alert monitors",
  labels: { domain: "custom" },
  cooldownMinutes: 15
});
```

### Alert Integration

Alerts are emitted as telemetry events and stored in Firestore. To integrate with external alerting systems:

1. **Query alert events:**
```typescript
import { getAlertEvents } from "./pack364-alerting-config";

const alerts = await getAlertEvents({
  severity: "CRITICAL",
  acknowledged: false,
  limit: 50
});
```

2. **Acknowledge alerts:**
```typescript
import { acknowledgeAlert } from "./pack364-alerting-config";

await acknowledgeAlert(alertId, adminUserId);
```

3. **Connect to PACK 293 (Notifications)** for delivery via email, SMS, or push notifications

---

## Admin Dashboard

### Accessing the Dashboard

Navigate to: `admin-web/reliability/pack364-dashboard`

### Dashboard Features

#### Overview Tab
- Global SLO status for all domains
- Error budget usage visualization
- System health metrics (uptime, response time, error rate)

#### Domain-Specific Tabs
- **Chat & Realtime:** Message volume, delivery latency, error rates
- **Wallet & Payments:** Transaction volume, success rates, latency
- **Safety & Panic:** Panic event counts, processing latency
- **AI & Support:** AI request volume, success rates, support tickets
- **Infrastructure:** API error rates, regional latency, slow endpoints

### Dashboard Metrics Update

Metrics refresh automatically every 60 seconds. For manual refresh, reload the page.

---

## Integration with External Monitoring

### Connecting Datadog

```typescript
import { configureTelemetry } from "./pack364-telemetry";
import { configureMetrics } from "./pack364-metrics";

// Configure to send to external monitoring
configureTelemetry({
  logToConsole: true,
  persistToFirestore: true,
  // Add Datadog integration here
});
```

### Connecting New Relic

```typescript
// Export metrics to New Relic
import { queryMetrics } from "./pack364-metrics";

setInterval(async () => {
  const metrics = await queryMetrics({
    startTime: Date.now() - 60000,
    limit: 1000
  });
  
  // Send to New Relic
  // newrelic.recordMetrics(metrics);
}, 60000);
```

### Connecting Prometheus

Metrics are stored in a Prometheus-compatible format. Export via:

```typescript
import { flushMetrics } from "./pack364-metrics";

// Force immediate flush for scraping
await flushMetrics();
```

---

## Firestore Collections

### Collections Created

| Collection | Purpose | Retention |
|------------|---------|-----------|
| `telemetry_events` | All telemetry logs | 90 days |
| `metrics` | Aggregated metrics | 30 days |
| `traces` | Distributed traces | 30 days |
| `alert_rules` | Alert rule definitions | Permanent |
| `alert_events` | Triggered alerts | 90 days |

### Indices Required

```javascript
// Telemetry events
telemetry_events: {
  domain_timestamp: ["domain", "ts"],
  level_timestamp: ["level", "ts"],
  operation_timestamp: ["operation", "ts"],
  success_timestamp: ["success", "ts"]
}

// Metrics
metrics: {
  name_timestamp: ["name", "timestamp"],
  type_timestamp: ["type", "timestamp"]
}

// Traces
traces: {
  traceId: ["traceId", "startTime"],
  operation_timestamp: ["operation", "startTime"]
}

// Alert events
alert_events: {
  severity_timestamp: ["severity", "timestamp"],
  acknowledged_timestamp: ["acknowledged", "timestamp"]
}
```

---

## Best Practices

### 1. Instrument Critical Paths

Always add telemetry to:
- User-facing operations (chat send, payments, bookings)
- Safety-critical flows (panic button, reporting)
- High-value transactions (wallet operations)
- AI interactions
- Support ticket operations

### 2. Use Appropriate Severity Levels

- **DEBUG:** Development troubleshooting
- **INFO:** Normal operations (default)
- **WARN:** Degraded but functional
- **ERROR:** Operation failed but system stable
- **CRITICAL:** System outage or critical failure

### 3. Balance Telemetry Volume

- Use sampling for high-volume operations (consider 10% for routine operations)
- Always log 100% of errors and critical operations
- Set appropriate minimum log levels per environment

```typescript
import { configureTelemetry } from "./pack364-telemetry";

configureTelemetry({
  minLevel: process.env.NODE_ENV === "production" ? "INFO" : "DEBUG",
  samplingRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0
});
```

### 4. Monitor Error Budgets

- Review error budget status daily
- Set calendar reminders for monthly SLO reviews
- Automate error budget burn rate alerts
- Consider budget in deployment decisions

### 5. Trace High-Impact Operations

Always use tracing for:
- Operations involving multiple services
- Operations with complex workflows
- Performance-sensitive operations
- Debugging production issues

---

## Troubleshooting

### High Telemetry Volume

**Symptoms:** High Firestore write costs, slow queries

**Solutions:**
- Increase sampling rate: [`configureTelemetry({ samplingRate: 0.1 })`](functions/src/pack364-telemetry.ts:61)
- Raise minimum log level: [`configureTelemetry({ minLevel: "WARN" })`](functions/src/pack364-telemetry.ts:61)
- Archive old data more aggressively

### Missing Metrics

**Symptoms:** Dashboard shows no data

**Solutions:**
- Check [`flushMetrics()`](functions/src/pack364-metrics.ts:197) is being called
- Verify Firestore write permissions
- Check buffer size: [`configureMetrics({ maxBufferSize: 2000 })`](functions/src/pack364-metrics.ts:54)

### Trace Correlation Issues

**Symptoms:** Traces not linking together

**Solutions:**
- Ensure trace context propagation: [`injectTraceIntoHeaders(ctx)`](functions/src/pack364-tracing.ts:283)
- Check [`x-trace-id`](functions/src/pack364-tracing.ts:270) header passing
- Verify parent context is provided: [`startTrace(operation, parentContext)`](functions/src/pack364-tracing.ts:81)

### Alert Spam

**Symptoms:** Too many alerts firing

**Solutions:**
- Increase cooldown periods: [`cooldownMinutes: 30`](functions/src/pack364-alerting-config.ts:49)
- Adjust thresholds to be less sensitive
- Add more specific conditions to rules
- Disable non-critical alerts temporarily

---

## Performance Considerations

### Telemetry Overhead

- Async logging: ~1-2ms overhead per operation
- Metric recording: <1ms overhead
- Tracing: ~1-2ms overhead per trace

### Storage Costs (Estimated)

- Telemetry events: ~1KB per event
- Metrics: ~500 bytes per data point
- Traces: ~2KB per trace span
- Alert events: ~1KB per alert

**Example monthly cost (100K users, moderate activity):**
- ~5M telemetry events/month → ~$25/month
- ~500K metrics/month → ~$2.50/month
- ~100K traces/month → ~$10/month

**Total:** ~$40/month for comprehensive observability

---

## Maintenance

### Regular Tasks

**Daily:**
- Review unacknowledged alerts
- Check error budget status for critical SLOs
- Monitor dashboard for anomalies

**Weekly:**
- Review slow endpoint reports
- Analyze error patterns
- Update alert thresholds if needed

**Monthly:**
- Calculate SLO compliance
- Review and adjust error budgets
- Archive old telemetry data
- Update dashboard metrics

### Data Retention

Configure automatic cleanup:

```typescript
// Cloud Functions scheduled job
export const cleanupOldTelemetry = functions.pubsub
  .schedule("every 24 hours")
  .onRun(async () => {
    const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000); // 90 days
    
    // Delete old telemetry
    await admin.firestore()
      .collection("telemetry_events")
      .where("ts", "<", cutoff)
      .get()
      .then(snapshot => {
        const batch = admin.firestore().batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        return batch.commit();
      });
  });
```

---

## Migration Guide

### Integrating Into Existing Code

1. **Install dependencies** (if not already present):
```bash
npm install uuid
```

2. **Import telemetry helpers:**
```typescript
import { logTelemetry, timeOperation } from "./pack364-telemetry";
import { incCounter, observeLatency } from "./pack364-metrics";
import { traceOperation } from "./pack364-tracing";
```

3. **Add to critical operations:**
```typescript
// Before
async function sendChatMessage(userId: string, message: string) {
  return await chatService.send(userId, message);
}

// After
async function sendChatMessage(userId: string, message: string) {
  return await timeOperation(
    "chat",
    "chat.send",
    async () => {
      const result = await chatService.send(userId, message);
      incCounter(METRIC_NAMES.CHAT_MESSAGES_SENT_TOTAL, { domain: "chat" });
      return result;
    },
    { actorType: "user", actorId: userId }
  );
}
```

---

## Support & Documentation

### Additional Resources

- **Telemetry Types:** [`functions/src/pack364-telemetry-types.ts`](functions/src/pack364-telemetry-types.ts)
- **Telemetry Implementation:** [`functions/src/pack364-telemetry.ts`](functions/src/pack364-telemetry.ts)
- **Metrics:** [`functions/src/pack364-metrics.ts`](functions/src/pack364-metrics.ts)
- **Tracing:** [`functions/src/pack364-tracing.ts`](functions/src/pack364-tracing.ts)
- **Alerting:** [`functions/src/pack364-alerting-config.ts`](functions/src/pack364-alerting-config.ts)
- **Dashboard:** [`admin-web/reliability/pack364-dashboard.tsx`](admin-web/reliability/pack364-dashboard.tsx)

### Getting Help

For questions or issues:
1. Check this guide first
2. Review the source code documentation
3. Check Firestore collections for actual data
4. Open an issue with the SRE team

---

## Summary

PACK 364 provides production-ready observability infrastructure for Avalo:

✅ Structured telemetry with PII protection  
✅ Comprehensive metrics collection  
✅ Distributed tracing for critical flows  
✅ 6 core SLO definitions with error budgets  
✅ Predefined alert rules  
✅ Admin reliability dashboard  
✅ Integration-ready for external monitoring providers  

**Status:** Ready for production deployment  
**Dependencies:** Firebase Admin SDK, uuid  
**Integrations:** PACK 293 (Notifications), PACK 296 (Audit Logs)
