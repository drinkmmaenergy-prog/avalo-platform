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
export const TOKEN_PAYOUT_RATE_PLN = 0.04; // 1 token = 0.04 PLN
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
  creatorShare?: number;
  avaloShare?: number;
  payoutRatePlnPerToken?: number;
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
  creatorId: string;
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
  creatorShare: number;
  platformShare: number;
  taxWithholding: number;
  creator?: number;
  avalo?: number;
  [key: string]: any;
}

export function getRevenueSplit(context: TokenomicsContext | string): RevenueSplit {
  // Default 70/30 split
  // If string is passed, treat it as the type
  const ctx: TokenomicsContext = typeof context === 'string' ? { type: context } : context;
  return {
    creatorShare: 0.70,
    platformShare: 0.30,
    taxWithholding: 0,
  };
}

export function validateSplit(
  split: RevenueSplit | { creator?: number; avalo?: number },
  expectedSplit?: RevenueSplit
): boolean {
  // Handle both forms: single split validation or comparison
  if (expectedSplit) {
    // Compare actual vs expected
    const actualCreator = (split as any).creator ?? (split as RevenueSplit).creatorShare ?? 0;
    const actualAvalo = (split as any).avalo ?? (split as RevenueSplit).platformShare ?? 0;
    const expectedCreator = expectedSplit.creator ?? expectedSplit.creatorShare ?? 0;
    const expectedAvalo = expectedSplit.avalo ?? expectedSplit.platformShare ?? 0;
    return Math.abs(actualCreator - expectedCreator) < 0.001 && Math.abs(actualAvalo - expectedAvalo) < 0.001;
  }
  // Single split validation
  const revSplit = split as RevenueSplit;
  const total = (revSplit.creatorShare ?? 0) + (revSplit.platformShare ?? 0) + (revSplit.taxWithholding ?? 0);
  return Math.abs(total - 1.0) < 0.001;
}
