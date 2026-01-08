/**
 * PACK 315 - Push Notifications & Growth Funnels
 * Notification Processing and Sending
 */

import { getFirestore, Firestore, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  Notification,
  UserDevice,
  NotificationPreferences,
  ProcessNotificationResult,
  SendPushResult,
  PushPayload,
  NotificationRateLimit,
  NotificationConfig
} from './types';
import { getLocalizedText } from './templates';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CONFIG: NotificationConfig = {
  maxTransactionalPerDay: 20,
  maxSocialPerDay: 10,
  maxGrowthPerDay: 2,
  maxMarketingPerDay: 1,
  
  maxRetryAttempts: 3,
  retryDelayMinutes: 5,
  
  allowTransactionalInQuietHours: true,
  allowSafetyInQuietHours: true,
  
  batchSize: 100,
  processingIntervalMinutes: 5
};

// ============================================================================
// Main Processing Function
// ============================================================================

/**
 * Process pending notifications
 * Runs every 5 minutes via Cloud Scheduler
 */
export const processPendingNotifications = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'UTC',
    memory: '512MiB',
    timeoutSeconds: 540
  },
  async (event) => {
    const db = getFirestore();
    const config = DEFAULT_CONFIG;
    
    try {
      logger.info('Starting notification processing batch');
      
      const now = new Date().toISOString();
      const snapshot = await db
        .collection('notifications')
        .where('status', '==', 'PENDING')
        .where('scheduledAt', '<=', now)
        .limit(config.batchSize)
        .get();
      
      if (snapshot.empty) {
        logger.info('No pending notifications to process');
        return;
      }
      
      logger.info(`Processing ${snapshot.size} notifications`);
      
      const results = await Promise.allSettled(
        snapshot.docs.map(doc => 
          processNotification(db, doc.data() as Notification, config)
        )
      );
      
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      logger.info('Batch processing complete', {
        total: snapshot.size,
        succeeded,
        failed
      });
    } catch (error) {
      logger.error('Error in notification processing', { error });
      throw error;
    }
  }
);

// ============================================================================
// Single Notification Processing
// ============================================================================

/**
 * Process a single notification
 */
