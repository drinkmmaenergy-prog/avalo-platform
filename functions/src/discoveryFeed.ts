/**
 * PACK 51 — Dynamic Discovery Feed
 * Personalized, Royal-Aware, Token-Driven Contact Funnel
 * 
 * This feed is NOT a swipe deck and NOT a match feed.
 * It's a scrollable discovery feed optimized for monetization.
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp } from './init';
import { getUserRiskProfile } from './trustEngine';
import { getRoyalState, RoyalTier } from './royalEngine';

// ============================================================================
// TYPES
// ============================================================================

interface DiscoveryFeedItem {
  userId: string;
  name: string;
  age: number;
  distanceKm: number | null;
  avatarUrl: string | null;
  mediaPreviewUrls: string[];
  royalTier: RoyalTier | null;
  isHighRisk: boolean;
}

interface DiscoveryFeedRequest {
  userId: string;
  cursor?: string;
  limit?: number;
}

interface DiscoveryFeedResponse {
  items: DiscoveryFeedItem[];
  nextCursor: string | null;
}

interface UserTasteProfile {
  likedInterests: string[];
  preferredAgeMin: number | null;
  preferredAgeMax: number | null;
  preferredDistanceKm: number | null;
  preferredGenders: string[];
}

// ============================================================================
// DISCOVERY FEED ENDPOINT
// ============================================================================

/**
 * GET /discovery/feed
 * Returns personalized discovery feed with Royal priority and Trust filtering
 */
export const getDiscoveryFeed = functions
  .region('europe-west3')
  .https.onCall(async (data: DiscoveryFeedRequest, context) => {
    try {
      // Verify authentication
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const callerId = context.auth.uid;
      const { userId, cursor, limit = 20 } = data;

      // Verify the caller is requesting their own feed
      if (callerId !== userId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Cannot access other users\' feeds'
        );
      }

      // Get user's taste profile for personalization
      const tasteProfile = await getUserTasteProfile(userId);

      // Get user's blocklist
      const blocklist = await getUserBlocklist(userId);

      // Get user's Royal status to determine feed ordering
      const userRoyalState = await getRoyalState(userId);
      const isRoyalUser = userRoyalState?.tier !== 'NONE';

      // Build candidate query with filters
      let query = db
        .collection('users')
        .where('profileComplete', '==', true)
        .where('visibility.discover', '==', true);

      // Apply taste profile filters
      if (tasteProfile.preferredGenders && tasteProfile.preferredGenders.length > 0) {
        // Firestore limitation: 'in' query limited to 10 items
        const gendersToQuery = tasteProfile.preferredGenders.slice(0, 10);
        query = query.where('profile.gender', 'in', gendersToQuery);
      }

      // Start after cursor if provided
      if (cursor) {
        const cursorDoc = await db.collection('users').doc(cursor).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      }

      // Limit results
      query = query.limit(limit + 1); // +1 to check if more exist

      // Execute query
      const snapshot = await query.get();

      // Process candidates
      const candidates: DiscoveryFeedItem[] = [];
      const processedIds = new Set<string>();

      for (const doc of snapshot.docs) {
        const candidateId = doc.id;

        // Skip self
        if (candidateId === userId) continue;

        // Skip blocked users
        if (blocklist.has(candidateId)) continue;

        // Skip already processed
        if (processedIds.has(candidateId)) continue;

        const candidateData = doc.data();

        // Get Trust Engine risk profile
        const riskProfile = await getUserRiskProfile(candidateId);
        const isHighRisk = riskProfile ? riskProfile.riskLevel === 'HIGH' || riskProfile.riskLevel === 'CRITICAL' : false;

        // Get Royal status
        const candidateRoyalState = await getRoyalState(candidateId);
        const candidateRoyalTier = candidateRoyalState?.tier || 'NONE';

        // Calculate personalization score
        const personalizationScore = calculatePersonalizationScore(
          tasteProfile,
          candidateData,
          candidateRoyalTier,
          isRoyalUser
        );

        // Build feed item
        const feedItem: DiscoveryFeedItem = {
          userId: candidateId,
          name: candidateData.profile?.name || 'Unknown',
          age: candidateData.profile?.age || 18,
          distanceKm: candidateData.location?.distanceKm || null,
          avatarUrl: candidateData.profile?.photos?.[0] || null,
          mediaPreviewUrls: (candidateData.profile?.photos || []).slice(0, 3),
          royalTier: candidateRoyalTier === 'NONE' ? null : candidateRoyalTier,
          isHighRisk,
        };

        candidates.push({
          ...feedItem,
          personalizationScore, // Temporary for sorting
        } as any);

        processedIds.add(candidateId);

        // Stop if we have enough
        if (candidates.length >= limit) break;
      }

      // Sort by personalization score (higher first)
      candidates.sort((a: any, b: any) => b.personalizationScore - a.personalizationScore);

      // Remove personalization score from final output
      const items = candidates.map(({ personalizationScore, ...item }: any) => item as DiscoveryFeedItem);

      // Determine next cursor
      const hasMore = snapshot.docs.length > limit;
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].userId : null;

      const response: DiscoveryFeedResponse = {
        items,
        nextCursor,
      };

      console.log(`[DiscoveryFeed] Served ${items.length} items to user ${userId}`);

      return { ok: true, ...response };
    } catch (error: any) {
      console.error('[getDiscoveryFeed] Error:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError('internal', error.message || 'Failed to get discovery feed');
    }
  });

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get user's taste profile from personalization data
 */
