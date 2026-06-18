import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 388 — Age Verification & Minor Protection Core
 * 
 * Implements mandatory 18+ verification with:
 * - AI selfie analysis
 * - Document verification fallback
 * - Nationality-based age thresholds
 * - Multi-attempt fraud logging
 * - Instant account freeze on minor detection
 * 
 * Dependencies: PACK 302 (Fraud), PACK 300 (Safety), PACK 296 (Audit)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { HttpsError, Timestamp, auth, onCall } from './runtime';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

const db = admin.firestore();

/**
 * Age verification status
 */
export enum AgeVerificationStatus {
  UNVERIFIED = 'UNVERIFIED',
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  FLAGGED = 'FLAGGED', // Suspected minor
  LOCKED = 'LOCKED' // Account frozen
}

/**
 * Verification methods
 */
export enum VerificationMethod {
  AI_SELFIE = 'AI_SELFIE',
  ID_DOCUMENT = 'ID_DOCUMENT',
  PASSPORT = 'PASSPORT',
  DRIVERS_LICENSE = 'DRIVERS_LICENSE',
  NATIONAL_ID = 'NATIONAL_ID',
  MANUAL_REVIEW = 'MANUAL_REVIEW'
}

interface AgeVerificationAttempt {
  id: string;
  userId: string;
  method: VerificationMethod;
  status: AgeVerificationStatus;
  attemptNumber: number;
  createdAt: FirebaseFirestore.Timestamp;
  processedAt?: FirebaseFirestore.Timestamp;
  estimatedAge?: number;
  documentType?: string;
  documentCountry?: string;
  documentNumber?: string; // Hashed
  confidence?: number; // 0-100
  rejectionReason?: string;
  fraudSignals?: {
    fakeSelfie: boolean;
    alteredDocument: boolean;
    stolenIdentity: boolean;
    ageManipulation: boolean;
    multipleAccounts: boolean;
  };
  reviewerId?: string;
  metadata: {
    ipAddress?: string;
    deviceId?: string;
    geolocation?: string;
  };
}

interface MinorDetectionAlert {
  id: string;
  userId: string;
  detectedAge: number;
  detectionMethod: VerificationMethod;
  confidence: number;
  actionsTaken: string[];
  createdAt: FirebaseFirestore.Timestamp;
  safetyEscalated: boolean;
  legalHoldFlag: boolean;
}

/**
 * Age requirements by jurisdiction
 */
const AGE_REQUIREMENTS: Record<string, number> = {
  US: 18,
  GB: 18,
  EU: 18,
  DE: 18,
  FR: 18,
  ES: 18,
  IT: 18,
  JP: 18,
  KR: 19,
  CN: 18,
  default: 18
};

/**
 * Get minimum age for jurisdiction
 */
function getMinimumAge(countryCode: string): number {
  return AGE_REQUIREMENTS[countryCode] || AGE_REQUIREMENTS.default;
}

/**
 * Verify age with strict enforcement
 */
