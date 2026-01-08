/**
 * PACK 423 — In-App Ratings, Sentiment & NPS Engine
 * Ratings Service
 */

import * as admin from 'firebase-admin';
import {
  UserInteractionRating,
  CreateRatingInput,
  UserRatingSummary,
  CompanionRatingSummary,
  RatingEligibility,
  InteractionType,
} from '../../shared/types/pack423-ratings.types';

const db = admin.firestore();

/**
 * Check if a user is eligible to rate an interaction
 */
export async function checkRatingEligibility(
  interactionId: string,
  interactionType: InteractionType,
  raterUserId: string
): Promise<RatingEligibility> {
  try {
    // Check interaction exists and get end time
    let interactionRef;
    let interactionData: any;

    switch (interactionType) {
      case 'MEETING':
        interactionRef = db.collection('meetings').doc(interactionId);
        break;
      case 'EVENT':
        interactionRef = db.collection('events').doc(interactionId);
        break;
      case 'VOICE_CALL':
      case 'VIDEO_CALL':
        interactionRef = db.collection('calls').doc(interactionId);
        break;
      case 'CHAT_SESSION':
        interactionRef = db.collection('chatSessions').doc(interactionId);
        break;
      case 'AI_COMPANION_SESSION':
        interactionRef = db.collection('aiCompanionSessions').doc(interactionId);
        break;
      default:
        return { eligible: false, reason: 'Unknown interaction type' };
    }

    const interactionSnap = await interactionRef.get();
    if (!interactionSnap.exists) {
      return { eligible: false, reason: 'Interaction not found' };
    }

    interactionData = interactionSnap.data();

    // Check if interaction has ended
    if (!interactionData.endedAt && interactionData.status !== 'COMPLETED') {
      return { eligible: false, reason: 'Interaction has not ended yet' };
    }

    const endedAt = interactionData.endedAt || interactionData.completedAt || Date.now();

    // Check if user participated
    const participants = interactionData.participants || [];
    const participantIds = participants.map((p: any) => p.userId || p);
    
    if (!participantIds.includes(raterUserId)) {
      return { eligible: false, reason: 'User did not participate in this interaction' };
    }

    // Check if rating window expired (48 hours)
    const now = Date.now();
    const windowExpiresAt = endedAt + (48 * 60 * 60 * 1000);
    
    if (now > windowExpiresAt) {
      return {
        eligible: false,
        reason: 'Rating window has expired',
        interactionEndedAt: endedAt,
        windowExpiresAt,
      };
    }

    return {
      eligible: true,
      interactionEndedAt: endedAt,
      windowExpiresAt,
    };
  } catch (error) {
    console.error('Error checking rating eligibility:', error);
    return { eligible: false, reason: 'Error checking eligibility' };
  }
}

/**
 * Create or update an interaction rating
 */
export async function createInteractionRating(
  payload: CreateRatingInput
): Promise<void> {
  // Validate rating value
  if (![1, 2, 3, 4, 5].includes(payload.rating)) {
    throw new Error('Invalid rating value. Must be 1-5');
  }

  // Check eligibility
  const eligibility = await checkRatingEligibility(
    payload.interactionId,
    payload.interactionType,
    payload.raterUserId
  );

  if (!eligibility.eligible) {
    throw new Error(`Not eligible to rate: ${eligibility.reason}`);
  }

  // Create rating document ID based on interaction and rater
  const ratingId = `${payload.interactionType}-${payload.interactionId}-${payload.raterUserId}`;

  const now = Date.now();

  // Check if rating already exists and is within 24h edit window
  const existingRatingRef = db.collection('userInteractionRatings').doc(ratingId);
  const existingSnap = await existingRatingRef.get();

  if (existingSnap.exists) {
    const existingData = existingSnap.data();
    const createdAt = existingData?.createdAt || 0;
    
    // Check if within 24h edit window
    if (now - createdAt > 86400000) { // 24 hours
      throw new Error('Rating can no longer be edited (24h window expired)');
    }

    // Update existing rating
    await existingRatingRef.update({
      rating: payload.rating,
      thumbsUp: payload.thumbsUp,
      comment: payload.comment,
      isAnonymous: payload.isAnonymous,
      updatedAt: now,
    });
  } else {
    // Create new rating
    const rating: UserInteractionRating = {
      id: ratingId,
      createdAt: now,
      updatedAt: now,
      interactionType: payload.interactionType,
      interactionId: payload.interactionId,
      raterUserId: payload.raterUserId,
      targetUserId: payload.targetUserId,
      targetCompanionId: payload.targetCompanionId,
      rating: payload.rating,
      thumbsUp: payload.thumbsUp,
      comment: payload.comment,
      isAnonymous: payload.isAnonymous,
      isReported: false,
      source: payload.source,
      locale: payload.locale,
      platform: payload.platform,
    };

    await existingRatingRef.set(rating);
  }

  // Trigger summary update (async)
  if (payload.targetUserId) {
    updateUserRatingSummary(payload.targetUserId).catch(console.error);
  }
  if (payload.targetCompanionId) {
    updateCompanionRatingSummary(payload.targetCompanionId).catch(console.error);
  }
}

