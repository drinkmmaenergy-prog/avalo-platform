# PACK 339 — Testing & Validation Guide

## Disaster Recovery & Legal Crisis Management

---

## Pre-Testing Setup

### 1. Deploy All Components

```bash
# Run deployment script
./deploy-pack339.sh
# or for Windows
.\deploy-pack339.ps1
```

### 2. Initialize DR Plans

From Firebase Console or Admin SDK:

```javascript
const functions = firebase.functions();
const result = await functions.httpsCallable('pack339_initializeDisasterRecoveryPlans')();
console.log('Initialization:', result.data);
```

Expected output:
```json
{
  "success": true,
  "message": "Disaster recovery plans initialized"
}
```

### 3. Verify Collections Created

Check in Firestore Console:
- ✅ `disasterRecoveryPlans/PRODUCTION_DEFAULT`
- ✅ `disasterRecoveryPlans/STAGING_DEFAULT`
- ✅ `regulatorLockStates/GLOBAL`

---

## Test Suite

### Test 1: Incremental Backup

**Objective:** Verify 15-minute backup cycle works

**Steps:**

1. Manually trigger backup:
```bash
gcloud pubsub topics publish firebase-schedule-pack339_runIncrementalBackup --message '{}'
```

2. Wait 10-15 seconds, then check logs:
```bash
gcloud logging read "resource.type=cloud_function AND resource.labels.function_name=pack339_runIncrementalBackup" --limit 5
```

3. Verify in Firestore Console:
   - Navigate to `backupSnapshots` collection
   - Find newest document
   - Check fields:
     - ✅ `status: "SUCCESS"`
     - ✅ `type: "SCHEDULED"`
     - ✅ `env: "PRODUCTION"`
     - ✅ `storageLocation` present
     - ✅ `rpoMinutes` calculated
     - ✅ `completedAt` timestamp set

**Expected Result:** ✅ Backup snapshot created successfully

**If Failed:**
- Check function logs for errors
- Verify GCS bucket exists
- Check IAM permissions for Cloud Functions service account

---

### Test 2: Daily Full Backup

**Objective:** Verify full backup includes all components

**Steps:**

1. Manually trigger daily backup:
```bash
gcloud pubsub topics publish firebase-schedule-pack339_runDailyBackup --message '{}'
```

2. Check logs:
```bash
gcloud logging read "resource.type=cloud_function AND resource.labels.function_name=pack339_runDailyBackup" --limit 5
```

3. Verify snapshot includes all components:
   - ✅ `includes.firestore: true`
   - ✅ `includes.storageMedia: true`
   - ✅ `includes.functionsConfig: true`

**Expected Result:** ✅ Full backup created with all components

---

### Test 3: Backup Status Query

**Objective:** Verify admin can view backup status

**Steps:**

1. Call from Admin Console (requires OPS permissions):
```javascript
const result = await functions.httpsCallable('pack339_getBackupStatus')();
console.log('Backup Status:', result.data);
```

2. Verify output:
```json
{
  "success": true,
  "currentRPO": 5,
  "rpoTarget": 15,
  "rtoTarget": 120,
  "recentBackups": [
    {
      "id": "incremental_1702423456789",
      "status": "SUCCESS",
      "startedAt": 1702423450000,
      "completedAt": 1702423456000
    }
  ]
}
```

**Expected Result:** ✅ Current RPO displayed, recent backups listed

**Authorization Test:**
- Try calling without auth → should fail with `unauthenticated`
- Try calling as non-OPS admin → should fail with `permission-denied`

---

### Test 4: DR Simulation (STAGING ONLY)

**Objective:** Test disaster recovery procedures safely

**Steps:**

1. Get a recent staging backup snapshot ID:
```javascript
const status = await functions.httpsCallable('pack339_getBackupStatus')();
const snapshotId = status.data.recentBackups[0].id;
```

2. Run DR simulation:
```javascript
const result = await functions.httpsCallable('pack339_simulateDisasterRecovery')({
  env: 'STAGING',
  snapshotId: snapshotId
});
console.log('DR Simulation:', result.data);
```

