/**
 * PACK 169 - Notification System Cloud Functions
 * HTTP endpoints and scheduled functions
 */

import * as functions from 'firebase-functions';
import { notificationEngine } from './engine';
import { reminderEngine } from './reminders';
import { digestEngine } from './digests';
import { settingsManager } from './settings';
import { db } from '../init';
import { Notification } from './types';

/**
 * Send a notification
 */
export const sendNotification = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { category, priority, title, body, targetUserId, actionUrl, imageUrl, channels } = data;

  // If targetUserId is provided, only admins can send to other users
  const recipientId = targetUserId || context.auth.uid;
  if (targetUserId && context.auth.uid !== targetUserId) {
    // Check admin status
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || !userDoc.data()?.isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can send notifications to other users'
      );
    }
  }

  const result = await notificationEngine.sendNotification({
    userId: recipientId,
    category,
    priority: priority || 'medium',
    title,
    body,
    actionUrl,
    imageUrl,
    channels,
  });

  if (!result.success) {
    throw new functions.https.HttpsError('internal', result.reason || 'Failed to send notification');
  }

  return { notificationId: result.notificationId };
});

/**
 * Get user notifications
 */
export const getUserNotifications = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { limit = 50, category, unreadOnly = false } = data;

  let query = db
    .collection('notifications')
    .where('userId', '==', context.auth.uid)
    .where('archived', '==', false)
    .orderBy('createdAt', 'desc')
    .limit(limit);

  if (category) {
    query = query.where('category', '==', category);
  }

  if (unreadOnly) {
    query = query.where('read', '==', false);
  }

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => doc.data());
});

/**
 * Mark notification as read
 */
export const markNotificationRead = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { notificationId } = data;

  const notificationRef = db.collection('notifications').doc(notificationId);
  const notificationDoc = await notificationRef.get();

  if (!notificationDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Notification not found');
  }

  const notification = notificationDoc.data() as Notification;
  if (notification.userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not your notification');
  }

  await notificationRef.update({
    read: true,
    readAt: new Date(),
  });

  return { success: true };
});

/**
 * Mark all notifications as read
 */
export const markAllNotificationsRead = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const snapshot = await db
    .collection('notifications')
    .where('userId', '==', context.auth.uid)
    .where('read', '==', false)
    .limit(100)
    .get();

  const batch = db.batch();
  const now = new Date();

  for (const doc of snapshot.docs) {
    batch.update(doc.ref, {
      read: true,
      readAt: now,
    });
  }

  await batch.commit();

  return { success: true, count: snapshot.size };
});

/**
 * Archive notification
 */
export const archiveNotification = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { notificationId } = data;

  const notificationRef = db.collection('notifications').doc(notificationId);
  const notificationDoc = await notificationRef.get();

  if (!notificationDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Notification not found');
  }

  const notification = notificationDoc.data() as Notification;
  if (notification.userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not your notification');
  }

  await notificationRef.update({
    archived: true,
  });

  return { success: true };
});

/**
 * Get notification settings
 */
export const getNotificationSettings = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const settings = await settingsManager.getSettings(context.auth.uid);
  return settings;
});

/**
 * Update notification settings
 */
export const updateNotificationSettings = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  await settingsManager.updateSettings(context.auth.uid, data.updates);
  return { success: true };
});

/**
 * Toggle category notifications
 */
export const toggleCategoryNotifications = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { category, enabled } = data;

  await settingsManager.toggleCategory(context.auth.uid, category, enabled);
  return { success: true };
});

/**
 * Set snooze mode
 */
export const setSnoozeMode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { duration } = data;

  await settingsManager.setSnoozeMode(context.auth.uid, duration || null);
  return { success: true };
});

/**
 * Create reminder
 */
export const createReminder = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const reminderId = await reminderEngine.createReminder({
    userId: context.auth.uid,
    ...data,
  });

  return { reminderId };
});

/**
 * Get user reminders
 */
export const getUserReminders = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const reminders = await reminderEngine.getUserReminders(context.auth.uid);
  return reminders;
});

/**
 * Update reminder
 */
export const updateReminder = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { reminderId, updates } = data;

  // Verify ownership
  const reminderDoc = await db.collection('reminder_rules').doc(reminderId).get();
  if (!reminderDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Reminder not found');
  }

  const reminder = reminderDoc.data();
  if (reminder?.userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not your reminder');
  }

  await reminderEngine.updateReminder(reminderId, updates);
  return { success: true };
});

/**
 * Delete reminder
 */
export const deleteReminder = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { reminderId } = data;

  // Verify ownership
  const reminderDoc = await db.collection('reminder_rules').doc(reminderId).get();
  if (!reminderDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Reminder not found');
  }

  const reminder = reminderDoc.data();
  if (reminder?.userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not your reminder');
  }

  await reminderEngine.deleteReminder(reminderId);
  return { success: true };
});

/**
 * Get user digests
 */
export const getUserDigests = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { limit = 10 } = data;
  const digests = await digestEngine.getUserDigests(context.auth.uid, limit);
  return digests;
});

/**
 * SCHEDULED: Process due reminders (runs every 5 minutes)
 */
export const processReminders = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context) => {
    await reminderEngine.processDueReminders();
    return null;
  });

/**
 * SCHEDULED: Generate daily digests (runs at 8:00 AM UTC)
 */
export const generateDailyDigests = functions.pubsub
  .schedule('0 8 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    // Get all users with digest settings
    const usersSnapshot = await db.collection('notification_settings').get();

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      try {
        await digestEngine.generateDailyDigest(userId);
      } catch (error) {
        console.error(`Failed to generate daily digest for user ${userId}:`, error);
      }
    }

    return null;
  });

/**
 * SCHEDULED: Generate weekly digests (runs on Monday at 8:00 AM UTC)
 */
export const generateWeeklyDigests = functions.pubsub
  .schedule('0 8 * * 1')
  .timeZone('UTC')
  .onRun(async (context) => {
    const usersSnapshot = await db.collection('notification_settings').get();

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      try {
        await digestEngine.generateWeeklyDigest(userId);
      } catch (error) {
        console.error(`Failed to generate weekly digest for user ${userId}:`, error);
      }
    }

    return null;
  });

/**
 * SCHEDULED: Reset paused reminders (runs daily at midnight UTC)
 */
export const resetPausedReminders = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    await reminderEngine.resetDailyPausedReminders();
    return null;
  });

/**
 * SCHEDULED: Clean up old digests (runs weekly)
 */
export const cleanupOldDigests = functions.pubsub
  .schedule('0 2 * * 0')
  .timeZone('UTC')
  .onRun(async (context) => {
    await digestEngine.cleanupOldDigests();
    return null;
  });

/**
 * SCHEDULED: Clean up old notifications (runs weekly)
 */
export const cleanupOldNotifications = functions.pubsub
  .schedule('0 3 * * 0')
  .timeZone('UTC')
  .onRun(async (context) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90); // Keep 90 days

    const snapshot = await db
      .collection('notifications')
      .where('createdAt', '<', cutoffDate)
      .where('read', '==', true)
      .limit(500)
      .get();

    const batch = db.batch();

    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }

    await batch.commit();
    console.log(`Cleaned up ${snapshot.size} old notifications`);

    return null;
  });