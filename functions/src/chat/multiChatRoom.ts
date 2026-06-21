import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

/**
 * =====================================================
 * MULTI-ROOM CHAT ENGINE — Full Implementation
 * =====================================================
 *
 * Separate monetization surface from 1:1 chat.
 * Uses its own Firestore collection: multi_rooms.
 * Does NOT use canonical-chat-engine.ts logic.
 * Does NOT have refundable escrow (entry fee is non-refundable).
 *
 * Firestore collections:
 *   multi_rooms/{roomId}                          — room document
 *   multi_rooms/{roomId}/participants/{userId}     — participant state
 *   multi_rooms/{roomId}/messages/{messageId}      — messages
 *   multi_rooms/{roomId}/priority_queue/{msgId}    — priority messages
 *   multi_rooms/{roomId}/guaranteed_requests/{id}  — guaranteed reply requests
 *
 * Revenue split: 65% earner / 35% Avalo (all surfaces)
 * All splits sourced from MULTI_ROOM_CONFIG — no hardcoded percentages.
 *
 * @module chat/multiChatRoom
 * @version 1.0.0
 */

import { db, serverTimestamp, increment, generateId } from '../init';
import { Timestamp } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { transactTokens } from '../wallet/walletService';
import {
  MULTI_ROOM_CONFIG,
  calculateRoomSplit,
  getEntryWordBudget,
  isValidEntryFee,
  isValidReloadAmount,
  isValidTipAmount,
  isValidGuaranteedReplyOffer,
  isValidPriorityTier,
  isValidCapacity,
  getPriorityTierTokenCost,
  getPriorityTierPinMinutes,
  mustEarnerReply,
  type PriorityTierName,
} from '../config/multiRoomConfig';
import {
  calculatePinExpiry,
  isPinExpired,
} from './priorityReply';

// ============================================================================
// LEGACY INTERFACE (preserved for backward compatibility)
// ============================================================================

export interface MultiChatRoom {
  id: string;
  earnerId: string;
  entryFeeTokens: number;
  maxParticipants: number;
  participants: string[];
  createdAt: number;
}

// ============================================================================
// ERROR CLASS
// ============================================================================

class HttpsError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'HttpsError';
  }
}

// ============================================================================
// LOGGER
// ============================================================================

const logger = {
  info: (..._args: any[]) => {},
  warn: (..._args: any[]) => {},
  error: (..._args: any[]) => {},
};

// ============================================================================
// COLLECTION PATHS
// ============================================================================

const MULTI_ROOM_COLLECTIONS = {
  ROOMS: 'multi_rooms',
  PARTICIPANTS: 'participants',
  MESSAGES: 'messages',
  PRIORITY_QUEUE: 'priority_queue',
  GUARANTEED_REQUESTS: 'guaranteed_requests',
} as const;

// ============================================================================
// TYPES
// ============================================================================

export type RoomState = 'OPEN' | 'ACTIVE' | 'CLOSED';
export type ParticipantState = 'WAITING' | 'ACTIVE' | 'LEFT' | 'KICKED' | 'BANNED';
export type ClosedReason = 'earner_closed' | 'system_expired' | null;
export type ModerateAction = 'MUTE' | 'UNMUTE' | 'KICK' | 'BAN';
export type GuaranteedRequestState = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'COMPLETED' | 'REFUNDED' | 'EXPIRED';

export interface RoomDocument {
  roomId: string;
  earnerId: string;
  earnerDisplayName: string;
  title: string;
  entryFeeTokens: number;
  maxParticipants: number | null;
  state: RoomState;
  participantCount: number;
  waitlistCount: number;
  totalTokensCollected: number;
  earnerEarned: number;
  avaloEarned: number;
  createdAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
  openedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue | null;
  closedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue | null;
  closedReason: ClosedReason;
}

export interface ParticipantDocument {
  userId: string;
  displayName: string;
  wordBudgetRemaining: number;
  wordBudgetTotal: number;
  tokensSpent: number;
  joinedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
  isMuted: boolean;
  isBanned: boolean;
  state: ParticipantState;
}

export interface MessageDocument {
  messageId: string;
  roomId: string;
  senderId: string;
  senderDisplayName: string;
  text: string;
  wordCount: number;
  isEarnerMessage: boolean;
  isPriority: boolean;
  priorityTier: PriorityTierName | null;
  priorityTokensPaid: number;
  pinExpiresAt: FirebaseFirestore.Timestamp | null;
  earnerMustReply: boolean;
  earnerReplied: boolean;
  createdAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
}

export interface GuaranteedRequestDocument {
  requestId: string;
  roomId: string;
  userId: string;
  userDisplayName: string;
  text: string;
  tokensOffered: number;
  state: GuaranteedRequestState;
  acceptedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue | null;
  respondedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue | null;
  refundedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue | null;
  deadlineAt: FirebaseFirestore.Timestamp | null;
  createdAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
}

// ============================================================================
// WORD COUNTING (same logic as canonical engine: exclude URLs and emojis)
// ============================================================================

const URL_REGEX = /https?:\/\/[^\s]+/gi;
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{FE0F}]/gu;

/**
 * Count billable words in a message.
 * Excludes URLs and emojis from the word count.
 */
