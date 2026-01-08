/**
 * PACK 113 — Full Ecosystem API Gateway
 * REST API Endpoints
 * 
 * All endpoints require OAuth2 authentication and scope validation
 * No access to private data, tokens, payouts, or ranking
 */

import { onRequest } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  enforceScope,
  checkAPIRateLimit,
  logAPIRequest,
  createSuccessResponse,
  createErrorResponse,
} from './pack113-api-gateway';
import { APIScope } from './pack113-types';

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Parse Authorization header and extract token
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * API Gateway middleware - validates token, scope, and rate limit
 */
async function apiGatewayMiddleware(params: {
  req: any;
  requiredScope: APIScope;
  endpoint: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
}): Promise<{
  authorized: boolean;
  userId?: string;
  appId?: string;
  tokenId?: string;
  error?: { code: string; message: string };
  requestId: string;
}> {
  const { req, requiredScope, endpoint, method } = params;
  const requestId = generateId();
  const startTime = Date.now();

  // Extract token
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return {
      authorized: false,
      requestId,
      error: {
        code: 'MISSING_TOKEN',
        message: 'Authorization header with Bearer token required',
      },
    };
  }

  // Enforce scope
  const scopeCheck = await enforceScope({
    token,
    requiredScope,
    endpoint,
    ipAddress: req.ip,
  });

  if (!scopeCheck.authorized) {
    return {
      authorized: false,
      requestId,
      error: {
        code: 'UNAUTHORIZED',
        message: scopeCheck.error || 'Unauthorized',
      },
    };
  }

  const tokenData = scopeCheck.tokenData!;

  // Check rate limit
  const rateLimitCheck = await checkAPIRateLimit({
    appId: tokenData.appId,
    userId: tokenData.userId,
    endpoint,
    method,
  });

  if (!rateLimitCheck.allowed) {
    // Log the request even though it's rate limited
    await logAPIRequest({
      appId: tokenData.appId,
      userId: tokenData.userId,
      tokenId: tokenData.tokenId,
      method,
      endpoint,
      scopeUsed: requiredScope,
      statusCode: 429,
      responseTime: Date.now() - startTime,
      ipAddress: req.ip,
      error: rateLimitCheck.reason,
    });

    return {
      authorized: false,
      requestId,
      error: {
        code: 'RATE_LIMITED',
        message: rateLimitCheck.reason || 'Rate limit exceeded',
      },
    };
  }

  return {
    authorized: true,
    userId: tokenData.userId,
    appId: tokenData.appId,
    tokenId: tokenData.tokenId,
    requestId,
  };
}

// ============================================================================
// PROFILE ENDPOINTS
// ============================================================================

/**
 * GET /api/v1/me/profile
 * Read creator's public profile
 */
export const getMyProfile = onRequest(
  { region: 'europe-west3', cors: true },
  async (req, res) => {
    const startTime = Date.now();

    try {
      // Validate method
      if (req.method !== 'GET') {
        res.status(405).json(createErrorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 'none'));
        return;
      }

      // Middleware
      const auth = await apiGatewayMiddleware({
        req,
        requiredScope: 'PROFILE_READ',
        endpoint: '/api/v1/me/profile',
        method: 'GET',
      });

      if (!auth.authorized) {
        res.status(401).json(createErrorResponse(auth.error!.code, auth.error!.message, auth.requestId));
        return;
      }

      // Fetch user profile
      const userDoc = await db.collection('users').doc(auth.userId!).get();
      if (!userDoc.exists) {
        res.status(404).json(createErrorResponse('NOT_FOUND', 'User not found', auth.requestId));
        return;
      }

      const userData = userDoc.data()!;

      // Return only public fields
      const profileData = {
        userId: auth.userId,
        username: userData.username,
        displayName: userData.displayName,
        bio: userData.bio,
        avatarUrl: userData.avatarUrl,
        coverPhotoUrl: userData.coverPhotoUrl,
        socialLinks: userData.socialLinks || [],
        isVerified: userData.isVerified || false,
        creatorMode: userData.creatorMode || false,
        joinedAt: userData.createdAt,
      };

      // Log request
      await logAPIRequest({
        appId: auth.appId!,
        userId: auth.userId!,
        tokenId: auth.tokenId!,
        method: 'GET',
        endpoint: '/api/v1/me/profile',
        scopeUsed: 'PROFILE_READ',
        statusCode: 200,
        responseTime: Date.now() - startTime,
        ipAddress: req.ip,
      });

      res.status(200).json(createSuccessResponse(profileData, auth.requestId));
    } catch (error: any) {
      logger.error('Error in getMyProfile', error);
      res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', 'Internal server error', 'error')
      );
    }
  }
);

