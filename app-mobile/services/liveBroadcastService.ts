/**
 * PACK 260: Live Broadcast Service
 * Mobile service layer for Fan-Only + Pay-Per-View + Gifting
 */

import { httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  updateDoc,
  serverTimestamp,
  addDoc,
} from 'firebase/firestore';
import { functions, db } from '../lib/firebase';
import {
  LiveStreamSession,
  LiveStreamTicket,
  LiveStreamGift,
  LiveStreamChatMessage,
  LiveStreamSpotlight,
  LiveStreamAnalytics,
  CreateStreamRequest,
  CreateStreamResponse,
  PurchaseTicketRequest,
  PurchaseTicketResponse,
  SendGiftRequest,
  SendGiftResponse,
  TrackWatchTimeRequest,
  ReportSafetyRequest,
  ReportSafetyResponse,
  GetAnalyticsResponse,
  LiveStreamMode,
  GiftCatalogItem,
  GIFT_CATALOG,
  SafetyWarningType,
} from '../types/liveBroadcasts';

// =====================================================================
// LIVE STREAM MANAGEMENT
// =====================================================================

/**
 * Create a new live stream
 */
export async function createLiveStream(
  request: CreateStreamRequest
): Promise<CreateStreamResponse> {
  const createStream = httpsCallable<CreateStreamRequest, CreateStreamResponse>(
    functions,
    'createLiveStream'
  );
  
  const result = await createStream(request);
  return result.data;
}

/**
 * Start a scheduled live stream
 */
export async function startLiveStream(streamId: string): Promise<{ success: boolean }> {
  const startStream = httpsCallable(functions, 'startLiveStream');
  const result = await startStream({ streamId });
  return result.data as { success: boolean };
}

/**
 * End a live stream
 */
export async function endLiveStream(streamId: string): Promise<{
  success: boolean;
  durationMinutes: number;
  totalRevenue: number;
}> {
  const endStream = httpsCallable(functions, 'endLiveStream');
  const result = await endStream({ streamId });
  return result.data as any;
}

/**
 * Get live stream by ID
 */
export async function getLiveStream(streamId: string): Promise<LiveStreamSession | null> {
  const streamDoc = await getDoc(doc(db, 'liveStreamSessions', streamId));
  
  if (!streamDoc.exists()) {
    return null;
  }
  
  return streamDoc.data() as LiveStreamSession;
}

/**
 * Get live streams by creator
 */
export async function getCreatorLiveStreams(
  creatorId: string,
  limitCount: number = 20
): Promise<LiveStreamSession[]> {
  const q = query(
    collection(db, 'liveStreamSessions'),
    where('creatorId', '==', creatorId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => doc.data() as LiveStreamSession);
}

/**
 * Get currently live streams
 */
export async function getCurrentlyLiveStreams(
  limitCount: number = 50
): Promise<LiveStreamSession[]> {
  const q = query(
    collection(db, 'liveStreamSessions'),
    where('status', '==', 'live'),
    orderBy('viewerCount', 'desc'),
    limit(limitCount)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => doc.data() as LiveStreamSession);
}

/**
 * Subscribe to live stream updates
 */
export function subscribeLiveStream(
  streamId: string,
  callback: (stream: LiveStreamSession | null) => void
): () => void {
  const streamRef = doc(db, 'liveStreamSessions', streamId);
  
  return onSnapshot(streamRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data() as LiveStreamSession);
    } else {
      callback(null);
    }
  });
}

// =====================================================================
// PPV TICKET MANAGEMENT
// =====================================================================

/**
 * Purchase a PPV ticket
 */
export async function purchasePPVTicket(
  streamId: string
): Promise<PurchaseTicketResponse> {
  const purchaseTicket = httpsCallable<PurchaseTicketRequest, PurchaseTicketResponse>(
    functions,
    'purchasePPVTicket'
  );
  
  const result = await purchaseTicket({ streamId });
  return result.data;
}

/**
 * Check if user has ticket for stream
 */
