/**
 * PACK 352 — Daily KPI Aggregator
 * 
 * Scheduled function that runs daily to compute and store aggregate metrics.
 * Reads from various Firestore collections and creates daily summaries.
 * 
 * This is analytics-only: no changes to business logic.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  KpiDailyMetricsDocument,
  DailyGrowthMetrics,
  DailyMonetizationMetrics,
  DailySafetyMetrics,
  DEFAULT_REVENUE_BY_VERTICAL,
  DEFAULT_FRAUD_BY_SEVERITY,
  KpiEventType,
} from '../../shared/types/kpi';

const db = admin.firestore();

// ============================================================================
// Scheduled Daily Aggregation
// ============================================================================

/**
 * Main scheduled function - runs daily at 02:00 UTC
 * Computes metrics for the previous day
 */
export const aggregateDailyKpis = functions.pubsub
  .schedule('0 2 * * *') // Daily at 02:00 UTC
  .timeZone('UTC')
  .onRun(async (context) => {
    try {
      // Calculate for yesterday (to ensure all data is complete)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateString = formatDateString(yesterday);

      console.log(`Starting daily KPI aggregation for ${dateString}`);

      // Aggregate all metrics
      const [growth, monetization, safety] = await Promise.all([
        aggregateGrowthMetrics(dateString),
        aggregateMonetizationMetrics(dateString),
        aggregateSafetyMetrics(dateString),
      ]);

      // Create composite document
      const dailyMetrics: KpiDailyMetricsDocument = {
        date: dateString,
        growth,
        monetization,
        safety,
        computedAt: admin.firestore.FieldValue.serverTimestamp() as any,
        version: 1,
      };

      // Write to Firestore
      await db
        .collection('kpiDailyMetrics')
        .doc(dateString)
        .set(dailyMetrics, { merge: true });

      console.log(`Successfully aggregated KPIs for ${dateString}`);

      // Also aggregate creator metrics for the day
      await aggregateCreatorMetrics(dateString);

      return { success: true, date: dateString };
    } catch (error) {
      console.error('Error in daily KPI aggregation:', error);
      throw error;
    }
  });

/**
 * On-demand aggregation for a specific date
 * Useful for backfilling or recomputing
 */
export const aggregateKpisForDate = functions.https.onCall(
  async (data: { date: string }, context) => {
    // Only admins can trigger on-demand aggregation
    if (!context.auth || context.auth.token.role !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can trigger on-demand aggregation'
      );
    }

    const { date } = data;

    if (!isValidDateString(date)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Date must be in YYYY-MM-DD format'
      );
    }

    console.log(`Starting on-demand KPI aggregation for ${date}`);

    try {
      const [growth, monetization, safety] = await Promise.all([
        aggregateGrowthMetrics(date),
        aggregateMonetizationMetrics(date),
        aggregateSafetyMetrics(date),
      ]);

      const dailyMetrics: KpiDailyMetricsDocument = {
        date,
        growth,
        monetization,
        safety,
        computedAt: admin.firestore.FieldValue.serverTimestamp() as any,
        version: 1,
      };

      await db.collection('kpiDailyMetrics').doc(date).set(dailyMetrics, { merge: true });

      await aggregateCreatorMetrics(date);

      return { success: true, date };
    } catch (error) {
      console.error(`Error aggregating KPIs for ${date}:`, error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to aggregate KPIs',
        error
      );
    }
  }
);

// ============================================================================
// Growth Metrics Aggregation
// ============================================================================

