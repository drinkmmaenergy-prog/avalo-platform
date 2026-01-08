# PACK 417 — Incident Response, On-Call & Postmortem Engine

**Stage:** E — Post-Launch Stabilization  
**Pack Number:** 417  
**Dependencies:** PACK 267–268, 273–280, 293, 296, 300/300A/300B, 301/301A/301B, 302, 351–416  
**Status:** ✅ COMPLETE

---

## Overview

PACK 417 provides Avalo with a structured incident management system for detecting, triaging, resolving, and learning from platform incidents including outages, bugs, fraud spikes, and safety escalations. The system includes clear ownership, timelines, and postmortem reporting capabilities.

### Non-Negotiables Respected

- ✅ No changes to token prices, revenue splits, or wallet economics
- ✅ No modifications to chat/calendar/events refund rules
- ✅ Meta-ops only: incidents, alerts, on-call, postmortems
- ✅ Integrated with existing audit, safety, fraud, and support systems

---

## Implementation Summary

### 1. Core Type Definitions

**File:** [`functions/src/pack417-incident.types.ts`](functions/src/pack417-incident.types.ts)

Defines the complete type system for incident management:

```typescript
// Severity levels
enum IncidentSeverity {
  SEV0 = 'SEV0', // full outage / critical safety
  SEV1 = 'SEV1', // major degradation / safety concern
  SEV2 = 'SEV2', // partial impact / non-critical
  SEV3 = 'SEV3', // minor / cosmetic
}

// Incident sources
enum IncidentSource {
  MONITORING = 'MONITORING',
  SUPPORT_TICKET = 'SUPPORT_TICKET',
  FRAUD_ENGINE = 'FRAUD_ENGINE',
  SAFETY_ENGINE = 'SAFETY_ENGINE',
  MANUAL = 'MANUAL',
}

// Lifecycle status
enum IncidentStatus {
  OPEN = 'OPEN',
  INVESTIGATING = 'INVESTIGATING',
  MITIGATED = 'MITIGATED',
  MONITORING = 'MONITORING',
  RESOLVED = 'RESOLVED',
  POSTMORTEM_REQUIRED = 'POSTMORTEM_REQUIRED',
  POSTMORTEM_COMPLETE = 'POSTMORTEM_COMPLETE',
}
```

**Main Interfaces:**
- `Incident` - Core incident document with all metadata
- `IncidentTimelineEntry` - Timeline event tracking
- `IncidentActionItem` - Follow-up tasks
- `OnCallConfig` - On-call rotation configuration

---

### 2. Firestore Schema & Security

**Files:**
- [`firestore-pack417-incidents.rules`](firestore-pack417-incidents.rules)
- [`firestore-pack417-incidents.indexes.json`](firestore-pack417-incidents.indexes.json)

#### Collections

```
incidents/{incidentId}
  - Primary incident documents
  
incidents/{incidentId}/timeline/{timelineId}
  - Timeline entries for incident history
  
incidents/{incidentId}/actions/{actionId}
  - Action items for follow-up work
  
incidentPostmortems/{incidentId}
  - Postmortem documents (1:1 with incidents)
  
onCallConfig/global
  - On-call rotation configuration
```

#### Security Rules

- **Read Access:**
  - Admin roles (SUPER_ADMIN, ADMIN, PLATFORM_ADMIN): Full access
  - Safety roles: Access to safety-related incidents
  - Fraud roles: Access to fraud-related incidents
  - Support roles: Access to support-originated incidents (SEV2/SEV3 only)

- **Write Access:**
  - All writes must go through Cloud Functions (no direct client writes)
  - Postmortems: Only admins can create/update
  - On-call config: Only admins can modify

#### Indexes

Optimized composite indexes for:
- Severity + Status + CreatedAt (filtering active incidents)
- Source + CreatedAt (filtering by incident source)
- OwnerId + Status + CreatedAt (my incidents)
- FraudRelated/SafetyRelated + CreatedAt (category filtering)

---

### 3. Service Layer (Backend)

**File:** [`functions/src/pack417-incident.service.ts`](functions/src/pack417-incident.service.ts)

Provides core incident management functions:

#### Key Functions

