/**
 * PACK 255 — Admin Monitoring & Analytics
 * 
 * Tools for monitoring match engine performance and user behavior
 */

import { db } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  MatchEngineMetrics,
  UserTier,
  MatchStats,
} from './pack255-ai-matchmaker-types';
import { getBehaviorProfile } from './pack255-behavior-tracker';
import { getUserTier } from './pack255-match-ranker';

// ============================================================================
// LOGGER
// ============================================================================

const logger = {
  info: (...args: any[]) => console.log('[Pack255:Admin]', ...args),
  warn: (...args: any[]) => console.warn('[Pack255:Admin]', ...args),
  error: (...args: any[]) => console.error('[Pack255:Admin]', ...args),
};

// ============================================================================
// COLLECTIONS
// ============================================================================

const COLLECTIONS = {
  ENGINE_METRICS: 'pack255_engine_metrics',
  MATCH_STATS: 'pack255_match_stats',
} as const;

// ============================================================================
// SYSTEM-WIDE METRICS
// ============================================================================

/**
 * Calculate and store system-wide match engine metrics
 */
export async function calculateEngineMetrics(): Promise<MatchEngineMetrics> {
  try {
    logger.info('Calculating match engine metrics');

    const now = Timestamp.now();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Get total and active users
    const totalUsersSnapshot = await db.collection('users').count().get();
    const totalUsers = totalUsersSnapshot.data().count;

    const activeUsersSnapshot = await db
      .collection('users')
      .where('lastActiveAt', '>=', Timestamp.fromDate(yesterday))
      .count()
      .get();
    const activeUsers = activeUsersSnapshot.data().count;

    // Get swipes and matches in last 24h
    const swipesSnapshot = await db
      .collection('pack255_behavior_signals')
      .where('type', 'in', ['swipe_right', 'swipe_left', 'swipe_left_fast'])
      .where('timestamp', '>=', Timestamp.fromDate(yesterday))
      .count()
      .get();
    const totalSwipes24h = swipesSnapshot.data().count;

    const matchesSnapshot = await db
      .collection('matches')
      .where('matchedAt', '>=', Timestamp.fromDate(yesterday))
      .count()
      .get();
    const totalMatches24h = matchesSnapshot.data().count;

    const avgMatchRate = totalSwipes24h > 0 ? (totalMatches24h / totalSwipes24h) * 100 : 0;

    // Get users with learned preferences
    const learnedPrefsSnapshot = await db
      .collection('pack255_learned_preferences')
      .where('confidenceLevel', '>', 0.2)
      .count()
      .get();
    const usersWithLearnedPreferences = learnedPrefsSnapshot.data().count;

    // Calculate average confidence level
    const allPrefsSnapshot = await db
      .collection('pack255_learned_preferences')
      .limit(1000)
      .get();

    const avgConfidenceLevel = allPrefsSnapshot.empty
      ? 0
      : allPrefsSnapshot.docs.reduce((sum, doc) => sum + (doc.data().confidenceLevel || 0), 0) / allPrefsSnapshot.size;

    // Get heated sessions in last 24h
    const heatedSessionsSnapshot = await db
      .collection('pack255_swipe_heating')
      .where('triggeredAt', '>=', Timestamp.fromDate(yesterday))
      .count()
      .get();
    const heatedSessions24h = heatedSessionsSnapshot.data().count;

    // Calculate tier distribution
    const tierCounts: Record<UserTier, number> = {
      [UserTier.ROYAL]: 0,
      [UserTier.HIGH_ENGAGEMENT]: 0,
      [UserTier.HIGH_MONETIZATION]: 0,
      [UserTier.STANDARD]: 0,
      [UserTier.LOW_POPULARITY]: 0,
      [UserTier.NEW_USER]: 0,
    };

    // Sample 1000 random users for tier distribution
    const sampleUsersSnapshot = await db
      .collection('users')
      .where('isActive', '==', true)
      .limit(1000)
      .get();

    for (const doc of sampleUsersSnapshot.docs) {
      const tier = await getUserTier(doc.id);
      tierCounts[tier]++;
    }

    // Get response rates (sample)
    const behaviorProfilesSnapshot = await db
      .collection('pack255_behavior_profiles')
      .limit(500)
      .get();

    const avgResponseRate = behaviorProfilesSnapshot.empty
      ? 0
      : behaviorProfilesSnapshot.docs.reduce((sum, doc) => sum + (doc.data().messageResponseRate || 0), 0) / behaviorProfilesSnapshot.size;

    const avgPaidConversionRate = behaviorProfilesSnapshot.empty
      ? 0
      : behaviorProfilesSnapshot.docs.reduce((sum, doc) => {
          const profile = doc.data();
          const conversion = profile.paidChatCount > 0 || profile.meetingCount > 0 ? 1 : 0;
          return sum + conversion;
        }, 0) / behaviorProfilesSnapshot.size;

    const avgMeetingConversionRate = behaviorProfilesSnapshot.empty
      ? 0
      : behaviorProfilesSnapshot.docs.reduce((sum, doc) => {
          const profile = doc.data();
          const conversion = profile.meetingCount > 0 ? 1 : 0;
          return sum + conversion;
        }, 0) / behaviorProfilesSnapshot.size;

    // TODO: Calculate heating effectiveness (requires tracking conversions during heating)
    const conversionRateHeated = 0;
    const conversionRateNormal = 0;
    const heatingEffectiveness = 0;

    const metrics: MatchEngineMetrics = {
      timestamp: now,
      totalUsers,
      activeUsers,
      totalSwipes24h,
      totalMatches24h,
      avgMatchRate,
      usersWithLearnedPreferences,
      avgConfidenceLevel,
      heatedSessions24h,
      conversionRateHeated,
      conversionRateNormal,
      heatingEffectiveness,
      tierCounts,
      avgResponseRate,
      avgPaidConversionRate,
      avgMeetingConversionRate,
    };

    // Store metrics
    await db.collection(COLLECTIONS.ENGINE_METRICS).add(metrics);

    logger.info('Match engine metrics calculated', {
      totalUsers,
      activeUsers,
      avgMatchRate: avgMatchRate.toFixed(2) + '%',
    });

    return metrics;
  } catch (error) {
    logger.error('Failed to calculate engine metrics:', error);
    throw error;
  }
}

