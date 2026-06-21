import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 58 — Calendar Reservations & Escrowed Meetings
 *
 * Features:
 * - Creator availability management (weekly slots + overrides)
 * - Paid meeting reservations with token escrow
 * - Confirmation/no-show flows with dispute escalation
 * - Integration with earnings, disputes, notifications, compliance
 *
 * Non-negotiable:
 * - No free tokens, no discounts, no auto-refunds outside explicit rules
 * - 65/35 split applies to all reservation earnings
 * - Age, AML, enforcement checks before any transaction
 * - Escrow locked until meeting confirmed or dispute resolved
 */

import * as functions from 'firebase-functions';
import { db, admin } from './init';
import { createDispute, CreateDisputeParams } from './disputes';
import { createAmlEvent } from './amlMonitoring';
import { HttpsError, auth, increment, onCall, serverTimestamp, logger, onSchedule } from './runtime';

const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type MeetingMode = 'ONLINE' | 'OFFLINE' | 'HYBRID';

export type ReservationStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'NO_SHOW_CREATOR'
  | 'NO_SHOW_CLIENT'
  | 'COMPLETED'
  | 'IN_DISPUTE'
  | 'REFUNDED'
  | 'RELEASED_TO_CREATOR';

export type EscrowStatus =
  | 'LOCKED'
  | 'RELEASED_TO_CREATOR'
  | 'REFUNDED_TO_CLIENT'
  | 'ADJUSTED';

export interface WeeklyBlock {
  start: string; // "HH:mm"
  end: string; // "HH:mm"
  slotDurationMinutes: number;
}

export interface WeeklySlot {
  enabled: boolean;
  blocks: WeeklyBlock[];
}

export interface DateOverride {
  isClosed?: boolean;
  extraBlocks?: WeeklyBlock[];
}

