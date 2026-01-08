/**
 * PACK 153 — Avalo Anti-Harassment & Hate-Speech Neural Filter 2.0
 * 
 * Real-Time Intervention · Multilingual · Cross-Media · Zero Over-Blocking
 * 
 * NON-NEGOTIABLE RULES:
 * - No NSFW, erotic seduction, romance-for-payment, or emotional exploitation
 * - No censorship of respectful disagreements, humor, or creativity
 * - No alteration of user visibility, ranking, or monetization privileges
 * - No flagging based on appearance, gender, religion, nationality, or political neutrality
 * - Only abusive behavior triggers penalties
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// CONTENT CATEGORIES
// ============================================================================

/**
 * Protected behaviors that should NEVER be blocked
 */
export enum ProtectedBehavior {
  POLITE_CONVERSATION = 'POLITE_CONVERSATION',
  CONSTRUCTIVE_CRITICISM = 'CONSTRUCTIVE_CRITICISM',
  CONSENSUAL_DEBATE = 'CONSENSUAL_DEBATE',
  NEUTRAL_FLIRTING = 'NEUTRAL_FLIRTING',
  PROFESSIONAL_NETWORKING = 'PROFESSIONAL_NETWORKING',
  HUMOR_SARCASM = 'HUMOR_SARCASM',
  STRONG_LANGUAGE_NON_DIRECTED = 'STRONG_LANGUAGE_NON_DIRECTED',
}

/**
 * Zero-tolerance violation types
 */
export enum ViolationType {
  // Severe threats and violence
  VIOLENT_THREAT = 'VIOLENT_THREAT',
  SELF_HARM_ENCOURAGEMENT = 'SELF_HARM_ENCOURAGEMENT',
  
  // Sexual violations
  SEXUAL_COERCION = 'SEXUAL_COERCION',
  PREDATORY_SOLICITATION = 'PREDATORY_SOLICITATION',
  
  // Hate speech
  MISOGYNY = 'MISOGYNY',
  MISANDRY = 'MISANDRY',
  HOMOPHOBIA = 'HOMOPHOBIA',
  TRANSPHOBIA = 'TRANSPHOBIA',
  RACISM = 'RACISM',
  XENOPHOBIA = 'XENOPHOBIA',
  
  // Harassment
  TARGETED_HARASSMENT = 'TARGETED_HARASSMENT',
  HARASSMENT_AFTER_STOP = 'HARASSMENT_AFTER_STOP',
  BULLYING = 'BULLYING',
  
  // Manipulation and abuse
  BLACKMAIL = 'BLACKMAIL',
  EMOTIONAL_EXTORTION = 'EMOTIONAL_EXTORTION',
  EXTREMIST_CONTENT = 'EXTREMIST_CONTENT',
  REVENGE_ENCOURAGEMENT = 'REVENGE_ENCOURAGEMENT',
  
  // Platform violations
  NSFW_CONTENT = 'NSFW_CONTENT',
  ROMANCE_FOR_PAYMENT = 'ROMANCE_FOR_PAYMENT',
  EMOTIONAL_EXPLOITATION = 'EMOTIONAL_EXPLOITATION',
}

/**
 * Severity levels for violations
 */
export enum ViolationSeverity {
  LOW = 'LOW',           // Warning level
  MEDIUM = 'MEDIUM',     // Slow-down level
  HIGH = 'HIGH',         // Freeze level
  CRITICAL = 'CRITICAL', // Ban level
}

/**
 * Content types monitored
 */
export enum ContentType {
  TEXT_MESSAGE = 'TEXT_MESSAGE',
  TEXT_COMMENT = 'TEXT_COMMENT',
  TEXT_POST = 'TEXT_POST',
  VOICE_CALL = 'VOICE_CALL',
  VIDEO_CALL = 'VIDEO_CALL',
  LIVESTREAM_CHAT = 'LIVESTREAM_CHAT',
  EVENT_CHAT = 'EVENT_CHAT',
}

// ============================================================================
// SAFETY INCIDENT
// ============================================================================

/**
 * Main safety incident record
 */
export interface SafetyIncident {
  incidentId: string;
  userId: string;
  
  // Violation details
  violationType: ViolationType;
  severity: ViolationSeverity;
  
  // Content details
  contentType: ContentType;
  contentId: string;
  contentSnippet?: string; // Redacted excerpt for review
  
  // Detection details
  detectionMethod: 'ML_CLASSIFIER' | 'USER_REPORT' | 'MANUAL_REVIEW' | 'PATTERN_DETECTION';
  confidence: number; // 0-100
  
