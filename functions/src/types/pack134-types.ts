/**
 * PACK 134 — Avalo Recommendation & Personalization Engine
 * 
 * Zero Pay-to-Win · Zero Beauty Bias · Zero Exploitation
 * Interest-Based · Time-Aware · Safety-First
 * 
 * NON-NEGOTIABLE RULES:
 * - NO monetization signals in ranking (no token spending/earning influence)
 * - NO appearance/beauty/attractiveness scoring
 * - NO demographic/race/gender bias
 * - NO NSFW boost in ranking
 * - NO exploitation of vulnerable users
 * - Uses ONLY behavioral and category-based signals
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// INTEREST GRAPH TYPES
// ============================================================================

/**
 * Interest categories tracked for users
 * Based on content interaction, NOT appearance or demographics
 */
export type InterestCategory =
  | 'fitness'
  | 'travel'
  | 'self_improvement'
  | 'entertainment'
  | 'photography'
  | 'gaming'
  | 'art_creative'
  | 'music'
  | 'food_cooking'
  | 'fashion_style'
  | 'technology'
  | 'education'
  | 'business'
  | 'lifestyle'
  | 'health_wellness'
  | 'sports'
  | 'books_reading'
  | 'movies_tv'
  | 'nature_outdoors'
  | 'pets_animals';

/**
 * User's interest vector (dynamic and behavior-based)
 * Scores range from 0.0 (no interest) to 1.0 (strong interest)
 */
export interface UserInterestVector {
  userId: string;
  interests: Partial<Record<InterestCategory, number>>;
  updatedAt: Timestamp;
  dataPoints: number; // Number of interactions used to compute
  confidenceScore: number; // 0-1, based on data volume
  lastInteractionAt: Timestamp;
}

/**
 * How an interest score is updated
 */
export interface InterestUpdateSignal {
  userId: string;
  category: InterestCategory;
  signalType: 'VIEW' | 'LIKE' | 'FOLLOW' | 'INTERACTION' | 'CONTENT_CLICK';
  weight: number; // Signal strength (0.1-1.0)
  timestamp: Timestamp;
  contentId?: string;
  duration?: number; // For view signals
}

// ============================================================================
// TIME-OF-DAY PERSONALIZATION
// ============================================================================

/**
 * Content preferences by time of day
 */
export interface TimeOfDayPreferences {
  userId: string;
  hourlyPatterns: HourlyPattern[];
  weekdayPatterns: DayPattern[];
  confidenceScore: number;
  dataPoints: number;
  updatedAt: Timestamp;
}

export interface HourlyPattern {
  hour: number; // 0-23
  preferredCategories: InterestCategory[];
  avgEngagement: number;
  sessionCount: number;
}

export interface DayPattern {
  day: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
  preferredCategories: InterestCategory[];
  avgEngagement: number;
  sessionCount: number;
}

// ============================================================================
// CONTENT CATEGORIZATION
// ============================================================================

/**
 * Content category assignment (for creators and posts)
 * Based on content analysis, NOT creator appearance
 */
export interface ContentCategoryProfile {
  targetId: string; // userId or postId
  targetType: 'CREATOR' | 'POST' | 'STORY' | 'REEL';
  primaryCategory: InterestCategory;
  secondaryCategories: InterestCategory[];
  confidence: number;
  assignedAt: Timestamp;
  basedOnSignals: string[]; // What signals were used
}

// ============================================================================
// PERSONALIZED FEED
// ============================================================================

/**
 * Personalized feed request
 */
export interface PersonalizedFeedRequest {
  userId: string;
  feedType: 'HOME' | 'DISCOVER' | 'STORIES' | 'REELS';
  limit: number;
  cursor?: string;
  filters?: FeedFilters;
}

export interface FeedFilters {
  categories?: InterestCategory[];
  excludeCategories?: InterestCategory[];
  timeWindow?: 'RECENT' | 'TODAY' | 'WEEK' | 'MONTH';
  contentTypes?: ('POST' | 'STORY' | 'REEL')[];
}

/**
 * Personalized feed item with explanation
 */
export interface PersonalizedFeedItem {
  contentId: string;
  contentType: 'POST' | 'STORY' | 'REEL';
  creatorId: string;
  creatorName: string;
  creatorPhotoUrl?: string;
  categories: InterestCategory[];
  relevanceScore: number;
  reasonId: string; // For "Why am I seeing this?"
  timestamp: Timestamp;
}

