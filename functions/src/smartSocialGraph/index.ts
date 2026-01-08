/**
 * PACK 161 — Smart Social Graph Cloud Functions
 * Export all callable functions for client access
 */

import * as functions from 'firebase-functions';
import {
  SmartSocialGraphRequest,
  SmartSocialGraphResponse,
  DiscoveryMode,
  CreatorCard,
} from '../types/smartSocialGraph.types';
import {
  getSmartSocialGraphFeed,
  updateDiscoveryMode,
  updateInterestVector,
  getTopicRecommendations,
  getFollowRecommendations,
} from './discoveryFeedService';
import { updateCreatorRelevanceScore } from './relevanceRanking';
import { detectFlirtManipulation } from './antiFlirtManipulation';
import { getShadowDensityStats } from './shadowDensityControl';

// ============================================================================
// LOGGER
// ============================================================================

const logger = {
  info: (...args: any[]) => console.log('[SmartSocialGraph]', ...args),
  warn: (...args: any[]) => console.warn('[SmartSocialGraph]', ...args),
  error: (...args: any[]) => console.error('[SmartSocialGraph]', ...args),
};

// ============================================================================
// DISCOVERY FEED
// ============================================================================

/**
 * Get personalized discovery feed
 * Multi-mode, interest-driven, NO matchmaking bias
 */
export const getSmartDiscoveryFeed = functions.https.onCall(
  async (
    data: SmartSocialGraphRequest,
    context: functions.https.CallableContext
  ): Promise<SmartSocialGraphResponse> => {
    try {
      // Validate authentication
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }
      
      const userId = context.auth.uid;
      
      // Validate request
      if (!data.mode) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Discovery mode is required'
        );
      }
      
      // Ensure user is requesting their own feed
      if (data.userId && data.userId !== userId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Cannot request feed for another user'
        );
      }
      
      // Set userId from auth context
      data.userId = userId;
      
      logger.info(`Getting discovery feed for user ${userId}, mode=${data.mode}`);
      
      const response = await getSmartSocialGraphFeed(data);
      
      return response;
    } catch (error: any) {
      logger.error('Error getting discovery feed:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError(
        'internal',
        error.message || 'Failed to get discovery feed'
      );
    }
  }
);

// ============================================================================
// MODE SWITCHING
// ============================================================================

/**
 * Switch discovery mode
 * User-controlled personalization
 */
export const switchDiscoveryMode = functions.https.onCall(
  async (
    data: { mode: DiscoveryMode },
    context: functions.https.CallableContext
  ): Promise<{ success: boolean; mode: DiscoveryMode }> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }
      
      const userId = context.auth.uid;
      const { mode } = data;
      
      if (!mode) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Mode is required'
        );
      }
      
      // Validate mode (NO forbidden modes)
      const validModes: DiscoveryMode[] = [
        'PROFESSIONAL',
        'SOCIAL_LIFESTYLE',
        'ENTERTAINMENT',
        'LEARNING',
        'LOCAL_EVENTS',
      ];
      
      if (!validModes.includes(mode)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          `Invalid mode: ${mode}. Forbidden modes detected.`
        );
      }
      
      logger.info(`Switching user ${userId} to mode ${mode}`);
      
      await updateDiscoveryMode(userId, mode);
      
      return { success: true, mode };
    } catch (error: any) {
      logger.error('Error switching discovery mode:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError(
        'internal',
        error.message || 'Failed to switch discovery mode'
      );
    }
  }
);

// ============================================================================
// INTEREST TRACKING
// ============================================================================

/**
 * Track content viewing to update interest vector
 * Called when user views/completes content
 */
export const trackContentView = functions.https.onCall(
  async (
    data: {
      category: string;
      sessionDurationSec: number;
      completed: boolean;
    },
    context: functions.https.CallableContext
  ): Promise<{ success: boolean }> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }
      
      const userId = context.auth.uid;
      const { category, sessionDurationSec, completed } = data;
      
      if (!category || sessionDurationSec === undefined) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Category and sessionDurationSec are required'
        );
      }
      
      logger.info(
        `Tracking content view for user ${userId}: ${category}, ` +
        `${sessionDurationSec}s, completed=${completed}`
      );
      
      await updateInterestVector(
        userId,
        category as any,
        sessionDurationSec,
        completed || false
      );
      
      return { success: true };
    } catch (error: any) {
      logger.error('Error tracking content view:', error);
      
      // Non-blocking - return success even on error
      return { success: false };
    }
  }
);

// ============================================================================
// RECOMMENDATIONS
// ============================================================================

/**
 * Get recommendations for a specific topic
 */
