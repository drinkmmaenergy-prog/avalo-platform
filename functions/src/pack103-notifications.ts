/**
 * PACK 103 — Community Governance, Moderation Expansion & Federated Automated Enforcement
 * Notification Integration for Enforcement Messages
 * 
 * NON-NEGOTIABLE RULES:
 * - No free tokens, no bonuses, no discounts, no cashback
 * - No changes to token price or 65/35 revenue split
 * - Enforcement cannot be influenced by payments or user popularity
 * - Moderation actions must be legally, ethically, and procedurally defensible
 * - No moderator identity revealed
 * - No creator vs. consumer favoritism
 * - No negotiation or bargaining context
 * - Neutral, legally compliant explanations only
 */

import { logger } from 'firebase-functions/v2';
import { sendNotification } from './pack92-notifications';
import { getTransparencyMessage } from './pack103-types';

// ============================================================================
// ENFORCEMENT NOTIFICATIONS
// ============================================================================

/**
 * Send enforcement notification with transparency messaging
 * All enforcement notifications are MANDATORY and bypass user settings
 */
export async function sendEnforcementNotification(params: {
  userId: string;
  level: 'SOFT' | 'HARD' | 'SUSPENDED';
  reason: string;
  caseId?: string;
  canAppeal?: boolean;
  appealDeadlineHours?: number;
}): Promise<void> {
  try {
    let title: string;
    let body: string;
    let deepLink: string;

    switch (params.level) {
      case 'SOFT':
        title = 'Account Notice';
        body = "Your account's visibility has been temporarily reduced due to policy violations. You can continue using Avalo while our team reviews the case.";
        deepLink = params.caseId 
          ? `avalo://enforcement/info?caseId=${params.caseId}` 
          : 'avalo://enforcement/info';
        break;

      case 'HARD':
        title = 'Account Restrictions';
        body = 'Your posting privileges are temporarily suspended due to recent safety concerns. You can still view content and message existing conversations.';
        deepLink = params.caseId 
          ? `avalo://enforcement/info?caseId=${params.caseId}` 
          : 'avalo://enforcement/info';
        break;

      case 'SUSPENDED':
        title = 'Account Suspended';
        body = 'Your account has been suspended due to policy violations. You may appeal this decision.';
        deepLink = params.caseId 
          ? `avalo://enforcement/appeal?caseId=${params.caseId}` 
          : 'avalo://enforcement/info';
        break;
    }

    await sendNotification({
      userId: params.userId,
      type: 'ENFORCEMENT',
      category: 'ACCOUNT',
      title,
      body,
      deepLink,
      payload: {
        level: params.level,
        caseId: params.caseId,
        canAppeal: params.canAppeal ?? true,
        appealDeadlineHours: params.appealDeadlineHours,
      },
      forceChannels: ['IN_APP', 'PUSH'], // Mandatory channels for enforcement
    });

    logger.info(`Enforcement notification sent to user ${params.userId}: ${params.level}`);
  } catch (error: any) {
    logger.error(`Error sending enforcement notification to user ${params.userId}`, error);
    // Don't throw - notification failure shouldn't block enforcement
  }
}

/**
 * Send visibility downgrade notification
 */
export async function sendVisibilityDowngradeNotification(params: {
  userId: string;
  tier: 'LOW' | 'HIDDEN';
  durationHours?: number;
  caseId?: string;
}): Promise<void> {
  try {
    const title = 'Visibility Update';
    const body = params.tier === 'HIDDEN'
      ? 'Your profile visibility has been temporarily restricted while we review your account.'
      : "Your profile's visibility in discovery has been temporarily lowered. You can continue using all features.";

    await sendNotification({
      userId: params.userId,
      type: 'ENFORCEMENT',
      category: 'ACCOUNT',
      title,
      body,
      deepLink: params.caseId 
        ? `avalo://enforcement/info?caseId=${params.caseId}` 
        : 'avalo://enforcement/info',
      payload: {
        action: 'VISIBILITY_DOWNGRADE',
        tier: params.tier,
        durationHours: params.durationHours,
        caseId: params.caseId,
      },
      forceChannels: ['IN_APP', 'PUSH'],
    });

    logger.info(`Visibility downgrade notification sent to user ${params.userId}`);
  } catch (error: any) {
    logger.error(`Error sending visibility downgrade notification to user ${params.userId}`, error);
  }
}

