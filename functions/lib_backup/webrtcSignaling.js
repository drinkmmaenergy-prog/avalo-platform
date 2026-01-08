"use strict";
/**
 * PHASE 30 - Voice & Video Interactions
 *
 * WebRTC signaling server for 1:1 and group calls
 * Audio spaces and live billing (30/70 split)
 * Target latency: <200ms
 *
 * Feature flag: voice_video_enabled
 * Region: europe-west3
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSignalingMessageV1 = exports.endCallV1 = exports.joinCallV1 = exports.startCallV1 = exports.CallStatus = exports.CallType = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const v2_1 = require("firebase-functions/v2");
const zod_1 = require("zod");
const featureFlags_1 = require("./featureFlags");
const db = (0, firestore_1.getFirestore)();
/**
 * Call types
 */
var CallType;
(function (CallType) {
    CallType["AUDIO"] = "audio";
    CallType["VIDEO"] = "video";
    CallType["AUDIO_SPACE"] = "audio_space";
})(CallType || (exports.CallType = CallType = {}));
/**
 * Call status
 */
var CallStatus;
(function (CallStatus) {
    CallStatus["PENDING"] = "pending";
    CallStatus["RINGING"] = "ringing";
    CallStatus["ACTIVE"] = "active";
    CallStatus["ENDED"] = "ended";
    CallStatus["DECLINED"] = "declined";
    CallStatus["MISSED"] = "missed";
})(CallStatus || (exports.CallStatus = CallStatus = {}));
/**
 * Start a call
 */
exports.startCallV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Check feature flag
    const enabled = await (0, featureFlags_1.getFeatureFlag)(uid, "voice_video_enabled", false);
    if (!enabled) {
        throw new https_1.HttpsError("failed-precondition", "Voice/video not enabled");
    }
    // Validate input
    const schema = zod_1.z.object({
        type: zod_1.z.enum(["audio", "video", "audio_space"]),
        participantIds: zod_1.z.array(zod_1.z.string()).min(1).max(50),
        pricePerMinute: zod_1.z.number().min(0).max(1000).optional(),
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { type, participantIds, pricePerMinute } = validationResult.data;
    try {
        // Verify user is verified creator for paid calls
        if (pricePerMinute && pricePerMinute > 0) {
            const userDoc = await db.collection("users").doc(uid).get();
            if (!userDoc.exists || userDoc.data()?.verification?.status !== "approved") {
                throw new https_1.HttpsError("permission-denied", "Creator verification required");
            }
        }
        const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const callSession = {
            callId,
            type: type,
            hostId: uid,
            participantIds,
            status: CallStatus.PENDING,
            pricePerMinute: pricePerMinute || 0,
            iceServers: getICEServers(),
            createdAt: firestore_1.Timestamp.now(),
        };
        await db.collection("callSessions").doc(callId).set(callSession);
        // Send notifications to participants
        // (Would integrate with realtime engine)
        v2_1.logger.info(`Call started: ${callId} by ${uid}`);
        return {
            callId,
            iceServers: callSession.iceServers,
            status: CallStatus.PENDING,
        };
    }
    catch (error) {
        v2_1.logger.error("Failed to start call:", error);
        throw new https_1.HttpsError("internal", "Failed to start call");
    }
});
/**
 * Join a call
 */
exports.joinCallV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { callId } = request.data;
    if (!callId) {
        throw new https_1.HttpsError("invalid-argument", "callId required");
    }
    try {
        const callRef = db.collection("callSessions").doc(callId);
        const callDoc = await callRef.get();
        if (!callDoc.exists) {
            throw new https_1.HttpsError("not-found", "Call not found");
        }
        const call = callDoc.data();
        // Verify user is invited
        if (!call.participantIds.includes(uid) && call.hostId !== uid) {
            throw new https_1.HttpsError("permission-denied", "Not invited to this call");
        }
        // Check call status
        if (call.status === CallStatus.ENDED) {
            throw new https_1.HttpsError("failed-precondition", "Call has ended");
        }
        // Update call status
        if (call.status === CallStatus.PENDING) {
            await callRef.update({
                status: CallStatus.ACTIVE,
                startedAt: firestore_1.Timestamp.now(),
            });
        }
        // Check if paid call - verify buyer has tokens
        if (call.pricePerMinute > 0 && uid !== call.hostId) {
            const userDoc = await db.collection("users").doc(uid).get();
            const userTokens = userDoc.data()?.tokens || 0;
            // Estimate 10 minutes as initial authorization
            const estimatedCost = call.pricePerMinute * 10;
            if (userTokens < estimatedCost) {
                throw new https_1.HttpsError("failed-precondition", "Insufficient tokens");
            }
            // Hold tokens
            await db.collection("users").doc(uid).update({
                tokensOnHold: firestore_1.FieldValue.increment(estimatedCost),
            });
        }
        v2_1.logger.info(`User ${uid} joined call ${callId}`);
        return {
            callId,
            iceServers: call.iceServers,
            pricePerMinute: call.pricePerMinute,
            startedAt: call.startedAt,
        };
    }
    catch (error) {
        v2_1.logger.error("Failed to join call:", error);
        throw new https_1.HttpsError("internal", "Failed to join call");
    }
});
/**
 * End a call
 */
