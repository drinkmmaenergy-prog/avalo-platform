/**
 * PACK 378 — Global Payments, Tax, VAT & Local Legal Compliance Engine
 * Tax Profiles Schema
 */

export interface TaxProfile {
  countryCode: string; // ISO 3166-1 alpha-2
  vatRate: number; // Percentage (e.g., 21 for 21%)
  digitalServicesTax: number; // Percentage for DST
  creatorIncomeTaxEstimate: number; // Estimated income tax %
  payoutWithholdingEnabled: boolean; // Whether to withhold tax on payouts
  requiresInvoice: boolean; // Invoice required for transactions
  effectiveFrom: Date; // When this profile became effective
  effectiveUntil?: Date; // Optional expiry date
  // VAT rules
  vatMossEnabled: boolean; // EU VAT MOSS compliance
  reverseChargeEnabled: boolean; // B2B reverse charge
  vatThreshold?: number; // Threshold before VAT applies (in local currency)
  // Withholding rules
  withholdingRate: number; // Tax withholding percentage
  withholdingThreshold: number; // Minimum amount before withholding
  // Regional specifics
  needsTaxId: boolean; // Tax ID required from users
  needsBusinessRegistration: boolean; // Business registration required
  // Digital services compliance
  dsaCompliant: boolean; // Digital Services Act
  dmaCompliant: boolean; // Digital Markets Act
  platformActCompliant: boolean; // Platform intermediary rules
  // Store compliance
  appleStoreVatHandling: string; // 'automatic' | 'manual' | 'passthrough'
  googlePlayVatHandling: string; // 'automatic' | 'manual' | 'passthrough'
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: string; // Admin user ID
}

export interface VATRecord {
  id: string; // Unique record ID
  transactionId: string; // Related transaction
  userId: string; // Buyer/payer ID
  creatorId?: string; // Seller/recipient ID (if applicable)
  // Amounts
  netAmount: number; // Amount before VAT
  vatAmount: number; // VAT charged
  grossAmount: number; // Total amount (net + VAT)
  // Tax details
  vatRate: number; // Applied VAT rate
  taxJurisdiction: string; // Country code
  vatMossApplied: boolean; // Was MOSS scheme used
  reverseChargeApplied: boolean; // Was reverse charge used
  // Buyer location verification
  ipCountry: string; // Country from IP
  simCountry?: string; // Country from SIM (mobile)
  billingCountry: string; // Country from billing address
  locationVerified: boolean; // All locations match
  // Invoice data
  invoiceNumber?: string; // Invoice reference
  invoiceIssued: boolean; // Invoice generated
  invoiceUrl?: string; // URL to invoice PDF
  // Metadata
  timestamp: Date;
  fiscalYear: number;
  fiscalQuarter: number;
}

export interface RegionalPriceProfile {
  countryCode: string;
  currencyCode: string; // ISO 4217
  // Price adjustments
  purchasingPowerParity: number; // PPP multiplier (1.0 = baseline)
  inflationIndex: number; // Current inflation adjustment
  // Store rounding
  appleStoreRounding: 'none' | 'nearest_0.99' | 'nearest_0.49' | 'nearest_whole';
  googlePlayRounding: 'none' | 'nearest_0.99' | 'nearest_0.49' | 'nearest_whole';
  // Price tiers
  tokenPriceTiers: {
    basePrice: number; // USD
    localPrice: number; // Local currency
    discountAllowed: boolean;
  }[];
  // Metadata
  effectiveFrom: Date;
  updatedAt: Date;
}

export interface TaxAuditExport {
  id: string;
  exportType: 'vat_report' | 'payout_tax' | 'profit_statement' | 'fraud_tax_risk';
  periodStart: Date;
  periodEnd: Date;
  countries: string[]; // Country codes included
  format: 'csv' | 'json' | 'xml';
  fileUrl: string; // Storage URL
  fileSize: number; // Bytes
  recordCount: number; // Number of records
  generatedAt: Date;
  generatedBy: string; // Admin user ID
  status: 'pending' | 'completed' | 'failed';
  error?: string;
}

export interface CreatorTaxProfile {
  userId: string;
  // Identity verification
  identityVerified: boolean;
  identityVerificationDate?: Date;
  identityProvider?: string; // KYC provider
  // Tax information
  countryCode: string; // Tax residency
  taxId?: string; // Tax identification number
  businessRegistration?: string; // Business registration number
  isBusinessEntity: boolean; // Individual vs business
  // Payout compliance
  payoutApproved: boolean; // Can receive payouts
  payoutBlockReason?: string; // Why payout is blocked
  withholdingRate: number; // Applied withholding %
  // AML/Fraud
  amlVelocityCheckPassed: boolean;
  fraudScore: number; // 0-100
  suspiciousPatternDetected: boolean;
  suspiciousPatternDetails?: string;
  // VAT registration
  vatRegistered: boolean;
  vatNumber?: string; // EU VAT number
  vatNumberVerified: boolean;
  // Compliance history
  lastComplianceCheck: Date;
  complianceFailures: number;
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface DSAComplianceLog {
  id: string;
  eventType: 'seller_disclosure' | 'abuse_report' | 'review_manipulation' | 'ranking_transparency' | 'content_takedown';
  userId?: string;
  contentId?: string;
  // Event details
  description: string;
  actionTaken: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  // Legal requirements
  lawType: 'DSA' | 'DMA' | 'platform_act' | 'consumer_protection';
  jurisdiction: string; // Country code
  requiresReport: boolean; // Must be reported to authorities
  reportedAt?: Date;
  // Traceability
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
  metadata: Record<string, any>;
}
