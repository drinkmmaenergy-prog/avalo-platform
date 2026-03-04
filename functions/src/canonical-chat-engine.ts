/**
 * CANONICAL CHAT ENGINE — v2_canonical
 *
 * THE ONE AND ONLY chat monetization engine for Avalo.
 *
 * This module consolidates ALL previous chat billing paths into a single,
 * deterministic, testable engine. All API endpoints MUST call this engine.
 *
 * REPLACES:
 * - chats.ts billing (payer-sender billing)
 * - chatMonetization.ts processMessageBilling
 * - pack273ChatEngine (pack273_chats path)
 * - pack328b timeout divergence (48h/72h → canonical 48h)
 * - pack242 deposit modifiers (REMOVED — use earner config)
 * - pack452 mid-chat premium offers (REMOVED — next session only)
 *
 * @module canonical-chat-engine
 * @version 2.0.0
 */

import { db, serverTimestamp, increment, generateId } from './init.js';
import { Timestamp } from 'firebase-admin/firestore';
import type {
  CanonicalChatDocument,
  CanonicalChatState,
  CanonicalChatRoles,
  CanonicalFreeState,
  CanonicalPaidSession,
  CanonicalSessionConfig,
  CanonicalBillingState,
  ChatParticipantContext,
  EarnerChatConfig,
  BillingResult,
  DepositResult,
  RefundResult,
  BurnMultiplier,
} from './types/canonical-chat.types.js';
import {
  CANONICAL_LOGIC_VERSION,
  FREE_MESSAGES_STANDARD,
  FREE_MESSAGES_ROYAL_EARNER,
  WORDS_PER_TOKEN_STANDARD,
  WORDS_PER_TOKEN_ROYAL,
  PLATFORM_FEE_PCT,
  ESCROW_PCT,
  MIN_DEPOSIT_TOKENS,
  DEFAULT_DEPOSIT_TOKENS,
  EARNER_REVENUE_SPLIT,
  AVALO_REVENUE_SPLIT,
  INACTIVITY_EXPIRY_MS,
  BURN_MULTIPLIER_ENUM,
} from './types/canonical-chat.types.js';

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

class ChatEngineError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'ChatEngineError';
  }
}

const logger = {
  info: (...args: any[]) => { console.log('[CanonicalChatEngine]', ...args); },
  warn: (...args: any[]) => { console.warn('[CanonicalChatEngine]', ...args); },
  error: (...args: any[]) => { console.error('[CanonicalChatEngine]', ...args); },
};

// ============================================================================
// A) ROLE DETERMINATION
// ============================================================================

/**
 * Determine payer/earner roles for a new chat.
 *
 * Priority order:
 * 1. Influencer override: influencer earns regardless of gender when flagged + earn_on=ON
 * 2. Heterosexual rule: male always pays, female always earns
 * 3. earnOnChat ON: receiver earns
 * 4. Default: initiator pays, Avalo earns (earnerId = null)
 *
 * @param initiator - The user who initiated the chat
 * @param receiver - The user who received the chat request
 * @returns Canonical role assignment
 */
export function determineRoles(
  initiator: ChatParticipantContext,
  receiver: ChatParticipantContext
): CanonicalChatRoles {
  // Rule 1: Influencer override
  // If either user has influencer badge + earn_on=ON, they earn regardless of gender.
  if (receiver.influencerBadge && receiver.earnOnChat) {
    return {
      payerId: initiator.userId,
      earnerId: receiver.userId,
    };
  }
  if (initiator.influencerBadge && initiator.earnOnChat) {
    return {
      payerId: receiver.userId,
      earnerId: initiator.userId,
    };
  }

  // Rule 2: Heterosexual rule — male always pays
  const genderPair = [initiator.gender, receiver.gender].sort().join('_');
  const isHetero =
    (initiator.gender === 'male' && receiver.gender === 'female') ||
    (initiator.gender === 'female' && receiver.gender === 'male');

  if (isHetero) {
    const maleId = initiator.gender === 'male' ? initiator.userId : receiver.userId;
    const femaleId = initiator.gender === 'female' ? initiator.userId : receiver.userId;
    return {
      payerId: maleId,
      earnerId: femaleId,
    };
  }

  // Rule 3: Same gender / NB — initiator pays, receiver earns if earn mode ON
  if (receiver.earnOnChat) {
    return {
      payerId: initiator.userId,
      earnerId: receiver.userId,
    };
  }

  // Rule 4: Default — initiator pays, Avalo earns
  return {
    payerId: initiator.userId,
    earnerId: null,
  };
}

