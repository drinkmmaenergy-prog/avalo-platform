/**
 * PACK 212: Soft Reputation Engine
 * Type definitions for internal reputation scoring and behavioral rewards
 * 
 * IMPORTANT: This is an EXTENSION MODULE - does not replace existing logic.
 * Reputation scores are NEVER visible to users, only used for ranking.
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// CORE REPUTATION TYPES
// ============================================================================

/**
 * User's internal reputation profile
 * Score range: 0-100 (higher = better behavior)
 * NEVER exposed to users - used only for ranking
 */
export interface UserReputation {
  userId: string;
  reputationScore: number; // 0-100 (internal only)
  
  // Positive behavior counters
  chatConsistency: number; // Replies regularly, doesn't ghost
  qualityConversations: number; // Long, engaged conversations
  positiveFeedbackCount: number; // Thumbs up received
  meetingsAttended: number; // Showed up to meetings
  meetingsNoShow: number; // Failed to attend
  positiveVibeRatings: number; // Good meeting experiences
  eventsAttended: number; // Attended booked events
  goodGuestRatings: number; // Organizer positive ratings
  voluntaryRefundsGiven: number; // Fair gestures
  
  // Negative behavior counters
  harassmentReports: number; // Verified reports
  lastMinuteCancellations: number; // <24h cancellations
  appearanceComplaints: number; // "Not as described"
  blockedByOthersCount: number; // Times blocked
  systemAbuseAttempts: number; // Gaming attempts
  
  // Engagement metrics
  totalChatsStarted: number;
  totalChatsResponded: number;
  averageResponseTime: number; // Hours
  repeatPayerCount: number; // Users who paid multiple times
  
  // Current status
  activeBoost: boolean; // Currently receiving ranking boost
  activeLimiter: boolean; // Currently receiving soft limits
  boostLevel: 'NONE' | 'MINOR' | 'MODERATE' | 'MAJOR'; // Boost strength
  limiterLevel: 'NONE' | 'MINOR' | 'MODERATE' | 'MAJOR'; // Limiter strength
  
  // Tracking
  lastUpdated: Timestamp;
  lastPositiveEvent: Timestamp | null;
  lastNegativeEvent: Timestamp | null;
  createdAt: Timestamp;
}

/**
 * Reputation score thresholds for ranking effects
 */
export const REPUTATION_THRESHOLDS = {
  EXCELLENT: 80, // Major boost in discovery
  GOOD: 60,      // Moderate boost
  NEUTRAL: 40,   // No change
  POOR: 20,      // Minor limiter
  CRITICAL: 10,  // Major limiter
} as const;

/**
 * Reputation level based on score
 */
export type ReputationLevel = 'EXCELLENT' | 'GOOD' | 'NEUTRAL' | 'POOR' | 'CRITICAL';

// ============================================================================
// REPUTATION EVENTS & SCORING
// ============================================================================

/**
 * Events that affect reputation score
 */
export type ReputationEventType =
  // Positive events (increase score)
  | 'CHAT_RESPONSE_TIMELY'       // Replied within reasonable time
  | 'CHAT_QUALITY_HIGH'          // Long, engaged conversation
  | 'POSITIVE_FEEDBACK_RECEIVED' // Thumbs up after chat
  | 'MEETING_ATTENDED'           // Showed up on time
  | 'POSITIVE_VIBE_RATING'       // Good meeting experience
  | 'EVENT_ATTENDED'             // Attended event
  | 'GOOD_GUEST_RATING'          // Organizer positive feedback
  | 'VOLUNTARY_REFUND_GIVEN'     // Fair gesture
  | 'NO_REPORTS_MILESTONE'       // Clean record period
  
  // Negative events (decrease score)
  | 'HARASSMENT_REPORT_VERIFIED' // Verified harassment
  | 'MEETING_NO_SHOW'            // Didn't show up
  | 'LAST_MINUTE_CANCEL'         // Cancelled <24h
  | 'APPEARANCE_COMPLAINT'       // Not as described
  | 'BLOCKED_BY_USER'            // User blocked them
  | 'SYSTEM_ABUSE_DETECTED'      // Gaming attempts
  | 'SPAM_MESSAGES'              // Mass copy-paste
  | 'CHARGEBACK_ABUSE'           // Fraudulent reversals
  | 'STALKER_PATTERN'            // From PACK 211 integration
  | 'HIGH_RISK_SCORE';           // From PACK 211 integration

