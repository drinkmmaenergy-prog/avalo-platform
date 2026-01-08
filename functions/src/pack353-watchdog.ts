/**
 * PACK 353 — Watchdog System for Critical Services
 * 
 * Purpose: Monitor health of all critical Avalo services
 * Alerts: Admin panel, Slack/email when services fail
 */

import * as admin from 'firebase-admin';

type ServiceName =
  | 'wallet'
  | 'chat'
  | 'calls'
  | 'calendar'
  | 'events'
  | 'ai_companions'
  | 'support';

interface ServiceHealth {
  service: ServiceName;
  status: 'healthy' | 'degraded' | 'down';
  lastEventAt?: number;
  lastCheckAt: number;
  errorCount: number;
  consecutiveErrors: number;
  lastError?: string;
  lastErrorAt?: number;
  uptime: number; // percentage
  responseTime?: number; // ms
}

interface WatchdogConfig {
  maxInactivityMs: number; // Max time without events
  maxConsecutiveErrors: number; // Trigger alert after N errors
  checkIntervalMs: number; // How often to check
}

const WATCHDOG_CONFIG: Record<ServiceName, WatchdogConfig> = {
  wallet: {
    maxInactivityMs: 5 * 60 * 1000, // 5 minutes
    maxConsecutiveErrors: 5,
    checkIntervalMs: 60 * 1000, // 1 minute
  },
  chat: {
    maxInactivityMs: 2 * 60 * 1000, // 2 minutes
    maxConsecutiveErrors: 5,
    checkIntervalMs: 60 * 1000,
  },
  calls: {
    maxInactivityMs: 5 * 60 * 1000, // 5 minutes
    maxConsecutiveErrors: 3,
    checkIntervalMs: 60 * 1000,
  },
  calendar: {
    maxInactivityMs: 10 * 60 * 1000, // 10 minutes
    maxConsecutiveErrors: 5,
    checkIntervalMs: 2 * 60 * 1000, // 2 minutes
  },
  events: {
    maxInactivityMs: 10 * 60 * 1000, // 10 minutes
    maxConsecutiveErrors: 5,
    checkIntervalMs: 2 * 60 * 1000,
  },
  ai_companions: {
    maxInactivityMs: 5 * 60 * 1000, // 5 minutes
    maxConsecutiveErrors: 5,
    checkIntervalMs: 60 * 1000,
  },
  support: {
    maxInactivityMs: 15 * 60 * 1000, // 15 minutes
    maxConsecutiveErrors: 5,
    checkIntervalMs: 5 * 60 * 1000, // 5 minutes
  },
};

/**
 * Record service heartbeat
 */
export async function recordServiceHeartbeat(
  service: ServiceName,
  metadata?: {
    operationType?: string;
    responseTime?: number;
    success?: boolean;
    error?: string;
  }
): Promise<void> {
  const db = admin.firestore();
  const now = Date.now();
  
  const healthRef = db.collection('serviceHealth').doc(service);
  
  try {
    const doc = await healthRef.get();
    const currentData = doc.exists ? (doc.data() as ServiceHealth) : null;
    
    const updates: Partial<ServiceHealth> = {
      service,
      lastEventAt: now,
      lastCheckAt: now,
    };
    
    if (metadata?.success === false || metadata?.error) {
      updates.errorCount = admin.firestore.FieldValue.increment(1) as any;
      updates.consecutiveErrors = (currentData?.consecutiveErrors || 0) + 1;
      updates.lastError = metadata.error;
      updates.lastErrorAt = now;
      
      // Check if should trigger alert
      if (updates.consecutiveErrors >= WATCHDOG_CONFIG[service].maxConsecutiveErrors) {
        await triggerServiceAlert(service, 'consecutive_errors', currentData);
      }
    } else {
      updates.consecutiveErrors = 0;
      updates.status = 'healthy';
    }
    
    if (metadata?.responseTime) {
      updates.responseTime = metadata.responseTime;
    }
    
    await healthRef.set(updates, { merge: true });
  } catch (error) {
    console.error('Record heartbeat error:', error);
  }
}

/**
 * Check all services health
 */
