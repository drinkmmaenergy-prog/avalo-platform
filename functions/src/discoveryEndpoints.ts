/**
 * PACK 94 — Discovery Endpoints
 * Callable functions and scheduled jobs for Discovery Engine v2
 */

import * as functions from 'firebase-functions';
import { getDiscoveryFeed, searchProfiles } from './discoveryEngineV2';
import {
  rebuildDiscoveryProfile,
  bulkRebuildDiscoveryProfiles,
  refreshStaleProfiles,
  degradeInactiveUserScores,
} from './discoveryProfileBuilder';
import {
  GetDiscoveryFeedRequest,
  SearchProfilesRequest,
  DiscoveryFeedResponse,
  SearchProfilesResponse,
} from './types/discovery.types';

// ============================================================================
// CALLABLE FUNCTIONS
// ============================================================================

/**
 * Get Discovery Feed
 * Returns personalized, ranked feed of discoverable profiles
 */
export const getDiscoveryFeedCallable = functions
  .region('europe-west3')
  .https.onCall(async (data: GetDiscoveryFeedRequest, context) => {
    try {
      // Verify authentication
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const callerId = context.auth.uid;
      const { userId, cursor, limit = 20, filters } = data;

      // Verify the caller is requesting their own feed
      if (callerId !== userId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Cannot access other users\' feeds'
        );
      }

      // Validate limit
      if (limit < 1 || limit > 100) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Limit must be between 1 and 100'
        );
      }

      // Generate feed
      const response: DiscoveryFeedResponse = await getDiscoveryFeed(
        userId,
        cursor,
        limit,
        filters
      );

      return { ok: true, ...response };
    } catch (error: any) {
      console.error('[getDiscoveryFeedCallable] Error:', error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        error.message || 'Failed to get discovery feed'
      );
    }
  });

/**
 * Search Profiles
 * Returns filtered and ranked search results
 */
export const searchProfilesCallable = functions
  .region('europe-west3')
  .https.onCall(async (data: SearchProfilesRequest, context) => {
    try {
      // Verify authentication
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const callerId = context.auth.uid;
      const { userId, query, cursor, limit = 20, filters } = data;

      // Verify the caller is performing their own search
      if (callerId !== userId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Cannot perform search for other users'
        );
      }

      // Validate limit
      if (limit < 1 || limit > 100) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Limit must be between 1 and 100'
        );
      }

      // Perform search
      const response: SearchProfilesResponse = await searchProfiles(
        userId,
        query,
        cursor,
        limit,
        filters
      );

      return { ok: true, ...response };
    } catch (error: any) {
      console.error('[searchProfilesCallable] Error:', error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        error.message || 'Failed to search profiles'
      );
    }
  });

/**
 * Rebuild Discovery Profile (Manual Trigger)
 * Allows manual rebuild of a user's discovery profile
 */
export const rebuildDiscoveryProfileCallable = functions
  .region('europe-west3')
  .https.onCall(async (data: { userId: string }, context) => {
    try {
      // Verify authentication
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const callerId = context.auth.uid;
      const { userId } = data;

      // Only allow rebuilding own profile (or admin)
      const isAdmin = context.auth.token?.admin === true;
      if (callerId !== userId && !isAdmin) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Cannot rebuild other users\' profiles'
        );
      }

      // Rebuild profile
      const profile = await rebuildDiscoveryProfile(userId, 'MANUAL_TRIGGER');

      return { ok: true, profile };
    } catch (error: any) {
      console.error('[rebuildDiscoveryProfileCallable] Error:', error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        error.message || 'Failed to rebuild discovery profile'
      );
    }
  });

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

/**
 * Refresh Discovery Profiles Daily
 * Runs daily at 2 AM UTC to refresh stale profiles
 */
export const refreshDiscoveryProfilesDaily = functions
  .region('europe-west3')
  .pubsub.schedule('0 2 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    try {
      console.log('[refreshDiscoveryProfilesDaily] Starting daily refresh');

      // Refresh profiles older than 7 days
      const result = await refreshStaleProfiles(7, 100);

      console.log(
        `[refreshDiscoveryProfilesDaily] Completed: ${result.refreshed} refreshed, ${result.errors} errors`
      );

      return { ok: true, ...result };
    } catch (error) {
      console.error('[refreshDiscoveryProfilesDaily] Error:', error);
      throw error;
    }
  });

/**
 * Degrade Inactive User Scores
 * Runs daily at 3 AM UTC to reduce scores for inactive users
 */
export const degradeInactiveScoresDaily = functions
  .region('europe-west3')
  .pubsub.schedule('0 3 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    try {
      console.log('[degradeInactiveScoresDaily] Starting score degradation');

      // Degrade users inactive for 30+ days
      const result = await degradeInactiveUserScores(30, 100);

      console.log(
        `[degradeInactiveScoresDaily] Completed: ${result.degraded} users degraded`
      );

      return { ok: true, ...result };
    } catch (error) {
      console.error('[degradeInactiveScoresDaily] Error:', error);
      throw error;
    }
  });

/**
 * Bulk Rebuild Discovery Profiles (Admin)
 * HTTP endpoint for admin-triggered bulk rebuilds
 */
