/**
 * PACK 257 — Creator Analytics Dashboard Service
 * Service layer for comprehensive creator analytics
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth } from '../lib/firebase';
import {
  CreatorDashboardData,
  EarningsOverview,
  EngagementMetrics,
  ConversationAnalytics,
  MediaSalesAnalytics,
  PerformanceLevel,
  OptimizationSuggestion,
  RoyalAdvancedAnalytics,
  DashboardFilters,
  PerformanceTier,
  TIER_INFO,
} from '../types/pack257-creator-dashboard';

const functions = getFunctions();

// ============================================================================
// PRIMARY DASHBOARD DATA
// ============================================================================

/**
 * Get complete creator dashboard data
 */
export async function getCreatorDashboard(
  filters?: DashboardFilters
): Promise<CreatorDashboardData> {
  const callable = httpsCallable<
    { filters?: DashboardFilters },
    CreatorDashboardData
  >(functions, 'pack257_getCreatorDashboard');

  const result = await callable({ filters });
  return {
    ...result.data,
    lastUpdated: new Date(result.data.lastUpdated),
  };
}

/**
 * Get earnings overview
 */
export async function getEarningsOverview(): Promise<EarningsOverview> {
  const callable = httpsCallable<{}, EarningsOverview>(
    functions,
    'pack257_getEarningsOverview'
  );

  const result = await callable({});
  return result.data;
}

/**
 * Get engagement metrics
 */
export async function getEngagementMetrics(): Promise<EngagementMetrics> {
  const callable = httpsCallable<{}, EngagementMetrics>(
    functions,
    'pack257_getEngagementMetrics'
  );

  const result = await callable({});
  return result.data;
}

/**
 * Get conversation analytics
 */
export async function getConversationAnalytics(): Promise<ConversationAnalytics> {
  const callable = httpsCallable<{}, ConversationAnalytics>(
    functions,
    'pack257_getConversationAnalytics'
  );

  const result = await callable({});
  return result.data;
}

/**
 * Get media sales analytics
 */
export async function getMediaSalesAnalytics(): Promise<MediaSalesAnalytics> {
  const callable = httpsCallable<{}, MediaSalesAnalytics>(
    functions,
    'pack257_getMediaSalesAnalytics'
  );

  const result = await callable({});
  return result.data;
}

// ============================================================================
// PERFORMANCE TIER SYSTEM
// ============================================================================

/**
 * Get current performance level and progress
 */
export async function getPerformanceLevel(): Promise<PerformanceLevel> {
  const callable = httpsCallable<{}, PerformanceLevel>(
    functions,
    'pack257_getPerformanceLevel'
  );

  const result = await callable({});
  return result.data;
}

/**
 * Calculate tier from earnings
 */
export function calculateTierFromEarnings(lifetimeEarnings: number): PerformanceTier {
  if (lifetimeEarnings >= TIER_INFO.L6.minEarnings) return 'L6';
  if (lifetimeEarnings >= TIER_INFO.L5.minEarnings) return 'L5';
  if (lifetimeEarnings >= TIER_INFO.L4.minEarnings) return 'L4';
  if (lifetimeEarnings >= TIER_INFO.L3.minEarnings) return 'L3';
  if (lifetimeEarnings >= TIER_INFO.L2.minEarnings) return 'L2';
  return 'L1';
}

/**
 * Get tier display info
 */
export function getTierDisplayInfo(tier: PerformanceTier) {
  return TIER_INFO[tier];
}

// ============================================================================
// AI OPTIMIZATION SUGGESTIONS
// ============================================================================

/**
 * Get AI-generated optimization suggestions
 */
export async function getOptimizationSuggestions(): Promise<OptimizationSuggestion[]> {
  const callable = httpsCallable<{}, { suggestions: OptimizationSuggestion[] }>(
    functions,
    'pack257_getOptimizationSuggestions'
  );

  const result = await callable({});
  return result.data.suggestions.map((s) => ({
    ...s,
    createdAt: new Date(s.createdAt),
  }));
}

/**
 * Dismiss a suggestion
 */
