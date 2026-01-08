/**
 * PACK 50 — Royal Spend Tracking Integration
 * Helper to record token spends from various sources
 */

import { recordTokenSpend } from './royalEngine';

/**
 * Record token spend for Royal Club tracking
 * This should be called from any module that processes token spends
 * 
 * @param userId - User who spent tokens
 * @param tokensSpent - Amount of tokens spent
 * @param source - Source of spend (for debugging/analytics)
 */
export async function trackRoyalSpend(
  userId: string,
  tokensSpent: number,
  source?: string
): Promise<void> {
  if (!userId || tokensSpent <= 0) {
    return; // Invalid input, skip silently
  }

  try {
    await recordTokenSpend(userId, tokensSpent);
    
    if (source) {
      console.log(`[RoyalTracking] Recorded ${tokensSpent} tokens from ${source} for user ${userId}`);
    }
  } catch (error) {
    // Non-blocking - Royal tracking should never fail the main operation
    console.error('[RoyalTracking] Failed to track spend:', error);
  }
}

/**
 * Batch record multiple spend events
 * Useful for processing historical data or bulk operations
 */
export async function trackRoyalSpendBatch(
  spends: Array<{ userId: string; tokensSpent: number; date?: Date }>
): Promise<void> {
  const promises = spends.map(({ userId, tokensSpent, date }) =>
    recordTokenSpend(userId, tokensSpent, date).catch(err => {
      console.error(`Failed to track spend for ${userId}:`, err);
    })
  );

  await Promise.all(promises);
}

console.log('✅ Royal Spend Tracking utilities initialized - PACK 50');