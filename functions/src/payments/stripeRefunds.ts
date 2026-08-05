// functions/src/payments/stripeRefunds.ts
//
// S4 — CANONICAL STRIPE REVERSAL PROCESSING (refunds + disputes/chargebacks), shared by all three
// Stripe webhook endpoints (pack288, paymentsComplete V2, payments.ts v1) so reversal semantics
// can never diverge and duplicate cross-endpoint delivery is idempotent by construction.
//
// POLICY (S4_REFUND_DISPUTE_POLICY):
//  - AUTOMATIC balance debit happens ONLY for a FULL refund whose purchase is proven by the
//    immutable Phase B transaction barrier providerPurchaseTransactions/stripe:<paymentIntentId>
//    (provider + PaymentIntent + original user + original token amount + ledgerTxId — the exact
//    canonical purchase evidence). Nothing else is ever trusted for a debit.
//  - The debit uses walletService.debitForRefund: idempotent by charge id, transactional,
//    soft-debit min(tokens, balance) — negative balances are IMPOSSIBLE; shortfall (tokens
//    already spent) is surfaced as a durable reconciliation record for manual review.
//  - Reversals NEVER touch wallets.earned, creatorEarningAccounts, creatorEarningLedger, or
//    payout eligibility (no proven accounting relationship exists between a consumer top-up
//    refund and creator earnings; debitForRefund mutates balance/spent only).
//  - Everything unprovable is RECONCILED, never silently acknowledged and never auto-debited:
//    partial refunds (no proportional clawback rule exists in this repository), refunds without
//    a PaymentIntent, refunds without a barrier (legacy purchases), malformed barriers.
//  - Disputes/chargebacks are NOT refunds: they only create durable reconciliation state until a
//    dedicated dispute workflow exists. No automatic money mutation.
//  - ACK vs RETRY: durable-record-then-ACK for operator cases (retrying cannot change the proof
//    state); RETRY only for transient write failures (Stripe redelivers; all writes idempotent).
//  - Fixed-classification logs only (provider ids; never uid, amounts beyond the reconciliation
//    doc, payloads, or caught error text). Response bodies are owned by the routes (generic).

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import type Stripe from 'stripe';
import { debitForRefund, PROVIDER_PURCHASE_TX_COLLECTION } from '../wallet/walletService';

const db = getFirestore();

export type ReversalOutcome = 'ACK' | 'RETRY';

/** Durable, idempotent, server-only operator signal for reversal states. */
async function openReversalReconciliation(
  reconciliationKey: string,
  reason: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const now = FieldValue.serverTimestamp();
  await db.collection('paymentReconciliation').doc(reconciliationKey).set(
    {
      reconciliationKey,
      provider: 'stripe',
      reason,
      status: 'OPEN',
      ...fields,
      updatedAt: now,
      createdAt: now,
    },
    { merge: true },
  );
}

function paymentIntentIdOf(charge: Stripe.Charge): string | null {
  return typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : charge.payment_intent?.id ?? null;
}

/**
 * charge.refunded — proof-gated, idempotent reversal. See module policy header.
 */
