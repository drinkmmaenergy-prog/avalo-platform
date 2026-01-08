/**
 * PACK 198 — Dating Funnel Phases 3 & 4
 * 
 * Phase 3: Connection (emotional acceleration, calls, calendar)
 * Phase 4: Meeting IRL (verification, safety, paid booking)
 */

import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import type { ConnectionSession, MeetingVerification, PaidTimeBooking, FunnelProgress } from './datingFunnel';

// Configuration from main file
const FUNNEL_CONFIG = {
  CONNECTION: {
    EMOTIONAL_ACCELERATION_THRESHOLD: 60,
  },
  MEETING: {
    QR_VERIFICATION_REQUIRED: true,
    SELFIE_VERIFICATION_OPTIONAL: true,
    SAFETY_TRACKING_DURATION_HOURS: 4,
    MIN_PAID_TIME_BOOKING_MINUTES: 30,
    MAX_PAID_TIME_BOOKING_MINUTES: 480,
    PLATFORM_FEE_PERCENT: 20,
    HOST_EARNING_PERCENT: 80,
  },
};

// ============================================================================
// PHASE 3: CONNECTION
// ============================================================================

/**
 * Initialize connection session
 */
export async function initializeConnectionSession(
  user1Id: string,
  user2Id: string
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  const db = getFirestore();

  try {
    const sessionRef = db.collection('connection_sessions').doc();
    const sessionId = sessionRef.id;

    const sessionData: ConnectionSession = {
      sessionId,
      user1Id,
      user2Id,
      phase: 'CONNECTION',
      currentActivity: 'MESSAGING',
      emotionalScore: 0,
      callsCompleted: 0,
      eventsScheduled: 0,
      nextMilestone: 'Complete first voice call',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await sessionRef.set(sessionData);

    logger.info(`Connection session initialized: ${sessionId}`);

    return { success: true, sessionId };
  } catch (error) {
    logger.error('Error initializing connection session:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Update connection session after call completion
 * Integrates with callMonetization.ts
 */
export async function updateConnectionAfterCall(
  user1Id: string,
  user2Id: string,
  callType: 'VOICE' | 'VIDEO',
  durationMinutes: number
): Promise<{ success: boolean; emotionalScore?: number; error?: string }> {
  const db = getFirestore();

  try {
    const sessionsSnapshot = await db
      .collection('connection_sessions')
      .where('user1Id', 'in', [user1Id, user2Id])
      .where('user2Id', 'in', [user1Id, user2Id])
      .where('phase', '==', 'CONNECTION')
      .limit(1)
      .get();

    if (sessionsSnapshot.empty) {
      return { success: false, error: 'No active connection session found' };
    }

    const sessionRef = sessionsSnapshot.docs[0].ref;
    const session = sessionsSnapshot.docs[0].data() as ConnectionSession;

    const baseIncrease = callType === 'VIDEO' ? 15 : 10;
    const durationBonus = Math.min(durationMinutes / 5, 10);
    const emotionalIncrease = baseIncrease + durationBonus;

    const newEmotionalScore = Math.min(session.emotionalScore + emotionalIncrease, 100);

    await db.runTransaction(async (transaction) => {
      transaction.update(sessionRef, {
        callsCompleted: FieldValue.increment(1),
        emotionalScore: newEmotionalScore,
        currentActivity: callType === 'VIDEO' ? 'VIDEO_CALL' : 'VOICE_CALL',
        updatedAt: Timestamp.now(),
        nextMilestone:
          newEmotionalScore >= FUNNEL_CONFIG.CONNECTION.EMOTIONAL_ACCELERATION_THRESHOLD
            ? 'Schedule in-person meeting'
            : callType === 'VOICE'
            ? 'Try video call for deeper connection'
            : 'Continue building emotional connection',
      });

      const field = callType === 'VIDEO' ? 'videoCallsCompleted' : 'voiceCallsCompleted';
      
      transaction.set(
        db.collection('dating_funnel_progress').doc(user1Id),
        {
          [`phases.connection.${field}`]: FieldValue.increment(1),
          emotionalScore: newEmotionalScore,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      transaction.set(
        db.collection('dating_funnel_progress').doc(user2Id),
        {
          [`phases.connection.${field}`]: FieldValue.increment(1),
          emotionalScore: newEmotionalScore,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      if (newEmotionalScore >= FUNNEL_CONFIG.CONNECTION.EMOTIONAL_ACCELERATION_THRESHOLD) {
        transaction.set(
          db.collection('dating_funnel_progress').doc(user1Id),
          {
            'phases.connection.completed': true,
            currentPhase: 'MEETING',
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );

        transaction.set(
          db.collection('dating_funnel_progress').doc(user2Id),
          {
            'phases.connection.completed': true,
            currentPhase: 'MEETING',
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );

        logger.info(`CONNECTION phase completed for ${user1Id} ↔ ${user2Id}`);
      }
    });

    return { success: true, emotionalScore: newEmotionalScore };
  } catch (error) {
    logger.error('Error updating connection after call:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Schedule a dating calendar event
 */
export async function scheduleDatingEvent(
  hostId: string,
  attendeeId: string,
  scheduledAt: Date,
  location: string,
  notes?: string
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  const db = getFirestore();

  try {
    const progressDoc = await db.collection('dating_funnel_progress').doc(hostId).get();
    const emotionalScore = progressDoc.data()?.emotionalScore || 0;

    if (emotionalScore < FUNNEL_CONFIG.CONNECTION.EMOTIONAL_ACCELERATION_THRESHOLD) {
      return {
        success: false,
        error: `Emotional score too low. Need ${FUNNEL_CONFIG.CONNECTION.EMOTIONAL_ACCELERATION_THRESHOLD}, have ${emotionalScore}`,
      };
    }

    const eventRef = db.collection('dating_calendar_events').doc();
    const eventId = eventRef.id;

    await db.runTransaction(async (transaction) => {
      transaction.set(eventRef, {
        eventId,
        hostId,
        attendeeId,
        scheduledAt: Timestamp.fromDate(scheduledAt),
        location,
        notes: notes || '',
        status: 'SCHEDULED',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      const sessionsSnapshot = await db
        .collection('connection_sessions')
        .where('user1Id', 'in', [hostId, attendeeId])
        .where('user2Id', 'in', [hostId, attendeeId])
        .limit(1)
        .get();

      if (!sessionsSnapshot.empty) {
        transaction.update(sessionsSnapshot.docs[0].ref, {
          eventsScheduled: FieldValue.increment(1),
          currentActivity: 'SCHEDULED',
        });
      }

      transaction.set(
        db.collection('dating_funnel_progress').doc(hostId),
        {
          'phases.connection.eventsScheduled': FieldValue.increment(1),
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      transaction.set(
        db.collection('dating_funnel_progress').doc(attendeeId),
        {
          'phases.connection.eventsScheduled': FieldValue.increment(1),
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
    });

    logger.info(`Dating event scheduled: ${eventId}`);

    return { success: true, eventId };
  } catch (error) {
    logger.error('Error scheduling dating event:', error);
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// PHASE 4: MEETING IRL
// ============================================================================

/**
 * Create meeting verification with QR code
 */
export async function createMeetingVerification(
  user1Id: string,
  user2Id: string,
  eventId: string
): Promise<{ success: boolean; verificationId?: string; qrCode?: string; error?: string }> {
  const db = getFirestore();

  try {
    const verificationRef = db.collection('meeting_verifications').doc();
    const verificationId = verificationRef.id;

    const qrCode = `AVALO_MEETING_${verificationId}_${Date.now()}`;

    const verificationData: MeetingVerification = {
      verificationId,
      meetingId: eventId,
      user1Id,
      user2Id,
      qrCode,
      status: 'PENDING_VERIFICATION',
      user1Verified: false,
      user2Verified: false,
      safetyCheckEnabled: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await verificationRef.set(verificationData);

    logger.info(`Meeting verification created: ${verificationId}`);

    return { success: true, verificationId, qrCode };
  } catch (error) {
    logger.error('Error creating meeting verification:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Verify meeting check-in (QR scan or selfie)
 */
export async function verifyMeetingCheckIn(
  userId: string,
  verificationId: string,
  qrCode: string,
  location?: { lat: number; lng: number; accuracy: number },
  selfieUrl?: string
): Promise<{ success: boolean; bothVerified?: boolean; error?: string }> {
  const db = getFirestore();

  try {
    const verificationRef = db.collection('meeting_verifications').doc(verificationId);

    let bothVerified = false;

    await db.runTransaction(async (transaction) => {
      const verificationDoc = await transaction.get(verificationRef);

      if (!verificationDoc.exists) {
        throw new Error('Verification not found');
      }

      const verification = verificationDoc.data() as MeetingVerification;

      if (verification.qrCode !== qrCode) {
        throw new Error('Invalid QR code');
      }

      const isUser1 = userId === verification.user1Id;
      const isUser2 = userId === verification.user2Id;

      if (!isUser1 && !isUser2) {
        throw new Error('User not part of this meeting');
      }

      const updates: any = {
        updatedAt: Timestamp.now(),
      };

      if (isUser1) {
        updates.user1Verified = true;
        updates.user1VerifiedAt = Timestamp.now();
        if (selfieUrl) updates.user1SelfieUrl = selfieUrl;
      } else {
        updates.user2Verified = true;
        updates.user2VerifiedAt = Timestamp.now();
        if (selfieUrl) updates.user2SelfieUrl = selfieUrl;
      }

      if (location) {
        updates.location = location;
      }

      const user1Verified = isUser1 ? true : verification.user1Verified;
      const user2Verified = isUser2 ? true : verification.user2Verified;

      if (user1Verified && user2Verified) {
        updates.status = 'VERIFIED';
        bothVerified = true;

        const activeMeetingRef = db.collection('active_meetings').doc(verification.meetingId);
        transaction.set(activeMeetingRef, {
          meetingId: verification.meetingId,
          user1Id: verification.user1Id,
          user2Id: verification.user2Id,
          verificationId,
          status: 'IN_PROGRESS',
          startedAt: Timestamp.now(),
          location: location || null,
          safetyCheckEnabled: true,
          lastCheckInAt: Timestamp.now(),
        });
      }

      transaction.update(verificationRef, updates);

      if (bothVerified) {
        transaction.set(
          db.collection('dating_funnel_progress').doc(verification.user1Id),
          {
            'phases.meeting.meetingsVerified': FieldValue.increment(1),
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );

        transaction.set(
          db.collection('dating_funnel_progress').doc(verification.user2Id),
          {
            'phases.meeting.meetingsVerified': FieldValue.increment(1),
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );
      }
    });

    logger.info(`Meeting check-in verified: ${userId} in ${verificationId}`);

    return { success: true, bothVerified };
  } catch (error) {
    logger.error('Error verifying meeting check-in:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Create panic alert
 */
export async function createPanicAlert(
  userId: string,
  meetingId: string,
  location?: { lat: number; lng: number; accuracy: number },
  message?: string
): Promise<{ success: boolean; alertId?: string; error?: string }> {
  const db = getFirestore();

  try {
    const alertRef = db.collection('panic_alerts').doc();
    const alertId = alertRef.id;

    await alertRef.set({
      alertId,
      userId,
      meetingId,
      location: location || null,
      message: message || 'Emergency alert triggered',
      status: 'ACTIVE',
      timestamp: Timestamp.now(),
      resolved: false,
    });

    const activeMeetingRef = db.collection('active_meetings').doc(meetingId);
    await activeMeetingRef.update({
      status: 'EMERGENCY',
      panicAlertId: alertId,
      updatedAt: Timestamp.now(),
    });

    logger.warn(`PANIC ALERT created: ${alertId} by user ${userId}`);

    return { success: true, alertId };
  } catch (error) {
    logger.error('Error creating panic alert:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Complete meeting (both users confirm)
 */
export async function completeMeeting(
  userId: string,
  meetingId: string,
  rating?: number,
  feedback?: string
): Promise<{ success: boolean; error?: string }> {
  const db = getFirestore();

  try {
    const activeMeetingRef = db.collection('active_meetings').doc(meetingId);

    await db.runTransaction(async (transaction) => {
      const meetingDoc = await transaction.get(activeMeetingRef);

      if (!meetingDoc.exists) {
        throw new Error('Active meeting not found');
      }

      const meeting = meetingDoc.data()!;
      const isUser1 = userId === meeting.user1Id;
      const isUser2 = userId === meeting.user2Id;

      if (!isUser1 && !isUser2) {
        throw new Error('User not part of this meeting');
      }

      const updates: any = {
        updatedAt: Timestamp.now(),
      };

      if (isUser1) {
        updates.user1Completed = true;
        updates.user1CompletedAt = Timestamp.now();
        if (rating) updates.user1Rating = rating;
        if (feedback) updates.user1Feedback = feedback;
      } else {
        updates.user2Completed = true;
        updates.user2CompletedAt = Timestamp.now();
        if (rating) updates.user2Rating = rating;
        if (feedback) updates.user2Feedback = feedback;
      }

      const user1Completed = isUser1 ? true : meeting.user1Completed || false;
      const user2Completed = isUser2 ? true : meeting.user2Completed || false;

      if (user1Completed && user2Completed) {
        updates.status = 'COMPLETED';
        updates.completedAt = Timestamp.now();

        transaction.set(
          db.collection('dating_funnel_progress').doc(meeting.user1Id),
          {
            'phases.meeting.meetingsCompleted': FieldValue.increment(1),
            'phases.meeting.completed': true,
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );

        transaction.set(
          db.collection('dating_funnel_progress').doc(meeting.user2Id),
          {
            'phases.meeting.meetingsCompleted': FieldValue.increment(1),
            'phases.meeting.completed': true,
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );

        const analyticsRef = db.collection('dating_funnel_analytics').doc(
          [meeting.user1Id, meeting.user2Id].sort().join('_')
        );

        transaction.set(
          analyticsRef,
          {
            user1Id: meeting.user1Id,
            user2Id: meeting.user2Id,
            conversionPhase: 'MEETING_COMPLETED',
            totalMeetings: FieldValue.increment(1),
            lastMeetingAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );
      }

      transaction.update(activeMeetingRef, updates);
    });

    logger.info(`Meeting completed by ${userId}: ${meetingId}`);

    return { success: true };
  } catch (error) {
    logger.error('Error completing meeting:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Create paid time booking (earn-to-date)
 */
export async function createPaidTimeBooking(
  bookerId: string,
  hostId: string,
  durationMinutes: number,
  pricePerHour: number,
  scheduledAt: Date
): Promise<{ success: boolean; bookingId?: string; totalCost?: number; error?: string }> {
  const db = getFirestore();

  try {
    if (
      durationMinutes < FUNNEL_CONFIG.MEETING.MIN_PAID_TIME_BOOKING_MINUTES ||
      durationMinutes > FUNNEL_CONFIG.MEETING.MAX_PAID_TIME_BOOKING_MINUTES
    ) {
      return {
        success: false,
        error: `Duration must be between ${FUNNEL_CONFIG.MEETING.MIN_PAID_TIME_BOOKING_MINUTES} and ${FUNNEL_CONFIG.MEETING.MAX_PAID_TIME_BOOKING_MINUTES} minutes`,
      };
    }

    const totalCost = Math.ceil((durationMinutes / 60) * pricePerHour);
    const platformFee = Math.ceil(totalCost * (FUNNEL_CONFIG.MEETING.PLATFORM_FEE_PERCENT / 100));
    const hostEarning = totalCost - platformFee;

    const bookerDoc = await db.collection('users').doc(bookerId).get();
    const balance = bookerDoc.data()?.tokenBalance || 0;

    if (balance < totalCost) {
      return {
        success: false,
        error: `Insufficient tokens. Need ${totalCost}, have ${balance}`,
      };
    }

    const bookingRef = db.collection('paid_time_bookings').doc();
    const bookingId = bookingRef.id;

    await db.runTransaction(async (transaction) => {
      const bookerRef = db.collection('users').doc(bookerId);
      transaction.update(bookerRef, {
        tokenBalance: FieldValue.increment(-totalCost),
        totalSpent: FieldValue.increment(totalCost),
      });

      const txRef1 = db.collection('transactions').doc();
      transaction.set(txRef1, {
        userId: bookerId,
        type: 'paid_time_booking_charge',
        amount: -totalCost,
        description: `Paid time booking: ${durationMinutes}min with host`,
        timestamp: Timestamp.now(),
      });

      const bookingData: PaidTimeBooking = {
        bookingId,
        hostId,
        bookerId,
        duration: durationMinutes,
        pricePerHour,
        totalCost,
        platformFee,
        hostEarning,
        status: 'CONFIRMED',
        scheduledAt: Timestamp.fromDate(scheduledAt),
        escrowAmount: hostEarning,
        createdAt: Timestamp.now(),
      };

      transaction.set(bookingRef, bookingData);

      transaction.set(
        db.collection('dating_funnel_progress').doc(bookerId),
        {
          'phases.meeting.meetingsScheduled': FieldValue.increment(1),
          totalSpent: FieldValue.increment(totalCost),
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
    });

    logger.info(`Paid time booking created: ${bookingId} (${durationMinutes}min, ${totalCost} tokens)`);

    return { success: true, bookingId, totalCost };
  } catch (error) {
    logger.error('Error creating paid time booking:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Complete paid time booking and release escrow
 */
export async function completePaidTimeBooking(
  bookingId: string,
  verified: boolean = true
): Promise<{ success: boolean; error?: string }> {
  const db = getFirestore();

  try {
    const bookingRef = db.collection('paid_time_bookings').doc(bookingId);

    await db.runTransaction(async (transaction) => {
      const bookingDoc = await transaction.get(bookingRef);

      if (!bookingDoc.exists) {
        throw new Error('Booking not found');
      }

      const booking = bookingDoc.data() as PaidTimeBooking;

      if (booking.status === 'COMPLETED') {
        throw new Error('Booking already completed');
      }

      if (verified) {
        const hostRef = db.collection('users').doc(booking.hostId);
        transaction.update(hostRef, {
          tokenBalance: FieldValue.increment(booking.hostEarning),
          totalEarned: FieldValue.increment(booking.hostEarning),
        });

        const txRef = db.collection('transactions').doc();
        transaction.set(txRef, {
          userId: booking.hostId,
          type: 'paid_time_booking_earning',
          amount: booking.hostEarning,
          description: `Earned from paid time booking: ${booking.duration}min`,
          timestamp: Timestamp.now(),
        });

        transaction.update(bookingRef, {
          status: 'COMPLETED',
          completedAt: Timestamp.now(),
        });

        transaction.set(
          db.collection('dating_funnel_progress').doc(booking.hostId),
          {
            totalEarned: FieldValue.increment(booking.hostEarning),
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );

        logger.info(`Paid time booking completed: ${bookingId}`);
      } else {
        const refundAmount = booking.escrowAmount;
        const bookerRef = db.collection('users').doc(booking.bookerId);
        
        transaction.update(bookerRef, {
          tokenBalance: FieldValue.increment(refundAmount),
        });

        const txRef = db.collection('transactions').doc();
        transaction.set(txRef, {
          userId: booking.bookerId,
          type: 'paid_time_booking_refund',
          amount: refundAmount,
          description: 'Refund for cancelled paid time booking',
          timestamp: Timestamp.now(),
        });

        transaction.update(bookingRef, {
          status: 'CANCELLED',
          completedAt: Timestamp.now(),
        });

        logger.info(`Paid time booking cancelled: ${bookingId}`);
      }
    });

    return { success: true };
  } catch (error) {
    logger.error('Error completing paid time booking:', error);
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// ANALYTICS & REPORTING
// ============================================================================

/**
 * Get user's funnel progress
 */
export async function getUserFunnelProgress(
  userId: string
): Promise<FunnelProgress | null> {
  const db = getFirestore();

  try {
    const progressDoc = await db.collection('dating_funnel_progress').doc(userId).get();

    if (!progressDoc.exists) {
      const initialProgress: Partial<FunnelProgress> = {
        userId,
        currentPhase: 'ATTENTION',
        phases: {
          attention: {
            completed: false,
            actionsGiven: 0,
            actionsReceived: 0,
            matchesCreated: 0,
          },
          flirt: {
            completed: false,
            sessionsStarted: 0,
            complimentsSent: 0,
            complimentsReceived: 0,
            sexyModeEnabled: false,
          },
          connection: {
            completed: false,
            voiceCallsCompleted: 0,
            videoCallsCompleted: 0,
            eventsScheduled: 0,
          },
          meeting: {
            completed: false,
            meetingsScheduled: 0,
            meetingsVerified: 0,
            meetingsCompleted: 0,
          },
        },
        totalSpent: 0,
        totalEarned: 0,
        emotionalScore: 0,
        retentionDays: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await db.collection('dating_funnel_progress').doc(userId).set(initialProgress);

      return initialProgress as FunnelProgress;
    }

    return progressDoc.data() as FunnelProgress;
  } catch (error) {
    logger.error('Error getting user funnel progress:', error);
    return null;
  }
}

/**
 * Get funnel analytics between two users
 */
export async function getFunnelAnalytics(
  user1Id: string,
  user2Id: string
): Promise<any> {
  const db = getFirestore();

  try {
    const pairId = [user1Id, user2Id].sort().join('_');
    const analyticsDoc = await db.collection('dating_funnel_analytics').doc(pairId).get();

    if (!analyticsDoc.exists) {
      return null;
    }

    return analyticsDoc.data();
  } catch (error) {
    logger.error('Error getting funnel analytics:', error);
    return null;
  }
}

/**
 * Calculate retention and engagement metrics
 */
export async function calculateRetentionMetrics(
  userId: string
): Promise<{
  retentionDays: number;
  engagementScore: number;
  conversionRate: number;
} | null> {
  const db = getFirestore();

  try {
    const progress = await getUserFunnelProgress(userId);
    if (!progress) return null;

    const createdAt = progress.createdAt.toMillis();
    const now = Date.now();
    const retentionDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));

    let engagementScore = 0;
    engagementScore += progress.phases.attention.actionsGiven * 2;
    engagementScore += progress.phases.flirt.complimentsSent * 5;
    engagementScore += progress.phases.connection.voiceCallsCompleted * 10;
    engagementScore += progress.phases.connection.videoCallsCompleted * 15;
    engagementScore += progress.phases.meeting.meetingsCompleted * 30;
    engagementScore = Math.min(engagementScore, 100);

    const phasesCompleted = [
      progress.phases.attention.completed,
      progress.phases.flirt.completed,
      progress.phases.connection.completed,
      progress.phases.meeting.completed,
    ].filter(Boolean).length;

    const conversionRate = (phasesCompleted / 4) * 100;

    await db.collection('dating_funnel_progress').doc(userId).update({
      retentionDays,
      updatedAt: Timestamp.now(),
    });

    return { retentionDays, engagementScore, conversionRate };
  } catch (error) {
    logger.error('Error calculating retention metrics:', error);
    return null;
  }
}