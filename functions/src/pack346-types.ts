/**
 * PACK 346 — Post-Launch KPI Engine Types
 * Global Analytics · Revenue Control · Safety Intelligence · Churn & Fraud Monitoring
 */

import { Timestamp, FieldValue } from "firebase-admin/firestore";

// ============================================================================
// 1. GLOBAL KPI STREAMS
// ============================================================================

export interface DailyKPI {
  date: string; // YYYY-MM-DD format

  users: {
    newUsers: number;
    verifiedUsers: number;
    activeUsers: number;
    payingUsers: number;
    churnedUsers: number;
  };

  revenue: {
    tokenSalesPLN: number;
    chatRevenuePLN: number;
    voiceRevenuePLN: number;
    videoRevenuePLN: number;
    calendarRevenuePLN: number;
    eventsRevenuePLN: number;
    tipsRevenuePLN: number;
    totalRevenuePLN: number;
  };

  platformEarnings: {
    chat35: number; // 35% of chat revenue
    calendar20: number; // 20% of calendar revenue
    events20: number; // 20% of events revenue
    tips10: number; // 10% of tips revenue
    totalAvaloPLN: number;
  };

  refunds: {
    chatWordRefunds: number;
    calendarUserCancelRefunds: number;
    calendarCreatorCancelRefunds: number;
    mismatchRefunds: number;
  };

  safety: {
    panicTriggers: number;
    selfieMismatchReports: number;
    moderationFlags: number;
    bannedUsers: number;
  };

  ai: {
    aiChats: number;
    aiCalls: number;
    aiRevenuePLN: number;
    aiAbuseFlags: number;
  };

  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

// ============================================================================
// 2. ABUSE & FRAUD DETECTION
// ============================================================================

export type AbuseSignalType =
  | "refund_loop" // Rapid token drain loops
  | "panic_spam" // Panic button false positives
  | "fake_mismatch" // Repeated mismatch selfie claims
  | "bot_swipe" // Bot-like swipe/chat behaviour
  | "ai_exploit" // AI prompt abuse
  | "refund_abuse" // Mass refunds abuse
  | "cancel_farming" // Creator cancellation farming
  | "token_drain" // Suspicious token drainage pattern
  | "fake_engagement"; // Fake engagement metrics

export type AbuseSignalSeverity = "low" | "medium" | "high" | "critical";

export type AbuseAutoAction =
  | "rate_limit"
  | "shadow_ban"
  | "freeze_wallet"
  | "manual_review"
  | "auto_ban"
  | "warning";

export interface AbuseSignal {
  id?: string;
  userId?: string;
  creatorId?: string;
  type: AbuseSignalType;
  severity: AbuseSignalSeverity;
  detectedAt: Timestamp | FieldValue;
  autoAction?: AbuseAutoAction;
  resolved: boolean;
  resolvedAt?: Timestamp;
  resolvedBy?: string; // Admin ID
  notes?: string;
  metadata?: {
    count?: number; // How many times detected
    timeframeHours?: number;
    affectedUsers?: string[];
    estimatedLoss?: number; // PLN
    pattern?: string;
  };
}

// ============================================================================
// 3. CREATOR PERFORMANCE METRICS
// ============================================================================

export interface CreatorKPI {
  creatorId: string;

  // Engagement metrics
  totalChats: number;
  totalCalls: number;
  totalCalendar: number;
  totalEvents: number;

  // Financial metrics
  earningsPLN: number;
  tipsReceivedPLN: number;
  tokensEarned: number;

  // Quality metrics
  refundRate: number; // Percentage (0-100)
  cancelRate: number; // Percentage (0-100)
  avgResponseTimeSec: number;
  completionRate: number; // Percentage (0-100)

  // Safety metrics
  panicRate: number; // Percentage (0-100)
  mismatchRate: number; // Percentage (0-100)
  reportCount: number;

  // Reputation
  rating: number; // 0-5
  reviewCount: number;
  responseRate: number; // Percentage (0-100)

  // Eligibility flags
  royalEligible: boolean;
  verified: boolean;
  premiumUnlocked: boolean;

  // Time metrics
  lastActiveAt: Timestamp | FieldValue;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

// ============================================================================
// 4. CHURN INTELLIGENCE
// ============================================================================

export type ChurnCause =
  | "empty_discovery" // No matches found
  | "low_response_quality" // Poor chat quality
  | "refund_frustration" // Multiple refund issues
  | "safety_distrust" // Safety concerns
  | "price_sensitivity" // Too expensive
  | "no_engagement" // No activity
  | "technical_issues" // App problems
  | "competition" // Left for competitor
  | "unknown"; // Unable to determine

export interface ChurnRecord {
  userId: string;
  
