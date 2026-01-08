/**
 * PACK 149: Global Tax Engine & Compliance Hub
 * Type Definitions
 * 
 * Automatic tax reports and compliance without affecting token economy
 * or exposing personal data
 */

export type TaxResidencyCountry = 
  | 'US' | 'CA' | 'GB' | 'DE' | 'FR' | 'ES' | 'IT' | 'NL' | 'BE' | 'AT'
  | 'PL' | 'SE' | 'DK' | 'FI' | 'NO' | 'CH' | 'IE' | 'PT' | 'GR' | 'CZ'
  | 'AU' | 'NZ' | 'JP' | 'KR' | 'SG' | 'HK' | 'IN' | 'BR' | 'MX' | 'AR'
  | 'OTHER';

export type AccountType = 'individual' | 'business';

export type TaxDocumentType = 
  | 'VAT_MOSS'           // EU VAT Mini One Stop Shop
  | 'HMRC_DIGITAL'       // UK HMRC Digital Services
  | '1099K_SUMMARY'      // US 1099-K Summary
  | 'GST_HST'            // Canada GST/HST
  | 'BAS_SUMMARY'        // Australia BAS
  | 'LOCAL_INCOME'       // Generic local income report
  | 'DIGITAL_GOODS';     // Generic digital goods report

export type RevenueCategory = 
  | 'mentorship'
  | 'digital_products'
  | 'clubs'
  | 'events'
  | 'subscriptions'
  | 'tips'
  | 'other';

export interface TaxProfile {
  userId: string;
  legalFullName: string;
  taxResidencyCountry: TaxResidencyCountry;
  accountType: AccountType;
  businessRegistrationNumber?: string;
  vatNumber?: string;
  eoriNumber?: string;
  taxId?: string;
  
  payoutAccountVerified: boolean;
  payoutAccountName: string;
  payoutAccountCountry: string;
  
  profileCompleted: boolean;
  verificationStatus: 'pending' | 'verified' | 'rejected' | 'suspended';
  kycDocumentsSubmitted: boolean;
  
  doubleTaxTreatyCountries: string[];
  
  fraudSuspected: boolean;
  locked: boolean;
  lockReason?: string;
  
  createdAt: Date;
  updatedAt: Date;
  lastReviewedAt?: Date;
}

export interface AnonymizedRevenueSource {
  category: RevenueCategory;
  sourceCountry: string;
  amount: number;
  currency: string;
  transactionCount: number;
  period: string;
}

export interface TaxLiabilityRecord {
  userId: string;
  taxYear: number;
  taxQuarter?: number;
  
  grossRevenue: number;
  platformFee: number;
  netRevenue: number;
  
  revenueByCategory: Record<RevenueCategory, number>;
  revenueByCountry: Record<string, number>;
  
  estimatedVAT?: number;
  estimatedGST?: number;
  estimatedIncomeTax?: number;
  
  deductions?: number;
  
  currency: string;
  
  calculatedAt: Date;
  calculatedBy: 'system' | 'manual';
}

export interface TaxReport {
  id: string;
  userId: string;
  reportType: TaxDocumentType;
  
  taxYear: number;
  taxQuarter?: number;
  periodStart: Date;
  periodEnd: Date;
  
  totalRevenue: number;
  totalTransactions: number;
  currency: string;
  
  anonymizedSources: AnonymizedRevenueSource[];
  
  liability?: {
    vatAmount?: number;
    gstAmount?: number;
    estimatedIncomeTax?: number;
  };
  
  reportData: Record<string, any>;
  
  generatedAt: Date;
  expiresAt?: Date;
  
  downloaded: boolean;
  downloadCount: number;
  lastDownloadedAt?: Date;
}

export interface TaxExportLog {
  id: string;
  userId: string;
  reportId: string;
  
  exportType: 'pdf' | 'csv' | 'json';
  exportedAt: Date;
  
  ipAddress: string;
  userAgent: string;
  
  regulatorRequest: boolean;
  regulatorId?: string;
}

export interface AuditTrailEntry {
  id: string;
  userId: string;
  
  eventType: 
    | 'profile_created'
    | 'profile_updated'
    | 'kyc_submitted'
    | 'verification_completed'
    | 'report_generated'
    | 'report_downloaded'
    | 'payout_processed'
    | 'fraud_suspected'
    | 'profile_locked'
    | 'profile_unlocked';
  
  eventData: Record<string, any>;
  
  ledgerReferenceId?: string;
  payoutReferenceId?: string;
  
  timestamp: Date;
  performedBy: string;
}

export interface TaxComplianceRequirement {
  country: TaxResidencyCountry;
  accountType: AccountType;
  
  requiredFields: string[];
  optionalFields: string[];
  
  requiresVATNumber: boolean;
  requiresBusinessRegistration: boolean;
  requiresEORI: boolean;
  
  minimumPayoutThreshold?: number;
  reportingFrequency: 'monthly' | 'quarterly' | 'annual';
  
  doubleTaxTreatyAvailable: string[];
}

export interface TaxCalculationContext {
  userId: string;
  profile: TaxProfile;
  
  periodStart: Date;
  periodEnd: Date;
  
  revenueData: {
    category: RevenueCategory;
    amount: number;
    sourceCountry: string;
    timestamp: Date;
  }[];
  
  existingLiabilities: TaxLiabilityRecord[];
}

export interface TaxReportGenerationRequest {
  userId: string;
  reportType: TaxDocumentType;
  taxYear: number;
  taxQuarter?: number;
}

export interface RegulatorAuditRequest {
  userId: string;
  regulatorId: string;
  requestedData: string[];
  justification: string;
  approvedBy: string;
}

export const TAX_REGIONS = {
  EU: ['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'PL', 'SE', 'DK', 'FI', 'PT', 'GR', 'CZ', 'IE'],
  UK: ['GB'],
  US: ['US'],
  CA: ['CA'],
  AU_NZ: ['AU', 'NZ'],
  ASIA_PACIFIC: ['JP', 'KR', 'SG', 'HK', 'IN'],
  LATAM: ['BR', 'MX', 'AR']
} as const;

export const REVENUE_CATEGORY_LABELS: Record<RevenueCategory, string> = {
  mentorship: 'Mentorship Sessions',
  digital_products: 'Digital Products',
  clubs: 'Clubs',
  events: 'Events',
  subscriptions: 'Subscriptions',
  tips: 'Tips',
  other: 'Other Services'
};

export const FORBIDDEN_CATEGORIES = [
  'nsfw',
  'escort',
  'adult_services',
  'romance_economy'
] as const;