3. Verify output:
```json
{
  "success": true,
  "validation": {
    "valid": true,
    "checks": [
      { "name": "Snapshot Status", "passed": true },
      { "name": "Storage Location", "passed": true },
      { "name": "RPO Target", "passed": true }
    ]
  },
  "restoreSimulation": [
    { "priority": "WALLET", "status": "SIMULATED", "estimatedTimeMinutes": 10 },
    { "priority": "AUTH", "status": "SIMULATED", "estimatedTimeMinutes": 10 }
  ],
  "estimatedRTOMinutes": 90
}
```

**Expected Result:** ✅ Validation passes, RTO estimate provided

**Safety Test:**
Try with `env: 'PRODUCTION'` → should fail with `failed-precondition`

---

### Test 5: Legal Hold - User-Specific

**Objective:** Verify legal hold freezes user operations

**Setup:**
Create test user: `test-user-legal-hold-001`

**Steps:**

1. Apply legal hold:
```javascript
const holdResult = await functions.httpsCallable('pack339_applyLegalHold')({
  userId: 'test-user-legal-hold-001',
  reason: 'FRAUD_INVESTIGATION',
  notes: 'Test case - automated testing'
});

console.log('Hold created:', holdResult.data);
```

2. Verify output:
```json
{
  "success": true,
  "holdId": "hold_1702423456789",
  "userId": "test-user-legal-hold-001",
  "reason": "FRAUD_INVESTIGATION"
}
```

3. Check `legalHolds` collection:
   - ✅ New document with `active: true`
   - ✅ `createdBy: "ADMIN"`
   - ✅ `createdByAdminId` matches admin who created

4. Check `regulatorAuditLogs` collection:
   - ✅ New log entry with `action: "LEGAL_HOLD_APPLIED"`

5. Test hold effect (simulate payout request):
```javascript
// This should fail if integrated with PACK 277
const hasHold = await hasActiveLegalHold('test-user-legal-hold-001');
console.log('Has Hold:', hasHold); // Should be true
```

6. Remove hold:
```javascript
await functions.httpsCallable('pack339_removeLegalHold')({
  holdId: holdResult.data.holdId
});
```

**Expected Result:** ✅ Hold applied, operations frozen, hold removed

**Authorization Test:**
- Try without LEGAL permissions → should fail
- Try as different admin with LEGAL perms → should succeed

---

### Test 6: Legal Hold - Global (Regulator Mode)

**Objective:** Verify global hold activates regulator lock

**Steps:**

1. Apply global hold:
```javascript
const holdResult = await functions.httpsCallable('pack339_applyLegalHold')({
  reason: 'REGULATOR_REQUEST',
  notes: 'Regulatory audit - test case'
});

console.log('Global hold created:', holdResult.data);
```

2. Verify regulator lock activated:
```javascript
const lockStatus = await functions.httpsCallable('pack339_getRegulatorLockStatus')();
console.log('Lock Status:', lockStatus.data);
```

Expected:
```json
{
  "success": true,
  "isRegulatorLockActive": true,
  "activatedAt": 1702423456000,
  "reason": "REGULATOR_REQUEST"
}
```

3. Check Admin Console:
   - ✅ Should display banner: "Regulator Lock Mode — limited operations"

4. Deactivate:
```javascript
await functions.httpsCallable('pack339_toggleRegulatorLock')({
  activate: false
});
```

**Expected Result:** ✅ Global lock activated, banner displayed, lock deactivated

---

### Test 7: Regulator Lock Toggle

**Objective:** Test manual lock activation

**Steps:**

1. Activate lock:
```javascript
const result = await functions.httpsCallable('pack339_toggleRegulatorLock')({
  activate: true,
  reason: 'Testing regulator mode'
});

console.log('Lock toggled:', result.data);
```

2. Verify effects:
   - ✅ Bulk deletions should be blocked
   - ✅ Large payouts (>10,000 PLN) require manual approval
   - ✅ Audit logs cannot be trimmed

