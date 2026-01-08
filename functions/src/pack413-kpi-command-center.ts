/**
 * PACK 413 — KPI Command Center & Fusion Service
 * 
 * Main backend service for aggregating and monitoring KPIs across all systems.
 * Integrates with PACK 410 (analytics), 411 (store), 412 (launch), 300 (support), 
 * 301 (growth), 302 (fraud/safety).
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  KpiMetric,
  KpiCategory,
  KpiTimeRange,
  ToplineKpiData,
  RegionalKpiData,
  SegmentKpiData,
  GroupedKpis,
  GetKpiParams,
  KpiAlertRule,
  KpiAlertState,
  KpiAlertEvent,
  AlertEvaluationResult,
  STANDARD_METRIC_IDS,
  KpiSeverity,
  KpiTrend,
} from '../../shared/types/pack413-kpi';

const db = admin.firestore();

/**
 * Get topline KPIs (global view across all categories)
 */
export const pack413_getToplineKpis = functions.https.onCall(async (data: GetKpiParams, context) => {
  // Admin or internal service only
  if (!context.auth || !await isAdminOrService(context.auth.uid)) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const timeRange = data.timeRange || 'TODAY';
  const includeAlerts = data.includeAlerts ?? true;

  try {
    // Fetch metrics from all categories
    const metrics = await fetchAllMetrics(timeRange, data.regionId);
    
    // Group by category
    const groups = groupMetricsByCategory(metrics);
    
    // Get active panic modes
    const activePanicModes = await getActivePanicModeIds() as any;
    
    // Get launch stage from PACK 412
    const launchStage = await getCurrentLaunchStage();
    
    // Get active alerts
    const activeAlerts = includeAlerts ? await getActiveAlerts() : [];
    
    // Get recent incidents (last 24h)
    const recentIncidents = includeAlerts ? await getRecentIncidents(24) : [];

    const response: ToplineKpiData = {
      timestamp: new Date().toISOString(),
      launchStage,
      activePanicModes,
      groups,
      activeAlerts,
      recentIncidents,
    };

    return { success: true, data: response };
  } catch (error) {
    console.error('Error fetching topline KPIs:', error);
    throw new functions.https.HttpsError('internal', 'Failed to fetch topline KPIs');
  }
});

/**
 * Get region-specific KPIs
 */
export const pack413_getRegionKpis = functions.https.onCall(async (data: GetKpiParams, context) => {
  if (!context.auth || !await isAdminOrService(context.auth.uid)) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { regionId, timeRange = 'TODAY' } = data;

  if (!regionId) {
    throw new functions.https.HttpsError('invalid-argument', 'regionId is required');
  }

  try {
    // Fetch region-specific metrics
    const metrics = await fetchAllMetrics(timeRange, regionId);
    
    // Get region info from PACK 412
    const regionDoc = await db.collection('launchRegions').doc(regionId).get();
    const regionName = regionDoc.exists ? regionDoc.data()?.name || regionId : regionId;
    const launchStage = regionDoc.exists ? regionDoc.data()?.stage : undefined;
    
    // Get alerts for this region
    const alerts = await getAlertsForRegion(regionId);

    const response: RegionalKpiData = {
      regionId,
      regionName,
      launchStage,
      metrics,
      alerts,
      timestamp: new Date().toISOString(),
    };

    return { success: true, data: response };
  } catch (error) {
    console.error('Error fetching region KPIs:', error);
    throw new functions.https.HttpsError('internal', 'Failed to fetch region KPIs');
  }
});

/**
 * Get segment-specific KPIs (e.g., new users, paying users)
 */
export const pack413_getSegmentKpis = functions.https.onCall(async (data: GetKpiParams, context) => {
  if (!context.auth || !await isAdminOrService(context.auth.uid)) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { segmentKey, timeRange = 'TODAY', regionId } = data;

  if (!segmentKey) {
    throw new functions.https.HttpsError('invalid-argument', 'segmentKey is required');
  }

  try {
    const metrics = await fetchSegmentMetrics(segmentKey, timeRange, regionId);
    
    const response: SegmentKpiData = {
      segmentKey,
      segmentName: getSegmentDisplayName(segmentKey),
      metrics,
      timestamp: new Date().toISOString(),
    };

    return { success: true, data: response };
  } catch (error) {
    console.error('Error fetching segment KPIs:', error);
    throw new functions.https.HttpsError('internal', 'Failed to fetch segment KPIs');
  }
});

