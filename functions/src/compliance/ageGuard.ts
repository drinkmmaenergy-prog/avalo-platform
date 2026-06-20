/**
 * AVALO — C2: Global Verified-Adult Server Guard
 *
 * requireVerifiedAdult(uid) must be called at the top of every deployed
 * Cloud Function that touches billing, chat, discovery, rooms, calls,
 * media, subscriptions, tips, creator monetization, or payout setup.
 *
 * Canonical age record: age_verification/{uid}
 *   - Written only by compliancePack55.ageSoftVerify (soft DOB declaration)
 *     and by Stripe Identity / liveness webhooks (hard verification).
 *   - Clients may NOT write this collection (Firestore rules: write: if false).
 *
 * Minimum required for restricted actions:
 *   status == 'VERIFIED' && ageVerified == true && verifiedAdult == true
 *
 * For payout and high-multiplier tiers (x50/x70/x100), call
 *   requireCreatorKYC(uid) instead — it calls requireVerifiedAdult internally
 *   and additionally checks kycLevel.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

// ─────────────────────────────────────────────────────────────────────────────
// Types (mirrors compliancePack55 AgeVerification interface)
// ─────────────────────────────────────────────────────────────────────────────

export type AgeVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'REQUIRES_REVIEW';
export type AgeVerificationLevel  = 'NONE' | 'SOFT' | 'DOCUMENT' | 'LIVENESS' | 'HARD';
export type KYCLevel              = 'NONE' | 'BASIC' | 'STANDARD' | 'ENHANCED';

export interface AgeVerificationRecord {
  uid:                     string;
  status:                  AgeVerificationStatus;
  ageVerified:             boolean;
  verifiedAdult:           boolean;
  verificationLevel:       AgeVerificationLevel;
  livenessPassed?:         boolean;
  faceMatchPassed?:        boolean;
  ageEstimateConfidence?:  number;
  provider?:               string;
  providerReference?:      string;
  reviewRequired?:         boolean;
  reviewReason?:           string;
  kycLevel?:               KYCLevel;
  stripeConnectAccountId?: string;
  stripeOnboardingComplete?: boolean;
  verifiedAt?:             FirebaseFirestore.Timestamp;
  createdAt:               FirebaseFirestore.Timestamp;
  updatedAt:               FirebaseFirestore.Timestamp;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core guard — throws HttpsError if not verified adult
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads age_verification/{uid} and throws if the user is not a verified adult.
 * Safe default: a missing or incomplete record is treated as NOT verified.
 *
 * @throws HttpsError('permission-denied', 'AGE_VERIFICATION_REQUIRED')
 */
export async function requireVerifiedAdult(uid: string): Promise<AgeVerificationRecord> {
  const db = getFirestore();
  const snap = await db.collection('age_verification').doc(uid).get();

  if (!snap.exists) {
    throw new HttpsError(
      'permission-denied',
      'AGE_VERIFICATION_REQUIRED: Complete age verification before accessing this feature.'
    );
  }

  const record = snap.data() as AgeVerificationRecord;

  const isVerified = (
    record.status        === 'VERIFIED' &&
    record.ageVerified   === true       &&
    record.verifiedAdult === true
  );

  if (!isVerified) {
    throw new HttpsError(
      'permission-denied',
      `AGE_VERIFICATION_REQUIRED: Age verification status is '${record.status}'. ` +
      'Complete verification before accessing this feature.'
    );
  }

  return record;
}

// ─────────────────────────────────────────────────────────────────────────────
// Creator KYC guard (superset of age guard)
// Required for: creator monetization, multiplier tier access, payout setup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Requires verified adult + at minimum BASIC KYC.
 * Used for all creator monetization entry points.
 */
export async function requireCreatorKYC(uid: string): Promise<AgeVerificationRecord> {
  const record = await requireVerifiedAdult(uid);

  const kycLevel = record.kycLevel ?? 'NONE';
  const acceptableLevels: KYCLevel[] = ['BASIC', 'STANDARD', 'ENHANCED'];

  if (!acceptableLevels.includes(kycLevel)) {
    throw new HttpsError(
      'permission-denied',
      'CREATOR_KYC_REQUIRED: Complete creator identity verification to enable monetization.'
    );
  }

  return record;
}

/**
 * Requires verified adult + ENHANCED KYC.
 * Required for: x50/x70/x100 multiplier tiers, payout activation.
 */
export async function requireEnhancedKYC(uid: string): Promise<AgeVerificationRecord> {
  const record = await requireVerifiedAdult(uid);

  if (record.kycLevel !== 'ENHANCED') {
    throw new HttpsError(
      'permission-denied',
      'ENHANCED_KYC_REQUIRED: Enhanced identity verification is required for this tier or feature.'
    );
  }

  return record;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payout readiness guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Requires verified adult + ENHANCED KYC + Stripe Connect onboarding complete.
 * Called by all payout initiation entry points.
 */
export async function requirePayoutReadiness(uid: string): Promise<AgeVerificationRecord> {
  const record = await requireEnhancedKYC(uid);

  if (!record.stripeConnectAccountId || !record.stripeOnboardingComplete) {
    throw new HttpsError(
      'failed-precondition',
      'PAYOUT_NOT_READY: Complete Stripe Connect onboarding before requesting a payout.'
    );
  }

  return record;
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch check (for room join, multi-participant billing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifies multiple UIDs are all verified adults. Useful for room systems.
 * Throws on the first failure found; does not reveal which other UIDs were checked.
 */
export async function requireAllVerifiedAdults(uids: string[]): Promise<void> {
  const db = getFirestore();
  const snaps = await Promise.all(
    uids.map(uid => db.collection('age_verification').doc(uid).get())
  );

  for (let i = 0; i < uids.length; i++) {
    const snap = snaps[i];
    if (!snap.exists) {
      throw new HttpsError('permission-denied', 'AGE_VERIFICATION_REQUIRED');
    }
    const record = snap.data() as AgeVerificationRecord;
    if (!record.ageVerified || !record.verifiedAdult || record.status !== 'VERIFIED') {
      throw new HttpsError('permission-denied', 'AGE_VERIFICATION_REQUIRED');
    }
  }
}
