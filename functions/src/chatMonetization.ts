/**
 * Chat Monetization Logic for Avalo
 *
 * This module implements the complete chat monetization specification.
 * DO NOT modify this logic without updating the full specification.
 *
 * Specification Priority Order:
 * 1. Influencer override
 * 2. Heterosexual rule (man always pays)
 * 3. earnOnChat ON rules
 * 4. Free-pool eligibility
 * 5. MM/FF/Other rules
 */

;
;
import { db, serverTimestamp, increment, generateId } from './init.js';
import type { UserProfile } from './types.js';
// Trust Engine Integration (Phase 8)
import { recordRiskEvent, evaluateUserRisk, canUseFreePool as trustEngineCanUseFreePool } from './trustEngine.js';
// Account Lifecycle Integration (Phase 9)
import { isAccountActive } from './accountLifecycle.js';
// PACK 242: Dynamic Chat Pricing (replaces PACK 219)
import { getPack242ChatEntryPrice, calculatePack242RevenueSplit } from './pack242DynamicChatPricing.js';
// PACK 220: Fan & Kiss Economy
import { trackTokenSpend } from './fanKissEconomy.js';
// PACK 221: Romantic Journeys
import { onChatMessageSent } from './romanticJourneysIntegration.js';

// Simple error class for compatibility
class HttpsError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'HttpsError';
  }
}

// Simple logger
const logger = {
  error: (..._args: any[]) => {},
};

// ============================================================================
// TYPES
// ============================================================================

export type ChatMode = 'FREE_A' | 'FREE_B' | 'PAID';

export type ChatState = 
  | 'FREE_ACTIVE'           // Free chat (no escrow, no billing)
  | 'AWAITING_DEPOSIT'      // Waiting for initial deposit
  | 'PAID_ACTIVE'           // Active paid chat with escrow
  | 'CLOSED';               // Chat closed and settled

export type PopularityLevel = 'low' | 'mid' | 'high';

export interface ChatMonetizationRoles {
  payerId: string;
  earnerId: string | null;  // null means Avalo is the earner
  wordsPerToken: number;    // 7 for Royal, 11 for standard
  mode: ChatMode;
  needsEscrow: boolean;
  freeMessageLimit: number; // 0, 50, or unlimited
}

export interface ChatParticipantContext {
  userId: string;
  gender: 'male' | 'female' | 'other';
  earnOnChat: boolean;
  influencerBadge: boolean;
  isRoyalMember: boolean;
  popularity: PopularityLevel;
  accountAgeDays: number;
}

