/**
 * PACK 213: Premium Match Priority Engine Types
 * Match ranking based on Attraction × Reputation × Earnings × Activity × Interests
 * 
 * CRITICAL: This pack does NOT modify:
 * - Token pricing
 * - Revenue splits (65/35)
 * - Chat/meeting/event pricing
 * - Any economic values
 * 
 * It ONLY controls discovery ranking and who appears first.
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// MATCH PRIORITY SCORE COMPONENTS
// ============================================================================

/**
 * Weight distribution for match priority score
 * Total weights must = 1.0
 */
export interface MatchPriorityWeights {
  attraction: number;      // 0.35 - like/wishlist history, swipes, dwell time
  reputation: number;      // 0.25 - soft reputation from PACK 212
  earningsSynergy: number; // 0.25 - likelihood of paid engagement
  recentActivity: number;  // 0.10 - activity in last 7 days
  interestProximity: number; // 0.05 - overlapping interests (optional)
}

export const DEFAULT_MATCH_PRIORITY_WEIGHTS: MatchPriorityWeights = {
  attraction: 0.35,
  reputation: 0.25,
  earningsSynergy: 0.25,
  recentActivity: 0.10,
  interestProximity: 0.05,
};

/**
 * Individual component scores (0-1 normalized)
 */
export interface MatchPriorityComponents {
  attractionScore: number;       // Based on interaction history
  reputationScore: number;       // From PACK 212
  earningsSynergyScore: number;  // Predicted economic compatibility
  recentActivityScore: number;   // Activity in last 7 days
  interestProximityScore: number; // Tag/interest overlap
}

/**
 * Complete match priority score for a candidate
 */
export interface MatchPriorityScore {
  candidateId: string;
  viewerId: string;
  components: MatchPriorityComponents;
  finalScore: number; // 0-100 scale
  calculatedAt: Timestamp;
  boostMultiplier: number; // 1.0 default, higher if boosted
  effectiveScore: number; // finalScore × boostMultiplier
}

// ============================================================================
// ATTRACTION SCORING
// ============================================================================

/**
 * User interaction signals that indicate attraction
 */
export interface AttractionSignals {
  userId: string;
  targetUserId: string;
  
  // Interaction history
  hasLiked: boolean;
  hasWishlisted: boolean;
  hasViewedProfile: boolean;
  profileViewCount: number;
  
  // Engagement metrics
  avgDwellTimeSeconds: number; // How long they view profile
  mediaExpansionCount: number; // How many photos/videos expanded
  lastInteractionAt?: Timestamp;
  
  // Swipe patterns
  totalSwipesSentToTarget: number;
  
  updatedAt: Timestamp;
}

/**
 * Aggregated attraction score for a user pair
 */
export interface AttractionScore {
  viewerId: string;
  candidateId: string;
  score: number; // 0-1
  signals: {
    hasLiked: boolean;
    profileViews: number;
    dwellTime: number;
    mediaExpanded: number;
  };
  lastUpdated: Timestamp;
}

// ============================================================================
// EARNINGS SYNERGY
// ============================================================================

/**
 * User's earning/spending profile for matching
 */
export interface UserEconomicProfile {
  userId: string;
  
  // Earning characteristics
  earnOnChat: boolean;
  earnOnMeetings: boolean;
  earnOnEvents: boolean;
  totalEarnings: number;
  avgEarningsPerChat: number;
  
  // Spending characteristics
  totalSpent: number;
  avgSpentPerChat: number;
  avgSpentPerMeeting: number;
  purchaseFrequency: number; // purchases per month
  
  // Royal status
  isRoyal: boolean;
  royalUpgradeDate?: Timestamp;
  
  // Engagement level
  recentEngagement: 'high' | 'medium' | 'low';
  
  lastUpdated: Timestamp;
}

/**
 * Predicted economic compatibility between two users
 */
export type EarningsSynergyLevel = 
  | 'EXTREME_HIGH'  // Royal male × high-engagement earner
  | 'VERY_HIGH'     // Male payer × Female earner
  | 'HIGH'          // New male with purchase history × attractive woman
  | 'MEDIUM'        // Friends-only × earn-on
  | 'MEDIUM_LOW'    // Two non-earning users
  | 'LOW'           // Two earning users (both wait to be paid)
  | 'VERY_LOW';     // Low engagement payer × high-demand creator

export interface EarningsSynergyScore {
  viewerId: string;
  candidateId: string;
  level: EarningsSynergyLevel;
  score: number; // 0-1
  reasoning: string;
  factors: {
    viewerIsSpender: boolean;
    candidateIsEarner: boolean;
    royalBonus: boolean;
    purchaseHistory: 'high' | 'medium' | 'low' | 'none';
    earnerDemand: 'high' | 'medium' | 'low';
  };
  lastUpdated: Timestamp;
}

// ============================================================================
// BOOST WINDOWS
// ============================================================================

/**
 * Types of actions that trigger temporary boosts
 */
export type BoostTriggerAction =
  | 'PURCHASE_TOKENS'
  | 'COMPLETE_PAID_CHAT'
  | 'COMPLETE_PAID_MEETING'
  | 'HOST_SUCCESSFUL_EVENT'
  | 'GIVE_VOLUNTARY_REFUND'
  | 'RECEIVE_GOOD_VIBE_MARK';

/**
 * Boost configuration for each action type
 */
export interface BoostConfig {
  action: BoostTriggerAction;
  multiplier: number; // 1.0 = no boost, 2.0 = double visibility
  durationHours: number;
  description: string;
}

