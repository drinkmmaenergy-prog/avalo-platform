/**
 * PACK 255 — AI Matchmaker Engine — Type Definitions
 * 
 * Personalized match ranking based on behavioral signals,
 * swipe heating, relevance boosts, and cloned taste engine.
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// BEHAVIORAL SIGNALS
// ============================================================================

/**
 * Types of behavioral signals that indicate interest or disinterest
 */
export enum BehaviorSignalType {
  // Attraction signals (positive)
  PROFILE_VIEW_LONG = 'profile_view_long',      // >4s view
  PROFILE_VIEW_SHORT = 'profile_view_short',    // <4s view
  SWIPE_RIGHT = 'swipe_right',
  MESSAGE_SENT = 'message_sent',
  MESSAGE_REPLY = 'message_reply',
  PAID_CHAT = 'paid_chat',
  CALL_STARTED = 'call_started',
  MEETING_BOOKED = 'meeting_booked',
  GIFT_SENT = 'gift_sent',
  MEDIA_UNLOCKED = 'media_unlocked',
  
  // Disinterest signals (negative)
  SWIPE_LEFT = 'swipe_left',
  SWIPE_LEFT_FAST = 'swipe_left_fast',          // <1s view
  MESSAGE_IGNORED = 'message_ignored',
  CHAT_ABANDONED = 'chat_abandoned',
  PROFILE_SKIPPED = 'profile_skipped',
}

/**
 * Individual behavioral signal
 */
export interface BehaviorSignal {
  userId: string;
  targetUserId: string;
  type: BehaviorSignalType;
  timestamp: Timestamp;
  metadata?: {
    viewDuration?: number;                       // milliseconds
    messageLength?: number;
    amount?: number;                             // for paid interactions
    context?: string;                            // where signal occurred
  };
}

/**
 * Aggregated behavioral profile
 */
export interface UserBehaviorProfile {
  userId: string;
  totalSwipes: number;
  swipeRightCount: number;
  swipeLeftCount: number;
  swipeRightRate: number;                        // % of right swipes
  avgProfileViewTime: number;                    // milliseconds
  totalMatches: number;
  matchConversionRate: number;                   // matches / right swipes
  messageResponseRate: number;                   // replies / messages received
  paidChatCount: number;
  meetingCount: number;
  lastActive: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // Learned preferences (built from behavior)
  learnedPreferences?: LearnedPreferences;
}

// ============================================================================
// LEARNED PREFERENCES (CLONED TASTE ENGINE)
// ============================================================================

/**
 * Preferences learned from user behavior
 */
export interface LearnedPreferences {
  userId: string;
  
  // Visual preferences (from liked profiles)
  preferredAgeRange?: { min: number; max: number };
  preferredDistanceKm?: number;
  preferredBodyTypes?: string[];
  preferredStyles?: string[];
  
  // Behavioral patterns
  preferredResponseTimeHours?: number;
  preferredConversationLength?: 'short' | 'medium' | 'long';
  preferredTimeOfDay?: string[];                 // hours when most active
  
  // Similarity clusters (similar profiles liked)
  visualSimilarity?: number[];                   // embedding vectors
  profileTextSimilarity?: number[];              // text embeddings
  lifestyleSimilarity?: string[];                // interests, hobbies
  
  // Confidence scores
  confidenceLevel: number;                       // 0-1, based on data volume
  swipesAnalyzed: number;                        // how many swipes analyzed
  lastUpdated: Timestamp;
}

// ============================================================================
// SWIPE HEATING
// ============================================================================

/**
 * Emotional triggers that activate swipe heating
 */
export enum EmotionalTrigger {
  MATCH_RECEIVED = 'match_received',
  MESSAGE_READ = 'message_read',
  GIFT_RECEIVED = 'gift_received',
  BOOST_PURCHASED = 'boost_purchased',
  MEDIA_PURCHASED = 'media_purchased',
  PAID_CHAT_END = 'paid_chat_end',
  CALL_END = 'call_end',
  MEETING_COMPLETED = 'meeting_completed',
  POSITIVE_INTERACTION = 'positive_interaction',
}

/**
 * Swipe heating state for a user
 */
export interface SwipeHeatingState {
  userId: string;
  isHeated: boolean;
  trigger?: EmotionalTrigger;
  triggeredAt?: Timestamp;
  expiresAt?: Timestamp;                         // heating window (5-15 min)
  heatLevel: number;                             // 0-100
  consecutiveHeats: number;                      // how many times heated today
}

// ============================================================================
// MATCH RANKING & RELEVANCE
// ============================================================================

/**
 * User tier for relevance boosts
 */
export enum UserTier {
  ROYAL = 'royal',                               // Royal Club members
  HIGH_ENGAGEMENT = 'high_engagement',           // High response rate
  HIGH_MONETIZATION = 'high_monetization',       // High paid conversion
  STANDARD = 'standard',
  LOW_POPULARITY = 'low_popularity',             // Protected tier
  NEW_USER = 'new_user',                         // <7 days old
}

/**
 * Match candidate with ranking score
 */
export interface MatchCandidate {
  userId: string;
  
  // Core scores
  baseScore: number;                             // 0-100, raw compatibility
  behaviorScore: number;                         // 0-100, behavior-based
  similarityScore: number;                       // 0-100, taste similarity
  recencyScore: number;                          // 0-100, activity recency
  popularityScore: number;                       // 0-100, overall popularity
  
  // Boosts
  tierBoost: number;                             // multiplier from user tier
  heatingBoost: number;                          // multiplier from swipe heating
  
