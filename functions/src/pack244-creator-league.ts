/**
 * PACK 244 - Top Creator League
 * Cloud Functions for prestige-based monthly ranking system
 *
 * NON-NEGOTIABLE ECONOMICS (UNCHANGED):
 * - Does NOT modify 100-500 token chat pricing
 * - Does NOT modify 11/7 billing system
 * - Does NOT modify 65/35 revenue split
 * - Does NOT modify call pricing (10/20 tokens/min)
 * - Does NOT give tokens, discounts, or financial bonuses
 *
 * ONLY PROVIDES: Prestige privileges and visibility boosts
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp } from './init';
import { FieldValue } from 'firebase-admin/firestore';
import type {
  CreatorLeague,
  EarningsScoreFactors,
  TimeEfficiencyMetrics,
  ReplyQualityMetrics,
  ConversionMetrics,
  LeagueCategory,
  LeagueBadges,
  LeagueRanking,
  LeagueRankEntry,
  LeagueSafetyCheck,
  LeagueIneligibilityReason,
  LeaguePrivileges,
  HallOfFameAchievement,
} from '../../shared/src/types/creatorLeague';

const logger = functions.logger;

// ============================================================================
// CONSTANTS
// ============================================================================

const NEW_CREATOR_THRESHOLD_DAYS = 60;
const LARGE_CITY_MIN_POPULATION = 500000; // Cities with 500k+ population get their own league

// Multiplier ranges (pack specification)
const TIME_EFFICIENCY_RANGE = { min: 1.0, max: 2.0 };
const REPLY_QUALITY_RANGE = { min: 1.0, max: 1.5 };
const CONVERSION_RANGE = { min: 1.0, max: 1.3 };

// Fast reply threshold (under 60 seconds)
const FAST_REPLY_THRESHOLD_SECONDS = 60;

// ============================================================================
// EARNINGS SCORE CALCULATION
// ============================================================================

/**
 * Calculate earnings score for a creator based on pack specifications
 * Score = tokensEarned * timeEfficiency * replyQuality * conversion
 */
async function calculateEarningsScore(
  userId: string,
  month: string // Format: "2025-01"
): Promise<number> {
  try {
    // Get tokens earned this month
    const tokensEarned = await getMonthlyTokensEarned(userId, month);
    
    if (tokensEarned === 0) {
      return 0;
    }
    
    // Calculate multipliers
    const timeEfficiency = await calculateTimeEfficiencyMultiplier(userId, month);
    const replyQuality = await calculateReplyQualityMultiplier(userId, month);
    const conversion = await calculateConversionMultiplier(userId, month);
    
    // Calculate final score
    const score = tokensEarned * timeEfficiency * replyQuality * conversion;
    
    // Store metrics for transparency
    await storeLeagueMetrics(userId, month, {
      tokensEarned,
      timeEfficiencyMultiplier: timeEfficiency,
      replyQualityMultiplier: replyQuality,
      conversionMultiplier: conversion,
      finalScore: score,
    });
    
    logger.info(`Calculated earnings score for ${userId}`, {
      tokensEarned,
      timeEfficiency,
      replyQuality,
      conversion,
      score,
    });
    
    return score;
  } catch (error) {
    logger.error(`Error calculating earnings score for ${userId}:`, error);
    return 0;
  }
}

/**
 * Get total tokens earned by creator in a given month
 */
async function getMonthlyTokensEarned(userId: string, month: string): Promise<number> {
  try {
    // Parse month to get date range
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);
    
    // Query token_earn_events for this creator in this month
    const eventsSnapshot = await db
      .collection('token_earn_events')
      .where('userId', '==', userId)
      .where('createdAt', '>=', startDate)
      .where('createdAt', '<=', endDate)
      .get();
    
    let total = 0;
    eventsSnapshot.forEach(doc => {
      const event = doc.data();
      total += event.tokensEarned || 0;
    });
    
    return total;
  } catch (error) {
    logger.error(`Error getting monthly tokens for ${userId}:`, error);
    return 0;
  }
}

/**
 * Calculate time efficiency multiplier (1.0 - 2.0)
 * Rewards fast reply times
 */
