# Production Deployment Checklist

Use this checklist before every production deployment to ensure all requirements are met.

## Pre-Deployment Checklist

### 🔐 Security & Compliance

- [ ] All secrets properly configured (no hardcoded keys)
- [ ] Security scan passed (no critical vulnerabilities)
- [ ] Terms of Service up to date
- [ ] Privacy Policy up to date and complete
- [ ] Age verification (18+) gate active
- [ ] KYC provider configured and active
- [ ] Content moderation system enabled
- [ ] Refund policy documented and implemented
- [ ] GDPR data export capability active
- [ ] GDPR data deletion capability active
- [ ] Cookie consent implemented

### 🧪 Testing & Quality

- [ ] All unit tests passing
- [ ] Integration tests passing
- [ ] End-to-end tests passing
- [ ] Manual testing complete on staging
- [ ] Performance testing passed
- [ ] Load testing passed (if applicable)
- [ ] Mobile apps tested on physical devices
- [ ] Cross-browser testing complete (web)
- [ ] Accessibility testing performed

### 📱 Mobile Apps

- [ ] Version numbers updated (iOS + Android)
- [ ] Build numbers incremented
- [ ] Changelog updated
- [ ] App Store screenshots up to date
- [ ] App descriptions reviewed
- [ ] In-app purchase testing complete
- [ ] Push notifications tested
- [ ] Deep linking tested
- [ ] TestFlight build uploaded and tested (iOS)
- [ ] Internal test build verified (Android)

### 💾 Database & Backend

- [ ] Database migrations tested in staging
- [ ] Migration rollback tested
- [ ] Schema version updated
- [ ] Firestore rules validated
- [ ] Firestore indexes deployed
- [ ] Cloud Functions built successfully
- [ ] Cloud Functions tested in staging
- [ ] Backup of current production state created

### 🎯 Feature Flags

- [ ] Feature flags configured correctly
- [ ] Risky features disabled or limited rollout
- [ ] Kill switches tested and ready
- [ ] Rollout percentages set appropriately
- [ ] Feature flag documentation updated

### 💰 Payment Systems

- [ ] Stripe live keys configured
- [ ] Payment flow tested end-to-end
- [ ] Refund flow tested
- [ ] Webhook endpoints verified
- [ ] Payment failure handling tested
- [ ] Currency handling correct
- [ ] Tax calculations verified (if applicable)

### 🔍 Monitoring & Alerts

- [ ] Crashlytics configured
- [ ] Error tracking active
- [ ] Performance monitoring enabled
- [ ] Alert webhooks configured (Slack/Discord)
- [ ] Alert thresholds set appropriately
- [ ] On-call rotation updated
- [ ] Monitoring dashboards reviewed

### 📋 Documentation

- [ ] CHANGELOG.md updated
- [ ] API documentation current
- [ ] Deployment guide reviewed
- [ ] Rollback procedures documented
- [ ] Known issues documented
- [ ] Release notes prepared

### 👥 Team & Communication

- [ ] Team notified of deployment schedule
- [ ] Stakeholders informed
- [ ] Support team briefed
- [ ] Marketing team coordinated (if needed)
- [ ] On-call engineer identified
- [ ] Emergency contacts verified

## Deployment Execution

### Stage 1: Pre-Deploy

- [ ] Announce deployment window to team
- [ ] Put up maintenance banner (if needed)
- [ ] Verify no ongoing critical issues
- [ ] Check current system health
- [ ] Review recent error rates

### Stage 2: Deploy

- [ ] Start GitHub Actions workflow
- [ ] Monitor deployment progress
- [ ] Review deployment logs
- [ ] Wait for automated tests to pass
- [ ] Approve manual approval step
- [ ] Wait for deployment to complete

### Stage 3: Smoke Tests

- [ ] Auth flow working
- [ ] Wallet operations functional
- [ ] Payment processing working
- [ ] Chat billing operational
- [ ] Calendar bookings working
- [ ] AI companions functional (if enabled)
- [ ] Video calls working (if enabled)

### Stage 4: Monitoring

- [ ] Check Crashlytics (crash-free rate)
- [ ] Monitor Cloud Functions errors
- [ ] Check payment success rate
- [ ] Verify API response times
- [ ] Monitor user metrics
- [ ] Watch for alert notifications

### Stage 5: Verification

- [ ] Web app loads correctly
- [ ] Mobile apps function properly
- [ ] All critical features operational
- [ ] No spike in error rates
- [ ] User-facing changes visible
- [ ] Performance acceptable

## Post-Deployment

### Immediate (First Hour)

- [ ] Monitor error rates closely
- [ ] Check user feedback channels
- [ ] Verify payment processing
- [ ] Monitor server resources
- [ ] Check feature flag status
- [ ] Review crash reports

### Short Term (First 24 Hours)

- [ ] Review daily metrics
- [ ] Check user retention
- [ ] Monitor payment volumes
- [ ] Analyze error patterns
- [ ] Review user feedback
- [ ] Update status page if needed

### Follow-Up

- [ ] Document any issues encountered
- [ ] Update runbook if needed
- [ ] Thank the team
- [ ] Schedule retrospective (if issues)
- [ ] Plan next deployment

## Rollback Decision Matrix

Rollback if:

| Condition | Threshold | Action |
|-----------|-----------|--------|
| Crash rate | >5% | Immediate rollback |
| Payment failure | >5% | Immediate rollback |
| API error rate | >10% | Investigate, prepare rollback |
| User complaints | Spike >10x | Investigate urgently |
| Security issue | Any critical | Immediate rollback |
| Data corruption | Any | Immediate rollback |

## Emergency Procedures

### If Deployment Fails

1. Check GitHub Actions logs
2. Identify failure point
3. Assess criticality
4. If critical: trigger rollback
5. If not critical: fix and redeploy

### If Production Issues After Deploy

1. Assess severity and impact
2. Check monitoring dashboards
3. Review error logs
4. Decide: hotfix vs rollback
5. Execute chosen action
6. Communicate with team
7. Document incident

### If Rollback Needed

1. Go to GitHub Actions
2. Run "Rollback Production" workflow
3. Enter backup version (commit SHA)
4. Type "ROLLBACK PRODUCTION"
5. Provide rollback reason
6. Approve final confirmation
7. Monitor rollback progress
8. Verify systems operational
9. Notify team of rollback
10. Plan fix for next deployment

## Sign-Off

Before approving production deployment:

**Deployment Lead**: _____________ Date: _______

**Technical Review**: _____________ Date: _______

**Security Review**: _____________ Date: _______

**Legal/Compliance**: _____________ Date: _______

## Notes

Deployment Version: ______________

Deployment Date: ______________

Deployment Time: ______________ (UTC)

Deployed By: ______________

Special Considerations:
_________________________________
_________________________________
_________________________________

## Post-Deployment Notes

Issues Encountered:
_________________________________
_________________________________

Resolution Steps:
_________________________________
_________________________________

Lessons Learned:
_________________________________
_________________________________

---

**Last Updated**: 2024-12-12  
**Version**: 1.0.0  
**Owner**: DevOps Team