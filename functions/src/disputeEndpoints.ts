/**
 * PACK 86 - Dispute Center Cloud Functions
 * 
 * Callable Firebase Functions for dispute/issue reporting
 * Exposes endpoints for creating, updating, and listing transaction issues
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import {
  createTransactionIssue,
  updateTransactionIssueStatus,
  getMyTransactionIssues,
  getIssuesAgainstUser,
  checkDuplicateReport,
} from './disputeCenter';
import {
  CreateTransactionIssuePayload,
  UpdateTransactionIssueStatusPayload,
  TransactionIssueRelatedType,
  TransactionIssueReasonCode,
  TransactionIssueStatus,
} from './types/dispute.types';

/**
 * Callable function: Create a new transaction issue report
 * 
 * Input:
 * - relatedType: Type of transaction (GIFT, PREMIUM_STORY, etc.)
 * - relatedId: ID of the transaction (optional for non-monetized)
 * - chatId: Chat ID if related to chat
 * - reportedUserId: User being reported
 * - reasonCode: Reason for report
 * - description: Optional free-text description
 * 
 * Returns:
 * - issueId: ID of created issue
 * - status: Current status (OPEN)
 */
export const createTransactionIssue_callable = onCall<any>(
  { cors: true },
  async (request) => {
    // Authentication required
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const reporterId = request.auth.uid;
    const {
      relatedType,
      relatedId,
      chatId,
      reportedUserId,
      reasonCode,
      description,
    } = request.data;

    try {
      // Validate required fields
      if (!relatedType || !reportedUserId || !reasonCode) {
        throw new HttpsError(
          'invalid-argument',
          'Missing required fields: relatedType, reportedUserId, reasonCode'
        );
      }

      // Validate enum values
      const validTypes: TransactionIssueRelatedType[] = [
        'GIFT',
        'PREMIUM_STORY',
        'PAID_MEDIA',
        'CALL',
        'CHAT',
        'OTHER',
      ];
      if (!validTypes.includes(relatedType)) {
        throw new HttpsError('invalid-argument', 'Invalid relatedType');
      }

      const validReasons: TransactionIssueReasonCode[] = [
        'SCAM',
        'HARASSMENT',
        'SPAM',
        'INAPPROPRIATE_CONTENT',
        'OTHER',
      ];
      if (!validReasons.includes(reasonCode)) {
        throw new HttpsError('invalid-argument', 'Invalid reasonCode');
      }

      // Check for duplicate reports
      const isDuplicate = await checkDuplicateReport(
        reporterId,
        reportedUserId,
        relatedType,
        relatedId
      );

      if (isDuplicate) {
        throw new HttpsError(
          'already-exists',
          'You have already reported this transaction'
        );
      }

      // Create the issue
      const payload: CreateTransactionIssuePayload = {
        reporterId,
        relatedType,
        relatedId,
        chatId,
        reportedUserId,
        reasonCode,
        description,
      };

      const result = await createTransactionIssue(payload);

      logger.info(
        `Transaction issue created via callable: ${result.issueId} by ${reporterId}`
      );

      return {
        success: true,
        issueId: result.issueId,
        status: result.status,
        message: result.message,
      };
    } catch (error: any) {
      logger.error('Error in createTransactionIssue_callable:', error);

      // Re-throw HttpsError
      if (error instanceof HttpsError) {
        throw error;
      }

      // Wrap other errors
      throw new HttpsError('internal', error.message || 'Failed to create issue');
    }
  }
);

/**
 * Callable function: Update transaction issue status (admin only)
 * 
 * Input:
 * - issueId: ID of the issue
 * - newStatus: New status (UNDER_REVIEW, RESOLVED, DISMISSED)
 * - resolutionSummary: Optional summary
 * 
 * Returns:
 * - issueId: ID of updated issue
 * - newStatus: New status
 */