async function calculateTimeEfficiencyMultiplier(
  userId: string,
  month: string
): Promise<number> {
  try {
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);
    
    // Get all messages sent by creator in this month
    const messagesSnapshot = await db
      .collection('messages')
      .where('senderId', '==', userId)
      .where('createdAt', '>=', startDate)
      .where('createdAt', '<=', endDate)
      .orderBy('createdAt', 'asc')
      .get();
    
    if (messagesSnapshot.empty) {
      return TIME_EFFICIENCY_RANGE.min;
    }
    
    let totalReplyTime = 0;
    let replyCount = 0;
    let fastReplies = 0;
    
    // Calculate average reply time
    const messages = messagesSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        senderId: data.senderId,
        createdAt: data.createdAt,
        ...data,
      };
    });
    
    for (let i = 1; i < messages.length; i++) {
      const prevMsg = messages[i - 1];
      const currentMsg = messages[i];
      
      // Only count replies to other users (not self-replies)
      if (prevMsg.senderId !== currentMsg.senderId) {
        const replyTime = (currentMsg.createdAt?.toMillis() - prevMsg.createdAt?.toMillis()) / 1000;
        totalReplyTime += replyTime;
        replyCount++;
        
        if (replyTime < FAST_REPLY_THRESHOLD_SECONDS) {
          fastReplies++;
        }
      }
    }
    
    if (replyCount === 0) {
      return TIME_EFFICIENCY_RANGE.min;
    }
    
    const avgReplyTime = totalReplyTime / replyCount;
    const fastReplyRate = fastReplies / replyCount;
    
    // Calculate multiplier based on fast reply rate
    // 100% fast replies = 2.0x, 0% fast replies = 1.0x
    const multiplier = TIME_EFFICIENCY_RANGE.min + 
      (fastReplyRate * (TIME_EFFICIENCY_RANGE.max - TIME_EFFICIENCY_RANGE.min));
    
    return Math.min(TIME_EFFICIENCY_RANGE.max, Math.max(TIME_EFFICIENCY_RANGE.min, multiplier));
  } catch (error) {
    logger.error(`Error calculating time efficiency for ${userId}:`, error);
    return TIME_EFFICIENCY_RANGE.min;
  }
}

/**
 * Calculate reply quality multiplier (1.0 - 1.5)
 * Rewards longer, more engaging conversations
 */
async function calculateReplyQualityMultiplier(
  userId: string,
  month: string
): Promise<number> {
  try {
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);
    
    // Get all conversations where creator participated
    const conversationsSnapshot = await db
      .collection('conversations')
      .where('participants', 'array-contains', userId)
      .where('lastMessageAt', '>=', startDate)
      .where('lastMessageAt', '<=', endDate)
      .get();
    
    if (conversationsSnapshot.empty) {
      return REPLY_QUALITY_RANGE.min;
    }
    
    let conversationsStarted = 0;
    let conversationsCompleted = 0;
    
    // A "completed" conversation has > 5 messages from each side
    for (const doc of conversationsSnapshot.docs) {
      const conversation = doc.data();
      conversationsStarted++;
      
      // Count messages from each participant
      const messagesSnapshot = await db
        .collection('messages')
        .where('conversationId', '==', doc.id)
        .get();
      
      const messageCounts = new Map<string, number>();
      messagesSnapshot.forEach(msgDoc => {
        const msg = msgDoc.data();
        messageCounts.set(msg.senderId, (messageCounts.get(msg.senderId) || 0) + 1);
      });
      
      // Check if both sides sent > 5 messages
      const counts = Array.from(messageCounts.values());
      if (counts.length >= 2 && counts.every(count => count > 5)) {
        conversationsCompleted++;
      }
    }
    
    const retentionRate = conversationsCompleted / conversationsStarted;
    
    // Calculate multiplier based on retention rate
    // 100% retention = 1.5x, 0% retention = 1.0x
    const multiplier = REPLY_QUALITY_RANGE.min + 
      (retentionRate * (REPLY_QUALITY_RANGE.max - REPLY_QUALITY_RANGE.min));
    
    return Math.min(REPLY_QUALITY_RANGE.max, Math.max(REPLY_QUALITY_RANGE.min, multiplier));
  } catch (error) {
    logger.error(`Error calculating reply quality for ${userId}:`, error);
    return REPLY_QUALITY_RANGE.min;
  }
}

/**
 * Calculate conversion multiplier (1.0 - 1.3)
 * Rewards creators who convert chats to calls/bookings
 */
async function calculateConversionMultiplier(
  userId: string,
  month: string
): Promise<number> {
  try {
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);
    
    // Get total chats
    const chatsSnapshot = await db
      .collection('conversations')
      .where('participants', 'array-contains', userId)
      .where('lastMessageAt', '>=', startDate)
      .where('lastMessageAt', '<=', endDate)
      .get();
    
    const totalChats = chatsSnapshot.size;
    
    if (totalChats === 0) {
      return CONVERSION_RANGE.min;
    }
    
    // Get paid calls count
    const callsSnapshot = await db
      .collection('calls')
      .where('creatorId', '==', userId)
      .where('startedAt', '>=', startDate)
      .where('startedAt', '<=', endDate)
      .where('status', '==', 'completed')
      .get();
    
    const callsCount = callsSnapshot.size;
    
    // Get bookings count (if events/bookings collection exists)
    let bookingsCount = 0;
    try {
      const bookingsSnapshot = await db
        .collection('bookings')
        .where('creatorId', '==', userId)
        .where('createdAt', '>=', startDate)
        .where('createdAt', '<=', endDate)
        .where('status', 'in', ['confirmed', 'completed'])
        .get();
      
      bookingsCount = bookingsSnapshot.size;
    } catch (error) {
      // Bookings collection may not exist
      logger.debug('Bookings collection not found or error:', error);
    }
    
    const conversionRate = (callsCount + bookingsCount) / totalChats;
    
    // Calculate multiplier based on conversion rate
    // 30%+ conversion = 1.3x, 0% conversion = 1.0x
    const targetConversionRate = 0.3;
    const normalizedRate = Math.min(conversionRate / targetConversionRate, 1.0);
    
    const multiplier = CONVERSION_RANGE.min + 
      (normalizedRate * (CONVERSION_RANGE.max - CONVERSION_RANGE.min));
    
    return Math.min(CONVERSION_RANGE.max, Math.max(CONVERSION_RANGE.min, multiplier));
  } catch (error) {
    logger.error(`Error calculating conversion for ${userId}:`, error);
    return CONVERSION_RANGE.min;
  }
}

