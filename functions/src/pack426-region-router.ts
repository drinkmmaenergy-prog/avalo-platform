import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 426 - Region Router Stub
 * Provides region routing functionality for global message delivery
 */

export type Region = 'EU' | 'US' | 'APAC' | 'LATAM';

export interface RegionConfig {
  region: Region;
  endpoint: string;
  priority: number;
  enabled: boolean;
}

export interface RouteResult {
  region: Region;
  endpoint: string;
  latency: number;
}

const REGION_CONFIGS: Record<Region, RegionConfig> = {
  EU: {
    region: 'EU',
    endpoint: 'europe-west1',
    priority: 1,
    enabled: true,
  },
  US: {
    region: 'US',
    endpoint: 'us-central1',
    priority: 2,
    enabled: true,
  },
  APAC: {
    region: 'APAC',
    endpoint: 'asia-east1',
    priority: 3,
    enabled: true,
  },
  LATAM: {
    region: 'LATAM',
    endpoint: 'southamerica-east1',
    priority: 4,
    enabled: true,
  },
};

/**
 * Route to the appropriate region based on user location
 * Returns Region string for compatibility with pack427 files
 * Accepts both Region type and country code strings
 */
export function routeRegion(
  userRegion?: Region | string,
  preferredRegion?: Region
): Region {
  // Handle country codes by mapping to regions
  let region: Region = 'EU';
  if (typeof userRegion === 'string') {
    // Check if it's already a Region
    if (userRegion === 'EU' || userRegion === 'US' || userRegion === 'APAC') {
      region = userRegion as Region;
    } else {
      // Treat as country code - map to region
      const euCountries = ['DE', 'FR', 'IT', 'ES', 'PL', 'NL', 'BE', 'AT', 'SE', 'DK', 'FI', 'NO', 'IE', 'PT', 'GR', 'CZ', 'HU', 'RO', 'BG', 'SK', 'HR', 'SI', 'LT', 'LV', 'EE', 'CY', 'MT', 'LU'];
      const usCountries = ['US', 'CA', 'MX'];
      const apacCountries = ['JP', 'KR', 'AU', 'NZ', 'SG', 'HK', 'TW', 'IN', 'ID', 'TH', 'MY', 'PH', 'VN'];
      
      if (euCountries.includes(userRegion.toUpperCase())) {
        region = 'EU';
      } else if (usCountries.includes(userRegion.toUpperCase())) {
        region = 'US';
      } else if (apacCountries.includes(userRegion.toUpperCase())) {
        region = 'APAC';
      }
    }
  } else if (userRegion) {
    region = userRegion;
  }
  
  region = preferredRegion || region;
  const config = REGION_CONFIGS[region] || REGION_CONFIGS.EU;
  return config.region;
}

/**
 * Route to the appropriate region with full result details
 */
export function routeRegionFull(
  userRegion?: Region,
  preferredRegion?: Region
): RouteResult {
  const region = preferredRegion || userRegion || 'EU';
  const config = REGION_CONFIGS[region] || REGION_CONFIGS.EU;
  
  return {
    region: config.region,
    endpoint: config.endpoint,
    latency: 0,
  };
}

/**
 * Get all available regions
 */
export function getAvailableRegions(): Region[] {
  return Object.values(REGION_CONFIGS)
    .filter(config => config.enabled)
    .sort((a, b) => a.priority - b.priority)
    .map(config => config.region);
}

/**
 * Check if a region is available
 */
export function isRegionAvailable(region: Region): boolean {
  return REGION_CONFIGS[region]?.enabled ?? false;
}

