/**
 * Scheduled function: evaluate KPI alert rules (runs every 5 minutes)
 */
export const pack413_evaluateKpiAlerts = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context) => {
    console.log('Starting KPI alert evaluation...');

    try {
      // Load all enabled alert rules
      const rulesSnapshot = await db.collection('kpiAlertRules')
        .where('enabled', '==', true)
        .get();

      const results: AlertEvaluationResult[] = [];

      for (const ruleDoc of rulesSnapshot.docs) {
        const rule = ruleDoc.data() as KpiAlertRule;
        const result = await evaluateAlertRule(rule);
        results.push(result);
      }

      console.log(`KPI alert evaluation complete. ${results.length} rules evaluated.`);
      
      const triggered = results.filter(r => r.triggered).length;
      if (triggered > 0) {
        console.log(`${triggered} alerts triggered.`);
      }

      return { success: true, evaluated: results.length, triggered };
    } catch (error) {
      console.error('Error evaluating KPI alerts:', error);
      return { success: false, error: String(error) };
    }
  });

/**
 * Evaluate a single alert rule
 */
async function evaluateAlertRule(rule: KpiAlertRule): Promise<AlertEvaluationResult> {
  const result: AlertEvaluationResult = {
    ruleId: rule.id,
    evaluated: false,
    triggered: false,
    notificationsSent: [],
    timestamp: new Date().toISOString(),
  };

  try {
    // Fetch current metric value
    const currentValue = await getMetricValue(rule.metricId, rule.regionId);
    
    // Load previous alert state
    const stateDoc = await db.collection('kpiAlertStates').doc(rule.id).get();
    const state = stateDoc.exists ? stateDoc.data() as KpiAlertState : null;

    // Check if threshold is violated
    const isViolated = checkThresholdViolation(currentValue, rule.thresholdValue, rule.thresholdType);
    
    let violationDurationMinutes = 0;
    let firstViolatedAt = state?.firstViolatedAt;

    if (isViolated) {
      if (!state?.isViolated) {
        // New violation
        firstViolatedAt = new Date().toISOString();
      } else {
        // Ongoing violation
        firstViolatedAt = state.firstViolatedAt;
      }
      
      const violationStart = new Date(firstViolatedAt!);
      violationDurationMinutes = Math.floor((Date.now() - violationStart.getTime()) / 60000);
    } else {
      // No violation, reset
      firstViolatedAt = undefined;
    }

    const shouldTrigger = isViolated && violationDurationMinutes >= rule.minDurationMinutes;

    // Update state
    const newState: KpiAlertState = {
      ruleId: rule.id,
      metricId: rule.metricId,
      firstViolatedAt,
      lastViolatedAt: isViolated ? new Date().toISOString() : state?.lastViolatedAt,
      lastCheckedAt: new Date().toISOString(),
      currentValue,
      thresholdValue: rule.thresholdValue,
      isViolated,
      violationDurationMinutes,
      shouldTrigger,
    };

    await db.collection('kpiAlertStates').doc(rule.id).set(newState);

    result.evaluated = true;

    // Trigger alert if threshold exceeded for required duration
    if (shouldTrigger && (!state?.shouldTrigger || !state?.isViolated)) {
      // Create alert event
      const alertEvent: KpiAlertEvent = {
        id: db.collection('kpiAlertEvents').doc().id,
        ruleId: rule.id,
        metricId: rule.metricId,
        regionId: rule.regionId,
        severity: rule.severity,
        triggeredAt: new Date().toISOString(),
        currentValue,
        thresholdValue: rule.thresholdValue,
      };

      await db.collection('kpiAlertEvents').doc(alertEvent.id).set(alertEvent);

      // Send notifications via PACK 293
      for (const channel of rule.notificationChannels) {
        await sendAlertNotification(alertEvent, channel);
        result.notificationsSent.push(channel);
      }

      // Log to audit (PACK 296)
      await logAlertToAudit(alertEvent, rule);

      // Check if panic mode should be proposed
      if (rule.linkedPanicModeId && rule.severity === 'CRITICAL') {
        await proposePanicModeActivation(rule.linkedPanicModeId, alertEvent);
        result.proposedPanicMode = rule.linkedPanicModeId;
      }

      result.triggered = true;
    }

  } catch (error) {
    console.error(`Error evaluating rule ${rule.id}:`, error);
    result.errors = [String(error)];
  }

  return result;
}

