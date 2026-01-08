/**
 * PACK 219 - Royal Dynamic Chat Pricing Evolution
 * 
 * This module enables qualified earners to raise their chat entry price
 * from the base 100 tokens to 120-500 tokens based on demand, chemistry, and rank.
 * 
 * KEY RULES:
 * - Base price remains 100 tokens
 * - Only qualified earners can increase price
 * - Price tiers: Standard(100), Glow(120), Desire(175), Star(250), Royal(350), Fantasy(500)
 * - 65% to earner, 35% to Avalo (unchanged from base system)
 * - Price change cooldown: 7 days
 * - Auto-fallback if demand drops 65% in 14 days
 * - Does NOT affect word-to-token ratio (7/11 stays the same)
 */

import { db, serverTimestamp, increment, generateId } from './init.js';

// ============================================================================
// TYPES
// ============================================================================

export type PriceTier = 'STANDARD' | 'GLOW' | 'DESIRE' | 'STAR' | 'ROYAL' | 'FANTASY';

export interface PriceTierConfig {
  tier: PriceTier;
  name: string;
  tokenCost: number;
  description: string;
  minReputation?: number;
}

export interface DynamicPricingEligibility {
  eligible: boolean;
  reasons: string[];
  requirements: {
    verifiedIdentity: boolean;
    verifiedAppearance: boolean;
    cleanReputation: boolean;
    sufficientActivity: boolean;
    goodChemistry: boolean;
    recentEngagement: boolean;
  };
  maxTierAllowed: PriceTier;
}

export interface PricingAnalytics {
  currentTier: PriceTier;
  currentPrice: number;
  chatsInitiated: number;
  chatsCompleted: number;
  conversionRate: number;
  averageEarnings: number;
  demandTrend: 'rising' | 'stable' | 'falling';
  recommendedAction: 'increase' | 'maintain' | 'decrease';
}

