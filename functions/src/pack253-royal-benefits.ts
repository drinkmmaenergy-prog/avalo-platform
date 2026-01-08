/**
 * PACK 253 — ROYAL BENEFITS INTEGRATION
 * Hooks Royal benefits into existing monetization systems
 */

import { db } from './init';
import { logger } from 'firebase-functions/v2';
import { ROYAL_BENEFITS } from './pack253-royal-types';

/**
 * Calculate tokens for chat message based on Royal status
 * Royal: 7 words = 1 token
 * Standard: 11 words = 1 token
 */
export async function calculateChatTokens(
  creatorId: string,
  message: string
): Promise<number> {
  // Check if creator is Royal
  const statusDoc = await db.collection('royal_status').doc(creatorId).get();
  const isRoyal = statusDoc.exists && statusDoc.data()?.isRoyal === true;

  const wordCount = message.trim().split(/\s+/).length;
  
  if (isRoyal) {
    // Royal creators: 7 words = 1 token
    return Math.ceil(wordCount / ROYAL_BENEFITS.EARNINGS_RATIO);
  } else {
    // Standard creators: 11 words = 1 token
    return Math.ceil(wordCount / 11);
  }
}

/**
 * Get chat entry price for a creator
 * Royal creators can set custom prices between 100-500 tokens
 * Standard creators have no entry price (free to start)
 */
export async function getChatEntryPrice(creatorId: string): Promise<number> {
  // Check if creator is Royal
  const statusDoc = await db.collection('royal_status').doc(creatorId).get();
  if (!statusDoc.exists || !statusDoc.data()?.isRoyal) {
    return 0; // Standard creators have free chat
  }

  // Check for custom pricing
  const pricingDoc = await db.collection('royal_pricing').doc(creatorId).get();
  if (pricingDoc.exists && pricingDoc.data()?.isActive) {
    return pricingDoc.data()?.chatPrice || 0;
  }

  return 0; // Royal can choose not to set entry price
}

/**
 * Apply Royal priority to inbox sorting
 * Royal creators appear first in inboxes
 */
export async function applyInboxPriority(
  chatId: string,
  creatorId: string
): Promise<number> {
  const statusDoc = await db.collection('royal_status').doc(creatorId).get();
  const isRoyal = statusDoc.exists && statusDoc.data()?.isRoyal === true;

  if (isRoyal) {
    return ROYAL_BENEFITS.INBOX_PRIORITY; // Priority = 1 (always first)
  }

  return 10; // Standard priority
}

/**
 * Apply Royal discovery boost to profile ranking
 * Royal creators get top 10% ranking boost
 */
export async function applyDiscoveryBoost(
  userId: string,
  baseScore: number
): Promise<number> {
  const statusDoc = await db.collection('royal_status').doc(userId).get();
  const isRoyal = statusDoc.exists && statusDoc.data()?.isRoyal === true;

  if (isRoyal) {
    // Boost to top 10%
    // Add significant boost to ensure they rank in top tier
    return baseScore * 2.5;
  }

  return baseScore;
}

/**
 * Check if user has Royal badge visibility
 */
export async function hasRoyalBadge(userId: string): Promise<boolean> {
  const statusDoc = await db.collection('royal_status').doc(userId).get();
  
  if (!statusDoc.exists) {
    return false;
  }

  const status = statusDoc.data();
  return status?.isRoyal === true;
}

/**
 * Get Royal badge data for display
 */
export async function getRoyalBadgeData(userId: string): Promise<{
  hasRoyal: boolean;
  isDormant: boolean;
  royalSince: number | null;
  daysAsRoyal: number;
} | null> {
  const statusDoc = await db.collection('royal_status').doc(userId).get();
  
  if (!statusDoc.exists) {
    return null;
  }

  const status = statusDoc.data();
  const now = Date.now();
  const daysAsRoyal = status?.royalSince 
    ? Math.floor((now - status.royalSince) / (24 * 60 * 60 * 1000))
    : 0;

  return {
    hasRoyal: status?.isRoyal === true,
    isDormant: status?.isDormant === true,
    royalSince: status?.royalSince || null,
    daysAsRoyal,
  };
}

