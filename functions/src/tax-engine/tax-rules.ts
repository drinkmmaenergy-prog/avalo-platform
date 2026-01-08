/**
 * PACK 149: Global Tax Engine & Compliance Hub
 * Region-Aware Tax Rules Configuration
 * 
 * Determines tax obligations based on:
 * - Creator's country of residence
 * - Payout region
 * - Business vs individual account
 * - Global double-tax treaties
 * - VAT/GST requirements
 */

import { TaxResidencyCountry, AccountType, TaxComplianceRequirement, TaxDocumentType } from './types';

export const TAX_COMPLIANCE_REQUIREMENTS: Record<string, TaxComplianceRequirement> = {
  'EU_individual': {
    country: 'DE' as TaxResidencyCountry,
    accountType: 'individual',
    requiredFields: ['legalFullName', 'taxResidencyCountry', 'payoutAccountName', 'payoutAccountCountry'],
    optionalFields: ['taxId'],
    requiresVATNumber: false,
    requiresBusinessRegistration: false,
    requiresEORI: false,
    reportingFrequency: 'annual',
    doubleTaxTreatyAvailable: ['US', 'CA', 'GB', 'AU', 'NZ', 'JP', 'CH']
  },
  'EU_business': {
    country: 'DE' as TaxResidencyCountry,
    accountType: 'business',
    requiredFields: ['legalFullName', 'taxResidencyCountry', 'businessRegistrationNumber', 'vatNumber', 'payoutAccountName', 'payoutAccountCountry'],
    optionalFields: ['eoriNumber', 'taxId'],
    requiresVATNumber: true,
    requiresBusinessRegistration: true,
    requiresEORI: false,
    minimumPayoutThreshold: 10000,
    reportingFrequency: 'quarterly',
    doubleTaxTreatyAvailable: ['US', 'CA', 'GB', 'AU', 'NZ', 'JP', 'CH']
  },
  'UK_individual': {
    country: 'GB',
    accountType: 'individual',
    requiredFields: ['legalFullName', 'taxResidencyCountry', 'payoutAccountName', 'payoutAccountCountry'],
    optionalFields: ['taxId'],
    requiresVATNumber: false,
    requiresBusinessRegistration: false,
    requiresEORI: false,
    reportingFrequency: 'annual',
    doubleTaxTreatyAvailable: ['US', 'CA', 'AU', 'NZ', 'JP', 'CH', 'SG']
  },
  'UK_business': {
    country: 'GB',
    accountType: 'business',
    requiredFields: ['legalFullName', 'taxResidencyCountry', 'businessRegistrationNumber', 'vatNumber', 'payoutAccountName', 'payoutAccountCountry'],
    optionalFields: ['eoriNumber', 'taxId'],
    requiresVATNumber: true,
    requiresBusinessRegistration: true,
    requiresEORI: false,
    minimumPayoutThreshold: 85000,
    reportingFrequency: 'quarterly',
    doubleTaxTreatyAvailable: ['US', 'CA', 'AU', 'NZ', 'JP', 'CH', 'SG']
  },
  'US_individual': {
    country: 'US',
    accountType: 'individual',
    requiredFields: ['legalFullName', 'taxResidencyCountry', 'taxId', 'payoutAccountName', 'payoutAccountCountry'],
    optionalFields: [],
    requiresVATNumber: false,
    requiresBusinessRegistration: false,
    requiresEORI: false,
    minimumPayoutThreshold: 600,
    reportingFrequency: 'annual',
    doubleTaxTreatyAvailable: ['CA', 'GB', 'DE', 'FR', 'AU', 'NZ', 'JP', 'CH']
  },
  'US_business': {
    country: 'US',
    accountType: 'business',
    requiredFields: ['legalFullName', 'taxResidencyCountry', 'businessRegistrationNumber', 'taxId', 'payoutAccountName', 'payoutAccountCountry'],
    optionalFields: [],
    requiresVATNumber: false,
    requiresBusinessRegistration: true,
    requiresEORI: false,
    minimumPayoutThreshold: 600,
    reportingFrequency: 'quarterly',
    doubleTaxTreatyAvailable: ['CA', 'GB', 'DE', 'FR', 'AU', 'NZ', 'JP', 'CH']
  },
  'CA_individual': {
    country: 'CA',
    accountType: 'individual',
    requiredFields: ['legalFullName', 'taxResidencyCountry', 'payoutAccountName', 'payoutAccountCountry'],
    optionalFields: ['taxId'],
    requiresVATNumber: false,
    requiresBusinessRegistration: false,
    requiresEORI: false,
    reportingFrequency: 'annual',
    doubleTaxTreatyAvailable: ['US', 'GB', 'DE', 'FR', 'AU', 'NZ', 'JP', 'CH']
  },
  'CA_business': {
    country: 'CA',
    accountType: 'business',
    requiredFields: ['legalFullName', 'taxResidencyCountry', 'businessRegistrationNumber', 'taxId', 'payoutAccountName', 'payoutAccountCountry'],
    optionalFields: ['vatNumber'],
    requiresVATNumber: false,
    requiresBusinessRegistration: true,
    requiresEORI: false,
    minimumPayoutThreshold: 30000,
    reportingFrequency: 'quarterly',
    doubleTaxTreatyAvailable: ['US', 'GB', 'DE', 'FR', 'AU', 'NZ', 'JP', 'CH']
  },
  'AU_individual': {
    country: 'AU',
    accountType: 'individual',
    requiredFields: ['legalFullName', 'taxResidencyCountry', 'taxId', 'payoutAccountName', 'payoutAccountCountry'],
    optionalFields: [],
    requiresVATNumber: false,
    requiresBusinessRegistration: false,
    requiresEORI: false,
    reportingFrequency: 'annual',
    doubleTaxTreatyAvailable: ['US', 'CA', 'GB', 'DE', 'FR', 'NZ', 'JP', 'CH', 'SG']
  },
  'AU_business': {
    country: 'AU',
    accountType: 'business',
    requiredFields: ['legalFullName', 'taxResidencyCountry', 'businessRegistrationNumber', 'taxId', 'payoutAccountName', 'payoutAccountCountry'],
    optionalFields: ['vatNumber'],
    requiresVATNumber: false,
    requiresBusinessRegistration: true,
    requiresEORI: false,
    minimumPayoutThreshold: 75000,
    reportingFrequency: 'quarterly',
    doubleTaxTreatyAvailable: ['US', 'CA', 'GB', 'DE', 'FR', 'NZ', 'JP', 'CH', 'SG']
  }
};

