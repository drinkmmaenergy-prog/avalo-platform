/**
 * PACK 346 — Alert Routing Engine
 * Routes critical alerts to appropriate channels
 */

import * as functions from "firebase-functions";
import { db, serverTimestamp } from "./init.js";
import { Alert, AlertType, AlertSeverity, AlertChannel } from "./pack346-types";

/**
 * Trigger an alert
 */
export async function triggerAlert(
  alert: Partial<Alert>
): Promise<string> {
  const alertId = db.collection("system").doc("alerts").collection("active").doc().id;

  const fullAlert: Alert = {
    id: alertId,
    type: alert.type!,
    severity: alert.severity!,
    title: alert.title!,
    message: alert.message!,
    channels: alert.channels || getDefaultChannels(alert.severity!),
    metric: alert.metric,
    currentValue: alert.currentValue,
    threshold: alert.threshold,
    region: alert.region,
    metadata: alert.metadata || {},
    createdAt: serverTimestamp() as any,
  };

  // Save alert
  await db
    .collection("system")
    .doc("alerts")
    .collection("active")
    .doc(alertId)
    .set(fullAlert);

  // Route to channels
  await routeToChannels(fullAlert);

  console.log(`Alert triggered: ${alertId} - ${fullAlert.title}`);

  return alertId;
}

/**
 * Get default channels based on severity
 */
function getDefaultChannels(severity: AlertSeverity): AlertChannel[] {
  switch (severity) {
    case "emergency":
      return ["admin_dashboard", "slack", "email", "push"];
    case "critical":
      return ["admin_dashboard", "slack", "email"];
    case "warning":
      return ["admin_dashboard", "slack"];
    case "info":
      return ["admin_dashboard"];
    default:
      return ["admin_dashboard"];
  }
}

/**
 * Route alert to configured channels
 */
async function routeToChannels(alert: Alert): Promise<void> {
  const promises: Promise<void>[] = [];

  for (const channel of alert.channels) {
    switch (channel) {
      case "admin_dashboard":
        // Already saved to database
        break;
        
      case "slack":
        promises.push(sendToSlack(alert));
        break;
        
      case "email":
        promises.push(sendToEmail(alert));
        break;
        
      case "push":
        promises.push(sendPushNotification(alert));
        break;
    }
  }

  await Promise.allSettled(promises);
}

/**
 * Send alert to Slack webhook
 */
async function sendToSlack(alert: Alert): Promise<void> {
  try {
    const webhookUrl = functions.config().slack?.webhook_url;
    
    if (!webhookUrl) {
      console.warn("Slack webhook URL not configured");
      return;
    }

    const color = getSeverityColor(alert.severity);
    
    const payload = {
      text: `🚨 ${alert.title}`,
      attachments: [
        {
          color,
          fields: [
            {
              title: "Severity",
              value: alert.severity.toUpperCase(),
              short: true,
            },
            {
              title: "Type",
              value: alert.type,
              short: true,
            },
            {
              title: "Message",
              value: alert.message,
              short: false,
            },
            ...(alert.metric
              ? [
                  {
                    title: "Metric",
                    value: `${alert.metric}: ${alert.currentValue} (threshold: ${alert.threshold})`,
                    short: false,
                  },
                ]
              : []),
          ],
          footer: "Avalo KPI Monitoring",
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    const fetch = (await import("node-fetch")).default;
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    console.log(`Alert sent to Slack: ${alert.id}`);
  } catch (error) {
    console.error("Failed to send Slack alert:", error);
  }
}

/**
 * Send alert via email
 */
async function sendToEmail(alert: Alert): Promise<void> {
  try {
    // Get admin emails from config
    const adminEmails = functions.config().admin?.emails || [];
    
    if (adminEmails.length === 0) {
      console.warn("No admin emails configured");
      return;
    }

    // Create email task (to be processed by email service)
    await db.collection("emailQueue").add({
      to: adminEmails,
      template: {
        name: "alert",
        data: {
          title: alert.title,
          severity: alert.severity,
          message: alert.message,
          metric: alert.metric,
          currentValue: alert.currentValue,
          threshold: alert.threshold,
          region: alert.region,
          alertId: alert.id,
        },
      },
      createdAt: serverTimestamp(),
    });

    console.log(`Alert email queued: ${alert.id}`);
  } catch (error) {
    console.error("Failed to queue email alert:", error);
  }
}

/**
 * Send push notification to admin mobile apps
 */
async function sendPushNotification(alert: Alert): Promise<void> {
  try {
    // Get admin FCM tokens
    const adminsSnap = await db
      .collection("users")
      .where("role", "==", "admin")
      .get();

    const tokens: string[] = [];
    adminsSnap.forEach((doc) => {
      const adminData = doc.data();
      if (adminData.fcmToken) {
        tokens.push(adminData.fcmToken);
      }
    });

    if (tokens.length === 0) {
      console.warn("No admin FCM tokens found");
      return;
    }

    // Send via FCM (will be processed by notification service)
    await db.collection("pushQueue").add({
      tokens,
      notification: {
        title: `🚨 ${alert.title}`,
        body: alert.message,
      },
      data: {
        alertId: alert.id || "",
        type: "kpi_alert",
        severity: alert.severity,
      },
      createdAt: serverTimestamp(),
    });

    console.log(`Alert push notification queued: ${alert.id}`);
  } catch (error) {
    console.error("Failed to send push notification:", error);
  }
}

/**
 * Get color for Slack based on severity
 */
function getSeverityColor(severity: AlertSeverity): string {
  switch (severity) {
    case "emergency":
      return "#FF0000";
    case "critical":
      return "#FF6B00";
    case "warning":
      return "#FFD700";
    case "info":
      return "#00BFFF";
    default:
      return "#808080";
  }
}

/**
 * Acknowledge an alert (admin action)
 */
export const acknowledgeAlert = functions.https.onCall(
  async (data, context) => {
    // Require admin auth
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin access required"
      );
    }

    const { alertId } = data;

    if (!alertId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Alert ID is required"
      );
    }

    await db
      .collection("system")
      .doc("alerts")
      .collection("active")
      .doc(alertId)
      .update({
        acknowledgedAt: serverTimestamp(),
        acknowledgedBy: context.auth.uid,
      });

    return { success: true, alertId };
  }
);

