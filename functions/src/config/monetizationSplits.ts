import { CANONICAL_ECONOMY, type Split } from "../../../shared/config/canonicalEconomy";

/**
 * FUNCTIONS CANONICAL SPLITS BRIDGE
 * Source of truth: shared/config/canonicalEconomy.ts
 */

export const MONETIZATION_SPLITS = {
  CHAT: {
    earner: CANONICAL_ECONOMY.splits.chat.earner,
    platform: CANONICAL_ECONOMY.splits.chat.platform,
  },
  CALL: {
    earner: CANONICAL_ECONOMY.splits.callVoice.earner,
    platform: CANONICAL_ECONOMY.splits.callVoice.platform,
  },
  VIDEO_CALL: {
    earner: CANONICAL_ECONOMY.splits.callVideo.earner,
    platform: CANONICAL_ECONOMY.splits.callVideo.platform,
  },
  TIPS: {
    earner: CANONICAL_ECONOMY.splits.tips.earner,
    platform: CANONICAL_ECONOMY.splits.tips.platform,
  },
  UNLOCK_MEDIA: {
    earner: CANONICAL_ECONOMY.splits.chat.earner,
    platform: CANONICAL_ECONOMY.splits.chat.platform,
  },
  LIVE_GIFTS: {
    earner: CANONICAL_ECONOMY.splits.chat.earner,
    platform: CANONICAL_ECONOMY.splits.chat.platform,
  },
  EVENT_TICKET: {
    earner: CANONICAL_ECONOMY.splits.eventTicket.earner,
    platform: CANONICAL_ECONOMY.splits.eventTicket.platform,
  },
  CALENDAR_MEETING: {
    earner: CANONICAL_ECONOMY.splits.calendarMeeting.earner,
    platform: CANONICAL_ECONOMY.splits.calendarMeeting.platform,
  },
  SUBSCRIPTION: {
    earner: CANONICAL_ECONOMY.splits.subscription.earner,
    platform: CANONICAL_ECONOMY.splits.subscription.platform,
  },
} as const;

export const SPLITS = MONETIZATION_SPLITS;

export type MonetizationType =
  | "CHAT"
  | "CALL"
  | "VIDEO_CALL"
  | "TIPS"
  | "UNLOCK_MEDIA"
  | "LIVE_GIFTS"
  | "EVENT_TICKET"
  | "CALENDAR_MEETING"
  | "SUBSCRIPTION";

export type SplitStructure = Split;

export function getSplit(type: MonetizationType): SplitStructure {
  return SPLITS[type];
}


