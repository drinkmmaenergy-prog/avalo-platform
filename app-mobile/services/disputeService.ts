/**
 * PACK 86 - Dispute Center Service
 * Mobile service for reporting transaction issues
 * 
 * IMPORTANT: This service NEVER handles refunds
 * Reports are for moderation and risk assessment only
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import {
  CreateTransactionIssueInput,
  CreateTransactionIssueResult,
  GetMyTransactionIssuesResult,
  TransactionIssue,
  TransactionIssueRelatedType,
  TransactionIssueReasonCode,
} from '../types/dispute.types';

/**
 * Create a new transaction issue report
 * 
 * @param input Report details
 * @returns Result with issue ID and status
 */
export async function createTransactionIssue(
  input: CreateTransactionIssueInput
): Promise<CreateTransactionIssueResult> {
  try {
    const createIssueCallable = httpsCallable<
      CreateTransactionIssueInput,
      CreateTransactionIssueResult
    >(functions, 'dispute_createIssue');

    const result = await createIssueCallable(input);
    
    if (!result.data.success) {
      throw new Error(result.data.message || 'Failed to create issue');
    }

    return result.data;
  } catch (error: any) {
    console.error('[DisputeService] Error creating transaction issue:', error);
    throw new Error(
      error.message || 'Failed to submit report. Please try again.'
    );
  }
}

/**
 * Get all transaction issues filed by the current user
 * 
 * @returns List of transaction issues
 */
export async function getMyTransactionIssues(): Promise<TransactionIssue[]> {
  try {
    const getIssuesCallable = httpsCallable<
      void,
      GetMyTransactionIssuesResult
    >(functions, 'dispute_getMyIssues');

    const result = await getIssuesCallable();
    
    if (!result.data.success) {
      throw new Error('Failed to get issues');
    }

    return result.data.issues;
  } catch (error: any) {
    console.error('[DisputeService] Error getting transaction issues:', error);
    throw new Error(
      error.message || 'Failed to load reports. Please try again.'
    );
  }
}

/**
 * Report a gift transaction
 * 
 * @param giftId Gift ID
 * @param reportedUserId User being reported
 * @param reasonCode Reason for report
 * @param description Optional description
 */
export async function reportGift(
  giftId: string,
  reportedUserId: string,
  reasonCode: TransactionIssueReasonCode,
  description?: string
): Promise<CreateTransactionIssueResult> {
  return createTransactionIssue({
    relatedType: 'GIFT',
    relatedId: giftId,
    reportedUserId,
    reasonCode,
    description,
  });
}

/**
 * Report a premium story unlock
 * 
 * @param unlockId Story unlock ID
 * @param reportedUserId User being reported (creator)
 * @param reasonCode Reason for report
 * @param description Optional description
 */
export async function reportPremiumStory(
  unlockId: string,
  reportedUserId: string,
  reasonCode: TransactionIssueReasonCode,
  description?: string
): Promise<CreateTransactionIssueResult> {
  return createTransactionIssue({
    relatedType: 'PREMIUM_STORY',
    relatedId: unlockId,
    reportedUserId,
    reasonCode,
    description,
  });
}

/**
 * Report paid media
 * 
 * @param mediaId Media unlock ID
 * @param reportedUserId User being reported
 * @param reasonCode Reason for report
 * @param description Optional description
 */
export async function reportPaidMedia(
  mediaId: string,
  reportedUserId: string,
  reasonCode: TransactionIssueReasonCode,
  description?: string
): Promise<CreateTransactionIssueResult> {
  return createTransactionIssue({
    relatedType: 'PAID_MEDIA',
    relatedId: mediaId,
    reportedUserId,
    reasonCode,
    description,
  });
}

/**
 * Report a call
 * 
 * @param callId Call ID
 * @param reportedUserId User being reported
 * @param reasonCode Reason for report
 * @param description Optional description
 */
export async function reportCall(
  callId: string,
  reportedUserId: string,
  reasonCode: TransactionIssueReasonCode,
  description?: string
): Promise<CreateTransactionIssueResult> {
  return createTransactionIssue({
    relatedType: 'CALL',
    relatedId: callId,
    reportedUserId,
    reasonCode,
    description,
  });
}

/**
 * Report chat behavior (not tied to specific transaction)
 * 
 * @param chatId Chat ID
 * @param reportedUserId User being reported
 * @param reasonCode Reason for report
 * @param description Optional description
 */
export async function reportChatBehavior(
  chatId: string,
  reportedUserId: string,
  reasonCode: TransactionIssueReasonCode,
  description?: string
): Promise<CreateTransactionIssueResult> {
  return createTransactionIssue({
    relatedType: 'CHAT',
    chatId,
    reportedUserId,
    reasonCode,
    description,
  });
}

/**
 * Report a message in chat
 * 
 * @param chatId Chat ID
 * @param messageId Message ID (stored in description)
 * @param reportedUserId User being reported
 * @param reasonCode Reason for report
 */
export async function reportMessage(
  chatId: string,
  messageId: string,
  reportedUserId: string,
  reasonCode: TransactionIssueReasonCode
): Promise<CreateTransactionIssueResult> {
  return createTransactionIssue({
    relatedType: 'CHAT',
    chatId,
    reportedUserId,
    reasonCode,
    description: `Message ID: ${messageId}`,
  });
}

/**
 * Report other transaction type
 * 
 * @param reportedUserId User being reported
 * @param reasonCode Reason for report
 * @param description Description of the issue
 * @param relatedId Optional related ID
 */
export async function reportOther(
  reportedUserId: string,
  reasonCode: TransactionIssueReasonCode,
  description: string,
  relatedId?: string
): Promise<CreateTransactionIssueResult> {
  return createTransactionIssue({
    relatedType: 'OTHER',
    relatedId,
    reportedUserId,
    reasonCode,
    description,
  });
}

/**
 * Check if user has already reported a specific transaction
 * (Client-side check - backend also validates)
 * 
 * @param relatedType Type of transaction
 * @param relatedId ID of transaction
 * @param reportedUserId User being reported
 * @returns True if duplicate report exists
 */
export async function hasDuplicateReport(
  relatedType: TransactionIssueRelatedType,
  relatedId: string | undefined,
  reportedUserId: string
): Promise<boolean> {
  try {
    const issues = await getMyTransactionIssues();
    
    return issues.some(
      (issue) =>
        issue.relatedType === relatedType &&
        issue.relatedId === relatedId &&
        issue.reportedUserId === reportedUserId
    );
  } catch (error) {
    console.error('[DisputeService] Error checking duplicate report:', error);
    return false; // Allow attempt if check fails
  }
}