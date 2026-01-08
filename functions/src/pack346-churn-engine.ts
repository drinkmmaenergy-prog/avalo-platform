/**
 * PACK 346 — Churn Intelligence Engine
 * Tracks user activity and predicts churn
 */

import * as functions from "firebase-functions";
import { db, serverTimestamp } from "./init.js";
import { Timestamp } from "firebase-admin/firestore";
import { ChurnRecord, ChurnCause } from "./pack346-types";

/**
 * Track user activity and update churn score
 */
export const trackUserActivity = functions.firestore
  .document("sessions/{sessionId}")
  .onCreate(async (snap, context) => {
    const session = snap.data();
    const userId = session.userId;

    await updateChurnRecord(userId, {
      lastActivity: serverTimestamp() as any,
      totalSessions: 1, // Will be incremented
    });

    return null;
  });

/**
 * Track refunds (increases churn risk)
 */
export const trackRefundForChurn = functions.firestore
  .document("refunds/{refundId}")
  .onCreate(async (snap, context) => {
    const refund = snap.data();
    const userId = refund.userId;

    await updateChurnRecord(userId, {
      lastRefund: serverTimestamp() as any,
      totalRefunds: 1, // Will be incremented
    });

    return null;
  });

/**
 * Track panic events (increases churn risk)
 */
export const trackPanicForChurn = functions.firestore
  .document("safetyEvents/{eventId}")
  .onCreate(async (snap, context) => {
    const event = snap.data();
    
    if (event.type !== "panic_button") {
      return null;
    }

    const userId = event.userId;

    await updateChurnRecord(userId, {
      lastPanic: serverTimestamp() as any,
    });

    return null;
  });

/**
 * Track calendar cancellations
 */
export const trackCancelForChurn = functions.firestore
  .document("calendarBookings/{bookingId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    // User cancelled
    if (before.status !== "cancelled_by_user" && after.status === "cancelled_by_user") {
      await updateChurnRecord(after.userId, {
        lastCalendarCancel: serverTimestamp() as any,
      });
    }

    return null;
  });

/**
 * Update churn record for a user
 */
async function updateChurnRecord(
  userId: string,
  updates: Partial<ChurnRecord>
): Promise<void> {
  const churnRef = db
    .collection("system")
    .doc("churn")
    .collection("records")
    .doc(userId);

  const churnSnap = await churnRef.get();

  if (!churnSnap.exists) {
    // Initialize churn record
    const newRecord: ChurnRecord = {
      userId,
      lastActivity: Timestamp.now(),
      churnScore: 0,
      daysInactive: 0,
      totalSessions: 0,
      avgSessionDuration: 0,
      totalSpent: 0,
      totalRefunds: 0,
      engagementScore: 100,
      retentionAttemptsCount: 0,
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
      ...updates,
    };

    await churnRef.set(newRecord);
    return;
  }

  // Update existing record
  const updateData: any = {
    ...updates,
    updatedAt: serverTimestamp(),
  };

  await churnRef.update(updateData);

  // Recalculate churn score
  await recalculateChurnScore(userId);
}

/**
 * Calculate churn score based on user activity
 */
