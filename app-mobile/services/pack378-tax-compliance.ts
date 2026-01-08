/**
 * PACK 378 — Tax & Compliance Service (Mobile)
 * Client-side service for tax calculations and compliance checks
 */

import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

export interface TaxCalculationResult {
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
  digitalServicesTax: number;
  taxRate: number;
  vatMossApplied: boolean;
  reverseChargeApplied: boolean;
  requiresInvoice: boolean;
}

export interface ComplianceCheckResult {
  approved: boolean;
  blockReasons: string[];
  warnings: string[];
  requiredActions: string[];
}

export interface PriceNormalizationResult {
  basePrice: number;
  baseCurrency: string;
  localPrice: number;
  localCurrency: string;
  pppMultiplier: number;
  inflationIndex: number;
  adjusted: boolean;
  countryCode: string;
}

export interface StoreComplianceResult {
  approved: boolean;
  requirements: string[];
  warnings: string[];
  vatHandling: string;
}

/**
 * Calculate tax on token purchase
 */
export async function calculatePurchaseTax(
  amount: number,
  countryCode: string,
  ipCountry?: string,
  simCountry?: string
): Promise<TaxCalculationResult> {
  const applyPurchaseTax = httpsCallable(functions, 'pack378_applyPurchaseTax');
  
  const result = await applyPurchaseTax({
    amount,
    countryCode,
    ipCountry,
    billingCountry: countryCode, // Assume billing country matches
    simCountry
  });

  return result.data as TaxCalculationResult;
}

/**
 * Calculate withholding on creator payout
 */
export async function calculatePayoutWithholding(
  amount: number,
  creatorId: string
): Promise<{
  grossAmount: number;
  withholdingAmount: number;
  netAmount: number;
  withholdingRate: number;
  countryCode: string;
}> {
  const applyPayoutWithholding = httpsCallable(functions, 'pack378_applyPayoutWithholding');
  
  const result = await applyPayoutWithholding({
    amount,
    creatorId
  });

  return result.data as any;
}

/**
 * Get creator income tax estimate
 */
export async function getCreatorIncomeEstimate(
  amount: number,
  period: 'month' | 'quarter' | 'year'
): Promise<{
  estimatedIncomeTax: number;
  estimatedSocialSecurity: number;
  estimatedTotal: number;
  incomeTaxRate: number;
  socialSecurityRate: number;
  countryCode: string;
  note: string;
}> {
  const applyCreatorIncomeEstimate = httpsCallable(functions, 'pack378_applyCreatorIncomeEstimate');
  
  const result = await applyCreatorIncomeEstimate({
    amount,
    period
  });

  return result.data as any;
}

/**
 * Check payout compliance
 */
export async function checkPayoutCompliance(
  creatorId: string,
  amount: number
): Promise<ComplianceCheckResult> {
  const payoutComplianceGate = httpsCallable(functions, 'pack378_payoutComplianceGate');
  
  const result = await payoutComplianceGate({
    creatorId,
    amount
  });

  return result.data as ComplianceCheckResult;
}

/**
 * Log DSA compliance event
 */
export async function logDSAEvent(
  eventType: 'seller_disclosure' | 'abuse_report' | 'review_manipulation' | 'ranking_transparency' | 'content_takedown',
  description: string,
  actionTaken: string,
  metadata?: Record<string, any>
): Promise<{ logId: string; requiresReport: boolean; success: boolean }> {
  const dsaAuditLogger = httpsCallable(functions, 'pack378_dsaAuditLogger');
  
  const result = await dsaAuditLogger({
    eventType,
    description,
    actionTaken,
    priority: 'medium',
    lawType: 'DSA',
    jurisdiction: 'EU',
    metadata
  });

  return result.data as any;
}

/**
 * Get marketplace disclosure for seller
 */
export async function getMarketplaceDisclosure(
  sellerId: string,
  transactionAmount: number
): Promise<{
  sellerName: string;
  sellerType: 'business' | 'individual';
  identityVerified: boolean;
  countryCode: string;
  businessRegistration?: string;
  vatNumber?: string;
  contactEmail?: string;
  disclosureLevel: 'basic' | 'standard' | 'enhanced';
}> {
  const marketplaceDisclosureEngine = httpsCallable(functions, 'pack378_marketplaceDisclosureEngine');
  
  const result = await marketplaceDisclosureEngine({
    sellerId,
    transactionAmount
  });

  return result.data as any;
}

/**
 * Normalize price for region
 */
