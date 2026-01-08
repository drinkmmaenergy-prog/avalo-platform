/**
 * PACK 129 — Tax & Invoicing Types (Mobile Client)
 * Client-side TypeScript types for tax operations
 */

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

export interface TaxProfile {
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
  
  status: TaxProfileStatus;
  documentsVerified: boolean;
  requiresWithholding: boolean;
  vatEligible: boolean;
  
  createdAt: number;
  updatedAt: number;
  verifiedAt?: number;
  notes?: string;
}

// ============================================================================
// REVENUE CATEGORIES
// ============================================================================

export type RevenueCategory =
  | 'PAID_CHAT'
  | 'PAID_CALLS'
  | 'TIPS_GIFTS'
  | 'EXCLUSIVE_MEDIA'
  | 'EVENTS'
  | 'DIGITAL_PRODUCTS'
  | 'ADS_PARTNERSHIPS'
  | 'OTHER';

// ============================================================================
// TAX DOCUMENTS
// ============================================================================

export type TaxDocumentType =
  | 'MONTHLY_STATEMENT'
  | 'INVOICE'
  | 'TAX_CERTIFICATE'
  | '1099_MISC'
  | 'WITHHOLDING_STATEMENT'
  | 'VAT_INVOICE'
  | 'ANNUAL_SUMMARY';

export type DocumentFormat = 'PDF' | 'CSV' | 'XML' | 'UBL';

export interface TaxDocument {
  id: string;
  userId: string;
  documentType: TaxDocumentType;
  documentNumber: string;
  
  periodStart: number;
  periodEnd: number;
  fiscalYear: number;
  
  grossEarnings: number;
  taxWithheld: number;
  netEarnings: number;
  earningsBreakdown: Record<RevenueCategory, number>;
  
  formats: Array<{
    format: DocumentFormat;
    storageUrl: string;
    generatedAt: number;
  }>;
  
  status: 'DRAFT' | 'FINALIZED' | 'SENT' | 'ARCHIVED';
  country: string;
  entityType: EntityType;
  
  createdAt: number;
  finalizedAt?: number;
  sentAt?: number;
}

// ============================================================================
// TAX WITHHOLDING
// ============================================================================

export interface TaxWithholdingRecord {
  id: string;
  userId: string;
  payoutRequestId: string;
  
  grossAmount: number;
  withholdingAmount: number;
  withholdingRate: number;
  netAmount: number;
  
  taxYear: number;
  taxQuarter: number;
  revenueCategories: RevenueCategory[];
  
  country: string;
  entityType: EntityType;
  taxId?: string;
  
  status: 'WITHHELD' | 'REMITTED' | 'REFUNDED';
  createdAt: number;
  remittedAt?: number;
}

// ============================================================================
// TAX CALCULATION
// ============================================================================

export interface TaxCalculation {
  userId: string;
  periodStart: number;
  periodEnd: number;
  
  grossEarnings: number;
  earningsByCategory: Record<RevenueCategory, number>;
  
  withholdingTax: number;
  withholdingRate: number;
  vatAmount?: number;
  digitalServicesTax?: number;
  
  netPayout: number;
  
  appliedRules: {
    regionCode: string;
    entityType: EntityType;
    rulesVersion: string;
  };
  
  calculatedAt: number;
}

// ============================================================================
// EARNINGS SUMMARY
// ============================================================================

export interface EarningsSummary {
  grossEarnings: number;
  withheldTax: number;
  netEarnings: number;
  earningsByCategory: Record<RevenueCategory, number>;
  withholdingRecords: TaxWithholdingRecord[];
}

// ============================================================================
// TAX COMPLIANCE
// ============================================================================

export interface TaxComplianceCheck {
  userId: string;
  checks: {
    profileComplete: boolean;
    taxIdValid: boolean;
    addressValid: boolean;
    documentsVerified: boolean;
    withholdingRulesApplied: boolean;
  };
  blockers: string[];
  warnings: string[];
  passed: boolean;
  checkedAt: number;
}

// ============================================================================
// UI DISPLAY HELPERS
// ============================================================================

export interface TaxBreakdownDisplay {
  label: string;
  amount: number;
  percentage?: number;
  category?: RevenueCategory;
}

export interface WithholdingDisplay {
  grossAmount: number;
  withholdingAmount: number;
  withholdingRate: number;
  netAmount: number;
  country: string;
  explanation: string;
}

// ============================================================================
// FORM DATA
// ============================================================================

export interface TaxProfileFormData {
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

// ============================================================================
// CONSTANTS
// ============================================================================

export const REVENUE_CATEGORY_LABELS: Record<RevenueCategory, string> = {
  PAID_CHAT: 'Paid Messages',
  PAID_CALLS: 'Paid Calls',
  TIPS_GIFTS: 'Tips & Gifts',
  EXCLUSIVE_MEDIA: 'Exclusive Media',
  EVENTS: 'Events & Meetups',
  DIGITAL_PRODUCTS: 'Digital Products',
  ADS_PARTNERSHIPS: 'Ad Revenue',
  OTHER: 'Other',
};

export const DOCUMENT_TYPE_LABELS: Record<TaxDocumentType, string> = {
  MONTHLY_STATEMENT: 'Monthly Statement',
  INVOICE: 'Invoice',
  TAX_CERTIFICATE: 'Tax Certificate',
  '1099_MISC': 'Form 1099-MISC',
  WITHHOLDING_STATEMENT: 'Withholding Statement',
  VAT_INVOICE: 'VAT Invoice',
  ANNUAL_SUMMARY: 'Annual Summary',
};

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  INDIVIDUAL: 'Individual Creator',
  COMPANY: 'Registered Company',
};