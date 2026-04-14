import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 352 — Creator Metrics Sync
 * 
 * On-demand recompute of earner metrics for a specific earner and date range.
 * Useful for:
 * - Debugging earner earnings discrepancies
 * - Support/dispute handling
 * - Backfilling historical data
 * - Real-time earner dashboards
 * 
 * This is analytics-only: no changes to business logic.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  CreatorPerformanceMetrics,
  CreatorDailyMetricsDocument,
  DateRange,
  KpiEventType,
} from './types/shared/types/kpi';
import { FieldValue, HttpsError, Timestamp, auth, onCall, serverTimestamp } from './runtime';

const db = admin.firestore();

// ============================================================================
// On-Demand Creator Metrics Sync
// ============================================================================

/**
 * Recompute metrics for a single earner across a date range
 * 
 * @param earnerId - Creator user ID
 * @param dateRange - Start and end dates (YYYY-MM-DD)
 * @returns Array of computed metrics per day
 */
export const syncCreatorMetrics = functions.https.onCall(async (request) => {
  const data = request.data;
    const { earnerId, dateRange } = data;

    // Verify authentication and permissions
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    // Allow admins or the earner themselves
    const isAdmin = request.auth.token.role === 'admin';
    const isCreator = request.auth.uid === earnerId;

    if (!isAdmin && !isCreator) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You can only view your own metrics'
      );
    }

    // Validate inputs
    if (!earnerId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'earnerId is required'
      );
    }

    if (!dateRange || !dateRange.startDate || !dateRange.endDate) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'dateRange with startDate and endDate is required'
      );
    }

    if (!isValidDateString(dateRange.startDate) || !isValidDateString(dateRange.endDate)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Dates must be in YYYY-MM-DD format'
      );
    }

    try {
      const metrics = await computeCreatorMetricsForRange(earnerId, dateRange);

      // If admin, also save to Firestore
      if (isAdmin) {
        await saveCreatorMetrics(earnerId, metrics);
      }

      return {
        success: true,
        earnerId,
        dateRange,
        metrics,
      };
    } catch (error) {
      console.error('Error syncing earner metrics:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to sync earner metrics',
        error
      );
    }
  }
);

/**
 * Get current metrics for a earner (today + recent history)
 * Optimized for real-time earner dashboards
 */
export const getCreatorCurrentMetrics = functions.https.onCall(async (request) => {
  const data = request.data;
    const { earnerId, days = 30 } = data;

    // Verify authentication
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    // Allow admins or the earner themselves
    const isAdmin = request.auth.token.role === 'admin';
    const isCreator = request.auth.uid === earnerId;

    if (!isAdmin && !isCreator) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You can only view your own metrics'
      );
    }

    try {
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const dateRange: DateRange = {
        startDate: formatDateString(startDate),
        endDate: formatDateString(endDate),
      };

      // Try to get from cache first (daily metrics documents)
      const cachedMetrics = await getCreatorMetricsFromCache(earnerId, dateRange);

      if (cachedMetrics.length > 0) {
        return {
          success: true,
          earnerId,
          metrics: cachedMetrics,
          source: 'cache',
        };
      }

      // If not in cache, compute on-demand
      const computedMetrics = await computeCreatorMetricsForRange(earnerId, dateRange);

      return {
        success: true,
        earnerId,
        metrics: computedMetrics,
        source: 'computed',
      };
    } catch (error) {
      console.error('Error getting earner current metrics:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to get earner metrics',
        error
      );
    }
  }
);

/**
 * Batch sync for multiple earners
 * Admin only - useful for backfilling
 */
