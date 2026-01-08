/**
 * PACK 115 — Public Reputation & Trust Score Display
 * Type Definitions
 * 
 * NON-NEGOTIABLE RULES:
 * - Reputation NEVER affects discovery/ranking algorithms
 * - Reputation NEVER affects earnings or payouts
 * - Reputation NEVER affects token prices or revenue split
 * - NO paid options to boost reputation
 * - Reputation earned ONLY through verified safe behaviour
 * - Display is pure transparency layer for safety
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// REPUTATION LEVELS (PUBLIC DISPLAY)
// ============================================================================

export type ReputationLevel = 
  | 'LOW'              // 0-199
  | 'BELOW_AVERAGE'    // 200-399
  | 'MODERATE'         // 400-599
  | 'HIGH'             // 600-799
  | 'EXCELLENT';       // 800-1000

export interface ReputationLevelConfig {
  level: ReputationLevel;
  minScore: number;
  maxScore: number;
  label: string;
  description: string;
  color: string;
  icon: string;
}

export const REPUTATION_LEVELS: Record<ReputationLevel, ReputationLevelConfig> = {
  LOW: {
    level: 'LOW',
    minScore: 0,
    maxScore: 199,
    label: 'Low',
    description: 'Building trust',
    color: '#EF4444', // red
    icon: '🔰',
  },
  BELOW_AVERAGE: {
    level: 'BELOW_AVERAGE',
    minScore: 200,
    maxScore: 399,
    label: 'Below Average',
    description: 'Developing positive behaviour',
    color: '#F97316', // orange
    icon: '⚠️',
  },
  MODERATE: {
    level: 'MODERATE',
    minScore: 400,
    maxScore: 599,
    label: 'Moderate',
    description: 'Reliable member',
    color: '#6B7280', // grey
    icon: '✓',
  },
  HIGH: {
    level: 'HIGH',
    minScore: 600,
    maxScore: 799,
    label: 'High',
    description: 'Known for respectful behaviour',
    color: '#3B82F6', // blue
    icon: '🛡️',
  },
  EXCELLENT: {
    level: 'EXCELLENT',
    minScore: 800,
    maxScore: 1000,
    label: 'Excellent',
    description: 'Trusted community member',
    color: '#10B981', // emerald
    icon: '⭐',
  },
};

// ============================================================================
// REPUTATION SCORE (INTERNAL)
// ============================================================================

export interface UserReputationScore {
  userId: string;
  
  // Internal score (0-1000, never shown to users)
  internalScore: number;
  
  // Public display level (derived from internal score)
  publicLevel: ReputationLevel;
  
  // Score components (weighted, internal use only)
  components: {
    identityVerification: number;      // 0-200 (KYC, selfie-live)
    profileCompleteness: number;       // 0-100
    responsiveness: number;            // 0-100 (message response rate)
    conversationQuality: number;       // 0-150 (positive engagement)
    reportRatio: number;               // 0-150 (low report rate bonus)
    safetyCompliance: number;          // 0-200 (no violations)
    accountLongevity: number;          // 0-100 (time-based trust)
  };
  
  // Negative factors (applied as penalties)
  penalties: {
    confirmedViolations: number;       // -50 per violation
    spamFlags: number;                 // -30 per flag
    hostilityFlags: number;            // -40 per flag
    nsfwViolations: number;            // -60 per violation
    chargebackAttempts: number;        // -100 per attempt
    multiAccountAbuse: number;         // -150 per incident
  };
  
  // Calculation metadata
  calculatedAt: Timestamp;
  lastUpdatedAt: Timestamp;
  version: number; // for algorithm versioning
  
  // Abuse detection flags
  abuseDetection: {
    rapidScoreChanges: number;         // count of suspicious changes
    lastRapidChangeAt?: Timestamp;
    crossDeviceAnomalies: boolean;
    campaignManipulationDetected: boolean;
  };
}

// ============================================================================
// REPUTATION DISPLAY SETTINGS
// ============================================================================

export interface UserReputationDisplaySettings {
  userId: string;
  
  // Privacy control
  displayBadge: boolean;  // User can hide their trust badge
  
  // Last updated
  updatedAt: Timestamp;
}

// ============================================================================
// REPUTATION CHANGE NOTIFICATION
// ============================================================================

export type ReputationChangeType = 
  | 'LEVEL_INCREASED'
  | 'LEVEL_DECREASED'
  | 'SCORE_IMPROVED'
  | 'SCORE_DECLINED';

export interface ReputationChangeNotification {
  notificationId: string;
  userId: string;
  changeType: ReputationChangeType;
  
  // Change details
  previousLevel: ReputationLevel;
  newLevel: ReputationLevel;
  previousScore: number;
  newScore: number;
  
  // Messaging (neutral, educational)
  message: string;
  tip?: string;
  
  // Timestamp
  createdAt: Timestamp;
  read: boolean;
}

// ============================================================================
// REPUTATION AUDIT LOG
// ============================================================================

export interface ReputationAuditLog {
  logId: string;
  userId: string;
  
  // Change tracking
  previousScore: number;
  newScore: number;
  previousLevel: ReputationLevel;
  newLevel: ReputationLevel;
  
  // Trigger
  trigger: 'DAILY_RECALCULATION' | 'MANUAL_RECALCULATION' | 'TRUST_EVENT' | 'ENFORCEMENT_ACTION';
  triggerDetails?: string;
  
  // Component changes (for debugging)
  componentChanges?: Record<string, { before: number; after: number }>;
  
  // Timestamp
  calculatedAt: Timestamp;
}

// ============================================================================
// ABUSE DETECTION
// ============================================================================

export interface ReputationAbuseAttempt {
  attemptId: string;
  userId: string;
  
  // Detected pattern
  pattern: 
    | 'RAPID_SCORE_MANIPULATION'
    | 'TRUST_FARM_CREATION'
    | 'PURCHASED_REVIEWS'
    | 'MESSAGE_FOR_RATING_CAMPAIGN'
    | 'CROSS_DEVICE_GAMING'
    | 'SUDDEN_SCORE_JUMP';
  
  // Evidence
  evidence: {
    scoreChangeMagnitude?: number;
    timeWindow?: number; // minutes
    deviceIds?: string[];
    relatedUserIds?: string[];
    campaignKeywords?: string[];
  };
  
  // Detection metadata
  detectedAt: Timestamp;
  confidenceScore: number; // 0-1
  
  // Action taken
  actionTaken: 'FLAGGED' | 'SCORE_REVERSED' | 'ENFORCEMENT_TRIGGERED';
  enforcementCaseId?: string;
}

// ============================================================================
// REPUTATION INPUT EVENTS
// ============================================================================

export interface ReputationInputEvent {
  eventId: string;
  userId: string;
  
  // Event type
  eventType:
    | 'KYC_VERIFIED'
    | 'PROFILE_COMPLETED'
    | 'POSITIVE_INTERACTION'
    | 'REPORT_RECEIVED'
    | 'VIOLATION_CONFIRMED'
    | 'SPAM_DETECTED'
    | 'RESPONSE_QUALITY_HIGH'
    | 'RESPONSE_QUALITY_LOW'
    | 'LONG_TERM_GOOD_STANDING'
    | 'CHARGEBACK_FILED'
    | 'MULTI_ACCOUNT_DETECTED';
  
  // Impact (will be processed during calculation)
  impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  weight: number; // multiplier for score impact
  
  // Context
  metadata?: Record<string, any>;
  sourceSystem: string; // which pack/system generated this event
  
  // Timestamp
  createdAt: Timestamp;
  processedAt?: Timestamp;
  processedInCalculation: boolean;
}

// ============================================================================
// PUBLIC REPUTATION PROFILE (SAFE FOR CLIENT)
// ============================================================================

export interface PublicReputationProfile {
  userId: string;
  
  // Public display only
  level: ReputationLevel;
  levelLabel: string;
  levelDescription: string;
  levelColor: string;
  levelIcon: string;
  
  // Display control
  displayBadge: boolean;
  
  // Transparency (what does NOT affect reputation)
  disclaimer: {
    doesNotAffect: string[];
    basedOn: string[];
  };
  
  // Last updated
  lastUpdatedAt: Timestamp;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Map internal score to public reputation level
 */
