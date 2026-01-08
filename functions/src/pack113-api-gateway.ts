/**
 * PACK 113 — Full Ecosystem API Gateway
 * Core API Gateway Engine
 * 
 * SECURITY-FIRST IMPLEMENTATION:
 * - All requests must have valid OAuth2 tokens
 * - Scope enforcement on every endpoint
 * - Rate limiting per app/user
 * - Comprehensive audit logging
 * - Abuse detection integration
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  ExternalApp,
  AccessToken,
  OAuth2AuthorizationCode,
  APIScope,
  APIAuditLog,
  APIRateLimit,
  APISecurityEvent,
  APIAbuseDetection,
  APIAbuseType,
  DEFAULT_API_QUOTA,
  validateScopeRequest,
  getScopeRiskLevel,
  APIResponse,
  APISuccessResponse,
  APIErrorResponse,
} from './pack113-types';
import { checkAndIncrementRateLimit, hashIpAddress } from './rateLimit';
import { logEvent } from './observability';

const crypto = require('crypto');

// ============================================================================
// OAUTH2 TOKEN MANAGEMENT
// ============================================================================

/**
 * Generate secure random token
 */
function generateSecureToken(length: number = 64): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash token for storage
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate OAuth2 authorization code
 */
export async function generateAuthorizationCode(params: {
  userId: string;
  appId: string;
  scopes: APIScope[];
  redirectUri: string;
}): Promise<{ code: string; expiresIn: number }> {
  const { userId, appId, scopes, redirectUri } = params;

  // Validate app exists and is active
  const appDoc = await db.collection('external_apps').doc(appId).get();
  if (!appDoc.exists) {
    throw new Error('Invalid app ID');
  }

  const app = appDoc.data() as ExternalApp;
  if (app.status !== 'ACTIVE') {
    throw new Error('App is not active');
  }

  // Validate redirect URI
  if (!app.callbackUrls.includes(redirectUri)) {
    throw new Error('Invalid redirect URI');
  }

  // Validate scopes
  const validation = validateScopeRequest(scopes);
  if (validation.forbidden.length > 0) {
    throw new Error(`Forbidden scopes requested: ${validation.forbidden.join(', ')}`);
  }
  if (validation.invalid.length > 0) {
    throw new Error(`Invalid scopes requested: ${validation.invalid.join(', ')}`);
  }

  // Check app's allowed scopes
  const disallowedScopes = validation.valid.filter(scope => !app.scopesAllowed.includes(scope));
  if (disallowedScopes.length > 0) {
    throw new Error(`App not authorized for scopes: ${disallowedScopes.join(', ')}`);
  }

  // Generate code
  const code = generateSecureToken(32);
  const expiresIn = 600; // 10 minutes

  const authCode: OAuth2AuthorizationCode = {
    code: hashToken(code),
    appId,
    userId,
    scopes: validation.valid,
    redirectUri,
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + expiresIn * 1000),
    used: false,
  };

  await db.collection('oauth2_authorization_codes').doc(hashToken(code)).set(authCode);

  logger.info('Generated OAuth2 authorization code', { userId, appId, scopes: validation.valid });

  return { code, expiresIn };
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeAuthorizationCode(params: {
  code: string;
  appId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const { code, appId, clientSecret, redirectUri } = params;

  // Verify app credentials
  const appDoc = await db.collection('external_apps').doc(appId).get();
  if (!appDoc.exists) {
    throw new Error('Invalid app credentials');
  }

  const app = appDoc.data() as ExternalApp;
  if (app.clientSecret !== hashToken(clientSecret)) {
    throw new Error('Invalid client secret');
  }

  // Retrieve authorization code
  const codeHash = hashToken(code);
  const authCodeDoc = await db.collection('oauth2_authorization_codes').doc(codeHash).get();
  
  if (!authCodeDoc.exists) {
    throw new Error('Invalid authorization code');
  }

  const authCode = authCodeDoc.data() as OAuth2AuthorizationCode;

  // Validate code
  if (authCode.used) {
    throw new Error('Authorization code already used');
  }
  if (authCode.expiresAt.toMillis() < Date.now()) {
    throw new Error('Authorization code expired');
  }
  if (authCode.appId !== appId) {
    throw new Error('App ID mismatch');
  }
  if (authCode.redirectUri !== redirectUri) {
    throw new Error('Redirect URI mismatch');
  }

  // Generate tokens
  const accessTokenString = generateSecureToken(64);
  const refreshTokenString = generateSecureToken(64);
  const expiresIn = 3600; // 1 hour

  const tokenId = generateId();

  const accessToken: AccessToken = {
    tokenId,
    appId,
    userId: authCode.userId,
    tokenType: 'ACCESS_TOKEN',
    token: hashToken(accessTokenString),
    scopes: authCode.scopes,
    issuedAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + expiresIn * 1000),
  };

  const refreshToken: AccessToken = {
    tokenId: generateId(),
    appId,
    userId: authCode.userId,
    tokenType: 'REFRESH_TOKEN',
    token: hashToken(refreshTokenString),
    scopes: authCode.scopes,
    issuedAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 30 * 24 * 3600 * 1000), // 30 days
  };

  // Store tokens and mark code as used
  await db.runTransaction(async (transaction) => {
    transaction.set(db.collection('access_tokens').doc(tokenId), accessToken);
    transaction.set(db.collection('access_tokens').doc(refreshToken.tokenId), refreshToken);
    transaction.update(authCodeDoc.ref, { used: true, usedAt: serverTimestamp() });
  });

  // Create user authorization record
  await createOrUpdateUserAuthorization(authCode.userId, appId, authCode.scopes);

  logger.info('Exchanged authorization code for tokens', {
    userId: authCode.userId,
    appId,
    tokenId,
  });

  return {
    accessToken: accessTokenString,
    refreshToken: refreshTokenString,
    expiresIn,
  };
}

