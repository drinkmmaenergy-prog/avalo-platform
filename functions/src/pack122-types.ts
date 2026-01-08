/**
 * PACK 122 — Cross-Country Expansion & Localization Infrastructure
 * Type definitions for regional policies, localization, and cultural safety
 * 
 * NON-NEGOTIABLE RULES:
 * - Token price remains globally fixed
 * - No regional discounts, bonuses, or promo codes
 * - No discovery ranking based on region
 * - NSFW rules enforced strictly (PACK 108)
 * - Payout/KYC rules enforced (PACK 84/105)
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// REGIONAL POLICY PROFILES
// ============================================================================

/**
 * Comprehensive regional policy profile
 * Extends PACK 91 regional policies with compliance and safety features
 */
export interface RegionPolicyProfile {
  // Identity
  regionCode: string;                    // ISO-2 country code (US, PL, DE, etc.)
  regionName: string;                    // Full country name
  regionGroup?: 'EU' | 'NA' | 'APAC' | 'MENA' | 'LATAM' | 'OTHER';
  
  // Content Guardrails (from PACK 108)
  guardrails: {
    NSFW_ALLOWED: boolean;               // Can users view NSFW content?
    NSFW_EXPLICIT_ALLOWED: boolean;      // Can users view explicit NSFW?
    NSFW_MONETIZATION_ALLOWED: boolean;  // Can creators monetize NSFW?
    POLITICAL_CONTENT_RESTRICTED: boolean; // Political content blocked?
  };
  
  // Age Verification Requirements
  ageRules: {
    minimumAge: number;                  // Minimum age to use platform
    ageVerificationRequired: boolean;    // Selfie/ID verification needed?
    ageVerificationDepth: 'NONE' | 'BASIC' | 'ENHANCED' | 'GOVERNMENT_ID';
    nsfwMinimumAge: number;              // Minimum age for NSFW content
  };
  
  // Advertising Restrictions (PACK 121 integration)
  adsRestrictions: string[];             // Banned ad categories for region
  
  // Payout Availability (PACK 84/105 integration)
  payoutAvailability: boolean;           // Can creators cash out earnings?
  payoutPSPs: Array<'STRIPE' | 'WISE' | 'PAYPAL'>;
  payoutMinimum?: number;                // Minimum payout threshold (tokens)
  
  // Data & Privacy (PACK 93 GDPR integration)
  dataRetentionRules: {
    maxRetentionDays: number;            // Max days to retain user data
    rightToErasure: boolean;             // User can request deletion?
    dataLocalization: boolean;           // Data must stay in region?
    thirdPartySharing: boolean;          // Can share with 3rd parties?
  };
  
  // Messaging & Communication Restrictions
  messagingRestrictions: {
    blockCrossBorderDMs: boolean;        // Block DMs from other regions?
    contentModerationLevel: 'LIGHT' | 'STANDARD' | 'STRICT';
    autoTranslateEnabled: boolean;       // Auto-translate messages?
    harassmentDetectionLevel: 'LIGHT' | 'STANDARD' | 'AGGRESSIVE';
  };
  
  // Deletion & Account Management
  userDeletionTimeline: number;          // Days to complete account deletion
  
  // Compliance Metadata
  complianceNotes?: string;              // Legal notes for region
  lastReviewedAt: Timestamp;
  lastReviewedBy?: string;               // Admin user ID
  effectiveFrom: Timestamp;
  
  // System Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  enabled: boolean;                      // Is this policy active?
}

// ============================================================================
// LOCALIZATION SYSTEM
// ============================================================================

/**
 * Supported languages (42+)
 */
export type SupportedLanguage =
  | 'en' | 'es' | 'pt' | 'pl' | 'fr' | 'de' | 'it' | 'ro' | 'hu'
  | 'cs' | 'sk' | 'bg' | 'uk' | 'ru' | 'tr' | 'ar' | 'th' | 'id'
  | 'ja' | 'ko' | 'zh' | 'vi' | 'hi' | 'bn' | 'mr' | 'ta' | 'te'
  | 'nl' | 'sv' | 'no' | 'da' | 'fi' | 'el' | 'he' | 'fa' | 'ur'
  | 'ms' | 'tl' | 'sw' | 'am' | 'km' | 'lo' | 'my' | 'ka';

/**
 * Language metadata
 */
export interface LanguageProfile {
  code: SupportedLanguage;
  name: string;                          // Native name (e.g., "Español")
  nameEnglish: string;                   // English name
  rtl: boolean;                          // Right-to-left script?
  regions: string[];                     // Primary regions using this language
  enabled: boolean;
}

/**
 * User language preference
 */
export interface UserLanguagePreference {
  userId: string;
  language: SupportedLanguage;
  autoDetected: boolean;                 // Was auto-detected from device?
  setAt: Timestamp;
  canChangeAfter?: Timestamp;            // Cooldown (if applicable)
}

/**
 * Localization namespace
 */
export type LocalizationNamespace =
  | 'auth'
  | 'profile'
  | 'feed'
  | 'chat'
  | 'payments'
  | 'support'
  | 'settings'
  | 'safety'
  | 'legal'
  | 'onboarding'
  | 'creator'
  | 'moderation';

