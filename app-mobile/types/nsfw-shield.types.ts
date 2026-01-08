/**
 * PACK 249 - AI Chat Shield for NSFW & Sexting Risk Management
 * 
 * CORE PRINCIPLE: Sex between adults is OK — crimes are NOT.
 * This system allows flirting, sexting, dirty-talk, and consensual adult content.
 * It ONLY blocks illegal content: minors, non-consent, incest, forced sex.
 */

export interface NSFWConsent {
  userId: string;
  chatId: string;
  consentedAt: Date;
  consentVersion: string; // e.g., "1.0"
  isAdult: boolean; // Confirmed 18+
  acceptedTerms: boolean;
}

export interface NSFWSafeZone {
  chatId: string;
  participantIds: string[];
  bothConsented: boolean;
  activatedAt?: Date;
  consentRecords: {
    [userId: string]: {
      consented: boolean;
      consentedAt?: Date;
    };
  };
}

export interface NSFWDetection {
  messageId: string;
  chatId: string;
  senderId: string;
  receiverId: string;
  messageText: string;
  detectedAt: Date;
  contentType: NSFWContentType;
  riskLevel: NSFWRiskLevel;
  prohibitedPatterns: ProhibitedPattern[];
  requiresCloudAnalysis: boolean;
  actionTaken: NSFWAction;
}

export type NSFWContentType =
  | 'SAFE_FLIRT'           // Safe flirting, allowed
  | 'SAFE_SEXTING'         // Consensual sexting, allowed
  | 'SAFE_DIRTY_TALK'      // Dirty talk, allowed
  | 'SAFE_FANTASY'         // Sexual fantasy, allowed
  | 'NEEDS_CONSENT'        // Explicit content, needs consent first
  | 'PROHIBITED_MINOR'     // Minor content, BLOCKED
  | 'PROHIBITED_NONCONSENT'// Non-consensual, BLOCKED
  | 'PROHIBITED_INCEST'    // Incest roleplay, BLOCKED
  | 'PROHIBITED_FORCED'    // Forced sex, BLOCKED
  | 'PROHIBITED_CRIME'     // Crime-related sexual acts, BLOCKED
  | 'GRAY_ZONE';           // Needs review, proceed with caution

export type NSFWRiskLevel = 'SAFE' | 'CONSENT_NEEDED' | 'GRAY_ZONE' | 'PROHIBITED';

export type NSFWAction =
  | 'ALLOW'                // Message allowed
  | 'REQUEST_CONSENT'      // Ask for consent before allowing
  | 'BLOCK_IMMEDIATE'      // Block immediately
  | 'FLAG_FOR_REVIEW'      // Allow but flag for moderation
  | 'WARN_USER';           // Show warning but allow

