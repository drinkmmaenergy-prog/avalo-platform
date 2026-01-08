# PACK 339 — Quick Reference Card

## Disaster Recovery & Legal Crisis Management

---

## 🚨 Emergency Contacts

| Situation | Contact |
|-----------|---------|
| Data Loss | ops-team@avalo.app |
| Legal Crisis | legal@avalo.app |
| Regulator Request | legal@avalo.app + compliance@avalo.app |
| Production Incident | PagerDuty (on-call) |

---

## 📊 Key Metrics

| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| RPO (Recovery Point) | ≤15 min | >20 min |
| RTO (Recovery Time) | ≤2 hours | N/A |
| Backup Success Rate | 100% | <95% |

---

## 🔧 Admin Functions Quick Access

### Backup Operations (OPS Permissions)

```javascript
// Get current backup status
const status = await functions.httpsCallable('pack339_getBackupStatus')();
console.log('Current RPO:', status.data.currentRPO, 'minutes');

// Manually trigger incremental backup (if needed)
// Use gcloud pubsub command
```

### Legal Holds (LEGAL Permissions)

```javascript
// Apply legal hold to specific user
const hold = await functions.httpsCallable('pack339_applyLegalHold')({
  userId: 'user-id-here',
  reason: 'COURT_ORDER', // or REGULATOR_REQUEST, FRAUD_INVESTIGATION
  notes: 'Case #12345'
});

// Apply global hold (triggers regulator lock)
const globalHold = await functions.httpsCallable('pack339_applyLegalHold')({
  reason: 'REGULATOR_REQUEST',
  notes: 'Regulatory audit'
});

// Remove hold
await functions.httpsCallable('pack339_removeLegalHold')({
  holdId: 'hold-id-here'
});

// List all active holds
const holds = await functions.httpsCallable('pack339_getActiveLegalHolds')();
console.log('Active holds:', holds.data.holds.length);
```

### Regulator Lock (ADMIN Role)

```javascript
// Activate regulator lock
await functions.httpsCallable('pack339_toggleRegulatorLock')({
  activate: true,
  reason: 'Regulatory investigation'
});

// Check current status
const status = await functions.httpsCallable('pack339_getRegulatorLockStatus')();
console.log('Lock active:', status.data.isRegulatorLockActive);

// Deactivate regulator lock
await functions.httpsCallable('pack339_toggleRegulatorLock')({
  activate: false
});
```

### Evidence Exports (LEGAL Permissions)

```javascript
// Request user-specific export
const userExport = await functions.httpsCallable('pack339_requestEvidenceExport')({
  type: 'USER_CASE',
  targetUserId: 'user-id-here',
  dateRange: {
    from: Date.now() - 30 * 24 * 60 * 60 * 1000,  // 30 days ago
    to: Date.now()
  },
  notes: 'Court Case #67890'
});

// Request regulator audit export
const auditExport = await functions.httpsCallable('pack339_requestEvidenceExport')({
  type: 'REGULATOR_AUDIT',
  dateRange: {
    from: Date.now() - 90 * 24 * 60 * 60 * 1000,  // 90 days
    to: Date.now()
  },
  notes: 'Q4 regulatory audit'
});

// List export jobs
const jobs = await functions.httpsCallable('pack339_getEvidenceExportJobs')({
  limit: 20
});
console.log('Export jobs:', jobs.data.jobs);
```

### DR Testing (OPS Permissions, STAGING ONLY)

```javascript
// Run DR simulation
const drTest = await functions.httpsCallable('pack339_simulateDisasterRecovery')({
  env: 'STAGING',
  snapshotId: 'incremental_1702423456789'
});

console.log('DR Test Result:', drTest.data.validation);
console.log('Estimated RTO:', drTest.data.estimatedRTOMinutes, 'minutes');
```

---

## 🎯 Common Scenarios

### Scenario: Regulator Calls

1. ✅ Document request details
2. ✅ Apply legal hold (user or global)
3. ✅ Activate regulator lock if needed
4. ✅ Request evidence export
5. ✅ Notify legal team
6. ✅ Keep hold active until clearance

### Scenario: Court Order Received

1. ✅ Verify order with legal team
2. ✅ Apply legal hold immediately
3. ✅ Request evidence export
4. ✅ Freeze account (no deletions/payouts)
5. ✅ Deliver evidence by deadline
6. ✅ Maintain chain of custody

