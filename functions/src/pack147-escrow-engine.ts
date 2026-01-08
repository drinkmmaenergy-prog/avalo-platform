/**
 * PACK 147 — Escrow Engine
 * 
 * Handles payment escrow for all token-based transactions.
 * Holds payment until delivery conditions are met.
 * 
 * RULES:
 * - 65/35 split calculated and stored (but held until release)
 * - Context-aware release conditions
 * - Auto-release after timeout
 * - Refund-safe during dispute window
 */

import { db, serverTimestamp, generateId, increment } from './init';
import { FieldValue } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import {
  EscrowWallet,
  EscrowStatus,
  TransactionType,
  RELEASE_CONDITIONS
} from './pack147-types';

// ============================================================================
// CONSTANTS
// ============================================================================

const PLATFORM_FEE_PERCENTAGE = 0.35;
const RECIPIENT_PERCENTAGE = 0.65;

// ============================================================================
// ESCROW FUNCTIONS
// ============================================================================

/**
 * Open escrow wallet for a transaction
 * 
 * Validates:
 * - Payer has sufficient balance
 * - Transaction type is valid
 * - Creates escrow record
 * - Deducts tokens from payer (held in escrow)
 */
export async function openEscrow(params: {
  transactionType: TransactionType;
  transactionId: string;
  payerId: string;
  recipientId: string;
  totalAmount: number;
  metadata?: Record<string, any>;
}): Promise<string> {
  
  const { transactionType, transactionId, payerId, recipientId, totalAmount, metadata = {} } = params;
  
  // Validate amount
  if (totalAmount <= 0 || !Number.isInteger(totalAmount)) {
    throw new Error('Invalid escrow amount');
  }
  
  // Get release conditions for this transaction type
  const releaseConfig = RELEASE_CONDITIONS[transactionType];
  if (!releaseConfig) {
    throw new Error(`Invalid transaction type: ${transactionType}`);
  }
  
  // Calculate split
  const platformFee = Math.floor(totalAmount * PLATFORM_FEE_PERCENTAGE);
  const recipientAmount = totalAmount - platformFee;
  
  const now = Timestamp.now();
  const releaseWindowStart = now;
  const releaseWindowEnd = Timestamp.fromMillis(
    now.toMillis() + (releaseConfig.windowMinutes * 60 * 1000)
  );
  const autoReleaseAt = Timestamp.fromMillis(
    now.toMillis() + (releaseConfig.autoReleaseHours * 60 * 60 * 1000)
  );
  
  const escrowId = generateId();
  
  // Create escrow record
  const escrowWallet: EscrowWallet = {
    escrowId,
    transactionType,
    transactionId,
    payerId,
    recipientId,
    totalAmount,
    platformFee,
    recipientAmount,
    status: 'HELD',
    releaseCondition: releaseConfig.condition,
    releaseWindowStart,
    releaseWindowEnd,
    autoReleaseAt,
    metadata,
    createdAt: now,
    updatedAt: now
  };
  
  // Execute in transaction
  await db.runTransaction(async (transaction) => {
    // Check payer balance
    const payerRef = db.collection('users').doc(payerId);
    const payerSnap = await transaction.get(payerRef);
    
    if (!payerSnap.exists) {
      throw new Error('Payer not found');
    }
    
    const payerData = payerSnap.data();
    const balance = payerData?.wallet?.balance || 0;
    
    if (balance < totalAmount) {
      throw new Error(`Insufficient balance. Required: ${totalAmount}, Available: ${balance}`);
    }
    
    // Deduct from payer
    transaction.update(payerRef, {
      'wallet.balance': FieldValue.increment(-totalAmount),
      'wallet.escrow': FieldValue.increment(totalAmount),
      updatedAt: serverTimestamp()
    });
    
    // Create escrow record
    const escrowRef = db.collection('escrow_wallets').doc(escrowId);
    transaction.set(escrowRef, escrowWallet);
    
    // Log transaction
    const txRef = db.collection('transactions').doc(generateId());
    transaction.set(txRef, {
      txId: generateId(),
      type: 'escrow_opened',
      uid: payerId,
      amount: -totalAmount,
      metadata: {
        escrowId,
        transactionType,
        transactionId,
        recipientId
      },
      createdAt: serverTimestamp()
    });
  });
  
  logger.info(`Escrow opened: ${escrowId} - ${totalAmount} tokens for ${transactionType}`);
  
  return escrowId;
}

/**
 * Release escrow to recipient
 * 
 * Conditions:
 * - Escrow must be in HELD status
 * - Release condition must be met (verified by caller)
 * - Not currently disputed
 * 
 * Splits payment:
 * - 65% to recipient
 * - 35% to platform
 */