/**
 * PATCH /api/v1/me/profile
 * Update creator's profile basics
 */
export const updateMyProfile = onRequest(
  { region: 'europe-west3', cors: true },
  async (req, res) => {
    const startTime = Date.now();

    try {
      // Validate method
      if (req.method !== 'PATCH') {
        res.status(405).json(createErrorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 'none'));
        return;
      }

      // Middleware
      const auth = await apiGatewayMiddleware({
        req,
        requiredScope: 'PROFILE_UPDATE',
        endpoint: '/api/v1/me/profile',
        method: 'PATCH',
      });

      if (!auth.authorized) {
        res.status(401).json(createErrorResponse(auth.error!.code, auth.error!.message, auth.requestId));
        return;
      }

      const { bio, socialLinks, coverPhotoUrl } = req.body;

      // Validate allowed updates (only safe fields)
      const allowedUpdates: any = {
        updatedAt: serverTimestamp(),
      };

      if (bio !== undefined) {
        if (typeof bio !== 'string' || bio.length > 500) {
          res.status(400).json(
            createErrorResponse('INVALID_INPUT', 'Bio must be string, max 500 chars', auth.requestId)
          );
          return;
        }
        allowedUpdates.bio = bio;
      }

      if (socialLinks !== undefined) {
        if (!Array.isArray(socialLinks) || socialLinks.length > 5) {
          res.status(400).json(
            createErrorResponse('INVALID_INPUT', 'Social links must be array, max 5 items', auth.requestId)
          );
          return;
        }
        allowedUpdates.socialLinks = socialLinks;
      }

      if (coverPhotoUrl !== undefined) {
        if (typeof coverPhotoUrl !== 'string') {
          res.status(400).json(
            createErrorResponse('INVALID_INPUT', 'Cover photo URL must be string', auth.requestId)
          );
          return;
        }
        allowedUpdates.coverPhotoUrl = coverPhotoUrl;
      }

      // Update profile
      await db.collection('users').doc(auth.userId!).update(allowedUpdates);

      // Log request
      await logAPIRequest({
        appId: auth.appId!,
        userId: auth.userId!,
        tokenId: auth.tokenId!,
        method: 'PATCH',
        endpoint: '/api/v1/me/profile',
        scopeUsed: 'PROFILE_UPDATE',
        statusCode: 200,
        responseTime: Date.now() - startTime,
        ipAddress: req.ip,
      });

      res.status(200).json(
        createSuccessResponse({ updated: true, fields: Object.keys(allowedUpdates) }, auth.requestId)
      );
    } catch (error: any) {
      logger.error('Error in updateMyProfile', error);
      res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', 'Internal server error', 'error')
      );
    }
  }
);

// ============================================================================
// CONTENT ENDPOINTS
// ============================================================================

/**
 * POST /api/v1/me/stories
 * Publish a story on behalf of creator
 */
export const postStory = onRequest(
  { region: 'europe-west3', cors: true },
  async (req, res) => {
    const startTime = Date.now();

    try {
      if (req.method !== 'POST') {
        res.status(405).json(createErrorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 'none'));
        return;
      }

      const auth = await apiGatewayMiddleware({
        req,
        requiredScope: 'POST_STORY',
        endpoint: '/api/v1/me/stories',
        method: 'POST',
      });

      if (!auth.authorized) {
        res.status(401).json(createErrorResponse(auth.error!.code, auth.error!.message, auth.requestId));
        return;
      }

      const { mediaUrl, caption, expiresInHours } = req.body;

      // Validate input
      if (!mediaUrl || typeof mediaUrl !== 'string') {
        res.status(400).json(
          createErrorResponse('INVALID_INPUT', 'mediaUrl is required', auth.requestId)
        );
        return;
      }

      const storyId = generateId();
      const expirationHours = expiresInHours || 24;

      const story = {
        storyId,
        authorId: auth.userId,
        mediaUrl,
        caption: caption || '',
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + expirationHours * 3600 * 1000),
        views: 0,
        postedViaAPI: true,
        postedByAppId: auth.appId,
      };

      await db.collection('stories').doc(storyId).set(story);

      // Log request
      await logAPIRequest({
        appId: auth.appId!,
        userId: auth.userId!,
        tokenId: auth.tokenId!,
        method: 'POST',
        endpoint: '/api/v1/me/stories',
        scopeUsed: 'POST_STORY',
        statusCode: 201,
        responseTime: Date.now() - startTime,
        ipAddress: req.ip,
      });

      res.status(201).json(createSuccessResponse({ storyId, expiresAt: story.expiresAt }, auth.requestId));
    } catch (error: any) {
      logger.error('Error in postStory', error);
      res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Internal server error', 'error'));
    }
  }
);

