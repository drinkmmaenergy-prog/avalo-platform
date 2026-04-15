"use client";

/**
 * Calendar Service — Booking & Meeting Management
 *
 * Handles calendar bookings (1-on-1 meetings), availability, meeting-rate
 * persistence, booking lifecycle (confirm / cancel / check-in / complete),
 * mismatch reports, and goodwill refunds.
 *
 * Firestore collections (see AVALO_CALENDAR_AND_REFUND_FLOW_v2.md §9):
 *   - calendarBookings/{bookingId}
 *   - users/{uid}  (calendarEnabled, meetingRate fields)
 *
 * Cloud Functions called:
 *   - confirmCalendarBooking
 *   - cancelCalendarBooking
 *   - checkInCalendarBooking
 *   - completeCalendarMeeting
 *   - reportCalendarMismatch
 *   - goodwillRefundCalendarBooking
 *
 * INVARIANTS:
 *   - All mutations go through httpsCallable — NEVER write directly.
 *   - reference earnings benchmark (host / Avalo) is enforced server-side only.
 */

import { requireDb, requireFunctions } from '../firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

// ============================================================================
// TYPES
// ============================================================================

export interface CalendarBooking {
  id: string;
  hostId: string;
  guestId: string;
  hostName?: string;
  guestName?: string;
  role: 'host' | 'guest';
  category?: string;
  start?: string;
  status: string;
  priceTokens?: number;
  payment?: {
    totalTokensPaid?: number;
    avaloFee?: number;
    escrow?: number;
  };
  safety?: {
    qrCode?: string;
    checkInAt?: string;
  };
  createdAt?: any;
}

// ============================================================================
// CALENDAR TOGGLE & MEETING RATE
// ============================================================================

/**
 * Read calendar-enabled flag and meeting rate from user doc.
 */
export async function getCalendarSettings(uid: string): Promise<{
  calendarEnabled: boolean;
  meetingRate: number;
}> {
  try {
    const ref = doc(requireDb(), 'users', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return { calendarEnabled: false, meetingRate: 100 };
    }
    const data = snap.data();
    return {
      calendarEnabled: data.calendarEnabled ?? false,
      meetingRate: data.meetingRate ?? 100,
    };
  } catch (error) {
    console.error('Error reading calendar settings:', error);
    return { calendarEnabled: false, meetingRate: 100 };
  }
}

/**
 * Toggle calendar on/off. Writes to users/{uid}.calendarEnabled.
 */
export async function toggleCalendarEnabled(uid: string, enabled: boolean): Promise<void> {
  const ref = doc(requireDb(), 'users', uid);
  await setDoc(ref, { calendarEnabled: enabled, updatedAt: serverTimestamp() }, { merge: true });
}

/**
 * Persist the meeting rate (token price per booking).
 * Min 1, max 10 000 — enforced here and server-side.
 */
export async function saveMeetingRate(uid: string, rate: number): Promise<void> {
  const clamped = Math.max(1, Math.min(10000, Math.round(rate)));
  const ref = doc(requireDb(), 'users', uid);
  await setDoc(ref, { meetingRate: clamped, updatedAt: serverTimestamp() }, { merge: true });
}

// ============================================================================
// BOOKINGS QUERY
// ============================================================================

/**
 * Fetch bookings where the user is host OR guest, ordered by creation desc.
 * Two queries merged client-side (Firestore doesn't support OR across fields).
 */
export async function getUserBookings(uid: string): Promise<CalendarBooking[]> {
  try {
    const db = requireDb();
    const col = collection(db, 'calendarBookings');

    const [hostSnap, guestSnap] = await Promise.all([
      getDocs(query(col, where('hostId', '==', uid), orderBy('createdAt', 'desc'), limit(50))),
      getDocs(query(col, where('guestId', '==', uid), orderBy('createdAt', 'desc'), limit(50))),
    ]);

    const map = new Map<string, CalendarBooking>();

    hostSnap.docs.forEach((d) => {
      map.set(d.id, { id: d.id, ...d.data(), role: 'host' } as CalendarBooking);
    });

    guestSnap.docs.forEach((d) => {
      if (!map.has(d.id)) {
        map.set(d.id, { id: d.id, ...d.data(), role: 'guest' } as CalendarBooking);
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      const ta = a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?.seconds ?? 0;
      return tb - ta;
    });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    throw error;
  }
}

// ============================================================================
// BOOKING ACTIONS (all server-side via Cloud Functions)
// ============================================================================

/**
 * Host confirms a PENDING booking.
 */
export async function confirmBooking(bookingId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const fn = httpsCallable<{ bookingId: string }, { success: boolean }>(
      requireFunctions(),
      'confirmCalendarBooking',
    );
    const result = await fn({ bookingId });
    return result.data;
  } catch (error: any) {
    console.error('Error confirming booking:', error);
    return { success: false, error: error.message || 'Failed to confirm booking' };
  }
}

/**
 * Cancel a booking (host or guest). Server applies refund policy.
 */
export async function cancelBooking(bookingId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const fn = httpsCallable<{ bookingId: string }, { success: boolean }>(
      requireFunctions(),
      'cancelCalendarBooking',
    );
    const result = await fn({ bookingId });
    return result.data;
  } catch (error: any) {
    console.error('Error cancelling booking:', error);
    return { success: false, error: error.message || 'Failed to cancel booking' };
  }
}

/**
 * Check in to a confirmed booking (QR-verified).
 */
export async function checkInBooking(
  bookingId: string,
  qrCode?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const fn = httpsCallable<{ bookingId: string; qrCode?: string }, { success: boolean }>(
      requireFunctions(),
      'checkInCalendarBooking',
    );
    const result = await fn({ bookingId, qrCode });
    return result.data;
  } catch (error: any) {
    console.error('Error checking in:', error);
    return { success: false, error: error.message || 'Failed to check in' };
  }
}

/**
 * Mark a meeting as completed. Triggers escrow release to host.
 */
export async function completeMeeting(bookingId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const fn = httpsCallable<{ bookingId: string }, { success: boolean }>(
      requireFunctions(),
      'completeCalendarMeeting',
    );
    const result = await fn({ bookingId });
    return result.data;
  } catch (error: any) {
    console.error('Error completing meeting:', error);
    return { success: false, error: error.message || 'Failed to complete meeting' };
  }
}

/**
 * Report mismatch within 15 minutes of check-in.
 */
export async function reportMismatch(bookingId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const fn = httpsCallable<{ bookingId: string }, { success: boolean }>(
      requireFunctions(),
      'reportCalendarMismatch',
    );
    const result = await fn({ bookingId });
    return result.data;
  } catch (error: any) {
    console.error('Error reporting mismatch:', error);
    return { success: false, error: error.message || 'Failed to report mismatch' };
  }
}

/**
 * Host voluntarily refunds their up to reference rate share after completion.
 */
export async function goodwillRefund(bookingId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const fn = httpsCallable<{ bookingId: string }, { success: boolean }>(
      requireFunctions(),
      'goodwillRefundCalendarBooking',
    );
    const result = await fn({ bookingId });
    return result.data;
  } catch (error: any) {
    console.error('Error issuing goodwill refund:', error);
    return { success: false, error: error.message || 'Failed to issue goodwill refund' };
  }
}
