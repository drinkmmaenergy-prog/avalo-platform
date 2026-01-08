/**
 * PACK 304 — Admin Financial Console & Reconciliation
 * Finance Anomaly Detection
 * 
 * Detects financial inconsistencies:
 * - Negative balances
 * - Balance mismatches
 * - Invalid revenue splits
 * - Payouts exceeding earnings
 * - Refund inconsistencies
 * 
 * @package avaloapp
 * @version 1.0.0
 */

import { db, generateId, serverTimestamp } from './init';
import { logger } from 'firebase-functions/v2';
import {
  FinanceAnomaly,
  FinanceAnomalyType,
  AnomalyDetectionInput,
  AnomalyDetectionResult,
  UserFinancialSummary,
  FINANCE_CONSTANTS,
} from './types/pack304-admin-finance.types';

// ============================================================================
// USER-LEVEL ANOMALY DETECTION
// ============================================================================

/**
 * Check user's wallet balance consistency
 */
export async function checkUserBalanceConsistency(
  userId: string
): Promise<{
  isConsistent: boolean;
  summary: UserFinancialSummary;
  anomalies: FinanceAnomaly[];
}> {
  const anomalies: FinanceAnomaly[] = [];

  try {
    // Get user's wallet
    const walletDoc = await db.collection('wallets').doc(userId).get();
    
    if (!walletDoc.exists) {
      // No wallet = no anomaly (new user or no activity)
      return {
        isConsistent: true,
        summary: {
          userId,
          tokensPurchased: 0,
          tokensEarned: 0,
          tokensSpent: 0,
          tokensRefunded: 0,
          tokensWithdrawn: 0,
          walletBalance: 0,
          expectedBalance: 0,
          balanceDiscrepancy: 0,
          hasDiscrepancy: false,
          discrepancyThreshold: FINANCE_CONSTANTS.BALANCE_DISCREPANCY_THRESHOLD,
        },
        anomalies: [],
      };
    }

    const wallet = walletDoc.data()!;
    const walletBalance = wallet.tokensBalance || 0;

    // Calculate expected balance from transaction history
    const txQuery = db
      .collection('walletTransactions')
      .where('userId', '==', userId);

    const txSnapshot = await txQuery.get();

    let tokensPurchased = 0;
    let tokensEarned = 0;
    let tokensSpent = 0;
    let tokensRefunded = 0;
    let tokensWithdrawn = 0;

    for (const txDoc of txSnapshot.docs) {
      const tx = txDoc.data();
      const amount = tx.amountTokens || 0;
      const txType = tx.type as string;

      switch (txType) {
        case 'TOKEN_PURCHASE':
          tokensPurchased += amount;
          break;

        case 'CHAT_SPEND':
        case 'CALL_SPEND':
        case 'CALENDAR_BOOKING':
        case 'EVENT_TICKET':
          if (tx.direction === 'OUT') {
            tokensSpent += amount;
          } else if (tx.direction === 'IN') {
            tokensEarned += amount;
          }
          break;

        case 'CALENDAR_REFUND':
        case 'EVENT_REFUND':
          tokensRefunded += amount;
          break;

        case 'PAYOUT':
          tokensWithdrawn += amount;
          break;

        default:
          // Handle other transaction types
          if (tx.direction === 'IN') {
            tokensEarned += amount;
          } else if (tx.direction === 'OUT') {
            tokensSpent += amount;
          }
          break;
      }
    }

    const expectedBalance = tokensPurchased + tokensEarned - tokensSpent + tokensRefunded - tokensWithdrawn;
    const balanceDiscrepancy = walletBalance - expectedBalance;
    const hasDiscrepancy = Math.abs(balanceDiscrepancy) > FINANCE_CONSTANTS.BALANCE_DISCREPANCY_THRESHOLD;

    const summary: UserFinancialSummary = {
      userId,
      tokensPurchased,
      tokensEarned,
      tokensSpent,
      tokensRefunded,
      tokensWithdrawn,
      walletBalance,
      expectedBalance,
      balanceDiscrepancy,
      hasDiscrepancy,
      discrepancyThreshold: FINANCE_CONSTANTS.BALANCE_DISCREPANCY_THRESHOLD,
    };

    // Detect anomalies
    if (walletBalance < 0) {
      anomalies.push(createAnomaly({
        type: 'NEGATIVE_BALANCE',
        userId,
        details: `User has negative wallet balance: ${walletBalance} tokens`,
        severity: 'CRITICAL',
        metadata: { walletBalance },
      }));
    }

    if (hasDiscrepancy) {
      const severity = Math.abs(balanceDiscrepancy) > 100 ? 'HIGH' : 'MEDIUM';
      anomalies.push(createAnomaly({
        type: 'MISMATCH_BALANCE',
        userId,
        details: `Wallet balance (${walletBalance}) doesn't match expected (${expectedBalance}). Discrepancy: ${balanceDiscrepancy} tokens`,
        severity,
        metadata: {
          walletBalance,
          expectedBalance,
          balanceDiscrepancy,
          tokensPurchased,
          tokensEarned,
          tokensSpent,
          tokensRefunded,
          tokensWithdrawn,
        },
      }));
    }

    // Check if withdrawals exceed earnings
    if (tokensWithdrawn > tokensEarned) {
      anomalies.push(createAnomaly({
        type: 'PAYOUT_GREATER_THAN_EARNINGS',
        userId,
        details: `User withdrew ${tokensWithdrawn} tokens but only earned ${tokensEarned} tokens`,
        severity: 'HIGH',
        metadata: { tokensWithdrawn, tokensEarned },
      }));
    }

    return {
      isConsistent: anomalies.length === 0,
      summary,
      anomalies,
    };
  } catch (error: any) {
    logger.error(`Error checking balance consistency for user ${userId}:`, error);
    throw error;
  }
}

