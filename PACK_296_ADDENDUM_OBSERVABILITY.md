# PACK 296 Addendum — Observability & Audit Alignment

**Related:** PACK 421 — Observability, Reliability & Incident Monitoring Engine  
**Date:** December 31, 2024

## Overview

This document clarifies the relationship between PACK 296 (Audit Logs) and PACK 421 (Observability & Metrics), ensuring proper separation of concerns while maintaining comprehensive system visibility.

## Core Principle: Separation of Concerns

### Audit Logs (PACK 296)
**Purpose:** Compliance, security, user action tracking

**Contents:**
- Who did what, when, and where
- User actions (profile updates, content creation/deletion)
- Admin actions (bans, content moderation, policy changes)
- Security events (login attempts, permission changes)
- Data rights requests and fulfillment (PACK 420)
- Enforcement actions (PACK 417-419)

**Storage:** Firestore `audit_logs` collection (secure, immutable)  
**Retention:** Long-term (years) for compliance  
**Access:** Restricted to authorized admin/audit roles

### Metrics (PACK 421)
**Purpose:** Performance monitoring, system health, operational insights

**Contents:**
- Request counts, latencies, error rates
- Feature usage statistics (aggregated)
- System resource utilization
- Business KPIs (aggregated user behavior)
- SLO compliance data

**Storage:** Metrics backend (Datadog, Prometheus, GCP Monitoring)  
**Retention:** Medium-term (days to months) for operational analysis  
**Access:** Engineering and operations teams

---

## Data Classification Matrix

| Data Type | Audit Log | Metric | Storage | Retention |
|-----------|-----------|--------|---------|-----------|
| User login success/failure | ✅ | ✅ (count only) | Audit: Firestore<br>Metric: Observability | Audit: 7 years<br>Metric: 90 days |
| User profile update | ✅ (full details) | ❌ | Firestore | 7 years |
| Chat message sent | ❌ | ✅ (count, latency) | Observability | 90 days |
| Wallet spend | ✅ (transaction details) | ✅ (success/fail count) | Audit: Firestore<br>Metric: Observability | Audit: 10 years<br>Metric: 90 days |
| Safety incident created | ✅ (full incident) | ✅ (count, severity) | Audit: Firestore<br>Metric: Observability | Audit: 7 years<br>Metric: 90 days |
| Panic button activation | ✅ (full context) | ✅ (count) | Audit: Firestore<br>Metric: Observability | Audit: 7 years<br>Metric: 90 days |
| Admin ban action | ✅ (full details) | ✅ (count) | Audit: Firestore<br>Metric: Observability | Audit: 10 years<br>Metric: 90 days |
| Data export request | ✅ (request details) | ✅ (count, completion time) | Audit: Firestore<br>Metric: Observability | Audit: 7 years<br>Metric: 90 days |
| API error | ❌ (unless security-relevant) | ✅ (count, type) | Observability | 90 days |
| Database query latency | ❌ | ✅ | Observability | 30 days |

---

## Privacy & Compliance Rules

### Rule 1: No PII in Metrics
**Metrics MUST NEVER contain:**
- User names, emails, phone numbers
- Message content
- Personal identifiable information
- Sensitive user data

**Allowed in Metrics:**
- User IDs (hashed if externally exposed)
- Aggregate counts
- Statistical values (p50, p95, p99 latencies)
- System-level identifiers

### Rule 2: Audit Logs for Accountability
**All actions that affect users or data MUST be audit logged:**
- Content moderation decisions
- Wallet transactions
- Enforcement actions
- Data rights request handling
- Permission changes

### Rule 3: Metrics for Operations
**System performance and health data goes to metrics:**
- Request rates and latencies
- Error counts and types
- Resource utilization
- Feature usage statistics (aggregated)

---

## Implementation Patterns

### Pattern 1: Dual Logging for Financial Transactions

```typescript
// Example: Wallet spend operation
import { auditLog } from './pack296-audit.service';
import { metricCount } from './pack421-metrics.adapter';

async function spendTokens(userId: string, amount: number, reason: string) {
  try {
    // ... perform spend logic ...
    
    // AUDIT LOG: Full transaction details for compliance
    await auditLog({
      action: 'wallet.spend',
      userId,
      details: {
        amount,
        reason,
        balanceBefore,
        balanceAfter,
        transactionId,
      },
      timestamp: Date.now(),
    });
    
    // METRIC: Aggregated success count for monitoring
    await metricCount('product.wallet.spend.success', 1, [
      { key: 'feature', value: reason },
      { key: 'region', value: userRegion },
    ]);
    
    return success;
  } catch (error) {
    // AUDIT LOG: Failure for investigation
    await auditLog({
      action: 'wallet.spend.failed',
      userId,
      details: { amount, reason, error: error.message },
      timestamp: Date.now(),
    });
    
    // METRIC: Failure count for alerting
    await metricCount('product.wallet.spend.failed', 1, [
      { key: 'reason', value: error.code },
    ]);
    
    throw error;
  }
}
```

