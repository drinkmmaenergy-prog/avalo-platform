/**
 * PACK 144 - Royal Club & Loyalty Ecosystem 2.0
 * Safety middleware to enforce ethical constraints
 * 
 * CRITICAL SAFEGUARDS:
 * - Block romantic/attention-seeking mission types
 * - Block NSFW mission content
 * - No influence on search/feed/discovery/matches
 * - No token bonuses or discounts
 * - No creator earning advantages
 */

import { FORBIDDEN_MISSION_PATTERNS, ALLOWED_CHANNEL_CATEGORIES } from './types';

/**
 * Validate mission content for safety
 * Returns true if mission is safe, false otherwise
 */
export function validateMissionSafety(
  title: string,
  description: string,
  requirements: any
): { isSafe: boolean; violations: string[] } {
  const violations: string[] = [];
  const contentToCheck = `${title} ${description} ${JSON.stringify(requirements)}`.toLowerCase();

  // Check for forbidden patterns
  for (const pattern of FORBIDDEN_MISSION_PATTERNS) {
    if (contentToCheck.includes(pattern.toLowerCase())) {
      violations.push(`Contains forbidden pattern: ${pattern}`);
    }
  }

  // Check for gender-specific targeting
  const genderPatterns = ['male', 'female', 'men', 'women', 'girls', 'boys', 'guy', 'gal'];
  for (const pattern of genderPatterns) {
    if (contentToCheck.includes(pattern)) {
      violations.push(`Contains gender-specific targeting: ${pattern}`);
    }
  }

  // Check for appearance-based requirements
  const appearancePatterns = ['photo', 'picture', 'selfie', 'face', 'body', 'outfit', 'look'];
  for (const pattern of appearancePatterns) {
    if (contentToCheck.includes(pattern)) {
      violations.push(`Contains appearance-based requirement: ${pattern}`);
    }
  }

  // Check for social validation patterns
  const validationPatterns = ['like', 'view', 'follower', 'subscriber', 'fan', 'admirer'];
  for (const pattern of validationPatterns) {
    if (contentToCheck.includes(pattern)) {
      violations.push(`Contains social validation pattern: ${pattern}`);
    }
  }

  return {
    isSafe: violations.length === 0,
    violations
  };
}

/**
 * Validate reward doesn't provide unfair advantages
 */
export function validateRewardSafety(
  rewardType: string,
  rewardData: any
): { isSafe: boolean; violations: string[] } {
  const violations: string[] = [];

  // Forbidden reward types that give advantages
  const forbiddenRewardTypes = [
    'token_discount',
    'token_bonus',
    'visibility_boost',
    'feed_priority',
    'discovery_boost',
    'match_priority',
    'swipe_boost',
    'creator_revenue_share',
    'earnings_boost',
    'unlimited_likes',
    'unlimited_messages',
    'priority_replies'
  ];

  if (forbiddenRewardTypes.includes(rewardType)) {
    violations.push(`Forbidden reward type: ${rewardType}`);
  }

  // Check reward data for monetary advantages
  const rewardDataString = JSON.stringify(rewardData).toLowerCase();
  const monetaryPatterns = ['discount', 'bonus', 'token', 'price', 'revenue', 'earning', 'money', 'payment'];
  for (const pattern of monetaryPatterns) {
    if (rewardDataString.includes(pattern)) {
      violations.push(`Reward contains monetary advantage: ${pattern}`);
    }
  }

  // Check for visibility/performance advantages
  const performancePatterns = ['boost', 'priority', 'visibility', 'ranking', 'algorithm', 'feed', 'discovery'];
  for (const pattern of performancePatterns) {
    if (rewardDataString.includes(pattern)) {
      violations.push(`Reward provides performance advantage: ${pattern}`);
    }
  }

  return {
    isSafe: violations.length === 0,
    violations
  };
}

/**
 * Validate lifestyle channel is appropriate
 */
export function validateLifestyleChannel(
  category: string,
  allowedTopics: string[],
  channelDescription: string
): { isSafe: boolean; violations: string[] } {
  const violations: string[] = [];

  // Check if category is allowed
  if (!ALLOWED_CHANNEL_CATEGORIES.includes(category as any)) {
    violations.push(`Forbidden channel category: ${category}`);
  }

  // Check channel description for forbidden content
  const descriptionLower = channelDescription.toLowerCase();
  
  const forbiddenChannelPatterns = [
    'dating',
    'flirt',
    'romance',
    'relationship',
    'match',
    'swipe',
    'hookup',
    'nsfw',
    'adult',
    'sexy',
    'intimate'
  ];

  for (const pattern of forbiddenChannelPatterns) {
    if (descriptionLower.includes(pattern)) {
      violations.push(`Channel description contains forbidden content: ${pattern}`);
    }
  }

  // Check allowed topics
  for (const topic of allowedTopics) {
    const topicLower = topic.toLowerCase();
    for (const pattern of forbiddenChannelPatterns) {
      if (topicLower.includes(pattern)) {
        violations.push(`Allowed topic contains forbidden content: ${topic}`);
      }
    }
  }

  return {
    isSafe: violations.length === 0,
    violations
  };
}

/**
 * Validate activity log doesn't track forbidden behaviors
 */
