# PACK 387 — Quick Start Guide

## 🚀 5-Minute Setup

### Prerequisites
- ✅ PACK 300/300A (Support & Safety) deployed
- ✅ PACK 302 (Fraud Detection) deployed
- ✅ PACK 384 (App Store Defense) deployed
- ✅ PACK 386 (Marketing Automation) deployed
- ✅ Firebase CLI installed
- ✅ Admin access to Firebase project

---

## 📦 Installation

### Option 1: Automatic Deployment (Recommended)

```bash
chmod +x deploy-pack387.sh
./deploy-pack387.sh
```

### Option 2: Manual Deployment

```bash
# 1. Deploy Firestore rules
firebase deploy --only firestore:rules

# 2. Deploy indexes
firebase deploy --only firestore:indexes

# 3. Build and deploy functions
cd functions
npm install
npm run build
cd ..

# 4. Deploy functions
firebase deploy --only functions:pack387_ingestReputationSignal,functions:pack387_analyzeReputationTrends,functions:pack387_createIncident,functions:pack387_updateIncidentStatus,functions:pack387_closeIncidentWithReport,functions:pack387_crisisResponseOrchestrator,functions:pack387_preparePublicStatement,functions:pack387_legalApproveStatement,functions:pack387_executiveApproveStatement,functions:pack387_releasePublicStatement,functions:pack387_storeCrisisShield,functions:pack387_influencerReputationRisk,functions:pack387_detectCoordinatedAttack,functions:pack387_analyzeRatingTrends,functions:pack387_updateAllInfluencerRisks
```

---

## ⚙️ Configuration

### 1. Set Up User Roles

Users need appropriate roles for crisis management:

```typescript
// Firebase Console or Cloud Functions
await db.collection('users').doc(userId).update({
  role: 'admin' | 'executive' | 'legal' | 'support' | 'moderator'
});
```

**Role Permissions**:
- **Admin**: Full access to all crisis management features
- **Executive**: Approve public statements, view incidents
- **Legal**: Legal review and approval of statements
- **Support/Moderator**: View incidents and signals, create tickets

### 2. Configure External Signal Sources

Set up webhooks to ingest reputation signals:

```typescript
// Example: Ingest App Store review
const signal = await functions.httpsCallable('pack387_ingestReputationSignal')({
  source: 'AppStore',
  sentimentScore: -0.7, // Negative review
  topic: 'safety',
  geo: 'US',
  content: 'Review text...',
  url: 'https://apps.apple.com/...',
});
```

**Supported Sources**:
- AppStore
- PlayStore
- X (Twitter)
- TikTok
- Reddit
- Forums
- News

### 3. Test Crisis Detection

```typescript
// Create test incident
const incident = await functions.httpsCallable('pack387_createIncident')({
  title: 'Test PR Crisis',
  description: 'Testing crisis orchestration system',
  status: 'OPEN',
  threatLevel: 'CRITICAL',
  publicVisibility: 'HIGH',
  legalExposure: false,
  geo: 'US',
  topic: 'safety',
});

// This will trigger automatic crisis orchestration!
```

---

## 🎯 Common Use Cases

### Use Case 1: Handle Negative Review Spike

**Detection** (Automatic):
```
5 negative reviews in 30 minutes → AUTO-CREATE PR Incident → TRIGGER Crisis Orchestration
```

**Actions Taken** (Automatic):
- ✅ Freeze marketing campaigns
- ✅ Suppress review prompts
- ✅ Notify legal & executive team
- ✅ Create crisis response log

**Manual Response**:
1. Review incident details
2. Link related support tickets
3. Draft public statement
4. Get legal & executive approval
5. Publish statement
6. Close incident with report

### Use Case 2: Influencer PR Crisis

**Scenario**: Influencer involved in controversy

```typescript
// 1. System detects negative signals about influencer
await pack387_influencerReputationRisk({ influencerId: 'user123' });
// → Risk score calculated

// 2. If risk score ≥75 (CRITICAL):
// - Payouts automatically frozen
// - Campaigns automatically paused
// - Admin team notified

// 3. Manual review and decision
await pack387_unfreezeInfluencer({
  influencerId: 'user123',
  reason: 'Reviewed and cleared by legal team'
});
```

### Use Case 3: Coordinate Cross-System Crisis

**Scenario**: Multiple systems reporting issues

```typescript
// System automatically detects:
// - 5 safety incidents (PACK 300)
// - 3 fraud cases (PACK 302)
// - 10 negative reviews (PACK 384)
// All in same geo within 1 hour

// → AUTO-CREATE PR Incident with CRITICAL threat level
// → AUTO-LINK all related cases
// → TRIGGER full crisis orchestration
```

### Use Case 4: Public Statement Workflow

```typescript
// 1. Draft statement
const statement = await functions.httpsCallable('pack387_preparePublicStatement')({
  incidentId: 'incident-id',
  platform: 'X',
  title: 'Statement Regarding Recent Issues',
  content: 'We are aware of concerns and actively investigating...',
});

// 2. Submit for legal review
await functions.httpsCallable('pack387_submitForLegalReview')({
  statementId: statement.data.statementId,
});

// 3. Legal team reviews and approves
await functions.httpsCallable('pack387_legalApproveStatement')({
  statementId: statement.data.statementId,
  approved: true,
  notes: 'Reviewed and approved',
});

// 4. Executive team approves
await functions.httpsCallable('pack387_executiveApproveStatement')({
  statementId: statement.data.statementId,
  approved: true,
  notes: 'Approved for publication',
});

// 5. Publish
await functions.httpsCallable('pack387_releasePublicStatement')({
  statementId: statement.data.statementId,
});
// → Statement status: PUBLISHED
```

