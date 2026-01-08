/**
 * PACK 137: Avalo Global Community Challenges Service
 * Client-side API wrapper for challenge functions
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  Challenge,
  ChallengeParticipant,
  ChallengeProgress,
  ChallengePost,
  ChallengeBadge,
  LeaderboardEntry,
  ChallengeCategory,
  ChallengeDuration,
  TaskFrequency,
  ChallengePostType,
  ParticipantStatus,
} from './types/challenges.types';

const functions = getFunctions();

// ============================================
// TYPE RE-EXPORTS (for convenience)
// ============================================

export {
  ChallengeCategory,
  ChallengeDuration,
  TaskFrequency,
  ChallengePostType,
  ParticipantStatus,
};

export type {
  Challenge,
  ChallengeParticipant,
  ChallengeProgress,
  ChallengePost,
  ChallengeBadge,
  LeaderboardEntry,
};

// ============================================
// API RESPONSE WRAPPER
// ============================================

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ============================================
// CHALLENGE MANAGEMENT
// ============================================

/**
 * Create a new challenge
 */
export async function createChallenge(params: {
  title: string;
  description: string;
  category: ChallengeCategory;
  isPaid: boolean;
  entryTokens: number;
  duration: ChallengeDuration;
  startDate: Date;
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
}): Promise<{ challengeId: string }> {
  const callable = httpsCallable<any, ApiResponse<{ challengeId: string }>>(
    functions,
    'createChallenge'
  );

  const result = await callable({
    ...params,
    startDate: params.startDate.toISOString(),
  });

  if (!result.data.success || !result.data.data) {
    throw new Error(result.data.error || 'Failed to create challenge');
  }

  return result.data.data;
}

/**
 * Join a challenge
 */
export async function joinChallenge(
  challengeId: string
): Promise<{ participantId: string }> {
  const callable = httpsCallable<any, ApiResponse<{ participantId: string }>>(
    functions,
    'joinChallenge'
  );

  const result = await callable({ challengeId });

  if (!result.data.success || !result.data.data) {
    throw new Error(result.data.error || 'Failed to join challenge');
  }

  return result.data.data;
}

/**
 * Submit a task completion with post
 */
export async function submitChallengeTask(params: {
  challengeId: string;
  taskNumber: number;
  taskDate: Date;
  postType: ChallengePostType;
  caption?: string;
  mediaUrl?: string;
}): Promise<{ postId: string; progressId: string }> {
  const callable = httpsCallable<any, ApiResponse<{ postId: string; progressId: string }>>(
    functions,
    'submitChallengeTask'
  );

  const result = await callable({
    ...params,
    taskDate: params.taskDate.toISOString(),
  });

  if (!result.data.success || !result.data.data) {
    throw new Error(result.data.error || 'Failed to submit task');
  }

  return result.data.data;
}

/**
 * Leave a challenge (no refund)
 */
export async function leaveChallenge(challengeId: string): Promise<void> {
  const callable = httpsCallable<any, ApiResponse>(functions, 'leaveChallenge');

  const result = await callable({ challengeId });

  if (!result.data.success) {
    throw new Error(result.data.error || 'Failed to leave challenge');
  }
}

/**
 * Cancel challenge (creator only, with refunds)
 */
export async function cancelChallenge(
  challengeId: string,
  reason: string
): Promise<void> {
  const callable = httpsCallable<any, ApiResponse>(functions, 'cancelChallenge');

  const result = await callable({ challengeId, reason });

  if (!result.data.success) {
    throw new Error(result.data.error || 'Failed to cancel challenge');
  }
}

// ============================================
// CHALLENGE QUERIES
// ============================================

/**
 * Get challenge details
 */
export async function getChallengeDetails(challengeId: string): Promise<Challenge> {
  const callable = httpsCallable<any, ApiResponse<Challenge>>(
    functions,
    'getChallengeDetails'
  );

  const result = await callable({ challengeId });

  if (!result.data.success || !result.data.data) {
    throw new Error(result.data.error || 'Failed to get challenge details');
  }

  return result.data.data;
}

/**
 * List all active challenges
 */
export async function listChallenges(params?: {
  category?: ChallengeCategory;
  limit?: number;
}): Promise<Challenge[]> {
  const callable = httpsCallable<any, ApiResponse<Challenge[]>>(
    functions,
    'listChallenges'
  );

  const result = await callable(params || {});

  if (!result.data.success || !result.data.data) {
    throw new Error(result.data.error || 'Failed to list challenges');
  }

  return result.data.data;
}

