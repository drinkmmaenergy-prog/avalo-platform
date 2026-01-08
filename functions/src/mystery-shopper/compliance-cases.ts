/**
 * PACK 156: Compliance Case Management
 * Evidence collection, case tracking, and resolution workflow
 */

import { db, serverTimestamp, increment } from '../init';
import {
  ComplianceCase,
  ProbeType,
  ViolationSeverity,
  ComplianceAction,
  SEVERITY_DEFINITIONS,
  REASON_CODES
} from '../types/mystery-shopper.types';

const COLLECTIONS = {
  COMPLIANCE_CASES: 'compliance_cases',
  COMPLIANCE_RISK_SCORES: 'compliance_risk_scores',
  AUDIT_ACTIONS: 'audit_actions'
};

const RETENTION_PERIODS = {
  MINOR_VIOLATIONS: 90,
  MODERATE_VIOLATIONS: 180,
  SEVERE_VIOLATIONS: 365,
  CRITICAL_VIOLATIONS: 1825,
  LEGAL_CASES: 2555
};

export async function logComplianceIncident(params: {
  targetUserId: string;
  shopperProfileId: string;
  probeType: ProbeType;
  severity: ViolationSeverity;
  evidence: ComplianceCase['evidence'];
  reasonCode: string;
  auditorId?: string;
}): Promise<string> {
  const {
    targetUserId,
    shopperProfileId,
    probeType,
    severity,
    evidence,
    reasonCode,
    auditorId
  } = params;

  const severityDef = SEVERITY_DEFINITIONS[severity];
  const retentionDays = getRetentionPeriod(severity);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + retentionDays);

  const caseData: Omit<ComplianceCase, 'id'> = {
    targetUserId,
    shopperProfileId,
    probeType,
    severity,
    status: 'open',
    evidence,
    reasonCode,
    actionTaken: severityDef.action,
    auditorId,
    createdAt: new Date(),
    expiresAt
  };

  const caseRef = await db.collection(COLLECTIONS.COMPLIANCE_CASES).add({
    ...caseData,
    createdAt: serverTimestamp(),
    expiresAt
  });

  await updateComplianceRiskScore(targetUserId, severity);

  return caseRef.id;
}

export async function getComplianceCase(caseId: string): Promise<ComplianceCase | null> {
  const doc = await db.collection(COLLECTIONS.COMPLIANCE_CASES).doc(caseId).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    createdAt: data?.createdAt?.toDate(),
    resolvedAt: data?.resolvedAt?.toDate(),
    expiresAt: data?.expiresAt?.toDate()
  } as ComplianceCase;
}

export async function getUserComplianceCases(
  userId: string,
  options?: {
    status?: ComplianceCase['status'];
    limit?: number;
  }
): Promise<ComplianceCase[]> {
  let query = db
    .collection(COLLECTIONS.COMPLIANCE_CASES)
    .where('targetUserId', '==', userId);

  if (options?.status) {
    query = query.where('status', '==', options.status);
  }

  query = query.orderBy('createdAt', 'desc');

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const snapshot = await query.get();
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate(),
      resolvedAt: data?.resolvedAt?.toDate(),
      expiresAt: data?.expiresAt?.toDate()
    } as ComplianceCase;
  });
}

export async function updateCaseStatus(
  caseId: string,
  status: ComplianceCase['status'],
  auditorNotes?: string
): Promise<void> {
  const updates: any = {
    status,
    auditorNotes
  };

  if (status === 'resolved') {
    updates.resolvedAt = serverTimestamp();
  }

  await db.collection(COLLECTIONS.COMPLIANCE_CASES).doc(caseId).update(updates);
}

export async function addCaseEvidence(
  caseId: string,
  evidence: Partial<ComplianceCase['evidence']>
): Promise<void> {
  const caseDoc = await db.collection(COLLECTIONS.COMPLIANCE_CASES).doc(caseId).get();

  if (!caseDoc.exists) {
    throw new Error('Case not found');
  }

  const currentEvidence = caseDoc.data()?.evidence || {};

  const updatedEvidence = {
    chatSnapshots: [
      ...(currentEvidence.chatSnapshots || []),
      ...(evidence.chatSnapshots || [])
    ],
    mediaSnapshots: [
      ...(currentEvidence.mediaSnapshots || []),
      ...(evidence.mediaSnapshots || [])
    ],
    contextNotes: [
      currentEvidence.contextNotes,
      evidence.contextNotes
    ].filter(Boolean).join('\n---\n')
  };

  await db.collection(COLLECTIONS.COMPLIANCE_CASES).doc(caseId).update({
    evidence: updatedEvidence
  });
}

export async function assignAuditor(caseId: string, auditorId: string): Promise<void> {
  await db.collection(COLLECTIONS.COMPLIANCE_CASES).doc(caseId).update({
    auditorId,
    status: 'investigating'
  });
}

export async function getCasesByAuditor(
  auditorId: string,
  status?: ComplianceCase['status']
): Promise<ComplianceCase[]> {
  let query = db
    .collection(COLLECTIONS.COMPLIANCE_CASES)
    .where('auditorId', '==', auditorId);

  if (status) {
    query = query.where('status', '==', status);
  }

  query = query.orderBy('createdAt', 'desc');

  const snapshot = await query.get();
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate(),
      resolvedAt: data?.resolvedAt?.toDate(),
      expiresAt: data?.expiresAt?.toDate()
    } as ComplianceCase;
  });
}

