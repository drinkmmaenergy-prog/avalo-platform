/**
 * PACK 416 — Audit Logging & Monitoring Integration
 * 
 * Integration with PACK 296 (Audit System) and PACK 302 (Monitoring)
 * 
 * Purpose:
 * - Log all feature flag changes
 * - Monitor suspicious activity
 * - Export metrics for dashboards
 * - Alert on critical flag changes
 */

import * as functions from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  FeatureFlagKey,
  FeatureFlagConfig,
  FeatureFlagChangeEvent,
  CRITICAL_FEATURES,
} from '../../shared/config/pack416-feature-flags';

const db = getFirestore();

/**
 * Log feature flag change to audit system (PACK 296)
 * 
 * @param event Feature flag change event
 */
export async function logFeatureFlagChange(event: FeatureFlagChangeEvent): Promise<void> {
  try {
    // Log to audit system collection
    await db.collection('auditLogs').add({
      type: 'FEATURE_FLAG_CHANGED',
      entityType: 'featureFlag',
      entityId: event.flagKey,
      action: event.after.enabled !== event.before.enabled 
        ? (event.after.enabled ? 'ENABLED' : 'DISABLED')
        : 'UPDATED',
      
      // Event details
      flagKey: event.flagKey,
      before: event.before,
      after: event.after,
      
      // Actor information
      actorId: event.changedBy,
      actorType: 'admin',
      
      // Context
      timestamp: event.changedAt,
      ipAddress: event.ipAddress || null,
      userAgent: event.deviceInfo || null,
      reason: event.reason || null,
      
      // Metadata
      isCritical: CRITICAL_FEATURES.includes(event.flagKey),
      metadata: {
        previousEnabled: event.before.enabled,
        newEnabled: event.after.enabled,
        previousRollout: event.before.rollout,
        newRollout: event.after.rollout,
      },
    });
    
    // If critical feature, create high-priority alert
    if (CRITICAL_FEATURES.includes(event.flagKey)) {
      await createCriticalFeatureAlert(event);
    }
    
    // Update metrics
    await incrementMetric('feature_flag_changes_total', {
      flagKey: event.flagKey,
      action: event.after.enabled !== event.before.enabled 
        ? (event.after.enabled ? 'enabled' : 'disabled')
        : 'updated',
    });
    
  } catch (error) {
    console.error('[Audit] Error logging feature flag change:', error);
    // Don't throw - logging failures shouldn't block feature updates
  }
}

/**
 * Create alert for critical feature changes
 * 
 * @param event Feature flag change event
 */
async function createCriticalFeatureAlert(event: FeatureFlagChangeEvent): Promise<void> {
  try {
    await db.collection('alerts').add({
      type: 'CRITICAL_FEATURE_FLAG_CHANGE',
      severity: 'high',
      title: `Critical Feature ${event.flagKey} Modified`,
      message: `Critical feature ${event.flagKey} was ${
        event.after.enabled ? 'enabled' : 'disabled'
      } by ${event.changedBy}`,
      
      // Alert details
      featureKey: event.flagKey,
      action: event.after.enabled ? 'enabled' : 'disabled',
      changedBy: event.changedBy,
      
      // Status
      status: 'active',
      acknowledged: false,
      
      // Timestamps
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: null, // Manual acknowledgment required
      
      // Metadata
      metadata: {
        before: event.before,
        after: event.after,
        reason: event.reason,
      },
    });
    
    // TODO: Send notification to admin team (Slack, email, etc.)
    console.log(`🚨 ALERT: Critical feature ${event.flagKey} modified`);
    
  } catch (error) {
    console.error('[Audit] Error creating critical feature alert:', error);
  }
}

/**
 * Monitor for suspicious feature flag activity
 * - Too many changes in short time
 * - Rapid enable/disable cycles
 * - Unauthorized access attempts
 * 
 * Integration with PACK 302
 */
export async function detectSuspiciousActivity(
  adminId: string,
  flagKey: FeatureFlagKey
): Promise<void> {
  try {
    // Check for rapid changes (more than 5 in last 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    const recentChanges = await db
      .collection('auditLogs')
      .where('type', '==', 'FEATURE_FLAG_CHANGED')
      .where('flagKey', '==', flagKey)
      .where('actorId', '==', adminId)
      .where('timestamp', '>=', tenMinutesAgo)
      .get();
    
    if (recentChanges.size >= 5) {
      await createSuspiciousActivityAlert(adminId, flagKey, 'RAPID_CHANGES', {
        changeCount: recentChanges.size,
        timeWindow: '10 minutes',
      });
    }
    
    // Check for enable/disable cycles
    const lastFiveChanges = recentChanges.docs
      .slice(0, 5)
      .map(doc => doc.data().action);
    
    const hasToggleCycle = lastFiveChanges.filter(
      (action, i, arr) => i > 0 && action !== arr[i - 1]
    ).length >= 3;
    
    if (hasToggleCycle) {
      await createSuspiciousActivityAlert(adminId, flagKey, 'TOGGLE_CYCLE', {
        actions: lastFiveChanges,
      });
    }
    
  } catch (error) {
    console.error('[Audit] Error detecting suspicious activity:', error);
  }
}

/**
 * Create alert for suspicious activity
 */
async function createSuspiciousActivityAlert(
  adminId: string,
  flagKey: FeatureFlagKey,
  pattern: string,
  details: any
): Promise<void> {
  try {
    await db.collection('securityAlerts').add({
      type: 'SUSPICIOUS_FEATURE_FLAG_ACTIVITY',
      severity: 'medium',
      pattern,
      
      // Actor
      adminId,
      flagKey,
      
      // Details
      details,
      
      // Status
      status: 'active',
      reviewed: false,
      
      // Timestamps
      createdAt: FieldValue.serverTimestamp(),
    });
    
    console.warn(`⚠️  Suspicious activity detected: ${pattern} for ${flagKey} by ${adminId}`);
    
  } catch (error) {
    console.error('[Audit] Error creating suspicious activity alert:', error);
  }
}

