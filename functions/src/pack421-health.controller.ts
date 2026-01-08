/**
 * PACK 421 — Health Check Endpoints
 * 
 * Three health check endpoints for system monitoring:
 * 1. Public health (load balancer / uptime monitors)
 * 2. Internal health (deep system checks)
 * 3. Feature matrix (module readiness dashboard)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  HealthCheckResponse,
  HealthComponent,
  HealthStatus,
  FeatureMatrixResponse,
  FeatureStatus,
} from '../../shared/types/pack421-observability.types';
import { checkMetricsHealth } from './pack421-metrics.adapter';

/**
 * Get build version from environment or package.json
 */
function getBuildVersion(): string {
  return process.env.BUILD_VERSION || process.env.npm_package_version || '1.0.0';
}

/**
 * Get environment name
 */
function getEnvironment(): string {
  return process.env.NODE_ENV || 'development';
}

/**
 * PUBLIC HEALTH ENDPOINT
 * 
 * Simple health check for load balancers and uptime monitors.
 * No authentication required.
 * 
 * Returns:
 * - Status: 'ok'
 * - Build version
 * - Current timestamp
 */
export const pack421_health_public = functions.https.onRequest(
  async (req, res) => {
    try {
      const response: HealthCheckResponse = {
        status: 'ok',
        version: getBuildVersion(),
        timestamp: Date.now(),
        environment: getEnvironment(),
      };

      res.status(200).json(response);
    } catch (error) {
      functions.logger.error('[HEALTH:Public] Error', { error });
      res.status(500).json({
        status: 'error',
        version: getBuildVersion(),
        timestamp: Date.now(),
      });
    }
  }
);

/**
 * Check Firestore connectivity
 */
