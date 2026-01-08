/**
 * PACK 398 - PUBLIC LAUNCH ORCHESTRATOR
 * 
 * Controls country-by-country rollouts with budget management,
 * store visibility flags, and feature-gate activation.
 * 
 * Depends on:
 * - PACK 302 (Fraud Detection)
 * - PACK 301 (Growth & Retention)
 * - PACK 397 (App Store Defense)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Launch States
export enum LaunchState {
  PREP = 'PREP',
  SOFT_LAUNCH = 'SOFT_LAUNCH',
  GROWTH = 'GROWTH',
  SCALING = 'SCALING',
  MAX_EXPOSURE = 'MAX_EXPOSURE',
}

// Country Rollout Config
export interface CountryRolloutConfig {
  countryCode: string;
  state: LaunchState;
  budgetLimitDaily: number;
  budgetSpentToday: number;
  storeVisible: boolean;
  featureGates: {
    [featureName: string]: boolean;
  };
  targetInstallsPerDay: number;
  maxCAC: number;
  minRetentionDay1: number;
  minRetentionDay7: number;
  unlockDate: admin.firestore.Timestamp;
  lastStateChange: admin.firestore.Timestamp;
  fraudRiskLevel: 'low' | 'medium' | 'high';
  churnRiskLevel: 'low' | 'medium' | 'high';
  reviewRiskLevel: 'low' | 'medium' | 'high';
  autoScalingEnabled: boolean;
}

// Launch Control Document
export interface LaunchControl {
  globalState: LaunchState;
  automationEnabled: boolean;
  emergencyStop: boolean;
  countries: {
    [countryCode: string]: CountryRolloutConfig;
  };
  globalBudgetDaily: number;
  globalBudgetSpentToday: number;
  lastBudgetReset: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  updatedBy: string;
}

// Launch Event
export interface LaunchEvent {
  eventType: 'STATE_CHANGE' | 'BUDGET_THRESHOLD' | 'FRAUD_ALERT' | 'CHURN_SPIKE' | 'REVIEW_RISK' | 'EMERGENCY_STOP';
  countryCode?: string;
  previousState?: LaunchState;
  newState?: LaunchState;
  reason: string;
  metrics?: any;
  timestamp: admin.firestore.Timestamp;
  severity: 'info' | 'warning' | 'critical';
}

const db = admin.firestore();

/**
 * Initialize launch control document
 */
export const initializeLaunchControl = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const launchControl: LaunchControl = {
    globalState: LaunchState.PREP,
    automationEnabled: false,
    emergencyStop: false,
    countries: {},
    globalBudgetDaily: 0,
    globalBudgetSpentToday: 0,
    lastBudgetReset: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
    updatedBy: context.auth.uid,
  };

  await db.collection('launch_control').doc('global').set(launchControl);

  return { success: true, message: 'Launch control initialized' };
});

/**
 * Add or update country rollout config
 */
export const configureCountryRollout = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { countryCode, config } = data;

  if (!countryCode || !config) {
    throw new functions.https.HttpsError('invalid-argument', 'Country code and config required');
  }

  const countryConfig: CountryRolloutConfig = {
    countryCode,
    state: config.state || LaunchState.PREP,
    budgetLimitDaily: config.budgetLimitDaily || 0,
    budgetSpentToday: 0,
    storeVisible: config.storeVisible !== undefined ? config.storeVisible : false,
    featureGates: config.featureGates || {},
    targetInstallsPerDay: config.targetInstallsPerDay || 100,
    maxCAC: config.maxCAC || 50,
    minRetentionDay1: config.minRetentionDay1 || 0.4,
    minRetentionDay7: config.minRetentionDay7 || 0.2,
    unlockDate: config.unlockDate || admin.firestore.Timestamp.now(),
    lastStateChange: admin.firestore.Timestamp.now(),
    fraudRiskLevel: 'low',
    churnRiskLevel: 'low',
    reviewRiskLevel: 'low',
    autoScalingEnabled: config.autoScalingEnabled !== undefined ? config.autoScalingEnabled : true,
  };

  await db.collection('launch_control').doc('global').update({
    [`countries.${countryCode}`]: countryConfig,
    updatedAt: admin.firestore.Timestamp.now(),
    updatedBy: context.auth.uid,
  });

  // Log event
  await logLaunchEvent({
    eventType: 'STATE_CHANGE',
    countryCode,
    newState: countryConfig.state,
    reason: 'Manual configuration update',
    timestamp: admin.firestore.Timestamp.now(),
    severity: 'info',
  });

  return { success: true, message: `Country ${countryCode} configured` };
});

/**
 * Update launch state for a country
 */
