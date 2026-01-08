/**
 * PACK 154 — Avalo Multilingual AI Moderation & Auto-Translation Layer
 * Client-side translation service
 */

import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

// ============================================================================
// Type Definitions
// ============================================================================

export interface TranslateMessageParams {
  content: string;
  sourceLanguage?: string;
  targetLanguage: string;
  contentType?: string;
  targetUserId?: string;
  channelType?: string;
  messageId?: string;
}

export interface TranslationResult {
  success: boolean;
  translatedContent?: string;
  detectedSourceLanguage: string;
  targetLanguage: string;
  blocked: boolean;
  blockReason?: string;
  translationId: string;
  messageToUser?: string;
  appealEligible: boolean;
}

export interface TranslationPreferences {
  autoTranslate: boolean;
  bilingualMode: boolean;
  targetLanguages: string[];
  dialectPreference?: string;
  preserveHumor: boolean;
}

export interface TranslationAppeal {
  appealId: string;
  translationId: string;
  blockReason: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'escalated';
  submittedAt: number;
  reviewedAt?: number;
  decision?: string;
  reviewerNotes?: string;
}

// ============================================================================
// Translation Functions
// ============================================================================

/**
 * Translate a message with safety checks
 */
export async function translateMessage(
  params: TranslateMessageParams
): Promise<TranslationResult> {
  try {
    const translateFn = httpsCallable(functions, 'pack154_translateMessage');
    const result = await translateFn(params);
    return result.data as TranslationResult;
  } catch (error: any) {
    console.error('Translation error:', error);
    throw new Error(error.message || 'Translation failed');
  }
}

/**
 * Translate voice transcript
 */
export async function translateVoice(params: {
  transcript: string;
  sourceLanguage?: string;
  targetLanguage: string;
  callId: string;
}): Promise<TranslationResult & { shouldMute: boolean; muteReason?: string }> {
  try {
    const translateFn = httpsCallable(functions, 'pack154_translateVoice');
    const result = await translateFn(params);
    return result.data as any;
  } catch (error: any) {
    console.error('Voice translation error:', error);
    throw new Error(error.message || 'Voice translation failed');
  }
}

/**
 * Detect language of text
 */
export async function detectLanguage(text: string): Promise<{
  language: string;
  confidence: number;
  alternatives: Array<{ language: string; confidence: number }>;
  script: string;
  dialects: string[];
}> {
  try {
    const detectFn = httpsCallable(functions, 'pack154_detectLanguage');
    const result = await detectFn({ text });
    return result.data as any;
  } catch (error: any) {
    console.error('Language detection error:', error);
    throw new Error(error.message || 'Language detection failed');
  }
}

// ============================================================================
// Preferences
// ============================================================================

/**
 * Get user translation preferences
 */
export async function getTranslationPreferences(): Promise<TranslationPreferences> {
  try {
    const getFn = httpsCallable(functions, 'pack154_getPreferences');
    const result = await getFn({});
    return result.data as TranslationPreferences;
  } catch (error: any) {
    console.error('Error fetching preferences:', error);
    // Return defaults on error
    return {
      autoTranslate: false,
      bilingualMode: false,
      targetLanguages: ['en'],
      preserveHumor: true,
    };
  }
}

/**
 * Update user translation preferences
 */
export async function updateTranslationPreferences(
  preferences: Partial<TranslationPreferences>
): Promise<void> {
  try {
    const updateFn = httpsCallable(functions, 'pack154_updatePreferences');
    await updateFn(preferences);
  } catch (error: any) {
    console.error('Error updating preferences:', error);
    throw new Error(error.message || 'Failed to update preferences');
  }
}

// ============================================================================
// History & Stats
// ============================================================================

/**
 * Get translation history
 */
export async function getTranslationHistory(limit = 50): Promise<{
  translations: Array<{
    translationId: string;
    sourceLanguage: string;
    targetLanguage: string;
    contentType: string;
    blocked: boolean;
    blockReason?: string;
    timestamp: number;
    appealEligible: boolean;
  }>;
}> {
  try {
    const getFn = httpsCallable(functions, 'pack154_getTranslationHistory');
    const result = await getFn({ limit });
    return result.data as any;
  } catch (error: any) {
    console.error('Error fetching history:', error);
    throw new Error(error.message || 'Failed to fetch history');
  }
}

/**
 * Get blocked translations
 */
export async function getBlockedTranslations(limit = 20): Promise<{
  blockedTranslations: Array<{
    translationId: string;
    blockReason: string;
    contentType: string;
    sourceLanguage: string;
    targetLanguage: string;
    timestamp: number;
    appealEligible: boolean;
    appealStatus?: string;
  }>;
}> {
  try {
    const getFn = httpsCallable(functions, 'pack154_getBlockedTranslations');
    const result = await getFn({ limit });
    return result.data as any;
  } catch (error: any) {
    console.error('Error fetching blocked translations:', error);
    throw new Error(error.message || 'Failed to fetch blocked translations');
  }
}

