import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * AI Chat Engine
 * Phase 12: AI Companions 2.0 (Creator Bots)
 * 
 * Handles AI chat sessions, message processing, and billing integration.
 * Integrates with existing chatMonetization.ts for word-based billing.
 * This module is 100% additive and does NOT modify existing systems.
 */

import { db, serverTimestamp, increment, generateId } from './init';
import { getBotInfo, generateAiResponse, updateBotStats } from './aiBotEngine';
import type {
  AIChat,
  AiMessage,
  StartAiChatRequest,
  StartAiChatResponse,
  ProcessAiMessageRequest,
  ProcessAiMessageResponse,
  BotEarningRecord,
} from './types/aiBot';
import { timestamp } from './runtime';
import { getBalance, transactTokens } from './wallet/walletService';
import { requireVerifiedAdult } from './compliance/ageGuard'; // C2

// Simple error class
class HttpsError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'HttpsError';
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

// V9 billing constants
const FREE_WELCOME_MESSAGES = 4;         // V9: 4 free messages (was 3)
const BASE_MESSAGE_PRICE_TOKENS = 3;     // V9: flat 3 tokens per AI message
const CREATOR_SHARE_PERCENT = 100;       // V9: earner receives 100% per message (platform earns on payout)
const AVALO_SHARE_PERCENT = 0;           // V9: no per-message platform cut

// @deprecated V9 — kept for variable reference below, do not add new uses
const CHAT_DEPOSIT_TOKENS = 0;           // V9: no deposit
const PLATFORM_FEE_PERCENT = 0;          // V9: no per-message platform fee (platform earns on payout)

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Count billable words (same logic as chatMonetization.ts)
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

/**
 * Check if user is a minor (under 18)
 */