export function validateActivityLog(
  activityType: string,
  activityData: any
): { isSafe: boolean; violations: string[] } {
  const violations: string[] = [];

  // Forbidden activity types
  const forbiddenActivityTypes = [
    'romantic_interaction',
    'flirt_message',
    'nsfw_view',
    'match_made',
    'swipe_action',
    'date_request',
    'compliment_received',
    'attention_gained'
  ];

  if (forbiddenActivityTypes.includes(activityType)) {
    violations.push(`Forbidden activity type: ${activityType}`);
  }

  // Check activity data
  const activityDataString = JSON.stringify(activityData).toLowerCase();
  
  for (const pattern of FORBIDDEN_MISSION_PATTERNS) {
    if (activityDataString.includes(pattern.toLowerCase())) {
      violations.push(`Activity data contains forbidden pattern: ${pattern}`);
    }
  }

  return {
    isSafe: violations.length === 0,
    violations
  };
}

/**
 * Ensure Royal Club status doesn't affect platform algorithms
 * This is a validation function to verify no code attempts to use Royal Club
 * status for feed/discovery/matching advantages
 */
export function validateNoAlgorithmicAdvantage(
  context: 'feed' | 'discovery' | 'matching' | 'search',
  parameters: any
): { isValid: boolean; violations: string[] } {
  const violations: string[] = [];
  
  // Check if Royal Club status is being used in ranking/filtering
  const paramString = JSON.stringify(parameters).toLowerCase();
  
  const forbiddenUsage = [
    'royalclub',
    'royal_club',
    'rc_level',
    'premium_member',
    'vip_status'
  ];

  for (const term of forbiddenUsage) {
    if (paramString.includes(term)) {
      violations.push(`Royal Club status detected in ${context} algorithm: ${term}`);
    }
  }

  return {
    isValid: violations.length === 0,
    violations
  };
}

/**
 * Validate user badge display settings don't create toxic dynamics
 */
export function validateBadgeDisplay(
  showBadgeInProfile: boolean,
  showLevelInChats: boolean,
  context: string
): { isSafe: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Warn if trying to display badges in competitive contexts
  const competitiveContexts = ['swipe', 'match', 'discovery', 'feed'];
  
  if (competitiveContexts.includes(context) && (showBadgeInProfile || showLevelInChats)) {
    warnings.push(`Badge display in ${context} may create elitism - recommend hiding badges in competitive contexts`);
  }

  return {
    isSafe: true, // Warnings only, user can choose
    warnings
  };
}

/**
 * Rate limiting for Royal Club actions to prevent abuse
 */
const actionRateLimits = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  userId: string,
  action: string,
  maxActions: number,
  windowMs: number
): { allowed: boolean; remainingActions: number; resetIn: number } {
  const key = `${userId}:${action}`;
  const now = Date.now();
  
  let limit = actionRateLimits.get(key);
  
  if (!limit || now > limit.resetAt) {
    limit = {
      count: 0,
      resetAt: now + windowMs
    };
    actionRateLimits.set(key, limit);
  }

  if (limit.count >= maxActions) {
    return {
      allowed: false,
      remainingActions: 0,
      resetIn: limit.resetAt - now
    };
  }

  limit.count++;
  
  return {
    allowed: true,
    remainingActions: maxActions - limit.count,
    resetIn: limit.resetAt - now
  };
}

/**
 * Validate no token pricing manipulation
 */
export function validateTokenPricing(
  userId: string,
  royalClubLevel: string | null,
  tokenPrice: number,
  baseTokenPrice: number
): { isValid: boolean; violations: string[] } {
  const violations: string[] = [];

  // Token price must always equal base price
  if (tokenPrice !== baseTokenPrice) {
    violations.push(`Token price (${tokenPrice}) does not match base price (${baseTokenPrice})`);
  }

  // Royal Club level should never affect pricing
  if (royalClubLevel && tokenPrice !== baseTokenPrice) {
    violations.push(`Royal Club member has different token price - this is forbidden`);
  }

  return {
    isValid: violations.length === 0,
    violations
  };
}

/**
 * Validate creator revenue split is not affected
 */
export function validateRevenueSplit(
  creatorShare: number,
  platformShare: number,
  royalClubInvolved: boolean
): { isValid: boolean; violations: string[] } {
  const violations: string[] = [];

  const expectedCreatorShare = 0.65;
  const expectedPlatformShare = 0.35;

  if (Math.abs(creatorShare - expectedCreatorShare) > 0.001) {
    violations.push(`Creator share (${creatorShare}) does not match required 65%`);
  }

  if (Math.abs(platformShare - expectedPlatformShare) > 0.001) {
    violations.push(`Platform share (${platformShare}) does not match required 35%`);
  }

  if (royalClubInvolved && (creatorShare !== expectedCreatorShare || platformShare !== expectedPlatformShare)) {
    violations.push(`Royal Club transaction has modified revenue split - this is forbidden`);
  }

  return {
    isValid: violations.length === 0,
    violations
  };
}

/**
 * Export all validation functions
 */
export const RoyalClubSafetyMiddleware = {
  validateMissionSafety,
  validateRewardSafety,
  validateLifestyleChannel,
  validateActivityLog,
  validateNoAlgorithmicAdvantage,
  validateBadgeDisplay,
  checkRateLimit,
  validateTokenPricing,
  validateRevenueSplit
};