/**
 * PACK 147 — Cloud Functions (API Endpoints)
 * 
 * Callable functions for refund & dispute system.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { requestRefund, cancelRefundRequest, getUserRefundRequests, adminResolveRefund } from './pack147-refund-engine';
import { getUserEscrowBalance } from './pack147-escrow-engine';
import { getUserFraudHistory } from './pack147-fraud-detection';
import { db } from './init';
import { RefundReason, DisputeOutcome, TransactionType } from './pack147-types';

// ============================================================================
// USER FUNCTIONS
// ============================================================================

/**
 * Request a refund for a transaction
 */
export const pack147_requestRefund = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const {
      transactionId,
      transactionType,
      reason,
      description,
      evidenceUrls
    } = request.data;
    
    // Validate required fields
    if (!transactionId || !transactionType || !reason || !description) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }
    
    // Validate transaction type
    const validTypes: TransactionType[] = [
      'PAID_CHAT', 'PAID_CALL', 'MENTORSHIP_SESSION', 'EVENT_TICKET',
      'DIGITAL_PRODUCT', 'GATED_CLUB', 'CHALLENGE', 'PAID_POST', 'MEDIA_UNLOCK'
    ];
    
    if (!validTypes.includes(transactionType)) {
      throw new HttpsError('invalid-argument', 'Invalid transaction type');
    }
    
    // Validate description length
    if (description.length < 20 || description.length > 1000) {
      throw new HttpsError('invalid-argument', 'Description must be 20-1000 characters');
    }
    
    try {
      const refundId = await requestRefund({
        userId: uid,
        transactionId,
        transactionType,
        reason: reason as RefundReason,
        description,
        evidenceUrls: evidenceUrls || []
      });
      
      return {
        success: true,
        refundId,
        message: 'Refund request submitted successfully'
      };
      
    } catch (error: any) {
      logger.error('Refund request failed:', error);
      throw new HttpsError('internal', error.message || 'Failed to request refund');
    }
  }
);

/**
 * Cancel a refund request
 */
export const pack147_cancelRefund = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { refundId } = request.data;
    
    if (!refundId) {
      throw new HttpsError('invalid-argument', 'Missing refundId');
    }
    
    try {
      await cancelRefundRequest(refundId, uid);
      
      return {
        success: true,
        message: 'Refund request cancelled'
      };
      
    } catch (error: any) {
      logger.error('Cancel refund failed:', error);
      throw new HttpsError('internal', error.message || 'Failed to cancel refund');
    }
  }
);

/**
 * Get user's refund requests
 */
export const pack147_getMyRefunds = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { asRequester = true } = request.data;
    
    try {
      const refunds = await getUserRefundRequests(uid, asRequester);
      
      return {
        success: true,
        refunds,
        count: refunds.length
      };
      
    } catch (error: any) {
      logger.error('Get refunds failed:', error);
      throw new HttpsError('internal', 'Failed to retrieve refunds');
    }
  }
);

/**
 * Get refund request details
 */
export const pack147_getRefundDetails = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { refundId } = request.data;
    
    if (!refundId) {
      throw new HttpsError('invalid-argument', 'Missing refundId');
    }
    
    try {
      const refundSnap = await db.collection('refund_requests').doc(refundId).get();
      
      if (!refundSnap.exists) {
        throw new HttpsError('not-found', 'Refund request not found');
      }
      
      const refund = refundSnap.data();
      
      // Verify user has access
      if (refund?.requesterId !== uid && refund?.recipientId !== uid) {
        throw new HttpsError('permission-denied', 'Access denied');
      }
      
      return {
        success: true,
        refund
      };
      
    } catch (error: any) {
      if (error instanceof HttpsError) throw error;
      logger.error('Get refund details failed:', error);
      throw new HttpsError('internal', 'Failed to retrieve refund details');
    }
  }
);

/**
 * Get user's escrow balance
 */
export const pack147_getEscrowBalance = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    try {
      const balance = await getUserEscrowBalance(uid);
      
      return {
        success: true,
        ...balance
      };
      
    } catch (error: any) {
      logger.error('Get escrow balance failed:', error);
      throw new HttpsError('internal', 'Failed to retrieve escrow balance');
    }
  }
);

/**
 * Get refund statistics for user
 */
export const pack147_getRefundStats = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    try {
      // Get refund requests as buyer
      const buyerRefunds = await getUserRefundRequests(uid, true);
      
      // Get refund requests as seller
      const sellerRefunds = await getUserRefundRequests(uid, false);
      
      const stats = {
        asBuyer: {
          total: buyerRefunds.length,
          pending: buyerRefunds.filter(r => r.status === 'PENDING').length,
          approved: buyerRefunds.filter(r => r.status === 'APPROVED').length,
          rejected: buyerRefunds.filter(r => r.status === 'REJECTED').length,
          completed: buyerRefunds.filter(r => r.status === 'COMPLETED').length
        },
        asSeller: {
          total: sellerRefunds.length,
          pending: sellerRefunds.filter(r => r.status === 'PENDING').length,
          approved: sellerRefunds.filter(r => r.status === 'APPROVED').length,
          rejected: sellerRefunds.filter(r => r.status === 'REJECTED').length,
          completed: sellerRefunds.filter(r => r.status === 'COMPLETED').length
        }
      };
      
      return {
        success: true,
        stats
      };
      
    } catch (error: any) {
      logger.error('Get refund stats failed:', error);
      throw new HttpsError('internal', 'Failed to retrieve refund statistics');
    }
  }
);

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

