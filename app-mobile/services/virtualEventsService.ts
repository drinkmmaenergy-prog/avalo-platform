/**
 * PACK 118 — Virtual Events Service
 * 
 * Mobile service layer for virtual events / live classes
 * Token-Only | Zero NSFW | Full Safety
 */

import { functions, db as firestore } from '../lib/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

// ============================================================================
// TYPES (matching backend)
// ============================================================================

export enum VirtualEventType {
  GROUP_FITNESS = 'GROUP_FITNESS',
  YOGA_CLASS = 'YOGA_CLASS',
  MEDITATION_SESSION = 'MEDITATION_SESSION',
  WELLNESS_WORKSHOP = 'WELLNESS_WORKSHOP',
  LANGUAGE_CLASS = 'LANGUAGE_CLASS',
  COOKING_CLASS = 'COOKING_CLASS',
  EDUCATIONAL_WORKSHOP = 'EDUCATIONAL_WORKSHOP',
  PROFESSIONAL_TRAINING = 'PROFESSIONAL_TRAINING',
  ART_CLASS = 'ART_CLASS',
  MUSIC_LESSON = 'MUSIC_LESSON',
  CREATIVE_WORKSHOP = 'CREATIVE_WORKSHOP',
  BUSINESS_COACHING = 'BUSINESS_COACHING',
  CAREER_COACHING = 'CAREER_COACHING',
  PRODUCTIVITY_SESSION = 'PRODUCTIVITY_SESSION',
  GROUP_DISCUSSION = 'GROUP_DISCUSSION',
  COMMUNITY_MEETUP = 'COMMUNITY_MEETUP',
  NETWORKING_EVENT = 'NETWORKING_EVENT',
}

export enum VirtualEventStatus {
  UPCOMING = 'UPCOMING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum AttendeeStatus {
  ENROLLED = 'ENROLLED',
  CHECKED_IN = 'CHECKED_IN',
  JOINED = 'JOINED',
  REFUNDED = 'REFUNDED',
}

export interface VirtualEvent {
  eventId: string;
  hostUserId: string;
  hostName: string;
  hostAvatar?: string;
  
  title: string;
  description: string;
  type: VirtualEventType;
  
  priceTokens: number;
  
  maxParticipants: number;
  currentParticipants: number;
  
  startTime: Timestamp;
  endTime: Timestamp;
  waitingRoomOpenAt: Timestamp;
  
  status: VirtualEventStatus;
  nsfwLevel: 'SAFE';
  
  recordingEnabled: boolean;
  recordingUrl?: string | null;
  
  assistants: string[];
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  tags?: string[];
  region?: string;
}

export interface VirtualEventAttendee {
  attendeeId: string;
  eventId: string;
  eventTitle: string;
  eventStartTime: Timestamp;
  
  userId: string;
  userName: string;
  userAvatar?: string;
  
  hostUserId: string;
  
  tokensAmount: number;
  platformFee: number;
  hostEarnings: number;
  
  status: AttendeeStatus;
  
  hasRecordingAccess: boolean;
  checkedInAt?: Timestamp | null;
  joinedLiveAt?: Timestamp | null;
  
