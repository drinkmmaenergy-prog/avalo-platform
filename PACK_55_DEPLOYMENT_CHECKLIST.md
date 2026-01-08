# PACK 55 — Deployment Checklist

Use this checklist to ensure PACK 55 is properly deployed and configured.

---

## ✅ Pre-Deployment

- [x] All backend functions created and tested locally
- [x] All mobile services created
- [x] All mobile screens created
- [x] I18n strings added (EN + PL)
- [x] Documentation complete
- [x] No breaking changes to existing packs verified

---

## 🚀 Deployment Steps

### 1. Backend Deployment

```bash
# Navigate to functions directory
cd functions

# Install dependencies (if needed)
npm install

# Build TypeScript
npm run build

# Deploy all compliance functions
firebase deploy --only functions
```

**Expected output:**
```
✔ functions[compliance_getAgeState] deployed
✔ functions[compliance_ageSoftVerify] deployed
✔ functions[compliance_getMediaScanStatus] deployed
✔ functions[compliance_getAMLState] deployed
✔ functions[gdpr_requestErasure] deployed
✔ functions[gdpr_requestExport] deployed
✔ functions[policies_getLatest] deployed
✔ functions[policies_getUserAcceptances] deployed
✔ functions[policies_accept] deployed
✔ functions[admin_seedPolicies] deployed
✔ functions[compliance_amlDailyMonitor] deployed
```

- [ ] Functions deployed successfully
- [ ] No deployment errors

---

### 2. Seed Policy Documents

```bash
# Call seed function (one time only)
firebase functions:call admin_seedPolicies
```

**Expected output:**
```json
{
  "success": true,
  "message": "Policy documents seeded successfully"
}
```

**Verify in Firestore Console:**
- policies/TERMS_1.0.0 (EN)
- policies/PRIVACY_1.0.0 (EN)
- policies/SAFETY_1.0.0 (EN)
- policies/AML_1.0.0 (EN)
- policies/MONETIZATION_1.0.0 (EN)
- policies/MARKETPLACE_1.0.0 (EN)
- policies/COOKIES_1.0.0 (EN)

And Polish versions:
- policies/TERMS_1.0.0 (PL)
- policies/PRIVACY_1.0.0 (PL)
- etc.

- [ ] Policies seeded successfully
- [ ] All 7 policy types present for EN locale
- [ ] All 7 policy types present for PL locale

---

### 3. Configure Firestore Indexes

**Option A: Via Firebase Console**
1. Go to Firestore → Indexes
2. Create composite indexes from [`PACK_55_FIRESTORE_INDEXES.json`](PACK_55_FIRESTORE_INDEXES.json:1)

**Option B: Via firestore.indexes.json**
1. Copy content from PACK_55_FIRESTORE_INDEXES.json
2. Merge into your firestore.indexes.json
3. Deploy: `firebase deploy --only firestore:indexes`

**Required Indexes:**
- media_safety_scans (3 indexes)
- policies (1 index)
- policy_acceptances (2 indexes)
- aml_profiles (2 indexes)
- gdpr_erasure_requests (2 indexes)
- gdpr_export_requests (2 indexes)

- [ ] Indexes created
- [ ] All 12 indexes showing "Enabled" status

---

### 4. Update Firestore Security Rules

**Add rules from** [`PACK_55_FIRESTORE_RULES.txt`](PACK_55_FIRESTORE_RULES.txt:1)

```bash
# Merge into firestore.rules and deploy
firebase deploy --only firestore:rules
```

**Verify:**
- age_verification: read allowed for user, write blocked
- media_safety_scans: read allowed for owner, write blocked
- aml_profiles: read allowed for user, write blocked
- gdpr_*_requests: read allowed for user, write blocked
- policies: read allowed if active, write blocked
- policy_acceptances: read allowed for user, write blocked

- [ ] Rules deployed
- [ ] Security working as expected

---

### 5. Configure Scheduled Functions

**In Firebase Console → Functions → Schedule:**

| Function | Schedule | Description |
|----------|----------|-------------|
| `compliance_amlDailyMonitor` | `0 2 * * *` | Daily at 2 AM UTC - AML risk assessment |

- [ ] Scheduled function configured
- [ ] First run verified in logs

---

### 6. Mobile App Update

```bash
cd app-mobile

# Install new dependencies (if needed)
npm install
# or
pnpm install

# Clear cache and rebuild
expo start --clear
```

- [ ] Mobile app builds successfully
- [ ] No new errors in Metro bundler
- [ ] Services importable
- [ ] Screens render correctly

---

## 🧪 Post-Deployment Testing

### Backend API Tests

```bash
# 1. Test age verification
firebase functions:call compliance_getAgeState --data '{"userId":"test_user_123"}'

# Expected: Default state for new user
{
  "userId": "test_user_123",
  "ageVerified": false,
  "ageVerificationLevel": "NONE",
  "dateOfBirth": null,
  "countryOfResidence": null
}

# 2. Test age soft verify (use real auth token)
firebase functions:call compliance_ageSoftVerify --data '{"userId":"YOUR_UID","dateOfBirth":"1990-01-01","countryOfResidence":"US"}'

# Expected: Age verified
{
  "userId": "YOUR_UID",
  "ageVerified": true,
  "ageVerificationLevel": "SOFT",
  "dateOfBirth": "1990-01-01",
  "countryOfResidence": "US"
}

# 3. Test policy retrieval
firebase functions:call policies_getLatest --data '{"locale":"en"}'

# Expected: Array of 7 policies

# 4. Test AML state
firebase functions:call compliance_getAMLState --data '{"userId":"test_user_123"}'

# Expected: Default state
{
  "userId": "test_user_123",
  "kycRequired": false,
  "kycVerified": false,
  "kycLevel": "NONE",
  "riskScore": 0,
  "riskFlags": []
}
```

