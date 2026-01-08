/**
 * PACK 111 — Support Notifications
 * Push notification templates and sending logic for support system
 */

import { db } from '../init';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * Notification types for support system
 */
export enum SupportNotificationType {
  AGENT_REPLIED = 'AGENT_REPLIED',
  CASE_ASSIGNED = 'CASE_ASSIGNED',
  CASE_RESOLVED = 'CASE_RESOLVED',
  CASE_CLOSED = 'CASE_CLOSED',
  CASE_REOPENED = 'CASE_REOPENED',
  NEEDS_MORE_INFO = 'NEEDS_MORE_INFO',
  PRIORITY_CHANGED = 'PRIORITY_CHANGED',
  NEW_CASE_ASSIGNED = 'NEW_CASE_ASSIGNED',
  USER_REPLIED = 'USER_REPLIED'
}

/**
 * Notification templates by type and language
 */
const NOTIFICATION_TEMPLATES: Record<SupportNotificationType, Record<string, { title: string; body: string }>> = {
  [SupportNotificationType.AGENT_REPLIED]: {
    en: {
      title: 'Support Agent Replied',
      body: 'Your support agent has responded to your case'
    },
    pl: {
      title: 'Agent wsparcia odpowiedział',
      body: 'Agent wsparcia odpowiedział na Twoje zgłoszenie'
    }
  },
  [SupportNotificationType.CASE_ASSIGNED]: {
    en: {
      title: 'Case Assigned',
      body: 'Your support case has been assigned to an agent'
    },
    pl: {
      title: 'Zgłoszenie przypisane',
      body: 'Twoje zgłoszenie zostało przypisane do agenta'
    }
  },
  [SupportNotificationType.CASE_RESOLVED]: {
    en: {
      title: 'Case Resolved',
      body: 'Your support case has been resolved'
    },
    pl: {
      title: 'Zgłoszenie rozwiązane',
      body: 'Twoje zgłoszenie zostało rozwiązane'
    }
  },
  [SupportNotificationType.CASE_CLOSED]: {
    en: {
      title: 'Case Closed',
      body: 'Your support case has been closed'
    },
    pl: {
      title: 'Zgłoszenie zamknięte',
      body: 'Twoje zgłoszenie zostało zamknięte'
    }
  },
  [SupportNotificationType.CASE_REOPENED]: {
    en: {
      title: 'Case Reopened',
      body: 'Your support case has been reopened'
    },
    pl: {
      title: 'Zgłoszenie ponownie otwarte',
      body: 'Twoje zgłoszenie zostało ponownie otwarte'
    }
  },
  [SupportNotificationType.NEEDS_MORE_INFO]: {
    en: {
      title: 'More Information Needed',
      body: 'Support needs more information about your case'
    },
    pl: {
      title: 'Potrzebne więcej informacji',
      body: 'Wsparcie potrzebuje więcej informacji o Twoim zgłoszeniu'
    }
  },
  [SupportNotificationType.PRIORITY_CHANGED]: {
    en: {
      title: 'Priority Updated',
      body: 'Your case priority has been changed'
    },
    pl: {
      title: 'Zaktualizowano priorytet',
      body: 'Priorytet Twojego zgłoszenia został zmieniony'
    }
  },
  [SupportNotificationType.NEW_CASE_ASSIGNED]: {
    en: {
      title: 'New Case Assigned',
      body: 'You have been assigned a new support case'
    },
    pl: {
      title: 'Nowe zgłoszenie przypisane',
      body: 'Przypisano Ci nowe zgłoszenie wsparcia'
    }
  },
  [SupportNotificationType.USER_REPLIED]: {
    en: {
      title: 'User Replied',
      body: 'The user has responded to their support case'
    },
    pl: {
      title: 'Użytkownik odpowiedział',
      body: 'Użytkownik odpowiedział na zgłoszenie'
    }
  }
};

/**
 * Send support notification to user
 */
export async function sendSupportNotification(params: {
  userId: string;
  type: SupportNotificationType;
  caseId: string;
  language?: string;
  customData?: Record<string, any>;
}): Promise<void> {
  const language = params.language || 'en';
  const template = NOTIFICATION_TEMPLATES[params.type][language] || NOTIFICATION_TEMPLATES[params.type].en;

  // Create notification document
  const notification = {
    userId: params.userId,
    type: 'SUPPORT',
    subtype: params.type,
    title: template.title,
    body: template.body,
    data: {
      caseId: params.caseId,
      screen: 'support',
      ...params.customData
    },
    createdAt: Timestamp.now(),
    read: false,
    delivered: false
  };

  await db.collection('notifications').add(notification);

  // Store FCM token logic would go here
  // This would integrate with Firebase Cloud Messaging to actually send the push notification
  await sendFCMNotification(params.userId, notification);
}

