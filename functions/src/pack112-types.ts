/**
 * PACK 112 — Awards, Gamification & Achievements Types
 * 
 * Type definitions for:
 * - Achievement system (badges, milestones, progress)
 * - User achievement progress
 * - XP/Level system (cosmetic only)
 * - Achievement notifications
 * 
 * NON-NEGOTIABLE RULES:
 * - NO token rewards of any kind
 * - NO boost to visibility or ranking from achievements
 * - NO monetization multipliers or earnings accelerators
 * - Token price and 65/35 split remain untouched
 * - Achievements & badges are cosmetic/status only
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// ACHIEVEMENT CATEGORIES
// ============================================================================

/**
 * Achievement category types
 */
export type AchievementCategory =
  | 'PROFILE'        // Profile completion, verification
  | 'ACTIVITY'       // Login streaks, consistency
  | 'CONTENT'        // Stories published, content created
  | 'COMMUNITY'      // Helpful behavior, reports
  | 'SAFETY'         // Safety participation, compliance
  | 'MILESTONE';     // General platform milestones

/**
 * Achievement tier levels
 */
export type AchievementTier =
  | 'BRONZE'
  | 'SILVER'
  | 'GOLD'
  | 'PLATINUM'
  | 'DIAMOND';

/**
 * Achievement milestone type
 */
export type AchievementMilestoneType =
  | 'ONCE'           // One-time achievement
  | 'PROGRESSIVE'    // Progress-based (e.g., 10, 50, 100)
  | 'STREAK';        // Streak-based (daily, weekly)

// ============================================================================
// ACHIEVEMENT CATALOG
// ============================================================================

/**
 * Achievement definition in catalog
 * Stored in achievements_catalog collection
 */
export interface AchievementDefinition {
  /** Unique achievement ID */
  id: string;
  
  /** Display title */
  title: string;
  
  /** Description text */
  description: string;
  
  /** Icon asset key */
  iconKey: string;
  
  /** Category */
  category: AchievementCategory;
  
  /** Tier level */
  tier: AchievementTier;
  
  /** Milestone type */
  milestoneType: AchievementMilestoneType;
  
  /** Required value to unlock (if progressive) */
  threshold?: number;
  
  /** Whether achievement is currently active */
  enabled: boolean;
  
  /** Sort order */
  sortOrder: number;
  
  /** Created timestamp */
  createdAt: Timestamp;
  
  /** Updated timestamp */
  updatedAt: Timestamp;
}

// ============================================================================
// USER ACHIEVEMENT PROGRESS
// ============================================================================

/**
 * User's achievement progress and unlocked achievements
 * Stored in user_achievements/{userId}
 */
export interface UserAchievements {
  /** User ID */
  userId: string;
  
  /** List of fully achieved achievement IDs */
  achievedIds: string[];
  
  /** Progress towards achievements { [achievementId]: currentValue } */
  progress: Record<string, number>;
  
  /** Active streaks { [achievementId]: currentStreakDays } */
  streaks: Record<string, number>;
  
  /** Selected badges to display on profile (max 3) */
  selectedBadges: string[];
  
  /** Cosmetic XP (non-economic) */
  xp: number;
  
  /** Cosmetic level (non-economic) */
  level: number;
  
  /** Last activity date for streak tracking */
  lastActivityDate?: Timestamp;
  
  /** Created timestamp */
  createdAt: Timestamp;
  
  /** Updated timestamp */
  updatedAt: Timestamp;
}

// ============================================================================
// XP & LEVEL SYSTEM (COSMETIC ONLY)
// ============================================================================

/**
 * XP Level configuration
 */
export interface XPLevel {
  /** Level number */
  level: number;
  
  /** XP required to reach this level */
  xpRequired: number;
  
  /** Display name */
  name: string;
  
  /** Level color theme */
  color: string;
}

/**
 * XP earning configuration (cosmetic only)
 */
export const XP_EARNING_CONFIG = {
  /** XP for profile completion */
  PROFILE_COMPLETE: 100,
  
  /** XP for daily login */
  DAILY_LOGIN: 10,
  
  /** XP for first story published */
  FIRST_STORY: 50,
  
  /** XP for helpful community action */
  HELPFUL_ACTION: 25,
  
  /** XP for safety participation */
  SAFETY_PARTICIPATION: 30,
  
  /** XP for achieving milestones */
  MILESTONE_ACHIEVED: 50,
} as const;

/**
 * Level progression (cosmetic only)
 */