/**
 * Get user's participated challenges
 */
export async function getMyChallenges(status?: ParticipantStatus): Promise<ChallengeParticipant[]> {
  const callable = httpsCallable<any, ApiResponse<ChallengeParticipant[]>>(
    functions,
    'getMyChallenges'
  );

  const result = await callable({ status });

  if (!result.data.success || !result.data.data) {
    throw new Error(result.data.error || 'Failed to get challenges');
  }

  return result.data.data;
}

/**
 * Get challenge leaderboard
 */
export async function getChallengeLeaderboard(
  challengeId: string,
  limit?: number
): Promise<LeaderboardEntry[]> {
  const callable = httpsCallable<any, ApiResponse<LeaderboardEntry[]>>(
    functions,
    'getChallengeLeaderboard'
  );

  const result = await callable({ challengeId, limit });

  if (!result.data.success || !result.data.data) {
    throw new Error(result.data.error || 'Failed to get leaderboard');
  }

  return result.data.data;
}

/**
 * Get challenge posts
 */
export async function getChallengePosts(
  challengeId: string,
  limit?: number
): Promise<ChallengePost[]> {
  const callable = httpsCallable<any, ApiResponse<ChallengePost[]>>(
    functions,
    'getChallengePosts'
  );

  const result = await callable({ challengeId, limit });

  if (!result.data.success || !result.data.data) {
    throw new Error(result.data.error || 'Failed to get challenge posts');
  }

  return result.data.data;
}

/**
 * Get user's progress in a challenge
 */
