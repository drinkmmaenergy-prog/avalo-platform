/**
 * ============================================================================
 * KYC / AGE VERIFICATION PROVIDER ABSTRACTION — B5
 * ============================================================================
 *
 * This module owns the ONLY path by which `age_verification/{uid}` records
 * are written. No other module may write this collection.
 *
 * Architecture:
 *   1. A KycProvider interface that any provider must implement.
 *   2. A runtime registry that resolves the active provider from server config.
 *   3. Fail-closed semantics: if no provider is configured or the provider
 *      call fails, all eligibility checks in ageGuard.ts will reject the user.
 *   4. Webhook handlers that call `finalizeVerification()` when a provider
 *      delivers a result asynchronously.
 *
 * Supported verification types:
 *   - SELFIE_CAPTURE            — user submits a selfie image
 *   - LIVENESS_CHALLENGE        — user performs active liveness (blink, turn)
 *   - FACE_MATCH                — selfie vs ID document face match
 *   - AGE_ESTIMATION            — model-based age estimate from selfie
 *   - ID_DOCUMENT_FALLBACK      — manual ID document review
 *   - CREATOR_KYC               — full identity verification for creator monetization
 *   - ENHANCED_KYC              — enhanced identity + source-of-funds for high tiers
 *
 * Canonical Firestore record: `age_verification/{uid}`
 * ALL fields are set server-side by this module ONLY.
 * Clients cannot write this collection (Firestore rules: write if false).
 *
 * Required fields (§5 canonical):
 *   status                  AgeVerificationStatus
 *   ageVerified             boolean
 *   verifiedAdult           boolean
 *   verificationLevel       AgeVerificationLevel
 *   livenessPassed          boolean
 *   faceMatchPassed         boolean
 *   ageEstimateConfidence   number (0–1)
 *   provider                string (provider slug)
 *   providerReference       string (provider-side session/case ID)
 *   reviewRequired          boolean
 *   reviewReason            string | null
 *   verifiedAt              Timestamp | null
 *
 * External prerequisites:
 *   - Set `KYC_PROVIDER` env var to a registered provider slug
 *   - Set provider-specific credentials (see provider implementations below)
 *   - Register webhook URL from Cloud Function `kycWebhookHandler` with provider
 *   - If KYC_PROVIDER is unset, ALL verifications fail-closed
 *
 * @module compliance/kycProviderService
 * @version 1.0.0
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError }               from 'firebase-functions/v2/https';
import { logger }                   from 'firebase-functions/v2';

// ── Canonical types (must match ageGuard.ts) ─────────────────────────────────

export type AgeVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'REQUIRES_REVIEW';
export type AgeVerificationLevel  = 'NONE' | 'SOFT' | 'DOCUMENT' | 'LIVENESS' | 'HARD';
export type KYCLevel              = 'NONE' | 'BASIC' | 'STANDARD' | 'ENHANCED';

export type VerificationType =
  | 'SELFIE_CAPTURE'
  | 'LIVENESS_CHALLENGE'
  | 'FACE_MATCH'
  | 'AGE_ESTIMATION'
  | 'ID_DOCUMENT_FALLBACK'
  | 'CREATOR_KYC'
  | 'ENHANCED_KYC';

export interface VerificationInitRequest {
  uid:              string;
  verificationType: VerificationType;
  /** Client-supplied redirect URL for document flows (optional) */
  redirectUrl?:     string;
  /** Metadata forwarded to provider (no PII) */
  metadata?:        Record<string, string>;
}

export interface VerificationInitResult {
  sessionId:   string;  // provider-side session/case ID
  sessionUrl?: string;  // URL to redirect user to (for ID document flows)
  expiresAt?:  Date;    // when the session expires
}

export interface VerificationCompletionResult {
  uid:                    string;
  provider:               string;
  providerReference:      string;
  status:                 AgeVerificationStatus;
  ageVerified:            boolean;
  verifiedAdult:          boolean;
  verificationLevel:      AgeVerificationLevel;
  livenessPassed:         boolean;
  faceMatchPassed:        boolean;
  ageEstimateConfidence:  number;  // 0–1
  kycLevel:               KYCLevel;
  reviewRequired:         boolean;
  reviewReason:           string | null;
  verifiedAt:             Date | null;
}