export const LEVEL_PROGRESSION: XPLevel[] = [
  { level: 1, xpRequired: 0, name: 'Newcomer', color: '#9CA3AF' },
  { level: 2, xpRequired: 100, name: 'Explorer', color: '#9CA3AF' },
  { level: 3, xpRequired: 250, name: 'Active', color: '#9CA3AF' },
  { level: 4, xpRequired: 500, name: 'Engaged', color: '#9CA3AF' },
  { level: 5, xpRequired: 1000, name: 'Regular', color: '#CD7F32' },
  { level: 6, xpRequired: 1500, name: 'Contributor', color: '#CD7F32' },
  { level: 7, xpRequired: 2100, name: 'Trusted', color: '#C0C0C0' },
  { level: 8, xpRequired: 2800, name: 'Established', color: '#C0C0C0' },
  { level: 9, xpRequired: 3600, name: 'Champion', color: '#FFD700' },
  { level: 10, xpRequired: 5000, name: 'Legend', color: '#FFD700' },
];

// ============================================================================
// ACHIEVEMENT EVENTS
// ============================================================================

/**
 * Achievement event types (trigger achievement checks)
 */
export type AchievementEventType =
  | 'PROFILE_UPDATED'
  | 'LOGIN'
  | 'STORY_PUBLISHED'
  | 'HELPFUL_REPORT'
  | 'SAFETY_ACTION'
  | 'CONVERSATION_STARTED'
  | 'CONTENT_VERIFIED';

/**
 * Achievement event data
 */
export interface AchievementEvent {
  /** Event type */
  type: AchievementEventType;
  
  /** User ID */
  userId: string;
  
  /** Event metadata */
  metadata?: Record<string, any>;
  
  /** Event timestamp */
  timestamp: Timestamp;
}

// ============================================================================
// ACHIEVEMENT NOTIFICATIONS
// ============================================================================

/**
 * Achievement unlock notification
 */
export interface AchievementUnlockNotification {
  /** Notification ID */
  id: string;
  
  /** User ID */
  userId: string;
  
  /** Achievement ID that was unlocked */
  achievementId: string;
  
  /** Achievement title */
  title: string;
  
  /** Achievement description */
  description: string;
  
  /** Achievement tier */
  tier: AchievementTier;
  
  /** Icon key */
  iconKey: string;
  
  /** XP earned (if any) */
  xpEarned?: number;
  
  /** Whether notification was read */
  read: boolean;
  
  /** Created timestamp */
  createdAt: Timestamp;
}

// ============================================================================
// PROFILE DISPLAY
// ============================================================================

/**
 * Badge display configuration
 */
export interface BadgeDisplayConfig {
  /** Achievement ID */
  achievementId: string;
  
  /** Display title */
  title: string;
  
  /** Icon key */
  iconKey: string;
  
  /** Tier level */
  tier: AchievementTier;
  
  /** Display order */
  order: number;
}

/**
 * Profile achievement display settings
 */
export interface ProfileAchievementSettings {
  /** Whether to show achievements on profile */
  showAchievements: boolean;
  
  /** Selected badge IDs (max 3) */
  selectedBadges: string[];
  
  /** Whether to show level/XP */
  showLevel: boolean;
}

// ============================================================================
// SAFE ACHIEVEMENT DEFINITIONS
// ============================================================================

/**
 * Predefined safe achievements that comply with non-economic rules
 */
