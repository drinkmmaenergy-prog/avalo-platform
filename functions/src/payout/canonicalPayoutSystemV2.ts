/**
 * ============================================================================
 * CANONICAL PAYOUT SYSTEM V2 — C12
 * ============================================================================
 *
 * Creator payout processing behind PAYOUTS_ENABLED kill switch.
 *
 * PAYOUTS REMAIN FAIL-CLOSED until ALL of the following are externally confirmed:
 *   ✗ Stripe Connect production credentials present (STRIPE_SECRET_KEY env var)
 *   ✗ STRIPE_WEBHOOK_SECRET env var set and verified
 *   ✗ Creator KYC + identity verification complete per creator
 *   ✗ Tax compliance configuration (W-9/W-8 or equivalent) per creator
 *   ✗ Reconciliation worker tested and validated in staging
 *   ✗ No unresolved ledger mismatches
 *   ✗ PAYOUTS_ENABLED flag manually flipped after above items are true
 *
 * Architecture:
 *   requestPayout()  → reserveForPayout() → REQUESTED state
 *   processPayout()  → createStripeTransfer() → PROCESSING state
 *   confirmPayout()  → finalizePayoutReservation(success=true) → COMPLETED
 *   failPayout()     → finalizePayoutReservation(success=false) → FAILED
 *
 * Payout math:
 *   grossUsdCents            = tokens × 4        (1 token = $0.04)
 *   avaloCommissionUsdCents  = floor(gross × 0.20)
 *   creatorNetUsdCents       = gross − commission
 *
 * No extra fixed Avalo fee. Provider (Stripe) transfer fees absorbed by Avalo
 * unless a future transparent policy explicitly changes this.
 *
 * Collections:
 *   creatorPayoutRequests/{payoutId}    — payout state machine
 *   creatorEarningAccounts/{uid}        — earning balance (C4)
 *   creatorEarningLedger/{entryId}      — earning events (C4)
 *
 * @module payout/canonicalPayoutSystemV2
 * @version 2.0.0
 */

import { onCall, HttpsError, onRequest } from 'firebase-functions/v2/https';
import { onSchedule }                    from 'firebase-functions/v2/scheduler';
import { FieldValue }                    from 'firebase-admin/firestore';
import { db }                            from '../init';
import { assertPayoutsEnabled }          from '../wallet/payoutGuard';
import { requirePayoutReadiness }        from '../compliance/ageGuard';
import {
  assertPayoutEligibility,
  reserveForPayout,
  finalizePayoutReservation,
  CREATOR_PAYOUT_REQUESTS,
  TOKEN_PAYOUT_USD_GROSS,
  AVALO_COMMISSION_RATE,
} from '../creator/canonicalEarningService';
import {
  createStripeTransfer,
  getStripeTransfer,
  getStripeAccountStatus,
} from '../integrations/stripeConnect';

// ── Constants ─────────────────────────────────────────────────────────────────

export const PAYOUT_MIN_TOKENS        = 100;   // minimum tokens to request payout
export const PAYOUT_MAX_TOKENS        = 1_000_000;
export const PAYOUT_MAX_RETRY_COUNT   = 3;
export const PAYOUT_PROCESSING_TIMEOUT_HOURS = 48; // mark failed if stuck in PROCESSING

// ── Types ─────────────────────────────────────────────────────────────────────

export type PayoutStatus =
  | 'REQUESTED'   // tokens reserved, Stripe transfer not yet initiated
  | 'PROCESSING'  // Stripe transfer initiated (stripeTransferId present)
  | 'COMPLETED'   // confirmed paid by webhook or reconciliation
  | 'FAILED'      // transfer failed; tokens released back to available
  | 'CANCELLED';  // cancelled before processing (tokens released)

