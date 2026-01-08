/**
 * PACK 183 — Scalability Engine Endpoints
 * Cloud Functions for accessing scalability features
 */

import * as functions from 'firebase-functions';
import { getSystemHealth } from './pack183-traffic-monitor';
import { getScalingHistory } from './pack183-dynamic-scaler';
import {
  getAllShardConfigs,
  getShardDistributionStats,
  assignShard,
} from './pack183-shard-distributor';
import {
  predictLatencySpike,
  validatePredictions,
  isApproachingPeak,
} from './pack183-latency-predictor';

/**
 * Get system health overview (admin only)
 */
export const pack183_getSystemHealth = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  try {
    const health = await getSystemHealth();
    return {
      success: true,
      data: health,
    };
  } catch (error: any) {
    console.error('[Pack183] Error getting system health:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get scaling history for region (admin only)
 */
export const pack183_getScalingHistory = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { region, hours } = data;

  if (!region) {
    throw new functions.https.HttpsError('invalid-argument', 'region is required');
  }

  try {
    const history = await getScalingHistory(region, hours || 24);
    return {
      success: true,
      data: history,
    };
  } catch (error: any) {
    console.error('[Pack183] Error getting scaling history:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get shard configurations (admin only)
 */
export const pack183_getShardConfigs = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  try {
    const configs = getAllShardConfigs();
    return {
      success: true,
      data: configs,
    };
  } catch (error: any) {
    console.error('[Pack183] Error getting shard configs:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get shard distribution statistics (admin only)
 */
export const pack183_getShardStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { module } = data;

  if (!module) {
    throw new functions.https.HttpsError('invalid-argument', 'module is required');
  }

  try {
    const stats = await getShardDistributionStats(module);
    return {
      success: true,
      data: stats,
    };
  } catch (error: any) {
    console.error('[Pack183] Error getting shard stats:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Predict latency for component (internal use)
 */
export const pack183_predictLatency = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { region, component, lookaheadMinutes } = data;

  if (!region || !component) {
    throw new functions.https.HttpsError('invalid-argument', 'region and component are required');
  }

  try {
    const prediction = await predictLatencySpike(
      region,
      component,
      lookaheadMinutes || 30
    );

    return {
      success: true,
      data: prediction,
    };
  } catch (error: any) {
    console.error('[Pack183] Error predicting latency:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Validate prediction accuracy (admin only)
 */
export const pack183_validatePredictions = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { region, hoursBack } = data;

  if (!region) {
    throw new functions.https.HttpsError('invalid-argument', 'region is required');
  }

  try {
    const validation = await validatePredictions(region, hoursBack || 24);
    return {
      success: true,
      data: validation,
    };
  } catch (error: any) {
    console.error('[Pack183] Error validating predictions:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Check if approaching peak hours (public)
 */
export const pack183_isApproachingPeak = functions.https.onCall(async (data, context) => {
  const { minutesAhead } = data;

  try {
    const approaching = isApproachingPeak(minutesAhead || 30);
    return {
      success: true,
      data: {
        approaching,
        minutesAhead: minutesAhead || 30,
      },
    };
  } catch (error: any) {
    console.error('[Pack183] Error checking peak hours:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get optimal server region for user (public)
 * Used by client for latency-based routing
 */
export const pack183_getOptimalRegion = functions.https.onCall(async (data, context) => {
  const { userRegion, userLat, userLon } = data;

  try {
    const health = await getSystemHealth();
    
    const regionLatencies: Record<string, number> = {
      EU: health.regions.EU?.avgResponseTimeMs || 500,
      US: health.regions.US?.avgResponseTimeMs || 500,
      ASIA: health.regions.ASIA?.avgResponseTimeMs || 500,
    };

    if (userRegion) {
      const adjustedLatencies = { ...regionLatencies };
      adjustedLatencies[userRegion] *= 0.7;
      
      const optimal = Object.entries(adjustedLatencies)
        .sort(([, a], [, b]) => a - b)[0][0];

      return {
        success: true,
        data: {
          optimalRegion: optimal,
          latencies: regionLatencies,
          fallbackRegions: Object.keys(regionLatencies).filter(r => r !== optimal),
        },
      };
    }

    const optimal = Object.entries(regionLatencies)
      .sort(([, a], [, b]) => a - b)[0][0];

    return {
      success: true,
      data: {
        optimalRegion: optimal,
        latencies: regionLatencies,
        fallbackRegions: Object.keys(regionLatencies).filter(r => r !== optimal),
      },
    };
  } catch (error: any) {
    console.error('[Pack183] Error getting optimal region:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Report client latency (for monitoring)
 */
export const pack183_reportClientLatency = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { region, component, latencyMs, connectionType } = data;

  if (!region || !component || latencyMs === undefined) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'region, component, and latencyMs are required'
    );
  }

  try {
    const { db, serverTimestamp } = await import('./init');
    
    await db.collection('client_latency_reports').add({
      userId: context.auth.uid,
      region,
      component,
      latencyMs,
      connectionType: connectionType || 'unknown',
      reportedAt: serverTimestamp(),
    });

    return {
      success: true,
      message: 'Latency reported successfully',
    };
  } catch (error: any) {
    console.error('[Pack183] Error reporting latency:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

console.log('✅ PACK 183 — Avalo AI Scalability Engine initialized');