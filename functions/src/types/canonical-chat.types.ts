import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

/**
 * CANONICAL CHAT DATA MODEL — v2_canonical
 *
 * This is the ONE AND ONLY source of truth for the Avalo chat monetization engine.
 *
 * SUPERSEDES / CONSOLIDATES:
 * - chats.ts (billing on sender — REMOVED)
 * - chatMonetization.ts (FREE_A/FREE_B modes — REMOVED)
 * - pack273ChatEngine.ts (pack273_chats collection — REDIRECTED)
 * - pack328b-chat-session-timeouts.ts (48h/72h divergence — CANONICAL 48h)
 * - pack242DynamicChatPricing.ts (deposit modifiers — REMOVED)
 * - pack452 premium offer engine (mid-chat multiplier — NEXT SESSION ONLY)
 * - pack285FreeWindowFunnel.ts (separate free funnel — MERGED)
 *
 * INVARIANTS:
 * - 65/35 revenue split (earner/Avalo) unchanged
 * - Word buckets: Standard = 11 words/token, Royal = 7 words/token
 * - Base burn = 1 token per bucket * burnMultiplier
 * - Payout per token = 0.04 USD (from economyConfig)
 * - Token pack pricing unchanged
 * - Historical ledger never recalculated
 * - No Math.round anywhere — deterministic floor only
 *
 * @module canonical-chat.types
 * @version 2.0.0
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore';

// ============================================================================
// CHAT STATE MACHINE
// ============================================================================

/**
 * Canonical chat states — linear progression.
 *
 * MATCHED → AWAITING_EARNER_ACCEPT → FREE_ACTIVE → AWAITING_DEPOSIT → PAID_ACTIVE → CLOSED
 *                                 ↘ CLOSED (decline)
 *                                                                              ↗ EXPIRED
 */
export type CanonicalChatState =
  | 'MATCHED'                // Match created, chat document exists but no acceptance yet
  | 'AWAITING_EARNER_ACCEPT' // Earner must accept or decline
  | 'FREE_ACTIVE'            // Free messages phase (counters ticking)
  | 'AWAITING_DEPOSIT'       // Free exhausted, payer must deposit to continue
  | 'PAID_ACTIVE'            // Paid session active, escrow funded
  | 'CLOSED'                 // Ended by user or system
  | 'EXPIRED';               // Auto-expired after 48h inactivity

// ============================================================================
// LOGIC VERSION TAG
// ============================================================================

/**
 * Logic version discriminator.
 * All new chats and migrated chats MUST have logicVersion = 'v2_canonical'.
 * Legacy chats without this field are routed through the migration shim.
 */
export const CANONICAL_LOGIC_VERSION = 'v2_canonical' as const;
export type CanonicalLogicVersion = typeof CANONICAL_LOGIC_VERSION;

// ============================================================================
// MULTIPLIER ENUM
// ============================================================================

/**
 * Allowed burn multiplier values.
 * Default = 1 (no multiplier).
 * Earner may set for NEXT session only.
 */
export const BURN_MULTIPLIER_ENUM = [1, 2, 3, 4, 5, 7, 10, 12, 15, 20] as const;
export type BurnMultiplier = typeof BURN_MULTIPLIER_ENUM[number];

// ============================================================================
// FREE MESSAGE CONSTANTS
// ============================================================================

/** Standard free messages per user per chat */
export const FREE_MESSAGES_STANDARD = 9;

/** Free messages per user when earner has Royal status */
export const FREE_MESSAGES_ROYAL_EARNER = 5;

// ============================================================================
// BILLING CONSTANTS
// ============================================================================

/** Words per token for standard earners */
export const WORDS_PER_TOKEN_STANDARD = 11;

/** Words per token when earner has Royal status */
export const WORDS_PER_TOKEN_ROYAL = 7;

/** Platform fee percentage (non-refundable, taken at deposit time) */
export const PLATFORM_FEE_PCT = SPLITS.CHAT.platform*100;

/** Escrow percentage (refundable unused portion) */
export const ESCROW_PCT = SPLITS.CHAT.earner*100;

/** Minimum deposit tokens */
export const MIN_DEPOSIT = 100
/** Default deposit tokens */
export const DEFAULT_DEPOSIT_TOKENS = 100;

/** Revenue split: earner portion of consumed escrow */
export const EARNER_REVENUE_SPLIT = MONETIZATION_SPLITS.CHAT.earner;

