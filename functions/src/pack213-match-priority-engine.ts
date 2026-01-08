/**
 * PACK 213: Premium Match Priority Engine
 * 
 * Match Priority Score = (Attraction × 0.35)
 *                      + (Reputation × 0.25)
 *                      + (Earnings Synergy × 0.25)
 *                      + (Recent Activity × 0.10)
 *                      + (Interest Proximity × 0.05)
 * 
 * CRITICAL RULES:
 * - Does NOT modify any economic values or token splits
 * - Only controls discovery ranking and visibility
 * - Integrates with PACK 211 (safety), PACK 212 (reputation)
 * - Users never see their score or algorithm details
 * - Positive reinforcement messaging only
 */

import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  MatchPriorityScore,
  MatchPriorityComponents,
  DEFAULT_MATCH_PRIORITY_WEIGHTS,
  MatchPriorityWeights,
  AttractionSignals,
  UserEconomicProfile,
  EarningsSynergyScore,
  EarningsSynergyLevel,
  UserMatchProfile,
  BoostTriggerAction,
  ActiveBoostWindow,
  UserBoostStatus,
  BOOST_CONFIGS,
} from './types/pack213-types';

// ============================================================================
// LOGGER
// ============================================================================

const logger = {
  info: (...args: any[]) => console.log('[PACK213:MatchPriority]', ...args),
  warn: (...args: any[]) => console.warn('[PACK213:MatchPriority]', ...args),
  error: (...args: any[]) => console.error('[PACK213:MatchPriority]', ...args),
  debug: (...args: any[]) => {
    if (process.env.DEBUG_PACK213 === 'true') {
      console.log('[PACK213:DEBUG]', ...args);
    }
  },
};

// ============================================================================
// CORE ALGORITHM: Calculate Match Priority Score
// ============================================================================

/**
 * Calculate complete match priority score for a candidate
 * This is the MAIN function of PACK 213
 */
export async function calculateMatchPriority(
  viewerId: string,
  candidateId: string,
  weights: MatchPriorityWeights = DEFAULT_MATCH_PRIORITY_WEIGHTS
): Promise<MatchPriorityScore> {
  logger.debug(`Calculating match priority: viewer=${viewerId}, candidate=${candidateId}`);
  
  try {
    // Get all component scores in parallel
    const [
      attractionScore,
      reputationScore,
      earningsSynergyScore,
      recentActivityScore,
      interestProximityScore,
    ] = await Promise.all([
      calculateAttractionScore(viewerId, candidateId),
      getReputationScore(candidateId),
      calculateEarningsSynergyScore(viewerId, candidateId),
      calculateRecentActivityScore(candidateId),
      calculateInterestProximityScore(viewerId, candidateId),
    ]);
    
    const components: MatchPriorityComponents = {
      attractionScore,
      reputationScore,
      earningsSynergyScore,
      recentActivityScore,
      interestProximityScore,
    };
    
    // Calculate weighted final score (0-1 range)
    const finalScore = 
      (attractionScore * weights.attraction) +
      (reputationScore * weights.reputation) +
      (earningsSynergyScore * weights.earningsSynergy) +
      (recentActivityScore * weights.recentActivity) +
      (interestProximityScore * weights.interestProximity);
    
    // Get boost multiplier
    const boostStatus = await getUserBoostStatus(candidateId);
    const boostMultiplier = boostStatus.totalMultiplier;
    
    // Apply boost to get effective score
    const effectiveScore = Math.min(100, finalScore * 100 * boostMultiplier);
    
    const score: MatchPriorityScore = {
      candidateId,
      viewerId,
      components,
      finalScore: finalScore * 100, // Convert to 0-100 scale
      calculatedAt: Timestamp.now(),
      boostMultiplier,
      effectiveScore,
    };
    
    logger.debug(`Match priority calculated: ${effectiveScore.toFixed(2)}`, { components, boost: boostMultiplier });
    
    return score;
  } catch (error) {
    logger.error('Error calculating match priority:', error);
    // Return neutral score on error
    return {
      candidateId,
      viewerId,
      components: {
        attractionScore: 0.5,
        reputationScore: 0.5,
        earningsSynergyScore: 0.5,
        recentActivityScore: 0.5,
        interestProximityScore: 0.5,
      },
      finalScore: 50,
      calculatedAt: Timestamp.now(),
      boostMultiplier: 1.0,
      effectiveScore: 50,
    };
  }
}

// ============================================================================
// COMPONENT 1: ATTRACTION SCORE
// ============================================================================