async function aggregateGrowthMetrics(date: string): Promise<DailyGrowthMetrics> {
  const { startTimestamp, endTimestamp } = getDateRange(date);

  // Query kpiEvents for growth-related events
  const eventsSnapshot = await db
    .collection('kpiEvents')
    .where('createdAt', '>=', startTimestamp)
    .where('createdAt', '<', endTimestamp)
    .get();

  let newSignups = 0;
  let verifiedUsers = 0;
  let completedProfiles = 0;
  let totalSwipes = 0;
  let totalLikes = 0;
  let totalPasses = 0;

  const activeUserIds = new Set<string>();

  eventsSnapshot.forEach((doc) => {
    const event = doc.data();
    const userId = event.userId;

    if (userId) {
      activeUserIds.add(userId);
    }

    switch (event.eventType) {
      case KpiEventType.SIGNUP:
        newSignups++;
        break;
      case KpiEventType.VERIFICATION_COMPLETED:
        verifiedUsers++;
        break;
      case KpiEventType.PROFILE_COMPLETED:
        completedProfiles++;
        break;
      case KpiEventType.SWIPE_LIKE:
        totalSwipes++;
        totalLikes++;
        break;
      case KpiEventType.SWIPE_PASS:
        totalSwipes++;
        totalPasses++;
        break;
    }
  });

  // Calculate rolling metrics (WAU, MAU)
  const activeUsersWeeklyRolling = await calculateRollingActiveUsers(date, 7);
  const activeUsersMonthlyRolling = await calculateRollingActiveUsers(date, 30);

  // Calculate matches (simplified - would need match events in real implementation)
  const totalMatches = 0; // TODO: Implement actual match counting

  return {
    date,
    newSignups,
    verifiedUsers,
    completedProfiles,
    activeUsersDaily: activeUserIds.size,
    activeUsersWeeklyRolling,
    activeUsersMonthlyRolling,
    totalSwipes,
    totalLikes,
    totalPasses,
    totalMatches,
  };
}

/**
 * Calculate rolling active users (WAU/MAU)
 */
async function calculateRollingActiveUsers(
  endDate: string,
  days: number
): Promise<number> {
  const end = new Date(endDate);
  const start = new Date(end);
  start.setDate(start.getDate() - days);

  const startTimestamp = admin.firestore.Timestamp.fromDate(start);
  const endTimestamp = admin.firestore.Timestamp.fromDate(end);

  // Query events in the rolling window
  const eventsSnapshot = await db
    .collection('kpiEvents')
    .where('createdAt', '>=', startTimestamp)
    .where('createdAt', '<', endTimestamp)
    .select('userId')
    .get();

  const uniqueUsers = new Set<string>();
  eventsSnapshot.forEach((doc) => {
    const userId = doc.data().userId;
    if (userId) {
      uniqueUsers.add(userId);
    }
  });

  return uniqueUsers.size;
}

// ============================================================================
// Monetization Metrics Aggregation
// ============================================================================

async function aggregateMonetizationMetrics(
  date: string
): Promise<DailyMonetizationMetrics> {
  const { startTimestamp, endTimestamp } = getDateRange(date);

  // Query monetary events
  const eventsSnapshot = await db
    .collection('kpiEvents')
    .where('createdAt', '>=', startTimestamp)
    .where('createdAt', '<', endTimestamp)
    .get();

  let totalTokenPurchases = 0;
  let totalTokensSold = 0;
  let totalTokensBurned = 0;
  let totalPlatformRevenueTokens = 0;
  let payoutRequestsCount = 0;
  let payoutCompletedCount = 0;
  let payoutTotalAmount = 0;
  let totalFiatRevenue = 0;

  const payingUsers = new Set<string>();
  const revenueByVertical = { ...DEFAULT_REVENUE_BY_VERTICAL };

  eventsSnapshot.forEach((doc) => {
    const event = doc.data();
    const context = event.context as any;

    switch (event.eventType) {
      case KpiEventType.TOKEN_PURCHASE:
        totalTokenPurchases++;
        totalTokensSold += context.amount || 0;
        totalFiatRevenue += context.fiatValue || 0;
        if (event.userId) {
          payingUsers.add(event.userId);
        }
        break;

      case KpiEventType.CHAT_PAID_STARTED:
      case KpiEventType.CHAT_PAID_ENDED:
        const chatTokens = context.tokensCharged || 0;
        totalTokensBurned += chatTokens;
        revenueByVertical.chat += chatTokens;
        // Platform takes 35% (from 65/35 split)
        totalPlatformRevenueTokens += chatTokens * 0.35;
        break;

      case KpiEventType.VOICE_CALL_STARTED:
      case KpiEventType.VOICE_CALL_ENDED:
        const voiceTokens = context.tokensCharged || 0;
        totalTokensBurned += voiceTokens;
        revenueByVertical.voiceCalls += voiceTokens;
        totalPlatformRevenueTokens += voiceTokens * 0.35;
        break;

      case KpiEventType.VIDEO_CALL_STARTED:
      case KpiEventType.VIDEO_CALL_ENDED:
        const videoTokens = context.tokensCharged || 0;
        totalTokensBurned += videoTokens;
        revenueByVertical.videoCalls += videoTokens;
        totalPlatformRevenueTokens += videoTokens * 0.35;
        break;

      case KpiEventType.CALENDAR_BOOKING_CREATED:
      case KpiEventType.CALENDAR_BOOKING_COMPLETED:
        const calendarTokens = context.tokensCharged || 0;
        totalTokensBurned += calendarTokens;
        revenueByVertical.calendar += calendarTokens;
        // Platform takes 20% (from 80/20 split)
        totalPlatformRevenueTokens += calendarTokens * 0.20;
        break;

      case KpiEventType.EVENT_TICKET_PURCHASED:
        const eventTokens = context.ticketPrice || 0;
        totalTokensBurned += eventTokens;
        revenueByVertical.events += eventTokens;
        // Platform takes 20%
        totalPlatformRevenueTokens += eventTokens * 0.20;
        break;

      case KpiEventType.AI_COMPANION_PAID_MESSAGE:
        const aiTokens = context.tokensCharged || 0;
        totalTokensBurned += aiTokens;
        revenueByVertical.aiCompanion += aiTokens;
        totalPlatformRevenueTokens += aiTokens * 0.35; // Assuming 65/35 split
        break;

      case KpiEventType.PAYOUT_REQUESTED:
        payoutRequestsCount++;
        payoutTotalAmount += context.amount || 0;
        break;

      case KpiEventType.PAYOUT_COMPLETED:
        payoutCompletedCount++;
        break;
    }
  });

  // Calculate new paying users (users who made their first purchase today)
  const newPayingUsersCount = await calculateNewPayingUsers(
    date,
    Array.from(payingUsers)
  );

  return {
    date,
    totalTokenPurchases,
    totalTokensSold,
    totalTokensBurned,
    totalPlatformRevenueTokens,
    payingUsersCount: payingUsers.size,
    newPayingUsersCount,
    revenueByVertical,
    totalFiatRevenue,
    currency: 'USD',
    payoutRequestsCount,
    payoutCompletedCount,
    payoutTotalAmount,
  };
}