// ============================================================================
// B) CHAT CREATION + ACCEPTANCE FLOW
// ============================================================================

/**
 * Create a new chat after match.
 * State: MATCHED → AWAITING_EARNER_ACCEPT
 *
 * @param chatId - Pre-generated chat ID
 * @param initiator - Initiator context
 * @param receiver - Receiver context
 * @returns The created chat document (in-memory representation)
 */
export async function createChat(
  chatId: string,
  initiator: ChatParticipantContext,
  receiver: ChatParticipantContext
): Promise<CanonicalChatDocument> {
  const roles = determineRoles(initiator, receiver);

  const chatDoc: CanonicalChatDocument = {
    chatId,
    participants: [initiator.userId, receiver.userId],
    roles,
    logicVersion: CANONICAL_LOGIC_VERSION,
    state: 'AWAITING_EARNER_ACCEPT',
    free: {
      freeRemainingByUser: {},
    },
    paidSession: null,
    lastMessageAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await db.collection('chats').doc(chatId).set(chatDoc);

  logger.info(`Chat created: ${chatId}, payer=${roles.payerId}, earner=${roles.earnerId}`);
  return chatDoc;
}

/**
 * Earner accepts the chat.
 * Transition: AWAITING_EARNER_ACCEPT → FREE_ACTIVE
 *
 * Initializes free counters:
 * - Standard: 9 per user
 * - If earner has Royal: 5 per user
 *
 * @param chatId - The chat to accept
 * @param userId - The user accepting (must be the earner)
 * @param earnerIsRoyal - Whether the earner has Royal status
 */
export async function acceptChat(
  chatId: string,
  userId: string,
  earnerIsRoyal: boolean
): Promise<void> {
  const chatRef = db.collection('chats').doc(chatId);

  await db.runTransaction(async (transaction) => {
    const chatSnap = await transaction.get(chatRef);
    if (!chatSnap.exists) {
      throw new ChatEngineError('not-found', `Chat ${chatId} not found`);
    }

    const chat = chatSnap.data() as CanonicalChatDocument;

    if (chat.logicVersion !== CANONICAL_LOGIC_VERSION) {
      throw new ChatEngineError('failed-precondition', `Chat ${chatId} is not v2_canonical`);
    }

    if (chat.state !== 'AWAITING_EARNER_ACCEPT') {
      throw new ChatEngineError('failed-precondition', `Chat ${chatId} is not in AWAITING_EARNER_ACCEPT state (current: ${chat.state})`);
    }

    // Only earner can accept
    if (chat.roles.earnerId !== userId) {
      // If earnerId is null (Avalo earns), the receiver is treated as earner for acceptance
      const isReceiver = chat.participants[1] === userId;
      if (!isReceiver) {
        throw new ChatEngineError('permission-denied', `User ${userId} is not the earner/receiver of chat ${chatId}`);
      }
    }

    const freeLimit = earnerIsRoyal ? FREE_MESSAGES_ROYAL_EARNER : FREE_MESSAGES_STANDARD;

    const freeRemainingByUser: Record<string, number> = {};
    for (const participantId of chat.participants) {
      freeRemainingByUser[participantId] = freeLimit;
    }

    transaction.update(chatRef, {
      state: 'FREE_ACTIVE' as CanonicalChatState,
      'free.freeRemainingByUser': freeRemainingByUser,
      updatedAt: serverTimestamp(),
    });
  });

  logger.info(`Chat accepted: ${chatId} by ${userId} (royal=${earnerIsRoyal})`);
}

/**
 * Earner declines the chat.
 * Transition: AWAITING_EARNER_ACCEPT → CLOSED
 *
 * @param chatId - The chat to decline
 * @param userId - The user declining (must be the earner/receiver)
 */
export async function declineChat(
  chatId: string,
  userId: string
): Promise<void> {
  const chatRef = db.collection('chats').doc(chatId);

  await db.runTransaction(async (transaction) => {
    const chatSnap = await transaction.get(chatRef);
    if (!chatSnap.exists) {
      throw new ChatEngineError('not-found', `Chat ${chatId} not found`);
    }

    const chat = chatSnap.data() as CanonicalChatDocument;

    if (chat.state !== 'AWAITING_EARNER_ACCEPT') {
      throw new ChatEngineError('failed-precondition', `Chat ${chatId} is not in AWAITING_EARNER_ACCEPT state`);
    }

    // Only earner/receiver can decline
    if (chat.roles.earnerId !== userId && chat.participants[1] !== userId) {
      throw new ChatEngineError('permission-denied', `User ${userId} cannot decline chat ${chatId}`);
    }

    transaction.update(chatRef, {
      state: 'CLOSED' as CanonicalChatState,
      closedReason: 'earner_declined',
      closedBy: userId,
      updatedAt: serverTimestamp(),
    });
  });

  logger.info(`Chat declined: ${chatId} by ${userId}`);
}

// ============================================================================
// C) FREE → PAID GATE
// ============================================================================

/**
 * Decrement free message counter for the sender.
 * If both users have exhausted their free counters → AWAITING_DEPOSIT.
 *
 * Call this BEFORE processing the message. If it returns 'blocked',
 * the message must not be sent.
 *
 * @param chatId - The chat ID
 * @param senderId - The user sending a message
 * @returns 'allowed' if the message can proceed, 'blocked' if deposit required,
 *          'transition' if this message triggered the transition to AWAITING_DEPOSIT
 */
export async function decrementFreeCounter(
  chatId: string,
  senderId: string
): Promise<'allowed' | 'blocked' | 'transition'> {
  const chatRef = db.collection('chats').doc(chatId);

  return db.runTransaction(async (transaction) => {
    const chatSnap = await transaction.get(chatRef);
    if (!chatSnap.exists) {
      throw new ChatEngineError('not-found', `Chat ${chatId} not found`);
    }

    const chat = chatSnap.data() as CanonicalChatDocument;

    if (chat.state !== 'FREE_ACTIVE') {
      if (chat.state === 'AWAITING_DEPOSIT') {
        return 'blocked';
      }
      // If PAID_ACTIVE, free counter not relevant
      if (chat.state === 'PAID_ACTIVE') {
        return 'allowed';
      }
      throw new ChatEngineError('failed-precondition', `Chat ${chatId} state ${chat.state} does not allow messaging`);
    }

    const remaining = chat.free.freeRemainingByUser[senderId];
    if (remaining === undefined) {
      throw new ChatEngineError('failed-precondition', `Sender ${senderId} not found in free counters for chat ${chatId}`);
    }

    if (remaining <= 0) {
      // This sender already exhausted. Check if the chat should transition.
      const allExhausted = Object.values(chat.free.freeRemainingByUser)
        .every(count => count <= 0);

      if (allExhausted) {
        transaction.update(chatRef, {
          state: 'AWAITING_DEPOSIT' as CanonicalChatState,
          updatedAt: serverTimestamp(),
        });
        return 'blocked';
      }
      return 'blocked';
    }

    // Decrement sender's counter
    const newRemaining = remaining - 1;
    transaction.update(chatRef, {
      [`free.freeRemainingByUser.${senderId}`]: newRemaining,
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // After this decrement, check if ALL users are now exhausted
    const updatedCounters = { ...chat.free.freeRemainingByUser };
    updatedCounters[senderId] = newRemaining;
    const allExhausted = Object.values(updatedCounters).every(count => count <= 0);

    if (allExhausted) {
      transaction.update(chatRef, {
        state: 'AWAITING_DEPOSIT' as CanonicalChatState,
      });
      return 'transition';
    }

    return 'allowed';
  });
}

// ============================================================================
// D) DEPOSIT + ESCROW
// ============================================================================

/**
 * Process a deposit from the payer to start a paid session.
 *
 * Deposit = max(100, earnerConfiguredDepositTokensForNextSession)
 * Platform fee = 35% (non-refundable, charged immediately)
 * Escrow = 65% (refundable unused portion)
 *
 * Transition: AWAITING_DEPOSIT → PAID_ACTIVE
 *
 * @param chatId - The chat ID
 * @param payerId - The user making the deposit (must be the payer)
 * @param earnerConfig - The earner's deposit/multiplier config
 * @param earnerIsRoyal - Whether the earner has Royal status
 * @returns DepositResult with session details
 */
export async function processDeposit(
  chatId: string,
  payerId: string,
  earnerConfig: EarnerChatConfig | null,
  earnerIsRoyal: boolean
): Promise<DepositResult> {
  const chatRef = db.collection('chats').doc(chatId);

  // Calculate deposit amount: max(100, earner configured)
  const earnerConfigDeposit = earnerConfig?.depositTokensForNextSession ?? DEFAULT_DEPOSIT_TOKENS;
  const depositTokens = Math.max(MIN_DEPOSIT_TOKENS, earnerConfigDeposit);

  // Calculate splits using floor for determinism
  const platformFee = Math.floor(depositTokens * PLATFORM_FEE_PCT / 100);
  const escrow = depositTokens - platformFee; // Remainder goes to escrow

  // Validate and clamp multiplier
  let burnMultiplier: BurnMultiplier = 1;
  if (earnerConfig?.burnMultiplierForNextSession) {
    const requestedMultiplier = earnerConfig.burnMultiplierForNextSession;
    if (BURN_MULTIPLIER_ENUM.includes(requestedMultiplier as any)) {
      burnMultiplier = requestedMultiplier;
    }
    // Invalid multiplier silently defaults to 1
  }

  // Determine words per token
  const wordsPerToken = earnerIsRoyal ? WORDS_PER_TOKEN_ROYAL : WORDS_PER_TOKEN_STANDARD;

  const sessionId = generateId();

  return db.runTransaction(async (transaction) => {
    const chatSnap = await transaction.get(chatRef);
    if (!chatSnap.exists) {
      throw new ChatEngineError('not-found', `Chat ${chatId} not found`);
    }

    const chat = chatSnap.data() as CanonicalChatDocument;

    if (chat.state !== 'AWAITING_DEPOSIT') {
      throw new ChatEngineError('failed-precondition', `Chat ${chatId} is not in AWAITING_DEPOSIT state (current: ${chat.state})`);
    }

    if (chat.roles.payerId !== payerId) {
      throw new ChatEngineError('permission-denied', `User ${payerId} is not the payer of chat ${chatId}`);
    }

    // Charge payer wallet
    const payerWalletRef = db.collection('user_wallets').doc(payerId);
    const payerWalletSnap = await transaction.get(payerWalletRef);
    if (!payerWalletSnap.exists) {
      throw new ChatEngineError('failed-precondition', `Payer wallet not found for ${payerId}`);
    }

    const payerWallet = payerWalletSnap.data()!;
    const payerBalance = payerWallet.balance || 0;
    if (payerBalance < depositTokens) {
      throw new ChatEngineError('failed-precondition', `Insufficient balance: ${payerBalance} < ${depositTokens}`);
    }

    // Deduct from payer wallet
    transaction.update(payerWalletRef, {
      balance: increment(-depositTokens),
    });

    // Credit platform fee to Avalo
    const avaloWalletRef = db.collection('system_wallets').doc('avalo_platform');
    transaction.set(avaloWalletRef, {
      balance: increment(platformFee),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    // Determine session version
    const sessionVersion = chat.paidSession
      ? (chat.paidSession.sessionVersion || 0) + 1
      : 1;

    // Create paid session
    const session: CanonicalPaidSession = {
      sessionId,
      sessionVersion,
      configSnapshot: {
        depositTokens,
        wordsPerToken,
        burnMultiplier,
      },
      startedAt: Timestamp.now(),
      billingState: {
        accumulatedEarnerWords: 0,
        escrowRemainingTokens: escrow,
        platformFeeChargedTokens: platformFee,
        totalBucketsConsumed: 0,
        totalTokensConsumed: 0,
        totalEarnerCredited: 0,
        totalAvaloCredited: 0,
      },
    };

    // Update chat document
    transaction.update(chatRef, {
      state: 'PAID_ACTIVE' as CanonicalChatState,
      paidSession: session,
      updatedAt: serverTimestamp(),
    });

    // Record transaction
    const txId = generateId();
    const txRef = db.collection('transactions').doc(txId);
    transaction.set(txRef, {
      txId,
      uid: payerId,
      type: 'CHAT_DEPOSIT',
      amountTokens: -depositTokens,
      split: {
        platformTokens: platformFee,
        escrowTokens: escrow,
      },
      status: 'completed',
      metadata: {
        chatId,
        sessionId,
        sessionVersion,
        logicVersion: CANONICAL_LOGIC_VERSION,
      },
      createdAt: serverTimestamp(),
      completedAt: serverTimestamp(),
    });

    logger.info(`Deposit processed: chat=${chatId}, deposit=${depositTokens}, fee=${platformFee}, escrow=${escrow}, multiplier=${burnMultiplier}`);

    return {
      success: true,
      session,
      platformFee,
      escrow,
      depositTokens,
    };
  });
}

// ============================================================================
// E) BILLING DIRECTION (HARD)
// ============================================================================

/**
 * Count billable words in text, excluding URLs and emojis.
 *
 * @param text - The message text
 * @returns Number of billable words
 */
export function countBillableWords(text: string): number {
  if (!text || typeof text !== 'string') return 0;

  // Remove URLs
  let cleaned = text.replace(/https?:\/\/[^\s]+/g, '');
  // Remove emoji ranges
  cleaned = cleaned.replace(
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2702}-\u{27B0}]/gu,
    ''
  );
  // Split by whitespace and filter empty
  const words = cleaned.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/**
 * Calculate billing for an earner message.
 *
 * CRITICAL RULES:
 * - Only earner messages are billed
 * - Payer messages are ALWAYS free
 * - Uses deterministic floor for bucket calculation (NO Math.round)
 * - Partial bucket words remain in accumulatedEarnerWords
 *
 * Bucket rule:
 *   totalWords = accumulatedEarnerWords + newWords
 *   totalBuckets = floor(totalWords / wordsPerToken)
 *   newBuckets = totalBuckets - priorBuckets
 *   tokenCost = newBuckets * 1 * burnMultiplier
 *
 * @param currentState - Current billing state
 * @param config - Session config snapshot
 * @param newWords - Number of new words in this message
 * @param earnerId - The earner's user ID (null = Avalo earns)
 * @returns BillingResult
 */
export function calculateBilling(
  currentState: CanonicalBillingState,
  config: CanonicalSessionConfig,
  newWords: number,
  earnerId: string | null
): BillingResult {
  const totalWords = currentState.accumulatedEarnerWords + newWords;
  const totalBuckets = Math.floor(totalWords / config.wordsPerToken);
  const newBuckets = totalBuckets - currentState.totalBucketsConsumed;

  if (newBuckets <= 0) {
    // No new bucket consumed; words accumulate
    return {
      billed: false,
      newBuckets: 0,
      tokensConsumed: 0,
      earnerCredit: 0,
      avaloCredit: 0,
      escrowExhausted: false,
      updatedBillingState: {
        ...currentState,
        accumulatedEarnerWords: totalWords,
      },
    };
  }

  // Token cost per bucket = 1 * burnMultiplier
  const tokenCostPerBucket = 1 * config.burnMultiplier;
  let tokensToConsume = newBuckets * tokenCostPerBucket;

  // Cap at remaining escrow
  if (tokensToConsume > currentState.escrowRemainingTokens) {
    tokensToConsume = currentState.escrowRemainingTokens;
  }

  // Credit split
  let earnerCredit: number;
  let avaloCredit: number;

  if (earnerId !== null) {
    // 65% to earner, 35% to Avalo (from consumed escrow)
    earnerCredit = Math.floor(tokensToConsume * EARNER_REVENUE_SPLIT);
    avaloCredit = tokensToConsume - earnerCredit; // Remainder to Avalo
  } else {
    // No earner — 100% to Avalo
    earnerCredit = 0;
    avaloCredit = tokensToConsume;
  }

  const escrowExhausted = (currentState.escrowRemainingTokens - tokensToConsume) <= 0;

  const updatedBillingState: CanonicalBillingState = {
    accumulatedEarnerWords: totalWords,
    escrowRemainingTokens: currentState.escrowRemainingTokens - tokensToConsume,
    platformFeeChargedTokens: currentState.platformFeeChargedTokens,
    totalBucketsConsumed: totalBuckets,
    totalTokensConsumed: currentState.totalTokensConsumed + tokensToConsume,
    totalEarnerCredited: currentState.totalEarnerCredited + earnerCredit,
    totalAvaloCredited: currentState.totalAvaloCredited + avaloCredit,
  };

  return {
    billed: true,
    newBuckets,
    tokensConsumed: tokensToConsume,
    earnerCredit,
    avaloCredit,
    escrowExhausted,
    updatedBillingState,
  };
}

/**
 * Process a message in a PAID_ACTIVE chat.
 *
 * - If sender is the PAYER → always free, no billing
 * - If sender is the EARNER → bill based on word count
 *
 * @param chatId - The chat ID
 * @param senderId - The message sender
 * @param messageText - The message text
 * @returns BillingResult (billed=false if payer message)
 */
export async function processMessage(
  chatId: string,
  senderId: string,
  messageText: string
): Promise<BillingResult> {
  const chatRef = db.collection('chats').doc(chatId);

  return db.runTransaction(async (transaction) => {
    const chatSnap = await transaction.get(chatRef);
    if (!chatSnap.exists) {
      throw new ChatEngineError('not-found', `Chat ${chatId} not found`);
    }

    const chat = chatSnap.data() as CanonicalChatDocument;

    if (chat.state !== 'PAID_ACTIVE') {
      throw new ChatEngineError('failed-precondition', `Chat ${chatId} is not in PAID_ACTIVE state (current: ${chat.state})`);
    }

    if (!chat.paidSession) {
      throw new ChatEngineError('internal', `Chat ${chatId} in PAID_ACTIVE but no paidSession`);
    }

    // Update last message timestamp
    transaction.update(chatRef, {
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // PAYER messages are ALWAYS free
    if (senderId === chat.roles.payerId) {
      return {
        billed: false,
        newBuckets: 0,
        tokensConsumed: 0,
        earnerCredit: 0,
        avaloCredit: 0,
        escrowExhausted: false,
        updatedBillingState: chat.paidSession.billingState,
      };
    }

    // EARNER message — bill it
    const wordCount = countBillableWords(messageText);
    if (wordCount === 0) {
      return {
        billed: false,
        newBuckets: 0,
        tokensConsumed: 0,
        earnerCredit: 0,
        avaloCredit: 0,
        escrowExhausted: false,
        updatedBillingState: chat.paidSession.billingState,
      };
    }

    const result = calculateBilling(
      chat.paidSession.billingState,
      chat.paidSession.configSnapshot,
      wordCount,
      chat.roles.earnerId
    );

    // Write updated billing state
    transaction.update(chatRef, {
      'paidSession.billingState': result.updatedBillingState,
    });

    // If tokens were consumed, credit wallets
    if (result.tokensConsumed > 0) {
      // Credit earner wallet
      if (result.earnerCredit > 0 && chat.roles.earnerId) {
        const earnerWalletRef = db.collection('user_wallets').doc(chat.roles.earnerId);
        transaction.set(earnerWalletRef, {
          balance: increment(result.earnerCredit),
          earned: increment(result.earnerCredit),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }

      // Credit Avalo from escrow consumption
      if (result.avaloCredit > 0) {
        const avaloWalletRef = db.collection('system_wallets').doc('avalo_platform');
        transaction.set(avaloWalletRef, {
          balance: increment(result.avaloCredit),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }

      // Record billing transaction
      const txId = generateId();
      const txRef = db.collection('transactions').doc(txId);
      transaction.set(txRef, {
        txId,
        uid: chat.roles.earnerId || 'avalo_platform',
        type: 'CHAT_BILLING',
        amountTokens: result.tokensConsumed,
        split: {
          earnerTokens: result.earnerCredit,
          avaloTokens: result.avaloCredit,
        },
        status: 'completed',
        metadata: {
          chatId,
          sessionId: chat.paidSession.sessionId,
          senderId,
          wordCount,
          newBuckets: result.newBuckets,
          burnMultiplier: chat.paidSession.configSnapshot.burnMultiplier,
          logicVersion: CANONICAL_LOGIC_VERSION,
        },
        createdAt: serverTimestamp(),
        completedAt: serverTimestamp(),
      });
    }

    // If escrow exhausted, transition to AWAITING_DEPOSIT (ready for re-deposit)
    if (result.escrowExhausted) {
      transaction.update(chatRef, {
        state: 'AWAITING_DEPOSIT' as CanonicalChatState,
      });
      logger.info(`Escrow exhausted: chat=${chatId}, transitioning to AWAITING_DEPOSIT`);
    }

    return result;
  });
}

// ============================================================================
// F) MULTIPLIER CHANGES (NEXT SESSION ONLY)
// ============================================================================

/**
 * Earner sets burn multiplier for their NEXT paid session.
 * Validates against BURN_MULTIPLIER_ENUM [1,2,3,4,5,7,10,12,15,20].
 *
 * This does NOT affect any current active session.
 *
 * @param userId - The earner user ID
 * @param multiplier - The desired multiplier
 */
export async function setMultiplierForNextSession(
  userId: string,
  multiplier: number
): Promise<void> {
  if (!BURN_MULTIPLIER_ENUM.includes(multiplier as BurnMultiplier)) {
    throw new ChatEngineError(
      'invalid-argument',
      `Invalid multiplier ${multiplier}. Allowed: ${BURN_MULTIPLIER_ENUM.join(', ')}`
    );
  }

  await db.collection('users').doc(userId).set({
    chatEarnerConfig: {
      burnMultiplierForNextSession: multiplier,
    },
  }, { merge: true });

  logger.info(`Multiplier set: user=${userId}, multiplier=${multiplier} (next session)`);
}

/**
 * Earner sets deposit tokens for their NEXT paid session.
 * Minimum is 100 tokens.
 *
 * @param userId - The earner user ID
 * @param depositTokens - The desired deposit amount
 */
export async function setDepositForNextSession(
  userId: string,
  depositTokens: number
): Promise<void> {
  if (typeof depositTokens !== 'number' || depositTokens < MIN_DEPOSIT_TOKENS) {
    throw new ChatEngineError(
      'invalid-argument',
      `Deposit must be at least ${MIN_DEPOSIT_TOKENS} tokens, got ${depositTokens}`
    );
  }

  await db.collection('users').doc(userId).set({
    chatEarnerConfig: {
      depositTokensForNextSession: depositTokens,
    },
  }, { merge: true });

  logger.info(`Deposit set: user=${userId}, depositTokens=${depositTokens} (next session)`);
}

// ============================================================================
// G) CHAT END / EXPIRY
// ============================================================================

/**
 * End a chat manually (by either party).
 * Refunds unused escrow to payer.
 * Platform fee is NEVER refunded.
 *
 * Transition: any active state → CLOSED
 *
 * @param chatId - The chat to end
 * @param userId - The user requesting end
 * @returns RefundResult
 */
export async function endChat(
  chatId: string,
  userId: string
): Promise<RefundResult> {
  const chatRef = db.collection('chats').doc(chatId);

  return db.runTransaction(async (transaction) => {
    const chatSnap = await transaction.get(chatRef);
    if (!chatSnap.exists) {
      throw new ChatEngineError('not-found', `Chat ${chatId} not found`);
    }

    const chat = chatSnap.data() as CanonicalChatDocument;

    // Validate user is a participant
    if (!chat.participants.includes(userId)) {
      throw new ChatEngineError('permission-denied', `User ${userId} is not a participant of chat ${chatId}`);
    }

    // Already closed/expired
    if (chat.state === 'CLOSED' || chat.state === 'EXPIRED') {
      return {
        refundedTokens: 0,
        platformFeeRetained: chat.paidSession?.billingState.platformFeeChargedTokens || 0,
        earnerCreditsRetained: chat.paidSession?.billingState.totalEarnerCredited || 0,
      };
    }

    let refundedTokens = 0;
    let platformFeeRetained = 0;
    let earnerCreditsRetained = 0;

    // If there's an active paid session, refund remaining escrow
    if (chat.paidSession && chat.paidSession.billingState.escrowRemainingTokens > 0) {
      refundedTokens = chat.paidSession.billingState.escrowRemainingTokens;
      platformFeeRetained = chat.paidSession.billingState.platformFeeChargedTokens;
      earnerCreditsRetained = chat.paidSession.billingState.totalEarnerCredited;

      // Refund to payer wallet
      const payerWalletRef = db.collection('user_wallets').doc(chat.roles.payerId);
      transaction.set(payerWalletRef, {
        balance: increment(refundedTokens),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // Record refund transaction
      const txId = generateId();
      const txRef = db.collection('transactions').doc(txId);
      transaction.set(txRef, {
        txId,
        uid: chat.roles.payerId,
        type: 'CHAT_REFUND',
        amountTokens: refundedTokens,
        status: 'completed',
        metadata: {
          chatId,
          sessionId: chat.paidSession.sessionId,
          reason: 'chat_ended',
          closedBy: userId,
          logicVersion: CANONICAL_LOGIC_VERSION,
        },
        createdAt: serverTimestamp(),
        completedAt: serverTimestamp(),
      });

      // Zero out escrow in billing state
      transaction.update(chatRef, {
        'paidSession.billingState.escrowRemainingTokens': 0,
      });
    }

    // Close the chat
    transaction.update(chatRef, {
      state: 'CLOSED' as CanonicalChatState,
      closedReason: 'user_ended',
      closedBy: userId,
      updatedAt: serverTimestamp(),
    });

    logger.info(`Chat ended: ${chatId} by ${userId}, refunded=${refundedTokens}`);

    return {
      refundedTokens,
      platformFeeRetained,
      earnerCreditsRetained,
    };
  });
}

/**
 * Auto-expire inactive chats (48h canonical inactivity threshold).
 * Called by scheduled function.
 *
 * Finds all chats in active states that haven't had a message in 48+ hours
 * and expires them with escrow refund.
 *
 * @returns Number of chats expired
 */
export async function expireInactiveChats(): Promise<number> {
  const cutoff = Timestamp.fromMillis(Date.now() - INACTIVITY_EXPIRY_MS);
  let expiredCount = 0;

  // Expire active chats (FREE_ACTIVE, AWAITING_DEPOSIT, PAID_ACTIVE)
  const activeStates: CanonicalChatState[] = ['FREE_ACTIVE', 'AWAITING_DEPOSIT', 'PAID_ACTIVE'];

  for (const state of activeStates) {
    const staleChatsSnap = await db.collection('chats')
      .where('logicVersion', '==', CANONICAL_LOGIC_VERSION)
      .where('state', '==', state)
      .where('lastMessageAt', '<', cutoff)
      .limit(500) // Process in batches
      .get();

    for (const chatDoc of staleChatsSnap.docs) {
      try {
        const chat = chatDoc.data() as CanonicalChatDocument;

        await db.runTransaction(async (transaction) => {
          const freshSnap = await transaction.get(chatDoc.ref);
          const freshChat = freshSnap.data() as CanonicalChatDocument;

          // Double-check state hasn't changed
          if (freshChat.state !== state) return;

          // Refund remaining escrow if any
          if (freshChat.paidSession && freshChat.paidSession.billingState.escrowRemainingTokens > 0) {
            const refund = freshChat.paidSession.billingState.escrowRemainingTokens;
            const payerWalletRef = db.collection('user_wallets').doc(freshChat.roles.payerId);
            transaction.set(payerWalletRef, {
              balance: increment(refund),
              updatedAt: serverTimestamp(),
            }, { merge: true });

            // Record refund
            const txId = generateId();
            transaction.set(db.collection('transactions').doc(txId), {
              txId,
              uid: freshChat.roles.payerId,
              type: 'CHAT_REFUND',
              amountTokens: refund,
              status: 'completed',
              metadata: {
                chatId: chatDoc.id,
                sessionId: freshChat.paidSession.sessionId,
                reason: 'inactivity_expiry',
                logicVersion: CANONICAL_LOGIC_VERSION,
              },
              createdAt: serverTimestamp(),
              completedAt: serverTimestamp(),
            });

            transaction.update(chatDoc.ref, {
              'paidSession.billingState.escrowRemainingTokens': 0,
            });
          }

          transaction.update(chatDoc.ref, {
            state: 'EXPIRED' as CanonicalChatState,
            closedReason: 'system_expired',
            updatedAt: serverTimestamp(),
          });
        });

        expiredCount++;
      } catch (error) {
        logger.error(`Failed to expire chat ${chatDoc.id}:`, error);
      }
    }
  }

  // Also expire AWAITING_EARNER_ACCEPT chats (no lastMessageAt, use createdAt)
  const staleMatchedSnap = await db.collection('chats')
    .where('logicVersion', '==', CANONICAL_LOGIC_VERSION)
    .where('state', '==', 'AWAITING_EARNER_ACCEPT')
    .where('createdAt', '<', cutoff)
    .limit(500)
    .get();

  for (const chatDoc of staleMatchedSnap.docs) {
    try {
      await chatDoc.ref.update({
        state: 'EXPIRED' as CanonicalChatState,
        closedReason: 'system_expired',
        updatedAt: serverTimestamp(),
      });
      expiredCount++;
    } catch (error) {
      logger.error(`Failed to expire awaiting chat ${chatDoc.id}:`, error);
    }
  }

  logger.info(`Expired ${expiredCount} inactive chats`);
  return expiredCount;
}

// ============================================================================
// H) VALIDATION HELPERS
// ============================================================================

/**
 * Validate that a multiplier is in the allowed enum.
 */
export function isValidMultiplier(multiplier: number): multiplier is BurnMultiplier {
  return BURN_MULTIPLIER_ENUM.includes(multiplier as BurnMultiplier);
}

/**
 * Check if a chat document uses the canonical v2 logic.
 */
export function isCanonicalChat(chatData: any): boolean {
  return chatData?.logicVersion === CANONICAL_LOGIC_VERSION;
}

/**
 * Get the earner's config for next session.
 * Falls back to defaults if not configured.
 */
export async function getEarnerConfig(userId: string): Promise<EarnerChatConfig> {
  const userSnap = await db.collection('users').doc(userId).get();
  const userData = userSnap.data();

  return {
    depositTokensForNextSession: userData?.chatEarnerConfig?.depositTokensForNextSession ?? DEFAULT_DEPOSIT_TOKENS,
    burnMultiplierForNextSession: userData?.chatEarnerConfig?.burnMultiplierForNextSession ?? 1,
  };
}