  enrolledAt: Timestamp;
  refundedAt?: Timestamp | null;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Create virtual event
 */
export async function createVirtualEvent(data: {
  title: string;
  description: string;
  type: VirtualEventType;
  priceTokens: number;
  maxParticipants: number;
  startTime: string;
  endTime: string;
  recordingEnabled?: boolean;
  tags?: string[];
  region?: string;
}): Promise<{ eventId: string }> {
  const createEvent = httpsCallable(functions, 'pack118_createEvent');
  const result = await createEvent(data);
  return (result.data as any).data;
}

/**
 * Update virtual event
 */
export async function updateVirtualEvent(data: {
  eventId: string;
  title?: string;
  description?: string;
  priceTokens?: number;
  maxParticipants?: number;
  startTime?: string;
  endTime?: string;
  recordingEnabled?: boolean;
  tags?: string[];
}): Promise<void> {
  const updateEvent = httpsCallable(functions, 'pack118_updateEvent');
  await updateEvent(data);
}

/**
 * Cancel virtual event (with automatic refunds)
 */
export async function cancelVirtualEvent(
  eventId: string,
  reason: string
): Promise<{ refundedCount: number }> {
  const cancelEvent = httpsCallable(functions, 'pack118_cancelEvent');
  const result = await cancelEvent({ eventId, reason });
  return (result.data as any).data;
}

/**
 * Join/enroll in virtual event
 */
export async function joinVirtualEvent(
  eventId: string
): Promise<{ attendee: VirtualEventAttendee; event: VirtualEvent }> {
  const joinEvent = httpsCallable(functions, 'pack118_joinEvent');
  const result = await joinEvent({ eventId });
  return (result.data as any).data;
}

/**
 * Leave virtual event (NO REFUND)
 */
export async function leaveVirtualEvent(eventId: string): Promise<void> {
  const leaveEvent = httpsCallable(functions, 'pack118_leaveEvent');
  await leaveEvent({ eventId });
}

/**
 * Check in to waiting room
 */
export async function checkInToEvent(eventId: string): Promise<void> {
  const checkIn = httpsCallable(functions, 'pack118_checkInToEvent');
  await checkIn({ eventId });
}

/**
 * List virtual events by region (time-sorted only)
 */
export async function listVirtualEventsByRegion(params?: {
  region?: string;
  limit?: number;
}): Promise<VirtualEvent[]> {
  const listEvents = httpsCallable(functions, 'pack118_listEventsByRegion');
  const result = await listEvents(params || {});
  return (result.data as any).data.events;
}

/**
 * Get event details
 */
export async function getVirtualEventDetails(
  eventId: string
): Promise<{
  event: VirtualEvent;
  isEnrolled: boolean;
  attendee: VirtualEventAttendee | null;
}> {
  const getDetails = httpsCallable(functions, 'pack118_getEventDetails');
  const result = await getDetails({ eventId });
  return (result.data as any).data;
}

/**
 * Get my events
 */
export async function getMyVirtualEvents(params?: {
  status?: 'UPCOMING' | 'COMPLETED';
  limit?: number;
}): Promise<VirtualEvent[]> {
  const getMyEvents = httpsCallable(functions, 'pack118_getMyEvents');
  const result = await getMyEvents(params || {});
  return (result.data as any).data.events;
}

// ============================================================================
// MODERATOR FUNCTIONS
// ============================================================================

/**
 * Add assistant/co-host
 */
export async function addAssistant(
  eventId: string,
  assistantUserId: string
): Promise<void> {
  const addAssistantFn = httpsCallable(functions, 'pack118_addAssistant');
  await addAssistantFn({ eventId, assistantUserId });
}

/**
 * Remove assistant
 */
export async function removeAssistant(
  eventId: string,
  assistantUserId: string
): Promise<void> {
  const removeAssistantFn = httpsCallable(functions, 'pack118_removeAssistant');
  await removeAssistantFn({ eventId, assistantUserId });
}

/**
 * Start live session
 */
export async function startLiveSession(eventId: string): Promise<any> {
  const startSession = httpsCallable(functions, 'pack118_startLiveSession');
  const result = await startSession({ eventId });
  return (result.data as any).data;
}

/**
 * End live session
 */
export async function endLiveSession(eventId: string): Promise<void> {
  const endSession = httpsCallable(functions, 'pack118_endLiveSession');
  await endSession({ eventId });
}

/**
 * Perform moderator action
 */
export async function performModeratorAction(params: {
  eventId: string;
  action: 'MUTE_USER' | 'UNMUTE_USER' | 'REMOVE_USER' | 'BAN_USER' | 'END_SESSION';
  targetUserId?: string;
  reason?: string;
}): Promise<void> {
  const moderatorAction = httpsCallable(functions, 'pack118_moderatorAction');
  await moderatorAction(params);
}

/**
 * Join live session
 */
export async function joinLiveSession(
  eventId: string
): Promise<{ roomId: string; signalingChannelId: string }> {
  const joinSession = httpsCallable(functions, 'pack118_joinLiveSession');
  const result = await joinSession({ eventId });
  return (result.data as any).data;
}

/**
 * Leave live session
 */
export async function leaveLiveSession(eventId: string): Promise<void> {
  const leaveSession = httpsCallable(functions, 'pack118_leaveLiveSession');
  await leaveSession({ eventId });
}

/**
 * Get live session state
 */
export async function getLiveSessionState(eventId: string): Promise<any> {
  const getState = httpsCallable(functions, 'pack118_getLiveSessionState');
  const result = await getState({ eventId });
  return (result.data as any).data;
}

// ============================================================================
// RECORDING FUNCTIONS
// ============================================================================

/**
 * Get recording access
 */
export async function getRecordingAccess(
  eventId: string
): Promise<{ recordingUrl: string; expiresAt: Timestamp }> {
  const getAccess = httpsCallable(functions, 'pack118_getRecordingAccess');
  const result = await getAccess({ eventId });
  return (result.data as any).data;
}

// ============================================================================
// REAL-TIME SUBSCRIPTIONS
// ============================================================================

/**
 * Subscribe to event updates
 */
export function subscribeToEvent(
  eventId: string,
  callback: (event: VirtualEvent | null) => void
): () => void {
  const eventRef = doc(firestore, 'virtual_events', eventId);
  return onSnapshot(eventRef, (snapshot) => {
    if (snapshot.exists()) {
      callback({ ...snapshot.data(), eventId } as VirtualEvent);
    } else {
      callback(null);
    }
  });
}

/**
 * Subscribe to live session state
 */
export function subscribeToLiveSession(
  eventId: string,
  callback: (session: any) => void
): () => void {
  const sessionRef = doc(firestore, 'live_sessions', eventId);
  return onSnapshot(sessionRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data());
    } else {
      callback(null);
    }
  });
}

