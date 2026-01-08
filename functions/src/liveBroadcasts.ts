/**
 * PACK 260: Live Broadcasts (Fan-Only + Pay-Per-View + Gifting)
 * High-ARPU Creator Monetization Module
 * 
 * THREE LIVE MODES:
 * 1. Fan-Only Live: Gold+ Fan Club members only (access included)
 * 2. Pay-Per-View Live: Anyone with ticket (100-1000 tokens)
 * 3. Open Live: Free entry + optional tipping
 * 
 * MONETIZATION:
 * - PPV Tickets: 65% creator / 35% Avalo (non-refundable)
 * - Gifts: 65% creator / 35% Avalo (all modes)
 * - Milestone Unlocks: Extra time, Q&A, topic choice
 * 
 * SAFETY:
 * - Flirting, attractive content: ALLOWED
 * - Exposed sexual acts: BLOCKED (AI blur + warnings)
 * - 3 warnings → auto-end stream
 * 
 * CONVERSIONS:
 * - Fan Club conversion (5 min preview)
 * - PPV conversion (gifting in free live)
 * - 1-on-1 conversion (high-value gifts)
 * - Event ticket conversion (announcements)
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

const db = getFirestore();

// =====================================================================
// CONSTANTS & CONFIGURATION
// =====================================================================

const LIVE_CONFIG = {
  // Ticket prices (PPV mode)
  PPV_TICKET_PRICES: [100, 250, 500, 750, 1000],
  
  // Revenue split
  CREATOR_CUT_PERCENT: 65,
  AVALO_CUT_PERCENT: 35,
  
  // Safety thresholds
  MAX_WARNINGS_BEFORE_AUTO_END: 3,
  VIEWER_INACTIVITY_TIMEOUT_SECONDS: 30,
  
  // Milestone thresholds (tokens)
  MILESTONE_THRESHOLDS: {
    EXTRA_5_MIN: 1000,
    GROUP_QA: 2000,
    CHOOSE_TOPIC: 3000,
  },
  
  // Conversion triggers
  FAN_CLUB_PREVIEW_MINUTES: 5,
  HIGH_VALUE_GIFT_THRESHOLD: 500, // For 1-on-1 conversion
};

// Gift catalog with token values
const GIFT_CATALOG = {
  standard: [
    { id: 'rose', name: '🌹 Rose', tokens: 10 },
    { id: 'heart', name: '❤️ Heart', tokens: 20 },
    { id: 'kiss', name: '💋 Kiss', tokens: 30 },
    { id: 'fire', name: '🔥 Fire', tokens: 50 },
    { id: 'diamond', name: '💎 Diamond', tokens: 100 },
  ],
  premium: [
    { id: 'champagne', name: '🍾 Champagne', tokens: 200 },
    { id: 'ring', name: '💍 Ring', tokens: 300 },
    { id: 'crown', name: '👑 Crown', tokens: 500 },
    { id: 'rocket', name: '🚀 Rocket', tokens: 750 },
    { id: 'unicorn', name: '🦄 Unicorn', tokens: 1000 },
  ],
  seasonal: [
    { id: 'seasonal_1', name: '🎄 Holiday Special', tokens: 250 },
    { id: 'seasonal_2', name: '🎃 Seasonal Gift', tokens: 350 },
  ],
};

// =====================================================================
// TYPES & INTERFACES
// =====================================================================

type LiveStreamMode = 'fan_only' | 'ppv' | 'open';
type LiveStreamStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';
type GiftType = 'standard' | 'premium' | 'seasonal';
type SafetyWarningType = 'explicit_content' | 'inappropriate_behavior' | 'policy_violation';
type ConversionType = 'fan_club' | 'ppv_ticket' | 'one_on_one' | 'event_ticket';

interface LiveStreamSession {
  streamId: string;
  creatorId: string;
  mode: LiveStreamMode;
  status: LiveStreamStatus;
  title: string;
  description?: string;
  scheduledStartAt?: Timestamp;
  startedAt?: Timestamp;
  endedAt?: Timestamp;
  plannedDurationMinutes: number;
  actualDurationMinutes?: number;
  ticketPrice?: number; // For PPV mode
  viewerCount: number;
  peakViewerCount: number;
  totalGiftTokens: number;
  totalRevenue: number;
  warningCount: number;
  milestones: {
    extra5MinUnlocked: boolean;
    groupQAUnlocked: boolean;
    chooseTopicUnlocked: boolean;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface LiveStreamTicket {
  ticketId: string;
  streamId: string;
  userId: string;
  creatorId: string;
  ticketPrice: number;
  status: 'pending_payment' | 'active' | 'used' | 'expired';
  purchasedAt?: Timestamp;
  expiresAt?: Timestamp;
}

interface LiveStreamGift {
  giftId: string;
  streamId: string;
  senderId: string;
  senderName: string;
  creatorId: string;
  giftType: GiftType;
  giftName: string;
  tokenValue: number;
  status: 'pending' | 'completed';
  sentAt: Timestamp;
  processedAt?: Timestamp;
}

// =====================================================================
// LIVE STREAM MANAGEMENT
// =====================================================================

/**
 * Create a new live stream session
 * Creators with earnOn can create streams in 3 modes
 */
