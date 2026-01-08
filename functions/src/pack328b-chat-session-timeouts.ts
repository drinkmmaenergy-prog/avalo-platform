/**
 * PACK 328B — Chat & Session Inactivity Timeouts (Anti-Abuse & UX Layer)
 * 
 * Core implementation for chat session timeout and auto-expiration logic.
 * 
 * Key Features:
 * - Auto-expire inactive chats (48h free, 72h paid)
 * - Calculate and refund unused word buckets
 * - Manual "End Chat" functionality
 * - Anti-abuse fraud detection for calls
 * 
 * NO tokenomics changes — uses existing chat monetization logic
 */

import { db, serverTimestamp, increment, generateId } from './init.js';
import type {
  Pack328bChatSession,
  Pack328bChatStatus,
  Pack328bRefundResult,
  Pack328bExpirationJobResult,
  Pack328bCallSession,
  Pack328bCallFraudSignal,
} from './pack328b-chat-session-timeouts-types.js';
import { PACK_328B_TIMEOUTS } from './pack328b-chat-session-timeouts-types.js';

// Simple error class
class HttpsError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'HttpsError';
  }
}

// Simple logger
const logger = {
  info: (..._args: any[]) => {},
  warn: (..._args: any[]) => {},
  error: (..._args: any[]) => {},
};

// ============================================================================
// HELPER: Calculate Refund for Unused Buckets
// ============================================================================

/**
 * Calculate refund amount for unused word buckets.
 * 
 * Logic:
 * - Each bucket = 100 tokens entry price (or dynamic price from PACK 242)
 * - Platform fee (35%) is NON-REFUNDABLE (already taken at deposit)
 * - Only refund the unused portion from the 65% escrow
 * 
 * Example:
 * - Paid 100 tokens, 35 platform fee, 65 escrow
 * - Used 2 full buckets + 3 words of 3rd bucket (11 words/token)
 * - 3rd bucket has 8 unused words
 * - Refund = (8/11) * bucket_value from escrow
 */
export function pack328b_calculateUnusedBucketRefund(
  escrowBalance: number,
  totalConsumed: number,
  wordsPerToken: number,
  depositAmount: number
): Pack328bRefundResult {
  
  // Calculate how many buckets were implied by the deposit
  // Each bucket costs depositAmount tokens (100 by default)
  const bucketsImplied = 1; // Currently chats are single-deposit model
  
  // Calculate full buckets consumed
  const wordsPerBucket = wordsPerToken; // Each token = 1 bucket of words
  const bucketsFullyConsumed = Math.floor(totalConsumed / wordsPerToken);
  
  // Calculate partial bucket usage
  const currentBucketWordsUsed = totalConsumed % wordsPerToken;
  const unusedWordsInCurrentBucket = currentBucketWordsUsed > 0 
    ? wordsPerToken - currentBucketWordsUsed 
    : 0;
  
  // Total unused buckets (what's left in escrow)
  const tokensToRefund = escrowBalance;
  
  // Platform fee was already retained at deposit (35%)
  const platformFeeRetained = Math.round(depositAmount * 0.35);
  
  return {
    totalBucketsPurchased: bucketsImplied,
    bucketsFullyConsumed,
    currentBucketWordsUsed,
    wordsPerBucket,
    unusedBuckets: 0, // Not applicable in current model
    unusedWordsInCurrentBucket,
    totalUnusedWords: Math.round(escrowBalance * wordsPerToken),
    tokensToRefund,
    platformFeeRetained,
  };
}

// ============================================================================
// CORE: Close Chat Session and Refund Unused Buckets
// ============================================================================

/**
 * Close a chat session and refund any unused escrow.
 * 
 * This is the core helper used by:
 * - Auto-expiration job (timeout)
 * - Manual "End Chat" button
 * - System cleanup
 * 
 * Process:
 * 1. Calculate unused bucket words
 * 2. Refund unused escrow to payer
 * 3. Mark session as EXPIRED or ENDED
 * 4. Update status and timestamps
 * 
 * @param sessionId - Chat session ID
 * @param reason - Why the chat is closing
 * @param closedBy - Who initiated the close (userId or 'system')
 */
