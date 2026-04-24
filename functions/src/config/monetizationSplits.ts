export type Split = { earner: number; platform: number };

export const SPLITS = {
  CHAT: { earner: 0, platform: 0 },
  CALL_VOICE: { earner: 0, platform: 0 },
  CALL_VIDEO: { earner: 0, platform: 0 },
  TIPS: { earner: 0, platform: 0 },
  CALENDAR: { earner: 0, platform: 0 },
  EVENTS: { earner: 0, platform: 0 },
  SUBSCRIPTION: { earner: 0, platform: 0 },
  PLATFORM: { earner: 0, platform: 1 },
} as const;

export const MONETIZATION_SPLITS = {
  ...SPLITS,
  CALL: SPLITS.CALL_VOICE,
  VIDEO_CALL: SPLITS.CALL_VIDEO,
  CALENDAR_MEETING: SPLITS.CALENDAR,
  EVENT_TICKET: SPLITS.EVENTS,
  LIVE_GIFTS: SPLITS.CHAT,
  UNLOCK_MEDIA: SPLITS.CHAT,
} as const;

export const TOKEN_PAYOUT_USD = 0.04;
export const PAYOUT_COMMISSION_PERCENT = 0.2;
export const PAYOUT_FEE_PERCENT = 0.05;
