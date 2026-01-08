/**
 * PACK 137: Avalo Global Community Challenges
 * Type definitions for skill-based, fitness, lifestyle, and entertainment challenges
 * 
 * NON-NEGOTIABLES:
 * - No beauty/body/appearance competitions
 * - No dating/romance/NSFW themes
 * - No token bonuses or free rewards
 * - No visibility/discovery boosts
 * - 100% consistency-based leaderboards (not popularity)
 * - 65/35 split remains unchanged for paid challenges
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================
// ENUMS
// ============================================

/**
 * Challenge categories (APPROVED ONLY)
 */
export enum ChallengeCategory {
  FITNESS = 'FITNESS',
  LIFESTYLE = 'LIFESTYLE',
  EDUCATION = 'EDUCATION',
  CREATIVE = 'CREATIVE',
  ENTERTAINMENT = 'ENTERTAINMENT',
  PRODUCTIVITY = 'PRODUCTIVITY',
  WELLNESS = 'WELLNESS',
}

/**
 * Challenge duration presets
 */
export enum ChallengeDuration {
  ONE_DAY = 'ONE_DAY',           // 1 day
  THREE_DAYS = 'THREE_DAYS',     // 3 days
  ONE_WEEK = 'ONE_WEEK',         // 7 days
  TWO_WEEKS = 'TWO_WEEKS',       // 14 days
  THIRTY_DAYS = 'THIRTY_DAYS',   // 30 days
  SIXTY_DAYS = 'SIXTY_DAYS',     // 60 days
  NINETY_DAYS = 'NINETY_DAYS',   // 90 days
}

/**
 * Challenge status
 */
export enum ChallengeStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * Participant status
 */
export enum ParticipantStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  DROPPED = 'DROPPED',
  REMOVED = 'REMOVED', // Moderation removal
}

/**
 * Task frequency
 */
export enum TaskFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  CUSTOM = 'CUSTOM',
}

/**
 * Post content type (SFW only)
 */
export enum ChallengePostType {
  PROGRESS_PHOTO = 'PROGRESS_PHOTO',
  VIDEO_UPDATE = 'VIDEO_UPDATE',
  TEXT_LOG = 'TEXT_LOG',
  WORKOUT_LOG = 'WORKOUT_LOG',
  READING_LOG = 'READING_LOG',
  CREATIVE_WORK = 'CREATIVE_WORK',
}

// ============================================
// BLOCKED CONTENT
// ============================================

/**
 * Forbidden keywords for NSFW/dating/beauty detection
 */
export const BLOCKED_CHALLENGE_KEYWORDS = [
  // NSFW/explicit
  'sexy', 'seductive', 'lingerie', 'bikini', 'nude', 'naked', 'explicit',
  'nsfw', 'adult', 'xxx', 'porn', 'erotic', 'sensual', 'bedroom',
  
  // Dating/romance
  'dating', 'romance', 'romantic', 'boyfriend', 'girlfriend', 'sugar',
  'date night', 'flirt', 'flirting', 'hookup', 'meet up',
  
  // Beauty/body comparison
  'hottest', 'sexiest', 'most attractive', 'best body', 'best looking',
  'beauty contest', 'face rating', 'body rating', 'appearance',
  'transformation photos', 'before after body',
  
  // Attention farming
  'most popular', 'most followers', 'most likes', 'attention',
  'girlfriend experience', 'boyfriend experience',
  
  // External platforms
  'onlyfans', 'fansly', 'patreon', 'snapchat premium',
];

/**
 * Forbidden categories
 */
export const FORBIDDEN_CATEGORIES = [
  'dating', 'romance', 'beauty', 'appearance', 'attraction',
  'nsfw', 'adult', 'relationship', 'companionship',
];

// ============================================
// INTERFACES
// ============================================

/**
 * Challenge definition
 */
export interface Challenge {
  challengeId: string;
  
  // Creator info
  creatorId: string;
  creatorName: string;
  creatorAvatar?: string;
  
  // Challenge details
  title: string; // 5-100 chars
  description: string; // 20-1000 chars
  category: ChallengeCategory;
  
  // Pricing
  isPaid: boolean;
  entryTokens: number; // 0 for free, 1-5000 for paid
  
  // Duration
  duration: ChallengeDuration;
  durationDays: number;
  startDate: Timestamp;
  endDate: Timestamp;
  
  // Task requirements
  taskTitle: string; // e.g., "Complete 50 push-ups"
  taskDescription: string;
  taskFrequency: TaskFrequency;
  tasksPerDay?: number; // For DAILY frequency
  tasksPerWeek?: number; // For WEEKLY frequency
  
