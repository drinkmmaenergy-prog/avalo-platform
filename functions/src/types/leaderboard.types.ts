/**
 * PACK 216: Creator Competition Engine
 * TypeScript type definitions for leaderboard system
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// COMPETITION CATEGORIES
// ============================================================================

export type CompetitionCategory =
  | 'TOP_ATTRACTION_STARS'     // Most desired profiles (likes + wishlist + match probability)
  | 'TOP_EARNERS'              // Highest token income (65% kept / 35% Avalo)
  | 'TOP_CHARISMA'             // Best vibe after meetings (ratings × completion ratio)
  | 'TOP_CONVERSATION_ENERGY'  // Best chat flow (long messages + consistency)
  | 'TOP_DISCOVERIES'          // Fastest rising new profiles (first 30 days)
  | 'TOP_POPULAR_IN_CITY'      // Location popularity (region-specific)
  | 'TOP_SAFE_DATES';          // Safest & positive meetings (compliance + safety score)

// ============================================================================
// RANKING PERIODS
// ============================================================================

export type RankingPeriod = 'WEEKLY' | 'MONTHLY';

// ============================================================================
// VISIBILITY REWARD TYPES
// ============================================================================

export type VisibilityRewardType =
  | 'DISCOVERY_SPOTLIGHT'      // 24h - 72h spotlight
  | 'REGION_PRIORITY_BOOST'    // Up to 7 days regional boost
  | 'TOP_BADGE'                // 14 days category-specific badge
  | 'PROFILE_RIBBON'           // 7 days "🔥Trending Now" ribbon
  | 'FAN_ZONE_AUDIENCE_BOOSTER'; // 72h audience boost

// ============================================================================
// REWARD DURATIONS (in hours)
// ============================================================================

export const REWARD_DURATIONS: Record<VisibilityRewardType, number> = {
  DISCOVERY_SPOTLIGHT: 72,       // 24h - 72h (configurable)
  REGION_PRIORITY_BOOST: 168,    // 7 days
  TOP_BADGE: 336,                // 14 days
  PROFILE_RIBBON: 168,           // 7 days
  FAN_ZONE_AUDIENCE_BOOSTER: 72, // 72h
};

// ============================================================================
// LEADERBOARD RANKING
// ============================================================================

export interface LeaderboardRanking {
  rankingId: string;             // Format: {category}_{period}_{region}_{gender}_{userId}
  userId: string;
  category: CompetitionCategory;
  period: RankingPeriod;
  weekNumber?: number;           // ISO week number (for WEEKLY)
  month?: number;                // 1-12 (for MONTHLY)
  year: number;
  region: string;                // e.g., "US_CA", "EU_UK", "GLOBAL"
  gender: 'male' | 'female' | 'other' | 'all';
  
  // Ranking details
  rank: number;                  // 1, 2, 3, ...
  metricValue: number;           // Raw metric value for this category
  previousRank: number | null;   // Previous period's rank (null if first time)
  rankChange: number;            // Change from previous rank (positive = improved)
  
  // User context
  userName: string;
  userProfilePicture: string;
  userBadges: string[];          // User's existing badges
  
  // Metadata
  isActive: boolean;             // Still within active period
  expiresAt: Timestamp;          // When ranking expires
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// LEADERBOARD STATISTICS
// ============================================================================

export interface LeaderboardStats {
  statId: string;                // Format: {category}_{period}_{region}
  category: CompetitionCategory;
  period: RankingPeriod;
  weekNumber?: number;
  month?: number;
  year: number;
  region: string;
  
  // Statistics
  totalParticipants: number;     // Total users in this category
  averageMetricValue: number;    // Average metric value
  medianMetricValue: number;     // Median metric value
  topThreshold: number;          // Minimum value to reach top 10
  
  // Distribution
  distribution: {
    top10Count: number;
    top25Count: number;
    top50Count: number;
    top100Count: number;
  };
  
  // Metadata
  computedAt: Timestamp;
  periodStartDate: Timestamp;
  periodEndDate: Timestamp;
}

// ============================================================================
// USER LEADERBOARD HISTORY
// ============================================================================

export interface LeaderboardHistory {
  historyId: string;             // Format: {category}_{period}_{timestamp}
  userId: string;
  category: CompetitionCategory;
  period: RankingPeriod;
  
  // Historical ranking
  rank: number;
  metricValue: number;
  totalParticipants: number;
  
  // Period details
  weekNumber?: number;
  month?: number;
  year: number;
  periodStartedAt: Timestamp;
  periodEndedAt: Timestamp;
  
  // Rewards earned
  rewardsEarned: {
    type: VisibilityRewardType;
    earnedAt: Timestamp;
  }[];
  
  createdAt: Timestamp;
}

// ============================================================================
// VISIBILITY REWARD
// ============================================================================

export interface VisibilityReward {
  rewardId: string;              // Format: {userId}_{rewardType}_{timestamp}
  userId: string;
  rewardType: VisibilityRewardType;
  category: CompetitionCategory;  // Which category earned this reward
  
  // Reward details
  rank: number;                  // Rank that earned this reward
  durationHours: number;         // How long the reward lasts
  
  // Status
  isActive: boolean;
  activatedAt: Timestamp;
  expiresAt: Timestamp;
  
  // Metadata
  region: string;
  period: RankingPeriod;
  weekNumber?: number;
  month?: number;
  year: number;
  
  createdAt: Timestamp;
  deactivatedAt?: Timestamp;
}

// ============================================================================
// LEADERBOARD BADGE
// ============================================================================

export interface LeaderboardBadge {
  badgeId: string;               // Format: {userId}_{category}
  userId: string;
  category: CompetitionCategory;
  
  // Badge details
  badgeLabel: string;            // e.g., "🏆 Top Earner", "⭐ Rising Star"
  badgeColor: string;            // Hex color for badge
  rank: number;                  // Rank that earned this badge
  
  // Status
  isActive: boolean;
  activatedAt: Timestamp;
  expiresAt: Timestamp;          // Usually 14 days
  
  // Period info
  period: RankingPeriod;
  weekNumber?: number;
  month?: number;
  year: number;
  
  createdAt: Timestamp;
  deactivatedAt?: Timestamp;
}

// ============================================================================
// WEEKLY METRICS
// ============================================================================

export interface WeeklyMetrics {
  metricId: string;              // Format: {userId}_{weekStartDate}_{category}
  userId: string;
  category: CompetitionCategory;
  
  // Time period
  weekStartDate: Timestamp;      // Monday 00:00 UTC
  weekEndDate: Timestamp;        // Sunday 23:59 UTC
  weekNumber: number;            // ISO week number
  year: number;
  
  // Metric values by category
  metricValue: number;           // Computed metric for this category
  metricComponents: Record<string, number>; // Breakdown of how metric was calculated
  
  // Context
  region: string;
  gender: 'male' | 'female' | 'other';
  
  // Metadata
  computedAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// MONTHLY SUMMARY
// ============================================================================

export interface MonthlySummary {
  summaryId: string;             // Format: {year}_{month}_{category}
  year: number;
  month: number;                 // 1-12
  category: CompetitionCategory;
  
  // Top performers
  topPerformers: {
    rank: number;
    userId: string;
    userName: string;
    metricValue: number;
    region: string;
  }[];
  
  // Statistics
  totalParticipants: number;
  averageMetricValue: number;
  highestMetricValue: number;
  
  // Trends
  monthOverMonthGrowth: number;  // Percentage growth in participation
  regionBreakdown: Record<string, number>; // Participants by region
  
  // Metadata
  publishedAt: Timestamp;
  periodStartDate: Timestamp;
  periodEndDate: Timestamp;
}

// ============================================================================
// COMPETITION CATEGORY METADATA
// ============================================================================

export interface CompetitionCategoryMeta {
  categoryId: CompetitionCategory;
  displayName: string;           // e.g., "Top Attraction Stars"
  description: string;           // What this category measures
  icon: string;                  // Emoji or icon identifier
  
  // Metric calculation
  metricFormula: string;         // Human-readable formula
  weight: number;                // Relative importance (1-10)
  
  // Eligibility
  minAccountAgeDays: number;     // Minimum account age to participate
  requiresCreatorStatus: boolean; // Must be creator/earner to participate
  
  // Reward tiers
  rewardTiers: {
    ranks: number[];             // e.g., [1, 2, 3] for top 3
    rewardTypes: VisibilityRewardType[];
  }[];
  
  // Status
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// USER COMPETITION SETTINGS
// ============================================================================

export interface UserCompetitionSettings {
  userId: string;
  
  // Opt-out preferences
  optedOut: boolean;             // Completely opt out of leaderboards
  hiddenCategories: CompetitionCategory[]; // Categories to hide from
  
  // Notification preferences
  notifyOnRankChange: boolean;
  notifyOnRewardEarned: boolean;
  notifyOnWeeklyReset: boolean;
  notifyOnMonthlySummary: boolean;
  
  // Display preferences
  showBadgesOnProfile: boolean;
  showRankOnProfile: boolean;
  
  updatedAt: Timestamp;
}

// ============================================================================
// REGIONAL LEADERBOARD
// ============================================================================

export interface RegionalLeaderboard {
  leaderboardId: string;         // Format: {region}_{category}_{period}
  region: string;                // e.g., "US_CA", "EU_UK"
  category: CompetitionCategory;
  period: RankingPeriod;
  
  // Rankings
  rankings: {
    rank: number;
    userId: string;
    userName: string;
    metricValue: number;
  }[];
  
  // Metadata
  totalParticipants: number;
  weekNumber?: number;
  month?: number;
  year: number;
  computedAt: Timestamp;
  expiresAt: Timestamp;
}

// ============================================================================
// LEADERBOARD NOTIFICATION
// ============================================================================

export interface LeaderboardNotification {
  notificationId: string;
  userId: string;
  
  // Notification type (ego-safe, positive only)
  type: 'RISING_FAST' | 'TRENDING_IN_CITY' | 'USERS_LOVE_ENERGY' | 'REWARD_EARNED' | 'BADGE_EARNED';
  
  // Content
  title: string;                 // e.g., "You're rising fast!"
  message: string;               // Positive, encouraging message
  
  // Context
  category?: CompetitionCategory;
  rank?: number;
  rewardType?: VisibilityRewardType;
  
  // Status
  read: boolean;
  readAt?: Timestamp;
  
  createdAt: Timestamp;
}

// ============================================================================
// METRIC CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate Top Attraction Stars metric
 * Formula: (likes × 1.0) + (wishlist × 2.0) + (matchProbability × 3.0)
 */