function countWords(text: string): number {
  let cleaned = text.replace(URL_REGEX, '');
  cleaned = cleaned.replace(EMOJI_REGEX, '');
  cleaned = cleaned.trim();
  if (cleaned.length === 0) return 0;
  return cleaned.split(/\s+/).filter((w) => w.length > 0).length;
}

// ============================================================================
// HELPERS
// ============================================================================

function roomRef(roomId: string) {
  return db.collection(MULTI_ROOM_COLLECTIONS.ROOMS).doc(roomId);
}

function participantRef(roomId: string, userId: string) {
  return db
    .collection(MULTI_ROOM_COLLECTIONS.ROOMS)
    .doc(roomId)
    .collection(MULTI_ROOM_COLLECTIONS.PARTICIPANTS)
    .doc(userId);
}

function messagesCol(roomId: string) {
  return db
    .collection(MULTI_ROOM_COLLECTIONS.ROOMS)
    .doc(roomId)
    .collection(MULTI_ROOM_COLLECTIONS.MESSAGES);
}

function priorityQueueCol(roomId: string) {
  return db
    .collection(MULTI_ROOM_COLLECTIONS.ROOMS)
    .doc(roomId)
    .collection(MULTI_ROOM_COLLECTIONS.PRIORITY_QUEUE);
}

function guaranteedRequestsCol(roomId: string) {
  return db
    .collection(MULTI_ROOM_COLLECTIONS.ROOMS)
    .doc(roomId)
    .collection(MULTI_ROOM_COLLECTIONS.GUARANTEED_REQUESTS);
}

function guaranteedRequestRef(roomId: string, requestId: string) {
  return db
    .collection(MULTI_ROOM_COLLECTIONS.ROOMS)
    .doc(roomId)
    .collection(MULTI_ROOM_COLLECTIONS.GUARANTEED_REQUESTS)
    .doc(requestId);
}

/**
 * Validate that the calling user is authenticated.
 */
function requireAuth(uid: string | undefined): string {
  if (!uid || typeof uid !== 'string' || uid.trim().length === 0) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  return uid;
}

/**
 * Load room document and validate it exists.
 */
async function loadRoom(roomId: string): Promise<RoomDocument> {
  const snap = await roomRef(roomId).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `Room ${roomId} not found`);
  }
  return snap.data() as RoomDocument;
}

/**
 * Load participant document.
 */
async function loadParticipant(roomId: string, userId: string): Promise<ParticipantDocument | null> {
  const snap = await participantRef(roomId, userId).get();
  if (!snap.exists) return null;
  return snap.data() as ParticipantDocument;
}

/**
 * Get user display name from users collection.
 */
async function getUserDisplayName(userId: string): Promise<string> {
  const snap = await db.collection('users').doc(userId).get();
  if (!snap.exists) return 'Anonymous';
  const data = snap.data() as { displayName?: string; name?: string };
  return data.displayName || data.name || 'Anonymous';
}

/**
 * Validate earner has earn_on = true.
 */
async function validateEarnerStatus(userId: string): Promise<void> {
  const snap = await db.collection('users').doc(userId).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'User not found');
  }
  const data = snap.data() as Record<string, unknown>;
  if (!data.earn_on) {
    throw new HttpsError('permission-denied', 'User must have earning enabled to create rooms');
  }
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * Create a new multi-room chat.
 * Only earners (earn_on = true) can create rooms.
 * Room starts in OPEN state.
 */
export async function createMultiRoom(
  data: { title: string; entryFeeTokens: number; maxParticipants: number | null },
  context: { auth?: { uid: string } },
): Promise<{ roomId: string }> {
  const uid = requireAuth(context.auth?.uid);

  // Validate earner status
  await validateEarnerStatus(uid);

  const { title, entryFeeTokens, maxParticipants } = data;

  // Validate title
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Title is required');
  }

  // Validate entry fee
  if (!isValidEntryFee(entryFeeTokens)) {
    throw new HttpsError(
      'invalid-argument',
      `Entry fee must be between ${MULTI_ROOM_CONFIG.ENTRY.MIN_TOKENS} and ${MULTI_ROOM_CONFIG.ENTRY.MAX_TOKENS} tokens`,
    );
  }

  // Validate capacity
  const capacity = maxParticipants ?? MULTI_ROOM_CONFIG.CAPACITY.DEFAULT;
  if (maxParticipants !== null && !isValidCapacity(maxParticipants)) {
    throw new HttpsError(
      'invalid-argument',
      `Max participants must be one of: ${MULTI_ROOM_CONFIG.CAPACITY.OPTIONS.join(', ')}`,
    );
  }

  const roomId = generateId();
  const earnerDisplayName = await getUserDisplayName(uid);

  const roomDoc: RoomDocument = {
    roomId,
    earnerId: uid,
    earnerDisplayName,
    title: title.trim(),
    entryFeeTokens,
    maxParticipants: maxParticipants,
    state: 'OPEN',
    participantCount: 0,
    waitlistCount: 0,
    totalTokensCollected: 0,
    earnerEarned: 0,
    avaloEarned: 0,
    createdAt: serverTimestamp(),
    openedAt: null,
    closedAt: null,
    closedReason: null,
  };

  await roomRef(roomId).set(roomDoc);

  logger.info(`Multi-room ${roomId} created by earner ${uid}`);
  return { roomId };
}

