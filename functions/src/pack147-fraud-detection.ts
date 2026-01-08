/**
 * PACK 147 — Fraud Detection Engine
 * 
 * Detects and prevents refund fraud patterns.
 * 
 * PATTERNS DETECTED:
 * - Refund farming (buy → consume → refund repeatedly)
 * - Token laundering (back-and-forth transfers)
 * - Partial delivery scams (creator side)
 * - Emotional blackmail attempts
 * - Romance manipulation claims
 * - Coordinated attacks
 * - Account hopping
 */

import { db, serverTimestamp, generateId, increment } from './init';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { FraudPattern, FraudDetectionRecord } from './pack147-types';

// ============================================================================
// CONSTANTS
// ============================================================================

const FRAUD_THRESHOLDS = {
  REFUND_FARMING: {
    refundsIn30Days: 5,
    successRate: 0.8,          // >80% success rate suspicious
    consumptionBeforeRefund: 0.9  // >90% consumed before refund
  },
  TOKEN_LAUNDERING: {
    backAndForthCount: 3,
    within24Hours: true
  },
  COORDINATED_ATTACK: {
    reportsAgainstSameCreator: 3,
    withinTimeWindow: 7 * 24 * 60 * 60 * 1000  // 7 days
  },
  ACCOUNT_HOPPING: {
    newAccountDays: 30,
    immediateRefundRequest: true
  }
};

// ============================================================================
// FRAUD DETECTION
// ============================================================================

/**
 * Detect fraud patterns for a user action
 */
export async function detectFraudPattern(params: {
  userId: string;
  action: 'refund_request' | 'dispute_filed' | 'transaction';
  transactionId?: string;
  metadata?: Record<string, any>;
}): Promise<{
  isFraud: boolean;
  pattern?: FraudPattern;
  confidence: number;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}> {
  
  const { userId, action, transactionId, metadata = {} } = params;
  
  // Check all fraud patterns
  const checks = await Promise.all([
    checkRefundFarming(userId),
    checkTokenLaundering(userId),
    checkEmotionalBlackmail(userId, metadata),
    checkRomanceManipulation(metadata),
    checkCoordinatedAttack(userId, metadata),
    checkAccountHopping(userId)
  ]);
  
  // Find highest confidence fraud pattern
  const fraudDetected = checks.find(check => check.isFraud);
  
  if (fraudDetected && fraudDetected.isFraud) {
    // Record fraud detection
    await recordFraudDetection({
      userId,
      pattern: fraudDetected.pattern!,
      confidence: fraudDetected.confidence,
      severity: fraudDetected.severity!,
      metrics: fraudDetected.metrics || {},
      action
    });
    
    return fraudDetected;
  }
  
  return { isFraud: false, confidence: 0 };
}

/**
 * Check for refund farming pattern
 */
async function checkRefundFarming(userId: string): Promise<{
  isFraud: boolean;
  pattern?: FraudPattern;
  confidence: number;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  metrics?: Record<string, any>;
}> {
  
  const thirtyDaysAgo = Timestamp.fromMillis(Date.now() - (30 * 24 * 60 * 60 * 1000));
  
  // Count refunds in last 30 days
  const refundsSnapshot = await db.collection('refund_requests')
    .where('requesterId', '==', userId)
    .where('requestedAt', '>=', thirtyDaysAgo)
    .get();
  
  const refunds = refundsSnapshot.docs.map(doc => doc.data());
  const totalRefunds = refunds.length;
  
  if (totalRefunds < FRAUD_THRESHOLDS.REFUND_FARMING.refundsIn30Days) {
    return { isFraud: false, confidence: 0 };
  }
  
  // Calculate success rate
  const approvedRefunds = refunds.filter(r => r.status === 'APPROVED' || r.status === 'COMPLETED').length;
  const successRate = approvedRefunds / totalRefunds;
  
  if (successRate < FRAUD_THRESHOLDS.REFUND_FARMING.successRate) {
    return { isFraud: false, confidence: 0 };
  }
  
  // Check consumption patterns (if available)
  let avgConsumption = 0;
  const consumptionData = refunds.filter(r => r.metadata?.consumptionPercentage).length;
  
  if (consumptionData > 0) {
    const totalConsumption = refunds.reduce((sum, r) => sum + (r.metadata?.consumptionPercentage || 0), 0);
    avgConsumption = totalConsumption / consumptionData;
  }
  
  const confidence = Math.min(
    (totalRefunds / FRAUD_THRESHOLDS.REFUND_FARMING.refundsIn30Days) * 0.5 +
    successRate * 0.3 +
    (avgConsumption > FRAUD_THRESHOLDS.REFUND_FARMING.consumptionBeforeRefund ? 0.2 : 0),
    1.0
  );
  
  let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM';
  if (confidence > 0.8) severity = 'CRITICAL';
  else if (confidence > 0.6) severity = 'HIGH';
  
  return {
    isFraud: true,
    pattern: 'REFUND_FARMING',
    confidence,
    severity,
    metrics: {
      refundCount30Days: totalRefunds,
      refundSuccessRate: successRate,
      averageConsumptionBeforeRefund: avgConsumption
    }
  };
}

