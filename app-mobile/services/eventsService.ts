/**
 * PACK 117: Events Service
 * Mobile service layer for safe in-person events
 * 
 * CRITICAL SAFETY RULES:
 * - SAFE events only (no NSFW, no escort/sexual services)
 * - Token-only payments (65% creator / 35% Avalo)
 * - Background risk screening
 * - Location privacy until confirmed
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

// ============================================================================
// TYPES
// ============================================================================

export enum EventType {
  COMMUNITY_MEETUP = "COMMUNITY_MEETUP",
  FITNESS_WORKSHOP = "FITNESS_WORKSHOP",
  PHOTOGRAPHY_WALK = "PHOTOGRAPHY_WALK",
  COACHING_SESSION = "COACHING_SESSION",
  EDUCATIONAL_CLASS = "EDUCATIONAL_CLASS",
  NETWORKING_EVENT = "NETWORKING_EVENT",
  OUTDOOR_ACTIVITY = "OUTDOOR_ACTIVITY",
  CREATIVE_WORKSHOP = "CREATIVE_WORKSHOP",
}

export enum EventStatus {
  UPCOMING = "UPCOMING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum AttendeeStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  DENIED = "DENIED",
  CANCELLED_BY_USER = "CANCELLED_BY_USER",
  REFUNDED = "REFUNDED",
}

export interface Event {
  eventId: string;
  hostUserId: string;
  hostName: string;
  hostAvatar?: string;
  
  title: string;
  description: string;
  type: EventType;
  
  priceTokens: number;
  
  region: string;
  locationDetails?: {
    address?: string;
    venue?: string;
    latitude?: number;
    longitude?: number;
  };
  
  startTime: { seconds: number; nanoseconds: number };
  endTime: { seconds: number; nanoseconds: number };
  
  capacity?: number;
  attendeesCount: number;
  
  riskLevel: string;
  requiresApproval: boolean;
  
  status: EventStatus;
  isActive: boolean;
  
  createdAt: { seconds: number; nanoseconds: number };
  updatedAt: { seconds: number; nanoseconds: number };
  
  tags: string[];
  previewImageRef?: string;
}

export interface EventAttendee {
  attendeeId: string;
  eventId: string;
  eventTitle: string;
  
  userId: string;
  userName: string;
  userAvatar?: string;
  
  hostUserId: string;
  
  tokensAmount: number;
  platformFee: number;
  creatorEarnings: number;
  
  status: AttendeeStatus;
  
  riskCheckPassed: boolean;
  checkedIn: boolean;
  checkInCode?: string;
  hasLocationAccess: boolean;
  
  enrolledAt: { seconds: number; nanoseconds: number };
  confirmedAt?: { seconds: number; nanoseconds: number };
  transactionId?: string;
}

// ============================================================================
// EVENT MANAGEMENT
// ============================================================================

/**
 * Create a new event (verified creators only)
 */
export async function createEvent(data: {
  title: string;
  description: string;
  type: EventType;
  priceTokens: number;
  region: string;
  startTime: string; // ISO string
  endTime: string;   // ISO string
  capacity?: number;
  locationDetails?: {
    address?: string;
    venue?: string;
    latitude?: number;
    longitude?: number;
  };
  tags?: string[];
  requiresApproval?: boolean;
}): Promise<{
  success: boolean;
  eventId: string;
  riskLevel: string;
  message: string;
}> {
  const callable = httpsCallable(functions, 'pack117_createEvent');
  const result = await callable(data);
  return result.data as any;
}

/**
 * Update event details
 */
export async function updateEvent(data: {
  eventId: string;
  title?: string;
  description?: string;
  priceTokens?: number;
  capacity?: number;
  locationDetails?: {
    address?: string;
    venue?: string;
    latitude?: number;
    longitude?: number;
  };
  tags?: string[];
}): Promise<{
  success: boolean;
  message: string;
}> {
  const callable = httpsCallable(functions, 'pack117_updateEvent');
  const result = await callable(data);
  return result.data as any;
}

/**
 * Cancel event and process refunds
 */
export async function cancelEvent(data: {
  eventId: string;
  reason: string;
}): Promise<{
  success: boolean;
  refundedAttendees: number;
  message: string;
}> {
  const callable = httpsCallable(functions, 'pack117_cancelEvent');
  const result = await callable(data);
  return result.data as any;
}

/**
 * List events by region
 */
export async function listEventsByRegion(data: {
  region: string;
  limit?: number;
}): Promise<{
  success: boolean;
  events: Event[];
}> {
  const callable = httpsCallable(functions, 'pack117_listEventsByRegion');
  const result = await callable(data);
  return result.data as any;
}

/**
 * Get event details with conditional location access
 */
export async function getEventDetails(eventId: string): Promise<{
  success: boolean;
  event: Event;
  userAttendee: EventAttendee | null;
  hasLocationAccess: boolean;
}> {
  const callable = httpsCallable(functions, 'pack117_getEventDetails');
  const result = await callable({ eventId });
  return result.data as any;
}

