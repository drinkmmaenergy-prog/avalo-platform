/**
 * PACK 118 — Virtual Events / Live Classes Type Definitions
 * 
 * Zero NSFW/Dating/Escort Tolerance
 * Token-Only Access | 65/35 Split | No Discounts
 * Full Moderation | Safe Content Only
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// NSFW BLOCKING
// ============================================================================

/**
 * Forbidden keywords for virtual events (40+ terms)
 * NO NSFW, dating, escort, or romantic content allowed
 */
export const BLOCKED_VIRTUAL_EVENT_KEYWORDS = [
  // Explicit NSFW
  'adult', 'explicit', 'nsfw', 'nude', 'naked', 'sexy', 'sex',
  'porn', 'xxx', 'erotic', 'sensual', 'intimate', 'bedroom',
  'lingerie', 'stripper', 'strip', 'cam show', 'webcam show',
  
  // Dating/Romance
  'date', 'dating', 'romance', 'romantic', 'girlfriend experience',
  'boyfriend experience', 'sugar', 'arrangement', 'discrete',
  'hookup', 'flirt', 'flirting', 'matchmaking',
  
  // Payment/Compensation for company
  'compensated', 'paid company', 'hourly rate', 'overnight',
  'private room', 'hotel', 'my place', 'your place',
  
  // External platforms
  'onlyfans', 'fansly', 'patreon',
  
  // Suspicious patterns
  'one on one only', '1-on-1 only', 'singles only',
  'couples only', 'vip experience', 'exclusive access',
] as const;

// ============================================================================
// EVENT TYPES (SAFE ONLY)
// ============================================================================

/**
 * Virtual event types - SAFE CONTENT ONLY
 * NO adult/NSFW/dating formats allowed
 */
export enum VirtualEventType {
  // Fitness & Wellness
  GROUP_FITNESS = 'GROUP_FITNESS',
  YOGA_CLASS = 'YOGA_CLASS',
  MEDITATION_SESSION = 'MEDITATION_SESSION',
  WELLNESS_WORKSHOP = 'WELLNESS_WORKSHOP',
  
  // Education & Skills
  LANGUAGE_CLASS = 'LANGUAGE_CLASS',
  COOKING_CLASS = 'COOKING_CLASS',
  EDUCATIONAL_WORKSHOP = 'EDUCATIONAL_WORKSHOP',
  PROFESSIONAL_TRAINING = 'PROFESSIONAL_TRAINING',
  
  // Creative & Arts
  ART_CLASS = 'ART_CLASS',
  MUSIC_LESSON = 'MUSIC_LESSON',
  CREATIVE_WORKSHOP = 'CREATIVE_WORKSHOP',
  
  // Business & Coaching
  BUSINESS_COACHING = 'BUSINESS_COACHING',
  CAREER_COACHING = 'CAREER_COACHING',
  PRODUCTIVITY_SESSION = 'PRODUCTIVITY_SESSION',
  
  // Community
  GROUP_DISCUSSION = 'GROUP_DISCUSSION',
  COMMUNITY_MEETUP = 'COMMUNITY_MEETUP',
  NETWORKING_EVENT = 'NETWORKING_EVENT',
}

/**
 * Event status lifecycle
 */
export enum VirtualEventStatus {
  UPCOMING = 'UPCOMING',       // Scheduled, accepting attendees
  IN_PROGRESS = 'IN_PROGRESS', // Live session active
  COMPLETED = 'COMPLETED',     // Session ended
  CANCELLED = 'CANCELLED',     // Cancelled by host
}

/**
 * Attendee enrollment status
 */
export enum AttendeeStatus {
  ENROLLED = 'ENROLLED',       // Paid and confirmed
  CHECKED_IN = 'CHECKED_IN',   // Entered waiting room
  JOINED = 'JOINED',           // In live session
  REFUNDED = 'REFUNDED',       // Host cancellation refund
}

/**
 * NSFW level - MUST always be SAFE for virtual events
 */
export type NSFWLevel = 'SAFE';

// ============================================================================
// DATA MODELS
// ============================================================================

/**
 * Virtual Event (Main Collection)
 * Collection: virtual_events/{eventId}
 */
export interface VirtualEvent {
  eventId: string;
  hostUserId: string;
  hostName: string;
  hostAvatar?: string;
  
