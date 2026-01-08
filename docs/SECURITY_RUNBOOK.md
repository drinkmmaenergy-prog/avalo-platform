# Avalo Security Operations Center (ASOC) — Runbook

## Overview

The Avalo Security Operations Center (ASOC) is an automated anomaly detection and incident management system that monitors platform health and detects suspicious activity.

---

## Monitoring Schedule

- **Frequency**: Every 5 minutes
- **Function**: `securityMonitoringScheduler`
- **Region**: europe-west3
- **Timeout**: 540 seconds
- **Memory**: 512MB

---

## Incident Types

### 1. UNUSUAL_TOKEN_DRAIN

**Description**: Abnormal token spending rate detected

**Thresholds**:
- System-wide: >10,000 tokens/hour
- Per-user: >1,000 tokens/hour

**Severity Logic**:
- >50,000 tokens: CRITICAL
- >20,000 tokens: HIGH
- >10,000 tokens: MEDIUM
- Otherwise: LOW

**Potential Causes**:
- Bug in payment processing
- Unauthorized transaction API access
- Compromised admin account
- Price manipulation exploit

**Response Actions**:
1. Check recent transaction logs
2. Identify top spenders in last hour
3. Review transaction types (chat, calendar, tips, etc.)
4. Suspend suspicious accounts if confirmed abuse
5. Review code changes in payment modules

**Example Query**:
```javascript
db.collection("transactions")
  .where("createdAt", ">", oneHourAgo)
  .where("amount", "<", 0)  // Token debits
  .orderBy("createdAt", "desc")
  .limit(100)
```

---

### 2. RAPID_ACCOUNT_CREATION

**Description**: Spike in new account registrations

**Thresholds**:
- System-wide: >50 accounts/hour
- Per-IP: >5 accounts/hour

**Severity Logic**:
- >200 accounts: CRITICAL
- >100 accounts: HIGH
- >50 accounts: MEDIUM
- Otherwise: LOW

**Potential Causes**:
- Bot-driven account farming
- Marketing campaign (legitimate)
- API abuse
- Referral program exploit

**Response Actions**:
1. Check IP addresses of new accounts
2. Review account verification status
3. Enable CAPTCHA if not already active
4. Block suspicious IP ranges
5. Check for referral code abuse

**Example Query**:
```javascript
db.collection("users")
  .where("createdAt", ">", oneHourAgo)
  .orderBy("createdAt", "desc")
  .limit(100)
```

---

### 3. LARGE_TRANSACTION

**Description**: Single transaction exceeds safety threshold

**Threshold**: >5,000 tokens

**Severity Logic**:
- >50,000 tokens: HIGH
- >20,000 tokens: MEDIUM
- Otherwise: LOW

**Potential Causes**:
- Legitimate high-value purchase
- Price manipulation
- Refund fraud
- Admin error

**Response Actions**:
1. Review transaction details
2. Contact buyer and seller
3. Verify transaction legitimacy
4. Hold funds if suspicious
5. Review pricing logic for transaction type

**Example Data**:
```javascript
{
  incidentType: "large_transaction",
  details: {
    transactionId: "tx_abc123",
    amount: 10000,
    type: "calendar_booking",
    buyer: "user_xyz",
    seller: "creator_abc"
  }
}
```

---

### 4. SPAM_WAVE

**Description**: Excessive content creation (posts, messages, etc.)

**Threshold**: >10 posts/user/hour

**Severity**: MEDIUM

**Potential Causes**:
- Spam bot
- Compromised account
- Legitimate user activity (rare)
- Content scraping

**Response Actions**:
1. Review user's recent posts/messages
2. Check content similarity (copy-paste)
3. Temporary rate limit or shadow ban
4. Review moderation flags
5. Contact user if legitimate

**Example Query**:
```javascript
db.collection("feedPosts")
  .where("createdAt", ">", oneHourAgo)
  .where("uid", "==", suspiciousUserId)
  .orderBy("createdAt", "desc")
```

