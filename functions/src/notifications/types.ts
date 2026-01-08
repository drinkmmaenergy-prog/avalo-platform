/**
 * PACK 169 - Notification & Reminder System Types
 * Ethical notification management with anti-addiction safeguards
 */

export type NotificationCategory =
  | 'content'           // New course, challenge, post
  | 'digital_products'  // Launch, discount, resources
  | 'events'            // Livestreams, workshops, RSVP
  | 'progress'          // Milestone badges, achievements
  | 'clubs'             // Weekly themes, group exercises
  | 'messages'          // Unread chat, calls, media
  | 'system';           // Payout, purchase, security

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

export type DeliveryChannel = 'push' | 'email' | 'in_app' | 'sms';

export type DigestType = 'daily' | 'weekly' | 'instant';

export type ReminderType =
  | 'learning_consistency'
  | 'fitness_progress'
  | 'diet_tracking'
  | 'creativity_routine'
  | 'community_challenge'
  | 'content_publishing';

export interface NotificationSettings {
  userId: string;
  // Global controls
  globalEnabled: boolean;
  doNotDisturb: boolean;
  dndSchedule?: {
    enabled: boolean;
    startHour: number;
    endHour: number;
    days: number[]; // 0-6, Sunday-Saturday
  };
  // Snooze mode
  snoozedUntil?: Date;
  snoozeMode?: '24h' | '7d' | '30d';
  // Category toggles
  categories: {
    [K in NotificationCategory]: {
      enabled: boolean;
      channels: DeliveryChannel[];
      digestType: DigestType;
      maxPerDay: number;
    };
  };
  // Anti-addiction safeguards
  maxNotificationsPerDay: number;
  burnoutProtection: {
    enabled: boolean;
    dailyEngagementLimit: number; // minutes
    cooldownPeriod: number; // hours
  };
  // Frequency caps
  frequencyCaps: {
    perHour: number;
    perDay: number;
    perWeek: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string;
  data?: Record<string, any>;
  actionUrl?: string;
  imageUrl?: string;
  // Metadata
  read: boolean;
  readAt?: Date;
  archived: boolean;
  channels: DeliveryChannel[];
  // Tracking
  sentVia: DeliveryChannel[];
  deliveryStatus: {
    [K in DeliveryChannel]?: 'sent' | 'delivered' | 'failed' | 'bounced';
  };
  // Governance
  governanceChecked: boolean;
  governanceFlags: string[];
  // Timestamps
  createdAt: Date;
  expiresAt?: Date;
}

export interface NotificationTemplate {
  id: string;
  category: NotificationCategory;
  name: string;
  title: string;
  body: string;
  variables: string[];
  channels: DeliveryChannel[];
  priority: NotificationPriority;
  // Governance pre-approval
  governanceApproved: boolean;
  governanceCheckedAt?: Date;
  governanceFlags: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReminderRule {
  id: string;
  userId: string;
  reminderType: ReminderType;
  title: string;
  body: string;
  // Schedule
  frequency: 'daily' | 'weekly' | 'custom';
  customSchedule?: {
    daysOfWeek?: number[]; // 0-6
    timeOfDay?: string; // HH:MM
    interval?: number; // For custom intervals
    intervalUnit?: 'hours' | 'days' | 'weeks';
  };
  // Trigger conditions
  conditions?: {
    type: 'streak_break' | 'goal_miss' | 'inactivity' | 'schedule';
    threshold?: number;
  };
  // State
  active: boolean;
  paused: boolean;
  nextTriggerAt?: Date;
  lastTriggeredAt?: Date;
  triggerCount: number;
  // Anti-addiction
  maxTriggersPerDay: number;
  respectBurnoutProtection: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationDigest {
  id: string;
  userId: string;
  digestType: DigestType;
  category: NotificationCategory;
  notifications: string[]; // Notification IDs
  itemCount: number;
  summary: string;
  sent: boolean;
  sentAt?: Date;
  channels: DeliveryChannel[];
  createdAt: Date;
  periodStart: Date;
  periodEnd: Date;
}

export interface NotificationLog {
  id: string;
  notificationId: string;
  userId: string;
  category: NotificationCategory;
  channel: DeliveryChannel;
  deliveryStatus: 'sent' | 'delivered' | 'failed' | 'bounced' | 'blocked';
  // Governance tracking
  blocked: boolean;
  blockReason?: string;
  governanceFlags: string[];
  // Metadata
  templateId?: string;
  data?: Record<string, any>;
  sentAt: Date;
  deliveredAt?: Date;
  failureReason?: string;
}

export interface GovernanceResult {
  approved: boolean;
  flags: string[];
  blockReasons: string[];
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

export interface NotificationMetrics {
  userId: string;
  date: string; // YYYY-MM-DD
  // Counts
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  byCategory: {
    [K in NotificationCategory]: {
      sent: number;
      delivered: number;
      read: number;
    };
  };
  // Governance
  totalBlocked: number;
  blockReasons: Record<string, number>;
  // Engagement
  engagementMinutes: number;
  burnoutTriggered: boolean;
  createdAt: Date;
  updatedAt: Date;
}