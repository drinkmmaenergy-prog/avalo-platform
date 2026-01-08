/**
 * PACK 427 - Offline Sync & Resync Endpoints
 * 
 * HTTPS callable functions for device sync and offline message retrieval
 * Ensures idempotent sync without double-billing
 */

import * as functions from 'firebase-functions';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  DeviceSyncState,
  Region,
  SyncResult,
  QUEUE_CONSTANTS,
} from './pack427-messaging-types';
import {
  getPendingMessagesForUser,
  getMessagesForChat,
} from './pack427-message-queue-service';
import { routeRegion } from './pack426-region-router'; // PACK 426

const db = getFirestore();

/**
 * Register or update device sync state
 * 
 * Called when user opens app or changes devices
 * Creates/updates sync state for offline message retrieval
 */
export const pack427_registerDevice = functions
  .runWith({
    timeoutSeconds: 30,
    memory: '256MB',
  })
  .https.onCall(async (data, context) => {
    // Authenticate user
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;
    const { deviceId, platform, appVersion } = data;

    if (!deviceId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'deviceId is required'
      );
    }

    // Get user's country for region routing
    const userDoc = await db.collection('users').doc(userId).get();
    const country = userDoc.data()?.country || 'US';
    const region: Region = routeRegion ? routeRegion(country) : 'US';

    const now = Timestamp.now();
    const syncStateId = `${userId}_${deviceId}`;

    // Check if sync state exists
    const existingSyncState = await db
      .collection('regions')
      .doc(region)
      .collection('deviceSyncStates')
      .doc(syncStateId)
      .get();

    const syncState: DeviceSyncState = {
      userId,
      deviceId,
      lastSyncAt: now,
      lastMessageTimestamp: existingSyncState.exists
        ? existingSyncState.data()!.lastMessageTimestamp
        : now,
      lastRegion: region,
      platform,
      appVersion,
    };

    await db
      .collection('regions')
      .doc(region)
      .collection('deviceSyncStates')
      .doc(syncStateId)
      .set(syncState, { merge: true });

    return {
      success: true,
      deviceId,
      region,
      lastSyncAt: now.toMillis(),
    };
  });

/**
 * Sync messages for a device
 * 
 * Returns all messages created since last sync
 * Handles offline users who haven't synced in days/weeks
 */
export const pack427_syncMessages = functions
  .runWith({
    timeoutSeconds: 60,
    memory: '512MB',
  })
  .https.onCall(async (data, context) => {
    // Authenticate user
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;
    const { deviceId, since } = data;

    if (!deviceId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'deviceId is required'
      );
    }

    // Determine region
    const userDoc = await db.collection('users').doc(userId).get();
    const country = userDoc.data()?.country || 'US';
    const region: Region = routeRegion ? routeRegion(country) : 'US';

    // Get sync state
    const syncStateId = `${userId}_${deviceId}`;
    const syncStateDoc = await db
      .collection('regions')
      .doc(region)
      .collection('deviceSyncStates')
      .doc(syncStateId)
      .get();

    // Determine since timestamp
    let sinceTimestamp: Timestamp;
    if (since) {
      sinceTimestamp = Timestamp.fromMillis(since);
    } else if (syncStateDoc.exists) {
      sinceTimestamp = syncStateDoc.data()!.lastMessageTimestamp;
    } else {
      // First sync - get messages from last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      sinceTimestamp = Timestamp.fromDate(sevenDaysAgo);
    }

    // Fetch messages from multiple sources
    const [queueMessages, chatMessages] = await Promise.all([
      // 1. Messages from queue (safety fallback)
      getPendingMessagesForUser(userId, region, sinceTimestamp),

      // 2. Messages from user's chats
      getUserChatMessages(userId, region, sinceTimestamp),
    ]);

    // Combine and deduplicate
    const allMessages = new Map();

    queueMessages.forEach(msg => {
      allMessages.set(msg.id, {
        messageId: msg.id,
        chatId: msg.chatId,
        contentRef: msg.contentRef,
        timestamp: msg.createdAt,
        senderId: msg.senderId,
      });
    });

    chatMessages.forEach(msg => {
      if (!allMessages.has(msg.messageId)) {
        allMessages.set(msg.messageId, msg);
      }
    });

    // Convert to array and sort by timestamp
    const messages = Array.from(allMessages.values())
      .sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis())
      .slice(0, QUEUE_CONSTANTS.SYNC_BATCH_SIZE);

    const now = Timestamp.now();

    // Update sync state
    await db
      .collection('regions')
      .doc(region)
      .collection('deviceSyncStates')
      .doc(syncStateId)
      .set(
        {
          userId,
          deviceId,
          lastSyncAt: now,
          lastMessageTimestamp: messages.length > 0
            ? messages[messages.length - 1].timestamp
            : sinceTimestamp,
          lastRegion: region,
        } as DeviceSyncState,
        { merge: true }
      );

    const result: SyncResult = {
      messages: messages.map(msg => ({
        messageId: msg.messageId,
        chatId: msg.chatId,
        contentRef: msg.contentRef,
        timestamp: msg.timestamp,
      })),
      newSyncTimestamp: now,
      hasMore: allMessages.size > QUEUE_CONSTANTS.SYNC_BATCH_SIZE,
    };

    return result;
  });

/**
 * Acknowledge messages as delivered
 * 
 * Called by client after successfully receiving and processing messages
 * Idempotent - safe to call multiple times
 */
