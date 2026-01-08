/**
 * PACK 80 — Paid Media Cloud Functions
 * Firebase Functions for sending and unlocking paid media
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, increment, auth } from './init';
import { recordPaidMediaEarning } from './earningsIntegration';
// Push notifications - implement based on your notification service
async function sendPushNotification(
  userId: string,
  notification: {
    title: string;
    body: string;
    data?: Record<string, string>;
  }
): Promise<void> {
  try {
    // TODO: Implement push notification sending
    // This could use FCM, Expo Push Notifications, or your notification service
    console.log('[sendPushNotification] Sending notification to:', userId, notification);
  } catch (error) {
    console.error('[sendPushNotification] Error:', error);
  }
}

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface SendPaidMediaRequest {
  chatId: string;
  recipientId: string;
  mediaType: 'image' | 'video';
  priceTokens: number;
  mediaUrl: string;
  thumbnailUrl: string;
  storagePath: string;
  messageId: string;
  mediaWidth?: number;
  mediaHeight?: number;
  mediaDuration?: number;
  compressedSize?: number;
  originalSize?: number;
}

interface SendPaidMediaResponse {
  success: boolean;
  mediaId?: string;
  error?: string;
  errorCode?: string;
}

interface UnlockPaidMediaRequest {
  mediaId: string;
  chatId: string;
}

interface UnlockPaidMediaResponse {
  success: boolean;
  mediaUrl?: string;
  transactionId?: string;
  error?: string;
  errorCode?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const AVALO_COMMISSION = 0.35;
const CREATOR_SHARE = 0.65;

const MIN_PRICE = 5;
const MAX_PRICE = 10000;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate price range
 */
function validatePrice(price: number): { valid: boolean; error?: string } {
  if (!Number.isInteger(price)) {
    return { valid: false, error: 'Price must be a whole number' };
  }

  if (price < MIN_PRICE) {
    return { valid: false, error: `Minimum price is ${MIN_PRICE} tokens` };
  }

  if (price > MAX_PRICE) {
    return { valid: false, error: `Maximum price is ${MAX_PRICE} tokens` };
  }

  return { valid: true };
}

/**
 * Calculate commission split
 */
function calculateCommission(priceTokens: number): {
  avaloFee: number;
  creatorAmount: number;
} {
  const avaloFee = Math.floor(priceTokens * AVALO_COMMISSION);
  const creatorAmount = priceTokens - avaloFee;

  return { avaloFee, creatorAmount };
}

/**
 * Get user's token balance
 */
async function getUserBalance(userId: string): Promise<number> {
  try {
    const walletRef = db.doc(`balances/${userId}/wallet`);
    const walletSnap = await walletRef.get();

    if (!walletSnap.exists) {
      return 0;
    }

    return walletSnap.data()?.tokens || 0;
  } catch (error) {
    console.error('[paidMedia] Error getting user balance:', error);
    return 0;
  }
}

/**
 * Deduct tokens from user wallet
 */
async function deductTokens(userId: string, amount: number): Promise<void> {
  const walletRef = db.doc(`balances/${userId}/wallet`);
  await walletRef.update({
    tokens: increment(-amount),
    lastUpdated: serverTimestamp(),
  });
}

/**
 * Add tokens to user wallet
 */
async function addTokens(userId: string, amount: number): Promise<void> {
  const walletRef = db.doc(`balances/${userId}/wallet`);
  
  const walletSnap = await walletRef.get();
  
  if (!walletSnap.exists) {
    await walletRef.set({
      tokens: amount,
      lastUpdated: serverTimestamp(),
    });
  } else {
    await walletRef.update({
      tokens: increment(amount),
      lastUpdated: serverTimestamp(),
    });
  }
}

/**
 * Record a transaction
 */
async function recordTransaction(
  senderId: string,
  receiverId: string,
  tokensAmount: number,
  avaloFee: number,
  mediaId: string,
  chatId: string
): Promise<string> {
  const transactionRef = await db.collection('transactions').add({
    senderUid: senderId,
    receiverUid: receiverId,
    tokensAmount,
    avaloFee,
    mediaId,
    chatId,
    transactionType: 'paid_media_unlock',
    createdAt: serverTimestamp(),
  });

  return transactionRef.id;
}

// ============================================================================
// CLOUD FUNCTION: sendPaidMediaMessage
// ============================================================================

