# PACK 351 — SAFE MERGE SUPPORT PACKS

**Document Version:** 1.0  
**Last Updated:** 2025-12-14  
**Status:** Active

---

## Purpose

This document provides mandatory safe merge rules and procedures for integrating PACK 300, PACK 300A, and PACK 300B into a unified support system without breaking existing functionality.

## Current State Assessment

### PACK 300 (Backend Foundation)
**Status:** ✅ IMPLEMENTED

#### Existing Files Inventory:
- **Types:**
  - `shared/types/support.ts` — Core support types (HelpArticle, SupportTicket, EducationCard, etc.)
  - `shared/types/support-300b.ts` — Extended types (SafetyTicketMetadata, AccountActions, Metrics)
  
- **Mobile Help Center:**
  - `app-mobile/app/help/index.tsx` — Help center listing
  - `app-mobile/app/help/[articleId].tsx` — Help article detail
  - `app-mobile/app/help/article/[slug].tsx` — Article by slug
  
- **Education Component:**
  - `app-mobile/app/components/EducationCard.tsx` — Contextual education cards

#### Missing Infrastructure:
- ❌ `firestore-pack300-support.rules` — NOT FOUND
- ❌ `firestore-pack300-support.indexes.json` — NOT FOUND
- ❌ `functions/src/support/` directory — NOT FOUND
- ❌ Cloud Functions for support backend

### PACK 300A (Mobile Support UI)
**Status:** ✅ IMPLEMENTED

#### Existing Files Inventory:
- **Support Ticket Screens:**
  - `app-mobile/app/support/index.tsx` — My tickets list
  - `app-mobile/app/support/create.tsx` — Create new ticket
  - `app-mobile/app/support/[ticketId].tsx` — Ticket detail & conversation
  - `app-mobile/app/support/[caseId].tsx` — Case detail (alternative route)
  - `app-mobile/app/support/new.tsx` — New ticket wizard

- **Support Components:**
  - `app-mobile/app/support/components/TicketAttachmentUploader.tsx`
  - `app-mobile/app/support/components/TicketPriorityBadge.tsx`
  - `app-mobile/app/support/components/TicketStatusBadge.tsx`
  - `app-mobile/app/support/components/TicketSystemMessage.tsx`

### PACK 300B (Admin Console, Web Help, Safety, Education Rollout, Integrations)
**Status:** ⚠️ PARTIALLY IMPLEMENTED

#### Existing:
- ✅ Types defined in `shared/types/support-300b.ts`
- ✅ Safety classification helpers in types

#### Missing:
- ❌ `admin-web/` directory — DOES NOT EXIST
- ❌ Admin console for ticket management
- ❌ Web-based public help center
- ❌ Safety escalation Cloud Functions
- ❌ Contextual education card placement logic
- ❌ Integrations with notifications, audit, risk systems

---

## SAFE MERGE RULES

### 1. Backend (PACK 300) — DO NOT BREAK

#### 🚨 Critical Rules:
1. **DO NOT DELETE** any existing file from shared/types/support.ts or support-300b.ts
2. **DO NOT RENAME** ticket types, statuses, priorities defined in PACK 300
3. **CREATE (do not overwrite)** new backend infrastructure:
   - `firestore-pack300-support.rules`
   - `firestore-pack300-support.indexes.json`
   - `functions/src/support/` directory with:
     - `ticketManagement.ts` — CRUD operations
     - `helpCenterApi.ts` — Article search and retrieval
     - `safetyEscalation.ts` — PACK 300B safety logic
     - `educationEngine.ts` — Education card delivery
     - `supportNotifications.ts` — Integration with notification system
     - `supportAudit.ts` — Audit log integration

#### ✅ Safe Extensions:
- ADD new optional fields to existing types (with `?` modifier)
- ADD new helper functions to support.ts
- ADD new Cloud Functions (do not modify existing ones)
- EXTEND Firestore rules additively (use OR logic for new permissions)

#### Example Safe Extension:
```typescript
// ✅ SAFE: Adding new optional field
export interface SupportTicket {
  ticketId: string;
  // ... existing fields ...
  tags?: string[]; // PACK 351 addition
}

// ❌ UNSAFE: Changing existing field type
export interface SupportTicket {
  ticketId: string;
  priority: TicketSeverity; // ❌ was TicketPriority, breaking change
}
```