3. Check audit log:
```javascript
// In Firestore Console, check regulatorAuditLogs
// Should have entry: action = "REGULATOR_LOCK_ACTIVATED"
```

4. Deactivate:
```javascript
await functions.httpsCallable('pack339_toggleRegulatorLock')({
  activate: false
});
```

**Expected Result:** ✅ Lock toggles successfully, operations restricted

**Authorization Test:**
- Only ADMIN role can toggle (not just LEGAL permissions)

---

### Test 8: Evidence Export - USER_CASE

**Objective:** Verify court-grade evidence export

**Setup:**
Create test user with data: `test-user-export-001`
- Add wallet transactions
- Add payout requests
- Add bookings
- Add legal acceptances

**Steps:**

1. Request export:
```javascript
const exportResult = await functions.httpsCallable('pack339_requestEvidenceExport')({
  type: 'USER_CASE',
  targetUserId: 'test-user-export-001',
  dateRange: {
    from: Date.now() - 30 * 24 * 60 * 60 * 1000,  // 30 days ago
    to: Date.now()
  },
  notes: 'Test export for validation'
});

console.log('Export requested:', exportResult.data);
```

2. Verify job created:
```json
{
  "success": true,
  "jobId": "export_1702423456789",
  "type": "USER_CASE",
  "status": "PENDING"
}
```

3. Wait for processing (~30-60 seconds), then check job status:
```javascript
// Query evidenceExportJobs collection
const jobDoc = await db.collection('evidenceExportJobs')
  .doc(exportResult.data.jobId)
  .get();

console.log('Job Status:', jobDoc.data().status);
```

4. When `status: "COMPLETED"`, verify:
   - ✅ `exportedLocation` is set
   - ✅ `completedAt` timestamp present
   - ✅ Location: `gs://avalo-legal-exports/{jobId}.encrypted`

5. Check audit log:
   - ✅ Entry with `action: "EVIDENCE_EXPORT_REQUESTED"`

**Expected Result:** ✅ Export completes, encrypted file created

**Data Validation:**
The export should include:
- User profile
- Wallet transactions
- Payouts
- Bookings
- Compliance records
- Enforcement state
- Legal acceptances

---

### Test 9: Evidence Export - REGULATOR_AUDIT

**Objective:** Verify regulator audit export

**Steps:**

1. Request regulator audit export:
```javascript
const exportResult = await functions.httpsCallable('pack339_requestEvidenceExport')({
  type: 'REGULATOR_AUDIT',
  dateRange: {
    from: Date.now() - 7 * 24 * 60 * 60 * 1000,  // Last 7 days
    to: Date.now()
  },
  notes: 'Weekly regulator audit export'
});
```

2. Wait for completion

3. Verify export includes:
   - ✅ Regulator audit logs
   - ✅ Backup history
   - ✅ Legal holds
   - ✅ System alerts

**Expected Result:** ✅ Regulator audit export completes

**Authorization Test:**
- Requires LEGAL permissions
- Non-legal admin should fail

---

### Test 10: Get Active Legal Holds

**Objective:** Query all active holds

**Steps:**

1. Create multiple holds (user-specific and global)

2. Query active holds:
```javascript
const result = await functions.httpsCallable('pack339_getActiveLegalHolds')();
console.log('Active Holds:', result.data);
```

3. Verify output:
```json
{
  "success": true,
  "holds": [
    {
      "id": "hold_1",
      "userId": "user-123",
      "reason": "COURT_ORDER",
      "active": true,
      "createdAt": 1702423456000
    },
    {
      "id": "hold_2",
      "userId": null,
      "reason": "REGULATOR_REQUEST",
      "active": true,
      "createdAt": 1702423460000
    }
  ]
}
```

**Expected Result:** ✅ All active holds returned

---

### Test 11: RPO Breach Alert

**Objective:** Verify alert triggers when backups fail

**Steps:**

1. Disable Cloud Scheduler temporarily (to simulate failure)

2. Wait 25 minutes (RPO target is 15 min + 5 min buffer = 20 min)

3. Trigger backup manually (will succeed but RPO is breached):
```bash
gcloud pubsub topics publish firebase-schedule-pack339_runIncrementalBackup --message '{}'
```

