/**
 * ============================================================================
 * CANONICAL PAYOUT WEBHOOK HANDLER — C12
 * ============================================================================
 *
 * Stripe webhook endpoint for payout transfer events.
 *
 * CRITICAL: This endpoint verifies the Stripe webhook signature using
 * STRIPE_WEBHOOK_SECRET from environment. Events are REJECTED if the secret
 * is missing or the signature is invalid.
 *
 * Handled events:
 *   transfer.paid     → confirmPayout()
 *   transfer.failed   → failPayout()
 *   transfer.reversed → failPayout() (reversal = failed)
 *   account.updated   → update Stripe account status in creatorEarningAccounts
 *
 * All handlers are idempotent — duplicate webhook delivery is safe.
 *
 * @module payout/canonicalPayoutWebhookHandler
 * @version 2.0.0
 */

import { onRequest }    from 'firebase-functions/v2/https';
import { FieldValue }   from 'firebase-admin/firestore';
import Stripe           from 'stripe';
import { db }           from '../init';
import {
  confirmPayout,
  failPayout,
  PayoutRequestDocument,
} from './canonicalPayoutSystemV2';
import { CREATOR_PAYOUT_REQUESTS } from '../creator/canonicalEarningService';

// ── Stripe webhook secret ─────────────────────────────────────────────────────

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
  if (!secret) {
    throw new Error(
      '[PayoutWebhook] STRIPE_WEBHOOK_SECRET not configured. ' +
      'Set this environment variable before enabling webhook processing.',
    );
  }
  return secret;
}

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  if (!key) {
    throw new Error('[PayoutWebhook] STRIPE_SECRET_KEY not configured.');
  }
  return new Stripe(key, { apiVersion: '2023-10-16' });
}

// ── Webhook handler ───────────────────────────────────────────────────────────

/**
 * Stripe webhook endpoint.
 * Deployed at: /c12_stripePayoutWebhook
 *
 * Configure this URL in Stripe Dashboard → Developers → Webhooks.
 * Required events: transfer.paid, transfer.failed, account.updated
 */
export const c12_stripePayoutWebhook = onRequest(
  { timeoutSeconds: 60 },
  async (req, res) => {
    // ── Only POST accepted ─────────────────────────────────────────────────
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // ── Signature verification ─────────────────────────────────────────────
    let event: Stripe.Event;
    try {
      const webhookSecret = getWebhookSecret();
      const stripe        = getStripeClient();
      // rawBody: Firebase Functions v2 attaches rawBody for Stripe signature validation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rawBody is not in standard Express.Request
      const rawBody       = (req as import("firebase-functions").https.Request).rawBody as Buffer | undefined ?? Buffer.from('');
      const signature     = req.headers['stripe-signature'] as string;

      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[PayoutWebhook] Signature verification failed:', msg);
      res.status(400).send(`Webhook signature verification failed: ${msg}`);
      return;
    }

    // ── Idempotency — record event before processing ───────────────────────
    const eventRef = db.collection('_stripeWebhookEvents').doc(event.id);
    const eventSnap = await eventRef.get();
    if (eventSnap.exists) {
      // Already processed this event — return 200 immediately (Stripe will stop retrying)
      console.log(`[PayoutWebhook] Event ${event.id} already processed — skipping`);
      res.status(200).json({ received: true, duplicate: true });
      return;
    }
    await eventRef.set({
      eventId:     event.id,
      type:        event.type,
      processedAt: FieldValue.serverTimestamp(),
    });

    // ── Route to handler ───────────────────────────────────────────────────
    try {
      // Stripe.Event.type is a discriminated union; cast to string for portability
      switch (event.type as string) {
        case 'transfer.paid':
          await handleTransferPaid((event.data as { object: Stripe.Transfer }).object);
          break;
        case 'transfer.failed':
        case 'transfer.reversed':
          await handleTransferFailed((event.data as { object: Stripe.Transfer }).object);
          break;
        case 'account.updated':
          await handleAccountUpdated((event.data as { object: Stripe.Account }).object);
          break;
        default:
          console.log(`[PayoutWebhook] Unhandled event type: ${event.type}`);
      }
      res.status(200).json({ received: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[PayoutWebhook] Error processing ${event.type}:`, msg);
      // Return 500 so Stripe retries
      res.status(500).send(`Processing error: ${msg}`);
    }
  },
);

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleTransferPaid(transfer: Stripe.Transfer): Promise<void> {
  const payoutId = transfer.metadata?.payoutId;
  if (!payoutId) {
    console.warn('[PayoutWebhook] transfer.paid: no payoutId in metadata — ignoring');
    return;
  }
  console.log(`[PayoutWebhook] transfer.paid: payoutId=${payoutId} transferId=${transfer.id}`);
  await confirmPayout(payoutId);
}

async function handleTransferFailed(transfer: Stripe.Transfer): Promise<void> {
  const payoutId = transfer.metadata?.payoutId;
  if (!payoutId) {
    console.warn('[PayoutWebhook] transfer.failed: no payoutId in metadata — ignoring');
    return;
  }

  const snap = await db.collection(CREATOR_PAYOUT_REQUESTS).doc(payoutId).get();
  if (!snap.exists) {
    console.warn(`[PayoutWebhook] transfer.failed: payout ${payoutId} not found`);
    return;
  }

  const payout = snap.data() as PayoutRequestDocument;
  // reversals is Stripe.ApiList<Stripe.TransferReversal> or undefined
  const reversalCount = (transfer.reversals as Stripe.ApiList<Stripe.TransferReversal> | undefined)?.data?.length ?? 0;
  const reason = `STRIPE_TRANSFER_FAILED: ${transfer.id} status=${reversalCount > 0 ? 'reversed' : 'failed'}`;
  console.log(`[PayoutWebhook] transfer.failed: payoutId=${payoutId} reason=${reason}`);
  await failPayout(payoutId, payout, reason);
}

async function handleAccountUpdated(account: Stripe.Account): Promise<void> {
  // Find creator by stripeConnectAccountId
  const creatorSnap = await db.collection('creatorEarningAccounts')
    .where('stripeConnectAccountId', '==', account.id)
    .limit(1)
    .get();

  if (creatorSnap.empty) {
    console.warn(`[PayoutWebhook] account.updated: no creator found for account ${account.id}`);
    return;
  }

  const creatorDoc = creatorSnap.docs[0];
  const chargesEnabled = account.charges_enabled ?? false;
  const payoutsEnabled = account.payouts_enabled ?? false;
  const detailsSubmitted = account.details_submitted ?? false;
  const onboardingComplete = chargesEnabled && payoutsEnabled && detailsSubmitted;

  await creatorDoc.ref.update({
    stripeOnboardingComplete: onboardingComplete,
    stripeChargesEnabled:     chargesEnabled,
    stripePayoutsEnabled:     payoutsEnabled,
    stripeDetailsSubmitted:   detailsSubmitted,
    stripeAccountUpdatedAt:   FieldValue.serverTimestamp(),
    updatedAt:                FieldValue.serverTimestamp(),
  });

  console.log(
    `[PayoutWebhook] account.updated: creator=${creatorDoc.id} ` +
    `onboarding=${onboardingComplete} charges=${chargesEnabled} payouts=${payoutsEnabled}`,
  );
}