export interface CreatorAvailability {
  earnerUserId: string;
  timezone: string; // IANA timezone
  weeklySlots: {
    [weekday: string]: WeeklySlot; // "MON", "TUE", etc.
  };
  overrides: {
    [date: string]: DateOverride; // "YYYY-MM-DD"
  };
  defaultPriceTokens: number;
  meetingMode: MeetingMode;
  locationHint?: string | null;
  description?: string | null;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export interface Reservation {
  reservationId: string;
  earnerUserId: string;
  clientUserId: string;
  startTimeUtc: admin.firestore.Timestamp;
  endTimeUtc: admin.firestore.Timestamp;
  timezone: string;
  priceTokens: number;
  currencyHint?: string | null;
  status: ReservationStatus;
  clientConfirmed: boolean;
  earnerConfirmed: boolean;
  clientConfirmationAt?: admin.firestore.Timestamp;
  earnerConfirmationAt?: admin.firestore.Timestamp;
  chatConversationId?: string | null;
  disputeId?: string | null;
  escrowId?: string | null;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export interface ReservationEscrow {
  escrowId: string;
  reservationId: string;
  earnerUserId: string;
  clientUserId: string;
  tokensLocked: number;
  tokensPlatformShare: number;
  tokensCreatorShare: number;
  status: EscrowStatus;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PLATFORM_SHARE = MONETIZATION_SPLITS.CHAT.platform;
const CREATOR_SHARE = MONETIZATION_SPLITS.CHAT.earner;
const CANCELLATION_CUTOFF_HOURS = 24;
const CONFIRMATION_WINDOW_HOURS = 24;
const PENDING_PAYMENT_TIMEOUT_MINUTES = 15;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Send simple notification via Firestore
 */
async function sendNotification(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: any;
  deepLink?: string;
}): Promise<void> {
  try {
    await db.collection('notifications').add({
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      data: params.data || {},
      deepLink: params.deepLink || null,
      read: false,
      createdAt: FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('Failed to send notification:', error);
    // Non-blocking
  }
}

/**
 * Check if user can participate in reservations (age, enforcement, AML)
 */
async function validateUserEligibility(userId: string): Promise<{ valid: boolean; reason?: string }> {
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    return { valid: false, reason: 'User not found' };
  }

  const userData = userDoc.data();

  // Age verification
  const ageVerificationDoc = await db.collection('age_verification').doc(userId).get();
  const ageData = ageVerificationDoc.data();
  if (!ageData || !ageData.ageVerified) {
    return { valid: false, reason: 'Age verification required' };
  }

  // Enforcement state
  const enforcementDoc = await db.collection('enforcement_state').doc(userId).get();
  const enforcementData = enforcementDoc.data();
  if (enforcementData) {
    if (enforcementData.status === 'SUSPENDED' || enforcementData.status === 'BANNED') {
      console.log('Scheduled job result:', { valid: false, reason: 'Account suspended or banned' });

      return;
    }
  }

  // Check if earner can earn (for earner side)
  const earnerDoc = await db.collection('earner_earnings').doc(userId).get();
  const earnerData = earnerDoc.data();
  if (earnerData && earnerData.earningStatus !== 'NORMAL') {
    return { valid: false, reason: 'Creator earnings restricted' };
  }

  return { valid: true };
}

/**
 * Check blocklist between two users
 */
async function checkBlocklist(userId1: string, userId2: string): Promise<boolean> {
  const blocklistRef = db.collection('blocklist');
  
  const block1 = await blocklistRef
    .where('sourceUserId', '==', userId1)
    .where('targetUserId', '==', userId2)
    .where('status', '==', 'ACTIVE')
    .limit(1)
    .get();

  const block2 = await blocklistRef
    .where('sourceUserId', '==', userId2)
    .where('targetUserId', '==', userId1)
    .where('status', '==', 'ACTIVE')
    .limit(1)
    .get();

  return !block1.empty || !block2.empty;
}

/**
 * Generate time slots from availability template
 */
function generateTimeSlots(
  availability: CreatorAvailability,
  fromDate: Date,
  toDate: Date
): Array<{ startTimeUtc: Date; endTimeUtc: Date }> {
  const slots: Array<{ startTimeUtc: Date; endTimeUtc: Date }> = [];
  const currentDate = new Date(fromDate);

  while (currentDate <= toDate) {
    const dateStr = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const weekday = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][currentDate.getDay()];

    // Check if date is closed via override
    const override = availability.overrides[dateStr];
    if (override?.isClosed) {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    // Get blocks for this day
    let blocks: WeeklyBlock[] = [];
    const weeklySlot = availability.weeklySlots[weekday];
    if (weeklySlot?.enabled) {
      blocks = [...weeklySlot.blocks];
    }

    // Add extra blocks from override
    if (override?.extraBlocks) {
      blocks = [...blocks, ...override.extraBlocks];
    }

    // Generate slots from blocks
    for (const block of blocks) {
      const [startHour, startMinute] = block.start.split(':').map(Number);
      const [endHour, endMinute] = block.end.split(':').map(Number);

      const blockStart = new Date(currentDate);
      blockStart.setHours(startHour, startMinute, 0, 0);

      const blockEnd = new Date(currentDate);
      blockEnd.setHours(endHour, endMinute, 0, 0);

      // Generate slots within block
      let slotStart = new Date(blockStart);
      while (slotStart < blockEnd) {
        const slotEnd = new Date(slotStart.getTime() + block.slotDurationMinutes * 60000);
        if (slotEnd <= blockEnd) {
          slots.push({
            startTimeUtc: new Date(slotStart),
            endTimeUtc: new Date(slotEnd)
          });
        }
        slotStart = slotEnd;
      }
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return slots;
}

/**
 * Check if a time slot conflicts with existing reservations
 */
async function checkSlotAvailability(
  earnerUserId: string,
  startTimeUtc: Date,
  endTimeUtc: Date
): Promise<boolean> {
  const reservationsRef = db.collection('reservations');
  
  const conflicts = await reservationsRef
    .where('earnerUserId', '==', earnerUserId)
    .where('status', 'in', ['PENDING_PAYMENT', 'CONFIRMED'])
    .get();

  for (const doc of conflicts.docs) {
    const reservation = doc.data() as Reservation;
    const resStart = reservation.startTimeUtc.toDate();
    const resEnd = reservation.endTimeUtc.toDate();

    // Check overlap
    if (startTimeUtc < resEnd && endTimeUtc > resStart) {
      return false; // Conflict found
    }
  }

  return true; // No conflicts
}

/**
 * Lock tokens from client wallet into escrow
 */
async function lockTokensInEscrow(
  clientUserId: string,
  earnerUserId: string,
  reservationId: string,
  tokensLocked: number
): Promise<string> {
  // Calculate shares (65/35 split)
  const tokensCreatorShare = Math.floor(tokensLocked * CREATOR_SHARE);
  const tokensPlatformShare = tokensLocked - tokensCreatorShare;

  // Check client balance
  const clientWalletRef = db.collection('wallets').doc(clientUserId);
  const clientWallet = await clientWalletRef.get();
  
  if (!clientWallet.exists) {
    throw new Error('Client wallet not found');
  }

  const walletData = clientWallet.data();
  throw new Error('HARD_DISABLED: legacy users/{uid}.tokenBalance path — migrate to wallets/{uid}.balance; see C1/C3');  // [P2]
  const currentBalance = 0;  // [P2] stub — unreachable; satisfies TS

  if (currentBalance < tokensLocked) {
    throw new Error(`Insufficient tokens. Required: ${tokensLocked}, Available: ${currentBalance}`);
  }

  // Create escrow record
  const escrowId = db.collection('reservation_escrow').doc().id;
  const escrowData: ReservationEscrow = {
    escrowId,
    reservationId,
    earnerUserId,
    clientUserId,
    tokensLocked,
    tokensPlatformShare,
    tokensCreatorShare,
    status: 'LOCKED',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  };

  // Atomic transaction: deduct tokens and create escrow
  await db.runTransaction(async (transaction) => {
    const freshWallet = await transaction.get(clientWalletRef);
    throw new Error('HARD_DISABLED: legacy users/{uid}.tokenBalance path — migrate to wallets/{uid}.balance; see C1/C3');  // [P2]
    const freshBalance = 0;  // [P2] stub — unreachable; satisfies TS

    if (freshBalance < tokensLocked) {
      throw new Error('Insufficient tokens (transaction check)');
    }

    // Deduct tokens from client
    transaction.update(clientWalletRef, {
      tokenBalance: FieldValue.increment(-tokensLocked),
      updatedAt: Timestamp.now()
    });

    // Create escrow
    transaction.set(db.collection('reservation_escrow').doc(escrowId), escrowData);

    // Log transaction
    const txLogId = db.collection('token_transactions').doc().id;
    transaction.set(db.collection('token_transactions').doc(txLogId), {
      transactionId: txLogId,
      userId: clientUserId,
      type: 'RESERVATION_ESCROW_LOCK',
      amount: -tokensLocked,
      balanceAfter: freshBalance - tokensLocked,
      metadata: { reservationId, escrowId },
      createdAt: Timestamp.now()
    });
  });

  return escrowId;
}

/**
 * Release escrow to earner (mark as earning)
 */
async function releaseEscrowToCreator(escrowId: string, reservationId: string): Promise<void> {
  const escrowRef = db.collection('reservation_escrow').doc(escrowId);
  const escrowDoc = await escrowRef.get();

  if (!escrowDoc.exists) {
    throw new Error('Escrow not found');
  }

  const escrow = escrowDoc.data() as ReservationEscrow;

  if (escrow.status !== 'LOCKED') {
    throw new Error(`Escrow already ${escrow.status}`);
  }

  // Update escrow status
  await escrowRef.update({
    status: 'RELEASED_TO_CREATOR',
    updatedAt: Timestamp.now()
  });

  // Create token earn event
  const earnEventId = db.collection('token_earn_events').doc().id;
  await db.collection('token_earn_events').doc(earnEventId).set({
    eventId: earnEventId,
    userId: escrow.earnerUserId,
    sourceUserId: escrow.clientUserId,
    channel: 'RESERVATION_MEETING',
    tokensEarned: escrow.tokensCreatorShare,
    metadata: { reservationId, escrowId },
    createdAt: Timestamp.now()
  });

  // Update earner earnings
  const earningsRef = db.collection('earner_earnings').doc(escrow.earnerUserId);
  const earningsDoc = await earningsRef.get();

  if (earningsDoc.exists) {
    const now = Timestamp.now();

    await earningsRef.update({
      totalTokensEarned: FieldValue.increment(escrow.tokensCreatorShare),
      withdrawableTokens: FieldValue.increment(escrow.tokensCreatorShare),
      [`channelBreakdown.RESERVATION_MEETING`]: FieldValue.increment(escrow.tokensCreatorShare),
      updatedAt: now
    });
  } else {
    // Initialize earnings if not exist
    await earningsRef.set({
      userId: escrow.earnerUserId,
      totalTokensEarned: escrow.tokensCreatorShare,
      withdrawableTokens: escrow.tokensCreatorShare,
      withdrawnTokens: 0,
      pendingTokens: 0,
      earningStatus: 'NORMAL',
      channelBreakdown: {
        RESERVATION_MEETING: escrow.tokensCreatorShare
      },
      last30Days: escrow.tokensCreatorShare,
      last90Days: escrow.tokensCreatorShare,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
  }

  // Send notification to earner
  await sendNotification({
    userId: escrow.earnerUserId,
    type: 'RESERVATION_COMPLETED',
    title: 'Meeting Completed',
    body: `You earned ${escrow.tokensCreatorShare} tokens from a meeting`,
    data: { reservationId, escrowId },
    deepLink: `reservations/${reservationId}`
  });

  // PACK 63: AML Event Logging for high reservation volume
  try {
    const date30dAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentReservationsSnapshot = await db.collection('reservations')
      .where('earnerUserId', '==', escrow.earnerUserId)
      .where('status', '==', 'COMPLETED')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(date30dAgo))
      .get();
    
    const completedCount = recentReservationsSnapshot.size;
    
    // Check for very high reservation volume (threshold: 20 completed in 30 days)
    if (completedCount >= 20) {
      await createAmlEvent({
        userId: escrow.earnerUserId,
        kind: 'HIGH_RESERVATION_VOLUME',
        severity: 'INFO',
        description: `High reservation volume: ${completedCount} completed meetings in 30 days`,
        details: { completedCount30d: completedCount, reservationId, escrowId },
        source: 'RESERVATIONS'
      });
    }
  } catch (amlError: any) {
    console.error('[AML Hook] Error in reservation AML logging:', amlError);
    // Non-blocking
  }
}

/**
 * Refund escrow to client
 */
async function refundEscrowToClient(escrowId: string, reservationId: string): Promise<void> {
  const escrowRef = db.collection('reservation_escrow').doc(escrowId);
  const escrowDoc = await escrowRef.get();

  if (!escrowDoc.exists) {
    throw new Error('Escrow not found');
  }

  const escrow = escrowDoc.data() as ReservationEscrow;

  if (escrow.status !== 'LOCKED') {
    throw new Error(`Escrow already ${escrow.status}`);
  }

  // Update escrow status
  await escrowRef.update({
    status: 'REFUNDED_TO_CLIENT',
    updatedAt: Timestamp.now()
  });

  // Refund tokens to client
  const clientWalletRef = db.collection('wallets').doc(escrow.clientUserId);
  await clientWalletRef.update({
    tokenBalance: FieldValue.increment(escrow.tokensLocked),
    updatedAt: Timestamp.now()
  });

  // Log transaction
  const txLogId = db.collection('token_transactions').doc().id;
  await db.collection('token_transactions').doc(txLogId).set({
    transactionId: txLogId,
    userId: escrow.clientUserId,
    type: 'RESERVATION_ESCROW_REFUND',
    amount: escrow.tokensLocked,
    balanceAfter: FieldValue.increment(escrow.tokensLocked),
    metadata: { reservationId, escrowId },
    createdAt: Timestamp.now()
  });

  // Send notification to client
  await sendNotification({
    userId: escrow.clientUserId,
    type: 'RESERVATION_REFUNDED',
    title: 'Meeting Cancelled',
    body: `${escrow.tokensLocked} tokens have been refunded`,
    data: { reservationId, escrowId },
    deepLink: `reservations/${reservationId}`
  });
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * GET /reservations/availability
 * Fetch earner availability and available slots
 */
export const getAvailability = functions.https.onCall(async (request) => {
  const data = request.data;
  const { earnerUserId, from, to } = data;

  if (!earnerUserId || !from || !to) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  // Get availability template
  const availabilityDoc = await db
    .collection('reservation_availability')
    .doc(earnerUserId)
    .get();

  if (!availabilityDoc.exists) {
    return {
      availability: null,
      slots: []
    };
  }

  const availability = availabilityDoc.data() as CreatorAvailability;
  const fromDate = new Date(from);
  const toDate = new Date(to);

  // Generate all potential slots
  const allSlots = generateTimeSlots(availability, fromDate, toDate);

  // Filter out past slots and check availability
  const now = new Date();
  const availableSlots = [];

  for (const slot of allSlots) {
    if (slot.startTimeUtc > now) {
      const isAvailable = await checkSlotAvailability(
        earnerUserId,
        slot.startTimeUtc,
        slot.endTimeUtc
      );
      if (isAvailable) {
        availableSlots.push({
          startTimeUtc: slot.startTimeUtc.toISOString(),
          endTimeUtc: slot.endTimeUtc.toISOString()
        });
      }
    }
  }

  return {
    availability: {
      earnerUserId: availability.earnerUserId,
      timezone: availability.timezone,
      defaultPriceTokens: availability.defaultPriceTokens,
      meetingMode: availability.meetingMode,
      locationHint: availability.locationHint,
      description: availability.description
    },
    slots: availableSlots
  };
});

/**
 * POST /reservations/availability/set
 * Set or update earner availability
 */
export const setAvailability = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = request.auth.uid;
  const {
    timezone,
    weeklySlots,
    overrides,
    defaultPriceTokens,
    meetingMode,
    locationHint,
    description
  } = data;

  if (!timezone || !weeklySlots || !defaultPriceTokens || !meetingMode) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  // Validate earner eligibility
  const eligibility = await validateUserEligibility(userId);
  if (!eligibility.valid) {
    throw new functions.https.HttpsError('permission-denied', eligibility.reason || 'Not eligible');
  }

  // Validate price (must be positive)
  if (defaultPriceTokens <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Price must be positive');
  }

  // Create or update availability
  const availabilityRef = db.collection('reservation_availability').doc(userId);
  const availabilityData: Partial<CreatorAvailability> = {
    earnerUserId: userId,
    timezone,
    weeklySlots: weeklySlots || {},
    overrides: overrides || {},
    defaultPriceTokens,
    meetingMode,
    locationHint: locationHint || null,
    description: description || null,
    updatedAt: Timestamp.now()
  };

  const existingDoc = await availabilityRef.get();
  if (existingDoc.exists) {
    await availabilityRef.update(availabilityData);
  } else {
    await availabilityRef.set({
      ...availabilityData,
      createdAt: Timestamp.now()
    });
  }

  console.log('Scheduled job result:', { success: true });


  return;
});

/**
 * POST /reservations/create
 * Create a new reservation with token escrow
 */
export const createReservation = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const clientUserId = request.auth.uid;
  const { earnerUserId, startTimeUtc, endTimeUtc, meetingMode } = data;

  if (!earnerUserId || !startTimeUtc || !endTimeUtc) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  // Cannot book meeting with self
  if (clientUserId === earnerUserId) {
    throw new functions.https.HttpsError('invalid-argument', 'Cannot book meeting with yourself');
  }

  // Validate both users
  const clientEligibility = await validateUserEligibility(clientUserId);
  if (!clientEligibility.valid) {
    throw new functions.https.HttpsError('permission-denied', `Client: ${clientEligibility.reason}`);
  }

  const earnerEligibility = await validateUserEligibility(earnerUserId);
  if (!earnerEligibility.valid) {
    throw new functions.https.HttpsError('permission-denied', `Creator: ${earnerEligibility.reason}`);
  }

  // Check blocklist
  const isBlocked = await checkBlocklist(clientUserId, earnerUserId);
  if (isBlocked) {
    throw new functions.https.HttpsError('permission-denied', 'Users have blocked each other');
  }

  // Get earner availability
  const availabilityDoc = await db
    .collection('reservation_availability')
    .doc(earnerUserId)
    .get();

  if (!availabilityDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Creator has no availability set');
  }

  const availability = availabilityDoc.data() as CreatorAvailability;
  const priceTokens = availability.defaultPriceTokens;

  // Check slot availability
  const startTime = new Date(startTimeUtc);
  const endTime = new Date(endTimeUtc);
  const isAvailable = await checkSlotAvailability(earnerUserId, startTime, endTime);

  if (!isAvailable) {
    throw new functions.https.HttpsError('failed-precondition', 'Time slot is not available');
  }

  // Check slot is not in the past
  const now = new Date();
  if (startTime <= now) {
    throw new functions.https.HttpsError('invalid-argument', 'Cannot book past time slots');
  }

  // Create reservation (PENDING_PAYMENT)
  const reservationId = db.collection('reservations').doc().id;
  const reservationData: Reservation = {
    reservationId,
    earnerUserId,
    clientUserId,
    startTimeUtc: Timestamp.fromDate(startTime),
    endTimeUtc: Timestamp.fromDate(endTime),
    timezone: availability.timezone,
    priceTokens,
    status: 'PENDING_PAYMENT',
    clientConfirmed: false,
    earnerConfirmed: false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  };

  await db.collection('reservations').doc(reservationId).set(reservationData);

  // Lock tokens in escrow
  try {
    const escrowId = await lockTokensInEscrow(clientUserId, earnerUserId, reservationId, priceTokens);

    // Update reservation to CONFIRMED
    await db.collection('reservations').doc(reservationId).update({
      status: 'CONFIRMED',
      escrowId,
      updatedAt: Timestamp.now()
    });

    // Find or create chat conversation
    const chatsRef = db.collection('chats');
    const existingChat = await chatsRef
      .where('participants', 'array-contains', clientUserId)
      .get();

    let chatConversationId: string | null = null;
    for (const doc of existingChat.docs) {
      const chatData = doc.data();
      if (chatData.participants.includes(earnerUserId)) {
        chatConversationId = doc.id;
        break;
      }
    }

    if (chatConversationId) {
      await db.collection('reservations').doc(reservationId).update({
        chatConversationId
      });
    }

    // Send notifications
    await sendNotification({
      userId: earnerUserId,
      type: 'RESERVATION_CREATED',
      title: 'New Meeting Booked',
      body: `You have a new meeting booked for ${startTime.toLocaleString()}`,
      data: { reservationId },
      deepLink: `reservations/${reservationId}`
    });

    await sendNotification({
      userId: clientUserId,
      type: 'RESERVATION_CONFIRMED',
      title: 'Meeting Confirmed',
      body: `Your meeting is confirmed for ${startTime.toLocaleString()}`,
      data: { reservationId },
      deepLink: `reservations/${reservationId}`
    });

    return {
      reservationId,
      status: 'CONFIRMED',
      escrowId,
      priceTokens
    };
  } catch (error) {
    // Payment failed, update reservation status
    await db.collection('reservations').doc(reservationId).update({
      status: 'CANCELLED',
      updatedAt: Timestamp.now()
    });

    throw new functions.https.HttpsError('failed-precondition', `Payment failed: ${error}`);
  }
});

/**
 * POST /reservations/cancel
 * Cancel a reservation
 */
export const cancelReservation = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = request.auth.uid;
  const { reservationId, reason } = data;

  if (!reservationId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing reservationId');
  }

  // Get reservation
  const reservationRef = db.collection('reservations').doc(reservationId);
  const reservationDoc = await reservationRef.get();

  if (!reservationDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Reservation not found');
  }

  const reservation = reservationDoc.data() as Reservation;

  // Check user is involved
  if (reservation.clientUserId !== userId && reservation.earnerUserId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your reservation');
  }

  // Check status allows cancellation
  if (!['PENDING_PAYMENT', 'CONFIRMED'].includes(reservation.status)) {
    throw new functions.https.HttpsError('failed-precondition', `Cannot cancel ${reservation.status} reservation`);
  }

  const now = new Date();
  const startTime = reservation.startTimeUtc.toDate();
  const hoursUntilMeeting = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  let newStatus: ReservationStatus;
  let refundToClient = false;
  let releaseToCreator = false;

  if (hoursUntilMeeting >= CANCELLATION_CUTOFF_HOURS) {
    // Early cancellation - always refund to client
    newStatus = 'CANCELLED';
    refundToClient = true;
  } else {
    // Late cancellation
    if (userId === reservation.earnerUserId) {
      // Creator cancels late - refund to client
      newStatus = 'NO_SHOW_CREATOR';
      refundToClient = true;
    } else {
      // Client cancels late - release to earner
      newStatus = 'NO_SHOW_CLIENT';
      releaseToCreator = true;
    }
  }

  // Update reservation
  await reservationRef.update({
    status: newStatus,
    updatedAt: Timestamp.now()
  });

  // Handle escrow
  if (reservation.escrowId) {
    if (refundToClient) {
      await refundEscrowToClient(reservation.escrowId, reservationId);
    } else if (releaseToCreator) {
      await releaseEscrowToCreator(reservation.escrowId, reservationId);
    }
  }

  // Send notifications
  const otherUserId = userId === reservation.clientUserId ? reservation.earnerUserId : reservation.clientUserId;
  await sendNotification({
    userId: otherUserId,
    type: 'RESERVATION_CANCELLED',
    title: 'Meeting Cancelled',
    body: reason || 'The meeting has been cancelled',
    data: { reservationId, reason },
    deepLink: `reservations/${reservationId}`
  });

  return {
    reservationId,
    status: newStatus,
    refunded: refundToClient,
    released: releaseToCreator
  };
});

/**
 * POST /reservations/confirm
 * Confirm meeting outcome (confirm or mark no-show)
 */
export const confirmReservation = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = request.auth.uid;
  const { reservationId, outcome } = data;