export async function pack328b_closeChatSessionAndRefundUnusedBuckets(
  sessionId: string,
  reason: 'INACTIVITY_FREE' | 'INACTIVITY_PAID' | 'MANUAL_END',
  closedBy: string = 'system'
): Promise<Pack328bRefundResult | null> {
  
  const chatRef = db.collection('chats').doc(sessionId);
  const chatSnap = await chatRef.get();
  
  if (!chatSnap.exists) {
    throw new HttpsError('not-found', `Chat session ${sessionId} not found`);
  }
  
  const chat = chatSnap.data() as any;
  
  // Don't process if already closed
  if (chat.state === 'CLOSED' || chat.status === 'EXPIRED' || chat.status === 'ENDED') {
    logger.info(`Chat ${sessionId} already closed/expired`);
    return null;
  }
  
  const remainingEscrow = chat.billing?.escrowBalance || 0;
  const totalConsumed = chat.billing?.totalConsumed || 0;
  const wordsPerToken = chat.billing?.wordsPerToken || 11;
  const depositAmount = chat.deposit?.amount || 100;
  
  // Calculate refund
  const refundCalc = pack328b_calculateUnusedBucketRefund(
    remainingEscrow,
    totalConsumed,
    wordsPerToken,
    depositAmount
  );
  
  logger.info(`Closing chat ${sessionId}: Refunding ${refundCalc.tokensToRefund} tokens to payer ${chat.roles.payerId}`);
  
  // Execute refund transaction
  await db.runTransaction(async (transaction) => {
    // Refund remaining escrow to payer
    if (refundCalc.tokensToRefund > 0 && chat.roles.payerId) {
      const payerWalletRef = db.collection('users')
        .doc(chat.roles.payerId)
        .collection('wallet')
        .doc('current');
      
      transaction.update(payerWalletRef, {
        balance: increment(refundCalc.tokensToRefund),
        pending: increment(-refundCalc.tokensToRefund),
      });
      
      // Record refund transaction
      const txRef = db.collection('transactions').doc(generateId());
      transaction.set(txRef, {
        userId: chat.roles.payerId,
        type: 'refund',
        amount: refundCalc.tokensToRefund,
        metadata: {
          chatId: sessionId,
          reason: 'chat_expired_unused_buckets',
          expiredReason: reason,
          unusedWords: refundCalc.totalUnusedWords,
        },
        createdAt: serverTimestamp(),
      });
    }
    
    // Update chat session
    const newStatus: Pack328bChatStatus = reason === 'MANUAL_END' ? 'ENDED' : 'EXPIRED';
    
    transaction.update(chatRef, {
      state: 'CLOSED',
      status: newStatus,
      'billing.escrowBalance': 0,
      closedAt: serverTimestamp(),
      closedBy,
      expiredAt: serverTimestamp(),
      expiredReason: reason,
      updatedAt: serverTimestamp(),
    });
  });
  
  logger.info(`Chat ${sessionId} closed successfully. Status: ${reason === 'MANUAL_END' ? 'ENDED' : 'EXPIRED'}`);
  
  return refundCalc;
}

// ============================================================================
// CRON JOB: Auto-Expire Inactive Chats
// ============================================================================

/**
 * Scan for inactive chat sessions and auto-expire them.
 * 
 * Rules:
 * - Free chat (before paid buckets): Expire after 48 hours of no messages
 * - Paid chat (after deposit): Expire after 72 hours of no messages
 * 
 * Should be run every 30 minutes via Cloud Scheduler.
 * 
 * @returns Job execution summary
 */
