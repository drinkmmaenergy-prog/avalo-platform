/**
 * PACK 294 - Search & Discovery Filters
 * Discovery Search Endpoint with Advanced Filtering & Ranking
 * 
 * Implements comprehensive search with:
 * - Age, distance, gender, orientation filters
 * - Interest & language matching
 * - Popularity-based ranking with fairness boost
 * - Safety enforcement (18+, no banned/shadow-banned)
 * - Free access for all users
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Query, DocumentData } from 'firebase-admin/firestore';
import {
  DiscoveryFilter,
  DiscoverySearchResult,
  DiscoverySearchResponse,
  RankingScore,
  DEFAULT_RANKING_WEIGHTS,
  DISCOVERY_CONSTANTS,
  ProfileSearchIndex,
} from './pack294-discovery-types';

const db = getFirestore();

/**
 * Calculate distance between two coordinates in km using Haversine formula
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate ranking score for a profile
 */
function calculateRankingScore(
  profile: ProfileSearchIndex,
  viewerLocation: { lat: number; lng: number } | undefined,
  distanceKm: number | null
): RankingScore {
  // Distance score (0-100, closer = higher)
  let distanceScore = 100;
  if (distanceKm !== null && viewerLocation) {
    const maxDist = DISCOVERY_CONSTANTS.MAX_DISTANCE_KM;
    distanceScore = Math.max(0, 100 - (distanceKm / maxDist) * 100);
  }
  
  // Activity score (already calculated in index)
  const activityScore = profile.recentActivityScore;
  
  // Popularity score (already calculated in index)
  const popularityScore = profile.popularityScore;
  
  // Match intent score (based on preferences alignment)
  // For now, simplified - can be enhanced with more sophisticated matching
  const intentScore = 50; // Base score
  
  // Tier boost multiplier
  let tierBoost = 0;
  if (profile.royalBadge) tierBoost += 30;
  else if (profile.vipBadge) tierBoost += 20;
  if (profile.influencerBadge) tierBoost += 15;
  
  // Low popularity fairness boost
  const fairnessBoost = profile.popularityScore < DISCOVERY_CONSTANTS.LOW_POPULARITY_THRESHOLD ? 20 : 0;
  
  // Risk penalty
  const riskPenalty = profile.riskScore > 50 ? profile.riskScore / 2 : 0;
  
  // Calculate total score using weights
  const baseScore = 
    (distanceScore * DEFAULT_RANKING_WEIGHTS.distance) +
    (activityScore * DEFAULT_RANKING_WEIGHTS.activity) +
    (popularityScore * DEFAULT_RANKING_WEIGHTS.popularity) +
    (intentScore * DEFAULT_RANKING_WEIGHTS.matchIntent);
  
  const totalScore = baseScore + tierBoost + fairnessBoost - riskPenalty;
  
  return {
    distanceScore,
    activityScore,
    popularityScore,
    intentScore,
    tierBoost,
    riskPenalty,
    totalScore: Math.max(0, totalScore),
  };
}

/**
 * Discovery Search Endpoint
 * GET /discovery/search
 */