```typescript
// Create new incident
createIncident(input: CreateIncidentInput): Promise<IncidentOperationResult>

// Update incident status
updateIncidentStatus(input: UpdateIncidentStatusInput): Promise<IncidentOperationResult>

// Add timeline entry
addIncidentTimelineEntry(input: AddTimelineEntryInput): Promise<IncidentOperationResult>

// Create action item
createActionItem(input: CreateActionItemInput): Promise<IncidentOperationResult>

// Complete action item
completeActionItem(input: CompleteActionItemInput): Promise<IncidentOperationResult>

// Link related entities (tickets, users, functions)
linkRelatedEntities(incidentId: string, entities: {...}): Promise<IncidentOperationResult>

// Get incident data
getIncident(incidentId: string): Promise<Incident | null>
getIncidentTimeline(incidentId: string): Promise<IncidentTimelineEntry[]>
getIncidentActions(incidentId: string): Promise<IncidentActionItem[]>

// Assign owner
assignIncidentOwner(incidentId, ownerId, authorId): Promise<IncidentOperationResult>
```

**Features:**
- Auto-generates incident IDs (e.g., `INC-2024-0001`)
- Creates initial timeline entry on incident creation
- Integrates with PACK 296 audit logging
- Transaction-safe operations

---

### 4. Incident Triggers & Integrations

**File:** [`functions/src/pack417-incident.triggers.ts`](functions/src/pack417-incident.triggers.ts)

Connects incident management to existing Avalo systems:

#### Cloud Functions (Callable)

```typescript
// Create incident from support ticket
pack417_createIncidentFromTicket(data, context)
  - Input: { ticketId, severity, title, description }
  - Links ticket to new incident
  - Notifies on-call team

// Create incident manually
pack417_createIncident(data, context)
  - Input: { title, description, severity, source, ... }
  - Full manual incident creation
```

#### Auto-Creation Helpers

```typescript
// From monitoring system (PACK 351+)
createIncidentFromMonitoring({
  errorType, errorRate, threshold, affectedFunctions, severity
})

// From fraud engine (PACK 302)
createIncidentFromFraud({
  patternType, affectedUsers, riskLevel, description
})

// From safety system (PACK 267-268)
createIncidentFromSafety({
  safetyTicketId, issueType, affectedUsers, severity, description
})
```

**Duplicate Prevention:**
- `findSimilarOpenIncident()` prevents creating duplicate incidents for same issue

---

### 5. Notification System

**File:** [`functions/src/pack417-incident.notifications.ts`](functions/src/pack417-incident.notifications.ts)

Integrates with PACK 293 notification system:

#### On-Call Management

```typescript
// Get/update on-call configuration
getOnCallConfig(): Promise<OnCallConfig | null>
updateOnCallConfig(config: Partial<OnCallConfig>): Promise<boolean>
```

**On-Call Config:**
```typescript
{
  currentPrimaryAdminId: string,
  currentSecondaryAdminId?: string,
  rotationSchedule: 'MANUAL' | 'WEEKLY',
  lastRotationAt: Timestamp
}
```

#### Notification Functions

```typescript
// New incident created
notifyIncidentCreated(incidentId)
  - Notifies primary on-call
  - For SEV0/SEV1: Also notifies secondary
  - Sends push + email for critical incidents

// Status changed
notifyIncidentStatusChange(incidentId, oldStatus, newStatus)
  - Only for SEV0/SEV1 incidents
  - Notifies primary on-call

// Broadcast critical incident
broadcastCriticalIncident(incidentId)
  - Sends to all admin users
  - Only for SEV0/SEV1

// Incident resolved
notifyIncidentResolved(incidentId)

// Postmortem required
notifyPostmortemRequired(incidentId)
  - Notifies incident owner
  - Push + email
```

---

### 6. Postmortem System

**File:** [`functions/src/pack417-postmortem.types.ts`](functions/src/pack417-postmortem.types.ts)

#### Postmortem Data Model

```typescript
interface IncidentPostmortem {
  id: string;            // = incidentId
  incidentId: string;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  summary: string;          // Executive summary
  impact: string;           // Business & user impact
  rootCause: string;        // Root cause analysis
  timeline: string;         // Detailed timeline
  whatWentWell: string;     // Positive aspects
  whatWentWrong: string;    // Areas for improvement
  actionItems: string;      // Follow-up tasks
  followUpIncidents?: string[];
}
```