### 2. Mobile Support (PACK 300A) — MINIMAL CHANGES ONLY

#### 🚨 Critical Rules:
1. **DO NOT DELETE** these files:
   - `app-mobile/app/support/index.tsx`
   - `app-mobile/app/support/create.tsx`
   - `app-mobile/app/support/[ticketId].tsx`
   - `app-mobile/app/support/components/*.tsx`

2. **DO NOT BREAK** existing navigation or routing structure

3. **DOCUMENT ALL CHANGES** with `// PACK 351:` comment prefix

#### ✅ Safe Adjustments:
- ADD new components to `app-mobile/app/support/components/`
- ADD new optional props to existing components
- ENHANCE existing screens with backward-compatible features
- ADD new screens for PACK 300B features (e.g., safety ticket flow)

#### Example Safe Modification:
```tsx
// app-mobile/app/support/[ticketId].tsx

// PACK 351: Added safety indicator display
import { SafetyTicketBadge } from './components/SafetyTicketBadge';

export default function TicketDetailScreen() {
  // ... existing code unchanged ...
  
  return (
    <View>
      {/* PACK 351: Show safety badge if ticket has safety metadata */}
      {ticket.safety && <SafetyTicketBadge severity={ticket.safety.severity} />}
      
      {/* Existing code unchanged */}
      <TicketStatusBadge status={ticket.status} />
      {/* ... rest of existing code ... */}
    </View>
  );
}
```

### 3. Admin Console & Web Help (PACK 300B) — CREATE FROM SCRATCH

#### ✅ New Implementation Required:
Since `admin-web/` does not exist, PACK 351 must create:

**Admin Console Structure:**
```
admin-web/
├── package.json
├── tsconfig.json
├── next.config.js (if Next.js) or vite.config.ts
├── src/
│   ├── app/ or pages/
│   │   ├── dashboard.tsx — Support metrics overview
│   │   ├── tickets/ — Ticket management
│   │   │   ├── index.tsx — Ticket list with filters
│   │   │   ├── [ticketId].tsx — Ticket detail + reply
│   │   ├── help-articles/ — Article CMS
│   │   │   ├── index.tsx — Article management
│   │   │   ├── create.tsx
│   │   │   ├── edit/[articleId].tsx
│   │   ├── education-cards/ — Education card management
│   │   │   ├── index.tsx
│   │   │   ├── create.tsx
│   │   ├── safety/ — Safety ticket management
│   │   │   ├── index.tsx
│   │   │   ├── [ticketId].tsx
│   │   ├── auth/
│   │   │   ├── login.tsx
│   ├── components/
│   │   ├── TicketTable.tsx
│   │   ├── TicketFilters.tsx
│   │   ├── MetricsDashboard.tsx
│   │   ├── SafetyClassificationPanel.tsx
│   ├── hooks/
│   │   ├── useSupportTickets.ts
│   │   ├── useHelpArticles.ts
│   ├── lib/
│   │   ├── firebase-admin.ts
│   │   ├── api-client.ts
```

**Public Web Help Center Structure:**
```
web/ (or app-web/)
├── app/help/ or pages/help/
│   ├── index.tsx — Help home (featured articles, search)
│   ├── [category].tsx — Articles by category
│   ├── article/[slug].tsx — Article display
│   ├── search.tsx — Search results
```

#### 🚨 Rules:
1. **DO NOT CONFLICT** with existing routes in app-mobile or any other web app
2. **USE SEPARATE SUBDOMAIN** (e.g., admin.avalo.app, help.avalo.app)
3. **ENFORCE ADMIN AUTH** — Only support_agent, support_manager, safety_admin, super_admin roles
4. **INTEGRATE WITH EXISTING TYPES** from shared/types/support.ts and support-300b.ts

---

## SAFE MERGE CHECKLIST

Execute this checklist in order before deploying PACK 351:

### Step 1: Pre-Implementation
- [ ] Pull latest repo from main branch
- [ ] Create feature branch: `pack-351-safe-merge`
- [ ] Run existing tests to establish baseline:
  ```bash
  cd app-mobile && npm run test
  cd ../functions && npm run test
  ```