4. Check `systemAlerts` collection:
   - ✅ Alert with `type: "RPO_BREACH"`
   - ✅ `severity: "MEDIUM"`
   - ✅ `rpoMinutes` > 20

**Expected Result:** ✅ RPO breach alert created

**Cleanup:** Re-enable Cloud Scheduler

---

### Test 12: Backup Failure Alert

**Objective:** Verify alert on backup failure

**Steps:**

1. Temporarily revoke Firestore export permissions (to cause failure)

2. Trigger backup:
```bash
gcloud pubsub topics publish firebase-schedule-pack339_runIncrementalBackup --message '{}'
```

3. Check `systemAlerts` collection:
   - ✅ Alert with `type: "BACKUP_FAILURE"`
   - ✅ `severity: "HIGH"`
   - ✅ `errorMessage` present

4. Check `backupSnapshots`:
   - ✅ Snapshot with `status: "FAILED"`
   - ✅ `errorMessage` explains failure

**Expected Result:** ✅ Backup failure captured and alerted

**Cleanup:** Restore permissions

---

### Test 13: Integration with PACK 277 (Wallet)

**Objective:** Verify legal hold blocks payouts

**Setup:**
Requires PACK 277 to be integrated

**Steps:**

1. Apply legal hold to test user:
```javascript
await functions.httpsCallable('pack339_applyLegalHold')({
  userId: 'test-payout-user',
  reason: 'FRAUD_INVESTIGATION',
  notes: 'Test hold'
});
```

2. Attempt payout request as that user:
```javascript
// From PACK 277
const payoutResult = await functions.httpsCallable('pack277_requestPayout')({
  amount: 1000,
  method: 'bank_transfer'
});
```

3. Verify result:
```json
{
  "success": false,
  "error": "LEGAL_HOLD_ACTIVE"
}
```

**Expected Result:** ✅ Payout blocked by legal hold

**Cleanup:** Remove legal hold

---

### Test 14: Integration with Regulator Lock

**Objective:** Verify regulator lock affects operations

**Steps:**

1. Activate regulator lock:
```javascript
await functions.httpsCallable('pack339_toggleRegulatorLock')({
  activate: true,
  reason: 'Testing lock effects'
});
```

2. Test operations that should be affected:
   - ❌ Bulk deletion jobs (should pause)
   - ❌ Large payouts >10,000 PLN (should require approval)
   - ✅ Normal payouts <10,000 PLN (should work)
   - ✅ User login/chat (should work)

3. Verify audit log immutability:
   - Try to delete entry from `regulatorAuditLogs` → should fail (security rules)

4. Deactivate lock

**Expected Result:** ✅ Operations correctly restricted during lock

---

### Test 15: Evidence Export Job Listing

**Objective:** Query export job history

**Steps:**

1. Create several export jobs

2. Query jobs:
```javascript
const result = await functions.httpsCallable('pack339_getEvidenceExportJobs')({
  limit: 10
});

console.log('Jobs:', result.data);
```

3. Verify output:
```json
{
  "success": true,
  "jobs": [
    {
      "id": "export_1",
      "type": "USER_CASE",
      "status": "COMPLETED",
      "createdAt": 1702423456000,
      "completedAt": 1702423460000
    }
  ]
}
```

**Expected Result:** ✅ All jobs listed with status

---

### Test 16: Unauthorized Access Prevention

**Objective:** Verify security rules enforce access control

**Test Cases:**

| Action | User Type | Expected Result |
|--------|-----------|----------------|
| Read `backupSnapshots` | Regular user | ❌ Denied |
| Read `backupSnapshots` | OPS admin | ✅ Allowed |
| Write `backupSnapshots` | ANY user | ❌ Denied (Cloud Functions only) |
| Read `legalHolds` | Regular user | ✅ Only their own hold |
| Read `legalHolds` | LEGAL admin | ✅ All holds |
| Write `legalHolds` | LEGAL admin | ❌ Denied (Cloud Functions only) |
| Read `evidenceExportJobs` | Regular user | ❌ Denied |
| Read `evidenceExportJobs` | LEGAL admin | ✅ Allowed |
| Read `regulatorAuditLogs` | Regular user | ❌ Denied |
| Read `regulatorAuditLogs` | Admin | ✅ Allowed |

