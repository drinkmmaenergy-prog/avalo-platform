/**
 * Arena Service - Real-time Live Arena functionality
 * Handles WebRTC/WebSocket connections, gifts, queue, and chat transitions
 */

import { db } from '../lib/firebase';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  Timestamp,
  increment,
  arrayUnion,
  getDocs,
  getDoc,
} from 'firebase/firestore';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type ArenaStatus = 'scheduled' | 'live' | 'paused' | 'ended';
export type ViewerStatus = 'active' | 'removed' | 'blocked';
export type QueueStatus = 'waiting' | 'accepted' | 'rejected' | 'expired' | 'transitioned';
export type GiftType = 'soft_flirt' | 'fire' | 'crown' | 'royal_token';

export interface Arena {
  arenaId: string;
  hostId: string;
  status: ArenaStatus;
  title?: string;
  category?: string;
  viewerCount: number;
  totalEarnings: number;
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;
}

export interface Viewer {
  viewerId: string;
  arenaId: string;
  userId: string;
  hostId: string;
  status: ViewerStatus;
  entryType: 'standard' | 'spotlight' | 'priority';
  hasSpotlight: boolean;
  joinedAt: Date;
  lastActivityAt: Date;
}

export interface Gift {
  giftId: string;
  arenaId: string;
  senderId: string;
  recipientId: string;
  giftType: GiftType;
  cost: number;
  hostEarning: number;
  avaloEarning: number;
  createdAt: Date;
}

export interface QueueEntry {
  queueId: string;
  arenaId: string;
  viewerId: string;
  hostId: string;
  priority: number;
  status: QueueStatus;
  giftsGiven: GiftType[];
  position?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  messageId: string;
  arenaId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  message: string;
  isPriority: boolean;
  createdAt: Date;
}

export interface ArenaAnalytics {
  arenaId: string;
  totalViewers: number;
  totalGifts: number;
  totalRevenue: number;
  giftBreakdown: Record<GiftType, number>;
  queueRequests: number;
  transitions: number;
}

// Gift configuration
export const GIFT_CONFIG = {
  soft_flirt: { cost: 10, label: 'Soft Flirt', emoji: '😊', message: 'cute / playful' },
  fire: { cost: 25, label: 'Fire', emoji: '🔥', message: 'high attraction' },
  crown: { cost: 50, label: 'Crown', emoji: '👑', message: 'signal of request for 1:1 chat' },
  royal_token: { cost: 120, label: 'Royal Token', emoji: '💎', message: 'instantly pushes you first in the queue' },
};

export const SPOTLIGHT_COST = 15;
export const PRIORITY_MESSAGE_COST = 25;

// ============================================================================
// ARENA DISCOVERY & MANAGEMENT
// ============================================================================

/**
 * Get list of live arenas
 */
export async function getLiveArenas(options: {
  limit?: number;
  sortBy?: 'viewerCount' | 'startedAt';
} = {}): Promise<Arena[]> {
  try {
    const arenasRef = collection(db, 'live_arenas');
    const q = query(
      arenasRef,
      where('status', '==', 'live'),
      orderBy(options.sortBy || 'viewerCount', 'desc'),
      firestoreLimit(options.limit || 20)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      arenaId: doc.id,
      ...doc.data(),
      startedAt: doc.data().startedAt?.toDate(),
      endedAt: doc.data().endedAt?.toDate(),
      createdAt: doc.data().createdAt.toDate(),
      updatedAt: doc.data().updatedAt.toDate(),
      lastActivityAt: doc.data().lastActivityAt.toDate(),
    })) as Arena[];
  } catch (error) {
    console.error('Error getting live arenas:', error);
    return [];
  }
}

/**
 * Subscribe to live arenas list
 */
export function subscribeLiveArenas(
  callback: (arenas: Arena[]) => void,
  options: { limit?: number } = {}
): () => void {
  const arenasRef = collection(db, 'live_arenas');
  const q = query(
    arenasRef,
    where('status', '==', 'live'),
    orderBy('viewerCount', 'desc'),
    firestoreLimit(options.limit || 20)
  );
  
  return onSnapshot(q, (snapshot) => {
    const arenas = snapshot.docs.map(doc => ({
      arenaId: doc.id,
      ...doc.data(),
      startedAt: doc.data().startedAt?.toDate(),
      endedAt: doc.data().endedAt?.toDate(),
      createdAt: doc.data().createdAt.toDate(),
      updatedAt: doc.data().updatedAt.toDate(),
      lastActivityAt: doc.data().lastActivityAt.toDate(),
    })) as Arena[];
    callback(arenas);
  });
}

/**
 * Get arena details
 */