export const sendPaidMediaMessage = functions.https.onCall(
  async (data: SendPaidMediaRequest, context): Promise<SendPaidMediaResponse> => {
    try {
      // Verify authentication
      if (!context.auth) {
        return {
          success: false,
          error: 'Unauthorized',
          errorCode: 'UNAUTHORIZED',
        };
      }

      const senderId = context.auth.uid;
      const {
        chatId,
        recipientId,
        mediaType,
        priceTokens,
        mediaUrl,
        thumbnailUrl,
        storagePath,
        messageId,
        mediaWidth,
        mediaHeight,
        mediaDuration,
        compressedSize,
        originalSize,
      } = data;

      // Validate required fields
      if (!chatId || !recipientId || !mediaType || !priceTokens || !mediaUrl || !thumbnailUrl) {
        return {
          success: false,
          error: 'Missing required fields',
          errorCode: 'INVALID_REQUEST',
        };
      }

      // Validate price
      const priceValidation = validatePrice(priceTokens);
      if (!priceValidation.valid) {
        return {
          success: false,
          error: priceValidation.error,
          errorCode: 'INVALID_PRICE',
        };
      }

      // Prevent self-sending
      if (senderId === recipientId) {
        return {
          success: false,
          error: 'Cannot send paid media to yourself',
          errorCode: 'SELF_UNLOCK',
        };
      }

      // Verify chat exists and user is participant
      const chatRef = db.doc(`chats/${chatId}`);
      const chatSnap = await chatRef.get();

      if (!chatSnap.exists) {
        return {
          success: false,
          error: 'Chat not found',
          errorCode: 'CHAT_NOT_FOUND',
        };
      }

      const chatData = chatSnap.data();
      const participants = chatData?.participants || [];

      if (!participants.includes(senderId) || !participants.includes(recipientId)) {
        return {
          success: false,
          error: 'User is not a participant in this chat',
          errorCode: 'UNAUTHORIZED',
        };
      }

      // Create paid media message document
      const mediaRef = await db.collection('paid_media_messages').add({
        id: messageId,
        chatId,
        senderId,
        recipientId,
        mediaUrl,
        mediaType,
        priceTokens,
        thumbnailUrl,
        storagePath,
        status: 'ready',
        mediaWidth,
        mediaHeight,
        mediaDuration,
        compressedSize,
        originalSize,
        createdAt: serverTimestamp(),
      });

      console.log('[sendPaidMediaMessage] Created paid media message:', mediaRef.id);

      // Create chat message reference
      const messageRef = db.doc(`chats/${chatId}/messages/${messageId}`);
      await messageRef.set({
        id: messageId,
        senderId,
        receiverId: recipientId,
        text: '🔒 Locked media',
        mediaType,
        payToUnlock: true,
        unlockPriceTokens: priceTokens,
        mediaRemoteUrl: thumbnailUrl,
        paidMediaId: mediaRef.id,
        status: 'synced',
        createdAt: serverTimestamp(),
        serverCreatedAt: serverTimestamp(),
      });

      // Update chat's last message
      await chatRef.update({
        lastMessageAt: serverTimestamp(),
        lastMessage: {
          id: messageId,
          senderId,
          text: '🔒 Locked media',
          createdAt: serverTimestamp(),
        },
      });

      return {
        success: true,
        mediaId: mediaRef.id,
      };
    } catch (error: any) {
      console.error('[sendPaidMediaMessage] Error:', error);
      return {
        success: false,
        error: error.message || 'Failed to send paid media',
        errorCode: 'TRANSACTION_FAILED',
      };
    }
  }
);

// ============================================================================
// CLOUD FUNCTION: unlockPaidMedia
// ============================================================================

