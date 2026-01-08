/**
 * PACK 91 — Regional Policy Engine & Content Classification
 * Core Policy Resolution and Access Control
 * 
 * Provides central policy enforcement for content classification and regional compliance.
 * 
 * KEY FUNCTIONS:
 * - resolveUserPolicyContext: Determine user's region and applicable policy
 * - canUserViewContent: Check if user can view specific content
 * - canMonetizeContent: Check if content can be monetized in region
 * 
 * COMPLIANCE:
 * - No tokenomics changes
 * - No revenue split changes
 * - Only controls access, not pricing
 */

import { db } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  ContentRating,
  RegionalPolicy,
  UserPolicyContext,
  ViewDecision,
  MonetizationDecision,
  ViewContentOptions,
  FeatureContext,
  PolicyScope,
  AccessDenialReason,
  MonetizationDenialReason,
  DEFAULT_GLOBAL_POLICY,
} from './pack91-types';

// ============================================================================
// POLICY RESOLUTION
// ============================================================================

/**
 * Resolve the applicable regional policy for a user
 * Resolution order:
 * 1. Specific COUNTRY policy (if exists)
 * 2. REGION_GROUP policy (if exists)
 * 3. GLOBAL_DEFAULT fallback
 */
export async function resolveUserPolicyContext(userId: string): Promise<UserPolicyContext> {
  try {
    // Get user profile to extract country and DOB
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      throw new Error(`User ${userId} not found`);
    }
    
    const userData = userDoc.data();
    
    // Extract country code (priority: profile > IP-based > default)
    const countryCode = extractCountryCode(userData);
    
    // Calculate age from date of birth
    const age = calculateAge(userData?.dateOfBirth);
    
    // Check if user has completed age verification
    const isVerified = userData?.ageVerified === true || age >= 18;
    
    // Resolve policy (country > region > global)
    const policy = await resolvePolicyForCountry(countryCode);
    
    return {
      userId,
      countryCode,
      age,
      policy,
      isVerified,
    };
  } catch (error) {
    console.error('[Pack91] Failed to resolve user policy context:', error);
    
    // Fallback to most restrictive policy on error
    return {
      userId,
      countryCode: 'UNKNOWN',
      age: 0,
      policy: await getGlobalPolicy(),
      isVerified: false,
    };
  }
}

/**
 * Extract country code from user data
 * Priority: profile.country > ipCountry > 'UNKNOWN'
 */
function extractCountryCode(userData: any): string {
  if (userData?.profile?.country) {
    return userData.profile.country.toUpperCase();
  }
  
  if (userData?.ipCountry) {
    return userData.ipCountry.toUpperCase();
  }
  
  return 'UNKNOWN';
}

/**
 * Calculate user age from date of birth
 */
function calculateAge(dateOfBirth: any): number {
  if (!dateOfBirth) {
    return 0;
  }
  
  try {
    let dobDate: Date;
    
    // Handle Firestore Timestamp
    if (dateOfBirth.toDate) {
      dobDate = dateOfBirth.toDate();
    } else if (typeof dateOfBirth === 'string') {
      dobDate = new Date(dateOfBirth);
    } else if (dateOfBirth instanceof Date) {
      dobDate = dateOfBirth;
    } else {
      return 0;
    }
    
    const today = new Date();
    let age = today.getFullYear() - dobDate.getFullYear();
    const monthDiff = today.getMonth() - dobDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) {
      age--;
    }
    
    return Math.max(0, age);
  } catch (error) {
    console.error('[Pack91] Failed to calculate age:', error);
    return 0;
  }
}

/**
 * Resolve policy for a specific country code
 * Resolution order: COUNTRY > REGION_GROUP > GLOBAL
 */
