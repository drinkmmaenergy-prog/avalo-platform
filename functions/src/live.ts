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

;
;
import * as functions from "firebase-functions/v2";
import { HttpsError } from 'firebase-functions/v2/https';
;
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
;
const logAnalyticsEvent = (eventName: string, properties: any) => {
  return logServerEvent(eventName, properties, properties.userId || "system");
};

const db = getFirestore();

/**
 * Live session types
 */
export enum LiveSessionType {
  ONE_ON_ONE = "1on1", // Private video call
  PUBLIC = "public",    // Public stream
}

/**
 * Live session status
 */
export enum LiveSessionStatus {
  SCHEDULED = "scheduled",
  LIVE = "live",
  ENDED = "ended",
  CANCELLED = "cancelled",
}

/**
 * Live session document
 */
export interface LiveSession {
  id: string;
  type: LiveSessionType;
  status: LiveSessionStatus;
  hostId: string;
  hostName: string;
  hostAvatar?: string;
  title: string;
  description?: string;

  // Pricing (for 1:1)
  tokensPerTick?: number; // Cost per 10s for viewer

  // Participants
  viewerIds: string[]; // Array of active viewer UIDs
  maxViewers?: number; // For 1:1, this is 1

  // Timing
  startedAt?: Timestamp | FieldValue;
  endedAt?: Timestamp | FieldValue;
  scheduledFor?: Timestamp | FieldValue;

  // Stats
  totalViewers: number; // Total unique viewers
  totalTips: number; // Total tips received in tokens
  totalRevenue: number; // Total revenue for host in tokens
  duration: number; // Total duration in seconds

  // WebRTC/Streaming
  streamUrl?: string; // URL for stream (Agora/Twilio channel)
  rtcToken?: string; // Temporary token for WebRTC

  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

/**
 * Live tip document
 */
export interface LiveTip {
  id: string;
  sessionId: string;
  senderId: string;
  recipientId: string;
  amount: number; // Tokens
  message?: string;
  createdAt: Timestamp | FieldValue;
}

/**
 * Create a live session
 */
export const createLiveSessionCallable = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { type, title, description, tokensPerTick, scheduledFor } = request.data as {
      type: LiveSessionType;
      title: string;
      description?: string;
      tokensPerTick?: number;
      scheduledFor?: number; // Unix timestamp
    };

    if (!type || !title) {
      throw new HttpsError("invalid-argument", "Missing required fields");
    }

    // Validate type
    if (type !== LiveSessionType.ONE_ON_ONE && type !== LiveSessionType.PUBLIC) {
      throw new HttpsError("invalid-argument", "Invalid session type");
    }

    // For 1:1, require tokensPerTick
    if (type === LiveSessionType.ONE_ON_ONE && !tokensPerTick) {
      throw new HttpsError("invalid-argument", "1:1 sessions require tokensPerTick");
    }

    try {
      // Get host info
      const hostDoc = await db.collection("users").doc(uid).get();
      const hostData = hostDoc.data();

      if (!hostData) {
        throw new HttpsError("not-found", "Host user not found");
      }

      // Create session
      const sessionRef = db.collection("liveSessions").doc();
      const session: LiveSession = {
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
        scheduledFor: scheduledFor ? Timestamp.fromMillis(scheduledFor) : undefined,
        startedAt: !scheduledFor ? FieldValue.serverTimestamp() : undefined,
        totalViewers: 0,
        totalTips: 0,
        totalRevenue: 0,
        duration: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
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
    } catch (error: any) {
      console.error("Error creating live session:", error);
      throw new HttpsError("internal", "Failed to create live session");
    }
  }
);

/**
 * Join a live session
 */
export const joinLiveSessionCallable = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { sessionId } = request.data as { sessionId: string };

    if (!sessionId) {
      throw new HttpsError("invalid-argument", "Missing sessionId");
    }

    try {
      const sessionRef = db.collection("liveSessions").doc(sessionId);
      const sessionDoc = await sessionRef.get();

      if (!sessionDoc.exists) {
        throw new HttpsError("not-found", "Session not found");
      }

      const session = sessionDoc.data() as LiveSession;

      // Check if session is live
      if (session.status !== LiveSessionStatus.LIVE) {
        throw new HttpsError("failed-precondition", "Session is not live");
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
        throw new HttpsError("resource-exhausted", "Session is full");
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
          throw new HttpsError("failed-precondition", `Insufficient balance. Need at least ${minBalance} tokens.`);
        }
      }

      // Add viewer if not already joined
      if (!alreadyJoined) {
        await sessionRef.update({
          viewerIds: FieldValue.arrayUnion(uid),
          totalViewers: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
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
    } catch (error: any) {
      console.error("Error joining live session:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to join live session");
    }
  }
);

/**
 * End a live session
 */
export const endLiveSessionCallable = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { sessionId } = request.data as { sessionId: string };

    if (!sessionId) {
      throw new HttpsError("invalid-argument", "Missing sessionId");
    }

    try {
      const sessionRef = db.collection("liveSessions").doc(sessionId);
      const sessionDoc = await sessionRef.get();

      if (!sessionDoc.exists) {
        throw new HttpsError("not-found", "Session not found");
      }

      const session = sessionDoc.data() as LiveSession;

      // Only host can end session
      if (session.hostId !== uid) {
        throw new HttpsError("permission-denied", "Only host can end session");
      }

      // Calculate duration
      const startedAt = session.startedAt as Timestamp;
      const duration = startedAt ? Math.floor((Date.now() - startedAt.toMillis()) / 1000) : 0;

      // Update session
      await sessionRef.update({
        status: LiveSessionStatus.ENDED,
        endedAt: FieldValue.serverTimestamp(),
        duration,
        updatedAt: FieldValue.serverTimestamp(),
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
    } catch (error: any) {
      console.error("Error ending live session:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to end live session");
    }
  }
);

