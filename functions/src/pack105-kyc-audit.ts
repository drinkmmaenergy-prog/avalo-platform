/**
 * PACK 105 — KYC Audit Records System
 * 
 * Legal-grade documentation of KYC approvals/rejections
 * Integrates with existing KYC system (functions/src/kyc.ts)
 * 
 * Business Rules:
 * - Every KYC review must create an audit record
 * - Documents stored encrypted, not in Firestore
 * - Reason codes required for rejections
 * - Audit trail is immutable
 */

import { db, serverTimestamp, generateId } from './init';
import { logger } from 'firebase-functions/v2';
import { Timestamp } from 'firebase-admin/firestore';
import {
  KycAuditRecord,
  KycAuditStatus,
  KycReasonCode,
} from './pack105-types';
import {
  logKycSubmitted,
  logKycApproved,
  logKycRejected,
  logKycBlocked,
} from './pack105-audit-logger';

// ============================================================================
// KYC AUDIT RECORD CREATION
// ============================================================================

/**
 * Create KYC audit record when KYC is submitted
 */
export async function createKycAuditRecord(params: {
  userId: string;
  documentId: string;
  documentSetId: string;
  documentType: string;
  country: string;
}): Promise<string> {
  const id = generateId();

  const auditRecord: Omit<KycAuditRecord, 'createdAt'> & { createdAt: any } = {
    id,
    userId: params.userId,
    documentId: params.documentId,
    status: 'PENDING',
    documentSetId: params.documentSetId,
    reasonCodes: [],
    createdAt: serverTimestamp(),
    metadata: {
      documentType: params.documentType,
      country: params.country,
    },
  };

  try {
    await db.collection('kyc_audit_records').doc(id).set(auditRecord);

    await logKycSubmitted({
      userId: params.userId,
      documentId: params.documentId,
      documentType: params.documentType,
      country: params.country,
    });

    logger.info('[KycAudit] Created audit record', {
      id,
      userId: params.userId,
      documentId: params.documentId,
    });

    return id;
  } catch (error: any) {
    logger.error('[KycAudit] Failed to create audit record', {
      error: error.message,
      userId: params.userId,
    });
    throw error;
  }
}

/**
 * Update KYC audit record when reviewed
 */
export async function updateKycAuditRecordOnReview(params: {
  documentId: string;
  status: KycAuditStatus;
  reviewerId: string;
  reasonCodes?: KycReasonCode[];
  reviewNotes?: string;
  riskScore?: number;
  complianceChecks?: string[];
}): Promise<void> {
  try {
    const snapshot = await db
      .collection('kyc_audit_records')
      .where('documentId', '==', params.documentId)
      .where('status', '==', 'PENDING')
      .limit(1)
      .get();

    if (snapshot.empty) {
      throw new Error(`No pending KYC audit record found for document ${params.documentId}`);
    }

    const auditDoc = snapshot.docs[0];
    const auditData = auditDoc.data() as KycAuditRecord;

    const updateData: any = {
      status: params.status,
      reviewerId: params.reviewerId,
      reasonCodes: params.reasonCodes || [],
      reviewNotes: params.reviewNotes,
      reviewedAt: serverTimestamp(),
      metadata: {
        ...auditData.metadata,
        riskScore: params.riskScore,
        complianceChecks: params.complianceChecks,
      },
    };

    await auditDoc.ref.update(updateData);

    if (params.status === 'APPROVED') {
      await logKycApproved({
        userId: auditData.userId,
        documentId: params.documentId,
        reviewerId: params.reviewerId,
      });
    } else if (params.status === 'REJECTED') {
      await logKycRejected({
        userId: auditData.userId,
        documentId: params.documentId,
        reviewerId: params.reviewerId,
        reason: params.reviewNotes || 'Document verification failed',
        reasonCodes: params.reasonCodes || [],
      });
    } else if (params.status === 'BLOCKED') {
      await logKycBlocked({
        userId: auditData.userId,
        reviewerId: params.reviewerId,
        reason: params.reviewNotes || 'Account blocked from payouts',
      });
    }

    logger.info('[KycAudit] Updated audit record', {
      documentId: params.documentId,
      status: params.status,
      reviewerId: params.reviewerId,
    });
  } catch (error: any) {
    logger.error('[KycAudit] Failed to update audit record', {
      error: error.message,
      documentId: params.documentId,
    });
    throw error;
  }
}

// ============================================================================
// QUERY KYC AUDIT RECORDS
// ============================================================================

/**
 * Get KYC audit records for a user
 */
export async function getKycAuditRecordsForUser(
  userId: string,
  options?: {
    status?: KycAuditStatus;
    limit?: number;
  }
): Promise<KycAuditRecord[]> {
  try {
    let query: FirebaseFirestore.Query = db
      .collection('kyc_audit_records')
      .where('userId', '==', userId);

    if (options?.status) {
      query = query.where('status', '==', options.status);
    }

    query = query.orderBy('createdAt', 'desc');

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => doc.data() as KycAuditRecord);
  } catch (error: any) {
    logger.error('[KycAudit] Failed to get user audit records', {
      error: error.message,
      userId,
    });
    throw error;
  }
}

