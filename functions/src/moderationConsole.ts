/**
 * PACK 88 — Moderator Console Cloud Functions
 * Admin-facing APIs for case management
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  ModerationCase,
  ModerationCaseNote,
  CaseStatus,
  ListCasesFilters,
  ListCasesPagination,
  ListCasesResponse,
  CaseDetailsResponse,
  UpdateCaseStatusPayload,
  AssignCasePayload,
  AddCaseNotePayload,
  ApproveKycFromCasePayload,
  RejectKycFromCasePayload,
  SetPayoutStatusFromCasePayload,
  UpdateDisputeFromCasePayload,
  SetEnforcementFromCasePayload,
} from './types/moderation.types';
import {
  isAdmin,
  createAuditLog,
  isValidStatusTransition,
  COLLECTIONS,
} from './moderationUtils';
import { updateCaseStatus, updateCaseLastAction } from './moderationCaseHooks';

// Import functions from other modules
import { setManualEnforcementState } from './enforcementEngine';
import { updateDisputeStatus } from './disputes';

// ============================================================================
// CASE LISTING & FILTERING
// ============================================================================

/**
 * List cases with filtering and pagination
 */
export const admin_listCases = onCall(
  { region: 'europe-west3' },
  async (request): Promise<ListCasesResponse> => {
    // Verify admin auth
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const adminId = request.auth.uid;
    const isAdminUser = await isAdmin(adminId);

    if (!isAdminUser) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    try {
      const filters: ListCasesFilters = request.data.filters || {};
      const pagination: ListCasesPagination = request.data.pagination || {};
      const limit = Math.min(pagination.limit || 50, 100);

      // Build query
      let query = db.collection(COLLECTIONS.MODERATION_CASES) as any;

      // Apply filters
      if (filters.type) {
        query = query.where('type', '==', filters.type);
      }
      if (filters.status) {
        query = query.where('status', '==', filters.status);
      }
      if (filters.subjectUserId) {
        query = query.where('subjectUserId', '==', filters.subjectUserId);
      }
      if (filters.priority) {
        query = query.where('priority', '==', filters.priority);
      }
      if (filters.assignedTo) {
        query = query.where('assignedTo', '==', filters.assignedTo);
      }

      // Order by createdAt (most recent first)
      query = query.orderBy('createdAt', 'desc');

      // Handle pagination
      if (pagination.pageToken) {
        const tokenDoc = await db.collection(COLLECTIONS.MODERATION_CASES).doc(pagination.pageToken).get();
        if (tokenDoc.exists) {
          query = query.startAfter(tokenDoc);
        }
      }

      // Fetch one extra to determine if there are more
      const snapshot = await query.limit(limit + 1).get();

      const cases: ModerationCase[] = [];
      let hasMore = false;
      let nextPageToken: string | undefined;

      snapshot.docs.forEach((doc: any, index: number) => {
        if (index < limit) {
          cases.push({ id: doc.id, ...doc.data() } as ModerationCase);
        } else {
          hasMore = true;
          nextPageToken = doc.id;
        }
      });

      // Get total count (without filters for simplicity, or with filters if needed)
      let countQuery = db.collection(COLLECTIONS.MODERATION_CASES) as any;
      if (filters.type) countQuery = countQuery.where('type', '==', filters.type);
      if (filters.status) countQuery = countQuery.where('status', '==', filters.status);
      if (filters.subjectUserId) countQuery = countQuery.where('subjectUserId', '==', filters.subjectUserId);

      const countSnapshot = await countQuery.count().get();
      const total = countSnapshot.data().count;

      logger.info(`[ModerationConsole] Admin ${adminId} listed cases`, { total, filters });

      return {
        cases,
        total,
        hasMore,
        nextPageToken,
      };
    } catch (error: any) {
      logger.error('[ModerationConsole] Error listing cases:', error);
      throw new HttpsError('internal', `Failed to list cases: ${error.message}`);
    }
  }
);

// ============================================================================
// CASE DETAILS
// ============================================================================

/**
 * Get detailed case information including underlying data
 */