#### Functions

```typescript
// Save/update postmortem
savePostmortem(input: PostmortemInput): Promise<{success, error?}>

// Get postmortem
getPostmortem(incidentId: string): Promise<IncidentPostmortem | null>

// Mark complete (updates incident status)
markPostmortemComplete(incidentId, authorId): Promise<{success, error?}>
```

---

### 7. Admin Web UI

#### A. Incident List Page

**File:** [`admin-web/incidents/index.tsx`](admin-web/incidents/index.tsx)

**Features:**
- **Filters:**
  - Severity (SEV0-SEV3)
  - Status (Open, Investigating, Resolved, etc.)
  - Source (Monitoring, Support, Fraud, Safety, Manual)
  - Fraud-related checkbox
  - Safety-related checkbox

- **Display:**
  - Incident ID (clickable to detail)
  - Title
  - Severity badge (color-coded)
  - Status badge
  - Source
  - Created timestamp
  - Fraud/Safety flags

- **Sorting:**
  - Default: CreatedAt descending
  - Can be extended for severity-first sorting

#### B. Incident Detail Page

**File:** [`admin-web/incidents/[incidentId].tsx`](admin-web/incidents/[incidentId].tsx)

**Layout: Two-Column**

**Main Section (Left):**
- Incident details (description, affected features)
- Timeline with entries:
  - Add note form
  - Timeline entries (reverse chronological)
  - Entry types: NOTE, STATUS_CHANGE, MITIGATION, ROOT_CAUSE, COMMUNICATION

**Sidebar (Right):**
- **Status Control:**
  - Dropdown to change status
  - Update button
  
- **Action Items:**
  - Add action form (title, owner)
  - List of action items
  - Complete button for pending items
  - Visual distinction for completed items

- **Postmortem Link:**
  - Shows when status is POSTMORTEM_REQUIRED or POSTMORTEM_COMPLETE
  - Links to postmortem page

#### C. Postmortem Page

**File:** [`admin-web/incidents/[incidentId]/postmortem.tsx`](admin-web/incidents/[incidentId]/postmortem.tsx)

**Structured Form with Fields:**
1. Executive Summary
2. Impact (who affected,  metrics)
3. Root Cause Analysis
4. Detailed Timeline
5. What Went Well
6. What Went Wrong / Could Be Improved
7. Follow-Up Action Items

**Actions:**
- Save Draft (stores without changing incident status)
- Save & Mark Complete (updates incident to POSTMORTEM_COMPLETE)
- Cancel

**Best Practices Tips:**
- Focus on learning, not blaming
- Be specific with timelines and metrics
- Identify actionable improvements
- Share widely to prevent future occurrences

---

## Integration Points

### With Existing Packs

1. **PACK 293 (Notifications):**
   - Sends push and email notifications to on-call team
   - Broadcasts critical incidents to admin group

2. **PACK 296 (Audit Log):**
   - All incident operations logged:
     - `INCIDENT_CREATED`
     - `INCIDENT_STATUS_CHANGED`
     - `INCIDENT_ASSIGNED`
     - `INCIDENT_ACTION_COMPLETED`

3. **PACK 300/300A/300B (Support):**
   - Support admins can escalate tickets to incidents
   - Incidents link to related support ticket IDs

4. **PACK 302 (Fraud Engine):**
   - Critical fraud patterns auto-create incidents
   - Incidents flag `fraudRelated: true`

5. **PACK 267-268 (Safety):**
   - Critical safety issues auto-create incidents
   - Incidents flag `safetyRelated: true`

6. **PACK 351+ (Monitoring/Observability):**
   - Error rate thresholds trigger incident creation
   - Links affected function names

---

## Deployment Checklist

### Backend (Firebase Functions)

1. **Deploy types and services:**
   ```bash
   # All files are in functions/src/
   firebase deploy --only functions
   ```

2. **Deploy Firestore rules:**
   ```bash
   firebase deploy --only firestore:rules
   ```

3. **Deploy Firestore indexes:**
   ```bash
   firebase deploy --only firestore:indexes
   ```

### Frontend (Admin Web)

