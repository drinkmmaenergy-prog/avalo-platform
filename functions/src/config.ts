/**
 * System Configuration Constants
 * Based on AVALO_CORE_FULL_SPEC.md
 */

// Token Economy
export const SETTLEMENT_RATE_PLN = 0.20; // 1 token = 0.20 PLN for all settlements

// Chat Configuration
export const CHAT_INITIAL_DEPOSIT_TOKENS = 100;
export const CHAT_FREE_MESSAGES_PER_USER = 3;
export const CHAT_PLATFORM_FEE_PCT = 35; // 35% to Avalo, non-refundable
export const CHAT_ESCROW_PCT = 65; // 65% to escrow for receiver

// Word to Token Conversion
export const WORDS_PER_TOKEN_STANDARD = 11;
export const WORDS_PER_TOKEN_ROYAL_EARNER = 7;

// Call Rates (tokens per minute)
export const VOICE_CALL_RATE_FREE = 5;
export const VOICE_CALL_RATE_VIP_ROYAL = 2;
export const VIDEO_CALL_RATE = 10;
export const CALL_BILLING_INTERVAL_SEC = 10; // Bill every 10 seconds

// Calendar Configuration
export const CALENDAR_MIN_BOOKING_TOKENS = 100;
export const CALENDAR_PLATFORM_FEE_PCT = 20; // 20% to Avalo, non-refundable
export const CALENDAR_ESCROW_PCT = 80; // 80% to creator

// Tips and Subscriptions
export const TIP_PLATFORM_FEE_PCT = 20;
export const TIP_CREATOR_PCT = 80;
export const SUBSCRIPTION_PLATFORM_FEE_PCT = 30;
export const SUBSCRIPTION_CREATOR_PCT = 70;

// Auto-reload
export const AUTO_RELOAD_THRESHOLD_TOKENS = 20;
export const AUTO_RELOAD_AMOUNT_TOKENS = 100;

// Chat Expiry and Abandonment
export const CHAT_EXPIRY_HOURS = 48;
export const CHAT_EXPIRY_MS = CHAT_EXPIRY_HOURS * 60 * 60 * 1000;

// Royal Club Eligibility
export const ROYAL_INSTAGRAM_FOLLOWERS_MIN = 1000;
export const ROYAL_MONTHLY_EARNINGS_MIN_TOKENS = 20000;
export const ROYAL_QUALITY_SCORE_MIN = 70;
export const ROYAL_QUALITY_SCORE_GRACE_DAYS = 30;

// Rate Limits
export const RATE_LIMIT_MESSAGES_PER_HOUR = 50;
export const RATE_LIMIT_SWIPES_PER_HOUR = 100;

// Calendar Cancellation Refund Rules
export const CALENDAR_CANCEL_EARLY_HOURS = 24;
export const CALENDAR_CANCEL_EARLY_REFUND_PCT = 50; // 50% to booker
export const CALENDAR_CANCEL_EARLY_CREATOR_PCT = 30; // 30% to creator
// Platform always keeps 20% (non-refundable)

// Voice Message Pricing
export const VOICE_MESSAGE_SECONDS_PER_TOKEN = 30;

// AI Pricing (per-use, if not subscribed)
export const AI_MESSAGES_PER_TOKEN = 20;
export const AI_IMAGE_PG13_TOKENS = 10;
export const AI_IMAGE_XXX_TOKENS = 20;
export const AI_VOICE_TTS_SECONDS_PER_TOKEN = 30;

// Max Active Chats
export const MAX_ACTIVE_CHATS_DEFAULT = 50;
export const MAX_ACTIVE_CHATS_ROYAL = 100;

// Verification
export const CALENDAR_VERIFICATION_GPS_RADIUS_METERS = 30;
export const CALENDAR_VERIFICATION_TIMEOUT_MINUTES = 30;

// Region
export const FUNCTIONS_REGION = "europe-west3";

// Stripe Configuration (from environment)
export const getStripeConfig = () => ({
  secretKey: process.env.STRIPE_SECRET_KEY || "",
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
});

// Token Packages (PACK 302 - FINAL)
// These are the canonical token packages for the entire platform
// DO NOT CHANGE - prices are fixed and must remain consistent
export const TOKEN_PACKAGES = {
  MINI: { tokens: 100, pricePLN: 31.99 },
  BASIC: { tokens: 300, pricePLN: 85.99 },
  STANDARD: { tokens: 500, pricePLN: 134.99 },
  PREMIUM: { tokens: 1000, pricePLN: 244.99 },
  PRO: { tokens: 2000, pricePLN: 469.99 },
  ELITE: { tokens: 5000, pricePLN: 1125.99 },
  ROYAL: { tokens: 10000, pricePLN: 2149.99 },
};

// Legacy token packages (deprecated - use TOKEN_PACKAGES above)
export const LEGACY_TOKEN_PACKAGES = {
  STARTER: { tokens: 100, pricePLN: 30 },
  VALUE: { tokens: 500, pricePLN: 125 },
  PRO: { tokens: 1000, pricePLN: 230 },
  ELITE: { tokens: 5000, pricePLN: 1000 },
};

// Gender and Seeking Values
export enum Gender {
  MALE = "male",
  FEMALE = "female",
  NON_BINARY = "non-binary",
}

// Chat Status
export enum ChatStatus {
  ACTIVE = "active",
  EXPIRED = "expired",
  CLOSED = "closed",
  QUEUED = "queued",
}

// Transaction Types
export enum TransactionType {
  PURCHASE = "purchase",
  MESSAGE = "message",
  VOICE_CALL = "voice_call",
  VIDEO_CALL = "video_call",
  CALENDAR = "calendar_booking",
  TIP = "tip",
  SUBSCRIPTION = "subscription",
  REFUND = "refund",
  PAYOUT = "payout",
  AI_CHAT = "ai_chat",
  AI_IMAGE = "ai_image",
  AI_VOICE = "ai_voice",
}

// Verification Status
export enum VerificationStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
}

// Booking Status
export enum BookingStatus {
  PENDING = "pending",
  CONFIRMED = "confirmed",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  NO_SHOW = "no_show",
}

// Banned Terms for Moderation (escorting, sex work)
export const BANNED_TERMS = [
  "escort",
  "escorting",
  "prostitute",
  "prostitution",
  "sex work",
  "sex worker",
  "happy ending",
  "full service",
  "GFE",
  "girlfriend experience",
  "incall",
  "outcall",
  "donation",
  "roses",
  "sugar baby",
  "sugar daddy",
  "PPM",
  "pay per meet",
  "allowance",
  "arrangement",
  "mutually beneficial",
  "generous",
  "compensation",
  "financial support",
  // Polish equivalents
  "prostytucja",
  "prostytutka",
  "usługi seksualne",
  "sponsor",
  "sponsorka",
  "przelew za spotkanie",
];

// Export helper function to check for banned terms
export const containsBannedTerms = (text: string): boolean => {
  const lowerText = text.toLowerCase();
  return BANNED_TERMS.some((term) => lowerText.includes(term.toLowerCase()));
};


