/**
 * PACK 105 — Finance Cases Management
 * 
 * Handle reconciliation mismatches and financial discrepancies
 * 
 * Business Rules:
 * - Cases created automatically by reconciliation engine
 * - Manual admin assignment and resolution
 * - No automatic balance adjustments
 * - Requires human approval for all corrections
 */

import { db, serverTimestamp, generateId } from './init';
import { logger } from 'firebase-functions/v2';
import { Timestamp } from 'firebase-admin/firestore';
import {
  FinanceCase,
  FinanceCaseType,
  FinanceCaseStatus,
} from './pack105-types';
import { logBusinessAudit } from './pack105-audit-logger';

// ============================================================================
// FINANCE CASE CREATION
// ============================================================================

/**
 * Create a finance case for manual investigation
 */
export async function createFinanceCase(params: {
  type: FinanceCaseType;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason: string;
  subjectUserId?: string;
  evidenceRefs: string[];
  discrepancy?: {
    internal: number;
    external: number;
    difference: number;
    currency?: string;
  };
  metadata?: Record<string, any>;
}): Promise<string> {
  const caseId = generateId();

  const financeCase: Omit<FinanceCase, 'createdAt' | 'updatedAt'> & { 
    createdAt: any; 
    updatedAt: any;
  } = {
    caseId,
    type: params.type,
    status: 'OPEN',
    priority: params.priority,
    reason: params.reason,
    subjectUserId: params.subjectUserId,
    evidenceRefs: params.evidenceRefs,
    discrepancy: params.discrepancy,
    metadata: params.metadata || {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await db.collection('finance_cases').doc(caseId).set(financeCase);

    await logBusinessAudit({
      eventType: 'RECONCILIATION_MISMATCH',
      userId: params.subjectUserId,
      relatedId: caseId,
      context: {
        type: params.type,
        priority: params.priority,
        reason: params.reason,
        discrepancy: params.discrepancy,
      },
      source: 'finance_case_system',
    });

    logger.info('[FinanceCase] Created case', {
      caseId,
      type: params.type,
      priority: params.priority,
    });

    return caseId;
  } catch (error: any) {
    logger.error('[FinanceCase] Failed to create case', {
      error: error.message,
      type: params.type,
    });
    throw error;
  }
}

/**
 * Update finance case status
 */
export async function updateFinanceCaseStatus(
  caseId: string,
  status: FinanceCaseStatus,
  adminUid?: string
): Promise<void> {
  try {
    const caseRef = db.collection('finance_cases').doc(caseId);
    const caseSnap = await caseRef.get();

    if (!caseSnap.exists) {
      throw new Error(`Finance case ${caseId} not found`);
    }

    await caseRef.update({
      status,
      updatedAt: serverTimestamp(),
      ...(adminUid && { assignedTo: adminUid }),
    });

    logger.info('[FinanceCase] Updated case status', {
      caseId,
      status,
      adminUid,
    });
  } catch (error: any) {
    logger.error('[FinanceCase] Failed to update case status', {
      error: error.message,
      caseId,
    });
    throw error;
  }
}

/**
 * Assign finance case to admin
 */
export async function assignFinanceCase(
  caseId: string,
  adminUid: string
): Promise<void> {
  try {
    const caseRef = db.collection('finance_cases').doc(caseId);
    const caseSnap = await caseRef.get();

    if (!caseSnap.exists) {
      throw new Error(`Finance case ${caseId} not found`);
    }

    await caseRef.update({
      assignedTo: adminUid,
      status: 'INVESTIGATING',
      updatedAt: serverTimestamp(),
    });

    logger.info('[FinanceCase] Assigned case', {
      caseId,
      adminUid,
    });
  } catch (error: any) {
    logger.error('[FinanceCase] Failed to assign case', {
      error: error.message,
      caseId,
    });
    throw error;
  }
}

/**
 * Resolve finance case with action taken
 */
export async function resolveFinanceCase(params: {
  caseId: string;
  action: string;
  resolvedBy: string;
  notes: string;
}): Promise<void> {
  try {
    const caseRef = db.collection('finance_cases').doc(params.caseId);
    const caseSnap = await caseRef.get();

    if (!caseSnap.exists) {
      throw new Error(`Finance case ${params.caseId} not found`);
    }

    await caseRef.update({
      status: 'RESOLVED',
      resolution: {
        action: params.action,
        resolvedBy: params.resolvedBy,
        resolvedAt: serverTimestamp(),
        notes: params.notes,
      },
      updatedAt: serverTimestamp(),
      closedAt: serverTimestamp(),
    });

    const caseData = caseSnap.data() as FinanceCase;

    await logBusinessAudit({
      eventType: 'DISPUTE_RESOLVED',
      userId: params.resolvedBy,
      relatedId: params.caseId,
      context: {
        caseType: caseData.type,
        action: params.action,
        notes: params.notes,
      },
      source: 'finance_case_system',
    });

    logger.info('[FinanceCase] Resolved case', {
      caseId: params.caseId,
      action: params.action,
      resolvedBy: params.resolvedBy,
    });
  } catch (error: any) {
    logger.error('[FinanceCase] Failed to resolve case', {
      error: error.message,
      caseId: params.caseId,
    });
    throw error;
  }
}

/**
 * Escalate finance case to higher priority
 */
export async function escalateFinanceCase(
  caseId: string,
  escalatedBy: string,
  reason: string
): Promise<void> {
  try {
    const caseRef = db.collection('finance_cases').doc(caseId);
    const caseSnap = await caseRef.get();

    if (!caseSnap.exists) {
      throw new Error(`Finance case ${caseId} not found`);
    }

    const caseData = caseSnap.data() as FinanceCase;
    const newPriority = caseData.priority === 'LOW' ? 'MEDIUM' :
                        caseData.priority === 'MEDIUM' ? 'HIGH' : 'CRITICAL';

    await caseRef.update({
      priority: newPriority,
      status: 'ESCALATED',
      updatedAt: serverTimestamp(),
      metadata: {
        ...caseData.metadata,
        escalation: {
          escalatedBy,
          escalatedAt: new Date().toISOString(),
          reason,
          previousPriority: caseData.priority,
        },
      },
    });

    logger.info('[FinanceCase] Escalated case', {
      caseId,
      newPriority,
      escalatedBy,
    });
  } catch (error: any) {
    logger.error('[FinanceCase] Failed to escalate case', {
      error: error.message,
      caseId,
    });
    throw error;
  }
}

// ============================================================================
// QUERY FINANCE CASES
// ============================================================================

/**
 * Get finance cases with filters
 */
export async function getFinanceCases(options?: {
  status?: FinanceCaseStatus;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  type?: FinanceCaseType;
  assignedTo?: string;
  limit?: number;
}): Promise<FinanceCase[]> {
  try {
    let query: FirebaseFirestore.Query = db.collection('finance_cases');

    if (options?.status) {
      query = query.where('status', '==', options.status);
    }

    if (options?.priority) {
      query = query.where('priority', '==', options.priority);
    }

    if (options?.type) {
      query = query.where('type', '==', options.type);
    }

    if (options?.assignedTo) {
      query = query.where('assignedTo', '==', options.assignedTo);
    }

    query = query.orderBy('createdAt', 'desc');

    if (options?.limit) {
      query = query.limit(options.limit);
    } else {
      query = query.limit(100);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => doc.data() as FinanceCase);
  } catch (error: any) {
    logger.error('[FinanceCase] Failed to query cases', {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get finance case by ID
 */
export async function getFinanceCaseById(caseId: string): Promise<FinanceCase | null> {
  try {
    const caseSnap = await db.collection('finance_cases').doc(caseId).get();
    
    if (!caseSnap.exists) {
      return null;
    }

    return caseSnap.data() as FinanceCase;
  } catch (error: any) {
    logger.error('[FinanceCase] Failed to get case', {
      error: error.message,
      caseId,
    });
    throw error;
  }
}

/**
 * Get finance case statistics
 */
export async function getFinanceCaseStats(): Promise<{
  open: number;
  investigating: number;
  critical: number;
  resolvedToday: number;
  avgResolutionTimeDays: number;
}> {
  try {
    const openSnapshot = await db
      .collection('finance_cases')
      .where('status', 'in', ['OPEN', 'INVESTIGATING', 'AWAITING_PSP', 'AWAITING_USER', 'ESCALATED'])
      .get();

    const open = openSnapshot.docs.filter(doc => doc.data().status === 'OPEN').length;
    const investigating = openSnapshot.docs.filter(doc => doc.data().status === 'INVESTIGATING').length;
    const critical = openSnapshot.docs.filter(doc => doc.data().priority === 'CRITICAL').length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Timestamp.fromDate(today);

    const resolvedTodaySnapshot = await db
      .collection('finance_cases')
      .where('status', '==', 'RESOLVED')
      .where('closedAt', '>=', todayTimestamp)
      .get();

    const resolvedToday = resolvedTodaySnapshot.size;

    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);
    const last30DaysTimestamp = Timestamp.fromDate(last30Days);

    const recentResolvedSnapshot = await db
      .collection('finance_cases')
      .where('status', '==', 'RESOLVED')
      .where('closedAt', '>=', last30DaysTimestamp)
      .get();

    let totalResolutionTime = 0;
    let resolutionCount = 0;

    recentResolvedSnapshot.forEach(doc => {
      const data = doc.data() as FinanceCase;
      if (data.closedAt) {
        const resolutionTime = data.closedAt.toMillis() - data.createdAt.toMillis();
        totalResolutionTime += resolutionTime;
        resolutionCount++;
      }
    });

    const avgResolutionTimeDays = resolutionCount > 0
      ? Math.floor(totalResolutionTime / resolutionCount / (1000 * 60 * 60 * 24))
      : 0;

    return {
      open,
      investigating,
      critical,
      resolvedToday,
      avgResolutionTimeDays,
    };
  } catch (error: any) {
    logger.error('[FinanceCase] Failed to get case stats', {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get finance cases for a specific user
 */
export async function getFinanceCasesForUser(
  userId: string,
  limit: number = 50
): Promise<FinanceCase[]> {
  try {
    const snapshot = await db
      .collection('finance_cases')
      .where('subjectUserId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => doc.data() as FinanceCase);
  } catch (error: any) {
    logger.error('[FinanceCase] Failed to get user cases', {
      error: error.message,
      userId,
    });
    throw error;
  }
}