**Test Each:**
```javascript
// From Firebase client SDK
const db = firebase.firestore();

// Should succeed for authorized users
const snapshot = await db.collection('backupSnapshots').limit(1).get();

// Should fail for unauthorized users with permission-denied error
```

**Expected Result:** ✅ Security rules enforce all access controls

---

### Test 17: Multi-User Legal Hold Scenario

**Objective:** Test multiple concurrent legal holds

**Steps:**

1. Create holds for 3 different users:
```javascript
const users = ['user-A', 'user-B', 'user-C'];
const holds = [];

for (const userId of users) {
  const result = await functions.httpsCallable('pack339_applyLegalHold')({
    userId,
    reason: 'COURT_ORDER',
    notes: `Test hold for ${userId}`
  });
  holds.push(result.data.holdId);
}
```

2. Query active holds:
```javascript
const active = await functions.httpsCallable('pack339_getActiveLegalHolds')();
console.log('Active holds:', active.data.holds.length);
// Should be >= 3
```

3. Remove all holds:
```javascript
for (const holdId of holds) {
  await functions.httpsCallable('pack339_removeLegalHold')({ holdId });
}
```

4. Verify all removed:
```javascript
const activeAfter = await functions.httpsCallable('pack339_getActiveLegalHolds')();
console.log('Active after removal:', activeAfter.data.holds.length);
// Should be 0 (or exclude our test holds)
```

**Expected Result:** ✅ Multiple holds managed independently

---

### Test 18: Evidence Export Performance

**Objective:** Measure export performance for different data volumes

**Test Cases:**

| User Type | Data Volume | Expected Duration |
|-----------|-------------|-------------------|
| New user (minimal data) | <10 records | <10 seconds |
| Active user | 100-500 records | 20-40 seconds |
| Power user | 1,000+ records | 60-90 seconds |

**Steps:**

1. Create users with different data volumes

2. Request exports and measure time:
```javascript
const start = Date.now();
const result = await functions.httpsCallable('pack339_requestEvidenceExport')({
  type: 'USER_CASE',
  targetUserId: 'test-user-id'
});

// Poll for completion
const interval = setInterval(async () => {
  const job = await db.collection('evidenceExportJobs')
    .doc(result.data.jobId)
    .get();
  
  if (job.data().status === 'COMPLETED') {
    clearInterval(interval);
    const duration = Date.now() - start;
    console.log(`Export completed in ${duration}ms`);
  }
}, 1000);
```

**Expected Result:** ✅ Exports complete within expected timeframes

---

### Test 19: Alert Notification Delivery

**Objective:** Verify alerts are created in `systemAlerts`

**Steps:**

1. Trigger various alert conditions:
   - Backup failure
   - RPO breach
   - Regulator lock activation

2. Query `systemAlerts` collection:
```javascript
const alerts = await db.collection('systemAlerts')
  .orderBy('timestamp', 'desc')
  .limit(10)
  .get();

alerts.forEach(doc => {
  console.log('Alert:', doc.data());
});
```

3. Verify alert fields:
   - ✅ `type` correct
   - ✅ `severity` appropriate
   - ✅ `timestamp` present
   - ✅ Context fields populated

**Expected Result:** ✅ All alerts captured

**Future Integration:**
- Email notifications
- Slack webhooks
- PagerDuty (production)

---

### Test 20: DR Plan Last Tested Tracking

**Objective:** Verify DR test updates plan metadata

**Steps:**

1. Run DR simulation (see Test 4)

2. Check DR plan document:
```javascript
const planDoc = await db.collection('disasterRecoveryPlans')
  .doc('STAGING_DEFAULT')
  .get();

console.log('Last tested:', planDoc.data().lastTestedAt);
console.log('Test result:', planDoc.data().lastTestResult);
```

