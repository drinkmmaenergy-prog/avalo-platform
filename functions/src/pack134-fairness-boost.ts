import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 134 — Fairness Boosting Module
 * 
 * Ensures new earners get equal discovery chances
 * NO advantage for attractive faces, paid accounts, or popularity
 * 
 * New earners must appear even if top earners are active
 * Mandated fairness logic prevents rich-get-richer dynamics
 */

import { Timestamp } from 'firebase-admin/firestore';
import { db } from './init';
import { logger } from 'firebase-functions/v2';
import {
  NewCreatorBoostProfile,
  DEFAULT_RECOMMENDATION_CONFIG,
} from './types/pack134-types';
import { admin, functions } from './runtime';

// ============================================================================
// NEW CREATOR IDENTIFICATION
// ============================================================================

/**
 * Calculate boost multiplier for new earner
 * Based on account age and engagement quality, NOT appearance or income
 * 
 * @param earnerId - Creator ID
 * @returns Boost profile with multiplier
 */
export async function calculateNewCreatorBoost(
  earnerId: string
): Promise<NewCreatorBoostProfile> {
  const config = DEFAULT_RECOMMENDATION_CONFIG;
  
  // Get earner profile
  const earnerDoc = await db.collection('users').doc(earnerId).get();
  const earnerData = earnerDoc.data();
  
  if (!earnerData) {
    throw new Error(`Creator ${earnerId} not found`);
  }
  
  // Calculate account age in days
  const accountAgeMs = Date.now() - earnerData.createdAt.toMillis();
  const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);
  
  // Get follower count
  const followersSnapshot = await db.collection('user_follows')
    .where('followingId', '==', earnerId)
    .count()
    .get();
  const followerCount = followersSnapshot.data().count;
  
  // Calculate engagement rate
  const engagementRate = await calculateCreatorEngagementRate(earnerId);
  
  // Calculate positive interaction ratio
  const positiveRatio = await calculatePositiveRatio(earnerId);
  
  // Determine eligibility for boost
  const eligibleForBoost = 
    accountAgeDays <= config.newCreatorDefinitionDays &&
    followerCount < 1000 && // Small following
    positiveRatio > 0.7; // Good quality interactions
  
  // Calculate boost multiplier
  let boostMultiplier = 1.0;
  
  if (eligibleForBoost) {
    // Base boost for new earners
    boostMultiplier = 1.5;
    
    // Additional boost for high-quality content
    if (engagementRate > 0.05) {
      boostMultiplier += 0.5; // Very engaging content
    }
    
    // Additional boost for very new earners
    if (accountAgeDays < 30) {
      boostMultiplier += 0.5; // First month boost
    }
    
    // Cap at 3.0x to prevent abuse
    boostMultiplier = Math.min(3.0, boostMultiplier);
  }
  
  // Calculate boost expiration
  const daysRemaining = config.newCreatorDefinitionDays - accountAgeDays;
  const boostExpiresAt = Timestamp.fromMillis(
    Date.now() + (daysRemaining * 24 * 60 * 60 * 1000)
  );
  
  // Get earner categories
  const categoryDoc = await db.collection('content_category_profiles').doc(earnerId).get();
  const categoryData = categoryDoc.data();
  
  const profile: NewCreatorBoostProfile = {
    earnerId,
    accountAge: Math.floor(accountAgeDays),
    followerCount,
    engagementRate,
    positiveRatio,
    boostMultiplier,
    boostExpiresAt,
    eligibleForBoost,
    categories: categoryData ? 
      [categoryData.primaryCategory, ...(categoryData.secondaryCategories || [])] : 
      [],
  };
  
  logger.info('[Pack134] Calculated new earner boost', {
    earnerId,
    accountAge: profile.accountAge,
    followerCount,
    eligibleForBoost,
    boostMultiplier,
  });
  
  return profile;
}

// ============================================================================
// ENGAGEMENT CALCULATION
// ============================================================================

/**
 * Calculate earner's engagement rate
 * Based on content performance, NOT monetization
 */
async function calculateCreatorEngagementRate(earnerId: string): Promise<number> {
  // Get recent posts (last 30 days)
  const thirtyDaysAgo = Timestamp.fromMillis(Date.now() - (30 * 24 * 60 * 60 * 1000));
  
  const postsSnapshot = await db.collection('feed_posts')
    .where('userId', '==', earnerId)
    .where('createdAt', '>=', thirtyDaysAgo)
    .limit(20)
    .get();
  
  if (postsSnapshot.empty) {
    return 0;
  }
  
  let totalEngagement = 0;
  let totalViews = 0;
  
  for (const doc of postsSnapshot.docs) {
    const data = doc.data();
    const likes = data.likesCount || 0;
    const comments = data.commentsCount || 0;
    const shares = data.sharesCount || 0;
    const views = data.viewsCount || 1;
    
    totalEngagement += likes + (comments * 2) + (shares * 3);
    totalViews += views;
  }
  
  if (totalViews === 0) {
    return 0;
  }
  
  return totalEngagement / totalViews;
}