export const unlockPaidMedia = functions.https.onCall(
  async (data: UnlockPaidMediaRequest, context): Promise<UnlockPaidMediaResponse> => {
    try {
      // Verify authentication
      if (!context.auth) {
        return {
          success: false,
          error: 'Unauthorized',
          errorCode: 'UNAUTHORIZED',
        };
      }

      const buyerId = context.auth.uid;
      const { mediaId, chatId } = data;

      // Validate required fields
      if (!mediaId || !chatId) {
        return {
          success: false,
          error: 'Missing required fields',
          errorCode: 'INVALID_REQUEST',
        };
      }

      // Get paid media document
      const mediaRef = db.doc(`paid_media_messages/${mediaId}`);
      const mediaSnap = await mediaRef.get();

      if (!mediaSnap.exists) {
        return {
          success: false,
          error: 'Media not found',
          errorCode: 'MEDIA_NOT_FOUND',
        };
      }

      const mediaData = mediaSnap.data();
      if (!mediaData) {
        return {
          success: false,
          error: 'Media data not found',
          errorCode: 'MEDIA_NOT_FOUND',
        };
      }

      const { senderId, priceTokens, mediaUrl } = mediaData;

      // Prevent self-unlocking
      if (buyerId === senderId) {
        return {
          success: false,
          error: 'You cannot unlock your own media',
          errorCode: 'SELF_UNLOCK',
        };
      }

      // Check if already unlocked
      const existingUnlock = await db
        .collection('paid_media_unlocks')
        .where('userId', '==', buyerId)
        .where('mediaId', '==', mediaId)
        .limit(1)
        .get();

      if (!existingUnlock.empty) {
        return {
          success: false,
          error: 'You have already unlocked this media',
          errorCode: 'ALREADY_UNLOCKED',
        };
      }

      // Check buyer's token balance
      const buyerBalance = await getUserBalance(buyerId);
      if (buyerBalance < priceTokens) {
        return {
          success: false,
          error: `Insufficient tokens. Required: ${priceTokens}, Available: ${buyerBalance}`,
          errorCode: 'INSUFFICIENT_TOKENS',
        };
      }

      // Calculate commission split
      const { avaloFee, creatorAmount } = calculateCommission(priceTokens);

      // Use transaction to ensure atomicity
      const batch = db.batch();

      // Deduct from buyer
      const buyerWalletRef = db.doc(`balances/${buyerId}/wallet`);
      batch.update(buyerWalletRef, {
        tokens: increment(-priceTokens),
        lastUpdated: serverTimestamp(),
      });

      // Add to creator (seller)
      const creatorWalletRef = db.doc(`balances/${senderId}/wallet`);
      const creatorWalletSnap = await creatorWalletRef.get();
      
      if (!creatorWalletSnap.exists) {
        batch.set(creatorWalletRef, {
          tokens: creatorAmount,
          lastUpdated: serverTimestamp(),
        });
      } else {
        batch.update(creatorWalletRef, {
          tokens: increment(creatorAmount),
          lastUpdated: serverTimestamp(),
        });
      }

      // Create unlock record
      const unlockRef = db.collection('paid_media_unlocks').doc();
      batch.set(unlockRef, {
        userId: buyerId,
        mediaId,
        chatId,
        tokensSpent: priceTokens,
        unlockedAt: serverTimestamp(),
      });

      // Commit transaction
      await batch.commit();

      // Record transaction (after batch to avoid conflicts)
      const transactionId = await recordTransaction(
        buyerId,
        senderId,
        priceTokens,
        avaloFee,
        mediaId,
        chatId
      );

      console.log('[unlockPaidMedia] Media unlocked successfully:', {
        mediaId,
        buyerId,
        senderId,
        priceTokens,
        transactionId,
      });

      // Send push notification to seller (non-blocking)
      sendPushNotification(senderId, {
        title: 'Media Unlocked! 💰',
        body: `You earned ${creatorAmount} tokens from a locked media unlock`,
        data: {
          type: 'paid_media_unlocked',
          mediaId,
          buyerId,
          tokensEarned: creatorAmount.toString(),
          chatId,
        },
      }).catch((error) => {
        console.error('[unlockPaidMedia] Error sending notification:', error);
      });

      // Record earning in ledger (PACK 81)
      recordPaidMediaEarning({
        creatorId: senderId,
        buyerId,
        mediaId,
        priceTokens,
        transactionId,
        chatId,
        mediaType: mediaData.mediaType,
      }).catch((error) => {
        console.error('[unlockPaidMedia] Error recording in earnings ledger:', error);
      });

      return {
        success: true,
        mediaUrl,
        transactionId,
      };
    } catch (error: any) {
      console.error('[unlockPaidMedia] Error:', error);
      return {
        success: false,
        error: error.message || 'Failed to unlock media',
        errorCode: 'TRANSACTION_FAILED',
      };
    }
  }
);

// ============================================================================
// CLOUD FUNCTION: cleanupDeletedMedia (CRON)
// ============================================================================

/**
 * Optional CRON job to clean up media when sender deletes account
 * Schedule: Every day at 3 AM
 */
export const cleanupDeletedMedia = functions.pubsub
  .schedule('0 3 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    try {
      console.log('[cleanupDeletedMedia] Starting cleanup job');

      const batch = db.batch();
      let deletedCount = 0;

      // Get all paid media messages
      const mediaSnapshot = await db.collection('paid_media_messages').get();

      for (const mediaDoc of mediaSnapshot.docs) {
        const mediaData = mediaDoc.data();
        const senderId = mediaData.senderId;

        try {
          // Check if sender account still exists
          await auth.getUser(senderId);
        } catch (error: any) {
          // User doesn't exist, mark for deletion
          if (error.code === 'auth/user-not-found') {
            console.log('[cleanupDeletedMedia] Deleting media for deleted user:', senderId);
            
            // Delete the media document
            batch.delete(mediaDoc.ref);
            
            // Delete associated unlocks
            const unlocksSnapshot = await db
              .collection('paid_media_unlocks')
              .where('mediaId', '==', mediaDoc.id)
              .get();

            unlocksSnapshot.docs.forEach((unlockDoc) => {
              batch.delete(unlockDoc.ref);
            });

            deletedCount++;

            // Commit in batches of 500
            if (deletedCount % 500 === 0) {
              await batch.commit();
            }
          }
        }
      }

      // Commit remaining deletes
      if (deletedCount % 500 !== 0) {
        await batch.commit();
      }

      console.log('[cleanupDeletedMedia] Cleanup complete. Deleted:', deletedCount);
      return { deletedCount };
    } catch (error) {
      console.error('[cleanupDeletedMedia] Error:', error);
      throw error;
    }
  });

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  sendPaidMediaMessage,
  unlockPaidMedia,
  cleanupDeletedMedia,
};