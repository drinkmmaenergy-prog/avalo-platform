/**
 * PACK 70 - Rate Limited Operations
 * 
 * Wrapper functions that add rate limiting to critical operations
 */

import { checkAndIncrementRateLimit, hashIpAddress, createRateLimitError, RateLimitContext } from './rateLimit.js';

/**
 * Get environment from project ID
 */
function getEnvironment(): 'PROD' | 'STAGE' | 'OTHER' {
  if (process.env.GCLOUD_PROJECT?.includes('prod')) return 'PROD';
  if (process.env.GCLOUD_PROJECT?.includes('stage')) return 'STAGE';
  return 'OTHER';
}

/**
 * Generic rate limit checker
 */
async function checkRateLimit(params: {
  action: string;
  userId?: string;
  ipAddress?: string;
  deviceId?: string;
}): Promise<void> {
  const { action, userId, ipAddress, deviceId } = params;

  const context: RateLimitContext = {
    userId: userId || null,
    ipHash: ipAddress ? hashIpAddress(ipAddress) : undefined,
    deviceId: deviceId || undefined,
    environment: getEnvironment()
  };

  const result = await checkAndIncrementRateLimit({ action, context });

  if (result.hardLimited) {
    const error: any = new Error(result.reason || 'Rate limit exceeded');
    error.code = 'RATE_LIMITED';
    error.httpStatus = 429;
    error.details = createRateLimitError(result.reason);
    throw error;
  }
}

/**
 * Rate limit for chat send
 */
export async function checkChatSendRateLimit(params: {
  userId: string;
  deviceId?: string;
}): Promise<void> {
  await checkRateLimit({
    action: 'CHAT_SEND',
    userId: params.userId,
    deviceId: params.deviceId
  });
}

/**
 * Rate limit for AI companion messages
 */
export async function checkAIMessageRateLimit(params: {
  userId: string;
}): Promise<void> {
  await checkRateLimit({
    action: 'AI_MESSAGE',
    userId: params.userId
  });
}

/**
 * Rate limit for media uploads
 */
export async function checkMediaUploadRateLimit(params: {
  userId: string;
  deviceId?: string;
}): Promise<void> {
  await checkRateLimit({
    action: 'MEDIA_UPLOAD',
    userId: params.userId,
    deviceId: params.deviceId
  });
}

/**
 * Rate limit for reservation creation
 */
export async function checkReservationCreateRateLimit(params: {
  userId: string;
}): Promise<void> {
  await checkRateLimit({
    action: 'RESERVATION_CREATE',
    userId: params.userId
  });
}

/**
 * Rate limit for payout requests
 */
export async function checkPayoutRequestRateLimit(params: {
  userId: string;
}): Promise<void> {
  await checkRateLimit({
    action: 'PAYOUT_REQUEST',
    userId: params.userId
  });
}

/**
 * Rate limit for support ticket creation
 */
export async function checkSupportTicketRateLimit(params: {
  userId: string;
  ipAddress?: string;
}): Promise<void> {
  await checkRateLimit({
    action: 'SUPPORT_TICKET_CREATE',
    userId: params.userId,
    ipAddress: params.ipAddress
  });
}

/**
 * Rate limit for referral click tracking (per IP)
 */
export async function checkReferralClickRateLimit(params: {
  ipAddress: string;
}): Promise<void> {
  await checkRateLimit({
    action: 'REFERRAL_CLICK',
    ipAddress: params.ipAddress
  });
}

/**
 * Helper to extract IP from request
 */
export function extractIpFromRequest(req: any): string | undefined {
  // Try various headers for IP extraction
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             req.headers['x-real-ip'] ||
             req.ip ||
             req.connection?.remoteAddress;
  
  return ip;
}