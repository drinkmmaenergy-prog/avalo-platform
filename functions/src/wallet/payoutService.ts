/**
 * PAYOUT SERVICE — Unified Payout with State Machine + Fee Deduction
 *
 * Payout conversion uses TOKEN_PAYOUT_USD (0.03 now, can change later).
 *
 * KEY RULE: Payout fees (Stripe/transfer fees) are charged to the withdrawing
 * user. Fees are deducted from the payout amount, NOT from platform margin.
 *
 * STATE MACHINE:
 *   REQUESTED → APPROVED → PROCESSING → COMPLETED
 *                                      → FAILED → RETRY → PROCESSING → ...
 *   REQUESTED → REJECTED
 *
 * STRIPE INTEGRATION:
 * - Uses createStripeTransfer from integrations/stripeConnect
 * - Idempotency keys prevent duplicate Stripe transfers
 * - Transfer amount = gross USD - Stripe fee (charged to user)
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  PayoutRequestDocument,
  PayoutStatus,
  PAYOUT_STATE_TRANSITIONS,
  PAYOUT_REQUESTS_COLLECTION,
  PLATFORM_WALLET_ID,
  WALLETS_COLLECTION,
  WalletDocument,
} from './types';
import { TOKEN_PAYOUT_USD } from '../config/economyConfig';
import { debitForPayout } from './walletService';
import { createStripeTransfer } from '../integrations/stripeConnect';

// ============================================================================
// FIRESTORE REFERENCE
// ============================================================================

const db = getFirestore();

// ============================================================================
// PAYOUT CONSTANTS
// ============================================================================

/**
 * Estimated Stripe transfer fee structure.
 * Stripe Connect: 0.25% + $0.25 per transfer (Express accounts).
 * These are passed to the withdrawing user.
 */
export const STRIPE_FEE_FIXED_USD = 0.25;
export const STRIPE_FEE_PERCENT = 0.0025; // 0.25%

/**
 * Minimum payout in tokens.
 */
export const MINIMUM_PAYOUT_TOKENS = 5000;

/**
 * Maximum retry attempts for failed payouts.
 */
export const MAX_PAYOUT_RETRIES = 3;

// ============================================================================
// FEE CALCULATION
// ============================================================================

/**
 * Calculate Stripe transfer fee.
 * Fee = 0.25% of amount + $0.25 fixed.
 * This fee is charged to the withdrawing user.
 *
 * @param grossUsd — the gross USD amount before fees
 * @returns The Stripe fee in USD (rounded to 2 decimal places)
 */
export function calculateStripeFee(grossUsd: number): number {
  const fee = grossUsd * STRIPE_FEE_PERCENT + STRIPE_FEE_FIXED_USD;
  return Math.round(fee * 100) / 100; // Round to cents
}

/**
 * Calculate the full payout breakdown.
 *
 * @param tokensRequested — number of tokens to pay out
 * @returns Breakdown with grossUsd, stripeFeeUsd, netUsd
 */
export function calculatePayoutBreakdown(tokensRequested: number): {
  tokensRequested: number;
  tokenPayoutUsd: number;
  grossUsd: number;
  stripeFeeUsd: number;
  netUsd: number;
  netUsdCents: number;
} {
  const tokenPayoutUsd = TOKEN_PAYOUT_USD;
  const grossUsd = Math.round(tokensRequested * tokenPayoutUsd * 100) / 100;
  const stripeFeeUsd = calculateStripeFee(grossUsd);
  const netUsd = Math.round((grossUsd - stripeFeeUsd) * 100) / 100;
  const netUsdCents = Math.round(netUsd * 100);

  return {
    tokensRequested,
    tokenPayoutUsd,
    grossUsd,
    stripeFeeUsd,
    netUsd,
    netUsdCents,
  };
}

// ============================================================================
// STATE MACHINE VALIDATION
// ============================================================================

/**
 * Validate a state transition.
 * Throws if the transition is not allowed.
 */
function validateTransition(from: PayoutStatus, to: PayoutStatus): void {
  const allowed = PAYOUT_STATE_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new Error(
      `[PayoutService] Invalid state transition: ${from} → ${to}. Allowed: ${allowed.join(', ')}`,
    );
  }
}

/**
 * Transition payout status with audit trail.
 */
async function transitionStatus(
  payoutId: string,
  to: PayoutStatus,
  reason: string,
  additionalUpdates?: Record<string, unknown>,
): Promise<void> {
  const payoutRef = db.collection(PAYOUT_REQUESTS_COLLECTION).doc(payoutId);

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(payoutRef);
    if (!snap.exists) {
      throw new Error(`[PayoutService] Payout ${payoutId} not found`);
    }

    const payout = snap.data() as PayoutRequestDocument;
    validateTransition(payout.status, to);

    const historyEntry = {
      from: payout.status,
      to,
      reason,
      timestamp: FieldValue.serverTimestamp(),
    };

    const updates: Record<string, unknown> = {
      status: to,
      statusHistory: FieldValue.arrayUnion(historyEntry),
      updatedAt: FieldValue.serverTimestamp(),
      ...additionalUpdates,
    };

    if (to === 'COMPLETED' || to === 'REJECTED') {
      updates.completedAt = FieldValue.serverTimestamp();
    }

    if (to === 'RETRY') {
      updates.retryCount = FieldValue.increment(1);
    }

    transaction.update(payoutRef, updates);
  });
}

