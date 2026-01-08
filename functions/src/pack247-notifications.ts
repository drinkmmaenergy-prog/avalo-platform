/**
 * PACK 247 — Withdrawal Review Notification System
 * Sends notifications to users about withdrawal status changes
 */

import { db, serverTimestamp, generateId } from './init';
import { logger } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

interface WithdrawalNotification {
  userId: string;
  type: 'withdrawal_paused' | 'withdrawal_approved' | 'withdrawal_rejected' | 'withdrawal_review_update';
  title: string;
  message: string;
  data: {
    withdrawalRequestId?: string;
    amount?: number;
    pauseDurationHours?: number;
    riskLevel?: string;
  };
  priority: 'high' | 'normal';
  read: boolean;
  createdAt: any;
}

// ============================================================================
// NOTIFICATION CREATORS
// ============================================================================

/**
 * Send notification when withdrawal is paused
 */
export async function notifyWithdrawalPaused(params: {
  userId: string;
  requestId: string;
  amount: number;
  pauseDurationHours: number;
  reason: string;
}): Promise<void> {
  const { userId, requestId, amount, pauseDurationHours, reason } = params;

  const notification: Omit<WithdrawalNotification, 'createdAt'> = {
    userId,
    type: 'withdrawal_paused',
    title: 'Withdrawal Under Review',
    message: reason,
    data: {
      withdrawalRequestId: requestId,
      amount,
      pauseDurationHours,
    },
    priority: 'high',
    read: false,
  };

  await db.collection('notifications').add({
    ...notification,
    createdAt: serverTimestamp(),
  });

  logger.info(`Sent withdrawal paused notification to user ${userId}`);
}

/**
 * Send notification when withdrawal is approved
 */
export async function notifyWithdrawalApproved(params: {
  userId: string;
  requestId: string;
  amount: number;
}): Promise<void> {
  const { userId, requestId, amount } = params;

  const notification: Omit<WithdrawalNotification, 'createdAt'> = {
    userId,
    type: 'withdrawal_approved',
    title: 'Withdrawal Approved',
    message: `Your withdrawal of ${amount} tokens has been approved and is being processed.`,
    data: {
      withdrawalRequestId: requestId,
      amount,
    },
    priority: 'normal',
    read: false,
  };

  await db.collection('notifications').add({
    ...notification,
    createdAt: serverTimestamp(),
  });

  logger.info(`Sent withdrawal approved notification to user ${userId}`);
}

/**
 * Send notification when withdrawal is rejected
 */
export async function notifyWithdrawalRejected(params: {
  userId: string;
  requestId: string;
  amount: number;
  reason: string;
}): Promise<void> {
  const { userId, requestId, amount, reason } = params;

  const notification: Omit<WithdrawalNotification, 'createdAt'> = {
    userId,
    type: 'withdrawal_rejected',
    title: 'Withdrawal Rejected',
    message: `Your withdrawal request for ${amount} tokens was rejected. Reason: ${reason}`,
    data: {
      withdrawalRequestId: requestId,
      amount,
    },
    priority: 'high',
    read: false,
  };

  await db.collection('notifications').add({
    ...notification,
    createdAt: serverTimestamp(),
  });

  logger.info(`Sent withdrawal rejected notification to user ${userId}`);
}

/**
 * Send notification when review status updates
 */
export async function notifyReviewUpdate(params: {
  userId: string;
  requestId: string;
  status: string;
  message: string;
}): Promise<void> {
  const { userId, requestId, status, message } = params;

  const notification: Omit<WithdrawalNotification, 'createdAt'> = {
    userId,
    type: 'withdrawal_review_update',
    title: 'Withdrawal Review Update',
    message,
    data: {
      withdrawalRequestId: requestId,
    },
    priority: 'normal',
    read: false,
  };

  await db.collection('notifications').add({
    ...notification,
    createdAt: serverTimestamp(),
  });

  logger.info(`Sent review update notification to user ${userId}`);
}

// ============================================================================
// FIRESTORE TRIGGERS
// ============================================================================

/**
 * Monitor withdrawal request status changes and send notifications
 */
