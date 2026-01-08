/**
 * PACK 140 — Reputation System 2.0
 * Mobile Service Layer
 */

import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

// ============================================================================
// TYPES
// ============================================================================

export interface ReputationScore {
  userId: string;
  reliability: number;
  communication: number;
  delivery: number;
  expertiseValidation: number;
  safetyConsistency: number;
  overallScore: number;
  lastCalculatedAt: any;
  totalEvents: number;
}

export interface ReputationInsights {
  userId: string;
  scores: {
    reliability: number;
    communication: number;
    delivery: number;
    expertiseValidation: number;
    safetyConsistency: number;
    overall: number;
  };
  recentChanges: Array<{
    dimension: string;
    change: number;
    reason: string;
    date: any;
  }>;
  suggestions: string[];
  visibleContexts: string[];
  lastUpdatedAt: any;
}

export interface ReputationBadge {
  level: string;
  color: string;
  icon: string;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Get user's reputation score
 */
export async function getReputationScore(): Promise<ReputationScore> {
  const getScore = httpsCallable<{}, { success: boolean; data: ReputationScore }>(
    functions,
    'pack140_getReputationScore'
  );

  const result = await getScore({});
  
  if (!result.data.success) {
    throw new Error('Failed to get reputation score');
  }

  return result.data.data;
}

/**
 * Get user's reputation insights
 */
export async function getReputationInsights(): Promise<ReputationInsights> {
  const getInsights = httpsCallable<{}, { success: boolean; data: ReputationInsights }>(
    functions,
    'pack140_getReputationInsights'
  );

  const result = await getInsights({});
  
  if (!result.data.success) {
    throw new Error('Failed to get reputation insights');
  }

  return result.data.data;
}

/**
 * Check reputation requirement for another user
 * Used before booking/purchasing from creators
 */
export async function checkReputationRequirement(
  targetUserId: string,
  minimumScore: number = 50
): Promise<{
  meets: boolean;
  currentScore: number;
  message: string;
}> {
  const checkRequirement = httpsCallable<
    { targetUserId: string; minimumScore: number },
    { success: boolean; data: { meets: boolean; currentScore: number; message: string } }
  >(functions, 'pack140_checkReputationRequirement');

  const result = await checkRequirement({ targetUserId, minimumScore });
  
  if (!result.data.success) {
    throw new Error('Failed to check reputation requirement');
  }

  return result.data.data;
}

/**
 * Start reputation recovery program
 */
export async function startRecovery(dimension: string): Promise<void> {
  const startRecoveryFn = httpsCallable<
    { dimension: string },
    { success: boolean; message: string }
  >(functions, 'pack140_startRecovery');

  const result = await startRecoveryFn({ dimension });
  
  if (!result.data.success) {
    throw new Error('Failed to start recovery program');
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get reputation badge for display
 */
export function getReputationBadge(overallScore: number): ReputationBadge {
  if (overallScore >= 90) {
    return { level: 'Excellent', color: '#10B981', icon: '⭐' };
  }
  if (overallScore >= 75) {
    return { level: 'Very Good', color: '#3B82F6', icon: '✓' };
  }
  if (overallScore >= 60) {
    return { level: 'Good', color: '#6366F1', icon: '✓' };
  }
  if (overallScore >= 40) {
    return { level: 'Fair', color: '#F59E0B', icon: '⚠' };
  }
  return { level: 'Needs Improvement', color: '#EF4444', icon: '!' };
}

/**
 * Get dimension display name
 */
export function getDimensionDisplayName(dimension: string): string {
  const names: Record<string, string> = {
    RELIABILITY: 'Reliability',
    COMMUNICATION: 'Communication',
    DELIVERY: 'Delivery',
    EXPERTISE_VALIDATION: 'Expertise',
    SAFETY_CONSISTENCY: 'Safety',
  };
  return names[dimension] || dimension;
}

/**
 * Get dimension icon
 */
export function getDimensionIcon(dimension: string): string {
  const icons: Record<string, string> = {
    RELIABILITY: '⏰',
    COMMUNICATION: '💬',
    DELIVERY: '✅',
    EXPERTISE_VALIDATION: '🎓',
    SAFETY_CONSISTENCY: '🛡️',
  };
  return icons[dimension] || '📊';
}

/**
 * Format reputation change for display
 */
export function formatReputationChange(change: number): string {
  if (change > 0) {
    return `+${change}`;
  }
  return `${change}`;
}

/**
 * Get change color
 */
export function getChangeColor(change: number): string {
  if (change > 0) {
    return '#10B981'; // Green
  }
  if (change < 0) {
    return '#EF4444'; // Red
  }
  return '#6B7280'; // Gray
}

/**
 * Check if reputation should be shown in context
 */
export function shouldShowReputation(context: string): boolean {
  const validContexts = [
    'MENTORSHIP_BOOKING',
    'DIGITAL_PRODUCT_PURCHASE',
    'PAID_CLUB_JOIN',
    'PAID_EVENT_JOIN',
  ];
  
  return validContexts.includes(context);
}

/**
 * Get reputation display for creator profiles
 */
export function getReputationDisplay(overallScore: number): {
  label: string;
  color: string;
  showScore: boolean;
} {
  if (overallScore >= 90) {
    return {
      label: 'Excellent Track Record',
      color: '#10B981',
      showScore: true,
    };
  }
  if (overallScore >= 75) {
    return {
      label: 'Very Good Track Record',
      color: '#3B82F6',
      showScore: true,
    };
  }
  if (overallScore >= 60) {
    return {
      label: 'Good Track Record',
      color: '#6366F1',
      showScore: true,
    };
  }
  if (overallScore >= 40) {
    return {
      label: 'Fair Track Record',
      color: '#F59E0B',
      showScore: false,
    };
  }
  return {
    label: 'Building Track Record',
    color: '#9CA3AF',
    showScore: false,
  };
}

/**
 * Format score for display (0-100)
 */
export function formatScore(score: number): string {
  return Math.round(score).toString();
}

/**
 * Get progress bar color
 */
export function getProgressBarColor(score: number): string {
  if (score >= 90) return '#10B981';
  if (score >= 75) return '#3B82F6';
  if (score >= 60) return '#6366F1';
  if (score >= 40) return '#F59E0B';
  return '#EF4444';
}