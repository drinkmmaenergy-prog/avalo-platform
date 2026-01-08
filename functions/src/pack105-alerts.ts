/**
 * PACK 105 — Finance Alerts & Notifications
 * 
 * Alert system for internal staff (not visible to creators)
 * 
 * Alert Types:
 * - Failed reconciliation
 * - KYC review backlog
 * - VAT/invoice generation errors
 * - Suspicious payout patterns
 */

import { logger } from 'firebase-functions/v2';
import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// ALERT TYPES
// ============================================================================

export type FinanceAlertType =
  | 'RECONCILIATION_FAILED'
  | 'KYC_BACKLOG_HIGH'
  | 'VAT_GENERATION_ERROR'
  | 'SUSPICIOUS_PAYOUT_PATTERN'
  | 'CRITICAL_FINANCE_CASE'
  | 'PAYOUT_PROCESSING_DELAYED'
  | 'BALANCE_DISCREPANCY'
  | 'PSP_WEBHOOK_FAILURE';

export type FinanceAlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface FinanceAlert {
  id: string;
  type: FinanceAlertType;
  severity: FinanceAlertSeverity;
  title: string;
  message: string;
  context: Record<string, any>;
  relatedId?: string;
  userId?: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Timestamp;
  createdAt: Timestamp;
}

// ============================================================================
// ALERT CREATION
// ============================================================================

/**
 * Create a finance alert
 */
export async function createFinanceAlert(params: {
  type: FinanceAlertType;
  severity: FinanceAlertSeverity;
  title: string;
  message: string;
  context?: Record<string, any>;
  relatedId?: string;
  userId?: string;
}): Promise<string> {
  const id = generateId();

  const alert: Omit<FinanceAlert, 'createdAt'> & { createdAt: any } = {
    id,
    type: params.type,
    severity: params.severity,
    title: params.title,
    message: params.message,
    context: params.context || {},
    relatedId: params.relatedId,
    userId: params.userId,
    acknowledged: false,
    createdAt: serverTimestamp(),
  };

  try {
    await db.collection('finance_alerts').doc(id).set(alert);

    logger.warn(`[FinanceAlert] ${params.severity}: ${params.title}`, {
      type: params.type,
      relatedId: params.relatedId,
      userId: params.userId,
    });

    if (params.severity === 'CRITICAL' || params.severity === 'HIGH') {
      await notifyAdminTeam(alert);
    }

    return id;
  } catch (error: any) {
    logger.error('[FinanceAlert] Failed to create alert', {
      error: error.message,
      type: params.type,
    });
    throw error;
  }
}

/**
 * Notify admin team (stub for email/Slack integration)
 */
async function notifyAdminTeam(alert: any): Promise<void> {
  logger.info('[FinanceAlert] Would notify admin team', {
    alertType: alert.type,
    severity: alert.severity,
    title: alert.title,
  });
}

// ============================================================================
// SPECIFIC ALERT CREATORS
// ============================================================================

/**
 * Alert: Reconciliation failed
 */
export async function alertReconciliationFailed(params: {
  payoutId: string;
  reason: string;
  discrepancy?: number;
}): Promise<string> {
  return createFinanceAlert({
    type: 'RECONCILIATION_FAILED',
    severity: 'HIGH',
    title: 'Payout Reconciliation Failed',
    message: `Failed to reconcile payout ${params.payoutId}: ${params.reason}`,
    context: {
      payoutId: params.payoutId,
      reason: params.reason,
      discrepancy: params.discrepancy,
    },
    relatedId: params.payoutId,
  });
}

/**
 * Alert: KYC backlog is high
 */
export async function alertKycBacklogHigh(params: {
  pendingCount: number;
  oldestDays: number;
  threshold: number;
}): Promise<string> {
  const severity: FinanceAlertSeverity = 
    params.oldestDays > 7 ? 'CRITICAL' :
    params.oldestDays > 5 ? 'HIGH' : 'MEDIUM';

  return createFinanceAlert({
    type: 'KYC_BACKLOG_HIGH',
    severity,
    title: 'KYC Review Backlog High',
    message: `${params.pendingCount} pending KYC reviews. Oldest submission: ${params.oldestDays} days ago.`,
    context: {
      pendingCount: params.pendingCount,
      oldestDays: params.oldestDays,
      threshold: params.threshold,
    },
  });
}

/**
 * Alert: VAT invoice generation error
 */