// ============================================================================
// EVENT ENROLLMENT
// ============================================================================

/**
 * Join event with risk screening and payment
 */
export async function joinEvent(eventId: string): Promise<{
  success: boolean;
  attendeeId: string;
  checkInCode: string;
  locationDetails?: {
    address?: string;
    venue?: string;
    latitude?: number;
    longitude?: number;
  };
  message: string;
}> {
  const callable = httpsCallable(functions, 'pack117_joinEvent');
  const result = await callable({ eventId });
  return result.data as any;
}

/**
 * Leave event before it starts (no refund)
 */
export async function leaveEvent(eventId: string): Promise<{
  success: boolean;
  message: string;
}> {
  const callable = httpsCallable(functions, 'pack117_leaveEvent');
  const result = await callable({ eventId });
  return result.data as any;
}

/**
 * Check in to event
 */
export async function checkInToEvent(data: {
  eventId: string;
  checkInCode: string;
}): Promise<{
  success: boolean;
  message: string;
}> {
  const callable = httpsCallable(functions, 'pack117_checkInToEvent');
  const result = await callable(data);
  return result.data as any;
}

/**
 * Get user's enrolled events
 */
export async function getMyEvents(): Promise<{
  success: boolean;
  attendees: EventAttendee[];
  events: Event[];
}> {
  const callable = httpsCallable(functions, 'pack117_getMyEvents');
  const result = await callable({});
  return result.data as any;
}

// ============================================================================
// SAFETY SURVEY
// ============================================================================

/**
 * Submit post-event safety survey
 */
export async function submitSafetySurvey(data: {
  eventId: string;
  feltSafe: boolean;
  matchedDescription: boolean;
  wouldAttendAgain: boolean;
  concerns?: string;
  positiveExperience?: string;
  reportThreat: boolean;
  reportMisrepresentation: boolean;
}): Promise<{
  success: boolean;
  message: string;
}> {
  const callable = httpsCallable(functions, 'pack117_submitSafetySurvey');
  const result = await callable(data);
  return result.data as any;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Convert Firestore timestamp to Date
 */
export function timestampToDate(timestamp: { seconds: number; nanoseconds: number }): Date {
  return new Date(timestamp.seconds * 1000);
}

/**
 * Format event date/time
 */
export function formatEventDateTime(startTime: { seconds: number; nanoseconds: number }): string {
  const date = timestampToDate(startTime);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get event type display name
 */
export function getEventTypeLabel(type: EventType): string {
  const labels: Record<EventType, string> = {
    [EventType.COMMUNITY_MEETUP]: 'Community Meetup',
    [EventType.FITNESS_WORKSHOP]: 'Fitness Workshop',
    [EventType.PHOTOGRAPHY_WALK]: 'Photography Walk',
    [EventType.COACHING_SESSION]: 'Coaching Session',
    [EventType.EDUCATIONAL_CLASS]: 'Educational Class',
    [EventType.NETWORKING_EVENT]: 'Networking Event',
    [EventType.OUTDOOR_ACTIVITY]: 'Outdoor Activity',
    [EventType.CREATIVE_WORKSHOP]: 'Creative Workshop',
  };
  return labels[type] || type;
}

/**
 * Check if event is upcoming
 */
export function isEventUpcoming(event: Event): boolean {
  const now = new Date();
  const startTime = timestampToDate(event.startTime);
  return startTime > now && event.status === EventStatus.UPCOMING;
}

/**
 * Check if event has started
 */
export function hasEventStarted(event: Event): boolean {
  const now = new Date();
  const startTime = timestampToDate(event.startTime);
  return startTime <= now;
}

/**
 * Check if event is full
 */
export function isEventFull(event: Event): boolean {
  if (!event.capacity) return false;
  return event.attendeesCount >= event.capacity;
}

/**
 * Get event status badge color
 */
export function getEventStatusColor(status: EventStatus): string {
  const colors: Record<EventStatus, string> = {
    [EventStatus.UPCOMING]: '#10B981', // green
    [EventStatus.IN_PROGRESS]: '#F59E0B', // amber
    [EventStatus.COMPLETED]: '#6B7280', // gray
    [EventStatus.CANCELLED]: '#EF4444', // red
  };
  return colors[status] || '#6B7280';
}

/**
 * Get attendee status badge color
 */
export function getAttendeeStatusColor(status: AttendeeStatus): string {
  const colors: Record<AttendeeStatus, string> = {
    [AttendeeStatus.PENDING]: '#F59E0B', // amber
    [AttendeeStatus.CONFIRMED]: '#10B981', // green
    [AttendeeStatus.DENIED]: '#EF4444', // red
    [AttendeeStatus.CANCELLED_BY_USER]: '#6B7280', // gray
    [AttendeeStatus.REFUNDED]: '#3B82F6', // blue
  };
  return colors[status] || '#6B7280';
}