/**
 * Reputation event log entry
 */
export interface ReputationEvent {
  eventId: string;
  userId: string;
  eventType: ReputationEventType;
  
  // Score impact
  scoreImpact: number; // Positive or negative
  previousScore: number;
  newScore: number;
  
  // Context
  relatedUserId?: string; // Other party involved
  chatId?: string;
  bookingId?: string;
  relatedEventId?: string; // Event context if applicable
  attendeeId?: string;
  
  // Details
  description: string;
  metadata?: Record<string, any>;
  
  // Tracking
  createdAt: Timestamp;
  processed: boolean;
}

/**
 * Score weights for each event type
 */
export const REPUTATION_SCORE_WEIGHTS: Record<ReputationEventType, number> = {
  // Positive weights (increase score)
  CHAT_RESPONSE_TIMELY: +1,
  CHAT_QUALITY_HIGH: +2,
  POSITIVE_FEEDBACK_RECEIVED: +3,
  MEETING_ATTENDED: +5,
  POSITIVE_VIBE_RATING: +5,
  EVENT_ATTENDED: +4,
  GOOD_GUEST_RATING: +4,
  VOLUNTARY_REFUND_GIVEN: +6,
  NO_REPORTS_MILESTONE: +3,
  
  // Negative weights (decrease score)
  HARASSMENT_REPORT_VERIFIED: -15,
  MEETING_NO_SHOW: -10,
  LAST_MINUTE_CANCEL: -5,
  APPEARANCE_COMPLAINT: -12,
  BLOCKED_BY_USER: -8,
  SYSTEM_ABUSE_DETECTED: -20,
  SPAM_MESSAGES: -10,
  CHARGEBACK_ABUSE: -25,
  STALKER_PATTERN: -15,
  HIGH_RISK_SCORE: -10,
};

// ============================================================================
// FEEDBACK TYPES
// ============================================================================

/**
 * Optional chat feedback (thumbs up/down)
 */
export interface ChatFeedback {
  feedbackId: string;
  chatId: string;
  
  giverId: string; // User giving feedback
  giverName: string;
  
  receiverId: string; // User receiving feedback
  receiverName: string;
  
  isPositive: boolean; // true = thumbs up, false = thumbs down
  comment?: string; // Optional comment (max 500 chars)
  
  // Context
  chatDuration: number; // Minutes
  messageCount: number;
  
  createdAt: Timestamp;
  
  metadata?: {
    reportedToModeration?: boolean;
    flagged?: boolean;
  };
}

/**
 * Optional meeting vibe rating
 */
export interface MeetingFeedback {
  feedbackId: string;
  bookingId: string;
  
  giverId: string;
  giverName: string;
  
  receiverId: string;
  receiverName: string;
  
  vibeRating: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  showedUp: boolean;
  wouldMeetAgain: boolean;
  
  comment?: string; // Optional (max 500 chars)
  
  createdAt: Timestamp;
  
  metadata?: {
    meetingDuration?: number; // Minutes
    location?: string;
  };
}

/**
 * Event organizer rating for attendee
 */
export interface EventGuestRating {
  ratingId: string;
  eventId: string;
  attendeeId: string;
  
  organizerId: string;
  organizerName: string;
  
  guestId: string;
  guestName: string;
  
  isGoodGuest: boolean;
  showedUp: boolean;
  respectful: boolean;
  engaged: boolean;
  
  comment?: string; // Optional (max 500 chars)
  
  createdAt: Timestamp;
  
  metadata?: {
    eventType?: string;
    attendeeCount?: number;
  };
}

// ============================================================================
// RANKING & DISCOVERY BOOST
// ============================================================================

/**
 * Reputation adjustment applied to user
 */
export interface ReputationAdjustment {
  adjustmentId: string;
  userId: string;
  