/**
 * Calculate how many users made their first purchase on this date
 */
async function calculateNewPayingUsers(
  date: string,
  todayPayingUsers: string[]
): Promise<number> {
  if (todayPayingUsers.length === 0) return 0;

  const { startTimestamp } = getDateRange(date);

  let newCount = 0;

  // Check each user to see if they had prior purchases
  for (const userId of todayPayingUsers) {
    const priorPurchases = await db
      .collection('kpiEvents')
      .where('userId', '==', userId)
      .where('eventType', '==', KpiEventType.TOKEN_PURCHASE)
      .where('createdAt', '<', startTimestamp)
      .limit(1)
      .get();

    if (priorPurchases.empty) {
      newCount++;
    }
  }

  return newCount;
}

// ============================================================================
// Safety Metrics Aggregation
// ============================================================================

async function aggregateSafetyMetrics(date: string): Promise<DailySafetyMetrics> {
  const { startTimestamp, endTimestamp } = getDateRange(date);

  // Query safety-related events
  const eventsSnapshot = await db
    .collection('kpiEvents')
    .where('createdAt', '>=', startTimestamp)
    .where('createdAt', '<', endTimestamp)
    .get();

  let supportTicketsTotal = 0;
  let supportTicketsSafety = 0;
  let supportTicketsResolved = 0;
  let panicEventsCount = 0;
  let bansCount = 0;
  let suspensionsCount = 0;
  let fraudFlagsCount = 0;

  const fraudByType: Record<string, number> = {};
  const fraudBySeverity = { ...DEFAULT_FRAUD_BY_SEVERITY };

  eventsSnapshot.forEach((doc) => {
    const event = doc.data();
    const context = event.context as any;

    switch (event.eventType) {
      case KpiEventType.SUPPORT_TICKET_CREATED:
        supportTicketsTotal++;
        if (context.isSafety) {
          supportTicketsSafety++;
        }
        break;

      case KpiEventType.SUPPORT_TICKET_RESOLVED:
        supportTicketsResolved++;
        break;

      case KpiEventType.PANIC_TRIGGERED:
        panicEventsCount++;
        break;

      case KpiEventType.USER_BANNED:
        bansCount++;
        break;

      case KpiEventType.USER_SUSPENDED:
        suspensionsCount++;
        break;

      case KpiEventType.FRAUD_FLAG_RAISED:
        fraudFlagsCount++;

        const flagType = context.flagType || 'unknown';
        fraudByType[flagType] = (fraudByType[flagType] || 0) + 1;

        const severity = context.severity || 'low';
        if (severity in fraudBySeverity) {
          fraudBySeverity[severity as keyof typeof fraudBySeverity]++;
        }
        break;
    }
  });

  // TODO: Implement geographic risk calculation
  // Would require geo data in events and risk scoring algorithm
  const highRiskRegions = undefined;

  return {
    date,
    supportTicketsTotal,
    supportTicketsSafety,
    supportTicketsResolved,
    panicEventsCount,
    bansCount,
    suspensionsCount,
    fraudFlagsCount,
    fraudByType,
    fraudBySeverity,
    highRiskRegions,
  };
}

