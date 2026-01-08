/**
 * PACK 102 — Cross-Platform Audience Growth Engine Endpoints
 * 
 * Callable Cloud Functions for audience growth tracking and analytics.
 * 
 * CRITICAL CONSTRAINTS:
 * - Zero incentives or rewards for referrals
 * - Analytics-only (no monetization changes)
 * - User can only access their own analytics
 * - Anti-spam validation on all endpoints
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, serverTimestamp } from './init';
import { logger } from 'firebase-functions/v2';
import {
  logExternalVisit,
  markAttributionSignup,
  markAttributionFollower,
  markAttributionPayer,
  rebuildAudienceAttributionDaily,
  getCreatorAudienceGrowth,
  validateDateRange,
} from './pack102-audience-engine';
import {
  LogExternalVisitRequest,
  LogExternalVisitResponse,
  GetCreatorAudienceGrowthRequest,
  GetCreatorAudienceGrowthResponse,
  GetPublicCreatorPageRequest,
  GetPublicCreatorPageResponse,
  UpdateSocialLinksRequest,
  UpdateSocialLinksResponse,
  GenerateSmartLinksResponse,
  PublicCreatorPreview,
  CreatorSocialLinks,
  AudienceGrowthError,
  AudienceGrowthErrorCode,
} from './pack102-audience-types';

// ============================================================================
// PUBLIC TRACKING ENDPOINT
// ============================================================================

/**
 * Log external visit (public, no auth required)
 * Called when someone clicks a creator's public profile link
 */
export const audienceGrowth_logVisit = onCall(
  { region: 'europe-west3' },
  async (request): Promise<LogExternalVisitResponse> => {
    const data = request.data as LogExternalVisitRequest;
    
    if (!data.creatorId || !data.platform) {
      throw new HttpsError('invalid-argument', 'creatorId and platform are required');
    }

    try {
      const result = await logExternalVisit(data);
      return result;
    } catch (error: any) {
      logger.error('[AudienceGrowth] Error logging visit:', error);
      
      if (error instanceof AudienceGrowthError) {
        throw new HttpsError('failed-precondition', error.message, { code: error.code });
      }
      
      throw new HttpsError('internal', 'Failed to log visit');
    }
  }
);

// ============================================================================
// CREATOR ANALYTICS ENDPOINTS
// ============================================================================

/**
 * Get creator's audience growth metrics
 * Returns funnel data for specified date range
 */
export const audienceGrowth_getMetrics = onCall(
  { region: 'europe-west3' },
  async (request): Promise<GetCreatorAudienceGrowthResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const data = request.data as GetCreatorAudienceGrowthRequest;
    const userId = data.userId || request.auth.uid;

    // Security: Users can only view their own analytics
    if (userId !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'Cannot access another user\'s analytics');
    }

    try {
      // Parse dates
      const toDate = data.toDate ? new Date(data.toDate) : new Date();
      const fromDate = data.fromDate 
        ? new Date(data.fromDate) 
        : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Validate date range
      validateDateRange(fromDate, toDate);

      // Get metrics
      const metrics = await getCreatorAudienceGrowth(userId, fromDate, toDate);

      return {
        visits: metrics.visits,
        signups: metrics.signups,
        follows: metrics.follows,
        firstMessages: metrics.firstMessages,
        firstPaidInteractions: metrics.firstPaidInteractions,
        platformBreakdown: metrics.platformBreakdown,
      };
    } catch (error: any) {
      logger.error('[AudienceGrowth] Error getting metrics:', error);
      
      if (error instanceof AudienceGrowthError) {
        throw new HttpsError('failed-precondition', error.message, { code: error.code });
      }
      
      throw new HttpsError('internal', 'Failed to get audience growth metrics');
    }
  }
);

// ============================================================================
// SOCIAL LINKS MANAGEMENT
// ============================================================================

/**
 * Update creator's social links
 * Stores platform handles/usernames for Smart Links
 */
export const audienceGrowth_updateSocialLinks = onCall(
  { region: 'europe-west3' },
  async (request): Promise<UpdateSocialLinksResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const data = request.data as UpdateSocialLinksRequest;

    try {
      const socialLinksRef = db.collection('creator_social_links').doc(userId);
      const socialLinksSnap = await socialLinksRef.get();

      const updatedLinks: Partial<CreatorSocialLinks> = {
        ...(socialLinksSnap.exists ? socialLinksSnap.data() : {}),
        creatorId: userId,
        updatedAt: serverTimestamp() as any,
      };

      // Update provided fields
      if (data.tiktok !== undefined) updatedLinks.tiktok = data.tiktok;
      if (data.instagram !== undefined) updatedLinks.instagram = data.instagram;
      if (data.youtube !== undefined) updatedLinks.youtube = data.youtube;
      if (data.twitch !== undefined) updatedLinks.twitch = data.twitch;
      if (data.snapchat !== undefined) updatedLinks.snapchat = data.snapchat;
      if (data.x !== undefined) updatedLinks.x = data.x;
      if (data.facebook !== undefined) updatedLinks.facebook = data.facebook;
      if (data.publicProfileEnabled !== undefined) {
        updatedLinks.publicProfileEnabled = data.publicProfileEnabled;
      }
      if (data.bioVisible !== undefined) updatedLinks.bioVisible = data.bioVisible;
      if (data.followerCountVisible !== undefined) {
        updatedLinks.followerCountVisible = data.followerCountVisible;
      }

      await socialLinksRef.set(updatedLinks, { merge: true });

      logger.info(`[AudienceGrowth] Updated social links for user ${userId}`);

      return {
        success: true,
        socialLinks: updatedLinks as CreatorSocialLinks,
      };
    } catch (error: any) {
      logger.error('[AudienceGrowth] Error updating social links:', error);
      throw new HttpsError('internal', 'Failed to update social links');
    }
  }
);