  // Final
  finalScore: number;                            // weighted & boosted score
  
  // Metadata
  tier: UserTier;
  isHeated?: boolean;
  distance?: number;                             // km
  lastActive?: Timestamp;
  
  // Explanation (for debugging/transparency)
  scoreBreakdown?: {
    base: number;
    behavior: number;
    similarity: number;
    recency: number;
    popularity: number;
    tierMultiplier: number;
    heatingMultiplier: number;
  };
}

/**
 * Match ranking weights (configurable)
 */
export interface MatchRankingWeights {
  behavior: number;                              // default 0.35
  similarity: number;                            // default 0.30
  recency: number;                               // default 0.15
  popularity: number;                            // default 0.10
  base: number;                                  // default 0.10
}

/**
 * Relevance boost multipliers by tier
 */
export interface RelevanceBoosts {
  royal: number;                                 // default 1.5x
  highEngagement: number;                        // default 1.3x
  highMonetization: number;                      // default 1.4x
  standard: number;                              // default 1.0x
  lowPopularity: number;                         // default 1.2x (protected)
  newUser: number;                               // default 1.25x (onboarding)
}

// ============================================================================
// MATCH ENGINE CONFIGURATION
// ============================================================================

/**
 * Configuration for AI Matchmaker Engine
 */
export interface MatchEngineConfig {
  // Ranking weights
  weights: MatchRankingWeights;
  
  // Relevance boosts
  boosts: RelevanceBoosts;
  
  // Swipe heating
  heatingEnabled: boolean;
  heatingWindowMinutes: number;                  // default 10
  heatingDecayRate: number;                      // how fast heat decays
  maxHeatsPerDay: number;                        // limit per user
  
  // Behavioral learning
  minSwipesForLearning: number;                  // default 60
  learningUpdateInterval: number;                // days, default 1
  
  // Protection thresholds
  lowPopularityThreshold: number;                // swipe rate percentile
  lowPopularityBoostInterval: number;            // hours between boosts
  
  // Safety & ethics
  enabledFilters: string[];                      // no race/religion/etc
  requireBehaviorBased: boolean;                 // true (always)
}

// ============================================================================
// MATCH RESULTS
// ============================================================================

/**
 * Discovery feed result with ranked candidates
 */
export interface DiscoveryFeedResult {
  candidates: MatchCandidate[];
  cursor?: string;
  hasMore: boolean;
  metadata: {
    totalCandidates: number;
    filteredCount: number;
    rankedCount: number;
    avgScore: number;
    isHeated: boolean;
    generationTimeMs: number;
  };
}

/**
 * Match statistics for monitoring
 */
export interface MatchStats {
  userId: string;
  date: string;                                  // YYYY-MM-DD
  
  // Swipe stats
  totalSwipes: number;
  rightSwipes: number;
  leftSwipes: number;
  
  // Match stats
  matches: number;
  matchRate: number;                             // matches / right swipes
  
  // Engagement stats
  messages: number;
  messageRate: number;                           // messages / matches
  replies: number;
  replyRate: number;                             // replies / messages received
  
  // Monetization stats
  paidChats: number;
  calls: number;
  meetings: number;
  
  // Heating stats
  heatedSessions: number;
  conversionsWhileHeated: number;
}

// ============================================================================
// ADMIN & MONITORING
// ============================================================================

/**
 * System-wide match engine performance
 */
export interface MatchEngineMetrics {
  timestamp: Timestamp;
  
  // Overall stats
  totalUsers: number;
  activeUsers: number;
  totalSwipes24h: number;
  totalMatches24h: number;
  avgMatchRate: number;
  
  // Behavioral learning
  usersWithLearnedPreferences: number;
  avgConfidenceLevel: number;
  
  // Swipe heating
  heatedSessions24h: number;
  conversionRateHeated: number;
  conversionRateNormal: number;
  heatingEffectiveness: number;                  // heated / normal ratio
  
  // Tier distribution
  tierCounts: Record<UserTier, number>;
  
  // Quality metrics
  avgResponseRate: number;
  avgPaidConversionRate: number;
  avgMeetingConversionRate: number;
}

/**
 * A/B test variant for match engine
 */
export interface MatchEngineVariant {
  id: string;
  name: string;
  description: string;
  config: Partial<MatchEngineConfig>;
  isActive: boolean;
  userPercentage: number;                        // 0-100
  createdAt: Timestamp;
}

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

export const DEFAULT_RANKING_WEIGHTS: MatchRankingWeights = {
  behavior: 0.35,
  similarity: 0.30,
  recency: 0.15,
  popularity: 0.10,
  base: 0.10,
};

export const DEFAULT_RELEVANCE_BOOSTS: RelevanceBoosts = {
  royal: 1.5,
  highEngagement: 1.3,
  highMonetization: 1.4,
  standard: 1.0,
  lowPopularity: 1.2,
  newUser: 1.25,
};

export const DEFAULT_ENGINE_CONFIG: MatchEngineConfig = {
  weights: DEFAULT_RANKING_WEIGHTS,
  boosts: DEFAULT_RELEVANCE_BOOSTS,
  heatingEnabled: true,
  heatingWindowMinutes: 10,
  heatingDecayRate: 0.1,
  maxHeatsPerDay: 20,
  minSwipesForLearning: 60,
  learningUpdateInterval: 1,
  lowPopularityThreshold: 10,
  lowPopularityBoostInterval: 6,
  enabledFilters: ['behavior_based_only'],
  requireBehaviorBased: true,
};