/**
 * Send posting freeze notification
 */
export async function sendPostingFreezeNotification(params: {
  userId: string;
  frozen: boolean;
  durationHours?: number;
  caseId?: string;
}): Promise<void> {
  try {
    const title = params.frozen ? 'Posting Restricted' : 'Posting Restored';
    const body = params.frozen
      ? 'Your ability to post new content has been temporarily restricted. You can still view content and message existing conversations.'
      : 'Your posting privileges have been restored. Thank you for your cooperation.';

    await sendNotification({
      userId: params.userId,
      type: 'ENFORCEMENT',
      category: 'ACCOUNT',
      title,
      body,
      deepLink: params.caseId 
        ? `avalo://enforcement/info?caseId=${params.caseId}` 
        : 'avalo://enforcement/info',
      payload: {
        action: params.frozen ? 'POSTING_FREEZE' : 'POSTING_UNFREEZE',
        durationHours: params.durationHours,
        caseId: params.caseId,
      },
      forceChannels: ['IN_APP', 'PUSH'],
    });

    logger.info(`Posting ${params.frozen ? 'freeze' : 'unfreeze'} notification sent to user ${params.userId}`);
  } catch (error: any) {
    logger.error(`Error sending posting freeze notification to user ${params.userId}`, error);
  }
}

/**
 * Send case created notification
 */
export async function sendCaseCreatedNotification(params: {
  userId: string;
  caseId: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}): Promise<void> {
  try {
    const title = 'Account Review';
    const body = 'Some activity related to your account is under review. You may be contacted for more information.';

    await sendNotification({
      userId: params.userId,
      type: 'ENFORCEMENT',
      category: 'ACCOUNT',
      title,
      body,
      deepLink: `avalo://enforcement/info?caseId=${params.caseId}`,
      payload: {
        action: 'CASE_CREATED',
        caseId: params.caseId,
        priority: params.priority,
      },
      forceChannels: ['IN_APP'],
    });

    logger.info(`Case created notification sent to user ${params.userId}`);
  } catch (error: any) {
    logger.error(`Error sending case created notification to user ${params.userId}`, error);
  }
}

/**
 * Send case resolved notification
 */
export async function sendCaseResolvedNotification(params: {
  userId: string;
  caseId: string;
  outcome: 'NO_ACTION' | 'WARNING' | 'TEMPORARY_RESTRICTION' | 'PERMANENT_RESTRICTION' | 'SUSPENSION';
  message?: string;
}): Promise<void> {
  try {
    let title: string;
    let body: string;

    switch (params.outcome) {
      case 'NO_ACTION':
        title = 'Review Complete';
        body = 'Our review is complete. No action was required on your account.';
        break;
      case 'WARNING':
        title = 'Warning Issued';
        body = 'We reviewed your account and issued a warning. Please review our community guidelines.';
        break;
      case 'TEMPORARY_RESTRICTION':
        title = 'Temporary Restrictions Applied';
        body = params.message || 'Temporary restrictions have been applied to your account. These will be lifted after the review period.';
        break;
      case 'PERMANENT_RESTRICTION':
        title = 'Account Restrictions';
        body = params.message || 'Permanent restrictions have been applied to your account. You may appeal this decision.';
        break;
      case 'SUSPENSION':
        title = 'Account Suspended';
        body = params.message || 'Your account has been suspended. You may appeal this decision within 30 days.';
        break;
    }

    await sendNotification({
      userId: params.userId,
      type: 'ENFORCEMENT',
      category: 'ACCOUNT',
      title,
      body,
      deepLink: params.outcome === 'NO_ACTION'
        ? 'avalo://home'
        : `avalo://enforcement/info?caseId=${params.caseId}`,
      payload: {
        action: 'CASE_RESOLVED',
        caseId: params.caseId,
        outcome: params.outcome,
      },
      forceChannels: ['IN_APP', 'PUSH'],
    });

    logger.info(`Case resolved notification sent to user ${params.userId}`);
  } catch (error: any) {
    logger.error(`Error sending case resolved notification to user ${params.userId}`, error);
  }
}

/**
 * Send appeal status notification
 */
