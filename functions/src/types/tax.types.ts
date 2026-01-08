/**
 * PACK 129 — Regional Tax, Invoicing & Legal Entity Support
 * Type definitions for automated tax calculation, withholding, and compliance
 * 
 * NON-NEGOTIABLE RULES:
 * - No creator receives higher payout rates because of business entity type
 * - No creator is penalized in ranking because of tax classification
 * - No "VIP payout tiers" — payouts remain equal for all
 * - No tax avoidance by switching region or business profile
 * - Taxes are compliance, not monetization
 */

import { Timestamp } from 'firebase-admin/firestore';
import { TransactionType } from './treasury.types';

// ============================================================================
// ENTITY TYPES
// ============================================================================

export type EntityType = 'INDIVIDUAL' | 'COMPANY';

export type TaxProfileStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REVIEW_REQUIRED';

export type CompanyType =
  | 'SOLE_PROPRIETORSHIP'
  | 'LLC'
  | 'LTD'
  | 'GMBH'
  | 'SRL'
  | 'SA'
  | 'AB'
  | 'CORPORATION'
  | 'OTHER';

// ============================================================================
// TAX PROFILE
// ============================================================================

/**
 * Creator tax profile
 * Collection: tax_profiles
 */
export interface TaxProfile {
  userId: string;                          // Creator ID (doc ID)
  entityType: EntityType;
  country: string;                         // ISO country code
  
  // Tax Identifiers
  taxId?: string;                          // National tax ID / EIN / NIF
  vatId?: string;                          // VAT/GST registration number
  
  // Business Information (if entityType = COMPANY)
  businessName?: string;
  companyType?: CompanyType;
  registrationNumber?: string;
  
  // Billing Address
  billingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;                       // ISO country code
  };
  
  // Status
  status: TaxProfileStatus;
  
  // Verification
  documentsVerified: boolean;
  verifiedAt?: Timestamp;
  verifiedBy?: string;                     // Admin ID
  
  // Compliance Flags
  requiresWithholding: boolean;            // Based on country rules
  vatEligible: boolean;                    // Eligible for VAT collection
  
  // Audit Trail
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // Metadata
  notes?: string;                          // Admin compliance notes
  lastReviewedAt?: Timestamp;
}

// ============================================================================
// TAX RULES BY REGION
// ============================================================================

/**
 * Regional tax rules
 * Extends region_policy_profiles with tax-specific rules
 */
export interface RegionalTaxRules {
  regionCode: string;                      // ISO country code
  
  // Withholding Tax
  withholding: {
    required: boolean;
    rate: number;                          // Percentage (0-100)
    threshold?: number;                    // Minimum earnings before withholding
    exemptionAvailable: boolean;           // Can provide tax treaty forms
  };
  
  // VAT / GST / Sales Tax
  vat: {
    applicable: boolean;
    rate: number;                          // Standard rate percentage
    reducedRates?: Array<{
      category: string;                    // e.g., 'DIGITAL_SERVICES'
      rate: number;
    }>;
    registrationThreshold?: number;        // Annual revenue threshold
  };
  
  // Digital Services Tax
  digitalServicesTax: {
    applicable: boolean;
    rate: number;
    threshold?: number;
  };
  
  // Invoice Requirements
  invoiceRequirements: {
    mandatory: boolean;
    format: 'PDF' | 'UBL' | 'XML' | 'FLEXIBLE';
    mustIncludeVAT: boolean;
    mustIncludeTaxId: boolean;
  };
  
  // Compliance
  reportingFrequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  lastUpdated: Timestamp;
}

// ============================================================================
// EARNINGS CATEGORIZATION
// ============================================================================

/**
 * Revenue stream categories for tax classification
 */
export type RevenueCategory =
  | 'PAID_CHAT'                  // Messages, voice clips
  | 'PAID_CALLS'                 // Audio/video calls
  | 'TIPS_GIFTS'                 // Token-based tips
  | 'EXCLUSIVE_MEDIA'            // Safe-content unlock
  | 'EVENTS'                     // Virtual events
  | 'DIGITAL_PRODUCTS'           // Ebooks, templates, presets
  | 'ADS_PARTNERSHIPS'           // Future: ads revenue
  | 'OTHER';

/**
 * Tax treatment per revenue category
 */
export interface RevenueCategoryTaxTreatment {
  category: RevenueCategory;
  transactionTypes: TransactionType[];     // Mapped transaction types
  
  // Tax treatment
  subjectToVAT: boolean;
  subjectToWithholding: boolean;
  digitalServicesTax: boolean;
  