  if (!reservationId || !outcome) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  if (!['CONFIRM', 'NO_SHOW_OTHER'].includes(outcome)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid outcome');
  }

  // Get reservation
  const reservationRef = db.collection('reservations').doc(reservationId);
  const reservationDoc = await reservationRef.get();

  if (!reservationDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Reservation not found');
  }

  const reservation = reservationDoc.data() as Reservation;

  // Check user is involved
  if (reservation.clientUserId !== userId && reservation.earnerUserId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your reservation');
  }

  // Check status allows confirmation
  if (reservation.status !== 'CONFIRMED') {
    throw new functions.https.HttpsError('failed-precondition', `Cannot confirm ${reservation.status} reservation`);
  }

  // Check meeting has ended
  const now = new Date();
  const endTime = reservation.endTimeUtc.toDate();
  if (now < endTime) {
    throw new functions.https.HttpsError('failed-precondition', 'Meeting has not ended yet');
  }

  // Check confirmation window (within 24h after end)
  const hoursAfterEnd = (now.getTime() - endTime.getTime()) / (1000 * 60 * 60);
  if (hoursAfterEnd > CONFIRMATION_WINDOW_HOURS) {
    throw new functions.https.HttpsError('failed-precondition', 'Confirmation window expired');
  }

  const isClient = userId === reservation.clientUserId;
  const isCreator = userId === reservation.earnerUserId;

