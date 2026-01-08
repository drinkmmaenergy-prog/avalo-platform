/**
 * PACK 353 — Payment Fail-Safe System
 * 
 * Purpose: Protect payment integrity with retries and safety checks
 * Ensures: No token assignment without confirmed payment
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  blockDurationMs: number;
}

interface PendingTransaction {
  userId: string;
  provider: 'stripe' | 'apple' | 'google';
  amount: number;
  tokenAmount: number;
  status: 'pending' | 'confirmed' | 'failed' | 'escalated';
  providerTransactionId?: string;
  retryCount: number;
  lastRetryAt?: number;
  createdAt: number;
  confirmedAt?: number;
  failedAt?: number;
  error?: string;
}

interface RetrySchedule {
  attemptNumber: number;
  delayMs: number;
  deadline: number;
}

// Retry configuration
const RETRY_SCHEDULE = [
  { attemptNumber: 1, delayMs: 60 * 1000, deadline: 60 * 1000 }, // 1 minute
  { attemptNumber: 2, delayMs: 5 * 60 * 1000, deadline: 6 * 60 * 1000 }, // 5 minutes (6 min total)
  { attemptNumber: 3, delayMs: 15 * 60 * 1000, deadline: 21 * 60 * 1000 }, // 15 minutes (21 min total)
];

const ESCALATION_THRESHOLD = 3; // After 3 retries, escalate to support

/**
 * Create a pending transaction
 */
export async function createPendingTransaction(
  userId: string,
  provider: 'stripe' | 'apple' | 'google',
  amount: number,
  tokenAmount: number,
  providerTransactionId?: string
): Promise<string> {
  const db = admin.firestore();
  const now = Date.now();
  
  const transaction: PendingTransaction = {
    userId,
    provider,
    amount,
    tokenAmount,
    status: 'pending',
    providerTransactionId,
    retryCount: 0,
    createdAt: now,
  };
  
  const ref = await db.collection('pendingTransactions').add(transaction);
  
  // Schedule first retry
  await scheduleRetry(ref.id, 1);
  
  return ref.id;
}

/**
 * Confirm transaction and assign tokens
 */
