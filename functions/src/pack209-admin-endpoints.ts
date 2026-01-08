/**
 * PACK 209: Admin & Moderator Endpoints
 * Dashboard for reviewing complaints, refunds, and trust incidents
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, increment } from './init';
import { FunctionResponse } from './types';
import { AppearanceComplaint, RefundTransaction, VoluntaryRefund, TrustSafetyIncident } from './pack209-refund-complaint-types';

/**
 * Check if user is admin or moderator
 */
async function isAdminOrModerator(userId: string): Promise<boolean> {
  const userSnap = await db.collection('users').doc(userId).get();
  if (!userSnap.exists) return false;
  
  const userData = userSnap.data() as any;
  return userData?.roles?.admin === true || userData?.roles?.moderator === true;
}

/**
 * Get all appearance complaints with filtering
 */
export const admin_getAppearanceComplaints = onCall(
  { region: 'us-central1' },
  async (request): Promise<FunctionResponse<{ complaints: any[]; total: number }>> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const isAdmin = await isAdminOrModerator(request.auth.uid);
    if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Admin or moderator access required');
    }

    const {
      limit = 50,
      offset = 0,
      decision,
      requiresReview,
      source, // 'meeting' or 'event'
    } = request.data;

    let query = db.collection('appearance_complaints').orderBy('createdAt', 'desc');

    if (decision) {
      query = query.where('decision', '==', decision) as any;
    }

    if (requiresReview !== undefined) {
      query = query.where('manualReview', '==', requiresReview) as any;
    }

    const snapshot = await query.limit(limit).offset(offset).get();
    const complaints = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Filter by source if specified
    const filteredComplaints = source
      ? complaints.filter(c => (source === 'meeting' ? !!(c as any).bookingId : !!(c as any).eventId))
      : complaints;

    return {
      ok: true,
      data: {
        complaints: filteredComplaints,
        total: filteredComplaints.length,
      },
    };
  }
);

/**
 * Get all refund transactions with filtering
 */
export const admin_getRefundTransactions = onCall(
  { region: 'us-central1' },
  async (request): Promise<FunctionResponse<{ refunds: any[]; total: number; stats: any }>> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const isAdmin = await isAdminOrModerator(request.auth.uid);
    if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Admin or moderator access required');
    }

    const {
      limit = 50,
      offset = 0,
      refundType,
      source, // 'meeting' or 'event'
      userId, // Filter by specific user
    } = request.data;

    let query = db.collection('refund_transactions').orderBy('createdAt', 'desc');

    if (refundType) {
      query = query.where('refundType', '==', refundType) as any;
    }

    if (source) {
      query = query.where('metadata.source', '==', source) as any;
    }

    if (userId) {
      // Find refunds where user is either payer or earner
      const payerQuery = await db
        .collection('refund_transactions')
        .where('payerId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const earnerQuery = await db
        .collection('refund_transactions')
        .where('earnerId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const refunds = [
        ...payerQuery.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        ...earnerQuery.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      ];

      // Calculate stats
      const totalRefunded = refunds.reduce((sum, r: any) => sum + (r.refundToPayerAmount || 0), 0);
      const avaloKept = refunds.reduce((sum, r: any) => sum + (r.avaloKeptAmount || 0), 0);

      return {
        ok: true,
        data: {
          refunds,
          total: refunds.length,
          stats: {
            totalRefunded,
            avaloKept,
          },
        },
      };
    }

    const snapshot = await query.limit(limit).offset(offset).get();
    const refunds = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Calculate stats
    const totalRefunded = refunds.reduce((sum, r: any) => sum + (r.refundToPayerAmount || 0), 0);
    const avaloKept = refunds.reduce((sum, r: any) => sum + (r.avaloKeptAmount || 0), 0);

    return {
      ok: true,
      data: {
        refunds,
        total: refunds.length,
        stats: {
          totalRefunded,
          avaloKept,
        },
      },
    };
  }
);

/**
 * Get voluntary refunds with filtering
 */
export const admin_getVoluntaryRefunds = onCall(
  { region: 'us-central1' },
  async (request): Promise<FunctionResponse<{ refunds: any[]; total: number; stats: any }>> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const isAdmin = await isAdminOrModerator(request.auth.uid);
    if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Admin or moderator access required');
    }

    const {
      limit = 50,
      offset = 0,
      source, // 'meeting' or 'event'
      userId, // Filter by issuer or recipient
    } = request.data;

    let query = db.collection('voluntary_refunds').orderBy('createdAt', 'desc');

    if (source) {
      query = query.where('metadata.source', '==', source) as any;
    }

    if (userId) {
      // Find refunds issued by or received by user
      const issuedQuery = await db
        .collection('voluntary_refunds')
        .where('issuedBy', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const receivedQuery = await db
        .collection('voluntary_refunds')
        .where('recipientId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const refunds = [
        ...issuedQuery.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        ...receivedQuery.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      ];

      const totalAmount = refunds.reduce((sum, r: any) => sum + (r.refundAmount || 0), 0);

      return {
        ok: true,
        data: {
          refunds,
          total: refunds.length,
          stats: {
            totalAmount,
            avgPercent: refunds.length > 0
              ? refunds.reduce((sum, r: any) => sum + (r.refundPercent || 0), 0) / refunds.length
              : 0,
          },
        },
      };
    }

    const snapshot = await query.limit(limit).offset(offset).get();
    const refunds = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    const totalAmount = refunds.reduce((sum, r: any) => sum + (r.refundAmount || 0), 0);

    return {
      ok: true,
      data: {
        refunds,
        total: refunds.length,
        stats: {
          totalAmount,
          avgPercent: refunds.length > 0
            ? refunds.reduce((sum, r: any) => sum + (r.refundPercent || 0), 0) / refunds.length
            : 0,
        },
      },
    };
  }
);

