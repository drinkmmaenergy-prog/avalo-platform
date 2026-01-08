/**
 * PACK 435 — Global Events Engine: Event Billing & Payment Logic
 * 
 * Handles booking, payment splitting, refunds, and payout logic
 * Depends on: PACK 277 (Wallet), PACK 435 Event Types
 */

import * as admin from 'firebase-admin';
import { EventConfig, EventAttendee, AttendeeStatus, TicketTier } from './pack435-event-types';

// ============================================================================
// PAYMENT INTERFACES
// ============================================================================

export interface EventPayment {
  paymentId: string;
  eventId: string;
  userId: string;
  attendeeId: string;
  
  // Payment details
  amount: number;
  currency: string;
  ticketTier: TicketTier;
  
  // Split details
  organizerAmount: number; // 80%
  avaloAmount: number; // 20%
  ambassadorBonus?: number;
  
  // Payment method
  paymentMethod: 'wallet' | 'card' | 'tokens';
  walletTransactionId?: string;
  
  // Status
  status: 'pending' | 'completed' | 'failed' | 'refunded' | 'partially_refunded';
  
  // Timestamps
  createdAt: admin.firestore.Timestamp;
  completedAt?: admin.firestore.Timestamp;
  refundedAt?: admin.firestore.Timestamp;
  
  // Refund details
  refundAmount?: number;
  refundReason?: string;
  refundRequestedBy?: string;
}

export interface PayoutSchedule {
  payoutId: string;
  eventId: string;
  organizerId: string;
  
  // Amounts
  totalRevenue: number;
  organizerShare: number;
  avaloCommission: number;
  
  // Verification requirements
  requiredVerifications: number;
  completedVerifications: number;
  verificationRate: number; // percentage
  
  // Payout status
  status: 'pending' | 'unlocked' | 'processing' | 'completed' | 'frozen';
  unlockConditions: PayoutUnlockConditions;
  
  // Timestamps
  eventEndTime: admin.firestore.Timestamp;
  unlockedAt?: admin.firestore.Timestamp;
  paidAt?: admin.firestore.Timestamp;
  
  // Banking
  payoutMethod: 'bank_transfer' | 'wallet' | 'hold';
  payoutReference?: string;
}

export interface PayoutUnlockConditions {
  eventEnded: boolean;
  verificationRateReached: boolean; // ≥70%
  noSafetyIncidents: boolean;
  noFraudAlerts: boolean;
}

// ============================================================================
// BOOKING & PAYMENT LOGIC
// ============================================================================