export async function checkAllServicesHealth(): Promise<ServiceHealth[]> {
  const db = admin.firestore();
  const now = Date.now();
  const services = Object.keys(WATCHDOG_CONFIG) as ServiceName[];
  const healthStatuses: ServiceHealth[] = [];
  
  for (const service of services) {
    try {
      const healthRef = db.collection('serviceHealth').doc(service);
      const doc = await healthRef.get();
      
      if (!doc.exists) {
        // Service never reported, create initial record
        const initialHealth: ServiceHealth = {
          service,
          status: 'down',
          lastCheckAt: now,
          errorCount: 0,
          consecutiveErrors: 0,
          uptime: 0,
        };
        
        await healthRef.set(initialHealth);
        healthStatuses.push(initialHealth);
        
        await triggerServiceAlert(service, 'no_heartbeat', null);
        continue;
      }
      
      const health = doc.data() as ServiceHealth;
      const config = WATCHDOG_CONFIG[service];
      const timeSinceLastEvent = now - (health.lastEventAt || 0);
      
      // Check for inactivity
      if (timeSinceLastEvent > config.maxInactivityMs) {
        health.status = 'down';
        await healthRef.update({
          status: 'down',
          lastCheckAt: now,
        });
        
        await triggerServiceAlert(service, 'inactivity', health);
      }
      // Check for consecutive errors
      else if (health.consecutiveErrors >= config.maxConsecutiveErrors) {
        health.status = 'degraded';
        await healthRef.update({
          status: 'degraded',
          lastCheckAt: now,
        });
      } else {
        health.status = 'healthy';
        await healthRef.update({
          status: 'healthy',
          lastCheckAt: now,
        });
      }
      
      healthStatuses.push(health);
    } catch (error) {
      console.error(`Health check error for ${service}:`, error);
    }
  }
  
  return healthStatuses;
}

/**
 * Trigger service alert
 */