### Scenario: Data Loss Detected

1. ✅ Assess scope of loss
2. ✅ Identify last good backup
3. ✅ Calculate RPO breach
4. ✅ Test restore in staging first
5. ✅ Execute production restore
6. ✅ Validate financial data integrity
7. ✅ Document incident

### Scenario: Backup Failure Alert

1. ✅ Check function logs for error
2. ✅ Verify GCS bucket accessible
3. ✅ Check IAM permissions
4. ✅ Manually trigger backup
5. ✅ Monitor next scheduled backup
6. ✅ Escalate if persistent

---

## 🔐 Permission Matrix

| Action | OPS | LEGAL | ADMIN |
|--------|-----|-------|-------|
| View backup status | ✅ | ❌ | ✅ |
| Run DR simulation | ✅ | ❌ | ✅ |
| Apply legal hold | ❌ | ✅ | ✅ |
| Toggle regulator lock | ❌ | ❌ | ✅ |
| Request evidence export | ❌ | ✅ | ✅ |
| View audit logs | ❌ | ✅ | ✅ |

---

## ⚡ One-Line Commands

### Check Current RPO
```javascript
(await functions.httpsCallable('pack339_getBackupStatus')()).data.currentRPO
```

### Check Regulator Lock
```javascript
(await functions.httpsCallable('pack339_getRegulatorLockStatus')()).data.isRegulatorLockActive
```

### Count Active Legal Holds
```javascript
(await functions.httpsCallable('pack339_getActiveLegalHolds')()).data.holds.length
```

### Latest Backup Time
```javascript
(await functions.httpsCallable('pack339_getBackupStatus')()).data.recentBackups[0].completedAt
```

---

## 📋 Pre-Flight Checklist

Before activating PACK 339 in production:

- [ ] Cloud Scheduler jobs created
- [ ] GCS buckets created with retention policy
- [ ] IAM permissions configured
- [ ] DR plans initialized
- [ ] Tested in staging end-to-end
- [ ] Admin team trained
- [ ] Alert webhooks configured
- [ ] Legal team briefed on export procedures
- [ ] Runbook URL added to DR plans
- [ ] Integration with PACK 277 (wallet) tested

---

## 🎓 Admin Training Checklist

All admins with LEGAL permissions must know:

- [ ] How to apply legal hold
- [ ] How to remove legal hold
- [ ] How to request evidence export
- [ ] How to download encrypted exports
- [ ] How to activate regulator lock
- [ ] Where to find audit logs
- [ ] Chain of custody procedures
- [ ] Escalation paths

All admins with OPS permissions must know:

- [ ] How to read backup status
- [ ] How to trigger manual backup
- [ ] How to run DR simulation
- [ ] How to interpret RPO/RTO metrics
- [ ] When to escalate backup failures

---

## 🔍 Troubleshooting Quick Fixes

### "Permission Denied" Error

**Fix:** Verify admin document has required permissions array:
```javascript
const adminDoc = await db.collection('admin_users').doc('admin-id').get();
console.log('Permissions:', adminDoc.data().permissions);
// Should include: ['OPS'] or ['LEGAL'] or both
```

### "Backup Snapshot Not Found"

**Fix:** List recent snapshots:
```javascript
const snapshots = await db.collection('backupSnapshots')
  .orderBy('startedAt', 'desc')
  .limit(5)
  .get();

snapshots.forEach(doc => console.log(doc.id));
```

### "Export Stuck in PENDING"

**Fix:** Check Firestore onCreate trigger logs:
```bash
gcloud logging read "resource.type=cloud_function AND resource.labels.function_name=pack339_processEvidenceExport" --limit 10
```

If trigger didn't fire, manually update:
```javascript
await db.collection('evidenceExportJobs').doc('job-id').update({
  status: 'FAILED',
  errorMessage: 'Trigger did not fire - requires manual retry'
});
```

---

## 📚 Related Documentation

- **Full Implementation:** [`PACK_339_DISASTER_RECOVERY_IMPLEMENTATION.md`](PACK_339_DISASTER_RECOVERY_IMPLEMENTATION.md)
- **Testing Guide:** [`PACK_339_TESTING_GUIDE.md`](PACK_339_TESTING_GUIDE.md)
- **PACK 100 (Foundation):** [`functions/src/pack100-disaster-recovery.ts`](functions/src/pack100-disaster-recovery.ts)
- **PACK 338A (Compliance):** [`PACK_338A_LEGAL_COMPLIANCE_IMPLEMENTATION.md`](PACK_338A_LEGAL_COMPLIANCE_IMPLEMENTATION.md)

