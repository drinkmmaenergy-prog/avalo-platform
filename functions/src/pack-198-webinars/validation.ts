/**
 * PACK 198 — Event Validation & Content Filtering
 * Ensures all events remain professional, educational, and SFW
 */

import { EventCategory } from './types';

const BLOCKED_KEYWORDS = [
  'intimacy workshop',
  'erotic',
  'seduction',
  'pickup',
  'dating game',
  'how to be irresistible',
  'monetize flirting',
  'monetize looks',
  'romantic coaching',
  'private affection',
  'jealousy',
  'flirty rewards',
  'vip romantic',
  'meet and greet romantic',
  'sensual',
  'sexual',
  'nsfw',
  'adult content',
  'hookup',
  'attract women',
  'attract men',
  'get her number',
  'text game',
  'negging',
  'kino',
  'escalation tutorial',
  'body language seduction',
  'confidence for dating',
];

const BLOCKED_PATTERNS = [
  /\b(seduc|seducing|seductive)\b/i,
  /\b(flirt|flirting|flirtatious)\b.*\b(teach|learn|course|workshop)\b/i,
  /\b(dating|romance|romantic)\b.*\b(coach|coaching|strategy)\b/i,
  /\b(pickup|pick-up|pick up)\b.*\b(artist|artistry|techniques)\b/i,
  /\b(intimacy|intimate)\b.*\b(workshop|seminar|course)\b/i,
  /\b(hot|sexy|attractive)\b.*\b(how to be|become|get)\b/i,
  /\b(looks|appearance)\b.*\b(monetize|profit|cash)\b/i,
];

export interface ValidationResult {
  isValid: boolean;
  reason?: string;
  blockedContent?: string[];
}

export function validateEventTitle(title: string): ValidationResult {
  const lowerTitle = title.toLowerCase();
  
  for (const keyword of BLOCKED_KEYWORDS) {
    if (lowerTitle.includes(keyword)) {
      return {
        isValid: false,
        reason: 'Event title contains prohibited content related to dating, seduction, or NSFW material',
        blockedContent: [keyword],
      };
    }
  }
  
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(title)) {
      return {
        isValid: false,
        reason: 'Event title matches prohibited content pattern',
        blockedContent: [pattern.toString()],
      };
    }
  }
  
  return { isValid: true };
}

export function validateEventDescription(description: string): ValidationResult {
  const lowerDesc = description.toLowerCase();
  const blockedFound: string[] = [];
  
  for (const keyword of BLOCKED_KEYWORDS) {
    if (lowerDesc.includes(keyword)) {
      blockedFound.push(keyword);
    }
  }
  
  if (blockedFound.length > 0) {
    return {
      isValid: false,
      reason: 'Event description contains prohibited content related to dating, seduction, or NSFW material',
      blockedContent: blockedFound,
    };
  }
  
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(description)) {
      return {
        isValid: false,
        reason: 'Event description matches prohibited content pattern',
        blockedContent: [pattern.toString()],
      };
    }
  }
  
  return { isValid: true };
}

export function validateEventCategory(
  category: EventCategory,
  title: string,
  description: string
): ValidationResult {
  const combinedText = `${title} ${description}`.toLowerCase();
  
  if (category === EventCategory.PERSONAL_DEVELOPMENT) {
    const datingRelated = [
      'dating',
      'romance',
      'relationship attraction',
      'get a date',
      'find love',
    ];
    
    for (const term of datingRelated) {
      if (combinedText.includes(term)) {
        return {
          isValid: false,
          reason: 'Personal development events cannot focus on dating or romantic attraction',
          blockedContent: [term],
        };
      }
    }
  }
  
  if (category === EventCategory.FITNESS) {
    const bodyFocused = [
      'look hot',
      'sexy body',
      'attract with abs',
      'beach body for dates',
    ];
    
    for (const term of bodyFocused) {
      if (combinedText.includes(term)) {
        return {
          isValid: false,
          reason: 'Fitness events cannot focus on appearance for romantic attraction',
          blockedContent: [term],
        };
      }
    }
  }
  
  return { isValid: true };
}

