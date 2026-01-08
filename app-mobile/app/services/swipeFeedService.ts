/**
 * PACK 272 — Swipe Feed Generation Service
 * 
 * Handles:
 * - Profile filtering (gender, age, distance, quality)
 * - Ranking algorithm (Royal, popularity, proximity, chemistry)
 * - Anti-abuse filters (shadow-hide, NSFW, quality checks)
 * - Incognito mode filtering
 * - Passport location override
 * - Performance optimizations (preload, cache, pagination)
 */

import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  startAfter,
  DocumentSnapshot,
  Timestamp,
  getDoc,
  doc,
} from 'firebase/firestore';
import { swipeService } from './swipeService';

// ============================================================================
// TYPES
// ============================================================================

export interface UserPreferences {
  genderPreference: 'male' | 'female' | 'any';
  minAge: number;
  maxAge: number;
  maxDistance: number; // in kilometers
  nsfwAllowed: boolean;
}

export interface UserLocation {
  lat: number;
  lng: number;
  city?: string;
  country?: string;
  isPassport?: boolean;
}

export interface SwipeCard {
  userId: string;
  displayName: string;
  age: number;
  gender: string;
  bio?: string;
  photos: string[];
  mainPhoto: string;
  distance: number;
  lastActiveAt: Date;
  isOnline: boolean;
  
  // Badges
  badges: {
    verified?: boolean;
    royal?: boolean;
    influencer?: 'rising' | 'influencer' | 'top_influencer';
    hasAIAvatar?: boolean;
  };
  
  // Profile quality
  activityScore: number;
  profileQuality: number;
  popularityScore: number;
  
  // Tags
  tags: string[];
  interests: string[];
  
  // Chemistry (placeholder for AI model)
  chemistryScore?: number;
}

export interface FeedGenerationOptions {
  userId: string;
  preferences: UserPreferences;
  userLocation: UserLocation;
  cursor?: DocumentSnapshot;
  batchSize?: number;
  isIncognito?: boolean;
}

export interface FeedResult {
  cards: SwipeCard[];
  nextCursor?: DocumentSnapshot;
  hasMore: boolean;
  totalAvailable: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const RANKING_WEIGHTS = {
  ROYAL_BOOST: 1000,
  VERIFIED_BOOST: 500,
  INFLUENCER_BOOST: 300,
  HIGH_ACTIVITY_BOOST: 200,
  LOW_POPULARITY_BOOST: 150, // Fairness boost
  PROXIMITY_MULTIPLIER: 0.5,
  CHEMISTRY_MULTIPLIER: 2.0,
} as const;

const QUALITY_THRESHOLDS = {
  MIN_PHOTOS: 1,
  MIN_PROFILE_QUALITY: 0.3,
  MIN_ACTIVITY_SCORE: 0.1,
  MAX_REPORTS_RATIO: 0.1,
} as const;

// ============================================================================
// SWIPE FEED SERVICE
// ============================================================================

class SwipeFeedService {
  private feedCache: Map<string, SwipeCard[]> = new Map();
  private preloadQueue: Map<string, SwipeCard[]> = new Map();

  /**
   * Generate swipe feed for user
   */
  async generateFeed(options: FeedGenerationOptions): Promise<FeedResult> {
    try {
      const {
        userId,
        preferences,
        userLocation,
        cursor,
        batchSize = 20,
        isIncognito = false,
      } = options;

      // Check cache first
      const cacheKey = this.getCacheKey(userId, cursor);
      if (this.feedCache.has(cacheKey)) {
        const cached = this.feedCache.get(cacheKey)!;
        return {
          cards: cached,
          hasMore: true,
          totalAvailable: cached.length,
        };
      }

      // Get user's swipe history to exclude
      const swipeHistory = await swipeService.getSwipeHistory(userId, 1000);
      const swipedUserIds = new Set(swipeHistory.map(h => h.targetUserId));

      // Build base query
      let baseQuery = query(
        collection(db, 'users'),
        where('profile.isActive', '==', true),
        where('profile.isVisible', '==', true)
      );

      // Apply gender filter
      if (preferences.genderPreference !== 'any') {
        baseQuery = query(
          baseQuery,
          where('profile.gender', '==', preferences.genderPreference)
        );
      }

      // Apply age filter
      const birthYearMin = new Date().getFullYear() - preferences.maxAge;
      const birthYearMax = new Date().getFullYear() - preferences.minAge;
      baseQuery = query(
        baseQuery,
        where('profile.birthYear', '>=', birthYearMin),
        where('profile.birthYear', '<=', birthYearMax)
      );

      // Exclude incognito users
      baseQuery = query(
        baseQuery,
        where('privacy.incognito.enabled', '==', false)
      );

      // Pagination
      if (cursor) {
        baseQuery = query(baseQuery, startAfter(cursor));
      }
      baseQuery = query(baseQuery, firestoreLimit(batchSize * 3)); // Fetch extra for filtering

      // Execute query
      const snapshot = await getDocs(baseQuery);

      // Process and filter profiles
      const candidates: SwipeCard[] = [];
      
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const candidateId = docSnap.id;

        // Skip self
        if (candidateId === userId) continue;

        // Skip if already swiped
        if (swipedUserIds.has(candidateId)) continue;

        // Calculate distance
        const candidateLocation = this.getProfileLocation(data);
        if (!candidateLocation) continue;

        const distance = this.calculateDistance(
          userLocation,
          candidateLocation
        );

        // Skip if outside distance range
        if (distance > preferences.maxDistance) continue;

        // Apply quality checks
        if (!this.meetsQualityStandards(data)) continue;

        // Apply safety filters
        if (await this.isShadowHidden(candidateId)) continue;

        // Build swipe card
        const card = this.buildSwipeCard(docSnap, data, distance);
        if (card) {
          candidates.push(card);
        }
      }

      // Rank candidates
      const rankedCards = this.rankCandidates(candidates, userLocation);

      // Limit to batch size
      const finalCards = rankedCards.slice(0, batchSize);

      // Cache results
      this.feedCache.set(cacheKey, finalCards);

      // Preload next batch in background
      this.preloadNextBatch(options, snapshot.docs[snapshot.docs.length - 1]);

      return {
        cards: finalCards,
        nextCursor: snapshot.docs[finalCards.length - 1],
        hasMore: snapshot.docs.length >= batchSize * 3,
        totalAvailable: candidates.length,
      };
    } catch (error) {
      console.error('[SwipeFeedService] generateFeed error:', error);
      throw error;
    }
  }

