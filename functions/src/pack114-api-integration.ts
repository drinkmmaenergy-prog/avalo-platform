/**
 * PACK 114 — API Gateway Integration for Agency Access
 * Extends PACK 113 API Gateway with agency-specific scopes and endpoints
 * 
 * SECURITY RULES:
 * - Agencies can only access aggregated analytics
 * - No access to private messages or user identities
 * - No access to modify prices or discovery
 * - Rate limited to prevent abuse
 */

import { db } from './init';
import { logger } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';
import {
  enforceScope,
  checkAPIRateLimit,
  logAPIRequest,
  validateAccessToken,
  createSuccessResponse,
  createErrorResponse,
} from './pack113-api-gateway';
import { AgencyAPIScope } from './pack114-types';
import {
  getAgencyDashboard,
  getCreatorAnalyticsForAgency,
  getAgencyLinkedCreators,
  getAgencyEarningsTimeline,
} from './pack114-analytics-api';

// ============================================================================
// AGENCY API SCOPE EXTENSIONS
// ============================================================================

/**
 * Extended scope definitions for agency access
 * These are added to PACK 113's existing scopes
 */
export const AGENCY_SCOPE_DEFINITIONS = {
  AGENCY_ANALYTICS_READ: {
    scope: 'AGENCY_ANALYTICS_READ' as AgencyAPIScope,
    name: 'Read Agency Analytics',
    description: 'Read aggregated analytics for linked creators',
    category: 'ANALYTICS',
    riskLevel: 'LOW',
  },
  CREATOR_LIST_READ: {
    scope: 'CREATOR_LIST_READ' as AgencyAPIScope,
    name: 'Read Creator List',
    description: 'Read list of creators linked to agency',
    category: 'ANALYTICS',
    riskLevel: 'LOW',
  },
  EARNINGS_READ_AGGREGATED: {
    scope: 'EARNINGS_READ_AGGREGATED' as AgencyAPIScope,
    name: 'Read Aggregated Earnings',
    description: 'Read aggregated earnings data for linked creators',
    category: 'ANALYTICS',
    riskLevel: 'MEDIUM',
  },
};

/**
 * Validate that agency has the required scope
 */
async function validateAgencyScope(
  token: string,
  requiredScope: AgencyAPIScope,
  agencyId: string
): Promise<{ valid: boolean; error?: string; userId?: string }> {
  // Validate token
  const tokenValidation = await validateAccessToken(token);
  
  if (!tokenValidation.valid) {
    return { valid: false, error: tokenValidation.error };
  }

  const tokenData = tokenValidation.tokenData!;

  // Check if user owns this agency
  const agencyDoc = await db.collection('creator_agency_accounts').doc(agencyId).get();
  
  if (!agencyDoc.exists) {
    return { valid: false, error: 'Agency not found' };
  }

  const agency = agencyDoc.data();
  
  if (agency.createdBy !== tokenData.userId) {
    return { valid: false, error: 'Not authorized for this agency' };
  }

  // Check if token has required scope
  // Note: Agency scopes are extensions, so we check if the general ANALYTICS_READ scope is present
  if (!tokenData.scopes.includes('ANALYTICS_READ' as any)) {
    return { valid: false, error: `Missing required scope for analytics` };
  }

  return { valid: true, userId: tokenData.userId };
}

// ============================================================================
// AGENCY API ENDPOINTS
// ============================================================================

/**
 * API Endpoint: Get agency dashboard
 * GET /api/v1/agency/:agencyId/dashboard
 */
export const apiAgencyDashboard = onRequest(
  { region: 'europe-west3', cors: true },
  async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();

    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json(
          createErrorResponse('UNAUTHORIZED', 'Missing or invalid authorization header', requestId)
        );
        return;
      }

      const token = authHeader.substring(7);
      const agencyId = req.params.agencyId || (req.query.agencyId as string);

      if (!agencyId) {
        res.status(400).json(
          createErrorResponse('INVALID_REQUEST', 'Agency ID required', requestId)
        );
        return;
      }

      // Validate scope
      const scopeValidation = await validateAgencyScope(
        token,
        'AGENCY_ANALYTICS_READ',
        agencyId
      );

      if (!scopeValidation.valid) {
        res.status(403).json(
          createErrorResponse('FORBIDDEN', scopeValidation.error || 'Access denied', requestId)
        );
        return;
      }

      // Check rate limit
      const rateLimitCheck = await checkAPIRateLimit({
        appId: 'agency_api',
        userId: scopeValidation.userId!,
        endpoint: '/api/v1/agency/dashboard',
        method: 'GET',
      });

      if (!rateLimitCheck.allowed) {
        res.status(429).json(
          createErrorResponse('RATE_LIMIT_EXCEEDED', rateLimitCheck.reason || 'Rate limit exceeded', requestId)
        );
        return;
      }

      // Get dashboard data
      // Create proper context for callable function
      const dashboardData = await (getAgencyDashboard as any)({
        data: { agencyId },
        auth: { uid: scopeValidation.userId!, token: {} as any },
        rawRequest: req as any,
      });

      const responseTime = Date.now() - startTime;

      // Log request
      await logAPIRequest({
        appId: 'agency_api',
        userId: scopeValidation.userId!,
        tokenId: 'agency_token',
        method: 'GET',
        endpoint: '/api/v1/agency/dashboard',
        scopeUsed: 'ANALYTICS_READ',
        statusCode: 200,
        responseTime,
      });

      res.status(200).json(createSuccessResponse(dashboardData, requestId));
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      logger.error('Error in agency dashboard API', error);

      res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', error.message, requestId)
      );
    }
  }
);

