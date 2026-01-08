/**
 * PACK 315 - Push Notifications & Growth Funnels
 * TypeScript types and interfaces
 */

// ============================================================================
// Device Management
// ============================================================================

export type DevicePlatform = 'ANDROID' | 'IOS' | 'WEB';

export interface UserDevice {
  deviceId: string;
  userId: string;
  
  platform: DevicePlatform;
  pushToken: string | null;        // FCM/APNs/web push token
  language: string;                // Device/app language (e.g., 'pl', 'en')
  country: string;                 // User's country (e.g., 'PL')
  timeZone: string;                // IANA timezone (e.g., 'Europe/Warsaw')
  
  appVersion: string;              // App version (e.g., '1.0.0')
  osVersion: string;               // OS version (e.g., 'Android 14')
  
  lastSeenAt: string;              // ISO datetime
  createdAt: string;               // ISO datetime
  updatedAt: string;               // ISO datetime
  
  enabled: boolean;                // Whether push is enabled
}

// ============================================================================
// Notification Preferences
// ============================================================================

export interface NotificationCategories {
  transactional: boolean;          // Verification, bookings, payouts, safety
  social: boolean;                 // Likes, visits, matches
  growth: boolean;                 // Activation, retention nudges
  marketing: boolean;              // Promotional campaigns (future)
}

export interface QuietHours {
  enabled: boolean;
  startLocalTime: string;          // e.g., '22:00'
  endLocalTime: string;            // e.g., '08:00'
}

export interface NotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;           // Future fallback
  
  categories: NotificationCategories;
  quietHours: QuietHours;
}

// ============================================================================
// Notification Types
// ============================================================================

export type NotificationType =
  // Verification & Account
  | 'VERIFICATION_NUDGE'
  | 'VERIFICATION_SUCCESS'
  
  // Chat & Social
  | 'NEW_MESSAGE'
  | 'NEW_MATCH'
  | 'NEW_CONNECTION'
  | 'NEW_LIKE'
  | 'NEW_PROFILE_VISIT'
  
  // Calendar & Meetings
  | 'BOOKING_CONFIRMED'
  | 'MEETING_REMINDER_BEFORE'
  | 'MEETING_STATUS_UPDATE'
  | 'MEETING_CANCELLED'
  | 'MEETING_REFUND_PROCESSED'
  
  // Events
  | 'EVENT_TICKET_CONFIRMED'
  | 'EVENT_REMINDER'
  | 'EVENT_UPDATED'
  | 'EVENT_CANCELLED'
  
  // Wallet & Payouts
  | 'TOKEN_PURCHASE_SUCCESS'
  | 'TOKEN_PURCHASE_FAILED_RETRY'
  | 'PAYOUT_INITIATED'
  | 'PAYOUT_COMPLETED'
  | 'PAYOUT_FAILED_CONTACT_SUPPORT'
  
  // Safety
  | 'PANIC_BUTTON_FOLLOWUP'
  | 'ACCOUNT_UNDER_REVIEW'
  | 'ACCOUNT_RESTORED'
  | 'ACCOUNT_BANNED'
  | 'SAFETY_WARNING'
  
  // Growth - Activation
  | 'GROWTH_ACTIVATION_PHOTOS'
  | 'GROWTH_ACTIVATION_PROFILE'
  | 'GROWTH_ACTIVATION_VERIFICATION'
  | 'GROWTH_ACTIVATION_FIRST_SWIPE'
  
  // Growth - Retention
  | 'GROWTH_RETENTION_NEW_PEOPLE'
  | 'GROWTH_RETENTION_UNSEEN_LIKES'
  | 'GROWTH_RETENTION_AI_WAITING'
  | 'GROWTH_RETENTION_COMEBACK';

export type NotificationCategory = 'TRANSACTIONAL' | 'GROWTH' | 'MARKETING' | 'SAFETY';

export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED';

// ============================================================================
// Notification Document
// ============================================================================

export interface LocalizedText {
  [languageCode: string]: string;  // e.g., { en: '...', pl: '...' }
}

export interface NotificationData {
  screen?: 'CHAT' | 'PROFILE' | 'CALENDAR' | 'EVENT' | 'WALLET' | 'SAFETY_CENTER' | 'VERIFICATION' | 'SWIPE';
  screenParams?: Record<string, any>;  // { chatId: '...', eventId: '...', etc. }
  deepLink?: string;                   // e.g., 'avalo://chat/123'
  imageUrl?: string;                   // Optional notification image
  actionUrl?: string;                  // Optional action URL
}

export interface Notification {
  notificationId: string;
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  
  title: LocalizedText;
  body: LocalizedText;
  
  data: NotificationData;
  
  language: string;                    // Chosen at send-time
  status: NotificationStatus;
  attempts: number;
  
  scheduledAt: string;                 // ISO datetime
  sentAt: string | null;               // ISO datetime
  
  createdAt: string;                   // ISO datetime
  updatedAt: string;                   // ISO datetime
  
