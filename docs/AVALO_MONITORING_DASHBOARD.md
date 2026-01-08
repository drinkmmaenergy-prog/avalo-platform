# Avalo Monitoring Dashboard

## Overview

Comprehensive monitoring infrastructure for Avalo platform with real-time metrics, alerts, and observability.

## Dashboard Access

- **Production**: https://monitoring.avalo.app
- **Staging**: https://monitoring-staging.avalo.app
- **Local**: http://localhost:7777/debug

## Primary Dashboards

### 1. System Health Dashboard

**URL**: `/dashboards/system-health`

**Metrics:**
- Overall system status (Green/Yellow/Red)
- Error rate by service
- P50/P95/P99 latency
- Request throughput
- Active user count

**Panels:**
```
┌─────────────────────────────────────┐
│ System Status: 🟢 Healthy          │
│ Uptime: 99.95% (30d)               │
│ Active Alerts: 0                    │
└─────────────────────────────────────┘

┌─────────────┬─────────────┬─────────┐
│ Service     │ Status      │ Latency │
├─────────────┼─────────────┼─────────┤
│ API         │ 🟢 Healthy  │ 145ms   │
│ Database    │ 🟢 Healthy  │ 23ms    │
│ Storage     │ 🟢 Healthy  │ 67ms    │
│ AI          │ 🟢 Healthy  │ 1.2s    │
│ Payments    │ 🟢 Healthy  │ 234ms   │
└─────────────┴─────────────┴─────────┘
```

**Queries:**
```promql
# Error rate
sum(rate(http_requests_errors_total[5m])) / 
sum(rate(http_requests_total[5m])) * 100

# P95 latency
histogram_quantile(0.95, 
  rate(http_request_duration_bucket[5m]))

# Active users
count(user_sessions{active="true"})
```

### 2. API Performance Dashboard

**URL**: `/dashboards/api-performance`

**Metrics:**
- Request rate (req/sec)
- Response time distribution
- Error rate by endpoint
- Slowest endpoints
- Most used endpoints

**Visualization:**
```
Requests per Second (5min avg)
┌─────────────────────────────────────┐
│ ▂▃▄▅▆▇██▇▆▅▄▃▂▁                    │
│ 2.3k req/s                          │
└─────────────────────────────────────┘

Latency Percentiles
┌─────────────────────────────────────┐
│ P50: 123ms ▓░░░░░                   │
│ P90: 456ms ▓▓▓▓░░                   │
│ P95: 892ms ▓▓▓▓▓▓▓░                 │
│ P99: 1.5s  ▓▓▓▓▓▓▓▓▓▓░              │
└─────────────────────────────────────┘
```

### 3. User Activity Dashboard

**URL**: `/dashboards/user-activity`

**Metrics:**
- Daily Active Users (DAU)
- Monthly Active Users (MAU)
- New signups
- User engagement
- Session duration

**Panels:**
- User growth chart
- Retention cohorts
- Feature usage heatmap
- Geographic distribution
- Device breakdown

### 4. Revenue Dashboard

**URL**: `/dashboards/revenue`

**Metrics:**
- Real-time revenue
- Revenue by source
- Transaction volume
- Average order value
- Creator earnings

**Real-Time Display:**
```
Today's Revenue: $12,345.67 ↑ 23%
┌─────────────────────────────────────┐
│ Subscriptions: $8,234  (67%)        │
│ Messages:      $2,456  (20%)        │
│ Tips:          $1,123  (9%)         │
│ Unlocks:         $532  (4%)         │
└─────────────────────────────────────┘

Transactions/Hour
▂▃▅▆▇██▇▆▅▄▃▂▁▂▃▄▅▆▇█
```

### 5. Chat Performance Dashboard

**URL**: `/dashboards/chat`

**Metrics:**
- Messages sent/received
- Delivery latency
- Failed deliveries
- Active conversations
- Response rates

