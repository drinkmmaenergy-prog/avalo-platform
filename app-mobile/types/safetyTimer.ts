/**
 * PACK 77 - Safety Center & Meet-Up Check-In Types
 * Type definitions for safety timers and panic button functionality
 */

export type SafetyTimerStatus = 'active' | 'completed_ok' | 'expired_no_checkin' | 'cancelled';
export type SafetyEventType = 'panic' | 'timer_expired_no_checkin' | 'timer_completed_ok';

/**
 * Location snapshot from PACK 76 geoshare module
 */
export interface LocationSnapshot {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: Date;
}

/**
 * Safety Timer document in Firestore
 */
export interface SafetyTimer {
  id: string;
  userId: string;
  trustedContacts: string[]; // Array of user IDs
  durationSeconds: number;
  status: SafetyTimerStatus;
  createdAt: Date;
  expiresAt: Date;
  note: string;
  lastKnownLocation?: LocationSnapshot;
  completedAt?: Date;
  cancelledAt?: Date;
}

/**
 * Safety Event document in Firestore
 */
export interface SafetyEvent {
  id: string;
  userId: string;
  type: SafetyEventType;
  createdAt: Date;
  lastKnownLocation?: LocationSnapshot;
  timerId?: string; // Reference to timer if event is timer-related
  notificationsSent: boolean;
  trustedContactsNotified: string[]; // Array of user IDs notified
}

/**
 * Duration options for safety timers (in minutes)
 */
export const SAFETY_TIMER_DURATIONS = [30, 60, 90] as const;
export type SafetyTimerDuration = typeof SAFETY_TIMER_DURATIONS[number];

/**
 * Request to create a safety timer
 */
export interface CreateSafetyTimerRequest {
  durationMinutes: SafetyTimerDuration;
  note: string;
  trustedContacts: string[];
}

/**
 * Response from creating a safety timer
 */
export interface CreateSafetyTimerResponse {
  success: boolean;
  timerId: string;
  expiresAt: string;
  message?: string;
}

/**
 * Request to check in on a safety timer
 */
export interface CheckInSafetyTimerRequest {
  timerId: string;
}

/**
 * Response from checking in on a safety timer
 */
export interface CheckInSafetyTimerResponse {
  success: boolean;
  message?: string;
}

/**
 * Request to trigger panic button
 */
export interface TriggerPanicRequest {
  lastKnownLocation?: LocationSnapshot;
}

/**
 * Response from triggering panic button
 */
export interface TriggerPanicResponse {
  success: boolean;
  eventId: string;
  message?: string;
}

/**
 * Safety alert details shown to trusted contacts
 */
export interface SafetyAlertDetails {
  id: string;
  type: 'timer_expired' | 'panic_button';
  userId: string;
  userName: string;
  userProfilePicture?: string;
  createdAt: Date;
  note?: string;
  lastKnownLocation?: LocationSnapshot;
  timerId?: string;
  eventId?: string;
}

/**
 * User's safety timer summary
 */
export interface SafetyTimerSummary {
  timerId: string;
  status: SafetyTimerStatus;
  durationMinutes: number;
  remainingSeconds: number;
  note: string;
  trustedContactsCount: number;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Config for safety center
 */
export interface SafetyCenterConfig {
  MAX_ACTIVE_TIMERS: number;
  MAX_TRUSTED_CONTACTS: number;
  MIN_CHECK_IN_INTERVAL_MS: number;
  NOTIFICATION_ADVANCE_TIMES_MINUTES: number[];
}

export const SAFETY_CENTER_CONFIG: SafetyCenterConfig = {
  MAX_ACTIVE_TIMERS: 1, // Only one active timer at a time
  MAX_TRUSTED_CONTACTS: 5, // Maximum 5 trusted contacts per timer
  MIN_CHECK_IN_INTERVAL_MS: 30000, // 30 seconds minimum between check-ins
  NOTIFICATION_ADVANCE_TIMES_MINUTES: [10, 5], // Notify at 10 min and 5 min before expiry
};