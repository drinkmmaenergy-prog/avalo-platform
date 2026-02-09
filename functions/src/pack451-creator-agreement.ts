/**
 * ========================================================================
 * PACK 451 — B2B CREATOR AGREEMENT SYSTEM
 * ========================================================================
 *
 * PHASE 4.2 — Legally explicit B2B Creator Agreement flow
 *
 * PURPOSE:
 * - Creators are explicitly classified as independent B2B contractors
 * - Acceptance is explicit, versioned, auditable, enforced server-side
 * - No creator monetization is possible without accepted B2B agreement
 *
 * COLLECTION: creatorAgreements/{userId}
 *
 * ⚠️ NO BUSINESS LOGIC CHANGES:
 * - NO token pricing changes
 * - NO revenue split changes (65/35)
 * - NO payout logic changes
 * - NO wallet logic changes
 * - NO treasury logic changes
 *
 * @version 1.0.0
 * @module pack451-creator-agreement
 */

import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { db } from './init';

// ============================================================================
// CONSTANTS (CANONICAL - DO NOT MODIFY)
// ============================================================================

/**
 * Current version of the Creator Agreement (B2B)
 * Increment this when agreement terms change to require re-acceptance
 */
export const CREATOR_AGREEMENT_CURRENT_VERSION = 'v1.0';

/**
 * Collection name for creator agreements
 */
export const CREATOR_AGREEMENTS_COLLECTION = 'creatorAgreements';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Surface type indicating where the agreement was accepted
 */
export type AgreementSurface = 'app' | 'web';

/**
 * Creator Agreement Document stored in Firestore
 * Collection: creatorAgreements/{userId}
 */
export interface CreatorAgreementDocument {
  userId: string;
  version: string;
  acceptedAt: Timestamp;
  ipAddress: string | null;
  userAgent: string | null;
  surface: AgreementSurface;
}

/**
 * Response from acceptCreatorAgreementV1
 */