export async function alertVatGenerationError(params: {
  userId: string;
  transactionId: string;
  error: string;
}): Promise<string> {
  return createFinanceAlert({
    type: 'VAT_GENERATION_ERROR',
    severity: 'HIGH',
    title: 'VAT Invoice Generation Failed',
    message: `Failed to generate VAT invoice for transaction ${params.transactionId}: ${params.error}`,
    context: {
      userId: params.userId,
      transactionId: params.transactionId,
      error: params.error,
    },
    relatedId: params.transactionId,
    userId: params.userId,
  });
}

/**
 * Alert: Suspicious payout pattern detected
 */
export async function alertSuspiciousPayoutPattern(params: {
  userId: string;
  pattern: string;
  details: Record<string, any>;
}): Promise<string> {
  return createFinanceAlert({
    type: 'SUSPICIOUS_PAYOUT_PATTERN',
    severity: 'HIGH',
    title: 'Suspicious Payout Pattern Detected',
    message: `Suspicious pattern detected for user ${params.userId}: ${params.pattern}`,
    context: {
      userId: params.userId,
      pattern: params.pattern,
      ...params.details,
    },
    userId: params.userId,
  });
}

/**
 * Alert: Critical finance case created
 */
export async function alertCriticalFinanceCase(params: {
  caseId: string;
  caseType: string;
  reason: string;
}): Promise<string> {
  return createFinanceAlert({
    type: 'CRITICAL_FINANCE_CASE',
    severity: 'CRITICAL',
    title: 'Critical Finance Case Created',
    message: `Critical finance case (${params.caseType}): ${params.reason}`,
    context: {
      caseId: params.caseId,
      caseType: params.caseType,
      reason: params.reason,
    },
    relatedId: params.caseId,
  });
}

/**
 * Alert: Payout processing delayed
 */
export async function alertPayoutProcessingDelayed(params: {
  payoutId: string;
  userId: string;
  daysDelayed: number;
}): Promise<string> {
  const severity: FinanceAlertSeverity = 
    params.daysDelayed > 7 ? 'CRITICAL' :
    params.daysDelayed > 5 ? 'HIGH' : 'MEDIUM';

  return createFinanceAlert({
    type: 'PAYOUT_PROCESSING_DELAYED',
    severity,
    title: 'Payout Processing Delayed',
    message: `Payout ${params.payoutId} has been processing for ${params.daysDelayed} days`,
    context: {
      payoutId: params.payoutId,
      userId: params.userId,
      daysDelayed: params.daysDelayed,
    },
    relatedId: params.payoutId,
    userId: params.userId,
  });
}

/**
 * Alert: Balance discrepancy detected
 */
export async function alertBalanceDiscrepancy(params: {
  userId: string;
  expectedBalance: number;
  actualBalance: number;
  difference: number;
}): Promise<string> {
  const severity: FinanceAlertSeverity = 
    Math.abs(params.difference) > 1000 ? 'CRITICAL' :
    Math.abs(params.difference) > 100 ? 'HIGH' : 'MEDIUM';

  return createFinanceAlert({
    type: 'BALANCE_DISCREPANCY',
    severity,
    title: 'Balance Discrepancy Detected',
    message: `Balance mismatch for user ${params.userId}: Expected ${params.expectedBalance}, found ${params.actualBalance}`,
    context: {
      userId: params.userId,
      expectedBalance: params.expectedBalance,
      actualBalance: params.actualBalance,
      difference: params.difference,
    },
    userId: params.userId,
  });
}

/**
 * Alert: PSP webhook failure
 */
export async function alertPspWebhookFailure(params: {
  provider: string;
  eventType: string;
  eventId: string;
  error: string;
}): Promise<string> {
  return createFinanceAlert({
    type: 'PSP_WEBHOOK_FAILURE',
    severity: 'HIGH',
    title: 'PSP Webhook Failure',
    message: `${params.provider} webhook failed for ${params.eventType}: ${params.error}`,
    context: {
      provider: params.provider,
      eventType: params.eventType,
      eventId: params.eventId,
      error: params.error,
    },
    relatedId: params.eventId,
  });
}

// ============================================================================
// ALERT MANAGEMENT
// ============================================================================

/**
 * Acknowledge a finance alert
 */
export async function acknowledgeFinanceAlert(
  alertId: string,
  adminUid: string
): Promise<void> {
  try {
    await db.collection('finance_alerts').doc(alertId).update({
      acknowledged: true,
      acknowledgedBy: adminUid,
      acknowledgedAt: serverTimestamp(),
    });

    logger.info('[FinanceAlert] Acknowledged alert', {
      alertId,
      adminUid,
    });
  } catch (error: any) {
    logger.error('[FinanceAlert] Failed to acknowledge alert', {
      error: error.message,
      alertId,
    });
    throw error;
  }
}

