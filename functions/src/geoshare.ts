/**
 * PACK 76 - Real-Time Location Sharing (Geoshare)
 * Temporary, consent-based, paid location sharing between users
 *
 * Business Rules:
 * - 35% platform fee (immediate, non-refundable)
 * - No free trials or free previews
 * - Only available after payment
 * - No location history storage
 * - Auto-expire after paid time ends
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, serverTimestamp, generateId, admin } from './init.js';
import { logger } from 'firebase-functions/v2';
import Stripe from 'stripe';

// ==========================================
// CONFIGURATION
// ==========================================

const GEOSHARE_CONFIG = {
  // Pricing per minute (in tokens)
  PRICE_PER_MINUTE: 10,
  
  // Platform fee percentage
  AVALO_FEE_PERCENT: 35,
  
  // Available duration options (in minutes)
  DURATION_OPTIONS: [15, 30, 60],
  
  // Maximum location update frequency (to prevent spam)
  MIN_UPDATE_INTERVAL_SECONDS: 8,
  
  // Session cleanup grace period (minutes after expiry)
  CLEANUP_GRACE_PERIOD_MINUTES: 5,
};

// ==========================================
// TYPES
// ==========================================

export interface GeoshareSession {
  sessionId: string;
  userA: string;           // Payer / initiator
  userB: string;           // Partner
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  durationMinutes: number; // Paid duration
  paidAmount: number;      // Total tokens paid
  avaloFee: number;        // Platform fee (35%)
  createdAt: FirebaseFirestore.Timestamp;
  expiresAt: FirebaseFirestore.Timestamp;
  lastUpdateAt: FirebaseFirestore.Timestamp;
  cancelledAt?: FirebaseFirestore.Timestamp;
  cancelledBy?: string;
}

export interface LocationUpdate {
  userId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: FirebaseFirestore.Timestamp;
  sessionId: string;
}

export interface GeosharePaymentIntent {
  userId: string;
  partnerId: string;
  durationMinutes: number;
  totalTokens: number;
  avaloFee: number;
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Calculate pricing for geoshare session
 */
function calculateGeosharePricing(durationMinutes: number): {
  totalTokens: number;
  avaloFee: number;
  netAmount: number;
} {
  const totalTokens = durationMinutes * GEOSHARE_CONFIG.PRICE_PER_MINUTE;
  const avaloFee = Math.round(totalTokens * (GEOSHARE_CONFIG.AVALO_FEE_PERCENT / 100));
  const netAmount = totalTokens - avaloFee;

  return {
    totalTokens,
    avaloFee,
    netAmount,
  };
}

/**
 * Validate duration option
 */
function isValidDuration(minutes: number): boolean {
  return GEOSHARE_CONFIG.DURATION_OPTIONS.includes(minutes);
}

/**
 * Check if user has sufficient token balance
 */
async function checkUserBalance(userId: string, requiredTokens: number): Promise<boolean> {
  const walletDoc = await db.collection('wallets').doc(userId).get();
  
  if (!walletDoc.exists) {
    return false;
  }

  const balance = walletDoc.data()?.availableTokens || 0;
  return balance >= requiredTokens;
}

/**
 * Deduct tokens from user wallet
 */
async function deductTokens(
  userId: string,
  amount: number,
  description: string,
  metadata: any
): Promise<void> {
  const walletRef = db.collection('wallets').doc(userId);
  
  await db.runTransaction(async (transaction) => {
    const walletDoc = await transaction.get(walletRef);
    
    if (!walletDoc.exists) {
      throw new HttpsError('failed-precondition', 'Wallet not found');
    }

    const currentBalance = walletDoc.data()?.availableTokens || 0;
    
    if (currentBalance < amount) {
      throw new HttpsError('failed-precondition', 'Insufficient token balance');
    }

    const newBalance = currentBalance - amount;
    
    transaction.update(walletRef, {
      availableTokens: newBalance,
      updatedAt: serverTimestamp(),
    });

    // Log transaction
    const transactionId = generateId();
    transaction.set(db.collection('transactions').doc(transactionId), {
      transactionId,
      userId,
      type: 'geoshare_charge',
      amount: -amount,
      balanceAfter: newBalance,
      description,
      metadata,
      createdAt: serverTimestamp(),
    });
  });
}