// ============================================================================
// TRANSACTION-LEVEL ANOMALY DETECTION
// ============================================================================

/**
 * Check if transaction has valid revenue split
 */
export async function checkTransactionSplits(
  year: number,
  month: number
): Promise<FinanceAnomaly[]> {
  const anomalies: FinanceAnomaly[] = [];

  try {
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

    const txQuery = db
      .collection('walletTransactions')
      .where('createdAt', '>=', startDate)
      .where('createdAt', '<', endDate);

    const txSnapshot = await txQuery.get();

    for (const txDoc of txSnapshot.docs) {
      const tx = txDoc.data();
      const txType = tx.type as string;
      const amount = tx.amountTokens || 0;

      // Check if transaction has proper split metadata
      if (['CHAT_SPEND', 'CALL_SPEND', 'CALENDAR_BOOKING', 'EVENT_TICKET'].includes(txType)) {
        const meta = tx.meta || {};
        const creatorShare = meta.creatorShare;
        const avaloShare = meta.avaloShare;

        if (creatorShare !== undefined && avaloShare !== undefined) {
          const totalShares = creatorShare + avaloShare;
          const tolerance = 1; // 1 token tolerance due to rounding

          if (Math.abs(totalShares - amount) > tolerance) {
            anomalies.push(createAnomaly({
              type: 'INVALID_SPLIT',
              userId: tx.userId,
              period: { year, month },
              details: `Transaction ${txDoc.id} has invalid split: ${creatorShare} + ${avaloShare} = ${totalShares}, expected ${amount}`,
              severity: 'MEDIUM',
              metadata: {
                txId: txDoc.id,
                txType,
                amount,
                creatorShare,
                avaloShare,
                totalShares,
              },
            }));
          }
        }
      }
    }

    return anomalies;
  } catch (error: any) {
    logger.error(`Error checking transaction splits for ${year}-${month}:`, error);
    return [];
  }
}

// ============================================================================
// REFUND ANOMALY DETECTION
// ============================================================================

/**
 * Check for refund inconsistencies
 */
