/**
 * PACK 217 — Avalo Live Arena Monetization
 * Real-time social rooms with gifts, queue system, and paid 1:1 chat transitions
 *
 * Features:
 * - Live arena hosting by verified earners
 * - Paid gifts (soft_flirt, fire, crown, royal_token)
 * - Queue system for 1:1 chat requests
 * - Spotlight entries (15 tokens for 3 min highlight)
 * - Priority messages (25 tokens for 1 min pin)
 * - Creator controls (mute, remove, block)
 * - Safety integration with PACK 211/212
 * - Analytics and event logging
 * - Transition to paid 1:1 chat
 */

import { db, serverTimestamp, increment, arrayUnion } from './init.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

export const ARENA_CONFIG = {
  // Entry types
  STANDARD_ENTRY: 0,           // Free entry
  SPOTLIGHT_ENTRY: 15,         // 15 tokens for 3-min highlight
  PRIORITY_ENTRY: 25,          // 25 tokens for 1-min pinned message
  
  // Gifts
  GIFTS: {
    SOFT_FLIRT: { cost: 10, message: 'cute / playful' },
    FIRE: { cost: 25, message: 'high attraction' },
    CROWN: { cost: 50, message: 'signal of request for 1:1 chat' },
    ROYAL_TOKEN: { cost: 120, message: 'instantly pushes you first in the queue' },
  },
  
  // Revenue split
  HOST_CUT_PERCENT: 65,        // Host receives 65%
  AVALO_CUT_PERCENT: 35,       // Avalo receives 35%
  
  // Queue priority values
  QUEUE_PRIORITY: {
    ROYAL_TOKEN: 1000,         // Highest priority
    CROWN: 500,                // High priority
    FIRE: 250,                 // Medium priority
    STANDARD: 0,               // Base priority (by time)
  },
  
  // Spotlight duration
  SPOTLIGHT_DURATION_MINUTES: 3,
  
  // Priority message duration
  PRIORITY_MESSAGE_DURATION_MINUTES: 1,
  
  // Chat transition
  CHAT_DEPOSIT_TOKENS: 100,    // Required deposit for 1:1 chat
  
  // Auto-cleanup
  INACTIVE_ARENA_HOURS: 2,     // Close arenas with no activity for 2 hours
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type ArenaStatus = 'scheduled' | 'live' | 'paused' | 'ended';
export type ViewerStatus = 'active' | 'removed' | 'blocked';
export type QueueStatus = 'waiting' | 'accepted' | 'rejected' | 'expired' | 'transitioned';
export type GiftType = 'soft_flirt' | 'fire' | 'crown' | 'royal_token';
export type ModerationAction = 'mute' | 'unmute' | 'remove' | 'block';

export interface ArenaData {
  arenaId: string;
  hostId: string;
  status: ArenaStatus;
  title?: string;
  category?: string;
  viewerCount: number;
  totalEarnings: number;
  startedAt?: Timestamp;
  endedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastActivityAt: Timestamp;
}

export interface GiftData {
  giftId: string;
  arenaId: string;
  senderId: string;
  recipientId: string;  // Host ID
  giftType: GiftType;
  cost: number;
  hostEarning: number;
  avaloEarning: number;
  createdAt: Timestamp;
}

export interface QueueEntry {
  queueId: string;
  arenaId: string;
  viewerId: string;
  hostId: string;
  priority: number;
  status: QueueStatus;
  giftsGiven: GiftType[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SpotlightEntry {
  spotlightId: string;
  arenaId: string;
  userId: string;
  cost: number;
  durationMinutes: number;
  active: boolean;
  expiresAt: Timestamp;
  createdAt: Timestamp;
}

export interface PriorityMessage {
  messageId: string;
  arenaId: string;
  senderId: string;
  message: string;
  cost: number;
  durationMinutes: number;
  active: boolean;
  expiresAt: Timestamp;
  createdAt: Timestamp;
}

// ============================================================================
// ARENA MANAGEMENT
// ============================================================================

/**
 * Create a new arena (must be verified earner)
 */
export async function createArena(
  hostId: string,
  options: {
    title?: string;
    category?: string;
    scheduledFor?: Date;
  } = {}
): Promise<{ success: boolean; arenaId?: string; error?: string }> {
  const batch = db.batch();
  
  try {
    // Validate host is earner
    const hostDoc = await db.collection('users').doc(hostId).get();
    if (!hostDoc.exists) {
      return { success: false, error: 'Host not found' };
    }
    
    const hostData = hostDoc.data()!;
    if (!hostData.earnOnChat) {
      return { success: false, error: 'Host must have earnOnChat enabled' };
    }
    
    if (!hostData.verification?.age18) {
      return { success: false, error: 'Host must be verified 18+' };
    }
    
    // Check for active arenas
    const activeArenas = await db.collection('live_arenas')
      .where('hostId', '==', hostId)
      .where('status', 'in', ['live', 'paused'])
      .limit(1)
      .get();
    
    if (!activeArenas.empty) {
      return { success: false, error: 'Host already has an active arena' };
    }
    
    // Create arena
    const arenaRef = db.collection('live_arenas').doc();
    const arenaData: ArenaData = {
      arenaId: arenaRef.id,
      hostId,
      status: options.scheduledFor ? 'scheduled' : 'live',
      title: options.title,
      category: options.category,
      viewerCount: 0,
      totalEarnings: 0,
      startedAt: options.scheduledFor ? undefined : Timestamp.now(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      lastActivityAt: Timestamp.now(),
    };
    
    batch.set(arenaRef, arenaData);
    
    // Create analytics document
    const analyticsRef = db.collection('arena_analytics').doc(arenaRef.id);
    batch.set(analyticsRef, {
      arenaId: arenaRef.id,
      hostId,
      totalViewers: 0,
      totalGifts: 0,
      totalRevenue: 0,
      giftBreakdown: {},
      queueRequests: 0,
      transitions: 0,
      createdAt: Timestamp.now(),
    });
    
    await batch.commit();
    
    logger.info(`Arena created: ${arenaRef.id} by host ${hostId}`);
    return { success: true, arenaId: arenaRef.id };
    
  } catch (error) {
    logger.error('Error creating arena:', error);
    return { success: false, error: 'Internal error creating arena' };
  }
}

/**
 * Start a scheduled arena
 */
export async function startArena(
  arenaId: string,
  hostId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const arenaRef = db.collection('live_arenas').doc(arenaId);
    const arenaDoc = await arenaRef.get();
    
    if (!arenaDoc.exists) {
      return { success: false, error: 'Arena not found' };
    }
    
    const arenaData = arenaDoc.data() as ArenaData;
    
    if (arenaData.hostId !== hostId) {
      return { success: false, error: 'Not authorized' };
    }
    
    if (arenaData.status !== 'scheduled') {
      return { success: false, error: 'Arena is not in scheduled state' };
    }
    
    await arenaRef.update({
      status: 'live',
      startedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      lastActivityAt: Timestamp.now(),
    });
    
    logger.info(`Arena started: ${arenaId}`);
    return { success: true };
    
  } catch (error) {
    logger.error('Error starting arena:', error);
    return { success: false, error: 'Internal error starting arena' };
  }
}

/**
 * Pause arena (host taking break for 1:1 chat)
 */
export async function pauseArena(
  arenaId: string,
  hostId: string,
  reason: string = 'private_chat'
): Promise<{ success: boolean; error?: string }> {
  try {
    const arenaRef = db.collection('live_arenas').doc(arenaId);
    const arenaDoc = await arenaRef.get();
    
    if (!arenaDoc.exists) {
      return { success: false, error: 'Arena not found' };
    }
    
    const arenaData = arenaDoc.data() as ArenaData;
    
    if (arenaData.hostId !== hostId) {
      return { success: false, error: 'Not authorized' };
    }
    
    if (arenaData.status !== 'live') {
      return { success: false, error: 'Arena is not live' };
    }
    
    await arenaRef.update({
      status: 'paused',
      pauseReason: reason,
      pausedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    logger.info(`Arena paused: ${arenaId} for ${reason}`);
    return { success: true };
    
  } catch (error) {
    logger.error('Error pausing arena:', error);
    return { success: false, error: 'Internal error pausing arena' };
  }
}

/**
 * Resume paused arena
 */
export async function resumeArena(
  arenaId: string,
  hostId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const arenaRef = db.collection('live_arenas').doc(arenaId);
    const arenaDoc = await arenaRef.get();
    
    if (!arenaDoc.exists) {
      return { success: false, error: 'Arena not found' };
    }
    
    const arenaData = arenaDoc.data() as ArenaData;
    
    if (arenaData.hostId !== hostId) {
      return { success: false, error: 'Not authorized' };
    }
    
    if (arenaData.status !== 'paused') {
      return { success: false, error: 'Arena is not paused' };
    }
    
    await arenaRef.update({
      status: 'live',
      pauseReason: FieldValue.delete(),
      pausedAt: FieldValue.delete(),
      updatedAt: Timestamp.now(),
      lastActivityAt: Timestamp.now(),
    });
    
    logger.info(`Arena resumed: ${arenaId}`);
    return { success: true };
    
  } catch (error) {
    logger.error('Error resuming arena:', error);
    return { success: false, error: 'Internal error resuming arena' };
  }
}

/**
 * End arena and settle earnings
 */
export async function endArena(
  arenaId: string,
  hostId: string
): Promise<{ success: boolean; totalEarnings?: number; error?: string }> {
  const batch = db.batch();
  
  try {
    const arenaRef = db.collection('live_arenas').doc(arenaId);
    const arenaDoc = await arenaRef.get();
    
    if (!arenaDoc.exists) {
      return { success: false, error: 'Arena not found' };
    }
    
    const arenaData = arenaDoc.data() as ArenaData;
    
    if (arenaData.hostId !== hostId) {
      return { success: false, error: 'Not authorized' };
    }
    
    if (arenaData.status === 'ended') {
      return { success: false, error: 'Arena already ended' };
    }
    
    // Update arena status
    batch.update(arenaRef, {
      status: 'ended',
      endedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    // Expire all queue entries
    const queueSnapshot = await db.collection('arena_queue')
      .where('arenaId', '==', arenaId)
      .where('status', '==', 'waiting')
      .get();
    
    queueSnapshot.forEach(doc => {
      batch.update(doc.ref, {
        status: 'expired',
        updatedAt: Timestamp.now(),
      });
    });
    
    // Deactivate all spotlights
    const spotlightSnapshot = await db.collection('arena_spotlight')
      .where('arenaId', '==', arenaId)
      .where('active', '==', true)
      .get();
    
    spotlightSnapshot.forEach(doc => {
      batch.update(doc.ref, {
        active: false,
        updatedAt: Timestamp.now(),
      });
    });
    
    // Deactivate all priority messages
    const prioritySnapshot = await db.collection('arena_priority_messages')
      .where('arenaId', '==', arenaId)
      .where('active', '==', true)
      .get();
    
    prioritySnapshot.forEach(doc => {
      batch.update(doc.ref, {
        active: false,
        updatedAt: Timestamp.now(),
      });
    });
    
    await batch.commit();
    
    logger.info(`Arena ended: ${arenaId}, total earnings: ${arenaData.totalEarnings}`);
    return { success: true, totalEarnings: arenaData.totalEarnings };
    
  } catch (error) {
    logger.error('Error ending arena:', error);
    return { success: false, error: 'Internal error ending arena' };
  }
}

// ============================================================================
// VIEWER MANAGEMENT
// ============================================================================

/**
 * Join arena as viewer
 */
export async function joinArena(
  arenaId: string,
  userId: string,
  entryType: 'standard' | 'spotlight' | 'priority' = 'standard'
): Promise<{ success: boolean; viewerId?: string; error?: string }> {
  const batch = db.batch();
  
  try {
    // Check arena status
    const arenaRef = db.collection('live_arenas').doc(arenaId);
    const arenaDoc = await arenaRef.get();
    
    if (!arenaDoc.exists) {
      return { success: false, error: 'Arena not found' };
    }
    
    const arenaData = arenaDoc.data() as ArenaData;
    
    if (arenaData.status !== 'live') {
      return { success: false, error: 'Arena is not live' };
    }
    
    // Check if already in arena
    const existingViewer = await db.collection('arena_viewers')
      .where('arenaId', '==', arenaId)
      .where('userId', '==', userId)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    
    if (!existingViewer.empty) {
      return { success: true, viewerId: existingViewer.docs[0].id };
    }
    
    // Check if user has tokens for special entry (handled by caller)
    // This function assumes payment already processed
    
    // Create viewer entry
    const viewerRef = db.collection('arena_viewers').doc();
    batch.set(viewerRef, {
      viewerId: viewerRef.id,
      arenaId,
      userId,
      hostId: arenaData.hostId,
      status: 'active',
      entryType,
      hasSpotlight: entryType === 'spotlight',
      joinedAt: Timestamp.now(),
      lastActivityAt: Timestamp.now(),
    });
    
    // Update viewer count
    batch.update(arenaRef, {
      viewerCount: increment(1),
      lastActivityAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    // Update analytics
    const analyticsRef = db.collection('arena_analytics').doc(arenaId);
    batch.update(analyticsRef, {
      totalViewers: increment(1),
      updatedAt: Timestamp.now(),
    });
    
    // Create session for analytics
    const sessionRef = db.collection('arena_sessions').doc();
    batch.set(sessionRef, {
      sessionId: sessionRef.id,
      arenaId,
      userId,
      hostId: arenaData.hostId,
      entryType,
      startedAt: Timestamp.now(),
    });
    
    await batch.commit();
    
    logger.info(`Viewer ${userId} joined arena ${arenaId} with ${entryType} entry`);
    return { success: true, viewerId: viewerRef.id };
    
  } catch (error) {
    logger.error('Error joining arena:', error);
    return { success: false, error: 'Internal error joining arena' };
  }
}

/**
 * Leave arena
 */
export async function leaveArena(
  arenaId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const batch = db.batch();
  
  try {
    // Find viewer entry
    const viewerSnapshot = await db.collection('arena_viewers')
      .where('arenaId', '==', arenaId)
      .where('userId', '==', userId)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    
    if (viewerSnapshot.empty) {
      return { success: false, error: 'Not in arena' };
    }
    
    const viewerRef = viewerSnapshot.docs[0].ref;
    
    // Remove viewer
    batch.delete(viewerRef);
    
    // Update viewer count
    const arenaRef = db.collection('live_arenas').doc(arenaId);
    batch.update(arenaRef, {
      viewerCount: increment(-1),
      updatedAt: Timestamp.now(),
    });
    
    // End session
    const sessionSnapshot = await db.collection('arena_sessions')
      .where('arenaId', '==', arenaId)
      .where('userId', '==', userId)
      .orderBy('startedAt', 'desc')
      .limit(1)
      .get();
    
    if (!sessionSnapshot.empty) {
      batch.update(sessionSnapshot.docs[0].ref, {
        endedAt: Timestamp.now(),
      });
    }
    
    await batch.commit();
    
    logger.info(`Viewer ${userId} left arena ${arenaId}`);
    return { success: true };
    
  } catch (error) {
    logger.error('Error leaving arena:', error);
    return { success: false, error: 'Internal error leaving arena' };
  }
}

// ============================================================================
// GIFT SYSTEM
// ============================================================================

/**
 * Send gift to host
 */
export async function sendGift(
  arenaId: string,
  senderId: string,
  giftType: GiftType
): Promise<{ success: boolean; giftId?: string; hostEarning?: number; error?: string }> {
  const batch = db.batch();
  
  try {
    // Validate gift type
    const giftConfig = ARENA_CONFIG.GIFTS[giftType.toUpperCase() as keyof typeof ARENA_CONFIG.GIFTS];
    if (!giftConfig) {
      return { success: false, error: 'Invalid gift type' };
    }
    
    // Get arena
    const arenaRef = db.collection('live_arenas').doc(arenaId);
    const arenaDoc = await arenaRef.get();
    
    if (!arenaDoc.exists) {
      return { success: false, error: 'Arena not found' };
    }
    
    const arenaData = arenaDoc.data() as ArenaData;
    
    if (arenaData.status !== 'live') {
      return { success: false, error: 'Arena is not live' };
    }
    
    // Check sender balance
    const senderRef = db.collection('users').doc(senderId);
    const senderDoc = await senderRef.get();
    
    if (!senderDoc.exists) {
      return { success: false, error: 'Sender not found' };
    }
    
    const senderData = senderDoc.data()!;
    const senderBalance = senderData.tokenBalance || 0;
    
    if (senderBalance < giftConfig.cost) {
      return { success: false, error: 'Insufficient tokens' };
    }
    
    // Calculate revenue split (65% host, 35% Avalo)
    const hostEarning = Math.floor(giftConfig.cost * (ARENA_CONFIG.HOST_CUT_PERCENT / 100));
    const avaloEarning = giftConfig.cost - hostEarning;
    
    // Create gift record
    const giftRef = db.collection('arena_gifts').doc();
    const giftData: GiftData = {
      giftId: giftRef.id,
      arenaId,
      senderId,
      recipientId: arenaData.hostId,
      giftType,
      cost: giftConfig.cost,
      hostEarning,
      avaloEarning,
      createdAt: Timestamp.now(),
    };
    
    batch.set(giftRef, giftData);
    
    // Deduct tokens from sender
    batch.update(senderRef, {
      tokenBalance: increment(-giftConfig.cost),
      updatedAt: Timestamp.now(),
    });
    
    // Credit host
    const hostRef = db.collection('users').doc(arenaData.hostId);
    batch.update(hostRef, {
      tokenBalance: increment(hostEarning),
      totalEarnings: increment(hostEarning),
      updatedAt: Timestamp.now(),
    });
    
    // Update arena earnings
    batch.update(arenaRef, {
      totalEarnings: increment(hostEarning),
      lastActivityAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    // Update analytics
    const analyticsRef = db.collection('arena_analytics').doc(arenaId);
    batch.update(analyticsRef, {
      totalGifts: increment(1),
      totalRevenue: increment(giftConfig.cost),
      [`giftBreakdown.${giftType}`]: increment(1),
      updatedAt: Timestamp.now(),
    });
    
    // Create transaction records
    const txRef1 = db.collection('transactions').doc();
    batch.set(txRef1, {
      transactionId: txRef1.id,
      type: 'arena_gift_charge',
      userId: senderId,
      amount: -giftConfig.cost,
      relatedId: giftRef.id,
      arenaId,
      giftType,
      createdAt: Timestamp.now(),
    });
    
    const txRef2 = db.collection('transactions').doc();
    batch.set(txRef2, {
      transactionId: txRef2.id,
      type: 'arena_gift_earning',
      userId: arenaData.hostId,
      amount: hostEarning,
      relatedId: giftRef.id,
      arenaId,
      giftType,
      createdAt: Timestamp.now(),
    });
    
    // If Royal Token, auto-add to queue with top priority
    if (giftType === 'royal_token') {
      await addToQueue(arenaId, senderId, giftType);
    }
    
    await batch.commit();
    
    logger.info(`Gift ${giftType} sent by ${senderId} in arena ${arenaId}: ${hostEarning} tokens to host`);
    return { success: true, giftId: giftRef.id, hostEarning };
    
  } catch (error) {
    logger.error('Error sending gift:', error);
    return { success: false, error: 'Internal error sending gift' };
  }
}

// ============================================================================
// QUEUE SYSTEM
// ============================================================================

/**
 * Add viewer to queue for 1:1 chat
 */
export async function addToQueue(
  arenaId: string,
  viewerId: string,
  giftType?: GiftType
): Promise<{ success: boolean; queueId?: string; position?: number; error?: string }> {
  const batch = db.batch();
  
  try {
    // Get arena
    const arenaDoc = await db.collection('live_arenas').doc(arenaId).get();
    if (!arenaDoc.exists) {
      return { success: false, error: 'Arena not found' };
    }
    
    const arenaData = arenaDoc.data() as ArenaData;
    
    // Check if already in queue
    const existing = await db.collection('arena_queue')
      .where('arenaId', '==', arenaId)
      .where('viewerId', '==', viewerId)
      .where('status', '==', 'waiting')
      .limit(1)
      .get();
    
    if (!existing.empty) {
      // Update priority if better gift given
      const existingData = existing.docs[0].data() as QueueEntry;
      const newPriority = calculateQueuePriority(giftType);
      
      if (newPriority > existingData.priority) {
        await existing.docs[0].ref.update({
          priority: newPriority,
          giftsGiven: arrayUnion(giftType!),
          updatedAt: Timestamp.now(),
        });
      }
      
      return { success: true, queueId: existing.docs[0].id };
    }
    
    // Create queue entry
    const queueRef = db.collection('arena_queue').doc();
    const priority = calculateQueuePriority(giftType);
    
    const queueData: QueueEntry = {
      queueId: queueRef.id,
      arenaId,
      viewerId,
      hostId: arenaData.hostId,
      priority,
      status: 'waiting',
      giftsGiven: giftType ? [giftType] : [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    
    batch.set(queueRef, queueData);
    
    // Update analytics
    const analyticsRef = db.collection('arena_analytics').doc(arenaId);
    batch.update(analyticsRef, {
      queueRequests: increment(1),
      updatedAt: Timestamp.now(),
    });
    
    await batch.commit();
    
    // Calculate position
    const queueSnapshot = await db.collection('arena_queue')
      .where('arenaId', '==', arenaId)
      .where('status', '==', 'waiting')
      .orderBy('priority', 'desc')
      .orderBy('createdAt', 'asc')
      .get();
    
    let position = 1;
    for (const doc of queueSnapshot.docs) {
      if (doc.id === queueRef.id) break;
      position++;
    }
    
    logger.info(`Viewer ${viewerId} added to queue in arena ${arenaId} at position ${position}`);
    return { success: true, queueId: queueRef.id, position };
    
  } catch (error) {
    logger.error('Error adding to queue:', error);
    return { success: false, error: 'Internal error adding to queue' };
  }
}

/**
 * Calculate queue priority based on gifts
 */
function calculateQueuePriority(giftType?: GiftType): number {
  if (!giftType) return ARENA_CONFIG.QUEUE_PRIORITY.STANDARD;
  
  switch (giftType) {
    case 'royal_token':
      return ARENA_CONFIG.QUEUE_PRIORITY.ROYAL_TOKEN;
    case 'crown':
      return ARENA_CONFIG.QUEUE_PRIORITY.CROWN;
    case 'fire':
      return ARENA_CONFIG.QUEUE_PRIORITY.FIRE;
    default:
      return ARENA_CONFIG.QUEUE_PRIORITY.STANDARD;
  }
}

/**
 * Accept queue request and transition to 1:1 chat
 */
export async function acceptQueueRequest(
  queueId: string,
  hostId: string
): Promise<{ success: boolean; chatId?: string; error?: string }> {
  const batch = db.batch();
  
  try {
    // Get queue entry
    const queueRef = db.collection('arena_queue').doc(queueId);
    const queueDoc = await queueRef.get();
    
    if (!queueDoc.exists) {
      return { success: false, error: 'Queue entry not found' };
    }
    
    const queueData = queueDoc.data() as QueueEntry;
    
    if (queueData.hostId !== hostId) {
      return { success: false, error: 'Not authorized' };
    }
    
    if (queueData.status !== 'waiting') {
      return { success: false, error: 'Queue entry not in waiting state' };
    }
    
    // Update queue status
    batch.update(queueRef, {
      status: 'accepted',
      acceptedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    // Pause arena
    const arenaRef = db.collection('live_arenas').doc(queueData.arenaId);
    batch.update(arenaRef, {
      status: 'paused',
      pauseReason: 'private_chat',
      pausedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    // Create transition record
    const transitionRef = db.collection('arena_transitions').doc();
    batch.set(transitionRef, {
      transitionId: transitionRef.id,
      arenaId: queueData.arenaId,
      queueId,
      viewerId: queueData.viewerId,
      hostId,
      status: 'initiated',
      requiresDeposit: true,
      depositAmount: ARENA_CONFIG.CHAT_DEPOSIT_TOKENS,
      createdAt: Timestamp.now(),
    });
    
    // Update analytics
    const analyticsRef = db.collection('arena_analytics').doc(queueData.arenaId);
    batch.update(analyticsRef, {
      transitions: increment(1),
      updatedAt: Timestamp.now(),
    });
    
    await batch.commit();
    
    logger.info(`Queue request ${queueId} accepted, transitioning to 1:1 chat`);
    return { success: true, chatId: transitionRef.id };
    
  } catch (error) {
    logger.error('Error accepting queue request:', error);
    return { success: false, error: 'Internal error accepting request' };
  }
}

/**
 * Reject queue request
 */
export async function rejectQueueRequest(
  queueId: string,
  hostId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const queueRef = db.collection('arena_queue').doc(queueId);
    const queueDoc = await queueRef.get();
    
    if (!queueDoc.exists) {
      return { success: false, error: 'Queue entry not found' };
    }
    
    const queueData = queueDoc.data() as QueueEntry;
    
    if (queueData.hostId !== hostId) {
      return { success: false, error: 'Not authorized' };
    }
    
    if (queueData.status !== 'waiting') {
      return { success: false, error: 'Queue entry not in waiting state' };
    }
    
    await queueRef.update({
      status: 'rejected',
      rejectedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    logger.info(`Queue request ${queueId} rejected by host`);
    return { success: true };
    
  } catch (error) {
    logger.error('Error rejecting queue request:', error);
    return { success: false, error: 'Internal error rejecting request' };
  }
}

// ============================================================================
// SPOTLIGHT & PRIORITY MESSAGES
// ============================================================================

/**
 * Purchase spotlight (15 tokens for 3 min highlight)
 */
export async function purchaseSpotlight(
  arenaId: string,
  userId: string
): Promise<{ success: boolean; spotlightId?: string; expiresAt?: Date; error?: string }> {
  const batch = db.batch();
  
  try {
    const cost = ARENA_CONFIG.SPOTLIGHT_ENTRY;
    
    // Check user balance
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return { success: false, error: 'User not found' };
    }
    
    const userData = userDoc.data()!;
    const balance = userData.tokenBalance || 0;
    
    if (balance < cost) {
      return { success: false, error: 'Insufficient tokens' };
    }
    
    // Check arena exists
    const arenaDoc = await db.collection('live_arenas').doc(arenaId).get();
    if (!arenaDoc.exists) {
      return { success: false, error: 'Arena not found' };
    }
    
    // Check for active spotlight
    const existing = await db.collection('arena_spotlight')
      .where('arenaId', '==', arenaId)
      .where('userId', '==', userId)
      .where('active', '==', true)
      .limit(1)
      .get();
    
    if (!existing.empty) {
      return { success: false, error: 'Already have active spotlight' };
    }
    
    // Calculate expiry
    const expiresAt = new Date(Date.now() + ARENA_CONFIG.SPOTLIGHT_DURATION_MINUTES * 60 * 1000);
    
    // Create spotlight
    const spotlightRef = db.collection('arena_spotlight').doc();
    batch.set(spotlightRef, {
      spotlightId: spotlightRef.id,
      arenaId,
      userId,
      cost,
      durationMinutes: ARENA_CONFIG.SPOTLIGHT_DURATION_MINUTES,
      active: true,
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: Timestamp.now(),
    });
    
    // Deduct tokens (does NOT count as host earnings)
    batch.update(userRef, {
      tokenBalance: increment(-cost),
      updatedAt: Timestamp.now(),
    });
    
    // Update viewer record
    const viewerSnapshot = await db.collection('arena_viewers')
      .where('arenaId', '==', arenaId)
      .where('userId', '==', userId)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    
    if (!viewerSnapshot.empty) {
      batch.update(viewerSnapshot.docs[0].ref, {
        hasSpotlight: true,
        spotlightExpiresAt: Timestamp.fromDate(expiresAt),
        updatedAt: Timestamp.now(),
      });
    }
    
    // Transaction record
    const txRef = db.collection('transactions').doc();
    batch.set(txRef, {
      transactionId: txRef.id,
      type: 'arena_spotlight',
      userId,
      amount: -cost,
      arenaId,
      relatedId: spotlightRef.id,
      createdAt: Timestamp.now(),
    });
    
    await batch.commit();
    
    logger.info(`Spotlight purchased by ${userId} in arena ${arenaId}`);
    return { success: true, spotlightId: spotlightRef.id, expiresAt };
    
  } catch (error) {
    logger.error('Error purchasing spotlight:', error);
    return { success: false, error: 'Internal error purchasing spotlight' };
  }
}

/**
 * Send priority message (25 tokens for 1 min pin)
 */
export async function sendPriorityMessage(
  arenaId: string,
  senderId: string,
  message: string
): Promise<{ success: boolean; messageId?: string; expiresAt?: Date; error?: string }> {
  const batch = db.batch();
  
  try {
    const cost = ARENA_CONFIG.PRIORITY_ENTRY;
    
    // Validate message
    if (!message || message.length > 200) {
      return { success: false, error: 'Invalid message length' };
    }
    
    // Check user balance
    const userRef = db.collection('users').doc(senderId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return { success: false, error: 'User not found' };
    }
    
    const userData = userDoc.data()!;
    const balance = userData.tokenBalance || 0;
    
    if (balance < cost) {
      return { success: false, error: 'Insufficient tokens' };
    }
    
    // Check arena exists
    const arenaDoc = await db.collection('live_arenas').doc(arenaId).get();
    if (!arenaDoc.exists) {
      return { success: false, error: 'Arena not found' };
    }
    
    // Calculate expiry
    const expiresAt = new Date(Date.now() + ARENA_CONFIG.PRIORITY_MESSAGE_DURATION_MINUTES * 60 * 1000);
    
    // Create priority message
    const messageRef = db.collection('arena_priority_messages').doc();
    batch.set(messageRef, {
      messageId: messageRef.id,
      arenaId,
      senderId,
      message,
      cost,
      durationMinutes: ARENA_CONFIG.PRIORITY_MESSAGE_DURATION_MINUTES,
      active: true,
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: Timestamp.now(),
    });
    
    // Deduct tokens (does NOT count as host earnings)
    batch.update(userRef, {
      tokenBalance: increment(-cost),
      updatedAt: Timestamp.now(),
    });
    
    // Transaction record
    const txRef = db.collection('transactions').doc();
    batch.set(txRef, {
      transactionId: txRef.id,
      type: 'arena_priority_message',
      userId: senderId,
      amount: -cost,
      arenaId,
      relatedId: messageRef.id,
      createdAt: Timestamp.now(),
    });
    
    await batch.commit();
    
    logger.info(`Priority message sent by ${senderId} in arena ${arenaId}`);
    return { success: true, messageId: messageRef.id, expiresAt };
    
  } catch (error) {
    logger.error('Error sending priority message:', error);
    return { success: false, error: 'Internal error sending priority message' };
  }
}

// ============================================================================
// CREATOR CONTROLS & MODERATION
// ============================================================================

/**
 * Apply moderation action (mute, remove, block)
 */
export async function moderateViewer(
  arenaId: string,
  hostId: string,
  targetId: string,
  action: ModerationAction
): Promise<{ success: boolean; error?: string }> {
  const batch = db.batch();
  
  try {
    // Verify host ownership
    const arenaDoc = await db.collection('live_arenas').doc(arenaId).get();
    if (!arenaDoc.exists) {
      return { success: false, error: 'Arena not found' };
    }
    
    const arenaData = arenaDoc.data() as ArenaData;
    if (arenaData.hostId !== hostId) {
      return { success: false, error: 'Not authorized' };
    }
    
    // Create moderation record
    const moderationRef = db.collection('arena_moderation').doc();
    batch.set(moderationRef, {
      moderationId: moderationRef.id,
      arenaId,
      hostId,
      targetId,
      actionType: action,
      createdAt: Timestamp.now(),
    });
    
    // Apply action
    if (action === 'remove' || action === 'block') {
      // Remove viewer
      const viewerSnapshot = await db.collection('arena_viewers')
        .where('arenaId', '==', arenaId)
        .where('userId', '==', targetId)
        .where('status', '==', 'active')
        .limit(1)
        .get();
      
      if (!viewerSnapshot.empty) {
        batch.update(viewerSnapshot.docs[0].ref, {
          status: action === 'block' ? 'blocked' : 'removed',
          removedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
        
        // Update viewer count
        batch.update(db.collection('live_arenas').doc(arenaId), {
          viewerCount: increment(-1),
          updatedAt: Timestamp.now(),
        });
      }
      
      // Remove from queue if present
      const queueSnapshot = await db.collection('arena_queue')
        .where('arenaId', '==', arenaId)
        .where('viewerId', '==', targetId)
        .where('status', '==', 'waiting')
        .limit(1)
        .get();
      
      if (!queueSnapshot.empty) {
        batch.update(queueSnapshot.docs[0].ref, {
          status: 'rejected',
          rejectedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      }
    }
    
    if (action === 'block') {
      // Add to blocked list
      batch.update(db.collection('live_arenas').doc(arenaId), {
        blockedUsers: arrayUnion(targetId),
        updatedAt: Timestamp.now(),
      });
    }
    
    await batch.commit();
    
    logger.info(`Moderation action ${action} applied by host ${hostId} to ${targetId} in arena ${arenaId}`);
    return { success: true };
    
  } catch (error) {
    logger.error('Error moderating viewer:', error);
    return { success: false, error: 'Internal error applying moderation' };
  }
}

// ============================================================================
// SAFETY INTEGRATION (PACK 211/212)
// ============================================================================

/**
 * Log safety event in arena
 */
export async function logArenaSafetyEvent(
  arenaId: string,
  userId: string,
  eventType: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  details: any
): Promise<void> {
  try {
    await db.collection('arena_safety_events').add({
      arenaId,
      userId,
      eventType,
      severity,
      details,
      createdAt: Timestamp.now(),
      status: 'pending',
    });
    
    // If critical, auto-remove from arena
    if (severity === 'critical') {
      const arenaDoc = await db.collection('live_arenas').doc(arenaId).get();
      if (arenaDoc.exists) {
        const hostId = arenaDoc.data()!.hostId;
        await moderateViewer(arenaId, hostId, userId, 'block');
      }
    }
    
    logger.warn(`Arena safety event: ${eventType} (${severity}) for user ${userId} in arena ${arenaId}`);
  } catch (error) {
    logger.error('Error logging arena safety event:', error);
  }
}

/**
 * Check user reputation for arena access
 */
export async function checkArenaAccess(userId: string): Promise<boolean> {
  try {
    // Check user risk profile (PACK 211)
    const riskProfile = await db.collection('user_risk_profiles').doc(userId).get();
    if (riskProfile.exists) {
      const riskData = riskProfile.data()!;
      if (riskData.category === 'high_risk' || riskData.banned) {
        return false;
      }
    }
    
    // Check reputation (PACK 212)
    const reputation = await db.collection('user_reputation').doc(userId).get();
    if (reputation.exists) {
      const repData = reputation.data()!;
      // Block if reputation score below threshold (e.g., < 20)
      if (repData.score && repData.score < 20) {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    logger.error('Error checking arena access:', error);
    return true; // Fail open in case of error
  }
}

// ============================================================================
// CLEANUP & MAINTENANCE
// ============================================================================

/**
 * Auto-close inactive arenas
 */
export async function autoCloseInactiveArenas(): Promise<number> {
  let closedCount = 0;
  
  try {
    const cutoffTime = Timestamp.fromDate(
      new Date(Date.now() - ARENA_CONFIG.INACTIVE_ARENA_HOURS * 60 * 60 * 1000)
    );
    
    const inactiveArenas = await db.collection('live_arenas')
      .where('status', 'in', ['live', 'paused'])
      .where('lastActivityAt', '<', cutoffTime)
      .limit(50)
      .get();
    
    for (const doc of inactiveArenas.docs) {
      const arenaData = doc.data() as ArenaData;
      const result = await endArena(doc.id, arenaData.hostId);
      if (result.success) {
        closedCount++;
      }
    }
    
    if (closedCount > 0) {
      logger.info(`Auto-closed ${closedCount} inactive arenas`);
    }
  } catch (error) {
    logger.error('Error auto-closing arenas:', error);
  }
  
  return closedCount;
}

/**
 * Expire old spotlights
 */
export async function expireSpotlights(): Promise<number> {
  let expiredCount = 0;
  
  try {
    const now = Timestamp.now();
    
    const expiredSpotlights = await db.collection('arena_spotlight')
      .where('active', '==', true)
      .where('expiresAt', '<', now)
      .limit(100)
      .get();
    
    const batch = db.batch();
    
    for (const doc of expiredSpotlights.docs) {
      batch.update(doc.ref, {
        active: false,
        updatedAt: now,
      });
      expiredCount++;
    }
    
    if (expiredCount > 0) {
      await batch.commit();
      logger.info(`Expired ${expiredCount} spotlights`);
    }
  } catch (error) {
    logger.error('Error expiring spotlights:', error);
  }
  
  return expiredCount;
}

/**
 * Expire old priority messages
 */
export async function expirePriorityMessages(): Promise<number> {
  let expiredCount = 0;
  
  try {
    const now = Timestamp.now();
    
    const expiredMessages = await db.collection('arena_priority_messages')
      .where('active', '==', true)
      .where('expiresAt', '<', now)
      .limit(100)
      .get();
    
    const batch = db.batch();
    
    for (const doc of expiredMessages.docs) {
      batch.update(doc.ref, {
        active: false,
        updatedAt: now,
      });
      expiredCount++;
    }
    
    if (expiredCount > 0) {
      await batch.commit();
      logger.info(`Expired ${expiredCount} priority messages`);
    }
  } catch (error) {
    logger.error('Error expiring priority messages:', error);
  }
  
  return expiredCount;
}