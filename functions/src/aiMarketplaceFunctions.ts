/**
 * PACK 311 — AI Companions Marketplace, Ranking & Owner Analytics
 * Cloud Functions for marketplace discovery and owner analytics
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, serverTimestamp } from './init.js';
import { rebuildAllAvatarIndexes, rebuildAvatarIndex } from './aiMarketplaceRanking.js';
import type {
  MarketplaceQueryParams,
  MarketplaceResponse,
  OwnerAvatarsResponse
} from './aiMarketplaceTypes.js';

/**
 * Get AI Marketplace - Global discovery
 */
export const getAIMarketplace = onCall<MarketplaceQueryParams>(
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const {
      lang,
      country,
      page = 1,
      pageSize = 20,
      categoryTag
    } = request.data;

    // Validate pagination
    if (page < 1 || pageSize < 1 || pageSize > 100) {
      throw new HttpsError('invalid-argument', 'Invalid pagination parameters');
    }

    // Build query
    let query = db.collection('aiAvatarIndex')
      .where('status', '==', 'ACTIVE')
      .where('trust.riskLevel', '!=', 'CRITICAL');

    // Apply filters
    if (lang) {
      query = query.where('languages', 'array-contains', lang);
    }

    if (country) {
      query = query.where('country', '==', country);
    }

    if (categoryTag) {
      query = query.where('categoryTags', 'array-contains', categoryTag);
    }

    // Order by ranking score
    query = query.orderBy('rankingScore', 'desc');

    // Get total count for pagination
    const countSnap = await query.count().get();
    const total = countSnap.data().count;

    // Apply pagination
    const offset = (page - 1) * pageSize;
    query = query.offset(offset).limit(pageSize);

    // Execute query
    const snapshot = await query.get();

    // Map to response format
    const items = snapshot.docs.map(doc => {
      const data = doc.data() as any;
      return {
        avatarId: data.avatarId,
        displayName: data.displayName,
        shortTagline: data.shortTagline,
        primaryPhotoUrl: data.primaryPhotoUrl,
        languages: data.languages,
        country: data.country,
        rankingScore: data.rankingScore,
        trustBadge: {
          ownerVerified: data.trust.ownerVerified,
          ownerTrustLevel: data.trust.ownerTrustLevel
        }
      };
    });

    const hasMore = (offset + pageSize) < total;

    const response: MarketplaceResponse = {
      items,
      page,
      pageSize,
      hasMore
    };

    // Log analytics event
    await db.collection('analytics_events').add({
      eventType: 'AI_MARKETPLACE_VIEWED',
      userId,
      timestamp: new Date().toISOString(),
      metadata: {
        filters: { lang, country, categoryTag },
        page,
        resultsCount: items.length
      },
      createdAt: serverTimestamp()
    });

    return response;
  }
);

/**
 * Get Owner's AI Avatars with Analytics
 */
export const getMyAIAvatars = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Get owner's avatars from index
  const indexSnap = await db.collection('aiAvatarIndex')
    .where('ownerId', '==', userId)
    .orderBy('stats.tokensEarned7d', 'desc')
    .get();

  const avatars = indexSnap.docs.map(doc => {
    const data = doc.data() as any;
    return {
      avatarId: data.avatarId,
      displayName: data.displayName,
      status: data.status,
      primaryPhotoUrl: data.primaryPhotoUrl,
      stats: {
        views7d: data.stats.views7d,
        views30d: data.stats.views30d,
        chatStarts7d: data.stats.starts7d,
        chatStarts30d: data.stats.starts30d,
        tokensEarned7d: data.stats.tokensEarned7d,
        tokensEarned30d: data.stats.tokensEarned30d,
        retentionScore: data.stats.retentionScore
      }
    };
  });

  const response: OwnerAvatarsResponse = {
    avatars
  };

  return response;
});

/**
 * Track AI Avatar Card View
 */
export const trackAIAvatarView = onCall<{ avatarId: string }>(
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { avatarId } = request.data;

    if (!avatarId) {
      throw new HttpsError('invalid-argument', 'Avatar ID is required');
    }

    // Log event
    await db.collection('analytics_events').add({
      eventType: 'AI_AVATAR_CARD_VIEWED',
      userId,
      avatarId,
      timestamp: new Date().toISOString(),
      createdAt: serverTimestamp()
    });

    return { success: true };
  }
);

