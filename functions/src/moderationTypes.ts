/**
 * PACK 54 - Moderation & Enforcement Layer
 * Type definitions for enforcement state, moderation cases, and actions
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// ENFORCEMENT STATE
// ============================================================================

export type AccountStatus = 'ACTIVE' | 'LIMITED' | 'SUSPENDED' | 'BANNED';
export type VisibilityStatus = 'VISIBLE' | 'HIDDEN_FROM_DISCOVERY' | 'HIDDEN_FROM_ALL';
export type MessagingStatus = 'NORMAL' | 'READ_ONLY' | 'NO_NEW_CHATS';
export type EarningStatus = 'NORMAL' | 'EARN_DISABLED';

export interface EnforcementState {
  userId: string;
  
  // High-level account status
  accountStatus: AccountStatus;
  
  // Visibility status in discovery/marketplace
  visibilityStatus: VisibilityStatus;
  
  // Messaging capabilities
  messagingStatus: MessagingStatus;
  
  // Earning capabilities (overlay on top of Trust Engine earnModeAllowed)
  earningStatus: EarningStatus;
  
  // Reason & metadata
  reasons: string[];
  notes?: string;
  lastUpdatedAt: Timestamp;
  lastUpdatedBy?: string;
}

export interface EnforcementStateInput {
  accountStatus?: AccountStatus;
  visibilityStatus?: VisibilityStatus;
  messagingStatus?: MessagingStatus;
  earningStatus?: EarningStatus;
  reasons?: string[];
  notes?: string;
}

// ============================================================================
// MODERATION CASES
// ============================================================================

export type CaseStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'ESCALATED';
export type CaseSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ModerationCase {
  caseId: string;
  targetUserId: string;
  
  // Report aggregation
  reportIds: string[];
  totalReports: number;
  firstReportAt: Timestamp;
  lastReportAt: Timestamp;
  
  // Case lifecycle
  status: CaseStatus;
  severity: CaseSeverity;
  
  // Moderation info
  assignedModeratorId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ModerationCaseUpdate {
  status?: CaseStatus;
  severity?: CaseSeverity;
  assignedModeratorId?: string;
}

// ============================================================================
// MODERATION ACTIONS
// ============================================================================

export type ActionType =
  | 'NOTE'
  | 'WARNING_SENT'
  | 'LIMITED'
  | 'SUSPENDED'
  | 'BANNED'
  | 'VISIBILITY_CHANGE'
  | 'EARNING_CHANGE';

export interface ModerationAction {
  actionId: string;
  caseId: string;
  targetUserId: string;
  performedBy: string;  // moderator/admin id or system tag
  type: ActionType;
  details: string;
  createdAt: Timestamp;
  
  // Snapshot of enforcement state after this action (for audit)
  snapshot: {
    accountStatus: AccountStatus;
    visibilityStatus: VisibilityStatus;
    messagingStatus: MessagingStatus;
    earningStatus: EarningStatus;
  };
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

export const DEFAULT_ENFORCEMENT_STATE: Omit<EnforcementState, 'userId' | 'lastUpdatedAt'> = {
  accountStatus: 'ACTIVE',
  visibilityStatus: 'VISIBLE',
  messagingStatus: 'NORMAL',
  earningStatus: 'NORMAL',
  reasons: [],
};

// ============================================================================
// SEVERITY MAPPING
// ============================================================================

export function getSeverityFromReason(reason: string): CaseSeverity {
  const upperReason = reason.toUpperCase();
  
  if (upperReason.includes('SCAM') || upperReason.includes('HARASSMENT')) {
    return 'HIGH';
  }
  
  if (upperReason.includes('SPAM')) {
    return 'MEDIUM';
  }
  
  return 'LOW';
}