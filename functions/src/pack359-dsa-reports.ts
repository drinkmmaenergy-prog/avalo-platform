/**
 * PACK 359 — Legal Compliance: DSA Platform Safety Reports
 * 
 * Digital Services Act (EU) compliance for automated reporting:
 * - Illegal content detection
 * - Exploitation risk monitoring
 * - Minor safety flags
 * - Financial abuse detection
 * - Organized fraud alerts
 * 
 * Integrates with:
 * - PACK 302 (Fraud Detection)
 * - PACK 281 (Risk Profile)
 * - PACK 300A (Support & Panic)
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { checkDSAApplicability } from './pack359-jurisdiction-engine';

const db = admin.firestore();

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface DSAReport {
  reportId: string;
  type: 'illegal_content' | 'exploitation' | 'minor_safety' | 'financial_abuse' | 'organized_fraud' | 'other';
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'reviewing' | 'escalated' | 'resolved' | 'false_positive';
  
  // Subject information
  subjectUserId?: string;
  subjectContentId?: string;
  subjectContentType?: string;
  
  // Reporter information
  reportedBy: 'user' | 'ai_system' | 'moderator' | 'automated';
  reporterId?: string;
  
  // Details
  description: string;
  evidence: string[];
  aiConfidence?: number; // 0-1 for AI-detected reports
  
  // Legal requirements
  dsaCategory: string;
  legalImpact: 'reportable' | 'non_reportable' | 'investigation_required';
  authorityNotified: boolean;
  notificationDate?: Date;
  
  // Timeline
  detectedAt: Date;
  reportedAt: Date;
  reviewedAt?: Date;
  resolvedAt?: Date;
  
  // Actions taken
  actionsTaken: DSAAction[];
  
  // Metadata
  jurisdiction: string;
  regulatoryBody?: string;
}

export interface DSAAction {
  type: 'content_removed' | 'account_suspended' | 'account_banned' | 'warning_issued' | 'law_enforcement_notified' | 'investigation_started' | 'no_action';
  takenAt: Date;
  takenBy: string;
  reason: string;
  details?: string;
}

export interface DSAStatistics {
  period: string;
  totalReports: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  averageResolutionTime: number; // hours
  contentRemoved: number;
  accountsSuspended: number;
  accountsBanned: number;
  lawEnforcementNotifications: number;
  falsePositives: number;
}

export interface DSAComplianceReport {
  period: string;
  generatedAt: Date;
  statistics: DSAStatistics;
  criticalIncidents: DSAReport[];
  regulatoryNotifications: number;
  complianceScore: number; // 0-100
}

// ============================================================================
// DSA REPORT CREATION
// ============================================================================

/**
 * Create a new DSA report
 */