/**
 * Check for token laundering pattern
 */
async function checkTokenLaundering(userId: string): Promise<{
  isFraud: boolean;
  pattern?: FraudPattern;
  confidence: number;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  metrics?: Record<string, any>;
}> {
  
  const twentyFourHoursAgo = Timestamp.fromMillis(Date.now() - (24 * 60 * 60 * 1000));
  
  // Get transactions in last 24 hours
  const transactionsSnapshot = await db.collection('transactions')
    .where('uid', '==', userId)
    .where('createdAt', '>=', twentyFourHoursAgo)
    .get();
  
  const transactions = transactionsSnapshot.docs.map(doc => doc.data());
  
  // Look for back-and-forth pattern with same user
  const counterpartyMap = new Map<string, { sent: number; received: number }>();
  
  transactions.forEach(tx => {
    const counterparty = tx.metadata?.toUserId || tx.metadata?.fromUserId;
    if (!counterparty || counterparty === userId) return;
    
    const entry = counterpartyMap.get(counterparty) || { sent: 0, received: 0 };
    
    if (tx.amount > 0) {
      entry.received++;
    } else {
      entry.sent++;
    }
    
    counterpartyMap.set(counterparty, entry);
  });
  
  // Check for suspicious back-and-forth
  for (const [counterparty, counts] of Array.from(counterpartyMap.entries())) {
    const backAndForth = Math.min(counts.sent, counts.received);
    
    if (backAndForth >= FRAUD_THRESHOLDS.TOKEN_LAUNDERING.backAndForthCount) {
      const confidence = Math.min(backAndForth / 10, 1.0);
      
      return {
        isFraud: true,
        pattern: 'TOKEN_LAUNDERING',
        confidence,
        severity: confidence > 0.7 ? 'CRITICAL' : 'HIGH',
        metrics: {
          backAndForthCount: backAndForth,
          counterpartyUserId: counterparty
        }
      };
    }
  }
  
  return { isFraud: false, confidence: 0 };
}

/**
 * Check for emotional blackmail in refund description
 */
async function checkEmotionalBlackmail(
  userId: string,
  metadata: Record<string, any>
): Promise<{
  isFraud: boolean;
  pattern?: FraudPattern;
  confidence: number;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}> {
  
  const description = metadata.description?.toLowerCase() || '';
  
  const blackmailKeywords = [
    'report you',
    'expose you',
    'tell everyone',
    'ruin your reputation',
    'leave bad reviews',
    'contact authorities',
    'sue you',
    'lawyer',
    'better refund',
    'or else'
  ];
  
  const matchCount = blackmailKeywords.filter(keyword => description.includes(keyword)).length;
  
  if (matchCount >= 2) {
    return {
      isFraud: true,
      pattern: 'EMOTIONAL_BLACKMAIL',
      confidence: Math.min(matchCount / 5, 1.0),
      severity: 'HIGH'
    };
  }
  
  return { isFraud: false, confidence: 0 };
}

/**
 * Check for romance manipulation claims
 */
