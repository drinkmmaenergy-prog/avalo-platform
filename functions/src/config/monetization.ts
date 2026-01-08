/**
 * Monetization Configuration for Firebase Functions
 * Shared constants for server-side validation
 */

export const PAID_CONTENT_CONFIG = {
  /** Creator earning percentage from paid content (as decimal) */
  CREATOR_SPLIT: 0.70, // 70% to creator, 30% to Avalo
  
  /** Avalo platform fee on paid content (as decimal) */
  CONTENT_FEE_PERCENTAGE: 0.30,
} as const;

export const EARN_TO_CHAT_CONFIG = {
  /** Creator earnings percentage from escrow (as decimal) */
  CREATOR_SPLIT: 0.80, // 80% to creator
  
  /** Avalo cut from escrow (as decimal) */
  AVALO_CUT: 0.20, // 20% to Avalo
  
  /** Average words per token for escrow billing */
  WORDS_PER_TOKEN: 11,
} as const;

export const CALL_CONFIG = {
  VOICE: {
    /** Avalo platform fee percentage */
    AVALO_CUT_PERCENT: 20,
    /** Earner revenue percentage */
    EARNER_CUT_PERCENT: 80,
  },
  VIDEO: {
    /** Avalo platform fee percentage */
    AVALO_CUT_PERCENT: 20,
    /** Earner revenue percentage */
    EARNER_CUT_PERCENT: 80,
  },
} as const;

export const TIPS_CONFIG = {
  /** Creator earning percentage from tips (as decimal) */
  CREATOR_SPLIT: 0.80, // 80% to creator, 20% to Avalo
  
  /** Avalo platform fee on tips (as decimal) */
  TIP_FEE_PERCENTAGE: 0.20,
} as const;