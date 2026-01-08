/**
 * PACK 55 — Policy Service
 * Manages policy documents and user acceptances
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

// ============================================================================
// TYPES
// ============================================================================

export type PolicyType =
  | 'TERMS'
  | 'PRIVACY'
  | 'SAFETY'
  | 'AML'
  | 'MONETIZATION'
  | 'MARKETPLACE'
  | 'COOKIES';

export interface PolicyDocument {
  policyType: PolicyType;
  version: string;
  title: string;
  contentMarkdown: string;
}

export interface PolicyAcceptance {
  policyType: PolicyType;
  acceptedVersion: string;
  acceptedAt: number;
}

export interface PolicyState {
  policies: PolicyDocument[];
  acceptances: PolicyAcceptance[];
  locale: string;
  lastFetchedAt: number;
}

// ============================================================================
// STORAGE KEYS
// ============================================================================

const POLICY_STATE_KEY = (locale: string) => `policy_state_v1_${locale}`;
const POLICY_ACCEPTANCES_KEY = (userId: string) => `policy_acceptances_v1_${userId}`;

// ============================================================================
// CRITICAL POLICIES
// ============================================================================

// These policies must be accepted before using the app
export const CRITICAL_POLICY_TYPES: PolicyType[] = [
  'TERMS',
  'PRIVACY',
  'SAFETY',
  'MONETIZATION',
];

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Fetch latest policies for a locale
 */
export async function fetchLatestPolicies(locale: string): Promise<PolicyDocument[]> {
  try {
    // Try cache first
    const cached = await AsyncStorage.getItem(POLICY_STATE_KEY(locale));
    if (cached) {
      const parsed: PolicyState = JSON.parse(cached);
      // Return cached if less than 24 hours old
      if (Date.now() - parsed.lastFetchedAt < 24 * 60 * 60 * 1000) {
        return parsed.policies;
      }
    }

    // Fetch from backend
    const getLatestPoliciesCallable = httpsCallable(functions, 'policies_getLatest');
    const result = await getLatestPoliciesCallable({ locale });
    const data = result.data as any;

    const policies: PolicyDocument[] = data.policies;

    // Cache the result
    const policyState: PolicyState = {
      policies,
      acceptances: [],
      locale: data.locale,
      lastFetchedAt: Date.now(),
    };
    await AsyncStorage.setItem(POLICY_STATE_KEY(locale), JSON.stringify(policyState));

    return policies;
  } catch (error) {
    console.error('[PolicyService] Error fetching latest policies:', error);
    throw error;
  }
}

/**
 * Fetch user's policy acceptances
 */
export async function fetchUserPolicyAcceptances(userId: string): Promise<PolicyAcceptance[]> {
  try {
    // Try cache first
    const cached = await AsyncStorage.getItem(POLICY_ACCEPTANCES_KEY(userId));
    if (cached) {
      const parsed = JSON.parse(cached);
      // Return cached if less than 1 hour old
      if (Date.now() - parsed.lastFetchedAt < 60 * 60 * 1000) {
        return parsed.acceptances;
      }
    }

    // Fetch from backend
    const getUserAcceptancesCallable = httpsCallable(functions, 'policies_getUserAcceptances');
    const result = await getUserAcceptancesCallable({ userId });
    const data = result.data as any;

    const acceptances: PolicyAcceptance[] = data.acceptances;

    // Cache the result
    await AsyncStorage.setItem(
      POLICY_ACCEPTANCES_KEY(userId),
      JSON.stringify({ acceptances, lastFetchedAt: Date.now() })
    );

    return acceptances;
  } catch (error) {
    console.error('[PolicyService] Error fetching user acceptances:', error);
    throw error;
  }
}

/**
 * Accept a policy
 */
export async function acceptPolicy(
  userId: string,
  policyType: PolicyType,
  version: string
): Promise<void> {
  try {
    const acceptPolicyCallable = httpsCallable(functions, 'policies_accept');
    await acceptPolicyCallable({
      userId,
      policyType,
      version,
    });

    // Clear cache to force refresh
    await AsyncStorage.removeItem(POLICY_ACCEPTANCES_KEY(userId));
  } catch (error) {
    console.error('[PolicyService] Error accepting policy:', error);
    throw error;
  }
}

/**
 * Accept multiple policies at once
 */
export async function acceptMultiplePolicies(
  userId: string,
  policies: Array<{ policyType: PolicyType; version: string }>
): Promise<void> {
  try {
    // Accept each policy sequentially
    for (const policy of policies) {
      await acceptPolicy(userId, policy.policyType, policy.version);
    }
  } catch (error) {
    console.error('[PolicyService] Error accepting multiple policies:', error);
    throw error;
  }
}

/**
 * Check if user has accepted all critical policies
 */
export async function hasAcceptedCriticalPolicies(
  userId: string,
  locale: string
): Promise<boolean> {
  try {
    const [policies, acceptances] = await Promise.all([
      fetchLatestPolicies(locale),
      fetchUserPolicyAcceptances(userId),
    ]);

    // Check each critical policy
    for (const criticalType of CRITICAL_POLICY_TYPES) {
      const policy = policies.find((p) => p.policyType === criticalType);
      if (!policy) {
        console.warn(`[PolicyService] Critical policy ${criticalType} not found`);
        continue;
      }

      const acceptance = acceptances.find((a) => a.policyType === criticalType);
      if (!acceptance || acceptance.acceptedVersion !== policy.version) {
        // User hasn't accepted this critical policy or accepted an outdated version
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('[PolicyService] Error checking critical policies:', error);
    return false;
  }
}

/**
 * Get policies that need acceptance
 */
export async function getPoliciesNeedingAcceptance(
  userId: string,
  locale: string
): Promise<PolicyDocument[]> {
  try {
    const [policies, acceptances] = await Promise.all([
      fetchLatestPolicies(locale),
      fetchUserPolicyAcceptances(userId),
    ]);

    const needingAcceptance: PolicyDocument[] = [];

    for (const policy of policies) {
      // Only check critical policies
      if (!CRITICAL_POLICY_TYPES.includes(policy.policyType)) {
        continue;
      }

      const acceptance = acceptances.find((a) => a.policyType === policy.policyType);
      if (!acceptance || acceptance.acceptedVersion !== policy.version) {
        needingAcceptance.push(policy);
      }
    }

    return needingAcceptance;
  } catch (error) {
    console.error('[PolicyService] Error getting policies needing acceptance:', error);
    throw error;
  }
}

/**
 * Clear all policy caches
 */
export async function clearPolicyCaches(userId: string, locale: string): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.removeItem(POLICY_STATE_KEY(locale)),
      AsyncStorage.removeItem(POLICY_ACCEPTANCES_KEY(userId)),
    ]);
  } catch (error) {
    console.error('[PolicyService] Error clearing caches:', error);
  }
}