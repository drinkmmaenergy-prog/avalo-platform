/**
 * PACK 426 — Global Router
 * 
 * Multi-region routing layer for Avalo's global infrastructure.
 * Routes users to optimal regions based on geolocation, feature requirements,
 * and system health.
 */

import { https, logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

// ============================================================================
// TYPES
// ============================================================================

export type Region = 'EU' | 'US' | 'APAC';

export interface RegionConfig {
  region: Region;
  firestoreLocation: string;
  cdnEndpoint: string;
  aiEndpoint: string;
  fallbackRegion: Region;
  priority: number;
}

export interface UserRegionAssignment {
  userId: string;
  assignedRegion: Region;
  fallbackRegion: Region;
  assignedAt: number;
  reason: string;
}

export interface HealthStatus {
  region: Region;
  healthy: boolean;
  latency: number;
  errorRate: number;
  lastChecked: number;
}

// ============================================================================
// REGION DEFINITIONS
// ============================================================================

export const REGION_CONFIGS: Record<Region, RegionConfig> = {
  EU: {
    region: 'EU',
    firestoreLocation: 'europe-west1',
    cdnEndpoint: 'https://cdn-eu.avalo.app',
    aiEndpoint: 'https://ai-eu.avalo.app',
    fallbackRegion: 'US',
    priority: 1,
  },
  US: {
    region: 'US',
    firestoreLocation: 'us-central1',
    cdnEndpoint: 'https://cdn-us.avalo.app',
    aiEndpoint: 'https://ai-us.avalo.app',
    fallbackRegion: 'EU',
    priority: 1,
  },
  APAC: {
    region: 'APAC',
    firestoreLocation: 'asia-south1',
    cdnEndpoint: 'https://cdn-apac.avalo.app',
    aiEndpoint: 'https://ai-apac.avalo.app',
    fallbackRegion: 'EU',
    priority: 2,
  },
};

// Country to region mapping
const EU_COUNTRIES = [
  'DE', 'FR', 'GB', 'IT', 'ES', 'PL', 'NL', 'BE', 'AT', 'CH',
  'SE', 'NO', 'DK', 'FI', 'IE', 'PT', 'GR', 'CZ', 'RO', 'HU',
  'SK', 'BG', 'HR', 'SI', 'LT', 'LV', 'EE', 'CY', 'MT', 'LU',
];

const US_COUNTRIES = [
  'US', 'CA', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'VE',
  'EC', 'BO', 'PY', 'UY', 'GT', 'CR', 'PA', 'DO', 'HN',
];

const APAC_COUNTRIES = [
  'IN', 'CN', 'JP', 'KR', 'AU', 'NZ', 'SG', 'TH', 'ID', 'PH',
  'VN', 'MY', 'PK', 'BD', 'TW', 'HK', 'LK', 'MM', 'KH', 'LA',
];

// ============================================================================
// ROUTING LOGIC
// ============================================================================

/**
 * Primary routing function - determines optimal region for user
 */
export function routeRegion(userCountry: string): Region {
  if (EU_COUNTRIES.includes(userCountry)) return 'EU';
  if (US_COUNTRIES.includes(userCountry)) return 'US';
  if (APAC_COUNTRIES.includes(userCountry)) return 'APAC';
  
  // Default fallback to EU
  return 'EU';
}

/**
 * Get region configuration with health check consideration
 */
export async function getOptimalRegionConfig(
  userCountry: string,
  userId?: string
): Promise<RegionConfig> {
  const baseRegion = routeRegion(userCountry);
  
  // Check if user has manual region override (VIP feature)
  if (userId) {
    const userOverride = await getUserRegionOverride(userId);
    if (userOverride) {
      logger.info(`User ${userId} has region override: ${userOverride}`);
      return REGION_CONFIGS[userOverride];
    }
  }
  
  // Check region health
  const health = await checkRegionHealth(baseRegion);
  if (!health.healthy) {
    logger.warn(`Region ${baseRegion} unhealthy, using fallback`);
    const fallbackRegion = REGION_CONFIGS[baseRegion].fallbackRegion;
    return REGION_CONFIGS[fallbackRegion];
  }
  
  return REGION_CONFIGS[baseRegion];
}

/**
 * Route specific feature to appropriate region
 */
export function routeFeature(
  feature: string,
  userRegion: Region
): Region {
  const db = getFirestore();
  
  switch (feature) {
    case 'chat':
    case 'messaging':
    case 'swipe':
      // Latency-critical features use user's region
      return userRegion;
      
    case 'ai-companion':
    case 'ai-session':
      // AI features use co-located region for token efficiency
      return userRegion;
      
    case 'wallet':
    case 'payment':
    case 'subscription':
      // Financial operations always route to EU (primary)
      return 'EU';
      
    case 'fraud-detection':
    case 'verification':
      // Security features centralized in EU
      return 'EU';
      
    case 'feed':
    case 'profile':
      // Global features with CDN caching can use any region
      return 'EU'; // Primary for consistency
      
    default:
      return userRegion;
  }
}

/**
 * Calculate failover order for a region
 */
export function getFailoverOrder(primaryRegion: Region): Region[] {
  const order: Region[] = [primaryRegion];
  
  switch (primaryRegion) {
    case 'EU':
      order.push('US', 'APAC');
      break;
    case 'US':
      order.push('EU', 'APAC');
      break;
    case 'APAC':
      order.push('EU', 'US');
      break;
  }
  
  return order;
}

// ============================================================================
// HEALTH CHECKS
// ============================================================================

/**
 * Check health status of a region
 */
export async function checkRegionHealth(region: Region): Promise<HealthStatus> {
  const db = getFirestore();
  
  try {
    const healthDoc = await db
      .collection('infrastructure')
      .doc('regionHealth')
      .collection('regions')
      .doc(region)
      .get();
    
    if (!healthDoc.exists) {
      // No health data, assume healthy
      return {
        region,
        healthy: true,
        latency: 0,
        errorRate: 0,
        lastChecked: Date.now(),
      };
    }
    
    const data = healthDoc.data() as HealthStatus;
    
    // Health thresholds
    const isHealthy = 
      data.latency < 1000 && // Max 1s latency
      data.errorRate < 0.05 && // Max 5% error rate
      Date.now() - data.lastChecked < 300000; // Data less than 5 min old
    
    return {
      ...data,
      healthy: isHealthy,
    };
  } catch (error) {
    logger.error(`Health check failed for ${region}:`, error);
    return {
      region,
      healthy: false,
      latency: 9999,
      errorRate: 1,
      lastChecked: Date.now(),
    };
  }
}

/**
 * Update region health metrics
 */
export async function updateRegionHealth(
  region: Region,
  latency: number,
  errorRate: number
): Promise<void> {
  const db = getFirestore();
  
  await db
    .collection('infrastructure')
    .doc('regionHealth')
    .collection('regions')
    .doc(region)
    .set({
      region,
      healthy: latency < 1000 && errorRate < 0.05,
      latency,
      errorRate,
      lastChecked: Date.now(),
    });
}

// ============================================================================
// USER REGION MANAGEMENT
// ============================================================================

/**
 * Assign user to optimal region on signup
 */
export async function assignUserRegion(
  userId: string,
  userCountry: string,
  ipAddress?: string
): Promise<UserRegionAssignment> {
  const db = getFirestore();
  const region = routeRegion(userCountry);
  const config = REGION_CONFIGS[region];
  
  const assignment: UserRegionAssignment = {
    userId,
    assignedRegion: region,
    fallbackRegion: config.fallbackRegion,
    assignedAt: Date.now(),
    reason: `Country-based routing: ${userCountry}`,
  };
  
  await db
    .collection('users')
    .doc(userId)
    .update({
      region: region,
      regionConfig: config,
      regionAssignedAt: Date.now(),
    });
  
  logger.info(`User ${userId} assigned to region ${region}`);
  return assignment;
}

/**
 * Get user's region override (VIP feature)
 */
async function getUserRegionOverride(userId: string): Promise<Region | null> {
  const db = getFirestore();
  
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return null;
    
    const data = userDoc.data();
    return data?.regionOverride || null;
  } catch (error) {
    logger.error(`Failed to get region override for ${userId}:`, error);
    return null;
  }
}

