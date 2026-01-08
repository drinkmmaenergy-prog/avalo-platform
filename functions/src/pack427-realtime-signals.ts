/**
 * PACK 427 - Real-Time UX Signals
 * 
 * Handles typing indicators, read receipts, and unread counters
 * Provides real-time UX without impacting tokenomics
 */

import * as functions from 'firebase-functions';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  TypingEvent,
  ReadReceipt,
  UnreadCounter,
  Region,
  QUEUE_CONSTANTS,
} from './pack427-messaging-types';
import { ulid } from 'ulid';
import { routeRegion } from './pack426-region-router'; // PACK 426

const db = getFirestore();

/**
 * Update typing state for a user in a chat
 * 
 * Creates ephemeral typing event with TTL
 * Clients subscribe to typingEvents collection for real-time updates
 */
export const pack427_updateTypingState = functions
  .runWith({
    timeoutSeconds: 10,
    memory: '128MB',
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
    const { chatId, isTyping } = data;

    if (!chatId || typeof isTyping !== 'boolean') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'chatId and isTyping are required'
      );
    }

    // Verify user is participant in chat
    const chatDoc = await db.collection('chats').doc(chatId).get();
    if (!chatDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Chat not found');
    }

    const participants = chatDoc.data()!.participants || [];
    if (!participants.includes(userId)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'User is not a participant'
      );
    }

    // Get user's region
    const userDoc = await db.collection('users').doc(userId).get();
    const country = userDoc.data()?.country || 'US';
    const region: Region = routeRegion ? routeRegion(country) : 'US';

    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(
      now.toMillis() + QUEUE_CONSTANTS.TYPING_TTL_SECONDS * 1000
    );

    const typingEvent: TypingEvent = {
      id: ulid(),
      chatId,
      userId,
      isTyping,
      region,
      expiresAt,
      createdAt: now,
    };

    // Write to regional typing events collection
    const eventRef = db
      .collection('regions')
      .doc(region)
      .collection('typingEvents')
      .doc(`${chatId}_${userId}`);

    if (isTyping) {
      // Set typing event
      await eventRef.set(typingEvent);
    } else {
      // Clear typing event
      await eventRef.delete();
    }

    return {
      success: true,
      chatId,
      userId,
      isTyping,
    };
  });

/**
 * Mark messages as read up to a specific message
 * 
 * Updates read receipt and recalculates unread counter
 * Idempotent - safe to call multiple times
 */
export const pack427_markAsRead = functions
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
    const { chatId, readUpToMessageId } = data;

    if (!chatId || !readUpToMessageId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'chatId and readUpToMessageId are required'
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
        'User is not a participant'
      );
    }

    // Get message timestamp
    const messageDoc = await db
      .collection('chats')
      .doc(chatId)
      .collection('messages')
      .doc(readUpToMessageId)
      .get();

    if (!messageDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Message not found');
    }

    const readUpToTimestamp = messageDoc.data()!.createdAt as Timestamp;

    // Update read receipt (idempotent)
    const readReceipt: ReadReceipt = {
      chatId,
      userId,
      readUpToMessageId,
      readUpToTimestamp,
      updatedAt: Timestamp.now(),
    };

    await db
      .collection('chats')
      .doc(chatId)
      .collection('readReceipts')
      .doc(userId)
      .set(readReceipt, { merge: true });

    // Recalculate unread count
    const unreadCount = await calculateUnreadCount(chatId, userId, readUpToTimestamp);

    // Update unread counter
    await updateUnreadCounter(chatId, userId, unreadCount);

    return {
      success: true,
      chatId,
      unreadCount,
    };
  });

/**
 * Get typing status for a chat
 * 
 * Returns list of users currently typing
 */
export const pack427_getTypingStatus = functions
  .runWith({
    timeoutSeconds: 10,
    memory: '128MB',
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
    const { chatId, region } = data;

    if (!chatId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'chatId is required'
      );
    }

    // Get user's region if not provided
    let targetRegion: Region = region;
    if (!targetRegion) {
      const userDoc = await db.collection('users').doc(userId).get();
      const country = userDoc.data()?.country || 'US';
      targetRegion = routeRegion ? routeRegion(country) : 'US';
    }

    const now = Timestamp.now();

    // Fetch active typing events
    const typingSnapshot = await db
      .collection('regions')
      .doc(targetRegion)
      .collection('typingEvents')
      .where('chatId', '==', chatId)
      .where('isTyping', '==', true)
      .where('expiresAt', '>', now)
      .get();

    const typingUsers = typingSnapshot.docs
      .map(doc => doc.data() as TypingEvent)
      .filter(event => event.userId !== userId) // Don't include self
      .map(event => event.userId);

    return {
      chatId,
      typingUsers,
    };
  });

/**
 * Get unread counts for all user's chats
 * 
 * Used for badge display in UI
 */
