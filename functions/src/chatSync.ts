/**
 * PACK 45 — Firestore Chat Sync & Delivery Guarantees
 * Backend functions for chat history sync and message status tracking
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

const db = admin.firestore();

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Get deterministic conversation ID from two user IDs
 * Always returns the same ID regardless of parameter order
 */
function getConversationId(userA: string, userB: string): string {
  return [userA, userB].sort().join('_');
}

// ============================================================================
// TYPES
// ============================================================================

export type ChatMessageStatus = 'local' | 'synced' | 'delivered' | 'read';

interface ChatMessagePayload {
  messageId: string;
  senderId: string;
  receiverId: string;
  text: string;
  createdAt: number;
  mediaType?: 'photo' | 'audio' | 'video';
  isBoosted?: boolean;
  boostExtraTokens?: number;
  payToUnlock?: boolean;
  unlockPriceTokens?: number;
  // PACK 47: Cloud Media Delivery
  mediaStoragePath?: string;
  mediaRemoteUrl?: string;
}

interface ConversationMetadata {
  users: string[];
  lastMessageText: string;
  lastMessageAt: admin.firestore.Timestamp;
  lastMessageSenderId: string;
  timestamps: {
    createdAt: admin.firestore.Timestamp;
    updatedAt: admin.firestore.Timestamp;
  };
}

// ============================================================================
// SYNC MESSAGE (IDEMPOTENT)
// ============================================================================

/**
 * POST /sync/message
 * Idempotent message write - uses messageId as document ID
 * Sets status to "synced" and returns serverCreatedAt timestamp
 */