async function processNotification(
  db: Firestore,
  notification: Notification,
  config: NotificationConfig
): Promise<ProcessNotificationResult> {
  try {
    // Load user context
    const userDoc = await db.collection('users').doc(notification.userId).get();
    if (!userDoc.exists) {
      await markNotificationFailed(db, notification.notificationId, 'User not found');
      return {
        notificationId: notification.notificationId,
        success: false,
        sentToDevices: 0,
        failedDevices: 0,
        errors: ['User not found'],
        skippedReason: 'NO_DEVICES'
      };
    }
    
    const userData = userDoc.data()!;
    const language = userData.language || notification.language || 'en';
    const country = userData.country || 'PL';
    const timeZone = userData.timeZone || 'Europe/Warsaw';
    
    // Load preferences
    const settingsDoc = await db.collection('users').doc(notification.userId)
      .collection('settings').doc('notifications').get();
    
    const preferences: NotificationPreferences = settingsDoc.exists 
      ? settingsDoc.data() as NotificationPreferences
      : getDefaultPreferences();
    
    // Check if notifications are enabled
    if (!preferences.pushEnabled) {
      await markNotificationFailed(db, notification.notificationId, 'Push disabled');
      return {
        notificationId: notification.notificationId,
        success: false,
        sentToDevices: 0,
        failedDevices: 0,
        errors: ['Push notifications disabled'],
        skippedReason: 'USER_PREFERENCE'
      };
    }
    
    // Check category preferences
    const categoryKey = notification.category.toLowerCase() as keyof typeof preferences.categories;
    if (!preferences.categories[categoryKey]) {
      await markNotificationFailed(db, notification.notificationId, 'Category disabled');
      return {
        notificationId: notification.notificationId,
        success: false,
        sentToDevices: 0,
        failedDevices: 0,
        errors: ['Category disabled'],
        skippedReason: 'USER_PREFERENCE'
      };
    }
    
    // Check quiet hours (except for transactional/safety)
    if (notification.category === 'GROWTH' || notification.category === 'MARKETING') {
      if (isInQuietHours(preferences, timeZone)) {
        // Reschedule for end of quiet hours
        const rescheduledAt = calculateQuietHoursEnd(preferences, timeZone);
        await db.collection('notifications').doc(notification.notificationId).update({
          scheduledAt: rescheduledAt,
          updatedAt: new Date().toISOString()
        });
        
        return {
          notificationId: notification.notificationId,
          success: false,
          sentToDevices: 0,
          failedDevices: 0,
          errors: ['In quiet hours'],
          skippedReason: 'QUIET_HOURS'
        };
      }
    }
    
    // Check rate limits
    const rateLimitOk = await checkRateLimit(db, notification, config);
    if (!rateLimitOk) {
      await markNotificationFailed(db, notification.notificationId, 'Rate limit exceeded');
      return {
        notificationId: notification.notificationId,
        success: false,
        sentToDevices: 0,
        failedDevices: 0,
        errors: ['Rate limit exceeded'],
        skippedReason: 'RATE_LIMIT'
      };
    }
    
    // Load user devices
    const devicesSnapshot = await db
      .collection('userDevices')
      .where('userId', '==', notification.userId)
      .where('enabled', '==', true)
      .get();
    
    if (devicesSnapshot.empty) {
      await markNotificationFailed(db, notification.notificationId, 'No active devices');
      return {
        notificationId: notification.notificationId,
        success: false,
        sentToDevices: 0,
        failedDevices: 0,
        errors: ['No active devices'],
        skippedReason: 'NO_DEVICES'
      };
    }
    
    const devices = devicesSnapshot.docs.map(doc => doc.data() as UserDevice);
    
    // Prepare payload
    const payload: PushPayload = {
      title: getLocalizedText(notification.title, language),
      body: getLocalizedText(notification.body, language),
      data: notification.data,
      imageUrl: notification.data.imageUrl,
      priority: notification.priority
    };
    
    // Send to all devices
    const sendResults = await Promise.allSettled(
      devices.map(device => sendPushToDevice(device, payload))
    );
    
    const sentToDevices = sendResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failedDevices = sendResults.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;
    
    // Update notification status
    if (sentToDevices > 0) {
      await db.collection('notifications').doc(notification.notificationId).update({
        status: 'SENT',
        sentAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        language
      });
      
      // Update rate limit counter
      await incrementRateLimit(db, notification);
      
      // Log analytics event
      await logNotificationSent(db, notification, language, country, devices[0]?.appVersion || '1.0.0', devices[0]?.platform || 'WEB');
      
      logger.info('Notification sent successfully', {
        notificationId: notification.notificationId,
        userId: notification.userId,
        devices: sentToDevices
      });
      
      return {
        notificationId: notification.notificationId,
        success: true,
        sentToDevices,
        failedDevices,
        errors: []
      };
    } else {
      // All sends failed
      const newAttempts = notification.attempts + 1;
      if (newAttempts >= config.maxRetryAttempts) {
        await markNotificationFailed(db, notification.notificationId, 'Max retries exceeded');
      } else {
        // Retry later
        const retryAt = new Date(Date.now() + config.retryDelayMinutes * 60 * 1000).toISOString();
        await db.collection('notifications').doc(notification.notificationId).update({
          attempts: newAttempts,
          scheduledAt: retryAt,
          updatedAt: new Date().toISOString()
        });
      }
      
      return {
        notificationId: notification.notificationId,
        success: false,
        sentToDevices: 0,
        failedDevices,
        errors: ['All devices failed']
      };
    }
  } catch (error: any) {
    logger.error('Error processing notification', {
      notificationId: notification.notificationId,
      error: error.message
    });
    
    await markNotificationFailed(db, notification.notificationId, error.message);
    
    return {
      notificationId: notification.notificationId,
      success: false,
      sentToDevices: 0,
      failedDevices: 0,
      errors: [error.message]
    };
  }
}

// ============================================================================
// Push Sending
// ============================================================================

/**
 * Send push notification to a single device
 */
