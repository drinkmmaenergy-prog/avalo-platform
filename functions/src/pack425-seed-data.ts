/**
 * PACK 425 — Country Data Seeding
 * Pre-configured country data for common markets
 */

import * as Readiness from './pack425-country-readiness';
import * as FeatureFlags from './pack425-feature-flags';
import * as Pricing from './pack425-pricing-matrix';
import * as Segmentation from './pack425-market-segmentation';

export interface CountryConfig {
  countryCode: string;
  region: string;
  languageCodes: string[];
  currency: string;
  
  // Readiness factors
  asoScore: number;
  trustScore: number;
  fraudRiskScore: number;
  legalRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  
  // Market segmentation
  primarySegment: Segmentation.MarketSegment;
  secondarySegments?: Segmentation.MarketSegment[];
  
  // Payment settings
  purchasingPowerIndex: number;
  payoutEnabled: boolean;
  monetizationRestricted: boolean;
  
  // Feature flags overrides
  featureOverrides?: Partial<FeatureFlags.CountryFeatureFlags>;
}

// Pre-configured country data for 42+ markets
export const COUNTRY_CONFIGS: CountryConfig[] = [
  // Central Europe
  {
    countryCode: 'PL',
    region: 'EU',
    languageCodes: ['pl'],
    currency: 'PLN',
    asoScore: 85,
    trustScore: 0.8,
    fraudRiskScore: 30,
    legalRiskLevel: 'LOW',
    primarySegment: 'DATING_MATURE',
    secondarySegments: ['CREATOR_ECONOMY_RICH'],
    purchasingPowerIndex: 1.0,
    payoutEnabled: true,
    monetizationRestricted: false,
  },
  {
    countryCode: 'DE',
    region: 'EU',
    languageCodes: ['de'],
    currency: 'EUR',
    asoScore: 90,
    trustScore: 0.85,
    fraudRiskScore: 25,
    legalRiskLevel: 'MEDIUM',
    primarySegment: 'PREMIUM',
    secondarySegments: ['DATING_MATURE', 'SAFETY_SENSITIVE'],
    purchasingPowerIndex: 1.3,
    payoutEnabled: true,
    monetizationRestricted: false,
  },
  {
    countryCode: 'CZ',
    region: 'EU',
    languageCodes: ['cs'],
    currency: 'CZK',
    asoScore: 75,
    trustScore: 0.75,
    fraudRiskScore: 35,
    legalRiskLevel: 'LOW',
    primarySegment: 'DATING_MATURE',
    purchasingPowerIndex: 0.9,
    payoutEnabled: true,
    monetizationRestricted: false,
  },
  {
    countryCode: 'SK',
    region: 'EU',
    languageCodes: ['sk'],
    currency: 'EUR',
    asoScore: 70,
    trustScore: 0.7,
    fraudRiskScore: 40,
    legalRiskLevel: 'LOW',
    primarySegment: 'EMERGING',
    purchasingPowerIndex: 0.85,
    payoutEnabled: true,
    monetizationRestricted: false,
  },
  
  // Western Europe
  {
    countryCode: 'FR',
    region: 'EU',
    languageCodes: ['fr'],
    currency: 'EUR',
    asoScore: 85,
    trustScore: 0.8,
    fraudRiskScore: 30,
    legalRiskLevel: 'MEDIUM',
    primarySegment: 'DATING_MATURE',
    secondarySegments: ['CREATOR_ECONOMY_RICH'],
    purchasingPowerIndex: 1.25,
    payoutEnabled: true,
    monetizationRestricted: false,
  },
  {
    countryCode: 'GB',
    region: 'EU',
    languageCodes: ['en'],
    currency: 'GBP',
    asoScore: 95,
    trustScore: 0.9,
    fraudRiskScore: 20,
    legalRiskLevel: 'LOW',
    primarySegment: 'PREMIUM',
    secondarySegments: ['DATING_MATURE', 'CREATOR_ECONOMY_RICH'],
    purchasingPowerIndex: 1.4,
    payoutEnabled: true,
    monetizationRestricted: false,
  },
  {
    countryCode: 'ES',
    region: 'EU',
    languageCodes: ['es'],
    currency: 'EUR',
    asoScore: 80,
    trustScore: 0.75,
    fraudRiskScore: 35,
    legalRiskLevel: 'LOW',
    primarySegment: 'YOUNG_DIGITAL',
    secondarySegments: ['DATING_MATURE'],
    purchasingPowerIndex: 1.1,
    payoutEnabled: true,
    monetizationRestricted: false,
  },
  {
    countryCode: 'IT',
    region: 'EU',
    languageCodes: ['it'],
    currency: 'EUR',
    asoScore: 75,
    trustScore: 0.7,
    fraudRiskScore: 40,
    legalRiskLevel: 'MEDIUM',
    primarySegment: 'DATING_MATURE',
    purchasingPowerIndex: 1.15,
    payoutEnabled: true,
    monetizationRestricted: false,
  },
  
  // Nordic Countries
  {
    countryCode: 'SE',
    region: 'EU',
    languageCodes: ['sv'],
    currency: 'SEK',
    asoScore: 90,
    trustScore: 0.9,
    fraudRiskScore: 15,
    legalRiskLevel: 'LOW',
    primarySegment: 'PREMIUM',
    secondarySegments: ['DATING_MATURE'],
    purchasingPowerIndex: 1.35,
    payoutEnabled: true,
    monetizationRestricted: false,
  },
  {
    countryCode: 'NO',
    region: 'EU',
    languageCodes: ['no'],
    currency: 'NOK',
    asoScore: 85,
    trustScore: 0.9,
    fraudRiskScore: 15,
    legalRiskLevel: 'LOW',
    primarySegment: 'PREMIUM',
    purchasingPowerIndex: 1.5,
    payoutEnabled: true,
    monetizationRestricted: false,
  },
  {
    countryCode: 'DK',
    region: 'EU',
    languageCodes: ['da'],
    currency: 'DKK',
    asoScore: 85,
    trustScore: 0.85,
    fraudRiskScore: 20,
    legalRiskLevel: 'LOW',
    primarySegment: 'PREMIUM',
    purchasingPowerIndex: 1.4,
    payoutEnabled: true,
    monetizationRestricted: false,
  },
  {
    countryCode: 'FI',
    region: 'EU',
    languageCodes: ['fi'],
    currency: 'EUR',
    asoScore: 80,
    trustScore: 0.85,
    fraudRiskScore: 20,
    legalRiskLevel: 'LOW',
    primarySegment: 'DATING_MATURE',
    purchasingPowerIndex: 1.3,
    payoutEnabled: true,
    monetizationRestricted: false,
  },
  
  // Americas
  {
    countryCode: 'US',
    region: 'AMERICAS',
    languageCodes: ['en'],
    currency: 'USD',
    asoScore: 95,
    trustScore: 0.85,
    fraudRiskScore: 30,
    legalRiskLevel: 'MEDIUM',
    primarySegment: 'CREATOR_ECONOMY_RICH',
    secondarySegments: ['PREMIUM', 'DATING_MATURE'],
    purchasingPowerIndex: 1.3,
    payoutEnabled: true,
    monetizationRestricted: false,
  },
  {
    countryCode: 'CA',
    region: 'AMERICAS',
    languageCodes: ['en', 'fr'],
    currency: 'CAD',
    asoScore: 85,
    trustScore: 0.85,
    fraudRiskScore: 25,
    legalRiskLevel: 'LOW',
    primarySegment: 'PREMIUM',
    secondarySegments: ['DATING_MATURE'],
    purchasingPowerIndex: 1.25,
    payoutEnabled: true,
    monetizationRestricted: false,
  },
  {
    countryCode: 'MX',
    region: 'LATAM',
    languageCodes: ['es'],
    currency: 'MXN',
    asoScore: 70,
    trustScore: 0.65,
    fraudRiskScore: 50,
    legalRiskLevel: 'MEDIUM',
    primarySegment: 'YOUNG_DIGITAL',
    secondarySegments: ['PRICE_SENSITIVE'],
    purchasingPowerIndex: 0.6,
    payoutEnabled: true,
    monetizationRestricted: false,
  },
  {
    countryCode: 'BR',
    region: 'LATAM',
    languageCodes: ['pt-BR'],
    currency: 'BRL',
    asoScore: 75,
    trustScore: 0.7,
    fraudRiskScore: 55,
    legalRiskLevel: 'HIGH',
    primarySegment: 'YOUNG_DIGITAL',
    secondarySegments: ['CREATOR_ECONOMY_RICH', 'FRAUD_INTENSIVE'],
    purchasingPowerIndex: 0.55,
    payoutEnabled: true,
    monetizationRestricted: false,
  },
  {
    countryCode: 'AR',
    region: 'LATAM',
    languageCodes: ['es'],
    currency: 'ARS',
    asoScore: 65,
    trustScore: 0.6,
    fraudRiskScore: 60,
    legalRiskLevel: 'HIGH',
    primarySegment: 'PRICE_SENSITIVE',
    secondarySegments: ['FRAUD_INTENSIVE'],
    purchasingPowerIndex: 0.4,
    payoutEnabled: false,
    monetizationRestricted: false,
  },
  
  // MENA Region
  {
    countryCode: 'AE',
    region: 'MENA',
    languageCodes: ['ar', 'en'],
    currency: 'AED',
    asoScore: 70,
    trustScore: 0.7,
    fraudRiskScore: 45,
    legalRiskLevel: 'HIGH',
    primarySegment: 'PREMIUM',
    secondarySegments: ['SAFETY_SENSITIVE'],
    purchasingPowerIndex: 1.2,
    payoutEnabled: true,
    monetizationRestricted: true,
    featureOverrides: {
      contentModerationStrict: true,
    },
  },
  {
    countryCode: 'SA',
    region: 'MENA',
    languageCodes: ['ar'],
    currency: 'SAR',
    asoScore: 60,
    trustScore: 0.65,
    fraudRiskScore: 50,
    legalRiskLevel: 'HIGH',
    primarySegment: 'SAFETY_SENSITIVE',
    secondarySegments: ['EMERGING'],
    purchasingPowerIndex: 1.15,
    payoutEnabled: true,
    monetizationRestricted: true,
    featureOverrides: {
      contentModerationStrict: true,
      ageVerificationRequired: true,
    },
  },
  
  // APAC
  {
    countryCode: 'JP',
    region: 'APAC',
    languageCodes: ['ja'],
    currency: 'JPY',
    asoScore: 80,
    trustScore: 0.8,
    fraudRiskScore: 30,
    legalRiskLevel: 'MEDIUM',
    primarySegment: 'PREMIUM',
    secondarySegments: ['SAFETY_SENSITIVE'],
    purchasingPowerIndex: 1.25,
    payoutEnabled: true,
    monetizationRestricted: false,
  },
  {
    countryCode: 'KR',
    region: 'APAC',
    languageCodes: ['ko'],
    currency: 'KRW',
    asoScore: 85,
    trustScore: 0.8,
    fraudRiskScore: 35,
    legalRiskLevel: 'MEDIUM',
    primarySegment: 'YOUNG_DIGITAL',
    secondarySegments: ['CREATOR_ECONOMY_RICH'],
    purchasingPowerIndex: 1.15,
    payoutEnabled: true,
    monetizationRestricted: false,
  },
  {
    countryCode: 'AU',
    region: 'APAC',
    languageCodes: ['en'],
    currency: 'AUD',
    asoScore: 90,
    trustScore: 0.85,
    fraudRiskScore: 25,
    legalRiskLevel: 'LOW',
    primarySegment: 'PREMIUM',
    secondarySegments: ['DATING_MATURE'],
    purchasingPowerIndex: 1.2,
    payoutEnabled: true,
    monetizationRestricted: false,
  },
  {
    countryCode: 'NZ',
    region: 'APAC',
    languageCodes: ['en'],
    currency: 'NZD',
    asoScore: 80,
    trustScore: 0.85,
    fraudRiskScore: 20,
    legalRiskLevel: 'LOW',
    primarySegment: 'DATING_MATURE',
    purchasingPowerIndex: 1.1,
    payoutEnabled: true,
    monetizationRestricted: false,
  },
  {
    countryCode: 'IN',
    region: 'APAC',
    languageCodes: ['hi', 'en'],
    currency: 'INR',
    asoScore: 70,
    trustScore: 0.65,
    fraudRiskScore: 65,
    legalRiskLevel: 'HIGH',
    primarySegment: 'PRICE_SENSITIVE',
    secondarySegments: ['FRAUD_INTENSIVE', 'EMERGING'],
    purchasingPowerIndex: 0.4,
    payoutEnabled: false,
    monetizationRestricted: true,
  },
];