/**
 * Check if threshold is violated
 */
function checkThresholdViolation(currentValue: number, threshold: number, type: 'ABOVE' | 'BELOW' | 'DELTA_PCT'): boolean {
  switch (type) {
    case 'ABOVE':
      return currentValue > threshold;
    case 'BELOW':
      return currentValue < threshold;
    case 'DELTA_PCT':
      // For delta, threshold is baseline and currentValue is actual
      // Need to implement baseline comparison
      return Math.abs(currentValue - threshold) / threshold > 0.2; // 20% delta
    default:
      return false;
  }
}

/**
 * Fetch all metrics for given timeRange and optional region
 */
async function fetchAllMetrics(timeRange: KpiTimeRange, regionId?: string): Promise<KpiMetric[]> {
  const metrics: KpiMetric[] = [];
  const now = new Date().toISOString();

  // Growth metrics (from PACK 410)
  metrics.push(
    await createMetric(STANDARD_METRIC_IDS.DAU, 'GROWTH', 'Daily Active Users', timeRange, regionId),
    await createMetric(STANDARD_METRIC_IDS.NEW_REGISTRATIONS, 'GROWTH', 'New Registrations', timeRange, regionId),
    await createMetric(STANDARD_METRIC_IDS.VERIFIED_USERS, 'GROWTH', 'Verified Users', timeRange, regionId),
    await createMetric(STANDARD_METRIC_IDS.FIRST_CHAT_CONVERSION, 'GROWTH', 'First Chat Conversion Rate', timeRange, regionId),
  );

  // Engagement metrics
  metrics.push(
    await createMetric(STANDARD_METRIC_IDS.CHATS_PER_USER, 'ENGAGEMENT', 'Chats Per User', timeRange, regionId),
    await createMetric(STANDARD_METRIC_IDS.ACTIVE_CHATS, 'ENGAGEMENT', 'Active Chats', timeRange, regionId),
    await createMetric(STANDARD_METRIC_IDS.EVENTS_BOOKED, 'ENGAGEMENT', 'Events Booked', timeRange, regionId),
  );

  // Revenue metrics (read-only from monetization packs)
  metrics.push(
    await createMetric(STANDARD_METRIC_IDS.TOKEN_PURCHASES, 'REVENUE', 'Token Purchases', timeRange, regionId),
    await createMetric(STANDARD_METRIC_IDS.ARPU, 'REVENUE', 'ARPU', timeRange, regionId),
    await createMetric(STANDARD_METRIC_IDS.PAYING_USERS, 'REVENUE', 'Paying Users', timeRange, regionId),
  );

  // Safety metrics (from PACK 302)
  metrics.push(
    await createMetric(STANDARD_METRIC_IDS.INCIDENT_RATE, 'SAFETY', 'Safety Incident Rate', timeRange, regionId),
    await createMetric(STANDARD_METRIC_IDS.PANIC_BUTTON_TRIGGERS, 'SAFETY', 'Panic Button Triggers', timeRange, regionId),
    await createMetric(STANDARD_METRIC_IDS.BLOCKED_ACCOUNTS, 'SAFETY', 'Blocked Accounts', timeRange, regionId),
  );

  // Support metrics (from PACK 300)
  metrics.push(
    await createMetric(STANDARD_METRIC_IDS.OPEN_TICKETS, 'SUPPORT', 'Open Support Tickets', timeRange, regionId),
    await createMetric(STANDARD_METRIC_IDS.SLA_BREACHES, 'SUPPORT', 'SLA Breaches', timeRange, regionId),
    await createMetric(STANDARD_METRIC_IDS.AVG_FIRST_RESPONSE_TIME, 'SUPPORT', 'Avg First Response Time', timeRange, regionId),
  );

  // Store reputation metrics (from PACK 411)
  metrics.push(
    await createMetric(STANDARD_METRIC_IDS.AVG_RATING, 'STORE_REPUTATION', 'Average Rating', timeRange, regionId),
    await createMetric(STANDARD_METRIC_IDS.ONE_STAR_SHARE, 'STORE_REPUTATION', '1★ Share', timeRange, regionId),
    await createMetric(STANDARD_METRIC_IDS.NEGATIVE_REVIEW_VOLUME, 'STORE_REPUTATION', 'Negative Review Volume', timeRange, regionId),
  );

  // Performance metrics
  metrics.push(
    await createMetric(STANDARD_METRIC_IDS.CRASH_RATE, 'PERFORMANCE', 'Crash Rate', timeRange, regionId),
    await createMetric(STANDARD_METRIC_IDS.P95_LATENCY, 'PERFORMANCE', 'P95 Latency', timeRange, regionId),
    await createMetric(STANDARD_METRIC_IDS.API_ERROR_RATE, 'PERFORMANCE', 'API Error Rate', timeRange, regionId),
  );

  return metrics;
}