  adjustmentType: 'BOOST' | 'LIMITER';
  level: 'MINOR' | 'MODERATE' | 'MAJOR';
  
  // Effects applied
  discoveryRankMultiplier: number; // 1.0 = normal, >1.0 = boost, <1.0 = limiter
  feedVisibilityMultiplier: number;
  suggestionPriorityMultiplier: number;
  
  // Scope
  appliesTo: ('DISCOVERY' | 'FEED' | 'SUGGESTIONS' | 'CHEMISTRY' | 'PASSPORT')[];
  
  // Status
  active: boolean;
  startedAt: Timestamp;
  expiresAt: Timestamp | null; // null = permanent until score changes
  
  // Reason
  triggerScore: number; // Score that triggered this
  reason: string;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Calculate boost/limiter multipliers based on score
 */
export function getReputationMultipliers(score: number): {
  discoveryRank: number;
  feedVisibility: number;
  suggestionPriority: number;
} {
  if (score >= REPUTATION_THRESHOLDS.EXCELLENT) {
    // Excellent: Major boost
    return {
      discoveryRank: 1.5,
      feedVisibility: 1.4,
      suggestionPriority: 1.6,
    };
  } else if (score >= REPUTATION_THRESHOLDS.GOOD) {
    // Good: Moderate boost
    return {
      discoveryRank: 1.25,
      feedVisibility: 1.2,
      suggestionPriority: 1.3,
    };
  } else if (score >= REPUTATION_THRESHOLDS.NEUTRAL) {
    // Neutral: No change
    return {
      discoveryRank: 1.0,
      feedVisibility: 1.0,
      suggestionPriority: 1.0,
    };
  } else if (score >= REPUTATION_THRESHOLDS.POOR) {
    // Poor: Minor limiter
    return {
      discoveryRank: 0.8,
      feedVisibility: 0.85,
      suggestionPriority: 0.75,
    };
  } else {
    // Critical: Major limiter
    return {
      discoveryRank: 0.5,
      feedVisibility: 0.6,
      suggestionPriority: 0.4,
    };
  }
}

// ============================================================================
// USER-FACING MESSAGING (POSITIVE ONLY)
// ============================================================================

/**
 * Positive hints users can see (NEVER show negative)
 */
export interface UserReputationHint {
  userId: string;
  
  // Positive stats (visible)
  positiveInteractionsCount: number;
  successfulMeetingsCount: number;
  goodVibeRatings: number;
  
  // Positive message
  message: string; // e.g., "People enjoy interacting with you on Avalo"
  
  // NEVER include
  // - Actual score
  // - Negative stats
  // - Comparison to others
  // - Ranking position
}

/**
 * Approved positive messages for users
 */
export const POSITIVE_REPUTATION_MESSAGES = {
  EXCELLENT: [
    "People enjoy interacting with you on Avalo.",
    "Your good energy is opening more doors in discovery.",
    "You're building a strong reputation — keep it up.",
  ],
  GOOD: [
    "Your positive interactions are noticed.",
    "Keep being authentic — it shows.",
    "You're creating good experiences on Avalo.",
  ],
  NEUTRAL: [
    "Keep building positive connections.",
    "Your interactions matter — keep engaging authentically.",
  ],
  // POOR and CRITICAL: No messages shown (silent limiter)
};

// ============================================================================
// INTEGRATION WITH PACK 211 (SAFETY)
// ============================================================================

/**
 * Reputation integrates with PACK 211 risk scoring
 * High reputation can slightly offset risk score
 * Low reputation increases risk weight
 */
export interface ReputationSafetyIntegration {
  userId: string;
  
  reputationScore: number; // From PACK 212
  riskScore: number;        // From PACK 211
  
  // Combined weighting
  effectiveRiskScore: number; // Risk adjusted by reputation
  reputationAdjustment: number; // How much reputation affects risk
  
  // Effects
  requiresExtraVerification: boolean;
  requiresManualReview: boolean;
  
