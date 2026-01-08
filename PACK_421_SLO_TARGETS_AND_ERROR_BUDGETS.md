# PACK 421 — SLO Targets and Error Budgets

**Stage:** E — Post-Launch Stabilization & Compliance  
**Date:** December 31, 2024  
**Status:** Active

## Overview

This document defines Service Level Objectives (SLOs), error budgets, and incident classification tiers for Avalo platform operations. These targets guide operational decisions, alert thresholds, and incident response priorities.

## Core Principles

1. **User-Centric**: SLOs reflect actual user experience, not just infrastructure uptime
2. **Regional Scope**: Targets are per-region to ensure global quality
3. **Error Budgets**: Define acceptable downtime while encouraging innovation
4. **Incident Alignment**: SLO breaches map directly to incident tiers (PACK 417-419)

---

## 1. API AVAILABILITY SLOs

### 1.1 Core API Endpoints

**Target: 99.9% monthly availability per region**

Applies to:
- Authentication & session management (PACK 110)
- Wallet operations (spend, query balance) (PACK 255/277)
- Chat message send (PACK 268x, 273-280)
- Voice/video call initiation (PACK 273-280)
- Support ticket creation (PACK 300/300A/300B)

**Error Budget:**
- Monthly: 43.2 minutes of downtime allowed
- Weekly: 10.08 minutes
- Daily: 1.44 minutes

**Measurement:**
- Metric: `infra.http.request.count` with tags for success/failure
- Calculation: (successful_requests / total_requests) × 100
- Evaluation Window: Rolling 30-day period

**Alert Thresholds:**
- **P1 Alert**: Availability drops below 99.8% (consuming 50% of error budget)
- **P0 Alert**: Availability drops below 99.5% or complete outage

---

### 1.2 Secondary API Endpoints

**Target: 99.5% monthly availability per region**

Applies to:
- User profile updates
- Event/meeting management (PACK 240+, 218)
- AI companion interactions (PACK 279)
- Data rights requests (PACK 420)
- Growth features (referrals, activation tracking) (PACK 301/301A/301B)

**Error Budget:**
- Monthly: 3.6 hours of downtime allowed
- Weekly: 50.4 minutes
- Daily: 7.2 minutes

**Measurement:**
- Same as Core API, but separate tracking
- Evaluation Window: Rolling 30-day period

---

## 2. LATENCY SLOs

### 2.1 API Response Time (p95)

**Target: p95 < 500ms for most endpoints**

Applies to:
- Authentication: p95 < 300ms
- Wallet balance query: p95 < 200ms
- Chat message send: p95 < 400ms
- Profile load: p95 < 500ms

**Error Budget:**
- 5% of requests may exceed target (p95 definition)
- If p95 consistently exceeds target for 1 hour: P2 incident

**Measurement:**
- Metric: `infra.http.request.latency_ms`
- Tags: `{endpoint, region}`
- Evaluation Window: Rolling 1-hour for alerts, 7-day for SLO tracking

**Alert Thresholds:**
- **P2 Alert**: p95 > 750ms for 15 minutes
- **P1 Alert**: p95 > 1500ms for 10 minutes

---

### 2.2 Critical Money Flows (p95)

**Target: p95 < 400ms**

Applies to:
- Wallet spend operations (PACK 255/277)
- Token purchase completion (PACK 255/277)
- Payout request submission (PACK 255/277)

**Error Budget:**
- 5% of requests may exceed target
- If p95 > 800ms for 10 minutes: P1 incident

**Measurement:**
- Metric: `product.wallet.spend.success` with latency tracking
- Evaluation Window: Rolling 1-hour

**Alert Thresholds:**
- **P1 Alert**: p95 > 800ms for 10 minutes
- **P0 Alert**: p95 > 2000ms or complete failure

---

### 2.3 Realtime Communication (p95)

**Target: p95 < 600ms**

Applies to:
- WebRTC signaling for calls (PACK 273-280)
- Chat delivery (PACK 268x)
- Live event join latency (PACK 240+)

**Error Budget:**
- 5% of requests may exceed target
- If p95 > 1200ms for 10 minutes: P1 incident

**Measurement:**
- Metrics: `product.call.started.count`, `product.chat.latency_ms`
- Evaluation Window: Rolling 1-hour

---

## 3. DATABASE PERFORMANCE SLOs

### 3.1 Firestore Query Latency

**Target: p95 < 100ms for reads, p95 < 300ms for writes**

**Error Budget:**
- 5% of queries may exceed target
- Persistent slow queries (>2000ms) trigger P1 incident

**Measurement:**
- Metric: `infra.db.query.latency_ms`
- Tags: `{operation: 'read'|'write', collection}`
- Evaluation Window: Rolling 1-hour

**Alert Thresholds:**
- **P2 Alert**: p95 > 500ms for 15 minutes
- **P1 Alert**: p95 > 2000ms for 10 minutes

---

