/**
 * PACK 92 — Unified Notification & Messaging Engine
 * Backend Notification Engine
 * 
 * NON-NEGOTIABLE RULES:
 * - No free tokens, no bonuses, no discounts, no cashback
 * - Token price per unit remains fixed
 * - Revenue split: 65% creator / 35% Avalo (unchanged)
 * - Notifications may inform about earnings, but never guarantee future income
 * - Legal/trust/enforcement notifications must be clear, neutral, and compliant
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  NotificationType,
  NotificationCategory,
  NotificationChannel,
  NotificationDocument,
  UserNotificationSettings,
  SendNotificationInput,
  MANDATORY_CATEGORIES,
} from './pack92-types';

const db = getFirestore();

// ============================================================================
// CORE NOTIFICATION ENGINE
// ============================================================================

/**
 * Send a notification to a user
 * Checks user settings and creates notification document
 */
export async function sendNotification(input: SendNotificationInput): Promise<void> {
  try {
    const {
      userId,
      type,
      category,
      title,
      body,
      deepLink,
      payload,
      forceChannels,
    } = input;

    // Load user notification settings
    const settings = await getUserNotificationSettings(userId);

    // Determine which channels to use
    const channels = determineChannels(category, settings, forceChannels);

    if (channels.length === 0) {
      logger.info(`Notification skipped for user ${userId} - all channels disabled`, { type });
      return;
    }

    // Create notification document
    const notificationId = db.collection('notifications').doc().id;
    const notification: NotificationDocument = {
      id: notificationId,
      userId,
      type,
      category,
      title,
      body,
      deepLink,
      read: false,
      createdAt: Timestamp.now(),
      channels,
      payload: payload || {},
    };

    await db.collection('notifications').doc(notificationId).set(notification);

    logger.info(`Notification created: ${notificationId} for user ${userId}`, {
      type,
      category,
      channels,
    });

    // Send push notification if PUSH channel is enabled
    if (channels.includes('PUSH')) {
      await sendPushNotificationToUser(userId, notification);
    }
  } catch (error: any) {
    logger.error('Error sending notification', error);
    throw error;
  }
}

/**
 * Determine which channels to use based on settings and category
 */
function determineChannels(
  category: NotificationCategory,
  settings: UserNotificationSettings,
  forceChannels?: NotificationChannel[]
): NotificationChannel[] {
  // If forceChannels specified (for critical notifications), use those
  if (forceChannels && forceChannels.length > 0) {
    return forceChannels;
  }

  // For mandatory categories, always send to IN_APP at minimum
  if (MANDATORY_CATEGORIES.includes(category)) {
    const channels: NotificationChannel[] = ['IN_APP'];
    if (settings.pushEnabled) {
      channels.push('PUSH');
    }
    return channels;
  }

  // For optional categories, respect user settings
  const channels: NotificationChannel[] = [];
  
  if (settings.inAppEnabled) {
    channels.push('IN_APP');
  }

  if (settings.pushEnabled) {
    channels.push('PUSH');
  }

  return channels;
}

/**
 * Get user notification settings, with defaults if not exists
 */
async function getUserNotificationSettings(userId: string): Promise<UserNotificationSettings> {
  const settingsDoc = await db.collection('user_notification_settings').doc(userId).get();

  if (settingsDoc.exists) {
    return settingsDoc.data() as UserNotificationSettings;
  }

  // Return default settings
  return {
    userId,
    pushEnabled: true,
    emailEnabled: true,
    inAppEnabled: true,
    categories: {
      EARNINGS: true,
      PAYOUT: true,
      MARKETING: false,
      SAFETY: true,
      LEGAL: true,
    },
    updatedAt: Timestamp.now(),
  };
}

/**
 * Send push notification to user's devices
 */
async function sendPushNotificationToUser(
  userId: string,
  notification: NotificationDocument
): Promise<void> {
  try {
    // Get user's push tokens
    const devicesSnapshot = await db
      .collection('user_devices')
      .where('userId', '==', userId)
      .get();

    if (devicesSnapshot.empty) {
      logger.info(`No push tokens found for user ${userId}`);
      return;
    }

    const tokens = devicesSnapshot.docs
      .map((doc) => doc.data().pushToken)
      .filter((token) => token);

    if (tokens.length === 0) {
      logger.info(`No valid push tokens for user ${userId}`);
      return;
    }

    // Send via Expo Push API
    await sendExpoPushNotifications(tokens, notification);
  } catch (error: any) {
    logger.error(`Error sending push to user ${userId}`, error);
    // Don't throw - push failures shouldn't block notification creation
  }
}

/**
 * Send push notifications via Expo Push API
 */
