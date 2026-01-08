# Chat Operations Runbook

## Overview

Chat system issues, message delivery failures, and real-time communication problems.

## Common Issues

### 1. Message Delivery Failures

**Diagnosis:**
```bash
# Check failed messages
firebase firestore:query messages \
  --where delivered==false \
  --where createdAt>="{timestamp}" \
  --limit=100

# Check delivery latency
./scripts/check-chat-latency.sh
```

**Resolution:**
```bash
# Retry failed messages
node scripts/retry-failed-messages.js --since=1h

# Check WebSocket connections
node scripts/check-ws-connections.js

# Restart message queue
gcloud run services update avalo-chat --revision-suffix=$(date +%s)
```

### 2. Chat Pricing Issues

**Diagnosis:**
```bash
# Check pricing configuration
firebase firestore:get chats/{chatId}/pricing

# Verify free message count
node scripts/check-free-messages.js --chatId={chatId}
```

**Resolution:**
```bash
# Reset free message counter
firebase firestore:update chats/{chatId} \
  --data '{"freeMessagesUsed":0}'

# Update pricing
node scripts/update-chat-pricing.js --chatId={chatId} --price=5.00
```

### 3. Real-Time Sync Problems

**Diagnosis:**
```bash
# Check presence status
firebase firestore:get presence/{userId}

# Monitor active connections
./scripts/monitor-realtime-connections.sh
```

**Resolution:**
```bash
# Force reconnection
node scripts/force-reconnect.js --userId={userId}

# Clear stale presence
node scripts/cleanup-stale-presence.js --olderThan=5m
```

## Monitoring
- Message delivery rate: >99.5%
- Latency p95: <500ms
- Failed deliveries: <0.5%