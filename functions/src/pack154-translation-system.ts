/**
 * PACK 154 — Avalo Multilingual AI Moderation & Auto-Translation Layer
 * Core translation system with safety-aware processing
 */

import { v4 as uuidv4 } from 'uuid';
import { db, admin, serverTimestamp, generateId } from './init';
import {
  TranslationRequest,
  TranslationResult,
  LanguageDetectionResult,
  ToneAnalysis,
  ToneProfile,
  ToneShift,
  TranslationSafetyFlag,
  SafetyFlagType,
  TranslationBlockReason,
  MultilingualPattern,
  VoiceTranslationRequest,
  VoiceTranslationResult,
  AudioToneAnalysis,
  EmotionalTone,
  FormalityLevel,
  IntentType,
  RomanceLevel,
} from './types/translation.types';
import { evaluateMessageSafety } from './pack153-safety-system';

// ============================================================================
// Language Detection
// ============================================================================

const CONFIDENCE_THRESHOLD = 70;

/**
 * Detect language of input text with confidence scoring
 */
export async function detectLanguage(text: string): Promise<LanguageDetectionResult> {
  if (!text || text.trim().length === 0) {
    return {
      language: 'unknown',
      confidence: 0,
      alternatives: [],
      script: 'unknown',
      dialects: [],
    };
  }

  // Common language patterns and scripts
  const patterns = [
    { lang: 'ar', pattern: /[\u0600-\u06FF]/, script: 'Arabic' },
    { lang: 'zh', pattern: /[\u4E00-\u9FFF]/, script: 'Han' },
    { lang: 'ja', pattern: /[\u3040-\u309F\u30A0-\u30FF]/, script: 'Hiragana/Katakana' },
    { lang: 'ko', pattern: /[\uAC00-\uD7AF]/, script: 'Hangul' },
    { lang: 'ru', pattern: /[\u0400-\u04FF]/, script: 'Cyrillic' },
    { lang: 'el', pattern: /[\u0370-\u03FF]/, script: 'Greek' },
    { lang: 'he', pattern: /[\u0590-\u05FF]/, script: 'Hebrew' },
    { lang: 'th', pattern: /[\u0E00-\u0E7F]/, script: 'Thai' },
    { lang: 'hi', pattern: /[\u0900-\u097F]/, script: 'Devanagari' },
  ];

  // Check script-specific languages first
  for (const { lang, pattern, script } of patterns) {
    if (pattern.test(text)) {
      return {
        language: lang,
        confidence: 95,
        alternatives: [],
        script,
        dialects: [],
      };
    }
  }

  // For Latin script, use statistical detection
  const latinScriptLanguages = await detectLatinScript(text);
  return latinScriptLanguages;
}

async function detectLatinScript(text: string): Promise<LanguageDetectionResult> {
  // Common words and patterns for Latin-script languages
  const indicators = {
    en: ['the', 'is', 'and', 'you', 'in', 'to', 'of', 'for'],
    es: ['el', 'la', 'de', 'que', 'en', 'los', 'es', 'por'],
    fr: ['le', 'de', 'un', 'et', 'être', 'à', 'il', 'que'],
    de: ['der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das'],
    pt: ['o', 'de', 'e', 'da', 'em', 'um', 'para', 'com'],
    it: ['il', 'di', 'e', 'la', 'per', 'un', 'in', 'che'],
    pl: ['w', 'i', 'na', 'z', 'to', 'się', 'nie', 'do'],
    tr: ['bir', 've', 'bu', 'için', 'de', 'mi', 'var', 'ne'],
  };

  const lowerText = text.toLowerCase();
  const scores: Record<string, number> = {};

  // Score each language
  for (const [lang, words] of Object.entries(indicators)) {
    let score = 0;
    for (const word of words) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = lowerText.match(regex);
      score += matches ? matches.length : 0;
    }
    scores[lang] = score;
  }

  // Get top language
  const sortedLangs = Object.entries(scores)
    .sort(([, a], [, b]) => b - a)
    .filter(([, score]) => score > 0);

  if (sortedLangs.length === 0) {
    return {
      language: 'en', // Default to English
      confidence: 50,
      alternatives: [],
      script: 'Latin',
      dialects: [],
    };
  }

  const [topLang, topScore] = sortedLangs[0];
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = Math.min(95, (topScore / totalScore) * 100);

  const alternatives = sortedLangs
    .slice(1, 4)
    .map(([lang, score]) => ({
      language: lang,
      confidence: Math.min(90, (score / totalScore) * 100),
    }));

  return {
    language: topLang,
    confidence,
    alternatives,
    script: 'Latin',
    dialects: [],
  };
}

