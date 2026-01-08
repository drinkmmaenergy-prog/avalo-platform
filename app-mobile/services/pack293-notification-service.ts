/**
 * PACK 293 - Notifications & Activity Center
 * Mobile service for notification management
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore, collection, query, where, orderBy, limit, startAfter, onSnapshot, doc, Timestamp } from 'firebase/firestore';
import { functions, db } from '../lib/firebase';

// ============================================================================
// TYPES
// ============================================================================

export type NotificationType =
  | 'MATCH'
  | 'NEW_MESSAGE'
  | 'MISSED_MESSAGE_REMINDER'
  | 'NEW_LIKE'
  | 'NEW_VISIT'
  | 'NEW_CHAT_REQUEST'
  | 'CALENDAR_BOOKING_CREATED'
  | 'CALENDAR_BOOKING_UPDATED'
  | 'CALENDAR_BOOKING_CANCELLED'
  | 'CALENDAR_REMINDER'
  | 'EVENT_TICKET_CONFIRMED'
  | 'EVENT_REMINDER'
  | 'EVENT_CANCELLED'
  | 'TIP_AI_SUGGESTION'
  | 'CREATOR_EARNINGS_SUMMARY'
  | 'SYSTEM_ALERT'
  | 'SAFETY_ALERT'
  | 'PANIC_CONTACT_ALERT';

export type NotificationStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'DISMISSED';
export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

export interface NotificationContext {
  matchId?: string;
  chatId?: string;
  messageId?: string;
  profileId?: string;
  bookingId?: string;
  eventId?: string;
  amountTokens?: number;
  country?: string;
}

export interface Notification {
  notificationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  context: NotificationContext;
  status: NotificationStatus;
  createdAt: Date;
  sentAt: Date | null;
  readAt: Date | null;
  dismissedAt: Date | null;
  priority: NotificationPriority;
  batchKey: string | null;
}

export interface NotificationChannelSettings {
  push: boolean;
  inApp: boolean;
  email: boolean;
}

export interface NotificationSettings {
  userId: string;
  pushEnabled: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  channels: {
    matches: NotificationChannelSettings;
    messages: NotificationChannelSettings;
    likes: NotificationChannelSettings;
    visits: NotificationChannelSettings;
    calendar: NotificationChannelSettings;
    events: NotificationChannelSettings;
    earnings: NotificationChannelSettings;
    aiTips: NotificationChannelSettings;
    system: NotificationChannelSettings;
    safety: NotificationChannelSettings;
  };
  quietHours: {
    enabled: boolean;
    startLocalTime: string;
    endLocalTime: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// NOTIFICATION API
// ============================================================================

/**
 * Get notifications with pagination
 */
export async function getNotifications(
  cursor?: string,
  limitCount: number = 50,
  type?: NotificationType,
  status?: NotificationStatus
): Promise<{
  items: Notification[];
  nextCursor: string | null;
  unreadCount: number;
}> {
  const getNotificationsFunc = httpsCallable(functions, 'getNotifications');
  
  const result = await getNotificationsFunc({
    cursor,
    limit: limitCount,
    type,
    status,
  });

  const data = result.data as any;
  
  return {
    items: data.items.map((item: any) => ({
      ...item,
      createdAt: item.createdAt?.toDate?.() || new Date(item.createdAt),
      sentAt: item.sentAt?.toDate?.() || (item.sentAt ? new Date(item.sentAt) : null),
      readAt: item.readAt?.toDate?.() || (item.readAt ? new Date(item.readAt) : null),
      dismissedAt: item.dismissedAt?.toDate?.() || (item.dismissedAt ? new Date(item.dismissedAt) : null),
    })),
    nextCursor: data.nextCursor,
    unreadCount: data.unreadCount,
  };
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const markReadFunc = httpsCallable(functions, 'markNotificationRead');
  await markReadFunc({ notificationId });
}

/**
 * Mark all notifications as read
 */
export async function markAllNotificationsAsRead(): Promise<void> {
  const markAllReadFunc = httpsCallable(functions, 'markAllNotificationsRead');
  await markAllReadFunc({});
}

/**
 * Dismiss notification
 */
export async function dismissNotification(notificationId: string): Promise<void> {
  const dismissFunc = httpsCallable(functions, 'dismissNotificationFunc');
  await dismissFunc({ notificationId });
}

// ============================================================================
// NOTIFICATION SETTINGS API
// ============================================================================

/**
 * Get user notification settings
 */
export async function getNotificationSettings(): Promise<NotificationSettings> {
  const getSettingsFunc = httpsCallable(functions, 'getNotificationSettings');
  const result = await getSettingsFunc({});
  
  const data = result.data as any;
  
  return {
    ...data,
    createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
    updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
  };
}

/**
 * Update notification settings
 */
export async function updateNotificationSettings(
  updates: Partial<Omit<NotificationSettings, 'userId' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const updateSettingsFunc = httpsCallable(functions, 'updateNotificationSettings');
  await updateSettingsFunc(updates);
}

