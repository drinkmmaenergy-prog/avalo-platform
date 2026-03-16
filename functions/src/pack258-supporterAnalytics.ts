import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 258 — SUPPORTER ANALYTICS CLOUD FUNCTIONS
 * Automated functions for tracking, notifications, and retention
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp } from './init';
import {
  trackTokenSpending,
  sendEmotionalNotification,
  processRetentionTriggers,
  resetMonthlySpending,
} from './supporterAnalytics';
import { HttpsError, auth, logger, onCall, timestamp, onSchedule, onDocumentCreated, onDocumentUpdated } from './runtime';

// ============================================================================
// FIRESTORE TRIGGERS
// ============================================================================

/**
 * Track token spending when wallet transactions occur
 * Triggered on new transaction creation
 */
export const onTokenSpending = onDocumentCreated('walletTransactions/{transactionId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const transaction = snap.data();

    // Only track spending transactions (negative amounts from supporter)
    if (transaction.type !== 'spend' || transaction.amount >= 0) {
      return;
    }

    const supporterId = transaction.userId;
    const earnerId = transaction.recipientId || transaction.metadata?.earnerId;
    const tokensSpent = Math.abs(transaction.amount);
    
    if (!earnerId) {
      functions.logger.warn('No earner ID found in transaction', { transactionId: snap.id });
      return;
    }

    const source = transaction.metadata?.source || 'unknown';
    const validSources = ['chat', 'media', 'gift', 'boost', 'call', 'meeting'];
    const transactionSource = validSources.includes(source) ? source : 'gift';

    try {
      await trackTokenSpending(supporterId, earnerId, tokensSpent, {
        source: transactionSource as any,
        metadata: {
          transactionId: snap.id,
          timestamp: transaction.timestamp,
          ...transaction.metadata,
        },
      });

      functions.logger.info('Tracked token spending', {
        supporterId,
        earnerId,
        tokensSpent,
        source: transactionSource,
      });

      return;
    } catch (error) {
      functions.logger.error('Error tracking token spending', { error, transactionId: snap.id });
      throw error;
    }
  });

/**
 * Send notification when earner views supporter's profile
 */
export const onCreatorViewsProfile = onDocumentCreated('profileViews/{viewId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const view = snap.data();
    const viewerId = view.viewerId;
    const profileId = view.profileId;

    // Check if viewer is a earner (has earnOnChat enabled)
    const viewerDoc = await snap.ref.firestore.collection('users').doc(viewerId).get();
    if (!viewerDoc.exists) return;

    const viewerData = viewerDoc.data();
    if (!viewerData?.earnOnChat) {
      return; // Only send notification if viewer is a earner
    }

    try {
      await sendEmotionalNotification(
        profileId,
        viewerId,
        'earner_viewed_profile'
      );

      functions.logger.info('Sent earner viewed profile notification', {
        supporterId: profileId,
        earnerId: viewerId,
      });

      return;
    } catch (error) {
      functions.logger.error('Error sending profile view notification', { error });
      return;
    }
  });

/**
 * Send notification when earner comes online
 */
export const onCreatorOnlineStatus = onDocumentUpdated('userPresence/{userId}', async (event) => {
  const change = event.data;
  if (!change) return;
    const before = change.before.data();
    const after = change.after.data();
    const earnerId = event.params.userId;

    // Check if user just came online
    if (before.status !== 'online' && after.status === 'online') {
      // Get earner's top supporters
      const fanLevelsSnapshot = await change.after.ref.firestore
        .collection('fanLevels')
        .where('earnerId', '==', earnerId)
        .where('level', '>=', 3) // Only notify Big Fan and above
        .orderBy('level', 'desc')
        .limit(10)
        .get();

      const notifications: Promise<any>[] = [];

      for (const fanDoc of fanLevelsSnapshot.docs) {
        const fanData = fanDoc.data();
        notifications.push(
          sendEmotionalNotification(
            fanData.supporterId,
            earnerId,
            'earner_online'
          )
        );
      }

      await Promise.allSettled(notifications);

      functions.logger.info('Sent earner online notifications', {
        earnerId,
        notificationCount: notifications.length,
      });
    }

    return;
  });

/**
 * Send notification when earner posts new story
 */
export const onNewStory = onDocumentCreated('stories/{storyId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const story = snap.data();
    const earnerId = story.userId;

    // Get earner's top supporters (L3+)
    const fanLevelsSnapshot = await snap.ref.firestore
      .collection('fanLevels')
      .where('earnerId', '==', earnerId)
      .where('level', '>=', 3)
      .orderBy('level', 'desc')
      .limit(20)
      .get();

    const notifications: Promise<any>[] = [];

    for (const fanDoc of fanLevelsSnapshot.docs) {
      const fanData = fanDoc.data();
      notifications.push(
        sendEmotionalNotification(
          fanData.supporterId,
          earnerId,
          'earner_new_story'
        )
      );
    }

    await Promise.allSettled(notifications);

    functions.logger.info('Sent new story notifications', {
      earnerId,
      storyId: snap.id,
      notificationCount: notifications.length,
    });

    return;
  });

