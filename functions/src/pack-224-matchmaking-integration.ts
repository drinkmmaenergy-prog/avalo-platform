/**
 * PACK 224: Romantic Momentum - Matchmaking Integration
 * 
 * Integrates momentum scores into the discovery and matching algorithms
 * to boost visibility for users with high romantic activity.
 */

import { db } from './init.js';
import { getMomentumBoostMultiplier } from './pack-224-romantic-momentum.js';
import { getDestinyBoostMultiplier } from './pack-223-destiny-weeks.js';

// ============================================================================
// TYPES
// ============================================================================

interface UserMatchProfile {
  userId: string;
  baseScore: number;
  momentumBoost: number;
  destinyBoost: number;
  tierBonus: number;
  finalScore: number;
}

interface DiscoveryRankingFactors {
  baseCompatibility: number;
  romanticMomentum: number;
  destinyWeekBoost: number;
  reputationScore: number;
  activityLevel: number;
  tierBonus: number;
}

// ============================================================================
// MATCHMAKING RANKING
// ============================================================================

/**
 * Calculate final match ranking score with momentum boost
 * 
 * Formula:
 * finalScore = baseScore × (1 + momentumBoost) × (1 + destinyBoost) × tierMultiplier
 */
export async function calculateMatchRanking(
  viewerId: string,
  candidateId: string,
  baseCompatibilityScore: number
): Promise<number> {
  // Get momentum boost (1.0 - 2.0x)
  const momentumBoost = await getMomentumBoostMultiplier(candidateId);
  
  // Get Destiny Week boost (1.0 - 2.0x from PACK 223)
  const destinyBoost = await getDestinyBoostMultiplier(candidateId);
  
  // Get tier bonus
  const tierBonus = await getTierBonus(candidateId);
  
  // Calculate final score
  const finalScore = baseCompatibilityScore * momentumBoost * destinyBoost * tierBonus;
  
  return Math.round(finalScore * 100) / 100;
}

/**
 * Get tier bonus multiplier
 */
async function getTierBonus(userId: string): Promise<number> {
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  if (userData?.tier === 'royal') return 1.15;
  if (userData?.badges?.includes('influencer')) return 1.10;
  return 1.0;
}

/**
 * Rank discovery candidates with momentum consideration
 */
export async function rankDiscoveryCandidates(
  viewerId: string,
  candidates: Array<{ userId: string; baseScore: number }>
): Promise<Array<{ userId: string; finalScore: number; boostFactors: DiscoveryRankingFactors }>> {
  const rankedCandidates = [];
  
  for (const candidate of candidates) {
    const momentumBoost = await getMomentumBoostMultiplier(candidate.userId);
    const destinyBoost = await getDestinyBoostMultiplier(candidate.userId);
    const tierBonus = await getTierBonus(candidate.userId);
    
    // Get additional factors
    const reputationScore = await getReputationScore(candidate.userId);
    const activityLevel = await getActivityLevel(candidate.userId);
    
    const factors: DiscoveryRankingFactors = {
      baseCompatibility: candidate.baseScore,
      romanticMomentum: momentumBoost,
      destinyWeekBoost: destinyBoost,
      reputationScore,
      activityLevel,
      tierBonus
    };
    
    // Calculate final score
    const finalScore = 
      candidate.baseScore * 
      momentumBoost * 
      destinyBoost * 
      tierBonus * 
      (1 + reputationScore * 0.1) * 
      (1 + activityLevel * 0.05);
    
    rankedCandidates.push({
      userId: candidate.userId,
      finalScore,
      boostFactors: factors
    });
  }
  
  // Sort by final score descending
  return rankedCandidates.sort((a, b) => b.finalScore - a.finalScore);
}

/**
 * Get reputation score (0.0 - 1.0)
 */
async function getReputationScore(userId: string): Promise<number> {
  const reputationDoc = await db.collection('user_reputation').doc(userId).get();
  
  if (!reputationDoc.exists) return 0.5; // Neutral
  
  const reputation = reputationDoc.data();
  return Math.max(0, Math.min(1, reputation?.score || 0.5));
}

/**
 * Get activity level (0.0 - 1.0)
 */
async function getActivityLevel(userId: string): Promise<number> {
  const momentumState = await db.collection('romantic_momentum_states').doc(userId).get();
  
  if (!momentumState.exists) return 0.3; // Low activity
  
  const state = momentumState.data();
  const score = state?.score || 0;
  
  // Convert momentum score (0-100) to activity level (0-1)
  return Math.min(1, score / 100);
}

// ============================================================================
// DISCOVERY FEED INTEGRATION
// ============================================================================

/**
 * Get boosted users for "Trending" section
 * Shows users with high momentum (70+)
 */
export async function getTrendingUsers(
  viewerId: string,
  limit: number = 20
): Promise<string[]> {
  const boostCacheSnap = await db.collection('momentum_boost_cache')
    .where('boostLevel', '>=', 1.6) // Trending level (70-84 score)
    .orderBy('boostLevel', 'desc')
    .orderBy('lastUpdate', 'desc')
    .limit(limit * 2) // Get more to filter
    .get();
  
  // Filter out already matched/blocked users
  const userIds: string[] = [];
  for (const doc of boostCacheSnap.docs) {
    if (userIds.length >= limit) break;
    
    const userId = doc.id;
    if (userId === viewerId) continue;
    
    // Check if not already matched or blocked
    const isEligible = await checkUserEligibility(viewerId, userId);
    if (isEligible) {
      userIds.push(userId);
    }
  }
  
  return userIds;
}

