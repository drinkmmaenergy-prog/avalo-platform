/**
 * PACK 254: Shared Meeting & Event Logic
 * 
 * This module provides shared functionality between 1:1 meetings and group events:
 * - Identity validation (selfie/QR)
 * - Refund processing
 * - Safety/panic features
 * - Rating systems
 * 
 * This ensures consistent behavior across both meeting types.
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
// SHARED TYPES
// ============================================================================

export interface ValidationContext {
  contextType: 'MEETING' | 'EVENT';
  contextId: string; // meetingId or eventId
  userId: string;
  validationType: 'CHECK_IN' | 'CHECK_OUT';
  verificationType: 'SELFIE' | 'QR' | 'BOTH';
  selfieUrl?: string;
  qrCode?: string;
  location?: { lat: number; lng: number };
  expectedStartTime: Date;
  expectedEndTime: Date;
}

export interface RefundContext {
  contextType: 'MEETING' | 'EVENT';
  contextId: string;
  bookingId: string;
  payerId: string;
  earnerId: string;
  totalAmount: number;
  platformFee: number;
  escrowAmount: number;
  refundReason: RefundReason;
  evidence?: any;
}

export interface SafetyContext {
  contextType: 'MEETING' | 'EVENT';
  contextId: string;
  userId: string;
  reportedUserId?: string;
  alertType: AlertType;
  location: { lat: number; lng: number };
  selfieUrl?: string;
  trustedContactId?: string;
}

export type AlertType = 
  | 'SAFETY_CONCERN'
  | 'IDENTITY_MISMATCH'
  | 'HARASSMENT'
  | 'EMERGENCY';

export type RefundReason =
  | 'IDENTITY_MISMATCH'
  | 'SAFETY_VIOLATION'
  | 'MUTUAL_AGREEMENT'
  | 'CREATOR_VOLUNTARY'
  | 'NO_SHOW'
  | 'CANCELLED_EARLY';

// ============================================================================
// SHARED VALIDATION LOGIC
// ============================================================================

/**
 * Validates identity during check-in or check-out
 * Works for both 1:1 meetings and group events
 */
export async function validateIdentity(
  context: ValidationContext
): Promise<{
  validationId: string;
  verified: boolean;
  verificationScore?: number;
  message: string;
}> {
  // Validate timing window
  const now = new Date();
  const isCheckIn = context.validationType === 'CHECK_IN';
  
  if (isCheckIn) {
    const windowStart = new Date(context.expectedStartTime.getTime() - 15 * 60000);
    const windowEnd = new Date(context.expectedStartTime.getTime() + 15 * 60000);
    
    if (now < windowStart || now > windowEnd) {
      throw new HttpsError(
        'failed-precondition',
        'Check-in window: 15 minutes before to 15 minutes after start time'
      );
    }
  } else {
    const windowEnd = new Date(context.expectedEndTime.getTime() + 15 * 60000);
    
    if (now < context.expectedEndTime) {
      throw new HttpsError('failed-precondition', 'Cannot check out before end time');
    }
    
    if (now > windowEnd) {
      throw new HttpsError('failed-precondition', 'Check-out window expired');
    }
  }

  // Validate verification data based on type
  if (context.verificationType === 'SELFIE' || context.verificationType === 'BOTH') {
    if (!context.selfieUrl) {
      throw new HttpsError('invalid-argument', 'Selfie required for verification');
    }
  }

  if (context.verificationType === 'QR' || context.verificationType === 'BOTH') {
    if (!context.qrCode) {
      throw new HttpsError('invalid-argument', 'QR code required for verification');
    }
  }

  // Create validation record
  const collectionPath = context.contextType === 'MEETING' 
    ? `meetings/${context.contextId}/validations`
    : `pro_events/${context.contextId}/validations`;
  
  const validationRef = db.collection(collectionPath).doc();
  
  const validation = {
    validationId: validationRef.id,
    [`${context.contextType.toLowerCase()}Id`]: context.contextId,
    userId: context.userId,
    validationType: context.validationType,
    verificationType: context.verificationType,
    timestamp: Timestamp.now(),
    verified: true, // TODO: Integrate AI verification for selfies
    selfieUrl: context.selfieUrl,
    qrCode: context.qrCode,
    location: context.location,
  };

  await validationRef.set(validation);

  logger.info(
    `Identity validated: ${context.contextType} ${context.contextId}, User ${context.userId}, Type ${context.validationType}`
  );

  return {
    validationId: validationRef.id,
    verified: true,
    message: `${context.validationType} validated successfully`,
  };
}

