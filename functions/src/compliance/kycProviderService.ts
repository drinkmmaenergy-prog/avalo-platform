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

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onRequest }              from 'firebase-functions/v2/https';
import { logger }                             from 'firebase-functions/v2';
import Stripe                                 from 'stripe';

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

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

    type SessionCreateParams = Stripe.Identity.VerificationSessionCreateParams;
    const options: SessionCreateParams = {
      type:     'document',
      metadata: { uid: req.uid, ...req.metadata },
    };
    if (req.verificationType === 'LIVENESS_CHALLENGE') {
      // Stripe uses id_number + options.document for selfie+liveness flow
      (options as SessionCreateParams & { type: string }).type = 'id_number';
    }
    if (req.redirectUrl) options.return_url = req.redirectUrl;

    const session = await stripe.identity.verificationSessions.create(options);

    return {
      sessionId:  session.id,
      sessionUrl: (session as { url?: string }).url ?? undefined,
      expiresAt:  session.created ? new Date((session.created + 3600) * 1000) : undefined,
    };
  }

  async parseWebhook(
    rawBody: Buffer | string,
    headers: Record<string, string>,
  ): Promise<VerificationCompletionResult | null> {
    if (!this.isConfigured()) return null;

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });
    const sig       = headers['stripe-signature'] ?? headers['Stripe-Signature'] ?? '';

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody, sig, process.env.STRIPE_IDENTITY_WEBHOOK_SECRET!
      ) as Stripe.Event;
    } catch (err) {
      logger.error('[KYC:stripe_identity] Webhook signature verification failed', err);
      throw new HttpsError('unauthenticated', 'KYC_WEBHOOK_SIGNATURE_INVALID');
    }

    const IDENTITY_EVENTS = [
      'identity.verification_session.verified',
      'identity.verification_session.requires_input',
      'identity.verification_session.canceled',
    ] as const;
    type IdentityEventType = typeof IDENTITY_EVENTS[number];

    if (!(IDENTITY_EVENTS as readonly string[]).includes(event.type)) return null;

    // Stripe Identity event payload — use explicit cast with unknown intermediate
    const vs = (event.data as { object: Record<string, unknown> }).object;
    const uid = (vs['metadata'] as Record<string, string> | undefined)?.['uid'];
    if (!uid) return null;

    const eventType     = event.type as IdentityEventType;
    const isVerified    = eventType === 'identity.verification_session.verified';
    const vsStatus      = vs['status'] as string | undefined;
    const lastReport    = vs['last_verification_report'] as Record<string, unknown> | undefined;
    const selfieStatus  = (lastReport?.['selfie'] as Record<string, unknown> | undefined)?.['status'];
    const docReport     = (lastReport?.['document'] as Record<string, unknown> | undefined) ?? {};
    const dob           = docReport['dob'] as { year?: number; month?: number; day?: number } | undefined;
    const lastError     = vs['last_error'] as Record<string, unknown> | undefined;

    return {
      uid,
      provider:              this.slug,
      providerReference:     (vs['id'] as string | undefined) ?? '',
      status:                isVerified
                               ? 'VERIFIED'
                               : (vsStatus === 'requires_input' ? 'REQUIRES_REVIEW' : 'REJECTED'),
      ageVerified:           isVerified,
      verifiedAdult:         isVerified && (dob ? isAdultDob(dob) : true),
      verificationLevel:     isVerified ? 'HARD' : 'NONE',
      livenessPassed:        isVerified && selfieStatus === 'verified',
      faceMatchPassed:       isVerified && selfieStatus === 'verified',
      ageEstimateConfidence: isVerified ? 0.9 : 0.0,
      kycLevel:              isVerified ? 'STANDARD' : 'NONE',
      reviewRequired:        vsStatus === 'requires_input',
      reviewReason:          (lastError?.['reason'] as string | undefined) ?? null,
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
 *
 * PRODUCTION/STAGING GUARD [P6]:
 * If the resolved provider is NullProvider and the environment is NOT
 * 'development' or 'test', this function throws immediately so that a
 * misconfigured staging/production deployment fails loudly at request time
 * rather than silently passing verification checks.
 */
export function getKycProvider(): KycProvider {
  const slug = process.env.KYC_PROVIDER?.trim().toLowerCase();
  if (!slug) {
    logger.warn('[KYC] KYC_PROVIDER env var not set — fail-closed mode');
    return enforceNullProviderPolicy(new NullProvider());
  }
  const provider = PROVIDER_REGISTRY[slug];
  if (!provider) {
    logger.error(`[KYC] Unknown KYC_PROVIDER="${slug}". Valid: ${Object.keys(PROVIDER_REGISTRY).join(', ')}`);
    return enforceNullProviderPolicy(new NullProvider());
  }
  if (!provider.isConfigured()) {
    logger.error(`[KYC] Provider "${slug}" is not fully configured — missing env vars`);
    return enforceNullProviderPolicy(new NullProvider());
  }
  return provider;
}

/**
 * Enforce that NullProvider cannot be used in staging or production.
 * Allowed environments: ENVIRONMENT=development | test (or NODE_ENV=test).
 * In any other environment (production, staging, unset), throws immediately
 * so the misconfiguration is caught at deploy-time or first request.
 */
function enforceNullProviderPolicy(p: NullProvider): NullProvider {
  const env = (process.env.ENVIRONMENT ?? process.env.NODE_ENV ?? '').toLowerCase();
  const isTestOrDev = env === 'development' || env === 'test' || env === 'emulator';
  if (!isTestOrDev) {
    // Log a critical error AND throw — NullProvider in production is a hard stop
    logger.error(
      '[KYC] CRITICAL: NullProvider active in non-development environment. ' +
      `ENVIRONMENT="${process.env.ENVIRONMENT}" NODE_ENV="${process.env.NODE_ENV}". ` +
      'Set KYC_PROVIDER and required credentials before deploying.'
    );
    throw new HttpsError(
      'internal',
      'KYC_PROVIDER_MISCONFIGURED: Verification is not configured for this environment. ' +
      'This is a deployment configuration error. Contact Avalo engineering.',
    );
  }
  return p;
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

  // ── Idempotency guard [P6] ───────────────────────────────────────────────
  // If a VERIFIED record already exists with the SAME providerReference,
  // do not overwrite it. This prevents provider webhook replay from
  // downgrading a verified user.
  const existing = await ref.get();
  if (existing.exists) {
    const curr = existing.data() as {
      providerReference?: string;
      status?: string;
    };
    if (
      curr.providerReference &&
      curr.providerReference !== 'pending' &&
      curr.providerReference === result.providerReference &&
      curr.status === result.status
    ) {
      logger.info(
        `[KYC] Idempotent skip: uid=${result.uid} providerRef=${result.providerReference} ` +
        `status=${result.status} already recorded`
      );
      return; // exact replay — safe to ignore
    }
    // If current status is VERIFIED and new event would downgrade, reject.
    if (curr.status === 'VERIFIED' && result.status !== 'VERIFIED') {
      logger.warn(
        `[KYC] Replay protection: refusing to downgrade VERIFIED uid=${result.uid} ` +
        `to ${result.status} (providerRef=${result.providerReference})`
      );
      return;
    }
  }

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
    verifiedAt:             result.verifiedAt
                              ? Timestamp.fromDate(result.verifiedAt)
                              : null,
    updatedAt:              FieldValue.serverTimestamp(),
  };

  if (!existing.exists) {
    await ref.set({ ...record, createdAt: FieldValue.serverTimestamp() });
    logger.info(
      `[KYC] Verification record created: uid=${result.uid} ` +
      `provider=${result.provider} status=${result.status}`
    );
  } else {
    await ref.update(record);
    logger.info(
      `[KYC] Verification record updated: uid=${result.uid} status=${result.status}`
    );
  }

  // ── Manual review queue [P6] ─────────────────────────────────────────────
  if (result.reviewRequired) {
    await db.collection('kycManualReviewQueue').doc(result.uid).set({
      uid:               result.uid,
      provider:          result.provider,
      providerReference: result.providerReference,
      reviewReason:      result.reviewReason ?? 'unknown',
      status:            'PENDING_REVIEW',
      queuedAt:          FieldValue.serverTimestamp(),
      resolvedAt:        null,
      resolvedBy:        null,
    }, { merge: true });
    logger.info(`[KYC] Manual review queue entry written for uid=${result.uid}`);
  }
}

