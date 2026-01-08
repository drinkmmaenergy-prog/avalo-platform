/**
 * PACK 55 — Compliance Guard
 * Central access control for age-restricted and policy-gated features
 */

import { isAgeVerified } from '../services/ageGateService';
import { hasAcceptedCriticalPolicies } from '../services/policyService';

// ============================================================================
// FEATURE ACCESS CHECKS
// ============================================================================

/**
 * Check if user can access age-restricted features
 * This includes: swipe, chat, AI companions, creator features, marketplace, earnings, PPM, Royal Club
 */
export async function canAccessAgeRestrictedFeatures(userId: string): Promise<boolean> {
  try {
    const verified = await isAgeVerified(userId);
    return verified;
  } catch (error) {
    console.error('[ComplianceGuard] Error checking age verification:', error);
    return false;
  }
}

/**
 * Check if user has accepted critical policies
 */
export async function canAccessApp(userId: string, locale: string): Promise<boolean> {
  try {
    const accepted = await hasAcceptedCriticalPolicies(userId, locale);
    return accepted;
  } catch (error) {
    console.error('[ComplianceGuard] Error checking policy acceptance:', error);
    return false;
  }
}

/**
 * Check if user can access monetized/earning features
 * Requires both age verification and policy acceptance
 */
export async function canAccessMonetizedFeatures(
  userId: string,
  locale: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Check age verification
    const ageVerified = await isAgeVerified(userId);
    if (!ageVerified) {
      return { allowed: false, reason: 'AGE_NOT_VERIFIED' };
    }

    // Check policy acceptance
    const policiesAccepted = await hasAcceptedCriticalPolicies(userId, locale);
    if (!policiesAccepted) {
      return { allowed: false, reason: 'POLICIES_NOT_ACCEPTED' };
    }

    return { allowed: true };
  } catch (error) {
    console.error('[ComplianceGuard] Error checking monetized feature access:', error);
    return { allowed: false, reason: 'ERROR' };
  }
}

/**
 * List of features that require age verification
 */
export const AGE_RESTRICTED_FEATURES = [
  'SWIPE',
  'CHAT',
  'AI_COMPANIONS',
  'CREATOR_EARNINGS',
  'PPM_MEDIA',
  'ROYAL_CLUB',
  'CREATOR_MARKETPLACE',
  'CALLS',
  'MEET_MARKETPLACE',
  'GOALS',
  'LIVE_STREAMING',
] as const;

export type AgeRestrictedFeature = typeof AGE_RESTRICTED_FEATURES[number];

/**
 * Check if a specific feature requires age verification
 */
export function requiresAgeVerification(feature: string): boolean {
  return AGE_RESTRICTED_FEATURES.includes(feature as AgeRestrictedFeature);
}