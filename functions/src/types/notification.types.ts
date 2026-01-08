/**
 * PACK 53 - Notification Types
 * Type definitions for the notification system
 */

import { Timestamp } from "firebase-admin/firestore";

export type NotificationType =
  | "NEW_MESSAGE"
  | "AI_REPLY"
  | "MEDIA_UNLOCK"
  | "STREAK"
  | "ROYAL_UPDATE"
  | "EARNINGS";

export interface NotificationContext {
  conversationId?: string;
  companionId?: string;
  counterpartyId?: string;
  mediaMessageId?: string;
  earningsEventId?: string;
  deepLink?: string;
}

export interface NotificationChannels {
  inApp: boolean;
  push: boolean;
  email: boolean;
}

export interface NotificationDocument {
  notificationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  context?: NotificationContext;
  channels: NotificationChannels;
  status: "pending" | "sent" | "failed";
  read: boolean;
  createdAt: Timestamp;
  sentAt?: Timestamp;
  readAt?: Timestamp;
}

export interface NotificationSettings {
  userId: string;
  pushEnabled: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  newMessages: boolean;
  aiCompanions: boolean;
  mediaUnlocks: boolean;
  streaksAndRoyal: boolean;
  earningsAndPayouts: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  updatedAt: Timestamp;
}

export interface PushToken {
  token: string;
  platform: "ios" | "android" | "web";
  createdAt: Timestamp;
  lastUsedAt: Timestamp;
}

export interface NewNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  context?: NotificationContext;
}