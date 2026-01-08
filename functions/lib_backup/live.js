"use strict";
/**
 * Live Streaming Functions (Phase 9)
 *
 * Callable functions:
 * - createLiveSession: Host creates a live stream (1:1 or public)
 * - joinLiveSession: Viewer joins a live stream
 * - endLiveSession: Host ends the stream
 * - sendLiveTip: Viewer sends a tip during live stream
 *
 * Scheduled functions:
 * - tickBillingScheduler: Every 10s, bill active viewers
 *
 * Firestore collections:
 * - liveSessions/{id} - Live stream sessions
 * - liveTips/{id} - Tips sent during streams
 *
 * Pricing:
 * - 1:1 video: 30/70 split (30% platform, 70% host)
 * - Public stream: Free to watch, tips 80/20 split
 * - 1:1 billing: Per 10s tick
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.tickBillingScheduler = exports.sendLiveTipCallable = exports.endLiveSessionCallable = exports.joinLiveSessionCallable = exports.createLiveSessionCallable = exports.LiveSessionStatus = exports.LiveSessionType = void 0;
exports.getHostActiveSessions = getHostActiveSessions;
exports.getSessionViewerCount = getSessionViewerCount;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const analytics_1 = require("./analytics");
const logAnalyticsEvent = (eventName, properties) => {
    return (0, analytics_1.logServerEvent)(eventName, properties, properties.userId || "system");
};
const db = (0, firestore_1.getFirestore)();
/**
 * Live session types
 */
var LiveSessionType;
(function (LiveSessionType) {
    LiveSessionType["ONE_ON_ONE"] = "1on1";
    LiveSessionType["PUBLIC"] = "public";
})(LiveSessionType || (exports.LiveSessionType = LiveSessionType = {}));
/**
 * Live session status
 */
var LiveSessionStatus;
(function (LiveSessionStatus) {
    LiveSessionStatus["SCHEDULED"] = "scheduled";
    LiveSessionStatus["LIVE"] = "live";
    LiveSessionStatus["ENDED"] = "ended";
    LiveSessionStatus["CANCELLED"] = "cancelled";
})(LiveSessionStatus || (exports.LiveSessionStatus = LiveSessionStatus = {}));
/**
 * Create a live session
 */
exports.createLiveSessionCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { type, title, description, tokensPerTick, scheduledFor } = request.data;
    if (!type || !title) {
        throw new https_1.HttpsError("invalid-argument", "Missing required fields");
    }
    // Validate type
    if (type !== LiveSessionType.ONE_ON_ONE && type !== LiveSessionType.PUBLIC) {
        throw new https_1.HttpsError("invalid-argument", "Invalid session type");
    }
    // For 1:1, require tokensPerTick
    if (type === LiveSessionType.ONE_ON_ONE && !tokensPerTick) {
        throw new https_1.HttpsError("invalid-argument", "1:1 sessions require tokensPerTick");
    }
    try {
        // Get host info
        const hostDoc = await db.collection("users").doc(uid).get();
        const hostData = hostDoc.data();
        if (!hostData) {
            throw new https_1.HttpsError("not-found", "Host user not found");
        }
        // Create session
        const sessionRef = db.collection("liveSessions").doc();
        const session = {
            id: sessionRef.id,
            type,
            status: scheduledFor ? LiveSessionStatus.SCHEDULED : LiveSessionStatus.LIVE,
            hostId: uid,
            hostName: hostData.name || "Unknown",
            hostAvatar: hostData.photos?.[0],
            title,
            description,
            tokensPerTick: type === LiveSessionType.ONE_ON_ONE ? tokensPerTick : undefined,
            viewerIds: [],
            maxViewers: type === LiveSessionType.ONE_ON_ONE ? 1 : undefined,
            scheduledFor: scheduledFor ? firestore_1.Timestamp.fromMillis(scheduledFor) : undefined,
            startedAt: !scheduledFor ? firestore_1.FieldValue.serverTimestamp() : undefined,
            totalViewers: 0,
            totalTips: 0,
            totalRevenue: 0,
            duration: 0,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        await sessionRef.set(session);
        logAnalyticsEvent("live_session_created", {
            sessionId: sessionRef.id,
            hostId: uid,
            type,
        });
        return {
            success: true,
            sessionId: sessionRef.id,
            session,
        };
    }
    catch (error) {
        console.error("Error creating live session:", error);
        throw new https_1.HttpsError("internal", "Failed to create live session");
    }
});
/**
 * Join a live session
 */
