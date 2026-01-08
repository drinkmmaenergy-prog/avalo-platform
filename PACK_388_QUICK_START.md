# PACK 388 — Quick Start Guide

## 🚀 5-Minute Setup

Get PACK 388 Legal Compliance Engine running in production.

---

## Prerequisites

- ✅ Firebase project configured
- ✅ Cloud Functions deployed
- ✅ Admin role configured
- ✅ PACK 277 (Wallet) deployed
- ✅ PACK 296 (Audit) deployed
- ✅ PACK 300 (Support) deployed
- ✅ PACK 302 (Fraud) deployed
- ✅ PACK 387 (PR) deployed

---

## Step 1: Deploy Cloud Functions (2 min)

```bash
cd functions

# Deploy all PACK 388 functions
npm run deploy:pack388

# Or deploy individually
firebase deploy --only functions:pack388_requestDataExport,functions:pack388_executeRightToBeForgotten,functions:pack388_processDataExport,functions:pack388_executeDataDeletion,functions:pack388_restrictProcessing,functions:pack388_cancelDeletionRequest,functions:pack388_verifyAgeStrict,functions:pack388_manualAgeReview,functions:pack388_getVerificationStatus,functions:pack388_runKYCCheck,functions:pack388_monitorAMLPatterns,functions:pack388_getKYCStatus,functions:pack388_executeRetentionPurge,functions:pack388_applyLegalHold,functions:pack388_releaseLegalHold,functions:pack388_initializeRetentionPolicies,functions:pack388_getRetentionPolicy,functions:pack388_openRegulatoryIncident,functions:pack388_generateLegalReport,functions:pack388_updateIncidentStatus,functions:pack388_getJurisdictionRequirements
```

---

## Step 2: Deploy Firestore Rules & Indexes (1 min)

```bash
# Deploy security rules
firebase deploy --only firestore:rules

# Deploy indexes
firebase deploy --only firestore:indexes
```

---

## Step 3: Initialize Retention Policies (30 sec)

```typescript
// Run from Firebase Console or admin script
const functions = firebase.functions();
const result = await functions.httpsCallable('pack388_initializeRetentionPolicies')();
console.log(`Initialized ${result.data.policiesCreated} retention policies`);
```

---

## Step 4: Seed Jurisdiction Data (30 sec)

```typescript
// Add key jurisdictions
const db = firebase.firestore();

// EU
await db.collection('legalJurisdictions').doc('EU').set({
  countryCode: 'EU',
  regulatoryRegime: 'EU',
  ageLimit: 18,
  dataRetentionDays: 2555,
  KYCRequired: true,
  AMLRequired: true,
  contentRestrictions: ['adult_content_restricted'],
  specialRequirements: {
    requiresParentalConsent: false,
    requiresLocalDataStorage: true
  }
});

// US
await db.collection('legalJurisdictions').doc('US').set({
  countryCode: 'US',
  regulatoryRegime: 'US',
  ageLimit: 18,
  dataRetentionDays: 2555,
  KYCRequired: false, // Unless thresholds exceeded
  AMLRequired: true,
  contentRestrictions: []
});

// UK
await db.collection('legalJurisdictions').doc('GB').set({
  countryCode: 'GB',
  regulatoryRegime: 'UK',
  ageLimit: 18,
  dataRetentionDays: 2555,
  KYCRequired: true,
  AMLRequired: true,
  contentRestrictions: []
});
```

---

## Step 5: Configure Admin Permissions (30 sec)

```typescript
// Grant legal team permissions
await db.collection('admins').doc('ADMIN_USER_ID').update({
  permissions: firebase.firestore.FieldValue.arrayUnion(
    'LEGAL_ADMIN',
    'COMPLIANCE_OFFICER',
    'AGE_VERIFICATION_REVIEW',
    'LEGAL_HOLD'
  )
});
```

---

## 🎯 Quick Test

### Test 1: GDPR Data Export

