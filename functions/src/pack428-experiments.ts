/**
 * PACK 428 — Experiments & A/B Testing Handler
 * 
 * Manages experiment lifecycle, variant assignment, and metrics tracking
 * 
 * Integration Points:
 * - PACK 301: Retention profiles for sticky assignments
 * - PACK 302/352: Fraud detection for auto-disable
 * - PACK 296: Audit logs for experiment changes
 */

import * as admin from 'firebase-admin';
import {
  Experiment,
  ExperimentVariant,
  ExperimentMetrics,
  AutoDisableEvent,
  MetricType
} from './pack428-flags-types';
import { autoActivateKillSwitch } from './pack428-kill-switch';

const db = admin.firestore();

/**
 * Create a new experiment
 */
export async function createExperiment(
  experiment: Omit<Experiment, 'createdAt' | 'updatedAt'>,
  variants: Array<Omit<ExperimentVariant, 'createdAt'>>
): Promise<string> {
  try {
    // Validate variants sum to 100%
    const totalPercentage = variants.reduce((sum, v) => sum + v.rolloutPercentage, 0);
    if (totalPercentage !== 100) {
      throw new Error(`Variant percentages must sum to 100, got ${totalPercentage}`);
    }

    const experimentRef = db.collection('global')
      .doc('experiments')
      .collection('active')
      .doc(experiment.experimentKey);

    // Create experiment
    await experimentRef.set({
      ...experiment,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    });

    // Create variants
    const batch = db.batch();
    for (const variant of variants) {
      const variantRef = experimentRef
        .collection('variants')
        .doc(variant.variantKey);

      batch.set(variantRef, {
        ...variant,
        createdAt: admin.firestore.Timestamp.now()
      });
    }

    await batch.commit();

    console.log(`[PACK 428] Experiment ${experiment.experimentKey} created with ${variants.length} variants`);

    // Audit log
    await db.collection('auditLogs').add({
      type: 'EXPERIMENT',
      action: 'CREATE',
      resource: 'experiment',
      resourceId: experiment.experimentKey,
      userId: experiment.createdBy,
      metadata: {
        experimentKey: experiment.experimentKey,
        variantCount: variants.length
      },
      timestamp: admin.firestore.Timestamp.now()
    });

    return experiment.experimentKey;

  } catch (error) {
    console.error('[PACK 428] Error creating experiment:', error);
    throw error;
  }
}

/**
 * Update experiment status
 */
export async function updateExperimentStatus(
  experimentKey: string,
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED',
  adminId: string
): Promise<void> {
  try {
    await db.collection('global')
      .doc('experiments')
      .collection('active')
      .doc(experimentKey)
      .update({
        status,
        updatedAt: admin.firestore.Timestamp.now()
      });

    // Audit log
    await db.collection('auditLogs').add({
      type: 'EXPERIMENT',
      action: 'UPDATE_STATUS',
      resource: 'experiment',
      resourceId: experimentKey,
      userId: adminId,
      metadata: {
        experimentKey,
        newStatus: status
      },
      timestamp: admin.firestore.Timestamp.now()
    });

  } catch (error) {
    console.error('[PACK 428] Error updating experiment status:', error);
    throw error;
  }
}

/**
 * Track experiment metric
 */
export async function trackExperimentMetric(
  experimentKey: string,
  variantKey: string,
  userId: string,
  metricType: MetricType,
  value: number = 1
): Promise<void> {
  try {
    const metricRef = db.collection('analytics')
      .doc('experiments')
      .collection('metrics')
      .doc(`${experimentKey}_${variantKey}_${metricType}`);

    await metricRef.set({
      experimentKey,
      variantKey,
      metricType,
      count: admin.firestore.FieldValue.increment(value),
      lastUpdated: admin.firestore.Timestamp.now()
    }, { merge: true });

    // Also track individual event
    await db.collection('analytics')
      .doc('experiments')
      .collection('events')
      .add({
        experimentKey,
        variantKey,
        userId,
        metricType,
        value,
        timestamp: admin.firestore.Timestamp.now()
      });

  } catch (error) {
    console.error('[PACK 428] Error tracking experiment metric:', error);
    // Non-blocking error
  }
}

/**
 * Get experiment metrics summary
 */
