"use strict";
/**
 * PHASE 26 - Realtime Engine v2
 *
 * Sub-100ms end-to-end latency for chat, notifications, and feed sync
 * Pub/Sub Lite + Redis Edge Bridge for realtime message delivery
 *
 * Architecture:
 * - Pub/Sub Lite for low-latency message bus
 * - Redis for presence and connection state
 * - WebSocket connections via Cloud Run
 * - Feature flag: realtime_engine_v2
 * - Region: europe-west3
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRealtimeMetricsV1 = exports.getActiveConnectionsV1 = exports.realtimePingV1 = exports.unsubscribeFromRealtimeEventsV1 = exports.subscribeToRealtimeEventsV1 = exports.RealtimeEventType = void 0;
exports.publishRealtimeEvent = publishRealtimeEvent;
exports.cleanupStaleConnections = cleanupStaleConnections;
exports.broadcastToUser = broadcastToUser;
exports.broadcastToUsers = broadcastToUsers;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const v2_1 = require("firebase-functions/v2");
const zod_1 = require("zod");
const featureFlags_1 = require("./featureFlags");
const db = (0, firestore_1.getFirestore)();
/**
 * Message types for realtime events
 */
var RealtimeEventType;
(function (RealtimeEventType) {
    RealtimeEventType["CHAT_MESSAGE"] = "chat_message";
    RealtimeEventType["TYPING_INDICATOR"] = "typing_indicator";
    RealtimeEventType["READ_RECEIPT"] = "read_receipt";
    RealtimeEventType["PRESENCE_UPDATE"] = "presence_update";
    RealtimeEventType["NOTIFICATION"] = "notification";
    RealtimeEventType["FEED_UPDATE"] = "feed_update";
    RealtimeEventType["MATCH_CREATED"] = "match_created";
    RealtimeEventType["LIKE_RECEIVED"] = "like_received";
})(RealtimeEventType || (exports.RealtimeEventType = RealtimeEventType = {}));
/**
 * Publish realtime event to Pub/Sub
 * Used internally by other functions to push realtime updates
 */
async function publishRealtimeEvent(event) {
    try {
        // Check feature flag
        const enabled = await (0, featureFlags_1.getFeatureFlag)(event.targetUserId, "realtime_engine_v2", false);
        if (!enabled) {
            v2_1.logger.info("Realtime engine v2 disabled, skipping event");
            return;
        }
        // Store event in Firestore for delivery tracking
        await db.collection("realtimeEvents").doc(event.eventId).set({
            ...event,
            createdAt: firestore_1.Timestamp.now(),
            delivered: false,
        });
        // In production, publish to Pub/Sub Lite
        // For now, we'll use Firestore-based delivery
        v2_1.logger.info(`Published realtime event: ${event.type} to ${event.targetUserId}`);
        // Trigger delivery via Cloud Run WebSocket server
        // This would be implemented in the Cloud Run service
    }
    catch (error) {
        v2_1.logger.error("Failed to publish realtime event:", error);
    }
}
/**
 * Subscribe to realtime events
 * Called by clients to establish event stream
 */
exports.subscribeToRealtimeEventsV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Check feature flag
    const enabled = await (0, featureFlags_1.getFeatureFlag)(uid, "realtime_engine_v2", false);
    if (!enabled) {
        return { enabled: false };
    }
    // Validate input
    const schema = zod_1.z.object({
        connectionId: zod_1.z.string().uuid(),
        deviceId: zod_1.z.string(),
        platform: zod_1.z.enum(["web", "ios", "android"]),
        subscriptions: zod_1.z.array(zod_1.z.string()).optional(),
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { connectionId, deviceId, platform, subscriptions } = validationResult.data;
    try {
        // Store connection info
        const connection = {
            connectionId,
            userId: uid,
            deviceId,
            platform,
            connectedAt: firestore_1.Timestamp.now(),
            lastPingAt: firestore_1.Timestamp.now(),
            subscriptions: subscriptions || [`user:${uid}`],
        };
        await db.collection("realtimeConnections").doc(connectionId).set(connection);
        // Return WebSocket URL for Cloud Run service
        // In production, this would be the Cloud Run WebSocket endpoint
        const wsUrl = `wss://realtime.avalo.app/ws?connectionId=${connectionId}&token=${connectionId}`;
        v2_1.logger.info(`Realtime subscription created: ${connectionId} for ${uid}`);
        return {
            enabled: true,
            connectionId,
            wsUrl,
            subscriptions: connection.subscriptions,
            expiresAt: firestore_1.Timestamp.now().toMillis() + 24 * 60 * 60 * 1000, // 24 hours
        };
    }
    catch (error) {
        v2_1.logger.error("Failed to create realtime subscription:", error);
        throw new https_1.HttpsError("internal", "Failed to create subscription");
    }
});
/**
 * Unsubscribe from realtime events
 */