  // Reporting
  reportingCategory: string;               // For tax documents
  description: string;
}

// ============================================================================
// TAX CALCULATION
// ============================================================================

/**
 * Tax calculation result for a payout
 */
export interface TaxCalculation {
  userId: string;
  
  // Period
  periodStart: Timestamp;
  periodEnd: Timestamp;
  
  // Earnings Breakdown
  grossEarnings: number;                   // Total before tax (tokens)
  earningsByCategory: Record<RevenueCategory, number>;
  
  // Tax Deductions
  withholdingTax: number;                  // Amount withheld (tokens)
  withholdingRate: number;                 // Applied rate (%)
  vatAmount?: number;                      // VAT if applicable
  digitalServicesTax?: number;             // DST if applicable
  
  // Net Result
  netPayout: number;                       // Amount after all taxes (tokens)
  
  // Applied Rules
  appliedRules: {
    regionCode: string;
    entityType: EntityType;
    rulesVersion: string;
  };
  
  // Calculation Metadata
  calculatedAt: Timestamp;
  calculatedBy: 'SYSTEM' | 'ADMIN';
}

// ============================================================================
// TAX WITHHOLDING RECORDS
// ============================================================================

/**
 * Record of tax withholding on payout
 * Collection: tax_withholding_records
 */
export interface TaxWithholdingRecord {
  id: string;                              // UUID
  userId: string;                          // Creator
  payoutRequestId: string;                 // Reference to payout
  
  // Amounts
  grossAmount: number;                     // Before withholding (tokens)
  withholdingAmount: number;               // Withheld amount (tokens)
  withholdingRate: number;                 // Applied rate (%)
  netAmount: number;                       // After withholding (tokens)
  
  // Tax Classification
  taxYear: number;                         // Fiscal year
  taxQuarter: number;                      // 1-4
  revenueCategories: RevenueCategory[];    // Categories included
  
  // Legal Information
  country: string;
  entityType: EntityType;
  taxId?: string;
  
  // Status
  status: 'WITHHELD' | 'REMITTED' | 'REFUNDED';
  remittedAt?: Timestamp;
  remittanceReference?: string;
  
  // Audit Trail
  createdAt: Timestamp;
  ledgerIds: string[];                     // References to treasury ledger
}

// ============================================================================
// TAX DOCUMENTS
// ============================================================================

export type TaxDocumentType =
  | 'MONTHLY_STATEMENT'          // Monthly earnings summary
  | 'INVOICE'                    // Business invoice
  | 'TAX_CERTIFICATE'            // Annual tax certificate
  | '1099_MISC'                  // US tax form
  | 'WITHHOLDING_STATEMENT'      // Withholding breakdown
  | 'VAT_INVOICE'                // VAT-compliant invoice
  | 'ANNUAL_SUMMARY';            // Year-end summary

export type DocumentFormat = 'PDF' | 'CSV' | 'XML' | 'UBL';

/**
 * Generated tax document
 * Collection: tax_documents
 */
export interface TaxDocument {
  id: string;                              // UUID
  userId: string;                          // Creator
  
  // Document Info
  documentType: TaxDocumentType;
  documentNumber: string;                  // Sequential invoice/doc number
  
  // Period Covered
  periodStart: Timestamp;
  periodEnd: Timestamp;
  fiscalYear: number;
  
  // Financial Data
  grossEarnings: number;
  taxWithheld: number;
  netEarnings: number;
  earningsBreakdown: Record<RevenueCategory, number>;
  
  // Tax Details
  taxCalculation?: TaxCalculation;
  withholdingRecords?: string[];           // IDs of withholding records
  
  // File Storage
  formats: Array<{
    format: DocumentFormat;
    storageUrl: string;
    generatedAt: Timestamp;
  }>;
  
  // Status
  status: 'DRAFT' | 'FINALIZED' | 'SENT' | 'ARCHIVED';
  finalizedAt?: Timestamp;
  sentAt?: Timestamp;
  
  // Compliance
  country: string;
  entityType: EntityType;
  locale: string;                          // Language/region for document
  
  // Audit Trail
  createdAt: Timestamp;
  createdBy: 'SYSTEM' | 'ADMIN';
  metadata?: Record<string, any>;
}

// ============================================================================
// INVOICE GENERATION
// ============================================================================

/**
 * Invoice line item
 */
export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;                       // In tokens
  amount: number;                          // quantity * unitPrice
  taxRate?: number;                        // VAT rate if applicable
  taxAmount?: number;
  category: RevenueCategory;
}

/**
 * Complete invoice data
 */
