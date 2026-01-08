# PACK 427 Test Plan — Global Messaging Queue, Offline Sync & Real-Time Delivery Engine

## Test Environment Setup

### Prerequisites
- Firebase Emulator Suite running
- Multiple test regions configured (EU, US, APAC)
- Test users in different regions
- Mock network conditions
- Test devices/simulators

### Test Data
- Test users with varying token balances
- Existing chat sessions
- Blocked user relationships
- Users with different age groups (18+)

---

## E2E Test Scenarios

### Scenario 1: User Online → Sends Message → Recipient Online (Same Region)

**Objective:** Verify real-time message delivery within same region

**Setup:**
- User A (EU region) online
- User B (EU region) online
- Both in active chat session

**Steps:**
1. User A sends text message
2. Wait for delivery confirmation
3. Verify User B receives message real-time
4. Check message appears in queue as PENDING
5. Verify message marked as DELIVERED
6. Confirm no duplicate messages
7. Verify correct message ordering

**Expected Results:**
- Message delivered within 2 seconds
- Single copy of message appears
- Queue entry marked DELIVERED
- Unread counter updated for User B
- No billing errors
- Audit log entries created

**Acceptance Criteria:**
- ✅ Message delivery time < 2s
- ✅ No duplicates
- ✅ Correct ordering maintained
- ✅ No double-billing occurred

---

### Scenario 2: User Offline → Receives Messages → Relaunches App After 24h

**Objective:** Verify offline sync retrieves all missed messages without duplication

**Setup:**
- User A online, sends 10 messages
- User B offline for 24 hours
- Messages include text, paid messages, and AI responses

**Steps:**
1. User A sends 10 messages while User B offline
2. Verify messages queued in messageQueue
3. User B stays offline for 24 hours
4. User B opens app after 24h
5. App calls `pack427_syncMessages`
6. Verify all 10 messages synced
7. Check message ordering
8. Confirm no duplicates
9. Verify billing state correct

**Expected Results:**
- All 10 messages retrieved in correct order
- No duplicate messages
- Paid messages correctly marked as billed
- Sync completes within 10 seconds
- Local cache updated correctly

**Acceptance Criteria:**
- ✅ All messages retrieved
- ✅ Correct chronological order
- ✅ No duplicate billing
- ✅ Sync time < 10s
- ✅ deviceSyncState updated correctly

---

### Scenario 3: Multi-Region Sender (EU) → Recipient (US)

**Objective:** Verify cross-region message delivery with PACK 426 routing

**Setup:**
- User A in EU region
- User B in US region
- Active chat between them

**Steps:**
1. User A (EU) sends message to User B (US)
2. Verify message enqueued in EU region initially
3. Check PACK 426 routing logic triggers
4. Verify message moved to US region queue
5. Confirm delivery to User B
6. Check latency metrics
7. Verify no message loss during region transfer

**Expected Results:**
- Message correctly routed to US region
- Cross-region latency within acceptable range (< 5s)
- No message loss
- Single delivery (no duplicates)
- Correct billing region applied

**Acceptance Criteria:**
- ✅ Message delivered cross-region
- ✅ Latency < 5s
- ✅ Correct region routing
- ✅ No duplicates
- ✅ Billing applied correctly

---

### Scenario 4: Network Flaps (On/Off Every Few Seconds)

**Objective:** Verify robust delivery during unstable network conditions

**Setup:**
- User A with unstable network
- Network toggles on/off every 3 seconds
- User A attempts to send 5 messages

**Steps:**
1. User A starts typing message
2. Network goes offline
3. User A sends message (queued locally)
4. Network comes online for 2 seconds
5. Network goes offline again
6. Repeat for 5 messages
7. Network stabilizes
8. Verify all messages delivered
9. Check queue handles retries correctly

**Expected Results:**
- All 5 messages queued locally when offline
- Messages sent when network available
- Exponential backoff applied correctly
- No message loss
- Correct delivery order maintained
- User sees "sending..." state appropriately

**Acceptance Criteria:**
- ✅ All messages eventually delivered
- ✅ Correct ordering preserved
- ✅ Backoff strategy applied
- ✅ No duplicates
- ✅ UI shows correct sending states

