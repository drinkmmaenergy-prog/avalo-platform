/**
 * PACK 92 — Notification Service
 * Mobile notification management service
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  doc,
  updateDoc,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// ============================================================================
// TYPES
// ============================================================================

export type NotificationType =
  | 'EARNINGS'
  | 'PAYOUT'
  | 'KYC'
  | 'DISPUTE'
  | 'ENFORCEMENT'
  | 'LEGAL_UPDATE'
  | 'SAFETY'
  | 'SYSTEM';

export type NotificationCategory =
  | 'TRANSACTIONAL'
  | 'ACCOUNT'
  | 'LEGAL'
  | 'SAFETY'
  | 'INFO';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body: string;
  deepLink?: string;
  read: boolean;
  createdAt: string;
  channels: string[];
  payload?: Record<string, any>;
}

export interface UserNotificationSettings {
  pushEnabled: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  categories: {
    EARNINGS: boolean;
    PAYOUT: boolean;
    MARKETING: boolean;
    SAFETY: boolean;
    LEGAL: boolean;
  };
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

const registerPushTokenFn = httpsCallable(functions, 'registerPushToken');
const unregisterPushTokenFn = httpsCallable(functions, 'unregisterPushToken');
const getNotificationsFn = httpsCallable(functions, 'getNotifications');
const getNotificationSettingsFn = httpsCallable(functions, 'getNotificationSettings');
const updateNotificationSettingsFn = httpsCallable(functions, 'updateNotificationSettings');
const markNotificationAsReadFn = httpsCallable(functions, 'markNotificationAsRead');
const markAllNotificationsAsReadFn = httpsCallable(functions, 'markAllNotificationsAsRead');
const getUnreadCountFn = httpsCallable(functions, 'getUnreadCount');

// ============================================================================
// DEVICE TOKEN MANAGEMENT
// ============================================================================

export async function registerPushToken(
  deviceId: string,
  pushToken: string,
  platform: 'ios' | 'android'
): Promise<void> {
  await registerPushTokenFn({
    deviceId,
    pushToken,
    platform,
  });
}

export async function unregisterPushToken(deviceId: string): Promise<void> {
  await unregisterPushTokenFn({ deviceId });
}

// ============================================================================
// NOTIFICATION FETCHING
// ============================================================================

export async function getNotifications(
  limitCount: number = 50,
  pageToken?: string
): Promise<{
  notifications: Notification[];
  hasMore: boolean;
  nextPageToken?: string;
  unreadCount: number;
}> {
  const result = await getNotificationsFn({
    limit: limitCount,
    pageToken,
  });

  return result.data as any;
}

// ============================================================================
// NOTIFICATION SETTINGS
// ============================================================================

export async function getNotificationSettings(): Promise<UserNotificationSettings> {
  const result = await getNotificationSettingsFn();
  return result.data as UserNotificationSettings;
}

export async function updateNotificationSettings(
  updates: Partial<UserNotificationSettings>
): Promise<void> {
  await updateNotificationSettingsFn(updates);
}

// ============================================================================
// NOTIFICATION ACTIONS
// ============================================================================

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  await markNotificationAsReadFn({ notificationId });
}

export async function markAllNotificationsAsRead(): Promise<void> {
  await markAllNotificationsAsReadFn();
}

export async function getUnreadCount(): Promise<number> {
  const result = await getUnreadCountFn();
  return (result.data as any).count;
}

// ============================================================================
// REAL-TIME SUBSCRIPTION
// ============================================================================

export function subscribeToNotifications(
  userId: string,
  onUpdate: (notifications: Notification[], unreadCount: number) => void,
  onError?: (error: Error) => void
): () => void {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const notifications: Notification[] = [];
      let unreadCount = 0;

      snapshot.forEach((doc) => {
        const data = doc.data();
        const notification: Notification = {
          id: doc.id,
          userId: data.userId,
          type: data.type,
          category: data.category,
          title: data.title,
          body: data.body,
          deepLink: data.deepLink,
          read: data.read,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          channels: data.channels || [],
          payload: data.payload,
        };

        notifications.push(notification);

        if (!data.read) {
          unreadCount++;
        }
      });

      onUpdate(notifications, unreadCount);
    },
    (error) => {
      console.error('Error subscribing to notifications:', error);
      if (onError) {
        onError(error as Error);
      }
    }
  );

  return unsubscribe;
}

// ============================================================================
// LOCAL NOTIFICATIONS (for compatibility with existing code)
// ============================================================================

/**
 * Send local notification (for backward compatibility)
 * This is used by chatService.ts
 */
export function sendLocalNotification(title: string, body: string, data?: any): void {
  // This function exists for backward compatibility
  // In PACK 92, notifications are handled by the backend
  console.log('Local notification (deprecated):', title, body, data);
}

export function subscribeToUnreadCount(
  userId: string,
  onUpdate: (count: number) => void,
  onError?: (error: Error) => void
): () => void {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    where('read', '==', false)
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      onUpdate(snapshot.size);
    },
    (error) => {
      console.error('Error subscribing to unread count:', error);
      if (onError) {
        onError(error as Error);
      }
    }
  );

  return unsubscribe;
}