export async function hasTicketForStream(
  userId: string,
  streamId: string
): Promise<boolean> {
  const q = query(
    collection(db, 'liveStreamTickets'),
    where('userId', '==', userId),
    where('streamId', '==', streamId),
    where('status', '==', 'active'),
    limit(1)
  );
  
  const snapshot = await getDocs(q);
  return !snapshot.empty;
}

/**
 * Get user's tickets
 */
export async function getUserTickets(userId: string): Promise<LiveStreamTicket[]> {
  const q = query(
    collection(db, 'liveStreamTickets'),
    where('userId', '==', userId),
    where('status', '==', 'active'),
    orderBy('purchasedAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => doc.data() as LiveStreamTicket);
}

// =====================================================================
// GIFTING SYSTEM
// =====================================================================

/**
 * Send a gift during live stream
 */
export async function sendGift(
  streamId: string,
  giftId: string
): Promise<SendGiftResponse> {
  const sendGiftFunc = httpsCallable<SendGiftRequest, SendGiftResponse>(
    functions,
    'sendLiveStreamGift'
  );
  
  const result = await sendGiftFunc({ streamId, giftId });
  return result.data;
}

/**
 * Get gift catalog
 */
export function getGiftCatalog(): GiftCatalogItem[] {
  return [...GIFT_CATALOG.standard, ...GIFT_CATALOG.premium, ...GIFT_CATALOG.seasonal];
}

/**
 * Get gifts by type
 */
export function getGiftsByType(type: 'standard' | 'premium' | 'seasonal'): GiftCatalogItem[] {
  return GIFT_CATALOG[type];
}

/**
 * Get stream gifts
 */
export async function getStreamGifts(
  streamId: string,
  limitCount: number = 100
): Promise<LiveStreamGift[]> {
  const q = query(
    collection(db, 'liveStreamGifts'),
    where('streamId', '==', streamId),
    orderBy('sentAt', 'desc'),
    limit(limitCount)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => doc.data() as LiveStreamGift);
}

/**
 * Subscribe to stream gifts
 */
export function subscribeStreamGifts(
  streamId: string,
  callback: (gifts: LiveStreamGift[]) => void
): () => void {
  const q = query(
    collection(db, 'liveStreamGifts'),
    where('streamId', '==', streamId),
    orderBy('sentAt', 'desc'),
    limit(50)
  );
  
  return onSnapshot(q, (snapshot) => {
    const gifts = snapshot.docs.map((doc) => doc.data() as LiveStreamGift);
    callback(gifts);
  });
}

// =====================================================================
// LIVE CHAT
// =====================================================================

/**
 * Send a chat message
 */
export async function sendChatMessage(
  streamId: string,
  senderId: string,
  senderName: string,
  message: string,
  isCreator: boolean = false
): Promise<void> {
  const chatRef = collection(db, 'liveStreamChat', streamId, 'messages');
  
  await addDoc(chatRef, {
    streamId,
    senderId,
    senderName,
    message,
    isCreator,
    isCoHost: false,
    createdAt: serverTimestamp(),
  });
}

/**
 * Subscribe to chat messages
 */
export function subscribeChatMessages(
  streamId: string,
  callback: (messages: LiveStreamChatMessage[]) => void,
  limitCount: number = 100
): () => void {
  const q = query(
    collection(db, 'liveStreamChat', streamId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs
      .map((doc) => ({ messageId: doc.id, ...doc.data() } as LiveStreamChatMessage))
      .reverse(); // Show oldest first
    callback(messages);
  });
}

/**
 * Delete chat message
 */
export async function deleteChatMessage(streamId: string, messageId: string): Promise<void> {
  const messageRef = doc(db, 'liveStreamChat', streamId, 'messages', messageId);
  await updateDoc(messageRef, { deleted: true });
}

// =====================================================================
// VIEWER MANAGEMENT
// =====================================================================

/**
 * Join as viewer
 */
export async function joinAsViewer(
  streamId: string,
  userId: string,
  userName: string
): Promise<void> {
  const viewerRef = doc(db, 'liveStreamViewers', streamId, 'viewers', userId);
  
  await updateDoc(viewerRef, {
    userId,
    userName,
    streamId,
    joinedAt: serverTimestamp(),
    lastActivityAt: serverTimestamp(),
    isCoHost: false,
  }).catch(async () => {
    // Document doesn't exist, create it
    await addDoc(collection(db, 'liveStreamViewers', streamId, 'viewers'), {
      userId,
      userName,
      streamId,
      joinedAt: serverTimestamp(),
      lastActivityAt: serverTimestamp(),
      isCoHost: false,
    });
  });
  
  // Increment viewer count
  const streamRef = doc(db, 'liveStreamSessions', streamId);
  await updateDoc(streamRef, {
    viewerCount: serverTimestamp(), // Will be calculated by backend
  });
}

/**
 * Update viewer activity (heartbeat)
 */
export async function updateViewerActivity(streamId: string, userId: string): Promise<void> {
  const viewerRef = doc(db, 'liveStreamViewers', streamId, 'viewers', userId);
  
  await updateDoc(viewerRef, {
    lastActivityAt: serverTimestamp(),
  }).catch(() => {
    // Viewer not found, ignore
  });
}

/**
 * Leave as viewer
 */
export async function leaveAsViewer(streamId: string, userId: string): Promise<void> {
  const viewerRef = doc(db, 'liveStreamViewers', streamId, 'viewers', userId);
  await updateDoc(viewerRef, { left: true });
}

// =====================================================================
// SPOTLIGHT LEADERBOARD
// =====================================================================

/**
 * Get spotlight leaderboard
 */
export async function getSpotlightLeaderboard(streamId: string): Promise<LiveStreamSpotlight | null> {
  const spotlightDoc = await getDoc(doc(db, 'liveStreamSpotlight', streamId));
  
  if (!spotlightDoc.exists()) {
    return null;
  }
  
  return spotlightDoc.data() as LiveStreamSpotlight;
}

/**
 * Subscribe to spotlight leaderboard
 */
export function subscribeSpotlightLeaderboard(
  streamId: string,
  callback: (spotlight: LiveStreamSpotlight | null) => void
): () => void {
  const spotlightRef = doc(db, 'liveStreamSpotlight', streamId);
  
  return onSnapshot(spotlightRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data() as LiveStreamSpotlight);
    } else {
      callback(null);
    }
  });
}

