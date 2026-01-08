/**
 * PACK 208 — Chemistry Feed AI Types
 * Type definitions for adaptive attraction ranking
 */

export interface UserProfile {
  userId: string;
  name: string;
  age: number;
  gender: string;
  location?: {
    lat: number;
    lng: number;
    distanceKm?: number;
  };
  photos: string[];
  bio?: string;
  interests?: string[];
  preferences?: UserPreferences;
  verified?: boolean;
  popularity?: PopularityMetrics;
  safetyFlags?: SafetyFlags;
  completeness?: ProfileCompleteness;
}

export interface UserPreferences {
  gender?: string[];
  ageMin?: number;
  ageMax?: number;
  distanceMax?: number;
  vibeTags?: string[];
}

export interface PopularityMetrics {
  likesReceived: number;
  matchCount: number;
  chatCount: number;
  lastActiveAt?: Date;
}

export interface SafetyFlags {
  banRisk: number; // 0-1 scale
  nsfwFlags: number;
  reportStrikes: number;
}

export interface ProfileCompleteness {
  hasPhotos: boolean;
  hasBio: boolean;
  hasPreferences: boolean;
  score: number; // 0-100
}

export interface SwipeBehavior {
  userId: string;
  totalSwipes: number;
  rightSwipes: number;
  leftSwipes: number;
  patterns?: {
    preferredAgeRange?: [number, number];
    preferredDistance?: number;
    likedGenders?: string[];
  };
}

export interface ChemistrySignals {
  photoAttractivenessScore: number; // 0-100
  verifiedBoost: number; // 0-20
  popularityScore: number; // 0-100
  completenessScore: number; // 0-100
  preferencesMatchScore: number; // 0-100
  behaviorMatchScore: number; // 0-100
  locationScore: number; // 0-100
  timeOfDayBoost: number; // 0-10
  missionCompletionBoost: number; // 0-15
  safetyPenalty: number; // 0-50 (subtracted)
}

export interface ChemistryScore {
  userId: string;
  totalScore: number; // 0-100
  signals: ChemistrySignals;
  category: 'verified' | 'medium_popularity' | 'low_popularity' | 'high_popularity';
  discoveryBoost: boolean; // Random 5-10% discovery
}

export interface FeedOptions {
  userId: string;
  limit?: number;
  offset?: number;
  refreshCache?: boolean;
}

export interface FeedResponse {
  profiles: UserProfile[];
  scores: ChemistryScore[];
  nextOffset: number;
  totalAvailable: number;
  lastRefreshedAt: Date;
}

export interface AnalyticsEvent {
  eventType: 'feed.load' | 'feed.scroll' | 'feed.profile.view' | 'feed.profile.like' | 'feed.profile.skip' | 'feed.profile.chat.start';
  userId: string;
  targetUserId?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}