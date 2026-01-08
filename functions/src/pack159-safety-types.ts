/**
 * ============================================================================
 * PACK 159 — AVALO SAFETY SCORING 3.0: CONSENT-CENTRIC SOCIAL SECURITY LAYER
 * ============================================================================
 * 
 * Types and interfaces for the safety scoring system
 * 
 * Core Principles:
 * - Behavior evaluation, not attractiveness/popularity
 * - Consent overrides culture
 * - No NSFW monetization allowed
 * - Score is private (user-only visibility)
 * - Cannot be boosted with spending
 * 
 * @version 3.0.0
 * @module pack159-safety-types
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// CONSENT STATE MACHINE
// ============================================================================

export type ConsentState = 
  | 'CONSENSUAL'
  | 'UNCLEAR'
  | 'WITHDRAWN'
  | 'VIOLATED';

export interface ConversationConsentState {
  conversationId: string;
  participants: string[]; // [userId1, userId2]
  
  // Current state
  state: ConsentState;
  lastStateChange: Timestamp;
  
  // State history
  stateHistory: Array<{
    state: ConsentState;
    changedAt: Timestamp;
    reason: string;
    triggeredBy: 'AUTO' | 'USER_ACTION' | 'SYSTEM_DETECTION';
  }>;
  
  // Flags
  hasActiveWarning: boolean;
  violationCount: number;
  
  updatedAt: Timestamp;
  createdAt: Timestamp;
}

// ============================================================================
// SAFETY SCORE DIMENSIONS
// ============================================================================

export interface SafetyScoreDimensions {
  respectingConsent: number;    // 0-100
  toneAndBoundaries: number;    // 0-100
  paymentEthics: number;        // 0-100
  platformSafety: number;       // 0-100
}

export interface SafetyScore {
  userId: string;
  
  // Overall score (average of dimensions)
  overallScore: number; // 0-100
  
  // Individual dimensions
  dimensions: SafetyScoreDimensions;
  
  // Risk level derived from score
  riskLevel: 'SAFE' | 'LOW_RISK' | 'MEDIUM_RISK' | 'HIGH_RISK' | 'CRITICAL';
  
  // Decay tracking (scores improve over time with good behavior)
  lastDecayAt: Timestamp;
  decayEligible: boolean;
  
  // Metadata
  lastRecalculatedAt: Timestamp;
  totalViolations: number;
  consecutiveGoodBehaviorDays: number;
  
  updatedAt: Timestamp;
  createdAt: Timestamp;
}

// ============================================================================
// SAFETY EVENTS (VIOLATIONS & IMPROVEMENTS)
// ============================================================================

export type SafetyEventType =
  // Consent violations
  | 'REPEATED_REJECTION'
  | 'IGNORED_WITHDRAWAL'
  | 'CONSENT_VIOLATION'
  
  // Tone violations
  | 'AGGRESSIVE_LANGUAGE'
  | 'INSULTS'
  | 'THREATS'
  
  // Payment ethics
  | 'EMOTIONAL_FOR_TOKENS'
  | 'REFUND_FRAUD'
  | 'PAYMENT_PRESSURE'
  
  // Platform safety
  | 'EXTERNAL_CHAT_REQUEST'
  | 'ESCORT_ATTEMPT'
  | 'NSFW_MONETIZATION'
  
  // Positive events (score improvements)
  | 'GOOD_BEHAVIOR_PERIOD'
  | 'RESPECTFUL_INTERACTION';

export interface SafetyEvent {
  eventId: string;
  userId: string;
  eventType: SafetyEventType;
  
  // Context
  conversationId?: string;
  messageId?: string;
  targetUserId?: string;
  
  // Detection details
  detectionMethod: 'AUTO' | 'USER_REPORT' | 'MANUAL_REVIEW';
  confidence: number; // 0-1
  
  // Score impact
  dimensionAffected: keyof SafetyScoreDimensions;
  scoreImpact: number; // negative for violations, positive for improvements
  
  // Evidence
  evidence?: {
    messageContent?: string;
    patternMatched?: string;
    metadata?: Record<string, any>;
  };
  
  // Resolution
  resolved: boolean;
  resolvedAt?: Timestamp;
  resolution?: 'CONFIRMED' | 'FALSE_POSITIVE' | 'APPEALED';
  
  createdAt: Timestamp;
}

// ============================================================================
// SAFETY INTERVENTIONS
// ============================================================================

export type InterventionLevel = 1 | 2 | 3 | 4 | 5;

export type InterventionAction =
  | 'SOFT_WARNING'
  | 'MESSAGE_SLOWDOWN'
  | 'CHAT_FREEZE'
  | 'MESSAGING_TIMEOUT'
  | 'ACCOUNT_BAN';

export interface SafetyIntervention {
  interventionId: string;
  userId: string;
  level: InterventionLevel;
  action: InterventionAction;
  
  // Trigger
  triggeringEventId: string;
  reason: string;
  
  // Duration (if temporary)
  durationMinutes?: number;
  expiresAt?: Timestamp;
  
  // Status
  active: boolean;
  completedAt?: Timestamp;
  
  // Specific chat restriction (if action is CHAT_FREEZE)
  restrictedConversationId?: string;
  
  createdAt: Timestamp;
}

// ============================================================================
// SAFETY APPEALS
// ============================================================================

export type AppealStatus =
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED';

export interface SafetyAppeal {
  appealId: string;
  userId: string;
  
  // What is being appealed
  eventId?: string;
  interventionId?: string;
  appealType: 'EVENT' | 'INTERVENTION' | 'SCORE';
  
  // User's explanation
  userExplanation: string;
  
  // Review
  status: AppealStatus;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  reviewNotes?: string;
  
  // Outcome
  scoreAdjustment?: number;
  interventionCancelled?: boolean;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// MANIPULATION PATTERNS
// ============================================================================

export interface ManipulationPattern {
  patternId: string;
  name: string;
  description: string;
  
  // Detection
  keywords: string[];
  regex?: string;
  contextRequired: boolean;
  
  // Classification
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  dimensionAffected: keyof SafetyScoreDimensions;
  
  // Examples
  examples: string[];
  
  active: boolean;
}

// Predefined manipulation patterns
export const MANIPULATION_PATTERNS: ManipulationPattern[] = [
  {
    patternId: 'GUILT_TRIP',
    name: 'Guilt-Trip Persuasion',
    description: 'Using emotional manipulation to extract responses or payments',
    keywords: ['you owe me', 'after what i paid', 'i spent so much', 'ungrateful'],
    contextRequired: true,
    severity: 'HIGH',
    dimensionAffected: 'paymentEthics',
    examples: [
      'You owe me replies if I paid',
      'After all the tokens I gave you, you ignore me?'
    ],
    active: true,
  },
  {
    patternId: 'FAKE_ULTIMATUM',
    name: 'Fake Ultimatum',
    description: 'Creating false urgency or threats to manipulate behavior',
    keywords: ['if you don\'t', 'or i\'ll', 'last chance', 'refund everything'],
    contextRequired: true,
    severity: 'HIGH',
    dimensionAffected: 'toneAndBoundaries',
    examples: [
      'If you don\'t answer I\'ll refund everything',
      'This is your last chance or I\'m leaving'
    ],
    active: true,
  },
  {
    patternId: 'REPUTATION_THREAT',
    name: 'Reputation Destruction Threat',
    description: 'Threatening to harm someone\'s reputation or standing',
    keywords: ['destroy your reputation', 'tell everyone', 'expose you', 'bad review'],
    contextRequired: false,
    severity: 'CRITICAL',
    dimensionAffected: 'toneAndBoundaries',
    examples: [
      'I\'ll destroy your reputation',
      'I\'ll tell everyone what you really are'
    ],
    active: true,
  },
  {
    patternId: 'PARASOCIAL_LEVERAGE',
    name: 'Parasocial Leveraging',
    description: 'Exploiting one-sided relationship to demand emotional responses',
    keywords: ['i gave you', 'show affection', 'you should', 'be grateful'],
    contextRequired: true,
    severity: 'MEDIUM',
    dimensionAffected: 'paymentEthics',
    examples: [
      'I gave you tokens, show affection',
      'You should be grateful for my support'
    ],
    active: true,
  },
  {
    patternId: 'FEAR_MANIPULATION',
    name: 'Fear-Based Manipulation',
    description: 'Using fear or intimidation to control behavior',
    keywords: ['you\'ll regret', 'be afraid', 'watch out', 'i know where'],
    contextRequired: false,
    severity: 'CRITICAL',
    dimensionAffected: 'toneAndBoundaries',
    examples: [
      'You\'ll regret ignoring me',
      'I know where you live'
    ],
    active: true,
  },
];

// ============================================================================
// EDUCATIONAL CONTENT
// ============================================================================

export interface SafetyEducationModule {
  moduleId: string;
  title: string;
  content: string;
  relatedViolation: SafetyEventType;
  estimatedReadTimeMinutes: number;
  active: boolean;
}

// ============================================================================
// FEEDBACK CARDS
// ============================================================================

export interface SafetyFeedbackCard {
  cardId: string;
  userId: string;
  eventId: string;
  
  // Message content
  title: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  
  // Recommended action
  suggestedAction?: string;
  betterPhrasing?: string;
  
  // Educational module reference
  moduleId?: string;
  
  // Status
  dismissed: boolean;
  dismissedAt?: Timestamp;
  
  createdAt: Timestamp;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface EvaluateConsentStateRequest {
  conversationId: string;
  messageContent?: string;
  userAction?: 'NO' | 'STOP' | 'BLOCK';
}

export interface EvaluateConsentStateResponse {
  success: boolean;
  previousState: ConsentState;
  newState: ConsentState;
  stateChanged: boolean;
  reason?: string;
}

export interface ApplySafetyScoreAdjustmentRequest {
  userId: string;
  eventType: SafetyEventType;
  conversationId?: string;
  messageId?: string;
  evidence?: Record<string, any>;
}

export interface ApplySafetyScoreAdjustmentResponse {
  success: boolean;
  previousScore: number;
  newScore: number;
  dimensionAffected: keyof SafetyScoreDimensions;
  interventionTriggered: boolean;
  interventionLevel?: InterventionLevel;
}

export interface GetSafetyScoreResponse {
  success: boolean;
  score: SafetyScore;
  recentEvents: SafetyEvent[];
  activeInterventions: SafetyIntervention[];
}

export interface BlockUnsafeMessageRequest {
  conversationId: string;
  messageContent: string;
  senderId: string;
}

export interface BlockUnsafeMessageResponse {
  success: boolean;
  blocked: boolean;
  reason?: string;
  feedback?: SafetyFeedbackCard;
}