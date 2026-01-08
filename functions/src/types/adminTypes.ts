/**
 * PACK 65 — Admin & Ops Console Types
 * Type definitions for admin functionality, roles, permissions, and audit logging
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// ADMIN USER & ROLES
// ============================================================================

export type AdminRole =
  | 'SUPERADMIN'
  | 'COMPLIANCE'
  | 'MODERATION'
  | 'SUPPORT'
  | 'FINANCE'
  | 'TALENT_MANAGER';

export interface AdminPermissions {
  canViewUsers: boolean;
  canEditEnforcement: boolean;
  canEditAmlStatus: boolean;
  canResolveDisputes: boolean;
  canApprovePayouts: boolean;
  canReviewDeletionRequests: boolean;
  canManagePromotions: boolean;
  canManagePolicies: boolean;
}

export interface AdminUser {
  adminId: string;
  email: string;
  displayName?: string | null;
  roles: AdminRole[];
  permissions?: Partial<AdminPermissions>;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt?: Timestamp | null;
}

// ============================================================================
// ADMIN SESSIONS
// ============================================================================

export interface AdminSession {
  sessionId: string;
  adminId: string;
  createdAt: Timestamp;
  lastActiveAt: Timestamp;
  revoked: boolean;
  revokedAt?: Timestamp;
  ipCountry?: string | null;
  ipCity?: string | null;
  userAgentHash?: string | null;
}

// ============================================================================
// AUDIT LOGS
// ============================================================================

export type AuditTargetType =
  | 'USER'
  | 'AML_PROFILE'
  | 'ENFORCEMENT_STATE'
  | 'DISPUTE'
  | 'PAYOUT'
  | 'PROMOTION_CAMPAIGN'
  | 'DELETION_JOB'
  | 'POLICY'
  | 'FEATURE_FLAG'
  | 'REMOTE_CONFIG'
  | 'PARTNER'
  | 'TALENT'
  | 'CAMPAIGN'
  | 'SYSTEM'
  | 'OTHER';

export type AuditAction =
  | 'USER_VIEW'
  | 'ENFORCEMENT_UPDATE'
  | 'AML_STATUS_UPDATE'
  | 'DISPUTE_DECISION'
  | 'PAYOUT_DECISION'
  | 'PROMOTION_STATUS_UPDATE'
  | 'DELETION_REVIEW'
  | 'POLICY_UPDATE'
  | 'VIEW_FRAUD_PROFILE'
  | 'CLEAR_FRAUD_HOLD'
  | 'CONFIRM_FRAUD_HOLD'
  | 'RECALCULATE_FRAUD_SCORE'
  | 'LIST_HIGH_RISK_USERS'
  | 'VIEW_FRAUD_REVIEW_HISTORY'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'CACHE_CLEAR'
  | 'OTHER';

export type AuditSeverity = 'INFO' | 'WARN' | 'HIGH' | 'CRITICAL';

export interface AuditLog {
  logId: string;
  timestamp: Timestamp;
  adminId: string;
  adminEmail?: string | null;
  targetType: AuditTargetType;
  targetId?: string | null;
  action: AuditAction;
  severity: AuditSeverity;
  before?: any;
  after?: any;
  context?: {
    reason?: string;
    ipCountry?: string;
    ipCity?: string;
  };
  userId?: string | null;
  createdAt: Timestamp;
}

// ============================================================================
// ADMIN CONTEXT
// ============================================================================

export interface AdminContext {
  adminId: string;
  email: string | null;
  roles: AdminRole[];
  permissions: AdminPermissions;
}

// ============================================================================
// ADMIN API REQUEST/RESPONSE TYPES
// ============================================================================

export interface UserSearchRequest {
  query?: string;
  limit?: number;
  cursor?: string;
}

export interface UserSearchResponse {
  items: Array<{
    userId: string;
    email?: string | null;
    displayName?: string | null;
    countryIso?: string | null;
    createdAt: number;
    enforcementStateSummary: {
      accountStatus: string;
      earningStatus: string;
    };
    riskLevel?: string;
  }>;
  nextCursor?: string;
}

export interface UserDetailResponse {
  userId: string;
  profile: any;
  controlSettings: any;
  analytics: any;
  amlProfile: any;
  enforcementState: any;
  payoutSummary: any;
  disputesSummary: any;
  promotionsSummary: any;
}

export interface EnforcementUpdateRequest {
  userId: string;
  newState: {
    accountStatus?: 'ACTIVE' | 'LIMITED' | 'SUSPENDED' | 'BANNED';
    earningStatus?: 'NORMAL' | 'EARN_DISABLED';
    visibilityStatus?: string;
    messagingStatus?: string;
    chatRestrictions?: any;
  };
  reason: string;
}

export interface AmlStatusUpdateRequest {
  userId: string;
  status: 'NORMAL' | 'UNDER_REVIEW' | 'RESTRICTED' | 'BLOCK_PAYOUTS' | 'BLOCK_EARNINGS';
  statusReason?: string;
}

export interface DisputeResolveRequest {
  disputeId: string;
  resolution: {
    outcome: 'REFUND_CLIENT' | 'RELEASE_TO_CREATOR' | 'SPLIT' | 'REJECT_BOTH';
    notes?: string;
  };
}

export interface PayoutDecisionRequest {
  payoutRequestId: string;
  decision: 'APPROVE' | 'REJECT';
  reason?: string;
}

export interface PromotionStatusUpdateRequest {
  campaignId: string;
  status: 'ACTIVE' | 'PAUSED' | 'ENDED';
  reason?: string;
}

export interface DeletionReviewRequest {
  jobId: string;
  action: 'APPROVE' | 'REJECT';
  internalNote?: string;
  rejectionReason?: string;
}

export interface AuditSearchRequest {
  targetType?: AuditTargetType;
  targetId?: string;
  userId?: string;
  adminId?: string;
  action?: AuditAction;
  severity?: AuditSeverity;
  fromTimestamp?: number;
  toTimestamp?: number;
  limit?: number;
  cursor?: string;
}

export interface AuditSearchResponse {
  items: Array<{
    logId: string;
    timestamp: number;
    adminEmail?: string;
    targetType: AuditTargetType;
    targetId?: string;
    action: AuditAction;
    severity: AuditSeverity;
    context?: any;
  }>;
  nextCursor?: string;
}