/**
 * Record platform fee
 */
async function recordPlatformFee(
  sessionId: string,
  amount: number,
  userId: string
): Promise<void> {
  const feeId = generateId();
  
  await db.collection('transactions').doc(feeId).set({
    transactionId: feeId,
    type: 'geoshare_platform_fee',
    amount,
    sessionId,
    userId,
    description: 'Avalo platform fee for location sharing',
    createdAt: serverTimestamp(),
  });

  logger.info(`Platform fee recorded: ${amount} tokens from session ${sessionId}`);
}

// ==========================================
// CLOUD FUNCTIONS
// ==========================================

/**
 * Get pricing information for geoshare
 */
export const getGeosharePricing = onCall(
  { cors: true },
  async (request) => {
    const durationMinutes = request.data?.durationMinutes;

    if (!durationMinutes || !isValidDuration(durationMinutes)) {
      throw new HttpsError(
        'invalid-argument',
        `Invalid duration. Must be one of: ${GEOSHARE_CONFIG.DURATION_OPTIONS.join(', ')} minutes`
      );
    }

    const pricing = calculateGeosharePricing(durationMinutes);

    return {
      success: true,
      durationMinutes,
      pricePerMinute: GEOSHARE_CONFIG.PRICE_PER_MINUTE,
      ...pricing,
      availableDurations: GEOSHARE_CONFIG.DURATION_OPTIONS,
    };
  }
);

/**
 * Start a geoshare session (after payment)
 */
