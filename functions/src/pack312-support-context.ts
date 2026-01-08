/**
 * PACK 312 — Customer Support Console & Case Management
 * Context Query Functions - Privacy-aware data aggregation
 * 
 * PRIVACY RULES:
 * - No raw chat content exposed
 * - No exact location coordinates (coarse only)
 * - Aggregated safety metrics only
 * - PII restricted by role
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './init';
import { logger } from 'firebase-functions/v2';
import {
  UserContextSummary,
  MeetingContextSummary,
  EventContextSummary,
  TransactionContextSummary,
  SafetyContextSummary,
  AdminRole,
} from './pack312-support-types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function isAdminWithRole(
  adminId: string,
  allowedRoles: AdminRole[]
): Promise<{ isAdmin: boolean; role?: AdminRole }> {
  try {
    const adminDoc = await db.collection('admin_users').doc(adminId).get();
    
    if (!adminDoc.exists) {
      return { isAdmin: false };
    }
    
    const adminData = adminDoc.data();
    const role = adminData?.role as AdminRole;
    
    if (allowedRoles.includes(role)) {
      return { isAdmin: true, role };
    }
    
    return { isAdmin: false, role };
  } catch (error: any) {
    logger.error('[SupportContext] Error checking admin role', { adminId, error: error.message });
    return { isAdmin: false };
  }
}

// ============================================================================
// USER CONTEXT
// ============================================================================

/**
 * Get privacy-aware user context summary
 */
export const support_getUserContext = onCall(
  { region: 'europe-west3' },
  async (request): Promise<UserContextSummary> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const adminId = request.auth.uid;
    const { isAdmin, role } = await isAdminWithRole(adminId, [
      'SUPPORT',
      'MODERATOR',
      'RISK',
      'FINANCE',
      'LEGAL',
      'SUPERADMIN',
    ]);

    if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { userId } = request.data;

    if (!userId) {
      throw new HttpsError('invalid-argument', 'userId is required');
    }

    try {
      // Get user data
      const userDoc = await db.collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User not found');
      }

      const user = userDoc.data();

      // Get verification status
      const kycDoc = await db.collection('user_kyc_status').doc(userId).get();
      const kycData = kycDoc.data();

      // Get trust profile
      const trustDoc = await db.collection('user_trust_profile').doc(userId).get();
      const trustData = trustDoc.data();

      // Get enforcement state
      const enforcementDoc = await db.collection('user_enforcement_state').doc(userId).get();
      const enforcementData = enforcementDoc.data();

      // Count safety reports (aggregated)
      const reportsReceivedSnapshot = await db
        .collection('safety_reports')
        .where('reportedUserId', '==', userId)
        .count()
        .get();

      const reportsCount = reportsReceivedSnapshot.data().count;

      // Count active bans
      const activeBans = enforcementData?.accountStatus === 'SUSPENDED' ? 1 : 0;

      // Determine risk level
      let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
      const riskScore = trustData?.riskScore || 0;
      
      if (riskScore >= 75) riskLevel = 'CRITICAL';
      else if (riskScore >= 50) riskLevel = 'HIGH';
      else if (riskScore >= 25) riskLevel = 'MEDIUM';

      const context: UserContextSummary = {
        userId,
        handle: user?.handle || user?.displayName || 'Unknown',
        age: user?.age && user.age >= 18 ? user.age : undefined,
        country: user?.country,
        languages: user?.languages,
        verificationStatus: kycData?.status,
        verificationDate: kycData?.lastUpdatedAt,
        trustLabel: trustData?.label,
        riskLevel,
        earnOn: user?.earnFromChat || false,
        royalStatus: user?.royalStatus || false,
        vipStatus: user?.vipStatus || false,
        influencerBadge: user?.influencerBadge || false,
        safetyReportsCount: reportsCount,
        activeBans,
        activeMutes: 0, // Would need mute tracking
      };

      return context;
    } catch (error: any) {
      logger.error('[SupportContext] Error getting user context', { error: error.message, userId });
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to get user context: ${error.message}`);
    }
  }
);

// ============================================================================
// MEETING CONTEXT
// ============================================================================

/**
 * Get privacy-aware meeting context summary
 */
export const support_getMeetingContext = onCall(
  { region: 'europe-west3' },
  async (request): Promise<MeetingContextSummary> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const adminId = request.auth.uid;
    const { isAdmin } = await isAdminWithRole(adminId, [
      'SUPPORT',
      'MODERATOR',
      'RISK',
      'LEGAL',
      'SUPERADMIN',
    ]);

    if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { meetingId } = request.data;

    if (!meetingId) {
      throw new HttpsError('invalid-argument', 'meetingId is required');
    }

    try {
      // Get meeting
      const meetingDoc = await db.collection('meetings').doc(meetingId).get();
      
      if (!meetingDoc.exists) {
        throw new HttpsError('not-found', 'Meeting not found');
      }

      const meeting = meetingDoc.data();

      // Get validations
      const validationsSnapshot = await db
        .collection('meetings')
        .doc(meetingId)
        .collection('validations')
        .get();

      const validations = validationsSnapshot.docs.map(doc => doc.data());

      // Check QR verification
      const qrValidations = validations.filter(v => v.qrCode);
      let qrStatus: 'MATCHED' | 'MISMATCH' | 'NOT_TAKEN' = 'NOT_TAKEN';
      if (qrValidations.length > 0) {
        qrStatus = qrValidations.every(v => v.verified) ? 'MATCHED' : 'MISMATCH';
      }

      // Check selfie verification
      const selfieValidations = validations.filter(v => v.selfieUrl);
      let selfieStatus: 'MATCHED' | 'MISMATCH' | 'NOT_TAKEN' = 'NOT_TAKEN';
      if (selfieValidations.length > 0) {
        // Check verification scores if available
        const hasScores = selfieValidations.some(v => v.verificationScore !== undefined);
        if (hasScores) {
          const allMatch = selfieValidations.every(v => !v.verificationScore || v.verificationScore >= 0.7);
          selfieStatus = allMatch ? 'MATCHED' : 'MISMATCH';
        } else {
          selfieStatus = 'MATCHED'; // Assume matched if no scores available
        }
      }

      // Check panic button
      const panicAlertsSnapshot = await db
        .collection('meetings')
        .doc(meetingId)
        .collection('panic_alerts')
        .get();

      const panicButtonTriggered = !panicAlertsSnapshot.empty;
      const panicButtonTimestamp = panicButtonTriggered 
        ? panicAlertsSnapshot.docs[0].data()?.timestamp 
        : undefined;

      // Get refund info
      const refundsSnapshot = await db
        .collection('meeting_refunds')
        .where('meetingId', '==', meetingId)
        .get();

      const refundApplied = !refundsSnapshot.empty;
      const refund = refundsSnapshot.docs[0]?.data();

      // Extract coarse location (city only, not exact coords)
      let locationCity: string | undefined;
      if (meeting?.location?.address) {
        // Extract city from address string (simple approach)
        const addressParts = meeting.location.address.split(',');
        locationCity = addressParts.length > 1 ? addressParts[addressParts.length - 2].trim() : undefined;
      }

      const context: MeetingContextSummary = {
        meetingId,
        creatorId: meeting?.creatorId,
        bookerId: meeting?.bookerId,
        startTime: meeting?.startTime,
        endTime: meeting?.endTime,
        locationType: meeting?.location?.type || 'IN_PERSON',
        locationCity,
        qrVerificationStatus: qrStatus,
        selfieVerificationStatus: selfieStatus,
        panicButtonTriggered,
        panicButtonTimestamp,
        meetingStatus: meeting?.status,
        cancelledBy: meeting?.cancelledBy,
        completedAt: meeting?.completedAt,
        refundApplied,
        refundReason: refund?.refundReason,
        refundAmount: refund?.refundAmount,
      };

      return context;
    } catch (error: any) {
      logger.error('[SupportContext] Error getting meeting context', { error: error.message, meetingId });
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to get meeting context: ${error.message}`);
    }
  }
);