/**
 * Calculate attraction based on viewer's interaction history with candidate
 * Signals: likes, wishlists, profile views, dwell time, media expansions
 */
async function calculateAttractionScore(
  viewerId: string,
  candidateId: string
): Promise<number> {
  try {
    // Get attraction signals
    const signalsDoc = await db
      .collection('attraction_signals')
      .doc(`${viewerId}_${candidateId}`)
      .get();
    
    if (!signalsDoc.exists) {
      return 0.5; // Neutral - no interaction history
    }
    
    const signals = signalsDoc.data() as AttractionSignals;
    let score = 0.5; // Start neutral
    
    // Like = strong signal (+0.3)
    if (signals.hasLiked) {
      score += 0.3;
    }
    
    // Wishlist = very strong signal (+0.2)
    if (signals.hasWishlisted) {
      score += 0.2;
    }
    
    // Profile views (diminishing returns)
    if (signals.profileViewCount > 0) {
      const viewBonus = Math.min(0.15, signals.profileViewCount * 0.05);
      score += viewBonus;
    }
    
    // Dwell time (time spent on profile)
    if (signals.avgDwellTimeSeconds > 30) {
      const dwellBonus = Math.min(0.15, (signals.avgDwellTimeSeconds / 180) * 0.15);
      score += dwellBonus;
    }
    
    // Media expansion (shows interest)
    if (signals.mediaExpansionCount > 0) {
      const mediaBonus = Math.min(0.1, signals.mediaExpansionCount * 0.03);
      score += mediaBonus;
    }
    
    // Recency bonus (recent interaction = higher interest)
    if (signals.lastInteractionAt) {
      const hoursSinceInteraction = 
        (Date.now() - signals.lastInteractionAt.toMillis()) / (1000 * 60 * 60);
      if (hoursSinceInteraction < 24) {
        score += 0.1;
      } else if (hoursSinceInteraction < 168) { // 7 days
        score += 0.05;
      }
    }
    
    // Normalize to 0-1
    return Math.max(0, Math.min(1, score));
  } catch (error) {
    logger.error('Error calculating attraction score:', error);
    return 0.5; // Neutral on error
  }
}

// ============================================================================
// COMPONENT 2: REPUTATION SCORE (From PACK 212)
// ============================================================================

/**
 * Get soft reputation score from PACK 212
 * Higher = better standing in community
 */
async function getReputationScore(userId: string): Promise<number> {
  try {
    const reputationDoc = await db
      .collection('user_reputation')
      .doc(userId)
      .get();
    
    if (!reputationDoc.exists) {
      return 0.5; // Neutral for new users
    }
    
    const reputation = reputationDoc.data();
    const score = reputation?.score || 50; // 0-100 scale
    
    // Normalize to 0-1
    return score / 100;
  } catch (error) {
    logger.error('Error getting reputation score:', error);
    return 0.5;
  }
}

// ============================================================================
// COMPONENT 3: EARNINGS SYNERGY SCORE
// ============================================================================

/**
 * Calculate predicted economic compatibility between viewer and candidate
 * High synergy = likely to result in paid engagement
 */
async function calculateEarningsSynergyScore(
  viewerId: string,
  candidateId: string
): Promise<number> {
  try {
    // Get economic profiles
    const [viewerProfile, candidateProfile] = await Promise.all([
      getUserEconomicProfile(viewerId),
      getUserEconomicProfile(candidateId),
    ]);
    
    const synergy = evaluateEarningsSynergy(viewerProfile, candidateProfile);
    
    // Store synergy for analytics
    await db.collection('earnings_synergy_cache').doc(`${viewerId}_${candidateId}`).set({
      viewerId,
      candidateId,
      level: synergy.level,
      score: synergy.score,
      reasoning: synergy.reasoning,
      factors: synergy.factors,
      lastUpdated: serverTimestamp(),
    }, { merge: true });
    
    return synergy.score;
  } catch (error) {
    logger.error('Error calculating earnings synergy:', error);
    return 0.5;
  }
}

/**
 * Evaluate earnings synergy level between two economic profiles
 */