export const pack388_verifyAgeStrict = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = request.auth.uid;
  const { method, documentData, selfieData, countryCode } = data;

  try {
    // Check existing verification status
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (userData?.ageVerificationStatus === AgeVerificationStatus.LOCKED) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Account locked due to minor detection or verification fraud.'
      );
    }

    // Get attempt count
    const attempts = await db.collection('ageVerifications')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

    const attemptNumber = attempts.size + 1;

    // Maximum 3 attempts before manual review required
    if (attemptNumber > 3 && method !== VerificationMethod.MANUAL_REVIEW) {
      throw new functions.https.HttpsError(
        'resource-exhausted',
        'Maximum verification attempts exceeded. Manual review required.'
      );
    }

    // Create verification attempt
    const attemptRef = db.collection('ageVerifications').doc();
    const attempt: AgeVerificationAttempt = {
      id: attemptRef.id,
      userId,
      method,
      status: AgeVerificationStatus.PENDING,
      attemptNumber,
      createdAt: admin.firestore.Timestamp.now(),
      documentCountry: countryCode,
      metadata: {
        ipAddress: request.rawRequest?.ip,
        deviceId: data.deviceId,
        geolocation: data.geolocation
      }
    };

    await attemptRef.set(attempt);

    // All verification methods route through Stripe Identity.
    // This is an async two-step flow:
    //   Step 1 (this function): create Stripe Identity session, return clientSecret to client.
    //   Step 2 (pack388_stripeIdentityWebhook): receive Stripe callback, finalize user state.
    if (![
      VerificationMethod.AI_SELFIE,
      VerificationMethod.ID_DOCUMENT,
      VerificationMethod.PASSPORT,
      VerificationMethod.DRIVERS_LICENSE,
      VerificationMethod.NATIONAL_ID,
    ].includes(method)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid verification method');
    }

    const identitySession = await stripe.identity.verificationSessions.create({
      type: 'document',
      options: {
        document: {
          allowed_types: ['id_card', 'passport', 'driving_license'],
          require_id_number: false,
          require_live_capture: true,
          require_matching_selfie: true,
        },
      },
      metadata: {
        userId,
        attemptId: attemptRef.id,
        method,
        countryCode: countryCode || '',
      },
    });

    // Update attempt record with the pending session reference
    await attemptRef.update({
      status: AgeVerificationStatus.PENDING,
      stripeIdentitySessionId: identitySession.id,
    });

    // Return the clientSecret so the mobile/web client can complete verification
    // via the Stripe Identity SDK (stripe.verifyIdentity(clientSecret))
    return {
      success: true,
      verified: false,
      pending: true,
      verificationSessionId: identitySession.id,
      clientSecret: identitySession.client_secret,
      attemptId: attemptRef.id,
      message: 'Identity verification session created. Please complete verification.',
    };

  } catch (error) {
    console.error('Error verifying age:', error);
    throw error;
  }
});

// processAISelfieVerification and processDocumentVerification are removed.
// Verification is now handled by Stripe Identity (pack388_stripeIdentityWebhook).
// The session creation above replaces both stub functions.

/**
 * Minor detection lockdown
 */
export const pack388_minorDetectionLock = async (data: {
  userId: string;
  detectedAge: number;
  method: VerificationMethod;
  confidence: number;
}) => {
  const { userId, detectedAge, method, confidence } = data;

  try {
    console.log(`🚨 MINOR DETECTED: User ${userId}, Age ${detectedAge}`);

    // Create minor detection alert
    const alertRef = db.collection('minorDetectionAlerts').doc();
    const alert: MinorDetectionAlert = {
      id: alertRef.id,
      userId,
      detectedAge,
      detectionMethod: method,
      confidence,
      actionsTaken: [],
      createdAt: admin.firestore.Timestamp.now(),
      safetyEscalated: false,
      legalHoldFlag: false
    };

    // 1. INSTANT ACCOUNT FREEZE
    await admin.auth().updateUser(userId, { disabled: true });
    alert.actionsTaken.push('ACCOUNT_DISABLED');

    // 2. Update user document
    await db.collection('users').doc(userId).update({
      ageVerificationStatus: AgeVerificationStatus.LOCKED,
      accountLocked: true,
      lockReason: 'MINOR_DETECTED',
      lockedAt: admin.firestore.Timestamp.now()
    });
    alert.actionsTaken.push('USER_DOCUMENT_LOCKED');

    // 3. Freeze wallet
    await db.collection('wallets').doc(userId).update({
      frozen: true,
      frozenReason: 'MINOR_DETECTED',
      frozenAt: admin.firestore.Timestamp.now()
    });
    alert.actionsTaken.push('WALLET_FROZEN');

    // 4. Safety escalation
    await db.collection('safetyIncidents').add({
      type: 'MINOR_DETECTED',
      userId,
      severity: 'CRITICAL',
      status: 'OPEN',
      detectedAge,
      confidence,
      createdAt: admin.firestore.Timestamp.now(),
      assignedTo: 'SAFETY_TEAM'
    });
    alert.safetyEscalated = true;
    alert.actionsTaken.push('SAFETY_ESCALATED');

    // 5. Legal hold flag
    await db.collection('legalHolds').add({
      userId,
      reason: 'MINOR_DETECTED',
      retainAllData: true,
      createdAt: admin.firestore.Timestamp.now(),
      active: true
    });
    alert.legalHoldFlag = true;
    alert.actionsTaken.push('LEGAL_HOLD_APPLIED');

    // 6. Fraud logging (PACK 302)
    await db.collection('fraudSignals').add({
      userId,
      type: 'MINOR_ATTEMPT',
      severity: 'CRITICAL',
      detectedAge,
      confidence,
      method,
      createdAt: admin.firestore.Timestamp.now(),
      status: 'CONFIRMED'
    });
    alert.actionsTaken.push('FRAUD_LOGGED');

    // 7. Disable all active sessions
    await db.collection('sessions')
      .where('userId', '==', userId)
      .get()
      .then(snapshot => {
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
          batch.update(doc.ref, { 
            active: false, 
            terminatedReason: 'MINOR_DETECTED' 
          });
        });
        return batch.commit();
      });
    alert.actionsTaken.push('SESSIONS_TERMINATED');

    // Save alert
    await alertRef.set(alert);

    // Send alert to admin dashboard
    await db.collection('adminNotifications').add({
      type: 'MINOR_DETECTION_ALERT',
      priority: 'CRITICAL',
      userId,
      detectedAge,
      confidence,
      alertId: alertRef.id,
      createdAt: admin.firestore.Timestamp.now(),
      read: false
    });

    console.log(`✅ Minor detection lockdown complete for user ${userId}`);

    return {
      success: true,
      alertId: alertRef.id,
      actionsTaken: alert.actionsTaken
    };

  } catch (error) {
    console.error('Error executing minor detection lock:', error);
    throw error;
  }
};

