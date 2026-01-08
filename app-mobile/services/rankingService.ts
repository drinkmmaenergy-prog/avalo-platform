/**
 * Ranking Service
 * Mobile client for creator ranking and leaderboard features
 */

import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

const getDb = () => {
  try {
    const app = getApp();
    return getFirestore(app);
  } catch (error) {
    throw error;
  }
};

// ============================================================================
// TYPES
// ============================================================================

export type RankingPeriod = 'daily' | 'weekly' | 'monthly' | 'lifetime';
export type RankingSegment = 'worldwide' | 'country' | 'city';
export type GenderFilter = 'all' | 'women' | 'men' | 'other';
export type CategoryFilter = 'all' | 'video' | 'chat' | 'tips' | 'content';

export interface LeaderboardEntry {
  rank: number;
  creatorId: string;
  displayName: string;
  avatar?: string;
  gender: 'male' | 'female' | 'other';
  points: number;
  badges: {
    royal?: boolean;
    vip?: boolean;
    influencer?: boolean;
    earnOn?: boolean;
    incognito?: boolean;
  };
  stats: {
    tips: number;
    chats: number;
    calls: number;
    content: number;
  };
  country?: string;
  city?: string;
  hasTop10Bonus?: boolean;
}

export interface LeaderboardQuery {
  period: RankingPeriod;
  segment?: RankingSegment;
  gender?: GenderFilter;
  category?: CategoryFilter;
  country?: string;
  city?: string;
  limit?: number;
}

export interface CreatorDashboard {
  creatorId: string;
  rankings: {
    daily: { worldwide: number | null; country: number | null; city: number | null };
    weekly: { worldwide: number | null; country: number | null; city: number | null };
    monthly: { worldwide: number | null; country: number | null; city: number | null };
    lifetime: { worldwide: number | null; country: number | null; city: number | null };
  };
  points: {
    daily: number;
    weekly: number;
    monthly: number;
    lifetime: number;
  };
  categoryRankings: {
    video: number | null;
    chat: number | null;
    tips: number | null;
    content: number | null;
  };
  predictions: {
    dailyPositionChange: number;
    weeklyPositionChange: number;
    monthlyPositionChange: number;
    pointsNeededForNextRank: number;
  };
  suggestions: string[];
  milestones: Milestone[];
  improvementTimeline: TimelinePoint[];
  hasTop10Bonus: boolean;
  bonusExpiresAt?: Date;
  lastUpdated: Date;
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  achievedAt: Date;
  icon: string;
}

export interface TimelinePoint {
  date: Date;
  rank: number;
  points: number;
  period: RankingPeriod;
}

// ============================================================================
// LEADERBOARD FUNCTIONS
// ============================================================================

/**
 * Get global leaderboard
 */