---

## 🔒 Security Reminders

### ⚠️ NEVER

- ❌ Run DR simulation in PRODUCTION
- ❌ Delete `regulatorAuditLogs` entries
- ❌ Modify wallet balances manually
- ❌ Share unencrypted evidence exports
- ❌ Bypass legal hold checks

### ✅ ALWAYS

- ✅ Log all legal hold operations
- ✅ Require two-step confirmation for destructive ops
- ✅ Test in staging before production
- ✅ Document all regulator interactions
- ✅ Maintain chain of custody for evidence

---

## 💾 Backup Locations

| Type | Location |
|------|----------|
| Incremental | `gs://avalo-backups/firestore/incremental/` |
| Daily Full | `gs://avalo-backups/firestore/daily/` |
| Legal Exports | `gs://avalo-legal-exports/` |

---

## 📞 Escalation Decision Tree

```
Issue Detected
    │
    ├─── Data Loss?
    │       ├─── Yes → Contact ops-team@avalo.app → Assess backup → Restore
    │       └─── No → Continue
    │
    ├─── Regulator Request?
    │       ├─── Yes → Contact legal@avalo.app → Apply hold → Export evidence
    │       └─── No → Continue
    │
    ├─── Backup Failure?
    │       ├─── Yes → Retry manually → Check logs → Escalate if persistent
    │       └─── No → Continue
    │
    └─── Other → Check documentation → Contact support
```

---

## 🎯 Quick Wins

### Verify System Healthy (30 seconds)

```javascript
const status = await functions.httpsCallable('pack339_getBackupStatus')();
const lockStatus = await functions.httpsCallable('pack339_getRegulatorLockStatus')();
const holds = await functions.httpsCallable('pack339_getActiveLegalHolds')();

console.log('✅ RPO:', status.data.currentRPO, 'min (target: 15)');
console.log('✅ Regulator lock:', lockStatus.data.isRegulatorLockActive ? 'ACTIVE ⚠️' : 'INACTIVE');
console.log('✅ Active legal holds:', holds.data.holds.length);
```

### Morning Health Check

```javascript
// Check last 24 hours
const status = await functions.httpsCallable('pack339_getBackupStatus')();
const lastBackup = status.data.recentBackups[0];

console.log('Last backup:', new Date(lastBackup.completedAt));
console.log('Status:', lastBackup.status);
console.log('RPO:', status.data.currentRPO, 'minutes');

if (status.data.currentRPO > 15) {
  console.warn('⚠️ RPO breached! Manual intervention required.');
}

if (lastBackup.status !== 'SUCCESS') {
  console.error('❌ Last backup failed! Check logs immediately.');
}
```

---

## 📱 Mobile App Integration Notes

PACK 339 is backend-only. No mobile UI changes needed.

However, users might see:
- Legal hold notification: "Your account is under review. Payouts temporarily frozen."
- Evidence request confirmation (if user requests their own data)

---

## 🌍 Regional Considerations

### EU (GDPR)

- ✅ Evidence exports include all personal data
- ✅ Legal holds prevent premature deletion
- ✅ Audit logs immutable
- ✅ Encrypted exports

### Poland (Financial Regulations)

- ✅ 7-year retention for financial records
- ✅ Immutable transaction history
- ✅ Court-grade exports available
- ✅ RTO <2 hours for financial data

### US (Legal Discovery)

- ✅ Court-grade evidence exports
- ✅ Chain of custody via audit logs
- ✅ Time-stamped immutable records
- ✅ Legal hold mechanism compliant

---

## 🎯 Critical Success Factors

PACK 339 is successful when:

1. **RPO ≤ 15 minutes consistently** (check daily)
2. **No backup failures** in last 30 days
3. **DR simulation passes** monthly in staging
4. **Legal holds block payouts** 100% of the time
5. **Evidence exports complete** <2 minutes for user cases
6. **Regulator lock** activates without system errors
7. **Audit logs remain immutable** under all conditions

---

## ⏱️ Time Estimates