export const getTopicBasedRecommendations = functions.https.onCall(
  async (
    data: { topic: string; limit?: number },
    context: functions.https.CallableContext
  ): Promise<{ items: CreatorCard[] }> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }
      
      const userId = context.auth.uid;
      const { topic, limit = 10 } = data;
      
      if (!topic) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Topic is required'
        );
      }
      
      logger.info(`Getting topic recommendations for user ${userId}: ${topic}`);
      
      const items = await getTopicRecommendations(userId, topic, limit);
      
      return { items };
    } catch (error: any) {
      logger.error('Error getting topic recommendations:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError(
        'internal',
        error.message || 'Failed to get topic recommendations'
      );
    }
  }
);

/**
 * Get follow recommendations (interest-aligned only)
 */
export const getEthicalFollowRecommendations = functions.https.onCall(
  async (
    data: { limit?: number },
    context: functions.https.CallableContext
  ): Promise<{ items: CreatorCard[] }> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }
      
      const userId = context.auth.uid;
      const { limit = 10 } = data;
      
      logger.info(`Getting follow recommendations for user ${userId}`);
      
      const items = await getFollowRecommendations(userId, limit);
      
      return { items };
    } catch (error: any) {
      logger.error('Error getting follow recommendations:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError(
        'internal',
        error.message || 'Failed to get follow recommendations'
      );
    }
  }
);

// ============================================================================
// CREATOR TOOLS
// ============================================================================

/**
 * Manually refresh creator relevance score
 * For creators who want to update their discovery profile
 */
export const refreshCreatorScore = functions.https.onCall(
  async (
    data: { creatorId?: string },
    context: functions.https.CallableContext
  ): Promise<{ success: boolean; message: string }> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }
      
      const userId = context.auth.uid;
      const creatorId = data.creatorId || userId;
      
      // Users can only refresh their own score
      if (creatorId !== userId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Can only refresh your own creator score'
        );
      }
      
      logger.info(`Refreshing creator score for ${creatorId}`);
      
      await updateCreatorRelevanceScore(creatorId);
      
      return {
        success: true,
        message: 'Creator score refreshed successfully',
      };
    } catch (error: any) {
      logger.error('Error refreshing creator score:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError(
        'internal',
        error.message || 'Failed to refresh creator score'
      );
    }
  }
);

// ============================================================================
// ADMIN/MODERATION TOOLS
// ============================================================================

/**
 * Scan content for flirt manipulation (Admin/Moderator only)
 */
export const scanContentForFlirtManipulation = functions.https.onCall(
  async (
    data: {
      contentId: string;
      creatorId: string;
      caption?: string;
      title?: string;
      thumbnailUrl?: string;
    },
    context: functions.https.CallableContext
  ): Promise<{ flags: any; actionTaken: string }> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }
      
      // Check for admin/moderator role
      // This would integrate with your existing admin system
      const isModerator = context.auth.token?.roles?.moderator || false;
      const isAdmin = context.auth.token?.roles?.admin || false;
      
      if (!isModerator && !isAdmin) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only moderators and admins can scan content'
        );
      }
      
      const { contentId, creatorId, caption, title, thumbnailUrl } = data;
      
      if (!contentId || !creatorId) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'contentId and creatorId are required'
        );
      }
      
      logger.info(`Scanning content ${contentId} for flirt manipulation`);
      
      const flags = await detectFlirtManipulation(contentId, creatorId, {
        caption,
        title,
        thumbnailUrl,
      });
      
      let actionTaken = 'No action';
      if (flags.contentDemoted) {
        actionTaken = 'Content demoted';
      }
      if (flags.safetyCaseOpened) {
        actionTaken = 'Content demoted + Safety case opened';
      }
      
      return { flags, actionTaken };
    } catch (error: any) {
      logger.error('Error scanning content:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError(
        'internal',
        error.message || 'Failed to scan content'
      );
    }
  }
);

/**
 * Get shadow density statistics (Admin only)
 */
export const getShadowDensityStats_Admin = functions.https.onCall(
  async (
    data: {},
    context: functions.https.CallableContext
  ): Promise<any> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }
      
      const isAdmin = context.auth.token?.roles?.admin || false;
      
      if (!isAdmin) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only admins can view shadow density stats'
        );
      }
      
      logger.info('Getting shadow density stats');
      
      const stats = await getShadowDensityStats();
      
      return stats;
    } catch (error: any) {
      logger.error('Error getting shadow density stats:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError(
        'internal',
        error.message || 'Failed to get shadow density stats'
      );
    }
  }
);

logger.info('✅ Smart Social Graph Cloud Functions initialized');