export const admin_getCaseDetails = onCall(
  { region: 'europe-west3' },
  async (request): Promise<CaseDetailsResponse> => {
    // Verify admin auth
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const adminId = request.auth.uid;
    const isAdminUser = await isAdmin(adminId);

    if (!isAdminUser) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { caseId } = request.data;

    if (!caseId) {
      throw new HttpsError('invalid-argument', 'caseId is required');
    }

    try {
      // Get case
      const caseDoc = await db.collection(COLLECTIONS.MODERATION_CASES).doc(caseId).get();

      if (!caseDoc.exists) {
        throw new HttpsError('not-found', 'Case not found');
      }

      const caseData = { id: caseDoc.id, ...caseDoc.data() } as ModerationCase;

      // Get underlying data based on type
      let underlyingData: any = null;

      switch (caseData.type) {
        case 'KYC': {
          // Get KYC document and status
          const kycDocDoc = await db.collection('user_kyc_documents').doc(caseData.sourceId).get();
          const kycStatusDoc = await db.collection('user_kyc_status').doc(caseData.subjectUserId).get();
          
          underlyingData = {
            kycDocument: kycDocDoc.exists ? { id: kycDocDoc.id, ...kycDocDoc.data() } : null,
            kycStatus: kycStatusDoc.exists ? kycStatusDoc.data() : null,
          };
          break;
        }

        case 'PAYOUT': {
          // Get payout request and creator balance
          const payoutDoc = await db.collection('payout_requests').doc(caseData.sourceId).get();
          const balanceDoc = await db.collection('creator_balances').doc(caseData.subjectUserId).get();
          const methodId = payoutDoc.data()?.methodId;
          let payoutMethod = null;
          
          if (methodId) {
            const methodDoc = await db.collection('payout_methods').doc(methodId).get();
            payoutMethod = methodDoc.exists ? { id: methodDoc.id, ...methodDoc.data() } : null;
          }
          
          underlyingData = {
            payoutRequest: payoutDoc.exists ? { id: payoutDoc.id, ...payoutDoc.data() } : null,
            creatorBalance: balanceDoc.exists ? balanceDoc.data() : null,
            payoutMethod,
          };
          break;
        }

        case 'DISPUTE': {
          // Get dispute details
          const disputeDoc = await db.collection('disputes').doc(caseData.sourceId).get();
          const disputeData = disputeDoc.exists ? disputeDoc.data() : null;
          
          // Get related transaction if exists
          let relatedTransaction = null;
          if (disputeData?.earningEventId) {
            const txDoc = await db.collection('token_earn_events').doc(disputeData.earningEventId).get();
            relatedTransaction = txDoc.exists ? { id: txDoc.id, ...txDoc.data() } : null;
          }
          
          underlyingData = {
            dispute: disputeDoc.exists ? { id: disputeDoc.id, ...disputeData } : null,
            relatedTransaction,
          };
          break;
        }

        case 'TRUST_REVIEW': {
          // Get trust profile and recent events
          const trustDoc = await db.collection('user_trust_profile').doc(caseData.subjectUserId).get();
          const eventsSnapshot = await db
            .collection('trust_events')
            .where('userId', '==', caseData.subjectUserId)
            .orderBy('createdAt', 'desc')
            .limit(10)
            .get();
          
          underlyingData = {
            trustProfile: trustDoc.exists ? trustDoc.data() : null,
            recentEvents: eventsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
          };
          break;
        }

        case 'ENFORCEMENT': {
          // Get enforcement state
          const enforcementDoc = await db.collection('user_enforcement_state').doc(caseData.subjectUserId).get();
          
          underlyingData = {
            enforcementState: enforcementDoc.exists ? enforcementDoc.data() : null,
          };
          break;
        }
      }

      // Get case notes
      const notesSnapshot = await db
        .collection(COLLECTIONS.MODERATION_CASE_NOTES)
        .where('caseId', '==', caseId)
        .orderBy('createdAt', 'desc')
        .get();

      const notes: ModerationCaseNote[] = notesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as ModerationCaseNote[];

      logger.info(`[ModerationConsole] Admin ${adminId} viewed case ${caseId}`);

      return {
        case: caseData,
        underlyingData,
        notes,
      };
    } catch (error: any) {
      logger.error('[ModerationConsole] Error getting case details:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to get case details: ${error.message}`);
    }
  }
);

// ============================================================================
// CASE STATUS MANAGEMENT
// ============================================================================

/**
 * Update case status
 */
export const admin_updateCaseStatus = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    // Verify admin auth
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const adminId = request.auth.uid;
    const isAdminUser = await isAdmin(adminId);

    if (!isAdminUser) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const payload: UpdateCaseStatusPayload = request.data;

    if (!payload.caseId || !payload.newStatus) {
      throw new HttpsError('invalid-argument', 'caseId and newStatus are required');
    }

    try {
      // Get current case
      const caseDoc = await db.collection(COLLECTIONS.MODERATION_CASES).doc(payload.caseId).get();

      if (!caseDoc.exists) {
        throw new HttpsError('not-found', 'Case not found');
      }

      const caseData = caseDoc.data() as ModerationCase;

      // Validate status transition
      if (!isValidStatusTransition(caseData.status, payload.newStatus)) {
        throw new HttpsError(
          'failed-precondition',
          `Invalid status transition from ${caseData.status} to ${payload.newStatus}`
        );
      }

      // Update case
      await updateCaseStatus(payload.caseId, payload.newStatus);

      // Create audit log
      await createAuditLog(
        adminId,
        caseData.subjectUserId,
        'CASE_STATUS_UPDATED',
        {
          fromStatus: caseData.status,
          toStatus: payload.newStatus,
        },
        payload.caseId
      );

      logger.info(`[ModerationConsole] Admin ${adminId} updated case ${payload.caseId} status to ${payload.newStatus}`);

      return { success: true };
    } catch (error: any) {
      logger.error('[ModerationConsole] Error updating case status:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to update case status: ${error.message}`);
    }
  }
);

