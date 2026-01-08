/**
 * PACK 86 - Dispute Center & Transaction Issue Reporting
 * 
 * Core logic for handling user-submitted complaints about paid interactions
 * Feeds into Trust & Risk Engine (PACK 85) but NEVER issues refunds
 * 
 * CRITICAL RULES:
 * - No refunds, no chargebacks, no free tokens
 * - No token price changes or revenue split modifications
 * - Disputes are for risk/enforcement/moderation only
 * - All transactions remain immutable
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  TransactionIssue,
  UserReportEvent,
  CreateTransactionIssuePayload,
  CreateTransactionIssueResult,
  UpdateTransactionIssueStatusPayload,
  UpdateTransactionIssueStatusResult,
  GetMyTransactionIssuesResult,
  TransactionIssueStatus,
  TransactionIssueReasonCode,
  getReportWeight,
  isValidStatusTransition,
} from './types/dispute.types';
import { logTrustEvent, recalculateUserRisk } from './trustRiskEngine';

/**
 * Validates that reporter is actually party to the transaction
 * For monetized interactions, we must verify ownership
 */
async function validateTransactionParticipation(
  reporterId: string,
  relatedType: string,
  relatedId?: string
): Promise<boolean> {
  if (!relatedId) {
    // For non-specific reports (e.g., general chat behavior)
    return true;
  }

  try {
    switch (relatedType) {
      case 'GIFT': {
        const giftDoc = await db.collection('gifts').doc(relatedId).get();
        if (!giftDoc.exists) return false;
        const gift = giftDoc.data();
        return gift?.senderId === reporterId || gift?.receiverId === reporterId;
      }

      case 'PREMIUM_STORY': {
        const unlockDoc = await db
          .collection('story_unlocks')
          .doc(relatedId)
          .get();
        if (!unlockDoc.exists) return false;
        const unlock = unlockDoc.data();
        return unlock?.userId === reporterId || unlock?.creatorId === reporterId;
      }

      case 'PAID_MEDIA': {
        const mediaDoc = await db
          .collection('paid_media_unlocks')
          .doc(relatedId)
          .get();
        if (!mediaDoc.exists) return false;
        const media = mediaDoc.data();
        return media?.buyerId === reporterId || media?.creatorId === reporterId;
      }

      case 'CALL': {
        const callDoc = await db.collection('calls').doc(relatedId).get();
        if (!callDoc.exists) return false;
        const call = callDoc.data();
        return call?.payerId === reporterId || call?.earnerId === reporterId;
      }

      case 'CHAT': {
        const chatDoc = await db.collection('chats').doc(relatedId).get();
        if (!chatDoc.exists) return false;
        const chat = chatDoc.data();
        return chat?.participants?.includes(reporterId);
      }

      default:
        // For OTHER or unknown types, allow the report
        return true;
    }
  } catch (error) {
    logger.error('Error validating transaction participation:', error);
    return false;
  }
}

/**
 * Creates a new transaction issue report
 * 
 * This function:
 * 1. Validates reporter is authenticated
 * 2. For monetized types, verifies reporter is party to transaction
 * 3. Creates transaction_issues document
 * 4. Creates user_report_events entry
 * 5. Logs event to Trust & Risk Engine
 * 6. NEVER issues refunds or modifies transactions
 */
