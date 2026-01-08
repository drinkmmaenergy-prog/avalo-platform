# PACK 387 — Global PR, Reputation Intelligence & Crisis Response Engine

**Stage**: D — Public Launch & Market Expansion  
**Status**: ✅ DEPLOYED  
**Dependencies**: PACK 300/300A (Support & Safety), PACK 301/301B (Growth & Retention), PACK 302 (Fraud Detection), PACK 384 (App Store Defense), PACK 385 (Public Launch), PACK 386 (Marketing Automation)

---

## 🎯 OBJECTIVE

Build a real-time global reputation monitoring and crisis-control system that:

- Detects PR threats before they escalate
- Synchronizes Support, Fraud, and Marketing signals
- Protects Avalo brand trust during high-scale growth
- Enables instant crisis response with legal & safety alignment

---

## 📦 SYSTEM ARCHITECTURE

### Firestore Collections

#### 1. `reputationSignals`
Tracks real-time PR signals from external sources

**Fields**:
- `source`: AppStore | PlayStore | X | TikTok | Reddit | Forums | News
- `sentimentScore`: -1.0 (very negative) → +1.0 (very positive)
- `threatLevel`: LOW | MEDIUM | HIGH | CRITICAL
- `topic`: safety | scam | pricing | moderation | abuse | privacy | billing | content
- `geo`: Geographic region
- `timestamp`: When signal was detected
- `content`: Optional signal content
- `url`: Optional source URL
- `authorId`: Optional author identifier
- `relatedUserId`: Optional related Avalo user
- `metadata`: Additional context

**Auto-Detection Rules**:
- CRITICAL if 5+ negative reports in 30 minutes from same geo
- CRITICAL if fraud + safety + support spike combined
- CRITICAL if store rating drop >0.3 in 24h

#### 2. `prIncidents`
Tracks PR incidents and crisis events

**Fields**:
- `title`: Incident title
- `description`: Detailed description
- `status`: OPEN | ESCALATED | LEGAL_REVIEW | MITIGATED | CLOSED
- `threatLevel`: LOW | MEDIUM | HIGH | CRITICAL
- `triggeringSignals`: Array of signals that triggered incident
- `linkedSupportTickets`: Array of related support ticket IDs (PACK 300)
- `linkedFraudCases`: Array of related fraud case IDs (PACK 302)
- `linkedSafetyIncidents`: Array of related safety incident IDs (PACK 300)
- `influencerInvolvement`: Array of implicated influencer IDs (PACK 386)
- `publicVisibility`: LOW | MEDIUM | HIGH | CRITICAL
- `legalExposure`: Boolean flag for legal risk
- `legalReview`: Legal approval object
- `geo`: Geographic region
- `topic`: Incident category
- `assignedTo`: User ID of assigned handler
- `resolutionReport`: Post-incident report
- Timestamps: `createdAt`, `updatedAt`, `resolvedAt`

#### 3. `publicStatements`
Manages public communications with multi-level approval

**Fields**:
- `incidentId`: Related PR incident ID
- `platform`: press | X | TikTok | StoreReply | Blog | Email
- `status`: DRAFT | PENDING_LEGAL | PENDING_EXECUTIVE | APPROVED | PUBLISHED
- `title`: Statement title
- `content`: Statement body
- `legalApproval`: Boolean + approval metadata
- `executiveApproval`: Boolean + approval metadata
- `safetyValidation`: Boolean + validation metadata
- `publishedAt`: Publication timestamp
- `createdBy`: Author user ID
- Timestamps: `createdAt`, `updatedAt`

**Approval Requirements**:
- ✅ Legal approval
- ✅ Executive confirmation
- ✅ Safety validation
- All three required before publication

#### 4. `crisisResponseLogs`
Immutable audit log of all crisis actions

**Fields**:
- `incidentId`: Related incident
- `actionType`: Type of action taken
- `performedBy`: User who performed action
- `status`: Action status
- `timestamp`: When action occurred
- `metadata`: Additional action data

**Action Types**:
- `CRISIS_DETECTED`
- `ORCHESTRATION_TRIGGERED`
- `MARKETING_CAMPAIGNS_FROZEN`
- `REVIEW_PROMPTS_SUPPRESSED`
- `SAFETY_TICKETS_FAST_TRACKED`
- `INFLUENCER_PAYOUTS_LOCKED`
- `STAKEHOLDERS_NOTIFIED`
- `CRISIS_MEASURES_DEACTIVATED`
- `STATEMENT_DRAFTED`
- `STATEMENT_PUBLISHED`

#### 5. `storeCrisisShields`
Controls review/rating requests during crises

