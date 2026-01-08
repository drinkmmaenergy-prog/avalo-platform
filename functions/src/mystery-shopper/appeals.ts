/**
 * PACK 156: Compliance Appeal System
 * User appeal submission, review, and resolution
 */

import { db, serverTimestamp } from '../init';
import {
  ComplianceAppeal,
  AuditAction
} from '../types/mystery-shopper.types';
import { updateCaseStatus } from './compliance-cases';
import { unfreezeFeatureAccess, unbanAccount } from './enforcement';

const COLLECTIONS = {
  COMPLIANCE_APPEALS: 'compliance_appeals',
  AUDIT_ACTIONS: 'audit_actions',
  COMPLIANCE_CASES: 'compliance_cases'
};

export async function submitAppeal(params: {
  caseId: string;
  actionId: string;
  userId: string;
  reason: string;
  evidence?: string;
}): Promise<string> {
  const { caseId, actionId, userId, reason, evidence } = params;

  const action = await getAuditAction(actionId);
  if (!action) {
    throw new Error('Audit action not found');
  }

  if (action.targetUserId !== userId) {
    throw new Error('User mismatch - cannot appeal this action');
  }

  if (action.appealDeadline && new Date() > action.appealDeadline) {
    throw new Error('Appeal deadline has passed');
  }

  const existingAppeal = await getAppealByActionId(actionId);
  if (existingAppeal) {
    throw new Error('Appeal already submitted for this action');
  }

  const appeal: Omit<ComplianceAppeal, 'id'> = {
    caseId,
    actionId,
    userId,
    reason,
    evidence,
    status: 'pending',
    submittedAt: new Date()
  };

  const appealRef = await db.collection(COLLECTIONS.COMPLIANCE_APPEALS).add({
    ...appeal,
    submittedAt: serverTimestamp()
  });

  await db.collection(COLLECTIONS.COMPLIANCE_CASES).doc(caseId).update({
    status: 'appealed'
  });

  return appealRef.id;
}

export async function getAppeal(appealId: string): Promise<ComplianceAppeal | null> {
  const doc = await db.collection(COLLECTIONS.COMPLIANCE_APPEALS).doc(appealId).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    submittedAt: data?.submittedAt?.toDate(),
    reviewedAt: data?.reviewedAt?.toDate()
  } as ComplianceAppeal;
}

export async function getAppealByActionId(actionId: string): Promise<ComplianceAppeal | null> {
  const snapshot = await db
    .collection(COLLECTIONS.COMPLIANCE_APPEALS)
    .where('actionId', '==', actionId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    submittedAt: data?.submittedAt?.toDate(),
    reviewedAt: data?.reviewedAt?.toDate()
  } as ComplianceAppeal;
}

export async function getUserAppeals(userId: string): Promise<ComplianceAppeal[]> {
  const snapshot = await db
    .collection(COLLECTIONS.COMPLIANCE_APPEALS)
    .where('userId', '==', userId)
    .orderBy('submittedAt', 'desc')
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      submittedAt: data.submittedAt?.toDate(),
      reviewedAt: data?.reviewedAt?.toDate()
    } as ComplianceAppeal;
  });
}

export async function getPendingAppeals(limit: number = 50): Promise<ComplianceAppeal[]> {
  const snapshot = await db
    .collection(COLLECTIONS.COMPLIANCE_APPEALS)
    .where('status', '==', 'pending')
    .orderBy('submittedAt', 'asc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      submittedAt: data.submittedAt?.toDate(),
      reviewedAt: data?.reviewedAt?.toDate()
    } as ComplianceAppeal;
  });
}

export async function assignAppealReviewer(
  appealId: string,
  reviewerId: string
): Promise<void> {
  await db.collection(COLLECTIONS.COMPLIANCE_APPEALS).doc(appealId).update({
    reviewedBy: reviewerId,
    status: 'under_review'
  });
}

export async function approveAppeal(params: {
  appealId: string;
  reviewerId: string;
  reviewNotes: string;
}): Promise<void> {
  const { appealId, reviewerId, reviewNotes } = params;

  const appeal = await getAppeal(appealId);
  if (!appeal) {
    throw new Error('Appeal not found');
  }

  await db.collection(COLLECTIONS.COMPLIANCE_APPEALS).doc(appealId).update({
    status: 'approved',
    reviewedBy: reviewerId,
    reviewNotes,
    reviewedAt: serverTimestamp()
  });

  const action = await getAuditAction(appeal.actionId);
  if (!action) {
    throw new Error('Associated action not found');
  }

  await reverseEnforcementAction(action);

  await updateCaseStatus(
    appeal.caseId,
    'resolved',
    'Appeal approved - action reversed'
  );
}