/**
 * Get historical metrics
 */
export async function getHistoricalMetrics(days: number = 7): Promise<MatchEngineMetrics[]> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const metricsSnapshot = await db
      .collection(COLLECTIONS.ENGINE_METRICS)
      .where('timestamp', '>=', Timestamp.fromDate(startDate))
      .orderBy('timestamp', 'desc')
      .get();

    return metricsSnapshot.docs.map(doc => doc.data() as MatchEngineMetrics);
  } catch (error) {
    logger.error('Failed to get historical metrics:', error);
    throw error;
  }
}

// ============================================================================
// USER-SPECIFIC ANALYTICS
// ============================================================================

/**
 * Calculate match stats for a user
 */
export async function calculateUserMatchStats(
  userId: string,
  date?: string
): Promise<MatchStats> {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const dateStart = new Date(`${targetDate}T00:00:00Z`);
    const dateEnd = new Date(`${targetDate}T23:59:59Z`);

    // Get behavior profile
    const behaviorProfile = await getBehaviorProfile(userId);

    if (!behaviorProfile) {
      return {
        userId,
        date: targetDate,
        totalSwipes: 0,
        rightSwipes: 0,
        leftSwipes: 0,
        matches: 0,
        matchRate: 0,
        messages: 0,
        messageRate: 0,
        replies: 0,
        replyRate: 0,
        paidChats: 0,
        calls: 0,
        meetings: 0,
        heatedSessions: 0,
        conversionsWhileHeated: 0,
      };
    }

    // Get swipes for the day
    const swipesSnapshot = await db
      .collection('pack255_behavior_signals')
      .where('userId', '==', userId)
      .where('timestamp', '>=', Timestamp.fromDate(dateStart))
      .where('timestamp', '<=', Timestamp.fromDate(dateEnd))
      .where('type', 'in', ['swipe_right', 'swipe_left', 'swipe_left_fast'])
      .get();

    const rightSwipes = swipesSnapshot.docs.filter(doc => doc.data().type === 'swipe_right').length;
    const leftSwipes = swipesSnapshot.docs.filter(doc => 
      doc.data().type === 'swipe_left' || doc.data().type === 'swipe_left_fast'
    ).length;
    const totalSwipes = rightSwipes + leftSwipes;

    // Get matches for the day
    const matchesSnapshot = await db
      .collection('matches')
      .where('userId1', '==', userId)
      .where('matchedAt', '>=', Timestamp.fromDate(dateStart))
      .where('matchedAt', '<=', Timestamp.fromDate(dateEnd))
      .count()
      .get();
    const matches = matchesSnapshot.data().count;

    const matchRate = rightSwipes > 0 ? (matches / rightSwipes) * 100 : 0;

    // Get messages sent
    const messagesSnapshot = await db
      .collection('pack255_behavior_signals')
      .where('userId', '==', userId)
      .where('timestamp', '>=', Timestamp.fromDate(dateStart))
      .where('timestamp', '<=', Timestamp.fromDate(dateEnd))
      .where('type', 'in', ['message_sent', 'message_reply'])
      .get();

    const messages = messagesSnapshot.docs.filter(doc => doc.data().type === 'message_sent').length;
    const replies = messagesSnapshot.docs.filter(doc => doc.data().type === 'message_reply').length;

    const messageRate = matches > 0 ? (messages / matches) * 100 : 0;
    const replyRate = messages > 0 ? (replies / messages) * 100 : 0;

    // Get paid interactions
    const paidInteractionsSnapshot = await db
      .collection('pack255_behavior_signals')
      .where('userId', '==', userId)
      .where('timestamp', '>=', Timestamp.fromDate(dateStart))
      .where('timestamp', '<=', Timestamp.fromDate(dateEnd))
      .where('type', 'in', ['paid_chat', 'call_started', 'meeting_booked'])
      .get();

    const paidChats = paidInteractionsSnapshot.docs.filter(doc => doc.data().type === 'paid_chat').length;
    const calls = paidInteractionsSnapshot.docs.filter(doc => doc.data().type === 'call_started').length;
    const meetings = paidInteractionsSnapshot.docs.filter(doc => doc.data().type === 'meeting_booked').length;

    // Get heated sessions
    const heatedSessionsSnapshot = await db
      .collection('pack255_swipe_heating')
      .where('userId', '==', userId)
      .where('triggeredAt', '>=', Timestamp.fromDate(dateStart))
      .where('triggeredAt', '<=', Timestamp.fromDate(dateEnd))
      .count()
      .get();
    const heatedSessions = heatedSessionsSnapshot.data().count;

    const stats: MatchStats = {
      userId,
      date: targetDate,
      totalSwipes,
      rightSwipes,
      leftSwipes,
      matches,
      matchRate,
      messages,
      messageRate,
      replies,
      replyRate,
      paidChats,
      calls,
      meetings,
      heatedSessions,
      conversionsWhileHeated: 0, // TODO: Track this
    };

    // Store stats
    await db.collection(COLLECTIONS.MATCH_STATS).add(stats);

    return stats;
  } catch (error) {
    logger.error(`Failed to calculate match stats for ${userId}:`, error);
    throw error;
  }
}