// ============================================================================
// Tone Analysis
// ============================================================================

/**
 * Analyze tone and emotional content of text
 */
export function analyzeTone(text: string, language: string): ToneProfile {
  const lowerText = text.toLowerCase();

  // Romance indicators (DANGEROUS)
  const romancePatterns = {
    none: 0,
    friendly: ['friend', 'nice', 'cool', 'awesome', 'thanks'],
    flirtatious: ['cute', 'hot', 'sexy', 'handsome', 'beautiful', 'gorgeous'],
    romantic: ['love', 'heart', 'kiss', 'date', 'romance', 'sweetheart', 'darling'],
    intimate: ['baby', 'babe', 'honey', 'sweetie', 'cuddle', 'embrace'],
    sexual: ['fuck', 'sex', 'dick', 'pussy', 'cock', 'cum', 'nude', 'naked'],
  };

  let romanceLevel: RomanceLevel = 'none';
  let romanceScore = 0;

  for (const [level, patterns] of Object.entries(romancePatterns)) {
    if (level === 'none') continue;
    const patternArray = Array.isArray(patterns) ? patterns : [];
    for (const pattern of patternArray) {
      if (lowerText.includes(pattern)) {
        romanceScore = Math.max(
          romanceScore,
          level === 'friendly' ? 20 :
          level === 'flirtatious' ? 50 :
          level === 'romantic' ? 75 :
          level === 'intimate' ? 90 : 100
        );
        romanceLevel = level as RomanceLevel;
      }
    }
  }

  // Aggression indicators
  const aggressionPatterns = ['hate', 'kill', 'die', 'stupid', 'idiot', 'fuck you', 'bitch'];
  let aggression = 0;
  for (const pattern of aggressionPatterns) {
    if (lowerText.includes(pattern)) aggression += 20;
  }
  aggression = Math.min(100, aggression);

  // Affection indicators
  const affectionPatterns = ['love', 'care', 'miss', 'hug', 'kiss', 'heart'];
  let affection = 0;
  for (const pattern of affectionPatterns) {
    if (lowerText.includes(pattern)) affection += 15;
  }
  affection = Math.min(100, affection);

  // Professionalism indicators
  const professionalPatterns = ['please', 'thank you', 'regarding', 'sincerely', 'respectfully'];
  let professionalism = 50; // Default neutral
  for (const pattern of professionalPatterns) {
    if (lowerText.includes(pattern)) professionalism += 10;
  }
  professionalism = Math.min(100, professionalism);

  // Formality level
  let formality: FormalityLevel = 'neutral';
  if (professionalism > 70) formality = 'formal';
  else if (professionalism > 85) formality = 'very_formal';
  else if (romanceScore > 50 || affection > 60) formality = 'intimate';
  else if (aggression > 40 || lowerText.includes('lol') || lowerText.includes('haha')) formality = 'casual';

  // Emotional tone
  let emotional: EmotionalTone = 'neutral';
  if (aggression > 50) emotional = 'angry';
  else if (affection > 50) emotional = 'affectionate';
  else if (lowerText.includes('!') && romanceScore < 30) emotional = 'excited';
  else if (lowerText.includes('sad') || lowerText.includes('sorry')) emotional = 'sad';

  // Intent
  let intent: IntentType = 'conversational';
  if (romanceScore > 50) intent = 'romantic';
  else if (romanceScore > 70 || romanceLevel === 'sexual') intent = 'sexual';
  else if (aggression > 50) intent = 'aggressive';
  else if (affection > 40) intent = 'supportive';
  else if (lowerText.includes('?')) intent = 'informational';

  // Humor
  const humorPatterns = ['lol', 'haha', 'lmao', 'rofl', '😂', '🤣', '😄'];
  let humor = 0;
  for (const pattern of humorPatterns) {
    if (lowerText.includes(pattern)) humor += 20;
  }
  humor = Math.min(100, humor);

  return {
    emotional,
    formality,
    intent,
    romance: romanceLevel,
    aggression,
    affection,
    professionalism,
    humor,
  };
}