async function checkRomanceManipulation(
  metadata: Record<string, any>
): Promise<{
  isFraud: boolean;
  pattern?: FraudPattern;
  confidence: number;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}> {
  
  const description = metadata.description?.toLowerCase() || '';
  const reason = metadata.reason?.toLowerCase() || '';
  
  const romanceKeywords = [
    'expected romantic',
    'thought we were dating',
    'led me on',
    'promised relationship',
    'not enough attention',
    'not nice enough',
    'expected more affection',
    'romantic service',
    'escort',
    'date',
    'girlfriend experience',
    'boyfriend experience'
  ];
  
  const matchCount = romanceKeywords.filter(keyword => 
    description.includes(keyword) || reason.includes(keyword)
  ).length;
  
  if (matchCount >= 1) {
    return {
      isFraud: true,
      pattern: 'ROMANCE_MANIPULATION',
      confidence: 1.0,  // Zero tolerance
      severity: 'CRITICAL'
    };
  }
  
  return { isFraud: false, confidence: 0 };
}

/**
 * Check for coordinated attack pattern
 */
async function checkCoordinatedAttack(
  userId: string,
  metadata: Record<string, any>
): Promise<{
  isFraud: boolean;
  pattern?: FraudPattern;
  confidence: number;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  metrics?: Record<string, any>;
}> {
  
  const targetCreatorId = metadata.recipientId;
  if (!targetCreatorId) {
    return { isFraud: false, confidence: 0 };
  }
  
  const windowStart = Timestamp.fromMillis(
    Date.now() - FRAUD_THRESHOLDS.COORDINATED_ATTACK.withinTimeWindow
  );
  
  // Count refund requests against same creator in time window
  const refundsSnapshot = await db.collection('refund_requests')
    .where('recipientId', '==', targetCreatorId)
    .where('requestedAt', '>=', windowStart)
    .get();
  
  const uniqueRequesters = new Set(refundsSnapshot.docs.map(doc => doc.data().requesterId));
  
  if (uniqueRequesters.size >= FRAUD_THRESHOLDS.COORDINATED_ATTACK.reportsAgainstSameCreator) {
    // Check if requesters are connected (shared devices, IPs, etc.)
    const coordination = await detectCoordination(Array.from(uniqueRequesters));
    
    if (coordination.isCoordinated) {
      return {
        isFraud: true,
        pattern: 'COORDINATED_ATTACK',
        confidence: coordination.confidence,
        severity: 'CRITICAL',
        metrics: {
          coordinatedAccountsDetected: Array.from(uniqueRequesters),
          targetCreatorId
        }
      };
    }
  }
  
  return { isFraud: false, confidence: 0 };
}

/**
 * Detect coordination between accounts
 */
async function detectCoordination(userIds: string[]): Promise<{
  isCoordinated: boolean;
  confidence: number;
}> {
  
  // Check for shared device fingerprints or IP addresses
  const deviceMap = new Map<string, string[]>();
  
  for (const userId of userIds) {
    const userSnap = await db.collection('users').doc(userId).get();
    const userData = userSnap.data();
    
    const deviceId = userData?.deviceFingerprint;
    if (deviceId) {
      const users = deviceMap.get(deviceId) || [];
      users.push(userId);
      deviceMap.set(deviceId, users);
    }
  }
  
  // Check for shared devices
  for (const [_, users] of Array.from(deviceMap.entries())) {
    if (users.length >= 2) {
      return {
        isCoordinated: true,
        confidence: Math.min(users.length / userIds.length, 1.0)
      };
    }
  }
  
  return { isCoordinated: false, confidence: 0 };
}

/**
 * Check for account hopping pattern
 */