function evaluateEarningsSynergy(
  viewer: UserEconomicProfile,
  candidate: UserEconomicProfile
): EarningsSynergyScore {
  let level: EarningsSynergyLevel;
  let score: number;
  let reasoning: string;
  
  const viewerIsSpender = viewer.totalSpent > 0 || viewer.purchaseFrequency > 0;
  const candidateIsEarner = candidate.earnOnChat || candidate.earnOnMeetings || candidate.earnOnEvents;
  const viewerIsRoyal = viewer.isRoyal;
  const candidateIsHighDemand = candidate.recentEngagement === 'high' && candidate.totalEarnings > 1000;
  
  // EXTREME HIGH: Royal male × high-engagement earner
  if (viewerIsRoyal && candidateIsEarner && candidateIsHighDemand) {
    level = 'EXTREME_HIGH';
    score = 0.95;
    reasoning = 'Royal member with high-demand creator';
  }
  // VERY HIGH: Spender × earner
  else if (viewerIsSpender && candidateIsEarner) {
    level = 'VERY_HIGH';
    score = 0.85;
    reasoning = 'Active spender matched with earner';
  }
  // HIGH: New spender with purchase history × attractive candidate with earning mode
  else if (viewer.purchaseFrequency > 2 && candidateIsEarner && candidate.totalEarnings < 500) {
    level = 'HIGH';
    score = 0.75;
    reasoning = 'Frequent purchaser with growing creator';
  }
  // MEDIUM: One earner, one not (or friends mode)
  else if ((viewerIsSpender && !candidateIsEarner) || (!viewerIsSpender && candidateIsEarner)) {
    level = 'MEDIUM';
    score = 0.55;
    reasoning = 'Mixed earning modes';
  }
  // MEDIUM_LOW: Both non-earners
  else if (!viewerIsSpender && !candidateIsEarner) {
    level = 'MEDIUM_LOW';
    score = 0.45;
    reasoning = 'Both in free/social mode';
  }
  // LOW: Both earners (both wait to be paid)
  else if (candidateIsEarner && (viewer.earnOnChat || viewer.earnOnMeetings || viewer.earnOnEvents)) {
    level = 'LOW';
    score = 0.30;
    reasoning = 'Both users are earners';
  }
  // VERY LOW: Low engagement spender × high-demand creator
  else if (viewer.purchaseFrequency < 1 && candidateIsHighDemand) {
    level = 'VERY_LOW';
    score = 0.15;
    reasoning = 'Low engagement with high-demand creator';
  }
  // Default neutral
  else {
    level = 'MEDIUM';
    score = 0.50;
    reasoning = 'Standard compatibility';
  }
  
  return {
    viewerId: viewer.userId,
    candidateId: candidate.userId,
    level,
    score,
    reasoning,
    factors: {
      viewerIsSpender,
      candidateIsEarner,
      royalBonus: viewerIsRoyal,
      purchaseHistory: viewer.purchaseFrequency > 3 ? 'high' : 
                       viewer.purchaseFrequency > 1 ? 'medium' :
                       viewer.purchaseFrequency > 0 ? 'low' : 'none',
      earnerDemand: candidateIsHighDemand ? 'high' :
                    candidate.totalEarnings > 100 ? 'medium' : 'low',
    },
    lastUpdated: Timestamp.now(),
  };
}

/**
 * Get or create user economic profile
 */
async function getUserEconomicProfile(userId: string): Promise<UserEconomicProfile> {
  try {
    const profileDoc = await db.collection('user_economic_profiles').doc(userId).get();
    
    if (profileDoc.exists) {
      return profileDoc.data() as UserEconomicProfile;
    }
    
    // Build profile from user data
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data() || {};
    
    const profile: UserEconomicProfile = {
      userId,
      earnOnChat: userData.modes?.earnFromChat || false,
      earnOnMeetings: userData.modes?.earnFromMeetings || false,
      earnOnEvents: userData.modes?.earnFromEvents || false,
      totalEarnings: userData.stats?.totalEarned || 0,
      avgEarningsPerChat: userData.stats?.avgEarnedPerChat || 0,
      totalSpent: userData.stats?.totalSpent || 0,
      avgSpentPerChat: userData.stats?.avgSpentPerChat || 0,
      avgSpentPerMeeting: userData.stats?.avgSpentPerMeeting || 0,
      purchaseFrequency: userData.stats?.purchasesPerMonth || 0,
      isRoyal: userData.roles?.royal || false,
      royalUpgradeDate: userData.royalUpgradeDate,
      recentEngagement: calculateEngagementLevel(userData),
      lastUpdated: Timestamp.now(),
    };
    
    // Cache profile
    await db.collection('user_economic_profiles').doc(userId).set(profile);
    
    return profile;
  } catch (error) {
    logger.error('Error getting economic profile:', error);
    // Return neutral profile
    return {
      userId,
      earnOnChat: false,
      earnOnMeetings: false,
      earnOnEvents: false,
      totalEarnings: 0,
      avgEarningsPerChat: 0,
      totalSpent: 0,
      avgSpentPerChat: 0,
      avgSpentPerMeeting: 0,
      purchaseFrequency: 0,
      isRoyal: false,
      recentEngagement: 'low',
      lastUpdated: Timestamp.now(),
    };
  }
}

