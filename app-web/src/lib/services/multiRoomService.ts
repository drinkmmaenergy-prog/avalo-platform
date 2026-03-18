"use client";

/**
 * =====================================================
 * MULTI-ROOM SERVICE — Web Client for Multi-Room Chat
 * =====================================================
 *
 * Client-side service for multi-room chat features.
 * Follows chatService.ts pattern: Cloud Function calls + Firestore listeners.
 *
 * Surfaces:
 * - Create, open, join, close rooms
 * - Send messages, priority messages, tips
 * - Reload word budget
 * - Request guaranteed replies
 * - Real-time subscriptions for room, messages, participants
 *
 * Uses multi_rooms Firestore collection (NOT chats collection).
 *
 * @module services/multiRoomService
 * @version 1.0.0
 */

import { requireDb, requireFunctions } from '../firebase';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  Timestamp,
  Unsubscribe,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

// ============================================================================
// TYPES
// ============================================================================

export type RoomState = 'OPEN' | 'ACTIVE' | 'CLOSED';
export type ParticipantState = 'WAITING' | 'ACTIVE' | 'LEFT' | 'KICKED' | 'BANNED';
export type PriorityTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'DIAMOND';

export interface MultiRoom {
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
  createdAt: Timestamp;
  openedAt: Timestamp | null;
  closedAt: Timestamp | null;
  closedReason: 'earner_closed' | 'system_expired' | null;
}

export interface RoomMessage {
  messageId: string;
  roomId: string;
  senderId: string;
  senderDisplayName: string;
  text: string;
  wordCount: number;
  isEarnerMessage: boolean;
  isPriority: boolean;
  priorityTier: PriorityTier | null;
  priorityTokensPaid: number;
  pinExpiresAt: Timestamp | null;
  earnerMustReply: boolean;
  earnerReplied: boolean;
  createdAt: Timestamp;
}

export interface RoomParticipant {
  userId: string;
  displayName: string;
  wordBudgetRemaining: number;
  wordBudgetTotal: number;
  tokensSpent: number;
  joinedAt: Timestamp;
  isMuted: boolean;
  isBanned: boolean;
  state: ParticipantState;
}

// ============================================================================
// CLOUD FUNCTION CALLS
// ============================================================================

/**
 * Create a new multi-room chat.
 * Calls 'createMultiRoom' Cloud Function.
 */
export async function createRoom(params: {
  title: string;
  entryFeeTokens: number;
  maxParticipants: number | null;
}): Promise<{ roomId: string }> {
  try {
    const fn = httpsCallable<typeof params, { roomId: string }>(
      requireFunctions(),
      'createMultiRoom',
    );
    const result = await fn(params);
    return result.data;
  } catch (error) {
    console.error('[multiRoomService] Error creating room:', error);
    throw error;
  }
}

/**
 * Open a multi-room chat (OPEN → ACTIVE).
 * Calls 'openMultiRoom' Cloud Function.
 */
export async function openRoom(roomId: string): Promise<void> {
  try {
    const fn = httpsCallable<{ roomId: string }, { success: boolean }>(
      requireFunctions(),
      'openMultiRoom',
    );
    await fn({ roomId });
  } catch (error) {
    console.error('[multiRoomService] Error opening room:', error);
    throw error;
  }
}

/**
 * Join a multi-room chat.
 * Calls 'joinMultiRoom' Cloud Function.
 */
export async function joinRoom(roomId: string): Promise<{ wordBudget: number; participantCount: number }> {
  try {
    const fn = httpsCallable<{ roomId: string }, { wordBudget: number; participantCount: number }>(
      requireFunctions(),
      'joinMultiRoom',
    );
    const result = await fn({ roomId });
    return result.data;
  } catch (error) {
    console.error('[multiRoomService] Error joining room:', error);
    throw error;
  }
}

/**
 * Send a message in a multi-room chat.
 * Calls 'sendMultiRoomMessage' Cloud Function.
 */
export async function sendMessage(params: {
  roomId: string;
  text: string;
}): Promise<{ messageId: string; wordBudgetRemaining: number }> {
  try {
    const fn = httpsCallable<typeof params, { messageId: string; wordBudgetRemaining: number }>(
      requireFunctions(),
      'sendMultiRoomMessage',
    );
    const result = await fn(params);
    return result.data;
  } catch (error) {
    console.error('[multiRoomService] Error sending message:', error);
    throw error;
  }
}

/**
 * Reload word budget by purchasing additional tokens.
 * Calls 'reloadWordBudget' Cloud Function.
 */
export async function reloadBudget(params: {
  roomId: string;
  reloadTokens: number;
}): Promise<{ newWordBudget: number }> {
  try {
    const fn = httpsCallable<typeof params, { newWordBudget: number }>(
      requireFunctions(),
      'reloadWordBudget',
    );
    const result = await fn(params);
    return result.data;
  } catch (error) {
    console.error('[multiRoomService] Error reloading budget:', error);
    throw error;
  }
}

/**
 * Send a priority message (pinned highlighted message).
 * Calls 'sendPriorityMessage' Cloud Function.
 */
export async function sendPriorityMessage(params: {
  roomId: string;
  text: string;
  tierName: PriorityTier;
}): Promise<{ messageId: string }> {
  try {
    const fn = httpsCallable<typeof params, { messageId: string; pinExpiresAt: number }>(
      requireFunctions(),
      'sendPriorityMessage',
    );
    const result = await fn(params);
    return { messageId: result.data.messageId };
  } catch (error) {
    console.error('[multiRoomService] Error sending priority message:', error);
    throw error;
  }
}