export const pack427_getUnreadCounts = functions
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
      .get();

    const unreadCounts: Record<string, number> = {};
    let totalUnread = 0;

    await Promise.all(
      chatsSnapshot.docs.map(async (chatDoc) => {
        const chatId = chatDoc.id;

        // Check cached unread counter first
        const counterDoc = await db
          .collection('users')
          .doc(userId)
          .collection('unreadCounters')
          .doc(chatId)
          .get();

        if (counterDoc.exists) {
          const count = counterDoc.data()!.count || 0;
          unreadCounts[chatId] = count;
          totalUnread += count;
        } else {
          // Calculate on-demand if not cached
          const count = await calculateUnreadCountForChat(chatId, userId);
          unreadCounts[chatId] = count;
          totalUnread += count;

          // Cache for next time
          await updateUnreadCounter(chatId, userId, count);
        }
      })
    );

    return {
      unreadCounts,
      totalUnread,
    };
  });

/**
 * Recalculate all unread counters for a user
 * 
 * Background task to fix any drift in unread counts
 */
export const pack427_recalculateUnreadCounters = functions
  .runWith({
    timeoutSeconds: 120,
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

    // Get user's chats
    const chatsSnapshot = await db
      .collection('chats')
      .where('participants', 'array-contains', userId)
      .get();

    let recalculated = 0;

    await Promise.all(
      chatsSnapshot.docs.map(async (chatDoc) => {
        const chatId = chatDoc.id;
        const count = await calculateUnreadCountForChat(chatId, userId);
        await updateUnreadCounter(chatId, userId, count);
        recalculated++;
      })
    );

    return {
      success: true,
      recalculated,
    };
  });

/**
 * Cleanup expired typing events
 * 
 * Scheduled function to remove old typing indicators
 */
export const pack427_cleanupTypingEvents = functions
  .runWith({
    timeoutSeconds: 60,
    memory: '256MB',
  })
  .pubsub.schedule('every 5 minutes')
  .onRun(async (context) => {
    const regions: Region[] = ['EU', 'US', 'APAC'];
    const now = Timestamp.now();
    let totalDeleted = 0;

    await Promise.all(
      regions.map(async (region) => {
        const batch = db.batch();
        let deleteCount = 0;

        // Fetch expired events
        const expiredSnapshot = await db
          .collection('regions')
          .doc(region)
          .collection('typingEvents')
          .where('expiresAt', '<', now)
          .limit(500)
          .get();

        expiredSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
          deleteCount++;
        });

        if (deleteCount > 0) {
          await batch.commit();
          totalDeleted += deleteCount;
        }
      })
    );

    console.log(`Cleaned up ${totalDeleted} expired typing events`);
    return { deleted: totalDeleted };
  });

/**
 * Helper: Calculate unread count for a chat
 */
async function calculateUnreadCount(
  chatId: string,
  userId: string,
  readUpToTimestamp: Timestamp
): Promise<number> {
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

/**
 * Helper: Calculate unread count for a chat (from scratch)
 */
async function calculateUnreadCountForChat(
  chatId: string,
  userId: string
): Promise<number> {
  // Get read receipt
  const readReceiptDoc = await db
    .collection('chats')
    .doc(chatId)
    .collection('readReceipts')
    .doc(userId)
    .get();

  if (!readReceiptDoc.exists) {
    // No read receipt - count all messages from others
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
  return calculateUnreadCount(chatId, userId, readUpToTimestamp);
}

/**
 * Helper: Update unread counter
 */
async function updateUnreadCounter(
  chatId: string,
  userId: string,
  count: number
): Promise<void> {
  const unreadCounter: UnreadCounter = {
    chatId,
    userId,
    count,
    updatedAt: Timestamp.now(),
  };

  await db
    .collection('users')
    .doc(userId)
    .collection('unreadCounters')
    .doc(chatId)
    .set(unreadCounter, { merge: true });
}

/**
 * Trigger: Update unread counter on new message
 */
export const pack427_onNewMessage = functions
  .runWith({
    timeoutSeconds: 30,
    memory: '256MB',
  })
  .firestore.document('chats/{chatId}/messages/{messageId}')
  .onCreate(async (snapshot, context) => {
    const chatId = context.params.chatId;
    const messageData = snapshot.data();
    const senderId = messageData.senderId;

    // Get chat participants
    const chatDoc = await db.collection('chats').doc(chatId).get();
    if (!chatDoc.exists) {
      return;
    }

    const participants = chatDoc.data()!.participants || [];

    // Update unread counters for all participants except sender
    await Promise.all(
      participants
        .filter((participantId: string) => participantId !== senderId)
        .map(async (participantId: string) => {
          // Increment unread counter
          const counterRef = db
            .collection('users')
            .doc(participantId)
            .collection('unreadCounters')
            .doc(chatId);

          const counterDoc = await counterRef.get();
          const currentCount = counterDoc.exists ? counterDoc.data()!.count : 0;

          await updateUnreadCounter(chatId, participantId, currentCount + 1);
        })
    );
  });