export async function bookEventTicket(
  userId: string,
  eventId: string,
  ticketTier: TicketTier,
  paymentMethod: 'wallet' | 'card' | 'tokens',
  referralCode?: string
): Promise<{ success: boolean; attendeeId?: string; paymentId?: string; error?: string }> {
  const db = admin.firestore();
  
  try {
    // 1. Get event details
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) {
      return { success: false, error: 'Event not found' };
    }
    
    const event = eventDoc.data() as EventConfig;
    
    // 2. Validate event status
    if (event.status !== 'published') {
      return { success: false, error: 'Event not available for booking' };
    }
    
    // 3. Check capacity
    if (event.currentParticipants >= event.maxParticipants) {
      return { success: false, error: 'Event is full' };
    }
    
    // 4. Check if user already registered
    const existingAttendee = await db.collection('eventAttendees')
      .where('eventId', '==', eventId)
      .where('userId', '==', userId)
      .where('status', 'in', ['registered', 'paid', 'confirmed'])
      .get();
    
    if (!existingAttendee.empty) {
      return { success: false, error: 'Already registered for this event' };
    }
    
    // 5. Get ticket tier info
    const tierConfig = event.pricing.tiers.find(t => t.tier === ticketTier);
    if (!tierConfig) {
      return { success: false, error: 'Invalid ticket tier' };
    }
    
    if (tierConfig.soldSeats >= tierConfig.maxSeats) {
      return { success: false, error: 'Ticket tier sold out' };
    }
    
    const ticketPrice = tierConfig.pricePerSeat;
    
    // 6. Calculate payment split
    const organizerAmount = Math.floor(ticketPrice * (event.revenueShare.organizerShare / 100));
    const avaloAmount = ticketPrice - organizerAmount;
    
    // 7. Check ambassador attribution
    let ambassadorId: string | undefined;
    let ambassadorBonus = 0;
    
    if (referralCode) {
      const ambassadorDoc = await db.collection('ambassadors')
        .where('referralCode', '==', referralCode)
        .limit(1)
        .get();
      
      if (!ambassadorDoc.empty) {
        ambassadorId = ambassadorDoc.docs[0].id;
        ambassadorBonus = event.revenueShare.ambassadorBonus || 0;
      }
    }
    
    // 8. Process payment
    let walletTransactionId: string | undefined;
    
    if (ticketPrice > 0) {
      // Check user wallet balance
      const userDoc = await db.collection('users').doc(userId).get();
      const userWallet = userDoc.data()?.wallet || { balance: 0 };
      
      if (paymentMethod === 'wallet' && userWallet.balance < ticketPrice) {
        return { success: false, error: 'Insufficient wallet balance' };
      }
      
      // Deduct from wallet
      await db.collection('users').doc(userId).update({
        'wallet.balance': admin.firestore.FieldValue.increment(-ticketPrice),
      });
      
      // Create wallet transaction
      const walletTxRef = await db.collection('walletTransactions').add({
        userId,
        type: 'event_ticket_purchase',
        amount: -ticketPrice,
        currency: event.pricing.currency,
        eventId,
        status: 'completed',
        createdAt: admin.firestore.Timestamp.now(),
      });
      
      walletTransactionId = walletTxRef.id;
    }
    
    // 9. Create attendee record
    const attendeeRef = db.collection('eventAttendees').doc();
    const attendeeId = attendeeRef.id;
    
    const qrCode = generateQRCode(eventId, attendeeId);
    
    const attendee: EventAttendee = {
      attendeeId,
      eventId,
      userId,
      status: ticketPrice > 0 ? AttendeeStatus.PAID : AttendeeStatus.REGISTERED,
      ticketTier,
      ticketId: `TICKET-${eventId.slice(0, 6)}-${attendeeId.slice(0, 6)}`.toUpperCase(),
      qrCode,
      amountPaid: ticketPrice,
      currency: event.pricing.currency,
      paymentId: walletTransactionId || '',
      paidAt: admin.firestore.Timestamp.now(),
      referredByAmbassador: ambassadorId,
      referralCode,
      qrVerified: false,
      gpsEnabled: false,
      registeredAt: admin.firestore.Timestamp.now(),
    };
    
    await attendeeRef.set(attendee);
    
    // 10. Create payment record
    const paymentRef = await db.collection('eventPayments').add({
      paymentId: attendeeRef.id,
      eventId,
      userId,
      attendeeId,
      amount: ticketPrice,
      currency: event.pricing.currency,
      ticketTier,
      organizerAmount,
      avaloAmount,
      ambassadorBonus,
      paymentMethod,
      walletTransactionId,
      status: 'completed',
      createdAt: admin.firestore.Timestamp.now(),
      completedAt: admin.firestore.Timestamp.now(),
    } as EventPayment);
    
    // 11. Update event capacity
    await db.collection('events').doc(eventId).update({
      currentParticipants: admin.firestore.FieldValue.increment(1),
      registrationCount: admin.firestore.FieldValue.increment(1),
    });
    
    // 12. Update ticket tier sold seats
    const updatedTiers = event.pricing.tiers.map(tier => {
      if (tier.tier === ticketTier) {
        return { ...tier, soldSeats: tier.soldSeats + 1 };
      }
      return tier;
    });
    
    await db.collection('events').doc(eventId).update({
      'pricing.tiers': updatedTiers,
    });
    
    // 13. Credit ambassador if applicable
    if (ambassadorId && ambassadorBonus > 0) {
      await db.collection('users').doc(ambassadorId).update({
        'wallet.balance': admin.firestore.FieldValue.increment(ambassadorBonus),
      });
      
      await db.collection('ambassadorEarnings').add({
        ambassadorId,
        eventId,
        attendeeId,
        amount: ambassadorBonus,
        type: 'event_referral',
        createdAt: admin.firestore.Timestamp.now(),
      });
    }
    
    return {
      success: true,
      attendeeId,
      paymentId: paymentRef.id,
    };
    
  } catch (error) {
    console.error('Event booking error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Booking failed',
    };
  }
}

