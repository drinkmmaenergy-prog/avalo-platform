/**
 * PACK 324B — Fraud Signal Emission
 * 
 * NON-BLOCKING signal emission for fraud detection
 * These functions write signals but DO NOT block user flows
 */

import { Timestamp } from 'firebase-admin/firestore';
import { db, generateId } from './init';
import { logger } from 'firebase-functions/v2';
import {
  FraudSignal,
  FraudSignalSource,
  FraudSignalType,
  FraudSeverity,
  EmitSignalParams,
  EmitSignalResult,
  FRAUD_CONFIG,
  DETECTION_THRESHOLDS,
} from './pack324b-fraud-types';

// ============================================================================
// CORE SIGNAL EMISSION
// ============================================================================

/**
 * Emit a fraud signal (non-blocking)
 * This function NEVER throws - it logs errors but always returns
 */
export async function emitFraudSignal(
  params: EmitSignalParams
): Promise<EmitSignalResult> {
  try {
    const signalId = generateId();
    
    const signal: FraudSignal = {
      id: signalId,
      userId: params.userId,
      source: params.source,
      signalType: params.signalType,
      severity: params.severity,
      contextRef: params.contextRef,
      metadata: params.metadata,
      createdAt: Timestamp.now(),
    };
    
    // Write signal to Firestore (async, don't await)
    db.collection(FRAUD_CONFIG.COLLECTIONS.FRAUD_SIGNALS)
      .doc(signalId)
      .set(signal)
      .catch(error => {
        logger.error('Failed to write fraud signal:', error);
      });
    
    logger.info('Fraud signal emitted:', {
      userId: params.userId,
      type: params.signalType,
      severity: params.severity,
    });
    
    return {
      signalId,
      emitted: true,
      needsRiskRecalculation: true,
    };
  } catch (error) {
    logger.error('Error emitting fraud signal:', error);
    return {
      signalId: '',
      emitted: false,
      needsRiskRecalculation: false,
    };
  }
}

// ============================================================================
// TOKEN DRAIN PATTERN DETECTION
// ============================================================================

/**
 * Check for token drain pattern (repeated short paid calls)
 * Called after voice/video call ends
 */
export async function checkTokenDrainPattern(
  userId: string,
  sessionId: string,
  sessionType: 'VOICE' | 'VIDEO',
  durationSeconds: number,
  tokensCost: number
): Promise<void> {
  try {
    // Only check paid sessions that are very short
    if (durationSeconds >= DETECTION_THRESHOLDS.SHORT_SESSION_SECONDS) {
      return;
    }
    
    if (tokensCost === 0) {
      return; // Free sessions don't count
    }
    
    // Count recent short sessions in last 24h
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    
    const recentSignalsRef = await db
      .collection(FRAUD_CONFIG.COLLECTIONS.FRAUD_SIGNALS)
      .where('userId', '==', userId)
      .where('signalType', '==', 'TOKEN_DRAIN_PATTERN')
      .where('createdAt', '>=', Timestamp.fromDate(twentyFourHoursAgo))
      .count()
      .get();
    
    const recentCount = recentSignalsRef.data().count;
    
    // If this is the Nth short session, emit signal
    if (recentCount >= DETECTION_THRESHOLDS.SHORT_SESSION_COUNT_24H - 1) {
      const severity: FraudSeverity = recentCount >= 10 ? 5 : recentCount >= 7 ? 4 : 3;
      
      await emitFraudSignal({
        userId,
        source: sessionType === 'VOICE' ? 'AI_VOICE' : 'AI_VIDEO',
        signalType: 'TOKEN_DRAIN_PATTERN',
        severity,
        contextRef: sessionId,
        metadata: {
          durationSeconds,
          tokensCost,
          recentShortSessions: recentCount + 1,
          sessionType,
        },
      });
    }
  } catch (error) {
    logger.error('Error checking token drain pattern:', error);
  }
}

// ============================================================================
// MULTI-SESSION SPAM DETECTION
// ============================================================================

/**
 * Check for multi-session spam (AI/chat sends to many sessions in parallel)
 * Called when AI message is sent
 */