export const bulkRebuildDiscoveryProfilesHttp = functions
  .region('europe-west3')
  .https.onRequest(async (req, res) => {
    try {
      // Verify admin access (check custom header or token)
      const adminKey = req.headers['x-admin-key'];
      if (adminKey !== process.env.ADMIN_KEY) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const batchSize = parseInt(req.query.batchSize as string) || 100;
      const cursor = req.query.cursor as string | undefined;

      console.log('[bulkRebuildDiscoveryProfilesHttp] Starting bulk rebuild');

      const result = await bulkRebuildDiscoveryProfiles(batchSize, cursor);

      console.log(
        `[bulkRebuildDiscoveryProfilesHttp] Completed: ${result.processed} processed, ${result.errors} errors`
      );

      res.json({ ok: true, ...result });
    } catch (error: any) {
      console.error('[bulkRebuildDiscoveryProfilesHttp] Error:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

// ============================================================================
// FIRESTORE TRIGGERS
// ============================================================================

/**
 * Profile Update Trigger
 * Rebuilds discovery profile when user profile changes
 */
export const onProfileUpdate = functions
  .region('europe-west3')
  .firestore.document('users/{userId}')
  .onUpdate(async (change, context) => {
    try {
      const userId = context.params.userId;
      const beforeData = change.before.data();
      const afterData = change.after.data();

      // Check if relevant fields changed
      const relevantFieldsChanged =
        beforeData.profile !== afterData.profile ||
        beforeData.bio !== afterData.bio ||
        beforeData.modes !== afterData.modes ||
        beforeData.verification !== afterData.verification ||
        beforeData.profileComplete !== afterData.profileComplete;

      if (!relevantFieldsChanged) {
        console.log(`[onProfileUpdate] No relevant changes for user ${userId}`);
        return;
      }

      console.log(`[onProfileUpdate] Triggering rebuild for user ${userId}`);
      await rebuildDiscoveryProfile(userId, 'PROFILE_UPDATE');
    } catch (error) {
      console.error('[onProfileUpdate] Error:', error);
      // Don't throw - allow transaction to complete
    }
  });

/**
 * Trust Profile Update Trigger
 * Rebuilds discovery profile when trust/risk state changes
 */
export const onTrustProfileUpdate = functions
  .region('europe-west3')
  .firestore.document('user_trust_profile/{userId}')
  .onWrite(async (change, context) => {
    try {
      const userId = context.params.userId;

      console.log(`[onTrustProfileUpdate] Triggering rebuild for user ${userId}`);
      await rebuildDiscoveryProfile(userId, 'TRUST_UPDATE');
    } catch (error) {
      console.error('[onTrustProfileUpdate] Error:', error);
      // Don't throw - allow transaction to complete
    }
  });

/**
 * Enforcement State Update Trigger
 * Rebuilds discovery profile when enforcement state changes
 */
export const onEnforcementStateUpdate = functions
  .region('europe-west3')
  .firestore.document('user_enforcement_state/{userId}')
  .onWrite(async (change, context) => {
    try {
      const userId = context.params.userId;

      console.log(`[onEnforcementStateUpdate] Triggering rebuild for user ${userId}`);
      await rebuildDiscoveryProfile(userId, 'ENFORCEMENT_UPDATE');
    } catch (error) {
      console.error('[onEnforcementStateUpdate] Error:', error);
      // Don't throw - allow transaction to complete
    }
  });

/**
 * Media Upload Trigger
 * Rebuilds discovery profile when content rating might change
 */
export const onMediaUpload = functions
  .region('europe-west3')
  .firestore.document('media/{mediaId}')
  .onCreate(async (snapshot, context) => {
    try {
      const mediaData = snapshot.data();
      const userId = mediaData.userId;

      if (!userId) {
        return;
      }

      // Only trigger if it's public content that might affect rating
      if (mediaData.visibility === 'public') {
        console.log(`[onMediaUpload] Triggering rebuild for user ${userId}`);
        await rebuildDiscoveryProfile(userId, 'CONTENT_RATING_CHANGE');
      }
    } catch (error) {
      console.error('[onMediaUpload] Error:', error);
      // Don't throw - allow transaction to complete
    }
  });

/**
 * Monetization Event Trigger
 * Rebuilds discovery profile when significant monetization occurs
 */
export const onMonetizationEvent = functions
  .region('europe-west3')
  .firestore.document('transactions/{txId}')
  .onCreate(async (snapshot, context) => {
    try {
      const txData = snapshot.data();
      const userId = txData.uid;

      if (!userId) {
        return;
      }

      // Only trigger for significant monetization events
      const significantTypes = ['CHAT_DEPOSIT', 'GIFT_SENT', 'PREMIUM_STORY', 'BOOKING_PAID'];
      if (significantTypes.includes(txData.type) && txData.status === 'completed') {
        console.log(`[onMonetizationEvent] Triggering rebuild for user ${userId}`);
        await rebuildDiscoveryProfile(userId, 'MONETIZATION_EVENT');
      }
    } catch (error) {
      console.error('[onMonetizationEvent] Error:', error);
      // Don't throw - allow transaction to complete
    }
  });

console.log('✅ Discovery Endpoints initialized');