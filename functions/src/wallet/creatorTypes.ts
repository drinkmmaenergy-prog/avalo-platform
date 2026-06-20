/**
 * CREATOR USD LEDGER — Canonical Types
 *
 * Server-only types for the creator earnings / payout system.
 * All monetary amounts are integer USD cents. No floats.
 *
 * Canonical Firestore paths:
 *   creatorAccounts/{uid}          — creator balance document
 *   creatorLedger/{entryId}        — append-only earning / payout events
 *   payoutRequests/{payoutId}      — payout request state machine
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import type { RiskTier } from './creatorPolicy';

// ============================================================================
// COLLECTION CONSTANTS
// ============================================================================

export const CREATOR_ACCOUNTS_COLLECTION = 'creatorAccounts';
export const CREATOR_LEDGER_COLLECTION   = 'creatorLedger';
export const PAYOUT_REQUESTS_COLLECTION  = 'payoutRequests';

// ============================================================================
// CREATOR ACCOUNT — creatorAccounts/{uid}
// ============================================================================

/**
 * Creator account document.
 * All balances in integer USD cents.
 * Never computed on-the-fly — always the running sum maintained by transactions.
 */
export interface CreatorAccount {
  uid: string;
  currency: 'USD';

  /** Earned but still under hold. Visible to creator as "Pending". */
  pendingUsdCents: number;
  /** Cleared earnings available for payout. */
  availableUsdCents: number;
  /** Funds reserved for an approved payout awaiting final provider outcome. */
  reservedUsdCents: number;
  /** Cumulative gross creator net earnings (post 20% commission) successfully paid out. */
  paidOutUsdCents: number;
  /** Cumulative net creator earnings (post 20% commission). Monotonically increasing. */
  lifetimeEarnedUsdCents: number;

  /**
   * Unrecovered chargeback/refund debt.
   * When > 0: payoutBlocked = true, future earnings offset debt first.
   * Never negative.
   */
  refundDebtUsdCents: number;

  /**
   * True when payout is blocked for any reason.
   * Reasons: refundDebt > 0, HIGH_RISK tier, KYC missing, Stripe not set up.
   */
  payoutBlocked: boolean;
  payoutBlockReason: string | null;

  // Stripe Connect
  stripeConnectAccountId: string | null;
  stripeOnboardingComplete: boolean;

  // KYC
  kycLevel: number;
  kycVerifiedAt: Timestamp | null;

  // Risk
  riskTier: RiskTier;
  successfulPayoutCount: number;

  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

// ============================================================================
// CREATOR LEDGER ENTRY — creatorLedger/{entryId}
// ============================================================================

export type CreatorLedgerEntryType =
  | 'CREATOR_EARNING'           // fan spend generates creator USD credit
  | 'CREATOR_EARNING_RELEASED'  // pending → available after hold period
  | 'PAYOUT_RESERVED'           // available → reserved for approved payout
  | 'PAYOUT_COMPLETED'          // reserved → paidOut after provider confirms
  | 'PAYOUT_RELEASED'           // reserved → available on confirmed failure
  | 'REFUND_CLAWBACK'           // fan refund claws back creator pending/available
  | 'CHARGEBACK_CLAWBACK'       // card dispute claws back creator pending/available
  | 'DEBT_OFFSET'               // future earning offsets existing refundDebt
  | 'ADMIN_ADJUSTMENT';         // manual finance team correction

/**
 * Creator ledger entry.
 * APPEND-ONLY. Economic fields are never updated after creation.
 */
export interface CreatorLedgerEntry {
  entryId: string;
  creatorId: string;
  type: CreatorLedgerEntryType;

  // Amounts — all integer cents
  grossUsdCents: number;             // total fan spend in USD cents
  avaloCommissionUsdCents: number;   // 20% platform commission
  externalCostUsdCents: number;      // real pass-through provider costs (0 for earnings)
  netUsdCents: number;               // what hits creator balance (may be negative for clawbacks)

  // Token traceability
  sourceTokens: number;              // gross tokens from fan (0 for non-earning types)
  tokenRateSnapshotUsd: number;      // TOKEN_PAYOUT_USD snapshot at time of entry (e.g. 0.04)