export async function pack328b_chatSessionAutoExpireJob(): Promise<Pack328bExpirationJobResult> {
  
  const now = Date.now();
  const freeTimeoutMs = PACK_328B_TIMEOUTS.FREE_CHAT_TIMEOUT_HOURS * 60 * 60 * 1000;
  const paidTimeoutMs = PACK_328B_TIMEOUTS.PAID_CHAT_TIMEOUT_HOURS * 60 * 60 * 1000;
  
  const freeCutoff = new Date(now - freeTimeoutMs);
  const paidCutoff = new Date(now - paidTimeoutMs);
  
  let scannedChats = 0;
  let expiredChats = 0;
  let errors = 0;
  const expiredChatIds: string[] = [];
  
  try {
    // Find free chats that are inactive > 48h
    const inactiveFreeChatsSnap = await db.collection('chats')
      .where('state', '==', 'FREE_ACTIVE')
      .where('lastActivityAt', '<', freeCutoff)
      .limit(50)
      .get();
    
    scannedChats += inactiveFreeChatsSnap.docs.length;
    
    for (const chatDoc of inactiveFreeChatsSnap.docs) {
      try {
        await pack328b_closeChatSessionAndRefundUnusedBuckets(
          chatDoc.id,
          'INACTIVITY_FREE',
          'system_auto_expire'
        );
        expiredChats++;
        expiredChatIds.push(chatDoc.id);
      } catch (error) {
        logger.error(`Failed to expire free chat ${chatDoc.id}:`, error);
        errors++;
      }
    }
    
    // Find paid chats that are inactive > 72h
    const inactivePaidChatsSnap = await db.collection('chats')
      .where('state', '==', 'PAID_ACTIVE')
      .where('lastActivityAt', '<', paidCutoff)
      .limit(50)
      .get();
    
    scannedChats += inactivePaidChatsSnap.docs.length;
    
    for (const chatDoc of inactivePaidChatsSnap.docs) {
      try {
        await pack328b_closeChatSessionAndRefundUnusedBuckets(
          chatDoc.id,
          'INACTIVITY_PAID',
          'system_auto_expire'
        );
        expiredChats++;
        expiredChatIds.push(chatDoc.id);
      } catch (error) {
        logger.error(`Failed to expire paid chat ${chatDoc.id}:`, error);
        errors++;
      }
    }
    
    // Also check AWAITING_DEPOSIT state (treat as free for timeout purposes)
    const inactiveAwaitingDepositSnap = await db.collection('chats')
      .where('state', '==', 'AWAITING_DEPOSIT')
      .where('lastActivityAt', '<', freeCutoff)
      .limit(50)
      .get();
    
    scannedChats += inactiveAwaitingDepositSnap.docs.length;
    
    for (const chatDoc of inactiveAwaitingDepositSnap.docs) {
      try {
        await pack328b_closeChatSessionAndRefundUnusedBuckets(
          chatDoc.id,
          'INACTIVITY_FREE',
          'system_auto_expire'
        );
        expiredChats++;
        expiredChatIds.push(chatDoc.id);
      } catch (error) {
        logger.error(`Failed to expire awaiting-deposit chat ${chatDoc.id}:`, error);
        errors++;
      }
    }
    
  } catch (error) {
    logger.error('Auto-expire job encountered error:', error);
    errors++;
  }
  
  logger.info(`Auto-expire job completed: Scanned ${scannedChats}, Expired ${expiredChats}, Errors ${errors}`);
  
  return {
    scannedChats,
    expiredChats,
    errors,
    expiredChatIds,
  };
}

// ============================================================================
// API: Manual End Chat
// ============================================================================

/**
 * Allow user to manually end a chat session.
 * 
 * This triggers the same refund logic as auto-expiration.
 * 
 * @param sessionId - Chat session ID
 * @param userId - User requesting to end the chat
 */
export async function pack328b_endChatSession(
  sessionId: string,
  userId: string
): Promise<{ success: boolean; refunded: number }> {
  
  const chatRef = db.collection('chats').doc(sessionId);
  const chatSnap = await chatRef.get();
  
  if (!chatSnap.exists) {
    throw new HttpsError('not-found', `Chat session ${sessionId} not found`);
  }
  
  const chat = chatSnap.data() as any;
  
  // Validate user is a participant
  if (!chat.participants || !chat.participants.includes(userId)) {
    throw new HttpsError('permission-denied', 'You are not a participant in this chat');
  }
  
  // Don't allow ending if already closed
  if (chat.state === 'CLOSED' || chat.status === 'EXPIRED' || chat.status === 'ENDED') {
    throw new HttpsError('failed-precondition', 'Chat is already closed');
  }
  
  // Must be in paid portion to manually end (free chats just exit)
  if (chat.state !== 'PAID_ACTIVE') {
    throw new HttpsError('failed-precondition', 'Can only manually end paid chats');
  }
  
  const refundResult = await pack328b_closeChatSessionAndRefundUnusedBuckets(
    sessionId,
    'MANUAL_END',
    userId
  );
  
  return {
    success: true,
    refunded: refundResult?.tokensToRefund || 0,
  };
}

// ============================================================================
// CALL MONITORING: Zero Duration & Short Call Fraud Detection
// ============================================================================

/**
 * Check if a call ended with zero duration (no charge).
 * 
 * @param callId - Call session ID
 * @returns true if call should be charged, false if zero-duration
 */