export async function releaseEscrow(
  escrowId: string,
  reason: string
): Promise<void> {
  
  const escrowRef = db.collection('escrow_wallets').doc(escrowId);
  const escrowSnap = await escrowRef.get();
  
  if (!escrowSnap.exists) {
    throw new Error('Escrow not found');
  }
  
  const escrow = escrowSnap.data() as EscrowWallet;
  
  if (escrow.status !== 'HELD') {
    throw new Error(`Cannot release escrow in status: ${escrow.status}`);
  }
  
  // Check for active disputes
  const disputeSnap = await db.collection('refund_requests')
    .where('escrowId', '==', escrowId)
    .where('status', 'in', ['PENDING', 'UNDER_REVIEW'])
    .limit(1)
    .get();
  
  if (!disputeSnap.empty) {
    throw new Error('Cannot release escrow: active dispute exists');
  }
  
  // Execute release
  await db.runTransaction(async (transaction) => {
    // Update escrow status
    transaction.update(escrowRef, {
      status: 'RELEASED',
      releasedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      'metadata.releaseReason': reason
    });
    
    // Credit recipient
    const recipientRef = db.collection('users').doc(escrow.recipientId);
    transaction.update(recipientRef, {
      'wallet.balance': FieldValue.increment(escrow.recipientAmount),
      'wallet.earned': FieldValue.increment(escrow.recipientAmount),
      'wallet.escrow': FieldValue.increment(-escrow.totalAmount),
      updatedAt: serverTimestamp()
    });
    
    // Credit platform
    const platformRef = db.collection('platform_wallet').doc('earnings');
    transaction.set(platformRef, {
      balance: FieldValue.increment(escrow.platformFee),
      updatedAt: serverTimestamp()
    }, { merge: true });
    
    // Log transactions
    const recipientTxRef = db.collection('transactions').doc(generateId());
    transaction.set(recipientTxRef, {
      txId: generateId(),
      type: 'escrow_released',
      uid: escrow.recipientId,
      amount: escrow.recipientAmount,
      metadata: {
        escrowId,
        transactionType: escrow.transactionType,
        transactionId: escrow.transactionId,
        reason
      },
      createdAt: serverTimestamp()
    });
    
    const platformTxRef = db.collection('transactions').doc(generateId());
    transaction.set(platformTxRef, {
      txId: generateId(),
      type: 'platform_fee',
      uid: 'platform',
      amount: escrow.platformFee,
      metadata: {
        escrowId,
        transactionType: escrow.transactionType,
        fromUserId: escrow.payerId
      },
      createdAt: serverTimestamp()
    });
  });
  
  logger.info(`Escrow released: ${escrowId} - ${escrow.recipientAmount} to recipient, ${escrow.platformFee} to platform`);
}

/**
 * Refund escrow to payer
 * 
 * Used when:
 * - Delivery failed
 * - Dispute resolved in buyer's favor
 * - Transaction cancelled before delivery
 */
