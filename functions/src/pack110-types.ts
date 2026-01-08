/**
 * PACK 110 — Voice of User & Continuous Feedback Engine
 * 
 * TypeScript type definitions for user feedback system.
 * 
 * CRITICAL CONSTRAINTS:
 * - Zero free tokens, zero bonuses, zero discounts, zero incentives
 * - No UX changes suggesting "earn more by submitting feedback"
 * - Feedback must not influence visibility, ranking, or monetization
 * - Internal tracking only - no public reviews or star ratings
 * - Anti-spam and abuse protection required
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore';

// ============================================================================
// FEEDBACK EVENT TYPES
// ============================================================================

export type FeedbackEventType = 
  | 'NPS'              // Net Promoter Score survey
  | 'FEATURE'          // Feature-specific feedback
  | 'FREE_FORM';       // User-initiated written feedback

/**
 * Main feedback event document
 * Collection: user_feedback_events
 */
export interface UserFeedbackEvent {
  id: string;
  userId?: string;                    // Optional for anonymous feedback
  eventType: FeedbackEventType;
  score?: number;                     // 0-10 for NPS, 1-5 for features, null for free-form
  featureKey?: string;                // Optional - identifies feature being reviewed
  text?: string;                      // Free-form feedback (sanitized)
  language: string;                   // ISO language code
  appVersion: string;                 // App version at time of feedback
  region?: string;                    // ISO country code
  platform?: 'ios' | 'android' | 'web'; // Platform
  createdAt: Timestamp | FieldValue;
}

// ============================================================================
// FEEDBACK STATE TRACKING
// ============================================================================

/**
 * Tracks when user was last asked for feedback
 * Collection: feedback_state
 * Document ID: userId
 */
export interface FeedbackState {
  userId: string;
  lastNpsShownAt?: Timestamp;                          // Last NPS survey shown
  lastAskedByFeature: Record<string, Timestamp>;       // Feature-specific survey tracking
  npsDeclined?: boolean;                               // User declined NPS survey
  declinedFeatures: string[];                          // Features user declined to review
  updatedAt: Timestamp | FieldValue;
}

// ============================================================================
// AGGREGATED INSIGHTS
// ============================================================================

/**
 * Aggregated feedback insights (internal analytics)
 * Collection: product_feedback_insights
 * Document ID: featureKey (or "overall" for NPS)
 */