export async function denyAppeal(params: {
  appealId: string;
  reviewerId: string;
  reviewNotes: string;
}): Promise<void> {
  const { appealId, reviewerId, reviewNotes } = params;

  const appeal = await getAppeal(appealId);
  if (!appeal) {
    throw new Error('Appeal not found');
  }

  await db.collection(COLLECTIONS.COMPLIANCE_APPEALS).doc(appealId).update({
    status: 'denied',
    reviewedBy: reviewerId,
    reviewNotes,
    reviewedAt: serverTimestamp()
  });

  await updateCaseStatus(
    appeal.caseId,
    'resolved',
    'Appeal denied - action upheld'
  );
}

export async function getAppealStatistics(timeRange?: { start: Date; end: Date }) {
  let query: FirebaseFirestore.Query = db.collection(COLLECTIONS.COMPLIANCE_APPEALS);

  if (timeRange) {
    query = query
      .where('submittedAt', '>=', timeRange.start)
      .where('submittedAt', '<=', timeRange.end);
  }

  const snapshot = await query.get();
  const appeals = snapshot.docs.map(doc => doc.data());

  const stats = {
    total: appeals.length,
    pending: 0,
    underReview: 0,
    approved: 0,
    denied: 0,
    approvalRate: 0,
    averageReviewTime: 0
  };

  let totalReviewTime = 0;
  let reviewedCount = 0;

  appeals.forEach(appeal => {
    switch (appeal.status) {
      case 'pending':
        stats.pending++;
        break;
      case 'under_review':
        stats.underReview++;
        break;
      case 'approved':
        stats.approved++;
        break;
      case 'denied':
        stats.denied++;
        break;
    }

    if (appeal.reviewedAt && appeal.submittedAt) {
      const reviewTime = appeal.reviewedAt.toDate().getTime() - appeal.submittedAt.toDate().getTime();
      totalReviewTime += reviewTime;
      reviewedCount++;
    }
  });

  if (reviewedCount > 0) {
    stats.averageReviewTime = totalReviewTime / reviewedCount / (1000 * 60 * 60);
  }

  const resolvedCount = stats.approved + stats.denied;
  if (resolvedCount > 0) {
    stats.approvalRate = stats.approved / resolvedCount;
  }

  return stats;
}

async function getAuditAction(actionId: string): Promise<AuditAction | null> {
  const doc = await db.collection(COLLECTIONS.AUDIT_ACTIONS).doc(actionId).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    appliedAt: data?.appliedAt?.toDate(),
    expiresAt: data?.expiresAt?.toDate(),
    appealDeadline: data?.appealDeadline?.toDate()
  } as AuditAction;
}

async function reverseEnforcementAction(action: AuditAction): Promise<void> {
  switch (action.actionType) {
    case 'account_ban':
      await unbanAccount(action.targetUserId, 'appeal_approved');
      break;

    case 'feature_freeze':
      if (action.frozenFeatures && action.frozenFeatures.length > 0) {
        await unfreezeFeatureAccess(action.targetUserId, action.frozenFeatures);
      }
      break;

    case 'warning':
      await clearWarning(action.targetUserId, action.reasonCode);
      break;

    case 'education_required':
      await clearEducationRequirements(action.targetUserId);
      break;

    default:
      console.log(`No reversal needed for action type: ${action.actionType}`);
  }

  await db.collection(COLLECTIONS.AUDIT_ACTIONS).doc(action.id).update({
    reversed: true,
    reversedAt: serverTimestamp(),
    reversalReason: 'Appeal approved'
  });
}

async function clearWarning(userId: string, reasonCode: string): Promise<void> {
  const userRef = db.collection('users').doc(userId);
  const userDoc = await userRef.get();
  const userData = userDoc.data();

  if (!userData?.complianceWarnings) {
    return;
  }

  const warnings = userData.complianceWarnings.filter(
    (w: any) => w.reasonCode !== reasonCode
  );

  await userRef.update({
    complianceWarnings: warnings,
    'complianceStatus.totalWarnings': warnings.length
  });
}

async function clearEducationRequirements(userId: string): Promise<void> {
  const userRef = db.collection('users').doc(userId);

  await userRef.update({
    'complianceEducation.required': [],
    'complianceEducation.cleared': true,
    'complianceEducation.clearedAt': serverTimestamp()
  });
}

export async function canSubmitAppeal(
  userId: string,
  actionId: string
): Promise<{ canAppeal: boolean; reason?: string }> {
  const action = await getAuditAction(actionId);
  
  if (!action) {
    return { canAppeal: false, reason: 'Action not found' };
  }

  if (action.targetUserId !== userId) {
    return { canAppeal: false, reason: 'Not your action' };
  }

  if (action.appealDeadline && new Date() > action.appealDeadline) {
    return { canAppeal: false, reason: 'Appeal deadline passed' };
  }

  const existingAppeal = await getAppealByActionId(actionId);
  if (existingAppeal) {
    return { canAppeal: false, reason: 'Appeal already submitted' };
  }

  return { canAppeal: true };
}