/**
 * Compare two tone profiles and detect escalation
 */
export function compareTones(original: ToneProfile, translated: ToneProfile): ToneShift {
  const romanceMap = { none: 0, friendly: 20, flirtatious: 50, romantic: 75, intimate: 90, sexual: 100 };
  const romanceShift = romanceMap[translated.romance] - romanceMap[original.romance];

  const emotionalMap = { neutral: 0, positive: 20, negative: -20, excited: 30, anxious: 10, angry: -50, sad: -30, affectionate: 50 };
  const emotionalShift = (emotionalMap[translated.emotional] || 0) - (emotionalMap[original.emotional] || 0);

  const formalityMap = { very_formal: 100, formal: 70, neutral: 50, casual: 30, intimate: 10 };
  const formalityShift = formalityMap[translated.formality] - formalityMap[original.formality];

  const aggressionShift = translated.aggression - original.aggression;

  const escalationDetected = 
    romanceShift > 0 || // ANY romance increase = BLOCK
    (aggressionShift > 20) || // Significant aggression increase
    (translated.intent === 'romantic' && original.intent !== 'romantic') ||
    (translated.intent === 'sexual' && original.intent !== 'sexual');

  const safe = !escalationDetected && romanceShift === 0;

  return {
    emotionalShift,
    formalityShift,
    romanceShift,
    aggressionShift,
    safe,
    escalationDetected,
  };
}

// ============================================================================
// Multilingual Safety Patterns
// ============================================================================

/**
 * Check for multilingual safety violations
 */