export interface ChatPricingHistory {
  userId: string;
  tier: PriceTier;
  price: number;
  changedAt: FirebaseFirestore.Timestamp;
  changedFrom?: PriceTier;
  reason: string;
  analytics: {
    chatsLast14Days: number;
    earningsLast14Days: number;
    conversionRate: number;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PRICE_TIERS: Record<PriceTier, PriceTierConfig> = {
  STANDARD: {
    tier: 'STANDARD',
    name: 'Standard',
    tokenCost: 100,
    description: 'Default entry price for all chats'
  },
  GLOW: {
    tier: 'GLOW',
    name: 'Glow',
    tokenCost: 120,
    description: 'Subtle boost for rising creators',
    minReputation: 50
  },
  DESIRE: {
    tier: 'DESIRE',
    name: 'Desire',
    tokenCost: 175,
    description: 'Medium boost for established creators',
    minReputation: 75
  },
  STAR: {
    tier: 'STAR',
    name: 'Star',
    tokenCost: 250,
    description: 'High attraction & demand tier',
    minReputation: 85
  },
  ROYAL: {
    tier: 'ROYAL',
    name: 'Royal',
    tokenCost: 350,
    description: 'Elite tier for top performers',
    minReputation: 90
  },
  FANTASY: {
    tier: 'FANTASY',
    name: 'Fantasy',
    tokenCost: 500,
    description: 'Maximum tier for highest demand',
    minReputation: 95
  }
};

// Eligibility thresholds
const ELIGIBILITY_REQUIREMENTS = {
  MIN_COMPLETED_CHATS: 20,
  MIN_GOOD_VIBES: 6,
  MIN_UNIQUE_GOOD_VIBES: 6,
  SAFETY_FLAG_LOOKBACK_DAYS: 60,
  RECENT_ACTIVITY_DAYS: 14,
  MIN_VERIFIED_SELFIES: 2,
  PRICE_CHANGE_COOLDOWN_DAYS: 7,
  DEMAND_DROP_THRESHOLD: 0.65, // 65% drop triggers fallback
  DEMAND_ANALYSIS_DAYS: 14
};

// Revenue split (same as base system)
const EARNER_SHARE = 0.65; // 65%
const PLATFORM_SHARE = 0.35; // 35%

// ============================================================================
// ELIGIBILITY EVALUATION
// ============================================================================

/**
 * Evaluate if a user is eligible for dynamic pricing
 * This runs weekly as a background job
 */
export async function evaluatePricingEligibility(
  userId: string
): Promise<DynamicPricingEligibility> {
  
  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  
  if (!userSnap.exists) {
    return {
      eligible: false,
      reasons: ['User not found'],
      requirements: {
        verifiedIdentity: false,
        verifiedAppearance: false,
        cleanReputation: false,
        sufficientActivity: false,
        goodChemistry: false,
        recentEngagement: false
      },
      maxTierAllowed: 'STANDARD'
    };
  }
  
  const user = userSnap.data() as any;
  const reasons: string[] = [];
  
  // Check 1: Verified Identity (selfie + document match)
  const verifiedIdentity = !!(
    user.verification?.identity?.completed &&
    user.verification?.identity?.status === 'approved'
  );
  if (!verifiedIdentity) {
    reasons.push('Identity verification not complete');
  }
  
  // Check 2: Verified Appearance (selfie match on at least 2 completed dates)
  const verifiedAppearance = (user.verification?.appearance?.completedDates || 0) >= 
    ELIGIBILITY_REQUIREMENTS.MIN_VERIFIED_SELFIES;
  if (!verifiedAppearance) {
    reasons.push(`Need ${ELIGIBILITY_REQUIREMENTS.MIN_VERIFIED_SELFIES} verified dates`);
  }
  
  // Check 3: Clean Reputation (no safety flags in last 60 days)
  const cleanReputation = await checkCleanReputation(userId);
  if (!cleanReputation) {
    reasons.push('Safety flags detected in last 60 days');
  }
  
  // Check 4: Sufficient Activity (20+ completed chats)
  const completedChats = user.stats?.completedChats || 0;
  const sufficientActivity = completedChats >= ELIGIBILITY_REQUIREMENTS.MIN_COMPLETED_CHATS;
  if (!sufficientActivity) {
    reasons.push(`Need ${ELIGIBILITY_REQUIREMENTS.MIN_COMPLETED_CHATS} completed chats (have ${completedChats})`);
  }
  
  // Check 5: Good Chemistry (6+ "Good Vibe" marks from different users)
  const goodChemistryData = await checkGoodChemistry(userId);
  const goodChemistry = goodChemistryData.count >= ELIGIBILITY_REQUIREMENTS.MIN_GOOD_VIBES &&
                        goodChemistryData.uniqueUsers >= ELIGIBILITY_REQUIREMENTS.MIN_UNIQUE_GOOD_VIBES;
  if (!goodChemistry) {
    reasons.push(`Need ${ELIGIBILITY_REQUIREMENTS.MIN_GOOD_VIBES} Good Vibes from ${ELIGIBILITY_REQUIREMENTS.MIN_UNIQUE_GOOD_VIBES} different users`);
  }
  
  // Check 6: Recent Engagement (activity in last 14 days)
  const recentEngagement = await checkRecentEngagement(userId);
  if (!recentEngagement) {
    reasons.push(`No activity in last ${ELIGIBILITY_REQUIREMENTS.RECENT_ACTIVITY_DAYS} days`);
  }
  
  const eligible = verifiedIdentity && verifiedAppearance && cleanReputation && 
                   sufficientActivity && goodChemistry && recentEngagement;
  
  // Determine max tier allowed based on reputation score
  const reputationScore = user.reputation?.score || 0;
  let maxTierAllowed: PriceTier = 'STANDARD';
  
  if (eligible) {
    if (reputationScore >= 95) maxTierAllowed = 'FANTASY';
    else if (reputationScore >= 90) maxTierAllowed = 'ROYAL';
    else if (reputationScore >= 85) maxTierAllowed = 'STAR';
    else if (reputationScore >= 75) maxTierAllowed = 'DESIRE';
    else if (reputationScore >= 50) maxTierAllowed = 'GLOW';
  }
  
  return {
    eligible,
    reasons: reasons.length > 0 ? reasons : ['All requirements met'],
    requirements: {
      verifiedIdentity,
      verifiedAppearance,
      cleanReputation,
      sufficientActivity,
      goodChemistry,
      recentEngagement
    },
    maxTierAllowed
  };
}

/**
 * Check if user has clean reputation (no safety flags in last 60 days)
 */
async function checkCleanReputation(userId: string): Promise<boolean> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - ELIGIBILITY_REQUIREMENTS.SAFETY_FLAG_LOOKBACK_DAYS);
  
