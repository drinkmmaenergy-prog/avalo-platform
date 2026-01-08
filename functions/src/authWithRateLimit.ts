/**
 * PACK 70 - Rate Limiting for Auth Operations
 * 
 * Wraps authentication functions with rate limiting
 */

import { checkAndIncrementRateLimit, hashIpAddress, createRateLimitError } from './rateLimit.js';
import { trackLoginSession } from './security.js';
import { RateLimitContext } from './rateLimit.js';

/**
 * Track login session with rate limiting
 */
export async function trackLoginSessionWithRateLimit(params: {
  userId: string;
  deviceId: string;
  platform: 'android' | 'ios' | 'web';
  appVersion?: string;
  osVersion?: string;
  model?: string;
  ipCountry?: string;
  ipCity?: string;
  ipAddress?: string;
}): Promise<{ isNewDevice: boolean; isNewLocation: boolean }> {
  const { userId, ipAddress, ...restParams } = params;

  // Build rate limit context
  const context: RateLimitContext = {
    userId,
    ipHash: ipAddress ? hashIpAddress(ipAddress) : undefined,
    deviceId: restParams.deviceId,
    environment: process.env.GCLOUD_PROJECT?.includes('prod') ? 'PROD' : 
                 process.env.GCLOUD_PROJECT?.includes('stage') ? 'STAGE' : 'OTHER'
  };

  // Check rate limit
  const rateLimitResult = await checkAndIncrementRateLimit({
    action: 'AUTH_LOGIN',
    context
  });

  // If hard limited, throw error
  if (rateLimitResult.hardLimited) {
    const error: any = new Error(rateLimitResult.reason || 'Too many login attempts');
    error.code = 'RATE_LIMITED';
    error.httpStatus = 429;
    error.details = createRateLimitError(rateLimitResult.reason);
    throw error;
  }

  // Proceed with login tracking
  return trackLoginSession({ userId, ...restParams });
}

/**
 * Check rate limit for signup
 * Call this before processing signup
 */
export async function checkSignupRateLimit(params: {
  ipAddress?: string;
  deviceId?: string;
}): Promise<{ allowed: boolean; reason?: string }> {
  const { ipAddress, deviceId } = params;

  const context: RateLimitContext = {
    userId: null,
    ipHash: ipAddress ? hashIpAddress(ipAddress) : undefined,
    deviceId: deviceId || undefined,
    environment: process.env.GCLOUD_PROJECT?.includes('prod') ? 'PROD' : 
                 process.env.GCLOUD_PROJECT?.includes('stage') ? 'STAGE' : 'OTHER'
  };

  const rateLimitResult = await checkAndIncrementRateLimit({
    action: 'AUTH_SIGNUP',
    context
  });

  if (rateLimitResult.hardLimited) {
    return {
      allowed: false,
      reason: rateLimitResult.reason || 'Too many signup attempts'
    };
  }

  return { allowed: true };
}