/**
 * Increment metric counter
 * Integration with PACK 351/monitoring system
 */
async function incrementMetric(
  metricName: string,
  labels: Record<string, string>
): Promise<void> {
  try {
    const metricRef = db.collection('metrics').doc(metricName);
    
    await metricRef.set({
      name: metricName,
      lastUpdated: FieldValue.serverTimestamp(),
      labels,
    }, { merge: true });
    
    // Increment counter
    await metricRef.update({
      count: FieldValue.increment(1),
    });
    
  } catch (error) {
    console.error('[Audit] Error incrementing metric:', error);
  }
}

/**
 * Get feature flag change statistics
 * For admin dashboards and monitoring
 */
export async function getFeatureFlagStats(
  startDate: Date,
  endDate: Date
): Promise<{
  totalChanges: number;
  enabledCount: number;
  disabledCount: number;
  criticalChanges: number;
  topChangedFlags: Array<{ key: string; count: number }>;
}> {
  try {
    const changes = await db
      .collection('auditLogs')
      .where('type', '==', 'FEATURE_FLAG_CHANGED')
      .where('timestamp', '>=', startDate)
      .where('timestamp', '<=', endDate)
      .get();
    
    let enabledCount = 0;
    let disabledCount = 0;
    let criticalChanges = 0;
    const flagCounts: Record<string, number> = {};
    
    changes.forEach(doc => {
      const data = doc.data();
      
      if (data.action === 'ENABLED') enabledCount++;
      if (data.action === 'DISABLED') disabledCount++;
      if (data.isCritical) criticalChanges++;
      
      flagCounts[data.flagKey] = (flagCounts[data.flagKey] || 0) + 1;
    });
    
    const topChangedFlags = Object.entries(flagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([key, count]) => ({ key, count }));
    
    return {
      totalChanges: changes.size,
      enabledCount,
      disabledCount,
      criticalChanges,
      topChangedFlags,
    };
    
  } catch (error) {
    console.error('[Audit] Error getting feature flag stats:', error);
    return {
      totalChanges: 0,
      enabledCount: 0,
      disabledCount: 0,
      criticalChanges: 0,
      topChangedFlags: [],
    };
  }
}

/**
 * Cloud Function: Log feature flag change
 * Called whenever a feature flag is updated
 */
export const onFeatureFlagChanged = functions.firestore
  .document('featureFlags/{flagKey}')
  .onUpdate(async (change, context) => {
    try {
      const before = change.before.data() as FeatureFlagConfig;
      const after = change.after.data() as FeatureFlagConfig;
      const flagKey = context.params.flagKey as FeatureFlagKey;
      
      const event: FeatureFlagChangeEvent = {
        flagKey,
        before: {
          enabled: before.enabled,
          rollout: before.rollout,
        },
        after: {
          enabled: after.enabled,
          rollout: after.rollout,
        },
        changedBy: after.lastUpdatedBy,
        changedAt: after.lastUpdatedAt,
      };
      
      // Log the change
      await logFeatureFlagChange(event);
      
      // Check for suspicious activity
      await detectSuspiciousActivity(after.lastUpdatedBy, flagKey);
      
    } catch (error) {
      console.error('[Audit] Error in onFeatureFlagChanged trigger:', error);
    }
  });

/**
 * Cloud Function: Get feature flag statistics
 * API endpoint for admin dashboard
 */
export const getFeatureFlagStatsAPI = functions.https.onCall(async (data, context) => {
  // Verify admin access
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // TODO: Check admin role (PACK 296/300A)
  
  const { startDate, endDate } = data;
  
  const stats = await getFeatureFlagStats(
    new Date(startDate),
    new Date(endDate)
  );
  
  return stats;
});

/**
 * Export metrics for monitoring dashboards
 * Returns Prometheus-compatible metrics
 */
export const getFeatureFlagMetrics = functions.https.onRequest(async (req, res) => {
  try {
    // Get counts
    const flagsRef = await db.collection('featureFlags').get();
    const enabledCount = flagsRef.docs.filter(doc => doc.data().enabled).length;
    const disabledCount = flagsRef.size - enabledCount;
    
    // Get recent changes (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentChanges = await db
      .collection('auditLogs')
      .where('type', '==', 'FEATURE_FLAG_CHANGED')
      .where('timestamp', '>=', yesterday)
      .get();
    
    // Format as Prometheus metrics
    const metrics = [
      `# HELP feature_flags_total Total number of feature flags`,
      `# TYPE feature_flags_total gauge`,
      `feature_flags_total ${flagsRef.size}`,
      ``,
      `# HELP feature_flags_enabled Number of enabled feature flags`,
      `# TYPE feature_flags_enabled gauge`,
      `feature_flags_enabled ${enabledCount}`,
      ``,
      `# HELP feature_flags_disabled Number of disabled feature flags`,
      `# TYPE feature_flags_disabled gauge`,
      `feature_flags_disabled ${disabledCount}`,
      ``,
      `# HELP feature_flags_changes_24h Number of flag changes in last 24 hours`,
      `# TYPE feature_flags_changes_24h counter`,
      `feature_flags_changes_24h ${recentChanges.size}`,
    ].join('\n');
    
    res.set('Content-Type', 'text/plain');
    res.status(200).send(metrics);
    
  } catch (error) {
    console.error('[Metrics] Error exporting metrics:', error);
    res.status(500).send('Error exporting metrics');
  }
});
