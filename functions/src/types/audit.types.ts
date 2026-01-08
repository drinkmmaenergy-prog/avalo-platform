/**
 * PACK 296 — Compliance & Audit Layer Types
 * 
 * Type definitions for audit logging, admin roles, and compliance exports
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// AUDIT LOG TYPES
// ============================================================================

export type ActorType = 'USER' | 'SYSTEM' | 'ADMIN';

export type ActionType =
  // Identity & Access
  | 'USER_REGISTRATION'
  | 'KYC_SUBMITTED'
  | 'KYC_VERIFIED'
  | 'KYC_REJECTED'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  
  // Token & Money Flows
  | 'TOKEN_PURCHASE'
  | 'PAYOUT_REQUESTED'
  | 'PAYOUT_APPROVED'
  | 'PAYOUT_REJECTED'
  | 'PAYOUT_PAID'
  
  // Paid Interactions
  | 'CHAT_STARTED'
  | 'CHAT_PAID_SEGMENT_STARTED'
  | 'CHAT_REFUND_APPLIED'
  | 'CALL_STARTED'
  | 'CALL_ENDED'
  | 'CALENDAR_BOOKING_CREATED'
  | 'CALENDAR_BOOKING_CANCELLED'
  | 'CALENDAR_REFUND_APPLIED'
  | 'EVENT_CREATED'
  | 'EVENT_CANCELLED'
  | 'EVENT_REFUND_APPLIED'
  
  // Safety & Risk
  | 'PANIC_BUTTON_TRIGGERED'
  | 'SAFETY_REPORT_SUBMITTED'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_BANNED'
  | 'ACCOUNT_RESTORED'
  | 'CONTENT_REMOVED'
  
  // Legal & Policy
  | 'POLICY_ACCEPTED'
  | 'LEGAL_DOC_UPDATED'
  
  // Admin Actions
  | 'ADMIN_NOTE_ADDED'
  | 'ADMIN_RISK_OVERRIDE'
  | 'ADMIN_AUDIT_VIEW'
  | 'ADMIN_EXPORT_CREATED';

export type ResourceType =
  | 'USER'
  | 'CHAT'
  | 'CALL'
  | 'BOOKING'
  | 'EVENT'
  | 'PAYMENT'
  | 'CONTENT'
  | 'LEGAL'
  | 'SYSTEM';

export interface AuditLogMetadata {
  ipCountry?: string;
  ipHash?: string;
  deviceId?: string;
  amountTokens?: number;
  amountFiat?: number;
  currency?: string;
  meetingTime?: string;
  eventTime?: string;
  reason?: string;
  riskScoreBefore?: number;
  riskScoreAfter?: number;
  duration?: number;
  oldValue?: any;
  newValue?: any;
  [key: string]: any;
}

export interface AuditLog {
  logId: string;
  timestamp: Timestamp;
  actorType: ActorType;
  actorId: string | null;
  actionType: ActionType;
  resourceType: ResourceType;
  resourceId: string | null;
  metadata: AuditLogMetadata;
  sensitive: boolean;
  createdAt: Timestamp;
}

export interface AuditLogDocument extends Omit<AuditLog, 'timestamp' | 'createdAt'> {
  timestamp: Timestamp;
  createdAt: Timestamp;
}

// ============================================================================
// ADMIN ROLES TYPES
// ============================================================================

export type AdminRole = 'VIEWER' | 'MODERATOR' | 'RISK' | 'SUPERADMIN';

export interface AdminUser {
  adminId: string;
  email: string;
  role: AdminRole;
  permissions: AdminPermission[];
  createdAt: Timestamp;
  lastLoginAt?: Timestamp;
  createdBy?: string;
  disabled?: boolean;
}

export interface AdminPermission {
  resource: string;
  actions: string[];
}

// ============================================================================
// AUDIT SEARCH TYPES
// ============================================================================

export interface AuditSearchParams {
  userId?: string;
  actorId?: string;
  resourceId?: string;
  resourceType?: ResourceType;
  actionType?: ActionType;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  cursor?: string;
}

export interface AuditSearchResponse {
  items: AuditLog[];
  nextCursor: string | null;
  totalCount?: number;
}

// ============================================================================
// COMPLIANCE EXPORT TYPES
// ============================================================================

export interface MetricsExportParams {
  fromDate: string;
  toDate: string;
  granularity: 'day' | 'week' | 'month';
}

export interface MetricsExportItem {
  period: string;
  newRegistrations: number;
  activeUsers: number;
  payingUsers: number;
  totalTokenPurchases: number;
  totalTokenPurchasesPLN: number;
  totalPayoutsPLN: number;
  gmvTokens: number;
  netRevenuePLN: number;
  totalMeetingsBooked: number;
  totalEventsTickets: number;
  safetyReports: number;
  bans: number;
}

export interface MetricsExportResponse {
  period: {
    from: string;
    to: string;
  };
  granularity: 'day' | 'week' | 'month';
  items: MetricsExportItem[];
}

export interface CaseExportParams {
  userId: string;
  fromDate?: string;
  toDate?: string;
  includeFinancials?: boolean;
  includeSafety?: boolean;
}

export interface CaseExportResponse {
  userId: string;
  period: {
    from: string;
    to: string;
  };
  auditLogs: AuditLog[];
  safetyReports: any[];
  accountStatus: {
    currentRiskScore: number;
    banned: boolean;
    suspendedUntil?: string;
  };
  financialSummary?: {
    totalPurchasedTokens: number;
    totalEarnedTokens: number;
    totalWithdrawnTokens: number;
    totalSpentTokens: number;
  };
}

// ============================================================================
// DATA RETENTION TYPES
// ============================================================================

export interface DataRetentionConfig {
  auditLogsYears: number;
  safetyReportsYears: number;
  financialRecordsYears: number;
}

export interface RetentionJobResult {
  processed: number;
  deleted: number;
  anonymized: number;
  errors: number;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface AuditLogParams {
  actorType: ActorType;
  actorId?: string | null;
  actionType: ActionType;
  resourceType?: ResourceType;
  resourceId?: string | null;
  metadata?: AuditLogMetadata;
  sensitive?: boolean;
}