| Operation | Duration |
|-----------|----------|
| Incremental backup | 5-10 min |
| Daily full backup | 15-30 min |
| DR simulation | 1-2 min |
| Apply legal hold | <1 sec |
| Evidence export (user) | 30-60 sec |
| Evidence export (audit) | 2-5 min |
| Regulator lock toggle | <1 sec |

---

## 🚀 Quick Deploy Commands

### Deploy Everything
```bash
./deploy-pack339.sh
```

### Deploy Functions Only
```bash
cd functions
firebase deploy --only functions:pack339_runIncrementalBackup,functions:pack339_runDailyBackup
```

### Deploy Indexes Only
```bash
firebase deploy --only firestore:indexes
```

---

## 📝 Legal Hold Reasons

| Reason | When to Use | Expected Duration |
|--------|-------------|-------------------|
| `REGULATOR_REQUEST` | Government inquiry | 30-90 days |
| `COURT_ORDER` | Subpoena/lawsuit | 60-180 days |
| `FRAUD_INVESTIGATION` | Internal fraud case | 14-30 days |

---

## 🔔 Alert Types

| Type | Severity | Action Required |
|------|----------|----------------|
| `BACKUP_FAILURE` | HIGH | Retry immediately |
| `RPO_BREACH` | MEDIUM | Check scheduler |
| `REGULATOR_LOCK_CHANGED` | CRITICAL | Verify intentional |

---

## 💡 Pro Tips

1. **Always test in staging first** - DR simulation is your friend
2. **Document everything** - Regulator will ask for timeline
3. **Keep holds minimal** - Only apply when legally required
4. **Monitor RPO daily** - Early warning saves the day
5. **Train the team** - Legal crisis needs quick response
6. **Update runbooks** - Learn from every drill
7. **Encrypt exports** - Never share plaintext sensitive data
8. **Chain of custody** - Track who accessed what, when

---

## 🔗 Function Names Reference

### Scheduled Functions
- `pack339_runIncrementalBackup` (every 15 min)
- `pack339_runDailyBackup` (daily 03:00 UTC)

### Callable Functions (Admin)
- `pack339_simulateDisasterRecovery`
- `pack339_applyLegalHold`
- `pack339_removeLegalHold`
- `pack339_toggleRegulatorLock`
- `pack339_requestEvidenceExport`
- `pack339_getBackupStatus`
- `pack339_getActiveLegalHolds`
- `pack339_getRegulatorLockStatus`
- `pack339_getEvidenceExportJobs`
- `pack339_initializeDisasterRecoveryPlans`

### Background Functions
- `pack339_processEvidenceExport` (Firestore onCreate trigger)

### Utility Functions (Code Import)
- `hasActiveLegalHold(userId: string): Promise<boolean>`
- `isRegulatorLockActive(): Promise<boolean>`

---

## 📊 Dashboard Widgets (for Admin Console)

### Backup Health Widget
```
┌─────────────────────────────────┐
│ BACKUP HEALTH                   │
├─────────────────────────────────┤
│ Current RPO: 8 minutes          │
│ Target RPO: 15 minutes          │
│ Last Backup: 12:45 PM (SUCCESS) │
│ Success Rate (7d): 100%         │
└─────────────────────────────────┘
```

### Legal Holds Widget
```
┌─────────────────────────────────┐
│ ACTIVE LEGAL HOLDS              │
├─────────────────────────────────┤
│ Total Active: 3                 │
│ └─ Court Orders: 2              │
│ └─ Regulator: 1                 │
│ └─ Fraud: 0                     │
└─────────────────────────────────┘
```

### Regulator Lock Widget
```
┌─────────────────────────────────┐
│ REGULATOR LOCK STATUS           │
├─────────────────────────────────┤
│ Status: INACTIVE ✅             │
│ (or)                            │
│ Status: ACTIVE ⚠️               │
│ Activated: Dec 12, 2024 14:30  │
│ Reason: Regulatory audit        │
└─────────────────────────────────┘
```

---

## 🛡️ Safety Guarantees Summary

PACK 339 guarantees:

- ✅ NO alteration of wallet balances
- ✅ NO alteration of transaction history
- ✅ NO deletion of audit logs
- ✅ NO automatic restore in production
- ✅ NO bypass of legal holds
- ✅ ALL destructive ops require two-step confirmation
- ✅ ALL legal actions logged to `regulatorAuditLogs`

---

*Quick Reference Version: 1.0.0*  
*For: OPS Admins, Legal Admins, System Admins*  
*Last Updated: December 13, 2025*