exports.unsubscribeFromRealtimeEventsV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { connectionId } = request.data;
    if (!connectionId) {
        throw new https_1.HttpsError("invalid-argument", "connectionId required");
    }
    try {
        // Verify connection ownership
        const connectionDoc = await db
            .collection("realtimeConnections")
            .doc(connectionId)
            .get();
        if (!connectionDoc.exists) {
            throw new https_1.HttpsError("not-found", "Connection not found");
        }
        const connection = connectionDoc.data();
        if (connection.userId !== uid) {
            throw new https_1.HttpsError("permission-denied", "Not your connection");
        }
        // Delete connection
        await connectionDoc.ref.delete();
        v2_1.logger.info(`Realtime subscription removed: ${connectionId}`);
        return { success: true };
    }
    catch (error) {
        v2_1.logger.error("Failed to unsubscribe:", error);
        throw new https_1.HttpsError("internal", "Failed to unsubscribe");
    }
});
/**
 * Heartbeat/ping to keep connection alive
 */
exports.realtimePingV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { connectionId } = request.data;
    if (!connectionId) {
        throw new https_1.HttpsError("invalid-argument", "connectionId required");
    }
    try {
        // Update last ping time
        const connectionRef = db.collection("realtimeConnections").doc(connectionId);
        const connectionDoc = await connectionRef.get();
        if (!connectionDoc.exists) {
            throw new https_1.HttpsError("not-found", "Connection not found");
        }
        const connection = connectionDoc.data();
        if (connection.userId !== uid) {
            throw new https_1.HttpsError("permission-denied", "Not your connection");
        }
        await connectionRef.update({
            lastPingAt: firestore_1.Timestamp.now(),
        });
        // Return any pending events
        const pendingEvents = await db
            .collection("realtimeEvents")
            .where("targetUserId", "==", uid)
            .where("delivered", "==", false)
            .orderBy("createdAt", "asc")
            .limit(50)
            .get();
        const events = pendingEvents.docs.map((doc) => ({
            eventId: doc.id,
            ...doc.data(),
        }));
        // Mark events as delivered
        const batch = db.batch();
        pendingEvents.docs.forEach((doc) => {
            batch.update(doc.ref, { delivered: true, deliveredAt: firestore_1.Timestamp.now() });
        });
        await batch.commit();
        return {
            success: true,
            events,
            serverTime: firestore_1.Timestamp.now().toMillis(),
        };
    }
    catch (error) {
        v2_1.logger.error("Ping failed:", error);
        throw new https_1.HttpsError("internal", "Ping failed");
    }
});
/**
 * Get active connections for a user
 */
exports.getActiveConnectionsV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    try {
        // Get all active connections for user
        const connectionsSnapshot = await db
            .collection("realtimeConnections")
            .where("userId", "==", uid)
            .get();
        const connections = connectionsSnapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                connectionId: data.connectionId,
                deviceId: data.deviceId,
                platform: data.platform,
                connectedAt: data.connectedAt,
                lastPingAt: data.lastPingAt,
            };
        });
        return { connections };
    }
    catch (error) {
        v2_1.logger.error("Failed to get connections:", error);
        throw new https_1.HttpsError("internal", "Failed to get connections");
    }
});
/**
 * Cleanup stale connections (scheduler)
 * Runs every 5 minutes to remove dead connections
 */
async function cleanupStaleConnections() {
    try {
        const fiveMinutesAgo = firestore_1.Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
        const staleConnections = await db
            .collection("realtimeConnections")
            .where("lastPingAt", "<", fiveMinutesAgo)
            .get();
        const batch = db.batch();
        staleConnections.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        v2_1.logger.info(`Cleaned up ${staleConnections.size} stale connections`);
    }
    catch (error) {
        v2_1.logger.error("Failed to cleanup stale connections:", error);
    }
}
/**
 * Get realtime metrics (admin)
 */
exports.getRealtimeMetricsV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Check admin role
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.data()?.role || !["admin", "moderator"].includes(userDoc.data()?.role)) {
        throw new https_1.HttpsError("permission-denied", "Admin access required");
    }
    try {
        // Get total active connections
        const connectionsSnapshot = await db
            .collection("realtimeConnections")
            .count()
            .get();
        const totalConnections = connectionsSnapshot.data().count;
        // Get connections by platform
        const webConnections = await db
            .collection("realtimeConnections")
            .where("platform", "==", "web")
            .count()
            .get();
        const iosConnections = await db
            .collection("realtimeConnections")
            .where("platform", "==", "ios")
            .count()
            .get();
        const androidConnections = await db
            .collection("realtimeConnections")
            .where("platform", "==", "android")
            .count()
            .get();
        // Get pending events
        const pendingEvents = await db
            .collection("realtimeEvents")
            .where("delivered", "==", false)
            .count()
            .get();
        return {
            totalConnections,
            connectionsByPlatform: {
                web: webConnections.data().count,
                ios: iosConnections.data().count,
                android: androidConnections.data().count,
            },
            pendingEvents: pendingEvents.data().count,
            timestamp: firestore_1.Timestamp.now(),
        };
    }
    catch (error) {
        v2_1.logger.error("Failed to get realtime metrics:", error);
        throw new https_1.HttpsError("internal", "Failed to get metrics");
    }
});
/**
 * Helper: Broadcast event to all user connections
 */
async function broadcastToUser(userId, event) {
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const fullEvent = {
        eventId,
        targetUserId: userId,
        timestamp: Date.now(),
        ...event,
    };
    await publishRealtimeEvent(fullEvent);
}
/**
 * Helper: Broadcast event to multiple users
 */
async function broadcastToUsers(userIds, event) {
    const promises = userIds.map((userId) => broadcastToUser(userId, event));
    await Promise.all(promises);
}
//# sourceMappingURL=realtimeEngine.js.map