/**
 * Create a KPI metric (stub - would integrate with PACK 410 in reality)
 */
async function createMetric(
  id: string,
  category: KpiCategory,
  label: string,
  timeRange: KpiTimeRange,
  regionId?: string
): Promise<KpiMetric> {
  // In production, this would query PACK 410 analytics
  // For now, return stub data
  const value = Math.random() * 1000;
  const baseline = value * 0.9;
  const changePct = ((value - baseline) / baseline) * 100;

  return {
    id,
    category,
    label,
    description: `${label} metric`,
    unit: inferUnit(id),
    value,
    baseline,
    changePct,
    trend: inferTrend(changePct),
    severity: inferSeverity(id, value, changePct),
    timeRange,
    regionId,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Infer unit from metric ID
 */
function inferUnit(metricId: string): 'COUNT' | 'PERCENT' | 'CURRENCY' | 'SECONDS' | 'SCORE' {
  if (metricId.includes('RATE') || metricId.includes('PCT') || metricId.includes('SHARE')) return 'PERCENT';
  if (metricId.includes('TIME') || metricId.includes('LATENCY')) return 'SECONDS';
  if (metricId.includes('ARPU') || metricId.includes('REVENUE')) return 'CURRENCY';
  if (metricId.includes('RATING') || metricId.includes('SCORE')) return 'SCORE';
  return 'COUNT';
}

/**
 * Infer trend from change percentage
 */
function inferTrend(changePct: number): KpiTrend {
  if (Math.abs(changePct) < 2) return 'FLAT';
  return changePct > 0 ? 'UP' : 'DOWN';
}

/**
 * Infer severity from metric value and change
 */
function inferSeverity(metricId: string, value: number, changePct: number): KpiSeverity {
  // Negative metrics (higher is worse)
  const negativeMetrics = ['CRASH_RATE', 'INCIDENT_RATE', 'SLA_BREACHES', 'ONE_STAR_SHARE', 'API_ERROR_RATE'];
  
  if (negativeMetrics.some(m => metricId.includes(m))) {
    if (value > 10 || changePct > 50) return 'CRITICAL';
    if (value > 5 || changePct > 20) return 'WARN';
  }
  
  return 'INFO';
}

/**
 * Get metric value for alert evaluation
 */
async function getMetricValue(metricId: string, regionId?: string): Promise<number> {
  // In production, query PACK 410 analytics
  // Stub for now
  return Math.random() * 100;
}

/**
 * Group metrics by category
 */
function groupMetricsByCategory(metrics: KpiMetric[]): GroupedKpis[] {
  const categories: KpiCategory[] = ['GROWTH', 'ENGAGEMENT', 'REVENUE', 'SAFETY', 'SUPPORT', 'STORE_REPUTATION', 'PERFORMANCE'];
  
  return categories.map(category => {
    const categoryMetrics = metrics.filter(m => m.category === category);
    return {
      category,
      metrics: categoryMetrics,
      summary: {
        totalMetrics: categoryMetrics.length,
        criticalCount: categoryMetrics.filter(m => m.severity === 'CRITICAL').length,
        warningCount: categoryMetrics.filter(m => m.severity === 'WARN').length,
        avgChangePct: categoryMetrics.reduce((sum, m) => sum + (m.changePct || 0), 0) / categoryMetrics.length || 0,
      },
    };
  });
}

/**
 * Get active panic mode IDs
 */
async function getActivePanicModeIds(): Promise<string[]> {
  const snapshot = await db.collection('activePanicModes')
    .where('deactivatedAt', '==', null)
    .get();
  
  return snapshot.docs.map(doc => doc.data().modeId);
}

/**
 * Get current launch stage from PACK 412
 */
async function getCurrentLaunchStage(): Promise<string | undefined> {
  const doc = await db.collection('launchOrchestration').doc('globalState').get();
  return doc.exists ? doc.data()?.currentStage : undefined;
}

/**
 * Get active alert events
 */
async function getActiveAlerts(): Promise<KpiAlertEvent[]> {
  const snapshot = await db.collection('kpiAlertEvents')
    .where('resolvedAt', '==', null)
    .orderBy('triggeredAt', 'desc')
    .limit(20)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as KpiAlertEvent);
}

/**
 * Get recent incidents (last N hours)
 */
async function getRecentIncidents(hours: number): Promise<KpiAlertEvent[]> {
  const cutoff = new Date(Date.now() - hours * 3600000).toISOString();
  
  const snapshot = await db.collection('kpiAlertEvents')
    .where('triggeredAt', '>=', cutoff)
    .orderBy('triggeredAt', 'desc')
    .limit(50)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as KpiAlertEvent);
}

