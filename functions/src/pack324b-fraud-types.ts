/**
 * PACK 324B — Real-Time Fraud Detection & Abuse Signals
 * TypeScript Types and Interfaces
 * 
 * READ-ONLY detection layer - zero tokenomics changes, no auto-bans
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// FRAUD SIGNAL TYPES
// ============================================================================

/**
 * Source of the fraud signal
 */
export type FraudSignalSource = 
  | 'CHAT'
  | 'AI_CHAT'
  | 'AI_VOICE'
  | 'AI_VIDEO'
  | 'CALENDAR'
  | 'EVENT'
  | 'WALLET';

/**
 * Type of fraud/abuse pattern detected
 */
export type FraudSignalType =
  | 'TOKEN_DRAIN_PATTERN'       // Repeated short paid calls < 30s
  | 'MULTI_SESSION_SPAM'        // AI/chat sends to many sessions in parallel
  | 'COPY_PASTE_BEHAVIOR'       // Same reply pasted to 3+ chats
  | 'FAKE_BOOKINGS'             // Event tickets refunded often
  | 'SELF_REFUNDS'              // Many bookings canceled by creator
  | 'PAYOUT_ABUSE'              // Unusual payout attempts
  | 'IDENTITY_MISMATCH'         // Repeated profile fraud reports
  | 'PANIC_RATE_SPIKE';         // Excess panic triggers

/**
 * Severity level (1=lowest, 5=highest)
 */
export type FraudSeverity = 1 | 2 | 3 | 4 | 5;

/**
 * Risk level classification
 */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Fraud Signal Document
 */
export interface FraudSignal {
  id: string;
  userId: string;
  source: FraudSignalSource;
  signalType: FraudSignalType;
  severity: FraudSeverity;
  contextRef: string;           // Reference to chat/call/booking/etc
  metadata?: Record<string, any>; // Additional context data
  createdAt: Timestamp;
}

/**
 * User Risk Score Document
 */
export interface UserRiskScore {
  userId: string;
  riskScore: number;            // 0-100
  level: RiskLevel;
  signalCount: number;          // Total number of signals
  lastSignalType?: FraudSignalType; // Most recent signal type
  lastSignalDate?: Timestamp;   // When last signal was received
  lastUpdatedAt: Timestamp;
}

// ============================================================================
// SIGNAL DETECTION CONTEXT
// ============================================================================

/**
 * Context for detecting TOKEN_DRAIN_PATTERN
 */
export interface TokenDrainContext {
  userId: string;
  sessionId: string;
  sessionType: 'VOICE' | 'VIDEO';
  durationSeconds: number;
  tokensCost: number;
  recentShortSessions: number;  // Count of sessions < 30s in last 24h
}

/**
 * Context for detecting MULTI_SESSION_SPAM
 */
export interface MultiSessionSpamContext {
  userId: string;
  sessionIds: string[];
  messageCount: number;
  timeWindowMinutes: number;
  parallelSessions: number;
}

/**
 * Context for detecting COPY_PASTE_BEHAVIOR
 */
export interface CopyPasteBehaviorContext {
  userId: string;
  messageText: string;
  chatIds: string[];
  matchCount: number;
  timeWindowMinutes: number;
}

/**
 * Context for detecting FAKE_BOOKINGS
 */
export interface FakeBookingsContext {
  userId: string;
  eventId: string;
  refundCount: number;
  totalTickets: number;
  refundRate: number;           // Percentage
}

/**
 * Context for detecting SELF_REFUNDS
 */
export interface SelfRefundsContext {
  userId: string;
  bookingId: string;
  canceledCount: number;
  timeWindowDays: number;
}

/**
 * Context for detecting PAYOUT_ABUSE
 */
export interface PayoutAbuseContext {
  userId: string;
  payoutId: string;
  amount: number;
  attemptCount: number;
  pattern: string;              // Description of unusual pattern
}

/**
 * Context for detecting IDENTITY_MISMATCH
 */