/**
 * Calculate engagement level from user stats
 */
function calculateEngagementLevel(userData: any): 'high' | 'medium' | 'low' {
  const activityScore = 
    (userData.stats?.chatsLast30Days || 0) +
    (userData.stats?.meetingsLast30Days || 0) * 3 +
    (userData.stats?.eventsLast30Days || 0) * 5;
  
  if (activityScore >= 20) return 'high';
  if (activityScore >= 5) return 'medium';
  return 'low';
}

// ============================================================================
// COMPONENT 4: RECENT ACTIVITY SCORE
// ============================================================================

/**
 * Calculate score based on user's activity in last 7 days
 * More active = higher priority
 */
async function calculateRecentActivityScore(userId: string): Promise<number> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (!userData) {
      return 0.3; // Low score for missing users
    }
    
    const lastActiveAt = userData.lastActiveAt;
    if (!lastActiveAt) {
      return 0.3;
    }
    
    const hoursSinceActive = (Date.now() - lastActiveAt.toMillis()) / (1000 * 60 * 60);
    
    // Score decays over time
    if (hoursSinceActive < 1) return 1.0;        // Last hour: full score
    if (hoursSinceActive < 24) return 0.9;       // Last day: 90%
    if (hoursSinceActive < 48) return 0.7;       // Last 2 days: 70%
    if (hoursSinceActive < 168) return 0.5;      // Last week: 50%
    if (hoursSinceActive < 720) return 0.3;      // Last month: 30%
    return 0.1;                                   // Inactive: 10%
  } catch (error) {
    logger.error('Error calculating activity score:', error);
    return 0.3;
  }
}

// ============================================================================
// COMPONENT 5: INTEREST PROXIMITY SCORE
// ============================================================================

/**
 * Calculate overlapping interests/tags (optional, lightweight)
 */
async function calculateInterestProximityScore(
  viewerId: string,
  candidateId: string
): Promise<number> {
  try {
    const [viewerDoc, candidateDoc] = await Promise.all([
      db.collection('users').doc(viewerId).get(),
      db.collection('users').doc(candidateId).get(),
    ]);
    
    const viewerInterests = viewerDoc.data()?.profile?.interests || [];
    const candidateInterests = candidateDoc.data()?.profile?.interests || [];
    
    if (viewerInterests.length === 0 || candidateInterests.length === 0) {
      return 0.5; // Neutral if no interests
    }
    
    const commonInterests = viewerInterests.filter((interest: string) =>
      candidateInterests.includes(interest)
    );
    
    const overlapRatio = commonInterests.length / Math.max(viewerInterests.length, candidateInterests.length);
    
    // Normalize: 0 overlap = 0.3, 50% overlap = 0.65, 100% overlap = 1.0
    return 0.3 + (overlapRatio * 0.7);
  } catch (error) {
    logger.error('Error calculating interest proximity:', error);
    return 0.5;
  }
}

// ============================================================================
// BOOST WINDOWS SYSTEM
// ============================================================================

/**
 * Apply a boost to a user based on action
 */
export async function applyBoostWindow(
  userId: string,
  action: BoostTriggerAction,
  metadata?: {
    chatId?: string;
    meetingId?: string;
    eventId?: string;
    amount?: number;
  }
): Promise<ActiveBoostWindow> {
  logger.info(`Applying boost: user=${userId}, action=${action}`);
  
  const config = BOOST_CONFIGS[action];
  const now = Timestamp.now();
  const expiresAt = new Timestamp(
    now.seconds + (config.durationHours * 3600),
    now.nanoseconds
  );
  
  const boost: ActiveBoostWindow = {
    userId,
    action,
    multiplier: config.multiplier,
    startsAt: now,
    expiresAt,
    isActive: true,
    metadata,
  };
  
  // Store boost
  await db.collection('active_boosts').add(boost);
  
  // Update user boost status
  await updateUserBoostStatus(userId);
  
  logger.info(`Boost applied: ${config.multiplier}x for ${config.durationHours}h`);
  
  return boost;
}

/**
 * Get current boost status for a user
 * Multiple boosts can be active and stack multiplicatively
 */