## 4. FEATURE-SPECIFIC SLOs

### 4.1 Wallet & Payments Success Rate

**Target: 99.95% success rate for wallet spends**

- Excludes intentional failures (insufficient balance, validation errors)
- Includes only system/infrastructure failures

**Error Budget:**
- 0.05% failure rate = ~22 failures per 44,000 operations
- Monthly at 1M operations: 500 failures allowed

**Measurement:**
- Metrics: `product.wallet.spend.success` vs `product.wallet.spend.failed`
- Filter: Exclude `reason: insufficient_balance`
- Evaluation Window: Rolling 30-day period

**Alert Thresholds:**
- **P0 Alert**: > 10 failures in 10 minutes
- **P1 Alert**: > 20 failures in 1 hour

---

### 4.2 Chat Message Delivery

**Target: 99.8% successful delivery within 60 seconds**

**Error Budget:**
- 0.2% failure rate
- At 100K messages/day: 200 failures allowed

**Measurement:**
- Metrics: `product.chat.message.count` vs `product.chat.failed.count`
- Evaluation Window: Rolling 24-hour period

**Alert Thresholds:**
- **P1 Alert**: > 20 failures in 15 minutes
- **P0 Alert**: Complete chat system outage

---

### 4.3 Call Connection Success Rate

**Target: 98% successful call establishment**

- Includes WebRTC signaling and media connection
- Excludes user-cancelled calls

**Error Budget:**
- 2% failure rate
- At 10K calls/day: 200 failures allowed

**Measurement:**
- Metrics: `product.call.started.count` vs `product.call.failed.count`
- Evaluation Window: Rolling 24-hour period

**Alert Thresholds:**
- **P1 Alert**: > 15 failures in 10 minutes
- **P0 Alert**: > 30 failures in 10 minutes or complete outage

---

### 4.4 AI Companion Response Time

**Target: p95 < 3 seconds for AI responses**

**Error Budget:**
- 5% of responses may exceed 3 seconds
- Model errors < 1% of interactions

**Measurement:**
- Metrics: `product.ai.response.latency_ms`, `product.ai.model.error.count`
- Evaluation Window: Rolling 1-hour

**Alert Thresholds:**
- **P2 Alert**: p95 > 5 seconds for 30 minutes
- **P2 Alert**: > 10 model errors in 30 minutes

---

### 4.5 Safety Incident Response Time

**Target: 100% of P0 safety incidents reviewed within 15 minutes**

**Error Budget:**
- Zero tolerance for delayed response to panic buttons
- P1 incidents: 90% reviewed within 1 hour

**Measurement:**
- Metric: `product.safety.incident.count` with `{severity}` tag
- Manual tracking via incident system (PACK 417-419)
- Evaluation Window: Continuous

**Alert Thresholds:**
- **P1 Alert**: Any panic button activation (`product.safety.panic.activated`)
- **P1 Alert**: > 20 safety incidents in 1 hour

---

## 5. INCIDENT CLASSIFICATION TIERS

### P0 — CRITICAL: Immediate Response Required

**Response Time:** 5 minutes  
**Description:** Complete service outage or critical security incident affecting all users

**Examples:**
- No authentication possible globally
- All wallet operations failing
- Complete chat/call system down
- Database unreachable
- Security breach detected

**Impact:** Major revenue loss, user trust damage, compliance violations

**Escalation:** Immediate page to on-call engineer + management notification

---

### P1 — HIGH: Urgent Response Required

**Response Time:** 15 minutes  
**Description:** Core features unavailable in one region or severe degradation

**Examples:**
- Chat/calls down in one region
- Wallet operations failing for >1% of users
- Multiple panic button activations
- Payment processing blocked
- > 50% of error budget consumed

**Impact:** Significant revenue loss, poor user experience, approaching P0

**Escalation:** Notify on-call engineer + incident channel

---

### P2 — MEDIUM: Timely Response Required

**Response Time:** 1 hour  
**Description:** Degraded performance or non-critical feature issues

**Examples:**
- API latency 2x normal
- AI companions responding slowly
- Support ticket backlog growing
- Minor feature bugs
- 25-50% of error budget consumed

**Impact:** Degraded user experience, no immediate revenue impact

**Escalation:** Notify on-call engineer

---

### P3 — LOW: Next Business Day Response

**Response Time:** 24 hours  
**Description:** Minor issues, analytics problems, or cosmetic bugs

**Examples:**
- UI rendering glitches
- Analytics data delayed
- Non-critical API errors
- High churn prediction signals
- Performance optimization opportunities

**Impact:** Minimal user impact, operational awareness

**Escalation:** Standard ticket queue

---

## 6. ERROR BUDGET POLICIES

### 6.1 Error Budget Consumption Tracking

- **Real-time Dashboard:** Show current error budget consumption for each SLO
- **Weekly Reports:** Automated reports on error budget trends
- **Burn Rate Alerts:** Alert if consuming budget >2x expected rate

