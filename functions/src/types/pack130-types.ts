/**
 * PACK 130 — Long-Term Patrol AI
 * Persistent Behavior Memory · Ban-Evasion Hunter · Self-Learning Safety
 * 
 * Type definitions for persistent behavior tracking and ban evasion detection
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// PERSISTENT BEHAVIOR MEMORY
// ============================================================================

export type PatrolEventType =
  | 'HARASSMENT_CYCLE'          // Respectful → relapse pattern
  | 'NSFW_BYPASS_ATTEMPT'       // Repeated "almost safe" content
  | 'BAN_EVASION'               // New account from banned device
  | 'DECEPTIVE_MONETIZATION'    // Psychological pressure tactics
  | 'PIRACY_ATTEMPT'            // Reselling captured content
  | 'MULTI_ACCOUNT_ABUSE'       // Operating multiple accounts
  | 'CONSENT_VIOLATION'         // Ignoring consent boundaries
  | 'PAYMENT_FRAUD'             // Fraudulent payment patterns
  | 'LOCATION_STALKING'         // Suspicious location tracking
  | 'COORDINATED_ATTACK';       // Multiple users targeting one

export interface PatrolBehaviorLog {
  logId: string;
  userId: string;
  eventType: PatrolEventType;
  
  // Event details
  detectedAt: Timestamp;
  confidence: number;  // 0-1
  evidence: Record<string, any>;
  
  // Pattern tracking
  cycleNumber?: number;  // For recurring patterns
  daysSinceLastOccurrence?: number;
  totalOccurrences: number;
  
  // Context
  counterpartId?: string;
  relatedCaseId?: string;
  
  // Memory retention
  expiresAt: Timestamp;  // Auto-purge after 36 months
  importance: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface BehaviorPattern {
  patternType: PatrolEventType;
  frequency: number;
  lastOccurrence: Timestamp;
  averageDaysBetween: number;
  trend: 'IMPROVING' | 'STABLE' | 'WORSENING';
}

// ============================================================================
// RISK PROFILE CLASSIFICATION
// ============================================================================

export type RiskProfileLevel =
  | 'RISK_NONE'         // Clean record
  | 'RISK_MONITOR'      // Watch for patterns
  | 'RISK_ESCALATION'   // Concerning behavior
  | 'RISK_SEVERE'       // High risk user
  | 'RISK_CRITICAL';    // Immediate threat

export interface PatrolRiskProfile {
  userId: string;
  riskLevel: RiskProfileLevel;
  
  // Risk scoring
  riskScore: number;  // 0-100
  confidenceLevel: number;  // 0-1, how certain we are
  
  // Pattern analysis
  detectedPatterns: BehaviorPattern[];
  activeFlags: string[];
  
  // Triggers
  canTriggerConsentRevalidation: boolean;
  canTriggerHarassmentShield: boolean;
  canTriggerModeratorReview: boolean;
  canTriggerForcedKYC: boolean;
  canTriggerAccountLockdown: boolean;
  
  // Timeline
  createdAt: Timestamp;
  lastUpdatedAt: Timestamp;
  lastEscalatedAt?: Timestamp;
  
  // History
  riskHistory: RiskProfileChange[];
}

export interface RiskProfileChange {
  fromLevel: RiskProfileLevel;
  toLevel: RiskProfileLevel;
  changedAt: Timestamp;
  reason: string;
  triggeredBy: 'PATTERN_DETECTION' | 'MODERATOR_ACTION' | 'FEEDBACK_LOOP';
}

// ============================================================================
// BAN-EVASION HUNTER
// ============================================================================

export interface DeviceFingerprint {
  deviceId: string;
  userId: string;
  
  // Device signals
  platform: 'MOBILE' | 'WEB' | 'DESKTOP';
  osVersion: string;
  appVersion: string;
  screenResolution: string;
  timezone: string;
  
  // Behavioral signals
  typingPatterns?: TypingSignature;
  sensorData?: SensorConsistency;
  
  // Location (city-level only)
  cityCode?: string;
  countryCode: string;
  
  // Timestamps
  firstSeen: Timestamp;
  lastSeen: Timestamp;
}

export interface TypingSignature {
  averageWPM: number;
  commonPhrases: string[];
  languageFingerprint: string;
  capitalizedPatternFreq: number;
  emojiUsagePattern: string[];
}

export interface SensorConsistency {
  accelerometerPattern: string;
  gyroscopePattern: string;
  consistencyScore: number;  // 0-1
}

export interface BanEvasionRecord {
  recordId: string;
  suspectedUserId: string;
  bannedUserId: string;
  
  // Matching signals
  deviceMatch: boolean;
  locationMatch: boolean;
  paymentMatch: boolean;
  typingMatch: boolean;
  contentMatch: boolean;
  
  // Confidence
  overallConfidence: number;  // 0-1
  matchDetails: Record<string, any>;
  
  // Action taken
  accountLocked: boolean;
  moderationCaseCreated: boolean;
  caseId?: string;
  
  // Timestamps
  detectedAt: Timestamp;
  resolvedAt?: Timestamp;
}

// ============================================================================
// SELF-LEARNING MODERATION
// ============================================================================

export interface ModerationFeedback {
  feedbackId: string;
  patrolCaseId: string;
  flaggedViolation: PatrolEventType;
  
  // Moderator decision
  confirmed: boolean;  // True = correct, False = incorrect
  moderatorId: string;
  moderatorNotes?: string;
  decidedAt: Timestamp;
  
  // Rule adjustment
  ruleConfidenceAdjustment: number;  // -0.1 to +0.1
  patternWeightAdjustment: number;
  
  // Learning
  feedbackApplied: boolean;
  appliedAt?: Timestamp;
}

export interface AIConfidenceRule {
  ruleId: string;
  eventType: PatrolEventType;
  
  // Confidence tracking
  baseConfidence: number;  // Starting confidence
  currentConfidence: number;  // Adjusted by feedback
  
  // Performance metrics
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  
  // Accuracy
  precision: number;  // TP / (TP + FP)
  recall: number;  // TP / (TP + FN)
  f1Score: number;
  
  // Updates
  lastUpdatedAt: Timestamp;
  totalFeedbackCount: number;
}

// ============================================================================
// CASE PRIORITIZATION
// ============================================================================

export type CasePriority =
  | 'CRITICAL'      // Child safety, threats
  | 'VERY_HIGH'     // Violence, doxxing
  | 'HIGH'          // Sexual coercion, piracy
  | 'MEDIUM'        // Harassment
  | 'LOW';          // Spam, bots

export interface PatrolCase {
  caseId: string;
  subjectUserId: string;
  reportedBy?: string;  // Can be system-generated
  
  // Priority calculation
  priority: CasePriority;
  harmPotential: number;  // 0-100
  urgencyScore: number;   // 0-100
  
  // Category
  category: 'CHILD_SAFETY' | 'THREATS_VIOLENCE' | 'SEXUAL_COERCION' | 'PIRACY' | 'HARASSMENT' | 'SPAM';
  
  // Detection
  triggeredBy: 'PATROL_AI' | 'USER_REPORT' | 'HARASSMENT_SHIELD' | 'BAN_EVASION' | 'MULTIPLE_SIGNALS';
  detectionSignals: PatrolEventType[];
  riskScore: number;
  
  // Evidence
  behaviorLogIds: string[];
  evidenceVaultId?: string;
  
  // Status
  status: 'PENDING' | 'IN_REVIEW' | 'FROZEN' | 'RESOLVED' | 'ESCALATED';
  assignedTo?: string;
  
  // Actions
  conversationFrozen: boolean;
  consentRevoked: boolean;
  accountLocked: boolean;
  
  // Timestamps
  createdAt: Timestamp;
  assignedAt?: Timestamp;
  resolvedAt?: Timestamp;
  
  // Resolution
  resolution?: 'CONFIRMED_VIOLATION' | 'FALSE_POSITIVE' | 'WARNING_ISSUED' | 'ACCOUNT_BANNED' | 'NO_ACTION';
  resolutionNotes?: string;
}

// ============================================================================
// FROZEN CONVERSATIONS
// ============================================================================

export interface FrozenConversation {
  conversationId: string;
  participantIds: string[];
  
  // Freeze reason
  frozenBy: 'PATROL_AI' | 'MODERATOR';
  reason: string;
  relatedCaseId: string;
  
  // Freeze details
  frozenAt: Timestamp;
  unfrozenAt?: Timestamp;
  
  // Participant messaging
  neutralBannerShown: boolean;
  bannerMessage: string;
  
  // Status
  status: 'FROZEN' | 'UNFROZEN' | 'PERMANENTLY_BLOCKED';
}

// ============================================================================
// CONTENT FINGERPRINTING (Piracy Detection)
// ============================================================================

export interface ContentFingerprint {
  fingerprintId: string;
  originalContentId: string;
  creatorUserId: string;
  
  // Fingerprint data
  perceptualHash: string;
  audioFingerprint?: string;
  metadataHash: string;
  
  // Content type
  contentType: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'TEXT';
  
  // Detection
  matchThreshold: number;  // 0-1, similarity threshold
  
  // Timestamps
  createdAt: Timestamp;
  expiresAt: Timestamp;  // Fingerprints expire after creator deletes content
}

export interface PiracyMatch {
  matchId: string;
  originalFingerprintId: string;
  suspectedUserId: string;
  
  // Match details
  similarity: number;  // 0-1
  matchType: 'EXACT' | 'NEAR_EXACT' | 'MODIFIED' | 'SUSPICIOUS';
  
  // Evidence
  suspectedContentLocation: string;
  detectedAt: Timestamp;
  
  // Action
  caseCreated: boolean;
  caseId?: string;
  contentRemoved: boolean;
}

// ============================================================================
// DE-ESCALATION UX
// ============================================================================

export interface NeutralSafetyMessage {
  messageType: 'REVIEW_PENDING' | 'VERIFICATION_NEEDED' | 'PAUSE_TEMPORARY';
  
  // User-facing text (neutral, non-accusatory)
  title: string;
  message: string;
  
  // No shame or confrontation
  showSupportLink: boolean;
  showTimeEstimate: boolean;
  estimatedMinutes?: number;
}

// ============================================================================
// INTEGRATION TYPES
// ============================================================================

export interface PatrolAIConfig {
  // Feature flags
  persistentMemoryEnabled: boolean;
  banEvasionHunterEnabled: boolean;
  selfLearningEnabled: boolean;
  contentFingerprintingEnabled: boolean;
  
  // Memory settings
  memoryRetentionMonths: number;  // Default: 36
  
  // Detection thresholds
  banEvasionConfidenceThreshold: number;  // 0-1
  piracyMatchThreshold: number;  // 0-1
  
  // Risk profile thresholds
  riskThresholds: {
    monitor: number;      // 20
    escalation: number;   // 50
    severe: number;       // 75
    critical: number;     // 90
  };
  
  // Case prioritization weights
  priorityWeights: {
    childSafety: number;      // 100
    threatsViolence: number;  // 90
    sexualCoercion: number;   // 80
    piracy: number;           // 70
    harassment: number;       // 50
    spam: number;             // 20
  };
  
  // AI learning
  feedbackLearningRate: number;  // 0-1
  minFeedbackForAdjustment: number;
  
  // Economic protection (NEVER affect these)
  preserveMonetization: true;
  preserveRanking: true;
  preserveDiscovery: true;
}

export const DEFAULT_PATROL_CONFIG: PatrolAIConfig = {
  persistentMemoryEnabled: true,
  banEvasionHunterEnabled: true,
  selfLearningEnabled: true,
  contentFingerprintingEnabled: true,
  
  memoryRetentionMonths: 36,
  
  banEvasionConfidenceThreshold: 0.85,
  piracyMatchThreshold: 0.90,
  
  riskThresholds: {
    monitor: 20,
    escalation: 50,
    severe: 75,
    critical: 90,
  },
  
  priorityWeights: {
    childSafety: 100,
    threatsViolence: 90,
    sexualCoercion: 80,
    piracy: 70,
    harassment: 50,
    spam: 20,
  },
  
  feedbackLearningRate: 0.05,
  minFeedbackForAdjustment: 5,
  
  preserveMonetization: true,
  preserveRanking: true,
  preserveDiscovery: true,
};

// ============================================================================
// FUNCTION INPUT/OUTPUT TYPES
// ============================================================================

export interface PatrolLogEventInput {
  userId: string;
  eventType: PatrolEventType;
  metadata: Record<string, any>;
  counterpartId?: string;
  importance?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface EvaluateRiskProfileInput {
  userId: string;
  includeHistory?: boolean;
}

export interface EvaluateRiskProfileOutput {
  riskLevel: RiskProfileLevel;
  riskScore: number;
  shouldEscalate: boolean;
  recommendedActions: string[];
}

export interface FreezeConversationInput {
  conversationId: string;
  reason: string;
  caseId: string;
  participantIds: string[];
}

export interface CreatePatrolCaseInput {
  subjectUserId: string;
  category: PatrolCase['category'];
  detectionSignals: PatrolEventType[];
  reportedBy?: string;
  behaviorLogIds: string[];
}

export interface NotifyModerationTeamInput {
  caseId: string;
  priority: CasePriority;
  category: PatrolCase['category'];
  urgencyScore: number;
}