---

## 🚨 Crisis Response Checklist

When CRITICAL incident is detected:

### Immediate (Automatic)
- [ ] Marketing campaigns frozen
- [ ] Review prompts suppressed
- [ ] Safety tickets fast-tracked
- [ ] Influencer payouts locked (if applicable)
- [ ] Legal & executive notified

### Within 1 Hour (Manual)
- [ ] Acknowledge incident internally
- [ ] Assign incident handler
- [ ] Link all related tickets/cases
- [ ] Assess legal exposure
- [ ] Draft initial communication

### Within 4 Hours (Manual)
- [ ] Complete legal review
- [ ] Get executive approval
- [ ] Publish public statement (if needed)
- [ ] Update status to MITIGATED

### Within 24 Hours (Manual)
- [ ] Complete investigation
- [ ] Resolve root cause
- [ ] Close incident with full report
- [ ] Document lessons learned
- [ ] Implement preventative measures

---

## 📊 Monitoring & Alerts

### Key Metrics to Watch

**Dashboard**: Access via admin panel

1. **Sentiment Score**: Daily average by geo
   - ⚠️ Alert if drops >0.5 in 24h

2. **Incident Rate**: Open incidents
   - ⚠️ Alert if >3 CRITICAL incidents

3. **Review Trends**: App store ratings
   - ⚠️ Alert if rating drops >0.3

4. **Influencer Risk**: High-risk influencers
   - ⚠️ Alert if new CRITICAL risk detected

### Real-Time Alerts

Configure notifications in Firebase:

```typescript
// Admin users receive notifications for:
- CRITICAL incidents created
- Legal reviews required
- Executive approvals required  
- Crisis measures activated
- Coordinated attacks detected
```

---

## 🔧 Troubleshooting

### Issue: Crisis orchestration not triggering

**Check**:
1. Incident has `threatLevel: 'CRITICAL'` or `'HIGH'`
2. Cloud function `pack387_crisisResponseOrchestrator` is deployed
3. Check function logs in Firebase Console

### Issue: Statements stuck in pending

**Check**:
1. Legal approval completed
2. Executive approval completed
3. User has correct role permissions
4. Statement status is `APPROVED` before publishing

### Issue: Influencer payouts not freezing

**Check**:
1. Risk score ≥75
2. Function `pack387_influencerReputationRisk` executed successfully
3. Check `influencerRiskScores` collection
4. Verify `payoutFrozen: true` in document

### Issue: Review prompts still showing during crisis

**Check**:
1. Store crisis shield is active
2. Check `storeCrisisShields` collection
3. Verify `active: true` and correct geo
4. Mobile app calling `pack387_shouldSuppressReviewPrompt`

---

## 📚 Additional Resources

- **Full Documentation**: [`PACK_387_GLOBAL_PR_REPUTATION_ENGINE.md`](PACK_387_GLOBAL_PR_REPUTATION_ENGINE.md)
- **Firestore Rules**: [`firestore-pack387-reputation.rules`](firestore-pack387-reputation.rules)
- **Firestore Indexes**: [`firestore-pack387-reputation.indexes.json`](firestore-pack387-reputation.indexes.json)

**Cloud Functions**:
- [`pack387-reputation-ingest.ts`](functions/src/pack387-reputation-ingest.ts) - Signal ingestion
- [`pack387-incidents.ts`](functions/src/pack387-incidents.ts) - Incident management
- [`pack387-crisis-orchestration.ts`](functions/src/pack387-crisis-orchestration.ts) - Auto-response
- [`pack387-public-statements.ts`](functions/src/pack387-public-statements.ts) - Communications
- [`pack387-store-shield.ts`](functions/src/pack387-store-shield.ts) - Review protection
- [`pack387-influencer-risk.ts`](functions/src/pack387-influencer-risk.ts) - Risk scoring

---

## 🆘 Emergency Procedures

### CRITICAL Incident Response

1. **Verify Automatic Actions**
   ```bash
   # Check crisis response logs
   firebase firestore:query crisisResponseLogs \
     --where "incidentId == 'incident-id'" \
     --orderBy timestamp desc
   ```

2. **Manual Intervention**
   ```typescript
   // If auto-orchestration failed, trigger manually
   await functions.httpsCallable('pack387_triggerCrisisOrchestration')({
     incidentId: 'incident-id'
   });
   ```

3. **Escalate to Leadership**
   - Contact executive team directly
   - Brief on incident details
   - Get approval for public communication
   - Coordinate with legal team

4. **Public Communication**
   - Use pre-approved templates
   - Get legal + executive approval
   - Monitor response and adjust

5. **Post-Crisis**
   - Deactivate crisis measures
   - Document lessons learned
   - Update playbooks
   - Implement preventative fixes

---

## ✅ Success Criteria

PACK 387 is working correctly when:

- ✅ Negative review spikes trigger automatic incidents
- ✅ CRITICAL incidents trigger full crisis orchestration
- ✅ Marketing campaigns pause during crises
- ✅ Review prompts suppressed in crisis mode
- ✅ Influencer payouts freeze for high-risk accounts
- ✅ Legal & executive teams notified immediately
- ✅ Public statements require multi-level approval
- ✅ All actions logged immutably

---

**Status**: ✅ PRODUCTION READY  
**Last Updated**: 2025-12-30  
**Maintainer**: CTO Team