export interface ProhibitedPattern {
  type: ProhibitedContentType;
  matchedPhrase: string;
  confidence: number; // 0.0 - 1.0
  context: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export type ProhibitedContentType =
  | 'MINOR_AGE_MENTION'      // "14 years old", "teenager"
  | 'MINOR_ROLEPLAY'         // "pretend you're underage"
  | 'UNDERAGE_SCENARIO'      // School roleplay with minors implied
  | 'FORCED_SEX'             // Rape, forced, non-consent
  | 'NON_CONSENT'            // "doesn't matter if you want"
  | 'INCEST_DIRECT'          // Brother, sister, father, mother
  | 'INCEST_IMPLIED'         // Step-family with sexual context
  | 'VIOLENCE_EXTREME'       // Torture, violence during sex
  | 'TRAFFICKING'            // Sex trafficking indicators
  | 'EXTERNAL_EXPLICIT_SALE';// Selling explicit content outside app

/**
 * Detection patterns for PROHIBITED content only
 * IMPORTANT: Normal adult sexting is NOT detected here
 */
export interface ProhibitedPatternDef {
  type: ProhibitedContentType;
  keywords: string[];
  regex?: RegExp;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requiresContext?: boolean;
  blockImmediate: boolean; // True = instant block, false = flag for review
}

/**
 * PROHIBITED PATTERNS - Illegal content only
 * Flirting, sexting, dirty-talk, and adult fantasies are NOT included
 */
export const PROHIBITED_NSFW_PATTERNS: ProhibitedPatternDef[] = [
  // MINORS - CRITICAL (Instant block)
  {
    type: 'MINOR_AGE_MENTION',
    keywords: [
      'under 18',
      'under18',
      '17 years',
      '16 years',
      '15 years',
      '14 years',
      '13 years',
      '12 years',
      'underage',
      'minor',
      'child',
      'kid',
      'teenager sex',
      'teen sex',
      'young boy',
      'young girl',
      'school girl sex',
      'school boy sex',
    ],
    severity: 'CRITICAL',
    blockImmediate: true,
  },
  {
    type: 'MINOR_ROLEPLAY',
    keywords: [
      'pretend you are underage',
      'act like a child',
      'roleplay as minor',
      'be my daughter',
      'be my son',
      'daddy daughter',
      'father daughter play',
    ],
    severity: 'CRITICAL',
    blockImmediate: true,
  },
  
  // NON-CONSENT - CRITICAL (Instant block)
  {
    type: 'FORCED_SEX',
    keywords: [
      'force you',
      'rape you',
      'don\'t care if you want',
      'doesn\'t matter if you say no',
      'against your will',
      'make you do it',
      'you have no choice',
    ],
    severity: 'CRITICAL',
    blockImmediate: true,
  },
  {
    type: 'NON_CONSENT',
    keywords: [
      'even if you don\'t want',
      'ignore your no',
      'silence means yes',
      'you can\'t resist',
      'can\'t say no',
    ],
    severity: 'CRITICAL',
    blockImmediate: true,
  },
  
  // INCEST - HIGH (Instant block)
  {
    type: 'INCEST_DIRECT',
    keywords: [
      'my sister sex',
      'my brother sex',
      'my mother sex',
      'my father sex',
      'my daughter sex',
      'my son sex',
      'family sex',
      'real incest',
    ],
    severity: 'HIGH',
    blockImmediate: true,
    requiresContext: true,
  },
  {
    type: 'INCEST_IMPLIED',
    keywords: [
      'stepdad',
      'stepmom',
      'stepbrother',
      'stepsister',
      'family roleplay',
    ],
    severity: 'HIGH',
    blockImmediate: false, // Flag only, context matters
    requiresContext: true,
  },
  
  // EXTREME VIOLENCE - HIGH
  {
    type: 'VIOLENCE_EXTREME',
    keywords: [
      'torture',
      'mutilation',
      'blood sex',
      'hurt you badly',
      'extreme pain',
    ],
    severity: 'HIGH',
    blockImmediate: true,
  },
  
  // TRAFFICKING - CRITICAL
  {
    type: 'TRAFFICKING',
    keywords: [
      'sell you',
      'trade you',
      'pimp you out',
      'make you work',
    ],
    severity: 'CRITICAL',
    blockImmediate: true,
  },
  
  // EXTERNAL EXPLICIT SALE - MEDIUM
  {
    type: 'EXTERNAL_EXPLICIT_SALE',
    keywords: [
      'buy my onlyfans',
      'subscribe to my',
      'pay me directly for nudes',
      'venmo for nudes',
      'cashapp for videos',
    ],
    severity: 'MEDIUM',
    blockImmediate: false,
  },
];

/**
 * Consent Configuration
 */
export interface NSFWConsentConfig {
  enabled: boolean;
  consentVersion: string;
  minAge: number; // Must be 18+
  consentMessage: string;
  consentButtonText: string;
  cancelButtonText: string;
}

export const DEFAULT_CONSENT_CONFIG: NSFWConsentConfig = {
  enabled: true,
  consentVersion: '1.0',
  minAge: 18,
  consentMessage: 'To continue explicit sexting, confirm you are 18+, and you consent.',
  consentButtonText: 'I\'m 18+ and I consent',
  cancelButtonText: 'Not now',
};

/**
 * Risk Score Tracking for NSFW content
 * Separate from romance scam (PACK 248)
 */
export interface NSFWUserRiskScore {
  userId: string;
  totalScore: number; // 0-100
  lastUpdated: Date;
  incidents: NSFWRiskIncident[];
  accountRestricted: boolean;
  requiresManualReview: boolean;
}

export interface NSFWRiskIncident {
  incidentId: string;
  timestamp: Date;
  type: ProhibitedContentType;
  severityPoints: number;
  messageId?: string;
  chatId?: string;
  actionTaken: NSFWAction;
}

/**
 * Detection thresholds for on-device vs cloud
 */
export const NSFW_DETECTION_THRESHOLDS = {
  ON_DEVICE_ONLY: 0.3,        // Confidence < 0.3 = on-device only
  CLOUD_ANALYSIS: 0.5,         // Confidence >= 0.5 = send to cloud
  IMMEDIATE_BLOCK: 0.8,        // Confidence >= 0.8 = instant block
  RISK_SCORE_WARNING: 30,      // Show warning at 30 points
  RISK_SCORE_RESTRICT: 60,     // Restrict account at 60 points
  RISK_SCORE_SUSPEND: 80,      // Suspend at 80 points
};

/**
 * Soft messaging - No shame, just information
 */
export const NSFW_SAFETY_MESSAGES = {
  CONSENT_PROMPT: 'To continue explicit sexting, confirm you are 18+, and you consent.',
  BOTH_CONSENT_NEEDED: 'Explicit content requires consent from both participants.',
  SAFE_ZONE_ACTIVE: 'You\'re in a private space. Keep it consensual, safe and between adults.',
  MINOR_WARNING: 'Some topics may be prohibited by law. Keep it consensual, safe and between adults.',
  REVIEW_FLAGGED: 'This conversation has been flagged for review. Please keep content legal and consensual.',
  CONTENT_BLOCKED: 'This message was blocked because it contains prohibited content.',
} as const;

/**
 * Chat metadata for NSFW tracking
 */
export interface NSFWChatMetadata {
  chatId: string;
  nsfwSafeZone: boolean;
  consentTimestamp?: Date;
  participantConsents: {
    [userId: string]: {
      consented: boolean;
      consentedAt?: Date;
    };
  };
  riskScore: number;
  flaggedForReview: boolean;
  lastContentCheck?: Date;
}