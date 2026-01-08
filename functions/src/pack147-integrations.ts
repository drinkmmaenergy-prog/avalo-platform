/**
 * PACK 147 — System Integrations
 * 
 * Integrates refund/dispute system with:
 * - PACK 140: Reputation System
 * - PACK 146: Copyright System
 * - Chat/Call Monetization
 * - Digital Products
 * - Events & Mentorship
 */

import { db, serverTimestamp, generateId } from './init';
import * as logger from 'firebase-functions/logger';
import { RefundRequest, DisputeOutcome, ReputationImpactRecord } from './pack147-types';

// ============================================================================
// REPUTATION INTEGRATION (PACK 140)
// ============================================================================

/**
 * Track reputation impact from refund outcome
 */
export async function trackRefundImpact(
  refund: RefundRequest,
  outcome: DisputeOutcome
): Promise<void> {
  
  try {
    // Determine impact based on outcome
    let buyerImpact = 0;
    let creatorImpact = 0;
    let buyerDimension: 'RELIABILITY' | 'COMMUNICATION' | 'DELIVERY' | 'SAFETY' = 'RELIABILITY';
    let creatorDimension: 'RELIABILITY' | 'COMMUNICATION' | 'DELIVERY' | 'SAFETY' = 'DELIVERY';
    
    switch (outcome) {
      case 'BUYER_WINS_FULL':
        // Creator failed to deliver
        creatorImpact = -8;
        creatorDimension = 'DELIVERY';
        break;
      
      case 'BUYER_WINS_PARTIAL':
        // Partial failure
        creatorImpact = -4;
        creatorDimension = 'DELIVERY';
        break;
      
      case 'CREATOR_WINS':
        // Buyer made invalid claim
        buyerImpact = -5;
        buyerDimension = 'RELIABILITY';
        break;
      
      case 'SPLIT_DECISION':
        // Both parties have some responsibility
        buyerImpact = -2;
        creatorImpact = -2;
        break;
    }
    
    // Record impacts
    if (buyerImpact !== 0) {
      await recordReputationImpact({
        userId: refund.requesterId,
        sourceType: 'REFUND',
        sourceId: refund.refundId,
        dimension: buyerDimension,
        scoreImpact: buyerImpact,
        reason: `Refund ${outcome}: ${refund.reason}`
      });
    }
    
    if (creatorImpact !== 0) {
      await recordReputationImpact({
        userId: refund.recipientId,
        sourceType: 'REFUND',
        sourceId: refund.refundId,
        dimension: creatorDimension,
        scoreImpact: creatorImpact,
        reason: `Refund ${outcome}: ${refund.reason}`
      });
    }
    
  } catch (error) {
    logger.error('Failed to track reputation impact:', error);
  }
}

/**
 * Record reputation impact
 */
async function recordReputationImpact(params: {
  userId: string;
  sourceType: 'REFUND' | 'DISPUTE';
  sourceId: string;
  dimension: 'RELIABILITY' | 'COMMUNICATION' | 'DELIVERY' | 'SAFETY';
  scoreImpact: number;
  reason: string;
}): Promise<void> {
  
  const { userId, sourceType, sourceId, dimension, scoreImpact, reason } = params;
  
  const impactId = generateId();
  
  const record: ReputationImpactRecord = {
    impactId,
    userId,
    sourceType,
    sourceId,
    dimension,
    scoreImpact,
    reason,
    recordedAt: serverTimestamp() as any
  };
  
  await db.collection('reputation_impact_records').doc(impactId).set(record);
  
  // Try to call PACK 140 reputation system if available
  try {
    const reputationModule = await import('./reputation-integrations') as any;
    
    // Check if appropriate tracking function exists
    if (reputationModule.trackDisputeResolved) {
      await reputationModule.trackDisputeResolved(userId, sourceId, scoreImpact > 0 ? 'resolved' : 'unresolved');
    }
    
  } catch (error) {
    // PACK 140 may not be available or has different API, log only
    logger.info('PACK 140 reputation integration not available');
  }
}

// ============================================================================
// CHAT/CALL MONETIZATION INTEGRATION
// ============================================================================

/**
 * Create escrow for paid chat message
 */