  const safetyFlags = await db.collection('safety_incidents')
    .where('userId', '==', userId)
    .where('createdAt', '>=', cutoffDate)
    .where('severity', 'in', ['medium', 'high', 'critical'])
    .limit(1)
    .get();
  
  return safetyFlags.empty;
}

/**
 * Check Good Vibe marks from different users
 */
async function checkGoodChemistry(userId: string): Promise<{ count: number; uniqueUsers: number }> {
  const goodVibes = await db.collection('chemistry_marks')
    .where('receiverId', '==', userId)
    .where('mark', '==', 'good_vibe')
    .get();
  
  const uniqueUsers = new Set(goodVibes.docs.map(doc => doc.data().senderId));
  
  return {
    count: goodVibes.size,
    uniqueUsers: uniqueUsers.size
  };
}

/**
 * Check recent engagement
 */
async function checkRecentEngagement(userId: string): Promise<boolean> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - ELIGIBILITY_REQUIREMENTS.RECENT_ACTIVITY_DAYS);
  
  const recentActivity = await db.collection('user_activity')
    .where('userId', '==', userId)
    .where('timestamp', '>=', cutoffDate)
    .limit(1)
    .get();
  
  return !recentActivity.empty;
}

// ============================================================================
// PRICE TIER MANAGEMENT
// ============================================================================

/**
 * Get current pricing tier for a user
 */
export async function getUserPricingTier(userId: string): Promise<PriceTierConfig> {
  const pricingRef = db.collection('dynamic_pricing').doc(userId);
  const pricingSnap = await pricingRef.get();
  
  if (!pricingSnap.exists) {
    return PRICE_TIERS.STANDARD;
  }
  
  const pricingData = pricingSnap.data() as any;
  const tier = pricingData.currentTier || 'STANDARD';
  
  return PRICE_TIERS[tier as PriceTier];
}

/**
 * Change user's pricing tier
 * Enforces cooldown and eligibility checks
 */
export async function changePricingTier(
  userId: string,
  newTier: PriceTier,
  reason: string = 'manual_change'
): Promise<{ success: boolean; message: string }> {
  
  // Check eligibility
  const eligibility = await evaluatePricingEligibility(userId);
  
  if (!eligibility.eligible && newTier !== 'STANDARD') {
    return {
      success: false,
      message: `Not eligible for dynamic pricing: ${eligibility.reasons.join(', ')}`
    };
  }
  
  // Check if new tier is allowed
  const tierOrder: PriceTier[] = ['STANDARD', 'GLOW', 'DESIRE', 'STAR', 'ROYAL', 'FANTASY'];
  const maxTierIndex = tierOrder.indexOf(eligibility.maxTierAllowed);
  const requestedTierIndex = tierOrder.indexOf(newTier);
  
  if (requestedTierIndex > maxTierIndex) {
    return {
      success: false,
      message: `Maximum allowed tier is ${eligibility.maxTierAllowed} based on reputation`
    };
  }
  
  // Check cooldown
  const pricingRef = db.collection('dynamic_pricing').doc(userId);
  const pricingSnap = await pricingRef.get();
  
  if (pricingSnap.exists) {
    const pricingData = pricingSnap.data() as any;
    const lastChanged = pricingData.lastChangedAt?.toDate();
    
    if (lastChanged && reason === 'manual_change') {
      const daysSinceChange = (Date.now() - lastChanged.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceChange < ELIGIBILITY_REQUIREMENTS.PRICE_CHANGE_COOLDOWN_DAYS) {
        return {
          success: false,
          message: `Price change cooldown: ${Math.ceil(ELIGIBILITY_REQUIREMENTS.PRICE_CHANGE_COOLDOWN_DAYS - daysSinceChange)} days remaining`
        };
      }
    }
  }
  
  // Get current analytics for history
  const analytics = await getCurrentAnalytics(userId);
  
  // Update pricing
  const currentTier = pricingSnap.exists ? pricingSnap.data()?.currentTier : 'STANDARD';
  const newPrice = PRICE_TIERS[newTier].tokenCost;
  
  await pricingRef.set({
    userId,
    currentTier: newTier,
    currentPrice: newPrice,
    lastChangedAt: serverTimestamp(),
    lastChangedFrom: currentTier,
    eligibility: eligibility,
    updatedAt: serverTimestamp()
  }, { merge: true });
  
  // Record history
  const historyRef = db.collection('dynamic_pricing').doc(userId).collection('history').doc(generateId());
  await historyRef.set({
    userId,
    tier: newTier,
    price: newPrice,
    changedAt: serverTimestamp(),
    changedFrom: currentTier,
    reason,
    analytics: {
      chatsLast14Days: analytics.chatsInitiated,
      earningsLast14Days: analytics.averageEarnings,
      conversionRate: analytics.conversionRate
    }
  });
  
  return {
    success: true,
    message: `Tier changed to ${PRICE_TIERS[newTier].name} (${newPrice} tokens)`
  };
}