export async function checkMultilingualPatterns(
  text: string,
  language: string
): Promise<TranslationSafetyFlag[]> {
  const flags: TranslationSafetyFlag[] = [];
  const lowerText = text.toLowerCase();

  // Universal NSFW patterns (work across all languages)
  const nsfwPatterns = [
    { pattern: /\b(sex|fuck|dick|pussy|cock|nude|naked|porn|xxx)\b/i, severity: 'critical' as const },
    { pattern: /\b(sexy|hot|horny|naughty|kinky)\b/i, severity: 'high' as const },
    { pattern: /\b(breast|boob|ass|butt|penis|vagina)\b/i, severity: 'medium' as const },
  ];

  for (const { pattern, severity } of nsfwPatterns) {
    if (pattern.test(text)) {
      flags.push({
        type: 'NSFW_EXPLICIT',
        severity,
        confidence: 95,
        details: 'Explicit sexual content detected',
      });
    }
  }

  // Numeric slang (18+, 69, 420, etc.)
  const numericSlang = /\b(69|18\+|21\+|xxx|nsfw)\b/i;
  if (numericSlang.test(text)) {
    flags.push({
      type: 'NUMERIC_SLANG',
      severity: 'high',
      confidence: 90,
      details: 'Numeric slang for sexual content detected',
    });
  }

  // Emoji sexual indicators
  const sexualEmojis = ['🍆', '🍑', '💦', '🔞', '😈', '👅', '🔥'];
  for (const emoji of sexualEmojis) {
    if (text.includes(emoji)) {
      flags.push({
        type: 'EMOJI_EXPLOIT',
        severity: 'medium',
        confidence: 80,
        details: 'Sexually suggestive emoji detected',
      });
    }
  }

  // Romance monetization patterns
  const monetizationPatterns = [
    /\b(pay|money|cash|token|coin).{0,20}(love|kiss|date|meet)\b/i,
    /\b(love|kiss|date|meet).{0,20}(pay|money|cash|token|coin)\b/i,
    /\bsugar (daddy|mommy|baby)\b/i,
  ];

  for (const pattern of monetizationPatterns) {
    if (pattern.test(text)) {
      flags.push({
        type: 'ROMANCE_ADDED',
        severity: 'critical',
        confidence: 95,
        details: 'Romance monetization attempt detected',
      });
    }
  }

  // Harassment patterns
  const harassmentPatterns = [
    /\b(kill yourself|kys|die|hurt yourself)\b/i,
    /\b(stupid|idiot|moron|retard).{0,10}(bitch|slut|whore)\b/i,
  ];

  for (const pattern of harassmentPatterns) {
    if (pattern.test(text)) {
      flags.push({
        type: 'HARASSMENT',
        severity: 'critical',
        confidence: 90,
        details: 'Harassment or threats detected',
      });
    }
  }

  // Language mixing to hide violations
  const languageMixing = /[a-z]+[0-9]+[a-z]+|\b[a-z]{1,2}[0-9]{1,2}[a-z]{1,2}\b/i;
  if (languageMixing.test(text) && flags.length > 0) {
    flags.push({
      type: 'LANGUAGE_MIXING',
      severity: 'high',
      confidence: 75,
      details: 'Language mixing to bypass filters detected',
    });
  }

  return flags;
}

// ============================================================================
// Safe Translation
// ============================================================================

/**
 * Translate message safely with tone preservation
 */