/**
 * Get user's historical stats
 */
export async function getUserStatsHistory(
  userId: string,
  days: number = 30
): Promise<MatchStats[]> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const statsSnapshot = await db
      .collection(COLLECTIONS.MATCH_STATS)
      .where('userId', '==', userId)
      .where('date', '>=', startDate.toISOString().split('T')[0])
      .orderBy('date', 'desc')
      .get();

    return statsSnapshot.docs.map(doc => doc.data() as MatchStats);
  } catch (error) {
    logger.error(`Failed to get stats history for ${userId}:`, error);
    throw error;
  }
}

// ============================================================================
// DASHBOARD QUERIES
// ============================================================================

/**
 * Get top performing users (by match rate)
 */
export async function getTopPerformingUsers(limit: number = 10): Promise<Array<{
  userId: string;
  matchRate: number;
  totalMatches: number;
  tier: UserTier;
}>> {
  try {
    const profilesSnapshot = await db
      .collection('pack255_behavior_profiles')
      .orderBy('matchConversionRate', 'desc')
      .limit(limit)
      .get();

    const results = await Promise.all(
      profilesSnapshot.docs.map(async (doc) => {
        const profile = doc.data();
        const tier = await getUserTier(doc.id);
        
        return {
          userId: doc.id,
          matchRate: profile.matchConversionRate * 100,
          totalMatches: profile.totalMatches,
          tier,
        };
      })
    );

    return results;
  } catch (error) {
    logger.error('Failed to get top performing users:', error);
    throw error;
  }
}

