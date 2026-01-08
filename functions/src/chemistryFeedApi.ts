/**
 * PACK 208 — Chemistry Feed API
 * Firebase Functions for adaptive attraction ranking feed
 */

import * as functions from 'firebase-functions';
import { getFeed, invalidateCache } from './services/chemistryFeed/feedEngine';
import { FeedOptions, AnalyticsEvent } from './services/chemistryFeed/types';
import { db, increment, arrayUnion } from './init';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Get Chemistry Feed
 * Returns personalized feed with chemistry-based ranking
 */
export const getChemistryFeed = functions
  .region('europe-west3')
  .https.onCall(async (data, context) => {
    try {
      // Authentication check
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const userId = context.auth.uid;
      const { limit = 20, offset = 0, refreshCache = false } = data;

      // Validate inputs
      if (limit > 50 || limit < 1) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Limit must be between 1 and 50'
        );
      }

      if (offset < 0) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Offset must be non-negative'
        );
      }

      // Get feed
      const options: FeedOptions = {
        userId,
        limit,
        offset,
        refreshCache,
      };

      const feed = await getFeed(options);

      // Track load event
      await trackAnalytics({
        eventType: 'feed.load',
        userId,
        metadata: {
          limit,
          offset,
          profileCount: feed.profiles.length,
          refreshCache,
        },
        timestamp: new Date(),
      });

      console.log(`[ChemistryFeedAPI] Served feed to user ${userId}: ${feed.profiles.length} profiles`);

      return {
        ok: true,
        ...feed,
      };
    } catch (error: any) {
      console.error('[getChemistryFeed] Error:', error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        error.message || 'Failed to get chemistry feed'
      );
    }
  });

/**
 * Track Feed Interaction
 * Logs user interactions with feed profiles
 */
export const trackFeedInteraction = functions
  .region('europe-west3')
  .https.onCall(async (data, context) => {
    try {
      // Authentication check
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const userId = context.auth.uid;
      const {
        eventType,
        targetUserId,
        metadata = {},
      } = data;

      // Validate event type
      const validEvents = [
        'feed.scroll',
        'feed.profile.view',
        'feed.profile.like',
        'feed.profile.skip',
        'feed.profile.chat.start',
      ];

      if (!validEvents.includes(eventType)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Invalid event type'
        );
      }

      // Track analytics
      await trackAnalytics({
        eventType: eventType as AnalyticsEvent['eventType'],
        userId,
        targetUserId,
        metadata,
        timestamp: new Date(),
      });

      // Update swipe behavior for learning
      if (eventType === 'feed.profile.like' || eventType === 'feed.profile.skip') {
        await updateSwipeBehavior(userId, targetUserId!, eventType === 'feed.profile.like');
      }

      console.log(`[ChemistryFeedAPI] Tracked ${eventType} for user ${userId}`);

      return { ok: true };
    } catch (error: any) {
      console.error('[trackFeedInteraction] Error:', error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        error.message || 'Failed to track interaction'
      );
    }
  });

/**
 * Refresh Feed Cache
 * Force refresh the feed cache for a user
 */
export const refreshFeedCache = functions
  .region('europe-west3')
  .https.onCall(async (data, context) => {
    try {
      // Authentication check
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const userId = context.auth.uid;

      // Invalidate cache
      invalidateCache(userId);

      // Get fresh feed
      const feed = await getFeed({ userId, limit: 20, refreshCache: true });

      console.log(`[ChemistryFeedAPI] Refreshed feed cache for user ${userId}`);

      return {
        ok: true,
        profileCount: feed.profiles.length,
        lastRefreshedAt: feed.lastRefreshedAt,
      };
    } catch (error: any) {
      console.error('[refreshFeedCache] Error:', error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        error.message || 'Failed to refresh feed cache'
      );
    }
  });

/**
 * Get Feed Stats
 * Returns statistics about the user's feed
 */
export const getFeedStats = functions
  .region('europe-west3')
  .https.onCall(async (data, context) => {
    try {
      // Authentication check
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const userId = context.auth.uid;

      // Get analytics for last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const analyticsSnapshot = await db
        .collection('analytics_events')
        .where('userId', '==', userId)
        .where('timestamp', '>=', oneDayAgo)
        .get();

      const stats = {
        feedLoads: 0,
        profileViews: 0,
        likes: 0,
        skips: 0,
        chatsStarted: 0,
        scrolls: 0,
      };

      analyticsSnapshot.docs.forEach(doc => {
        const event = doc.data();
        switch (event.eventType) {
          case 'feed.load':
            stats.feedLoads++;
            break;
          case 'feed.profile.view':
            stats.profileViews++;
            break;
          case 'feed.profile.like':
            stats.likes++;
            break;
          case 'feed.profile.skip':
            stats.skips++;
            break;
          case 'feed.profile.chat.start':
            stats.chatsStarted++;
            break;
          case 'feed.scroll':
            stats.scrolls++;
            break;
        }
      });

      // Calculate engagement metrics
      const engagementRate = stats.profileViews > 0 
        ? ((stats.likes + stats.chatsStarted) / stats.profileViews) * 100 
        : 0;

      const chatConversionRate = stats.likes > 0
        ? (stats.chatsStarted / stats.likes) * 100
        : 0;

      console.log(`[ChemistryFeedAPI] Retrieved stats for user ${userId}`);

      return {
        ok: true,
        stats,
        metrics: {
          engagementRate: Math.round(engagementRate * 100) / 100,
          chatConversionRate: Math.round(chatConversionRate * 100) / 100,
        },
        period: '24h',
      };
    } catch (error: any) {
      console.error('[getFeedStats] Error:', error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        error.message || 'Failed to get feed stats'
      );
    }
  });

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Track analytics event
 */
async function trackAnalytics(event: AnalyticsEvent): Promise<void> {
  try {
    await db.collection('analytics_events').add({
      eventType: event.eventType,
      userId: event.userId,
      targetUserId: event.targetUserId || null,
      metadata: event.metadata || {},
      timestamp: event.timestamp,
    });
  } catch (error) {
    console.error('[trackAnalytics] Error:', error);
    // Don't throw - analytics failure should not block operations
  }
}

/**
 * Update swipe behavior for machine learning
 */
async function updateSwipeBehavior(
  userId: string,
  targetUserId: string,
  isLike: boolean
): Promise<void> {
  try {
    const behaviorRef = db.collection('swipe_behavior').doc(userId);
    const targetDoc = await db.collection('users').doc(targetUserId).get();

    if (!targetDoc.exists) return;

    const targetData = targetDoc.data()!;

    await behaviorRef.set(
      {
        totalSwipes: increment(1),
        rightSwipes: isLike ? increment(1) : 0,
        leftSwipes: !isLike ? increment(1) : 0,
        lastSwipeAt: new Date(),
        patterns: {
          // Update learned patterns
          likedGenders: isLike && targetData.gender
            ? arrayUnion(targetData.gender)
            : FieldValue.delete(),
          preferredAgeRange: isLike && targetData.age
            ? [
                Math.min(targetData.age - 3, 18),
                Math.max(targetData.age + 3, 100),
              ]
            : FieldValue.delete(),
        },
      },
      { merge: true }
    );
  } catch (error) {
    console.error('[updateSwipeBehavior] Error:', error);
    // Don't throw - behavior tracking failure should not block operations
  }
}

console.log('✅ PACK 208: Chemistry Feed API loaded');