export async function getExperimentMetrics(
  experimentKey: string
): Promise<Record<string, ExperimentMetrics>> {
  try {
    const experimentRef = db.collection('global')
      .doc('experiments')
      .collection('active')
      .doc(experimentKey);

    const variantsSnapshot = await experimentRef
      .collection('variants')
      .get();

    const metricsMap: Record<string, ExperimentMetrics> = {};

    for (const variantDoc of variantsSnapshot.docs) {
      const variantKey = variantDoc.id;

      // Get all metrics for this variant
      const metricsSnapshot = await db.collection('analytics')
        .doc('experiments')
        .collection('metrics')
        .where('experimentKey', '==', experimentKey)
        .where('variantKey', '==', variantKey)
        .get();

      const metrics: ExperimentMetrics = {
        experimentKey,
        variantKey,
        sampleSize: 0,
        metrics: {},
        snapshotAt: admin.firestore.Timestamp.now()
      };

      for (const metricDoc of metricsSnapshot.docs) {
        const data = metricDoc.data();
        const metricType = data.metricType as MetricType;
        
        metrics.metrics[metricType] = {
          count: data.count || 0,
          rate: 0 // Calculate rate from sample size
        };
      }

      // Calculate sample size from assignments
      const assignmentsSnapshot = await db.collectionGroup('experimentAssignments')
        .where('experimentKey', '==', experimentKey)
        .where('variantKey', '==', variantKey)
        .get();

      metrics.sampleSize = assignmentsSnapshot.size;

      // Calculate rates
      for (const metricType of Object.keys(metrics.metrics) as MetricType[]) {
        if (metrics.sampleSize > 0) {
          metrics.metrics[metricType]!.rate = 
            metrics.metrics[metricType]!.count / metrics.sampleSize;
        }
      }

      metricsMap[variantKey] = metrics;
    }

    return metricsMap;

  } catch (error) {
    console.error('[PACK 428] Error getting experiment metrics:', error);
    return {};
  }
}

/**
 * Monitor experiments for fraud/crash spikes and auto-disable if needed
 * Should be called periodically by a cron job
 */
export async function monitorExperiments(): Promise<void> {
  try {
    const activeExperimentsSnapshot = await db.collection('global')
      .doc('experiments')
      .collection('active')
      .where('status', '==', 'ACTIVE')
      .get();

    for (const experimentDoc of activeExperimentsSnapshot.docs) {
      const experiment = experimentDoc.data() as Experiment;

      if (!experiment.autoDisableOnFraud && !experiment.autoDisableOnCrash) {
        continue; // Skip if auto-disable not enabled
      }

      // Check each variant
      const variantsSnapshot = await experimentDoc.ref
        .collection('variants')
        .where('enabled', '==', true)
        .get();

      for (const variantDoc of variantsSnapshot.docs) {
        const variantKey = variantDoc.id;

        // Check fraud signals (PACK 302/352 integration)
        if (experiment.autoDisableOnFraud) {
          const fraudSignals = await checkFraudSignals(
            experiment.experimentKey,
            variantKey
          );

          if (fraudSignals.hasSpike) {
            await autoDisableVariant(
              experiment.experimentKey,
              variantKey,
              'FRAUD_SPIKE',
              fraudSignals.metrics
            );
          }
        }

        // Check crash rate
        if (experiment.autoDisableOnCrash) {
          const crashMetrics = await checkCrashRate(
            experiment.experimentKey,
            variantKey
          );

          if (crashMetrics.hasSpike) {
            await autoDisableVariant(
              experiment.experimentKey,
              variantKey,
              'CRASH_RATE_SPIKE',
              crashMetrics.metrics
            );
          }
        }
      }
    }

  } catch (error) {
    console.error('[PACK 428] Error monitoring experiments:', error);
  }
}

/**
 * Check for fraud signals spike (PACK 302/352 integration)
 */
