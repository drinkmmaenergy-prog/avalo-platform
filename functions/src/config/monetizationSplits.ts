/**
 * =====================================================
 * AVALO MONETIZATION SPLITS
 * =====================================================
 *
 * Canonical economic configuration used across:
 *
 * - Chat billing
 * - Calls
 * - Video calls
 * - Tips
 * - Media unlock
 * - Live gifts
 * - Event tickets
 * - Calendar meetings
 * - Subscriptions
 *
 * Platform model:
 * Earners receive percentage of tokens
 * Platform retains treasury share
 *
 * All values expressed as fractions (0-1)
 * =====================================================
 */


/**
 * Legacy compatibility structure
 * Some older modules still reference earner / platform
 */

export const MONETIZATION_SPLITS = {

  CHAT: {
    earner: 0.65,
    platform: 0.35
  },

  CALL: {
    earner: 0.65,
    platform: 0.35
  },

  VIDEO_CALL: {
    earner: 0.65,
    platform: 0.35
  },

  TIPS: {
    earner: 0.65,
    platform: 0.35
  },

  UNLOCK_MEDIA: {
    earner: 0.65,
    platform: 0.35
  },

  LIVE_GIFTS: {
    earner: 0.65,
    platform: 0.35
  },

  EVENT_TICKET: {
    earner: 0.80,
    platform: 0.20
  },

  CALENDAR_MEETING: {
    earner: 0.80,
    platform: 0.20
  },

  SUBSCRIPTION: {
    earner: 0.70,
    platform: 0.30
  }

}


/**
 * =====================================================
 * NEW STANDARD SPLIT MODEL
 * =====================================================
 *
 * Used by all new economic engines:
 *
 * - Wallet Engine
 * - Escrow Engine
 * - Chat Billing
 * - Creator payouts
 *
 * earner   → person receiving tokens
 * platform → Avalo treasury
 */

export const SPLITS = {

  CHAT: {
    earner: 0.65,
    platform: 0.35
  },

  CALL: {
    earner: 0.65,
    platform: 0.35
  },

  VIDEO_CALL: {
    earner: 0.65,
    platform: 0.35
  },

  TIPS: {
    earner: 0.65,
    platform: 0.35
  },

  UNLOCK_MEDIA: {
    earner: 0.65,
    platform: 0.35
  },

  LIVE_GIFTS: {
    earner: 0.65,
    platform: 0.35
  },

  EVENT_TICKET: {
    earner: 0.80,
    platform: 0.20
  },

  CALENDAR_MEETING: {
    earner: 0.80,
    platform: 0.20
  },

  SUBSCRIPTION: {
    earner: 0.70,
    platform: 0.30
  }

}


/**
 * =====================================================
 * TYPE HELPERS
 * =====================================================
 */

export type MonetizationType =
  | "CHAT"
  | "CALL"
  | "VIDEO_CALL"
  | "TIPS"
  | "UNLOCK_MEDIA"
  | "LIVE_GIFTS"
  | "EVENT_TICKET"
  | "CALENDAR_MEETING"
  | "SUBSCRIPTION"


export type SplitStructure = {
  earner: number
  platform: number
}

