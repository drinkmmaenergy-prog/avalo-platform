# PACK 421 — Critical Path Instrumentation Guide

**Stage:** E — Post-Launch Stabilization & Compliance  
**Date:** December 31, 2024

## Overview

This guide provides concrete examples for instrumenting existing Avalo systems with PACK 421 observability metrics. Integration points are organized by pack/feature area.

## Core Import Pattern

```typescript
// Add to any file that needs to emit metrics
import { 
  metricCount, 
  metricTiming, 
  metricTimer,
  createTaggedEmitter,
} from './pack421-metrics.adapter';
```

---

## 1. WALLET & TOKEN STORE (PACK 255/277)

### Location: `functions/src/wallet/wallet.service.ts`

### 1.1 Token Spend Operations

```typescript
// Example: spendTokens function
async function spendTokens(
  userId: string, 
  amount: number, 
  reason: string,
  metadata?: any
): Promise<SpendResult> {
  const timer = metricTimer('product.wallet.spend.success', [
    { key: 'feature', value: reason },
    { key: 'region', value: getUserRegion(userId) },
  ]);

  try {
    // ... existing spend logic ...
    
    // Success metric
    await timer.end(); // Emits timing metric
    await metricCount('product.wallet.spend.success', 1, [
      { key: 'feature', value: reason },
      { key: 'splitType', value: metadata?.splitType || 'default' },
    ]);
    
    return { success: true, newBalance };
  } catch (error) {
    // Failure metric
    await metricCount('product.wallet.spend.failed', 1, [
      { key: 'reason', value: error.code || 'unknown' },
      { key: 'feature', value: reason },
    ]);
    
    throw error;
  }
}
```

### 1.2 Payout Requests

```typescript
// Example: requestPayout function
async function requestPayout(
  userId: string,
  amount: number,
  method: string
): Promise<PayoutResult> {
  try {
    // ... existing payout logic ...
    
    await metricCount('product.wallet.payout.requested', 1, [
      { key: 'method', value: method },
      { key: 'amount_range', value: getAmountRange(amount) },
    ]);
    
    return result;
  } catch (error) {
    await metricCount('product.wallet.payout.failed', 1, [
      { key: 'reason', value: error.code },
      { key: 'method', value: method },
    ]);
    
    throw error;
  }
}
```

### 1.3 Low Balance Detection

```typescript
// Example: Check balance after spend
async function checkLowBalance(userId: string, balance: number): Promise<void> {
  const threshold = 100; // 100 tokens
  
  if (balance < threshold) {
    await metricCount('product.wallet.balance.low', 1, [
      { key: 'userId', value: userId },
      { key: 'balance_range', value: balance < 50 ? 'critical' : 'warning' },
    ]);
  }
}
```

---

## 2. CHAT & MONETIZATION (PACK 268x, 273-280)

### Location: `functions/src/chat/chat.service.ts`

### 2.1 Message Send with Billing

```typescript
// Example: sendPaidChatMessage function
async function sendPaidChatMessage(
  senderId: string,
  recipientId: string,
  message: string,
  relationship: 'fan_to_creator' | 'peer_to_peer'
): Promise<MessageResult> {
  const timer = metricTimer('product.chat.latency_ms', [
    { key: 'relationType', value: relationship },
  ]);

  try {
    // ... existing message send + billing logic ...
    
    await timer.end();
    await metricCount('product.chat.message.count', 1, [
      { key: 'relationType', value: relationship },
      { key: 'monetizationTier', value: getMonetizationTier(recipientId) },
    ]);
    
    // If message triggered bucket billing
    if (billedBucket) {
      await metricCount('product.chat.bucket.billed', 1, [
        { key: 'bucketSize', value: bucketSize.toString() },
      ]);
    }
    
    return { success: true, messageId };
  } catch (error) {
    await metricCount('product.chat.failed.count', 1, [
      { key: 'reason', value: error.code || 'unknown' },
      { key: 'stage', value: error.stage || 'send' },
    ]);
    
    throw error;
  }
}
```

### 2.2 Bucket Billing Events

