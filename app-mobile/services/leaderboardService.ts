/**
 * Leaderboard Service
 * PACK 33-9: Creator Leaderboards & Discovery Boost Engine
 * 
 * UI-only leaderboard system with AsyncStorage persistence.
 * Ranks creators based on real activity from Packs 33-1 → 33-8.
 * 
 * NO backend, NO API calls, NO token rewards.
 * Only UI badges and discovery boost.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSubscriberCount } from './subscriptionService';
import { getCreatorTotalEarnings as getLiveEarnings } from './liveService';
import { getEarnings as getPPVEarnings } from './ppvService';

// Storage keys
const LEADERBOARD_STORAGE_KEY = '@avalo_leaderboard';
const LEADERBOARD_HISTORY_KEY = '@avalo_leaderboard_history';
const BOOST_BADGES_KEY = '@avalo_boost_badges';

// Types
export interface CreatorScore {
  creatorId: string;
  creatorName: string;
  score: number;
  rank: number;
  previousRank: number;
  delta: number; // rank change vs last week
  category: 'subscriptions' | 'ppv' | 'live' | 'messages' | 'overall';
  badge?: 'gold' | 'silver' | 'bronze' | 'rising_star';
  
  // Detailed stats
  stats: {
    subscriberCount: number;
    liveEarnings: number;
    ppvEarnings: number;
    totalEngagement: number;
  };
}

export interface Leaderboard {
  week: string; // ISO week format: 2024-W47
  generatedAt: Date;
  overall: CreatorScore[];
  byCategory: {
    subscriptions: CreatorScore[];
    ppv: CreatorScore[];
    live: CreatorScore[];
    messages: CreatorScore[];
  };
  trending: CreatorScore[]; // Biggest positive delta
  risingStar: CreatorScore[]; // New creators with good scores
}

export interface LeaderboardHistory {
  [weekId: string]: Leaderboard;
}

export interface BoostBadge {
  creatorId: string;
  badge: 'gold' | 'silver' | 'bronze' | 'rising_star';
  awardedAt: Date;
  expiresAt: Date; // Lasts 7 days
  week: string;
}

/**
 * Get current ISO week string
 */
