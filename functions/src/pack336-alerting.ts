/**
 * PACK 336 — ALERTING THRESHOLDS SYSTEM
 * 
 * Automated monitoring and alerting for critical KPI thresholds.
 * Sends notifications via Push, Email, and Slack webhook.
 * 
 * Alert Conditions:
 * - Refund volume > 4% of revenue
 * - DAU drops > 25% WoW
 * - Payment success rate < 92%
 * - Token velocity spike > 300% in 24h (fraud risk)
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp } from './init.js';
import type { KpiAlert, AlertSeverity, AlertThresholds } from './pack336-types.js';

// Default alert thresholds
const DEFAULT_THRESHOLDS: AlertThresholds = {
  refundVolumePercent: 4,
  dauDropPercent: 25,
  paymentSuccessRatePercent: 92,
  tokenVelocitySpikePercent: 300,
};

// ============================================================================
// ALERT CREATION
// ============================================================================

/**
 * Create a new alert in the system
 */
export async function createAlert(
  type: string,
  severity: AlertSeverity,
  title: string,
  message: string,
  currentValue: number,
  threshold: number,
  metadata?: Record<string, any>
): Promise<string> {
  const alertRef = db.collection('kpiAlerts').doc();
  
  const alert: Partial<KpiAlert> = {
    type,
    severity,
    title,
    message,
    currentValue,
    threshold,
    status: 'ACTIVE',
    createdAt: serverTimestamp() as any,
    metadata: metadata || {},
  };
  
  await alertRef.set(alert);
  
  // Send notifications
  await sendAlertNotifications(alertRef.id, alert as KpiAlert);
  
  return alertRef.id;
}

/**
 * Acknowledge an alert (mark as acknowledged by admin)
 */
export async function acknowledgeAlert(
  alertId: string,
  acknowledgedBy: string
): Promise<void> {
  await db.collection('kpiAlerts').doc(alertId).update({
    status: 'ACKNOWLEDGED',
    acknowledgedBy,
    acknowledgedAt: serverTimestamp(),
  });
}

/**
 * Resolve an alert (mark as resolved)
 */
export async function resolveAlert(
  alertId: string,
  resolvedBy: string
): Promise<void> {
  await db.collection('kpiAlerts').doc(alertId).update({
    status: 'RESOLVED',
    resolvedAt: serverTimestamp(),
    acknowledgedBy: resolvedBy, // Also mark as acknowledged
    acknowledgedAt: serverTimestamp(),
  });
}

/**
 * Get recent alerts with filtering
 */
export async function getRecentAlerts(
  limit: number = 50,
  onlyUnacknowledged: boolean = false
): Promise<KpiAlert[]> {
  let query = db.collection('kpiAlerts')
    .orderBy('createdAt', 'desc')
    .limit(limit);
  
  if (onlyUnacknowledged) {
    query = query.where('status', '==', 'ACTIVE') as any;
  }
  
  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  } as KpiAlert));
}

// ============================================================================
// NOTIFICATION DELIVERY
// ============================================================================

/**
 * Send alert notifications through all configured channels
 */
async function sendAlertNotifications(
  alertId: string,
  alert: KpiAlert
): Promise<void> {
  try {
    // Send push notifications to admins
    await sendPushNotifications(alert);
    
    // Send email notifications
    await sendEmailNotifications(alert);
    
    // Send Slack webhook
    await sendSlackNotification(alert);
    
    console.log(`[PACK 336] Alert notifications sent for ${alertId}`);
  } catch (error) {
    console.error(`[PACK 336] Error sending alert notifications:`, error);
    // Don't throw - alerting should not fail the main operation
  }
}

/**
 * Send push notifications to all admin users
 */
async function sendPushNotifications(alert: KpiAlert): Promise<void> {
  try {
    // Get all admin users
    const adminsSnapshot = await db.collection('users')
      .where('role', '==', 'admin')
      .get();
    
    if (adminsSnapshot.empty) {
      console.log('[PACK 336] No admin users found for push notifications');
      return;
    }
    
    // Get FCM tokens for admins
    const tokens: string[] = [];
    for (const doc of adminsSnapshot.docs) {
      const userData = doc.data();
      if (userData.fcmToken) {
        tokens.push(userData.fcmToken);
      }
    }
    
    if (tokens.length === 0) {
      console.log('[PACK 336] No FCM tokens found for admin users');
      return;
    }
    
    // Send via Firebase Cloud Messaging
    const admin = await import('firebase-admin');
    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: `🚨 ${alert.title}`,
        body: alert.message,
      },
      data: {
        alertId: alert.id || '',
        type: alert.type,
        severity: alert.severity,
      },
      android: {
        priority: 'high',
      },
      apns: {
        headers: {
          'apns-priority': '10',
        },
      },
    });
    
    console.log(`[PACK 336] Push notifications sent to ${tokens.length} admin users`);
  } catch (error) {
    console.error('[PACK 336] Error sending push notifications:', error);
  }
}

