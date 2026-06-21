import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 346 — Creator KPI Updater
 * Tracks and updates earner performance metrics
 */

import * as functions from "firebase-functions";
import { db, serverTimestamp, increment } from "./init";
import { Timestamp } from "firebase-admin/firestore";
import { CreatorKPI } from "./pack346-types";
import { HttpsError, admin, auth, onCall, onSchedule, onDocumentCreated, onDocumentUpdated } from './runtime';

/**
 * Update earner KPI on chat completion
 */
export const updateCreatorKPIOnChat = onDocumentUpdated("chats/{chatId}", async (event) => {
  const change = event.data;
  if (!change) return;
    const before = change.before.data();
    const after =change.after.data();

    // Only trigger on chat closure
    if (before.state !== "CLOSED" && after.state === "CLOSED") {
      const earnerId = after.roles?.earnerId;
      
      if (earnerId) {
        await incrementCreatorMetric(earnerId, {
          totalChats: 1,
          earningsUSD: (after.billing?.totalConsumed || 0) * 0.01, // Convert tokens to USD
        });
      }
    }

    return null;
  });

/**
 * Update earner KPI on call completion
 */
export const updateCreatorKPIOnCall = onDocumentUpdated("calls/{callId}", async (event) => {
  const change = event.data;
  if (!change) return;
    const before = change.before.data();
    const after = change.after.data();

    // Only trigger on call completion
    if (before.status !== "completed" && after.status === "completed") {
      const earnerId = after.earnerId;
      
      if (earnerId) {
        await incrementCreatorMetric(earnerId, {
          totalCalls: 1,
          earningsUSD: after.totalEarnings || 0,
        });
      }
    }

    return null;
  });

/**
 * Update earner KPI on calendar booking
 */
export const updateCreatorKPIOnBooking = onDocumentUpdated("calendarBookings/{bookingId}", async (event) => {
  const change = event.data;
  if (!change) return;
    const before = change.before.data();
    const after = change.after.data();

    const earnerId = after.earnerId;
    
    if (!earnerId) {
      return null;
    }

    // Track completion
    if (before.status !== "completed" && after.status === "completed") {
      await incrementCreatorMetric(earnerId, {
        totalCalendar: 1,
        earningsUSD: after.earnerEarnings || 0,
      });
    }

    // Track cancellation rate
    if (before.status !== "cancelled_by_earner" && after.status === "cancelled_by_earner") {
      await incrementCreatorMetric(earnerId, {
        totalCalendar: 1, // Count towards total
      });
      
      // Recalculate cancel rate
      await recalculateCreatorRates(earnerId);
    }

    return null;
  });

/**
 * Update earner KPI on refund
 */
export const updateCreatorKPIOnRefund = onDocumentCreated("refunds/{refundId}", async (event) => {
  const snap = event.data;
  if (!snap) return;
    const refund = snap.data();
    const earnerId = refund.earnerId;

    if (earnerId) {
      await recalculateCreatorRates(earnerId);
    }

    return null;
  });

/**
 * Update earner KPI on safety event
 */
export const updateCreatorKPIOnSafety = onDocumentCreated("safetyEvents/{eventId}", async (event) => {
  const snap = event.data;
  if (!snap) return;
    const eventData = snap.data();
    const earnerId = eventData.reportedUser;

    if (!earnerId) {
      return null;
    }

    // Track panic rate
    if (eventData.type === "panic_button") {
      await incrementCreatorMetric(earnerId, {
        reportCount: 1,
      });
      await recalculateCreatorRates(earnerId);
    }

    // Track mismatch rate
    if (eventData.type === "selfie_mismatch") {
      await incrementCreatorMetric(earnerId, {
        reportCount: 1,
      });
      await recalculateCreatorRates(earnerId);
    }

    return null;
  });

/**
 * Increment earner metrics
 */
async function incrementCreatorMetric(
  earnerId: string,
  increments: Partial<Record<keyof CreatorKPI, number>>
): Promise<void> {
  const kpiRef = db.collection("earners").doc(earnerId).collection("kpi").doc("current");

  const updates: any = {
    updatedAt: serverTimestamp(),
  };

  for (const [key, value] of Object.entries(increments)) {
    updates[key] = increment(value);
  }

  await kpiRef.set(updates, { merge: true });
}

/**
 * Recalculate earner rates (refund rate, cancel rate, etc.)
 */