// ============================================================================
// REQUEST PAYOUT
// ============================================================================

/**
 * Create a new payout request.
 *
 * 1. Validates minimum tokens
 * 2. Calculates fee breakdown (fees charged to user)
 * 3. Debits tokens from user wallet (via walletService)
 * 4. Creates payout request document
 * 5. Returns payout details
 *
 * @param userId — the user requesting the payout
 * @param tokensRequested — number of tokens to withdraw
 * @param stripeAccountId — user's Stripe Connect account ID
 * @returns The created payout request
 */
export async function requestPayout(params: {
  userId: string;
  tokensRequested: number;
  stripeAccountId: string;
}): Promise<PayoutRequestDocument> {
  const { userId, tokensRequested, stripeAccountId } = params;

  // Validate minimum
  if (tokensRequested < MINIMUM_PAYOUT_TOKENS) {
    throw new Error(
      `[PayoutService] Minimum payout is ${MINIMUM_PAYOUT_TOKENS} tokens. Requested: ${tokensRequested}`,
    );
  }

  if (!Number.isInteger(tokensRequested) || tokensRequested <= 0) {
    throw new Error('[PayoutService] tokensRequested must be a positive integer');
  }

  if (!stripeAccountId || stripeAccountId.trim().length === 0) {
    throw new Error('[PayoutService] stripeAccountId is required');
  }

  // Calculate breakdown
  const breakdown = calculatePayoutBreakdown(tokensRequested);

  if (breakdown.netUsdCents <= 0) {
    throw new Error(
      `[PayoutService] Net payout amount is zero or negative after fees. Gross: $${breakdown.grossUsd}, Fee: $${breakdown.stripeFeeUsd}`,
    );
  }

  // Generate IDs
  const payoutId = db.collection(PAYOUT_REQUESTS_COLLECTION).doc().id;
  const stripeIdempotencyKey = `payout_stripe_${payoutId}`;
  const walletIdempotencyKey = `payout_debit_${payoutId}`;

  // Debit tokens from wallet (transactional + idempotent + writes ledger)
  const debitResult = await debitForPayout({
    userId,
    amountTokens: tokensRequested,
    idempotencyKey: walletIdempotencyKey,
    payoutId,
  });

  // Create payout request document
  const payoutRequest: PayoutRequestDocument = {
    payoutId,
    userId,
    status: 'REQUESTED',
    tokensRequested,
    tokenPayoutUsd: breakdown.tokenPayoutUsd,
    grossUsd: breakdown.grossUsd,
    stripeFeeUsd: breakdown.stripeFeeUsd,
    netUsd: breakdown.netUsd,
    stripeAccountId,
    stripeTransferId: null,
    stripeIdempotencyKey,
    ledgerTxId: debitResult.txId,
    statusHistory: [
      {
        from: null,
        to: 'REQUESTED',
        reason: 'User initiated payout request',
        timestamp: FieldValue.serverTimestamp(),
      },
    ],
    retryCount: 0,
    maxRetries: MAX_PAYOUT_RETRIES,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    completedAt: null,
  };

  await db.collection(PAYOUT_REQUESTS_COLLECTION).doc(payoutId).set(payoutRequest);

  return payoutRequest;
}

// ============================================================================
// APPROVE PAYOUT
// ============================================================================

/**
 * Approve a payout request (admin action).
 * Transitions: REQUESTED → APPROVED
 */
export async function approvePayout(payoutId: string, reason?: string): Promise<void> {
  await transitionStatus(payoutId, 'APPROVED', reason || 'Admin approved');
}

/**
 * Reject a payout request (admin action).
 * Transitions: REQUESTED → REJECTED
 *
 * NOTE: When rejecting, tokens should be refunded to the user.
 * This is handled separately via creditTokens.
 */
export async function rejectPayout(payoutId: string, reason: string): Promise<void> {
  await transitionStatus(payoutId, 'REJECTED', reason);
}

// ============================================================================
// PROCESS PAYOUT — EXECUTE STRIPE TRANSFER
// ============================================================================

/**
 * Process an approved payout via Stripe.
 * Transitions: APPROVED → PROCESSING → COMPLETED | FAILED
 *
 * 1. Validates payout is in APPROVED state
 * 2. Transitions to PROCESSING
 * 3. Creates Stripe transfer (with idempotency key)
 * 4. On success: transitions to COMPLETED with transfer ID
 * 5. On failure: transitions to FAILED with error reason
 *
 * Fee calculation:
 * - grossUsd = tokensRequested × TOKEN_PAYOUT_USD
 * - stripeFeeUsd = calculateStripeFee(grossUsd)
 * - netUsd = grossUsd - stripeFeeUsd  ← this is what user receives
 * - Stripe transfer amount = netUsd in cents
 */
