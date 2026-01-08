/**
 * PACK 88 — Moderator Console & Case Management Types
 * TypeScript type definitions for moderation system
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// ADMIN USER TYPES
// ============================================================================

export type AdminRole = 'MODERATOR' | 'COMPLIANCE' | 'ADMIN';

export interface AdminUser {
  userId: string;
  roles: AdminRole[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// MODERATION CASE TYPES
// ============================================================================

export type CaseType = 'KYC' | 'PAYOUT' | 'DISPUTE' | 'TRUST_REVIEW' | 'ENFORCEMENT';

export type CaseStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED';

export type CasePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ModerationCase {
  id: string;
  type: CaseType;
  subjectUserId: string;
  sourceId: string; // ID of underlying object (kycDocumentId, payoutRequestId, etc.)
  status: CaseStatus;
  priority: CasePriority;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string; // 'SYSTEM' or admin id
  assignedTo?: string; // Admin id
  lastAction?: string; // Short string like 'KYC_APPROVED'
}

// ============================================================================
// CASE NOTE TYPES
// ============================================================================

export interface ModerationCaseNote {
  id: string;
  caseId: string;
  authorId: string;
  content: string;
  createdAt: Timestamp;
}

// ============================================================================
// AUDIT LOG TYPES
// ============================================================================

export type ModerationActionType =
  | 'KYC_APPROVED'
  | 'KYC_REJECTED'
  | 'KYC_BLOCKED'
  | 'PAYOUT_APPROVED'
  | 'PAYOUT_REJECTED'
  | 'DISPUTE_RESOLVED'
  | 'ENFORCEMENT_SET'
  | 'CASE_STATUS_UPDATED'
  | 'CASE_ASSIGNED'
  | 'CASE_NOTE_ADDED';

export interface ModerationAuditLog {
  id: string;
  adminId: string;
  subjectUserId: string;
  caseId?: string;
  actionType: ModerationActionType;
  payload: Record<string, any>;
  createdAt: Timestamp;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface ListCasesFilters {
  type?: CaseType;
  status?: CaseStatus;
  subjectUserId?: string;
  priority?: CasePriority;
  assignedTo?: string;
}

export interface ListCasesPagination {
  limit?: number;
  pageToken?: string;
}

export interface ListCasesResponse {
  cases: ModerationCase[];
  total: number;
  hasMore: boolean;
  nextPageToken?: string;
}

export interface CaseDetailsResponse {
  case: ModerationCase;
  underlyingData: any;
  notes: ModerationCaseNote[];
}

export interface UpdateCaseStatusPayload {
  caseId: string;
  newStatus: CaseStatus;
}

export interface AssignCasePayload {
  caseId: string;
  adminId: string;
}

export interface AddCaseNotePayload {
  caseId: string;
  content: string;
}

// KYC Action Payloads
export interface ApproveKycFromCasePayload {
  caseId: string;
}

export interface RejectKycFromCasePayload {
  caseId: string;
  reason: string;
}

// Payout Action Payloads
export interface SetPayoutStatusFromCasePayload {
  caseId: string;
  newStatus: 'APPROVED' | 'REJECTED' | 'UNDER_REVIEW' | 'PAID';
  reason?: string;
}

// Dispute Action Payloads
export interface UpdateDisputeFromCasePayload {
  caseId: string;
  newStatus: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED';
  resolutionSummary?: string;
}

// Enforcement Action Payloads
export interface SetEnforcementFromCasePayload {
  caseId: string;
  accountStatus: 'ACTIVE' | 'SOFT_RESTRICTED' | 'HARD_RESTRICTED' | 'SUSPENDED';
  featureLocks?: string[];
  visibilityTier?: 'NORMAL' | 'LOW' | 'HIDDEN';
  reasonCodes?: string[];
  reviewNote: string;
}