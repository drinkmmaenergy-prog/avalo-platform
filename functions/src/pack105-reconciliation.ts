/**
 * PACK 105 — Payout Reconciliation Engine
 * 
 * Scheduled job to reconcile internal payouts with external PSP records
 * 
 * Business Rules:
 * - NO automatic reversals of creator earnings
 * - NO automatic payout cancellations
 * - Creates finance cases for human investigation
 * - Requires legal order for fraud-backed cancellations
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, serverTimestamp } from './init';
import { logger } from 'firebase-functions/v2';
import { Timestamp } from 'firebase-admin/firestore';
import { PayoutReconciliationResult } from './pack105-types';
import { createFinanceCase } from './pack105-finance-cases';
import { logReconciliationMismatch } from './pack105-audit-logger';

// ============================================================================
// RECONCILIATION ENGINE
// ============================================================================

/**
 * Scheduled job: Reconcile payouts daily
 * Runs at 3 AM UTC every day
 */
export const reconcilePayoutsScheduled = onSchedule(
  {
    schedule: '0 3 * * *',
    timeZone: 'UTC',
    region: 'europe-west3',
    memory: '1GiB' as const,
    timeoutSeconds: 540,
  },
  async (event) => {
    try {
      logger.info('[Reconciliation] Starting daily payout reconciliation');

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const result = await reconcilePayouts({
        startDate: yesterday,
        endDate: today,
      });

      logger.info('[Reconciliation] Completed daily reconciliation', {
        totalChecked: result.totalChecked,
        matched: result.matched,
        mismatches: result.mismatches,
        casesCreated: result.casesCreated,
      });

      return null;
    } catch (error: any) {
      logger.error('[Reconciliation] Failed daily reconciliation', {
        error: error.message,
      });
      throw error;
    }
  }
);

/**
 * Reconcile payouts for a date range
 */