/**
 * Subscribe to my attendance
 */
export function subscribeToMyAttendance(
  eventId: string,
  userId: string,
  callback: (attendee: VirtualEventAttendee | null) => void
): () => void {
  const q = query(
    collection(firestore, 'virtual_event_attendees'),
    where('eventId', '==', eventId),
    where('userId', '==', userId),
    limit(1)
  );
  
  return onSnapshot(q, (snapshot) => {
    if (!snapshot.empty) {
      callback(snapshot.docs[0].data() as VirtualEventAttendee);
    } else {
      callback(null);
    }
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format event time
 */
export function formatEventTime(timestamp: Timestamp): string {
  const date = timestamp.toDate();
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Get time until event starts
 */
export function getTimeUntilEvent(startTime: Timestamp): string {
  const now = Date.now();
  const start = startTime.toMillis();
  const diffMs = start - now;
  
  if (diffMs < 0) return 'Started';
  
  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  if (diffMinutes < 60) return `Starts in ${diffMinutes} min`;
  
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Starts in ${diffHours} hr`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `Starts in ${diffDays} days`;
}

/**
 * Get event type label
 */
export function getEventTypeLabel(type: VirtualEventType): string {
  const labels: Record<VirtualEventType, string> = {
    [VirtualEventType.GROUP_FITNESS]: 'Group Fitness',
    [VirtualEventType.YOGA_CLASS]: 'Yoga Class',
    [VirtualEventType.MEDITATION_SESSION]: 'Meditation',
    [VirtualEventType.WELLNESS_WORKSHOP]: 'Wellness Workshop',
    [VirtualEventType.LANGUAGE_CLASS]: 'Language Class',
    [VirtualEventType.COOKING_CLASS]: 'Cooking Class',
    [VirtualEventType.EDUCATIONAL_WORKSHOP]: 'Educational Workshop',
    [VirtualEventType.PROFESSIONAL_TRAINING]: 'Professional Training',
    [VirtualEventType.ART_CLASS]: 'Art Class',
    [VirtualEventType.MUSIC_LESSON]: 'Music Lesson',
    [VirtualEventType.CREATIVE_WORKSHOP]: 'Creative Workshop',
    [VirtualEventType.BUSINESS_COACHING]: 'Business Coaching',
    [VirtualEventType.CAREER_COACHING]: 'Career Coaching',
    [VirtualEventType.PRODUCTIVITY_SESSION]: 'Productivity Session',
    [VirtualEventType.GROUP_DISCUSSION]: 'Group Discussion',
    [VirtualEventType.COMMUNITY_MEETUP]: 'Community Meetup',
    [VirtualEventType.NETWORKING_EVENT]: 'Networking Event',
  };
  return labels[type] || type;
}

/**
 * Check if waiting room is open
 */
export function isWaitingRoomOpen(event: VirtualEvent): boolean {
  const now = Date.now();
  const openTime = event.waitingRoomOpenAt.toMillis();
  const startTime = event.startTime.toMillis();
  return now >= openTime && now < startTime;
}

/**
 * Check if event is live
 */
export function isEventLive(event: VirtualEvent): boolean {
  return event.status === VirtualEventStatus.IN_PROGRESS;
}

/**
 * Check if can join
 */
export function canJoinEvent(event: VirtualEvent): boolean {
  if (event.status !== VirtualEventStatus.UPCOMING) return false;
  if (event.currentParticipants >= event.maxParticipants) return false;
  
  const now = Date.now();
  const startTime = event.startTime.toMillis();
  const minutesUntilStart = (startTime - now) / (60 * 1000);
  
  return minutesUntilStart >= 5;
}