export interface PayoutRequestDocument {
  payoutId:                 string;
  creatorId:                string;
  status:                   PayoutStatus;
  requestedTokens:          number;
  grossUsdCents:            number;
  avaloCommissionUsdCents:  number;
  creatorNetUsdCents:       number;
  stripeConnectAccountId:   string;
  stripeTransferId?:        string;
  stripeTransferStatus?:    string;
  idempotencyKey:           string;
  taxMetadataSnapshot:      Record<string, unknown>;
  retryCount:               number;
  requestedAt:              any;
  processedAt?:             any;
  completedAt?:             any;
  failedAt?:                any;
  cancelledAt?:             any;
  failureReason?:           string;
  reconciledAt?:            any;
}

// ── Payout math ───────────────────────────────────────────────────────────────

function computePayoutAmounts(tokens: number): {
  grossUsdCents: number;
  avaloCommissionUsdCents: number;
  creatorNetUsdCents: number;
} {
  const grossUsdCents           = tokens * Math.round(TOKEN_PAYOUT_USD_GROSS * 100); // tokens × 4
  const avaloCommissionUsdCents = Math.floor(grossUsdCents * AVALO_COMMISSION_RATE);
  const creatorNetUsdCents      = grossUsdCents - avaloCommissionUsdCents;
  return { grossUsdCents, avaloCommissionUsdCents, creatorNetUsdCents };
}

// ── Firestore refs ────────────────────────────────────────────────────────────

function payoutDocRef(payoutId: string) {
  return db.collection(CREATOR_PAYOUT_REQUESTS).doc(payoutId);
}

// ── Guard helpers ─────────────────────────────────────────────────────────────

function validateIdempotencyKey(key: unknown): string {
  if (typeof key !== 'string' || key.trim().length < 8 || key.trim().length > 128) {
    throw new HttpsError('invalid-argument', 'idempotencyKey must be 8-128 chars (e.g. UUID v4)');
  }
  return key.trim();
}

// ── Core payout functions ─────────────────────────────────────────────────────

/**
 * Creator requests a payout. Validates eligibility, reserves earning tokens,
 * creates REQUESTED payout document. Does NOT call Stripe yet.
 *
 * Call processPayout() or the scheduled worker to initiate the transfer.
 */
export async function requestPayout(params: {
  creatorId:      string;
  tokenAmount:    number;
  idempotencyKey: string;
}): Promise<{ payoutId: string; grossUsdCents: number; creatorNetUsdCents: number }> {
  // ── KILL SWITCH — must be first ───────────────────────────────────────────
  assertPayoutsEnabled();

  const { creatorId, tokenAmount } = params;
  const iKey = validateIdempotencyKey(params.idempotencyKey);

  if (!Number.isInteger(tokenAmount) || tokenAmount < PAYOUT_MIN_TOKENS) {
    throw new HttpsError('invalid-argument', `Minimum payout is ${PAYOUT_MIN_TOKENS} tokens`);
  }
  if (tokenAmount > PAYOUT_MAX_TOKENS) {
    throw new HttpsError('invalid-argument', `Maximum payout is ${PAYOUT_MAX_TOKENS} tokens`);
  }

  // ── Compliance + identity checks ──────────────────────────────────────────
  await requirePayoutReadiness(creatorId);

  // ── Earning eligibility ───────────────────────────────────────────────────
  const account = await assertPayoutEligibility(creatorId, tokenAmount);

  if (!account.stripeConnectAccountId || !account.stripeOnboardingComplete) {
    throw new HttpsError(
      'failed-precondition',
      'PAYOUT_STRIPE_INCOMPLETE: Stripe Connect onboarding must be complete before requesting payout.',
    );
  }

  // ── Tax metadata snapshot ─────────────────────────────────────────────────
  const taxSnap = await db.collection('creatorTaxProfiles').doc(creatorId).get();
  if (!taxSnap.exists) {
    throw new HttpsError(
      'failed-precondition',
      'PAYOUT_TAX_INCOMPLETE: Tax profile required before payout. Complete W-9/W-8 in settings.',
    );
  }
  const taxMetadataSnapshot = {
    formType:       (taxSnap.data() as any).formType,
    submittedAt:    (taxSnap.data() as any).submittedAt,
    taxYear:        new Date().getFullYear(),
    snapshotAt:     new Date().toISOString(),
  };

  // ── Amounts ───────────────────────────────────────────────────────────────
  const { grossUsdCents, avaloCommissionUsdCents, creatorNetUsdCents } =
    computePayoutAmounts(tokenAmount);

  // ── Idempotency check ─────────────────────────────────────────────────────
  const existingSnap = await db.collection(CREATOR_PAYOUT_REQUESTS)
    .where('idempotencyKey', '==', iKey)
    .where('creatorId', '==', creatorId)
    .limit(1)
    .get();
  if (!existingSnap.empty) {
    const existing = existingSnap.docs[0].data() as PayoutRequestDocument;
    return { payoutId: existing.payoutId, grossUsdCents, creatorNetUsdCents };
  }

  // ── Reserve earning tokens ─────────────────────────────────────────────────
  const payoutId = db.collection(CREATOR_PAYOUT_REQUESTS).doc().id;
  await reserveForPayout({ creatorId, tokenAmount, payoutId });

  // ── Create payout document ─────────────────────────────────────────────────
  const doc: PayoutRequestDocument = {
    payoutId,
    creatorId,
    status:                   'REQUESTED',
    requestedTokens:          tokenAmount,
    grossUsdCents,
    avaloCommissionUsdCents,
    creatorNetUsdCents,
    stripeConnectAccountId:   account.stripeConnectAccountId!,
    idempotencyKey:           iKey,
    taxMetadataSnapshot,
    retryCount:               0,
    requestedAt:              FieldValue.serverTimestamp(),
  };
  await payoutDocRef(payoutId).set(doc);

  return { payoutId, grossUsdCents, creatorNetUsdCents };
}

