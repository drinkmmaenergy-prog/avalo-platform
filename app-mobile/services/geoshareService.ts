/**
 * PACK 76 - Real-Time Location Sharing Service
 * API service for geoshare operations
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import {
  GeosharePricing,
  GeoshareSessionResponse,
  GeoshareLocationUpdateResponse,
  GeoshareSessionInfo,
  PartnerLocation,
} from '../types/geoshare';

/**
 * Get pricing information for geoshare session
 */
export async function getGeosharePricing(
  durationMinutes: number
): Promise<GeosharePricing> {
  try {
    const getPricing = httpsCallable<
      { durationMinutes: number },
      { success: boolean } & GeosharePricing
    >(functions, 'getGeosharePricing');

    const result = await getPricing({ durationMinutes });

    if (!result.data.success) {
      throw new Error('Failed to get pricing');
    }

    return result.data;
  } catch (error: any) {
    console.error('Error getting geoshare pricing:', error);
    throw new Error(error.message || 'Failed to get pricing information');
  }
}

/**
 * Start a new geoshare session
 */
export async function startGeoshareSession(
  partnerId: string,
  durationMinutes: number
): Promise<GeoshareSessionResponse> {
  try {
    const startSession = httpsCallable<
      { partnerId: string; durationMinutes: number },
      GeoshareSessionResponse
    >(functions, 'startGeoshareSession');

    const result = await startSession({ partnerId, durationMinutes });

    if (!result.data.success) {
      throw new Error('Failed to start session');
    }

    return result.data;
  } catch (error: any) {
    console.error('Error starting geoshare session:', error);
    
    // Parse common error messages
    if (error.message?.includes('Insufficient tokens')) {
      throw new Error('You do not have enough tokens to start location sharing');
    }
    if (error.message?.includes('already exists')) {
      throw new Error('You already have an active location sharing session with this user');
    }
    if (error.message?.includes('not found')) {
      throw new Error('User not found');
    }
    
    throw new Error(error.message || 'Failed to start location sharing session');
  }
}

/**
 * Update location during active session
 */
export async function updateGeoshareLocation(
  sessionId: string,
  latitude: number,
  longitude: number,
  accuracy: number
): Promise<GeoshareLocationUpdateResponse> {
  try {
    const updateLocation = httpsCallable<
      {
        sessionId: string;
        latitude: number;
        longitude: number;
        accuracy: number;
      },
      GeoshareLocationUpdateResponse
    >(functions, 'updateGeoshareLocation');

    const result = await updateLocation({
      sessionId,
      latitude,
      longitude,
      accuracy,
    });

    if (!result.data.success) {
      throw new Error('Failed to update location');
    }

    return result.data;
  } catch (error: any) {
    console.error('Error updating geoshare location:', error);
    
    // Parse common error messages
    if (error.message?.includes('expired')) {
      throw new Error('Location sharing session has expired');
    }
    if (error.message?.includes('not active')) {
      throw new Error('Location sharing session is not active');
    }
    if (error.message?.includes('limited')) {
      // Rate limit error - silently handle
      return {
        success: false,
        locationId: '',
        remainingSeconds: 0,
      };
    }
    
    throw new Error(error.message || 'Failed to update location');
  }
}

/**
 * Stop geoshare session manually
 */
export async function stopGeoshareSession(sessionId: string): Promise<void> {
  try {
    const stopSession = httpsCallable<
      { sessionId: string },
      { success: boolean; message: string }
    >(functions, 'stopGeoshareSession');

    const result = await stopSession({ sessionId });

    if (!result.data.success) {
      throw new Error('Failed to stop session');
    }
  } catch (error: any) {
    console.error('Error stopping geoshare session:', error);
    throw new Error(error.message || 'Failed to stop location sharing');
  }
}

/**
 * Get active geoshare session info
 */
export async function getGeoshareSession(sessionId: string): Promise<{
  session: GeoshareSessionInfo;
  partnerLocation: PartnerLocation | null;
}> {
  try {
    const getSession = httpsCallable<
      { sessionId: string },
      {
        success: boolean;
        session: GeoshareSessionInfo;
        partnerLocation: PartnerLocation | null;
      }
    >(functions, 'getGeoshareSession');

    const result = await getSession({ sessionId });

    if (!result.data.success) {
      throw new Error('Failed to get session');
    }

    return {
      session: result.data.session,
      partnerLocation: result.data.partnerLocation,
    };
  } catch (error: any) {
    console.error('Error getting geoshare session:', error);
    throw new Error(error.message || 'Failed to get session information');
  }
}

/**
 * Check if user can afford a geoshare session
 */
export async function canAffordGeoshare(
  userId: string,
  durationMinutes: number
): Promise<{ canAfford: boolean; requiredTokens: number; currentBalance: number }> {
  try {
    // Get pricing
    const pricing = await getGeosharePricing(durationMinutes);

    // Get user wallet (this would need to be implemented)
    // For now, we'll return a simplified check
    // In production, this should query the user's wallet balance

    return {
      canAfford: false, // Will be determined by actual wallet query
      requiredTokens: pricing.totalTokens,
      currentBalance: 0, // Will be from wallet query
    };
  } catch (error: any) {
    console.error('Error checking geoshare affordability:', error);
    throw new Error(error.message || 'Failed to check balance');
  }
}