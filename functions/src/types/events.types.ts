/**
 * PACK 117: Events, Meetups & Real-World Experiences
 * Type definitions for safe in-person events system
 * 
 * CRITICAL RULES:
 * - SAFE events only (no NSFW, no dating/escort services)
 * - Token-only payments (65% creator / 35% Avalo)
 * - Background risk screening before enrollment
 * - Location privacy until confirmed
 * - No discovery/ranking boosts from events
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// EVENT TYPES (SAFE ONLY)
// ============================================================================

export enum EventType {
  COMMUNITY_MEETUP = "COMMUNITY_MEETUP",
  FITNESS_WORKSHOP = "FITNESS_WORKSHOP",
  PHOTOGRAPHY_WALK = "PHOTOGRAPHY_WALK",
  COACHING_SESSION = "COACHING_SESSION",
  EDUCATIONAL_CLASS = "EDUCATIONAL_CLASS",
  NETWORKING_EVENT = "NETWORKING_EVENT",
  OUTDOOR_ACTIVITY = "OUTDOOR_ACTIVITY",
  CREATIVE_WORKSHOP = "CREATIVE_WORKSHOP",
}

export enum EventStatus {
  UPCOMING = "UPCOMING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum RiskLevel {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  BLOCKED = "BLOCKED",
}

export enum AttendeeStatus {
  PENDING = "PENDING",           // Awaiting risk screening
  CONFIRMED = "CONFIRMED",        // Risk check passed
  DENIED = "DENIED",              // Risk check failed
  CANCELLED_BY_USER = "CANCELLED_BY_USER",
  REFUNDED = "REFUNDED",          // Host cancelled
}

// ============================================================================
// EVENT DATA MODEL
// ============================================================================

export interface Event {
  eventId: string;
  hostUserId: string;
  hostName: string;
  hostAvatar?: string;
  
  // Event details
  title: string;                  // 5-100 chars
  description: string;             // 20-2000 chars
  type: EventType;
  
  // Pricing
  priceTokens: number;            // 0 = free event, max 5000
  
  // Location (privacy-protected)
  region: string;                 // City or country (e.g., "Warsaw, Poland")
  locationDetails?: {
    address?: string;              // Full address (revealed to confirmed attendees only)
    venue?: string;                // Venue name
    latitude?: number;             // GPS coordinates (revealed to confirmed attendees only)
    longitude?: number;
  };
  
  // Timing
  startTime: Timestamp;
  endTime: Timestamp;
  
  // Capacity
  capacity?: number;              // Optional max attendees
  attendeesCount: number;         // Current confirmed count
  
  // Safety & Risk
  riskLevel: RiskLevel;           // Auto-calculated
  requiresApproval: boolean;      // Host manually approves attendees
  
  // Status
  status: EventStatus;
  isActive: boolean;
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // Tags (SAFE only)
  tags: string[];
  
  // Preview image
  previewImageRef?: string;
}

// ============================================================================
// ATTENDEE DATA MODEL
// ============================================================================

export interface EventAttendee {
  attendeeId: string;
  eventId: string;
  eventTitle: string;
  
  userId: string;
  userName: string;
  userAvatar?: string;
  
  hostUserId: string;
  
  // Payment
  tokensAmount: number;           // 0 for free events
  platformFee: number;            // 35% of tokens
  creatorEarnings: number;        // 65% of tokens
  
  // Status
  status: AttendeeStatus;
  
  // Risk screening
  riskCheckPassed: boolean;
  riskCheckReasons?: string[];    // Why denied (admin only)
  riskScoreSnapshot?: number;     // Snapshot at enrollment
  
  // Check-in
  checkedIn: boolean;
  checkInCode?: string;           // Unique code for this attendee
  checkInTime?: Timestamp;
  
  // Location access
  hasLocationAccess: boolean;     // True after confirmation
  
  // Timestamps
  enrolledAt: Timestamp;
  confirmedAt?: Timestamp;
  
  // Transaction
  transactionId?: string;
  refundTransactionId?: string;
}

// ============================================================================
// SAFETY SURVEY
// ============================================================================

export interface EventSafetySurvey {
  surveyId: string;
  eventId: string;
  userId: string;
  
  // Survey questions
  feltSafe: boolean;
  matchedDescription: boolean;
  wouldAttendAgain: boolean;
  
  // Free text
  concerns?: string;
  positiveExperience?: string;
  
  // Flags
  reportThreat: boolean;
  reportMisrepresentation: boolean;
  
  submittedAt: Timestamp;
}

// ============================================================================
// NSFW & ESCORT BLOCKING (ZERO TOLERANCE)
// ============================================================================

export const BLOCKED_EVENT_KEYWORDS = [
  // Explicit terms
  'adult', 'explicit', 'nsfw', 'nude', 'naked', 'sexy', 'sex',
  'porn', 'xxx', 'erotic', 'sensual', 'intimate', 'bedroom',
  'lingerie', 'bikini', 'underwear', 'escort', 'companion',
  
  // Dating/romance terms
  'date', 'dating', 'romance', 'romantic', 'girlfriend experience',
  'boyfriend experience', 'sugar', 'arrangement', 'discrete',
  'discreet', 'private encounter', 'intimate meeting',
  
  // Payment/compensation terms
  'compensated', 'paid company', 'hourly rate', 'overnight',
  'hotel room', 'private room', 'payperdate', 'cash only',
  
  // OnlyFans/adult platform terms
  'onlyfans', 'fansly', 'manyvids', 'chaturbate',
  
  // Suspicious location terms
  '1 attendee', 'one on one', 'solo', 'exclusive access',
  'private venue', 'undisclosed location',
];

// ============================================================================
// SAFE CATEGORIES
// ============================================================================

export enum EventCategory {
  FITNESS = "fitness",
  WELLNESS = "wellness",
  PHOTOGRAPHY = "photography",
  EDUCATION = "education",
  NETWORKING = "networking",
  OUTDOOR = "outdoor",
  CREATIVE = "creative",
  PROFESSIONAL = "professional",
  LIFESTYLE = "lifestyle",
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export const EVENT_CONFIG = {
  // Pricing limits (in tokens)
  minPrice: 0,                    // Free events allowed
  maxPrice: 5000,
  
  // Revenue split (NON-NEGOTIABLE)
  platformFeePercentage: 0.35,    // 35%
  creatorEarningsPercentage: 0.65, // 65%
  
  // Capacity limits
  minCapacity: 1,
  maxCapacity: 100,
  
  // Time limits
  minDuration: 30 * 60 * 1000,    // 30 minutes
  maxDuration: 8 * 60 * 60 * 1000, // 8 hours
  minAdvanceNotice: 24 * 60 * 60 * 1000, // 24 hours
  
  // Title/description limits
  titleMinLength: 5,
  titleMaxLength: 100,
  descriptionMinLength: 20,
  descriptionMaxLength: 2000,
  
  // Risk thresholds (from PACK 85)
  riskScoreHighThreshold: 50,     // Block if >= 50
  riskScoreMediumThreshold: 25,   // Review if >= 25
  
  // Check-in code length
  checkInCodeLength: 6,
  
  // Refund policy
  refundOnHostCancel: true,
  refundOnUserCancel: false,      // No refunds for user cancellation
  
  // Download limits
  maxDownloads: 5,
  
  // Survey grace period (days after event)
  surveyGracePeriod: 7,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if event content contains blocked keywords
 */