async function resolvePolicyForCountry(countryCode: string): Promise<RegionalPolicy> {
  try {
    // Try to find country-specific policy
    const countryPolicySnapshot = await db.collection('regional_policies')
      .where('scope', '==', 'COUNTRY')
      .where('countryCode', '==', countryCode)
      .limit(1)
      .get();
    
    if (!countryPolicySnapshot.empty) {
      return countryPolicySnapshot.docs[0].data() as RegionalPolicy;
    }
    
    // Try to find region group policy
    const regionGroup = getRegionGroup(countryCode);
    if (regionGroup) {
      const regionPolicySnapshot = await db.collection('regional_policies')
        .where('scope', '==', 'REGION_GROUP')
        .where('regionGroup', '==', regionGroup)
        .limit(1)
        .get();
      
      if (!regionPolicySnapshot.empty) {
        return regionPolicySnapshot.docs[0].data() as RegionalPolicy;
      }
    }
    
    // Fallback to global policy
    return await getGlobalPolicy();
  } catch (error) {
    console.error('[Pack91] Failed to resolve policy:', error);
    return await getGlobalPolicy();
  }
}

/**
 * Get global default policy (creates if doesn't exist)
 */
async function getGlobalPolicy(): Promise<RegionalPolicy> {
  try {
    const globalDoc = await db.collection('regional_policies').doc('GLOBAL_DEFAULT').get();
    
    if (globalDoc.exists) {
      return globalDoc.data() as RegionalPolicy;
    }
    
    // Create default global policy
    const policy: RegionalPolicy = {
      id: 'GLOBAL_DEFAULT',
      ...DEFAULT_GLOBAL_POLICY,
      updatedAt: Timestamp.now(),
    };
    
    await db.collection('regional_policies').doc('GLOBAL_DEFAULT').set(policy);
    
    return policy;
  } catch (error) {
    console.error('[Pack91] Failed to get global policy:', error);
    // Return in-memory default as last resort
    return {
      id: 'GLOBAL_DEFAULT',
      ...DEFAULT_GLOBAL_POLICY,
      updatedAt: Timestamp.now(),
    };
  }
}

/**
 * Map country codes to region groups
 * This is a simplified mapping - expand as needed
 */
