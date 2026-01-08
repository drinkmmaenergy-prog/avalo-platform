/**
 * Phase 17 - Ads & Rewarded Tokens Engine
 *
 * Manages rewarded ad token distribution with:
 * - Daily caps (20 ads/day max = 220 tokens)
 * - 10 tokens per completed ad
 * - +10 bonus every 10 ads
 * - Trust engine integration
 * - Ranking integration (ads contribute 0.5x points)
 * - Eligibility checks (18+, verified, active)
 *
 * IMPORTANT: This is ADDITIVE ONLY - does not modify existing monetization.
 */

import { db, serverTimestamp, increment, generateId } from './init';
import { recordRiskEvent } from './trustEngine';
import { recordRankingAction } from './rankingEngine';

// Simple logger (Node.js compatible)
const logger = {
  info: (...args: any[]) => {
    // eslint-disable-next-line no-console
    console.log('[AdRewards]', ...args);
  },
  warn: (...args: any[]) => {
    // eslint-disable-next-line no-console
    console.warn('[AdRewards]', ...args);
  },
  error: (...args: any[]) => {
    // eslint-disable-next-line no-console
    console.error('[AdRewards]', ...args);
  },
};

// Simple error class
class HttpsError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'HttpsError';
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface AdRewardsStatus {
  userId: string;
  rewardedAdsWatchedToday: number;
  rewardedAdsWatchedLifetime: number;
  tokensEarnedFromAdsToday: number;
  tokensEarnedFromAdsLifetime: number;
  tenAdCycleCount: number; // 0-9, resets to 0 after bonus
  dailyLimit: number;
  remainingAdsToday: number;
  tokensPerAd: number;
  bonusEvery: number;
  bonusTokens: number;
  canWatchAd: boolean;
  reasonIfBlocked?: string;
  lastAdWatchAt?: any;
  dailyResetAt?: any;
}

export interface AdRewardsDocument {
  userId: string;
  rewardedAdsWatchedToday: number;
  rewardedAdsWatchedLifetime: number;
  tokensEarnedFromAdsToday: number;
  tokensEarnedFromAdsLifetime: number;
  tenAdCycleCount: number;
  lastAdWatchAt: any;
  dailyResetAt: any;
  createdAt: any;
  updatedAt: any;
}

