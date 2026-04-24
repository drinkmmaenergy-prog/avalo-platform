export type CurrencyCode = "USD";

export type Split = {
  earner: number;
  platform: number;
};

export const CANONICAL_ECONOMY = {
  meta: {
    version: "2.0.0",
  },
  payout: {
    tokenPayoutUsd: 0.04,
    /** V9: 20% platform commission deducted from earner balance at payout time. */
    payoutCommissionPercent: 0.20,
    payoutFeePlatformPercent: 0.05,
  },
  tokenPacks: [
    { id: "mini_100",     name: "Mini 100",     tokens: 100,   usdPrice: 12.99 },
    { id: "basic_300",    name: "Basic 300",    tokens: 300,   usdPrice: 34.99 },
    { id: "standard_500", name: "Standard 500", tokens: 500,   usdPrice: 56.99 },
    { id: "premium_1000", name: "Premium 1000", tokens: 1000,  usdPrice: 99.99 },
    { id: "pro_2000",     name: "Pro 2000",     tokens: 2000,  usdPrice: 189.99 },
    { id: "elite_5000",   name: "Elite 5000",   tokens: 5000,  usdPrice: 449.99 },
    { id: "royal_10000",  name: "Royal 10000",  tokens: 10000, usdPrice: 849.99 },
  ],
  splits: {
    chat:            { earner: 0, platform: 0 },
    callVoice:       { earner: 0, platform: 0 },
    callVideo:       { earner: 0, platform: 0 },
    tips:            { earner: 0, platform: 0 },
    calendarMeeting: { earner: 0, platform: 0 },
    eventTicket:     { earner: 0, platform: 0 },
    subscription:    { earner: 0, platform: 0 },
    platform100:     { earner: 0, platform: 1 },
  },
  chat: {
    // V9 canonical billing
    baseMessagePriceTokens: 3,
    freeMessagesPerUser: 4,
    chatExpiryInactivityHours: 48,
    allowedBurnMultipliers: [1, 2, 3, 5, 10],

    // @deprecated V9 — word-based billing removed. Retained for compile compatibility only.
    // Do not use wordsPerToken in new billing logic. Remove in Phase 3 (chat engine rewrite).
    tiers: {
      STANDARD: { wordsPerToken: 11, freeMessagesPerUser: 4 },
      ROYAL:    { wordsPerToken: 7,  freeMessagesPerUser: 4 },
    },
    // @deprecated V9 — escrow/deposit model removed. All values are 0 (neutral/disabled).
    // Retained for compile compatibility only. Remove in Phase 3 (chat engine rewrite).
    defaultDepositTokens:  0,
    minChatChargeTokens:   0,
    depositPlatformFeePct: 0,
    depositEscrowPct:      0,
  },
} as const;