async function isUserMinor(userId: string): Promise<boolean> {
  const userSnap = await db.collection('users').doc(userId).get();
  if (!userSnap.exists) return true; // Safe default

  const userData = userSnap.data();
  const birthDate = userData?.birthDate;

  // P0-3: Primary check — verified DOB from Stripe Identity webhook
  if (birthDate) {
    const age = Math.floor((Date.now() - birthDate.toDate().getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    return age < 18;
  }

  // P0-3: Fallback — ageVerified flag for existing users who verified before Stripe Identity
  // (register.tsx stored ageVerified:true but never stored birthDate)
  if (userData?.ageVerified === true) return false;

  return true; // Safe default — treat as minor if no verification data
}

/**
 * Check if user is Royal member
 */
async function isRoyalMember(userId: string): Promise<boolean> {
  const userSnap = await db.collection('users').doc(userId).get();
  if (!userSnap.exists) return false;
  
  const userData = userSnap.data();
  return userData?.roles?.royal || userData?.royalClubTier !== undefined;
}

// ============================================================================
// CHAT LIFECYCLE FUNCTIONS
// ============================================================================

/**
 * Start a new AI chat session
 */
export async function startAiChat(
  userId: string,
  request: StartAiChatRequest
): Promise<StartAiChatResponse> {

  // C2: AI chat is a monetized social surface. User must be a verified adult.
  await requireVerifiedAdult(userId);

  // Get bot info
  const bot = await getBotInfo(request.botId);
  
  if (!bot || !bot.isActive || bot.isPaused) {
    throw new HttpsError('not-found', 'Bot is not available');
  }
  
  // Check for existing active chat
  const existingChatQuery = await db.collection('aiChats')
    .where('userId', '==', userId)
    .where('botId', '==', request.botId)
    .where('state', 'in', ['FREE_ACTIVE', 'PAID_ACTIVE', 'AWAITING_DEPOSIT'])
    .limit(1)
    .get();
    
  if (!existingChatQuery.empty) {
    return {
      chatId: existingChatQuery.docs[0].id,
      existing: true,
    };
  }
  
  // Create new chat — V9: no Royal check needed (flat billing)
  const chatId = generateId();
  const chatData: AIChat = {
    chatId,
    botId: request.botId,
    userId,
    earnerId: bot.earnerId,
    state: 'FREE_ACTIVE',
    billing: {
      wordsPerToken: 0,          // V9: unused, kept for schema compat
      freeMessagesRemaining: FREE_WELCOME_MESSAGES,
      escrowBalance: 0,          // V9: no escrow
      totalConsumed: 0,
      messageCount: 0,
    },
    pricePerMessage: BASE_MESSAGE_PRICE_TOKENS, // V9: always 3
    contextWindow: {
      lastMessages: [],
    },
    createdAt: serverTimestamp() as any,
    lastMessageAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any,
  };
  
  await db.collection('aiChats').doc(chatId).set(chatData);
  
  // Update bot stats
  await updateBotStats(request.botId, { newChat: true });
  
  return {
    chatId,
    existing: false,
  };
}

/**
 * Process user message and generate AI response with billing
 */
export async function processAiMessage(
  userId: string,
  request: ProcessAiMessageRequest
): Promise<ProcessAiMessageResponse> {
  
  // Phase 22: CSAM Shield - Check user message for CSAM risk
  try {
    const { evaluateTextForCsamRisk, createCsamIncident, applyImmediateProtectiveActions } = await import('./csamShield');
    const csamCheck = evaluateTextForCsamRisk(request.message, 'en');
    
    if (csamCheck.isFlagged && (csamCheck.riskLevel === 'HIGH' || csamCheck.riskLevel === 'CRITICAL')) {
      // Create incident
      const incidentId = await createCsamIncident({
        userId,
        source: 'ai_chat',
        detectionChannel: 'auto_text',
        riskLevel: csamCheck.riskLevel,
        contentSnippet: request.message.substring(0, 100),
      });
      
      // Apply protective actions
      await applyImmediateProtectiveActions(userId, csamCheck.riskLevel, incidentId);
      
      // Reject message
      return {
        success: false,
        tokensCost: 0,
        wasFree: false,
        error: 'BOT_UNAVAILABLE',
        message: 'Message rejected for safety reasons. Your account is under review.',
      };
    }
  } catch (error) {
    // Non-blocking - if CSAM check fails, allow message but continue
    // (error is silently caught to avoid disrupting user experience)
  }
  
  // Get chat
  const chatRef = db.collection('aiChats').doc(request.chatId);
  const chatSnap = await chatRef.get();
  
  if (!chatSnap.exists) {
    throw new HttpsError('not-found', 'Chat not found');
  }
  
  const chat = chatSnap.data() as AIChat;
  
  // Verify ownership
  if (chat.userId !== userId) {
    throw new HttpsError('permission-denied', 'Not authorized for this chat');
  }
  
  // Check if bot is still active
  const bot = await getBotInfo(chat.botId);
  if (!bot || !bot.isActive || bot.isPaused) {
    return {
      success: false,
      tokensCost: 0,
      wasFree: false,
      error: 'BOT_UNAVAILABLE',
      message: 'This bot is no longer available',
    };
  }
  
  // Check if we have free messages
  const hasFreeMessages = chat.billing.freeMessagesRemaining > 0;
  
  // If no free messages and in FREE_ACTIVE, transition to paid
  if (!hasFreeMessages && chat.state === 'FREE_ACTIVE') {
    await chatRef.update({
      state: 'AWAITING_DEPOSIT',
      updatedAt: serverTimestamp(),
    });
    
    return {
      success: false,
      tokensCost: 0,
      wasFree: false,
      error: 'DEPOSIT_REQUIRED',
      message: `Free welcome messages used. Deposit ${CHAT_DEPOSIT_TOKENS} tokens to continue chatting.`,
      required: CHAT_DEPOSIT_TOKENS,
    };
  }
  
  // C2: requireVerifiedAdult already called at startAiChat — user is confirmed adult.
  await requireVerifiedAdult(userId);
  const isMinor = false; // Invariant: verified adult → not a minor

  // Generate AI response
  const aiResponse = await generateAiResponse({
    botPersonality: bot.personality,
    systemPrompt: bot.systemPrompt,
    contextMessages: chat.contextWindow.lastMessages,
    userMessage: request.message,
    nsfwEnabled: bot.nsfwEnabled,
    isMinor,
  });
  
  // V9: flat 3 tokens per AI message (BASE_MESSAGE_PRICE_TOKENS)
  const tokensCost = hasFreeMessages ? 0 : BASE_MESSAGE_PRICE_TOKENS;

  // V9: check payer wallet balance via canonical walletService
  if (!hasFreeMessages) {
    const payerBalance = await getBalance(userId);
    if (payerBalance < tokensCost) {
      // Transition AI chat to LOCKED
      await chatRef.update({ state: 'LOCKED', updatedAt: serverTimestamp() });
      return {
        success: false,
        tokensCost,
        wasFree: false,
        error: 'INSUFFICIENT_BALANCE',
        message: 'Insufficient token balance',
        required: tokensCost,
      };
    }
  }

  // Pre-generate message IDs — used as idempotency key suffix for transactTokens
  const userMsgId = generateId();
  const botMsgId = generateId();

  // Process billing and save messages in transaction
  await db.runTransaction(async (transaction) => {
    // Save user message
    const userMsgRef = db.collection('aiChats').doc(request.chatId).collection('messages').doc(userMsgId);
    transaction.set(userMsgRef, {
      messageId: userMsgId,
      chatId: request.chatId,
      role: 'user',
      content: request.message,
      tokensCost: 0,
      wasFree: false,
      timestamp: serverTimestamp(),
    });

    // Save AI response
    const botMsgRef = db.collection('aiChats').doc(request.chatId).collection('messages').doc(botMsgId);
    transaction.set(botMsgRef, {
      messageId: botMsgId,
      chatId: request.chatId,
      role: 'bot',
      content: aiResponse,
      tokensCost,
      wasFree: hasFreeMessages,
      timestamp: serverTimestamp(),
    });

    // Update chat state
    const chatUpdates: any = {
      'billing.messageCount': increment(2),
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Update context window
    const newContext = [
      ...chat.contextWindow.lastMessages.slice(-14),
      `User: ${request.message}`,
      `Bot: ${aiResponse}`,
    ];
    chatUpdates['contextWindow.lastMessages'] = newContext;

    if (hasFreeMessages) {
      chatUpdates['billing.freeMessagesRemaining'] = increment(-1);
    } else {
      // V9: deduct from payer wallet directly (no escrow)
      chatUpdates['billing.totalConsumed'] = increment(tokensCost);

      // V9: earner receives 100% of message cost; wallet mutation handled post-transaction
      const earnerCredit = tokensCost;

      // Record earnings
      const earningsRef = db.collection('aiBotEarnings').doc(chat.botId).collection('records').doc();
      const period = new Date().toISOString().substring(0, 7);
      transaction.set(earningsRef, {
        recordId: earningsRef.id,
        botId: chat.botId,
        earnerId: chat.earnerId,
        chatId: request.chatId,
        userId,
        tokensEarned: earnerCredit,
        messageCount: 1,
        timestamp: serverTimestamp(),
        period,
      });
    }

    transaction.update(chatRef, chatUpdates);
  });

  // ── Canonical wallet mutation (outside Firestore transaction) ────────────────
  if (!hasFreeMessages && tokensCost > 0) {
    await transactTokens({
      type: 'CHAT_BURN',
      actorId: userId,
      counterpartyId: chat.earnerId ?? null,
      amountTokens: tokensCost,
      split: {
        creatorTokens: tokensCost, // V9: CREATOR_SHARE_PERCENT = 100%
        avaloTokens: 0,            // V9: AVALO_SHARE_PERCENT = 0%
      },
      idempotencyKey: `ai_msg_${request.chatId}_${botMsgId}_${userId}`,
      chatId: request.chatId,
      metadata: { userId, botId: chat.botId, earnerId: chat.earnerId ?? null },
    });
  }

  // Update bot stats outside transaction (async)
  if (!hasFreeMessages) {
    await updateBotStats(chat.botId, {
      messagesIncrement: 1,
      earningsIncrement: tokensCost,
    });
  }

  // Record ranking event (async, non-blocking)
  if (!hasFreeMessages && tokensCost > 0) {
    try {
      const { recordRankingAction } = await import('./rankingEngine');
      await recordRankingAction({
        type: 'paid_chat',
        earnerId: chat.earnerId,
        payerId: userId,
        points: tokensCost,
        timestamp: new Date(),
      });
    } catch (_err) {
      // Non-blocking
    }
  }

  return {
    success: true,
    response: aiResponse,
    tokensCost,
    wasFree: hasFreeMessages,
  };
}

/**
 * Process deposit for AI chat
 */
export async function processAiChatDeposit(
  userId: string,
  chatId: string
): Promise<{ success: boolean; escrowAmount: number; platformFee: number }> {
  
  const chatRef = db.collection('aiChats').doc(chatId);
  const chatSnap = await chatRef.get();
  
  if (!chatSnap.exists) {
    throw new HttpsError('not-found', 'Chat not found');
  }
  
  const chat = chatSnap.data() as AIChat;
  
  // Verify ownership
  if (chat.userId !== userId) {
    throw new HttpsError('permission-denied', 'Not authorized');
  }
  
  // Check state
  if (chat.state !== 'AWAITING_DEPOSIT') {
    throw new HttpsError('failed-precondition', 'Chat does not require deposit');
  }
  
  // V9: CHAT_DEPOSIT_TOKENS = 0 — balance check preserved for API compatibility
  const payerBalance = await getBalance(userId);
  if (payerBalance < CHAT_DEPOSIT_TOKENS) {
    throw new HttpsError('failed-precondition', 'Insufficient tokens');
  }

  // Calculate split
  const platformFee = Math.ceil(CHAT_DEPOSIT_TOKENS * (PLATFORM_FEE_PERCENT / 100));
  const escrowAmount = CHAT_DEPOSIT_TOKENS - platformFee;

  // Process deposit in transaction
  await db.runTransaction(async (transaction) => {
    // V9: CHAT_DEPOSIT_TOKENS = 0 — no wallet debit needed
    
    // Update chat
    transaction.update(chatRef, {
      state: 'PAID_ACTIVE',
      'billing.escrowBalance': escrowAmount,
      'deposit': {
        amount: CHAT_DEPOSIT_TOKENS,
        platformFee,
        escrowAmount,
        paidAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    });
    
    // Record platform fee transaction
    const txRef = db.collection('transactions').doc(generateId());
    transaction.set(txRef, {
      userId,
      type: 'ai_chat_fee',
      amount: -platformFee,
      metadata: { chatId, botId: chat.botId, purpose: 'platform_fee' },
      createdAt: serverTimestamp(),
    });
  });
  
  return {
    success: true,
    escrowAmount,
    platformFee,
  };
}

/**
 * Close AI chat and refund remaining escrow
 */
export async function closeAiChat(
  userId: string,
  chatId: string
): Promise<{ refunded: number }> {
  
  const chatRef = db.collection('aiChats').doc(chatId);
  const chatSnap = await chatRef.get();
  
  if (!chatSnap.exists) {
    throw new HttpsError('not-found', 'Chat not found');
  }
  
  const chat = chatSnap.data() as AIChat;
  
  // Verify ownership
  if (chat.userId !== userId) {
    throw new HttpsError('permission-denied', 'Not authorized');
  }
  
  const remainingEscrow = chat.billing.escrowBalance || 0;
  
  // Close chat and refund
  await db.runTransaction(async (transaction) => {
    // V9: escrowBalance is always 0 (CHAT_DEPOSIT_TOKENS = 0);
    // phantom wallet update removed — audit record preserved for backward compat.
    if (remainingEscrow > 0) {
      const txRef = db.collection('transactions').doc(generateId());
      transaction.set(txRef, {
        userId,
        type: 'refund',
        amount: remainingEscrow,
        metadata: { chatId, botId: chat.botId, reason: 'chat_closed' },
        createdAt: serverTimestamp(),
      });
    }
    
    // Close chat
    transaction.update(chatRef, {
      state: 'CLOSED',
      'billing.escrowBalance': 0,
      closedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  
  return { refunded: remainingEscrow };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  startAiChat,
  processAiMessage,
  processAiChatDeposit,
  closeAiChat,
};
