```typescript
// Example: chargeBucket function
async function chargeBucket(
  userId: string,
  bucketSize: number,
  recipientId: string
): Promise<void> {
  try {
    // ... charge logic ...
    
    await metricCount('product.wallet.spend.success', 1, [
      { key: 'feature', value: 'chat_bucket' },
      { key: 'bucketSize', value: bucketSize.toString() },
    ]);
  } catch (error) {
    await metricCount('product.wallet.spend.failed', 1, [
      { key: 'feature', value: 'chat_bucket' },
      { key: 'reason', value: error.code },
    ]);
    
    throw error;
  }
}
```

---

## 3. VOICE & VIDEO CALLS (PACK 273-280)

### Location: `functions/src/calls/call.service.ts`

### 3.1 Call Initiation

```typescript
// Example: startCall function
async function startCall(
  callerId: string,
  calleeId: string,
  type: 'voice' | 'video',
  vipTier?: string
): Promise<CallSession> {
  const timer = metricTimer('product.call.started.count', [
    { key: 'type', value: type },
    { key: 'vipTier', value: vipTier || 'standard' },
  ]);

  try {
    // ... WebRTC signaling setup ...
    // ... wallet billing setup ...
    
    await timer.end();
    await metricCount('product.call.started.count', 1, [
      { key: 'type', value: type },
      { key: 'vipTier', value: vipTier || 'standard' },
    ]);
    
    return callSession;
  } catch (error) {
    await metricCount('product.call.failed.count', 1, [
      { key: 'reason', value: error.code },
      { key: 'stage', value: error.stage || 'setup' },
      { key: 'type', value: type },
    ]);
    
    throw error;
  }
}
```

### 3.2 WebRTC Errors

```typescript
// Example: WebRTC error handler
async function handleWebRTCError(
  callId: string,
  errorType: string,
  details: any
): Promise<void> {
  await metricCount('product.call.webrtc.error.count', 1, [
    { key: 'errorType', value: errorType },
    { key: 'stage', value: details.stage },
  ]);
  
  // Also emit general call failure
  await metricCount('product.call.failed.count', 1, [
    { key: 'reason', value: 'webrtc_error' },
    { key: 'errorType', value: errorType },
  ]);
}
```

### 3.3 Call Duration Tracking

```typescript
// Example: endCall function
async function endCall(
  callId: string,
  durationSeconds: number
): Promise<void> {
  await metricGauge('product.call.duration_seconds', durationSeconds, [
    { key: 'callId', value: callId },
  ]);
}
```

---

## 4. SAFETY & ENFORCEMENT (PACK 267-268, 417-420)

### Location: `functions/src/safety/incident.service.ts`

### 4.1 Safety Incident Creation

```typescript
// Example: createIncident function
async function createIncident(
  reporterId: string,
  reportedUserId: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  source: 'report' | 'panic' | 'automated'
): Promise<Incident> {
  try {
    // ... create incident logic ...
    
    await metricCount('product.safety.incident.count', 1, [
      { key: 'severity', value: severity },
      { key: 'source', value: source },
      { key: 'region', value: getUserRegion(reportedUserId) },
    ]);
    
    // Special metric for panic button
    if (source === 'panic') {
      await metricCount('product.safety.panic.activated', 1, [
        { key: 'severity', value: severity },
        { key: 'region', value: getUserRegion(reporterId) },
      ]);
    }
    
    return incident;
  } catch (error) {
    functions.logger.error('Failed to create safety incident', { error });
    throw error;
  }
}
```

### 4.2 Incident Resolution

```typescript
// Example: resolveIncident function
async function resolveIncident(
  incidentId: string,
  resolution: string,
  actionTaken: string
): Promise<void> {
  await metricCount('product.safety.incident.resolved', 1, [
    { key: 'resolution', value: resolution },
    { key: 'actionTaken', value: actionTaken },
  ]);
}
```

### 4.3 Automated Safety Actions

```typescript
// Example: Automated content flagging
async function automaticContentFlag(
  userId: string,
  contentId: string,
  reason: string
): Promise<void> {
  await metricCount('product.safety.automated.action', 1, [
    { key: 'action', value: 'content_flag' },
    { key: 'reason', value: reason },
  ]);
}
```

---

## 5. DATA RIGHTS (PACK 420)

### Location: `functions/src/privacy/data-rights.service.ts`

### 5.1 Data Request Creation

