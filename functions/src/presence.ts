/**
 * PHASE 26 - Presence System
 *
 * Online/offline status, typing indicators, and read receipts
 * Ultra-low latency presence broadcasting
 *
 * Feature flag: realtime_presence
 * Region: europe-west3
 */

import { HttpsError } from 'firebase-functions/v2/https';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
;
;
;
import { RealtimeEventType } from './realtimeEngine.js';

const db = getFirestore();

/**
 * User presence status
 */
export enum PresenceStatus {
  ONLINE = "online",
  AWAY = "away",
  BUSY = "busy",
  OFFLINE = "offline",
}

/**
 * Presence data structure
 */
interface UserPresence {
  userId: string;
  status: PresenceStatus;
  lastSeenAt: Timestamp;
  lastActiveAt: Timestamp;
  platform?: "web" | "ios" | "android";
  customStatus?: string;
  isTypingIn?: string[]; // Chat IDs where user is typing
}

/**
 * Update user presence status
 */
export const updatePresenceV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    // Check feature flag
    const enabled = await getFeatureFlag(uid, "realtime_presence", true);
    if (!enabled) {
      return { enabled: false };
    }

    // Validate input
    const schema = z.object({
      status: z.enum(["online", "away", "busy", "offline"]),
      platform: z.enum(["web", "ios", "android"]).optional(),
      customStatus: z.string().max(100).optional(),
    });

    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", validationResult.error.message);
    }

    const { status, platform, customStatus } = validationResult.data;

    try {
      const now = Timestamp.now();

      const presence: UserPresence = {
        userId: uid,
        status: status as PresenceStatus,
        lastSeenAt: now,
        lastActiveAt: now,
        platform,
        customStatus,
      };

      // Update presence in Firestore
      await db.collection("userPresence").doc(uid).set(presence, { merge: true });

      // Broadcast presence update to relevant users
      // Get users who have recent interactions with this user
      const recentChatsSnapshot = await db
        .collection("chats")
        .where("participants", "array-contains", uid)
        .where("lastMessageAt", ">", Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000))
        .limit(50)
        .get();

      const relevantUserIds = new Set<string>();
      recentChatsSnapshot.docs.forEach((doc) => {
        const participants = doc.data().participants as string[];
        participants.forEach((participantId) => {
          if (participantId !== uid) {
            relevantUserIds.add(participantId);
          }
        });
      });

      // Broadcast to relevant users
      await broadcastToUsers(Array.from(relevantUserIds), {
        type: RealtimeEventType.PRESENCE_UPDATE,
        sourceUserId: uid,
        payload: {
          userId: uid,
          status,
          lastSeenAt: now.toMillis(),
          platform,
          customStatus,
        },
      });

      logger.info(`Presence updated: ${uid} -> ${status}`);

      return {
        success: true,
        status,
        lastSeenAt: now,
      };
    } catch (error: any) {
      logger.error("Failed to update presence:", error);
      throw new HttpsError("internal", "Failed to update presence");
    }
  }
);

/**
 * Get presence for multiple users
 */
export const getPresenceV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { userIds } = request.data;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      throw new HttpsError("invalid-argument", "userIds array required");
    }

    if (userIds.length > 100) {
      throw new HttpsError("invalid-argument", "Maximum 100 userIds per request");
    }

    try {
      // Batch get presence data
      const presencePromises = userIds.map((userId) =>
        db.collection("userPresence").doc(userId).get()
      );

      const presenceDocs = await Promise.all(presencePromises);

      const presenceMap: Record<string, any> = {};

      presenceDocs.forEach((doc, index) => {
        const userId = userIds[index];
        if (doc.exists) {
          const data = doc.data() as UserPresence;

          // Determine actual status based on lastSeenAt
          const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
          const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;

          let actualStatus = data.status;
          if (data.lastSeenAt.toMillis() < thirtyMinutesAgo) {
            actualStatus = PresenceStatus.OFFLINE;
          } else if (data.lastSeenAt.toMillis() < fiveMinutesAgo && data.status === PresenceStatus.ONLINE) {
            actualStatus = PresenceStatus.AWAY;
          }

          presenceMap[userId] = {
            status: actualStatus,
            lastSeenAt: data.lastSeenAt.toMillis(),
            platform: data.platform,
            customStatus: data.customStatus,
          };
        } else {
          presenceMap[userId] = {
            status: PresenceStatus.OFFLINE,
            lastSeenAt: null,
          };
        }
      });

      return { presence: presenceMap };
    } catch (error: any) {
      logger.error("Failed to get presence:", error);
      throw new HttpsError("internal", "Failed to get presence");
    }
  }
);

/**
 * Send typing indicator
 */
export const sendTypingIndicatorV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    // Check feature flag
    const enabled = await getFeatureFlag(uid, "realtime_presence", true);
    if (!enabled) {
      return { enabled: false };
    }

    // Validate input
    const schema = z.object({
      chatId: z.string(),
      isTyping: z.boolean(),
    });

    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", validationResult.error.message);
    }

    const { chatId, isTyping } = validationResult.data;

    try {
      // Verify user is participant in chat
      const chatDoc = await db.collection("chats").doc(chatId).get();

      if (!chatDoc.exists) {
        throw new HttpsError("not-found", "Chat not found");
      }

      const chat = chatDoc.data();
      if (!chat?.participants.includes(uid)) {
        throw new HttpsError("permission-denied", "Not a participant in this chat");
      }

      // Update user presence with typing status
      if (isTyping) {
        await db
          .collection("userPresence")
          .doc(uid)
          .update({
            isTypingIn: FieldValue.arrayUnion(chatId),
            lastActiveAt: Timestamp.now(),
          });
      } else {
        await db
          .collection("userPresence")
          .doc(uid)
          .update({
            isTypingIn: FieldValue.arrayRemove(chatId),
          });
      }

      // Broadcast to other participants
      const otherParticipants = chat.participants.filter((id: string) => id !== uid);

      await broadcastToUsers(otherParticipants, {
        type: RealtimeEventType.TYPING_INDICATOR,
        sourceUserId: uid,
        payload: {
          chatId,
          userId: uid,
          isTyping,
        },
        ttl: 5, // 5 second TTL
      });

      logger.debug(`Typing indicator: ${uid} in ${chatId}: ${isTyping}`);

      return { success: true };
    } catch (error: any) {
      logger.error("Failed to send typing indicator:", error);
      throw new HttpsError("internal", "Failed to send typing indicator");
    }
  }
);

