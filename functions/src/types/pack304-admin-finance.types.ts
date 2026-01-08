/**
 * PACK 304 — Admin Financial Console & Reconciliation
 * Type Definitions
 * 
 * @package avaloapp
 * @version 1.0.0
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// ADMIN ROLES
// ============================================================================

export type AdminRole = 'VIEWER' | 'MODERATOR' | 'RISK' | 'FINANCE' | 'SUPERADMIN';

export interface AdminUser {
  adminId: string;
  email: string;
  role: AdminRole;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

// ============================================================================
// PLATFORM FINANCE MONTHLY AGGREGATION
// ============================================================================

/**
 * Monthly aggregated platform financial data
 * Document ID: {year}_{month} (e.g., "2025_01")
 */
export interface PlatformFinanceMonthly {
  year: number;
  month: number;

  // Gross Merchandise Value (GMV)
  gmvTokens: number;           // Total tokens spent on monetized features
  gmvFiatPLN: number;           // GMV in PLN (gmvTokens * 0.20)

  // Revenue Split
  totalCreatorShareTokens: number;  // Total tokens going to creators
  totalAvaloShareTokens: number;    // Total tokens going to Avalo (fees)

  // Token Purchases (Revenue In)
  totalTokenPurchasesTokens: number;    // Sum of TOKEN_PURCHASE transactions
  totalTokenPurchasesFiatPLN: number;   // True revenue from sales

  // Payouts (Cash Outflows)
  totalPayoutTokens: number;        // Tokens paid out to creators
  totalPayoutFiatPLN: number;       // Fiat equivalent paid out
  totalPayoutTransactions: number;  // Number of payout transactions

  // Outstanding Liability
  outstandingCreatorLiabilityTokens: number;  // Tokens earned but not paid out
  outstandingCreatorLiabilityFiatPLN: number; // Fiat equivalent

  // Breakdown by Feature
  feesFromChatTokens: number;
  feesFromCallsTokens: number;
  feesFromCalendarTokens: number;
  feesFromEventsTokens: number;
  feesFromOtherTokens: number;

  // Refunds
  refundsTokens: number;        // Total tokens refunded to payers
  netRevenueTokens: number;     // Avalo fees minus refund adjustments

  // Metadata
  generatedAt: string;  // ISO_DATETIME
  updatedAt: string;    // ISO_DATETIME
}

// ============================================================================
// FINANCE ANOMALIES
// ============================================================================

export type FinanceAnomalyType =
  | 'NEGATIVE_BALANCE'
  | 'MISMATCH_BALANCE'
  | 'INVALID_SPLIT'
  | 'PAYOUT_GREATER_THAN_EARNINGS'
  | 'REFUND_INCONSISTENT'
  | 'OTHER';

export type FinanceAnomalyStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED';

export interface FinanceAnomaly {
  anomalyId: string;
  type: FinanceAnomalyType;
  
  userId: string | null;  // User affected (null for platform-level anomalies)
  period: {
    year: number;
    month: number;
  } | null;
  
  details: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  createdAt: string;  // ISO_DATETIME
  
  status: FinanceAnomalyStatus;
  resolvedByAdminId: string | null;
  resolvedAt: string | null;  // ISO_DATETIME
  resolutionNote: string | null;
  
  metadata?: Record<string, any>;
}

// ============================================================================
// USER-LEVEL RECONCILIATION
// ============================================================================

export interface UserFinancialSummary {
  userId: string;
  
  // Token Movement
  tokensPurchased: number;      // Total tokens purchased
  tokensEarned: number;         // Total tokens earned from services
  tokensSpent: number;          // Total tokens spent on services
  tokensRefunded: number;       // Total tokens refunded (returns to balance)
  tokensWithdrawn: number;      // Total tokens withdrawn (payouts)
  
  // Balance Check
  walletBalance: number;        // Current balance from wallet
  expectedBalance: number;      // Calculated: purchased + earned - spent - refunded - withdrawn
  balanceDiscrepancy: number;   // walletBalance - expectedBalance
  