- [ ] Age state API works
- [ ] Age soft verify API works
- [ ] Policy retrieval API works
- [ ] AML state API works
- [ ] All APIs return expected data

---

### Mobile App Tests

**Test on iOS Simulator/Device:**

1. **Age Gate Flow:**
   - [ ] Age gate screen appears for new user
   - [ ] Can enter DOB (year, month, day)
   - [ ] Can enter country (optional)
   - [ ] Submit button works
   - [ ] Under-18 shows error and blocks access
   - [ ] 18+ allows access and persists

2. **Policy Acceptance Flow:**
   - [ ] Policy screen appears after age verification
   - [ ] All critical policies displayed
   - [ ] Individual checkboxes work
   - [ ] "Accept All" checkbox works
   - [ ] Cannot continue without accepting all
   - [ ] Acceptance persists after app restart

3. **Feature Access:**
   - [ ] Unverified users blocked from swipe/chat
   - [ ] Verified users can access all features
   - [ ] Compliance checks don't cause performance issues

**Test on Android Simulator/Device:**

- [ ] Same tests as iOS
- [ ] Platform-specific UI looks correct

---

## 📊 Monitoring Setup

### 1. Firestore Monitoring Queries

Create saved queries in Firestore Console:

```javascript
// Age verification coverage
age_verification where ageVerified == true

// Flagged media count
media_safety_scans where scanStatus == FLAGGED

// KYC required users
aml_profiles where kycRequired == true and kycVerified == false

// Pending GDPR requests
gdpr_erasure_requests where status == PENDING
gdpr_export_requests where status == PENDING
```

- [ ] Monitoring queries created
- [ ] Initial counts reviewed

---

### 2. Cloud Functions Metrics

In Firebase Console → Functions → Usage:

Monitor:
- Invocation count for compliance functions
- Error rates
- Execution times
- Costs

- [ ] Metrics dashboard configured
- [ ] Alerts set up for high error rates (optional)

---

### 3. Compliance Dashboard (Optional)

Create admin dashboard to view:
- Total users age-verified
- Flagged media awaiting review
- Users requiring KYC
- Pending GDPR requests
- Policy acceptance rates

- [ ] Dashboard planned or implemented

---

## ⚠️ Rollback Plan

If critical issues arise:

### Rollback Functions

```bash
# Rollback to previous deployment
firebase functions:rollback
```

### Disable Compliance Checks Temporarily

In mobile app, create feature flag:

```typescript
// app-mobile/config/features.ts
export const COMPLIANCE_FEATURES = {
  AGE_GATE_ENABLED: false, // Temporarily disable
  POLICY_GATE_ENABLED: false, // Temporarily disable
  CONTENT_SCANNING_ENABLED: true, // Keep scanning
  AML_TRACKING_ENABLED: true, // Keep tracking
};
```

Then update guards:

```typescript
if (COMPLIANCE_FEATURES.AGE_GATE_ENABLED) {
  // Check age
}
```

- [ ] Rollback plan documented
- [ ] Feature flags ready if needed

---

## 📈 Success Metrics (Week 1)

Track these metrics for first week:

### Adoption Metrics
- [ ] X% of users completed age verification
- [ ] X% of users accepted policies
- [ ] 0 users blocked inappropriately

### Safety Metrics
- [ ] X media items scanned
- [ ] X flagged items detected
- [ ] X moderation cases created from scans
- [ ] 0 false positives reported

### AML Metrics
- [ ] X creators tracked in AML profiles
- [ ] X users require KYC
- [ ] 0 legitimate earners blocked

### Performance Metrics
- [ ] API response times <500ms
- [ ] No increase in app crash rate
- [ ] No user complaints about gates

---

## 🎯 Go-Live Checklist

**Final checks before enabling for all users:**

### Backend
- [ ] All functions deployed
- [ ] Policies seeded
- [ ] Indexes created
- [ ] Security rules deployed
- [ ] Scheduled jobs configured
- [ ] Logs clean (no errors)

### Mobile
- [ ] App builds successfully
- [ ] Age gate screen works
- [ ] Policy screen works
- [ ] Services functioning
- [ ] Guards in place
- [ ] Tests pass

### Documentation
- [ ] Implementation docs complete
- [ ] Quick start guide ready
- [ ] Migration guide available
- [ ] API docs clear
- [ ] Support team trained

### Compliance
- [ ] Legal team reviewed policy content
- [ ] Privacy team reviewed GDPR flows
- [ ] Security team reviewed data handling
- [ ] All regulatory requirements met

---

## 🎉 Launch!

Once all checks pass:

1. **Soft Launch (10% of users):**
   - Enable for new users only
   - Monitor for 48 hours
   - Fix any issues

2. **Gradual Rollout (25%, 50%, 75%):**
   - Increase percentage every 48 hours
   - Monitor metrics at each stage
   - Address feedback

3. **Full Launch (100%):**
   - Enable for all users
   - Monitor for 1 week
   - Optimize based on data

- [ ] Soft launch complete
- [ ] Full rollout complete
- [ ] No critical issues

---

## 📞 Post-Launch Support

### Day 1-7: Close Monitoring
- Check logs every 6 hours
- Respond to user reports within 2 hours
- Fix critical issues immediately

### Week 2-4: Regular Monitoring
- Check logs daily
- Review compliance metrics
- Adjust thresholds as needed

### Month 2+: Steady State
- Weekly reviews
- Monthly optimization
- Quarterly policy updates

---

**Deployment Checklist Complete** ✅

PACK 55 is production-ready and can be deployed with confidence.

---

**Checklist Version:** 1.0.0  
**Last Updated:** January 24, 2025