---

### Scenario 5: Fraud Protection - Massive Spam Attempt

**Objective:** Verify rate limiting and fraud detection prevent message flooding

**Setup:**
- User A attempts to spam User B
- PACK 302 fraud detection active

**Steps:**
1. User A sends 100 messages in 10 seconds
2. Verify PACK 302 fraud checks trigger
3. Confirm rate limiting applied
4. Check messages throttled appropriately
5. Verify User A temporarily blocked from sending
6. Confirm Risk Graph updated
7. Check User B not overwhelmed with notifications

**Expected Results:**
- First 60 messages/minute allowed (configurable)
- Additional messages rate-limited
- Fraud signals emitted correctly
- User A receives rate limit error
- System logs spam attempt
- Notifications throttled per PACK 293 rules

**Acceptance Criteria:**
- ✅ Rate limiting enforced
- ✅ Fraud signals logged
- ✅ User receives clear error message
- ✅ System not overloaded
- ✅ Risk Graph updated

---

### Scenario 6: AI Chat Sessions

**Objective:** Verify AI responses go through queue correctly with proper billing

**Setup:**
- User A in conversation with AI companion
- AI billing logic from existing packs active

**Steps:**
1. User A sends message to AI
2. AI generates response
3. Verify AI response enqueued
4. Check AI billing applied correctly (NOT by PACK 427)
5. Confirm response delivered to User A
6. Verify no double-billing
7. Check token deduction correct

**Expected Results:**
- AI responses enqueued same as human messages
- Queue does NOT handle AI billing (existing logic does)
- Response delivered reliably
- Correct token cost applied
- Message ordering preserved

**Acceptance Criteria:**
- ✅ AI responses queued correctly
- ✅ NO new billing by PACK 427
- ✅ Existing AI billing unchanged
- ✅ Token costs match existing logic
- ✅ Response delivery reliable

---

### Scenario 7: Typing Indicators & Read Receipts

**Objective:** Verify real-time UX signals work without impacting performance

**Setup:**
- User A and User B in active chat
- Real-time subscriptions active

**Steps:**
1. User A starts typing
2. Verify User B sees "User A is typing..."
3. User A stops typing for 10 seconds
4. Verify typing indicator disappears
5. User A sends message
6. User B reads message
7. Verify read receipt updated
8. Check unread counter decremented
9. Confirm TTL cleanup works

**Expected Results:**
- Typing indicator appears within 500ms
- Auto-expires after 10s inactivity
- Read receipt updates idempotently
- Unread counter accurate
- No tokenomics impact
- Minimal Firestore reads/writes

**Acceptance Criteria:**
- ✅ Typing indicator latency < 500ms
- ✅ TTL cleanup works
- ✅ Read receipts idempotent
- ✅ Unread counters accurate
- ✅ No billing impact

---

### Scenario 8: Paid Message Not Double-Charged

**Objective:** Ensure paid messages charged once regardless of delivery attempts

**Setup:**
- User A sending paid message to User B
- User B temporarily offline
- Message requires retry

**Steps:**
1. User A sends paid message (100 tokens)
2. Verify token deducted immediately (by PACK 273)
3. Initial delivery fails (User B offline)
4. Message marked FAILED, attempts incremented
5. Retry delivery succeeds
6. Verify no additional token deduction
7. Check billingState remains 'BILLED'
8. Confirm final delivery successful

**Expected Results:**
- Tokens deducted once on message creation
- Queue layer does NOT bill
- Multiple delivery attempts don't charge user
- billingState tracked correctly
- Message eventually delivered

**Acceptance Criteria:**
- ✅ Single token deduction
- ✅ PACK 273 handles billing
- ✅ Queue does NOT bill
- ✅ Delivery retries work
- ✅ No double-charging

---

### Scenario 9: Unread Counter Drift Detection & Repair

**Objective:** Verify system can detect and fix unread counter inconsistencies

**Setup:**
- User A has multiple chats
- Simulate counter drift (manual data corruption)

