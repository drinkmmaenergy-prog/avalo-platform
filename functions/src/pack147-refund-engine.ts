/**
 * PACK 147 — Refund Request Engine
 * 
 * Handles refund requests with automatic evaluation.
 * 
 * RULES:
 * - Auto-reject emotional/romantic claims
 * - Auto-approve quantifiable failed deliveries
 * - AI review for ambiguous cases
 * - Human arbitration for complex disputes
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import {
  RefundRequest,
  RefundStatus,
  RefundReason,
  DisputeTier,
  DisputeOutcome,
  TransactionType,
  isValidRefundReason,
  determineDisputeTier,
  calculateRefundAmount
} from './pack147-types';
import { getEscrowByTransaction, canRefundEscrow, disputeEscrow, refundEscrow } from './pack147-escrow-engine';
import { detectFraudPattern } from './pack147-fraud-detection';

// ============================================================================
// REFUND REQUEST FUNCTIONS
// ============================================================================

/**
 * Request a refund
 * 
 * Validates:
 * - Refund reason is valid (not emotional/romantic)
 * - Within refund window
 * - Escrow exists and can be refunded
 * - No active fraud patterns
 * 
 * Creates refund request and routes to appropriate tier
 */
export async function requestRefund(params: {
  userId: string;
  transactionId: string;
  transactionType: TransactionType;
  reason: RefundReason;
  description: string;
  evidenceUrls?: string[];
}): Promise<string> {
  
  const { userId, transactionId, transactionType, reason, description, evidenceUrls = [] } = params;
  
  // Validate reason (auto-reject emotional/romantic claims)
  if (!isValidRefundReason(reason)) {
    throw new Error(`Invalid refund reason: ${reason}. Emotional satisfaction and romantic expectations are not valid grounds for refunds.`);
  }
  
  // Get escrow
  const escrow = await getEscrowByTransaction(transactionId, transactionType);
  if (!escrow) {
    throw new Error('Transaction not found or not eligible for refund');
  }
  
  // Verify requester is the payer
  if (escrow.payerId !== userId) {
    throw new Error('Only the payer can request a refund');
  }
  
  // Check if refund is within allowed window
  const refundCheck = await canRefundEscrow(escrow.escrowId);
  if (!refundCheck.canRefund) {
    throw new Error(`Cannot request refund: ${refundCheck.reason}`);
  }
  
  // Check for fraud patterns
  const fraudCheck = await detectFraudPattern({
    userId,
    action: 'refund_request',
    transactionId,
    metadata: { reason, transactionType }
  });
  
  if (fraudCheck.isFraud) {
    logger.warn(`Fraud detected for user ${userId}: ${fraudCheck.pattern}`);
    throw new Error('Refund request blocked due to suspicious activity');
  }
  
  // Check for existing refund request
  const existingRefund = await db.collection('refund_requests')
    .where('transactionId', '==', transactionId)
    .where('status', 'in', ['PENDING', 'UNDER_REVIEW'])
    .limit(1)
    .get();
  
  if (!existingRefund.empty) {
    throw new Error('A refund request already exists for this transaction');
  }
  
  // Determine dispute tier
  const tier = determineDisputeTier(transactionType, reason);
  
  // Create refund request
  const refundId = generateId();
  const now = Timestamp.now();
  
  const refundRequest: RefundRequest = {
    refundId,
    escrowId: escrow.escrowId,
    transactionId,
    transactionType,
    requesterId: userId,
    recipientId: escrow.recipientId,
    reason,
    description,
    evidenceUrls,
    status: 'PENDING',
    tier,
    requestedAt: now,
    metadata: {
      transactionAmount: escrow.totalAmount,
      escrowStatus: escrow.status
    }
  };
  
  await db.collection('refund_requests').doc(refundId).set(refundRequest);
  
  // Mark escrow as disputed
  await disputeEscrow(escrow.escrowId, refundId);
  
  // Route to appropriate tier for evaluation
  if (tier === 'TIER_1_AUTO') {
    // Evaluate immediately
    await evaluateTier1Refund(refundId);
  } else if (tier === 'TIER_2_AI') {
    // Queue for AI review
    await queueForAIReview(refundId);
  } else {
    // Queue for human review
    await queueForHumanReview(refundId);
  }
  
  logger.info(`Refund requested: ${refundId} - ${transactionType} ${reason} (${tier})`);
  
  return refundId;
}

/**
 * Tier 1: Auto-evaluate quantifiable outcomes
 * 
 * Automatically approves/rejects based on objective criteria:
 * - Message/file delivered? (check delivery logs)
 * - Call happened? (check call logs)
 * - Event cancelled? (check event status)
 * - Access granted? (check access logs)
 */
