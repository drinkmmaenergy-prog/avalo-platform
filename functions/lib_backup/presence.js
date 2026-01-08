"use strict";
/**
 * PHASE 26 - Presence System
 *
 * Online/offline status, typing indicators, and read receipts
 * Ultra-low latency presence broadcasting
 *
 * Feature flag: realtime_presence
 * Region: europe-west3
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.markChatAsReadV1 = exports.sendReadReceiptV1 = exports.sendTypingIndicatorV1 = exports.getPresenceV1 = exports.updatePresenceV1 = exports.PresenceStatus = void 0;
exports.getTypingUsers = getTypingUsers;
exports.cleanupStaleTypingIndicators = cleanupStaleTypingIndicators;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const v2_1 = require("firebase-functions/v2");
const zod_1 = require("zod");
const featureFlags_1 = require("./featureFlags");
const realtimeEngine_1 = require("./realtimeEngine");
const db = (0, firestore_1.getFirestore)();
/**
 * User presence status
 */
var PresenceStatus;
(function (PresenceStatus) {
    PresenceStatus["ONLINE"] = "online";
    PresenceStatus["AWAY"] = "away";
    PresenceStatus["BUSY"] = "busy";
    PresenceStatus["OFFLINE"] = "offline";
})(PresenceStatus || (exports.PresenceStatus = PresenceStatus = {}));
/**
 * Update user presence status
 */
exports.updatePresenceV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Check feature flag
    const enabled = await (0, featureFlags_1.getFeatureFlag)(uid, "realtime_presence", true);
    if (!enabled) {
        return { enabled: false };
    }
    // Validate input
    const schema = zod_1.z.object({
        status: zod_1.z.enum(["online", "away", "busy", "offline"]),
        platform: zod_1.z.enum(["web", "ios", "android"]).optional(),
        customStatus: zod_1.z.string().max(100).optional(),
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { status, platform, customStatus } = validationResult.data;
    try {
        const now = firestore_1.Timestamp.now();
        const presence = {
            userId: uid,
            status: status,
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
            .where("lastMessageAt", ">", firestore_1.Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000))
            .limit(50)
            .get();
        const relevantUserIds = new Set();
        recentChatsSnapshot.docs.forEach((doc) => {
            const participants = doc.data().participants;
            participants.forEach((participantId) => {
                if (participantId !== uid) {
                    relevantUserIds.add(participantId);
                }
            });
        });
        // Broadcast to relevant users
        await (0, realtimeEngine_1.broadcastToUsers)(Array.from(relevantUserIds), {
            type: realtimeEngine_1.RealtimeEventType.PRESENCE_UPDATE,
            sourceUserId: uid,
            payload: {
                userId: uid,
                status,
                lastSeenAt: now.toMillis(),
                platform,
                customStatus,
            },
        });
        v2_1.logger.info(`Presence updated: ${uid} -> ${status}`);
        return {
            success: true,
            status,
            lastSeenAt: now,
        };
    }
    catch (error) {
        v2_1.logger.error("Failed to update presence:", error);
        throw new https_1.HttpsError("internal", "Failed to update presence");
    }
});
/**
 * Get presence for multiple users
 */
exports.getPresenceV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { userIds } = request.data;
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        throw new https_1.HttpsError("invalid-argument", "userIds array required");
    }
    if (userIds.length > 100) {
        throw new https_1.HttpsError("invalid-argument", "Maximum 100 userIds per request");
    }
    try {
        // Batch get presence data
        const presencePromises = userIds.map((userId) => db.collection("userPresence").doc(userId).get());
        const presenceDocs = await Promise.all(presencePromises);
        const presenceMap = {};
        presenceDocs.forEach((doc, index) => {
            const userId = userIds[index];
            if (doc.exists) {
                const data = doc.data();
                // Determine actual status based on lastSeenAt
                const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
                const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
                let actualStatus = data.status;
                if (data.lastSeenAt.toMillis() < thirtyMinutesAgo) {
                    actualStatus = PresenceStatus.OFFLINE;
                }
                else if (data.lastSeenAt.toMillis() < fiveMinutesAgo && data.status === PresenceStatus.ONLINE) {
                    actualStatus = PresenceStatus.AWAY;
                }
                presenceMap[userId] = {
                    status: actualStatus,
                    lastSeenAt: data.lastSeenAt.toMillis(),
                    platform: data.platform,
                    customStatus: data.customStatus,
                };
            }
            else {
                presenceMap[userId] = {
                    status: PresenceStatus.OFFLINE,
                    lastSeenAt: null,
                };
            }
        });
        return { presence: presenceMap };
    }
    catch (error) {
        v2_1.logger.error("Failed to get presence:", error);
        throw new https_1.HttpsError("internal", "Failed to get presence");
    }
});
/**
 * Send typing indicator
 */