```typescript
// Example: createDataRequest function
async function createDataRequest(
  userId: string,
  type: 'EXPORT' | 'DELETE' | 'RESTRICT'
): Promise<DataRequest> {
  await metricCount('product.data.request.count', 1, [
    { key: 'type', value: type },
    { key: 'region', value: getUserRegion(userId) },
  ]);
  
  // ... create request logic ...
}
```

### 5.2 Data Export Completion

```typescript
// Example: completeDataExport function
async function completeDataExport(
  requestId: string,
  durationMinutes: number
): Promise<void> {
  await metricCount('product.data.export.completed', 1, [
    { key: 'durationRange', value: getDurationRange(durationMinutes) },
  ]);
  
  await metricTiming(
    'product.data.export.latency_ms',
    durationMinutes * 60 * 1000,
    [{ key: 'requestId', value: requestId }]
  );
}
```

### 5.3 Data Deletion Completion

```typescript
// Example: completeDataDeletion function
async function completeDataDeletion(
  requestId: string,
  collectionsDeleted: string[]
): Promise<void> {
  await metricCount('product.data.delete.completed', 1, [
    { key: 'collectionCount', value: collectionsDeleted.length.toString() },
  ]);
}
```

---

## 6. GROWTH & RETENTION (PACK 301/301A/301B)

### Location: `functions/src/growth/growth.service.ts`

### 6.1 User Signup

```typescript
// Example: onUserSignup function
async function onUserSignup(
  userId: string,
  platform: 'android' | 'ios' | 'web',
  region: string
): Promise<void> {
  await metricCount('growth.signup.count', 1, [
    { key: 'platform', value: platform },
    { key: 'region', value: region },
  ]);
}
```

### 6.2 Onboarding Stage Completion

```typescript
// Example: completeOnboardingStage function
async function completeOnboardingStage(
  userId: string,
  stage: string
): Promise<void> {
  await metricCount('growth.activation.stage.completed', 1, [
    { key: 'stage', value: stage },
  ]);
}
```

### 6.3 Churn Risk Detection

```typescript
// Example: Churn prediction model output
async function markHighChurnRisk(
  userId: string,
  riskScore: number
): Promise<void> {
  if (riskScore > 0.7) {
    await metricCount('growth.churn.prediction.high_risk', 1, [
      { key: 'riskBucket', value: getRiskBucket(riskScore) },
    ]);
  }
}
```

### 6.4 Win-back Success

```typescript
// Example: Win-back campaign success
async function recordWinbackSuccess(
  userId: string,
  campaignType: string
): Promise<void> {
  await metricCount('growth.winback.success.count', 1, [
    { key: 'campaignType', value: campaignType },
  ]);
}
```

### 6.5 Referral Completion

```typescript
// Example: Referral successfully completed
async function recordReferralComplete(
  referrerId: string,
  referredId: string
): Promise<void> {
  await metricCount('growth.referral.completed', 1, [
    { key: 'region', value: getUserRegion(referrerId) },
  ]);
}
```

---

## 7. SUPPORT (PACK 300/300A/300B)

### Location: `functions/src/support/support.service.ts`

### 7.1 Support Ticket Creation

```typescript
// Example: createSupportTicket function
async function createSupportTicket(
  userId: string,
  category: string,
  priority: string
): Promise<Ticket> {
  try {
    // ... create ticket logic ...
    
    await metricCount('product.support.ticket.created', 1, [
      { key: 'category', value: category },
      { key: 'priority', value: priority },
    ]);
    
    // Also emit generic HTTP metric
    await metricCount('infra.http.request.count', 1, [
      { key: 'route', value: 'support:createTicket' },
      { key: 'status', value: '200' },
    ]);
    
    return ticket;
  } catch (error) {
    await metricCount('infra.http.request.count', 1, [
      { key: 'route', value: 'support:createTicket' },
      { key: 'status', value: '500' },
    ]);
    
    throw error;
  }
}
```

### 7.2 Ticket Resolution

```typescript
// Example: resolveTicket function
async function resolveTicket(
  ticketId: string,
  resolutionTimeMinutes: number
): Promise<void> {
  await metricCount('product.support.ticket.resolved', 1);
  
  await metricTiming('product.support.response.latency_ms', 
    resolutionTimeMinutes * 60 * 1000,
    [{ key: 'ticketId', value: ticketId }]
  );
}
```

---

