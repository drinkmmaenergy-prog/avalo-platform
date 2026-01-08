/**
 * PACK 187: Avalo AI Multilingual Consciousness Layer Types
 * 40+ Languages · Code-Switching · Cultural Safety · Accent Safety
 */

export type LanguageCode =
  | 'en' // English
  | 'pl' // Polish
  | 'es' // Spanish
  | 'pt' // Portuguese
  | 'de' // German
  | 'fr' // French
  | 'it' // Italian
  | 'ro' // Romanian
  | 'tr' // Turkish
  | 'ar' // Arabic
  | 'hi' // Hindi
  | 'ja' // Japanese
  | 'ko' // Korean
  | 'zh' // Chinese
  | 'ru' // Russian
  | 'nl' // Dutch
  | 'sv' // Swedish
  | 'da' // Danish
  | 'no' // Norwegian
  | 'fi' // Finnish
  | 'cs' // Czech
  | 'sk' // Slovak
  | 'hu' // Hungarian
  | 'el' // Greek
  | 'he' // Hebrew
  | 'th' // Thai
  | 'vi' // Vietnamese
  | 'id' // Indonesian
  | 'ms' // Malay
  | 'tl' // Tagalog
  | 'uk' // Ukrainian
  | 'bg' // Bulgarian
  | 'hr' // Croatian
  | 'sr' // Serbian
  | 'sl' // Slovenian
  | 'et' // Estonian
  | 'lv' // Latvian
  | 'lt' // Lithuanian
  | 'is' // Icelandic
  | 'ga' // Irish
  | 'cy' // Welsh
  | 'sq' // Albanian
  | 'mk' // Macedonian
  | 'mt' // Maltese
  | 'eu'; // Basque

export interface LanguageMetadata {
  code: LanguageCode;
  name: string;
  nativeName: string;
  flag: string; // emoji flag
  rtl?: boolean; // right-to-left languages
  voiceSupported: boolean;
}