// ============================================================================
// CULTURAL SAFETY CLASSIFICATION
// ============================================================================

/**
 * Cultural safety concern types
 */
export type CulturalSafetyConcern =
  | 'HATE_SYMBOLISM'               // Nazi symbols, hate group imagery
  | 'ETHNIC_SLUR'                  // Racist/ethnic slurs
  | 'XENOPHOBIA'                   // Anti-immigrant/xenophobic content
  | 'POLITICAL_PROPAGANDA'         // Political propaganda in restricted regions
  | 'RELIGIOUS_OFFENSE'            // Content offensive to religious groups
  | 'CULTURAL_APPROPRIATION'       // Inappropriate cultural references
  | 'REGIONAL_SLANG_HARASSMENT'    // Harassment using local slang
  | 'HISTORICAL_SENSITIVITY'       // References to sensitive historical events
  | 'GENDER_HARASSMENT'            // Gender-based harassment
  | 'LGBTQ_HARASSMENT';            // LGBTQ+ targeted harassment

/**
 * Cultural safety classification result
 */
export interface CulturalSafetyClassification {
  contentId: string;
  contentType: 'POST' | 'MESSAGE' | 'PROFILE' | 'COMMENT';
  
  // Detection
  detected: boolean;
  concerns: CulturalSafetyConcern[];
  confidence: number;                    // 0-1 confidence score
  detectedAt: Timestamp;
  
  // Context
  userRegion: string;
  contentLanguage?: string;
  
  // Action Taken
  action: 'NONE' | 'WARNING' | 'BLUR' | 'BLOCK' | 'REPORT';
  actionReason?: string;
  
  // Moderation
  moderationRequired: boolean;
  moderationStatus?: 'PENDING' | 'REVIEWED' | 'DISMISSED';
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  reviewNotes?: string;
}

/**
 * Cultural safety warning shown to user
 */
export interface CulturalSafetyWarning {
  warningId: string;
  userId: string;
  contentId: string;
  
  concern: CulturalSafetyConcern;
  message: string;                       // Localized warning message
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  // User Response
  userAcknowledged: boolean;
  userProceeded: boolean;                // Did user post anyway?
  acknowledgedAt?: Timestamp;
  
  // Auto-reporting
  autoReported: boolean;
  reportId?: string;
  
  createdAt: Timestamp;
}

// ============================================================================
// LOCALIZED SAFETY RESOURCES
// ============================================================================

/**
 * Emergency/crisis resource by region
 */
export interface SafetyResource {
  resourceId: string;
  region: string;                        // Country/region code
  
  // Resource Info
  type: 'CRISIS_HOTLINE' | 'MENTAL_HEALTH' | 'DOMESTIC_VIOLENCE' | 'LEGAL_AID' | 'YOUTH_HELPLINE';
  name: string;
  phoneNumber?: string;
  website?: string;
  textNumber?: string;
  availableHours?: string;
  
  // Display
  description: string;
  displayPriority: number;
  iconUrl?: string;
  
  // Localization
  language: SupportedLanguage;
  
  // Metadata
  verified: boolean;
  lastVerifiedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  enabled: boolean;
}

/**
 * Mapping of regions to safety resources
 */
export interface RegionalSafetyResources {
  region: string;
  resources: SafetyResource[];
  lastUpdated: Timestamp;
}

// ============================================================================
// COMPLIANCE & ENFORCEMENT
// ============================================================================

/**
 * Payout verification check
 */
export interface PayoutVerificationCheck {
  userId: string;
  
  // Document verification
  documentCountry: string;
  documentType: 'PASSPORT' | 'ID_CARD' | 'DRIVERS_LICENSE';
  documentVerified: boolean;
  
  // Payment method verification
  paymentMethodCountry: string;
  paymentMethodType: 'BANK_ACCOUNT' | 'CARD' | 'DIGITAL_WALLET';
  paymentMethodVerified: boolean;
  
  // Location verification
  ipCountry: string;
  gpsCountry?: string;
  phoneCountry?: string;
  
  // Consistency check
  allConsistent: boolean;
  inconsistencies: string[];
  
  // Result
  verified: boolean;
  failureReason?: string;
  verifiedAt?: Timestamp;
  expiresAt?: Timestamp;
}

/**
 * Regional restriction violation
 */
export interface RegionalViolation {
  violationId: string;
  userId: string;
  
  violationType: 'PAYOUT_LOCATION_MISMATCH' | 'VPN_DETECTED' | 'RESTRICTED_CONTENT' | 'BYPASS_ATTEMPT';
  
  // Detection
  detectedAt: Timestamp;
  detectedBy: 'SYSTEM' | 'MODERATOR';
  
  // Evidence
  evidence: {
    ipAddress?: string;
    gpsLocation?: string;
    documentCountry?: string;
    paymentCountry?: string;
    vpnDetected?: boolean;
  };
  
  // Action
  actionTaken: 'WARNING' | 'PAYOUT_HOLD' | 'ACCOUNT_RESTRICTION' | 'ACCOUNT_SUSPENSION';
  actionDetails?: string;
  