export async function processPayout(payoutId: string): Promise<{
  success: boolean;
  stripeTransferId?: string;
  error?: string;
}> {
  // Get payout data
  const payoutSnap = await db.collection(PAYOUT_REQUESTS_COLLECTION).doc(payoutId).get();
  if (!payoutSnap.exists) {
    throw new Error(`[PayoutService] Payout ${payoutId} not found`);
  }

  const payout = payoutSnap.data() as PayoutRequestDocument;

  // Validate state
  if (payout.status !== 'APPROVED' && payout.status !== 'RETRY') {
    throw new Error(
      `[PayoutService] Cannot process payout in ${payout.status} state. Must be APPROVED or RETRY.`,
    );
  }

  // Transition to PROCESSING
  await transitionStatus(payoutId, 'PROCESSING', 'Starting Stripe transfer');

  try {
    // Execute Stripe transfer
    // Amount = net USD in cents (fees already deducted from user's perspective)
    const transferAmountCents = Math.round(payout.netUsd * 100);

    if (transferAmountCents <= 0) {
      throw new Error('Transfer amount is zero or negative after fee deduction');
    }

    const transferResult = await createStripeTransfer({
      accountId: payout.stripeAccountId,
      amountCents: transferAmountCents,
      currency: 'usd',
      description: `Avalo payout ${payoutId} (${payout.tokensRequested} tokens)`,
      metadata: {
        payoutId,
        userId: payout.userId,
        tokensRequested: String(payout.tokensRequested),
        grossUsd: String(payout.grossUsd),
        stripeFeeUsd: String(payout.stripeFeeUsd),
        netUsd: String(payout.netUsd),
        idempotencyKey: payout.stripeIdempotencyKey,
      },
    });

    // Success — transition to COMPLETED
    await transitionStatus(payoutId, 'COMPLETED', 'Stripe transfer successful', {
      stripeTransferId: transferResult.transferId,
    });

    return {
      success: true,
      stripeTransferId: transferResult.transferId,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Failure — transition to FAILED
    await transitionStatus(payoutId, 'FAILED', `Stripe transfer failed: ${errorMessage}`);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

// ============================================================================
// RETRY FAILED PAYOUT
// ============================================================================

/**
 * Retry a failed payout.
 * Transitions: FAILED → RETRY → PROCESSING (then processPayout logic)
 */
export async function retryPayout(payoutId: string): Promise<{
  success: boolean;
  stripeTransferId?: string;
  error?: string;
}> {
  // Get payout data
  const payoutSnap = await db.collection(PAYOUT_REQUESTS_COLLECTION).doc(payoutId).get();
  if (!payoutSnap.exists) {
    throw new Error(`[PayoutService] Payout ${payoutId} not found`);
  }

  const payout = payoutSnap.data() as PayoutRequestDocument;

  // Validate retry count
  if (payout.retryCount >= payout.maxRetries) {
    throw new Error(
      `[PayoutService] Maximum retries (${payout.maxRetries}) exceeded for payout ${payoutId}`,
    );
  }

  // Transition to RETRY
  await transitionStatus(payoutId, 'RETRY', `Retry attempt ${payout.retryCount + 1}`);

  // Process again (which transitions RETRY → PROCESSING → COMPLETED|FAILED)
  return processPayout(payoutId);
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get a payout request by ID.
 */
export async function getPayoutRequest(payoutId: string): Promise<PayoutRequestDocument | null> {
  const snap = await db.collection(PAYOUT_REQUESTS_COLLECTION).doc(payoutId).get();
  if (!snap.exists) return null;
  return snap.data() as PayoutRequestDocument;
}

/**
 * Get payout requests for a user.
 */
export async function getUserPayoutRequests(
  userId: string,
  options?: { limit?: number; status?: PayoutStatus },
): Promise<PayoutRequestDocument[]> {
  let query: FirebaseFirestore.Query = db
    .collection(PAYOUT_REQUESTS_COLLECTION)
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc');

  if (options?.status) {
    query = query.where('status', '==', options.status);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const snap = await query.get();
  return snap.docs.map((doc) => doc.data() as PayoutRequestDocument);
}

/**
 * Get all pending payouts (for admin processing).
 */
export async function getPendingPayouts(
  options?: { limit?: number },
): Promise<PayoutRequestDocument[]> {
  const snap = await db
    .collection(PAYOUT_REQUESTS_COLLECTION)
    .where('status', 'in', ['REQUESTED', 'APPROVED'])
    .orderBy('createdAt', 'asc')
    .limit(options?.limit || 50)
    .get();

  return snap.docs.map((doc) => doc.data() as PayoutRequestDocument);
}









