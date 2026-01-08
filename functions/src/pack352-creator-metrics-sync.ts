/**
 * PACK 352 — Creator Metrics Sync
 * 
 * On-demand recompute of creator metrics for a specific creator and date range.
 * Useful for:
 * - Debugging creator earnings discrepancies
 * - Support/dispute handling
 * - Backfilling historical data
 * - Real-time creator dashboards
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
} from '../../shared/types/kpi';

const db = admin.firestore();

// ============================================================================
// On-Demand Creator Metrics Sync
// ============================================================================

/**
 * Recompute metrics for a single creator across a date range
 * 
 * @param creatorId - Creator user ID
 * @param dateRange - Start and end dates (YYYY-MM-DD)
 * @returns Array of computed metrics per day
 */
export const syncCreatorMetrics = functions.https.onCall(
  async (
    data: {
      creatorId: string;
      dateRange: DateRange;
    },
    context
  ) => {
    const { creatorId, dateRange } = data;

    // Verify authentication and permissions
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    // Allow admins or the creator themselves
    const isAdmin = context.auth.token.role === 'admin';
    const isCreator = context.auth.uid === creatorId;

    if (!isAdmin && !isCreator) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You can only view your own metrics'
      );
    }

    // Validate inputs
    if (!creatorId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'creatorId is required'
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
      const metrics = await computeCreatorMetricsForRange(creatorId, dateRange);

      // If admin, also save to Firestore
      if (isAdmin) {
        await saveCreatorMetrics(creatorId, metrics);
      }

      return {
        success: true,
        creatorId,
        dateRange,
        metrics,
      };
    } catch (error) {
      console.error('Error syncing creator metrics:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to sync creator metrics',
        error
      );
    }
  }
);

/**
 * Get current metrics for a creator (today + recent history)
 * Optimized for real-time creator dashboards
 */
export const getCreatorCurrentMetrics = functions.https.onCall(
  async (data: { creatorId: string; days?: number }, context) => {
    const { creatorId, days = 30 } = data;

    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    // Allow admins or the creator themselves
    const isAdmin = context.auth.token.role === 'admin';
    const isCreator = context.auth.uid === creatorId;

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
      const cachedMetrics = await getCreatorMetricsFromCache(creatorId, dateRange);

      if (cachedMetrics.length > 0) {
        return {
          success: true,
          creatorId,
          metrics: cachedMetrics,
          source: 'cache',
        };
      }

      // If not in cache, compute on-demand
      const computedMetrics = await computeCreatorMetricsForRange(creatorId, dateRange);

      return {
        success: true,
        creatorId,
        metrics: computedMetrics,
        source: 'computed',
      };
    } catch (error) {
      console.error('Error getting creator current metrics:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to get creator metrics',
        error
      );
    }
  }
);

/**
 * Batch sync for multiple creators
 * Admin only - useful for backfilling
 */
export const syncMultipleCreators = functions.https.onCall(
  async (
    data: {
      creatorIds: string[];
      dateRange: DateRange;
    },
    context
  ) => {
    // Only admins
    if (!context.auth || context.auth.token.role !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can batch sync'
      );
    }

    const { creatorIds, dateRange } = data;

    if (!Array.isArray(creatorIds) || creatorIds.length === 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'creatorIds must be a non-empty array'
      );
    }

    if (creatorIds.length > 100) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Maximum 100 creators per batch'
      );
    }

    try {
      const results = await Promise.allSettled(
        creatorIds.map((creatorId) =>
          computeCreatorMetricsForRange(creatorId, dateRange).then((metrics) =>
            saveCreatorMetrics(creatorId, metrics)
          )
        )
      );

      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      return {
        success: true,
        total: creatorIds.length,
        successful,
        failed,
      };
    } catch (error) {
      console.error('Error syncing multiple creators:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to sync creators',
        error
      );
    }
  }
);

// ============================================================================
// Core Computation Logic
// ============================================================================

/**
 * Compute creator metrics for a date range
 */
async function computeCreatorMetricsForRange(
  creatorId: string,
  dateRange: DateRange
): Promise<CreatorPerformanceMetrics[]> {
  const dates = generateDateArray(dateRange.startDate, dateRange.endDate);
  const metricsArray: CreatorPerformanceMetrics[] = [];

  for (const date of dates) {
    const metrics = await computeCreatorMetricsForDay(creatorId, date);
    metricsArray.push(metrics);
  }

  return metricsArray;
}

/**
 * Compute creator metrics for a single day
 */