// ============================================================================
// DEVICE MANAGEMENT
// ============================================================================

/**
 * Register device for push notifications
 */
export async function registerDeviceForPush(
  deviceId: string,
  platform: 'android' | 'ios' | 'web',
  pushToken: string
): Promise<void> {
  const registerFunc = httpsCallable(functions, 'registerDeviceForPush');
  await registerFunc({ deviceId, platform, pushToken });
}

/**
 * Unregister device from push notifications
 */
export async function unregisterDeviceFromPush(deviceId: string): Promise<void> {
  const unregisterFunc = httpsCallable(functions, 'unregisterDeviceFromPush');
  await unregisterFunc({ deviceId });
}

/**
 * Update device activity
 */
export async function updateDeviceActivity(deviceId: string): Promise<void> {
  const updateFunc = httpsCallable(functions, 'updateDeviceActivity');
  await updateFunc({ deviceId });
}

// ============================================================================
// REAL-TIME NOTIFICATIONS
// ============================================================================

/**
 * Subscribe to real-time notifications
 */
export function subscribeToNotifications(
  userId: string,
  onNotification: (notification: Notification) => void,
  onError?: (error: Error) => void
): () => void {
  const notificationsRef = collection(db, 'notifications');
  const q = query(
    notificationsRef,
    where('userId', '==', userId),
    where('status', 'in', ['QUEUED', 'SENT', 'DELIVERED']),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' || change.type === 'modified') {
          const data = change.doc.data();
          onNotification({
            notificationId: change.doc.id,
            userId: data.userId,
            type: data.type,
            title: data.title,
            body: data.body,
            context: data.context || {},
            status: data.status,
            createdAt: data.createdAt?.toDate?.() || new Date(),
            sentAt: data.sentAt?.toDate?.() || null,
            readAt: data.readAt?.toDate?.() || null,
            dismissedAt: data.dismissedAt?.toDate?.() || null,
            priority: data.priority,
            batchKey: data.batchKey || null,
          });
        }
      });
    },
    (error) => {
      console.error('Notification subscription error:', error);
      if (onError) {
        onError(error);
      }
    }
  );

  return unsubscribe;
}

// ============================================================================
// NAVIGATION HELPERS
// ============================================================================

/**
 * Get navigation path from notification
 */
export function getNotificationDeepLink(notification: Notification): string | null {
  const { type, context } = notification;

  switch (type) {
    case 'MATCH':
      return context.profileId ? `/chat/${context.chatId || context.profileId}` : null;
    
    case 'NEW_MESSAGE':
    case 'MISSED_MESSAGE_REMINDER':
    case 'NEW_CHAT_REQUEST':
      return context.chatId ? `/chat/${context.chatId}` : null;
    
    case 'NEW_LIKE':
    case 'NEW_VISIT':
      return context.profileId ? `/profile/${context.profileId}` : null;
    
    case 'CALENDAR_BOOKING_CREATED':
    case 'CALENDAR_BOOKING_UPDATED':
    case 'CALENDAR_BOOKING_CANCELLED':
    case 'CALENDAR_REMINDER':
      return context.bookingId ? `/calendar/booking/${context.bookingId}` : '/calendar';
    
    case 'EVENT_TICKET_CONFIRMED':
    case 'EVENT_REMINDER':
    case 'EVENT_CANCELLED':
      return context.eventId ? `/events/${context.eventId}` : '/events';
    
    case 'TIP_AI_SUGGESTION':
      return '/creator/tips';
    
    case 'CREATOR_EARNINGS_SUMMARY':
      return '/creator/earnings';
    
    case 'SYSTEM_ALERT':
      return '/settings';
    
    case 'SAFETY_ALERT':
    case 'PANIC_CONTACT_ALERT':
      return '/safety';
    
    default:
      return null;
  }
}

/**
 * Get icon name for notification type
 */
export function getNotificationIcon(type: NotificationType): string {
  const iconMap: Record<NotificationType, string> = {
    MATCH: 'heart',
    NEW_MESSAGE: 'chatbubble',
    MISSED_MESSAGE_REMINDER: 'chatbubble-ellipses',
    NEW_LIKE: 'heart',
    NEW_VISIT: 'eye',
    NEW_CHAT_REQUEST: 'chatbubbles',
    CALENDAR_BOOKING_CREATED: 'calendar',
    CALENDAR_BOOKING_UPDATED: 'calendar',
    CALENDAR_BOOKING_CANCELLED: 'calendar',
    CALENDAR_REMINDER: 'alarm',
    EVENT_TICKET_CONFIRMED: 'ticket',
    EVENT_REMINDER: 'time',
    EVENT_CANCELLED: 'close-circle',
    TIP_AI_SUGGESTION: 'bulb',
    CREATOR_EARNINGS_SUMMARY: 'cash',
    SYSTEM_ALERT: 'information-circle',
    SAFETY_ALERT: 'shield',
    PANIC_CONTACT_ALERT: 'warning',
  };

  return iconMap[type] || 'notifications';
}