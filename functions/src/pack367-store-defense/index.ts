/**
 * PACK 367: APP STORE DEFENSE & REPUTATION ENGINE
 * Main entry point for Cloud Functions
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { ReviewScanner } from './reviewScanner';
import { DefenseActionManager } from './defenseActions';
import { ReviewFunnelManager } from './reviewFunnel';
import {
  ReviewScanRequest,
  ReviewScanResult,
  Platform,
  DefenseStatus,
} from './types';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * CLOUD FUNCTION: Scan Store Reviews
 * HTTP endpoint to import and analyze store reviews
 */
export const pack367_scanStoreReviews = functions.https.onCall(
  async (data: ReviewScanRequest, context): Promise<ReviewScanResult> => {
    
    // Verify admin authentication
    if (!context.auth || !context.auth.token.role || context.auth.token.role !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can scan store reviews'
      );
    }
    
    const { platform, reviews, scanType } = data;
    
    if (!platform || !reviews || !Array.isArray(reviews)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid request data'
      );
    }
    
    functions.logger.info(`Scanning ${reviews.length} ${platform} reviews`, { scanType });
    
    const scanner = new ReviewScanner();
    const result = await scanner.scanReviews(platform, reviews);
    
    functions.logger.info('Review scan complete', result.summary);
    
    return result;
  }
);

/**
 * CLOUD FUNCTION: Trigger Defense Action
 * HTTP endpoint for admins to manually trigger defense actions
 */
export const pack367_triggerDefenseAction = functions.https.onCall(
  async (data: {
    actionType: string;
    platform?: Platform;
    reason: string;
    durationHours?: number;
  }, context) => {
    
    // Verify admin authentication
    if (!context.auth || !context.auth.token.role || context.auth.token.role !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can trigger defense actions'
      );
    }
    
    const { actionType, platform, reason, durationHours } = data;
    
    const manager = new DefenseActionManager();
    const actionId = await manager.triggerDefenseAction({
      actionType: actionType as any,
      platform,
      triggeredBy: context.auth.uid,
      triggerReason: reason,
      autoTriggered: false,
      durationHours,
    });
    
    functions.logger.info(`Defense action triggered by admin: ${actionType}`, {
      actionId,
      adminId: context.auth.uid,
    });
    
    return { success: true, actionId };
  }
);

/**
 * CLOUD FUNCTION: Deactivate Defense Action
 * HTTP endpoint for admins to deactivate defense actions
 */
export const pack367_deactivateDefenseAction = functions.https.onCall(
  async (data: { actionId: string }, context) => {
    
    // Verify admin authentication
    if (!context.auth || !context.auth.token.role || context.auth.token.role !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can deactivate defense actions'
      );
    }
    
    const { actionId } = data;
    
    const manager = new DefenseActionManager();
    await manager.deactivateDefenseAction(actionId, context.auth.uid);
    
    functions.logger.info(`Defense action deactivated by admin: ${actionId}`);
    
    return { success: true };
  }
);

/**
 * CLOUD FUNCTION: Check Review Prompt Eligibility
 * Called when a positive trigger event occurs
 */
export const pack367_checkReviewPromptEligibility = functions.https.onCall(
  async (data: {
    userId: string;
    triggerType: string;
    triggerEventId?: string;
    platform?: Platform;
  }, context) => {
    
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }
    
    // Verify user can only check their own eligibility (or admin)
    const isAdmin = context.auth.token.role === 'admin';
    if (!isAdmin && context.auth.uid !== data.userId) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Can only check own eligibility'
      );
    }
    
    const funnelManager = new ReviewFunnelManager();
    const result = await funnelManager.triggerReviewPrompt({
      userId: data.userId,
      triggerType: data.triggerType as any,
      triggerEventId: data.triggerEventId,
      platform: data.platform,
    });
    
    return result;
  }
);

/**
 * CLOUD FUNCTION: Get Eligible Review Prompts
 * Called by mobile app to check for pending prompts
 */
export const pack367_getEligibleReviewPrompts = functions.https.onCall(
  async (data: { userId: string }, context) => {
    
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }
    
    // Verify user can only get their own prompts (or admin)
    const isAdmin = context.auth.token.role === 'admin';
    if (!isAdmin && context.auth.uid !== data.userId) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Can only get own prompts'
      );
    }
    
    const funnelManager = new ReviewFunnelManager();
    const prompts = await funnelManager.getEligiblePrompts(data.userId);
    
    return { prompts };
  }
);

/**
 * CLOUD FUNCTION: Record Review Prompt Response
 * Called when user responds to a review prompt
 */