export async function translateMessageSafely(
  request: TranslationRequest
): Promise<TranslationResult> {
  const translationId = uuidv4();
  const timestamp = Date.now();

  try {
    // Step 1: Detect source language if not provided
    const sourceLang = request.sourceLanguage || 
      (await detectLanguage(request.content)).language;

    // Step 2: Check original content with PACK 153
    const pack153Result = await evaluateMessageSafety({
      content: request.content,
      contentType: request.contentType as any,
      userId: request.contextUserId || 'anonymous',
      targetUserId: request.targetUserId,
    });

    // If PACK 153 blocks it, don't translate
    if (!pack153Result.allowed) {
      return {
        success: false,
        detectedSourceLanguage: sourceLang,
        targetLanguage: request.targetLanguage,
        allowed: false,
        blocked: true,
        blockReason: 'SOURCE_ALREADY_BLOCKED',
        originalContent: request.content,
        translationId,
        confidence: 100,
        toneAnalysis: {
          original: analyzeTone(request.content, sourceLang),
          translated: analyzeTone(request.content, sourceLang), // Same as original
          toneShift: { emotionalShift: 0, formalityShift: 0, romanceShift: 0, aggressionShift: 0, safe: false, escalationDetected: false },
          safe: false,
          warnings: ['Original content blocked by PACK 153'],
        },
        safetyFlags: [],
        messageToUser: pack153Result.messageToUser || 'This message violates our community guidelines.',
        appealEligible: false,
        timestamp,
      };
    }

    // Step 3: Analyze original tone
    const originalTone = analyzeTone(request.content, sourceLang);

    // Step 4: Perform translation (mock - in production use real API)
    const translatedContent = await performTranslation(
      request.content,
      sourceLang,
      request.targetLanguage
    );

    // Step 5: Analyze translated tone
    const translatedTone = analyzeTone(translatedContent, request.targetLanguage);

    // Step 6: Compare tones
    const toneShift = compareTones(originalTone, translatedTone);

    // Step 7: Check multilingual patterns
    const originalFlags = await checkMultilingualPatterns(request.content, sourceLang);
    const translatedFlags = await checkMultilingualPatterns(translatedContent, request.targetLanguage);
    const allFlags = [...originalFlags, ...translatedFlags];

    // Step 8: Determine if translation is safe
    const criticalFlags = allFlags.filter(f => f.severity === 'critical');
    const highFlags = allFlags.filter(f => f.severity === 'high');

    const blocked = 
      !toneShift.safe ||
      toneShift.escalationDetected ||
      criticalFlags.length > 0 ||
      highFlags.length >= 2;

    let blockReason: TranslationBlockReason | undefined;
    let messageToUser: string | undefined;

    if (blocked) {
      if (toneShift.romanceShift > 0) {
        blockReason = 'TONE_ESCALATION';
        messageToUser = 'Translation would add romantic or affectionate tone that was not in the original message.';
      } else if (criticalFlags.some(f => f.type === 'NSFW_EXPLICIT')) {
        blockReason = 'NSFW_CONTENT';
        messageToUser = 'Translation contains explicit sexual content.';
      } else if (criticalFlags.some(f => f.type === 'HARASSMENT')) {
        blockReason = 'HARASSMENT_DETECTED';
        messageToUser = 'Translation contains harassment or threats.';
      } else if (criticalFlags.some(f => f.type === 'ROMANCE_ADDED')) {
        blockReason = 'ROMANCE_MONETIZATION';
        messageToUser = 'Avalo blocks sexual or romantic monetization.';
      } else {
        blockReason = 'MANIPULATION_ATTEMPT';
        messageToUser = 'Translation would change the meaning in an unsafe way.';
      }
    }

    const result: TranslationResult = {
      success: !blocked,
      translatedContent: blocked ? undefined : translatedContent,
      detectedSourceLanguage: sourceLang,
      targetLanguage: request.targetLanguage,
      allowed: !blocked,
      blocked,
      blockReason,
      originalContent: request.content,
      translationId,
      confidence: 85, // Mock confidence
      toneAnalysis: {
        original: originalTone,
        translated: translatedTone,
        toneShift,
        safe: toneShift.safe,
        warnings: toneShift.escalationDetected ? ['Tone escalation detected'] : [],
      },
      safetyFlags: allFlags,
      messageToUser,
      appealEligible: !criticalFlags.some(f => f.type === 'NSFW_EXPLICIT'),
      timestamp,
    };

    // Log translation attempt
    await logTranslation(result, request);

    return result;

  } catch (error: any) {
    console.error('Translation error:', error);
    return {
      success: false,
      detectedSourceLanguage: request.sourceLanguage || 'unknown',
      targetLanguage: request.targetLanguage,
      allowed: false,
      blocked: true,
      blockReason: 'MANIPULATION_ATTEMPT',
      originalContent: request.content,
      translationId,
      confidence: 0,
      toneAnalysis: {
        original: analyzeTone(request.content, 'unknown'),
        translated: analyzeTone(request.content, 'unknown'),
        toneShift: { emotionalShift: 0, formalityShift: 0, romanceShift: 0, aggressionShift: 0, safe: false, escalationDetected: false },
        safe: false,
        warnings: ['Translation error'],
      },
      safetyFlags: [],
      messageToUser: 'Translation service temporarily unavailable.',
      appealEligible: false,
      timestamp,
    };
  }
}

/**
 * Mock translation function (replace with real API in production)
 */
async function performTranslation(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  // In production, use Google Translate API, DeepL, or similar
  // For now, return marked text
  return `[${targetLang.toUpperCase()}] ${text}`;
}

/**
 * Translate voice transcript safely
 */
