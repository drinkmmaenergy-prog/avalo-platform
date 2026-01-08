/**
 * PACK 293 - Notifications & Activity Center
 * TypeScript type definitions for notification system
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// NOTIFICATION TYPES
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

export type NotificationPlatform = 'android' | 'ios' | 'web';

// ============================================================================
// NOTIFICATION CONTEXT
// ============================================================================

export interface NotificationContext {
  matchId?: string | null;
  chatId?: string | null;
  messageId?: string | null;
  profileId?: string | null;
  bookingId?: string | null;
  eventId?: string | null;
  amountTokens?: number;
  country?: string | null;
  [key: string]: any; // Allow for additional context fields
}

// ============================================================================
// NOTIFICATION DELIVERY OPTIONS
// ============================================================================

export interface NotificationDelivery {
  push: boolean;
  inApp: boolean;
  email: boolean;
}

// ============================================================================
// NOTIFICATION DOCUMENT
// ============================================================================

export interface NotificationDocument {
  notificationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  context: NotificationContext;
  delivery: NotificationDelivery;
  status: NotificationStatus;
  createdAt: Timestamp;
  sentAt: Timestamp | null;
  readAt: Timestamp | null;
  dismissedAt: Timestamp | null;
  priority: NotificationPriority;
  batchKey: string | null;
}

// ============================================================================
// NOTIFICATION PAYLOAD (for creating notifications)
// ============================================================================

export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  context?: NotificationContext;
  priority?: NotificationPriority;
  delivery?: Partial<NotificationDelivery>;
  batchKey?: string | null;
}

// ============================================================================
// NOTIFICATION SETTINGS
// ============================================================================

export interface NotificationChannelSettings {
  push: boolean;
  inApp: boolean;
  email: boolean;
}

export interface QuietHoursSettings {
  enabled: boolean;
  startLocalTime: string; // Format: "HH:MM"
  endLocalTime: string;   // Format: "HH:MM"
}

export interface NotificationSettingsDocument {
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
  quietHours: QuietHoursSettings;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// USER DEVICES (for push notifications)
// ============================================================================

export interface UserDeviceDocument {
  deviceId: string;
  userId: string;
  platform: NotificationPlatform;
  pushToken: string;
  lastSeenAt: Timestamp;
}

// ============================================================================
// NOTIFICATION THROTTLE
// ============================================================================

export interface NotificationThrottleDocument {
  userId: string;
  hourlyCount: number;
  dailyCount: number;
  lastHourReset: Timestamp;
  lastDayReset: Timestamp;
  lowPriorityHourlyCount: number;
}

// ============================================================================
// NOTIFICATION BATCH
// ============================================================================

export interface NotificationBatchDocument {
  batchId: string;
  userId: string;
  batchKey: string;
  notificationIds: string[];
  status: 'PENDING' | 'SENT';
  scheduledFor: Timestamp;
  sentAt: Timestamp | null;
  type: NotificationType;
}

// ============================================================================
// NOTIFICATION LOG (for analytics)
// ============================================================================

export interface NotificationLogDocument {
  logId: string;
  notificationId: string;
  userId: string;
  type: NotificationType;
  priority: NotificationPriority;
  channels: string[]; // ['push', 'inApp', 'email']
  deliveryStatus: 'SUCCESS' | 'FAILED' | 'THROTTLED' | 'BLOCKED';
  failureReason?: string | null;
  sentAt: Timestamp;
  blocked: boolean;
  blockedReason?: string | null;
}

// ============================================================================
// HELPER TYPE GUARDS
// ============================================================================

export function isHighPriority(priority: NotificationPriority): boolean {
  return priority === 'HIGH' || priority === 'CRITICAL';
}

export function isCriticalPriority(priority: NotificationPriority): boolean {
  return priority === 'CRITICAL';
}

export function isSafetyNotification(type: NotificationType): boolean {
  return type === 'SAFETY_ALERT' || type === 'PANIC_CONTACT_ALERT';
}

// ============================================================================
// NOTIFICATION CHANNEL MAPPING
// ============================================================================

export const NOTIFICATION_TYPE_TO_CHANNEL: Record<NotificationType, keyof NotificationSettingsDocument['channels']> = {
  'MATCH': 'matches',
  'NEW_MESSAGE': 'messages',
  'MISSED_MESSAGE_REMINDER': 'messages',
  'NEW_LIKE': 'likes',
  'NEW_VISIT': 'visits',
  'NEW_CHAT_REQUEST': 'messages',
  'CALENDAR_BOOKING_CREATED': 'calendar',
  'CALENDAR_BOOKING_UPDATED': 'calendar',
  'CALENDAR_BOOKING_CANCELLED': 'calendar',
  'CALENDAR_REMINDER': 'calendar',
  'EVENT_TICKET_CONFIRMED': 'events',
  'EVENT_REMINDER': 'events',
  'EVENT_CANCELLED': 'events',
  'TIP_AI_SUGGESTION': 'aiTips',
  'CREATOR_EARNINGS_SUMMARY': 'earnings',
  'SYSTEM_ALERT': 'system',
  'SAFETY_ALERT': 'safety',
  'PANIC_CONTACT_ALERT': 'safety',
};

// ============================================================================
// DEFAULT SETTINGS
// ============================================================================

export const DEFAULT_NOTIFICATION_SETTINGS: Omit<NotificationSettingsDocument, 'userId' | 'createdAt' | 'updatedAt'> = {
  pushEnabled: true,
  emailEnabled: false,
  inAppEnabled: true,
  channels: {
    matches: { push: true, inApp: true, email: false },
    messages: { push: true, inApp: true, email: false },
    likes: { push: false, inApp: true, email: false },
    visits: { push: false, inApp: true, email: false },
    calendar: { push: true, inApp: true, email: false },
    events: { push: true, inApp: true, email: false },
    earnings: { push: false, inApp: true, email: true },
    aiTips: { push: false, inApp: true, email: false },
    system: { push: true, inApp: true, email: true },
    safety: { push: true, inApp: true, email: true },
  },
  quietHours: {
    enabled: true,
    startLocalTime: '22:00',
    endLocalTime: '08:00',
  },
};

// ============================================================================
// THROTTLE LIMITS
// ============================================================================

export const THROTTLE_LIMITS = {
  MAX_PUSH_PER_HOUR: 10,
  MAX_PUSH_PER_DAY: 50,
  MAX_LOW_PRIORITY_PER_HOUR: 3,
};