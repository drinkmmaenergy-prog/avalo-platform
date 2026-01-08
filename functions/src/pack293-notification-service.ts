/**
 * PACK 293 - Notifications & Activity Center
 * Core notification service for creating and managing notifications
 */

import * as admin from 'firebase-admin';
import {
  NotificationPayload,
  NotificationDocument,
  NotificationSettingsDocument,
  NotificationThrottleDocument,
  NotificationPriority,
  NotificationType,
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_TYPE_TO_CHANNEL,
  THROTTLE_LIMITS,
  isCriticalPriority,
  isSafetyNotification,
} from './pack293-notification-types';

const db = admin.firestore();

// ============================================================================
// NOTIFICATION SETTINGS
// ============================================================================

/**
 * Get or create user notification settings
 */
export async function getUserNotificationSettings(
  userId: string
): Promise<NotificationSettingsDocument> {
  const settingsRef = db.collection('notificationSettings').doc(userId);
  const settingsSnap = await settingsRef.get();

  if (settingsSnap.exists) {
    return settingsSnap.data() as NotificationSettingsDocument;
  }

  // Create default settings
  const defaultSettings: NotificationSettingsDocument = {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    userId,
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
  };

  await settingsRef.set(defaultSettings);
  return defaultSettings;
}

/**
 * Update user notification settings
 */
export async function updateUserNotificationSettings(
  userId: string,
  updates: Partial<Omit<NotificationSettingsDocument, 'userId' | 'createdAt'>>
): Promise<void> {
  const settingsRef = db.collection('notificationSettings').doc(userId);
  
  await settingsRef.set(
    {
      ...updates,
      updatedAt: admin.firestore.Timestamp.now(),
    },
    { merge: true }
  );
}

// ============================================================================
// QUIET HOURS CHECK
// ============================================================================

/**
 * Check if notification should be delayed due to quiet hours
 * Returns true if in quiet hours (and should be delayed)
 */
export function isInQuietHours(
  settings: NotificationSettingsDocument,
  userTimezone: string = 'UTC'
): boolean {
  if (!settings.quietHours.enabled) {
    return false;
  }

  try {
    // Get current time in user's timezone
    const now = new Date();
    const userTime = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
    const currentHour = userTime.getHours();
    const currentMinute = userTime.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;

    // Parse quiet hours
    const [startHour, startMin] = settings.quietHours.startLocalTime.split(':').map(Number);
    const [endHour, endMin] = settings.quietHours.endLocalTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    // Handle quiet hours spanning midnight
    if (startMinutes > endMinutes) {
      return currentTimeMinutes >= startMinutes || currentTimeMinutes < endMinutes;
    } else {
      return currentTimeMinutes >= startMinutes && currentTimeMinutes < endMinutes;
    }
  } catch (error) {
    console.error('Error checking quiet hours:', error);
    return false;
  }
}

// ============================================================================
// THROTTLE MANAGEMENT
// ============================================================================

/**
 * Get or initialize throttle tracking for user
 */
async function getUserThrottle(userId: string): Promise<NotificationThrottleDocument> {
  const throttleRef = db.collection('notificationThrottle').doc(userId);
  const throttleSnap = await throttleRef.get();

  const now = admin.firestore.Timestamp.now();

  if (throttleSnap.exists) {
    const throttle = throttleSnap.data() as NotificationThrottleDocument;
    
    // Reset hourly counter if needed
    const hoursSinceLastReset = (now.toMillis() - throttle.lastHourReset.toMillis()) / (1000 * 60 * 60);
    if (hoursSinceLastReset >= 1) {
      throttle.hourlyCount = 0;
      throttle.lowPriorityHourlyCount = 0;
      throttle.lastHourReset = now;
    }

    // Reset daily counter if needed
    const daysSinceLastReset = (now.toMillis() - throttle.lastDayReset.toMillis()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastReset >= 1) {
      throttle.dailyCount = 0;
      throttle.lastDayReset = now;
    }

    return throttle;
  }

  // Initialize new throttle
  const newThrottle: NotificationThrottleDocument = {
    userId,
    hourlyCount: 0,
    dailyCount: 0,
    lastHourReset: now,
    lastDayReset: now,
    lowPriorityHourlyCount: 0,
  };

  await throttleRef.set(newThrottle);
  return newThrottle;
}

/**
 * Check if user has exceeded throttle limits
 */