async function checkFirestore(): Promise<HealthComponent> {
  const startTime = Date.now();
  try {
    // Try simple read/write to a health check collection
    const healthRef = admin.firestore().collection('_health').doc('check');
    
    // Write test
    await healthRef.set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      check: 'health',
    }, { merge: true });
    
    // Read test
    const doc = await healthRef.get();
    
    if (!doc.exists) {
      return {
        name: 'firestore',
        status: 'error',
        message: 'Health check document not found after write',
        lastChecked: Date.now(),
        latencyMs: Date.now() - startTime,
      };
    }

    return {
      name: 'firestore',
      status: 'ok',
      lastChecked: Date.now(),
      latencyMs: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      name: 'firestore',
      status: 'error',
      message: error.message || 'Firestore check failed',
      lastChecked: Date.now(),
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Check Storage connectivity
 */
async function checkStorage(): Promise<HealthComponent> {
  const startTime = Date.now();
  try {
    const bucket = admin.storage().bucket();
    
    // Try to check if bucket exists (minimal operation)
    const [exists] = await bucket.exists();
    
    if (!exists) {
      return {
        name: 'storage',
        status: 'error',
        message: 'Storage bucket not accessible',
        lastChecked: Date.now(),
        latencyMs: Date.now() - startTime,
      };
    }

    return {
      name: 'storage',
      status: 'ok',
      lastChecked: Date.now(),
      latencyMs: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      name: 'storage',
      status: 'error',
      message: error.message || 'Storage check failed',
      lastChecked: Date.now(),
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Check metrics system
 */
async function checkMetrics(): Promise<HealthComponent> {
  const startTime = Date.now();
  try {
    const healthy = await checkMetricsHealth();
    
    return {
      name: 'metrics',
      status: healthy ? 'ok' : 'degraded',
      message: healthy ? undefined : 'Metrics emission may be failing',
      lastChecked: Date.now(),
      latencyMs: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      name: 'metrics',
      status: 'error',
      message: error.message || 'Metrics check failed',
      lastChecked: Date.now(),
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Check environment variables
 */
async function checkEnvironment(): Promise<HealthComponent> {
  const requiredVars = [
    'FIREBASE_CONFIG',
    // Add other critical env vars as needed
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    return {
      name: 'environment',
      status: 'error',
      message: `Missing required env vars: ${missing.join(', ')}`,
      lastChecked: Date.now(),
    };
  }

  return {
    name: 'environment',
    status: 'ok',
    lastChecked: Date.now(),
  };
}

/**
 * Determine overall status from components
 */
function calculateOverallStatus(components: HealthComponent[]): HealthStatus {
  const hasError = components.some(c => c.status === 'error');
  const hasDegraded = components.some(c => c.status === 'degraded');

  if (hasError) return 'error';
  if (hasDegraded) return 'degraded';
  return 'ok';
}

/**
 * INTERNAL HEALTH ENDPOINT
 * 
 * Deep health checks for internal monitoring.
 * Checks:
 * - Firestore read/write
 * - Storage access
 * - Metrics system
 * - Environment variables
 * 
 * Authentication: Requires admin/internal role (PACK 296/300A)
 */
export const pack421_health_internal = functions.https.onRequest(
  async (req, res) => {
    try {
      // TODO: Add authentication check using PACK 296 audit system
      // For now, check for internal API key
      const apiKey = req.headers['x-internal-api-key'] || req.query.key;
      if (apiKey !== process.env.INTERNAL_HEALTH_API_KEY && process.env.NODE_ENV === 'production') {
        res.status(403).json({
          status: 'error',
          message: 'Unauthorized: Internal health endpoint requires authentication',
          timestamp: Date.now(),
        });
        return;
      }

      // Run all health checks in parallel
      const [firestoreHealth, storageHealth, metricsHealth, envHealth] = 
        await Promise.all([
          checkFirestore(),
          checkStorage(),
          checkMetrics(),
          checkEnvironment(),
        ]);

      const components = [firestoreHealth, storageHealth, metricsHealth, envHealth];
      const overallStatus = calculateOverallStatus(components);

      const response: HealthCheckResponse = {
        status: overallStatus,
        version: getBuildVersion(),
        timestamp: Date.now(),
        environment: getEnvironment(),
        components,
      };

      // Set HTTP status based on health
      const httpStatus = overallStatus === 'ok' ? 200 : overallStatus === 'degraded' ? 200 : 503;
      res.status(httpStatus).json(response);
    } catch (error) {
      functions.logger.error('[HEALTH:Internal] Error', { error });
      res.status(500).json({
        status: 'error',
        version: getBuildVersion(),
        timestamp: Date.now(),
        message: 'Internal health check failed',
      });
    }
  }
);

/**
 * Get feature matrix - tracks readiness of all core modules
 */
function getFeatureMatrix(): Record<string, FeatureStatus> {
  return {
    'wallet': {
      feature: 'Wallet & Token Store',
      ready: true,
      status: 'Production ready',
      packs: ['255', '277'],
    },
    'chat': {
      feature: 'Chat & Monetization',
      ready: true,
      status: 'Production ready',
      packs: ['273-280', '268x'],
    },
    'calls': {
      feature: 'Voice & Video Calls',
      ready: true,
      status: 'Production ready',
      packs: ['273-280'],
    },
    'events': {
      feature: 'Meetings & Events',
      ready: true,
      status: 'Production ready',
      packs: ['240+', '218'],
    },
    'ai-companions': {
      feature: 'AI Companions',
      ready: true,
      status: 'Production ready',
      packs: ['279', '184-189'],
    },
    'safety': {
      feature: 'Global Safety & Risk',
      ready: true,
      status: 'Production ready',
      packs: ['267-268', '417-420'],
    },
    'support': {
      feature: 'Support System',
      ready: true,
      status: 'Production ready',
      packs: ['300', '300A', '300B'],
    },
    'data-rights': {
      feature: 'Data Rights & Privacy',
      ready: true,
      status: 'Production ready',
      packs: ['420'],
    },
    'growth': {
      feature: 'Growth & Retention',
      ready: true,
      status: 'Production ready',
      packs: ['301', '301A', '301B'],
    },
    'fraud': {
      feature: 'Fraud & Risk Engine',
      ready: true,
      status: 'Production ready',
      packs: ['302', '352+'],
    },
    'audit-logs': {
      feature: 'Audit Logs',
      ready: true,
      status: 'Production ready',
      packs: ['296'],
    },
    'notifications': {
      feature: 'Notifications',
      ready: true,
      status: 'Production ready',
      packs: ['293'],
    },
  };
}

/**
 * FEATURE MATRIX ENDPOINT
 * 
 * Returns a map of core modules and their ready state.
 * Used by admin panel to show system status dashboard.
 * 
 * Callable function (can also be exposed as HTTP if needed).
 */
export const pack421_health_featureMatrix = functions.https.onCall(
  async (data, context) => {
    try {
      // TODO: Add authentication check using PACK 296 audit system
      // For now, require authenticated user
      if (!context.auth && process.env.NODE_ENV === 'production') {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'Feature matrix requires authentication'
        );
      }

      const features = getFeatureMatrix();
      const allReady = Object.values(features).every(f => f.ready);

      const response: FeatureMatrixResponse = {
        features,
        overallReady: allReady,
        timestamp: Date.now(),
      };

      return response;
    } catch (error: any) {
      functions.logger.error('[HEALTH:FeatureMatrix] Error', { error });
      throw new functions.https.HttpsError(
        'internal',
        'Failed to retrieve feature matrix',
        error.message
      );
    }
  }
);

/**
 * HTTP version of feature matrix (for admin dashboard)
 */
export const pack421_health_featureMatrix_http = functions.https.onRequest(
  async (req, res) => {
    try {
      // TODO: Add authentication check
      const apiKey = req.headers['x-internal-api-key'] || req.query.key;
      if (apiKey !== process.env.INTERNAL_HEALTH_API_KEY && process.env.NODE_ENV === 'production') {
        res.status(403).json({
          error: 'Unauthorized: Feature matrix requires authentication',
        });
        return;
      }

      const features = getFeatureMatrix();
      const allReady = Object.values(features).every(f => f.ready);

      const response: FeatureMatrixResponse = {
        features,
        overallReady: allReady,
        timestamp: Date.now(),
      };

      res.status(200).json(response);
    } catch (error) {
      functions.logger.error('[HEALTH:FeatureMatrix:HTTP] Error', { error });
      res.status(500).json({
        error: 'Failed to retrieve feature matrix',
      });
    }
  }
);