**Fields**:
- `incidentId`: Related incident
- `active`: Boolean
- `suppressReviewPrompts`: Boolean
- `suppressRatingRequests`: Boolean
- `geo`: GLOBAL or specific region
- `activatedAt`: Activation timestamp
- `deactivatedAt`: Deactivation timestamp

#### 6. `influencerRiskScores`
Tracks influencer reputation risk

**Fields**:
- `influencerId`: Influencer user ID
- `riskScore`: 0-100 (0=safe, 100=critical)
- `riskLevel`: LOW | MEDIUM | HIGH | CRITICAL
- `negativeSignalCount`: Count of negative signals
- `linkedIncidentCount`: Count of linked PR incidents
- `safetyReportCount`: Count of safety reports
- `fraudCaseCount`: Count of fraud cases
- `payoutFrozen`: Boolean
- `frozenReason`: Reason for payout freeze
- `updatedAt`: Last update timestamp

**Risk Calculation**:
```
riskScore = (negativeSignals × 5) + (linkedIncidents × 20) + (safetyReports × 15) + (fraudCases × 25)
Max: 100
```

**Auto-Actions**:
- Score ≥75: Freeze payouts, pause campaigns, notify admins

#### 7. `sentimentAnalytics`
Aggregated daily sentiment data by geo

**Fields**:
- `geo`: Geographic region
- `date`: Date (YYYY-MM-DD)
- `signalCount`: Total signals
- `averageSentiment`: Average sentiment score
- `topicBreakdown`: Count by topic
- `sourceBreakdown`: Count by source
- `timestamp`: Aggregation timestamp

---

## ⚙️ CLOUD FUNCTIONS

### 1. Reputation Signal Ingestion
**File**: [`functions/src/pack387-reputation-ingest.ts`](functions/src/pack387-reputation-ingest.ts)

#### `pack387_ingestReputationSignal()`
Ingest external reputation signals and detect crises

**Input**:
```typescript
{
  source: ReputationSource,
  sentimentScore: number,  // -1.0 to +1.0
  topic: Topic,
  geo: string,
  content?: string,
  url?: string,
  authorId?: string,
  relatedUserId?: string,
  metadata?: Record<string, any>
}
```

**Auto-Detection**:
- ✅ Geographic reputation spikes
- ✅ Cross-system crisis correlation (support + fraud + safety)
- ✅ Store rating drops
- ✅ Coordinated attack patterns

#### `pack387_analyzeReputationTrends()`
Scheduled hourly analysis of reputation trends

---

### 2. PR Incidents Management
**File**: [`functions/src/pack387-incidents.ts`](functions/src/pack387-incidents.ts)

#### `pack387_createIncident()`
Create new PR incident

#### `pack387_updateIncidentStatus()`
Update incident status with workflow automation

#### `pack387_closeIncidentWithReport()`
Close incident with lessons learned

#### `pack387_addLegalReview()`
Add legal team review to incident

#### `pack387_linkSupportTickets()`
Link support tickets to incident

#### `pack387_linkFraudCases()`
Link fraud cases to incident

#### `pack387_getIncidentDetails()`
Get full incident details with all linked data

---

### 3. Crisis Orchestration
**File**: [`functions/src/pack387-crisis-orchestration.ts`](functions/src/pack387-crisis-orchestration.ts)

#### `pack387_crisisResponseOrchestrator()`
**Trigger**: Firestore onCreate for `prIncidents` with CRITICAL/HIGH threat

**Automated Actions**:

1. **Freeze Marketing Campaigns** (PACK 386)
   - Pauses all active campaigns
   - Tags with `PAUSED_CRISIS` status
   - Links to incident ID

2. **Suppress Review Prompts** (PACK 384)
   - Activates store crisis shield
   - Blocks review/rating requests
   - Geo-specific or global

3. **Fast-Track Safety Tickets** (PACK 300)
   - Upgrades priority to CRITICAL
   - Flags for immediate attention
   - Links to incident

4. **Lock Influencer Payouts** (PACK 386)
   - Freezes pending payouts
   - Pauses active campaigns
   - Updates risk scores

5. **Notify Legal & Executive**
   - Creates priority notifications
   - Sends to all stakeholders
   - Includes incident details

#### `pack387_deactivateCrisisMeasures()`
Resume normal operations after incident resolution

---

### 4. Public Statements
**File**: [`functions/src/pack387-public-statements.ts`](functions/src/pack387-public-statements.ts)

#### `pack387_preparePublicStatement()`
Draft public communication

#### `pack387_submitForLegalReview()`
Submit statement for legal approval

#### `pack387_legalApproveStatement()`
Legal team approval/rejection

#### `pack387_executiveApproveStatement()`
Executive approval/rejection (requires legal approval first)

#### `pack387_releasePublicStatement()`
Publish statement (requires all approvals)

