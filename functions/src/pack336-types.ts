/**
 * PACK 336 — INVESTOR METRICS & POST-LAUNCH GROWTH ENGINE
 * 
 * TypeScript types and interfaces for KPI tracking, cohort analysis,
 * retention curves, virality loops, and revenue intelligence.
 * 
 * This is a read-only analytics layer with NO impact on tokenomics logic.
 */

import type { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// NORTH STAR METRIC
// ============================================================================

/**
 * North Star KPI: Number of Paying Users with ≥2 Paid Interactions per 7 days
 * This filters out curiosity users and measures true engagement + monetization
 */
export interface NorthStarSnapshot {
  date: string; // YYYY-MM-DD
  weeklyPayingUsers: number; // Users with ≥2 paid interactions in last 7 days
  monthlyPayingUsers: number; // Users with ≥2 paid interactions in last 30 days
  avgInteractionsPerUser: number;
  avgRevenuePerUser: number;
  calculatedAt: Timestamp;
}

// ============================================================================
// DAILY GLOBAL KPI
// ============================================================================

export interface KpiDailyGlobal {
  date: string; // YYYY-MM-DD
  
  // User Metrics
  registeredUsersTotal: number;
  verifiedUsersTotal: number;
  activeUsersDAU: number;
  activeUsersWAU: number;
  activeUsersMAU: number;
  
  // Paying User Metrics
  payingUsersDAU: number;
  payingUsersWAU: number;
  payingUsersMAU: number;
  
  // Revenue Metrics
  totalTokenSpent: number;
  totalRevenuePLN: number;
  
  // Refund Metrics
  refundsCount: number;
  refundVolumePLN: number;
  refundRate: number; // refundVolumePLN / totalRevenuePLN
  
  // Calculated at
  calculatedAt: Timestamp;
}

// ============================================================================
// DAILY BY COUNTRY KPI
// ============================================================================

export interface KpiDailyByCountry {
  date: string; // YYYY-MM-DD
  country: string; // ISO 3166-1 alpha-3 code
  
  // Activity Metrics
  usersActive: number;
  newRegistrations: number;
  
  // Revenue Metrics
  payingUsers: number;
  revenuePLN: number;
  
  // Performance Metrics
  avgSpendPerUserPLN: number;
  
  // Calculated at
  calculatedAt: Timestamp;
}

// ============================================================================
// COHORT ANALYSIS
// ============================================================================

export interface KpiCohort {
  cohortId: string; // YYYY-W##
  initialUsers: number;
  
  // Retention Metrics
  day7Retention: number; // Percentage
  day30Retention: number; // Percentage
  day90Retention: number; // Percentage
  
  // Revenue Metrics
  revenueDay7PLN: number;
  revenueDay30PLN: number;
  revenueDay90PLN: number;
  
  // Lifetime Value
  avgLTVPLN: number;
  
  // Created at
  createdAt: Timestamp;
  lastUpdatedAt: Timestamp;
}

// ============================================================================
// USER LIFECYCLE
// ============================================================================

export interface KpiUserLifecycle {
  userId: string;
  
  // Lifecycle Events
  firstSeenAt: Timestamp;
  firstPaymentAt?: Timestamp;
  churnedAt?: Timestamp;
  
  // Spending Metrics
  lifetimeTokenSpent: number;
  lifetimeRevenuePLN: number;
  
  // Activity Metrics
  totalChatsPaid: number;
  totalBookings: number;
  totalEvents: number;
  totalCalls: number;
  
  // Last Updated
  lastUpdatedAt: Timestamp;
}

// ============================================================================
// VIRALITY METRICS
// ============================================================================

export interface KpiVirality {
  date: string; // YYYY-MM-DD
  
  // Invitation Metrics
  invitedUsers: number;
  activatedFromInvite: number;
  
  // K-Factor (avg number of new users per inviter)
  kFactor: number;
  
  // Viral Revenue
  viralRevenuePLN: number;
  
  // Calculated at
  calculatedAt: Timestamp;
}

// ============================================================================
// REVENUE STREAMS
// ============================================================================

export interface KpiRevenueStreams {
  date: string; // YYYY-MM-DD
  
  // Chat Revenue
  chatRevenuePLN: number;
  
  // Voice & Video Revenue
  voiceRevenuePLN: number;
  videoRevenuePLN: number;
  
  // Calendar & Events Revenue
  calendarRevenuePLN: number;
  eventsRevenuePLN: number;
  
  // AI & Other Revenue
  aiRevenuePLN: number;
  subscriptionsPLN: number;
  tipsRevenuePLN: number;
  
  // Total
  totalRevenuePLN: number;
  
  // Calculated at
  calculatedAt: Timestamp;
}

// ============================================================================
// GROWTH EXPERIMENTS
// ============================================================================

export type ExperimentResult = 'WIN' | 'LOSE' | 'INCONCLUSIVE';

export interface KpiExperiment {
  id: string;
  title: string;
  hypothesis: string;
  
  // Timeline
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  
  // Metrics
  controlMetric: string;
  targetMetric: string;
  
  // Results
  result?: ExperimentResult;
  deltaPercent?: number;
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

// ============================================================================
// ALERTING
// ============================================================================

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface KpiAlert {
  id: string;
  type: string; // 'refund_spike', 'dau_drop', 'payment_failure', 'token_velocity_spike'
  severity: AlertSeverity;
  
  // Details
  title: string;
  message: string;
  currentValue: number;
  threshold: number;
  
  // Status
  status: AlertStatus;
  acknowledgedBy?: string;
  acknowledgedAt?: Timestamp;
  resolvedAt?: Timestamp;
  
  // Metadata
  createdAt: Timestamp;
  metadata?: Record<string, any>;
}

// ============================================================================
// INVESTOR EXPORT
// ============================================================================

export interface InvestorReportData {
  reportId: string;
  generatedAt: Timestamp;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  
  // Summary
  summary: {
    totalUsers: number;
    activeUsers: number;
    payingUsers: number;
    totalRevenuePLN: number;
    avgRevenuePerUser: number;
  };
  
  // Revenue Breakdown
  revenueByStream: Record<string, number>;
  
  // Cohort Performance
  cohortData: Array<{
    cohort: string;
    retention: number;
    revenue: number;
  }>;
  
  // Country Breakdown
  countryBreakdown: Array<{
    country: string;
    users: number;
    revenue: number;
  }>;
  
  // Growth Metrics
  growthMetrics: {
    userGrowthPercent: number;
    revenueGrowthPercent: number;
    kFactor: number;
  };
}

// ============================================================================
// HELPER TYPES
// ============================================================================

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export interface KpiAggregationOptions {
  date?: string; // YYYY-MM-DD, defaults to yesterday
  forceRecalculation?: boolean;
}

export interface AlertThresholds {
  refundVolumePercent: number; // Default: 4%
  dauDropPercent: number; // Default: 25%
  paymentSuccessRatePercent: number; // Default: 92%
  tokenVelocitySpikePercent: number; // Default: 300%
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface KpiApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface KpiDashboardData {
  northStar: NorthStarSnapshot;
  dailyGlobal: KpiDailyGlobal;
  revenueStreams: KpiRevenueStreams;
  alerts: KpiAlert[];
  lastUpdated: Timestamp;
}

export interface ExportOptions {
  format: 'PDF' | 'CSV' | 'GOOGLE_SHEETS';
  periodDays: 30 | 90 | 180;
  includeCountryBreakdown?: boolean;
  includeCohortAnalysis?: boolean;
}