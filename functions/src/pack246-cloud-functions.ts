/**
 * PACK 246 - Global Consistency & Contract Enforcement Engine
 * Cloud Functions for real-time validation and scheduled auditing
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { validateTransaction } from './pack246-contract-validator';
import {
  ValidationRequest,
  TransactionType,
  NightlyAuditReport,
  ViolationType,
  ContractViolation,
  AuditLogEntry,
} from './pack246-contract-types';

// ============================================================================
// CALLABLE FUNCTION: Validate Transaction
// ============================================================================

export const economyContractValidator = onCall(
  {
    region: 'europe-west3',
    memory: '512MiB',
    timeoutSeconds: 60,
  },
  async (request) => {
    const { auth, data } = request;

    // Authentication required
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    // Validate input
    if (!data || !data.transactionType || data.amount === undefined) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required fields: transactionType, amount'
      );
    }

    try {
      const validationRequest: ValidationRequest = {
        transactionType: data.transactionType as TransactionType,
        userId: auth.uid,
        targetUserId: data.targetUserId,
        amount: data.amount,
        metadata: data.metadata || {},
      };

      // Perform validation
      const result = await validateTransaction(validationRequest);

      // If blocked, throw error with details
      if (result.action === 'BLOCK') {
        throw new HttpsError(
          'permission-denied',
          'Transaction blocked due to contract violations',
          {
            violations: result.violations.map(v => ({
              type: v.type,
              message: v.message,
              severity: v.severity,
            })),
          }
        );
      }

      // Return result (ALLOW or AUTO_CORRECT)
      return {
        valid: result.valid,
        action: result.action,
        violations: result.violations,
        correctedValues: result.correctedValues,
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error('Contract validation error:', error);
      throw new HttpsError('internal', 'Validation system error');
    }
  }
);

// ============================================================================
// CALLABLE FUNCTION: Get Contract Stats
// ============================================================================

export const getContractStats = onCall(
  {
    region: 'europe-west3',
    memory: '256MiB',
  },
  async (request) => {
    const { auth } = request;

    // Admin only
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userDoc = await db.collection('users').doc(auth.uid).get();
    if (!userDoc.exists || !userDoc.data()?.isAdmin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    try {
      const statsDoc = await db.collection('contractStats').doc('global').get();
      return statsDoc.exists ? statsDoc.data() : null;
    } catch (error) {
      logger.error('Error fetching contract stats:', error);
      throw new HttpsError('internal', 'Failed to fetch stats');
    }
  }
);

// ============================================================================
// CALLABLE FUNCTION: Get Audit Logs
// ============================================================================

export const getAuditLogs = onCall(
  {
    region: 'europe-west3',
    memory: '512MiB',
  },
  async (request) => {
    const { auth, data } = request;

    // Admin only
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userDoc = await db.collection('users').doc(auth.uid).get();
    if (!userDoc.exists || !userDoc.data()?.isAdmin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    try {
      const { userId, limit = 50, startAfter } = data;

      let query = db
        .collection('contractAuditLogs')
        .orderBy('timestamp', 'desc')
        .limit(limit);

      if (userId) {
        query = query.where('userId', '==', userId);
      }

      if (startAfter) {
        const lastDoc = await db.collection('contractAuditLogs').doc(startAfter).get();
        if (lastDoc.exists) {
          query = query.startAfter(lastDoc);
        }
      }

      const snapshot = await query.get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      logger.error('Error fetching audit logs:', error);
      throw new HttpsError('internal', 'Failed to fetch logs');
    }
  }
);

// ============================================================================
// CALLABLE FUNCTION: Get Anomalies
// ============================================================================

export const getSuspiciousAnomalies = onCall(
  {
    region: 'europe-west3',
    memory: '512MiB',
  },
  async (request) => {
    const { auth, data } = request;

    // Admin only
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userDoc = await db.collection('users').doc(auth.uid).get();
    if (!userDoc.exists || !userDoc.data()?.isAdmin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    try {
      const { resolved = false, limit = 50 } = data;

      const query = db
        .collection('suspiciousAnomalies')
        .where('resolved', '==', resolved)
        .orderBy('detectedAt', 'desc')
        .limit(limit);

      const snapshot = await query.get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      logger.error('Error fetching anomalies:', error);
      throw new HttpsError('internal', 'Failed to fetch anomalies');
    }
  }
);

// ============================================================================
// CALLABLE FUNCTION: Resolve Anomaly
// ============================================================================

export const resolveAnomaly = onCall(
  {
    region: 'europe-west3',
    memory: '256MiB',
  },
  async (request) => {
    const { auth, data } = request;

    // Admin only
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const userDoc = await db.collection('users').doc(auth.uid).get();
    if (!userDoc.exists || !userDoc.data()?.isAdmin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    try {
      const { anomalyId } = data;

      if (!anomalyId) {
        throw new HttpsError('invalid-argument', 'anomalyId required');
      }

      await db.collection('suspiciousAnomalies').doc(anomalyId).update({
        resolved: true,
        resolvedAt: serverTimestamp(),
        resolvedBy: auth.uid,
      });

      return { success: true };
    } catch (error) {
      logger.error('Error resolving anomaly:', error);
      throw new HttpsError('internal', 'Failed to resolve anomaly');
    }
  }
);

// ============================================================================
// SCHEDULED FUNCTION: Nightly Auditor
// ============================================================================

export const nightlyContractAuditor = onSchedule(
  {
    schedule: 'every day 02:00',
    timeZone: 'Europe/Warsaw',
    region: 'europe-west3',
    memory: '1GiB',
    timeoutSeconds: 540,
  },
  async (event) => {
    const startTime = Date.now();
    const reportId = db.collection('_').doc().id;

    logger.info('Starting nightly contract audit...');

    try {
      // Calculate date range (last 24 hours)
      const now = Timestamp.now();
      const yesterday = Timestamp.fromMillis(now.toMillis() - 24 * 60 * 60 * 1000);

      // Scan all transactions from the last 24 hours
      const results = await auditTransactions(yesterday, now);

      // Auto-correct inconsistencies
      const corrected = await autoCorrectInconsistencies(results.violations);

      // Generate report
      const report: NightlyAuditReport = {
        reportId,
        dateRange: {
          start: yesterday,
          end: now,
        },
        scannedTransactions: results.scanned,
        violationsFound: results.violations.length,
        violationsByType: countViolationsByType(results.violations),
        autoCorrected: corrected,
        blocked: results.blocked,
        anomaliesDetected: results.anomalies,
        topViolatingModules: results.topModules,
        summary: generateSummary(results, corrected),
        createdAt: Timestamp.now(),
      };

      // Save report
      await db.collection('auditReports').doc(reportId).set(report);

      // Send admin notification if violations found
      if (results.violations.length > 0) {
        await notifyAdminsOfViolations(report);
      }

      const duration = Date.now() - startTime;
      logger.info('Nightly audit complete', {
        reportId,
        scanned: results.scanned,
        violations: results.violations.length,
        corrected,
        durationMs: duration,
      });
    } catch (error) {
      logger.error('Nightly audit error:', error);
      throw error;
    }
  }
);

// ============================================================================
// AUDITOR HELPER FUNCTIONS
// ============================================================================

async function auditTransactions(
  startTime: Timestamp,
  endTime: Timestamp
): Promise<{
  scanned: number;
  violations: ContractViolation[];
  blocked: number;
  anomalies: number;
  topModules: Array<{ moduleName: string; violationCount: number }>;
}> {
  const violations: ContractViolation[] = [];
  const moduleViolations = new Map<string, number>();
  let scanned = 0;
  let blocked = 0;
  let anomalies = 0;

  // Scan audit logs
  const auditLogsSnap = await db
    .collection('contractAuditLogs')
    .where('timestamp', '>=', startTime)
    .where('timestamp', '<=', endTime)
    .get();

  for (const doc of auditLogsSnap.docs) {
    scanned++;
    const log = doc.data() as AuditLogEntry;

    if (log.validationResult.violations.length > 0) {
      violations.push(...log.validationResult.violations);

      if (log.validationResult.action === 'BLOCK') {
        blocked++;
      }

      // Track module violations
      for (const violation of log.validationResult.violations) {
        if (violation.moduleSource) {
          const count = moduleViolations.get(violation.moduleSource) || 0;
          moduleViolations.set(violation.moduleSource, count + 1);
        }
      }
    }
  }

  // Scan anomalies
  const anomaliesSnap = await db
    .collection('suspiciousAnomalies')
    .where('detectedAt', '>=', startTime)
    .where('detectedAt', '<=', endTime)
    .get();

  anomalies = anomaliesSnap.size;

  // Get top violating modules
  const topModules = Array.from(moduleViolations.entries())
    .map(([moduleName, violationCount]) => ({ moduleName, violationCount }))
    .sort((a, b) => b.violationCount - a.violationCount)
    .slice(0, 10);

  return { scanned, violations, blocked, anomalies, topModules };
}

async function autoCorrectInconsistencies(
  violations: ContractViolation[]
): Promise<number> {
  let corrected = 0;

  // Group violations by type for batch corrections
  const splitViolations = violations.filter(v => v.type === ViolationType.INVALID_SPLIT);
  const rateViolations = violations.filter(v => v.type === ViolationType.INVALID_BILLING_RATE);

  // Auto-correct revenue splits in pending transactions
  for (const violation of splitViolations) {
    try {
      // Find pending transactions with incorrect splits
      // This would need to be implemented based on your transaction structure
      // For now, just log for manual review
      logger.warn('Split violation requires manual review', { violation });
    } catch (error) {
      logger.error('Auto-correction error:', error);
    }
  }

  // Auto-correct billing rates
  for (const violation of rateViolations) {
    try {
      logger.warn('Rate violation requires manual review', { violation });
    } catch (error) {
      logger.error('Auto-correction error:', error);
    }
  }

  return corrected;
}

function countViolationsByType(violations: ContractViolation[]): Record<ViolationType, number> {
  const counts: Record<string, number> = {};

  for (const violation of violations) {
    counts[violation.type] = (counts[violation.type] || 0) + 1;
  }

  return counts as Record<ViolationType, number>;
}

function generateSummary(
  results: {
    scanned: number;
    violations: ContractViolation[];
    blocked: number;
    anomalies: number;
  },
  corrected: number
): string {
  const criticalCount = results.violations.filter(v => v.severity === 'CRITICAL').length;
  const highCount = results.violations.filter(v => v.severity === 'HIGH').length;

  return `Scanned ${results.scanned} transactions. Found ${results.violations.length} violations (${criticalCount} critical, ${highCount} high). Blocked ${results.blocked} transactions. Auto-corrected ${corrected} issues. Detected ${results.anomalies} suspicious anomalies.`;
}

async function notifyAdminsOfViolations(report: NightlyAuditReport): Promise<void> {
  try {
    // Get all admin users
    const adminsSnap = await db.collection('users').where('isAdmin', '==', true).get();

    // Create notification for each admin
    const batch = db.batch();
    for (const adminDoc of adminsSnap.docs) {
      const notificationRef = db.collection('adminNotifications').doc();
      batch.set(notificationRef, {
        type: 'nightly_audit_violations',
        reportId: report.reportId,
        summary: report.summary,
        violationsFound: report.violationsFound,
        timestamp: serverTimestamp(),
        read: false,
      });
    }

    await batch.commit();
    logger.info(`Notified ${adminsSnap.size} admins of violations`);
  } catch (error) {
    logger.error('Failed to notify admins:', error);
  }
}

// ============================================================================
// SCHEDULED FUNCTION: Weekly Audit Report
// ============================================================================

export const weeklyContractReport = onSchedule(
  {
    schedule: 'every monday 09:00',
    timeZone: 'Europe/Warsaw',
    region: 'europe-west3',
    memory: '512MiB',
    timeoutSeconds: 300,
  },
  async (event) => {
    logger.info('Starting weekly contract report generation...');

    try {
      // Get all daily reports from the last 7 days
      const weekAgo = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const reportsSnap = await db
        .collection('auditReports')
        .where('createdAt', '>=', weekAgo)
        .orderBy('createdAt', 'asc')
        .get();

      // Aggregate statistics
      let totalScanned = 0;
      let totalViolations = 0;
      let totalBlocked = 0;
      let totalCorrected = 0;
      let totalAnomalies = 0;

      const violationsByType: Record<string, number> = {};

      for (const doc of reportsSnap.docs) {
        const report = doc.data() as NightlyAuditReport;
        totalScanned += report.scannedTransactions;
        totalViolations += report.violationsFound;
        totalBlocked += report.blocked;
        totalCorrected += report.autoCorrected;
        totalAnomalies += report.anomaliesDetected;

        // Aggregate violation types
        for (const [type, count] of Object.entries(report.violationsByType)) {
          violationsByType[type] = (violationsByType[type] || 0) + count;
        }
      }

      // Generate weekly summary
      const weeklyReport = {
        reportId: db.collection('_').doc().id,
        period: 'weekly',
        startDate: weekAgo,
        endDate: Timestamp.now(),
        totalScanned,
        totalViolations,
        totalBlocked,
        totalCorrected,
        totalAnomalies,
        violationsByType,
        dailyReports: reportsSnap.docs.map(d => d.id),
        createdAt: Timestamp.now(),
      };

      await db.collection('weeklyAuditReports').add(weeklyReport);

      logger.info('Weekly report generated', {
        totalScanned,
        totalViolations,
        totalAnomalies,
      });
    } catch (error) {
      logger.error('Weekly report error:', error);
      throw error;
    }
  }
);