export const syncMultipleCreators = functions.https.onCall(async (request) => {
  const data = request.data;
    // Only admins
    if (!request.auth || request.auth.token.role !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can batch sync'
      );
    }

    const { earnerIds, dateRange } = data;

    if (!Array.isArray(earnerIds) || earnerIds.length === 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'earnerIds must be a non-empty array'
      );
    }

    if (earnerIds.length > 100) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Maximum 100 earners per batch'
      );
    }

    try {
      const results = await Promise.allSettled(
        earnerIds.map((earnerId) =>
          computeCreatorMetricsForRange(earnerId, dateRange).then((metrics) =>
            saveCreatorMetrics(earnerId, metrics)
          )
        )
      );

      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      return {
        success: true,
        total: earnerIds.length,
        successful,
        failed,
      };
    } catch (error) {
      console.error('Error syncing multiple earners:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to sync earners',
        error
      );
    }
  }
);

// ============================================================================
// Core Computation Logic
// ============================================================================

/**
 * Compute earner metrics for a date range
 */
async function computeCreatorMetricsForRange(
  earnerId: string,
  dateRange: DateRange
): Promise<CreatorPerformanceMetrics[]> {
  const dates = generateDateArray(dateRange.startDate, dateRange.endDate);
  const metricsArray: CreatorPerformanceMetrics[] = [];

  for (const date of dates) {
    const metrics = await computeCreatorMetricsForDay(earnerId, date);
    metricsArray.push(metrics);
  }

  return metricsArray;
}

/**
 * Compute earner metrics for a single day
 */