export const pack427_ackMessages = functions
  .runWith({
    timeoutSeconds: 30,
    memory: '256MB',
  })
  .https.onCall(async (data, context) => {
    // Authenticate user
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;
    const { messageIds, region } = data;

    if (!messageIds || !Array.isArray(messageIds)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'messageIds must be an array'
      );
    }

    // Determine region
    const userDoc = await db.collection('users').doc(userId).get();
    const country = userDoc.data()?.country || 'US';
    const targetRegion: Region = region || (routeRegion ? routeRegion(country) : 'US');

    // Mark messages as delivered (idempotent)
    const batch = db.batch();
    let updatedCount = 0;

    for (const messageId of messageIds) {
      const messageRef = db
        .collection('regions')
        .doc(targetRegion)
        .collection('messageQueue')
        .doc(messageId);

      const messageDoc = await messageRef.get();
      if (messageDoc.exists && messageDoc.data()!.recipientId === userId) {
        batch.update(messageRef, {
          status: 'DELIVERED',
          updatedAt: Timestamp.now(),
        });
        updatedCount++;
      }
    }

    await batch.commit();

    return {
      success: true,
      acknowledgedCount: updatedCount,
    };
  });

/**
 * Get chat list with unread counts
 * 
 * Returns user's chats with unread message counts for UI
 */
export const pack427_getChatList = functions
  .runWith({
    timeoutSeconds: 30,
    memory: '256MB',
  })
  .https.onCall(async (data, context) => {
    // Authenticate user
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;

    // Get user's chats
    const chatsSnapshot = await db
      .collection('chats')
      .where('participants', 'array-contains', userId)
      .orderBy('lastMessageAt', 'desc')
      .limit(50)
      .get();

    const chats = await Promise.all(
      chatsSnapshot.docs.map(async (doc) => {
        const chatData = doc.data();
        const chatId = doc.id;

        // Get unread count
        const unreadCount = await getUnreadCount(chatId, userId);

        // Get last message
        const lastMessageSnapshot = await db
          .collection('chats')
          .doc(chatId)
          .collection('messages')
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();

        const lastMessage = lastMessageSnapshot.empty
          ? null
          : lastMessageSnapshot.docs[0].data();

        return {
          chatId,
          participants: chatData.participants,
          lastMessageAt: chatData.lastMessageAt,
          unreadCount,
          lastMessage: lastMessage
            ? {
                text: lastMessage.text || '',
                senderId: lastMessage.senderId,
                timestamp: lastMessage.createdAt,
              }
            : null,
        };
      })
    );

    return { chats };
  });

/**
 * Force resync for a specific chat
 * 
 * Used when client detects inconsistency or message gaps
 */
export const pack427_resyncChat = functions
  .runWith({
    timeoutSeconds: 60,
    memory: '256MB',
  })
  .https.onCall(async (data, context) => {
    // Authenticate user
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;
    const { chatId } = data;

    if (!chatId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'chatId is required'
      );
    }

    // Verify user is participant
    const chatDoc = await db.collection('chats').doc(chatId).get();
    if (!chatDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Chat not found');
    }

    const participants = chatDoc.data()!.participants || [];
    if (!participants.includes(userId)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'User is not a participant in this chat'
      );
    }

    // Fetch all messages from chat
    const messagesSnapshot = await db
      .collection('chats')
      .doc(chatId)
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .limit(QUEUE_CONSTANTS.SYNC_BATCH_SIZE)
      .get();

    const messages = messagesSnapshot.docs.map(doc => ({
      messageId: doc.id,
      chatId,
      ...doc.data(),
    }));

    return {
      success: true,
      messages,
      hasMore: messagesSnapshot.size === QUEUE_CONSTANTS.SYNC_BATCH_SIZE,
    };
  });

/**
 * Helper: Get messages from user's chats
 */
async function getUserChatMessages(
  userId: string,
  region: Region,
  sinceTimestamp: Timestamp
): Promise<any[]> {
  // Get user's chats
  const chatsSnapshot = await db
    .collection('chats')
    .where('participants', 'array-contains', userId)
    .get();

  const messages: any[] = [];

  // Fetch messages from each chat
  await Promise.all(
    chatsSnapshot.docs.map(async (chatDoc) => {
      const chatId = chatDoc.id;
      const messagesSnapshot = await db
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .where('createdAt', '>', sinceTimestamp)
        .orderBy('createdAt', 'asc')
        .limit(50)
        .get();

      messagesSnapshot.docs.forEach(messageDoc => {
        messages.push({
          messageId: messageDoc.id,
          chatId,
          contentRef: `chats/${chatId}/messages/${messageDoc.id}`,
          timestamp: messageDoc.data().createdAt,
          senderId: messageDoc.data().senderId,
        });
      });
    })
  );

  return messages;
}

/**
 * Helper: Get unread count for a chat
 */
async function getUnreadCount(chatId: string, userId: string): Promise<number> {
  // Get user's read receipt
  const readReceiptDoc = await db
    .collection('chats')
    .doc(chatId)
    .collection('readReceipts')
    .doc(userId)
    .get();

  if (!readReceiptDoc.exists) {
    // No read receipt - count all messages
    const messagesSnapshot = await db
      .collection('chats')
      .doc(chatId)
      .collection('messages')
      .where('senderId', '!=', userId)
      .count()
      .get();
    return messagesSnapshot.data().count;
  }

  const readUpToTimestamp = readReceiptDoc.data()!.readUpToTimestamp;

  // Count messages after last read
  const unreadSnapshot = await db
    .collection('chats')
    .doc(chatId)
    .collection('messages')
    .where('senderId', '!=', userId)
    .where('createdAt', '>', readUpToTimestamp)
    .count()
    .get();

  return unreadSnapshot.data().count;
}
