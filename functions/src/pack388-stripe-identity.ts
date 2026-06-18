import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 388 — Stripe Identity Webhook Handler
 *
 * Receives Stripe Identity callbacks after a user completes (or fails)
 * the identity verification flow in the client SDK.
 *
 * Stripe Identity events handled:
 *   identity.verification_session.verified      → user 18+, approve
 *   identity.verification_session.requires_input → verification failed / needs manual review
 *
 * On success writes (canonical age source of truth — P0-3):
 *   users/{uid}.ageVerified            = true
 *   users/{uid}.ageVerification.status = 'VERIFIED'
 *   users/{uid}.ageVerification.method = 'STRIPE_IDENTITY'
 *   users/{uid}.ageVerification.verifiedAt
 *   users/{uid}.ageVerification.expiresAt  (365 days)
 *   users/{uid}.birthDate              = Timestamp from verified DOB
 *
 * On minor detection: delegates to pack388_minorDetectionLock (same file as before).
 */

import * as admin from 'firebase-admin';
import { https, logger } from 'firebase-functions/v2';
import Stripe from 'stripe';
import { pack388_minorDetectionLock, AgeVerificationStatus, VerificationMethod } from './pack388-age-verification';

const db = admin.firestore();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

/**
 * Stripe Identity webhook endpoint.
 * Register this URL in Stripe Dashboard → Developers → Webhooks.
 * Events to subscribe: identity.verification_session.verified,
 *                      identity.verification_session.requires_input
 * Signing secret env var: STRIPE_IDENTITY_WEBHOOK_SECRET
 */
export const pack388_stripeIdentityWebhook = https.onRequest(
  { region: 'europe-west1', memory: '256MiB', timeoutSeconds: 60 },
  async (req, res) => {
    const sig = req.headers['stripe-signature'];

    if (!sig || typeof sig !== 'string') {
      logger.warn('[StripeIdentity] Missing Stripe-Signature header');
      res.status(400).send('Missing signature');
      return;
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        process.env.STRIPE_IDENTITY_WEBHOOK_SECRET || ''
      );
    } catch (err: any) {
      logger.error('[StripeIdentity] Webhook signature verification failed:', err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    try {
      switch (event.type) {
        case 'identity.verification_session.verified':
          await handleSessionVerified(event.data.object as Stripe.Identity.VerificationSession);
          break;

        case 'identity.verification_session.requires_input':
          await handleSessionRequiresInput(event.data.object as Stripe.Identity.VerificationSession);
          break;

        default:
          logger.info(`[StripeIdentity] Unhandled event type: ${event.type}`);
      }

      res.status(200).json({ received: true });
    } catch (err: any) {
      logger.error('[StripeIdentity] Error processing event:', err);
      res.status(500).send('Internal error');
    }
  }
);

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle successful identity verification.
 * Stripe has confirmed the document is real and the selfie matches.
 */
async function handleSessionVerified(
  session: Stripe.Identity.VerificationSession
): Promise<void> {
  const userId = session.metadata?.userId;
  const attemptId = session.metadata?.attemptId;

  if (!userId) {
    logger.error('[StripeIdentity] No userId in session metadata', { sessionId: session.id });
    return;
  }

  logger.info('[StripeIdentity] Session verified', { sessionId: session.id, userId });

  // Extract verified date of birth from Stripe's verified outputs
  const dob = session.verified_outputs?.dob;
  let birthDate: admin.firestore.Timestamp | null = null;
  let verifiedAge: number | null = null;

  if (dob && dob.year && dob.month && dob.day) {
    const dobDate = new Date(dob.year, dob.month - 1, dob.day);
    birthDate = admin.firestore.Timestamp.fromDate(dobDate);
    verifiedAge = Math.floor(
      (Date.now() - dobDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    );
  }

  // --- Minor check ---
  if (verifiedAge !== null && verifiedAge < 18) {
    logger.warn('[StripeIdentity] Minor detected', { userId, verifiedAge });
    await pack388_minorDetectionLock({
      userId,
      detectedAge: verifiedAge,
      method: VerificationMethod.ID_DOCUMENT,
      confidence: 99, // Stripe Identity = high-assurance
    });

    if (attemptId) {
      await updateAttemptStatus(attemptId, AgeVerificationStatus.LOCKED, 'Minor detected via Stripe Identity');
    }
    return;
  }

  // --- Approve user ---
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
  );

  const userUpdate: Record<string, any> = {
    ageVerified: true,
    'ageVerification.status': AgeVerificationStatus.VERIFIED,
    'ageVerification.method': 'STRIPE_IDENTITY',
    'ageVerification.verifiedAt': now,
    'ageVerification.expiresAt': expiresAt,
    'ageVerification.stripeSessionId': session.id,
    'ageVerification.attemptCount': admin.firestore.FieldValue.increment(1),
  };

  if (birthDate) {
    userUpdate['birthDate'] = birthDate;
    userUpdate['ageVerification.estimatedAge'] = verifiedAge;
  }

  await db.collection('users').doc(userId).update(userUpdate);

  if (attemptId) {
    await updateAttemptStatus(attemptId, AgeVerificationStatus.VERIFIED, null, {
      stripeSessionId: session.id,
      verifiedAge,
    });
  }

  // Audit log
  await db.collection('auditLogs').add({
    action: 'STRIPE_IDENTITY_VERIFIED',
    userId,
    timestamp: now,
    metadata: { sessionId: session.id, verifiedAge },
  });

  logger.info('[StripeIdentity] User approved', { userId, verifiedAge });
}

/**
 * Handle verification session that requires input (failed or cancelled by user).
 */
async function handleSessionRequiresInput(
  session: Stripe.Identity.VerificationSession
): Promise<void> {
  const userId = session.metadata?.userId;
  const attemptId = session.metadata?.attemptId;

  if (!userId) {
    logger.error('[StripeIdentity] No userId in session metadata', { sessionId: session.id });
    return;
  }

  const lastError = session.last_error;
  const reason =
    lastError?.reason ||
    lastError?.code ||
    'Verification could not be completed. Please try again.';

  logger.info('[StripeIdentity] Session requires input', { sessionId: session.id, userId, reason });

  // Update attempt record
  if (attemptId) {
    await updateAttemptStatus(attemptId, AgeVerificationStatus.REJECTED, reason, {
      stripeSessionId: session.id,
      stripeErrorCode: lastError?.code,
    });
  }

  // Audit log
  await db.collection('auditLogs').add({
    action: 'STRIPE_IDENTITY_REQUIRES_INPUT',
    userId,
    timestamp: admin.firestore.Timestamp.now(),
    metadata: { sessionId: session.id, reason, stripeErrorCode: lastError?.code },
  });
}

// ============================================================================
// HELPERS
// ============================================================================

async function updateAttemptStatus(
  attemptId: string,
  status: AgeVerificationStatus,
  rejectionReason: string | null,
  extra?: Record<string, any>
): Promise<void> {
  try {
    await db.collection('ageVerifications').doc(attemptId).update({
      status,
      rejectionReason: rejectionReason || null,
      processedAt: admin.firestore.Timestamp.now(),
      ...(extra || {}),
    });
  } catch (err) {
    logger.error('[StripeIdentity] Failed to update attempt record', { attemptId, err });
  }
}