// =====================================================================
// MILESTONES
// =====================================================================

/**
 * Get milestone progress
 */
export async function getMilestoneProgress(streamId: string): Promise<any> {
  const milestoneDoc = await getDoc(doc(db, 'liveStreamMilestones', streamId));
  
  if (!milestoneDoc.exists()) {
    return null;
  }
  
  return milestoneDoc.data();
}

/**
 * Subscribe to milestone progress
 */
export function subscribeMilestoneProgress(
  streamId: string,
  callback: (progress: any) => void
): () => void {
  const milestoneRef = doc(db, 'liveStreamMilestones', streamId);
  
  return onSnapshot(milestoneRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data());
    }
  });
}

// =====================================================================
// SAFETY & MODERATION
// =====================================================================

/**
 * Report safety violation
 */
export async function reportSafetyViolation(
  streamId: string,
  warningType: SafetyWarningType,
  description: string
): Promise<ReportSafetyResponse> {
  const reportSafety = httpsCallable<ReportSafetyRequest, ReportSafetyResponse>(
    functions,
    'reportSafetyViolation'
  );
  
  const result = await reportSafety({ streamId, warningType, description });
  return result.data;
}

// =====================================================================
// CONVERSIONS & FUNNELS
// =====================================================================

/**
 * Track watch time (for Fan Club conversion)
 */
export async function trackWatchTime(
  streamId: string,
  watchTimeMinutes: number
): Promise<void> {
  const trackWatch = httpsCallable<TrackWatchTimeRequest, { success: boolean }>(
    functions,
    'trackViewerWatchTime'
  );
  
  await trackWatch({ streamId, watchTimeMinutes });
}

/**
 * Get user conversions
 */
export async function getUserConversions(userId: string): Promise<any[]> {
  const q = query(
    collection(db, 'liveStreamConversions'),
    where('userId', '==', userId),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => doc.data());
}

// =====================================================================
// ANALYTICS
// =====================================================================

/**
 * Get creator analytics
 */
