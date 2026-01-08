/**
 * PACK 94 — Discovery Service
 * Client-side service for discovery feed and search
 */

import { getFunctions, httpsCallable, HttpsCallableResult } from 'firebase/functions';

// ============================================================================
// TYPES
// ============================================================================

export interface DiscoveryFilters {
  gender?: string;
  minAge?: number;
  maxAge?: number;
  nsfwAllowed?: boolean;
  countryCode?: string;
  distanceKm?: number;
}

export interface ProfileCard {
  userId: string;
  displayName: string;
  age: number;
  gender: string;
  country: string;
  bio?: string;
  mainPhoto?: string;
  photos?: string[];
  distance?: number;
  lastActiveAt: string;
  isOnline?: boolean;
  badges?: string[];
}

export interface DiscoveryFeedResponse {
  ok: boolean;
  items: ProfileCard[];
  cursor?: string;
  hasMore: boolean;
  totalFiltered?: number;
}

export interface SearchProfilesResponse {
  ok: boolean;
  items: ProfileCard[];
  cursor?: string;
  hasMore: boolean;
  totalResults?: number;
}

export interface GetDiscoveryFeedRequest {
  userId: string;
  cursor?: string;
  limit?: number;
  filters?: DiscoveryFilters;
}

export interface SearchProfilesRequest {
  userId: string;
  query?: string;
  cursor?: string;
  limit?: number;
  filters?: DiscoveryFilters;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class DiscoveryService {
  private functions = getFunctions();

  /**
   * Get discovery feed for a user
   */
  async getDiscoveryFeed(
    userId: string,
    cursor?: string,
    limit: number = 20,
    filters?: DiscoveryFilters
  ): Promise<DiscoveryFeedResponse> {
    try {
      const callable = httpsCallable<GetDiscoveryFeedRequest, DiscoveryFeedResponse>(
        this.functions,
        'getDiscoveryFeedCallable'
      );

      const result: HttpsCallableResult<DiscoveryFeedResponse> = await callable({
        userId,
        cursor,
        limit,
        filters,
      });

      return result.data;
    } catch (error: any) {
      console.error('[DiscoveryService] getDiscoveryFeed error:', error);
      throw new Error(error.message || 'Failed to get discovery feed');
    }
  }

  /**
   * Search profiles
   */
  async searchProfiles(
    userId: string,
    query?: string,
    cursor?: string,
    limit: number = 20,
    filters?: DiscoveryFilters
  ): Promise<SearchProfilesResponse> {
    try {
      const callable = httpsCallable<SearchProfilesRequest, SearchProfilesResponse>(
        this.functions,
        'searchProfilesCallable'
      );

      const result: HttpsCallableResult<SearchProfilesResponse> = await callable({
        userId,
        query,
        cursor,
        limit,
        filters,
      });

      return result.data;
    } catch (error: any) {
      console.error('[DiscoveryService] searchProfiles error:', error);
      throw new Error(error.message || 'Failed to search profiles');
    }
  }

  /**
   * Rebuild discovery profile (manual trigger)
   */
  async rebuildProfile(userId: string): Promise<void> {
    try {
      const callable = httpsCallable(
        this.functions,
        'rebuildDiscoveryProfileCallable'
      );

      await callable({ userId });
    } catch (error: any) {
      console.error('[DiscoveryService] rebuildProfile error:', error);
      throw new Error(error.message || 'Failed to rebuild profile');
    }
  }
}

// Export singleton instance
export const discoveryService = new DiscoveryService();