/**
 * PACK 328A: Identity Verification Cloud Functions
 * Bank-ID & Document Fallback Verification (18+ Enforcement Layer)
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  VerificationEngine,
  VerificationFraudIntegration,
} from './pack328a-verification-engine';
import {
  IdentityVerificationRequest,
  IdentityVerificationResult,
  VerificationReason,
  DocumentType,
  VERIFICATION_CONFIG,
} from './pack328a-identity-verification-types';

// ============================================================================
// Callable Functions (User-facing)
// ============================================================================

/**
 * Get current verification status for the authenticated user
 */
export const identityVerification_getStatus = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = context.auth.uid;

    try {
      // Get pending requests
      const pendingSnapshot = await db
        .collection('identityVerificationRequests')
        .where('userId', '==', userId)
        .where('status', '==', 'PENDING')
        .orderBy('requestedAt', 'desc')
        .limit(1)
        .get();

      const pendingRequest = pendingSnapshot.empty
        ? null
        : ({
            id: pendingSnapshot.docs[0].id,
            ...pendingSnapshot.docs[0].data(),
          } as IdentityVerificationRequest & { id: string });

      // Get latest result
      const resultsSnapshot = await db
        .collection('identityVerificationResults')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      const latestResult = resultsSnapshot.empty
        ? null
        : ({
            id: resultsSnapshot.docs[0].id,
            ...resultsSnapshot.docs[0].data(),
          } as IdentityVerificationResult & { id: string });

      return {
        hasPendingRequest: !!pendingRequest,
        pendingRequest: pendingRequest
          ? {
              id: pendingRequest.id,
              reason: pendingRequest.reason,
              provider: pendingRequest.provider,
              requestedAt: pendingRequest.requestedAt.toDate().toISOString(),
              timeoutAt: pendingRequest.timeoutAt?.toDate().toISOString(),
            }
          : null,
        isVerified: latestResult?.verified || false,
        ageConfirmed: latestResult?.ageConfirmed || false,
        lastVerificationAt: latestResult?.createdAt?.toDate().toISOString(),
      };
    } catch (error: any) {
      console.error('[IdentityVerification] Error getting status:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Upload documents for verification
 */
export const identityVerification_uploadDocuments = functions.https.onCall(
  async (data: {
    requestId: string;
    documents: Array<{
      type: DocumentType;
      data: string; // Base64 encoded image data
    }>;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = context.auth.uid;
    const { requestId, documents } = data;

    if (!requestId || !documents || documents.length === 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'requestId and documents are required'
      );
    }

    try {
      // Verify request belongs to user
      const requestDoc = await db
        .collection('identityVerificationRequests')
        .doc(requestId)
        .get();

      if (!requestDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Verification request not found');
      }

      const request = requestDoc.data() as IdentityVerificationRequest;

      if (request.userId !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'Request does not belong to user');
      }

      if (request.status !== 'PENDING') {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Request is not pending: ${request.status}`
        );
      }

      // Store documents in Firestore (in production, upload to Cloud Storage)
      const documentRefs = [];
      for (const doc of documents) {
        const docData = {
          userId,
          requestId,
          type: doc.type,
          storageUrl: doc.data, // In production, this would be a Cloud Storage URL
          uploadedAt: serverTimestamp(),
          encrypted: false, // In production, encrypt before storing
          processed: false,
        };

        const docRef = await db.collection('verificationDocuments').add(docData);
        documentRefs.push(docRef.id);
      }

      // Process verification
      const result = await VerificationEngine.processVerification(
        requestId,
        documents.map(d => ({
          type: d.type,
          data: d.data,
        }))
      );

      // Report to fraud detection system
      await VerificationFraudIntegration.reportToFraudSystem(userId, result);

      return {
        success: true,
        verified: result.verified,
        ageConfirmed: result.ageConfirmed,
        documentIds: documentRefs,
      };
    } catch (error: any) {
      console.error('[IdentityVerification] Error uploading documents:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Manually trigger verification check (for testing)
 */
export const identityVerification_triggerCheck = functions.https.onCall(
  async (data: {
    context: {
      selfieMismatch?: boolean;
      profileMismatchReported?: boolean;
      fraudScore?: number;
      estimatedAge?: number;
      underageFlag?: boolean;
    };
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = context.auth.uid;

    try {
      const triggered = await VerificationEngine.triggerVerificationIfNeeded(
        userId,
        data.context
      );

      return {
        triggered,
        message: triggered
          ? 'Verification request created'
          : 'No verification triggers matched',
      };
    } catch (error: any) {
      console.error('[IdentityVerification] Error triggering check:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// Admin Functions
// ============================================================================

/**
 * Manually review and approve/reject verification
 */
export const identityVerification_manualReview = functions.https.onCall(
  async (data: {
    requestId: string;
    approved: boolean;
    reason?: string;
    extractedData?: {
      dateOfBirth?: string;
      age?: number;
      fullName?: string;
      documentNumber?: string;
      nationality?: string;
    };
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    // TODO: Add proper admin role check
    const reviewerId = context.auth.uid;
    const { requestId, approved, reason, extractedData } = data;

    try {
      const requestDoc = await db
        .collection('identityVerificationRequests')
        .doc(requestId)
        .get();

      if (!requestDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Request not found');
      }

      const request = requestDoc.data() as IdentityVerificationRequest;

      if (request.status !== 'PENDING') {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Request already processed: ${request.status}`
        );
      }

      // Calculate age if date of birth provided
      let age = extractedData?.age;
      if (extractedData?.dateOfBirth && !age) {
        const dob = new Date(extractedData.dateOfBirth);
        const today = new Date();
        age = today.getFullYear() - dob.getFullYear();
        const monthDiff = today.getMonth() - dob.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
          age--;
        }
      }

      // Create result
      const result: IdentityVerificationResult = {
        userId: request.userId,
        verified: approved,
        ageConfirmed: approved && (!age || age >= VERIFICATION_CONFIG.MINIMUM_AGE),
        identityMatch: approved,
        provider: request.provider,
        reviewedBy: 'HUMAN_MODERATOR',
        createdAt: Timestamp.now(),
        extractedData: extractedData
          ? {
              ...extractedData,
              age,
            }
          : undefined,
        confidence: approved
          ? {
              overall: 0.95,
              ageVerification: 0.95,
              identityMatch: 0.95,
              documentAuthenticity: 0.95,
            }
          : undefined,
        failureReasons: !approved && reason ? [reason] : undefined,
      };

      const resultRef = await db.collection('identityVerificationResults').add(result);

      // Update request
      await requestDoc.ref.update({
        status: approved ? 'VERIFIED' : 'REJECTED',
        completedAt: serverTimestamp(),
      });

      // Apply enforcement
      await VerificationEngine['applyEnforcement'](
        request.userId,
        request.reason,
        result
      );

      // Report to fraud system
      await VerificationFraudIntegration.reportToFraudSystem(request.userId, result);

      // Log audit
      await db.collection('verificationAuditLog').add({
        userId: request.userId,
        action: 'MANUAL_REVIEW',
        timestamp: serverTimestamp(),
        performedBy: reviewerId,
        requestId,
        resultId: resultRef.id,
        details: {
          approved,
          reason,
          reviewerId,
        },
      });

      return {
        success: true,
        resultId: resultRef.id,
        verified: approved,
      };
    } catch (error: any) {
      console.error('[IdentityVerification] Error in manual review:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Get pending verification requests for moderation
 */
export const identityVerification_getPendingRequests = functions.https.onCall(
  async (data: { limit?: number }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    // TODO: Add proper moderator role check

    const limit = data.limit || 50;

    try {
      const snapshot = await db
        .collection('identityVerificationRequests')
        .where('status', '==', 'PENDING')
        .orderBy('requestedAt', 'asc')
        .limit(limit)
        .get();

      const requests = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        requestedAt: doc.data().requestedAt?.toDate().toISOString(),
        timeoutAt: doc.data().timeoutAt?.toDate().toISOString(),
      }));

      return { requests };
    } catch (error: any) {
      console.error('[IdentityVerification] Error getting pending requests:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// Scheduled Functions
// ============================================================================

/**
 * Check for timed-out verification requests
 * Runs every hour
 */
export const identityVerification_checkTimeouts = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    console.log('[IdentityVerification] Checking for timeouts...');

    try {
      const now = Timestamp.now();
      
      const snapshot = await db
        .collection('identityVerificationRequests')
        .where('status', '==', 'PENDING')
        .where('timeoutAt', '<=', now)
        .get();

      console.log(`[IdentityVerification] Found ${snapshot.size} timed-out requests`);

      for (const doc of snapshot.docs) {
        await VerificationEngine.checkTimeout(doc.id);
      }

      return { processed: snapshot.size };
    } catch (error) {
      console.error('[IdentityVerification] Error checking timeouts:', error);
      throw error;
    }
  });

/**
 * Send reminder emails for pending verification
 * Runs every 6 hours
 */
export const identityVerification_sendReminders = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async (context) => {
    console.log('[IdentityVerification] Sending reminders...');

    try {
      const reminderTime = Timestamp.fromMillis(
        Date.now() - VERIFICATION_CONFIG.REMINDER_AFTER_HOURS * 60 * 60 * 1000
      );

      const snapshot = await db
        .collection('identityVerificationRequests')
        .where('status', '==', 'PENDING')
        .where('requestedAt', '<=', reminderTime)
        .where('reminderSentAt', '==', null)
        .get();

      console.log(`[IdentityVerification] Found ${snapshot.size} requests needing reminders`);

      for (const doc of snapshot.docs) {
        const request = doc.data() as IdentityVerificationRequest;

        // TODO: Send email/push notification to user
        console.log(`[IdentityVerification] Sending reminder to user ${request.userId}`);

        // Update reminder sent timestamp
        await doc.ref.update({
          reminderSentAt: serverTimestamp(),
        });
      }

      return { remindersSent: snapshot.size };
    } catch (error) {
      console.error('[IdentityVerification] Error sending reminders:', error);
      throw error;
    }
  });

// ============================================================================
// Triggers (Automated Verification Requests)
// ============================================================================

/**
 * Auto-trigger verification when fraud score increases
 */
export const identityVerification_onFraudSignal = functions.firestore
  .document('fraudSignals/{signalId}')
  .onCreate(async (snap, context) => {
    const signal = snap.data();

    if (signal.severity === 'HIGH' && signal.confidence >= 0.7) {
      console.log(`[IdentityVerification] High fraud signal for user ${signal.userId}`);

      try {
        await VerificationEngine.triggerVerificationIfNeeded(signal.userId, {
          fraudScore: signal.confidence,
        });
      } catch (error) {
        console.error('[IdentityVerification] Error triggering verification:', error);
      }
    }
  });

/**
 * Auto-trigger verification when profile mismatch is reported
 */
export const identityVerification_onMismatchReport = functions.firestore
  .document('reports/{reportId}')
  .onCreate(async (snap, context) => {
    const report = snap.data();

    if (report.type === 'PROFILE_MISMATCH' && report.status === 'PENDING') {
      console.log(`[IdentityVerification] Profile mismatch reported for user ${report.reportedUserId}`);

      try {
        await VerificationEngine.triggerVerificationIfNeeded(report.reportedUserId, {
          profileMismatchReported: true,
        });
      } catch (error) {
        console.error('[IdentityVerification] Error triggering verification:', error);
      }
    }
  });