export interface RewardedAdWatchResult {
  success: boolean;
  tokensAwarded: number;
  bonusAwarded: number;
  totalAwarded: number;
  newBalance: number;
  adsWatchedToday: number;
  remainingToday: number;
  progressToBonus: number; // 0-9
  message: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const AD_REWARDS_CONFIG = {
  TOKENS_PER_AD: 10,
  BONUS_EVERY_N_ADS: 10,
  BONUS_TOKENS: 10,
  DAILY_AD_LIMIT: 20,
  MIN_AGE: 18,
  RANKING_POINTS_MULTIPLIER: 0.5, // Ads contribute 50% of normal points
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if it's a new day and reset counters if needed
 */
function shouldResetDaily(dailyResetAt: any): boolean {
  if (!dailyResetAt) return true;
  
  const resetDate = dailyResetAt.toDate ? dailyResetAt.toDate() : new Date(dailyResetAt);
  const now = new Date();
  
  // Check if we're in a new UTC day
  const resetDay = resetDate.getUTCDate();
  const currentDay = now.getUTCDate();
  
  return resetDay !== currentDay;
}

/**
 * Get midnight UTC for today
 */
function getMidnightUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

/**
 * Check user eligibility for ad rewards
 */
async function checkUserEligibility(userId: string): Promise<{ 
  eligible: boolean; 
  reason?: string;
}> {
  try {
    // Get user profile
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      return { eligible: false, reason: 'User not found' };
    }
    
    const userData = userSnap.data() as any;
    
    // Check account status
    const status = userData.accountStatus || userData.status;
    if (status === 'suspended' || status === 'deleted' || status === 'hard_deleted') {
      return { eligible: false, reason: 'Account is not active' };
    }
    
    // Check age verification (18+)
    const isVerified18Plus = userData.age18Verified || userData.isAge18Verified || false;
    if (!isVerified18Plus) {
      return { eligible: false, reason: 'Age verification required (18+)' };
    }
    
    // Check if user has at least basic profile info
    if (!userData.uid) {
      return { eligible: false, reason: 'Incomplete user profile' };
    }
    
    return { eligible: true };
  } catch (error) {
    logger.error('Error checking user eligibility:', error);
    return { eligible: false, reason: 'Error verifying eligibility' };
  }
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get or create ad rewards document for user
 */
async function getOrCreateAdRewards(userId: string): Promise<AdRewardsDocument> {
  const docRef = db.collection('adRewards').doc(userId);
  const docSnap = await docRef.get();
  
  if (docSnap.exists) {
    const data = docSnap.data() as AdRewardsDocument;
    
    // Check if we need to reset daily counters
    if (shouldResetDaily(data.dailyResetAt)) {
      const resetData = {
        rewardedAdsWatchedToday: 0,
        tokensEarnedFromAdsToday: 0,
        dailyResetAt: getMidnightUTC(),
        updatedAt: serverTimestamp(),
      };
      
      await docRef.update(resetData);
      
      return {
        ...data,
        ...resetData,
      };
    }
    
    return data;
  }
  
  // Create new document
  const newDoc: AdRewardsDocument = {
    userId,
    rewardedAdsWatchedToday: 0,
    rewardedAdsWatchedLifetime: 0,
    tokensEarnedFromAdsToday: 0,
    tokensEarnedFromAdsLifetime: 0,
    tenAdCycleCount: 0,
    lastAdWatchAt: null,
    dailyResetAt: getMidnightUTC(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  
  await docRef.set(newDoc);
  return newDoc;
}

/**
 * Get ad rewards status for user
 */
export async function getAdRewardsStatus(userId: string): Promise<AdRewardsStatus> {
  try {
    // Check eligibility
    const eligibility = await checkUserEligibility(userId);
    
    // Get rewards document
    const rewardsDoc = await getOrCreateAdRewards(userId);
    
    const remainingAdsToday = Math.max(
      0,
      AD_REWARDS_CONFIG.DAILY_AD_LIMIT - rewardsDoc.rewardedAdsWatchedToday
    );
    
    const status: AdRewardsStatus = {
      userId,
      rewardedAdsWatchedToday: rewardsDoc.rewardedAdsWatchedToday,
      rewardedAdsWatchedLifetime: rewardsDoc.rewardedAdsWatchedLifetime,
      tokensEarnedFromAdsToday: rewardsDoc.tokensEarnedFromAdsToday,
      tokensEarnedFromAdsLifetime: rewardsDoc.tokensEarnedFromAdsLifetime,
      tenAdCycleCount: rewardsDoc.tenAdCycleCount,
      dailyLimit: AD_REWARDS_CONFIG.DAILY_AD_LIMIT,
      remainingAdsToday,
      tokensPerAd: AD_REWARDS_CONFIG.TOKENS_PER_AD,
      bonusEvery: AD_REWARDS_CONFIG.BONUS_EVERY_N_ADS,
      bonusTokens: AD_REWARDS_CONFIG.BONUS_TOKENS,
      canWatchAd: eligibility.eligible && remainingAdsToday > 0,
      reasonIfBlocked: !eligibility.eligible ? eligibility.reason : 
                       remainingAdsToday === 0 ? 'Daily limit reached' : undefined,
      lastAdWatchAt: rewardsDoc.lastAdWatchAt,
      dailyResetAt: rewardsDoc.dailyResetAt,
    };
    
    return status;
  } catch (error) {
    logger.error('Error getting ad rewards status:', error);
    throw new HttpsError('internal', 'Failed to get ad rewards status');
  }
}

/**
 * Record a rewarded ad watch and grant tokens
 */
export async function recordRewardedAdWatch(
  userId: string,
  deviceId?: string,
  adProviderPayload?: any
): Promise<RewardedAdWatchResult> {
  try {
    // Verify eligibility
    const eligibility = await checkUserEligibility(userId);
    if (!eligibility.eligible) {
      throw new HttpsError('failed-precondition', eligibility.reason || 'Not eligible for ad rewards');
    }
    
    // Get or create rewards document
    const rewardsDoc = await getOrCreateAdRewards(userId);
    
    // Check daily limit
    if (rewardsDoc.rewardedAdsWatchedToday >= AD_REWARDS_CONFIG.DAILY_AD_LIMIT) {
      throw new HttpsError('resource-exhausted', 'Daily ad limit reached. Come back tomorrow!');
    }
    
    // Calculate rewards
    const tokensAwarded = AD_REWARDS_CONFIG.TOKENS_PER_AD;
    const newCycleCount = (rewardsDoc.tenAdCycleCount + 1) % AD_REWARDS_CONFIG.BONUS_EVERY_N_ADS;
    const bonusAwarded = newCycleCount === 0 ? AD_REWARDS_CONFIG.BONUS_TOKENS : 0;
    const totalAwarded = tokensAwarded + bonusAwarded;
    
    // Use transaction to ensure atomicity
    const result = await db.runTransaction(async (transaction) => {
      // Update rewards document
      const rewardsRef = db.collection('adRewards').doc(userId);
      transaction.update(rewardsRef, {
        rewardedAdsWatchedToday: increment(1),
        rewardedAdsWatchedLifetime: increment(1),
        tokensEarnedFromAdsToday: increment(totalAwarded),
        tokensEarnedFromAdsLifetime: increment(totalAwarded),
        tenAdCycleCount: newCycleCount,
        lastAdWatchAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      // Update user wallet
      const walletRef = db.collection('users').doc(userId).collection('wallet').doc('current');
      const walletSnap = await transaction.get(walletRef);
      
      if (walletSnap.exists) {
        transaction.update(walletRef, {
          balance: increment(totalAwarded),
          earned: increment(totalAwarded),
          updatedAt: serverTimestamp(),
        });
      } else {
        transaction.set(walletRef, {
          balance: totalAwarded,
          earned: totalAwarded,
          pending: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      
      // Record transaction
      const txRef = db.collection('transactions').doc(generateId());
      transaction.set(txRef, {
        userId,
        type: 'ad_reward',
        amount: totalAwarded,
        baseAmount: tokensAwarded,
        bonusAmount: bonusAwarded,
        metadata: {
          adsWatchedToday: rewardsDoc.rewardedAdsWatchedToday + 1,
          cycleProgress: newCycleCount,
          deviceId,
          adProvider: adProviderPayload?.provider || 'simulated',
        },
        createdAt: serverTimestamp(),
      });
      
      return {
        newBalance: walletSnap.exists ? (walletSnap.data()?.balance || 0) + totalAwarded : totalAwarded,
      };
    });
    
    // Record risk event (async, non-blocking)
    recordRiskEvent({
      userId,
      eventType: 'free_pool', // Using free_pool as closest match
      metadata: {
        adRewardWatch: true,
        tokensEarned: totalAwarded,
        adsWatchedToday: rewardsDoc.rewardedAdsWatchedToday + 1,
        deviceId,
      },
    }).catch((error) => {
      logger.error('Error recording risk event for ad watch:', error);
    });
    
    // Record ranking action (async, non-blocking)
    const rankingPoints = Math.floor(totalAwarded * AD_REWARDS_CONFIG.RANKING_POINTS_MULTIPLIER);
    if (rankingPoints > 0) {
      recordRankingAction({
        type: 'tip', // Use tip type as it's token-based
        creatorId: userId,
        payerId: 'system_ads',
        tokensAmount: totalAwarded,
        points: rankingPoints,
        timestamp: new Date(),
      }).catch((error) => {
        logger.error('Error recording ranking action for ad watch:', error);
      });
    }
    
    const responseMsg = bonusAwarded > 0
      ? `Earned ${tokensAwarded} tokens + ${bonusAwarded} bonus! 🎉`
      : `Earned ${tokensAwarded} tokens! ${AD_REWARDS_CONFIG.BONUS_EVERY_N_ADS - newCycleCount} more for bonus.`;
    
    return {
      success: true,
      tokensAwarded,
      bonusAwarded,
      totalAwarded,
      newBalance: result.newBalance,
      adsWatchedToday: rewardsDoc.rewardedAdsWatchedToday + 1,
      remainingToday: AD_REWARDS_CONFIG.DAILY_AD_LIMIT - (rewardsDoc.rewardedAdsWatchedToday + 1),
      progressToBonus: newCycleCount,
      message: responseMsg,
    };
  } catch (error: any) {
    logger.error('Error recording rewarded ad watch:', error);
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError('internal', error.message || 'Failed to process ad reward');
  }
}

/**
 * Admin function: Reset daily counters for all users (called by scheduler)
 */
export async function resetDailyCountersForAllUsers(): Promise<number> {
  try {
    const now = getMidnightUTC();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Find all users whose reset date is before today
    const outdatedDocs = await db.collection('adRewards')
      .where('dailyResetAt', '<', now)
      .limit(500) // Process in batches
      .get();
    
    if (outdatedDocs.empty) {
      return 0;
    }
    
    // Use batch writes for efficiency
    const batch = db.batch();
    
    outdatedDocs.docs.forEach((doc) => {
      batch.update(doc.ref, {
        rewardedAdsWatchedToday: 0,
        tokensEarnedFromAdsToday: 0,
        dailyResetAt: now,
        updatedAt: serverTimestamp(),
      });
    });
    
    await batch.commit();
    
    logger.info(`Reset daily ad counters for ${outdatedDocs.size} users`);
    return outdatedDocs.size;
  } catch (error) {
    logger.error('Error resetting daily counters:', error);
    throw error;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  AD_REWARDS_CONFIG,
  checkUserEligibility,
  getOrCreateAdRewards,
  shouldResetDaily,
};