export async function checkMultiSessionSpam(
  userId: string,
  sessionId: string,
  source: 'AI_CHAT' | 'AI_VOICE' | 'AI_VIDEO' | 'CHAT'
): Promise<void> {
  try {
    // Get recent sessions from this user (last 5 minutes)
    const fiveMinutesAgo = new Date();
    fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - DETECTION_THRESHOLDS.PARALLEL_TIME_WINDOW_MIN);
    
    // This is a heuristic check - we look for recent signals of same type
    const recentSignalsRef = await db
      .collection(FRAUD_CONFIG.COLLECTIONS.FRAUD_SIGNALS)
      .where('userId', '==', userId)
      .where('source', '==', source)
      .where('createdAt', '>=', Timestamp.fromDate(fiveMinutesAgo))
      .limit(20)
      .get();
    
    // Count unique session contexts
    const uniqueSessions = new Set(recentSignalsRef.docs.map(doc => doc.data().contextRef));
    uniqueSessions.add(sessionId);
    
    if (uniqueSessions.size >= DETECTION_THRESHOLDS.PARALLEL_SESSION_COUNT) {
      const severity: FraudSeverity = uniqueSessions.size >= 10 ? 5 : uniqueSessions.size >= 7 ? 4 : 3;
      
      await emitFraudSignal({
        userId,
        source,
        signalType: 'MULTI_SESSION_SPAM',
        severity,
        contextRef: sessionId,
        metadata: {
          parallelSessions: uniqueSessions.size,
          timeWindowMinutes: DETECTION_THRESHOLDS.PARALLEL_TIME_WINDOW_MIN,
        },
      });
    }
  } catch (error) {
    logger.error('Error checking multi-session spam:', error);
  }
}

// ============================================================================
// COPY-PASTE BEHAVIOR DETECTION
// ============================================================================

/**
 * Check for copy-paste behavior (same reply to 3+ chats)
 * Called when message is sent in chat
 */
export async function checkCopyPasteBehavior(
  userId: string,
  chatId: string,
  messageText: string
): Promise<void> {
  try {
    // Only check messages with sufficient length
    if (!messageText || messageText.length < 20) {
      return;
    }
    
    // Create hash of message for comparison
    const messageHash = simpleHash(messageText.toLowerCase().trim());
    
    // Store in temporary cache collection for comparison
    const recentMessagesRef = db
      .collection('_fraud_message_cache')
      .doc(`${userId}_${messageHash}`);
    
    const recentMessagesSnap = await recentMessagesRef.get();
    const data = recentMessagesSnap.data();
    
    const tenMinutesAgo = new Date();
    tenMinutesAgo.setMinutes(tenMinutesAgo.getMinutes() - DETECTION_THRESHOLDS.COPY_PASTE_TIME_WINDOW_MIN);
    
    let chatIds: string[] = data?.chatIds || [];
    let timestamp = data?.timestamp?.toDate() || new Date(0);
    
    // If cache is old, reset
    if (timestamp < tenMinutesAgo) {
      chatIds = [chatId];
    } else if (!chatIds.includes(chatId)) {
      chatIds.push(chatId);
    }
    
    // Update cache (expires in 15 minutes)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);
    
    await recentMessagesRef.set({
      userId,
      messageHash,
      chatIds,
      timestamp: Timestamp.now(),
      expiresAt: Timestamp.fromDate(expiresAt),
    }, { merge: true });
    
    // If message sent to 3+ different chats, emit signal
    if (chatIds.length >= DETECTION_THRESHOLDS.IDENTICAL_MESSAGE_COUNT) {
      const severity: FraudSeverity = chatIds.length >= 7 ? 5 : chatIds.length >= 5 ? 4 : 3;
      
      await emitFraudSignal({
        userId,
        source: 'CHAT',
        signalType: 'COPY_PASTE_BEHAVIOR',
        severity,
        contextRef: chatId,
        metadata: {
          matchCount: chatIds.length,
          timeWindowMinutes: DETECTION_THRESHOLDS.COPY_PASTE_TIME_WINDOW_MIN,
          messageSnippet: messageText.substring(0, 100),
        },
      });
    }
  } catch (error) {
    logger.error('Error checking copy-paste behavior:', error);
  }
}

/**
 * Simple string hash function
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// ============================================================================
// FAKE BOOKINGS DETECTION
// ============================================================================

/**
 * Check for fake bookings pattern (event tickets refunded often)
 * Called when event ticket is refunded
 */