/**
 * Open a multi-room chat (OPEN → ACTIVE).
 * Only the earner who created the room can open it.
 */
export async function openMultiRoom(
  data: { roomId: string },
  context: { auth?: { uid: string } },
): Promise<{ success: boolean }> {
  const uid = requireAuth(context.auth?.uid);
  const { roomId } = data;

  if (!roomId) {
    throw new HttpsError('invalid-argument', 'roomId is required');
  }

  const room = await loadRoom(roomId);

  if (room.earnerId !== uid) {
    throw new HttpsError('permission-denied', 'Only the room earner can open the room');
  }

  if (room.state !== 'OPEN') {
    throw new HttpsError('failed-precondition', `Room is ${room.state}, expected OPEN`);
  }

  await roomRef(roomId).update({
    state: 'ACTIVE',
    openedAt: serverTimestamp(),
  });

  logger.info(`Multi-room ${roomId} opened by earner ${uid}`);
  return { success: true };
}

/**
 * Join a multi-room chat.
 * Deducts entry fee from user wallet, splits 65/35.
 * Creates participant document with word budget.
 * If room is full, adds user to waitlist.
 */
export async function joinMultiRoom(
  data: { roomId: string },
  context: { auth?: { uid: string } },
): Promise<{ wordBudget: number; participantCount: number }> {
  const uid = requireAuth(context.auth?.uid);
  const { roomId } = data;

  if (!roomId) {
    throw new HttpsError('invalid-argument', 'roomId is required');
  }

  const room = await loadRoom(roomId);

  if (room.state !== 'ACTIVE') {
    throw new HttpsError('failed-precondition', `Room is ${room.state}, must be ACTIVE to join`);
  }

  // Check if user is already a participant
  const existingParticipant = await loadParticipant(roomId, uid);
  if (existingParticipant && existingParticipant.state === 'ACTIVE') {
    throw new HttpsError('already-exists', 'Already a participant in this room');
  }
  if (existingParticipant && existingParticipant.state === 'BANNED') {
    throw new HttpsError('permission-denied', 'You have been banned from this room');
  }

  // Check if earner is trying to join own room
  if (room.earnerId === uid) {
    throw new HttpsError('invalid-argument', 'Earner cannot join their own room as participant');
  }

  // Check capacity
  const isFull =
    room.maxParticipants !== null && room.participantCount >= room.maxParticipants;

  const wordBudget = getEntryWordBudget(room.entryFeeTokens);
  const split = calculateRoomSplit(room.entryFeeTokens, 'ENTRY');
  const displayName = await getUserDisplayName(uid);

  // Deduct entry fee from user wallet, split to earner + platform
  const idempotencyKey = `MULTI_ROOM_ENTRY:${uid}:${roomId}:${Date.now()}`;
  await transactTokens({
    type: 'GIFT', // Using GIFT ledger type for multi-room entry
    actorId: uid,
    counterpartyId: room.earnerId,
    amountTokens: room.entryFeeTokens,
    split: {
      creatorTokens: split.earnerTokens,
      avaloTokens: split.avaloTokens,
    },
    idempotencyKey,
    metadata: {
      surface: 'MULTI_ROOM_ENTRY',
      roomId,
      wordBudget,
    },
  });

  // Determine participant state based on capacity
  const participantState: ParticipantState = isFull ? 'WAITING' : 'ACTIVE';

  const participantDoc: ParticipantDocument = {
    userId: uid,
    displayName,
    wordBudgetRemaining: participantState === 'ACTIVE' ? wordBudget : wordBudget,
    wordBudgetTotal: wordBudget,
    tokensSpent: room.entryFeeTokens,
    joinedAt: serverTimestamp(),
    isMuted: false,
    isBanned: false,
    state: participantState,
  };

  await participantRef(roomId, uid).set(participantDoc);

  // Update room counters
  if (participantState === 'ACTIVE') {
    await roomRef(roomId).update({
      participantCount: FieldValue.increment(1),
      totalTokensCollected: FieldValue.increment(room.entryFeeTokens),
      earnerEarned: FieldValue.increment(split.earnerTokens),
      avaloEarned: FieldValue.increment(split.avaloTokens),
    });
  } else {
    await roomRef(roomId).update({
      waitlistCount: FieldValue.increment(1),
      totalTokensCollected: FieldValue.increment(room.entryFeeTokens),
      earnerEarned: FieldValue.increment(split.earnerTokens),
      avaloEarned: FieldValue.increment(split.avaloTokens),
    });
  }

  // Reload room to get current participant count
  const updatedRoom = await loadRoom(roomId);

  logger.info(
    `User ${uid} joined multi-room ${roomId} as ${participantState}, wordBudget=${wordBudget}`,
  );

  return {
    wordBudget,
    participantCount: updatedRoom.participantCount,
  };
}

/**
 * Send a message in a multi-room chat.
 * Validates word budget and deducts word count.
 * Earner messages are free and not billed.
 */
