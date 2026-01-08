/**
 * AI Chat Engine
 * Phase 12: AI Companions 2.0 (Creator Bots)
 * 
 * Handles AI chat sessions, message processing, and billing integration.
 * Integrates with existing chatMonetization.ts for word-based billing.
 * This module is 100% additive and does NOT modify existing systems.
 */

import { db, serverTimestamp, increment, generateId } from './init.js';
import { getBotInfo, generateAiResponse, updateBotStats } from './aiBotEngine.js';
import type {
  AIChat,
  AiMessage,
  StartAiChatRequest,
  StartAiChatResponse,
  ProcessAiMessageRequest,
  ProcessAiMessageResponse,
  BotEarningRecord,
} from './types/aiBot.js';

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

const FREE_WELCOME_MESSAGES = 3;
const WORDS_PER_TOKEN_ROYAL = 7;
const WORDS_PER_TOKEN_STANDARD = 11;
const CHAT_DEPOSIT_TOKENS = 100;
const PLATFORM_FEE_PERCENT = 35; // Same as human chats
const CREATOR_SHARE_PERCENT = 80;
const AVALO_SHARE_PERCENT = 20;

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
  
  if (!birthDate) return true; // Safe default if no birth date
  
  const age = Math.floor((Date.now() - birthDate.toDate().getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return age < 18;
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
  
  // Get user context
  const isRoyal = await isRoyalMember(userId);
  const wordsPerToken = isRoyal ? WORDS_PER_TOKEN_ROYAL : WORDS_PER_TOKEN_STANDARD;
  
  // Create new chat
  const chatId = generateId();
  const chatData: AIChat = {
    chatId,
    botId: request.botId,
    userId,
    creatorId: bot.creatorId,
    state: 'FREE_ACTIVE',
    billing: {
      wordsPerToken,
      freeMessagesRemaining: FREE_WELCOME_MESSAGES,
      escrowBalance: 0,
      totalConsumed: 0,
      messageCount: 0,
    },
    pricePerMessage: bot.pricing.perMessage,
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
    const { evaluateTextForCsamRisk, createCsamIncident, applyImmediateProtectiveActions } = await import('./csamShield.js');
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
  
  // Check if user is a minor for safety filters
  const isMinor = await isUserMinor(userId);
  
  // Generate AI response
  const aiResponse = await generateAiResponse({
    botPersonality: bot.personality,
    systemPrompt: bot.systemPrompt,
    contextMessages: chat.contextWindow.lastMessages,
    userMessage: request.message,
    nsfwEnabled: bot.nsfwEnabled,
    isMinor,
  });
  
  // Calculate billing for AI response
  const wordCount = countBillableWords(aiResponse);
  
  // Token cost = base price + word-based billing
  const wordBasedTokens = hasFreeMessages ? 0 : Math.round(wordCount / chat.billing.wordsPerToken);
  const tokensCost = hasFreeMessages ? 0 : (wordBasedTokens + chat.pricePerMessage);
  
  // If paid and insufficient escrow, return error
  if (!hasFreeMessages && tokensCost > chat.billing.escrowBalance) {
    return {
      success: false,
      tokensCost,
      wasFree: false,
      error: 'INSUFFICIENT_BALANCE',
      message: 'Insufficient escrow balance',
      required: tokensCost,
    };
  }
  
  // Process billing and save messages in transaction
  await db.runTransaction(async (transaction) => {
    // Save user message
    const userMsgRef = db.collection('aiChats').doc(request.chatId).collection('messages').doc();
    transaction.set(userMsgRef, {
      messageId: userMsgRef.id,
      chatId: request.chatId,
      role: 'user',
      content: request.message,
      wordCount: countBillableWords(request.message),
      tokensCost: 0, // User doesn't pay for their own messages
      wasFree: false,
      timestamp: serverTimestamp(),
    });
    
    // Save AI response
    const botMsgRef = db.collection('aiChats').doc(request.chatId).collection('messages').doc();
    transaction.set(botMsgRef, {
      messageId: botMsgRef.id,
      chatId: request.chatId,
      role: 'bot',
      content: aiResponse,
      wordCount,
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
      ...chat.contextWindow.lastMessages.slice(-14), // Keep last 14
      `User: ${request.message}`,
      `Bot: ${aiResponse}`,
    ];
    chatUpdates['contextWindow.lastMessages'] = newContext;
    
    if (hasFreeMessages) {
      // Deduct free message
      chatUpdates['billing.freeMessagesRemaining'] = increment(-1);
    } else {
      // Process paid message
      chatUpdates['billing.escrowBalance'] = increment(-tokensCost);
      chatUpdates['billing.totalConsumed'] = increment(tokensCost);
      
      // Calculate revenue split (80% creator, 20% Avalo)
      const creatorShare = Math.floor(tokensCost * (CREATOR_SHARE_PERCENT / 100));
      const avaloShare = tokensCost - creatorShare;
      
      // Credit creator wallet
      const creatorWalletRef = db.collection('users').doc(chat.creatorId).collection('wallet').doc('current');
      transaction.update(creatorWalletRef, {
        balance: increment(creatorShare),
        earned: increment(creatorShare),
      });
      
      // Deduct from user's pending
      const userWalletRef = db.collection('users').doc(userId).collection('wallet').doc('current');
      transaction.update(userWalletRef, {
        pending: increment(-tokensCost),
      });
      
      // Record earnings
      const earningsRef = db.collection('aiBotEarnings').doc(chat.botId).collection('records').doc();
      const period = new Date().toISOString().substring(0, 7); // YYYY-MM
      
      transaction.set(earningsRef, {
        recordId: earningsRef.id,
        botId: chat.botId,
        creatorId: chat.creatorId,
        chatId: request.chatId,
        userId,
        tokensEarned: tokensCost,
        creatorShare,
        avaloShare,
        messageCount: 1,
        wordCount,
        timestamp: serverTimestamp(),
        period,
      });
      
      // Update bot stats (will execute after transaction)
      // Note: updateBotStats is atomic and separate from this transaction
    }
    
    transaction.update(chatRef, chatUpdates);
  });
  
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
      // Import ranking function dynamically to avoid circular dependencies
      const { recordRankingAction } = await import('./rankingEngine.js');
      
      await recordRankingAction({
        type: 'paid_chat',
        creatorId: chat.creatorId,
        payerId: userId,
        points: tokensCost,
        timestamp: new Date(),
      });
    } catch (error) {
      // Non-blocking - don't fail if ranking fails
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
  
  // Check user wallet
  const walletRef = db.collection('users').doc(userId).collection('wallet').doc('current');
  const walletSnap = await walletRef.get();
  const wallet = walletSnap.data();
  
  if (!wallet || wallet.balance < CHAT_DEPOSIT_TOKENS) {
    throw new HttpsError('failed-precondition', 'Insufficient tokens');
  }
  
  // Calculate split
  const platformFee = Math.ceil(CHAT_DEPOSIT_TOKENS * (PLATFORM_FEE_PERCENT / 100));
  const escrowAmount = CHAT_DEPOSIT_TOKENS - platformFee;
  
  // Process deposit in transaction
  await db.runTransaction(async (transaction) => {
    // Deduct from user
    transaction.update(walletRef, {
      balance: increment(-CHAT_DEPOSIT_TOKENS),
      pending: increment(escrowAmount), // Escrow goes to pending
    });
    
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
    // Refund remaining escrow
    if (remainingEscrow > 0) {
      const walletRef = db.collection('users').doc(userId).collection('wallet').doc('current');
      transaction.update(walletRef, {
        balance: increment(remainingEscrow),
        pending: increment(-remainingEscrow),
      });
      
      // Record refund transaction
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