async function sendExpoPushNotifications(
  tokens: string[],
  notification: NotificationDocument
): Promise<void> {
  const fetch = (await import('node-fetch')).default;

  const messages = tokens.map((token) => ({
    to: token,
    sound: 'default',
    title: notification.title,
    body: notification.body,
    data: {
      notificationId: notification.id,
      type: notification.type,
      deepLink: notification.deepLink,
      payload: notification.payload,
    },
    priority: 'high' as const,
    channelId: 'default',
  }));

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('Expo Push API error', errorData);
    } else {
      logger.info(`Sent ${messages.length} push notifications`);
    }
  } catch (error: any) {
    logger.error('Error calling Expo Push API', error);
  }
}

// ============================================================================
// NOTIFICATION TEMPLATES & HELPERS
// ============================================================================

/**
 * Send earnings notification
 */
export async function sendEarningsNotification(params: {
  userId: string;
  amount: number;
  source: string;
  sourceId: string;
}): Promise<void> {
  await sendNotification({
    userId: params.userId,
    type: 'EARNINGS',
    category: 'TRANSACTIONAL',
    title: `You earned ${params.amount} tokens`,
    body: `Someone ${params.source}. Check your wallet for details.`,
    deepLink: 'avalo://wallet',
    payload: {
      amount: params.amount,
      source: params.source,
      sourceId: params.sourceId,
    },
  });
}

/**
 * Send payout notification
 */
export async function sendPayoutNotification(params: {
  userId: string;
  status: 'CREATED' | 'APPROVED' | 'REJECTED' | 'PAID';
  requestId: string;
  amount?: number;
  reason?: string;
}): Promise<void> {
  let title: string;
  let body: string;

  switch (params.status) {
    case 'CREATED':
      title = 'Payout request submitted';
      body = 'Your payout request has been created and is pending review.';
      break;
    case 'APPROVED':
      title = 'Payout approved';
      body = 'Your payout request has been approved and will be processed soon.';
      break;
    case 'REJECTED':
      title = 'Payout request rejected';
      body = params.reason || 'Your payout request was rejected. Please review the details.';
      break;
    case 'PAID':
      title = 'Payout completed';
      body = 'Your payout has been processed successfully.';
      break;
  }

  await sendNotification({
    userId: params.userId,
    type: 'PAYOUT',
    category: 'TRANSACTIONAL',
    title,
    body,
    deepLink: `avalo://payouts/${params.requestId}`,
    payload: {
      status: params.status,
      requestId: params.requestId,
      amount: params.amount,
    },
  });
}

/**
 * Send KYC notification
 */
export async function sendKycNotification(params: {
  userId: string;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  documentId: string;
  reason?: string;
}): Promise<void> {
  let title: string;
  let body: string;

  switch (params.status) {
    case 'SUBMITTED':
      title = 'Verification submitted';
      body = 'Your verification documents were submitted and are under review.';
      break;
    case 'APPROVED':
      title = 'Verification approved';
      body = 'Your identity has been verified. You can now request payouts.';
      break;
    case 'REJECTED':
      title = 'Verification not approved';
      body = params.reason || 'Your verification was not approved. Please review the requirements and try again.';
      break;
  }

  await sendNotification({
    userId: params.userId,
    type: 'KYC',
    category: 'ACCOUNT',
    title,
    body,
    deepLink: 'avalo://kyc',
    payload: {
      status: params.status,
      documentId: params.documentId,
    },
  });
}

/**
 * Send dispute notification
 */
export async function sendDisputeNotification(params: {
  userId: string;
  disputeId: string;
  role: 'REPORTER' | 'REPORTED';
  status?: string;
}): Promise<void> {
  let title: string;
  let body: string;

  if (params.role === 'REPORTER') {
    title = 'Report submitted';
    body = 'Your report was submitted and will be reviewed by our team.';
  } else {
    title = 'Account review';
    body = 'Some activity related to your account is under review. You may be contacted for more information.';
  }

  await sendNotification({
    userId: params.userId,
    type: 'DISPUTE',
    category: 'ACCOUNT',
    title,
    body,
    deepLink: `avalo://disputes/${params.disputeId}`,
    payload: {
      disputeId: params.disputeId,
      role: params.role,
    },
  });
}

/**
 * Send enforcement notification
 */
export async function sendEnforcementNotification(params: {
  userId: string;
  level: 'SOFT' | 'HARD' | 'SUSPENDED';
  reason: string;
}): Promise<void> {
  let title: string;
  let body: string;

  switch (params.level) {
    case 'SOFT':
      title = 'Account warning';
      body = 'Some features may be limited due to policy concerns. Contact support if you believe this is an error.';
      break;
    case 'HARD':
      title = 'Account restrictions';
      body = 'Your account has restrictions. Some features are limited. Contact support for details.';
      break;
    case 'SUSPENDED':
      title = 'Account suspended';
      body = 'Your account has been suspended. Contact support for more information.';
      break;
  }

  await sendNotification({
    userId: params.userId,
    type: 'ENFORCEMENT',
    category: 'ACCOUNT',
    title,
    body,
    deepLink: 'avalo://support',
    payload: {
      level: params.level,
    },
    forceChannels: ['IN_APP', 'PUSH'], // Force both channels for enforcement
  });
}

/**
 * Send legal update notification (requires acceptance)
 */