async function triggerServiceAlert(
  service: ServiceName,
  alertType: 'consecutive_errors' | 'inactivity' | 'no_heartbeat',
  health: ServiceHealth | null
): Promise<void> {
  const db = admin.firestore();
  const now = Date.now();
  
  // Create alert record
  const alertRef = await db.collection('serviceAlerts').add({
    service,
    alertType,
    severity: alertType === 'no_heartbeat' ? 'critical' : 'high',
    status: 'open',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    metadata: health || {},
  });
  
  // Send to admin panel
  await db.collection('adminNotifications').add({
    type: 'service_alert',
    service,
    alertType,
    alertId: alertRef.id,
    severity: alertType === 'no_heartbeat' ? 'critical' : 'high',
    message: generateAlertMessage(service, alertType, health),
    read: false,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
  
  // Send Slack notification (if configured)
  await sendSlackAlert(service, alertType, health);
  
  // Send email notification (if configured)
  await sendEmailAlert(service, alertType, health);
  
  console.warn('Service alert triggered:', {
    service,
    alertType,
    health,
  });
}

/**
 * Generate alert message
 */
function generateAlertMessage(
  service: ServiceName,
  alertType: string,
  health: ServiceHealth | null
): string {
  switch (alertType) {
    case 'consecutive_errors':
      return `Service "${service}" has ${health?.consecutiveErrors} consecutive errors. Last error: ${health?.lastError}`;
    
    case 'inactivity':
      const minutesSinceEvent = Math.floor((Date.now() - (health?.lastEventAt || 0)) / 60000);
      return `Service "${service}" has been inactive for ${minutesSinceEvent} minutes`;
    
    case 'no_heartbeat':
      return `Service "${service}" has never reported a heartbeat`;
    
    default:
      return `Service "${service}" alert: ${alertType}`;
  }
}

/**
 * Send Slack alert
 */
async function sendSlackAlert(
  service: ServiceName,
  alertType: string,
  health: ServiceHealth | null
): Promise<void> {
  // Note: Requires Slack webhook configuration
  // This is a placeholder implementation
  
  try {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    
    if (!webhookUrl) {
      return; // Slack not configured
    }
    
    const message = generateAlertMessage(service, alertType, health);
    
    // In real implementation:
    // await fetch(webhookUrl, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     text: `🚨 Avalo Service Alert\n${message}`,
    //     attachments: [{
    //       color: 'danger',
    //       fields: [
    //         { title: 'Service', value: service, short: true },
    //         { title: 'Alert Type', value: alertType, short: true },
    //       ],
    //     }],
    //   }),
    // });
    
    console.log('Slack alert sent:', service, alertType);
  } catch (error) {
    console.error('Slack alert error:', error);
  }
}

/**
 * Send email alert
 */
async function sendEmailAlert(
  service: ServiceName,
  alertType: string,
  health: ServiceHealth | null
): Promise<void> {
  // Note: Requires email service configuration
  // This is a placeholder implementation
  
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    
    if (!adminEmail) {
      return; // Email not configured
    }
    
    const message = generateAlertMessage(service, alertType, health);
    
    // In real implementation:
    // Use SendGrid, AWS SES, or similar service
    // await sendEmail({
    //   to: adminEmail,
    //   subject: `🚨 Avalo Service Alert: ${service}`,
    //   html: `
    //     <h2>Service Alert</h2>
    //     <p><strong>Service:</strong> ${service}</p>
    //     <p><strong>Alert Type:</strong> ${alertType}</p>
    //     <p><strong>Message:</strong> ${message}</p>
    //     <p><strong>Time:</strong> ${new Date().toISOString()}</p>
    //   `,
    // });
    
    console.log('Email alert sent:', service, alertType);
  } catch (error) {
    console.error('Email alert error:', error);
  }
}

/**
 * Get service health status
 */
export async function getServiceHealth(
  service: ServiceName
): Promise<ServiceHealth | null> {
  const db = admin.firestore();
  
  const doc = await db.collection('serviceHealth').doc(service).get();
  
  if (!doc.exists) {
    return null;
  }
  
  return doc.data() as ServiceHealth;
}

/**
 * Get all services health
 */
export async function getAllServicesHealth(): Promise<ServiceHealth[]> {
  const db = admin.firestore();
  
  const snapshot = await db.collection('serviceHealth').get();
  
  return snapshot.docs.map((doc) => doc.data() as ServiceHealth);
}

/**
 * Get active alerts
 */
export async function getActiveAlerts(): Promise<any[]> {
  const db = admin.firestore();
  
  const snapshot = await db
    .collection('serviceAlerts')
    .where('status', '==', 'open')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

/**
 * Resolve alert
 */
export async function resolveAlert(
  alertId: string,
  adminId: string,
  resolution: string
): Promise<{ success: boolean }> {
  const db = admin.firestore();
  
  try {
    await db.collection('serviceAlerts').doc(alertId).update({
      status: 'resolved',
      resolvedBy: adminId,
      resolvedAt: Date.now(),
      resolution,
    });
    
    return { success: true };
  } catch (error) {
    console.error('Resolve alert error:', error);
    return { success: false };
  }
}

/**
 * Calculate service uptime
 */
export async function calculateServiceUptime(
  service: ServiceName,
  periodMs: number = 24 * 60 * 60 * 1000 // 24 hours
): Promise<number> {
  const db = admin.firestore();
  const now = Date.now();
  const startTime = now - periodMs;
  
  // Get all heartbeats in period
  const heartbeats = await db
    .collection('serviceHeartbeats')
    .where('service', '==', service)
    .where('timestamp', '>=', startTime)
    .get();
  
  if (heartbeats.empty) {
    return 0;
  }
  
  let totalUptime = 0;
  let totalTime = periodMs;
  
  heartbeats.docs.forEach((doc) => {
    const data = doc.data();
    if (data.success !== false) {
      totalUptime += 60000; // Assume 1 minute uptime per successful heartbeat
    }
  });
  
  const uptimePercentage = Math.min(100, (totalUptime / totalTime) * 100);
  
  return Math.round(uptimePercentage * 100) / 100;
}

/**
 * Clean up old alerts (scheduled function)
 */
export async function cleanupOldAlerts(): Promise<void> {
  const db = admin.firestore();
  const cutoffTime = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days ago
  
  const batch = db.batch();
  const oldAlerts = await db
    .collection('serviceAlerts')
    .where('status', '==', 'resolved')
    .where('resolvedAt', '<', cutoffTime)
    .limit(500)
    .get();
  
  oldAlerts.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  
  console.log(`Cleaned up ${oldAlerts.size} old alerts`);
}