export interface AcceptCreatorAgreementResponse {
  success: boolean;
  status: 'accepted' | 'already_accepted';
  version: string;
  acceptedAt: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a user has accepted the current version of the Creator Agreement
 *
 * @param userId - The user ID to check
 * @returns Promise<{ accepted: boolean, version: string | null }>
 */
export async function checkCreatorAgreementStatus(userId: string): Promise<{
  accepted: boolean;
  version: string | null;
  acceptedAt: Timestamp | null;
}> {
  const agreementRef = db.collection(CREATOR_AGREEMENTS_COLLECTION).doc(userId);
  const agreementDoc = await agreementRef.get();

  if (!agreementDoc.exists) {
    return { accepted: false, version: null, acceptedAt: null };
  }

  const data = agreementDoc.data() as CreatorAgreementDocument;

  // Check if the version matches the current required version
  const isCurrentVersion = data.version === CREATOR_AGREEMENT_CURRENT_VERSION;

  return {
    accepted: isCurrentVersion,
    version: data.version,
    acceptedAt: data.acceptedAt,
  };
}

/**
 * Enforce that the user has accepted the current Creator Agreement
 * 
 * THROWS: HttpsError('failed-precondition', 'CREATOR_AGREEMENT_REQUIRED')
 * 
 * Use this function at the START of any creator monetization endpoint:
 * - getCreatorDashboard
 * - requestPayout
 * - setupPayoutAccount
 * - enableCreatorMode
 * - Any function exposing creator earnings
 *
 * @param userId - The user ID to enforce agreement for
 * @throws HttpsError if agreement not accepted
 */
export async function enforceCreatorAgreement(userId: string): Promise<void> {
  const status = await checkCreatorAgreementStatus(userId);

  if (!status.accepted) {
    logger.warn(`Creator agreement enforcement failed for user ${userId}`, {
      userId,
      currentVersion: CREATOR_AGREEMENT_CURRENT_VERSION,
      userVersion: status.version,
    });

    throw new HttpsError(
      'failed-precondition',
      'CREATOR_AGREEMENT_REQUIRED'
    );
  }

  logger.debug(`Creator agreement verified for user ${userId}`, {
    version: status.version,
  });
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * Accept Creator Agreement (B2B) - v1
 *
 * Canonical callable function for accepting the Creator Agreement.
 *
 * BEHAVIOR:
 * - Requires authenticated user
 * - Writes to creatorAgreements/{userId}
 * - Overwrites only if version < CURRENT_VERSION
 * - Stores: version, timestamp, ip, userAgent, surface
 *
 * IDEMPOTENCY:
 * - If already accepted current version → returns { status: "already_accepted" }
 *
 * @param data.surface - 'app' | 'web' - where the agreement was accepted
 */
export const acceptCreatorAgreementV1 = onCall(
  {
    region: 'europe-west1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request): Promise<AcceptCreatorAgreementResponse> => {
    // Require authentication
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Validate surface parameter
    const { surface } = request.data as { surface?: AgreementSurface };
    if (!surface || !['app', 'web'].includes(surface)) {
      throw new HttpsError(
        'invalid-argument',
        'Surface must be "app" or "web"'
      );
    }

    // Extract IP and User-Agent from request (if available)
    const ipAddress = request.rawRequest?.ip || null;
    const userAgent = request.rawRequest?.headers?.['user-agent'] || null;

    // Check current agreement status
    const currentStatus = await checkCreatorAgreementStatus(uid);

    // If already accepted current version, return early (idempotent)
    if (currentStatus.accepted) {
      logger.info(`User ${uid} already accepted Creator Agreement ${CREATOR_AGREEMENT_CURRENT_VERSION}`);
      return {
        success: true,
        status: 'already_accepted',
        version: CREATOR_AGREEMENT_CURRENT_VERSION,
        acceptedAt: currentStatus.acceptedAt?.toDate().toISOString() || new Date().toISOString(),
      };
    }

    // Prepare agreement document
    const agreementDoc: CreatorAgreementDocument = {
      userId: uid,
      version: CREATOR_AGREEMENT_CURRENT_VERSION,
      acceptedAt: Timestamp.now(),
      ipAddress: typeof ipAddress === 'string' ? ipAddress : null,
      userAgent: typeof userAgent === 'string' ? userAgent : null,
      surface,
    };

    // Write to Firestore (set with merge to handle version upgrades)
    const agreementRef = db.collection(CREATOR_AGREEMENTS_COLLECTION).doc(uid);
    await agreementRef.set(agreementDoc);

    logger.info(`User ${uid} accepted Creator Agreement ${CREATOR_AGREEMENT_CURRENT_VERSION}`, {
      userId: uid,
      version: CREATOR_AGREEMENT_CURRENT_VERSION,
      surface,
      previousVersion: currentStatus.version,
    });

    return {
      success: true,
      status: 'accepted',
      version: CREATOR_AGREEMENT_CURRENT_VERSION,
      acceptedAt: agreementDoc.acceptedAt.toDate().toISOString(),
    };
  }
);

/**
 * Get Creator Agreement Status - v1
 *
 * Check if the current user has accepted the Creator Agreement.
 * Used by clients to determine if the agreement modal should be shown.
 */
export const getCreatorAgreementStatusV1 = onCall(
  {
    region: 'europe-west1',
    memory: '128MiB',
    timeoutSeconds: 10,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const status = await checkCreatorAgreementStatus(uid);

    return {
      success: true,
      accepted: status.accepted,
      currentVersion: CREATOR_AGREEMENT_CURRENT_VERSION,
      userVersion: status.version,
      acceptedAt: status.acceptedAt?.toDate().toISOString() || null,
    };
  }
);

// ============================================================================
// EXPORTS
// ============================================================================

export {
  acceptCreatorAgreementV1 as default,
  checkCreatorAgreementStatus as checkCreatorAgreement,
};
