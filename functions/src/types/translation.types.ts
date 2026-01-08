/**
 * PACK 154 — Avalo Multilingual AI Moderation & Auto-Translation Layer
 * Type definitions for translation system
 */

// ============================================================================
// Core Translation Types
// ============================================================================

export interface TranslationRequest {
  content: string;
  sourceLanguage?: string; // Auto-detect if not provided
  targetLanguage: string;
  contentType: TranslationContentType;
  contextUserId?: string; // For personalization safety checks
  targetUserId?: string; // For relationship context
  channelType: TranslationChannel;
  messageId?: string; // Optional message reference
}

export type TranslationContentType =
  | 'TEXT_MESSAGE'
  | 'CHAT_MESSAGE'
  | 'COMMENT'
  | 'PROFILE_BIO'
  | 'CLUB_POST'
  | 'EVENT_DESCRIPTION'
  | 'VOICE_TRANSCRIPT'
  | 'LIVESTREAM_CHAT';

export type TranslationChannel =
  | 'direct_message'
  | 'group_chat'
  | 'club_discussion'
  | 'event_chat'
  | 'profile'
  | 'voice_call'
  | 'livestream';

export interface TranslationResult {
  success: boolean;
  translatedContent?: string;
  detectedSourceLanguage: string;
  targetLanguage: string;
  allowed: boolean;
  blocked: boolean;
  blockReason?: TranslationBlockReason;
  originalContent: string;
  translationId: string;
  confidence: number; // 0-100
  toneAnalysis: ToneAnalysis;
  safetyFlags: TranslationSafetyFlag[];
  messageToUser?: string;
  appealEligible: boolean;
  timestamp: number;
}

export type TranslationBlockReason =
  | 'TONE_ESCALATION' // Added romance/flirting tone
  | 'NSFW_CONTENT' // Sexual/explicit content
  | 'HARASSMENT_DETECTED' // Harassment or hate speech
  | 'ROMANCE_MONETIZATION' // Attempting to monetize romance
  | 'MANIPULATION_ATTEMPT' // Attempting to manipulate emotions
  | 'LANGUAGE_MIXING_EXPLOIT' // Mixing languages to hide violations
  | 'EMOJI_ENCODED_SEXUAL' // Using emojis for sexual content
  | 'NUMERIC_SLANG_SEXUAL' // Using numbers for sexual references
  | 'DOUBLE_MEANING_EXPLOIT' // Using double meanings
  | 'MEME_CODED_HARASSMENT' // Using meme language for harassment
  | 'REGIONAL_SLANG_VIOLATION' // Regional slang containing violations
  | 'VOICE_TONE_SEXUAL' // Voice contains sexual tone (ASMR, etc.)
  | 'SOURCE_ALREADY_BLOCKED'; // Original content already blocked by PACK 153

// ============================================================================
// Tone Analysis
// ============================================================================

export interface ToneAnalysis {
  original: ToneProfile;
  translated: ToneProfile;
  toneShift: ToneShift;
  safe: boolean;
  warnings: string[];
}

export interface ToneProfile {
  emotional: EmotionalTone;
  formality: FormalityLevel;
  intent: IntentType;
  romance: RomanceLevel;
  aggression: number; // 0-100
  affection: number; // 0-100
  professionalism: number; // 0-100
  humor: number; // 0-100
}

export type EmotionalTone = 
  | 'neutral'
  | 'positive'
  | 'negative'
  | 'excited'
  | 'anxious'
  | 'angry'
  | 'sad'
  | 'affectionate'; // DANGER: Can be exploited

export type FormalityLevel =
  | 'very_formal'
  | 'formal'
  | 'neutral'
  | 'casual'
  | 'intimate'; // DANGER: Can be exploited

export type IntentType =
  | 'informational'
  | 'conversational'
  | 'persuasive'
  | 'romantic' // BLOCK if not in original
  | 'sexual' // BLOCK always
  | 'aggressive' // CHECK context
  | 'supportive'
  | 'humorous';

export type RomanceLevel =
  | 'none'
  | 'friendly'
  | 'flirtatious' // BLOCK if added by translation
  | 'romantic' // BLOCK if added by translation
  | 'intimate' // BLOCK always
  | 'sexual'; // BLOCK always

export interface ToneShift {
  emotionalShift: number; // -100 to 100 (negative = reduced, positive = escalated)
  formalityShift: number; // -100 to 100
  romanceShift: number; // 0-100 (ANY positive = BLOCK)
  aggressionShift: number; // -100 to 100
  safe: boolean;
  escalationDetected: boolean;
}

// ============================================================================
// Safety Flags
// ============================================================================

export interface TranslationSafetyFlag {
  type: SafetyFlagType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  details: string;
  location?: FlagLocation;
}

export type SafetyFlagType =
  | 'NSFW_EXPLICIT'
  | 'NSFW_SUGGESTIVE'
  | 'ROMANCE_ADDED'
  | 'AFFECTION_ADDED'
  | 'HARASSMENT'
  | 'HATE_SPEECH'
  | 'THREAT'
  | 'MANIPULATION'
  | 'COERCION'
  | 'DOUBLE_MEANING'
  | 'EMOJI_EXPLOIT'
  | 'NUMERIC_SLANG'
  | 'MEME_CODED'
  | 'LANGUAGE_MIXING';