// ── Provider interface ────────────────────────────────────────────────────────

/**
 * Interface that every KYC/verification provider adapter must implement.
 * Providers are registered in PROVIDER_REGISTRY below.
 */
export interface KycProvider {
  /** Human-readable name for logging */
  readonly name: string;
  /** Slug used in Firestore records (e.g. 'stripe_identity', 'jumio', 'onfido') */
  readonly slug: string;

  /**
   * Returns true if this provider is configured and can accept requests.
   * If false, all initiate() calls fail-closed.
   */
  isConfigured(): boolean;

  /**
   * Begin a verification session.
   * Throws if not configured.
   */
  initiate(req: VerificationInitRequest): Promise<VerificationInitResult>;

  /**
   * Parse and validate a raw provider webhook payload.
   * Returns null if the event type is not relevant to age/KYC verification.
   */
  parseWebhook(
    rawBody: Buffer | string,
    headers: Record<string, string>,
  ): Promise<VerificationCompletionResult | null>;
}

// ── Null (fail-closed) provider ───────────────────────────────────────────────

/**
 * Used when KYC_PROVIDER is unset. Every initiate() call throws a
 * server-internal error so the caller gets a clear misconfiguration signal,
 * not a silent pass-through.
 */
class NullProvider implements KycProvider {
  readonly name = 'NullProvider (unconfigured)';
  readonly slug = 'none';

  isConfigured() { return false; }

  async initiate(_req: VerificationInitRequest): Promise<VerificationInitResult> {
    logger.error('[KYC] No KYC provider configured. Set KYC_PROVIDER env var.');
    throw new HttpsError(
      'failed-precondition',
      'KYC_PROVIDER_NOT_CONFIGURED: Age/identity verification is not available. ' +
      'Contact Avalo support.',
    );
  }

  async parseWebhook(): Promise<null> {
    logger.warn('[KYC] parseWebhook called on NullProvider — ignoring');
    return null;
  }
}

// ── Stripe Identity provider ──────────────────────────────────────────────────

/**
 * Stripe Identity adapter.
 * Environment variables required:
 *   STRIPE_SECRET_KEY          — Stripe secret key (same as payout key)
 *   STRIPE_IDENTITY_WEBHOOK_SECRET — webhook signing secret for identity events
 *
 * Webhook events consumed:
 *   identity.verification_session.verified
 *   identity.verification_session.requires_input
 *   identity.verification_session.canceled
 */
class StripeIdentityProvider implements KycProvider {
  readonly name = 'Stripe Identity';
  readonly slug = 'stripe_identity';

  isConfigured(): boolean {
    return !!(
      process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_IDENTITY_WEBHOOK_SECRET
    );
  }

  async initiate(req: VerificationInitRequest): Promise<VerificationInitResult> {
    if (!this.isConfigured()) {
      throw new HttpsError('failed-precondition',
        'STRIPE_IDENTITY_NOT_CONFIGURED: Set STRIPE_SECRET_KEY and STRIPE_IDENTITY_WEBHOOK_SECRET.');
    }

    // Dynamic import — only loads Stripe when this provider is actually used.
    // Keeps cold-start fast when a different provider is configured.
    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

    const options: Record<string, any> = {
      type: 'document',
      metadata: { uid: req.uid, ...req.metadata },
    };
    if (req.verificationType === 'LIVENESS_CHALLENGE') {
      options.type = 'id_number';  // Stripe uses id_number type for selfie+liveness
      options.options = { document: { allowed_types: ['driving_license', 'passport', 'id_card'] } };
    }
    if (req.redirectUrl) options.return_url = req.redirectUrl;

    const session = await stripe.identity.verificationSessions.create(options);

    return {
      sessionId:  session.id,
      sessionUrl: session.url ?? undefined,
      expiresAt:  session.created ? new Date((session.created + 3600) * 1000) : undefined,
    };
  }