export function containsBlockedKeywords(text: string): boolean {
  const lowerText = text.toLowerCase();
  return BLOCKED_EVENT_KEYWORDS.some(keyword => 
    lowerText.includes(keyword.toLowerCase())
  );
}

/**
 * Calculate event risk level based on content and host
 */
export function calculateEventRiskLevel(
  event: Partial<Event>,
  hostRiskScore?: number
): RiskLevel {
  // Check for NSFW keywords
  const titleRisky = containsBlockedKeywords(event.title || '');
  const descRisky = containsBlockedKeywords(event.description || '');
  
  if (titleRisky || descRisky) {
    return RiskLevel.BLOCKED;
  }
  
  // Check host risk score
  if (hostRiskScore !== undefined) {
    if (hostRiskScore >= EVENT_CONFIG.riskScoreHighThreshold) {
      return RiskLevel.HIGH;
    } else if (hostRiskScore >= EVENT_CONFIG.riskScoreMediumThreshold) {
      return RiskLevel.MEDIUM;
    }
  }
  
  // Check for suspicious patterns
  if (event.capacity === 1) {
    return RiskLevel.HIGH; // Private 1-on-1 events are suspicious
  }
  
  // Check for very high price (possible escort pricing)
  if (event.priceTokens && event.priceTokens > 2000) {
    return RiskLevel.MEDIUM;
  }
  
  return RiskLevel.LOW;
}

/**
 * Generate unique check-in code
 */
export function generateCheckInCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude similar chars
  let code = '';
  for (let i = 0; i < EVENT_CONFIG.checkInCodeLength; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Validate event data
 */
export function validateEventData(data: Partial<Event>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // Title validation
  if (!data.title || data.title.length < EVENT_CONFIG.titleMinLength) {
    errors.push(`Title must be at least ${EVENT_CONFIG.titleMinLength} characters`);
  }
  if (data.title && data.title.length > EVENT_CONFIG.titleMaxLength) {
    errors.push(`Title must be at most ${EVENT_CONFIG.titleMaxLength} characters`);
  }
  
  // Description validation
  if (!data.description || data.description.length < EVENT_CONFIG.descriptionMinLength) {
    errors.push(`Description must be at least ${EVENT_CONFIG.descriptionMinLength} characters`);
  }
  if (data.description && data.description.length > EVENT_CONFIG.descriptionMaxLength) {
    errors.push(`Description must be at most ${EVENT_CONFIG.descriptionMaxLength} characters`);
  }
  
  // Price validation
  if (data.priceTokens !== undefined) {
    if (data.priceTokens < EVENT_CONFIG.minPrice) {
      errors.push(`Price must be at least ${EVENT_CONFIG.minPrice} tokens`);
    }
    if (data.priceTokens > EVENT_CONFIG.maxPrice) {
      errors.push(`Price must be at most ${EVENT_CONFIG.maxPrice} tokens`);
    }
  }
  
  // Capacity validation
  if (data.capacity !== undefined) {
    if (data.capacity < EVENT_CONFIG.minCapacity) {
      errors.push(`Capacity must be at least ${EVENT_CONFIG.minCapacity}`);
    }
    if (data.capacity > EVENT_CONFIG.maxCapacity) {
      errors.push(`Capacity must be at most ${EVENT_CONFIG.maxCapacity}`);
    }
  }
  
  // NSFW check
  if (containsBlockedKeywords(data.title || '')) {
    errors.push('Event title contains inappropriate content');
  }
  if (containsBlockedKeywords(data.description || '')) {
    errors.push('Event description contains inappropriate content');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}