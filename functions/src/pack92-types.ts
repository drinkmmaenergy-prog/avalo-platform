/**
 * PACK 92 — Unified Notification & Messaging Engine
 * TypeScript Type Definitions
 * 
 * NON-NEGOTIABLE RULES:
 * - No free tokens, no bonuses, no discounts
 * - Do not change token price per unit
 * - Do not change revenue split (65% creator / 35% Avalo)
 * - Notifications inform about earnings, never guarantee future income
 * - Legal/trust/enforcement notifications must be clear, neutral, compliant
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// NOTIFICATION TYPES
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

export type NotificationChannel = 'IN_APP' | 'PUSH';

// ============================================================================
// NOTIFICATION DOCUMENT
// ============================================================================

export interface NotificationDocument {
  id: string;
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body: string;
  deepLink?: string;
  read: boolean;
  createdAt: Timestamp;
  channels: NotificationChannel[];
  payload?: Record<string, any>;
}

// ============================================================================
// USER NOTIFICATION SETTINGS
// ============================================================================

export interface UserNotificationSettings {
  userId: string;
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
  updatedAt: Timestamp;
}

export const MANDATORY_CATEGORIES: NotificationCategory[] = ['LEGAL', 'SAFETY'];

// ============================================================================
// DEVICE PUSH TOKEN
// ============================================================================

export interface UserDevice {
  userId: string;
  deviceId: string;
  pushToken: string;
  platform: 'ios' | 'android' | 'web';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// SEND NOTIFICATION INPUT
// ============================================================================

export interface SendNotificationInput {
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body: string;
  deepLink?: string;
  payload?: Record<string, any>;
  forceChannels?: NotificationChannel[]; // For critical notifications (legal, enforcement, safety)
}

// ============================================================================
// NOTIFICATION TEMPLATES
// ============================================================================

export interface NotificationTemplate {
  type: NotificationType;
  title: (params: Record<string, any>) => string;
  body: (params: Record<string, any>) => string;
  deepLink?: (params: Record<string, any>) => string;
  category: NotificationCategory;
}