export async function updateComplianceRiskScore(
  userId: string,
  violationSeverity: ViolationSeverity
): Promise<void> {
  const scoreRef = db.collection(COLLECTIONS.COMPLIANCE_RISK_SCORES).doc(userId);
  const scoreDoc = await scoreRef.get();

  const currentData = scoreDoc.exists ? scoreDoc.data() : null;

  const severityWeights = {
    1: 5,
    2: 10,
    3: 20,
    4: 40,
    5: 80
  };

  const newScore = (currentData?.score || 0) + severityWeights[violationSeverity];
  const capped = Math.min(newScore, 100);

  const tier = calculateRiskTier(capped);
  const auditFrequency = calculateAuditFrequency(tier);

  const nextAudit = new Date();
  const daysToNextAudit = auditFrequency === 'constant' ? 1 :
                          auditFrequency === 'high' ? 7 :
                          auditFrequency === 'medium' ? 30 : 90;
  nextAudit.setDate(nextAudit.getDate() + daysToNextAudit);

  await scoreRef.set({
    userId,
    score: capped,
    tier,
    factors: {
      violationHistory: (currentData?.factors?.violationHistory || 0) + severityWeights[violationSeverity],
      reportCount: increment(1),
      behaviorPatterns: currentData?.factors?.behaviorPatterns || 0,
      engagementQuality: currentData?.factors?.engagementQuality || 100
    },
    auditFrequency,
    lastCalculatedAt: serverTimestamp(),
    nextAuditScheduledAt: nextAudit
  }, { merge: true });
}

export async function getComplianceRiskScore(userId: string) {
  const doc = await db.collection(COLLECTIONS.COMPLIANCE_RISK_SCORES).doc(userId).get();

  if (!doc.exists) {
    return {
      userId,
      score: 100,
      tier: 'excellent' as const,
      factors: {
        violationHistory: 0,
        reportCount: 0,
        behaviorPatterns: 0,
        engagementQuality: 100
      },
      auditFrequency: 'low' as const,
      lastCalculatedAt: new Date()
    };
  }

  const data = doc.data();
  return {
    ...data,
    lastCalculatedAt: data?.lastCalculatedAt?.toDate(),
    nextAuditScheduledAt: data?.nextAuditScheduledAt?.toDate()
  };
}

export async function decayComplianceScore(userId: string): Promise<void> {
  const scoreRef = db.collection(COLLECTIONS.COMPLIANCE_RISK_SCORES).doc(userId);
  const scoreDoc = await scoreRef.get();

  if (!scoreDoc.exists) {
    return;
  }

  const data = scoreDoc.data();
  if (!data) return;

  const currentScore = data.score || 100;
  const decayAmount = 2;
  const newScore = Math.min(currentScore + decayAmount, 100);

  const tier = calculateRiskTier(newScore);
  const auditFrequency = calculateAuditFrequency(tier);

  await scoreRef.update({
    score: newScore,
    tier,
    auditFrequency,
    lastCalculatedAt: serverTimestamp()
  });
}

export async function getPendingCasesForReview(limit: number = 50): Promise<ComplianceCase[]> {
  const snapshot = await db
    .collection(COLLECTIONS.COMPLIANCE_CASES)
    .where('status', '==', 'open')
    .orderBy('severity', 'desc')
    .orderBy('createdAt', 'asc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate(),
      resolvedAt: data?.resolvedAt?.toDate(),
      expiresAt: data?.expiresAt?.toDate()
    } as ComplianceCase;
  });
}

export async function getCaseStatistics(timeRange?: { start: Date; end: Date }) {
  let query: FirebaseFirestore.Query = db.collection(COLLECTIONS.COMPLIANCE_CASES);

  if (timeRange) {
    query = query
      .where('createdAt', '>=', timeRange.start)
      .where('createdAt', '<=', timeRange.end);
  }

  const snapshot = await query.get();
  const cases = snapshot.docs.map(doc => doc.data());

  const stats = {
    total: cases.length,
    bySeverity: {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0
    },
    byStatus: {
      open: 0,
      investigating: 0,
      resolved: 0,
      appealed: 0
    },
    byAction: {} as Record<ComplianceAction, number>
  };

  cases.forEach(c => {
    stats.bySeverity[c.severity as ViolationSeverity]++;
    stats.byStatus[c.status as keyof typeof stats.byStatus]++;
    stats.byAction[c.actionTaken] = (stats.byAction[c.actionTaken] || 0) + 1;
  });

  return stats;
}

function calculateRiskTier(score: number): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'fair';
  if (score >= 30) return 'poor';
  return 'critical';
}

function calculateAuditFrequency(tier: string): 'low' | 'medium' | 'high' | 'constant' {
  switch (tier) {
    case 'excellent': return 'low';
    case 'good': return 'low';
    case 'fair': return 'medium';
    case 'poor': return 'high';
    case 'critical': return 'constant';
    default: return 'medium';
  }
}

function getRetentionPeriod(severity: ViolationSeverity): number {
  if (severity === 5) return RETENTION_PERIODS.LEGAL_CASES;
  if (severity === 4) return RETENTION_PERIODS.SEVERE_VIOLATIONS;
  if (severity === 3) return RETENTION_PERIODS.MODERATE_VIOLATIONS;
  return RETENTION_PERIODS.MINOR_VIOLATIONS;
}

export async function cleanupExpiredCases(): Promise<number> {
  const now = new Date();
  const snapshot = await db
    .collection(COLLECTIONS.COMPLIANCE_CASES)
    .where('expiresAt', '<', now)
    .get();

  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });

  await batch.commit();
  return snapshot.size;
}