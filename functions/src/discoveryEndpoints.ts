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
import { HttpsError, admin, auth, onCall, onRequest, logger, onSchedule, onDocumentCreated, onDocumentUpdated, onDocumentWritten } from './runtime';

// ============================================================================
// CALLABLE FUNCTIONS
// ============================================================================

/**
 * Get Discovery Feed
 * Returns personalized, ranked feed of discoverable profiles
 */
export const getDiscoveryFeedCallable = onDocumentUpdated('users/{userId}', async (event) => {
  const change = event.data;
  if (!change) return;
    try {
      const userId = event.params.userId;
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
export const onTrustProfileUpdate = onDocumentWritten('user_trust_profile/{userId}', async (event) => {
  const change = event.data;
  if (!change) return;
    try {
      const userId = event.params.userId;

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
export const onEnforcementStateUpdate = onDocumentWritten('user_enforcement_state/{userId}', async (event) => {
  const change = event.data;
  if (!change) return;
    try {
      const userId = event.params.userId;

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
export const onMediaUpload = onDocumentCreated('media/{mediaId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;
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
export const onMonetizationEvent = onDocumentCreated('transactions/{txId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;
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