export interface MessageBillingResult {
  tokensCost: number;
  shouldBill: boolean;
  earnerReceives: number;
  avaloReceives: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const WORDS_PER_TOKEN_ROYAL = 7;
const WORDS_PER_TOKEN_STANDARD = 11;
const FREE_MESSAGES_PER_PARTICIPANT = 3;
const FREE_B_MESSAGE_LIMIT = 50;
const NEW_USER_THRESHOLD_DAYS = 5;
const CHAT_DEPOSIT_TOKENS = 100;
const PLATFORM_FEE_PERCENT = 35; // 35% to Avalo, 65% to escrow
const INACTIVITY_TIMEOUT_HOURS = 48;

// ============================================================================
// CORE FUNCTION: determineChatRoles
// ============================================================================

/**
 * Determines who pays, who earns, and what billing mode applies.
 * This is the central logic function that must be called before any chat starts.
 * 
 * @param userA - First participant
 * @param userB - Second participant
 * @param context - Additional context (who initiated, etc.)
 * @returns Complete monetization configuration
 */
export async function determineChatRoles(
  userA: ChatParticipantContext,
  userB: ChatParticipantContext,
  context: { initiatorId: string }
): Promise<ChatMonetizationRoles> {
  
  // Determine who is initiator and who is receiver
  const initiator = userA.userId === context.initiatorId ? userA : userB;
  const receiver = userA.userId === context.initiatorId ? userB : userA;

  // ====================================================================
  // PRIORITY 1: INFLUENCER OVERRIDE
  // ====================================================================
  // If exactly ONE participant has influencerBadge = ON AND earnOnChat = ON,
  // that person becomes earner, the other becomes payer (gender irrelevant)
  
  const aIsInfluencerEarner = userA.influencerBadge && userA.earnOnChat;
  const bIsInfluencerEarner = userB.influencerBadge && userB.earnOnChat;
  
  if (aIsInfluencerEarner && !bIsInfluencerEarner) {
    return {
      payerId: userB.userId,
      earnerId: userA.userId,
      wordsPerToken: userA.isRoyalMember ? WORDS_PER_TOKEN_ROYAL : WORDS_PER_TOKEN_STANDARD,
      mode: 'PAID',
      needsEscrow: true,
      freeMessageLimit: 0
    };
  }
  
  if (bIsInfluencerEarner && !aIsInfluencerEarner) {
    return {
      payerId: userA.userId,
      earnerId: userB.userId,
      wordsPerToken: userB.isRoyalMember ? WORDS_PER_TOKEN_ROYAL : WORDS_PER_TOKEN_STANDARD,
      mode: 'PAID',
      needsEscrow: true,
      freeMessageLimit: 0
    };
  }

  // ====================================================================
  // PRIORITY 2: HETEROSEXUAL RULE
  // ====================================================================
  // Man ALWAYS pays in heterosexual interactions
  
  const isHeterosexual = 
    (userA.gender === 'male' && userB.gender === 'female') ||
    (userA.gender === 'female' && userB.gender === 'male');
  
  if (isHeterosexual) {
    const man = userA.gender === 'male' ? userA : userB;
    const woman = userA.gender === 'male' ? userB : userA;
    
    // Woman has earnOnChat ON → she earns
    if (woman.earnOnChat) {
      return {
        payerId: man.userId,
        earnerId: woman.userId,
        wordsPerToken: woman.isRoyalMember ? WORDS_PER_TOKEN_ROYAL : WORDS_PER_TOKEN_STANDARD,
        mode: 'PAID',
        needsEscrow: true,
        freeMessageLimit: 0
      };
    }
    
    // Woman has earnOnChat OFF → check free-pool eligibility
    const freePoolResult = await checkFreePoolEligibility(woman);
    
    if (freePoolResult.mode === 'FREE_A') {
      return {
        payerId: man.userId,
        earnerId: null, // Avalo earns (but it's free so no billing)
        wordsPerToken: WORDS_PER_TOKEN_STANDARD,
        mode: 'FREE_A',
        needsEscrow: false,
        freeMessageLimit: Infinity
      };
    }
    
    if (freePoolResult.mode === 'FREE_B') {
      return {
        payerId: man.userId,
        earnerId: null, // Avalo earns
        wordsPerToken: WORDS_PER_TOKEN_STANDARD,
        mode: 'FREE_B',
        needsEscrow: false,
        freeMessageLimit: FREE_B_MESSAGE_LIMIT
      };
    }
    
    // Default: woman earnOff + not free-pool eligible → PAID with Avalo as earner
    return {
      payerId: man.userId,
      earnerId: null, // Avalo earns
      wordsPerToken: WORDS_PER_TOKEN_STANDARD,
      mode: 'PAID',
      needsEscrow: true,
      freeMessageLimit: 0
    };
  }

  // ====================================================================
  // PRIORITY 3-5: MM / FF / OTHER COMBINATIONS
  // ====================================================================
  
  // Only ONE has earnOnChat ON → that person earns, other pays
  if (userA.earnOnChat && !userB.earnOnChat) {
    return {
      payerId: userB.userId,
      earnerId: userA.userId,
      wordsPerToken: userA.isRoyalMember ? WORDS_PER_TOKEN_ROYAL : WORDS_PER_TOKEN_STANDARD,
      mode: 'PAID',
      needsEscrow: true,
      freeMessageLimit: 0
    };
  }
  
  if (userB.earnOnChat && !userA.earnOnChat) {
    return {
      payerId: userA.userId,
      earnerId: userB.userId,
      wordsPerToken: userB.isRoyalMember ? WORDS_PER_TOKEN_ROYAL : WORDS_PER_TOKEN_STANDARD,
      mode: 'PAID',
      needsEscrow: true,
      freeMessageLimit: 0
    };
  }
  
  // BOTH have earnOnChat ON → receiver of first message earns, initiator pays
  if (userA.earnOnChat && userB.earnOnChat) {
    return {
      payerId: initiator.userId,
      earnerId: receiver.userId,
      wordsPerToken: receiver.isRoyalMember ? WORDS_PER_TOKEN_ROYAL : WORDS_PER_TOKEN_STANDARD,
      mode: 'PAID',
      needsEscrow: true,
      freeMessageLimit: 0
    };
  }
  
  // BOTH have earnOnChat OFF → initiator pays, Avalo earns
  // Check if receiver is free-pool eligible
  const freePoolResult = await checkFreePoolEligibility(receiver);
  
  if (freePoolResult.mode === 'FREE_A') {
    return {
      payerId: initiator.userId,
      earnerId: null,
      wordsPerToken: WORDS_PER_TOKEN_STANDARD,
      mode: 'FREE_A',
      needsEscrow: false,
      freeMessageLimit: Infinity
    };
  }
  
  if (freePoolResult.mode === 'FREE_B') {
    return {
      payerId: initiator.userId,
      earnerId: null,
      wordsPerToken: WORDS_PER_TOKEN_STANDARD,
      mode: 'FREE_B',
      needsEscrow: false,
      freeMessageLimit: FREE_B_MESSAGE_LIMIT
    };
  }
  
  return {
    payerId: initiator.userId,
    earnerId: null, // Avalo earns
    wordsPerToken: WORDS_PER_TOKEN_STANDARD,
    mode: 'PAID',
    needsEscrow: true,
    freeMessageLimit: 0
  };
}

// ============================================================================
// FREE-POOL LOGIC
// ============================================================================

/**
 * Determines if a user qualifies for free-pool chat when earnOnChat = OFF
 *
 * Rules:
 * - FREE A: low popularity + earnOff + account > 5 days
 * - FREE B: mid popularity + earnOff + account > 5 days
 * - New users (0-5 days) are NEVER free
 *
 * Phase 8: Now checks trust engine for free-pool eligibility
 */
async function checkFreePoolEligibility(
  user: ChatParticipantContext
): Promise<{ mode: ChatMode }> {
  
  // Must have earnOnChat OFF
  if (user.earnOnChat) {
    return { mode: 'PAID' };
  }
  
  // New users (0-5 days) are NEVER free
  if (user.accountAgeDays <= NEW_USER_THRESHOLD_DAYS) {
    return { mode: 'PAID' };
  }
  
  // Phase 8: Check trust engine - high/critical risk users cannot use free pool
  const canUseFreePool = await trustEngineCanUseFreePool(user.userId).catch(() => true);
  if (!canUseFreePool) {
    return { mode: 'PAID' };
  }
  
  // FREE A: low popularity
  if (user.popularity === 'low') {
    return { mode: 'FREE_A' };
  }
  
  // FREE B: mid popularity
  if (user.popularity === 'mid') {
    return { mode: 'FREE_B' };
  }
  
  // High popularity or other → PAID
  return { mode: 'PAID' };
}

// ============================================================================
// BILLING LOGIC
// ============================================================================

/**
 * Calculates token cost for a message.
 * CRITICAL: Only bill words from the EARNER, never from the payer.
 * 
 * @param messageText - The message content
 * @param senderId - Who sent the message
 * @param roles - The chat monetization roles
 * @returns Billing breakdown
 */
export function calculateMessageBilling(
  messageText: string,
  senderId: string,
  roles: ChatMonetizationRoles
): MessageBillingResult {
  
  // If sender is NOT the earner, billing is zero
  if (senderId !== roles.earnerId && roles.earnerId !== null) {
    return {
      tokensCost: 0,
      shouldBill: false,
      earnerReceives: 0,
      avaloReceives: 0
    };
  }
  
  // Count words
  const wordCount = countBillableWords(messageText);
  
  // Calculate tokens
  const tokensCost = Math.round(wordCount / roles.wordsPerToken);
  
  if (tokensCost === 0) {
    return {
      tokensCost: 0,
      shouldBill: false,
      earnerReceives: 0,
      avaloReceives: 0
    };
  }
  
  // If earner is null, Avalo gets everything (but only in PAID mode)
  if (roles.earnerId === null) {
    return {
      tokensCost,
      shouldBill: roles.mode === 'PAID',
      earnerReceives: 0,
      avaloReceives: roles.mode === 'PAID' ? tokensCost : 0
    };
  }
  
  // Normal split: earner gets tokens directly from escrow
  return {
    tokensCost,
    shouldBill: true,
    earnerReceives: tokensCost,
    avaloReceives: 0 // Platform fee already taken at deposit
  };
}

/**
 * Count words in text, excluding URLs and emojis
 */
function countBillableWords(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  
  // Remove URLs
  let cleaned = text.replace(/https?:\/\/[^\s]+/gi, '');
  
  // Remove emojis (basic ranges)
  cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
  
  // Split and count
  const words = cleaned.trim().split(/\s+/).filter(w => w.length > 0);
  return words.length;
}

// ============================================================================
// CHAT LIFECYCLE
// ============================================================================

/**
 * Initialize a new chat with free messages
 * Phase 9: Checks account status before allowing chat
 */
export async function initializeChat(
  chatId: string,
  roles: ChatMonetizationRoles,
  participantIds: string[]
): Promise<void> {
  
  // Phase 9: Check both participants have active accounts
  for (const participantId of participantIds) {
    const isActive = await isAccountActive(participantId);
    if (!isActive) {
      throw new HttpsError(
        'failed-precondition',
        'Cannot start chat: one or more participants have inactive accounts'
      );
    }
  }
  
  const now = serverTimestamp();
  
  await db.collection('chats').doc(chatId).set({
    chatId,
    participants: participantIds,
    roles: {
      payerId: roles.payerId,
      earnerId: roles.earnerId
    },
    mode: roles.mode,
    state: 'FREE_ACTIVE', // Start with free messages
    billing: {
      wordsPerToken: roles.wordsPerToken,
      freeMessagesRemaining: {
        [participantIds[0]]: FREE_MESSAGES_PER_PARTICIPANT,
        [participantIds[1]]: FREE_MESSAGES_PER_PARTICIPANT
      },
      escrowBalance: 0,
      totalConsumed: 0,
      messageCount: 0
    },
    freeMessageLimit: roles.freeMessageLimit,
    needsEscrow: roles.needsEscrow,
    createdAt: now,
    lastActivityAt: now,
    updatedAt: now
  });
}

/**
 * Process message send and update billing
 * Returns true if message should be allowed
 */
export async function processMessageBilling(
  chatId: string,
  senderId: string,
  messageText: string
): Promise<{ allowed: boolean; reason?: string; tokensCost: number }> {
  
  // Phase 30A: TrustShield 2.0 - Content Moderation
  try {
    const { moderateText, logModerationIncident } = await import('./contentModerationEngine');
    const moderationResult = await moderateText({
      userId: senderId,
      text: messageText,
      source: 'chat_message',
    });
    
    // If content should be blocked, reject immediately
    if (moderationResult.actions.includes('BLOCK_CONTENT')) {
      // Log the incident
      await logModerationIncident({
        userId: senderId,
        text: messageText,
        source: 'chat_message',
      }, moderationResult);
      
      return {
        allowed: false,
        reason: 'CONTENT_BLOCKED_POLICY_VIOLATION',
        tokensCost: 0,
      };
    }
    
    // If should log (but allow), log the incident
    if (moderationResult.actions.includes('ALLOW_AND_LOG') ||
        moderationResult.actions.includes('FLAG_FOR_REVIEW')) {
      // Log asynchronously, don't block message
      logModerationIncident({
        userId: senderId,
        text: messageText,
        source: 'chat_message',
      }, moderationResult).catch(err => logger.error('Failed to log moderation incident:', err));
    }
  } catch (error) {
    // Non-blocking - if moderation check fails, allow message
    logger.error('Content moderation check failed:', error);
  }
  
  // Phase 22: CSAM Shield - Check message for CSAM risk
  try {
    const { evaluateTextForCsamRisk, createCsamIncident, applyImmediateProtectiveActions } = await import('./csamShield.js');
    const csamCheck = evaluateTextForCsamRisk(messageText, 'en');
    
    if (csamCheck.isFlagged && (csamCheck.riskLevel === 'HIGH' || csamCheck.riskLevel === 'CRITICAL')) {
      // Create incident
      const incidentId = await createCsamIncident({
        userId: senderId,
        source: 'chat',
        detectionChannel: 'auto_text',
        riskLevel: csamCheck.riskLevel,
        contentSnippet: messageText.substring(0, 100),
        messageIds: [],
      });
      
      // Apply protective actions
      await applyImmediateProtectiveActions(senderId, csamCheck.riskLevel, incidentId);
      
      // Reject message
      return {
        allowed: false,
        reason: 'Message rejected for safety reasons. Your account is under review.',
        tokensCost: 0,
      };
    }
  } catch (error) {
    // Non-blocking - if CSAM check fails, allow message but log error
    logger.error('CSAM check failed:', error);
  }
  
  const chatRef = db.collection('chats').doc(chatId);
  const chatSnap = await chatRef.get();
  
  if (!chatSnap.exists) {
    throw new HttpsError('not-found', 'Chat not found');
  }
  
  const chat = chatSnap.data() as any;
  const roles: ChatMonetizationRoles = {
    payerId: chat.roles.payerId,
    earnerId: chat.roles.earnerId,
    wordsPerToken: chat.billing.wordsPerToken,
    mode: chat.mode,
    needsEscrow: chat.needsEscrow,
    freeMessageLimit: chat.freeMessageLimit
  };
  
  // Check free messages
  const senderFreeRemaining = chat.billing.freeMessagesRemaining[senderId] || 0;
  const earnerFreeRemaining = chat.billing.freeMessagesRemaining[roles.earnerId!] || 0;
  
  // First 3 messages from each participant are free
  if (senderFreeRemaining > 0 || (senderId === roles.earnerId && earnerFreeRemaining > 0)) {
    // Deduct free message
    await chatRef.update({
      [`billing.freeMessagesRemaining.${senderId}`]: increment(-1),
      'billing.messageCount': increment(1),
      lastActivityAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    return { allowed: true, tokensCost: 0 };
  }
  
  // Check if transition to paid is needed
  const totalFreeUsed = Object.values(chat.billing.freeMessagesRemaining as Record<string, number>)
    .reduce((sum, v) => sum + (FREE_MESSAGES_PER_PARTICIPANT - v), 0);
  
  if (totalFreeUsed >= FREE_MESSAGES_PER_PARTICIPANT * 2 && chat.state === 'FREE_ACTIVE') {
    // Time to transition
    if (chat.mode === 'FREE_A') {
      // Stay free forever
      await chatRef.update({
        state: 'FREE_ACTIVE',
        'billing.messageCount': increment(1),
        lastActivityAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return { allowed: true, tokensCost: 0 };
    }
    
    if (chat.mode === 'FREE_B') {
      // Check 50 message limit
      if (chat.billing.messageCount >= FREE_B_MESSAGE_LIMIT) {
        await chatRef.update({ state: 'AWAITING_DEPOSIT' });
        return { allowed: false, reason: 'Free message limit reached. Deposit required.', tokensCost: 0 };
      }
      
      await chatRef.update({
        'billing.messageCount': increment(1),
        lastActivityAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return { allowed: true, tokensCost: 0 };
    }
    
    if (chat.mode === 'PAID' && chat.needsEscrow) {
      await chatRef.update({ state: 'AWAITING_DEPOSIT' });
      return { allowed: false, reason: 'Deposit required to continue chat', tokensCost: 0 };
    }
  }
  
  // Calculate billing for paid chats
  const billing = calculateMessageBilling(messageText, senderId, roles);
  
  if (!billing.shouldBill) {
    // Payer or free mode sending
    await chatRef.update({
      'billing.messageCount': increment(1),
      lastActivityAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { allowed: true, tokensCost: 0 };
  }
  
  // Check escrow balance
  if (chat.billing.escrowBalance < billing.tokensCost) {
    return { allowed: false, reason: 'Insufficient escrow balance', tokensCost: billing.tokensCost };
  }
  
  // Deduct from escrow and credit earner
  await db.runTransaction(async (transaction) => {
    // Update chat
    transaction.update(chatRef, {
      'billing.escrowBalance': increment(-billing.tokensCost),
      'billing.totalConsumed': increment(billing.tokensCost),
      'billing.messageCount': increment(1),
      lastActivityAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    // Credit earner if exists
    if (roles.earnerId) {
      const walletRef = db.collection('users').doc(roles.earnerId).collection('wallet').doc('current');
      transaction.update(walletRef, {
        balance: increment(billing.earnerReceives),
        earned: increment(billing.earnerReceives)
      });
      
      // Deduct from payer pending
      const payerWalletRef = db.collection('users').doc(roles.payerId).collection('wallet').doc('current');
      transaction.update(payerWalletRef, {
        pending: increment(-billing.tokensCost)
      });
    }
  });
  
  // PACK 220: Track fan milestone progression (async, non-blocking)
  if (roles.earnerId && billing.tokensCost > 0) {
    trackTokenSpend(roles.payerId, roles.earnerId, billing.tokensCost, 'chat')
      .catch(err => logger.error('Failed to track fan spend:', err));
  }
  
  // PACK 221: Track romantic journey activity (async, non-blocking)
  if (roles.earnerId && billing.tokensCost > 0) {
    onChatMessageSent(senderId, roles.earnerId === senderId ? roles.payerId : roles.earnerId, billing.tokensCost)
      .catch(err => logger.error('Failed to track journey activity:', err));
  }
  
  return { allowed: true, tokensCost: billing.tokensCost };
}

/**
 * Handle chat deposit for PAID mode
 * PACK 242: Now uses dynamic pricing based on earner's tier
 */
export async function processChatDeposit(
  chatId: string,
  payerId: string
): Promise<{ success: boolean; escrowAmount: number; platformFee: number; depositAmount: number }> {
  
  const chatRef = db.collection('chats').doc(chatId);
  const chatSnap = await chatRef.get();
  
  if (!chatSnap.exists) {
    throw new HttpsError('not-found', 'Chat not found');
  }
  
  const chat = chatSnap.data() as any;
  
  if (chat.roles.payerId !== payerId) {
    throw new HttpsError('permission-denied', 'Only payer can make deposit');
  }
  
  // PACK 242: Get dynamic entry price based on earner's performance tier
  const depositAmount = await getPack242ChatEntryPrice(chat.roles.earnerId);
  const { earnerAmount, platformAmount } = calculatePack242RevenueSplit(depositAmount);
  const escrowAmount = earnerAmount;
  const platformFee = platformAmount;
  
  // Check wallet balance
  const walletRef = db.collection('users').doc(payerId).collection('wallet').doc('current');
  const walletSnap = await walletRef.get();
  const wallet = walletSnap.data();
  
  if (!wallet || wallet.balance < depositAmount) {
    throw new HttpsError('failed-precondition', `Insufficient tokens (need ${depositAmount})`);
  }
  
  await db.runTransaction(async (transaction) => {
    // Deduct from payer
    transaction.update(walletRef, {
      balance: increment(-depositAmount),
      pending: increment(escrowAmount)
    });
    
    // Update chat
    transaction.update(chatRef, {
      state: 'PAID_ACTIVE',
      'billing.escrowBalance': escrowAmount,
      'deposit': {
        amount: depositAmount,
        platformFee,
        escrowAmount,
        paidAt: serverTimestamp()
      },
      updatedAt: serverTimestamp()
    });
    
    // Record platform fee transaction
    const txRef = db.collection('transactions').doc(generateId());
    transaction.set(txRef, {
      userId: payerId,
      type: 'chat_fee',
      amount: -platformFee,
      metadata: { chatId, purpose: 'platform_fee', entryPrice: depositAmount },
      createdAt: serverTimestamp()
    });
  });
  
  return { success: true, escrowAmount, platformFee, depositAmount };
}

/**
 * Close chat and settle remaining escrow
 * Phase 8: Records risk event and evaluates user risk
 */
export async function closeAndSettleChat(
  chatId: string,
  closedBy: string,
  deviceId?: string,
  ipHash?: string
): Promise<{ refundedToPayerPending: number }> {
  
  const chatRef = db.collection('chats').doc(chatId);
  const chatSnap = await chatRef.get();
  
  if (!chatSnap.exists) {
    throw new HttpsError('not-found', 'Chat not found');
  }
  
  const chat = chatSnap.data() as any;
  const remainingEscrow = chat.billing.escrowBalance || 0;
  
  await db.runTransaction(async (transaction) => {
    // Refund remaining escrow to payer
    if (remainingEscrow > 0) {
      const payerWalletRef = db.collection('users').doc(chat.roles.payerId).collection('wallet').doc('current');
      transaction.update(payerWalletRef, {
        balance: increment(remainingEscrow),
        pending: increment(-remainingEscrow)
      });
      
      // Record refund transaction
      const txRef = db.collection('transactions').doc(generateId());
      transaction.set(txRef, {
        userId: chat.roles.payerId,
        type: 'refund',
        amount: remainingEscrow,
        metadata: { chatId, reason: 'chat_closed' },
        createdAt: serverTimestamp()
      });
    }
    
    // Close chat
    transaction.update(chatRef, {
      state: 'CLOSED',
      'billing.escrowBalance': 0,
      closedAt: serverTimestamp(),
      closedBy,
      updatedAt: serverTimestamp()
    });
  });
  
  // Phase 8: Record risk event for chat closure (async, non-blocking)
  try {
    await recordRiskEvent({
      userId: chat.roles.payerId,
      eventType: 'chat',
      metadata: {
        payerId: chat.roles.payerId,
        earnerId: chat.roles.earnerId,
        totalTokens: chat.billing.totalConsumed || 0,
        freePoolUsed: chat.mode === 'FREE_A' || chat.mode === 'FREE_B',
        deviceId,
        ipHash,
      },
    });
    
    // Evaluate risk for both participants (async)
    if (chat.roles.payerId) {
      evaluateUserRisk(chat.roles.payerId).catch(() => {});
    }
    if (chat.roles.earnerId) {
      evaluateUserRisk(chat.roles.earnerId).catch(() => {});
    }
  } catch (error) {
    // Non-blocking - don't fail chat closure if risk recording fails
  }
  
  return { refundedToPayerPending: remainingEscrow };
}

/**
 * Auto-close inactive chats (48h rule)
 * Should be called by scheduled function
 */
export async function autoCloseInactiveChats(): Promise<number> {
  const cutoffTime = Date.now() - (INACTIVITY_TIMEOUT_HOURS * 60 * 60 * 1000);
  
  const inactiveChats = await db.collection('chats')
    .where('state', 'in', ['FREE_ACTIVE', 'PAID_ACTIVE'])
    .where('lastActivityAt', '<', new Date(cutoffTime))
    .limit(100)
    .get();
  
  let closedCount = 0;
  
  for (const chatDoc of inactiveChats.docs) {
    try {
      await closeAndSettleChat(chatDoc.id, 'system_auto_close');
      closedCount++;
    } catch (error) {
      logger.error(`Failed to auto-close chat ${chatDoc.id}:`, error);
    }
  }
  
  return closedCount;
}

/**
 * Helper: Load user context from database
 * PACK 50: Now checks Royal Club membership from royal_memberships collection
 */
export async function getUserContext(userId: string): Promise<ChatParticipantContext> {
  const userSnap = await db.collection('users').doc(userId).get();
  
  if (!userSnap.exists) {
    throw new HttpsError('not-found', `User ${userId} not found`);
  }
  
  const user = userSnap.data() as any;
  
  // Calculate account age
  const createdAt = user.createdAt?.toDate?.() || new Date();
  const accountAgeDays = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  
  // Determine popularity (placeholder logic - should be based on actual metrics)
  let popularity: PopularityLevel = 'mid';
  if (user.stats?.followers < 100) {
    popularity = 'low';
  } else if (user.stats?.followers > 1000) {
    popularity = 'high';
  }
  
  // PACK 50: Check Royal Club membership
  let isRoyalMember = false;
  try {
    const royalMembershipSnap = await db.collection('royal_memberships').doc(userId).get();
    if (royalMembershipSnap.exists) {
      const royalData = royalMembershipSnap.data();
      isRoyalMember = royalData?.tier !== 'NONE';
    }
  } catch (error) {
    // Non-blocking - if Royal check fails, default to false
    console.error('Failed to check Royal membership:', error);
    isRoyalMember = false;
  }
  
  return {
    userId: user.uid,
    gender: user.gender === 'male' ? 'male' : user.gender === 'female' ? 'female' : 'other',
    earnOnChat: user.modes?.earnFromChat || false,
    influencerBadge: user.badges?.some((b: any) => b.type === 'influencer') || false,
    isRoyalMember,
    popularity,
    accountAgeDays
  };
}