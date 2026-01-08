/**
 * PACK 346 — KPI Aggregation Engine
 * Aggregates daily KPIs from transaction data
 */

import * as functions from "firebase-functions";
import { db, serverTimestamp, increment, generateId } from "./init.js";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { DailyKPI, HourlyMetrics } from "./pack346-types";

/**
 * Scheduled daily aggregation at 00:05 UTC
 */
export const aggregateDailyKPIs = functions.pubsub
  .schedule("5 0 * * *")
  .timeZone("UTC")
  .onRun(async (context) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split("T")[0];

    console.log(`Aggregating KPIs for ${dateStr}`);

    try {
      const kpi = await calculateDailyKPIs(dateStr);
      
      await db
        .collection("system")
        .doc("kpiRealtime")
        .collection("days")
        .doc(dateStr)
        .set(kpi, { merge: true });

      console.log(`KPIs aggregated successfully for ${dateStr}`);
      return { success: true, date: dateStr };
    } catch (error) {
      console.error("Error aggregating KPIs:", error);
      throw error;
    }
  });

/**
 * Scheduled hourly aggregation
 */
export const aggregateHourlyKPIs = functions.pubsub
  .schedule("5 * * * *")
  .timeZone("UTC")
  .onRun(async (context) => {
    const now = new Date();
    const hour = now.toISOString().substring(0, 13); // YYYY-MM-DD-HH

    console.log(`Aggregating hourly KPIs for ${hour}`);

    try {
      const metrics = await calculateHourlyMetrics(hour);
      
      await db
        .collection("system")
        .doc("kpiRealtime")
        .collection("hourly")
        .doc(hour)
        .set(metrics);

      console.log(`Hourly KPIs aggregated for ${hour}`);
      return { success: true, hour };
    } catch (error) {
      console.error("Error aggregating hourly KPIs:", error);
      throw error;
    }
  });

/**
 * Calculate daily KPIs from various collections
 */