/**
 * Integration with chat monetization
 * Called when a chat message is sent to calculate cost
 */
export async function calculateChatMessageCost(
  chatId: string,
  creatorId: string,
  message: string
): Promise<{
  tokens: number;
  isRoyalCreator: boolean;
  wordsPerToken: number;
}> {
  const statusDoc = await db.collection('royal_status').doc(creatorId).get();
  const isRoyal = statusDoc.exists && statusDoc.data()?.isRoyal === true;

  const wordCount = message.trim().split(/\s+/).length;
  const wordsPerToken = isRoyal ? ROYAL_BENEFITS.EARNINGS_RATIO : 11;
  const tokens = Math.ceil(wordCount / wordsPerToken);

  logger.info(`Calculated chat cost for ${chatId}`, {
    creatorId,
    isRoyal,
    wordCount,
    wordsPerToken,
    tokens,
  });

  return {
    tokens,
    isRoyalCreator: isRoyal,
    wordsPerToken,
  };
}

/**
 * Integration with discovery feed
 * Called when building discovery feed to apply Royal boost
 */
export async function rankProfileForDiscovery(
  userId: string,
  profileScore: number,
  userPreferences: Record<string, any>
): Promise<number> {
  const statusDoc = await db.collection('royal_status').doc(userId).get();
  const isRoyal = statusDoc.exists && statusDoc.data()?.isRoyal === true;

  let finalScore = profileScore;

  if (isRoyal) {
    // Royal creators get significant boost to appear in top 10%
    finalScore = profileScore * 2.5;
    
    logger.info(`Applied Royal discovery boost to profile ${userId}`, {
      originalScore: profileScore,
      boostedScore: finalScore,
    });
  }

  return finalScore;
}

/**
 * Integration with inbox sorting
 * Called when building user's inbox to prioritize Royal creators
 */
export async function sortInboxChats(
  chats: Array<{ id: string; creatorId: string; lastMessageAt: number }>
): Promise<Array<{ id: string; creatorId: string; lastMessageAt: number; priority: number }>> {
  const chatsWithPriority = await Promise.all(
    chats.map(async (chat) => {
      const priority = await applyInboxPriority(chat.id, chat.creatorId);
      return { ...chat, priority };
    })
  );

  // Sort by priority first (lower = higher priority), then by time
  chatsWithPriority.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return b.lastMessageAt - a.lastMessageAt;
  });

  return chatsWithPriority;
}

/**
 * Validate chat entry requirements
 * Called before allowing a user to start or view a chat
 */
export async function validateChatEntry(
  userId: string,
  creatorId: string,
  userTokenBalance: number
): Promise<{
  canEnter: boolean;
  requiredTokens: number;
  isRoyalCreator: boolean;
  reason?: string;
}> {
  const entryPrice = await getChatEntryPrice(creatorId);
  const statusDoc = await db.collection('royal_status').doc(creatorId).get();
  const isRoyal = statusDoc.exists && statusDoc.data()?.isRoyal === true;

  if (entryPrice === 0) {
    return {
      canEnter: true,
      requiredTokens: 0,
      isRoyalCreator: isRoyal,
    };
  }

  if (userTokenBalance < entryPrice) {
    return {
      canEnter: false,
      requiredTokens: entryPrice,
      isRoyalCreator: isRoyal,
      reason: `Insufficient tokens. This Royal creator requires ${entryPrice} tokens to start a chat.`,
    };
  }

  return {
    canEnter: true,
    requiredTokens: entryPrice,
    isRoyalCreator: isRoyal,
  };
}

/**
 * Process chat entry payment
 * Called when user starts chat with Royal creator with entry price
 */
