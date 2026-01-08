/**
 * PACK 169 - Notification Digest System
 * Groups and batches notifications to reduce spam
 */

import { db, increment } from '../init';
import {
  NotificationDigest,
  Notification,
  NotificationCategory,
  DigestType,
  DeliveryChannel,
} from './types';
import { notificationEngine } from './engine';

export class DigestEngine {
  /**
   * Generate daily digest for a user
   */
  async generateDailyDigest(userId: string): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await this.generateDigest(userId, 'daily', yesterday, today);
  }

  /**
   * Generate weekly digest for a user
   */
  async generateWeeklyDigest(userId: string): Promise<void> {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    oneWeekAgo.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await this.generateDigest(userId, 'weekly', oneWeekAgo, today);
  }

  /**
   * Generate digest for a specific period
   */
  private async generateDigest(
    userId: string,
    digestType: DigestType,
    periodStart: Date,
    periodEnd: Date
  ): Promise<void> {
    try {
      // Get user's notification settings
      const settingsDoc = await db
        .collection('notification_settings')
        .doc(userId)
        .get();

      if (!settingsDoc.exists) {
        console.log(`No settings for user ${userId}, skipping digest`);
        return;
      }

      const settings = settingsDoc.data() as any;

      // Get categories that use this digest type
      const categories: NotificationCategory[] = [];
      for (const [category, config] of Object.entries(settings.categories)) {
        const categoryConfig = config as any;
        if (categoryConfig.digestType === digestType && categoryConfig.enabled) {
          categories.push(category as NotificationCategory);
        }
      }

      if (categories.length === 0) {
        console.log(`No categories using ${digestType} digest for user ${userId}`);
        return;
      }

      // Generate digest for each category
      for (const category of categories) {
        await this.generateCategoryDigest(
          userId,
          category,
          digestType,
          periodStart,
          periodEnd
        );
      }
    } catch (error) {
      console.error(`Failed to generate ${digestType} digest for user ${userId}:`, error);
    }
  }

  /**
   * Generate digest for a specific category
   */
  private async generateCategoryDigest(
    userId: string,
    category: NotificationCategory,
    digestType: DigestType,
    periodStart: Date,
    periodEnd: Date
  ): Promise<void> {
    // Get notifications for this category in the period
    const notificationsSnapshot = await db
      .collection('notifications')
      .where('userId', '==', userId)
      .where('category', '==', category)
      .where('createdAt', '>=', periodStart)
      .where('createdAt', '<', periodEnd)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    if (notificationsSnapshot.empty) {
      console.log(`No notifications for ${category} in period`);
      return;
    }

    const notifications = notificationsSnapshot.docs.map(
      (doc) => doc.data() as Notification
    );

    // Create digest summary
    const summary = this.createDigestSummary(category, notifications.length, digestType);

    // Create digest document
    const digestRef = db.collection('notification_digests').doc();
    const digest: NotificationDigest = {
      id: digestRef.id,
      userId,
      digestType,
      category,
      notifications: notifications.map((n) => n.id),
      itemCount: notifications.length,
      summary,
      sent: false,
      channels: ['email', 'in_app'],
      createdAt: new Date(),
      periodStart,
      periodEnd,
    };

    await digestRef.set(digest);

    // Send digest notification
    await this.sendDigestNotification(digest);
  }

  /**
   * Create digest summary text
   */
  private createDigestSummary(
    category: NotificationCategory,
    count: number,
    digestType: DigestType
  ): string {
    const period = digestType === 'daily' ? 'today' : 'this week';
    
    switch (category) {
      case 'content':
        return `${count} new content item${count > 1 ? 's' : ''} ${period}`;
      case 'digital_products':
        return `${count} product update${count > 1 ? 's' : ''} ${period}`;
      case 'events':
        return `${count} upcoming event${count > 1 ? 's' : ''} ${period}`;
      case 'progress':
        return `${count} milestone${count > 1 ? 's' : ''} achieved ${period}`;
      case 'clubs':
        return `${count} club update${count > 1 ? 's' : ''} ${period}`;
      case 'messages':
        return `${count} new message${count > 1 ? 's' : ''} ${period}`;
      case 'system':
        return `${count} system notification${count > 1 ? 's' : ''} ${period}`;
      default:
        return `${count} notification${count > 1 ? 's' : ''} ${period}`;
    }
  }

  /**
   * Send digest as a notification
   */
  private async sendDigestNotification(digest: NotificationDigest): Promise<void> {
    const result = await notificationEngine.sendNotification({
      userId: digest.userId,
      category: digest.category,
      priority: 'low',
      title: `${this.getCategoryDisplayName(digest.category)} Digest`,
      body: digest.summary,
      data: {
        digestId: digest.id,
        digestType: digest.digestType,
        itemCount: digest.itemCount,
      },
      channels: digest.channels,
    });

    if (result.success) {
      await db.collection('notification_digests').doc(digest.id).update({
        sent: true,
        sentAt: new Date(),
      });
    }
  }

  /**
   * Get user-friendly category name
   */
  private getCategoryDisplayName(category: NotificationCategory): string {
    switch (category) {
      case 'content':
        return 'Content';
      case 'digital_products':
        return 'Products';
      case 'events':
        return 'Events';
      case 'progress':
        return 'Progress';
      case 'clubs':
        return 'Clubs';
      case 'messages':
        return 'Messages';
      case 'system':
        return 'System';
      default:
        return 'Updates';
    }
  }

  /**
   * Get digest for user
   */
  async getUserDigests(
    userId: string,
    limit: number = 10
  ): Promise<NotificationDigest[]> {
    const snapshot = await db
      .collection('notification_digests')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as NotificationDigest);
  }

  /**
   * Get digest by ID
   */
  async getDigest(digestId: string): Promise<NotificationDigest | null> {
    const doc = await db.collection('notification_digests').doc(digestId).get();
    return doc.exists ? (doc.data() as NotificationDigest) : null;
  }

  /**
   * Clean up old digests (keep last 30 days)
   */
  async cleanupOldDigests(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    const snapshot = await db
      .collection('notification_digests')
      .where('createdAt', '<', cutoffDate)
      .limit(500)
      .get();

    const batch = db.batch();

    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }

    await batch.commit();
    console.log(`Cleaned up ${snapshot.size} old digests`);
  }
}

export const digestEngine = new DigestEngine();