**SLA Tracking:**
```
Message Delivery SLA: 99.8% ✅
┌─────────────────────────────────────┐
│ Target:    99.5%                    │
│ Current:   99.8%                    │
│ Budget:    0.5% remaining           │
└─────────────────────────────────────┘

Latency Distribution (P95)
┌─────────────────────────────────────┐
│ Target:  500ms                      │
│ Current: 342ms ✅                   │
│ Trend:   ↓ 12% (7d)                 │
└─────────────────────────────────────┘
```

### 6. AI Operations Dashboard

**URL**: `/dashboards/ai-ops`

**Metrics:**
- Token consumption
- AI request latency
- Moderation accuracy
- Cost per interaction
- NSFW detection rate

**Cost Tracking:**
```
AI Costs Today: $234.56
┌─────────────────────────────────────┐
│ Chat:        $156.23  (67%)         │
│ Moderation:  $45.67   (19%)         │
│ Embeddings:  $32.66   (14%)         │
└─────────────────────────────────────┘

Token Budget: 78% used
████████░░ 780k / 1M
```

### 7. Creator Analytics Dashboard

**URL**: `/dashboards/creator-analytics`

**Metrics:**
- Creator revenue
- Subscriber growth
- Content performance
- Engagement rates
- Payout status

**Top Creators:**
```
┌──────────────┬─────────┬───────────┐
│ Creator      │ Revenue │ Subs      │
├──────────────┼─────────┼───────────┤
│ @creator1    │ $5,234  │ 1,234     │
│ @creator2    │ $4,567  │ 987       │
│ @creator3    │ $3,890  │ 856       │
└──────────────┴─────────┴───────────┘
```

## Alert Configuration

### Critical Alerts (PagerDuty)

```yaml
P95_Latency_High:
  condition: p95_latency > 1200ms for 5min
  severity: critical
  channels: [pagerduty, slack]

Error_Rate_High:
  condition: error_rate > 2% for 3min
  severity: critical
  channels: [pagerduty, slack, email]

Payment_Failures:
  condition: payment_failures > 1 in 10min
  severity: critical
  channels: [pagerduty, email]
```

### Warning Alerts (Slack)

```yaml
High_Latency:
  condition: p95_latency > 800ms for 10min
  severity: warning
  channels: [slack]

Database_Slow_Queries:
  condition: db_query_time > 1s
  severity: warning
  channels: [slack]
```

## Metrics Collection

### Infrastructure Metrics

**Compute:**
- CPU utilization
- Memory usage
- Disk I/O
- Network throughput

**Database:**
- Read/write operations
- Query latency
- Index usage
- Storage size

**Storage:**
- Object count
- Bandwidth
- Request rate
- Cache hit ratio

### Application Metrics

**User Metrics:**
```typescript
{
  dau: number,
  mau: number,
  sessionDuration: number,
  newSignups: number,
  churnRate: number
}
```

**Business Metrics:**
```typescript
{
  revenue: number,
  arpu: number,
  conversionRate: number,
  ltv: number,
  cac: number
}
```

**Technical Metrics:**
```typescript
{
  errorRate: number,
  latency: { p50: number, p95: number, p99: number },
  throughput: number,
  availability: number
}
```

## Custom Dashboards

### Creating Custom Dashboard

```typescript
// monitoring/dashboards/custom.ts
export const customDashboard = {
  name: 'My Custom Dashboard',
  panels: [
    {
      title: 'Request Rate',
      query: 'rate(http_requests_total[5m])',
      type: 'graph',
      span: 6
    },
    {
      title: 'Error Rate',
      query: 'rate(http_requests_errors_total[5m])',
      type: 'graph',
      span: 6
    }
  ]
};
```

### Deploying Dashboard

```bash
# Deploy custom dashboard
node monitoring/deploy-dashboard.js custom.ts

# Verify
curl https://monitoring.avalo.app/api/dashboards/custom
```

## Log Aggregation

### Centralized Logging

**Sources:**
- Application logs
- Access logs
- Error logs
- Audit logs
- Security logs