/**
 * Store league metrics for transparency
 */
async function storeLeagueMetrics(
  userId: string,
  month: string,
  metrics: any
): Promise<void> {
  try {
    await db.collection('creator_league_metrics').doc(`${userId}_${month}`).set({
      userId,
      month,
      ...metrics,
      calculatedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logger.error(`Error storing league metrics for ${userId}:`, error);
  }
}

// ============================================================================
// RANKING CALCULATION
// ============================================================================

/**
 * Calculate rankings for all creators in a given month
 * Scheduled function runs daily at 2 AM UTC
 */
export const calculateDailyRankings = functions.pubsub
  .schedule('0 2 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    logger.info('Starting daily creator league rankings calculation');
    
    try {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      
      await calculateRankingsForMonth(month);
      
      logger.info('Daily rankings calculation completed successfully');
    } catch (error) {
      logger.error('Error calculating daily rankings:', error);
      throw error;
    }
  });

/**
 * Calculate rankings for a specific month
 */
async function calculateRankingsForMonth(month: string): Promise<void> {
  logger.info(`Calculating rankings for month: ${month}`);
  
  // Get all creators
  const creatorsSnapshot = await db
    .collection('users')
    .where('roles', 'array-contains', 'creator')
    .get();
  
  logger.info(`Found ${creatorsSnapshot.size} creators`);
  
  // Calculate scores for all creators
  const creatorScores: Array<{
    userId: string;
    score: number;
    userData: any;
  }> = [];
  
  for (const creatorDoc of creatorsSnapshot.docs) {
    const userId = creatorDoc.id;
    const userData = creatorDoc.data();
    
    // Check safety eligibility
    const isEligible = await checkSafetyEligibility(userId);
    
    if (!isEligible) {
      logger.info(`Creator ${userId} not eligible for league`);
      continue;
    }
    
    // Calculate earnings score
    const score = await calculateEarningsScore(userId, month);
    
    creatorScores.push({
      userId,
      score,
      userData,
    });
  }
  
  // Sort by score descending
  creatorScores.sort((a, b) => b.score - a.score);
  
  // Calculate rankings by category
  await calculateGlobalRankings(month, creatorScores);
  await calculateCountryRankings(month, creatorScores);
  await calculateCityRankings(month, creatorScores);
  await calculateNewCreatorRankings(month, creatorScores);
  
  logger.info('Rankings calculation completed');
}

/**
 * Calculate global rankings
 */
async function calculateGlobalRankings(
  month: string,
  creatorScores: Array<{ userId: string; score: number; userData: any }>
): Promise<void> {
  logger.info('Calculating global rankings');
  
  const rankings: LeagueRankEntry[] = [];
  
  for (let i = 0; i < creatorScores.length; i++) {
    const creator = creatorScores[i];
    const rank = i + 1;
    
    rankings.push({
      rank,
      userId: creator.userId,
      displayName: creator.userData.displayName || creator.userData.username || 'Unknown',
      avatar: creator.userData.photoURL || creator.userData.avatar || '',
      earningsScore: creator.score,
      badges: determineBadges(rank),
      isNewCreator: await isNewCreator(creator.userId),
      country: creator.userData.location?.country,
      city: creator.userData.location?.city,
    });
    
    // Update creator's league document
    await updateCreatorLeague(creator.userId, month, {
      globalRank: rank,
      earningsScore: creator.score,
      badges: determineBadges(rank),
    });
    
    // Award privileges for top ranks
    if (rank <= 100) {
      await awardPrivileges(creator.userId, rank, 'global', month);
    }
  }
  
  // Store rankings
  await db.collection('league_rankings').doc(`global_${month}`).set({
    id: `global_${month}`,
    category: 'global' as LeagueCategory,
    month,
    rankings,
    lastUpdatedAt: new Date().toISOString(),
    nextResetAt: getNextMonthResetDate(month).toISOString(),
  });
  
  logger.info(`Global rankings stored: ${rankings.length} creators`);
}

/**
 * Calculate country-specific rankings
 */
async function calculateCountryRankings(
  month: string,
  creatorScores: Array<{ userId: string; score: number; userData: any }>
): Promise<void> {
  logger.info('Calculating country rankings');
  
  // Group by country
  const byCountry = new Map<string, Array<{ userId: string; score: number; userData: any }>>();
  
  for (const creator of creatorScores) {
    const country = creator.userData.location?.country;
    if (country) {
      if (!byCountry.has(country)) {
        byCountry.set(country, []);
      }
      byCountry.get(country)!.push(creator);
    }
  }
  
  // Calculate rankings for each country
  for (const [country, creators] of Array.from(byCountry.entries())) {
    creators.sort((a, b) => b.score - a.score);
    
    const rankings: LeagueRankEntry[] = [];
    
    for (let i = 0; i < creators.length; i++) {
      const creator = creators[i];
      const rank = i + 1;
      
      rankings.push({
        rank,
        userId: creator.userId,
        displayName: creator.userData.displayName || creator.userData.username || 'Unknown',
        avatar: creator.userData.photoURL || creator.userData.avatar || '',
        earningsScore: creator.score,
        badges: determineBadges(rank),
        isNewCreator: await isNewCreator(creator.userId),
        country: creator.userData.location?.country,
        city: creator.userData.location?.city,
      });
      
      // Update creator's league document
      await updateCreatorLeague(creator.userId, month, {
        countryRank: rank,
      });
    }
    
    // Store rankings
    await db.collection('league_rankings').doc(`country_${country}_${month}`).set({
      id: `country_${country}_${month}`,
      category: 'country' as LeagueCategory,
      month,
      country,
      rankings,
      lastUpdatedAt: new Date().toISOString(),
      nextResetAt: getNextMonthResetDate(month).toISOString(),
    });
  }
  
  logger.info(`Country rankings calculated for ${byCountry.size} countries`);
}

/**
 * Calculate city-specific rankings (for large cities only)
 */
async function calculateCityRankings(
  month: string,
  creatorScores: Array<{ userId: string; score: number; userData: any }>
): Promise<void> {
  logger.info('Calculating city rankings');
  
  // Group by city (only large cities)
  const byCity = new Map<string, Array<{ userId: string; score: number; userData: any }>>();
  
  for (const creator of creatorScores) {
    const city = creator.userData.location?.city;
    if (city) {
      if (!byCity.has(city)) {
        byCity.set(city, []);
      }
      byCity.get(city)!.push(creator);
    }
  }
  
  // Calculate rankings for cities with enough creators (min 10)
  for (const [city, creators] of Array.from(byCity.entries())) {
    if (creators.length < 10) {
      continue; // Skip small cities
    }
    
    creators.sort((a, b) => b.score - a.score);
    
    const rankings: LeagueRankEntry[] = [];
    
    for (let i = 0; i < creators.length; i++) {
      const creator = creators[i];
      const rank = i + 1;
      
      rankings.push({
        rank,
        userId: creator.userId,
        displayName: creator.userData.displayName || creator.userData.username || 'Unknown',
        avatar: creator.userData.photoURL || creator.userData.avatar || '',
        earningsScore: creator.score,
        badges: determineBadges(rank),
        isNewCreator: await isNewCreator(creator.userId),
        country: creator.userData.location?.country,
        city: creator.userData.location?.city,
      });
      
      // Update creator's league document
      await updateCreatorLeague(creator.userId, month, {
        cityRank: rank,
      });
    }
    
    // Store rankings
    await db.collection('league_rankings').doc(`city_${city}_${month}`).set({
      id: `city_${city}_${month}`,
      category: 'city' as LeagueCategory,
      month,
      city,
      rankings,
      lastUpdatedAt: new Date().toISOString(),
      nextResetAt: getNextMonthResetDate(month).toISOString(),
    });
  }
  
  logger.info(`City rankings calculated for ${byCity.size} cities`);
}

/**
 * Calculate new creator rankings (< 60 days old)
 */
async function calculateNewCreatorRankings(
  month: string,
  creatorScores: Array<{ userId: string; score: number; userData: any }>
): Promise<void> {
  logger.info('Calculating new creator rankings');
  
  const newCreators = [];
  
  for (const creator of creatorScores) {
    if (await isNewCreator(creator.userId)) {
      newCreators.push(creator);
    }
  }
  
  newCreators.sort((a, b) => b.score - a.score);
  
  const rankings: LeagueRankEntry[] = [];
  
  for (let i = 0; i < newCreators.length; i++) {
    const creator = newCreators[i];
    const rank = i + 1;
    
    rankings.push({
      rank,
      userId: creator.userId,
      displayName: creator.userData.displayName || creator.userData.username || 'Unknown',
      avatar: creator.userData.photoURL || creator.userData.avatar || '',
      earningsScore: creator.score,
      badges: determineBadges(rank),
      isNewCreator: true,
      country: creator.userData.location?.country,
      city: creator.userData.location?.city,
    });
    
    // Update creator's league document
    await updateCreatorLeague(creator.userId, month, {
      newCreatorRank: rank,
    });
  }
  
  // Store rankings
  await db.collection('league_rankings').doc(`newCreator_${month}`).set({
    id: `newCreator_${month}`,
    category: 'newCreator' as LeagueCategory,
    month,
    rankings,
    lastUpdatedAt: new Date().toISOString(),
    nextResetAt: getNextMonthResetDate(month).toISOString(),
  });
  
  logger.info(`New creator rankings stored: ${rankings.length} creators`);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if creator is new (< 60 days)
 */
async function isNewCreator(userId: string): Promise<boolean> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return false;
    
    const userData = userDoc.data()!;
    const createdAt = userData.createdAt?.toDate?.() || new Date(userData.createdAt);
    const daysSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    
    return daysSinceCreation < NEW_CREATOR_THRESHOLD_DAYS;
  } catch (error) {
    logger.error(`Error checking if creator is new: ${userId}`, error);
    return false;
  }
}

