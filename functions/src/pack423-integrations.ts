/**
 * PACK 423 — Integrations with other engines
 * Connects ratings & NPS to reputation, retention, fraud, and support systems
 */

import * as admin from 'firebase-admin';
import { UserRatingSummary } from '../../shared/types/pack423-ratings.types';
import { getAggregatedUserRatings } from './pack423-ratings.service';
import { isRecentDetractor } from './pack423-nps.service';

const db = admin.firestore();

/**
 * INTEGRATION: PACK 422 — Reputation Engine
 * Incorporate rating aggregates into user reputation scores
 */
export async function updateReputationFromRatings(userId: string): Promise<void> {
  try {
    const ratingSummary = await getAggregatedUserRatings(userId);

    // Calculate quality signals
    const chatQuality = ratingSummary.byType.CHAT_SESSION?.avgRating || null;
    const callQuality =
      ratingSummary.byType.VOICE_CALL?.avgRating ||
      ratingSummary.byType.VIDEO_CALL?.avgRating ||
      null;
    const meetingReliability = ratingSummary.byType.MEETING?.avgRating || null;

    // Update reputation document (PACK 422 structure)
    const reputationRef = db.collection('userReputations').doc(userId);
    
    await reputationRef.set(
      {
        userId,
        ratingSignals: {
          avgRating90d: ratingSummary.avgRating90d,
          totalRatings90d: ratingSummary.totalRatings90d,
          chatQuality,
          callQuality,
          meetingReliability,
          lastUpdated: Date.now(),
        },
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    console.log('[PACK423] Updated reputation from ratings for user:', userId);
  } catch (error) {
    console.error('[PACK423] Error updating reputation from ratings:', error);
  }
}

/**
 * INTEGRATION: PACK 301/301A/301B — Growth & Retention Engine
 * Use NPS segments to inform retention strategy
 */
export async function getRetentionSignals(userId: string): Promise<{
  isDetractor: boolean;
  suppressEngagement: boolean;
  segment?: string;
}> {
  try {
    const isDetractor = await isRecentDetractor(userId);

    return {
      isDetractor,
      suppressEngagement: isDetractor, // Suppress nudges for recent detractors
      segment: isDetractor ? 'DETRACTOR' : 'NEUTRAL',
    };
  } catch (error) {
    console.error('[PACK423] Error getting retention signals:', error);
    return {
      isDetractor: false,
      suppressEngagement: false,
    };
  }
}

/**
 * INTEGRATION: PACK 302/352 + 190 — Fraud & Abuse Detection
 * Flag suspicious rating patterns
 */
export async function detectRatingAnomalies(userId: string): Promise<{
  isSuspicious: boolean;
  reasons: string[];
}> {
  try {
    const reasons: string[] = [];

    // Get user's rating history as a rater
    const ratingsSnap = await db
      .collection('userInteractionRatings')
      .where('raterUserId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    if (ratingsSnap.empty) {
      return { isSuspicious: false, reasons: [] };
    }

    const ratings = ratingsSnap.docs.map((doc) => doc.data());

    // Pattern 1: Excessive 1-star ratings (brigading)
    const oneStarCount = ratings.filter((r) => r.rating === 1).length;
    if (oneStarCount > 10 && oneStarCount / ratings.length > 0.7) {
      reasons.push('Excessive 1-star ratings (possible brigading)');
    }

    // Pattern 2: All ratings in short time window (bot-like)
    const recentCount = ratings.filter(
      (r) => Date.now() - r.createdAt < 3600000 // 1 hour
    ).length;
    if (recentCount > 10) {
      reasons.push('Many ratings in short time window (bot-like behavior)');
    }

    // Pattern 3: Only negative ratings combined with disputes
    const avgRating =
      ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
    if (avgRating < 2 && ratings.length > 5) {
      reasons.push('Consistently low ratings (possible abuse)');
    }

    return {
      isSuspicious: reasons.length > 0,
      reasons,
    };
  } catch (error) {
    console.error('[PACK423] Error detecting rating anomalies:', error);
    return { isSuspicious: false, reasons: [] };
  }
}

/**
 * INTEGRATION: PACK 300–300B — Support Tooling
 * Provide rating context for support tickets
 */
export async function getSupportContext(userId: string): Promise<{
  ratingSummary: UserRatingSummary | null;
  recentLowRatings: number;
  isRecentDetractor: boolean;
}> {
  try {
    const ratingSummary = await getAggregatedUserRatings(userId);
    const isDetractor = await isRecentDetractor(userId);

    // Count recent low ratings (1-2 stars) in last 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const lowRatingsSnap = await db
      .collection('userInteractionRatings')
      .where('targetUserId', '==', userId)
      .where('createdAt', '>=', thirtyDaysAgo)
      .get();

    const recentLowRatings = lowRatingsSnap.docs.filter((doc) => {
      const rating = doc.data().rating;
      return rating <= 2;
    }).length;

    return {
      ratingSummary,
      recentLowRatings,
      isRecentDetractor: isDetractor,
    };
  } catch (error) {
    console.error('[PACK423] Error getting support context:', error);
    return {
      ratingSummary: null,
      recentLowRatings: 0,
      isRecentDetractor: false,
    };
  }
}

/**
 * INTEGRATION: Trigger reputation update when rating is created
 * This should be called from the ratings service after rating creation
 */
export async function onRatingCreated(targetUserId?: string): Promise<void> {
  if (targetUserId) {
    // Async, non-blocking
    updateReputationFromRatings(targetUserId).catch(console.error);
  }
}
