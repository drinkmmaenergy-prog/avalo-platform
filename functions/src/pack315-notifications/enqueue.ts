/**
 * PACK 315 - Push Notifications & Growth Funnels
 * Notification Enqueue Helper
 */

import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import {
  Notification,
  NotificationType,
  NotificationCategory,
  NotificationData,
  EnqueueNotificationParams,
  LocalizedText
} from './types';
import { getTemplate, getLocalizedText } from './templates';
import { logger } from 'firebase-functions/v2';

// ============================================================================
// Enqueue Notification
// ============================================================================

/**
 * Enqueue a notification for processing
 * This is the main entry point for creating notifications
 */
export async function enqueueNotification(
  db: Firestore,
  params: EnqueueNotificationParams
): Promise<string> {
  try {
    const {
      userId,
      type,
      category,
      data,
      scheduledAtOverride,
      funnelId,
      stepNumber,
      priority,
      templateOverride
    } = params;

    // Get template
    const template = getTemplate(type);
    
    // Use template override if provided, otherwise use template
    const title: LocalizedText = templateOverride?.title || template.title;
    const body: LocalizedText = templateOverride?.body || template.body;
    
    // Determine scheduled time
    const scheduledAt = scheduledAtOverride || new Date().toISOString();
    
    // Create notification document
    const notificationId = uuidv4();
    const notification: Notification = {
      notificationId,
      userId,
      type,
      category,
      
      title,
      body,
      
      data: data || {
        screen: template.defaultScreen as any
      },
      
      language: 'en', // Will be determined at send-time based on user preference
      status: 'PENDING',
      attempts: 0,
      
      scheduledAt,
      sentAt: null,
      
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      
      // Optional metadata
      ...(funnelId && { funnelId }),
      ...(stepNumber !== undefined && { stepNumber }),
      priority: priority || template.priority || 'NORMAL'
    };

    // Save to Firestore
    await db.collection('notifications').doc(notificationId).set(notification);

    // Log analytics event
    await logNotificationEvent(db, {
      eventType: 'ENQUEUED',
      notificationId,
      userId,
      notificationType: type,
      category,
      funnelId,
      stepNumber
    });

    logger.info('Notification enqueued', {
      notificationId,
      userId,
      type,
      category,
      scheduledAt
    });

    return notificationId;
  } catch (error) {
    logger.error('Failed to enqueue notification', {
      error,
      params
    });
    throw error;
  }
}

// ============================================================================
// Batch Enqueue
// ============================================================================

/**
 * Enqueue multiple notifications in batch
 * Useful for bulk operations like growth campaigns
 */
export async function enqueueNotificationsBatch(
  db: Firestore,
  paramsList: EnqueueNotificationParams[]
): Promise<string[]> {
  const notificationIds: string[] = [];
  
  // Process in batches of 500 (Firestore limit)
  const BATCH_SIZE = 500;
  
  for (let i = 0; i < paramsList.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const currentBatch = paramsList.slice(i, i + BATCH_SIZE);
    
    for (const params of currentBatch) {
      const {
        userId,
        type,
        category,
        data,
        scheduledAtOverride,
        funnelId,
        stepNumber,
        priority,
        templateOverride
      } = params;

      const template = getTemplate(type);
      const title: LocalizedText = templateOverride?.title || template.title;
      const body: LocalizedText = templateOverride?.body || template.body;
      const scheduledAt = scheduledAtOverride || new Date().toISOString();
      
      const notificationId = uuidv4();
      const notification: Notification = {
        notificationId,
        userId,
        type,
        category,
        title,
        body,
        data: data || { screen: template.defaultScreen as any },
        language: 'en',
        status: 'PENDING',
        attempts: 0,
        scheduledAt,
        sentAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...(funnelId && { funnelId }),
        ...(stepNumber !== undefined && { stepNumber }),
        priority: priority || template.priority || 'NORMAL'
      };

      const ref = db.collection('notifications').doc(notificationId);
      batch.set(ref, notification);
      notificationIds.push(notificationId);
    }
    
    await batch.commit();
  }

  logger.info('Batch notifications enqueued', {
    count: notificationIds.length
  });

  return notificationIds;
}

// ============================================================================
// Analytics Helper
// ============================================================================