function getRegionGroup(countryCode: string): string | null {
  const regionMap: Record<string, string> = {
    // European Union
    'AT': 'EU', 'BE': 'EU', 'BG': 'EU', 'HR': 'EU', 'CY': 'EU', 'CZ': 'EU',
    'DK': 'EU', 'EE': 'EU', 'FI': 'EU', 'FR': 'EU', 'DE': 'EU', 'GR': 'EU',
    'HU': 'EU', 'IE': 'EU', 'IT': 'EU', 'LV': 'EU', 'LT': 'EU', 'LU': 'EU',
    'MT': 'EU', 'NL': 'EU', 'PL': 'EU', 'PT': 'EU', 'RO': 'EU', 'SK': 'EU',
    'SI': 'EU', 'ES': 'EU', 'SE': 'EU',
    
    // Middle East & North Africa
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

// ============================================================================
// ACCESS DECISION ENGINE
// ============================================================================

/**
 * Check if user can view content based on rating and policy
 * 
 * @param userId - User attempting to view content
 * @param contentRating - Content classification rating
 * @param options - Additional context (owner, feature, etc.)
 * @returns ViewDecision with allowed status and reason
 */
export async function canUserViewContent(
  userId: string,
  contentRating: ContentRating,
  options?: ViewContentOptions
): Promise<ViewDecision> {
  try {
    // SFW content is always allowed
    if (contentRating === 'SFW') {
      return { allowed: true };
    }
    
    // Resolve user context (region + age + policy)
    const context = await resolveUserPolicyContext(userId);
    
    // Skip checks for testing/admin (if specified)
    if (options?.skipAgeCheck && options?.skipPolicyCheck) {
      return { allowed: true };
    }
    
    // Check age verification
    if (!context.isVerified && !options?.skipAgeCheck) {
      return {
        allowed: false,
        reasonCode: 'NOT_VERIFIED',
        policyId: context.policy.id,
      };
    }
    
    // Check content rating against policy
    const policyDecision = checkPolicyAllowsContent(
      contentRating,
      context.policy,
      options?.featureContext
    );
    
    if (!policyDecision.allowed) {
      return policyDecision;
    }
    
    // Check age restrictions
    const ageDecision = checkAgeRequirement(
      contentRating,
      context.age,
      context.policy,
      options?.skipAgeCheck
    );
    
    if (!ageDecision.allowed) {
      return ageDecision;
    }
    
    // All checks passed
    return {
      allowed: true,
      policyId: context.policy.id,
    };
  } catch (error) {
    console.error('[Pack91] canUserViewContent failed:', error);
    // On error, deny access (fail-safe)
    return {
      allowed: false,
      reasonCode: 'POLICY_BLOCKED',
    };
  }
}

/**
 * Check if policy allows this content rating
 */
function checkPolicyAllowsContent(
  contentRating: ContentRating,
  policy: RegionalPolicy,
  featureContext?: FeatureContext
): ViewDecision {
  // Check based on content rating
  switch (contentRating) {
    case 'SFW':
      return { allowed: true };
    
    case 'SENSITIVE':
      // Sensitive content is typically allowed everywhere
      return { allowed: true };
    
    case 'NSFW_SOFT':
      // Check if policy allows NSFW soft
      if (!policy.allowNSFWSoft) {
        return {
          allowed: false,
          reasonCode: 'REGION_BLOCKED',
          policyId: policy.id,
        };
      }
      
      // Check discovery restrictions
      if (featureContext === 'FEED' && !policy.showInDiscoveryNSFW) {
        return {
          allowed: false,
          reasonCode: 'DISCOVERY_BLOCKED',
          policyId: policy.id,
        };
      }
      
      return { allowed: true };
    
    case 'NSFW_STRONG':
      // Check if policy allows NSFW strong
      if (!policy.allowNSFWStrong) {
        return {
          allowed: false,
          reasonCode: 'REGION_BLOCKED',
          policyId: policy.id,
        };
      }
      
      // Check discovery restrictions
      if (featureContext === 'FEED' && !policy.showInDiscoveryNSFW) {
        return {
          allowed: false,
          reasonCode: 'DISCOVERY_BLOCKED',
          policyId: policy.id,
        };
      }
      
      return { allowed: true };
    
    default:
      // Unknown rating - deny by default
      return {
        allowed: false,
        reasonCode: 'POLICY_BLOCKED',
        policyId: policy.id,
      };
  }
}

/**
 * Check if user meets age requirement for content
 */
function checkAgeRequirement(
  contentRating: ContentRating,
  userAge: number,
  policy: RegionalPolicy,
  skipAgeCheck?: boolean
): ViewDecision {
  if (skipAgeCheck) {
    return { allowed: true };
  }
  
  let requiredAge: number;
  
  switch (contentRating) {
    case 'SFW':
      return { allowed: true };
    
    case 'SENSITIVE':
      requiredAge = policy.minAgeForSensitive;
      break;
    
    case 'NSFW_SOFT':
      requiredAge = policy.minAgeForNSFWSoft;
      break;
    
    case 'NSFW_STRONG':
      requiredAge = policy.minAgeForNSFWStrong;
      break;
    
    default:
      requiredAge = 18; // Default minimum
  }
  
  if (userAge < requiredAge) {
    return {
      allowed: false,
      reasonCode: 'AGE_RESTRICTED',
      requiresAge: requiredAge,
    };
  }
  
  return { allowed: true };
}

// ============================================================================
// MONETIZATION POLICY CHECKS
// ============================================================================

/**
 * Check if content can be monetized based on rating and region policy
 * 
 * @param contentRating - Content classification rating
 * @param userRegionPolicy - Regional policy for creator's location
 * @returns MonetizationDecision with allowed status and reason
 */
export function canMonetizeContent(
  contentRating: ContentRating,
  userRegionPolicy: RegionalPolicy
): MonetizationDecision {
  try {
    // SFW content can always be monetized
    if (contentRating === 'SFW') {
      return {
        allowed: true,
        policyId: userRegionPolicy.id,
      };
    }
    
    // Sensitive content typically monetizable
    if (contentRating === 'SENSITIVE') {
      return {
        allowed: true,
        policyId: userRegionPolicy.id,
      };
    }
    
    // NSFW soft monetization check
    if (contentRating === 'NSFW_SOFT') {
      if (!userRegionPolicy.monetizeNSFWSoft) {
        return {
          allowed: false,
          reasonCode: 'POLICY_BLOCKED',
          policyId: userRegionPolicy.id,
        };
      }
      return {
        allowed: true,
        policyId: userRegionPolicy.id,
      };
    }
    
    // NSFW strong monetization check
    if (contentRating === 'NSFW_STRONG') {
      if (!userRegionPolicy.monetizeNSFWStrong) {
        return {
          allowed: false,
          reasonCode: 'POLICY_BLOCKED',
          policyId: userRegionPolicy.id,
        };
      }
      return {
        allowed: true,
        policyId: userRegionPolicy.id,
      };
    }
    
    // Unknown rating - deny by default
    return {
      allowed: false,
      reasonCode: 'CONTENT_RATING',
      policyId: userRegionPolicy.id,
    };
  } catch (error) {
    console.error('[Pack91] canMonetizeContent failed:', error);
    // On error, deny monetization (fail-safe)
    return {
      allowed: false,
      reasonCode: 'POLICY_BLOCKED',
    };
  }
}

/**
 * Check if content can be monetized (async version that resolves creator's policy)
 * 
 * @param contentRating - Content classification rating
 * @param creatorId - ID of content creator
 * @returns MonetizationDecision
 */
export async function canMonetizeContentForCreator(
  contentRating: ContentRating,
  creatorId: string
): Promise<MonetizationDecision> {
  try {
    const creatorContext = await resolveUserPolicyContext(creatorId);
    return canMonetizeContent(contentRating, creatorContext.policy);
  } catch (error) {
    console.error('[Pack91] canMonetizeContentForCreator failed:', error);
    return {
      allowed: false,
      reasonCode: 'POLICY_BLOCKED',
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if content should be shown in discovery/feed
 * More restrictive than direct access
 */
export async function canShowInDiscovery(
  userId: string,
  contentRating: ContentRating
): Promise<boolean> {
  const decision = await canUserViewContent(userId, contentRating, {
    featureContext: 'FEED',
  });
  
  return decision.allowed;
}

/**
 * Get reason message for access denial (for UI display)
 */
export function getAccessDenialMessage(
  reasonCode: AccessDenialReason,
  requiresAge?: number
): string {
  switch (reasonCode) {
    case 'AGE_RESTRICTED':
      return `This content is restricted to users ${requiresAge || 18}+ years old.`;
    
    case 'REGION_BLOCKED':
      return 'This content is not available in your region.';
    
    case 'POLICY_BLOCKED':
      return 'This content is restricted based on local policies.';
    
    case 'STORE_COMPLIANCE':
      return 'This content is not available due to store compliance requirements.';
    
    case 'NOT_VERIFIED':
      return 'Please complete age verification to view this content.';
    
    case 'DISCOVERY_BLOCKED':
      return 'This content is not shown in discovery feeds in your region.';
    
    default:
      return 'This content is not available.';
  }
}

/**
 * Get reason message for monetization denial
 */
export function getMonetizationDenialMessage(
  reasonCode: MonetizationDenialReason
): string {
  switch (reasonCode) {
    case 'REGION_BLOCKED':
      return 'Content monetization is not available in your region.';
    
    case 'CONTENT_RATING':
      return 'This content rating cannot be monetized.';
    
    case 'POLICY_BLOCKED':
      return 'Monetization is restricted based on regional policies.';
    
    case 'STORE_COMPLIANCE':
      return 'Monetization is not available due to store compliance requirements.';
    
    default:
      return 'Monetization not available for this content.';
  }
}