export async function sendLegalUpdateNotification(params: {
  userId: string;
  documentType: 'TOS' | 'PRIVACY' | 'PAYOUT_TERMS';
  version: string;
}): Promise<void> {
  await sendNotification({
    userId: params.userId,
    type: 'LEGAL_UPDATE',
    category: 'LEGAL',
    title: 'Terms update required',
    body: `To continue using Avalo, you need to review and accept the updated ${params.documentType}`,
    deepLink: 'avalo://legal',
    payload: {
      documentType: params.documentType,
      version: params.version,
    },
    forceChannels: ['IN_APP', 'PUSH'], // Force both channels for legal updates
  });
}

/**
 * Send safety alert (timer expired or panic button)
 */
export async function sendSafetyNotification(params: {
  userId: string;
  type: 'TIMER_EXPIRING' | 'TIMER_EXPIRED' | 'PANIC_BUTTON';
  alertUserId?: string;
  alertUserName?: string;
  timerId?: string;
}): Promise<void> {
  let title: string;
  let body: string;

  switch (params.type) {
    case 'TIMER_EXPIRING':
      title = 'Safety timer expiring soon';
      body = 'Your safety timer expires in 5 minutes. Please check in.';
      break;
    case 'TIMER_EXPIRED':
      title = 'Safety timer expired';
      body = params.alertUserName
        ? `${params.alertUserName} did not check in after their meeting. Check the app for details.`
        : 'A safety timer has expired. Check the app for details.';
      break;
    case 'PANIC_BUTTON':
      title = 'Safety alert';
      body = params.alertUserName
        ? `${params.alertUserName} has triggered their panic button. Check their status in the app.`
        : 'A panic button has been triggered. Check the app for details.';
      break;
  }

  await sendNotification({
    userId: params.userId,
    type: 'SAFETY',
    category: 'SAFETY',
    title,
    body,
    deepLink: params.timerId ? `avalo://safety/${params.timerId}` : 'avalo://safety',
    payload: {
      safetyType: params.type,
      alertUserId: params.alertUserId,
      timerId: params.timerId,
    },
    forceChannels: ['IN_APP', 'PUSH'], // Force both channels for safety alerts
  });
}

/**
 * Send system notification
 */
export async function sendSystemNotification(params: {
  userId: string;
  title: string;
  body: string;
  deepLink?: string;
}): Promise<void> {
  await sendNotification({
    userId: params.userId,
    type: 'SYSTEM',
    category: 'INFO',
    title: params.title,
    body: params.body,
    deepLink: params.deepLink,
  });
}

// ============================================================================
// DEVICE MANAGEMENT
// ============================================================================

/**
 * Register or update a device push token
 */
export async function registerDevicePushToken(params: {
  userId: string;
  deviceId: string;
  pushToken: string;
  platform: 'ios' | 'android' | 'web';
}): Promise<void> {
  const deviceRef = db.collection('user_devices').doc(`${params.userId}_${params.deviceId}`);

  await deviceRef.set(
    {
      userId: params.userId,
      deviceId: params.deviceId,
      pushToken: params.pushToken,
      platform: params.platform,
      updatedAt: Timestamp.now(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  logger.info(`Registered push token for user ${params.userId}, device ${params.deviceId}`);
}

/**
 * Unregister a device push token
 */
export async function unregisterDevicePushToken(params: {
  userId: string;
  deviceId: string;
}): Promise<void> {
  const deviceRef = db.collection('user_devices').doc(`${params.userId}_${params.deviceId}`);
  await deviceRef.delete();

  logger.info(`Unregistered push token for user ${params.userId}, device ${params.deviceId}`);
}

// ============================================================================
// NOTIFICATION SETTINGS MANAGEMENT
// ============================================================================

/**
 * Update user notification settings
 */
export async function updateUserNotificationSettings(
  userId: string,
  updates: Partial<Omit<UserNotificationSettings, 'userId' | 'updatedAt'>>
): Promise<void> {
  const settingsRef = db.collection('user_notification_settings').doc(userId);

  // Ensure mandatory categories cannot be disabled
  if (updates.categories) {
    updates.categories.LEGAL = true;
    updates.categories.SAFETY = true;
  }

  await settingsRef.set(
    {
      userId,
      ...updates,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );

  logger.info(`Updated notification settings for user ${userId}`);
}

/**
 * Mark notification as read
 */
export async function markNotificationRead(notificationId: string): Promise<void> {
  const notificationRef = db.collection('notifications').doc(notificationId);
  await notificationRef.update({
    read: true,
  });
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  const unreadQuery = await db
    .collection('notifications')
    .where('userId', '==', userId)
    .where('read', '==', false)
    .get();

  if (unreadQuery.empty) {
    return;
  }

  const batch = db.batch();
  unreadQuery.docs.forEach((doc) => {
    batch.update(doc.ref, { read: true });
  });

  await batch.commit();
  logger.info(`Marked all notifications as read for user ${userId}`);
}