**Destinations:**
- Cloud Logging (real-time)
- BigQuery (analytics)
- Cloud Storage (archival)

### Log Querying

```bash
# Recent errors
gcloud logging read "severity>=ERROR" --limit=50

# Specific user activity
gcloud logging read "jsonPayload.userId='user123'" --limit=100

# Payment failures
gcloud logging read "textPayload=~'payment.*failed'" --limit=20
```

### Log-Based Metrics

```yaml
payment_success_rate:
  filter: "textPayload=~'payment.*success'"
  type: counter
  
ai_token_usage:
  filter: "jsonPayload.tokens>0"
  type: distribution
```

## Tracing

### Distributed Tracing

**Implementation:**
```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('avalo');

const span = tracer.startSpan('processPayment');
span.setAttribute('userId', userId);
span.setAttribute('amount', amount);

try {
  await processPayment();
  span.setStatus({ code: SpanStatusCode.OK });
} catch (error) {
  span.setStatus({ code: SpanStatusCode.ERROR });
  span.recordException(error);
} finally {
  span.end();
}
```

**Viewing Traces:**
- Cloud Trace UI
- Trace search by operation
- Latency waterfall
- Service dependency map

## Synthetic Monitoring

### Uptime Checks

```yaml
homepage:
  url: https://avalo.app
  interval: 60s
  timeout: 10s
  regions: [us, eu, asia]

api_health:
  url: https://api.avalo.app/health
  interval: 30s
  timeout: 5s
  expected_status: 200
```

### E2E Tests

```bash
# Run hourly
npm run test:e2e:production

# Alert on failure
if [ $? -ne 0 ]; then
  notify-on-call "E2E tests failing"
fi
```

## SLI/SLO Tracking

### Service Level Indicators

```typescript
const SLIs = {
  availability: {
    measurement: 'successful_requests / total_requests',
    target: 0.999
  },
  latency: {
    measurement: 'p95_latency',
    target: 1200
  },
  throughput: {
    measurement: 'requests_per_second',
    target: 1000
  }
};
```

### Error Budget

```
Monthly Error Budget: 43.2 minutes
Used: 8.5 minutes (19.7%)
Remaining: 34.7 minutes (80.3%)

Burn Rate: 0.5x (safe)
```

## Mobile-Specific Monitoring

### Crash Reporting
- Firebase Crashlytics
- Stack traces
- Device information
- User impact

### Performance
- App startup time
- Screen rendering
- Network requests
- Battery usage

## Alerting Rules

### Response Time SLA

```yaml
name: Response_Time_SLA
query: |
  histogram_quantile(0.95,
    rate(http_request_duration_bucket[5m])
  ) > 1200
duration: 5m
severity: warning
message: "P95 latency exceeds 1200ms"
```

### Error Budget Burn

```yaml
name: Error_Budget_Burn
query: |
  (1 - availability_sli) * 100 > 0.1
duration: 10m
severity: critical
message: "Error budget burning too fast"
```

## Capacity Planning Dashboard

**Metrics:**
- Storage growth rate
- User growth rate
- Resource utilization trends
- Cost projections
- Scaling recommendations

**Forecasting:**
```
Storage Forecast (90 days)
Current: 2.5 TB
Projected: 8.7 TB
Action: Increase quota before day 75
```

## Integration

### Slack Integration

```typescript
// Send metric to Slack
await slack.postMessage({
  channel: '#monitoring',
  text: `⚠️ High latency detected: ${latency}ms`
});
```

### PagerDuty Integration

```typescript
// Trigger incident
await pagerduty.createIncident({
  title: 'Payment processing failure',
  severity: 'critical',
  service: 'payments'
});
```

## Custom Metrics

### Recording Custom Metrics

```typescript
import { defaultMetrics } from '../ops/metrics';

// Record latency
defaultMetrics.recordLatency('payment_processing', duration);

// Increment counter
defaultMetrics.incrementCounter('payment_success', 1, { 
  method: 'stripe' 
});

// Set gauge
defaultMetrics.setGauge('active_users', userCount);
```

