/**
 * PACK 324C — Creator Performance Ranking & Trust Score
 * TypeScript Types and Interfaces
 * 
 * READ-ONLY ranking layer - zero tokenomics changes
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// TRUST SCORE TYPES
// ============================================================================

/**
 * Trust score level classification
 */
export type TrustLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'ELITE';

/**
 * Creator Trust Score Document
 */
export interface CreatorTrustScore {
  userId: string;
  
  // Overall trust score (0-100)
  trustScore: number;
  level: TrustLevel;
  
  // Component scores (0-100 each)
  qualityScore: number;      // Calls completed, chat quality, refunds ratio
  reliabilityScore: number;  // No-shows, cancellations
  safetyScore: number;       // Reports, flags
  payoutScore: number;       // Payout integrity
  
  lastUpdatedAt: Timestamp;
}

/**
 * Creator Rankings Daily Document
 */
export interface CreatorRankingDaily {
  date: string; // YYYY-MM-DD
  userId: string;
  
  // Performance metrics from PACK 324A
  totalEarnedTokens: number;
  totalSessions: number;
  totalCallsMinutes: number;
  averageRating: number;
  
  // Trust score from this pack
  trustScore: number;
  
  // Ranking position (1 = best)
  rankPosition: number;
  
  createdAt: Timestamp;
}

// ============================================================================
// TRUST SCORE CALCULATION CONTEXT
// ============================================================================

/**
 * Input data for trust score calculation
 */
export interface TrustScoreInputs {
  userId: string;
  
  // From PACK 324A - Creator KPI
  totalEarnedTokens: number;
  totalSessions: number;
  completedCalls: number;
  averageRating: number;
  refundCount: number;
  totalTransactions: number;
  
  // From PACK 324B - Fraud signals
  riskScore: number;
  riskLevel: string;
  fraudSignalCount: number;
  
  // From moderation
  warningsCount: number;
  bansCount: number;
  
  // From bookings/calendar
  canceledByCreator: number;
  noShowCount: number;
  totalBookings: number;
  
  // From payouts
  payoutAttempts: number;
  payoutFailures: number;
  payoutDisputes: number;
}

/**
 * Quality score calculation factors
 */
export interface QualityScoreFactors {
  completionRate: number;    // Calls completed vs started
  averageRating: number;     // User ratings
  refundRate: number;        // Refunds vs transactions
  sessionVolume: number;     // Total sessions (normalized)
}

/**
 * Reliability score calculation factors
 */
export interface ReliabilityScoreFactors {
  cancelationRate: number;   // Canceled by creator vs total bookings
  noShowRate: number;        // No-shows vs bookings
  consistencyScore: number;  // Regular activity pattern
}

/**
 * Safety score calculation factors
 */
export interface SafetyScoreFactors {
  riskLevel: string;         // From PACK 324B
  riskScore: number;         // 0-100 from PACK 324B
  fraudSignals: number;      // Count of fraud signals
  moderationActions: number; // Warnings + bans
}

/**
 * Payout score calculation factors
 */
export interface PayoutScoreFactors {
  payoutSuccessRate: number; // Successful vs failed payouts
  disputeRate: number;       // Disputes vs attempts
  integrityScore: number;    // No payout abuse patterns
}

// ============================================================================
// TRUST LEVEL THRESHOLDS
// ============================================================================

export const TRUST_LEVEL_THRESHOLDS = {
  LOW: { min: 0, max: 24 },
  MEDIUM: { min: 25, max: 54 },
  HIGH: { min: 55, max: 84 },
  ELITE: { min: 85, max: 100 },
} as const;

// ============================================================================
// SCORING WEIGHTS
// ============================================================================

/**
 * Component weights for overall trust score
 */
export const TRUST_SCORE_WEIGHTS = {
  QUALITY: 0.35,      // 35% - Most important for user experience
  RELIABILITY: 0.30,  // 30% - Consistency matters
  SAFETY: 0.25,       // 25% - Platform integrity
  PAYOUT: 0.10,       // 10% - Financial integrity
} as const;

/**
 * Minimum thresholds for ELITE status
 */