**Steps:**
1. Create artificial drift in unread counters
2. User A calls `pack427_getUnreadCounts`
3. System detects inconsistency
4. User A triggers `pack427_recalculateUnreadCounters`
5. Verify counters recalculated from source
6. Check all counters now accurate
7. Confirm UI updates correctly

**Expected Results:**
- Drift detected
- Recalculation completes successfully
- All counters accurate after repair
- Process completes within 30s
- No impact on other users

**Acceptance Criteria:**
- ✅ Drift detection works
- ✅ Recalculation accurate
- ✅ Completion time < 30s
- ✅ UI updates correctly

---

### Scenario 10: Message Queue Cleanup

**Objective:** Verify old delivered messages cleaned up to prevent storage bloat

**Setup:**
- 1000 delivered messages older than 7 days
- Scheduled cleanup function active

**Steps:**
1. Create 1000 old delivered messages (8+ days old)
2. Trigger `pack427_cleanupMessages` function
3. Verify old DELIVERED messages deleted
4. Confirm PENDING/FAILED messages retained
5. Check DROPPED messages handled correctly
6. Verify cleanup completes successfully
7. Confirm no active messages deleted

**Expected Results:**
- Old DELIVERED messages removed
- Active messages preserved
- Cleanup completes in batches
- No data loss for active conversations
- Storage usage reduced

**Acceptance Criteria:**
- ✅ Old messages cleaned up
- ✅ Active messages safe
- ✅ Batch processing works
- ✅ No data loss

---

### Scenario 11: Blocked User Cannot Send Messages

**Objective:** Verify blocking system integrated with message queue

**Setup:**
- User A blocked by User B
- User A attempts to send message

**Steps:**
1. User B blocks User A
2. User A attempts to send message to User B
3. Verify `validateSenderPermissions` fails
4. Check message NOT enqueued
5. Confirm User A receives error
6. Verify audit log entry created
7. Check User B not notified

**Expected Results:**
- Message rejected before queueing
- USER_BLOCKED error returned
- No queue entry created
- No notification sent
- Audit trail complete

**Acceptance Criteria:**
- ✅ Message blocked
- ✅ Clear error message
- ✅ No queue entry
- ✅ Audit logged

---

### Scenario 12: Age Restriction (Under 18)

**Objective:** Verify users under 18 cannot send messages (18+ platform)

**Setup:**
- Test user with age < 18
- Attempt to send message

**Steps:**
1. Create test user with age 17
2. Attempt to send message
3. Verify safety violation detected
4. Check message rejected
5. Confirm appropriate error returned
6. Verify audit log entry

**Expected Results:**
- Message rejected
- SAFETY_VIOLATION error
- No queue entry created
- Compliance with age restrictions

**Acceptance Criteria:**
- ✅ Under-18 users blocked
- ✅ Safety violation logged
- ✅ Compliance maintained

---

### Scenario 13: Retention Nudges (PACK 301/301B)

**Objective:** Verify win-back nudges use messaging queue

**Setup:**
- Inactive user with unread messages
- PACK 301B retention logic active

**Steps:**
1. User hasn't opened app in 7 days
2. Retention system triggers nudge
3. Verify nudge uses message queue
4. Check `systemNudge: true` in transportMetadata
5. Confirm notification sent via PACK 293
6. Verify throttling rules applied
7. Check nudge delivery tracked

**Expected Results:**
- Nudge enqueued correctly
- Marked as system nudge
- Notification sent appropriately
- Throttling prevents spam
- Delivery tracked

**Acceptance Criteria:**
- ✅ Nudges use queue
- ✅ System flag set
- ✅ Throttling works
- ✅ Tracking accurate

---

### Scenario 14: Device Sync Across Multiple Devices

**Objective:** Verify same user on multiple devices syncs correctly

**Setup:**
- User A on iPhone and iPad
- Both devices active

**Steps:**
1. Register both devices via `pack427_registerDevice`
2. Send message to User A
3. Verify both devices sync independently
4. Check no duplicate deliveries
5. Confirm deviceSyncState tracked per device
6. Read message on iPhone
7. Verify read state syncs to iPad