### Querying Custom Metrics

```promql
# Payment success rate
sum(rate(payment_success[5m])) / 
sum(rate(payment_attempts[5m])) * 100

# Revenue per minute
sum(rate(revenue_total[1m]))

# AI cost efficiency
sum(rate(ai_cost_total[1h])) / 
sum(rate(ai_requests_total[1h]))
```

## Dashboard Widgets

### Status Badge
```typescript
<StatusBadge
  metric="system_health"
  thresholds={{
    healthy: [95, 100],
    degraded: [90, 95],
    down: [0, 90]
  }}
/>
```

### Metric Graph
```typescript
<MetricGraph
  query="rate(http_requests_total[5m])"
  title="Request Rate"
  type="line"
  timeRange="1h"
/>
```

### Alert List
```typescript
<AlertList
  severity={['critical', 'warning']}
  limit={10}
  autoRefresh={30}
/>
```

## Retention & Data Lifecycle

### Log Retention
- Real-time logs: 30 days
- Archived logs: 1 year
- Audit logs: 7 years
- Metrics: 13 months

### Data Export
```bash
# Export logs to BigQuery
gcloud logging sinks create avalo-logs-bq \
  bigquery.googleapis.com/projects/avalo/datasets/logs

# Export metrics
gcloud monitoring time-series-descriptors list \
  --format=json > metrics-backup.json
```

## Performance Baselines

### API Endpoints

| Endpoint | P50 | P95 | P99 |
|----------|-----|-----|-----|
| GET /feed | 120ms | 450ms | 1.2s |
| POST /messages | 80ms | 320ms | 850ms |
| GET /profile | 45ms | 180ms | 450ms |
| POST /payments | 200ms | 890ms | 2.1s |

### Database Operations

| Operation | P50 | P95 | P99 |
|-----------|-----|-----|-----|
| Read | 12ms | 45ms | 120ms |
| Write | 18ms | 67ms | 180ms |
| Query | 35ms | 145ms | 380ms |

## Anomaly Detection

### Machine Learning Models

```typescript
const anomalyDetector = {
  metrics: ['latency', 'error_rate', 'throughput'],
  algorithm: 'isolation_forest',
  sensitivity: 0.95,
  alertOn: 'deviation > 3 stddev'
};
```

### Automated Response
- Scale up on traffic spikes
- Circuit breaker on errors
- Failover on service degradation
- Auto-rollback on deployment issues

## Access Control

### Dashboard Permissions

```typescript
{
  viewer: ['read'],
  developer: ['read', 'query'],
  ops: ['read', 'query', 'acknowledge_alerts'],
  admin: ['read', 'query', 'acknowledge_alerts', 'configure']
}
```

## Mobile App

### Monitoring Panels
1. Crash-free sessions
2. App startup time
3. Network request performance
4. Screen load times
5. User engagement

### Key Metrics
- Crash rate: <0.1%
- ANR rate: <0.05%
- Startup time: <2s
- Screen render: <16ms

## Reports

### Daily Report (Automated)

```
Subject: Avalo Daily Report - 2024-11-06

System Health: ✅ All systems operational
Uptime: 99.98%
Active Users: 45,234 (+2.3%)
Revenue: $15,678 (+5.1%)
Errors: 142 (-12%)
Incidents: 0

Top Performers:
- Fastest endpoint: GET /health (12ms avg)
- Most used: GET /feed (12.3k req/min)

Action Items:
- None
```

### Weekly Report

- User growth trends
- Revenue analysis
- Performance trends
- Cost analysis
- Incidents summary

## Tools & Integrations

- **Grafana**: Custom dashboards
- **Prometheus**: Metrics storage
- **Cloud Monitoring**: GCP metrics
- **Sentry**: Error tracking
- **LogRocket**: Session replay
- **Datadog**: APM (optional)

## Contact

- **On-Call**: PagerDuty auto-escalates
- **SRE Team**: sre@avalo.app
- **Reports**: reports@avalo.app