/**
 * Set manual region override (VIP users only)
 */
export async function setUserRegionOverride(
  userId: string,
  region: Region
): Promise<void> {
  const db = getFirestore();
  
  // Verify user has VIP status
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  if (!userData?.vipStatus || userData.vipStatus.tier < 2) {
    throw new Error('Region override requires VIP tier 2+');
  }
  
  await db.collection('users').doc(userId).update({
    regionOverride: region,
    regionOverrideSetAt: Date.now(),
  });
  
  logger.info(`User ${userId} region override set to ${region}`);
}

// ============================================================================
// HTTP ENDPOINTS
// ============================================================================

/**
 * Get region configuration for mobile app
 * GET /infrastructure/region-config
 */
export const getRegionConfig = https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Access-Control-Allow-Headers', 'Authorization');
    res.status(204).send('');
    return;
  }
  
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }
  
  try {
    const userCountry = req.query.country as string || 'US';
    const userId = req.query.userId as string | undefined;
    
    const config = await getOptimalRegionConfig(userCountry, userId);
    const health = await checkRegionHealth(config.region);
    
    res.status(200).json({
      success: true,
      data: {
        assignedRegion: config.region,
        fallbackRegion: config.fallbackRegion,
        cdnBaseUrl: config.cdnEndpoint,
        aiEndpoint: config.aiEndpoint,
        firestoreLocation: config.firestoreLocation,
        health: {
          healthy: health.healthy,
          latency: health.latency,
          errorRate: health.errorRate,
        },
        failoverOrder: getFailoverOrder(config.region),
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    logger.error('Region config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get region configuration',
    });
  }
});

/**
 * Health check endpoint for region monitoring
 * GET /infrastructure/health/:region
 */
export const regionHealthCheck = https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }
  
  try {
    const region = req.query.region as Region || 'EU';
    const health = await checkRegionHealth(region);
    
    res.status(health.healthy ? 200 : 503).json({
      success: true,
      data: health,
    });
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({
      success: false,
      error: 'Health check failed',
    });
  }
});

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  routeRegion,
  routeFeature,
  getOptimalRegionConfig,
  getFailoverOrder,
  checkRegionHealth,
  updateRegionHealth,
  assignUserRegion,
  setUserRegionOverride,
  // HTTP functions
  getRegionConfig,
  regionHealthCheck,
};
