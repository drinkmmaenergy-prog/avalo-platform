/**
 * PACK 216: Creator Competition Engine
 * Core leaderboard computation, ranking, and reward distribution logic
 * 
 * DESIGN PRINCIPLES:
 * - Multiple competition categories (not just earnings)
 * - Weekly & monthly rankings
 * - Visibility-based rewards only (no tokens)
 * - No pay-to-win mechanics
 * - Ego-safe design (no shaming, positive messaging only)
 */

import { db, serverTimestamp, increment } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import {
  CompetitionCategory,
  RankingPeriod,
  VisibilityRewardType,
  LeaderboardRanking,
  WeeklyMetrics,
  VisibilityReward,
  LeaderboardBadge,
  LeaderboardNotification,
  MonthlySummary,
  REWARD_DURATIONS,
  AttractionStarsMetric,
  EarnersMetric,
  CharismaMetric,
  ConversationEnergyMetric,
  DiscoveriesMetric,
  PopularInCityMetric,
  SafeDatesMetric,
} from './types/leaderboard.types';

// ============================================================================
// CONSTANTS
// ============================================================================

const WEEKLY_RESET_DAY = 0; // Sunday (0 = Sunday in Date.getDay())
const WEEKLY_RESET_HOUR = 23; // 23:59 UTC
const WEEKLY_RESET_MINUTE = 59;

const TOP_RANKS_TO_REWARD = 10; // Top 10 get rewards
const NEW_USER_BOOST_DAYS = 30; // Discoveries category limited to first 30 days
const MIN_ACCOUNT_AGE_DAYS = 7; // Minimum account age to participate in most categories