3. Verify:
   - ✅ `lastTestedAt` updated to recent timestamp
   - ✅ `lastTestResult: "PASS"` (if validation passed)

**Expected Result:** ✅ DR plan tracks test history

---

## Integration Tests

### Integration 1: PACK 277 + PACK 339

**Test:** Legal hold blocks payout processing

**Code Location:** `functions/src/pack277-wallet-endpoints.ts`

**Add Check:**
```typescript
import { hasActiveLegalHold } from './pack339-disaster-recovery';

// In wallet_requestPayout function
const hasHold = await hasActiveLegalHold(userId);
if (hasHold) {
  return { 
    success: false, 
    error: 'LEGAL_HOLD_ACTIVE',
    message: 'Your account has an active legal hold. Payouts are frozen.' 
  };
}
```

---

### Integration 2: PACK 338A + PACK 339

**Test:** Regulator audit logs immutability

**Verification:**
- Try to delete entry from `regulatorAuditLogs` → should fail
- Try to update entry → should fail
- Only Cloud Functions can write

---

### Integration 3: PACK 333 (Admin Console) + PACK 339

**Required UI Components:**

1. **Backup Status Dashboard**
   - Current RPO display
   - Recent backups list
   - Alert indicators

2. **Legal Holds Manager**
   - List active holds
   - Apply new hold form
   - Remove hold button

3. **Regulator Lock Toggle**
   - Current status indicator
   - Activate/Deactivate button
   - Confirmation dialog (two-step)

4. **Evidence Export**
   - Request form (user ID, date range)
   - Job history list
   - Download links (time-limited)

5. **DR Test Runner** (Staging only)
   - Select snapshot dropdown
   - Run test button
   - Results display

---

## Performance Benchmarks

### Backup Performance

| Metric | Target | Actual |
|--------|--------|--------|
| Incremental backup duration | <10 min | ___ min |
| Daily backup duration | <30 min | ___ min |
| RPO achievement | ≤15 min | ___ min |
| Snapshot creation overhead | <5 sec | ___ sec |

### Export Performance

| Metric | Target | Actual |
|--------|--------|--------|
| USER_CASE export (1 user) | <60 sec | ___ sec |
| REGULATOR_AUDIT export | <5 min | ___ min |
| Encryption overhead | <10% | ___% |

### Query Performance

| Endpoint | Target | Actual |
|----------|--------|--------|
| getBackupStatus | <1 sec | ___ sec |
| getActiveLegalHolds | <1 sec | ___ sec |
| getRegulatorLockStatus | <500ms | ___ ms |
| getEvidenceExportJobs | <1 sec | ___ sec |

---

## Load Testing

### Concurrent Legal Holds

**Test:** 100 simultaneous legal hold applications

```javascript
const promises = [];
for (let i = 0; i < 100; i++) {
  promises.push(
    functions.httpsCallable('pack339_applyLegalHold')({
      userId: `test-user-${i}`,
      reason: 'REGULATOR_REQUEST',
      notes: 'Load test'
    })
  );
}

const results = await Promise.allSettled(promises);
const successful = results.filter(r => r.status === 'fulfilled').length;
console.log(`${successful}/100 holds created successfully`);
```

**Expected:** ✅ All 100 holds created without errors

---

### Concurrent Evidence Exports

**Test:** 10 simultaneous evidence exports

```javascript
const promises = [];
for (let i = 0; i < 10; i++) {
  promises.push(
    functions.httpsCallable('pack339_requestEvidenceExport')({
      type: 'USER_CASE',
      targetUserId: `test-user-${i}`
    })
  );
}

const results = await Promise.allSettled(promises);
const successful = results.filter(r => r.status === 'fulfilled').length;
console.log(`${successful}/10 exports requested successfully`);
```

**Expected:** ✅ All 10 exports queued without errors

---

## Security Tests

### Test S1: SQL Injection Prevention

**Attempt:** Inject SQL in parameters

```javascript
await functions.httpsCallable('pack339_applyLegalHold')({
  userId: "'; DROP TABLE legalHolds; --",
  reason: 'COURT_ORDER'
});
```