/**
 * Determine badges based on rank
 */
function determineBadges(rank: number): LeagueBadges {
  return {
    champion: rank === 1,
    top3: rank <= 3,
    top10: rank <= 10,
    top20: rank <= 20,
    top50: rank <= 50,
    top100: rank <= 100,
  };
}

/**
 * Update creator league document
 */
async function updateCreatorLeague(
  userId: string,
  month: string,
  updates: Partial<CreatorLeague>
): Promise<void> {
  try {
    const leagueRef = db.collection('creator_league').doc(userId);
    const leagueDoc = await leagueRef.get();
    
    if (!leagueDoc.exists) {
      // Create new league document
      await leagueRef.set({
        userId,
        countryRank: null,
        cityRank: null,
        globalRank: null,
        newCreatorRank: null,
        earningsScore: 0,
        hallOfFame: {
          months: [],
          achievements: [],
        },
        badges: {
          top100: false,
          top50: false,
          top20: false,
          top10: false,
          top3: false,
          champion: false,
        },
        lastReset: new Date().toISOString(),
        isEligible: true,
        lastCalculatedAt: new Date().toISOString(),
        ...updates,
      });
    } else {
      // Update existing document
      await leagueRef.update({
        ...updates,
        lastCalculatedAt: FieldValue.serverTimestamp(),
      });
    }
  } catch (error) {
    logger.error(`Error updating creator league for ${userId}:`, error);
  }
}