export interface PersonalizedFeedResponse {
  items: PersonalizedFeedItem[];
  cursor?: string;
  hasMore: boolean;
  generatedAt: Timestamp;
  personalizationApplied: boolean;
}

// ============================================================================
// RECOMMENDATION REASONING
// ============================================================================

/**
 * Explanation for why content was recommended
 * Shown to users for transparency
 */
export interface RecommendationReason {
  reasonId: string;
  contentId: string;
  userId: string;
  primaryReason: RecommendationReasonType;
  explanation: string; // User-friendly explanation
  factors: RecommendationFactor[];
  createdAt: Timestamp;
}

export type RecommendationReasonType =
  | 'INTEREST_MATCH' // "You often view fitness posts"
  | 'CATEGORY_FOLLOW' // "You follow photographers"
  | 'TIME_PATTERN' // "You prefer evening reels"
  | 'LANGUAGE_MATCH' // "Posts in your language"
  | 'TOPIC_FOLLOW' // "You follow this topic"
  | 'SIMILAR_INTERACTION' // "Similar to content you liked"
  | 'NEW_CREATOR_BOOST' // "New creator in your interests"
  | 'TRENDING_CATEGORY'; // "Popular in categories you like"

export interface RecommendationFactor {
  factorType: string;
  value: number;
  description: string;
}

// ============================================================================
// FAIRNESS & DIVERSITY
// ============================================================================

/**
 * New creator boost configuration
 * Ensures new creators get equal discovery chances
 */
export interface NewCreatorBoostProfile {
  creatorId: string;
  accountAge: number; // Days since creation
  followerCount: number;
  engagementRate: number;
  positiveRatio: number; // Positive interactions / total
  boostMultiplier: number; // 1.0-3.0x
  boostExpiresAt: Timestamp;
  eligibleForBoost: boolean;
  categories: InterestCategory[];
}

/**
 * Diversity injection rules
 * Prevents filter bubbles and echo chambers
 */
export interface DiversityConfig {
  minNewCreatorRatio: number; // 0.15 = 15% new creators
  maxSameCategoryStreak: number; // Max same category in row
  diversityBoostEnabled: boolean;
  explorationRate: number; // 0-1, how much to explore
}

// ============================================================================
// SAFETY INTEGRATION
// ============================================================================

/**
 * Safety-aware recommendation filtering
 * Integrates with PACK 126 Safety Framework
 */
export interface SafetyFilterContext {
  userId: string;
  userAge?: number;
  userRegion: string;
  contentRatingAllowed: string[];
  blockedCreators: string[];
  mutedCategories: InterestCategory[];
  sensitiveContentPref: 'NONE' | 'BLUR' | 'HIDE';
  traumaAwareMode: boolean;
}

/**
 * Anti-exploitation validation
 * Prevents suggesting risky creators to vulnerable users
 */
export interface ExploitationCheckResult {
  allowed: boolean;
  concerns: ExploitationConcern[];
  requiresWarning: boolean;
  autoBlock: boolean;
}

export type ExploitationConcern =
  | 'HIGH_RISK_TO_VULNERABLE' // Risky creator suggested to vulnerable user
  | 'NSFW_TO_MINOR' // NSFW content to underage user
  | 'INTENSE_PERSONALITY_TO_LONELY' // Addictive patterns
  | 'TRAUMA_TRIGGER'; // Known trauma triggers

// ============================================================================
// ANALYTICS & EVENTS
// ============================================================================

/**
 * Recommendation event for analytics
 * Used to improve recommendations over time
 */
export interface RecommendationEvent {
  eventId: string;
  userId: string;
  contentId: string;
  contentType: string;
  creatorId: string;
  eventType: RecommendationEventType;
  reasonId?: string;
  interactionDuration?: number;
  categories: InterestCategory[];
  timestamp: Timestamp;
}

export type RecommendationEventType =
  | 'IMPRESSION' // Content shown
  | 'VIEW' // Content viewed
  | 'LIKE' // Content liked
  | 'SHARE' // Content shared
  | 'SKIP' // Content skipped
  | 'HIDE' // Content hidden
  | 'REPORT' // Content reported
  | 'PROFILE_VISIT'; // Creator profile visited

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Recommendation engine configuration
 */
export interface RecommendationConfig {
  // Interest Graph
  interestDecayRate: number; // How fast interests decay without interaction
  minDataPointsForConfidence: number; // Min interactions for confident interests
  maxInterestCategories: number; // Max categories to track per user
  
  // Time-of-Day
  timeOfDayEnabled: boolean;
  minSessionsForTimePattern: number;
  timePatternConfidenceThreshold: number;
  