/**
 * Calculate positive interaction ratio
 * Measures quality of interactions (likes/positive vs reports/negative)
 */
async function calculatePositiveRatio(earnerId: string): Promise<number> {
  // Get positive interactions
  const likesSnapshot = await db.collection('feed_posts')
    .where('userId', '==', earnerId)
    .select('likesCount')
    .limit(50)
    .get();
  
  let totalLikes = 0;
  for (const doc of likesSnapshot.docs) {
    totalLikes += doc.data().likesCount || 0;
  }
  
  // Get negative interactions (reports)
  const reportsSnapshot = await db.collection('user_reports')
    .where('reportedUserId', '==', earnerId)
    .count()
    .get();
  const totalReports = reportsSnapshot.data().count;
  
  // Calculate ratio
  const totalInteractions = totalLikes + totalReports;
  
  if (totalInteractions === 0) {
    return 1.0; // No data = benefit of doubt
  }
  
  return totalLikes / totalInteractions;
}

// ============================================================================
// FAIRNESS INJECTION
// ============================================================================

/**
 * Inject new earners into feed to ensure minimum representation
 * Ensures new earners appear even when top earners are active
 * 
 * @param feedItems - Current feed items
 * @param userId - User receiving feed
 * @param targetRatio - Target % of new earners (default 15%)
 * @returns Feed with new earners injected
 */
export async function injectNewCreators<T extends { earnerId: string; relevanceScore: number }>(
  feedItems: T[],
  userId: string,
  targetRatio: number = 0.15
): Promise<T[]> {
  const config = DEFAULT_RECOMMENDATION_CONFIG;
  
  if (!config.newCreatorBoostEnabled) {
    return feedItems;
  }
  
  // Count current new earners in feed
  let currentNewCreators = 0;
  for (const item of feedItems) {
    const boost = await calculateNewCreatorBoost(item.earnerId);
    if (boost.eligibleForBoost) {
      currentNewCreators++;
    }
  }
  
  const currentRatio = feedItems.length > 0 ? currentNewCreators / feedItems.length : 0;
  
  // If we already meet the target, no injection needed
  if (currentRatio >= targetRatio) {
    logger.info('[Pack134] New earner ratio already met', {
      currentRatio,
      targetRatio,
    });
    return feedItems;
  }
  
  // Calculate how many new earners we need to inject
  const targetCount = Math.ceil(feedItems.length * targetRatio);
  const needToInject = targetCount - currentNewCreators;
  
  if (needToInject <= 0) {
    return feedItems;
  }
  
  // Find eligible new earners not in current feed
  const currentCreatorIds = new Set(feedItems.map(item => item.earnerId));
  const newCreators = await findEligibleNewCreators(userId, currentCreatorIds, needToInject);
  
  if (newCreators.length === 0) {
    logger.info('[Pack134] No eligible new earners found');
    return feedItems;
  }
  
  // Inject new earners at strategic positions (not just at end)
  const result = [...feedItems];
  const injectionInterval = Math.floor(result.length / newCreators.length);
  
  for (let i = 0; i < newCreators.length; i++) {
    const insertPosition = (i + 1) * injectionInterval;
    if (insertPosition < result.length) {
      result.splice(insertPosition, 0, newCreators[i] as T);
    } else {
      result.push(newCreators[i] as T);
    }
  }
  
  logger.info('[Pack134] Injected new earners', {
    injected: newCreators.length,
    newRatio: (currentNewCreators + newCreators.length) / result.length,
  });
  
  return result;
}

/**
 * Find eligible new earners to inject into feed
 */
