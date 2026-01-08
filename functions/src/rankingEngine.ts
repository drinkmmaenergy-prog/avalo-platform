/**
 * Phase 11C - Ranking Engine
 * Core logic for creator ranking and leaderboard management
 *
 * IMPORTANT: This module only ADDS new ranking functionality.
 * It does NOT modify ANY existing monetization, chat, call, or payout logic.
 */

import { db, serverTimestamp } from './init';
import type {
  RankingAction,
  RankingScore,
  RankingPeriod,
  RankingSegment,
  GenderFilter,
  CategoryFilter,
  LeaderboardEntry,
  Top10Bonus,
  RankingQuery,
  LeaderboardResponse,
} from './types/ranking';

// ============================================================================
// SCORING TABLE (Business Rules)
// ============================================================================

const SCORING_TABLE = {
  TIP: 1, // 1 point per token
  PAID_CHAT: 1, // 1 point per paid message
  VOICE_CALL: 3, // 3 points per minute
  VIDEO_CALL: 4, // 4 points per minute
  CONTENT_PURCHASE: 1, // 1 point per token
  BOOST: 200, // +200 points for boost on profile
  FIRST_TIME_FAN: 150, // +150 bonus for first-time unique paying fan
} as const;

// ============================================================================
// TIME PERIODS
// ============================================================================

const TIME_PERIODS = {
  DAILY: 24 * 60 * 60 * 1000, // 24 hours
  WEEKLY: 7 * 24 * 60 * 60 * 1000, // 7 days
  MONTHLY: 30 * 24 * 60 * 60 * 1000, // 30 days
} as const;

const TOP_10_BONUS_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// ============================================================================
// RECORD RANKING ACTION
// ============================================================================

/**
 * Record a ranking action and calculate points
 * Called after successful monetization transactions
 */
export async function recordRankingAction(action: RankingAction): Promise<void> {
  try {
    // Store raw action for audit trail
    await db.collection('ranking_actions').add({
      ...action,
      timestamp: serverTimestamp(),
      processed: false,
    });

    // Update scores immediately
    await updateCreatorScores(action);
  } catch (error) {
    // Error recording ranking action - log and throw
    throw error;
  }
}

/**
 * Calculate points for an action based on type
 */
function calculatePoints(action: RankingAction): number {
  switch (action.type) {
    case 'tip':
      return (action.tokensAmount || 0) * SCORING_TABLE.TIP;
    
    case 'paid_chat':
      return SCORING_TABLE.PAID_CHAT; // Per message
    
    case 'voice_call':
      return (action.minutesDuration || 0) * SCORING_TABLE.VOICE_CALL;
    
    case 'video_call':
      return (action.minutesDuration || 0) * SCORING_TABLE.VIDEO_CALL;
    
    case 'content_purchase':
      return (action.tokensAmount || 0) * SCORING_TABLE.CONTENT_PURCHASE;
    
    case 'boost':
      return SCORING_TABLE.BOOST;
    
    case 'first_time_fan':
      return SCORING_TABLE.FIRST_TIME_FAN;
    
    default:
      return 0;
  }
}

// ============================================================================
// UPDATE CREATOR SCORES
// ============================================================================

/**
 * Update creator scores across all periods and segments
 */
async function updateCreatorScores(action: RankingAction): Promise<void> {
  const points = calculatePoints(action);
  
  // Get creator profile for geographic data
  const creatorRef = db.collection('users').doc(action.creatorId);
  const creatorSnap = await creatorRef.get();
  
  if (!creatorSnap.exists) {
    // Creator not found - skip update
    return;
  }
  
  const creatorData = creatorSnap.data();
  const country = creatorData?.location?.country;
  const city = creatorData?.location?.city;
  const gender = creatorData?.gender || 'other';
  
  // Update all period/segment combinations
  const periods: RankingPeriod[] = ['daily', 'weekly', 'monthly', 'lifetime'];
  const segments: RankingSegment[] = ['worldwide', ...(country ? ['country' as RankingSegment] : []), ...(city ? ['city' as RankingSegment] : [])];
  
  for (const period of periods) {
    for (const segment of segments) {
      await updateScore({
        creatorId: action.creatorId,
        period,
        segment,
        points,
        action,
        country,
        city,
        gender: gender as 'male' | 'female' | 'other',
      });
    }
  }
}

