/**
 * PACK 236 — Second Chance Mode
 * "Rewrite First Message" feature
 * Allows users to restart a conversation with better energy
 * WITHOUT deleting chat history
 */

import * as functions from 'firebase-functions';
import { db, admin } from '../init';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

interface RewriteFirstMessageRequest {
  matchId: string;
  newMessage: string;
}

interface RewriteFirstMessageResponse {
  success: boolean;
  messageId: string;
  tokensCharged: number;
  newConversationStarted: boolean;
}

/**
 * Rewrite the first message in a match
 * This creates a new conversation thread while archiving the old one
 */
export const rewriteFirstMessage = functions
  .runWith({
    timeoutSeconds: 60,
    memory: '512MB'
  })
  .https
  .onCall(async (
    data: RewriteFirstMessageRequest,
    context
  ): Promise<RewriteFirstMessageResponse> => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to rewrite first message'
      );
    }

    const userId = context.auth.uid;
    const { matchId, newMessage } = data;

    // Validate input
    if (!matchId || !newMessage) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'matchId and newMessage are required'
      );
    }

    if (newMessage.trim().length === 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Message cannot be empty'
      );
    }

    try {
      // Get match document
      const matchRef = db.collection('matches').doc(matchId);
      const matchDoc = await matchRef.get();

      if (!matchDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Match not found'
        );
      }

      const matchData = matchDoc.data()!;

      // Verify user is part of this match
      if (matchData.userId1 !== userId && matchData.userId2 !== userId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'User is not part of this match'
        );
      }

      const otherUserId = matchData.userId1 === userId 
        ? matchData.userId2 
        : matchData.userId1;

      // Check if Second Chance is active for this match
      if (!matchData.secondChance?.eligible) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Second Chance is not active for this match'
        );
      }

      // Get user and other user data for pricing
      const [userDoc, otherUserDoc] = await Promise.all([
        db.collection('users').doc(userId).get(),
        db.collection('users').doc(otherUserId).get()
      ]);

      const userData = userDoc.data();
      const otherUserData = otherUserDoc.data();

      if (!userData || !otherUserData) {
        throw new functions.https.HttpsError(
          'not-found',
          'User data not found'
        );
      }

      // Calculate pricing based on PACK 219 (11/7 word calculation)
      const wordCount = newMessage.trim().split(/\s+/).length;
      const tokensPerWord = calculateTokensPerWord(
        userData.popularity || 50,
        otherUserData.popularity || 50
      );
      const tokensCharged = Math.ceil(wordCount * tokensPerWord);

      // Check if user has enough tokens
      const userTokens = userData.tokens || 0;
      if (userTokens < tokensCharged) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Insufficient tokens. Required: ${tokensCharged}, Available: ${userTokens}`
        );
      }

      // Start a batch write
      const batch = db.batch();

      // Archive old conversation (don't delete)
      const oldMessagesSnapshot = await matchRef
        .collection('messages')
        .get();

      if (!oldMessagesSnapshot.empty) {
        // Move old messages to archive subcollection
        for (const messageDoc of oldMessagesSnapshot.docs) {
          const archiveRef = matchRef
            .collection('archivedConversations')
            .doc('conversation_1')
            .collection('messages')
            .doc(messageDoc.id);
          
          batch.set(archiveRef, {
            ...messageDoc.data(),
            archivedAt: Timestamp.now(),
            archivedReason: 'rewrite_first_message'
          });
        }

        // Mark archive metadata
        batch.set(
          matchRef.collection('archivedConversations').doc('conversation_1'),
          {
            archivedAt: Timestamp.now(),
            archivedBy: userId,
            messageCount: oldMessagesSnapshot.size,
            reason: 'rewrite_first_message'
          }
        );
      }

      // Create new first message
      const messageId = db.collection('_').doc().id;
      const newMessageRef = matchRef.collection('messages').doc(messageId);

      batch.set(newMessageRef, {
        id: messageId,
        senderId: userId,
        receiverId: otherUserId,
        text: newMessage,
        wordCount,
        tokensCharged,
        timestamp: Timestamp.now(),
        read: false,
        type: 'rewrite_first_message',
        isFirstMessage: true,
        secondChanceRewrite: true
      });

      // Deduct tokens from sender
      const userRef = db.collection('users').doc(userId);
      batch.update(userRef, {
        tokens: FieldValue.increment(-tokensCharged),
        'stats.tokensSent': FieldValue.increment(tokensCharged),
        'stats.messagesSent': FieldValue.increment(1)
      });

      // Add tokens to receiver (65/35 split)
      const tokensToReceiver = Math.floor(tokensCharged * 0.65);
      const otherUserRef = db.collection('users').doc(otherUserId);
      batch.update(otherUserRef, {
        tokensEarned: FieldValue.increment(tokensToReceiver),
        'stats.tokensReceived': FieldValue.increment(tokensToReceiver),
        'stats.messagesReceived': FieldValue.increment(1)
      });

      // Update match metadata
      batch.update(matchRef, {
        lastMessage: newMessage,
        lastMessageTimestamp: Timestamp.now(),
        lastMessageSenderId: userId,
        conversationRestarted: true,
        conversationRestartedAt: Timestamp.now(),
        'secondChance.lastActionTaken': true,
        'secondChance.lastActionTimestamp': Timestamp.now()
      });

      // Log Second Chance action
      const actionRef = matchRef
        .collection('secondChance')
        .doc('actions')
        .collection('log')
        .doc();
      
      batch.set(actionRef, {
        timestamp: Timestamp.now(),
        userId,
        actionType: 'rewriteFirstMessage',
        paid: true,
        tokensCharged,
        messageId,
        reengagementSuccess: false, // Will be updated later if other user responds
        metadata: {
          wordCount,
          archivedMessageCount: oldMessagesSnapshot.size
        }
      });

      // Update user stats
      batch.set(
        userRef.collection('secondChance').doc('stats'),
        {
          totalActionsTaken: FieldValue.increment(1),
          totalTokensSpent: FieldValue.increment(tokensCharged),
          'byReason.rewrite.actionsTaken': FieldValue.increment(1),
          'byReason.rewrite.tokensSpent': FieldValue.increment(tokensCharged)
        },
        { merge: true }
      );

      // Commit batch
      await batch.commit();

      // Send notification to other user
      await sendRewriteNotification(otherUserId, userId, userData.name, newMessage);

      console.log(`First message rewritten for match ${matchId} by user ${userId}`);

      return {
        success: true,
        messageId,
        tokensCharged,
        newConversationStarted: true
      };

    } catch (error) {
      console.error('Error rewriting first message:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError(
        'internal',
        'Failed to rewrite first message'
      );
    }
  });

/**
 * Calculate tokens per word based on popularity (PACK 219)
 * 11 tokens/word for low popularity (0-33)
 * 9 tokens/word for medium popularity (34-66)
 * 7 tokens/word for high popularity (67-100)
 */
function calculateTokensPerWord(
  senderPopularity: number,
  receiverPopularity: number
): number {
  const avgPopularity = (senderPopularity + receiverPopularity) / 2;
  
  if (avgPopularity <= 33) {
    return 11;
  } else if (avgPopularity <= 66) {
    return 9;
  } else {
    return 7;
  }
}

/**
 * Send notification to other user about conversation restart
 */
async function sendRewriteNotification(
  toUserId: string,
  fromUserId: string,
  fromUserName: string,
  message: string
): Promise<void> {
  try {
    // Create in-app notification
    await db.collection('notifications').add({
      type: 'conversation_restarted',
      userId: toUserId,
      data: {
        fromUserId,
        fromUserName,
        messagePreview: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
        actionType: 'rewriteFirstMessage'
      },
      read: false,
      createdAt: Timestamp.now()
    });

    // Send push notification
    const userDoc = await db.collection('users').doc(toUserId).get();
    const userData = userDoc.data();

    if (userData?.fcmToken) {
      await admin.messaging().send({
        token: userData.fcmToken,
        notification: {
          title: `💗 ${fromUserName} started fresh`,
          body: message.substring(0, 100)
        },
        data: {
          type: 'conversation_restarted',
          fromUserId
        }
      });
    }
  } catch (error) {
    console.error('Error sending rewrite notification:', error);
    // Don't throw - notification failure shouldn't break the flow
  }
}

/**
 * Get archived conversations for a match (HTTP endpoint)
 */
export const getArchivedConversations = functions
  .https
  .onCall(async (data: { matchId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;
    const { matchId } = data;

    try {
      // Verify user is part of match
      const matchDoc = await db.collection('matches').doc(matchId).get();
      if (!matchDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Match not found');
      }

      const matchData = matchDoc.data()!;
      if (matchData.userId1 !== userId && matchData.userId2 !== userId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'User is not part of this match'
        );
      }

      // Get archived conversations
      const archivedSnapshot = await db
        .collection('matches')
        .doc(matchId)
        .collection('archivedConversations')
        .get();

      const archived = archivedSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      return { archived };

    } catch (error) {
      console.error('Error getting archived conversations:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', 'Failed to get archived conversations');
    }
  });