  // Event details
  title: string;                    // 5-100 chars
  description: string;               // 20-2000 chars
  type: VirtualEventType;
  
  // Pricing (0 = free, no discounts allowed)
  priceTokens: number;              // 0-5000 tokens
  
  // Capacity
  maxParticipants: number;          // Required, 2-500
  currentParticipants: number;      // Real-time count
  
  // Schedule
  startTime: Timestamp;
  endTime: Timestamp;
  waitingRoomOpenAt: Timestamp;     // When attendees can check in
  
  // Status
  status: VirtualEventStatus;
  
  // NSFW Level (MUST BE SAFE)
  nsfwLevel: NSFWLevel;             // Always "SAFE"
  
  // Recording (optional)
  recordingEnabled: boolean;
  recordingUrl?: string | null;     // Encrypted storage URL
  recordingAvailableUntil?: Timestamp | null;
  
  // Moderation
  assistants: string[];             // User IDs with co-host powers
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // Additional metadata
  tags?: string[];
  region?: string;                  // Optional regional grouping
}

/**
 * Virtual Event Attendee
 * Collection: virtual_event_attendees/{attendeeId}
 */
export interface VirtualEventAttendee {
  attendeeId: string;
  eventId: string;
  eventTitle: string;
  eventStartTime: Timestamp;
  
  // User info
  userId: string;
  userName: string;
  userAvatar?: string;
  
  // Host info
  hostUserId: string;
  
  // Payment
  tokensAmount: number;             // Total paid (0 if free)
  platformFee: number;              // 35%
  hostEarnings: number;             // 65%
  
  // Status
  status: AttendeeStatus;
  
  // Access control
  hasRecordingAccess: boolean;      // Auto-granted on enrollment
  checkedInAt?: Timestamp | null;
  joinedLiveAt?: Timestamp | null;
  
  // Timestamps
  enrolledAt: Timestamp;
  refundedAt?: Timestamp | null;
  transactionId?: string;
}

/**
 * Live Session State (Ephemeral)
 * Collection: live_sessions/{eventId}
 * Auto-deleted after event completion
 */
export interface LiveSessionState {
  eventId: string;
  status: 'WAITING_ROOM' | 'LIVE' | 'ENDED';
  
  // Participants in waiting room
  waitingRoomUsers: string[];       // User IDs
  
  // Participants in live session
  liveUsers: string[];              // User IDs
  
  // WebRTC room details
  roomId: string;
  signalingChannelId: string;
  
  // Moderation actions
  mutedUsers: string[];             // User IDs
  removedUsers: string[];           // Kicked user IDs
  
  // Timestamps
  waitingRoomOpenedAt?: Timestamp | null;
  liveStartedAt?: Timestamp | null;
  endedAt?: Timestamp | null;
  
  updatedAt: Timestamp;
}

// ============================================================================
// VALIDATION & SAFETY
// ============================================================================

/**
 * Check if text contains blocked keywords
 */
export function containsBlockedKeywords(text: string): boolean {
  const lowerText = text.toLowerCase();
  return BLOCKED_VIRTUAL_EVENT_KEYWORDS.some(keyword => 
    lowerText.includes(keyword.toLowerCase())
  );
}

/**
 * Validate virtual event data
 */