export async function getChallengeProgress(challengeId: string): Promise<ChallengeProgress[]> {
  const callable = httpsCallable<any, ApiResponse<ChallengeProgress[]>>(
    functions,
    'getChallengeProgress'
  );

  const result = await callable({ challengeId });

  if (!result.data.success || !result.data.data) {
    throw new Error(result.data.error || 'Failed to get progress');
  }

  return result.data.data;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format challenge duration
 */
export function formatDuration(duration: ChallengeDuration): string {
  switch (duration) {
    case ChallengeDuration.ONE_DAY:
      return '1 Day';
    case ChallengeDuration.THREE_DAYS:
      return '3 Days';
    case ChallengeDuration.ONE_WEEK:
      return '1 Week';
    case ChallengeDuration.TWO_WEEKS:
      return '2 Weeks';
    case ChallengeDuration.THIRTY_DAYS:
      return '30 Days';
    case ChallengeDuration.SIXTY_DAYS:
      return '60 Days';
    case ChallengeDuration.NINETY_DAYS:
      return '90 Days';
    default:
      return 'Unknown';
  }
}

/**
 * Format category name
 */
export function formatCategory(category: ChallengeCategory): string {
  switch (category) {
    case ChallengeCategory.FITNESS:
      return 'Fitness';
    case ChallengeCategory.LIFESTYLE:
      return 'Lifestyle';
    case ChallengeCategory.EDUCATION:
      return 'Education';
    case ChallengeCategory.CREATIVE:
      return 'Creative';
    case ChallengeCategory.ENTERTAINMENT:
      return 'Entertainment';
    case ChallengeCategory.PRODUCTIVITY:
      return 'Productivity';
    case ChallengeCategory.WELLNESS:
      return 'Wellness';
    default:
      return 'Unknown';
  }
}

/**
 * Get category color
 */
export function getCategoryColor(category: ChallengeCategory): string {
  switch (category) {
    case ChallengeCategory.FITNESS:
      return '#FF6B6B';
    case ChallengeCategory.LIFESTYLE:
      return '#4ECDC4';
    case ChallengeCategory.EDUCATION:
      return '#45B7D1';
    case ChallengeCategory.CREATIVE:
      return '#FFA07A';
    case ChallengeCategory.ENTERTAINMENT:
      return '#98D8C8';
    case ChallengeCategory.PRODUCTIVITY:
      return '#6C5CE7';
    case ChallengeCategory.WELLNESS:
      return '#A8E6CF';
    default:
      return '#95A5A6';
  }
}

/**
 * Get category icon
 */
export function getCategoryIcon(category: ChallengeCategory): string {
  switch (category) {
    case ChallengeCategory.FITNESS:
      return '💪';
    case ChallengeCategory.LIFESTYLE:
      return '🌟';
    case ChallengeCategory.EDUCATION:
      return '📚';
    case ChallengeCategory.CREATIVE:
      return '🎨';
    case ChallengeCategory.ENTERTAINMENT:
      return '🎭';
    case ChallengeCategory.PRODUCTIVITY:
      return '📈';
    case ChallengeCategory.WELLNESS:
      return '🧘';
    default:
      return '✨';
  }
}

/**
 * Format task frequency
 */
export function formatTaskFrequency(frequency: TaskFrequency): string {
  switch (frequency) {
    case TaskFrequency.DAILY:
      return 'Daily';
    case TaskFrequency.WEEKLY:
      return 'Weekly';
    case TaskFrequency.CUSTOM:
      return 'Custom';
    default:
      return 'Unknown';
  }
}

/**
 * Get status color
 */
export function getStatusColor(status: ParticipantStatus): string {
  switch (status) {
    case ParticipantStatus.ACTIVE:
      return '#4CAF50';
    case ParticipantStatus.COMPLETED:
      return '#2196F3';
    case ParticipantStatus.DROPPED:
      return '#FF9800';
    case ParticipantStatus.REMOVED:
      return '#F44336';
    default:
      return '#9E9E9E';
  }
}

/**
 * Get status label
 */
export function getStatusLabel(status: ParticipantStatus): string {
  switch (status) {
    case ParticipantStatus.ACTIVE:
      return 'Active';
    case ParticipantStatus.COMPLETED:
      return 'Completed';
    case ParticipantStatus.DROPPED:
      return 'Dropped';
    case ParticipantStatus.REMOVED:
      return 'Removed';
    default:
      return 'Unknown';
  }
}

/**
 * Calculate days remaining
 */
export function getDaysRemaining(endDate: Date): number {
  const now = new Date();
  const diff = endDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/**
 * Format date range
 */
export function formatDateRange(startDate: Date, endDate: Date): string {
  const start = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const end = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${start} - ${end}`;
}

/**
 * Get completion badge color
 */
export function getCompletionBadgeColor(completionRate: number): string {
  if (completionRate >= 90) return '#4CAF50'; // Green
  if (completionRate >= 70) return '#2196F3'; // Blue
  if (completionRate >= 50) return '#FF9800'; // Orange
  return '#F44336'; // Red
}

/**
 * Format completion rate
 */
export function formatCompletionRate(completionRate: number): string {
  return `${Math.round(completionRate)}%`;
}

/**
 * Get streak emoji
 */
export function getStreakEmoji(streak: number): string {
  if (streak >= 30) return '🔥🔥🔥';
  if (streak >= 14) return '🔥🔥';
  if (streak >= 7) return '🔥';
  return '⭐';
}

/**
 * Validate challenge title
 */
export function validateChallengeTitle(title: string): string | null {
  if (!title || title.trim().length < 5) {
    return 'Title must be at least 5 characters';
  }
  if (title.length > 100) {
    return 'Title must be less than 100 characters';
  }
  return null;
}

/**
 * Validate challenge description
 */
export function validateChallengeDescription(description: string): string | null {
  if (!description || description.trim().length < 20) {
    return 'Description must be at least 20 characters';
  }
  if (description.length > 1000) {
    return 'Description must be less than 1000 characters';
  }
  return null;
}

/**
 * Validate entry tokens
 */
export function validateEntryTokens(tokens: number, isPaid: boolean): string | null {
  if (isPaid) {
    if (tokens < 1) {
      return 'Paid challenges must cost at least 1 token';
    }
    if (tokens > 5000) {
      return 'Entry cost cannot exceed 5000 tokens';
    }
  }
  return null;
}

/**
 * Check if challenge has started
 */
export function hasStarted(startDate: Date): boolean {
  return startDate.getTime() <= Date.now();
}

/**
 * Check if challenge has ended
 */
export function hasEnded(endDate: Date): boolean {
  return endDate.getTime() <= Date.now();
}

/**
 * Get challenge status text
 */
export function getChallengeStatusText(
  startDate: Date,
  endDate: Date
): 'upcoming' | 'active' | 'ended' {
  if (hasEnded(endDate)) return 'ended';
  if (hasStarted(startDate)) return 'active';
  return 'upcoming';
}