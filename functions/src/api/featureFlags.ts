/**
 * Feature Flags API Endpoints
 * 
 * Provides endpoints for fetching feature flags for web and mobile clients.
 * Uses Firebase Remote Config for dynamic flag management.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { DEFAULT_FEATURE_FLAGS, FeatureFlagsConfig, isCountryAllowed } from '../config/featureFlags';

/**
 * Get feature flags for the requesting user
 * 
 * Endpoint: GET /api/featureFlags
 * Query params:
 *   - countryCode: ISO 3166-1 alpha-2 country code
 *   - userId: Optional user ID for personalized flags
 *   - platform: mobile | web | desktop
 */
export const getFeatureFlags = functions.https.onRequest(async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { countryCode, userId, platform } = req.query;

    // Get base flags from Remote Config or use defaults
    const flags = await getRemoteConfigFlags();

    // Apply user-specific overrides if userId provided
    let userFlags = flags;
    if (userId && typeof userId === 'string') {
      userFlags = await applyUserOverrides(userId, flags);
    }

    // Apply country-specific restrictions
    if (countryCode && typeof countryCode === 'string') {
      userFlags = applyCountryRestrictions(countryCode, userFlags);
    }

    // Apply platform-specific flags
    if (platform && typeof platform === 'string') {
      userFlags = applyPlatformFlags(platform as 'mobile' | 'web' | 'desktop', userFlags);
    }

    // Return flags with cache headers
    res.set('Cache-Control', 'public, max-age=300'); // 5 minutes
    res.status(200).json({
      flags: userFlags,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching feature flags:', error);
    res.status(500).json({
      error: 'Internal server error',
      flags: DEFAULT_FEATURE_FLAGS, // Fallback to defaults
    });
  }
});

/**
 * Admin endpoint to update feature flags
 * 
 * Endpoint: POST /api/admin/featureFlags
 * Requires admin authentication
 */
export const updateFeatureFlags = functions.https.onRequest(async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Verify admin token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Check if user is admin
    const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden: Admin access required' });
      return;
    }

    // Update flags
    const newFlags = req.body.flags as Partial<FeatureFlagsConfig>;
    await updateRemoteConfigFlags(newFlags);

    // Log the change
    await admin.firestore().collection('audit_logs').add({
      type: 'feature_flags_update',
      userId: decodedToken.uid,
      changes: newFlags,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).json({
      success: true,
      message: 'Feature flags updated successfully',
    });
  } catch (error) {
    console.error('Error updating feature flags:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Fetch feature flags from Firebase Remote Config
 */
async function getRemoteConfigFlags(): Promise<FeatureFlagsConfig> {
  try {
    const template = await admin.remoteConfig().getTemplate();
    const flagsParam = template.parameters?.featureFlags;
    
    if (flagsParam?.defaultValue?.value) {
      return JSON.parse(flagsParam.defaultValue.value as string);
    }
  } catch (error) {
    console.warn('Failed to fetch Remote Config flags, using defaults:', error);
  }
  
  return DEFAULT_FEATURE_FLAGS;
}

/**
 * Update feature flags in Firebase Remote Config
 */
async function updateRemoteConfigFlags(
  updates: Partial<FeatureFlagsConfig>
): Promise<void> {
  try {
    const template = await admin.remoteConfig().getTemplate();
    const currentFlags = await getRemoteConfigFlags();
    const updatedFlags = { ...currentFlags, ...updates };

    template.parameters = {
      ...template.parameters,
      featureFlags: {
        defaultValue: {
          value: JSON.stringify(updatedFlags),
        },
        description: 'Global feature flags for Avalo platform',
      },
    };

    await admin.remoteConfig().publishTemplate(template);
  } catch (error) {
    console.error('Failed to update Remote Config flags:', error);
    throw error;
  }
}

/**
 * Apply user-specific flag overrides
 */
async function applyUserOverrides(
  userId: string,
  flags: FeatureFlagsConfig
): Promise<FeatureFlagsConfig> {
  try {
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData) {
      return flags;
    }

    const overrides: Partial<FeatureFlagsConfig> = {};

    // Apply beta tester flags
    if (userData.betaTester === true) {
      overrides.features = {
        ...flags.features,
        // Beta testers get early access to features
      };
    }

    // Apply premium user flags
    if (userData.isPremium === true) {
      overrides.limits = {
        ...flags.limits,
        maxSwipesPerDay: 999999,
        maxMessagesPerDay: 999999,
        maxProfileViewsPerDay: 999999,
      };
    }

    // Apply creator flags
    if (userData.isCreator === true) {
      overrides.creatorFeaturesEnabled = true;
    }

    return { ...flags, ...overrides };
  } catch (error) {
    console.warn('Failed to apply user overrides:', error);
    return flags;
  }
}

/**
 * Apply country-specific restrictions
 */
function applyCountryRestrictions(
  countryCode: string,
  flags: FeatureFlagsConfig
): FeatureFlagsConfig {
  const normalizedCountry = countryCode.toUpperCase();

  // Check if country is allowed
  if (!isCountryAllowed(normalizedCountry, flags)) {
    return {
      ...flags,
      platformEnabled: false,
      maintenance: {
        enabled: true,
        message: 'Avalo is not yet available in your country. Stay tuned!',
        estimatedEnd: null,
      },
    };
  }

  // Apply regional restrictions
  const restrictions = flags.regionalSettings.restrictedRegions[normalizedCountry];
  if (restrictions) {
    const updatedFeatures = { ...flags.features };
    
    restrictions.disabledFeatures.forEach((feature) => {
      if (feature in updatedFeatures) {
        (updatedFeatures as any)[feature] = false;
      }
    });

    return {
      ...flags,
      features: updatedFeatures,
    };
  }

  return flags;
}

/**
 * Apply platform-specific flags
 */
function applyPlatformFlags(
  platform: 'mobile' | 'web' | 'desktop',
  flags: FeatureFlagsConfig
): FeatureFlagsConfig {
  // Platform-specific feature availability
  const platformFeatures: Record<string, Partial<FeatureFlagsConfig['features']>> = {
    mobile: {
      // Mobile has all features
    },
    web: {
      // Web might not have native features
      panicButton: false, // Panic button is mobile-only
    },
    desktop: {
      // Desktop might have limited features
      panicButton: false,
    },
  };

  const platformOverrides = platformFeatures[platform] || {};

  return {
    ...flags,
    features: {
      ...flags.features,
      ...platformOverrides,
    },
  };
}

/**
 * Health check endpoint for feature flags service
 */
export const healthCheck = functions.https.onRequest((req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'feature-flags',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});