/**
 * PACK 195 — REVISED v2
 * Chemistry-Based Discovery API Endpoints
 */

import * as functions from 'firebase-functions';
import {
  calculateChemistryScore,
  evaluateChemistryBoost,
  detectSpamBehavior,
  updateInteractionMetrics,
  calculateChemistryScoresForFeed,
} from './chemistryMatchingEngine';

// ============================================================================
// CALLABLE FUNCTIONS
// ============================================================================

/**
 * Calculate Chemistry Score
 * Returns detailed chemistry score between viewer and target
 */
export const calculateChemistryScoreCallable = functions
  .region('europe-west3')
  .https.onCall(async (data, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const userId = context.auth.uid;
      const { targetUserId } = data;

      if (!targetUserId) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'targetUserId is required'
        );
      }

      // Calculate chemistry score
      const score = await calculateChemistryScore(userId, targetUserId);

      return { ok: true, score };
    } catch (error: any) {
      console.error('[calculateChemistryScoreCallable] Error:', error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        error.message || 'Failed to calculate chemistry score'
      );
    }
  });

/**
 * Evaluate Chemistry Boost
 * Checks if users qualify for visibility boost
 */
export const evaluateChemistryBoostCallable = functions
  .region('europe-west3')
  .https.onCall(async (data, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const userId = context.auth.uid;
      const { targetUserId } = data;

      if (!targetUserId) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'targetUserId is required'
        );
      }

      // Evaluate chemistry boost
      const boostPercentage = await evaluateChemistryBoost(userId, targetUserId);

      return { 
        ok: true, 
        boostApplied: boostPercentage > 0,
        boostPercentage,
      };
    } catch (error: any) {
      console.error('[evaluateChemistryBoostCallable] Error:', error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        error.message || 'Failed to evaluate chemistry boost'
      );
    }
  });

/**
 * Track Interaction
 * Updates interaction metrics for chemistry calculations
 */
export const trackInteractionCallable = functions
  .region('europe-west3')
  .https.onCall(async (data, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const userId = context.auth.uid;
      const {
        targetUserId,
        interactionType,
        metadata = {},
      } = data;

      if (!targetUserId || !interactionType) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'targetUserId and interactionType are required'
        );
      }

      // Build update based on interaction type
      const updates: any = {};

      switch (interactionType) {
        case 'profile_view_start':
          updates.viewStartTime = new Date();
          break;

        case 'profile_view_end':
          if (metadata.viewStartTime) {
            const duration = (Date.now() - new Date(metadata.viewStartTime).getTime()) / 1000;
            updates.viewDuration = duration;
          }
          break;

        case 'swipe':
          updates.swipeDirection = metadata.direction;
          break;

        case 'message_sent':
          updates.messagesSent = metadata.increment || 1;
          updates.averageMessageLength = metadata.messageLength;
          break;

        case 'message_received':
          updates.messagesReceived = metadata.increment || 1;
          updates.averageReplySpeed = metadata.replySpeed;
          break;

        case 'flirt':
          updates.flirtCount = metadata.increment || 1;
          break;

        case 'compliment':
          updates.complimentCount = metadata.increment || 1;
          break;

        case 'chat_active':
          updates.isActive = true;
          break;

        case 'photo_view':
          updates.photoViews = metadata.increment || 1;
          updates.photoViewDuration = metadata.duration || 0;
          break;

        case 'photo_like':
          updates.photoLikes = metadata.increment || 1;
          break;

        default:
          throw new functions.https.HttpsError(
            'invalid-argument',
            `Unknown interaction type: ${interactionType}`
          );
      }

      // Update metrics
      await updateInteractionMetrics(userId, targetUserId, updates);

      // Check for chemistry boost if appropriate interaction
      if (['flirt', 'compliment', 'chat_active'].includes(interactionType)) {
        await evaluateChemistryBoost(userId, targetUserId);
      }

      return { ok: true };
    } catch (error: any) {
      console.error('[trackInteractionCallable] Error:', error);

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
 * Check Spam Status
 * Checks if user's behavior is flagged as spam
 */
export const checkSpamStatusCallable = functions
  .region('europe-west3')
  .https.onCall(async (data, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const userId = context.auth.uid;
      const { targetUserId } = data;

      if (!targetUserId) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'targetUserId is required'
        );
      }

      // Detect spam behavior
      const spamResult = await detectSpamBehavior(userId, targetUserId);

      return { 
        ok: true, 
        ...spamResult,
      };
    } catch (error: any) {
      console.error('[checkSpamStatusCallable] Error:', error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        error.message || 'Failed to check spam status'
      );
    }
  });

/**
 * Get Chemistry Feed Scores
 * Calculates chemistry scores for all candidates in feed
 */
export const getChemistryFeedScoresCallable = functions
  .region('europe-west3')
  .https.onCall(async (data, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const userId = context.auth.uid;
      const { candidateIds } = data;

      if (!candidateIds || !Array.isArray(candidateIds)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'candidateIds array is required'
        );
      }

      if (candidateIds.length > 50) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Cannot calculate scores for more than 50 candidates at once'
        );
      }

      // Calculate chemistry scores
      const scores = await calculateChemistryScoresForFeed(userId, candidateIds);

      // Convert Map to object for JSON serialization
      const scoresObject: { [key: string]: number } = {};
      scores.forEach((score, targetId) => {
        scoresObject[targetId] = score;
      });

      return { 
        ok: true, 
        scores: scoresObject,
      };
    } catch (error: any) {
      console.error('[getChemistryFeedScoresCallable] Error:', error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        error.message || 'Failed to get chemistry feed scores'
      );
    }
  });

console.log('✅ PACK 195 — Chemistry Matching API initialized');