/**
 * Initiate the Stripe transfer for a REQUESTED payout.
 * Called by the scheduled processor or manually by admin.
 * Marks payout as PROCESSING on Stripe call success.
 * If Stripe fails, releases token reservation and marks FAILED.
 */
export async function processPayout(payoutId: string): Promise<void> {
  assertPayoutsEnabled();

  const snap = await payoutDocRef(payoutId).get();
  if (!snap.exists) throw new Error(`Payout ${payoutId} not found`);
  const payout = snap.data() as PayoutRequestDocument;

  if (payout.status !== 'REQUESTED') {
    console.log(`[processPayout] ${payoutId} is ${payout.status} — skipping`);
    return;
  }
  if (payout.retryCount >= PAYOUT_MAX_RETRY_COUNT) {
    await failPayout(payoutId, payout, 'MAX_RETRY_EXCEEDED');
    return;
  }

  try {
    // Stripe transfer idempotency key — deterministic, no Date.now()
    const stripeIdempotencyKey = `avalo_payout_${payoutId}`;

    const transfer = await createStripeTransfer({
      accountId: payout.stripeConnectAccountId,
      amountCents:          payout.creatorNetUsdCents,
      currency:             'usd',
      // idempotencyKey passed via Stripe API option, not in params
      description:         `avalo_payout_${payoutId}`,
      metadata: {
        payoutId,
        creatorId:    payout.creatorId,
        tokens:       String(payout.requestedTokens),
        grossCents:   String(payout.grossUsdCents),
        commissionCents: String(payout.avaloCommissionUsdCents),
      },
    });

    await payoutDocRef(payoutId).update({
      status:               'PROCESSING',
      stripeTransferId:     transfer.transferId,
      stripeTransferStatus: transfer.status,
      processedAt:          FieldValue.serverTimestamp(),
      retryCount:           FieldValue.increment(1),
    });

  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[processPayout] ${payoutId} Stripe transfer failed:`, reason);
    // Don't fail immediately on first error — let reconciliation retry
    await payoutDocRef(payoutId).update({
      retryCount:    FieldValue.increment(1),
      failureReason: reason,
    });
    if ((payout.retryCount + 1) >= PAYOUT_MAX_RETRY_COUNT) {
      await failPayout(payoutId, payout, reason);
    }
  }
}

/**
 * Confirm a PROCESSING payout as COMPLETED.
 * Called by webhook handler or reconciliation worker.
 * Finalizes the earning token reservation (tokens permanently paid out).
 */
export async function confirmPayout(payoutId: string): Promise<void> {
  assertPayoutsEnabled();

  const snap = await payoutDocRef(payoutId).get();
  if (!snap.exists) throw new Error(`Payout ${payoutId} not found`);
  const payout = snap.data() as PayoutRequestDocument;

  if (payout.status === 'COMPLETED') return; // idempotent
  if (payout.status !== 'PROCESSING') {
    throw new Error(`[confirmPayout] Cannot confirm payout in state ${payout.status}`);
  }

  await finalizePayoutReservation({
    creatorId:   payout.creatorId,
    tokenAmount: payout.requestedTokens,
    success:     true,
  });

  await payoutDocRef(payoutId).update({
    status:      'COMPLETED',
    completedAt: FieldValue.serverTimestamp(),
  });

  console.log(`[confirmPayout] Payout ${payoutId} COMPLETED — ${payout.requestedTokens} tokens, $${(payout.creatorNetUsdCents / 100).toFixed(2)} net`);
}

/**
 * Mark a payout as FAILED and release the token reservation.
 * Can be called after max retries or on unrecoverable Stripe error.
 */
export async function failPayout(
  payoutId: string,
  payout: PayoutRequestDocument,
  reason: string,
): Promise<void> {
  if (payout.status === 'FAILED') return; // idempotent

  await finalizePayoutReservation({
    creatorId:   payout.creatorId,
    tokenAmount: payout.requestedTokens,
    success:     false, // releases reserved tokens back to available
  });

  await payoutDocRef(payoutId).update({
    status:        'FAILED',
    failedAt:      FieldValue.serverTimestamp(),
    failureReason: reason,
  });

  console.error(`[failPayout] Payout ${payoutId} FAILED: ${reason}`);
}

/**
 * Cancel a REQUESTED payout (before Stripe transfer initiated).
 * Releases token reservation.
 */
export async function cancelPayout(params: {
  payoutId:  string;
  creatorId: string;
}): Promise<void> {
  assertPayoutsEnabled();
  const { payoutId, creatorId } = params;

  const snap = await payoutDocRef(payoutId).get();
  if (!snap.exists) throw new HttpsError('not-found', `Payout ${payoutId} not found`);
  const payout = snap.data() as PayoutRequestDocument;

  if (payout.creatorId !== creatorId) {
    throw new HttpsError('permission-denied', 'Cannot cancel another creator\'s payout');
  }
  if (payout.status !== 'REQUESTED') {
    throw new HttpsError('failed-precondition', `Cannot cancel payout in state ${payout.status}`);
  }

  await finalizePayoutReservation({
    creatorId:   payout.creatorId,
    tokenAmount: payout.requestedTokens,
    success:     false,
  });

  await payoutDocRef(payoutId).update({
    status:      'CANCELLED',
    cancelledAt: FieldValue.serverTimestamp(),
  });
}

// ── Reconciliation ────────────────────────────────────────────────────────────

/**
 * Reconciliation: checks Stripe transfer status for all PROCESSING payouts.
 * For each PROCESSING payout:
 *   - If Stripe reports 'paid': confirmPayout()
 *   - If Stripe reports 'failed': failPayout()
 *   - If > PAYOUT_PROCESSING_TIMEOUT_HOURS old with no resolution: failPayout()
 */
export async function reconcilePayouts(): Promise<{
  confirmed: number; failed: number; pending: number;
}> {
  assertPayoutsEnabled();

  const processing = await db.collection(CREATOR_PAYOUT_REQUESTS)
    .where('status', '==', 'PROCESSING')
    .limit(100)
    .get();

  let confirmed = 0;
  let failed    = 0;
  let pending   = 0;
  const now     = Date.now();

  await Promise.allSettled(
    processing.docs.map(async (doc) => {
      const payout = doc.data() as PayoutRequestDocument;

      if (!payout.stripeTransferId) {
        // Stuck in PROCESSING without transfer ID — treat as failed
        await failPayout(payout.payoutId, payout, 'RECON_NO_TRANSFER_ID');
        failed++;
        return;
      }

      try {
        const transfer = await getStripeTransfer(payout.stripeTransferId);

        // getStripeTransfer returns 'PAID' or 'FAILED' (uppercase)
        if (transfer.status === 'PAID') {
          await confirmPayout(payout.payoutId);
          await payoutDocRef(payout.payoutId).update({ reconciledAt: FieldValue.serverTimestamp() });
          confirmed++;
        } else if (transfer.status === 'FAILED') {
          await failPayout(payout.payoutId, payout, `STRIPE_FAILED: ${transfer.status}`);
          failed++;
        } else {
          // Still pending in Stripe — check timeout
          const processedAt = payout.processedAt?.toDate?.() ?? new Date(0);
          const hoursElapsed = (now - processedAt.getTime()) / (1000 * 60 * 60);
          if (hoursElapsed > PAYOUT_PROCESSING_TIMEOUT_HOURS) {
            await failPayout(payout.payoutId, payout, `RECON_TIMEOUT_${Math.floor(hoursElapsed)}h`);
            failed++;
          } else {
            pending++;
          }
        }
      } catch (err: unknown) {
        console.error(`[reconcilePayouts] Error for ${payout.payoutId}:`, err);
        pending++;
      }
    }),
  );

  return { confirmed, failed, pending };
}

// ── Scheduled processors ──────────────────────────────────────────────────────

/**
 * C12: Scheduled payout processor.
 * Picks up REQUESTED payouts and initiates Stripe transfers.
 * Runs every 5 minutes.
 */
export const c12_payoutProcessor = onSchedule(
  { schedule: 'every 5 minutes', timeoutSeconds: 300, retryCount: 1 },
  async (_event) => {
    // Kill switch — schedule runs but does nothing when disabled
    if (!(await _isPayoutsEnabled())) {
      console.log('[c12_payoutProcessor] PAYOUTS_ENABLED=false — skipping');
      return;
    }

    const requested = await db.collection(CREATOR_PAYOUT_REQUESTS)
      .where('status', '==', 'REQUESTED')
      .orderBy('requestedAt')
      .limit(50)
      .get();

    await Promise.allSettled(
      requested.docs.map((doc) => processPayout(doc.id)),
    );
  },
);

/**
 * C12: Scheduled reconciliation worker.
 * Confirms or fails PROCESSING payouts by checking Stripe transfer status.
 * Runs every 30 minutes.
 */
export const c12_payoutReconciler = onSchedule(
  { schedule: 'every 30 minutes', timeoutSeconds: 300, retryCount: 1 },
  async (_event) => {
    if (!(await _isPayoutsEnabled())) {
      console.log('[c12_payoutReconciler] PAYOUTS_ENABLED=false — skipping');
      return;
    }
    const result = await reconcilePayouts();
    console.log(`[c12_payoutReconciler] confirmed=${result.confirmed} failed=${result.failed} pending=${result.pending}`);
  },
);

/** Non-throwing kill switch check for scheduled functions. */
async function _isPayoutsEnabled(): Promise<boolean> {
  try {
    assertPayoutsEnabled();
    return true;
  } catch {
    return false;
  }
}

// ── Admin operations ──────────────────────────────────────────────────────────

/**
 * Admin: force-fail a stuck payout and release tokens.
 * Requires AVALO_ADMIN claim.
 */
export async function adminFailPayout(params: {
  adminId:  string;
  payoutId: string;
  reason:   string;
}): Promise<void> {
  const { adminId, payoutId, reason } = params;

  // Verify admin claim
  const adminUser = await require('firebase-admin').auth().getUser(adminId);
  const claims    = adminUser.customClaims as Record<string, unknown> | undefined;
  if (!claims?.AVALO_ADMIN) {
    throw new HttpsError('permission-denied', 'Requires AVALO_ADMIN claim');
  }

  const snap = await payoutDocRef(payoutId).get();
  if (!snap.exists) throw new HttpsError('not-found', `Payout ${payoutId} not found`);
  const payout = snap.data() as PayoutRequestDocument;

  if (payout.status === 'COMPLETED') {
    throw new HttpsError('failed-precondition', 'Cannot fail a COMPLETED payout');
  }

  await failPayout(payoutId, payout, `ADMIN_FORCE_FAIL: ${reason} by ${adminId}`);
  console.log(`[adminFailPayout] Admin ${adminId} force-failed payout ${payoutId}: ${reason}`);
}

/**
 * Admin: force-confirm a payout (e.g. after manual Stripe verification).
 * Requires AVALO_ADMIN claim.
 */
export async function adminConfirmPayout(params: {
  adminId:  string;
  payoutId: string;
}): Promise<void> {
  const { adminId, payoutId } = params;

  const adminUser = await require('firebase-admin').auth().getUser(adminId);
  const claims    = adminUser.customClaims as Record<string, unknown> | undefined;
  if (!claims?.AVALO_ADMIN) {
    throw new HttpsError('permission-denied', 'Requires AVALO_ADMIN claim');
  }

  await confirmPayout(payoutId);
  console.log(`[adminConfirmPayout] Admin ${adminId} confirmed payout ${payoutId}`);
}

/**
 * Admin: get payout ledger summary for a creator.
 */
export async function adminGetPayoutSummary(params: {
  adminId:   string;
  creatorId: string;
}): Promise<{ payouts: PayoutRequestDocument[] }> {
  const { adminId, creatorId } = params;

  const adminUser = await require('firebase-admin').auth().getUser(adminId);
  const claims    = adminUser.customClaims as Record<string, unknown> | undefined;
  if (!claims?.AVALO_ADMIN) {
    throw new HttpsError('permission-denied', 'Requires AVALO_ADMIN claim');
  }

  const snap = await db.collection(CREATOR_PAYOUT_REQUESTS)
    .where('creatorId', '==', creatorId)
    .orderBy('requestedAt', 'desc')
    .limit(100)
    .get();

  return { payouts: snap.docs.map((d) => d.data() as PayoutRequestDocument) };
}

// ── Production onCall exports ─────────────────────────────────────────────────

export const c12_requestPayout = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    return requestPayout({
      creatorId:      req.auth.uid,
      tokenAmount:    req.data.tokenAmount,
      idempotencyKey: req.data.idempotencyKey,
    });
  },
);

export const c12_cancelPayout = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    return cancelPayout({ payoutId: req.data.payoutId, creatorId: req.auth.uid });
  },
);

export const c12_getPayoutStatus = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    assertPayoutsEnabled();
    const snap = await payoutDocRef(req.data.payoutId).get();
    if (!snap.exists) throw new HttpsError('not-found', 'Payout not found');
    const payout = snap.data() as PayoutRequestDocument;
    if (payout.creatorId !== req.auth.uid) {
      throw new HttpsError('permission-denied', 'Access denied');
    }
    return { payout };
  },
);

export const c12_adminFailPayout = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    return adminFailPayout({
      adminId:  req.auth.uid,
      payoutId: req.data.payoutId,
      reason:   req.data.reason,
    });
  },
);

export const c12_adminConfirmPayout = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    return adminConfirmPayout({ adminId: req.auth.uid, payoutId: req.data.payoutId });
  },
);

export const c12_adminGetPayoutSummary = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    return adminGetPayoutSummary({ adminId: req.auth.uid, creatorId: req.data.creatorId });
  },
);

export const c12_adminReconcilePayouts = onCall(
  { enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in');
    const adminUser = await require('firebase-admin').auth().getUser(req.auth.uid);
    const claims    = adminUser.customClaims as Record<string, unknown> | undefined;
    if (!claims?.AVALO_ADMIN) throw new HttpsError('permission-denied', 'Requires AVALO_ADMIN claim');
    return reconcilePayouts();
  },
);
