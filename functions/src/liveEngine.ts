/**
 * Live Streaming Engine for Avalo
 * 
 * This module implements the complete live streaming monetization system:
 * - Live room management
 * - Session lifecycle (start/end)
 * - Gift sending with 70/30 revenue split
 * - Queue system (paid "on stage" access)
 * - Trust & ranking integration
 * 
 * IMPORTANT Phase 14 Rules:
 * - NO deposit required (unlike chat)
 * - All gifts NON-REFUNDABLE
 * - 70% creator / 30% Avalo split
 * - Anyone can send gifts (no hetero rule)
 * - Must be 18+ verified to host
 */

import { db, serverTimestamp, increment, generateId } from './init.js';
import {
  LIVE_COLLECTIONS,
  LIVE_REVENUE,
  QUEUE_CONFIG,
  HOST_ELIGIBILITY,
  VIEWER_ELIGIBILITY,
  LIVE_LIMITS,
  calculateLiveSplit,
  getGiftById,
  canAffordGift,
  canAffordQueue,
  type LiveGift,
} from './config/liveMonetization.js';

// Trust & Ranking Integration
import { recordRiskEvent, evaluateUserRisk } from './trustEngine.js';
import { recordRankingAction } from './rankingEngine.js';
import { isAccountActive } from './accountLifecycle.js';

// Simple error class
class HttpsError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'HttpsError';
  }
}

// Simple logger
const logger = {
  info: (..._args: any[]) => {},
  warn: (..._args: any[]) => {},
  error: (..._args: any[]) => {},
};

// ============================================================================
// TYPES
// ============================================================================

export type LiveRoomStatus = 'offline' | 'live' | 'ended';
export type LiveSessionStatus = 'live' | 'ended';
export type QueueEntryStatus = 'waiting' | 'on_stage' | 'skipped' | 'completed' | 'refunded';

export interface LiveRoom {
  roomId: string;
  hostId: string;
  status: LiveRoomStatus;
  title?: string;
  tags?: string[];
  is18Plus: boolean;
  language: string;
  viewerCount: number;
  likesCount: number;
  totalGiftsTokens: number;
  visibilityBoostMultiplier: number;
  createdAt: any; // Timestamp
  startedAt?: any; // Timestamp
  endedAt?: any; // Timestamp
  lastActivityAt: any; // Timestamp
  updatedAt: any; // Timestamp
}

export interface LiveSession {
  sessionId: string;
  roomId: string;
  hostId: string;
  status: LiveSessionStatus;
  startedAt: any; // Timestamp
  endedAt?: any; // Timestamp
  durationSeconds?: number;
  totalGiftsTokens: number;
  totalQueueTokens: number;
  earningsCreatorTokens: number;
  earningsAvaloTokens: number;
  viewersPeak: number;
  giftsCount: number;
  queueEntriesCount: number;
  createdAt: any; // Timestamp
  updatedAt: any; // Timestamp
}

export interface LiveGiftTransaction {
  giftId: string;
  roomId: string;
  sessionId: string;
  hostId: string;
  senderId: string;
  giftTypeId: string;
  giftName: string;
  tokens: number;
  creatorTokens: number;
  avaloTokens: number;
  createdAt: any; // Timestamp
}

export interface QueueEntry {
  queueEntryId: string;
  roomId: string;
  sessionId: string;
  userId: string;
  status: QueueEntryStatus;
  position: number;
  tokensPaid: number;
  refundTokens: number;
  createdAt: any; // Timestamp
  enteredAt?: any; // Timestamp
  leftAt?: any; // Timestamp
  updatedAt: any; // Timestamp
}

export interface LiveEarnings {
  hostId: string;
  totalLiveTokens: number;
  last30DaysTokens: number;
  sessionsCount: number;
  totalGiftsReceived: number;
  totalQueueRevenue: number;
  averageSessionDuration: number;
  lastSessionAt?: any; // Timestamp
  updatedAt: any; // Timestamp
}