/**
 * Validate and retrieve access token
 */
export async function validateAccessToken(token: string): Promise<{
  valid: boolean;
  tokenData?: AccessToken;
  error?: string;
}> {
  const tokenHash = hashToken(token);
  const tokenDoc = await db.collection('access_tokens').doc(tokenHash).get();

  if (!tokenDoc.exists) {
    return { valid: false, error: 'Invalid token' };
  }

  const tokenData = tokenDoc.data() as AccessToken;

  // Check if revoked
  if (tokenData.revokedAt) {
    return { valid: false, error: 'Token revoked' };
  }

  // Check if expired
  if (tokenData.expiresAt.toMillis() < Date.now()) {
    return { valid: false, error: 'Token expired' };
  }

  // Check token type
  if (tokenData.tokenType !== 'ACCESS_TOKEN') {
    return { valid: false, error: 'Invalid token type' };
  }

  // Update last used
  await db.collection('access_tokens').doc(tokenHash).update({
    lastUsedAt: serverTimestamp(),
  });

  return { valid: true, tokenData };
}

/**
 * Revoke access token
 */
export async function revokeAccessToken(params: {
  userId: string;
  tokenId?: string;
  appId?: string;
  reason?: string;
}): Promise<{ revokedCount: number }> {
  const { userId, tokenId, appId, reason } = params;

  let query = db.collection('access_tokens').where('userId', '==', userId);

  if (tokenId) {
    query = query.where('tokenId', '==', tokenId);
  }
  if (appId) {
    query = query.where('appId', '==', appId);
  }

  const tokensSnapshot = await query.get();
  const batch = db.batch();
  let revokedCount = 0;

  tokensSnapshot.forEach((doc) => {
    const token = doc.data() as AccessToken;
    if (!token.revokedAt) {
      batch.update(doc.ref, {
        revokedAt: serverTimestamp(),
        revokedReason: reason || 'User revoked',
      });
      revokedCount++;
    }
  });

  await batch.commit();

  logger.info('Revoked access tokens', { userId, appId, revokedCount });

  return { revokedCount };
}

/**
 * Create or update user app authorization
 */
async function createOrUpdateUserAuthorization(
  userId: string,
  appId: string,
  scopes: APIScope[]
): Promise<void> {
  const authId = `${userId}_${appId}`;
  const authRef = db.collection('user_app_authorizations').doc(authId);

  await db.runTransaction(async (transaction) => {
    const authDoc = await transaction.get(authRef);

    if (!authDoc.exists) {
      transaction.set(authRef, {
        authorizationId: authId,
        userId,
        appId,
        grantedScopes: scopes,
        grantedAt: serverTimestamp(),
        activeTokenCount: 1,
        lastUsedAt: serverTimestamp(),
      });
    } else {
      transaction.update(authRef, {
        grantedScopes: scopes,
        activeTokenCount: FieldValue.increment(1),
        lastUsedAt: serverTimestamp(),
      });
    }
  });
}

// ============================================================================
// SCOPE ENFORCEMENT
// ============================================================================

/**
 * Check if token has required scope
 */
export function hasScope(tokenData: AccessToken, requiredScope: APIScope): boolean {
  return tokenData.scopes.includes(requiredScope);
}

/**
 * Enforce scope requirement for API endpoint
 */