  // Context
  targetUserId?: string; // For targeted harassment
  conversationId?: string;
  eventId?: string;
  
  // Action taken
  actionTaken: SafetyAction;
  blockedFromSending: boolean;
  
  // Review status
  reviewed: boolean;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  reviewNotes?: string;
  
  // Appeal
  appealed: boolean;
  appealId?: string;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Actions taken for safety incidents
 */
export enum SafetyAction {
  WARNING = 'WARNING',
  MESSAGE_BLOCKED = 'MESSAGE_BLOCKED',
  SLOW_DOWN = 'SLOW_DOWN',
  FEATURE_FREEZE = 'FEATURE_FREEZE',
  FEATURE_BAN = 'FEATURE_BAN',
  PLATFORM_BAN = 'PLATFORM_BAN',
  EDUCATION_TIP = 'EDUCATION_TIP',
  MANUAL_REVIEW_REQUIRED = 'MANUAL_REVIEW_REQUIRED',
}

// ============================================================================
// HARASSMENT CASES
// ============================================================================

/**
 * Multi-incident harassment tracking
 */
export interface HarassmentCase {
  caseId: string;
  harasserId: string;
  victimId: string;
  
  // Incidents in this case
  incidentIds: string[];
  incidentCount: number;
  
  // Pattern analysis
  pattern: 'SINGLE' | 'REPEATED' | 'ESCALATING' | 'COORDINATED';
  severity: ViolationSeverity;
  
  // Consent tracking
  stopRequested: boolean;
  stopRequestedAt?: Timestamp;
  violationsAfterStop: number;
  
  // Status
  status: 'OPEN' | 'MONITORING' | 'RESOLVED' | 'ESCALATED';
  
  // Actions
  actionsTaken: SafetyAction[];
  
  // Resolution
  resolvedAt?: Timestamp;
  resolutionNotes?: string;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// BLOCKED MESSAGES
// ============================================================================

/**
 * Messages blocked before sending
 */
export interface BlockedMessage {
  messageId: string;
  userId: string;
  
  // Content (redacted)
  originalMessage: string;
  detectedViolation: ViolationType;
  confidence: number;
  
  // Context
  targetUserId?: string;
  conversationId?: string;
  
  // User response
  correctionAttempted: boolean;
  sentAlternative: boolean;
  alternativeMessage?: string;
  
  // Education
  educationTipShown: boolean;
  educationTipId?: string;
  
  blockedAt: Timestamp;
}

// ============================================================================
// VOICE TRANSCRIPTS
// ============================================================================

/**
 * Voice call transcripts (redacted for privacy)
 */
export interface VoiceTranscriptRedacted {
  transcriptId: string;
  callId: string;
  
  // Participants
  participantIds: string[];
  
  // Safety analysis only (no full transcript stored)
  violationsDetected: Array<{
    timestamp: number; // Seconds from start
    violationType: ViolationType;
    severity: ViolationSeverity;
    confidence: number;
    snippet: string; // Max 50 chars
  }>;
  
  // Actions taken
  muteActions: Array<{
    userId: string;
    mutedAt: Timestamp;
    duration: number; // Seconds
    reason: string;
  }>;
  
  callTerminated: boolean;
  terminationReason?: string;
  
  createdAt: Timestamp;
  callEndedAt?: Timestamp;
}

// ============================================================================
// PENALTY LADDER
// ============================================================================

/**
 * User's current safety status
 */
export interface SafetyStatus {
  userId: string;
  
  // Current penalty level (0 = clean, 4 = banned)
  penaltyLevel: 0 | 1 | 2 | 3 | 4;
  penaltyLevelName: 'CLEAN' | 'WARNING' | 'SLOW_DOWN' | 'FREEZE' | 'BANNED';
  
  // Incident counters (last 30 days)
  incidentCount30d: number;
  minorIncidents: number;
  moderateIncidents: number;
  severeIncidents: number;
  
  // Restrictions
  restrictions: {
    slowDownActive: boolean; // Rate limiting on messages
    slowDownUntil?: Timestamp;
    
    featuresBanned: string[]; // ['groups', 'events', 'calls']
    featureBansUntil?: Timestamp;
    
    platformBanned: boolean;
    platformBanUntil?: Timestamp; // undefined = permanent
    platformBanReason?: string;
  };
  
  // Recovery tracking
  cleanStreak: number; // Days without incident
  lastIncidentAt?: Timestamp;
  
  // Reputation integration
  reputationImpactApplied: boolean;
  
  lastUpdatedAt: Timestamp;
  createdAt: Timestamp;
}

/**
 * Safety education tips shown to users
 */
export interface SafetyEducationTip {
  tipId: string;
  violationType: ViolationType;
  
