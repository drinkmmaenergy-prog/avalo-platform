/**
 * Message Boost Service - PACK 41
 * Token-Boosted Replies (Priority Messages)
 *
 * HARD CONSTRAINTS:
 * - Local data only (AsyncStorage)
 * - No backend, no Firestore, no Functions
 * - Deterministic pricing (no randomness)
 * - No free tokens / no free trials / no discounts
 * - 65/35 revenue split remains
 * - Additive only - no refactoring existing modules
 */

// ============================================================================
// TYPES
// ============================================================================

export interface BoostConfig {
  minExtraTokens: number; // e.g. 2
  maxExtraTokens: number; // e.g. 10
}

export interface BoostCalculationContext {
  senderId: string;
  receiverId: string;
  receiverHeatScore: number; // from PACK 40 (0-100)
}

export interface BoostPriceResult {
  extraTokens: number;  // integer
  reason: string[];     // explanation for debug/logs/UI
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_MIN_EXTRA = 2;
const DEFAULT_MAX_EXTRA = 10;

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get default boost configuration
 */
export function getDefaultBoostConfig(): BoostConfig {
  return {
    minExtraTokens: DEFAULT_MIN_EXTRA,
    maxExtraTokens: DEFAULT_MAX_EXTRA,
  };
}

/**
 * Calculate extra tokens for boosted message
 * 
 * Heuristic (deterministic):
 * - Start from min extra tokens
 * - Add based on receiver heat score:
 *   - Heat > 40: +1
 *   - Heat > 60: +1 more (+2 total)
 *   - Heat > 80: +2 more (+4 total)
 * - Cap at max extra tokens
 * 
 * Result is always:
 * - Integer
 * - At least minExtraTokens
 * - At most maxExtraTokens
 * - No randomness
 * 
 * @param context - Calculation context with sender, receiver, heat score
 * @param config - Optional boost configuration (uses defaults if not provided)
 * @returns BoostPriceResult with extra tokens and reasoning
 */
export function calculateBoostExtraTokens(
  context: BoostCalculationContext,
  config?: BoostConfig
): BoostPriceResult {
  const actualConfig = config || getDefaultBoostConfig();
  const breakdown: string[] = [];

  // Start from minimum extra tokens
  let extra = actualConfig.minExtraTokens;
  breakdown.push(`Base boost cost: ${extra} tokens`);

  // Apply heat score modifiers
  const { receiverHeatScore } = context;

  if (receiverHeatScore > 40) {
    extra += 1;
    breakdown.push(`Receiver heat > 40 (${receiverHeatScore}): +1 token`);
  }

  if (receiverHeatScore > 60) {
    extra += 1;
    breakdown.push(`Receiver heat > 60 (${receiverHeatScore}): +1 token`);
  }

  if (receiverHeatScore > 80) {
    extra += 2;
    breakdown.push(`Receiver heat > 80 (${receiverHeatScore}): +2 tokens`);
  }

  // Cap at maximum
  if (extra > actualConfig.maxExtraTokens) {
    breakdown.push(`Capped to maximum: ${actualConfig.maxExtraTokens} tokens`);
    extra = actualConfig.maxExtraTokens;
  }

  // Ensure we're at least at minimum
  if (extra < actualConfig.minExtraTokens) {
    extra = actualConfig.minExtraTokens;
    breakdown.push(`Ensured minimum: ${actualConfig.minExtraTokens} tokens`);
  }

  breakdown.push(`= FINAL BOOST EXTRA: ${extra} tokens`);

  // Debug log in DEV mode only
  if (__DEV__) {
    console.log('[MessageBoost] Boost calculation:');
    breakdown.forEach(line => console.log(`  ${line}`));
  }

  return {
    extraTokens: Math.floor(extra), // Ensure integer
    reason: breakdown,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getDefaultBoostConfig,
  calculateBoostExtraTokens,
};