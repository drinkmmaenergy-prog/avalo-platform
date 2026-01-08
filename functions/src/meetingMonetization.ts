/**
 * PACK 254: MEET & DATE ENGINE - OFFLINE MEETINGS AUTOMATION
 * 
 * Complete offline meeting system with:
 * - Token-based booking (35% Avalo fee + 65% escrow)
 * - Mandatory check-in/check-out (selfie or QR)
 * - Refund logic (identity mismatch, safety violations, mutual agreement)
 * - Panic Mode (in-app + lock-screen)
 * - Post-meeting rating system
 * - Shared logic with Events engine
 */

import {
  getFirestore,
  FieldValue,
  Timestamp,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';

const db = getFirestore();

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

export const MEETING_CONFIG = {
  PLATFORM_FEE_PERCENT: 35,          // Avalo takes 35% immediately (non-refundable)
  ESCROW_PERCENT: 65,                // 65% held in escrow for creator
  MIN_MEETING_DURATION_MINUTES: 30, // Minimum meeting duration
  MAX_MEETING_DURATION_HOURS: 8,    // Maximum meeting duration
  CHECK_IN_WINDOW_MINUTES: 15,      // 15 minutes before/after start time
  CHECK_OUT_WINDOW_MINUTES: 15,     // 15 minutes after end time
  RATING_WINDOW_HOURS: 48,          // 48 hours to rate after meeting
  REFUND_REVIEW_TIMEOUT_HOURS: 24,  // 24 hours for refund review
};

// ============================================================================
// TYPES
// ============================================================================

export type MeetingStatus = 
  | 'AVAILABLE'       // Creator has made slot available
  | 'BOOKED'          // Booker has paid and booked
  | 'IN_PROGRESS'     // Meeting started (check-in done)
  | 'COMPLETED'       // Meeting ended (check-out done)
  | 'CANCELLED'       // Cancelled before start
  | 'REFUNDED';       // Refund processed

export type ValidationType = 'CHECK_IN' | 'CHECK_OUT';
export type VerificationType = 'SELFIE' | 'QR' | 'BOTH';
export type RatingType = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'REPORT';
export type AlertType = 'SAFETY_CONCERN' | 'IDENTITY_MISMATCH' | 'HARASSMENT' | 'EMERGENCY';
export type RefundReason = 
  | 'IDENTITY_MISMATCH'    // Catfish protection
  | 'SAFETY_VIOLATION'     // Harassment, threat
  | 'MUTUAL_AGREEMENT'     // Both parties agree to end early
  | 'CREATOR_VOLUNTARY';   // Creator chooses to refund

export interface Meeting {
  meetingId: string;
  creatorId: string;
  creatorName: string;
  bookerId?: string;
  bookerName?: string;
  title: string;
  description: string;
  startTime: Timestamp;
  endTime: Timestamp;
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
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
  cancelledAt?: Timestamp;
}

export interface MeetingBooking {
  bookingId: string;
  meetingId: string;
  bookerId: string;
  creatorId: string;
  totalTokens: number;
  platformFee: number;        // 35% taken immediately
  escrowAmount: number;       // 65% held in escrow
  escrowStatus: 'HELD' | 'RELEASED' | 'REFUNDED';
  meetingDate: Timestamp;
  createdAt: Timestamp;
  releasedAt?: Timestamp;
  refundedAt?: Timestamp;
}

export interface MeetingValidation {
  validationId: string;
  meetingId: string;
  userId: string;
  validationType: ValidationType;
  verificationType: VerificationType;
  timestamp: Timestamp;
  verified: boolean;
  selfieUrl?: string;
  qrCode?: string;
  location?: { lat: number; lng: number };
  verificationScore?: number; // AI similarity score for selfies
}

export interface MeetingRating {
  ratingId: string;
  meetingId: string;
  raterId: string;
  ratedUserId: string;
  ratingType: RatingType;
  reportReason?: string;
  privateNotes?: string;
  createdAt: Timestamp;
}

export interface MeetingRefund {
  refundId: string;
  meetingId: string;
  bookingId: string;
  bookerId: string;
  creatorId: string;
  requesterId: string;
  refundReason: RefundReason;
  refundAmount: number;
  avaloFeeRefunded: boolean;  // Only refunded in confirmed fraud cases
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PROCESSED';
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  evidence?: {
    selfies?: string[];
    panicAlertId?: string;
    complainantStatement?: string;
  };
  createdAt: Timestamp;
  processedAt?: Timestamp;
}

export interface PanicAlert {
  alertId: string;
  meetingId: string;
  userId: string;
  alertType: AlertType;
  location: { lat: number; lng: number };
  timestamp: Timestamp;
  status: 'ACTIVE' | 'RESOLVED' | 'FALSE_ALARM';
  trustedContactId?: string;
  emergencyContactNotified: boolean;
  selfieUrl?: string;
  matchedUserProfile?: {
    userId: string;
    name: string;
    profilePhotoUrl: string;
  };
  resolvedAt?: Timestamp;
  resolvedBy?: string;
}

// ============================================================================
// MEETING CREATION & BOOKING
// ============================================================================

/**
 * Creator creates a meeting slot
 */
export async function createMeetingSlot(
  creatorId: string,
  meetingData: {
    title: string;
    description: string;
    startTime: Date;
    endTime: Date;
    timezone: string;
    location: Meeting['location'];
    priceTokens: number;
    verificationType: VerificationType;
  }
): Promise<{ meetingId: string; meeting: Meeting }> {
  // Validate creator
  const creatorDoc = await db.collection('users').doc(creatorId).get();
  if (!creatorDoc.exists) {
    throw new HttpsError('not-found', 'Creator not found');
  }

  const creator = creatorDoc.data();
  if (!creator?.earnFromChat && !creator?.isCreator) {
    throw new HttpsError(
      'permission-denied',
      'Only creators can create meeting slots'
    );
  }

  // Validate timing
  const now = new Date();
  if (meetingData.startTime <= now) {
    throw new HttpsError('invalid-argument', 'Meeting must be in the future');
  }

  const durationMinutes = 
    (meetingData.endTime.getTime() - meetingData.startTime.getTime()) / 60000;
  
  if (durationMinutes < MEETING_CONFIG.MIN_MEETING_DURATION_MINUTES) {
    throw new HttpsError(
      'invalid-argument',
      `Meeting must be at least ${MEETING_CONFIG.MIN_MEETING_DURATION_MINUTES} minutes`
    );
  }

  if (durationMinutes > MEETING_CONFIG.MAX_MEETING_DURATION_HOURS * 60) {
    throw new HttpsError(
      'invalid-argument',
      `Meeting cannot exceed ${MEETING_CONFIG.MAX_MEETING_DURATION_HOURS} hours`
    );
  }

  // Validate price
  if (meetingData.priceTokens < 1) {
    throw new HttpsError('invalid-argument', 'Price must be at least 1 token');
  }

  // Create meeting
  const meetingRef = db.collection('meetings').doc();
  const meeting: Meeting = {
    meetingId: meetingRef.id,
    creatorId,
    creatorName: creator.displayName || 'Anonymous',
    title: meetingData.title,
    description: meetingData.description,
    startTime: Timestamp.fromDate(meetingData.startTime),
    endTime: Timestamp.fromDate(meetingData.endTime),
    timezone: meetingData.timezone,
    location: meetingData.location,
    priceTokens: meetingData.priceTokens,
    verificationType: meetingData.verificationType,
    status: 'AVAILABLE',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  await meetingRef.set(meeting);

  logger.info(`Meeting slot created: ${meetingRef.id} by ${creatorId}`);

  return { meetingId: meetingRef.id, meeting };
}

/**
 * User books a meeting slot (with payment and escrow)
 */
export async function bookMeeting(
  meetingId: string,
  bookerId: string
): Promise<{ bookingId: string; booking: MeetingBooking }> {
  return await db.runTransaction(async (transaction) => {
    // Get meeting
    const meetingRef = db.collection('meetings').doc(meetingId);
    const meetingDoc = await transaction.get(meetingRef);

    if (!meetingDoc.exists) {
      throw new HttpsError('not-found', 'Meeting not found');
    }

    const meeting = meetingDoc.data() as Meeting;

    // Validate meeting status
    if (meeting.status !== 'AVAILABLE') {
      throw new HttpsError('failed-precondition', 'Meeting is not available');
    }

    // Prevent self-booking
    if (meeting.creatorId === bookerId) {
      throw new HttpsError('invalid-argument', 'Cannot book your own meeting');
    }

    // Get booker
    const bookerRef = db.collection('users').doc(bookerId);
    const bookerDoc = await transaction.get(bookerRef);

    if (!bookerDoc.exists) {
      throw new HttpsError('not-found', 'Booker not found');
    }

    const booker = bookerDoc.data();
    const bookerBalance = booker?.tokenBalance || 0;

    // Check balance
    if (bookerBalance < meeting.priceTokens) {
      throw new HttpsError(
        'failed-precondition',
        `Insufficient tokens. Required: ${meeting.priceTokens}, Available: ${bookerBalance}`
      );
    }

    // Calculate fees and escrow
    const platformFee = Math.round(
      meeting.priceTokens * (MEETING_CONFIG.PLATFORM_FEE_PERCENT / 100)
    );
    const escrowAmount = meeting.priceTokens - platformFee;

    // Deduct tokens from booker
    transaction.update(bookerRef, {
      tokenBalance: FieldValue.increment(-meeting.priceTokens),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Credit Avalo platform fee immediately (non-refundable)
    const avaloWalletRef = db.collection('system').doc('avalo_wallet');
    transaction.set(
      avaloWalletRef,
      {
        balance: FieldValue.increment(platformFee),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Record platform fee transaction
    const feeTransactionRef = db.collection('transactions').doc();
    transaction.set(feeTransactionRef, {
      transactionId: feeTransactionRef.id,
      type: 'meeting_platform_fee',
      fromUserId: bookerId,
      toUserId: null, // Avalo
      amount: platformFee,
      meetingId,
      timestamp: FieldValue.serverTimestamp(),
      metadata: {
        meetingTitle: meeting.title,
        feePercent: MEETING_CONFIG.PLATFORM_FEE_PERCENT,
      },
    });

    // Create booking with escrow
    const bookingRef = db.collection('meeting_bookings').doc();
    const booking: MeetingBooking = {
      bookingId: bookingRef.id,
      meetingId,
      bookerId,
      creatorId: meeting.creatorId,
      totalTokens: meeting.priceTokens,
      platformFee,
      escrowAmount,
      escrowStatus: 'HELD',
      meetingDate: meeting.startTime,
      createdAt: Timestamp.now(),
    };

    transaction.set(bookingRef, booking);

    // Record escrow transaction
    const escrowTransactionRef = db.collection('transactions').doc();
    transaction.set(escrowTransactionRef, {
      transactionId: escrowTransactionRef.id,
      type: 'meeting_escrow_hold',
      fromUserId: bookerId,
      toUserId: meeting.creatorId,
      amount: escrowAmount,
      meetingId,
      bookingId: bookingRef.id,
      timestamp: FieldValue.serverTimestamp(),
      metadata: {
        meetingTitle: meeting.title,
        releaseCondition: 'meeting_completion_verified',
      },
    });

    // Update meeting status
    transaction.update(meetingRef, {
      bookerId,
      bookerName: booker?.displayName || 'Anonymous',
      status: 'BOOKED',
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info(
      `Meeting booked: ${meetingId} by ${bookerId}. Escrow: ${escrowAmount} tokens, Fee: ${platformFee} tokens`
    );

    return { bookingId: bookingRef.id, booking };
  });
}

// ============================================================================
// IDENTITY VALIDATION (CHECK-IN / CHECK-OUT)
// ============================================================================

/**
 * Validate check-in or check-out with selfie or QR code
 */
export async function validateMeetingCheckpoint(
  meetingId: string,
  userId: string,
  validationType: ValidationType,
  verificationData: {
    verificationType: VerificationType;
    selfieUrl?: string;
    qrCode?: string;
    location?: { lat: number; lng: number };
  }
): Promise<{ validationId: string; verified: boolean; message: string }> {
  return await db.runTransaction(async (transaction) => {
    // Get meeting
    const meetingRef = db.collection('meetings').doc(meetingId);
    const meetingDoc = await transaction.get(meetingRef);

    if (!meetingDoc.exists) {
      throw new HttpsError('not-found', 'Meeting not found');
    }

    const meeting = meetingDoc.data() as Meeting;

    // Verify user is participant
    if (userId !== meeting.creatorId && userId !== meeting.bookerId) {
      throw new HttpsError(
        'permission-denied',
        'Only meeting participants can check in/out'
      );
    }

    // Validate timing
    const now = new Date();
    const startTime = meeting.startTime.toDate();
    const endTime = meeting.endTime.toDate();

    if (validationType === 'CHECK_IN') {
      const checkInWindowStart = new Date(
        startTime.getTime() - MEETING_CONFIG.CHECK_IN_WINDOW_MINUTES * 60000
      );
      const checkInWindowEnd = new Date(
        startTime.getTime() + MEETING_CONFIG.CHECK_IN_WINDOW_MINUTES * 60000
      );

      if (now < checkInWindowStart || now > checkInWindowEnd) {
        throw new HttpsError(
          'failed-precondition',
          `Check-in only allowed ${MEETING_CONFIG.CHECK_IN_WINDOW_MINUTES} minutes before/after start time`
        );
      }
    } else {
      // CHECK_OUT
      const checkOutWindowEnd = new Date(
        endTime.getTime() + MEETING_CONFIG.CHECK_OUT_WINDOW_MINUTES * 60000
      );

      if (now < endTime) {
        throw new HttpsError(
          'failed-precondition',
          'Check-out only allowed after meeting end time'
        );
      }

      if (now > checkOutWindowEnd) {
        throw new HttpsError(
          'failed-precondition',
          `Check-out window expired (${MEETING_CONFIG.CHECK_OUT_WINDOW_MINUTES} minutes after end)`
        );
      }
    }

    // Validate verification data
    if (
      meeting.verificationType === 'SELFIE' ||
      meeting.verificationType === 'BOTH'
    ) {
      if (!verificationData.selfieUrl) {
        throw new HttpsError('invalid-argument', 'Selfie required');
      }
    }

    if (
      meeting.verificationType === 'QR' ||
      meeting.verificationType === 'BOTH'
    ) {
      if (!verificationData.qrCode) {
        throw new HttpsError('invalid-argument', 'QR code required');
      }
    }

    // Create validation record
    const validationRef = db
      .collection('meetings')
      .doc(meetingId)
      .collection('validations')
      .doc();

    const validation: MeetingValidation = {
      validationId: validationRef.id,
      meetingId,
      userId,
      validationType,
      verificationType: verificationData.verificationType,
      timestamp: Timestamp.now(),
      verified: true, // TODO: Integrate AI verification for selfies
      selfieUrl: verificationData.selfieUrl,
      qrCode: verificationData.qrCode,
      location: verificationData.location,
    };

    transaction.set(validationRef, validation);

    // Update meeting status
    if (validationType === 'CHECK_IN') {
      // Check if both users have checked in
      const validationsSnapshot = await db
        .collection('meetings')
        .doc(meetingId)
        .collection('validations')
        .where('validationType', '==', 'CHECK_IN')
        .get();

      const checkIns = validationsSnapshot.docs.map((doc) => doc.data());
      const bothCheckedIn =
        checkIns.some((v) => v.userId === meeting.creatorId) &&
        checkIns.some((v) => v.userId === meeting.bookerId);

      if (bothCheckedIn) {
        transaction.update(meetingRef, {
          status: 'IN_PROGRESS',
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    } else {
      // CHECK_OUT
      // Check if both users have checked out
      const validationsSnapshot = await db
        .collection('meetings')
        .doc(meetingId)
        .collection('validations')
        .where('validationType', '==', 'CHECK_OUT')
        .get();

      const checkOuts = validationsSnapshot.docs.map((doc) => doc.data());
      const bothCheckedOut =
        checkOuts.some((v) => v.userId === meeting.creatorId) &&
        checkOuts.some((v) => v.userId === meeting.bookerId);

      if (bothCheckedOut) {
        transaction.update(meetingRef, {
          status: 'COMPLETED',
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Release escrow to creator
        await releaseEscrowAfterCompletion(meetingId, transaction);
      }
    }

    logger.info(
      `Meeting ${validationType} validated: ${meetingId} by ${userId}`
    );

    return {
      validationId: validationRef.id,
      verified: true,
      message: `${validationType} successful`,
    };
  });
}

/**
 * Release escrow to creator after meeting completion
 */
async function releaseEscrowAfterCompletion(
  meetingId: string,
  transaction: FirebaseFirestore.Transaction
): Promise<void> {
  // Get booking
  const bookingsSnapshot = await db
    .collection('meeting_bookings')
    .where('meetingId', '==', meetingId)
    .where('escrowStatus', '==', 'HELD')
    .limit(1)
    .get();

  if (bookingsSnapshot.empty) {
    logger.warn(`No held escrow found for meeting ${meetingId}`);
    return;
  }

  const bookingDoc = bookingsSnapshot.docs[0];
  const booking = bookingDoc.data() as MeetingBooking;

  // Credit creator
  const creatorRef = db.collection('users').doc(booking.creatorId);
  transaction.update(creatorRef, {
    tokenBalance: FieldValue.increment(booking.escrowAmount),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Update booking
  transaction.update(bookingDoc.ref, {
    escrowStatus: 'RELEASED',
    releasedAt: FieldValue.serverTimestamp(),
  });

  // Record transaction
  const transactionRef = db.collection('transactions').doc();
  transaction.set(transactionRef, {
    transactionId: transactionRef.id,
    type: 'meeting_escrow_release',
    fromUserId: booking.bookerId,
    toUserId: booking.creatorId,
    amount: booking.escrowAmount,
    meetingId,
    bookingId: booking.bookingId,
    timestamp: FieldValue.serverTimestamp(),
    metadata: {
      releaseReason: 'meeting_completed',
    },
  });

  logger.info(
    `Escrow released: ${booking.escrowAmount} tokens to ${booking.creatorId} for meeting ${meetingId}`
  );
}

// ============================================================================
// REFUND LOGIC
// ============================================================================

/**
 * Request a refund for a meeting
 */
export async function requestMeetingRefund(
  meetingId: string,
  requesterId: string,
  refundReason: RefundReason,
  evidence?: {
    selfies?: string[];
    panicAlertId?: string;
    complainantStatement?: string;
  }
): Promise<{ refundId: string; status: string }> {
  return await db.runTransaction(async (transaction) => {
    // Get meeting
    const meetingRef = db.collection('meetings').doc(meetingId);
    const meetingDoc = await transaction.get(meetingRef);

    if (!meetingDoc.exists) {
      throw new HttpsError('not-found', 'Meeting not found');
    }

    const meeting = meetingDoc.data() as Meeting;

    // Verify requester is participant
    if (requesterId !== meeting.creatorId && requesterId !== meeting.bookerId) {
      throw new HttpsError(
        'permission-denied',
        'Only meeting participants can request refunds'
      );
    }

    // Get booking
    const bookingsSnapshot = await db
      .collection('meeting_bookings')
      .where('meetingId', '==', meetingId)
      .limit(1)
      .get();

    if (bookingsSnapshot.empty) {
      throw new HttpsError('not-found', 'Booking not found');
    }

    const bookingDoc = bookingsSnapshot.docs[0];
    const booking = bookingDoc.data() as MeetingBooking;

    // Validate refund eligibility
    if (booking.escrowStatus === 'RELEASED') {
      throw new HttpsError(
        'failed-precondition',
        'Cannot refund - escrow already released'
      );
    }

    if (booking.escrowStatus === 'REFUNDED') {
      throw new HttpsError('failed-precondition', 'Already refunded');
    }

    // Calculate refund amount
    let refundAmount = booking.escrowAmount;
    let avaloFeeRefunded = false;

    // Avalo fee is non-refundable EXCEPT in confirmed fraud cases (PACK 248)
    if (refundReason === 'IDENTITY_MISMATCH') {
      // Fraud case - full refund including Avalo fee
      refundAmount = booking.totalTokens;
      avaloFeeRefunded = true;
    }

    // Create refund request
    const refundRef = db.collection('meeting_refunds').doc();
    const refund: MeetingRefund = {
      refundId: refundRef.id,
      meetingId,
      bookingId: booking.bookingId,
      bookerId: booking.bookerId,
      creatorId: booking.creatorId,
      requesterId,
      refundReason,
      refundAmount,
      avaloFeeRefunded,
      status: 'PENDING',
      evidence,
      createdAt: Timestamp.now(),
    };

    transaction.set(refundRef, refund);

    // Auto-approve certain types of refunds
    if (refundReason === 'CREATOR_VOLUNTARY' || refundReason === 'MUTUAL_AGREEMENT') {
      // Process immediately
      await processRefundApproval(refundRef.id, 'system', transaction);
    }

    logger.info(
      `Refund requested: ${refundRef.id} for meeting ${meetingId}. Reason: ${refundReason}`
    );

    return {
      refundId: refundRef.id,
      status: refund.status,
    };
  });
}

/**
 * Process refund approval (moderator or system)
 */
async function processRefundApproval(
  refundId: string,
  reviewerId: string,
  transaction: FirebaseFirestore.Transaction
): Promise<void> {
  const refundRef = db.collection('meeting_refunds').doc(refundId);
  const refundDoc = await transaction.get(refundRef);

  if (!refundDoc.exists) {
    throw new HttpsError('not-found', 'Refund not found');
  }

  const refund = refundDoc.data() as MeetingRefund;

  // Get booking
  const bookingRef = db.collection('meeting_bookings').doc(refund.bookingId);
  const bookingDoc = await transaction.get(bookingRef);
  const booking = bookingDoc.data() as MeetingBooking;

  // Refund booker
  const bookerRef = db.collection('users').doc(refund.bookerId);
  transaction.update(bookerRef, {
    tokenBalance: FieldValue.increment(refund.refundAmount),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // If Avalo fee refunded (fraud case), deduct from Avalo wallet
  if (refund.avaloFeeRefunded) {
    const avaloWalletRef = db.collection('system').doc('avalo_wallet');
    transaction.update(avaloWalletRef, {
      balance: FieldValue.increment(-booking.platformFee),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  // Update booking
  transaction.update(bookingRef, {
    escrowStatus: 'REFUNDED',
    refundedAt: FieldValue.serverTimestamp(),
  });

  // Update refund
  transaction.update(refundRef, {
    status: 'PROCESSED',
    reviewedBy: reviewerId,
    reviewedAt: FieldValue.serverTimestamp(),
    processedAt: FieldValue.serverTimestamp(),
  });

  // Record transaction
  const transactionRef = db.collection('transactions').doc();
  transaction.set(transactionRef, {
    transactionId: transactionRef.id,
    type: 'meeting_refund',
    fromUserId: refund.creatorId,
    toUserId: refund.bookerId,
    amount: refund.refundAmount,
    meetingId: refund.meetingId,
    refundId,
    timestamp: FieldValue.serverTimestamp(),
    metadata: {
      refundReason: refund.refundReason,
      avaloFeeRefunded: refund.avaloFeeRefunded,
    },
  });

  // Update meeting status
  const meetingRef = db.collection('meetings').doc(refund.meetingId);
  transaction.update(meetingRef, {
    status: 'REFUNDED',
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.info(
    `Refund processed: ${refundId}. Amount: ${refund.refundAmount} tokens`
  );
}

// ============================================================================
// PANIC MODE
// ============================================================================

/**
 * Trigger panic alert during meeting
 */
export async function triggerPanicAlert(
  meetingId: string,
  userId: string,
  alertType: AlertType,
  alertData: {
    location: { lat: number; lng: number };
    selfieUrl?: string;
    trustedContactId?: string;
  }
): Promise<{ alertId: string; emergencyContactNotified: boolean }> {
  return await db.runTransaction(async (transaction) => {
    // Get meeting
    const meetingRef = db.collection('meetings').doc(meetingId);
    const meetingDoc = await transaction.get(meetingRef);

    if (!meetingDoc.exists) {
      throw new HttpsError('not-found', 'Meeting not found');
    }

    const meeting = meetingDoc.data() as Meeting;

    // Verify user is participant
    if (userId !== meeting.creatorId && userId !== meeting.bookerId) {
      throw new HttpsError(
        'permission-denied',
        'Only meeting participants can trigger alerts'
      );
    }

    // Get the other participant's info
    const otherUserId = userId === meeting.creatorId ? meeting.bookerId : meeting.creatorId;
    const otherUserDoc = await transaction.get(db.collection('users').doc(otherUserId!));
    const otherUser = otherUserDoc.data();

    // Create panic alert
    const alertRef = db
      .collection('meetings')
      .doc(meetingId)
      .collection('panic_alerts')
      .doc();

    const alert: PanicAlert = {
      alertId: alertRef.id,
      meetingId,
      userId,
      alertType,
      location: alertData.location,
      timestamp: Timestamp.now(),
      status: 'ACTIVE',
      trustedContactId: alertData.trustedContactId,
      emergencyContactNotified: false,
      selfieUrl: alertData.selfieUrl,
      matchedUserProfile: otherUser ? {
        userId: otherUserId!,
        name: otherUser.displayName || 'Anonymous',
        profilePhotoUrl: otherUser.photoURL || '',
      } : undefined,
    };

    transaction.set(alertRef, alert);

    // End meeting immediately
    transaction.update(meetingRef, {
      status: 'CANCELLED',
      cancelledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Increment risk score for reported user
    const reportedUserRef = db.collection('users').doc(otherUserId!);
    transaction.update(reportedUserRef, {
      riskScore: FieldValue.increment(60),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Log safety incident
    const safetyLogRef = db.collection('meeting_safety_logs').doc();
    transaction.set(safetyLogRef, {
      logId: safetyLogRef.id,
      meetingId,
      userId,
      reportedUserId: otherUserId,
      logType: 'PANIC_ALERT',
      severity: alertType === 'EMERGENCY' ? 'CRITICAL' : 'HIGH',
      alertType,
      location: alertData.location,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Send notification to trusted contact (handled async)
    if (alertData.trustedContactId) {
      // This would trigger a cloud function to send SMS/notification
      logger.info(
        `Panic alert triggered: ${alertRef.id}. Notifying contact: ${alertData.trustedContactId}`
      );
    }

    logger.info(
      `Panic alert activated: ${alertRef.id} for meeting ${meetingId} by ${userId}`
    );

    return {
      alertId: alertRef.id,
      emergencyContactNotified: !!alertData.trustedContactId,
    };
  });
}

// ============================================================================
// POST-MEETING RATING
// ============================================================================

/**
 * Submit rating after meeting completion
 */
export async function submitMeetingRating(
  meetingId: string,
  raterId: string,
  ratingData: {
    ratingType: RatingType;
    reportReason?: string;
    privateNotes?: string;
  }
): Promise<{ ratingId: string }> {
  return await db.runTransaction(async (transaction) => {
    // Get meeting
    const meetingRef = db.collection('meetings').doc(meetingId);
    const meetingDoc = await transaction.get(meetingRef);

    if (!meetingDoc.exists) {
      throw new HttpsError('not-found', 'Meeting not found');
    }

    const meeting = meetingDoc.data() as Meeting;

    // Verify meeting is completed
    if (meeting.status !== 'COMPLETED') {
      throw new HttpsError(
        'failed-precondition',
        'Can only rate completed meetings'
      );
    }

    // Verify rater is participant
    if (raterId !== meeting.creatorId && raterId !== meeting.bookerId) {
      throw new HttpsError(
        'permission-denied',
        'Only meeting participants can rate'
      );
    }

    // Check rating window
    if (meeting.completedAt) {
      const hoursElapsed =
        (Date.now() - meeting.completedAt.toMillis()) / (1000 * 60 * 60);
      if (hoursElapsed > MEETING_CONFIG.RATING_WINDOW_HOURS) {
        throw new HttpsError(
          'failed-precondition',
          `Rating window expired (${MEETING_CONFIG.RATING_WINDOW_HOURS} hours)`
        );
      }
    }

    // Determine rated user
    const ratedUserId = raterId === meeting.creatorId ? meeting.bookerId : meeting.creatorId;

    // Check if already rated
    const existingRatings = await db
      .collection('meeting_ratings')
      .where('meetingId', '==', meetingId)
      .where('raterId', '==', raterId)
      .get();

    if (!existingRatings.empty) {
      throw new HttpsError('already-exists', 'Already rated this meeting');
    }

    // Create rating
    const ratingRef = db.collection('meeting_ratings').doc();
    const rating: MeetingRating = {
      ratingId: ratingRef.id,
      meetingId,
      raterId,
      ratedUserId: ratedUserId!,
      ratingType: ratingData.ratingType,
      reportReason: ratingData.reportReason,
      privateNotes: ratingData.privateNotes,
      createdAt: Timestamp.now(),
    };

    transaction.set(ratingRef, rating);

    // Update rated user's stats and riskScore
    const ratedUserRef = db.collection('users').doc(ratedUserId!);
    
    if (ratingData.ratingType === 'POSITIVE') {
      transaction.update(ratedUserRef, {
        'meetingStats.positiveRatings': FieldValue.increment(1),
        ranking: FieldValue.increment(5), // Boost ranking
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (ratingData.ratingType === 'NEGATIVE') {
      transaction.update(ratedUserRef, {
        'meetingStats.negativeRatings': FieldValue.increment(1),
        riskScore: FieldValue.increment(25),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (ratingData.ratingType === 'REPORT') {
      transaction.update(ratedUserRef, {
        'meetingStats.reports': FieldValue.increment(1),
        riskScore: FieldValue.increment(50),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Create investigation
      const investigationRef = db.collection('meeting_safety_logs').doc();
      transaction.set(investigationRef, {
        logId: investigationRef.id,
        meetingId,
        userId: raterId,
        reportedUserId: ratedUserId,
        logType: 'POST_MEETING_REPORT',
        severity: 'MEDIUM',
        reportReason: ratingData.reportReason,
        requiresReview: true,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    logger.info(
      `Meeting rated: ${meetingId} by ${raterId}. Type: ${ratingData.ratingType}`
    );

    return { ratingId: ratingRef.id };
  });
}