/**
 * Get trust & safety incidents with filtering
 */
export const admin_getTrustIncidents = onCall(
  { region: 'us-central1' },
  async (request): Promise<FunctionResponse<{ incidents: any[]; total: number }>> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const isAdmin = await isAdminOrModerator(request.auth.uid);
    if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Admin or moderator access required');
    }

    const {
      limit = 50,
      offset = 0,
      type,
      severity,
      requiresReview,
      userId,
    } = request.data;

    let query = db.collection('trust_safety_incidents').orderBy('createdAt', 'desc');

    if (type) {
      query = query.where('type', '==', type) as any;
    }

    if (severity) {
      query = query.where('severity', '==', severity) as any;
    }

    if (requiresReview !== undefined) {
      query = query.where('requiresManualReview', '==', requiresReview) as any;
    }

    if (userId) {
      query = query.where('userId', '==', userId) as any;
    }

    const snapshot = await query.limit(limit).offset(offset).get();
    const incidents = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return {
      ok: true,
      data: {
        incidents,
        total: incidents.length,
      },
    };
  }
);

/**
 * Review and resolve trust incident
 */
export const admin_reviewTrustIncident = onCall(
  { region: 'us-central1' },
  async (request): Promise<FunctionResponse<{ incidentId: string }>> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const isAdmin = await isAdminOrModerator(request.auth.uid);
    if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Admin or moderator access required');
    }

    const { incidentId, actionTaken, notes } = request.data;

    const validActions = ['FLAGGED', 'PHOTO_UPDATE_REQUIRED', 'RESTRICTED', 'BANNED', 'CLEARED'];
    if (!validActions.includes(actionTaken)) {
      throw new HttpsError('invalid-argument', `Invalid action. Must be one of: ${validActions.join(', ')}`);
    }

    await db.collection('trust_safety_incidents').doc(incidentId).update({
      actionTaken,
      reviewedBy: request.auth.uid,
      reviewedAt: serverTimestamp(),
      requiresManualReview: false,
      notes,
    });

    return {
      ok: true,
      data: { incidentId },
    };
  }
);

/**
 * Get refund statistics dashboard
 */
export const admin_getRefundStatistics = onCall(
  { region: 'us-central1' },
  async (request): Promise<FunctionResponse<any>> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const isAdmin = await isAdminOrModerator(request.auth.uid);
    if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Admin or moderator access required');
    }

    const { timeframe = '7d' } = request.data;

    // Calculate date range
    const now = new Date();
    const daysBack = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
    const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

    // Get refund transactions
    const refundsSnap = await db
      .collection('refund_transactions')
      .where('createdAt', '>=', startDate)
      .get();

    const refunds = refundsSnap.docs.map(doc => doc.data());

    // Calculate statistics
    const stats = {
      totalRefunds: refunds.length,
      totalRefundedAmount: refunds.reduce((sum, r: any) => sum + (r.refundToPayerAmount || 0), 0),
      totalAvaloKept: refunds.reduce((sum, r: any) => sum + (r.avaloKeptAmount || 0), 0),
      byTrigger: {} as Record<string, number>,
      bySource: {
        meeting: 0,
        event: 0,
      },
      averageRefundAmount: 0,
    };

    // Group by trigger type
    for (const refund of refunds) {
      const trigger = (refund as any).refundType || 'UNKNOWN';
      stats.byTrigger[trigger] = (stats.byTrigger[trigger] || 0) + 1;
      
      const source = (refund as any).metadata?.source || 'unknown';
      if (source === 'meeting') stats.bySource.meeting++;
      if (source === 'event') stats.bySource.event++;
    }

    stats.averageRefundAmount = refunds.length > 0
      ? stats.totalRefundedAmount / refunds.length
      : 0;

    return {
      ok: true,
      data: stats,
    };
  }
);

/**
 * Get voluntary refund statistics
 */