/**
 * Get next month's reset date
 */
function getNextMonthResetDate(currentMonth: string): Date {
  const [year, month] = currentMonth.split('-').map(Number);
  return new Date(year, month, 1, 0, 0, 0, 0); // First day of next month
}

/**
 * Award privileges to top-ranked creators
 */
async function awardPrivileges(
  userId: string,
  rank: number,
  category: LeagueCategory,
  month: string
): Promise<void> {
  try {
    const privileges: LeaguePrivileges = {
      userId,
      rank,
      category,
      hasLeagueBadge: rank <= 100,
      hasProfileBorder: rank <= 50,
      inTopCreatorsStrip: rank <= 20,
      hasBetaAccess: rank <= 10,
      inSpotlight: rank <= 3,
      hasAnimatedCrown: rank === 1,
      expiresAt: getNextMonthResetDate(month).toISOString(),
    };
    
    await db.collection('league_privileges').doc(userId).set(privileges);
    
    // Log audit trail
    await db.collection('league_audit_logs').add({
      userId,
      action: 'privilege_granted',
      newValue: privileges,
      timestamp: new Date().toISOString(),
      performedBy: 'system',
    });
    
    logger.info(`Privileges awarded to ${userId}, rank ${rank}`);
  } catch (error) {
    logger.error(`Error awarding privileges to ${userId}:`, error);
  }
}

// ============================================================================
// SAFETY & ELIGIBILITY CHECKS
// ============================================================================

/**
 * Check if creator is eligible for league participation
 */
async function checkSafetyEligibility(userId: string): Promise<boolean> {
  try {
    // Check 1: No active safety flags
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return false;
    
    const userData = userDoc.data()!;
    
    if (userData.moderation?.status !== 'active') {
      await recordIneligibility(userId, 'safety_flag');
      return false;
    }
    
    // Check 2: No stalker risk flags
    const stalkerCheck = await db
      .collection('user_safety_flags')
      .where('userId', '==', userId)
      .where('type', '==', 'stalker_risk')
      .where('status', '==', 'active')
      .limit(1)
      .get();
    
    if (!stalkerCheck.empty) {
      await recordIneligibility(userId, 'stalker_risk');
      return false;
    }
    
    // Check 3: No fraud/abuse flags
    const fraudCheck = await db
      .collection('fraud_detection')
      .where('userId', '==', userId)
      .where('status', '==', 'flagged')
      .limit(1)
      .get();
    
    if (!fraudCheck.empty) {
      await recordIneligibility(userId, 'fraud_abuse');
      return false;
    }
    
    // Check 4: No artificial manipulation
    const earnings = await getMonthlyTokensEarned(
      userId,
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
    );
    
    // Flag suspicious patterns (e.g., same user paying repeatedly in short time)
    if (earnings > 0) {
      const suspiciousPattern = await detectManipulation(userId);
      if (suspiciousPattern) {
        await recordIneligibility(userId, 'artificial_manipulation');
        return false;
      }
    }
    
    // All checks passed
    await db.collection('league_safety_checks').doc(userId).set({
      userId,
      isEligible: true,
      checkedAt: new Date().toISOString(),
    });
    
    return true;
  } catch (error) {
    logger.error(`Error checking safety eligibility for ${userId}:`, error);
    return false;
  }
}

