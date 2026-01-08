# PACK 65 — Admin & Ops Console API + Audit Logging

## Implementation Complete ✅

This pack introduces a secure internal Admin & Operations API layer with comprehensive audit logging for Avalo, enabling centralized management of users, enforcement, AML, disputes, payouts, and promotions.

---

## 📁 Files Created

### Core Modules

1. **`functions/src/types/adminTypes.ts`** (180 lines)
   - TypeScript type definitions for admin functionality
   - Admin roles, permissions, sessions, and audit logs
   - Request/response interfaces for all admin APIs

2. **`functions/src/adminAuth.ts`** (280 lines)
   - Admin authentication and authorization
   - Role-based access control (RBAC)
   - Permission checking and enforcement
   - Admin user management utilities

3. **`functions/src/auditLogger.ts`** (243 lines)
   - Centralized audit logging system
   - Immutable, append-only audit trail
   - Query and search capabilities
   - Integration hooks for all sensitive operations

4. **`functions/src/adminConsole.ts`** (724 lines)
   - Complete admin API endpoints
   - User search and detail views
   - Enforcement, AML, dispute, payout, and promotion management
   - GDPR deletion request review
   - Audit log search interface

---

## 🔐 Admin Roles & Permissions

### Role Definitions

| Role | Description | Default Permissions |
|------|-------------|---------------------|
| **SUPERADMIN** | Full system access | All permissions enabled |
| **COMPLIANCE** | AML and legal compliance | View users, edit AML status, resolve disputes, review deletions |
| **MODERATION** | Content and user moderation | View users, edit enforcement, resolve disputes, manage promotions |
| **SUPPORT** | User support operations | View users, resolve non-financial disputes |
| **FINANCE** | Financial operations | View users, approve payouts, manage promotions |

### Permission Matrix

```typescript
interface AdminPermissions {
  canViewUsers: boolean;                    // View user profiles and data
  canEditEnforcement: boolean;              // Apply enforcement actions (bans, suspensions)
  canEditAmlStatus: boolean;                // Change AML status (blocks, reviews)
  canResolveDisputes: boolean;              // Resolve user disputes
  canApprovePayouts: boolean;               // Approve/reject payout requests
  canReviewDeletionRequests: boolean;       // Review GDPR deletion requests
  canManagePromotions: boolean;             // Pause/end promotion campaigns
  canManagePolicies: boolean;               // Update platform policies
}
```

---

## 🛠️ API Endpoints

### User Management

#### **POST `/admin/users/search`**
Search for users by email, userId, or username.

**Request:**
```json
{
  "query": "user@example.com",
  "limit": 50,
  "cursor": "optional_cursor"
}
```

**Response:**
```json
{
  "items": [
    {
      "userId": "u123",
      "email": "user@example.com",
      "displayName": "John Doe",
      "countryIso": "PL",
      "createdAt": 1234567890000,
      "enforcementStateSummary": {
        "accountStatus": "ACTIVE",
        "earningStatus": "NORMAL"
      },
      "riskLevel": "LOW"
    }
  ],
  "nextCursor": "cursor_for_next_page"
}
```

**Permission Required:** `canViewUsers`

---

#### **GET `/admin/users/detail?userId=u123`**
Get comprehensive user details including profile, analytics, AML, enforcement, payouts, disputes, and promotions.

**Response:**
```json
{
  "userId": "u123",
  "profile": { /* user profile data */ },
  "controlSettings": { /* user control preferences */ },
  "analytics": { /* user analytics */ },
  "amlProfile": { /* AML risk profile */ },
  "enforcementState": { /* enforcement status */ },
  "payoutSummary": { /* payout account info */ },
  "disputesSummary": { /* recent disputes */ },
  "promotionsSummary": { /* promotion campaigns */ }
}
```

**Permission Required:** `canViewUsers`

---

### Enforcement Actions

#### **POST `/admin/enforcement/update`**
Apply enforcement actions to a user account.

**Request:**
```json
{
  "userId": "u123",
  "newState": {
    "accountStatus": "SUSPENDED",
    "earningStatus": "EARN_DISABLED",
    "visibilityStatus": "HIDDEN_FROM_DISCOVERY"
  },
  "reason": "Violation of community guidelines"
}
```

