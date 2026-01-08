/**
 * PACK 293 - Notifications & Activity Center
 * Notification delivery engines (Push, In-App, Email)
 */

import * as admin from 'firebase-admin';
import {
  NotificationDocument,
  NotificationSettingsDocument,
  UserDeviceDocument,
  NotificationPlatform,
  isCriticalPriority,
} from './pack293-notification-types';
import {
  isInQuietHours,
  logNotificationSuccess,
  logNotificationFailure,
} from './pack293-notification-service';

const db = admin.firestore();

// ============================================================================
// PUSH NOTIFICATION DELIVERY (FCM/APNs)
// ============================================================================

/**
 * Get active devices for user
 */
async function getUserDevices(userId: string): Promise<UserDeviceDocument[]> {
  const devicesQuery = db
    .collection('userDevices')
    .where('userId', '==', userId)
    .orderBy('lastSeenAt', 'desc');

  const snapshot = await devicesQuery.get();
  
  // Filter devices seen in last 30 days
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  
  return snapshot.docs
    .map(doc => doc.data() as UserDeviceDocument)
    .filter(device => device.lastSeenAt.toMillis() > thirtyDaysAgo);
}

/**
 * Build FCM push notification payload
 */
function buildPushPayload(notification: NotificationDocument): admin.messaging.Message {
  // Base notification payload
  const basePayload: admin.messaging.Notification = {
    title: notification.title,
    body: notification.body,
  };

  // Add context data
  const data: { [key: string]: string } = {
    notificationId: notification.notificationId,
    type: notification.type,
    priority: notification.priority,
  };

  // Add context fields
  if (notification.context.chatId) {
    data.chatId = notification.context.chatId;
  }
  if (notification.context.matchId) {
    data.matchId = notification.context.matchId;
  }
  if (notification.context.profileId) {
    data.profileId = notification.context.profileId;
  }
  if (notification.context.bookingId) {
    data.bookingId = notification.context.bookingId;
  }
  if (notification.context.eventId) {
    data.eventId = notification.context.eventId;
  }

  return {
    notification: basePayload,
    data,
    android: {
      priority: isCriticalPriority(notification.priority) ? 'high' : 'normal',
      notification: {
        channelId: getAndroidChannelId(notification.type),
        priority: isCriticalPriority(notification.priority) ? 'max' : 'default',
        sound: isCriticalPriority(notification.priority) ? 'default' : 'default',
      },
    },
    apns: {
      payload: {
        aps: {
          alert: {
            title: notification.title,
            body: notification.body,
          },
          sound: isCriticalPriority(notification.priority) ? 'default' : 'default',
          badge: 1,
        },
      },
    },
    webpush: {
      notification: {
        title: notification.title,
        body: notification.body,
        icon: '/app-icon.png',
        badge: '/badge-icon.png',
      },
    },
    token: '', // Will be set per device
  };
}

/**
 * Get Android notification channel ID based on notification type
 */
function getAndroidChannelId(type: string): string {
  const channelMap: { [key: string]: string } = {
    MATCH: 'matches',
    NEW_MESSAGE: 'messages',
    MISSED_MESSAGE_REMINDER: 'messages',
    NEW_LIKE: 'likes',
    NEW_VISIT: 'visits',
    NEW_CHAT_REQUEST: 'messages',
    CALENDAR_BOOKING_CREATED: 'calendar',
    CALENDAR_BOOKING_UPDATED: 'calendar',
    CALENDAR_BOOKING_CANCELLED: 'calendar',
    CALENDAR_REMINDER: 'calendar',
    EVENT_TICKET_CONFIRMED: 'events',
    EVENT_REMINDER: 'events',
    EVENT_CANCELLED: 'events',
    TIP_AI_SUGGESTION: 'tips',
    CREATOR_EARNINGS_SUMMARY: 'earnings',
    SYSTEM_ALERT: 'system',
    SAFETY_ALERT: 'safety',
    PANIC_CONTACT_ALERT: 'safety',
  };

  return channelMap[type] || 'default';
}

/**
 * Deliver push notification to user devices
 */