/**
 * Send a tip during live stream
 */
export const sendLiveTipCallable = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { sessionId, amount, message } = request.data as {
      sessionId: string;
      amount: number;
      message?: string;
    };

    if (!sessionId || !amount || amount <= 0) {
      throw new HttpsError("invalid-argument", "Missing or invalid fields");
    }

    try {
      // Get session
      const sessionDoc = await db.collection("liveSessions").doc(sessionId).get();
      if (!sessionDoc.exists) {
        throw new HttpsError("not-found", "Session not found");
      }

      const session = sessionDoc.data() as LiveSession;

      if (session.status !== LiveSessionStatus.LIVE) {
        throw new HttpsError("failed-precondition", "Session is not live");
      }

      const recipientId = session.hostId;

      // Check sender balance
      const senderDoc = await db.collection("users").doc(uid).get();
      const senderData = senderDoc.data();
      const senderBalance = senderData?.wallet?.balance || 0;

      if (senderBalance < amount) {
        throw new HttpsError("failed-precondition", "Insufficient balance");
      }

      // Transaction: Deduct from sender, credit to recipient (80/20 split)
      const platformFee = Math.floor(amount * 0.20); // 20% platform fee
      const recipientAmount = amount - platformFee;

      await db.runTransaction(async (tx) => {
        const senderRef = db.collection("users").doc(uid);
        const recipientRef = db.collection("users").doc(recipientId);

        // Deduct from sender
        tx.update(senderRef, {
          "wallet.balance": FieldValue.increment(-amount),
          "wallet.spent": FieldValue.increment(amount),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Credit recipient
        tx.update(recipientRef, {
          "wallet.balance": FieldValue.increment(recipientAmount),
          "wallet.earned": FieldValue.increment(recipientAmount),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Create tip record
        const tipRef = db.collection("liveTips").doc();
        const tip: LiveTip = {
          id: tipRef.id,
          sessionId,
          senderId: uid,
          recipientId,
          amount,
          message,
          createdAt: FieldValue.serverTimestamp(),
        };
        tx.set(tipRef, tip);

        // Update session stats
        const sessionRef = db.collection("liveSessions").doc(sessionId);
        tx.update(sessionRef, {
          totalTips: FieldValue.increment(amount),
          totalRevenue: FieldValue.increment(recipientAmount),
          updatedAt: FieldValue.serverTimestamp(),
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
          createdAt: FieldValue.serverTimestamp(),
        });

        tx.set(db.collection("transactions").doc(`${txId}_earn`), {
          txId: `${txId}_earn`,
          type: "live_tip_received",
          uid: recipientId,
          senderId: uid,
          amount: recipientAmount,
          sessionId,
          tipId: tipRef.id,
          createdAt: FieldValue.serverTimestamp(),
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
    } catch (error: any) {
      console.error("Error sending live tip:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to send tip");
    }
  }
);

/**
 * Scheduled function: Bill active 1:1 viewers every 10 seconds
 * Runs via Pub/Sub on schedule
 */
export const tickBillingScheduler = onSchedule(
  {
    schedule: "*/10 * * * * *", // Every 10 seconds
    region: "europe-west3",
    timeoutSeconds: 60,
  },
  async (event) => {
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
        const session = sessionDoc.data() as LiveSession;
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
                  viewerIds: FieldValue.arrayRemove(viewerId),
                  updatedAt: FieldValue.serverTimestamp(),
                });
                return;
              }

              // Deduct from viewer
              tx.update(viewerRef, {
                "wallet.balance": FieldValue.increment(-tokensPerTick),
                "wallet.spent": FieldValue.increment(tokensPerTick),
                updatedAt: FieldValue.serverTimestamp(),
              });

              // Credit host (70%)
              const hostAmount = Math.floor(tokensPerTick * 0.70);
              const hostRef = db.collection("users").doc(hostId);
              tx.update(hostRef, {
                "wallet.balance": FieldValue.increment(hostAmount),
                "wallet.earned": FieldValue.increment(hostAmount),
                updatedAt: FieldValue.serverTimestamp(),
              });

              // Update session revenue
              const sessionRef = db.collection("liveSessions").doc(sessionId);
              tx.update(sessionRef, {
                totalRevenue: FieldValue.increment(hostAmount),
                duration: FieldValue.increment(10), // Add 10 seconds
                updatedAt: FieldValue.serverTimestamp(),
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
                createdAt: FieldValue.serverTimestamp(),
              });
            });
          } catch (error) {
            console.error(`Error billing viewer ${viewerId}:`, error);
          }
        }
      });

      await Promise.all(promises);

      console.log("Tick billing completed");
    } catch (error) {
      console.error("Error in tick billing:", error);
    }
  }
);

/**
 * Helper: Get active sessions for a host
 */
export async function getHostActiveSessions(hostId: string): Promise<LiveSession[]> {
  const snapshot = await db
    .collection("liveSessions")
    .where("hostId", "==", hostId)
    .where("status", "==", LiveSessionStatus.LIVE)
    .get();

  return snapshot.docs.map(doc => doc.data() as LiveSession);
}

/**
 * Helper: Get viewer count for a session
 */
export async function getSessionViewerCount(sessionId: string): Promise<number> {
  const sessionDoc = await db.collection("liveSessions").doc(sessionId).get();
  const session = sessionDoc.data() as LiveSession;
  return session?.viewerIds?.length || 0;
}