**Response:**
```json
{
  "success": true,
  "enforcementState": { /* updated enforcement state */ }
}
```

**Permission Required:** `canEditEnforcement`
**Audit Severity:** `HIGH` or `CRITICAL` (for bans)

---

### AML Management

#### **POST `/admin/aml/set-status`**
Update AML status for a user.

**Request:**
```json
{
  "userId": "u123",
  "status": "BLOCK_PAYOUTS",
  "statusReason": "High-risk transaction pattern detected"
}
```

**Valid Statuses:**
- `NORMAL` - No restrictions
- `UNDER_REVIEW` - Manual review required
- `RESTRICTED` - Activity limits applied
- `BLOCK_PAYOUTS` - Payouts blocked, earning allowed
- `BLOCK_EARNINGS` - Both earning and payouts blocked

**Permission Required:** `canEditAmlStatus`
**Audit Severity:** `HIGH` (for blocks), `WARN` (for reviews)

---

### Dispute Resolution

#### **POST `/admin/disputes/resolve`**
Resolve a user dispute.

**Request:**
```json
{
  "disputeId": "dispute_123",
  "resolution": {
    "outcome": "REFUND_CLIENT",
    "notes": "Evidence supports refund"
  }
}
```

**Valid Outcomes:**
- `REFUND_CLIENT` - Full refund to client
- `RELEASE_TO_CREATOR` - Release funds to creator
- `SPLIT` - Split amount between parties
- `REJECT_BOTH` - Reject dispute

**Permission Required:** `canResolveDisputes`
**Audit Severity:** `HIGH`

---

### Payout Management

#### **POST `/admin/payouts/decision`**
Approve or reject a payout request.

**Request:**
```json
{
  "payoutRequestId": "payout_456",
  "decision": "APPROVE",
  "reason": "KYC verified, low risk"
}
```

**Valid Decisions:** `APPROVE`, `REJECT`

**Permission Required:** `canApprovePayouts`
**Audit Severity:** `HIGH`

---

### Promotion Management

#### **POST `/admin/promotions/set-status`**
Update promotion campaign status.

**Request:**
```json
{
  "campaignId": "campaign_789",
  "status": "PAUSED",
  "reason": "Content policy violation"
}
```

**Valid Statuses:** `ACTIVE`, `PAUSED`, `ENDED`

**Permission Required:** `canManagePromotions`
**Audit Severity:** `INFO` or `WARN` (for ended campaigns)

---

### GDPR Deletion Review

#### **POST `/admin/deletion/review`**
Review and approve/reject a GDPR deletion request.

**Request:**
```json
{
  "jobId": "deletion_abc",
  "action": "APPROVE",
  "internalNote": "All retention requirements met"
}
```

**Valid Actions:** `APPROVE`, `REJECT`

**Permission Required:** `canReviewDeletionRequests`
**Audit Severity:** `HIGH`

---

### Audit Log Search

#### **POST `/admin/audit/search`**
Search and filter audit logs.

**Request:**
```json
{
  "targetType": "USER",
  "userId": "u123",
  "action": "ENFORCEMENT_UPDATE",
  "severity": "HIGH",
  "fromTimestamp": 1234567890000,
  "toTimestamp": 1234999999000,
  "limit": 50,
  "cursor": "optional_cursor"
}
```

**Response:**
```json
{
  "items": [
    {
      "logId": "log_xyz",
      "timestamp": 1234567890000,
      "adminEmail": "admin@avalo.com",
      "targetType": "USER",
      "targetId": "u123",
      "action": "ENFORCEMENT_UPDATE",
      "severity": "HIGH",
      "context": {
        "reason": "Policy violation"
      }
    }
  ],
  "nextCursor": "next_page_cursor"
}
```

**Permission Required:** `canViewUsers`

---

## 📊 Audit Logging

### Audit Log Structure

```typescript
interface AuditLog {
  logId: string;
  timestamp: Timestamp;
  adminId: string;                    // Who performed the action
  adminEmail?: string;
  targetType: AuditTargetType;        // What was affected
  targetId?: string;
  action: AuditAction;                // What was done
  severity: AuditSeverity;            // How critical
  before?: any;                       // State before action
  after?: any;                        // State after action
  context?: {
    reason?: string;
    ipCountry?: string;
    ipCity?: string;
  };
  userId?: string;                    // Affected end-user
  createdAt: Timestamp;
}
```