exports.endCallV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { callId } = request.data;
    if (!callId) {
        throw new https_1.HttpsError("invalid-argument", "callId required");
    }
    try {
        const callRef = db.collection("callSessions").doc(callId);
        const callDoc = await callRef.get();
        if (!callDoc.exists) {
            throw new https_1.HttpsError("not-found", "Call not found");
        }
        const call = callDoc.data();
        // Only host can end call
        if (call.hostId !== uid) {
            throw new https_1.HttpsError("permission-denied", "Only host can end call");
        }
        const now = firestore_1.Timestamp.now();
        const durationSeconds = call.startedAt
            ? (now.toMillis() - call.startedAt.toMillis()) / 1000
            : 0;
        // Calculate billing
        const totalCost = Math.ceil((durationSeconds / 60) * call.pricePerMinute);
        await callRef.update({
            status: CallStatus.ENDED,
            endedAt: now,
            duration: Math.round(durationSeconds),
            totalCost,
        });
        // Process payments
        if (totalCost > 0) {
            await processCallPayment(callId, call, totalCost);
        }
        v2_1.logger.info(`Call ended: ${callId}, duration: ${Math.round(durationSeconds)}s, cost: ${totalCost}`);
        return {
            callId,
            duration: Math.round(durationSeconds),
            totalCost,
        };
    }
    catch (error) {
        v2_1.logger.error("Failed to end call:", error);
        throw new https_1.HttpsError("internal", "Failed to end call");
    }
});
/**
 * Process call payment (30/70 split)
 */
async function processCallPayment(callId, call, totalCost) {
    try {
        const platformFee = Math.floor(totalCost * 0.3); // 30%
        const creatorEarnings = totalCost - platformFee; // 70%
        // Process each participant
        for (const participantId of call.participantIds) {
            if (participantId === call.hostId)
                continue;
            // Transaction
            await db.runTransaction(async (transaction) => {
                const participantRef = db.collection("users").doc(participantId);
                const hostRef = db.collection("users").doc(call.hostId);
                const participantDoc = await transaction.get(participantRef);
                const hostDoc = await transaction.get(hostRef);
                const participantTokens = participantDoc.data()?.tokens || 0;
                const tokensOnHold = participantDoc.data()?.tokensOnHold || 0;
                if (participantTokens < totalCost) {
                    throw new Error("Insufficient tokens");
                }
                // Deduct from participant
                transaction.update(participantRef, {
                    tokens: firestore_1.FieldValue.increment(-totalCost),
                    tokensOnHold: firestore_1.FieldValue.increment(-Math.min(tokensOnHold, totalCost)),
                });
                // Credit host
                transaction.update(hostRef, {
                    tokens: firestore_1.FieldValue.increment(creatorEarnings),
                });
                // Create transaction records
                transaction.set(db.collection("transactions").doc(), {
                    type: "call_payment",
                    callId,
                    fromUserId: participantId,
                    toUserId: call.hostId,
                    amount: totalCost,
                    platformFee,
                    creatorEarnings,
                    createdAt: firestore_1.Timestamp.now(),
                });
            });
        }
        v2_1.logger.info(`Call payment processed: ${callId}, total: ${totalCost}`);
    }
    catch (error) {
        v2_1.logger.error("Failed to process call payment:", error);
    }
}
/**
 * Get ICE servers for WebRTC
 */
function getICEServers() {
    return [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        // In production, add TURN servers
    ];
}
/**
 * WebRTC signaling (SDP exchange)
 */
exports.sendSignalingMessageV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { callId, targetUserId, type, sdp, candidate } = request.data;
    if (!callId || !targetUserId) {
        throw new https_1.HttpsError("invalid-argument", "callId and targetUserId required");
    }
    try {
        // Store signaling message
        await db.collection("callSessions").doc(callId).collection("signals").add({
            fromUserId: uid,
            toUserId: targetUserId,
            type,
            sdp,
            candidate,
            createdAt: firestore_1.Timestamp.now(),
        });
        // In production, broadcast via realtime engine
        v2_1.logger.debug(`Signaling message: ${type} from ${uid} to ${targetUserId}`);
        return { success: true };
    }
    catch (error) {
        v2_1.logger.error("Failed to send signaling message:", error);
        throw new https_1.HttpsError("internal", "Failed to send message");
    }
});
//# sourceMappingURL=webrtcSignaling.js.map