/**
 * Get "Peak Chemistry" users (85-100 momentum)
 * Shows in special premium section
 */
export async function getPeakChemistryUsers(
  viewerId: string,
  limit: number = 10
): Promise<string[]> {
  const boostCacheSnap = await db.collection('momentum_boost_cache')
    .where('boostLevel', '>=', 2.0) // Peak level (85+ score)
    .orderBy('boostLevel', 'desc')
    .orderBy('lastUpdate', 'desc')
    .limit(limit * 2)
    .get();
  
  const userIds: string[] = [];
  for (const doc of boostCacheSnap.docs) {
    if (userIds.length >= limit) break;
    
    const userId = doc.id;
    if (userId === viewerId) continue;
    
    const isEligible = await checkUserEligibility(viewerId, userId);
    if (isEligible) {
      userIds.push(userId);
    }
  }
  
  return userIds;
}

/**
 * Check if user is eligible for discovery (not blocked, not already matched)
 */
async function checkUserEligibility(viewerId: string, candidateId: string): Promise<boolean> {
  // Check blocks
  const blockDoc = await db.collection('blocks')
    .where('blockerId', '==', viewerId)
    .where('blockedId', '==', candidateId)
    .limit(1)
    .get();
  
  if (!blockDoc.empty) return false;
  
  // Check reverse blocks
  const reverseBlockDoc = await db.collection('blocks')
    .where('blockerId', '==', candidateId)
    .where('blockedId', '==', viewerId)
    .limit(1)
    .get();
  
  if (!reverseBlockDoc.empty) return false;
  
  // Check if already matched
  const matchDoc = await db.collection('matches')
    .where('users', 'array-contains', viewerId)
    .limit(100)
    .get();
  
  const alreadyMatched = matchDoc.docs.some(doc => {
    const users = doc.data().users as string[];
    return users.includes(candidateId);
  });
  
  return !alreadyMatched;
}

// ============================================================================
// PROFILE VISIBILITY BOOST
// ============================================================================

/**
 * Apply momentum boost to profile views
 * Higher momentum = more profile impressions
 */
export async function applyMomentumVisibilityBoost(userId: string): Promise<{
  baseVisibility: number;
  momentumBoost: number;
  finalVisibility: number;
}> {
  const momentumBoost = await getMomentumBoostMultiplier(userId);
  const baseVisibility = 100; // Base impressions per day
  
  const finalVisibility = Math.round(baseVisibility * momentumBoost);
  
  return {
    baseVisibility,
    momentumBoost,
    finalVisibility
  };
}

/**
 * Get "Good Match for You" boosted candidates
 * Users with 50-69 momentum appear more in suggestions
 */
export async function getGoodMatchCandidates(
  viewerId: string,
  baseMatches: string[],
  limit: number = 50
): Promise<string[]> {
  const boostedUsers: Array<{ userId: string; boost: number }> = [];
  
  for (const userId of baseMatches) {
    const boost = await getMomentumBoostMultiplier(userId);
    boostedUsers.push({ userId, boost });
  }
  
  // Sort by boost level
  boostedUsers.sort((a, b) => b.boost - a.boost);
  
  return boostedUsers.slice(0, limit).map(u => u.userId);
}

// ============================================================================
// ANALYTICS & REPORTING
// ============================================================================

/**
 * Get momentum distribution in discovery pool
 */
export async function getMomentumDistribution(): Promise<{
  low: number;
  standard: number;
  good: number;
  trending: number;
  peak: number;
}> {
  const statesSnap = await db.collection('romantic_momentum_states').get();
  
  const distribution = {
    low: 0,
    standard: 0,
    good: 0,
    trending: 0,
    peak: 0
  };
  
  for (const doc of statesSnap.docs) {
    const score = doc.data().score as number;
    
    if (score < 20) distribution.low++;
    else if (score < 50) distribution.standard++;
    else if (score < 70) distribution.good++;
    else if (score < 85) distribution.trending++;
    else distribution.peak++;
  }
  
  return distribution;
}

/**
 * Get user's momentum ranking percentile
 */
export async function getUserMomentumPercentile(userId: string): Promise<number> {
  const state = await db.collection('romantic_momentum_states').doc(userId).get();
  if (!state.exists) return 0;
  
  const userScore = state.data()?.score || 0;
  
  // Count users with lower scores
  const lowerScoreSnap = await db.collection('romantic_momentum_states')
    .where('score', '<', userScore)
    .count()
    .get();
  
  const totalUsersSnap = await db.collection('romantic_momentum_states')
    .count()
    .get();
  
  const lowerCount = lowerScoreSnap.data().count;
  const totalCount = totalUsersSnap.data().count;
  
  if (totalCount === 0) return 0;
  
  return Math.round((lowerCount / totalCount) * 100);
}