export async function createChatEscrow(params: {
  messageId: string;
  payerId: string;
  recipientId: string;
  amount: number;
}): Promise<string> {
  
  const { openEscrow } = await import('./pack147-escrow-engine');
  
  return await openEscrow({
    transactionType: 'PAID_CHAT',
    transactionId: params.messageId,
    payerId: params.payerId,
    recipientId: params.recipientId,
    totalAmount: params.amount,
    metadata: {
      messageId: params.messageId
    }
  });
}

/**
 * Release chat escrow when message delivered
 */
export async function releaseChatEscrow(messageId: string): Promise<void> {
  
  const { getEscrowByTransaction, releaseEscrow } = await import('./pack147-escrow-engine');
  
  const escrow = await getEscrowByTransaction(messageId, 'PAID_CHAT');
  if (escrow && escrow.status === 'HELD') {
    await releaseEscrow(escrow.escrowId, 'message_delivered');
  }
}

/**
 * Create escrow for paid call
 */
export async function createCallEscrow(params: {
  callId: string;
  payerId: string;
  recipientId: string;
  amount: number;
}): Promise<string> {
  
  const { openEscrow } = await import('./pack147-escrow-engine');
  
  return await openEscrow({
    transactionType: 'PAID_CALL',
    transactionId: params.callId,
    payerId: params.payerId,
    recipientId: params.recipientId,
    totalAmount: params.amount,
    metadata: {
      callId: params.callId
    }
  });
}

/**
 * Release call escrow when call completed
 */
export async function releaseCallEscrow(callId: string): Promise<void> {
  
  const { getEscrowByTransaction, releaseEscrow } = await import('./pack147-escrow-engine');
  
  const escrow = await getEscrowByTransaction(callId, 'PAID_CALL');
  if (escrow && escrow.status === 'HELD') {
    await releaseEscrow(escrow.escrowId, 'call_completed');
  }
}

// ============================================================================
// DIGITAL PRODUCTS INTEGRATION
// ============================================================================

/**
 * Create escrow for digital product purchase
 */
export async function createDigitalProductEscrow(params: {
  purchaseId: string;
  payerId: string;
  creatorId: string;
  amount: number;
}): Promise<string> {
  
  const { openEscrow } = await import('./pack147-escrow-engine');
  
  return await openEscrow({
    transactionType: 'DIGITAL_PRODUCT',
    transactionId: params.purchaseId,
    payerId: params.payerId,
    recipientId: params.creatorId,
    totalAmount: params.amount,
    metadata: {
      purchaseId: params.purchaseId
    }
  });
}

/**
 * Release digital product escrow after download
 */
export async function releaseDigitalProductEscrow(purchaseId: string): Promise<void> {
  
  const { getEscrowByTransaction, releaseEscrow } = await import('./pack147-escrow-engine');
  
  const escrow = await getEscrowByTransaction(purchaseId, 'DIGITAL_PRODUCT');
  if (escrow && escrow.status === 'HELD') {
    await releaseEscrow(escrow.escrowId, 'file_delivered_and_downloaded');
  }
}

// ============================================================================
// MENTORSHIP INTEGRATION
// ============================================================================

/**
 * Create escrow for mentorship session
 */
export async function createMentorshipEscrow(params: {
  sessionId: string;
  payerId: string;
  mentorId: string;
  amount: number;
}): Promise<string> {
  
  const { openEscrow } = await import('./pack147-escrow-engine');
  
  return await openEscrow({
    transactionType: 'MENTORSHIP_SESSION',
    transactionId: params.sessionId,
    payerId: params.payerId,
    recipientId: params.mentorId,
    totalAmount: params.amount,
    metadata: {
      sessionId: params.sessionId
    }
  });
}

/**
 * Release mentorship escrow when session completed
 */
export async function releaseMentorshipEscrow(sessionId: string): Promise<void> {
  
  const { getEscrowByTransaction, releaseEscrow } = await import('./pack147-escrow-engine');
  
  const escrow = await getEscrowByTransaction(sessionId, 'MENTORSHIP_SESSION');
  if (escrow && escrow.status === 'HELD') {
    await releaseEscrow(escrow.escrowId, 'session_completed');
  }
}

// ============================================================================
// EVENTS INTEGRATION
// ============================================================================

/**
 * Create escrow for event ticket
 */