export async function sendAppealStatusNotification(params: {
  userId: string;
  appealId: string;
  caseId: string;
  status: 'APPROVED' | 'REJECTED';
  decision: 'UPHELD' | 'OVERTURNED' | 'MODIFIED';
  explanation?: string;
}): Promise<void> {
  try {
    let title: string;
    let body: string;

    if (params.status === 'APPROVED') {
      if (params.decision === 'OVERTURNED') {
        title = 'Appeal Approved';
        body = 'Your appeal has been approved. Restrictions on your account have been removed.';
      } else if (params.decision === 'MODIFIED') {
        title = 'Appeal Partially Approved';
        body = 'Your appeal has been reviewed and some restrictions have been modified. Check the details for more information.';
      } else {
        title = 'Appeal Decision';
        body = params.explanation || 'Your appeal has been reviewed. Please check the details for more information.';
      }
    } else {
      title = 'Appeal Decision';
      body = params.explanation || 'Your appeal has been reviewed. The original decision has been upheld.';
    }

    await sendNotification({
      userId: params.userId,
      type: 'ENFORCEMENT',
      category: 'ACCOUNT',
      title,
      body,
      deepLink: `avalo://enforcement/appeal?appealId=${params.appealId}&caseId=${params.caseId}`,
      payload: {
        action: 'APPEAL_DECISION',
        appealId: params.appealId,
        caseId: params.caseId,
        status: params.status,
        decision: params.decision,
      },
      forceChannels: ['IN_APP', 'PUSH'],
    });

    logger.info(`Appeal status notification sent to user ${params.userId}`);
  } catch (error: any) {
    logger.error(`Error sending appeal status notification to user ${params.userId}`, error);
  }
}

/**
 * Send KYC priority review notification
 */
export async function sendKYCPriorityReviewNotification(params: {
  userId: string;
  reason: string;
  caseId?: string;
}): Promise<void> {
  try {
    const title = 'Identity Verification Required';
    const body = 'Please complete identity verification to continue using certain features. This is required for security purposes.';

    await sendNotification({
      userId: params.userId,
      type: 'KYC',
      category: 'ACCOUNT',
      title,
      body,
      deepLink: 'avalo://kyc',
      payload: {
        action: 'KYC_PRIORITY_REVIEW',
        reason: params.reason,
        caseId: params.caseId,
      },
      forceChannels: ['IN_APP', 'PUSH'],
    });

    logger.info(`KYC priority review notification sent to user ${params.userId}`);
  } catch (error: any) {
    logger.error(`Error sending KYC priority review notification to user ${params.userId}`, error);
  }
}

/**
 * Send moderator suspended notification (internal)
 */
export async function sendModeratorSuspendedNotification(params: {
  moderatorId: string;
  reason: string;
  caseId: string;
}): Promise<void> {
  try {
    const title = 'Moderation Role Suspended';
    const body = 'Your moderation role has been temporarily suspended pending review. You can still use Avalo as a regular user.';

    await sendNotification({
      userId: params.moderatorId,
      type: 'ENFORCEMENT',
      category: 'ACCOUNT',
      title,
      body,
      deepLink: `avalo://enforcement/info?caseId=${params.caseId}`,
      payload: {
        action: 'MODERATOR_SUSPENDED',
        reason: params.reason,
        caseId: params.caseId,
      },
      forceChannels: ['IN_APP', 'PUSH'],
    });

    logger.info(`Moderator suspended notification sent to ${params.moderatorId}`);
  } catch (error: any) {
    logger.error(`Error sending moderator suspended notification to ${params.moderatorId}`, error);
  }
}

// ============================================================================
// BATCH NOTIFICATIONS
// ============================================================================

/**
 * Send batch notifications for enforcement actions
 * Used when applying enforcement to multiple users
 */
export async function sendBatchEnforcementNotifications(
  userIds: string[],
  level: 'SOFT' | 'HARD' | 'SUSPENDED',
  reason: string
): Promise<void> {
  try {
    logger.info(`Sending batch enforcement notifications to ${userIds.length} users`);

    const notifications = userIds.map(userId =>
      sendEnforcementNotification({ userId, level, reason }).catch(error => {
        logger.error(`Failed to send notification to ${userId}`, error);
      })
    );

    await Promise.all(notifications);

    logger.info(`Batch enforcement notifications completed for ${userIds.length} users`);
  } catch (error: any) {
    logger.error('Error sending batch enforcement notifications', error);
  }
}