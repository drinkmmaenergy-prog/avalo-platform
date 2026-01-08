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

import { HttpsError } from 'firebase-functions/v2/https';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
;
;
;

const db = getFirestore();

/**
 * Call types
 */
export enum CallType {
  AUDIO = "audio",
  VIDEO = "video",
  AUDIO_SPACE = "audio_space", // Group audio
}

/**
 * Call status
 */
export enum CallStatus {
  PENDING = "pending",
  RINGING = "ringing",
  ACTIVE = "active",
  ENDED = "ended",
  DECLINED = "declined",
  MISSED = "missed",
}

/**
 * Call session
 */
interface CallSession {
  callId: string;
  type: CallType;
  hostId: string;
  participantIds: string[];
  status: CallStatus;
  startedAt?: Timestamp;
  endedAt?: Timestamp;
  duration?: number; // seconds
  pricePerMinute: number;
  totalCost?: number;
  iceServers: any[];
  createdAt: Timestamp;
}

/**
 * Start a call
 */
export const startCallV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    // Check feature flag
    const enabled = await getFeatureFlag(uid, "voice_video_enabled", false);
    if (!enabled) {
      throw new HttpsError("failed-precondition", "Voice/video not enabled");
    }

    // Validate input
    const schema = z.object({
      type: z.enum(["audio", "video", "audio_space"]),
      participantIds: z.array(z.string()).min(1).max(50),
      pricePerMinute: z.number().min(0).max(1000).optional(),
    });

    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", validationResult.error.message);
    }

    const { type, participantIds, pricePerMinute } = validationResult.data;

    try {
      // Verify user is verified creator for paid calls
      if (pricePerMinute && pricePerMinute > 0) {
        const userDoc = await db.collection("users").doc(uid).get();
        if (!userDoc.exists || userDoc.data()?.verification?.status !== "approved") {
          throw new HttpsError("permission-denied", "Creator verification required");
        }
      }

      const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const callSession: CallSession = {
        callId,
        type: type as CallType,
        hostId: uid,
        participantIds,
        status: CallStatus.PENDING,
        pricePerMinute: pricePerMinute || 0,
        iceServers: getICEServers(),
        createdAt: Timestamp.now(),
      };

      await db.collection("callSessions").doc(callId).set(callSession);

      // Send notifications to participants
      // (Would integrate with realtime engine)

      logger.info(`Call started: ${callId} by ${uid}`);

      return {
        callId,
        iceServers: callSession.iceServers,
        status: CallStatus.PENDING,
      };
    } catch (error: any) {
      logger.error("Failed to start call:", error);
      throw new HttpsError("internal", "Failed to start call");
    }
  }
);

/**
 * Join a call
 */
export const joinCallV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { callId } = request.data;

    if (!callId) {
      throw new HttpsError("invalid-argument", "callId required");
    }

    try {
      const callRef = db.collection("callSessions").doc(callId);
      const callDoc = await callRef.get();

      if (!callDoc.exists) {
        throw new HttpsError("not-found", "Call not found");
      }

      const call = callDoc.data() as CallSession;

      // Verify user is invited
      if (!call.participantIds.includes(uid) && call.hostId !== uid) {
        throw new HttpsError("permission-denied", "Not invited to this call");
      }

      // Check call status
      if (call.status === CallStatus.ENDED) {
        throw new HttpsError("failed-precondition", "Call has ended");
      }

      // Update call status
      if (call.status === CallStatus.PENDING) {
        await callRef.update({
          status: CallStatus.ACTIVE,
          startedAt: Timestamp.now(),
        });
      }

      // Check if paid call - verify buyer has tokens
      if (call.pricePerMinute > 0 && uid !== call.hostId) {
        const userDoc = await db.collection("users").doc(uid).get();
        const userTokens = userDoc.data()?.tokens || 0;

        // Estimate 10 minutes as initial authorization
        const estimatedCost = call.pricePerMinute * 10;

        if (userTokens < estimatedCost) {
          throw new HttpsError("failed-precondition", "Insufficient tokens");
        }

        // Hold tokens
        await db.collection("users").doc(uid).update({
          tokensOnHold: FieldValue.increment(estimatedCost),
        });
      }

      logger.info(`User ${uid} joined call ${callId}`);

      return {
        callId,
        iceServers: call.iceServers,
        pricePerMinute: call.pricePerMinute,
        startedAt: call.startedAt,
      };
    } catch (error: any) {
      logger.error("Failed to join call:", error);
      throw new HttpsError("internal", "Failed to join call");
    }
  }
);

/**
 * End a call
 */
export const endCallV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { callId } = request.data;

    if (!callId) {
      throw new HttpsError("invalid-argument", "callId required");
    }

    try {
      const callRef = db.collection("callSessions").doc(callId);
      const callDoc = await callRef.get();

      if (!callDoc.exists) {
        throw new HttpsError("not-found", "Call not found");
      }

      const call = callDoc.data() as CallSession;

      // Only host can end call
      if (call.hostId !== uid) {
        throw new HttpsError("permission-denied", "Only host can end call");
      }

      const now = Timestamp.now();
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

      logger.info(`Call ended: ${callId}, duration: ${Math.round(durationSeconds)}s, cost: ${totalCost}`);

      return {
        callId,
        duration: Math.round(durationSeconds),
        totalCost,
      };
    } catch (error: any) {
      logger.error("Failed to end call:", error);
      throw new HttpsError("internal", "Failed to end call");
    }
  }
);

/**
 * Process call payment (30/70 split)
 */
async function processCallPayment(
  callId: string,
  call: CallSession,
  totalCost: number
): Promise<void> {
  try {
    const platformFee = Math.floor(totalCost * 0.3); // 30%
    const creatorEarnings = totalCost - platformFee; // 70%

    // Process each participant
    for (const participantId of call.participantIds) {
      if (participantId === call.hostId) continue;

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
          tokens: FieldValue.increment(-totalCost),
          tokensOnHold: FieldValue.increment(-Math.min(tokensOnHold, totalCost)),
        });

        // Credit host
        transaction.update(hostRef, {
          tokens: FieldValue.increment(creatorEarnings),
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
          createdAt: Timestamp.now(),
        });
      });
    }

    logger.info(`Call payment processed: ${callId}, total: ${totalCost}`);
  } catch (error: any) {
    logger.error("Failed to process call payment:", error);
  }
}

/**
 * Get ICE servers for WebRTC
 */
function getICEServers(): any[] {
  return [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    // In production, add TURN servers
  ];
}

/**
 * WebRTC signaling (SDP exchange)
 */
export const sendSignalingMessageV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { callId, targetUserId, type, sdp, candidate } = request.data;

    if (!callId || !targetUserId) {
      throw new HttpsError("invalid-argument", "callId and targetUserId required");
    }

    try {
      // Store signaling message
      await db.collection("callSessions").doc(callId).collection("signals").add({
        fromUserId: uid,
        toUserId: targetUserId,
        type,
        sdp,
        candidate,
        createdAt: Timestamp.now(),
      });

      // In production, broadcast via realtime engine
      logger.debug(`Signaling message: ${type} from ${uid} to ${targetUserId}`);

      return { success: true };
    } catch (error: any) {
      logger.error("Failed to send signaling message:", error);
      throw new HttpsError("internal", "Failed to send message");
    }
  }
);