export const startGeoshareSession = onCall(
  { cors: true },
  async (request) => {
    // Authentication check
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const { partnerId, durationMinutes } = request.data;

    // Validation
    if (!partnerId) {
      throw new HttpsError('invalid-argument', 'Partner ID is required');
    }

    if (!isValidDuration(durationMinutes)) {
      throw new HttpsError(
        'invalid-argument',
        `Invalid duration. Must be one of: ${GEOSHARE_CONFIG.DURATION_OPTIONS.join(', ')} minutes`
      );
    }

    if (userId === partnerId) {
      throw new HttpsError('invalid-argument', 'Cannot share location with yourself');
    }

    // Check if partner exists
    const partnerDoc = await db.collection('profiles').doc(partnerId).get();
    if (!partnerDoc.exists) {
      throw new HttpsError('not-found', 'Partner user not found');
    }

    // Calculate pricing
    const pricing = calculateGeosharePricing(durationMinutes);

    // Check balance
    const hasBalance = await checkUserBalance(userId, pricing.totalTokens);
    if (!hasBalance) {
      throw new HttpsError(
        'failed-precondition',
        `Insufficient tokens. Required: ${pricing.totalTokens} tokens`
      );
    }

    // Check for existing active session between these users
    const existingSessionQuery = await db
      .collection('geoshare_sessions')
      .where('status', '==', 'ACTIVE')
      .where('userA', 'in', [userId, partnerId])
      .get();

    for (const doc of existingSessionQuery.docs) {
      const data = doc.data();
      if (
        (data.userA === userId && data.userB === partnerId) ||
        (data.userA === partnerId && data.userB === userId)
      ) {
        throw new HttpsError(
          'already-exists',
          'An active location sharing session already exists between these users'
        );
      }
    }

    try {
      // Deduct tokens from user
      await deductTokens(
        userId,
        pricing.totalTokens,
        `Location sharing session - ${durationMinutes} minutes`,
        {
          partnerId,
          durationMinutes,
          sessionType: 'geoshare',
        }
      );

      // Record platform fee
      const sessionId = generateId();
      await recordPlatformFee(sessionId, pricing.avaloFee, userId);

      // Create session
      const now = new Date();
      const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

      const sessionData: GeoshareSession = {
        sessionId,
        userA: userId,
        userB: partnerId,
        status: 'ACTIVE',
        durationMinutes,
        paidAmount: pricing.totalTokens,
        avaloFee: pricing.avaloFee,
        createdAt: serverTimestamp() as any,
        expiresAt: serverTimestamp() as any, // Will be overwritten with calculated time
        lastUpdateAt: serverTimestamp() as any,
      };

      // Set expiry time explicitly
      await db.collection('geoshare_sessions').doc(sessionId).set({
        ...sessionData,
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdateAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info(`Geoshare session started: ${sessionId} (${userId} -> ${partnerId})`);

      return {
        success: true,
        sessionId,
        expiresAt: expiresAt.toISOString(),
        durationMinutes,
        paidAmount: pricing.totalTokens,
      };
    } catch (error: any) {
      logger.error('Error starting geoshare session:', error);
      throw new HttpsError('internal', error.message || 'Failed to start session');
    }
  }
);

/**
 * Update location during active session
 */
export const updateGeoshareLocation = onCall(
  { cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const { sessionId, latitude, longitude, accuracy } = request.data;

    // Validation
    if (!sessionId || latitude === undefined || longitude === undefined) {
      throw new HttpsError('invalid-argument', 'Session ID and location coordinates required');
    }

    // Get session
    const sessionDoc = await db.collection('geoshare_sessions').doc(sessionId).get();

    if (!sessionDoc.exists) {
      throw new HttpsError('not-found', 'Session not found');
    }

    const session = sessionDoc.data() as GeoshareSession;

    // Verify user is participant
    if (session.userA !== userId && session.userB !== userId) {
      throw new HttpsError('permission-denied', 'You are not a participant in this session');
    }

    // Check session status
    if (session.status !== 'ACTIVE') {
      throw new HttpsError('failed-precondition', 'Session is not active');
    }

    // Check if session has expired
    const now = new Date();
    const expiresAt = session.expiresAt.toDate();
    
    if (now > expiresAt) {
      // Auto-expire the session
      await db.collection('geoshare_sessions').doc(sessionId).update({
        status: 'EXPIRED',
        lastUpdateAt: serverTimestamp(),
      });
      
      throw new HttpsError('failed-precondition', 'Session has expired');
    }

    // Rate limiting check
    const lastUpdate = session.lastUpdateAt.toDate();
    const secondsSinceLastUpdate = (now.getTime() - lastUpdate.getTime()) / 1000;
    
    if (secondsSinceLastUpdate < GEOSHARE_CONFIG.MIN_UPDATE_INTERVAL_SECONDS) {
      throw new HttpsError(
        'resource-exhausted',
        `Location updates limited to once per ${GEOSHARE_CONFIG.MIN_UPDATE_INTERVAL_SECONDS} seconds`
      );
    }

    // Store location update (temporary)
    const locationId = generateId();
    const locationUpdate: LocationUpdate = {
      userId,
      latitude,
      longitude,
      accuracy: accuracy || 0,
      timestamp: serverTimestamp() as any,
      sessionId,
    };

    await db
      .collection('geoshare_sessions')
      .doc(sessionId)
      .collection('locations')
      .doc(locationId)
      .set(locationUpdate);

    // Update session last activity
    await db.collection('geoshare_sessions').doc(sessionId).update({
      lastUpdateAt: serverTimestamp(),
    });

    return {
      success: true,
      locationId,
      remainingSeconds: Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000)),
    };
  }
);

/**
 * Stop geoshare session manually
 */
export const stopGeoshareSession = onCall(
  { cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const { sessionId } = request.data;

    if (!sessionId) {
      throw new HttpsError('invalid-argument', 'Session ID is required');
    }

    // Get session
    const sessionDoc = await db.collection('geoshare_sessions').doc(sessionId).get();

    if (!sessionDoc.exists) {
      throw new HttpsError('not-found', 'Session not found');
    }

    const session = sessionDoc.data() as GeoshareSession;

    // Verify user is participant
    if (session.userA !== userId && session.userB !== userId) {
      throw new HttpsError('permission-denied', 'You are not a participant in this session');
    }

    // Update session status
    await db.collection('geoshare_sessions').doc(sessionId).update({
      status: 'CANCELLED',
      cancelledAt: serverTimestamp(),
      cancelledBy: userId,
      lastUpdateAt: serverTimestamp(),
    });

    logger.info(`Geoshare session manually stopped: ${sessionId} by ${userId}`);

    return {
      success: true,
      message: 'Location sharing stopped',
    };
  }
);