export interface InvoiceData {
  // Header
  invoiceNumber: string;
  invoiceDate: Timestamp;
  dueDate?: Timestamp;
  
  // Parties
  issuer: {
    name: string;                          // "Avalo Platform" or legal entity
    address: string;
    taxId?: string;
    vatId?: string;
  };
  
  recipient: {
    name: string;                          // Creator name or business name
    address: string;
    taxId?: string;
    vatId?: string;
    entityType: EntityType;
  };
  
  // Line Items
  lineItems: InvoiceLineItem[];
  
  // Totals
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  
  // Payment Info
  paymentMethod: string;
  paidAt?: Timestamp;
  
  // Compliance
  country: string;
  currency: string;                        // Display currency (conversion rate noted)
  notes?: string;
}

// ============================================================================
// TAX COMPLIANCE CHECK
// ============================================================================

/**
 * Compliance check result before payout
 */
export interface TaxComplianceCheck {
  userId: string;
  
  checks: {
    profileComplete: boolean;
    taxIdValid: boolean;
    addressValid: boolean;
    documentsVerified: boolean;
    withholdingRulesApplied: boolean;
  };
  
  blockers: string[];                      // Issues preventing payout
  warnings: string[];                      // Non-blocking warnings
  
  passed: boolean;
  checkedAt: Timestamp;
}

// ============================================================================
// FUNCTION REQUEST/RESPONSE TYPES
// ============================================================================

export interface SubmitTaxProfileRequest {
  userId: string;
  entityType: EntityType;
  country: string;
  taxId?: string;
  vatId?: string;
  businessName?: string;
  companyType?: CompanyType;
  registrationNumber?: string;
  billingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
}

export interface SubmitTaxProfileResponse {
  success: boolean;
  profileId: string;
  status: TaxProfileStatus;
  requiresVerification: boolean;
  message: string;
}

export interface UpdateTaxProfileRequest {
  userId: string;
  updates: Partial<Omit<TaxProfile, 'userId' | 'createdAt' | 'status'>>;
}

export interface UpdateTaxProfileResponse {
  success: boolean;
  updated: boolean;
  requiresReview: boolean;
  message: string;
}

export interface CalculateTaxForUserRequest {
  userId: string;
  periodStart: Timestamp;
  periodEnd: Timestamp;
  grossEarnings: number;
  earningsByCategory: Record<RevenueCategory, number>;
}

export interface CalculateTaxForUserResponse {
  success: boolean;
  calculation: TaxCalculation;
}

export interface IssueInvoiceRequest {
  userId: string;
  periodStart: Timestamp;
  periodEnd: Timestamp;
  format?: DocumentFormat;
}

export interface IssueInvoiceResponse {
  success: boolean;
  documentId: string;
  downloadUrls: Record<DocumentFormat, string>;
}

export interface GenerateTaxReportRequest {
  userId: string;
  year: number;
  quarter?: number;                        // 1-4, optional
  format?: DocumentFormat;
}

export interface GenerateTaxReportResponse {
  success: boolean;
  documentId: string;
  downloadUrl: string;
  summary: {
    totalEarnings: number;
    totalWithheld: number;
    totalNet: number;
  };
}

export interface ApplyWithholdingRequest {
  userId: string;
  payoutRequestId: string;
  grossAmount: number;
}

export interface ApplyWithholdingResponse {
  success: boolean;
  withholdingRecordId: string;
  grossAmount: number;
  withholdingAmount: number;
  withholdingRate: number;
  netAmount: number;
}

// ============================================================================
// TAX REMITTANCE (Platform -> Government)
// ============================================================================

/**
 * Record of platform tax remittance to governments
 * Collection: tax_remittances
 */
export interface TaxRemittance {
  id: string;                              // UUID
  
  // Period
  periodStart: Timestamp;
  periodEnd: Timestamp;
  fiscalYear: number;
  fiscalQuarter: number;
  
  // Country
  country: string;
  taxType: 'WITHHOLDING' | 'VAT' | 'DST';
  
  // Amounts
  totalCollected: number;                  // Total tax collected (tokens)
  totalRemitted: number;                   // Actually remitted
  currencyRemitted: string;                // e.g., 'USD', 'EUR'
  exchangeRate: number;                    // Token to fiat rate used
  
  // Affected Users
  creatorCount: number;
  withholdingRecordIds: string[];
  
  // Status
  status: 'PENDING' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
  submittedAt?: Timestamp;
  confirmedAt?: Timestamp;
  referenceNumber?: string;
  