/**
 * Request a guaranteed reply from the earner.
 * Calls 'requestGuaranteedReply' Cloud Function.
 */
export async function requestGuaranteedReply(params: {
  roomId: string;
  text: string;
  tokensOffered: number;
}): Promise<{ requestId: string }> {
  try {
    const fn = httpsCallable<typeof params, { requestId: string }>(
      requireFunctions(),
      'requestGuaranteedReply',
    );
    const result = await fn(params);
    return result.data;
  } catch (error) {
    console.error('[multiRoomService] Error requesting guaranteed reply:', error);
    throw error;
  }
}

/**
 * Respond to a guaranteed reply request (earner only).
 * Calls 'respondToGuaranteedRequest' Cloud Function.
 */
export async function respondToGuaranteedRequest(params: {
  roomId: string;
  requestId: string;
  accept: boolean;
}): Promise<{ success: boolean }> {
  try {
    const fn = httpsCallable<typeof params, { success: boolean }>(
      requireFunctions(),
      'respondToGuaranteedRequest',
    );
    const result = await fn(params);
    return result.data;
  } catch (error) {
    console.error('[multiRoomService] Error responding to guaranteed request:', error);
    throw error;
  }
}

/**
 * Send a tip to the earner.
 * Calls 'sendTip' Cloud Function.
 */
export async function sendTip(params: {
  roomId: string;
  tokens: number;
}): Promise<void> {
  try {
    const fn = httpsCallable<typeof params, { success: boolean }>(
      requireFunctions(),
      'sendTip',
    );
    await fn(params);
  } catch (error) {
    console.error('[multiRoomService] Error sending tip:', error);
    throw error;
  }
}

/**
 * Moderate a participant in the room (earner only).
 * Calls 'moderateParticipant' Cloud Function.
 */
export async function moderateParticipant(params: {
  roomId: string;
  targetUserId: string;
  action: 'MUTE' | 'UNMUTE' | 'KICK' | 'BAN';
}): Promise<{ success: boolean }> {
  try {
    const fn = httpsCallable<typeof params, { success: boolean }>(
      requireFunctions(),
      'moderateParticipant',
    );
    const result = await fn(params);
    return result.data;
  } catch (error) {
    console.error('[multiRoomService] Error moderating participant:', error);
    throw error;
  }
}

/**
 * Close a multi-room chat.
 * Calls 'closeMultiRoom' Cloud Function.
 */
export async function closeRoom(roomId: string): Promise<{ earnerEarned: number }> {
  try {
    const fn = httpsCallable<{ roomId: string }, { earnerEarned: number; totalParticipants: number }>(
      requireFunctions(),
      'closeMultiRoom',
    );
    const result = await fn({ roomId });
    return { earnerEarned: result.data.earnerEarned };
  } catch (error) {
    console.error('[multiRoomService] Error closing room:', error);
    throw error;
  }
}

// ============================================================================
// REAL-TIME FIRESTORE SUBSCRIPTIONS
// ============================================================================

/**
 * Subscribe to real-time updates for a room document.
 * Provides room state, participant count, earnings, etc.
 */
export function subscribeToRoom(
  roomId: string,
  callback: (room: MultiRoom) => void,
): Unsubscribe {
  const roomDocRef = doc(requireDb(), 'multi_rooms', roomId);

  return onSnapshot(roomDocRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data() as MultiRoom;
      callback(data);
    }
  }, (error) => {
    console.error('[multiRoomService] Room subscription error:', error);
  });
}

/**
 * Subscribe to real-time updates for room messages.
 * Ordered by createdAt ascending, limited to 200 messages.
 */
export function subscribeToMessages(
  roomId: string,
  callback: (messages: RoomMessage[]) => void,
): Unsubscribe {
  const messagesRef = collection(requireDb(), 'multi_rooms', roomId, 'messages');
  const q = query(
    messagesRef,
    orderBy('createdAt', 'asc'),
    limit(200),
  );

  return onSnapshot(q, (snapshot) => {
    const messages: RoomMessage[] = snapshot.docs.map((docSnap) => ({
      ...(docSnap.data() as RoomMessage),
    }));
    callback(messages);
  }, (error) => {
    console.error('[multiRoomService] Messages subscription error:', error);
  });
}

/**
 * Subscribe to real-time updates for room participants.
 * Returns all participants regardless of state.
 */
export function subscribeToParticipants(
  roomId: string,
  callback: (participants: RoomParticipant[]) => void,
): Unsubscribe {
  const participantsRef = collection(requireDb(), 'multi_rooms', roomId, 'participants');

  return onSnapshot(participantsRef, (snapshot) => {
    const participants: RoomParticipant[] = snapshot.docs.map((docSnap) => ({
      ...(docSnap.data() as RoomParticipant),
    }));
    callback(participants);
  }, (error) => {
    console.error('[multiRoomService] Participants subscription error:', error);
  });
}

/**
 * Subscribe to priority messages (pinned messages) for a room.
 * Only returns messages with isPriority = true, ordered by creation.
 */
export function subscribeToPriorityMessages(
  roomId: string,
  callback: (messages: RoomMessage[]) => void,
): Unsubscribe {
  const priorityRef = collection(requireDb(), 'multi_rooms', roomId, 'priority_queue');
  const q = query(
    priorityRef,
    orderBy('createdAt', 'desc'),
    limit(20),
  );

  return onSnapshot(q, (snapshot) => {
    const messages: RoomMessage[] = snapshot.docs.map((docSnap) => ({
      ...(docSnap.data() as RoomMessage),
    }));
    callback(messages);
  }, (error) => {
    console.error('[multiRoomService] Priority messages subscription error:', error);
  });
}