  // Fairness
  newCreatorBoostEnabled: boolean;
  newCreatorDefinitionDays: number; // Days to be considered "new"
  minNewCreatorRatio: number;
  
  // Diversity
  diversityInjectionEnabled: boolean;
  explorationRate: number;
  maxSameCategoryStreak: number;
  
  // Safety
  safetyFiltersEnabled: boolean;
  traumaAwareModeStrict: boolean;
  exploitationChecksEnabled: boolean;
  
  // Performance
  maxCandidates: number; // Max content items to consider
  personalizationCacheSeconds: number;
  
  // Feature Flags
  personalizeDiscovery: boolean;
  personalizeHome: boolean;
  personalizeStories: boolean;
  personalizeReels: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_RECOMMENDATION_CONFIG: RecommendationConfig = {
  // Interest Graph
  interestDecayRate: 0.05, // 5% decay per day without interaction
  minDataPointsForConfidence: 10,
  maxInterestCategories: 10,
  
  // Time-of-Day
  timeOfDayEnabled: true,
  minSessionsForTimePattern: 5,
  timePatternConfidenceThreshold: 0.6,
  
  // Fairness
  newCreatorBoostEnabled: true,
  newCreatorDefinitionDays: 90, // 3 months
  minNewCreatorRatio: 0.15, // 15% new creators
  
  // Diversity
  diversityInjectionEnabled: true,
  explorationRate: 0.2, // 20% exploration
  maxSameCategoryStreak: 3,
  
  // Safety
  safetyFiltersEnabled: true,
  traumaAwareModeStrict: true,
  exploitationChecksEnabled: true,
  
  // Performance
  maxCandidates: 500,
  personalizationCacheSeconds: 300, // 5 minutes
  
  // Feature Flags
  personalizeDiscovery: true,
  personalizeHome: true,
  personalizeStories: true,
  personalizeReels: true,
};

// ============================================================================
// PERSONALIZATION TRANSPARENCY
// ============================================================================

/**
 * User personalization settings
 * Users can control personalization level
 */
export interface UserPersonalizationSettings {
  userId: string;
  personalizationLevel: 'FULL' | 'MODERATE' | 'MINIMAL' | 'OFF';
  allowTimeOfDay: boolean;
  allowInterestTracking: boolean;
  allowBehaviorAnalysis: boolean;
  dataRetentionDays: number; // How long to keep interaction history
  updatedAt: Timestamp;
}

/**
 * Personalization transparency dashboard
 * Shows user their tracked interests and data
 */
export interface PersonalizationDashboard {
  userId: string;
  topInterests: Array<{ category: InterestCategory; score: number }>;
  timeOfDayPattern: string; // e.g., "You're most active in evenings"
  dataPointsUsed: number;
  lastUpdated: Timestamp;
  dataRetentionInfo: string;
  optOutAvailable: boolean;
}

// ============================================================================
// VALIDATION & COMPLIANCE
// ============================================================================

/**
 * Validation result for recommendation ethics
 */
export interface EthicsValidationResult {
  valid: boolean;
  violations: EthicsViolation[];
  warnings: string[];
  requiresReview: boolean;
}

export interface EthicsViolation {
  type: EthicsViolationType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  affectedData: string;
}

export type EthicsViolationType =
  | 'APPEARANCE_BIAS_DETECTED' // Ranking based on appearance
  | 'MONETIZATION_BIAS_DETECTED' // Ranking based on earnings
  | 'DEMOGRAPHIC_BIAS_DETECTED' // Ranking based on demographics
  | 'PAY_TO_WIN_DETECTED' // Paid visibility boost
  | 'EXPLOITATION_RISK' // Vulnerable user targeting
  | 'NSFW_BOOST_DETECTED' // NSFW getting ranking advantage
  | 'BEAUTY_SCORE_USED'; // Beauty/attractiveness in algorithm

/**
 * Forbidden signals that must NEVER be used in recommendations
 */
export const FORBIDDEN_SIGNALS = [
  'tokenSpending',
  'tokenEarnings',
  'creatorIncome',
  'vipStatus',
  'royalSubscription',
  'adCampaignBudget',
  'attractivenessScore',
  'beautyRating',
  'faceAnalysis',
  'bodyTypeScore',
  'sexualOrientation',
  'race',
  'ethnicity',
  'gender',
  'age',
  'socioeconomicStatus',
  'privacyMessages',
  'dmContent',
] as const;

export type ForbiddenSignal = typeof FORBIDDEN_SIGNALS[number];