export const BOOST_CONFIGS: Record<BoostTriggerAction, BoostConfig> = {
  PURCHASE_TOKENS: {
    action: 'PURCHASE_TOKENS',
    multiplier: 1.3,
    durationHours: 24,
    description: 'Short-term discovery boost after token purchase',
  },
  COMPLETE_PAID_CHAT: {
    action: 'COMPLETE_PAID_CHAT',
    multiplier: 1.2,
    durationHours: 12,
    description: 'Micro boost after completing paid chat',
  },
  COMPLETE_PAID_MEETING: {
    action: 'COMPLETE_PAID_MEETING',
    multiplier: 1.6,
    durationHours: 72,
    description: 'Big boost after successful paid meeting',
  },
  HOST_SUCCESSFUL_EVENT: {
    action: 'HOST_SUCCESSFUL_EVENT',
    multiplier: 1.7,
    durationHours: 72,
    description: 'Big boost for event organizers',
  },
  GIVE_VOLUNTARY_REFUND: {
    action: 'GIVE_VOLUNTARY_REFUND',
    multiplier: 1.15,
    durationHours: 24,
    description: 'Fairness signal boost',
  },
  RECEIVE_GOOD_VIBE_MARK: {
    action: 'RECEIVE_GOOD_VIBE_MARK',
    multiplier: 1.4,
    durationHours: 48,
    description: 'Solid boost from positive meeting feedback',
  },
};

/**
 * Active boost window for a user
 */
export interface ActiveBoostWindow {
  userId: string;
  action: BoostTriggerAction;
  multiplier: number;
  startsAt: Timestamp;
  expiresAt: Timestamp;
  isActive: boolean;
  metadata?: {
    chatId?: string;
    meetingId?: string;
    eventId?: string;
    amount?: number;
  };
}

/**
 * User's combined boost status (multiple boosts can stack)
 */
export interface UserBoostStatus {
  userId: string;
  activeBoosts: ActiveBoostWindow[];
  totalMultiplier: number; // Product of all active boost multipliers
  highestBoost?: BoostTriggerAction;
  lastBoostAt?: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// MATCH PRIORITY ENGINE STATE
// ============================================================================

/**
 * Cached match priority scores for quick retrieval
 */
export interface CachedMatchPriority {
  viewerId: string;
  candidateId: string;
  score: MatchPriorityScore;
  cachedAt: Timestamp;
  expiresAt: Timestamp; // Cache expires after 1 hour
}

/**
 * User's match priority profile
 * Stored per-user for efficient discovery
 */
export interface UserMatchProfile {
  userId: string;
  
  // Base characteristics
  gender: 'male' | 'female' | 'other';
  age: number;
  interests: string[];
  
  // Economic profile
  economicProfile: UserEconomicProfile;
  
  // Reputation (from PACK 212)
  reputationScore: number; // 0-100
  
  // Activity metrics
  lastActiveAt: Timestamp;
  activityLast7Days: {
    profileViews: number;
    likes: number;
    messages: number;
    purchases: number;
  };
  
  // Boost status
  boostStatus: UserBoostStatus;
  
  // Priority tier (calculated)
  priorityTier: 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW';
  
  lastUpdated: Timestamp;
}

// ============================================================================
// DISCOVERY INTEGRATION
// ============================================================================

/**
 * Enhanced discovery request with priority scoring
 */
export interface PriorityDiscoveryRequest {
  viewerId: string;
  filters?: {
    gender?: string;
    minAge?: number;
    maxAge?: number;
    maxDistance?: number;
    interests?: string[];
  };
  limit: number;
  cursor?: string;
  usePriorityRanking: boolean; // If true, uses PACK 213 scoring
}

/**
 * Discovery result with priority scores
 */
export interface PriorityDiscoveryResult {
  candidateId: string;
  priorityScore: number;
  priorityRank: number;
  boostActive: boolean;
  components: MatchPriorityComponents;
}

// ============================================================================
// USER-FACING MESSAGING
// ============================================================================

/**
 * Positive reinforcement messages shown to users
 * NEVER reveal algorithm details
 */
export type VisibilityMessage =
  | 'MORE_VISIBILITY_GOOD_ENERGY'
  | 'HIGH_CHEMISTRY_POTENTIAL'
  | 'RECENT_ACTIVITY_BOOST'
  | 'DISCOVERY_BOOST_ACTIVE';

export interface UserVisibilityFeedback {
  userId: string;
  message: VisibilityMessage;
  displayText: string;
  showUntil: Timestamp;
}

export const VISIBILITY_MESSAGES: Record<VisibilityMessage, string> = {
  MORE_VISIBILITY_GOOD_ENERGY: "You're getting more visibility thanks to your good energy.",
  HIGH_CHEMISTRY_POTENTIAL: "Avalo is showing you profiles based on high chemistry potential.",
  RECENT_ACTIVITY_BOOST: "Your recent activity automatically boosts discovery.",
  DISCOVERY_BOOST_ACTIVE: "Your profile has increased visibility right now.",
};

// ============================================================================
// ANALYTICS & DIAGNOSTICS
// ============================================================================

/**
 * Track priority scoring performance
 */
export interface MatchPriorityDiagnostics {
  viewerId: string;
  sessionId: string;
  
  // Scoring stats
  candidatesScored: number;
  avgScore: number;
  highestScore: number;
  lowestScore: number;
  
  // Component distributions
  componentAvgs: MatchPriorityComponents;
  
  // Boost impact
  boostedCandidates: number;
  avgBoostMultiplier: number;
  
  // Performance
  scoringTimeMs: number;
  
  timestamp: Timestamp;
}

/**
 * A/B testing configuration for priority weights
 */
export interface PriorityWeightTest {
  testId: string;
  name: string;
  description: string;
  weights: MatchPriorityWeights;
  startDate: Timestamp;
  endDate: Timestamp;
  isActive: boolean;
  
  // Results
  userCount?: number;
  avgEngagementRate?: number;
  avgConversionRate?: number;
}