async function checkAccountHopping(userId: string): Promise<{
  isFraud: boolean;
  pattern?: FraudPattern;
  confidence: number;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}> {
  
  const userSnap = await db.collection('users').doc(userId).get();
  if (!userSnap.exists) {
    return { isFraud: false, confidence: 0 };
  }
  
  const userData = userSnap.data();
  const createdAt = userData?.createdAt?.toDate();
  
  if (!createdAt) {
    return { isFraud: false, confidence: 0 };
  }
  
  const accountAgeDays = (Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000);
  
  if (accountAgeDays > FRAUD_THRESHOLDS.ACCOUNT_HOPPING.newAccountDays) {
    return { isFraud: false, confidence: 0 };
  }
  
  // Check for immediate refund requests
  const refundsSnapshot = await db.collection('refund_requests')
    .where('requesterId', '==', userId)
    .limit(1)
    .get();
  
  if (!refundsSnapshot.empty) {
    const firstRefund = refundsSnapshot.docs[0].data();
    const refundRequestDays = (Date.now() - firstRefund.requestedAt.toMillis()) / (24 * 60 * 60 * 1000);
    
    if (refundRequestDays < 7) {
      return {
        isFraud: true,
        pattern: 'ACCOUNT_HOPPING',
        confidence: 0.7,
        severity: 'MEDIUM'
      };
    }
  }
  
  return { isFraud: false, confidence: 0 };
}

/**
 * Record fraud detection
 */
async function recordFraudDetection(params: {
  userId: string;
  pattern: FraudPattern;
  confidence: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  metrics: Record<string, any>;
  action: string;
}): Promise<void> {
  
  const { userId, pattern, confidence, severity, metrics, action } = params;
  
  const recordId = generateId();
  
  // Determine action to take
  let actionTaken: FraudDetectionRecord['actionTaken'] = 'FLAGGED';
  
  if (severity === 'CRITICAL') {
    actionTaken = 'BAN';
  } else if (severity === 'HIGH') {
    actionTaken = 'PAYOUT_FREEZE';
  } else if (severity === 'MEDIUM') {
    actionTaken = 'WARNING';
  }
  
  const record: FraudDetectionRecord = {
    recordId,
    userId,
    pattern,
    confidence,
    severity,
    detectionMetrics: metrics,
    actionTaken,
    actionReason: `Fraud pattern detected: ${pattern} (confidence: ${(confidence * 100).toFixed(0)}%)`,
    detectedAt: Timestamp.now()
  };
  
  await db.collection('fraud_detection_records').doc(recordId).set(record);
  
  // Apply penalty
  await applyFraudPenalty(userId, actionTaken, record.actionReason);
  
  logger.warn(`Fraud detected: ${pattern} for user ${userId} (${severity})`);
}

/**
 * Apply fraud penalty to user
 */
async function applyFraudPenalty(
  userId: string,
  action: FraudDetectionRecord['actionTaken'],
  reason: string
): Promise<void> {
  
  const userRef = db.collection('users').doc(userId);
  
  switch (action) {
    case 'FLAGGED':
      await userRef.update({
        'fraud.flagged': true,
        'fraud.flaggedAt': serverTimestamp(),
        'fraud.flagReason': reason,
        updatedAt: serverTimestamp()
      });
      break;
    
    case 'WARNING':
      await userRef.update({
        'fraud.warnings': FieldValue.arrayUnion({
          reason,
          timestamp: serverTimestamp()
        }),
        updatedAt: serverTimestamp()
      });
      break;
    
    case 'PAYOUT_FREEZE':
      await userRef.update({
        'wallet.payoutsFrozen': true,
        'wallet.freezeReason': reason,
        'wallet.frozenAt': serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      break;
    
    case 'ACCOUNT_SUSPENSION':
      await userRef.update({
        'account.status': 'suspended',
        'account.suspensionReason': reason,
        'account.suspendedAt': serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      break;
    
    case 'BAN':
      await userRef.update({
        'account.status': 'banned',
        'account.banReason': reason,
        'account.bannedAt': serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      break;
  }
  
  logger.info(`Applied fraud penalty to ${userId}: ${action}`);
}

/**
 * Get fraud history for user
 */
export async function getUserFraudHistory(userId: string): Promise<FraudDetectionRecord[]> {
  
  const snapshot = await db.collection('fraud_detection_records')
    .where('userId', '==', userId)
    .orderBy('detectedAt', 'desc')
    .limit(50)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as FraudDetectionRecord);
}