  // Update confirmation flags
  const updates: any = {
    updatedAt: Timestamp.now()
  };

  if (outcome === 'CONFIRM') {
    if (isClient) {
      updates.clientConfirmed = true;
      updates.clientConfirmationAt = Timestamp.now();
    } else if (isCreator) {
      updates.earnerConfirmed = true;
      updates.earnerConfirmationAt = Timestamp.now();
    }

    await reservationRef.update(updates);

    // Check if both confirmed
    const updatedReservation = await reservationRef.get();
    const updatedData = updatedReservation.data() as Reservation;

    if (updatedData.clientConfirmed && updatedData.earnerConfirmed) {
      // Both confirmed - mark as COMPLETED and release to earner
      await reservationRef.update({
        status: 'COMPLETED',
        updatedAt: Timestamp.now()
      });

      if (reservation.escrowId) {
        await releaseEscrowToCreator(reservation.escrowId, reservationId);
      }

      return {
        reservationId,
        status: 'COMPLETED',
        released: true
      };
    } else {
      // One side confirmed, waiting for other
      // PACK 63: No-show pattern detection
      try {
        const date30dAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const noShowSnapshot = await db.collection('reservations')
          .where('earnerUserId', '==', reservation.earnerUserId)
          .where('status', 'in', ['NO_SHOW_CREATOR', 'NO_SHOW_CLIENT'])
          .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(date30dAgo))
          .get();
        
        const noShowCount = noShowSnapshot.size;
        
        // Get AML config for threshold
        const amlConfigDoc = await db.collection('aml_config').doc('global').get();
        const highNoShowThreshold = amlConfigDoc.data()?.highNoShowCount30d || 3;
        
        if (noShowCount >= highNoShowThreshold) {
          await createAmlEvent({
            userId: reservation.earnerUserId,
            kind: 'OTHER',
            severity: 'WARN',
            description: `No-show pattern detected: ${noShowCount} no-shows in 30 days`,
            details: { noShowCount30d: noShowCount, reservationId },
            source: 'RESERVATIONS'
          });
        }
      } catch (amlError: any) {
        console.error('[AML Hook] Error in no-show pattern detection:', amlError);
        // Non-blocking
      }
    }

