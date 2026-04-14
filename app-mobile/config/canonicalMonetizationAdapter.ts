import { CANONICAL_ECONOMY } from "./canonicalEconomy";

export const TOKEN_PACKS = CANONICAL_ECONOMY.tokenPacks.map((p) => ({
  id: p.id,
  name: p.name,
  tokens: p.tokens,
  priceUsd: p.usdPrice,
  price: p.usdPrice,
}));

export const CHAT_CANONICAL_CONFIG = {
  WORDS_PER_TOKEN_STANDARD: CANONICAL_ECONOMY.chat.tiers.STANDARD.wordsPerToken,
  WORDS_PER_TOKEN_ROYAL: CANONICAL_ECONOMY.chat.tiers.ROYAL.wordsPerToken,
  FREE_MESSAGES_STANDARD: CANONICAL_ECONOMY.chat.tiers.STANDARD.freeMessagesPerUser,
  FREE_MESSAGES_ROYAL: CANONICAL_ECONOMY.chat.tiers.ROYAL.freeMessagesPerUser,
  INITIAL_DEPOSIT: CANONICAL_ECONOMY.chat.defaultDepositTokens,
  PLATFORM_FEE_PCT: CANONICAL_ECONOMY.chat.depositPlatformFeePct,
  ESCROW_PCT: CANONICAL_ECONOMY.chat.depositEscrowPct,
} as const;

export const RESERVATION_CANONICAL_CONFIG = {
  FULL_PAYMENT_ESCROW: true,
  QR_ONE_SCAN_STARTS: CANONICAL_ECONOMY.reservations.qr.oneValidScanIsEnough,
  GPS_END_TOLERANCE_MINUTES: CANONICAL_ECONOMY.reservations.gps.endToleranceMinutes,
  CANCELLATION: CANONICAL_ECONOMY.reservations.cancellationPolicy,
} as const;

export const SPLITS = {
  CHAT: CANONICAL_ECONOMY.splits.chat,
  CALL_VOICE: CANONICAL_ECONOMY.splits.callVoice,
  CALL_VIDEO: CANONICAL_ECONOMY.splits.callVideo,
  TIPS: CANONICAL_ECONOMY.splits.tips,
  CALENDAR: CANONICAL_ECONOMY.splits.calendarMeeting,
  EVENTS: CANONICAL_ECONOMY.splits.eventTicket,
  SUBSCRIPTION: CANONICAL_ECONOMY.splits.subscription,
} as const;
