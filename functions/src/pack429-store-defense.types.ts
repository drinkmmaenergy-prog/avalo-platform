/**
 * PACK 429 — App Store Defense, Reviews, Reputation & Trust Engine
 * Type definitions for store defense, review mirroring, and trust scoring
 */

import { Timestamp } from 'firebase-admin/firestore';
import { admin, timestamp } from './runtime';

// ============================================================================
// ENUMS
// ============================================================================

export enum Platform {
  IOS = 'IOS',
  ANDROID = 'ANDROID',
}

export enum ReviewSentiment {
  POSITIVE = 'POSITIVE',
  NEUTRAL = 'NEUTRAL',
  NEGATIVE = 'NEGATIVE',
}

export type DefenseEventType = 'SPIKE' | 'BOT_ATTACK' | 'SABOTAGE' | 'RECOVERY';
export const DefenseEventType = {
  SPIKE: 'SPIKE' as DefenseEventType,
  BOT_ATTACK: 'BOT_ATTACK' as DefenseEventType,
  SABOTAGE: 'SABOTAGE' as DefenseEventType,
  RECOVERY: 'RECOVERY' as DefenseEventType,
};

export type EventSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export const EventSeverity = {
  LOW: 'LOW' as EventSeverity,
  MEDIUM: 'MEDIUM' as EventSeverity,
  HIGH: 'HIGH' as EventSeverity,
  CRITICAL: 'CRITICAL' as EventSeverity,
};

export type TriggerSource = 'reviews' | 'fraud' | 'social' | 'press' | 'REVIEWS' | 'FRAUD' | 'SOCIAL' | 'PRESS';
export const TriggerSource = {
  REVIEWS: 'REVIEWS' as TriggerSource,
  FRAUD: 'FRAUD' as TriggerSource,
  SOCIAL: 'SOCIAL' as TriggerSource,
  PRESS: 'PRESS' as TriggerSource,
};

// ============================================================================
// STORE REVIEWS MIRROR
// ============================================================================

export interface StoreReviewMirror {
  id: string;
  platform: Platform;
  rating: 1 | 2 | 3 | 4 | 5;
  text: string;
  language: string;
  region: string;
  userLinked?: string; // Optional userId if we can correlate
  detectedSentiment: ReviewSentiment;
  isAttackPattern: boolean;
  reviewDate?: Timestamp; // Original review date from store
  importedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

// ============================================================================
// STORE DEFENSE EVENTS
// ============================================================================

export interface StoreDefenseEvent {
  id: string;
  type: DefenseEventType;
  platform: Platform;
  region: string;
  severity: EventSeverity;
  triggerSource: TriggerSource;
  description: string;
  metadata: {
    affectedReviews?: number;
    detectedPatterns?: string[];
    correlatedFraudEvents?: string[];
    correlatedUserIds?: string[];
    [key: string]: any;
  };
  resolved: boolean;
  resolvedAt?: Timestamp;
  resolvedBy?: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

// ============================================================================
// TRUST SIGNALS
// ============================================================================

export interface TrustSignals {
  avgRatingIOS: number;
  avgRatingAndroid: number;
  totalReviews: number;
  weeklyTrend: number; // Positive or negative change
  trustScore: number; // 0-100
  lastCalculated: Timestamp;
  
  // Additional metrics for trust score calculation
  verificationRate: number; // % of verified users
  safetyResolutionSpeed: number; // Hours average
  fraudRate: number; // % of transactions
  refundDisputeRate: number;
  calendarNoShowRate: number;
  
  // Platform-specific breakdowns
  iosData: {
    rating: number;
    reviewCount: number;
    positiveReviews: number;
    negativeReviews: number;
  };
  androidData: {
    rating: number;
    reviewCount: number;
    positiveReviews: number;
    negativeReviews: number;
  };
  
  updatedAt: Timestamp;
}

// ============================================================================
// REVIEW RECOVERY PROMPTS
// ============================================================================

export interface ReviewRecoveryPrompt {
  id: string;
  userId: string;
  trigger: 'CHAT_SUCCESS' | 'CALENDAR_SUCCESS' | 'PAYOUT_SUCCESS' | 'SAFETY_RESOLVED';
  platform: Platform;
  region: string;
  language: string;
  