export async function sendMultiRoomMessage(
  data: { roomId: string; text: string },
  context: { auth?: { uid: string } },
): Promise<{ messageId: string; wordBudgetRemaining: number }> {
  const uid = requireAuth(context.auth?.uid);
  const { roomId, text } = data;

  if (!roomId) {
    throw new HttpsError('invalid-argument', 'roomId is required');
  }
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Message text is required');
  }

  const room = await loadRoom(roomId);

  if (room.state !== 'ACTIVE') {
    throw new HttpsError('failed-precondition', `Room is ${room.state}, must be ACTIVE to send messages`);
  }

  const isEarner = room.earnerId === uid;
  const wordCount = countWords(text);

  let wordBudgetRemaining = 0;

  if (!isEarner) {
    // Validate participant
    const participant = await loadParticipant(roomId, uid);
    if (!participant || participant.state !== 'ACTIVE') {
      throw new HttpsError('permission-denied', 'You are not an active participant in this room');
    }
    if (participant.isMuted) {
      throw new HttpsError('permission-denied', 'You are muted in this room');
    }
    if (participant.isBanned) {
      throw new HttpsError('permission-denied', 'You are banned from this room');
    }

    // Validate word budget
    if (participant.wordBudgetRemaining < wordCount) {
      throw new HttpsError(
        'resource-exhausted',
        `Insufficient word budget: have ${participant.wordBudgetRemaining}, need ${wordCount}. Purchase a reload.`,
      );
    }

    // Deduct words from budget
    const newBudget = participant.wordBudgetRemaining - wordCount;
    await participantRef(roomId, uid).update({
      wordBudgetRemaining: newBudget,
    });

    wordBudgetRemaining = newBudget;
  }

  const messageId = generateId();
  const senderDisplayName = isEarner
    ? room.earnerDisplayName
    : (await loadParticipant(roomId, uid))?.displayName || 'Anonymous';

  const messageDoc: MessageDocument = {
    messageId,
    roomId,
    senderId: uid,
    senderDisplayName,
    text: text.trim(),
    wordCount,
    isEarnerMessage: isEarner,
    isPriority: false,
    priorityTier: null,
    priorityTokensPaid: 0,
    pinExpiresAt: null,
    earnerMustReply: false,
    earnerReplied: false,
    createdAt: serverTimestamp(),
  };

  await messagesCol(roomId).doc(messageId).set(messageDoc);

  logger.info(
    `Message ${messageId} sent in room ${roomId} by ${uid}, words=${wordCount}, isEarner=${isEarner}`,
  );

  return { messageId, wordBudgetRemaining };
}

/**
 * Reload word budget by purchasing additional tokens.
 * Minimum reload: MULTI_ROOM_CONFIG.RELOAD.MIN_TOKENS.
 * Additional words = reloadTokens * WORDS_PER_TOKEN.
 */
export async function reloadWordBudget(
  data: { roomId: string; reloadTokens: number },
  context: { auth?: { uid: string } },
): Promise<{ newWordBudget: number }> {
  const uid = requireAuth(context.auth?.uid);
  const { roomId, reloadTokens } = data;

  if (!roomId) {
    throw new HttpsError('invalid-argument', 'roomId is required');
  }

  if (!isValidReloadAmount(reloadTokens)) {
    throw new HttpsError(
      'invalid-argument',
      `Reload amount must be at least ${MULTI_ROOM_CONFIG.RELOAD.MIN_TOKENS} tokens`,
    );
  }

  const room = await loadRoom(roomId);

  if (room.state !== 'ACTIVE') {
    throw new HttpsError('failed-precondition', `Room is ${room.state}, must be ACTIVE to reload`);
  }

  if (room.earnerId === uid) {
    throw new HttpsError('invalid-argument', 'Earner does not need word budget');
  }

  const participant = await loadParticipant(roomId, uid);
  if (!participant || participant.state !== 'ACTIVE') {
    throw new HttpsError('permission-denied', 'You are not an active participant in this room');
  }

  const additionalWords = reloadTokens * MULTI_ROOM_CONFIG.RELOAD.WORDS_PER_TOKEN;
  const split = calculateRoomSplit(reloadTokens, 'RELOAD');

  // Deduct tokens from user wallet, split to earner + platform
  const idempotencyKey = `MULTI_ROOM_RELOAD:${uid}:${roomId}:${Date.now()}`;
  await transactTokens({
    type: 'GIFT',
    actorId: uid,
    counterpartyId: room.earnerId,
    amountTokens: reloadTokens,
    split: {
      creatorTokens: split.earnerTokens,
      avaloTokens: split.avaloTokens,
    },
    idempotencyKey,
    metadata: {
      surface: 'MULTI_ROOM_RELOAD',
      roomId,
      additionalWords,
    },
  });

  // Add words to participant budget
  const newWordBudget = participant.wordBudgetRemaining + additionalWords;
  await participantRef(roomId, uid).update({
    wordBudgetRemaining: newWordBudget,
    wordBudgetTotal: FieldValue.increment(additionalWords),
    tokensSpent: FieldValue.increment(reloadTokens),
  });

  // Update room counters
  await roomRef(roomId).update({
    totalTokensCollected: FieldValue.increment(reloadTokens),
    earnerEarned: FieldValue.increment(split.earnerTokens),
    avaloEarned: FieldValue.increment(split.avaloTokens),
  });

  logger.info(
    `User ${uid} reloaded ${reloadTokens} tokens in room ${roomId}, +${additionalWords} words`,
  );

  return { newWordBudget };
}

