/**
 * PACK 108 — Region Compliance Enforcement
 * Three-layer compliance gate: Legal → Platform → Payment
 */

import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  NSFWLevel,
  NSFWComplianceCheck,
  RegionalNSFWPolicy,
  APP_STORE_RESTRICTIONS,
  PSP_NSFW_RESTRICTIONS,
  GLOBAL_MINIMUM_AGE_NSFW,
} from './pack108-types';
import { resolveUserPolicyContext } from './pack91-policy-engine';

// ============================================================================
// COMPLIANCE CHECKS
// ============================================================================

/**
 * Three-layer compliance check
 * The strictest rule wins
 */
export async function checkNSFWCompliance(
  userId: string,
  nsfwLevel: NSFWLevel,
  action: 'VIEW' | 'MONETIZE'
): Promise<NSFWComplianceCheck> {
  try {
    console.log(`[PACK108] Checking NSFW compliance for user ${userId}, level ${nsfwLevel}, action ${action}`);

    // SAFE content always passes
    if (nsfwLevel === 'SAFE') {
      return {
        allowed: true,
        legallyAllowed: true,
        platformAllowed: true,
        pspAllowed: true,
        canView: true,
        canMonetize: true,
      };
    }

    // Get user's region policy
    const policyContext = await resolveUserPolicyContext(userId);
    const userAge = policyContext.age;
    const regionCode = policyContext.countryCode;
    
    // Get regional NSFW policy
    const regionalPolicy = await getRegionalNSFWPolicy(regionCode);

    // Layer 1: Legal check
    const legalCheck = checkLegalCompliance(nsfwLevel, regionalPolicy, userAge);

    // Layer 2: Platform (App Store) check
    const platformCheck = checkPlatformCompliance(nsfwLevel);

    // Layer 3: Payment provider check (only for monetization)
    let pspCheck: { allowed: boolean; reason?: string } = { allowed: true, reason: undefined };
    if (action === 'MONETIZE') {
      pspCheck = await checkPSPCompliance(userId, nsfwLevel);
    }

    // Aggregate results - strictest rule wins
    const allowed = legalCheck.allowed && platformCheck.allowed && pspCheck.allowed;
    const canView = legalCheck.allowed && platformCheck.allowed;
    const canMonetize = allowed && action === 'MONETIZE';

    let blockReason: string | undefined;
    if (!allowed) {
      if (!legalCheck.allowed) blockReason = legalCheck.reason;
      else if (!platformCheck.allowed) blockReason = platformCheck.reason;
      else if (!pspCheck.allowed) blockReason = pspCheck.reason;
    }

    const result: NSFWComplianceCheck = {
      allowed,
      legallyAllowed: legalCheck.allowed,
      legalBlockReason: legalCheck.reason,
      platformAllowed: platformCheck.allowed,
      platformBlockReason: platformCheck.reason,
      pspAllowed: pspCheck.allowed,
      pspBlockReason: pspCheck.reason,
      blockReason,
      canView,
      canMonetize,
    };

    console.log(`[PACK108] Compliance check result: ${allowed ? 'ALLOWED' : 'BLOCKED'}`);
    return result;
  } catch (error) {
    console.error(`[PACK108] Error checking NSFW compliance:`, error);
    
    // Fail-safe: deny access on error
    return {
      allowed: false,
      legallyAllowed: false,
      legalBlockReason: 'Error checking compliance',
      platformAllowed: false,
      pspAllowed: false,
      blockReason: 'System error during compliance check',
      canView: false,
      canMonetize: false,
    };
  }
}

/**
 * Layer 1: Legal compliance check
 */
function checkLegalCompliance(
  nsfwLevel: NSFWLevel,
  policy: RegionalNSFWPolicy,
  userAge: number
): { allowed: boolean; reason?: string } {
  // BANNED content never allowed
  if (nsfwLevel === 'BANNED') {
    return {
      allowed: false,
      reason: 'Content is prohibited',
    };
  }

  // Check age requirement
  if (userAge < policy.legalMinimumAge) {
    return {
      allowed: false,
      reason: `Minimum age ${policy.legalMinimumAge} required`,
    };
  }

  // Check if region allows NSFW at all
  if (!policy.nsfwLegallyAllowed) {
    return {
      allowed: false,
      reason: 'Adult content is not legal in your region',
    };
  }

  // Check specific levels
  if (nsfwLevel === 'NSFW_EXPLICIT' && !policy.explicitContentLegallyAllowed) {
    return {
      allowed: false,
      reason: 'Explicit adult content is not legal in your region',
    };
  }

  return { allowed: true };
}

/**
 * Layer 2: Platform (App Store) compliance check
 */
function checkPlatformCompliance(
  nsfwLevel: NSFWLevel
): { allowed: boolean; reason?: string } {
  // BANNED content never allowed
  if (nsfwLevel === 'BANNED') {
    return {
      allowed: false,
      reason: 'Content violates platform policies',
    };
  }

  // Check Apple App Store restrictions (most restrictive)
  const appleRestrictions = APP_STORE_RESTRICTIONS.APPLE;
  if (!appleRestrictions.allowedLevels.includes(nsfwLevel)) {
    return {
      allowed: false,
      reason: 'Content not permitted by app store guidelines',
    };
  }

  return { allowed: true };
}