    return {
      reservationId,
      status: 'CONFIRMED',
      awaitingOtherConfirmation: true
    };
  } else {
    // NO_SHOW_OTHER
    // Check if other party has confirmed differently
    if (isClient && reservation.earnerConfirmed) {
      // Conflict: client says earner no-show, but earner confirmed
      updates.status = 'IN_DISPUTE';
    } else if (isCreator && reservation.clientConfirmed) {
      // Conflict: earner says client no-show, but client confirmed
      updates.status = 'IN_DISPUTE';
    } else {
      // No conflict yet - mark appropriate no-show status
      if (isClient) {
        updates.status = 'NO_SHOW_CREATOR';
        updates.clientConfirmed = false;
        updates.clientConfirmationAt = Timestamp.now();
      } else {
        updates.status = 'NO_SHOW_CLIENT';
        updates.earnerConfirmed = false;
        updates.earnerConfirmationAt = Timestamp.now();
      }
    }

    await reservationRef.update(updates);

    const finalReservation = await reservationRef.get();
    const finalData = finalReservation.data() as Reservation;

    if (finalData.status === 'IN_DISPUTE') {
      // Create dispute
      if (reservation.escrowId) {
        const disputeParams: CreateDisputeParams = {
          userId: userId,
          targetUserId: isClient ? reservation.earnerUserId : reservation.clientUserId,
          type: 'RESERVATION',
          title: 'Meeting outcome dispute',
          description: 'Conflicting meeting outcome',
          reservationId
        };

        const dispute = await createDispute(disputeParams);

        await reservationRef.update({
          disputeId: dispute.disputeId,
          updatedAt: Timestamp.now()
        });

        return {
          reservationId,
          status: 'IN_DISPUTE',
          disputeId: dispute.disputeId
        };
      }
    } else {
      // Handle no-show escrow
      if (reservation.escrowId) {
        if (finalData.status === 'NO_SHOW_CREATOR') {
          // Refund to client
          await refundEscrowToClient(reservation.escrowId, reservationId);
        } else if (finalData.status === 'NO_SHOW_CLIENT') {
          // Release to earner
          await releaseEscrowToCreator(reservation.escrowId, reservationId);
        }
      }

      return {
        reservationId,
        status: finalData.status
      };
    }
  }

  return { reservationId, status: reservation.status };
});

