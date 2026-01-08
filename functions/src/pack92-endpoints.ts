/**
 * PACK 92 — Notification Endpoints
 * Callable Cloud Functions for notification management
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  registerDevicePushToken,
  unregisterDevicePushToken,
  updateUserNotificationSettings,
  markNotificationRead,
  markAllNotificationsRead,
} from './pack92-notifications';
import { UserNotificationSettings } from './pack92-types';

const db = getFirestore();

// ============================================================================
// DEVICE TOKEN MANAGEMENT
// ============================================================================

/**
 * Register device for push notifications
 */
export const registerPushToken = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const { deviceId, pushToken, platform } = request.data;

    if (!deviceId || !pushToken || !platform) {
      throw new HttpsError(
        'invalid-argument',
        'deviceId, pushToken, and platform are required'
      );
    }

    if (!['ios', 'android', 'web'].includes(platform)) {
      throw new HttpsError('invalid-argument', 'Invalid platform');
    }

    try {
      await registerDevicePushToken({
        userId,
        deviceId,
        pushToken,
        platform,
      });

      return { success: true };
    } catch (error: any) {
      logger.error('Error registering push token', error);
      throw new HttpsError('internal', 'Failed to register push token');
    }
  }
);

/**
 * Unregister device from push notifications
 */
export const unregisterPushToken = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const { deviceId } = request.data;

    if (!deviceId) {
      throw new HttpsError('invalid-argument', 'deviceId is required');
    }

    try {
      await unregisterDevicePushToken({ userId, deviceId });
      return { success: true };
    } catch (error: any) {
      logger.error('Error unregistering push token', error);
      throw new HttpsError('internal', 'Failed to unregister push token');
    }
  }
);

// ============================================================================
// NOTIFICATION SETTINGS
// ============================================================================

/**
 * Get user notification settings
 */
export const getNotificationSettings = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;

    try {
      const settingsDoc = await db
        .collection('user_notification_settings')
        .doc(userId)
        .get();

      if (!settingsDoc.exists) {
        // Return default settings
        return {
          pushEnabled: true,
          emailEnabled: true,
          inAppEnabled: true,
          categories: {
            EARNINGS: true,
            PAYOUT: true,
            MARKETING: false,
            SAFETY: true, // Mandatory
            LEGAL: true, // Mandatory
          },
        };
      }

      return settingsDoc.data();
    } catch (error: any) {
      logger.error('Error getting notification settings', error);
      throw new HttpsError('internal', 'Failed to get settings');
    }
  }
);

/**
 * Update user notification settings
 */
export const updateNotificationSettings = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const updates = request.data;

    if (!updates || typeof updates !== 'object') {
      throw new HttpsError('invalid-argument', 'Invalid settings data');
    }

    try {
      await updateUserNotificationSettings(userId, updates);
      return { success: true };
    } catch (error: any) {
      logger.error('Error updating notification settings', error);
      throw new HttpsError('internal', 'Failed to update settings');
    }
  }
);

// ============================================================================
// NOTIFICATION MANAGEMENT
// ============================================================================

/**
 * Get notifications for user (paginated)
 */
export const getNotifications = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const limit = Math.min(request.data.limit || 50, 100);
    const pageToken = request.data.pageToken;

    try {
      let query = db
        .collection('notifications')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc');

      // Handle pagination
      if (pageToken) {
        const tokenDoc = await db.collection('notifications').doc(pageToken).get();
        if (tokenDoc.exists) {
          query = query.startAfter(tokenDoc);
        }
      }

      // Fetch one extra to determine if there are more
      const snapshot = await query.limit(limit + 1).get();

      const notifications: any[] = [];
      let hasMore = false;
      let nextPageToken: string | undefined;

      snapshot.docs.forEach((doc, index) => {
        if (index < limit) {
          notifications.push({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt.toDate().toISOString(),
          });
        } else {
          hasMore = true;
          nextPageToken = doc.id;
        }
      });

      // Get unread count
      const unreadSnapshot = await db
        .collection('notifications')
        .where('userId', '==', userId)
        .where('read', '==', false)
        .count()
        .get();

      return {
        notifications,
        hasMore,
        nextPageToken,
        unreadCount: unreadSnapshot.data().count,
      };
    } catch (error: any) {
      logger.error('Error getting notifications', error);
      throw new HttpsError('internal', 'Failed to get notifications');
    }
  }
);

/**
 * Mark notification as read
 */
export const markNotificationAsRead = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const { notificationId } = request.data;

    if (!notificationId) {
      throw new HttpsError('invalid-argument', 'notificationId is required');
    }

    try {
      // Verify notification belongs to user
      const notificationDoc = await db
        .collection('notifications')
        .doc(notificationId)
        .get();

      if (!notificationDoc.exists) {
        throw new HttpsError('not-found', 'Notification not found');
      }

      const notification = notificationDoc.data();
      if (notification?.userId !== userId) {
        throw new HttpsError(
          'permission-denied',
          'Cannot mark another user\'s notification'
        );
      }

      await markNotificationRead(notificationId);
      return { success: true };
    } catch (error: any) {
      if (error instanceof HttpsError) throw error;
      logger.error('Error marking notification as read', error);
      throw new HttpsError('internal', 'Failed to mark notification as read');
    }
  }
);

/**
 * Mark all notifications as read
 */
export const markAllNotificationsAsRead = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;

    try {
      await markAllNotificationsRead(userId);
      return { success: true };
    } catch (error: any) {
      logger.error('Error marking all notifications as read', error);
      throw new HttpsError('internal', 'Failed to mark all as read');
    }
  }
);

/**
 * Get unread notification count
 */
export const getUnreadCount = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;

    try {
      const snapshot = await db
        .collection('notifications')
        .where('userId', '==', userId)
        .where('read', '==', false)
        .count()
        .get();

      return { count: snapshot.data().count };
    } catch (error: any) {
      logger.error('Error getting unread count', error);
      throw new HttpsError('internal', 'Failed to get unread count');
    }
  }
);