/**
 * PACK 412 — Growth & Retention Integration
 * Helper functions to integrate launch control with PACK 301/301A/301B
 */

import * as admin from 'firebase-admin';
import type { LaunchStage, LaunchRegionConfig } from '../../shared/types/pack412-launch';

const db = admin.firestore();

/**
 * Get region launch stage for a user
 * Used by PACK 301 to determine nudge aggressiveness
 */
export async function getRegionLaunchStageForUser(userId: string): Promise<LaunchStage> {
  try {
    // Get user's country from profile
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (!userData || !userData.countryCode) {
      // Default to FULL_LIVE for users without country
      return 'FULL_LIVE';
    }
    
    // Find region containing this country
    const regionsSnapshot = await db.collection('launchRegions')
      .where('countries', 'array-contains', userData.countryCode)
      .limit(1)
      .get();
    
    if (regionsSnapshot.empty) {
      // Default to FULL_LIVE for regions not in launch system
      return 'FULL_LIVE';
    }
    
    const region = regionsSnapshot.docs[0].data() as LaunchRegionConfig;
    return region.stage;
  } catch (error) {
    console.error('Error getting region launch stage:', error);
    // Fail open - default to FULL_LIVE
    return 'FULL_LIVE';
  }
}

/**
 * Check if nudges should be allowed for a user based on region stage
 * SOFT_LIVE: Conservative nudges only
 * PAUSED: No nudges
 * FULL_LIVE: All nudges allowed
 */
export async function shouldAllowNudgeForUser(
  userId: string,
  nudgeType: 'onboarding' | 'reactivation' | 'upsell' | 'feature_discovery'
): Promise<boolean> {
  const stage = await getRegionLaunchStageForUser(userId);
  
  // No nudges if paused or rolled back
  if (stage === 'PAUSED' || stage === 'ROLLED_BACK') {
    return false;
  }
  
  // Only onboarding nudges for soft launch
  if (stage === 'SOFT_LIVE') {
    return nudgeType === 'onboarding';
  }
  
  // All nudges allowed for full launch
  if (stage === 'FULL_LIVE') {
    return true;
  }
  
  // No nudges for not-yet-launched regions
  return false;
}

/**
 * Get nudge throttle factor based on region stage
 * Returns a multiplier for nudge frequency (0.0 = no nudges, 1.0 = full frequency)
 */
export async function getNudgeThrottleFactor(userId: string): Promise<number> {
  const stage = await getRegionLaunchStageForUser(userId);
  
  switch (stage) {
    case 'NOT_PLANNED':
    case 'PLANNED':
    case 'READY_FOR_SOFT':
      return 0.0; // No nudges before launch
    
    case 'SOFT_LIVE':
      return 0.3; // 30% of normal nudge frequency
    
    case 'READY_FOR_FULL':
      return 0.5; // 50% of normal nudge frequency
    
    case 'FULL_LIVE':
      return 1.0; // Full nudge frequency
    
    case 'PAUSED':
    case 'ROLLED_BACK':
      return 0.0; // No nudges in safe mode
    
    default:
      return 1.0; // Default to full frequency
  }
}

/**
 * Check if growth campaigns should be paused for a region
 */
export async function shouldPauseGrowthCampaignsInRegion(regionId: string): Promise<boolean> {
  try {
    const regionDoc = await db.collection('launchRegions').doc(regionId).get();
    
    if (!regionDoc.exists) {
      return false; // Not in launch system, don't pause
    }
    
    const region = regionDoc.data() as LaunchRegionConfig;
    
    // Pause campaigns if region is paused or rolled back
    return region.stage === 'PAUSED' || region.stage === 'ROLLED_BACK';
  } catch (error) {
    console.error('Error checking growth campaign pause:', error);
    return false; // Fail open
  }
}

/**
 * Get recommended daily active user (DAU) cap for a region
 * Used by growth engine to limit user influx
 */
export async function getRecommendedDAUCap(regionId: string): Promise<number | null> {
  try {
    const regionDoc = await db.collection('launchRegions').doc(regionId).get();
    
    if (!regionDoc.exists) {
      return null; // No cap for regions not in launch system
    }
    
    const region = regionDoc.data() as LaunchRegionConfig;
    
    // No cap for full launch
    if (region.stage === 'FULL_LIVE') {
      return null;
    }
    
    // Use maxConcurrentUsersHint as cap for soft launches
    if (region.stage === 'SOFT_LIVE' && region.maxConcurrentUsersHint) {
      return region.maxConcurrentUsersHint;
    }
    
    // Conservative cap for other stages
    return 1000;
  } catch (error) {
    console.error('Error getting DAU cap:', error);
    return null;
  }
}

/**
 * Log growth action for launch monitoring
 * Helps track growth engine impact on launch regions
 */
export async function logGrowthActionForLaunchMonitoring(
  userId: string,
  actionType: string,
  metadata: Record<string, any>
): Promise<void> {
  try {
    // Get user's region
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (!userData || !userData.countryCode) {
      return; // No region tracking needed
    }
    
    // Find region
    const regionsSnapshot = await db.collection('launchRegions')
      .where('countries', 'array-contains', userData.countryCode)
      .limit(1)
      .get();
    
    if (regionsSnapshot.empty) {
      return; // Not in launch system
    }
    
    const region = regionsSnapshot.docs[0].data() as LaunchRegionConfig;
    
    // Log growth action
    await db.collection('launchGrowthActions').add({
      regionId: region.id,
      userId,
      actionType,
      metadata,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error logging growth action:', error);
    // Non-critical, don't throw
  }
}

/**
 * Check if user should receive feature announcement based on region stage
 */
export async function shouldReceiveFeatureAnnouncement(
  userId: string,
  featureKey: string
): Promise<boolean> {
  const stage = await getRegionLaunchStageForUser(userId);
  
  // No announcements in safe mode
  if (stage === 'PAUSED' || stage === 'ROLLED_BACK') {
    return false;
  }
  
  // Limited announcements in soft launch
  if (stage === 'SOFT_LIVE') {
    // Only core feature announcements
    return featureKey.startsWith('core_');
  }
  
  // All announcements in full launch
  return stage === 'FULL_LIVE';
}