async function evaluateTier1Refund(refundId: string): Promise<void> {
  
  const refundRef = db.collection('refund_requests').doc(refundId);
  const refundSnap = await refundRef.get();
  
  if (!refundSnap.exists) {
    throw new Error('Refund request not found');
  }
  
  const refund = refundSnap.data() as RefundRequest;
  
  let outcome: DisputeOutcome;
  let evaluationNotes: string;
  let confidence = 1.0;
  
  // Check objective delivery criteria
  const deliveryStatus = await checkDeliveryStatus(refund.transactionId, refund.transactionType);
  
  if (!deliveryStatus.delivered) {
    // Service not delivered → Full refund
    outcome = 'BUYER_WINS_FULL';
    evaluationNotes = `Automatic approval: ${deliveryStatus.reason}`;
  } else if (deliveryStatus.delivered && deliveryStatus.verified) {
    // Service delivered and verified → No refund
    outcome = 'CREATOR_WINS';
    evaluationNotes = `Automatic rejection: ${deliveryStatus.reason}`;
  } else {
    // Ambiguous → Escalate to Tier 2
    await refundRef.update({
      tier: 'TIER_2_AI',
      updatedAt: serverTimestamp(),
      'metadata.tier1EscalationReason': deliveryStatus.reason
    });
    await queueForAIReview(refundId);
    return;
  }
  
  // Apply outcome
  await applyRefundOutcome(refundId, outcome, evaluationNotes, confidence, 'auto');
}

/**
 * Check delivery status for transaction
 */
async function checkDeliveryStatus(
  transactionId: string,
  transactionType: TransactionType
): Promise<{
  delivered: boolean;
  verified: boolean;
  reason: string;
}> {
  
  switch (transactionType) {
    case 'PAID_CHAT': {
      // Check if message was delivered
      const messageSnap = await db.collection('messages')
        .where('messageId', '==', transactionId)
        .limit(1)
        .get();
      
      if (messageSnap.empty) {
        return { delivered: false, verified: true, reason: 'Message not found in system' };
      }
      
      const message = messageSnap.docs[0].data();
      if (message.deliveredAt) {
        return { delivered: true, verified: true, reason: 'Message delivered at ' + message.deliveredAt.toDate().toISOString() };
      }
      
      return { delivered: false, verified: true, reason: 'Message never delivered' };
    }
    
    case 'PAID_CALL': {
      // Check if call happened
      const callSnap = await db.collection('calls')
        .where('callId', '==', transactionId)
        .limit(1)
        .get();
      
      if (callSnap.empty) {
        return { delivered: false, verified: true, reason: 'Call record not found' };
      }
      
      const call = callSnap.docs[0].data();
      if (call.state === 'ENDED' && call.durationMinutes > 0) {
        return { delivered: true, verified: true, reason: `Call completed: ${call.durationMinutes} minutes` };
      }
      
      return { delivered: false, verified: true, reason: 'Call never connected or lasted 0 minutes' };
    }
    
    case 'EVENT_TICKET': {
      // Check event status
      const eventSnap = await db.collection('events')
        .doc(transactionId)
        .get();
      
      if (!eventSnap.exists) {
        return { delivered: false, verified: true, reason: 'Event not found' };
      }
      
      const event = eventSnap.data();
      if (event?.status === 'cancelled') {
        return { delivered: false, verified: true, reason: 'Event was cancelled' };
      }
      
      if (event?.status === 'completed') {
        return { delivered: true, verified: true, reason: 'Event completed successfully' };
      }
      
      return { delivered: false, verified: false, reason: 'Event status unclear, needs review' };
    }
    
    case 'DIGITAL_PRODUCT': {
      // Check if file was delivered
      const purchaseSnap = await db.collection('digital_product_purchases')
        .where('purchaseId', '==', transactionId)
        .limit(1)
        .get();
      
      if (purchaseSnap.empty) {
        return { delivered: false, verified: true, reason: 'Purchase record not found' };
      }
      
      const purchase = purchaseSnap.docs[0].data();
      if (purchase.downloadCount > 0) {
        return { delivered: true, verified: true, reason: `File downloaded ${purchase.downloadCount} times` };
      }
      
      return { delivered: false, verified: false, reason: 'File never downloaded, may be access issue' };
    }
    
    case 'MENTORSHIP_SESSION': {
      // Check session completion
      const sessionSnap = await db.collection('mentorship_sessions')
        .doc(transactionId)
        .get();
      
      if (!sessionSnap.exists) {
        return { delivered: false, verified: true, reason: 'Session not found' };
      }
      
      const session = sessionSnap.data();
      if (session?.status === 'completed') {
        return { delivered: true, verified: true, reason: 'Session completed' };
      }
      
      if (session?.status === 'cancelled') {
        return { delivered: false, verified: true, reason: 'Session was cancelled' };
      }
      
      return { delivered: false, verified: false, reason: 'Session status needs review' };
    }
    
    default:
      return { delivered: false, verified: false, reason: 'Transaction type requires manual review' };
  }
}