async function sendPushToDevice(
  device: UserDevice,
  payload: PushPayload
): Promise<SendPushResult> {
  try {
    if (!device.pushToken) {
      return {
        success: false,
        deviceId: device.deviceId,
        platform: device.platform,
        error: 'No push token'
      };
    }
    
    const messaging = getMessaging();
    
    const message = {
      token: device.pushToken,
      notification: {
        title: payload.title,
        body: payload.body,
        ...(payload.imageUrl && { imageUrl: payload.imageUrl })
      },
      data: {
        ...payload.data,
        screen: payload.data.screen || 'HOME',
        screenParams: JSON.stringify(payload.data.screenParams || {})
      },
      android: {
        priority: (payload.priority === 'HIGH' ? 'high' : 'normal') as 'high' | 'normal',
        notification: {
          channelId: 'default',
          priority: (payload.priority === 'HIGH' ? 'high' : 'default') as 'high' | 'default'
        }
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: payload.title,
              body: payload.body
            },
            sound: 'default',
            badge: 1
          }
        }
      },
      webpush: {
        notification: {
          title: payload.title,
          body: payload.body,
          icon: '/icon-192.png',
          ...(payload.imageUrl && { image: payload.imageUrl })
        }
      }
    };
    
    await messaging.send(message);
    
    return {
      success: true,
      deviceId: device.deviceId,
      platform: device.platform
    };
  } catch (error: any) {
    logger.error('Failed to send push to device', {
      deviceId: device.deviceId,
      error: error.message
    });
    
    // Handle invalid tokens
    if (error.code === 'messaging/invalid-registration-token' || 
        error.code === 'messaging/registration-token-not-registered') {
      // Mark device as disabled
      const db = getFirestore();
      await db.collection('userDevices').doc(device.deviceId).update({
        enabled: false,
        updatedAt: new Date().toISOString()
      });
    }
    
    return {
      success: false,
      deviceId: device.deviceId,
      platform: device.platform,
      error: error.message,
      errorCode: error.code
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function getDefaultPreferences(): NotificationPreferences {
  return {
    pushEnabled: true,
    emailEnabled: false,
    categories: {
      transactional: true,
      social: true,
      growth: true,
      marketing: false
    },
    quietHours: {
      enabled: false,
      startLocalTime: '22:00',
      endLocalTime: '08:00'
    }
  };
}

function isInQuietHours(preferences: NotificationPreferences, timeZone: string): boolean {
  if (!preferences.quietHours.enabled) {
    return false;
  }
  
  const now = new Date();
  const localTime = now.toLocaleTimeString('en-US', { 
    timeZone, 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  const [currentHour, currentMinute] = localTime.split(':').map(Number);
  const currentMinutes = currentHour * 60 + currentMinute;
  
  const [startHour, startMinute] = preferences.quietHours.startLocalTime.split(':').map(Number);
  const startMinutes = startHour * 60 + startMinute;
  
  const [endHour, endMinute] = preferences.quietHours.endLocalTime.split(':').map(Number);
  const endMinutes = endHour * 60 + endMinute;
  
  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Quiet hours cross midnight
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

function calculateQuietHoursEnd(preferences: NotificationPreferences, timeZone: string): string {
  const now = new Date();
  const [endHour, endMinute] = preferences.quietHours.endLocalTime.split(':').map(Number);
  
  const endTime = new Date(now);
  endTime.setHours(endHour, endMinute, 0, 0);
  
  const localTime = now.toLocaleTimeString('en-US', { 
    timeZone, 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  const [currentHour, currentMinute] = localTime.split(':').map(Number);
  const currentMinutes = currentHour * 60 + currentMinute;
  const endMinutes = endHour * 60 + endMinute;
  
  if (currentMinutes >= endMinutes) {
    // End time is tomorrow
    endTime.setDate(endTime.getDate() + 1);
  }
  
  return endTime.toISOString();
}

async function checkRateLimit(
  db: Firestore,
  notification: Notification,
  config: NotificationConfig
): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];
  const rateLimitDoc = await db
    .collection('notificationRateLimits')
    .doc(`${notification.userId}_${today}`)
    .get();
  
  if (!rateLimitDoc.exists) {
    return true;
  }
  
  const rateLimit = rateLimitDoc.data() as NotificationRateLimit;
  
  const categoryLimits = {
    TRANSACTIONAL: config.maxTransactionalPerDay,
    GROWTH: config.maxGrowthPerDay,
    MARKETING: config.maxMarketingPerDay,
    SAFETY: config.maxTransactionalPerDay // Safety uses transactional limits
  };
  
  const categoryKey = notification.category.toLowerCase() as keyof typeof rateLimit.counts;
  const currentCount = rateLimit.counts[categoryKey] || 0;
  const limit = categoryLimits[notification.category];
  
  return currentCount < limit;
}

async function incrementRateLimit(
  db: Firestore,
  notification: Notification
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const docId = `${notification.userId}_${today}`;
  const categoryKey = notification.category.toLowerCase();
  
  const ref = db.collection('notificationRateLimits').doc(docId);
  const doc = await ref.get();
  
  if (!doc.exists) {
    await ref.set({
      userId: notification.userId,
      date: today,
      counts: {
        transactional: notification.category === 'TRANSACTIONAL' ? 1 : 0,
        social: 0,
        growth: notification.category === 'GROWTH' ? 1 : 0,
        marketing: notification.category === 'MARKETING' ? 1 : 0,
        total: 1
      },
      lastResetAt: new Date().toISOString()
    });
  } else {
    await ref.update({
      [`counts.${categoryKey}`]: (doc.data()!.counts[categoryKey] || 0) + 1,
      'counts.total': (doc.data()!.counts.total || 0) + 1
    });
  }
}

async function markNotificationFailed(
  db: Firestore,
  notificationId: string,
  reason: string
): Promise<void> {
  await db.collection('notifications').doc(notificationId).update({
    status: 'FAILED',
    updatedAt: new Date().toISOString()
  });
  
  logger.warn('Notification marked as failed', { notificationId, reason });
}

async function logNotificationSent(
  db: Firestore,
  notification: Notification,
  language: string,
  country: string,
  appVersion: string,
  platform: string
): Promise<void> {
  try {
    await db.collection('notificationEvents').add({
      notificationId: notification.notificationId,
      userId: notification.userId,
      eventType: 'SENT',
      notificationType: notification.type,
      category: notification.category,
      timestamp: new Date().toISOString(),
      country,
      appVersion,
      platform,
      language,
      ...(notification.funnelId && { funnelId: notification.funnelId }),
      ...(notification.stepNumber !== undefined && { stepNumber: notification.stepNumber })
    });
  } catch (error) {
    logger.error('Failed to log notification sent event', { error });
  }
}