export const SAFE_ACHIEVEMENTS: Omit<AchievementDefinition, 'createdAt' | 'updatedAt'>[] = [
  // PROFILE Category
  {
    id: 'profile_complete_100',
    title: 'Profile Completed',
    description: 'Complete your profile 100%',
    iconKey: 'achievement_profile_complete',
    category: 'PROFILE',
    tier: 'BRONZE',
    milestoneType: 'ONCE',
    threshold: 100,
    enabled: true,
    sortOrder: 1,
  },
  {
    id: 'profile_verified',
    title: 'Verified Member',
    description: 'Complete profile verification',
    iconKey: 'achievement_verified',
    category: 'PROFILE',
    tier: 'SILVER',
    milestoneType: 'ONCE',
    enabled: true,
    sortOrder: 2,
  },
  
  // ACTIVITY Category
  {
    id: 'streak_7_days',
    title: '7 Day Streak',
    description: 'Active for 7 days in a row',
    iconKey: 'achievement_streak_7',
    category: 'ACTIVITY',
    tier: 'BRONZE',
    milestoneType: 'STREAK',
    threshold: 7,
    enabled: true,
    sortOrder: 10,
  },
  {
    id: 'streak_30_days',
    title: '30 Day Streak',
    description: 'Active for 30 days in a row',
    iconKey: 'achievement_streak_30',
    category: 'ACTIVITY',
    tier: 'GOLD',
    milestoneType: 'STREAK',
    threshold: 30,
    enabled: true,
    sortOrder: 11,
  },
  {
    id: 'streak_100_days',
    title: '100 Day Streak',
    description: 'Active for 100 days in a row',
    iconKey: 'achievement_streak_100',
    category: 'ACTIVITY',
    tier: 'DIAMOND',
    milestoneType: 'STREAK',
    threshold: 100,
    enabled: true,
    sortOrder: 12,
  },
  
  // CONTENT Category
  {
    id: 'first_story',
    title: 'First Story',
    description: 'Publish your first story',
    iconKey: 'achievement_first_story',
    category: 'CONTENT',
    tier: 'BRONZE',
    milestoneType: 'ONCE',
    threshold: 1,
    enabled: true,
    sortOrder: 20,
  },
  {
    id: 'stories_10',
    title: 'Storyteller',
    description: 'Publish 10 stories',
    iconKey: 'achievement_stories_10',
    category: 'CONTENT',
    tier: 'SILVER',
    milestoneType: 'PROGRESSIVE',
    threshold: 10,
    enabled: true,
    sortOrder: 21,
  },
  {
    id: 'stories_50',
    title: 'Content Creator',
    description: 'Publish 50 stories',
    iconKey: 'achievement_stories_50',
    category: 'CONTENT',
    tier: 'GOLD',
    milestoneType: 'PROGRESSIVE',
    threshold: 50,
    enabled: true,
    sortOrder: 22,
  },
  
  // COMMUNITY Category
  {
    id: 'helpful_conversation_5',
    title: 'Friendly',
    description: '5 polite conversations',
    iconKey: 'achievement_friendly',
    category: 'COMMUNITY',
    tier: 'BRONZE',
    milestoneType: 'PROGRESSIVE',
    threshold: 5,
    enabled: true,
    sortOrder: 30,
  },
  {
    id: 'helpful_report_first',
    title: 'Community Guardian',
    description: 'First report of harmful content',
    iconKey: 'achievement_guardian',
    category: 'COMMUNITY',
    tier: 'SILVER',
    milestoneType: 'ONCE',
    threshold: 1,
    enabled: true,
    sortOrder: 31,
  },
  
  // SAFETY Category
  {
    id: 'safety_education_complete',
    title: 'Safety Aware',
    description: 'Complete safety education',
    iconKey: 'achievement_safety_aware',
    category: 'SAFETY',
    tier: 'BRONZE',
    milestoneType: 'ONCE',
    enabled: true,
    sortOrder: 40,
  },
  {
    id: 'safety_timer_used_first',
    title: 'Safety First',
    description: 'Use safety timer for the first time',
    iconKey: 'achievement_safety_first',
    category: 'SAFETY',
    tier: 'SILVER',
    milestoneType: 'ONCE',
    threshold: 1,
    enabled: true,
    sortOrder: 41,
  },
  
  // MILESTONE Category
  {
    id: 'joined_community',
    title: 'Welcome!',
    description: 'Join the Avalo community',
    iconKey: 'achievement_welcome',
    category: 'MILESTONE',
    tier: 'BRONZE',
    milestoneType: 'ONCE',
    enabled: true,
    sortOrder: 50,
  },
];

// ============================================================================
// FORBIDDEN ACHIEVEMENTS (EXAMPLES - NEVER IMPLEMENT)
// ============================================================================

/**
 * Examples of FORBIDDEN achievement types
 * These should NEVER be implemented
 */
export const FORBIDDEN_ACHIEVEMENT_EXAMPLES = [
  'Top Earner',
  'Most Token Sales',
  'Big Spender',
  'Highest Payer',
  'Rich Club Member',
  'Earnings Milestone',
  'Purchase Milestone',
  'VIP Spender',
] as const;

// ============================================================================
// ERROR CODES
// ============================================================================

export type Pack112ErrorCode =
  | 'ACHIEVEMENT_NOT_FOUND'
  | 'ACHIEVEMENT_ALREADY_UNLOCKED'
  | 'INVALID_BADGE_SELECTION'
  | 'TOO_MANY_BADGES_SELECTED'
  | 'ACHIEVEMENT_DISABLED'
  | 'INSUFFICIENT_PROGRESS';

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to select profile badges
 */
export interface SelectBadgesRequest {
  /** User ID */
  userId: string;
  
  /** Badge IDs to display (max 3) */
  badgeIds: string[];
}

/**
 * Response with user achievements
 */
export interface GetUserAchievementsResponse {
  /** User achievement data */
  achievements: UserAchievements;
  
  /** Available achievements */
  catalog: AchievementDefinition[];
  
  /** Current XP and level info */
  xpInfo: {
    currentXp: number;
    currentLevel: number;
    levelName: string;
    nextLevelXp: number;
    progress: number; // Percentage to next level
  };
}

/**
 * Achievement celebration data
 */
export interface AchievementCelebration {
  /** Achievement that was unlocked */
  achievement: AchievementDefinition;
  
  /** XP earned */
  xpEarned: number;
  
  /** New level (if leveled up) */
  newLevel?: number;
  
  /** Level name */
  levelName?: string;
}