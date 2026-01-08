# Avalo Deployment Strategy

## Blue/Green Deployment with Canary Routing

This document outlines the deployment strategy for Avalo, ensuring zero-downtime deployments with automated rollback capabilities.

## Overview

Avalo uses a multi-stage canary deployment strategy that gradually shifts traffic from the current stable version to the new version while monitoring key metrics for anomalies.

## Deployment Stages

### Stage 1: Canary 1% (15 minutes)

**Traffic Split:**
- Blue (Stable): 99%
- Green (New): 1%

**Monitoring:**
- Error rate < 2%
- P95 latency < 1200ms
- Success rate > 98%
- No critical alerts

**Actions:**
- Deploy new version to 1% of instances
- Monitor for 15 minutes
- Auto-rollback if metrics degrade

### Stage 2: Canary 10% (30 minutes)

**Traffic Split:**
- Blue (Stable): 90%
- Green (New): 10%

**Monitoring:**
- All Stage 1 metrics
- Database query performance
- AI model response times
- Payment transaction success rate

**Actions:**
- Increase traffic to 10%
- Extended monitoring period
- Manual approval required if any warnings

### Stage 3: Canary 25% (30 minutes)

**Traffic Split:**
- Blue (Stable): 75%
- Green (New): 25%

**Monitoring:**
- All previous metrics
- User engagement metrics
- Real-time revenue tracking
- Chat delivery latency

**Actions:**
- Increase traffic to 25%
- Performance comparison with baseline
- Stakeholder notification

### Stage 4: Canary 50% (30 minutes)

**Traffic Split:**
- Blue (Stable): 50%
- Green (New): 50%

**Monitoring:**
- Complete system health check
- A/B metric comparison
- User feedback analysis

**Actions:**
- Equal traffic split
- Final validation before full deployment
- Prepare for complete cutover

### Stage 5: Full Deployment (100%)

**Traffic Split:**
- Blue (Stable): 0%
- Green (New): 100%

**Monitoring:**
- Continuous monitoring for 24 hours
- Blue version kept running for quick rollback
- Full observability suite active

**Actions:**
- Complete traffic cutover
- Update DNS/load balancer
- Mark deployment as successful
- Archive blue version after 24 hours

## Rollback Rules

### Automatic Rollback Triggers

The system will automatically rollback if ANY of the following conditions are met:

1. **Error Rate**
   - Error rate > 2% for 3 consecutive minutes
   - 5xx errors > 1% for 5 minutes
   - Database errors > 10 in 1 minute

2. **Latency**
   - P95 latency > 1200ms for 5 minutes
   - P99 latency > 3000ms for 3 minutes
   - Median latency increases by > 50%

3. **Critical Failures**
   - Payment processing failures > 1 in 10 minutes
   - Authentication failures > 5% for 2 minutes
   - AI moderation complete failure
   - Database connection loss

4. **Resource Exhaustion**
   - Memory usage > 90% for 5 minutes
   - CPU usage > 85% for 10 minutes
   - Disk usage > 95%

5. **User Impact**
   - Active user count drops by > 20%
   - Session failures > 10% for 5 minutes
   - Concurrent connection drop > 30%

### Manual Rollback Procedures

1. **Immediate Rollback**
   ```bash
   # Via deployment script
   ./scripts/rollback.sh --immediate
   
   # Via CLI
   gcloud run services update-traffic avalo \
     --to-revisions=avalo-stable=100
   ```

2. **Partial Rollback**
   ```bash
   # Rollback to previous stage
   ./scripts/rollback.sh --stage=previous
   
   # Rollback to specific revision
   ./scripts/rollback.sh --revision=avalo-20241106-v123
   ```

3. **Emergency Stop**
   ```bash
   # Stop all deployments and revert
   ./scripts/emergency-stop.sh
   ```

## Health Scoring Pipeline

### Health Score Calculation

```
Health Score = (
  (Error Rate Score × 0.30) +
  (Latency Score × 0.25) +
  (Throughput Score × 0.20) +
  (Resource Score × 0.15) +
  (User Impact Score × 0.10)
)
```

### Score Thresholds

- **100-90**: Excellent - Proceed to next stage
- **89-80**: Good - Continue monitoring
- **79-70**: Warning - Pause deployment
- **69-0**: Critical - Auto-rollback

### Metric Scoring

**Error Rate Score:**
```
100 - (error_rate × 50)
// 0% errors = 100, 2% errors = 0
```

