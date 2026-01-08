/**
 * PACK 81 — Earnings Integration Layer
 * Helper functions to integrate earnings ledger into existing payment modules
 */

import { recordEarning, EarningSourceType } from './creatorEarnings';
import { logger } from 'firebase-functions/v2';

/**
 * Record gift earning in ledger
 * Called from PACK 79 gift functions
 */
export async function recordGiftEarning(params: {
  receiverId: string;
  senderId: string;
  giftId: string;
  giftName: string;
  priceTokens: number;
  transactionId: string;
  chatId: string;
}): Promise<void> {
  try {
    await recordEarning({
      creatorId: params.receiverId,
      sourceType: 'GIFT',
      sourceId: params.transactionId,
      fromUserId: params.senderId,
      grossTokens: params.priceTokens,
      metadata: {
        giftId: params.giftId,
        giftName: params.giftName,
        chatId: params.chatId,
      },
    });

    logger.info(`Gift earning recorded in ledger: ${params.transactionId}`);
  } catch (error) {
    logger.error('Failed to record gift earning in ledger', error);
    // Don't throw - ledger is for reporting only, shouldn't fail the transaction
  }
}

/**
 * Record premium story unlock earning in ledger
 * Called from PACK 78 premium stories functions
 */
export async function recordStoryEarning(params: {
  creatorId: string;
  buyerId: string;
  storyId: string;
  priceTokens: number;
  unlockId: string;
}): Promise<void> {
  try {
    await recordEarning({
      creatorId: params.creatorId,
      sourceType: 'PREMIUM_STORY',
      sourceId: params.unlockId,
      fromUserId: params.buyerId,
      grossTokens: params.priceTokens,
      metadata: {
        storyId: params.storyId,
      },
    });

    logger.info(`Story earning recorded in ledger: ${params.unlockId}`);
  } catch (error) {
    logger.error('Failed to record story earning in ledger', error);
  }
}

/**
 * Record paid media unlock earning in ledger
 * Called from PACK 80 paid media functions
 */
export async function recordPaidMediaEarning(params: {
  creatorId: string;
  buyerId: string;
  mediaId: string;
  priceTokens: number;
  transactionId: string;
  chatId: string;
  mediaType: 'image' | 'video';
}): Promise<void> {
  try {
    await recordEarning({
      creatorId: params.creatorId,
      sourceType: 'PAID_MEDIA',
      sourceId: params.transactionId,
      fromUserId: params.buyerId,
      grossTokens: params.priceTokens,
      metadata: {
        mediaId: params.mediaId,
        chatId: params.chatId,
        mediaType: params.mediaType,
      },
    });

    logger.info(`Paid media earning recorded in ledger: ${params.transactionId}`);
  } catch (error) {
    logger.error('Failed to record paid media earning in ledger', error);
  }
}

/**
 * Record paid call earning in ledger
 * Can be integrated with future call monetization
 */
export async function recordCallEarning(params: {
  creatorId: string;
  callerId: string;
  callId: string;
  tokensCharged: number;
  durationSeconds: number;
}): Promise<void> {
  try {
    await recordEarning({
      creatorId: params.creatorId,
      sourceType: 'PAID_CALL',
      sourceId: params.callId,
      fromUserId: params.callerId,
      grossTokens: params.tokensCharged,
      metadata: {
        callId: params.callId,
        durationSeconds: params.durationSeconds,
      },
    });

    logger.info(`Call earning recorded in ledger: ${params.callId}`);
  } catch (error) {
    logger.error('Failed to record call earning in ledger', error);
  }
}

/**
 * Record AI companion earning in ledger
 * Can be integrated with AI chat monetization
 */
export async function recordAIEarning(params: {
  creatorId: string;
  userId: string;
  conversationId: string;
  tokensCharged: number;
  messageCount: number;
}): Promise<void> {
  try {
    await recordEarning({
      creatorId: params.creatorId,
      sourceType: 'AI_COMPANION',
      sourceId: params.conversationId,
      fromUserId: params.userId,
      grossTokens: params.tokensCharged,
      metadata: {
        conversationId: params.conversationId,
        messageCount: params.messageCount,
      },
    });

    logger.info(`AI earning recorded in ledger: ${params.conversationId}`);
  } catch (error) {
    logger.error('Failed to record AI earning in ledger', error);
  }
}