**Expected:** ✅ No SQL injection (Firestore is NoSQL, but test for safety)

---

### Test S2: XSS Prevention

**Attempt:** Inject script tags in notes

```javascript
await functions.httpsCallable('pack339_applyLegalHold')({
  userId: 'test-user',
  reason: 'COURT_ORDER',
  notes: '<script>alert("XSS")</script>'
});
```

**Expected:** ✅ Script tags stored as plain text, not executed

---

### Test S3: Authorization Bypass Attempts

**Attempt 1:** Call admin function without auth
```javascript
// From unauthenticated client
await functions.httpsCallable('pack339_applyLegalHold')({ ... });
```
**Expected:** ❌ `unauthenticated` error

**Attempt 2:** Call with auth but no LEGAL permissions
```javascript
// From regular user account
await functions.httpsCallable('pack339_applyLegalHold')({ ... });
```
**Expected:** ❌ `permission-denied` error

**Attempt 3:** Try to write directly to Firestore (bypass functions)
```javascript
await db.collection('legalHolds').add({ ... });
```
**Expected:** ❌ Security rules deny write

---

### Test S4: DR Simulation Production Block

**Attempt:** Run DR simulation in production

```javascript
await functions.httpsCallable('pack339_simulateDisasterRecovery')({
  env: 'PRODUCTION',
  snapshotId: 'some-snapshot-id'
});
```

**Expected:** ❌ `failed-precondition` error with message:
"DR simulation not allowed in PRODUCTION"

---

## Compliance Tests

### Test C1: GDPR - Right to Access

**Scenario:** User requests evidence export

**Verification:**
- ✅ Export includes all personal data
- ✅ Export is encrypted
- ✅ Access is time-limited
- ✅ User can download their own data

---

### Test C2: Audit Immutability

**Scenario:** Regulator requests audit trail

**Verification:**
- ✅ `regulatorAuditLogs` cannot be deleted
- ✅ Logs cannot be modified
- ✅ Logs survive backup/restore
- ✅ Logs include all legal operations

---

### Test C3: Financial Record Integrity

**Scenario:** Restore from backup

**Verification:**
- ✅ Wallet balances unchanged
- ✅ Transaction history intact
- ✅ Payout records preserved
- ✅ Revenue splits unchanged (65/35, 80/20)

---

## Disaster Recovery Drills

### Drill 1: Staging Restore Test

**Objective:** Full end-to-end restore in staging

**Steps:**

1. Export staging data:
```bash
gcloud firestore export gs://avalo-backups/firestore/staging-test-$(date +%Y%m%d_%H%M%S) \
  --project avalo-staging
```

2. Simulate data loss (delete test collections)

3. Restore from backup:
```bash
gcloud firestore import gs://avalo-backups/firestore/BACKUP_TIMESTAMP \
  --project avalo-staging
```

4. Validate restored data:
   - ✅ User profiles complete
   - ✅ Wallet balances match
   - ✅ Chat history intact

**Expected Duration:** <2 hours (RTO target)

---

### Drill 2: Production DR Runbook Walkthrough

**Objective:** Validate runbook procedures without executing

**Steps:**

1. Review runbook in `disasterRecoveryPlans/PRODUCTION_DEFAULT`

2. Walk through each step:
   - ✅ Assess situation
   - ✅ Identify backup
   - ✅ Calculate data loss
   - ✅ Restore priority order
   - ✅ Post-recovery validation
   - ✅ Communication plan

3. Identify gaps or unclear procedures

4. Update runbook documentation

**Expected Result:** ✅ Runbook is actionable and complete

---

## Regression Tests

Run these tests before every PACK 339 update:

### R1: Backup Cycle
- [x] Incremental backup succeeds
- [x] Daily backup succeeds
- [x] RPO maintained <15 minutes
- [x] Snapshots stored correctly

### R2: Legal Holds
- [x] User-specific hold applies correctly
- [x] Global hold activates regulator lock
- [x] Hold removal works
- [x] Audit logs created

