/**
 * PACK 65 — Admin & Ops Console API
 * Internal admin endpoints for user management, enforcement, AML, disputes, payouts, and more
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp } from './init';
import { requireAdmin } from './adminAuth';
import { writeAuditLog } from './auditLogger';
import {
  UserSearchRequest,
  UserSearchResponse,
  UserDetailResponse,
  EnforcementUpdateRequest,
  AmlStatusUpdateRequest,
  DisputeResolveRequest,
  PayoutDecisionRequest,
  PromotionStatusUpdateRequest,
  DeletionReviewRequest,
  AuditSearchRequest,
  AuditSearchResponse,
} from './types/adminTypes';
import { applyEnforcement, getEnforcementState } from './moderationEngine';
import { queryAuditLogs } from './auditLogger';

// ============================================================================
// USER SEARCH & OVERVIEW
// ============================================================================

/**
 * POST /admin/users/search
 * Search for users by email, userId, or username
 */
export const adminUsersSearch = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // Require admin with view users permission
    const admin = await requireAdmin(req, 'canViewUsers');

    const body = req.body as UserSearchRequest;
    const { query, limit = 50, cursor } = body;

    // Build search query
    let usersQuery: any = db.collection('users');

    if (query) {
      // Search by email, userId, or username
      // Note: For production, use Algolia or similar for better search
      usersQuery = usersQuery
        .where('email', '>=', query)
        .where('email', '<=', query + '\uf8ff')
        .limit(limit + 1);
    } else {
      usersQuery = usersQuery.orderBy('createdAt', 'desc').limit(limit + 1);
    }

    if (cursor) {
      const cursorDoc = await db.collection('users').doc(cursor).get();
      if (cursorDoc.exists) {
        usersQuery = usersQuery.startAfter(cursorDoc);
      }
    }

    const snapshot = await usersQuery.get();

    const items: UserSearchResponse['items'] = [];
    let nextCursor: string | undefined;

    for (let i = 0; i < snapshot.docs.length; i++) {
      if (i < limit) {
        const doc = snapshot.docs[i];
        const userData = doc.data();

        // Get enforcement state
        const enforcementState = await getEnforcementState(doc.id);

        // Get AML profile for risk level
        const amlDoc = await db.collection('aml_profiles').doc(doc.id).get();
        const amlData = amlDoc.data();

        items.push({
          userId: doc.id,
          email: userData.email || null,
          displayName: userData.displayName || null,
          countryIso: userData.country || null,
          createdAt: userData.createdAt?.toMillis() || Date.now(),
          enforcementStateSummary: {
            accountStatus: enforcementState.accountStatus,
            earningStatus: enforcementState.earningStatus,
          },
          riskLevel: amlData?.riskLevel || 'LOW',
        });
      } else {
        nextCursor = snapshot.docs[i].id;
      }
    }

    // Log audit entry (optional for view operations)
    await writeAuditLog({
      admin,
      targetType: 'USER',
      action: 'USER_VIEW',
      severity: 'INFO',
      reason: `Search query: ${query || 'all'}`,
    });

    res.json({ items, nextCursor });
  } catch (error: any) {
    console.error('[Admin Console] Error in adminUsersSearch:', error);
    
    if (error.code) {
      res.status(error.code === 'unauthenticated' ? 401 : 403).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * GET /admin/users/detail
 * Get detailed view of a user including all related data
 */
export const adminUsersDetail = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const admin = await requireAdmin(req, 'canViewUsers');
    const userId = req.query.userId as string;

    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    // Fetch all user-related data
    const [
      userDoc,
      controlDoc,
      analyticsDoc,
      amlDoc,
      enforcementState,
      payoutAccountDoc,
      disputesSnapshot,
      campaignsSnapshot,
    ] = await Promise.all([
      db.collection('users').doc(userId).get(),
      db.collection('user_control_profiles').doc(userId).get(),
      db.collection('user_analytics').doc(userId).get(),
      db.collection('aml_profiles').doc(userId).get(),
      getEnforcementState(userId),
      db.collection('payout_accounts').doc(userId).get(),
      db.collection('disputes')
        .where('createdByUserId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get(),
      db.collection('promotion_campaigns')
        .where('ownerUserId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get(),
    ]);

    if (!userDoc.exists) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const response: UserDetailResponse = {
      userId,
      profile: userDoc.data(),
      controlSettings: controlDoc.exists ? controlDoc.data() : null,
      analytics: analyticsDoc.exists ? analyticsDoc.data() : null,
      amlProfile: amlDoc.exists ? amlDoc.data() : null,
      enforcementState,
      payoutSummary: payoutAccountDoc.exists ? payoutAccountDoc.data() : null,
      disputesSummary: {
        count: disputesSnapshot.size,
        recent: disputesSnapshot.docs.map((doc) => ({
          disputeId: doc.id,
          ...doc.data(),
        })),
      },
      promotionsSummary: {
        count: campaignsSnapshot.size,
        campaigns: campaignsSnapshot.docs.map((doc) => ({
          campaignId: doc.id,
          ...doc.data(),
        })),
      },
    };

    // Log audit entry
    await writeAuditLog({
      admin,
      targetType: 'USER',
      targetId: userId,
      action: 'USER_VIEW',
      severity: 'INFO',
      userId,
      reason: 'Admin viewed user details',
    });

    res.json(response);
  } catch (error: any) {
    console.error('[Admin Console] Error in adminUsersDetail:', error);
    
    if (error.code) {
      res.status(error.code === 'unauthenticated' ? 401 : 403).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// ============================================================================
// ENFORCEMENT ACTIONS
// ============================================================================

/**
 * POST /admin/enforcement/update
 * Apply enforcement actions to a user
 */
export const adminEnforcementUpdate = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const admin = await requireAdmin(req, 'canEditEnforcement');
    const body = req.body as EnforcementUpdateRequest;
    const { userId, newState, reason } = body;

    if (!userId || !newState || !reason) {
      res.status(400).json({ error: 'userId, newState, and reason are required' });
      return;
    }

    // Get current state for audit log
    const currentState = await getEnforcementState(userId);

    // Apply enforcement using existing module
    const result = await applyEnforcement(
      userId,
      admin.adminId,
      {
        accountStatus: newState.accountStatus,
        earningStatus: newState.earningStatus,
        visibilityStatus: newState.visibilityStatus as any,
        messagingStatus: newState.messagingStatus as any,
        reasons: [reason],
        notes: `Updated by admin: ${admin.email}`,
      }
    );

    // Write audit log
    await writeAuditLog({
      admin,
      targetType: 'ENFORCEMENT_STATE',
      targetId: userId,
      action: 'ENFORCEMENT_UPDATE',
      severity: newState.accountStatus === 'BANNED' ? 'CRITICAL' : 'HIGH',
      before: currentState,
      after: result.enforcementState,
      userId,
      reason,
    });

    res.json({ success: true, enforcementState: result.enforcementState });
  } catch (error: any) {
    console.error('[Admin Console] Error in adminEnforcementUpdate:', error);
    
    if (error.code) {
      res.status(error.code === 'unauthenticated' ? 401 : 403).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// ============================================================================
// AML STATUS UPDATE
// ============================================================================

/**
 * POST /admin/aml/set-status
 * Update AML status for a user
 */
export const adminAmlSetStatus = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const admin = await requireAdmin(req, 'canEditAmlStatus');
    const body = req.body as AmlStatusUpdateRequest;
    const { userId, status, statusReason } = body;

    if (!userId || !status) {
      res.status(400).json({ error: 'userId and status are required' });
      return;
    }

    const validStatuses = ['NORMAL', 'UNDER_REVIEW', 'RESTRICTED', 'BLOCK_PAYOUTS', 'BLOCK_EARNINGS'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    // Get current AML profile for audit log
    const amlDoc = await db.collection('aml_profiles').doc(userId).get();
    const currentStatus = amlDoc.exists ? amlDoc.data()?.status : 'NORMAL';

    const now = serverTimestamp();

    // Update AML profile
    await db.collection('aml_profiles').doc(userId).set(
      {
        userId,
        status,
        statusReason: statusReason || null,
        lastStatusUpdatedAt: now,
        lastStatusUpdatedBy: admin.adminId,
        updatedAt: now,
      },
      { merge: true }
    );

    // Write audit log
    await writeAuditLog({
      admin,
      targetType: 'AML_PROFILE',
      targetId: userId,
      action: 'AML_STATUS_UPDATE',
      severity: status === 'BLOCK_PAYOUTS' || status === 'BLOCK_EARNINGS' ? 'HIGH' : 'WARN',
      before: { status: currentStatus },
      after: { status },
      userId,
      reason: statusReason || 'AML status updated by admin',
    });

    // Apply enforcement actions if needed
    if (status === 'BLOCK_PAYOUTS' || status === 'BLOCK_EARNINGS') {
      await applyEnforcement(
        userId,
        admin.adminId,
        {
          earningStatus: status === 'BLOCK_EARNINGS' ? 'EARN_DISABLED' : undefined,
          reasons: [`AML: ${status}`],
          notes: statusReason || 'AML block applied',
        }
      );
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Admin Console] Error in adminAmlSetStatus:', error);
    
    if (error.code) {
      res.status(error.code === 'unauthenticated' ? 401 : 403).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// ============================================================================
// DISPUTE RESOLUTION
// ============================================================================

/**
 * POST /admin/disputes/resolve
 * Resolve a dispute
 */
export const adminDisputesResolve = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const admin = await requireAdmin(req, 'canResolveDisputes');
    const body = req.body as DisputeResolveRequest;
    const { disputeId, resolution } = body;

    if (!disputeId || !resolution || !resolution.outcome) {
      res.status(400).json({ error: 'disputeId and resolution.outcome are required' });
      return;
    }

    // Get dispute
    const disputeDoc = await db.collection('disputes').doc(disputeId).get();
    
    if (!disputeDoc.exists) {
      res.status(404).json({ error: 'Dispute not found' });
      return;
    }

    const disputeData = disputeDoc.data();
    const now = serverTimestamp();

    // Update dispute with resolution
    await db.collection('disputes').doc(disputeId).update({
      status: 'RESOLVED',
      resolution: {
        outcome: resolution.outcome,
        resolvedBy: admin.adminId,
        resolvedAt: now,
        notes: resolution.notes || null,
      },
      updatedAt: now,
    });

    // Write audit log
    await writeAuditLog({
      admin,
      targetType: 'DISPUTE',
      targetId: disputeId,
      action: 'DISPUTE_DECISION',
      severity: 'HIGH',
      before: { status: disputeData?.status },
      after: { status: 'RESOLVED', outcome: resolution.outcome },
      userId: disputeData?.createdByUserId,
      reason: resolution.notes || 'Dispute resolved by admin',
    });

    // TODO: Apply resolution actions (refunds, releases, etc.)
    // This would integrate with existing dispute/escrow/payout modules

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Admin Console] Error in adminDisputesResolve:', error);
    
    if (error.code) {
      res.status(error.code === 'unauthenticated' ? 401 : 403).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// ============================================================================
// PAYOUT DECISIONS
// ============================================================================

/**
 * POST /admin/payouts/decision
 * Approve or reject a payout request
 */
export const adminPayoutsDecision = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const admin = await requireAdmin(req, 'canApprovePayouts');
    const body = req.body as PayoutDecisionRequest;
    const { payoutRequestId, decision, reason } = body;

    if (!payoutRequestId || !decision) {
      res.status(400).json({ error: 'payoutRequestId and decision are required' });
      return;
    }

    if (!['APPROVE', 'REJECT'].includes(decision)) {
      res.status(400).json({ error: 'Invalid decision' });
      return;
    }

    // Get payout request
    const payoutDoc = await db.collection('payout_requests').doc(payoutRequestId).get();
    
    if (!payoutDoc.exists) {
      res.status(404).json({ error: 'Payout request not found' });
      return;
    }

    const payoutData = payoutDoc.data();
    const now = serverTimestamp();

    // Update payout request
    const newStatus = decision === 'APPROVE' ? 'PROCESSING' : 'CANCELLED';
    
    await db.collection('payout_requests').doc(payoutRequestId).update({
      status: newStatus,
      adminDecision: {
        decision,
        decidedBy: admin.adminId,
        decidedAt: now,
        reason: reason || null,
      },
      updatedAt: now,
    });

    // If rejected, return tokens to user
    if (decision === 'REJECT' && payoutData) {
      await db.collection('creator_earnings').doc(payoutData.userId).update({
        tokensPaidOut: db.collection('creator_earnings').doc(payoutData.userId).get().then(doc => {
          const current = doc.data()?.tokensPaidOut || 0;
          return Math.max(0, current - (payoutData.tokensRequested || 0));
        }),
        updatedAt: now,
      });
    }

    // Write audit log
    await writeAuditLog({
      admin,
      targetType: 'PAYOUT',
      targetId: payoutRequestId,
      action: 'PAYOUT_DECISION',
      severity: 'HIGH',
      before: { status: payoutData?.status },
      after: { status: newStatus, decision },
      userId: payoutData?.userId,
      reason: reason || `Payout ${decision.toLowerCase()}ed by admin`,
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Admin Console] Error in adminPayoutsDecision:', error);
    
    if (error.code) {
      res.status(error.code === 'unauthenticated' ? 401 : 403).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// ============================================================================
// PROMOTION MANAGEMENT
// ============================================================================

/**
 * POST /admin/promotions/set-status
 * Update promotion campaign status
 */
export const adminPromotionsSetStatus = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const admin = await requireAdmin(req, 'canManagePromotions');
    const body = req.body as PromotionStatusUpdateRequest;
    const { campaignId, status, reason } = body;

    if (!campaignId || !status) {
      res.status(400).json({ error: 'campaignId and status are required' });
      return;
    }

    const validStatuses = ['ACTIVE', 'PAUSED', 'ENDED'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    // Get campaign
    const campaignDoc = await db.collection('promotion_campaigns').doc(campaignId).get();
    
    if (!campaignDoc.exists) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const campaignData = campaignDoc.data();
    const now = serverTimestamp();

    // Update campaign status
    await db.collection('promotion_campaigns').doc(campaignId).update({
      status,
      adminNote: reason || null,
      lastAdminAction: {
        action: 'STATUS_UPDATE',
        performedBy: admin.adminId,
        performedAt: now,
      },
      updatedAt: now,
    });

    // Write audit log
    await writeAuditLog({
      admin,
      targetType: 'PROMOTION_CAMPAIGN',
      targetId: campaignId,
      action: 'PROMOTION_STATUS_UPDATE',
      severity: status === 'ENDED' ? 'WARN' : 'INFO',
      before: { status: campaignData?.status },
      after: { status },
      userId: campaignData?.ownerUserId,
      reason: reason || 'Campaign status updated by admin',
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Admin Console] Error in adminPromotionsSetStatus:', error);
    
    if (error.code) {
      res.status(error.code === 'unauthenticated' ? 401 : 403).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// ============================================================================
// DELETION REVIEW (GDPR)
// ============================================================================

/**
 * POST /admin/deletion/review
 * Review and approve/reject deletion request
 */
export const adminDeletionReview = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const admin = await requireAdmin(req, 'canReviewDeletionRequests');
    const body = req.body as DeletionReviewRequest;
    const { jobId, action, internalNote, rejectionReason } = body;

    if (!jobId || !action) {
      res.status(400).json({ error: 'jobId and action are required' });
      return;
    }

    if (!['APPROVE', 'REJECT'].includes(action)) {
      res.status(400).json({ error: 'Invalid action' });
      return;
    }

    // Get deletion request
    const deletionDoc = await db.collection('privacyRequests').doc(jobId).get();
    
    if (!deletionDoc.exists) {
      res.status(404).json({ error: 'Deletion request not found' });
      return;
    }

    const deletionData = deletionDoc.data();
    const now = serverTimestamp();

    // Update deletion request
    const updates: any = {
      adminReview: {
        reviewedBy: admin.adminId,
        reviewedAt: now,
        action,
        internalNote: internalNote || null,
      },
      updatedAt: now,
    };

    if (action === 'REJECT') {
      updates.status = 'cancelled';
      updates.cancellationReason = rejectionReason || 'Rejected by admin';
    } else {
      // Approved - will be processed by scheduled job
      updates.adminApproved = true;
    }

    await db.collection('privacyRequests').doc(jobId).update(updates);

    // Write audit log
    await writeAuditLog({
      admin,
      targetType: 'DELETION_JOB',
      targetId: jobId,
      action: 'DELETION_REVIEW',
      severity: 'HIGH',
      before: { status: deletionData?.status },
      after: { action },
      userId: deletionData?.uid,
      reason: action === 'REJECT' ? rejectionReason : internalNote || 'Deletion request reviewed',
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Admin Console] Error in adminDeletionReview:', error);
    
    if (error.code) {
      res.status(error.code === 'unauthenticated' ? 401 : 403).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// ============================================================================
// AUDIT LOG SEARCH
// ============================================================================

/**
 * POST /admin/audit/search
 * Search and filter audit logs
 */
export const adminAuditSearch = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // Require admin (any admin can view audit logs)
    const admin = await requireAdmin(req, 'canViewUsers');

    const body = req.body as AuditSearchRequest;

    // Query audit logs using audit logger
    const result = await queryAuditLogs(body);

    res.json(result);
  } catch (error: any) {
    console.error('[Admin Console] Error in adminAuditSearch:', error);
    
    if (error.code) {
      res.status(error.code === 'unauthenticated' ? 401 : 403).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});