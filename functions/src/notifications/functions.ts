import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

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
import { HttpsError, admin, auth, onCall, logger, onSchedule } from '../runtime';

/**
 * Send a notification
 */
export const sendNotification = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { category, priority, title, body, targetUserId, actionUrl, imageUrl, channels } = data;

  // If targetUserId is provided, only admins can send to other users
  const recipientId = targetUserId || request.auth.uid;
  if (targetUserId && request.auth.uid !== targetUserId) {
    // Check admin status
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
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

  console.log('Scheduled job result:', { notificationId: result.notificationId });


  return;
});

/**
 * Get user notifications
 */
export const getUserNotifications = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { limit = 50, category, unreadOnly = false } = data;

  let query = db
    .collection('notifications')
    .where('userId', '==', request.auth.uid)
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
export const markNotificationRead = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { notificationId } = data;

  const notificationRef = db.collection('notifications').doc(notificationId);
  const notificationDoc = await notificationRef.get();

  if (!notificationDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Notification not found');
  }

  const notification = notificationDoc.data() as Notification;
  if (notification.userId !== request.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not your notification');
  }

  await notificationRef.update({
    read: true,
    readAt: new Date(),
  });

  console.log('Scheduled job result:', { success: true });


  return;
});

/**
 * Mark all notifications as read
 */
export const markAllNotificationsRead = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const snapshot = await db
    .collection('notifications')
    .where('userId', '==', request.auth.uid)
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

  console.log('Scheduled job result:', { success: true, count: snapshot.size });


  return;
});

/**
 * Archive notification
 */
export const archiveNotification = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { notificationId } = data;

  const notificationRef = db.collection('notifications').doc(notificationId);
  const notificationDoc = await notificationRef.get();

  if (!notificationDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Notification not found');
  }

  const notification = notificationDoc.data() as Notification;
  if (notification.userId !== request.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not your notification');
  }

  await notificationRef.update({
    archived: true,
  });

  console.log('Scheduled job result:', { success: true });


  return;
});

/**
 * Get notification settings
 */
export const getNotificationSettings = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const settings = await settingsManager.getSettings(request.auth.uid);
  return settings;
});

/**
 * Update notification settings
 */
export const updateNotificationSettings = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  await settingsManager.updateSettings(request.auth.uid, data.updates);
  console.log('Scheduled job result:', { success: true });

  return;
});

/**
 * Toggle category notifications
 */
export const toggleCategoryNotifications = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { category, enabled } = data;

  await settingsManager.toggleCategory(request.auth.uid, category, enabled);
  console.log('Scheduled job result:', { success: true });

  return;
});

/**
 * Set snooze mode
 */
export const setSnoozeMode = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { duration } = data;

  await settingsManager.setSnoozeMode(request.auth.uid, duration || null);
  console.log('Scheduled job result:', { success: true });

  return;
});

/**
 * Create reminder
 */
export const createReminder = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const reminderId = await reminderEngine.createReminder({
    userId: request.auth.uid,
    ...data,
  });

  return { reminderId };
});

/**
 * Get user reminders
 */
export const getUserReminders = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const reminders = await reminderEngine.getUserReminders(request.auth.uid);
  return reminders;
});

/**
 * Update reminder
 */
export const updateReminder = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { reminderId, updates } = data;

  // Verify ownership
  const reminderDoc = await db.collection('reminder_rules').doc(reminderId).get();
  if (!reminderDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Reminder not found');
  }

  const reminder = reminderDoc.data();
  if (reminder?.userId !== request.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not your reminder');
  }

  await reminderEngine.updateReminder(reminderId, updates);
  console.log('Scheduled job result:', { success: true });

  return;
});

/**
 * Delete reminder
 */
export const deleteReminder = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { reminderId } = data;

  // Verify ownership
  const reminderDoc = await db.collection('reminder_rules').doc(reminderId).get();
  if (!reminderDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Reminder not found');
  }

  const reminder = reminderDoc.data();
  if (reminder?.userId !== request.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not your reminder');
  }

  await reminderEngine.deleteReminder(reminderId);
  console.log('Scheduled job result:', { success: true });

  return;
});

/**
 * Get user digests
 */
export const getUserDigests = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { limit = 10 } = data;
  const digests = await digestEngine.getUserDigests(request.auth.uid, limit);
  return digests;
});

/**
 * SCHEDULED: Process due reminders (runs every 5 minutes)
 */
export const processReminders = onSchedule("every 5 minutes", async (event) => {
    await reminderEngine.processDueReminders();
    return;
  });

/**
 * SCHEDULED: Generate daily digests (runs at 8:00 AM UTC)
 */
export const generateDailyDigests = onSchedule({ schedule: "0 8 * * *", timeZone: "UTC" }, async (event) => {
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

    return;
  });

/**
 * SCHEDULED: Generate weekly digests (runs on Monday at 8:00 AM UTC)
 */
export const generateWeeklyDigests = onSchedule({ schedule: "0 8 * * 1", timeZone: "UTC" }, async (event) => {
    const usersSnapshot = await db.collection('notification_settings').get();

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      try {
        await digestEngine.generateWeeklyDigest(userId);
      } catch (error) {
        console.error(`Failed to generate weekly digest for user ${userId}:`, error);
      }
    }

    return;
  });

/**
 * SCHEDULED: Reset paused reminders (runs daily at midnight UTC)
 */
export const resetPausedReminders = onSchedule({ schedule: "0 0 * * *", timeZone: "UTC" }, async (event) => {
    await reminderEngine.resetDailyPausedReminders();
    return;
  });

/**
 * SCHEDULED: Clean up old digests (runs weekly)
 */
export const cleanupOldDigests = onSchedule({ schedule: "0 2 * * 0", timeZone: "UTC" }, async (event) => {
    await digestEngine.cleanupOldDigests();
    return;
  });

/**
 * SCHEDULED: Clean up old notifications (runs weekly)
 */
export const cleanupOldNotifications = onSchedule({ schedule: "0 3 * * 0", timeZone: "UTC" }, async (event) => {
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

    return;
  });



