async function recalculateCreatorRates(earnerId: string): Promise<void> {
  const kpiRef = db.collection("earners").doc(earnerId).collection("kpi").doc("current");
  const kpiSnap = await kpiRef.get();

  if (!kpiSnap.exists) {
    // Initialize if not exists
    await kpiRef.set({
      earnerId,
      totalChats: 0,
      totalCalls: 0,
      totalCalendar: 0,
      totalEvents: 0,
      earningsUSD: 0,
      tipsReceivedUSD: 0,
      tokensEarned: 0,
      refundRate: 0,
      cancelRate: 0,
      avgResponseTimeSec: 0,
      completionRate: 100,
      panicRate: 0,
      mismatchRate: 0,
      reportCount: 0,
      rating: 5,
      reviewCount: 0,
      responseRate: 100,
      royalEligible: false,
      verified: false,
      premiumUnlocked: false,
      lastActiveAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  const kpi = kpiSnap.data() as CreatorKPI;

  // Calculate refund rate
  const thirtyDaysAgo = Timestamp.fromDate(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  );

  const refundsSnap = await db
    .collection("refunds")
    .where("earnerId", "==", earnerId)
    .where("createdAt", ">=", thirtyDaysAgo)
    .where("status", "==", "completed")
    .count()
    .get();

  const refundCount = refundsSnap.data().count;
  const totalTransactions = kpi.totalChats + kpi.totalCalls + kpi.totalCalendar;
  const refundRate = totalTransactions > 0 ? (refundCount / totalTransactions) * 100 : 0;

  // Calculate cancel rate
  const bookingsSnap = await db
    .collection("calendarBookings")
    .where("earnerId", "==", earnerId)
    .where("createdAt", ">=", thirtyDaysAgo)
    .get();

  let totalBookings = 0;
  let cancelledBookings = 0;

  bookingsSnap.forEach((doc) => {
    totalBookings++;
    if (doc.data().status === "cancelled_by_earner") {
      cancelledBookings++;
    }
  });

  const cancelRate = totalBookings > 0 ? (cancelledBookings / totalBookings) * 100 : 0;

  // Calculate panic rate
  const panicSnap = await db
    .collection("safetyEvents")
    .where("type", "==", "panic_button")
    .where("reportedUser", "==", earnerId)
    .where("createdAt", ">=", thirtyDaysAgo)
    .count()
    .get();

  const panicCount = panicSnap.data().count;
  const panicRate = totalTransactions > 0 ? (panicCount / totalTransactions) * 100 : 0;

  // Calculate mismatch rate
  const mismatchSnap = await db
    .collection("safetyEvents")
    .where("type", "==", "selfie_mismatch")
    .where("reportedUser", "==", earnerId)
    .where("createdAt", ">=", thirtyDaysAgo)
    .count()
    .get();

  const mismatchCount = mismatchSnap.data().count;
  const mismatchRate = totalTransactions > 0 ? (mismatchCount / totalTransactions) * 100 : 0;

  // Determine Royal eligibility
  const royalEligible = 
    refundRate < 5 &&
    cancelRate < 10 &&
    panicRate < 2 &&
    mismatchRate < 5 &&
    kpi.rating >= 4.5 &&
    totalTransactions >= 50;

  // Update KPI
  await kpiRef.update({
    refundRate,
    cancelRate,
    panicRate,
    mismatchRate,
    royalEligible,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Scheduled daily earner KPI refresh
 */
export const refreshCreatorKPIs = onSchedule({ schedule: "0 2 * * *", timeZone: "UTC" }, async (event) => {
    // Get all earners
    const earnersSnap = await db
      .collection("users")
      .where("modes.earnFromChat", "==", true)
      .get();

    let processed = 0;

    for (const earnerDoc of earnersSnap.docs) {
      try {
        await recalculateCreatorRates(earnerDoc.id);
        processed++;
      } catch (error) {
        console.error(`Failed to refresh KPI for earner ${earnerDoc.id}:`, error);
      }
    }

    console.log(`Refreshed KPIs for ${processed} earners`);
    // Scheduler functions must return void
  });

/**
 * Get earner KPI (callable function)
 */
export const getCreatorKPI = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Authentication required"
      );
    }

    const { earnerId } = data;

    if (!earnerId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Creator ID is required"
      );
    }

    const kpiSnap = await db
      .collection("earners")
      .doc(earnerId)
      .collection("kpi")
      .doc("current")
      .get();

    if (!kpiSnap.exists) {
      return null;
    }

    return kpiSnap.data();
  }
);

























