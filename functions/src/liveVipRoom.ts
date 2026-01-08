/**
 * ========================================================================
 * LIVE + VIP ROOM 3.0 - COMPLETE IMPLEMENTATION
 * ========================================================================
 * Advanced live streaming and exclusive VIP room features
 *
 * Live Features:
 * - Real-time tips with animations
 * - Gifts & badges during stream
 * - Ranking of top tippers
 * - Voice interactions
 * - Paid polls
 * - Special effects unlocked by tips
 * - Stream recording → auto-product conversion
 *
 * VIP Room Features:
 * - Token-based entry fee
 * - Time-based billing (per minute)
 * - Queue system with priority
 * - Priority users (top spenders)
 * - Slow mode for creators
 * - Exclusive content access
 *
 * @version 1.0.0
 * @section LIVE_VIP
 */

import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
;

const db = getFirestore();

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export enum LiveSessionStatus {
  SCHEDULED = "scheduled",
  LIVE = "live",
  ENDED = "ended",
  CANCELLED = "cancelled",
}

export enum TipType {
  SMALL = "small",
  MEDIUM = "medium",
  LARGE = "large",
  MEGA = "mega",
}

export enum SpecialEffect {
  HEARTS = "hearts",
  CONFETTI = "confetti",
  FIREWORKS = "fireworks",
  SPARKLES = "sparkles",
  RAINBOW = "rainbow",
}

export interface LiveSession {
  sessionId: string;
  hostId: string;
  hostName: string;
  hostAvatar: string;

  // Session info
  title: string;
  description: string;
  category: string;
  thumbnailURL: string;

  // Status
  status: LiveSessionStatus;
  scheduledAt?: Timestamp;
  startedAt?: Timestamp;
  endedAt?: Timestamp;

  // Metrics
  viewerCount: number;
  peakViewerCount: number;
  totalTips: number;
  totalRevenue: number;
  likeCount: number;

  // Settings
  allowTips: boolean;
  allowGifts: boolean;
  allowPolls: boolean;
  slowMode: boolean;
  slowModeSeconds: number;

  // Recording
  recordSession: boolean;
  recordingURL?: string;
  autoConvertToProduct: boolean;

  // Top tippers
  topTippers: Array<{
    userId: string;
    userName: string;
    totalTipped: number;
    rank: number;
  }>;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface LiveTip {
  tipId: string;
  sessionId: string;

  senderId: string;
  senderName: string;

  hostId: string;

  amount: number; // tokens
  type: TipType;
  message?: string;

  // Effects
  triggerEffect?: SpecialEffect;

  // Revenue split (80% creator / 20% platform)
  platformFee: number;
  hostEarnings: number;

  // Visibility
  public: boolean;
  featured: boolean;

  createdAt: Timestamp;
}

export interface LivePoll {
  pollId: string;
  sessionId: string;

  question: string;
  options: Array<{
    optionId: string;
    text: string;
    votes: number;
    voters: string[];
  }>;

  // Cost to vote
  voteCost: number; // tokens

  // Status
  active: boolean;
  endedAt?: Timestamp;

  // Results
  totalVotes: number;
  totalRevenue: number;

  createdAt: Timestamp;
}

export interface VIPRoom {
  roomId: string;
  creatorId: string;
  creatorName: string;

  // Pricing
  entryFee: number; // tokens
  minuteRate: number; // tokens per minute

  // Capacity
  maxCapacity: number;
  currentOccupancy: number;

  // Queue
  queueEnabled: boolean;
  queueSize: number;

  // Status
  active: boolean;
  openedAt?: Timestamp;

  // Settings
  slowMode: boolean;
  slowModeSeconds: number;
  priorityUsers: string[]; // User IDs with priority access