  /**
   * Check if profile meets quality standards
   */
  private meetsQualityStandards(profileData: any): boolean {
    const photos = profileData.profile?.photos || [];
    const photoCount = photos.length;

    // Must have at least 1 photo
    if (photoCount < QUALITY_THRESHOLDS.MIN_PHOTOS) {
      return false;
    }

    // Check if photos passed face detection
    const validPhotos = photos.filter((p: any) => p.faceDetected === true);
    if (validPhotos.length === 0) {
      return false;
    }

    // Check profile quality score
    const profileQuality = profileData.profile?.qualityScore || 0;
    if (profileQuality < QUALITY_THRESHOLDS.MIN_PROFILE_QUALITY) {
      return false;
    }

    // Check activity score
    const activityScore = profileData.activity?.score || 0;
    if (activityScore < QUALITY_THRESHOLDS.MIN_ACTIVITY_SCORE) {
      return false;
    }

    return true;
  }

  /**
   * Check if profile should be shadow-hidden
   */
  private async isShadowHidden(userId: string): Promise<boolean> {
    try {
      const safetyRef = doc(db, 'users', userId, 'safety', 'status');
      const safetyDoc = await getDoc(safetyRef);

      if (!safetyDoc.exists()) return false;

      const data = safetyDoc.data();

      // Check report ratio
      const totalViews = data.totalViews || 1;
      const totalReports = data.totalReports || 0;
      const reportRatio = totalReports / totalViews;

      if (reportRatio > QUALITY_THRESHOLDS.MAX_REPORTS_RATIO) {
        return true;
      }

      // Check for AI-only photos (suspicious)
      if (data.aiPhotosOnly === true) {
        return true;
      }

      // Check for NSFW signals
      if (data.nsfwDetected === true) {
        return true;
      }

      // Check if under investigation
      if (data.underInvestigation === true) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('[SwipeFeedService] isShadowHidden error:', error);
      return false;
    }
  }

  /**
   * Build swipe card from profile data
   */
  private buildSwipeCard(
    docSnap: DocumentSnapshot,
    data: any,
    distance: number
  ): SwipeCard | null {
    try {
      const profile = data.profile || {};
      const photos = profile.photos || [];

      if (photos.length === 0) return null;

      const mainPhoto = photos[0]?.url || '';
      const allPhotos = photos.map((p: any) => p.url).filter(Boolean);

      const birthYear = profile.birthYear || new Date().getFullYear() - 25;
      const age = new Date().getFullYear() - birthYear;

      const lastActiveAt = data.activity?.lastActiveAt?.toDate() || new Date();
      const isOnline = data.activity?.isOnline || false;

      return {
        userId: docSnap.id,
        displayName: profile.displayName || 'Anonymous',
        age,
        gender: profile.gender || 'other',
        bio: profile.bio || '',
        photos: allPhotos,
        mainPhoto,
        distance: Math.round(distance),
        lastActiveAt,
        isOnline,
        badges: {
          verified: profile.verified || false,
          royal: data.subscriptions?.royal?.active || false,
          influencer: data.influencer?.level || undefined,
          hasAIAvatar: data.ai?.hasAvatar || false,
        },
        activityScore: data.activity?.score || 0,
        profileQuality: profile.qualityScore || 0,
        popularityScore: data.popularity?.score || 0,
        tags: profile.tags || [],
        interests: profile.interests || [],
        chemistryScore: 0.5, // Placeholder for AI model
      };
    } catch (error) {
      console.error('[SwipeFeedService] buildSwipeCard error:', error);
      return null;
    }
  }