export async function getArena(arenaId: string): Promise<Arena | null> {
  try {
    const arenaRef = doc(db, 'live_arenas', arenaId);
    const snapshot = await getDoc(arenaRef);
    
    if (!snapshot.exists()) {
      return null;
    }
    
    return {
      arenaId: snapshot.id,
      ...snapshot.data(),
      startedAt: snapshot.data().startedAt?.toDate(),
      endedAt: snapshot.data().endedAt?.toDate(),
      createdAt: snapshot.data().createdAt.toDate(),
      updatedAt: snapshot.data().updatedAt.toDate(),
      lastActivityAt: snapshot.data().lastActivityAt.toDate(),
    } as Arena;
  } catch (error) {
    console.error('Error getting arena:', error);
    return null;
  }
}

/**
 * Subscribe to arena updates
 */
export function subscribeArena(
  arenaId: string,
  callback: (arena: Arena | null) => void
): () => void {
  const arenaRef = doc(db, 'live_arenas', arenaId);
  
  return onSnapshot(arenaRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    
    callback({
      arenaId: snapshot.id,
      ...snapshot.data(),
      startedAt: snapshot.data().startedAt?.toDate(),
      endedAt: snapshot.data().endedAt?.toDate(),
      createdAt: snapshot.data().createdAt.toDate(),
      updatedAt: snapshot.data().updatedAt.toDate(),
      lastActivityAt: snapshot.data().lastActivityAt.toDate(),
    } as Arena);
  });
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
  try {
    // Check if already in arena
    const viewersRef = collection(db, 'arena_viewers');
    const q = query(
      viewersRef,
      where('arenaId', '==', arenaId),
      where('userId', '==', userId),
      where('status', '==', 'active'),
      firestoreLimit(1)
    );
    
    const existing = await getDocs(q);
    if (!existing.empty) {
      return { success: true, viewerId: existing.docs[0].id };
    }
    
    // Create viewer entry (backend will handle payment validation)
    const viewerRef = await addDoc(viewersRef, {
      arenaId,
      userId,
      status: 'active',
      entryType,
      hasSpotlight: entryType === 'spotlight',
      joinedAt: Timestamp.now(),
      lastActivityAt: Timestamp.now(),
    });
    
    return { success: true, viewerId: viewerRef.id };
  } catch (error: any) {
    console.error('Error joining arena:', error);
    return { success: false, error: error.message || 'Failed to join arena' };
  }
}

/**
 * Leave arena
 */
export async function leaveArena(arenaId: string, userId: string): Promise<void> {
  try {
    const viewersRef = collection(db, 'arena_viewers');
    const q = query(
      viewersRef,
      where('arenaId', '==', arenaId),
      where('userId', '==', userId),
      where('status', '==', 'active'),
      firestoreLimit(1)
    );
    
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      await deleteDoc(snapshot.docs[0].ref);
    }
  } catch (error) {
    console.error('Error leaving arena:', error);
    throw error;
  }
}

/**
 * Subscribe to arena viewers
 */
export function subscribeViewers(
  arenaId: string,
  callback: (viewers: Viewer[]) => void
): () => void {
  const viewersRef = collection(db, 'arena_viewers');
  const q = query(
    viewersRef,
    where('arenaId', '==', arenaId),
    where('status', '==', 'active'),
    orderBy('joinedAt', 'asc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const viewers = snapshot.docs.map(doc => ({
      viewerId: doc.id,
      ...doc.data(),
      joinedAt: doc.data().joinedAt.toDate(),
      lastActivityAt: doc.data().lastActivityAt.toDate(),
    })) as Viewer[];
    callback(viewers);
  });
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
): Promise<{ success: boolean; giftId?: string; error?: string }> {
  try {
    const config = GIFT_CONFIG[giftType];
    if (!config) {
      return { success: false, error: 'Invalid gift type' };
    }
    
    // Backend function will handle payment and revenue split
    // This just creates the gift request
    const giftsRef = collection(db, 'arena_gifts');
    const giftRef = await addDoc(giftsRef, {
      arenaId,
      senderId,
      giftType,
      cost: config.cost,
      createdAt: Timestamp.now(),
    });
    
    return { success: true, giftId: giftRef.id };
  } catch (error: any) {
    console.error('Error sending gift:', error);
    return { success: false, error: error.message || 'Failed to send gift' };
  }
}

/**
 * Subscribe to arena gifts
 */
export function subscribeGifts(
  arenaId: string,
  callback: (gifts: Gift[]) => void,
  limitCount: number = 50
): () => void {
  const giftsRef = collection(db, 'arena_gifts');
  const q = query(
    giftsRef,
    where('arenaId', '==', arenaId),
    orderBy('createdAt', 'desc'),
    firestoreLimit(limitCount)
  );
  
  return onSnapshot(q, (snapshot) => {
    const gifts = snapshot.docs.map(doc => ({
      giftId: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt.toDate(),
    })) as Gift[];
    callback(gifts);
  });
}