export function validateChatMessage(content: string): ValidationResult {
  const lowerContent = content.toLowerCase();
  
  const harassmentPatterns = [
    /\b(stupid|idiot|dumb|moron)\b/i,
    /\b(ugly|gross|disgusting)\b/i,
    /\b(kill yourself|kys)\b/i,
    /\b(rape|sexually assault)\b/i,
  ];
  
  for (const pattern of harassmentPatterns) {
    if (pattern.test(content)) {
      return {
        isValid: false,
        reason: 'Message contains harassment or abusive language',
      };
    }
  }
  
  const romanticPickupPatterns = [
    /\b(what's your number|send nudes|private chat)\b/i,
    /\b(you're so hot|looking sexy|beautiful eyes)\b/i,
    /\b(want to hook up|netflix and chill)\b/i,
  ];
  
  for (const pattern of romanticPickupPatterns) {
    if (pattern.test(content)) {
      return {
        isValid: false,
        reason: 'Message contains inappropriate romantic or sexual content',
      };
    }
  }
  
  return { isValid: true };
}

export function validatePollQuestion(question: string, options: string[]): ValidationResult {
  const validation = validateChatMessage(question);
  if (!validation.isValid) {
    return validation;
  }
  
  const sexualizedPatterns = [
    /\b(hottest|sexiest|most attractive)\b/i,
    /\b(smash or pass|hit or quit)\b/i,
    /\b(body part|physical feature)\b.*\b(favorite|best)\b/i,
  ];
  
  for (const pattern of sexualizedPatterns) {
    if (pattern.test(question)) {
      return {
        isValid: false,
        reason: 'Poll question contains sexualized or objectifying content',
      };
    }
  }
  
  for (const option of options) {
    const optionValidation = validateChatMessage(option);
    if (!optionValidation.isValid) {
      return {
        isValid: false,
        reason: `Poll option contains prohibited content: ${option}`,
      };
    }
  }
  
  return { isValid: true };
}

export function validateMaterialContent(
  type: string,
  fileName: string,
  description?: string
): ValidationResult {
  if (type === 'slides' || type === 'document') {
    const fileNameLower = fileName.toLowerCase();
    const blockedFilePatterns = [
      'seduction',
      'pickup',
      'dating guide',
      'attraction secrets',
      'get laid',
      'hookup',
    ];
    
    for (const pattern of blockedFilePatterns) {
      if (fileNameLower.includes(pattern)) {
        return {
          isValid: false,
          reason: 'Material file name contains prohibited content',
          blockedContent: [pattern],
        };
      }
    }
  }
  
  if (description) {
    return validateEventDescription(description);
  }
  
  return { isValid: true };
}

export function validateTranslationIntegrity(
  sourceText: string,
  translatedText: string,
  targetLanguage: string
): ValidationResult {
  const sourceValidation = validateChatMessage(sourceText);
  if (!sourceValidation.isValid) {
    return sourceValidation;
  }
  
  const translatedValidation = validateChatMessage(translatedText);
  if (!translatedValidation.isValid) {
    return {
      isValid: false,
      reason: 'Translation contains prohibited content not present in source',
    };
  }
  
  const sourceLength = sourceText.length;
  const translatedLength = translatedText.length;
  
  if (translatedLength > sourceLength * 3) {
    return {
      isValid: false,
      reason: 'Translation is suspiciously longer than source (possible content injection)',
    };
  }
  
  const powerPlayPatterns = [
    /\b(dominate|control|manipulate)\b/i,
    /\b(inferior|superior|alpha|beta)\b/i,
  ];
  
  let powerPlayInSource = false;
  let powerPlayInTranslation = false;
  
  for (const pattern of powerPlayPatterns) {
    if (pattern.test(sourceText)) powerPlayInSource = true;
    if (pattern.test(translatedText)) powerPlayInTranslation = true;
  }
  
  if (powerPlayInTranslation && !powerPlayInSource) {
    return {
      isValid: false,
      reason: 'Translation adds power-play language not present in source',
    };
  }
  
  return { isValid: true };
}

export function calculateToxicityScore(content: string): number {
  let score = 0;
  const lowerContent = content.toLowerCase();
  
  const toxicityIndicators = [
    { pattern: /\b(hate|hatred)\b/i, weight: 0.3 },
    { pattern: /\b(stupid|idiot|dumb)\b/i, weight: 0.2 },
    { pattern: /\b(shut up|stfu)\b/i, weight: 0.25 },
    { pattern: /\b(ugly|gross)\b/i, weight: 0.2 },
    { pattern: /\b(kill|die)\b/i, weight: 0.4 },
    { pattern: /\b(rape|assault)\b/i, weight: 0.5 },
    { pattern: /\b(n[i!1]gg[e3]r|f[a@]gg[o0]t|c[u*]nt)\b/i, weight: 0.6 },
  ];
  
  for (const indicator of toxicityIndicators) {
    if (indicator.pattern.test(content)) {
      score += indicator.weight;
    }
  }
  
  const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
  if (capsRatio > 0.5 && content.length > 10) {
    score += 0.1;
  }
  
  const exclamationCount = (content.match(/!/g) || []).length;
  if (exclamationCount > 3) {
    score += 0.05 * exclamationCount;
  }
  
  return Math.min(score, 1.0);
}

export function shouldAutoModerate(
  toxicityScore: number,
  threshold: number,
  userHistory: { warnings: number; previousFlags: number }
): { shouldModerate: boolean; action: 'warning' | 'shadow_mute' | 'block' | null } {
  if (toxicityScore < threshold) {
    return { shouldModerate: false, action: null };
  }
  
  if (toxicityScore >= 0.8) {
    return { shouldModerate: true, action: 'block' };
  }
  
  if (toxicityScore >= 0.5 || userHistory.warnings >= 3) {
    return { shouldModerate: true, action: 'shadow_mute' };
  }
  
  if (toxicityScore >= threshold || userHistory.previousFlags >= 2) {
    return { shouldModerate: true, action: 'warning' };
  }
  
  return { shouldModerate: false, action: null };
}

export function validateRevenueShare(
  totalRevenue: number
): { creatorShare: number; platformShare: number } {
  const creatorShare = Math.round(totalRevenue * 0.65 * 100) / 100;
  const platformShare = Math.round(totalRevenue * 0.35 * 100) / 100;
  
  return { creatorShare, platformShare };
}

export function canEnableCertificate(
  eventType: string,
  duration: number,
  hasAssessment: boolean
): boolean {
  if (duration < 1800) {
    return false;
  }
  
  const educationalTypes = [
    'business',
    'fitness',
    'nutrition',
    'personal_development',
    'music_art',
  ];
  
  return educationalTypes.includes(eventType);
}