// ============================================================================
// Appeals
// ============================================================================

/**
 * Submit an appeal for a blocked translation
 */
export async function submitTranslationAppeal(
  translationId: string,
  reason: string,
  evidence?: string
): Promise<{ success: boolean; appealId: string; message: string }> {
  try {
    const submitFn = httpsCallable(functions, 'pack154_submitAppeal');
    const result = await submitFn({ translationId, reason, evidence });
    return result.data as any;
  } catch (error: any) {
    console.error('Error submitting appeal:', error);
    throw new Error(error.message || 'Failed to submit appeal');
  }
}

/**
 * Get user's appeal history
 */
export async function getMyAppeals(): Promise<{ appeals: TranslationAppeal[] }> {
  try {
    const getFn = httpsCallable(functions, 'pack154_getMyAppeals');
    const result = await getFn({});
    return result.data as any;
  } catch (error: any) {
    console.error('Error fetching appeals:', error);
    throw new Error(error.message || 'Failed to fetch appeals');
  }
}

/**
 * Check if translation is eligible for appeal
 */
export async function checkAppealEligibility(translationId: string): Promise<{
  eligible: boolean;
  reason?: string;
  blockReason?: string;
  timestamp?: number;
}> {
  try {
    const checkFn = httpsCallable(functions, 'pack154_checkAppealEligibility');
    const result = await checkFn({ translationId });
    return result.data as any;
  } catch (error: any) {
    console.error('Error checking appeal eligibility:', error);
    return {
      eligible: false,
      reason: 'Error checking eligibility',
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get language name from ISO code
 */
export function getLanguageName(code: string): string {
  const languages: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    it: 'Italian',
    pt: 'Portuguese',
    ru: 'Russian',
    zh: 'Chinese',
    ja: 'Japanese',
    ko: 'Korean',
    ar: 'Arabic',
    hi: 'Hindi',
    tr: 'Turkish',
    pl: 'Polish',
    nl: 'Dutch',
    sv: 'Swedish',
    no: 'Norwegian',
    da: 'Danish',
    fi: 'Finnish',
    el: 'Greek',
    he: 'Hebrew',
    th: 'Thai',
    vi: 'Vietnamese',
    id: 'Indonesian',
    ms: 'Malay',
    uk: 'Ukrainian',
    cs: 'Czech',
    ro: 'Romanian',
    hu: 'Hungarian',
    bg: 'Bulgarian',
  };

  return languages[code.toLowerCase()] || code.toUpperCase();
}

/**
 * Get flag emoji for language
 */
export function getLanguageFlag(code: string): string {
  const flags: Record<string, string> = {
    en: '🇬🇧',
    es: '🇪🇸',
    fr: '🇫🇷',
    de: '🇩🇪',
    it: '🇮🇹',
    pt: '🇵🇹',
    ru: '🇷🇺',
    zh: '🇨🇳',
    ja: '🇯🇵',
    ko: '🇰🇷',
    ar: '🇸🇦',
    hi: '🇮🇳',
    tr: '🇹🇷',
    pl: '🇵🇱',
  };

  return flags[code.toLowerCase()] || '🌐';
}

/**
 * Format block reason for display
 */
export function formatBlockReason(reason: string): string {
  const reasons: Record<string, string> = {
    TONE_ESCALATION: 'Translation would add romantic or affectionate tone',
    NSFW_CONTENT: 'Translation contains explicit sexual content',
    HARASSMENT_DETECTED: 'Translation contains harassment or threats',
    ROMANCE_MONETIZATION: 'Romance monetization attempt detected',
    MANIPULATION_ATTEMPT: 'Translation would manipulate meaning unsafely',
    SOURCE_ALREADY_BLOCKED: 'Original message violates community guidelines',
    LANGUAGE_MIXING_EXPLOIT: 'Language mixing to bypass filters detected',
    EMOJI_ENCODED_SEXUAL: 'Sexually suggestive emojis detected',
    NUMERIC_SLANG_SEXUAL: 'Numeric slang for sexual content detected',
    DOUBLE_MEANING_EXPLOIT: 'Double meanings detected',
    VOICE_TONE_SEXUAL: 'Audio contains inappropriate sexual tone',
  };

  return reasons[reason] || 'Translation blocked for safety reasons';
}

/**
 * Get user-friendly message for translation status
 */
export function getTranslationStatusMessage(
  blocked: boolean,
  blockReason?: string
): string {
  if (!blocked) {
    return 'Translation successful';
  }

  if (blockReason) {
    return formatBlockReason(blockReason);
  }

  return 'Translation was blocked for safety reasons';
}