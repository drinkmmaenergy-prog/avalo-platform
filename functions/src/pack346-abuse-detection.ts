/**
 * PACK 346 — Abuse & Fraud Detection Engine
 * Real-time detection of abuse patterns and fraud signals
 */

import * as functions from "firebase-functions";
import { db, serverTimestamp, increment } from "./init.js";
import { Timestamp } from "firebase-admin/firestore";
import { 
  AbuseSignal, 
  AbuseSignalType,
  AbuseSignalSeverity,
  AbuseAutoAction 
} from "./pack346-types";
import { triggerAlert } from "./pack346-alert-routing";

/**
 * Detect refund loop abuse
 * Triggers on transactions and refunds
 */
export const detectRefundLoop = functions.firestore
  .document("refunds/{refundId}")
  .onCreate(async (snap, context) => {
    const refund = snap.data();
    const userId = refund.userId;

    // Count refunds in last 24 hours
    const yesterday = Timestamp.fromDate(
      new Date(Date.now() - 24 * 60 * 60 * 1000)
    );

    const recentRefunds = await db
      .collection("refunds")
      .where("userId", "==", userId)
      .where("createdAt", ">=", yesterday)
      .where("status", "==", "completed")
      .count()
      .get();

    const refundCount = recentRefunds.data().count;

    // Threshold: 5+ refunds in 24h = suspicious
    if (refundCount >= 5) {
      await createAbuseSignal({
        userId,
        type: "refund_loop",
        severity: refundCount >= 10 ? "critical" : "high",
        metadata: {
          count: refundCount,
          timeframeHours: 24,
        },
      });
    }
  });

/**
 * Detect panic button spam/false positives
 */
export const detectPanicSpam = functions.firestore
  .document("safetyEvents/{eventId}")
  .onCreate(async (snap, context) => {
    const event = snap.data();
    
    if (event.type !== "panic_button") {
      return null;
    }

    const userId = event.userId;

    // Count panic triggers in last 7 days
    const sevenDaysAgo = Timestamp.fromDate(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );

    const recentPanics = await db
      .collection("safetyEvents")
      .where("type", "==", "panic_button")
      .where("userId", "==", userId)
      .where("createdAt", ">=", sevenDaysAgo)
      .count()
      .get();

    const panicCount = recentPanics.data().count;

    // Threshold: 3+ panics in 7 days = suspicious
    if (panicCount >= 3) {
      await createAbuseSignal({
        userId,
        type: "panic_spam",
        severity: panicCount >= 5 ? "high" : "medium",
        metadata: {
          count: panicCount,
          timeframeHours: 7 * 24,
        },
      });
    }
  });

/**
 * Detect fake selfie mismatch claims
 */
export const detectFakeMismatch = functions.firestore
  .document("safetyEvents/{eventId}")
  .onCreate(async (snap, context) => {
    const event = snap.data();
    
    if (event.type !== "selfie_mismatch") {
      return null;
    }

    const userId = event.reportedBy;
    const creatorId = event.reportedUser;

    // Count mismatch reports by this user in last 30 days
    const thirtyDaysAgo = Timestamp.fromDate(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );

    const recentReports = await db
      .collection("safetyEvents")
      .where("type", "==", "selfie_mismatch")
      .where("reportedBy", "==", userId)
      .where("createdAt", ">=", thirtyDaysAgo)
      .count()
      .get();

    const reportCount = recentReports.data().count;

    // Threshold: 5+ mismatch reports in 30 days = suspicious
    if (reportCount >= 5) {
      await createAbuseSignal({
        userId,
        type: "fake_mismatch",
        severity: reportCount >= 10 ? "high" : "medium",
        metadata: {
          count: reportCount,
          timeframeHours: 30 * 24,
        },
      });
    }
  });

/**
 * Detect bot-like swipe/chat behavior
 * Scheduled function that analyzes patterns
 */
export const detectBotBehavior = functions.pubsub
  .schedule("every 1 hours")
  .onRun(async (context) => {
    const oneHourAgo = Timestamp.fromDate(
      new Date(Date.now() - 60 * 60 * 1000)
    );

    // Find users with abnormally high activity
    const sessions = await db
      .collection("sessions")
      .where("startedAt", ">=", oneHourAgo)
      .get();

    const userActivityCount = new Map<string, number>();

    sessions.forEach((doc) => {
      const session = doc.data();
      const count = userActivityCount.get(session.userId) || 0;
      userActivityCount.set(session.userId, count + 1);
    });

    // Threshold: 50+ sessions in 1 hour = bot-like
    for (const userId of Array.from(userActivityCount.keys())) {
      const count = userActivityCount.get(userId)!;
      if (count >= 50) {
        await createAbuseSignal({
          userId,
          type: "bot_swipe",
          severity: count >= 100 ? "critical" : "high",
          metadata: {
            count,
            timeframeHours: 1,
            pattern: "excessive_session_creation",
          },
        });
      }
    }

    return { processed: userActivityCount.size };
  });

