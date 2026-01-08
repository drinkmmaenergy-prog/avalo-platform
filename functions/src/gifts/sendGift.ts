/**
 * PACK 79 — In-Chat Paid Gifts
 * Firebase Function: sendGift
 * Handles gift sending with token payment and commission split
 */

import * as functions from 'firebase-functions';
import { v4 as uuidv4 } from 'uuid';
import { db, admin, serverTimestamp, increment } from '../init';
import { recordGiftEarning } from '../earningsIntegration';

const FieldValue = { serverTimestamp, increment };

/**
 * Commission split configuration (non-negotiable)
 */
const AVALO_COMMISSION_PERCENTAGE = 0.35;
const RECEIVER_COMMISSION_PERCENTAGE = 0.65;

/**
 * Rate limiting configuration
 */
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_GIFTS_PER_MINUTE = 10;

/**
 * Gift error codes
 */
enum GiftErrorCode {
  INSUFFICIENT_TOKENS = 'insufficient_tokens',
  INVALID_GIFT = 'invalid_gift',
  SELF_GIFTING = 'self_gifting',
  GIFT_INACTIVE = 'gift_inactive',
  RATE_LIMIT = 'rate_limit',
  TRANSACTION_FAILED = 'transaction_failed',
  UNAUTHORIZED = 'unauthorized',
  INVALID_RECEIVER = 'invalid_receiver',
  CHAT_NOT_FOUND = 'chat_not_found',
}

/**
 * Rate limiting tracker
 */
const recentGifts = new Map<string, number[]>();

/**
 * Check rate limit for user
 */
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userGifts = recentGifts.get(userId) || [];
  
  // Remove old timestamps outside the window
  const recentTimestamps = userGifts.filter(
    timestamp => now - timestamp < RATE_LIMIT_WINDOW_MS
  );
  
  if (recentTimestamps.length >= MAX_GIFTS_PER_MINUTE) {
    return false;
  }
  
  // Update tracker
  recentTimestamps.push(now);
  recentGifts.set(userId, recentTimestamps);
  
  return true;
}

/**
 * Calculate commission split
 */
function calculateCommission(priceTokens: number): {
  avaloCommission: number;
  receiverEarnings: number;
} {
  const avaloCommission = Math.floor(priceTokens * AVALO_COMMISSION_PERCENTAGE);
  const receiverEarnings = priceTokens - avaloCommission;
  
  return { avaloCommission, receiverEarnings };
}

/**
 * Send Gift Callable Function
 */
