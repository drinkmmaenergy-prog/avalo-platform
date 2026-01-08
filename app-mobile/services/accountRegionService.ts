/**
 * Account Region Service
 * PHASE 31A: Global Region Routing (Hybrid Auto + Manual)
 * 
 * Handles user region management for the mobile app.
 * Users can manually change their region once every 30 days.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type AvaloRegionCode = "EU" | "US" | "ASIA" | "OTHER";

export interface RegionChangeRequest {
  newRegion: AvaloRegionCode;
}

export interface RegionChangeResponse {
  success: boolean;
  newRegion: AvaloRegionCode;
  canChangeAgainAt: number; // Timestamp in milliseconds
}

export interface RegionChangeError {
  code: string;
  message: string;
  nextAllowedTime?: number;
}

// ============================================================================
// REGION NAMES FOR DISPLAY
// ============================================================================

export const REGION_NAMES: Record<AvaloRegionCode, string> = {
  EU: "Europe",
  US: "United States",
  ASIA: "Asia",
  OTHER: "Other Regions",
};

export const REGION_DESCRIPTIONS: Record<AvaloRegionCode, string> = {
  EU: "European region with Poland as main hub",
  US: "United States and Canada",
  ASIA: "Southeast Asia and East Asia",
  OTHER: "Rest of the world",
};

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Request to change user's region
 * Can only be done once every 30 days
 * 
 * @param newRegion - The new region code to switch to
 * @returns Promise with success status and next allowed change time
 * @throws Error if change is not allowed or fails
 */
export async function requestRegionChange(
  newRegion: AvaloRegionCode
): Promise<RegionChangeResponse> {
  try {
    // Validate region code
    if (!['EU', 'US', 'ASIA', 'OTHER'].includes(newRegion)) {
      throw new Error(`Invalid region code: ${newRegion}`);
    }

    // Call Cloud Function
    const callable = httpsCallable<RegionChangeRequest, RegionChangeResponse>(
      functions,
      'account_requestRegionChange'
    );

    const result = await callable({ newRegion });

    if (!result.data.success) {
      throw new Error('Region change failed');
    }

    return result.data;
  } catch (error: any) {
    // Handle specific error codes
    if (error.code === 'functions/unauthenticated') {
      throw new Error('You must be logged in to change your region');
    }

    if (error.code === 'functions/failed-precondition') {
      // Extract custom error data if available
      const customData = error.details as RegionChangeError | undefined;
      
      if (customData?.nextAllowedTime) {
        const daysRemaining = Math.ceil(
          (customData.nextAllowedTime - Date.now()) / (1000 * 60 * 60 * 24)
        );
        throw new Error(
          `You can only change your region once every 30 days. Please wait ${daysRemaining} more day${daysRemaining !== 1 ? 's' : ''}.`
        );
      }
      
      throw new Error(error.message || 'Region change not allowed at this time');
    }

    if (error.code === 'functions/invalid-argument') {
      throw new Error('Invalid region selected. Please try again.');
    }

    // Generic error
    console.error('Region change error:', error);
    throw new Error(error.message || 'Failed to change region. Please try again later.');
  }
}

/**
 * Calculate days until next region change is allowed
 * 
 * @param canChangeAgainAt - Timestamp in milliseconds when next change is allowed
 * @returns Number of days remaining
 */
export function getDaysUntilNextChange(canChangeAgainAt: number): number {
  const now = Date.now();
  const msRemaining = canChangeAgainAt - now;
  
  if (msRemaining <= 0) {
    return 0;
  }
  
  return Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
}

/**
 * Check if user can change region now
 * 
 * @param canChangeAgainAt - Timestamp in milliseconds when next change is allowed
 * @returns true if change is allowed
 */
export function canChangeRegionNow(canChangeAgainAt: number | null | undefined): boolean {
  if (!canChangeAgainAt) {
    return true;
  }
  
  return Date.now() >= canChangeAgainAt;
}

/**
 * Format region name for display
 * 
 * @param regionCode - Region code
 * @returns Formatted region name
 */
export function getRegionDisplayName(regionCode: AvaloRegionCode): string {
  return REGION_NAMES[regionCode] || regionCode;
}

/**
 * Get region description
 * 
 * @param regionCode - Region code
 * @returns Region description
 */
export function getRegionDescription(regionCode: AvaloRegionCode): string {
  return REGION_DESCRIPTIONS[regionCode] || '';
}

/**
 * Get all available regions for selection
 * 
 * @returns Array of region codes with display names
 */
export function getAvailableRegions(): Array<{
  code: AvaloRegionCode;
  name: string;
  description: string;
}> {
  return [
    {
      code: 'EU',
      name: REGION_NAMES.EU,
      description: REGION_DESCRIPTIONS.EU,
    },
    {
      code: 'US',
      name: REGION_NAMES.US,
      description: REGION_DESCRIPTIONS.US,
    },
    {
      code: 'ASIA',
      name: REGION_NAMES.ASIA,
      description: REGION_DESCRIPTIONS.ASIA,
    },
    {
      code: 'OTHER',
      name: REGION_NAMES.OTHER,
      description: REGION_DESCRIPTIONS.OTHER,
    },
  ];
}