  // Source linkage
  sourceType: string;                // 'CALL_BILLING' | 'CHAT_MEDIA' | etc.
  sourceId: string;                  // callId / chatId / payoutId / disputeId
  payerUid: string | null;           // fan uid (null for payout/admin entries)

  // Idempotency
  idempotencyKey: string;

  // Hold / escrow
  heldUntil: Timestamp | null;       // null for non-earning types; +N days for earnings
  availableAt: Timestamp | null;     // when this entry's funds clear to available
  clearedAt: Timestamp | null;       // set by hold-release scheduler

  createdAt: Timestamp | FieldValue;
  metadata: Record<string, unknown>;
}

// ============================================================================
// PAYOUT REQUEST — payoutRequests/{payoutId}
// ============================================================================

export type PayoutStatus =
  | 'REQUESTED'   // created, awaiting AML
  | 'AML_REVIEW'  // flagged for manual review
  | 'APPROVED'    // cleared for disbursement
  | 'PROCESSING'  // Stripe transfer initiated
  | 'UNKNOWN'     // provider timed out — outcome unknown, reserve retained
  | 'COMPLETED'   // fiat disbursed — TERMINAL IRREVERSIBLE
  | 'FAILED'      // confirmed non-disbursement — reserve released
  | 'REJECTED'    // admin rejected — reserve released
  | 'CANCELLED'   // creator cancelled before APPROVED — reserve released
  | 'REVERSED';   // allowed only after confirmed non-disbursement

/** Terminal states — no further transitions. */
export const PAYOUT_TERMINAL_STATES: PayoutStatus[] = ['COMPLETED', 'UNKNOWN'];

/** States where reserved funds may be released back to available. */
export const PAYOUT_RELEASE_STATES: PayoutStatus[] = ['FAILED', 'REJECTED', 'CANCELLED', 'REVERSED'];

/** Valid state transitions. COMPLETED has no outbound transitions. */
export const PAYOUT_STATE_MACHINE: Record<PayoutStatus, PayoutStatus[]> = {
  REQUESTED:   ['AML_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'],
  AML_REVIEW:  ['APPROVED', 'REJECTED'],
  APPROVED:    ['PROCESSING', 'CANCELLED'],
  PROCESSING:  ['COMPLETED', 'FAILED', 'UNKNOWN'],
  UNKNOWN:     [],            // terminal until provider reconciliation
  COMPLETED:   [],            // terminal and irreversible
  FAILED:      ['REVERSED'],  // REVERSED only after confirmed non-disbursement
  REJECTED:    [],
  CANCELLED:   [],
  REVERSED:    [],
};

export interface PayoutStatusHistoryEntry {
  status: PayoutStatus;
  at: Timestamp | FieldValue;
  by: 'system' | 'admin' | 'creator';
  note?: string;
}

export interface CreatorPayoutRequest {
  payoutId: string;
  creatorId: string;
  status: PayoutStatus;

  // Amounts — integer cents
  requestedUsdCents: number;         // what creator asked for (must be <= availableUsdCents)
  avaloCommissionUsdCents: number;   // 0 at payout time (commission already deducted at earning time)
  externalCostUsdCents: number;      // real Stripe/provider pass-through (0 until measured)
  netDisbursedUsdCents: number;      // what hits creator's Stripe account

  // Provider
  stripeConnectAccountId: string;
  providerTransferId: string | null;         // Stripe transfer ID
  providerIdempotencyKey: string;            // payoutId used as Stripe idempotency key

  // AML
  amlScanId: string | null;
  amlClearedAt: Timestamp | null;

  // Ledger linkage
  ledgerEntryId: string | null;              // PAYOUT_RESERVED entry

  // Idempotency
  clientIdempotencyKey: string;              // from client request, prevents duplicate submissions

  statusHistory: PayoutStatusHistoryEntry[];

  requestedAt: Timestamp | FieldValue;
  processedAt: Timestamp | null;
  completedAt: Timestamp | null;
  updatedAt: Timestamp | FieldValue;
}
