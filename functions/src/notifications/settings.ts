/**
 * PACK 169 - Notification Settings Management
 * User control over notification preferences
 */

import { db } from '../init';
import {
  NotificationSettings,
  NotificationCategory,
  DeliveryChannel,
  DigestType,
} from './types';

export class NotificationSettingsManager {
  /**
   * Get user notification settings
   */
  async getSettings(userId: string): Promise<NotificationSettings> {
    const doc = await db.collection('notification_settings').doc(userId).get();

    if (doc.exists) {
      return doc.data() as NotificationSettings;
    }

    // Return and save default settings
    const defaultSettings = this.getDefaultSettings(userId);
    await this.saveSettings(defaultSettings);
    return defaultSettings;
  }

  /**
   * Update notification settings
   */
  async updateSettings(
    userId: string,
    updates: Partial<NotificationSettings>
  ): Promise<void> {
    const settingsRef = db.collection('notification_settings').doc(userId);
    
    await settingsRef.update({
      ...updates,
      updatedAt: new Date(),
    });
  }

  /**
   * Toggle global notifications
   */
  async toggleGlobalNotifications(
    userId: string,
    enabled: boolean
  ): Promise<void> {
    await this.updateSettings(userId, { globalEnabled: enabled });
  }

  /**
   * Set do-not-disturb mode
   */
  async setDoNotDisturb(
    userId: string,
    enabled: boolean,
    schedule?: {
      enabled: boolean;
      startHour: number;
      endHour: number;
      days: number[];
    }
  ): Promise<void> {
    await this.updateSettings(userId, {
      doNotDisturb: enabled,
      dndSchedule: schedule,
    });
  }

  /**
   * Set snooze mode
   */
  async setSnoozeMode(
    userId: string,
    duration: '24h' | '7d' | '30d' | null
  ): Promise<void> {
    let snoozedUntil: Date | undefined;

    if (duration) {
      snoozedUntil = new Date();
      switch (duration) {
        case '24h':
          snoozedUntil.setHours(snoozedUntil.getHours() + 24);
          break;
        case '7d':
          snoozedUntil.setDate(snoozedUntil.getDate() + 7);
          break;
        case '30d':
          snoozedUntil.setDate(snoozedUntil.getDate() + 30);
          break;
      }
    }

    await this.updateSettings(userId, {
      snoozeMode: duration || undefined,
      snoozedUntil,
    });
  }

  /**
   * Update category settings
   */
  async updateCategorySettings(
    userId: string,
    category: NotificationCategory,
    settings: {
      enabled?: boolean;
      channels?: DeliveryChannel[];
      digestType?: DigestType;
      maxPerDay?: number;
    }
  ): Promise<void> {
    const currentSettings = await this.getSettings(userId);
    const categorySettings = currentSettings.categories[category];

    await db
      .collection('notification_settings')
      .doc(userId)
      .update({
        [`categories.${category}`]: {
          ...categorySettings,
          ...settings,
        },
        updatedAt: new Date(),
      });
  }

  /**
   * Toggle category notifications
   */
  async toggleCategory(
    userId: string,
    category: NotificationCategory,
    enabled: boolean
  ): Promise<void> {
    await this.updateCategorySettings(userId, category, { enabled });
  }

  /**
   * Update burnout protection settings
   */
  async updateBurnoutProtection(
    userId: string,
    settings: {
      enabled?: boolean;
      dailyEngagementLimit?: number;
      cooldownPeriod?: number;
    }
  ): Promise<void> {
    const currentSettings = await this.getSettings(userId);

    await this.updateSettings(userId, {
      burnoutProtection: {
        ...currentSettings.burnoutProtection,
        ...settings,
      },
    });
  }

  /**
   * Update frequency caps
   */
  async updateFrequencyCaps(
    userId: string,
    caps: {
      perHour?: number;
      perDay?: number;
      perWeek?: number;
    }
  ): Promise<void> {
    const currentSettings = await this.getSettings(userId);

    await this.updateSettings(userId, {
      frequencyCaps: {
        ...currentSettings.frequencyCaps,
        ...caps,
      },
    });
  }

  /**
   * Save complete settings
   */
  private async saveSettings(settings: NotificationSettings): Promise<void> {
    await db.collection('notification_settings').doc(settings.userId).set(settings);
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
   * Reset to default settings
   */
  async resetToDefaults(userId: string): Promise<void> {
    const defaultSettings = this.getDefaultSettings(userId);
    await this.saveSettings(defaultSettings);
  }

  /**
   * Export user settings (for GDPR)
   */
  async exportSettings(userId: string): Promise<NotificationSettings> {
    return this.getSettings(userId);
  }

  /**
   * Delete user settings (for GDPR)
   */
  async deleteSettings(userId: string): Promise<void> {
    await db.collection('notification_settings').doc(userId).delete();
  }
}

export const settingsManager = new NotificationSettingsManager();