async function getUserTasteProfile(userId: string): Promise<UserTasteProfile> {
  const profileDoc = await db.collection('user_taste_profiles').doc(userId).get();

  if (!profileDoc.exists) {
    // Return default profile
    return {
      likedInterests: [],
      preferredAgeMin: null,
      preferredAgeMax: null,
      preferredDistanceKm: null,
      preferredGenders: [],
    };
  }

  const profile = profileDoc.data();
  return {
    likedInterests: profile?.likedInterests || [],
    preferredAgeMin: profile?.preferredAgeMin || null,
    preferredAgeMax: profile?.preferredAgeMax || null,
    preferredDistanceKm: profile?.preferredDistanceKm || null,
    preferredGenders: profile?.preferredGenders || [],
  };
}

/**
 * Get user's blocklist
 */
async function getUserBlocklist(userId: string): Promise<Set<string>> {
  const blocklistDoc = await db.collection('blocklists').doc(userId).get();

  if (!blocklistDoc.exists) {
    return new Set();
  }

  const blocklist = blocklistDoc.data();
  const blockedUserIds = blocklist?.blockedUserIds || [];
  
  // Also get users who blocked this user
  const blockedBySnapshot = await db
    .collection('blocklists')
    .where('blockedUserIds', 'array-contains', userId)
    .get();

  const blockedByIds = blockedBySnapshot.docs.map(doc => doc.id);

  return new Set([...blockedUserIds, ...blockedByIds]);
}

/**
 * Calculate personalization score for feed ranking
 */
function calculatePersonalizationScore(
  tasteProfile: UserTasteProfile,
  candidateData: any,
  candidateRoyalTier: RoyalTier,
  isRoyalUser: boolean
): number {
  let score = 50; // Base score

  // Royal boost: Royal users see other Royal users first
  if (isRoyalUser && candidateRoyalTier !== 'NONE') {
    score += 30;
  }

  // Interest matching
  const candidateInterests = candidateData.profile?.interests || [];
  const commonInterests = tasteProfile.likedInterests.filter(
    (interest: string) => candidateInterests.includes(interest)
  );
  score += commonInterests.length * 5;

  // Age preference
  const candidateAge = candidateData.profile?.age || 0;
  if (tasteProfile.preferredAgeMin && candidateAge < tasteProfile.preferredAgeMin) {
    score -= 10;
  }
  if (tasteProfile.preferredAgeMax && candidateAge > tasteProfile.preferredAgeMax) {
    score -= 10;
  }

  // Distance preference
  const candidateDistance = candidateData.location?.distanceKm || 9999;
  if (tasteProfile.preferredDistanceKm) {
    if (candidateDistance <= tasteProfile.preferredDistanceKm) {
      score += 15;
    } else {
      score -= Math.min((candidateDistance - tasteProfile.preferredDistanceKm) / 10, 20);
    }
  }

  // Gender preference
  const candidateGender = candidateData.profile?.gender;
  if (tasteProfile.preferredGenders.length > 0 && candidateGender) {
    if (tasteProfile.preferredGenders.includes(candidateGender)) {
      score += 10;
    }
  }

  // Previous interactions boost (if they've interacted before)
  const interactionCount = candidateData.stats?.totalInteractions || 0;
  if (interactionCount > 0) {
    score += Math.min(interactionCount * 2, 10);
  }

  return Math.max(0, Math.min(100, score));
}

console.log('✅ Discovery Feed (PACK 51) initialized');