/**
 * Get unacknowledged finance alerts
 */
export async function getUnacknowledgedAlerts(
  severity?: FinanceAlertSeverity,
  limit: number = 50
): Promise<FinanceAlert[]> {
  try {
    let query: FirebaseFirestore.Query = db
      .collection('finance_alerts')
      .where('acknowledged', '==', false);

    if (severity) {
      query = query.where('severity', '==', severity);
    }

    query = query.orderBy('createdAt', 'desc').limit(limit);

    const snapshot = await query.get();
    return snapshot.docs.map(doc => doc.data() as FinanceAlert);
  } catch (error: any) {
    logger.error('[FinanceAlert] Failed to get unacknowledged alerts', {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get alerts for a specific user or related ID
 */
export async function getAlertsForEntity(
  entityId: string,
  entityType: 'user' | 'related',
  limit: number = 20
): Promise<FinanceAlert[]> {
  try {
    const field = entityType === 'user' ? 'userId' : 'relatedId';
    
    const snapshot = await db
      .collection('finance_alerts')
      .where(field, '==', entityId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => doc.data() as FinanceAlert);
  } catch (error: any) {
    logger.error('[FinanceAlert] Failed to get alerts for entity', {
      error: error.message,
      entityId,
      entityType,
    });
    throw error;
  }
}

/**
 * Get alert statistics
 */
export async function getAlertStatistics(): Promise<{
  total: number;
  unacknowledged: number;
  bySeverity: Record<FinanceAlertSeverity, number>;
  byType: Record<FinanceAlertType, number>;
}> {
  try {
    const snapshot = await db
      .collection('finance_alerts')
      .where('acknowledged', '==', false)
      .get();

    const bySeverity: Record<FinanceAlertSeverity, number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0,
    };

    const byType: Record<string, number> = {};

    snapshot.forEach(doc => {
      const alert = doc.data() as FinanceAlert;
      bySeverity[alert.severity]++;
      byType[alert.type] = (byType[alert.type] || 0) + 1;
    });

    return {
      total: snapshot.size,
      unacknowledged: snapshot.size,
      bySeverity,
      byType: byType as Record<FinanceAlertType, number>,
    };
  } catch (error: any) {
    logger.error('[FinanceAlert] Failed to get alert statistics', {
      error: error.message,
    });
    throw error;
  }
}

// ============================================================================
// SCHEDULED ALERT CHECKS
// ============================================================================

/**
 * Check for delayed payouts and create alerts
 */
export async function checkDelayedPayouts(): Promise<number> {
  try {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threshold = Timestamp.fromDate(threeDaysAgo);

    const snapshot = await db
      .collection('payoutRequests')
      .where('status', '==', 'processing')
      .where('createdAt', '<', threshold)
      .get();

    let alertsCreated = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const createdAt = data.createdAt.toDate();
      const now = new Date();
      const daysDelayed = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

      await alertPayoutProcessingDelayed({
        payoutId: doc.id,
        userId: data.userId,
        daysDelayed,
      });

      alertsCreated++;
    }

    logger.info('[FinanceAlert] Checked delayed payouts', {
      found: snapshot.size,
      alertsCreated,
    });

    return alertsCreated;
  } catch (error: any) {
    logger.error('[FinanceAlert] Failed to check delayed payouts', {
      error: error.message,
    });
    return 0;
  }
}

/**
 * Check KYC backlog and create alert if needed
 */
export async function checkKycBacklog(): Promise<boolean> {
  try {
    const pendingSnapshot = await db
      .collection('kyc_audit_records')
      .where('status', '==', 'PENDING')
      .orderBy('createdAt', 'asc')
      .get();

    const pendingCount = pendingSnapshot.size;

    if (pendingCount === 0) {
      return false;
    }

    const oldestDoc = pendingSnapshot.docs[0];
    const oldestData = oldestDoc.data();
    const oldestTimestamp = oldestData.createdAt as Timestamp;
    const now = Date.now();
    const oldestDays = Math.floor((now - oldestTimestamp.toMillis()) / (1000 * 60 * 60 * 24));

    const threshold = 3;

    if (oldestDays >= threshold) {
      await alertKycBacklogHigh({
        pendingCount,
        oldestDays,
        threshold,
      });

      logger.info('[FinanceAlert] KYC backlog alert created', {
        pendingCount,
        oldestDays,
      });

      return true;
    }

    return false;
  } catch (error: any) {
    logger.error('[FinanceAlert] Failed to check KYC backlog', {
      error: error.message,
    });
    return false;
  }
}