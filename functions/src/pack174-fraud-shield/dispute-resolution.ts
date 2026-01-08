/**
 * PACK 174 - Dispute Resolution
 * Handle payment disputes and resolutions
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId, increment } from '../init';
import { PaymentDispute, DisputeType } from './types';

/**
 * Create payment dispute
 */
export const createPaymentDispute = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const {
    sellerId,
    transactionId,
    disputeType,
    description,
    evidence,
  } = request.data;

  if (!sellerId || !transactionId || !disputeType || !description) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const transactionDoc = await db.collection('transactions').doc(transactionId).get();
  
  if (!transactionDoc.exists) {
    throw new HttpsError('not-found', 'Transaction not found');
  }

  const transactionData = transactionDoc.data();

  if (transactionData!.userId !== userId) {
    throw new HttpsError('permission-denied', 'Only the buyer can create a dispute');
  }

  const existingDispute = await db.collection('payment_disputes')
    .where('transactionId', '==', transactionId)
    .where('status', 'in', ['open', 'investigating'])
    .limit(1)
    .get();

  if (!existingDispute.empty) {
    throw new HttpsError('already-exists', 'A dispute already exists for this transaction');
  }

  const disputeId = generateId();
  const now = new Date();
  const autoResolveAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const dispute: Partial<PaymentDispute> = {
    id: disputeId,
    buyerId: userId,
    sellerId,
    transactionId,
    disputeType: disputeType as DisputeType,
    status: 'open',
    amount: transactionData!.amount,
    currency: transactionData!.currency || 'USD',
    description,
    evidence: evidence ? evidence.map((e: any) => ({
      providedBy: 'buyer',
      type: e.type,
      url: e.url,
      description: e.description,
      uploadedAt: now,
    })) : [],
    autoResolveAt,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection('payment_disputes').doc(disputeId).set(dispute);

  await db.collection('transactions').doc(transactionId).update({
    disputed: true,
    disputeId,
    escrowStatus: 'held',
    updatedAt: serverTimestamp(),
  });

  return {
    success: true,
    disputeId,
    message: 'Dispute created successfully. Both parties will be notified.',
  };
});

/**
 * Add evidence to dispute
 */
export const addDisputeEvidence = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { disputeId, evidence } = request.data;

  if (!disputeId || !evidence) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const disputeDoc = await db.collection('payment_disputes').doc(disputeId).get();
  
  if (!disputeDoc.exists) {
    throw new HttpsError('not-found', 'Dispute not found');
  }

  const disputeData = disputeDoc.data();

  if (disputeData!.buyerId !== userId && disputeData!.sellerId !== userId) {
    throw new HttpsError('permission-denied', 'Not authorized to add evidence');
  }

  if (disputeData!.status === 'resolved' || disputeData!.status === 'closed') {
    throw new HttpsError('failed-precondition', 'Cannot add evidence to resolved dispute');
  }

  const providedBy = disputeData!.buyerId === userId ? 'buyer' : 'seller';
  const now = new Date();

  const newEvidence = {
    providedBy,
    type: evidence.type,
    url: evidence.url,
    description: evidence.description,
    uploadedAt: now,
  };

  await db.collection('payment_disputes').doc(disputeId).update({
    evidence: [...(disputeData!.evidence || []), newEvidence],
    updatedAt: serverTimestamp(),
  });

  return {
    success: true,
    message: 'Evidence added successfully',
  };
});

/**
 * Resolve payment dispute
 */