export async function checkFakeBookings(
  userId: string,
  eventId: string,
  ticketId: string
): Promise<void> {
  try {
    // Count total tickets and refunds for this user's events
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const ticketsRef = await db
      .collection('eventTickets')
      .where('eventOrganizerId', '==', userId)
      .where('eventId', '==', eventId)
      .where('createdAt', '>=', Timestamp.fromDate(thirtyDaysAgo))
      .get();
    
    let totalTickets = 0;
    let refundedTickets = 0;
    
    ticketsRef.forEach(doc => {
      totalTickets++;
      if (doc.data().status === 'REFUNDED') {
        refundedTickets++;
      }
    });
    
    // Need minimum count and high refund rate
    if (refundedTickets >= DETECTION_THRESHOLDS.MIN_REFUND_COUNT) {
      const refundRate = refundedTickets / totalTickets;
      
      if (refundRate >= DETECTION_THRESHOLDS.HIGH_REFUND_RATE) {
        const severity: FraudSeverity = refundRate >= 0.9 ? 5 : refundRate >= 0.8 ? 4 : 3;
        
        await emitFraudSignal({
          userId,
          source: 'EVENT',
          signalType: 'FAKE_BOOKINGS',
          severity,
          contextRef: eventId,
          metadata: {
            totalTickets,
            refundedTickets,
            refundRate: Math.round(refundRate * 100),
            ticketId,
          },
        });
      }
    }
  } catch (error) {
    logger.error('Error checking fake bookings:', error);
  }
}

// ============================================================================
// SELF REFUNDS DETECTION
// ============================================================================

/**
 * Check for self-refunds pattern (many bookings canceled by creator)
 * Called when calendar booking is canceled by host
 */
export async function checkSelfRefunds(
  userId: string,
  bookingId: string
): Promise<void> {
  try {
    // Count recent cancellations by this creator
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - DETECTION_THRESHOLDS.SELF_CANCEL_WINDOW_DAYS);
    
    const canceledBookingsRef = await db
      .collection('calendarBookings')
      .where('hostId', '==', userId)
      .where('status', '==', 'CANCELED')
      .where('canceledAt', '>=', Timestamp.fromDate(sevenDaysAgo))
      .count()
      .get();
    
    const canceledCount = canceledBookingsRef.data().count;
    
    if (canceledCount >= DETECTION_THRESHOLDS.SELF_CANCEL_COUNT) {
      const severity: FraudSeverity = canceledCount >= 15 ? 5 : canceledCount >= 10 ? 4 : 3;
      
      await emitFraudSignal({
        userId,
        source: 'CALENDAR',
        signalType: 'SELF_REFUNDS',
        severity,
        contextRef: bookingId,
        metadata: {
          canceledCount,
          timeWindowDays: DETECTION_THRESHOLDS.SELF_CANCEL_WINDOW_DAYS,
        },
      });
    }
  } catch (error) {
    logger.error('Error checking self refunds:', error);
  }
}

// ============================================================================
// PAYOUT ABUSE DETECTION
// ============================================================================

/**
 * Check for payout abuse (unusual payout attempts)
 * Called when payout is attempted
 */
export async function checkPayoutAbuse(
  userId: string,
  payoutId: string,
  amount: number
): Promise<void> {
  try {
    // Count payout attempts in last hour
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - DETECTION_THRESHOLDS.PAYOUT_TIME_WINDOW_HOURS);
    
    const recentPayoutsRef = await db
      .collection('payouts')
      .where('userId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(oneHourAgo))
      .get();
    
    const attemptCount = recentPayoutsRef.size;
    
    if (attemptCount >= DETECTION_THRESHOLDS.PAYOUT_ATTEMPT_COUNT) {
      const severity: FraudSeverity = attemptCount >= 10 ? 5 : attemptCount >= 5 ? 4 : 3;
      
      await emitFraudSignal({
        userId,
        source: 'WALLET',
        signalType: 'PAYOUT_ABUSE',
        severity,
        contextRef: payoutId,
        metadata: {
          amount,
          attemptCount,
          timeWindowHours: DETECTION_THRESHOLDS.PAYOUT_TIME_WINDOW_HOURS,
          pattern: 'rapid_attempts',
        },
      });
    }
  } catch (error) {
    logger.error('Error checking payout abuse:', error);
  }
}

// ============================================================================
// IDENTITY MISMATCH DETECTION
// ============================================================================

/**
 * Check for identity mismatch (repeated profile fraud reports)
 * Called when user profile is reported for fraud
 */