/**
 * Seed all country data
 */
export async function seedAllCountries(): Promise<{
  success: number;
  failed: number;
  errors: string[];
}> {
  let success = 0;
  let failed = 0;
  const errors: string[] = [];
  
  for (const config of COUNTRY_CONFIGS) {
    try {
      await seedCountry(config);
      success++;
      console.log(`✓ Seeded ${config.countryCode}`);
    } catch (error) {
      failed++;
      const errorMsg = `Failed to seed ${config.countryCode}: ${error}`;
      errors.push(errorMsg);
      console.error(errorMsg);
    }
  }
  
  return { success, failed, errors };
}

/**
 * Seed a single country
 */
export async function seedCountry(config: CountryConfig): Promise<void> {
  // Create readiness profile
  await Readiness.createCountryProfile({
    countryCode: config.countryCode,
    region: config.region,
    languageCodes: config.languageCodes,
    currency: config.currency,
    asoScore: config.asoScore,
    trustScore: config.trustScore,
    fraudRiskScore: config.fraudRiskScore,
    paymentProviderReady: true,
    supportCoverageReady: config.languageCodes.length <= 2,
    legalRiskLevel: config.legalRiskLevel,
  });
  
  // Initialize feature flags
  await FeatureFlags.initializeCountryFlags(config.countryCode, config.featureOverrides);
  
  // Create payment profile
  await Pricing.createCountryPaymentProfile(config.countryCode, config.currency, {
    purchasingPowerIndex: config.purchasingPowerIndex,
    payoutEnabled: config.payoutEnabled,
    monetizationRestricted: config.monetizationRestricted,
  });
  
  // Create market segmentation
  await Segmentation.createCountryMarketProfile(
    config.countryCode,
    config.primarySegment,
    {
      secondarySegments: config.secondarySegments,
    }
  );
}