async function findEligibleNewCreators(
  userId: string,
  excludeCreatorIds: Set<string>,
  limit: number
): Promise<Array<{ earnerId: string; relevanceScore: number }>> {
  const config = DEFAULT_RECOMMENDATION_CONFIG;
  
  // Get user interests for matching
  const interestsDoc = await db.collection('user_interest_vectors').doc(userId).get();
  const interests = interestsDoc.data();
  
  // Query for new earners
  const eligibilityDate = Timestamp.fromMillis(
    Date.now() - (config.newCreatorDefinitionDays * 24 * 60 * 60 * 1000)
  );
  
  const newCreatorsSnapshot = await db.collection('users')
    .where('createdAt', '>=', eligibilityDate)
    .where('accountType', '==', 'CREATOR')
    .limit(50)
    .get();
  
  const eligibleCreators: Array<{ earnerId: string; relevanceScore: number }> = [];
  
  for (const doc of newCreatorsSnapshot.docs) {
    const earnerId = doc.id;
    
    // Skip if already in feed
    if (excludeCreatorIds.has(earnerId)) {
      continue;
    }
    
    // Skip self
    if (earnerId === userId) {
      continue;
    }
    
    // Calculate boost
    const boost = await calculateNewCreatorBoost(earnerId);
    
    if (!boost.eligibleForBoost) {
      continue;
    }
    
    // Calculate relevance score based on interest match
    let relevanceScore = 0.5; // Base score
    
    if (interests && boost.categories.length > 0) {
      for (const category of boost.categories) {
        const interestScore = interests.interests?.[category] || 0;
        relevanceScore = Math.max(relevanceScore, interestScore);
      }
    }
    
    // Apply boost
    relevanceScore *= boost.boostMultiplier;
    
    eligibleCreators.push({
      earnerId,
      relevanceScore,
    });
  }
  
  // Sort by relevance and return top N
  eligibleCreators.sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  return eligibleCreators.slice(0, limit);
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Get new earner statistics for monitoring
 * 
 * @returns Stats about new earner boost system
 */
export async function getNewCreatorStats(): Promise<{
  totalNewCreators: number;
  eligibleForBoost: number;
  averageBoostMultiplier: number;
  topBoostedCreators: Array<{ earnerId: string; boost: number }>;
}> {
  const config = DEFAULT_RECOMMENDATION_CONFIG;
  
  const eligibilityDate = Timestamp.fromMillis(
    Date.now() - (config.newCreatorDefinitionDays * 24 * 60 * 60 * 1000)
  );
  
  const newCreatorsSnapshot = await db.collection('users')
    .where('createdAt', '>=', eligibilityDate)
    .where('accountType', '==', 'CREATOR')
    .get();
  
  const totalNewCreators = newCreatorsSnapshot.size;
  let eligibleForBoost = 0;
  let totalBoost = 0;
  const boostedCreators: Array<{ earnerId: string; boost: number }> = [];
  
  for (const doc of newCreatorsSnapshot.docs) {
    const boost = await calculateNewCreatorBoost(doc.id);
    
    if (boost.eligibleForBoost) {
      eligibleForBoost++;
      totalBoost += boost.boostMultiplier;
      boostedCreators.push({
        earnerId: doc.id,
        boost: boost.boostMultiplier,
      });
    }
  }
  
  // Sort by boost and get top 10
  boostedCreators.sort((a, b) => b.boost - a.boost);
  const topBoostedCreators = boostedCreators.slice(0, 10);
  
  const averageBoostMultiplier = eligibleForBoost > 0 ? totalBoost / eligibleForBoost : 0;
  
  logger.info('[Pack134] New earner stats', {
    totalNewCreators,
    eligibleForBoost,
    averageBoostMultiplier,
  });
  
  return {
    totalNewCreators,
    eligibleForBoost,
    averageBoostMultiplier,
    topBoostedCreators,
  };
}

// ============================================================================
// ABUSE PREVENTION
// ============================================================================

/**
 * Detect and prevent new earner boost abuse
 * Prevents gaming the system through fake accounts or manipulation
 * 
 * @param earnerId - Creator to check
 * @returns Whether earner boost is valid
 */
export async function validateNewCreatorBoost(earnerId: string): Promise<boolean> {
  // Check for suspicious patterns
  const earnerDoc = await db.collection('users').doc(earnerId).get();
  const earnerData = earnerDoc.data();
  
  if (!earnerData) {
    return false;
  }
  
  // Check 1: Account must have real activity
  const postsSnapshot = await db.collection('feed_posts')
    .where('userId', '==', earnerId)
    .limit(1)
    .get();
  
  if (postsSnapshot.empty) {
    logger.warn('[Pack134] New earner boost denied: No posts', { earnerId });
    return false; // Must have at least 1 post
  }
  
  // Check 2: Not flagged for fraud
  const trustDoc = await db.collection('user_trust_profile').doc(earnerId).get();
  const trustData = trustDoc.data();
  
  if (trustData?.riskScore && trustData.riskScore > 50) {
    logger.warn('[Pack134] New earner boost denied: High risk score', { earnerId });
    return false; // High risk earners don't get boost
  }
  
  // Check 3: Not suspended
  const enforcementDoc = await db.collection('user_enforcement_state').doc(earnerId).get();
  const enforcementData = enforcementDoc.data();
  
  if (enforcementData?.level === 'SUSPENDED') {
    logger.warn('[Pack134] New earner boost denied: Suspended', { earnerId });
    return false;
  }
  
  return true; // All checks passed
}

