  async parseWebhook(
    rawBody: Buffer | string,
    headers: Record<string, string>,
  ): Promise<VerificationCompletionResult | null> {
    if (!this.isConfigured()) return null;

    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });
    const sig    = headers['stripe-signature'] ?? headers['Stripe-Signature'] ?? '';

    let event: any;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody, sig, process.env.STRIPE_IDENTITY_WEBHOOK_SECRET!
      );
    } catch (err) {
      logger.error('[KYC:stripe_identity] Webhook signature verification failed', err);
      throw new HttpsError('unauthenticated', 'KYC_WEBHOOK_SIGNATURE_INVALID');
    }

    const vs = event.data?.object;
    const uid = vs?.metadata?.uid;
    if (!uid) return null;

    const relevantEvents = [
      'identity.verification_session.verified',
      'identity.verification_session.requires_input',
      'identity.verification_session.canceled',
    ];
    if (!relevantEvents.includes(event.type)) return null;

    const isVerified = event.type === 'identity.verification_session.verified';
    const checks     = vs?.last_verification_report?.document ?? {};

    return {
      uid,
      provider:              this.slug,
      providerReference:     vs?.id ?? '',
      status:                isVerified ? 'VERIFIED' : (vs?.status === 'requires_input' ? 'REQUIRES_REVIEW' : 'REJECTED'),
      ageVerified:           isVerified,
      verifiedAdult:         isVerified && (checks.dob ? isAdultDob(checks.dob) : true),
      verificationLevel:     isVerified ? 'HARD' : 'NONE',
      livenessPassed:        isVerified && (vs?.last_verification_report?.selfie?.status === 'verified'),
      faceMatchPassed:       isVerified && (vs?.last_verification_report?.selfie?.status === 'verified'),
      ageEstimateConfidence: isVerified ? 0.9 : 0.0,
      kycLevel:              isVerified ? 'STANDARD' : 'NONE',
      reviewRequired:        vs?.status === 'requires_input',
      reviewReason:          vs?.last_error?.reason ?? null,
      verifiedAt:            isVerified ? new Date() : null,
    };
  }
}

// ── Age calculation helper ────────────────────────────────────────────────────

function isAdultDob(dob: { year?: number; month?: number; day?: number }): boolean {
  if (!dob.year) return false;
  const birthDate = new Date(dob.year, (dob.month ?? 1) - 1, dob.day ?? 1);
  const today     = new Date();
  const ageMs     = today.getTime() - birthDate.getTime();
  const agYears   = ageMs / (365.25 * 24 * 60 * 60 * 1000);
  return agYears >= 18;
}

// ── Provider registry ─────────────────────────────────────────────────────────

const PROVIDER_REGISTRY: Record<string, KycProvider> = {
  stripe_identity: new StripeIdentityProvider(),
};

/**
 * Resolve the active KYC provider from the KYC_PROVIDER env var.
 * If KYC_PROVIDER is unset or names an unknown provider, returns NullProvider
 * which fails-closed on all initiate() calls.
 */
export function getKycProvider(): KycProvider {
  const slug = process.env.KYC_PROVIDER?.trim().toLowerCase();
  if (!slug) {
    logger.warn('[KYC] KYC_PROVIDER env var not set — fail-closed mode');
    return new NullProvider();
  }
  const provider = PROVIDER_REGISTRY[slug];
  if (!provider) {
    logger.error(`[KYC] Unknown KYC_PROVIDER="${slug}". Valid: ${Object.keys(PROVIDER_REGISTRY).join(', ')}`);
    return new NullProvider();
  }
  if (!provider.isConfigured()) {
    logger.error(`[KYC] Provider "${slug}" is not fully configured — missing env vars`);
    return new NullProvider();
  }
  return provider;
}

// ── Firestore writer ──────────────────────────────────────────────────────────

const AGE_VERIFICATION_COL = 'age_verification';

/**
 * Write canonical verification result to `age_verification/{uid}`.
 * Called after provider webhook confirms verification.
 * Idempotent — safe to call multiple times with the same providerReference.
 * Fails closed: if result.status !== 'VERIFIED', record is written but all guards will reject.
 */