/**
 * Generate Smart Links for all configured platforms
 * Returns platform-specific URLs with tracking
 */
export const audienceGrowth_generateSmartLinks = onCall(
  { region: 'europe-west3' },
  async (request): Promise<GenerateSmartLinksResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;

    try {
      // Get user profile for username
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data();
      const username = userData?.username || userId;

      // Generate smart links for each platform
      const baseUrl = 'https://avalo.app/u';
      const smartLinks: Partial<Record<string, string>> = {
        tiktok: `${baseUrl}/${username}?src=tiktok`,
        instagram: `${baseUrl}/${username}?src=instagram`,
        youtube: `${baseUrl}/${username}?src=youtube`,
        twitch: `${baseUrl}/${username}?src=twitch`,
        snapchat: `${baseUrl}/${username}?src=snapchat`,
        x: `${baseUrl}/${username}?src=x`,
        facebook: `${baseUrl}/${username}?src=facebook`,
        other: `${baseUrl}/${username}?src=other`,
      };

      // QR code URL (would integrate with QR service in production)
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(smartLinks.other!)}`;

      // Share text
      const shareText = `Follow me on Avalo! ${smartLinks.other}`;

      logger.info(`[AudienceGrowth] Generated smart links for user ${userId}`);

      return {
        success: true,
        smartLinks: smartLinks as any,
        qrCodeUrl,
        shareText,
      };
    } catch (error: any) {
      logger.error('[AudienceGrowth] Error generating smart links:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to generate smart links');
    }
  }
);

// ============================================================================
// PUBLIC CREATOR PAGE
// ============================================================================

/**
 * Get public creator preview (no auth required)
 * Returns sanitized creator data for web landing page
 */
export const audienceGrowth_getPublicCreatorPage = onCall(
  { region: 'europe-west3' },
  async (request): Promise<GetPublicCreatorPageResponse> => {
    const data = request.data as GetPublicCreatorPageRequest;

    if (!data.username && !data.userId) {
      throw new HttpsError('invalid-argument', 'username or userId is required');
    }

    try {
      let userDoc;
      
      if (data.userId) {
        userDoc = await db.collection('users').doc(data.userId).get();
      } else if (data.username) {
        const usersSnap = await db
          .collection('users')
          .where('username', '==', data.username)
          .limit(1)
          .get();
        
        if (!usersSnap.empty) {
          userDoc = usersSnap.docs[0];
        }
      }

      if (!userDoc || !userDoc.exists) {
        return {
          success: false,
          error: 'Creator not found',
        };
      }

      const userData = userDoc.data();
      const userId = userDoc.id;

      // Check if public profile is enabled
      const socialLinksDoc = await db.collection('creator_social_links').doc(userId).get();
      const socialLinks = socialLinksDoc.data();

      if (!socialLinks || !socialLinks.publicProfileEnabled) {
        return {
          success: false,
          error: 'Public profile is not enabled for this creator',
        };
      }

      // Build public preview
      const preview: PublicCreatorPreview = {
        username: userData.username || userId,
        displayName: userData.displayName || 'Avalo Creator',
        profilePhoto: userData.photos?.[0] || undefined,
        bio: socialLinks.bioVisible ? userData.bio : undefined,
        followerCount: socialLinks.followerCountVisible 
          ? Math.round((userData.followerCount || 0) / 10) * 10 // Round to nearest 10
          : undefined,
        isVerified: userData.verification?.status === 'VERIFIED' || false,
        ctaText: 'Join Avalo to follow and message me',
        deepLink: `avalo://profile/${userId}`,
      };

      return {
        success: true,
        creator: preview,
      };
    } catch (error: any) {
      logger.error('[AudienceGrowth] Error getting public creator page:', error);
      
      return {
        success: false,
        error: 'Failed to load creator profile',
      };
    }
  }
);

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

/**
 * Daily job to rebuild audience attribution metrics
 * Runs every night at 5 AM UTC (after creator analytics)
 */
export const audienceGrowth_dailyAggregation = onSchedule(
  {
    schedule: '0 5 * * *', // Daily at 5 AM UTC
    timeZone: 'UTC',
    memory: '512MiB' as const,
    timeoutSeconds: 540,
    region: 'europe-west3',
  },
  async (event) => {
    try {
      logger.info('[AudienceGrowth] Starting daily aggregation job');

      // Process yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await rebuildAudienceAttributionDaily(yesterday);

      logger.info('[AudienceGrowth] Completed daily aggregation job');
      return null;
    } catch (error: any) {
      logger.error('[AudienceGrowth] Error in daily aggregation job:', error);
      throw error;
    }
  }
);