export const sendGift = functions.https.onCall(async (data, context) => {
  // 1. Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to send gifts',
      { errorCode: GiftErrorCode.UNAUTHORIZED }
    );
  }

  const senderId = context.auth.uid;
  const { giftId, receiverId, chatId } = data;

  // 2. Validate input parameters
  if (!giftId || !receiverId || !chatId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required parameters: giftId, receiverId, chatId'
    );
  }

  // 3. Prevent self-gifting
  if (senderId === receiverId) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Cannot send gift to yourself',
      { errorCode: GiftErrorCode.SELF_GIFTING }
    );
  }

  // 4. Check rate limit
  if (!checkRateLimit(senderId)) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      'You are sending gifts too quickly. Please wait a moment.',
      { errorCode: GiftErrorCode.RATE_LIMIT }
    );
  }

  try {
    // 5. Run transaction to ensure atomic operation
    const result = await db.runTransaction(async (transaction) => {
      // 5a. Fetch gift from catalog
      const giftRef = db.collection('gift_catalog').doc(giftId);
      const giftDoc = await transaction.get(giftRef);

      if (!giftDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Gift not found',
          { errorCode: GiftErrorCode.INVALID_GIFT }
        );
      }

      const gift = giftDoc.data()!;

      // 5b. Verify gift is active
      if (!gift.isActive) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'This gift is currently unavailable',
          { errorCode: GiftErrorCode.GIFT_INACTIVE }
        );
      }

      const priceTokens = gift.priceTokens;

      // 5c. Fetch sender profile
      const senderRef = db.collection('users').doc(senderId);
      const senderDoc = await transaction.get(senderRef);

      if (!senderDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Sender profile not found',
          { errorCode: GiftErrorCode.UNAUTHORIZED }
        );
      }

      const senderData = senderDoc.data()!;
      const senderTokens = senderData.tokens || 0;

      // 5d. Verify sufficient token balance
      if (senderTokens < priceTokens) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Insufficient tokens to send this gift',
          { 
            errorCode: GiftErrorCode.INSUFFICIENT_TOKENS,
            required: priceTokens,
            available: senderTokens
          }
        );
      }

      // 5e. Fetch receiver profile
      const receiverRef = db.collection('users').doc(receiverId);
      const receiverDoc = await transaction.get(receiverRef);

      if (!receiverDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Receiver profile not found',
          { errorCode: GiftErrorCode.INVALID_RECEIVER }
        );
      }

      const receiverData = receiverDoc.data()!;

      // 5f. Verify chat exists and sender is participant
      const chatRef = db.collection('chats').doc(chatId);
      const chatDoc = await transaction.get(chatRef);

      if (!chatDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Chat not found',
          { errorCode: GiftErrorCode.CHAT_NOT_FOUND }
        );
      }

      const chatData = chatDoc.data()!;
      const participants = chatData.participants || [];

      if (!participants.includes(senderId) || !participants.includes(receiverId)) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Both users must be participants in the chat'
        );
      }

      // 5g. Calculate commission split (35% Avalo / 65% Receiver)
      const { avaloCommission, receiverEarnings } = calculateCommission(priceTokens);

      // 5h. Create transaction record
      const transactionId = uuidv4();
      const transactionRef = db.collection('gift_transactions').doc(transactionId);
      
      const transactionData = {
        id: transactionId,
        senderId,
        receiverId,
        chatId,
        giftId,
        priceTokens,
        commissionAvalo: avaloCommission,
        receiverEarnings,
        createdAt: FieldValue.serverTimestamp(),
        status: 'completed',
        metadata: {
          senderName: senderData.displayName || senderData.firstName || 'User',
          receiverName: receiverData.displayName || receiverData.firstName || 'User',
          giftName: gift.name,
          animationUrl: gift.animationUrl,
          imageUrl: gift.imageUrl,
        },
      };

      transaction.set(transactionRef, transactionData);

      // 5i. Deduct tokens from sender
      transaction.update(senderRef, {
        tokens: FieldValue.increment(-priceTokens),
        'stats.tokensSpent': FieldValue.increment(priceTokens),
        'stats.giftsSent': FieldValue.increment(1),
        'stats.lastGiftSentAt': FieldValue.serverTimestamp(),
      });

      // 5j. Add earnings to receiver
      transaction.update(receiverRef, {
        tokens: FieldValue.increment(receiverEarnings),
        'earnings.fromGifts': FieldValue.increment(receiverEarnings),
        'earnings.totalEarnings': FieldValue.increment(receiverEarnings),
        'stats.giftsReceived': FieldValue.increment(1),
        'stats.lastGiftReceivedAt': FieldValue.serverTimestamp(),
      });

      // 5k. Create chat message for gift
      const messageRef = db.collection('chats').doc(chatId).collection('messages').doc();
      transaction.set(messageRef, {
        id: messageRef.id,
        type: 'gift',
        senderId,
        receiverId,
        giftTransactionId: transactionId,
        giftMetadata: {
          giftId,
          giftName: gift.name,
          priceTokens,
          animationUrl: gift.animationUrl,
          imageUrl: gift.imageUrl,
          soundUrl: gift.soundUrl || null,
          transactionId,
        },
        createdAt: FieldValue.serverTimestamp(),
        read: false,
      });

      // 5l. Update chat last message
      transaction.update(chatRef, {
        lastMessage: `${senderData.displayName || 'User'} sent a gift`,
        lastMessageAt: FieldValue.serverTimestamp(),
        lastMessageType: 'gift',
      });

      return {
        transactionId,
        priceTokens,
        receiverEarnings,
        giftName: gift.name,
      };
    });

    // 6. Record earning in ledger (PACK 81)
    try {
      await recordGiftEarning({
        receiverId,
        senderId,
        giftId,
        giftName: result.giftName,
        priceTokens: result.priceTokens,
        transactionId: result.transactionId,
        chatId,
      });
    } catch (ledgerError) {
      console.error('Failed to record gift in earnings ledger:', ledgerError);
      // Don't fail the transaction
    }

    // 7. Send push notification to receiver (outside transaction)
    try {
      await sendGiftNotification(senderId, receiverId, result);
    } catch (notifError) {
      console.error('Failed to send gift notification:', notifError);
      // Don't fail the transaction if notification fails
    }

    // 8. Return success response
    return {
      success: true,
      transactionId: result.transactionId,
      message: 'Gift sent successfully',
    };

  } catch (error: any) {
    console.error('Error sending gift:', error);
    
    // Re-throw HttpsError as-is
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    // Wrap other errors
    throw new functions.https.HttpsError(
      'internal',
      'Failed to send gift',
      { errorCode: GiftErrorCode.TRANSACTION_FAILED, details: error.message }
    );
  }
});

/**
 * Send push notification to receiver
 */
async function sendGiftNotification(
  senderId: string,
  receiverId: string,
  giftData: { giftName: string; receiverEarnings: number; transactionId: string }
): Promise<void> {
  try {
    // Fetch sender data for notification
    const senderDoc = await db.collection('users').doc(senderId).get();
    const senderName = senderDoc.exists 
      ? senderDoc.data()?.displayName || senderDoc.data()?.firstName || 'Someone'
      : 'Someone';

    // Fetch receiver FCM token
    const receiverDoc = await db.collection('users').doc(receiverId).get();
    const fcmToken = receiverDoc.exists ? receiverDoc.data()?.fcmToken : null;

    if (!fcmToken) {
      console.log('No FCM token found for receiver:', receiverId);
      return;
    }

    // Send notification
    const message = {
      token: fcmToken,
      notification: {
        title: '🎁 New Gift Received',
        body: `You received a gift from ${senderName} — you earned ${giftData.receiverEarnings} tokens.`,
      },
      data: {
        type: 'gift_received',
        giftTransactionId: giftData.transactionId,
        senderId,
        senderName,
        tokensEarned: giftData.receiverEarnings.toString(),
        giftName: giftData.giftName,
      },
      android: {
        priority: 'high' as const,
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
    };

    await admin.messaging().send(message);
    console.log('Gift notification sent to:', receiverId);
  } catch (error) {
    console.error('Error sending gift notification:', error);
    throw error;
  }
}