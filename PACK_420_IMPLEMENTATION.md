# PACK 420 — Data Rights, Account Lifecycle & GDPR/DSR Engine
## Implementation Complete

**Stage:** E — Post-Launch Stabilization & Compliance  
**Status:** ✅ Core Implementation Complete  
**Date:** 2025-12-31

---

## Overview

PACK 420 implements a comprehensive engine for managing user data rights (export, deletion, restriction) and account lifecycle states to meet GDPR/DSR and similar privacy regulations. The implementation provides:

- Account lifecycle management (ACTIVE, SOFT_FROZEN, PENDING_DELETION, DELETED)
- Data rights request processing (EXPORT, DELETE, RESTRICT_PROCESSING)
- User-facing flows for requesting data rights
- Admin console for processing requests
- Integration with safety, enforcement, and audit systems

---

## ✅ Completed Components

### 1. Type Definitions

**File:** [`shared/types/pack420-data-rights.types.ts`](shared/types/pack420-data-rights.types.ts)

Comprehensive TypeScript types including:
- `AccountLifecycleState` enum (ACTIVE, SOFT_FROZEN, PENDING_DELETION, DELETED)
- `DataRequestType` enum (EXPORT, DELETE, RESTRICT_PROCESSING)
- `DataRequestStatus` enum (PENDING, IN_PROGRESS, COMPLETED, REJECTED)
- `DataRightsRequest` interface with all required fields
- `AccountLifecycleFields` for user profile extension
- `GatedFeature` type for access control
- Error classes and result types

### 2. Firestore Infrastructure

**Files:**
- [`firestore-pack420-data-rights.rules`](firestore-pack420-data-rights.rules)
- [`firestore-pack420-data-rights.indexes.json`](firestore-pack420-data-rights.indexes.json)

**Security Rules:**
- Users can read only their own requests
- Users can create requests for themselves only
- Users can cancel their own PENDING deletion requests
- Admins have full access to all requests
- Protected admin-only fields (adminNotes, processedByAdminId, etc.)