/**
 * Get users needing attention (low popularity tier)
 */
export async function getUsersNeedingBoost(limit: number = 50): Promise<string[]> {
  try {
    const profilesSnapshot = await db
      .collection('pack255_behavior_profiles')
      .where('totalSwipes', '>=', 50)
      .orderBy('matchConversionRate', 'asc')
      .limit(limit)
      .get();

    return profilesSnapshot.docs.map(doc => doc.id);
  } catch (error) {
    logger.error('Failed to get users needing boost:', error);
    throw error;
  }
}

/**
 * Health check for the match engine
 */
export async function performHealthCheck(): Promise<{
  healthy: boolean;
  issues: string[];
  metrics: {
    avgMatchRate: number;
    avgResponseRate: number;
    activeUsers24h: number;
  };
}> {
  try {
    const issues: string[] = [];
    
    // Get latest metrics
    const latestMetricsSnapshot = await db
      .collection(COLLECTIONS.ENGINE_METRICS)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (latestMetricsSnapshot.empty) {
      issues.push('No metrics data available');
      return {
        healthy: false,
        issues,
        metrics: {
          avgMatchRate: 0,
          avgResponseRate: 0,
          activeUsers24h: 0,
        },
      };
    }

    const metrics = latestMetricsSnapshot.docs[0].data() as MatchEngineMetrics;

    // Check match rate
    if (metrics.avgMatchRate < 5) {
      issues.push(`Low match rate: ${metrics.avgMatchRate.toFixed(2)}% (expected >5%)`);
    }

    // Check response rate
    if (metrics.avgResponseRate < 0.4) {
      issues.push(`Low response rate: ${(metrics.avgResponseRate * 100).toFixed(2)}% (expected >40%)`);
    }

    // Check active users
    if (metrics.activeUsers < 10) {
      issues.push(`Low active users: ${metrics.activeUsers} (expected >10)`);
    }

    // Check learned preferences adoption
    const adoptionRate = metrics.totalUsers > 0 
      ? (metrics.usersWithLearnedPreferences / metrics.totalUsers) * 100 
      : 0;
    
    if (adoptionRate < 20 && metrics.totalUsers > 100) {
      issues.push(`Low learned preferences adoption: ${adoptionRate.toFixed(2)}% (expected >20%)`);
    }

    return {
      healthy: issues.length === 0,
      issues,
      metrics: {
        avgMatchRate: metrics.avgMatchRate,
        avgResponseRate: metrics.avgResponseRate * 100,
        activeUsers24h: metrics.activeUsers,
      },
    };
  } catch (error) {
    logger.error('Health check failed:', error);
    return {
      healthy: false,
      issues: ['Health check failed: ' + (error as Error).message],
      metrics: {
        avgMatchRate: 0,
        avgResponseRate: 0,
        activeUsers24h: 0,
      },
    };
  }
}

logger.info('✅ Pack 255 Admin & Monitoring initialized');