export async function refundEscrow(
  escrowId: string,
  refundAmount: number,
  reason: string
): Promise<void> {
  
  const escrowRef = db.collection('escrow_wallets').doc(escrowId);
  const escrowSnap = await escrowRef.get();
  
  if (!escrowSnap.exists) {
    throw new Error('Escrow not found');
  }
  
  const escrow = escrowSnap.data() as EscrowWallet;
  
  if (escrow.status !== 'HELD' && escrow.status !== 'DISPUTED') {
    throw new Error(`Cannot refund escrow in status: ${escrow.status}`);
  }
  
  if (refundAmount <= 0 || refundAmount > escrow.totalAmount) {
    throw new Error('Invalid refund amount');
  }
  
  // Execute refund
  await db.runTransaction(async (transaction) => {
    // Update escrow status
    transaction.update(escrowRef, {
      status: 'REFUNDED',
      refundedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      'metadata.refundAmount': refundAmount,
      'metadata.refundReason': reason
    });
    
    // Refund to payer
    const payerRef = db.collection('users').doc(escrow.payerId);
    transaction.update(payerRef, {
      'wallet.balance': FieldValue.increment(refundAmount),
      'wallet.escrow': FieldValue.increment(-escrow.totalAmount),
      updatedAt: serverTimestamp()
    });
    
    // If partial refund, handle remainder
    if (refundAmount < escrow.totalAmount) {
      const remainingAmount = escrow.totalAmount - refundAmount;
      const recipientShare = Math.floor(remainingAmount * RECIPIENT_PERCENTAGE);
      const platformShare = remainingAmount - recipientShare;
      
      // Credit recipient with their share of remainder
      const recipientRef = db.collection('users').doc(escrow.recipientId);
      transaction.update(recipientRef, {
        'wallet.balance': FieldValue.increment(recipientShare),
        'wallet.earned': FieldValue.increment(recipientShare),
        updatedAt: serverTimestamp()
      });
      
      // Credit platform with their share
      const platformRef = db.collection('platform_wallet').doc('earnings');
      transaction.set(platformRef, {
        balance: FieldValue.increment(platformShare),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    
    // Log transaction
    const txRef = db.collection('transactions').doc(generateId());
    transaction.set(txRef, {
      txId: generateId(),
      type: 'escrow_refunded',
      uid: escrow.payerId,
      amount: refundAmount,
      metadata: {
        escrowId,
        transactionType: escrow.transactionType,
        transactionId: escrow.transactionId,
        reason
      },
      createdAt: serverTimestamp()
    });
  });
  
  logger.info(`Escrow refunded: ${escrowId} - ${refundAmount} tokens returned to payer`);
}

/**
 * Mark escrow as disputed (freezes it until resolution)
 */
export async function disputeEscrow(
  escrowId: string,
  refundRequestId: string
): Promise<void> {
  
  const escrowRef = db.collection('escrow_wallets').doc(escrowId);
  const escrowSnap = await escrowRef.get();
  
  if (!escrowSnap.exists) {
    throw new Error('Escrow not found');
  }
  
  const escrow = escrowSnap.data() as EscrowWallet;
  
  if (escrow.status !== 'HELD') {
    throw new Error(`Cannot dispute escrow in status: ${escrow.status}`);
  }
  
  await escrowRef.update({
    status: 'DISPUTED',
    updatedAt: serverTimestamp(),
    'metadata.refundRequestId': refundRequestId
  });
  
  logger.info(`Escrow disputed: ${escrowId}`);
}

/**
 * Get escrow by transaction ID
 */
export async function getEscrowByTransaction(
  transactionId: string,
  transactionType: TransactionType
): Promise<EscrowWallet | null> {
  
  const snapshot = await db.collection('escrow_wallets')
    .where('transactionId', '==', transactionId)
    .where('transactionType', '==', transactionType)
    .limit(1)
    .get();
  
  if (snapshot.empty) {
    return null;
  }
  
  return snapshot.docs[0].data() as EscrowWallet;
}

/**
 * Check if escrow can be refunded (within refund window)
 */
export async function canRefundEscrow(escrowId: string): Promise<{
  canRefund: boolean;
  reason: string;
}> {
  
  const escrowRef = db.collection('escrow_wallets').doc(escrowId);
  const escrowSnap = await escrowRef.get();
  
  if (!escrowSnap.exists) {
    return { canRefund: false, reason: 'Escrow not found' };
  }
  
  const escrow = escrowSnap.data() as EscrowWallet;
  
  if (escrow.status !== 'HELD') {
    return { canRefund: false, reason: `Escrow status is ${escrow.status}` };
  }
  
  const now = Date.now();
  const releaseWindowEnd = escrow.releaseWindowEnd.toMillis();
  
  if (now > releaseWindowEnd) {
    return { canRefund: false, reason: 'Refund window has expired' };
  }
  
  return { canRefund: true, reason: 'Refund eligible' };
}

/**
 * Auto-release expired escrows (scheduled job)
 */
export async function autoReleaseExpiredEscrows(): Promise<number> {
  
  const now = Timestamp.now();
  
  const snapshot = await db.collection('escrow_wallets')
    .where('status', '==', 'HELD')
    .where('autoReleaseAt', '<=', now)
    .limit(100)
    .get();
  
  let releasedCount = 0;
  
  for (const doc of snapshot.docs) {
    try {
      await releaseEscrow(doc.id, 'auto_release_timeout');
      releasedCount++;
    } catch (error) {
      logger.error(`Failed to auto-release escrow ${doc.id}:`, error);
    }
  }
  
  if (releasedCount > 0) {
    logger.info(`Auto-released ${releasedCount} expired escrows`);
  }
  
  return releasedCount;
}

/**
 * Get escrow status for user (total held in escrow)
 */
export async function getUserEscrowBalance(userId: string): Promise<{
  totalHeld: number;
  asPayerCount: number;
  asRecipientCount: number;
}> {
  
  // As payer
  const payerSnapshot = await db.collection('escrow_wallets')
    .where('payerId', '==', userId)
    .where('status', '==', 'HELD')
    .select('totalAmount')
    .get();
  
  const asPayerHeld = payerSnapshot.docs.reduce(
    (sum, doc) => sum + (doc.data().totalAmount || 0),
    0
  );
  
  // As recipient
  const recipientSnapshot = await db.collection('escrow_wallets')
    .where('recipientId', '==', userId)
    .where('status', '==', 'HELD')
    .select('recipientAmount')
    .get();
  
  const asRecipientHeld = recipientSnapshot.docs.reduce(
    (sum, doc) => sum + (doc.data().recipientAmount || 0),
    0
  );
  
  return {
    totalHeld: asPayerHeld + asRecipientHeld,
    asPayerCount: payerSnapshot.size,
    asRecipientCount: recipientSnapshot.size
  };
}