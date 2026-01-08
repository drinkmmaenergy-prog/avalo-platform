/**
 * PACK 293 - Notifications & Activity Center
 * Cloud Functions for notification system
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  NotificationDocument,
  NotificationPayload,
} from './pack293-notification-types';
import {
  enqueueNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  dismissNotification,
  getUnreadNotificationCount,
  getUserNotificationSettings,
  updateUserNotificationSettings,
} from './pack293-notification-service';
import {
  deliverNotification,
  registerDevice,
  unregisterDevice,
  updateDeviceLastSeen,
} from './pack293-notification-delivery';

const db = admin.firestore();

// ============================================================================
// ACTIVITY CENTER API - GET NOTIFICATIONS
// ============================================================================

/**
 * Get notifications for activity center
 * Supports pagination and filtering
 */
export const getNotifications = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const limit = data.limit || 50;
  const cursor = data.cursor || null;
  const type = data.type || null; // Optional filter by type
  const status = data.status || null; // Optional filter by status

  try {
    let query = db
      .collection('notifications')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit);

    // Apply filters
    if (type) {
      query = query.where('type', '==', type);
    }
    if (status) {
      query = query.where('status', '==', status);
    }

    // Apply pagination cursor
    if (cursor) {
      const cursorDoc = await db.collection('notifications').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();
    const notifications = snapshot.docs.map(doc => ({
      ...doc.data(),
      notificationId: doc.id,
    }));

    // Get unread count
    const unreadCount = await getUnreadNotificationCount(userId);

    // Get next cursor
    const nextCursor = snapshot.docs.length === limit
      ? snapshot.docs[snapshot.docs.length - 1].id
      : null;

    return {
      items: notifications,
      nextCursor,
      unreadCount,
    };
  } catch (error: any) {
    console.error('Error getting notifications:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// NOTIFICATION ACTIONS
// ============================================================================

/**
 * Mark notification as read
 */
export const markNotificationRead = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { notificationId } = data;
  
  if (!notificationId) {
    throw new functions.https.HttpsError('invalid-argument', 'notificationId is required');
  }

  try {
    await markNotificationAsRead(context.auth.uid, notificationId);
    return { success: true };
  } catch (error: any) {
    console.error('Error marking notification as read:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Mark all notifications as read
 */
export const markAllNotificationsRead = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    await markAllNotificationsAsRead(context.auth.uid);
    return { success: true };
  } catch (error: any) {
    console.error('Error marking all notifications as read:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Dismiss notification
 */
export const dismissNotificationFunc = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { notificationId } = data;
  
  if (!notificationId) {
    throw new functions.https.HttpsError('invalid-argument', 'notificationId is required');
  }

  try {
    await dismissNotification(context.auth.uid, notificationId);
    return { success: true };
  } catch (error: any) {
    console.error('Error dismissing notification:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// NOTIFICATION SETTINGS
// ============================================================================

/**
 * Get user notification settings
 */
export const getNotificationSettings = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const settings = await getUserNotificationSettings(context.auth.uid);
    return settings;
  } catch (error: any) {
    console.error('Error getting notification settings:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Update user notification settings
 */
export const updateNotificationSettings = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    await updateUserNotificationSettings(context.auth.uid, data);
    return { success: true };
  } catch (error: any) {
    console.error('Error updating notification settings:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// DEVICE MANAGEMENT
// ============================================================================

/**
 * Register device for push notifications
 */
export const registerDeviceForPush = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { deviceId, platform, pushToken } = data;

  if (!deviceId || !platform || !pushToken) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'deviceId, platform, and pushToken are required'
    );
  }

  try {
    await registerDevice(context.auth.uid, deviceId, platform, pushToken);
    return { success: true };
  } catch (error: any) {
    console.error('Error registering device:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Unregister device
 */
export const unregisterDeviceFromPush = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { deviceId } = data;

  if (!deviceId) {
    throw new functions.https.HttpsError('invalid-argument', 'deviceId is required');
  }

  try {
    await unregisterDevice(deviceId);
    return { success: true };
  } catch (error: any) {
    console.error('Error unregistering device:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Update device last seen
 */
export const updateDeviceActivity = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { deviceId } = data;

  if (!deviceId) {
    throw new functions.https.HttpsError('invalid-argument', 'deviceId is required');
  }

  try {
    await updateDeviceLastSeen(deviceId);
    return { success: true };
  } catch (error: any) {
    console.error('Error updating device activity:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// BACKGROUND NOTIFICATION PROCESSING
// ============================================================================

/**
 * Process newly created notifications
 * Triggered when a notification document is created
 */
export const processNotification = functions.firestore
  .document('notifications/{notificationId}')
  .onCreate(async (snapshot, context) => {
    const notificationId = context.params.notificationId;
    const notification = snapshot.data() as NotificationDocument;

    try {
      // Deliver notification through configured channels
      const result = await deliverNotification(notificationId);
      
      console.log(
        `Notification ${notificationId} delivered to ${result.channels.join(', ')}. ` +
        `Success: ${result.success}`
      );

      if (result.errors.length > 0) {
        console.error(`Delivery errors: ${result.errors.join('; ')}`);
      }
    } catch (error) {
      console.error(`Error processing notification ${notificationId}:`, error);
    }
  });

// ============================================================================
// SCHEDULED BATCH PROCESSING
// ============================================================================

/**
 * Process batched notifications
 * Runs every 15 minutes to send queued low-priority notifications
 */
export const processBatchedNotifications = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async (context) => {
    try {
      const now = admin.firestore.Timestamp.now();

      // Find pending batches that are ready to send
      const batchesQuery = db
        .collection('notificationBatches')
        .where('status', '==', 'PENDING')
        .where('scheduledFor', '<=', now)
        .limit(100);

      const batchesSnap = await batchesQuery.get();

      if (batchesSnap.empty) {
        console.log('No batched notifications to process');
        return null;
      }

      console.log(`Processing ${batchesSnap.size} batched notifications`);

      // Process each batch
      const promises = batchesSnap.docs.map(async (batchDoc) => {
        const batch = batchDoc.data();
        const notificationIds = batch.notificationIds || [];

        try {
          // Deliver all notifications in the batch
          await Promise.all(
            notificationIds.map((notificationId: string) =>
              deliverNotification(notificationId)
            )
          );

          // Mark batch as sent
          await batchDoc.ref.update({
            status: 'SENT',
            sentAt: admin.firestore.Timestamp.now(),
          });

          console.log(`Batch ${batchDoc.id} processed successfully`);
        } catch (error) {
          console.error(`Error processing batch ${batchDoc.id}:`, error);
        }
      });

      await Promise.all(promises);

      return null;
    } catch (error) {
      console.error('Error in processBatchedNotifications:', error);
      return null;
    }
  });

// ============================================================================
// CLEANUP OLD NOTIFICATIONS
// ============================================================================

/**
 * Clean up old dismissed/read notifications
 * Runs daily to remove notifications older than 90 days
 */
export const cleanupOldNotifications = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    try {
      const ninetyDaysAgo = admin.firestore.Timestamp.fromMillis(
        Date.now() - 90 * 24 * 60 * 60 * 1000
      );

      // Query old notifications
      const oldNotificationsQuery = db
        .collection('notifications')
        .where('status', 'in', ['READ', 'DISMISSED'])
        .where('createdAt', '<', ninetyDaysAgo)
        .limit(500);

      const snapshot = await oldNotificationsQuery.get();

      if (snapshot.empty) {
        console.log('No old notifications to clean up');
        return null;
      }

      console.log(`Deleting ${snapshot.size} old notifications`);

      // Delete in batches
      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      console.log(`Deleted ${snapshot.size} old notifications`);
      return null;
    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
      return null;
    }
  });

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

/**
 * Send notification to user (admin only)
 * Used for system alerts and manual notifications
 */
export const sendNotificationToUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Check if user is admin
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can send notifications');
  }

  const payload: NotificationPayload = {
    userId: data.userId,
    type: data.type,
    title: data.title,
    body: data.body,
    context: data.context || {},
    priority: data.priority || 'NORMAL',
    delivery: data.delivery,
  };

  try {
    const notificationId = await enqueueNotification(payload);
    return { success: true, notificationId };
  } catch (error: any) {
    console.error('Error sending notification:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get notification analytics (admin only)
 */
export const getNotificationAnalytics = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Check if user is admin
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can view analytics');
  }

  const { startDate, endDate, type } = data;

  try {
    let query = db.collection('notificationLogs').orderBy('sentAt', 'desc');

    if (type) {
      query = query.where('type', '==', type);
    }

    if (startDate) {
      query = query.where('sentAt', '>=', admin.firestore.Timestamp.fromDate(new Date(startDate)));
    }

    if (endDate) {
      query = query.where('sentAt', '<=', admin.firestore.Timestamp.fromDate(new Date(endDate)));
    }

    const snapshot = await query.limit(1000).get();
    const logs = snapshot.docs.map(doc => doc.data());

    // Calculate statistics
    const stats = {
      total: logs.length,
      successful: logs.filter(l => l.deliveryStatus === 'SUCCESS').length,
      failed: logs.filter(l => l.deliveryStatus === 'FAILED').length,
      throttled: logs.filter(l => l.deliveryStatus === 'THROTTLED').length,
      blocked: logs.filter(l => l.blocked).length,
      byType: {} as Record<string, number>,
      byPriority: {} as Record<string, number>,
    };

    logs.forEach(log => {
      stats.byType[log.type] = (stats.byType[log.type] || 0) + 1;
      stats.byPriority[log.priority] = (stats.byPriority[log.priority] || 0) + 1;
    });

    return {
      stats,
      logs: logs.slice(0, 100), // Return first 100 logs
    };
  } catch (error: any) {
    console.error('Error getting notification analytics:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});