export async function deliverPushNotification(
  notification: NotificationDocument,
  settings: NotificationSettingsDocument,
  userTimezone: string = 'UTC'
): Promise<{ success: boolean; devicesReached: number; errors: string[] }> {
  try {
    // Check if push is enabled
    if (!notification.delivery.push) {
      return { success: true, devicesReached: 0, errors: [] };
    }

    // Check quiet hours (unless critical)
    if (!isCriticalPriority(notification.priority) && isInQuietHours(settings, userTimezone)) {
      console.log(`Skipping push notification due to quiet hours for user ${notification.userId}`);
      return { success: true, devicesReached: 0, errors: ['Quiet hours active'] };
    }

    // Get user devices
    const devices = await getUserDevices(notification.userId);
    
    if (devices.length === 0) {
      console.log(`No devices found for user ${notification.userId}`);
      return { success: true, devicesReached: 0, errors: ['No devices registered'] };
    }

    // Build base payload
    const basePayload = buildPushPayload(notification);

    // Send to each device
    const results = await Promise.allSettled(
      devices.map(async (device) => {
        const payload = {
          ...basePayload,
          token: device.pushToken,
        };

        try {
          await admin.messaging().send(payload);
          return { success: true, deviceId: device.deviceId };
        } catch (error: any) {
          console.error(`Failed to send push to device ${device.deviceId}:`, error);
          
          // Remove invalid tokens
          if (
            error.code === 'messaging/invalid-registration-token' ||
            error.code === 'messaging/registration-token-not-registered'
          ) {
            await db.collection('userDevices').doc(device.deviceId).delete();
          }
          
          return { success: false, deviceId: device.deviceId, error: error.message };
        }
      })
    );

    // Collect results
    const successful = results.filter(
      r => r.status === 'fulfilled' && (r as PromiseFulfilledResult<any>).value.success
    ).length;
    const errors = results
      .filter(r => r.status === 'fulfilled' && !(r as PromiseFulfilledResult<any>).value.success)
      .map(r => (r as PromiseFulfilledResult<any>).value.error);

    // Update notification status
    await db.collection('notifications').doc(notification.notificationId).update({
      status: 'SENT',
      sentAt: admin.firestore.Timestamp.now(),
    });

    // Log delivery
    if (successful > 0) {
      await logNotificationSuccess(notification.notificationId, notification, ['push']);
    } else if (errors.length > 0) {
      await logNotificationFailure(
        notification.notificationId,
        notification,
        ['push'],
        errors.join('; ')
      );
    }

    return {
      success: successful > 0,
      devicesReached: successful,
      errors,
    };
  } catch (error: any) {
    console.error('Error delivering push notification:', error);
    await logNotificationFailure(
      notification.notificationId,
      notification,
      ['push'],
      error.message
    );
    return { success: false, devicesReached: 0, errors: [error.message] };
  }
}

// ============================================================================
// IN-APP NOTIFICATION DELIVERY
// ============================================================================

/**
 * Deliver in-app notification
 * In-app notifications are already stored in Firestore, so we just need to
 * update the status and optionally trigger real-time notifications
 */
export async function deliverInAppNotification(
  notification: NotificationDocument
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!notification.delivery.inApp) {
      return { success: true };
    }

    // Update notification status to DELIVERED for in-app
    await db.collection('notifications').doc(notification.notificationId).update({
      status: 'DELIVERED',
      sentAt: admin.firestore.Timestamp.now(),
    });

    // Log delivery
    await logNotificationSuccess(notification.notificationId, notification, ['inApp']);

    return { success: true };
  } catch (error: any) {
    console.error('Error delivering in-app notification:', error);
    await logNotificationFailure(
      notification.notificationId,
      notification,
      ['inApp'],
      error.message
    );
    return { success: false, error: error.message };
  }
}

// ============================================================================
// EMAIL NOTIFICATION DELIVERY (STUB)
// ============================================================================

/**
 * Deliver email notification
 * This is a stub implementation - integrate with SendGrid or similar service
 */
