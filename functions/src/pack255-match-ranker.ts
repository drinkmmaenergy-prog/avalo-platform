/**
 * PACK 255 — Match Ranking Engine
 * 
 * Core ranking algorithm that combines behavioral signals,
 * learned preferences, swipe heating, and relevance boosts.
 */

import { db } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  MatchCandidate,
  UserTier,
  MatchRankingWeights,
  RelevanceBoosts,
  DiscoveryFeedResult,
  DEFAULT_RANKING_WEIGHTS,
  DEFAULT_RELEVANCE_BOOSTS,
} from './pack255-ai-matchmaker-types';
import { getBehaviorProfile, calculatePreferenceSimilarity } from './pack255-behavior-tracker';
import { getHeatingState, getHeatingMultiplier } from './pack255-swipe-heating';

// ============================================================================
// LOGGER
// ============================================================================

const logger = {
  info: (...args: any[]) => console.log('[Pack255:MatchRanker]', ...args),
  warn: (...args: any[]) => console.warn('[Pack255:MatchRanker]', ...args),
  error: (...args: any[]) => console.error('[Pack255:MatchRanker]', ...args),
};

// ============================================================================
// USER TIER CLASSIFICATION
// ============================================================================

/**
 * Determine user tier based on engagement and monetization
 */
export async function getUserTier(userId: string): Promise<UserTier> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return UserTier.STANDARD;
    }

    const userData = userDoc.data();

    // Check Royal status
    if (userData?.roles?.royal) {
      return UserTier.ROYAL;
    }

    // Check if new user (<7 days)
    const createdAt = userData?.createdAt;
    if (createdAt) {
      const daysSinceCreation = (Date.now() - createdAt.toMillis()) / (1000 * 60 * 60 * 24);
      if (daysSinceCreation < 7) {
        return UserTier.NEW_USER;
      }
    }

    // Get behavior profile for engagement stats
    const behaviorProfile = await getBehaviorProfile(userId);

    if (behaviorProfile) {
      // High monetization: has paid interactions
      if (behaviorProfile.paidChatCount >= 5 || behaviorProfile.meetingCount >= 2) {
        return UserTier.HIGH_MONETIZATION;
      }

      // High engagement: good response rate
      if (behaviorProfile.messageResponseRate >= 0.7 && behaviorProfile.totalMatches >= 10) {
        return UserTier.HIGH_ENGAGEMENT;
      }

      // Low popularity: low swipe right rate
      if (behaviorProfile.totalSwipes >= 50) {
        // Check how many people swiped right on them
        const receivedLikesSnapshot = await db
          .collection('pack255_behavior_signals')
          .where('targetUserId', '==', userId)
          .where('type', '==', 'swipe_right')
          .get();

        const receivedLikes = receivedLikesSnapshot.size;
        const likeRate = receivedLikes / behaviorProfile.totalSwipes;

        if (likeRate < 0.1) {
          return UserTier.LOW_POPULARITY;
        }
      }
    }

    return UserTier.STANDARD;
  } catch (error) {
    logger.error(`Failed to get user tier for ${userId}:`, error);
    return UserTier.STANDARD;
  }
}

/**
 * Get tier boost multiplier
 */
function getTierBoost(tier: UserTier, boosts: RelevanceBoosts = DEFAULT_RELEVANCE_BOOSTS): number {
  switch (tier) {
    case UserTier.ROYAL:
      return boosts.royal;
    case UserTier.HIGH_ENGAGEMENT:
      return boosts.highEngagement;
    case UserTier.HIGH_MONETIZATION:
      return boosts.highMonetization;
    case UserTier.LOW_POPULARITY:
      return boosts.lowPopularity;
    case UserTier.NEW_USER:
      return boosts.newUser;
    default:
      return boosts.standard;
  }
}

// ============================================================================
// SCORE CALCULATION
// ============================================================================

/**
 * Calculate base compatibility score
 */