export async function createTransactionIssue(
  payload: CreateTransactionIssuePayload
): Promise<CreateTransactionIssueResult> {
  const {
    reporterId,
    relatedType,
    relatedId,
    chatId,
    reportedUserId,
    reasonCode,
    description,
  } = payload;

  try {
    // Validate required fields
    if (!reporterId || !reportedUserId || !relatedType || !reasonCode) {
      throw new Error('Missing required fields');
    }

    // Cannot report yourself
    if (reporterId === reportedUserId) {
      throw new Error('Cannot report yourself');
    }

    // For monetized interactions, verify participation
    const monetizedTypes = ['GIFT', 'PREMIUM_STORY', 'PAID_MEDIA', 'CALL'];
    if (monetizedTypes.includes(relatedType)) {
      if (!relatedId) {
        throw new Error(`relatedId is required for ${relatedType} reports`);
      }

      const isParticipant = await validateTransactionParticipation(
        reporterId,
        relatedType,
        relatedId
      );

      if (!isParticipant) {
        throw new Error('You are not a party to this transaction');
      }
    }

    // Generate issue ID
    const issueId = generateId();

    // Create transaction issue document
    const issue: TransactionIssue = {
      id: issueId,
      reporterId,
      reportedUserId,
      relatedType,
      relatedId,
      chatId,
      reasonCode,
      description: description?.trim() || '',
      status: 'OPEN',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Write to Firestore
    await db.collection('transaction_issues').doc(issueId).set(issue);

    // Create user report event for Trust Engine
    const reportEventId = generateId();
    const reportEvent: UserReportEvent = {
      id: reportEventId,
      reporterId,
      reportedUserId,
      type: 'TRANSACTION_ISSUE',
      reasonCode,
      createdAt: Timestamp.now(),
    };

    await db
      .collection('user_report_events')
      .doc(reportEventId)
      .set(reportEvent);

    // Log to Trust & Risk Engine
    const weight = getReportWeight(reasonCode);
    await logTrustEvent({
      userId: reportedUserId,
      type: 'REPORT_RECEIVED',
      weightOverride: weight,
      meta: {
        reporterId,
        reasonCode,
        relatedType,
        relatedId,
        sourceModule: 'dispute_center',
      },
    });

    // Recalculate reported user's risk score
    await recalculateUserRisk(reportedUserId);

    logger.info(
      `Transaction issue created: ${issueId} - ${reportedUserId} reported for ${reasonCode}`
    );

    return {
      success: true,
      issueId,
      status: 'OPEN',
      message: 'Your report has been submitted and will be reviewed.',
    };
  } catch (error) {
    logger.error('Error creating transaction issue:', error);
    throw error;
  }
}

/**
 * Updates the status of a transaction issue (admin/moderator only)
 * 
 * Allowed transitions:
 * - OPEN → UNDER_REVIEW
 * - UNDER_REVIEW → RESOLVED or DISMISSED
 * 
 * On RESOLVED: May log additional trust event
 * On DISMISSED: No additional penalties
 */
export async function updateTransactionIssueStatus(
  payload: UpdateTransactionIssueStatusPayload
): Promise<UpdateTransactionIssueStatusResult> {
  const { issueId, newStatus, reviewerId, resolutionSummary } = payload;

  try {
    // Get current issue
    const issueDoc = await db
      .collection('transaction_issues')
      .doc(issueId)
      .get();

    if (!issueDoc.exists) {
      throw new Error('Issue not found');
    }

    const issue = issueDoc.data() as TransactionIssue;
    const currentStatus = issue.status;

    // Validate status transition
    if (!isValidStatusTransition(currentStatus, newStatus)) {
      throw new Error(
        `Invalid status transition: ${currentStatus} → ${newStatus}`
      );
    }

    // Update issue document
    await db
      .collection('transaction_issues')
      .doc(issueId)
      .update({
        status: newStatus,
        reviewerId,
        resolutionSummary: resolutionSummary || '',
        updatedAt: Timestamp.now(),
      });

    // Handle final states
    if (newStatus === 'RESOLVED') {
      // Issue confirmed - may add additional trust weight
      await logTrustEvent({
        userId: issue.reportedUserId,
        type: 'REPORT_RECEIVED',
        weightOverride: 5, // Additional weight for confirmed issue
        meta: {
          issueId,
          reasonCode: issue.reasonCode,
          resolution: 'CONFIRMED',
          reviewerId,
        },
      });

      await recalculateUserRisk(issue.reportedUserId);

      logger.info(
        `Issue ${issueId} RESOLVED - additional trust weight applied to ${issue.reportedUserId}`
      );
    } else if (newStatus === 'DISMISSED') {
      // Issue dismissed - no additional penalties
      // In v1, we don't penalize reporters for false reports
      logger.info(`Issue ${issueId} DISMISSED - no action taken`);
    }

    return {
      success: true,
      issueId,
      newStatus,
    };
  } catch (error) {
    logger.error('Error updating transaction issue status:', error);
    throw error;
  }
}

/**
 * Gets all transaction issues filed by a specific user
 * For user-facing "My Reports" history
 */
export async function getMyTransactionIssues(
  userId: string
): Promise<GetMyTransactionIssuesResult> {
  try {
    const snapshot = await db
      .collection('transaction_issues')
      .where('reporterId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const issues = snapshot.docs.map((doc) => doc.data() as TransactionIssue);

    return {
      success: true,
      issues,
      total: issues.length,
    };
  } catch (error) {
    logger.error('Error getting user transaction issues:', error);
    throw error;
  }
}

/**
 * Gets all issues reported against a specific user (admin/moderator only)
 * Used for moderation review
 */
export async function getIssuesAgainstUser(
  userId: string
): Promise<GetMyTransactionIssuesResult> {
  try {
    const snapshot = await db
      .collection('transaction_issues')
      .where('reportedUserId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const issues = snapshot.docs.map((doc) => doc.data() as TransactionIssue);

    return {
      success: true,
      issues,
      total: issues.length,
    };
  } catch (error) {
    logger.error('Error getting issues against user:', error);
    throw error;
  }
}

/**
 * Checks for duplicate reports from same user about same transaction
 * Returns true if duplicate exists
 */
export async function checkDuplicateReport(
  reporterId: string,
  reportedUserId: string,
  relatedType: string,
  relatedId?: string
): Promise<boolean> {
  try {
    let query = db
      .collection('transaction_issues')
      .where('reporterId', '==', reporterId)
      .where('reportedUserId', '==', reportedUserId)
      .where('relatedType', '==', relatedType);

    if (relatedId) {
      query = query.where('relatedId', '==', relatedId);
    }

    const snapshot = await query.limit(1).get();
    return !snapshot.empty;
  } catch (error) {
    logger.error('Error checking duplicate report:', error);
    return false;
  }
}

/**
 * Gets aggregated statistics about reports for a user
 * Used by Trust Engine for flag determination
 */
export async function getUserReportStats(userId: string): Promise<{
  totalReports: number;
  scamReports: number;
  harassmentReports: number;
  spamReports: number;
  last30Days: number;
}> {
  try {
    const thirtyDaysAgo = Timestamp.fromMillis(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    );

    const allReportsSnapshot = await db
      .collection('transaction_issues')
      .where('reportedUserId', '==', userId)
      .get();

    const recentReportsSnapshot = await db
      .collection('transaction_issues')
      .where('reportedUserId', '==', userId)
      .where('createdAt', '>=', thirtyDaysAgo)
      .get();

    const allReports = allReportsSnapshot.docs.map(
      (doc) => doc.data() as TransactionIssue
    );

    const scamReports = allReports.filter((r) => r.reasonCode === 'SCAM').length;
    const harassmentReports = allReports.filter(
      (r) => r.reasonCode === 'HARASSMENT'
    ).length;
    const spamReports = allReports.filter((r) => r.reasonCode === 'SPAM').length;

    return {
      totalReports: allReports.length,
      scamReports,
      harassmentReports,
      spamReports,
      last30Days: recentReportsSnapshot.docs.length,
    };
  } catch (error) {
    logger.error('Error getting user report stats:', error);
    return {
      totalReports: 0,
      scamReports: 0,
      harassmentReports: 0,
      spamReports: 0,
      last30Days: 0,
    };
  }
}