export async function translateVoiceSafely(
  request: VoiceTranslationRequest
): Promise<VoiceTranslationResult> {
  const transcript = request.transcript || ''; // Would transcribe audio in production

  // Analyze audio tone for ASMR/sexual content
  const audioTone: AudioToneAnalysis = {
    pitch: 150, // Mock values - would analyze real audio
    speed: 120,
    volume: 65,
    breathiness: 20,
    whisper: 10,
    moaning: 0,
    seductive: 15,
    aggressive: 5,
    safe: true,
  };

  // Check for sexual audio characteristics
  if (audioTone.breathiness > 60 || audioTone.whisper > 50 || audioTone.moaning > 30 || audioTone.seductive > 60) {
    audioTone.safe = false;
  }

  // Translate transcript
  const translationResult = await translateMessageSafely({
    content: transcript,
    sourceLanguage: request.sourceLanguage,
    targetLanguage: request.targetLanguage,
    contentType: 'VOICE_TRANSCRIPT',
    channelType: 'voice_call',
  });

  const voiceResult: VoiceTranslationResult = {
    ...translationResult,
    audioTone,
    shouldMute: !audioTone.safe || translationResult.blocked,
    muteReason: !audioTone.safe ? 'Audio contains inappropriate sexual tone' : translationResult.messageToUser,
  };

  return voiceResult;
}

/**
 * Log translation attempt to database
 */
async function logTranslation(
  result: TranslationResult,
  request: TranslationRequest
): Promise<void> {
  try {
    await db.collection('translation_logs').doc(result.translationId).set({
      userId: request.contextUserId || 'anonymous',
      content: result.blocked ? '[REDACTED]' : request.content,
      translatedContent: result.translatedContent || null,
      sourceLanguage: result.detectedSourceLanguage,
      targetLanguage: result.targetLanguage,
      contentType: request.contentType,
      channelType: request.channelType,
      allowed: result.allowed,
      blocked: result.blocked,
      blockReason: result.blockReason || null,
      safetyFlags: result.safetyFlags,
      toneAnalysis: result.toneAnalysis,
      confidence: result.confidence,
      targetUserId: request.targetUserId || null,
      messageId: request.messageId || null,
      timestamp: result.timestamp,
      appealedAt: null as any,
      appealStatus: null as any,
    });

    // Log flags if any
    if (result.safetyFlags.length > 0) {
      await db.collection('translation_flags').doc(result.translationId).set({
        translationId: result.translationId,
        userId: request.contextUserId || 'anonymous',
        flagType: result.safetyFlags[0].type,
        severity: result.safetyFlags[0].severity,
        confidence: result.safetyFlags[0].confidence,
        blockReason: result.blockReason || null,
        originalContent: request.content,
        translatedAttempt: result.translatedContent || '[BLOCKED]',
        toneAnalysis: result.toneAnalysis,
        reviewed: false,
        timestamp: result.timestamp,
      });
    }

    // Track blocked attempts
    if (result.blocked && request.contextUserId) {
      await trackBlockedAttempt(request.contextUserId, result.blockReason!);
    }

  } catch (error) {
    console.error('Error logging translation:', error);
  }
}

/**
 * Track blocked translation attempts for pattern detection
 */
async function trackBlockedAttempt(
  userId: string,
  blockReason: TranslationBlockReason
): Promise<void> {
  const docRef = db.collection('blocked_translation_attempts').doc(userId);
  const doc = await docRef.get();

  if (doc.exists) {
    const data = doc.data()!;
    await docRef.update({
      attemptCount: admin.firestore.FieldValue.increment(1),
      lastAttempt: Date.now(),
      blockReasons: admin.firestore.FieldValue.arrayUnion(blockReason) as any,
    });
  } else {
    await docRef.set({
      id: userId,
      userId,
      attemptCount: 1,
      lastAttempt: Date.now(),
      blockReasons: [blockReason],
      patterns: [],
      escalated: false,
      accountFlagged: false,
    });
  }
}