## 8. AI COMPANIONS (PACK 279)

### Location: `functions/src/ai/companion.service.ts`

### 8.1 AI Interaction

```typescript
// Example: sendAIMessage function
async function sendAIMessage(
  userId: string,
  companionId: string,
  message: string
): Promise<AIResponse> {
  const timer = metricTimer('product.ai.response.latency_ms', [
    { key: 'companionId', value: companionId },
  ]);

  try {
    // ... AI processing ...
    
    await timer.end();
    await metricCount('product.ai.interaction.count', 1, [
      { key: 'companionType', value: getCompanionType(companionId) },
    ]);
    
    return response;
  } catch (error) {
    await metricCount('product.ai.model.error.count', 1, [
      { key: 'errorType', value: error.code },
      { key: 'model', value: getModelName() },
    ]);
    
    throw error;
  }
}
```

---

## 9. EVENTS & MEETINGS (PACK 240+, 218)

### Location: `functions/src/events/event.service.ts`

### 9.1 Event Creation

```typescript
async function createEvent(
  creatorId: string,
  eventType: string
): Promise<Event> {
  await metricCount('product.event.created', 1, [
    { key: 'eventType', value: eventType },
  ]);
  
  // ... event creation logic ...
}
```

### 9.2 Event Join

```typescript
async function joinEvent(
  userId: string,
  eventId: string
): Promise<void> {
  await metricCount('product.event.joined', 1, [
    { key: 'eventType', value: getEventType(eventId) },
  ]);
}
```

### 9.3 Meeting Completion

```typescript
async function completeMeeting(
  meetingId: string,
  durationMinutes: number
): Promise<void> {
  await metricCount('product.meeting.completed', 1);
  await metricGauge('product.meeting.duration_minutes', durationMinutes);
}
```

---

## 10. FRAUD & RISK (PACK 302/352+)

### Location: `functions/src/fraud/fraud-detection.service.ts`

### 10.1 Fraud Detection Trigger

```typescript
async function detectFraud(
  userId: string,
  riskScore: number,
  reason: string
): Promise<void> {
  if (riskScore > FRAUD_THRESHOLD) {
    await metricCount('fraud.detection.triggered', 1, [
      { key: 'reason', value: reason },
      { key: 'riskLevel', value: getRiskLevel(riskScore) },
    ]);
  }
}
```

### 10.2 Account Suspension

```typescript
async function suspendAccount(
  userId: string,
  reason: string
): Promise<void> {
  await metricCount('fraud.account.suspended', 1, [
    { key: 'reason', value: reason },
  ]);
}
```

### 10.3 Transaction Blocked

```typescript
async function blockTransaction(
  userId: string,
  transactionAmount: number,
  reason: string
): Promise<void> {
  await metricCount('fraud.transaction.blocked', 1, [
    { key: 'reason', value: reason },
    { key: 'amountRange', value: getAmountRange(transactionAmount) },
  ]);
}
```

---

## 11. INFRASTRUCTURE METRICS

### 11.1 HTTP Request Middleware

```typescript
// Example: Express/Functions middleware
import { metricTiming, metricCount } from './pack421-metrics.adapter';

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  
  res.on('finish', async () => {
    const duration = Date.now() - startTime;
    
    await metricTiming('infra.http.request.latency_ms', duration, [
      { key: 'endpoint', value: req.path },
      { key: 'method', value: req.method },
      { key: 'status', value: res.statusCode.toString() },
    ]);
    
    await metricCount('infra.http.request.count', 1, [
      { key: 'endpoint', value: req.path },
      { key: 'status', value: res.statusCode.toString() },
    ]);
  });
  
  next();
}
```

### 11.2 Function Error Tracking

```typescript
// Example: Wrap Firebase Functions
export function withMetrics(
  functionName: string,
  handler: (data: any, context: any) => Promise<any>
) {
  return async (data: any, context: any) => {
    const timer = metricTimer('infra.function.latency_ms', [
      { key: 'function', value: functionName },
    ]);
    
    try {
      const result = await handler(data, context);
      await timer.end();
      return result;
    } catch (error) {
      await metricCount('infra.function.error.count', 1, [
        { key: 'function', value: functionName },
        { key: 'errorType', value: error.code || 'unknown' },
      ]);
      throw error;
    }
  };
}

// Usage:
export const myFunction = functions.https.onCall(
  withMetrics('myFunction', async (data, context) => {
    // ... function logic ...
  })
);
```