/**
 * Send email notifications to admin email addresses
 */
async function sendEmailNotifications(alert: KpiAlert): Promise<void> {
  try {
    // Get admin email addresses from config
    const config = functions.config();
    const adminEmails = config.pack336?.admin_emails?.split(',') || [];
    
    if (adminEmails.length === 0) {
      console.log('[PACK 336] No admin email addresses configured');
      return;
    }
    
    // Store email task for processing by email service
    await db.collection('emailQueue').add({
      to: adminEmails,
      template: 'kpi_alert',
      data: {
        title: alert.title,
        message: alert.message,
        severity: alert.severity,
        type: alert.type,
        currentValue: alert.currentValue,
        threshold: alert.threshold,
      },
      createdAt: serverTimestamp(),
      status: 'pending',
    });
    
    console.log(`[PACK 336] Email notifications queued for ${adminEmails.length} recipients`);
  } catch (error) {
    console.error('[PACK 336] Error queuing email notifications:', error);
  }
}

/**
 * Send Slack webhook notification
 */
async function sendSlackNotification(alert: KpiAlert): Promise<void> {
  try {
    const config = functions.config();
    const slackWebhookUrl = config.pack336?.slack_webhook_url;
    
    if (!slackWebhookUrl) {
      console.log('[PACK 336] Slack webhook URL not configured');
      return;
    }
    
    const color = alert.severity === 'CRITICAL' ? '#ff0000' : '#ff9900';
    const emoji = alert.severity === 'CRITICAL' ? '🚨' : '⚠️';
    
    const payload = {
      text: `${emoji} *${alert.title}*`,
      attachments: [
        {
          color,
          fields: [
            {
              title: 'Message',
              value: alert.message,
              short: false,
            },
            {
              title: 'Type',
              value: alert.type,
              short: true,
            },
            {
              title: 'Severity',
              value: alert.severity,
              short: true,
            },
            {
              title: 'Current Value',
              value: `${alert.currentValue.toFixed(2)}`,
              short: true,
            },
            {
              title: 'Threshold',
              value: `${alert.threshold.toFixed(2)}`,
              short: true,
            },
          ],
          footer: 'Avalo KPI Monitoring',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };
    
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      throw new Error(`Slack webhook returned ${response.status}`);
    }
    
    console.log('[PACK 336] Slack notification sent successfully');
  } catch (error) {
    console.error('[PACK 336] Error sending Slack notification:', error);
  }
}

// ============================================================================
// CALLABLE ENDPOINTS
// ============================================================================

/**
 * Get recent alerts (admin only)
 */
export const pack336_getRecentAlerts = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  const { limit, onlyUnacknowledged } = data;
  
  try {
    const alerts = await getRecentAlerts(limit || 50, onlyUnacknowledged || false);
    return { success: true, alerts };
  } catch (error: any) {
    console.error('[PACK 336] Error getting alerts:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Acknowledge an alert (admin only)
 */
export const pack336_acknowledgeAlert = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  const { alertId } = data;
  
  if (!alertId) {
    throw new functions.https.HttpsError('invalid-argument', 'alertId is required');
  }
  
  try {
    await acknowledgeAlert(alertId, context.auth.uid);
    return { success: true };
  } catch (error: any) {
    console.error('[PACK 336] Error acknowledging alert:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Resolve an alert (admin only)
 */
export const pack336_resolveAlert = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  const { alertId } = data;
  
  if (!alertId) {
    throw new functions.https.HttpsError('invalid-argument', 'alertId is required');
  }
  
  try {
    await resolveAlert(alertId, context.auth.uid);
    return { success: true };
  } catch (error: any) {
    console.error('[PACK 336] Error resolving alert:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get current alert thresholds configuration (admin only)
 */
export const pack336_getAlertThresholds = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  try {
    const configDoc = await db.collection('systemConfig').doc('pack336_alertThresholds').get();
    
    const thresholds = configDoc.exists
      ? configDoc.data() as AlertThresholds
      : DEFAULT_THRESHOLDS;
    
    return { success: true, thresholds };
  } catch (error: any) {
    console.error('[PACK 336] Error getting alert thresholds:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Update alert thresholds configuration (admin only)
 */
export const pack336_updateAlertThresholds = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Add admin role check
  
  const { thresholds } = data;
  
  if (!thresholds) {
    throw new functions.https.HttpsError('invalid-argument', 'thresholds object is required');
  }
  
  try {
    await db.collection('systemConfig').doc('pack336_alertThresholds').set({
      ...thresholds,
      updatedAt: serverTimestamp(),
      updatedBy: context.auth.uid,
    });
    
    console.log('[PACK 336] Alert thresholds updated by', context.auth.uid);
    
    return { success: true, thresholds };
  } catch (error: any) {
    console.error('[PACK 336] Error updating alert thresholds:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});