// ============================================================================
// TRANSACTION CONTEXT
// ============================================================================

/**
 * Get privacy-aware transaction context summary
 */
export const support_getTransactionContext = onCall(
  { region: 'europe-west3' },
  async (request): Promise<TransactionContextSummary> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const adminId = request.auth.uid;
    const { isAdmin } = await isAdminWithRole(adminId, [
      'SUPPORT',
      'FINANCE',
      'LEGAL',
      'SUPERADMIN',
    ]);

    if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { transactionId } = request.data;

    if (!transactionId) {
      throw new HttpsError('invalid-argument', 'transactionId is required');
    }

    try {
      // Get transaction
      const txDoc = await db.collection('transactions').doc(transactionId).get();
      
      if (!txDoc.exists) {
        throw new HttpsError('not-found', 'Transaction not found');
      }

      const tx = txDoc.data();

      // Map transaction type
      let type: TransactionContextSummary['type'] = 'OTHER';
      if (tx?.type) {
        const typeMap: Record<string, TransactionContextSummary['type']> = {
          'chat_spend': 'CHAT_SPEND',
          'calendar_booking': 'CALENDAR_BOOKING',
          'meeting_escrow_hold': 'CALENDAR_BOOKING',
          'meeting_escrow_release': 'CALENDAR_BOOKING',
          'event_ticket': 'EVENT_TICKET',
          'meeting_refund': 'REFUND',
          'token_purchase': 'TOKEN_PURCHASE',
          'payout': 'PAYOUT',
        };
        type = typeMap[tx.type] || 'OTHER';
      }

      // Calculate shares if applicable
      let avaloShare: number | undefined;
      let creatorShare: number | undefined;

      if (tx?.metadata?.avaloShare !== undefined) {
        avaloShare = tx.metadata.avaloShare;
      }
      if (tx?.metadata?.creatorShare !== undefined) {
        creatorShare = tx.metadata.creatorShare;
      }

      // Determine status
      let status: TransactionContextSummary['status'] = 'COMPLETED';
      if (tx?.status) {
        status = tx.status.toUpperCase() as TransactionContextSummary['status'];
      } else if (tx?.type === 'meeting_refund') {
        status = 'REFUNDED';
      }

      const context: TransactionContextSummary = {
        transactionId,
        type,
        amountTokens: tx?.amount,
        amountCurrency: tx?.amountCurrency,
        currency: tx?.currency,
        fromUserId: tx?.fromUserId,
        toUserId: tx?.toUserId,
        avaloShare,
        creatorShare,
        relatedBookingId: tx?.bookingId,
        relatedChatSessionId: tx?.chatSessionId,
        relatedAiSessionId: tx?.aiSessionId,
        paymentProcessor: tx?.paymentProcessor === 'stripe' ? 'STRIPE' : 'OTHER',
        externalReferenceId: tx?.externalReference || tx?.stripePaymentIntentId,
        status,
        timestamp: tx?.timestamp || tx?.createdAt,
      };

      return context;
    } catch (error: any) {
      logger.error('[SupportContext] Error getting transaction context', { error: error.message, transactionId });
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to get transaction context: ${error.message}`);
    }
  }
);

// ============================================================================
// SAFETY CONTEXT
// ============================================================================

/**
 * Get privacy-aware safety context summary (aggregated only)
 */
export const support_getSafetyContext = onCall(
  { region: 'europe-west3' },
  async (request): Promise<SafetyContextSummary> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const adminId = request.auth.uid;
    const { isAdmin } = await isAdminWithRole(adminId, [
      'SUPPORT',
      'RISK',
      'LEGAL',
      'SUPERADMIN',
    ]);

    if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { userId } = request.data;

    if (!userId) {
      throw new HttpsError('invalid-argument', 'userId is required');
    }

    try {
      // Get trust profile
      const trustDoc = await db.collection('user_trust_profile').doc(userId).get();
      const trustData = trustDoc.data();

      // Get enforcement state
      const enforcementDoc = await db.collection('user_enforcement_state').doc(userId).get();
      const enforcementData = enforcementDoc.data();

      // Count reports received
      const reportsReceivedSnapshot = await db
        .collection('safety_reports')
        .where('reportedUserId', '==', userId)
        .count()
        .get();

      // Count reports submitted
      const reportsSubmittedSnapshot = await db
        .collection('safety_reports')
        .where('reporterId', '==', userId)
        .count()
        .get();

      // Count panic button usage
      const panicButtonSnapshot = await db
        .collectionGroup('panic_alerts')
        .where('userId', '==', userId)
        .count()
        .get();

      // Determine risk level
      let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
      const riskScore = trustData?.riskScore || 0;
      
      if (riskScore >= 75) riskLevel = 'CRITICAL';
      else if (riskScore >= 50) riskLevel = 'HIGH';
      else if (riskScore >= 25) riskLevel = 'MEDIUM';

      // Get current bans/mutes
      const currentBans: { type: string; expiresAt?: any }[] = [];
      const currentMutes: { type: string; expiresAt?: any }[] = [];

      if (enforcementData?.accountStatus === 'SUSPENDED') {
        currentBans.push({
          type: 'ACCOUNT_SUSPENDED',
        });
      } else if (enforcementData?.accountStatus === 'HARD_RESTRICTED') {
        currentBans.push({
          type: 'HARD_RESTRICTED',
        });
      }

      // Get recent safety incidents (last 10, summary only)
      const recentIncidentsSnapshot = await db
        .collection('safety_reports')
        .where('reportedUserId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

      const recentIncidents = recentIncidentsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          incidentId: doc.id,
          type: data.reportType || 'UNKNOWN',
          date: data.createdAt,
          severity: data.severity || 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
        };
      });

      const context: SafetyContextSummary = {
        userId,
        riskScore,
        riskLevel,
        safetyReportsReceived: reportsReceivedSnapshot.data().count,
        safetyReportsSubmitted: reportsSubmittedSnapshot.data().count,
        panicButtonUsageCount: panicButtonSnapshot.data().count,
        currentBans,
        currentMutes,
        recentIncidents,
      };

      return context;
    } catch (error: any) {
      logger.error('[SupportContext] Error getting safety context', { error: error.message, userId });
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to get safety context: ${error.message}`);
    }
  }
);