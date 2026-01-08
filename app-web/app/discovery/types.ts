/**
 * PACK 271 - Discovery Engine Types (Web)
 * Type definitions for Discovery grid and ranking system
 */

export interface DiscoveryProfile {
  userId: string;
  displayName: string;
  age: number;
  distance: number; // in km
  photos: string[];
  primaryPhoto: string;
  
  // Activity indicators
  isOnline: boolean;
  lastActive: Date;
  hasNewPost: boolean;
  lastPostDate?: Date;
  
  // User status
  isVerified: boolean;
  isRoyal: boolean;
  hasAIAvatar: boolean;
  earnModeEnabled: boolean;
  incognito: boolean;
  
  // Profile metrics
  profileQuality: number; // 0-100
  popularity: number; // engagement score
  activityScore: number; // recent activity
  
  // Swipe eligibility
  swipeEligible: boolean;
  
  // Location
  location: {
    city?: string;
    country?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  
  // Bio & interests (optional)
  bio?: string;
  interests?: string[];
  
  // Gender & preferences
  gender: 'male' | 'female' | 'non-binary' | 'other';
  preferredGender?: string[];
}

export interface DiscoveryFilters {
  ageMin: number;
  ageMax: number;
  distanceMax: number; // in km
  gender?: string[];
  showEarnMode: boolean;
  onlyVerified: boolean;
  passport?: {
    enabled: boolean;
    city: string;
    country: string;
    coordinates: {
      lat: number;
      lng: number;
    };
  };
}

export interface DiscoveryRankingScore {
  activityScore: number;
  distanceScore: number;
  profileQuality: number;
  totalScore: number;
  multipliers: {
    royal: number;
    aiAvatar: number;
    lowPopularity: number;
  };
}

export interface DiscoveryResponse {
  profiles: DiscoveryProfile[];
  cursor?: string;
  hasMore: boolean;
  totalCount: number;
}

export type TabMode = 'nearby' | 'passport';

export interface ActivityIndicator {
  type: 'online' | 'recent' | 'new_post' | 'offline';
  label: string;
  color: string;
}