// ============================================================================
// QUEUE SYSTEM
// ============================================================================

/**
 * Enter queue for 1:1 chat
 */
export async function enterQueue(
  arenaId: string,
  viewerId: string
): Promise<{ success: boolean; queueId?: string; position?: number; error?: string }> {
  try {
    // Backend will calculate priority based on gifts given
    const queueRef = collection(db, 'arena_queue');
    const entry = await addDoc(queueRef, {
      arenaId,
      viewerId,
      status: 'waiting',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    // Get position
    const q = query(
      queueRef,
      where('arenaId', '==', arenaId),
      where('status', '==', 'waiting'),
      orderBy('priority', 'desc'),
      orderBy('createdAt', 'asc')
    );
    
    const snapshot = await getDocs(q);
    let position = 1;
    for (const doc of snapshot.docs) {
      if (doc.id === entry.id) break;
      position++;
    }
    
    return { success: true, queueId: entry.id, position };
  } catch (error: any) {
    console.error('Error entering queue:', error);
    return { success: false, error: error.message || 'Failed to enter queue' };
  }
}

/**
 * Leave queue
 */
export async function leaveQueue(queueId: string): Promise<void> {
  try {
    const queueRef = doc(db, 'arena_queue', queueId);
    await deleteDoc(queueRef);
  } catch (error) {
    console.error('Error leaving queue:', error);
    throw error;
  }
}

/**
 * Subscribe to arena queue
 */
export function subscribeQueue(
  arenaId: string,
  callback: (queue: QueueEntry[]) => void
): () => void {
  const queueRef = collection(db, 'arena_queue');
  const q = query(
    queueRef,
    where('arenaId', '==', arenaId),
    where('status', '==', 'waiting'),
    orderBy('priority', 'desc'),
    orderBy('createdAt', 'asc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const queue = snapshot.docs.map((doc, index) => ({
      queueId: doc.id,
      ...doc.data(),
      position: index + 1,
      createdAt: doc.data().createdAt.toDate(),
      updatedAt: doc.data().updatedAt.toDate(),
    })) as QueueEntry[];
    callback(queue);
  });
}

/**
 * Accept queue request (host action)
 */
export async function acceptQueueRequest(
  queueId: string,
  hostId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const queueRef = doc(db, 'arena_queue', queueId);
    await updateDoc(queueRef, {
      status: 'accepted',
      acceptedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    return { success: true };
  } catch (error: any) {
    console.error('Error accepting queue request:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Reject queue request (host action)
 */
export async function rejectQueueRequest(
  queueId: string,
  hostId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const queueRef = doc(db, 'arena_queue', queueId);
    await updateDoc(queueRef, {
      status: 'rejected',
      rejectedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    return { success: true };
  } catch (error: any) {
    console.error('Error rejecting queue request:', error);
    return { success: false, error: error.message };
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
  try {
    const spotlightRef = collection(db, 'arena_spotlight');
    const spotlight = await addDoc(spotlightRef, {
      arenaId,
      userId,
      cost: SPOTLIGHT_COST,
      durationMinutes: 3,
      active: true,
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 3 * 60 * 1000)),
      createdAt: Timestamp.now(),
    });
    
    const expiresAt = new Date(Date.now() + 3 * 60 * 1000);
    return { success: true, spotlightId: spotlight.id, expiresAt };
  } catch (error: any) {
    console.error('Error purchasing spotlight:', error);
    return { success: false, error: error.message || 'Failed to purchase spotlight' };
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
  try {
    if (!message || message.length > 200) {
      return { success: false, error: 'Message must be 1-200 characters' };
    }
    
    const messagesRef = collection(db, 'arena_priority_messages');
    const msgDoc = await addDoc(messagesRef, {
      arenaId,
      senderId,
      message,
      cost: PRIORITY_MESSAGE_COST,
      durationMinutes: 1,
      active: true,
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 1 * 60 * 1000)),
      createdAt: Timestamp.now(),
    });
    
    const expiresAt = new Date(Date.now() + 1 * 60 * 1000);
    return { success: true, messageId: msgDoc.id, expiresAt };
  } catch (error: any) {
    console.error('Error sending priority message:', error);
    return { success: false, error: error.message || 'Failed to send priority message' };
  }
}

/**
 * Subscribe to priority messages
 */
export function subscribePriorityMessages(
  arenaId: string,
  callback: (messages: any[]) => void
): () => void {
  const messagesRef = collection(db, 'arena_priority_messages');
  const q = query(
    messagesRef,
    where('arenaId', '==', arenaId),
    where('active', '==', true),
    orderBy('createdAt', 'desc'),
    firestoreLimit(5)
  );
  
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => ({
      messageId: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt.toDate(),
      expiresAt: doc.data().expiresAt.toDate(),
    }));
    callback(messages);
  });
}

