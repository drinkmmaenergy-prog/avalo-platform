import { CANONICAL_ECONOMY } from "../../../shared/config/canonicalEconomy";

export const MONETIZATION_SPLITS = {
  CHAT: { ...CANONICAL_ECONOMY.splits.chat },
  CALL: { ...CANONICAL_ECONOMY.splits.callVoice },
  VIDEO_CALL: { ...CANONICAL_ECONOMY.splits.callVideo },
  TIPS: { ...CANONICAL_ECONOMY.splits.tips },
  UNLOCK_MEDIA: { ...CANONICAL_ECONOMY.splits.chat },
  LIVE_GIFTS: { ...CANONICAL_ECONOMY.splits.chat },
  EVENT_TICKET: { ...CANONICAL_ECONOMY.splits.eventTicket },
  CALENDAR_MEETING: { ...CANONICAL_ECONOMY.splits.calendarMeeting },
  SUBSCRIPTION: { ...CANONICAL_ECONOMY.splits.subscription },
} as const;

export const SPLITS = MONETIZATION_SPLITS;