  // Tracking
  requiresPhoto: boolean;
  requiresVideo: boolean;
  requiresTextLog: boolean;
  
  // Participants
  maxParticipants?: number; // Optional cap
  currentParticipants: number;
  
  // Leaderboard
  leaderboardMode: 'COMPLETION_RATE' | 'CONSISTENCY'; // Always consistency-based
  
  // Status & metadata
  status: ChallengeStatus;
  isActive: boolean;
  
  // Moderation flags
  containsNSFW: boolean;
  containsForbiddenContent: boolean;
  moderationNotes?: string;
  
  // Revenue tracking (paid challenges only)
  totalRevenue: number; // Total tokens collected
  platformFee: number; // 35%
  creatorEarnings: number; // 65%
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // Tags for discovery
  tags: string[];
}

/**
 * Challenge participant
 */
export interface ChallengeParticipant {
  participantId: string;
  challengeId: string;
  challengeTitle: string;
  
  // User info
  userId: string;
  userName: string;
  userAvatar?: string;
  
  // Creator info
  creatorId: string;
  
  // Payment (for paid challenges)
  paidTokens: number;
  platformFee: number; // 35%
  creatorEarnings: number; // 65%
  transactionId?: string;
  
  // Progress tracking
  tasksCompleted: number;
  tasksRequired: number;
  completionRate: number; // 0-100
  currentStreak: number;
  longestStreak: number;
  
  // Status
  status: ParticipantStatus;
  isActive: boolean;
  
  // Achievements
  completedAllTasks: boolean;
  earnedBadge: boolean;
  
  // Leaderboard rank (consistency-based only)
  leaderboardRank?: number;
  leaderboardScore: number; // Based on completion rate + streak
  
  // Timestamps
  joinedAt: Timestamp;
  completedAt?: Timestamp;
  lastActivityAt: Timestamp;
}

/**
 * Challenge progress entry
 */
export interface ChallengeProgress {
  progressId: string;
  challengeId: string;
  userId: string;
  participantId: string;
  
  // Task info
  taskDate: Timestamp;
  taskNumber: number; // Which task in sequence
  
  // Submission
  completed: boolean;
  postId?: string; // Link to challenge post
  
  // Metadata
  submittedAt?: Timestamp;
  streakDay: number;
  
  createdAt: Timestamp;
}

/**
 * Challenge post (content inside challenge)
 */
export interface ChallengePost {
  postId: string;
  challengeId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  
  // Content
  type: ChallengePostType;
  caption?: string; // Optional text
  mediaUrl?: string; // Photo or video URL
  
  // Task reference
  taskNumber: number;
  taskDate: Timestamp;
  
  // Engagement (does NOT affect leaderboard)
  likesCount: number;
  commentsCount: number;
  
  // Moderation
  isVisible: boolean;
  moderationReason?: string;
  containsNSFW: boolean;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Challenge badge (earned on completion)
 */
export interface ChallengeBadge {
  badgeId: string;
  userId: string;
  challengeId: string;
  challengeTitle: string;
  category: ChallengeCategory;
  
  // Achievement details
  completionRate: number;
  finalStreak: number;
  tasksCompleted: number;
  
  // Display
  badgeImageUrl?: string;
  displayOnProfile: boolean; // Optional, not profile page visible
  
  earnedAt: Timestamp;
}

/**
 * Leaderboard entry (cached for performance)
 */
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  userAvatar?: string;
  
  // Score calculation (100% consistency-based)
  completionRate: number; // 0-100
  currentStreak: number;
  longestStreak: number;
  tasksCompleted: number;
  
  // Final score
  leaderboardScore: number; // (completionRate * 0.7) + (currentStreak * 0.3)
  
  // NOT INCLUDED: likes, comments, followers, views
}

// ============================================
// VALIDATION & SAFETY
// ============================================

/**
 * Validate challenge content for NSFW/forbidden content
 */