// ============================================================================
// CASE ASSIGNMENT
// ============================================================================

/**
 * Assign case to admin
 */
export const admin_assignCase = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    // Verify admin auth
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const adminId = request.auth.uid;
    const isAdminUser = await isAdmin(adminId);

    if (!isAdminUser) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const payload: AssignCasePayload = request.data;

    if (!payload.caseId || !payload.adminId) {
      throw new HttpsError('invalid-argument', 'caseId and adminId are required');
    }

    try {
      // Verify target admin exists
      const targetIsAdmin = await isAdmin(payload.adminId);
      if (!targetIsAdmin) {
        throw new HttpsError('invalid-argument', 'Target user is not an admin');
      }

      // Get case
      const caseDoc = await db.collection(COLLECTIONS.MODERATION_CASES).doc(payload.caseId).get();

      if (!caseDoc.exists) {
        throw new HttpsError('not-found', 'Case not found');
      }

      const caseData = caseDoc.data() as ModerationCase;

      // Update case assignment
      await db.collection(COLLECTIONS.MODERATION_CASES).doc(payload.caseId).update({
        assignedTo: payload.adminId,
        status: caseData.status === 'OPEN' ? 'IN_PROGRESS' : caseData.status,
        updatedAt: serverTimestamp(),
      });

      // Create audit log
      await createAuditLog(
        adminId,
        caseData.subjectUserId,
        'CASE_ASSIGNED',
        {
          assignedTo: payload.adminId,
        },
        payload.caseId
      );

      logger.info(`[ModerationConsole] Admin ${adminId} assigned case ${payload.caseId} to ${payload.adminId}`);

      return { success: true };
    } catch (error: any) {
      logger.error('[ModerationConsole] Error assigning case:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to assign case: ${error.message}`);
    }
  }
);

// ============================================================================
// CASE NOTES
// ============================================================================

/**
 * Add note to case
 */
export const admin_addCaseNote = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ noteId: string }> => {
    // Verify admin auth
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const adminId = request.auth.uid;
    const isAdminUser = await isAdmin(adminId);

    if (!isAdminUser) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const payload: AddCaseNotePayload = request.data;

    if (!payload.caseId || !payload.content) {
      throw new HttpsError('invalid-argument', 'caseId and content are required');
    }

    try {
      // Verify case exists
      const caseDoc = await db.collection(COLLECTIONS.MODERATION_CASES).doc(payload.caseId).get();

      if (!caseDoc.exists) {
        throw new HttpsError('not-found', 'Case not found');
      }

      const caseData = caseDoc.data() as ModerationCase;

      // Create note
      const noteId = generateId();
      const note: ModerationCaseNote = {
        id: noteId,
        caseId: payload.caseId,
        authorId: adminId,
        content: payload.content,
        createdAt: serverTimestamp() as Timestamp,
      };

      await db.collection(COLLECTIONS.MODERATION_CASE_NOTES).doc(noteId).set(note);

      // Update case updatedAt
      await db.collection(COLLECTIONS.MODERATION_CASES).doc(payload.caseId).update({
        updatedAt: serverTimestamp(),
      });

      // Create audit log
      await createAuditLog(
        adminId,
        caseData.subjectUserId,
        'CASE_NOTE_ADDED',
        {
          noteLength: payload.content.length,
        },
        payload.caseId
      );

      logger.info(`[ModerationConsole] Admin ${adminId} added note to case ${payload.caseId}`);

      return { noteId };
    } catch (error: any) {
      logger.error('[ModerationConsole] Error adding case note:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to add case note: ${error.message}`);
    }
  }
);