/**
 * Send a priority message (pinned highlighted message).
 * Deducts tier cost from user wallet, splits 65/35.
 * Creates message with pin expiry based on tier.
 * GOLD and DIAMOND require earner response.
 */
export async function sendPriorityMessage(
  data: { roomId: string; text: string; tierName: string },
  context: { auth?: { uid: string } },
): Promise<{ messageId: string; pinExpiresAt: number }> {
  const uid = requireAuth(context.auth?.uid);
  const { roomId, text, tierName } = data;

  if (!roomId) {
    throw new HttpsError('invalid-argument', 'roomId is required');
  }
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Message text is required');
  }
  if (!isValidPriorityTier(tierName)) {
    throw new HttpsError('invalid-argument', `Invalid priority tier: ${tierName}`);
  }

  const room = await loadRoom(roomId);

  if (room.state !== 'ACTIVE') {
    throw new HttpsError('failed-precondition', `Room is ${room.state}, must be ACTIVE`);
  }

  if (room.earnerId === uid) {
    throw new HttpsError('invalid-argument', 'Earner cannot send priority messages to themselves');
  }

  // Validate participant
  const participant = await loadParticipant(roomId, uid);
  if (!participant || participant.state !== 'ACTIVE') {
    throw new HttpsError('permission-denied', 'You are not an active participant in this room');
  }

  const tier = tierName as PriorityTierName;
  const tokenCost = getPriorityTierTokenCost(tier);
  const pinMinutes = getPriorityTierPinMinutes(tier);
  const earnerMustReplyFlag = mustEarnerReply(tier);
  const split = calculateRoomSplit(tokenCost, 'PRIORITY');

  // Deduct tokens from user wallet
  const idempotencyKey = `MULTI_ROOM_PRIORITY:${uid}:${roomId}:${tier}:${Date.now()}`;
  await transactTokens({
    type: 'GIFT',
    actorId: uid,
    counterpartyId: room.earnerId,
    amountTokens: tokenCost,
    split: {
      creatorTokens: split.earnerTokens,
      avaloTokens: split.avaloTokens,
    },
    idempotencyKey,
    metadata: {
      surface: 'MULTI_ROOM_PRIORITY',
      roomId,
      tier,
      pinMinutes,
    },
  });

  const pinExpiresAtTs = calculatePinExpiry(tier);
  const messageId = generateId();
  const wordCount = countWords(text);

  const messageDoc: MessageDocument = {
    messageId,
    roomId,
    senderId: uid,
    senderDisplayName: participant.displayName,
    text: text.trim(),
    wordCount,
    isEarnerMessage: false,
    isPriority: true,
    priorityTier: tier,
    priorityTokensPaid: tokenCost,
    pinExpiresAt: pinExpiresAtTs,
    earnerMustReply: earnerMustReplyFlag,
    earnerReplied: false,
    createdAt: serverTimestamp(),
  };

  // Save to both messages and priority queue
  const batch = db.batch();
  batch.set(messagesCol(roomId).doc(messageId), messageDoc);
  batch.set(priorityQueueCol(roomId).doc(messageId), messageDoc);
  await batch.commit();

  // Update participant and room
  await participantRef(roomId, uid).update({
    tokensSpent: FieldValue.increment(tokenCost),
  });

  await roomRef(roomId).update({
    totalTokensCollected: FieldValue.increment(tokenCost),
    earnerEarned: FieldValue.increment(split.earnerTokens),
    avaloEarned: FieldValue.increment(split.avaloTokens),
  });

  // Deduct words from word budget as well (priority message counts as a message)
  if (participant.wordBudgetRemaining >= wordCount) {
    await participantRef(roomId, uid).update({
      wordBudgetRemaining: FieldValue.increment(-wordCount),
    });
  }

  logger.info(
    `Priority ${tier} message ${messageId} in room ${roomId} by ${uid}, cost=${tokenCost}`,
  );

  return {
    messageId,
    pinExpiresAt: pinExpiresAtTs.toMillis(),
  };
}

/**
 * Request a guaranteed reply from the earner.
 * Tokens are NOT deducted until earner accepts.
 * Creates a pending request document.
 */