export async function processChatEntryPayment(
  userId: string,
  creatorId: string,
  chatId: string
): Promise<{
  success: boolean;
  tokensCharged: number;
  error?: string;
}> {
  try {
    const entryPrice = await getChatEntryPrice(creatorId);
    
    if (entryPrice === 0) {
      return { success: true, tokensCharged: 0 };
    }

    // Get user token balance
    const userDoc = await db.collection('token_balances').doc(userId).get();
    const balance = userDoc.exists ? userDoc.data()?.balance || 0 : 0;

    if (balance < entryPrice) {
      return {
        success: false,
        tokensCharged: 0,
        error: 'Insufficient token balance',
      };
    }

    // Deduct tokens from user
    await db.collection('token_balances').doc(userId).update({
      balance: balance - entryPrice,
      updatedAt: Date.now(),
    });

    // Record transaction
    await db.collection('token_transactions').add({
      userId,
      creatorId,
      chatId,
      type: 'chat_entry',
      amount: -entryPrice,
      balance: balance - entryPrice,
      createdAt: Date.now(),
    });

    // Credit creator (via earnings system)
    const netCreatorTokens = Math.floor(entryPrice * 0.65); // 65% to creator
    await db.collection('earnings_ledger').add({
      creatorId,
      sourceType: 'CHAT_ENTRY',
      sourceId: chatId,
      fromUserId: userId,
      grossTokens: entryPrice,
      netTokensCreator: netCreatorTokens,
      commissionAvalo: entryPrice - netCreatorTokens,
      createdAt: Date.now(),
      metadata: {
        chatId,
        isRoyalEntry: true,
      },
    });

    logger.info(`Processed Royal chat entry payment`, {
      userId,
      creatorId,
      chatId,
      entryPrice,
    });

    return { success: true, tokensCharged: entryPrice };
  } catch (error: any) {
    logger.error('Error processing chat entry payment', error);
    return {
      success: false,
      tokensCharged: 0,
      error: error.message,
    };
  }
}

/**
 * Get Royal benefits summary for UI display
 */
export async function getRoyalBenefitsSummary(userId: string): Promise<{
  hasRoyal: boolean;
  benefits: {
    earningsRatio: string;
    canSetChatPrice: boolean;
    chatPriceRange: string;
    hasPriorityInbox: boolean;
    hasDiscoveryBoost: boolean;
    hasRoyalBadge: boolean;
    hasRoyalEvents: boolean;
    hasRoyalAnalytics: boolean;
  };
  currentSettings?: {
    chatPrice: number | null;
  };
}> {
  const statusDoc = await db.collection('royal_status').doc(userId).get();
  const isRoyal = statusDoc.exists && statusDoc.data()?.isRoyal === true;

  if (!isRoyal) {
    return {
      hasRoyal: false,
      benefits: {
        earningsRatio: '11 words = 1 token',
        canSetChatPrice: false,
        chatPriceRange: 'N/A',
        hasPriorityInbox: false,
        hasDiscoveryBoost: false,
        hasRoyalBadge: false,
        hasRoyalEvents: false,
        hasRoyalAnalytics: false,
      },
    };
  }

  const pricingDoc = await db.collection('royal_pricing').doc(userId).get();
  const chatPrice = pricingDoc.exists ? pricingDoc.data()?.chatPrice : null;

  return {
    hasRoyal: true,
    benefits: {
      earningsRatio: `${ROYAL_BENEFITS.EARNINGS_RATIO} words = 1 token`,
      canSetChatPrice: true,
      chatPriceRange: `${ROYAL_BENEFITS.MIN_CHAT_PRICE}-${ROYAL_BENEFITS.MAX_CHAT_PRICE} tokens`,
      hasPriorityInbox: true,
      hasDiscoveryBoost: true,
      hasRoyalBadge: true,
      hasRoyalEvents: true,
      hasRoyalAnalytics: true,
    },
    currentSettings: {
      chatPrice,
    },
  };
}