async function computeCreatorMetricsForDay(
  earnerId: string,
  date: string
): Promise<CreatorPerformanceMetrics> {
  const { startTimestamp, endTimestamp } = getDateRange(date);

  // Query all events where this earner earned tokens
  const eventsSnapshot = await db
    .collection('kpiEvents')
    .where('createdAt', '>=', startTimestamp)
    .where('createdAt', '<', endTimestamp)
    .get();

  let tokensEarned = 0;
  let tokensEarnedChat = 0;
  let tokensEarnedVoiceCalls = 0;
  let tokensEarnedVideoCalls = 0;
  let tokensEarnedCalendar = 0;
  let tokensEarnedEvents = 0;
  let tokensEarnedAI = 0;
  let tokensEarnedTips = 0;
  let tokensEarnedMedia = 0;

  let chatSessionsPaid = 0;
  let voiceCallsPaid = 0;
  let videoCallsPaid = 0;
  let calendarBookings = 0;
  let eventTicketsSold = 0;
  let aiCompanionSessions = 0;

  let payoutsRequested = 0;
  let payoutsCompleted = 0;
  let payoutsPending = 0;

  const uniquePayingUsers = new Set<string>();
  let hasActivePayouts = false;
  let isFlagged = false;

  eventsSnapshot.forEach((doc) => {
    const event = doc.data();
    const context = event.context as any;

    // Check if this event is for our earner
    const eventCreatorId =
      context.earnerId || context.organizerId || (context.participantIds && context.participantIds[1]);

    if (eventCreatorId !== earnerId) {
      return; // Skip events not for this earner
    }

    const tokens = context.tokensCharged || context.ticketPrice || 0;
    const userId = event.userId;

    switch (event.eventType) {
      case KpiEventType.CHAT_PAID_STARTED:
      case KpiEventType.CHAT_PAID_ENDED:
        chatSessionsPaid++;
        const chatEarnings = tokens * MONETIZATION_SPLITS.CHAT.earner; // Creator gets 65%
        tokensEarnedChat += chatEarnings;
        tokensEarned += chatEarnings;
        if (userId) uniquePayingUsers.add(userId);
        break;

      case KpiEventType.VOICE_CALL_ENDED:
        voiceCallsPaid++;
        const voiceEarnings = tokens * MONETIZATION_SPLITS.CHAT.earner;
        tokensEarnedVoiceCalls += voiceEarnings;
        tokensEarned += voiceEarnings;
        if (userId) uniquePayingUsers.add(userId);
        break;

      case KpiEventType.VIDEO_CALL_ENDED:
        videoCallsPaid++;
        const videoEarnings = tokens * MONETIZATION_SPLITS.CHAT.earner;
        tokensEarnedVideoCalls += videoEarnings;
        tokensEarned += videoEarnings;
        if (userId) uniquePayingUsers.add(userId);
        break;

      case KpiEventType.CALENDAR_BOOKING_COMPLETED:
        calendarBookings++;
        const calendarEarnings = tokens * MONETIZATION_SPLITS.EVENT_TICKET.earner; // Creator gets 80%
        tokensEarnedCalendar += calendarEarnings;
        tokensEarned += calendarEarnings;
        if (userId) uniquePayingUsers.add(userId);
        break;

      case KpiEventType.EVENT_TICKET_PURCHASED:
        eventTicketsSold++;
        const eventEarnings = tokens * MONETIZATION_SPLITS.EVENT_TICKET.earner; // Organizer gets 80%
        tokensEarnedEvents += eventEarnings;
        tokensEarned += eventEarnings;
        if (userId) uniquePayingUsers.add(userId);
        break;

      case KpiEventType.AI_COMPANION_PAID_MESSAGE:
        aiCompanionSessions++;
        const aiEarnings = tokens * MONETIZATION_SPLITS.CHAT.earner;
        tokensEarnedAI += aiEarnings;
        tokensEarned += aiEarnings;
        if (userId) uniquePayingUsers.add(userId);
        break;

      case KpiEventType.PAYOUT_REQUESTED:
        if (context.earnerId === earnerId) {
          payoutsRequested++;
          payoutsPending++;
          hasActivePayouts = true;
        }
        break;

      case KpiEventType.PAYOUT_COMPLETED:
        if (context.earnerId === earnerId) {
          payoutsCompleted++;
          if (payoutsPending > 0) payoutsPending--;
        }
        break;

      case KpiEventType.FRAUD_FLAG_RAISED:
      case KpiEventType.USER_BANNED:
      case KpiEventType.USER_SUSPENDED:
        if (context.targetUserId === earnerId || event.userId === earnerId) {
          isFlagged = true;
        }
        break;
    }
  });

  // Calculate returning payers
  const returningPayersCount = await calculateReturningPayers(
    earnerId,
    Array.from(uniquePayingUsers),
    date
  );

  return {
    earnerId,
    date,
    tokensEarned,
    tokensEarnedChat,
    tokensEarnedVoiceCalls,
    tokensEarnedVideoCalls,
    tokensEarnedCalendar,
    tokensEarnedEvents,
    tokensEarnedAI,
    tokensEarnedTips,
    tokensEarnedMedia,
    payoutsRequested,
    payoutsCompleted,
    payoutsPending,
    chatSessionsPaid,
    voiceCallsPaid,
    videoCallsPaid,
    calendarBookings,
    eventTicketsSold,
    aiCompanionSessions,
    uniquePayingUsers: uniquePayingUsers.size,
    returningPayersCount,
    hasActivePayouts,
    isFlagged,
    isTopPerformer: false, // Computed relative to other earners
  };
}

/**
 * Calculate how many users paid this earner before this date
 */
async function calculateReturningPayers(
  earnerId: string,
  todayPayers: string[],
  date: string
): Promise<number> {
  if (todayPayers.length === 0) return 0;

  const { startTimestamp } = getDateRange(date);
  let returningCount = 0;

  // For each user who paid today, check if they paid this earner before
  for (const userId of todayPayers) {
    const priorPayments = await db
      .collection('kpiEvents')
      .where('userId', '==', userId)
      .where('createdAt', '<', startTimestamp)
      .where('eventType', 'in', [
        KpiEventType.CHAT_PAID_STARTED,
        KpiEventType.VOICE_CALL_ENDED,
        KpiEventType.VIDEO_CALL_ENDED,
        KpiEventType.CALENDAR_BOOKING_COMPLETED,
        KpiEventType.EVENT_TICKET_PURCHASED,
      ])
      .limit(1)
      .get();

    if (!priorPayments.empty) {
      // Check if any of these prior payments were to this earner
      for (const doc of priorPayments.docs) {
        const event = doc.data();
        const context = event.context as any;
        const eventCreatorId =
          context.earnerId ||
          context.organizerId ||
          (context.participantIds && context.participantIds[1]);

        if (eventCreatorId === earnerId) {
          returningCount++;
          break;
        }
      }
    }
  }

  return returningCount;
}

