/**
 * Calendar Service
 * Handles calendar bookings with escrow system (20% Avalo / 80% Host split)
 */

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  increment,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { CALENDAR_CONFIG } from '../config/monetization';

const getDb = () => {
  try {
    const app = getApp();
    return getFirestore(app);
  } catch (error) {
    console.error('Error getting Firestore instance:', error);
    throw error;
  }
};

export interface CalendarBooking {
  id: string;
  guestUid: string;
  hostUid: string;
  bookingDate: Date | Timestamp;
  duration: number; // minutes
  tokensCost: number;
  escrowAmount: number; // 80% for host
  avaloFee: number; // 20% for Avalo
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Create a calendar booking with escrow
 */
export const createBooking = async (
  guestUid: string,
  hostUid: string,
  bookingDate: Date,
  duration: number,
  tokensCost: number
): Promise<{ success: boolean; bookingId?: string; error?: string }> => {
  try {
    const db = getDb();

    // Validate token cost within limits
    if (tokensCost < CALENDAR_CONFIG.MIN_BOOKING_PRICE || tokensCost > CALENDAR_CONFIG.MAX_BOOKING_PRICE) {
      return {
        success: false,
        error: 'INVALID_PRICE',
      };
    }

    // Check guest balance
    const guestWalletRef = doc(db, 'balances', guestUid, 'wallet');
    const guestWalletSnap = await getDoc(guestWalletRef);

    if (!guestWalletSnap.exists()) {
      return {
        success: false,
        error: 'INSUFFICIENT_BALANCE',
      };
    }

    const guestBalance = guestWalletSnap.data().tokens || 0;
    if (guestBalance < tokensCost) {
      return {
        success: false,
        error: 'INSUFFICIENT_BALANCE',
      };
    }

    // Calculate escrow split (20% Avalo instant, 80% escrowed for host)
    const avaloFee = Math.floor(tokensCost * CALENDAR_CONFIG.BOOKING_FEE_PERCENTAGE);
    const escrowAmount = tokensCost - avaloFee;

    const batch = writeBatch(db);

    // Deduct total from guest
    batch.update(guestWalletRef, {
      tokens: increment(-tokensCost),
      lastUpdated: serverTimestamp(),
    });

    // Create booking with escrow
    const bookingRef = doc(collection(db, 'calendar_bookings'));
    batch.set(bookingRef, {
      guestUid,
      hostUid,
      bookingDate: Timestamp.fromDate(bookingDate),
      duration,
      tokensCost,
      escrowAmount,
      avaloFee,
      status: 'confirmed',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Record instant fee transaction
    const feeTransactionRef = doc(collection(db, 'transactions'));
    batch.set(feeTransactionRef, {
      senderUid: guestUid,
      receiverUid: 'avalo_platform',
      tokensAmount: avaloFee,
      avaloFee,
      transactionType: 'booking_fee',
      bookingId: bookingRef.id,
      createdAt: serverTimestamp(),
    });

    await batch.commit();

    return {
      success: true,
      bookingId: bookingRef.id,
    };
  } catch (error) {
    console.error('Error creating booking:', error);
    return {
      success: false,
      error: 'PROCESSING_ERROR',
    };
  }
};

/**
 * Complete booking and release escrow to host
 */
export const completeBooking = async (
  bookingId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const db = getDb();
    const bookingRef = doc(db, 'calendar_bookings', bookingId);
    const bookingSnap = await getDoc(bookingRef);

    if (!bookingSnap.exists()) {
      return {
        success: false,
        error: 'BOOKING_NOT_FOUND',
      };
    }

    const booking = bookingSnap.data() as CalendarBooking;

    if (booking.status !== 'confirmed') {
      return {
        success: false,
        error: 'INVALID_STATUS',
      };
    }

    const batch = writeBatch(db);

    // Release escrow to host (80%)
    const hostWalletRef = doc(db, 'balances', booking.hostUid, 'wallet');
    const hostWalletSnap = await getDoc(hostWalletRef);

    if (!hostWalletSnap.exists()) {
      batch.set(hostWalletRef, {
        tokens: booking.escrowAmount,
        lastUpdated: serverTimestamp(),
      });
    } else {
      batch.update(hostWalletRef, {
        tokens: increment(booking.escrowAmount),
        lastUpdated: serverTimestamp(),
      });
    }

    // Update booking status
    batch.update(bookingRef, {
      status: 'completed',
      updatedAt: serverTimestamp(),
    });

    // Record escrow release transaction
    const transactionRef = doc(collection(db, 'transactions'));
    batch.set(transactionRef, {
      senderUid: booking.guestUid,
      receiverUid: booking.hostUid,
      tokensAmount: booking.escrowAmount,
      avaloFee: 0, // Fee already deducted at booking time
      transactionType: 'booking_payout',
      bookingId,
      createdAt: serverTimestamp(),
    });

    await batch.commit();

    return { success: true };
  } catch (error) {
    console.error('Error completing booking:', error);
    return {
      success: false,
      error: 'PROCESSING_ERROR',
    };
  }
};

/**
 * Cancel booking with refund policy
 */
export const cancelBooking = async (
  bookingId: string,
  cancelledBy: 'guest' | 'host'
): Promise<{ success: boolean; refundAmount?: number; error?: string }> => {
  try {
    const db = getDb();
    const bookingRef = doc(db, 'calendar_bookings', bookingId);
    const bookingSnap = await getDoc(bookingRef);

    if (!bookingSnap.exists()) {
      return {
        success: false,
        error: 'BOOKING_NOT_FOUND',
      };
    }

    const booking = bookingSnap.data() as CalendarBooking;

    if (booking.status === 'cancelled' || booking.status === 'completed') {
      return {
        success: false,
        error: 'INVALID_STATUS',
      };
    }

    const now = new Date();
    const bookingDate = booking.bookingDate instanceof Timestamp
      ? booking.bookingDate.toDate()
      : booking.bookingDate;
    const hoursUntilBooking = (bookingDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    let refundAmount = 0;

    if (cancelledBy === 'host') {
      // Host cancels: 100% refund to guest
      refundAmount = booking.tokensCost;
    } else {
      // Guest cancels
      if (hoursUntilBooking >= 24) {
        // >24h: 50% refund
        refundAmount = Math.floor(booking.tokensCost * CALENDAR_CONFIG.GUEST_CANCELLATION_REFUND);
      } else {
        // <24h: 50 token fee, rest refunded
        refundAmount = Math.max(0, booking.tokensCost - CALENDAR_CONFIG.CANCELLATION_FEE);
      }
    }

    const batch = writeBatch(db);

    // Refund to guest if applicable
    if (refundAmount > 0) {
      const guestWalletRef = doc(db, 'balances', booking.guestUid, 'wallet');
      batch.update(guestWalletRef, {
        tokens: increment(refundAmount),
        lastUpdated: serverTimestamp(),
      });
    }

    // Update booking status
    batch.update(bookingRef, {
      status: 'cancelled',
      cancelledBy,
      refundAmount,
      updatedAt: serverTimestamp(),
    });

    // Record refund transaction
    if (refundAmount > 0) {
      const transactionRef = doc(collection(db, 'transactions'));
      batch.set(transactionRef, {
        senderUid: 'avalo_platform',
        receiverUid: booking.guestUid,
        tokensAmount: refundAmount,
        avaloFee: 0,
        transactionType: 'booking_refund',
        bookingId,
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();

    return {
      success: true,
      refundAmount,
    };
  } catch (error) {
    console.error('Error cancelling booking:', error);
    return {
      success: false,
      error: 'PROCESSING_ERROR',
    };
  }
};

/**
 * Get user's bookings
 */
export const getUserBookings = async (
  userId: string,
  role: 'guest' | 'host'
): Promise<CalendarBooking[]> => {
  try {
    const db = getDb();
    const bookingsRef = collection(db, 'calendar_bookings');
    
    const fieldName = role === 'guest' ? 'guestUid' : 'hostUid';
    const q = query(bookingsRef, where(fieldName, '==', userId));
    
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        bookingDate: data.bookingDate instanceof Timestamp ? data.bookingDate.toDate() : data.bookingDate,
      } as CalendarBooking;
    });
  } catch (error) {
    console.error('Error getting user bookings:', error);
    return [];
  }
};

/**
 * Get booking details
 */
export const getBooking = async (bookingId: string): Promise<CalendarBooking | null> => {
  try {
    const db = getDb();
    const bookingRef = doc(db, 'calendar_bookings', bookingId);
    const bookingSnap = await getDoc(bookingRef);

    if (!bookingSnap.exists()) {
      return null;
    }

    const data = bookingSnap.data();
    return {
      id: bookingSnap.id,
      ...data,
      bookingDate: data.bookingDate instanceof Timestamp ? data.bookingDate.toDate() : data.bookingDate,
    } as CalendarBooking;
  } catch (error) {
    console.error('Error getting booking:', error);
    return null;
  }
};