/**
 * GET /reservations/list
 * List reservations for a user
 */
export const listReservations = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = request.auth.uid;
  const { role, from, to } = data;

  if (!role || !['earner', 'client'].includes(role)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid role');
  }

  const reservationsRef = db.collection('reservations');
  const field = role === 'earner' ? 'earnerUserId' : 'clientUserId';

  let query: any = reservationsRef.where(field, '==', userId);

  if (from) {
    const fromDate = Timestamp.fromDate(new Date(from));
    query = query.where('startTimeUtc', '>=', fromDate);
  }

  if (to) {
    const toDate = Timestamp.fromDate(new Date(to));
    query = query.where('startTimeUtc', '<=', toDate);
  }

  query = query.orderBy('startTimeUtc', 'desc');

  const snapshot = await query.get();
  const reservations = snapshot.docs.map((doc: any) => {
    const data = doc.data() as Reservation;
    return {
      reservationId: data.reservationId,
      earnerUserId: data.earnerUserId,
      clientUserId: data.clientUserId,
      startTimeUtc: data.startTimeUtc.toDate().toISOString(),
      endTimeUtc: data.endTimeUtc.toDate().toISOString(),
      timezone: data.timezone,
      priceTokens: data.priceTokens,
      status: data.status,
      clientConfirmed: data.clientConfirmed,
      earnerConfirmed: data.earnerConfirmed,
      escrowId: data.escrowId,
      disputeId: data.disputeId
    };
  });

  return { reservations };
});