// ============================================================================
// Cache & Storage
// ============================================================================

/**
 * Get earner metrics from cached daily metrics documents
 */
async function getCreatorMetricsFromCache(
  earnerId: string,
  dateRange: DateRange
): Promise<CreatorPerformanceMetrics[]> {
  const dates = generateDateArray(dateRange.startDate, dateRange.endDate);
  const metrics: CreatorPerformanceMetrics[] = [];

  for (const date of dates) {
    const docId = `${earnerId}_${date}`;
    const doc = await db.collection('earnerDailyMetrics').doc(docId).get();

    if (doc.exists) {
      const data = doc.data() as CreatorDailyMetricsDocument;
      metrics.push({
        earnerId: data.earnerId,
        date: data.date,
        tokensEarned: data.tokensEarned,
        tokensEarnedChat: data.tokensEarnedChat,
        tokensEarnedVoiceCalls: data.tokensEarnedVoiceCalls,
        tokensEarnedVideoCalls: data.tokensEarnedVideoCalls,
        tokensEarnedCalendar: data.tokensEarnedCalendar,
        tokensEarnedEvents: data.tokensEarnedEvents,
        tokensEarnedAI: data.tokensEarnedAI,
        tokensEarnedTips: data.tokensEarnedTips,
        tokensEarnedMedia: data.tokensEarnedMedia,
        payoutsRequested: data.payoutsRequested,
        payoutsCompleted: data.payoutsCompleted,
        payoutsPending: data.payoutsPending,
        chatSessionsPaid: data.chatSessionsPaid,
        voiceCallsPaid: data.voiceCallsPaid,
        videoCallsPaid: data.videoCallsPaid,
        calendarBookings: data.calendarBookings,
        eventTicketsSold: data.eventTicketsSold,
        aiCompanionSessions: data.aiCompanionSessions,
        uniquePayingUsers: data.uniquePayingUsers,
        returningPayersCount: data.returningPayersCount,
        hasActivePayouts: data.hasActivePayouts,
        isFlagged: data.isFlagged,
        isTopPerformer: data.isTopPerformer,
      });
    }
  }

  return metrics;
}

/**
 * Save computed metrics to Firestore
 */
async function saveCreatorMetrics(
  earnerId: string,
  metrics: CreatorPerformanceMetrics[]
): Promise<void> {
  const batch = db.batch();

  for (const metric of metrics) {
    const docId = `${earnerId}_${metric.date}`;
    const docRef = db.collection('earnerDailyMetrics').doc(docId);

    const doc: CreatorDailyMetricsDocument = {
      ...metric,
      computedAt: admin.firestore.FieldValue.serverTimestamp() as any,
      version: 1,
    };

    batch.set(docRef, doc, { merge: true });
  }

  await batch.commit();
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate array of date strings between start and end (inclusive)
 */
function generateDateArray(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    dates.push(formatDateString(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Validate date string format
 */
function isValidDateString(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

/**
 * Get Firestore timestamps for a date range
 */
function getDateRange(
  date: string
): { startTimestamp: admin.firestore.Timestamp; endTimestamp: admin.firestore.Timestamp } {
  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(date);
  endDate.setHours(23, 59, 59, 999);

  return {
    startTimestamp: admin.firestore.Timestamp.fromDate(startDate),
    endTimestamp: admin.firestore.Timestamp.fromDate(endDate),
  };
}




























