/**
 * PACK 423 — In-App Ratings, Sentiment & NPS Engine
 * HTTP/Callable Cloud Functions
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  createInteractionRating,
  getAggregatedUserRatings,
  getAggregatedCompanionRatings,
  getMyInteractionRatings,
  flagRatingAsAbuse,
  checkRatingEligibility,
} from './pack423-ratings.service';
import {
  createNpsResponse,
  getNpsAnalytics,
  checkNpsEligibility,
  getUserNpsHistory,
  isRecentDetractor,
} from './pack423-nps.service';
import { CreateRatingInput, CreateNpsInput } from '../../shared/types/pack423-ratings.types';

/**
 * Create or update an interaction rating
 */
export const pack423_createInteractionRating = functions.https.onCall(
  async (data: CreateRatingInput, context) => {
    // Authentication required
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;

    // Ensure rater is the authenticated user
    if (data.raterUserId !== userId) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Cannot rate on behalf of another user'
      );
    }

    try {
      await createInteractionRating(data);

      // Emit metric
      console.log('[PACK423] Rating created', {
        interactionType: data.interactionType,
        rating: data.rating,
        source: data.source,
      });

      return { success: true };
    } catch (error: any) {
      console.error('[PACK423] Error creating rating:', error);
      throw new functions.https.HttpsError('internal', error.message || 'Failed to create rating');
    }
  }
);

/**
 * Get user's own interaction ratings
 */
export const pack423_getMyInteractionRatings = functions.https.onCall(
  async (data: { limit?: number }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const ratings = await getMyInteractionRatings(context.auth.uid, data.limit);
      return { ratings };
    } catch (error: any) {
      console.error('[PACK423] Error getting ratings:', error);
      throw new functions.https.HttpsError('internal', error.message || 'Failed to get ratings');
    }
  }
);

/**
 * Get aggregated user rating summary (admin/internal only)
 */
export const pack423_getUserRatingSummary = functions.https.onCall(
  async (data: { userId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check if admin or requesting own summary
    const userRef = admin.firestore().collection('users').doc(context.auth.uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data();
    const isAdmin = userData?.role === 'ADMIN' || userData?.isAdmin === true;

    if (!isAdmin && context.auth.uid !== data.userId) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can view other users rating summaries'
      );
    }

    try {
      const summary = await getAggregatedUserRatings(data.userId);
      return summary;
    } catch (error: any) {
      console.error('[PACK423] Error getting user rating summary:', error);
      throw new functions.https.HttpsError('internal', error.message || 'Failed to get summary');
    }
  }
);

/**
 * Get aggregated companion rating summary
 */
export const pack423_getCompanionRatingSummary = functions.https.onCall(
  async (data: { companionId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const summary = await getAggregatedCompanionRatings(data.companionId);
      return summary;
    } catch (error: any) {
      console.error('[PACK423] Error getting companion rating summary:', error);
      throw new functions.https.HttpsError('internal', error.message || 'Failed to get summary');
    }
  }
);

/**
 * Check rating eligibility
 */
export const pack423_checkRatingEligibility = functions.https.onCall(
  async (data: { interactionId: string; interactionType: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const eligibility = await checkRatingEligibility(
        data.interactionId,
        data.interactionType as any,
        context.auth.uid
      );
      return eligibility;
    } catch (error: any) {
      console.error('[PACK423] Error checking eligibility:', error);
      throw new functions.https.HttpsError('internal', error.message || 'Failed to check eligibility');
    }
  }
);

/**
 * Create NPS survey response
 */
export const pack423_createNpsResponse = functions.https.onCall(
  async (data: Omit<CreateNpsInput, 'userId'>, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const payload: CreateNpsInput = {
      ...data,
      userId: context.auth.uid,
    };

    try {
      await createNpsResponse(payload);

      // Emit metric
      console.log('[PACK423] NPS response created', {
        score: data.score,
        channel: data.channel,
        productArea: data.tagProductArea,
      });

      return { success: true };
    } catch (error: any) {
      console.error('[PACK423] Error creating NPS response:', error);
      throw new functions.https.HttpsError('internal', error.message || 'Failed to create NPS response');
    }
  }
);

/**
 * Check NPS eligibility
 */
export const pack423_checkNpsEligibility = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const eligibility = await checkNpsEligibility(context.auth.uid);
      return eligibility;
    } catch (error: any) {
      console.error('[PACK423] Error checking NPS eligibility:', error);
      throw new functions.https.HttpsError('internal', error.message || 'Failed to check eligibility');
    }
  }
);

/**
 * Get user's NPS history
 */
export const pack423_getUserNpsHistory = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const history = await getUserNpsHistory(context.auth.uid);
      return { history };
    } catch (error: any) {
      console.error('[PACK423] Error getting NPS history:', error);
      throw new functions.https.HttpsError('internal', error.message || 'Failed to get history');
    }
  }
);

/**
 * Get NPS analytics (admin only)
 */
export const pack423_getNpsAnalytics = functions.https.onCall(
  async (data: { startTime: number; endTime: number }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check if admin
    const userRef = admin.firestore().collection('users').doc(context.auth.uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data();
    const isAdmin = userData?.role === 'ADMIN' || userData?.isAdmin === true;

    if (!isAdmin) {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }

    try {
      const analytics = await getNpsAnalytics(data.startTime, data.endTime);
      return analytics;
    } catch (error: any) {
      console.error('[PACK423] Error getting NPS analytics:', error);
      throw new functions.https.HttpsError('internal', error.message || 'Failed to get analytics');
    }
  }
);

/**
 * Flag rating as abuse (internal/admin)
 */
export const pack423_flagRatingAsAbuse = functions.https.onCall(
  async (data: { ratingId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check if admin or support
    const userRef = admin.firestore().collection('users').doc(context.auth.uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data();
    const isAdmin = userData?.role === 'ADMIN' || userData?.isAdmin === true;
    const isSupport = userData?.role === 'SUPPORT' || userData?.isSupport === true;

    if (!isAdmin && !isSupport) {
      throw new functions.https.HttpsError('permission-denied', 'Admin or support access required');
    }

    try {
      await flagRatingAsAbuse(data.ratingId);
      return { success: true };
    } catch (error: any) {
      console.error('[PACK423] Error flagging rating:', error);
      throw new functions.https.HttpsError('internal', error.message || 'Failed to flag rating');
    }
  }
);

/**
 * Check if user is recent detractor (for retention engine integration)
 */
export const pack423_isRecentDetractor = functions.https.onCall(
  async (data: { userId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Admin or requesting own status
    const userRef = admin.firestore().collection('users').doc(context.auth.uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data();
    const isAdmin = userData?.role === 'ADMIN' || userData?.isAdmin === true;

    if (!isAdmin && context.auth.uid !== data.userId) {
      throw new functions.https.HttpsError('permission-denied', 'Permission denied');
    }

    try {
      const isDetractor = await isRecentDetractor(data.userId);
      return { isDetractor };
    } catch (error: any) {
      console.error('[PACK423] Error checking detractor status:', error);
      throw new functions.https.HttpsError('internal', error.message || 'Failed to check status');
    }
  }
);