export async function requestGuaranteedReply(
  data: { roomId: string; text: string; tokensOffered: number },
  context: { auth?: { uid: string } },
): Promise<{ requestId: string }> {
  const uid = requireAuth(context.auth?.uid);
  const { roomId, text, tokensOffered } = data;

  if (!roomId) {
    throw new HttpsError('invalid-argument', 'roomId is required');
  }
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Message text is required');
  }
  if (!isValidGuaranteedReplyOffer(tokensOffered)) {
    throw new HttpsError(
      'invalid-argument',
      `Guaranteed reply offer must be at least ${MULTI_ROOM_CONFIG.GUARANTEED_REPLY.MIN_TOKENS} tokens`,
    );
  }

  const room = await loadRoom(roomId);

  if (room.state !== 'ACTIVE') {
    throw new HttpsError('failed-precondition', `Room is ${room.state}, must be ACTIVE`);
  }

  if (room.earnerId === uid) {
    throw new HttpsError('invalid-argument', 'Earner cannot request guaranteed reply from themselves');
  }

  // Validate participant
  const participant = await loadParticipant(roomId, uid);
  if (!participant || participant.state !== 'ACTIVE') {
    throw new HttpsError('permission-denied', 'You are not an active participant in this room');
  }

  const requestId = generateId();
  const displayName = participant.displayName;

  const requestDoc: GuaranteedRequestDocument = {
    requestId,
    roomId,
    userId: uid,
    userDisplayName: displayName,
    text: text.trim(),
    tokensOffered,
    state: 'PENDING',
    acceptedAt: null,
    respondedAt: null,
    refundedAt: null,
    deadlineAt: null,
    createdAt: serverTimestamp(),
  };

  await guaranteedRequestsCol(roomId).doc(requestId).set(requestDoc);

  logger.info(
    `Guaranteed reply request ${requestId} in room ${roomId} by ${uid}, offered=${tokensOffered}`,
  );

  return { requestId };
}

/**
 * Respond to a guaranteed reply request (earner only).
 * If accepted: deducts tokens from user, starts 10-min response timer.
 * If declined: request cancelled, no charge.
 */
export async function respondToGuaranteedRequest(
  data: { roomId: string; requestId: string; accept: boolean },
  context: { auth?: { uid: string } },
): Promise<{ success: boolean }> {
  const uid = requireAuth(context.auth?.uid);
  const { roomId, requestId, accept } = data;

  if (!roomId || !requestId) {
    throw new HttpsError('invalid-argument', 'roomId and requestId are required');
  }

  const room = await loadRoom(roomId);

  if (room.earnerId !== uid) {
    throw new HttpsError('permission-denied', 'Only the room earner can respond to guaranteed requests');
  }

  if (room.state !== 'ACTIVE') {
    throw new HttpsError('failed-precondition', `Room is ${room.state}, must be ACTIVE`);
  }

  const requestRef = guaranteedRequestRef(roomId, requestId);
  const requestSnap = await requestRef.get();

  if (!requestSnap.exists) {
    throw new HttpsError('not-found', `Request ${requestId} not found`);
  }

  const request = requestSnap.data() as GuaranteedRequestDocument;

  if (request.state !== 'PENDING') {
    throw new HttpsError('failed-precondition', `Request is ${request.state}, expected PENDING`);
  }

  if (!accept) {
    // Decline — no charge
    await requestRef.update({
      state: 'DECLINED',
    });

    logger.info(`Guaranteed request ${requestId} declined by earner ${uid}`);
    return { success: true };
  }

  // Accept — deduct tokens from user, set deadline
  const split = calculateRoomSplit(request.tokensOffered, 'ENTRY'); // Same 65/35 split
  const deadlineMs = Date.now() + MULTI_ROOM_CONFIG.GUARANTEED_REPLY.EARNER_RESPONSE_WINDOW_MS;
  const deadlineAt = Timestamp.fromMillis(deadlineMs);

  const idempotencyKey = `MULTI_ROOM_GUARANTEED:${request.userId}:${roomId}:${requestId}`;
  await transactTokens({
    type: 'GIFT',
    actorId: request.userId,
    counterpartyId: room.earnerId,
    amountTokens: request.tokensOffered,
    split: {
      creatorTokens: split.earnerTokens,
      avaloTokens: split.avaloTokens,
    },
    idempotencyKey,
    metadata: {
      surface: 'MULTI_ROOM_GUARANTEED_REPLY',
      roomId,
      requestId,
    },
  });

  // Create message document for the guaranteed reply request
  const messageId = generateId();
  const messageDoc: MessageDocument = {
    messageId,
    roomId,
    senderId: request.userId,
    senderDisplayName: request.userDisplayName,
    text: request.text,
    wordCount: countWords(request.text),
    isEarnerMessage: false,
    isPriority: false,
    priorityTier: null,
    priorityTokensPaid: 0,
    pinExpiresAt: null,
    earnerMustReply: true,
    earnerReplied: false,
    createdAt: serverTimestamp(),
  };

  await messagesCol(roomId).doc(messageId).set(messageDoc);

  // Update request state
  await requestRef.update({
    state: 'ACCEPTED',
    acceptedAt: serverTimestamp(),
    deadlineAt,
  });

  // Update participant and room counters
  await participantRef(roomId, request.userId).update({
    tokensSpent: FieldValue.increment(request.tokensOffered),
  });

  await roomRef(roomId).update({
    totalTokensCollected: FieldValue.increment(request.tokensOffered),
    earnerEarned: FieldValue.increment(split.earnerTokens),
    avaloEarned: FieldValue.increment(split.avaloTokens),
  });

  logger.info(
    `Guaranteed request ${requestId} accepted by earner ${uid}, deadline=${deadlineAt.toDate().toISOString()}`,
  );

  return { success: true };
}

/**
 * Check for guaranteed reply timeouts.
 * Runs periodically (every minute via scheduler).
 * Finds accepted guaranteed replies past their deadline.
 * Refunds tokens to user if earner did not respond.
 */