export async function pack328b_shouldChargeForCall(
  callId: string
): Promise<boolean> {
  
  const callRef = db.collection('calls').doc(callId);
  const callSnap = await callRef.get();
  
  if (!callSnap.exists) {
    return false;
  }
  
  const call = callSnap.data() as Pack328bCallSession;
  
  // If call has no duration or zero seconds, don't charge
  if (!call.durationSeconds || call.durationSeconds <= PACK_328B_TIMEOUTS.CALL_ZERO_DURATION_SECONDS) {
    logger.info(`Call ${callId} has zero duration, not charging`);
    return false;
  }
  
  return true;
}

/**
 * Detect fraud pattern: very short calls repeated many times.
 * 
 * If a user makes many calls < 30 seconds, flag as TOKEN_DRAIN_PATTERN.
 * 
 * @param userId - User to check
 * @param timeWindowHours - How far back to look (default 24h)
 */
export async function pack328b_detectShortCallFraud(
  userId: string,
  timeWindowHours: number = 24
): Promise<Pack328bCallFraudSignal | null> {
  
  const cutoffTime = new Date(Date.now() - (timeWindowHours * 60 * 60 * 1000));
  
  // Find recent short calls by this user
  const recentCallsSnap = await db.collection('calls')
    .where('payerId', '==', userId)
    .where('state', '==', 'ENDED')
    .where('endedAt', '>', cutoffTime)
    .get();
  
  const shortCalls = recentCallsSnap.docs.filter(doc => {
    const call = doc.data() as Pack328bCallSession;
    return call.durationSeconds && call.durationSeconds < PACK_328B_TIMEOUTS.CALL_SHORT_DURATION_SECONDS;
  });
  
  if (shortCalls.length >= PACK_328B_TIMEOUTS.CALL_SHORT_REPEAT_THRESHOLD) {
    const totalDuration = shortCalls.reduce((sum, doc) => {
      const call = doc.data() as Pack328bCallSession;
      return sum + (call.durationSeconds || 0);
    }, 0);
    
    const avgDuration = totalDuration / shortCalls.length;
    
    const signal: Pack328bCallFraudSignal = {
      userId,
      shortCallCount: shortCalls.length,
      timeWindow: `${timeWindowHours}h`,
      averageDuration: avgDuration,
      flaggedAt: new Date().toISOString(),
    };
    
    logger.warn(`Fraud pattern detected for user ${userId}: ${shortCalls.length} short calls in ${timeWindowHours}h`);
    
    // TODO: Report to fraud system (PACK 324B integration)
    // Uncomment when pack324b-fraud-detection module is available
    /*
    try {
      const { reportToFraudSystem } = await import('./pack324b-fraud-detection.js');
      await reportToFraudSystem({
        userId,
        signalType: 'TOKEN_DRAIN_PATTERN',
        severity: 'HIGH',
        metadata: signal,
      });
    } catch (error) {
      logger.error('Failed to report to fraud system:', error);
    }
    */
    
    return signal;
  }
  
  return null;
}

// ============================================================================
// UTILITY: Get Chat Timeout Info
// ============================================================================

/**
 * Get timeout information for a chat session (for UX display).
 * 
 * @param sessionId - Chat session ID
 * @returns Timeout info or null if not found
 */
export async function pack328b_getChatTimeoutInfo(
  sessionId: string
): Promise<{
  lastMessageAt: string;
  timeoutHours: number;
  expiresAt: string;
  hoursRemaining: number;
  isPaid: boolean;
} | null> {
  
  const chatSnap = await db.collection('chats').doc(sessionId).get();
  
  if (!chatSnap.exists) {
    return null;
  }
  
  const chat = chatSnap.data() as any;
  const lastActivityAt = chat.lastActivityAt?.toDate?.() || new Date(chat.createdAt?.toMillis?.() || Date.now());
  const isPaid = chat.state === 'PAID_ACTIVE';
  
  const timeoutHours = isPaid 
    ? PACK_328B_TIMEOUTS.PAID_CHAT_TIMEOUT_HOURS 
    : PACK_328B_TIMEOUTS.FREE_CHAT_TIMEOUT_HOURS;
  
  const expiresAt = new Date(lastActivityAt.getTime() + (timeoutHours * 60 * 60 * 1000));
  const hoursRemaining = Math.max(0, (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60));
  
  return {
    lastMessageAt: lastActivityAt.toISOString(),
    timeoutHours,
    expiresAt: expiresAt.toISOString(),
    hoursRemaining: Math.round(hoursRemaining * 10) / 10, // 1 decimal
    isPaid,
  };
}