async function calculateDailyKPIs(dateStr: string): Promise<DailyKPI> {
  const startOfDay = Timestamp.fromDate(
    new Date(`${dateStr}T00:00:00Z`)
  );
  const endOfDay = Timestamp.fromDate(
    new Date(`${dateStr}T23:59:59Z`)
  );

  // Initialize KPI structure
  const kpi: DailyKPI = {
    date: dateStr,
    users: {
      newUsers: 0,
      verifiedUsers: 0,
      activeUsers: 0,
      payingUsers: 0,
      churnedUsers: 0,
    },
    revenue: {
      tokenSalesPLN: 0,
      chatRevenuePLN: 0,
      voiceRevenuePLN: 0,
      videoRevenuePLN: 0,
      calendarRevenuePLN: 0,
      eventsRevenuePLN: 0,
      tipsRevenuePLN: 0,
      totalRevenuePLN: 0,
    },
    platformEarnings: {
      chat35: 0,
      calendar20: 0,
      events20: 0,
      tips10: 0,
      totalAvaloPLN: 0,
    },
    refunds: {
      chatWordRefunds: 0,
      calendarUserCancelRefunds: 0,
      calendarCreatorCancelRefunds: 0,
      mismatchRefunds: 0,
    },
    safety: {
      panicTriggers: 0,
      selfieMismatchReports: 0,
      moderationFlags: 0,
      bannedUsers: 0,
    },
    ai: {
      aiChats: 0,
      aiCalls: 0,
      aiRevenuePLN: 0,
      aiAbuseFlags: 0,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // 1. User Metrics
  const newUsersSnap = await db
    .collection("users")
    .where("createdAt", ">=", startOfDay)
    .where("createdAt", "<=", endOfDay)
    .count()
    .get();
  kpi.users.newUsers = newUsersSnap.data().count;

  const verifiedUsersSnap = await db
    .collection("users")
    .where("verifiedAt", ">=", startOfDay)
    .where("verifiedAt", "<=", endOfDay)
    .count()
    .get();
  kpi.users.verifiedUsers = verifiedUsersSnap.data().count;

  // Active users (had any activity)
  const activeUsersSnap = await db
    .collection("userActivity")
    .where("date", "==", dateStr)
    .count()
    .get();
  kpi.users.activeUsers = activeUsersSnap.data().count;

  // 2. Revenue Metrics
  const transactionsSnap = await db
    .collection("transactions")
    .where("createdAt", ">=", startOfDay)
    .where("createdAt", "<=", endOfDay)
    .where("status", "==", "completed")
    .get();

  const payingUserIds = new Set<string>();

  transactionsSnap.forEach((doc) => {
    const tx = doc.data();
    const amountPLN = tx.amountPLN || 0;
    
    payingUserIds.add(tx.userId);

    switch (tx.type) {
      case "token_purchase":
        kpi.revenue.tokenSalesPLN += amountPLN;
        break;
      case "chat":
        kpi.revenue.chatRevenuePLN += amountPLN;
        kpi.platformEarnings.chat35 += amountPLN * 0.35;
        break;
      case "voice_call":
        kpi.revenue.voiceRevenuePLN += amountPLN;
        break;
      case "video_call":
        kpi.revenue.videoRevenuePLN += amountPLN;
        break;
      case "calendar_booking":
        kpi.revenue.calendarRevenuePLN += amountPLN;
        kpi.platformEarnings.calendar20 += amountPLN * 0.20;
        break;
      case "event_ticket":
        kpi.revenue.eventsRevenuePLN += amountPLN;
        kpi.platformEarnings.events20 += amountPLN * 0.20;
        break;
      case "tip":
        kpi.revenue.tipsRevenuePLN += amountPLN;
        kpi.platformEarnings.tips10 += amountPLN * 0.10;
        break;
    }
  });

  kpi.users.payingUsers = payingUserIds.size;

  kpi.revenue.totalRevenuePLN =
    kpi.revenue.tokenSalesPLN +
    kpi.revenue.chatRevenuePLN +
    kpi.revenue.voiceRevenuePLN +
    kpi.revenue.videoRevenuePLN +
    kpi.revenue.calendarRevenuePLN +
    kpi.revenue.eventsRevenuePLN +
    kpi.revenue.tipsRevenuePLN;

  kpi.platformEarnings.totalAvaloPLN =
    kpi.platformEarnings.chat35 +
    kpi.platformEarnings.calendar20 +
    kpi.platformEarnings.events20 +
    kpi.platformEarnings.tips10;

  // 3. Refund Metrics
  const refundsSnap = await db
    .collection("refunds")
    .where("createdAt", ">=", startOfDay)
    .where("createdAt", "<=", endOfDay)
    .where("status", "==", "completed")
    .get();

  refundsSnap.forEach((doc) => {
    const refund = doc.data();
    switch (refund.reason) {
      case "chat_word_exceeded":
        kpi.refunds.chatWordRefunds++;
        break;
      case "calendar_user_cancel":
        kpi.refunds.calendarUserCancelRefunds++;
        break;
      case "calendar_creator_cancel":
        kpi.refunds.calendarCreatorCancelRefunds++;
        break;
      case "selfie_mismatch":
        kpi.refunds.mismatchRefunds++;
        break;
    }
  });

  // 4. Safety Metrics
  const panicSnap = await db
    .collection("safetyEvents")
    .where("type", "==", "panic_button")
    .where("createdAt", ">=", startOfDay)
    .where("createdAt", "<=", endOfDay)
    .count()
    .get();
  kpi.safety.panicTriggers = panicSnap.data().count;

  const mismatchSnap = await db
    .collection("safetyEvents")
    .where("type", "==", "selfie_mismatch")
    .where("createdAt", ">=", startOfDay)
    .where("createdAt", "<=", endOfDay)
    .count()
    .get();
  kpi.safety.selfieMismatchReports = mismatchSnap.data().count;

  const moderationSnap = await db
    .collection("moderationCases")
    .where("createdAt", ">=", startOfDay)
    .where("createdAt", "<=", endOfDay)
    .count()
    .get();
  kpi.safety.moderationFlags = moderationSnap.data().count;

  const bannedSnap = await db
    .collection("users")
    .where("bannedAt", ">=", startOfDay)
    .where("bannedAt", "<=", endOfDay)
    .count()
    .get();
  kpi.safety.bannedUsers = bannedSnap.data().count;

  // 5. AI Metrics
  const aiChatsSnap = await db
    .collection("aiInteractions")
    .where("type", "==", "chat")
    .where("createdAt", ">=", startOfDay)
    .where("createdAt", "<=", endOfDay)
    .count()
    .get();
  kpi.ai.aiChats = aiChatsSnap.data().count;

  const aiCallsSnap = await db
    .collection("aiInteractions")
    .where("type", "==", "call")
    .where("createdAt", ">=", startOfDay)
    .where("createdAt", "<=", endOfDay)
    .count()
    .get();
  kpi.ai.aiCalls = aiCallsSnap.data().count;

  // AI revenue (sum of AI-related transactions)
  const aiRevenueSnap = await db
    .collection("transactions")
    .where("isAI", "==", true)
    .where("createdAt", ">=", startOfDay)
    .where("createdAt", "<=", endOfDay)
    .where("status", "==", "completed")
    .get();

  aiRevenueSnap.forEach((doc) => {
    const tx = doc.data();
    kpi.ai.aiRevenuePLN += tx.amountPLN || 0;
  });

  const aiAbuseSnap = await db
    .collection("system")
    .doc("abuseSignals")
    .collection("signals")
    .where("type", "==", "ai_exploit")
    .where("detectedAt", ">=", startOfDay)
    .where("detectedAt", "<=", endOfDay)
    .count()
    .get();
  kpi.ai.aiAbuseFlags = aiAbuseSnap.data().count;

  // 6. Churn (users who churned today)
  const churnedSnap = await db
    .collection("system")
    .doc("churn")
    .collection("records")
    .where("churnedAt", ">=", startOfDay)
    .where("churnedAt", "<=", endOfDay)
    .count()
    .get();
  kpi.users.churnedUsers = churnedSnap.data().count;

  return kpi;
}

/**
 * Calculate hourly metrics
 */
async function calculateHourlyMetrics(hour: string): Promise<HourlyMetrics> {
  const startHour = Timestamp.fromDate(
    new Date(`${hour}:00:00Z`)
  );
  const endHour = Timestamp.fromDate(
    new Date(`${hour}:59:59Z`)
  );

  const metrics: HourlyMetrics = {
    timestamp: startHour,
    hour,
    activeUsers: 0,
    newChats: 0,
    newCalls: 0,
    newCalendarBookings: 0,
    revenuePLN: 0,
    refundsPLN: 0,
    panicTriggers: 0,
    moderationFlags: 0,
    aiInteractions: 0,
  };

  // Active users by session
  const sessionsSnap = await db
    .collection("sessions")
    .where("startedAt", ">=", startHour)
    .where("startedAt", "<=", endHour)
    .get();
  
  const activeUserIds = new Set<string>();
  sessionsSnap.forEach((doc) => {
    activeUserIds.add(doc.data().userId);
  });
  metrics.activeUsers = activeUserIds.size;

  // New chats
  const chatsSnap = await db
    .collection("chats")
    .where("createdAt", ">=", startHour)
    .where("createdAt", "<=", endHour)
    .count()
    .get();
  metrics.newChats = chatsSnap.data().count;

  // New calls
  const callsSnap = await db
    .collection("calls")
    .where("createdAt", ">=", startHour)
    .where("createdAt", "<=", endHour)
    .count()
    .get();
  metrics.newCalls = callsSnap.data().count;

  // Calendar bookings
  const bookingsSnap = await db
    .collection("calendarBookings")
    .where("createdAt", ">=", startHour)
    .where("createdAt", "<=", endHour)
    .count()
    .get();
  metrics.newCalendarBookings = bookingsSnap.data().count;

  // Revenue
  const revenueSnap = await db
    .collection("transactions")
    .where("createdAt", ">=", startHour)
    .where("createdAt", "<=", endHour)
    .where("status", "==", "completed")
    .get();
  
  revenueSnap.forEach((doc) => {
    metrics.revenuePLN += doc.data().amountPLN || 0;
  });

  // Refunds
  const refundSnap = await db
    .collection("refunds")
    .where("createdAt", ">=", startHour)
    .where("createdAt", "<=", endHour)
    .where("status", "==", "completed")
    .get();
  
  refundSnap.forEach((doc) => {
    metrics.refundsPLN += doc.data().amountPLN || 0;
  });

  // Safety
  const panicSnap = await db
    .collection("safetyEvents")
    .where("type", "==", "panic_button")
    .where("createdAt", ">=", startHour)
    .where("createdAt", "<=", endHour)
    .count()
    .get();
  metrics.panicTriggers = panicSnap.data().count;

  const moderationSnap = await db
    .collection("moderationCases")
    .where("createdAt", ">=", startHour)
    .where("createdAt", "<=", endHour)
    .count()
    .get();
  metrics.moderationFlags = moderationSnap.data().count;

  // AI interactions
  const aiSnap = await db
    .collection("aiInteractions")
    .where("createdAt", ">=", startHour)
    .where("createdAt", "<=", endHour)
    .count()
    .get();
  metrics.aiInteractions = aiSnap.data().count;

  return metrics;
}

/**
 * Manual trigger for KPI calculation (for testing or backfill)
 */
export const triggerKPIAggregation = functions.https.onCall(
  async (data, context) => {
    // Require admin auth
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin access required"
      );
    }

    const { date } = data;
    if (!date) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Date is required (YYYY-MM-DD format)"
      );
    }

    try {
      const kpi = await calculateDailyKPIs(date);
      
      await db
        .collection("system")
        .doc("kpiRealtime")
        .collection("days")
        .doc(date)
        .set(kpi, { merge: true });

      return { success: true, date, kpi };
    } catch (error) {
      console.error("Error in manual KPI aggregation:", error);
      throw new functions.https.HttpsError(
        "internal",
        `Failed to aggregate KPIs: ${error}`
      );
    }
  }
);