export async function checkGuaranteedReplyTimeout(): Promise<{ refundedCount: number }> {
  const now = Timestamp.now();
  let refundedCount = 0;

  // Query all rooms for accepted guaranteed requests past deadline
  const roomsSnap = await db
    .collection(MULTI_ROOM_COLLECTIONS.ROOMS)
    .where('state', '==', 'ACTIVE')
    .get();

  for (const roomDoc of roomsSnap.docs) {
    const room = roomDoc.data() as RoomDocument;

    const expiredRequests = await guaranteedRequestsCol(room.roomId)
      .where('state', '==', 'ACCEPTED')
      .where('deadlineAt', '<=', now)
      .get();

    for (const reqDoc of expiredRequests.docs) {
      const request = reqDoc.data() as GuaranteedRequestDocument;

      try {
        // Refund tokens to user (100% back)
        const refundIdempotencyKey = `MULTI_ROOM_GUARANTEED_REFUND:${request.userId}:${room.roomId}:${request.requestId}`;

        // For refund, we reverse the transaction: platform sends back to user
        // Since the original split went to earner + platform,
        // the refund must come from earner + platform back to user.
        // However, per business rules, it's a full refund to user.
        // We use a credit transaction to add tokens back to user.
        await transactTokens({
          type: 'CHAT_REFUND',
          actorId: room.earnerId,
          counterpartyId: request.userId,
          amountTokens: request.tokensOffered,
          split: {
            creatorTokens: request.tokensOffered, // Full amount goes back to user (as counterparty)
            avaloTokens: 0,
          },
          idempotencyKey: refundIdempotencyKey,
          metadata: {
            surface: 'MULTI_ROOM_GUARANTEED_REFUND',
            roomId: room.roomId,
            requestId: request.requestId,
            reason: 'earner_timeout',
          },
        });

        // Update request state
        await guaranteedRequestRef(room.roomId, request.requestId).update({
          state: 'REFUNDED',
          refundedAt: serverTimestamp(),
        });

        // Update room counters (reverse the earner/avalo earnings)
        const split = calculateRoomSplit(request.tokensOffered, 'ENTRY');
        await roomRef(room.roomId).update({
          earnerEarned: FieldValue.increment(-split.earnerTokens),
          avaloEarned: FieldValue.increment(-split.avaloTokens),
        });

        refundedCount++;
        logger.info(
          `Refunded guaranteed reply ${request.requestId} in room ${room.roomId} to user ${request.userId}`,
        );
      } catch (err) {
        logger.error(
          `Failed to refund guaranteed reply ${request.requestId}:`,
          err,
        );
      }
    }
  }

  if (refundedCount > 0) {
    logger.info(`Guaranteed reply timeout check: refunded ${refundedCount} requests`);
  }

  return { refundedCount };
}

/**
 * Send a tip to the earner.
 * Minimum tip: MULTI_ROOM_CONFIG.TIPS.MIN_TOKENS.
 * Split: 65/35 (earner/Avalo).
 * No response guarantee with tips.
 */
export async function sendTip(
  data: { roomId: string; tokens: number },
  context: { auth?: { uid: string } },
): Promise<{ success: boolean }> {
  const uid = requireAuth(context.auth?.uid);
  const { roomId, tokens } = data;

  if (!roomId) {
    throw new HttpsError('invalid-argument', 'roomId is required');
  }

  if (!isValidTipAmount(tokens)) {
    throw new HttpsError(
      'invalid-argument',
      `Tip must be at least ${MULTI_ROOM_CONFIG.TIPS.MIN_TOKENS} tokens`,
    );
  }

  const room = await loadRoom(roomId);

  if (room.state !== 'ACTIVE') {
    throw new HttpsError('failed-precondition', `Room is ${room.state}, must be ACTIVE to tip`);
  }

  if (room.earnerId === uid) {
    throw new HttpsError('invalid-argument', 'Earner cannot tip themselves');
  }

  const split = calculateRoomSplit(tokens, 'TIP');

  const idempotencyKey = `MULTI_ROOM_TIP:${uid}:${roomId}:${Date.now()}`;
  await transactTokens({
    type: 'TIP',
    actorId: uid,
    counterpartyId: room.earnerId,
    amountTokens: tokens,
    split: {
      creatorTokens: split.earnerTokens,
      avaloTokens: split.avaloTokens,
    },
    idempotencyKey,
    metadata: {
      surface: 'MULTI_ROOM_TIP',
      roomId,
    },
  });

  // Update room counters
  await roomRef(roomId).update({
    totalTokensCollected: FieldValue.increment(tokens),
    earnerEarned: FieldValue.increment(split.earnerTokens),
    avaloEarned: FieldValue.increment(split.avaloTokens),
  });

  logger.info(`User ${uid} tipped ${tokens} tokens in room ${roomId}`);

  return { success: true };
}

/**
 * Moderate a participant in the room.
 * Only the earner can moderate.
 * Actions: MUTE, UNMUTE, KICK, BAN.
 */