/**
 * Manual review for age verification
 */
export const pack388_manualAgeReview = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin must be authenticated');
  }

  // Check admin permissions
  const adminDoc = await db.collection('admins').doc(request.auth.uid).get();
  if (!adminDoc.exists || !adminDoc.data()?.permissions?.includes('AGE_VERIFICATION_REVIEW')) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
  }

  const { attemptId, approved, estimatedAge, notes } = data;

  try {
    const attemptRef = db.collection('ageVerifications').doc(attemptId);
    const attemptDoc = await attemptRef.get();

    if (!attemptDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Verification attempt not found');
    }

    const attempt = attemptDoc.data() as AgeVerificationAttempt;

    if (approved) {
      // Approve verification
      await attemptRef.update({
        status: AgeVerificationStatus.VERIFIED,
        estimatedAge,
        reviewerId: request.auth.uid,
        reviewNotes: notes,
        processedAt: admin.firestore.Timestamp.now()
      });

      await db.collection('users').doc(attempt.userId).update({
        ageVerified: true,
        ageVerificationStatus: AgeVerificationStatus.VERIFIED,
        ageVerificationMethod: VerificationMethod.MANUAL_REVIEW,
        ageVerifiedAt: admin.firestore.Timestamp.now(),
        estimatedAge
      });

      // Notify user
      await db.collection('notifications').add({
        userId: attempt.userId,
        type: 'AGE_VERIFICATION_APPROVED',
        title: 'Age Verification Approved',
        message: 'Your age verification has been approved. You now have full access to the platform.',
        createdAt: admin.firestore.Timestamp.now(),
        read: false
      });

    } else {
      // Reject verification
      await attemptRef.update({
        status: AgeVerificationStatus.REJECTED,
        reviewerId: request.auth.uid,
        reviewNotes: notes,
        rejectionReason: notes,
        processedAt: admin.firestore.Timestamp.now()
      });

      // Check if minor detected
      if (estimatedAge < 18) {
        await pack388_minorDetectionLock({
          userId: attempt.userId,
          detectedAge: estimatedAge,
          method: VerificationMethod.MANUAL_REVIEW,
          confidence: 100
        });
      }
    }

    return {
      success: true,
      attemptId,
      approved,
      message: approved ? 'Verification approved' : 'Verification rejected'
    };

  } catch (error) {
    console.error('Error in manual age review:', error);
    throw error;
  }
});

/**
 * Get user verification status
 */
export const pack388_getVerificationStatus = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = request.auth.uid;

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    const attempts = await db.collection('ageVerifications')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();

    return {
      verified: userData?.ageVerified || false,
      status: userData?.ageVerificationStatus || AgeVerificationStatus.UNVERIFIED,
      method: userData?.ageVerificationMethod,
      verifiedAt: userData?.ageVerifiedAt,
      totalAttempts: attempts.size,
      attemptsRemaining: Math.max(0, 3 - attempts.size),
      recentAttempts: attempts.docs.map(doc => ({
        id: doc.id,
        method: doc.data().method,
        status: doc.data().status,
        createdAt: doc.data().createdAt,
        rejectionReason: doc.data().rejectionReason
      }))
    };

  } catch (error) {
    console.error('Error getting verification status:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get verification status');
  }
});

























