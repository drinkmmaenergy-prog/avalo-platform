/**
 * PACK 346 — Creator KPI Updater
 * Tracks and updates creator performance metrics
 */

import * as functions from "firebase-functions";
import { db, serverTimestamp, increment } from "./init.js";
import { Timestamp } from "firebase-admin/firestore";
import { CreatorKPI } from "./pack346-types";

/**
 * Update creator KPI on chat completion
 */
export const updateCreatorKPIOnChat = functions.firestore
  .document("chats/{chatId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after =change.after.data();

    // Only trigger on chat closure
    if (before.state !== "CLOSED" && after.state === "CLOSED") {
      const earnerId = after.roles?.earnerId;
      
      if (earnerId) {
        await incrementCreatorMetric(earnerId, {
          totalChats: 1,
          earningsPLN: (after.billing?.totalConsumed || 0) * 0.01, // Convert tokens to PLN
        });
      }
    }

    return null;
  });

/**
 * Update creator KPI on call completion
 */
export const updateCreatorKPIOnCall = functions.firestore
  .document("calls/{callId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    // Only trigger on call completion
    if (before.status !== "completed" && after.status === "completed") {
      const creatorId = after.creatorId;
      
      if (creatorId) {
        await incrementCreatorMetric(creatorId, {
          totalCalls: 1,
          earningsPLN: after.totalEarnings || 0,
        });
      }
    }

    return null;
  });

/**
 * Update creator KPI on calendar booking
 */
export const updateCreatorKPIOnBooking = functions.firestore
  .document("calendarBookings/{bookingId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    const creatorId = after.creatorId;
    
    if (!creatorId) {
      return null;
    }

    // Track completion
    if (before.status !== "completed" && after.status === "completed") {
      await incrementCreatorMetric(creatorId, {
        totalCalendar: 1,
        earningsPLN: after.creatorEarnings || 0,
      });
    }

    // Track cancellation rate
    if (before.status !== "cancelled_by_creator" && after.status === "cancelled_by_creator") {
      await incrementCreatorMetric(creatorId, {
        totalCalendar: 1, // Count towards total
      });
      
      // Recalculate cancel rate
      await recalculateCreatorRates(creatorId);
    }

    return null;
  });

/**
 * Update creator KPI on refund
 */
export const updateCreatorKPIOnRefund = functions.firestore
  .document("refunds/{refundId}")
  .onCreate(async (snap, context) => {
    const refund = snap.data();
    const creatorId = refund.creatorId;

    if (creatorId) {
      await recalculateCreatorRates(creatorId);
    }

    return null;
  });

/**
 * Update creator KPI on safety event
 */
export const updateCreatorKPIOnSafety = functions.firestore
  .document("safetyEvents/{eventId}")
  .onCreate(async (snap, context) => {
    const event = snap.data();
    const creatorId = event.reportedUser;

    if (!creatorId) {
      return null;
    }

    // Track panic rate
    if (event.type === "panic_button") {
      await incrementCreatorMetric(creatorId, {
        reportCount: 1,
      });
      await recalculateCreatorRates(creatorId);
    }

    // Track mismatch rate
    if (event.type === "selfie_mismatch") {
      await incrementCreatorMetric(creatorId, {
        reportCount: 1,
      });
      await recalculateCreatorRates(creatorId);
    }

    return null;
  });

/**
 * Increment creator metrics
 */
async function incrementCreatorMetric(
  creatorId: string,
  increments: Partial<Record<keyof CreatorKPI, number>>
): Promise<void> {
  const kpiRef = db.collection("creators").doc(creatorId).collection("kpi").doc("current");

  const updates: any = {
    updatedAt: serverTimestamp(),
  };

  for (const [key, value] of Object.entries(increments)) {
    updates[key] = increment(value);
  }

  await kpiRef.set(updates, { merge: true });
}

/**
 * Recalculate creator rates (refund rate, cancel rate, etc.)
 */
async function recalculateCreatorRates(creatorId: string): Promise<void> {
  const kpiRef = db.collection("creators").doc(creatorId).collection("kpi").doc("current");
  const kpiSnap = await kpiRef.get();

  if (!kpiSnap.exists) {
    // Initialize if not exists
    await kpiRef.set({
      creatorId,
      totalChats: 0,
      totalCalls: 0,
      totalCalendar: 0,
      totalEvents: 0,
      earningsPLN: 0,
      tipsReceivedPLN: 0,
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
    .where("creatorId", "==", creatorId)
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
    .where("creatorId", "==", creatorId)
    .where("createdAt", ">=", thirtyDaysAgo)
    .get();

  let totalBookings = 0;
  let cancelledBookings = 0;

  bookingsSnap.forEach((doc) => {
    totalBookings++;
    if (doc.data().status === "cancelled_by_creator") {
      cancelledBookings++;
    }
  });

  const cancelRate = totalBookings > 0 ? (cancelledBookings / totalBookings) * 100 : 0;

  // Calculate panic rate
  const panicSnap = await db
    .collection("safetyEvents")
    .where("type", "==", "panic_button")
    .where("reportedUser", "==", creatorId)
    .where("createdAt", ">=", thirtyDaysAgo)
    .count()
    .get();

  const panicCount = panicSnap.data().count;
  const panicRate = totalTransactions > 0 ? (panicCount / totalTransactions) * 100 : 0;

  // Calculate mismatch rate
  const mismatchSnap = await db
    .collection("safetyEvents")
    .where("type", "==", "selfie_mismatch")
    .where("reportedUser", "==", creatorId)
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
 * Scheduled daily creator KPI refresh
 */
export const refreshCreatorKPIs = functions.pubsub
  .schedule("0 2 * * *") // 2 AM daily
  .timeZone("UTC")
  .onRun(async (context) => {
    // Get all creators
    const creatorsSnap = await db
      .collection("users")
      .where("modes.earnFromChat", "==", true)
      .get();

    let processed = 0;

    for (const creatorDoc of creatorsSnap.docs) {
      try {
        await recalculateCreatorRates(creatorDoc.id);
        processed++;
      } catch (error) {
        console.error(`Failed to refresh KPI for creator ${creatorDoc.id}:`, error);
      }
    }

    console.log(`Refreshed KPIs for ${processed} creators`);
    return { processed };
  });

/**
 * Get creator KPI (callable function)
 */
export const getCreatorKPI = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Authentication required"
      );
    }

    const { creatorId } = data;

    if (!creatorId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Creator ID is required"
      );
    }

    const kpiSnap = await db
      .collection("creators")
      .doc(creatorId)
      .collection("kpi")
      .doc("current")
      .get();

    if (!kpiSnap.exists) {
      return null;
    }

    return kpiSnap.data();
  }
);