export async function checkIdentityMismatch(
  userId: string,
  reportId: string,
  reporterId: string
): Promise<void> {
  try {
    // Count unique reporters in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - DETECTION_THRESHOLDS.IDENTITY_REPORT_WINDOW_DAYS);
    
    const reportsRef = await db
      .collection('moderationQueue')
      .where('targetUserId', '==', userId)
      .where('category', '==', 'IDENTITY_FRAUD')
      .where('createdAt', '>=', Timestamp.fromDate(thirtyDaysAgo))
      .get();
    
    const reporterIds = new Set<string>();
    reportsRef.forEach(doc => {
      const reporterId = doc.data().reporterId;
      if (reporterId) {
        reporterIds.add(reporterId);
      }
    });
    
    const reportCount = reporterIds.size;
    
    if (reportCount >= DETECTION_THRESHOLDS.IDENTITY_REPORT_COUNT) {
      const severity: FraudSeverity = reportCount >= 10 ? 5 : reportCount >= 7 ? 4 : 3;
      
      await emitFraudSignal({
        userId,
        source: 'WALLET', // Using WALLET as generic user profile source
        signalType: 'IDENTITY_MISMATCH',
        severity,
        contextRef: reportId,
        metadata: {
          reportCount,
          uniqueReporters: reportCount,
          timeWindowDays: DETECTION_THRESHOLDS.IDENTITY_REPORT_WINDOW_DAYS,
        },
      });
    }
  } catch (error) {
    logger.error('Error checking identity mismatch:', error);
  }
}

// ============================================================================
// PANIC RATE SPIKE DETECTION
// ============================================================================

/**
 * Check for panic rate spike (excess panic triggers)
 * Called when panic button is triggered
 */
export async function checkPanicRateSpike(
  userId: string,
  panicEventId: string
): Promise<void> {
  try {
    // Count panic events in last 24 hours
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - DETECTION_THRESHOLDS.PANIC_TIME_WINDOW_HOURS);
    
    const panicEventsRef = await db
      .collection('safetyAlerts')
      .where('userId', '==', userId)
      .where('type', '==', 'PANIC')
      .where('createdAt', '>=', Timestamp.fromDate(twentyFourHoursAgo))
      .count()
      .get();
    
    const panicCount = panicEventsRef.data().count;
    
    if (panicCount >= DETECTION_THRESHOLDS.PANIC_COUNT_SPIKE) {
      const severity: FraudSeverity = panicCount >= 10 ? 5 : panicCount >= 7 ? 4 : 3;
      
      await emitFraudSignal({
        userId,
        source: 'WALLET', // Using WALLET as generic source
        signalType: 'PANIC_RATE_SPIKE',
        severity,
        contextRef: panicEventId,
        metadata: {
          panicCount,
          timeWindowHours: DETECTION_THRESHOLDS.PANIC_TIME_WINDOW_HOURS,
        },
      });
    }
  } catch (error) {
    logger.error('Error checking panic rate spike:', error);
  }
}

// ============================================================================
// CLEANUP FUNCTIONS
// ============================================================================

/**
 * Clean up old message cache entries
 * Run as scheduled function
 */
export async function cleanupMessageCache(): Promise<number> {
  try {
    const now = new Date();
    
    const expiredRef = await db
      .collection('_fraud_message_cache')
      .where('expiresAt', '<', Timestamp.fromDate(now))
      .limit(500)
      .get();
    
    const batch = db.batch();
    expiredRef.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    logger.info(`Cleaned up ${expiredRef.size} expired message cache entries`);
    return expiredRef.size;
  } catch (error) {
    logger.error('Error cleaning up message cache:', error);
    return 0;
  }
}

/**
 * Clean up old fraud signals
 * Run as scheduled function
 */
export async function cleanupOldFraudSignals(): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - FRAUD_CONFIG.SIGNAL_RETENTION_DAYS);
    
    const oldSignalsRef = await db
      .collection(FRAUD_CONFIG.COLLECTIONS.FRAUD_SIGNALS)
      .where('createdAt', '<', Timestamp.fromDate(cutoffDate))
      .limit(500)
      .get();
    
    const batch = db.batch();
    oldSignalsRef.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    logger.info(`Cleaned up ${oldSignalsRef.size} old fraud signals`);
    return oldSignalsRef.size;
  } catch (error) {
    logger.error('Error cleaning up old fraud signals:', error);
    return 0;
  }
}