// Reward tier configuration
const REWARD_TIERS: Record<number, VisibilityRewardType[]> = {
  1: ['TOP_BADGE', 'DISCOVERY_SPOTLIGHT', 'REGION_PRIORITY_BOOST'], // Rank 1
  2: ['TOP_BADGE', 'DISCOVERY_SPOTLIGHT'], // Rank 2
  3: ['TOP_BADGE', 'DISCOVERY_SPOTLIGHT'], // Rank 3
  4: ['TOP_BADGE', 'PROFILE_RIBBON'], // Ranks 4-5
  5: ['TOP_BADGE', 'PROFILE_RIBBON'],
  6: ['PROFILE_RIBBON'], // Ranks 6-10
  7: ['PROFILE_RIBBON'],
  8: ['PROFILE_RIBBON'],
  9: ['PROFILE_RIBBON'],
  10: ['PROFILE_RIBBON'],
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get current ISO week number
 */
function getISOWeekNumber(date: Date): number {
  const target = new Date(date.valueOf());
  const dayNumber = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNumber + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

/**
 * Get week start date (Monday 00:00 UTC)
 */
function getWeekStartDate(date: Date): Date {
  const result = new Date(date);
  const day = result.getUTCDay();
  const diff = result.getUTCDate() - day + (day === 0 ? -6 : 1);
  result.setUTCDate(diff);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

/**
 * Get week end date (Sunday 23:59 UTC)
 */
function getWeekEndDate(date: Date): Date {
  const start = getWeekStartDate(date);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

/**
 * Get user account age in days
 */
async function getUserAccountAgeDays(userId: string): Promise<number> {
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return 0;
  
  const createdAt = userDoc.data()?.createdAt?.toDate();
  if (!createdAt) return 0;
  
  const now = new Date();
  const diffMs = now.getTime() - createdAt.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Check if user is eligible for category
 */
async function isUserEligibleForCategory(
  userId: string,
  category: CompetitionCategory
): Promise<boolean> {
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return false;
  
  const userData = userDoc.data();
  const accountAgeDays = await getUserAccountAgeDays(userId);
  
  // Check competition opt-out
  const settingsDoc = await db
    .collection('users')
    .doc(userId)
    .collection('competition_settings')
    .doc('preferences')
    .get();
  
  if (settingsDoc.exists) {
    const settings = settingsDoc.data();
    if (settings?.optedOut) return false;
    if (settings?.hiddenCategories?.includes(category)) return false;
  }
  
  // Category-specific eligibility
  switch (category) {
    case 'TOP_DISCOVERIES':
      // Only new users (first 30 days)
      return accountAgeDays <= NEW_USER_BOOST_DAYS;
    
    case 'TOP_EARNERS':
    case 'TOP_CHARISMA':
      // Must be creator/earner
      return userData?.earnOnChat === true || userData?.isCreator === true;
    
    default:
      // Most categories require minimum account age
      return accountAgeDays >= MIN_ACCOUNT_AGE_DAYS;
  }
}

// ============================================================================
// METRIC CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate Top Attraction Stars metric
 */
async function calculateAttractionStarsMetric(
  userId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<number> {
  const weekStartTs = Timestamp.fromDate(weekStart);
  const weekEndTs = Timestamp.fromDate(weekEnd);
  
  // Get likes received
  const likesSnapshot = await db
    .collection('likes')
    .where('receiverId', '==', userId)
    .where('createdAt', '>=', weekStartTs)
    .where('createdAt', '<=', weekEndTs)
    .count()
    .get();
  const likesReceived = likesSnapshot.data().count;
  
  // Get wishlist adds
  const wishlistSnapshot = await db
    .collection('wishlists')
    .where('targetUserId', '==', userId)
    .where('createdAt', '>=', weekStartTs)
    .where('createdAt', '<=', weekEndTs)
    .count()
    .get();
  const wishlistAdds = wishlistSnapshot.data().count;
  
  // Get match probability (simplified: matches / profile views)
  const matchesSnapshot = await db
    .collection('matches')
    .where('participants', 'array-contains', userId)
    .where('createdAt', '>=', weekStartTs)
    .where('createdAt', '<=', weekEndTs)
    .count()
    .get();
  const matches = matchesSnapshot.data().count;
  
  const viewsSnapshot = await db
    .collection('profile_views')
    .where('viewedUserId', '==', userId)
    .where('viewedAt', '>=', weekStartTs)
    .where('viewedAt', '<=', weekEndTs)
    .count()
    .get();
  const views = viewsSnapshot.data().count;
  
  const matchProbability = views > 0 ? matches / views : 0;
  
  // Formula: (likes × 1.0) + (wishlist × 2.0) + (matchProbability × 3.0) × 100
  const totalScore = (likesReceived * 1.0) + (wishlistAdds * 2.0) + (matchProbability * 300);
  
  return Math.round(totalScore * 100) / 100;
}

/**
 * Calculate Top Earners metric
 */
async function calculateEarnersMetric(
  userId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<number> {
  const weekStartTs = Timestamp.fromDate(weekStart);
  const weekEndTs = Timestamp.fromDate(weekEnd);
  
  // Get total tokens earned (65% kept by creator)
  const transactionsSnapshot = await db
    .collection('wallet_transactions')
    .where('recipientId', '==', userId)
    .where('type', '==', 'CHAT_EARNING')
    .where('createdAt', '>=', weekStartTs)
    .where('createdAt', '<=', weekEndTs)
    .get();
  
  let totalEarned = 0;
  transactionsSnapshot.forEach((doc) => {
    const amount = doc.data().amount || 0;
    totalEarned += amount;
  });
  
  return totalEarned;
}

/**
 * Calculate Top Charisma metric
 */
async function calculateCharismaMetric(
  userId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<number> {
  const weekStartTs = Timestamp.fromDate(weekStart);
  const weekEndTs = Timestamp.fromDate(weekEnd);
  
  // Get meeting feedback
  const feedbackSnapshot = await db
    .collection('meeting_feedback')
    .where('meetingHostId', '==', userId)
    .where('submittedAt', '>=', weekStartTs)
    .where('submittedAt', '<=', weekEndTs)
    .get();
  
  if (feedbackSnapshot.empty) return 0;
  
  let totalRating = 0;
  let completedMeetings = 0;
  let totalMeetings = 0;
  
  feedbackSnapshot.forEach((doc) => {
    const data = doc.data();
    totalRating += data.vibeRating || 0;
    if (data.completed) completedMeetings++;
    totalMeetings++;
  });
  
  const averageVibeRating = totalMeetings > 0 ? totalRating / totalMeetings : 0;
  const completionRatio = totalMeetings > 0 ? completedMeetings / totalMeetings : 0;
  
  // Formula: (averageVibeRating × completionRatio) × 100
  const totalScore = (averageVibeRating * completionRatio) * 100;
  
  return Math.round(totalScore * 100) / 100;
}

/**
 * Calculate Top Conversation Energy metric
 */
async function calculateConversationEnergyMetric(
  userId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<number> {
  const weekStartTs = Timestamp.fromDate(weekStart);
  const weekEndTs = Timestamp.fromDate(weekEnd);
  
  // Get messages sent
  const messagesSnapshot = await db
    .collection('messages')
    .where('senderId', '==', userId)
    .where('createdAt', '>=', weekStartTs)
    .where('createdAt', '<=', weekEndTs)
    .get();
  
  let longMessageCount = 0;
  let totalMessages = 0;
  let totalResponseTime = 0;
  let responseTimeCount = 0;
  
  for (const doc of messagesSnapshot.docs) {
    const data = doc.data();
    totalMessages++;
    
    // Count long messages (> 50 words)
    const wordCount = (data.text || '').split(/\s+/).length;
    if (wordCount > 50) longMessageCount++;
    
    // Calculate response time
    if (data.replyToMessageId) {
      const replyToDoc = await db.collection('messages').doc(data.replyToMessageId).get();
      if (replyToDoc.exists) {
        const replyToTime = replyToDoc.data()?.createdAt?.toDate();
        const messageTime = data.createdAt?.toDate();
        if (replyToTime && messageTime) {
          const responseTimeMinutes = (messageTime.getTime() - replyToTime.getTime()) / 60000;
          totalResponseTime += responseTimeMinutes;
          responseTimeCount++;
        }
      }
    }
  }
  
  const averageResponseTime = responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 60;
  // Consistency: faster response = higher score (inverse, capped at 60 min)
  const responseConsistency = Math.max(0, 1 - (Math.min(averageResponseTime, 60) / 60));
  
  // Formula: (longMessageCount × 2.0) + (responseConsistency × 3.0) × totalMessages
  const totalScore = (longMessageCount * 2.0) + (responseConsistency * 3.0 * totalMessages);
  
  return Math.round(totalScore * 100) / 100;
}

/**
 * Calculate Top Discoveries metric (first 30 days only)
 */
async function calculateDiscoveriesMetric(
  userId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<number> {
  const weekStartTs = Timestamp.fromDate(weekStart);
  const weekEndTs = Timestamp.fromDate(weekEnd);
  
  // Check account age
  const accountAgeDays = await getUserAccountAgeDays(userId);
  if (accountAgeDays > NEW_USER_BOOST_DAYS) return 0;
  
  // Get profile views
  const viewsSnapshot = await db
    .collection('profile_views')
    .where('viewedUserId', '==', userId)
    .where('viewedAt', '>=', weekStartTs)
    .where('viewedAt', '<=', weekEndTs)
    .count()
    .get();
  const profileViews = viewsSnapshot.data().count;
  
  // Get matches
  const matchesSnapshot = await db
    .collection('matches')
    .where('participants', 'array-contains', userId)
    .where('createdAt', '>=', weekStartTs)
    .where('createdAt', '<=', weekEndTs)
    .count()
    .get();
  const matchCount = matchesSnapshot.data().count;
  
  // Calculate engagement (likes + messages + calls)
  const likesSnapshot = await db
    .collection('likes')
    .where('likerId', '==', userId)
    .where('createdAt', '>=', weekStartTs)
    .where('createdAt', '<=', weekEndTs)
    .count()
    .get();
  const likes = likesSnapshot.data().count;
  
  const messagesSnapshot = await db
    .collection('messages')
    .where('senderId', '==', userId)
    .where('createdAt', '>=', weekStartTs)
    .where('createdAt', '<=', weekEndTs)
    .count()
    .get();
  const messages = messagesSnapshot.data().count;
  
  const engagementScore = likes + (messages * 0.5);
  
  // Formula: (profileViews × 1.0) + (matches × 3.0) + (engagement × 5.0)
  const totalScore = (profileViews * 1.0) + (matchCount * 3.0) + (engagementScore * 5.0);
  
  return Math.round(totalScore * 100) / 100;
}

/**
 * Calculate Top Popular in City metric
 */
async function calculatePopularInCityMetric(
  userId: string,
  weekStart: Date,
  weekEnd: Date,
  region: string
): Promise<number> {
  const weekStartTs = Timestamp.fromDate(weekStart);
  const weekEndTs = Timestamp.fromDate(weekEnd);
  
  // Get region-specific likes
  const regionLikesSnapshot = await db
    .collection('likes')
    .where('receiverId', '==', userId)
    .where('region', '==', region)
    .where('createdAt', '>=', weekStartTs)
    .where('createdAt', '<=', weekEndTs)
    .count()
    .get();
  const regionLikes = regionLikesSnapshot.data().count;
  
  // Get region-specific matches
  const regionMatchesSnapshot = await db
    .collection('matches')
    .where('participants', 'array-contains', userId)
    .where('region', '==', region)
    .where('createdAt', '>=', weekStartTs)
    .where('createdAt', '<=', weekEndTs)
    .count()
    .get();
  const regionMatches = regionMatchesSnapshot.data().count;
  
  // Get local activity (events attended, spots visited)
  const eventsSnapshot = await db
    .collection('event_tickets')
    .where('userId', '==', userId)
    .where('region', '==', region)
    .where('purchasedAt', '>=', weekStartTs)
    .where('purchasedAt', '<=', weekEndTs)
    .count()
    .get();
  const localActivity = eventsSnapshot.data().count;
  
  // Formula: (regionLikes × 1.0) + (regionMatches × 3.0) + (localActivity × 5.0)
  const totalScore = (regionLikes * 1.0) + (regionMatches * 3.0) + (localActivity * 5.0);
  
  return Math.round(totalScore * 100) / 100;
}

/**
 * Calculate Top Safe Dates metric
 */
async function calculateSafeDatesMetric(
  userId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<number> {
  const weekStartTs = Timestamp.fromDate(weekStart);
  const weekEndTs = Timestamp.fromDate(weekEnd);
  
  // Get safety compliance data
  const userDoc = await db.collection('users').doc(userId).get();
  const safetyScore = userDoc.data()?.safetyComplianceScore || 0;
  
  // Get meeting feedback
  const feedbackSnapshot = await db
    .collection('meeting_feedback')
    .where('meetingHostId', '==', userId)
    .where('submittedAt', '>=', weekStartTs)
    .where('submittedAt', '<=', weekEndTs)
    .get();
  
  if (feedbackSnapshot.empty) return 0;
  
  let positiveFeedback = 0;
  let totalFeedback = 0;
  
  feedbackSnapshot.forEach((doc) => {
    const data = doc.data();
    if (data.feltSafe && data.wouldRecommend && !data.reportConcern) {
      positiveFeedback++;
    }
    totalFeedback++;
  });
  
  const positiveFeedbackRatio = totalFeedback > 0 ? positiveFeedback / totalFeedback : 0;
  
  // Formula: (safetyScore × 0.4) + (positiveFeedbackRatio × 0.6) × 1000
  const totalScore = ((safetyScore * 0.4) + (positiveFeedbackRatio * 0.6)) * 1000;
  
  return Math.round(totalScore * 100) / 100;
}

/**
 * Get metric calculation function for category
 */
function getMetricCalculator(category: CompetitionCategory) {
  switch (category) {
    case 'TOP_ATTRACTION_STARS':
      return calculateAttractionStarsMetric;
    case 'TOP_EARNERS':
      return calculateEarnersMetric;
    case 'TOP_CHARISMA':
      return calculateCharismaMetric;
    case 'TOP_CONVERSATION_ENERGY':
      return calculateConversationEnergyMetric;
    case 'TOP_DISCOVERIES':
      return calculateDiscoveriesMetric;
    case 'TOP_POPULAR_IN_CITY':
      return calculatePopularInCityMetric;
    case 'TOP_SAFE_DATES':
      return calculateSafeDatesMetric;
    default:
      throw new Error(`Unknown category: ${category}`);
  }
}

// ============================================================================
// WEEKLY METRICS AGGREGATION
// ============================================================================

/**
 * Compute weekly metrics for all users and categories
 */
export async function computeWeeklyMetrics(): Promise<void> {
  logger.info('Starting weekly metrics computation...');
  
  const now = new Date();
  const weekStart = getWeekStartDate(now);
  const weekEnd = getWeekEndDate(now);
  const weekNumber = getISOWeekNumber(now);
  const year = now.getUTCFullYear();
  
  logger.info(`Computing metrics for week ${weekNumber}, ${year}`);
  logger.info(`Period: ${weekStart.toISOString()} - ${weekEnd.toISOString()}`);
  
  // Get all active users
  const usersSnapshot = await db
    .collection('users')
    .where('isActive', '==', true)
    .get();
  
  logger.info(`Processing ${usersSnapshot.size} active users`);
  
  const categories: CompetitionCategory[] = [
    'TOP_ATTRACTION_STARS',
    'TOP_EARNERS',
    'TOP_CHARISMA',
    'TOP_CONVERSATION_ENERGY',
    'TOP_DISCOVERIES',
    'TOP_POPULAR_IN_CITY',
    'TOP_SAFE_DATES',
  ];
  
  let processedCount = 0;
  const batch = db.batch();
  let batchCount = 0;
  
  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const userData = userDoc.data();
    const region = userData.region || 'GLOBAL';
    const gender = userData.gender || 'other';
    
    for (const category of categories) {
      // Check eligibility
      const eligible = await isUserEligibleForCategory(userId, category);
      if (!eligible) continue;
      
      // Calculate metric
      let metricValue = 0;
      
      try {
        if (category === 'TOP_POPULAR_IN_CITY') {
          metricValue = await calculatePopularInCityMetric(userId, weekStart, weekEnd, region);
        } else {
          const calculator = getMetricCalculator(category);
          metricValue = await calculator(userId, weekStart, weekEnd);
        }
      } catch (error) {
        logger.error(`Error calculating ${category} for user ${userId}:`, error);
        continue;
      }
      
      // Skip if no activity
      if (metricValue === 0) continue;
      
      // Store weekly metric
      const metricId = `${userId}_${weekStart.toISOString()}_${category}`;
      const metricRef = db.collection('weekly_metrics').doc(metricId);
      
      const metricData: Partial<WeeklyMetrics> = {
        metricId,
        userId,
        category,
        weekStartDate: Timestamp.fromDate(weekStart),
        weekEndDate: Timestamp.fromDate(weekEnd),
        weekNumber,
        year,
        metricValue,
        metricComponents: {}, // Could store breakdown here
        region,
        gender,
        computedAt: serverTimestamp() as any,
        updatedAt: serverTimestamp() as any,
      };
      
      batch.set(metricRef, metricData, { merge: true });
      batchCount++;
      
      // Commit batch every 500 operations
      if (batchCount >= 500) {
        await batch.commit();
        batchCount = 0;
        logger.info(`Committed batch, processed ${processedCount} users so far`);
      }
    }
    
    processedCount++;
    
    if (processedCount % 100 === 0) {
      logger.info(`Processed ${processedCount}/${usersSnapshot.size} users`);
    }
  }
  
  // Commit remaining operations
  if (batchCount > 0) {
    await batch.commit();
  }
  
  logger.info(`Weekly metrics computation complete. Processed ${processedCount} users.`);
}

// ============================================================================
// LEADERBOARD RANKING CALCULATION
// ============================================================================

/**
 * Calculate rankings for a specific category and period
 */
export async function calculateRankings(
  category: CompetitionCategory,
  period: RankingPeriod,
  weekNumber?: number,
  month?: number,
  year?: number
): Promise<void> {
  logger.info(`Calculating rankings for ${category} (${period})...`);
  
  const now = new Date();
  const currentYear = year || now.getUTCFullYear();
  const currentWeek = weekNumber || getISOWeekNumber(now);
  const currentMonth = month || (now.getUTCMonth() + 1);
  
  // Get weekly metrics for this category and period
  let metricsQuery = db
    .collection('weekly_metrics')
    .where('category', '==', category)
    .where('year', '==', currentYear);
  
  if (period === 'WEEKLY') {
    metricsQuery = metricsQuery.where('weekNumber', '==', currentWeek);
  } else {
    // For monthly, aggregate all weeks in the month
    // This is simplified - in production, you'd need to handle week boundaries
    metricsQuery = metricsQuery.where('weekNumber', '>=', currentMonth * 4 - 3);
  }
  
  const metricsSnapshot = await metricsQuery.get();
  
  // Group by region and gender
  const metricsByRegion: Record<string, Record<string, Array<{userId: string, value: number, userData: any}>>> = {};
  
  for (const doc of metricsSnapshot.docs) {
    const data = doc.data();
    const region = data.region || 'GLOBAL';
    const gender = data.gender || 'all';
    
    if (!metricsByRegion[region]) {
      metricsByRegion[region] = {};
    }
    if (!metricsByRegion[region][gender]) {
      metricsByRegion[region][gender] = [];
    }
    
    // Get user data
    const userDoc = await db.collection('users').doc(data.userId).get();
    const userData = userDoc.data();
    
    metricsByRegion[region][gender].push({
      userId: data.userId,
      value: data.metricValue,
      userData,
    });
  }
  
  // Calculate rankings for each region/gender combination
  const batch = db.batch();
  let batchCount = 0;
  
  for (const [region, genderGroups] of Object.entries(metricsByRegion)) {
    for (const [gender, metrics] of Object.entries(genderGroups)) {
      // Sort by metric value (descending)
      metrics.sort((a, b) => b.value - a.value);
      
      // Assign ranks
      for (let i = 0; i < metrics.length; i++) {
        const rank = i + 1;
        const metric = metrics[i];
        
        // Get previous ranking if exists
        const previousRankingSnapshot = await db
          .collection('leaderboard_rankings')
          .where('userId', '==', metric.userId)
          .where('category', '==', category)
          .where('region', '==', region)
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();
        
        const previousRank = previousRankingSnapshot.empty
          ? null
          : previousRankingSnapshot.docs[0].data().rank;
        
        const rankChange = previousRank ? previousRank - rank : 0;
        
        // Create ranking document
        const rankingId = `${category}_${period}_${region}_${gender}_${metric.userId}`;
        const rankingRef = db.collection('leaderboard_rankings').doc(rankingId);
        
        const expiresAt = new Date();
        if (period === 'WEEKLY') {
          expiresAt.setDate(expiresAt.getDate() + 7);
        } else {
          expiresAt.setMonth(expiresAt.getMonth() + 1);
        }
        
        const rankingData: Partial<LeaderboardRanking> = {
          rankingId,
          userId: metric.userId,
          category,
          period,
          weekNumber: period === 'WEEKLY' ? currentWeek : undefined,
          month: period === 'MONTHLY' ? currentMonth : undefined,
          year: currentYear,
          region,
          gender: gender as any,
          rank,
          metricValue: metric.value,
          previousRank,
          rankChange,
          userName: metric.userData?.displayName || metric.userData?.name || 'User',
          userProfilePicture: metric.userData?.profilePicture || '',
          userBadges: metric.userData?.badges || [],
          isActive: true,
          expiresAt: Timestamp.fromDate(expiresAt),
          createdAt: serverTimestamp() as any,
          updatedAt: serverTimestamp() as any,
        };
        
        batch.set(rankingRef, rankingData, { merge: true });
        batchCount++;
        
        // Distribute rewards for top 10
        if (rank <= TOP_RANKS_TO_REWARD) {
          await distributeRewards(metric.userId, category, rank, period, currentWeek, currentMonth, currentYear, region);
        }
        
        // Send ego-safe notification
        await sendPositiveNotification(metric.userId, category, rank, rankChange);
        
        if (batchCount >= 500) {
          await batch.commit();
          batchCount = 0;
        }
      }
    }
  }
  
  if (batchCount > 0) {
    await batch.commit();
  }
  
  logger.info(`Rankings calculated for ${category}`);
}

// ============================================================================
// VISIBILITY REWARD DISTRIBUTION
// ============================================================================

/**
 * Distribute visibility rewards based on rank
 */
async function distributeRewards(
  userId: string,
  category: CompetitionCategory,
  rank: number,
  period: RankingPeriod,
  weekNumber: number,
  month: number,
  year: number,
  region: string
): Promise<void> {
  const rewardTypes = REWARD_TIERS[rank] || [];
  
  for (const rewardType of rewardTypes) {
    const durationHours = REWARD_DURATIONS[rewardType];
    const rewardId = `${userId}_${rewardType}_${Date.now()}`;
    
    const activatedAt = new Date();
    const expiresAt = new Date(activatedAt);
    expiresAt.setHours(expiresAt.getHours() + durationHours);
    
    const rewardData: Partial<VisibilityReward> = {
      rewardId,
      userId,
      rewardType,
      category,
      rank,
      durationHours,
      isActive: true,
      activatedAt: Timestamp.fromDate(activatedAt),
      expiresAt: Timestamp.fromDate(expiresAt),
      region,
      period,
      weekNumber: period === 'WEEKLY' ? weekNumber : undefined,
      month: period === 'MONTHLY' ? month : undefined,
      year,
      createdAt: serverTimestamp() as any,
    };
    
    await db.collection('visibility_rewards').doc(rewardId).set(rewardData);
    
    // Create badge if TOP_BADGE reward
    if (rewardType === 'TOP_BADGE') {
      await createLeaderboardBadge(userId, category, rank, period, weekNumber, month, year);
    }
    
    logger.info(`Distributed ${rewardType} to user ${userId} (rank ${rank})`);
  }
}

/**
 * Create leaderboard badge
 */
async function createLeaderboardBadge(
  userId: string,
  category: CompetitionCategory,
  rank: number,
  period: RankingPeriod,
  weekNumber: number,
  month: number,
  year: number
): Promise<void> {
  const badgeId = `${userId}_${category}`;
  
  const badgeLabels: Record<CompetitionCategory, string> = {
    TOP_ATTRACTION_STARS: '⭐ Top Attraction Star',
    TOP_EARNERS: '🏆 Top Earner',
    TOP_CHARISMA: '✨ Top Charisma',
    TOP_CONVERSATION_ENERGY: '💬 Conversation Energy',
    TOP_DISCOVERIES: '🚀 Rising Star',
    TOP_POPULAR_IN_CITY: '🌟 City Popular',
    TOP_SAFE_DATES: '🛡️ Safe Date Master',
  };
  
  const badgeColors: Record<number, string> = {
    1: '#FFD700', // Gold
    2: '#C0C0C0', // Silver
    3: '#CD7F32', // Bronze
  };
  
  const activatedAt = new Date();
  const expiresAt = new Date(activatedAt);
  expiresAt.setDate(expiresAt.getDate() + 14); // 14 days
  
  const badgeData: Partial<LeaderboardBadge> = {
    badgeId,
    userId,
    category,
    badgeLabel: badgeLabels[category],
    badgeColor: badgeColors[rank] || '#4A90E2',
    rank,
    isActive: true,
    activatedAt: Timestamp.fromDate(activatedAt),
    expiresAt: Timestamp.fromDate(expiresAt),
    period,
    weekNumber: period === 'WEEKLY' ? weekNumber : undefined,
    month: period === 'MONTHLY' ? month : undefined,
    year,
    createdAt: serverTimestamp() as any,
  };
  
  await db.collection('leaderboard_badges').doc(badgeId).set(badgeData);
}

// ============================================================================
// EGO-SAFE NOTIFICATIONS
// ============================================================================

/**
 * Send positive notification to user (no shaming, only encouragement)
 */
async function sendPositiveNotification(
  userId: string,
  category: CompetitionCategory,
  rank: number,
  rankChange: number
): Promise<void> {
  // Determine notification type and message
  let type: LeaderboardNotification['type'] = 'USERS_LOVE_ENERGY';
  let title = '';
  let message = '';
  
  if (rank <= 3) {
    type = 'TRENDING_IN_CITY';
    title = "You're trending! 🔥";
    message = `You're ranked #${rank} this week. Keep up the amazing energy!`;
  } else if (rankChange > 5) {
    type = 'RISING_FAST';
    title = "You're rising fast! 🚀";
    message = "You've climbed significantly this week. Avalo users love your vibe!";
  } else if (rank <= 10) {
    type = 'USERS_LOVE_ENERGY';
    title = "Avalo users love your energy! ⚡";
    message = `You're in the top ${rank} this week. Your presence makes a difference!`;
  } else {
    // Don't send notifications outside top 10
    return;
  }
  
  const notificationId = `${userId}_${category}_${Date.now()}`;
  const notificationData: Partial<LeaderboardNotification> = {
    notificationId,
    userId,
    type,
    title,
    message,
    category,
    rank,
    read: false,
    createdAt: serverTimestamp() as any,
  };
  
  await db
    .collection('users')
    .doc(userId)
    .collection('leaderboard_notifications')
    .doc(notificationId)
    .set(notificationData);
}

// ============================================================================
// WEEKLY RESET TRIGGER
// ============================================================================

/**
 * Weekly reset - runs every Sunday at 23:59 UTC
 */
export async function weeklyReset(): Promise<void> {
  logger.info('Starting weekly reset...');
  
  const now = new Date();
  const categories: CompetitionCategory[] = [
    'TOP_ATTRACTION_STARS',
    'TOP_EARNERS',
    'TOP_CHARISMA',
    'TOP_CONVERSATION_ENERGY',
    'TOP_DISCOVERIES',
    'TOP_POPULAR_IN_CITY',
    'TOP_SAFE_DATES',
  ];
  
  // First, compute weekly metrics
  await computeWeeklyMetrics();
  
  // Then, calculate rankings for each category
  for (const category of categories) {
    await calculateRankings(category, 'WEEKLY');
  }
  
  // Expire old rankings
  await expireOldRankings();
  
  // Deactivate expired rewards
  await deactivateExpiredRewards();
  
  logger.info('Weekly reset complete');
}

// ============================================================================
// MONTHLY SUMMARY
// ============================================================================

/**
 * Monthly summary - runs on 1st of each month
 */
export async function monthlyReset(): Promise<void> {
  logger.info('Starting monthly reset...');
  
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-11, so previous month
  
  const categories: CompetitionCategory[] = [
    'TOP_ATTRACTION_STARS',
    'TOP_EARNERS',
    'TOP_CHARISMA',
    'TOP_CONVERSATION_ENERGY',
    'TOP_DISCOVERIES',
    'TOP_POPULAR_IN_CITY',
    'TOP_SAFE_DATES',
  ];
  
  // Calculate monthly rankings
  for (const category of categories) {
    await calculateRankings(category, 'MONTHLY', undefined, month + 1, year);
    await publishMonthlySummary(category, year, month + 1);
  }
  
  logger.info('Monthly reset complete');
}

/**
 * Publish monthly summary
 */
async function publishMonthlySummary(
  category: CompetitionCategory,
  year: number,
  month: number
): Promise<void> {
  // Get top 10 performers for the month
  const rankingsSnapshot = await db
    .collection('leaderboard_rankings')
    .where('category', '==', category)
    .where('period', '==', 'MONTHLY')
    .where('year', '==', year)
    .where('month', '==', month)
    .orderBy('rank', 'asc')
    .limit(10)
    .get();
  
  const topPerformers = rankingsSnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      rank: data.rank,
      userId: data.userId,
      userName: data.userName,
      metricValue: data.metricValue,
      region: data.region,
    };
  });
  
  // Get statistics
  const allRankingsSnapshot = await db
    .collection('leaderboard_rankings')
    .where('category', '==', category)
    .where('period', '==', 'MONTHLY')
    .where('year', '==', year)
    .where('month', '==', month)
    .get();
  
  const totalParticipants = allRankingsSnapshot.size;
  let totalMetricValue = 0;
  let highestMetricValue = 0;
  const regionBreakdown: Record<string, number> = {};
  
  allRankingsSnapshot.forEach((doc) => {
    const data = doc.data();
    totalMetricValue += data.metricValue;
    if (data.metricValue > highestMetricValue) {
      highestMetricValue = data.metricValue;
    }
    
    const region = data.region || 'GLOBAL';
    regionBreakdown[region] = (regionBreakdown[region] || 0) + 1;
  });
  
  const averageMetricValue = totalParticipants > 0 ? totalMetricValue / totalParticipants : 0;
  
  // Get previous month for growth calculation
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  
  const prevRankingsSnapshot = await db
    .collection('leaderboard_rankings')
    .where('category', '==', category)
    .where('period', '==', 'MONTHLY')
    .where('year', '==', prevYear)
    .where('month', '==', prevMonth)
    .count()
    .get();
  
  const prevParticipants = prevRankingsSnapshot.data().count;
  const monthOverMonthGrowth = prevParticipants > 0
    ? ((totalParticipants - prevParticipants) / prevParticipants) * 100
    : 0;
  
  // Create summary
  const summaryId = `${year}_${month}_${category}`;
  const periodStartDate = new Date(year, month - 1, 1);
  const periodEndDate = new Date(year, month, 0, 23, 59, 59);
  
  const summaryData: Partial<MonthlySummary> = {
    summaryId,
    year,
    month,
    category,
    topPerformers,
    totalParticipants,
    averageMetricValue,
    highestMetricValue,
    monthOverMonthGrowth,
    regionBreakdown,
    publishedAt: serverTimestamp() as any,
    periodStartDate: Timestamp.fromDate(periodStartDate),
    periodEndDate: Timestamp.fromDate(periodEndDate),
  };
  
  await db.collection('monthly_summaries').doc(summaryId).set(summaryData);
  
  logger.info(`Published monthly summary for ${category}`);
}

// ============================================================================
// CLEANUP FUNCTIONS
// ============================================================================

/**
 * Expire old rankings
 */
async function expireOldRankings(): Promise<void> {
  const now = Timestamp.now();
  
  const expiredSnapshot = await db
    .collection('leaderboard_rankings')
    .where('isActive', '==', true)
    .where('expiresAt', '<', now)
    .get();
  
  const batch = db.batch();
  expiredSnapshot.forEach((doc) => {
    batch.update(doc.ref, { isActive: false, updatedAt: serverTimestamp() as any });
  });
  
  await batch.commit();
  logger.info(`Expired ${expiredSnapshot.size} old rankings`);
}

/**
 * Deactivate expired rewards
 */
async function deactivateExpiredRewards(): Promise<void> {
  const now = Timestamp.now();
  
  const expiredSnapshot = await db
    .collection('visibility_rewards')
    .where('isActive', '==', true)
    .where('expiresAt', '<', now)
    .get();
  
  const batch = db.batch();
  expiredSnapshot.forEach((doc) => {
    batch.update(doc.ref, {
      isActive: false,
      deactivatedAt: serverTimestamp() as any,
    });
  });
  
  await batch.commit();
  logger.info(`Deactivated ${expiredSnapshot.size} expired rewards`);
  
  // Also expire badges
  const expiredBadgesSnapshot = await db
    .collection('leaderboard_badges')
    .where('isActive', '==', true)
    .where('expiresAt', '<', now)
    .get();
  
  const badgeBatch = db.batch();
  expiredBadgesSnapshot.forEach((doc) => {
    badgeBatch.update(doc.ref, {
      isActive: false,
      deactivatedAt: serverTimestamp() as any,
    });
  });
  
  await badgeBatch.commit();
  logger.info(`Deactivated ${expiredBadgesSnapshot.size} expired badges`);
}