  // Optional metadata
  funnelId?: string;                   // For growth funnels
  stepNumber?: number;                 // For funnel steps
  priority?: 'LOW' | 'NORMAL' | 'HIGH';
}

// ============================================================================
// Notification Templates
// ============================================================================

export interface NotificationTemplate {
  type: NotificationType;
  category: NotificationCategory;
  title: LocalizedText;
  body: LocalizedText;
  defaultScreen?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH';
}

// ============================================================================
// Enqueue Parameters
// ============================================================================

export interface EnqueueNotificationParams {
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  data?: NotificationData;
  scheduledAtOverride?: string;        // Optional: schedule for later
  funnelId?: string;
  stepNumber?: number;
  priority?: 'LOW' | 'NORMAL' | 'HIGH';
  templateOverride?: {                 // Optional: override template
    title?: LocalizedText;
    body?: LocalizedText;
  };
}

// ============================================================================
// Notification Events (Analytics)
// ============================================================================

export type NotificationEventType = 'ENQUEUED' | 'SENT' | 'OPENED' | 'DISMISSED' | 'FAILED';

export interface NotificationEvent {
  eventId: string;
  notificationId: string;
  userId: string;
  deviceId?: string;
  
  eventType: NotificationEventType;
  notificationType: NotificationType;
  category: NotificationCategory;
  
  timestamp: string;                   // ISO datetime
  
  // Context
  country: string;
  appVersion: string;
  platform: DevicePlatform;
  language: string;
  
  // Funnel tracking
  funnelId?: string;
  stepNumber?: number;
  
  // Feature flags snapshot (for A/B testing)
  featureFlagsSnapshot?: Record<string, any>;
  
  // Error details (if FAILED)
  errorCode?: string;
  errorMessage?: string;
}

// ============================================================================
// Growth Funnels
// ============================================================================

export type FunnelId = 
  | 'ACTIVATION_PROFILE_COMPLETION'
  | 'ACTIVATION_PHOTO_UPLOAD'
  | 'ACTIVATION_VERIFICATION'
  | 'ACTIVATION_FIRST_SWIPE'
  | 'RETENTION_3_DAY'
  | 'RETENTION_7_DAY'
  | 'RETENTION_14_DAY'
  | 'RE_ENGAGEMENT_AI';

export type FunnelStepStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'FAILED';

export interface FunnelStep {
  stepId: string;
  userId: string;
  funnelId: FunnelId;
  stepNumber: number;
  stepName: string;
  
  status: FunnelStepStatus;
  
  startedAt?: string;                  // ISO datetime
  completedAt?: string;                // ISO datetime
  
  notificationId?: string;             // Associated notification
  notificationSentAt?: string;         // When nudge was sent
  
  createdAt: string;                   // ISO datetime
  updatedAt: string;                   // ISO datetime
  
  // Metadata
  metadata?: Record<string, any>;
}

// ============================================================================
// Rate Limiting
// ============================================================================

export interface NotificationRateLimit {
  userId: string;
  date: string;                        // YYYY-MM-DD
  
  counts: {
    transactional: number;
    social: number;
    growth: number;
    marketing: number;
    total: number;
  };
  
  lastResetAt: string;                 // ISO datetime
}

// ============================================================================
// Push Sending
// ============================================================================

export interface PushPayload {
  title: string;
  body: string;
  data: NotificationData;
  imageUrl?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH';
}

export interface SendPushResult {
  success: boolean;
  deviceId: string;
  platform: DevicePlatform;
  error?: string;
  errorCode?: string;
}

// ============================================================================
// Configuration
// ============================================================================

export interface NotificationConfig {
  // Rate limits per day
  maxTransactionalPerDay: number;      // e.g., 20
  maxSocialPerDay: number;             // e.g., 10
  maxGrowthPerDay: number;             // e.g., 2
  maxMarketingPerDay: number;          // e.g., 1
  
  // Retry settings
  maxRetryAttempts: number;            // e.g., 3
  retryDelayMinutes: number;           // e.g., 5
  
  // Quiet hours override
  allowTransactionalInQuietHours: boolean;
  allowSafetyInQuietHours: boolean;
  
  // Batch processing
  batchSize: number;                   // e.g., 100 notifications per batch
  processingIntervalMinutes: number;   // e.g., 5
}

// ============================================================================
// Helper Types
// ============================================================================

export interface NotificationContext {
  user: {
    userId: string;
    language: string;
    country: string;
    timeZone: string;
  };
  preferences: NotificationPreferences;
  devices: UserDevice[];
  rateLimits: NotificationRateLimit;
}

export interface ProcessNotificationResult {
  notificationId: string;
  success: boolean;
  sentToDevices: number;
  failedDevices: number;
  errors: string[];
  skippedReason?: 'USER_PREFERENCE' | 'QUIET_HOURS' | 'RATE_LIMIT' | 'NO_DEVICES' | 'LEGAL_RESTRICTION';
}