// ============================================================================
// KYC CASE ACTIONS
// ============================================================================

/**
 * Approve KYC from case
 */
export const admin_approveKycFromCase = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    // Verify admin auth
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const adminId = request.auth.uid;
    const isAdminUser = await isAdmin(adminId);

    if (!isAdminUser) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const payload: ApproveKycFromCasePayload = request.data;

    if (!payload.caseId) {
      throw new HttpsError('invalid-argument', 'caseId is required');
    }

    try {
      // Get case
      const caseDoc = await db.collection(COLLECTIONS.MODERATION_CASES).doc(payload.caseId).get();

      if (!caseDoc.exists) {
        throw new HttpsError('not-found', 'Case not found');
      }

      const caseData = caseDoc.data() as ModerationCase;

      if (caseData.type !== 'KYC') {
        throw new HttpsError('failed-precondition', 'Case is not a KYC case');
      }

      // Get KYC document
      const docRef = db.collection('user_kyc_documents').doc(caseData.sourceId);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        throw new HttpsError('not-found', 'KYC document not found');
      }

      const document = docSnap.data();

      if (document?.status !== 'PENDING') {
        throw new HttpsError('failed-precondition', `Document has already been reviewed (status: ${document?.status})`);
      }

      const now = serverTimestamp();

      // Update document and status atomically
      const batch = db.batch();

      // Update document to APPROVED
      batch.update(docRef, {
        status: 'APPROVED',
        reviewedAt: now,
        reviewerId: adminId,
      });

      // Update user KYC status to VERIFIED
      batch.set(db.collection('user_kyc_status').doc(caseData.subjectUserId), {
        userId: caseData.subjectUserId,
        status: 'VERIFIED',
        level: 'BASIC',
        lastUpdatedAt: now,
        reviewerId: adminId,
      });

      // Update case
      batch.update(db.collection(COLLECTIONS.MODERATION_CASES).doc(payload.caseId), {
        status: 'RESOLVED',
        lastAction: 'KYC_APPROVED',
        updatedAt: now,
      });

      await batch.commit();

      // Create audit log
      await createAuditLog(
        adminId,
        caseData.subjectUserId,
        'KYC_APPROVED',
        {
          documentId: caseData.sourceId,
        },
        payload.caseId
      );

      logger.info(`[ModerationConsole] Admin ${adminId} approved KYC for user ${caseData.subjectUserId}`);

      return { success: true };
    } catch (error: any) {
      logger.error('[ModerationConsole] Error approving KYC:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to approve KYC: ${error.message}`);
    }
  }
);

/**
 * Reject KYC from case
 */
export const admin_rejectKycFromCase = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    // Verify admin auth
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const adminId = request.auth.uid;
    const isAdminUser = await isAdmin(adminId);

    if (!isAdminUser) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const payload: RejectKycFromCasePayload = request.data;

    if (!payload.caseId || !payload.reason) {
      throw new HttpsError('invalid-argument', 'caseId and reason are required');
    }

    try {
      // Get case
      const caseDoc = await db.collection(COLLECTIONS.MODERATION_CASES).doc(payload.caseId).get();

      if (!caseDoc.exists) {
        throw new HttpsError('not-found', 'Case not found');
      }

      const caseData = caseDoc.data() as ModerationCase;

      if (caseData.type !== 'KYC') {
        throw new HttpsError('failed-precondition', 'Case is not a KYC case');
      }

      // Get KYC document
      const docRef = db.collection('user_kyc_documents').doc(caseData.sourceId);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        throw new HttpsError('not-found', 'KYC document not found');
      }

      const document = docSnap.data();

      if (document?.status !== 'PENDING') {
        throw new HttpsError('failed-precondition', `Document has already been reviewed (status: ${document?.status})`);
      }

      const now = serverTimestamp();

      // Update document and status atomically
      const batch = db.batch();

      // Update document to REJECTED
      batch.update(docRef, {
        status: 'REJECTED',
        reviewedAt: now,
        reviewerId: adminId,
        rejectionReason: payload.reason,
      });

      // Update user KYC status to REJECTED
      batch.set(db.collection('user_kyc_status').doc(caseData.subjectUserId), {
        userId: caseData.subjectUserId,
        status: 'REJECTED',
        level: 'NONE',
        lastUpdatedAt: now,
        reviewerId: adminId,
        rejectionReason: payload.reason,
      });

      // Update case
      batch.update(db.collection(COLLECTIONS.MODERATION_CASES).doc(payload.caseId), {
        status: 'RESOLVED',
        lastAction: 'KYC_REJECTED',
        updatedAt: now,
      });

      await batch.commit();

      // Create audit log
      await createAuditLog(
        adminId,
        caseData.subjectUserId,
        'KYC_REJECTED',
        {
          documentId: caseData.sourceId,
          reason: payload.reason,
        },
        payload.caseId
      );

      logger.info(`[ModerationConsole] Admin ${adminId} rejected KYC for user ${caseData.subjectUserId}`);

      return { success: true };
    } catch (error: any) {
      logger.error('[ModerationConsole] Error rejecting KYC:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to reject KYC: ${error.message}`);
    }
  }
);