async function recalculateChurnScore(userId: string): Promise<void> {
  const churnRef = db
    .collection("system")
    .doc("churn")
    .collection("records")
    .doc(userId);

  const churnSnap = await churnRef.get();

  if (!churnSnap.exists) {
    return;
  }

  const record = churnSnap.data() as ChurnRecord;

  // Calculate days since last activity
  const lastActivityDate = record.lastActivity?.toDate?.() || new Date();
  const daysInactive = Math.floor(
    (Date.now() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Calculate churn score (0-100)
  let churnScore = 0;

  // Inactivity (0-40 points)
  if (daysInactive >= 30) {
    churnScore += 40;
  } else if (daysInactive >= 14) {
    churnScore += 30;
  } else if (daysInactive >= 7) {
    churnScore += 20;
  } else if (daysInactive >= 3) {
    churnScore += 10;
  }

  // Low session count (0-20 points)
  if (record.totalSessions < 5) {
    churnScore += 20;
  } else if (record.totalSessions < 10) {
    churnScore += 10;
  }

  // Refunds (0-20 points)
  if (record.totalRefunds >= 5) {
    churnScore += 20;
  } else if (record.totalRefunds >= 3) {
    churnScore += 10;
  } else if (record.totalRefunds >= 1) {
    churnScore += 5;
  }

  // Panic events (0-10 points)
  if (record.lastPanic) {
    const daysSincePanic = Math.floor(
      (Date.now() - record.lastPanic.toDate().getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSincePanic < 7) {
      churnScore += 10;
    }
  }

  // Low spending (0-10 points)
  if (record.totalSpent < 10) {
    churnScore += 10;
  } else if (record.totalSpent < 50) {
    churnScore += 5;
  }

  // Engagement score
  const engagementScore = Math.max(0, 100 - churnScore);

  // Determine if churned (30+ days inactive = churned)
  let churnCause: ChurnCause | undefined;
  let churnedAt: Timestamp | undefined;

  if (daysInactive >= 30 && !record.churnedAt) {
    churnedAt = Timestamp.now();
    churnCause = inferChurnCause(record);
  }

  // Update record
  await churnRef.update({
    daysInactive,
    churnScore,
    engagementScore,
    ...(churnCause && { churnCause }),
    ...(churnedAt && { churnedAt }),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Infer churn cause based on user behavior
 */
function inferChurnCause(record: ChurnRecord): ChurnCause {
  // Multiple refunds = refund frustration
  if (record.totalRefunds >= 3) {
    return "refund_frustration";
  }

  // Panic event = safety distrust
  if (record.lastPanic) {
    const daysSincePanic = Math.floor(
      (Date.now() - record.lastPanic.toDate().getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSincePanic < 7) {
      return "safety_distrust";
    }
  }

  // No spending = price sensitivity
  if (record.totalSpent === 0) {
    return "price_sensitivity";
  }

  // Very low sessions = no engagement
  if (record.totalSessions < 5) {
    return "no_engagement";
  }

  return "unknown";
}

/**
 * Scheduled churn score recalculation
 */
export const recalculateChurnScores = functions.pubsub
  .schedule("every 6 hours")
  .onRun(async (context) => {
    // Get all active users
    const sevenDaysAgo = Timestamp.fromDate(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );

    const churnRecords = await db
      .collection("system")
      .doc("churn")
      .collection("records")
      .where("lastActivity", ">=", sevenDaysAgo)
      .limit(1000) // Process in batches
      .get();

    let processed = 0;

    for (const doc of churnRecords.docs) {
      try {
        await recalculateChurnScore(doc.id);
        processed++;
      } catch (error) {
        console.error(`Failed to recalculate churn for ${doc.id}:`, error);
      }
    }

    console.log(`Recalculated churn scores for ${processed} users`);
    return { processed };
  });

/**
 * Identify at-risk users and trigger retention campaigns
 */
export const identifyAtRiskUsers = functions.pubsub
  .schedule("0 10 * * *") // 10 AM daily
  .timeZone("UTC")
  .onRun(async (context) => {
    // Get users with high churn score who haven't been contacted recently
    const threeDaysAgo = Timestamp.fromDate(
      new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    );

    const atRiskUsers = await db
      .collection("system")
      .doc("churn")
      .collection("records")
      .where("churnScore", ">=", 50)
      .where("churnedAt", "==", null)
      .get();

    let triggered = 0;

    for (const doc of atRiskUsers.docs) {
      const record = doc.data() as ChurnRecord;

      // Skip if recently contacted
      if (
        record.lastRetentionAttempt &&
        record.lastRetentionAttempt.toDate() > threeDaysAgo.toDate()
      ) {
        continue;
      }

      try {
        // Trigger retention notification
        await db.collection("notifications").add({
          userId: record.userId,
          type: "retention_campaign",
          title: "We miss you!",
          message: "Come back and check what's new. Here's a special offer just for you!",
          metadata: {
            churnScore: record.churnScore,
            churnCause: record.churnCause || "unknown",
          },
          createdAt: serverTimestamp(),
          read: false,
        });

        // Update retention attempt
        await db
          .collection("system")
          .doc("churn")
          .collection("records")
          .doc(record.userId)
          .update({
            lastRetentionAttempt: serverTimestamp(),
            retentionAttemptsCount: (record.retentionAttemptsCount || 0) + 1,
          });

        triggered++;
      } catch (error) {
        console.error(`Failed to trigger retention for ${record.userId}:`, error);
      }
    }

    console.log(`Triggered retention campaigns for ${triggered} users`);
    return { triggered };
  });

/**
 * Get churn analytics (callable function)
 */
export const getChurnAnalytics = functions.https.onCall(
  async (data, context) => {
    // Require admin auth
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin access required"
      );
    }

    const { startDate, endDate } = data;

    const start = startDate
      ? Timestamp.fromDate(new Date(startDate))
      : Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

    const end = endDate
      ? Timestamp.fromDate(new Date(endDate))
      : Timestamp.now();

    // Get churned users in date range
    const churnedUsers = await db
      .collection("system")
      .doc("churn")
      .collection("records")
      .where("churnedAt", ">=", start)
      .where("churnedAt", "<=", end)
      .get();

    const causeDistribution: Record<string, number> = {};
    let totalChurned = 0;
    let totalDaysToChurn = 0;

    churnedUsers.forEach((doc) => {
      const record = doc.data() as ChurnRecord;
      totalChurned++;

      const cause = record.churnCause || "unknown";
      causeDistribution[cause] = (causeDistribution[cause] || 0) + 1;

      // Calculate days from creation to churn
      if (record.createdAt && record.churnedAt &&
          'toMillis' in record.createdAt && 'toMillis' in record.churnedAt) {
        const days = Math.floor(
          (record.churnedAt.toMillis() - record.createdAt.toMillis()) /
            (1000 * 60 * 60 * 24)
        );
        totalDaysToChurn += days;
      }
    });

    const avgDaysToChurn = totalChurned > 0 ? totalDaysToChurn / totalChurned : 0;

    return {
      totalChurned,
      causeDistribution,
      avgDaysToChurn: Math.round(avgDaysToChurn),
      dateRange: {
        start: start.toDate().toISOString(),
        end: end.toDate().toISOString(),
      },
    };
  }
);
