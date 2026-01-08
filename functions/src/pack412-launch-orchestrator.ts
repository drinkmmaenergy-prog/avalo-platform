/**
 * PACK 412 — Launch Control Room & Market Expansion Orchestration
 * Backend functions for regional launch management
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import type {
  LaunchRegionConfig,
  LaunchGuardrailThresholds,
  LaunchGuardrailViolation,
  LaunchEvent,
  LaunchRegionStats,
  LaunchReadinessSummary,
  LaunchDependencyCheck,
  MarketExpansionProposal,
  LaunchStage,
} from '../../shared/types/pack412-launch';

const db = admin.firestore();

// ========================================
// DEPENDENCY CHECKS
// ========================================

/**
 * Check if store is available (PACK 367/411)
 */
async function checkStoreAvailability(regionId: string): Promise<LaunchDependencyCheck> {
  try {
    const storeDoc = await db.collection('storePresence').doc(regionId).get();
    const passed = storeDoc.exists && storeDoc.data()?.isAvailable === true;
    
    return {
      checkName: 'store_availability',
      passed,
      message: passed
        ? 'Store is available in region'
        : 'Store not yet available in region',
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      checkName: 'store_availability',
      passed: false,
      message: `Error checking store: ${error}`,
      checkedAt: new Date().toISOString(),
    };
  }
}

/**
 * Check support coverage (PACK 300A)
 */
async function checkSupportCoverage(regionId: string, countries: string[]): Promise<LaunchDependencyCheck> {
  try {
    // Check if we have support admins assigned to languages spoken in this region
    const supportQuery = await db.collection('supportAgents')
      .where('assignedCountries', 'array-contains-any', countries.slice(0, 10))
      .where('isActive', '==', true)
      .limit(1)
      .get();
    
    const passed = !supportQuery.empty;
    
    return {
      checkName: 'support_coverage',
      passed,
      message: passed
        ? `Support coverage available for region (${supportQuery.size} agents)`
        : 'No support agents assigned to region languages',
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      checkName: 'support_coverage',
      passed: false,
      message: `Error checking support: ${error}`,
      checkedAt: new Date().toISOString(),
    };
  }
}

/**
 * Check safety readiness (PACK 302)
 */
async function checkSafetyReadiness(regionId: string, countries: string[]): Promise<LaunchDependencyCheck> {
  try {
    // Check if fraud detectors are active for this region
    const fraudConfigDoc = await db.collection('fraudDetectionConfig').doc('global').get();
    const fraudConfig = fraudConfigDoc.data();
    
    const hasDetectors = fraudConfig?.enabledRegions?.some((r: string) => 
      r === regionId || countries.includes(r)
    );
    
    return {
      checkName: 'safety_readiness',
      passed: hasDetectors ?? false,
      message: hasDetectors
        ? 'Safety detectors active for region'
        : 'Safety detectors not configured for region',
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      checkName: 'safety_readiness',
      passed: false,
      message: `Error checking safety: ${error}`,
      checkedAt: new Date().toISOString(),
    };
  }
}

/**
 * Check wallet & payments (PACK 277/255)
 */
async function checkPaymentsEnabled(regionId: string, countries: string[]): Promise<LaunchDependencyCheck> {
  try {
    // Check if Stripe is enabled for these countries
    const paymentsDoc = await db.collection('paymentsConfig').doc('stripe').get();
    const paymentsData = paymentsDoc.data();
    
    const allCountriesSupported = countries.every((country) =>
      paymentsData?.enabledCountries?.includes(country)
    );
    
    return {
      checkName: 'payments_enabled',
      passed: allCountriesSupported,
      message: allCountriesSupported
        ? 'Payments enabled for all countries'
        : 'Some countries lack payment support',
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      checkName: 'payments_enabled',
      passed: false,
      message: `Error checking payments: ${error}`,
      checkedAt: new Date().toISOString(),
    };
  }
}

/**
 * Check legal config & KYC readiness
 */