// ============================================================================
// PAYOUT CASE ACTIONS
// ============================================================================

/**
 * Set payout status from case
 */
export const admin_setPayoutStatusFromCase = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    // Verify admin auth
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const adminId = request.auth.uid;
    const isAdminUser = await isAdmin(adminId);

    if (!isAdminUser) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const payload: SetPayoutStatusFromCasePayload = request.data;

    if (!payload.caseId || !payload.newStatus) {
      throw new HttpsError('invalid-argument', 'caseId and newStatus are required');
    }

    try {
      // Get case
      const caseDoc = await db.collection(COLLECTIONS.MODERATION_CASES).doc(payload.caseId).get();

      if (!caseDoc.exists) {
        throw new HttpsError('not-found', 'Case not found');
      }

      const caseData = caseDoc.data() as ModerationCase;

      if (caseData.type !== 'PAYOUT') {
        throw new HttpsError('failed-precondition', 'Case is not a PAYOUT case');
      }

      // Get payout request
      const payoutRef = db.collection('payout_requests').doc(caseData.sourceId);
      const payoutSnap = await payoutRef.get();

      if (!payoutSnap.exists) {
        throw new HttpsError('not-found', 'Payout request not found');
      }

      const payoutData = payoutSnap.data();

      // Update payout status
      const updateData: any = {
        status: payload.newStatus,
        reviewedAt: serverTimestamp(),
        reviewerId: adminId,
        updatedAt: serverTimestamp(),
      };

      if (payload.reason) {
        updateData.notes = payload.reason;
      }

      // Handle rejection - refund tokens
      if (payload.newStatus === 'REJECTED') {
        if (!payload.reason) {
          throw new HttpsError('invalid-argument', 'Rejection reason is required');
        }

        const balanceRef = db.collection('creator_balances').doc(caseData.subjectUserId);

        await db.runTransaction(async (transaction) => {
          const balanceDoc = await transaction.get(balanceRef);
          
          if (balanceDoc.exists) {
            const currentBalance = balanceDoc.data()?.availableTokens || 0;
            transaction.update(balanceRef, {
              availableTokens: currentBalance + (payoutData?.requestedTokens || 0),
              updatedAt: serverTimestamp(),
            });
          }

          transaction.update(payoutRef, {
            ...updateData,
            rejectionReason: payload.reason,
          });

          // Update case
          transaction.update(db.collection(COLLECTIONS.MODERATION_CASES).doc(payload.caseId), {
            status: 'RESOLVED',
            lastAction: 'PAYOUT_REJECTED',
            updatedAt: serverTimestamp(),
          });
        });
      } else {
        // Other status updates
        await payoutRef.update(updateData);

        // Update case
        const caseStatus = payload.newStatus === 'PAID' ? 'RESOLVED' : 'IN_PROGRESS';
        await updateCaseStatus(payload.caseId, caseStatus, `PAYOUT_${payload.newStatus}`);
      }

      // Create audit log
      await createAuditLog(
        adminId,
        caseData.subjectUserId,
        payload.newStatus === 'APPROVED' ? 'PAYOUT_APPROVED' : 'PAYOUT_REJECTED',
        {
          payoutRequestId: caseData.sourceId,
          newStatus: payload.newStatus,
          reason: payload.reason,
        },
        payload.caseId
      );

      logger.info(`[ModerationConsole] Admin ${adminId} set payout ${caseData.sourceId} status to ${payload.newStatus}`);

      return { success: true };
    } catch (error: any) {
      logger.error('[ModerationConsole] Error setting payout status:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to set payout status: ${error.message}`);
    }
  }
);

