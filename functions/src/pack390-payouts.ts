import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 390 - GLOBAL PAYOUT ENGINE
 * Handles bank transfers, SEPA, SWIFT, Wise, and Stripe Connect payouts
 *
 * CANONICALIZED (Phase 3A-4):
 *   - Balance checks: walletService.getBalance() → wallets/{uid}.balance
 *   - Token debit:    walletService.debitForPayout() — atomic + idempotent + ledger
 *   - Token reversal: walletService.creditTokens(PAYOUT_REVERSAL) — atomic + idempotent + ledger
 *   - Replaces:       users/{uid}.tokens (phantom field, always 0 in prod)
 *
 * PAYOUT STATE MACHINE:
 *   PENDING → AML_REVIEW → APPROVED → PROCESSING → COMPLETED
 *                                                  → FAILED → [manual reversal]
 *   APPROVED → FROZEN (admin action)
 *
 * IDEMPOTENCY:
 *   - Wallet debit: idempotencyKey = `payout_debit_{payoutId}`
 *   - Payout reversal: idempotencyKey = `payout_reversal_{payoutId}`
 *   - Re-delivery of executeBankPayout is safe: status guard prevents re-debit.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FieldValue, HttpsError, auth, increment, onCall, serverTimestamp, timestamp } from './runtime';
import { TOKEN_PAYOUT_USD } from './config/economyConfig';
import { getBalance, debitForPayout, creditTokens } from './wallet/walletService';
import { assertPayoutsEnabled } from './wallet/payoutGuard';

const db = admin.firestore();

// ============================================================================
// CONSTANTS
// ============================================================================

const MINIMUM_PAYOUT_TOKENS = 1000;
const REQUIRED_KYC_LEVEL = 2;

enum PayoutMethod {
  SEPA_INSTANT = 'sepa_instant',
  SWIFT = 'swift',
  WISE = 'wise',
  STRIPE_CONNECT = 'stripe_connect',
  LOCAL_BANK = 'local_bank'
}

enum PayoutStatus {
  PENDING = 'pending',
  AML_REVIEW = 'aml_review',
  APPROVED = 'approved',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REVERSED = 'reversed',
  FROZEN = 'frozen'
}

// ============================================================================
// PAYOUT REQUEST
// ============================================================================

/**
 * User requests a bank payout
 */