// ============================================================================
// AUTO-FALLBACK MECHANISM
// ============================================================================

/**
 * Check and apply auto-fallback if demand drops significantly
 * Should run daily as background job
 */
export async function checkAndApplyDemandFallback(userId: string): Promise<boolean> {
  const pricingRef = db.collection('dynamic_pricing').doc(userId);
  const pricingSnap = await pricingRef.get();
  
  if (!pricingSnap.exists) {
    return false;
  }
  
  const pricingData = pricingSnap.data() as any;
  const currentTier = pricingData.currentTier as PriceTier;
  
  // Only check for tiers above STANDARD
  if (currentTier === 'STANDARD') {
    return false;
  }
  
  // Get chat metrics for last 14 days
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - ELIGIBILITY_REQUIREMENTS.DEMAND_ANALYSIS_DAYS);
  
  const recentChats = await db.collection('chats')
    .where('roles.earnerId', '==', userId)
    .where('createdAt', '>=', cutoffDate)
    .get();
  
  // Get previous 14 days for comparison
  const previousCutoffDate = new Date(cutoffDate);
  previousCutoffDate.setDate(previousCutoffDate.getDate() - ELIGIBILITY_REQUIREMENTS.DEMAND_ANALYSIS_DAYS);
  
  const previousChats = await db.collection('chats')
    .where('roles.earnerId', '==', userId)
    .where('createdAt', '>=', previousCutoffDate)
    .where('createdAt', '<', cutoffDate)
    .get();
  
  const recentCount = recentChats.size;
  const previousCount = previousChats.size;
  
  // Calculate drop percentage
  if (previousCount === 0) {
    return false; // Can't calculate drop if no previous data
  }
  
  const dropPercentage = 1 - (recentCount / previousCount);
  
  // If drop is >= 65%, fallback to cheaper tier
  if (dropPercentage >= ELIGIBILITY_REQUIREMENTS.DEMAND_DROP_THRESHOLD) {
    const tierOrder: PriceTier[] = ['STANDARD', 'GLOW', 'DESIRE', 'STAR', 'ROYAL', 'FANTASY'];
    const currentIndex = tierOrder.indexOf(currentTier);
    const newTier = currentIndex > 0 ? tierOrder[currentIndex - 1] : 'STANDARD';
    
    const result = await changePricingTier(
      userId,
      newTier,
      `auto_fallback_demand_drop_${Math.round(dropPercentage * 100)}%`
    );
    
    return result.success;
  }
  
  return false;
}

/**
 * Run auto-fallback check for all users with dynamic pricing
 * Should be scheduled to run daily
 */