```typescript
// As a user
const functions = firebase.functions();
const result = await functions.httpsCallable('pack388_requestDataExport')({
  jurisdiction: 'EU'
});

console.log('Request ID:', result.data.requestId);
console.log('Completion date:', result.data.estimatedCompletionDate);
```

**Expected:** Request created, will complete within 30 days.

### Test 2: Age Verification

```typescript
const result = await functions.httpsCallable('pack388_verifyAgeStrict')({
  method: 'AI_SELFIE',
  selfieData: {
    mockAge: 25,
    mockConfidence: 90
  },
  countryCode: 'US'
});

console.log('Verified:', result.data.verified);
```

**Expected:** `verified: true` for age 25+.

### Test 3: Minor Detection

```typescript
const result = await functions.httpsCallable('pack388_verifyAgeStrict')({
  method: 'AI_SELFIE',
  selfieData: {
    mockAge: 16,
    mockConfidence: 90
  },
  countryCode: 'US'
});
```

**Expected:** Error, account locked.

### Test 4: KYC Check

```typescript
const result = await functions.httpsCallable('pack388_runKYCCheck')({
  level: 'STANDARD',
  identityData: {
    fullName: 'Test User',
    dateOfBirth: '1990-01-01',
    nationality: 'US',
    documentType: 'PASSPORT',
    documentNumber: 'TEST123',
    documentExpiry: '2030-01-01',
    country: 'US'
  }
});

console.log('KYC Status:', result.data.status);
console.log('Risk Level:', result.data.amlRiskLevel);
```

**Expected:** `status: VERIFIED`, `amlRiskLevel: LOW`.

---

## 📊 Verify Deployment

### Check Cloud Functions

```bash
firebase functions:list | grep pack388
```

**Should see:**
- pack388_requestDataExport
- pack388_executeRightToBeForgotten
- pack388_verifyAgeStrict
- pack388_runKYCCheck
- pack388_monitorAMLPatterns
- pack388_executeRetentionPurge
- pack388_openRegulatoryIncident
- ... and more

### Check Firestore Collections

```typescript
// Should exist after initialization
const collections = [
  'dataRequests',
  'ageVerifications',
  'kycVerifications',
  'amlAlerts',
  'legalHolds',
  'dataRetentionPolicies',
  'regulatoryIncidents',
  'legalJurisdictions'
];

for (const collection of collections) {
  const snapshot = await db.collection(collection).limit(1).get();
  console.log(`${collection}: ${snapshot.empty ? '❌ Empty' : '✅ Ready'}`);
}
```

---

## 🔍 Monitoring Setup

### Enable Cloud Function Logs

```bash
# View logs
firebase functions:log --only pack388

# Tail logs in real-time
firebase functions:log --only pack388 --follow
```

### Set Up Alerts

```typescript
// Create alert for minor detection
await db.collection('alertRules').add({
  name: 'Minor Detection Alert',
  collection: 'minorDetectionAlerts',
  condition: 'onCreate',
  severity: 'CRITICAL',
  notifyChannels: ['slack', 'email', 'sms'],
  recipients: ['legal@avalo.app', 'safety@avalo.app']
});

// Create alert for GDPR deadline approaching
await db.collection('alertRules').add({
  name: 'GDPR Deadline Warning',
  collection: 'dataRequests',
  condition: 'legalDeadline < 7 days',
  severity: 'HIGH',
  notifyChannels: ['slack', 'email'],
  recipients: ['legal@avalo.app']
});
```

---

## 🛡️ Production Checklist

Before enabling in production:

### Legal

- [ ] Privacy policy updated with GDPR compliance
- [ ] Terms of service include age verification clause
- [ ] KYC/AML policy documented
- [ ] Data retention policy published
- [ ] User consent forms implemented
- [ ] Legal team briefed on automation

### Technical

- [ ] All Cloud Functions deployed
- [ ] Firestore rules active
- [ ] Indexes created
- [ ] Retention policies initialized
- [ ] Jurisdictions configured
- [ ] Admin permissions set
- [ ] Monitoring enabled
- [ ] Alerts configured
- [ ] Backup strategy in place