### 11.3 Database Query Tracking

```typescript
// Example: Firestore query wrapper
async function trackedQuery<T>(
  collectionName: string,
  queryFn: () => Promise<T>
): Promise<T> {
  const timer = metricTimer('infra.db.query.latency_ms', [
    { key: 'collection', value: collectionName },
  ]);
  
  try {
    const result = await queryFn();
    await timer.end();
    
    await metricCount('infra.db.read.count', 1, [
      { key: 'collection', value: collectionName },
    ]);
    
    return result;
  } catch (error) {
    functions.logger.error('Database query failed', { error, collectionName });
    throw error;
  }
}

// Usage:
const users = await trackedQuery('users', () =>
  firestore.collection('users').where('status', '==', 'active').get()
);
```

---

## 12. TAGGED EMITTER PATTERN

For services that emit many related metrics, use a tagged emitter:

```typescript
// Example: Wallet service with common tags
const walletMetrics = createTaggedEmitter([
  { key: 'service', value: 'wallet' },
  { key: 'version', value: 'v2' },
]);

// All metrics from this emitter will include the base tags
await walletMetrics.count('product.wallet.spend.success', 1, [
  { key: 'feature', value: 'chat' },
]);
// Emits with tags: service=wallet, version=v2, feature=chat
```

---

## 13. DEPLOYMENT CHECKLIST

### Pre-Deployment
- [ ] Review all critical paths in your feature area
- [ ] Identify success/failure points
- [ ] Choose appropriate metric names from [`pack421-observability.types.ts`](shared/types/pack421-observability.types.ts)
- [ ] Add metric emissions (use examples above)
- [ ] Test in local/dev (metrics will be logged, not sent)

### Post-Deployment
- [ ] Verify metrics appear in observability dashboard
- [ ] Set up relevant alerts in alerting config
- [ ] Document any custom tags or thresholds
- [ ] Monitor for 48 hours to ensure no performance impact

### Performance Considerations
- Metrics emission is async and wrapped in try/catch
- **NEVER** blocks business logic
- Minimal overhead (<1ms per emission in production)
- Safe to emit liberally

---

## 14. TESTING METRICS

```typescript
// Example: Unit test for metric emission
import * as metricsAdapter from './pack421-metrics.adapter';

describe('Wallet Service', () => {
  beforeEach(() => {
    jest.spyOn(metricsAdapter, 'metricCount').mockResolvedValue();
  });

  it('emits success metric on spend', async () => {
    await spendTokens('user123', 100, 'chat');
    
    expect(metricsAdapter.metricCount).toHaveBeenCalledWith(
      'product.wallet.spend.success',
      1,
      expect.arrayContaining([
        { key: 'feature', value: 'chat' },
      ])
    );
  });

  it('emits failure metric on error', async () => {
    await expect(spendTokens('user123', 99999, 'chat')).rejects.toThrow();
    
    expect(metricsAdapter.metricCount).toHaveBeenCalledWith(
      'product.wallet.spend.failed',
      1,
      expect.any(Array)
    );
  });
});
```

---

## SUMMARY

### Key Principles

1. **Non-Blocking:** Metrics never break business logic
2. **Consistent Naming:** Use canonical names from types file
3. **Useful Tags:** Add dimensions for filtering (region, feature, error type)
4. **Success + Failure:** Always track both outcomes
5. **Timing Critical Paths:** Use `metricTimer` for performance tracking

### Priority Order

1. **P0 — Critical Money Flows:** Wallet operations, payouts
2. **P1 — Core Features:** Chat, calls, safety incidents
3. **P2 — Supporting Systems:** Support, data rights, growth
4. **P3 — Infrastructure:** HTTP requests, DB queries, errors

### Getting Help

- Review [Observability Types](shared/types/pack421-observability.types.ts)
- Check [SLO Targets](PACK_421_SLO_TARGETS_AND_ERROR_BUDGETS.md)
- See [Audit Alignment](PACK_296_ADDENDUM_OBSERVABILITY.md)
- Contact: ops@avalo.app for observability questions

---

**Next:** [Deploy and Export Health Endpoints](functions/src/index.ts)
