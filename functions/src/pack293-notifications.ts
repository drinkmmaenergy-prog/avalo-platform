import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 293 - Notifications Stub
 * Provides notification functionality
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const db = getFirestore();

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  read: boolean;
  createdAt: any;
}

export interface NotificationPayload {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

/**
 * Send a notification to a user
 */
export async function sendNotification(payload: NotificationPayload): Promise<string> {
  const notificationRef = await db.collection('notifications').add({
    ...payload,
    read: false,
    createdAt: Timestamp.now(),
  });
  
  return notificationRef.id;
}

/**
 * Send notifications to multiple users
 */
export async function sendBulkNotifications(
  userIds: string[],
  notification: Omit<NotificationPayload, 'userId'>
): Promise<void> {
  const batch = db.batch();
  
  for (const userId of userIds) {
    const ref = db.collection('notifications').doc();
    batch.set(ref, {
      ...notification,
      userId,
      read: false,
      createdAt: Timestamp.now(),
    });
  }
  
  await batch.commit();
}

/**
 * Mark notification as read
 */
export async function markNotificationRead(notificationId: string): Promise<void> {
  await db.collection('notifications').doc(notificationId).update({
    read: true,
    readAt: Timestamp.now(),
  });
}

/**
 * Get user notifications
 */
export async function getUserNotifications(
  userId: string,
  limit: number = 50
): Promise<Notification[]> {
  const snapshot = await db
    .collection('notifications')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  } as Notification));
}

/**
 * Notify operations team
 */
export async function notifyOps(
  messageOrOptions: string | { title?: string; message: string; priority?: string; link?: string },
  severity?: string
): Promise<void> {
  // Normalize arguments
  let msg: string;
  let sev: string;
  
  if (typeof messageOrOptions === 'object') {
    msg = messageOrOptions.title 
      ? `${messageOrOptions.title}: ${messageOrOptions.message}`
      : messageOrOptions.message;
    sev = messageOrOptions.priority || 'INFO';
  } else {
    msg = messageOrOptions;
    sev = severity || 'INFO';
  }
  
  console.warn(`Ops notification [${sev}]: ${msg}`);
  // In production, this would send to Slack/PagerDuty/etc.
}

