export const onWithdrawalRequestStatusChange = onDocumentWritten(
  {
    document: 'withdrawalRequests/{requestId}',
    region: 'europe-west3',
  },
  async (event) => {
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();

    // Skip if document was deleted or no change
    if (!afterData || !event.data?.after?.exists) {
      return;
    }

    const requestId = event.params.requestId;
    const userId = afterData.userId;
    const amount = afterData.amount;

    // Check if status changed
    const statusChanged = beforeData?.status !== afterData.status;
    if (!statusChanged) {
      return;
    }

    // Send appropriate notification based on new status
    try {
      switch (afterData.status) {
        case 'PAUSED':
          await notifyWithdrawalPaused({
            userId,
            requestId,
            amount,
            pauseDurationHours: afterData.pauseDurationHours || 24,
            reason: afterData.pauseReason || 'Your withdrawal is being reviewed for security.',
          });
          break;

        case 'APPROVED':
          await notifyWithdrawalApproved({
            userId,
            requestId,
            amount,
          });
          break;

        case 'REJECTED':
          await notifyWithdrawalRejected({
            userId,
            requestId,
            amount,
            reason: afterData.rejectionReason || 'Please contact support for more information.',
          });
          break;

        case 'COMPLETED':
          // Send completion notification
          await db.collection('notifications').add({
            userId,
            type: 'withdrawal_completed',
            title: 'Withdrawal Completed',
            message: `Your withdrawal of ${amount} tokens has been completed successfully.`,
            data: {
              withdrawalRequestId: requestId,
              amount,
            },
            priority: 'normal',
            read: false,
            createdAt: serverTimestamp(),
          });
          break;
      }
    } catch (error) {
      logger.error('Failed to send withdrawal notification:', error);
    }

    return null;
  }
);

/**
 * Monitor withdrawal review status changes
 */
export const onWithdrawalReviewStatusChange = onDocumentWritten(
  {
    document: 'withdrawalReviews/{reviewId}',
    region: 'europe-west3',
  },
  async (event) => {
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();

    if (!afterData || !event.data?.after?.exists) {
      return;
    }

    const reviewId = event.params.reviewId;
    const userId = afterData.userId;

    // Check if status or assignment changed
    const statusChanged = beforeData?.status !== afterData.status;
    const assignmentChanged = beforeData?.assignedTo !== afterData.assignedTo;

    if (!statusChanged && !assignmentChanged) {
      return;
    }

    try {
      if (statusChanged) {
        let message = '';
        
        switch (afterData.status) {
          case 'PENDING':
            message = 'Your withdrawal is under manual review by our security team.';
            break;
          case 'APPROVED':
            message = 'Your withdrawal review has been approved. Processing will begin shortly.';
            break;
          case 'REJECTED':
            message = afterData.reviewNotes || 'Your withdrawal review was not approved. Please contact support.';
            break;
        }

        if (message) {
          await notifyReviewUpdate({
            userId,
            requestId: afterData.withdrawalRequestId || reviewId,
            status: afterData.status,
            message,
          });
        }
      } else if (assignmentChanged && afterData.assignedTo) {
        // Notify user that review is being processed
        await notifyReviewUpdate({
          userId,
          requestId: afterData.withdrawalRequestId || reviewId,
          status: 'IN_PROGRESS',
          message: 'Your withdrawal review is now being processed by our team.',
        });
      }
    } catch (error) {
      logger.error('Failed to send review notification:', error);
    }

    return null;
  }
);

/**
 * Send push notification if user has FCM token
 */
async function sendPushNotification(params: {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<void> {
  const { userId, title, body, data } = params;

  try {
    // Get user's FCM tokens - this depends on your FCM setup
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (!userData?.fcmTokens || userData.fcmTokens.length === 0) {
      return; // No FCM tokens registered
    }

    // Import Firebase Admin Messaging (if available)
    // This is a placeholder - actual implementation depends on your FCM setup
    const { getMessaging } = await import('firebase-admin/messaging');
    const messaging = getMessaging();

    // Send to all registered tokens
    const tokens = userData.fcmTokens as string[];
    await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title,
        body,
      },
      data: data || {},
      android: {
        priority: 'high',
      },
      apns: {
        headers: {
          'apns-priority': '10',
        },
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    });

    logger.info(`Sent push notification to user ${userId}`);
  } catch (error) {
    logger.error('Failed to send push notification:', error);
    // Don't throw - push notifications are optional
  }
}

/**
 * Helper: Get notification preference
 */
async function shouldSendNotification(userId: string, type: string): Promise<boolean> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    // Check user's notification preferences
    const prefs = userData?.notificationPreferences || {};
    
    // Default to true if not explicitly disabled
    return prefs[type] !== false;
  } catch (error) {
    // Default to true on error
    return true;
  }
}