export async function finalizeVerification(result: VerificationCompletionResult): Promise<void> {
  const db  = getFirestore();
  const ref = db.collection(AGE_VERIFICATION_COL).doc(result.uid);

  // Build the canonical record (all required fields explicitly set)
  const record = {
    uid:                    result.uid,
    status:                 result.status,
    ageVerified:            result.ageVerified,
    verifiedAdult:          result.verifiedAdult,
    verificationLevel:      result.verificationLevel,
    livenessPassed:         result.livenessPassed,
    faceMatchPassed:        result.faceMatchPassed,
    ageEstimateConfidence:  result.ageEstimateConfidence,
    provider:               result.provider,
    providerReference:      result.providerReference,
    reviewRequired:         result.reviewRequired,
    reviewReason:           result.reviewReason ?? null,
    kycLevel:               result.kycLevel,
    verifiedAt:             result.verifiedAt ? result.verifiedAt : null,
    updatedAt:              FieldValue.serverTimestamp(),
  };

  const existing = await ref.get();
  if (!existing.exists) {
    await ref.set({
      ...record,
      createdAt: FieldValue.serverTimestamp(),
    });
    logger.info(`[KYC] Verification record created for uid=${result.uid} provider=${result.provider} status=${result.status}`);
  } else {
    await ref.update({
      ...record,
    });
    logger.info(`[KYC] Verification record updated for uid=${result.uid} status=${result.status}`);
  }
}

// ── KYC session initiator ─────────────────────────────────────────────────────

/**
 * Begin a verification session via the active provider.
 * Returns provider session details (URL, ID) for the client to proceed.
 * Writes a PENDING record to `age_verification/{uid}` immediately.
 *
 * FAIL CLOSED: if no provider is configured, throws failed-precondition.
 */
export async function initiateVerification(
  req: VerificationInitRequest,
): Promise<VerificationInitResult> {
  const provider = getKycProvider();

  // Write PENDING record immediately (fail-closed: guards see PENDING and reject)
  await finalizeVerification({
    uid:                    req.uid,
    provider:               provider.slug,
    providerReference:      'pending',
    status:                 'PENDING',
    ageVerified:            false,
    verifiedAdult:          false,
    verificationLevel:      'NONE',
    livenessPassed:         false,
    faceMatchPassed:        false,
    ageEstimateConfidence:  0,
    kycLevel:               'NONE',
    reviewRequired:         false,
    reviewReason:           null,
    verifiedAt:             null,
  });

  const result = await provider.initiate(req);

  // Update with actual provider reference
  const db = getFirestore();
  await db.collection(AGE_VERIFICATION_COL).doc(req.uid).update({
    providerReference: result.sessionId,
    updatedAt:         FieldValue.serverTimestamp(),
  });

  return result;
}

// ── Webhook dispatcher ────────────────────────────────────────────────────────

/**
 * Parse and dispatch a KYC provider webhook.
 * Called from the HTTP webhook endpoint (kycWebhookHandler Cloud Function).
 *
 * Returns the parsed verification result, or null if the webhook was not
 * a verification-related event.
 *
 * ALWAYS returns 200 to the provider even on parse failures — to avoid
 * provider retry storms. Errors are logged.
 */
export async function dispatchKycWebhook(
  rawBody:  Buffer | string,
  headers:  Record<string, string>,
): Promise<{ processed: boolean; uid?: string; status?: AgeVerificationStatus }> {
  const provider = getKycProvider();

  let result: VerificationCompletionResult | null;
  try {
    result = await provider.parseWebhook(rawBody, headers);
  } catch (err) {
    logger.error('[KYC] parseWebhook threw:', err);
    return { processed: false };
  }

  if (!result) {
    return { processed: false };  // non-verification event
  }

  try {
    await finalizeVerification(result);
    logger.info(`[KYC] Webhook processed: uid=${result.uid} status=${result.status}`);
    return { processed: true, uid: result.uid, status: result.status };
  } catch (err) {
    logger.error('[KYC] finalizeVerification failed:', err);
    return { processed: false };
  }
}