/**
 * Queue refund for AI review (Tier 2)
 */
async function queueForAIReview(refundId: string): Promise<void> {
  
  await db.collection('refund_requests').doc(refundId).update({
    status: 'UNDER_REVIEW',
    tier: 'TIER_2_AI',
    updatedAt: serverTimestamp(),
    'metadata.queuedForAIAt': serverTimestamp()
  });
  
  // In production, trigger AI review service
  // For now, log for manual triggering
  logger.info(`Refund ${refundId} queued for AI review`);
}

/**
 * Queue refund for human review (Tier 3)
 */
async function queueForHumanReview(refundId: string): Promise<void> {
  
  await db.collection('refund_requests').doc(refundId).update({
    status: 'UNDER_REVIEW',
    tier: 'TIER_3_HUMAN',
    updatedAt: serverTimestamp(),
    'metadata.queuedForHumanAt': serverTimestamp()
  });
  
  logger.info(`Refund ${refundId} queued for human review`);
}

/**
 * Apply refund outcome
 */
async function applyRefundOutcome(
  refundId: string,
  outcome: DisputeOutcome,
  evaluationNotes: string,
  confidence: number,
  evaluatedBy: string
): Promise<void> {
  
  const refundRef = db.collection('refund_requests').doc(refundId);
  const refundSnap = await refundRef.get();
  
  if (!refundSnap.exists) {
    throw new Error('Refund request not found');
  }
  
  const refund = refundSnap.data() as RefundRequest;
  const escrow = await db.collection('escrow_wallets').doc(refund.escrowId).get();
  const escrowData = escrow.data();
  
  if (!escrowData) {
    throw new Error('Escrow not found');
  }
  
  const refundAmount = calculateRefundAmount(escrowData.totalAmount, outcome);
  const newStatus: RefundStatus = refundAmount > 0 ? 'APPROVED' : 'REJECTED';
  
  // Update refund request
  await refundRef.update({
    status: newStatus,
    outcome,
    refundAmount,
    confidence,
    evaluatedBy,
    evaluationNotes,
    evaluatedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  // Execute refund if approved
  if (refundAmount > 0) {
    await refundEscrow(refund.escrowId, refundAmount, `Refund approved: ${outcome}`);
    
    await refundRef.update({
      status: 'COMPLETED',
      completedAt: serverTimestamp()
    });
  }
  
  // Track reputation impact (import from integrations)
  try {
    const { trackRefundImpact } = await import('./pack147-integrations');
    await trackRefundImpact(refund, outcome);
  } catch (error) {
    logger.error('Failed to track reputation impact:', error);
  }
  
  logger.info(`Refund ${refundId} ${newStatus}: ${outcome} (${refundAmount} tokens)`);
}

/**
 * Cancel refund request (by requester)
 */
export async function cancelRefundRequest(
  refundId: string,
  userId: string
): Promise<void> {
  
  const refundRef = db.collection('refund_requests').doc(refundId);
  const refundSnap = await refundRef.get();
  
  if (!refundSnap.exists) {
    throw new Error('Refund request not found');
  }
  
  const refund = refundSnap.data() as RefundRequest;
  
  if (refund.requesterId !== userId) {
    throw new Error('Only the requester can cancel the refund');
  }
  
  if (!['PENDING', 'UNDER_REVIEW'].includes(refund.status)) {
    throw new Error(`Cannot cancel refund in status: ${refund.status}`);
  }
  
  await refundRef.update({
    status: 'CANCELLED',
    updatedAt: serverTimestamp(),
    completedAt: serverTimestamp()
  });
  
  logger.info(`Refund cancelled: ${refundId}`);
}

/**
 * Get refund requests for user
 */
export async function getUserRefundRequests(
  userId: string,
  asRequester: boolean = true
): Promise<RefundRequest[]> {
  
  const field = asRequester ? 'requesterId' : 'recipientId';
  
  const snapshot = await db.collection('refund_requests')
    .where(field, '==', userId)
    .orderBy('requestedAt', 'desc')
    .limit(50)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as RefundRequest);
}

/**
 * Admin: Manually resolve refund (Tier 3)
 */
export async function adminResolveRefund(params: {
  refundId: string;
  adminId: string;
  outcome: DisputeOutcome;
  notes: string;
}): Promise<void> {
  
  const { refundId, adminId, outcome, notes } = params;
  
  await applyRefundOutcome(refundId, outcome, notes, 1.0, adminId);
  
  logger.info(`Admin ${adminId} resolved refund ${refundId}: ${outcome}`);
}