### Step 2: Backend Infrastructure (PACK 300 Completion)
- [ ] Create `firestore-pack300-support.rules`
  - [ ] Define rules for helpArticles collection
  - [ ] Define rules for supportTickets collection
  - [ ] Define rules for supportTicketMessages subcollection
  - [ ] Define rules for educationCards collection
  - [ ] Define rules for userEducationState collection
- [ ] Create `firestore-pack300-support.indexes.json`
  - [ ] Index for ticket queries (userId, status, createdAt)
  - [ ] Index for message queries (ticketId, createdAt)
  - [ ] Index for article search (category, locale, isSearchable)
- [ ] Create `functions/src/support/` directory
  - [ ] Implement `ticketManagement.ts`
  - [ ] Implement `helpCenterApi.ts`
  - [ ] Implement `supportNotifications.ts`
  - [ ] Implement `supportAudit.ts`
- [ ] Export all functions in `functions/src/index.ts`
- [ ] Run lint & typecheck:
  ```bash
  cd functions && npm run lint && npm run build
  ```

### Step 3: PACK 300B Safety & Admin
- [ ] Create `functions/src/support/safetyEscalation.ts`
  - [ ] Implement panic button → ticket creation
  - [ ] Implement automatic severity classification
  - [ ] Implement risk system integration
- [ ] Create `functions/src/support/educationEngine.ts`
  - [ ] Implement contextual card delivery
  - [ ] Implement dismissal tracking
- [ ] Create admin-web structure (see section 3 above)
- [ ] Create web help center structure
- [ ] Implement admin authentication & authorization
- [ ] Link admin console to Cloud Functions

### Step 4: Mobile Enhancements (PACK 300A + 300B Additions)
- [ ] Verify existing mobile support screens still work
- [ ] Add safety ticket indicators (if ticket.safety exists)
- [ ] Add education card placement in relevant flows
- [ ] Test panic button → ticket creation flow
- [ ] Run mobile tests:
  ```bash
  cd app-mobile && npm run test
  ```

### Step 5: Integration Testing
- [ ] Test user creates ticket → appears in admin console
- [ ] Test admin replies → user receives notification
- [ ] Test user closes ticket → status updates
- [ ] Test panic button → creates CRITICAL safety ticket
- [ ] Test help article search (mobile + web)
- [ ] Test education card display and dismissal
- [ ] Test safety escalation → risk log created
- [ ] Test payout/payment ticket → correct priority

### Step 6: Lint, Typecheck, Build
- [ ] Run lint on all packages:
  ```bash
  pnpm run lint --filter=app-mobile
  pnpm run lint --filter=functions
  pnpm run lint --filter=admin-web
  pnpm run lint --filter=shared
  ```
- [ ] Run typecheck:
  ```bash
  pnpm run typecheck --recursive
  ```
- [ ] Build all packages:
  ```bash
  pnpm run build --recursive
  ```
- [ ] Verify no breaking type errors

### Step 7: Staging Deployment
- [ ] Deploy Firestore rules to staging:
  ```bash
  firebase deploy --only firestore:rules --project avalo-staging
  ```
- [ ] Deploy Firestore indexes to staging:
  ```bash
  firebase deploy --only firestore:indexes --project avalo-staging
  ```
- [ ] Deploy Cloud Functions to staging:
  ```bash
  firebase deploy --only functions --project avalo-staging
  ```
- [ ] Deploy admin-web to staging
- [ ] Deploy web help center to staging
- [ ] Build mobile app in debug mode (no store submission)

### Step 8: Staging Verification
- [ ] Verify support flows in staging:
  - [ ] User can create ticket
  - [ ] Admin sees ticket in console
  - [ ] Admin can reply
  - [ ] User receives notification
  - [ ] User can close ticket
- [ ] Verify safety flows:
  - [ ] Panic button creates safety ticket
  - [ ] Safety ticket marked with correct severity
  - [ ] Risk logs created
- [ ] Verify help center:
  - [ ] Articles load on web
  - [ ] Search works
  - [ ] Articles load on mobile
- [ ] Verify education cards:
  - [ ] Display in correct contexts
  - [ ] Dismissal persists
- [ ] Monitor Cloud Functions logs for errors

### Step 9: Production Deployment (ONLY AFTER STAGING SUCCESS)
- [ ] Tag release: `git tag -a pack-351-v1.0 -m "PACK 351 Safe Merge Complete"`
- [ ] Deploy Firestore rules to production
- [ ] Deploy Firestore indexes to production
- [ ] Deploy Cloud Functions to production
- [ ] Deploy admin-web to production
- [ ] Deploy web help center to production
- [ ] Submit mobile app updates (if UI changes were made)

