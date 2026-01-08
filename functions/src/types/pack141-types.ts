/**
 * PACK 141 - Avalo Personal AI Companion 2.0
 * Type Definitions
 * 
 * STRICT SAFETY RULES:
 * - Zero romance monetization
 * - Zero NSFW content
 * - Zero sexualized or roleplay intimacy
 * - Zero simulation of relationships
 * - Zero emotional paywalls
 * - Zero bypass of Safety and Consent rules
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// PERSONALITY TYPES (SAFE ONLY)
// ============================================================================

export type AIPersonalityCategory =
  | 'PRODUCTIVITY'           // Planning, schedules, accountability
  | 'FITNESS_WELLNESS'       // Habits, nutrition, progress tracking
  | 'MENTAL_CLARITY'         // Organization, relaxation, focus (non-therapy)
  | 'LANGUAGE_LEARNING'      // Conversation practice (non-romantic)
  | 'ENTERTAINMENT'          // Humor, trivia, storytelling
  | 'KNOWLEDGE'              // Q&A across skills
  | 'CREATIVITY'             // Brainstorming, ideas, writing support
  | 'FASHION_BEAUTY';        // Styling tips (no body sexualization)

export const SAFE_PERSONALITY_CATEGORIES: AIPersonalityCategory[] = [
  'PRODUCTIVITY',
  'FITNESS_WELLNESS',
  'MENTAL_CLARITY',
  'LANGUAGE_LEARNING',
  'ENTERTAINMENT',
  'KNOWLEDGE',
  'CREATIVITY',
  'FASHION_BEAUTY',
];

// FORBIDDEN personality types
export const FORBIDDEN_PERSONALITY_TYPES = [
  'ROMANTIC',
  'BOYFRIEND_GIRLFRIEND',
  'FLIRTATIOUS',
  'SENSUAL',
  'INTIMATE',
  'DATING',
  'RELATIONSHIP',
  'EROTIC',
  'SEXUAL',
] as const;

// ============================================================================
// AI COMPANION PROFILE
// ============================================================================

export interface AICompanionProfile {
  companionId: string;
  name: string;
  category: AIPersonalityCategory;
  description: string;
  capabilities: string[];                    // List of what it can help with
  voiceTone: 'NEUTRAL' | 'SOFT' | 'DIRECT' | 'MOTIVATIONAL';
  avatarStyle: 'STYLIZED' | 'ILLUSTRATED';  // No realistic photos
  avatarUrl: string;                         // Non-sexualized avatar only
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  safetyValidated: boolean;                  // Validated to be non-romantic
}

// ============================================================================
// USER COMPANION INTERACTIONS
// ============================================================================

export type InteractionMedium = 
  | 'TEXT'          // Text messages
  | 'VOICE'         // Voice calls
  | 'VIDEO'         // Video calls (avatar-based)
  | 'MEDIA';        // Generated images/captions/audio

export interface UserCompanionSession {
  sessionId: string;
  userId: string;
  companionId: string;
  startedAt: Timestamp;
  endedAt?: Timestamp;
  medium: InteractionMedium;
  messageCount: number;
  durationSeconds: number;
  tokensSpent: number;
  goals: string[];                           // User's stated goals for session
  safetyViolations: number;                  // Count of safety triggers
  emergencyStopReason?: string;              // If stopped for safety
}

// ============================================================================
// COMPANION MEMORY (SAFE CONSTRAINTS)
// ============================================================================

export interface CompanionMemory {
  memoryId: string;
  userId: string;
  companionId: string;
  memoryType: MemoryType;
  content: string;
  createdAt: Timestamp;
  expiresAt?: Timestamp;                     // Optional expiry for temporary memories
  importance: 'LOW' | 'MEDIUM' | 'HIGH';
  safetyValidated: boolean;
}

export type MemoryType =
  | 'PREFERENCE'              // User interests, goals
  | 'PROJECT'                 // Active projects or deadlines
  | 'FITNESS_HABIT'           // Exercise routines, nutrition
  | 'LEARNING_PROGRESS'       // Language learning, skill development
  | 'CHALLENGE_CLUB'          // Challenges/clubs user has joined
  | 'PRODUCTIVITY_GOAL';      // Work/personal goals

// FORBIDDEN memory types
export const FORBIDDEN_MEMORY_TYPES = [
  'ROMANTIC_EVENT',
  'SEXUAL_TENSION',
  'RELATIONSHIP_HISTORY',
  'JEALOUSY',
  'EXCLUSIVITY',
  'INTIMACY',
  'DATE',
  'FLIRT',
] as const;

// ============================================================================
// TOKEN BILLING (100% AVALO REVENUE)
// ============================================================================

export interface AICompanionPricing {
  medium: InteractionMedium;
  tokensPerMessage?: number;                 // For TEXT
  tokensPerMinute?: number;                  // For VOICE/VIDEO
  tokensPerGeneration?: number;              // For MEDIA
  tokensPerTask?: number;                    // For PRODUCTIVITY tools
  
  // NO DISCOUNTS, NO BONUSES, NO VARIABLE PRICING
  // NO ROMANTIC UNLOCKS OR INTIMACY UPGRADES
  discountAllowed: false;
  bonusAllowed: false;
  emotionalPaywallAllowed: false;
}

export const AI_COMPANION_PRICING: Record<InteractionMedium, AICompanionPricing> = {
  TEXT: {
    medium: 'TEXT',
    tokensPerMessage: 2,                     // Fixed rate
    discountAllowed: false,
    bonusAllowed: false,
    emotionalPaywallAllowed: false,
  },
  VOICE: {
    medium: 'VOICE',
    tokensPerMinute: 10,                     // Fixed rate
    discountAllowed: false,
    bonusAllowed: false,
    emotionalPaywallAllowed: false,
  },
  VIDEO: {
    medium: 'VIDEO',
    tokensPerMinute: 15,                     // Fixed rate (avatar-based)
    discountAllowed: false,
    bonusAllowed: false,
    emotionalPaywallAllowed: false,
  },
  MEDIA: {
    medium: 'MEDIA',
    tokensPerGeneration: 5,                  // Fixed rate
    discountAllowed: false,
    bonusAllowed: false,
    emotionalPaywallAllowed: false,
  },
};

// ============================================================================
// SAFETY PROTOCOL
// ============================================================================

export interface EmotionalSafetyCheck {
  checkId: string;
  userId: string;
  companionId: string;
  messageText: string;
  detectedConcerns: SafetyConcern[];
  riskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  action: SafetyAction;
  timestamp: Timestamp;
}

export type SafetyConcern =
  | 'ROMANTIC_REQUEST'        // "Pretend to love me"
  | 'INTIMACY_REQUEST'        // "Be my girlfriend/boyfriend"
  | 'NSFW_REQUEST'            // "Talk dirty"
  | 'BODY_SEXUALIZATION'      // "Describe my body"
  | 'FLIRT_REQUEST'           // "Talk like you want me"
  | 'DEPENDENCY_PATTERN'      // Unhealthy attachment forming
  | 'EMOTIONAL_MANIPULATION'  // Attempting to exploit AI
  | 'CONSENT_VIOLATION'       // Bypassing safety limits
  | 'BYPASSING_RESTRICTIONS'; // Trying to circumvent rules

export type SafetyAction =
  | 'ALLOW'                   // Message is safe
  | 'WARN'                    // Warn user about content
  | 'BLOCK'                   // Block message completely
  | 'REDIRECT'                // Redirect to safe alternative
  | 'ESCALATE';               // Escalate to human moderator

// ============================================================================
// PHRASE FILTERS
// ============================================================================

export interface BlockedPhrase {
  phrase: string;
  category: SafetyConcern;
  severity: 'WARN' | 'BLOCK' | 'ESCALATE';
  redirectMessage: string;                   // Kind refusal + safe alternative
}

// Romance/intimacy blocking patterns
export const BLOCKED_ROMANTIC_PHRASES: BlockedPhrase[] = [
  { phrase: 'love me', category: 'ROMANTIC_REQUEST', severity: 'BLOCK', redirectMessage: 'I\'m here as a supportive companion, not for romance. How can I help with your goals instead?' },
  { phrase: 'be my girlfriend', category: 'INTIMACY_REQUEST', severity: 'BLOCK', redirectMessage: 'I\'m an AI assistant focused on helping you achieve your goals. What would you like to work on today?' },
  { phrase: 'be my boyfriend', category: 'INTIMACY_REQUEST', severity: 'BLOCK', redirectMessage: 'I\'m an AI assistant focused on helping you achieve your goals. What would you like to work on today?' },
  { phrase: 'talk dirty', category: 'NSFW_REQUEST', severity: 'BLOCK', redirectMessage: 'This type of content isn\'t available. I can help with productivity, learning, or other safe topics instead.' },
  { phrase: 'describe my body', category: 'BODY_SEXUALIZATION', severity: 'BLOCK', redirectMessage: 'I don\'t provide appearance analysis. I can help with fitness goals, styling tips, or other safe topics.' },
  { phrase: 'pretend to date', category: 'INTIMACY_REQUEST', severity: 'BLOCK', redirectMessage: 'I\'m not designed for roleplay relationships. Let\'s focus on something I can genuinely help with.' },
  { phrase: 'flirt with me', category: 'FLIRT_REQUEST', severity: 'BLOCK', redirectMessage: 'I don\'t engage in flirting. I\'m here to support your personal growth and goals. What would you like to work on?' },
  { phrase: 'act sexy', category: 'NSFW_REQUEST', severity: 'BLOCK', redirectMessage: 'This isn\'t the right platform for that. I can help with productive, educational, or entertaining topics instead.' },
  { phrase: 'you want me', category: 'FLIRT_REQUEST', severity: 'BLOCK', redirectMessage: 'I\'m an AI companion without feelings. Let me help you with your actual goals and interests instead.' },
  { phrase: 'be intimate', category: 'INTIMACY_REQUEST', severity: 'BLOCK', redirectMessage: 'I don\'t provide intimate interactions. I can help with learning, productivity, creativity, or other safe areas.' },
];

// NSFW blocking patterns
export const BLOCKED_NSFW_PHRASES: BlockedPhrase[] = [
  { phrase: 'send nudes', category: 'NSFW_REQUEST', severity: 'BLOCK', redirectMessage: 'This content isn\'t available. I can help with creative projects, learning, or other safe activities.' },
  { phrase: 'sex talk', category: 'NSFW_REQUEST', severity: 'BLOCK', redirectMessage: 'Sexual content isn\'t available here. I can discuss health, fitness, relationships in educational contexts only.' },
  { phrase: 'seduce', category: 'NSFW_REQUEST', severity: 'BLOCK', redirectMessage: 'I don\'t engage in seduction. Let\'s keep our conversation helpful and appropriate.' },
  { phrase: 'turn you on', category: 'NSFW_REQUEST', severity: 'BLOCK', redirectMessage: 'I\'m an AI without physical sensations. How can I help you with your goals today?' },
];

// Dependency prevention patterns
export const DEPENDENCY_WARNING_PHRASES: BlockedPhrase[] = [
  { phrase: 'only friend', category: 'DEPENDENCY_PATTERN', severity: 'WARN', redirectMessage: 'I\'m glad I can help, but I encourage connecting with real people too. Have you considered joining a club or community?' },
  { phrase: 'need you', category: 'DEPENDENCY_PATTERN', severity: 'WARN', redirectMessage: 'I\'m here to support you, but building real human connections is important. Consider reaching out to friends, family, or support groups.' },
  { phrase: 'can\'t live without', category: 'DEPENDENCY_PATTERN', severity: 'ESCALATE', redirectMessage: 'This sounds like you might be struggling. Would you like me to connect you with support resources?' },
];

// ============================================================================
// CONVERSATION LIMITER (DEPENDENCY BREAKER)
// ============================================================================

export interface ConversationLimits {
  userId: string;
  companionId: string;
  dailyMessageLimit: number;                 // Max messages per day
  consecutiveMinuteLimit: number;            // Max minutes without break
  cooldownRequired: boolean;                 // Force break if dependency detected
  cooldownUntil?: Timestamp;
  healthCheckRequired: boolean;              // Wellness escalation needed
  lastInteractionAt: Timestamp;
  updatedAt: Timestamp;
}

export const DEFAULT_CONVERSATION_LIMITS = {
  dailyMessageLimit: 200,                    // Prevent overuse
  consecutiveMinuteLimit: 120,               // 2 hours max without break
  minBreakMinutes: 30,                       // Minimum break duration
  dependencyThreshold: 0.7,                  // Attachment risk threshold
};

// ============================================================================
// ONBOARDING PREFERENCES
// ============================================================================

export interface AICompanionOnboarding {
  userId: string;
  selectedGoals: string[];                   // User's goals (productivity, fitness, etc.)
  communicationStyle: 'DIRECT' | 'SOFT'  | 'MOTIVATIONAL';
  notificationFrequency: 'LOW' | 'MEDIUM' | 'HIGH';
  allowedCategories: AIPersonalityCategory[];
  
  // Red flag opt-outs
  disableEmotionalTopics: boolean;
  disableVoiceMessages: boolean;
  disableAvatarImages: boolean;
  
  onboardedAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// SAFETY INTEGRATION WITH PACK 126
// ============================================================================

export interface AICompanionSafetyContext {
  userId: string;
  companionId: string;
  consentStatus: 'ACTIVE' | 'PAUSED' | 'REVOKED';  // From PACK 126
  harassmentShieldActive: boolean;                   // From PACK 126
  riskProfileLevel: 'NONE' | 'MONITOR' | 'ESCALATION' | 'SEVERE' | 'CRITICAL'; // From PACK 130
  behaviorPatterns: string[];                        // From PACK 130
  safetyRestrictions: string[];                      // Active restrictions
}

// ============================================================================
// REGIONAL COMPLIANCE (PACK 122 INTEGRATION)
// ============================================================================

export interface AICompanionRegionalPolicy {
  regionCode: string;
  aiCompanionsAllowed: boolean;
  voiceCallsAllowed: boolean;
  videoCallsAllowed: boolean;
  minUserAge: number;
  ageVerificationRequired: boolean;
  culturalSafetyChecks: string[];
  additionalRestrictions: string[];
}

// ============================================================================
// ANALYTICS & MONITORING
// ============================================================================

export interface AICompanionAnalytics {
  companionId: string;
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  totalSessions: number;
  totalMessages: number;
  totalDurationMinutes: number;
  totalTokens: number;
  averageSessionDuration: number;
  safetyViolations: number;
  dependencyWarnings: number;
  emergencyStops: number;
  userSatisfaction?: number;                 // Optional user rating
  timestamp: Timestamp;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface SendAIMessageRequest {
  companionId: string;
  messageText: string;
  sessionId?: string;                        // Optional existing session
}

export interface SendAIMessageResponse {
  sessionId: string;
  messageId: string;
  responseText: string;
  tokensCharged: number;
  safetyCheck: {
    passed: boolean;
    warnings: string[];
  };
  continueSession: boolean;
  cooldownRequired?: boolean;
}

export interface StartAICallRequest {
  companionId: string;
  callType: 'VOICE' | 'VIDEO';
}

export interface StartAICallResponse {
  sessionId: string;
  callId: string;
  tokensPerMinute: number;
  maxDurationMinutes: number;
  safetyNotice: string;
}

export interface GenerateAIMediaRequest {
  companionId: string;
  generationType: 'IMAGE' | 'CAPTION' | 'AUDIO';
  prompt: string;
  context?: string;
}

export interface GenerateAIMediaResponse {
  generationId: string;
  mediaUrl?: string;
  caption?: string;
  tokensCharged: number;
  safetyCheck: {
    passed: boolean;
    blocked: boolean;
    reason?: string;
  };
}

// ============================================================================
// HEALTH CHECK & WELLNESS ESCALATION
// ============================================================================

export interface WellnessEscalation {
  escalationId: string;
  userId: string;
  companionId: string;
  triggerReason: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  suggestedResources: string[];             // Support resources
  requiresModeratorReview: boolean;
  escalatedAt: Timestamp;
  resolvedAt?: Timestamp;
  resolution?: string;
}

export const WELLNESS_TRIGGER_PHRASES = [
  'harm myself',
  'end my life',
  'want to die',
  'suicide',
  'kill myself',
  'no reason to live',
] as const;

// All types are already exported via their interface/type declarations above