export const pack390_requestBankPayout = functions.https.onCall(async (request) => {
  // [PAYOUTS_DISABLED_FOR_SOFT_LAUNCH] — kill switch must be first
  assertPayoutsEnabled();

  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = request.auth.uid;
  const { tokens, method, currency, bankDetails } = data;
  
  // Validation
  if (typeof tokens !== 'number' || tokens < MINIMUM_PAYOUT_TOKENS) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Minimum payout is ${MINIMUM_PAYOUT_TOKENS} tokens`
    );
  }
  
  if (!Object.values(PayoutMethod).includes(method)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid payout method');
  }
  
  if (!currency || !bankDetails) {
    throw new functions.https.HttpsError('invalid-argument', 'Currency and bank details required');
  }
  
  try {
    // Get user data
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }
    
    const userData = userDoc.data()!;
    
    // Check KYC level
    const kycLevel = userData.kycLevel || 0;
    if (kycLevel < REQUIRED_KYC_LEVEL) {
      throw new functions.https.HttpsError(
        'permission-denied',
        `KYC Level ${REQUIRED_KYC_LEVEL} required for payouts`
      );
    }
    
    // Check canonical token balance (wallets/{uid}.balance)
    const tokenBalance = await getBalance(userId);
    if (tokenBalance < tokens) {
      throw new functions.https.HttpsError('failed-precondition', 'Insufficient token balance');
    }
    
    // Check for existing pending payouts
    const pendingPayouts = await db.collection('payoutRequests')
      .where('userId', '==', userId)
      .where('status', 'in', [PayoutStatus.PENDING, PayoutStatus.AML_REVIEW, PayoutStatus.PROCESSING])
      .get();
    
    if (!pendingPayouts.empty) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'You have a pending payout request'
      );
    }
    
    // Convert tokens to fiat amount
    const conversionResult = await convertTokensToFiat(tokens, currency);
    
    // Create payout request
    const payoutRequest = {
      userId,
      tokens,
      currency,
      fiatAmount: conversionResult.amount,
      fxRate: conversionResult.fxRate,
      method,
      bankDetails: sanitizeBankDetails(bankDetails),
      status: PayoutStatus.PENDING,
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      kycLevel,
      countryCode: userData.countryCode || 'UNKNOWN'
    };
    
    const payoutRef = await db.collection('payoutRequests').add(payoutRequest);
    
    // Trigger AML scan
    await triggerAMLScan(userId, payoutRef.id, tokens, currency, conversionResult.amount);
    
    // Log to audit trail
    await db.collection('financialAuditLogs').add({
      type: 'payout_request',
      userId,
      payoutId: payoutRef.id,
      tokens,
      currency,
      fiatAmount: conversionResult.amount,
      method,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return {
      success: true,
      payoutId: payoutRef.id,
      status: PayoutStatus.PENDING,
      tokens,
      fiatAmount: conversionResult.amount,
      currency,
      message: 'Payout request created. Undergoing AML review.'
    };
    
  } catch (error) {
    console.error('Payout request error:', error);
    throw error instanceof functions.https.HttpsError 
      ? error 
      : new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Execute approved bank payout (Admin/System only)
 */
export const pack390_executeBankPayout = functions.https.onCall(async (request) => {
  // [PAYOUTS_DISABLED_FOR_SOFT_LAUNCH] — kill switch must be first
  assertPayoutsEnabled();

  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Check admin/finance permissions
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  const isAuthorized = userDoc.exists &&
    (userDoc.data()?.role === 'admin' || userDoc.data()?.permissions?.finance === true);
  
  if (!isAuthorized) {
    throw new functions.https.HttpsError('permission-denied', 'Finance team access required');
  }
  
  const { payoutId } = data;
  
  if (!payoutId) {
    throw new functions.https.HttpsError('invalid-argument', 'Payout ID required');
  }
  
  try {
    const payoutRef = db.collection('payoutRequests').doc(payoutId);
    const payoutDoc = await payoutRef.get();
    
    if (!payoutDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Payout request not found');
    }
    
    const payoutData = payoutDoc.data()!;
    
    // Check if payout is in approved state
    if (payoutData.status !== PayoutStatus.APPROVED) {
      // Idempotent guard: already completed payouts return success without re-processing
      if (payoutData.status === PayoutStatus.COMPLETED) {
        return {
          success: true,
          payoutId,
          transferId: payoutData.transferId || null,
          message: 'Payout already completed (idempotent)'
        };
      }
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Payout must be approved. Current status: ${payoutData.status}`
      );
    }

    // ── CANONICAL DEBIT (must happen BEFORE external transfer) ───────────────
    // debitForPayout is atomic + idempotent + writes canonical ledger entry.
    // If this throws (e.g. insufficient balance), payout is aborted cleanly —
    // no external transfer is initiated and no money leaves the platform.
    // idempotencyKey is deterministic so re-running executeBankPayout after a
    // crash between debit and transfer is safe: debit is skipped on retry.
    await debitForPayout({
      userId: payoutData.userId,
      amountTokens: payoutData.tokens,
      idempotencyKey: `payout_debit_${payoutId}`,
      payoutId,
    });

    // Update status to processing (after debit succeeded)
    await payoutRef.update({
      status: PayoutStatus.PROCESSING,
      processingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
      processedBy: request.auth.uid
    });

    // Execute payout based on method
    let transferResult;
    switch (payoutData.method) {
      case PayoutMethod.SEPA_INSTANT:
        transferResult = await executeSEPATransfer(payoutData);
        break;
      case PayoutMethod.SWIFT:
        transferResult = await executeSWIFTTransfer(payoutData);
        break;
      case PayoutMethod.WISE:
        transferResult = await executeWiseTransfer(payoutData);
        break;
      case PayoutMethod.STRIPE_CONNECT:
        transferResult = await executeStripeConnectTransfer(payoutData);
        break;
      default:
        // Revert status on unsupported method (debit already applied — needs reversal)
        await payoutRef.update({
          status: PayoutStatus.FAILED,
          failedAt: admin.firestore.FieldValue.serverTimestamp(),
          failureReason: 'Unsupported payout method',
        });
        throw new functions.https.HttpsError('unimplemented', 'Payment method not implemented');
    }

    if (transferResult.success) {
      // Update payout status to COMPLETED (tokens already debited above)
      await payoutRef.update({
        status: PayoutStatus.COMPLETED,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        transferId: transferResult.transferId,
        transferDetails: transferResult.details
      });

      // Create fiat ledger entry
      await db.collection('fiatLedgers').add({
        userId: payoutData.userId,
        type: 'payout',
        amount: -payoutData.fiatAmount,
        currency: payoutData.currency,
        tokens: -payoutData.tokens,
        payoutId,
        method: payoutData.method,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      // Log to audit trail
      await db.collection('financialAuditLogs').add({
        type: 'payout_executed',
        userId: payoutData.userId,
        payoutId,
        tokens: payoutData.tokens,
        fiatAmount: payoutData.fiatAmount,
        currency: payoutData.currency,
        method: payoutData.method,
        transferId: transferResult.transferId,
        executedBy: request.auth.uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        payoutId,
        transferId: transferResult.transferId,
        message: 'Payout executed successfully'
      };

    } else {
      // Transfer failed after token debit. Mark as FAILED.
      // Tokens remain debited until admin calls pack390_reverseFailedTransfer,
      // which credits them back via creditTokens(PAYOUT_REVERSAL).
      await payoutRef.update({
        status: PayoutStatus.FAILED,
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
        failureReason: transferResult.error
      });

      throw new functions.https.HttpsError('internal', `Transfer failed: ${transferResult.error}`);
    }
    
  } catch (error) {
    console.error('Execute payout error:', error);
    throw error instanceof functions.https.HttpsError 
      ? error 
      : new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Reverse a failed transfer
 */
export const pack390_reverseFailedTransfer = functions.https.onCall(async (request) => {
  // [PAYOUTS_DISABLED_FOR_SOFT_LAUNCH] — kill switch must be first
  assertPayoutsEnabled();

  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // Check admin/finance permissions
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  const isAuthorized = userDoc.exists && 
    (userDoc.data()?.role === 'admin' || userDoc.data()?.permissions?.finance === true);
  
  if (!isAuthorized) {
    throw new functions.https.HttpsError('permission-denied', 'Finance team access required');
  }
  
  const { payoutId, reason } = data;
  
  try {
    const payoutRef = db.collection('payoutRequests').doc(payoutId);
    const payoutDoc = await payoutRef.get();
    
    if (!payoutDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Payout not found');
    }
    
    const payoutData = payoutDoc.data()!;
    
    // [HARD-STOP] COMPLETED payouts cannot be reversed — fiat was already disbursed.
    // Reversing a completed payout would credit tokens back to a user who already received money,
    // creating free token inflation. Only FAILED payouts (never disbursed) are reversible.
    if (payoutData.status === PayoutStatus.COMPLETED) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        '[COMPLETED_PAYOUT_REVERSAL_BLOCKED] Completed payouts cannot be reversed. Fiat was already disbursed. Contact finance team for manual reconciliation.',
      );
    }
    if (payoutData.status !== PayoutStatus.FAILED) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Only FAILED payouts that were never disbursed may be reversed.',
      );
    }
    
    // Canonical credit back to user's wallet (wallets/{uid}.balance) + ledger entry.
    // Idempotent: re-running reversal for same payoutId is a no-op on wallet.
    await creditTokens({
      userId: payoutData.userId,
      amountTokens: payoutData.tokens,
      type: 'PAYOUT_REVERSAL',
      idempotencyKey: `payout_reversal_${payoutId}`,
      metadata: { payoutId, reversedBy: request.auth.uid, reason },
    });

    // Update payout status
    await payoutRef.update({
      status: PayoutStatus.REVERSED,
      reversedAt: admin.firestore.FieldValue.serverTimestamp(),
      reversedBy: request.auth.uid,
      reversalReason: reason
    });
    
    // Create reversal ledger entry
    await db.collection('fiatLedgers').add({
      userId: payoutData.userId,
      type: 'payout_reversal',
      amount: payoutData.fiatAmount,
      currency: payoutData.currency,
      tokens: payoutData.tokens,
      payoutId,
      reason,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Log reversal
    await db.collection('financialAuditLogs').add({
      type: 'payout_reversed',
      userId: payoutData.userId,
      payoutId,
      tokens: payoutData.tokens,
      reason,
      reversedBy: request.auth.uid,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return {
      success: true,
      message: 'Payout reversed and tokens refunded'
    };
    
  } catch (error) {
    console.error('Reverse payout error:', error);
    throw error instanceof functions.https.HttpsError 
      ? error 
      : new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function convertTokensToFiat(tokens: number, currency: string) {
  const BASE_TOKEN_VALUE_USD = TOKEN_PAYOUT_USD; // derived from TOKEN_PAYOUT_USD (0.03 USD)
  const USDValue = tokens * BASE_TOKEN_VALU