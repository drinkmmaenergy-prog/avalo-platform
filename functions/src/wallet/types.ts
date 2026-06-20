import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

/**
 * WALLET + LEDGER + PAYOUT — Unified Types
 *
 * Single source of truth for ALL wallet, ledger, and payout types.
 *
 * CANONICAL DOCUMENT PATHS:
 *   wallets/{userId}         — user wallet (balance, pending, earned)
 *   wallets/AVALO_PLATFORM   — platform wallet (Avalo's share)
 *   ledger/{txId}            — immutable ledger entry per mutation
 *
 * ALL OTHER WALLET DOCUMENT PATHS ARE DEPRECATED AND MUST NOT BE USED.
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore';

// ============================================================================
// WALLET DOCUMENT — wallets/{userId} | wallets/AVALO_PLATFORM
// ============================================================================

/**
 * Canonical wallet document stored at `wallets/{userId}`.
 * The platform wallet is stored at `wallets/AVALO_PLATFORM`.
 */
export interface WalletDocument {
  /** The wallet owner's userId or 'AVALO_PLATFORM'. */
  userId: string;
  /** Available token balance (integer, no floats). */
  balance: number;
  /** Tokens currently in escrow / pending release. */
  pending: number;
  /** Lifetime earned tokens (monotonically increasing). */
  earned: number;
  /** Lifetime spent tokens (monotonically increasing). */
  spent: number;
  /** Tokens currently frozen by fraud/AML holds. */
  frozen: number;
  /**
   * C3: Tokens currently reserved for an active paid-chat session.
   * These are NOT spendable — they are locked until the session ends.
   * On session close: remainingReservedTokens are returned to balance.
   * balance + reservedTokens = total user holdings at any moment.
   */
  reservedTokens: number;
  /** Last mutation timestamp. */
  updatedAt: Timestamp | FieldValue;
  /** Document creation timestamp. */
  createdAt: Timestamp | FieldValue;
}

/**
 * The canonical platform wallet ID.
 * This is the ONLY platform wallet document that should exist.
 */
export const PLATFORM_WALLET_ID = 'AVALO_PLATFORM';

/**
 * Canonical Firestore collection name for wallets.
 */
export const WALLETS_COLLECTION = 'wallets';

/**
 * Canonical Firestore collection name for ledger entries.
 */
export const LEDGER_COLLECTION = 'ledger';

// ============================================================================
// DEPRECATED WALLET PATHS — DO NOT USE
// ============================================================================

/**
 * All legacy wallet paths that MUST NOT be used for new code.
 * Listed here for migration tooling and auditing.
 */
export const DEPRECATED_WALLET_PATHS = [
  'users/{userId}/wallet/current',
  'users/{userId}/wallet/main',
  'user_wallets/{userId}',
  'system_wallets/platform_platform',
  'balances/{userId}/wallet/wallet',
  'users/{userId} (wallet.balance field)',
  'platform_wallet/earnings',
  'system/platform_wallet',
  'escrow_wallets/{escrowId}',
] as const;

// ============================================================================
// LEDGER ENTRY — ledger/{txId}
// ============================================================================

/**
 * Every balance mutation MUST produce exactly one LedgerEntry.
 * Ledger entries are immutable — once written, never updated.
 */
export interface LedgerEntry {
  /** Unique transaction ID (document ID in `ledger` collection). */
  txId: string;

  /** The type of financial event. */
  type: LedgerEntryType;

  /** The user who initiated or is primarily responsible for this event. */
  actorId: string;

  /** The counterparty (recipient of funds, or source of refund). */
  counterpartyId: string | null;

  /** Optional chat or session context. */
  chatId: string | null;
  sessionId: string | null;

  /** The total token amount involved in this transaction (always positive). */
  amountTokens: number;

  /** Revenue split breakdown. */
  split: {
    creatorTokens: number;
    avaloTokens: number;
  };

  /** Snapshot of balances BEFORE and AFTER the mutation. */
  beforeAfter: {
    actor: { before: number; after: number };
    counterparty: { before: number; after: number } | null;
    platform: { before: number; after: number };
  };

  /** Server timestamp of the mutation. */
  timestamp: Timestamp | FieldValue;

