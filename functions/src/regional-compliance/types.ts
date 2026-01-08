/**
 * PACK 199: Avalo Global Expansion Protocol
 * Types and Interfaces for Regional Compliance
 */

import { Timestamp } from 'firebase-admin/firestore';

export interface ImmutableCoreRules {
  minimumAge: 18;
  requiresIDVerification: true;
  nsfwMonetizationAllowed: false;
  payForRomanceAllowed: false;
  escortServicesAllowed: false;
  revenueSplit: { creator: 65; platform: 35 };
  tokenDiscountsAllowed: false;
  gamblingAllowed: false;
  beautyRankingAllowed: false;
  wealthRankingAllowed: false;
}

export const IMMUTABLE_CORE: ImmutableCoreRules = {
  minimumAge: 18,
  requiresIDVerification: true,
  nsfwMonetizationAllowed: false,
  payForRomanceAllowed: false,
  escortServicesAllowed: false,
  revenueSplit: { creator: 65, platform: 35 },
  tokenDiscountsAllowed: false,
  gamblingAllowed: false,
  beautyRankingAllowed: false,
  wealthRankingAllowed: false,
};

export type RegionCode = 'US' | 'EU' | 'UK' | 'BR' | 'AE' | 'SA' | 'JP' | 'KR' | 'IN' | 'AU' | 'OTHER';

export interface RegionalRule {
  id: string;
  regionCode: RegionCode;
  countryCode: string;
  enabled: boolean;
  lastUpdated: Timestamp;
  version: string;
  legalFramework: LegalFramework;
  safetyRules: SafetyRule[];
  marketplaceRestrictions: MarketplaceRestriction[];
  uxAdaptations: UXAdaptation[];
}

export interface LegalFramework {
  dataProtection: DataProtectionRule[];
  advertisingRules: AdvertisingRule[];
  contentModeration: ContentModerationRule[];
  consumerProtection: ConsumerProtectionRule[];
  financialCompliance: FinancialComplianceRule[];
}

export interface DataProtectionRule {
  ruleName: string;
  description: string;
  enforced: boolean;
  minAge: number;
  consentRequired: boolean;
  dataRetentionDays: number;
  rightToErasure: boolean;
  dataPortability: boolean;
  geoBlocking: boolean;
}

export interface AdvertisingRule {
  ruleName: string;
  transparencyRequired: boolean;
  disclosureFormat: string;
  restrictedCategories: string[];
}

export interface ContentModerationRule {
  ruleName: string;
  modestyRequired: boolean;
  defamationSensitivity: 'low' | 'medium' | 'high' | 'critical';
  harassmentThreshold: number;
  streamingRestrictions: string[];
}

export interface ConsumerProtectionRule {
  ruleName: string;
  refundPeriodDays: number;
  coolingOffPeriod: boolean;
  mandatoryWarnings: string[];
}

export interface FinancialComplianceRule {
  ruleName: string;
  cryptoAllowed: boolean;
  taxReporting: boolean;
  antiMoneyLaundering: boolean;
  kycRequired: boolean;
}

export interface SafetyRule {
  id: string;
  category: 'cyberbullying' | 'doxxing' | 'defamation' | 'harassment' | 'emergency';
  threshold: number;
  autoEscalate: boolean;
  localAuthorities: EmergencyContact[];
  terminology: SafetyTerminology;
}

export interface EmergencyContact {
  type: 'police' | 'crisis' | 'mental-health' | 'domestic-violence' | 'child-protection';
  name: string;
  phone: string;
  website?: string;
  available24x7: boolean;
}

export interface SafetyTerminology {
  offensive: string[];
  sensitive: string[];
  prohibited: string[];
}

export interface MarketplaceRestriction {
  category: string;
  subcategory: string;
  prohibited: boolean;
  requiresLicense: boolean;
  ageRestricted: boolean;
  warningRequired: boolean;
  autoRemove: boolean;
  reason: string;
}

export interface UXAdaptation {
  type: 'onboarding' | 'legal-popup' | 'tutorial' | 'resource' | 'warning';
  contentKey: string;
  language: string;
  mandatory: boolean;
  frequency: 'once' | 'daily' | 'weekly' | 'monthly' | 'on-action';
}

export interface RegionalSafetyFlag {
  id: string;
  userId: string;
  regionCode: RegionCode;
  flagType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  autoResolved: boolean;
  escalated: boolean;
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
  metadata: Record<string, any>;
}

export interface RegionalMarketplaceItem {
  itemId: string;
  creatorId: string;
  category: string;
  subcategory: string;
  allowedRegions: RegionCode[];
  blockedRegions: RegionCode[];
  regionalRestrictions: Record<string, string>;
  complianceCheckedAt: Timestamp;
}

export interface RegionalLegalPacket {
  id: string;
  regionCode: RegionCode;
  countryCode: string;
  type: 'terms' | 'privacy' | 'cookies' | 'creator-agreement' | 'marketplace-rules';
  version: string;
  content: string;
  effectiveDate: Timestamp;
  language: string;
  mandatory: boolean;
}

export interface UserRegionalProfile {
  userId: string;
  regionCode: RegionCode;
  countryCode: string;
  timezone: string;
  language: string;
  detectedAt: Timestamp;
  verifiedAt?: Timestamp;
  legalPacketsAccepted: Record<string, string>;
  complianceStatus: 'pending' | 'verified' | 'restricted';
}

export interface RegionalComplianceResult {
  allowed: boolean;
  regionCode: RegionCode;
  restrictions: string[];
  warnings: string[];
  requiredActions: string[];
  appliedRules: string[];
}

export interface AllowedCulturalFilter {
  language: string;
  interests: string[];
  profession: string;
  hobbies: string[];
  lifestyle: string;
  educationGoals: string[];
  timezone: string;
}

export interface ForbiddenCulturalFilter {
  race: never;
  ethnicity: never;
  religion: never;
  caste: never;
  socialClass: never;
  nationalityPreference: never;
  fetishTags: never;
  exoticization: never;
}

export interface RegionalComplianceConfig {
  stricterLawWins: boolean;
  defaultRegion: RegionCode;
  geoIPEnabled: boolean;
  userCanOverride: boolean;
  cacheMinutes: number;
  updateCheckInterval: 'daily' | 'weekly' | 'monthly';
}

export const DEFAULT_COMPLIANCE_CONFIG: RegionalComplianceConfig = {
  stricterLawWins: true,
  defaultRegion: 'OTHER',
  geoIPEnabled: true,
  userCanOverride: false,
  cacheMinutes: 60,
  updateCheckInterval: 'monthly',
};

export interface LawUpdateScanResult {
  scannedAt: Timestamp;
  regionsChecked: RegionCode[];
  updatesFound: number;
  updatesApplied: number;
  errors: string[];
  nextScanAt: Timestamp;
}