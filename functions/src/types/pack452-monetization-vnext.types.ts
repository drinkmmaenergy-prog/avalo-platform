import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

/**
 * PACK 452 — Monetization Engine vNext Types
 *
 * Premium Offer Engine v1, Configurable Entry Threshold,
 * Revenue Coach v1, Exclusive Mode v2
 *
 * INVARIANTS PRESERVED:
 * - Free chemistry messages unchanged
 * - Chat initiation never blocked
 * - No concurrency limits introduced (except exclusive mode)
 * - Word buckets unchanged: Standard = 11, Royal = 7
 * - Base burn = 1 token per bucket
 * - 65/35 split unchanged
 * - Payout per token = 0.04 USD unchanged
 * - Token pack pricing unchanged
 * - Historical ledger never recalculated
 * - Premium data private (not public profile)
 *
 * @module pack452-monetization-vnext.types
 * @version 1.0.0
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// ENTRY THRESHOLD
// ============================================================================

/**
 * Entry threshold configuration on user profile.
 * Controls how many tokens a payer must deposit to start a paid chat session.
 */
export interface EntryThresholdConfig {
  /** Number of tokens required to enter a paid chat. Default = 100. Min = 100. Hard cap = 50000. */
  chatEntryTokens: number;
}

/** System-enforced limits for entry threshold */
export const ENTRY_THRESHOLD_LIMITS = {
  MIN: 100,
  DEFAULT: 100,
  HARD_CAP: 50_000,
} as const;

// ============================================================================
// PREMIUM OFFER
// ============================================================================

/** Allowed multiplier values for premium offers */
export const PREMIUM_MULTIPLIERS = [2, 3, 5, 10, 15, 20] as const;
export type PremiumMultiplier = typeof PREMIUM_MULTIPLIERS[number];

/** Minimum multiplier required for exclusive mode */
export const EXCLUSIVE_MIN_MULTIPLIER = 10;

/** Offer validity duration in milliseconds (12 hours) */
export const PREMIUM_OFFER_VALIDITY_MS = 12 * 60 * 60 * 1000;

/** Premium offer states */
export type PremiumOfferStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'COMPLETED';

/**
 * A premium offer created by a payer for a specific chat.
 * Stored in Firestore: premiumOffers/{offerId}
 */
export interface PremiumOffer {
  offerId: string;
  chatId: string;
  payerId: string;
  earnerId: string;
  multiplier: PremiumMultiplier;
  exclusive: boolean;
  status: PremiumOfferStatus;

  /** Tokens reserved from payer wallet at creation time */
  reserveTokens: number;

  /** Cumulative tokens already burned from the reserved portion of this offer */
  burnedFromReserved: number;

  /** The earner's chatEntryTokens at the time the offer was created */
  baseChatEntryTokens: number;

  /** Timestamp when the offer was created */
  createdAt: Timestamp;

  /** Timestamp when the offer expires (createdAt + 12h) */
  expiresAt: Timestamp;

  /** Timestamp when the offer was accepted/declined/cancelled */
  resolvedAt?: Timestamp;

  /** Reason for cancellation if status = CANCELLED */
  cancelReason?: 'NEW_OFFER_REPLACED' | 'PAYER_CANCELLED' | 'SYSTEM_CANCELLED';
}

// ============================================================================
// CHAT MONETIZATION STATE (extended)
// ============================================================================

/**
 * Extended monetization state for chats.
 * Adds PAID_PREMIUM and EXCLUSIVE_ACTIVE to existing states.
 */
export type ChatMonetizationState =
  | 'FREE_PHASE'
  | 'PAID_STANDARD'
  | 'PAID_PREMIUM'
  | 'EXCLUSIVE_ACTIVE';

/**
 * Premium billing context stored on the chat document when a premium offer is accepted.
 */
export interface ChatPremiumContext {
  /** The accepted offer ID */
  offerId: string;
  /** The multiplier in effect */
  multiplier: PremiumMultiplier;
  /** Whether exclusive mode is active */
  exclusive: boolean;
  /** Timestamp when premium billing started */
  premiumStartedAt: Timestamp;
  /** Timestamp when exclusive mode ends (chat end or 30 min inactivity) */
  exclusiveExpiresAt?: Timestamp;
}

// ============================================================================
// WALLET EXTENSIONS
// ============================================================================

/**
 * Extended wallet fields for premium offer reservation.
 * These fields are ADDED to the existing WalletData interface.
 */
export interface WalletReservationFields {
  /** Tokens currently reserved for pending premium offers */
  reservedTokens: number;
  /** Available tokens (tokensBalance - reservedTokens) */
  availableTokens: number;
}

// ============================================================================
// EXCLUSIVE MODE
// ============================================================================

/** Exclusive mode inactivity timeout in milliseconds (30 minutes) */
export const EXCLUSIVE_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Exclusive mode lock stored on the earner's profile.
 * Prevents the earner from responding in other paid chats.
 */
export interface ExclusiveLock {
  /** The chat ID that holds the exclusive lock */
  chatId: string;
  /** The offer ID that activated exclusive mode */
  offerId: string;
  /** The payer who activated exclusive mode */
  payerId: string;
  /** Timestamp when exclusive mode was activated */
  activatedAt: Timestamp;
  /** Timestamp of last activity in the exclusive chat */
  lastActivityAt: Timestamp;
}

