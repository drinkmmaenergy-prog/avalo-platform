/**
 * PACK 322 — AI Video Pricing Helper
 * Per-minute billing with VIP/Royal discounts
 * 
 * Pricing:
 * - STANDARD: 20 tokens/minute (full price)
 * - VIP: 14 tokens/minute (~30% discount)
 * - ROYAL: 10 tokens/minute (~50% discount)
 * 
 * This pricing applies ONLY to AI companion video sessions.
 * Does NOT affect human-to-human video calls.
 */

export type AiVideoTier = "STANDARD" | "VIP" | "ROYAL";

/**
 * Get per-minute token cost based on user tier
 */
export function getAiVideoPricePerMinuteTokens(tier: AiVideoTier): number {
  switch (tier) {
    case "STANDARD":
      return 20; // full price
    case "VIP":
      return 14;  // ~30% discount
    case "ROYAL":
      return 10;  // ~50% discount
    default:
      return 20; // fallback to standard
  }
}

/**
 * Calculate tokens for duration
 */
export function calculateVideoTokens(minutes: number, tier: AiVideoTier): number {
  const pricePerMinute = getAiVideoPricePerMinuteTokens(tier);
  return Math.floor(minutes * pricePerMinute);
}