// ============================================================================
// LIVE ROOM MANAGEMENT
// ============================================================================

/**
 * Create or get existing live room for a host
 * Validates host eligibility before allowing room creation
 */
export async function createOrGetLiveRoom(hostId: string): Promise<LiveRoom> {
  // Validate host eligibility
  const eligible = await validateHostEligibility(hostId);
  if (!eligible.canGoLive) {
    throw new HttpsError('failed-precondition', eligible.reason || 'Not eligible to go live');
  }

  // Check for existing active/unended room
  const existingRoomsSnap = await db.collection(LIVE_COLLECTIONS.LIVE_ROOMS)
    .where('hostId', '==', hostId)
    .where('status', 'in', ['offline', 'live'])
    .limit(1)
    .get();

  if (!existingRoomsSnap.empty) {
    const room = existingRoomsSnap.docs[0].data() as LiveRoom;
    logger.info(`Returning existing room ${room.roomId} for host ${hostId}`);
    return room;
  }

  // Create new room
  const roomId = generateId();
  const now = serverTimestamp();

  const newRoom: Partial<LiveRoom> = {
    roomId,
    hostId,
    status: 'offline',
    is18Plus: true, // Default to 18+ since host must be verified
    language: 'en', // Default, can be updated
    viewerCount: 0,
    likesCount: 0,
    totalGiftsTokens: 0,
    visibilityBoostMultiplier: 1,
    createdAt: now,
    lastActivityAt: now,
    updatedAt: now,
  };

  await db.collection(LIVE_COLLECTIONS.LIVE_ROOMS).doc(roomId).set(newRoom);

  logger.info(`Created new live room ${roomId} for host ${hostId}`);
  return { ...newRoom, roomId } as LiveRoom;
}

/**
 * Validate if a user can go live
 */
async function validateHostEligibility(hostId: string): Promise<{
  canGoLive: boolean;
  reason?: string;
}> {
  // Check account is active
  const isActive = await isAccountActive(hostId);
  if (!isActive) {
    return {
      canGoLive: false,
      reason: 'Account is not active',
    };
  }

  // Get user profile
  const userSnap = await db.collection('users').doc(hostId).get();
  if (!userSnap.exists) {
    return {
      canGoLive: false,
      reason: 'User not found',
    };
  }

  const user = userSnap.data() as any;

  // Check 18+ verification
  if (HOST_ELIGIBILITY.REQUIRES_18_PLUS) {
    if (!user.verification?.age18) {
      return {
        canGoLive: false,
        reason: 'Must verify 18+ to go live',
      };
    }
  }

  // Check verification status
  if (HOST_ELIGIBILITY.REQUIRES_VERIFICATION) {
    const isVerified = user.verification?.status === 'verified' ||
                       user.verification?.selfie === true;
    if (!isVerified) {
      return {
        canGoLive: false,
        reason: 'Account verification required',
      };
    }
  }

  // Check shadowban status
  if (HOST_ELIGIBILITY.CANNOT_BE_SHADOWBANNED) {
    if (user.shadowbanned === true) {
      return {
        canGoLive: false,
        reason: 'Account restricted from live streaming',
      };
    }
  }

  // Check account age
  const accountCreated = user.createdAt?.toDate?.() || new Date();
  const accountAgeDays = Math.floor((Date.now() - accountCreated.getTime()) / (1000 * 60 * 60 * 24));
  
  if (accountAgeDays < HOST_ELIGIBILITY.MIN_ACCOUNT_AGE_DAYS) {
    return {
      canGoLive: false,
      reason: `Account must be at least ${HOST_ELIGIBILITY.MIN_ACCOUNT_AGE_DAYS} days old`,
    };
  }

  return { canGoLive: true };
}

// ============================================================================
// SESSION LIFECYCLE
// ============================================================================