---

### 5. API_ABUSE

**Description**: Excessive API requests from single IP

**Threshold**: >100 requests/minute/IP

**Severity**: HIGH

**Potential Causes**:
- DDoS attack
- Misconfigured client app
- API scraping
- Load testing (unauthorized)

**Response Actions**:
1. Review rate limit bucket violations
2. Identify affected endpoints
3. Block IP at firewall/CDN level
4. Check for distributed attack (multiple IPs)
5. Notify infrastructure team

**Example Query**:
```javascript
db.collection("rateLimitBuckets")
  .where("violationCount", ">", 5)
  .where("lastViolationAt", ">", fiveMinutesAgo)
```

---

### 6. DDOS_ATTEMPT

**Description**: Distributed denial of service attack

**Severity**: CRITICAL (always)

**Detection**:
- Multiple IPs with high request rates
- Unusual traffic patterns
- Infrastructure alerts

**Response Actions**:
1. Enable DDoS protection at CDN (Cloudflare, etc.)
2. Activate rate limiting globally
3. Notify infrastructure team immediately
4. Monitor system resources (CPU, memory, DB connections)
5. Prepare incident communication for users

---

## Incident Deduplication

**Window**: 1 hour

Incidents of the same type within 1 hour are deduplicated to avoid alert fatigue.

**Logic**:
```typescript
const isDuplicate = existingIncidents.some(
  (existing) =>
    existing.type === newIncident.type &&
    newIncident.timestamp - existing.timestamp < 3600000
);
```

---

## Incident Workflow

### Status Transitions

```
OPEN → INVESTIGATING → RESOLVED
  ↓
FALSE_POSITIVE
```

### 1. OPEN

- Incident detected by monitoring
- Awaiting investigation
- **Action**: Assign to on-call engineer

### 2. INVESTIGATING

- Engineer reviewing incident
- Gathering evidence
- **Action**: Document findings in incident notes

### 3. RESOLVED

- Root cause identified
- Corrective action taken
- **Action**: Document resolution and preventive measures

### 4. FALSE_POSITIVE

- Incident determined to be non-issue
- **Action**: Adjust detection thresholds if needed

---

## API Endpoints

### Get Incidents (Admin)

```typescript
const incidents = await functions.httpsCallable('getSecurityIncidentsV1')({
  status: "open",  // or "investigating", "resolved", "false_positive"
  limit: 50,
  offset: 0
});

// Returns:
{
  incidents: [
    {
      incidentId: "inc_abc123",
      type: "unusual_token_drain",
      severity: "high",
      status: "open",
      details: {
        tokensSpent: 25000,
        threshold: 10000
      },
      detectedAt: Timestamp,
      resolvedAt?: Timestamp,
      assignedTo?: string,
      notes?: string
    }
  ],
  total: 5
}
```

### Update Incident (Admin)

```typescript
await functions.httpsCallable('updateSecurityIncidentV1')({
  incidentId: "inc_abc123",
  status: "resolved",
  notes: "False alarm - marketing campaign caused spike",
  assignedTo: "admin_user_id"
});
```

---

## Firestore Schema

### `securityIncidents/{incidentId}`

```typescript
{
  incidentId: string,
  type: IncidentType,
  severity: "low" | "medium" | "high" | "critical",
  status: "open" | "investigating" | "resolved" | "false_positive",
  details: {
    // Type-specific details
  },
  detectedAt: Timestamp,
  resolvedAt?: Timestamp,
  assignedTo?: string,
  resolvedBy?: string,
  notes?: string,
}
```

---

## Security Logs

All security events are logged to:
```
engineLogs/secops/{date}/{logId}
```

**Example Log Entry**:
```javascript
{
  timestamp: "2025-10-29T12:34:56Z",
  event: "incident_created",
  incidentId: "inc_abc123",
  type: "unusual_token_drain",
  severity: "high",
  details: { tokensSpent: 25000 }
}
```

---

## Alerting Integration

### Email Alerts