/**
 * Record ineligibility reason
 */
async function recordIneligibility(
  userId: string,
  reason: LeagueIneligibilityReason
): Promise<void> {
  try {
    await db.collection('league_safety_checks').doc(userId).set({
      userId,
      isEligible: false,
      reason,
      checkedAt: new Date().toISOString(),
    });
    
    // Log audit trail
    await db.collection('league_audit_logs').add({
      userId,
      action: 'eligibility_removed',
      reason,
      timestamp: new Date().toISOString(),
      performedBy: 'system',
    });
  } catch (error) {
    logger.error(`Error recording ineligibility for ${userId}:`, error);
  }
}

/**
 * Detect artificial manipulation patterns
 */
async function detectManipulation(userId: string): Promise<boolean> {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Get recent earnings events
    const eventsSnapshot = await db
      .collection('token_earn_events')
      .where('userId', '==', userId)
      .where('createdAt', '>=', oneDayAgo)
      .get();
    
    // Count payments from same user
    const payerCounts = new Map<string, number>();
    eventsSnapshot.forEach(doc => {
      const event = doc.data();
      const payerId = event.counterpartyId;
      payerCounts.set(payerId, (payerCounts.get(payerId) || 0) + 1);
    });
    
    // Flag if any single payer made > 20 payments in 24 hours
    for (const count of Array.from(payerCounts.values())) {
      if (count > 20) {
        logger.warn(`Suspicious pattern detected for creator ${userId}: ${count} payments from single payer`);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    logger.error(`Error detecting manipulation for ${userId}:`, error);
    return false;
  }
}

// ============================================================================
// MONTHLY RESET & HALL OF FAME
// ============================================================================

/**
 * Monthly reset function - runs on the 1st of each month at 00:00 UTC
 * Archives winners, resets rankings, and starts new competition
 */
export const monthlyLeagueReset = functions.pubsub
  .schedule('0 0 1 * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    logger.info('Starting monthly creator league reset');
    
    try {
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthString = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
      const currentMonthString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      
      logger.info(`Resetting league from ${lastMonthString} to ${currentMonthString}`);
      
      // Step 1: Archive last month's winners to Hall of Fame
      await archiveWinnersToHallOfFame(lastMonthString);
      
      // Step 2: Clear active privileges that expired
      await clearExpiredPrivileges();
      
      // Step 3: Reset all creator league documents
      await resetAllCreatorLeagues(currentMonthString);
      
      // Step 4: Record reset event
      await recordResetEvent(lastMonthString, currentMonthString);
      
      // Step 5: Send congratulatory notifications to winners
      await notifyWinners(lastMonthString);
      
      logger.info('Monthly creator league reset completed successfully');
    } catch (error) {
      logger.error('Error during monthly league reset:', error);
      throw error;
    }
  });

/**
 * Archive winners from last month to Hall of Fame
 */
async function archiveWinnersToHallOfFame(month: string): Promise<void> {
  logger.info(`Archiving winners for month: ${month}`);
  
  const categories: LeagueCategory[] = ['global', 'country', 'city', 'newCreator'];
  
  for (const category of categories) {
    try {
      // Get rankings for this category
      let rankingsQuery = db
        .collection('league_rankings')
        .where('category', '==', category)
        .where('month', '==', month);
      
      const rankingsSnapshot = await rankingsQuery.get();
      
      for (const rankingDoc of rankingsSnapshot.docs) {
        const ranking = rankingDoc.data();
        const rankings = ranking.rankings as LeagueRankEntry[];
        
        // Archive top 100
        for (let i = 0; i < Math.min(100, rankings.length); i++) {
          const entry = rankings[i];
          
          // Create winner record
          await db.collection('league_winners').add({
            userId: entry.userId,
            month,
            category,
            rank: entry.rank,
            earningsScore: entry.earningsScore,
            badge: determineBadgeType(entry.rank),
            archivedAt: new Date().toISOString(),
            country: ranking.country,
            city: ranking.city,
          });
          
          // Update creator's Hall of Fame
          await addToCreatorHallOfFame(entry.userId, month, category, entry.rank);
        }
      }
      
      logger.info(`Archived winners for category: ${category}`);
    } catch (error) {
      logger.error(`Error archiving winners for ${category}:`, error);
    }
  }
}

/**
 * Add achievement to creator's Hall of Fame
 */