/**
 * Update a specific score document
 */
async function updateScore(params: {
  creatorId: string;
  period: RankingPeriod;
  segment: RankingSegment;
  points: number;
  action: RankingAction;
  country?: string;
  city?: string;
  gender: 'male' | 'female' | 'other';
}): Promise<void> {
  const { creatorId, period, segment, points, action, country, city, gender } = params;
  
  // Build score document ID
  const scoreId = `${creatorId}_${period}_${segment}${segment === 'country' ? `_${country}` : ''}${segment === 'city' ? `_${city}` : ''}`;
  const scoreRef = db.collection('ranking_scores').doc(scoreId);
  
  // Get current score
  const scoreSnap = await scoreRef.get();
  
  if (!scoreSnap.exists) {
    // Create new score
    const newScore: RankingScore = {
      creatorId,
      period,
      segment,
      genderFilter: 'all',
      categoryFilter: 'all',
      points,
      tipPoints: action.type === 'tip' ? points : 0,
      chatPoints: action.type === 'paid_chat' ? points : 0,
      voiceCallPoints: action.type === 'voice_call' ? points : 0,
      videoCallPoints: action.type === 'video_call' ? points : 0,
      contentPoints: action.type === 'content_purchase' ? points : 0,
      boostPoints: action.type === 'boost' ? points : 0,
      firstTimeFanPoints: action.type === 'first_time_fan' ? points : 0,
      uniquePayingFans: [action.payerId],
      totalActions: 1,
      lastUpdated: new Date(),
      ...(country && { country }),
      ...(city && { city }),
    };
    
    await scoreRef.set(newScore);
  } else {
    // Update existing score
    const currentScore = scoreSnap.data() as RankingScore;
    const uniqueFans = new Set(currentScore.uniquePayingFans || []);
    uniqueFans.add(action.payerId);
    
    const updates: Partial<RankingScore> = {
      points: (currentScore.points || 0) + points,
      totalActions: (currentScore.totalActions || 0) + 1,
      uniquePayingFans: Array.from(uniqueFans),
      lastUpdated: new Date(),
    };
    
    // Update category-specific points
    switch (action.type) {
      case 'tip':
        updates.tipPoints = (currentScore.tipPoints || 0) + points;
        break;
      case 'paid_chat':
        updates.chatPoints = (currentScore.chatPoints || 0) + points;
        break;
      case 'voice_call':
        updates.voiceCallPoints = (currentScore.voiceCallPoints || 0) + points;
        break;
      case 'video_call':
        updates.videoCallPoints = (currentScore.videoCallPoints || 0) + points;
        break;
      case 'content_purchase':
        updates.contentPoints = (currentScore.contentPoints || 0) + points;
        break;
      case 'boost':
        updates.boostPoints = (currentScore.boostPoints || 0) + points;
        break;
      case 'first_time_fan':
        updates.firstTimeFanPoints = (currentScore.firstTimeFanPoints || 0) + points;
        break;
    }
    
    await scoreRef.update(updates);
  }
  
  // Check for first-time fan bonus
  if (action.type !== 'first_time_fan') {
    await checkFirstTimeFanBonus(creatorId, action.payerId);
  }
}

/**
 * Check and award first-time fan bonus
 */
async function checkFirstTimeFanBonus(creatorId: string, payerId: string): Promise<void> {
  const fanTrackingRef = db.collection('creator_fans').doc(`${creatorId}_${payerId}`);
  const fanTrackingSnap = await fanTrackingRef.get();
  
  if (!fanTrackingSnap.exists) {
    // First time this payer has paid this creator
    await fanTrackingRef.set({
      creatorId,
      payerId,
      firstPaymentAt: serverTimestamp(),
    });
    
    // Award bonus
    await recordRankingAction({
      type: 'first_time_fan',
      creatorId,
      payerId,
      points: SCORING_TABLE.FIRST_TIME_FAN,
      timestamp: new Date(),
    });
  }
}

// ============================================================================
// LEADERBOARD GENERATION
// ============================================================================

/**
 * Generate leaderboard for a specific query
 */