export const updateCountryState = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { countryCode, newState, reason } = data;

  if (!countryCode || !newState) {
    throw new functions.https.HttpsError('invalid-argument', 'Country code and new state required');
  }

  const launchControlRef = db.collection('launch_control').doc('global');
  const launchControlDoc = await launchControlRef.get();
  const launchControl = launchControlDoc.data() as LaunchControl;

  const currentConfig = launchControl.countries[countryCode];
  if (!currentConfig) {
    throw new functions.https.HttpsError('not-found', `Country ${countryCode} not configured`);
  }

  const previousState = currentConfig.state;

  await launchControlRef.update({
    [`countries.${countryCode}.state`]: newState,
    [`countries.${countryCode}.lastStateChange`]: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
    updatedBy: context.auth.uid,
  });

  // Log event
  await logLaunchEvent({
    eventType: 'STATE_CHANGE',
    countryCode,
    previousState,
    newState,
    reason: reason || 'Manual state change',
    timestamp: admin.firestore.Timestamp.now(),
    severity: 'info',
  });

  return { success: true, message: `Country ${countryCode} state updated to ${newState}` };
});

/**
 * Emergency stop - halt all launches
 */
export const emergencyStopLaunch = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { reason } = data;

  await db.collection('launch_control').doc('global').update({
    emergencyStop: true,
    automationEnabled: false,
    updatedAt: admin.firestore.Timestamp.now(),
    updatedBy: context.auth.uid,
  });

  // Log critical event
  await logLaunchEvent({
    eventType: 'EMERGENCY_STOP',
    reason: reason || 'Manual emergency stop',
    timestamp: admin.firestore.Timestamp.now(),
    severity: 'critical',
  });

  return { success: true, message: 'Emergency stop activated' };
});

/**
 * Resume from emergency stop
 */
export const resumeLaunch = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  await db.collection('launch_control').doc('global').update({
    emergencyStop: false,
    updatedAt: admin.firestore.Timestamp.now(),
    updatedBy: context.auth.uid,
  });

  await logLaunchEvent({
    eventType: 'STATE_CHANGE',
    reason: 'Launch resumed from emergency stop',
    timestamp: admin.firestore.Timestamp.now(),
    severity: 'info',
  });

  return { success: true, message: 'Launch resumed' };
});

/**
 * Monitor fraud, churn, and review signals - Auto-adjust states
 */
export const monitorLaunchHealth = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
  const launchControlRef = db.collection('launch_control').doc('global');
  const launchControlDoc = await launchControlRef.get();
  
  if (!launchControlDoc.exists) {
    return null;
  }

  const launchControl = launchControlDoc.data() as LaunchControl;

  if (launchControl.emergencyStop || !launchControl.automationEnabled) {
    return null;
  }

  // Check each country
  for (const [countryCode, config] of Object.entries(launchControl.countries)) {
    if (!config.autoScalingEnabled) {
      continue;
    }

    // Check fraud signals from PACK 302
    const fraudRisk = await checkFraudSignals(countryCode);
    
    // Check churn signals from PACK 301
    const churnRisk = await checkChurnSignals(countryCode);
    
    // Check review risk from PACK 397
    const reviewRisk = await checkReviewRisk(countryCode);

    // Update risk levels
    await launchControlRef.update({
      [`countries.${countryCode}.fraudRiskLevel`]: fraudRisk,
      [`countries.${countryCode}.churnRiskLevel`]: churnRisk,
      [`countries.${countryCode}.reviewRiskLevel`]: reviewRisk,
    });

    // Auto-adjust state based on risks
    if (fraudRisk === 'high' || churnRisk === 'high' || reviewRisk === 'high') {
      await downgradeCountryState(countryCode, config, {
        fraudRisk,
        churnRisk,
        reviewRisk,
      });
    } else if (fraudRisk === 'low' && churnRisk === 'low' && reviewRisk === 'low') {
      await upgradeCountryState(countryCode, config);
    }
  }

  return null;
});

/**
 * Reset daily budgets at midnight UTC
 */
export const resetDailyBudgets = functions.pubsub.schedule('0 0 * * *').timeZone('UTC').onRun(async (context) => {
  const launchControlRef = db.collection('launch_control').doc('global');
  const launchControlDoc = await launchControlRef.get();
  
  if (!launchControlDoc.exists) {
    return null;
  }

  const launchControl = launchControlDoc.data() as LaunchControl;

  const updates: any = {
    globalBudgetSpentToday: 0,
    lastBudgetReset: admin.firestore.Timestamp.now(),
  };

  // Reset each country budget
  for (const countryCode of Object.keys(launchControl.countries)) {
    updates[`countries.${countryCode}.budgetSpentToday`] = 0;
  }

  await launchControlRef.update(updates);

  return null;
});

/**
 * Check fraud signals from PACK 302
 */
