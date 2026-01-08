/**
 * PACK 254: Meeting Service
 * Client-side service for offline meetings automation
 */

import { 
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  addDoc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();

// ============================================================================
// TYPES
// ============================================================================

export type MeetingStatus = 
  | 'AVAILABLE'
  | 'BOOKED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED';

export type ValidationType = 'CHECK_IN' | 'CHECK_OUT';
export type VerificationType = 'SELFIE' | 'QR' | 'BOTH';
export type RatingType = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'REPORT';
export type AlertType = 'SAFETY_CONCERN' | 'IDENTITY_MISMATCH' | 'HARASSMENT' | 'EMERGENCY';
export type RefundReason = 
  | 'IDENTITY_MISMATCH'
  | 'SAFETY_VIOLATION'
  | 'MUTUAL_AGREEMENT'
  | 'CREATOR_VOLUNTARY';

export interface Meeting {
  meetingId: string;
  creatorId: string;
  creatorName: string;
  bookerId?: string;
  bookerName?: string;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  location: {
    type: 'IN_PERSON' | 'ONLINE';
    address?: string;
    coordinates?: { lat: number; lng: number };
    virtualLink?: string;
  };
  priceTokens: number;
  verificationType: VerificationType;
  status: MeetingStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  cancelledAt?: Date;
}

export interface MeetingBooking {
  bookingId: string;
  meetingId: string;
  bookerId: string;
  creatorId: string;
  totalTokens: number;
  platformFee: number;
  escrowAmount: number;
  escrowStatus: 'HELD' | 'RELEASED' | 'REFUNDED';
  meetingDate: Date;
  createdAt: Date;
}

// ============================================================================
// MEETING SLOT MANAGEMENT
// ============================================================================

/**
 * Create a new meeting slot (creators only)
 */
export async function createMeetingSlot(meetingData: {
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  location: Meeting['location'];
  priceTokens: number;
  verificationType: VerificationType;
}): Promise<{ meetingId: string }> {
  const createMeeting = httpsCallable(functions, 'createMeetingSlot');
  const result = await createMeeting(meetingData);
  return result.data as { meetingId: string };
}

/**
 * Get available meeting slots
 */
export async function getAvailableMeetings(
  filters?: {
    creatorId?: string;
    startDate?: Date;
    endDate?: Date;
    maxPrice?: number;
  }
): Promise<Meeting[]> {
  let q = query(
    collection(db, 'meetings'),
    where('status', '==', 'AVAILABLE'),
    orderBy('startTime', 'asc'),
    limit(50)
  );

  if (filters?.creatorId) {
    q = query(q, where('creatorId', '==', filters.creatorId));
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      ...data,
      startTime: data.startTime.toDate(),
      endTime: data.endTime.toDate(),
      createdAt: data.createdAt.toDate(),
      updatedAt: data.updatedAt.toDate(),
      completedAt: data.completedAt?.toDate(),
      cancelledAt: data.cancelledAt?.toDate(),
    } as Meeting;
  });
}

/**
 * Get user's meetings (as creator or booker)
 */
export async function getUserMeetings(
  userId: string,
  role: 'creator' | 'booker'
): Promise<Meeting[]> {
  const field = role === 'creator' ? 'creatorId' : 'bookerId';
  const q = query(
    collection(db, 'meetings'),
    where(field, '==', userId),
    orderBy('startTime', 'desc'),
    limit(50)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      ...data,
      startTime: data.startTime.toDate(),
      endTime: data.endTime.toDate(),
      createdAt: data.createdAt.toDate(),
      updatedAt: data.updatedAt.toDate(),
      completedAt: data.completedAt?.toDate(),
      cancelledAt: data.cancelledAt?.toDate(),
    } as Meeting;
  });
}

/**
 * Get meeting details
 */