export async function createDSAReport(
  type: DSAReport['type'],
  severity: DSAReport['severity'],
  description: string,
  subjectUserId?: string,
  subjectContentId?: string,
  reportedBy: DSAReport['reportedBy'] = 'automated',
  reporterId?: string,
  evidence: string[] = [],
  aiConfidence?: number
): Promise<DSAReport> {
  // Determine DSA category and legal impact
  const { dsaCategory, legalImpact } = categorizeDSAReport(type, severity);
  
  // Get jurisdiction for subject
  const jurisdiction = subjectUserId 
    ? (await db.collection('legal_jurisdiction').doc(subjectUserId).get()).data()?.detectedCountry || 'XX'
    : 'XX';
  
  const report: DSAReport = {
    reportId: `dsa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    severity,
    status: 'pending',
    subjectUserId,
    subjectContentId,
    reportedBy,
    reporterId,
    description,
    evidence,
    aiConfidence,
    dsaCategory,
    legalImpact,
    authorityNotified: false,
    detectedAt: new Date(),
    reportedAt: new Date(),
    actionsTaken: [],
    jurisdiction,
  };
  
  // Store report
  await db.collection('dsa_reports').doc(report.reportId).set({
    ...report,
    detectedAt: admin.firestore.FieldValue.serverTimestamp(),
    reportedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  
  // Auto-escalate critical reports
  if (severity === 'critical') {
    await escalateDSAReport(report.reportId);
  }
  
  // Notify authorities if legally required
  if (legalImpact === 'reportable') {
    await notifyAuthorities(report);
  }
  
  // Log to audit trail
  await db.collection('legal_audit_log').add({
    type: 'dsa_report_created',
    reportId: report.reportId,
    severity,
    dsaCategory,
    subjectUserId,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
  
  return report;
}

/**
 * Categorize DSA report for legal compliance
 */
function categorizeDSAReport(
  type: DSAReport['type'],
  severity: DSAReport['severity']
): { dsaCategory: string; legalImpact: DSAReport['legalImpact'] } {
  const categorization: Record<string, { dsaCategory: string; legalImpact: DSAReport['legalImpact'] }> = {
    illegal_content: {
      dsaCategory: 'Article 16 - Illegal Content',
      legalImpact: severity === 'critical' || severity === 'high' ? 'reportable' : 'investigation_required',
    },
    exploitation: {
      dsaCategory: 'Article 16 - Illegal Content / Exploitation',
      legalImpact: 'reportable',
    },
    minor_safety: {
      dsaCategory: 'Article 28 - Protection of Minors',
      legalImpact: 'reportable',
    },
    financial_abuse: {
      dsaCategory: 'Article 16 - Illegal Content / Financial Crime',
      legalImpact: severity === 'critical' ? 'reportable' : 'investigation_required',
    },
    organized_fraud: {
      dsaCategory: 'Article 16 - Illegal Content / Organized Crime',
      legalImpact: 'reportable',
    },
    other: {
      dsaCategory: 'General Safety Concern',
      legalImpact: 'non_reportable',
    },
  };
  
  return categorization[type] || categorization.other;
}

// ============================================================================
// DSA REPORT ACTIONS
// ============================================================================

/**
 * Take action on a DSA report
 */
export async function takeDSAAction(
  reportId: string,
  actionType: DSAAction['type'],
  takenBy: string,
  reason: string,
  details?: string
): Promise<void> {
  const reportRef = db.collection('dsa_reports').doc(reportId);
  const reportDoc = await reportRef.get();
  
  if (!reportDoc.exists) {
    throw new Error('DSA report not found');
  }
  
  const report = reportDoc.data() as DSAReport;
  
  const action: DSAAction = {
    type: actionType,
    takenAt: new Date(),
    takenBy,
    reason,
    details,
  };
  
  // Update report with action
  await reportRef.update({
    actionsTaken: admin.firestore.FieldValue.arrayUnion(action),
    status: 'reviewing',
    reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  
  // Execute the action
  switch (actionType) {
    case 'content_removed':
      if (report.subjectContentId) {
        await removeContent(report.subjectContentId, report.subjectContentType);
      }
      break;
      
    case 'account_suspended':
      if (report.subjectUserId) {
        await suspendAccount(report.subjectUserId, reason);
      }
      break;
      
    case 'account_banned':
      if (report.subjectUserId) {
        await banAccount(report.subjectUserId, reason);
      }
      break;
      
    case 'law_enforcement_notified':
      await notifyLawEnforcement(report, details);
      break;
  }
  
  // Log action
  await db.collection('legal_audit_log').add({
    type: 'dsa_action_taken',
    reportId,
    actionType,
    takenBy,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Resolve DSA report
 */
export async function resolveDSAReport(
  reportId: string,
  outcome: 'resolved' | 'false_positive',
  resolution: string
): Promise<void> {
  const reportRef = db.collection('dsa_reports').doc(reportId);
  
  await reportRef.update({
    status: outcome,
    resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
    resolution,
  });
  
  await db.collection('legal_audit_log').add({
    type: 'dsa_report_resolved',
    reportId,
    outcome,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Escalate DSA report to human review
 */
async function escalateDSAReport(reportId: string): Promise<void> {
  await db.collection('dsa_reports').doc(reportId).update({
    status: 'escalated',
  });
  
  // Notify moderation team
  await db.collection('moderator_queue').add({
    reportId,
    type: 'dsa_escalation',
    priority: 'critical',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ============================================================================
// AUTHORITY NOTIFICATION
// ============================================================================

/**
 * Notify authorities of DSA report
 */
async function notifyAuthorities(report: DSAReport): Promise<void> {
  // In production, integrate with official reporting channels
  // For EU: DSA transparency database
  
  console.log(`[DSA] Notifying authorities of ${report.type} report ${report.reportId}`);
  
  await db.collection('dsa_reports').doc(report.reportId).update({
    authorityNotified: true,
    notificationDate: admin.firestore.FieldValue.serverTimestamp(),
    regulatoryBody: getRegulatoryBody(report.jurisdiction),
  });
  
  // Store notification record
  await db.collection('authority_notifications').add({
    reportId: report.reportId,
    type: report.type,
    severity: report.severity,
    jurisdiction: report.jurisdiction,
    regulatoryBody: getRegulatoryBody(report.jurisdiction),
    notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Notify law enforcement
 */
async function notifyLawEnforcement(report: DSAReport, details?: string): Promise<void> {
  console.log(`[DSA] Notifying law enforcement of ${report.type} report ${report.reportId}`);
  
  await db.collection('law_enforcement_notifications').add({
    reportId: report.reportId,
    type: report.type,
    severity: report.severity,
    evidence: report.evidence,
    details,
    jurisdiction: report.jurisdiction,
    notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  
  await db.collection('dsa_reports').doc(report.reportId).update({
    authorityNotified: true,
    notificationDate: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Get regulatory body for jurisdiction
 */
function getRegulatoryBody(countryCode: string): string {
  const bodies: Record<string, string> = {
    'PL': 'Prezes Urzędu Komunikacji Elektronicznej (UKE)',
    'DE': 'Bundesnetzagentur',
    'FR': 'Autorité de régulation de la communication audiovisuelle et numérique (Arcom)',
    'IT': 'Autorità per le Garanzie nelle Comunicazioni (AGCOM)',
    'ES': 'Comisión Nacional de los Mercados y la Competencia (CNMC)',
    'NL': 'Autoriteit Consument en Markt (ACM)',
    'SE': 'Post- och telestyrelsen (PTS)',
    'GB': 'Ofcom',
  };
  
  return bodies[countryCode] || 'National Digital Services Coordinator';
}

// ============================================================================
// CONTENT & ACCOUNT ACTIONS
// ============================================================================

async function removeContent(contentId: string, contentType?: string): Promise<void> {
  console.log(`[DSA] Removing content ${contentId} of type ${contentType}`);
  
  // Mark content as removed
  await db.collection('content_moderation').doc(contentId).set({
    removed: true,
    removedAt: admin.firestore.FieldValue.serverTimestamp(),
    reason: 'DSA compliance',
  }, { merge: true });
}

async function suspendAccount(userId: string, reason: string): Promise<void> {
  console.log(`[DSA] Suspending account ${userId}`);
  
  await db.collection('users').doc(userId).update({
    accountStatus: 'suspended',
    suspendedAt: admin.firestore.FieldValue.serverTimestamp(),
    suspensionReason: reason,
  });
}

async function banAccount(userId: string, reason: string): Promise<void> {
  console.log(`[DSA] Banning account ${userId}`);
  
  await db.collection('users').doc(userId).update({
    accountStatus: 'banned',
    bannedAt: admin.firestore.FieldValue.serverTimestamp(),
    banReason: reason,
  });
}

// ============================================================================
// INTEGRATION WITH OTHER SYSTEMS
// ============================================================================

/**
 * Create DSA report from fraud detection (PACK 302)
 */
export async function createDSAReportFromFraud(fraudDetectionId: string): Promise<void> {
  const fraudDoc = await db.collection('fraud_detections').doc(fraudDetectionId).get();
  
  if (!fraudDoc.exists) return;
  
  const fraud = fraudDoc.data()!;
  
  await createDSAReport(
    'financial_abuse',
    fraud.riskLevel === 'critical' ? 'critical' : 'high',
    `Fraud detected: ${fraud.fraudType}`,
    fraud.userId,
    undefined,
    'ai_system',
    undefined,
    [fraudDetectionId],
    fraud.confidence
  );
}

/**
 * Create DSA report from abuse report
 */
export async function createDSAReportFromAbuse(abuseReportId: string): Promise<void> {
  const abuseDoc = await db.collection('abuse_reports').doc(abuseReportId).get();
  
  if (!abuseDoc.exists) return;
  
  const abuse = abuseDoc.data()!;
  
  let dsaType: DSAReport['type'] = 'other';
  
  // Map abuse types to DSA categories
  if (abuse.type === 'minor_safety') {
    dsaType = 'minor_safety';
  } else if (abuse.type === 'exploitation' || abuse.type === 'trafficking') {
    dsaType = 'exploitation';
  } else if (abuse.type === 'illegal_content') {
    dsaType = 'illegal_content';
  }
  
  await createDSAReport(
    dsaType,
    abuse.severity || 'high',
    abuse.description,
    abuse.reportedUserId,
    abuse.contentId,
    'user',
    abuse.reporterId,
    abuse.evidence || []
  );
}

// ============================================================================
// STATISTICS & COMPLIANCE REPORTING
// ============================================================================

/**
 * Generate DSA statistics for a period
 */
export async function generateDSAStatistics(
  startDate: Date,
  endDate: Date
): Promise<DSAStatistics> {
  const reports = await db.collection('dsa_reports')
    .where('reportedAt', '>=', startDate)
    .where('reportedAt', '<=', endDate)
    .get();
  
  const statistics: DSAStatistics = {
    period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
    totalReports: reports.size,
    byType: {},
    bySeverity: {},
    averageResolutionTime: 0,
    contentRemoved: 0,
    accountsSuspended: 0,
    accountsBanned: 0,
    lawEnforcementNotifications: 0,
    falsePositives: 0,
  };
  
  let totalResolutionTime = 0;
  let resolvedCount = 0;
  
  reports.forEach(doc => {
    const report = doc.data() as DSAReport;
    
    // Count by type
    statistics.byType[report.type] = (statistics.byType[report.type] || 0) + 1;
    
    // Count by severity
    statistics.bySeverity[report.severity] = (statistics.bySeverity[report.severity] || 0) + 1;
    
    // Count actions
    report.actionsTaken?.forEach(action => {
      if (action.type === 'content_removed') statistics.contentRemoved++;
      if (action.type === 'account_suspended') statistics.accountsSuspended++;
      if (action.type === 'account_banned') statistics.accountsBanned++;
      if (action.type === 'law_enforcement_notified') statistics.lawEnforcementNotifications++;
    });
    
    // Calculate resolution time
    if (report.status === 'resolved' || report.status === 'false_positive') {
      if (report.status === 'false_positive') statistics.falsePositives++;
      
      if (report.resolvedAt && report.reportedAt) {
        const resolutionTime = report.resolvedAt.getTime() - report.reportedAt.getTime();
        totalResolutionTime += resolutionTime;
        resolvedCount++;
      }
    }
  });
  
  if (resolvedCount > 0) {
    statistics.averageResolutionTime = (totalResolutionTime / resolvedCount) / (1000 * 60 * 60); // Convert to hours
  }
  
  return statistics;
}

/**
 * Generate monthly DSA compliance report
 */
export const generateMonthlyDSAReport = functions.pubsub
  .schedule('0 0 1 * *') // 00:00 on the 1st of every month
  .timeZone('UTC')
  .onRun(async (context) => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
    const endDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
    
    const statistics = await generateDSAStatistics(startDate, endDate);
    
    // Get critical incidents
    const criticalReports = await db.collection('dsa_reports')
      .where('reportedAt', '>=', startDate)
      .where('reportedAt', '<=', endDate)
      .where('severity', '==', 'critical')
      .get();
    
    const criticalIncidents = criticalReports.docs.map(doc => doc.data() as DSAReport);
    
    // Count regulatory notifications
    const notifications = await db.collection('authority_notifications')
      .where('notifiedAt', '>=', startDate)
      .where('notifiedAt', '<=', endDate)
      .get();
    
    // Calculate compliance score (0-100)
    const complianceScore = calculateComplianceScore(statistics);
    
    const complianceReport: DSAComplianceReport = {
      period: `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`,
      generatedAt: new Date(),
      statistics,
      criticalIncidents,
      regulatoryNotifications: notifications.size,
      complianceScore,
    };
    
    // Store compliance report
    await db.collection('dsa_compliance_reports').add({
      ...complianceReport,
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log(`DSA compliance report generated for ${complianceReport.period}`);
  });

/**
 * Calculate compliance score based on performance metrics
 */
function calculateComplianceScore(stats: DSAStatistics): number {
  let score = 100;
  
  // Deduct points for slow resolution
  if (stats.averageResolutionTime > 72) score -= 10; // Over 72 hours
  if (stats.averageResolutionTime > 168) score -= 20; // Over 1 week
  
  // Deduct points for high false positive rate
  const fpRate = stats.totalReports > 0 ? stats.falsePositives / stats.totalReports : 0;
  if (fpRate > 0.3) score -= 15; // Over 30% false positives
  
  // Bonus for proactive actions
  if (stats.contentRemoved > 0) score += 5;
  if (stats.lawEnforcementNotifications > 0) score += 5;
  
  return Math.max(0, Math.min(100, score));
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * HTTP endpoint to create DSA report
 */
export const reportDSAIncident = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { type, description, subjectUserId, subjectContentId, evidence } = data;
  
  if (!type || !description) {
    throw new functions.https.HttpsError('invalid-argument', 'Type and description required');
  }
  
  const report = await createDSAReport(
    type,
    'medium', // User reports default to medium severity
    description,
    subjectUserId,
    subjectContentId,
    'user',
    context.auth.uid,
    evidence || []
  );
  
  return {
    reportId: report.reportId,
    message: 'Report submitted successfully. Our team will review it shortly.',
  };
});

/**
 * Automatically monitor fraud detections for DSA reporting
 */
export const onFraudDetection = functions.firestore
  .document('fraud_detections/{fraudId}')
  .onCreate(async (snap, context) => {
    const fraud = snap.data();
    
    // Auto-report high-risk fraud to DSA
    if (fraud.riskLevel === 'critical' || fraud.riskLevel === 'high') {
      await createDSAReportFromFraud(context.params.fraudId);
    }
  });

/**
 * Automatically monitor abuse reports for DSA reporting
 */
export const onAbuseReport = functions.firestore
  .document('abuse_reports/{reportId}')
  .onCreate(async (snap, context) => {
    const abuse = snap.data();
    
    // Auto-report serious abuse to DSA
    if (abuse.severity === 'critical' || abuse.type === 'minor_safety' || abuse.type === 'exploitation') {
      await createDSAReportFromAbuse(context.params.reportId);
    }
  });