export interface IdentityMismatchContext {
  userId: string;
  reportCount: number;
  reporterIds: string[];
  timeWindowDays: number;
}

/**
 * Context for detecting PANIC_RATE_SPIKE
 */
export interface PanicRateSpikeContext {
  userId: string;
  panicCount: number;
  timeWindowHours: number;
  averageRate: number;          // Platform average
}

// ============================================================================
// SIGNAL EMISSION HELPERS
// ============================================================================

/**
 * Parameters for emitting a fraud signal
 */
export interface EmitSignalParams {
  userId: string;
  source: FraudSignalSource;
  signalType: FraudSignalType;
  severity: FraudSeverity;
  contextRef: string;
  metadata?: Record<string, any>;
}

/**
 * Result of signal emission
 */
export interface EmitSignalResult {
  signalId: string;
  emitted: boolean;
  needsRiskRecalculation: boolean;
}

// ============================================================================
// RISK SCORE CALCULATION
// ============================================================================

/**
 * Severity point mapping
 */
export const SEVERITY_POINTS: Record<FraudSeverity, number> = {
  1: 2,
  2: 5,
  3: 10,
  4: 20,
  5: 40,
};

/**
 * Risk level thresholds
 */
export const RISK_LEVEL_THRESHOLDS = {
  LOW: { min: 0, max: 14 },
  MEDIUM: { min: 15, max: 34 },
  HIGH: { min: 35, max: 69 },
  CRITICAL: { min: 70, max: 100 },
} as const;

/**
 * Signal decay configuration (signals lose weight over time)
 */
export const SIGNAL_DECAY_CONFIG = {
  DECAY_DAYS: 30,               // Signals older than 30 days decay
  DECAY_RATE: 0.5,              // 50% weight reduction per 30 days
  MIN_WEIGHT: 0.1,              // Minimum weight (10%)
} as const;

/**
 * Detection thresholds for various patterns
 */
export const DETECTION_THRESHOLDS = {
  // Token drain: sessions shorter than this are suspicious
  SHORT_SESSION_SECONDS: 30,
  SHORT_SESSION_COUNT_24H: 5,   // 5+ short sessions in 24h
  
  // Multi-session spam: parallel sessions
  PARALLEL_SESSION_COUNT: 3,    // 3+ parallel sessions
  PARALLEL_TIME_WINDOW_MIN: 5,  // Within 5 minutes
  
  // Copy-paste: identical messages
  IDENTICAL_MESSAGE_COUNT: 3,   // Same message to 3+ chats
  COPY_PASTE_TIME_WINDOW_MIN: 10, // Within 10 minutes
  
  // Fake bookings: high refund rate
  MIN_REFUND_COUNT: 3,          // At least 3 refunds
  HIGH_REFUND_RATE: 0.6,        // 60%+ refund rate
  
  // Self refunds: frequent cancellations
  SELF_CANCEL_COUNT: 5,         // 5+ cancellations
  SELF_CANCEL_WINDOW_DAYS: 7,   // Within 7 days
  
  // Payout abuse: rapid attempts
  PAYOUT_ATTEMPT_COUNT: 3,      // 3+ attempts
  PAYOUT_TIME_WINDOW_HOURS: 1,  // Within 1 hour
  
  // Identity mismatch: multiple reports
  IDENTITY_REPORT_COUNT: 3,     // 3+ reports
  IDENTITY_REPORT_WINDOW_DAYS: 30, // Within 30 days
  
  // Panic rate spike: excessive triggers
  PANIC_COUNT_SPIKE: 3,         // 3+ panics
  PANIC_TIME_WINDOW_HOURS: 24,  // Within 24 hours
} as const;

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Fraud signal response for API
 */
