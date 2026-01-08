/**
 * PACK 279B — AI Voice Pricing Helper
 * Per-minute billing with VIP/Royal discounts
 * 
 * Pricing:
 * - STANDARD: 10 tokens/minute (full price)
 * - VIP: 7 tokens/minute (30% discount)
 * - ROYAL: 5 tokens/minute (50% discount)
 * 
 * This pricing applies ONLY to AI companion voice sessions.
 * Does NOT affect human-to-human calls.
 */

export type AiVoiceTier = "STANDARD" | "VIP" | "ROYAL";

/**
 * Get per-minute token cost based on user tier
 */
export function getAiVoicePricePerMinuteTokens(tier: AiVoiceTier): number {
  switch (tier) {
    case "STANDARD":
      return 10; // full price
    case "VIP":
      return 7;  // 30% discount
    case "ROYAL":
      return 5;  // 50% discount
    default:
      return 10; // fallback to standard
  }
}

/**
 * Calculate tokens for duration
 */
export function calculateVoiceTokens(minutes: number, tier: AiVoiceTier): number {
  const pricePerMinute = getAiVoicePricePerMinuteTokens(tier);
  return Math.floor(minutes * pricePerMinute);
}