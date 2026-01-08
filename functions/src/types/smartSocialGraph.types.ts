/**
 * PACK 161 — Avalo Smart Social Graph 2.0 Types
 * Interest-Driven Discovery Without Matchmaking Bias
 * 
 * NON-NEGOTIABLE RULES:
 * - No attractiveness scores
 * - No ranking based on body, photos or beauty bias
 * - No "people you might be attracted to"
 * - No "suggested singles"
 * - Discovery cannot be influenced by spending tokens or relationships
 * - Popularity cannot override quality and safety
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore';

// ============================================================================
// DISCOVERY CATEGORIES
// ============================================================================

/**
 * Core discovery pillars (NOT dating categories)
 */
export type DiscoveryCategory = 
  | 'SKILLS'           // cooking, coding, fitness, photography
  | 'LIFESTYLE'        // travel, wellness, diet, fashion
  | 'BUSINESS'         // marketing, entrepreneurship, organization
  | 'CREATIVE'         // art, dance, music, crafts
  | 'ENTERTAINMENT'    // gaming, humor, daily vlogs
  | 'LOCAL_EVENTS'     // workshops near user's city
  | 'DIGITAL_PRODUCTS';// ebooks, courses, presets

/**
 * Forbidden categories checker
 */
export const FORBIDDEN_KEYWORDS = [
  'hot singles',
  'meet girls',
  'meet guys',
  'dating',
  'hookup',
  'nsfw',
  'escorting',
  'sugar',
  'sexy',
  'attractive',
];

// ============================================================================
// INTEREST VECTORS
// ============================================================================

/**
 * User interest profile across all categories
 * Updated based on viewing behavior, not preferences
 */
export interface InterestVector {
  userId: string;
  
  // Category weights (0-100) - computed from actual behavior
  categories: {
    skills: number;
    lifestyle: number;
    business: number;
    creative: number;
    entertainment: number;
    localEvents: number;
    digitalProducts: number;
  };
  
  // Specific interest tags (derived from content consumed)
  specificInterests: string[]; // e.g., ['coding', 'fitness', 'travel']
  
  // Language preference (from device/content language)
  languages: string[]; // e.g., ['en', 'pl']
  
  // Region (broad, not GPS)
  region?: string; // e.g., 'EU', 'NA', 'ASIA'
  countryCode?: string;
  
  // Behavioral signals (NOT appearance-based)
  avgSessionDurationSec: number;
  contentRetentionRate: number; // How often they finish watching content
  diversityScore: number; // How many different categories explored
  
  // Metadata
  lastUpdated: Timestamp | FieldValue;
  createdAt: Timestamp | FieldValue;
}

// ============================================================================
// CREATOR RELEVANCE SCORING
// ============================================================================

/**
 * Creator relevance profile (NOT attractiveness or popularity)
 */
export interface CreatorRelevanceScore {
  creatorId: string;
  
  // Primary category
  primaryCategory: DiscoveryCategory;
  
  // Topical expertise signals (from content tags, not looks)
  topicalMatch: number; // 0-100: How well content matches category
  
  // Language match
  languageMatch: number; // 0-100: Content language alignment
  
  // Regional relevance
  regionMatch: number; // 0-100: Geographic relevance (broad)
  
  // Content quality signals (NOT appearance)
  contentFreshness: number; // 0-100: Recent activity
  retentionQuality: number; // 0-100: How often viewers watch until end
  satisfactionScore: number; // 0-100: Non-appearance based feedback
  
  // Digital product quality (if applicable)
  productDeliveryQuality?: number; // 0-100: Verified delivery success rate
  
  // Safety history (good behavior = stable, NOT boosted)
  safetyScore: number; // 0-100: Good track record (no violations)
  
  // Shadow density control
  weeklyImpressions: number; // Track to prevent mega-profile dominance
  
  // Metadata
  lastCalculated: Timestamp | FieldValue;
}

// ============================================================================
// DISCOVERY RANKING (ETHICS-FIRST)
// ============================================================================

/**
 * Ranking factors for discovery (ZERO appearance bias)
 */
export interface DiscoveryRankingFactors {
  // Topical match (primary factor)
  topicalRelevance: number; // 0-1
  
  // Language match
  languageAlignment: number; // 0-1
  
  // Region match (broad)
  regionalRelevance: number; // 0-1
  
  // Content freshness (recent activity)
  recencyScore: number; // 0-1
  
  // Retention quality (non-appearance)
  retentionScore: number; // 0-1
  
  // Safety score (good behavior)
  safetyScore: number; // 0-1
  
  // Shadow density penalty (prevent mega-creator dominance)
  densityPenalty: number; // 0-1 (lower if too many impressions)
  
  // FORBIDDEN FACTORS (must remain 0):
  attractivenessScore: 0;
  beautyRating: 0;
  sexAppeal: 0;
  tokenSpendingBoost: 0;
  relationshipInfluence: 0;
}

/**
 * Final discovery score (transparent calculation)
 */
export interface DiscoveryScore {
  targetUserId: string;
  viewerId: string;
  
  // Component scores
  factors: DiscoveryRankingFactors;
  
  // Final weighted score
  finalScore: number; // 0-100
  
  // Explanation (for transparency)
  explanation: string;
  
  // Computed at
  computedAt: Timestamp | FieldValue;
}

// ============================================================================
// SHADOW DENSITY PREVENTION
// ============================================================================

/**
 * Shadow density tracker (prevent mega-creator dominance)
 */
export interface ShadowDensityCounter {
  creatorId: string;
  