### R3: Evidence Exports
- [x] USER_CASE export completes
- [x] REGULATOR_AUDIT export completes
- [x] Exports encrypted
- [x] Job status tracking works

### R4: Authorization
- [x] OPS admin can access backups
- [x] LEGAL admin can manage holds
- [x] Regular users denied admin access
- [x] Security rules enforced

---

## Error Scenarios

### Error 1: Backup Fails Due to Quota

**Symptom:** Backup status = FAILED, error mentions quota

**Diagnosis:**
```bash
gcloud logging read "resource.type=cloud_function AND jsonPayload.message=~'quota'" --limit 10
```

**Resolution:**
- Increase Firestore export quota
- Contact Google Cloud support
- Switch to manual export temporarily

---

### Error 2: Evidence Export Timeout

**Symptom:** Export stuck in RUNNING, >10 minutes

**Diagnosis:**
```bash
gcloud logging read "resource.type=cloud_function AND resource.labels.function_name=pack339_processEvidenceExport" --limit 50
```

**Resolution:**
- Check function timeout (currently 540s)
- Verify Firestore indexes exist
- Check for large data volumes
- Consider pagination for large exports

---

### Error 3: Legal Hold Not Blocking Payout

**Symptom:** User with hold can still request payout

**Diagnosis:**
1. Verify hold is active:
```javascript
const hold = await db.collection('legalHolds')
  .where('userId', '==', userId)
  .where('active', '==', true)
  .get();
```

2. Check `hasActiveLegalHold` function is called in payout logic

**Resolution:**
- Ensure PACK 277 integrates `hasActiveLegalHold` check
- Verify function import path
- Test with isolated case

---

## Monitoring Checklist

### Daily Checks

- [ ] Last backup succeeded
- [ ] Current RPO <15 minutes
- [ ] No active alert in `systemAlerts`
- [ ] Regulator lock inactive (unless intentional)

### Weekly Checks

- [ ] Run DR simulation in staging
- [ ] Review active legal holds
- [ ] Check evidence export job queue
- [ ] Verify GCS bucket storage usage

### Monthly Checks

- [ ] Review backup retention (7 years)
- [ ] Test evidence export end-to-end
- [ ] Audit legal hold history
- [ ] Update DR runbook if needed

---

## Success Criteria

PACK 339 is fully operational when:

- ✅ Incremental backups run every 15 minutes
- ✅ Daily full backups run successfully
- ✅ RPO consistently <15 minutes
- ✅ DR simulation passes in staging
- ✅ Legal holds block payouts correctly
- ✅ Regulator lock restricts operations
- ✅ Evidence exports complete successfully
- ✅ All alerts trigger appropriately
- ✅ Security rules enforce access control
- ✅ Audit logs are immutable

---

## Rollback Procedures

If PACK 339 causes issues:

### 1. Disable Cloud Scheduler Jobs

```bash
gcloud scheduler jobs pause pack339-incremental-backup
gcloud scheduler jobs pause pack339-daily-backup
```

### 2. Remove Cloud Functions

```bash
firebase functions:delete pack339_runIncrementalBackup --force
firebase functions:delete pack339_runDailyBackup --force
# ... delete other functions as needed
```

### 3. Deactivate Active Legal Holds

```javascript
const holds = await db.collection('legalHolds')
  .where('active', '==', true)
  .get();

for (const doc of holds.docs) {
  await doc.ref.update({ active: false });
}
```

### 4. Deactivate Regulator Lock

```javascript
await functions.httpsCallable('pack339_toggleRegulatorLock')({
  activate: false
});
```

---

## Support & Escalation

### Issues?

- **Email:** ops-team@avalo.app
- **Immediate:** PagerDuty (production only)
- **Documentation:** See PACK_339_DISASTER_RECOVERY_IMPLEMENTATION.md

### Known Limitations

- DR simulation only works in STAGING
- Evidence exports limited to 10,000 audit logs per job
- Backup exports are metadata only (actual GCS export manual)
- Alert webhooks are stubbed (need configuration)

---

*Testing Guide Version: 1.0.0*  
*Last Updated: December 13, 2025*
