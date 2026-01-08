/**
 * PACK 390 - GLOBAL PAYOUT ENGINE
 * Handles bank transfers, SEPA, SWIFT, Wise, and Stripe Connect payouts
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

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
export const pack390_requestBankPayout = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
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
    
    // Check token balance
    const tokenBalance = userData.tokens || 0;
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
export const pack390_executeBankPayout = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // Check admin/finance permissions
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
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
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Payout must be approved. Current status: ${payoutData.status}`
      );
    }
    
    // Update status to processing
    await payoutRef.update({
      status: PayoutStatus.PROCESSING,
      processingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
      processedBy: context.auth.uid
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
        throw new functions.https.HttpsError('unimplemented', 'Payment method not implemented');
    }
    
    if (transferResult.success) {
      // Deduct tokens from user balance
      await db.collection('users').doc(payoutData.userId).update({
        tokens: admin.firestore.FieldValue.increment(-payoutData.tokens)
      });
      
      // Update payout status
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
        executedBy: context.auth.uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return {
        success: true,
        payoutId,
        transferId: transferResult.transferId,
        message: 'Payout executed successfully'
      };
      
    } else {
      // Mark as failed
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
export const pack390_reverseFailedTransfer = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // Check admin/finance permissions
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
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
    
    if (payoutData.status !== PayoutStatus.FAILED && payoutData.status !== PayoutStatus.COMPLETED) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Only failed or completed payouts can be reversed'
      );
    }
    
    // Refund tokens to user
    await db.collection('users').doc(payoutData.userId).update({
      tokens: admin.firestore.FieldValue.increment(payoutData.tokens)
    });
    
    // Update payout status
    await payoutRef.update({
      status: PayoutStatus.REVERSED,
      reversedAt: admin.firestore.FieldValue.serverTimestamp(),
      reversedBy: context.auth.uid,
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
      reversedBy: context.auth.uid,
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
  const BASE_TOKEN_VALUE_PLN = 0.20;
  const plnValue = tokens * BASE_TOKEN_VALUE_PLN;
  
  if (currency === 'PLN') {
    return { amount: plnValue, fxRate: 1 };
  }
  
  const rateDoc = await db.collection('fxRates').doc(`PLN_${currency}`).get();
  if (!rateDoc.exists) {
    throw new functions.https.HttpsError('not-found', `Exchange rate for ${currency} not found`);
  }
  
  const fxRate = rateDoc.data()!.rate;
  return {
    amount: Math.round(plnValue * fxRate * 100) / 100,
    fxRate
  };
}

function sanitizeBankDetails(bankDetails: any) {
  // Remove sensitive data before storing
  const sanitized = { ...bankDetails };
  
  // Mask account number (show only last 4 digits)
  if (sanitized.accountNumber) {
    const acc = sanitized.accountNumber.toString();
    sanitized.accountNumberMasked = '****' + acc.slice(-4);
    delete sanitized.accountNumber;
  }
  
  return sanitized;
}

async function triggerAMLScan(
  userId: string,
  payoutId: string,
  tokens: number,
  currency: string,
  fiatAmount: number
) {
  // This will be implemented in pack390-aml.ts
  // For now, create a placeholder scan request
  await db.collection('amlScans').add({
    userId,
    payoutId,
    tokens,
    currency,
    fiatAmount,
    scanType: 'payout',
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

// Mock transfer functions (to be integrated with real payment providers)
async function executeSEPATransfer(payoutData: any) {
  // TODO: Integrate with SEPA payment provider
  console.log('Executing SEPA transfer:', payoutData);
  return {
    success: true,
    transferId: `SEPA_${Date.now()}`,
    details: { method: 'sepa_instant' }
  };
}

async function executeSWIFTTransfer(payoutData: any) {
  // TODO: Integrate with SWIFT payment provider
  console.log('Executing SWIFT transfer:', payoutData);
  return {
    success: true,
    transferId: `SWIFT_${Date.now()}`,
    details: { method: 'swift' }
  };
}

async function executeWiseTransfer(payoutData: any) {
  // TODO: Integrate with Wise API
  console.log('Executing Wise transfer:', payoutData);
  return {
    success: true,
    transferId: `WISE_${Date.now()}`,
    details: { method: 'wise' }
  };
}

async function executeStripeConnectTransfer(payoutData: any) {
  // TODO: Integrate with Stripe Connect
  console.log('Executing Stripe Connect transfer:', payoutData);
  return {
    success: true,
    transferId: `STRIPE_${Date.now()}`,
    details: { method: 'stripe_connect' }
  };
}

/**
 * Get user's payout history
 */
export const pack390_getPayoutHistory = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { limit = 20 } = data;
  
  try {
    const payoutsSnapshot = await db.collection('payoutRequests')
      .where('userId', '==', userId)
      .orderBy('requestedAt', 'desc')
      .limit(limit)
      .get();
    
    const payouts = payoutsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      // Remove sensitive bank details
      bankDetails: undefined
    }));
    
    return { payouts };
    
  } catch (error) {
    console.error('Get payout history error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