  /**
   * Rank candidates using scoring algorithm
   */
  private rankCandidates(
    candidates: SwipeCard[],
    userLocation: UserLocation
  ): SwipeCard[] {
    return candidates.sort((a, b) => {
      const scoreA = this.calculateRankingScore(a, userLocation);
      const scoreB = this.calculateRankingScore(b, userLocation);
      return scoreB - scoreA; // Descending order
    });
  }

  /**
   * Calculate ranking score for a profile
   */
  private calculateRankingScore(
    card: SwipeCard,
    userLocation: UserLocation
  ): number {
    let score = 0;

    // Royal boost (highest priority)
    if (card.badges.royal) {
      score += RANKING_WEIGHTS.ROYAL_BOOST;
    }

    // Verified boost
    if (card.badges.verified) {
      score += RANKING_WEIGHTS.VERIFIED_BOOST;
    }

    // Influencer boost
    if (card.badges.influencer) {
      const influencerMultipliers = {
        rising: 1,
        influencer: 2,
        top_influencer: 3,
      };
      score += RANKING_WEIGHTS.INFLUENCER_BOOST * 
        (influencerMultipliers[card.badges.influencer] || 1);
    }

    // High activity boost
    if (card.activityScore > 0.7) {
      score += RANKING_WEIGHTS.HIGH_ACTIVITY_BOOST;
    }

    // Low popularity fairness boost (help lesser-known profiles)
    if (card.popularityScore < 0.3) {
      score += RANKING_WEIGHTS.LOW_POPULARITY_BOOST;
    }

    // Proximity bonus (closer = better)
    const proximityScore = Math.max(0, 100 - card.distance);
    score += proximityScore * RANKING_WEIGHTS.PROXIMITY_MULTIPLIER;

    // Chemistry score (placeholder for AI model)
    if (card.chemistryScore) {
      score += card.chemistryScore * 100 * RANKING_WEIGHTS.CHEMISTRY_MULTIPLIER;
    }

    // Online users get priority
    if (card.isOnline) {
      score += 100;
    }

    // Recent activity bonus
    const hoursSinceActive = (Date.now() - card.lastActiveAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceActive < 24) {
      score += Math.max(0, 50 - hoursSinceActive);
    }

    return score;
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  private calculateDistance(
    loc1: UserLocation,
    loc2: UserLocation
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(loc2.lat - loc1.lat);
    const dLon = this.toRad(loc2.lng - loc1.lng);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(loc1.lat)) *
        Math.cos(this.toRad(loc2.lat)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Get profile location (with Passport support)
   */
  private getProfileLocation(profileData: any): UserLocation | null {
    try {
      // Check for Passport override
      const passport = profileData.location?.passport;
      if (passport?.enabled && passport.lat && passport.lng) {
        return {
          lat: passport.lat,
          lng: passport.lng,
          city: passport.city,
          country: passport.country,
          isPassport: true,
        };
      }

      // Use GPS location
      const gps = profileData.location?.gps;
      if (gps?.lat && gps.lng) {
        return {
          lat: gps.lat,
          lng: gps.lng,
          city: gps.city,
          country: gps.country,
          isPassport: false,
        };
      }

      return null;
    } catch (error) {
      console.error('[SwipeFeedService] getProfileLocation error:', error);
      return null;
    }
  }

  /**
   * Preload next batch in background
   */
  private async preloadNextBatch(
    options: FeedGenerationOptions,
    lastDoc: DocumentSnapshot
  ): Promise<void> {
    try {
      // Don't await - run in background
      setTimeout(async () => {
        const nextOptions = { ...options, cursor: lastDoc };
        const result = await this.generateFeed(nextOptions);
        
        const preloadKey = this.getCacheKey(options.userId, lastDoc);
        this.preloadQueue.set(preloadKey, result.cards);
      }, 100);
    } catch (error) {
      console.error('[SwipeFeedService] preloadNextBatch error:', error);
    }
  }

  /**
   * Generate cache key
   */
  private getCacheKey(userId: string, cursor?: DocumentSnapshot): string {
    const cursorId = cursor?.id || 'start';
    return `${userId}_${cursorId}`;
  }

  /**
   * Clear cache for user
   */
  clearCache(userId: string): void {
    const keysToDelete: string[] = [];
    
    for (const key of this.feedCache.keys()) {
      if (key.startsWith(userId)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => {
      this.feedCache.delete(key);
      this.preloadQueue.delete(key);
    });
  }

  /**
   * Refresh feed (trigger on user request)
   */
  async refreshFeed(userId: string): Promise<void> {
    this.clearCache(userId);
  }
}

// Export singleton instance
export const swipeFeedService = new SwipeFeedService();