export async function checkRefundConsistency(
  year: number,
  month: number
): Promise<FinanceAnomaly[]> {
  const anomalies: FinanceAnomaly[] = [];

  try {
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

    // Get all refund transactions
    const refundQuery = db
      .collection('walletTransactions')
      .where('type', 'in', ['CALENDAR_REFUND', 'EVENT_REFUND'])
      .where('createdAt', '>=', startDate)
      .where('createdAt', '<', endDate);

    const refundSnapshot = await refundQuery.get();

    for (const refundDoc of refundSnapshot.docs) {
      const refund = refundDoc.data();
      const refundAmount = refund.amountTokens || 0;
      const originalTxId = refund.meta?.originalTxId;

      if (!originalTxId) {
        anomalies.push(createAnomaly({
          type: 'REFUND_INCONSISTENT',
          userId: refund.userId,
          period: { year, month },
          details: `Refund transaction ${refundDoc.id} has no originalTxId reference`,
          severity: 'LOW',
          metadata: { refundTxId: refundDoc.id, refundAmount },
        }));
        continue;
      }

      // Try to find original transaction
      const originalTx = await db.collection('walletTransactions').doc(originalTxId).get();

      if (!originalTx.exists) {
        anomalies.push(createAnomaly({
          type: 'REFUND_INCONSISTENT',
          userId: refund.userId,
          period: { year, month },
          details: `Refund transaction ${refundDoc.id} references non-existent original transaction ${originalTxId}`,
          severity: 'MEDIUM',
          metadata: { refundTxId: refundDoc.id, originalTxId, refundAmount },
        }));
      } else {
        const originalAmount = originalTx.data()?.amountTokens || 0;

        // Refund should not exceed original amount
        if (refundAmount > originalAmount) {
          anomalies.push(createAnomaly({
            type: 'REFUND_INCONSISTENT',
            userId: refund.userId,
            period: { year, month },
            details: `Refund amount (${refundAmount}) exceeds original transaction amount (${originalAmount})`,
            severity: 'HIGH',
            metadata: {
              refundTxId: refundDoc.id,
              originalTxId,
              refundAmount,
              originalAmount,
            },
          }));
        }
      }
    }

    return anomalies;
  } catch (error: any) {
    logger.error(`Error checking refund consistency for ${year}-${month}:`, error);
    return [];
  }
}

// ============================================================================
// BATCH ANOMALY DETECTION
// ============================================================================

/**
 * Run all anomaly detection checks
 */
export async function detectFinanceAnomalies(
  input: AnomalyDetectionInput
): Promise<AnomalyDetectionResult> {
  const startTime = Date.now();
  const allAnomalies: FinanceAnomaly[] = [];

  try {
    logger.info('Starting finance anomaly detection', input);

    // User-specific checks
    if (input.userId) {
      const userCheck = await checkUserBalanceConsistency(input.userId);
      allAnomalies.push(...userCheck.anomalies);
    }

    // Period-specific checks
    if (input.year && input.month) {
      const splitCheck = await checkTransactionSplits(input.year, input.month);
      allAnomalies.push(...splitCheck);

      const refundCheck = await checkRefundConsistency(input.year, input.month);
      allAnomalies.push(...refundCheck);
    }

    // Save detected anomalies to database
    for (const anomaly of allAnomalies) {
      await saveAnomaly(anomaly);
    }

    logger.info(`Detected ${allAnomalies.length} anomalies`);

    return {
      success: true,
      anomaliesFound: allAnomalies.length,
      anomalies: allAnomalies,
    };
  } catch (error: any) {
    logger.error('Error detecting finance anomalies:', error);
    return {
      success: false,
      anomaliesFound: 0,
      error: error.message || 'Unknown error',
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create an anomaly object
 */
function createAnomaly(params: {
  type: FinanceAnomalyType;
  userId?: string | null;
  period?: { year: number; month: number } | null;
  details: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  metadata?: Record<string, any>;
}): FinanceAnomaly {
  return {
    anomalyId: generateId(),
    type: params.type,
    userId: params.userId || null,
    period: params.period || null,
    details: params.details,
    severity: params.severity,
    createdAt: new Date().toISOString(),
    status: 'OPEN',
    resolvedByAdminId: null,
    resolvedAt: null,
    resolutionNote: null,
    metadata: params.metadata,
  };
}

/**
 * Save anomaly to database
 */
async function saveAnomaly(anomaly: FinanceAnomaly): Promise<void> {
  try {
    const anomalyRef = db.collection('financeAnomalies').doc(anomaly.anomalyId);
    
    // Check if anomaly already exists (avoid duplicates)
    const existing = await anomalyRef.get();
    if (existing.exists) {
      logger.info(`Anomaly ${anomaly.anomalyId} already exists, skipping`);
      return;
    }

    await anomalyRef.set(anomaly);
    logger.info(`Saved anomaly ${anomaly.anomalyId}: ${anomaly.type}`);
  } catch (error: any) {
    logger.error('Error saving anomaly:', error);
  }
}

/**
 * Get user financial summary (for reconciliation tools)
 */
export async function getUserFinancialSummary(userId: string): Promise<UserFinancialSummary> {
  const result = await checkUserBalanceConsistency(userId);
  return result.summary;
}