// ============================================================================
// REVENUE COACH
// ============================================================================

/** Revenue coach suggestion types */
export type RevenueCoachSuggestionType =
  | 'ENABLE_EARNING'
  | 'INCREASE_ENTRY_THRESHOLD'
  | 'DECREASE_ENTRY_THRESHOLD'
  | 'HIGH_MULTIPLIER_WARNING'
  | 'TRY_PREMIUM_OFFER';

/**
 * A revenue coach suggestion for an earner.
 * Stored in Firestore: users/{userId}/revenueCoachSuggestions/{suggestionId}
 */
export interface RevenueCoachSuggestion {
  suggestionId: string;
  userId: string;
  type: RevenueCoachSuggestionType;
  message: string;
  priority: 'low' | 'medium' | 'high';
  dismissed: boolean;
  createdAt: Timestamp;
  dismissedAt?: Timestamp;
  /** Metrics snapshot that triggered this suggestion */
  metricsSnapshot: RevenueCoachMetrics;
}

/**
 * Metrics evaluated by the revenue coach per earner daily.
 */
export interface RevenueCoachMetrics {
  paidChatConversionRate: number;
  avgSessionLength: number;
  premiumAcceptanceRate: number;
  refundRate: number;
  profileTraffic: number;
  unansweredChatCount: number;
  currentEntryThreshold: number;
  earnOnEnabled: boolean;
  avgMultiplier: number;
  totalRevenueLast30d: number;
  totalChatsLast30d: number;
}

// ============================================================================
// LEDGER SNAPSHOT EXTENSIONS
// ============================================================================

/**
 * Extended ledger fields for premium billing.
 * These fields are ADDED to existing ledger entries.
 */
export interface PremiumLedgerFields {
  /** Pricing mode: 'standard' or 'premium' */
  pricingMode: 'standard' | 'premium';
  /** Premium multiplier (1 for standard) */
  premiumMultiplier: number;
  /** The premium offer ID (null for standard) */
  offerId: string | null;
  /** Whether exclusive mode was active */
  exclusiveFlag: boolean;
}

/**
 * Snapshot stored when a premium offer is accepted.
 * Preserves the exact pricing parameters at acceptance time.
 */
export interface PremiumPricingSnapshot {
  multiplier: PremiumMultiplier;
  entryAtAcceptance: number;
  payoutPerToken: number;
  split: {
    earner: number;
    platform: number;
  };
}

// ============================================================================
// KPI ADDITIONS
// ============================================================================

/**
 * Premium-specific KPI metrics tracked globally and per-user.
 */
export interface PremiumKPIMetrics {
  premiumOfferCount: number;
  premiumAcceptanceRate: number;
  exclusiveSessionCount: number;
  avgMultiplier: number;
  avgEntryThreshold: number;
  premiumRevenueShare: number;
  exclusiveRevenueShare: number;
}

// ============================================================================
// SAFETY LIMITS
// ============================================================================

export const PREMIUM_SAFETY_LIMITS = {
  /** Max pending offers per payer across all chats */
  MAX_PENDING_PER_PAYER: 3,
  /** Cooldown between offers in the same chat (milliseconds) — 2 minutes */
  COOLDOWN_PER_CHAT_MS: 2 * 60 * 1000,
  /** Minimum multiplier */
  MIN_MULTIPLIER: 2,
  /** Minimum multiplier for exclusive mode */
  EXCLUSIVE_MIN_MULTIPLIER: 10,
  /** Hard cap for entry threshold */
  ENTRY_THRESHOLD_HARD_CAP: 50_000,
} as const;

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface CreatePremiumOfferRequest {
  chatId: string;
  multiplier: PremiumMultiplier;
  exclusive: boolean;
}

export interface CreatePremiumOfferResponse {
  success: boolean;
  offerId?: string;
  reserveTokens?: number;
  error?: string;
}

export interface RespondToPremiumOfferRequest {
  offerId: string;
  accept: boolean;
}

export interface RespondToPremiumOfferResponse {
  success: boolean;
  newMonetizationState?: ChatMonetizationState;
  error?: string;
}

export interface UpdateEntryThresholdRequest {
  chatEntryTokens: number;
}

export interface UpdateEntryThresholdResponse {
  success: boolean;
  chatEntryTokens?: number;
  error?: string;
}

export interface GetRevenueCoachSuggestionsResponse {
  success: boolean;
  suggestions?: RevenueCoachSuggestion[];
  error?: string;
}

export interface DismissRevenueCoachSuggestionRequest {
  suggestionId: string;
}

export interface GetPremiumOffersRequest {
  chatId?: string;
  status?: PremiumOfferStatus;
}

export interface GetPremiumOffersResponse {
  success: boolean;
  offers?: PremiumOffer[];
  error?: string;
}

export interface CancelPremiumOfferRequest {
  offerId: string;
}

export interface CancelPremiumOfferResponse {
  success: boolean;
  refundedTokens?: number;
  error?: string;
}

