async function checkFraudSignals(
  experimentKey: string,
  variantKey: string
): Promise<{ hasSpike: boolean; metrics: Record<string, number> }> {
  try {
    // Get users assigned to this variant
    const assignmentsSnapshot = await db.collectionGroup('experimentAssignments')
      .where('experimentKey', '==', experimentKey)
      .where('variantKey', '==', variantKey)
      .get();

    const userIds = assignmentsSnapshot.docs.map(doc => doc.data().userId);

    if (userIds.length === 0) {
      return { hasSpike: false, metrics: {} };
    }

    // Check fraud signals for these users in last hour
    const oneHourAgo = admin.firestore.Timestamp.fromMillis(
      Date.now() - 60 * 60 * 1000
    );

    let fraudCount = 0;
    let spamCount = 0;
    let chargebackCount = 0;

    // Batch check fraud signals (limit to 100 users for performance)
    const sampleUserIds = userIds.slice(0, 100);

    for (const userId of sampleUserIds) {
      const fraudSnapshot = await db.collection('fraudSignals')
        .where('userId', '==', userId)
        .where('timestamp', '>', oneHourAgo)
        .get();

      for (const doc of fraudSnapshot.docs) {
        const signal = doc.data();
        if (signal.type === 'SPAM') spamCount++;
        if (signal.type === 'CHARGEBACK') chargebackCount++;
        fraudCount++;
      }
    }

    const fraudRate = fraudCount / sampleUserIds.length;
    const spamRate = spamCount / sampleUserIds.length;
    const chargebackRate = chargebackCount / sampleUserIds.length;

    // Thresholds
    const hasSpike = fraudRate > 0.1 || spamRate > 0.05 || chargebackRate > 0.02;

    return {
      hasSpike,
      metrics: {
        fraudRate,
        spamRate,
        chargebackRate,
        sampleSize: sampleUserIds.length
      }
    };

  } catch (error) {
    console.error('[PACK 428] Error checking fraud signals:', error);
    return { hasSpike: false, metrics: {} };
  }
}

/**
 * Check for crash rate spike
 */
async function checkCrashRate(
  experimentKey: string,
  variantKey: string
): Promise<{ hasSpike: boolean; metrics: Record<string, number> }> {
  try {
    // Get crash events for variant users in last hour
    const oneHourAgo = admin.firestore.Timestamp.fromMillis(
      Date.now() - 60 * 60 * 1000
    );

    const crashSnapshot = await db.collection('analytics')
      .doc('experiments')
      .collection('crashes')
      .where('experimentKey', '==', experimentKey)
      .where('variantKey', '==', variantKey)
      .where('timestamp', '>', oneHourAgo)
      .get();

    const exposureSnapshot = await db.collection('analytics')
      .doc('experiments')
      .collection('exposures')
      .where('experimentKey', '==', experimentKey)
      .where('variantKey', '==', variantKey)
      .where('timestamp', '>', oneHourAgo)
      .get();

    const crashCount = crashSnapshot.size;
    const exposureCount = exposureSnapshot.size;

    const crashRate = exposureCount > 0 ? crashCount / exposureCount : 0;

    // Threshold: 5% crash rate
    const hasSpike = crashRate > 0.05;

    return {
      hasSpike,
      metrics: {
        crashCount,
        exposureCount,
        crashRate
      }
    };

  } catch (error) {
    console.error('[PACK 428] Error checking crash rate:', error);
    return { hasSpike: false, metrics: {} };
  }
}

/**
 * Auto-disable variant due to issues
 */
async function autoDisableVariant(
  experimentKey: string,
  variantKey: string,
  reason: 'FRAUD_SPIKE' | 'CRASH_RATE_SPIKE' | 'SPAM_INCREASE' | 'CHARGEBACK_SPIKE',
  metrics: Record<string, number>
): Promise<void> {
  try {
    console.log(`[PACK 428] Auto-disabling variant ${variantKey} of experiment ${experimentKey}: ${reason}`);

    // Disable the variant
    await db.collection('global')
      .doc('experiments')
      .collection('active')
      .doc(experimentKey)
      .collection('variants')
      .doc(variantKey)
      .update({
        enabled: false,
        disabledReason: reason,
        disabledAt: admin.firestore.Timestamp.now()
      });

    // Create auto-disable event
    const eventId = `${experimentKey}_${variantKey}_${Date.now()}`;
    const autoDisableEvent: AutoDisableEvent = {
      eventId,
      targetKey: experimentKey,
      targetType: 'EXPERIMENT',
      variantKey,
      reason,
      triggerMetrics: metrics,
      disabledAt: admin.firestore.Timestamp.now(),
      notificationSent: false,
      auditLogId: ''
    };

    const eventRef = await db.collection('global')
      .doc('experiments')
      .collection('autoDisables')
      .add(autoDisableEvent);

    // Create audit log
    const auditLogRef = await db.collection('auditLogs').add({
      type: 'EXPERIMENT',
      action: 'AUTO_DISABLE',
      resource: 'experimentVariant',
      resourceId: `${experimentKey}:${variantKey}`,
      userId: 'AUTO_SYSTEM',
      metadata: {
        experimentKey,
        variantKey,
        reason,
        metrics
      },
      timestamp: admin.firestore.Timestamp.now(),
      severity: 'CRITICAL'
    });

    // Update event with audit log ID
    await eventRef.update({ 
      auditLogId: auditLogRef.id,
      notificationSent: true 
    });

    // Notify ops team
    await notifyAutoDisable(experimentKey, variantKey, reason, metrics);

  } catch (error) {
    console.error('[PACK 428] Error auto-disabling variant:', error);
  }
}