### Integration

- [ ] PACK 277 (Wallet) freeze tested
- [ ] PACK 302 (Fraud) signals tested
- [ ] PACK 300 (Safety) escalation tested
- [ ] PACK 387 (PR) coordination tested
- [ ] PACK 296 (Audit) logging verified

### Testing

- [ ] GDPR export tested
- [ ] Right to be forgotten tested
- [ ] Age verification tested
- [ ] Minor detection tested
- [ ] KYC verification tested
- [ ] AML monitoring tested
- [ ] Retention purge tested
- [ ] Legal hold tested
- [ ] Regulatory incident tested

---

## 🚨 Emergency Procedures

### Manual Account Freeze

```typescript
// Freeze account immediately
await db.collection('users').doc('USER_ID').update({
  accountLocked: true,
  lockReason: 'MANUAL_LEGAL_HOLD',
  lockedAt: firebase.firestore.FieldValue.serverTimestamp()
});

await firebase.auth().updateUser('USER_ID', { disabled: true });

await db.collection('wallets').doc('USER_ID').update({
  frozen: true,
  frozenReason: 'MANUAL_LEGAL_HOLD'
});
```

### Emergency Data Export

```typescript
// Export all user data immediately
const functions = firebase.functions();
await functions.httpsCallable('pack388_requestDataExport')({
  userId: 'USER_ID',
  urgent: true,
  reason: 'Government request'
});
```

### Emergency Incident Creation

```typescript
await functions.httpsCallable('pack388_openRegulatoryIncident')({
  type: 'GOVERNMENT_NOTICE',
  severity: 'CRITICAL',
  title: 'Emergency Compliance Request',
  description: 'Details...',
  jurisdiction: 'EU',
  responseDeadlineDays: 7
});
```

---

## 📞 Support Contacts

### Technical Issues
- **Email:** tech@avalo.app
- **Slack:** #pack388-support

### Legal/Compliance
- **Email:** legal@avalo.app
- **Emergency:** [phone number]

### Security Incidents
- **Email:** security@avalo.app
- **Emergency:** [phone number]

---

## 🔗 Quick Links

- [Full Documentation](./PACK_388_GLOBAL_LEGAL_GOVERNANCE_ENGINE.md)
- [API Reference](./PACK_388_GLOBAL_LEGAL_GOVERNANCE_ENGINE.md#api-reference)
- [Compliance Checklist](./PACK_388_GLOBAL_LEGAL_GOVERNANCE_ENGINE.md#compliance-checklist)
- Firebase Console: [https://console.firebase.google.com](https://console.firebase.google.com)

---

## 📈 Success Metrics

After 7 days, verify:

- ✅ Age verification rate > 95%
- ✅ GDPR requests processed < 15 days average
- ✅ KYC approval rate > 90%
- ✅ Zero minor accounts active
- ✅ AML alerts < 1% of transactions
- ✅ Retention purge success rate 100%
- ✅ Zero compliance violations

---

## 🎓 Training Materials

### For Developers

1. Read [Full Documentation](./PACK_388_GLOBAL_LEGAL_GOVERNANCE_ENGINE.md)
2. Run test suite
3. Review Cloud Function logs
4. Practice incident response

### For Legal Team

1. Admin dashboard walkthrough
2. Incident management training
3. GDPR request handling
4. KYC/AML review process
5. Regulatory reporting

### For Support Team

1. Age verification troubleshooting
2. GDPR request FAQ
3. Account lock procedures
4. Escalation protocols

---

## ✅ You're Ready!

PACK 388 is now active and protecting your platform against:

- 🛡️ GDPR violations
- 🔞 Minor exposure
- 💰 KYC/AML enforcement
- 📜 Data retention breaches
- ⚖️ Regulatory takedowns

**Questions?** Contact legal@avalo.app

---

**Last Updated:** 2024-12-30
**Version:** 1.0.0