async function checkThrottleLimits(
  userId: string,
  priority: NotificationPriority
): Promise<{ allowed: boolean; reason?: string }> {
  // Critical notifications always bypass throttle
  if (isCriticalPriority(priority)) {
    return { allowed: true };
  }

  const throttle = await getUserThrottle(userId);

  // Check hourly limit
  if (throttle.hourlyCount >= THROTTLE_LIMITS.MAX_PUSH_PER_HOUR) {
    return { allowed: false, reason: 'Hourly limit exceeded' };
  }

  // Check daily limit
  if (throttle.dailyCount >= THROTTLE_LIMITS.MAX_PUSH_PER_DAY) {
    return { allowed: false, reason: 'Daily limit exceeded' };
  }

  // Check low-priority specific limit
  if (priority === 'LOW' && throttle.lowPriorityHourlyCount >= THROTTLE_LIMITS.MAX_LOW_PRIORITY_PER_HOUR) {
    return { allowed: false, reason: 'Low priority hourly limit exceeded' };
  }

  return { allowed: true };
}

/**
 * Increment throttle counters
 */
async function incrementThrottle(
  userId: string,
  priority: NotificationPriority
): Promise<void> {
  const throttleRef = db.collection('notificationThrottle').doc(userId);
  
  const updates: Partial<NotificationThrottleDocument> = {
    hourlyCount: admin.firestore.FieldValue.increment(1) as any,
    dailyCount: admin.firestore.FieldValue.increment(1) as any,
  };

  if (priority === 'LOW') {
    updates.lowPriorityHourlyCount = admin.firestore.FieldValue.increment(1) as any;
  }

  await throttleRef.update(updates);
}

// ============================================================================
// CONTENT SAFETY VALIDATION
// ============================================================================

/**
 * Sanitize notification content for safety
 * Removes explicit content and sensitive data
 */
function sanitizeNotificationContent(title: string, body: string): { title: string; body: string } {
  // List of prohibited words/patterns (simplified - should be more comprehensive)
  const prohibitedPatterns = [
    /\b(sex|porn|xxx|explicit)\b/gi,
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // Phone numbers
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
  ];

  let sanitizedTitle = title;
  let sanitizedBody = body;

  for (const pattern of prohibitedPatterns) {
    sanitizedTitle = sanitizedTitle.replace(pattern, '***');
    sanitizedBody = sanitizedBody.replace(pattern, '***');
  }

  // Truncate if too long
  if (sanitizedTitle.length > 100) {
    sanitizedTitle = sanitizedTitle.substring(0, 97) + '...';
  }
  if (sanitizedBody.length > 500) {
    sanitizedBody = sanitizedBody.substring(0, 497) + '...';
  }

  return { title: sanitizedTitle, body: sanitizedBody };
}

// ============================================================================
// CORE NOTIFICATION SERVICE
// ============================================================================

/**
 * Enqueue a notification for delivery
 * Main entry point for creating notifications
 */