  /**
   * Idempotency key to prevent duplicate processing.
   * Format: `{type}:{actorId}:{uniqueSuffix}`
   */
  idempotencyKey: string;

  /** Optional metadata for domain-specific context. */
  metadata?: Record<string, unknown>;
}

/**
 * All supported ledger entry types.
 */
export type LedgerEntryType =
  | 'CHAT_DEPOSIT'
  | 'CHAT_BURN'
  | 'CHAT_REFUND'
  | 'PURCHASE'
  | 'PURCHASE_REFUND'
  | 'PAYOUT'
  | 'PAYOUT_REVERSAL'
  | 'SUBSCRIPTION'
  | 'SUBSCRIPTION_PAYMENT'
  | 'TIP'
  | 'GIFT'
  | 'MEDIA_UNLOCK'
  | 'CALL_BILL'
  | 'CALENDAR_BOOK'
  | 'EVENT_TICKET'
  | 'ROYAL_MEMBERSHIP'
  | 'BOOST_IMPRESSION'
  | 'CALL_ESCROW_RESERVE'
  | 'CALL_ESCROW_RELEASE'
  | 'CALENDAR_REFUND'
  | 'CALENDAR_RELEASE'
  | 'AD_REWARD'
  | 'MIGRATION'
  | 'DROP_PURCHASE'
  // C3: Reservation lifecycle events
  | 'CHAT_RESERVATION_RESERVE'   // tokens moved from balance → reservedTokens
  | 'CHAT_RESERVATION_RELEASE'   // unused reserved tokens returned to balance
  | 'CHAT_RESPONSE_BURN';        // finalRateTokens consumed from reservation

// ============================================================================
// PAYOUT TYPES
// ============================================================================

/**
 * Payout request state machine states.
 *
 * Flow: REQUESTED → APPROVED → PROCESSING → COMPLETED | FAILED
 *       REQUESTED → REJECTED
 *       PROCESSING → FAILED → RETRY → PROCESSING → COMPLETED
 */
export type PayoutStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REJECTED'
  | 'RETRY';

/**
 * Valid payout state transitions.
 */
export const PAYOUT_STATE_TRANSITIONS: Record<PayoutStatus, PayoutStatus[]> = {
  REQUESTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['PROCESSING', 'REJECTED'],
  PROCESSING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: ['RETRY'],
  REJECTED: [],
  RETRY: ['PROCESSING'],
};

/**
 * Payout request document stored at `payout_requests/{payoutId}`.
 *
 * Payout conversion uses TOKEN_PAYOUT_USD (0.04 canonical benchmark).
 * All Stripe/transfer fees are charged to the withdrawing user.
 */
export interface PayoutRequestDocument {
  /** Unique payout request ID. */
  payoutId: string;

  /** The user requesting the payout. */
  userId: string;

  /** Current status in the state machine. */
  status: PayoutStatus;

  /** Tokens requested for withdrawal (gross, before fees). */
  tokensRequested: number;

  /** USD value per token at time of request. */
  tokenPayoutUsd: number;

  /** Gross USD amount = tokensRequested × tokenPayoutUsd. */
  grossUsd: number;

  /**
   * Stripe/transfer fee in USD charged to the withdrawing user.
   * This is deducted from the payout, NOT from platform margin.
   */
  stripeFeeUsd: number;

  /** Net USD amount the user receives = grossUsd - stripeFeeUsd. */
  netUsd: number;

  /** Stripe Connect account ID for the transfer. */
  stripeAccountId: string;

  /** Stripe Transfer ID (set after transfer is created). */
  stripeTransferId: string | null;

  /** Idempotency key for the Stripe transfer. */
  stripeIdempotencyKey: string;

  /** Ledger entry ID for this payout. */
  ledgerTxId: string | null;

  /** State machine history for audit trail. */
  statusHistory: Array<{
    from: PayoutStatus | null;
    to: PayoutStatus;
    reason: string;
    timestamp: Timestamp | FieldValue;
  }>;

  /** Number of retry attempts for failed payouts. */
  retryCount: number;

  /** Maximum allowed retries. */
  maxRetries: number;

  /** Creation timestamp. */
  createdAt: Timestamp | FieldValue;

  /** Last update timestamp. */
  updatedAt: Timestamp | FieldValue;

  /** Completion timestamp (when COMPLETED or FAILED permanently). */
  completedAt: Timestamp | FieldValue | null;
}