/**
 * Send notification to support agent
 */
export async function sendAgentNotification(params: {
  agentId: string;
  type: SupportNotificationType;
  caseId: string;
  customData?: Record<string, any>;
}): Promise<void> {
  const template = NOTIFICATION_TEMPLATES[params.type].en; // Agents use English by default

  const notification = {
    agentId: params.agentId,
    type: 'SUPPORT',
    subtype: params.type,
    title: template.title,
    body: template.body,
    data: {
      caseId: params.caseId,
      screen: 'agent_support',
      ...params.customData
    },
    createdAt: Timestamp.now(),
    read: false
  };

  await db.collection('agent_notifications').add(notification);
}

/**
 * Send FCM push notification
 * This is a placeholder - actual implementation would use Firebase Admin SDK messaging
 */
async function sendFCMNotification(userId: string, notification: any): Promise<void> {
  // Get user's FCM tokens
  const tokensSnapshot = await db.collection('user_devices')
    .where('userId', '==', userId)
    .where('notificationsEnabled', '==', true)
    .get();

  if (tokensSnapshot.empty) {
    console.log(`No FCM tokens found for user ${userId}`);
    return;
  }

  // In production, this would use:
  // import { messaging } from '../init';
  // 
  // const tokens = tokensSnapshot.docs.map(doc => doc.data().fcmToken);
  // const message = {
  //   notification: {
  //     title: notification.title,
  //     body: notification.body
  //   },
  //   data: notification.data,
  //   tokens
  // };
  // 
  // await messaging().sendMulticast(message);

  console.log(`Would send FCM notification to user ${userId}:`, notification.title);
}

/**
 * Batch send notifications to multiple users
 */
export async function sendBulkSupportNotifications(params: {
  userIds: string[];
  type: SupportNotificationType;
  caseId: string;
  language?: string;
  customData?: Record<string, any>;
}): Promise<void> {
  const promises = params.userIds.map(userId =>
    sendSupportNotification({
      userId,
      type: params.type,
      caseId: params.caseId,
      language: params.language,
      customData: params.customData
    })
  );

  await Promise.all(promises);
}

/**
 * Mark notification as read
 */
export async function markSupportNotificationRead(
  userId: string,
  notificationId: string
): Promise<void> {
  await db.collection('notifications').doc(notificationId).update({
    read: true,
    readAt: Timestamp.now()
  });
}

/**
 * Get unread support notifications for user
 */
export async function getUnreadSupportNotifications(
  userId: string
): Promise<any[]> {
  const snapshot = await db.collection('notifications')
    .where('userId', '==', userId)
    .where('type', '==', 'SUPPORT')
    .where('read', '==', false)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Schedule reminder notification if case hasn't been responded to
 */
export async function scheduleFollowUpNotification(params: {
  caseId: string;
  userId: string;
  delayHours: number;
}): Promise<void> {
  const executeAt = Timestamp.fromMillis(
    Date.now() + params.delayHours * 60 * 60 * 1000
  );

  await db.collection('scheduled_notifications').add({
    type: 'SUPPORT_FOLLOW_UP',
    userId: params.userId,
    caseId: params.caseId,
    executeAt,
    createdAt: Timestamp.now(),
    executed: false
  });
}

/**
 * Cancel scheduled follow-up (e.g., when case is resolved)
 */
export async function cancelFollowUpNotification(caseId: string): Promise<void> {
  const snapshot = await db.collection('scheduled_notifications')
    .where('caseId', '==', caseId)
    .where('type', '==', 'SUPPORT_FOLLOW_UP')
    .where('executed', '==', false)
    .get();

  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });

  await batch.commit();
}

/**
 * Get notification preferences for user
 */
export async function getUserNotificationPreferences(
  userId: string
): Promise<{ supportNotifications: boolean }> {
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();

  return {
    supportNotifications: userData?.notificationPreferences?.support !== false
  };
}

/**
 * Update notification preferences
 */
export async function updateNotificationPreferences(
  userId: string,
  preferences: { supportNotifications: boolean }
): Promise<void> {
  await db.collection('users').doc(userId).update({
    'notificationPreferences.support': preferences.supportNotifications,
    updatedAt: Timestamp.now()
  });
}