### 6.2 Error Budget Exhaustion Response

**When error budget is exhausted (>100% consumed):**

1. **Freeze Non-Critical Deployments:** Only critical bug fixes allowed
2. **Root Cause Analysis:** Mandatory RCA for incidents that consumed budget
3. **Recovery Plan:** Define actions to restore reliability before new features
4. **Post-Mortem:** Document lessons learned and prevention measures

**Budget Reset:**
- Monthly for 30-day SLOs
- Weekly for feature-specific SLOs
- Continuous tracking for incident metrics

### 6.3 Budget vs. Innovation Balance

- **>50% Budget Remaining:** Normal velocity, all deployments allowed
- **25-50% Budget Remaining:** Increase code review rigor, add pre-production testing
- **<25% Budget Remaining:** Deploy only critical fixes, defer feature work
- **Budget Exhausted:** Incident response mode, reliability work only

---

## 7. SLO INTEGRATION WITH INCIDENT SYSTEM

### 7.1 Automated Incident Creation

**SLO breaches automatically create incidents via PACK 417-419:**

- **P0 Incident:** Any SLO showing complete feature outage
- **P1 Incident:** SLO availability drops below error budget threshold
- **P2 Incident:** SLO latency consistently exceeds targets

### 7.2 Incident-to-SLO Mapping

| Incident Tier | SLO Impact | Error Budget Impact |
|---------------|------------|---------------------|
| P0 | Complete violation | Consumes 100% of daily budget |
| P1 | Partial violation | Consumes 25-50% of daily budget |
| P2 | Degradation | Consumes 10-25% of daily budget |
| P3 | Minimal | Monitoring only, no budget impact |

---

## 8. MONITORING & ALERTING ALIGNMENT

### 8.1 Alert Rule Mapping

All alert rules in [`pack421-alerting.config.ts`](functions/src/pack421-alerting.config.ts) are designed to fire BEFORE SLO thresholds are breached, providing early warning.

**Alert-to-SLO Relationship:**
- **P0 Alerts:** Fire at 50% of error budget consumption or complete outage
- **P1 Alerts:** Fire at 25% of error budget consumption
- **P2 Alerts:** Fire when trending toward SLO breach within 24 hours

### 8.2 Dashboards

**Required Dashboards:**

1. **SLO Dashboard:** Real-time view of all SLOs, error budgets, burn rates
2. **Incident Dashboard:** Active incidents linked to affected SLOs
3. **Feature Matrix:** Module health from [`pack421_health_featureMatrix`](functions/src/pack421-health.controller.ts)
4. **Regional Health:** Per-region SLO compliance

---

## 9. COMPLIANCE & AUDIT ALIGNMENT

### 9.1 Audit Log Integration (PACK 296)

- All SLO breaches logged to audit system
- Incident response actions logged
- Error budget consumption tracked in audit logs

### 9.2 Data Rights SLO (PACK 420)

**Target: 90% of data export requests completed within 30 days (GDPR compliance)**

**Error Budget:**
- 10% may take >30 days (complex cases, manual review)
- 0% should exceed 45 days (regulatory max)

**Measurement:**
- Metric: `product.data.export.completed` with completion time tag
- Evaluation Window: Rolling 30-day period

---

## 10. GETTING STARTED

### For Operations Team

1. **Configure Monitoring:** Set up dashboards in chosen observability provider (Datadog, GCP, etc.)
2. **Import Alert Rules:** Deploy alert configurations from `pack421-alerting.config.ts`
3. **Verify Health Checks:** Test health endpoints are accessible by load balancers
4. **Set Up Notifications:** Configure Slack webhooks, email, PagerDuty integrations
5. **Baseline Metrics:** Collect 7 days of baseline data before enforcing SLOs

### For Engineering Team

1. **Instrument Code:** Add metric emission to critical paths (see instrumentation guide)
2. **Error Budget Awareness:** Check error budget before deploying changes
3. **Incident Participation:** Respond to incidents per tier response times
4. **Post-Mortems:** Document learnings after incidents that consume >10% of budget

### For Product Team

1. **Feature Impact:** Consider SLO impact when designing new features
2. **Error Budget Allocation:** Request budget for risky experiments
3. **User Experience:** Use SLOs as user satisfaction proxy
4. **Roadmap Planning:** Balance features against reliability investment

---

## REVISION HISTORY

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-12-31 | Initial SLO targets and error budgets |

---

## REFERENCES

- [PACK 421 Implementation](PACK_421_IMPLEMENTATION.md)
- [Alert Configuration](functions/src/pack421-alerting.config.ts)
- [Health Endpoints](functions/src/pack421-health.controller.ts)
- [Metrics Types](shared/types/pack421-observability.types.ts)
- [Incident System (PACK 417-419)](PACK_417_419_IMPLEMENTATION.md)
- [Audit Logs (PACK 296)](PACK_296_IMPLEMENTATION.md)