  // Status tracking
  prompted: boolean;
  promptedAt?: Timestamp;
  responded: boolean;
  respondedAt?: Timestamp;
  leftReview: boolean; // User confirmed they left a review
  
  // Eligibility checks
  eligible: boolean;
  ineligibilityReasons?: string[];
  
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

// ============================================================================
// CRISIS MODE
// ============================================================================

export interface CrisisMode {
  active: boolean;
  activatedAt?: Timestamp;
  activatedBy: string; // userId or 'SYSTEM'
  activationType: 'MANUAL' | 'AUTOMATIC';
  
  trigger?: {
    eventId: string;
    eventType: DefenseEventType;
    severity: EventSeverity;
  };
  
  // Crisis configuration
  config: {
    disableAggressivePrompts: boolean;
    disableRiskyExperiments: boolean;
    increaseSafetyVisibility: boolean;
    forceExtraRecoveryPrompts: boolean;
    maxRecoveryPromptsPerDay: number;
  };
  
  deactivatedAt?: Timestamp;
  deactivatedBy?: string;
  
  // Post-mortem data
  impactAnalysis?: {
    ratingChange: number;
    reviewCount: number;
    recoveryActions: number;
    [key: string]: any;
  };
  
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

// ============================================================================
// ATTACK PATTERN DETECTION
// ============================================================================

export interface AttackPattern {
  type: 'PHRASE_REPETITION' | 'REGION_CONCENTRATION' | 'FRESH_ACCOUNTS' | 'RATING_SPIKE';
  detected: boolean;
  confidence: number; // 0-1
  evidence: {
    sampleReviews?: string[];
    affectedRegions?: string[];
    timePeriod?: {
      start: Timestamp;
      end: Timestamp;
    };
    [key: string]: any;
  };
}

export interface ReviewAnalysis {
  reviewId: string;
  suspicionScore: number; // 0-1, higher = more suspicious
  patterns: AttackPattern[];
  recommendedAction: 'MONITOR' | 'FLAG' | 'ESCALATE';
}

// ============================================================================
// ADMIN OPERATIONS
// ============================================================================

export interface ReviewImportRequest {
  platform: Platform;
  reviews: Array<{
    externalId?: string;
    rating: 1 | 2 | 3 | 4 | 5;
    text: string;
    language?: string;
    region?: string;
    reviewDate?: Date | Timestamp;
  }>;
  importedBy: string; // Admin userId
}

export interface ReviewImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors?: string[];
  eventId?: string; // Defense event created if attack detected
}

// ============================================================================
// TRUST SCORE CALCULATION INPUTS
// ============================================================================

export interface TrustScoreInputs {
  // Store ratings (weighted heavily)
  avgRatingIOS: number;
  avgRatingAndroid: number;
  totalReviews: number;
  
  // User verification
  totalUsers: number;
  verifiedUsers: number;
  
  // Safety metrics
  safetyTickets: number;
  safetyTicketsResolved: number;
  avgResolutionTimeHours: number;
  
  // Fraud metrics
  totalTransactions: number;
  fraudulentTransactions: number;
  
  // Refund metrics
  totalPayouts: number;
  disputedPayouts: number;
  
  // Calendar metrics
  totalMeetings: number;
  noShowMeetings: number;
}

// ============================================================================
// API RESPONSES
// ============================================================================

export interface TrustScorePublicResponse {
  trustScore: number;
  tier: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'NEEDS_IMPROVEMENT';
  badge: string; // Display text
  lastUpdated: string; // ISO timestamp
}

export interface StoreDefenseDashboard {
  currentScore: number;
  trend: 'UP' | 'DOWN' | 'STABLE';
  
  ratings: {
    ios: {
      current: number;
      change7d: number;
      reviewCount: number;
    };
    android: {
      current: number;
      change7d: number;
      reviewCount: number;
    };
  };
  
  recentEvents: StoreDefenseEvent[];
  activeAlerts: number;
  crisisMode: boolean;
  
  recoveryMetrics: {
    promptsSent7d: number;
    responsesReceived7d: number;
    conversionRate: number;
  };
}