/**
 * Notify ops team about auto-disable
 */
async function notifyAutoDisable(
  experimentKey: string,
  variantKey: string,
  reason: string,
  metrics: Record<string, number>
): Promise<void> {
  try {
    const opsTeamSnapshot = await db.collection('users')
      .where('role', '==', 'ops')
      .get();

    const batch = db.batch();

    for (const userDoc of opsTeamSnapshot.docs) {
      const notificationRef = db.collection('notifications').doc();

      batch.set(notificationRef, {
        userId: userDoc.id,
        type: 'EXPERIMENT_AUTO_DISABLED',
        title: `⚠️ Experiment Variant Auto-Disabled`,
        body: `${experimentKey}:${variantKey} was automatically disabled due to ${reason}`,
        data: {
          experimentKey,
          variantKey,
          reason,
          metrics
        },
        priority: 'HIGH',
        read: false,
        createdAt: admin.firestore.Timestamp.now()
      });
    }

    await batch.commit();

  } catch (error) {
    console.error('[PACK 428] Error notifying auto-disable:', error);
  }
}

/**
 * Calculate statistical significance between variants
 */
export async function calculateSignificance(
  experimentKey: string,
  metricType: MetricType
): Promise<Record<string, number>> {
  try {
    const metrics = await getExperimentMetrics(experimentKey);
    const variantKeys = Object.keys(metrics);

    if (variantKeys.length < 2) {
      return {};
    }

    const significance: Record<string, number> = {};

    // Simple chi-square test for proportions
    // This is a basic implementation - in production, use a proper stats library
    for (let i = 0; i < variantKeys.length; i++) {
      for (let j = i + 1; j < variantKeys.length; j++) {
        const variantA = metrics[variantKeys[i]];
        const variantB = metrics[variantKeys[j]];

        if (!variantA.metrics[metricType] || !variantB.metrics[metricType]) {
          continue;
        }

        const rateA = variantA.metrics[metricType]!.rate;
        const rateB = variantB.metrics[metricType]!.rate;
        const nA = variantA.sampleSize;
        const nB = variantB.sampleSize;

        // Calculate z-score
        const pooledRate = (rateA * nA + rateB * nB) / (nA + nB);
        const se = Math.sqrt(pooledRate * (1 - pooledRate) * (1 / nA + 1 / nB));
        const zScore = Math.abs((rateA - rateB) / se);

        // Convert to p-value (approximate)
        const pValue = 1 - Math.min(0.9999, zScore / 3.5); // Simplified

        significance[`${variantKeys[i]}_vs_${variantKeys[j]}`] = pValue;
      }
    }

    return significance;

  } catch (error) {
    console.error('[PACK 428] Error calculating significance:', error);
    return {};
  }
}

/**
 * Get experiment winners based on metrics
 */
export async function getExperimentWinner(
  experimentKey: string,
  metricType: MetricType,
  minSampleSize: number = 100
): Promise<{
  winner: string | null;
  confidence: number;
  metrics: Record<string, number>;
}> {
  try {
    const metrics = await getExperimentMetrics(experimentKey);
    const variantKeys = Object.keys(metrics);

    let bestVariant: string | null = null;
    let bestRate = 0;

    for (const variantKey of variantKeys) {
      const variantMetrics = metrics[variantKey];

      if (variantMetrics.sampleSize < minSampleSize) {
        continue; // Skip variants without enough data
      }

      const rate = variantMetrics.metrics[metricType]?.rate || 0;

      if (rate > bestRate) {
        bestRate = rate;
        bestVariant = variantKey;
      }
    }

    if (!bestVariant) {
      return { winner: null, confidence: 0, metrics: {} };
    }

    // Calculate confidence (simplified)
    const significance = await calculateSignificance(experimentKey, metricType);
    const confidenceValues = Object.values(significance);
    const avgPValue = confidenceValues.length > 0
      ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
      : 1;

    const confidence = (1 - avgPValue) * 100; // Convert to percentage

    return {
      winner: bestVariant,
      confidence,
      metrics: {
        rate: bestRate,
        sampleSize: metrics[bestVariant].sampleSize
      }
    };

  } catch (error) {
    console.error('[PACK 428] Error getting experiment winner:', error);
    return { winner: null, confidence: 0, metrics: {} };
  }
}