### Audit Target Types

- `USER` - User profile operations
- `AML_PROFILE` - AML status changes
- `ENFORCEMENT_STATE` - Enforcement actions
- `DISPUTE` - Dispute resolutions
- `PAYOUT` - Payout approvals/rejections
- `PROMOTION_CAMPAIGN` - Promotion status changes
- `DELETION_JOB` - Deletion request reviews
- `POLICY` - Policy updates
- `OTHER` - Other operations

### Audit Severity Levels

- `INFO` - Informational (view operations)
- `WARN` - Warning (status changes)
- `HIGH` - High priority (blocks, resolutions)
- `CRITICAL` - Critical (bans, permanent actions)

---

## 🔗 Integration with Existing Packs

### PACK 54 — Moderation & Enforcement
✅ **Integration Point:** `adminConsole.ts` → `moderationEngine.ts`
- Admin enforcement updates call `applyEnforcement()`
- Reads enforcement state via `getEnforcementState()`
- No duplicate logic - uses existing enforcement system

### PACK 56 — Payouts
✅ **Integration Point:** `adminConsole.ts` → `payouts.ts`
- Admin payout decisions update `payout_requests` collection
- Returns tokens to creator earnings on rejection
- Audit logs track all payout decisions

### PACK 57 — Disputes & Evidence Center
✅ **Integration Point:** `adminConsole.ts` → `disputeEngine.ts`
- Admin dispute resolutions update dispute status
- Uses existing dispute outcome types
- Can trigger refunds/releases via dispute system

### PACK 61 — Promotions Engine
✅ **Integration Point:** `adminConsole.ts` → `promotions.ts`
- Admin can pause/end campaigns
- Status updates logged in audit trail
- Affects campaign visibility immediately

### PACK 63 — AML & Risk Monitoring Hub
✅ **Integration Point:** `adminConsole.ts` → `amlMonitoring.ts`
- Admin AML status updates modify `aml_profiles` collection
- Triggers enforcement actions when blocking payouts/earnings
- Creates AML events for audit trail

### PACK 64 — GDPR Data Export & Deletion Center
✅ **Integration Point:** `adminConsole.ts` → `privacy.ts`
- Admin reviews deletion requests in `privacyRequests` collection
- Can approve/reject with reason
- Audit logs track all privacy decisions

---

## 🔒 Security Considerations

### Authentication
- Admin authentication via `x-admin-id` header (production should use JWT/SSO)
- All endpoints require valid admin session
- Admin users stored in separate `admin_users` collection

### Authorization
- Role-based permission checks on every request
- Permission overrides supported per admin user
- Failed permission checks return 403 Forbidden

### Audit Trail
- **Immutable:** Audit logs are append-only, never deleted
- **Comprehensive:** All sensitive operations are logged
- **Queryable:** Full search capabilities for investigation
- **Context-rich:** Includes before/after snapshots and reasons

### Data Access
- Admin APIs are internal-only, not exposed to mobile app
- User PII is masked in search results where appropriate
- Audit logs retained for compliance requirements

---

## 📝 Usage Examples

### Setting Up an Admin User

```typescript
import { createOrUpdateAdminUser } from './adminAuth';

await createOrUpdateAdminUser({
  adminId: 'admin_001',
  email: 'compliance@avalo.com',
  displayName: 'Compliance Team',
  roles: ['COMPLIANCE'],
  isActive: true
});
```

### Writing Custom Audit Logs

```typescript
import { writeAuditLog } from './auditLogger';

await writeAuditLog({
  admin: adminContext,
  targetType: 'POLICY',
  targetId: 'terms_v2',
  action: 'POLICY_UPDATE',
  severity: 'WARN',
  before: { version: 1 },
  after: { version: 2 },
  reason: 'Updated terms of service'
});
```

### Querying Audit Logs