  // Stats
  totalVisits: number;
  totalRevenue: number;
  avgStayDuration: number; // minutes

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface VIPRoomSession {
  sessionId: string;
  roomId: string;

  userId: string;
  userName: string;

  // Entry
  entryFee: number;
  enteredAt: Timestamp;

  // Billing
  billingStarted: boolean;
  minutesElapsed: number;
  tokensCharged: number;
  minuteRate: number;

  // Status
  active: boolean;
  exitedAt?: Timestamp;

  // Priority
  isPriority: boolean;
  queuePosition?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TIP_AMOUNTS = {
  [TipType.SMALL]: 10,
  [TipType.MEDIUM]: 50,
  [TipType.LARGE]: 100,
  [TipType.MEGA]: 500,
};

const EFFECT_THRESHOLDS = {
  [SpecialEffect.HEARTS]: 10,
  [SpecialEffect.CONFETTI]: 50,
  [SpecialEffect.FIREWORKS]: 100,
  [SpecialEffect.SPARKLES]: 250,
  [SpecialEffect.RAINBOW]: 500,
};

const LIVE_REVENUE_SPLIT = {
  platform: 0.20, // 20%
  creator: 0.80, // 80%
};

const VIP_ROOM_DEFAULTS = {
  entryFee: 100,
  minuteRate: 10,
  maxCapacity: 10,
  slowModeSeconds: 5,
};

// ============================================================================
// CLOUD FUNCTIONS - LIVE STREAMING
// ============================================================================

/**
 * Start live session
 */
export const startLiveSession = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { title, description, category, recordSession = false, autoConvert = false } = request.data;

    if (!title) {
      throw new HttpsError("invalid-argument", "Missing title");
    }

    // Verify creator permissions
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();

    if (!userData?.permissions?.live_streaming) {
      throw new HttpsError("permission-denied", "Live streaming not enabled for this account");
    }

    // Check for existing active session
    const existingSnapshot = await db
      .collection("liveSessions")
      .where("hostId", "==", uid)
      .where("status", "==", LiveSessionStatus.LIVE)
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      throw new HttpsError("failed-precondition", "Already have an active live session");
    }

    const sessionId = `live_${Date.now()}_${uid.substring(0, 8)}`;