export async function processStripeChargeRefunded(
  charge: Stripe.Charge,
  eventId: string,
  sourceRoute: string,
): Promise<ReversalOutcome> {
  const chargeId = charge.id;
  const paymentIntentId = paymentIntentIdOf(charge);
  const reconKey = `stripe:refund:${chargeId}`;
  const baseFields = {
    chargeId,
    providerTransactionId: paymentIntentId,
    eventId,
    sourceRoute,
  };

  try {
    if (!chargeId) {
      logger.warn('stripe refund: unprocessable charge event');
      return 'ACK'; // no key to reconcile by; nothing trustworthy to act on
    }
    if (!paymentIntentId) {
      await openReversalReconciliation(reconKey, 'refund_missing_payment_intent', baseFields);
      // S6: fixed classification only — provider ids live in the durable record, never in logs.
      logger.error('stripe refund: missing payment intent (reconciliation opened)');
      return 'ACK';
    }

    // Partial refunds: no proportional token-clawback rule exists in this repository ->
    // reconcile for the operator; never invent one.
    const isFullRefund =
      charge.refunded === true ||
      (typeof charge.amount === 'number' &&
        typeof charge.amount_refunded === 'number' &&
        charge.amount > 0 &&
        charge.amount_refunded >= charge.amount);
    if (!isFullRefund) {
      await openReversalReconciliation(reconKey, 'refund_partial_requires_operator', {
        ...baseFields,
        amountMinor: typeof charge.amount === 'number' ? charge.amount : null,
        amountRefundedMinor:
          typeof charge.amount_refunded === 'number' ? charge.amount_refunded : null,
      });
      logger.warn('stripe refund: partial refund (reconciliation opened)');
      return 'ACK';
    }

    // PURCHASE PROOF: the immutable transaction barrier is the ONLY accepted evidence.
    const barrierSnap = await db
      .collection(PROVIDER_PURCHASE_TX_COLLECTION)
      .doc(`stripe:${paymentIntentId}`)
      .get();
    if (!barrierSnap.exists) {
      // Legacy purchase (no barriers) or unknown/foreign charge: proof-gated -> operator.
      await openReversalReconciliation(reconKey, 'refund_unmatched_purchase', baseFields);
      logger.warn('stripe refund: no canonical purchase proof (reconciliation opened)');
      return 'ACK';
    }
    const barrier = barrierSnap.data() as Record<string, unknown>;
    const barrierValid =
      barrier.provider === 'stripe' &&
      barrier.status === 'CREDITED' &&
      barrier.providerTransactionId === paymentIntentId &&
      typeof barrier.userId === 'string' &&
      (barrier.userId as string).length > 0 &&
      typeof barrier.providerSessionId === 'string' &&
      typeof barrier.ledgerTxId === 'string' &&
      typeof barrier.amountTokens === 'number' &&
      Number.isInteger(barrier.amountTokens) &&
      (barrier.amountTokens as number) > 0;
    if (!barrierValid) {
      // Conflicting/malformed purchase identity -> never auto-debit.
      await openReversalReconciliation(reconKey, 'refund_purchase_proof_conflict', baseFields);
      logger.error('stripe refund: purchase proof conflict (reconciliation opened)');
      return 'ACK';
    }
    const userId = barrier.userId as string;
    const amountTokens = barrier.amountTokens as number;
    const providerSessionId = barrier.providerSessionId as string;

    // Idempotent soft-debit (min(tokens, balance); never negative; PURCHASE_REFUND ledger;
    // duplicate provider delivery — same charge id — is an in-transaction no-op).
    const { tokensDebited, shortfall } = await debitForRefund({
      userId,
      amountTokens,
      idempotencyKey: `stripe_refund_${chargeId}`,
      metadata: {
        chargeId,
        paymentIntentId,
        providerSessionId,
        purchaseLedgerTxId: barrier.ledgerTxId,
        sourceRoute,
        eventId,
      },
    });

    // Mark the canonical audit record REFUNDED (status is the designed mutable field; the
    // immutable-compare in canonical completion deliberately excludes it). Update-if-exists
    // only — never create a stub that could collide with the audit create() path.
    const tpRef = db.collection('tokenPurchases').doc(`stripe_${providerSessionId}`);
    const tpSnap = await tpRef.get();
    if (tpSnap.exists) {
      await tpRef.update({ status: 'REFUNDED', refundedAt: FieldValue.serverTimestamp() });
    }

    if (shortfall > 0) {
      // Tokens already spent: durable manual-review record (money refunded on the provider side).
      await openReversalReconciliation(reconKey, 'refund_shortfall_after_spend', {
        ...baseFields,
        providerSessionId,
        amountTokens,
        tokensDebited,
        shortfall,
      });
      // S6: no ids, no token counts in runtime logs — the durable record carries the evidence.
      logger.warn('stripe refund: shortfall after spend (reconciliation opened)');
    }

    logger.info('stripe refund: processed');
    return 'ACK';
  } catch {
    // Transient failure (reads/debit/recon write): fixed classification; Stripe redelivers and
    // every step above is idempotent.
    logger.error('stripe refund: processing failed; requesting idempotent retry');
    return 'RETRY';
  }
}

/**
 * charge.dispute.created / charge.dispute.closed — chargebacks are NOT refunds. No automatic
 * money mutation; durable reconciliation state only, until a dedicated dispute workflow exists.
 */
export async function recordStripeDisputeEvent(
  dispute: Stripe.Dispute,
  eventId: string,
  sourceRoute: string,
  kind: 'created' | 'closed',
): Promise<ReversalOutcome> {
  const disputeId = dispute.id;
  try {
    if (!disputeId) {
      logger.warn('stripe dispute: unprocessable dispute event');
      return 'ACK';
    }
    const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id ?? null;
    await openReversalReconciliation(`stripe:dispute:${disputeId}`, `dispute_${kind}_requires_operator`, {
      disputeId,
      chargeId,
      providerTransactionId:
        typeof dispute.payment_intent === 'string'
          ? dispute.payment_intent
          : dispute.payment_intent?.id ?? null,
      disputeStatus: dispute.status ?? null,
      eventId,
      sourceRoute,
    });
    logger.warn(`stripe dispute ${kind}: reconciliation opened`);
    return 'ACK';
  } catch {
    logger.error('stripe dispute: recording failed; requesting idempotent retry');
    return 'RETRY';
  }
}