interface LogEventParams {
  eventType: 'ENQUEUED' | 'SENT' | 'OPENED' | 'DISMISSED' | 'FAILED';
  notificationId: string;
  userId: string;
  notificationType: NotificationType;
  category: NotificationCategory;
  funnelId?: string;
  stepNumber?: number;
  deviceId?: string;
  platform?: string;
  country?: string;
  appVersion?: string;
  language?: string;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Log notification analytics event
 */
async function logNotificationEvent(
  db: Firestore,
  params: LogEventParams
): Promise<void> {
  try {
    const eventId = uuidv4();
    const event = {
      eventId,
      timestamp: new Date().toISOString(),
      ...params
    };

    await db.collection('notificationEvents').doc(eventId).set(event);
  } catch (error) {
    // Don't throw - analytics failures shouldn't block notifications
    logger.error('Failed to log notification event', { error, params });
  }
}

// ============================================================================
// Notification Helpers
// ============================================================================

/**
 * Check if a notification already exists for a user/type combination
 * Useful to avoid duplicate notifications
 */
export async function hasRecentNotification(
  db: Firestore,
  userId: string,
  type: NotificationType,
  withinMinutes: number = 60
): Promise<boolean> {
  const cutoffTime = new Date(Date.now() - withinMinutes * 60 * 1000).toISOString();
  
  const snapshot = await db
    .collection('notifications')
    .where('userId', '==', userId)
    .where('type', '==', type)
    .where('createdAt', '>', cutoffTime)
    .limit(1)
    .get();
  
  return !snapshot.empty;
}

/**
 * Cancel pending notification(s)
 */
export async function cancelNotification(
  db: Firestore,
  notificationId: string
): Promise<void> {
  const ref = db.collection('notifications').doc(notificationId);
  const doc = await ref.get();
  
  if (doc.exists && doc.data()?.status === 'PENDING') {
    await ref.update({
      status: 'FAILED',
      updatedAt: new Date().toISOString()
    });
    
    logger.info('Notification cancelled', { notificationId });
  }
}

/**
 * Cancel all pending notifications for a user
 */
export async function cancelUserNotifications(
  db: Firestore,
  userId: string,
  types?: NotificationType[]
): Promise<number> {
  let query = db
    .collection('notifications')
    .where('userId', '==', userId)
    .where('status', '==', 'PENDING');
  
  if (types && types.length > 0) {
    query = query.where('type', 'in', types);
  }
  
  const snapshot = await query.get();
  const batch = db.batch();
  
  snapshot.docs.forEach(doc => {
    batch.update(doc.ref, {
      status: 'FAILED',
      updatedAt: new Date().toISOString()
    });
  });
  
  await batch.commit();
  
  logger.info('User notifications cancelled', {
    userId,
    count: snapshot.size,
    types
  });
  
  return snapshot.size;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick enqueue for common notification types
 */

export async function enqueueNewMessage(
  db: Firestore,
  userId: string,
  chatId: string,
  senderName: string
): Promise<string> {
  return enqueueNotification(db, {
    userId,
    type: 'NEW_MESSAGE',
    category: 'TRANSACTIONAL',
    data: {
      screen: 'CHAT',
      screenParams: { chatId }
    },
    templateOverride: {
      body: {
        en: `${senderName} sent you a message`,
        pl: `${senderName} wysłał Ci wiadomość`
      }
    }
  });
}

export async function enqueueBookingConfirmed(
  db: Firestore,
  userId: string,
  bookingId: string
): Promise<string> {
  return enqueueNotification(db, {
    userId,
    type: 'BOOKING_CONFIRMED',
    category: 'TRANSACTIONAL',
    data: {
      screen: 'CALENDAR',
      screenParams: { bookingId }
    }
  });
}

export async function enqueueMeetingReminder(
  db: Firestore,
  userId: string,
  bookingId: string,
  meetingStartTime: Date
): Promise<string> {
  // Schedule for 1 hour before meeting
  const reminderTime = new Date(meetingStartTime.getTime() - 60 * 60 * 1000);
  
  return enqueueNotification(db, {
    userId,
    type: 'MEETING_REMINDER_BEFORE',
    category: 'TRANSACTIONAL',
    data: {
      screen: 'CALENDAR',
      screenParams: { bookingId }
    },
    scheduledAtOverride: reminderTime.toISOString()
  });
}

export async function enqueuePayoutCompleted(
  db: Firestore,
  userId: string,
  payoutId: string,
  amount: number,
  currency: string
): Promise<string> {
  return enqueueNotification(db, {
    userId,
    type: 'PAYOUT_COMPLETED',
    category: 'TRANSACTIONAL',
    data: {
      screen: 'WALLET',
      screenParams: { payoutId }
    },
    templateOverride: {
      body: {
        en: `Your payout of ${amount} ${currency} has been completed successfully.`,
        pl: `Twoja wypłata ${amount} ${currency} została zakończona pomyślnie.`
      }
    }
  });
}

export async function enqueueVerificationNudge(
  db: Firestore,
  userId: string
): Promise<string> {
  return enqueueNotification(db, {
    userId,
    type: 'VERIFICATION_NUDGE',
    category: 'TRANSACTIONAL',
    data: {
      screen: 'VERIFICATION'
    },
    priority: 'HIGH'
  });
}

export async function enqueueGrowthActivation(
  db: Firestore,
  userId: string,
  type: 'PHOTOS' | 'PROFILE' | 'VERIFICATION' | 'FIRST_SWIPE',
  funnelStepNumber: number
): Promise<string> {
  const typeMap = {
    PHOTOS: 'GROWTH_ACTIVATION_PHOTOS',
    PROFILE: 'GROWTH_ACTIVATION_PROFILE',
    VERIFICATION: 'GROWTH_ACTIVATION_VERIFICATION',
    FIRST_SWIPE: 'GROWTH_ACTIVATION_FIRST_SWIPE'
  } as const;

  return enqueueNotification(db, {
    userId,
    type: typeMap[type] as NotificationType,
    category: 'GROWTH',
    funnelId: 'ACTIVATION_PROFILE_COMPLETION',
    stepNumber: funnelStepNumber
  });
}

export async function enqueueGrowthRetention(
  db: Firestore,
  userId: string,
  type: 'NEW_PEOPLE' | 'UNSEEN_LIKES' | 'AI_WAITING' | 'COMEBACK',
  daysSinceLastActive: number
): Promise<string> {
  const typeMap = {
    NEW_PEOPLE: 'GROWTH_RETENTION_NEW_PEOPLE',
    UNSEEN_LIKES: 'GROWTH_RETENTION_UNSEEN_LIKES',
    AI_WAITING: 'GROWTH_RETENTION_AI_WAITING',
    COMEBACK: 'GROWTH_RETENTION_COMEBACK'
  } as const;

  const funnelIdMap = {
    3: 'RETENTION_3_DAY',
    7: 'RETENTION_7_DAY',
    14: 'RETENTION_14_DAY'
  } as const;

  const funnelId = funnelIdMap[daysSinceLastActive as keyof typeof funnelIdMap] || 'RETENTION_7_DAY';

  return enqueueNotification(db, {
    userId,
    type: typeMap[type] as NotificationType,
    category: 'GROWTH',
    funnelId
  });
}