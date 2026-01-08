/**
 * PACK 55 — Age Gate Service
 * Manages age verification state and API calls
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

// ============================================================================
// TYPES
// ============================================================================

export type AgeVerificationLevel = 'NONE' | 'SOFT' | 'DOCUMENT' | 'LIVENESS';

export interface AgeState {
  userId: string;
  ageVerified: boolean;
  ageVerificationLevel: AgeVerificationLevel;
  dateOfBirth: string | null;
  countryOfResidence: string | null;
  lastFetchedAt: number;
}

// ============================================================================
// STORAGE KEYS
// ============================================================================

const AGE_STATE_KEY = (userId: string) => `age_state_v1_${userId}`;

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Fetch age state from backend
 */
export async function fetchAgeState(userId: string): Promise<AgeState | null> {
  try {
    // Try to get from cache first
    const cached = await AsyncStorage.getItem(AGE_STATE_KEY(userId));
    if (cached) {
      const parsed: AgeState = JSON.parse(cached);
      // Return cached if less than 1 hour old
      if (Date.now() - parsed.lastFetchedAt < 60 * 60 * 1000) {
        return parsed;
      }
    }

    // Fetch from backend if cache miss or expired
    return await refreshAgeState(userId);
  } catch (error) {
    console.error('[AgeGateService] Error fetching age state:', error);
    return null;
  }
}

/**
 * Refresh age state from backend (bypass cache)
 */
export async function refreshAgeState(userId: string): Promise<AgeState> {
  try {
    const getAgeStateCallable = httpsCallable(functions, 'compliance_getAgeState');
    const result = await getAgeStateCallable({ userId });
    const data = result.data as any;

    const ageState: AgeState = {
      userId: data.userId,
      ageVerified: data.ageVerified,
      ageVerificationLevel: data.ageVerificationLevel,
      dateOfBirth: data.dateOfBirth,
      countryOfResidence: data.countryOfResidence,
      lastFetchedAt: Date.now(),
    };

    // Cache the result
    await AsyncStorage.setItem(AGE_STATE_KEY(userId), JSON.stringify(ageState));

    return ageState;
  } catch (error) {
    console.error('[AgeGateService] Error refreshing age state:', error);
    throw error;
  }
}

/**
 * Submit soft age verification (self-declaration)
 */
export async function submitSoftAgeVerification(
  userId: string,
  dateOfBirth: string,
  countryOfResidence?: string
): Promise<AgeState> {
  try {
    const ageSoftVerifyCallable = httpsCallable(functions, 'compliance_ageSoftVerify');
    const result = await ageSoftVerifyCallable({
      userId,
      dateOfBirth,
      countryOfResidence,
    });
    const data = result.data as any;

    const ageState: AgeState = {
      userId: data.userId,
      ageVerified: data.ageVerified,
      ageVerificationLevel: data.ageVerificationLevel,
      dateOfBirth: data.dateOfBirth,
      countryOfResidence: data.countryOfResidence,
      lastFetchedAt: Date.now(),
    };

    // Cache the result
    await AsyncStorage.setItem(AGE_STATE_KEY(userId), JSON.stringify(ageState));

    return ageState;
  } catch (error) {
    console.error('[AgeGateService] Error submitting age verification:', error);
    throw error;
  }
}

/**
 * Clear age state cache
 */
export async function clearAgeStateCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(AGE_STATE_KEY(userId));
  } catch (error) {
    console.error('[AgeGateService] Error clearing cache:', error);
  }
}

/**
 * Check if user has verified age
 */
export async function isAgeVerified(userId: string): Promise<boolean> {
  try {
    const ageState = await fetchAgeState(userId);
    return ageState?.ageVerified ?? false;
  } catch (error) {
    console.error('[AgeGateService] Error checking age verification:', error);
    return false;
  }
}