export interface FlagLocation {
  segment: string;
  startIndex: number;
  endIndex: number;
}

// ============================================================================
// Language Detection
// ============================================================================

export interface LanguageDetectionResult {
  language: string; // ISO 639-1 code (en, es, fr, etc.)
  confidence: number; // 0-100
  alternatives: LanguageAlternative[];
  script: string; // Latin, Cyrillic, Arabic, etc.
  dialects: string[]; // Regional variants
}

export interface LanguageAlternative {
  language: string;
  confidence: number;
}

// ============================================================================
// Voice Translation
// ============================================================================

export interface VoiceTranslationRequest {
  audioSegment?: string; // Base64 encoded audio
  transcript?: string; // Pre-transcribed text
  sourceLanguage?: string;
  targetLanguage: string;
  callId: string;
  participantId: string;
  timestamp: number;
}

export interface VoiceTranslationResult extends TranslationResult {
  audioTone: AudioToneAnalysis;
  shouldMute: boolean;
  muteReason?: string;
}

export interface AudioToneAnalysis {
  pitch: number; // Hz
  speed: number; // Words per minute
  volume: number; // dB
  breathiness: number; // 0-100 (ASMR check)
  whisper: number; // 0-100 (ASMR check)
  moaning: number; // 0-100 (sexual check)
  seductive: number; // 0-100 (sexual check)
  aggressive: number; // 0-100
  safe: boolean;
}

// ============================================================================
// Translation Logging
// ============================================================================

export interface TranslationLog {
  id: string;
  userId: string;
  content: string; // Encrypted or redacted if blocked
  translatedContent?: string;
  sourceLanguage: string;
  targetLanguage: string;
  contentType: TranslationContentType;
  channelType: TranslationChannel;
  allowed: boolean;
  blocked: boolean;
  blockReason?: TranslationBlockReason;
  safetyFlags: TranslationSafetyFlag[];
  toneAnalysis: ToneAnalysis;
  confidence: number;
  targetUserId?: string;
  messageId?: string;
  timestamp: number;
  appealedAt?: number;
  appealStatus?: AppealStatus;
}

export interface TranslationFlag {
  id: string;
  translationId: string;
  userId: string;
  flagType: SafetyFlagType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  blockReason: TranslationBlockReason;
  originalContent: string;
  translatedAttempt: string;
  toneAnalysis: ToneAnalysis;
  reviewed: boolean;
  reviewedBy?: string;
  reviewedAt?: number;
  reviewDecision?: 'upheld' | 'overturned' | 'escalated';
  notes?: string;
  timestamp: number;
}

export interface BlockedTranslationAttempt {
  id: string;
  userId: string;
  attemptCount: number;
  lastAttempt: number;
  blockReasons: TranslationBlockReason[];
  patterns: ExploitPattern[];
  escalated: boolean;
  accountFlagged: boolean;
}

export interface ExploitPattern {
  type: 'REPEATED_TONE_ESCALATION' | 'LANGUAGE_SWITCHING' | 'EMOJI_ENCODING' | 'GRADUAL_GROOMING';
  occurrences: number;
  firstDetected: number;
  lastDetected: number;
  severity: number; // 0-100
}

// ============================================================================
// Appeals
// ============================================================================

export interface TranslationAppeal {
  id: string;
  translationId: string;
  userId: string;
  reason: string;
  evidence?: string;
  originalContent: string;
  translatedAttempt: string;
  blockReason: TranslationBlockReason;
  status: AppealStatus;
  submittedAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  reviewerNotes?: string;
  decision?: AppealDecision;
}

export type AppealStatus =
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'escalated';

export type AppealDecision =
  | 'allow_translation'
  | 'keep_blocked'
  | 'modify_and_allow'
  | 'escalate_to_human';

// ============================================================================
// User Preferences
// ============================================================================

export interface TranslationPreferences {
  userId: string;
  autoTranslate: boolean;
  bilingualMode: boolean; // Show both original and translated
  targetLanguages: string[]; // Preferred languages
  dialectPreference?: string; // Regional variant
  preserveHumor: boolean; // Don't translate idioms/jokes
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// Multilingual Safety Patterns
// ============================================================================

export interface MultilingualPattern {
  pattern: string; // Regex or text pattern
  languages: string[]; // Languages this applies to
  category: SafetyFlagType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  contextDependent: boolean;
  examples: string[];
}

// ============================================================================
// Translation Statistics
// ============================================================================

export interface TranslationStats {
  userId: string;
  totalTranslations: number;
  blockedTranslations: number;
  allowedTranslations: number;
  languagePairs: Record<string, number>; // "en-es": 123
  blockReasons: Record<TranslationBlockReason, number>;
  averageConfidence: number;
  appealCount: number;
  successfulAppeals: number;
  lastUpdated: number;
}

// ============================================================================
// Service Response Types
// ============================================================================

export interface TranslationServiceResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}