export const syncMessage = functions.https.onCall(async (data: ChatMessagePayload, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const {
    messageId,
    senderId,
    receiverId,
    text,
    createdAt,
    mediaType,
    isBoosted,
    boostExtraTokens,
    payToUnlock,
    unlockPriceTokens,
    mediaStoragePath,
    mediaRemoteUrl,
  } = data;

  // Validate sender matches authenticated user
  if (senderId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Sender must be authenticated user');
  }

  if (!messageId || !senderId || !receiverId || !text || !createdAt) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    const conversationId = getConversationId(senderId, receiverId);
    const serverTimestamp = admin.firestore.Timestamp.now();
    const serverCreatedAt = serverTimestamp.toMillis();

    // Reference to message document (using messageId as document ID for idempotency)
    const messageRef = db
      .collection('conversations')
      .doc(conversationId)
      .collection('messages')
      .doc(messageId);

    // Reference to conversation metadata document
    const conversationRef = db.collection('conversations').doc(conversationId);

    // Use transaction for atomicity
    await db.runTransaction(async (transaction) => {
      const messageDoc = await transaction.get(messageRef);
      const conversationDoc = await transaction.get(conversationRef);

      // Prepare message data
      const messageData: any = {
        senderId,
        receiverId,
        text,
        createdAt,
        status: 'synced',
        serverCreatedAt,
      };

      // Add optional fields
      if (mediaType) messageData.mediaType = mediaType;
      if (isBoosted) messageData.isBoosted = isBoosted;
      if (boostExtraTokens) messageData.boostExtraTokens = boostExtraTokens;
      if (payToUnlock !== undefined) messageData.payToUnlock = payToUnlock;
      if (unlockPriceTokens) messageData.unlockPriceTokens = unlockPriceTokens;
      // PACK 47: Cloud Media Delivery
      if (mediaStoragePath) messageData.mediaStoragePath = mediaStoragePath;
      if (mediaRemoteUrl) messageData.mediaRemoteUrl = mediaRemoteUrl;

      if (messageDoc.exists) {
        // Message already exists - update only missing fields (idempotent)
        const existingData = messageDoc.data();
        const updates: any = {};

        // Only update fields that don't exist
        if (!existingData?.status) updates.status = 'synced';
        if (!existingData?.serverCreatedAt) updates.serverCreatedAt = serverCreatedAt;
        // PACK 47: Allow updating media metadata if not present
        if (mediaStoragePath && !existingData?.mediaStoragePath) {
          updates.mediaStoragePath = mediaStoragePath;
        }
        if (mediaRemoteUrl && !existingData?.mediaRemoteUrl) {
          updates.mediaRemoteUrl = mediaRemoteUrl;
        }

        if (Object.keys(updates).length > 0) {
          transaction.update(messageRef, updates);
        }
      } else {
        // New message - create it
        transaction.set(messageRef, messageData);
      }

      // Update or create conversation metadata
      const conversationData: any = {
        users: [senderId, receiverId],
        lastMessageText: text.substring(0, 100), // Truncate for metadata
        lastMessageAt: serverTimestamp,
        lastMessageSenderId: senderId,
        timestamps: {
          createdAt: conversationDoc.exists
            ? conversationDoc.data()?.timestamps?.createdAt || serverTimestamp
            : serverTimestamp,
          updatedAt: serverTimestamp,
        },
      };

      if (conversationDoc.exists) {
        transaction.update(conversationRef, conversationData);
      } else {
        transaction.set(conversationRef, conversationData);
      }
    });

    return { ok: true, serverCreatedAt };
  } catch (error: any) {
    console.error('Error in syncMessage:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// GET CONVERSATION HISTORY
// ============================================================================

/**
 * GET /conversations/{conversationId}/messages
 * Returns message history in descending order by createdAt
 */
export const getConversationMessages = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { conversationId, limit = 50, before } = data;

  if (!conversationId) {
    throw new functions.https.HttpsError('invalid-argument', 'Conversation ID is required');
  }

  try {
    // Verify user is participant in conversation
    const conversationRef = db.collection('conversations').doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      return { ok: true, messages: [] };
    }

    const conversationData = conversationDoc.data() as ConversationMetadata;
    if (!conversationData.users.includes(userId)) {
      throw new functions.https.HttpsError('permission-denied', 'Not a participant in this conversation');
    }

    // Query messages
    let query = conversationRef
      .collection('messages')
      .orderBy('createdAt', 'desc')
      .limit(limit);

    if (before) {
      query = query.where('createdAt', '<', before);
    }

    const snapshot = await query.get();
    const messages = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return { ok: true, messages };
  } catch (error: any) {
    console.error('Error in getConversationMessages:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// UPDATE MESSAGE STATUS
// ============================================================================

/**
 * POST /conversations/{conversationId}/messages/{messageId}/status
 * Update message status (delivered/read)
 */
export const updateMessageStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { conversationId, messageId, status } = data;

  if (!conversationId || !messageId || !status) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  if (!['delivered', 'read'].includes(status)) {
    throw new functions.https.HttpsError('invalid-argument', 'Status must be "delivered" or "read"');
  }

  try {
    // Verify user is participant in conversation
    const conversationRef = db.collection('conversations').doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Conversation not found');
    }

    const conversationData = conversationDoc.data() as ConversationMetadata;
    if (!conversationData.users.includes(userId)) {
      throw new functions.https.HttpsError('permission-denied', 'Not a participant in this conversation');
    }

    // Get message to verify user is receiver
    const messageRef = conversationRef.collection('messages').doc(messageId);
    const messageDoc = await messageRef.get();

    if (!messageDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Message not found');
    }

    const messageData = messageDoc.data();
    if (messageData?.receiverId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Only receiver can update message status');
    }

    // Update status (idempotent)
    const serverTimestamp = admin.firestore.Timestamp.now();
    const updates: any = { status };

    if (status === 'delivered' && !messageData?.deliveredAt) {
      updates.deliveredAt = serverTimestamp.toMillis();
    } else if (status === 'read' && !messageData?.readAt) {
      updates.readAt = serverTimestamp.toMillis();
      // If setting to read, ensure delivered is also set
      if (!messageData?.deliveredAt) {
        updates.deliveredAt = serverTimestamp.toMillis();
      }
    }

    await messageRef.update(updates);

    return { ok: true };
  } catch (error: any) {
    console.error('Error in updateMessageStatus:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// MARK MESSAGES AS DELIVERED (BATCH)
// ============================================================================

/**
 * Mark multiple messages as delivered for a user
 */
export const markMessagesDelivered = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { conversationId, messageIds } = data;

  if (!conversationId || !Array.isArray(messageIds) || messageIds.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid conversation ID or message IDs');
  }

  try {
    const conversationRef = db.collection('conversations').doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Conversation not found');
    }

    const conversationData = conversationDoc.data() as ConversationMetadata;
    if (!conversationData.users.includes(userId)) {
      throw new functions.https.HttpsError('permission-denied', 'Not a participant');
    }

    const serverTimestamp = admin.firestore.Timestamp.now();
    const batch = db.batch();

    for (const messageId of messageIds) {
      const messageRef = conversationRef.collection('messages').doc(messageId);
      batch.update(messageRef, {
        status: 'delivered',
        deliveredAt: serverTimestamp.toMillis(),
      });
    }

    await batch.commit();

    return { ok: true, count: messageIds.length };
  } catch (error: any) {
    console.error('Error in markMessagesDelivered:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// MARK CONVERSATION AS READ (ALL MESSAGES)
// ============================================================================

/**
 * Mark all messages in a conversation as read for current user
 */
export const markConversationRead = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { conversationId } = data;

  if (!conversationId) {
    throw new functions.https.HttpsError('invalid-argument', 'Conversation ID is required');
  }

  try {
    const conversationRef = db.collection('conversations').doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Conversation not found');
    }

    const conversationData = conversationDoc.data() as ConversationMetadata;
    if (!conversationData.users.includes(userId)) {
      throw new functions.https.HttpsError('permission-denied', 'Not a participant');
    }

    // Get all unread messages sent by other user
    const messagesSnapshot = await conversationRef
      .collection('messages')
      .where('receiverId', '==', userId)
      .where('status', '!=', 'read')
      .get();

    if (messagesSnapshot.empty) {
      return { ok: true, count: 0 };
    }

    const serverTimestamp = admin.firestore.Timestamp.now();
    const batch = db.batch();

    messagesSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        status: 'read',
        readAt: serverTimestamp.toMillis(),
      });
    });

    await batch.commit();

    return { ok: true, count: messagesSnapshot.size };
  } catch (error: any) {
    console.error('Error in markConversationRead:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});