export async function createEventEscrow(params: {
  ticketId: string;
  payerId: string;
  organizerId: string;
  amount: number;
}): Promise<string> {
  
  const { openEscrow } = await import('./pack147-escrow-engine');
  
  return await openEscrow({
    transactionType: 'EVENT_TICKET',
    transactionId: params.ticketId,
    payerId: params.payerId,
    recipientId: params.organizerId,
    totalAmount: params.amount,
    metadata: {
      ticketId: params.ticketId
    }
  });
}

/**
 * Release event escrow when event starts
 */
export async function releaseEventEscrow(ticketId: string): Promise<void> {
  
  const { getEscrowByTransaction, releaseEscrow } = await import('./pack147-escrow-engine');
  
  const escrow = await getEscrowByTransaction(ticketId, 'EVENT_TICKET');
  if (escrow && escrow.status === 'HELD') {
    await releaseEscrow(escrow.escrowId, 'event_started');
  }
}

/**
 * Refund event ticket if event cancelled
 */
export async function refundCancelledEvent(ticketId: string): Promise<void> {
  
  const { getEscrowByTransaction, refundEscrow } = await import('./pack147-escrow-engine');
  
  const escrow = await getEscrowByTransaction(ticketId, 'EVENT_TICKET');
  if (escrow && escrow.status === 'HELD') {
    await refundEscrow(escrow.escrowId, escrow.totalAmount, 'event_cancelled_by_organizer');
  }
}

// ============================================================================
// CLUBS & CHALLENGES INTEGRATION
// ============================================================================

/**
 * Create escrow for gated club access
 */
export async function createClubEscrow(params: {
  accessId: string;
  payerId: string;
  clubOwnerId: string;
  amount: number;
}): Promise<string> {
  
  const { openEscrow } = await import('./pack147-escrow-engine');
  
  return await openEscrow({
    transactionType: 'GATED_CLUB',
    transactionId: params.accessId,
    payerId: params.payerId,
    recipientId: params.clubOwnerId,
    totalAmount: params.amount,
    metadata: {
      accessId: params.accessId
    }
  });
}

/**
 * Release club escrow after 24h access
 */
export async function releaseClubEscrow(accessId: string): Promise<void> {
  
  const { getEscrowByTransaction, releaseEscrow } = await import('./pack147-escrow-engine');
  
  const escrow = await getEscrowByTransaction(accessId, 'GATED_CLUB');
  if (escrow && escrow.status === 'HELD') {
    await releaseEscrow(escrow.escrowId, 'access_granted_24h');
  }
}

// ============================================================================
// COPYRIGHT INTEGRATION (PACK 146)
// ============================================================================

/**
 * Handle copyright violation refund
 * If content is proven stolen, auto-approve full refund
 */
export async function handleCopyrightViolationRefund(params: {
  transactionId: string;
  transactionType: any;
  violationId: string;
}): Promise<void> {
  
  const { getEscrowByTransaction, refundEscrow } = await import('./pack147-escrow-engine');
  
  const escrow = await getEscrowByTransaction(params.transactionId, params.transactionType);
  
  if (escrow && escrow.status === 'HELD') {
    await refundEscrow(
      escrow.escrowId, 
      escrow.totalAmount, 
      `copyright_violation_${params.violationId}`
    );
    
    logger.info(`Copyright violation refund: ${params.transactionId}`);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if refund is related to NSFW content (zero tolerance)
 */
export function isNSFWRefund(refund: RefundRequest): boolean {
  
  const nsfwKeywords = [
    'nsfw', 'adult', 'explicit', 'nude', 'naked', 'porn', 
    'xxx', 'sexual', 'escort', 'onlyfans'
  ];
  
  const text = `${refund.reason} ${refund.description}`.toLowerCase();
  
  return nsfwKeywords.some(keyword => text.includes(keyword));
}

/**
 * Escalate NSFW-related refunds to immediate human review
 */
export async function escalateNSFWRefund(refundId: string): Promise<void> {
  
  await db.collection('refund_requests').doc(refundId).update({
    tier: 'TIER_3_HUMAN',
    status: 'UNDER_REVIEW',
    'metadata.nsfwEscalated': true,
    'metadata.escalatedAt': serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  logger.warn(`NSFW-related refund escalated: ${refundId}`);
}