/**
 * PACK 58 — Reservation Service (Mobile)
 * 
 * Service layer for calendar reservations and escrowed meetings
 * - Creator availability management
 * - Booking and payment with token escrow
 * - Confirmation and no-show handling
 * - AsyncStorage caching for offline support
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

// ============================================================================
// TYPES
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

export interface CreatorAvailability {
  creatorUserId: string;
  timezone: string;
  defaultPriceTokens: number;
  meetingMode: MeetingMode;
  locationHint?: string | null;
  description?: string | null;
}

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

export interface AvailabilitySettings {
  timezone: string;
  weeklySlots: {
    [weekday: string]: WeeklySlot;
  };
  overrides?: {
    [date: string]: DateOverride;
  };
  defaultPriceTokens: number;
  meetingMode: MeetingMode;
  locationHint?: string;
  description?: string;
}

export interface TimeSlot {
  startTimeUtc: string;
  endTimeUtc: string;
}

export interface ReservationSummary {
  reservationId: string;
  creatorUserId: string;
  clientUserId: string;
  startTimeUtc: string;
  endTimeUtc: string;
  timezone: string;
  priceTokens: number;
  status: ReservationStatus;
  clientConfirmed?: boolean;
  creatorConfirmed?: boolean;
  escrowId?: string;
  disputeId?: string;
}

// ============================================================================
// ASYNCSTORAGE KEYS
// ============================================================================

const STORAGE_KEYS = {
  availability: (creatorUserId: string) => `reservation_availability_v1_${creatorUserId}`,
  reservationsCreator: (userId: string) => `reservations_list_v1_${userId}_creator`,
  reservationsClient: (userId: string) => `reservations_list_v1_${userId}_client`,
};

// ============================================================================
// AVAILABILITY MANAGEMENT
// ============================================================================

/**
 * Fetch creator availability and time slots
 */
export async function fetchCreatorAvailability(
  creatorUserId: string,
  fromIso: string,
  toIso: string
): Promise<{ availability: CreatorAvailability | null; slots: TimeSlot[] }> {
  try {
    const getAvailability = httpsCallable(functions, 'getAvailability');
    const result = await getAvailability({
      creatorUserId,
      from: fromIso,
      to: toIso
    });

    const data = result.data as any;

    // Cache availability
    if (data.availability) {
      const cacheKey = STORAGE_KEYS.availability(creatorUserId);
      await AsyncStorage.setItem(cacheKey, JSON.stringify({
        availability: data.availability,
        cachedAt: new Date().toISOString()
      }));
    }

    return {
      availability: data.availability,
      slots: data.slots || []
    };
  } catch (error) {
    console.error('Error fetching creator availability:', error);

    // Try to return cached data
    try {
      const cacheKey = STORAGE_KEYS.availability(creatorUserId);
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          availability: parsed.availability,
          slots: []
        };
      }
    } catch (cacheError) {
      console.error('Error reading cache:', cacheError);
    }

    throw error;
  }
}

/**
 * Set creator availability (creator only)
 */
export async function setCreatorAvailability(
  settings: AvailabilitySettings
): Promise<void> {
  try {
    const setAvailability = httpsCallable(functions, 'setAvailability');
    await setAvailability(settings);

    // Clear cache
    // Note: We don't have creatorUserId here, but it will be refreshed on next fetch
    console.log('Creator availability updated successfully');
  } catch (error) {
    console.error('Error setting creator availability:', error);
    throw error;
  }
}

// ============================================================================
// RESERVATION OPERATIONS
// ============================================================================

/**
 * Create a new reservation with token escrow
 */
export async function createReservation(params: {
  clientUserId: string;
  creatorUserId: string;
  startTimeUtc: string;
  endTimeUtc: string;
  meetingMode?: 'ONLINE' | 'OFFLINE';
}): Promise<ReservationSummary> {
  try {
    const createReservationFn = httpsCallable(functions, 'createReservation');
    const result = await createReservationFn(params);

    const data = result.data as any;

    // Clear cached lists
    await AsyncStorage.removeItem(STORAGE_KEYS.reservationsCreator(params.creatorUserId));
    await AsyncStorage.removeItem(STORAGE_KEYS.reservationsClient(params.clientUserId));

    return {
      reservationId: data.reservationId,
      creatorUserId: params.creatorUserId,
      clientUserId: params.clientUserId,
      startTimeUtc: params.startTimeUtc,
      endTimeUtc: params.endTimeUtc,
      timezone: '',
      priceTokens: data.priceTokens,
      status: data.status,
      escrowId: data.escrowId
    };
  } catch (error) {
    console.error('Error creating reservation:', error);
    throw error;
  }
}

/**
 * Cancel a reservation
 */
export async function cancelReservation(
  userId: string,
  reservationId: string,
  reason?: string
): Promise<ReservationSummary> {
  try {
    const cancelReservationFn = httpsCallable(functions, 'cancelReservation');
    const result = await cancelReservationFn({
      reservationId,
      reason
    });

    const data = result.data as any;

    // Clear cached lists
    await AsyncStorage.removeItem(STORAGE_KEYS.reservationsCreator(userId));
    await AsyncStorage.removeItem(STORAGE_KEYS.reservationsClient(userId));

    return data as ReservationSummary;
  } catch (error) {
    console.error('Error cancelling reservation:', error);
    throw error;
  }
}

/**
 * Confirm meeting outcome
 */