async function getUserBoostStatus(userId: string): Promise<UserBoostStatus> {
  try {
    const now = Timestamp.now();
    
    // Get all active boosts
    const boostsSnapshot = await db
      .collection('active_boosts')
      .where('userId', '==', userId)
      .where('expiresAt', '>', now)
      .where('isActive', '==', true)
      .get();
    
    const activeBoosts: ActiveBoostWindow[] = boostsSnapshot.docs.map(
      doc => doc.data() as ActiveBoostWindow
    );
    
    // Calculate total multiplier (boosts stack multiplicatively)
    let totalMultiplier = 1.0;
    let highestBoost: BoostTriggerAction | undefined;
    let highestMultiplier = 1.0;
    
    for (const boost of activeBoosts) {
      totalMultiplier *= boost.multiplier;
      if (boost.multiplier > highestMultiplier) {
        highestMultiplier = boost.multiplier;
        highestBoost = boost.action;
      }
    }
    
    const status: UserBoostStatus = {
      userId,
      activeBoosts,
      totalMultiplier,
      highestBoost,
      lastBoostAt: activeBoosts.length > 0 ? activeBoosts[0].startsAt : undefined,
      updatedAt: Timestamp.now(),
    };
    
    return status;
  } catch (error) {
    logger.error('Error getting boost status:', error);
    return {
      userId,
      activeBoosts: [],
      totalMultiplier: 1.0,
      updatedAt: Timestamp.now(),
    };
  }
}

/**
 * Update user's boost status cache
 */
async function updateUserBoostStatus(userId: string): Promise<void> {
  const status = await getUserBoostStatus(userId);
  await db.collection('user_boost_status').doc(userId).set(status, { merge: true });
}

/**
 * Expire old boosts (should be called by scheduled function)
 */
export async function expireOldBoosts(): Promise<number> {
  const now = Timestamp.now();
  
  const expiredBoosts = await db
    .collection('active_boosts')
    .where('expiresAt', '<', now)
    .where('isActive', '==', true)
    .limit(100)
    .get();
  
  let expiredCount = 0;
  
  for (const boostDoc of expiredBoosts.docs) {
    await boostDoc.ref.update({
      isActive: false,
      expiredAt: serverTimestamp(),
    });
    expiredCount++;
  }
  
  logger.info(`Expired ${expiredCount} old boosts`);
  return expiredCount;
}

// ============================================================================
// BATCH SCORING FOR DISCOVERY
// ============================================================================

/**
 * Calculate match priority scores for multiple candidates
 * Used by discovery feed for efficient ranking
 */
export async function batchCalculateMatchPriority(
  viewerId: string,
  candidateIds: string[],
  weights?: MatchPriorityWeights
): Promise<MatchPriorityScore[]> {
  logger.debug(`Batch calculating priority for ${candidateIds.length} candidates`);
  
  const scores = await Promise.all(
    candidateIds.map(candidateId =>
      calculateMatchPriority(viewerId, candidateId, weights)
    )
  );
  
  // Sort by effective score (descending)
  scores.sort((a, b) => b.effectiveScore - a.effectiveScore);
  
  return scores;
}

/**
 * Track attraction signal (like, view, etc.)
 */
export async function trackAttractionSignal(
  viewerId: string,
  targetId: string,
  signal: {
    type: 'like' | 'wishlist' | 'profile_view' | 'media_expand';
    dwellTimeSeconds?: number;
  }
): Promise<void> {
  const signalId = `${viewerId}_${targetId}`;
  const signalRef = db.collection('attraction_signals').doc(signalId);
  
  const updates: any = {
    userId: viewerId,
    targetUserId: targetId,
    lastInteractionAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  
  switch (signal.type) {
    case 'like':
      updates.hasLiked = true;
      break;
    case 'wishlist':
      updates.hasWishlisted = true;
      break;
    case 'profile_view':
      updates.hasViewedProfile = true;
      updates.profileViewCount = (await signalRef.get()).data()?.profileViewCount || 0 + 1;
      if (signal.dwellTimeSeconds) {
        const current = (await signalRef.get()).data();
        const currentAvg = current?.avgDwellTimeSeconds || 0;
        const currentCount = current?.profileViewCount || 0;
        updates.avgDwellTimeSeconds = 
          ((currentAvg * currentCount) + signal.dwellTimeSeconds) / (currentCount + 1);
      }
      break;
    case 'media_expand':
      updates.mediaExpansionCount = (await signalRef.get()).data()?.mediaExpansionCount || 0 + 1;
      break;
  }
  
  await signalRef.set(updates, { merge: true });
}

logger.info('✅ PACK 213: Premium Match Priority Engine initialized');