export const admin_getVoluntaryRefundStatistics = onCall(
  { region: 'us-central1' },
  async (request): Promise<FunctionResponse<any>> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const isAdmin = await isAdminOrModerator(request.auth.uid);
    if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Admin or moderator access required');
    }

    const { timeframe = '30d' } = request.data;

    // Calculate date range
    const now = new Date();
    const daysBack = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
    const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

    // Get voluntary refunds
    const refundsSnap = await db
      .collection('voluntary_refunds')
      .where('createdAt', '>=', startDate)
      .get();

    const refunds = refundsSnap.docs.map(doc => doc.data());

    // Calculate statistics
    const stats = {
      totalVoluntaryRefunds: refunds.length,
      totalAmount: refunds.reduce((sum, r: any) => sum + (r.refundAmount || 0), 0),
      bySource: {
        meeting: refunds.filter(r => (r as any).metadata?.source === 'meeting').length,
        event: refunds.filter(r => (r as any).metadata?.source === 'event').length,
      },
      averagePercent: refunds.length > 0
        ? refunds.reduce((sum, r: any) => sum + (r.refundPercent || 0), 0) / refunds.length
        : 0,
      percentageDistribution: {
        full: refunds.filter(r => (r as any).refundPercent === 100).length,
        half: refunds.filter(r => (r as any).refundPercent >= 40 && (r as any).refundPercent <= 60).length,
        quarter: refunds.filter(r => (r as any).refundPercent >= 20 && (r as any).refundPercent <= 30).length,
        minimal: refunds.filter(r => (r as any).refundPercent < 20).length,
      },
    };

    return {
      ok: true,
      data: stats,
    };
  }
);

/**
 * Get complaint statistics
 */
export const admin_getComplaintStatistics = onCall(
  { region: 'us-central1' },
  async (request): Promise<FunctionResponse<any>> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const isAdmin = await isAdminOrModerator(request.auth.uid);
    if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Admin or moderator access required');
    }

    const { timeframe = '30d' } = request.data;

    // Calculate date range
    const now = new Date();
    const daysBack = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
    const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

    // Get complaints
    const complaintsSnap = await db
      .collection('appearance_complaints')
      .where('createdAt', '>=', startDate)
      .get();

    const complaints = complaintsSnap.docs.map(doc => doc.data());

    // Calculate statistics
    const stats = {
      totalComplaints: complaints.length,
      byDecision: {
        keepCompleted: complaints.filter(c => (c as any).decision === 'KEEP_COMPLETED').length,
        issueRefund: complaints.filter(c => (c as any).decision === 'ISSUE_REFUND').length,
      },
      bySource: {
        meeting: complaints.filter(c => !!(c as any).bookingId).length,
        event: complaints.filter(c => !!(c as any).eventId).length,
      },
      totalRefundedFromComplaints: complaints
        .filter(c => (c as any).decision === 'ISSUE_REFUND')
        .reduce((sum, c: any) => sum + (c.refundAmount || 0), 0),
      requiresManualReview: complaints.filter(c => (c as any).manualReview === true).length,
      averageMismatchScore: complaints.filter(c => (c as any).mismatchScore).length > 0
        ? complaints
            .filter(c => (c as any).mismatchScore)
            .reduce((sum, c: any) => sum + (c.mismatchScore || 0), 0) /
          complaints.filter(c => (c as any).mismatchScore).length
        : 0,
    };

    return {
      ok: true,
      data: stats,
    };
  }
);

/**
 * Force admin refund (emergency override)
 */
export const admin_forceRefund = onCall(
  { region: 'us-central1' },
  async (request): Promise<FunctionResponse<{ refundId: string }>> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const isAdmin = await isAdminOrModerator(request.auth.uid);
    if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const {
      bookingId,
      eventId,
      attendeeId,
      payerId,
      earnerId,
      refundAmount,
      reason,
    } = request.data;

    if (!refundAmount || refundAmount <= 0) {
      throw new HttpsError('invalid-argument', 'Valid refund amount required');
    }

    // Process admin override refund
    await db.runTransaction(async (transaction) => {
      // Transfer tokens
      const payerWalletRef = db.collection('users').doc(payerId).collection('wallet').doc('current');
      const earnerWalletRef = db.collection('users').doc(earnerId).collection('wallet').doc('current');

      transaction.update(payerWalletRef, {
        balance: increment(refundAmount),
      } as any);

      transaction.update(earnerWalletRef, {
        balance: increment(-refundAmount),
        earned: increment(-refundAmount),
      } as any);

      // Create refund transaction log
      const refundTxId = db.collection('refund_transactions').doc().id;
      transaction.set(db.collection('refund_transactions').doc(refundTxId), {
        transactionId: refundTxId,
        refundType: 'ADMIN_OVERRIDE',
        bookingId,
        eventId,
        attendeeId,
        payerId,
        earnerId,
        originalAmount: refundAmount,
        earnerShare: refundAmount,
        avaloCommission: 0,
        refundToPayerAmount: refundAmount,
        earnerKeptAmount: 0,
        avaloKeptAmount: 0,
        triggeredBy: request.auth.uid,
        automaticRefund: false,
        notes: `Admin override refund: ${reason}`,
        createdAt: serverTimestamp(),
        processedAt: serverTimestamp(),
        metadata: {
          adminOverride: true,
          adminId: request.auth.uid,
        },
      });
    });

    return {
      ok: true,
      data: { refundId: 'admin_override' },
    };
  }
);