async function checkLegalReadiness(regionId: string, countries: string[]): Promise<LaunchDependencyCheck> {
  try {
    // Check if we have legal terms and privacy policy for this region
    const legalDoc = await db.collection('legalConfig').doc(regionId).get();
    const legalData = legalDoc.data();
    
    const hasTerms = legalData?.termsVersion && legalData?.privacyPolicyVersion;
    
    return {
      checkName: 'legal_readiness',
      passed: hasTerms ?? false,
      message: hasTerms
        ? 'Legal documents configured'
        : 'Missing legal documents for region',
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      checkName: 'legal_readiness',
      passed: false,
      message: `Error checking legal: ${error}`,
      checkedAt: new Date().toISOString(),
    };
  }
}

/**
 * Compute all region dependencies
 */
export async function computeRegionDependenciesOk(regionId: string, countries: string[]): Promise<boolean> {
  const checks = await Promise.all([
    checkStoreAvailability(regionId),
    checkSupportCoverage(regionId, countries),
    checkSafetyReadiness(regionId, countries),
    checkPaymentsEnabled(regionId, countries),
    checkLegalReadiness(regionId, countries),
  ]);
  
  return checks.every((check) => check.passed);
}

/**
 * Get detailed readiness summary
 */
export async function getRegionReadinessSummary(regionId: string, countries: string[]): Promise<LaunchReadinessSummary> {
  const checks = await Promise.all([
    checkStoreAvailability(regionId),
    checkSupportCoverage(regionId, countries),
    checkSafetyReadiness(regionId, countries),
    checkPaymentsEnabled(regionId, countries),
    checkLegalReadiness(regionId, countries),
  ]);
  
  const blockers = checks.filter((c) => !c.passed).map((c) => c.message);
  const isReady = checks.every((c) => c.passed);
  
  return {
    regionId,
    isReady,
    checks,
    blockers,
    warnings: [],
    generatedAt: new Date().toISOString(),
  };
}

// ========================================
// GUARDRAIL MONITORING
// ========================================

/**
 * Get current region stats from PACK 410 analytics
 */