async function addToCreatorHallOfFame(
  userId: string,
  month: string,
  category: LeagueCategory,
  rank: number
): Promise<void> {
  try {
    const leagueRef = db.collection('creator_league').doc(userId);
    const leagueDoc = await leagueRef.get();
    
    if (!leagueDoc.exists) {
      logger.warn(`Creator ${userId} has no league document`);
      return;
    }
    
    const leagueData = leagueDoc.data()!;
    const hallOfFame = leagueData.hallOfFame || { months: [], achievements: [] };
    
    // Add month if not already present
    if (!hallOfFame.months.includes(month)) {
      hallOfFame.months.push(month);
    }
    
    // Add achievement
    const achievement: HallOfFameAchievement = {
      month,
      category,
      rank,
      badge: determineBadgeType(rank),
    };
    
    hallOfFame.achievements.push(achievement);
    
    // Update document
    await leagueRef.update({
      hallOfFame,
    });
    
    logger.info(`Added Hall of Fame entry for ${userId}, rank ${rank} in ${category}`);
  } catch (error) {
    logger.error(`Error adding to Hall of Fame for ${userId}:`, error);
  }
}

/**
 * Determine badge type based on rank
 */
function determineBadgeType(rank: number): any {
  if (rank === 1) return 'champion';
  if (rank <= 3) return 'top3';
  if (rank <= 10) return 'top10';
  if (rank <= 20) return 'top20';
  if (rank <= 50) return 'top50';
  return 'top100';
}

/**
 * Clear expired privileges
 */
async function clearExpiredPrivileges(): Promise<void> {
  logger.info('Clearing expired privileges');
  
  try {
    const now = new Date();
    
    // Get all active privileges
    const privilegesSnapshot = await db
      .collection('league_privileges')
      .get();
    
    const batch = db.batch();
    let clearedCount = 0;
    
    for (const doc of privilegesSnapshot.docs) {
      const privilege = doc.data();
      const expiresAt = new Date(privilege.expiresAt);
      
      if (expiresAt <= now) {
        batch.delete(doc.ref);
        clearedCount++;
        
        // Log audit trail
        await db.collection('league_audit_logs').add({
          userId: privilege.userId,
          action: 'privilege_granted',
          oldValue: privilege,
          newValue: null,
          reason: 'Monthly reset - privilege expired',
          timestamp: new Date().toISOString(),
          performedBy: 'system',
        });
      }
    }
    
    await batch.commit();
    logger.info(`Cleared ${clearedCount} expired privileges`);
  } catch (error) {
    logger.error('Error clearing expired privileges:', error);
  }
}

/**
 * Reset all creator league documents for new month
 */
async function resetAllCreatorLeagues(newMonth: string): Promise<void> {
  logger.info(`Resetting all creator league documents for ${newMonth}`);
  
  try {
    const leagueSnapshot = await db.collection('creator_league').get();
    
    const batch = db.batch();
    let resetCount = 0;
    
    for (const doc of leagueSnapshot.docs) {
      // Reset ranks but keep Hall of Fame
      batch.update(doc.ref, {
        countryRank: null,
        cityRank: null,
        globalRank: null,
        newCreatorRank: null,
        earningsScore: 0,
        badges: {
          top100: false,
          top50: false,
          top20: false,
          top10: false,
          top3: false,
          champion: false,
        },
        lastReset: new Date().toISOString(),
        lastCalculatedAt: new Date().toISOString(),
      });
      
      resetCount++;
      
      // Commit in batches of 500
      if (resetCount % 500 === 0) {
        await batch.commit();
        logger.info(`Reset ${resetCount} creator league documents...`);
      }
    }
    
    // Commit remaining
    await batch.commit();
    logger.info(`Reset completed for ${resetCount} creator league documents`);
  } catch (error) {
    logger.error('Error resetting creator leagues:', error);
  }
}

/**
 * Record monthly reset event
 */
async function recordResetEvent(lastMonth: string, newMonth: string): Promise<void> {
  try {
    await db.collection('monthly_reset_events').doc(newMonth).set({
      month: newMonth,
      previousMonth: lastMonth,
      resetAt: new Date().toISOString(),
      winnersArchived: true,
      rankingsCleared: true,
      newLeagueStarted: true,
    });
    
    logger.info(`Reset event recorded for ${newMonth}`);
  } catch (error) {
    logger.error('Error recording reset event:', error);
  }
}

/**
 * Send notifications to last month's winners
 */