export async function runDailyDemandFallbackCheck(): Promise<number> {
  const dynamicPricingUsers = await db.collection('dynamic_pricing')
    .where('currentTier', '!=', 'STANDARD')
    .get();
  
  let fallbackCount = 0;
  
  for (const doc of dynamicPricingUsers.docs) {
    try {
      const applied = await checkAndApplyDemandFallback(doc.id);
      if (applied) {
        fallbackCount++;
      }
    } catch (error) {
      console.error(`Failed to check demand fallback for ${doc.id}:`, error);
    }
  }
  
  return fallbackCount;
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Get current analytics for a user's pricing
 */
async function getCurrentAnalytics(userId: string): Promise<PricingAnalytics> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 14);
  
  // Get chats in last 14 days
  const chats = await db.collection('chats')
    .where('roles.earnerId', '==', userId)
    .where('createdAt', '>=', cutoffDate)
    .get();
  
  const chatsInitiated = chats.size;
  const chatsCompleted = chats.docs.filter(doc => {
    const data = doc.data();
    return data.state === 'CLOSED' && (data.billing?.totalConsumed || 0) > 0;
  }).length;
  
  const conversionRate = chatsInitiated > 0 ? chatsCompleted / chatsInitiated : 0;
  
  // Calculate earnings
  const totalEarnings = chats.docs.reduce((sum, doc) => {
    const data = doc.data();
    const consumed = data.billing?.totalConsumed || 0;
    return sum + (consumed * EARNER_SHARE);
  }, 0);
  
  const averageEarnings = chatsCompleted > 0 ? totalEarnings / chatsCompleted : 0;
  
  // Determine trend
  const previousCutoffDate = new Date(cutoffDate);
  previousCutoffDate.setDate(previousCutoffDate.getDate() - 14);
  
  const previousChats = await db.collection('chats')
    .where('roles.earnerId', '==', userId)
    .where('createdAt', '>=', previousCutoffDate)
    .where('createdAt', '<', cutoffDate)
    .get();
  
  const previousCount = previousChats.size;
  let demandTrend: 'rising' | 'stable' | 'falling' = 'stable';
  
  if (chatsInitiated > previousCount * 1.2) {
    demandTrend = 'rising';
  } else if (chatsInitiated < previousCount * 0.8) {
    demandTrend = 'falling';
  }
  
  // Recommend action
  let recommendedAction: 'increase' | 'maintain' | 'decrease' = 'maintain';
  if (demandTrend === 'rising' && conversionRate > 0.7) {
    recommendedAction = 'increase';
  } else if (demandTrend === 'falling' || conversionRate < 0.3) {
    recommendedAction = 'decrease';
  }
  
  const pricingSnap = await db.collection('dynamic_pricing').doc(userId).get();
  const currentTier = pricingSnap.exists ? pricingSnap.data()?.currentTier || 'STANDARD' : 'STANDARD';
  const currentPrice = PRICE_TIERS[currentTier as PriceTier].tokenCost;
  
  return {
    currentTier: currentTier as PriceTier,
    currentPrice,
    chatsInitiated,
    chatsCompleted,
    conversionRate,
    averageEarnings,
    demandTrend,
    recommendedAction
  };
}

/**
 * Get detailed analytics page data for earner
 */
export async function getPricingAnalytics(userId: string): Promise<PricingAnalytics> {
  return getCurrentAnalytics(userId);
}

// ============================================================================
// INTEGRATION WITH CHAT INITIALIZATION
// ============================================================================

/**
 * Get the chat entry price for a user
 * This should be called when determining chat costs
 */
export async function getChatEntryPrice(earnerId: string | null): Promise<number> {
  if (!earnerId) {
    return PRICE_TIERS.STANDARD.tokenCost; // Avalo earns, use standard
  }
  
  const tierConfig = await getUserPricingTier(earnerId);
  return tierConfig.tokenCost;
}

/**
 * Calculate revenue split for dynamic pricing
 * Returns amounts for earner and platform
 */
export function calculateRevenueSplit(entryPrice: number): {
  earnerAmount: number;
  platformAmount: number;
} {
  const platformAmount = Math.ceil(entryPrice * PLATFORM_SHARE);
  const earnerAmount = entryPrice - platformAmount;
  
  return {
    earnerAmount,
    platformAmount
  };
}

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

/**
 * Weekly eligibility evaluation job
 * Should be scheduled to run weekly
 */
export async function runWeeklyEligibilityEvaluation(): Promise<number> {
  // Get all users with earnOnChat enabled
  const earners = await db.collection('users')
    .where('modes.earnFromChat', '==', true)
    .get();
  
  let evaluatedCount = 0;
  
  for (const earnerDoc of earners.docs) {
    try {
      const eligibility = await evaluatePricingEligibility(earnerDoc.id);
      
      // Store eligibility result
      await db.collection('dynamic_pricing').doc(earnerDoc.id).set({
        userId: earnerDoc.id,
        eligibility,
        lastEvaluatedAt: serverTimestamp()
      }, { merge: true });
      
      evaluatedCount++;
    } catch (error) {
      console.error(`Failed to evaluate eligibility for ${earnerDoc.id}:`, error);
    }
  }
  
  return evaluatedCount;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  PRICE_TIERS,
  ELIGIBILITY_REQUIREMENTS
};