// ============================================================================
// SHARED REFUND LOGIC
// ============================================================================

/**
 * Process refund for meetings or events
 * Implements consistent refund rules across both types
 */
export async function processRefund(
  context: RefundContext,
  transaction: FirebaseFirestore.Transaction
): Promise<{ refundAmount: number; avaloFeeRefunded: boolean }> {
  let refundAmount = context.escrowAmount;
  let avaloFeeRefunded = false;

  // Determine if Avalo fee should be refunded (only for confirmed fraud)
  if (context.refundReason === 'IDENTITY_MISMATCH') {
    // Fraud case - full refund including Avalo fee (PACK 248 rule)
    refundAmount = context.totalAmount;
    avaloFeeRefunded = true;
  }

  // Refund payer
  const payerRef = db.collection('users').doc(context.payerId);
  transaction.update(payerRef, {
    tokenBalance: FieldValue.increment(refundAmount),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // If Avalo fee refunded, deduct from Avalo wallet
  if (avaloFeeRefunded) {
    const avaloWalletRef = db.collection('system').doc('avalo_wallet');
    transaction.update(avaloWalletRef, {
      balance: FieldValue.increment(-context.platformFee),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  // Update booking escrow status
  const bookingCollection = context.contextType === 'MEETING'
    ? 'meeting_bookings'
    : 'event_tickets';
  
  const bookingRef = db.collection(bookingCollection).doc(context.bookingId);
  transaction.update(bookingRef, {
    escrowStatus: 'REFUNDED',
    refundedAt: FieldValue.serverTimestamp(),
  });

  // Record refund transaction
  const transactionRef = db.collection('transactions').doc();
  transaction.set(transactionRef, {
    transactionId: transactionRef.id,
    type: `${context.contextType.toLowerCase()}_refund`,
    fromUserId: context.earnerId,
    toUserId: context.payerId,
    amount: refundAmount,
    [`${context.contextType.toLowerCase()}Id`]: context.contextId,
    bookingId: context.bookingId,
    timestamp: FieldValue.serverTimestamp(),
    metadata: {
      refundReason: context.refundReason,
      avaloFeeRefunded,
    },
  });

  logger.info(
    `Refund processed: ${context.contextType} ${context.contextId}, Amount: ${refundAmount}, Fee refunded: ${avaloFeeRefunded}`
  );

  return { refundAmount, avaloFeeRefunded };
}

// ============================================================================
// SHARED SAFETY/PANIC LOGIC
// ============================================================================

/**
 * Handle panic alert for meetings or events
 * Provides consistent safety response across both types
 */
export async function handlePanicAlert(
  context: SafetyContext,
  transaction: FirebaseFirestore.Transaction
): Promise<{ alertId: string; contactNotified: boolean }> {
  // Create panic alert
  const collectionPath = context.contextType === 'MEETING'
    ? `meetings/${context.contextId}/panic_alerts`
    : `pro_events/${context.contextId}/safety_alerts`;
  
  const alertRef = db.collection(collectionPath).doc();
  
  const alert = {
    alertId: alertRef.id,
    [`${context.contextType.toLowerCase()}Id`]: context.contextId,
    userId: context.userId,
    alertType: context.alertType,
    location: context.location,
    timestamp: FieldValue.serverTimestamp(),
    status: 'ACTIVE',
    trustedContactId: context.trustedContactId,
    emergencyContactNotified: !!context.trustedContactId,
    selfieUrl: context.selfieUrl,
  };

  transaction.set(alertRef, alert);

  // Increment risk score for reported user (if applicable)
  if (context.reportedUserId) {
    const reportedUserRef = db.collection('users').doc(context.reportedUserId);
    transaction.update(reportedUserRef, {
      riskScore: FieldValue.increment(60),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  // Log safety incident
  const safetyLogCollection = context.contextType === 'MEETING'
    ? 'meeting_safety_logs'
    : 'event_safety_logs';
  
  const safetyLogRef = db.collection(safetyLogCollection).doc();
  transaction.set(safetyLogRef, {
    logId: safetyLogRef.id,
    [`${context.contextType.toLowerCase()}Id`]: context.contextId,
    userId: context.userId,
    reportedUserId: context.reportedUserId,
    logType: 'PANIC_ALERT',
    severity: context.alertType === 'EMERGENCY' ? 'CRITICAL' : 'HIGH',
    alertType: context.alertType,
    location: context.location,
    createdAt: FieldValue.serverTimestamp(),
  });

  logger.info(
    `Panic alert triggered: ${context.contextType} ${context.contextId}, Type: ${context.alertType}`
  );

  return {
    alertId: alertRef.id,
    contactNotified: !!context.trustedContactId,
  };
}

// ============================================================================
// SHARED RATING LOGIC
// ============================================================================

export interface RatingContext {
  contextType: 'MEETING' | 'EVENT';
  contextId: string;
  raterId: string;
  ratedUserId: string;
  ratingType: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'REPORT';
  reportReason?: string;
  privateNotes?: string;
}

/**
 * Apply rating effects to user profile
 * Consistent across meetings and events
 */
export async function applyRatingEffects(
  context: RatingContext,
  transaction: FirebaseFirestore.Transaction
): Promise<void> {
  const ratedUserRef = db.collection('users').doc(context.ratedUserId);
  
  const statsField = context.contextType === 'MEETING' 
    ? 'meetingStats'
    : 'eventStats';

  if (context.ratingType === 'POSITIVE') {
    transaction.update(ratedUserRef, {
      [`${statsField}.positiveRatings`]: FieldValue.increment(1),
      ranking: FieldValue.increment(5), // Boost ranking
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else if (context.ratingType === 'NEGATIVE') {
    transaction.update(ratedUserRef, {
      [`${statsField}.negativeRatings`]: FieldValue.increment(1),
      riskScore: FieldValue.increment(25),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else if (context.ratingType === 'REPORT') {
    transaction.update(ratedUserRef, {
      [`${statsField}.reports`]: FieldValue.increment(1),
      riskScore: FieldValue.increment(50),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Create investigation
    const safetyLogCollection = context.contextType === 'MEETING'
      ? 'meeting_safety_logs'
      : 'event_safety_logs';
    
    const investigationRef = db.collection(safetyLogCollection).doc();
    transaction.set(investigationRef, {
      logId: investigationRef.id,
      [`${context.contextType.toLowerCase()}Id`]: context.contextId,
      userId: context.raterId,
      reportedUserId: context.ratedUserId,
      logType: 'POST_COMPLETION_REPORT',
      severity: 'MEDIUM',
      reportReason: context.reportReason,
      requiresReview: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  logger.info(
    `Rating applied: ${context.contextType} ${context.contextId}, Type: ${context.ratingType}`
  );
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if user has valid check-in for context
 */
export async function hasValidCheckIn(
  contextType: 'MEETING' | 'EVENT',
  contextId: string,
  userId: string
): Promise<boolean> {
  const collectionPath = contextType === 'MEETING'
    ? `meetings/${contextId}/validations`
    : `pro_events/${contextId}/validations`;
  
  const snapshot = await db
    .collection(collectionPath)
    .where('userId', '==', userId)
    .where('validationType', '==', 'CHECK_IN')
    .where('verified', '==', true)
    .limit(1)
    .get();

  return !snapshot.empty;
}

/**
 * Get validation statistics for context
 */
export async function getValidationStats(
  contextType: 'MEETING' | 'EVENT',
  contextId: string
): Promise<{
  totalCheckIns: number;
  totalCheckOuts: number;
  verifiedUsers: string[];
}> {
  const collectionPath = contextType === 'MEETING'
    ? `meetings/${contextId}/validations`
    : `pro_events/${contextId}/validations`;
  
  const snapshot = await db.collection(collectionPath).get();
  
  const checkIns = snapshot.docs.filter(
    doc => doc.data().validationType === 'CHECK_IN' && doc.data().verified
  );
  
  const checkOuts = snapshot.docs.filter(
    doc => doc.data().validationType === 'CHECK_OUT' && doc.data().verified
  );
  
  const verifiedUsers = Array.from(new Set(
    checkIns.map(doc => doc.data().userId)
  ));

  return {
    totalCheckIns: checkIns.length,
    totalCheckOuts: checkOuts.length,
    verifiedUsers,
  };
}