export function validateChallengeContent(
  title: string,
  description: string,
  category: string,
  taskTitle: string,
  taskDescription: string
): {
  isValid: boolean;
  containsNSFW: boolean;
  containsForbiddenContent: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  let containsNSFW = false;
  let containsForbiddenContent = false;
  
  // Combine all text content
  const allText = [
    title,
    description,
    category,
    taskTitle,
    taskDescription,
  ].join(' ').toLowerCase();
  
  // Check for blocked keywords
  for (const keyword of BLOCKED_CHALLENGE_KEYWORDS) {
    if (allText.includes(keyword.toLowerCase())) {
      violations.push(`Blocked keyword detected: "${keyword}"`);
      containsNSFW = true;
    }
  }
  
  // Check for forbidden categories
  for (const forbidden of FORBIDDEN_CATEGORIES) {
    if (allText.includes(forbidden)) {
      violations.push(`Forbidden category detected: "${forbidden}"`);
      containsForbiddenContent = true;
    }
  }
  
  // Check for suspicious patterns
  if (allText.includes('1-on-1') || allText.includes('one on one')) {
    violations.push('Suspicious pattern: private 1-on-1 challenge');
    containsForbiddenContent = true;
  }
  
  if (allText.includes('private room') || allText.includes('hotel')) {
    violations.push('Suspicious pattern: private location');
    containsForbiddenContent = true;
  }
  
  const isValid = violations.length === 0;
  
  return {
    isValid,
    containsNSFW,
    containsForbiddenContent,
    violations,
  };
}

/**
 * Calculate leaderboard score (consistency-based only)
 */
export function calculateLeaderboardScore(
  completionRate: number,
  currentStreak: number,
  longestStreak: number
): number {
  // 70% weight on completion rate
  // 20% weight on current streak
  // 10% weight on longest streak
  const completionScore = completionRate * 0.7;
  const currentStreakScore = Math.min(currentStreak * 2, 100) * 0.2; // Cap at 50 days
  const longestStreakScore = Math.min(longestStreak * 1, 100) * 0.1; // Cap at 100 days
  
  return Math.round(completionScore + currentStreakScore + longestStreakScore);
}

/**
 * Get duration in days from enum
 */
export function getDurationDays(duration: ChallengeDuration): number {
  switch (duration) {
    case ChallengeDuration.ONE_DAY:
      return 1;
    case ChallengeDuration.THREE_DAYS:
      return 3;
    case ChallengeDuration.ONE_WEEK:
      return 7;
    case ChallengeDuration.TWO_WEEKS:
      return 14;
    case ChallengeDuration.THIRTY_DAYS:
      return 30;
    case ChallengeDuration.SIXTY_DAYS:
      return 60;
    case ChallengeDuration.NINETY_DAYS:
      return 90;
    default:
      return 30;
  }
}

/**
 * Calculate completion rate
 */
export function calculateCompletionRate(
  tasksCompleted: number,
  tasksRequired: number
): number {
  if (tasksRequired === 0) return 0;
  return Math.round((tasksCompleted / tasksRequired) * 100);
}

/**
 * Validate post content for NSFW
 */
export function validatePostContent(
  caption: string,
  type: ChallengePostType
): {
  isValid: boolean;
  containsNSFW: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  let containsNSFW = false;
  
  const text = caption.toLowerCase();
  
  // Check for NSFW keywords
  for (const keyword of BLOCKED_CHALLENGE_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      violations.push(`NSFW keyword in post: "${keyword}"`);
      containsNSFW = true;
    }
  }
  
  // Check for external links
  if (text.includes('http://') || text.includes('https://') || text.includes('www.')) {
    violations.push('External links not allowed in challenge posts');
  }
  
  // Check for contact info
  if (text.includes('@') || text.includes('email') || text.includes('phone')) {
    violations.push('Contact information not allowed');
  }
  
  const isValid = violations.length === 0;
  
  return {
    isValid,
    containsNSFW,
    violations,
  };
}

// ============================================
// REQUEST/RESPONSE TYPES
// ============================================

/**
 * Create challenge request
 */
export interface CreateChallengeRequest {
  title: string;
  description: string;
  category: ChallengeCategory;
  isPaid: boolean;
  entryTokens: number;
  duration: ChallengeDuration;
  startDate: string; // ISO timestamp
  taskTitle: string;
  taskDescription: string;
  taskFrequency: TaskFrequency;
  tasksPerDay?: number;
  tasksPerWeek?: number;
  requiresPhoto: boolean;
  requiresVideo: boolean;
  requiresTextLog: boolean;
  maxParticipants?: number;
  tags?: string[];
}

/**
 * Join challenge request
 */
export interface JoinChallengeRequest {
  challengeId: string;
}

/**
 * Submit task request
 */
export interface SubmitTaskRequest {
  challengeId: string;
  taskNumber: number;
  taskDate: string; // ISO timestamp
  postType: ChallengePostType;
  caption?: string;
  mediaUrl?: string;
}

/**
 * Get leaderboard request
 */
export interface GetLeaderboardRequest {
  challengeId: string;
  limit?: number; // Default 50, max 100
}

/**
 * API response wrapper
 */
export interface ChallengeResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}