async function getCurrentRegionStats(regionId: string): Promise<Partial<LaunchRegionStats>> {
  try {
    // Query analytics from PACK 410
    const analyticsDoc = await db.collection('pack410Analytics')
      .where('regionId', '==', regionId)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();
    
    if (analyticsDoc.empty) {
      return {};
    }
    
    const data = analyticsDoc.docs[0].data();
    
    // Query crash rate
    const crashDoc = await db.collection('crashReports')
      .where('regionId', '==', regionId)
      .where('timestamp', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
      .count()
      .get();
    
    // Query payment errors
    const paymentErrorDoc = await db.collection('paymentErrors')
      .where('regionId', '==', regionId)
      .where('timestamp', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
      .count()
      .get();
    
    // Query safety incidents (PACK 302)
    const safetyDoc = await db.collection('safetyIncidents')
      .where('regionId', '==', regionId)
      .where('timestamp', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
      .count()
      .get();
    
    // Query 1-star reviews (PACK 411)
    const reviewsDoc = await db.collection('storeReviews')
      .where('regionId', '==', regionId)
      .where('rating', '==', 1)
      .where('timestamp', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
      .count()
      .get();
    
    // Query support backlog (PACK 300A)
    const supportDoc = await db.collection('supportTickets')
      .where('regionId', '==', regionId)
      .where('status', '==', 'open')
      .count()
      .get();
    
    const dau = data.dau || 0;
    const totalReviews = data.totalReviews || 1;
    
    return {
      regionId,
      snapshotAt: new Date().toISOString(),
      dau: dau,
      mau: data.mau || 0,
      newRegistrations24h: data.newRegistrations24h || 0,
      firstChatConversion: data.firstChatConversion || 0,
      firstBookingConversion: data.firstBookingConversion || 0,
      crashRate: dau > 0 ? (crashDoc.data().count / dau) * 100 : 0,
      paymentErrorRate: dau > 0 ? (paymentErrorDoc.data().count / dau) * 100 : 0,
      safetyIncidentsPer1k: dau > 0 ? (safetyDoc.data().count / dau) * 1000 : 0,
      oneStarShare: (reviewsDoc.data().count / totalReviews) * 100,
      avgRating: data.avgRating || 0,
      supportBacklog: supportDoc.data().count,
      avgResponseTimeMin: data.avgResponseTimeMin || 0,
      riskScore: data.riskScore || 0,
    };
  } catch (error) {
    console.error(`Error getting region stats for ${regionId}:`, error);
    return {};
  }
}

/**
 * Check guardrails for a region
 */
async function checkGuardrails(
  regionId: string,
  thresholds: LaunchGuardrailThresholds,
  stats: Partial<LaunchRegionStats>
): Promise<LaunchGuardrailViolation[]> {
  const violations: LaunchGuardrailViolation[] = [];
  const now = new Date().toISOString();
  
  // Check crash rate
  if (stats.crashRate && stats.crashRate > thresholds.crashRateMax) {
    violations.push({
      id: `${regionId}_crash_${Date.now()}`,
      regionId,
      thresholdId: thresholds.id,
      metricName: 'crashRate',
      measuredValue: stats.crashRate,
      thresholdValue: thresholds.crashRateMax,
      severity: stats.crashRate > thresholds.crashRateMax * 2 ? 'CRITICAL' : 'WARNING',
      actionTaken: 'pending',
      autoResolve: true,
      createdAt: now,
    });
  }
  
  // Check payment error rate
  if (stats.paymentErrorRate && stats.paymentErrorRate > thresholds.paymentErrorRateMax) {
    violations.push({
      id: `${regionId}_payment_${Date.now()}`,
      regionId,
      thresholdId: thresholds.id,
      metricName: 'paymentErrorRate',
      measuredValue: stats.paymentErrorRate,
      thresholdValue: thresholds.paymentErrorRateMax,
      severity: stats.paymentErrorRate > thresholds.paymentErrorRateMax * 2 ? 'CRITICAL' : 'WARNING',
      actionTaken: 'pending',
      autoResolve: true,
      createdAt: now,
    });
  }
  
  // Check safety incidents
  if (stats.safetyIncidentsPer1k && stats.safetyIncidentsPer1k > thresholds.safetyIncidentRateMax) {
    violations.push({
      id: `${regionId}_safety_${Date.now()}`,
      regionId,
      thresholdId: thresholds.id,
      metricName: 'safetyIncidentsPer1k',
      measuredValue: stats.safetyIncidentsPer1k,
      thresholdValue: thresholds.safetyIncidentRateMax,
      severity: 'CRITICAL',
      actionTaken: 'pending',
      autoResolve: false,
      createdAt: now,
    });
  }
  
  // Check 1-star reviews
  if (stats.oneStarShare && stats.oneStarShare > thresholds.oneStarShareMax) {
    violations.push({
      id: `${regionId}_rating_${Date.now()}`,
      regionId,
      thresholdId: thresholds.id,
      metricName: 'oneStarShare',
      measuredValue: stats.oneStarShare,
      thresholdValue: thresholds.oneStarShareMax,
      severity: 'WARNING',
      actionTaken: 'pending',
      autoResolve: true,
      createdAt: now,
    });
  }
  
  // Check support backlog
  if (stats.supportBacklog && stats.supportBacklog > thresholds.supportBacklogMax) {
    violations.push({
      id: `${regionId}_support_${Date.now()}`,
      regionId,
      thresholdId: thresholds.id,
      metricName: 'supportBacklog',
      measuredValue: stats.supportBacklog,
      thresholdValue: thresholds.supportBacklogMax,
      severity: 'WARNING',
      actionTaken: 'pending',
      autoResolve: true,
      createdAt: now,
    });
  }
  
  // Check aggregated risk score
  if (stats.riskScore && stats.riskScore > thresholds.riskScoreMax) {
    violations.push({
      id: `${regionId}_risk_${Date.now()}`,
      regionId,
      thresholdId: thresholds.id,
      metricName: 'riskScore',
      measuredValue: stats.riskScore,
      thresholdValue: thresholds.riskScoreMax,
      severity: 'CRITICAL',
      actionTaken: 'pending',
      autoResolve: false,
      createdAt: now,
    });
  }
  
  return violations;
}

/**
 * Handle guardrail violation - reduce traffic or pause
 */
async function handleGuardrailViolation(
  regionDoc: admin.firestore.DocumentReference,
  region: LaunchRegionConfig,
  violations: LaunchGuardrailViolation[]
): Promise<void> {
  const hasCritical = violations.some((v) => v.severity === 'CRITICAL');
  const now = new Date().toISOString();
  
  if (hasCritical) {
    // Critical: pause region immediately
    await regionDoc.update({
      stage: 'PAUSED',
      lastStageChangeAt: now,
      lastStageChangeReason: `Auto-paused due to critical violations: ${violations.map((v) => v.metricName).join(', ')}`,
      lastStageChangeBy: 'SYSTEM',
      updatedAt: now,
    });
    
    // Log event
    await db.collection('launchEvents').add({
      regionId: region.id,
      eventType: 'STAGE_CHANGE',
      description: `Region auto-paused due to critical guardrail violations`,
      metadata: { violations },
      createdAt: now,
    });
    
    // Send admin notification (PACK 293)
    await db.collection('notifications').add({
      type: 'LAUNCH_CRITICAL_VIOLATION',
      severity: 'CRITICAL',
      title: `Region ${region.id} Auto-Paused`,
      body: `Critical guardrail violations detected: ${violations.map((v) => v.metricName).join(', ')}`,
      targetAudience: 'ADMINS',
      createdAt: now,
    });
    
    // Update violations with action taken
    for (const violation of violations) {
      violation.actionTaken = 'region_paused';
      await db.collection('launchGuardrailViolations').doc(violation.id).set(violation);
    }
  } else {
    // Warning: reduce traffic cap by 50%
    const newCap = Math.max(10, Math.floor(region.currentTrafficCapPct * 0.5));
    
    await regionDoc.update({
      currentTrafficCapPct: newCap,
      updatedAt: now,
    });
    
    // Log event
    await db.collection('launchEvents').add({
      regionId: region.id,
      eventType: 'TRAFFIC_CAP_CHANGE',
      description: `Traffic cap reduced from ${region.currentTrafficCapPct}% to ${newCap}% due to guardrail warnings`,
      metadata: { violations, oldCap: region.currentTrafficCapPct, newCap },
      createdAt: now,
    });
    
    // Send admin notification
    await db.collection('notifications').add({
      type: 'LAUNCH_WARNING_VIOLATION',
      severity: 'WARNING',
      title: `Region ${region.id} Traffic Reduced`,
      body: `Traffic cap reduced to ${newCap}% due to warnings: ${violations.map((v) => v.metricName).join(', ')}`,
      targetAudience: 'ADMINS',
      createdAt: now,
    });
    
    // Update violations with action taken
    for (const violation of violations) {
      violation.actionTaken = `traffic_reduced_to_${newCap}`;
      await db.collection('launchGuardrailViolations').doc(violation.id).set(violation);
    }
  }
  
  // Create audit log (PACK 296)
  await db.collection('auditLogs').add({
    action: 'LAUNCH_GUARDRAIL_VIOLATION',
    actor: 'SYSTEM',
    resourceType: 'LaunchRegion',
    resourceId: region.id,
    metadata: {
      violations,
      stage: region.stage,
      newStage: hasCritical ? 'PAUSED' : region.stage,
      trafficCap: region.currentTrafficCapPct,
      newTrafficCap: hasCritical ? region.currentTrafficCapPct : Math.max(10, Math.floor(region.currentTrafficCapPct * 0.5)),
    },
    timestamp: now,
  });
}

// ========================================
// CLOUD FUNCTIONS
// ========================================

/**
 * Create or update region config
 */
export const pack412_createOrUpdateRegionConfig = functions.https.onCall(async (data, context) => {
  // Check admin auth
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  const { regionConfig } = data as { regionConfig: Partial<LaunchRegionConfig> };
  
  if (!regionConfig.id) {
    throw new functions.https.HttpsError('invalid-argument', 'Region ID required');
  }
  
  const now = new Date().toISOString();
  const regionRef = db.collection('launchRegions').doc(regionConfig.id);
  const existing = await regionRef.get();
  
  if (existing.exists) {
    // Update existing
    const updates: Partial<LaunchRegionConfig> = {
      ...regionConfig,
      updatedAt: now,
    };
    
    // Recompute dependencies if countries changed
    if (regionConfig.countries) {
      updates.dependenciesOk = await computeRegionDependenciesOk(regionConfig.id, regionConfig.countries);
    }
    
    await regionRef.update(updates);
    
    // Log event
    await db.collection('launchEvents').add({
      regionId: regionConfig.id,
      eventType: 'MANUAL_ACTION',
      description: `Region config updated`,
      actor: context.auth.uid,
      metadata: { updates },
      createdAt: now,
    });
  } else {
    // Create new
    const newRegion: LaunchRegionConfig = {
      id: regionConfig.id,
      cluster: regionConfig.cluster || 'GLOBAL_OTHER',
      countries: regionConfig.countries || [],
      stage: 'NOT_PLANNED',
      currentTrafficCapPct: 0,
      featureFlags: regionConfig.featureFlags || [],
      dependenciesOk: await computeRegionDependenciesOk(regionConfig.id, regionConfig.countries || []),
      createdAt: now,
      updatedAt: now,
      ...regionConfig,
    };
    
    await regionRef.set(newRegion);
    
    // Log event
    await db.collection('launchEvents').add({
      regionId: regionConfig.id,
      eventType: 'MANUAL_ACTION',
      description: `Region created`,
      actor: context.auth.uid,
      metadata: { region: newRegion },
      createdAt: now,
    });
  }
  
  // Create audit log
  await db.collection('auditLogs').add({
    action: existing.exists ? 'LAUNCH_REGION_UPDATED' : 'LAUNCH_REGION_CREATED',
    actor: context.auth.uid,
    resourceType: 'LaunchRegion',
    resourceId: regionConfig.id,
    metadata: { regionConfig },
    timestamp: now,
  });
  
  return { success: true, regionId: regionConfig.id };
});

/**
 * Set region stage
 */
export const pack412_setRegionStage = functions.https.onCall(async (data, context) => {
  // Check admin auth
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  const { regionId, stage, reason } = data as { regionId: string; stage: LaunchStage; reason: string };
  
  if (!regionId || !stage) {
    throw new functions.https.HttpsError('invalid-argument', 'Region ID and stage required');
  }
  
  const regionRef = db.collection('launchRegions').doc(regionId);
  const regionDoc = await regionRef.get();
  
  if (!regionDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Region not found');
  }
  
  const region = regionDoc.data() as LaunchRegionConfig;
  
  // Check dependencies for soft/full launch
  if ((stage === 'READY_FOR_SOFT' || stage === 'SOFT_LIVE' || stage === 'READY_FOR_FULL' || stage === 'FULL_LIVE') && !region.dependenciesOk) {
    throw new functions.https.HttpsError('failed-precondition', 'Dependencies not satisfied for this stage');
  }
  
  const now = new Date().toISOString();
  
  await regionRef.update({
    stage,
    lastStageChangeAt: now,
    lastStageChangeReason: reason,
    lastStageChangeBy: context.auth.uid,
    updatedAt: now,
  });
  
  // Log event
  await db.collection('launchEvents').add({
    regionId,
    eventType: 'STAGE_CHANGE',
    description: `Stage changed from ${region.stage} to ${stage}: ${reason}`,
    actor: context.auth.uid,
    metadata: { oldStage: region.stage, newStage: stage, reason },
    createdAt: now,
  });
  
  // Create audit log
  await db.collection('auditLogs').add({
    action: 'LAUNCH_STAGE_CHANGED',
    actor: context.auth.uid,
    resourceType: 'LaunchRegion',
    resourceId: regionId,
    metadata: { oldStage: region.stage, newStage: stage, reason },
    timestamp: now,
  });
  
  return { success: true, regionId, stage };
});

/**
 * Update region traffic cap
 */
export const pack412_updateRegionTrafficCap = functions.https.onCall(async (data, context) => {
  // Check admin auth
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  const { regionId, trafficCapPct } = data as { regionId: string; trafficCapPct: number };
  
  if (!regionId || trafficCapPct === undefined || trafficCapPct < 0 || trafficCapPct > 100) {
    throw new functions.https.HttpsError('invalid-argument', 'Valid region ID and traffic cap (0-100) required');
  }
  
  const regionRef = db.collection('launchRegions').doc(regionId);
  const regionDoc = await regionRef.get();
  
  if (!regionDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Region not found');
  }
  
  const region = regionDoc.data() as LaunchRegionConfig;
  const oldCap = region.currentTrafficCapPct;
  const now = new Date().toISOString();
  
  await regionRef.update({
    currentTrafficCapPct: trafficCapPct,
    updatedAt: now,
  });
  
  // Log event
  await db.collection('launchEvents').add({
    regionId,
    eventType: 'TRAFFIC_CAP_CHANGE',
    description: `Traffic cap changed from ${oldCap}% to ${trafficCapPct}%`,
    actor: context.auth.uid,
    metadata: { oldCap, newCap: trafficCapPct },
    createdAt: now,
  });
  
  // Create audit log
  await db.collection('auditLogs').add({
    action: 'LAUNCH_TRAFFIC_CAP_CHANGED',
    actor: context.auth.uid,
    resourceType: 'LaunchRegion',
    resourceId: regionId,
    metadata: { oldCap, newCap: trafficCapPct },
    timestamp: now,
  });
  
  return { success: true, regionId, trafficCapPct };
});

/**
 * Update guardrail thresholds
 */
export const pack412_updateGuardrailThresholds = functions.https.onCall(async (data, context) => {
  // Check admin auth
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  const { thresholds } = data as { thresholds: LaunchGuardrailThresholds };
  
  if (!thresholds.id) {
    throw new functions.https.HttpsError('invalid-argument', 'Threshold ID required');
  }
  
  const now = new Date().toISOString();
  const thresholdsRef = db.collection('launchGuardrailThresholds').doc(thresholds.id);
  const existing = await thresholdsRef.get();
  
  const finalThresholds: LaunchGuardrailThresholds = {
    ...thresholds,
    updatedAt: now,
    createdAt: existing.exists ? existing.data()!.createdAt : now,
  };
  
  await thresholdsRef.set(finalThresholds);
  
  // Create audit log
  await db.collection('auditLogs').add({
    action: existing.exists ? 'LAUNCH_THRESHOLDS_UPDATED' : 'LAUNCH_THRESHOLDS_CREATED',
    actor: context.auth.uid,
    resourceType: 'LaunchGuardrailThresholds',
    resourceId: thresholds.id,
    metadata: { thresholds: finalThresholds },
    timestamp: now,
  });
  
  return { success: true, thresholdId: thresholds.id };
});

/**
 * Monitor guardrails (scheduled function - runs every 15 min)
 */
export const pack412_monitorLaunchGuardrails = functions.pubsub.schedule('every 15 minutes').onRun(async (context) => {
  console.log('Starting guardrail monitoring...');
  
  // Get default thresholds
  const thresholdsDoc = await db.collection('launchGuardrailThresholds').doc('DEFAULT').get();
  if (!thresholdsDoc.exists) {
    console.log('No default thresholds found, skipping monitoring');
    return;
  }
  
  const thresholds = thresholdsDoc.data() as LaunchGuardrailThresholds;
  
  // Get all regions in SOFT_LIVE or FULL_LIVE
  const regionsSnapshot = await db.collection('launchRegions')
    .where('stage', 'in', ['SOFT_LIVE', 'FULL_LIVE'])
    .get();
  
  if (regionsSnapshot.empty) {
    console.log('No active launch regions found');
    return;
  }
  
  console.log(`Monitoring ${regionsSnapshot.size} active regions`);
  
  for (const regionDoc of regionsSnapshot.docs) {
    const region = regionDoc.data() as LaunchRegionConfig;
    console.log(`Checking region: ${region.id}`);
    
    // Get current stats
    const stats = await getCurrentRegionStats(region.id);
    
    // Save stats snapshot
    await db.collection('launchRegionStats').add(stats);
    
    // Check guardrails
    const violations = await checkGuardrails(region.id, thresholds, stats);
    
    if (violations.length > 0) {
      console.log(`Found ${violations.length} violations for region ${region.id}`);
      
      // Handle violations
      await handleGuardrailViolation(regionDoc.ref, region, violations);
      
      // Log guardrail event
      await db.collection('launchEvents').add({
        regionId: region.id,
        eventType: 'GUARDRAIL_VIOLATION',
        description: `Guardrail violations detected: ${violations.map((v) => v.metricName).join(', ')}`,
        metadata: { violations, stats },
        createdAt: new Date().toISOString(),
      });
    }
  }
  
  console.log('Guardrail monitoring completed');
});

/**
 * Propose next launch regions
 */
export const pack412_proposeNextLaunchRegions = functions.https.onCall(async (data, context) => {
  // Check admin auth
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  // Get current soft live regions count
  const softLiveSnapshot = await db.collection('launchRegions')
    .where('stage', '==', 'SOFT_LIVE')
    .get();
  
  const maxConcurrentSoftLive = 3; // Don't launch more than 3 regions at once
  
  if (softLiveSnapshot.size >= maxConcurrentSoftLive) {
    return {
      proposals: [],
      message: `Already at max concurrent soft launches (${maxConcurrentSoftLive})`,
    };
  }
  
  // Get ready regions from Eastern Europe
  const readyRegions = await db.collection('launchRegions')
    .where('stage', '==', 'READY_FOR_SOFT')
    .where('cluster', 'in', ['EE_CENTRAL', 'EE_NORTH', 'EE_SOUTH'])
    .orderBy('updatedAt', 'asc')
    .limit(maxConcurrentSoftLive - softLiveSnapshot.size)
    .get();
  
  const proposals: MarketExpansionProposal = {
    id: `proposal_${Date.now()}`,
    proposedRegions: readyRegions.docs.map((doc) => doc.id),
    rationale: 'Eastern Europe focus strategy - prioritize ready regions from EE clusters',
    priority: 1,
    estimatedReadiness: new Date().toISOString(),
    dependencies: [],
    generatedAt: new Date().toISOString(),
  };
  
  // Save proposal
  await db.collection('marketExpansionProposals').add(proposals);
  
  return { proposals: [proposals] };
});

/**
 * Get region launch stage for user (for PACK 301 integration)
 */
export async function getRegionLaunchStageForUser(userId: string): Promise<LaunchStage> {
  try {
    // Get user's region from profile
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (!userData || !userData.countryCode) {
      return 'FULL_LIVE'; // Default for users without region
    }
    
    // Find region containing this country
    const regionsSnapshot = await db.collection('launchRegions')
      .where('countries', 'array-contains', userData.countryCode)
      .limit(1)
      .get();
    
    if (regionsSnapshot.empty) {
      return 'FULL_LIVE'; // Default for regions not in launch system
    }
    
    const region = regionsSnapshot.docs[0].data() as LaunchRegionConfig;
    return region.stage;
  } catch (error) {
    console.error('Error getting region launch stage:', error);
    return 'FULL_LIVE'; // Fail open
  }
}