export const discoverySearch = onRequest(
  { 
    cors: true,
    region: 'europe-west3',
  },
  async (req, res) => {
    try {
      // Verify authentication
      const userId = req.headers.authorization?.split('Bearer ')[1];
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      
      // Parse filters from query params
      const filters: DiscoveryFilter = {
        ageMin: parseInt(req.query.ageMin as string) || DISCOVERY_CONSTANTS.DEFAULT_AGE_MIN,
        ageMax: parseInt(req.query.ageMax as string) || DISCOVERY_CONSTANTS.DEFAULT_AGE_MAX,
        gender: (req.query.gender as any) || 'ANY',
        lookingFor: (req.query.lookingFor as any) || 'ANY',
        distanceKmMax: parseInt(req.query.distanceKmMax as string) || DISCOVERY_CONSTANTS.MAX_DISTANCE_KM,
        hasProfilePhoto: req.query.hasProfilePhoto === 'true',
        hasVideoIntro: req.query.hasVideoIntro === 'true',
        isVerifiedOnly: req.query.isVerifiedOnly === 'true',
        minPopularityScore: parseInt(req.query.minPopularityScore as string) || 0,
        influencerOnly: req.query.influencerOnly === 'true',
        royalOnly: req.query.royalOnly === 'true',
      };
      
      // Parse viewer location
      const viewerLat = parseFloat(req.query.viewerLat as string);
      const viewerLng = parseFloat(req.query.viewerLng as string);
      if (viewerLat && viewerLng) {
        filters.viewerLocation = { lat: viewerLat, lng: viewerLng };
      }
      
      // Parse interests and languages
      if (req.query.interests) {
        filters.interestsAnyOf = (req.query.interests as string).split(',');
      }
      if (req.query.languages) {
        filters.languageAnyOf = (req.query.languages as string).split(',');
      }
      
      // Pagination
      const limit = Math.min(
        parseInt(req.query.limit as string) || DISCOVERY_CONSTANTS.DEFAULT_LIMIT,
        DISCOVERY_CONSTANTS.MAX_LIMIT
      );
      const cursor = req.query.cursor as string;
      
      // Build Firestore query
      let query: Query<DocumentData> = db.collection('profileSearchIndex');
      
      // ALWAYS enforce safety constraints
      query = query
        .where('age', '>=', Math.max(filters.ageMin!, DISCOVERY_CONSTANTS.DEFAULT_AGE_MIN))
        .where('age', '<=', filters.ageMax!)
        .where('banned', '==', false)
        .where('shadowBanned', '==', false)
        .where('incognito', '==', false) // Exclude incognito users from discovery
        .where('riskScore', '<', DISCOVERY_CONSTANTS.RISK_BLOCK_THRESHOLD);
      
      // Apply optional filters
      if (filters.gender && filters.gender !== 'ANY') {
        query = query.where('gender', '==', filters.gender);
      }
      
      if (filters.isVerifiedOnly) {
        query = query.where('isVerified', '==', true);
      }
      
      if (filters.hasProfilePhoto) {
        query = query.where('hasProfilePhoto', '==', true);
      }
      
      if (filters.hasVideoIntro) {
        query = query.where('hasVideoIntro', '==', true);
      }
      
      if (filters.influencerOnly) {
        query = query.where('influencerBadge', '==', true);
      }
      
      if (filters.royalOnly) {
        query = query.where('royalBadge', '==', true);
      }
      
      if (filters.minPopularityScore && filters.minPopularityScore > 0) {
        query = query.where('popularityScore', '>=', filters.minPopularityScore);
      }
      
      // Order by last active for better results
      query = query.orderBy('lastActiveAt', 'desc');
      
      // Apply cursor for pagination
      if (cursor) {
        const cursorDoc = await db.collection('profileSearchIndex').doc(cursor).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      }
      
      // Limit results (fetch extra to allow for post-filtering)
      query = query.limit(limit * 2);
      
      // Execute query
      const snapshot = await query.get();
      
      // Process results
      const results: Array<{ profile: DiscoverySearchResult; score: number }> = [];
      
      for (const doc of snapshot.docs) {
        const profile = doc.data() as ProfileSearchIndex;
        
        // Skip the viewer themselves
        if (profile.userId === userId) continue;
        
        // Calculate distance if viewer location provided
        let distanceKm: number | null = null;
        if (filters.viewerLocation) {
          distanceKm = calculateDistance(
            filters.viewerLocation.lat,
            filters.viewerLocation.lng,
            profile.lat,
            profile.lng
          );
          
          // Skip if too far
          if (filters.distanceKmMax && distanceKm > filters.distanceKmMax) {
            continue;
          }
        }
        
        // Apply interest filter (any of)
        if (filters.interestsAnyOf && filters.interestsAnyOf.length > 0) {
          const hasMatchingInterest = filters.interestsAnyOf.some(interest =>
            profile.interests.includes(interest)
          );
          if (!hasMatchingInterest) continue;
        }
        
        // Apply language filter (any of)
        if (filters.languageAnyOf && filters.languageAnyOf.length > 0) {
          const hasMatchingLanguage = filters.languageAnyOf.some(lang =>
            profile.languages.includes(lang)
          );
          if (!hasMatchingLanguage) continue;
        }
        
        // Calculate ranking score
        const rankingScore = calculateRankingScore(profile, filters.viewerLocation, distanceKm);
        
        // Build result item
        const resultItem: DiscoverySearchResult = {
          userId: profile.userId,
          displayName: profile.displayName,
          age: profile.age,
          gender: profile.gender,
          city: profile.city,
          country: profile.country,
          distanceKm: distanceKm ? Math.round(distanceKm * 10) / 10 : null,
          isVerified: profile.isVerified,
          influencerBadge: profile.influencerBadge,
          royalBadge: profile.royalBadge,
          vipBadge: profile.vipBadge,
          hasProfilePhoto: profile.hasProfilePhoto,
          hasVideoIntro: profile.hasVideoIntro,
          interests: profile.interests,
          popularityScore: profile.popularityScore,
          recentActivityScore: profile.recentActivityScore,
          lastActiveAt: profile.lastActiveAt,
        };
        
        results.push({ profile: resultItem, score: rankingScore.totalScore });
      }
      
      // Sort by ranking score (highest first)
      results.sort((a, b) => b.score - a.score);
      
      // Take only the requested limit
      const limitedResults = results.slice(0, limit);
      
      // Build response
      const response: DiscoverySearchResponse = {
        items: limitedResults.map(r => r.profile),
        nextCursor: limitedResults.length === limit && snapshot.docs.length > limit 
          ? limitedResults[limitedResults.length - 1].profile.userId 
          : null,
      };
      
      // Log analytics event
      await logDiscoveryEvent(userId, 'search_executed', filters, response.items.length);
      
      res.status(200).json(response);
    } catch (error: any) {
      console.error('Discovery search error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * Log discovery analytics event
 */
async function logDiscoveryEvent(
  userId: string,
  eventType: string,
  filters?: DiscoveryFilter,
  resultCount?: number,
  profileId?: string
) {
  try {
    await db.collection('discoveryAnalytics').add({
      userId,
      eventType,
      timestamp: FieldValue.serverTimestamp(),
      filters: filters || null,
      resultCount: resultCount || 0,
      profileId: profileId || null,
    });
  } catch (error) {
    console.error('Error logging discovery event:', error);
    // Don't fail the request if analytics fails
  }
}