```typescript
import { queryAuditLogs } from './auditLogger';

const logs = await queryAuditLogs({
  userId: 'u123',
  action: 'ENFORCEMENT_UPDATE',
  severity: 'HIGH',
  fromTimestamp: Date.now() - 30 * 24 * 60 * 60 * 1000, // Last 30 days
  limit: 50
});
```

---

## ✅ Success Checklist

### Data Models
- [x] `admin_users` collection schema defined
- [x] `admin_sessions` collection schema defined
- [x] `audit_logs` collection schema defined
- [x] TypeScript types for all admin entities

### Authentication & Authorization
- [x] `requireAdmin()` function for authentication
- [x] Role-based permission computation
- [x] Permission checking middleware
- [x] Admin user management utilities

### Audit Logging
- [x] `writeAuditLog()` centralized logging function
- [x] Audit log query interface
- [x] Target type and action enums
- [x] Severity level classification

### Admin APIs
- [x] User search endpoint
- [x] User detail endpoint
- [x] Enforcement update endpoint
- [x] AML status update endpoint
- [x] Dispute resolution endpoint
- [x] Payout decision endpoint
- [x] Promotion status update endpoint
- [x] Deletion review endpoint
- [x] Audit log search endpoint

### Integration
- [x] Enforcement engine integration (PACK 54)
- [x] Payout system integration (PACK 56)
- [x] Dispute system integration (PACK 57)
- [x] Promotion engine integration (PACK 61)
- [x] AML monitoring integration (PACK 63)
- [x] GDPR deletion integration (PACK 64)

### Security
- [x] Admin-only access control
- [x] Permission-based authorization
- [x] Immutable audit trail
- [x] No user-facing exposure

---

## 🚫 Hard Constraints Maintained

✅ **No token pricing changes** - Admin APIs do not modify token economics
✅ **No revenue split changes** - 65/35 split remains unchanged
✅ **No free tokens** - No bonuses, discounts, or free value introduced
✅ **No Dynamic Paywall changes** - Paywall logic untouched
✅ **Backward compatible** - All existing functionality preserved
✅ **Additive only** - No breaking changes to existing APIs

---

## 🎯 Next Steps for Production

### Short Term
1. **Admin Web UI** - Build React/Next.js admin dashboard
2. **SSO Integration** - Implement OAuth2/SAML for admin login
3. **IP Allowlisting** - Restrict admin access by IP range
4. **2FA Enforcement** - Require 2FA for all admin accounts

### Medium Term
1. **Advanced Search** - Integrate Algolia for user search
2. **Batch Operations** - Support bulk enforcement actions
3. **Scheduled Actions** - Schedule future enforcement/unblock
4. **Notification System** - Alert admins of high-risk events

### Long Term
1. **ML-Assisted Review** - Auto-suggest enforcement actions
2. **Compliance Reports** - Automated regulatory reporting
3. **Multi-Region Admins** - Region-specific admin roles
4. **Audit Analytics** - Dashboard for audit log insights

---

## 📚 Related Documentation

- [PACK 54 - Moderation & Enforcement](./PACK_54_IMPLEMENTATION.md)
- [PACK 55 - Compliance Core & Policies](./PACK_55_DEPLOYMENT_CHECKLIST.md)
- [PACK 56 - Payouts](./functions/src/payouts.ts)
- [PACK 57 - Disputes & Evidence Center](./functions/src/disputeEngine.ts)
- [PACK 61 - Promotions Engine](./functions/src/promotions.ts)
- [PACK 63 - AML & Risk Monitoring Hub](./functions/src/amlMonitoring.ts)
- [PACK 64 - GDPR Data Export & Deletion Center](./PACK_64_GDPR_DATA_EXPORT_DELETION_IMPLEMENTATION_COMPLETE.md)

---

## 🎉 Implementation Status

**PACK 65 Implementation: COMPLETE** ✅

All requirements met:
- ✅ Admin authentication and authorization
- ✅ Role-based access control
- ✅ Comprehensive audit logging
- ✅ 9 admin API endpoints
- ✅ Integration with 6 existing packs
- ✅ Zero breaking changes
- ✅ Security and compliance focused

**Total Lines of Code:** 1,427 lines across 4 new files
**Integration Points:** 6 existing packs
**API Endpoints:** 9 admin operations
**Collections:** 3 new (admin_users, admin_sessions, audit_logs)