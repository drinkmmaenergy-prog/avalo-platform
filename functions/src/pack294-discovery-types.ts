/**
 * PACK 294 - Search & Discovery Filters
 * Type Definitions for Discovery Search System
 * 
 * Dating-aligned, free, safe discovery with comprehensive filters
 */

// Profile Search Index Document
export interface ProfileSearchIndex {
  userId: string;
  
  // Basic data (public)
  displayName: string;
  age: number;
  gender: 'MALE' | 'FEMALE' | 'NONBINARY';
  orientation: 'HETERO' | 'HOMO' | 'BI' | 'OTHER';
  bio: string;
  
  // Location / distance
  country: string;
  city: string;
  lat: number;
  lng: number;
  
  // Preferences
  lookingFor: string[]; // ['MEN', 'WOMEN', 'NONBINARY']
  minPreferredAge: number;
  maxPreferredAge: number;
  languages: string[]; // ['pl', 'en', 'de', ...]
  
  // Interests & tags (non-political, non-religious)
  interests: string[];
  
  // Status flags
  isVerified: boolean;
  hasProfilePhoto: boolean;
  hasVideoIntro: boolean;
  incognito: boolean;
  earnOn: boolean;
  influencerBadge: boolean;
  royalBadge: boolean;
  vipBadge: boolean;
  
  // Popularity & activity
  popularityScore: number;
  recentActivityScore: number;
  lastActiveAt: string; // ISO datetime
  
  // Safety / risk
  riskScore: number;
  banned: boolean;
  shadowBanned: boolean;
  
  // Internal metadata
  updatedAt: string; // ISO datetime
}

// Discovery Filter Options
export interface DiscoveryFilter {
  // Required
  viewerLocation?: { lat: number; lng: number };
  
  // Basic filters
  ageMin?: number; // default 18
  ageMax?: number; // default 99
  gender?: 'MALE' | 'FEMALE' | 'NONBINARY' | 'ANY';
  lookingFor?: 'MEN' | 'WOMEN' | 'NONBINARY' | 'ANY';
  distanceKmMax?: number; // 10 / 50 / 100 / 500 / GLOBAL
  
  // Lifestyle / interests
  interestsAnyOf?: string[]; // at least one of
  languageAnyOf?: string[]; // at least one of
  hasProfilePhoto?: boolean;
  hasVideoIntro?: boolean;
  isVerifiedOnly?: boolean;
  
  // Popularity / status
  minPopularityScore?: number;
  influencerOnly?: boolean;
  royalOnly?: boolean;
}

// Discovery Search Result Item
export interface DiscoverySearchResult {
  userId: string;
  displayName: string;
  age: number;
  gender: string;
  city: string;
  country: string;
  distanceKm: number | null;
  isVerified: boolean;
  influencerBadge: boolean;
  royalBadge: boolean;
  vipBadge: boolean;
  hasProfilePhoto: boolean;
  hasVideoIntro: boolean;
  interests: string[];
  popularityScore: number;
  recentActivityScore: number;
  lastActiveAt: string;
}

// Discovery Search Response
export interface DiscoverySearchResponse {
  items: DiscoverySearchResult[];
  nextCursor: string | null;
}

// Profile Search Query (name/username search)
export interface ProfileSearchQuery {
  query: string;
  limit?: number;
}

// Profile Search Response
export interface ProfileSearchResponse {
  items: DiscoverySearchResult[];
}

// Ranking Weights
export interface RankingWeights {
  distance: number;
  activity: number;
  popularity: number;
  matchIntent: number;
  tierBoost: number;
  risk: number;
}

// Ranking Score Components
export interface RankingScore {
  distanceScore: number;
  activityScore: number;
  popularityScore: number;
  intentScore: number;
  tierBoost: number;
  riskPenalty: number;
  totalScore: number;
}

// Discovery Analytics Event
export interface DiscoveryAnalyticsEvent {
  userId: string;
  eventType: 'search_executed' | 'profile_viewed' | 'profile_like' | 'open_chat' | 'open_calendar';
  timestamp: string;
  filters?: DiscoveryFilter;
  resultCount?: number;
  profileId?: string;
}

// Search Query Log (for AI learning)
export interface SearchQueryLog {
  queryId: string;
  userId: string;
  timestamp: string;
  filters: DiscoveryFilter;
  resultsCount: number;
  clickedProfileIds: string[];
  sessionDurationSec: number;
}

// Constants
export const DISCOVERY_CONSTANTS = {
  MAX_DISTANCE_KM: 500,
  DEFAULT_AGE_MIN: 18,
  DEFAULT_AGE_MAX: 99,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 50,
  RISK_BLOCK_THRESHOLD: 80,
  LOW_POPULARITY_THRESHOLD: 30,
} as const;

// Ranking weight configuration
export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  distance: 0.25,
  activity: 0.30,
  popularity: 0.20,
  matchIntent: 0.15,
  tierBoost: 0.05,
  risk: 0.05,
};