// ============================================================================
// WALLET MUTATION PARAMS
// ============================================================================

/**
 * Parameters for a wallet mutation via the WalletService.
 */
export interface WalletMutationParams {
  /** Ledger entry type. */
  type: LedgerEntryType;

  /** The actor (debit side). */
  actorId: string;

  /** The counterparty (credit side). Null for platform-only transactions. */
  counterpartyId: string | null;

  /** Total tokens to transfer. */
  amountTokens: number;

  /** Revenue split. */
  split: {
    creatorTokens: number;
    avaloTokens: number;
  };

  /** Idempotency key (must be unique per operation). */
  idempotencyKey: string;

  /** Optional context references. */
  chatId?: string | null;
  sessionId?: string | null;

  /** Optional metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * Result of a wallet mutation.
 */
export interface WalletMutationResult {
  /** The ledger entry ID created. */
  txId: string;

  /** Updated actor balance. */
  actorBalance: number;

  /** Updated counterparty balance (null if no counterparty). */
  counterpartyBalance: number | null;

  /** Updated platform balance. */
  platformBalance: number;
}

// ============================================================================
// IDEMPOTENCY SENTINEL
// ============================================================================

/**
 * Idempotency sentinel stored at `idempotency_sentinels/{key}`.
 * Prevents duplicate processing of the same operation.
 */
export interface IdempotencySentinel {
  key: string;
  txId: string;
  createdAt: Timestamp | FieldValue;
  /** TTL: sentinels can be cleaned up after 7 days. */
  expiresAt: Timestamp;
}

export const IDEMPOTENCY_COLLECTION = 'idempotency_sentinels';

/**
 * Payout requests collection.
 */
export const PAY

// ============================================================================
// C3: CHAT RESERVATION — chat_reservations/{reservationId}
// ============================================================================

/**
 * Canonical Firestore collection for chat reservations.
 * Documents are written only by walletService.reserveTokens().
 * Clients may NOT write this collection (rules: write: if false).
 */
export const RESERVATIONS_COLLECTION = 'chat_reservations';

/**
 * Reservation status lifecycle.
 *
 * ACTIVE    — tokens are locked, session in progress
 * RELEASED  — session ended normally; remaining tokens returned to balance
 * EXHAUSTED — budget ran out mid-session; all reserved tokens consumed
 * EXPIRED   — inactivity timeout; remaining tokens returned to balance
 */
export type ReservationStatus = 'ACTIVE' | 'RELEASED' | 'EXHAUSTED' | 'EXPIRED';

/**
 * A chat_reservations/{reservationId} document.
 * Written atomically by reserveTokens(); updated by releaseReservation() /
 * consumeFromReservation().
 *
 * Invariants:
 *  - reservedTokens  = initial amount moved from balance (never changes after creation)
 *  - consumedTokens  = sum of all CHAT_RESPONSE_BURN events against this reservation
 *  - remainingTokens = reservedTokens − consumedTokens
 *  - When remainingTokens < finalRateTokens → BUDGET_EXHAUSTED state triggers
 */
export interface ChatReservation {
  /** Document ID (same as reservationId). */
  reservationId: string;
  /** Wallet owner. */
  userId: string;
  /** The chat session this reservation is tied to. */
  chatId: string;
  /** Status in the lifecycle. */
  status: ReservationStatus;
  /** Total tokens moved from balance at session entry (never changes). */
  reservedTokens: number;
  /** Total tokens consumed by paid responses so far. */
  consumedTokens: number;
  /** reservedTokens − consumedTokens. Updated atomically with each burn. */
  remainingTokens: number;
  /** The charge rate per creator response. */
  finalRateTokens: number;
  /** Minimum entry reservation enforced at creation (per invariant 0.4). */
  minimumEntry: number;
  /** When the reservation was created. */
  createdAt: FirebaseFirestore.Timestamp | import('firebase-admin/firestore').FieldValue;
  /** When the reservation was last modified. */
  updatedAt: FirebaseFirestore.Timestamp | import('firebase-admin/firestore').FieldValue;
  /** When the reservation was closed (released/exhausted/expired). */
  closedAt?: FirebaseFirestore.Timestamp | import('firebase-admin/firestore').FieldValue;
}