export interface ProductFeedbackInsights {
  featureKey: string;                                  // Feature identifier or "overall" for NPS
  avgScore: number;                                    // Average score
  scoreHistogram: Record<number, number>;              // Score distribution (e.g., {1: 5, 2: 10, 3: 20})
  totalResponses: number;                              // Total feedback count
  topLanguages: string[];                              // Top 5 languages by response count
  negativeKeywords: string[];                          // Keywords extracted from negative feedback
  positiveKeywords: string[];                          // Keywords extracted from positive feedback
  responsesByRegion: Record<string, number>;           // Responses per region
  responsesByPlatform: Record<string, number>;         // Responses per platform
  periodStart: string;                                 // YYYY-MM-DD
  periodEnd: string;                                   // YYYY-MM-DD
  updatedAt: Timestamp | FieldValue;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Submit NPS feedback
 */
export interface SubmitNpsFeedbackRequest {
  score: number;           // 0-10
  text?: string;           // Optional comment
  language: string;        // ISO code
  appVersion: string;
  region?: string;
  platform?: 'ios' | 'android' | 'web';
}

export interface SubmitNpsFeedbackResponse {
  success: boolean;
  eventId?: string;
  error?: string;
}

/**
 * Submit feature-specific feedback
 */
export interface SubmitFeatureFeedbackRequest {
  featureKey: string;      // Feature identifier (e.g., 'chat_monetization', 'live_streaming')
  score: number;           // 1-5 rating
  text?: string;           // Optional comment
  language: string;
  appVersion: string;
  region?: string;
  platform?: 'ios' | 'android' | 'web';
}

export interface SubmitFeatureFeedbackResponse {
  success: boolean;
  eventId?: string;
  error?: string;
}

/**
 * Submit free-form feedback
 */
export interface SubmitFreeFormFeedbackRequest {
  text: string;            // Required feedback text
  language: string;
  appVersion: string;
  region?: string;
  platform?: 'ios' | 'android' | 'web';
}

export interface SubmitFreeFormFeedbackResponse {
  success: boolean;
  eventId?: string;
  error?: string;
}

/**
 * Check if should ask for NPS
 */
export interface GetShouldAskForNpsResponse {
  shouldAsk: boolean;
  reason?: string;         // Why not asking (for debugging)
}

/**
 * Check if should ask for feature feedback
 */
export interface GetShouldAskForFeatureFeedbackRequest {
  featureKey: string;
}

export interface GetShouldAskForFeatureFeedbackResponse {
  shouldAsk: boolean;
  reason?: string;
}

/**
 * Mark feedback as declined
 */
export interface DeclineFeedbackRequest {
  type: 'nps' | 'feature';
  featureKey?: string;     // Required if type === 'feature'
}

export interface DeclineFeedbackResponse {
  success: boolean;
}

// ============================================================================
// ADMIN TYPES
// ============================================================================

/**
 * Get feedback insights (admin only)
 */
export interface GetFeedbackInsightsRequest {
  featureKey?: string;     // Specific feature or null for overall NPS
  fromDate?: string;       // YYYY-MM-DD
  toDate?: string;         // YYYY-MM-DD
}

export interface GetFeedbackInsightsResponse {
  success: boolean;
  insights?: ProductFeedbackInsights;
  error?: string;
}

/**
 * Get recent feedback events (admin only)
 */
export interface GetRecentFeedbackRequest {
  eventType?: FeedbackEventType;
  featureKey?: string;
  limit?: number;          // Default 50, max 500
}

export interface GetRecentFeedbackResponse {
  success: boolean;
  events: UserFeedbackEvent[];
  hasMore: boolean;
}

/**
 * Export feedback data (admin only)
 */
export interface ExportFeedbackRequest {
  fromDate: string;        // YYYY-MM-DD
  toDate: string;          // YYYY-MM-DD
  eventType?: FeedbackEventType;
  featureKey?: string;
}

export interface ExportFeedbackResponse {
  success: boolean;
  downloadUrl?: string;    // CSV download URL
  recordCount?: number;
  error?: string;
}

// ============================================================================
// ABUSE DETECTION
// ============================================================================

/**
 * Spam classification result
 */
export interface SpamClassification {
  isSpam: boolean;
  confidence: number;      // 0-1
  reasons: string[];       // Why flagged as spam
}

/**
 * Abuse pattern detection
 */
export interface AbusivePattern {
  userId: string;
  patternType: 'REPETITIVE' | 'INSULTS' | 'IRRELEVANT' | 'BOT_LIKE';
  occurrences: number;
  firstDetectedAt: Timestamp;
  lastDetectedAt: Timestamp;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Feedback timing constants
 */
export const FEEDBACK_TIMING = {
  NPS_COOLDOWN_DAYS: 90,              // Show NPS max once per 90 days
  FEATURE_COOLDOWN_DAYS: 30,          // Show feature survey max once per 30 days
  RATE_LIMIT_PER_DAY: 10,             // Max 10 feedback submissions per day
  RATE_LIMIT_PER_HOUR: 3,             // Max 3 feedback submissions per hour
} as const;

/**
 * Feature keys for surveys
 */
export const FEATURE_KEYS = {
  CHAT_MONETIZATION: 'chat_monetization',
  CALL_MONETIZATION: 'call_monetization',
  LIVE_STREAMING: 'live_streaming',
  DISCOVERY_FEED: 'discovery_feed',
  CREATOR_TOOLS: 'creator_tools',
  SAFETY_FEATURES: 'safety_features',
  SUCCESS_TOOLKIT: 'success_toolkit',
  HELP_CENTER: 'help_center',
  MEMBERSHIP_TIERS: 'membership_tiers',
  CAMPAIGNS: 'campaigns',
} as const;

/**
 * Score ranges
 */
export const SCORE_RANGES = {
  NPS_MIN: 0,
  NPS_MAX: 10,
  FEATURE_MIN: 1,
  FEATURE_MAX: 5,
} as const;

// ============================================================================
// ERROR CODES
// ============================================================================

export enum FeedbackErrorCode {
  INVALID_SCORE = 'feedback/invalid-score',
  RATE_LIMITED = 'feedback/rate-limited',
  SPAM_DETECTED = 'feedback/spam-detected',
  UNAUTHORIZED = 'feedback/unauthorized',
  INVALID_FEATURE_KEY = 'feedback/invalid-feature-key',
  TEXT_TOO_LONG = 'feedback/text-too-long',
  ABUSIVE_CONTENT = 'feedback/abusive-content',
}

/**
 * Custom error class for feedback operations
 */
export class FeedbackError extends Error {
  constructor(
    public code: FeedbackErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'FeedbackError';
  }
}