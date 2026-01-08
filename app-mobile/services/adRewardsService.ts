/**
 * Ad Rewards Service - Phase 17
 * Manages rewarded ad token earning system
 * 
 * Features:
 * - Get user's ad rewards status
 * - Register rewarded ad watch
 * - Track daily limits and bonuses
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

// ============================================================================
// TYPES
// ============================================================================

export interface AdRewardsStatus {
  userId: string;
  rewardedAdsWatchedToday: number;
  rewardedAdsWatchedLifetime: number;
  tokensEarnedFromAdsToday: number;
  tokensEarnedFromAdsLifetime: number;
  tenAdCycleCount: number;
  dailyLimit: number;
  remainingAdsToday: number;
  tokensPerAd: number;
  bonusEvery: number;
  bonusTokens: number;
  canWatchAd: boolean;
  reasonIfBlocked?: string;
  lastAdWatchAt?: Date;
  dailyResetAt?: Date;
}

export interface RewardedAdWatchResult {
  success: boolean;
  tokensAwarded: number;
  bonusAwarded: number;
  totalAwarded: number;
  newBalance: number;
  adsWatchedToday: number;
  remainingToday: number;
  progressToBonus: number;
  message: string;
}

// ============================================================================
// GET AD REWARDS STATUS
// ============================================================================

/**
 * Get current user's ad rewards status
 */
export async function getAdRewardsStatus(): Promise<AdRewardsStatus> {
  try {
    const app = getApp();
    const functions = getFunctions(app);
    const getStatusFn = httpsCallable<void, AdRewardsStatus>(
      functions,
      'ads_getStatus'
    );
    
    const result = await getStatusFn();
    return result.data;
  } catch (error: any) {
    console.error('Error getting ad rewards status:', error);
    throw new Error(error.message || 'Failed to get ad rewards status');
  }
}

// ============================================================================
// REGISTER REWARDED AD WATCH
// ============================================================================

/**
 * Register a rewarded ad watch and receive tokens
 * 
 * @param deviceId - Optional device identifier for tracking
 * @param adProviderPayload - Optional payload from ad provider SDK
 */
export async function registerRewardedAdWatch(
  deviceId?: string,
  adProviderPayload?: any
): Promise<RewardedAdWatchResult> {
  try {
    const app = getApp();
    const functions = getFunctions(app);
    const registerFn = httpsCallable<
      { deviceId?: string; adProviderPayload?: any },
      RewardedAdWatchResult
    >(functions, 'ads_registerRewardedWatch');
    
    const result = await registerFn({ deviceId, adProviderPayload });
    return result.data;
  } catch (error: any) {
    console.error('Error registering rewarded ad watch:', error);
    throw new Error(error.message || 'Failed to register ad watch');
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate progress percentage to next bonus
 */
export function calculateBonusProgress(status: AdRewardsStatus): number {
  return Math.floor((status.tenAdCycleCount / status.bonusEvery) * 100);
}

/**
 * Get remaining ads until next bonus
 */
export function getRemainingForBonus(status: AdRewardsStatus): number {
  return status.bonusEvery - status.tenAdCycleCount;
}

/**
 * Format token earning message
 */
export function formatEarningMessage(result: RewardedAdWatchResult): string {
  if (result.bonusAwarded > 0) {
    return `🎉 Earned ${result.tokensAwarded} + ${result.bonusAwarded} bonus tokens!`;
  }
  const remaining = 10 - result.progressToBonus;
  return `✨ Earned ${result.tokensAwarded} tokens! ${remaining} more for bonus.`;
}

/**
 * Check if user can watch more ads today
 */
export function canWatchMoreAds(status: AdRewardsStatus): boolean {
  return status.canWatchAd && status.remainingAdsToday > 0;
}

/**
 * Get time until daily reset (returns hours)
 */
export function getHoursUntilReset(status: AdRewardsStatus): number {
  if (!status.dailyResetAt) return 0;
  
  const resetTime = status.dailyResetAt instanceof Date 
    ? status.dailyResetAt 
    : new Date(status.dailyResetAt);
  
  const tomorrow = new Date(resetTime);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  
  const now = new Date();
  const msUntilReset = tomorrow.getTime() - now.getTime();
  
  return Math.max(0, Math.floor(msUntilReset / (1000 * 60 * 60)));
}

/**
 * Format daily limit message
 */
export function formatDailyLimitMessage(status: AdRewardsStatus): string {
  if (status.remainingAdsToday === 0) {
    const hours = getHoursUntilReset(status);
    return `You've reached today's limit. Come back in ${hours}h!`;
  }
  
  return `${status.remainingAdsToday} of ${status.dailyLimit} ads left today`;
}

/**
 * Calculate potential earnings for remaining ads
 */
export function calculatePotentialEarnings(status: AdRewardsStatus): {
  baseTokens: number;
  bonusTokens: number;
  totalTokens: number;
} {
  const remaining = status.remainingAdsToday;
  const baseTokens = remaining * status.tokensPerAd;
  
  // Calculate how many bonuses will be earned
  const currentCycle = status.tenAdCycleCount;
  const totalAdsIncludingRemaining = status.rewardedAdsWatchedToday + remaining;
  
  let bonusCount = 0;
  for (let i = 1; i <= remaining; i++) {
    const cyclePos = (currentCycle + i) % status.bonusEvery;
    if (cyclePos === 0) {
      bonusCount++;
    }
  }
  
  const bonusTokens = bonusCount * status.bonusTokens;
  
  return {
    baseTokens,
    bonusTokens,
    totalTokens: baseTokens + bonusTokens,
  };
}

/**
 * Simulate ad watch (for testing without real ad SDK)
 * In production, this would trigger actual ad SDK
 */
export async function simulateAdWatch(deviceId?: string): Promise<RewardedAdWatchResult> {
  // Simulate 2-3 second delay for ad watch
  await new Promise(resolve => setTimeout(resolve, 2500));
  
  return registerRewardedAdWatch(deviceId, { provider: 'simulated' });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getAdRewardsStatus,
  registerRewardedAdWatch,
  calculateBonusProgress,
  getRemainingForBonus,
  formatEarningMessage,
  canWatchMoreAds,
  getHoursUntilReset,
  formatDailyLimitMessage,
  calculatePotentialEarnings,
  simulateAdWatch,
};