export async function normalizePrice(
  basePrice: number,
  targetCountry: string,
  platform?: 'apple' | 'google'
): Promise<PriceNormalizationResult> {
  const priceNormalizationEngine = httpsCallable(functions, 'pack378_priceNormalizationEngine');
  
  const result = await priceNormalizationEngine({
    basePrice,
    baseCurrency: 'USD',
    targetCountry,
    platform
  });

  return result.data as PriceNormalizationResult;
}

/**
 * Check store compliance
 */
export async function checkStoreCompliance(
  platform: 'apple' | 'google',
  transactionType: string,
  amount: number,
  countryCode: string
): Promise<StoreComplianceResult> {
  const storeComplianceEnforcer = httpsCallable(functions, 'pack378_storeComplianceEnforcer');
  
  const result = await storeComplianceEnforcer({
    platform,
    transactionType,
    amount,
    countryCode
  });

  return result.data as StoreComplianceResult;
}

/**
 * Report abuse content
 */
export async function reportAbuse(
  contentId: string,
  contentType: 'message' | 'profile' | 'media' | 'review',
  reason: string,
  description: string
): Promise<{
  reportId: string;
  status: string;
  estimatedReviewTime: string;
}> {
  const logAbuseReport = httpsCallable(functions, 'logAbuseReport');
  
  const result = await logAbuseReport({
    contentId,
    contentType,
    reason,
    description
  });

  return result.data as any;
}

/**
 * Format price with tax display
 */
export function formatPriceWithTax(
  basePrice: number,
  taxResult: TaxCalculationResult,
  currency: string = 'USD'
): {
  displayPrice: string;
  taxInfo: string;
  showVATNotice: boolean;
} {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  });

  const displayPrice = formatter.format(taxResult.grossAmount);
  
  let taxInfo = '';
  if (taxResult.vatAmount > 0) {
    taxInfo = `Includes ${formatter.format(taxResult.vatAmount)} VAT (${taxResult.taxRate}%)`;
  }

  if (taxResult.reverseChargeApplied) {
    taxInfo = 'VAT reverse charge applies';
  }

  return {
    displayPrice,
    taxInfo,
    showVATNotice: taxResult.vatMossApplied || taxResult.reverseChargeApplied
  };
}

/**
 * Check if user needs to complete tax profile
 */
export function shouldPromptTaxProfile(complianceResult: ComplianceCheckResult): boolean {
  const taxProfileActions = [
    'Complete tax profile',
    'Provide country of residence',
    'Provide tax ID',
    'Complete KYC verification'
  ];

  return complianceResult.requiredActions.some(action =>
    taxProfileActions.some(taxAction => action.includes(taxAction))
  );
}

/**
 * Get compliance status color
 */
export function getComplianceStatusColor(complianceResult: ComplianceCheckResult): string {
  if (!complianceResult.approved) return '#EF4444'; // red
  if (complianceResult.warnings.length > 0) return '#F59E0B'; // amber
  return '#10B981'; // green
}

/**
 * Format compliance message
 */
export function formatComplianceMessage(complianceResult: ComplianceCheckResult): string {
  if (complianceResult.approved) {
    if (complianceResult.warnings.length > 0) {
      return `✓ Approved with warnings: ${complianceResult.warnings.join(', ')}`;
    }
    return '✓ All compliance checks passed';
  }

  return `✗ Blocked: ${complianceResult.blockReasons.join(', ')}`;
}

/**
 * Calculate effective creator earning after all taxes
 */
export async function calculateEffectiveEarning(
  grossEarning: number,
  creatorId: string
): Promise<{
  grossEarning: number;
  platformFee: number;
  withholdingTax: number;
  estimatedIncomeTax: number;
  netEarning: number;
  takeHomePercentage: number;
}> {
  // Platform fee (e.g., 20%)
  const platformFee = grossEarning * 0.20;
  const afterPlatformFee = grossEarning - platformFee;

  // Withholding tax
  const withholdingResult = await calculatePayoutWithholding(afterPlatformFee, creatorId);
  const withholdingTax = withholdingResult.withholdingAmount;
  const afterWithholding = withholdingResult.netAmount;

  // Estimated income tax (yearly basis)
  const incomeEstimate = await getCreatorIncomeEstimate(afterWithholding * 12, 'year');
  const estimatedIncomeTax = incomeEstimate.estimatedTotal / 12; // Monthly estimate

  const netEarning = afterWithholding - estimatedIncomeTax;
  const takeHomePercentage = (netEarning / grossEarning) * 100;

  return {
    grossEarning,
    platformFee,
    withholdingTax,
    estimatedIncomeTax,
    netEarning,
    takeHomePercentage
  };
}
