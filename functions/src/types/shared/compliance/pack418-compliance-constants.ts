import { MONETIZATION_SPLITS, SPLITS } from "../../../config/monetizationSplits";

// Pack 418 - Compliance Constants
export const COMPLIANCE_REGIONS = ['US', 'EU', 'UK', 'CA', 'AU', 'JP', 'KR', 'BR', 'IN', 'SG'] as const;
export type ComplianceRegion = typeof COMPLIANCE_REGIONS[number];

export const COMPLIANCE_FRAMEWORKS = ['GDPR', 'CCPA', 'LGPD', 'PIPA', 'PDPA', 'APPI'] as const;
export type ComplianceFramework = typeof COMPLIANCE_FRAMEWORKS[number];

export const DATA_CATEGORIES = ['PERSONAL', 'SENSITIVE', 'FINANCIAL', 'HEALTH', 'BIOMETRIC', 'LOCATION'] as const;
export type DataCategory = typeof DATA_CATEGORIES[number];

export const CONSENT_TYPES = ['MARKETING', 'ANALYTICS', 'PERSONALIZATION', 'THIRD_PARTY', 'DATA_SALE'] as const;
export type ConsentType = typeof CONSENT_TYPES[number];

export const RETENTION_PERIODS = {
  SHORT: 30,
  MEDIUM: 90,
  LONG: 365,
  EXTENDED: 730,
  PERMANENT: -1,
} as const;

export const COMPLIANCE_ACTIONS = ['AUDIT', 'REPORT', 'DELETE', 'EXPORT', 'ANONYMIZE', 'RESTRICT'] as const;
export type ComplianceAction = typeof COMPLIANCE_ACTIONS[number];

export interface ComplianceConfig {
  region?: ComplianceRegion;
  frameworks?: ComplianceFramework[];
  dataCategories?: DataCategory[];
  retentionDays?: number;
  [key: string]: any;
}

export interface ComplianceAuditLog {
  id?: string;
  action?: ComplianceAction;
  userId?: string;
  timestamp?: any;
  metadata?: Record<string, any>;
  [key: string]: any;
}


// Additional exports for pack418-compliance.service.ts
export const TOKEN_TOKEN_PAYOUT_USD = 0.04; // 1 token = 0.04 USD
export const AGE_MINIMUM_YEARS = 18;
export const REQUIRE_SELFIE_VERIFICATION_FOR_EARNING = true;
export const REQUIRE_SELFIE_FOR_MEETINGS_AND_EVENTS = true;

export const CONTENT_POLICY = {
  maxFileSize: 50 * 1024 * 1024, // 50MB
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
  allowedVideoTypes: ['video/mp4', 'video/webm'],
  maxVideoDuration: 300, // 5 minutes
  requireModeration: true,
  banMinorsAnyContext: true,
  banCSAM: true,
  banViolentSexualContent: true,
  banPoliticalReligiousWars: true,
};

export interface TokenomicsContext {
  userId?: string;
  region?: string;
  isCreator?: boolean;
  verificationLevel?: 'NONE' | 'BASIC' | 'FULL';
  type?: string;
  payoutRateUSDPerToken?: number;
  transactionId?: string;
  [key: string]: any;
}

export interface UserComplianceContext {
  userId?: string;
  age?: number;
  region?: string;
  verificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED';
  consentGiven?: boolean;
  entityId?: string;
  isVerified?: boolean;
  isEarning?: boolean;
  hasActiveMeetingsOrEvents?: boolean;
  [key: string]: any;
}

export interface ContentComplianceContext {
  contentId: string;
  contentType: string;
  earnerId: string;
  region: string;
  isAdultContent: boolean;
  userId?: string;
  isMinorFlagged?: boolean;
  isCSAMFlagged?: boolean;
  isBrutalViolentSexFlagged?: boolean;
  isPoliticsWarSpamFlagged?: boolean;
  isReligiousHateFlagged?: boolean;
  [key: string]: any;
}

export interface RevenueSplit {
  earner: number;
  platform: number;
  taxWithholding: number;
  [key: string]: any;
}

export function getRevenueSplit(context: TokenomicsContext | string): RevenueSplit {
  // Default 70/30 split
  // If string is passed, treat it as the type
  const ctx: TokenomicsContext = typeof context === 'string' ? { type: context } : context;
  return {
    earner: MONETIZATION_SPLITS.SUBSCRIPTION.earner,
    platform: MONETIZATION_SPLITS.SUBSCRIPTION.platform,
    taxWithholding: 0,
  };
}

export function validateSplit(
  split: RevenueSplit | {  platform?: number },
  expectedSplit?: RevenueSplit
): boolean {
  // Handle both forms: single split validation or comparison
  if (expectedSplit) {
    // Compare actual vs expected
    const actualCreator = (split as any).earner ?? (split as RevenueSplit).earner ?? 0;
    const actualAvalo = (split as any).platform ?? (split as RevenueSplit).platform ?? 0;
    const expectedCreator = expectedSplit.earner ?? expectedSplit.earner ?? 0;
    const expectedAvalo = expectedSplit.platform ?? expectedSplit.platform ?? 0;
    return Math.abs(actualCreator - expectedCreator) < 0.001 && Math.abs(actualAvalo - expectedAvalo) < 0.001;
  }
  // Single split validation
  const revSplit = split as RevenueSplit;
  const total = (revSplit.earner ?? 0) + (revSplit.platform ?? 0) + (revSplit.taxWithholding ?? 0);
  return Math.abs(total - 1.0) < 0.001;
}
