// ============================================================================
// DISPUTE CASE ACTIONS
// ============================================================================

/**
 * Update dispute status from case
 */
export const admin_updateDisputeFromCase = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    // Verify admin auth
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const adminId = request.auth.uid;
    const isAdminUser = await isAdmin(adminId);

    if (!isAdminUser) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const payload: UpdateDisputeFromCasePayload = request.data;

    if (!payload.caseId || !payload.newStatus) {
      throw new HttpsError('invalid-argument', 'caseId and newStatus are required');
    }

    try {
      // Get case
      const caseDoc = await db.collection(COLLECTIONS.MODERATION_CASES).doc(payload.caseId).get();

      if (!caseDoc.exists) {
        throw new HttpsError('not-found', 'Case not found');
      }

      const caseData = caseDoc.data() as ModerationCase;

      if (caseData.type !== 'DISPUTE') {
        throw new HttpsError('failed-precondition', 'Case is not a DISPUTE case');
      }

      // Update dispute status
      await updateDisputeStatus(caseData.sourceId, payload.newStatus as any);

      // Update case
      const caseStatus = payload.newStatus === 'RESOLVED' ? 'RESOLVED' : 'IN_PROGRESS';
      await updateCaseStatus(payload.caseId, caseStatus, `DISPUTE_${payload.newStatus}`);

      // Add resolution summary if provided
      if (payload.resolutionSummary && payload.newStatus === 'RESOLVED') {
        await db.collection('disputes').doc(caseData.sourceId).update({
          userVisibleOutcomeMessage: payload.resolutionSummary,
        });
      }

      // Create audit log
      await createAuditLog(
        adminId,
        caseData.subjectUserId,
        'DISPUTE_RESOLVED',
        {
          disputeId: caseData.sourceId,
          newStatus: payload.newStatus,
          resolutionSummary: payload.resolutionSummary,
        },
        payload.caseId
      );

      logger.info(`[ModerationConsole] Admin ${adminId} updated dispute ${caseData.sourceId} status to ${payload.newStatus}`);

      return { success: true };
    } catch (error: any) {
      logger.error('[ModerationConsole] Error updating dispute:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to update dispute: ${error.message}`);
    }
  }
);

// ============================================================================
// ENFORCEMENT CASE ACTIONS
// ============================================================================

/**
 * Set enforcement state from case
 */
export const admin_setEnforcementFromCase = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    // Verify admin auth
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const adminId = request.auth.uid;
    const isAdminUser = await isAdmin(adminId);

    if (!isAdminUser) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const payload: SetEnforcementFromCasePayload = request.data;

    if (!payload.caseId || !payload.accountStatus || !payload.reviewNote) {
      throw new HttpsError('invalid-argument', 'caseId, accountStatus, and reviewNote are required');
    }

    try {
      // Get case
      const caseDoc = await db.collection(COLLECTIONS.MODERATION_CASES).doc(payload.caseId).get();

      if (!caseDoc.exists) {
        throw new HttpsError('not-found', 'Case not found');
      }

      const caseData = caseDoc.data() as ModerationCase;

      // Set manual enforcement state
      await setManualEnforcementState(caseData.subjectUserId, {
        accountStatus: payload.accountStatus as any,
        featureLocks: payload.featureLocks as any,
        visibilityTier: payload.visibilityTier as any,
        reasonCodes: payload.reasonCodes as any,
        reviewerId: adminId,
        reviewNote: payload.reviewNote,
      });

      // Update case
      await updateCaseStatus(payload.caseId, 'RESOLVED', `ENFORCEMENT_SET_${payload.accountStatus}`);

      // Create audit log (setManualEnforcementState already creates one, but we add case-specific one)
      await createAuditLog(
        adminId,
        caseData.subjectUserId,
        'ENFORCEMENT_SET',
        {
          accountStatus: payload.accountStatus,
          featureLocks: payload.featureLocks,
          visibilityTier: payload.visibilityTier,
          reasonCodes: payload.reasonCodes,
          reviewNote: payload.reviewNote,
        },
        payload.caseId
      );

      logger.info(`[ModerationConsole] Admin ${adminId} set enforcement for user ${caseData.subjectUserId}`);

      return { success: true };
    } catch (error: any) {
      logger.error('[ModerationConsole] Error setting enforcement:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to set enforcement: ${error.message}`);
    }
  }
);