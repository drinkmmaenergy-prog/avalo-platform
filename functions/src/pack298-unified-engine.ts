/**
 * PACK 298A — Unified Swipe, Discovery & Feed Engine
 * Server-side ranking, pool generation, and safety filtering
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// === TYPES ===

interface RankingFactors {
  engagementScore: number;
  similarityScore: number;
  distanceScore: number;
  safetyScore: number;
  royalBonus: number;
  lowPopularityBonus: number;
  recencyScore: number;
}

interface SwipePoolConfig {
  maxPoolSize: number;
  royalExposureMultiplier: number;
  lowPopularityMultiplier: number;
}

// === CONSTANTS ===

const SWIPE_POOL_CONFIG: SwipePoolConfig = {
  maxPoolSize: 60,
  royalExposureMultiplier: 1.25, // +25%
  lowPopularityMultiplier: 3.0,  // +200%
};

const RANKING_WEIGHTS = {
  engagement: 0.3,
  similarity: 0.25,
  location: 0.15,
  safety: 0.1,
  royal: 0.1,
  lowPopularity: 0.1,
};

// === FEED RANKING FUNCTION ===

/**
 * Cloud Function: Calculate and update feed rankings for a user
 */
export const calculateFeedRankings = functions
  .region('europe-west3')
  .https.onCall(async (data, context) => {
    // Authenticate
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;
    const { location, isRoyal } = data;

    try {
      // Fetch active feed items
      const itemsSnapshot = await db
        .collection('feed_items')
        .where('status', '==', 'active')
        .where('safetyLevel', 'in', ['S1', 'S2'])
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

      const rankings: Array<{ itemId: string; score: number; factors: RankingFactors }> = [];

      // Calculate ranking for each item
      for (const doc of itemsSnapshot.docs) {
        const item = doc.data();
        const factors = await calculateRankingFactors(
          userId,
          item,
          location,
          isRoyal
        );

        const score =
          factors.engagementScore * RANKING_WEIGHTS.engagement +
          factors.similarityScore * RANKING_WEIGHTS.similarity +
          factors.distanceScore * RANKING_WEIGHTS.location +
          factors.safetyScore * RANKING_WEIGHTS.safety +
          factors.royalBonus * RANKING_WEIGHTS.royal +
          factors.lowPopularityBonus * RANKING_WEIGHTS.lowPopularity;

        rankings.push({
          itemId: doc.id,
          score,
          factors,
        });

        // Store ranking
        await db
          .collection('feed_rankings')
          .doc(userId)
          .collection('items')
          .doc(doc.id)
          .set({
            userId,
            itemId: doc.id,
            rankScore: score,
            factors,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
      }

      // Sort by score
      rankings.sort((a, b) => b.score - a.score);

      return {
        success: true,
        rankings: rankings.slice(0, 20), // Top 20
      };
    } catch (error) {
      console.error('Feed ranking error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to calculate rankings');
    }
  });

/**
 * Calculate ranking factors for a feed item
 */
async function calculateRankingFactors(
  userId: string,
  item: any,
  userLocation?: { lat: number; lng: number },
  isRoyal: boolean = false
): Promise<RankingFactors> {
  // Engagement score
  const engagementScore = Math.min(100, item.engagementScore || 0);

  // Similarity score (simplified - check if user engaged with author before)
  const similarityScore = await calculateSimilarityScore(userId, item.authorId);

  // Distance score
  const distanceScore = calculateDistanceScore(userLocation, item.location);

  // Safety score
  const safetyScore = calculateSafetyScore(item.safetyLevel);

  // Royal bonus
  const authorDoc = await db.collection('users').doc(item.authorId).get();
  const authorIsRoyal = authorDoc.data()?.isRoyal || false;
  const royalBonus = authorIsRoyal ? 10 : 0;

  // Low-popularity bonus
  const statusDoc = await db.collection('popularity_status').doc(item.authorId).get();
  const isLowPopularity = statusDoc.data()?.isLowPopularity || false;
  const lowPopularityBonus = isLowPopularity ? 20 : 0;

  // Recency score
  const recencyScore = calculateRecencyScore(item.createdAt);

  return {
    engagementScore,
    similarityScore,
    distanceScore,
    safetyScore,
    royalBonus,
    lowPopularityBonus,
    recencyScore,
  };
}

/**
 * Calculate similarity score based on past interactions
 */
async function calculateSimilarityScore(
  userId: string,
  authorId: string
): Promise<number> {
  // Check if user has engaged with this author before
  const engagementSnapshot = await db
    .collection('feed_engagement')
    .doc(userId)
    .collection('engaged')
    .where('targetUserId', '==', authorId)
    .limit(1)
    .get();

  return engagementSnapshot.empty ? 50 : 80;
}

/**
 * Calculate distance score
 */
function calculateDistanceScore(
  userLocation?: { lat: number; lng: number },
  itemLocation?: { lat: number; lng: number }
): number {
  if (!userLocation || !itemLocation) {
    return 50; // Neutral
  }

  const distance = calculateDistance(
    userLocation.lat,
    userLocation.lng,
    itemLocation.lat,
    itemLocation.lng
  );

  const maxDistance = 100000; // 100km
  return Math.max(0, 100 - (distance / maxDistance) * 100);
}

/**
 * Calculate safety score based on content safety level
 */
function calculateSafetyScore(safetyLevel: string): number {
  const scores: Record<string, number> = {
    S1: 100,
    S2: 80,
    S3: 0, // Blocked
  };
  return scores[safetyLevel] || 0;
}

/**
 * Calculate recency score
 */
function calculateRecencyScore(createdAt: any): number {
  const now = Date.now();
  const created = createdAt?.toMillis() || now;
  const ageHours = (now - created) / (1000 * 60 * 60);

  if (ageHours > 24) {
    return Math.max(0, 50 - ageHours);
  }

  return Math.max(0, 100 - (ageHours / 24) * 50);
}

/**
 * Calculate distance between coordinates (Haversine)
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// === SWIPE POOL GENERATION ===

/**
 * Cloud Function: Generate swipe pool for a user
 */
export const generateSwipePool = functions
  .region('europe-west3')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const userId = context.auth.uid;
    const { preferences, location, isRoyal } = data;

    try {
      // Get user's swipe history to exclude already-swiped users
      const historySnapshot = await db
        .collectionGroup('swipes')
        .where('userId', '==', userId)
        .get();

      const swipedUserIds = new Set(
        historySnapshot.docs.map(doc => doc.data().targetUserId)
      );

      // Fetch candidate profiles
      let query = db.collection('discovery_profiles')
        .where('userId', '!=', userId)
        .where('isActive', '==', true);

      if (preferences?.gender) {
        query = query.where('gender', '==', preferences.gender);
      }

      const candidatesSnapshot = await query.limit(100).get();

      const pool: Array<{
        userId: string;
        score: number;
        isRoyalBoosted: boolean;
        isLowPopularityBoosted: boolean;
      }> = [];

      for (const doc of candidatesSnapshot.docs) {
        const candidate = doc.data();

        // Skip if already swiped
        if (swipedUserIds.has(candidate.userId)) {
          continue;
        }

        // Calculate base score
        let score = candidate.discoveryScore || 50;

        // Check if candidate is Royal
        const candidateDoc = await db.collection('users').doc(candidate.userId).get();
        const candidateIsRoyal = candidateDoc.data()?.isRoyal || false;

        // Apply Royal exposure boost (+25%)
        let isRoyalBoosted = false;
        if (candidateIsRoyal) {
          score *= SWIPE_POOL_CONFIG.royalExposureMultiplier;
          isRoyalBoosted = true;
        }

        // Check low-popularity status
        const popStatusDoc = await db
          .collection('popularity_status')
          .doc(candidate.userId)
          .get();
        const isLowPopularity = popStatusDoc.data()?.isLowPopularity || false;

        // Apply low-popularity boost (+200%)
        let isLowPopularityBoosted = false;
        if (isLowPopularity) {
          score *= SWIPE_POOL_CONFIG.lowPopularityMultiplier;
          isLowPopularityBoosted = true;
        }

        pool.push({
          userId: candidate.userId,
          score,
          isRoyalBoosted,
          isLowPopularityBoosted,
        });
      }

      // Sort by score and limit to max pool size
      pool.sort((a, b) => b.score - a.score);
      const finalPool = pool.slice(0, SWIPE_POOL_CONFIG.maxPoolSize);

      // Store pool in Firestore
      const batch = db.batch();
      for (const candidate of finalPool) {
        const poolRef = db
          .collection('swipe_pool')
          .doc(userId)
          .collection('candidates')
          .doc(candidate.userId);

        batch.set(poolRef, {
          ...candidate,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();

      return {
        success: true,
        poolSize: finalPool.length,
        candidates: finalPool,
      };
    } catch (error) {
      console.error('Swipe pool generation error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to generate swipe pool');
    }
  });

// === LOW-POPULARITY DETECTION (SCHEDULED) ===

/**
 * Scheduled Function: Check and update low-popularity status for all users
 * Runs every 6 hours
 */
export const updateLowPopularityStatus = functions
  .region('europe-west3')
  .pubsub.schedule('every 6 hours')
  .onRun(async (context) => {
    console.log('Starting low-popularity status update...');

    try {
      const usersSnapshot = await db
        .collection('users')
        .where('isActive', '==', true)
        .get();

      const batch = db.batch();
      let updateCount = 0;

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;

        // Calculate metrics
        const metrics = await calculatePopularityMetrics(userId);

        // Check criteria
        const matchesMet = metrics.matches24h < 3;
        const likesMet = metrics.likes48h < 8;
        const swipeLeftMet = metrics.leftSwipePercent > 60;
        const completenessMet = metrics.profileCompleteness > 60;

        const isLowPopularity = matchesMet && likesMet && swipeLeftMet && completenessMet;

        // Store status
        const statusRef = db.collection('popularity_status').doc(userId);
        batch.set(statusRef, {
          userId,
          isLowPopularity,
          triggeredAt: isLowPopularity ? admin.firestore.FieldValue.serverTimestamp() : null,
          boosts: isLowPopularity
            ? {
                discoveryExposure: 200,
                swipePriority: 20,
                freeChatsPerDay: 10,
              }
            : {
                discoveryExposure: 0,
                swipePriority: 0,
                freeChatsPerDay: 0,
              },
          criteria: {
            matchesMet,
            likesMet,
            swipeLeftMet,
            completenessMet,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Store metrics
        const metricsRef = db.collection('popularity_metrics').doc(userId);
        batch.set(metricsRef, {
          ...metrics,
          lastCalculated: admin.firestore.FieldValue.serverTimestamp(),
        });

        updateCount++;

        // Commit batch every 500 operations
        if (updateCount % 500 === 0) {
          await batch.commit();
          console.log(`Processed ${updateCount} users...`);
        }
      }

      // Commit remaining
      await batch.commit();

      console.log(`Low-popularity status update complete. Updated ${updateCount} users.`);
      return { success: true, usersProcessed: updateCount };
    } catch (error) {
      console.error('Low-popularity update error:', error);
      throw error;
    }
  });

/**
 * Calculate popularity metrics for a user
 */
async function calculatePopularityMetrics(userId: string) {
  const now = Date.now();
  const last24h = new Date(now - 24 * 60 * 60 * 1000);
  const last48h = new Date(now - 48 * 60 * 60 * 1000);

  // Get matches in last 24h
  const matchesSnapshot = await db
    .collection('matches')
    .where('participants', 'array-contains', userId)
    .where('createdAt', '>=', last24h)
    .get();
  const matches24h = matchesSnapshot.size;

  // Get likes in last 48h
  const likesSnapshot = await db
    .collectionGroup('swipes')
    .where('targetUserId', '==', userId)
    .where('direction', '==', 'right')
    .where('createdAt', '>=', last48h)
    .get();
  const likes48h = likesSnapshot.size;

  // Get left swipes
  const leftSwipesSnapshot = await db
    .collectionGroup('swipes')
    .where('targetUserId', '==', userId)
    .where('direction', '==', 'left')
    .where('createdAt', '>=', last48h)
    .get();
  const leftSwipes = leftSwipesSnapshot.size;

  const totalSwipes = leftSwipes + likes48h;
  const leftSwipePercent = totalSwipes > 0 ? (leftSwipes / totalSwipes) * 100 : 0;

  // Get profile completeness
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  const profileCompleteness = calculateProfileCompleteness(userData);

  return {
    userId,
    matches24h,
    likes48h,
    leftSwipePercent,
    profileCompleteness,
  };
}

/**
 * Calculate profile completeness (0-100)
 */
function calculateProfileCompleteness(userData: any): number {
  if (!userData) return 0;

  let score = 0;
  const weights = {
    photos: 30,
    bio: 20,
    interests: 15,
    verified: 15,
    location: 10,
    age: 10,
  };

  const photoCount = userData.photos?.length || 0;
  if (photoCount >= 3) {
    score += weights.photos;
  } else if (photoCount > 0) {
    score += (photoCount / 3) * weights.photos;
  }

  if (userData.bio && userData.bio.length > 20) {
    score += weights.bio;
  }

  if (userData.interests && userData.interests.length >= 3) {
    score += weights.interests;
  }

  if (userData.emailVerified || userData.phoneVerified) {
    score += weights.verified;
  }

  if (userData.location) {
    score += weights.location;
  }

  if (userData.age && userData.age >= 18) {
    score += weights.age;
  }

  return Math.min(100, score);
}

// === SAFETY FILTERING ===

/**
 * Cloud Function: Validate content safety
 */
export const validateContentSafety = functions
  .region('europe-west3')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const { contentId, contentType } = data;

    try {
      // Get content
      const contentDoc = await db.collection('content_safety').doc(contentId).get();
      
      if (!contentDoc.exists) {
        return { approved: true, safetyLevel: 'S1' };
      }

      const content = contentDoc.data();
      const flags = content?.flags || {};

      // Block explicit content (S3)
      if (flags.explicit) {
        return {
          approved: false,
          safetyLevel: 'S3',
          reason: 'Explicit content blocked',
        };
      }

      // Block minors, violence, hate
      if (flags.minor || flags.violence || flags.hate) {
        return {
          approved: false,
          safetyLevel: 'S3',
          reason: 'Safety violation',
        };
      }

      // Allow bikini/lingerie (S1-S2)
      if (flags.bikini || flags.lingerie) {
        return {
          approved: true,
          safetyLevel: flags.lingerie ? 'S2' : 'S1',
        };
      }

      return {
        approved: true,
        safetyLevel: 'S1',
      };
    } catch (error) {
      console.error('Safety validation error:', error);
      throw new functions.https.HttpsError('internal', 'Safety validation failed');
    }
  });