/**
 * Admin: Manually resolve refund request (Tier 3 Human Review)
 */
export const pack147_admin_resolveRefund = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Check admin permissions
    const userSnap = await db.collection('users').doc(uid).get();
    const userData = userSnap.data();
    
    if (!userData?.roles?.admin && !userData?.roles?.moderator) {
      throw new HttpsError('permission-denied', 'Admin or moderator access required');
    }
    
    const { refundId, outcome, notes } = request.data;
    
    if (!refundId || !outcome || !notes) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }
    
    const validOutcomes: DisputeOutcome[] = [
      'BUYER_WINS_FULL', 'BUYER_WINS_PARTIAL', 'CREATOR_WINS', 'SPLIT_DECISION'
    ];
    
    if (!validOutcomes.includes(outcome)) {
      throw new HttpsError('invalid-argument', 'Invalid outcome');
    }
    
    try {
      await adminResolveRefund({
        refundId,
        adminId: uid,
        outcome: outcome as DisputeOutcome,
        notes
      });
      
      return {
        success: true,
        message: 'Refund resolved successfully'
      };
      
    } catch (error: any) {
      logger.error('Admin resolve refund failed:', error);
      throw new HttpsError('internal', error.message || 'Failed to resolve refund');
    }
  }
);

/**
 * Admin: Get all pending refunds for review
 */
export const pack147_admin_getPendingRefunds = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Check admin permissions
    const userSnap = await db.collection('users').doc(uid).get();
    const userData = userSnap.data();
    
    if (!userData?.roles?.admin && !userData?.roles?.moderator) {
      throw new HttpsError('permission-denied', 'Admin or moderator access required');
    }
    
    const { tier, limit = 50 } = request.data;
    
    try {
      let query = db.collection('refund_requests')
        .where('status', '==', 'UNDER_REVIEW')
        .orderBy('requestedAt', 'desc')
        .limit(limit);
      
      if (tier) {
        query = query.where('tier', '==', tier) as any;
      }
      
      const snapshot = await query.get();
      const refunds = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      return {
        success: true,
        refunds,
        count: refunds.length
      };
      
    } catch (error: any) {
      logger.error('Get pending refunds failed:', error);
      throw new HttpsError('internal', 'Failed to retrieve pending refunds');
    }
  }
);

/**
 * Admin: Get fraud detection records for user
 */
export const pack147_admin_getUserFraudHistory = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Check admin permissions
    const userSnap = await db.collection('users').doc(uid).get();
    const userData = userSnap.data();
    
    if (!userData?.roles?.admin && !userData?.roles?.moderator) {
      throw new HttpsError('permission-denied', 'Admin or moderator access required');
    }
    
    const { targetUserId } = request.data;
    
    if (!targetUserId) {
      throw new HttpsError('invalid-argument', 'Missing targetUserId');
    }
    
    try {
      const history = await getUserFraudHistory(targetUserId);
      
      return {
        success: true,
        history,
        count: history.length
      };
      
    } catch (error: any) {
      logger.error('Get fraud history failed:', error);
      throw new HttpsError('internal', 'Failed to retrieve fraud history');
    }
  }
);

/**
 * Admin: Get system-wide refund statistics
 */
export const pack147_admin_getSystemStats = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Check admin permissions
    const userSnap = await db.collection('users').doc(uid).get();
    const userData = userSnap.data();
    
    if (!userData?.roles?.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }
    
    try {
      // Get counts by status
      const [pending, underReview, approved, rejected, completed] = await Promise.all([
        db.collection('refund_requests').where('status', '==', 'PENDING').count().get(),
        db.collection('refund_requests').where('status', '==', 'UNDER_REVIEW').count().get(),
        db.collection('refund_requests').where('status', '==', 'APPROVED').count().get(),
        db.collection('refund_requests').where('status', '==', 'REJECTED').count().get(),
        db.collection('refund_requests').where('status', '==', 'COMPLETED').count().get()
      ]);
      
      // Get counts by tier
      const [tier1, tier2, tier3] = await Promise.all([
        db.collection('refund_requests').where('tier', '==', 'TIER_1_AUTO').count().get(),
        db.collection('refund_requests').where('tier', '==', 'TIER_2_AI').count().get(),
        db.collection('refund_requests').where('tier', '==', 'TIER_3_HUMAN').count().get()
      ]);
      
      // Get active escrows count
      const activeEscrows = await db.collection('escrow_wallets')
        .where('status', '==', 'HELD')
        .count()
        .get();
      
      // Get fraud detections
      const fraudDetections = await db.collection('fraud_detection_records')
        .count()
        .get();
      
      return {
        success: true,
        stats: {
          byStatus: {
            pending: pending.data().count,
            underReview: underReview.data().count,
            approved: approved.data().count,
            rejected: rejected.data().count,
            completed: completed.data().count
          },
          byTier: {
            tier1Auto: tier1.data().count,
            tier2AI: tier2.data().count,
            tier3Human: tier3.data().count
          },
          escrows: {
            active: activeEscrows.data().count
          },
          fraud: {
            totalDetections: fraudDetections.data().count
          }
        }
      };
      
    } catch (error: any) {
      logger.error('Get system stats failed:', error);
      throw new HttpsError('internal', 'Failed to retrieve system statistics');
    }
  }
);

logger.info('✅ PACK 147 endpoints loaded successfully');