// ============================================================================
// Creator Metrics Aggregation
// ============================================================================

/**
 * Aggregate metrics for all active creators on a given date
 */
async function aggregateCreatorMetrics(date: string): Promise<void> {
  const { startTimestamp, endTimestamp } = getDateRange(date);

  // Get all events with tokens earned by creators
  const eventsSnapshot = await db
    .collection('kpiEvents')
    .where('createdAt', '>=', startTimestamp)
    .where('createdAt', '<', endTimestamp)
    .get();

  // Group events by creator
  const creatorEvents = new Map<
    string,
    Array<{ eventType: string; context: any; userId: string }>
  >();

  eventsSnapshot.forEach((doc) => {
    const event = doc.data();
    const context = event.context as any;

    // Determine creator ID from context
    let creatorId: string | null = null;

    if (context.creatorId) {
      creatorId = context.creatorId;
    } else if (context.organizerId) {
      creatorId = context.organizerId;
    } else if (context.participantIds && context.participantIds.length > 1) {
      // For calls/chats, creator is typically the second participant
      // This is a simplification; real implementation would need proper creator identification
      creatorId = context.participantIds[1];
    }

    if (creatorId) {
      if (!creatorEvents.has(creatorId)) {
        creatorEvents.set(creatorId, []);
      }
      creatorEvents.get(creatorId)!.push({
        eventType: event.eventType,
        context,
        userId: event.userId,
      });
    }
  });

  // Process each creator's metrics
  const batch = db.batch();

  for (const [creatorId, events] of Array.from(creatorEvents.entries())) {
    const metrics = computeCreatorMetrics(creatorId, date, events);
    const docId = `${creatorId}_${date}`;
    const docRef = db.collection('creatorDailyMetrics').doc(docId);

    batch.set(
      docRef,
      {
        ...metrics,
        computedAt: admin.firestore.FieldValue.serverTimestamp(),
        version: 1,
      },
      { merge: true }
    );
  }

  await batch.commit();
  console.log(`Aggregated metrics for ${creatorEvents.size} creators on ${date}`);
}

/**
 * Compute metrics for a single creator
 */
function computeCreatorMetrics(
  creatorId: string,
  date: string,
  events: Array<{ eventType: string; context: any; userId: string }>
): any {
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

  events.forEach(({ eventType, context, userId }) => {
    const tokens = context.tokensCharged || context.ticketPrice || 0;

    switch (eventType) {
      case KpiEventType.CHAT_PAID_STARTED:
      case KpiEventType.CHAT_PAID_ENDED:
        chatSessionsPaid++;
        // Creator gets 65%
        const chatEarnings = tokens * 0.65;
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
        // Creator gets 80%
        const calendarEarnings = tokens * 0.80;
        tokensEarnedCalendar += calendarEarnings;
        tokensEarned += calendarEarnings;
        if (userId) uniquePayingUsers.add(userId);
        break;

      case KpiEventType.EVENT_TICKET_PURCHASED:
        eventTicketsSold++;
        // Organizer gets 80%
        const eventEarnings = tokens * 0.80;
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
        payoutsRequested++;
        payoutsPending++;
        break;

      case KpiEventType.PAYOUT_COMPLETED:
        payoutsCompleted++;
        if (payoutsPending > 0) payoutsPending--;
        break;
    }
  });

  // TODO: Calculate returningPayersCount (would need historical data)
  const returningPayersCount = 0;

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
    hasActivePayouts: payoutsPending > 0,
    isFlagged: false, // TODO: Check fraud flags
    isTopPerformer: false, // Computed client-side
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

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
 * Get Firestore timestamps for a date range (start of day to end of day)
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
