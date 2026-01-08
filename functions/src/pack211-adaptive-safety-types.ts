/**
 * PACK 211 — Adaptive Safety Intelligence
 * Gender-Aware Protection + Stalker Prevention + Risk Scoring
 * 
 * Extends PACKS 209-210 with adaptive safety based on user risk patterns
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore';

// ============================================================================
// USER TYPE CLASSIFICATION
// ============================================================================

/**
 * User categories for adaptive safety personalization
 * Based on real risk patterns, not stereotypes
 */
export type UserSafetyCategory = 
  | 'WOMAN_DATING_MEN'      // Higher harassment/persistence risk
  | 'MAN_DATING_WOMEN'      // Higher scam/misleading appearance risk
  | 'NONBINARY'             // Both harassment + misgendering risk
  | 'INFLUENCER_PROFILE'    // Stalking/obsessive re-booking risk
  | 'NEW_ACCOUNT'           // Identity uncertainty
  | 'STANDARD';             // Default category

/**
 * Primary dating preferences for safety categorization
 */
export interface DatingPreferences {
  interestedIn: 'MEN' | 'WOMEN' | 'EVERYONE';
  genderIdentity: 'MAN' | 'WOMAN' | 'NONBINARY' | 'OTHER';
  hasInfluencerStatus: boolean;  // Follower count > threshold
  accountAge: number;  // Days since account creation
}

// ============================================================================
// RISK SCORING SYSTEM
// ============================================================================

/**
 * Internal risk score (never visible to users)
 * Score range: 0-1000 (higher = more risky)
 */
export interface UserRiskProfile {
  userId: string;
  riskScore: number;  // 0-1000
  safetyCategory: UserSafetyCategory;
  
  // Score increase factors
  complaintCount: number;  // Appearance/safety complaints received
  blockCount: number;  // Times blocked after 1st message
  mismatchCount: number;  // Appearance mismatch cases
  panicAlertsTriggered: number;  // Times others panicked during meetings
  rejectionCount: number;  // Booking rejections received
  
  // Score decrease factors
  positiveConfirmations: number;  // Successful meetings with positive feedback
  successfulMeetings: number;  // Completed meetings without issues
  voluntaryRefundsGiven: number;  // Goodwill gestures
  highRatings: number;  // 4-5 star ratings received
  selfieReverifications: number;  // Voluntary re-verification
  
  // Tracking
  lastUpdated: Timestamp;
  lastIncidentDate: Timestamp | null;
  lastPositiveDate: Timestamp | null;
  createdAt: Timestamp;
}

/**
 * Risk level thresholds
 */
export const RISK_THRESHOLDS = {
  LOW: 0,
  MEDIUM: 300,
  HIGH: 600,
  CRITICAL: 850,
} as const;

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// ============================================================================
// ANTI-STALKING: REPEATED BOOKING PROTECTION
// ============================================================================

/**
 * Tracks booking attempts between two users
 */
export interface BookingAttemptHistory {
  historyId: string;
  requesterId: string;  // Person trying to book
  targetId: string;     // Person being booked
  
  // Attempt tracking
  totalAttempts: number;
  rejectionCount: number;  // 0, 1, 2, or 3 (3 = permanent block)
  lastAttemptDate: Timestamp;
  lastRejectionDate: Timestamp | null;
  
  // Cooldown status
  cooldownActive: boolean;
  cooldownUntil: Timestamp | null;  // 7, 21 days, or permanent
  permanentlyBlocked: boolean;
  