    const session: LiveSession = {
      sessionId,
      hostId: uid,
      hostName: userData?.profile?.name || "Unknown",
      hostAvatar: userData?.profile?.photos?.[0] || "",
      title,
      description: description || "",
      category: category || "general",
      thumbnailURL: userData?.profile?.photos?.[0] || "",
      status: LiveSessionStatus.LIVE,
      startedAt: Timestamp.now(),
      viewerCount: 0,
      peakViewerCount: 0,
      totalTips: 0,
      totalRevenue: 0,
      likeCount: 0,
      allowTips: true,
      allowGifts: true,
      allowPolls: true,
      slowMode: false,
      slowModeSeconds: 5,
      recordSession,
      autoConvertToProduct: autoConvert,
      topTippers: [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await db.collection("liveSessions").doc(sessionId).set(session);

    // Update user status
    await db.collection("users").doc(uid).update({
      "liveSession.active": true,
      "liveSession.sessionId": sessionId,
      "presence.online": true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info(`Live session started: ${sessionId}`);

    return {
      success: true,
      sessionId,
      session,
    };
  }
);

/**
 * Send tip during live session
 */
export const sendLiveTip = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { sessionId, amount, message, type = TipType.SMALL } = request.data;

    if (!sessionId || !amount) {
      throw new HttpsError("invalid-argument", "Missing required fields");
    }

    return await db.runTransaction(async (tx) => {
      // Get session
      const sessionRef = db.collection("liveSessions").doc(sessionId);
      const sessionDoc = await tx.get(sessionRef);

      if (!sessionDoc.exists) {
        throw new HttpsError("not-found", "Live session not found");
      }

      const session = sessionDoc.data() as LiveSession;

      if (session.status !== LiveSessionStatus.LIVE) {
        throw new HttpsError("failed-precondition", "Session is not live");
      }

      if (!session.allowTips) {
        throw new HttpsError("failed-precondition", "Tips are disabled");
      }

      // Check sender balance
      const senderRef = db.collection("users").doc(uid);
      const senderDoc = await tx.get(senderRef);
      const sender = senderDoc.data();
      const balance = sender?.wallet?.balance || 0;

      if (balance < amount) {
        throw new HttpsError("failed-precondition", "Insufficient tokens");
      }

      // Calculate revenue split
      const platformFee = Math.floor(amount * LIVE_REVENUE_SPLIT.platform);
      const hostEarnings = amount - platformFee;

      // Determine effect
      let triggerEffect: SpecialEffect | undefined;
      if (amount >= EFFECT_THRESHOLDS[SpecialEffect.RAINBOW]) {
        triggerEffect = SpecialEffect.RAINBOW;
      } else if (amount >= EFFECT_THRESHOLDS[SpecialEffect.SPARKLES]) {
        triggerEffect = SpecialEffect.SPARKLES;
      } else if (amount >= EFFECT_THRESHOLDS[SpecialEffect.FIREWORKS]) {
        triggerEffect = SpecialEffect.FIREWORKS;
      } else if (amount >= EFFECT_THRESHOLDS[SpecialEffect.CONFETTI]) {
        triggerEffect = SpecialEffect.CONFETTI;
      } else if (amount >= EFFECT_THRESHOLDS[SpecialEffect.HEARTS]) {
        triggerEffect = SpecialEffect.HEARTS;
      }

      // Create tip
      const tipId = `tip_${Date.now()}_${uid.substring(0, 8)}`;

      const tip: LiveTip = {
        tipId,
        sessionId,
        senderId: uid,
        senderName: sender?.profile?.name || "Anonymous",
        hostId: session.hostId,
        amount,
        type,
        message,
        triggerEffect,
        platformFee,
        hostEarnings,
        public: true,
        featured: amount >= 100,
        createdAt: Timestamp.now(),
      };

      const tipRef = db.collection("liveTips").doc(tipId);
      tx.set(tipRef, tip);

      // Update balances
      tx.update(senderRef, {
        "wallet.balance": FieldValue.increment(-amount),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const hostRef = db.collection("users").doc(session.hostId);
      tx.update(hostRef, {
        "wallet.earned": FieldValue.increment(hostEarnings),
        "wallet.balance": FieldValue.increment(hostEarnings),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Update session stats
      const topTippers = session.topTippers || [];
      const existingTipper = topTippers.find(t => t.userId === uid);

      if (existingTipper) {
        existingTipper.totalTipped += amount;
      } else {
        topTippers.push({
          userId: uid,
          userName: sender?.profile?.name || "Anonymous",
          totalTipped: amount,
          rank: topTippers.length + 1,
        });
      }

      // Re-rank tippers
      topTippers.sort((a, b) => b.totalTipped - a.totalTipped);
      topTippers.forEach((t, i) => { t.rank = i + 1; });

      tx.update(sessionRef, {
        totalTips: FieldValue.increment(1),
        totalRevenue: FieldValue.increment(hostEarnings),
        topTippers: topTippers.slice(0, 10), // Keep top 10
        updatedAt: FieldValue.serverTimestamp(),
      });

      logger.info(`Live tip: ${amount} tokens from ${uid} to ${session.hostId}`);

      return {
        success: true,
        tipId,
        triggerEffect,
        hostEarnings,
      };
    });
  }
);

/**
 * End live session
 */
export const endLiveSession = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { sessionId } = request.data;

    if (!sessionId) {
      throw new HttpsError("invalid-argument", "Missing sessionId");
    }

    const sessionRef = db.collection("liveSessions").doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      throw new HttpsError("not-found", "Session not found");
    }

    const session = sessionDoc.data() as LiveSession;

    if (session.hostId !== uid) {
      throw new HttpsError("permission-denied", "Not your session");
    }

    // Update session
    await sessionRef.update({
      status: LiveSessionStatus.ENDED,
      endedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Update user status
    await db.collection("users").doc(uid).update({
      "liveSession.active": false,
      "liveSession.sessionId": null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Auto-convert to product if enabled
    if (session.autoConvertToProduct && session.recordingURL) {
      await convertStreamToProduct(sessionId, session);
    }

    logger.info(`Live session ended: ${sessionId} (${session.totalRevenue} tokens earned)`);

    return {
      success: true,
      stats: {
        duration: session.endedAt
          ? (session.endedAt as any).toMillis() - session.startedAt!.toMillis()
          : 0,
        peakViewers: session.peakViewerCount,
        totalTips: session.totalTips,
        totalRevenue: session.totalRevenue,
      },
    };
  }
);

/**
 * Create live poll
 */
export const createLivePoll = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { sessionId, question, options, voteCost = 5 } = request.data;

    if (!sessionId || !question || !options || options.length < 2) {
      throw new HttpsError("invalid-argument", "Invalid poll data");
    }

    // Verify session ownership
    const sessionDoc = await db.collection("liveSessions").doc(sessionId).get();
    if (!sessionDoc.exists) {
      throw new HttpsError("not-found", "Session not found");
    }

    const session = sessionDoc.data() as LiveSession;
    if (session.hostId !== uid) {
      throw new HttpsError("permission-denied", "Not your session");
    }

    const pollId = `poll_${Date.now()}_${sessionId.substring(0, 8)}`;

    const poll: LivePoll = {
      pollId,
      sessionId,
      question,
      options: options.map((text: string, index: number) => ({
        optionId: `opt_${index}`,
        text,
        votes: 0,
        voters: [],
      })),
      voteCost,
      active: true,
      totalVotes: 0,
      totalRevenue: 0,
      createdAt: Timestamp.now(),
    };

    await db.collection("livePolls").doc(pollId).set(poll);

    logger.info(`Poll created: ${pollId} in session ${sessionId}`);

    return {
      success: true,
      pollId,
      poll,
    };
  }
);

/**
 * Vote in live poll
 */
export const voteInLivePoll = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { pollId, optionId } = request.data;

    if (!pollId || !optionId) {
      throw new HttpsError("invalid-argument", "Missing required fields");
    }

    return await db.runTransaction(async (tx) => {
      const pollRef = db.collection("livePolls").doc(pollId);
      const pollDoc = await tx.get(pollRef);

      if (!pollDoc.exists) {
        throw new HttpsError("not-found", "Poll not found");
      }

      const poll = pollDoc.data() as LivePoll;

      if (!poll.active) {
        throw new HttpsError("failed-precondition", "Poll has ended");
      }

      // Check if already voted
      const alreadyVoted = poll.options.some(opt => opt.voters.includes(uid));
      if (alreadyVoted) {
        throw new HttpsError("failed-precondition", "Already voted in this poll");
      }

      // Find option
      const option = poll.options.find(opt => opt.optionId === optionId);
      if (!option) {
        throw new HttpsError("invalid-argument", "Invalid option");
      }

      // Check balance
      const userRef = db.collection("users").doc(uid);
      const userDoc = await tx.get(userRef);
      const user = userDoc.data();
      const balance = user?.wallet?.balance || 0;

      if (balance < poll.voteCost) {
        throw new HttpsError("failed-precondition", "Insufficient tokens");
      }

      // Charge for vote
      const platformFee = Math.floor(poll.voteCost * LIVE_REVENUE_SPLIT.platform);
      const hostEarnings = poll.voteCost - platformFee;

      tx.update(userRef, {
        "wallet.balance": FieldValue.increment(-poll.voteCost),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Get session to find host
      const sessionDoc = await tx.get(db.collection("liveSessions").doc(poll.sessionId));
      const session = sessionDoc.data() as LiveSession;

      const hostRef = db.collection("users").doc(session.hostId);
      tx.update(hostRef, {
        "wallet.earned": FieldValue.increment(hostEarnings),
        "wallet.balance": FieldValue.increment(hostEarnings),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Update poll
      option.votes += 1;
      option.voters.push(uid);

      tx.update(pollRef, {
        options: poll.options,
        totalVotes: FieldValue.increment(1),
        totalRevenue: FieldValue.increment(hostEarnings),
        updatedAt: FieldValue.serverTimestamp(),
      });

      logger.info(`Vote cast in poll ${pollId} by ${uid}`);

      return {
        success: true,
        poll: {
          ...poll,
          options: poll.options,
          totalVotes: poll.totalVotes + 1,
        },
      };
    });
  }
);

// ============================================================================
// CLOUD FUNCTIONS - VIP ROOM
// ============================================================================

/**
 * Create VIP Room
 */
export const createVIPRoom = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const {
      entryFee = VIP_ROOM_DEFAULTS.entryFee,
      minuteRate = VIP_ROOM_DEFAULTS.minuteRate,
      maxCapacity = VIP_ROOM_DEFAULTS.maxCapacity,
    } = request.data;

    // Get creator info
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();

    const roomId = `vip_${Date.now()}_${uid.substring(0, 8)}`;

    const room: VIPRoom = {
      roomId,
      creatorId: uid,
      creatorName: userData?.profile?.name || "Unknown",
      entryFee,
      minuteRate,
      maxCapacity,
      currentOccupancy: 0,
      queueEnabled: true,
      queueSize: 0,
      active: true,
      openedAt: Timestamp.now(),
      slowMode: true,
      slowModeSeconds: VIP_ROOM_DEFAULTS.slowModeSeconds,
      priorityUsers: [],
      totalVisits: 0,
      totalRevenue: 0,
      avgStayDuration: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await db.collection("vipRooms").doc(roomId).set(room);

    logger.info(`VIP Room created: ${roomId}`);

    return {
      success: true,
      roomId,
      room,
    };
  }
);

/**
 * Enter VIP Room
 */
export const enterVIPRoom = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { roomId } = request.data;

    if (!roomId) {
      throw new HttpsError("invalid-argument", "Missing roomId");
    }

    return await db.runTransaction(async (tx) => {
      const roomRef = db.collection("vipRooms").doc(roomId);
      const roomDoc = await tx.get(roomRef);

      if (!roomDoc.exists) {
        throw new HttpsError("not-found", "VIP Room not found");
      }

      const room = roomDoc.data() as VIPRoom;

      if (!room.active) {
        throw new HttpsError("failed-precondition", "Room is closed");
      }

      // Check capacity
      const isPriority = room.priorityUsers.includes(uid);

      if (room.currentOccupancy >= room.maxCapacity && !isPriority) {
        throw new HttpsError("failed-precondition", "Room is at capacity");
      }

      // Check balance
      const userRef = db.collection("users").doc(uid);
      const userDoc = await tx.get(userRef);
      const user = userDoc.data();
      const balance = user?.wallet?.balance || 0;

      if (balance < room.entryFee) {
        throw new HttpsError("failed-precondition", "Insufficient tokens for entry");
      }

      // Charge entry fee
      const platformFee = Math.floor(room.entryFee * LIVE_REVENUE_SPLIT.platform);
      const creatorEarnings = room.entryFee - platformFee;

      tx.update(userRef, {
        "wallet.balance": FieldValue.increment(-room.entryFee),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const creatorRef = db.collection("users").doc(room.creatorId);
      tx.update(creatorRef, {
        "wallet.earned": FieldValue.increment(creatorEarnings),
        "wallet.balance": FieldValue.increment(creatorEarnings),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Create session
      const sessionId = `vipsession_${Date.now()}_${uid.substring(0, 8)}`;

      const vipSession: VIPRoomSession = {
        sessionId,
        roomId,
        userId: uid,
        userName: user?.profile?.name || "Anonymous",
        entryFee: room.entryFee,
        enteredAt: Timestamp.now(),
        billingStarted: true,
        minutesElapsed: 0,
        tokensCharged: room.entryFee,
        minuteRate: room.minuteRate,
        active: true,
        isPriority,
      };

      const sessionRef = db.collection("vipRoomSessions").doc(sessionId);
      tx.set(sessionRef, vipSession);

      // Update room
      tx.update(roomRef, {
        currentOccupancy: FieldValue.increment(1),
        totalVisits: FieldValue.increment(1),
        totalRevenue: FieldValue.increment(creatorEarnings),
        updatedAt: FieldValue.serverTimestamp(),
      });

      logger.info(`User ${uid} entered VIP Room ${roomId}`);

      return {
        success: true,
        sessionId,
        message: "Welcome to VIP Room! Time-based billing started.",
      };
    });
  }
);

/**
 * Exit VIP Room
 */
export const exitVIPRoom = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { sessionId } = request.data;

    if (!sessionId) {
      throw new HttpsError("invalid-argument", "Missing sessionId");
    }

    return await db.runTransaction(async (tx) => {
      const sessionRef = db.collection("vipRoomSessions").doc(sessionId);
      const sessionDoc = await tx.get(sessionRef);

      if (!sessionDoc.exists) {
        throw new HttpsError("not-found", "Session not found");
      }

      const vipSession = sessionDoc.data() as VIPRoomSession;

      if (vipSession.userId !== uid) {
        throw new HttpsError("permission-denied", "Not your session");
      }

      // Calculate time-based charges
      const minutesElapsed = Math.floor(
        (Date.now() - vipSession.enteredAt.toMillis()) / 60000
      );

      const additionalCharge = minutesElapsed * vipSession.minuteRate;
      const totalCharged = vipSession.tokensCharged + additionalCharge;

      if (additionalCharge > 0) {
        // Charge for time
        const platformFee = Math.floor(additionalCharge * LIVE_REVENUE_SPLIT.platform);
        const creatorEarnings = additionalCharge - platformFee;

        const userRef = db.collection("users").doc(uid);
        tx.update(userRef, {
          "wallet.balance": FieldValue.increment(-additionalCharge),
          updatedAt: FieldValue.serverTimestamp(),
        });

        const creatorRef = db.collection("users").doc(vipSession.roomId.split('_')[2]); // Extract creator ID
        const roomDoc = await tx.get(db.collection("vipRooms").doc(vipSession.roomId));
        const room = roomDoc.data() as VIPRoom;

        tx.update(db.collection("users").doc(room.creatorId), {
          "wallet.earned": FieldValue.increment(creatorEarnings),
          "wallet.balance": FieldValue.increment(creatorEarnings),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Update room
        tx.update(db.collection("vipRooms").doc(vipSession.roomId), {
          currentOccupancy: FieldValue.increment(-1),
          totalRevenue: FieldValue.increment(creatorEarnings),
          avgStayDuration: minutesElapsed,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // End session
      tx.update(sessionRef, {
        active: false,
        minutesElapsed,
        tokensCharged: totalCharged,
        exitedAt: FieldValue.serverTimestamp(),
      });

      logger.info(`User ${uid} exited VIP Room ${vipSession.roomId} (${minutesElapsed} min, ${totalCharged} tokens)`);

      return {
        success: true,
        stats: {
          minutesElapsed,
          totalCharged,
          entryFee: vipSession.entryFee,
          timeCost: additionalCharge,
        },
      };
    });
  }
);

/**
 * Get active live sessions
 */
export const getActiveLiveSessions = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { limit = 20 } = request.data;

    const snapshot = await db
      .collection("liveSessions")
      .where("status", "==", LiveSessionStatus.LIVE)
      .orderBy("viewerCount", "desc")
      .limit(limit)
      .get();

    const sessions = snapshot.docs.map(doc => doc.data());

    logger.info(`Retrieved ${sessions.length} active live sessions`);

    return {
      success: true,
      sessions,
      total: sessions.length,
    };
  }
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert stream recording to product
 */
async function convertStreamToProduct(sessionId: string, session: LiveSession): Promise<void> {
  if (!session.recordingURL) return;

  // Create product from recording
  const productId = `prod_stream_${sessionId}`;

  await db.collection("creatorProducts").doc(productId).set({
    productId,
    creatorId: session.hostId,
    creatorName: session.hostName,
    type: "video",
    title: `Live Stream: ${session.title}`,
    description: `Recorded live stream from ${session.startedAt?.toDate().toLocaleDateString()}`,
    price: 500, // Default price for stream recording
    currency: "tokens",
    status: "active",
    contentRating: "sfw",
    tags: ["live_stream", session.category],
    thumbnailURL: session.thumbnailURL,
    mediaFiles: [{
      fileId: `stream_${sessionId}`,
      filename: `${sessionId}.mp4`,
      contentType: "video/mp4",
      size: 0,
      storagePath: session.recordingURL,
    }],
    fileCount: 1,
    totalSize: 0,
    viewCount: 0,
    purchaseCount: 0,
    likeCount: 0,
    revenue: 0,
    isUnlimited: true,
    allowDownload: true,
    downloadLimit: 3,
    expiryDays: 30,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    publishedAt: Timestamp.now(),
  });

  logger.info(`Stream ${sessionId} converted to product ${productId}`);
}

logger.info("✅ Live + VIP Room module loaded successfully");