export const createLiveStream = onCall(async (request) => {
  const { auth, data } = request;
  
  if (!auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const creatorId = auth.uid;
  const { mode, title, description, scheduledStartAt, plannedDurationMinutes, ticketPrice } = data;
  
  // Validate mode
  if (!['fan_only', 'ppv', 'open'].includes(mode)) {
    throw new HttpsError('invalid-argument', 'Invalid live stream mode');
  }
  
  // Check creator has earnOn
  const creatorDoc = await db.collection('users').doc(creatorId).get();
  if (!creatorDoc.exists || !creatorDoc.data()?.earnOnChat) {
    throw new HttpsError('permission-denied', 'Must have Earn ON to create live streams');
  }
  
  // Validate PPV ticket price
  if (mode === 'ppv') {
    if (!ticketPrice || !LIVE_CONFIG.PPV_TICKET_PRICES.includes(ticketPrice)) {
      throw new HttpsError(
        'invalid-argument',
        `Ticket price must be one of: ${LIVE_CONFIG.PPV_TICKET_PRICES.join(', ')}`
      );
    }
  }
  
  // Validate Fan Club exists for fan_only mode
  if (mode === 'fan_only') {
    const fanClubDoc = await db.collection('fanClubSettings').doc(creatorId).get();
    if (!fanClubDoc.exists || !fanClubDoc.data()?.enabled) {
      throw new HttpsError('failed-precondition', 'Must have active Fan Club for fan-only streams');
    }
  }
  
  // Create stream session
  const streamRef = db.collection('liveStreamSessions').doc();
  const streamId = streamRef.id;
  
  const streamData: Partial<LiveStreamSession> = {
    streamId,
    creatorId,
    mode,
    status: scheduledStartAt ? 'scheduled' : 'live',
    title,
    description,
    scheduledStartAt: scheduledStartAt ? Timestamp.fromDate(new Date(scheduledStartAt)) : undefined,
    startedAt: scheduledStartAt ? undefined : Timestamp.now(),
    plannedDurationMinutes: plannedDurationMinutes || 60,
    ticketPrice: mode === 'ppv' ? ticketPrice : undefined,
    viewerCount: 0,
    peakViewerCount: 0,
    totalGiftTokens: 0,
    totalRevenue: 0,
    warningCount: 0,
    milestones: {
      extra5MinUnlocked: false,
      groupQAUnlocked: false,
      chooseTopicUnlocked: false,
    },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  
  await streamRef.set(streamData);
  
  // Initialize milestone tracker
  await db.collection('liveStreamMilestones').doc(streamId).set({
    streamId,
    creatorId,
    currentGiftTotal: 0,
    milestones: {
      extra5Min: { threshold: LIVE_CONFIG.MILESTONE_THRESHOLDS.EXTRA_5_MIN, unlocked: false },
      groupQA: { threshold: LIVE_CONFIG.MILESTONE_THRESHOLDS.GROUP_QA, unlocked: false },
      chooseTopic: { threshold: LIVE_CONFIG.MILESTONE_THRESHOLDS.CHOOSE_TOPIC, unlocked: false },
    },
    createdAt: Timestamp.now(),
  });
  
  // Initialize spotlight leaderboard
  await db.collection('liveStreamSpotlight').doc(streamId).set({
    streamId,
    topGifters: [],
    lastUpdated: Timestamp.now(),
  });
  
  logger.info(`Live stream created: ${streamId} by ${creatorId} (mode: ${mode})`);
  
  return {
    success: true,
    streamId,
    mode,
    status: streamData.status,
  };
});

/**
 * Start a scheduled live stream
 */
export const startLiveStream = onCall(async (request) => {
  const { auth, data } = request;
  
  if (!auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { streamId } = data;
  const streamRef = db.collection('liveStreamSessions').doc(streamId);
  const streamDoc = await streamRef.get();
  
  if (!streamDoc.exists) {
    throw new HttpsError('not-found', 'Stream not found');
  }
  
  const streamData = streamDoc.data();
  
  if (streamData?.creatorId !== auth.uid) {
    throw new HttpsError('permission-denied', 'Not the stream creator');
  }
  
  if (streamData?.status !== 'scheduled') {
    throw new HttpsError('failed-precondition', 'Stream must be in scheduled status');
  }
  
  await streamRef.update({
    status: 'live',
    startedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  
  logger.info(`Live stream started: ${streamId}`);
  
  return { success: true, startedAt: Timestamp.now() };
});

/**
 * End a live stream
 */
export const endLiveStream = onCall(async (request) => {
  const { auth, data } = request;
  
  if (!auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { streamId } = data;
  const streamRef = db.collection('liveStreamSessions').doc(streamId);
  const streamDoc = await streamRef.get();
  
  if (!streamDoc.exists) {
    throw new HttpsError('not-found', 'Stream not found');
  }
  
  const streamData = streamDoc.data();
  
  if (streamData?.creatorId !== auth.uid) {
    throw new HttpsError('permission-denied', 'Not the stream creator');
  }
  
  if (streamData?.status !== 'live') {
    throw new HttpsError('failed-precondition', 'Stream must be live');
  }
  
  // Calculate actual duration
  const startedAt = streamData.startedAt;
  const endedAt = Timestamp.now();
  const durationMinutes = Math.round((endedAt.seconds - startedAt.seconds) / 60);
  
  await streamRef.update({
    status: 'ended',
    endedAt,
    actualDurationMinutes: durationMinutes,
    updatedAt: Timestamp.now(),
  });
  
  // Update creator analytics
  await updateCreatorAnalytics(streamData.creatorId, streamId);
  
  logger.info(`Live stream ended: ${streamId} (duration: ${durationMinutes} min)`);
  
  return { 
    success: true, 
    endedAt,
    durationMinutes,
    totalRevenue: streamData.totalRevenue || 0,
  };
});

// =====================================================================
// PPV TICKET SYSTEM
// =====================================================================

/**
 * Purchase a PPV ticket
 */
export const purchasePPVTicket = onCall(async (request) => {
  const { auth, data } = request;
  
  if (!auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = auth.uid;
  const { streamId } = data;
  
  // Get stream data
  const streamDoc = await db.collection('liveStreamSessions').doc(streamId).get();
  if (!streamDoc.exists) {
    throw new HttpsError('not-found', 'Stream not found');
  }
  
  const streamData = streamDoc.data();
  
  if (streamData?.mode !== 'ppv') {
    throw new HttpsError('invalid-argument', 'Stream is not pay-per-view');
  }
  
  if (!streamData?.ticketPrice) {
    throw new HttpsError('internal', 'Ticket price not configured');
  }
  
  const ticketPrice = streamData.ticketPrice;
  
  // Check if user already has ticket
  const existingTicketQuery = await db.collection('liveStreamTickets')
    .where('streamId', '==', streamId)
    .where('userId', '==', userId)
    .where('status', '==', 'active')
    .limit(1)
    .get();
  
  if (!existingTicketQuery.empty) {
    throw new HttpsError('already-exists', 'You already have a ticket for this stream');
  }
  
  // Check user balance
  const userDoc = await db.collection('users').doc(userId).get();
  const userBalance = userDoc.data()?.tokenBalance || 0;
  
  if (userBalance < ticketPrice) {
    throw new HttpsError(
      'failed-precondition',
      `Insufficient balance. Need ${ticketPrice} tokens, have ${userBalance}.`
    );
  }
  
  // Process payment (atomic transaction)
  await db.runTransaction(async (transaction) => {
    const userRef = db.collection('users').doc(userId);
    const creatorRef = db.collection('users').doc(streamData.creatorId);
    const streamRef = db.collection('liveStreamSessions').doc(streamId);
    
    // Deduct from user
    transaction.update(userRef, {
      tokenBalance: FieldValue.increment(-ticketPrice),
    });
    
    // Calculate split
    const creatorAmount = Math.floor(ticketPrice * (LIVE_CONFIG.CREATOR_CUT_PERCENT / 100));
    const avaloAmount = ticketPrice - creatorAmount;
    
    // Credit creator (immediate, non-refundable)
    transaction.update(creatorRef, {
      tokenBalance: FieldValue.increment(creatorAmount),
    });
    
    // Update stream revenue
    transaction.update(streamRef, {
      totalRevenue: FieldValue.increment(ticketPrice),
    });
    
    // Create ticket
    const ticketRef = db.collection('liveStreamTickets').doc();
    transaction.set(ticketRef, {
      ticketId: ticketRef.id,
      streamId,
      userId,
      creatorId: streamData.creatorId,
      ticketPrice,
      status: 'active',
      purchasedAt: Timestamp.now(),
      expiresAt: streamData.endedAt || null,
    });
    
    // Record transaction
    const transactionRef = db.collection('liveStreamTransactions').doc();
    transaction.set(transactionRef, {
      transactionId: transactionRef.id,
      type: 'ppv_ticket',
      streamId,
      userId,
      creatorId: streamData.creatorId,
      amount: ticketPrice,
      creatorAmount,
      avaloAmount,
      status: 'completed',
      createdAt: Timestamp.now(),
    });
  });
  
  logger.info(`PPV ticket purchased: ${streamId} by ${userId} (${ticketPrice} tokens)`);
  
  return {
    success: true,
    ticketPrice,
    message: 'Ticket purchased successfully. Entry granted!',
  };
});

// =====================================================================
// GIFTING SYSTEM
// =====================================================================

/**
 * Send a gift during live stream
 */
export const sendLiveStreamGift = onCall(async (request) => {
  const { auth, data } = request;
  
  if (!auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const senderId = auth.uid;
  const { streamId, giftId } = data;
  
  // Get stream data
  const streamDoc = await db.collection('liveStreamSessions').doc(streamId).get();
  if (!streamDoc.exists) {
    throw new HttpsError('not-found', 'Stream not found');
  }
  
  const streamData = streamDoc.data();
  
  if (streamData?.status !== 'live') {
    throw new HttpsError('failed-precondition', 'Stream must be live to send gifts');
  }
  
  // Find gift in catalog
  let gift: any = null;
  let giftType: GiftType = 'standard';
  
  for (const [type, gifts] of Object.entries(GIFT_CATALOG)) {
    const found = gifts.find((g: any) => g.id === giftId);
    if (found) {
      gift = found;
      giftType = type as GiftType;
      break;
    }
  }
  
  if (!gift) {
    throw new HttpsError('not-found', 'Gift not found in catalog');
  }
  
  const tokenValue = gift.tokens;
  
  // Check sender balance
  const senderDoc = await db.collection('users').doc(senderId).get();
  const senderBalance = senderDoc.data()?.tokenBalance || 0;
  const senderName = senderDoc.data()?.displayName || 'Anonymous';
  
  if (senderBalance < tokenValue) {
    throw new HttpsError(
      'failed-precondition',
      `Insufficient balance. Need ${tokenValue} tokens, have ${senderBalance}.`
    );
  }
  
  // Process gift (atomic transaction)
  await db.runTransaction(async (transaction) => {
    const senderRef = db.collection('users').doc(senderId);
    const creatorRef = db.collection('users').doc(streamData.creatorId);
    const streamRef = db.collection('liveStreamSessions').doc(streamId);
    const milestonesRef = db.collection('liveStreamMilestones').doc(streamId);
    
    // Deduct from sender
    transaction.update(senderRef, {
      tokenBalance: FieldValue.increment(-tokenValue),
    });
    
    // Calculate split
    const creatorAmount = Math.floor(tokenValue * (LIVE_CONFIG.CREATOR_CUT_PERCENT / 100));
    const avaloAmount = tokenValue - creatorAmount;
    
    // Credit creator (immediate)
    transaction.update(creatorRef, {
      tokenBalance: FieldValue.increment(creatorAmount),
    });
    
    // Update stream stats
    transaction.update(streamRef, {
      totalGiftTokens: FieldValue.increment(tokenValue),
      totalRevenue: FieldValue.increment(tokenValue),
    });
    
    // Update milestones
    transaction.update(milestonesRef, {
      currentGiftTotal: FieldValue.increment(tokenValue),
      lastUpdated: Timestamp.now(),
    });
    
    // Create gift record
    const giftRef = db.collection('liveStreamGifts').doc();
    transaction.set(giftRef, {
      giftId: giftRef.id,
      streamId,
      senderId,
      senderName,
      creatorId: streamData.creatorId,
      giftType,
      giftName: gift.name,
      tokenValue,
      status: 'completed',
      sentAt: Timestamp.now(),
      processedAt: Timestamp.now(),
    });
    
    // Record transaction
    const transactionRef = db.collection('liveStreamTransactions').doc();
    transaction.set(transactionRef, {
      transactionId: transactionRef.id,
      type: 'gift',
      streamId,
      userId: senderId,
      creatorId: streamData.creatorId,
      amount: tokenValue,
      creatorAmount,
      avaloAmount,
      giftType,
      giftName: gift.name,
      status: 'completed',
      createdAt: Timestamp.now(),
    });
  });
  
  // Update spotlight leaderboard
  await updateSpotlightLeaderboard(streamId, senderId, senderName, tokenValue);
  
  // Check milestone unlocks
  await checkMilestoneUnlocks(streamId);
  
  // Check for conversion triggers
  await checkConversionTriggers(streamId, senderId, tokenValue, streamData.mode);
  
  logger.info(`Gift sent: ${gift.name} (${tokenValue} tokens) to ${streamId} by ${senderId}`);
  
  return {
    success: true,
    giftName: gift.name,
    tokenValue,
    message: `${gift.name} sent!`,
  };
});

/**
 * Update spotlight leaderboard with new gift
 */
async function updateSpotlightLeaderboard(
  streamId: string,
  senderId: string,
  senderName: string,
  tokenValue: number
): Promise<void> {
  const spotlightRef = db.collection('liveStreamSpotlight').doc(streamId);
  const spotlightDoc = await spotlightRef.get();
  
  if (!spotlightDoc.exists) {
    return;
  }
  
  const spotlightData = spotlightDoc.data();
  let topGifters = spotlightData?.topGifters || [];
  
  // Find or create entry for sender
  const existingIndex = topGifters.findIndex((g: any) => g.userId === senderId);
  
  if (existingIndex >= 0) {
    topGifters[existingIndex].totalTokens += tokenValue;
  } else {
    topGifters.push({
      userId: senderId,
      userName: senderName,
      totalTokens: tokenValue,
    });
  }
  
  // Sort by total tokens and keep top 10
  topGifters.sort((a: any, b: any) => b.totalTokens - a.totalTokens);
  topGifters = topGifters.slice(0, 10);
  
  await spotlightRef.update({
    topGifters,
    lastUpdated: Timestamp.now(),
  });
}

/**
 * Check and unlock milestones based on gift total
 */
async function checkMilestoneUnlocks(streamId: string): Promise<void> {
  const milestonesRef = db.collection('liveStreamMilestones').doc(streamId);
  const milestonesDoc = await milestonesRef.get();
  
  if (!milestonesDoc.exists) {
    return;
  }
  
  const milestonesData = milestonesDoc.data();
  const currentTotal = milestonesData?.currentGiftTotal || 0;
  const milestones = milestonesData?.milestones || {};
  
  const streamRef = db.collection('liveStreamSessions').doc(streamId);
  const updates: any = {};
  
  // Check each milestone
  if (!milestones.extra5Min?.unlocked && currentTotal >= milestones.extra5Min?.threshold) {
    updates['milestones.extra5MinUnlocked'] = true;
    await milestonesRef.update({ 'milestones.extra5Min.unlocked': true });
    logger.info(`Milestone unlocked: Extra 5 min for stream ${streamId}`);
  }
  
  if (!milestones.groupQA?.unlocked && currentTotal >= milestones.groupQA?.threshold) {
    updates['milestones.groupQAUnlocked'] = true;
    await milestonesRef.update({ 'milestones.groupQA.unlocked': true });
    logger.info(`Milestone unlocked: Group Q&A for stream ${streamId}`);
  }
  
  if (!milestones.chooseTopic?.unlocked && currentTotal >= milestones.chooseTopic?.threshold) {
    updates['milestones.chooseTopicUnlocked'] = true;
    await milestonesRef.update({ 'milestones.chooseTopic.unlocked': true });
    logger.info(`Milestone unlocked: Choose topic for stream ${streamId}`);
  }
  
  if (Object.keys(updates).length > 0) {
    await streamRef.update(updates);
  }
}

// =====================================================================
// CONVERSION FUNNELS
// =====================================================================

/**
 * Check and trigger conversion funnels based on user behavior
 */
async function checkConversionTriggers(
  streamId: string,
  userId: string,
  giftValue: number,
  streamMode: LiveStreamMode
): Promise<void> {
  // High-value gift → 1-on-1 conversion
  if (giftValue >= LIVE_CONFIG.HIGH_VALUE_GIFT_THRESHOLD) {
    await createConversion(streamId, userId, 'one_on_one', {
      triggerType: 'high_value_gift',
      giftValue,
    });
  }
  
  // Gifting in open live → PPV conversion
  if (streamMode === 'open' && giftValue >= 100) {
    await createConversion(streamId, userId, 'ppv_ticket', {
      triggerType: 'gift_in_free_live',
      giftValue,
    });
  }
}

/**
 * Track viewer watch time for Fan Club conversion
 */
export const trackViewerWatchTime = onCall(async (request) => {
  const { auth, data } = request;
  
  if (!auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = auth.uid;
  const { streamId, watchTimeMinutes } = data;
  
  // Get stream data
  const streamDoc = await db.collection('liveStreamSessions').doc(streamId).get();
  if (!streamDoc.exists) {
    return { success: false };
  }
  
  const streamData = streamDoc.data();
  
  // Fan-only preview watched for 5+ min → Fan Club conversion
  if (streamData?.mode === 'fan_only' && watchTimeMinutes >= LIVE_CONFIG.FAN_CLUB_PREVIEW_MINUTES) {
    // Check if user is already a fan club member
    const membershipDoc = await db.collection('fanClubMemberships')
      .doc(`${streamData.creatorId}_${userId}`)
      .get();
    
    if (!membershipDoc.exists || membershipDoc.data()?.status !== 'active') {
      await createConversion(streamId, userId, 'fan_club', {
        triggerType: 'preview_watch_time',
        watchTimeMinutes,
      });
    }
  }
  
  return { success: true };
});

/**
 * Create a conversion record
 */
async function createConversion(
  streamId: string,
  userId: string,
  conversionType: ConversionType,
  metadata: any
): Promise<void> {
  const streamDoc = await db.collection('liveStreamSessions').doc(streamId).get();
  if (!streamDoc.exists) {
    return;
  }
  
  const streamData = streamDoc.data();
  
  // Check if conversion already exists
  const existingQuery = await db.collection('liveStreamConversions')
    .where('userId', '==', userId)
    .where('streamId', '==', streamId)
    .where('conversionType', '==', conversionType)
    .limit(1)
    .get();
  
  if (!existingQuery.empty) {
    return; // Already converted
  }
  
  const conversionRef = db.collection('liveStreamConversions').doc();
  await conversionRef.set({
    conversionId: conversionRef.id,
    streamId,
    userId,
    creatorId: streamData?.creatorId,
    conversionType,
    status: 'pending',
    metadata,
    createdAt: Timestamp.now(),
  });
  
  logger.info(`Conversion tracked: ${conversionType} for user ${userId} from stream ${streamId}`);
}

// =====================================================================
// SAFETY & MODERATION
// =====================================================================

/**
 * Report safety violation (explicit content detected by AI)
 */
export const reportSafetyViolation = onCall(async (request) => {
  const { auth, data } = request;
  
  if (!auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { streamId, warningType, description } = data;
  
  const streamRef = db.collection('liveStreamSessions').doc(streamId);
  const streamDoc = await streamRef.get();
  
  if (!streamDoc.exists) {
    throw new HttpsError('not-found', 'Stream not found');
  }
  
  const streamData = streamDoc.data();
  const currentWarnings = streamData?.warningCount || 0;
  const newWarningCount = currentWarnings + 1;
  
  // Create warning record
  const warningRef = db.collection('liveStreamSafetyWarnings').doc();
  await warningRef.set({
    warningId: warningRef.id,
    streamId,
    creatorId: streamData?.creatorId,
    warningType: warningType as SafetyWarningType,
    description,
    warningNumber: newWarningCount,
    reportedBy: auth.uid,
    createdAt: Timestamp.now(),
  });
  
  // Update stream warning count
  await streamRef.update({
    warningCount: newWarningCount,
    updatedAt: Timestamp.now(),
  });
  
  // Auto-end if 3 warnings reached
  if (newWarningCount >= LIVE_CONFIG.MAX_WARNINGS_BEFORE_AUTO_END) {
    await streamRef.update({
      status: 'ended',
      endedAt: Timestamp.now(),
      endReason: 'safety_violations',
    });
    
    logger.warn(`Stream auto-ended due to ${newWarningCount} warnings: ${streamId}`);
    
    return {
      success: true,
      warningCount: newWarningCount,
      streamEnded: true,
      message: 'Stream ended due to policy violations',
    };
  }
  
  logger.info(`Safety warning ${newWarningCount} issued for stream ${streamId}`);
  
  return {
    success: true,
    warningCount: newWarningCount,
    streamEnded: false,
    message: `Warning ${newWarningCount}/3 issued`,
  };
});

// =====================================================================
// ANALYTICS & REPORTING
// =====================================================================

/**
 * Update creator analytics after stream ends
 */
async function updateCreatorAnalytics(creatorId: string, streamId: string): Promise<void> {
  const analyticsRef = db.collection('liveStreamAnalytics').doc(creatorId);
  const analyticsDoc = await analyticsRef.get();
  
  const streamDoc = await db.collection('liveStreamSessions').doc(streamId).get();
  const streamData = streamDoc.data();
  
  if (!streamData) {
    return;
  }
  
  if (!analyticsDoc.exists) {
    // Create initial analytics
    await analyticsRef.set({
      creatorId,
      totalStreams: 1,
      totalRevenue: streamData.totalRevenue || 0,
      totalViewers: streamData.peakViewerCount || 0,
      totalDurationMinutes: streamData.actualDurationMinutes || 0,
      averageViewers: streamData.peakViewerCount || 0,
      lastStreamAt: Timestamp.now(),
      createdAt: Timestamp.now(),
    });
  } else {
    // Update analytics
    const currentData = analyticsDoc.data();
    const totalStreams = (currentData?.totalStreams || 0) + 1;
    const totalViewers = (currentData?.totalViewers || 0) + (streamData.peakViewerCount || 0);
    
    await analyticsRef.update({
      totalStreams,
      totalRevenue: FieldValue.increment(streamData.totalRevenue || 0),
      totalViewers,
      totalDurationMinutes: FieldValue.increment(streamData.actualDurationMinutes || 0),
      averageViewers: Math.round(totalViewers / totalStreams),
      lastStreamAt: Timestamp.now(),
    });
  }
}

/**
 * Get creator live stream analytics
 */
export const getLiveStreamAnalytics = onCall(async (request) => {
  const { auth } = request;
  
  if (!auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const creatorId = auth.uid;
  
  // Check earnOn
  const creatorDoc = await db.collection('users').doc(creatorId).get();
  if (!creatorDoc.exists || !creatorDoc.data()?.earnOnChat) {
    throw new HttpsError('permission-denied', 'Must have Earn ON to view analytics');
  }
  
  const analyticsDoc = await db.collection('liveStreamAnalytics').doc(creatorId).get();
  
  if (!analyticsDoc.exists) {
    return {
      totalStreams: 0,
      totalRevenue: 0,
      totalViewers: 0,
      totalDurationMinutes: 0,
      averageViewers: 0,
    };
  }
  
  return analyticsDoc.data();
});

// =====================================================================
// SCHEDULED TASKS
// =====================================================================

/**
 * Clean up inactive viewers (every 1 minute)
 */
export const cleanupInactiveViewers = onSchedule('every 1 minutes', async () => {
  const cutoffTime = Timestamp.fromMillis(
    Date.now() - (LIVE_CONFIG.VIEWER_INACTIVITY_TIMEOUT_SECONDS * 1000)
  );
  
  const viewersQuery = await db.collectionGroup('viewers')
    .where('lastActivityAt', '<', cutoffTime)
    .get();
  
  const batch = db.batch();
  let count = 0;
  
  viewersQuery.forEach((doc) => {
    batch.delete(doc.ref);
    count++;
  });
  
  if (count > 0) {
    await batch.commit();
    logger.info(`Cleaned up ${count} inactive viewers`);
  }
});

/**
 * Auto-expire old PPV tickets (daily)
 */
export const expireOldTickets = onSchedule('every 24 hours', async () => {
  const cutoffTime = Timestamp.fromMillis(Date.now() - (7 * 24 * 60 * 60 * 1000)); // 7 days
  
  const ticketsQuery = await db.collection('liveStreamTickets')
    .where('status', '==', 'active')
    .where('purchasedAt', '<', cutoffTime)
    .get();
  
  const batch = db.batch();
  let count = 0;
  
  ticketsQuery.forEach((doc) => {
    batch.update(doc.ref, { status: 'expired' });
    count++;
  });
  
  if (count > 0) {
    await batch.commit();
    logger.info(`Expired ${count} old tickets`);
  }
});

logger.info('PACK 260: Live Broadcasts module initialized');