export async function enforceScope(params: {
  token: string;
  requiredScope: APIScope;
  endpoint: string;
  ipAddress?: string;
}): Promise<{
  authorized: boolean;
  tokenData?: AccessToken;
  error?: string;
}> {
  const { token, requiredScope, endpoint, ipAddress } = params;

  // Validate token
  const validation = await validateAccessToken(token);
  if (!validation.valid) {
    // Log security event
    await logSecurityEvent({
      appId: 'UNKNOWN',
      userId: 'UNKNOWN',
      eventType: 'INVALID_TOKEN',
      description: validation.error || 'Invalid token',
      endpoint,
      ipHash: ipAddress ? hashIpAddress(ipAddress) : 'UNKNOWN',
    });

    return { authorized: false, error: validation.error };
  }

  const tokenData = validation.tokenData!;

  // Check scope
  if (!hasScope(tokenData, requiredScope)) {
    // Log security event
    await logSecurityEvent({
      appId: tokenData.appId,
      userId: tokenData.userId,
      eventType: 'SCOPE_VIOLATION',
      description: `Attempted to access ${endpoint} without required scope`,
      endpoint,
      requestedScope: requiredScope,
      grantedScopes: tokenData.scopes,
      ipHash: ipAddress ? hashIpAddress(ipAddress) : 'UNKNOWN',
    });

    return {
      authorized: false,
      tokenData,
      error: `Missing required scope: ${requiredScope}`,
    };
  }

  return { authorized: true, tokenData };
}

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Check API rate limit for app/user combo
 */
export async function checkAPIRateLimit(params: {
  appId: string;
  userId: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
}): Promise<{ allowed: boolean; reason?: string }> {
  const { appId, userId, endpoint, method } = params;

  // Get app quotas
  const appDoc = await db.collection('external_apps').doc(appId).get();
  if (!appDoc.exists) {
    return { allowed: false, reason: 'App not found' };
  }

  const app = appDoc.data() as ExternalApp;

  // Check if app is suspended
  if (app.status !== 'ACTIVE') {
    return { allowed: false, reason: 'App is suspended' };
  }

  // Use custom quotas or defaults
  const quotaPerDay = app.quotaPerDay || DEFAULT_API_QUOTA.defaultPerDay;
  const quotaPerHour = app.quotaPerHour || DEFAULT_API_QUOTA.defaultPerHour;
  const quotaPerMinute = app.quotaPerMinute || DEFAULT_API_QUOTA.defaultPerMinute;

  // Stricter limits for POST routes
  const effectiveLimits =
    method === 'POST'
      ? {
          perDay: Math.min(quotaPerDay, DEFAULT_API_QUOTA.postPerDay),
          perHour: Math.min(quotaPerHour, DEFAULT_API_QUOTA.postPerHour),
          perMinute: Math.min(quotaPerMinute, DEFAULT_API_QUOTA.postPerMinute),
        }
      : {
          perDay: quotaPerDay,
          perHour: quotaPerHour,
          perMinute: quotaPerMinute,
        };

  // Check rate limit using existing rate limit system
  const rateLimitResult = await checkAndIncrementRateLimit({
    action: `api_gateway:${appId}:${userId}`,
    context: {
      userId,
      environment: 'PROD',
    },
  });

  if (!rateLimitResult.allowed) {
    // Log rate limit violation
    await logAPIViolation(appId, userId, 'RATE_LIMIT_EXCEEDED', endpoint);

    return { allowed: false, reason: rateLimitResult.reason };
  }

  // Update app-specific rate limit tracking
  await updateAPIRateLimit(appId, userId);

  return { allowed: true };
}

/**
 * Update API rate limit counters
 */