  // Resolution
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'APPEALED';
  resolvedAt?: Timestamp;
  resolvedBy?: string;
  resolutionNotes?: string;
}

// ============================================================================
// MOBILE UI TYPES
// ============================================================================

/**
 * Compliance notice to display to user
 */
export interface ComplianceNotice {
  noticeId: string;
  type: 'NSFW_NOT_AVAILABLE' | 'PAYOUT_NOT_SUPPORTED' | 'ADS_CATEGORY_DISABLED' | 'CONTENT_RESTRICTED';
  
  // Display
  title: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  dismissible: boolean;
  
  // Context
  featureAffected?: string;
  region?: string;
  
  // Actions
  actionLabel?: string;
  actionUrl?: string;
  
  // Tracking
  shownAt: Timestamp;
  dismissedAt?: Timestamp;
}

/**
 * Language and region settings for mobile
 */
export interface LanguageRegionSettings {
  userId: string;
  
  // Language
  selectedLanguage: SupportedLanguage;
  autoDetectedLanguage?: SupportedLanguage;
  
  // Region
  selectedRegion: string;                // User-selected region
  autoDetectedRegion: string;            // IP/GPS detected region
  regionOverride?: string;               // Manual override if legal
  
  // Preferences
  autoTranslate: boolean;
  showRegionalContent: boolean;
  
  // Metadata
  lastUpdated: Timestamp;
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Region detection result
 */
export interface RegionDetectionResult {
  country: string;
  detectionMethod: 'IP' | 'GPS' | 'PROFILE' | 'PHONE' | 'PAYMENT';
  confidence: number;                    // 0-1
  detectedAt: Timestamp;
}

/**
 * Multi-factor region verification
 */
export interface RegionVerification {
  userId: string;
  
  detections: RegionDetectionResult[];
  
  // Consensus
  consensusRegion: string;
  consensusConfidence: number;
  inconsistencies: string[];
  
  verified: boolean;
  verifiedAt: Timestamp;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default safety resources (if region-specific not available)
 */
export const GLOBAL_SAFETY_RESOURCES = {
  CRISIS: {
    name: 'International Association for Suicide Prevention',
    website: 'https://www.iasp.info/resources/Crisis_Centres/',
  },
  MENTAL_HEALTH: {
    name: 'Mental Health America',
    website: 'https://www.mhanational.org/finding-help',
  },
};

/**
 * Region groups
 */
export const REGION_GROUPS = {
  EU: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'],
  NA: ['US', 'CA', 'MX'],
  APAC: ['AU', 'NZ', 'JP', 'KR', 'SG', 'TH', 'ID', 'MY', 'PH', 'VN', 'IN'],
  MENA: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'EG', 'JO', 'LB', 'TR', 'IL'],
  LATAM: ['BR', 'AR', 'CL', 'CO', 'PE', 'VE', 'UY', 'PY'],
} as const;

/**
 * Crisis resources by country (examples - expand as needed)
 */
export const CRISIS_RESOURCES_BY_COUNTRY: Record<string, SafetyResource[]> = {
  US: [{
    resourceId: 'us_988',
    region: 'US',
    type: 'CRISIS_HOTLINE',
    name: '988 Suicide & Crisis Lifeline',
    phoneNumber: '988',
    website: 'https://988lifeline.org',
    availableHours: '24/7',
    description: 'Free and confidential support for people in distress',
    displayPriority: 1,
    language: 'en',
    verified: true,
    lastVerifiedAt: Timestamp.now(),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    enabled: true,
  }],
  GB: [{
    resourceId: 'uk_samaritans',
    region: 'GB',
    type: 'CRISIS_HOTLINE',
    name: 'Samaritans',
    phoneNumber: '116 123',
    website: 'https://www.samaritans.org',
    availableHours: '24/7',
    description: 'Whatever you\'re going through, call us for free',
    displayPriority: 1,
    language: 'en',
    verified: true,
    lastVerifiedAt: Timestamp.now(),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    enabled: true,
  }],
  DE: [{
    resourceId: 'de_telefonseelsorge',
    region: 'DE',
    type: 'CRISIS_HOTLINE',
    name: 'TelefonSeelsorge',
    phoneNumber: '0800 111 0 111',
    website: 'https://www.telefonseelsorge.de',
    availableHours: '24/7',
    description: 'Kostenlose Beratung bei Sorgen und Problemen',
    displayPriority: 1,
    language: 'de',
    verified: true,
    lastVerifiedAt: Timestamp.now(),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    enabled: true,
  }],
  PL: [{
    resourceId: 'pl_116123',
    region: 'PL',
    type: 'CRISIS_HOTLINE',
    name: 'Linia Wsparcia 116 123',
    phoneNumber: '116 123',
    website: 'https://116123.pl',
    availableHours: '24/7',
    description: 'Anonimowe i bezpłatne wsparcie emocjonalne',
    displayPriority: 1,
    language: 'pl',
    verified: true,
    lastVerifiedAt: Timestamp.now(),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    enabled: true,
  }],
};