/**
 * Layer 3: Payment provider compliance check
 */
async function checkPSPCompliance(
  userId: string,
  nsfwLevel: NSFWLevel
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Get user's payment provider
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const pspName = userData?.paymentProvider || 'STRIPE'; // Default to Stripe

    // Get PSP restrictions
    const pspRestrictions = PSP_NSFW_RESTRICTIONS[pspName.toUpperCase()];
    
    if (!pspRestrictions) {
      // Unknown PSP, use most restrictive defaults
      return {
        allowed: nsfwLevel === 'SAFE',
        reason: 'Payment provider restrictions unknown',
      };
    }

    if (!pspRestrictions.allowsNSFW) {
      return {
        allowed: false,
        reason: 'Payment provider does not support adult content monetization',
      };
    }

    if (!pspRestrictions.allowedLevels.includes(nsfwLevel)) {
      return {
        allowed: false,
        reason: 'Content level not supported by payment provider',
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error(`[PACK108] Error checking PSP compliance:`, error);
    // Fail-safe: deny monetization on error
    return {
      allowed: false,
      reason: 'Error checking payment provider compliance',
    };
  }
}

// ============================================================================
// REGIONAL NSFW POLICY MANAGEMENT
// ============================================================================

/**
 * Get regional NSFW policy
 */
export async function getRegionalNSFWPolicy(
  regionCode: string
): Promise<RegionalNSFWPolicy> {
  try {
    // Try to find country-specific policy
    const policyDoc = await db
      .collection('regional_nsfw_policies')
      .doc(regionCode)
      .get();

    if (policyDoc.exists) {
      return policyDoc.data() as RegionalNSFWPolicy;
    }

    // Try region group
    const regionGroup = getRegionGroup(regionCode);
    if (regionGroup) {
      const groupDoc = await db
        .collection('regional_nsfw_policies')
        .doc(regionGroup)
        .get();

      if (groupDoc.exists) {
        return groupDoc.data() as RegionalNSFWPolicy;
      }
    }

    // Fall back to global default
    return await getGlobalNSFWPolicy();
  } catch (error) {
    console.error(`[PACK108] Error getting regional NSFW policy:`, error);
    return await getGlobalNSFWPolicy();
  }
}

/**
 * Get or create global NSFW policy
 */
async function getGlobalNSFWPolicy(): Promise<RegionalNSFWPolicy> {
  try {
    const globalDoc = await db
      .collection('regional_nsfw_policies')
      .doc('GLOBAL_DEFAULT')
      .get();

    if (globalDoc.exists) {
      return globalDoc.data() as RegionalNSFWPolicy;
    }

    // Create default global policy
    const defaultPolicy: RegionalNSFWPolicy = {
      regionCode: 'GLOBAL_DEFAULT',
      scope: 'GLOBAL_DEFAULT',
      nsfwLegallyAllowed: true,
      explicitContentLegallyAllowed: false, // More restrictive by default
      legalMinimumAge: GLOBAL_MINIMUM_AGE_NSFW,
      appStoreRestrictionsApply: true,
      appStoreAllowedLevels: ['SAFE', 'SOFT_NSFW'], // No explicit by default
      pspAllowsNSFWMonetization: true,
      pspAllowedLevels: ['SAFE', 'SOFT_NSFW'],
      blockUnverifiedUsers: true,
      requireExplicitOptIn: true,
      updatedAt: serverTimestamp() as Timestamp,
      updatedBy: 'SYSTEM',
      notes: 'Default global policy - restrictive',
    };

    await db
      .collection('regional_nsfw_policies')
      .doc('GLOBAL_DEFAULT')
      .set(defaultPolicy);

    return defaultPolicy;
  } catch (error) {
    console.error(`[PACK108] Error getting/creating global policy:`, error);
    throw error;
  }
}

/**
 * Update regional NSFW policy (admin only)
 */
export async function updateRegionalNSFWPolicy(
  regionCode: string,
  updates: Partial<RegionalNSFWPolicy>,
  updatedBy: string
): Promise<RegionalNSFWPolicy> {
  try {
    const policyDoc = await db
      .collection('regional_nsfw_policies')
      .doc(regionCode)
      .get();

    const currentPolicy = policyDoc.exists
      ? (policyDoc.data() as RegionalNSFWPolicy)
      : await getGlobalNSFWPolicy();

    const updatedPolicy: RegionalNSFWPolicy = {
      ...currentPolicy,
      ...updates,
      regionCode,
      updatedAt: serverTimestamp() as Timestamp,
      updatedBy,
    };

    await db
      .collection('regional_nsfw_policies')
      .doc(regionCode)
      .set(updatedPolicy);

    console.log(`[PACK108] Updated NSFW policy for region ${regionCode}`);

    // Trigger user preference updates for affected region
    if (
      updates.nsfwLegallyAllowed !== undefined ||
      updates.explicitContentLegallyAllowed !== undefined
    ) {
      await scheduleUserPreferenceUpdates(regionCode);
    }

    return updatedPolicy;
  } catch (error) {
    console.error(`[PACK108] Error updating regional policy:`, error);
    throw error;
  }
}

/**
 * Schedule user preference updates after policy change
 */
async function scheduleUserPreferenceUpdates(regionCode: string): Promise<void> {
  try {
    // Create job for background processing
    const jobId = `nsfw_policy_update_${regionCode}_${Date.now()}`;
    
    await db.collection('region_legality_check_jobs').doc(jobId).set({
      jobId,
      regionCode,
      status: 'PENDING',
      startedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });

    console.log(`[PACK108] Scheduled preference updates for region ${regionCode}`);
  } catch (error) {
    console.error(`[PACK108] Error scheduling preference updates:`, error);
  }
}

// ============================================================================
// MONETIZATION CHECKS
// ============================================================================

/**
 * Check if NSFW content can be monetized for buyer/seller pair
 */
export async function checkNSFWMonetization(
  buyerId: string,
  sellerId: string,
  nsfwLevel: NSFWLevel
): Promise<{
  allowed: boolean;
  reason?: string;
  buyerRegion: string;
  sellerRegion: string;
}> {
  try {
    // SAFE content can always be monetized
    if (nsfwLevel === 'SAFE') {
      return {
        allowed: true,
        buyerRegion: 'N/A',
        sellerRegion: 'N/A',
      };
    }

    // Check buyer compliance
    const buyerCompliance = await checkNSFWCompliance(buyerId, nsfwLevel, 'MONETIZE');
    
    // Check seller compliance
    const sellerCompliance = await checkNSFWCompliance(sellerId, nsfwLevel, 'MONETIZE');

    // Get regions for logging
    const buyerContext = await resolveUserPolicyContext(buyerId);
    const sellerContext = await resolveUserPolicyContext(sellerId);

    // Both must pass
    const allowed = buyerCompliance.canMonetize && sellerCompliance.canMonetize;

    let reason: string | undefined;
    if (!allowed) {
      if (!buyerCompliance.canMonetize) {
        reason = `Buyer: ${buyerCompliance.blockReason}`;
      } else if (!sellerCompliance.canMonetize) {
        reason = `Seller: ${sellerCompliance.blockReason}`;
      }
    }

    return {
      allowed,
      reason,
      buyerRegion: buyerContext.countryCode,
      sellerRegion: sellerContext.countryCode,
    };
  } catch (error) {
    console.error(`[PACK108] Error checking NSFW monetization:`, error);
    return {
      allowed: false,
      reason: 'Error checking monetization compliance',
      buyerRegion: 'ERROR',
      sellerRegion: 'ERROR',
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Map country codes to region groups
 */
function getRegionGroup(countryCode: string): string | null {
  const regionMap: Record<string, string> = {
    // European Union
    'AT': 'EU', 'BE': 'EU', 'BG': 'EU', 'HR': 'EU', 'CY': 'EU', 'CZ': 'EU',
    'DK': 'EU', 'EE': 'EU', 'FI': 'EU', 'FR': 'EU', 'DE': 'EU', 'GR': 'EU',
    'HU': 'EU', 'IE': 'EU', 'IT': 'EU', 'LV': 'EU', 'LT': 'EU', 'LU': 'EU',
    'MT': 'EU', 'NL': 'EU', 'PL': 'EU', 'PT': 'EU', 'RO': 'EU', 'SK': 'EU',
    'SI': 'EU', 'ES': 'EU', 'SE': 'EU',
    
    // Middle East & North Africa (more restrictive)
    'AE': 'MENA', 'BH': 'MENA', 'DZ': 'MENA', 'EG': 'MENA', 'IQ': 'MENA',
    'JO': 'MENA', 'KW': 'MENA', 'LB': 'MENA', 'LY': 'MENA', 'MA': 'MENA',
    'OM': 'MENA', 'QA': 'MENA', 'SA': 'MENA', 'TN': 'MENA', 'YE': 'MENA',
    
    // Asia-Pacific
    'AU': 'APAC', 'CN': 'APAC', 'HK': 'APAC', 'IN': 'APAC', 'ID': 'APAC',
    'JP': 'APAC', 'KR': 'APAC', 'MY': 'APAC', 'NZ': 'APAC', 'PH': 'APAC',
    'SG': 'APAC', 'TH': 'APAC', 'VN': 'APAC',
    
    // North America
    'US': 'NA', 'CA': 'NA', 'MX': 'NA',
  };
  
  return regionMap[countryCode] || null;
}

/**
 * Get user-friendly compliance message
 */
export function getComplianceMessage(check: NSFWComplianceCheck): string {
  if (check.allowed) {
    return 'Content is available in your region';
  }

  if (!check.legallyAllowed) {
    return check.legalBlockReason || 'This content is not available in your region due to local laws';
  }

  if (!check.platformAllowed) {
    return check.platformBlockReason || 'This content is not available due to platform guidelines';
  }

  if (!check.pspAllowed) {
    return check.pspBlockReason || 'Monetization is not available for this content type';
  }

  return check.blockReason || 'This content is not available';
}