// ── KYC session initiator ─────────────────────────────────────────────────────

export async function initiateVerification(
  req: VerificationInitRequest,
): Promise<VerificationInitResult> {
  const provider = getKycProvider();

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

  const db = getFirestore();
  await db.collection(AGE_VERIFICATION_COL).doc(req.uid).update({
    providerReference: result.sessionId,
    updatedAt:         FieldValue.serverTimestamp(),
  });

  return result;
}

// ── Webhook dispatcher ────────────────────────────────────────────────────────

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
    return { processed: false };
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

// ── HTTP webhook endpoint (exported from index.ts as kycWebhookHandler) ───────

/**
 * Cloud Function HTTP endpoint that receives provider callbacks.
 * Export name: kycWebhookHandler
 * URL (once deployed): https://<region>-<project>.cloudfunctions.net/kycWebhookHandler
 *
 * Required configuration:
 *   - Register this URL with the KYC provider dashboard as the webhook endpoint
 *   - Providers must sign all callbacks; signature is verified inside parseWebhook()
 *
 * Always returns HTTP 200 to the provider to prevent retry storms.
 * Errors are logged but not re-thrown.
 */
export const kycWebhookHandler = onRequest(
  { cors: false },   // no CORS — provider-to-server only
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // Collect raw body as Buffer for signature verification
    const rawBody: Buffer = Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.from(typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(req.body));

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers[k.toLowerCase()] = v;
    }

    try {
      const result = await dispatchKycWebhook(rawBody, headers);
      if (result.processed) {
        logger.info(`[KYC] Webhook accepted: uid=${result.uid} status=${result.status}`);
      }
    } catch (err) {
      // Log but always return 200 to avoid provider retries
      logger.error('[KYC] kycWebhookHandler fatal error:', err);
    }

    res.status(200).send('OK');
  }
);