/**
 * Resolve an alert (admin action)
 */
export const resolveAlert = functions.https.onCall(
  async (data, context) => {
    // Require admin auth
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin access required"
      );
    }

    const { alertId } = data;

    if (!alertId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Alert ID is required"
      );
    }

    const alertRef = db
      .collection("system")
      .doc("alerts")
      .collection("active")
      .doc(alertId);

    const alertSnap = await alertRef.get();

    if (!alertSnap.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Alert not found"
      );
    }

    // Move to resolved collection
    await db
      .collection("system")
      .doc("alerts")
      .collection("resolved")
      .doc(alertId)
      .set({
        ...alertSnap.data(),
        resolvedAt: serverTimestamp(),
        resolvedBy: context.auth.uid,
      });

    // Delete from active
    await alertRef.delete();

    return { success: true, alertId };
  }
);

/**
 * Check thresholds and trigger alerts (scheduled)
 */
export const checkKPIThresholds = functions.pubsub
  .schedule("every 5 minutes")
  .onRun(async (context) => {
    const today = new Date().toISOString().split("T")[0];

    // Get today's KPI
    const kpiSnap = await db
      .collection("system")
      .doc("kpiRealtime")
      .collection("days")
      .doc(today)
      .get();

    if (!kpiSnap.exists) {
      return { status: "no_kpi_data" };
    }

    const kpi = kpiSnap.data();

    // Get thresholds
    const thresholdsSnap = await db
      .collection("system")
      .doc("kpiThresholds")
      .collection("config")
      .doc("global")
      .get();

    if (!thresholdsSnap.exists) {
      console.warn("No KPI thresholds configured");
      return { status: "no_thresholds" };
    }

    const thresholds = thresholdsSnap.data();

    // Check refund rate
    const totalRevenue = kpi.revenue?.totalRevenuePLN || 0;
    const totalRefunds = 
      (kpi.refunds?.chatWordRefunds || 0) +
      (kpi.refunds?.calendarUserCancelRefunds || 0) +
      (kpi.refunds?.calendarCreatorCancelRefunds || 0) +
      (kpi.refunds?.mismatchRefunds || 0);

    const refundRate = totalRevenue > 0 ? (totalRefunds / totalRevenue) * 100 : 0;

    if (refundRate > (thresholds.dailyRefundRatePercent || 4)) {
      await triggerAlert({
        type: "refund_spike",
        severity: "critical",
        title: "High Refund Rate Detected",
        message: `Refund rate is ${refundRate.toFixed(2)}%, exceeding threshold of ${thresholds.dailyRefundRatePercent}%`,
        metric: "refund_rate_percent",
        currentValue: refundRate,
        threshold: thresholds.dailyRefundRatePercent,
      });
    }

    // Check panic triggers
    const panicCount = kpi.safety?.panicTriggers || 0;
    if (panicCount > (thresholds.panicTriggerThreshold || 10)) {
      await triggerAlert({
        type: "panic_spike",
        severity: "warning",
        title: "High Panic Button Usage",
        message: `${panicCount} panic triggers today, exceeding threshold of ${thresholds.panicTriggerThreshold}`,
        metric: "panic_triggers",
        currentValue: panicCount,
        threshold: thresholds.panicTriggerThreshold,
      });
    }

    // Check revenue drop (compare to yesterday)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const yesterdayKpiSnap= await db
      .collection("system")
      .doc("kpiRealtime")
      .collection("days")
      .doc(yesterdayStr)
      .get();

    if (yesterdayKpiSnap.exists) {
      const yesterdayKpi = yesterdayKpiSnap.data();
      const yesterdayRevenue = yesterdayKpi.revenue?.totalRevenuePLN || 0;

      if (yesterdayRevenue > 0) {
        const revenueDrop = ((yesterdayRevenue - totalRevenue) / yesterdayRevenue) * 100;

        if (revenueDrop > (thresholds.maxRevenueDropPercent || 20)) {
          await triggerAlert({
            type: "revenue_drop",
            severity: "critical",
            title: "Significant Revenue Drop",
            message: `Revenue dropped ${revenueDrop.toFixed(2)}% compared to yesterday`,
            metric: "revenue_drop_percent",
            currentValue: revenueDrop,
            threshold: thresholds.maxRevenueDropPercent,
          });
        }
      }
    }

    return { status: "checked" };
  });
