/**
 * PACK 86 - Dispute Center & Transaction Issue Reporting
 * Mobile TypeScript types for dispute/issue reporting
 */

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
 * Transaction issue from Firestore
 */
export interface TransactionIssue {
  id: string;
  reporterId: string;
  reportedUserId: string;
  relatedType: TransactionIssueRelatedType;
  relatedId?: string;
  chatId?: string;
  reasonCode: TransactionIssueReasonCode;
  description?: string;
  status: TransactionIssueStatus;
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
  reviewerId?: string;
  resolutionSummary?: string;
}

/**
 * Input for creating a transaction issue
 */
export interface CreateTransactionIssueInput {
  relatedType: TransactionIssueRelatedType;
  relatedId?: string;
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
 * Result of getting user's issues
 */
export interface GetMyTransactionIssuesResult {
  success: boolean;
  issues: TransactionIssue[];
  total: number;
}

/**
 * Human-readable labels for related types
 */
export const RELATED_TYPE_LABELS: Record<TransactionIssueRelatedType, string> = {
  GIFT: 'Gift',
  PREMIUM_STORY: 'Premium Story',
  PAID_MEDIA: 'Paid Media',
  CALL: 'Call',
  CHAT: 'Chat',
  OTHER: 'Other',
};

/**
 * Human-readable labels for reason codes
 */
export const REASON_CODE_LABELS: Record<TransactionIssueReasonCode, string> = {
  SCAM: 'Scam / Financial Harm',
  HARASSMENT: 'Harassment or Hate',
  SPAM: 'Spam',
  INAPPROPRIATE_CONTENT: 'Inappropriate or Explicit Content',
  OTHER: 'Other',
};

/**
 * Human-readable labels for status
 */
export const STATUS_LABELS: Record<TransactionIssueStatus, string> = {
  OPEN: 'Open',
  UNDER_REVIEW: 'Under Review',
  RESOLVED: 'Resolved',
  DISMISSED: 'Dismissed',
};

/**
 * Status badge colors for UI
 */
export const STATUS_COLORS: Record<TransactionIssueStatus, string> = {
  OPEN: '#FFA500', // Orange
  UNDER_REVIEW: '#4169E1', // Royal Blue
  RESOLVED: '#32CD32', // Lime Green
  DISMISSED: '#808080', // Gray
};