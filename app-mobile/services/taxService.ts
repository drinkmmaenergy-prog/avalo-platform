/**
 * PACK 129 — Tax Service (Mobile Client)
 * Service layer for tax profile and document operations
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  TaxProfile,
  TaxProfileFormData,
  TaxDocument,
  TaxWithholdingRecord,
  TaxComplianceCheck,
  DocumentFormat,
  TaxDocumentType,
} from '../types/tax';

const functions = getFunctions();

// ============================================================================
// TAX PROFILE OPERATIONS
// ============================================================================

/**
 * Submit tax profile
 */
export async function submitTaxProfile(
  userId: string,
  profileData: TaxProfileFormData
): Promise<{
  success: boolean;
  profileId: string;
  status: string;
  requiresVerification: boolean;
  message: string;
}> {
  try {
    const submitProfile = httpsCallable(functions, 'pack129_submitTaxProfile');
    const result = await submitProfile({
      userId,
      entityType: profileData.entityType,
      country: profileData.country,
      taxId: profileData.taxId,
      vatId: profileData.vatId,
      businessName: profileData.businessName,
      companyType: profileData.companyType,
      registrationNumber: profileData.registrationNumber,
      billingAddress: profileData.billingAddress,
    });

    return result.data as any;
  } catch (error: any) {
    console.error('Error submitting tax profile:', error);
    throw new Error(error.message || 'Failed to submit tax profile');
  }
}

/**
 * Update tax profile
 */
export async function updateTaxProfile(
  userId: string,
  updates: Partial<TaxProfileFormData>
): Promise<{
  success: boolean;
  updated: boolean;
  requiresReview: boolean;
  message: string;
}> {
  try {
    const updateProfile = httpsCallable(functions, 'pack129_updateTaxProfile');
    const result = await updateProfile({ userId, updates });

    return result.data as any;
  } catch (error: any) {
    console.error('Error updating tax profile:', error);
    throw new Error(error.message || 'Failed to update tax profile');
  }
}

/**
 * Get tax profile
 */
export async function getTaxProfile(
  userId: string
): Promise<{ exists: boolean; profile: TaxProfile | null }> {
  try {
    const getProfile = httpsCallable(functions, 'pack129_getTaxProfile');
    const result = await getProfile({ userId });

    return result.data as any;
  } catch (error: any) {
    console.error('Error getting tax profile:', error);
    throw new Error(error.message || 'Failed to get tax profile');
  }
}

/**
 * Check tax compliance
 */
export async function checkTaxCompliance(
  userId: string
): Promise<TaxComplianceCheck> {
  try {
    const checkCompliance = httpsCallable(functions, 'pack129_checkTaxCompliance');
    const result = await checkCompliance({ userId });

    return result.data as any;
  } catch (error: any) {
    console.error('Error checking tax compliance:', error);
    throw new Error(error.message || 'Failed to check tax compliance');
  }
}

// ============================================================================
// TAX DOCUMENTS
// ============================================================================

/**
 * Get tax documents
 */
export async function getTaxDocuments(
  userId: string,
  filters?: {
    year?: number;
    documentType?: TaxDocumentType;
  }
): Promise<{
  success: boolean;
  documents: TaxDocument[];
  count: number;
}> {
  try {
    const getDocuments = httpsCallable(functions, 'pack129_getTaxDocuments');
    const result = await getDocuments({
      userId,
      year: filters?.year,
      documentType: filters?.documentType,
    });

    return result.data as any;
  } catch (error: any) {
    console.error('Error getting tax documents:', error);
    throw new Error(error.message || 'Failed to get tax documents');
  }
}

/**
 * Issue invoice for period
 */
export async function issueInvoice(
  userId: string,
  periodStart: Date,
  periodEnd: Date,
  format?: DocumentFormat
): Promise<{
  success: boolean;
  documentId: string;
  downloadUrls: Record<DocumentFormat, string>;
}> {
  try {
    const issue = httpsCallable(functions, 'pack129_issueInvoice');
    const result = await issue({
      userId,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      format,
    });

    return result.data as any;
  } catch (error: any) {
    console.error('Error issuing invoice:', error);
    throw new Error(error.message || 'Failed to issue invoice');
  }
}