async function notifyWinners(month: string): Promise<void> {
  logger.info(`Sending winner notifications for ${month}`);
  
  try {
    // Get all winners (top 100 globally)
    const winnersSnapshot = await db
      .collection('league_winners')
      .where('month', '==', month)
      .where('category', '==', 'global')
      .where('rank', '<=', 100)
      .get();
    
    for (const winnerDoc of winnersSnapshot.docs) {
      const winner = winnerDoc.data();
      
      // Create in-app notification
      await db.collection('notifications').add({
        userId: winner.userId,
        type: 'league_achievement',
        title: getWinnerNotificationTitle(winner.rank),
        message: getWinnerNotificationMessage(winner.rank, month),
        data: {
          rank: winner.rank,
          category: winner.category,
          month,
          badge: winner.badge,
        },
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    
    logger.info(`Sent notifications to ${winnersSnapshot.size} winners`);
  } catch (error) {
    logger.error('Error sending winner notifications:', error);
  }
}

/**
 * Get notification title based on rank
 */
function getWinnerNotificationTitle(rank: number): string {
  if (rank === 1) return '🏆 Champion of the Month!';
  if (rank <= 3) return '🥇 Top 3 Creator!';
  if (rank <= 10) return '⭐ Top 10 Creator!';
  if (rank <= 20) return '🌟 Top 20 Creator!';
  if (rank <= 50) return '💎 Top 50 Creator!';
  return '✨ Top 100 Creator!';
}

/**
 * Get notification message based on rank
 */
function getWinnerNotificationMessage(rank: number, month: string): string {
  const [year, monthNum] = month.split('-');
  const monthName = new Date(parseInt(year), parseInt(monthNum) - 1).toLocaleString('default', { month: 'long' });
  
  return `Congratulations! You ranked #${rank} globally in ${monthName}. Your achievement has been added to your Hall of Fame.`;
}

/**
 * Manual trigger to calculate rankings (for testing or emergency recalculation)
 */
export const manualRecalculateRankings = functions.https.onCall(async (data, context) => {
  // Only allow admins to trigger manual recalculation
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const userData = userDoc.data();
  
  if (!userData?.roles?.includes('admin') && !userData?.roles?.includes('super_admin')) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can trigger manual recalculation');
  }
  
  try {
    const month = data.month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    
    logger.info(`Manual recalculation triggered by ${context.auth.uid} for month ${month}`);
    
    await calculateRankingsForMonth(month);
    
    return {
      success: true,
      message: `Rankings recalculated for ${month}`,
    };
  } catch (error) {
    logger.error('Error in manual recalculation:', error);
    throw new functions.https.HttpsError('internal', 'Failed to recalculate rankings');
  }
});

/**
 * Get leaderboard (publicly callable)
 */
export const getLeaderboard = functions.https.onCall(async (data, context) => {
  try {
    const {
      category = 'global',
      month,
      country,
      city,
      limit = 100,
      offset = 0,
    } = data;
    
    // Default to current month if not specified
    const queryMonth = month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    
    // Build document ID based on category
    let docId = `${category}_${queryMonth}`;
    if (category === 'country' && country) {
      docId = `country_${country}_${queryMonth}`;
    } else if (category === 'city' && city) {
      docId = `city_${city}_${queryMonth}`;
    }
    
    const rankingDoc = await db.collection('league_rankings').doc(docId).get();
    
    if (!rankingDoc.exists) {
      return {
        rankings: [],
        total: 0,
        category,
        month: queryMonth,
        lastUpdatedAt: new Date().toISOString(),
        nextResetAt: getNextMonthResetDate(queryMonth).toISOString(),
      };
    }
    
    const ranking = rankingDoc.data()!;
    const allRankings = ranking.rankings as LeagueRankEntry[];
    
    // Apply pagination
    const paginatedRankings = allRankings.slice(offset, offset + limit);
    
    return {
      rankings: paginatedRankings,
      total: allRankings.length,
      category,
      month: queryMonth,
      lastUpdatedAt: ranking.lastUpdatedAt,
      nextResetAt: ranking.nextResetAt,
    };
  } catch (error) {
    logger.error('Error fetching leaderboard:', error);
    throw new functions.https.HttpsError('internal', 'Failed to fetch leaderboard');
  }
});

/**
 * Get creator's league status (publicly callable)
 */
export const getCreatorLeagueStatus = functions.https.onCall(async (data, context) => {
  try {
    const { userId } = data;
    
    if (!userId) {
      throw new functions.https.HttpsError('invalid-argument', 'userId is required');
    }
    
    const leagueDoc = await db.collection('creator_league').doc(userId).get();
    
    if (!leagueDoc.exists) {
      return {
        exists: false,
        userId,
      };
    }
    
    const leagueData = leagueDoc.data()!;
    
    // Get active privileges
    const privilegesDoc = await db.collection('league_privileges').doc(userId).get();
    const privileges = privilegesDoc.exists ? privilegesDoc.data() : null;
    
    return {
      exists: true,
      userId,
      globalRank: leagueData.globalRank,
      countryRank: leagueData.countryRank,
      cityRank: leagueData.cityRank,
      newCreatorRank: leagueData.newCreatorRank,
      earningsScore: leagueData.earningsScore,
      badges: leagueData.badges,
      hallOfFame: leagueData.hallOfFame,
      privileges,
      isEligible: leagueData.isEligible,
      lastCalculatedAt: leagueData.lastCalculatedAt,
    };
  } catch (error) {
    logger.error('Error fetching creator league status:', error);
    throw new functions.https.HttpsError('internal', 'Failed to fetch league status');
  }
});

// ============================================================================
// EXPORTS FOR USE IN OTHER FUNCTIONS
// ============================================================================

export {
  checkSafetyEligibility,
  updateCreatorLeague,
  awardPrivileges,
};