  lastCalculated: Timestamp;
}

/**
 * Calculate effective risk score with reputation adjustment
 */
export function calculateEffectiveRiskScore(
  riskScore: number,
  reputationScore: number
): number {
  // High reputation slightly reduces effective risk
  // Low reputation increases effective risk
  
  if (reputationScore >= REPUTATION_THRESHOLDS.EXCELLENT) {
    // Excellent reputation: -10% risk
    return Math.max(0, riskScore * 0.9);
  } else if (reputationScore >= REPUTATION_THRESHOLDS.GOOD) {
    // Good reputation: -5% risk
    return Math.max(0, riskScore * 0.95);
  } else if (reputationScore <= REPUTATION_THRESHOLDS.CRITICAL) {
    // Critical reputation: +20% risk
    return Math.min(1000, riskScore * 1.2);
  } else if (reputationScore <= REPUTATION_THRESHOLDS.POOR) {
    // Poor reputation: +10% risk
    return Math.min(1000, riskScore * 1.1);
  }
  
  // Neutral: no adjustment
  return riskScore;
}

// ============================================================================
// ADMIN & MONITORING TYPES
// ============================================================================

/**
 * Admin view of reputation distribution
 */
export interface ReputationStats {
  totalUsers: number;
  
  distribution: {
    excellent: number; // Count of users with excellent reputation
    good: number;
    neutral: number;
    poor: number;
    critical: number;
  };
  
  averageScore: number;
  medianScore: number;
  
  activeBoostedUsers: number;
  activeLimitedUsers: number;
  
  lastUpdated: Timestamp;
}

/**
 * User reputation details for admin review
 */
export interface AdminReputationView {
  userId: string;
  userName: string;
  
  reputation: UserReputation;
  recentEvents: ReputationEvent[]; // Last 20 events
  
  // Integration with other systems
  riskProfile?: any; // From PACK 211
  trustScore?: number; // From PACK 209
  
  // Recommendations
  suggestedActions: string[];
  requiresReview: boolean;
  
  lastReviewedBy?: string;
  lastReviewedAt?: Timestamp;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to update reputation score
 */
export interface UpdateReputationRequest {
  userId: string;
  eventType: ReputationEventType;
  relatedUserId?: string;
  contextId?: string; // chatId, bookingId, eventId, etc.
  metadata?: Record<string, any>;
}

/**
 * Response from reputation update
 */
export interface UpdateReputationResponse {
  success: boolean;
  previousScore: number;
  newScore: number;
  scoreDelta: number;
  level: ReputationLevel;
  adjustmentChanged: boolean; // Boost/limiter changed
  error?: string;
}

/**
 * Request for user's reputation hint
 */
export interface GetReputationHintRequest {
  userId: string;
}

/**
 * Response with positive hint only
 */
export interface GetReputationHintResponse {
  hasHint: boolean;
  message?: string;
  positiveStats?: {
    interactions: number;
    meetings: number;
    ratings: number;
  };
}

/**
 * Request to get ranking multiplier
 */
export interface GetRankingMultiplierRequest {
  userId: string;
  context: 'DISCOVERY' | 'FEED' | 'SUGGESTIONS' | 'CHEMISTRY' | 'PASSPORT';
}

/**
 * Response with multiplier
 */
export interface GetRankingMultiplierResponse {
  userId: string;
  multiplier: number;
  level: ReputationLevel;
  hasBoost: boolean;
  hasLimiter: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Score bounds
 */
export const REPUTATION_SCORE_MIN = 0;
export const REPUTATION_SCORE_MAX = 100;
export const REPUTATION_SCORE_DEFAULT = 50; // Start neutral

/**
 * Rate limiting for feedback
 */
export const FEEDBACK_LIMITS = {
  CHAT_FEEDBACK_PER_DAY: 20,
  MEETING_FEEDBACK_PER_DAY: 10,
  EVENT_RATING_PER_DAY: 50,
};

/**
 * Feedback eligibility
 */
export const FEEDBACK_ELIGIBILITY = {
  CHAT_MIN_DURATION_MINUTES: 5,
  CHAT_MIN_MESSAGES: 10,
  MEETING_MUST_BE_COMPLETED: true,
  EVENT_ORGANIZER_ONLY: true,
};