### Pattern 2: Metrics Only for Performance Data

```typescript
// Example: API request monitoring
import { metricTiming } from './pack421-metrics.adapter';

app.use(async (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', async () => {
    const duration = Date.now() - startTime;
    
    // METRIC ONLY: No audit log needed for routine API calls
    await metricTiming('infra.http.request.latency_ms', duration, [
      { key: 'endpoint', value: req.path },
      { key: 'method', value: req.method },
      { key: 'status', value: res.statusCode.toString() },
    ]);
  });
  
  next();
});
```

### Pattern 3: Audit Only for Security Events

```typescript
// Example: Failed login attempt
import { auditLog } from './pack296-audit.service';

async function handleLoginAttempt(email: string, password: string, ip: string) {
  const user = await findUserByEmail(email);
  
  if (!user || !await verifyPassword(password, user.passwordHash)) {
    // AUDIT LOG: Security event for investigation
    await auditLog({
      action: 'auth.login.failed',
      userId: user?.id || 'unknown',
      details: {
        email,
        ip,
        reason: user ? 'invalid_password' : 'user_not_found',
      },
      timestamp: Date.now(),
    });
    
    // Could also emit metric for rate limiting/monitoring:
    await metricCount('infra.auth.failed.count', 1, [
      { key: 'reason', value: user ? 'invalid_password' : 'user_not_found' },
    ]);
    
    throw new UnauthorizedError();
  }
  
  // Success: Audit log only (metric not needed for every login)
  await auditLog({
    action: 'auth.login.success',
    userId: user.id,
    details: { ip },
    timestamp: Date.now(),
  });
  
  return createSession(user);
}
```

---

## Query Patterns

### Querying Audit Logs
**Use Case:** Investigation, compliance, security analysis

```typescript
// Find all actions by a specific user
const userActions = await firestore
  .collection('audit_logs')
  .where('userId', '==', userId)
  .where('timestamp', '>=', startDate)
  .orderBy('timestamp', 'desc')
  .get();

// Find all admin enforcement actions
const enforcements = await firestore
  .collection('audit_logs')
  .where('action', '==', 'enforcement.ban')
  .where('timestamp', '>=', startDate)
  .get();
```

### Querying Metrics
**Use Case:** Performance analysis, alerting, dashboards

```typescript
// Example queries (pseudo-code, actual syntax depends on provider):

// Get API latency p95 over last hour
SELECT percentile(value, 95) 
FROM infra.http.request.latency_ms 
WHERE time > now() - 1h
GROUP BY endpoint;

// Get wallet spend failure rate
SELECT 
  sum(product.wallet.spend.failed) / 
  (sum(product.wallet.spend.success) + sum(product.wallet.spend.failed)) * 100
WHERE time > now() - 24h;
```

---

## Data Rights Compliance (PACK 420)

### Data Export Requests

When a user requests data export:

1. **Audit Log:** Record the request
   ```typescript
   await auditLog({
     action: 'data_rights.export_requested',
     userId,
     timestamp: Date.now(),
   });
   ```

2. **Include Audit Logs:** User's personal audit log must be included in export
   ```typescript
   const userAuditLogs = await firestore
     .collection('audit_logs')
     .where('userId', '==', userId)
     .get();
   ```

3. **Exclude Metrics:** Metrics are aggregated and not user-specific, so they are NOT included

4. **Completion Metric:**
   ```typescript
   await metricCount('product.data.export.completed', 1, [
     { key: 'type', value: 'EXPORT' },
   ]);
   ```

### Data Deletion Requests

When a user requests data deletion:

1. **Audit Log:** Record the request and completion
   ```typescript
   await auditLog({
     action: 'data_rights.delete_requested',
     userId,
     timestamp: Date.now(),
   });
   
   // After deletion:
   await auditLog({
     action: 'data_rights.delete_completed',
     userId,
     details: { deletedCollections: [...] },
     timestamp: Date.now(),
   });
   ```

2. **Delete Audit Logs:** User's personal audit logs CAN be deleted (per GDPR right to erasure)
   - EXCEPT logs required for legal/regulatory compliance (financial transactions, legal holds)