export async function moderateParticipant(
  data: { roomId: string; targetUserId: string; action: ModerateAction },
  context: { auth?: { uid: string } },
): Promise<{ success: boolean }> {
  const uid = requireAuth(context.auth?.uid);
  const { roomId, targetUserId, action } = data;

  if (!roomId || !targetUserId || !action) {
    throw new HttpsError('invalid-argument', 'roomId, targetUserId, and action are required');
  }

  const validActions: ModerateAction[] = ['MUTE', 'UNMUTE', 'KICK', 'BAN'];
  if (!validActions.includes(action)) {
    throw new HttpsError('invalid-argument', `Invalid action: ${action}`);
  }

  const room = await loadRoom(roomId);

  if (room.earnerId !== uid) {
    throw new HttpsError('permission-denied', 'Only the room earner can moderate participants');
  }

  if (room.state === 'CLOSED') {
    throw new HttpsError('failed-precondition', 'Room is CLOSED');
  }

  const participant = await loadParticipant(roomId, targetUserId);
  if (!participant) {
    throw new HttpsError('not-found', `Participant ${targetUserId} not found in room`);
  }

  const updates: Partial<ParticipantDocument> = {};

  switch (action) {
    case 'MUTE':
      updates.isMuted = true;
      break;
    case 'UNMUTE':
      updates.isMuted = false;
      break;
    case 'KICK':
      updates.state = 'KICKED';
      break;
    case 'BAN':
      updates.state = 'BANNED';
      updates.isBanned = true;
      break;
  }

  await participantRef(roomId, targetUserId).update(updates);

  // If kicked or banned, decrement participant count
  if (action === 'KICK' || action === 'BAN') {
    if (participant.state === 'ACTIVE') {
      await roomRef(roomId).update({
        participantCount: FieldValue.increment(-1),
      });
    } else if (participant.state === 'WAITING') {
      await roomRef(roomId).update({
        waitlistCount: FieldValue.increment(-1),
      });
    }
  }

  logger.info(`Earner ${uid} ${action} user ${targetUserId} in room ${roomId}`);

  return { success: true };
}

/**
 * Close a multi-room chat.
 * Only the earner (or system) can close the room.
 * Processes any pending guaranteed replies: refund all pending/accepted.
 * Remaining word budgets are forfeited (non-refundable).
 */
export async function closeMultiRoom(
  data: { roomId: string; reason?: string },
  context: { auth?: { uid: string } },
): Promise<{ earnerEarned: number; totalParticipants: number }> {
  const uid = requireAuth(context.auth?.uid);
  const { roomId, reason } = data;

  if (!roomId) {
    throw new HttpsError('invalid-argument', 'roomId is required');
  }

  const room = await loadRoom(roomId);

  if (room.earnerId !== uid) {
    throw new HttpsError('permission-denied', 'Only the room earner can close the room');
  }

  if (room.state === 'CLOSED') {
    throw new HttpsError('failed-precondition', 'Room is already CLOSED');
  }

  // Process pending guaranteed replies — refund all PENDING and ACCEPTED
  const pendingRequests = await guaranteedRequestsCol(roomId)
    .where('state', 'in', ['PENDING', 'ACCEPTED'])
    .get();

  for (const reqDoc of pendingRequests.docs) {
    const request = reqDoc.data() as GuaranteedRequestDocument;

    if (request.state === 'ACCEPTED') {
      // Accepted but not completed — refund tokens to user
      try {
        const refundIdempotencyKey = `MULTI_ROOM_CLOSE_REFUND:${request.userId}:${roomId}:${request.requestId}`;
        await transactTokens({
          type: 'CHAT_REFUND',
          actorId: room.earnerId,
          counterpartyId: request.userId,
          amountTokens: request.tokensOffered,
          split: {
            creatorTokens: request.tokensOffered,
            avaloTokens: 0,
          },
          idempotencyKey: refundIdempotencyKey,
          metadata: {
            surface: 'MULTI_ROOM_GUARANTEED_REFUND',
            roomId,
            requestId: request.requestId,
            reason: 'room_closed',
          },
        });

        // Reverse room earnings for this request
        const split = calculateRoomSplit(request.tokensOffered, 'ENTRY');
        await roomRef(roomId).update({
          earnerEarned: FieldValue.increment(-split.earnerTokens),
          avaloEarned: FieldValue.increment(-split.avaloTokens),
        });

        logger.info(`Refunded guaranteed reply ${request.requestId} on room close`);
      } catch (err) {
        logger.error(`Failed to refund guaranteed reply ${request.requestId} on close:`, err);
      }
    }

    // Mark request as expired/refunded
    await guaranteedRequestRef(roomId, request.requestId).update({
      state: request.state === 'ACCEPTED' ? 'REFUNDED' : 'EXPIRED',
      refundedAt: request.state === 'ACCEPTED' ? serverTimestamp() : null,
    });
  }

  // Close the room
  const closedReason: ClosedReason = (reason === 'system_expired') ? 'system_expired' : 'earner_closed';

  await roomRef(roomId).update({
    state: 'CLOSED',
    closedAt: serverTimestamp(),
    closedReason,
  });

  // Reload to get final numbers
  const finalRoom = await loadRoom(roomId);

  logger.info(
    `Multi-room ${roomId} closed by ${uid}, reason=${closedReason}, earned=${finalRoom.earnerEarned}`,
  );

  return {
    earnerEarned: finalRoom.earnerEarned,
    totalParticipants: finalRoom.participantCount,
  };
}


