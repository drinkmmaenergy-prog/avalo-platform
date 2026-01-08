/**
 * PACK 210: Panic Button + Trusted Contact + Live Safety Tracking
 * Type definitions for real-world safety system during meetings and events
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// SAFETY SESSION TYPES
// ============================================================================

export enum SafetySessionStatus {
  ACTIVE = 'ACTIVE', // Tracking is active
  ENDED = 'ENDED', // Normally ended by user
  PANIC_TRIGGERED = 'PANIC_TRIGGERED', // Panic button was pressed
  AUTO_ENDED = 'AUTO_ENDED', // Auto-ended after timer
  EXPIRED = 'EXPIRED', // Session expired without proper end
}

export interface SafetySession {
  sessionId: string;
  userId: string;
  userName: string;
  
  // Meeting or Event context
  bookingId?: string; // For 1:1 meetings
  eventId?: string; // For events
  attendeeId?: string; // For event attendee tracking
  
  status: SafetySessionStatus;
  
  // Venue information
  venueLocation: {
    latitude: number;
    longitude: number;
    address?: string;
    placeName?: string;
  };
  
  // Other party information (not visible to them)
  otherUserId?: string;
  otherUserName?: string;
  otherUserPhotos?: string[];
  
  // Trusted contact settings
  trustedContactEnabled: boolean;
  trustedContactId?: string;
  trustedContactAlerts?: boolean; // Receive panic alerts
  trackingLinkShared?: boolean;
  
  // Tracking configuration
  trackingIntervalSeconds: number; // 15 or 60 for low battery
  lowBatteryMode: boolean;
  batteryLevel?: number;
  
  // Timing
  startedAt: Timestamp;
  scheduledEndTime?: Timestamp;
  endedAt?: Timestamp;
  lastHeartbeat?: Timestamp;
  
  // Safety check timer
  safetyCheckEnabled: boolean;
  safetyCheckScheduledAt?: Timestamp;
  safetyCheckResponse?: 'SAFE' | 'NO_RESPONSE';
  
  // Panic information
  panicAlertId?: string;
  
  // Metadata
  deviceInfo?: {
    platform: string;
    appVersion: string;
    deviceId: string;
  };
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// LOCATION TRACKING TYPES
// ============================================================================

export interface LocationTrackingPoint {
  trackingId: string;
  sessionId: string;
  userId: string;
  
  // Location data
  latitude: number;
  longitude: number;
  accuracy?: number; // meters
  altitude?: number;
  speed?: number; // m/s
  heading?: number; // degrees
  
  // Battery status
  batteryLevel?: number;
  lowBatteryMode?: boolean;
  
  // Visibility control
  trustedContactEnabled: boolean;
  trustedContactId?: string;
  
  // Timestamps
  timestamp: Timestamp;
  serverReceivedAt: Timestamp;
  
  // For cleanup (30-day data retention)
  expiresAt: Timestamp;
}

// ============================================================================
// TRUSTED CONTACT TYPES
// ============================================================================

export enum TrustedContactRelationship {
  FRIEND = 'FRIEND',
  FAMILY = 'FAMILY',
  PARTNER_NON_DATE = 'PARTNER_NON_DATE', // Partner other than date
  ROOMMATE = 'ROOMMATE',
  COWORKER = 'COWORKER',
  OTHER = 'OTHER',
}

export interface TrustedContact {
  contactId: string;
  userId: string; // Owner of this trusted contact
  
  // Contact information
  name: string;
  phoneNumber: string;
  phoneCountryCode: string;
  email?: string;
  
  // Additional contact methods (optional)
  telegram?: string;
  whatsapp?: string;
  
  relationship: TrustedContactRelationship;
  
  // Settings
  isPrimary: boolean; // Default contact for safety tracking
  isActive: boolean;
  
  // Notification preferences
  receiveTrackingLinks: boolean;
  receivePanicAlerts: boolean;
  receiveAutoAlerts: boolean; // For "Are You Safe?" no-response
  
  // Usage tracking
  lastNotifiedAt?: Timestamp;
  totalAlertsReceived: number;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// PANIC ALERT TYPES
// ============================================================================

export enum PanicAlertTier {
  TIER_1_SILENT = 'TIER_1_SILENT', // Single tap - silent alert to trusted contact
  TIER_2_SOS = 'TIER_2_SOS', // Long press (3s) - escalate to Trust & Safety
}

export enum PanicAlertStatus {
  TRIGGERED = 'TRIGGERED',
  TRUSTEDCONTACT_NOTIFIED = 'TRUSTEDCONTACT_NOTIFIED',
  SAFETY_TEAM_NOTIFIED = 'SAFETY_TEAM_NOTIFIED',
  IN_REVIEW = 'IN_REVIEW',
  RESOLVED = 'RESOLVED',
  FALSE_ALARM = 'FALSE_ALARM',
}

export interface PanicAlert {
  alertId: string;
  tier: PanicAlertTier;
  status: PanicAlertStatus;
  
  // User information
  userId: string;
  userName: string;
  userPhotos?: string[];
  
  // Session context
  sessionId: string;
  bookingId?: string;
  eventId?: string;
  
  // Location at panic time
  location: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    address?: string;
  };
  venueLocation?: {
    latitude: number;
    longitude: number;
    address?: string;
    placeName?: string;
  };
  
  // Other party information (sent to trusted contact / safety team)
  otherUserId?: string;
  otherUserName?: string;
  otherUserPhotos?: string[];
  otherUserProfileUrl?: string;
  
  // Trusted contact information
  trustedContactId?: string;
  trustedContactName?: string;
  trustedContactNotifiedAt?: Timestamp;
  trackingLinkSent?: string; // URL for live tracking
  
  // Safety team escalation (Tier 2 only)
  safetyTeamNotifiedAt?: Timestamp;
  assignedToSafetyTeamMember?: string;
  
  // Resolution
  resolvedBy?: string;
  resolvedAt?: Timestamp;
  resolution?: string;
  notes?: string;
  
  // Meeting/Event actions
  meetingAutoEnded: boolean;
  payoutBlocked: boolean;
  
  // Device info for forensics
  deviceInfo?: {
    platform: string;
    appVersion: string;
    deviceId: string;
    ipHash?: string;
  };
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// SAFETY CHECK TIMER TYPES
// ============================================================================

export enum SafetyCheckStatus {
  SCHEDULED = 'SCHEDULED',
  SENT = 'SENT',
  RESPONDED_SAFE = 'RESPONDED_SAFE',
  NO_RESPONSE = 'NO_RESPONSE',
  CANCELLED = 'CANCELLED',
}

export interface SafetyCheckTimer {
  timerId: string;
  sessionId: string;
  userId: string;
  
  status: SafetyCheckStatus;
  
  // Timing
  scheduledAt: Timestamp;
  sentAt?: Timestamp;
  responseDeadline?: Timestamp; // 5 minutes after sent
  respondedAt?: Timestamp;
  
  // Response
  userResponse?: 'SAFE' | 'NEED_HELP';
  
  // Auto-alert if no response
  autoAlertTriggered?: boolean;
  trustedContactNotified?: boolean;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// PANIC NOTIFICATION TYPES
// ============================================================================

export enum NotificationChannel {
  SMS = 'SMS',
  EMAIL = 'EMAIL',
  TELEGRAM = 'TELEGRAM',
  WHATSAPP = 'WHATSAPP',
  IN_APP = 'IN_APP',
}

export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  OPENED = 'OPENED',
}

export interface PanicNotification {
  notificationId: string;
  alertId: string;
  
  // Recipient (trusted contact)
  recipientId: string; // contactId
  recipientName: string;
  
  // User in danger
  userId: string;
  userName: string;
  
  channel: NotificationChannel;
  status: NotificationStatus;
  
  // Message content
  subject?: string;
  message: string;
  trackingLink?: string;
  
  // Delivery tracking
  sentAt?: Timestamp;
  deliveredAt?: Timestamp;
  openedAt?: Timestamp;
  failureReason?: string;
  
  // Context
  panicTier: PanicAlertTier;
  venueInfo?: {
    name?: string;
    address?: string;
    coordinates: {
      latitude: number;
      longitude: number;
    };
  };
  
  createdAt: Timestamp;
}

// ============================================================================
// SAFETY EVENT LOG TYPES
// ============================================================================

export enum SafetyEventType {
  SESSION_STARTED = 'SESSION_STARTED',
  SESSION_ENDED = 'SESSION_ENDED',
  PANIC_TIER1_TRIGGERED = 'PANIC_TIER1_TRIGGERED',
  PANIC_TIER2_TRIGGERED = 'PANIC_TIER2_TRIGGERED',
  TRUSTEDCONTACT_NOTIFIED = 'TRUSTEDCONTACT_NOTIFIED',
  SAFETY_TEAM_NOTIFIED = 'SAFETY_TEAM_NOTIFIED',
  SAFETY_CHECK_SENT = 'SAFETY_CHECK_SENT',
  SAFETY_CHECK_NO_RESPONSE = 'SAFETY_CHECK_NO_RESPONSE',
  LOW_BATTERY_MODE_ACTIVATED = 'LOW_BATTERY_MODE_ACTIVATED',
  MEETING_AUTO_ENDED = 'MEETING_AUTO_ENDED',
  LOCATION_TRACKING_ERROR = 'LOCATION_TRACKING_ERROR',
  TRUSTED_CONTACT_ADDED = 'TRUSTED_CONTACT_ADDED',
  TRUSTED_CONTACT_REMOVED = 'TRUSTED_CONTACT_REMOVED',
}

export enum SafetyEventSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
  EMERGENCY = 'EMERGENCY',
}

export interface SafetyEventLog {
  logId: string;
  eventType: SafetyEventType;
  severity: SafetyEventSeverity;
  
  // User context
  userId: string;
  userName?: string;
  
  // Session context
  sessionId?: string;
  bookingId?: string;
  eventId?: string;
  alertId?: string;
  
  // Involved parties
  involvedUserIds: string[];
  
  // Event details
  description: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  
  // Actions taken
  actionsTaken?: string[];
  notificationsSent?: number;
  
  // Review flags
  requiresReview: boolean;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  reviewNotes?: string;
  
  // Metadata
  metadata?: {
    batteryLevel?: number;
    trackingActive?: boolean;
    responseTime?: number;
    [key: string]: any;
  };
  
  createdAt: Timestamp;
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface SafetySessionResponse {
  success: boolean;
  sessionId?: string;
  trackingActive?: boolean;
  trustedContactNotified?: boolean;
  error?: string;
}

export interface PanicAlertResponse {
  success: boolean;
  alertId?: string;
  tier: PanicAlertTier;
  trustedContactNotified?: boolean;
  safetyTeamNotified?: boolean;
  meetingEnded?: boolean;
  trackingLink?: string;
  error?: string;
}

export interface TrustedContactResponse {
  success: boolean;
  contactId?: string;
  isPrimary?: boolean;
  error?: string;
}

export interface LocationUpdateResponse {
  success: boolean;
  trackingId?: string;
  intervalChanged?: boolean;
  newInterval?: number;
  error?: string;
}

export interface SafetyCheckResponse {
  success: boolean;
  timerId?: string;
  scheduledAt?: Date;
  error?: string;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface SafetyTrackingConfig {
  // Tracking intervals
  normalTrackingInterval: number; // 15 seconds
  lowBatteryTrackingInterval: number; // 60 seconds
  lowBatteryThreshold: number; // 15%
  
  // Safety check timer
  safetyCheckDelayMinutes: number; // After meeting duration
  safetyCheckResponseWindowMinutes: number; // 5 minutes to respond
  
  // Data retention
  locationDataRetentionDays: number; // 30 days
  sessionDataRetentionDays: number; // 90 days
  
  // Panic alert settings
  tier1NotifyTrustedContact: boolean;
  tier2EscalateToSafetyTeam: boolean;
  tier2AutoCallEmergency: boolean; // Future feature
  
  // Privacy settings
  locationVisibleToOtherParty: boolean; // Always false
  locationVisibleToTrustedContact: boolean; // User controlled
}

export const DEFAULT_SAFETY_TRACKING_CONFIG: SafetyTrackingConfig = {
  normalTrackingInterval: 15,
  lowBatteryTrackingInterval: 60,
  lowBatteryThreshold: 15,
  safetyCheckDelayMinutes: 0, // After scheduled end time
  safetyCheckResponseWindowMinutes: 5,
  locationDataRetentionDays: 30,
  sessionDataRetentionDays: 90,
  tier1NotifyTrustedContact: true,
  tier2EscalateToSafetyTeam: true,
  tier2AutoCallEmergency: false,
  locationVisibleToOtherParty: false,
  locationVisibleToTrustedContact: true,
};