export async function getLeaderboard(query: RankingQuery): Promise<LeaderboardResponse> {
  const {
    period,
    segment = 'worldwide',
    gender = 'all',
    category = 'all',
    country,
    city,
    limit = 100,
    offset = 0,
  } = query;
  
  // Build query
  let scoresQuery = db.collection('ranking_scores')
    .where('period', '==', period)
    .where('segment', '==', segment);
  
  if (segment === 'country' && country) {
    scoresQuery = scoresQuery.where('country', '==', country);
  }
  
  if (segment === 'city' && city) {
    scoresQuery = scoresQuery.where('city', '==', city);
  }
  
  // Order by points (descending) and apply pagination
  scoresQuery = scoresQuery.orderBy('points', 'desc').limit(limit).offset(offset);
  
  const scoresSnap = await scoresQuery.get();
  
  // Build leaderboard entries
  const entries: LeaderboardEntry[] = [];
  let rank = offset + 1;
  
  for (const scoreDoc of scoresSnap.docs) {
    const score = scoreDoc.data() as RankingScore;
    
    // Get creator profile
    const creatorRef = db.collection('users').doc(score.creatorId);
    const creatorSnap = await creatorRef.get();
    
    if (!creatorSnap.exists) continue;
    
    const creator = creatorSnap.data();
    
    // Apply gender filter
    if (gender !== 'all' && creator.gender !== gender) continue;
    
    // Apply category filter
    let categoryPoints = score.points;
    if (category === 'video') {
      categoryPoints = score.videoCallPoints || 0;
    } else if (category === 'chat') {
      categoryPoints = score.chatPoints || 0;
    } else if (category === 'tips') {
      categoryPoints = score.tipPoints || 0;
    } else if (category === 'content') {
      categoryPoints = score.contentPoints || 0;
    }
    
    // Build entry
    const entry: LeaderboardEntry = {
      rank,
      creatorId: score.creatorId,
      displayName: creator.displayName || creator.name || 'Unknown',
      avatar: creator.avatar || creator.profilePicture,
      gender: creator.gender || 'other',
      points: category === 'all' ? score.points : categoryPoints,
      badges: {
        royal: creator.roles?.royal || false,
        vip: creator.roles?.vip || false,
        influencer: creator.influencerBadge || false,
        earnOn: creator.earnOnChat || false,
        incognito: creator.incognitoMode || false,
      },
      stats: {
        tips: score.tipPoints || 0,
        chats: score.chatPoints || 0,
        calls: (score.voiceCallPoints || 0) + (score.videoCallPoints || 0),
        content: score.contentPoints || 0,
      },
      country: score.country,
      city: score.city,
      hasTop10Bonus: period === 'daily' && segment === 'worldwide' && rank <= 10,
    };
    
    entries.push(entry);
    rank++;
  }
  
  return {
    entries,
    total: scoresSnap.size,
    period,
    segment,
    filters: { gender, category, country, city },
    lastUpdated: new Date(),
  };
}

/**
 * Get creator's rank in a specific period/segment
 */
export async function getCreatorRank(
  creatorId: string,
  period: RankingPeriod,
  segment: RankingSegment = 'worldwide',
  country?: string,
  city?: string
): Promise<number | null> {
  // Build score document ID
  const scoreId = `${creatorId}_${period}_${segment}${segment === 'country' ? `_${country}` : ''}${segment === 'city' ? `_${city}` : ''}`;
  const scoreRef = db.collection('ranking_scores').doc(scoreId);
  const scoreSnap = await scoreRef.get();
  
  if (!scoreSnap.exists) {
    return null;
  }
  
  const creatorScore = scoreSnap.data() as RankingScore;
  
  // Count how many creators have higher scores
  let query = db.collection('ranking_scores')
    .where('period', '==', period)
    .where('segment', '==', segment)
    .where('points', '>', creatorScore.points);
  
  if (segment === 'country' && country) {
    query = query.where('country', '==', country);
  }
  
  if (segment === 'city' && city) {
    query = query.where('city', '==', city);
  }
  
  const higherScoresSnap = await query.count().get();
  const rank = higherScoresSnap.data().count + 1;
  
  return rank;
}

// ============================================================================
// TOP 10 BONUS MANAGEMENT
// ============================================================================

/**
 * Apply Top 10 bonuses for daily worldwide ranking
 */