**Expected Results:**
- Both devices register successfully
- Messages sync to both devices
- No duplicates
- Read state syncs correctly
- Independent sync timestamps

**Acceptance Criteria:**
- ✅ Multi-device support works
- ✅ No duplicates
- ✅ Read state syncs
- ✅ Independent tracking

---

### Scenario 15: Max Attempts → Message DROPPED

**Objective:** Verify messages drop after max failed attempts

**Setup:**
- User B permanently offline (deleted account)
- User A sends message

**Steps:**
1. User A sends message to User B
2. All delivery attempts fail
3. Verify attempts counter increments
4. After 5 attempts (MAX_ATTEMPTS)
5. Check message status changes to DROPPED
6. Confirm audit log entry created
7. Verify User A notified of failure

**Expected Results:**
- Exponential backoff applied
- After 5 attempts, message DROPPED
- User A receives delivery failure notification
- Audit log records incident
- Queue doesn't retry DROPPED messages

**Acceptance Criteria:**
- ✅ Max attempts enforced
- ✅ Message dropped appropriately
- ✅ User notified
- ✅ Audit trail complete

---

## Performance Benchmarks

### Latency Requirements
- Same-region delivery: < 2 seconds
- Cross-region delivery: < 5 seconds
- Sync operation: < 10 seconds
- Typing indicator: < 500ms

### Throughput Requirements
- Process 200 messages/minute per region
- Handle 10,000 concurrent users
- Support 1000 syncs/minute

### Reliability Requirements
- 99.9% message delivery success rate
- 0% message duplication rate
- 0% double-billing incidents

---

## Integration Tests

### PACK Dependencies
- ✅ PACK 37/268 (Chat Core)
- ✅ PACK 273 (Paid Chat Engine)
- ✅ PACK 277 (Wallet/Token Store)
- ✅ PACK 293 (Notifications)
- ✅ PACK 296 (Audit Log)
- ✅ PACK 301/301A/301B (Retention & Nudges)
- ✅ PACK 302/352 (Fraud & Abuse Signals)
- ✅ PACK 426 (Multi-Region Infrastructure)

### Integration Points
- Billing handled exclusively by PACK 273
- Notifications via PACK 293
- Fraud checks via PACK 302
- Region routing via PACK 426
- Audit logging via PACK 296

---

## Security Tests

### Authentication
- ✅ All endpoints require authentication
- ✅ Users can only sync their own messages
- ✅ Users cannot read others' queue entries

### Authorization
- ✅ Chat participation validated
- ✅ Blocked users cannot send
- ✅ Age restrictions enforced

### Data Privacy
- ✅ Regional data stays in region (GDPR)
- ✅ Message content encrypted
- ✅ PII handling compliant

---

## Monitoring & Observability

### Metrics to Track
- Queue depth per region
- Message delivery time (p50, p95, p99)
- Failed delivery rate
- Dropped message count
- Sync operation duration
- Typing indicator latency

### Alerts
- Queue depth > 10,000 messages
- Delivery failure rate > 1%
- Sync duration > 30 seconds
- Region unavailable

---

## Rollback Plan

### Failure Scenarios
1. **High failure rate:** Disable queue workers, fall back to direct delivery
2. **Data loss:** Restore from PENDING/FAILED messages
3. **Billing issues:** Halt all new enqueues, audit all transactions

### Rollback Steps
1. Disable Cloud Function triggers
2. Stop enqueueing new messages
3. Allow queue to drain
4. Switch to previous delivery mechanism
5. Audit all transactions for correctness

---

## Success Criteria Summary

### Must Have
- ✅ Zero double-billing incidents
- ✅ < 0.1% message loss rate
- ✅ < 0.1% duplicate message rate
- ✅ 99.9% delivery success rate
- ✅ Billing logic unchanged from PACK 273

### Nice to Have
- Enhanced delivery speed
- Better offline support
- Unified monitoring dashboard
- Automated drift detection

---

## Sign-Off

**Test Execution:** [Date]  
**Test Lead:** [Name]  
**Status:** [ ] PASSED / [ ] FAILED  
**Production Ready:** [ ] YES / [ ] NO  

**Notes:**