exports.joinLiveSessionCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { sessionId } = request.data;
    if (!sessionId) {
        throw new https_1.HttpsError("invalid-argument", "Missing sessionId");
    }
    try {
        const sessionRef = db.collection("liveSessions").doc(sessionId);
        const sessionDoc = await sessionRef.get();
        if (!sessionDoc.exists) {
            throw new https_1.HttpsError("not-found", "Session not found");
        }
        const session = sessionDoc.data();
        // Check if session is live
        if (session.status !== LiveSessionStatus.LIVE) {
            throw new https_1.HttpsError("failed-precondition", "Session is not live");
        }
        // Check if host is trying to join (hosts are always allowed)
        if (uid === session.hostId) {
            return {
                success: true,
                role: "host",
                session,
            };
        }
        // Check max viewers (for 1:1)
        if (session.maxViewers && session.viewerIds.length >= session.maxViewers) {
            throw new https_1.HttpsError("resource-exhausted", "Session is full");
        }
        // Check if user already joined
        const alreadyJoined = session.viewerIds.includes(uid);
        // For 1:1, check wallet balance
        if (session.type === LiveSessionType.ONE_ON_ONE) {
            const userDoc = await db.collection("users").doc(uid).get();
            const userData = userDoc.data();
            const walletBalance = userData?.wallet?.balance || 0;
            // Need at least 10 ticks worth (100s = 1min40s minimum)
            const minBalance = (session.tokensPerTick || 0) * 10;
            if (walletBalance < minBalance) {
                throw new https_1.HttpsError("failed-precondition", `Insufficient balance. Need at least ${minBalance} tokens.`);
            }
        }
        // Add viewer if not already joined
        if (!alreadyJoined) {
            await sessionRef.update({
                viewerIds: firestore_1.FieldValue.arrayUnion(uid),
                totalViewers: firestore_1.FieldValue.increment(1),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        logAnalyticsEvent("live_session_joined", {
            sessionId,
            userId: uid,
            type: session.type,
        });
        return {
            success: true,
            role: "viewer",
            session: {
                ...session,
                viewerIds: alreadyJoined ? session.viewerIds : [...session.viewerIds, uid],
            },
        };
    }
    catch (error) {
        console.error("Error joining live session:", error);
        if (error instanceof https_1.HttpsError)
            throw error;
        throw new https_1.HttpsError("internal", "Failed to join live session");
    }
});
/**
 * End a live session
 */
exports.endLiveSessionCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { sessionId } = request.data;
    if (!sessionId) {
        throw new https_1.HttpsError("invalid-argument", "Missing sessionId");
    }
    try {
        const sessionRef = db.collection("liveSessions").doc(sessionId);
        const sessionDoc = await sessionRef.get();
        if (!sessionDoc.exists) {
            throw new https_1.HttpsError("not-found", "Session not found");
        }
        const session = sessionDoc.data();
        // Only host can end session
        if (session.hostId !== uid) {
            throw new https_1.HttpsError("permission-denied", "Only host can end session");
        }
        // Calculate duration
        const startedAt = session.startedAt;
        const duration = startedAt ? Math.floor((Date.now() - startedAt.toMillis()) / 1000) : 0;
        // Update session
        await sessionRef.update({
            status: LiveSessionStatus.ENDED,
            endedAt: firestore_1.FieldValue.serverTimestamp(),
            duration,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        logAnalyticsEvent("live_session_ended", {
            sessionId,
            hostId: uid,
            duration,
            totalViewers: session.totalViewers,
            totalTips: session.totalTips,
        });
        return {
            success: true,
            duration,
            totalViewers: session.totalViewers,
            totalRevenue: session.totalRevenue,
        };
    }
    catch (error) {
        console.error("Error ending live session:", error);
        if (error instanceof https_1.HttpsError)
            throw error;
        throw new https_1.HttpsError("internal", "Failed to end live session");
    }
});
/**
 * Send a tip during live stream
 */
exports.sendLiveTipCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { sessionId, amount, message } = request.data;
    if (!sessionId || !amount || amount <= 0) {
        throw new https_1.HttpsError("invalid-argument", "Missing or invalid fields");
    }
    try {
        // Get session
        const sessionDoc = await db.collection("liveSessions").doc(sessionId).get();
        if (!sessionDoc.exists) {
            throw new https_1.HttpsError("not-found", "Session not found");
        }
        const session = sessionDoc.data();
        if (session.status !== LiveSessionStatus.LIVE) {
            throw new https_1.HttpsError("failed-precondition", "Session is not live");
        }
        const recipientId = session.hostId;
        // Check sender balance
        const senderDoc = await db.collection("users").doc(uid).get();
        const senderData = senderDoc.data();
        const senderBalance = senderData?.wallet?.balance || 0;
        if (senderBalance < amount) {
            throw new https_1.HttpsError("failed-precondition", "Insufficient balance");
        }
        // Transaction: Deduct from sender, credit to recipient (80/20 split)
        const platformFee = Math.floor(amount * 0.20); // 20% platform fee
        const recipientAmount = amount - platformFee;
        await db.runTransaction(async (tx) => {
            const senderRef = db.collection("users").doc(uid);
            const recipientRef = db.collection("users").doc(recipientId);
            // Deduct from sender
            tx.update(senderRef, {
                "wallet.balance": firestore_1.FieldValue.increment(-amount),
                "wallet.spent": firestore_1.FieldValue.increment(amount),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            // Credit recipient
            tx.update(recipientRef, {
                "wallet.balance": firestore_1.FieldValue.increment(recipientAmount),
                "wallet.earned": firestore_1.FieldValue.increment(recipientAmount),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            // Create tip record
            const tipRef = db.collection("liveTips").doc();
            const tip = {
                id: tipRef.id,
                sessionId,
                senderId: uid,
                recipientId,
                amount,
                message,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            };
            tx.set(tipRef, tip);
            // Update session stats
            const sessionRef = db.collection("liveSessions").doc(sessionId);
            tx.update(sessionRef, {
                totalTips: firestore_1.FieldValue.increment(amount),
                totalRevenue: firestore_1.FieldValue.increment(recipientAmount),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            // Create transaction records
            const txId = `tx_${Date.now()}_${uid.substring(0, 8)}`;
            tx.set(db.collection("transactions").doc(txId), {
                txId,
                type: "live_tip",
                uid,
                recipientId,
                amount: -amount,
                sessionId,
                tipId: tipRef.id,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
            tx.set(db.collection("transactions").doc(`${txId}_earn`), {
                txId: `${txId}_earn`,
                type: "live_tip_received",
                uid: recipientId,
                senderId: uid,
                amount: recipientAmount,
                sessionId,
                tipId: tipRef.id,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
        });
        logAnalyticsEvent("live_tip_sent", {
            sessionId,
            senderId: uid,
            recipientId,
            amount,
        });
        return {
            success: true,
            amount,
            recipientAmount,
            platformFee,
        };
    }
    catch (error) {
        console.error("Error sending live tip:", error);
        if (error instanceof https_1.HttpsError)
            throw error;
        throw new https_1.HttpsError("internal", "Failed to send tip");
    }
});
/**
 * Scheduled function: Bill active 1:1 viewers every 10 seconds
 * Runs via Pub/Sub on schedule
 */
exports.tickBillingScheduler = (0, scheduler_1.onSchedule)({
    schedule: "*/10 * * * * *", // Every 10 seconds
    region: "europe-west3",
    timeoutSeconds: 60,
}, async (event) => {
    console.log("Running tick billing...");
    try {
        // Get all live 1:1 sessions
        const liveSessions = await db
            .collection("liveSessions")
            .where("status", "==", LiveSessionStatus.LIVE)
            .where("type", "==", LiveSessionType.ONE_ON_ONE)
            .get();
        if (liveSessions.empty) {
            console.log("No active 1:1 sessions");
            return;
        }
        console.log(`Found ${liveSessions.size} active 1:1 sessions`);
        // Process each session
        const promises = liveSessions.docs.map(async (sessionDoc) => {
            const session = sessionDoc.data();
            const sessionId = sessionDoc.id;
            // Skip if no active viewers
            if (!session.viewerIds || session.viewerIds.length === 0) {
                return;
            }
            const tokensPerTick = session.tokensPerTick || 0;
            const hostId = session.hostId;
            // Bill each viewer
            for (const viewerId of session.viewerIds) {
                try {
                    await db.runTransaction(async (tx) => {
                        const viewerRef = db.collection("users").doc(viewerId);
                        const viewerDoc = await tx.get(viewerRef);
                        const viewerData = viewerDoc.data();
                        const balance = viewerData?.wallet?.balance || 0;
                        // If insufficient balance, remove from session
                        if (balance < tokensPerTick) {
                            console.log(`Viewer ${viewerId} has insufficient balance, removing from session`);
                            const sessionRef = db.collection("liveSessions").doc(sessionId);
                            tx.update(sessionRef, {
                                viewerIds: firestore_1.FieldValue.arrayRemove(viewerId),
                                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                            });
                            return;
                        }
                        // Deduct from viewer
                        tx.update(viewerRef, {
                            "wallet.balance": firestore_1.FieldValue.increment(-tokensPerTick),
                            "wallet.spent": firestore_1.FieldValue.increment(tokensPerTick),
                            updatedAt: firestore_1.FieldValue.serverTimestamp(),
                        });
                        // Credit host (70%)
                        const hostAmount = Math.floor(tokensPerTick * 0.70);
                        const hostRef = db.collection("users").doc(hostId);
                        tx.update(hostRef, {
                            "wallet.balance": firestore_1.FieldValue.increment(hostAmount),
                            "wallet.earned": firestore_1.FieldValue.increment(hostAmount),
                            updatedAt: firestore_1.FieldValue.serverTimestamp(),
                        });
                        // Update session revenue
                        const sessionRef = db.collection("liveSessions").doc(sessionId);
                        tx.update(sessionRef, {
                            totalRevenue: firestore_1.FieldValue.increment(hostAmount),
                            duration: firestore_1.FieldValue.increment(10), // Add 10 seconds
                            updatedAt: firestore_1.FieldValue.serverTimestamp(),
                        });
                        // Create transaction records
                        const txId = `tx_tick_${Date.now()}_${viewerId.substring(0, 8)}`;
                        tx.set(db.collection("transactions").doc(txId), {
                            txId,
                            type: "live_1on1_tick",
                            uid: viewerId,
                            recipientId: hostId,
                            amount: -tokensPerTick,
                            sessionId,
                            createdAt: firestore_1.FieldValue.serverTimestamp(),
                        });
                    });
                }
                catch (error) {
                    console.error(`Error billing viewer ${viewerId}:`, error);
                }
            }
        });
        await Promise.all(promises);
        console.log("Tick billing completed");
    }
    catch (error) {
        console.error("Error in tick billing:", error);
    }
});
/**
 * Helper: Get active sessions for a host
 */
async function getHostActiveSessions(hostId) {
    const snapshot = await db
        .collection("liveSessions")
        .where("hostId", "==", hostId)
        .where("status", "==", LiveSessionStatus.LIVE)
        .get();
    return snapshot.docs.map(doc => doc.data());
}
/**
 * Helper: Get viewer count for a session
 */
async function getSessionViewerCount(sessionId) {
    const sessionDoc = await db.collection("liveSessions").doc(sessionId).get();
    const session = sessionDoc.data();
    return session?.viewerIds?.length || 0;
}
//# sourceMappingURL=live.js.map