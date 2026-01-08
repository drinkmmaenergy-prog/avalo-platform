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

// ============================================================================
// FIRESTORE TRIGGERS
// ============================================================================

/**
 * Track token spending when wallet transactions occur
 * Triggered on new transaction creation
 */
export const onTokenSpending = functions.firestore
  .document('walletTransactions/{transactionId}')
  .onCreate(async (snap, context) => {
    const transaction = snap.data();

    // Only track spending transactions (negative amounts from supporter)
    if (transaction.type !== 'spend' || transaction.amount >= 0) {
      return null;
    }

    const supporterId = transaction.userId;
    const creatorId = transaction.recipientId || transaction.metadata?.creatorId;
    const tokensSpent = Math.abs(transaction.amount);
    
    if (!creatorId) {
      functions.logger.warn('No creator ID found in transaction', { transactionId: snap.id });
      return null;
    }

    const source = transaction.metadata?.source || 'unknown';
    const validSources = ['chat', 'media', 'gift', 'boost', 'call', 'meeting'];
    const transactionSource = validSources.includes(source) ? source : 'gift';

    try {
      await trackTokenSpending(supporterId, creatorId, tokensSpent, {
        source: transactionSource as any,
        metadata: {
          transactionId: snap.id,
          timestamp: transaction.timestamp,
          ...transaction.metadata,
        },
      });

      functions.logger.info('Tracked token spending', {
        supporterId,
        creatorId,
        tokensSpent,
        source: transactionSource,
      });

      return null;
    } catch (error) {
      functions.logger.error('Error tracking token spending', { error, transactionId: snap.id });
      throw error;
    }
  });

/**
 * Send notification when creator views supporter's profile
 */
export const onCreatorViewsProfile = functions.firestore
  .document('profileViews/{viewId}')
  .onCreate(async (snap, context) => {
    const view = snap.data();
    const viewerId = view.viewerId;
    const profileId = view.profileId;

    // Check if viewer is a creator (has earnOnChat enabled)
    const viewerDoc = await snap.ref.firestore.collection('users').doc(viewerId).get();
    if (!viewerDoc.exists) return null;

    const viewerData = viewerDoc.data();
    if (!viewerData?.earnOnChat) {
      return null; // Only send notification if viewer is a creator
    }

    try {
      await sendEmotionalNotification(
        profileId,
        viewerId,
        'creator_viewed_profile'
      );

      functions.logger.info('Sent creator viewed profile notification', {
        supporterId: profileId,
        creatorId: viewerId,
      });

      return null;
    } catch (error) {
      functions.logger.error('Error sending profile view notification', { error });
      return null;
    }
  });

/**
 * Send notification when creator comes online
 */
export const onCreatorOnlineStatus = functions.firestore
  .document('userPresence/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const creatorId = context.params.userId;

    // Check if user just came online
    if (before.status !== 'online' && after.status === 'online') {
      // Get creator's top supporters
      const fanLevelsSnapshot = await change.after.ref.firestore
        .collection('fanLevels')
        .where('creatorId', '==', creatorId)
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
            creatorId,
            'creator_online'
          )
        );
      }

      await Promise.allSettled(notifications);

      functions.logger.info('Sent creator online notifications', {
        creatorId,
        notificationCount: notifications.length,
      });
    }

    return null;
  });

/**
 * Send notification when creator posts new story
 */
export const onNewStory = functions.firestore
  .document('stories/{storyId}')
  .onCreate(async (snap, context) => {
    const story = snap.data();
    const creatorId = story.userId;

    // Get creator's top supporters (L3+)
    const fanLevelsSnapshot = await snap.ref.firestore
      .collection('fanLevels')
      .where('creatorId', '==', creatorId)
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
          creatorId,
          'creator_new_story'
        )
      );
    }

    await Promise.allSettled(notifications);

    functions.logger.info('Sent new story notifications', {
      creatorId,
      storyId: snap.id,
      notificationCount: notifications.length,
    });

    return null;
  });

/**
 * Send notification when creator posts paid media
 */
export const onNewPaidMedia = functions.firestore
  .document('paidMedia/{mediaId}')
  .onCreate(async (snap, context) => {
    const media = snap.data();
    const creatorId = media.creatorId;

    // Get creator's top supporters (L3+)
    const fanLevelsSnapshot = await snap.ref.firestore
      .collection('fanLevels')
      .where('creatorId', '==', creatorId)
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
          creatorId,
          'creator_new_media'
        )
      );
    }

    await Promise.allSettled(notifications);

    functions.logger.info('Sent new media notifications', {
      creatorId,
      mediaId: snap.id,
      notificationCount: notifications.length,
    });

    return null;
  });

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

/**
 * Process retention triggers every 6 hours
 * Sends notifications to inactive supporters
 */
export const processRetentionTriggersScheduled = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async (context) => {
    try {
      const triggersProcessed = await processRetentionTriggers();
      
      functions.logger.info('Processed retention triggers', {
        triggersProcessed,
        timestamp: new Date().toISOString(),
      });

      return null;
    } catch (error) {
      functions.logger.error('Error processing retention triggers', { error });
      throw error;
    }
  });

/**
 * Reset monthly spending at the start of each month
 * Runs on the 1st of every month at 00:00 UTC
 */
export const resetMonthlySpendingScheduled = functions.pubsub
  .schedule('0 0 1 * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    try {
      const resetCount = await resetMonthlySpending();
      
      functions.logger.info('Reset monthly spending', {
        resetCount,
        timestamp: new Date().toISOString(),
      });

      return null;
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
export const getSupporterAnalytics = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    const analyticsDoc = await db
      .collection('supporterAnalytics')
      .doc(userId)
      .get();

    if (!analyticsDoc.exists) {
      return null;
    }

    return analyticsDoc.data();
  } catch (error) {
    functions.logger.error('Error getting supporter analytics', { error, userId });
    throw new functions.https.HttpsError('internal', 'Failed to get supporter analytics');
  }
});

/**
 * Get fan level with a specific creator (callable from client)
 */
export const getFanLevel = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const supporterId = context.auth.uid;
  const { creatorId } = data;

  if (!creatorId) {
    throw new functions.https.HttpsError('invalid-argument', 'creatorId is required');
  }

  try {
    const levelId = `${supporterId}_${creatorId}`;
    const fanLevelDoc = await db
      .collection('fanLevels')
      .doc(levelId)
      .get();

    if (!fanLevelDoc.exists) {
      return null;
    }

    return fanLevelDoc.data();
  } catch (error) {
    functions.logger.error('Error getting fan level', { error, supporterId, creatorId });
    throw new functions.https.HttpsError('internal', 'Failed to get fan level');
  }
});

/**
 * Mark notification as read (callable from client)
 */
export const markNotificationRead = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
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

    return { success: true };
  } catch (error) {
    functions.logger.error('Error marking notification as read', { error, userId, notificationId });
    throw new functions.https.HttpsError('internal', 'Failed to mark notification as read');
  }
});