export async function getLeaderboard(
  queryParams: LeaderboardQuery
): Promise<{ entries: LeaderboardEntry[]; total: number }> {
  try {
    const getLeaderboardFn = httpsCallable(functions, 'getLeaderboard');
    const result = await getLeaderboardFn(queryParams);
    const data = result.data as any;
    
    return {
      entries: data.entries || [],
      total: data.total || 0,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Get creator's current rank
 */
export async function getCreatorRank(
  creatorId: string,
  period: RankingPeriod,
  segment: RankingSegment = 'worldwide'
): Promise<number | null> {
  try {
    const getCreatorRankFn = httpsCallable(functions, 'getCreatorRank');
    const result = await getCreatorRankFn({ creatorId, period, segment });
    return (result.data as any).rank || null;
  } catch (error) {
    return null;
  }
}

/**
 * Check if creator has Top 10 bonus
 */
export async function hasTop10Bonus(creatorId: string): Promise<boolean> {
  try {
    const db = getDb();
    const bonusRef = doc(db, 'top10_bonuses', creatorId);
    const bonusSnap = await getDoc(bonusRef);
    
    if (!bonusSnap.exists()) {
      return false;
    }
    
    const bonus = bonusSnap.data();
    const expiresAt = bonus.expiresAt?.toDate();
    
    return bonus.isActive && expiresAt && new Date() < expiresAt;
  } catch (error) {
    return false;
  }
}

// ============================================================================
// CREATOR DASHBOARD FUNCTIONS
// ============================================================================

/**
 * Get creator dashboard data
 */
export async function getCreatorDashboard(creatorId: string): Promise<CreatorDashboard | null> {
  try {
    const getDashboardFn = httpsCallable(functions, 'getCreatorDashboard');
    const result = await getDashboardFn({ creatorId });
    const data = result.data as any;
    
    if (!data) {
      return null;
    }
    
    // Convert Firestore timestamps to dates
    return {
      ...data,
      bonusExpiresAt: data.bonusExpiresAt ? new Date(data.bonusExpiresAt) : undefined,
      lastUpdated: new Date(data.lastUpdated),
      milestones: (data.milestones || []).map((m: any) => ({
        ...m,
        achievedAt: new Date(m.achievedAt),
      })),
      improvementTimeline: (data.improvementTimeline || []).map((p: any) => ({
        ...p,
        date: new Date(p.date),
      })),
    };
  } catch (error) {
    return null;
  }
}

/**
 * Get action suggestions for creator
 */
export function getActionSuggestions(dashboard: CreatorDashboard): string[] {
  const suggestions: string[] = [];
  
  // Analyze performance and suggest improvements
  const { points, categoryRankings } = dashboard;
  
  if (points.daily < 100) {
    suggestions.push('Engage more with fans through chat to boost your daily ranking');
  }
  
  if (!categoryRankings.video || categoryRankings.video > 50) {
    suggestions.push('Host video calls to improve your video category ranking');
  }
  
  if (!categoryRankings.tips || categoryRankings.tips > 50) {
    suggestions.push('Encourage fans to send tips during interactions');
  }
  
  if (!categoryRankings.content || categoryRankings.content > 50) {
    suggestions.push('Upload premium content to increase content sales');
  }
  
  if (dashboard.predictions.pointsNeededForNextRank < 100) {
    suggestions.push(`You're close! Only ${dashboard.predictions.pointsNeededForNextRank} points to rank up`);
  }
  
  return suggestions.slice(0, 3); // Return top 3 suggestions
}

/**
 * Calculate predicted position change
 */
export function calculatePredictedChange(
  currentRank: number,
  currentPoints: number,
  averagePointsPerHour: number
): { positionChange: number; pointsNeeded: number } {
  // Simple prediction: if gaining points faster than average, predict upward movement
  const estimatedPoints = currentPoints + (averagePointsPerHour * 24);
  const positionChange = Math.floor((estimatedPoints - currentPoints) / 100); // Rough estimate
  
  return {
    positionChange: Math.max(-10, Math.min(10, positionChange)), // Cap at ±10
    pointsNeeded: 100, // Points needed to move up one rank (approximation)
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format points for display
 */
export function formatPoints(points: number): string {
  if (points >= 1000000) {
    return `${(points / 1000000).toFixed(1)}M`;
  }
  if (points >= 1000) {
    return `${(points / 1000).toFixed(1)}K`;
  }
  return points.toString();
}

/**
 * Get rank badge color
 */
export function getRankBadgeColor(rank: number): string {
  if (rank <= 3) return '#FFD700'; // Gold
  if (rank <= 10) return '#C0C0C0'; // Silver
  if (rank <= 50) return '#CD7F32'; // Bronze
  return '#999999'; // Gray
}

/**
 * Get rank display text
 */
export function getRankDisplayText(rank: number | null): string {
  if (rank === null) return 'Unranked';
  if (rank === 1) return '🏆 #1';
  if (rank === 2) return '🥈 #2';
  if (rank === 3) return '🥉 #3';
  return `#${rank}`;
}

/**
 * Get period display name
 */
export function getPeriodDisplayName(period: RankingPeriod): string {
  switch (period) {
    case 'daily':
      return 'Today';
    case 'weekly':
      return 'This Week';
    case 'monthly':
      return 'This Month';
    case 'lifetime':
      return 'All Time';
    default:
      return period;
  }
}

/**
 * Get segment display name
 */
export function getSegmentDisplayName(segment: RankingSegment): string {
  switch (segment) {
    case 'worldwide':
      return 'Global';
    case 'country':
      return 'Country';
    case 'city':
      return 'City';
    default:
      return segment;
  }
}

/**
 * Sort badges by priority (Royal > VIP > Influencer > EarnOn > Incognito)
 */
export function getPrimaryBadge(badges: LeaderboardEntry['badges']): {
  type: string;
  label: string;
  color: string;
} | null {
  if (badges.royal) {
    return { type: 'royal', label: '👑 Royal', color: '#9333EA' };
  }
  if (badges.vip) {
    return { type: 'vip', label: '⭐ VIP', color: '#F59E0B' };
  }
  if (badges.influencer) {
    return { type: 'influencer', label: '✨ Influencer', color: '#EC4899' };
  }
  if (badges.earnOn) {
    return { type: 'earnOn', label: '💰 Earn On', color: '#10B981' };
  }
  if (badges.incognito) {
    return { type: 'incognito', label: '🕶️ Incognito', color: '#6B7280' };
  }
  return null;
}

export default {
  getLeaderboard,
  getCreatorRank,
  hasTop10Bonus,
  getCreatorDashboard,
  getActionSuggestions,
  calculatePredictedChange,
  formatPoints,
  getRankBadgeColor,
  getRankDisplayText,
  getPeriodDisplayName,
  getSegmentDisplayName,
  getPrimaryBadge,
};