**Indexes:**
- `userId + createdAt` (user's request history)
- `type + status + createdAt` (admin filtering)
- `status + scheduledDeletionAt` (deletion job queries)
- Multiple composite indexes for efficient queries

### 3. Backend Services

#### Data Rights Service

**File:** [`functions/src/pack420-data-rights.service.ts`](functions/src/pack420-data-rights.service.ts)

**Core Functions:**
- `createDataRightsRequest()` - Create new EXPORT/DELETE/RESTRICT_PROCESSING request
  - Validates user exists and not deleted
  - Enforces one active DELETE request per user
  - Rate limits EXPORT requests (max 2 per 7 days)
  - Logs audit events
  
- `startProcessingRequest()` - Admin starts processing a PENDING request
  - Updates status to IN_PROGRESS
  - Assigns admin ID
  - Logs status change

- `completeExportRequest()` - Finalize EXPORT with download URL
  - Sets status to COMPLETED
  - Provides signed URL (7-day expiry)
  - Triggers notification to user

- `scheduleDeleteRequest()` - Schedule DELETE with cooling-off period
  - Sets 30-day cooling-off by default
  - Updates user lifecycleState to PENDING_DELETION
  - Logs action

- `rejectRequest()` - Reject/cancel a request
  - Sets status to REJECTED
  - Restores user to ACTIVE if was PENDING_DELETION
  - Records rejection reason

- `cancelDeleteRequest()` - User cancels their own deletion (during cooling-off)
  - Validates user ownership
  - Restores to ACTIVE lifecycle state
  - Logs cancellation

- `runDeletionJob()` - Scheduled daily job for executing deletions
  - Finds requests past scheduledDeletionAt
  - Executes deletion via adapter
  - Updates user to DELETED lifecycle state
  - Returns batch result with success/failure counts

**Configuration:**
- Export rate limit: 2 requests per 7 days
- Deletion cooling-off: 30 days
- Export URL expiry: 7 days
- Deletion cancellation: Enabled

#### Data Export Adapter Contract

**File:** [`functions/src/pack420-data-export.adapter.ts`](functions/src/pack420-data-export.adapter.ts)

**Status:** Contract defined, full implementation pending

**Contract:** `generateUserDataExport(userId: string): Promise<DataExportResult>`

**Implementation Checklist:**
1. Query all relevant collections:
   - User profile, verification, preferences
   - Matches, swipes (sanitized)
   - Message metadata (NO content of others)
   - Payments, transactions, earnings
   - Bookings, meetings, events
   - AI companions (owned by user)
   - Notifications, devices, sessions
   - Support tickets
   - Audit logs (user-related)

2. Sanitize data:
   - Remove other users' PII
   - Replace names with "User_[ID]"
   - Remove photos/avatars of others
   - Keep only message counts/timestamps, not content

3. Structure as JSON files:
   - profile.json
   - matches.json
   - messages-summary.json
   - payments.json
   - bookings.json
   - ai-companions.json
   - notifications.json
   - devices.json
   - support.json
   - audit-log.json

4. Package as ZIP archive

5. Upload to Firebase Storage:
   - Path: `data-exports/{userId}/{timestamp}.zip`
   - Lifecycle: Auto-delete after 30 days

6. Return signed download URL

#### Data Deletion Adapter Contract

**File:** [`functions/src/pack420-data-deletion.adapter.ts`](functions/src/pack420-data-deletion.adapter.ts)

**Status:** Contract defined, full implementation pending

**Contract:** `performUserDataDeletion(userId: string): Promise<void>`

**Implementation Phases:**

**PHASE 1: IMMEDIATE DISCONNECTION**
1. Set lifecycleState to DELETED
2. Revoke all active sessions/tokens
3. Remove from discovery/matching pools
4. Disable all notifications

**PHASE 2: PERSONAL DATA REMOVAL**
5. Clear profile: name, email, phone, bio, photos, interests, location
6. Remove device IDs, push tokens
7. Delete verification images (keep status boolean)
8. Delete Firebase Auth user
9. Remove from emailToUid/phoneToUid mappings

**PHASE 3: RELATIONAL DATA HANDLING**
10. Messages:
    - Option A: Delete entirely if both parties deleted
    - Option B: Anonymize to "Deleted User"
11. Matches: Mark user as deleted, notify partners
12. Swipes: Delete history, remove from queues

**PHASE 4: MONETIZATION & TRANSACTIONS**
13. Zero out spendable balances
14. Cancel pending withdrawals
15. Cancel Stripe subscriptions
16. **KEEP** transaction records (legal requirement)
17. Anonymize payment methods (keep last 4 digits)

**PHASE 5: CONTENT & INTERACTIONS**
18. AI Companions: Delete or transfer to system
19. Bookings: Cancel future, anonymize past
20. Posts/Content: Delete or anonymize

**PHASE 6: SUPPORT & SAFETY**
21. Support tickets: Anonymize author
22. Abuse reports: **KEEP** reports against user (safety requirement)

**PHASE 7: CLEANUP & AUDIT**
23. Delete notification preferences
24. Unregister FCM tokens
25. Create deletion audit record (pseudonymized)
26. Update all indexes

**Legal Exceptions (DO NOT DELETE):**
- Tax/financial records (legal retention requirements)
- Fraud prevention logs
- Safety/abuse reports
- Legal claims/disputes data
- Minimal pseudonymized audit trail

### 4. Account Lifecycle Guard

**File:** [`functions/src/pack420-account-lifecycle.guard.ts`](functions/src/pack420-account-lifecycle.guard.ts)

**Purpose:** Gate features based on account lifecycle state

**Core Functions:**
- `checkUserCanUseFeature()` - Check if user can access feature
- `assertUserCanUseFeature()` - Throw error if access denied
- `getUserLifecycleState()` - Get current state
- `updateUserLifecycleState()` - Update state (admin/system only)
- `isUserRestricted()` - Check if user is non-ACTIVE
- `batchCheckFeatureAccess()` - Batch check for filtering lists
- `withLifecycleGuard()` - Express middleware wrapper

**Feature Access Matrix:**

| Feature | ACTIVE | SOFT_FROZEN | PENDING_DELETION | DELETED |
|---------|--------|-------------|------------------|---------|
| DISCOVERY | ✅ | ❌ | ❌ | ❌ |
| SWIPE | ✅ | ❌ | ❌ | ❌ |
| CHAT | ✅ | ❌ | ❌ | ❌ |
| CALLS | ✅ | ❌ | ❌ | ❌ |
| MEETINGS | ✅ | ❌ | ❌ | ❌ |
| EVENTS | ✅ | ❌ | ❌ | ❌ |
| EARN | ✅ | ❌ | ❌ | ❌ |
| WITHDRAW | ✅ | ❌ | ❌ | ❌ |
| POST | ✅ | ❌ | ❌ | ❌ |
| AI_COMPANIONS | ✅ | ❌ | ❌ | ❌ |

**Always Accessible:**
- VIEW_PROFILE (own profile)
- VIEW_WALLET (transaction history)
- VIEW_SUPPORT (help center)
- VIEW_ENFORCEMENT (appeals)
- VIEW_DATA_RIGHTS (request status)

**Integration Example:**
```typescript
// In API endpoint
import { assertUserCanUseFeature } from './pack420-account-lifecycle.guard';

async function sendMessage(userId: string, message: string) {
  // Guard check
  await assertUserCanUseFeature(userId, 'CHAT');
  
  // Also check PACK 419 enforcement restrictions
  // await assertUserNotRestricted(userId, 'CHAT');
  
  // Proceed with message sending...
}
```

### 5. Mobile UI (Partially Complete)

**File:** [`app-mobile/app/settings/data-rights/index.tsx`](app-mobile/app/settings/data-rights/index.tsx)

**Status:** Main screen implemented, detail screens pending

**Implemented:**
- List of user's data rights requests
- Action cards for creating new requests:
  - Request Data Export
  - Delete Account
  - Restrict Processing
- Request history with status badges
- GDPR information section

**Pending Implementation:**
- `app-mobile/app/settings/data-rights/create-export.tsx`
- `app-mobile/app/settings/data-rights/create-delete.tsx`
- `app-mobile/app/settings/data-rights/create-restrict.tsx`
- `app-mobile/app/settings/data-rights/[requestId].tsx`

**Detail Screen Requirements:**

**create-export.tsx:**
- Explanation of what's included in export
- Estimated time (3-5 days)
- Optional reason field
- Submit button → calls `createDataRightsRequest()`
- Show rate limit warning if exceeded

**create-delete.tsx:**
- Strong warning about irreversible action
- List of consequences:
  - All data will be deleted
  - 30-day cooling-off period
  - Can cancel during cooling-off
  - Tokens forfeited, no refunds
- Required reason field
- Confirmation checkbox
- Submit button → calls `createDataRightsRequest()`

**create-restrict.tsx:**
- Explanation of processing restriction
- What will be limited
- Optional reason field
- Submit button → calls `createDataRightsRequest()`

**[requestId].tsx:**
- Request details (type, status, dates)
- Status-specific content:
  - PENDING: "Review in progress"
  - IN_PROGRESS: Progress indicator
  - COMPLETED (EXPORT): Download button
  - COMPLETED (DELETE): Confirmation message
  - REJECTED: Rejection reason
- For DELETE IN_PROGRESS:
  - Countdown to deletion date
  - "Cancel Deletion" button (if policy allows)

**Lifecycle Banners:**

Add to main app screens (discovery, profile, chat, etc.):

```typescript
// Component: LifecycleBanner.tsx
import { useUserLifecycle } from '../hooks/useUserLifecycle';

export function LifecycleBanner() {
  const { lifecycleState, reason } = useUserLifecycle();
  
  if (lifecycleState === 'ACTIVE') return null;
  
  if (lifecycleState === 'SOFT_FROZEN') {
    return (
      <Banner variant="warning">
        Your account is temporarily restricted. {reason}
        <Link to="/settings/data-rights">Learn more</Link>
      </Banner>
    );
  }
  
  if (lifecycleState === 'PENDING_DELETION') {
    return (
      <Banner variant="error">
        Your account is scheduled for deletion.
        <Link to="/settings/data-rights">View details or cancel</Link>
      </Banner>
    );
  }
  
  return null;
}
```

---

## 📋 Remaining Implementation Tasks

### 1. Mobile UI Completion

**Priority:** HIGH

**Files to Create:**
1. `app-mobile/app/settings/data-rights/create-export.tsx`
2. `app-mobile/app/settings/data-rights/create-delete.tsx`
3. `app-mobile/app/settings/data-rights/create-restrict.tsx`
4. `app-mobile/app/settings/data-rights/[requestId].tsx`
5. `app-mobile/app/components/LifecycleBanner.tsx`
6. `app-mobile/hooks/useUserLifecycle.ts`

**Integration Points:**
- Add `<LifecycleBanner />` to main app screens
- Call backend service functions via Cloud Functions HTTP endpoints
- Handle errors (rate limits, duplicate requests, etc.)

### 2. Web UI

**Priority:** HIGH

**Files to Create:**
1. `app-web/app/settings/data-rights/page.tsx` (list)
2. `app-web/app/settings/data-rights/create-export/page.tsx`
3. `app-web/app/settings/data-rights/create-delete/page.tsx`
4. `app-web/app/settings/data-rights/create-restrict/page.tsx`
5. `app-web/app/settings/data-rights/[requestId]/page.tsx` (detail)
6. `app-web/components/LifecycleBanner.tsx`

**Design:** Responsive layout matching mobile UX

### 3. Admin Console

**Priority:** HIGH

**Files to Create:**
1. `admin-web/app/data-rights/page.tsx` (list with filters)
2. `admin-web/app/data-rights/[requestId]/page.tsx` (detail + actions)
3. `admin-web/components/DataRightsFilters.tsx`
4. `admin-web/components/DataRightsActions.tsx`

**Admin Capabilities:**
- Filter by:
  - Type (EXPORT, DELETE, RESTRICT_PROCESSING)
  - Status (PENDING, IN_PROGRESS, COMPLETED, REJECTED)
  - Date range
  - User ID search
- View full request details + user profile summary
- Actions:
  - START PROCESSING
  - COMPLETE EXPORT (upload URL)
  - SCHEDULE DELETE (set date)
  - REJECT (add reason)
- Audit trail of all actions

**Security:**
- Check admin role via PACK 300A
- Log all actions via PACK 296
- Require confirmation for SCHEDULE DELETE

### 4. Cloud Functions HTTP Endpoints

**Priority:** HIGH

**File to Create:** `functions/src/pack420-data-rights.functions.ts`

**Endpoints:**

```typescript
// User-facing endpoints
exports.createDataRightsRequest = onCall(async (data, context) => {
  const { type, reason } = data;
  const userId = context.auth.uid;
  return await createDataRightsRequest({ userId, type, reason });
});

exports.cancelDeleteRequest = onCall(async (data, context) => {
  const { requestId } = data;
  const userId = context.auth.uid;
  return await cancelDeleteRequest(requestId, userId);
});

exports.getUserDataRightsRequests = onCall(async (data, context) => {
  const userId = context.auth.uid;
  return await getUserDataRightsRequests(userId);
});

// Admin endpoints
exports.adminStartProcessing = onCall(async (data, context) => {
  // Check admin role
  const { requestId } = data;
  const adminId = context.auth.uid;
  return await startProcessingRequest(requestId, adminId);
});

exports.adminCompleteExport = onCall(async (data, context) => {
  // Check admin role
  const { requestId, exportDownloadUrl } = data;
  const adminId = context.auth.uid;
  return await completeExportRequest(requestId, exportDownloadUrl, adminId);
});

exports.adminScheduleDelete = onCall(async (data, context) => {
  // Check admin role
  const { requestId, scheduledDeletionAt } = data;
  const adminId = context.auth.uid;
  return await scheduleDeleteRequest(requestId, scheduledDeletionAt, adminId);
});

exports.adminRejectRequest = onCall(async (data, context) => {
  // Check admin role
  const { requestId, reason } = data;
  const adminId = context.auth.uid;
  return await rejectRequest(requestId, reason, adminId);
});

// Scheduled job (runs daily at 2 AM UTC)
exports.scheduledDeletionJob = onSchedule('0 2 * * *', async (event) => {
  const result = await runDeletionJob();
  console.log('Deletion job completed:', result);
  return result;
});

// Trigger for export generation (async processing)
exports.triggerExportGeneration = onCall(async (data, context) => {
  // Check admin role
  const { requestId } = data;
  return await triggerExportGeneration(requestId);
});
```

### 5. Data Export Implementation

**Priority:** MEDIUM (can be phased)

**File:** Implement `generateUserDataExport()` in [`functions/src/pack420-data-export.adapter.ts`](functions/src/pack420-data-export.adapter.ts)

**Libraries Needed:**
- `archiver` (ZIP generation)
- `@google-cloud/storage` (Cloud Storage)

**Steps:**
1. Query all collections (see contract checklist)
2. Transform/sanitize data
3. Generate JSON files
4. Create ZIP archive
5. Upload to Cloud Storage
6. Generate signed URL (7-day expiry)
7. Return `DataExportResult`

**Testing:** Test with sample user, verify:
- All data included
- Other users' PII removed
- ZIP structure correct
- Signed URL works
- File deleted after 30 days (lifecycle rule)

### 6. Data Deletion Implementation

**Priority:** MEDIUM (can be phased)

**File:** Implement `performUserDataDeletion()` in [`functions/src/pack420-data-deletion.adapter.ts`](functions/src/pack420-data-deletion.adapter.ts)

**Critical:** Execute phases in order, test **extensively** in staging

**Steps:** See contract (7 phases in adapter file)

**Testing Checklist:**
- User cannot log in after deletion
- Profile data fully cleared
- Messages anonymized properly
- Financial records preserved
- AI companions handled correctly
- No references in discovery/swipe queues
- Support tickets anonymized
- Abuse reports preserved (safety)
- Audit log created

### 7. Integration with Existing Packs

#### PACK 296 (Audit Logs)

**Status:** Placeholder implemented, needs real integration

Replace all `logAuditEvent()` placeholders with actual PACK 296 calls:
- DATA_REQUEST_CREATED
- DATA_REQUEST_STATUS_CHANGED
- DATA_DELETION_COMPLETED
- DATA_DELETION_FAILED
- DATA_DELETION_BATCH
- LIFECYCLE_STATE_CHANGED

#### PACK 293 (Notifications)

**Status:** TODO comments added

Implement notifications:
- Request created confirmation
- Export ready (with deep-link to download)
- Deletion scheduled (with cooling-off reminder)
- 7 days before deletion (final warning)
- Deletion completed
- Request rejected

#### PACK 419 (Enforcement)

**Status:** Integration hook exists, needs implementation

In `assertUserCanUseFeature()`, after lifecycle check passes:
```typescript
// Also check enforcement restrictions from PACK 419
await checkEnforcementRestrictions(userId, feature);
```

This ensures double-layer protection:
1. Lifecycle state (PACK 420)
2. Enforcement restrictions (PACK 419)

#### PACK 300/300A (Support & Help Center)

**Integration Points:**
1. Link support tickets to `DataRightsRequest` via `dataRightsRequestId` field
2. Add "Data Rights" category to support tickets
3. In support agent console, show link to data rights admin panel
4. Quick actions: "View user's data rights requests"

### 8. Feature Entrypoint Integration

**Priority:** HIGH

Add lifecycle guards to all major feature entrypoints:

```typescript
// Example: Chat message sending
import { assertUserCanUseFeature } from './pack420-account-lifecycle.guard';

exports.sendChatMessage = onCall(async (data, context) => {
  const userId = context.auth.uid;
  
  // Guard: Check lifecycle state
  await assertUserCanUseFeature(userId, 'CHAT');
  
  // Continue with message sending...
});
```

**Features to Guard:**
- Discovery/swiping (DISCOVERY, SWIPE)
- Chat (CHAT)
- Calls (CALLS)
- Meetings (MEETINGS)
- Events booking (EVENTS)
- Token earning (EARN)
- Withdrawals (WITHDRAW)
- Content posting (POST)
- AI companions (AI_COMPANIONS)

### 9. Deployment & Configuration

**Firestore Rules Deployment:**
```bash
# Deploy data rights rules
firebase deploy --only firestore:rules

# Deploy indexes
firebase deploy --only firestore:indexes
```

**Cloud Functions Deployment:**
```bash
# Deploy all functions
firebase deploy --only functions

# Or specific functions
firebase deploy --only functions:createDataRightsRequest,functions:scheduledDeletionJob
```

**Environment Variables:**
```bash
# Set in Firebase Functions config
firebase functions:config:set \
  pack420.export_rate_limit_days=7 \
  pack420.deletion_cooling_off_days=30 \
  pack420.export_url_expiry_days=7 \
  pack420.allow_deletion_cancellation=true
```

### 10. Testing Checklist

**Unit Tests:**
- [ ] `createDataRightsRequest()` validates user exists
- [ ] `createDataRightsRequest()` enforces one DELETE per user
- [ ] `createDataRightsRequest()` enforces EXPORT rate limit
- [ ] `cancelDeleteRequest()` only allows user's own requests
- [ ] `runDeletionJob()` only processes past scheduledDeletionAt
- [ ] Lifecycle guard blocks SOFT_FROZEN from CHAT
- [ ] Lifecycle guard blocks PENDING_DELETION from EARN
- [ ] Lifecycle guard blocks DELETED from everything

**Integration Tests:**
- [ ] User creates EXPORT request → appears in Firestore
- [ ] Admin processes EXPORT → user receives download URL
- [ ] User creates DELETE → lifecycle becomes PENDING_DELETION
- [ ] User cancels DELETE → lifecycle returns to ACTIVE
- [ ] Scheduled job executes deletion after cooling-off
- [ ] DELETED user cannot log in
- [ ] SOFT_FROZEN user sees banner, cannot swipe

**E2E Tests:**
- [ ] Complete EXPORT flow (mobile → admin → download)
- [ ] Complete DELETE flow (mobile → cooling-off → cancel)
- [ ] Complete DELETE flow (mobile → cooling-off → execute → verify deleted)
- [ ] Admin filters work correctly
- [ ] Lifecycle banners display correctly

**Security Tests:**
- [ ] User cannot read other users' requests
- [ ] User cannot modify processedByAdminId
- [ ] User cannot set status to COMPLETED directly
- [ ] Non-admin cannot access admin endpoints
- [ ] Firestore rules block unauthorized access

---

## 🎯 Acceptance Criteria (Per PACK 420 Spec)

PACK 420 is considered **done** when:

- [x] `dataRightsRequests` model and rules are live and secure
- [x] Backend service functions are implemented
- [x] Account lifecycle guard is implemented
- [ ] Users can:
  - [x] Request export / deletion / restriction (service ready)
  - [ ] See status of all their requests (UI in progress)
  - [ ] Download export when ready (pending full implementation)
  - [ ] See clear lifecycle banners when frozen/pending deletion (pending UI)
- [ ] Admins can:
  - [ ] Process all three types of requests end-to-end (pending admin UI)
  - [ ] Schedule deletion with cool-down (service ready, UI pending)
  - [ ] Reject with explanation (service ready, UI pending)
  - [ ] See full audit trail (pending PACK 296 integration)
- [ ] All feature entrypoints respect `AccountLifecycleState` via `assertUserCanUseFeature()` (pending integration)
- [ ] No tokenomics changed ✅
- [ ] Financial and legal data retention preserved ✅ (documented in deletion contract)

**Current Status:** ~60% complete
- Core backend services: ✅ 100%
- Firestore infrastructure: ✅ 100%
- Lifecycle guard: ✅ 100%
- Mobile UI: ⏳ 20% (main screen only)
- Web UI: ⏳ 0%
- Admin UI: ⏳ 0%
- Cloud Functions HTTP endpoints: ⏳ 0%
- Data export implementation: ⏳ 0% (contract defined)
- Data deletion implementation: ⏳ 0% (contract defined)
- Integration with other packs: ⏳ 30%

---

## 📝 Notes & Best Practices

### Legal Compliance

1. **GDPR Article 17 (Right to Erasure):**
   - Implement within 30 days of request
   - Exceptions apply: legal obligations, legal claims, public interest
   - Document why certain data is retained

2. **Data Minimization:**
   - Only retain what's legally required
   - Set automatic deletion timelines
   - Pseudonymize when full deletion not allowed

3. **Transparency:**
   - Clearly explain what happens during deletion
   - Provide cooling-off period (30 days recommended)
   - Allow cancellation during cooling-off

4. **Audit Trail:**
   - Log all data rights requests and actions
   - Maintain logs for compliance audits
   - Use PACK 296 for comprehensive logging

### Security Considerations

1. **Authentication:**
   - Always verify user identity before processing requests
   - Use Firebase Auth for verification
   - Require re-authentication for DELETE requests (optional enhancement)

2. **Authorization:**
   - Users can only access their own requests
   - Admins must have proper role (PACK 300A)
   - Log all admin actions

3. **Data Sanitization:**
   - Never expose other users' PII in exports
   - Anonymize shared data (messages, matches)
   - Test export files thoroughly

4. **Irreversibility:**
   - Make clear DELETE is permanent
   - Cooling-off period prevents impulsive decisions
   - No "soft delete" for personal data (GDPR requirement)

### Performance Optimization

1. **Batch Operations:**
   - Use `batchCheckFeatureAccess()` for filtering lists
   - Firestore batch writes for bulk updates
   - Pagination for admin console

2. **Caching:**
   - Cache user lifecycle state temporarily
   - Invalidate cache on state change
   - Use Redis if needed for high scale

3. **Async Processing:**
   - Export generation should be async (can take minutes)
   - Deletion should be batched (scheduled job)
   - Use Cloud Tasks for long-running operations

### Monitoring & Alerts

1. **Metrics to Track:**
   - Number of requests by type (EXPORT, DELETE, RESTRICT)
   - Average processing time
   - Success/failure rate of deletions
   - Rate limit violations

2. **Alerts:**
   - Deletion job failures
   - Export generation failures
   - Unusual spike in DELETE requests
   - Long-pending requests (>30 days)

3. **Dashboard:**
   - Weekly/monthly request volumes
   - Compliance SLA tracking (30-day deadline)
   - Top rejection reasons

---

## 🔗 Dependencies & Integration

### Depends On (Already Implemented):
- PACK 110 (Identity & KYC) - User verification data
- PACK 190 (Reports & Abuse) - Safety reports retention
- PACK 240+ (Meetings & Events) - Booking data
- PACK 255/277 (Wallet & Payouts) - Financial records
- PACK 267–268 (Global Safety & Risk) - Risk scores
- PACK 273–280 (Monetization & Calls) - Earnings data
- PACK 279 (AI Companions) - Companion ownership
- PACK 293 (Notifications) - User notifications
- PACK 296 (Audit Logs) - Compliance logging
- PACK 300/300A/300B (Support & Help Center) - Support tickets
- PACK 301/301A/301B (Growth & Retention) - User analytics
- PACK 302/352+ (Fraud & Risk) - Fraud data retention
- PACK 417–419 (Incidents & Enforcement) - Enforcement actions

### Integrates With:
- All feature endpoints (require lifecycle guard)
- Admin console (data rights management)
- Support system (linked tickets)
- Notification system (status updates)

---

## 🚀 Deployment Commands

```bash
# 1. Deploy Firestore rules and indexes
firebase deploy --only firestore:rules,firestore:indexes

# 2. Deploy Cloud Functions
firebase deploy --only functions:pack420

# 3. Verify deployment
firebase functions:log --only pack420

# 4. Test in staging first!
# Set project to staging
firebase use staging

# Run through E2E test scenarios
# Then deploy to production
firebase use production
firebase deploy --only firestore:rules,functions:pack420
```

---

## 📚 References

- [GDPR Article 17 - Right to Erasure](https://gdpr-info.eu/art-17-gdpr/)
- [GDPR Article 20 - Right to Data Portability](https://gdpr-info.eu/art-20-gdpr/)
- [Firebase Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Cloud Functions Scheduled](https://firebase.google.com/docs/functions/schedule-functions)

---

**Implementation Lead:** Kilo Code  
**Last Updated:** 2025-12-31  
**Next Review:** After UI completion and testing