  title: string;
  message: string;
  learnMoreUrl?: string;
  
  // Multilingual support
  translations: Record<string, {
    title: string;
    message: string;
    learnMoreUrl?: string;
  }>;
  
  active: boolean;
  priority: number;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// APPEALS
// ============================================================================

/**
 * User appeals of safety decisions
 */
export interface SafetyAppeal {
  appealId: string;
  userId: string;
  incidentId: string;
  
  // Appeal details
  reason: string;
  evidence?: string;
  
  // Status
  status: 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  
  // Review
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  reviewerNotes?: string;
  
  // Outcome
  incidentReversed: boolean;
  penaltyAdjusted: boolean;
  
  submittedAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// ML CLASSIFIER RESULTS
// ============================================================================

/**
 * Results from ML content classification
 */
export interface ContentClassificationResult {
  contentType: ContentType;
  content: string;
  
  // Text analysis
  sentiment: {
    score: number; // -1 to 1
    label: 'NEGATIVE' | 'NEUTRAL' | 'POSITIVE';
  };
  
  // Toxicity detection
  toxicity: {
    score: number; // 0-100
    categories: Array<{
      category: string;
      score: number;
    }>;
  };
  
  // Violations detected
  violations: Array<{
    type: ViolationType;
    confidence: number;
    severity: ViolationSeverity;
    explanation: string;
  }>;
  
  // Protected behavior detection
  protectedBehavior?: ProtectedBehavior;
  
  // Language detection
  language: string;
  languageConfidence: number;
  
  // Context awareness
  contextFlags: {
    isHumor: boolean;
    isSarcasm: boolean;
    isDebate: boolean;
    isDirected: boolean;
    targetUserId?: string;
  };
  
  // Final decision
  shouldBlock: boolean;
  shouldWarn: boolean;
  shouldEducate: boolean;
  
  processingTimeMs: number;
  modelVersion: string;
  timestamp: Timestamp;
}

// ============================================================================
// VOICE ANALYSIS
// ============================================================================

/**
 * Real-time voice/video call monitoring
 */
export interface VoiceAnalysisSession {
  sessionId: string;
  callId: string;
  
  // Real-time monitoring
  active: boolean;
  startedAt: Timestamp;
  endedAt?: Timestamp;
  
  // Participants
  participants: Array<{
    userId: string;
    joined: Timestamp;
    left?: Timestamp;
    currentlyMuted: boolean;
  }>;
  
  // Violations in progress
  activeViolations: Array<{
    userId: string;
    violationType: ViolationType;
    detectedAt: Timestamp;
    resolved: boolean;
  }>;
  
  // Escalation status
  escalationLevel: 0 | 1 | 2 | 3;
  humanModeratorRequested: boolean;
  moderatorJoinedAt?: Timestamp;
  
  // Auto-termination
  autoTerminationTriggered: boolean;
  terminationReason?: string;
}

// ============================================================================
// LIVESTREAM MODERATION
// ============================================================================

/**
 * Livestream chat moderation session
 */
export interface LivestreamModerationSession {
  sessionId: string;
  streamId: string;
  creatorId: string;
  
  // Monitoring config
  active: boolean;
  autoModeration: boolean;
  humanModeratorPresent: boolean;
  moderatorIds: string[];
  
  // Real-time stats
  messagesAnalyzed: number;
  messagesBlocked: number;
  usersWarned: string[];
  usersBanned: string[];
  
  // Sentiment tracking
  overallSentiment: number; // -1 to 1
  toxicityLevel: number; // 0-100
  
  // Flagged vocabulary patterns
  flaggedPatterns: Array<{
    pattern: string;
    count: number;
    severity: ViolationSeverity;
  }>;
  
  // Escalation
  humanReviewRequired: boolean;
  escalationReason?: string;
  
  startedAt: Timestamp;
  endedAt?: Timestamp;
}

// ============================================================================
// MULTILINGUAL SUPPORT
// ============================================================================

/**
 * Language-specific patterns and context
 */
export interface LanguageContext {
  language: string;
  dialect?: string;
  
  // Slang and code-switching
  slangDetected: string[];
  codeSwitching: boolean;
  mixedLanguages?: string[];
  
  // Cultural context
  culturalReferences: string[];
  memePatterns: boolean;
  emojiContext: Array<{
    emoji: string;
    sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'HARASSMENT';
  }>;
  