/**
 * Get aggregated ratings for a user
 */
export async function getAggregatedUserRatings(
  targetUserId: string
): Promise<UserRatingSummary> {
  // Check if we have a cached summary
  const summaryRef = db.collection('userRatingSummaries').doc(targetUserId);
  const summarySnap = await summaryRef.get();

  if (summarySnap.exists) {
    const data = summarySnap.data();
    // If summary is recent (< 1 hour), return cached
    if (data && Date.now() - data.lastUpdated < 3600000) {
      return data as UserRatingSummary;
    }
  }

  // Otherwise, recalculate
  return await updateUserRatingSummary(targetUserId);
}

/**
 * Update user rating summary (materialized view)
 */
async function updateUserRatingSummary(targetUserId: string): Promise<UserRatingSummary> {
  const ratingsSnap = await db
    .collection('userInteractionRatings')
    .where('targetUserId', '==', targetUserId)
    .get();

  const now = Date.now();
  const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000);

  let totalRating = 0;
  let totalCount = 0;
  let totalRating90d = 0;
  let totalCount90d = 0;

  const distribution: { [key: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const byType: { [key: string]: { sum: number; count: number } } = {};

  ratingsSnap.forEach((doc) => {
    const rating = doc.data() as UserInteractionRating;
    
    totalRating += rating.rating;
    totalCount++;
    distribution[rating.rating]++;

    if (rating.createdAt >= ninetyDaysAgo) {
      totalRating90d += rating.rating;
      totalCount90d++;
    }

    // By type
    if (!byType[rating.interactionType]) {
      byType[rating.interactionType] = { sum: 0, count: 0 };
    }
    byType[rating.interactionType].sum += rating.rating;
    byType[rating.interactionType].count++;
  });

  const summary: UserRatingSummary = {
    userId: targetUserId,
    avgRating: totalCount > 0 ? totalRating / totalCount : 0,
    totalRatings: totalCount,
    avgRating90d: totalCount90d > 0 ? totalRating90d / totalCount90d : 0,
    totalRatings90d: totalCount90d,
    distribution: distribution as any,
    byType: Object.entries(byType).reduce((acc, [type, data]) => {
      acc[type as InteractionType] = {
        avgRating: data.count > 0 ? data.sum / data.count : 0,
        count: data.count,
      };
      return acc;
    }, {} as any),
    lastUpdated: now,
  };

  // Save summary
  await db.collection('userRatingSummaries').doc(targetUserId).set(summary);

  return summary;
}

/**
 * Get aggregated ratings for AI companion
 */
export async function getAggregatedCompanionRatings(
  companionId: string
): Promise<CompanionRatingSummary> {
  // Check if we have a cached summary
  const summaryRef = db.collection('companionRatingSummaries').doc(companionId);
  const summarySnap = await summaryRef.get();

  if (summarySnap.exists) {
    const data = summarySnap.data();
    // If summary is recent (< 1 hour), return cached
    if (data && Date.now() - data.lastUpdated < 3600000) {
      return data as CompanionRatingSummary;
    }
  }

  // Otherwise, recalculate
  return await updateCompanionRatingSummary(companionId);
}

/**
 * Update companion rating summary
 */
async function updateCompanionRatingSummary(
  companionId: string
): Promise<CompanionRatingSummary> {
  const ratingsSnap = await db
    .collection('userInteractionRatings')
    .where('targetCompanionId', '==', companionId)
    .get();

  const now = Date.now();
  const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000);

  let totalRating = 0;
  let totalCount = 0;
  let totalRating90d = 0;
  let totalCount90d = 0;

  const distribution: { [key: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  ratingsSnap.forEach((doc) => {
    const rating = doc.data() as UserInteractionRating;
    
    totalRating += rating.rating;
    totalCount++;
    distribution[rating.rating]++;

    if (rating.createdAt >= ninetyDaysAgo) {
      totalRating90d += rating.rating;
      totalCount90d++;
    }
  });

  const summary: CompanionRatingSummary = {
    companionId,
    avgRating: totalCount > 0 ? totalRating / totalCount : 0,
    totalRatings: totalCount,
    avgRating90d: totalCount90d > 0 ? totalRating90d / totalCount90d : 0,
    totalRatings90d: totalCount90d,
    distribution: distribution as any,
    lastUpdated: now,
  };

  // Save summary
  await db.collection('companionRatingSummaries').doc(companionId).set(summary);

  return summary;
}

/**
 * Flag a rating as reported/abusive
 */
export async function flagRatingAsAbuse(ratingId: string): Promise<void> {
  await db.collection('userInteractionRatings').doc(ratingId).update({
    isReported: true,
    updatedAt: Date.now(),
  });
}

/**
 * Get user's own ratings
 */
export async function getMyInteractionRatings(
  userId: string,
  limit = 50
): Promise<UserInteractionRating[]> {
  const ratingsSnap = await db
    .collection('userInteractionRatings')
    .where('raterUserId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return ratingsSnap.docs.map(doc => doc.data() as UserInteractionRating);
}