// ============================================================================
// BACKGROUND JOBS
// ============================================================================

/**
 * Scheduled: Clean up PENDING_PAYMENT reservations
 * Runs every 15 minutes
 */
export const cleanupPendingReservations = onSchedule("*/15 * * * *", async (event) => {
    const now = Timestamp.now();
    const cutoffTime = new Date(now.toMillis() - PENDING_PAYMENT_TIMEOUT_MINUTES * 60000);

    const pendingReservations = await db
      .collection('reservations')
      .where('status', '==', 'PENDING_PAYMENT')
      .where('createdAt', '<', Timestamp.fromDate(cutoffTime))
      .get();

    const batch = db.batch();
    let count = 0;

    for (const doc of pendingReservations.docs) {
      batch.update(doc.ref, {
        status: 'CANCELLED',
        updatedAt: now
      });
      count++;

      if (count >= 500) {
        await batch.commit();
        count = 0;
      }
    }

    if (count > 0) {
      await batch.commit();
    }

    console.log(`Cleaned up ${pendingReservations.size} pending payment reservations`);
    return;
  });

/**
 * Scheduled: Auto-timeout unconfirmed reservations
 * Runs every hour
 */
export const autoTimeoutReservations = onSchedule("0 * * * *", async (event) => {
    const now = Timestamp.now();
    const cutoffTime = new Date(now.toMillis() - CONFIRMATION_WINDOW_HOURS * 60 * 60 * 1000);

    const unconfirmedReservations = await db
      .collection('reservations')
      .where('status', '==', 'CONFIRMED')
      .where('endTimeUtc', '<', Timestamp.fromDate(cutoffTime))
      .get();

    let disputeCreated = 0;

    for (const doc of unconfirmedReservations.docs) {
      const reservation = doc.data() as Reservation;

      // If neither side confirmed, mark as dispute and lock escrow
      if (!reservation.clientConfirmed && !reservation.earnerConfirmed) {
        await doc.ref.update({
          status: 'IN_DISPUTE',
          updatedAt: now
        });

        // Create dispute
        if (reservation.escrowId) {
          const disputeParams: CreateDisputeParams = {
            userId: reservation.clientUserId,
            targetUserId: reservation.earnerUserId,
            type: 'RESERVATION',
            title: 'Meeting outcome timeout',
            description: 'Neither party confirmed meeting outcome within 24 hours',
            reservationId: reservation.reservationId
          };

          const dispute = await createDispute(disputeParams);

          await doc.ref.update({
            disputeId: dispute.disputeId,
            updatedAt: now
          });

          disputeCreated++;
        }
      }
    }

    console.log(`Auto-timeout: created ${disputeCreated} disputes for unconfirmed reservations`);
    return;
  });

