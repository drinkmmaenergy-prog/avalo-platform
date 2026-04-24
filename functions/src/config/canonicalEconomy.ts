export type CurrencyCode = "USD";

export type Split = {
  earner: number;
  platform: number;
};

export const CANONICAL_ECONOMY = {
  meta: {
    version: "1.0.0",
  },
  payout: {
    tokenPayoutUsd: 0.04,
    payoutFeePlatformPercent: 0.05,
  },
  tokenPacks: [
    { id: "mini_100", name: "Mini 100", tokens: 100, usdPrice: 9.99 },
    { id: "basic_300", name: "Basic 300", tokens: 300, usdPrice: 26.99 },
    { id: "standard_500", name: "Standard 500", tokens: 500, usdPrice: 42.99 },
    { id: "premium_1000", name: "Premium 1000", tokens: 1000, usdPrice: 76.99 },
    { id: "pro_2000", name: "Pro 2000", tokens: 2000, usdPrice: 147.99 },
    { id: "elite_5000", name: "Elite 5000", tokens: 5000, usdPrice: 353.99 },
    { id: "royal_10000", name: "Royal 10000", tokens: 10000, usdPrice: 674.99 },
  ],
  splits: {
    chat: { earner: 0, platform: 0 },
    callVoice: { earner: 0, platform: 0 },
    callVideo: { earner: 0, platform: 0 },
    tips: { earner: 0, platform: 0 },
    calendarMeeting: { earner: 0, platform: 0 },
    eventTicket: { earner: 0, platform: 0 },
    subscription: { earner: 0, platform: 0 },
    platform100: { earner: 0, platform: 1 },
  },
  chat: {
    defaultDepositTokens: 100,
    minChatChargeTokens: 100,
    depositPlatformFeePct: 0,
    depositEscrowPct: 0,
    chatExpiryInactivityHours: 72,
    allowedBurnMultipliers: [1, 2, 3, 5, 10],
    tiers: {
      STANDARD: { wordsPerToken: 11, freeMessagesPerUser: 9 },
      ROYAL: { wordsPerToken: 7, freeMessagesPerUser: 5 },
    },
  },
} as const;