export async function applyTop10Bonuses(): Promise<void> {
  // Get top 10 daily worldwide creators
  const leaderboard = await getLeaderboard({
    period: 'daily',
    segment: 'worldwide',
    limit: 10,
  });
  
  const top10CreatorIds = leaderboard.entries.map(entry => entry.creatorId);
  
  // Apply bonuses to top 10
  for (let i = 0; i < top10CreatorIds.length; i++) {
    const creatorId = top10CreatorIds[i];
    const rank = i + 1;
    
    await applyCreatorBonus(creatorId, rank);
  }
  
  // Remove bonuses from creators no longer in top 10
  await removeExpiredBonuses(top10CreatorIds);
}

/**
 * Apply bonus to a specific creator
 */
async function applyCreatorBonus(creatorId: string, rank: number): Promise<void> {
  const bonusRef = db.collection('top10_bonuses').doc(creatorId);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOP_10_BONUS_DURATION);
  
  const bonus: Top10Bonus = {
    creatorId,
    rank,
    activatedAt: now,
    expiresAt,
    bonuses: {
      discoveryVisibility: 15, // +15%
      matchPriority: 15, // +15%
      feedPriority: 15, // +15%
    },
    isActive: true,
  };
  
  await bonusRef.set(bonus);
  
  // Update creator profile with bonus flag
  const creatorRef = db.collection('users').doc(creatorId);
  await creatorRef.update({
    'ranking.hasTop10Bonus': true,
    'ranking.top10BonusExpiresAt': expiresAt,
    'ranking.top10Rank': rank,
  });
}

/**
 * Remove expired bonuses
 */
async function removeExpiredBonuses(currentTop10: string[]): Promise<void> {
  const bonusesSnap = await db.collection('top10_bonuses')
    .where('isActive', '==', true)
    .get();
  
  for (const bonusDoc of bonusesSnap.docs) {
    const bonus = bonusDoc.data() as Top10Bonus;
    
    // Remove if not in current top 10 or expired
    if (!currentTop10.includes(bonus.creatorId) || new Date() > new Date(bonus.expiresAt)) {
      await bonusDoc.ref.update({ isActive: false });
      
      // Update creator profile
      const creatorRef = db.collection('users').doc(bonus.creatorId);
      await creatorRef.update({
        'ranking.hasTop10Bonus': false,
        'ranking.top10BonusExpiresAt': null,
        'ranking.top10Rank': null,
      });
    }
  }
}

/**
 * Check if creator has active Top 10 bonus
 */
export async function hasTop10Bonus(creatorId: string): Promise<boolean> {
  const bonusRef = db.collection('top10_bonuses').doc(creatorId);
  const bonusSnap = await bonusRef.get();
  
  if (!bonusSnap.exists) {
    return false;
  }
  
  const bonus = bonusSnap.data() as Top10Bonus;
  return bonus.isActive && new Date() < new Date(bonus.expiresAt);
}

// ============================================================================
// CLEANUP OLD SCORES
// ============================================================================

/**
 * Clean up scores older than their period
 */
export async function cleanupOldScores(): Promise<void> {
  const now = new Date();
  
  // Daily scores older than 24 hours
  const dailyCutoff = new Date(now.getTime() - TIME_PERIODS.DAILY);
  await cleanupScoresByPeriod('daily', dailyCutoff);
  
  // Weekly scores older than 7 days
  const weeklyCutoff = new Date(now.getTime() - TIME_PERIODS.WEEKLY);
  await cleanupScoresByPeriod('weekly', weeklyCutoff);
  
  // Monthly scores older than 30 days
  const monthlyCutoff = new Date(now.getTime() - TIME_PERIODS.MONTHLY);
  await cleanupScoresByPeriod('monthly', monthlyCutoff);
  
  // Lifetime scores are never cleaned up
}

async function cleanupScoresByPeriod(period: RankingPeriod, cutoff: Date): Promise<void> {
  const scoresSnap = await db.collection('ranking_scores')
    .where('period', '==', period)
    .where('lastUpdated', '<', cutoff)
    .get();
  
  const batch = db.batch();
  scoresSnap.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  SCORING_TABLE,
  calculatePoints,
  updateCreatorScores,
  checkFirstTimeFanBonus,
};