/** Revenue split: Avalo portion of consumed escrow */
export const AVALO_REVENUE_SPLIT = MONETIZATION_SPLITS.CHAT.platform;

/** Inactivity expiry duration in milliseconds (48h canonical) */
export const INACTIVITY_EXPIRY_MS = 48 * 60 * 60 * 1000;

/** Inactivity expiry duration in hours */
export const INACTIVITY_EXPIRY_HOURS = 48;

// ============================================================================
// CANONICAL CHAT DOCUMENT
// ============================================================================

/**
 * The canonical chat document stored at `chats/{chatId}`.
 *
 * This is the ONLY schema for chats in the system.
 * All legacy schemas must be migrated to this format.
 */
export interface CanonicalChatDocument {
  /** Firestore document ID */
  chatId: string;

  /** Participant user IDs [A, B] — always exactly 2 */
  participants: [string, string];

  /** Role assignments */
  roles: CanonicalChatRoles;

  /** Logic version discriminator — must be 'v2_canonical' */
  logicVersion: CanonicalLogicVersion;

  /** Current state in the chat state machine */
  state: CanonicalChatState;

  /** Free message tracking */
  free: CanonicalFreeState;

  /** Paid session data (null when no paid session active) */
  paidSession: CanonicalPaidSession | null;

  /** Timestamp of last message in this chat (for expiry calculation) */
  lastMessageAt: Timestamp | FieldValue | null;

  /** Timestamp when the chat was created */
  createdAt: Timestamp | FieldValue;

  /** Timestamp of last state change or message */
  updatedAt: Timestamp | FieldValue;

  /** Optional: reason for closure */
  closedReason?: 'earner_declined' | 'user_ended' | 'system_expired' | 'system_migrated';

  /** Optional: which user ended the chat */
  closedBy?: string;
}

// ============================================================================
// ROLE ASSIGNMENTS
// ============================================================================

/**
 * Role assignments for a chat.
 *
 * Role determination rules (in priority order):
 * 1. Influencer override: influencer earns regardless of gender when flagged + earn_on=ON
 * 2. Heterosexual rule: male always pays, female always earns
 * 3. earnOnChat ON: receiver earns if earn mode is enabled
 * 4. Default: initiator pays, Avalo earns (earnerId = null)
 */
export interface CanonicalChatRoles {
  /** User ID of the payer (always set) */
  payerId: string;

  /** User ID of the earner, or null if Avalo earns */
  earnerId: string | null;
}

// ============================================================================
// FREE MESSAGE STATE
// ============================================================================

/**
 * Free message tracking per user.
 *
 * Standard: 9 free messages per user.
 * If earner has Royal: 5 free messages per user.
 *
 * Decremented per sent message regardless of who sends.
 * When BOTH users exhausted → AWAITING_DEPOSIT.
 */
export interface CanonicalFreeState {
  /**
   * Remaining free messages by user ID.
   * Example: { "user_abc": 9, "user_xyz": 9 }
   * Decremented when the keyed user sends a message.
   */
  freeRemainingByUser: Record<string, number>;
}

// ============================================================================
// PAID SESSION
// ============================================================================

/**
 * Paid chat session data.
 * A new session is created for each deposit.
 * Session version increments on each new deposit (re-deposit after exhaustion).
 */
export interface CanonicalPaidSession {
  /** Unique session identifier */
  sessionId: string;

  /** Incrementing version (1, 2, 3...) for each new deposit in this chat */
  sessionVersion: number;

  /** Frozen config at the time of this session's deposit */
  configSnapshot: CanonicalSessionConfig;

  /** When this paid session started */
  startedAt: Timestamp | FieldValue;

  /** Live billing state for this session */
  billingState: CanonicalBillingState;
}

/**
 * Configuration snapshot frozen at deposit time.
 * These values do NOT change mid-session.
 */
export interface CanonicalSessionConfig {
  /** Tokens deposited by payer */
  depositTokens: number;

  /** Words per token bucket: 7 if earner is Royal, 11 otherwise */
  wordsPerToken: number;

  /** Burn multiplier: 1 default, or from earner's configured enum value */
  burnMultiplier: BurnMultiplier;
}