export interface FraudSignalResponse {
  id: string;
  userId: string;
  source: FraudSignalSource;
  signalType: FraudSignalType;
  severity: FraudSeverity;
  contextRef: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

/**
 * User risk score response for API
 */
export interface UserRiskScoreResponse {
  userId: string;
  riskScore: number;
  level: RiskLevel;
  signalCount: number;
  lastSignalType?: FraudSignalType;
  lastSignalDate?: Date;
  lastUpdatedAt: Date;
}

/**
 * High risk users list response
 */
export interface HighRiskUsersResponse {
  users: Array<{
    userId: string;
    riskScore: number;
    level: RiskLevel;
    signalCount: number;
    lastSignalType?: FraudSignalType;
    lastSignalDate?: Date;
  }>;
  totalCount: number;
  page: number;
  pageSize: number;
}

/**
 * Fraud signals list response
 */
export interface FraudSignalsListResponse {
  signals: FraudSignalResponse[];
  totalCount: number;
  page: number;
  pageSize: number;
}

/**
 * Fraud dashboard stats
 */
export interface FraudDashboardStats {
  totalSignals24h: number;
  totalSignals7d: number;
  totalSignals30d: number;
  highRiskUsers: number;
  criticalRiskUsers: number;
  signalsByType: Record<FraudSignalType, number>;
  signalsBySource: Record<FraudSignalSource, number>;
  averageRiskScore: number;
}

// ============================================================================
// FILTER TYPES
// ============================================================================

/**
 * Filters for fraud signals query
 */
export interface FraudSignalsFilter {
  userId?: string;
  source?: FraudSignalSource;
  signalType?: FraudSignalType;
  severity?: FraudSeverity;
  minSeverity?: FraudSeverity;
  startDate?: string;           // YYYY-MM-DD
  endDate?: string;             // YYYY-MM-DD
  limit?: number;
  offset?: number;
}

/**
 * Filters for high risk users query
 */
export interface HighRiskUsersFilter {
  level?: RiskLevel;
  minRiskScore?: number;
  maxRiskScore?: number;
  signalType?: FraudSignalType;
  limit?: number;
  offset?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const FRAUD_CONFIG = {
  // Collection names
  COLLECTIONS: {
    FRAUD_SIGNALS: 'fraudSignals',
    USER_RISK_SCORES: 'userRiskScores',
  },
  
  // Risk score recalculation
  RECALC_BATCH_SIZE: 100,
  RECALC_LOOKBACK_DAYS: 90,     // Consider signals from last 90 days
  
  // Cleanup
  SIGNAL_RETENTION_DAYS: 365,   // Keep signals for 1 year
  
  // Pagination
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 200,
} as const;

/**
 * Human-readable labels for signal types
 */
export const SIGNAL_TYPE_LABELS: Record<FraudSignalType, string> = {
  TOKEN_DRAIN_PATTERN: 'Token Drain Pattern',
  MULTI_SESSION_SPAM: 'Multi-Session Spam',
  COPY_PASTE_BEHAVIOR: 'Copy-Paste Behavior',
  FAKE_BOOKINGS: 'Fake Bookings',
  SELF_REFUNDS: 'Self Refunds',
  PAYOUT_ABUSE: 'Payout Abuse',
  IDENTITY_MISMATCH: 'Identity Mismatch',
  PANIC_RATE_SPIKE: 'Panic Rate Spike',
};

/**
 * Human-readable labels for signal sources
 */
export const SIGNAL_SOURCE_LABELS: Record<FraudSignalSource, string> = {
  CHAT: 'Chat',
  AI_CHAT: 'AI Chat',
  AI_VOICE: 'AI Voice',
  AI_VIDEO: 'AI Video',
  CALENDAR: 'Calendar',
  EVENT: 'Event',
  WALLET: 'Wallet',
};

/**
 * Risk level colors for UI
 */
export const RISK_LEVEL_COLORS: Record<RiskLevel, string> = {
  LOW: '#10b981',      // green
  MEDIUM: '#f59e0b',   // amber
  HIGH: '#ef4444',     // red
  CRITICAL: '#7f1d1d', // dark red
};