export async function getMeetingDetails(meetingId: string): Promise<Meeting | null> {
  const docRef = doc(db, 'meetings', meetingId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  const data = docSnap.data();
  return {
    ...data,
    startTime: data.startTime.toDate(),
    endTime: data.endTime.toDate(),
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt.toDate(),
    completedAt: data.completedAt?.toDate(),
    cancelledAt: data.cancelledAt?.toDate(),
  } as Meeting;
}

// ============================================================================
// BOOKING
// ============================================================================

/**
 * Book a meeting slot
 */
export async function bookMeeting(meetingId: string): Promise<{
  success: boolean;
  bookingId?: string;
  error?: string;
}> {
  try {
    const bookMeetingFn = httpsCallable(functions, 'bookMeeting');
    const result = await bookMeetingFn({ meetingId });
    const data = result.data as { bookingId: string };
    return { success: true, bookingId: data.bookingId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get booking details
 */
export async function getMeetingBooking(meetingId: string): Promise<MeetingBooking | null> {
  const q = query(
    collection(db, 'meeting_bookings'),
    where('meetingId', '==', meetingId),
    limit(1)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    return null;
  }

  const data = snapshot.docs[0].data();
  return {
    ...data,
    meetingDate: data.meetingDate.toDate(),
    createdAt: data.createdAt.toDate(),
  } as MeetingBooking;
}

// ============================================================================
// VALIDATION (CHECK-IN / CHECK-OUT)
// ============================================================================

/**
 * Validate check-in or check-out
 */
export async function validateCheckpoint(
  meetingId: string,
  validationType: ValidationType,
  verificationData: {
    verificationType: VerificationType;
    selfieUrl?: string;
    qrCode?: string;
    location?: { lat: number; lng: number };
  }
): Promise<{
  success: boolean;
  validationId?: string;
  verified?: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const validateFn = httpsCallable(functions, 'validateMeetingCheckpoint');
    const result = await validateFn({
      meetingId,
      validationType,
      verificationData,
    });
    const data = result.data as {
      validationId: string;
      verified: boolean;
      message: string;
    };
    return { success: true, ...data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Check if user can check in/out
 */
export async function canPerformCheckpoint(
  meeting: Meeting,
  validationType: ValidationType
): Promise<{ canPerform: boolean; reason?: string }> {
  const now = new Date();

  if (validationType === 'CHECK_IN') {
    const checkInWindowStart = new Date(
      meeting.startTime.getTime() - 15 * 60000 // 15 minutes before
    );
    const checkInWindowEnd = new Date(
      meeting.startTime.getTime() + 15 * 60000 // 15 minutes after
    );

    if (now < checkInWindowStart) {
      return {
        canPerform: false,
        reason: 'Too early. Check-in opens 15 minutes before meeting.',
      };
    }

    if (now > checkInWindowEnd) {
      return {
        canPerform: false,
        reason: 'Check-in window closed. Please contact support.',
      };
    }

    return { canPerform: true };
  } else {
    // CHECK_OUT
    const checkOutWindowEnd = new Date(
      meeting.endTime.getTime() + 15 * 60000 // 15 minutes after
    );

    if (now < meeting.endTime) {
      return {
        canPerform: false,
        reason: 'Meeting not yet ended.',
      };
    }

    if (now > checkOutWindowEnd) {
      return {
        canPerform: false,
        reason: 'Check-out window expired. Please contact support.',
      };
    }

    return { canPerform: true };
  }
}

// ============================================================================
// PANIC MODE
// ============================================================================

/**
 * Trigger panic alert
 */
export async function triggerPanicMode(
  meetingId: string,
  alertType: AlertType,
  alertData: {
    location: { lat: number; lng: number };
    selfieUrl?: string;
    trustedContactId?: string;
  }
): Promise<{
  success: boolean;
  alertId?: string;
  emergencyContactNotified?: boolean;
  error?: string;
}> {
  try {
    const panicFn = httpsCallable(functions, 'triggerPanicAlert');
    const result = await panicFn({
      meetingId,
      alertType,
      alertData,
    });
    const data = result.data as {
      alertId: string;
      emergencyContactNotified: boolean;
    };
    return { success: true, ...data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get user's emergency contacts
 */
export async function getEmergencyContacts(userId: string): Promise<any[]> {
  const q = query(
    collection(db, 'meeting_emergency_contacts'),
    where('userId', '==', userId),
    where('isActive', '==', true),
    orderBy('isPrimary', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Add emergency contact
 */
export async function addEmergencyContact(contactData: {
  name: string;
  phone: string;
  email: string;
  isPrimary: boolean;
}): Promise<{ success: boolean; contactId?: string; error?: string }> {
  try {
    const docRef = await addDoc(collection(db, 'meeting_emergency_contacts'), {
      ...contactData,
      isActive: true,
      createdAt: serverTimestamp(),
    });
    return { success: true, contactId: docRef.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// RATINGS & REFUNDS
// ============================================================================

/**
 * Submit meeting rating
 */
export async function submitRating(
  meetingId: string,
  ratingData: {
    ratingType: RatingType;
    reportReason?: string;
    privateNotes?: string;
  }
): Promise<{
  success: boolean;
  ratingId?: string;
  error?: string;
}> {
  try {
    const ratingFn = httpsCallable(functions, 'submitMeetingRating');
    const result = await ratingFn({
      meetingId,
      ratingData,
    });
    const data = result.data as { ratingId: string };
    return { success: true, ratingId: data.ratingId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Request refund
 */
export async function requestRefund(
  meetingId: string,
  refundReason: RefundReason,
  evidence?: {
    selfies?: string[];
    panicAlertId?: string;
    complainantStatement?: string;
  }
): Promise<{
  success: boolean;
  refundId?: string;
  status?: string;
  error?: string;
}> {
  try {
    const refundFn = httpsCallable(functions, 'requestMeetingRefund');
    const result = await refundFn({
      meetingId,
      refundReason,
      evidence,
    });
    const data = result.data as { refundId: string; status: string };
    return { success: true, ...data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Check if meeting can be rated
 */
export function canRateMeeting(meeting: Meeting): { canRate: boolean; reason?: string } {
  if (meeting.status !== 'COMPLETED') {
    return { canRate: false, reason: 'Meeting must be completed first' };
  }

  if (!meeting.completedAt) {
    return { canRate: false, reason: 'Meeting completion time not recorded' };
  }

  const hoursElapsed = (Date.now() - meeting.completedAt.getTime()) / (1000 * 60 * 60);
  if (hoursElapsed > 48) {
    return { canRate: false, reason: 'Rating window expired (48 hours)' };
  }

  return { canRate: true };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate meeting duration in minutes
 */
export function getMeetingDuration(meeting: Meeting): number {
  return (meeting.endTime.getTime() - meeting.startTime.getTime()) / 60000;
}

/**
 * Get meeting status display text
 */
export function getMeetingStatusText(status: MeetingStatus): string {
  const statusMap: Record<MeetingStatus, string> = {
    AVAILABLE: 'Available',
    BOOKED: 'Booked',
    IN_PROGRESS: 'In Progress',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    REFUNDED: 'Refunded',
  };
  return statusMap[status];
}

/**
 * Check if meeting is upcoming
 */
export function isUpcoming(meeting: Meeting): boolean {
  return meeting.status === 'BOOKED' && meeting.startTime > new Date();
}

/**
 * Check if meeting is active
 */
export function isActive(meeting: Meeting): boolean {
  const now = new Date();
  return (
    meeting.status === 'IN_PROGRESS' &&
    now >= meeting.startTime &&
    now <= meeting.endTime
  );
}

/**
 * Get time until meeting starts (in minutes)
 */
export function getTimeUntilStart(meeting: Meeting): number {
  return (meeting.startTime.getTime() - Date.now()) / 60000;
}

/**
 * Format meeting price display
 */
export function formatMeetingPrice(priceTokens: number): string {
  return `${priceTokens} tokens`;
}