/**
 * Scheduled: Send meeting reminders
 * Runs every hour
 */
export const sendMeetingReminders = onSchedule("0 * * * *", async (event) => {
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in1Hour = new Date(now.getTime() + 60 * 60 * 1000);

    // Find meetings starting in 24 hours
    const upcomingReservations24h = await db
      .collection('reservations')
      .where('status', '==', 'CONFIRMED')
      .where('startTimeUtc', '>=', Timestamp.fromDate(now))
      .where('startTimeUtc', '<=', Timestamp.fromDate(in24Hours))
      .get();

    for (const doc of upcomingReservations24h.docs) {
      const reservation = doc.data() as Reservation;
      const startTime = reservation.startTimeUtc.toDate();

      // Send 24h reminder to both parties
      await sendNotification({
        userId: reservation.earnerUserId,
        type: 'RESERVATION_REMINDER',
        title: 'Meeting Tomorrow',
        body: `You have a meeting tomorrow at ${startTime.toLocaleString()}`,
        data: { reservationId: reservation.reservationId },
        deepLink: `reservations/${reservation.reservationId}`
      });

      await sendNotification({
        userId: reservation.clientUserId,
        type: 'RESERVATION_REMINDER',
        title: 'Meeting Tomorrow',
        body: `Your meeting is tomorrow at ${startTime.toLocaleString()}`,
        data: { reservationId: reservation.reservationId },
        deepLink: `reservations/${reservation.reservationId}`
      });
    }

    // Find meetings starting in 1 hour
    const upcomingReservations1h = await db
      .collection('reservations')
      .where('status', '==', 'CONFIRMED')
      .where('startTimeUtc', '>=', Timestamp.fromDate(now))
      .where('startTimeUtc', '<=', Timestamp.fromDate(in1Hour))
      .get();

    for (const doc of upcomingReservations1h.docs) {
      const reservation = doc.data() as Reservation;
      const startTime = reservation.startTimeUtc.toDate();

      // Send 1h reminder to both parties
      await sendNotification({
        userId: reservation.earnerUserId,
        type: 'RESERVATION_REMINDER',
        title: 'Meeting in 1 Hour',
        body: `Your meeting starts in 1 hour at ${startTime.toLocaleString()}`,
        data: { reservationId: reservation.reservationId },
        deepLink: `reservations/${reservation.reservationId}`
      });

      await sendNotification({
        userId: reservation.clientUserId,
        type: 'RESERVATION_REMINDER',
        title: 'Meeting in 1 Hour',
        body: `Your meeting starts in 1 hour at ${startTime.toLocaleString()}`,
        data: { reservationId: reservation.reservationId },
        deepLink: `reservations/${reservation.reservationId}`
      });
    }

    console.log(`Sent reminders for ${upcomingReservations24h.size + upcomingReservations1h.size} meetings`);
    return;
  });




