/**
 * Get active geoshare session info
 */
export const getGeoshareSession = onCall(
  { cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const { sessionId } = request.data;

    if (!sessionId) {
      throw new HttpsError('invalid-argument', 'Session ID is required');
    }

    // Get session
    const sessionDoc = await db.collection('geoshare_sessions').doc(sessionId).get();

    if (!sessionDoc.exists) {
      throw new HttpsError('not-found', 'Session not found');
    }

    const session = sessionDoc.data() as GeoshareSession;

    // Verify user is participant
    if (session.userA !== userId && session.userB !== userId) {
      throw new HttpsError('permission-denied', 'You are not a participant in this session');
    }

    // Get partner's latest location
    const partnerId = session.userA === userId ? session.userB : session.userA;
    
    const latestLocationQuery = await db
      .collection('geoshare_sessions')
      .doc(sessionId)
      .collection('locations')
      .where('userId', '==', partnerId)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    let partnerLocation = null;
    if (!latestLocationQuery.empty) {
      partnerLocation = latestLocationQuery.docs[0].data();
    }

    const now = new Date();
    const expiresAt = session.expiresAt.toDate();
    const remainingSeconds = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));

    return {
      success: true,
      session: {
        sessionId: session.sessionId,
        status: session.status,
        partnerId,
        durationMinutes: session.durationMinutes,
        expiresAt: expiresAt.toISOString(),
        remainingSeconds,
      },
      partnerLocation,
    };
  }
);

/**
 * Scheduled function to cleanup expired sessions
 * Runs every 5 minutes
 */
export const cleanupExpiredGeoshareSessions = onSchedule(
  { schedule: 'every 5 minutes', timeZone: 'UTC' },
  async (event) => {
    const now = new Date();
    const cutoffTime = new Date(
      now.getTime() - GEOSHARE_CONFIG.CLEANUP_GRACE_PERIOD_MINUTES * 60 * 1000
    );

    try {
      // Find expired sessions
      const expiredQuery = await db
        .collection('geoshare_sessions')
        .where('status', '==', 'ACTIVE')
        .where('expiresAt', '<', admin.firestore.Timestamp.fromDate(cutoffTime))
        .get();

      let expiredCount = 0;
      let deletedLocationsCount = 0;

      for (const sessionDoc of expiredQuery.docs) {
        const sessionId = sessionDoc.id;

        // Update session status
        await sessionDoc.ref.update({
          status: 'EXPIRED',
          lastUpdateAt: serverTimestamp(),
        });

        // Delete location history
        const locationsQuery = await sessionDoc.ref.collection('locations').get();
        
        const batch = db.batch();
        locationsQuery.docs.forEach((locDoc) => {
          batch.delete(locDoc.ref);
          deletedLocationsCount++;
        });
        
        await batch.commit();

        expiredCount++;
        logger.info(`Expired geoshare session: ${sessionId}, deleted ${locationsQuery.size} locations`);
      }

      logger.info(
        `Geoshare cleanup complete: ${expiredCount} sessions expired, ${deletedLocationsCount} locations deleted`
      );
    } catch (error) {
      logger.error('Error cleaning up geoshare sessions:', error);
      throw error;
    }
  }
);

/**
 * Delete old expired sessions (data retention)
 * Runs daily at 2 AM UTC
 */
export const deleteOldGeoshareSessions = onSchedule(
  { schedule: 'every day 02:00', timeZone: 'UTC' },
  async (event) => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    try {
      const oldSessionsQuery = await db
        .collection('geoshare_sessions')
        .where('status', 'in', ['EXPIRED', 'CANCELLED'])
        .where('lastUpdateAt', '<', admin.firestore.Timestamp.fromDate(sevenDaysAgo))
        .limit(500) // Process in batches
        .get();

      let deletedCount = 0;

      const batch = db.batch();
      oldSessionsQuery.docs.forEach((doc) => {
        batch.delete(doc.ref);
        deletedCount++;
      });

      await batch.commit();

      logger.info(`Deleted ${deletedCount} old geoshare sessions`);
    } catch (error) {
      logger.error('Error deleting old geoshare sessions:', error);
      throw error;
    }
  }
);
