/**
 * PACK 278 — Subscription Perks Endpoints
 * 
 * Cloud Functions for managing subscription perks
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  togglePassport,
  toggleIncognito,
  activateBoost,
  hasAvailableBoosts,
  hasActiveBoost,
  checkDiscoveryLimit,
  getPassportLocation,
} from './pack278-perks-service';

/**
 * Toggle Passport feature
 */
export const pack278_togglePassport = onCall<{
  enabled: boolean;
  latitude?: number;
  longitude?: number;
  locationName?: string;
}>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { enabled, latitude, longitude, locationName } = request.data;
  const userId = request.auth.uid;
  
  const result = await togglePassport(userId, enabled, latitude, longitude, locationName);
  
  if (!result.success) {
    throw new HttpsError('permission-denied', result.error || 'Failed to toggle passport');
  }
  
  return {
    success: true,
    message: enabled ? 'Passport enabled' : 'Passport disabled',
  };
});

/**
 * Get passport location
 */
export const pack278_getPassportLocation = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = request.auth.uid;
  const location = await getPassportLocation(userId);
  
  return {
    success: true,
    location,
  };
});

/**
 * Toggle Incognito mode
 */
export const pack278_toggleIncognito = onCall<{
  enabled: boolean;
}>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { enabled } = request.data;
  const userId = request.auth.uid;
  
  const result = await toggleIncognito(userId, enabled);
  
  if (!result.success) {
    throw new HttpsError('permission-denied', result.error || 'Failed to toggle incognito');
  }
  
  return {
    success: true,
    message: enabled ? 'Incognito mode enabled' : 'Incognito mode disabled',
  };
});

/**
 * Activate profile boost
 */
export const pack278_activateBoost = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = request.auth.uid;
  const result = await activateBoost(userId);
  
  if (!result.success) {
    throw new HttpsError('resource-exhausted', result.error || 'Failed to activate boost');
  }
  
  return {
    success: true,
    expiresAt: result.expiresAt?.toISOString(),
    message: 'Boost activated for 30 minutes',
  };
});

/**
 * Check available boosts
 */
export const pack278_checkBoosts = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = request.auth.uid;
  const boosts = await hasAvailableBoosts(userId);
  const active = await hasActiveBoost(userId);
  
  return {
    success: true,
    available: boosts.available,
    used: boosts.used,
    total: boosts.total,
    hasActiveBoost: active,
  };
});

/**
 * Check discovery limit
 */
export const pack278_checkDiscoveryLimit = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = request.auth.uid;
  const limit = await checkDiscoveryLimit(userId);
  
  return {
    success: true,
    ...limit,
  };
});