function calculateBaseScore(candidate: any, viewer: any): number {
  let score = 50; // Base score

  // Age compatibility
  const viewerAge = viewer?.profile?.age || viewer?.age || 25;
  const candidateAge = candidate?.profile?.age || candidate?.age || 25;
  const ageDiff = Math.abs(viewerAge - candidateAge);
  
  if (ageDiff <= 5) {
    score += 15;
  } else if (ageDiff <= 10) {
    score += 5;
  } else if (ageDiff > 20) {
    score -= 10;
  }

  // Distance compatibility (if available)
  const distance = candidate?.location?.distanceKm;
  if (distance != null) {
    if (distance <= 10) {
      score += 10;
    } else if (distance <= 50) {
      score += 5;
    } else if (distance > 200) {
      score -= 5;
    }
  }

  // Profile completeness
  const photos = candidate?.profile?.photos?.length || 0;
  if (photos >= 3) score += 10;
  if (candidate?.bio) score += 5;
  if (candidate?.profile?.interests?.length > 0) score += 5;

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate behavior-based score
 */
async function calculateBehaviorScore(candidateId: string): Promise<number> {
  try {
    const behaviorProfile = await getBehaviorProfile(candidateId);
    
    if (!behaviorProfile) {
      return 50; // Neutral score for new users
    }

    let score = 0;

    // Response rate (0-30 points)
    score += behaviorProfile.messageResponseRate * 30;

    // Match conversion rate (0-25 points)
    score += behaviorProfile.matchConversionRate * 25;

    // Activity level (0-20 points)
    const hoursSinceActive = (Date.now() - behaviorProfile.lastActive.toMillis()) / (1000 * 60 * 60);
    if (hoursSinceActive <= 24) {
      score += 20;
    } else if (hoursSinceActive <= 168) {
      score += 10;
    } else {
      score += 5;
    }

    // Engagement history (0-25 points)
    if (behaviorProfile.paidChatCount > 0) score += 10;
    if (behaviorProfile.meetingCount > 0) score += 15;

    return Math.max(0, Math.min(100, score));
  } catch (error) {
    logger.error(`Failed to calculate behavior score for ${candidateId}:`, error);
    return 50;
  }
}

/**
 * Calculate recency score (how recently active)
 */
function calculateRecencyScore(lastActive: Timestamp): number {
  const hoursSinceActive = (Date.now() - lastActive.toMillis()) / (1000 * 60 * 60);
  
  if (hoursSinceActive <= 1) {
    return 100; // Online now
  } else if (hoursSinceActive <= 24) {
    return 90; // Active today
  } else if (hoursSinceActive <= 168) {
    return 70; // Active this week
  } else if (hoursSinceActive <= 720) {
    return 40; // Active this month
  } else {
    return 10; // Inactive
  }
}

/**
 * Calculate popularity score
 */
async function calculatePopularityScore(candidateId: string): Promise<number> {
  try {
    // Count received likes in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const likesSnapshot = await db
      .collection('pack255_behavior_signals')
      .where('targetUserId', '==', candidateId)
      .where('type', '==', 'swipe_right')
      .where('timestamp', '>=', Timestamp.fromDate(thirtyDaysAgo))
      .get();

    const likesReceived = likesSnapshot.size;

    // Score based on likes (logarithmic scale)
    if (likesReceived === 0) return 20;
    if (likesReceived <= 5) return 40;
    if (likesReceived <= 20) return 60;
    if (likesReceived <= 50) return 80;
    return 100;
  } catch (error) {
    logger.error(`Failed to calculate popularity score for ${candidateId}:`, error);
    return 50;
  }
}

/**
 * Rank a single candidate
 */
export async function rankCandidate(
  viewerId: string,
  candidateId: string,
  weights: MatchRankingWeights = DEFAULT_RANKING_WEIGHTS,
  boosts: RelevanceBoosts = DEFAULT_RELEVANCE_BOOSTS
): Promise<MatchCandidate> {
  try {
    // Get viewer and candidate data
    const [viewerDoc, candidateDoc] = await Promise.all([
      db.collection('users').doc(viewerId).get(),
      db.collection('users').doc(candidateId).get(),
    ]);

    const viewerData = viewerDoc.data();
    const candidateData = candidateDoc.data();

    if (!candidateData) {
      throw new Error(`Candidate ${candidateId} not found`);
    }

    // Calculate component scores
    const baseScore = calculateBaseScore(candidateData, viewerData);
    const behaviorScore = await calculateBehaviorScore(candidateId);
    const similarityScore = await calculatePreferenceSimilarity(viewerId, candidateId) * 100;
    const lastActive = candidateData?.lastActiveAt || Timestamp.now();
    const recencyScore = calculateRecencyScore(lastActive);
    const popularityScore = await calculatePopularityScore(candidateId);

    // Calculate weighted base score
    const weightedScore =
      weights.base * baseScore +
      weights.behavior * behaviorScore +
      weights.similarity * similarityScore +
      weights.recency * recencyScore +
      weights.popularity * popularityScore;

    // Get tier and tier boost
    const tier = await getUserTier(candidateId);
    const tierBoost = getTierBoost(tier, boosts);

    // Get heating state and boost
    const heatingState = await getHeatingState(viewerId);
    const heatingBoost = heatingState.isHeated
      ? 1.0 + (heatingState.heatLevel / 100) * 0.5 // Up to 50% boost when fully heated
      : 1.0;

    // Apply boosts
    const finalScore = Math.min(100, weightedScore * tierBoost * heatingBoost);

    const candidate: MatchCandidate = {
      userId: candidateId,
      baseScore,
      behaviorScore,
      similarityScore,
      recencyScore,
      popularityScore,
      tierBoost,
      heatingBoost,
      finalScore,
      tier,
      isHeated: heatingState.isHeated,
      distance: candidateData?.location?.distanceKm,
      lastActive,
      scoreBreakdown: {
        base: baseScore,
        behavior: behaviorScore,
        similarity: similarityScore,
        recency: recencyScore,
        popularity: popularityScore,
        tierMultiplier: tierBoost,
        heatingMultiplier: heatingBoost,
      },
    };

    return candidate;
  } catch (error) {
    logger.error(`Failed to rank candidate ${candidateId}:`, error);
    throw error;
  }
}

// ============================================================================
// DISCOVERY FEED GENERATION
// ============================================================================

/**
 * Generate personalized discovery feed with AI ranking
 */
export async function generateDiscoveryFeed(
  viewerId: string,
  limit: number = 20,
  excludeUserIds: string[] = [],
  weights?: MatchRankingWeights,
  boosts?: RelevanceBoosts
): Promise<DiscoveryFeedResult> {
  const startTime = Date.now();
  
  try {
    logger.info(`Generating discovery feed for ${viewerId}, limit=${limit}`);

    // Get viewer data
    const viewerDoc = await db.collection('users').doc(viewerId).get();
    const viewerData = viewerDoc.data();

    if (!viewerData) {
      throw new Error('Viewer not found');
    }

    // Build query for candidates
    let query = db
      .collection('users')
      .where('isActive', '==', true)
      .where('profileComplete', '==', true);

    // Apply gender filter if viewer has preferences
    const preferredGenders = viewerData?.profile?.seeking || [];
    if (preferredGenders.length > 0 && preferredGenders.length <= 10) {
      query = query.where('profile.gender', 'in', preferredGenders) as any;
    }

    // Fetch candidates (fetch more than needed for filtering)
    const candidatesSnapshot = await query.limit(limit * 5).get();

    const candidateIds = candidatesSnapshot.docs
      .map(doc => doc.id)
      .filter(id => id !== viewerId && !excludeUserIds.includes(id));

    logger.info(`Found ${candidateIds.length} potential candidates`);

    // Rank all candidates
    const rankedCandidates = await Promise.all(
      candidateIds.map(candidateId => 
        rankCandidate(viewerId, candidateId, weights, boosts)
      )
    );

    // Filter out null/error candidates
    const validCandidates = rankedCandidates.filter(c => c !== null);

    // Sort by final score (descending)
    validCandidates.sort((a, b) => b.finalScore - a.finalScore);

    // Take top N
    const topCandidates = validCandidates.slice(0, limit);

    // Calculate metadata
    const avgScore = topCandidates.length > 0
      ? topCandidates.reduce((sum, c) => sum + c.finalScore, 0) / topCandidates.length
      : 0;

    const heatingState = await getHeatingState(viewerId);

    const result: DiscoveryFeedResult = {
      candidates: topCandidates,
      hasMore: validCandidates.length > limit,
      cursor: topCandidates.length > 0 ? topCandidates[topCandidates.length - 1].userId : undefined,
      metadata: {
        totalCandidates: candidateIds.length,
        filteredCount: candidateIds.length - validCandidates.length,
        rankedCount: validCandidates.length,
        avgScore,
        isHeated: heatingState.isHeated,
        generationTimeMs: Date.now() - startTime,
      },
    };

    logger.info(
      `Discovery feed generated: ${topCandidates.length} candidates, ` +
      `avg score ${avgScore.toFixed(1)}, ` +
      `heated=${heatingState.isHeated}, ` +
      `${result.metadata.generationTimeMs}ms`
    );

    return result;
  } catch (error) {
    logger.error(`Failed to generate discovery feed for ${viewerId}:`, error);
    throw error;
  }
}

/**
 * Get next batch of candidates (pagination)
 */
export async function getNextBatch(
  viewerId: string,
  cursor: string,
  limit: number = 20,
  excludeUserIds: string[] = []
): Promise<DiscoveryFeedResult> {
  // Add cursor user to exclusion list
  const updatedExclusions = [...excludeUserIds, cursor];
  
  return generateDiscoveryFeed(viewerId, limit, updatedExclusions);
}

// ============================================================================
// SAFETY & ETHICS FILTERS
// ============================================================================

/**
 * Ensure candidate passes safety and ethics filters
 */
export async function passesSafetyFilters(
  viewerId: string,
  candidateId: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Check if candidate is blocked
    const blockDoc = await db
      .collection('users')
      .doc(viewerId)
      .collection('blockedUsers')
      .doc(candidateId)
      .get();

    if (blockDoc.exists) {
      return { allowed: false, reason: 'BLOCKED' };
    }

    // Check reverse block
    const reverseBlockDoc = await db
      .collection('users')
      .doc(candidateId)
      .collection('blockedUsers')
      .doc(viewerId)
      .get();

    if (reverseBlockDoc.exists) {
      return { allowed: false, reason: 'BLOCKED_BY_USER' };
    }

    // Check if candidate is shadowbanned
    const candidateDoc = await db.collection('users').doc(candidateId).get();
    const candidateData = candidateDoc.data();

    if (candidateData?.shadowbanned) {
      return { allowed: false, reason: 'SHADOWBANNED' };
    }

    // Check account status
    if (candidateData?.accountStatus?.status !== 'active') {
      return { allowed: false, reason: 'INACTIVE_ACCOUNT' };
    }

    // CRITICAL: No filtering based on race, religion, disability, politics, nationality
    // Only behavior-based filtering is allowed

    return { allowed: true };
  } catch (error) {
    logger.error(`Safety filter check failed for ${candidateId}:`, error);
    return { allowed: false, reason: 'ERROR' };
  }
}

logger.info('✅ Pack 255 Match Ranker initialized');