exports.sendTypingIndicatorV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Check feature flag
    const enabled = await (0, featureFlags_1.getFeatureFlag)(uid, "realtime_presence", true);
    if (!enabled) {
        return { enabled: false };
    }
    // Validate input
    const schema = zod_1.z.object({
        chatId: zod_1.z.string(),
        isTyping: zod_1.z.boolean(),
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { chatId, isTyping } = validationResult.data;
    try {
        // Verify user is participant in chat
        const chatDoc = await db.collection("chats").doc(chatId).get();
        if (!chatDoc.exists) {
            throw new https_1.HttpsError("not-found", "Chat not found");
        }
        const chat = chatDoc.data();
        if (!chat?.participants.includes(uid)) {
            throw new https_1.HttpsError("permission-denied", "Not a participant in this chat");
        }
        // Update user presence with typing status
        if (isTyping) {
            await db
                .collection("userPresence")
                .doc(uid)
                .update({
                isTypingIn: firestore_1.FieldValue.arrayUnion(chatId),
                lastActiveAt: firestore_1.Timestamp.now(),
            });
        }
        else {
            await db
                .collection("userPresence")
                .doc(uid)
                .update({
                isTypingIn: firestore_1.FieldValue.arrayRemove(chatId),
            });
        }
        // Broadcast to other participants
        const otherParticipants = chat.participants.filter((id) => id !== uid);
        await (0, realtimeEngine_1.broadcastToUsers)(otherParticipants, {
            type: realtimeEngine_1.RealtimeEventType.TYPING_INDICATOR,
            sourceUserId: uid,
            payload: {
                chatId,
                userId: uid,
                isTyping,
            },
            ttl: 5, // 5 second TTL
        });
        v2_1.logger.debug(`Typing indicator: ${uid} in ${chatId}: ${isTyping}`);
        return { success: true };
    }
    catch (error) {
        v2_1.logger.error("Failed to send typing indicator:", error);
        throw new https_1.HttpsError("internal", "Failed to send typing indicator");
    }
});
/**
 * Send read receipt
 */
exports.sendReadReceiptV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Validate input
    const schema = zod_1.z.object({
        chatId: zod_1.z.string(),
        messageId: zod_1.z.string(),
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { chatId, messageId } = validationResult.data;
    try {
        // Verify user is participant in chat
        const chatDoc = await db.collection("chats").doc(chatId).get();
        if (!chatDoc.exists) {
            throw new https_1.HttpsError("not-found", "Chat not found");
        }
        const chat = chatDoc.data();
        if (!chat?.participants.includes(uid)) {
            throw new https_1.HttpsError("permission-denied", "Not a participant in this chat");
        }
        // Update read receipt
        const now = firestore_1.Timestamp.now();
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
                await (0, realtimeEngine_1.broadcastToUser)(senderId, {
                    type: realtimeEngine_1.RealtimeEventType.READ_RECEIPT,
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
        v2_1.logger.debug(`Read receipt: ${uid} read ${messageId} in ${chatId}`);
        return {
            success: true,
            readAt: now,
        };
    }
    catch (error) {
        v2_1.logger.error("Failed to send read receipt:", error);
        throw new https_1.HttpsError("internal", "Failed to send read receipt");
    }
});
/**
 * Batch read receipts (mark all messages as read in a chat)
 */
exports.markChatAsReadV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { chatId } = request.data;
    if (!chatId) {
        throw new https_1.HttpsError("invalid-argument", "chatId required");
    }
    try {
        // Verify user is participant in chat
        const chatDoc = await db.collection("chats").doc(chatId).get();
        if (!chatDoc.exists) {
            throw new https_1.HttpsError("not-found", "Chat not found");
        }
        const chat = chatDoc.data();
        if (!chat?.participants.includes(uid)) {
            throw new https_1.HttpsError("permission-denied", "Not a participant in this chat");
        }
        const now = firestore_1.Timestamp.now();
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
            .where("createdAt", ">", chat.lastReadAt?.[uid] || firestore_1.Timestamp.fromMillis(0))
            .get();
        // Batch update read receipts
        const batch = db.batch();
        unreadMessages.docs.forEach((doc) => {
            batch.update(doc.ref, {
                [`readBy.${uid}`]: now,
            });
        });
        await batch.commit();
        v2_1.logger.info(`Marked ${unreadMessages.size} messages as read in ${chatId}`);
        return {
            success: true,
            markedCount: unreadMessages.size,
            readAt: now,
        };
    }
    catch (error) {
        v2_1.logger.error("Failed to mark chat as read:", error);
        throw new https_1.HttpsError("internal", "Failed to mark chat as read");
    }
});
/**
 * Get typing users in a chat
 */
async function getTypingUsers(chatId) {
    try {
        const oneMinuteAgo = firestore_1.Timestamp.fromMillis(Date.now() - 60 * 1000);
        const typingUsersSnapshot = await db
            .collection("userPresence")
            .where("isTypingIn", "array-contains", chatId)
            .where("lastActiveAt", ">", oneMinuteAgo)
            .get();
        return typingUsersSnapshot.docs.map((doc) => doc.id);
    }
    catch (error) {
        v2_1.logger.error("Failed to get typing users:", error);
        return [];
    }
}
/**
 * Cleanup stale typing indicators (scheduler)
 */
async function cleanupStaleTypingIndicators() {
    try {
        const oneMinuteAgo = firestore_1.Timestamp.fromMillis(Date.now() - 60 * 1000);
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
        v2_1.logger.info(`Cleaned up ${staleTypingSnapshot.size} stale typing indicators`);
    }
    catch (error) {
        v2_1.logger.error("Failed to cleanup stale typing indicators:", error);
    }
}
//# sourceMappingURL=presence.js.map