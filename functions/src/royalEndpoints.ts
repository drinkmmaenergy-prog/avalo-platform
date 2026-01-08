/**
 * PACK 50 — Royal Club HTTP Endpoints
 * Callable functions for mobile app to query Royal state
 */

import * as functions from 'firebase-functions';
import {
  getRoyalState,
  getRoyalPreview,
  recomputeRoyalMembership,
} from './royalEngine';

/**
 * GET /royal/state?userId=...
 * Returns user's Royal Club membership state
 */
export const royal_getState = functions.https.onCall(async (data, context) => {
  // Users can only query their own state (unless admin)
  const requesterId = context.auth?.uid;
  const targetUserId = data.userId;

  if (!requesterId) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  if (!targetUserId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId is required');
  }

  // Users can only query their own Royal state
  if (requesterId !== targetUserId) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot query another user\'s Royal state');
  }

  try {
    const state = await getRoyalState(targetUserId);

    if (!state) {
      // Return default NONE state
      return {
        userId: targetUserId,
        tier: 'NONE',
        source: 'NONE',
        spendLast30DaysTokens: 0,
        spendLast90DaysTokens: 0,
        activatedAt: null,
        expiresAt: null,
      };
    }

    // Convert Firestore timestamps to milliseconds for client
    return {
      userId: state.userId,
      tier: state.tier,
      source: state.source,
      spendLast30DaysTokens: state.spendLast30DaysTokens,
      spendLast90DaysTokens: state.spendLast90DaysTokens,
      activatedAt: state.activatedAt ? (state.activatedAt as any).toMillis?.() || null : null,
      expiresAt: state.expiresAt ? (state.expiresAt as any).toMillis?.() || null : null,
    };
  } catch (error: any) {
    console.error('Error in royal_getState:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * GET /royal/preview?userId=...
 * Returns preview of next tier and tokens needed
 */
export const royal_getPreview = functions.https.onCall(async (data, context) => {
  const requesterId = context.auth?.uid;
  const targetUserId = data.userId;

  if (!requesterId) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  if (!targetUserId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId is required');
  }

  // Users can only query their own preview
  if (requesterId !== targetUserId) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot query another user\'s Royal preview');
  }

  try {
    const preview = await getRoyalPreview(targetUserId);

    return {
      currentTier: preview.currentTier,
      nextTier: preview.nextTier,
      tokensNeededForNextTier: preview.tokensNeededForNextTier,
    };
  } catch (error: any) {
    console.error('Error in royal_getPreview:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Manual recompute (for debugging/admin)
 */
export const royal_recompute = functions.https.onCall(async (data, context) => {
  const requesterId = context.auth?.uid;
  const targetUserId = data.userId;

  if (!requesterId) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  if (!targetUserId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId is required');
  }

  // Users can only recompute their own membership
  if (requesterId !== targetUserId) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot recompute another user\'s membership');
  }

  try {
    const membership = await recomputeRoyalMembership(targetUserId);

    return {
      success: true,
      tier: membership.tier,
      source: membership.source,
    };
  } catch (error: any) {
    console.error('Error in royal_recompute:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Record token spend for Royal Club tracking
 * Called from mobile when tokens are spent
 */
export const royal_recordSpend = functions.https.onCall(async (data, context) => {
  const requesterId = context.auth?.uid;
  const { userId, tokensSpent } = data;

  if (!requesterId) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  if (!userId || !tokensSpent) {
    throw new functions.https.HttpsError('invalid-argument', 'userId and tokensSpent are required');
  }

  // Users can only record their own spend
  if (requesterId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot record spend for another user');
  }

  if (tokensSpent <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'tokensSpent must be positive');
  }

  try {
    const { recordTokenSpend } = await import('./royalEngine');
    await recordTokenSpend(userId, tokensSpent);

    return { success: true };
  } catch (error: any) {
    console.error('Error in royal_recordSpend:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

console.log('✅ Royal Club Endpoints initialized - PACK 50');