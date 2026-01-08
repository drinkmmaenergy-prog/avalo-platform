/**
 * PACK 86 - Dispute Center & Transaction Issue Reporting
 * Type definitions for dispute/issue reporting system
 * 
 * IMPORTANT: This system NEVER issues refunds or reverses transactions
 * It only tracks issues for moderation and risk assessment
 */

import { Timestamp } from 'firebase-admin/firestore';

/**
 * Types of transactions that can be reported
 */
export type TransactionIssueRelatedType =
  | 'GIFT'
  | 'PREMIUM_STORY'
  | 'PAID_MEDIA'
  | 'CALL'
  | 'CHAT'
  | 'OTHER';

/**
 * Reason codes for reporting issues
 */
export type TransactionIssueReasonCode =
  | 'SCAM'
  | 'HARASSMENT'
  | 'SPAM'
  | 'INAPPROPRIATE_CONTENT'
  | 'OTHER';

/**
 * Status of a transaction issue report
 */
export type TransactionIssueStatus =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'RESOLVED'
  | 'DISMISSED';

/**
 * Main transaction issue document in Firestore
 * Collection: transaction_issues
 */
export interface TransactionIssue {
  id: string;
  reporterId: string;        // User who submits the issue
  reportedUserId: string;    // User the complaint is about (e.g. creator)
  relatedType: TransactionIssueRelatedType;
  relatedId?: string;        // ID of transaction/content (giftId, storyUnlockId, etc.)
  chatId?: string;           // Optional, if related to chat
  reasonCode: TransactionIssueReasonCode;
  description?: string;      // Free-text description from reporter
  status: TransactionIssueStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  reviewerId?: string;       // Admin id (for internal moderation tools)
  resolutionSummary?: string; // Optional, internal note/summary
}

/**
 * Lightweight event feed for Trust Engine
 * Collection: user_report_events
 */
export interface UserReportEvent {
  id: string;
  reporterId: string;        // Who reported
  reportedUserId: string;    // Who is being reported
  type: 'TRANSACTION_ISSUE' | 'BEHAVIORAL_ABUSE';
  reasonCode: TransactionIssueReasonCode;
  createdAt: Timestamp;
}

/**
 * Input payload for creating a transaction issue
 */
export interface CreateTransactionIssuePayload {
  reporterId: string;
  relatedType: TransactionIssueRelatedType;
  relatedId?: string;        // Required for monetized interactions
  chatId?: string;
  reportedUserId: string;
  reasonCode: TransactionIssueReasonCode;
  description?: string;
}

/**
 * Result of creating a transaction issue
 */
export interface CreateTransactionIssueResult {
  success: boolean;
  issueId: string;
  status: TransactionIssueStatus;
  message?: string;
}

/**
 * Input payload for updating issue status (admin only)
 */
export interface UpdateTransactionIssueStatusPayload {
  issueId: string;
  newStatus: TransactionIssueStatus;
  reviewerId: string;
  resolutionSummary?: string;
}

/**
 * Result of updating issue status
 */
export interface UpdateTransactionIssueStatusResult {
  success: boolean;
  issueId: string;
  newStatus: TransactionIssueStatus;
}

/**
 * Query result for listing user's issues
 */
export interface GetMyTransactionIssuesResult {
  success: boolean;
  issues: TransactionIssue[];
  total: number;
}

/**
 * Weight mapping for different report types to Trust Engine
 */
export const REPORT_WEIGHT_MAP: Record<TransactionIssueReasonCode, number> = {
  SCAM: 15,                    // High weight for financial harm
  HARASSMENT: 10,              // Medium weight
  SPAM: 5,                     // Lower weight
  INAPPROPRIATE_CONTENT: 10,   // Medium weight
  OTHER: 5,                    // Lower weight
};

/**
 * Allowed status transitions for moderation
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<
  TransactionIssueStatus,
  TransactionIssueStatus[]
> = {
  OPEN: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['RESOLVED', 'DISMISSED'],
  RESOLVED: [],  // Final state
  DISMISSED: [], // Final state
};

/**
 * Helper to validate if a status transition is allowed
 */
export function isValidStatusTransition(
  currentStatus: TransactionIssueStatus,
  newStatus: TransactionIssueStatus
): boolean {
  const allowedTransitions = ALLOWED_STATUS_TRANSITIONS[currentStatus];
  return allowedTransitions.includes(newStatus);
}

/**
 * Helper to get trust event weight for a report
 */
export function getReportWeight(reasonCode: TransactionIssueReasonCode): number {
  return REPORT_WEIGHT_MAP[reasonCode] || 5;
}