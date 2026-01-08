/**
 * PACK 94 — Discovery & Ranking Engine v2 Types
 * Trust-/Region-/Earnings-Aware Feed & Search
 * 
 * Type definitions for the discovery and ranking system
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// DISCOVERY PROFILE (Denormalized Index)
// ============================================================================

export type VisibilityTier = 'NORMAL' | 'LOW' | 'HIDDEN';
export type NSFWAffinity = 'NONE' | 'SOFT' | 'STRONG';
export type ContentRating = 'SFW' | 'SENSITIVE' | 'NSFW_SOFT' | 'NSFW_STRONG';

/**
 * Discovery Profile - Denormalized index for fast querying
 * Updated by background jobs when user changes profile, content, or trust state
 */
export interface DiscoveryProfile {
  userId: string;
  isDiscoverable: boolean; // Master toggle (incognito/off-grid users set false)
  
  // Basic filters
  gender: string;
  age: number;
  countryCode: string;
  
  // Activity signals
  lastActiveAt: Timestamp;
  
  // Quality scores (0-100)
  profileCompleteness: number; // Based on photos, bio, interests
  engagementScore: number; // Aggregated from likes, followers, chats, monetized actions
  monetizationScore: number; // Based on earnings & paid interactions (bounded)
  
  // Trust & safety (from PACK 85-87)
  trustScore: number; // Copy of user_trust_profile.riskScore (lower is better)
  enforcementLevel: 'NONE' | 'SOFT_LIMIT' | 'HARD_LIMIT' | 'SUSPENDED';
  visibilityTier: VisibilityTier;
  
  // Content classification (from PACK 91)
  nsfwAffinity: NSFWAffinity; // User's content preference
  contentRatingMax: ContentRating; // Max rating of their public content
  
  // Metadata
  updatedAt: Timestamp;
}

// ============================================================================
// RANKING CONFIGURATION
// ============================================================================

/**
 * Ranking weights for scoring algorithm
 */
export interface RankingWeights {
  w_profile: number; // Weight for profile completeness
  w_active: number; // Weight for recency/activity
  w_engage: number; // Weight for engagement score
  w_monet: number; // Weight for monetization score
  w_match: number; // Weight for preference matching
  w_risk: number; // Penalty weight for risk score
}

/**
 * Default ranking weights
 */
export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  w_profile: 0.15,
  w_active: 0.25,
  w_engage: 0.20,
  w_monet: 0.10,
  w_match: 0.20,
  w_risk: 0.30,
};

// ============================================================================
// FEED & SEARCH REQUESTS
// ============================================================================

/**
 * Filters for discovery queries
 */
export interface DiscoveryFilters {
  gender?: string;
  minAge?: number;
  maxAge?: number;
  nsfwAllowed?: boolean; // From user settings
  countryCode?: string;
  distanceKm?: number;
}

/**
 * Get Discovery Feed Request
 */
export interface GetDiscoveryFeedRequest {
  userId: string;
  cursor?: string;
  limit?: number;
  filters?: DiscoveryFilters;
}

/**
 * Search Profiles Request
 */
export interface SearchProfilesRequest {
  userId: string;
  query?: string; // Text search in name, bio, interests
  cursor?: string;
  limit?: number;
  filters?: DiscoveryFilters;
}

// ============================================================================
// FEED & SEARCH RESPONSES
// ============================================================================

/**
 * Lightweight profile card for discovery
 */
export interface ProfileCard {
  userId: string;
  displayName: string;
  age: number;
  gender: string;
  country: string;
  bio?: string;
  mainPhoto?: string;
  photos?: string[];
  distance?: number; // In km
  lastActiveAt: string; // ISO string
  isOnline?: boolean;
  badges?: string[]; // e.g., 'verified', 'royal', etc.
}

/**
 * Discovery Feed Response
 */
export interface DiscoveryFeedResponse {
  items: ProfileCard[];
  cursor?: string;
  hasMore: boolean;
  totalFiltered?: number; // Debug info
}

/**
 * Search Profiles Response
 */
export interface SearchProfilesResponse {
  items: ProfileCard[];
  cursor?: string;
  hasMore: boolean;
  totalResults?: number;
}

// ============================================================================
// PROFILE SCORING
// ============================================================================

/**
 * Intermediate scoring data for a candidate
 */
export interface CandidateScore {
  userId: string;
  baseScore: number;
  components: {
    profileScore: number;
    activityScore: number;
    engagementScore: number;
    monetizationScore: number;
    matchScore: number;
    riskPenalty: number;
  };
  finalScore: number;
  rank?: number;
}

/**
 * User preference context for matching
 */
export interface UserPreferences {
  preferredGenders?: string[];
  minAge?: number;
  maxAge?: number;
  maxDistanceKm?: number;
  interests?: string[];
}

// ============================================================================
// PROFILE REBUILD TRIGGERS
// ============================================================================

/**
 * Reasons for profile rebuild
 */
export type RebuildReason = 
  | 'PROFILE_UPDATE'
  | 'TRUST_UPDATE'
  | 'ENFORCEMENT_UPDATE'
  | 'CONTENT_RATING_CHANGE'
  | 'MONETIZATION_EVENT'
  | 'SCHEDULED_REFRESH'
  | 'MANUAL_TRIGGER';

/**
 * Profile rebuild request
 */
export interface RebuildProfileRequest {
  userId: string;
  reason: RebuildReason;
  metadata?: Record<string, any>;
}

// ============================================================================
// OBSERVABILITY
// ============================================================================

/**
 * Discovery metrics for monitoring
 */
export interface DiscoveryMetrics {
  totalProfiles: number;
  discoverableProfiles: number;
  hiddenProfiles: number;
  suspendedProfiles: number;
  averageScore: number;
  medianScore: number;
}

/**
 * Feed generation diagnostics
 */
export interface FeedGenerationDiagnostics {
  userId: string;
  candidatesQueried: number;
  candidatesFiltered: number;
  candidatesRanked: number;
  candidatesReturned: number;
  filterReasons: Record<string, number>;
  averageScore: number;
  generationTimeMs: number;
}