async function checkFraudSignals(countryCode: string): Promise<'low' | 'medium' | 'high'> {
  const fraudStatsQuery = await db.collection('fraud_detection_stats')
    .where('countryCode', '==', countryCode)
    .where('timestamp', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
    .get();

  if (fraudStatsQuery.empty) {
    return 'low';
  }

  let totalFraudScore = 0;
  let count = 0;

  fraudStatsQuery.forEach(doc => {
    const data = doc.data();
    totalFraudScore += data.fraudScore || 0;
    count++;
  });

  const avgFraudScore = totalFraudScore / count;

  if (avgFraudScore > 0.7) return 'high';
  if (avgFraudScore > 0.4) return 'medium';
  return 'low';
}

/**
 * Check churn signals from PACK 301
 */
async function checkChurnSignals(countryCode: string): Promise<'low' | 'medium' | 'high'> {
  const churnStatsQuery = await db.collection('retention_metrics')
    .where('countryCode', '==', countryCode)
    .where('timestamp', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();

  if (churnStatsQuery.empty) {
    return 'low';
  }

  const churnData = churnStatsQuery.docs[0].data();
  const day1Retention = churnData.retentionDay1 || 0;
  const day7Retention = churnData.retentionDay7 || 0;

  if (day1Retention < 0.3 || day7Retention < 0.15) return 'high';
  if (day1Retention < 0.4 || day7Retention < 0.2) return 'medium';
  return 'low';
}

/**
 * Check review risk from PACK 397
 */
async function checkReviewRisk(countryCode: string): Promise<'low' | 'medium' | 'high'> {
  const reviewStatsQuery = await db.collection('review_risk_scores')
    .where('countryCode', '==', countryCode)
    .where('timestamp', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();

  if (reviewStatsQuery.empty) {
    return 'low';
  }

  const reviewData = reviewStatsQuery.docs[0].data();
  const riskLevel = reviewData.riskLevel || 'low';

  return riskLevel as 'low' | 'medium' | 'high';
}

/**
 * Downgrade country state due to risks
 */
async function downgradeCountryState(
  countryCode: string,
  config: CountryRolloutConfig,
  risks: { fraudRisk: string; churnRisk: string; reviewRisk: string }
) {
  const reason = `Auto-downgrade: Fraud=${risks.fraudRisk}, Churn=${risks.churnRisk}, Review=${risks.reviewRisk}`;

  let newState = config.state;

  switch (config.state) {
    case LaunchState.MAX_EXPOSURE:
      newState = LaunchState.SCALING;
      break;
    case LaunchState.SCALING:
      newState = LaunchState.GROWTH;
      break;
    case LaunchState.GROWTH:
      newState = LaunchState.SOFT_LAUNCH;
      break;
    case LaunchState.SOFT_LAUNCH:
      newState = LaunchState.PREP;
      break;
  }

  if (newState !== config.state) {
    await db.collection('launch_control').doc('global').update({
      [`countries.${countryCode}.state`]: newState,
      [`countries.${countryCode}.lastStateChange`]: admin.firestore.Timestamp.now(),
    });

    await logLaunchEvent({
      eventType: 'STATE_CHANGE',
      countryCode,
      previousState: config.state,
      newState,
      reason,
      metrics: risks,
      timestamp: admin.firestore.Timestamp.now(),
      severity: 'warning',
    });
  }
}

/**
 * Upgrade country state when metrics are good
 */
async function upgradeCountryState(countryCode: string, config: CountryRolloutConfig) {
  let newState = config.state;

  switch (config.state) {
    case LaunchState.PREP:
      newState = LaunchState.SOFT_LAUNCH;
      break;
    case LaunchState.SOFT_LAUNCH:
      newState = LaunchState.GROWTH;
      break;
    case LaunchState.GROWTH:
      newState = LaunchState.SCALING;
      break;
    case LaunchState.SCALING:
      newState = LaunchState.MAX_EXPOSURE;
      break;
  }

  if (newState !== config.state) {
    await db.collection('launch_control').doc('global').update({
      [`countries.${countryCode}.state`]: newState,
      [`countries.${countryCode}.lastStateChange`]: admin.firestore.Timestamp.now(),
    });

    await logLaunchEvent({
      eventType: 'STATE_CHANGE',
      countryCode,
      previousState: config.state,
      newState,
      reason: 'Auto-upgrade: All metrics healthy',
      timestamp: admin.firestore.Timestamp.now(),
      severity: 'info',
    });
  }
}

/**
 * Log launch event
 */
async function logLaunchEvent(event: LaunchEvent) {
  await db.collection('launch_events').add(event);
}

/**
 * Get launch status
 */
export const getLaunchStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const launchControlDoc = await db.collection('launch_control').doc('global').get();
  
  if (!launchControlDoc.exists) {
    return { error: 'Launch control not initialized' };
  }

  const recentEvents = await db.collection('launch_events')
    .orderBy('timestamp', 'desc')
    .limit(50)
    .get();

  return {
    control: launchControlDoc.data(),
    recentEvents: recentEvents.docs.map(doc => ({ id: doc.id, ...doc.data() })),
  };
});