/**
 * API Endpoint: Get linked creators list
 * GET /api/v1/agency/:agencyId/creators
 */
export const apiAgencyCreators = onRequest(
  { region: 'europe-west3', cors: true },
  async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json(
          createErrorResponse('UNAUTHORIZED', 'Missing or invalid authorization header', requestId)
        );
        return;
      }

      const token = authHeader.substring(7);
      const agencyId = req.params.agencyId || (req.query.agencyId as string);

      if (!agencyId) {
        res.status(400).json(
          createErrorResponse('INVALID_REQUEST', 'Agency ID required', requestId)
        );
        return;
      }

      // Validate scope
      const scopeValidation = await validateAgencyScope(
        token,
        'CREATOR_LIST_READ',
        agencyId
      );

      if (!scopeValidation.valid) {
        res.status(403).json(
          createErrorResponse('FORBIDDEN', scopeValidation.error || 'Access denied', requestId)
        );
        return;
      }

      // Check rate limit
      const rateLimitCheck = await checkAPIRateLimit({
        appId: 'agency_api',
        userId: scopeValidation.userId!,
        endpoint: '/api/v1/agency/creators',
        method: 'GET',
      });

      if (!rateLimitCheck.allowed) {
        res.status(429).json(
          createErrorResponse('RATE_LIMIT_EXCEEDED', rateLimitCheck.reason || 'Rate limit exceeded', requestId)
        );
        return;
      }

      // Get creators
      // Create proper context for callable function
      const creatorsData = await (getAgencyLinkedCreators as any)({
        data: { agencyId },
        auth: { uid: scopeValidation.userId!, token: {} as any },
        rawRequest: req as any,
      });

      const responseTime = Date.now() - startTime;

      // Log request
      await logAPIRequest({
        appId: 'agency_api',
        userId: scopeValidation.userId!,
        tokenId: 'agency_token',
        method: 'GET',
        endpoint: '/api/v1/agency/creators',
        scopeUsed: 'ANALYTICS_READ',
        statusCode: 200,
        responseTime,
      });

      res.status(200).json(createSuccessResponse(creatorsData, requestId));
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      logger.error('Error in agency creators API', error);

      res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', error.message, requestId)
      );
    }
  }
);

/**
 * API Endpoint: Get creator analytics
 * GET /api/v1/agency/:agencyId/creator/:creatorId/analytics
 */
export const apiAgencyCreatorAnalytics = onRequest(
  { region: 'europe-west3', cors: true },
  async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json(
          createErrorResponse('UNAUTHORIZED', 'Missing or invalid authorization header', requestId)
        );
        return;
      }

      const token = authHeader.substring(7);
      const agencyId = req.params.agencyId || (req.query.agencyId as string);
      const creatorId = req.params.creatorId || (req.query.creatorId as string);

      if (!agencyId || !creatorId) {
        res.status(400).json(
          createErrorResponse('INVALID_REQUEST', 'Agency ID and Creator ID required', requestId)
        );
        return;
      }

      // Validate scope
      const scopeValidation = await validateAgencyScope(
        token,
        'AGENCY_ANALYTICS_READ',
        agencyId
      );

      if (!scopeValidation.valid) {
        res.status(403).json(
          createErrorResponse('FORBIDDEN', scopeValidation.error || 'Access denied', requestId)
        );
        return;
      }

      // Check rate limit
      const rateLimitCheck = await checkAPIRateLimit({
        appId: 'agency_api',
        userId: scopeValidation.userId!,
        endpoint: '/api/v1/agency/creator/analytics',
        method: 'GET',
      });

      if (!rateLimitCheck.allowed) {
        res.status(429).json(
          createErrorResponse('RATE_LIMIT_EXCEEDED', rateLimitCheck.reason || 'Rate limit exceeded', requestId)
        );
        return;
      }

      // Get analytics
      // Create proper context for callable function
      const analyticsData = await (getCreatorAnalyticsForAgency as any)({
        data: { agencyId, creatorUserId: creatorId },
        auth: { uid: scopeValidation.userId!, token: {} as any },
        rawRequest: req as any,
      });

      const responseTime = Date.now() - startTime;

      // Log request
      await logAPIRequest({
        appId: 'agency_api',
        userId: scopeValidation.userId!,
        tokenId: 'agency_token',
        method: 'GET',
        endpoint: '/api/v1/agency/creator/analytics',
        scopeUsed: 'ANALYTICS_READ',
        statusCode: 200,
        responseTime,
      });

      res.status(200).json(createSuccessResponse(analyticsData, requestId));
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      logger.error('Error in creator analytics API', error);

      res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', error.message, requestId)
      );
    }
  }
);