/**
 * Detect AI prompt abuse
 */
export const detectAIAbuse = functions.firestore
  .document("aiInteractions/{interactionId}")
  .onCreate(async (snap, context) => {
    const interaction = snap.data();
    const userId = interaction.userId;

    // Check for known abuse patterns in prompt
    const prompt = interaction.prompt || "";
    const abuseKeywords = [
      "jailbreak",
      "ignore instructions",
      "bypass",
      "hack",
      "exploit",
      "illegal",
    ];

    const hasAbuseKeywords = abuseKeywords.some((keyword) =>
      prompt.toLowerCase().includes(keyword)
    );

    if (hasAbuseKeywords) {
      await createAbuseSignal({
        userId,
        type: "ai_exploit",
        severity: "high",
        metadata: {
          pattern: "abuse_keywords_detected",
        },
      });
    }

    // Count AI interactions in last hour
    const oneHourAgo = Timestamp.fromDate(
      new Date(Date.now() - 60 * 60 * 1000)
    );

    const recentAI = await db
      .collection("aiInteractions")
      .where("userId", "==", userId)
      .where("createdAt", ">=", oneHourAgo)
      .count()
      .get();

    const aiCount = recentAI.data().count;

    // Threshold: 100+ AI interactions in 1 hour = abuse  
    if (aiCount >= 100) {
      await createAbuseSignal({
        userId,
        type: "ai_exploit",
        severity: aiCount >= 200 ? "critical" : "high",
        metadata: {
          count: aiCount,
          timeframeHours: 1,
          pattern: "excessive_ai_usage",
        },
      });
    }
  });

/**
 * Detect creator cancellation farming
 */
export const detectCancellationFarming = functions.pubsub
  .schedule("every 6 hours")
  .onRun(async (context) => {
    const sevenDaysAgo = Timestamp.fromDate(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );

    // Find creators with high cancellation rates
    const bookings = await db
      .collection("calendarBookings")
      .where("createdAt", ">=", sevenDaysAgo)
      .where("status", "in", ["cancelled_by_creator", "completed"])
      .get();

    const creatorStats = new Map<string, { total: number; cancelled: number }>();

    bookings.forEach((doc) => {
      const booking = doc.data();
      const creatorId = booking.creatorId;
      
      const stats = creatorStats.get(creatorId) || { total: 0, cancelled: 0 };
      stats.total++;
      
      if (booking.status === "cancelled_by_creator") {
        stats.cancelled++;
      }
      
      creatorStats.set(creatorId, stats);
    });

    // Threshold: >40% cancellation rate with 10+ bookings = farming
    for (const creatorId of Array.from(creatorStats.keys())) {
      const stats = creatorStats.get(creatorId)!;
      if (stats.total >= 10) {
        const cancelRate = stats.cancelled / stats.total;
        
        if (cancelRate > 0.4) {
          await createAbuseSignal({
            creatorId,
            type: "cancel_farming",
            severity: cancelRate > 0.6 ? "critical" : "high",
            metadata: {
              count: stats.cancelled,
              timeframeHours: 7 * 24,
              pattern: `${Math.round(cancelRate * 100)}% cancellation rate`,
            },
          });
        }
      }
    }

    return { processed: creatorStats.size };
  });

/**
 * Detect token drain patterns
 */
export const detectTokenDrain = functions.firestore
  .document("transactions/{transactionId}")
  .onCreate(async (snap, context) => {
    const transaction = snap.data();
    
    if (transaction.amount >= 0) {
      return null; // Only check negative transactions (spending)
    }

    const userId = transaction.userId;

    // Count tokens spent in last hour
    const oneHourAgo = Timestamp.fromDate(
      new Date(Date.now() - 60 * 60 * 1000)
    );

    const recentSpending = await db
      .collection("transactions")
      .where("userId", "==", userId)
      .where("createdAt", ">=", oneHourAgo)
      .where("amount", "<", 0)
      .get();

    let totalSpent = 0;
    recentSpending.forEach((doc) => {
      totalSpent += Math.abs(doc.data().amount || 0);
    });

    // Threshold: 500+ tokens spent in 1 hour = suspicious
    if (totalSpent >= 500) {
      await createAbuseSignal({
        userId,
        type: "token_drain",
        severity: totalSpent >= 1000 ? "critical" : "high",
        metadata: {
          estimatedLoss: totalSpent,
          timeframeHours: 1,
          pattern: "rapid_token_drainage",
        },
      });
    }
  });