// ============================================================================
// CHAT SYSTEM
// ============================================================================

/**
 * Send chat message
 */
export async function sendChatMessage(
  arenaId: string,
  senderId: string,
  senderName: string,
  message: string,
  senderAvatar?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    if (!message || message.length > 500) {
      return { success: false, error: 'Message must be 1-500 characters' };
    }
    
    const chatRef = collection(db, 'arena_chat');
    const msgDoc = await addDoc(chatRef, {
      arenaId,
      senderId,
      senderName,
      senderAvatar,
      message,
      isPriority: false,
      createdAt: Timestamp.now(),
    });
    
    return { success: true, messageId: msgDoc.id };
  } catch (error: any) {
    console.error('Error sending chat message:', error);
    return { success: false, error: error.message || 'Failed to send message' };
  }
}

/**
 * Subscribe to arena chat
 */
export function subscribeChat(
  arenaId: string,
  callback: (messages: ChatMessage[]) => void,
  limitCount: number = 100
): () => void {
  const chatRef = collection(db, 'arena_chat');
  const q = query(
    chatRef,
    where('arenaId', '==', arenaId),
    orderBy('createdAt', 'desc'),
    firestoreLimit(limitCount)
  );
  
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs
      .map(doc => ({
        messageId: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt.toDate(),
      }))
      .reverse() as ChatMessage[];
    callback(messages);
  });
}

// ============================================================================
// HOST CONTROLS
// ============================================================================

/**
 * Mute viewer
 */
export async function muteViewer(
  arenaId: string,
  hostId: string,
  targetId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const moderationRef = collection(db, 'arena_moderation');
    await addDoc(moderationRef, {
      arenaId,
      hostId,
      targetId,
      actionType: 'mute',
      createdAt: Timestamp.now(),
    });
    
    return { success: true };
  } catch (error: any) {
    console.error('Error muting viewer:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Remove viewer from arena
 */
export async function removeViewer(
  arenaId: string,
  hostId: string,
  targetId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const moderationRef = collection(db, 'arena_moderation');
    await addDoc(moderationRef, {
      arenaId,
      hostId,
      targetId,
      actionType: 'remove',
      createdAt: Timestamp.now(),
    });
    
    return { success: true };
  } catch (error: any) {
    console.error('Error removing viewer:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Block viewer from arena
 */
export async function blockViewer(
  arenaId: string,
  hostId: string,
  targetId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const moderationRef = collection(db, 'arena_moderation');
    await addDoc(moderationRef, {
      arenaId,
      hostId,
      targetId,
      actionType: 'block',
      createdAt: Timestamp.now(),
    });
    
    return { success: true };
  } catch (error: any) {
    console.error('Error blocking viewer:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Get arena analytics
 */
export async function getArenaAnalytics(arenaId: string): Promise<ArenaAnalytics | null> {
  try {
    const analyticsRef = doc(db, 'arena_analytics', arenaId);
    const snapshot = await getDoc(analyticsRef);
    
    if (!snapshot.exists()) {
      return null;
    }
    
    return {
      arenaId: snapshot.id,
      ...snapshot.data(),
    } as ArenaAnalytics;
  } catch (error) {
    console.error('Error getting analytics:', error);
    return null;
  }
}

/**
 * Subscribe to arena analytics
 */
export function subscribeAnalytics(
  arenaId: string,
  callback: (analytics: ArenaAnalytics | null) => void
): () => void {
  const analyticsRef = doc(db, 'arena_analytics', arenaId);
  
  return onSnapshot(analyticsRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    
    callback({
      arenaId: snapshot.id,
      ...snapshot.data(),
    } as ArenaAnalytics);
  });
}

export default {
  // Discovery
  getLiveArenas,
  subscribeLiveArenas,
  getArena,
  subscribeArena,
  
  // Viewer
  joinArena,
  leaveArena,
  subscribeViewers,
  
  // Gifts
  sendGift,
  subscribeGifts,
  GIFT_CONFIG,
  
  // Queue
  enterQueue,
  leaveQueue,
  subscribeQueue,
  acceptQueueRequest,
  rejectQueueRequest,
  
  // Spotlight & Priority
  purchaseSpotlight,
  sendPriorityMessage,
  subscribePriorityMessages,
  SPOTLIGHT_COST,
  PRIORITY_MESSAGE_COST,
  
  // Chat
  sendChatMessage,
  subscribeChat,
  
  // Moderation
  muteViewer,
  removeViewer,
  blockViewer,
  
  // Analytics
  getArenaAnalytics,
  subscribeAnalytics,
};