export async function dismissSuggestion(suggestionId: string): Promise<void> {
  const callable = httpsCallable<{ suggestionId: string }, {}>(
    functions,
    'pack257_dismissSuggestion'
  );

  await callable({ suggestionId });
}

/**
 * Mark suggestion as acted upon
 */
export async function actOnSuggestion(suggestionId: string): Promise<void> {
  const callable = httpsCallable<{ suggestionId: string }, {}>(
    functions,
    'pack257_actOnSuggestion'
  );

  await callable({ suggestionId });
}

// ============================================================================
// ROYAL ADVANCED ANALYTICS
// ============================================================================

/**
 * Get Royal-exclusive advanced analytics
 * Only available for Royal tier creators
 */
export async function getRoyalAdvancedAnalytics(): Promise<RoyalAdvancedAnalytics | null> {
  try {
    const callable = httpsCallable<{}, RoyalAdvancedAnalytics>(
      functions,
      'pack257_getRoyalAdvancedAnalytics'
    );

    const result = await callable({});
    return result.data;
  } catch (error: any) {
    // Return null if not Royal or feature not available
    if (error.code === 'permission-denied' || error.code === 'not-found') {
      return null;
    }
    throw error;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format tokens with K/M suffixes
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toLocaleString();
}

/**
 * Format percentage with sign
 */
export function formatPercentage(value: number, includeSign: boolean = true): string {
  const sign = includeSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Get trend indicator
 */
export function getTrendIndicator(trend: number): '↑' | '↓' | '→' {
  if (trend > 5) return '↑';
  if (trend < -5) return '↓';
  return '→';
}

/**
 * Get trend color
 */
export function getTrendColor(trend: number): string {
  if (trend > 5) return '#34C759'; // green
  if (trend < -5) return '#FF3B30'; // red
  return '#8E8E93'; // gray
}

/**
 * Format time window (e.g., "20:00-21:00")
 */
export function formatTimeWindow(startHour: number, endHour?: number): string {
  const start = `${startHour.toString().padStart(2, '0')}:00`;
  if (endHour !== undefined) {
    const end = `${endHour.toString().padStart(2, '0')}:00`;
    return `${start}-${end}`;
  }
  return start;
}

/**
 * Get day name from number (0 = Sunday)
 */
export function getDayName(dayNumber: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayNumber] || '';
}

/**
 * Calculate progress percentage between two values
 */
export function calculateProgress(current: number, target: number): number {
  if (target === 0) return 100;
  return Math.min(100, (current / target) * 100);
}

/**
 * Privacy: Anonymize viewer ID for display
 */
export function anonymizeViewerId(viewerId: string): string {
  // Show only first 4 and last 4 characters
  if (viewerId.length <= 12) return '****';
  return `${viewerId.substring(0, 4)}****${viewerId.substring(viewerId.length - 4)}`;
}

/**
 * Check if user should see Royal features
 */
export function shouldShowRoyalFeatures(tier: PerformanceTier): boolean {
  return tier === 'L6';
}

/**
 * Get suggestion priority color
 */
export function getSuggestionPriorityColor(priority: 'high' | 'medium' | 'low'): string {
  switch (priority) {
    case 'high':
      return '#FF3B30';
    case 'medium':
      return '#FF9500';
    case 'low':
      return '#007AFF';
  }
}

/**
 * Get suggestion type icon
 */
export function getSuggestionTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    timing: '⏰',
    content: '📸',
    engagement: '💬',
    pricing: '💰',
    activity: '⚡',
  };
  return icons[type] || '💡';
}

/**
 * Format date relative to now
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Calculate conversion rate
 */
export function calculateConversionRate(converted: number, total: number): number {
  if (total === 0) return 0;
  return (converted / total) * 100;
}

/**
 * Get tier progress color
 */
export function getTierProgressColor(tier: PerformanceTier): string {
  const colors: Record<PerformanceTier, string> = {
    L1: '#8E8E93',
    L2: '#5AC8FA',
    L3: '#007AFF',
    L4: '#AF52DE',
    L5: '#FF9500',
    L6: '#FFD700',
  };
  return colors[tier];
}