/**
 * Send notification when earner posts paid media
 */
export const onNewPaidMedia = onDocumentCreated('paidMedia/{mediaId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const media = snap.data();
    const earnerId = media.earnerId;

    // Get earner's top supporters (L3+)
    const fanLevelsSnapshot = await snap.ref.firestore
      .collection('fanLevels')
      .where('earnerId', '==', earnerId)
      .where('level', '>=', 3)
      .orderBy('level', 'desc')
      .limit(20)
      .get();

    const notifications: Promise<any>[] = [];

    for (const fanDoc of fanLevelsSnapshot.docs) {
      const fanData = fanDoc.data();
      notifications.push(
        sendEmotionalNotification(
          fanData.supporterId,
          earnerId,
          'earner_new_media'
        )
      );
    }

    await Promise.allSettled(notifications);

    functions.logger.info('Sent new media notifications', {
      earnerId,
      mediaId: snap.id,
      notificationCount: notifications.length,
    });

    return;
  });

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

/**
 * Process retention triggers every 6 hours
 * Sends notifications to inactive supporters
 */
export const processRetentionTriggersScheduled = onSchedule("every 6 hours", async (event) => {
    try {
      const triggersProcessed = await processRetentionTriggers();
      
      functions.logger.info('Processed retention triggers', {
        triggersProcessed,
        timestamp: new Date().toISOString(),
      });

      return;
    } catch (error) {
      functions.logger.error('Error processing retention triggers', { error });
      throw error;
    }
  });

/**
 * Reset monthly spending at the start of each month
 * Runs on the 1st of every month at 00:00 UTC
 */
export const resetMonthlySpendingScheduled = onSchedule({ schedule: "0 0 1 * *", timeZone: "UTC" }, async (event) => {
    try {
      const resetCount = await resetMonthlySpending();
      
      functions.logger.info('Reset monthly spending', {
        resetCount,
        timestamp: new Date().toISOString(),
      });

      return;
    } catch (error) {
      functions.logger.error('Error resetting monthly spending', { error });
      throw error;
    }
  });

// ============================================================================
// HTTP CALLABLE FUNCTIONS
// ============================================================================

/**
 * Get supporter analytics (callable from client)
 */
export const getSupporterAnalytics = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = request.auth.uid;

  try {
    const analyticsDoc = await db
      .collection('supporterAnalytics')
      .doc(userId)
      .get();

    if (!analyticsDoc.exists) {
      return;
    }

    return analyticsDoc.data();
  } catch (error) {
    functions.logger.error('Error getting supporter analytics', { error, userId });
    throw new functions.https.HttpsError('internal', 'Failed to get supporter analytics');
  }
});

/**
 * Get fan level with a specific earner (callable from client)
 */
export const getFanLevel = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const supporterId = request.auth.uid;
  const { earnerId } = data;

  if (!earnerId) {
    throw new functions.https.HttpsError('invalid-argument', 'earnerId is required');
  }

  try {
    const levelId = `${supporterId}_${earnerId}`;
    const fanLevelDoc = await db
      .collection('fanLevels')
      .doc(levelId)
      .get();

    if (!fanLevelDoc.exists) {
      return;
    }

    return fanLevelDoc.data();
  } catch (error) {
    functions.logger.error('Error getting fan level', { error, supporterId, earnerId });
    throw new functions.https.HttpsError('internal', 'Failed to get fan level');
  }
});

/**
 * Mark notification as read (callable from client)
 */
export const markNotificationRead = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = request.auth.uid;
  const { notificationId } = data;

  if (!notificationId) {
    throw new functions.https.HttpsError('invalid-argument', 'notificationId is required');
  }

  try {
    const notificationRef = db
      .collection('supporterNotifications')
      .doc(notificationId);

    const notificationDoc = await notificationRef.get();

    if (!notificationDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Notification not found');
    }

    const notificationData = notificationDoc.data();
    
    if (notificationData?.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Not authorized to update this notification');
    }

    await notificationRef.update({
      read: true,
      readAt: serverTimestamp(),
    });

    console.log('Scheduled job result:', { success: true });


    return;
  } catch (error) {
    functions.logger.error('Error marking notification as read', { error, userId, notificationId });
    throw new functions.https.HttpsError('internal', 'Failed to mark notification as read');
  }
});























