/**
 * PACK 79 — In-Chat Paid Gifts
 * Service: Gift Service
 * Handles gift operations including sending gifts and validation
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import {
  SendGiftRequest,
  SendGiftResponse,
  GiftErrorCode,
  validateGiftTransaction,
  formatGiftError,
  GiftCatalog,
} from '../types/gifts';

/**
 * Send a gift to another user
 */
export async function sendGift(
  giftId: string,
  receiverId: string,
  chatId: string,
  senderId: string,
  gift: GiftCatalog | null
): Promise<SendGiftResponse> {
  try {
    // Client-side validation
    const validation = validateGiftTransaction(senderId, receiverId, gift);
    
    if (!validation.valid) {
      return {
        success: false,
        error: formatGiftError(validation.error!),
        errorCode: validation.error,
      };
    }

    // Call Firebase Function
    const sendGiftFunction = httpsCallable<SendGiftRequest, SendGiftResponse>(
      functions,
      'sendGift'
    );

    const result = await sendGiftFunction({
      giftId,
      receiverId,
      chatId,
    });

    if (result.data.success) {
      return {
        success: true,
        transactionId: result.data.transactionId,
      };
    } else {
      return {
        success: false,
        error: result.data.error || 'Failed to send gift',
        errorCode: result.data.errorCode,
      };
    }
  } catch (error: any) {
    console.error('Error sending gift:', error);

    // Parse Firebase error
    const errorCode = parseFirebaseError(error);
    const errorMessage = formatGiftError(errorCode);

    return {
      success: false,
      error: errorMessage,
      errorCode,
    };
  }
}

/**
 * Parse Firebase error into GiftErrorCode
 */
function parseFirebaseError(error: any): GiftErrorCode {
  const message = error?.message || '';
  const code = error?.code || '';
  const details = error?.details || {};

  // Check error codes from Firebase
  if (code === 'unauthenticated') {
    return GiftErrorCode.UNAUTHORIZED;
  }

  if (code === 'resource-exhausted') {
    return GiftErrorCode.RATE_LIMIT;
  }

  // Check error details from backend
  if (details.errorCode) {
    return details.errorCode as GiftErrorCode;
  }

  // Parse message for specific errors
  if (message.includes('insufficient tokens') || message.includes('Insufficient tokens')) {
    return GiftErrorCode.INSUFFICIENT_TOKENS;
  }

  if (message.includes('self') || message.includes('yourself')) {
    return GiftErrorCode.SELF_GIFTING;
  }

  if (message.includes('not found') || message.includes('Gift not found')) {
    return GiftErrorCode.INVALID_GIFT;
  }

  if (message.includes('unavailable') || message.includes('inactive')) {
    return GiftErrorCode.GIFT_INACTIVE;
  }

  if (message.includes('rate') || message.includes('too quickly')) {
    return GiftErrorCode.RATE_LIMIT;
  }

  if (message.includes('Chat not found')) {
    return GiftErrorCode.CHAT_NOT_FOUND;
  }

  if (message.includes('Receiver') || message.includes('receiver')) {
    return GiftErrorCode.INVALID_RECEIVER;
  }

  // Default to transaction failed
  return GiftErrorCode.TRANSACTION_FAILED;
}

/**
 * Check if user can afford a gift
 */
export function canAffordGift(userTokens: number, giftPrice: number): boolean {
  return userTokens >= giftPrice;
}

/**
 * Calculate how many tokens short the user is
 */
export function tokensNeeded(userTokens: number, giftPrice: number): number {
  const needed = giftPrice - userTokens;
  return needed > 0 ? needed : 0;
}

/**
 * Validate gift before attempting to send
 */
export function validateGiftBeforeSend(
  senderId: string,
  receiverId: string,
  gift: GiftCatalog | null,
  userTokens: number
): { valid: boolean; errorCode?: GiftErrorCode; errorMessage?: string } {
  // Check if gift exists
  if (!gift) {
    return {
      valid: false,
      errorCode: GiftErrorCode.INVALID_GIFT,
      errorMessage: formatGiftError(GiftErrorCode.INVALID_GIFT),
    };
  }

  // Check if gift is active
  if (!gift.isActive) {
    return {
      valid: false,
      errorCode: GiftErrorCode.GIFT_INACTIVE,
      errorMessage: formatGiftError(GiftErrorCode.GIFT_INACTIVE),
    };
  }

  // Check self-gifting
  if (senderId === receiverId) {
    return {
      valid: false,
      errorCode: GiftErrorCode.SELF_GIFTING,
      errorMessage: formatGiftError(GiftErrorCode.SELF_GIFTING),
    };
  }

  // Check token balance
  if (!canAffordGift(userTokens, gift.priceTokens)) {
    return {
      valid: false,
      errorCode: GiftErrorCode.INSUFFICIENT_TOKENS,
      errorMessage: formatGiftError(GiftErrorCode.INSUFFICIENT_TOKENS),
    };
  }

  return { valid: true };
}

/**
 * Format gift price for display
 */
export function formatGiftPrice(priceTokens: number): string {
  return `${priceTokens.toLocaleString()} tokens`;
}

/**
 * Calculate earnings for receiver
 */
export function calculateReceiverEarnings(priceTokens: number): number {
  const avaloCommission = Math.floor(priceTokens * 0.35);
  return priceTokens - avaloCommission;
}

/**
 * Get gift category emoji
 */
export function getGiftCategoryEmoji(category?: string): string {
  const emojiMap: Record<string, string> = {
    hearts: '💖',
    crowns: '👑',
    flowers: '🌹',
    gems: '💎',
    money: '💰',
    stars: '⭐',
    fire: '🔥',
    magic: '✨',
    animals: '🐾',
    food: '🍰',
  };

  return category ? emojiMap[category] || '🎁' : '🎁';
}

/**
 * Build gift message text for chat
 */
export function buildGiftMessageText(
  senderName: string,
  giftName: string
): string {
  return `💎 ${senderName} sent "${giftName}"`;
}

/**
 * Build earnings toast message
 */
export function buildEarningsMessage(tokensEarned: number): string {
  return `You earned ${tokensEarned} tokens from a gift! 🎁`;
}