3. **Metrics Unaffected:** Aggregated metrics remain (no PII, so compliant)

---

## Alert Integration

### SLO Breaches → Audit Logs

When a critical SLO is breached (e.g., P0 incident):

```typescript
// Emit metric for alerting
await metricCount('infra.function.error.count', errorCount);

// Also create audit log for incident investigation
await auditLog({
  action: 'system.slo_breach',
  userId: 'system',
  details: {
    slo: 'api_availability',
    target: 99.9,
    actual: 98.5,
    errorBudgetConsumed: 75,
  },
  timestamp: Date.now(),
});
```

This ensures both operational alerting (metrics) and historical investigation (audit logs).

---

## Access Control

### Audit Logs Access
- **Read:** Admin role, audit role, compliance team
- **Write:** System only (application code)
- **Export:** Support for legal/compliance requests
- **Deletion:** Restricted (retention policies only)

### Metrics Access
- **Read:** Engineering, operations, product teams
- **Write:** System only (via metrics adapter)
- **Export:** Standard dashboards and reports
- **Deletion:** Automatic per retention policy

---

## Compliance Mapping

| Regulation | Audit Log Requirement | Metric Requirement |
|------------|----------------------|-------------------|
| GDPR | ✅ Must log data access, modifications, deletions | ❌ No PII allowed |
| PCI-DSS | ✅ Must log all payment transactions | ✅ Aggregate transaction metrics |
| SOC 2 | ✅ Must log admin actions, access controls | ✅ System availability metrics |
| CCPA | ✅ Must log data sales/sharing (if any) | ❌ No personal data |
| HIPAA (if applicable) | ✅ Must log PHI access | ❌ No PHI |

---

## Testing & Validation

### Audit Log Validation
```typescript
// Test: Ensure audit log is created for sensitive action
test('wallet spend creates audit log', async () => {
  await spendTokens(userId, 100, 'chat_message');
  
  const log = await getLatestAuditLog(userId);
  expect(log.action).toBe('wallet.spend');
  expect(log.details.amount).toBe(100);
});
```

### Metric Validation
```typescript
// Test: Ensure metric is emitted (may be no-op in test)
test('wallet spend emits success metric', async () => {
  const metricSpy = jest.spyOn(metricsAdapter, 'metricCount');
  
  await spendTokens(userId, 100, 'chat_message');
  
  expect(metricSpy).toHaveBeenCalledWith(
    'product.wallet.spend.success',
    1,
    expect.arrayContaining([
      { key: 'feature', value: 'chat_message' }
    ])
  );
});
```

---

## Migration & Rollout

### Phase 1: Metrics Infrastructure (PACK 421)
- Deploy health endpoints
- Configure metrics provider
- Add metrics to new code paths

### Phase 2: Critical Path Instrumentation
- Wallet operations
- Chat/calls
- Safety incidents

### Phase 3: Full Coverage
- All features emitting metrics
- SLO dashboards active
- Alert rules enabled

### Phase 4: Audit Log Cleanup
- Review existing audit logs
- Ensure compliance with retention policies
- Verify no PII leakage to metrics

---

## Summary: When to Use What

| Scenario | Audit Log | Metric | Both |
|----------|-----------|--------|------|
| User logs in | ❌ (unless failure) | ✅ Count | Login failure |
| User sends chat message | ❌ | ✅ Count, latency | ❌ |
| User spends tokens | ✅ Full transaction | ✅ Success/fail count | ✅ |
| User requests data export | ✅ Request + completion | ✅ Completion time | ✅ |
| Admin bans user | ✅ Full details | ✅ Count | ✅ |
| Safety incident created | ✅ Full incident | ✅ Count, severity | ✅ |
| API returns 500 error | ❌ (unless security) | ✅ Count | ❌ |
| Database query takes 2s | ❌ | ✅ Latency | ❌ |
| System health check runs | ❌ | ✅ Status | ❌ |

---

## References

- [PACK 296 — Audit Logs](PACK_296_IMPLEMENTATION.md)
- [PACK 421 — Observability Engine](PACK_421_IMPLEMENTATION.md)
- [PACK 420 — Data Rights](PACK_420_IMPLEMENTATION.md)
- [SLO Targets](PACK_421_SLO_TARGETS_AND_ERROR_BUDGETS.md)
- [Metrics Types](shared/types/pack421-observability.types.ts)
- [Metrics Adapter](functions/src/pack421-metrics.adapter.ts)