### Step 10: Post-Deployment Monitoring
- [ ] Monitor Firebase logs for 24 hours
- [ ] Watch support ticket creation rate
- [ ] Watch admin console usage
- [ ] Watch error rates
- [ ] Prepare rollback plan if issues detected

---

## Rollback Plan

If critical issues are detected after deployment:

1. **Immediate Actions:**
   - Revert Firestore rules to previous version
   - Disable new Cloud Functions (keep existing endpoints)
   - Switch admin-web to maintenance mode

2. **Rollback Commands:**
   ```bash
   # Revert Firestore rules
   git checkout <previous-commit> firestore-pack300-support.rules
   firebase deploy --only firestore:rules --project avalo-production
   
   # Disable specific functions
   firebase functions:config:unset support
   firebase deploy --only functions --project avalo-production
   ```

3. **Incident Response:**
   - Document issue in incident log
   - Notify stakeholders
   - Create hotfix branch
   - Test fix in staging before redeploying

---

## Integration Points (PACK 300B)

### Notifications (PACK 169)
**Integration:** `functions/src/support/supportNotifications.ts`
- Create notification when:
  - Ticket created
  - Admin replies to ticket
  - Ticket status changes to RESOLVED
  - Safety ticket escalated

**Payload:** `NotificationIntegrationPayload` from support-300b.ts

### Audit (PACK 296)
**Integration:** `functions/src/support/supportAudit.ts`
- Log audit events for:
  - Ticket creation
  - Ticket updates
  - Admin actions (assign, resolve, close)
  - Message creation
  - Article creation/updates

**Payload:** `AuditIntegrationPayload` from support-300b.ts

### Risk (PACK 159/210)
**Integration:** `functions/src/support/safetyEscalation.ts`
- Create risk event when:
  - Safety ticket created
  - Panic button pressed
  - Account action taken (warn, freeze, ban)

**Payload:** `RiskIntegrationPayload` from support-300b.ts

### Meetings (PACK 218)
**Integration:** Ticket can reference `bookingId`
- Support for calendar/meeting issues
- Automatic priority: NORMAL
- Link to booking record in ticket metadata

### Wallet (Payout Issues)
**Integration:** Ticket can reference `transactionId`
- Support for payout issues
- Automatic priority: HIGH
- Link to wallet transaction

### Events (PACK 182)
**Integration:** Ticket can reference `eventId`
- Support for event ticket issues
- Automatic priority: NORMAL

---

## Testing Requirements

### Unit Tests
Required test files:
- `functions/src/support/__tests__/ticketManagement.test.ts`
- `functions/src/support/__tests__/helpCenterApi.test.ts`
- `functions/src/support/__tests__/safetyEscalation.test.ts`
- `app-mobile/__tests__/support/ticket-creation.test.tsx`

### Integration Tests
Required test scenarios:
1. End-to-end ticket creation flow
2. Panic button → safety ticket creation
3. Admin reply → user notification
4. Help article search
5. Education card dismissal persistence

### E2E Tests (Basic)
Required smoke tests:
1. Mobile: Create ticket, verify appears in list
2. Admin: Log in, see ticket, reply
3. Mobile: See reply notification, open ticket, close
4. Web: Search help article, view article

---

## Success Criteria

PACK 351 is considered successfully merged when:

1. ✅ All existing PACK 300 and 300A files remain functional
2. ✅ All new PACK 300B infrastructure is implemented
3. ✅ All tests pass (unit + integration + E2E)
4. ✅ Admin console is accessible and functional
5. ✅ Public help center is accessible
6. ✅ Support ticket flow works end-to-end (user → admin → user)
7. ✅ Panic button creates safety ticket correctly
8. ✅ Risk, audit, notification integrations working
9. ✅ No breaking changes to existing code
10. ✅ Documentation updated

---

## Contact & Support

For questions about this merge:
- Technical Lead: Review PACK 300, 300A, 300B documentation
- PACK 351 Owner: [Your Team]
- Emergency Rollback: Follow rollback plan above

---

**Document Status:** Ready for Implementation  
**Next Steps:** Proceed with Safe Merge Checklist → Step 1