export async function reconcilePayouts(params: {
  startDate: Date;
  endDate: Date;
}): Promise<{
  totalChecked: number;
  matched: number;
  mismatches: number;
  casesCreated: number;
  results: PayoutReconciliationResult[];
}> {
  const results: PayoutReconciliationResult[] = [];
  let matched = 0;
  let mismatches = 0;
  let casesCreated = 0;

  try {
    const startTimestamp = Timestamp.fromDate(params.startDate);
    const endTimestamp = Timestamp.fromDate(params.endDate);

    const payoutsSnapshot = await db
      .collection('payoutRequests')
      .where('createdAt', '>=', startTimestamp)
      .where('createdAt', '<=', endTimestamp)
      .where('status', 'in', ['completed', 'processing', 'failed'])
      .get();

    logger.info('[Reconciliation] Checking payouts', {
      count: payoutsSnapshot.size,
      startDate: params.startDate.toISOString(),
      endDate: params.endDate.toISOString(),
    });

    for (const payoutDoc of payoutsSnapshot.docs) {
      const payoutData = payoutDoc.data();
      const payoutId = payoutDoc.id;

      const result = await reconcileSinglePayout(payoutId, payoutData);
      results.push(result);

      if (result.status === 'MATCHED') {
        matched++;
      } else {
        mismatches++;

        const caseCreated = await handleReconciliationMismatch(result, payoutData);
        if (caseCreated) {
          casesCreated++;
        }
      }
    }

    return {
      totalChecked: payoutsSnapshot.size,
      matched,
      mismatches,
      casesCreated,
      results,
    };
  } catch (error: any) {
    logger.error('[Reconciliation] Failed to reconcile payouts', {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Reconcile a single payout
 */
async function reconcileSinglePayout(
  payoutId: string,
  payoutData: any
): Promise<PayoutReconciliationResult> {
  const internal = {
    amountTokens: payoutData.amountTokens || 0,
    amountPLN: payoutData.amountPLN || 0,
    status: payoutData.status || 'unknown',
  };

  const result: PayoutReconciliationResult = {
    payoutId,
    status: 'MATCHED',
    internal,
  };

  try {
    const externalReference = payoutData.externalReference;
    const method = payoutData.method;

    if (!externalReference) {
      if (internal.status === 'completed') {
        result.status = 'MISSING_EXTERNAL';
        result.mismatch = [{
          field: 'externalReference',
          internalValue: 'completed',
          externalValue: null,
        }];
      }
      return result;
    }

    if (method === 'stripe') {
      const externalData = await checkStripePayoutStatus(externalReference);
      result.external = externalData;

      if (!externalData) {
        result.status = 'MISSING_EXTERNAL';
        result.mismatch = [{
          field: 'stripe_payout',
          internalValue: externalReference,
          externalValue: null,
        }];
      } else {
        const mismatchFields = comparePayoutData(internal, externalData);
        if (mismatchFields.length > 0) {
          result.status = 'MISMATCH';
          result.mismatch = mismatchFields;
        }
      }
    } else if (method === 'wise') {
      const externalData = await checkWisePayoutStatus(externalReference);
      result.external = externalData;

      if (!externalData) {
        result.status = 'MISSING_EXTERNAL';
        result.mismatch = [{
          field: 'wise_transfer',
          internalValue: externalReference,
          externalValue: null,
        }];
      } else {
        const mismatchFields = comparePayoutData(internal, externalData);
        if (mismatchFields.length > 0) {
          result.status = 'MISMATCH';
          result.mismatch = mismatchFields;
        }
      }
    }

    return result;
  } catch (error: any) {
    logger.error('[Reconciliation] Error reconciling payout', {
      error: error.message,
      payoutId,
    });

    result.status = 'MISMATCH';
    result.mismatch = [{
      field: 'error',
      internalValue: internal,
      externalValue: error.message,
    }];

    return result;
  }
}

/**
 * Compare internal and external payout data
 */
function comparePayoutData(
  internal: { amountTokens: number; amountPLN: number; status: string },
  external: { amount: number; currency: string; status: string; provider: string }
): Array<{ field: string; internalValue: any; externalValue: any }> {
  const mismatches: Array<{ field: string; internalValue: any; externalValue: any }> = [];

  const tolerance = 0.01;
  if (Math.abs(internal.amountPLN - external.amount) > tolerance) {
    mismatches.push({
      field: 'amount',
      internalValue: internal.amountPLN,
      externalValue: external.amount,
    });
  }

  const internalStatusNormalized = normalizeStatus(internal.status);
  const externalStatusNormalized = normalizeStatus(external.status);

  if (internalStatusNormalized !== externalStatusNormalized) {
    mismatches.push({
      field: 'status',
      internalValue: internal.status,
      externalValue: external.status,
    });
  }

  return mismatches;
}

/**
 * Normalize status across different providers
 */
function normalizeStatus(status: string): string {
  const lowerStatus = status.toLowerCase();
  
  if (lowerStatus.includes('complet') || lowerStatus === 'paid' || lowerStatus === 'success') {
    return 'completed';
  }
  if (lowerStatus.includes('process') || lowerStatus === 'pending') {
    return 'processing';
  }
  if (lowerStatus.includes('fail') || lowerStatus === 'failed' || lowerStatus === 'rejected') {
    return 'failed';
  }
  if (lowerStatus.includes('cancel')) {
    return 'cancelled';
  }
  
  return lowerStatus;
}

/**
 * Handle reconciliation mismatch by creating finance case
 */
async function handleReconciliationMismatch(
  result: PayoutReconciliationResult,
  payoutData: any
): Promise<boolean> {
  try {
    let caseType: 'PAYOUT_RECONCILIATION' | 'STRIPE_MISMATCH' | 'WISE_MISMATCH' = 'PAYOUT_RECONCILIATION';
    
    if (result.external?.provider === 'STRIPE') {
      caseType = 'STRIPE_MISMATCH';
    } else if (result.external?.provider === 'WISE') {
      caseType = 'WISE_MISMATCH';
    }

    let priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM';
    
    if (result.status === 'MISSING_EXTERNAL' && result.internal.status === 'completed') {
      priority = 'HIGH';
    }

    const discrepancy = result.external ? {
      internal: result.internal.amountPLN,
      external: result.external.amount,
      difference: Math.abs(result.internal.amountPLN - result.external.amount),
      currency: result.external.currency,
    } : undefined;

    await createFinanceCase({
      type: caseType,
      priority,
      reason: `Reconciliation mismatch detected: ${result.status}`,
      subjectUserId: payoutData.userId,
      evidenceRefs: [result.payoutId],
      discrepancy,
      metadata: {
        reconciliationResult: result,
        payoutMethod: payoutData.method,
        detectedAt: new Date().toISOString(),
      },
    });

    await logReconciliationMismatch({
      payoutId: result.payoutId,
      userId: payoutData.userId,
      internalValue: result.internal,
      externalValue: result.external || 'missing',
      provider: result.external?.provider || payoutData.method || 'unknown',
    });

    return true;
  } catch (error: any) {
    logger.error('[Reconciliation] Failed to create finance case for mismatch', {
      error: error.message,
      payoutId: result.payoutId,
    });
    return false;
  }
}

// ============================================================================
// EXTERNAL PSP INTEGRATIONS (STUBS)
// ============================================================================

/**
 * Check Stripe payout status
 * NOTE: This is a stub. In production, implement actual Stripe API integration
 */
async function checkStripePayoutStatus(
  payoutId: string
): Promise<{ amount: number; currency: string; status: string; provider: 'STRIPE' } | null> {
  try {
    logger.info('[Reconciliation] Checking Stripe payout', { payoutId });

    return null;
  } catch (error: any) {
    logger.error('[Reconciliation] Failed to check Stripe payout', {
      error: error.message,
      payoutId,
    });
    return null;
  }
}

/**
 * Check Wise transfer status
 * NOTE: This is a stub. In production, implement actual Wise API integration
 */
async function checkWisePayoutStatus(
  transferId: string
): Promise<{ amount: number; currency: string; status: string; provider: 'WISE' } | null> {
  try {
    logger.info('[Reconciliation] Checking Wise transfer', { transferId });

    return null;
  } catch (error: any) {
    logger.error('[Reconciliation] Failed to check Wise transfer', {
      error: error.message,
      transferId,
    });
    return null;
  }
}

// ============================================================================
// MANUAL RECONCILIATION HELPERS
// ============================================================================

/**
 * Manually trigger reconciliation for a specific payout
 */
export async function reconcilePayoutManual(payoutId: string): Promise<PayoutReconciliationResult> {
  try {
    const payoutDoc = await db.collection('payoutRequests').doc(payoutId).get();

    if (!payoutDoc.exists) {
      throw new Error(`Payout ${payoutId} not found`);
    }

    const payoutData = payoutDoc.data();
    const result = await reconcileSinglePayout(payoutId, payoutData);

    if (result.status !== 'MATCHED') {
      await handleReconciliationMismatch(result, payoutData);
    }

    logger.info('[Reconciliation] Manual reconciliation completed', {
      payoutId,
      status: result.status,
    });

    return result;
  } catch (error: any) {
    logger.error('[Reconciliation] Manual reconciliation failed', {
      error: error.message,
      payoutId,
    });
    throw error;
  }
}