/**
 * Generate tax report
 */
export async function generateTaxReport(
  userId: string,
  year: number,
  quarter?: number,
  format?: DocumentFormat
): Promise<{
  success: boolean;
  documentId: string;
  downloadUrl: string;
  summary: {
    totalEarnings: number;
    totalWithheld: number;
    totalNet: number;
  };
}> {
  try {
    const generate = httpsCallable(functions, 'pack129_generateTaxReport');
    const result = await generate({
      userId,
      year,
      quarter,
      format,
    });

    return result.data as any;
  } catch (error: any) {
    console.error('Error generating tax report:', error);
    throw new Error(error.message || 'Failed to generate tax report');
  }
}

// ============================================================================
// WITHHOLDING RECORDS
// ============================================================================

/**
 * Get withholding records
 */
export async function getWithholdingRecords(
  userId: string,
  filters?: {
    year?: number;
    quarter?: number;
  }
): Promise<{
  success: boolean;
  records: TaxWithholdingRecord[];
  count: number;
}> {
  try {
    const getRecords = httpsCallable(functions, 'pack129_getWithholdingRecords');
    const result = await getRecords({
      userId,
      year: filters?.year,
      quarter: filters?.quarter,
    });

    return result.data as any;
  } catch (error: any) {
    console.error('Error getting withholding records:', error);
    throw new Error(error.message || 'Failed to get withholding records');
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format tax amount for display
 */
export function formatTaxAmount(amount: number): string {
  return `${amount.toLocaleString()} tokens`;
}

/**
 * Format percentage
 */
export function formatPercentage(rate: number): string {
  return `${rate.toFixed(2)}%`;
}

/**
 * Get current tax year
 */
export function getCurrentTaxYear(): number {
  return new Date().getFullYear();
}

/**
 * Get current tax quarter
 */
export function getCurrentTaxQuarter(): number {
  const month = new Date().getMonth() + 1;
  return Math.ceil(month / 3);
}

/**
 * Get month period for statements
 */
export function getMonthPeriod(year: number, month: number): {
  start: Date;
  end: Date;
} {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);

  return { start, end };
}

/**
 * Get quarter period
 */
export function getQuarterPeriod(year: number, quarter: number): {
  start: Date;
  end: Date;
} {
  const startMonth = (quarter - 1) * 3;
  const endMonth = quarter * 3;

  const start = new Date(year, startMonth, 1);
  const end = new Date(year, endMonth, 0, 23, 59, 59, 999);

  return { start, end };
}

/**
 * Get year period
 */
export function getYearPeriod(year: number): {
  start: Date;
  end: Date;
} {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);

  return { start, end };
}

/**
 * Validate tax ID format (basic client-side validation)
 */
export function validateTaxId(taxId: string, country: string): {
  valid: boolean;
  error?: string;
} {
  if (!taxId) {
    return { valid: true }; // Optional field
  }

  if (taxId.length < 5 || taxId.length > 30) {
    return {
      valid: false,
      error: 'Tax ID must be 5-30 characters',
    };
  }

  const validPattern = /^[A-Z0-9\-\/]+$/i;
  if (!validPattern.test(taxId)) {
    return {
      valid: false,
      error: 'Tax ID contains invalid characters',
    };
  }

  return { valid: true };
}

/**
 * Validate VAT ID format (basic client-side validation)
 */
export function validateVatId(vatId: string, country: string): {
  valid: boolean;
  error?: string;
} {
  if (!vatId) {
    return { valid: true }; // Optional field
  }

  if (vatId.length < 8 || vatId.length > 15) {
    return {
      valid: false,
      error: 'VAT ID must be 8-15 characters',
    };
  }

  // EU VAT IDs should start with country code
  const euCountries = [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
    'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
    'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  ];

  if (euCountries.includes(country)) {
    if (!vatId.toUpperCase().startsWith(country)) {
      return {
        valid: false,
        error: `VAT ID for ${country} should start with '${country}'`,
      };
    }
  }

  return { valid: true };
}