**Recipients**: security@avalo.app, oncall@avalo.app

**Trigger**: CRITICAL severity incidents

**Template**:
```
Subject: [CRITICAL] Avalo Security Incident: {type}

Incident ID: {incidentId}
Type: {type}
Severity: CRITICAL
Detected: {detectedAt}

Details:
{details}

View in dashboard: https://admin.avalo.app/security/incidents/{incidentId}
```

### Slack Integration

**Channel**: #security-alerts

**Webhooks**: POST to Slack webhook URL

**Format**:
```json
{
  "text": "🚨 Security Incident Detected",
  "attachments": [{
    "color": "danger",
    "fields": [
      { "title": "Type", "value": "unusual_token_drain", "short": true },
      { "title": "Severity", "value": "HIGH", "short": true },
      { "title": "Details", "value": "25,000 tokens spent in last hour" }
    ]
  }]
}
```

---

## Rate Limiting Integration

ASOC monitors rate limit violations from `rateLimitBuckets` collection.

**Detection**:
- 10+ violations per user per hour triggers API_ABUSE incident
- IP-level violations trigger DDOS_ATTEMPT investigation

---

## Device Trust Integration

ASOC monitors flagged devices from `deviceTrust` collection.

**Automatic Actions**:
- Devices flagged for multi-account abuse are logged
- Trust score drops trigger additional monitoring
- Blocked devices cannot perform transactions

---

## Performance Monitoring

### Monitoring Metrics

- Total incidents by type (last 24h)
- Incidents by severity (last 24h)
- Mean time to resolution (MTTR)
- False positive rate
- Scheduler execution time
- Alerting latency

### Dashboard Queries

```javascript
// Incidents by type (last 24h)
db.collection("securityIncidents")
  .where("detectedAt", ">", twentyFourHoursAgo)
  .orderBy("detectedAt", "desc")

// Open critical incidents
db.collection("securityIncidents")
  .where("severity", "==", "critical")
  .where("status", "in", ["open", "investigating"])
```

---

## Testing

See `functions/src/secops.test.ts` for unit tests covering:
- Token drain detection
- Account creation spike detection
- Large transaction flagging
- Spam wave detection
- API abuse detection
- Incident severity calculation
- Deduplication logic

---

## On-Call Procedures

### When Incident Alert Received

1. **Acknowledge** within 5 minutes
2. **Assess** severity and impact
3. **Investigate** using queries in this runbook
4. **Mitigate** threat if confirmed
5. **Document** findings and actions taken
6. **Resolve** incident when handled
7. **Post-mortem** for critical incidents

### Escalation Path

- **Low/Medium**: Handle during business hours
- **High**: Notify security lead
- **Critical**: Immediate response, escalate to CTO if needed

---

## Playbooks

### Token Drain Playbook

```bash
# 1. Check recent high-value transactions
firebase firestore:query "transactions" \
  --where "createdAt" ">" "$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S)" \
  --order-by "amount" --limit 50

# 2. Identify top spenders
# (Run custom script to aggregate by userId)

# 3. Check user accounts
firebase auth:get-user {userId}

# 4. Suspend account if malicious
firebase auth:update {userId} --disabled

# 5. Refund if fraud confirmed
# (Use refundByEarnerCallable function)
```

### Account Farm Playbook

```bash
# 1. Check accounts created in last hour
firebase firestore:query "users" \
  --where "createdAt" ">" "$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S)"

# 2. Group by IP (use admin script)

# 3. Block suspicious IPs
# (Update Cloudflare/Firewall rules)

# 4. Delete bot accounts
# (Use batch delete script with caution)
```

---

## Feature Flag

- **Flag Name**: `security_monitoring`
- **Default**: `true`
- **Purpose**: Enable/disable automated monitoring

---

## Future Enhancements

- Machine learning anomaly detection
- Predictive threat modeling
- Automated response actions (auto-ban, auto-refund)
- Integration with SIEM tools
- Real-time dashboard for security metrics