export const VAT_RATES: Record<string, number> = {
  'DE': 0.19,
  'FR': 0.20,
  'ES': 0.21,
  'IT': 0.22,
  'NL': 0.21,
  'BE': 0.21,
  'AT': 0.20,
  'PL': 0.23,
  'SE': 0.25,
  'DK': 0.25,
  'FI': 0.24,
  'NO': 0.25,
  'CH': 0.077,
  'IE': 0.23,
  'PT': 0.23,
  'GR': 0.24,
  'CZ': 0.21,
  'GB': 0.20
};

export const GST_RATES: Record<string, number> = {
  'AU': 0.10,
  'NZ': 0.15,
  'CA': 0.05,
  'SG': 0.08,
  'IN': 0.18
};

export const DIGITAL_SERVICES_TAX_THRESHOLDS: Record<string, number> = {
  'EU': 10000,
  'GB': 85000,
  'US': 600,
  'CA': 30000,
  'AU': 75000,
  'NZ': 60000
};

export function getComplianceRequirements(
  country: TaxResidencyCountry,
  accountType: AccountType
): TaxComplianceRequirement {
  const euCountries = ['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'PL', 'SE', 'DK', 'FI', 'PT', 'GR', 'CZ', 'IE'];
  
  if (euCountries.includes(country)) {
    return TAX_COMPLIANCE_REQUIREMENTS[`EU_${accountType}`];
  }
  
  const key = `${country}_${accountType}`;
  return TAX_COMPLIANCE_REQUIREMENTS[key] || TAX_COMPLIANCE_REQUIREMENTS['EU_individual'];
}

export function getVATRate(country: string): number {
  return VAT_RATES[country] || 0;
}

export function getGSTRate(country: string): number {
  return GST_RATES[country] || 0;
}

export function getDigitalServicesTaxThreshold(country: TaxResidencyCountry): number {
  const euCountries = ['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'PL', 'SE', 'DK', 'FI', 'PT', 'GR', 'CZ', 'IE'];
  
  if (euCountries.includes(country)) {
    return DIGITAL_SERVICES_TAX_THRESHOLDS['EU'];
  }
  
  return DIGITAL_SERVICES_TAX_THRESHOLDS[country] || 0;
}

export function getReportType(country: TaxResidencyCountry): TaxDocumentType {
  const euCountries = ['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'PL', 'SE', 'DK', 'FI', 'PT', 'GR', 'CZ', 'IE'];
  
  if (euCountries.includes(country)) {
    return 'VAT_MOSS';
  }
  
  switch (country) {
    case 'GB':
      return 'HMRC_DIGITAL';
    case 'US':
      return '1099K_SUMMARY';
    case 'CA':
      return 'GST_HST';
    case 'AU':
    case 'NZ':
      return 'BAS_SUMMARY';
    default:
      return 'LOCAL_INCOME';
  }
}

export function hasDoubleTaxTreaty(
  creatorCountry: TaxResidencyCountry,
  sourceCountry: string
): boolean {
  const requirements = getComplianceRequirements(creatorCountry, 'individual');
  return requirements.doubleTaxTreatyAvailable.includes(sourceCountry);
}

export function calculateVATLiability(
  grossRevenue: number,
  creatorCountry: TaxResidencyCountry
): number {
  const vatRate = getVATRate(creatorCountry);
  
  if (vatRate === 0) {
    return 0;
  }
  
  const threshold = getDigitalServicesTaxThreshold(creatorCountry);
  if (grossRevenue < threshold) {
    return 0;
  }
  
  return grossRevenue * vatRate;
}

export function calculateGSTLiability(
  grossRevenue: number,
  creatorCountry: TaxResidencyCountry
): number {
  const gstRate = getGSTRate(creatorCountry);
  
  if (gstRate === 0) {
    return 0;
  }
  
  const threshold = getDigitalServicesTaxThreshold(creatorCountry);
  if (grossRevenue < threshold) {
    return 0;
  }
  
  return grossRevenue * gstRate;
}

export function validateTaxProfile(
  country: TaxResidencyCountry,
  accountType: AccountType,
  profileData: Record<string, any>
): { valid: boolean; missingFields: string[] } {
  const requirements = getComplianceRequirements(country, accountType);
  const missingFields: string[] = [];
  
  for (const field of requirements.requiredFields) {
    if (!profileData[field] || profileData[field] === '') {
      missingFields.push(field);
    }
  }
  
  return {
    valid: missingFields.length === 0,
    missingFields
  };
}