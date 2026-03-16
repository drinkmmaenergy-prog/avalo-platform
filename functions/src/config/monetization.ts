import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

/**
 * Monetization Configuration for Firebase Functions
 * Shared constants for server-side validation
 */

export const PAID_CONTENT_CONFIG = {
  /** Creator earning percentage from paid content (as decimal) */
  CREATOR_SPLIT: MONETIZATION_SPLITS.SUBSCRIPTION.earner, // 70% to earner, 30% to Avalo
  
  /** Avalo platform fee on paid content (as decimal) */
  CONTENT_FEE_PERCENTAGE: MONETIZATION_SPLITS.SUBSCRIPTION.platform,
} as const;

export const EARN_TO_CHAT_CONFIG = {
  /** Creator earnings percentage from escrow (as decimal) */
  CREATOR_SPLIT: MONETIZATION_SPLITS.EVENT_TICKET.earner, // 80% to earner
  
  /** Avalo cut from escrow (as decimal) */
  AVALO_CUT: MONETIZATION_SPLITS.EVENT_TICKET.platform, // 20% to Avalo
  
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
  CREATOR_SPLIT: MONETIZATION_SPLITS.EVENT_TICKET.earner, // 80% to earner, 20% to Avalo
  
  /** Avalo platform fee on tips (as decimal) */
  TIP_FEE_PERCENTAGE: MONETIZATION_SPLITS.EVENT_TICKET.platform,
} as const;

