export const resolvePaymentDispute = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const isInvestigator = await checkIsFraudInvestigator(userId);
  const isAdmin = await checkIsAdmin(userId);

  if (!isInvestigator && !isAdmin) {
    throw new HttpsError('permission-denied', 'Only investigators can resolve disputes');
  }

  const { disputeId, outcome, reason, partialAmount } = request.data;

  if (!disputeId || !outcome || !reason) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const disputeDoc = await db.collection('payment_disputes').doc(disputeId).get();
  
  if (!disputeDoc.exists) {
    throw new HttpsError('not-found', 'Dispute not found');
  }

  const disputeData = disputeDoc.data();
  const now = new Date();

  const resolution = {
    outcome,
    amount: partialAmount || disputeData!.amount,
    reason,
    decidedAt: now,
  };

  await db.collection('payment_disputes').doc(disputeId).update({
    status: 'resolved',
    resolution,
    updatedAt: serverTimestamp(),
  });

  await executeDisputeResolution(
    disputeData!.transactionId,
    disputeData!.buyerId,
    disputeData!.sellerId,
    outcome,
    resolution.amount
  );

  return {
    success: true,
    resolution,
    message: 'Dispute resolved successfully',
  };
});

/**
 * Get dispute details
 */
export const getPaymentDispute = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { disputeId } = request.data;

  if (!disputeId) {
    throw new HttpsError('invalid-argument', 'Dispute ID is required');
  }

  const disputeDoc = await db.collection('payment_disputes').doc(disputeId).get();
  
  if (!disputeDoc.exists) {
    throw new HttpsError('not-found', 'Dispute not found');
  }

  const disputeData = disputeDoc.data();

  const isInvestigator = await checkIsFraudInvestigator(userId);
  const isAdmin = await checkIsAdmin(userId);

  if (disputeData!.buyerId !== userId && 
      disputeData!.sellerId !== userId && 
      !isInvestigator && 
      !isAdmin) {
    throw new HttpsError('permission-denied', 'Not authorized to view this dispute');
  }

  return disputeData;
});

/**
 * Execute dispute resolution
 */
async function executeDisputeResolution(
  transactionId: string,
  buyerId: string,
  sellerId: string,
  outcome: string,
  amount: number
): Promise<void> {
  const transaction = await db.collection('transactions').doc(transactionId).get();
  
  if (!transaction.exists) {
    throw new HttpsError('not-found', 'Transaction not found');
  }

  switch (outcome) {
    case 'refund_buyer':
      await db.collection('transactions').doc(transactionId).update({
        status: 'refunded',
        escrowStatus: 'released_to_buyer',
        refundAmount: amount,
        updatedAt: serverTimestamp(),
      });

      await db.collection('users').doc(buyerId).update({
        'wallet.balance': increment(amount),
      });
      break;

    case 'release_to_seller':
      await db.collection('transactions').doc(transactionId).update({
        status: 'completed',
        escrowStatus: 'released_to_seller',
        updatedAt: serverTimestamp(),
      });

      await db.collection('users').doc(sellerId).update({
        'wallet.balance': increment(amount),
      });
      break;

    case 'partial_refund':
      const refundAmount = amount;
      const sellerAmount = transaction.data()!.amount - refundAmount;

      await db.collection('transactions').doc(transactionId).update({
        status: 'partially_refunded',
        escrowStatus: 'split',
        refundAmount,
        updatedAt: serverTimestamp(),
      });

      await db.collection('users').doc(buyerId).update({
        'wallet.balance': increment(refundAmount),
      });

      await db.collection('users').doc(sellerId).update({
        'wallet.balance': increment(sellerAmount),
      });
      break;

    case 'no_action':
      await db.collection('transactions').doc(transactionId).update({
        disputed: false,
        updatedAt: serverTimestamp(),
      });
      break;
  }
}

/**
 * Helper: Check if user is fraud investigator
 */
async function checkIsFraudInvestigator(userId: string): Promise<boolean> {
  const investigatorDoc = await db.collection('fraud_investigators').doc(userId).get();
  return investigatorDoc.exists;
}

/**
 * Helper: Check if user is admin
 */
async function checkIsAdmin(userId: string): Promise<boolean> {
  const userDoc = await db.collection('users').doc(userId).get();
  return userDoc.exists && userDoc.data()?.role === 'admin';
}