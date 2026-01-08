/**
 * PACK 355 - Referral & Invite Engine Feature Flags
 * 
 * Manages feature flags for the referral system to enable/disable
 * functionality globally or per region
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';

const db = admin.firestore();

export interface ReferralFeatureFlags {
  'referrals.enabled': boolean;
  'referrals.influencer.enabled': boolean;
  'referrals.campaigns.enabled': boolean;
  [key: `referrals.region.${string}.enabled`]: boolean;
}

const DEFAULT_FLAGS: ReferralFeatureFlags = {
  'referrals.enabled': true,
  'referrals.influencer.enabled': true,
  'referrals.campaigns.enabled': true,
};

/**
 * Get all referral feature flags
 */
export async function getReferralFlags(): Promise<ReferralFeatureFlags> {
  try {
    const flagsDoc = await db.collection('featureFlags').doc('referrals').get();

    if (!flagsDoc.exists) {
      // Initialize with defaults
      await db.collection('featureFlags').doc('referrals').set(DEFAULT_FLAGS);
      return DEFAULT_FLAGS;
    }

    return flagsDoc.data() as ReferralFeatureFlags;
  } catch (error) {
    logger.error('Error getting referral flags:', error);
    return DEFAULT_FLAGS;
  }
}

/**
 * Check if referrals are enabled globally
 */
export async function areReferralsEnabled(): Promise<boolean> {
  const flags = await getReferralFlags();
  return flags['referrals.enabled'] === true;
}

/**
 * Check if influencer referrals are enabled
 */
export async function areInfluencerReferralsEnabled(): Promise<boolean> {
  const flags = await getReferralFlags();
  return flags['referrals.enabled'] === true && flags['referrals.influencer.enabled'] === true;
}

/**
 * Check if campaign referrals are enabled
 */
export async function areCampaignReferralsEnabled(): Promise<boolean> {
  const flags = await getReferralFlags();
  return flags['referrals.enabled'] === true && flags['referrals.campaigns.enabled'] === true;
}

/**
 * Check if referrals are enabled for a specific region
 */
export async function areReferralsEnabledForRegion(countryCode: string): Promise<boolean> {
  const flags = await getReferralFlags();

  if (flags['referrals.enabled'] !== true) {
    return false;
  }

  const regionFlag = `referrals.region.${countryCode}.enabled` as keyof ReferralFeatureFlags;

  // If region-specific flag exists, use it; otherwise default to enabled
  if (regionFlag in flags) {
    return flags[regionFlag] === true;
  }

  return true; // Default to enabled if no region-specific flag
}

/**
 * Set feature flag (admin only)
 */
export async function setReferralFlag(
  flagName: keyof ReferralFeatureFlags,
  value: boolean
): Promise<void> {
  try {
    await db
      .collection('featureFlags')
      .doc('referrals')
      .set(
        {
          [flagName]: value,
          updatedAt: admin.firestore.Timestamp.now(),
        },
        { merge: true }
      );

    logger.info(`Set referral flag ${flagName} to ${value}`);
  } catch (error) {
    logger.error('Error setting referral flag:', error);
    throw error;
  }
}

/**
 * Enable referrals globally
 */
export async function enableReferrals(): Promise<void> {
  await setReferralFlag('referrals.enabled', true);
}

/**
 * Disable referrals globally
 */
export async function disableReferrals(): Promise<void> {
  await setReferralFlag('referrals.enabled', false);
}

/**
 * Enable referrals for a specific region
 */
export async function enableReferralsForRegion(countryCode: string): Promise<void> {
  const flagName = `referrals.region.${countryCode}.enabled` as keyof ReferralFeatureFlags;
  await setReferralFlag(flagName, true);
}

/**
 * Disable referrals for a specific region (throttle)
 */
export async function disableReferralsForRegion(countryCode: string): Promise<void> {
  const flagName = `referrals.region.${countryCode}.enabled` as keyof ReferralFeatureFlags;
  await setReferralFlag(flagName, false);
}

/**
 * Get all region-specific flags
 */
export async function getRegionFlags(): Promise<Record<string, boolean>> {
  const flags = await getReferralFlags();
  const regionFlags: Record<string, boolean> = {};

  for (const [key, value] of Object.entries(flags)) {
    if (key.startsWith('referrals.region.') && key.endsWith('.enabled')) {
      const countryCode = key.replace('referrals.region.', '').replace('.enabled', '');
      regionFlags[countryCode] = value as boolean;
    }
  }

  return regionFlags;
}
