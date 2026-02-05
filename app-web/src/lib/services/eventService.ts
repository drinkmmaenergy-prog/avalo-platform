/**
 * Events Service - Offline & Virtual Events
 * Handles event discovery, ticket purchases, QR check-in, and safety features
 */

import { db, functions } from '../firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Event, EventTicket } from '../types';

// ============================================================================
// EVENT DISCOVERY
// ============================================================================

/**
 * Discover upcoming events
 */
export async function discoverEvents(params: {
  type?: 'offline' | 'virtual';
  includeNSFW?: boolean;
  location?: string;
  limitCount?: number;
}): Promise<Event[]> {
  try {
    const constraints: any[] = [
      where('status', '==', 'upcoming'),
      where('date', '>', Timestamp.now()),
      orderBy('date', 'asc'),
      limit(params.limitCount || 50),
    ];

    if (params.type) {
      constraints.unshift(where('type', '==', params.type));
    }

    if (!params.includeNSFW) {
      constraints.unshift(where('isNSFW', '==', false));
    }

    const q = query(collection(db, 'events'), ...constraints);
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Event[];
  } catch (error) {
    console.error('Error discovering events:', error);
    throw error;
  }
}

/**
 * Get specific event
 */
export async function getEvent(eventId: string): Promise<Event | null> {
  try {
    const eventRef = doc(db, 'events', eventId);
    const eventSnap = await getDoc(eventRef);

    if (!eventSnap.exists()) {
      return null;
    }

    return {
      id: eventSnap.id,
      ...eventSnap.data(),
    } as Event;
  } catch (error) {
    console.error('Error getting event:', error);
    throw error;
  }
}

/**
 * Get events by host
 */
export async function getHostEvents(hostId: string): Promise<Event[]> {
  try {
    const q = query(
      collection(db, 'events'),
      where('hostId', '==', hostId),
      orderBy('date', 'desc'),
      limit(50)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Event[];
  } catch (error) {
    console.error('Error getting host events:', error);
    throw error;
  }
}

// ============================================================================
// TICKET PURCHASE
// ============================================================================

/**
 * Purchase event ticket
 */
export async function purchaseTicket(params: {
  eventId: string;
  userId: string;
  quantity?: number;
}): Promise<{
  success: boolean;
  ticketId?: string;
  qrCode?: string;
  error?: string;
}> {
  try {
    const purchase = httpsCallable<typeof params, {
      success: boolean;
      ticketId: string;
      qrCode: string;
    }>(functions, 'purchaseEventTicket');
    
    const result = await purchase(params);
    return result.data;
  } catch (error: any) {
    console.error('Error purchasing ticket:', error);
    return {
      success: false,
      error: error.message || 'Failed to purchase ticket',
    };
  }
}

/**
 * Get user's tickets
 */
export async function getUserTickets(userId: string): Promise<EventTicket[]> {
  try {
    const q = query(
      collection(db, 'event_tickets'),
      where('userId', '==', userId),
      where('status', 'in', ['valid', 'used']),
      orderBy('purchasedAt', 'desc'),
      limit(50)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as EventTicket[];
  } catch (error) {
    console.error('Error getting user tickets:', error);
    throw error;
  }
}

/**
 * Get specific ticket
 */
export async function getTicket(ticketId: string): Promise<EventTicket | null> {
  try {
    const ticketRef = doc(db, 'event_tickets', ticketId);
    const ticketSnap = await getDoc(ticketRef);

    if (!ticketSnap.exists()) {
      return null;
    }

    return {
      id: ticketSnap.id,
      ...ticketSnap.data(),
    } as EventTicket;
  } catch (error) {
    console.error('Error getting ticket:', error);
    throw error;
  }
}

// ============================================================================
// QR CHECK-IN
// ============================================================================

/**
 * Verify ticket QR code for check-in
 */
export async function verifyTicketQR(params: {
  ticketId: string;
  qrCode: string;
  eventId: string;
}): Promise<{
  valid: boolean;
  ticket?: EventTicket;
  event?: Event;
  error?: string;
}> {
  try {
    const verify = httpsCallable<typeof params, {
      valid: boolean;
      ticket: EventTicket;
      event: Event;
    }>(functions, 'verifyEventTicket');
    
    const result = await verify(params);
    return result.data;
  } catch (error: any) {
    console.error('Error verifying ticket:', error);
    return {
      valid: false,
      error: error.message || 'Invalid ticket',
    };
  }
}

/**
 * Check in with ticket
 */
export async function checkInTicket(params: {
  ticketId: string;
  eventId: string;
  hostId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const checkIn = httpsCallable<typeof params, { success: boolean }>(
      functions,
      'checkInEventTicket'
    );
    
    const result = await checkIn(params);
    return result.data;
  } catch (error: any) {
    console.error('Error checking in ticket:', error);
    return {
      success: false,
      error: error.message || 'Failed to check in',
    };
  }
}

// ============================================================================
// EVENT SAFETY / PANIC MODE
// ============================================================================

/**
 * Activate panic safety mode (R-HOTFIX-02)
 * Alerts emergency contacts and event organizers
 */
export async function activatePanicMode(params: {
  userId: string;
  eventId: string;
  location?: { lat: number; lon: number };
  reason?: string;
}): Promise<{ success: boolean; alertId?: string; error?: string }> {
  try {
    const activate = httpsCallable<typeof params, {
      success: boolean;
      alertId: string;
    }>(functions, 'activateEventPanicMode');
    
    const result = await activate(params);
    return result.data;
  } catch (error: any) {
    console.error('Error activating panic mode:', error);
    return {
      success: false,
      error: error.message || 'Failed to activate panic mode',
    };
  }
}

/**
 * Report safety concern
 */
export async function reportSafetyConcern(params: {
  userId: string;
  eventId: string;
  concernType: 'harassment' | 'violence' | 'medical' | 'other';
  description: string;
}): Promise<{ success: boolean; reportId?: string; error?: string }> {
  try {
    const report = httpsCallable<typeof params, {
      success: boolean;
      reportId: string;
    }>(functions, 'reportEventSafetyConcern');
    
    const result = await report(params);
    return result.data;
  } catch (error: any) {
    console.error('Error reporting concern:', error);
    return {
      success: false,
      error: error.message || 'Failed to report concern',
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format event date
 */
export function formatEventDate(timestamp: Timestamp): string {
  const date = timestamp.toDate();
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return 'Today';
  } else if (days === 1) {
    return 'Tomorrow';
  } else if (days < 7) {
    return `In ${days} days`;
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

/**
 * Check if event is sold out
 */
export function isEventSoldOut(event: Event): boolean {
  return event.maxAttendees !== undefined && event.currentAttendees >= event.maxAttendees;
}

/**
 * Get available spots
 */
export function getAvailableSpots(event: Event): number | null {
  if (event.maxAttendees === undefined) {
    return null; // Unlimited
  }
  return Math.max(0, event.maxAttendees - event.currentAttendees);
}