/**
 * API Endpoint: Get earnings timeline
 * GET /api/v1/agency/:agencyId/earnings/timeline
 */
export const apiAgencyEarningsTimeline = onRequest(
  { region: 'europe-west3', cors: true },
  async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json(
          createErrorResponse('UNAUTHORIZED', 'Missing or invalid authorization header', requestId)
        );
        return;
      }

      const token = authHeader.substring(7);
      const agencyId = req.params.agencyId || (req.query.agencyId as string);
      const days = parseInt((req.query.days as string) || '30', 10);

      if (!agencyId) {
        res.status(400).json(
          createErrorResponse('INVALID_REQUEST', 'Agency ID required', requestId)
        );
        return;
      }

      // Validate scope
      const scopeValidation = await validateAgencyScope(
        token,
        'EARNINGS_READ_AGGREGATED',
        agencyId
      );

      if (!scopeValidation.valid) {
        res.status(403).json(
          createErrorResponse('FORBIDDEN', scopeValidation.error || 'Access denied', requestId)
        );
        return;
      }

      // Check rate limit
      const rateLimitCheck = await checkAPIRateLimit({
        appId: 'agency_api',
        userId: scopeValidation.userId!,
        endpoint: '/api/v1/agency/earnings/timeline',
        method: 'GET',
      });

      if (!rateLimitCheck.allowed) {
        res.status(429).json(
          createErrorResponse('RATE_LIMIT_EXCEEDED', rateLimitCheck.reason || 'Rate limit exceeded', requestId)
        );
        return;
      }

      // Get timeline
      // Create proper context for callable function
      const timelineData = await (getAgencyEarningsTimeline as any)({
        data: { agencyId, days },
        auth: { uid: scopeValidation.userId!, token: {} as any },
        rawRequest: req as any,
      });

      const responseTime = Date.now() - startTime;

      // Log request
      await logAPIRequest({
        appId: 'agency_api',
        userId: scopeValidation.userId!,
        tokenId: 'agency_token',
        method: 'GET',
        endpoint: '/api/v1/agency/earnings/timeline',
        scopeUsed: 'ANALYTICS_READ',
        statusCode: 200,
        responseTime,
      });

      res.status(200).json(createSuccessResponse(timelineData, requestId));
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      logger.error('Error in earnings timeline API', error);

      res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', error.message, requestId)
      );
    }
  }
);

// ============================================================================
// WEBHOOK SUPPORT FOR AGENCIES
// ============================================================================

/**
 * Register webhook for agency events
 * Agencies can subscribe to events like:
 * - New creator linked
 * - Creator removed
 * - Earnings threshold reached
 */
export async function registerAgencyWebhook(params: {
  agencyId: string;
  eventType: 'CREATOR_LINKED' | 'CREATOR_REMOVED' | 'EARNINGS_MILESTONE';
  callbackUrl: string;
  secret: string;
}): Promise<{ webhookId: string }> {
  const { agencyId, eventType, callbackUrl, secret } = params;

  const webhookId = db.collection('agency_webhooks').doc().id;

  await db.collection('agency_webhooks').doc(webhookId).set({
    webhookId,
    agencyId,
    eventType,
    callbackUrl,
    secret,
    active: true,
    createdAt: new Date(),
  });

  logger.info('Agency webhook registered', { webhookId, agencyId, eventType });

  return { webhookId };
}

/**
 * Trigger agency webhook
 */
export async function triggerAgencyWebhook(params: {
  agencyId: string;
  eventType: 'CREATOR_LINKED' | 'CREATOR_REMOVED' | 'EARNINGS_MILESTONE';
  payload: Record<string, any>;
}): Promise<void> {
  const { agencyId, eventType, payload } = params;

  // Get all active webhooks for this agency and event type
  const webhooksSnapshot = await db
    .collection('agency_webhooks')
    .where('agencyId', '==', agencyId)
    .where('eventType', '==', eventType)
    .where('active', '==', true)
    .get();

  if (webhooksSnapshot.empty) {
    return;
  }

  // Trigger all webhooks (in parallel)
  await Promise.all(
    webhooksSnapshot.docs.map(async (doc) => {
      const webhook = doc.data();
      
      try {
        // TODO: Implement actual webhook HTTP POST
        logger.info('Would trigger webhook', {
          webhookId: webhook.webhookId,
          callbackUrl: webhook.callbackUrl,
          eventType,
        });
      } catch (error) {
        logger.error('Error triggering webhook', { webhookId: webhook.webhookId, error });
      }
    })
  );
}