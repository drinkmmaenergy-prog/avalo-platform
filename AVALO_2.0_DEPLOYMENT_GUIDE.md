# Avalo 2.0 Deployment Guide

**Version**: 2.0.0
**Date**: 2025-10-29
**Target Environment**: Production (europe-west3)
**Estimated Deployment Time**: 2-4 hours
**Downtime**: Zero (rolling deployment)

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Deployment Steps](#deployment-steps)
4. [Feature Flag Configuration](#feature-flag-configuration)
5. [Monitoring & Validation](#monitoring--validation)
6. [Rollback Procedures](#rollback-procedures)
7. [Certification Roadmap](#certification-roadmap)
8. [Post-Deployment Tasks](#post-deployment-tasks)

---

## Prerequisites

### Infrastructure Requirements

**Cloud Services**:
- ✅ Firebase Project (existing)
- ✅ Cloud Functions (Node.js 20)
- ✅ Firestore (Native mode)
- ✅ Cloud Storage
- ⚠️ Redis (Memorystore) - Optional for Phase 28
- ⚠️ Pub/Sub Lite - Optional for Phase 26
- ⚠️ BigQuery - Optional for Phase 18 analytics

**External Services**:
- ⚠️ TURN servers (WebRTC) - Required for Phase 30 production
- ⚠️ Blockchain nodes (Ethereum, Polygon, BSC) - Required for Phase 31
- ⚠️ KYC provider (Onfido/Sumsub) - Optional for Phase 21

**Development Tools**:
```bash
node --version  # v20+
npm --version   # v10+
firebase --version  # v13+
```

### Access & Permissions

**Required Roles**:
- Firebase Admin
- Cloud Functions Admin
- Firestore Admin
- Cloud Storage Admin
- IAM Admin

**Service Accounts**:
- Cloud Functions default service account
- Firestore service account
- Cloud Storage service account

---

## Pre-Deployment Checklist

### 1. Code Review & Testing

```bash
# Run all tests
cd functions
npm test

# Expected: All tests pass
# ✅ Phase 18-25 tests: 245 tests passed
# ✅ Phase 26-36 tests: 150+ tests passed
```

### 2. Dependencies Update

```bash
cd functions
npm audit fix
npm outdated
npm update
```

### 3. Build Verification

```bash
cd functions
npm run build

# Should compile without errors
```

### 4. Configuration Review

**Check `firebase.json`**:
```json
{
  "functions": {
    "source": "functions",
    "runtime": "nodejs20",
    "region": "europe-west3"
  },
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

**Check `.env` variables** (if any):
- API keys
- Service URLs
- Feature flag overrides

### 5. Backup

```bash
# Backup Firestore
gcloud firestore export gs://avalo-backup/$(date +%Y%m%d)/

# Backup Cloud Storage
gsutil -m rsync -r gs://avalo-prod-creator-products gs://avalo-backup-$(date +%Y%m%d)/

# Export current function configurations
firebase functions:list > deployed-functions-$(date +%Y%m%d).txt
```

---

## Deployment Steps

### Step 1: Deploy Firestore Rules (5 min)

```bash
# Review rules diff
firebase firestore:rules --help

# Deploy rules
firebase deploy --only firestore:rules

# Verify deployment
firebase firestore:rules:list
```

**Validation**:
- Check Firestore console
- Test write permissions for new collections
- Verify existing collections still accessible

### Step 2: Deploy Firestore Indexes (10 min)

```bash
# Deploy indexes
firebase deploy --only firestore:indexes

# Monitor index creation
# Go to Firebase Console → Firestore → Indexes
# Wait for all indexes to reach "Enabled" status
```

**Expected Indexes**:
- `realtimeConnections`: `userId + lastPingAt`
- `realtimeEvents`: `targetUserId + delivered + createdAt`
- `userPresence`: `isTypingIn + lastActiveAt`
- `callSessions`: `hostId + status + createdAt`
- `cryptoDeposits`: `userId + status + createdAt`
- `riskAssessments`: `userId + timestamp`

**Validation**:
- All indexes show "Enabled" status
- No index creation failures

### Step 3: Deploy Cloud Functions (30-45 min)

**3a. Deploy in Batches**

Batch 1 - Core Realtime (Phase 26):
```bash
firebase deploy --only functions:subscribeToRealtimeEventsV1,functions:unsubscribeFromRealtimeEventsV1,functions:realtimePingV1,functions:getActiveConnectionsV1,functions:getRealtimeMetricsV1

firebase deploy --only functions:updatePresenceV1,functions:getPresenceV1,functions:sendTypingIndicatorV1,functions:sendReadReceiptV1,functions:markChatAsReadV1
```

Batch 2 - Performance & Security (Phase 28-29):
```bash
firebase deploy --only functions:clearCacheV1,functions:getCacheStatsV1

firebase deploy --only functions:getUserRiskAssessmentV1
```

Batch 3 - Voice/Video (Phase 30):
```bash
firebase deploy --only functions:startCallV1,functions:joinCallV1,functions:endCallV1,functions:sendSignalingMessageV1
```

Batch 4 - Crypto Wallet (Phase 31):
```bash
firebase deploy --only functions:connectWalletV1,functions:initiateDepositV1,functions:confirmDepositV1,functions:initiateWithdrawalV1,functions:getWalletStatusV1
```

**3b. Verify Deployments**

```bash
# List all functions
firebase functions:list

# Check logs
firebase functions:log --only subscribeToRealtimeEventsV1 --limit 10
```

**Validation**:
- All functions deployed successfully
- No deployment errors in logs
- Functions respond to test calls

### Step 4: Update Function Exports (Auto-deployed)

The `functions/src/index.ts` includes all new exports. They deploy automatically with the functions.

### Step 5: Seed Feature Flags (10 min)

```bash
# Run seeding script (if created)
firebase functions:shell

# Or manually via Firebase Console:
# Firestore → featureFlags collection
```

**Feature Flags to Create**:

```json
{
  "realtime_engine_v2": {
    "enabled": true,
    "percentage": 5,
    "description": "Realtime presence and events",
    "whitelistedUsers": ["admin_user_id"],
    "rolloutStartDate": "2025-10-29"
  },
  "realtime_presence": {
    "enabled": true,
    "percentage": 100,
    "description": "Online/offline/typing indicators"
  },
  "intelligent_caching": {
    "enabled": true,
    "percentage": 100,
    "description": "Performance caching layer"
  },
  "security_ai_enabled": {
    "enabled": true,
    "percentage": 100,
    "description": "ML fraud detection"
  },
  "voice_video_enabled": {
    "enabled": true,
    "percentage": 5,
    "description": "Voice and video calls",
    "whitelistedUsers": ["admin_user_id", "creator_test_id"]
  },
  "crypto_wallet_enabled": {
    "enabled": true,
    "percentage": 0,
    "description": "Crypto wallet integration (testnet)",
    "whitelistedUsers": ["admin_user_id"]
  }
}
```

**Validation**:
- Feature flags visible in Firestore
- Test calls respect feature flag settings

### Step 6: Deploy Web App Updates (if applicable)

```bash
# Deploy Next.js/Expo updates
cd web
npm run build
firebase deploy --only hosting

# Or deploy to Vercel/other hosting
vercel --prod
```

---

## Feature Flag Configuration

### Rollout Strategy (4 Weeks)

**Week 1: Beta Testing (5% rollout)**
```javascript
{
  "realtime_engine_v2": { percentage: 5 },
  "voice_video_enabled": { percentage: 5 }
}
```

**Week 2: Early Adopters (25% rollout)**
```javascript
{
  "realtime_engine_v2": { percentage: 25 },
  "voice_video_enabled": { percentage: 25 }
}
```

**Week 3: Majority (50% rollout)**
```javascript
{
  "realtime_engine_v2": { percentage: 50 },
  "voice_video_enabled": { percentage: 50 }
}
```

**Week 4: Full Production (100% rollout)**
```javascript
{
  "realtime_engine_v2": { percentage: 100 },
  "voice_video_enabled": { percentage: 100 }
}
```

### Emergency Rollback

If critical issues detected:
```javascript
{
  "realtime_engine_v2": { enabled: false },
  "voice_video_enabled": { enabled: false }
}
```

Disable via Firebase Console or callable function:
```bash
firebase functions:shell
> setFeatureFlag("realtime_engine_v2", { enabled: false })
```

---

## Monitoring & Validation

### Health Checks (First 24 Hours)

**1. Cloud Functions Metrics**

```bash
# Check function execution
gcloud functions logs read subscribeToRealtimeEventsV1 --limit 50

# Check error rate
gcloud functions logs read --filter="severity>=ERROR" --limit 50
```

**Expected**:
- Error rate <1%
- Average execution time <500ms
- No timeouts

**2. Firestore Metrics**

Firebase Console → Firestore → Usage:
- Monitor read/write operations
- Check for unexpected spikes
- Verify caching is reducing reads

**Expected**:
- 35% reduction in reads (Phase 28 caching)
- No quota exceeded errors

**3. Realtime Performance**

Monitor:
- Active connections: `/realtimeConnections` count
- Event latency: Time from publish to delivery
- Presence update speed

**Expected**:
- <100ms event delivery
- <200ms presence updates
- 99.9% delivery success rate

**4. Security Metrics**

Monitor:
- Risk assessments created: `/riskAssessments` count
- Security incidents: `/securityIncidents` count
- Fraud detection accuracy

**Expected**:
- >95% fraud detection accuracy
- <2% false positive rate
- <10 critical incidents/day

**5. Voice/Video Metrics**

Monitor:
- Call sessions: `/callSessions` count
- Call success rate: Active / (Active + Failed)
- Average duration

**Expected**:
- >90% call success rate
- Average duration: 5-15 minutes
- Revenue tracking accurate

### Alerts Configuration

**Firebase Alerts**:
- Function error rate >5%
- Function execution time >2s (p95)
- Firestore quota 80% exceeded

**Custom Alerts**:
```javascript
// Set up in Cloud Monitoring
{
  "realtime_latency": {
    "threshold": 200,
    "window": "5m",
    "action": "email_oncall"
  },
  "fraud_detection_rate": {
    "threshold": 0.90,
    "condition": "below",
    "action": "email_security_team"
  },
  "call_failure_rate": {
    "threshold": 0.10,
    "condition": "above",
    "action": "slack_webhook"
  }
}
```

---

## Rollback Procedures

### Immediate Rollback (< 5 minutes)

**1. Disable Feature Flags**

Via Firebase Console:
1. Go to Firestore → `featureFlags`
2. Set `enabled: false` for problematic features
3. Changes take effect immediately (15-min cache TTL)

**2. Revert Functions**

```bash
# List function versions
firebase functions:list --json

# Rollback specific function
gcloud functions deploy FUNCTION_NAME --source=gs://PREVIOUS_VERSION

# Or rollback all Phase 26-36 functions
firebase deploy --only functions --force
```

**3. Revert Firestore Rules**

```bash
# Restore from backup
firebase firestore:rules --set firestore.rules.backup

# Or manually revert in Firebase Console
```

### Full Rollback (< 30 minutes)

**1. Restore Database**

```bash
# Restore Firestore from backup
gcloud firestore import gs://avalo-backup/YYYYMMDD/

# This creates a new database, requires data migration
```

**2. Redeploy Previous Version**

```bash
# Checkout previous version
git checkout PREVIOUS_TAG

# Redeploy
firebase deploy --only functions,firestore:rules,firestore:indexes

# Verify
firebase functions:list
```

**3. User Communication**

- Post status update on status page
- Send in-app notification
- Update social media

---

## Certification Roadmap

### GDPR Compliance (EU)

**Status**: ✅ Ready (Phase 23 complete)

**Requirements Met**:
- ✅ Data export functionality
- ✅ Right to deletion (30-day grace period)
- ✅ Data processing agreements
- ✅ Consent management
- ✅ Data breach notification process
- ✅ Data protection officer assigned

**Audit Steps**:
1. Internal audit (Legal team)
2. External audit (DPO firm)
3. Documentation review
4. Corrective actions (if any)
5. Certification issued

**Timeline**: 2-3 months
**Cost**: €5,000-€15,000

### WCAG 2.2 AA Compliance

**Status**: 🟡 Framework Ready (Frontend pending)

**Requirements**:
- ⚠️ Semantic HTML structure
- ⚠️ ARIA labels
- ⚠️ Keyboard navigation
- ⚠️ Screen reader optimization
- ⚠️ Color contrast (4.5:1 minimum)
- ⚠️ Text resizing (200% without loss of functionality)
- ⚠️ Focus indicators

**Audit Steps**:
1. Automated audit (Lighthouse, axe DevTools)
2. Manual testing with screen readers
3. User testing with disabled users
4. Remediation of issues
5. Re-audit and certification

**Timeline**: 2-4 months
**Cost**: $10,000-$30,000

### ISO 27001 Certification

**Status**: ✅ Baseline Controls Ready

**Requirements Met**:
- ✅ Access control (RBAC)
- ✅ Cryptography (TLS, at-rest encryption)
- ✅ Physical security (Cloud infrastructure)
- ✅ Operations security (monitoring, logging)
- ✅ Communications security (API security)
- ✅ System acquisition, development, maintenance
- ✅ Supplier relationships (Firebase, Google Cloud)
- ✅ Incident management (Phase 22)
- ✅ Business continuity (backup, redundancy)

**Audit Steps**:
1. Gap analysis
2. Information Security Management System (ISMS) documentation
3. Risk assessment
4. Statement of Applicability (SoA)
5. Internal audit
6. Management review
7. External certification audit (Stage 1 & 2)
8. Certification issued

**Timeline**: 6-12 months
**Cost**: $20,000-$50,000

### OWASP Top 10 Validation

**Status**: ✅ Compliant

**Validation Steps**:
1. Automated security scanning (OWASP ZAP, Burp Suite)
2. Manual penetration testing
3. Code review (static analysis)
4. Dependency scanning (Snyk, Dependabot)
5. Security report generation

**Timeline**: 1-2 months
**Cost**: $5,000-$15,000

### SOC 2 Type II Audit (Optional)

**Status**: 🟡 Preparation needed

**Requirements**:
- Security controls
- Availability (99.9% uptime)
- Processing integrity (data accuracy)
- Confidentiality (access controls)
- Privacy (data handling)

**Timeline**: 6-12 months (3-6 months observation period)
**Cost**: $15,000-$50,000

### PCI DSS Compliance (If processing cards)

**Status**: ⚠️ Not applicable (token-based system)

If adding credit card processing:
- Use Stripe/payment processor (handles PCI)
- Never store card data directly
- Use Stripe Elements (PCI-compliant UI)

---

## Post-Deployment Tasks

### Week 1: Monitoring & Bug Fixes

- [ ] Monitor error logs daily
- [ ] Review user feedback
- [ ] Fix critical bugs (hotfix if needed)
- [ ] Update runbooks based on incidents
- [ ] Conduct post-deployment review meeting

### Week 2-4: Gradual Rollout

- [ ] Week 2: Increase feature flags to 25%
- [ ] Week 3: Increase feature flags to 50%
- [ ] Week 4: Increase feature flags to 100%
- [ ] Monitor metrics at each stage
- [ ] Document lessons learned

### Month 2: Optimization

- [ ] Analyze performance metrics
- [ ] Optimize slow queries
- [ ] Tune cache TTLs
- [ ] Improve error handling
- [ ] Enhance monitoring dashboards

### Month 3: Certification Preparation

- [ ] Schedule GDPR audit
- [ ] Schedule WCAG audit
- [ ] Begin ISO 27001 documentation
- [ ] Conduct penetration testing
- [ ] Prepare audit evidence

### Month 4-6: Certification Audits

- [ ] Complete GDPR certification
- [ ] Complete WCAG certification
- [ ] Progress ISO 27001 audit (Stage 1)
- [ ] Remediate audit findings
- [ ] Update compliance documentation

### Month 6-12: ISO 27001 Completion

- [ ] Complete Stage 2 audit
- [ ] Receive ISO 27001 certification
- [ ] Celebrate with team! 🎉
- [ ] Marketing announcement
- [ ] Update website with certifications

---

## Deployment Team Roles

### Lead Engineer
- Overall deployment coordination
- Technical decision-making
- Incident response

### Backend Engineers (2-3)
- Cloud Functions deployment
- Firestore rules/indexes
- API testing

### Frontend Engineers (2-3)
- Web app deployment
- Mobile app updates
- UI testing

### DevOps Engineer
- Infrastructure provisioning
- CI/CD pipeline
- Monitoring setup

### QA Engineer
- Deployment validation
- Regression testing
- Performance testing

### Product Manager
- Feature flag decisions
- Rollout strategy
- Stakeholder communication

### Security Engineer
- Security validation
- Penetration testing
- Compliance checks

---

## Success Criteria

### Technical Success
- ✅ All functions deployed without errors
- ✅ All indexes created successfully
- ✅ Error rate <1%
- ✅ 99.9% uptime maintained
- ✅ Performance targets met

### Business Success
- ✅ No user-facing issues
- ✅ Positive user feedback
- ✅ Revenue tracking accurate
- ✅ No security incidents

### Compliance Success
- ✅ GDPR audit scheduled
- ✅ WCAG audit scheduled
- ✅ ISO 27001 process initiated

---

## Support & Escalation

### On-Call Schedule
- **Primary**: Engineer A (Week 1)
- **Secondary**: Engineer B (Week 1)
- **Manager**: Engineering Manager
- **Executive**: CTO

### Contact Information
- **Slack**: #avalo-deployments
- **Email**: devops@avalo.app
- **Phone**: +48 XXX XXX XXX (emergency)

### Escalation Path
1. On-call engineer (immediate)
2. Engineering manager (15 min)
3. CTO (30 min)
4. CEO (1 hour)

---

## Conclusion

This deployment guide provides comprehensive instructions for deploying Avalo 2.0 to production. Follow each step carefully, monitor metrics continuously, and be prepared to rollback if critical issues arise.

**Key Takeaways**:
- Deploy in batches for safety
- Start with 5% feature flag rollout
- Monitor metrics closely for 24-48 hours
- Gradual rollout over 4 weeks
- Begin certification audits immediately

**Questions?** Contact devops@avalo.app or post in #avalo-deployments Slack channel.

---

**Document Version**: 1.0
**Last Updated**: 2025-10-29
**Next Review**: After successful deployment (Q4 2025)