async function updateAPIRateLimit(appId: string, userId: string): Promise<void> {
  const now = new Date();
  const dayWindow = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const hourWindow = `${dayWindow}-${String(now.getUTCHours()).padStart(2, '0')}`;
  const minuteWindow = `${hourWindow}-${String(now.getUTCMinutes()).padStart(2, '0')}`;

  const limitId = `${appId}_${userId}`;
  const limitRef = db.collection('api_rate_limits').doc(limitId);

  await db.runTransaction(async (transaction) => {
    const limitDoc = await transaction.get(limitRef);

    if (!limitDoc.exists) {
      const newLimit: APIRateLimit = {
        appId,
        userId,
        requestsToday: 1,
        requestsThisHour: 1,
        requestsThisMinute: 1,
        dayWindow,
        hourWindow,
        minuteWindow,
        violationCount: 0,
        updatedAt: Timestamp.now(),
      };
      transaction.set(limitRef, newLimit);
    } else {
      const limit = limitDoc.data() as APIRateLimit;
      const updates: any = { updatedAt: serverTimestamp() };

      // Reset counters if window changed
      if (limit.dayWindow !== dayWindow) {
        updates.requestsToday = 1;
        updates.dayWindow = dayWindow;
      } else {
        updates.requestsToday = FieldValue.increment(1);
      }

      if (limit.hourWindow !== hourWindow) {
        updates.requestsThisHour = 1;
        updates.hourWindow = hourWindow;
      } else {
        updates.requestsThisHour = FieldValue.increment(1);
      }

      if (limit.minuteWindow !== minuteWindow) {
        updates.requestsThisMinute = 1;
        updates.minuteWindow = minuteWindow;
      } else {
        updates.requestsThisMinute = FieldValue.increment(1);
      }

      transaction.update(limitRef, updates);
    }
  });
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

/**
 * Log API request to audit trail
 */
export async function logAPIRequest(params: {
  appId: string;
  userId: string;
  tokenId: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  endpoint: string;
  scopeUsed: APIScope;
  statusCode: number;
  responseTime: number;
  ipAddress?: string;
  deviceFingerprint?: string;
  error?: string;
}): Promise<void> {
  const {
    appId,
    userId,
    tokenId,
    method,
    endpoint,
    scopeUsed,
    statusCode,
    responseTime,
    ipAddress,
    deviceFingerprint,
    error,
  } = params;

  const logEntry: APIAuditLog = {
    logId: generateId(),
    appId,
    userId,
    tokenId,
    method,
    endpoint,
    scopeUsed,
    statusCode,
    responseTime,
    ipHashMasked: ipAddress ? maskIpHash(hashIpAddress(ipAddress)) : 'UNKNOWN',
    deviceFingerprint,
    error,
    timestamp: Timestamp.now(),
  };

  await db.collection('api_audit_log').add(logEntry);

  // Also log to observability system
  await logEvent({
    level: statusCode >= 400 ? 'ERROR' : 'INFO',
    source: 'BACKEND',
    service: 'functions.pack113-api-gateway',
    module: 'API_GATEWAY',
    message: `API request: ${method} ${endpoint}`,
    environment: 'PROD',
    context: { userId },
    details: {
      extra: {
        appId,
        statusCode,
        responseTime,
        error,
      },
    },
  });
}

/**
 * Mask IP hash for privacy (keep first 8 chars)
 */
function maskIpHash(ipHash: string): string {
  if (ipHash.length <= 8) return ipHash;
  return `${ipHash.substring(0, 8)}...`;
}

// ============================================================================
// SECURITY EVENTS
// ============================================================================

/**
 * Log security event
 */
async function logSecurityEvent(params: {
  appId: string;
  userId: string;
  eventType: 'UNAUTHORIZED_ACCESS' | 'SCOPE_VIOLATION' | 'INVALID_TOKEN' | 'SUSPICIOUS_PATTERN';
  description: string;
  endpoint?: string;
  requestedScope?: APIScope;
  grantedScopes?: APIScope[];
  ipHash: string;
}): Promise<void> {
  const event: APISecurityEvent = {
    eventId: generateId(),
    appId: params.appId,
    userId: params.userId,
    eventType: params.eventType,
    description: params.description,
    endpoint: params.endpoint,
    requestedScope: params.requestedScope,
    grantedScopes: params.grantedScopes,
    ipHash: params.ipHash,
    timestamp: Timestamp.now(),
  };

  await db.collection('api_security_events').add(event);

  await logEvent({
    level: 'WARN',
    source: 'BACKEND',
    service: 'functions.pack113-api-gateway',
    module: 'SECURITY',
    message: `Security event: ${params.eventType}`,
    environment: 'PROD',
    context: { userId: params.userId },
    details: {
      extra: {
        appId: params.appId,
        eventType: params.eventType,
        description: params.description,
      },
    },
  });
}

/**
 * Log API violation for abuse detection
 */
async function logAPIViolation(
  appId: string,
  userId: string,
  violationType: string,
  endpoint: string
): Promise<void> {
  const limitRef = db.collection('api_rate_limits').doc(`${appId}_${userId}`);

  await db.runTransaction(async (transaction) => {
    const limitDoc = await transaction.get(limitRef);

    if (limitDoc.exists) {
      transaction.update(limitRef, {
        violationCount: FieldValue.increment(1),
        lastViolationAt: serverTimestamp(),
      });

      const limit = limitDoc.data() as APIRateLimit;

      // Apply progressive penalties
      if (limit.violationCount >= 3) {
        // Soft block for 1 hour after 3 violations
        transaction.update(limitRef, {
          softBlockUntil: Timestamp.fromMillis(Date.now() + 3600 * 1000),
        });
      }
    }
  });
}

// ============================================================================
// API RESPONSE HELPERS
// ============================================================================

/**
 * Create success response
 */
export function createSuccessResponse<T>(
  data: T,
  requestId: string
): APISuccessResponse<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
    },
  };
}

/**
 * Create error response
 */
export function createErrorResponse(
  code: string,
  message: string,
  requestId: string,
  details?: Record<string, any>
): APIErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
    },
  };
}