/**
 * PACK 330 — Tax Reports, Earnings Statements & Payout Compliance
 * TypeScript Types and Interfaces
 * 
 * Works with PACK 277 (Wallet), 324A (KPI), 328A (Identity Verification)
 * Zero tokenomics changes - read-only reporting layer
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// TAX PROFILE TYPES
// ============================================================================

export type TaxCurrency = 'PLN' | 'EUR' | 'USD' | 'GBP';

export interface TaxProfile {
  userId: string;
  
  // Location & Identity
  countryCode: string;           // ISO code: "PL", "DE", "US", etc.
  taxResidenceCountry: string;
  
  // Entity Type
  isBusiness: boolean;           // Individual vs company
  vatId?: string;                // If company
  personalTaxId?: string;        // NIP / SSN-like (where legal to store)
  
  // Preferences
  preferredReportCurrency: TaxCurrency;
  
  // Consent
  consentToElectronicDocs: boolean;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// USER TAX REPORT TYPES
// ============================================================================

export interface EarningsBreakdown {
  chatTokens: number;
  voiceTokens: number;
  videoTokens: number;
  calendarTokens: number;
  eventTokens: number;
  tipsTokens: number;
  aiCompanionsTokens: number;
  digitalProductsTokens: number;
}

export interface PayoutDetail {
  payoutId: string;
  date: string;
  amountPLN: number;
  bankOrWallet: string;
}

export interface TaxReportUser {
  userId: string;
  period: string;                // "2025-01" or "2025-YEAR"
  
  // Earnings
  totalEarnedTokens: number;
  totalEarnedPLN: number;
  
  // Breakdown by source
  breakdown: EarningsBreakdown;
  
  // Payout information
  numberOfPayouts: number;
  totalPaidOutPLN: number;
  totalPendingPLN: number;
  
  payoutDetails: PayoutDetail[];
  
  // Metadata
  generatedAt: Timestamp;
}

// ============================================================================
// PLATFORM TAX REPORT TYPES
// ============================================================================

export interface RegionBreakdown {
  creators: number;
  tokens: number;
  payoutPLN: number;
}

export interface TaxReportPlatform {
  period: string;                // "2025-01" or "2025-YEAR"
  
  // Gross revenue
  totalGrossTokensSold: number;
  totalGrossRevenuePLN: number;
  
  // Creator payouts
  totalTokensPaidOutToCreators: number;
  totalPayoutsPLN: number;
  
  // Platform revenue (including fees and commission)
  totalAvaloRevenuePLN: number;
  
  // Regional breakdown
  regionBreakdown: {
    PL?: RegionBreakdown;
    EU?: RegionBreakdown;
    US?: RegionBreakdown;
    ROW?: RegionBreakdown;    // Rest of World
  };
  
  // Metadata
  generatedAt: Timestamp;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface SetTaxProfileRequest {
  userId: string;
  countryCode: string;
  taxResidenceCountry: string;
  isBusiness: boolean;
  vatId?: string;
  personalTaxId?: string;
  preferredReportCurrency: TaxCurrency;
}

export interface SetTaxProfileResponse {
  success: boolean;
  error?: string;
}

export interface GetTaxProfileResponse {
  success: boolean;
  profile?: TaxProfile;
  error?: string;
}

export interface GenerateUserTaxReportRequest {
  userId: string;
  period: string;               // "2025-01" or "2025-YEAR"
}

export interface GenerateUserTaxReportResponse {
  success: boolean;
  report?: TaxReportUser;
  error?: string;
}

export interface GetPlatformTaxReportRequest {
  period: string;               // "2025-01" or "2025-YEAR"
}

export interface GetPlatformTaxReportResponse {
  success: boolean;
  report?: TaxReportPlatform;
  error?: string;
}

export interface ExportReportRequest {
  userId: string;
  period: string;
  format: 'PDF' | 'CSV';
}

export interface ExportReportResponse {
  success: boolean;
  downloadUrl?: string;
  error?: string;
}

// ============================================================================
// AGGREGATION HELPERS
// ============================================================================

export interface EarningsAggregation {
  userId: string;
  startDate: Date;
  endDate: Date;
  
  // Token earnings by source
  chatTokens: number;
  voiceTokens: number;
  videoTokens: number;
  calendarTokens: number;
  eventTokens: number;
  tipsTokens: number;
  aiCompanionsTokens: number;
  digitalProductsTokens: number;
  
  totalTokens: number;
  totalPLN: number;
}

export interface PayoutAggregation {
  userId: string;
  startDate: Date;
  endDate: Date;
  
  payouts: PayoutDetail[];
  totalPaidOutPLN: number;
  totalPendingPLN: number;
  numberOfPayouts: number;
}

// ============================================================================
// COMPLIANCE CHECK TYPES
// ============================================================================

export interface PayoutComplianceCheck {
  userId: string;
  
  // Required checks
  hasTaxProfile: boolean;
  hasConsentToElectronicDocs: boolean;
  hasIdentityVerification: boolean;
  isOver18: boolean;
  
  // Optional checks
  kycVerified?: boolean;
  
  // Result
  canRequestPayout: boolean;
  blockingReasons: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const TAX_CONFIG = {
  // Conversion rate (from PACK 277)
  TOKEN_TO_PLN_RATE: 0.20,
  
  // Report periods
  PERIODS: {
    MONTHLY: 'monthly',
    YEARLY: 'yearly',
  },
  
  // Collection names
  COLLECTIONS: {
    TAX_PROFILES: 'taxProfiles',
    TAX_REPORTS_USER: 'taxReportsUser',
    TAX_REPORTS_PLATFORM: 'taxReportsPlatform',
  },
  
  // Aggregation schedule
  SCHEDULE: {
    MONTHLY_REPORT_DAY: 1,      // 1st of each month
    YEARLY_REPORT_DATE: '01-15', // January 15th
  },
  
  // Supported currencies
  SUPPORTED_CURRENCIES: ['PLN', 'EUR', 'USD', 'GBP'] as TaxCurrency[],
  
  // Regional groupings
  EU_COUNTRIES: [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
    'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
    'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
  ],
} as const;

// ============================================================================
// SOURCE MAPPING (from PACK 277 TransactionSource)
// ============================================================================

export const TAX_SOURCE_MAPPING = {
  CHAT: 'chatTokens',
  CALL: 'voiceTokens',          // Voice calls
  CALENDAR: 'calendarTokens',
  EVENT: 'eventTokens',
  TIP: 'tipsTokens',
  MEDIA: 'digitalProductsTokens',
  DIGITAL_PRODUCT: 'digitalProductsTokens',
} as const;

export type TaxSourceField = 
  | 'chatTokens'
  | 'voiceTokens'
  | 'videoTokens'
  | 'calendarTokens'
  | 'eventTokens'
  | 'tipsTokens'
  | 'aiCompanionsTokens'
  | 'digitalProductsTokens';