  // Audit
  createdAt: Timestamp;
  createdBy: string;                       // Admin ID
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const TAX_CONSTANTS = {
  // Default withholding rates by country (examples)
  DEFAULT_WITHHOLDING_RATES: {
    US: 24,                                // US non-resident withholding
    IN: 10,                                // India TDS
    TR: 15,                                // Turkey DST
    BR: 15,                                // Brazil withholding
    PL: 20,                                // Poland withholding
  } as Record<string, number>,
  
  // VAT rates by country (examples)
  DEFAULT_VAT_RATES: {
    PL: 23,
    DE: 19,
    FR: 20,
    GB: 20,
    IT: 22,
    ES: 21,
  } as Record<string, number>,
  
  // Minimum earnings for tax documents
  MIN_EARNINGS_FOR_DOCUMENT: 100,          // 100 tokens minimum
  
  // Document retention period (years)
  DOCUMENT_RETENTION_YEARS: 7,
  
} as const;

/**
 * Revenue category mapping to transaction types
 */
export const REVENUE_CATEGORY_MAPPING: Record<RevenueCategory, RevenueCategoryTaxTreatment> = {
  PAID_CHAT: {
    category: 'PAID_CHAT',
    transactionTypes: ['PAID_MESSAGE'],
    subjectToVAT: true,
    subjectToWithholding: true,
    digitalServicesTax: true,
    reportingCategory: 'Digital Communication Services',
    description: 'Paid messages and voice clips',
  },
  PAID_CALLS: {
    category: 'PAID_CALLS',
    transactionTypes: ['PAID_CALL'],
    subjectToVAT: true,
    subjectToWithholding: true,
    digitalServicesTax: true,
    reportingCategory: 'Digital Communication Services',
    description: 'Audio and video calls',
  },
  TIPS_GIFTS: {
    category: 'TIPS_GIFTS',
    transactionTypes: ['PAID_GIFT'],
    subjectToVAT: false,
    subjectToWithholding: true,
    digitalServicesTax: false,
    reportingCategory: 'Tips and Gifts',
    description: 'Token-based tips and gifts',
  },
  EXCLUSIVE_MEDIA: {
    category: 'EXCLUSIVE_MEDIA',
    transactionTypes: ['PAID_MEDIA', 'PAID_STORY'],
    subjectToVAT: true,
    subjectToWithholding: true,
    digitalServicesTax: true,
    reportingCategory: 'Digital Content',
    description: 'Exclusive media unlocks',
  },
  EVENTS: {
    category: 'EVENTS',
    transactionTypes: ['EVENT_TICKET'],
    subjectToVAT: true,
    subjectToWithholding: true,
    digitalServicesTax: true,
    reportingCategory: 'Events and Services',
    description: 'Virtual events and meetups',
  },
  DIGITAL_PRODUCTS: {
    category: 'DIGITAL_PRODUCTS',
    transactionTypes: ['DIGITAL_PRODUCT'],
    subjectToVAT: true,
    subjectToWithholding: true,
    digitalServicesTax: true,
    reportingCategory: 'Digital Products',
    description: 'Digital products (ebooks, templates)',
  },
  ADS_PARTNERSHIPS: {
    category: 'ADS_PARTNERSHIPS',
    transactionTypes: ['OTHER'],
    subjectToVAT: true,
    subjectToWithholding: true,
    digitalServicesTax: false,
    reportingCategory: 'Advertising Revenue',
    description: 'Ad revenue and partnerships',
  },
  OTHER: {
    category: 'OTHER',
    transactionTypes: ['OTHER'],
    subjectToVAT: true,
    subjectToWithholding: true,
    digitalServicesTax: false,
    reportingCategory: 'Other Revenue',
    description: 'Other revenue streams',
  },
};

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isValidEntityType(type: string): type is EntityType {
  return ['INDIVIDUAL', 'COMPANY'].includes(type);
}

export function isValidRevenueCategory(category: string): category is RevenueCategory {
  return [
    'PAID_CHAT',
    'PAID_CALLS',
    'TIPS_GIFTS',
    'EXCLUSIVE_MEDIA',
    'EVENTS',
    'DIGITAL_PRODUCTS',
    'ADS_PARTNERSHIPS',
    'OTHER',
  ].includes(category);
}

export function isValidDocumentType(type: string): type is TaxDocumentType {
  return [
    'MONTHLY_STATEMENT',
    'INVOICE',
    'TAX_CERTIFICATE',
    '1099_MISC',
    'WITHHOLDING_STATEMENT',
    'VAT_INVOICE',
    'ANNUAL_SUMMARY',
  ].includes(type);
}