// ============================================================================
// REFUND LOGIC
// ============================================================================

export async function processRefund(
  eventId: string,
  attendeeId: string,
  reason: 'organizer_cancellation' | 'user_cancellation' | 'no_show',
  requestedBy: string
): Promise<{ success: boolean; refundAmount?: number; error?: string }> {
  const db = admin.firestore();
  
  try {
    // 1. Get event and attendee
    const eventDoc = await db.collection('events').doc(eventId).get();
    const attendeeDoc = await db.collection('eventAttendees').doc(attendeeId).get();
    
    if (!eventDoc.exists || !attendeeDoc.exists) {
      return { success: false, error: 'Event or attendee not found' };
    }
    
    const event = eventDoc.data() as EventConfig;
    const attendee = attendeeDoc.data() as EventAttendee;
    
    // 2. Calculate refund amount based on reason
    let refundPercentage = 0;
    
    if (reason === 'organizer_cancellation') {
      refundPercentage = event.pricing.refundPolicy.organizerCancellation;
    } else if (reason === 'user_cancellation') {
      refundPercentage = event.pricing.refundPolicy.userCancellation;
    } else if (reason === 'no_show') {
      refundPercentage = event.pricing.refundPolicy.noShowRefund;
    }
    
    const refundAmount = Math.floor(attendee.amountPaid * (refundPercentage / 100));
    
    if (refundAmount === 0) {
      return { success: false, error: 'No refund applicable' };
    }
    
    // 3. Credit user wallet
    await db.collection('users').doc(attendee.userId).update({
      'wallet.balance': admin.firestore.FieldValue.increment(refundAmount),
    });
    
    // 4. Create refund transaction
    await db.collection('walletTransactions').add({
      userId: attendee.userId,
      type: 'event_ticket_refund',
      amount: refundAmount,
      currency: attendee.currency,
      eventId,
      attendeeId,
      reason,
      status: 'completed',
      createdAt: admin.firestore.Timestamp.now(),
    });
    
    // 5. Update attendee status
    await db.collection('eventAttendees').doc(attendeeId).update({
      status: AttendeeStatus.CANCELLED,
      cancelledAt: admin.firestore.Timestamp.now(),
      refundedAt: admin.firestore.Timestamp.now(),
      refundAmount,
    });
    
    // 6. Update payment record
    await db.collection('eventPayments')
      .where('attendeeId', '==', attendeeId)
      .get()
      .then(snapshot => {
        if (!snapshot.empty) {
          snapshot.docs[0].ref.update({
            status: 'refunded',
            refundAmount,
            refundReason: reason,
            refundRequestedBy: requestedBy,
            refundedAt: admin.firestore.Timestamp.now(),
          });
        }
      });
    
    // 7. Update event capacity
    await db.collection('events').doc(eventId).update({
      currentParticipants: admin.firestore.FieldValue.increment(-1),
    });
    
    return {
      success: true,
      refundAmount,
    };
    
  } catch (error) {
    console.error('Refund processing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Refund failed',
    };
  }
}

// ============================================================================
// PAYOUT LOGIC
// ============================================================================