export function getReputationLevelFromScore(score: number): ReputationLevel {
  // Clamp score to valid range
  const clampedScore = Math.max(0, Math.min(1000, score));
  
  if (clampedScore >= 800) return 'EXCELLENT';
  if (clampedScore >= 600) return 'HIGH';
  if (clampedScore >= 400) return 'MODERATE';
  if (clampedScore >= 200) return 'BELOW_AVERAGE';
  return 'LOW';
}

/**
 * Get reputation level configuration
 */
export function getReputationLevelConfig(level: ReputationLevel): ReputationLevelConfig {
  return REPUTATION_LEVELS[level];
}

/**
 * Check if score change is suspicious (potential abuse)
 */
export function isScoreChangeSuspicious(
  previousScore: number,
  newScore: number,
  timeWindowMinutes: number
): boolean {
  const change = Math.abs(newScore - previousScore);
  
  // More than 100 points in less than 60 minutes is suspicious
  if (change > 100 && timeWindowMinutes < 60) return true;
  
  // More than 200 points in less than 24 hours is suspicious
  if (change > 200 && timeWindowMinutes < 1440) return true;
  
  // More than 300 points in less than 7 days is suspicious
  if (change > 300 && timeWindowMinutes < 10080) return true;
  
  return false;
}

/**
 * Generate safe reputation change message
 */
export function getReputationChangeMessage(
  changeType: ReputationChangeType,
  previousLevel: ReputationLevel,
  newLevel: ReputationLevel
): { message: string; tip?: string } {
  if (changeType === 'LEVEL_INCREASED') {
    return {
      message: `Your Trust Level has improved to ${REPUTATION_LEVELS[newLevel].label}. Keep up your positive behaviour.`,
      tip: 'Complete your profile, respond to messages, and maintain respectful interactions to continue building trust.',
    };
  }
  
  if (changeType === 'LEVEL_DECREASED') {
    return {
      message: `Your Trust Level changed to ${REPUTATION_LEVELS[newLevel].label}. Some recent actions may have impacted your standing.`,
      tip: 'Review platform guidelines and maintain respectful behaviour to improve your trust level over time.',
    };
  }
  
  if (changeType === 'SCORE_IMPROVED') {
    return {
      message: 'Your Trust Level has improved — keep up your positive behaviour.',
    };
  }
  
  return {
    message: 'Your Trust Level changed. Some recent actions may have impacted your standing. Review platform guidelines to stay safe.',
  };
}

/**
 * Get public disclaimer about what reputation does NOT affect
 */
export function getReputationDisclaimer(): {
  doesNotAffect: string[];
  basedOn: string[];
} {
  return {
    doesNotAffect: [
      'Premium Membership does not affect trust',
      'Spending tokens does not affect trust',
      'Earnings do not affect trust',
      'Number of messages or paid interactions does not affect trust',
      'Discovery ranking is not affected by trust',
      'Monetization potential is not affected by trust',
    ],
    basedOn: [
      'Identity verification (KYC)',
      'Profile completeness',
      'Respectful conduct',
      'Response quality',
      'Low report ratio',
      'Safety compliance',
      'Long-term positive behaviour',
    ],
  };
}