**Workflow**:
```
DRAFT → PENDING_LEGAL → PENDING_EXECUTIVE → APPROVED → PUBLISHED
       ↓                ↓
    [Rejected]      [Rejected]
       ↓                ↓
      DRAFT           DRAFT
```

---

### 5. Store Crisis Shield
**File**: [`functions/src/pack387-store-shield.ts`](functions/src/pack387-store-shield.ts)

#### `pack387_storeCrisisShield()`
Activate/deactivate review suppression

#### `pack387_shouldSuppressReviewPrompt()`
Check if review prompts should be suppressed for user

#### `pack387_detectNegativeReviewClustering()`
**Trigger**: Firestore onCreate for `appStoreReviews`
Detects mass negative review attacks (>20/hour)

#### `pack387_getStoreReplyMacro()`
Get pre-approved response templates:
- Safety issues
- Fraud allegations
- Billing confusion
- Content moderation

#### `pack387_analyzeRatingTrends()`
Scheduled 6-hourly store rating analysis

---

### 6. Influencer Risk Correlation
**File**: [`functions/src/pack387-influencer-risk.ts`](functions/src/pack387-influencer-risk.ts)

#### `pack387_influencerReputationRisk()`
Calculate influencer risk score (0-100)

**Risk Factors**:
- Negative signals created by influencer (5 points each)
- Negative signals about influencer (10 points each)
- Linked PR incidents (20 points each)
- Safety reports (15 points each)
- Fraud cases (25 points each)

**Auto-Actions at CRITICAL (≥75)**:
- Freeze all pending payouts
- Pause active campaigns
- Notify admin team

#### `pack387_detectCoordinatedAttack()`
Scheduled 30-minute checks for:
- Harassment campaigns
- Coordinated topic attacks
- Bot-generated content (duplicate detection)

#### `pack387_updateAllInfluencerRisks()`
Daily recalculation of all influencer risk scores

#### `pack387_unfreezeInfluencer()`
Manual admin override to unfreeze influencer after review

---

## 🔒 SECURITY & PERMISSIONS

**Firestore Rules**: [`firestore-pack387-reputation.rules`](firestore-pack387-reputation.rules)

### Role-Based Access:
- **Admin**: Full access to all collections
- **Executive**: Read incidents, approve statements
- **Legal**: Read incidents, approve statements, legal reviews
- **Support/Moderator**: Read incidents and signals
- **System**: Auto-generated signals and logs

### Write Protection:
- ❌ Crisis response logs are immutable
- ❌ Published statements cannot be edited
- ✅ Legal can only modify legal fields
- ✅ Executive can only modify executive fields

---

## 📊 INDEXES

**File**: [`firestore-pack387-reputation.indexes.json`](firestore-pack387-reputation.indexes.json)

**Critical Queries**:
- Signals by threat level + timestamp
- Signals by geo + timestamp
- Incidents by status + created date
- Statements by approval status
- Risk scores by score descending

---

## 🚨 CRISIS RESPONSE WORKFLOW

### Automatic Detection

```mermaid
ReputationSignal → [Spike Detection] → PRIncident (CRITICAL)
                                          ↓
                                  [Auto-Orchestration]
                                          ↓
                    ┌─────────────────────┼─────────────────────┐
                    ↓                     ↓                     ↓
            Freeze Marketing      Suppress Reviews      Fast-Track Safety
                    ↓                     ↓                     ↓
            Lock Payouts         Notify Legal/Exec      Link Systems
```

### Manual Response

```mermaid
Incident Created → Assign Handler → Investigate
                                         ↓
                              Link Related Data
                                         ↓
                              Draft Statement
                                         ↓
                              Legal Review → Executive Review
                                         ↓
                              Publish (if approved)
                                         ↓
                              Monitor Resolution
                                         ↓
                              Close with Report
```

---

## 🎛️ ADMIN DASHBOARD

### Reputation Overview
- Live sentiment heatmap by geo
- Threat level distribution
- Recent signals timeline
- Topic breakdown

### Active Incidents
- Open incidents list
- Escalation status
- Legal review queue
- Executive approval queue

### Crisis Shields
- Active shields by geo
- Suppression status
- Linked incidents

### Influencer Risk
- High-risk influencers
- Frozen payouts
- Recent risk changes

### Statement Management
- Pending legal reviews
- Pending executive approvals
- Published statements
- Draft statements

---

## 📈 METRICS & MONITORING

### Key Metrics
- **MTTD** (Mean Time To Detect): Average time from first signal to incident creation
- **MTTR** (Mean Time To Respond): Average time from incident to first action
- **Sentiment Score**: Daily average by geo
- **Incident Rate**: Incidents per 1000 users
- **Resolution Time**: Average time to close incidents

