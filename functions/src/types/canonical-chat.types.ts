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
 * INVARIANTS (V9):
 * - Splits are 0/0 — no earner/platform percentage split on chat (flat token model)
 * - Word-based billing DEPRECATED — Phase 2 chat engine rewrite will replace with flat 3T/msg
 * - Free messages: 4 per user per chat (flat, both tiers)
 * - Payout per token = 0.04 USD (from economyConfig)
 * - Token pack pricing: V9 prices in pack277-token-packs.ts and canonicalEconomy.ts
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
  | 'AWAITING_DEPOSIT'       // @deprecated V9 — use LOCKED. Kept for migration compat.
  | 'PAID_ACTIVE'            // Paid session active, flat per-message billing
  | 'LOCKED'                 // V9: payer balance insufficient for next message
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

/**
 * V9: Flat free message allowance — 4 per user per chat regardless of earner tier.
 * Previous values: 9 (standard), 5 (royal). Both replaced by 4.
 */
export const FREE_MESSAGES_STANDARD = 4;

/**
 * @deprecated V9 — both tiers use FREE_MESSAGES_STANDARD = 4.
 * Kept for compile compatibility only. Do not add new references.
 */
export const FREE_MESSAGES_ROYAL_EARNER = 4;

// ============================================================================
// BILLING CONSTANTS
// ============================================================================

/**
 * V9: Flat token cost per creator (earner) message.
 * Payer is debited 3 tokens each time the earner sends a message after free allowance.
 * Earner receives 3 tokens per message (platform earns via payout commission only).
 */
export const BASE_MESSAGE_PRICE_TOKENS = 3;

/**
 * V9: Cost for payer to reopen a LOCKED chat.
 * Payer must have this many tokens to unlock and continue.
 */
export const REOPEN_COST_TOKENS = 25;

/**
 * V9: Free messages granted to payer when they reopen a LOCKED chat.
 */
export const REOPEN_FREE_MESSAGES = 2;

/**
 * @deprecated V9 — word-based billing removed.
 * Kept for compile compatibility. Do NOT add new references.
 */
export const WORDS_PER_TOKEN_STANDARD = 11;

/**
 * @deprecated V9 — word-based billing removed.
 * Kept for compile compatibility. Do NOT add new references.
 */
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
 * Configuration snapshot frozen at session start time.
 * V9: No deposit, no wordsPerToken. Flat 3T/msg.
 */
export interface CanonicalSessionConfig {
  /** @deprecated V9 — kept for Firestore migration compat. Always 0 in new sessions. */
  depositTokens: number;

  /** Burn multiplier: 1 default, or from earner's configured enum value */
  burnMultiplier: BurnMultiplier;
}

/**
 * Live billing state, updated on each earner message.
 *
 * V9 BILLING MODEL:
 *   - Only earner messages are billed. Payer messages are ALWAYS free.
 *   - Each earner message costs BASE_MESSAGE_PRICE_TOKENS (3) taken from payer wallet.
 *   - 3 tokens credited directly to earner wallet per message.
 *   - No escrow. No deposit. No word counting.
 *   - If payer balance < 3 tokens → chat transitions to LOCKED.
 *   - burnMultiplier applied: actual cost = BASE_MESSAGE_PRICE_TOKENS * burnMultiplier.
 */
export interface CanonicalBillingState {
  /** Total earner messages charged in this session */
  totalMessagesCharged: number;

  /** Total tokens consumed from payer wallet this session */
  totalTokensConsumed: number;

  /** Total tokens credited to earner this session */
  totalEarnerCredited: number;

  /** Total tokens credited to Avalo this session (0 in V9 — platform earns on payout) */
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
 * V9: flat 3T/msg from payer wallet → earner wallet.
 */
export interface BillingResult {
  /** Whether any tokens were consumed (false = free message or payer message) */
  billed: boolean;

  /** Tokens consumed from payer wallet */
  tokensConsumed: number;

  /** Tokens credited to earner */
  earnerCredit: number;

  /** Tokens credited to Avalo (0 in V9) */
  platformCredit: number;

  /** V9: true when payer balance was insufficient — chat transitions to LOCKED */
  locked: boolean;

  /** Updated billing state after this message */
  updatedBillingState: CanonicalBillingState;
}

// ============================================================================
// DEPOSIT RESULT
// ============================================================================

/**
 * @deprecated V9 — no deposit model. Kept for compile compat.
 * V9: chats transition to PAID_ACTIVE when free messages exhausted, no deposit required.
 */
export interface DepositResult {
  success: boolean;
  session: CanonicalPaidSession;
  /** @deprecated V9 — always 0 */
  platformFee: number;
  /** @deprecated V9 — always 0 */
  escrow: number;
  depositTokens: number;
}

// ============================================================================
// REFUND RESULT
// ============================================================================

/**
 * Result of closing a chat.
 * V9: No escrow to refund. Fields kept for compat.
 */
export interface RefundResult {
  /** V9: always 0 (no escrow) */
  refundedTokens: number;
  /** V9: always 0 (no platform fee on deposit) */
  platformFeeRetained: number;
  /** Earner credits already sent */
  earnerCreditsRetained: number;
}

// ============================================================================
// MIGRATION TYPES
// ============================================================================

/**
 * State of a legacy chat document before migration.
 */
export type LegacySourceType =
  | 'chats_ts'
  | 'chatMonetization'
  | 'pack273'
  | 'pack328b'
  | 'unknown';

export const MIN_DEPOSIT_TOKENS = 100;