/**
 * POST /api/v1/me/posts
 * Publish a feed post
 */
export const postFeedContent = onRequest(
  { region: 'europe-west3', cors: true },
  async (req, res) => {
    const startTime = Date.now();

    try {
      if (req.method !== 'POST') {
        res.status(405).json(createErrorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 'none'));
        return;
      }

      const auth = await apiGatewayMiddleware({
        req,
        requiredScope: 'POST_FEED_CONTENT',
        endpoint: '/api/v1/me/posts',
        method: 'POST',
      });

      if (!auth.authorized) {
        res.status(401).json(createErrorResponse(auth.error!.code, auth.error!.message, auth.requestId));
        return;
      }

      const { content, mediaUrls } = req.body;

      if (!content || typeof content !== 'string') {
        res.status(400).json(
          createErrorResponse('INVALID_INPUT', 'content is required', auth.requestId)
        );
        return;
      }

      const postId = generateId();
      const post = {
        postId,
        authorId: auth.userId,
        content,
        mediaUrls: mediaUrls || [],
        createdAt: serverTimestamp(),
        likes: 0,
        comments: 0,
        postedViaAPI: true,
        postedByAppId: auth.appId,
      };

      await db.collection('posts').doc(postId).set(post);

      await logAPIRequest({
        appId: auth.appId!,
        userId: auth.userId!,
        tokenId: auth.tokenId!,
        method: 'POST',
        endpoint: '/api/v1/me/posts',
        scopeUsed: 'POST_FEED_CONTENT',
        statusCode: 201,
        responseTime: Date.now() - startTime,
        ipAddress: req.ip,
      });

      res.status(201).json(createSuccessResponse({ postId }, auth.requestId));
    } catch (error: any) {
      logger.error('Error in postFeedContent', error);
      res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Internal server error', 'error'));
    }
  }
);

/**
 * DELETE /api/v1/me/posts/:postId
 * Delete own post
 */
export const deletePost = onRequest(
  { region: 'europe-west3', cors: true },
  async (req, res) => {
    const startTime = Date.now();

    try {
      if (req.method !== 'DELETE') {
        res.status(405).json(createErrorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 'none'));
        return;
      }

      const auth = await apiGatewayMiddleware({
        req,
        requiredScope: 'DELETE_OWN_CONTENT',
        endpoint: '/api/v1/me/posts/:postId',
        method: 'DELETE',
      });

      if (!auth.authorized) {
        res.status(401).json(createErrorResponse(auth.error!.code, auth.error!.message, auth.requestId));
        return;
      }

      const postId = req.query.postId as string;
      if (!postId) {
        res.status(400).json(createErrorResponse('INVALID_INPUT', 'postId required', auth.requestId));
        return;
      }

      // Verify ownership
      const postDoc = await db.collection('posts').doc(postId).get();
      if (!postDoc.exists) {
        res.status(404).json(createErrorResponse('NOT_FOUND', 'Post not found', auth.requestId));
        return;
      }

      const post = postDoc.data()!;
      if (post.authorId !== auth.userId) {
        res.status(403).json(
          createErrorResponse('FORBIDDEN', 'Cannot delete another user\'s post', auth.requestId)
        );
        return;
      }

      await db.collection('posts').doc(postId).delete();

      await logAPIRequest({
        appId: auth.appId!,
        userId: auth.userId!,
        tokenId: auth.tokenId!,
        method: 'DELETE',
        endpoint: '/api/v1/me/posts/:postId',
        scopeUsed: 'DELETE_OWN_CONTENT',
        statusCode: 200,
        responseTime: Date.now() - startTime,
        ipAddress: req.ip,
      });

      res.status(200).json(createSuccessResponse({ deleted: true, postId }, auth.requestId));
    } catch (error: any) {
      logger.error('Error in deletePost', error);
      res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Internal server error', 'error'));
    }
  }
);