  // Meeting history
  completedMeetings: number;
  meetingOutcomes: MeetingOutcome[];  // Last 5 outcomes
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type MeetingOutcome = 
  | 'COMPLETED_NORMAL'
  | 'REJECTED'
  | 'CANCELLED_BY_REQUESTER'
  | 'CANCELLED_BY_TARGET'
  | 'PANIC_ENDED';

/**
 * Cooldown periods based on rejection count
 */
export const BOOKING_COOLDOWNS = {
  ONE_REJECTION: 7,      // 7 days
  TWO_REJECTIONS: 21,    // 21 days
  THREE_REJECTIONS: Infinity,  // Permanent block
} as const;

// ============================================================================
// REPEATED-MATCH STALKING PREVENTION (SWIPING)
// ============================================================================

/**
 * Tracks swipe patterns to detect obsessive behavior
 */
export interface SwipePatternTracking {
  trackingId: string;
  swiperId: string;     // Person swiping
  targetId: string;     // Person being swiped on
  
  // Swipe history
  totalRightSwipes: number;  // Times swiped right on same person
  noMatchCount: number;      // Times swiped but got no match
  lastSwipeDate: Timestamp;
  
  // Blocking status
  hiddenUntil: Timestamp | null;  // When profile will be shown again
  hiddenDays: number;  // 30 for regular, 90 for blocked-by-user
  permanentlyHidden: boolean;
  
  // Context
  wasBlockedByTarget: boolean;
  matchNeverHappened: boolean;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Hiding durations for repeated swiping
 */
export const SWIPE_HIDING_PERIODS = {
  REGULAR_USER: 30,      // 30 days
  BLOCKED_BY_USER: 90,   // 90 days
  PERMANENT: Infinity,   // Never show again
} as const;

// ============================================================================
// LOCATION-AWARE RISK REDUCTION
// ============================================================================

export type LocationRiskLevel = 
  | 'SAFE'          // Public café, restaurant, bar
  | 'ELEVATED'      // Hotel room, private apartment
  | 'HIGH'          // Remote location
  | 'BLOCKED';      // Hidden/no public address

/**
 * Location safety assessment
 */
export interface LocationSafetyCheck {
  checkId: string;
  bookingId?: string;
  eventId?: string;
  
  location: {
    latitude: number;
    longitude: number;
    address?: string;
    placeName?: string;
    placeType?: string;  // From Google Places API
  };
  
  riskLevel: LocationRiskLevel;
  riskFactors: string[];  // Reasons for risk level
  
  // Enhanced protections applied
  enhancedSelfieRequired: boolean;
  trustedContactMandatory: boolean;
  shortenedSafetyCheckTimer: boolean;  // 30 min instead of scheduled end
  meetingBlocked: boolean;  // Cannot start meeting
  
  assessedAt: Timestamp;
  assessedBy: 'AUTOMATIC' | 'MANUAL_REVIEW';
}

/**
 * Place type categorization for risk assessment
 */
export const LOCATION_CATEGORIES = {
  SAFE: [
    'cafe',
    'restaurant',
    'bar',
    'coffee_shop',
    'shopping_mall',
    'park',
    'museum',
    'library',
  ],
  ELEVATED: [
    'hotel',
    'lodging',
    'apartment',
    'private_residence',
  ],
  HIGH: [
    'remote',
    'isolated',
    'no_nearby_business',
  ],
  BLOCKED: [
    'hidden',
    'no_address',
    'coordinate_only',
  ],
} as const;

// ============================================================================
// SAFETY ADJUSTMENTS PER USER TYPE
// ============================================================================

/**
 * Safety sensitivity adjustments based on user category
 */
export interface SafetyAdjustments {
  category: UserSafetyCategory;
  
  // Booking protection
  bookingLimitsStrengthened: boolean;
  fasterAlertTriggers: boolean;  // Shorter timeouts for safety checks
  longerCooldownPeriods: boolean;
  
  // Verification
  enhancedSelfieVerification: boolean;
  refundTriggersEasier: boolean;
  
  // Moderation
  priorityModeration: boolean;
  fasterReporting: boolean;
  