/**
 * Get alerts for specific region
 */
async function getAlertsForRegion(regionId: string): Promise<KpiAlertEvent[]> {
  const snapshot = await db.collection('kpiAlertEvents')
    .where('regionId', '==', regionId)
    .where('resolvedAt', '==', null)
    .orderBy('triggeredAt', 'desc')
    .limit(20)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as KpiAlertEvent);
}

/**
 * Fetch segment-specific metrics
 */
async function fetchSegmentMetrics(segmentKey: string, timeRange: KpiTimeRange, regionId?: string): Promise<KpiMetric[]> {
  // In production, this would query PACK 410 with segment filters
  // Stub for now
  return await fetchAllMetrics(timeRange, regionId);
}

/**
 * Get display name for segment
 */
function getSegmentDisplayName(segmentKey: string): string {
  const displayNames: Record<string, string> = {
    'NEW_USERS': 'New Users',
    'PAYING_USERS': 'Paying Users',
    'POWER_USERS': 'Power Users',
    'AT_RISK': 'At-Risk Users',
    'EE_CENTRAL_NEW_USERS': 'EE Central - New Users',
  };
  return displayNames[segmentKey] || segmentKey;
}

/**
 * Send alert notification via PACK 293
 */
async function sendAlertNotification(alert: KpiAlertEvent, channel: string): Promise<void> {
  // Integrate with PACK 293 notification system
  await db.collection('notifications').add({
    type: 'KPI_ALERT',
    channel,
    severity: alert.severity,
    title: `KPI Alert: ${alert.metricId}`,
    body: `Metric ${alert.metricId} exceeded threshold. Current: ${alert.currentValue}, Threshold: ${alert.thresholdValue}`,
    data: alert,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Log alert to audit system (PACK 296)
 */
async function logAlertToAudit(alert: KpiAlertEvent, rule: KpiAlertRule): Promise<void> {
  await db.collection('auditLogs').add({
    action: 'KPI_ALERT_TRIGGERED',
    actorId: 'SYSTEM',
    actorType: 'SYSTEM',
    resource: 'KPI_ALERT',
    resourceId: alert.id,
    details: {
      alertEvent: alert,
      rule: rule,
    },
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Propose panic mode activation (does not auto-activate)
 */
async function proposePanicModeActivation(modeId: string, triggeringAlert: KpiAlertEvent): Promise<void> {
  // Create proposal for admin review
  const proposalId = db.collection('panicModeProposals').doc().id;
  
  await db.collection('panicModeProposals').doc(proposalId).set({
    id: proposalId,
    modeId,
    proposedAt: new Date().toISOString(),
    proposedBy: 'SYSTEM',
    reason: `Critical alert triggered: ${triggeringAlert.metricId} exceeded threshold`,
    triggeringAlerts: [triggeringAlert.id],
    autoApprove: false, // Always requires manual approval
    expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour TTL
    status: 'PENDING',
  });

  // Notify admins
  await db.collection('notifications').add({
    type: 'PANIC_MODE_PROPOSAL',
    channel: 'admin-launch-control',
    severity: 'CRITICAL',
    title: `Panic Mode Proposed: ${modeId}`,
    body: `System recommends activating ${modeId} due to critical alert.`,
    data: { proposalId, modeId, triggeringAlert },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Check if user is admin or service account
 */
async function isAdminOrService(uid: string): Promise<boolean> {
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();
    return userData?.role === 'ADMIN' || userData?.role === 'SERVICE';
  } catch {
    return false;
  }
}