/**
 * Create an abuse signal and trigger appropriate actions
 */
async function createAbuseSignal(
  signal: Partial<AbuseSignal>
): Promise<string> {
  const signalId = db.collection("system").doc("abuseSignals").collection("signals").doc().id;

  const fullSignal: AbuseSignal = {
    id: signalId,
    userId: signal.userId,
    creatorId: signal.creatorId,
    type: signal.type!,
    severity: signal.severity!,
    detectedAt: serverTimestamp() as any,
    resolved: false,
    metadata: signal.metadata || {},
  };

  // Determine auto action based on severity
  fullSignal.autoAction = determineAutoAction(fullSignal.type, fullSignal.severity);

  await db
    .collection("system")
    .doc("abuseSignals")
    .collection("signals")
    .doc(signalId)
    .set(fullSignal);

  // Apply auto action if needed
  if (fullSignal.autoAction) {
    await applyAutoAction(fullSignal);
  }

  // Trigger alert for high/critical severity
  if (fullSignal.severity === "high" || fullSignal.severity === "critical") {
    await triggerAlert({
      type: "payout_abuse",
      severity: fullSignal.severity === "critical" ? "emergency" : "critical",
      title: `Abuse Detected: ${fullSignal.type}`,
      message: `${fullSignal.severity.toUpperCase()} severity abuse signal for ${
        fullSignal.userId || fullSignal.creatorId
      }`,
      channels: ["admin_dashboard", "slack"],
      metadata: {
        signalId,
        signalType: fullSignal.type,
        userId: fullSignal.userId,
        creatorId: fullSignal.creatorId,
      },
    });
  }

  console.log(`Abuse signal created: ${signalId} - ${fullSignal.type}`);

  return signalId;
}

/**
 * Determine auto action based on signal type and severity
 */
function determineAutoAction(
  type: AbuseSignalType,
  severity: AbuseSignalSeverity
): AbuseAutoAction | undefined {
  if (severity === "critical") {
    return type === "token_drain" || type === "refund_loop"
      ? "freeze_wallet"
      : "manual_review";
  }

  if (severity === "high") {
    return type === "bot_swipe" ? "shadow_ban" : "rate_limit";
  }

  if (severity === "medium") {
    return "warning";
  }

  return undefined;
}

/**
 * Apply automatic action for abuse signal
 */
async function applyAutoAction(signal: AbuseSignal): Promise<void> {
  const targetId = signal.userId || signal.creatorId;
  
  if (!targetId || !signal.autoAction) {
    return;
  }

  const userRef = db.collection("users").doc(targetId);

  switch (signal.autoAction) {
    case "freeze_wallet":
      await userRef.update({
        "wallet.frozen": true,
        "wallet.frozenAt": serverTimestamp(),
        "wallet.frozenReason": `abuse_${signal.type}`,
      });
      console.log(`Wallet frozen for user ${targetId}`);
      break;

    case "shadow_ban":
      await userRef.update({
        shadowBanned: true,
        shadowBannedAt: serverTimestamp(),
        shadowBanReason: `abuse_${signal.type}`,
      });
      console.log(`Shadow ban applied to user ${targetId}`);
      break;

    case "rate_limit":
      await userRef.update({
        rateLimited: true,
        rateLimitedAt: serverTimestamp(),
        rateLimitReason: `abuse_${signal.type}`,
      });
      console.log(`Rate limit applied to user ${targetId}`);
      break;

    case "warning":
      // Create warning notification
      await db.collection("notifications").add({
        userId: targetId,
        type: "abuse_warning",
        title: "Activity Warning",
        message: "Suspicious activity detected on your account. Please review our guidelines.",
        severity: "warning",
        metadata: { signalId: signal.id, signalType: signal.type },
        createdAt: serverTimestamp(),
        read: false,
      });
      console.log(`Warning sent to user ${targetId}`);
      break;

    case "manual_review":
      // Flag for admin review
      await userRef.update({
        requiresManualReview: true,
        manualReviewReason: `abuse_${signal.type}`,
        manualReviewRequestedAt: serverTimestamp(),
      });
      console.log(`Manual review flagged for user ${targetId}`);
      break;
  }
}

/**
 * Resolve an abuse signal (admin action)
 */
export const resolveAbuseSignal = functions.https.onCall(
  async (data, context) => {
    // Require admin auth
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin access required"
      );
    }

    const { signalId, notes } = data;

    if (!signalId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Signal ID is required"
      );
    }

    await db
      .collection("system")
      .doc("abuseSignals")
      .collection("signals")
      .doc(signalId)
      .update({
        resolved: true,
        resolvedAt: serverTimestamp(),
        resolvedBy: context.auth.uid,
        notes: notes || "",
      });

    return { success: true, signalId };
  }
);
