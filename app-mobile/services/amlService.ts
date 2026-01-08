/**
 * PACK 55 — AML/KYC Service
 * Manages AML state and KYC requirements for earners
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

// ============================================================================
// TYPES
// ============================================================================

export type KYCLevel = 'NONE' | 'BASIC' | 'FULL';

export interface AMLState {
  userId: string;
  kycRequired: boolean;
  kycVerified: boolean;
  kycLevel: KYCLevel;
  riskScore: number;
  riskFlags: string[];
  lastFetchedAt: number;
}

// ============================================================================
// STORAGE KEYS
// ============================================================================

const AML_STATE_KEY = (userId: string) => `aml_state_v1_${userId}`;

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Fetch AML state from backend
 */
export async function fetchAMLState(userId: string): Promise<AMLState | null> {
  try {
    // Try cache first
    const cached = await AsyncStorage.getItem(AML_STATE_KEY(userId));
    if (cached) {
      const parsed: AMLState = JSON.parse(cached);
      // Return cached if less than 1 hour old
      if (Date.now() - parsed.lastFetchedAt < 60 * 60 * 1000) {
        return parsed;
      }
    }

    // Fetch from backend if cache miss or expired
    return await refreshAMLState(userId);
  } catch (error) {
    console.error('[AMLService] Error fetching AML state:', error);
    return null;
  }
}

/**
 * Refresh AML state from backend (bypass cache)
 */
export async function refreshAMLState(userId: string): Promise<AMLState> {
  try {
    const getAMLStateCallable = httpsCallable(functions, 'compliance_getAMLState');
    const result = await getAMLStateCallable({ userId });
    const data = result.data as any;

    const amlState: AMLState = {
      userId: data.userId,
      kycRequired: data.kycRequired,
      kycVerified: data.kycVerified,
      kycLevel: data.kycLevel,
      riskScore: data.riskScore,
      riskFlags: data.riskFlags || [],
      lastFetchedAt: Date.now(),
    };

    // Cache the result
    await AsyncStorage.setItem(AML_STATE_KEY(userId), JSON.stringify(amlState));

    return amlState;
  } catch (error) {
    console.error('[AMLService] Error refreshing AML state:', error);
    throw error;
  }
}

/**
 * Check if user requires KYC verification
 */
export async function requiresKYCVerification(userId: string): Promise<boolean> {
  try {
    const amlState = await fetchAMLState(userId);
    return amlState?.kycRequired ?? false;
  } catch (error) {
    console.error('[AMLService] Error checking KYC requirement:', error);
    return false;
  }
}

/**
 * Check if user has completed KYC
 */
export async function isKYCVerified(userId: string): Promise<boolean> {
  try {
    const amlState = await fetchAMLState(userId);
    return amlState?.kycVerified ?? false;
  } catch (error) {
    console.error('[AMLService] Error checking KYC verification:', error);
    return false;
  }
}

/**
 * Clear AML state cache
 */
export async function clearAMLCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(AML_STATE_KEY(userId));
  } catch (error) {
    console.error('[AMLService] Error clearing cache:', error);
  }
}

/**
 * Get KYC status message for UI display
 */
export function getKYCStatusMessage(amlState: AMLState | null): string {
  if (!amlState) {
    return 'KYC status unknown';
  }

  if (amlState.kycVerified) {
    return `KYC verified (${amlState.kycLevel})`;
  }

  if (amlState.kycRequired) {
    return 'KYC verification required for payouts';
  }

  return 'No KYC required yet';
}