async function computeCreatorMetricsForDay(
  creatorId: string,
  date: string
): Promise<CreatorPerformanceMetrics> {
  const { startTimestamp, endTimestamp } = getDateRange(date);

  // Query all events where this creator earned tokens
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

    // Check if this event is for our creator
    const eventCreatorId =
      context.creatorId || context.organizerId || (context.participantIds && context.participantIds[1]);

    if (eventCreatorId !== creatorId) {
      return; // Skip events not for this creator
    }

    const tokens = context.tokensCharged || context.ticketPrice || 0;
    const userId = event.userId;

    switch (event.eventType) {
      case KpiEventType.CHAT_PAID_STARTED:
      case KpiEventType.CHAT_PAID_ENDED:
        chatSessionsPaid++;
        const chatEarnings = tokens * 0.65; // Creator gets 65%
        tokensEarnedChat += chatEarnings;
        tokensEarned += chatEarnings;
        if (userId) uniquePayingUsers.add(userId);
        break;

      case KpiEventType.VOICE_CALL_ENDED:
        voiceCallsPaid++;
        const voiceEarnings = tokens * 0.65;
        tokensEarnedVoiceCalls += voiceEarnings;
        tokensEarned += voiceEarnings;
        if (userId) uniquePayingUsers.add(userId);
        break;

      case KpiEventType.VIDEO_CALL_ENDED:
        videoCallsPaid++;
        const videoEarnings = tokens * 0.65;
        tokensEarnedVideoCalls += videoEarnings;
        tokensEarned += videoEarnings;
        if (userId) uniquePayingUsers.add(userId);
        break;

      case KpiEventType.CALENDAR_BOOKING_COMPLETED:
        calendarBookings++;
        const calendarEarnings = tokens * 0.80; // Creator gets 80%
        tokensEarnedCalendar += calendarEarnings;
        tokensEarned += calendarEarnings;
        if (userId) uniquePayingUsers.add(userId);
        break;

      case KpiEventType.EVENT_TICKET_PURCHASED:
        eventTicketsSold++;
        const eventEarnings = tokens * 0.80; // Organizer gets 80%
        tokensEarnedEvents += eventEarnings;
        tokensEarned += eventEarnings;
        if (userId) uniquePayingUsers.add(userId);
        break;

      case KpiEventType.AI_COMPANION_PAID_MESSAGE:
        aiCompanionSessions++;
        const aiEarnings = tokens * 0.65;
        tokensEarnedAI += aiEarnings;
        tokensEarned += aiEarnings;
        if (userId) uniquePayingUsers.add(userId);
        break;

      case KpiEventType.PAYOUT_REQUESTED:
        if (context.creatorId === creatorId) {
          payoutsRequested++;
          payoutsPending++;
          hasActivePayouts = true;
        }
        break;

      case KpiEventType.PAYOUT_COMPLETED:
        if (context.creatorId === creatorId) {
          payoutsCompleted++;
          if (payoutsPending > 0) payoutsPending--;
        }
        break;

      case KpiEventType.FRAUD_FLAG_RAISED:
      case KpiEventType.USER_BANNED:
      case KpiEventType.USER_SUSPENDED:
        if (context.targetUserId === creatorId || event.userId === creatorId) {
          isFlagged = true;
        }
        break;
    }
  });

  // Calculate returning payers
  const returningPayersCount = await calculateReturningPayers(
    creatorId,
    Array.from(uniquePayingUsers),
    date
  );

  return {
    creatorId,
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
    isTopPerformer: false, // Computed relative to other creators
  };
}

/**
 * Calculate how many users paid this creator before this date
 */
async function calculateReturningPayers(
  creatorId: string,
  todayPayers: string[],
  date: string
): Promise<number> {
  if (todayPayers.length === 0) return 0;

  const { startTimestamp } = getDateRange(date);
  let returningCount = 0;

  // For each user who paid today, check if they paid this creator before
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
      // Check if any of these prior payments were to this creator
      for (const doc of priorPayments.docs) {
        const event = doc.data();
        const context = event.context as any;
        const eventCreatorId =
          context.creatorId ||
          context.organizerId ||
          (context.participantIds && context.participantIds[1]);

        if (eventCreatorId === creatorId) {
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
 * Get creator metrics from cached daily metrics documents
 */
async function getCreatorMetricsFromCache(
  creatorId: string,
  dateRange: DateRange
): Promise<CreatorPerformanceMetrics[]> {
  const dates = generateDateArray(dateRange.startDate, dateRange.endDate);
  const metrics: CreatorPerformanceMetrics[] = [];

  for (const date of dates) {
    const docId = `${creatorId}_${date}`;
    const doc = await db.collection('creatorDailyMetrics').doc(docId).get();

    if (doc.exists) {
      const data = doc.data() as CreatorDailyMetricsDocument;
      metrics.push({
        creatorId: data.creatorId,
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
  creatorId: string,
  metrics: CreatorPerformanceMetrics[]
): Promise<void> {
  const batch = db.batch();

  for (const metric of metrics) {
    const docId = `${creatorId}_${metric.date}`;
    const docRef = db.collection('creatorDailyMetrics').doc(docId);

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
