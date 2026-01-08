/**
 * PACK 169 - Reminder System
 * Ethical reminder scheduling with anti-addiction safeguards
 */

import { db, serverTimestamp, increment } from '../init';
import { ReminderRule, ReminderType, NotificationCategory } from './types';
import { notificationEngine } from './engine';

interface CreateReminderParams {
  userId: string;
  reminderType: ReminderType;
  title: string;
  body: string;
  frequency: 'daily' | 'weekly' | 'custom';
  customSchedule?: {
    daysOfWeek?: number[];
    timeOfDay?: string;
    interval?: number;
    intervalUnit?: 'hours' | 'days' | 'weeks';
  };
  conditions?: {
    type: 'streak_break' | 'goal_miss' | 'inactivity' | 'schedule';
    threshold?: number;
  };
  maxTriggersPerDay?: number;
}

export class ReminderEngine {
  /**
   * Create a new reminder rule
   */
  async createReminder(params: CreateReminderParams): Promise<string> {
    const reminderRef = db.collection('reminder_rules').doc();
    
    const reminder: ReminderRule = {
      id: reminderRef.id,
      userId: params.userId,
      reminderType: params.reminderType,
      title: params.title,
      body: params.body,
      frequency: params.frequency,
      customSchedule: params.customSchedule,
      conditions: params.conditions,
      active: true,
      paused: false,
      nextTriggerAt: this.calculateNextTrigger(params.frequency, params.customSchedule),
      triggerCount: 0,
      maxTriggersPerDay: params.maxTriggersPerDay || 3,
      respectBurnoutProtection: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await reminderRef.set(reminder);
    return reminderRef.id;
  }

  /**
   * Update reminder rule
   */
  async updateReminder(
    reminderId: string,
    updates: Partial<ReminderRule>
  ): Promise<void> {
    await db.collection('reminder_rules').doc(reminderId).update({
      ...updates,
      updatedAt: new Date(),
    });
  }

  /**
   * Toggle reminder active state
   */
  async toggleReminder(reminderId: string, active: boolean): Promise<void> {
    await db.collection('reminder_rules').doc(reminderId).update({
      active,
      updatedAt: new Date(),
    });
  }

  /**
   * Delete reminder
   */
  async deleteReminder(reminderId: string): Promise<void> {
    await db.collection('reminder_rules').doc(reminderId).delete();
  }

  /**
   * Get user's reminders
   */
  async getUserReminders(userId: string): Promise<ReminderRule[]> {
    const snapshot = await db
      .collection('reminder_rules')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => doc.data() as ReminderRule);
  }

  /**
   * Process due reminders (called by scheduled function)
   */
  async processDueReminders(): Promise<void> {
    const now = new Date();
    
    const snapshot = await db
      .collection('reminder_rules')
      .where('active', '==', true)
      .where('paused', '==', false)
      .where('nextTriggerAt', '<=', now)
      .limit(100)
      .get();

    for (const doc of snapshot.docs) {
      const reminder = doc.data() as ReminderRule;
      await this.processReminder(reminder);
    }
  }

  /**
   * Process individual reminder
   */
  private async processReminder(reminder: ReminderRule): Promise<void> {
    try {
      // Check daily trigger limit
      const today = new Date().toISOString().split('T')[0];
      const todayTriggers = await this.getTodayTriggerCount(reminder.id, today);
      
      if (todayTriggers >= reminder.maxTriggersPerDay) {
        console.log(`Reminder ${reminder.id} hit daily limit`);
        return;
      }

      // Map reminder type to notification category
      const category = this.getReminderCategory(reminder.reminderType);

      // Send notification
      const result = await notificationEngine.sendNotification({
        userId: reminder.userId,
        category,
        priority: 'medium',
        title: reminder.title,
        body: reminder.body,
        data: {
          reminderId: reminder.id,
          reminderType: reminder.reminderType,
        },
      });

      if (result.success) {
        // Update reminder state
        const nextTrigger = this.calculateNextTrigger(
          reminder.frequency,
          reminder.customSchedule
        );

        await db.collection('reminder_rules').doc(reminder.id).update({
          lastTriggeredAt: new Date(),
          nextTriggerAt: nextTrigger,
          triggerCount: increment(1),
          updatedAt: new Date(),
        });

        // Log trigger
        await this.logReminderTrigger(reminder.id, today, true);
      } else {
        console.log(`Reminder ${reminder.id} blocked: ${result.reason}`);
        
        // Log blocked trigger
        await this.logReminderTrigger(reminder.id, today, false, result.reason);
      }
    } catch (error) {
      console.error(`Failed to process reminder ${reminder.id}:`, error);
    }
  }