export const ELITE_REQUIREMENTS = {
  MIN_SESSIONS: 50,           // At least 50 sessions
  MIN_TRUST_SCORE: 85,        // 85+ trust score
  MAX_REFUND_RATE: 0.05,      // Less than 5% refunds
  MIN_RATING: 4.5,            // 4.5+ average rating
  MAX_RISK_SCORE: 20,         // Low risk score from PACK 324B
} as const;

// ============================================================================
// RANKING CALCULATION
// ============================================================================

/**
 * Ranking criteria weights
 */
export const RANKING_WEIGHTS = {
  TRUST_SCORE: 0.50,          // 50% - Trust is primary
  EARNINGS: 0.25,             // 25% - Revenue contribution
  SESSION_VOLUME: 0.15,       // 15% - Activity level
  RATING: 0.10,               // 10% - User satisfaction
} as const;

/**
 * Minimum requirements for ranking inclusion
 */
export const RANKING_REQUIREMENTS = {
  MIN_SESSIONS: 5,            // At least 5 sessions in period
  MIN_TRUST_SCORE: 25,        // At least MEDIUM trust level
} as const;

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Trust score response for API
 */
export interface TrustScoreResponse {
  userId: string;
  trustScore: number;
  level: TrustLevel;
  scores: {
    quality: number;
    reliability: number;
    safety: number;
    payout: number;
  };
  lastUpdated: Date;
}

/**
 * Creator ranking response for API
 */
export interface CreatorRankingResponse {
  date: string;
  userId: string;
  rankPosition: number;
  trustScore: number;
  performance: {
    earnedTokens: number;
    sessions: number;
    callsMinutes: number;
    rating: number;
  };
}

/**
 * Top creators list response
 */
export interface TopCreatorsResponse {
  date: string;
  creators: CreatorRankingResponse[];
  totalCount: number;
}

/**
 * Trust score history response
 */
export interface TrustScoreHistoryResponse {
  userId: string;
  history: Array<{
    date: string;
    trustScore: number;
    level: TrustLevel;
  }>;
}

/**
 * Ranking dashboard stats
 */
export interface RankingDashboardStats {
  totalCreators: number;
  eliteCreators: number;
  highTrustCreators: number;
  mediumTrustCreators: number;
  lowTrustCreators: number;
  averageTrustScore: number;
  topEarners: number;
}

// ============================================================================
// FILTER TYPES
// ============================================================================

/**
 * Filters for creator rankings query
 */
export interface CreatorRankingsFilter {
  date?: string;              // YYYY-MM-DD
  level?: TrustLevel;
  minTrustScore?: number;
  minEarnings?: number;
  limit?: number;
  offset?: number;
}

/**
 * Filters for trust scores query
 */
export interface TrustScoresFilter {
  level?: TrustLevel;
  minScore?: number;
  maxScore?: number;
  limit?: number;
  offset?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const TRUST_CONFIG = {
  // Collection names
  COLLECTIONS: {
    TRUST_SCORES: 'creatorTrustScores',
    RANKINGS_DAILY: 'creatorRankingsDaily',
  },
  
  // Calculation schedule
  RECALC_LOOKBACK_DAYS: 30,   // Consider last 30 days of data
  RANKING_TOP_COUNT: 100,      // Track top 100 creators
  
  // Pagination
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 200,
  
  // Data retention
  RANKING_RETENTION_DAYS: 365, // Keep rankings for 1 year
} as const;

/**
 * Human-readable labels for trust levels
 */
export const TRUST_LEVEL_LABELS: Record<TrustLevel, string> = {
  LOW: 'Low Trust',
  MEDIUM: 'Medium Trust',
  HIGH: 'High Trust',
  ELITE: 'Elite Creator',
};

/**
 * Trust level colors for UI
 */
export const TRUST_LEVEL_COLORS: Record<TrustLevel, string> = {
  LOW: '#ef4444',      // red
  MEDIUM: '#f59e0b',   // amber
  HIGH: '#10b981',     // green
  ELITE: '#8b5cf6',    // purple
};

/**
 * Trust level badge icons
 */
export const TRUST_LEVEL_BADGES: Record<TrustLevel, string> = {
  LOW: '⚠️',
  MEDIUM: '✓',
  HIGH: '⭐',
  ELITE: '👑',
};