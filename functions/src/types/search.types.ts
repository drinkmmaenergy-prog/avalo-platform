/**
 * PACK 170 — Avalo Universal Search 3.0
 * Interest-Driven Search · Utility-First Index · Zero Attractiveness Scoring
 */

export enum SearchCategory {
  CREATORS = 'creators',
  CONTENT = 'content',
  DIGITAL_PRODUCTS = 'digital_products',
  COURSES = 'courses',
  CLUBS = 'clubs',
  EVENTS = 'events',
  MERCH = 'merch',
  REGIONS = 'regions',
  TOPICS = 'topics'
}

export enum ContentFormat {
  VIDEO = 'video',
  AUDIO = 'audio',
  TEXT = 'text',
  EVENT = 'event',
  PRODUCT = 'product',
  LIVESTREAM = 'livestream'
}

export enum SkillLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert'
}

export enum PriceRange {
  FREE = 'free',
  UNDER_100 = 'under_100',
  UNDER_500 = 'under_500',
  UNDER_1000 = 'under_1000',
  OVER_1000 = 'over_1000'
}

export enum DurationRange {
  SHORT = 'short',        // < 30 min
  MEDIUM = 'medium',      // 30 min - 2 hours
  LONG = 'long',          // 2+ hours
  MULTI_DAY = 'multi_day' // events/courses
}

export interface SearchIndexEntry {
  id: string;
  category: SearchCategory;
  
  // Content basics
  title: string;
  description: string;
  tags: string[];
  language: string;
  
  // Creator info (if applicable)
  creatorId?: string;
  creatorName?: string;
  creatorVerified?: boolean;
  
  // Location (region-level only, no GPS)
  region?: string;      // city / country
  country?: string;
  
  // Content attributes
  format?: ContentFormat;
  skillLevel?: SkillLevel;
  duration?: number;    // in minutes
  priceTokens?: number;
  
  // Engagement metrics (SFW only)
  interestMatchScore: number;  // 0-100
  qualityScore: number;        // 0-100
  completionRate?: number;     // for courses
  participationCount?: number; // for events/clubs
  
  // Safety & compliance
  safetyScore: number;         // 0-100 (low = flagged)
  isExplicit: boolean;
  isBanned: boolean;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt?: Date;
  
  // Forbidden fields (never populated)
  // attractivenessScore - FORBIDDEN
  // giftingAmount - FORBIDDEN
  // romanticScore - FORBIDDEN
  // bodyMetrics - FORBIDDEN
}

export interface SearchQuery {
  userId: string;
  query: string;
  category?: SearchCategory;
  filters: SearchFilters;
  
  // Pagination
  limit: number;
  offset: number;
  
  // Metadata
  timestamp: Date;
  platform: 'mobile' | 'web' | 'desktop';
}

export interface SearchFilters {
  categories?: SearchCategory[];
  region?: string;
  country?: string;
  language?: string;
  priceRange?: PriceRange;
  skillLevel?: SkillLevel;
  duration?: DurationRange;
  format?: ContentFormat[];
  verifiedOnly?: boolean;
  freeOnly?: boolean;
  safeSearchEnabled: boolean; // always on by default
}

export interface SearchResult {
  id: string;
  category: SearchCategory;
  title: string;
  description: string;
  thumbnailUrl?: string;
  
  creatorId?: string;
  creatorName?: string;
  creatorAvatar?: string;
  
  relevanceScore: number;  // 0-100
  qualityScore: number;
  
  // Display attributes
  format?: ContentFormat;
  priceTokens?: number;
  duration?: number;
  region?: string;
  language: string;
  
  metadata: {
    participantCount?: number;
    completionRate?: number;
    isVerified?: boolean;
    createdAt: Date;
  };
}

export interface SearchSuggestion {
  text: string;
  category?: SearchCategory;
  type: 'recent' | 'popular' | 'related' | 'creator' | 'topic';
}

export interface SearchHistoryEntry {
  userId: string;
  query: string;
  category?: SearchCategory;
  filters: SearchFilters;
  resultCount: number;
  timestamp: Date;
}

export interface SearchLog {
  id: string;
  userId: string;
  query: string;
  category?: SearchCategory;
  filters: SearchFilters;
  results: number;
  clickedResultId?: string;
  clickedPosition?: number;
  timestamp: Date;
  platform: 'mobile' | 'web' | 'desktop';
}

export interface BannedSearchTerm {
  term: string;
  type: 'exact' | 'partial' | 'regex';
  category: 'explicit' | 'romantic' | 'attractiveness';
  severity: 'block' | 'warn' | 'suggest_alternative';
  alternative?: string;
  createdAt: Date;
}

export interface SearchConfig {
  maxResults: number;
  defaultLimit: number;
  safeSearchEnabled: boolean;
  minQualityScore: number;
  minSafetyScore: number;
  autocompleteMinLength: number;
  autocompleteMaxResults: number;
}

export const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  maxResults: 100,
  defaultLimit: 20,
  safeSearchEnabled: true,
  minQualityScore: 40,
  minSafetyScore: 60,
  autocompleteMinLength: 2,
  autocompleteMaxResults: 10
};

export interface RankingFactors {
  interestMatch: number;    // 0-100
  qualityScore: number;     // 0-100
  engagement: number;       // 0-100
  recency: number;          // 0-100
  completionRate?: number;  // 0-100
  safetyScore: number;      // 0-100
}

export interface SearchAnalytics {
  totalSearches: number;
  uniqueUsers: number;
  topCategories: Record<SearchCategory, number>;
  topQueries: Array<{ query: string; count: number }>;
  avgResultsPerSearch: number;
  avgClickPosition: number;
  zerResultsRate: number;
}