export async function calculateEventPayout(eventId: string): Promise<PayoutSchedule | null> {
  const db = admin.firestore();
  
  try {
    // Get event
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) {
      return null;
    }
    
    const event = eventDoc.data() as EventConfig;
    
    // Get all payments for this event
    const paymentsSnapshot = await db.collection('eventPayments')
      .where('eventId', '==', eventId)
      .where('status', 'in', ['completed', 'refunded'])
      .get();
    
    let totalRevenue = 0;
    let organizerShare = 0;
    let avaloCommission = 0;
    
    paymentsSnapshot.forEach(doc => {
      const payment = doc.data() as EventPayment;
      totalRevenue += payment.amount;
      organizerShare += payment.organizerAmount;
      avaloCommission += payment.avaloAmount;
    });
    
    // Get verification stats
    const attendeesSnapshot = await db.collection('eventAttendees')
      .where('eventId', '==', eventId)
      .where('status', 'in', ['paid', 'confirmed', 'checked_in'])
      .get();
    
    const requiredVerifications = attendeesSnapshot.size;
    let completedVerifications = 0;
    
    attendeesSnapshot.forEach(doc => {
      const attendee = doc.data() as EventAttendee;
      if (attendee.qrVerified) {
        completedVerifications++;
      }
    });
    
    const verificationRate = requiredVerifications > 0
      ? (completedVerifications / requiredVerifications) * 100
      : 0;
    
    // Check unlock conditions
    const eventEnded = event.status === 'ended' || 
                       event.endTime.toMillis() < Date.now();
    const verificationRateReached = verificationRate >= 70;
    const noSafetyIncidents = event.safetyIncidents === 0;
    const noFraudAlerts = event.riskScore < 50;
    
    const unlockConditions: PayoutUnlockConditions = {
      eventEnded,
      verificationRateReached,
      noSafetyIncidents,
      noFraudAlerts,
    };
    
    const allConditionsMet = Object.values(unlockConditions).every(v => v === true);
    
    // Create payout schedule
    const payoutSchedule: PayoutSchedule = {
      payoutId: `PAYOUT-${eventId}`,
      eventId,
      organizerId: event.organizerId,
      totalRevenue,
      organizerShare,
      avaloCommission,
      requiredVerifications,
      completedVerifications,
      verificationRate,
      status: allConditionsMet ? 'unlocked' : 'pending',
      unlockConditions,
      eventEndTime: event.endTime,
      payoutMethod: 'wallet',
    };
    
    if (allConditionsMet) {
      payoutSchedule.unlockedAt = admin.firestore.Timestamp.now();
    }
    
    // Save payout schedule
    await db.collection('eventPayouts').doc(payoutSchedule.payoutId).set(payoutSchedule);
    
    return payoutSchedule;
    
  } catch (error) {
    console.error('Payout calculation error:', error);
    return null;
  }
}

export async function releaseOrganizerPayout(payoutId: string): Promise<boolean> {
  const db = admin.firestore();
  
  try {
    const payoutDoc = await db.collection('eventPayouts').doc(payoutId).get();
    if (!payoutDoc.exists) {
      return false;
    }
    
    const payout = payoutDoc.data() as PayoutSchedule;
    
    // Verify payout is unlocked
    if (payout.status !== 'unlocked') {
      return false;
    }
    
    // Credit organizer wallet
    await db.collection('users').doc(payout.organizerId).update({
      'wallet.balance': admin.firestore.FieldValue.increment(payout.organizerShare),
    });
    
    // Create wallet transaction
    await db.collection('walletTransactions').add({
      userId: payout.organizerId,
      type: 'event_payout',
      amount: payout.organizerShare,
      currency: 'USD',
      eventId: payout.eventId,
      status: 'completed',
      createdAt: admin.firestore.Timestamp.now(),
    });
    
    // Update payout status
    await db.collection('eventPayouts').doc(payoutId).update({
      status: 'completed',
      paidAt: admin.firestore.Timestamp.now(),
    });
    
    return true;
    
  } catch (error) {
    console.error('Payout release error:', error);
    return false;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateQRCode(eventId: string, attendeeId: string): string {
  // Generate a unique QR code string
  return `AVALO-EVENT:${eventId}:${attendeeId}:${Date.now()}`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  bookEventTicket,
  processRefund,
  calculateEventPayout,
  releaseOrganizerPayout,
};