export async function enqueueNotification(
  payload: NotificationPayload
): Promise<string | null> {
  try {
    const { userId, type, title, body, context = {}, priority = 'NORMAL', delivery, batchKey = null } = payload;

    // Sanitize content
    const { title: sanitizedTitle, body: sanitizedBody } = sanitizeNotificationContent(title, body);

    // Get user settings
    const settings = await getUserNotificationSettings(userId);

    // Determine channel settings
    const channelKey = NOTIFICATION_TYPE_TO_CHANNEL[type];
    const channelSettings = settings.channels[channelKey];

    // Apply user preferences to delivery options
    const finalDelivery = {
      push: delivery?.push ?? (channelSettings.push && settings.pushEnabled),
      inApp: delivery?.inApp ?? (channelSettings.inApp && settings.inAppEnabled),
      email: delivery?.email ?? (channelSettings.email && settings.emailEnabled),
    };

    // Safety and critical notifications may override some settings
    if (isSafetyNotification(type) || isCriticalPriority(priority)) {
      finalDelivery.push = true;
      finalDelivery.inApp = true;
    }

    // Check throttle limits for push notifications
    if (finalDelivery.push && !isCriticalPriority(priority)) {
      const throttleCheck = await checkThrottleLimits(userId, priority);
      
      if (!throttleCheck.allowed) {
        // Downgrade to in-app only
        finalDelivery.push = false;
        console.log(`Throttled push notification for user ${userId}: ${throttleCheck.reason}`);
        
        // Log throttled notification
        await logNotification({
          notificationId: '',
          userId,
          type,
          priority,
          channels: ['push'],
          deliveryStatus: 'THROTTLED',
          sentAt: admin.firestore.Timestamp.now(),
          blocked: true,
          blockedReason: throttleCheck.reason,
        });
      }
    }

    // If no delivery channels are enabled, skip
    if (!finalDelivery.push && !finalDelivery.inApp && !finalDelivery.email) {
      console.log(`No delivery channels enabled for notification type ${type} for user ${userId}`);
      return null;
    }

    // Create notification document
    const notificationRef = db.collection('notifications').doc();
    const notificationId = notificationRef.id;

    const notificationDoc: NotificationDocument = {
      notificationId,
      userId,
      type,
      title: sanitizedTitle,
      body: sanitizedBody,
      context,
      delivery: finalDelivery,
      status: 'QUEUED',
      createdAt: admin.firestore.Timestamp.now(),
      sentAt: null,
      readAt: null,
      dismissedAt: null,
      priority,
      batchKey,
    };

    await notificationRef.set(notificationDoc);

    // Increment throttle if push is enabled
    if (finalDelivery.push) {
      await incrementThrottle(userId, priority);
    }

    console.log(`Notification ${notificationId} enqueued for user ${userId}`);
    return notificationId;
  } catch (error) {
    console.error('Error enqueuing notification:', error);
    throw error;
  }
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(
  userId: string,
  notificationId: string
): Promise<void> {
  const notificationRef = db.collection('notifications').doc(notificationId);
  const notificationSnap = await notificationRef.get();

  if (!notificationSnap.exists) {
    throw new Error('Notification not found');
  }

  const notification = notificationSnap.data() as NotificationDocument;
  
  if (notification.userId !== userId) {
    throw new Error('Unauthorized');
  }

  await notificationRef.update({
    status: 'READ',
    readAt: admin.firestore.Timestamp.now(),
  });
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  const notificationsQuery = db
    .collection('notifications')
    .where('userId', '==', userId)
    .where('status', 'in', ['QUEUED', 'SENT', 'DELIVERED']);

  const snapshot = await notificationsQuery.get();
  
  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    batch.update(doc.ref, {
      status: 'READ',
      readAt: admin.firestore.Timestamp.now(),
    });
  });

  await batch.commit();
}

/**
 * Dismiss notification
 */
export async function dismissNotification(
  userId: string,
  notificationId: string
): Promise<void> {
  const notificationRef = db.collection('notifications').doc(notificationId);
  const notificationSnap = await notificationRef.get();

  if (!notificationSnap.exists) {
    throw new Error('Notification not found');
  }

  const notification = notificationSnap.data() as NotificationDocument;
  
  if (notification.userId !== userId) {
    throw new Error('Unauthorized');
  }

  await notificationRef.update({
    status: 'DISMISSED',
    dismissedAt: admin.firestore.Timestamp.now(),
  });
}

/**
 * Get unread notification count
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const notificationsQuery = db
    .collection('notifications')
    .where('userId', '==', userId)
    .where('status', 'in', ['QUEUED', 'SENT', 'DELIVERED']);

  const snapshot = await notificationsQuery.get();
  return snapshot.size;
}

// ============================================================================
// NOTIFICATION LOGGING
// ============================================================================

/**
 * Log notification delivery for analytics
 */
async function logNotification(log: Omit<any, 'logId'>): Promise<void> {
  const logRef = db.collection('notificationLogs').doc();
  await logRef.set({
    logId: logRef.id,
    ...log,
  });
}

/**
 * Log successful notification delivery
 */
export async function logNotificationSuccess(
  notificationId: string,
  notification: NotificationDocument,
  channels: string[]
): Promise<void> {
  await logNotification({
    notificationId,
    userId: notification.userId,
    type: notification.type,
    priority: notification.priority,
    channels,
    deliveryStatus: 'SUCCESS',
    sentAt: admin.firestore.Timestamp.now(),
    blocked: false,
  });
}

/**
 * Log failed notification delivery
 */
export async function logNotificationFailure(
  notificationId: string,
  notification: NotificationDocument,
  channels: string[],
  reason: string
): Promise<void> {
  await logNotification({
    notificationId,
    userId: notification.userId,
    type: notification.type,
    priority: notification.priority,
    channels,
    deliveryStatus: 'FAILED',
    failureReason: reason,
    sentAt: admin.firestore.Timestamp.now(),
    blocked: false,
  });
}