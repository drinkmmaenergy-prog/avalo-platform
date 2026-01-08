/**
 * PACK 67 — Remote Config API
 * Endpoints for fetching effective configuration and experiments
 */

import { onRequest } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { db, generateId } from './init';
import {
  RemoteConfigDocument,
  EffectiveConfigSnapshot,
  FetchConfigParams,
  PlatformType,
  ExperimentAssignment,
  ConfigValue,
} from './types/remoteConfig';
import {
  computeFeatureEnabled,
  assignExperimentVariant,
  mergeConfigs,
} from './remoteConfigEngine';

/**
 * Fetch and merge global + environment config documents
 */
async function fetchMergedConfig(
  environment: 'PROD' | 'STAGE'
): Promise<RemoteConfigDocument | null> {
  try {
    // Fetch global config
    const globalDoc = await db.collection('remote_config').doc('global').get();

    // Fetch environment-specific config
    const envDoc = await db
      .collection('remote_config')
      .doc(environment.toLowerCase())
      .get();

    if (!globalDoc.exists) {
      console.warn('Global remote config document not found');
      return null;
    }

    const globalData = globalDoc.data() as RemoteConfigDocument;
    const envData = envDoc.exists
      ? (envDoc.data() as RemoteConfigDocument)
      : null;

    // Merge configs (environment overrides global)
    if (envData) {
      return {
        configId: envData.configId,
        environment: envData.environment,
        features: mergeConfigs(globalData.features || {}, envData.features || {}),
        experiments: mergeConfigs(
          globalData.experiments || {},
          envData.experiments || {}
        ),
        values: mergeConfigs(globalData.values || {}, envData.values || {}),
        updatedAt: envData.updatedAt,
      };
    }

    return globalData;
  } catch (error) {
    console.error('Error fetching remote config:', error);
    return null;
  }
}

/**
 * Resolve effective config for a specific user/device
 */
function resolveEffectiveConfig(
  mergedConfig: RemoteConfigDocument,
  params: FetchConfigParams
): EffectiveConfigSnapshot {
  const userIdOrDeviceId = params.userId || params.deviceId || 'anonymous';
  const platform = params.platform;
  const country = params.country || null;

  const snapshot: EffectiveConfigSnapshot = {
    features: {},
    values: {},
    experiments: {},
  };

  // Resolve features
  for (const [featureKey, featureConfig] of Object.entries(
    mergedConfig.features || {}
  )) {
    snapshot.features[featureKey] = computeFeatureEnabled(
      featureKey,
      userIdOrDeviceId,
      platform,
      country,
      featureConfig
    );
  }

  // Resolve values
  for (const [valueKey, configValue] of Object.entries(
    mergedConfig.values || {}
  )) {
    snapshot.values[valueKey] = (configValue as ConfigValue).value;
  }

  // Resolve experiments
  for (const [experimentKey, experimentConfig] of Object.entries(
    mergedConfig.experiments || {}
  )) {
    const variantKey = assignExperimentVariant(
      experimentKey,
      userIdOrDeviceId,
      platform,
      country,
      experimentConfig
    );

    if (variantKey) {
      snapshot.experiments[experimentKey] = variantKey;
    }
  }

  return snapshot;
}

/**
 * Log experiment assignment (optional)
 */
async function logExperimentAssignment(
  experimentKey: string,
  variantKey: string,
  params: FetchConfigParams
): Promise<void> {
  try {
    const assignment: ExperimentAssignment = {
      assignmentId: `${experimentKey}_${params.userId || params.deviceId}_${Date.now()}`,
      experimentKey,
      variantKey,
      userId: params.userId || null,
      deviceId: params.deviceId || null,
      platform: params.platform,
      assignedAt: Timestamp.now(),
    };

    await db
      .collection('experiment_assignments')
      .doc(assignment.assignmentId)
      .set(assignment);
  } catch (error) {
    // Log but don't fail the request
    console.error('Error logging experiment assignment:', error);
  }
}

/**
 * GET /remote-config/effective
 * Fetch effective configuration for a user/device
 */
export const getEffectiveConfig = onRequest(
  async (req, res) => {
    // CORS
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.status(204).send('');
      return;
    }

    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      // Parse query params
      const environment = (req.query.environment as string) || 'PROD';
      const platform = req.query.platform as PlatformType;
      const country = (req.query.country as string) || null;
      const userId = (req.query.userId as string) || null;
      const deviceId = (req.query.deviceId as string) || null;

      // Validate required params
      if (!platform || !['android', 'ios', 'web'].includes(platform)) {
        res.status(400).json({ error: 'Invalid or missing platform' });
        return;
      }

      if (!userId && !deviceId) {
        res.status(400).json({ error: 'Either userId or deviceId is required' });
        return;
      }

      const params: FetchConfigParams = {
        environment: environment === 'STAGE' ? 'STAGE' : 'PROD',
        platform,
        country,
        userId,
        deviceId,
      };

      // Fetch merged config
      const mergedConfig = await fetchMergedConfig(params.environment);
      if (!mergedConfig) {
        res.status(503).json({ error: 'Remote config unavailable' });
        return;
      }

      // Resolve effective config
      const snapshot = resolveEffectiveConfig(mergedConfig, params);

      // Log experiment assignments (async, no await)
      for (const [experimentKey, variantKey] of Object.entries(
        snapshot.experiments
      )) {
        logExperimentAssignment(experimentKey, variantKey, params).catch(
          (err) => {
            console.error('Failed to log assignment:', err);
          }
        );
      }

      res.status(200).json(snapshot);
    } catch (error) {
      console.error('Error in getEffectiveConfig:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * GET /admin/remote-config
 * Admin endpoint to view merged remote config (read-only)
 */
export const adminGetRemoteConfig = onRequest(
  async (req, res) => {
    // CORS
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.status(204).send('');
      return;
    }

    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      // TODO: Add admin authentication check (from PACK 65)
      // For now, assume authenticated

      const environment = (req.query.environment as string) || 'PROD';

      // Fetch merged config
      const mergedConfig = await fetchMergedConfig(
        environment === 'STAGE' ? 'STAGE' : 'PROD'
      );

      if (!mergedConfig) {
        res.status(404).json({ error: 'Remote config not found' });
        return;
      }

      res.status(200).json({
        config: mergedConfig,
        note: 'This is a read-only view. To modify remote config, edit Firestore documents directly or use ops scripts.',
      });
    } catch (error) {
      console.error('Error in adminGetRemoteConfig:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * GET /admin/experiments/assignments
 * Admin endpoint to view experiment assignments (read-only)
 */
export const adminGetExperimentAssignments = onRequest(
  async (req, res) => {
    // CORS
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.status(204).send('');
      return;
    }

    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      // TODO: Add admin authentication check (from PACK 65)
      // For now, assume authenticated

      const experimentKey = req.query.experimentKey as string;
      const limit = parseInt((req.query.limit as string) || '100', 10);

      let query = db
        .collection('experiment_assignments')
        .orderBy('assignedAt', 'desc')
        .limit(Math.min(limit, 1000));

      if (experimentKey) {
        query = query.where('experimentKey', '==', experimentKey) as any;
      }

      const snapshot = await query.get();
      const assignments = snapshot.docs.map((doc) => doc.data());

      res.status(200).json({
        assignments,
        count: assignments.length,
      });
    } catch (error) {
      console.error('Error in adminGetExperimentAssignments:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);