export const updateTransactionIssueStatus_callable = onCall<any>(
  { cors: true },
  async (request) => {
    // Authentication required
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const reviewerId = request.auth.uid;
    const { issueId, newStatus, resolutionSummary } = request.data;

    try {
      // Check admin/moderator role
      // TODO: Implement proper role check when admin system is ready
      // For now, require custom claim or specific role
      const isAdmin = request.auth.token.admin === true || 
                     request.auth.token.moderator === true;

      if (!isAdmin) {
        throw new HttpsError(
          'permission-denied',
          'Only admins/moderators can update issue status'
        );
      }

      // Validate required fields
      if (!issueId || !newStatus) {
        throw new HttpsError(
          'invalid-argument',
          'Missing required fields: issueId, newStatus'
        );
      }

      // Validate enum
      const validStatuses: TransactionIssueStatus[] = [
        'OPEN',
        'UNDER_REVIEW',
        'RESOLVED',
        'DISMISSED',
      ];
      if (!validStatuses.includes(newStatus)) {
        throw new HttpsError('invalid-argument', 'Invalid newStatus');
      }

      // Update the issue
      const payload: UpdateTransactionIssueStatusPayload = {
        issueId,
        newStatus,
        reviewerId,
        resolutionSummary,
      };

      const result = await updateTransactionIssueStatus(payload);

      logger.info(
        `Transaction issue ${issueId} updated to ${newStatus} by ${reviewerId}`
      );

      return {
        success: true,
        issueId: result.issueId,
        newStatus: result.newStatus,
      };
    } catch (error: any) {
      logger.error('Error in updateTransactionIssueStatus_callable:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError('internal', error.message || 'Failed to update issue');
    }
  }
);

/**
 * Callable function: Get user's transaction issues (reports they filed)
 * 
 * Returns:
 * - issues: Array of transaction issues
 * - total: Total count
 */
export const getMyTransactionIssues_callable = onCall<any>(
  { cors: true },
  async (request) => {
    // Authentication required
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;

    try {
      const result = await getMyTransactionIssues(userId);

      // Convert Timestamps to ISO strings for client
      const issuesWithDates = result.issues.map((issue) => ({
        ...issue,
        createdAt: issue.createdAt.toDate().toISOString(),
        updatedAt: issue.updatedAt.toDate().toISOString(),
      }));

      return {
        success: true,
        issues: issuesWithDates,
        total: result.total,
      };
    } catch (error: any) {
      logger.error('Error in getMyTransactionIssues_callable:', error);
      throw new HttpsError('internal', error.message || 'Failed to get issues');
    }
  }
);

/**
 * Callable function: Get issues against a user (admin only)
 * 
 * Input:
 * - userId: User to get issues for
 * 
 * Returns:
 * - issues: Array of transaction issues
 * - total: Total count
 */
export const getIssuesAgainstUser_callable = onCall<any>(
  { cors: true },
  async (request) => {
    // Authentication required
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId } = request.data;

    try {
      // Check admin/moderator role
      const isAdmin = request.auth.token.admin === true || 
                     request.auth.token.moderator === true;

      if (!isAdmin) {
        throw new HttpsError(
          'permission-denied',
          'Only admins/moderators can view issues against users'
        );
      }

      if (!userId) {
        throw new HttpsError('invalid-argument', 'Missing userId');
      }

      const result = await getIssuesAgainstUser(userId);

      // Convert Timestamps to ISO strings for client
      const issuesWithDates = result.issues.map((issue) => ({
        ...issue,
        createdAt: issue.createdAt.toDate().toISOString(),
        updatedAt: issue.updatedAt.toDate().toISOString(),
      }));

      return {
        success: true,
        issues: issuesWithDates,
        total: result.total,
      };
    } catch (error: any) {
      logger.error('Error in getIssuesAgainstUser_callable:', error);
      throw new HttpsError('internal', error.message || 'Failed to get issues');
    }
  }
);