  // Visibility
  softerVisibilityUntilVerified: boolean;  // New accounts
  reducedDiscoverability: boolean;  // Temporarily while verifying
}

/**
 * Get safety adjustments for user category
 */
export function getSafetyAdjustmentsForCategory(
  category: UserSafetyCategory
): SafetyAdjustments {
  switch (category) {
    case 'WOMAN_DATING_MEN':
      return {
        category,
        bookingLimitsStrengthened: true,
        fasterAlertTriggers: true,
        longerCooldownPeriods: true,
        enhancedSelfieVerification: false,
        refundTriggersEasier: false,
        priorityModeration: true,
        fasterReporting: true,
        softerVisibilityUntilVerified: false,
        reducedDiscoverability: false,
      };
    
    case 'MAN_DATING_WOMEN':
      return {
        category,
        bookingLimitsStrengthened: false,
        fasterAlertTriggers: false,
        longerCooldownPeriods: false,
        enhancedSelfieVerification: true,
        refundTriggersEasier: true,
        priorityModeration: false,
        fasterReporting: false,
        softerVisibilityUntilVerified: false,
        reducedDiscoverability: false,
      };
    
    case 'NONBINARY':
      return {
        category,
        bookingLimitsStrengthened: true,
        fasterAlertTriggers: true,
        longerCooldownPeriods: true,
        enhancedSelfieVerification: true,
        refundTriggersEasier: false,
        priorityModeration: true,
        fasterReporting: true,
        softerVisibilityUntilVerified: false,
        reducedDiscoverability: false,
      };
    
    case 'INFLUENCER_PROFILE':
      return {
        category,
        bookingLimitsStrengthened: true,
        fasterAlertTriggers: false,
        longerCooldownPeriods: true,  // Longer cooldowns between bookings
        enhancedSelfieVerification: false,
        refundTriggersEasier: false,
        priorityModeration: true,
        fasterReporting: true,
        softerVisibilityUntilVerified: false,
        reducedDiscoverability: false,
      };
    
    case 'NEW_ACCOUNT':
      return {
        category,
        bookingLimitsStrengthened: false,
        fasterAlertTriggers: false,
        longerCooldownPeriods: false,
        enhancedSelfieVerification: true,
        refundTriggersEasier: false,
        priorityModeration: false,
        fasterReporting: false,
        softerVisibilityUntilVerified: true,
        reducedDiscoverability: true,
      };
    
    case 'STANDARD':
    default:
      return {
        category: 'STANDARD',
        bookingLimitsStrengthened: false,
        fasterAlertTriggers: false,
        longerCooldownPeriods: false,
        enhancedSelfieVerification: false,
        refundTriggersEasier: false,
        priorityModeration: false,
        fasterReporting: false,
        softerVisibilityUntilVerified: false,
        reducedDiscoverability: false,
      };
  }
}

// ============================================================================
// SAFETY EVENTS & LOGGING
// ============================================================================

export type SafetyEventType = 
  | 'RISK_SCORE_INCREASED'
  | 'RISK_SCORE_DECREASED'
  | 'BOOKING_COOLDOWN_APPLIED'
  | 'BOOKING_PERMANENTLY_BLOCKED'
  | 'SWIPE_PATTERN_DETECTED'
  | 'PROFILE_HIDDEN_FROM_USER'
  | 'LOCATION_RISK_ELEVATED'
  | 'LOCATION_RISK_BLOCKED'
  | 'ENHANCED_VERIFICATION_REQUIRED'
  | 'SAFETY_CATEGORY_CHANGED';

/**
 * Adaptive safety event for audit trail
 */
export interface AdaptiveSafetyEvent {
  eventId: string;
  eventType: SafetyEventType;
  userId: string;
  relatedUserId?: string;  // Other party involved
  
  // Risk score changes
  previousRiskScore?: number;
  newRiskScore?: number;
  riskScoreDelta?: number;
  
  // Booking/swipe tracking
  bookingHistoryId?: string;
  swipeTrackingId?: string;
  