/**
 * Get KYC audit record by document ID
 */
export async function getKycAuditRecordByDocumentId(
  documentId: string
): Promise<KycAuditRecord | null> {
  try {
    const snapshot = await db
      .collection('kyc_audit_records')
      .where('documentId', '==', documentId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return snapshot.docs[0].data() as KycAuditRecord;
  } catch (error: any) {
    logger.error('[KycAudit] Failed to get audit record by document ID', {
      error: error.message,
      documentId,
    });
    throw error;
  }
}

/**
 * Get pending KYC audit records (for review queue)
 */
export async function getPendingKycAuditRecords(
  limit: number = 50
): Promise<KycAuditRecord[]> {
  try {
    const snapshot = await db
      .collection('kyc_audit_records')
      .where('status', '==', 'PENDING')
      .orderBy('createdAt', 'asc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => doc.data() as KycAuditRecord);
  } catch (error: any) {
    logger.error('[KycAudit] Failed to get pending audit records', {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get KYC review backlog metrics
 */
export async function getKycReviewBacklogMetrics(): Promise<{
  pendingCount: number;
  oldestPendingDays: number;
  avgReviewTimeDays: number;
}> {
  try {
    const pendingSnapshot = await db
      .collection('kyc_audit_records')
      .where('status', '==', 'PENDING')
      .orderBy('createdAt', 'asc')
      .get();

    const pendingCount = pendingSnapshot.size;
    let oldestPendingDays = 0;

    if (!pendingSnapshot.empty) {
      const oldestDoc = pendingSnapshot.docs[0];
      const oldestData = oldestDoc.data() as KycAuditRecord;
      const now = Date.now();
      const createdAt = oldestData.createdAt.toMillis();
      oldestPendingDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
    }

    const sevenDaysAgo = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const reviewedSnapshot = await db
      .collection('kyc_audit_records')
      .where('reviewedAt', '>=', sevenDaysAgo)
      .get();

    let totalReviewTime = 0;
    let reviewCount = 0;

    reviewedSnapshot.forEach(doc => {
      const data = doc.data() as KycAuditRecord;
      if (data.reviewedAt) {
        const reviewTime = data.reviewedAt.toMillis() - data.createdAt.toMillis();
        totalReviewTime += reviewTime;
        reviewCount++;
      }
    });

    const avgReviewTimeDays = reviewCount > 0
      ? Math.floor(totalReviewTime / reviewCount / (1000 * 60 * 60 * 24))
      : 0;

    return {
      pendingCount,
      oldestPendingDays,
      avgReviewTimeDays,
    };
  } catch (error: any) {
    logger.error('[KycAudit] Failed to get backlog metrics', {
      error: error.message,
    });
    throw error;
  }
}

// ============================================================================
// COMPLIANCE REPORTS
// ============================================================================

/**
 * Generate KYC compliance report for a date range
 */
export async function generateKycComplianceReport(params: {
  startDate: Date;
  endDate: Date;
}): Promise<{
  period: { startDate: string; endDate: string };
  submissions: number;
  approved: number;
  rejected: number;
  blocked: number;
  pending: number;
  topRejectionReasons: Array<{ code: string; count: number }>;
  avgReviewTimeDays: number;
}> {
  try {
    const snapshot = await db
      .collection('kyc_audit_records')
      .where('createdAt', '>=', Timestamp.fromDate(params.startDate))
      .where('createdAt', '<=', Timestamp.fromDate(params.endDate))
      .get();

    let approved = 0;
    let rejected = 0;
    let blocked = 0;
    let pending = 0;
    const rejectionReasons: Record<string, number> = {};
    let totalReviewTime = 0;
    let reviewCount = 0;

    snapshot.forEach(doc => {
      const data = doc.data() as KycAuditRecord;

      switch (data.status) {
        case 'APPROVED':
          approved++;
          break;
        case 'REJECTED':
          rejected++;
          data.reasonCodes.forEach(code => {
            rejectionReasons[code] = (rejectionReasons[code] || 0) + 1;
          });
          break;
        case 'BLOCKED':
          blocked++;
          break;
        case 'PENDING':
          pending++;
          break;
      }

      if (data.reviewedAt) {
        const reviewTime = data.reviewedAt.toMillis() - data.createdAt.toMillis();
        totalReviewTime += reviewTime;
        reviewCount++;
      }
    });

    const topRejectionReasons = Object.entries(rejectionReasons)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const avgReviewTimeDays = reviewCount > 0
      ? Math.floor(totalReviewTime / reviewCount / (1000 * 60 * 60 * 24))
      : 0;

    logger.info('[KycAudit] Generated compliance report', {
      submissions: snapshot.size,
      approved,
      rejected,
    });

    return {
      period: {
        startDate: params.startDate.toISOString(),
        endDate: params.endDate.toISOString(),
      },
      submissions: snapshot.size,
      approved,
      rejected,
      blocked,
      pending,
      topRejectionReasons,
      avgReviewTimeDays,
    };
  } catch (error: any) {
    logger.error('[KycAudit] Failed to generate compliance report', {
      error: error.message,
    });
    throw error;
  }
}