  /**
   * Calculate next trigger time
   */
  private calculateNextTrigger(
    frequency: 'daily' | 'weekly' | 'custom',
    customSchedule?: ReminderRule['customSchedule']
  ): Date {
    const now = new Date();

    if (frequency === 'daily') {
      // Default: next day at 9:00 AM
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      next.setHours(9, 0, 0, 0);
      return next;
    }

    if (frequency === 'weekly') {
      // Default: next week, same day at 9:00 AM
      const next = new Date(now);
      next.setDate(next.getDate() + 7);
      next.setHours(9, 0, 0, 0);
      return next;
    }

    if (frequency === 'custom' && customSchedule) {
      if (customSchedule.timeOfDay) {
        const [hours, minutes] = customSchedule.timeOfDay.split(':').map(Number);
        const next = new Date(now);
        next.setHours(hours, minutes, 0, 0);

        // If time has passed today, schedule for tomorrow
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }

        return next;
      }

      if (customSchedule.interval && customSchedule.intervalUnit) {
        const next = new Date(now);
        
        switch (customSchedule.intervalUnit) {
          case 'hours':
            next.setHours(next.getHours() + customSchedule.interval);
            break;
          case 'days':
            next.setDate(next.getDate() + customSchedule.interval);
            break;
          case 'weeks':
            next.setDate(next.getDate() + customSchedule.interval * 7);
            break;
        }

        return next;
      }
    }

    // Fallback: 24 hours from now
    const next = new Date(now);
    next.setHours(next.getHours() + 24);
    return next;
  }

  /**
   * Get today's trigger count for reminder
   */
  private async getTodayTriggerCount(
    reminderId: string,
    date: string
  ): Promise<number> {
    const logRef = db
      .collection('reminder_trigger_logs')
      .doc(`${reminderId}_${date}`);
    
    const doc = await logRef.get();
    if (!doc.exists) return 0;
    
    return doc.data()?.triggerCount || 0;
  }

  /**
   * Log reminder trigger
   */
  private async logReminderTrigger(
    reminderId: string,
    date: string,
    success: boolean,
    reason?: string
  ): Promise<void> {
    const logRef = db
      .collection('reminder_trigger_logs')
      .doc(`${reminderId}_${date}`);

    await logRef.set(
      {
        reminderId,
        date,
        triggerCount: increment(1),
        lastTriggeredAt: new Date(),
        success,
        failureReason: reason || null,
      },
      { merge: true }
    );
  }

  /**
   * Map reminder type to notification category
   */
  private getReminderCategory(reminderType: ReminderType): NotificationCategory {
    switch (reminderType) {
      case 'learning_consistency':
        return 'content';
      case 'fitness_progress':
        return 'progress';
      case 'diet_tracking':
        return 'progress';
      case 'creativity_routine':
        return 'content';
      case 'community_challenge':
        return 'clubs';
      case 'content_publishing':
        return 'content';
      default:
        return 'system';
    }
  }

  /**
   * Check user engagement and potentially pause over-active reminders
   */
  async checkAndPauseOverActiveReminders(userId: string): Promise<void> {
    const reminders = await this.getUserReminders(userId);
    const today = new Date().toISOString().split('T')[0];

    for (const reminder of reminders) {
      const todayTriggers = await this.getTodayTriggerCount(reminder.id, today);
      
      if (todayTriggers >= reminder.maxTriggersPerDay) {
        await this.updateReminder(reminder.id, {
          paused: true,
        });
      }
    }
  }

  /**
   * Reset daily paused reminders (called by daily cron)
   */
  async resetDailyPausedReminders(): Promise<void> {
    const snapshot = await db
      .collection('reminder_rules')
      .where('paused', '==', true)
      .where('active', '==', true)
      .get();

    const batch = db.batch();

    for (const doc of snapshot.docs) {
      batch.update(doc.ref, {
        paused: false,
        updatedAt: new Date(),
      });
    }

    await batch.commit();
  }
}

export const reminderEngine = new ReminderEngine();