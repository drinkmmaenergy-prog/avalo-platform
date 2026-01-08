/**
 * Booking Service
 * Handles calendar/meetup bookings with escrow flow
 */

import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDoc,
  updateDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  increment,
  Timestamp,
} from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { CALENDAR_CONFIG } from '../config/monetization';
import { getTokenBalance } from './tokenService';

const getDb = () => {
  try {
    const app = getApp();
    return getFirestore(app);
  } catch (error) {
    console.error('Error getting Firestore instance:', error);
    throw error;
  }
};

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export interface Booking {
  id?: string;
  bookerId: string;
  creatorId: string;
  bookingPrice: number;
  avaloFeeAmount: number;
  escrowAmount: number;
  dateTime: Date;
  location?: string;
  notes?: string;
  status: BookingStatus;
  createdAt: Date;
  confirmedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancelledBy?: string;
  bookerConfirmed?: boolean;
  creatorConfirmed?: boolean;
}

export interface CreatorAvailability {
  creatorId: string;
  bookingPrice: number;
  availableDates: string[]; // ISO date strings
  availableTimeSlots: string[]; // e.g., "09:00", "14:00"
  minAdvanceBookingHours: number;
  maxAdvanceBookingDays: number;
}

/**
 * Validate booking price
 */
export function validateBookingPrice(price: number): {
  valid: boolean;
  error?: string;
} {
  if (price < CALENDAR_CONFIG.MIN_BOOKING_PRICE) {
    return {
      valid: false,
      error: `Minimum booking price is ${CALENDAR_CONFIG.MIN_BOOKING_PRICE} tokens`,
    };
  }

  if (price > CALENDAR_CONFIG.MAX_BOOKING_PRICE) {
    return {
      valid: false,
      error: `Maximum booking price is ${CALENDAR_CONFIG.MAX_BOOKING_PRICE} tokens`,
    };
  }

  return { valid: true };
}

/**
 * Calculate booking split (instant fee + escrow)
 */
export function calculateBookingSplit(bookingPrice: number): {
  avaloFeeAmount: number;
  escrowAmount: number;
} {
  const avaloFeeAmount = Math.floor(bookingPrice * CALENDAR_CONFIG.BOOKING_FEE_PERCENTAGE);
  const escrowAmount = bookingPrice - avaloFeeAmount;

  return {
    avaloFeeAmount,
    escrowAmount,
  };
}

/**
 * Create a booking with escrow
 */
export async function createBooking(
  bookerId: string,
  creatorId: string,
  bookingPrice: number,
  dateTime: Date,
  location?: string,
  notes?: string
): Promise<{
  success: boolean;
  bookingId?: string;
  error?: string;
}> {
  try {
    const db = getDb();

    // Validate price
    const validation = validateBookingPrice(bookingPrice);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    // Check balance
    const balance = await getTokenBalance(bookerId);
    if (balance < bookingPrice) {
      return {
        success: false,
        error: 'INSUFFICIENT_TOKENS',
      };
    }

    // Calculate split
    const { avaloFeeAmount, escrowAmount } = calculateBookingSplit(bookingPrice);

    // Deduct full amount from booker
    const bookerWalletRef = doc(db, 'balances', bookerId, 'wallet');
    await updateDoc(bookerWalletRef, {
      tokens: increment(-bookingPrice),
      lastUpdated: serverTimestamp(),
    });

    // Create booking document
    const bookingsRef = collection(db, 'bookings');
    const bookingDoc = await addDoc(bookingsRef, {
      bookerId,
      creatorId,
      bookingPrice,
      avaloFeeAmount,
      escrowAmount,
      dateTime: Timestamp.fromDate(dateTime),
      location: location || '',
      notes: notes || '',
      status: 'pending',
      bookerConfirmed: false,
      creatorConfirmed: false,
      createdAt: serverTimestamp(),
    });

    // Create escrow record
    const escrowRef = collection(db, 'escrow');
    await addDoc(escrowRef, {
      bookingId: bookingDoc.id,
      bookerId,
      creatorId,
      amount: escrowAmount,
      status: 'held',
      createdAt: serverTimestamp(),
      type: 'booking',
    });

    // Record initial transaction (full deduction)
    const transactionsRef = collection(db, 'transactions');
    await addDoc(transactionsRef, {
      senderUid: bookerId,
      receiverUid: 'system',
      tokensAmount: bookingPrice,
      avaloFee: avaloFeeAmount,
      transactionType: 'booking_payment',
      bookingId: bookingDoc.id,
      createdAt: serverTimestamp(),
    });

    return {
      success: true,
      bookingId: bookingDoc.id,
    };
  } catch (error) {
    console.error('Error creating booking:', error);
    return {
      success: false,
      error: 'PROCESSING_ERROR',
    };
  }
}

