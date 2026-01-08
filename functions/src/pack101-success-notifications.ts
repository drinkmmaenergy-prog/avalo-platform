/**
 * PACK 101 — Success Toolkit Notification Integration
 * Gentle insights notifications for creators (opt-in only)
 */

import { db } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { SuccessSuggestion } from './pack101-success-types';

/**
 * Send gentle insight notification to creator
 * Only sends for HIGH priority suggestions and respects user preferences
 */
export async function sendSuccessInsightNotification(
  userId: string,
  suggestion: SuccessSuggestion
): Promise<boolean> {
  try {
    // Check if user has opted into success notifications
    const userDoc = await db.collection('users').doc(userId).get();
    const notificationPrefs = userDoc.data()?.notificationPreferences;
    
    // Only send if user has enabled success insights (opt-in)
    if (!notificationPrefs?.successInsights) {
      return false;
    }

    // Only send HIGH priority suggestions as notifications
    if (suggestion.priority !== 'HIGH') {
      return false;
    }

    // Check notification frequency limits (max 1 per day)
    const last24Hours = new Date();
    last24Hours.setHours(last24Hours.getHours() - 24);

    const recentNotifications = await db
      .collection('notifications')
      .where('userId', '==', userId)
      .where('type', '==', 'SUCCESS_INSIGHT')
      .where('createdAt', '>=', Timestamp.fromDate(last24Hours))
      .limit(1)
      .get();

    if (!recentNotifications.empty) {
      logger.info(`[SuccessNotifications] Skipping notification - already sent today for user ${userId}`);
      return false;
    }

    // Create notification with safe, supportive wording
    const notification = {
      userId,
      type: 'SUCCESS_INSIGHT' as const,
      category: 'SYSTEM' as const,
      title: 'Success Tip Available',
      body: suggestion.title,
      data: {
        suggestionId: suggestion.id,
        category: suggestion.category,
        actionLink: suggestion.actionLink,
      },
      read: false,
      createdAt: Timestamp.now(),
    };

    await db.collection('notifications').add(notification);

    logger.info(`[SuccessNotifications] Sent insight notification to user ${userId}`, {
      suggestionId: suggestion.id,
      suggestionTitle: suggestion.title,
    });

    return true;
  } catch (error: any) {
    logger.error(`[SuccessNotifications] Error sending notification`, {
      userId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Process success notifications for a user
 * Called after success signals are rebuilt
 */
export async function processSuccessNotifications(
  userId: string,
  suggestions: SuccessSuggestion[]
): Promise<void> {
  try {
    // Find HIGH priority suggestions that might warrant notification
    const highPrioritySuggestions = suggestions.filter(
      (s) => s.priority === 'HIGH'
    );

    if (highPrioritySuggestions.length === 0) {
      return;
    }

    // Send notification for the first HIGH priority suggestion only
    const topSuggestion = highPrioritySuggestions[0];
    await sendSuccessInsightNotification(userId, topSuggestion);
  } catch (error: any) {
    logger.error('[SuccessNotifications] Error processing notifications', {
      userId,
      error: error.message,
    });
  }
}