export async function getCreatorAnalytics(): Promise<GetAnalyticsResponse> {
  const getAnalytics = httpsCallable<void, GetAnalyticsResponse>(
    functions,
    'getLiveStreamAnalytics'
  );
  
  const result = await getAnalytics();
  return result.data;
}

/**
 * Get stream performance
 */
export async function getStreamPerformance(streamId: string): Promise<any> {
  const stream = await getLiveStream(streamId);
  if (!stream) return null;
  
  const gifts = await getStreamGifts(streamId);
  const conversions = await getDocs(
    query(
      collection(db, 'liveStreamConversions'),
      where('streamId', '==', streamId)
    )
  );
  
  return {
    streamId,
    mode: stream.mode,
    viewerCount: stream.peakViewerCount,
    revenue: stream.totalRevenue,
    durationMinutes: stream.actualDurationMinutes || 0,
    giftCount: gifts.length,
    conversionCount: conversions.size,
    date: stream.createdAt,
  };
}

// =====================================================================
// ACCESS CONTROL
// =====================================================================

/**
 * Check if user can access stream
 */
export async function canAccessStream(
  userId: string,
  streamId: string,
  mode: LiveStreamMode
): Promise<{ canAccess: boolean; reason?: string }> {
  switch (mode) {
    case 'open':
      return { canAccess: true };
      
    case 'ppv': {
      const hasTicket = await hasTicketForStream(userId, streamId);
      return {
        canAccess: hasTicket,
        reason: hasTicket ? undefined : 'Purchase a ticket to watch this stream',
      };
    }
      
    case 'fan_only': {
      // Check Fan Club membership
      const stream = await getLiveStream(streamId);
      if (!stream) {
        return { canAccess: false, reason: 'Stream not found' };
      }
      
      const membershipDoc = await getDoc(
        doc(db, 'fanClubMemberships', `${stream.creatorId}_${userId}`)
      );
      
      if (!membershipDoc.exists()) {
        return {
          canAccess: false,
          reason: 'Join Fan Club to watch this stream',
        };
      }
      
      const membership = membershipDoc.data();
      const isActive = membership.status === 'active';
      const hasGoldOrHigher = ['gold', 'diamond', 'royal_elite'].includes(membership.tier);
      
      if (!isActive) {
        return {
          canAccess: false,
          reason: 'Your Fan Club membership has expired',
        };
      }
      
      if (!hasGoldOrHigher) {
        return {
          canAccess: false,
          reason: 'Upgrade to Gold or higher to watch fan-only streams',
        };
      }
      
      return { canAccess: true };
    }
      
    default:
      return { canAccess: false, reason: 'Invalid stream mode' };
  }
}

/**
 * Check if user can create streams
 */
export async function canCreateStreams(userId: string): Promise<boolean> {
  const userDoc = await getDoc(doc(db, 'users', userId));
  if (!userDoc.exists()) return false;
  
  const userData = userDoc.data();
  return userData.earnOnChat === true;
}

// =====================================================================
// UTILITY FUNCTIONS
// =====================================================================

/**
 * Format timestamp to readable date/time
 */
export function formatTimestamp(timestamp: Timestamp): string {
  const date = timestamp.toDate();
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

/**
 * Calculate time remaining until scheduled start
 */
export function getTimeUntilStart(scheduledStartAt: Timestamp): number {
  const now = Date.now();
  const start = scheduledStartAt.toMillis();
  return Math.max(0, start - now);
}

/**
 * Check if user has sufficient balance for gift
 */
export function canAffordGift(userBalance: number, giftTokens: number): boolean {
  return userBalance >= giftTokens;
}

/**
 * Get affordable gifts for user
 */
export function getAffordableGifts(userBalance: number): GiftCatalogItem[] {
  return getGiftCatalog().filter((gift) => gift.tokens <= userBalance);
}

/**
 * Calculate viewer activity timeout
 */
export function isViewerActive(lastActivityAt: Timestamp): boolean {
  const now = Date.now();
  const lastActivity = lastActivityAt.toMillis();
  const diff = now - lastActivity;
  return diff < 30000; // 30 seconds
}