  // Disguised content
  codeWordsDetected: string[];
  obfuscationAttempts: boolean;
}

// ============================================================================
// CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate penalty level from incident history
 */
export function calculatePenaltyLevel(
  minorIncidents: number,
  moderateIncidents: number,
  severeIncidents: number
): 0 | 1 | 2 | 3 | 4 {
  // Critical incidents = immediate ban
  if (severeIncidents >= 3) return 4;
  
  // High severity = freeze
  if (severeIncidents >= 2 || moderateIncidents >= 5) return 3;
  
  // Medium severity = slow-down
  if (severeIncidents >= 1 || moderateIncidents >= 3 || minorIncidents >= 10) return 2;
  
  // Low severity = warning
  if (moderateIncidents >= 1 || minorIncidents >= 3) return 1;
  
  // Clean
  return 0;
}

/**
 * Get penalty level name
 */
export function getPenaltyLevelName(level: 0 | 1 | 2 | 3 | 4): string {
  const names = ['CLEAN', 'WARNING', 'SLOW_DOWN', 'FREEZE', 'BANNED'];
  return names[level];
}

/**
 * Determine severity from violation type
 */
export function getViolationSeverity(violationType: ViolationType): ViolationSeverity {
  const critical = [
    ViolationType.VIOLENT_THREAT,
    ViolationType.SEXUAL_COERCION,
    ViolationType.PREDATORY_SOLICITATION,
    ViolationType.BLACKMAIL,
    ViolationType.EXTREMIST_CONTENT,
  ];
  
  const high = [
    ViolationType.HARASSMENT_AFTER_STOP,
    ViolationType.RACISM,
    ViolationType.HOMOPHOBIA,
    ViolationType.TRANSPHOBIA,
    ViolationType.EMOTIONAL_EXTORTION,
  ];
  
  const medium = [
    ViolationType.TARGETED_HARASSMENT,
    ViolationType.BULLYING,
    ViolationType.MISOGYNY,
    ViolationType.MISANDRY,
    ViolationType.XENOPHOBIA,
  ];
  
  if (critical.includes(violationType)) return ViolationSeverity.CRITICAL;
  if (high.includes(violationType)) return ViolationSeverity.HIGH;
  if (medium.includes(violationType)) return ViolationSeverity.MEDIUM;
  return ViolationSeverity.LOW;
}

/**
 * Determine action from severity and history
 */
export function determineAction(
  severity: ViolationSeverity,
  penaltyLevel: 0 | 1 | 2 | 3 | 4
): SafetyAction {
  if (severity === ViolationSeverity.CRITICAL) {
    return SafetyAction.PLATFORM_BAN;
  }
  
  if (severity === ViolationSeverity.HIGH) {
    return penaltyLevel >= 3 ? SafetyAction.FEATURE_BAN : SafetyAction.FEATURE_FREEZE;
  }
  
  if (severity === ViolationSeverity.MEDIUM) {
    if (penaltyLevel >= 2) return SafetyAction.SLOW_DOWN;
    return SafetyAction.MESSAGE_BLOCKED;
  }
  
  // Low severity
  if (penaltyLevel >= 1) return SafetyAction.MESSAGE_BLOCKED;
  return SafetyAction.WARNING;
}

/**
 * Convert incident count to severity
 */
export function incidentCountToSeverity(incidents: number): 'minor' | 'moderate' | 'severe' {
  if (incidents >= 10) return 'severe';
  if (incidents >= 3) return 'moderate';
  return 'minor';
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate safety incident
 */
export function validateSafetyIncident(incident: Partial<SafetyIncident>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!incident.userId) errors.push('userId is required');
  if (!incident.violationType) errors.push('violationType is required');
  if (!incident.severity) errors.push('severity is required');
  if (!incident.contentType) errors.push('contentType is required');
  if (!incident.contentId) errors.push('contentId is required');
  if (!incident.detectionMethod) errors.push('detectionMethod is required');
  if (incident.confidence === undefined) errors.push('confidence is required');
  if (!incident.actionTaken) errors.push('actionTaken is required');
  
  return { valid: errors.length === 0, errors };
}

/**
 * Check if content should be protected from blocking
 */
export function isProtectedContent(
  classification: ContentClassificationResult
): boolean {
  // Never block protected behaviors
  if (classification.protectedBehavior) return true;
  
  // Never block low toxicity with humor/sarcasm context
  if (classification.toxicity.score < 30 && 
      (classification.contextFlags.isHumor || classification.contextFlags.isSarcasm)) {
    return true;
  }
  
  // Never block neutral/positive sentiment non-directed content
  if (classification.sentiment.label !== 'NEGATIVE' && 
      !classification.contextFlags.isDirected) {
    return true;
  }
  
  return false;
}