export interface AILanguageProfile {
  aiId: string;
  primaryLanguage: LanguageCode;
  secondaryLanguages: LanguageCode[];
  culturalContext: {
    region?: string;
    culturalBackground?: string;
    avoidStereotypes: string[];
  };
  voiceAccents: {
    [key in LanguageCode]?: {
      accentStrength: 'none' | 'subtle' | 'moderate';
      region?: string;
      prohibitedCharacteristics: string[];
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface UserLanguagePreferences {
  userId: string;
  preferredLanguage: LanguageCode;
  allowAutoSwitch: boolean;
  culturalSafetyLevel: 'strict' | 'moderate' | 'relaxed';
  secondaryLanguages?: LanguageCode[];
  aiSpecificPreferences?: {
    [aiId: string]: {
      language: LanguageCode;
      showTranslations: boolean;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface TranslationLog {
  id: string;
  userId: string;
  aiId: string;
  originalLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  originalText: string;
  translatedText: string;
  safetyCheckPassed: boolean;
  violations?: SafetyViolation[];
  timestamp: Date;
}

export interface SafetyViolation {
  type:
    | 'stereotype'
    | 'fetishization'
    | 'infantilization'
    | 'ownership'
    | 'cultural_mockery'
    | 'accent_caricature'
    | 'emotional_manipulation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  pattern: string;
  suggestion: string;
}

export interface CulturalSafetyFlag {
  id: string;
  pattern: string;
  category: SafetyViolation['type'];
  severity: SafetyViolation['severity'];
  languages: LanguageCode[];
  description: string;
  createdAt: Date;
  createdBy: string;
}

export interface LanguageConflictCase {
  id: string;
  userId: string;
  aiId: string;
  detectedLanguages: LanguageCode[];
  chosenLanguage: LanguageCode;
  context: string;
  timestamp: Date;
}

export interface AccentVoiceProfile {
  id: string;
  language: LanguageCode;
  region: string;
  displayName: string;
  characteristics: {
    pitch: 'low' | 'medium' | 'high';
    speed: 'slow' | 'normal' | 'fast';
    tone: 'warm' | 'neutral' | 'cool';
    accentStrength: 'none' | 'subtle' | 'moderate';
  };
  prohibitedCharacteristics: string[];
  ageAppropriate: boolean;
  culturallySensitive: boolean;
  previewUrl?: string;
  createdAt: Date;
}

export interface CodeSwitchingTrigger {
  type:
    | 'user_language_change'
    | 'user_explicit_request'
    | 'mixed_language_detected'
    | 'emotional_overwhelm'
    | 'context_based';
  detectedLanguages: LanguageCode[];
  chosenLanguage: LanguageCode;
  reason: string;
  timestamp: Date;
}

export interface TranslationRequest {
  text: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  aiId: string;
  userId: string;
  context?: string;
}

export interface TranslationResponse {
  translatedText: string;
  originalLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  safetyCheckPassed: boolean;
  warnings: string[];
}

export interface LanguageDetectionResult {
  primaryLanguage: LanguageCode;
  confidence: number;
  alternativeLanguages: Array<{
    language: LanguageCode;
    confidence: number;
  }>;
}

export interface MessageSafetyCheckResult {
  allowed: boolean;
  violations: SafetyViolation[];
  sanitizedMessage?: string;
  blockReason?: string;
}

export interface LocalizedFlirtStyle {
  language: LanguageCode;
  culturalNorms: {
    directness: 'subtle' | 'moderate' | 'direct';
    humor: 'low' | 'moderate' | 'high';
    poetry: 'low' | 'moderate' | 'high';
    formality: 'casual' | 'neutral' | 'formal';
  };
  allowedExpressions: string[];
  prohibitedExpressions: string[];
  examples: {
    compliment: string[];
    greeting: string[];
    goodbye: string[];
  };
}

export interface VoiceRequestBlock {
  userId: string;
  voicePackId: string;
  reason: string;
  timestamp: Date;
}

export interface LanguageSwitchEvent {
  userId: string;
  aiId: string;
  fromLanguage: LanguageCode;
  toLanguage: LanguageCode;
  trigger: CodeSwitchingTrigger['type'];
  success: boolean;
  timestamp: Date;
}

export interface MultilingualMemory {
  userId: string;
  aiId: string;
  memories: Array<{
    content: string;
    language: LanguageCode;
    timestamp: Date;
    emotional_context?: string;
  }>;
  primaryLanguage: LanguageCode;
  languageHistory: LanguageCode[];
}

export interface CulturalContextData {
  language: LanguageCode;
  region: string;
  etiquette: {
    greetings: string[];
    farewells: string[];
    politenessLevel: 'low' | 'moderate' | 'high';
  };
  topics: {
    appropriate: string[];
    sensitive: string[];
    prohibited: string[];
  };
  communication: {
    directness: 'indirect' | 'moderate' | 'direct';
    emotionalExpression: 'reserved' | 'moderate' | 'expressive';
    personalSpace: 'close' | 'moderate' | 'distant';
  };
}

export const LANGUAGE_METADATA: Record<LanguageCode, LanguageMetadata> = {
  en: { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', voiceSupported: true },
  pl: { code: 'pl', name: 'Polish', nativeName: 'Polski', flag: '🇵🇱', voiceSupported: true },
  es: { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', voiceSupported: true },
  pt: { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹', voiceSupported: true },
  de: { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', voiceSupported: true },
  fr: { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', voiceSupported: true },
  it: { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹', voiceSupported: true },
  ro: { code: 'ro', name: 'Romanian', nativeName: 'Română', flag: '🇷🇴', voiceSupported: true },
  tr: { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷', voiceSupported: true },
  ar: { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', rtl: true, voiceSupported: true },
  hi: { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', voiceSupported: true },
  ja: { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', voiceSupported: true },
  ko: { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷', voiceSupported: true },
  zh: { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳', voiceSupported: true },
  ru: { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺', voiceSupported: true },
  nl: { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱', voiceSupported: true },
  sv: { code: 'sv', name: 'Swedish', nativeName: 'Svenska', flag: '🇸🇪', voiceSupported: true },
  da: { code: 'da', name: 'Danish', nativeName: 'Dansk', flag: '🇩🇰', voiceSupported: true },
  no: { code: 'no', name: 'Norwegian', nativeName: 'Norsk', flag: '🇳🇴', voiceSupported: true },
  fi: { code: 'fi', name: 'Finnish', nativeName: 'Suomi', flag: '🇫🇮', voiceSupported: true },
  cs: { code: 'cs', name: 'Czech', nativeName: 'Čeština', flag: '🇨🇿', voiceSupported: false },
  sk: { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', flag: '🇸🇰', voiceSupported: false },
  hu: { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', flag: '🇭🇺', voiceSupported: false },
  el: { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', flag: '🇬🇷', voiceSupported: false },
  he: { code: 'he', name: 'Hebrew', nativeName: 'עברית', flag: '🇮🇱', rtl: true, voiceSupported: false },
  th: { code: 'th', name: 'Thai', nativeName: 'ไทย', flag: '🇹🇭', voiceSupported: true },
  vi: { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳', voiceSupported: false },
  id: { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩', voiceSupported: false },
  ms: { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', flag: '🇲🇾', voiceSupported: false },
  tl: { code: 'tl', name: 'Tagalog', nativeName: 'Tagalog', flag: '🇵🇭', voiceSupported: false },
  uk: { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦', voiceSupported: false },
  bg: { code: 'bg', name: 'Bulgarian', nativeName: 'Български', flag: '🇧🇬', voiceSupported: false },
  hr: { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski', flag: '🇭🇷', voiceSupported: false },
  sr: { code: 'sr', name: 'Serbian', nativeName: 'Српски', flag: '🇷🇸', voiceSupported: false },
  sl: { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina', flag: '🇸🇮', voiceSupported: false },
  et: { code: 'et', name: 'Estonian', nativeName: 'Eesti', flag: '🇪🇪', voiceSupported: false },
  lv: { code: 'lv', name: 'Latvian', nativeName: 'Latviešu', flag: '🇱🇻', voiceSupported: false },
  lt: { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių', flag: '🇱🇹', voiceSupported: false },
  is: { code: 'is', name: 'Icelandic', nativeName: 'Íslenska', flag: '🇮🇸', voiceSupported: false },
  ga: { code: 'ga', name: 'Irish', nativeName: 'Gaeilge', flag: '🇮🇪', voiceSupported: false },
  cy: { code: 'cy', name: 'Welsh', nativeName: 'Cymraeg', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', voiceSupported: false },
  sq: { code: 'sq', name: 'Albanian', nativeName: 'Shqip', flag: '🇦🇱', voiceSupported: false },
  mk: { code: 'mk', name: 'Macedonian', nativeName: 'Македонски', flag: '🇲🇰', voiceSupported: false },
  mt: { code: 'mt', name: 'Maltese', nativeName: 'Malti', flag: '🇲🇹', voiceSupported: false },
  eu: { code: 'eu', name: 'Basque', nativeName: 'Euskara', flag: '🏴', voiceSupported: false }
};