**Latency Score:**
```
100 - ((p95_latency - 500) / 7)
// 500ms = 100, 1200ms = 0
```

**Throughput Score:**
```
(current_rps / baseline_rps) × 100
// Capped at 100
```

**Resource Score:**
```
100 - (max(cpu_usage, memory_usage))
// 0% usage = 100, 100% usage = 0
```

**User Impact Score:**
```
(current_active_users / baseline_active_users) × 100
// Capped at 100
```

## Deployment Checklist

### Pre-Deployment

- [ ] All tests passing (unit, integration, e2e)
- [ ] Security scan completed
- [ ] Database migrations tested
- [ ] Rollback plan documented
- [ ] Stakeholders notified
- [ ] On-call engineer assigned
- [ ] Blue version tagged and stable
- [ ] Monitoring dashboards prepared

### During Deployment

- [ ] Monitor deployment logs
- [ ] Watch alerting channels
- [ ] Track health metrics
- [ ] Verify canary routing
- [ ] Check database performance
- [ ] Monitor user activity
- [ ] Review error logs
- [ ] Validate payment processing

### Post-Deployment

- [ ] Verify all services healthy
- [ ] Check metric baselines
- [ ] Review error logs
- [ ] Test critical user flows
- [ ] Monitor for 24 hours
- [ ] Update documentation
- [ ] Archive blue version
- [ ] Post-mortem if issues occurred

## Environment-Specific Strategies

### Development

- Direct deployment
- No canary routing
- Faster rollout (5 minutes total)

### Staging

- Simplified canary (10%, 50%, 100%)
- 15-minute stages
- Manual approval required

### Production

- Full canary strategy as documented
- Automated with manual override
- 24-hour monitoring post-deployment

## Database Migration Strategy

### Compatible Changes (Zero-Downtime)

Add new columns, tables, or indexes:

```sql
-- Safe to deploy alongside code
ALTER TABLE users ADD COLUMN new_field VARCHAR(255);
CREATE INDEX idx_new_field ON users(new_field);
```

**Process:**
1. Deploy migration to database
2. Deploy new code using canary strategy
3. Backfill data if needed
4. Remove old code references

### Breaking Changes (Two-Phase Deployment)

Rename or remove columns, change types:

**Phase 1: Add New + Keep Old**
```sql
-- Add new column
ALTER TABLE users ADD COLUMN email_verified BOOLEAN;
-- Copy data
UPDATE users SET email_verified = verified;
```

**Deploy Code:** Support both old and new columns

**Phase 2: Remove Old**
```sql
-- After all instances updated
ALTER TABLE users DROP COLUMN verified;
```

**Deploy Code:** Use only new column

## Monitoring During Deployment

### Key Dashboards

1. **Deployment Dashboard**
   - Canary percentage
   - Health score
   - Error rates by version
   - Latency by version

2. **User Impact Dashboard**
   - Active users
   - Session success rate
   - Error rates by user segment
   - Geographic distribution

3. **Infrastructure Dashboard**
   - CPU/Memory by version
   - Network traffic
   - Database connections
   - Cache hit rates

### Alert Channels

- **Slack**: `#deployments`, `#alerts`
- **PagerDuty**: On-call engineer
- **Email**: Engineering leads
- **Dashboard**: Real-time monitoring

## Rollback Speed

- **Automatic**: < 30 seconds
- **Manual**: < 2 minutes
- **Emergency**: < 10 seconds

## Deployment Schedule

### Recommended Times

- **Preferred**: Tuesday-Thursday, 10am-2pm PT
- **Avoid**: Fridays, weekends, holidays, late nights
- **Emergency**: Anytime with approval

### Freeze Periods

- Black Friday / Cyber Monday
- Major holidays
- High-traffic events
- During incidents

## Success Metrics

A deployment is considered successful when:

1. Health score > 90 for 24 hours
2. No rollbacks required
3. Error rate within SLA
4. User impact < 1%
5. No critical alerts
6. Performance meets or exceeds baseline
7. Revenue tracking normal
8. User feedback positive

## Documentation

- **Runbooks**: See `/ops/runbooks/`
- **Incident Response**: See `/ops/incident-response.md`
- **Architecture**: See `/docs/AVALO_SCALING_ARCHITECTURE.md`
- **Monitoring**: See `/ops/AVALO_MONITORING_DASHBOARD.md`