/**
 * Start a live session
 * Records start time and creates session document
 */
export async function startLiveSession(
  hostId: string,
  roomId: string
): Promise<{ sessionId: string; room: LiveRoom }> {
  
  // Get room
  const roomRef = db.collection(LIVE_COLLECTIONS.LIVE_ROOMS).doc(roomId);
  const roomSnap = await roomRef.get();

  if (!roomSnap.exists) {
    throw new HttpsError('not-found', 'Live room not found');
  }

  const room = roomSnap.data() as LiveRoom;

  // Validate ownership
  if (room.hostId !== hostId) {
    throw new HttpsError('permission-denied', 'Only room owner can start session');
  }

  // Check room is ready to go live
  if (room.status !== 'offline') {
    throw new HttpsError('failed-precondition', `Room is already ${room.status}`);
  }

  // Create session
  const sessionId = generateId();
  const now = serverTimestamp();

  const newSession: Partial<LiveSession> = {
    sessionId,
    roomId,
    hostId,
    status: 'live',
    startedAt: now,
    totalGiftsTokens: 0,
    totalQueueTokens: 0,
    earningsCreatorTokens: 0,
    earningsAvaloTokens: 0,
    viewersPeak: 0,
    giftsCount: 0,
    queueEntriesCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection(LIVE_COLLECTIONS.LIVE_SESSIONS).doc(sessionId).set(newSession);

  // Update room status
  await roomRef.update({
    status: 'live',
    startedAt: now,
    viewerCount: 0,
    lastActivityAt: now,
    updatedAt: now,
  });

  // Record ranking event (non-blocking)
  try {
    await recordRankingAction({
      type: 'boost', // Live session start gets boost points
      creatorId: hostId,
      payerId: hostId, // Self-action
      points: 200, // Boost points from scoring table
      timestamp: new Date(),
    });
  } catch (error) {
    // Non-blocking
    logger.error('Failed to record ranking action for session start:', error);
  }

  logger.info(`Live session ${sessionId} started for room ${roomId} by ${hostId}`);

  return {
    sessionId,
    room: { ...room, status: 'live', startedAt: now } as LiveRoom,
  };
}

/**
 * End a live session
 * Calculates totals, updates earnings, logs ranking/trust events
 */
export async function endLiveSession(
  hostId: string,
  roomId: string,
  sessionId: string
): Promise<{
  durationSeconds: number;
  totalRevenue: number;
  creatorEarnings: number;
  avaloEarnings: number;
}> {
  
  // Get session
  const sessionRef = db.collection(LIVE_COLLECTIONS.LIVE_SESSIONS).doc(sessionId);
  const sessionSnap = await sessionRef.get();

  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Live session not found');
  }

  const session = sessionSnap.data() as LiveSession;

  // Validate ownership
  if (session.hostId !== hostId) {
    throw new HttpsError('permission-denied', 'Only host can end session');
  }

  if (session.status === 'ended') {
    throw new HttpsError('failed-precondition', 'Session already ended');
  }

  // Calculate duration
  const startTime = session.startedAt.toDate();
  const endTime = new Date();
  const durationSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

  // Aggregate totals from gifts and queue
  const giftsSnap = await db.collection(LIVE_COLLECTIONS.LIVE_GIFTS)
    .where('sessionId', '==', sessionId)
    .get();

  const queueSnap = await db.collection(LIVE_COLLECTIONS.LIVE_QUEUE)
    .where('sessionId', '==', sessionId)
    .where('status', '==', 'completed')
    .get();

  const totalGiftsTokens = giftsSnap.docs.reduce((sum, doc) => {
    return sum + (doc.data().tokens || 0);
  }, 0);

  const totalQueueTokens = queueSnap.docs.reduce((sum, doc) => {
    return sum + (doc.data().tokensPaid || 0);
  }, 0);

  const totalRevenue = totalGiftsTokens + totalQueueTokens;
  
  // Calculate earnings split
  const { creatorTokens, avaloTokens } = calculateLiveSplit(totalRevenue);

  // Update session
  await sessionRef.update({
    status: 'ended',
    endedAt: serverTimestamp(),
    durationSeconds,
    totalGiftsTokens,
    totalQueueTokens,
    earningsCreatorTokens: creatorTokens,
    earningsAvaloTokens: avaloTokens,
    updatedAt: serverTimestamp(),
  });

  // Update room
  const roomRef = db.collection(LIVE_COLLECTIONS.LIVE_ROOMS).doc(roomId);
  await roomRef.update({
    status: 'ended',
    endedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Update live earnings aggregate
  await updateLiveEarnings(hostId, {
    tokensEarned: creatorTokens,
    sessionDuration: durationSeconds,
    sessionCompleted: true,
  });

  // Record ranking event for session revenue (non-blocking)
  try {
    if (totalRevenue > 0) {
      await recordRankingAction({
        type: 'tip', // Live revenue counts as tips
        creatorId: hostId,
        payerId: 'live_session', // System action
        tokensAmount: totalRevenue,
        points: totalRevenue, // 1 point per token
        timestamp: new Date(),
      });
    }
  } catch (error) {
    logger.error('Failed to record ranking action for session end:', error);
  }

  // Record trust event (non-blocking)
  try {
    await recordRiskEvent({
      userId: hostId,
      eventType: 'free_pool', // Use free_pool type for live events
      metadata: {
        sessionId,
        roomId,
        durationSeconds,
        totalRevenue,
        giftsCount: giftsSnap.size,
        queueCount: queueSnap.size,
      },
    });

    // Evaluate risk
    evaluateUserRisk(hostId).catch(() => {});
  } catch (error) {
    // Non-blocking
    logger.error('Failed to record trust event for session end:', error);
  }

  logger.info(`Live session ${sessionId} ended - Duration: ${durationSeconds}s, Revenue: ${totalRevenue} tokens (Creator: ${creatorTokens}, Avalo: ${avaloTokens})`);

  return {
    durationSeconds,
    totalRevenue,
    creatorEarnings: creatorTokens,
    avaloEarnings: avaloTokens,
  };
}

// ============================================================================
// GIFT SENDING
// ============================================================================

/**
 * Send a gift during a live session
 * Deducts tokens, records transaction, updates earnings
 */
export async function sendLiveGift(
  roomId: string,
  sessionId: string,
  senderId: string,
  giftTypeId: string
): Promise<{
  success: boolean;
  gift: LiveGift;
  creatorReceived: number;
  newBalance: number;
}> {
  
  // Validate gift type
  const gift = getGiftById(giftTypeId);
  if (!gift) {
    throw new HttpsError('invalid-argument', 'Invalid gift type');
  }

  // Get room and session
  const roomSnap = await db.collection(LIVE_COLLECTIONS.LIVE_ROOMS).doc(roomId).get();
  const sessionSnap = await db.collection(LIVE_COLLECTIONS.LIVE_SESSIONS).doc(sessionId).get();

  if (!roomSnap.exists || !sessionSnap.exists) {
    throw new HttpsError('not-found', 'Live room or session not found');
  }

  const room = roomSnap.data() as LiveRoom;
  const session = sessionSnap.data() as LiveSession;

  // Validate session is live
  if (room.status !== 'live' || session.status !== 'live') {
    throw new HttpsError('failed-precondition', 'Live session is not active');
  }

  // Check viewer eligibility
  if (VIEWER_ELIGIBILITY.REQUIRES_AUTH && !senderId) {
    throw new HttpsError('unauthenticated', 'Must be logged in to send gifts');
  }

  // Cannot send gifts to yourself
  if (senderId === room.hostId) {
    throw new HttpsError('failed-precondition', 'Cannot send gifts to yourself');
  }

  // Get sender wallet and check balance
  const walletRef = db.collection('users').doc(senderId).collection('wallet').doc('current');
  const walletSnap = await walletRef.get();
  const wallet = walletSnap.data();

  if (!wallet || wallet.balance < gift.tokenCost) {
    throw new HttpsError('failed-precondition', `Insufficient tokens. Need ${gift.tokenCost}, have ${wallet?.balance || 0}`);
  }

  // Calculate split
  const { creatorTokens, avaloTokens } = calculateLiveSplit(gift.tokenCost);

  // Execute transaction
  await db.runTransaction(async (transaction) => {
    // Deduct from sender
    transaction.update(walletRef, {
      balance: increment(-gift.tokenCost),
    });

    // Credit creator
    const hostWalletRef = db.collection('users').doc(room.hostId).collection('wallet').doc('current');
    transaction.update(hostWalletRef, {
      balance: increment(creatorTokens),
      earned: increment(creatorTokens),
    });

    // Record gift transaction
    const giftId = generateId();
    const giftRef = db.collection(LIVE_COLLECTIONS.LIVE_GIFTS).doc(giftId);
    const giftTransaction: Partial<LiveGiftTransaction> = {
      giftId,
      roomId,
      sessionId,
      hostId: room.hostId,
      senderId,
      giftTypeId: gift.id,
      giftName: gift.name,
      tokens: gift.tokenCost,
      creatorTokens,
      avaloTokens,
      createdAt: serverTimestamp(),
    };
    transaction.set(giftRef, giftTransaction);

    // Update session stats
    const sessionRef = db.collection(LIVE_COLLECTIONS.LIVE_SESSIONS).doc(sessionId);
    transaction.update(sessionRef, {
      totalGiftsTokens: increment(gift.tokenCost),
      earningsCreatorTokens: increment(creatorTokens),
      earningsAvaloTokens: increment(avaloTokens),
      giftsCount: increment(1),
      updatedAt: serverTimestamp(),
    });

    // Update room stats
    const roomRef = db.collection(LIVE_COLLECTIONS.LIVE_ROOMS).doc(roomId);
    transaction.update(roomRef, {
      totalGiftsTokens: increment(gift.tokenCost),
      lastActivityAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Record sender transaction
    const txRef = db.collection('transactions').doc(generateId());
    transaction.set(txRef, {
      userId: senderId,
      type: 'live_gift',
      amount: -gift.tokenCost,
      metadata: {
        roomId,
        sessionId,
        hostId: room.hostId,
        giftType: gift.id,
        giftName: gift.name,
      },
      createdAt: serverTimestamp(),
    });
  });

  // Record ranking action for host (non-blocking)
  try {
    await recordRankingAction({
      type: 'tip',
      creatorId: room.hostId,
      payerId: senderId,
      tokensAmount: gift.tokenCost,
      points: gift.tokenCost, // 1 point per token
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error('Failed to record ranking action for gift:', error);
  }

  // Get updated balance
  const updatedWalletSnap = await walletRef.get();
  const newBalance = updatedWalletSnap.data()?.balance || 0;

  logger.info(`Gift sent: ${gift.name} (${gift.tokenCost} tokens) from ${senderId} to ${room.hostId} in session ${sessionId}`);

  return {
    success: true,
    gift,
    creatorReceived: creatorTokens,
    newBalance,
  };
}

// ============================================================================
// QUEUE SYSTEM
// ============================================================================

/**
 * Join the queue to go on stage
 * Deducts tokens, adds to queue
 */
export async function joinQueue(
  roomId: string,
  sessionId: string,
  userId: string
): Promise<{ queueEntryId: string; position: number }> {
  
  // Get room and session
  const roomSnap = await db.collection(LIVE_COLLECTIONS.LIVE_ROOMS).doc(roomId).get();
  const sessionSnap = await db.collection(LIVE_COLLECTIONS.LIVE_SESSIONS).doc(sessionId).get();

  if (!roomSnap.exists || !sessionSnap.exists) {
    throw new HttpsError('not-found', 'Live room or session not found');
  }

  const room = roomSnap.data() as LiveRoom;
  const session = sessionSnap.data() as LiveSession;

  // Validate session is live
  if (room.status !== 'live' || session.status !== 'live') {
    throw new HttpsError('failed-precondition', 'Live session is not active');
  }

  // Cannot join own queue
  if (userId === room.hostId) {
    throw new HttpsError('failed-precondition', 'Host cannot join their own queue');
  }

  // Check if already in queue
  const existingQueueSnap = await db.collection(LIVE_COLLECTIONS.LIVE_QUEUE)
    .where('sessionId', '==', sessionId)
    .where('userId', '==', userId)
    .where('status', '==', 'waiting')
    .limit(1)
    .get();

  if (!existingQueueSnap.empty) {
    throw new HttpsError('failed-precondition', 'Already in queue');
  }

  // Check wallet balance
  const walletRef = db.collection('users').doc(userId).collection('wallet').doc('current');
  const walletSnap = await walletRef.get();
  const wallet = walletSnap.data();

  if (!wallet || wallet.balance < QUEUE_CONFIG.QUEUE_ENTRY_COST_TOKENS) {
    throw new HttpsError(
      'failed-precondition',
      `Insufficient tokens. Need ${QUEUE_CONFIG.QUEUE_ENTRY_COST_TOKENS}`
    );
  }

  // Get current queue size for position
  const queueSnap = await db.collection(LIVE_COLLECTIONS.LIVE_QUEUE)
    .where('sessionId', '==', sessionId)
    .where('status', '==', 'waiting')
    .get();

  const position = queueSnap.size + 1;

  // Check queue size limit
  if (position > LIVE_LIMITS.MAX_QUEUE_SIZE) {
    throw new HttpsError('failed-precondition', 'Queue is full');
  }

  const queueEntryId = generateId();

  // Execute transaction
  await db.runTransaction(async (transaction) => {
    // Deduct from user
    transaction.update(walletRef, {
      balance: increment(-QUEUE_CONFIG.QUEUE_ENTRY_COST_TOKENS),
    });

    // Create queue entry
    const queueRef = db.collection(LIVE_COLLECTIONS.LIVE_QUEUE).doc(queueEntryId);
    const queueEntry: Partial<QueueEntry> = {
      queueEntryId,
      roomId,
      sessionId,
      userId,
      status: 'waiting',
      position,
      tokensPaid: QUEUE_CONFIG.QUEUE_ENTRY_COST_TOKENS,
      refundTokens: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    transaction.set(queueRef, queueEntry);

    // Update session stats
    const sessionRef = db.collection(LIVE_COLLECTIONS.LIVE_SESSIONS).doc(sessionId);
    transaction.update(sessionRef, {
      queueEntriesCount: increment(1),
      updatedAt: serverTimestamp(),
    });

    // Record transaction
    const txRef = db.collection('transactions').doc(generateId());
    transaction.set(txRef, {
      userId,
      type: 'queue_entry',
      amount: -QUEUE_CONFIG.QUEUE_ENTRY_COST_TOKENS,
      metadata: {
        roomId,
        sessionId,
        hostId: room.hostId,
        position,
      },
      createdAt: serverTimestamp(),
    });
  });

  logger.info(`User ${userId} joined queue for session ${sessionId} at position ${position}`);

  return { queueEntryId, position };
}

/**
 * Update queue entry status (host controls)
 * Handles: waiting -> on_stage -> completed OR waiting -> skipped -> refunded
 */
export async function updateQueueEntryStatus(
  queueEntryId: string,
  hostId: string,
  newStatus: QueueEntryStatus
): Promise<{ success: boolean; refunded?: number }> {
  
  const queueRef = db.collection(LIVE_COLLECTIONS.LIVE_QUEUE).doc(queueEntryId);
  const queueSnap = await queueRef.get();

  if (!queueSnap.exists) {
    throw new HttpsError('not-found', 'Queue entry not found');
  }

  const queueEntry = queueSnap.data() as QueueEntry;

  // Validate host owns the session
  const sessionSnap = await db.collection(LIVE_COLLECTIONS.LIVE_SESSIONS).doc(queueEntry.sessionId).get();
  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Session not found');
  }

  const session = sessionSnap.data() as LiveSession;
  if (session.hostId !== hostId) {
    throw new HttpsError('permission-denied', 'Only host can update queue');
  }

  // Handle status transitions
  if (newStatus === 'on_stage' && queueEntry.status === 'waiting') {
    // Bring user on stage
    await queueRef.update({
      status: 'on_stage',
      enteredAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    logger.info(`Queue entry ${queueEntryId} moved on stage`);
    return { success: true };
  }

  if (newStatus === 'completed' && queueEntry.status === 'on_stage') {
    // Complete stage time - tokens go to host
    const { creatorTokens, avaloTokens } = calculateLiveSplit(queueEntry.tokensPaid);

    await db.runTransaction(async (transaction) => {
      // Update queue entry
      transaction.update(queueRef, {
        status: 'completed',
        leftAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Credit host
      const hostWalletRef = db.collection('users').doc(session.hostId).collection('wallet').doc('current');
      transaction.update(hostWalletRef, {
        balance: increment(creatorTokens),
        earned: increment(creatorTokens),
      });

      // Update session stats
      const sessionRef = db.collection(LIVE_COLLECTIONS.LIVE_SESSIONS).doc(queueEntry.sessionId);
      transaction.update(sessionRef, {
        totalQueueTokens: increment(queueEntry.tokensPaid),
        earningsCreatorTokens: increment(creatorTokens),
        earningsAvaloTokens: increment(avaloTokens),
        updatedAt: serverTimestamp(),
      });
    });

    logger.info(`Queue entry ${queueEntryId} completed (${queueEntry.tokensPaid} tokens to host)`);
    return { success: true };
  }

  if (newStatus === 'skipped' && queueEntry.status === 'waiting') {
    // Skip and refund
    await db.runTransaction(async (transaction) => {
      // Update queue entry
      transaction.update(queueRef, {
        status: 'refunded',
        refundTokens: queueEntry.tokensPaid,
        updatedAt: serverTimestamp(),
      });

      // Refund user
      const userWalletRef = db.collection('users').doc(queueEntry.userId).collection('wallet').doc('current');
      transaction.update(userWalletRef, {
        balance: increment(queueEntry.tokensPaid),
      });

      // Record refund transaction
      const txRef = db.collection('transactions').doc(generateId());
      transaction.set(txRef, {
        userId: queueEntry.userId,
        type: 'refund',
        amount: queueEntry.tokensPaid,
        metadata: {
          queueEntryId,
          reason: 'queue_skipped',
        },
        createdAt: serverTimestamp(),
      });
    });

    logger.info(`Queue entry ${queueEntryId} skipped - refunded ${queueEntry.tokensPaid} tokens`);
    return { success: true, refunded: queueEntry.tokensPaid };
  }

  throw new HttpsError('invalid-argument', `Invalid status transition: ${queueEntry.status} -> ${newStatus}`);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Update live earnings aggregate for a host
 */
async function updateLiveEarnings(
  hostId: string,
  update: {
    tokensEarned?: number;
    sessionDuration?: number;
    sessionCompleted?: boolean;
  }
): Promise<void> {
  const earningsRef = db.collection(LIVE_COLLECTIONS.LIVE_EARNINGS).doc(hostId);
  const earningsSnap = await earningsRef.get();

  if (!earningsSnap.exists) {
    // Initialize
    const newEarnings: Partial<LiveEarnings> = {
      hostId,
      totalLiveTokens: update.tokensEarned || 0,
      last30DaysTokens: update.tokensEarned || 0,
      sessionsCount: update.sessionCompleted ? 1 : 0,
      totalGiftsReceived: 0,
      totalQueueRevenue: 0,
      averageSessionDuration: update.sessionDuration || 0,
      lastSessionAt: update.sessionCompleted ? serverTimestamp() : undefined,
      updatedAt: serverTimestamp(),
    };
    await earningsRef.set(newEarnings);
  } else {
    // Update existing
    const earnings = earningsSnap.data() as LiveEarnings;
    const updates: any = {
      updatedAt: serverTimestamp(),
    };

    if (update.tokensEarned) {
      updates.totalLiveTokens = increment(update.tokensEarned);
      updates.last30DaysTokens = increment(update.tokensEarned);
    }

    if (update.sessionCompleted) {
      updates.sessionsCount = increment(1);
      updates.lastSessionAt = serverTimestamp();

      if (update.sessionDuration) {
        const totalDuration = (earnings.averageSessionDuration || 0) * (earnings.sessionsCount || 0) + update.sessionDuration;
        const newCount = (earnings.sessionsCount || 0) + 1;
        updates.averageSessionDuration = Math.floor(totalDuration / newCount);
      }
    }

    await earningsRef.update(updates);
  }
}

/**
 * Get public info about a live room (for viewers)
 */
export async function getRoomPublicInfo(roomId: string): Promise<any> {
  const roomSnap = await db.collection(LIVE_COLLECTIONS.LIVE_ROOMS).doc(roomId).get();
  
  if (!roomSnap.exists) {
    throw new HttpsError('not-found', 'Live room not found');
  }

  const room = roomSnap.data() as LiveRoom;

  // Get host public info
  const hostSnap = await db.collection('users').doc(room.hostId).get();
  const host = hostSnap.exists ? hostSnap.data() : {};

  // Get current session if live
  let currentSession = null;
  if (room.status === 'live') {
    const sessionSnap = await db.collection(LIVE_COLLECTIONS.LIVE_SESSIONS)
      .where('roomId', '==', roomId)
      .where('status', '==', 'live')
      .limit(1)
      .get();

    if (!sessionSnap.empty) {
      currentSession = sessionSnap.docs[0].data();
    }
  }

  return {
    room,
    host: {
      id: room.hostId,
      displayName: host?.displayName,
      avatar: host?.avatar,
      badges: {
        royal: host?.roles?.royal || false,
        vip: host?.roles?.vip || false,
        influencer: host?.influencerBadge || false,
      },
    },
    session: currentSession,
  };
}

/**
 * Get host live dashboard (stats & controls)
 */
export async function getHostLiveDashboard(hostId: string): Promise<any> {
  // Get earnings
  const earningsSnap = await db.collection(LIVE_COLLECTIONS.LIVE_EARNINGS).doc(hostId).get();
  const earnings = earningsSnap.exists ? earningsSnap.data() : null;

  // Get current live room
  const roomSnap = await db.collection(LIVE_COLLECTIONS.LIVE_ROOMS)
    .where('hostId', '==', hostId)
    .where('status', 'in', ['offline', 'live'])
    .limit(1)
    .get();

  const currentRoom = roomSnap.empty ? null : roomSnap.docs[0].data();

  // Get current session if live
  let currentSession = null;
  if (currentRoom && currentRoom.status === 'live') {
    const sessionSnap = await db.collection(LIVE_COLLECTIONS.LIVE_SESSIONS)
      .where('hostId', '==', hostId)
      .where('status', '==', 'live')
      .limit(1)
      .get();

    if (!sessionSnap.empty) {
      currentSession = sessionSnap.docs[0].data();
    }
  }

  return {
    earnings,
    currentRoom,
    currentSession,
    canGoLive: await validateHostEligibility(hostId),
  };
}