export async function confirmTransaction(
  transactionId: string,
  providerTransactionId: string
): Promise<{ success: boolean; tokensAssigned?: number }> {
  const db = admin.firestore();
  
  try {
    const result = await db.runTransaction(async (transaction) => {
      const ref = db.collection('pendingTransactions').doc(transactionId);
      const doc = await transaction.get(ref);
      
      if (!doc.exists) {
        throw new Error('Transaction not found');
      }
      
      const data = doc.data() as PendingTransaction;
      
      if (data.status === 'confirmed') {
        return { success: true, tokensAssigned: data.tokenAmount, alreadyProcessed: true };
      }
      
      if (data.status === 'failed' || data.status === 'escalated') {
        throw new Error(`Cannot confirm transaction in status: ${data.status}`);
      }
      
      // Update transaction status
      transaction.update(ref, {
        status: 'confirmed',
        confirmedAt: Date.now(),
        providerTransactionId,
      });
      
      // Assign tokens to user wallet
      const walletRef = db.collection('wallets').doc(data.userId);
      const walletDoc = await transaction.get(walletRef);
      
      if (!walletDoc.exists) {
        // Create wallet if doesn't exist
        transaction.set(walletRef, {
          userId: data.userId,
          balance: data.tokenAmount,
          currency: 'AVALO',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        // Update existing wallet
        transaction.update(walletRef, {
          balance: admin.firestore.FieldValue.increment(data.tokenAmount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      
      // Create transaction record
      await transaction.set(db.collection('transactions').doc(), {
        userId: data.userId,
        type: 'purchase',
        amount: data.tokenAmount,
        currency: 'AVALO',
        provider: data.provider,
        providerTransactionId,
        status: 'completed',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      return { success: true, tokensAssigned: data.tokenAmount };
    });
    
    return result;
  } catch (error) {
    console.error('Transaction confirmation error:', error);
    return { success: false };
  }
}

/**
 * Retry verification with external provider
 */
export async function retryTransactionVerification(
  transactionId: string
): Promise<{ success: boolean; confirmed?: boolean }> {
  const db = admin.firestore();
  
  try {
    const ref = db.collection('pendingTransactions').doc(transactionId);
    const doc = await ref.get();
    
    if (!doc.exists) {
      return { success: false };
    }
    
    const data = doc.data() as PendingTransaction;
    
    if (data.status !== 'pending') {
      return { success: true };
    }
    
    // Verify with provider
    const verified = await verifyWithProvider(data.provider, data.providerTransactionId);
    
    if (verified.confirmed) {
      // Confirm transaction
      const result = await confirmTransaction(transactionId, data.providerTransactionId!);
      return { success: result.success, confirmed: true };
    }
    
    if (verified.failed) {
      // Mark as failed
      await ref.update({
        status: 'failed',
        failedAt: Date.now(),
        error: verified.error,
      });
      
      return { success: true, confirmed: false };
    }
    
    // Still pending, increment retry count
    const newRetryCount = data.retryCount + 1;
    
    await ref.update({
      retryCount: newRetryCount,
      lastRetryAt: Date.now(),
    });
    
    // Check if should escalate
    if (newRetryCount >= ESCALATION_THRESHOLD) {
      await escalateToSupport(transactionId, data);
    } else {
      // Schedule next retry
      await scheduleRetry(transactionId, newRetryCount + 1);
    }
    
    return { success: true, confirmed: false };
  } catch (error) {
    console.error('Retry verification error:', error);
    return { success: false };
  }
}

/**
 * Verify transaction with external provider
 */
async function verifyWithProvider(
  provider: 'stripe' | 'apple' | 'google',
  transactionId?: string
): Promise<{ confirmed: boolean; failed?: boolean; error?: string }> {
  if (!transactionId) {
    return { confirmed: false };
  }
  
  try {
    switch (provider) {
      case 'stripe':
        return await verifyStripeTransaction(transactionId);
      
      case 'apple':
        return await verifyAppleTransaction(transactionId);
      
      case 'google':
        return await verifyGoogleTransaction(transactionId);
      
      default:
        return { confirmed: false, failed: true, error: 'Unknown provider' };
    }
  } catch (error) {
    console.error(`Provider verification error (${provider}):`, error);
    return { confirmed: false };
  }
}

/**
 * Verify Stripe transaction
 */
async function verifyStripeTransaction(
  paymentIntentId: string
): Promise<{ confirmed: boolean; failed?: boolean; error?: string }> {
  // Note: Requires Stripe SDK
  // This is a placeholder implementation
  
  try {
    // In real implementation:
    // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    // const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    // return { confirmed: paymentIntent.status === 'succeeded' };
    
    // Placeholder: assume still pending
    return { confirmed: false };
  } catch (error: any) {
    if (error.code === 'resource_missing') {
      return { confirmed: false, failed: true, error: 'Payment intent not found' };
    }
    return { confirmed: false };
  }
}

/**
 * Verify Apple IAP transaction
 */
async function verifyAppleTransaction(
  transactionId: string
): Promise<{ confirmed: boolean; failed?: boolean; error?: string }> {
  // Note: Requires Apple IAP verification
  // This is a placeholder implementation
  
  try {
    // In real implementation:
    // Verify receipt with Apple's servers
    // const verified = await verifyAppleReceipt(transactionId);
    // return { confirmed: verified };
    
    // Placeholder: assume still pending
    return { confirmed: false };
  } catch (error) {
    return { confirmed: false };
  }
}

/**
 * Verify Google Play transaction
 */
async function verifyGoogleTransaction(
  transactionId: string
): Promise<{ confirmed: boolean; failed?: boolean; error?: string }> {
  // Note: Requires Google Play verification
  // This is a placeholder implementation
  
  try {
    // In real implementation:
    // Verify purchase with Google Play API
    // const verified = await verifyGooglePurchase(transactionId);
    // return { confirmed: verified };
    
    // Placeholder: assume still pending
    return { confirmed: false };
  } catch (error) {
    return { confirmed: false };
  }
}

/**
 * Schedule retry attempt
 */
async function scheduleRetry(transactionId: string, attemptNumber: number): Promise<void> {
  const schedule = RETRY_SCHEDULE[attemptNumber - 1];
  
  if (!schedule) {
    // No more retries, escalate
    return;
  }
  
  const db = admin.firestore();
  
  await db.collection('scheduledRetries').add({
    transactionId,
    attemptNumber,
    scheduledFor: Date.now() + schedule.delayMs,
    deadline: Date.now() + schedule.deadline,
    status: 'scheduled',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Escalate to support staff
 */
async function escalateToSupport(
  transactionId: string,
  transaction: PendingTransaction
): Promise<void> {
  const db = admin.firestore();
  
  // Update transaction status
  await db.collection('pendingTransactions').doc(transactionId).update({
    status: 'escalated',
  });
  
  // Create support ticket
  await db.collection('supportTickets').add({
    type: 'payment_verification_failed',
    priority: 'high',
    userId: transaction.userId,
    transactionId,
    provider: transaction.provider,
    amount: transaction.amount,
    tokenAmount: transaction.tokenAmount,
    providerTransactionId: transaction.providerTransactionId,
    retryCount: transaction.retryCount,
    status: 'open',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  
  // Log escalation
  console.warn('Payment transaction escalated to support:', {
    transactionId,
    userId: transaction.userId,
    provider: transaction.provider,
    retries: transaction.retryCount,
  });
}

/**
 * Get pending transaction status
 */
export async function getTransactionStatus(
  transactionId: string
): Promise<PendingTransaction | null> {
  const db = admin.firestore();
  
  const doc = await db.collection('pendingTransactions').doc(transactionId).get();
  
  if (!doc.exists) {
    return null;
  }
  
  return doc.data() as PendingTransaction;
}

/**
 * Clean up old pending transactions (scheduled function)
 */
export async function cleanupOldTransactions(): Promise<void> {
  const db = admin.firestore();
  const cutoffTime = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago
  
  const batch = db.batch();
  const oldTransactions = await db
    .collection('pendingTransactions')
    .where('createdAt', '<', cutoffTime)
    .where('status', 'in', ['confirmed', 'failed'])
    .limit(500)
    .get();
  
  oldTransactions.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  
  console.log(`Cleaned up ${oldTransactions.size} old transactions`);
}

/**
 * Process scheduled retries (cloud function trigger)
 */
export const processScheduledRetries = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async (context) => {
    const db = admin.firestore();
    const now = Date.now();
    
    const dueRetries = await db
      .collection('scheduledRetries')
      .where('status', '==', 'scheduled')
      .where('scheduledFor', '<=', now)
      .limit(50)
      .get();
    
    const promises = dueRetries.docs.map(async (doc) => {
      const data = doc.data();
      
      try {
        // Mark as processing
        await doc.ref.update({ status: 'processing' });
        
        // Retry verification
        const result = await retryTransactionVerification(data.transactionId);
        
        // Mark as completed
        await doc.ref.update({
          status: 'completed',
          completedAt: Date.now(),
          result: result.confirmed ? 'confirmed' : 'still_pending',
        });
      } catch (error) {
        console.error('Retry processing error:', error);
        await doc.ref.update({
          status: 'error',
          error: String(error),
        });
      }
    });
    
    await Promise.all(promises);
    
    console.log(`Processed ${dueRetries.size} scheduled retries`);
  });
