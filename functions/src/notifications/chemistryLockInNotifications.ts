/**
 * PACK 226 - Chemistry Lock-In Notifications
 * 
 * Sends respectful, optional notifications about chemistry status
 */

import { db } from '../init';
import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// TYPES
// ============================================================================

interface NotificationPreferences {
  chemistryLockIn: boolean;
  globalNotifications: boolean;
}

interface ChemistryNotification {
  type: 'lock_in_activated' | 'chemistry_continuing' | 'thinking_of_you' | 
        'perks_expiring' | 'conversion_suggestion';
  title: string;
  body: string;
  data?: Record<string, any>;
}

// ============================================================================
// NOTIFICATION MESSAGES
// ============================================================================

const NOTIFICATION_TEMPLATES = {
  lock_in_activated: {
    title: '✨ Chemistry Detected!',
    body: 'You two have amazing chemistry! Keep the conversation going.',
  },
  chemistry_continuing: {
    title: '💕 Your chemistry is still strong',
    body: 'Your conversation was great yesterday — want to continue?',
  },
  thinking_of_you: {
    title: '💭 Someone is thinking about you...',
    body: 'They might be waiting to hear from you!',
  },
  perks_expiring: {
    title: '⏰ Chemistry perks expiring soon',
    body: 'Your special chat theme expires in 24 hours',
  },
  conversion_suggestion: {
    title: '🎯 Take the next step?',
    body: 'The chemistry between you two is rare — maybe a call?',
  },
};

// ============================================================================
// NOTIFICATION FUNCTIONS
// ============================================================================

/**
 * Send Chemistry Lock-In activated notification
 */
export async function sendLockInActivatedNotification(
  userId: string,
  partnerId: string,
  conversationId: string
): Promise<void> {
  const canSend = await canSendNotification(userId, 'lock_in_activated');
  if (!canSend) return;

  const template = NOTIFICATION_TEMPLATES.lock_in_activated;

  await sendNotification(userId, {
    type: 'lock_in_activated',
    title: template.title,
    body: template.body,
    data: {
      conversationId,
      partnerId,
      type: 'chemistry_lock_in',
    },
  });
}

/**
 * Send chemistry continuing reminder
 */
export async function sendChemistryContinuingNotification(
  userId: string,
  partnerId: string,
  conversationId: string
): Promise<void> {
  const canSend = await canSendNotification(userId, 'chemistry_continuing');
  if (!canSend) return;

  // Check if user hasn't messaged in 24h
  const lastMessage = await getLastUserMessage(userId, conversationId);
  if (!lastMessage) return;

  const hoursSinceLastMessage = (Date.now() - lastMessage.toMillis()) / (60 * 60 * 1000);
  if (hoursSinceLastMessage < 24) return;

  const template = NOTIFICATION_TEMPLATES.chemistry_continuing;

  await sendNotification(userId, {
    type: 'chemistry_continuing',
    title: template.title,
    body: template.body,
    data: {
      conversationId,
      partnerId,
      type: 'chemistry_reminder',
    },
  });
}

/**
 * Send "thinking of you" notification (optional, gentle)
 */
export async function sendThinkingOfYouNotification(
  userId: string,
  partnerId: string,
  conversationId: string
): Promise<void> {
  const canSend = await canSendNotification(userId, 'thinking_of_you');
  if (!canSend) return;

  // Check if partner has sent recent messages
  const partnerRecentMessages = await getRecentMessagesFromUser(
    partnerId,
    conversationId,
    6 // hours
  );

  if (partnerRecentMessages < 2) return; // Only send if partner is actively trying

  const template = NOTIFICATION_TEMPLATES.thinking_of_you;

  await sendNotification(userId, {
    type: 'thinking_of_you',
    title: template.title,
    body: template.body,
    data: {
      conversationId,
      partnerId,
      type: 'chemistry_reminder',
    },
  });
}

/**
 * Send perks expiring notification
 */
export async function sendPerksExpiringNotification(
  userId: string,
  partnerId: string,
  conversationId: string
): Promise<void> {
  const canSend = await canSendNotification(userId, 'perks_expiring');
  if (!canSend) return;

  const template = NOTIFICATION_TEMPLATES.perks_expiring;

  await sendNotification(userId, {
    type: 'perks_expiring',
    title: template.title,
    body: template.body,
    data: {
      conversationId,
      partnerId,
      type: 'chemistry_info',
    },
  });
}

/**
 * Send conversion suggestion notification (for 72h mark)
 */