  // Weekly impression tracking
  weeklyImpressions: number;
  weekStartDate: string; // ISO date string
  
  // Rotation limits
  isInRotationLimit: boolean; // true if > 2M impressions/week
  
  // Discovery slot guarantees
  guaranteedDiscoverySlots: number; // New/mid-size creators get guaranteed slots
  
  // Last updated
  lastUpdated: Timestamp | FieldValue;
}

// ============================================================================
// MULTI-PERSONA PERSONALIZATION
// ============================================================================

/**
 * User discovery modes (NO romantic mode)
 */
export type DiscoveryMode =
  | 'PROFESSIONAL'      // Business, skills, networking
  | 'SOCIAL_LIFESTYLE'  // Lifestyle, wellness, entertainment
  | 'ENTERTAINMENT'     // Gaming, humor, daily content
  | 'LEARNING'          // Skills, courses, education
  | 'LOCAL_EVENTS';     // Workshops, meetups, events

/**
 * User's current discovery preferences (controlled by user)
 */
export interface UserDiscoveryPreferences {
  userId: string;
  
  // Active mode
  currentMode: DiscoveryMode;
  
  // Mode-specific weights
  modeWeights: Record<DiscoveryMode, number>; // 0-100 per mode
  
  // Forbidden modes (must never exist)
  romanticMode?: never;
  eroticMode?: never;
  meetPeopleMode?: never;
  
  // Last updated
  lastUpdated: Timestamp | FieldValue;
}

// ============================================================================
// ANTI-FLIRT MANIPULATION DETECTION
// ============================================================================

/**
 * Flirt manipulation detection flags
 */
export interface FlirtManipulationFlags {
  contentId: string;
  creatorId: string;
  
  // Detection signals
  seductiveThumbnail: boolean;
  suggestiveClothingAngles: boolean;
  clickbaitFlirtCaptions: boolean;
  paraocialFlirtHooks: boolean;
  
  // Action taken
  contentDemoted: boolean;
  safetyCaseOpened: boolean;
  
  // Detection metadata
  detectedAt: Timestamp | FieldValue;
  confidence: number; // 0-100
}

// ============================================================================
// DISCOVERY FEED REQUEST/RESPONSE
// ============================================================================

/**
 * Discovery feed request (multi-mode)
 */
export interface SmartSocialGraphRequest {
  userId: string;
  mode: DiscoveryMode;
  
  // Optional filters
  category?: DiscoveryCategory;
  language?: string;
  region?: string;
  
  // Pagination
  cursor?: string;
  limit?: number;
}

/**
 * Creator card (NO appearance metrics)
 */
export interface CreatorCard {
  creatorId: string;
  displayName: string;
  
  // Category & expertise
  primaryCategory: DiscoveryCategory;
  expertise: string[]; // e.g., ['React', 'Node.js', 'TypeScript']
  
  // Content signals (NOT looks)
  contentType: string; // e.g., 'tutorial', 'workshop', 'course'
  recentActivity: string; // ISO timestamp
  
  // Non-appearance metrics
  contentQuality: number; // 0-100: Retention-based
  safetyRating: number; // 0-100: Good track record
  
  // Optional
  thumbnailUrl?: string; // Content thumbnail (NOT profile photo)
  bio?: string;
  
  // FORBIDDEN FIELDS (must never exist):
  attractivenessScore?: never;
  hotnessRating?: never;
  sexiness?: never;
}

/**
 * Discovery feed response
 */
export interface SmartSocialGraphResponse {
  items: CreatorCard[];
  cursor?: string;
  hasMore: boolean;
  
  // Transparency
  explanation: string; // Why these recommendations
  diversityAchieved: boolean; // True if creators from multiple categories
}

// ============================================================================
// BACKGROUND JOB TYPES
// ============================================================================

/**
 * Daily discovery refresh job status
 */
export interface DiscoveryRefreshJob {
  jobId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  
  profilesProcessed: number;
  profilesFailed: number;
  
  startedAt?: Timestamp | FieldValue;
  completedAt?: Timestamp | FieldValue;
  error?: string;
}

/**
 * Safety & compliance scan job
 */
export interface SafetyComplianceScanJob {
  jobId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  
  contentScanned: number;
  violationsDetected: number;
  actionsTaken: number;
  
  startedAt?: Timestamp | FieldValue;
  completedAt?: Timestamp | FieldValue;
}

/**
 * Fairness & diversity audit job
 */
export interface FairnessDiversityAudit {
  auditId: string;
  timestamp: Timestamp | FieldValue;
  
  // Diversity metrics
  categoryDistribution: Record<DiscoveryCategory, number>;
  newCreatorVisibility: number; // % of impressions to new creators
  megaCreatorDominance: number; // % of impressions to top 1%
  
  // Fairness checks
  tokenSpendingCorrelation: number; // Must be ~0 (no boost from spending)
  regionalBalance: number; // 0-100: Geographic diversity
  
  // Pass/Fail
  passed: boolean;
  issues: string[];
  recommendations: string[];
}

// ============================================================================
// EXPORTS
// ============================================================================

export const DEFAULT_RANKING_WEIGHTS = {
  topical: 0.35,      // Primary factor
  language: 0.15,
  region: 0.10,
  recency: 0.15,
  retention: 0.15,
  safety: 0.10,
  density: -0.10,     // Penalty for over-exposure
};

export const SHADOW_DENSITY_THRESHOLD = 2_000_000; // 2M impressions/week

export const GUARANTEED_NEW_CREATOR_SLOTS = 3; // Per feed page