/**
 * Mark booking as completed (by booker or creator)
 */
export async function markBookingCompleted(
  bookingId: string,
  userId: string,
  role: 'booker' | 'creator'
): Promise<{
  success: boolean;
  escrowReleased?: boolean;
  error?: string;
}> {
  try {
    const db = getDb();
    const bookingRef = doc(db, 'bookings', bookingId);
    const bookingSnap = await getDoc(bookingRef);

    if (!bookingSnap.exists()) {
      return { success: false, error: 'BOOKING_NOT_FOUND' };
    }

    const bookingData = bookingSnap.data();

    // Verify user is part of this booking
    if (
      (role === 'booker' && bookingData.bookerId !== userId) ||
      (role === 'creator' && bookingData.creatorId !== userId)
    ) {
      return { success: false, error: 'UNAUTHORIZED' };
    }

    // Update confirmation status
    const updateData: any = {};
    if (role === 'booker') {
      updateData.bookerConfirmed = true;
    } else {
      updateData.creatorConfirmed = true;
    }

    await updateDoc(bookingRef, updateData);

    // Check if both confirmed OR creator confirmed (simplified verification)
    const bookerConfirmed = role === 'booker' ? true : bookingData.bookerConfirmed;
    const creatorConfirmed = role === 'creator' ? true : bookingData.creatorConfirmed;

    let escrowReleased = false;

    if (creatorConfirmed) {
      // Release escrow to creator
      await releaseEscrow(bookingId, bookingData.creatorId, bookingData.escrowAmount);
      
      // Update booking status
      await updateDoc(bookingRef, {
        status: 'completed',
        completedAt: serverTimestamp(),
      });

      escrowReleased = true;
    }

    return {
      success: true,
      escrowReleased,
    };
  } catch (error) {
    console.error('Error marking booking completed:', error);
    return {
      success: false,
      error: 'PROCESSING_ERROR',
    };
  }
}

/**
 * Release escrow to creator
 */
async function releaseEscrow(
  bookingId: string,
  creatorId: string,
  amount: number
): Promise<void> {
  const db = getDb();

  // Add tokens to creator
  const creatorWalletRef = doc(db, 'balances', creatorId, 'wallet');
  const creatorWallet = await getDoc(creatorWalletRef);

  if (!creatorWallet.exists()) {
    await updateDoc(creatorWalletRef, {
      tokens: amount,
      lastUpdated: serverTimestamp(),
    });
  } else {
    await updateDoc(creatorWalletRef, {
      tokens: increment(amount),
      lastUpdated: serverTimestamp(),
    });
  }

  // Update escrow record
  const escrowRef = collection(db, 'escrow');
  const q = query(escrowRef, where('bookingId', '==', bookingId));
  const escrowSnap = await getDocs(q);

  if (!escrowSnap.empty) {
    const escrowDoc = escrowSnap.docs[0];
    await updateDoc(escrowDoc.ref, {
      status: 'released',
      releasedAt: serverTimestamp(),
    });
  }

  // Record transaction
  const transactionsRef = collection(db, 'transactions');
  await addDoc(transactionsRef, {
    senderUid: 'escrow',
    receiverUid: creatorId,
    tokensAmount: amount,
    avaloFee: 0,
    transactionType: 'escrow_release',
    bookingId,
    createdAt: serverTimestamp(),
  });
}

/**
 * Cancel booking
 */