export interface AttractionStarsMetric {
  likesReceived: number;
  wishlistAdds: number;
  matchProbability: number;      // 0.0 - 1.0
  totalScore: number;
}

/**
 * Calculate Top Earners metric
 * Formula: totalTokensEarned (65% kept by creator)
 */
export interface EarnersMetric {
  totalTokensEarned: number;     // Only the 65% kept by creator
  transactionCount: number;
}

/**
 * Calculate Top Charisma metric
 * Formula: (averageVibeRating × meetingCompletionRatio) × 100
 */
export interface CharismaMetric {
  averageVibeRating: number;     // 1.0 - 5.0
  meetingCompletionRatio: number; // 0.0 - 1.0
  totalMeetings: number;
  totalScore: number;
}

/**
 * Calculate Top Conversation Energy metric
 * Formula: (longMessageCount × 2.0) + (responseConsistency × 3.0)
 */
export interface ConversationEnergyMetric {
  longMessageCount: number;      // Messages > 50 words
  responseConsistency: number;   // 0.0 - 1.0 (response time & frequency)
  averageResponseTime: number;   // In minutes
  totalScore: number;
}

/**
 * Calculate Top Discoveries metric (first 30 days only)
 * Formula: (profileViews × 1.0) + (matches × 3.0) + (engagement × 5.0)
 */
export interface DiscoveriesMetric {
  profileViews: number;
  matchCount: number;
  engagementScore: number;       // Composite of likes, messages, etc.
  accountAgeDays: number;        // Must be ≤ 30
  totalScore: number;
}

/**
 * Calculate Top Popular in City metric
 * Formula: regionSpecificLikes + regionSpecificMatches + localActivity
 */
export interface PopularInCityMetric {
  regionLikes: number;
  regionMatches: number;
  localActivity: number;         // Check-ins, events, etc.
  totalScore: number;
}

/**
 * Calculate Top Safe Dates metric
 * Formula: (safetyComplianceScore × 0.4) + (positiveFeedbackRatio × 0.6)
 */
export interface SafeDatesMetric {
  safetyComplianceScore: number; // 0.0 - 1.0
  positiveFeedbackRatio: number; // 0.0 - 1.0
  totalMeetings: number;
  totalScore: number;
}