// ============================================================================
// ANALYTICS ENDPOINTS
// ============================================================================

/**
 * GET /api/v1/me/analytics/overview
 * Get creator's aggregated analytics
 */
export const getAnalyticsOverview = onRequest(
  { region: 'europe-west3', cors: true },
  async (req, res) => {
    const startTime = Date.now();

    try {
      if (req.method !== 'GET') {
        res.status(405).json(createErrorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 'none'));
        return;
      }

      const auth = await apiGatewayMiddleware({
        req,
        requiredScope: 'ANALYTICS_READ',
        endpoint: '/api/v1/me/analytics/overview',
        method: 'GET',
      });

      if (!auth.authorized) {
        res.status(401).json(createErrorResponse(auth.error!.code, auth.error!.message, auth.requestId));
        return;
      }

      // Fetch analytics snapshot
      const snapshotDoc = await db
        .collection('creator_analytics_snapshot')
        .doc(auth.userId!)
        .get();

      if (!snapshotDoc.exists) {
        // No data yet
        res.status(200).json(
          createSuccessResponse(
            {
              totalEarnings: 0,
              payingUsers: 0,
              paidInteractions: 0,
              topEarningSource: null,
              period: 'last_30_days',
            },
            auth.requestId
          )
        );
        return;
      }

      const snapshot = snapshotDoc.data()!;

      // Return aggregated data only (no personal identifying info)
      const analyticsData = {
        totalEarnings: snapshot.last30_totalNet || 0,
        payingUsers: snapshot.last30_totalPayers || 0,
        paidInteractions: snapshot.last30_totalEvents || 0,
        earningsBySource: snapshot.last30_bySource || {},
        period: 'last_30_days',
        lastUpdated: snapshot.updatedAt,
      };

      await logAPIRequest({
        appId: auth.appId!,
        userId: auth.userId!,
        tokenId: auth.tokenId!,
        method: 'GET',
        endpoint: '/api/v1/me/analytics/overview',
        scopeUsed: 'ANALYTICS_READ',
        statusCode: 200,
        responseTime: Date.now() - startTime,
        ipAddress: req.ip,
      });

      res.status(200).json(createSuccessResponse(analyticsData, auth.requestId));
    } catch (error: any) {
      logger.error('Error in getAnalyticsOverview', error);
      res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Internal server error', 'error'));
    }
  }
);

/**
 * GET /api/v1/me/audience/demographics
 * Get high-level audience demographics (aggregated only)
 */
export const getAudienceDemographics = onRequest(
  { region: 'europe-west3', cors: true },
  async (req, res) => {
    const startTime = Date.now();

    try {
      if (req.method !== 'GET') {
        res.status(405).json(createErrorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 'none'));
        return;
      }

      const auth = await apiGatewayMiddleware({
        req,
        requiredScope: 'AUDIENCE_READ_AGGREGATE',
        endpoint: '/api/v1/me/audience/demographics',
        method: 'GET',
      });

      if (!auth.authorized) {
        res.status(401).json(createErrorResponse(auth.error!.code, auth.error!.message, auth.requestId));
        return;
      }

      // Fetch audience insights (aggregated only)
      const audienceDoc = await db
        .collection('creator_audience_insights')
        .doc(auth.userId!)
        .get();

      if (!audienceDoc.exists) {
        res.status(200).json(
          createSuccessResponse(
            {
              totalFollowers: 0,
              topRegions: [],
              topLanguages: [],
            },
            auth.requestId
          )
        );
        return;
      }

      const audience = audienceDoc.data()!;

      // Return only aggregated demographics (no individual user data)
      const demographics = {
        totalFollowers: audience.totalFollowers || 0,
        topRegions: audience.topRegions || [],
        topLanguages: audience.topLanguages || [],
        growthRate: audience.growthRate || 0,
      };

      await logAPIRequest({
        appId: auth.appId!,
        userId: auth.userId!,
        tokenId: auth.tokenId!,
        method: 'GET',
        endpoint: '/api/v1/me/audience/demographics',
        scopeUsed: 'AUDIENCE_READ_AGGREGATE',
        statusCode: 200,
        responseTime: Date.now() - startTime,
        ipAddress: req.ip,
      });

      res.status(200).json(createSuccessResponse(demographics, auth.requestId));
    } catch (error: any) {
      logger.error('Error in getAudienceDemographics', error);
      res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Internal server error', 'error'));
    }
  }
);