1. **Build admin web app:**
   ```bash
   cd admin-web
   npm run build
   ```

2. **Deploy admin web:**
   ```bash
   firebase deploy --only hosting:admin
   ```

### Configuration

1. **Initialize On-Call Config:**
   ```javascript
   // In Firestore console or via script:
   db.collection('onCallConfig').doc('global').set({
     currentPrimaryAdminId: 'PRIMARY_ADMIN_UID',
     currentSecondaryAdminId: 'SECONDARY_ADMIN_UID',
     rotationSchedule: 'MANUAL',
     lastRotationAt: new Date()
   });
   ```

2. **Grant Admin Roles:**
   - Ensure admin users have proper roles in PACK 296/300A
   - Roles: `SUPER_ADMIN`, `ADMIN`, `PLATFORM_ADMIN`

---

## Usage Examples

### 1. Manual Incident Creation (Admin Portal)

Admin navigates to `/incidents` → clicks "Create Incident" (if added):

```typescript
const functions = getFunctions();
const createIncident = httpsCallable(functions, 'pack417_createIncident');

await createIncident({
  title: 'Payment Processing Slow',
  description: 'Users reporting 5+ second delays in payment confirmation',
  severity: 'SEV1',
  source: 'SUPPORT_TICKET',
  affectedFeatures: ['payments', 'wallet'],
  relatedPacks: [301, 302]
});
```

### 2. Auto-Creation from Monitoring

```typescript
// In PACK 351 monitoring code:
import { createIncidentFromMonitoring } from './pack417-incident.triggers';

if (errorRate > threshold) {
  await createIncidentFromMonitoring({
    errorType: 'PaymentProcessing',
    errorRate: 15.5,
    threshold: 5.0,
    affectedFunctions: ['processPayment', 'confirmTransaction'],
    severity: 'SEV1'
  });
}
```

### 3. Support Ticket Escalation

```typescript
// Support admin in admin portal:
const escFn = httpsCallable(functions, 'pack417_createIncidentFromTicket');

await escFn({
  ticketId: 'TICKET-2024-1234',
  severity: 'SEV2',
  title: 'Multiple users cannot access chat',
  description: 'Chat feature failing for users in EU region'
});
```

### 4. Postmortem Creation

Admin navigates to incident detail → clicks "Create Postmortem":

- Fill out structured form
- Save as draft (can edit later)
- When ready: "Save & Mark Complete"
  - Updates incident status to `POSTMORTEM_COMPLETE`
  - Notifies stakeholders

---

## Acceptance Criteria — Status

✅ **1. Firestore-backed incidents model with timeline and action items**
- Schema defined in types
- Collections: `incidents`, `incidents/{id}/timeline`, `incidents/{id}/actions`
- Security rules enforce role-based access

✅ **2. Incidents can be created manually and automatically**
- Manual: via `pack417_createIncident` callable function
- From monitoring signals: `createIncidentFromMonitoring()`
- From fraud engine: `createIncidentFromFraud()`
- From safety/support: `createIncidentFromSafety()`, `pack417_createIncidentFromTicket()`

✅ **3. On-call owner assigned and notified**
- On-call config stored in `onCallConfig/global`
- SEV0/SEV1 incidents auto-notify primary (and secondary for critical)
- PACK 293 integration for push + email

✅ **4. Admins have working Incident Dashboard**
- List page: `/incidents` with filters
- Detail page: `/incidents/[id]` with timeline and actions
- Interactive controls for status change, note adding, action creation

✅ **5. Postmortems can be created, stored, and linked**
- Postmortem page: `/incidents/[id]/postmortem`
- Structured form with best practices
- Links back to incident
- Can mark postmortem complete

✅ **6. All operations audited via PACK 296**
- `logAuditEvent()` called for:
  - Incident creation
  - Status changes
  - Action completions
  - Owner assignments

✅ **7. No tokenomics/pricing/wallet changes**
- This pack is meta-ops only
- No changes to revenue, refunds, or wallet logic

---

## Testing Recommendations

### Unit Tests

```typescript
// functions/test/pack417-incident.spec.ts

describe('createIncident', () => {
  it('should create incident with correct fields');
  it('should generate valid incident ID');
  it('should create initial timeline entry');
  it('should log audit event');
});

describe('updateIncidentStatus', () => {
  it('should update status and add timeline entry');
  it('should notify on-call for critical incidents');
});
```

