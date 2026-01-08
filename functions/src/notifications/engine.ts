/**
 * PACK 169 - Notification Engine
 * Core notification sending and management with ethical safeguards
 */

import { db, arrayUnion, increment } from '../init';
import {
  Notification,
  NotificationSettings,
  NotificationCategory,
  NotificationPriority,
  DeliveryChannel,
  NotificationLog,
  NotificationMetrics,
} from './types';
import { governance } from './governance';

interface SendNotificationParams {
  userId: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string;
  data?: Record<string, any>;
  actionUrl?: string;
  imageUrl?: string;
  channels?: DeliveryChannel[];
}

export class NotificationEngine {
  /**
   * Send a notification with full governance checks
   */
  async sendNotification(params: SendNotificationParams): Promise<{
    success: boolean;
    notificationId?: string;
    blocked?: boolean;
    reason?: string;
  }> {
    try {
      // Step 1: Run governance checks
      const governanceResult = governance.checkNotification({
        title: params.title,
        body: params.body,
        category: params.category,
        data: params.data,
      });

      if (!governanceResult.approved) {
        await this.logBlockedNotification(params, governanceResult);
        return {
          success: false,
          blocked: true,
          reason: governanceResult.blockReasons.join('; '),
        };
      }

      // Step 2: Get user notification settings
      const settings = await this.getUserSettings(params.userId);

      // Check if notifications are globally disabled
      if (!settings.globalEnabled) {
        return {
          success: false,
          blocked: true,
          reason: 'User has notifications disabled',
        };
      }

      // Check do-not-disturb mode
      if (settings.doNotDisturb || settings.snoozedUntil) {
        if (params.priority !== 'urgent') {
          return {
            success: false,
            blocked: true,
            reason: 'User is in do-not-disturb mode',
          };
        }
      }

      // Check DND schedule
      if (this.isInDndSchedule(settings)) {
        if (params.priority !== 'urgent') {
          return {
            success: false,
            blocked: true,
            reason: 'User is in scheduled do-not-disturb period',
          };
        }
      }

      // Step 3: Check category settings
      const categorySettings = settings.categories[params.category];
      if (!categorySettings.enabled) {
        return {
          success: false,
          blocked: true,
          reason: `User has disabled ${params.category} notifications`,
        };
      }

      // Step 4: Check rate limits
      const today = new Date().toISOString().split('T')[0];
      const metrics = await this.getOrCreateMetrics(params.userId, today);

      const rateLimitCheck = governance.checkRateLimits(
        metrics.totalSent,
        metrics.byCategory[params.category].sent,
        {
          maxPerDay: settings.maxNotificationsPerDay,
          maxPerHour: settings.frequencyCaps.perHour,
          categoryMaxPerDay: categorySettings.maxPerDay,
        }
      );

      if (!rateLimitCheck.allowed) {
        return {
          success: false,
          blocked: true,
          reason: rateLimitCheck.reason,
        };
      }

      // Step 5: Check burnout protection
      const burnoutCheck = governance.checkBurnoutProtection(
        metrics.engagementMinutes,
        {
          enabled: settings.burnoutProtection.enabled,
          dailyLimit: settings.burnoutProtection.dailyEngagementLimit,
          cooldownHours: settings.burnoutProtection.cooldownPeriod,
        }
      );

      if (burnoutCheck.protected) {
        return {
          success: false,
          blocked: true,
          reason: `Burnout protection active until ${burnoutCheck.cooldownUntil?.toISOString()}`,
        };
      }

      // Step 6: Determine channels (respect user preferences)
      const channels = params.channels || categorySettings.channels;

      // Step 7: Create notification document
      const notificationRef = db.collection('notifications').doc();
      const notification: Notification = {
        id: notificationRef.id,
        userId: params.userId,
        category: params.category,
        priority: params.priority,
        title: params.title,
        body: params.body,
        data: params.data,
        actionUrl: params.actionUrl,
        imageUrl: params.imageUrl,
        read: false,
        archived: false,
        channels,
        sentVia: [],
        deliveryStatus: {},
        governanceChecked: true,
        governanceFlags: governanceResult.flags,
        createdAt: new Date(),
      };

      // Step 8: Save notification
      await notificationRef.set(notification);

      // Step 9: Send via channels (in background)
      this.deliverViaChannels(notification, channels).catch((err) => {
        console.error('Channel delivery error:', err);
      });

      // Step 10: Update metrics
      await this.updateMetrics(params.userId, today, params.category);

      // Step 11: Log delivery
      await this.logNotification(notification, 'sent');

      return {
        success: true,
        notificationId: notificationRef.id,
      };
    } catch (error) {
      console.error('Failed to send notification:', error);
      return {
        success: false,
        blocked: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get user notification settings (with defaults)
   */
  private async getUserSettings(userId: string): Promise<NotificationSettings> {
    const settingsDoc = await db
      .collection('notification_settings')
      .doc(userId)
      .get();

    if (settingsDoc.exists) {
      return settingsDoc.data() as NotificationSettings;
    }

    // Return default settings
    return this.getDefaultSettings(userId);
  }

  /**
   * Get default notification settings
   */
  private getDefaultSettings(userId: string): NotificationSettings {
    const now = new Date();
    return {
      userId,
      globalEnabled: true,
      doNotDisturb: false,
      maxNotificationsPerDay: 50,
      categories: {
        content: {
          enabled: true,
          channels: ['push', 'in_app'],
          digestType: 'instant',
          maxPerDay: 10,
        },
        digital_products: {
          enabled: true,
          channels: ['push', 'in_app', 'email'],
          digestType: 'daily',
          maxPerDay: 5,
        },
        events: {
          enabled: true,
          channels: ['push', 'in_app', 'email'],
          digestType: 'instant',
          maxPerDay: 10,
        },
        progress: {
          enabled: true,
          channels: ['push', 'in_app'],
          digestType: 'instant',
          maxPerDay: 5,
        },
        clubs: {
          enabled: true,
          channels: ['in_app'],
          digestType: 'weekly',
          maxPerDay: 5,
        },
        messages: {
          enabled: true,
          channels: ['push', 'in_app'],
          digestType: 'instant',
          maxPerDay: 20,
        },
        system: {
          enabled: true,
          channels: ['push', 'in_app', 'email'],
          digestType: 'instant',
          maxPerDay: 10,
        },
      },
      burnoutProtection: {
        enabled: true,
        dailyEngagementLimit: 180, // 3 hours
        cooldownPeriod: 12,
      },
      frequencyCaps: {
        perHour: 10,
        perDay: 50,
        perWeek: 200,
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Check if current time is in DND schedule
   */
  private isInDndSchedule(settings: NotificationSettings): boolean {
    if (!settings.dndSchedule?.enabled) return false;

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    const { startHour, endHour, days } = settings.dndSchedule;

    // Check if current day is in DND days
    if (!days.includes(currentDay)) return false;

    // Check if current hour is in DND hours
    if (startHour <= endHour) {
      return currentHour >= startHour && currentHour < endHour;
    } else {
      // Handle overnight schedules (e.g., 22:00 to 08:00)
      return currentHour >= startHour || currentHour < endHour;
    }
  }

  /**
   * Get or create daily metrics
   */
  private async getOrCreateMetrics(
    userId: string,
    date: string
  ): Promise<NotificationMetrics> {
    const metricsRef = db.collection('notification_metrics').doc(`${userId}_${date}`);
    const metricsDoc = await metricsRef.get();

    if (metricsDoc.exists) {
      return metricsDoc.data() as NotificationMetrics;
    }

    const metrics: NotificationMetrics = {
      userId,
      date,
      totalSent: 0,
      totalDelivered: 0,
      totalRead: 0,
      byCategory: {
        content: { sent: 0, delivered: 0, read: 0 },
        digital_products: { sent: 0, delivered: 0, read: 0 },
        events: { sent: 0, delivered: 0, read: 0 },
        progress: { sent: 0, delivered: 0, read: 0 },
        clubs: { sent: 0, delivered: 0, read: 0 },
        messages: { sent: 0, delivered: 0, read: 0 },
        system: { sent: 0, delivered: 0, read: 0 },
      },
      totalBlocked: 0,
      blockReasons: {},
      engagementMinutes: 0,
      burnoutTriggered: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await metricsRef.set(metrics);
    return metrics;
  }

  /**
   * Update notification metrics
   */
  private async updateMetrics(
    userId: string,
    date: string,
    category: NotificationCategory
  ): Promise<void> {
    const metricsRef = db.collection('notification_metrics').doc(`${userId}_${date}`);
    await metricsRef.update({
      totalSent: increment(1),
      [`byCategory.${category}.sent`]: increment(1),
      updatedAt: new Date(),
    });
  }

  /**
   * Deliver notification via channels
   */
  private async deliverViaChannels(
    notification: Notification,
    channels: DeliveryChannel[]
  ): Promise<void> {
    for (const channel of channels) {
      try {
        await this.deliverViaChannel(notification, channel);
      } catch (error) {
        console.error(`Failed to deliver via ${channel}:`, error);
      }
    }
  }

  /**
   * Deliver via specific channel
   */
  private async deliverViaChannel(
    notification: Notification,
    channel: DeliveryChannel
  ): Promise<void> {
    // Implementation would integrate with:
    // - push: Firebase Cloud Messaging (FCM)
    // - email: SendGrid / AWS SES
    // - sms: Twilio
    // - in_app: Already saved to Firestore

    console.log(`Delivering notification ${notification.id} via ${channel}`);

    // Update notification with delivery status
    await db
      .collection('notifications')
      .doc(notification.id)
      .update({
        sentVia: arrayUnion(channel),
        [`deliveryStatus.${channel}`]: 'sent',
      });
  }

  /**
   * Log notification delivery
   */
  private async logNotification(
    notification: Notification,
    status: 'sent' | 'delivered' | 'failed'
  ): Promise<void> {
    const log: NotificationLog = {
      id: db.collection('notification_logs').doc().id,
      notificationId: notification.id,
      userId: notification.userId,
      category: notification.category,
      channel: 'in_app',
      deliveryStatus: status,
      blocked: false,
      governanceFlags: notification.governanceFlags,
      sentAt: new Date(),
    };

    await db.collection('notification_logs').doc(log.id).set(log);
  }

  /**
   * Log blocked notification
   */
  private async logBlockedNotification(
    params: SendNotificationParams,
    governanceResult: { blockReasons: string[]; flags: string[] }
  ): Promise<void> {
    const log: NotificationLog = {
      id: db.collection('notification_logs').doc().id,
      notificationId: '',
      userId: params.userId,
      category: params.category,
      channel: 'in_app',
      deliveryStatus: 'blocked',
      blocked: true,
      blockReason: governanceResult.blockReasons.join('; '),
      governanceFlags: governanceResult.flags,
      sentAt: new Date(),
    };

    await db.collection('notification_logs').doc(log.id).set(log);

    // Update metrics
    const today = new Date().toISOString().split('T')[0];
    const metricsRef = db.collection('notification_metrics').doc(`${params.userId}_${today}`);
    
    await metricsRef.set(
      {
        userId: params.userId,
        date: today,
        totalBlocked: increment(1),
        blockReasons: {
          [governanceResult.blockReasons[0]]: increment(1),
        },
        updatedAt: new Date(),
      },
      { merge: true }
    );
  }
}

export const notificationEngine = new NotificationEngine();