### Alerts
- ⚠️  Sentiment drop >0.5 in 24h
- 🚨 CRITICAL incident created
- ⚠️  5+ negative reviews in 30 min
- 🚨 Influencer risk ≥75
- ⚠️  Coordinated attack detected

---

## 🔗 INTEGRATION POINTS

### PACK 300 (Support & Safety)
- Links safety incidents to PR incidents
- Fast-tracks critical support tickets
- Correlates safety spikes with reputation

### PACK 302 (Fraud Detection)
- Links fraud cases to PR incidents
- Detects fraud-related reputation damage
- Coordinates fraud + PR response

### PACK 384 (App Store Defense)
- Suppresses review prompts during crises
- Provides reply macros for store reviews
- Monitors store rating trends

### PACK 386 (Marketing Automation)
- Freezes campaigns during crises
- Locks influencer payouts for high risk
- Pauses influencer campaigns

---

## 🚀 DEPLOYMENT GUIDE

### 1. Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
```

### 2. Deploy Firestore Indexes
```bash
firebase deploy --only firestore:indexes
```

### 3. Deploy Cloud Functions
```bash
cd functions
npm install
firebase deploy --only functions:pack387_ingestReputationSignal,functions:pack387_createIncident,functions:pack387_updateIncidentStatus,functions:pack387_closeIncidentWithReport,functions:pack387_crisisResponseOrchestrator,functions:pack387_preparePublicStatement,functions:pack387_legalApproveStatement,functions:pack387_executiveApproveStatement,functions:pack387_releasePublicStatement,functions:pack387_storeCrisisShield,functions:pack387_influencerReputationRisk,functions:pack387_analyzeReputationTrends,functions:pack387_detectCoordinatedAttack,functions:pack387_analyzeRatingTrends,functions:pack387_updateAllInfluencerRisks
```

### 4. Configure External Signal Sources
Set up webhooks/APIs to ingest signals from:
- App Store Connect API
- Google Play Developer API
- X (Twitter) API
- TikTok API
- Reddit API
- Google Alerts
- News monitoring services

### 5. Configure Role Permissions
Update user roles in Firestore:
```typescript
await db.collection('users').doc(userId).update({
  role: 'legal' | 'executive' | 'admin' | 'support' | 'moderator'
});
```

---

## 🧪 TESTING

### Test Reputation Signal Ingestion
```typescript
const result = await functions.httpsCallable('pack387_ingestReputationSignal')({
  source: 'X',
  sentimentScore: -0.8,
  topic: 'safety',
  geo: 'US',
  content: 'Test negative signal',
});
```

### Test Crisis Orchestration
```typescript
// Create CRITICAL incident (triggers auto-orchestration)
const incident = await functions.httpsCallable('pack387_createIncident')({
  title: 'Test Crisis',
  description: 'Testing crisis orchestration',
  status: 'OPEN',
  threatLevel: 'CRITICAL',
  publicVisibility: 'HIGH',
  legalExposure: true,
  geo: 'US',
});
```

### Test Statement Workflow
```typescript
// 1. Draft statement
const statement = await functions.httpsCallable('pack387_preparePublicStatement')({
  incidentId: 'test-incident-id',
  platform: 'X',
  title: 'Test Statement',
  content: 'We are investigating...',
});

// 2. Legal approval
await functions.httpsCallable('pack387_legalApproveStatement')({
  statementId: statement.data.statementId,
  approved: true,
  notes: 'Approved by legal',
});

// 3. Executive approval
await functions.httpsCallable('pack387_executiveApproveStatement')({
  statementId: statement.data.statementId,
  approved: true,
  notes: 'Approved by executive',
});

// 4. Publish
await functions.httpsCallable('pack387_releasePublicStatement')({
  statementId: statement.data.statementId,
});
```

---

## ✅ CTO FINAL VERDICT

PACK 387 ensures:

✅ **Early PR threat detection** - Catches problems before they go viral  
✅ **Instant executable crisis response** - Automated coordination across all systems  
✅ **Legal-safe public communication** - Multi-layer approval prevents mistakes  
✅ **Protection against coordinated attacks** - Detects bot campaigns and harassment  
✅ **Full system synchronization** - Support, fraud, marketing, & store defense aligned  

**This pack is mandatory before mass PR exposure and mainstream media coverage.**

---

## 📞 SUPPORT & ESCALATION

**Critical Issues**: Execute [`pack387_crisisResponseOrchestrator`](functions/src/pack387-crisis-orchestration.ts:29)  
**Legal Questions**: Contact legal team (auto-notified for HIGH/CRITICAL incidents)  
**Executive Decisions**: Escalate to executive team (auto-notified for CRITICAL)

---

**Deployment Date**: 2025-12-30  
**Version**: 1.0.0  
**Status**: ✅ PRODUCTION READY