/**
 * Live billing state, updated on each earner message.
 *
 * BILLING DIRECTION: Only earner messages are billed.
 * Payer messages are ALWAYS free.
 *
 * Bucket rule:
 *   newBuckets = floor((accumulatedEarnerWords + newWords) / wordsPerToken) - priorBuckets
 *   tokenCost = newBuckets * 1 * burnMultiplier
 *   Consume from escrow; credit split:
 *     If earnerId != null: 65% to earner, 35% to Avalo
 *     If earnerId == null: 100% to Avalo
 *
 * CRITICAL: No Math.round. Use deterministic floor for buckets.
 * Partial bucket words remain stored in accumulatedEarnerWords remainder.
 */
export interface CanonicalBillingState {
  /** Total earner words accumulated this session (including partial bucket) */
  accumulatedEarnerWords: number;

  /** Remaining escrow tokens (starts at 65% of deposit) */
  escrowRemainingTokens: number;

  /** Platform fee already charged (35% of deposit, non-refundable) */
  platformFeeChargedTokens: number;

  /** Total buckets consumed so far in this session */
  totalBucketsConsumed: number;

  /** Total tokens consumed from escrow so far */
  totalTokensConsumed: number;

  /** Total tokens credited to earner so far */
  totalEarnerCredited: number;

  /** Total tokens credited to Avalo from escrow consumption so far */
  totalAvaloCredited: number;
}

// ============================================================================
// EARNER PROFILE CONFIG (stored on user profile, not chat)
// ============================================================================

/**
 * Earner's configuration for their next chat session.
 * Stored at users/{userId}/chatConfig or users/{userId}.chatEarnerConfig
 */
export interface EarnerChatConfig {
  /** Deposit tokens the earner wants for the NEXT session. min=100 */
  depositTokensForNextSession: number;

  /** Burn multiplier for the NEXT session. Default=1. Must be from BURN_MULTIPLIER_ENUM. */
  burnMultiplierForNextSession: BurnMultiplier;
}

// ============================================================================
// PARTICIPANT CONTEXT (for role determination)
// ============================================================================

/**
 * Context needed to determine chat roles.
 * Fetched from user profiles at chat creation time.
 */
export interface ChatParticipantContext {
  userId: string;
  gender: 'male' | 'female' | 'non-binary' | 'other';
  earnOnChat: boolean;
  influencerBadge: boolean;
  isRoyalMember: boolean;
}

// ============================================================================
// BILLING RESULT
// ============================================================================

/**
 * Result of processing billing for a single earner message.
 */
export interface BillingResult {
  /** Whether any tokens were consumed */
  billed: boolean;

  /** Number of new buckets consumed by this message */
  newBuckets: number;

  /** Tokens consumed from escrow */
  tokensConsumed: number;

  /** Tokens credited to earner */
  earnerCredit: number;

  /** Tokens credited to Avalo */
  platformCredit: number;

  /** Whether escrow is now exhausted */
  escrowExhausted: boolean;

  /** Updated billing state after this message */
  updatedBillingState: CanonicalBillingState;
}

// ============================================================================
// DEPOSIT RESULT
// ============================================================================

/**
 * Result of processing a deposit.
 */
export interface DepositResult {
  /** Whether the deposit was successful */
  success: boolean;

  /** The new paid session created */
  session: CanonicalPaidSession;

  /** Platform fee charged (non-refundable) */
  platformFee: number;

  /** Escrow allocated (refundable unused) */
  escrow: number;

  /** Total deposit amount */
  depositTokens: number;
}

// ============================================================================
// REFUND RESULT
// ============================================================================

/**
 * Result of closing a chat and refunding unused escrow.
 */
export interface RefundResult {
  /** Amount refunded to payer */
  refundedTokens: number;

  /** Platform fee NOT refunded */
  platformFeeRetained: number;

  /** Any earner credits already paid out */
  earnerCreditsRetained: number;
}

// ============================================================================
// MIGRATION TYPES
// ============================================================================

/**
 * State of a legacy chat document before migration.
 * Used by the migration script to detect and convert old formats.
 */
export type LegacySourceType =
  | 'chats_ts'             // From chats.ts (ChatStatus.ACTIVE etc.)
  | 'chatMonetization'     // From chatMonetization.ts (FREE_A/FREE_B/PAID)
  | 'pack273'              // From pack273ChatEngine.ts (pack273_chats collection)
  | 'pack328b'             // From pack328b (with timeout fields)
  | 'unknown';             // Unrecognized format














export const MIN_DEPOSIT_TOKENS = 100;