export const pack367_recordPromptResponse = functions.https.onCall(
  async (data: {
    promptId: string;
    responseAction: 'reviewed' | 'dismissed' | 'later';
  }, context) => {
    
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }
    
    const { promptId, responseAction } = data;
    
    // Verify user owns this prompt
    const promptDoc = await db.collection('storeReviewPrompts').doc(promptId).get();
    if (!promptDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Prompt not found'
      );
    }
    
    const prompt = promptDoc.data();
    const isAdmin = context.auth.token.role === 'admin';
    if (!isAdmin && prompt?.userId !== context.auth.uid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Cannot respond to another user\'s prompt'
      );
    }
    
    const funnelManager = new ReviewFunnelManager();
    await funnelManager.recordPromptResponse(promptId, responseAction);
    
    return { success: true };
  }
);

/**
 * CLOUD FUNCTION: Get Defense Status
 * Get current store defense status for a platform
 */
export const pack367_getDefenseStatus = functions.https.onCall(
  async (data: { platform: Platform }, context): Promise<DefenseStatus> => {
    
    // Verify admin/moderator authentication
    if (!context.auth || !context.auth.token.role || 
        !['admin', 'moderator'].includes(context.auth.token.role)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins/moderators can view defense status'
      );
    }
    
    const { platform } = data;
    
    // Get active defense actions
    const actionsQuery = await db.collection('storeDefenseActions')
      .where('platform', '==', platform)
      .where('active', '==', true)
      .get();
    
    const activeDefenseActions = actionsQuery.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Get active crises
    const crisesQuery = await db.collection('storeCrisisEvents')
      .where('platform', '==', platform)
      .where('active', '==', true)
      .get();
    
    const activeCrises = crisesQuery.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Get recent signals
    const signalsQuery = await db.collection('storeReputationSignals')
      .where('platform', '==', platform)
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();
    
    const recentSignals = signalsQuery.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Calculate current rating
    const recentReviews = await db.collection('storeReviewsMirror')
      .where('platform', '==', platform)
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();
    
    const currentRating = recentReviews.empty ? 0 : 
      recentReviews.docs.reduce((sum, doc) => sum + doc.data().rating, 0) / recentReviews.size;
    
    // Determine trend
    const oldReviews = await db.collection('storeReviewsMirror')
      .where('platform', '==', platform)
      .where('timestamp', '<', admin.firestore.Timestamp.fromDate(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      ))
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();
    
    const previousRating = oldReviews.empty ? currentRating :
      oldReviews.docs.reduce((sum, doc) => sum + doc.data().rating, 0) / oldReviews.size;
    
    const ratingTrend = currentRating > previousRating + 0.1 ? 'up' :
      currentRating < previousRating - 0.1 ? 'down' : 'stable';
    
    // Calculate health score (0-100)
    let healthScore = 100;
    healthScore -= (activeCrises.length * 20); // -20 per crisis
    healthScore -= (activeDefenseActions.length * 10); // -10 per action
    healthScore -= Math.max(0, (4.0 - currentRating) * 10); // rating penalty
    healthScore = Math.max(0, Math.min(100, healthScore));
    
    return {
      platform,
      activeDefenseActions: activeDefenseActions as any,
      activeCrises: activeCrises as any,
      recentSignals: recentSignals as any,
      currentRating,
      ratingTrend: ratingTrend as any,
      healthScore,
    };
  }
);

/**
 * SCHEDULED FUNCTION: Expire Old Defense Actions
 * Runs every hour to clean up expired actions
 */
export const pack367_expireDefenseActions = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    functions.logger.info('Running defense action expiry check');
    
    const manager = new DefenseActionManager();
    await manager.expireOldActions();
    
    return null;
  });

/**
 * SCHEDULED FUNCTION: Clean Up Expired Review Prompts
 * Runs daily to clean up expired prompts
 */
export const pack367_cleanupExpiredPrompts = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    functions.logger.info('Running review prompt cleanup');
    
    const funnelManager = new ReviewFunnelManager();
    await funnelManager.cleanupExpiredPrompts();
    
    return null;
  });

/**
 * FIRESTORE TRIGGER: Monitor Rating Changes
 * Automatically detect rating drops when reviews are added
 */
export const pack367_monitorReviews = functions.firestore
  .document('storeReviewsMirror/{reviewId}')
  .onCreate(async (snap, context) => {
    const review = snap.data();
    
    // If flagged or low rating, check for crisis patterns
    if (review.flagLevel !== 'none' || review.rating <= 2) {
      functions.logger.info('Flagged review detected, checking for patterns', {
        reviewId: context.params.reviewId,
        flagLevel: review.flagLevel,
        rating: review.rating,
      });
      
      // This would trigger additional analysis
      // Could trigger immediate re-scan or pattern detection
    }
    
    return null;
  });