export function validateVirtualEventData(data: Partial<VirtualEvent>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // Title validation
  if (!data.title || data.title.length < 5 || data.title.length > 100) {
    errors.push('Title must be 5-100 characters');
  }
  if (data.title && containsBlockedKeywords(data.title)) {
    errors.push('Title contains prohibited content. Virtual events must be SAFE only.');
  }
  
  // Description validation
  if (!data.description || data.description.length < 20 || data.description.length > 2000) {
    errors.push('Description must be 20-2000 characters');
  }
  if (data.description && containsBlockedKeywords(data.description)) {
    errors.push('Description contains prohibited content. Virtual events must be SAFE only.');
  }
  
  // Type validation
  if (!data.type || !Object.values(VirtualEventType).includes(data.type)) {
    errors.push('Invalid event type. Only SAFE educational/wellness events allowed.');
  }
  
  // Pricing validation
  if (data.priceTokens !== undefined) {
    if (data.priceTokens < 0 || data.priceTokens > 5000) {
      errors.push('Price must be 0-5000 tokens');
    }
    if (!Number.isInteger(data.priceTokens)) {
      errors.push('Price must be a whole number');
    }
  }
  
  // Capacity validation
  if (data.maxParticipants !== undefined) {
    if (data.maxParticipants < 2 || data.maxParticipants > 500) {
      errors.push('Max participants must be 2-500');
    }
    // Flag 1-on-1 as high risk (potential dating/escort)
    if (data.maxParticipants === 1) {
      errors.push('1-on-1 virtual events are not allowed. Use group formats only.');
    }
  }
  
  // NSFW level MUST be SAFE
  if (data.nsfwLevel && data.nsfwLevel !== 'SAFE') {
    errors.push('Virtual events must have NSFW level set to SAFE only');
  }
  
  // Schedule validation
  if (data.startTime && data.endTime) {
    const start = data.startTime.toMillis();
    const end = data.endTime.toMillis();
    const now = Date.now();
    
    if (start <= now) {
      errors.push('Start time must be in the future');
    }
    if (end <= start) {
      errors.push('End time must be after start time');
    }
    const durationMs = end - start;
    const maxDurationMs = 4 * 60 * 60 * 1000; // 4 hours
    if (durationMs > maxDurationMs) {
      errors.push('Event duration cannot exceed 4 hours');
    }
    const minDurationMs = 30 * 60 * 1000; // 30 minutes
    if (durationMs < minDurationMs) {
      errors.push('Event duration must be at least 30 minutes');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate revenue split (35/65)
 */
export function calculateEventRevenueSplit(priceTokens: number): {
  platformFee: number;
  hostEarnings: number;
} {
  const PLATFORM_FEE_PERCENTAGE = 0.35;
  const platformFee = Math.floor(priceTokens * PLATFORM_FEE_PERCENTAGE);
  const hostEarnings = priceTokens - platformFee;
  
  return { platformFee, hostEarnings };
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Create virtual event request
 */
export interface CreateVirtualEventRequest {
  title: string;
  description: string;
  type: VirtualEventType;
  priceTokens: number;
  maxParticipants: number;
  startTime: string;              // ISO timestamp
  endTime: string;                // ISO timestamp
  waitingRoomMinutesBefore?: number; // Default 15 minutes
  recordingEnabled?: boolean;     // Default false
  tags?: string[];
  region?: string;
}

/**
 * Update virtual event request
 */
export interface UpdateVirtualEventRequest {
  eventId: string;
  title?: string;
  description?: string;
  priceTokens?: number;
  maxParticipants?: number;
  startTime?: string;
  endTime?: string;
  recordingEnabled?: boolean;
  tags?: string[];
}

/**
 * Cancel virtual event request
 */
export interface CancelVirtualEventRequest {
  eventId: string;
  reason: string;
}

/**
 * Join virtual event request
 */
export interface JoinVirtualEventRequest {
  eventId: string;
}

/**
 * Leave virtual event request
 */
export interface LeaveVirtualEventRequest {
  eventId: string;
}

/**
 * Check in to waiting room request
 */
export interface CheckInToEventRequest {
  eventId: string;
}

/**
 * List events request
 */
export interface ListVirtualEventsRequest {
  region?: string;
  limit?: number;
  startAfter?: string;            // Pagination cursor
}

/**
 * Get my events request
 */
export interface GetMyEventsRequest {
  status?: 'UPCOMING' | 'COMPLETED';
  limit?: number;
}

/**
 * Standard response
 */
export interface VirtualEventResponse {
  success: boolean;
  message: string;
  eventId?: string;
  data?: any;
}

// ============================================================================
// MODERATOR ACTIONS
// ============================================================================

/**
 * Moderator action types
 */
export enum ModeratorAction {
  MUTE_USER = 'MUTE_USER',
  UNMUTE_USER = 'UNMUTE_USER',
  REMOVE_USER = 'REMOVE_USER',
  BAN_USER = 'BAN_USER',           // Permanent ban from host's events
  END_SESSION = 'END_SESSION',
}

/**
 * Moderator action request
 */
export interface ModeratorActionRequest {
  eventId: string;
  action: ModeratorAction;
  targetUserId?: string;            // Required except for END_SESSION
  reason?: string;
}
