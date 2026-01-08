/**
 * PACK 209: Unified Meeting & Event Refund & Complaint Extensions
 * Core engine for refund calculations, complaint processing, and voluntary refunds
 */

import { db, serverTimestamp, increment, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  RefundTrigger,
  ComplaintDecision,
  ComplaintType,
  AppearanceComplaint,
  VoluntaryRefund,
  RefundTransaction,
  TrustSafetyIncident,
  RefundCalculation,
  MEETING_REFUND_POLICIES,
  EVENT_REFUND_POLICY,
} from './pack209-refund-complaint-types';

// ============================================================================
// REFUND CALCULATION - 1:1 MEETINGS
// ============================================================================

/**
 * Calculate refund amount for a 1:1 meeting cancellation
 * Rules:
 * - 65% earner share, 35% Avalo commission (NEVER refunded)
 * - ≥72h: 100% of earner share refunded to payer
 * - 24-72h: 50% of earner share refunded, 50% kept by earner
 * - <24h: 0% refunded, earner keeps 100% of their share
 */
export async function calculateMeetingRefund(params: {
  bookingId: string;
  meetingStartTime: Date;
  priceTokens: number;
  earnerShareTokens: number; // Should be 65% of price
  avaloCommission: number; // Should be 35% of price
  cancelledBy: 'payer' | 'earner';
}): Promise<RefundCalculation> {
  const {
    meetingStartTime,
    priceTokens,
    earnerShareTokens,
    avaloCommission,
    cancelledBy,
  } = params;

  const now = new Date();
  const hoursUntilMeeting = (meetingStartTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  // Earner cancels: Full refund of earner share (100%)
  if (cancelledBy === 'earner') {
    return {
      canRefund: true,
      refundToPayerAmount: earnerShareTokens,
      earnerKeeptAmount: 0,
      avaloKeepsAmount: avaloCommission,
      policy: { 
        hoursBeforeMeeting: hoursUntilMeeting,
        refundToPayerPercent: 100,
        earnerKeepPercent: 0,
        avaloCommissionRefundable: false,
      },
      reason: 'Earner cancelled - full refund of earner share',
    };
  }

  // Payer cancels - apply time-based policy
  if (hoursUntilMeeting >= 72) {
    // EARLY cancellation
    const policy = MEETING_REFUND_POLICIES.EARLY;
    const refundAmount = Math.floor(earnerShareTokens * (policy.refundToPayerPercent / 100));
    
    return {
      canRefund: true,
      refundToPayerAmount: refundAmount,
      earnerKeeptAmount: 0,
      avaloKeepsAmount: avaloCommission,
      policy,
      reason: `Cancelled ${Math.floor(hoursUntilMeeting)}h before meeting - early cancellation policy`,
    };
  } else if (hoursUntilMeeting >= 24) {
    // MID cancellation
    const policy = MEETING_REFUND_POLICIES.MID;
    const refundAmount = Math.floor(earnerShareTokens * (policy.refundToPayerPercent / 100));
    const earnerKeeps = Math.floor(earnerShareTokens * (policy.earnerKeepPercent / 100));
    
    return {
      canRefund: true,
      refundToPayerAmount: refundAmount,
      earnerKeeptAmount: earnerKeeps,
      avaloKeepsAmount: avaloCommission,
      policy,
      reason: `Cancelled ${Math.floor(hoursUntilMeeting)}h before meeting - mid cancellation policy`,
    };
  } else {
    // LATE cancellation
    const policy = MEETING_REFUND_POLICIES.LATE;
    
    return {
      canRefund: false,
      refundToPayerAmount: 0,
      earnerKeeptAmount: earnerShareTokens,
      avaloKeepsAmount: avaloCommission,
      policy,
      reason: `Cancelled ${Math.floor(hoursUntilMeeting)}h before meeting - late cancellation, no refund`,
    };
  }
}

// ============================================================================
// REFUND CALCULATION - EVENTS
// ============================================================================

/**
 * Calculate refund amount for event cancellation
 * Rules:
 * - 80% organizer share, 20% Avalo commission (NEVER refunded)
 * - Participant cancels: No refund (ticket lost)
 * - Organizer cancels: 100% of organizer share (80%) refunded to participants
 * - No show: No refund
 */
export async function calculateEventRefund(params: {
  eventId: string;
  priceTokens: number;
  organizerShareTokens: number; // Should be 80% of price
  avaloCommission: number; // Should be 20% of price
  cancelledBy: 'participant' | 'organizer';
  reason?: string;
}): Promise<RefundCalculation> {
  const { organizerShareTokens, avaloCommission, cancelledBy } = params;

  if (cancelledBy === 'organizer') {
    // Organizer cancels - full refund of organizer share
    return {
      canRefund: true,
      refundToPayerAmount: organizerShareTokens,
      earnerKeeptAmount: 0,
      avaloKeepsAmount: avaloCommission,
      policy: EVENT_REFUND_POLICY,
      reason: 'Organizer cancelled event - full refund of organizer share',
    };
  } else {
    // Participant cancels - no refund
    return {
      canRefund: false,
      refundToPayerAmount: 0,
      earnerKeeptAmount: organizerShareTokens,
      avaloKeepsAmount: avaloCommission,
      policy: EVENT_REFUND_POLICY,
      reason: 'Participant cancelled - no refunds per policy',
    };
  }
}

// ============================================================================
// APPEARANCE COMPLAINT - 1:1 MEETINGS
// ============================================================================

/**
 * Process appearance/identity complaint during a 1:1 meeting
 * Either party can file a complaint with live selfie comparison
 */
export async function processAppearanceComplaint(params: {
  bookingId: string;
  complainantId: string;
  reportedUserId: string;
  liveSelfieUrl: string;
  decision: ComplaintDecision;
  notes?: string;
  mismatchScore?: number;
  location?: { latitude: number; longitude: number };
  deviceId?: string;
  ipHash?: string;
}): Promise<{ complaintId: string; refundAmount: number; trustIncidentId: string }> {
  const {
    bookingId,
    complainantId,
    reportedUserId,
    liveSelfieUrl,
    decision,
    notes,
    mismatchScore,
    location,
    deviceId,
    ipHash,
  } = params;

  // Get booking details
  const bookingSnap = await db.collection('calendarBookings').doc(bookingId).get();
  if (!bookingSnap.exists) {
    throw new Error('Booking not found');
  }

  const booking = bookingSnap.data() as any;
  const priceTokens = booking.priceTokens;
  const earnerShareTokens = booking.payment.escrowTokens;
  const avaloCommission = booking.payment.platformFeeTokens;

  // Get user names
  const complainantSnap = await db.collection('users').doc(complainantId).get();
  const reportedSnap = await db.collection('users').doc(reportedUserId).get();
  
  const complainantName = complainantSnap.data()?.displayName || 'Unknown';
  const reportedUserName = reportedSnap.data()?.displayName || 'Unknown';

  // Get reported user's profile photos
  const reportedUserData = reportedSnap.data();
  const profilePhotosUrls = reportedUserData?.photos || [];

  const complaintId = generateId();
  const trustIncidentId = generateId();

  let refundAmount = 0;
  let trustScoreImpact = 0;

  // Process based on decision
  if (decision === ComplaintDecision.ISSUE_REFUND) {
    // Refund 100% of earner share to payer, earner gets 0
    refundAmount = earnerShareTokens;
    trustScoreImpact = -50; // Significant trust score penalty

    // Process refund transaction
    await db.runTransaction(async (transaction) => {
      // Return earner share to payer
      const payerWalletRef = db
        .collection('users')
        .doc(booking.bookerId)
        .collection('wallet')
        .doc('current');
      
      transaction.update(payerWalletRef, {
        balance: increment(refundAmount),
        pending: increment(-refundAmount),
      });

      // Record refund transaction
      const refundTxId = generateId();
      const refundTransaction: RefundTransaction = {
        transactionId: refundTxId,
        refundType: RefundTrigger.APPEARANCE_MISMATCH,
        bookingId,
        complaintId,
        payerId: booking.bookerId,
        earnerId: booking.creatorId,
        originalAmount: priceTokens,
        earnerShare: earnerShareTokens,
        avaloCommission,
        refundToPayerAmount: refundAmount,
        earnerKeptAmount: 0,
        avaloKeptAmount: avaloCommission,
        triggeredBy: complainantId,
        automaticRefund: false,
        notes: 'Appearance mismatch complaint - refund issued',
        createdAt: serverTimestamp() as Timestamp,
        processedAt: serverTimestamp() as Timestamp,
        metadata: {
          source: 'meeting',
          cancellationReason: 'appearance_mismatch',
        },
      };
      transaction.set(db.collection('refund_transactions').doc(refundTxId), refundTransaction);

      // Update booking status
      transaction.update(db.collection('calendarBookings').doc(bookingId), {
        status: 'COMPLAINT_REFUNDED',
        complaintId,
        updatedAt: serverTimestamp(),
      });
    });
  } else {
    // KEEP_COMPLETED - no refund, but flag profile
    trustScoreImpact = -20; // Moderate trust score penalty for flagging
  }

  // Create complaint record
  const complaint: AppearanceComplaint = {
    complaintId,
    bookingId,
    type: ComplaintType.APPEARANCE_MISMATCH,
    complainantId,
    complainantName,
    reportedUserId,
    reportedUserName,
    decision,
    liveSelfieUrl,
    profilePhotosUrls,
    mismatchScore,
    manualReview: mismatchScore ? mismatchScore > 50 : true,
    refundAmount,
    tokensKept: avaloCommission,
    notes,
    trustScoreImpact,
    createdAt: serverTimestamp() as Timestamp,
    resolvedAt: serverTimestamp() as Timestamp,
    metadata: {
      deviceId,
      ipHash,
      location,
    },
  };

  await db.collection('appearance_complaints').doc(complaintId).set(complaint);

  // Create trust & safety incident
  const incident: TrustSafetyIncident = {
    incidentId: trustIncidentId,
    type: 'APPEARANCE_COMPLAINT',
    userId: reportedUserId,
    userName: reportedUserName,
    relatedUserId: complainantId,
    complaintId,
    bookingId,
    severity: decision === ComplaintDecision.ISSUE_REFUND ? 'HIGH' : 'MEDIUM',
    description: `Appearance mismatch complaint filed. Decision: ${decision}`,
    actionTaken: decision === ComplaintDecision.ISSUE_REFUND ? 'PHOTO_UPDATE_REQUIRED' : 'FLAGGED',
    trustScoreImpact,
    requiresManualReview: true,
    createdAt: serverTimestamp() as Timestamp,
    metadata: {
      selfieUrls: [liveSelfieUrl],
      comparisonScore: mismatchScore,
    },
  };

  await db.collection('trust_safety_incidents').doc(trustIncidentId).set(incident);

  // Update user trust score (async)
  updateUserTrustScore(reportedUserId, trustScoreImpact).catch(() => {});

  return { complaintId, refundAmount, trustIncidentId };
}

// ============================================================================
// APPEARANCE COMPLAINT - EVENTS
// ============================================================================

/**
 * Process appearance complaint for event (organizer decides)
 */
export async function processEventAppearanceComplaint(params: {
  eventId: string;
  attendeeId: string;
  organizerId: string;
  reportedUserId: string;
  shouldRefund: boolean;
  notes?: string;
}): Promise<{ complaintId: string; refundAmount: number }> {
  const { eventId, attendeeId, organizerId, reportedUserId, shouldRefund, notes } = params;

  // Get attendee record
  const attendeeSnap = await db.collection('event_attendees').doc(attendeeId).get();
  if (!attendeeSnap.exists) {
    throw new Error('Attendee not found');
  }

  const attendee = attendeeSnap.data() as any;
  const priceTokens = attendee.tokensAmount;
  const organizerShare = attendee.creatorEarnings; // 80%
  const avaloCommission = attendee.platformFee; // 20%

  const complaintId = generateId();
  let refundAmount = 0;

  if (shouldRefund) {
    // Refund 80% (organizer share) to participant
    refundAmount = organizerShare;

    await db.runTransaction(async (transaction) => {
      // Refund to participant
      const participantWalletRef = db
        .collection('users')
        .doc(reportedUserId)
        .collection('wallet')
        .doc('current');
      
      transaction.update(participantWalletRef, {
        balance: increment(refundAmount),
      });

      // Deduct from organizer (they chose to refund)
      const organizerWalletRef = db
        .collection('users')
        .doc(organizerId)
        .collection('wallet')
        .doc('current');
      
      transaction.update(organizerWalletRef, {
        balance: increment(-refundAmount),
      });

      // Update attendee status
      transaction.update(db.collection('event_attendees').doc(attendeeId), {
        status: 'REFUNDED_COMPLAINT',
        complaintId,
      });

      // Record refund transaction
      const refundTxId = generateId();
      const refundTransaction: RefundTransaction = {
        transactionId: refundTxId,
        refundType: RefundTrigger.APPEARANCE_MISMATCH,
        eventId,
        attendeeId,
        complaintId,
        payerId: reportedUserId,
        earnerId: organizerId,
        originalAmount: priceTokens,
        earnerShare: organizerShare,
        avaloCommission,
        refundToPayerAmount: refundAmount,
        earnerKeptAmount: 0,
        avaloKeptAmount: avaloCommission,
        triggeredBy: organizerId,
        automaticRefund: false,
        notes: notes || 'Event appearance complaint - organizer issued refund',
        createdAt: serverTimestamp() as Timestamp,
        processedAt: serverTimestamp() as Timestamp,
        metadata: {
          source: 'event',
        },
      };
      transaction.set(db.collection('refund_transactions').doc(refundTxId), refundTransaction);
    });
  }

  // Create complaint record
  const complaint: AppearanceComplaint = {
    complaintId,
    eventId,
    type: ComplaintType.APPEARANCE_MISMATCH,
    complainantId: organizerId,
    complainantName: 'Organizer',
    reportedUserId,
    reportedUserName: 'Participant',
    decision: shouldRefund ? ComplaintDecision.ISSUE_REFUND : ComplaintDecision.KEEP_COMPLETED,
    refundAmount,
    tokensKept: avaloCommission,
    notes,
    trustScoreImpact: shouldRefund ? -30 : -10,
    createdAt: serverTimestamp() as Timestamp,
    resolvedAt: serverTimestamp() as Timestamp,
  };

  await db.collection('appearance_complaints').doc(complaintId).set(complaint);

  return { complaintId, refundAmount };
}

// ============================================================================
// VOLUNTARY REFUND - 1:1 MEETINGS
// ============================================================================

/**
 * Process voluntary refund from earner to payer
 * Earner can refund 0-100% of their share (65%)
 * Avalo commission (35%) is NEVER refunded
 */
export async function processVoluntaryMeetingRefund(params: {
  bookingId: string;
  earnerId: string;
  refundPercent: number; // 0-100
  reason?: string;
}): Promise<{ refundId: string; refundAmount: number }> {
  const { bookingId, earnerId, refundPercent, reason } = params;

  // Validate refund percent
  if (refundPercent < 0 || refundPercent > 100) {
    throw new Error('Refund percent must be between 0 and 100');
  }

  // Get booking details
  const bookingSnap = await db.collection('calendarBookings').doc(bookingId).get();
  if (!bookingSnap.exists) {
    throw new Error('Booking not found');
  }

  const booking = bookingSnap.data() as any;

  // Verify booking is completed
  if (booking.status !== 'COMPLETED') {
    throw new Error('Can only issue voluntary refund for completed bookings');
  }

  // Verify caller is the earner
  if (booking.creatorId !== earnerId) {
    throw new Error('Only the earner can issue voluntary refunds');
  }

  const priceTokens = booking.priceTokens;
  const earnerShareTokens = booking.payment.escrowTokens; // 65%
  const avaloCommission = booking.payment.platformFeeTokens; // 35%

  // Calculate refund amount
  const refundAmount = Math.floor(earnerShareTokens * (refundPercent / 100));

  // Get user names
  const earnerSnap = await db.collection('users').doc(earnerId).get();
  const payerSnap = await db.collection('users').doc(booking.bookerId).get();
  
  const earnerName = earnerSnap.data()?.displayName || 'Unknown';
  const payerName = payerSnap.data()?.displayName || 'Unknown';

  const refundId = generateId();

  // Process voluntary refund
  await db.runTransaction(async (transaction) => {
    // Transfer from earner to payer
    const earnerWalletRef = db
      .collection('users')
      .doc(earnerId)
      .collection('wallet')
      .doc('current');
    
    const payerWalletRef = db
      .collection('users')
      .doc(booking.bookerId)
      .collection('wallet')
      .doc('current');

    transaction.update(earnerWalletRef, {
      balance: increment(-refundAmount),
      earned: increment(-refundAmount),
    });

    transaction.update(payerWalletRef, {
      balance: increment(refundAmount),
    });

    // Create voluntary refund record
    const voluntaryRefund: VoluntaryRefund = {
      refundId,
      bookingId,
      issuedBy: earnerId,
      issuedByName: earnerName,
      recipientId: booking.bookerId,
      recipientName: payerName,
      originalAmount: priceTokens,
      earnerShareAmount: earnerShareTokens,
      avaloCommission,
      refundPercent,
      refundAmount,
      reason,
      createdAt: serverTimestamp() as Timestamp,
      processedAt: serverTimestamp() as Timestamp,
      metadata: {
        source: 'meeting',
      },
    };

    transaction.set(db.collection('voluntary_refunds').doc(refundId), voluntaryRefund);

    // Record transaction
    const txId = generateId();
    transaction.set(db.collection('transactions').doc(txId), {
      txId,
      userId: booking.bookerId,
      type: 'VOLUNTARY_REFUND',
      amountTokens: refundAmount,
      status: 'completed',
      metadata: {
        bookingId,
        refundId,
        issuedBy: earnerId,
        refundPercent,
      },
      createdAt: serverTimestamp(),
      completedAt: serverTimestamp(),
    });
  });

  return { refundId, refundAmount };
}

// ============================================================================
// VOLUNTARY REFUND - EVENTS
// ============================================================================

/**
 * Process voluntary refund from organizer to specific attendee
 * Organizer can refund 0-100% of their share (80%)
 * Avalo commission (20%) is NEVER refunded
 */
export async function processVoluntaryEventRefund(params: {
  eventId: string;
  attendeeId: string;
  organizerId: string;
  refundPercent: number; // 0-100
  reason?: string;
}): Promise<{ refundId: string; refundAmount: number }> {
  const { eventId, attendeeId, organizerId, refundPercent, reason } = params;

  // Validate refund percent
  if (refundPercent < 0 || refundPercent > 100) {
    throw new Error('Refund percent must be between 0 and 100');
  }

  // Get attendee details
  const attendeeSnap = await db.collection('event_attendees').doc(attendeeId).get();
  if (!attendeeSnap.exists) {
    throw new Error('Attendee not found');
  }

  const attendee = attendeeSnap.data() as any;

  // Verify organizer
  if (attendee.hostUserId !== organizerId) {
    throw new Error('Only the organizer can issue voluntary refunds');
  }

  const priceTokens = attendee.tokensAmount;
  const organizerShare = attendee.creatorEarnings; // 80%
  const avaloCommission = attendee.platformFee; // 20%

  // Calculate refund amount
  const refundAmount = Math.floor(organizerShare * (refundPercent / 100));

  const refundId = generateId();

  // Process voluntary refund
  await db.runTransaction(async (transaction) => {
    // Transfer from organizer to attendee
    const organizerWalletRef = db
      .collection('users')
      .doc(organizerId)
      .collection('wallet')
      .doc('current');
    
    const attendeeWalletRef = db
      .collection('users')
      .doc(attendee.userId)
      .collection('wallet')
      .doc('current');

    transaction.update(organizerWalletRef, {
      balance: increment(-refundAmount),
      earned: increment(-refundAmount),
    });

    transaction.update(attendeeWalletRef, {
      balance: increment(refundAmount),
    });

    // Create voluntary refund record
    const voluntaryRefund: VoluntaryRefund = {
      refundId,
      eventId,
      attendeeId,
      issuedBy: organizerId,
      issuedByName: 'Organizer',
      recipientId: attendee.userId,
      recipientName: attendee.userName,
      originalAmount: priceTokens,
      earnerShareAmount: organizerShare,
      avaloCommission,
      refundPercent,
      refundAmount,
      reason,
      createdAt: serverTimestamp() as Timestamp,
      processedAt: serverTimestamp() as Timestamp,
      metadata: {
        source: 'event',
      },
    };

    transaction.set(db.collection('voluntary_refunds').doc(refundId), voluntaryRefund);

    // Update attendee record
    transaction.update(db.collection('event_attendees').doc(attendeeId), {
      voluntaryRefundId: refundId,
      voluntaryRefundAmount: refundAmount,
    });
  });

  return { refundId, refundAmount };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Update user trust score after complaint
 */
async function updateUserTrustScore(userId: string, scoreDelta: number): Promise<void> {
  const trustProfileRef = db.collection('user_trust_profile').doc(userId);
  
  await trustProfileRef.set(
    {
      userId,
      appearanceComplaints: increment(1),
      trustScoreAdjustments: increment(scoreDelta),
      lastIncidentAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Get refund history for a user
 */
export async function getUserRefundHistory(params: {
  userId: string;
  limit?: number;
}): Promise<{
  refunds: RefundTransaction[];
  voluntaryRefunds: VoluntaryRefund[];
  complaints: AppearanceComplaint[];
}> {
  const { userId, limit = 20 } = params;

  // Get refund transactions
  const refundsSnap = await db
    .collection('refund_transactions')
    .where('payerId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  const refunds = refundsSnap.docs.map(doc => doc.data() as RefundTransaction);

  // Get voluntary refunds (both issued and received)
  const voluntaryIssuedSnap = await db
    .collection('voluntary_refunds')
    .where('issuedBy', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  const voluntaryReceivedSnap = await db
    .collection('voluntary_refunds')
    .where('recipientId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  const voluntaryRefunds = [
    ...voluntaryIssuedSnap.docs.map(doc => doc.data() as VoluntaryRefund),
    ...voluntaryReceivedSnap.docs.map(doc => doc.data() as VoluntaryRefund),
  ];

  // Get complaints
  const complaintsFiledSnap = await db
    .collection('appearance_complaints')
    .where('complainantId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  const complaintsReceivedSnap = await db
    .collection('appearance_complaints')
    .where('reportedUserId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  const complaints = [
    ...complaintsFiledSnap.docs.map(doc => doc.data() as AppearanceComplaint),
    ...complaintsReceivedSnap.docs.map(doc => doc.data() as AppearanceComplaint),
  ];

  return { refunds, voluntaryRefunds, complaints };
}