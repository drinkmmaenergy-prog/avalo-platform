/**
 * PACK 174 - Payment Fraud Detection
 * Detect fraudulent payment activities, chargeback abuse, stolen cards
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId } from '../init';
import { PaymentFraudAttempt, FraudType } from './types';

/**
 * Check payment for fraud indicators
 */
export const checkPaymentFraud = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const {
    amount,
    currency,
    paymentMethodId,
    recipientId,
    transactionType,
  } = request.data;

  if (!amount || !paymentMethodId) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const fraudChecks = await runFraudChecks(userId, {
    amount,
    currency,
    paymentMethodId,
    recipientId,
    transactionType,
  });

  if (fraudChecks.isFraudulent) {
    const attemptId = generateId();
    const fraudAttempt: Partial<PaymentFraudAttempt> = {
      id: attemptId,
      userId,
      fraudType: fraudChecks.fraudType,
      paymentMethodId,
      amount,
      currency,
      riskScore: fraudChecks.riskScore,
      blocked: fraudChecks.shouldBlock,
      reason: fraudChecks.reason,
      createdAt: new Date(),
    };

    await db.collection('payment_fraud_attempts').doc(attemptId).set(fraudAttempt);

    if (fraudChecks.shouldBlock) {
      await blacklistPaymentMethod(paymentMethodId, fraudChecks.reason, userId);
      
      await db.collection('fraud_cases').add({
        id: generateId(),
        userId,
        fraudType: fraudChecks.fraudType,
        status: 'open',
        severity: fraudChecks.severity,
        riskScore: fraudChecks.riskScore,
        evidence: [{
          type: 'transaction',
          id: attemptId,
          data: { amount, currency, paymentMethodId },
          timestamp: new Date(),
        }],
        description: `Payment fraud detected: ${fraudChecks.reason}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    return {
      allowed: !fraudChecks.shouldBlock,
      blocked: fraudChecks.shouldBlock,
      riskScore: fraudChecks.riskScore,
      reason: fraudChecks.reason,
      warningMessage: fraudChecks.warningMessage,
    };
  }

  return {
    allowed: true,
    blocked: false,
    riskScore: fraudChecks.riskScore,
  };
});

/**
 * Report chargeback abuse
 */
export const reportChargebackAbuse = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { buyerId, transactionId, evidence, description } = request.data;

  if (!buyerId || !transactionId) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const caseId = generateId();
  const now = new Date();

  await db.collection('fraud_cases').doc(caseId).set({
    id: caseId,
    userId: buyerId,
    targetUserId: userId,
    fraudType: 'chargeback_abuse' as FraudType,
    status: 'open',
    severity: 'high',
    riskScore: 75,
    evidence: [{
      type: 'transaction',
      id: transactionId,
      data: { evidence, description },
      timestamp: now,
    }],
    description: `Chargeback abuse reported: ${description}`,
    createdAt: now,
    updatedAt: now,
  });

  const buyerProfile = await db.collection('user_fraud_risk_profiles').doc(buyerId).get();
  const currentScore = buyerProfile.exists ? (buyerProfile.data()?.overallRiskScore || 0) : 0;
  
  await db.collection('user_fraud_risk_profiles').doc(buyerId).set({
    userId: buyerId,
    overallRiskScore: Math.min(currentScore + 30, 100),
    riskLevel: currentScore + 30 >= 80 ? 'critical' : 'high',
    paymentRiskScore: Math.min((buyerProfile.data()?.paymentRiskScore || 0) + 40, 100),
    flags: [...(buyerProfile.data()?.flags || []), 'chargeback_abuse'],
    lastScanAt: now,
    updatedAt: now,
  }, { merge: true });

  return { success: true, caseId };
});

/**
 * Check if card is blacklisted
 */
export const checkCardBlacklist = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { cardFingerprint } = request.data;

  if (!cardFingerprint) {
    throw new HttpsError('invalid-argument', 'Card fingerprint is required');
  }

  const blacklistedCard = await db.collection('blacklisted_cards')
    .where('cardFingerprint', '==', cardFingerprint)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (!blacklistedCard.empty) {
    const cardData = blacklistedCard.docs[0].data();
    return {
      blacklisted: true,
      reason: cardData.reason,
      addedAt: cardData.addedAt,
    };
  }

  return { blacklisted: false };
});

/**
 * Check if wallet is blacklisted
 */
export const checkWalletBlacklist = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { walletAddress, blockchain } = request.data;

  if (!walletAddress) {
    throw new HttpsError('invalid-argument', 'Wallet address is required');
  }

  const blacklistedWallet = await db.collection('blacklisted_wallets')
    .where('walletAddress', '==', walletAddress.toLowerCase())
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (!blacklistedWallet.empty) {
    const walletData = blacklistedWallet.docs[0].data();
    return {
      blacklisted: true,
      reason: walletData.reason,
      blockchain: walletData.blockchain,
      addedAt: walletData.addedAt,
    };
  }

  return { blacklisted: false };
});

/**
 * Verify transaction delivery
 */
export const verifyTransactionDelivery = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { transactionId, deliveryProof } = request.data;

  if (!transactionId || !deliveryProof) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const transactionDoc = await db.collection('transactions').doc(transactionId).get();
  
  if (!transactionDoc.exists) {
    throw new HttpsError('not-found', 'Transaction not found');
  }

  const transactionData = transactionDoc.data();

  if (transactionData!.sellerId !== userId) {
    throw new HttpsError('permission-denied', 'Only seller can verify delivery');
  }

  await db.collection('transactions').doc(transactionId).update({
    deliveryVerified: true,
    deliveryProof,
    deliveryVerifiedAt: serverTimestamp(),
  });

  if (transactionData!.escrowStatus === 'held') {
    await db.collection('transactions').doc(transactionId).update({
      escrowStatus: 'ready_for_release',
    });
  }

  return { success: true, verified: true };
});

/**
 * Run fraud checks on payment
 */
async function runFraudChecks(userId: string, paymentData: {
  amount: number;
  currency: string;
  paymentMethodId: string;
  recipientId?: string;
  transactionType?: string;
}): Promise<{
  isFraudulent: boolean;
  fraudType: FraudType;
  shouldBlock: boolean;
  riskScore: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
  warningMessage?: string;
}> {
  let riskScore = 0;
  const reasons: string[] = [];

  const blacklistedCard = await db.collection('blacklisted_cards')
    .where('cardFingerprint', '==', paymentData.paymentMethodId)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (!blacklistedCard.empty) {
    return {
      isFraudulent: true,
      fraudType: 'stolen_card',
      shouldBlock: true,
      riskScore: 100,
      severity: 'critical',
      reason: 'Payment method is blacklisted',
      warningMessage: 'This payment method has been flagged for fraudulent activity.',
    };
  }

  const userProfile = await db.collection('user_fraud_risk_profiles').doc(userId).get();
  if (userProfile.exists) {
    const profile = userProfile.data();
    riskScore += profile!.paymentRiskScore || 0;
    
    if (profile!.flags?.includes('chargeback_abuse')) {
      riskScore += 30;
      reasons.push('History of chargeback abuse');
    }
  }

  const recentTransactions = await db.collection('transactions')
    .where('userId', '==', userId)
    .where('createdAt', '>', new Date(Date.now() - 60 * 60 * 1000))
    .get();

  if (recentTransactions.size > 10) {
    riskScore += 25;
    reasons.push('Unusually high transaction velocity');
  }

  const recentAmount = recentTransactions.docs.reduce((sum, doc) => 
    sum + (doc.data().amount || 0), 0
  );

  if (recentAmount > 5000) {
    riskScore += 20;
    reasons.push('High spending volume in short period');
  }

  if (paymentData.amount > 1000) {
    riskScore += 15;
    reasons.push('Large transaction amount');
  }

  const recentFraudAttempts = await db.collection('payment_fraud_attempts')
    .where('userId', '==', userId)
    .where('createdAt', '>', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    .get();

  if (recentFraudAttempts.size > 0) {
    riskScore += recentFraudAttempts.size * 20;
    reasons.push('Recent fraud attempts on record');
  }

  riskScore = Math.min(riskScore, 100);

  let severity: 'low' | 'medium' | 'high' | 'critical';
  if (riskScore >= 80) severity = 'critical';
  else if (riskScore >= 60) severity = 'high';
  else if (riskScore >= 30) severity = 'medium';
  else severity = 'low';

  const isFraudulent = riskScore >= 30;
  const shouldBlock = riskScore >= 70;

  return {
    isFraudulent,
    fraudType: 'payment_fraud',
    shouldBlock,
    riskScore,
    severity,
    reason: reasons.join('; ') || 'No fraud indicators detected',
    warningMessage: shouldBlock 
      ? 'This payment has been blocked due to fraud indicators.'
      : undefined,
  };
}

/**
 * Blacklist payment method
 */
async function blacklistPaymentMethod(
  paymentMethodId: string,
  reason: string,
  reportedBy: string
): Promise<void> {
  const blacklistId = generateId();
  
  await db.collection('blacklisted_cards').doc(blacklistId).set({
    id: blacklistId,
    cardFingerprint: paymentMethodId,
    reason,
    reportedBy,
    status: 'active',
    addedAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  });
}