export async function sendConversionSuggestionNotification(
  userId: string,
  partnerId: string,
  conversationId: string,
  suggestion: string
): Promise<void> {
  const canSend = await canSendNotification(userId, 'conversion_suggestion');
  if (!canSend) return;

  const template = NOTIFICATION_TEMPLATES.conversion_suggestion;

  await sendNotification(userId, {
    type: 'conversion_suggestion',
    title: template.title,
    body: suggestion,
    data: {
      conversationId,
      partnerId,
      type: 'chemistry_conversion',
    },
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user can receive this type of notification
 */
async function canSendNotification(
  userId: string,
  notificationType: string
): Promise<boolean> {
  // Check user's notification preferences
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return false;

  const user = userDoc.data()!;
  const prefs = user.notificationPreferences as NotificationPreferences;

  // Check global notifications
  if (prefs?.globalNotifications === false) return false;

  // Check chemistry-specific notifications
  if (prefs?.chemistryLockIn === false) return false;

  // Check notification cooldown (max 1 chemistry notification per 12 hours)
  const cooldownKey = `lastChemistryNotification_${notificationType}`;
  const lastNotification = user[cooldownKey] as Timestamp;

  if (lastNotification) {
    const hoursSinceLast = (Date.now() - lastNotification.toMillis()) / (60 * 60 * 1000);
    if (hoursSinceLast < 12) return false;
  }

  return true;
}

/**
 * Send notification to user
 */
async function sendNotification(
  userId: string,
  notification: ChemistryNotification
): Promise<void> {
  // Add to user's notifications collection
  await db.collection('users')
    .doc(userId)
    .collection('notifications')
    .add({
      ...notification,
      read: false,
      createdAt: Timestamp.now(),
    });

  // Update last notification timestamp
  await db.collection('users')
    .doc(userId)
    .update({
      [`lastChemistryNotification_${notification.type}`]: Timestamp.now(),
    });

  // TODO: Send push notification via FCM if user has push tokens
  // This would integrate with your existing push notification system
}

/**
 * Get last message from user in conversation
 */
async function getLastUserMessage(
  userId: string,
  conversationId: string
): Promise<Timestamp | null> {
  const messagesSnapshot = await db
    .collection('conversations')
    .doc(conversationId)
    .collection('messages')
    .where('senderId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (messagesSnapshot.empty) return null;

  return messagesSnapshot.docs[0].data().createdAt as Timestamp;
}

/**
 * Get count of recent messages from user
 */
async function getRecentMessagesFromUser(
  userId: string,
  conversationId: string,
  hours: number
): Promise<number> {
  const cutoffTime = Timestamp.fromMillis(Date.now() - hours * 60 * 60 * 1000);

  const messagesSnapshot = await db
    .collection('conversations')
    .doc(conversationId)
    .collection('messages')
    .where('senderId', '==', userId)
    .where('createdAt', '>=', cutoffTime)
    .get();

  return messagesSnapshot.size;
}

/**
 * Disable Chemistry Lock-In notifications for user (per conversation)
 */
export async function disableChemistryNotifications(
  userId: string,
  conversationId: string
): Promise<void> {
  await db.collection('users')
    .doc(userId)
    .update({
      [`chemistryNotificationsDisabled.${conversationId}`]: true,
    });
}

/**
 * Enable Chemistry Lock-In notifications for user (per conversation)
 */
export async function enableChemistryNotifications(
  userId: string,
  conversationId: string
): Promise<void> {
  await db.collection('users')
    .doc(userId)
    .update({
      [`chemistryNotificationsDisabled.${conversationId}`]: false,
    });
}

// ============================================================================
// BATCH NOTIFICATION CRON
// ============================================================================

/**
 * Daily cron: Send chemistry reminders to active Lock-In pairs
 */
export async function sendDailyChemistryReminders(): Promise<void> {
  const activeConversations = await db
    .collection('conversations')
    .where('chemistryLockIn.isActive', '==', true)
    .get();

  let sentCount = 0;

  for (const doc of activeConversations.docs) {
    const conversation = doc.data();
    const lockIn = conversation.chemistryLockIn;

    // Check if Lock-In is about to expire (within 24h)
    if (lockIn.perksExpiresAt) {
      const hoursUntilExpiry = 
        (lockIn.perksExpiresAt.toMillis() - Date.now()) / (60 * 60 * 1000);

      if (hoursUntilExpiry > 0 && hoursUntilExpiry <= 24) {
        // Send perks expiring notification
        const participants = conversation.participants as string[];
        for (const userId of participants) {
          const partnerId = participants.find(id => id !== userId)!;
          await sendPerksExpiringNotification(userId, partnerId, doc.id);
          sentCount++;
        }
      }
    }

    // Send chemistry continuing reminders
    const participants = conversation.participants as string[];
    for (const userId of participants) {
      const partnerId = participants.find(id => id !== userId)!;
      await sendChemistryContinuingNotification(userId, partnerId, doc.id);
      sentCount++;
    }
  }

  console.log(`[Chemistry Lock-In] Sent ${sentCount} reminder notifications`);
}