function getCurrentWeek(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const week = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${week.toString().padStart(2, '0')}`;
}

/**
 * Calculate creator score based on all activity
 * This is the core ranking algorithm
 */
async function calculateCreatorScore(
  creatorId: string,
  creatorName: string
): Promise<CreatorScore> {
  try {
    // Gather stats from all monetization services
    const subscriberCount = await getSubscriberCount(creatorId);
    const liveEarnings = await getLiveEarnings(creatorId);
    const ppvStats = await getPPVEarnings(creatorId);
    const ppvEarnings = ppvStats.totalEarned;
    
    // Calculate score with weighted algorithm
    // Subscriptions: 10 points per subscriber (recurring value)
    // PPV: 1 point per token earned (one-time value)
    // Live: 2 points per token earned (high engagement)
    const score = 
      (subscriberCount * 10) +
      (ppvEarnings * 1) +
      (liveEarnings * 2);
    
    // Total engagement metric (for display)
    const totalEngagement = subscriberCount + ppvStats.unlockCount;
    
    return {
      creatorId,
      creatorName,
      score,
      rank: 0, // Will be set after sorting
      previousRank: 0, // Will be loaded from history
      delta: 0, // Will be calculated vs previous week
      category: 'overall',
      stats: {
        subscriberCount,
        liveEarnings,
        ppvEarnings,
        totalEngagement,
      },
    };
  } catch (error) {
    console.error(`Error calculating score for ${creatorId}:`, error);
    return {
      creatorId,
      creatorName,
      score: 0,
      rank: 0,
      previousRank: 0,
      delta: 0,
      category: 'overall',
      stats: {
        subscriberCount: 0,
        liveEarnings: 0,
        ppvEarnings: 0,
        totalEngagement: 0,
      },
    };
  }
}

/**
 * Get all creator IDs from storage
 * Scans all monetization services to find active creators
 */
async function getAllCreatorIds(): Promise<Set<string>> {
  const creatorIds = new Set<string>();
  
  try {
    // Get creators from subscription service
    const subsData = await AsyncStorage.getItem('@avalo_subscriptions');
    if (subsData) {
      const subsState = JSON.parse(subsData);
      Object.values(subsState).forEach((userSubs: any) => {
        Object.values(userSubs).forEach((sub: any) => {
          if (sub.creatorId) creatorIds.add(sub.creatorId);
        });
      });
    }
    
    // Get creators from live service
    const liveData = await AsyncStorage.getItem('@avalo_live_sessions');
    if (liveData) {
      const liveSessions = JSON.parse(liveData);
      Object.values(liveSessions).forEach((session: any) => {
        if (session.creatorId) creatorIds.add(session.creatorId);
      });
    }
    
    // Get creators from PPV service
    const ppvData = await AsyncStorage.getItem('@avalo_ppv_purchases');
    if (ppvData) {
      const ppvState = JSON.parse(ppvData);
      Object.values(ppvState).forEach((userPurchases: any) => {
        Object.values(userPurchases).forEach((purchase: any) => {
          if (purchase.creatorId) creatorIds.add(purchase.creatorId);
        });
      });
    }
    
    return creatorIds;
  } catch (error) {
    console.error('Error getting creator IDs:', error);
    return creatorIds;
  }
}

/**
 * Compute weekly leaderboard from local stats
 * This is the main ranking function
 */
export async function computeWeeklyLeaderboard(): Promise<Leaderboard> {
  try {
    const currentWeek = getCurrentWeek();
    
    // Get all creators
    const creatorIds = await getAllCreatorIds();
    
    if (creatorIds.size === 0) {
      // Return empty leaderboard if no creators
      return {
        week: currentWeek,
        generatedAt: new Date(),
        overall: [],
        byCategory: {
          subscriptions: [],
          ppv: [],
          live: [],
          messages: [],
        },
        trending: [],
        risingStar: [],
      };
    }
    
    // Calculate scores for all creators
    const creatorScores = await Promise.all(
      Array.from(creatorIds).map(id => 
        calculateCreatorScore(id, `Creator ${id.substring(0, 8)}`)
      )
    );
    
    // Sort by score descending
    const sortedScores = creatorScores
      .filter(s => s.score > 0) // Only include creators with activity
      .sort((a, b) => b.score - a.score);
    
    // Load previous week's rankings
    const history = await getLeaderboardHistory();
    const previousWeekData = Object.values(history).sort(
      (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
    )[0];
    
    // Assign ranks and calculate deltas
    const rankedScores = sortedScores.map((score, index) => {
      const rank = index + 1;
      const previousRank = previousWeekData?.overall.find(
        s => s.creatorId === score.creatorId
      )?.rank || 0;
      
      const delta = previousRank > 0 ? previousRank - rank : 0;
      
      // Assign badges to top 3
      let badge: CreatorScore['badge'] = undefined;
      if (rank === 1) badge = 'gold';
      else if (rank === 2) badge = 'silver';
      else if (rank === 3) badge = 'bronze';
      
      return {
        ...score,
        rank,
        previousRank,
        delta,
        badge,
      };
    });
    
    // Category rankings
    const byCategory = {
      subscriptions: [...rankedScores]
        .sort((a, b) => b.stats.subscriberCount - a.stats.subscriberCount)
        .slice(0, 50)
        .map((s, i) => ({ ...s, rank: i + 1, category: 'subscriptions' as const })),
      
      ppv: [...rankedScores]
        .sort((a, b) => b.stats.ppvEarnings - a.stats.ppvEarnings)
        .slice(0, 50)
        .map((s, i) => ({ ...s, rank: i + 1, category: 'ppv' as const })),
      
      live: [...rankedScores]
        .sort((a, b) => b.stats.liveEarnings - a.stats.liveEarnings)
        .slice(0, 50)
        .map((s, i) => ({ ...s, rank: i + 1, category: 'live' as const })),
      
      messages: [...rankedScores]
        .sort((a, b) => b.stats.totalEngagement - a.stats.totalEngagement)
        .slice(0, 50)
        .map((s, i) => ({ ...s, rank: i + 1, category: 'messages' as const })),
    };
    
    // Trending: biggest positive deltas
    const trending = rankedScores
      .filter(s => s.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 20);
    
    // Rising Stars: new creators (no previous rank) with good scores
    const risingStars = rankedScores
      .filter(s => s.previousRank === 0 && s.rank <= 50)
      .slice(0, 20)
      .map(s => ({ ...s, badge: 'rising_star' as const }));
    
    const leaderboard: Leaderboard = {
      week: currentWeek,
      generatedAt: new Date(),
      overall: rankedScores.slice(0, 100), // Top 100
      byCategory,
      trending,
      risingStar: risingStars,
    };
    
    // Save to storage
    await AsyncStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(leaderboard));
    
    // Save to history
    const updatedHistory = { ...history, [currentWeek]: leaderboard };
    await AsyncStorage.setItem(LEADERBOARD_HISTORY_KEY, JSON.stringify(updatedHistory));
    
    // Apply boost rewards to top performers
    await applyWeeklyBoostRewards(leaderboard);
    
    return leaderboard;
  } catch (error) {
    console.error('Error computing weekly leaderboard:', error);
    throw error;
  }
}

/**
 * Get current leaderboard
 */
export async function getLeaderboard(): Promise<Leaderboard | null> {
  try {
    const data = await AsyncStorage.getItem(LEADERBOARD_STORAGE_KEY);
    if (!data) return null;
    
    const leaderboard = JSON.parse(data);
    
    // Check if leaderboard is from current week
    const currentWeek = getCurrentWeek();
    if (leaderboard.week !== currentWeek) {
      // Auto-refresh if outdated
      return await computeWeeklyLeaderboard();
    }
    
    return leaderboard;
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    return null;
  }
}

/**
 * Get leaderboard history
 */
async function getLeaderboardHistory(): Promise<LeaderboardHistory> {
  try {
    const data = await AsyncStorage.getItem(LEADERBOARD_HISTORY_KEY);
    if (!data) return {};
    return JSON.parse(data);
  } catch (error) {
    console.error('Error getting leaderboard history:', error);
    return {};
  }
}

/**
 * Get user's rank and delta
 */
export async function getUserRank(
  creatorId: string
): Promise<{
  rank: number;
  delta: number;
  badge?: 'gold' | 'silver' | 'bronze' | 'rising_star';
  score: number;
} | null> {
  try {
    const leaderboard = await getLeaderboard();
    if (!leaderboard) return null;
    
    const userScore = leaderboard.overall.find(s => s.creatorId === creatorId);
    if (!userScore) return null;
    
    return {
      rank: userScore.rank,
      delta: userScore.delta,
      badge: userScore.badge,
      score: userScore.score,
    };
  } catch (error) {
    console.error('Error getting user rank:', error);
    return null;
  }
}

/**
 * Get detailed rank stats for leaderboard screen
 */
export async function getRankStats(
  creatorId: string
): Promise<{
  overall: CreatorScore | null;
  subscriptions: CreatorScore | null;
  ppv: CreatorScore | null;
  live: CreatorScore | null;
  messages: CreatorScore | null;
  isRising: boolean;
  isTrending: boolean;
}> {
  try {
    const leaderboard = await getLeaderboard();
    if (!leaderboard) {
      return {
        overall: null,
        subscriptions: null,
        ppv: null,
        live: null,
        messages: null,
        isRising: false,
        isTrending: false,
      };
    }
    
    const overall = leaderboard.overall.find(s => s.creatorId === creatorId) || null;
    const subscriptions = leaderboard.byCategory.subscriptions.find(s => s.creatorId === creatorId) || null;
    const ppv = leaderboard.byCategory.ppv.find(s => s.creatorId === creatorId) || null;
    const live = leaderboard.byCategory.live.find(s => s.creatorId === creatorId) || null;
    const messages = leaderboard.byCategory.messages.find(s => s.creatorId === creatorId) || null;
    
    const isRising = leaderboard.risingStar.some(s => s.creatorId === creatorId);
    const isTrending = leaderboard.trending.some(s => s.creatorId === creatorId);
    
    return {
      overall,
      subscriptions,
      ppv,
      live,
      messages,
      isRising,
      isTrending,
    };
  } catch (error) {
    console.error('Error getting rank stats:', error);
    return {
      overall: null,
      subscriptions: null,
      ppv: null,
      live: null,
      messages: null,
      isRising: false,
      isTrending: false,
    };
  }
}

/**
 * Apply weekly boost rewards (UI badges only)
 * Gives temporary discovery boost to top performers
 */
export async function applyWeeklyBoostRewards(
  leaderboard: Leaderboard
): Promise<void> {
  try {
    const currentWeek = getCurrentWeek();
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days
    
    const badges: BoostBadge[] = [];
    
    // Award badges to top 3
    if (leaderboard.overall[0]) {
      badges.push({
        creatorId: leaderboard.overall[0].creatorId,
        badge: 'gold',
        awardedAt: now,
        expiresAt,
        week: currentWeek,
      });
    }
    
    if (leaderboard.overall[1]) {
      badges.push({
        creatorId: leaderboard.overall[1].creatorId,
        badge: 'silver',
        awardedAt: now,
        expiresAt,
        week: currentWeek,
      });
    }
    
    if (leaderboard.overall[2]) {
      badges.push({
        creatorId: leaderboard.overall[2].creatorId,
        badge: 'bronze',
        awardedAt: now,
        expiresAt,
        week: currentWeek,
      });
    }
    
    // Award rising star badges
    leaderboard.risingStar.slice(0, 5).forEach(creator => {
      badges.push({
        creatorId: creator.creatorId,
        badge: 'rising_star',
        awardedAt: now,
        expiresAt,
        week: currentWeek,
      });
    });
    
    // Save badges
    await AsyncStorage.setItem(BOOST_BADGES_KEY, JSON.stringify(badges));
  } catch (error) {
    console.error('Error applying boost rewards:', error);
  }
}

/**
 * Check if creator has active boost badge
 */
export async function hasBoostBadge(creatorId: string): Promise<boolean> {
  try {
    const data = await AsyncStorage.getItem(BOOST_BADGES_KEY);
    if (!data) return false;
    
    const badges: BoostBadge[] = JSON.parse(data);
    const now = new Date();
    
    return badges.some(
      badge => 
        badge.creatorId === creatorId && 
        new Date(badge.expiresAt) > now
    );
  } catch (error) {
    console.error('Error checking boost badge:', error);
    return false;
  }
}

/**
 * Get creator's active badge
 */
export async function getCreatorBadge(
  creatorId: string
): Promise<BoostBadge | null> {
  try {
    const data = await AsyncStorage.getItem(BOOST_BADGES_KEY);
    if (!data) return null;
    
    const badges: BoostBadge[] = JSON.parse(data);
    const now = new Date();
    
    return badges.find(
      badge => 
        badge.creatorId === creatorId && 
        new Date(badge.expiresAt) > now
    ) || null;
  } catch (error) {
    console.error('Error getting creator badge:', error);
    return null;
  }
}

/**
 * Clear all leaderboard data (for testing)
 */
export async function clearLeaderboardData(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LEADERBOARD_STORAGE_KEY);
    await AsyncStorage.removeItem(LEADERBOARD_HISTORY_KEY);
    await AsyncStorage.removeItem(BOOST_BADGES_KEY);
  } catch (error) {
    console.error('Error clearing leaderboard data:', error);
  }
}

export default {
  computeWeeklyLeaderboard,
  getLeaderboard,
  getUserRank,
  getRankStats,
  applyWeeklyBoostRewards,
  hasBoostBadge,
  getCreatorBadge,
  clearLeaderboardData,
};