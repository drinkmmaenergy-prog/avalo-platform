import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";
import { TOKEN_PAYOUT_USD } from './config/economyConfig';

/**
 * System Configuration Constants
 * Canonical-aligned server config.
 *
 * IMPORTANT:
 * - TOKEN_PAYOUT_USD is the canonical payout benchmark input.
 * - Token pack authority lives in shared/config/canonicalEconomy.ts
 * - This file must not redefine legacy payout economics.
 */

// Token Economy — derived from TOKEN_PAYOUT_USD (0.04 USD) via economyConfig.ts
export const SETTLEMENT_RATE_USD = TOKEN_PAYOUT_USD;

// Chat Configuration
/** @deprecated V9 — escrow/deposit model removed. Value kept for legacy chats.ts only. */
export const CHAT_INITIAL_DEPOSIT_TOKENS = 100;
export const CHAT_FREE_MESSAGES_PER_USER = 4;
/** V9 canonical: flat base price per creator send action. */
export const CHAT_BASE_MESSAGE_PRICE_TOKENS = 3;
/** @deprecated V9 — lane-specific splits removed. Reference value only; do not use in new billing. */
export const CHAT_PLATFORM_FEE_PCT = 35;
/** @deprecated V9 — escrow model removed. Reference value only; do not use in new billing. */
export const CHAT_ESCROW_PCT = 65;

// Word to Token Conversion
/** @deprecated V9 — word-based billing removed. Reference value only; do not use in new billing. */
export const WORDS_PER_TOKEN_STANDARD = 11;
/** @deprecated V9 — word-based billing removed. Reference value only; do not use in new billing. */
export const WORDS_PER_TOKEN_ROYAL_EARNER = 7;

// Call Rates (tokens per minute)
export const VOICE_CALL_RATE_FREE = 5;
export const VOICE_CALL_RATE_VIP_ROYAL = 2;
export const VIDEO_CALL_RATE = 10;
export const CALL_BILLING_INTERVAL_SEC = 10;

// Calendar Configuration
export const CALENDAR_MIN_BOOKING_TOKENS = 100;
/** @deprecated V9 — lane-specific splits removed. Reference value only; do not use in new billing. */
export const CALENDAR_PLATFORM_FEE_PCT = 20;
/** @deprecated V9 — escrow model removed. Reference value only; do not use in new billing. */
export const CALENDAR_ESCROW_PCT = 80;

// Tips and Subscriptions
export const TIP_PLATFORM_FEE_PCT = 20;
export const TIP_CREATOR_PCT = 80;
/** @deprecated V9 — lane-specific splits removed. Reference value only; do not use in new billing. */
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
export const CALENDAR_CANCEL_EARLY_REFUND_PCT = 50;
export const CALENDAR_CANCEL_EARLY_CREATOR_PCT = 30;

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
export const FUNCTIONS_REGION = "europe-west1";

// Stripe Configuration (from environment)
export const getStripeConfig = () => ({
  secretKey: process.env.STRIPE_SECRET_KEY || "",
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
});

// @deprecated — Price authority lives in shared/config/canonicalEconomy.ts (tokenPacks).
// This map is retained for legacy code that imports TOKEN_PACKAGES from config.ts.
// Do not add new features against this map; use CANONICAL_ECONOMY.tokenPacks instead.
export const TOKEN_PACKAGES = {
  MINI_100:      { tokens: 100,   priceUSD: 12.99 },
  BASIC_300:     { tokens: 300,   priceUSD: 34.99 },
  STANDARD_500:  { tokens: 500,   priceUSD: 56.99 },
  PREMIUM_1000:  { tokens: 1000,  priceUSD: 99.99 },
  PRO_2000:      { tokens: 2000,  priceUSD: 189.99 },
  ELITE_5000:    { tokens: 5000,  priceUSD: 449.99 },
  ROYAL_10000:   { tokens: 10000, priceUSD: 849.99 },
} as const;

// Legacy token packages retained only for backward compatibility checks.
export const LEGACY_TOKEN_PACKAGES = {
  STARTER: { tokens: 100, priceUSD: 30 },
  VALUE: { tokens: 500, priceUSD: 125 },
  PRO: { tokens: 1000, priceUSD: 230 },
  ELITE: { tokens: 5000, priceUSD: 1000 },
} as const;

// Gender and Seeking Values
export enum Gender {
  MALE = "male",
  FEMALE = "female",
  NON_BINARY = "non-binary",
}

// Chat Status
export enum ChatStatus {
  PENDING = "pending",
  ACTIVE = "active",
  ENDED = "ended",
  EXPIRED = "expired",
  CLOSED = "closed",
}

// Booking Status
export enum BookingStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  CANCELLED = "CANCELLED",
  COMPLETED = "COMPLETED",
  NO_SHOW = "NO_SHOW",
}

// Transaction Type
export enum TransactionType {
  MESSAGE = "MESSAGE",
  CALENDAR = "CALENDAR",
  REFUND = "REFUND",
  CALL = "CALL",
  TIP = "TIP",
  SUBSCRIPTION = "SUBSCRIPTION",
  TOKEN_PURCHASE = "TOKEN_PURCHASE",
  PAYOUT = "PAYOUT",
}

// Verification Status
export enum VerificationStatus {
  UNVERIFIED = "UNVERIFIED",
  PENDING = "PENDING",
  VERIFIED = "VERIFIED",
  FAILED = "FAILED",
  BANNED = "BANNED",
}