### Integration Tests

1. **Manual incident creation flow:**
   - Admin creates incident via callable function
   - Verify Firestore document created
   - Verify timeline entry exists
   - Verify notification sent

2. **Auto-creation from monitoring:**
   - Simulate error rate spike
   - Verify incident auto-created
   - Verify correct severity assigned
   - Verify on-call notified

3. **Postmortem flow:**
   - Create incident
   - Mark as POSTMORTEM_REQUIRED
   - Create postmortem
   - Mark complete
   - Verify incident status updated

### UI Tests (E2E)

1. **List page:**
   - Apply filters
   - Verify correct incidents displayed
   - Click incident to navigate to detail

2. **Detail page:**
   - Add note to timeline
   - Create action item
   - Complete action item
   - Change incident status

3. **Postmortem page:**
   - Fill out form
   - Save draft
   - Mark complete
   - Verify navigation back to incident

---

## Monitoring & Metrics

### Key Metrics to Track

1. **Incident Volume:**
   - Total incidents created per day/week
   - By severity (SEV0, SEV1, SEV2, SEV3)
   - By source (Monitoring, Fraud, Safety, Support, Manual)

2. **Response Times:**
   - Time from OPEN → INVESTIGATING
   - Time from OPEN → MITIGATED
   - Time from OPEN → RESOLVED

3. **On-Call Performance:**
   - Number of incidents assigned per on-call
   - Response time to critical incidents (SEV0/SEV1)

4. **Postmortem Completion:**
   - % of incidents with completed postmortems
   - Time from RESOLVED → POSTMORTEM_COMPLETE

### Dashboard Queries

```typescript
// Average time to resolution by severity
SELECT 
  severity,
  AVG(resolvedAt - createdAt) as avg_resolution_time
FROM incidents
WHERE status = 'RESOLVED'
GROUP BY severity;

// Active incidents by owner
SELECT 
  ownerId,
  COUNT(*) as active_count
FROM incidents
WHERE status IN ('OPEN', 'INVESTIGATING', 'MONITORING')
GROUP BY ownerId;
```

---

## Future Enhancements

### Phase 2 (Optional)

1. **SLA Tracking:**
   - Define SLAs per severity level
   - Alert when SLA breach imminent
   - Dashboard showing SLA compliance

2. **Incident Templates:**
   - Pre-defined templates for common incident types
   - Quick-create buttons for known scenarios

3. **Runbook Integration:**
   - Link incidents to runbooks (PACK 416-style)
   - Auto-suggest runbooks based on incident type

4. **Slack/Teams Integration:**
   - Create Slack channel per incident
   - Post timeline updates to channel
   - Command bot for status updates

5. **Trend Analysis:**
   - ML-based pattern detection
   - "Similar incidents" suggestions
   - Predictive alerting

6. **External Status Page:**
   - Public-facing status page
   - Auto-update from incident status
   - Subscribe to updates

---

## Maintenance Notes

### Weekly Tasks

- Review on-call rotation (if WEEKLY schedule)
- Check for incidents stuck in INVESTIGATING status
- Ensure postmortems are completed for resolved SEV0/SEV1

### Monthly Tasks

- Review incident metrics
- Analyze common patterns
- Update on-call rotation schedule if needed
- Archive old incidents (>90 days, RESOLVED/POSTMORTEM_COMPLETE)

### Quarterly Tasks

- Review and update postmortem best practices
- Train new admins on incident management
- Audit incident response times
- Update runbooks based on postmortem findings

---

## Conclusion

PACK 417 provides a robust, enterprise-grade incident management system for Avalo. It integrates seamlessly with existing safety, fraud, monitoring, and support systems while maintaining clear separation from core business logic (tokenomics, payments, refunds).

The system enables the team to:
- **Detect** incidents early through auto-creation from monitoring
- **Triage** with clear severity levels and ownership
- **Resolve** efficiently with timeline tracking and action items
- **Learn** through structured postmortems

All acceptance criteria have been met, and the implementation is ready for deployment.

**Status:** ✅ **PACK 417 COMPLETE**