  // Location safety
  locationCheckId?: string;
  locationRiskLevel?: LocationRiskLevel;
  
  // Actions taken
  actionsTaken: string[];
  requiresReview: boolean;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  
  description: string;
  metadata?: Record<string, any>;
  
  createdAt: Timestamp;
}

// ============================================================================
// SAFETY WITHOUT BLOCKING DATING
// ============================================================================

/**
 * Actions that should NEVER trigger safety interventions
 * (Preserving consensual dating freedom)
 */
export const ALLOWED_BEHAVIORS = {
  FLIRTING: true,
  SEXUAL_TENSION: true,
  SEXTING: true,
  ROMANTIC_INTENSITY: true,
  AGE_GAP_OVER_18: true,
  CONSENSUAL_MEETING: true,
} as const;

/**
 * Only react to these actual safety concerns
 */
export const SAFETY_TRIGGERS = {
  USER_FEELS_UNSAFE: true,
  IDENTITY_MISMATCH: true,
  STALKING_PATTERN_DETECTED: true,
  REPEATED_UNWELCOME_BOOKING: true,
  LOCATION_RISK_FLAGGED: true,
  MINOR_CONTACT_ATTEMPTED: true,
} as const;

// ============================================================================
// UX COPY GUIDELINES
// ============================================================================

/**
 * Approved tone: Safe but not fear-inducing
 */
export const UX_COPY = {
  CORRECT: {
    CONTROL: "You're in control — safety features are protecting you in the background.",
    OFF_FEELING: "If anything feels off, you can end the meeting instantly.",
    BOOKING_CONTROL: "You decide who can book you and when.",
    CONFIDENCE: "Dating with confidence — we've got your back.",
  },
  INCORRECT: {
    FEAR: "Dating is dangerous.",
    DISCOURAGEMENT: "You should not meet people.",
    RESTRICTION: "Avoid romantic interactions.",
  },
} as const;

// ============================================================================
// RISK SCORE CALCULATION WEIGHTS
// ============================================================================

export const RISK_SCORE_WEIGHTS = {
  // Negative factors (increase risk score)
  COMPLAINT_RECEIVED: +50,
  BLOCKED_AFTER_FIRST_MESSAGE: +40,
  APPEARANCE_MISMATCH: +60,
  PANIC_ALERT_TRIGGERED_BY_OTHER: +100,
  BOOKING_REJECTED: +20,
  MINOR_CONTACT_ATTEMPT: +1000,  // Instant critical
  
  // Positive factors (decrease risk score)
  POSITIVE_CONFIRMATION: -10,
  SUCCESSFUL_MEETING: -15,
  VOLUNTARY_REFUND_GIVEN: -20,
  HIGH_RATING_RECEIVED: -25,
  SELFIE_REVERIFICATION: -30,
} as const;

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Request to calculate user's safety category
 */
export interface CalculateSafetyCategoryRequest {
  userId: string;
  datingPreferences: DatingPreferences;
  followerCount?: number;
  accountCreatedAt: Timestamp;
}

/**
 * Request to update risk score
 */
export interface UpdateRiskScoreRequest {
  userId: string;
  event: keyof typeof RISK_SCORE_WEIGHTS;
  relatedUserId?: string;
  metadata?: Record<string, any>;
}

/**
 * Request to check booking cooldown
 */
export interface CheckBookingCooldownRequest {
  requesterId: string;
  targetId: string;
}

/**
 * Response for cooldown check
 */
export interface BookingCooldownStatus {
  canBook: boolean;
  reason?: string;
  cooldownActive: boolean;
  cooldownUntil: Date | null;
  rejectionCount: number;
  permanentlyBlocked: boolean;
}

/**
 * Request to assess location safety
 */
export interface AssessLocationSafetyRequest {
  bookingId?: string;
  eventId?: string;
  location: {
    latitude: number;
    longitude: number;
    address?: string;
    placeName?: string;
  };
  requestedBy: string;
}