  // Status
  hasDiscrepancy: boolean;
  discrepancyThreshold: number; // Acceptable tolerance (e.g., 0.01 tokens)
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

// Get Monthly Overview
export interface GetMonthlyOverviewRequest {
  year: number;
  month: number;
}

export interface GetMonthlyOverviewResponse {
  success: boolean;
  data?: PlatformFinanceMonthly;
  error?: string;
}

// Get User Financial Summary
export interface GetUserFinancialSummaryRequest {
  userId: string;
}

export interface GetUserFinancialSummaryResponse {
  success: boolean;
  data?: UserFinancialSummary;
  error?: string;
}

// List Anomalies
export interface ListAnomaliesRequest {
  type?: FinanceAnomalyType;
  status?: FinanceAnomalyStatus;
  userId?: string;
  limit?: number;
  startAfter?: string;  // anomalyId for pagination
}

export interface ListAnomaliesResponse {
  success: boolean;
  anomalies?: FinanceAnomaly[];
  hasMore?: boolean;
  error?: string;
}

// Update Anomaly Status
export interface UpdateAnomalyStatusRequest {
  anomalyId: string;
  status: FinanceAnomalyStatus;
  resolutionNote?: string;
}

export interface UpdateAnomalyStatusResponse {
  success: boolean;
  error?: string;
}

// Export Monthly Finance
export interface ExportMonthlyFinanceRequest {
  year: number;
  month: number;
  format: 'csv' | 'json';
}

export interface ExportMonthlyFinanceResponse {
  success: boolean;
  downloadUrl?: string;
  error?: string;
}

// Export Creator Summary
export interface ExportCreatorSummaryRequest {
  year: number;
  month: number;
  format: 'csv' | 'json';
}

export interface ExportCreatorSummaryResponse {
  success: boolean;
  downloadUrl?: string;
  error?: string;
}

// ============================================================================
// AGGREGATION TYPES
// ============================================================================

export interface MonthlyAggregationInput {
  year: number;
  month: number;
  forceRecalculation?: boolean;
}

export interface MonthlyAggregationResult {
  success: boolean;
  data?: PlatformFinanceMonthly;
  error?: string;
  processingTimeMs?: number;
}

// ============================================================================
// ANOMALY DETECTION TYPES
// ============================================================================

export interface AnomalyDetectionInput {
  userId?: string;  // If null, check platform-level
  year?: number;
  month?: number;
}

export interface AnomalyDetectionResult {
  success: boolean;
  anomaliesFound: number;
  anomalies?: FinanceAnomaly[];
  error?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const FINANCE_CONSTANTS = {
  // Tokenomics (read-only, from PACK 289)
  PAYOUT_RATE_PLN_PER_TOKEN: 0.20,
  
  // Revenue Splits (read-only, from existing packs)
  SPLIT_CHAT_CREATOR: 0.65,
  SPLIT_CHAT_AVALO: 0.35,
  SPLIT_CALLS_CREATOR: 0.80,
  SPLIT_CALLS_AVALO: 0.20,
  SPLIT_CALENDAR_CREATOR: 0.80,
  SPLIT_CALENDAR_AVALO: 0.20,
  SPLIT_EVENTS_CREATOR: 0.80,
  SPLIT_EVENTS_AVALO: 0.20,
  SPLIT_OTHER_CREATOR: 0.65,
  SPLIT_OTHER_AVALO: 0.35,
  
  // Reconciliation
  BALANCE_DISCREPANCY_THRESHOLD: 0.01, // 0.01 tokens tolerance
  
  // Anomaly Detection
  ANOMALY_MIN_SEVERITY_TO_ALERT: 'MEDIUM' as const,
};

// ============================================================================
// AUDIT LOG TYPES
// ============================================================================

export type FinanceAuditAction =
  | 'FINANCE_VIEW_DASHBOARD'
  | 'FINANCE_VIEW_USER_SUMMARY'
  | 'FINANCE_ANOMALY_REVIEWED'
  | 'FINANCE_ANOMALY_RESOLVED'
  | 'FINANCE_EXPORT_GENERATED'
  | 'FINANCE_AGGREGATION_TRIGGERED';

export interface FinanceAuditLog {
  logId: string;
  action: FinanceAuditAction;
  adminId: string;
  timestamp: Timestamp;
  metadata: {
    year?: number;
    month?: number;
    userId?: string;
    anomalyId?: string;
    exportFormat?: string;
    [key: string]: any;
  };
}

// ============================================================================
// EXPORT DATA STRUCTURES
// ============================================================================

export interface CreatorSummaryExportRow {
  userId: string;
  tokensNetEarned: number;
  tokensCreatorShare: number;
  tokensPayoutPaid: number;
  tokensLiabilityEndOfMonth: number;
  country: string;
  segment: string;  // 'STANDARD' | 'ROYAL' | 'OTHER'
}

export interface MonthlyFinanceExportData {
  platform: PlatformFinanceMonthly;
  breakdown: {
    feature: string;
    gmvTokens: number;
    avaloFeesTokens: number;
    creatorShareTokens: number;
  }[];
}