/**
 * Send read receipt
 */
export const sendReadReceiptV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    // Validate input
    const schema = z.object({
      chatId: z.string(),
      messageId: z.string(),
    });

    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", validationResult.error.message);
    }

    const { chatId, messageId } = validationResult.data;

    try {
      // Verify user is participant in chat
      const chatDoc = await db.collection("chats").doc(chatId).get();

      if (!chatDoc.exists) {
        throw new HttpsError("not-found", "Chat not found");
      }

      const chat = chatDoc.data();
      if (!chat?.participants.includes(uid)) {
        throw new HttpsError("permission-denied", "Not a participant in this chat");
      }

      // Update read receipt
      const now = Timestamp.now();

      await db
        .collection("chats")
        .doc(chatId)
        .collection("messages")
        .doc(messageId)
        .update({
          [`readBy.${uid}`]: now,
        });

      // Update chat-level last read
      await db
        .collection("chats")
        .doc(chatId)
        .update({
          [`lastReadAt.${uid}`]: now,
        });

      // Get message sender
      const messageDoc = await db
        .collection("chats")
        .doc(chatId)
        .collection("messages")
        .doc(messageId)
        .get();

      if (messageDoc.exists) {
        const message = messageDoc.data();
        const senderId = message?.uid;

        if (senderId && senderId !== uid) {
          // Broadcast read receipt to sender
          await broadcastToUser(senderId, {
            type: RealtimeEventType.READ_RECEIPT,
            sourceUserId: uid,
            payload: {
              chatId,
              messageId,
              readBy: uid,
              readAt: now.toMillis(),
            },
          });
        }
      }

      logger.debug(`Read receipt: ${uid} read ${messageId} in ${chatId}`);

      return {
        success: true,
        readAt: now,
      };
    } catch (error: any) {
      logger.error("Failed to send read receipt:", error);
      throw new HttpsError("internal", "Failed to send read receipt");
    }
  }
);

/**
 * Batch read receipts (mark all messages as read in a chat)
 */
export const markChatAsReadV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { chatId } = request.data;

    if (!chatId) {
      throw new HttpsError("invalid-argument", "chatId required");
    }

    try {
      // Verify user is participant in chat
      const chatDoc = await db.collection("chats").doc(chatId).get();

      if (!chatDoc.exists) {
        throw new HttpsError("not-found", "Chat not found");
      }

      const chat = chatDoc.data();
      if (!chat?.participants.includes(uid)) {
        throw new HttpsError("permission-denied", "Not a participant in this chat");
      }

      const now = Timestamp.now();

      // Update chat-level last read
      await db
        .collection("chats")
        .doc(chatId)
        .update({
          [`lastReadAt.${uid}`]: now,
        });

      // Get unread messages
      const unreadMessages = await db
        .collection("chats")
        .doc(chatId)
        .collection("messages")
        .where("uid", "!=", uid)
        .where("createdAt", ">", chat.lastReadAt?.[uid] || Timestamp.fromMillis(0))
        .get();

      // Batch update read receipts
      const batch = db.batch();
      unreadMessages.docs.forEach((doc) => {
        batch.update(doc.ref, {
          [`readBy.${uid}`]: now,
        });
      });

      await batch.commit();

      logger.info(`Marked ${unreadMessages.size} messages as read in ${chatId}`);

      return {
        success: true,
        markedCount: unreadMessages.size,
        readAt: now,
      };
    } catch (error: any) {
      logger.error("Failed to mark chat as read:", error);
      throw new HttpsError("internal", "Failed to mark chat as read");
    }
  }
);

/**
 * Get typing users in a chat
 */
export async function getTypingUsers(chatId: string): Promise<string[]> {
  try {
    const oneMinuteAgo = Timestamp.fromMillis(Date.now() - 60 * 1000);

    const typingUsersSnapshot = await db
      .collection("userPresence")
      .where("isTypingIn", "array-contains", chatId)
      .where("lastActiveAt", ">", oneMinuteAgo)
      .get();

    return typingUsersSnapshot.docs.map((doc) => doc.id);
  } catch (error: any) {
    logger.error("Failed to get typing users:", error);
    return [];
  }
}

/**
 * Cleanup stale typing indicators (scheduler)
 */
export async function cleanupStaleTypingIndicators(): Promise<void> {
  try {
    const oneMinuteAgo = Timestamp.fromMillis(Date.now() - 60 * 1000);

    const staleTypingSnapshot = await db
      .collection("userPresence")
      .where("isTypingIn", "!=", null)
      .where("lastActiveAt", "<", oneMinuteAgo)
      .get();

    const batch = db.batch();
    staleTypingSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        isTypingIn: [],
      });
    });

    await batch.commit();

    logger.info(`Cleaned up ${staleTypingSnapshot.size} stale typing indicators`);
  } catch (error: any) {
    logger.error("Failed to cleanup stale typing indicators:", error);
  }
}