export async function cancelBooking(
  bookingId: string,
  userId: string,
  role: 'booker' | 'creator'
): Promise<{
  success: boolean;
  refundAmount?: number;
  error?: string;
}> {
  try {
    const db = getDb();
    const bookingRef = doc(db, 'bookings', bookingId);
    const bookingSnap = await getDoc(bookingRef);

    if (!bookingSnap.exists()) {
      return { success: false, error: 'BOOKING_NOT_FOUND' };
    }

    const bookingData = bookingSnap.data();

    // Verify user is part of this booking
    if (
      (role === 'booker' && bookingData.bookerId !== userId) ||
      (role === 'creator' && bookingData.creatorId !== userId)
    ) {
      return { success: false, error: 'UNAUTHORIZED' };
    }

    let refundAmount = 0;

    if (role === 'creator') {
      // Creator cancels: full escrow refund to booker
      refundAmount = bookingData.escrowAmount;
      
      const bookerWalletRef = doc(db, 'balances', bookingData.bookerId, 'wallet');
      await updateDoc(bookerWalletRef, {
        tokens: increment(refundAmount),
        lastUpdated: serverTimestamp(),
      });
    } else {
      // Booker cancels: check timing for partial refund
      const bookingTime = bookingData.dateTime.toDate();
      const now = new Date();
      const hoursUntilBooking = (bookingTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntilBooking > 24) {
        // More than 24h: 50% refund of escrow
        refundAmount = Math.floor(bookingData.escrowAmount * 0.5);
      }
      // Less than 24h: no refund

      if (refundAmount > 0) {
        const bookerWalletRef = doc(db, 'balances', bookingData.bookerId, 'wallet');
        await updateDoc(bookerWalletRef, {
          tokens: increment(refundAmount),
          lastUpdated: serverTimestamp(),
        });
      }
    }

    // Update booking
    await updateDoc(bookingRef, {
      status: 'cancelled',
      cancelledAt: serverTimestamp(),
      cancelledBy: userId,
    });

    // Update escrow
    const escrowRef = collection(db, 'escrow');
    const q = query(escrowRef, where('bookingId', '==', bookingId));
    const escrowSnap = await getDocs(q);

    if (!escrowSnap.empty) {
      const escrowDoc = escrowSnap.docs[0];
      await updateDoc(escrowDoc.ref, {
        status: 'refunded',
        refundedAt: serverTimestamp(),
        refundedAmount: refundAmount,
      });
    }

    // Record refund transaction
    if (refundAmount > 0) {
      const transactionsRef = collection(db, 'transactions');
      await addDoc(transactionsRef, {
        senderUid: 'escrow',
        receiverUid: bookingData.bookerId,
        tokensAmount: refundAmount,
        avaloFee: 0,
        transactionType: 'booking_refund',
        bookingId,
        createdAt: serverTimestamp(),
      });
    }

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
}

/**
 * Get user's bookings
 */
export async function getUserBookings(
  userId: string,
  role: 'booker' | 'creator' | 'both' = 'both'
): Promise<Booking[]> {
  try {
    const db = getDb();
    const bookingsRef = collection(db, 'bookings');
    
    let bookings: Booking[] = [];

    if (role === 'booker' || role === 'both') {
      const q = query(bookingsRef, where('bookerId', '==', userId));
      const snapshot = await getDocs(q);
      snapshot.forEach((doc) => {
        const data = doc.data();
        bookings.push({
          id: doc.id,
          ...data,
          dateTime: data.dateTime?.toDate() || new Date(),
          createdAt: data.createdAt?.toDate() || new Date(),
          confirmedAt: data.confirmedAt?.toDate(),
          completedAt: data.completedAt?.toDate(),
          cancelledAt: data.cancelledAt?.toDate(),
        } as Booking);
      });
    }

    if (role === 'creator' || role === 'both') {
      const q = query(bookingsRef, where('creatorId', '==', userId));
      const snapshot = await getDocs(q);
      snapshot.forEach((doc) => {
        const data = doc.data();
        bookings.push({
          id: doc.id,
          ...data,
          dateTime: data.dateTime?.toDate() || new Date(),
          createdAt: data.createdAt?.toDate() || new Date(),
          confirmedAt: data.confirmedAt?.toDate(),
          completedAt: data.completedAt?.toDate(),
          cancelledAt: data.cancelledAt?.toDate(),
        } as Booking);
      });
    }

    return bookings.sort((a, b) => b.dateTime.getTime() - a.dateTime.getTime());
  } catch (error) {
    console.error('Error getting user bookings:', error);
    return [];
  }
}

/**
 * Set creator availability
 */
export async function setCreatorAvailability(
  creatorId: string,
  availability: Omit<CreatorAvailability, 'creatorId'>
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDb();
    const availabilityRef = doc(db, 'creator_availability', creatorId);

    await updateDoc(availabilityRef, {
      ...availability,
      updatedAt: serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    console.error('Error setting creator availability:', error);
    return { success: false, error: 'PROCESSING_ERROR' };
  }
}

/**
 * Get creator availability
 */
export async function getCreatorAvailability(
  creatorId: string
): Promise<CreatorAvailability | null> {
  try {
    const db = getDb();
    const availabilityRef = doc(db, 'creator_availability', creatorId);
    const availabilitySnap = await getDoc(availabilityRef);

    if (!availabilitySnap.exists()) {
      return null;
    }

    return {
      creatorId,
      ...availabilitySnap.data(),
    } as CreatorAvailability;
  } catch (error) {
    console.error('Error getting creator availability:', error);
    return null;
  }
}