/**
 * Track AI Avatar Detail Opened
 */
export const trackAIAvatarDetailOpened = onCall<{ avatarId: string }>(
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { avatarId } = request.data;

    if (!avatarId) {
      throw new HttpsError('invalid-argument', 'Avatar ID is required');
    }

    // Log event
    await db.collection('analytics_events').add({
      eventType: 'AI_AVATAR_DETAIL_OPENED',
      userId,
      avatarId,
      timestamp: new Date().toISOString(),
      createdAt: serverTimestamp()
    });

    return { success: true };
  }
);

/**
 * Manual trigger to rebuild a specific avatar's index
 */
export const rebuildAvatarIndexManual = onCall<{ avatarId: string }>(
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { avatarId } = request.data;

    // Verify ownership or admin
    const avatarSnap = await db.collection('aiAvatars').doc(avatarId).get();
    
    if (!avatarSnap.exists) {
      throw new HttpsError('not-found', 'Avatar not found');
    }

    const avatar = avatarSnap.data();

    // Check if user is owner or admin
    const userSnap = await db.collection('users').doc(userId).get();
    const userData = userSnap.data();
    const isAdmin = userData?.role === 'admin' || userData?.role === 'moderator';

    if (avatar.ownerId !== userId && !isAdmin) {
      throw new HttpsError('permission-denied', 'Not authorized to rebuild this avatar index');
    }

    // Rebuild index
    await rebuildAvatarIndex(avatarId);

    return { success: true };
  }
);

/**
 * Cron Job: Daily ranking update (runs at 2 AM UTC)
 */
export const cronRecomputeAIMarketplaceRankingDaily = onSchedule(
  {
    schedule: '0 2 * * *', // Daily at 2 AM UTC
    timeZone: 'UTC',
    memory: '512MiB',
    timeoutSeconds: 540, // 9 minutes
  },
  async (event) => {
    console.log('Starting daily AI marketplace ranking recomputation...');

    try {
      const result = await rebuildAllAvatarIndexes();

      console.log('Daily ranking update completed:', result);

      // Log the cron execution
      await db.collection('system_logs').add({
        type: 'cron_execution',
        job: 'ai_marketplace_ranking_daily',
        result,
        timestamp: new Date().toISOString(),
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error in daily ranking update:', error);

      // Log the error
      await db.collection('system_logs').add({
        type: 'cron_error',
        job: 'ai_marketplace_ranking_daily',
        error: error.message,
        timestamp: new Date().toISOString(),
        createdAt: serverTimestamp()
      });

      throw error;
    }
  }
);

/**
 * Cron Job: Hourly quick stats update for top avatars (runs every hour)
 */
export const cronUpdateTopAvatarsHourly = onSchedule(
  {
    schedule: '0 * * * *', // Every hour at minute 0
    timeZone: 'UTC',
    memory: '256MiB',
    timeoutSeconds: 300, // 5 minutes
  },
  async (event) => {
    console.log('Starting hourly top avatars update...');

    try {
      // Get top 100 avatars by ranking score
      const topAvatarsSnap = await db.collection('aiAvatarIndex')
        .where('status', '==', 'ACTIVE')
        .orderBy('rankingScore', 'desc')
        .limit(100)
        .get();

      let updated = 0;
      let errors = 0;

      // Update each one
      for (const doc of topAvatarsSnap.docs) {
        try {
          await rebuildAvatarIndex(doc.id);
          updated++;
        } catch (error) {
          console.error(`Error updating avatar ${doc.id}:`, error);
          errors++;
        }
      }

      const result = { updated, errors };

      console.log('Hourly top avatars update completed:', result);

      // Log execution
      await db.collection('system_logs').add({
        type: 'cron_execution',
        job: 'ai_marketplace_top_avatars_hourly',
        result,
        timestamp: new Date().toISOString(),
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error in hourly update:', error);

      await db.collection('system_logs').add({
        type: 'cron_error',
        job: 'ai_marketplace_top_avatars_hourly',
        error: error.message,
        timestamp: new Date().toISOString(),
        createdAt: serverTimestamp()
      });

      throw error;
    }
  }
);