  // Activity tracking
  lastActivity: Timestamp;
  lastRefund?: Timestamp;
  lastPanic?: Timestamp;
  lastBlockedUser?: Timestamp;
  lastCalendarCancel?: Timestamp;
  lastChatExpiration?: Timestamp;

  // Churn analysis
  churnedAt?: Timestamp;
  churnCause?: ChurnCause;
  churnScore: number; // 0-100, higher = more likely to churn
  daysInactive: number;

  // User behavior patterns
  totalSessions: number;
  avgSessionDuration: number; // seconds
  totalSpent: number; // PLN
  totalRefunds: number;
  engagementScore: number; // 0-100

  // Intervention attempts
  retentionAttemptsCount: number;
  lastRetentionAttempt?: Timestamp;

  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

// ============================================================================
// 5. REAL-TIME ALERTING
// ============================================================================

export type AlertType =
  | "refund_spike" // Refunds > threshold
  | "panic_spike" // Panic triggers > threshold
  | "mismatch_spike" // Mismatch reports > threshold
  | "payout_abuse" // Suspicious payout pattern
  | "ai_misuse" // AI abuse detected
  | "payment_failure" // Stripe/IAP failure
  | "system_error" // Critical system error
  | "revenue_drop" // Significant revenue drop
  | "churn_spike"; // Abnormal churn rate

export type AlertSeverity = "info" | "warning" | "critical" | "emergency";

export type AlertChannel = "admin_dashboard" | "slack" | "email" | "push";

export interface Alert {
  id?: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  
  // Context
  metric?: string;
  currentValue?: number;
  threshold?: number;
  region?: string;
  
  // Routing
  channels: AlertChannel[];
  sentAt?: Timestamp;
  acknowledgedAt?: Timestamp;
  acknowledgedBy?: string; // Admin ID
  resolvedAt?: Timestamp;
  
  // Metadata
  metadata?: Record<string, any>;
  createdAt: Timestamp | FieldValue;
}

// ============================================================================
// 6. THRESHOLD CONFIGURATION
// ============================================================================

export interface KPIThreshold {
  region: string; // 'global' or country code
  
  // Refund thresholds
  dailyRefundRatePercent: number; // Trigger alert if exceeded
  maxRefundsPerUser: number; // Per day
  maxRefundsPerCreator: number; // Per day
  
  // Safety thresholds
  panicTriggerThreshold: number; // Per day
  mismatchReportThreshold: number; // Per day per creator
  
  // Abuse detection
  tokenDrainVelocity: number; // Tokens per hour
  suspiciousCancellationRate: number; // Percentage
  
  // Performance
  minCreatorResponseTimeSec: number;
  minCreatorCompletionRate: number; // Percentage
  
  // Revenue
  minDailyRevenuePLN: number; // Alert if below
  maxRevenueDropPercent: number; // Day over day
  
  updatedAt: Timestamp | FieldValue;
}

// ============================================================================
// 7. AGGREGATED METRICS (for BigQuery export)
// ============================================================================

export interface HourlyMetrics {
  timestamp: Timestamp;
  hour: string; // YYYY-MM-DD-HH format
  
  activeUsers: number;
  newChats: number;
  newCalls: number;
  newCalendarBookings: number;
  
  revenuePLN: number;
  refundsPLN: number;
  
  panicTriggers: number;
  moderationFlags: number;
  
  aiInteractions: number;
}

// ============================================================================
// 8. DASHBOARD DATA STRUCTURES
// ============================================================================

export interface KPIDashboardData {
  date: string;
  daily: DailyKPI;
  hourly: HourlyMetrics[];
  
  topCreators: Array<{
    creatorId: string;
    earnings: number;
    rating: number;
  }>;
  
  activeAlerts: Alert[];
  recentAbuseSignals: AbuseSignal[];
  
  churnAnalysis: {
    totalChurned: number;
    causes: Record<ChurnCause, number>;
    avgDaysToChurn: number;
  };
}

// ============================================================================
// 9. EXPORT TYPES
// ============================================================================

export interface BigQueryExport {
  exportId: string;
  dataType: "daily_kpi" | "abuse_signals" | "creator_kpi" | "churn";
  dateRange: {
    start: string;
    end: string;
  };
  exportedAt: Timestamp;
  recordCount: number;
  status: "pending" | "completed" | "failed";
  error?: string;
}