export async function deliverEmailNotification(
  notification: NotificationDocument,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!notification.delivery.email) {
      return { success: true };
    }

    // Only send emails for specific notification types
    const emailEligibleTypes = [
      'SYSTEM_ALERT',
      'SAFETY_ALERT',
      'CREATOR_EARNINGS_SUMMARY',
    ];

    if (!emailEligibleTypes.includes(notification.type)) {
      return { success: true };
    }

    // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
    // For now, just log the intent
    console.log(`Would send email to ${userEmail} for notification ${notification.notificationId}`);
    console.log(`Subject: ${notification.title}`);
    console.log(`Body: ${notification.body}`);

    // Example SendGrid integration (commented out):
    /*
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    const msg = {
      to: userEmail,
      from: 'notifications@avalo.app',
      subject: notification.title,
      text: notification.body,
      html: `<p>${notification.body}</p>`,
    };
    
    await sgMail.send(msg);
    */

    // Log delivery attempt
    await logNotificationSuccess(notification.notificationId, notification, ['email']);

    return { success: true };
  } catch (error: any) {
    console.error('Error delivering email notification:', error);
    await logNotificationFailure(
      notification.notificationId,
      notification,
      ['email'],
      error.message
    );
    return { success: false, error: error.message };
  }
}

// ============================================================================
// UNIFIED DELIVERY ORCHESTRATOR
// ============================================================================

/**
 * Orchestrate delivery across all channels
 */
export async function deliverNotification(
  notificationId: string
): Promise<{ success: boolean; channels: string[]; errors: string[] }> {
  try {
    // Get notification
    const notificationSnap = await db.collection('notifications').doc(notificationId).get();
    
    if (!notificationSnap.exists) {
      throw new Error('Notification not found');
    }

    const notification = notificationSnap.data() as NotificationDocument;

    // Get user settings
    const settingsSnap = await db
      .collection('notificationSettings')
      .doc(notification.userId)
      .get();
    
    const settings = settingsSnap.data() as NotificationSettingsDocument;

    // Get user profile for email and timezone
    const userSnap = await db.collection('users').doc(notification.userId).get();
    const userEmail = userSnap.data()?.email || '';
    const userTimezone = userSnap.data()?.timezone || 'UTC';

    // Deliver through all requested channels
    const deliveryResults = await Promise.allSettled([
      notification.delivery.push
        ? deliverPushNotification(notification, settings, userTimezone)
        : Promise.resolve({ success: true, devicesReached: 0, errors: [] }),
      notification.delivery.inApp
        ? deliverInAppNotification(notification)
        : Promise.resolve({ success: true }),
      notification.delivery.email
        ? deliverEmailNotification(notification, userEmail)
        : Promise.resolve({ success: true }),
    ]);

    // Collect results
    const channelsDelivered: string[] = [];
    const allErrors: string[] = [];

    if (notification.delivery.push) {
      const pushResult = deliveryResults[0];
      if (pushResult.status === 'fulfilled' && pushResult.value.success) {
        channelsDelivered.push('push');
      } else if (pushResult.status === 'fulfilled') {
        allErrors.push(...pushResult.value.errors);
      }
    }

    if (notification.delivery.inApp) {
      const inAppResult = deliveryResults[1];
      if (inAppResult.status === 'fulfilled' && inAppResult.value.success) {
        channelsDelivered.push('inApp');
      }
    }

    if (notification.delivery.email) {
      const emailResult = deliveryResults[2];
      if (emailResult.status === 'fulfilled' && emailResult.value.success) {
        channelsDelivered.push('email');
      }
    }

    return {
      success: channelsDelivered.length > 0,
      channels: channelsDelivered,
      errors: allErrors,
    };
  } catch (error: any) {
    console.error('Error delivering notification:', error);
    return {
      success: false,
      channels: [],
      errors: [error.message],
    };
  }
}

// ============================================================================
// DEVICE MANAGEMENT
// ============================================================================

/**
 * Register or update device for push notifications
 */
export async function registerDevice(
  userId: string,
  deviceId: string,
  platform: NotificationPlatform,
  pushToken: string
): Promise<void> {
  const deviceRef = db.collection('userDevices').doc(deviceId);
  
  const deviceData: UserDeviceDocument = {
    deviceId,
    userId,
    platform,
    pushToken,
    lastSeenAt: admin.firestore.Timestamp.now(),
  };

  await deviceRef.set(deviceData, { merge: true });
}

/**
 * Unregister device
 */
export async function unregisterDevice(deviceId: string): Promise<void> {
  await db.collection('userDevices').doc(deviceId).delete();
}

/**
 * Update device last seen timestamp
 */
export async function updateDeviceLastSeen(deviceId: string): Promise<void> {
  await db.collection('userDevices').doc(deviceId).update({
    lastSeenAt: admin.firestore.Timestamp.now(),
  });
}