export async function confirmReservationOutcome(
  userId: string,
  reservationId: string,
  outcome: 'CONFIRM' | 'NO_SHOW_OTHER'
): Promise<ReservationSummary> {
  try {
    const confirmReservationFn = httpsCallable(functions, 'confirmReservation');
    const result = await confirmReservationFn({
      reservationId,
      outcome
    });

    const data = result.data as any;

    // Clear cached lists
    await AsyncStorage.removeItem(STORAGE_KEYS.reservationsCreator(userId));
    await AsyncStorage.removeItem(STORAGE_KEYS.reservationsClient(userId));

    return data as ReservationSummary;
  } catch (error) {
    console.error('Error confirming reservation:', error);
    throw error;
  }
}

/**
 * Fetch reservations for a user
 */
export async function fetchReservations(
  userId: string,
  role: 'creator' | 'client',
  fromIso: string,
  toIso: string
): Promise<ReservationSummary[]> {
  try {
    const listReservationsFn = httpsCallable(functions, 'listReservations');
    const result = await listReservationsFn({
      role,
      from: fromIso,
      to: toIso
    });

    const data = result.data as any;
    const reservations = data.reservations || [];

    // Cache the results
    const cacheKey = role === 'creator'
      ? STORAGE_KEYS.reservationsCreator(userId)
      : STORAGE_KEYS.reservationsClient(userId);

    await AsyncStorage.setItem(cacheKey, JSON.stringify({
      reservations,
      cachedAt: new Date().toISOString()
    }));

    return reservations;
  } catch (error) {
    console.error('Error fetching reservations:', error);

    // Try to return cached data
    try {
      const cacheKey = role === 'creator'
        ? STORAGE_KEYS.reservationsCreator(userId)
        : STORAGE_KEYS.reservationsClient(userId);

      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.reservations || [];
      }
    } catch (cacheError) {
      console.error('Error reading cache:', cacheError);
    }

    throw error;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get status display color
 */
export function getStatusColor(status: ReservationStatus): string {
  switch (status) {
    case 'PENDING_PAYMENT':
      return '#fbbf24'; // amber
    case 'CONFIRMED':
      return '#10b981'; // green
    case 'COMPLETED':
      return '#3b82f6'; // blue
    case 'CANCELLED':
    case 'REFUNDED':
      return '#6b7280'; // gray
    case 'NO_SHOW_CREATOR':
    case 'NO_SHOW_CLIENT':
      return '#f59e0b'; // amber
    case 'IN_DISPUTE':
      return '#ef4444'; // red
    case 'RELEASED_TO_CREATOR':
      return '#8b5cf6'; // purple
    default:
      return '#6b7280'; // gray
  }
}

/**
 * Check if reservation can be cancelled
 */
export function canCancelReservation(
  reservation: ReservationSummary,
  currentUserId: string
): boolean {
  // Can only cancel if user is involved
  if (reservation.creatorUserId !== currentUserId && reservation.clientUserId !== currentUserId) {
    return false;
  }

  // Can only cancel PENDING_PAYMENT or CONFIRMED reservations
  if (!['PENDING_PAYMENT', 'CONFIRMED'].includes(reservation.status)) {
    return false;
  }

  // Can't cancel if meeting has already started
  const startTime = new Date(reservation.startTimeUtc);
  const now = new Date();
  if (now >= startTime) {
    return false;
  }

  return true;
}

/**
 * Check if reservation can be confirmed
 */
export function canConfirmReservation(
  reservation: ReservationSummary,
  currentUserId: string
): boolean {
  // Can only confirm if user is involved
  if (reservation.creatorUserId !== currentUserId && reservation.clientUserId !== currentUserId) {
    return false;
  }

  // Can only confirm CONFIRMED reservations
  if (reservation.status !== 'CONFIRMED') {
    return false;
  }

  // Can only confirm after meeting has ended
  const endTime = new Date(reservation.endTimeUtc);
  const now = new Date();
  if (now < endTime) {
    return false;
  }

  // Check if within 24h window
  const hoursAfterEnd = (now.getTime() - endTime.getTime()) / (1000 * 60 * 60);
  if (hoursAfterEnd > 24) {
    return false;
  }

  return true;
}

/**
 * Check if user has already confirmed
 */
export function hasUserConfirmed(
  reservation: ReservationSummary,
  currentUserId: string
): boolean {
  if (reservation.creatorUserId === currentUserId) {
    return reservation.creatorConfirmed || false;
  } else if (reservation.clientUserId === currentUserId) {
    return reservation.clientConfirmed || false;
  }
  return false;
}

/**
 * Format time slot for display
 */
export function formatTimeSlot(startTimeUtc: string, endTimeUtc: string, timezone?: string): string {
  const start = new Date(startTimeUtc);
  const end = new Date(endTimeUtc);

  const timeFormatter = new Intl.DateTimeFormat('default', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone
  });

  const dateFormatter = new Intl.DateTimeFormat('default', {
    month: 'short',
    day: 'numeric',
    timeZone: timezone
  });

  return `${dateFormatter.format(start)} at ${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;
}

/**
 * Calculate hours until meeting
 */
export function getHoursUntilMeeting(startTimeUtc: string): number {
  const start = new Date(startTimeUtc);
  const now = new Date();
  return (start.getTime() - now.getTime()) / (1000 * 60 * 60);
}

/**
 * Check if meeting is upcoming (within 24 hours)
 */
export function isUpcoming(startTimeUtc: string): boolean {
  const hours = getHoursUntilMeeting(startTimeUtc);
  return hours > 0 && hours <= 24;
}

/**
 * Clear all reservation caches
 */
export async function clearReservationCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.reservationsCreator(userId));
    await AsyncStorage.removeItem(STORAGE_KEYS.reservationsClient(userId));
    await AsyncStorage.removeItem(STORAGE_KEYS.availability(userId));
  } catch (error) {
    console.error('Error clearing reservation cache:', error);
  }
}