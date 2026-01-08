/**
 * PACK 153 — ML-Based Content Classifiers
 * 
 * Text Sentiment · Hate-Speech Detection · Voice Analysis · Multilingual
 */

import {
  ContentType,
  ViolationType,
  ViolationSeverity,
  ContentClassificationResult,
  LanguageContext,
  ProtectedBehavior,
  getViolationSeverity,
} from './types/safety.types';
import { serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// TEXT SENTIMENT ANALYSIS
// ============================================================================

/**
 * Analyze text sentiment
 */
export function analyzeSentiment(text: string): {
  score: number;
  label: 'NEGATIVE' | 'NEUTRAL' | 'POSITIVE';
} {
  // Calculate sentiment score based on positive/negative word presence
  const positiveWords = [
    'love', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 
    'good', 'nice', 'happy', 'thank', 'appreciate', 'awesome'
  ];
  
  const negativeWords = [
    'hate', 'terrible', 'awful', 'bad', 'horrible', 'disgusting',
    'stupid', 'idiot', 'loser', 'pathetic', 'worthless', 'useless'
  ];

  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);

  let score = 0;
  for (const word of words) {
    if (positiveWords.some(pw => word.includes(pw))) {
      score += 0.1;
    }
    if (negativeWords.some(nw => word.includes(nw))) {
      score -= 0.1;
    }
  }

  // Clamp score to -1 to 1
  score = Math.max(-1, Math.min(1, score));

  let label: 'NEGATIVE' | 'NEUTRAL' | 'POSITIVE';
  if (score < -0.2) label = 'NEGATIVE';
  else if (score > 0.2) label = 'POSITIVE';
  else label = 'NEUTRAL';

  return { score, label };
}

// ============================================================================
// TOXICITY DETECTION
// ============================================================================

/**
 * Detect toxicity in content
 */
export function detectToxicity(text: string): {
  score: number;
  categories: Array<{ category: string; score: number }>;
} {
  const categories = [
    { name: 'profanity', keywords: ['fuck', 'shit', 'damn', 'bitch', 'ass'], weight: 0.3 },
    { name: 'insults', keywords: ['stupid', 'idiot', 'moron', 'loser', 'dumb'], weight: 0.5 },
    { name: 'threats', keywords: ['kill', 'hurt', 'attack', 'destroy', 'die'], weight: 1.0 },
    { name: 'hate_speech', keywords: getHateSpeechKeywords(), weight: 1.0 },
    { name: 'sexual', keywords: ['sex', 'sexy', 'body', 'naked', 'nude'], weight: 0.7 },
  ];

  const lower = text.toLowerCase();
  const detectedCategories: Array<{ category: string; score: number }> = [];
  let overallScore = 0;

  for (const category of categories) {
    let categoryScore = 0;
    for (const keyword of category.keywords) {
      if (lower.includes(keyword)) {
        categoryScore += 30 * category.weight;
      }
    }

    categoryScore = Math.min(100, categoryScore);
    if (categoryScore > 0) {
      detectedCategories.push({
        category: category.name,
        score: categoryScore,
      });
      overallScore = Math.max(overallScore, categoryScore);
    }
  }

  return {
    score: Math.min(100, overallScore),
    categories: detectedCategories,
  };
}

/**
 * Get hate speech keywords
 */
function getHateSpeechKeywords(): string[] {
  return [
    // Racism
    'racist', 'racism',
    // Homophobia
    'homophobic', 'homophobia',
    // Transphobia
    'transphobic', 'transphobia',
    // Sexism
    'sexist', 'sexism', 'misogyny', 'misandry',
    // Xenophobia
    'xenophobic', 'xenophobia',
    // Religious hate
    'religious hate',
  ];
}

// ============================================================================
// VIOLATION DETECTION
// ============================================================================

/**
 * Detect violations in content
 */
export function detectViolations(text: string, context: {
  isDirected: boolean;
  targetUserId?: string;
  conversationHistory?: string[];
}): Array<{
  type: ViolationType;
  confidence: number;
  severity: ViolationSeverity;
  explanation: string;
}> {
  const violations: Array<{
    type: ViolationType;
    confidence: number;
    severity: ViolationSeverity;
    explanation: string;
  }> = [];

  const lower = text.toLowerCase();

  // Violent threats
  if (detectViolentThreat(lower)) {
    violations.push({
      type: ViolationType.VIOLENT_THREAT,
      confidence: 90,
      severity: ViolationSeverity.CRITICAL,
      explanation: 'Content contains violent threats',
    });
  }

  // Self-harm encouragement
  if (detectSelfHarm(lower)) {
    violations.push({
      type: ViolationType.SELF_HARM_ENCOURAGEMENT,
      confidence: 85,
      severity: ViolationSeverity.CRITICAL,
      explanation: 'Content encourages self-harm',
    });
  }

  // Sexual coercion
  if (detectSexualCoercion(lower)) {
    violations.push({
      type: ViolationType.SEXUAL_COERCION,
      confidence: 85,
      severity: ViolationSeverity.CRITICAL,
      explanation: 'Content contains sexual coercion',
    });
  }

  // Hate speech
  const hateType = detectHateSpeech(lower);
  if (hateType) {
    violations.push({
      type: hateType,
      confidence: 80,
      severity: ViolationSeverity.HIGH,
      explanation: `Hate speech detected: ${hateType}`,
    });
  }

  // Harassment (only if directed)
  if (context.isDirected && detectHarassment(lower)) {
    violations.push({
      type: ViolationType.TARGETED_HARASSMENT,
      confidence: 75,
      severity: ViolationSeverity.MEDIUM,
      explanation: 'Content contains targeted harassment',
    });
  }

  // Blackmail
  if (detectBlackmail(lower)) {
    violations.push({
      type: ViolationType.BLACKMAIL,
      confidence: 85,
      severity: ViolationSeverity.CRITICAL,
      explanation: 'Content contains blackmail or extortion',
    });
  }

  // NSFW content
  if (detectNSFW(lower)) {
    violations.push({
      type: ViolationType.NSFW_CONTENT,
      confidence: 80,
      severity: ViolationSeverity.HIGH,
      explanation: 'Content contains NSFW material',
    });
  }

  // Romance for payment
  if (detectRomanceForPayment(lower)) {
    violations.push({
      type: ViolationType.ROMANCE_FOR_PAYMENT,
      confidence: 75,
      severity: ViolationSeverity.HIGH,
      explanation: 'Content suggests romance for payment',
    });
  }

  return violations;
}

/**
 * Detect violent threats
 */
function detectViolentThreat(text: string): boolean {
  const threatPatterns = [
    /\b(kill|murder|destroy|attack|hurt|harm)\s+(you|them|him|her)\b/i,
    /\bi('ll|will)\s+(kill|murder|destroy|attack|hurt)\b/i,
    /\b(die|death)\s+threat\b/i,
    /\bgoing\s+to\s+(kill|hurt|harm)\b/i,
  ];

  return threatPatterns.some(pattern => pattern.test(text));
}

/**
 * Detect self-harm encouragement
 */
function detectSelfHarm(text: string): boolean {
  const patterns = [
    /\b(kill|harm)\s+yourself\b/i,
    /\byou\s+should\s+(die|suicide)\b/i,
    /\bend\s+your\s+life\b/i,
  ];

  return patterns.some(pattern => pattern.test(text));
}

/**
 * Detect sexual coercion
 */
function detectSexualCoercion(text: string): boolean {
  const patterns = [
    /\b(nudes?|naked|sex)\s+(or|otherwise)\b/i,
    /\bsend\s+me\s+(nudes?|pictures?|photos?)\b/i,
    /\bsexual\s+(favor|act)\b/i,
    /\bdo\s+this\s+sexual\b/i,
  ];

  return patterns.some(pattern => pattern.test(text));
}

/**
 * Detect hate speech type
 */
function detectHateSpeech(text: string): ViolationType | null {
  // Racism
  if (/\b(racist|racism|racial\s+slur)\b/i.test(text)) {
    return ViolationType.RACISM;
  }

  // Homophobia
  if (/\b(homophobic|homophobia|anti-gay)\b/i.test(text)) {
    return ViolationType.HOMOPHOBIA;
  }

  // Transphobia
  if (/\b(transphobic|transphobia|anti-trans)\b/i.test(text)) {
    return ViolationType.TRANSPHOBIA;
  }

  // Misogyny
  if (/\b(misogyn|women\s+are\s+(inferior|stupid|weak))\b/i.test(text)) {
    return ViolationType.MISOGYNY;
  }

  // Misandry
  if (/\b(misandry|men\s+are\s+(trash|garbage|pigs))\b/i.test(text)) {
    return ViolationType.MISANDRY;
  }

  // Xenophobia
  if (/\b(xenophob|foreigner|immigrant)\s+(hate|disgust)\b/i.test(text)) {
    return ViolationType.XENOPHOBIA;
  }

  return null;
}

/**
 * Detect harassment
 */
function detectHarassment(text: string): boolean {
  const patterns = [
    /\b(stupid|idiot|moron|loser|pathetic|worthless|useless)\b/i,
    /\bhate\s+you\b/i,
    /\byou('re|\s+are)\s+(ugly|fat|disgusting)\b/i,
    /\bleave\s+me\s+alone\b/i, // Response to harassment
  ];

  return patterns.some(pattern => pattern.test(text));
}

/**
 * Detect blackmail
 */
function detectBlackmail(text: string): boolean {
  const patterns = [
    /\b(unless|or\s+else|or\s+i('ll|will))\b.*\b(expose|reveal|tell|share)\b/i,
    /\bdo\s+this\s+or\b/i,
    /\bgive\s+me\s+.+\s+or\b/i,
  ];

  return patterns.some(pattern => pattern.test(text));
}

/**
 * Detect NSFW content
 */
function detectNSFW(text: string): boolean {
  const nsfwKeywords = [
    'explicit', 'sexual', 'nude', 'naked', 'porn', 'xxx',
    'erotic', 'seduce', 'seduction', 'orgasm',
  ];

  const lower = text.toLowerCase();
  return nsfwKeywords.some(keyword => lower.includes(keyword));
}

/**
 * Detect romance for payment
 */
function detectRomanceForPayment(text: string): boolean {
  const patterns = [
    /\b(pay|money|cash|tokens?)\s+(for|to)\s+(date|romance|love|relationship)\b/i,
    /\bbuy\s+my\s+(love|affection)\b/i,
    /\b(girlfriend|boyfriend)\s+experience\s+for\s+(money|payment)\b/i,
  ];

  return patterns.some(pattern => pattern.test(text));
}

// ============================================================================
// PROTECTED BEHAVIOR DETECTION
// ============================================================================

/**
 * Detect protected behaviors that should never be blocked
 */
export function detectProtectedBehavior(text: string, context: {
  isDirected: boolean;
  conversationHistory?: string[];
}): ProtectedBehavior | null {
  const lower = text.toLowerCase();

  // Polite conversation
  if (detectPoliteConversation(lower)) {
    return ProtectedBehavior.POLITE_CONVERSATION;
  }

  // Constructive criticism
  if (detectConstructiveCriticism(lower)) {
    return ProtectedBehavior.CONSTRUCTIVE_CRITICISM;
  }

  // Humor and sarcasm
  if (detectHumorSarcasm(lower)) {
    return ProtectedBehavior.HUMOR_SARCASM;
  }

  // Professional networking
  if (detectProfessionalNetworking(lower)) {
    return ProtectedBehavior.PROFESSIONAL_NETWORKING;
  }

  // Strong language (non-directed)
  if (!context.isDirected && detectStrongLanguageNonDirected(lower)) {
    return ProtectedBehavior.STRONG_LANGUAGE_NON_DIRECTED;
  }

  return null;
}

/**
 * Detect polite conversation
 */
function detectPoliteConversation(text: string): boolean {
  const politeIndicators = [
    'please', 'thank', 'appreciate', 'grateful', 'kindly',
    'would you', 'could you', 'may i', 'excuse me',
  ];

  return politeIndicators.some(indicator => text.includes(indicator));
}

/**
 * Detect constructive criticism
 */
function detectConstructiveCriticism(text: string): boolean {
  const patterns = [
    /\bi\s+think\s+you\s+could\s+improve\b/i,
    /\bconsider\s+(changing|improving|adjusting)\b/i,
    /\bsuggestion\b/i,
    /\bfeedback\b/i,
  ];

  return patterns.some(pattern => pattern.test(text));
}

/**
 * Detect humor and sarcasm
 */
function detectHumorSarcasm(text: string): boolean {
  const indicators = [
    'lol', 'haha', 'lmao', '😂', '😄', '🤣',
    'just kidding', 'jk', 'joking', 'sarcasm',
  ];

  return indicators.some(indicator => text.includes(indicator));
}

/**
 * Detect professional networking
 */
function detectProfessionalNetworking(text: string): boolean {
  const keywords = [
    'collaborate', 'partnership', 'business', 'professional',
    'network', 'connect', 'opportunity', 'project',
  ];

  return keywords.some(keyword => text.includes(keyword));
}

/**
 * Detect strong language (non-directed)
 */
function detectStrongLanguageNonDirected(text: string): boolean {
  const patterns = [
    /\bthis\s+is\s+(killing|destroying)\s+me\b/i,
    /\bthis\s+(sucks|is\s+terrible)\b/i,
    /\bdamn\s+(right|straight)\b/i,
  ];

  return patterns.some(pattern => pattern.test(text));
}

// ============================================================================
// LANGUAGE DETECTION
// ============================================================================

/**
 * Detect language and context
 */
export function detectLanguageContext(text: string): LanguageContext {
  // Simple language detection (in production, use a proper library)
  const language = detectLanguage(text);

  return {
    language,
    dialect: undefined,
    slangDetected: detectSlang(text),
    codeSwitching: false,
    mixedLanguages: undefined,
    culturalReferences: [],
    memePatterns: detectMemePatterns(text),
    emojiContext: analyzeEmojiContext(text),
    codeWordsDetected: [],
    obfuscationAttempts: detectObfuscation(text),
  };
}

/**
 * Simple language detection
 */
function detectLanguage(text: string): string {
  // Very basic detection - in production, use a proper library
  const commonWords = {
    en: ['the', 'is', 'and', 'to', 'of', 'a'],
    es: ['el', 'la', 'de', 'que', 'y', 'es'],
    fr: ['le', 'de', 'et', 'à', 'un', 'il'],
    de: ['der', 'die', 'und', 'in', 'den', 'zu'],
  };

  const lower = text.toLowerCase();
  let maxMatches = 0;
  let detectedLang = 'en';

  for (const [lang, words] of Object.entries(commonWords)) {
    const matches = words.filter(word => lower.includes(` ${word} `)).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      detectedLang = lang;
    }
  }

  return detectedLang;
}

/**
 * Detect slang
 */
function detectSlang(text: string): string[] {
  const slangTerms = ['gonna', 'wanna', 'gotta', 'ain\'t', 'y\'all', 'bruh', 'sus'];
  const lower = text.toLowerCase();
  return slangTerms.filter(term => lower.includes(term));
}

/**
 * Detect meme patterns
 */
function detectMemePatterns(text: string): boolean {
  const memeIndicators = [
    'when you', 'nobody:', 'literally', 'vibing', 'big mood',
    'that\'s what she said', 'not gonna lie', 'change my mind',
  ];

  const lower = text.toLowerCase();
  return memeIndicators.some(indicator => lower.includes(indicator));
}

/**
 * Analyze emoji context
 */
function analyzeEmojiContext(text: string): Array<{
  emoji: string;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'HARASSMENT';
}> {
  // Simple emoji detection without unicode flag for compatibility
  const emojiPattern = /[\u2600-\u27BF]|[\uD83C-\uDBFF][\uDC00-\uDFFF]+?/g;
  const emojis = text.match(emojiPattern) || [];

  return emojis.map(emoji => {
    let sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'HARASSMENT' = 'NEUTRAL';

    // Positive emojis
    if (['😊', '😄', '😃', '👍', '❤️', '🎉'].includes(emoji)) {
      sentiment = 'POSITIVE';
    }
    // Negative emojis
    else if (['😠', '😡', '💢', '😤'].includes(emoji)) {
      sentiment = 'NEGATIVE';
    }
    // Harassment emojis (middle finger, etc.)
    else if (['🖕', '💩'].includes(emoji)) {
      sentiment = 'HARASSMENT';
    }

    return { emoji, sentiment };
  });
}

/**
 * Detect obfuscation attempts
 */
function detectObfuscation(text: string): boolean {
  // Detect excessive character spacing (e.g., "h a t e")
  const spacingPattern = /\b\w(\s+\w){3,}\b/;
  if (spacingPattern.test(text)) return true;

  // Detect excessive special characters
  const specialCharPattern = /[!@#$%^&*]{3,}/;
  if (specialCharPattern.test(text)) return true;

  // Detect leetspeak (e.g., "h4t3" for "hate")
  const leetspeakPattern = /\b\w*[0-9]\w*[0-9]\w*\b/;
  if (leetspeakPattern.test(text)) return true;

  return false;
}

// ============================================================================
// MAIN CLASSIFICATION FUNCTION
// ============================================================================

/**
 * Classify content comprehensively
 */
export async function classifyContent(params: {
  content: string;
  contentType: ContentType;
  userId: string;
  targetUserId?: string;
  conversationHistory?: string[];
}): Promise<ContentClassificationResult> {
  const startTime = Date.now();
  const { content, contentType, userId, targetUserId, conversationHistory } = params;

  // Analyze sentiment
  const sentiment = analyzeSentiment(content);

  // Detect toxicity
  const toxicity = detectToxicity(content);

  // Context flags
  const isDirected = !!targetUserId;
  const context = { isDirected, targetUserId, conversationHistory };

  // Detect violations
  const violations = detectViolations(content, context);

  // Detect protected behavior
  const protectedBehavior = detectProtectedBehavior(content, context);

  // Detect language context
  const languageContext = detectLanguageContext(content);

  // Determine final decision
  const shouldBlock = violations.some(
    v => v.severity === ViolationSeverity.HIGH || v.severity === ViolationSeverity.CRITICAL
  ) && !protectedBehavior;

  const shouldWarn = violations.length > 0 && !shouldBlock;
  const shouldEducate = violations.length > 0;

  return {
    contentType,
    content,
    sentiment,
    toxicity,
    violations,
    protectedBehavior: protectedBehavior || undefined,
    language: languageContext.language,
    languageConfidence: 85,
    contextFlags: {
      isHumor: !!protectedBehavior && protectedBehavior === ProtectedBehavior.HUMOR_SARCASM,
      isSarcasm: !!protectedBehavior && protectedBehavior === ProtectedBehavior.HUMOR_SARCASM,
      isDebate: !!protectedBehavior && protectedBehavior === ProtectedBehavior.CONSENSUAL_DEBATE,
      isDirected,
      targetUserId,
    },
    shouldBlock,
    shouldWarn,
    shouldEducate,
    processingTimeMs: Date.now() - startTime,
    modelVersion: '2.0.0',
    timestamp: serverTimestamp() as Timestamp,
  };
}

// ============================================================================
// VOICE TRANSCRIPT ANALYSIS
// ============================================================================

/**
 * Analyze voice transcript segment
 */
export async function analyzeVoiceTranscript(params: {
  transcript: string;
  userId: string;
  callId: string;
}): Promise<ContentClassificationResult> {
  return classifyContent({
    content: params.transcript,
    contentType: ContentType.VOICE_CALL,
    userId: params.userId,
  });
}

// ============================================================================
// BATCH CLASSIFICATION
// ============================================================================

/**
 * Classify multiple messages in batch
 */
export async function classifyBatch(messages: Array<{
  content: string;
  contentType: ContentType;
  userId: string;
  targetUserId?: string;
}>): Promise<ContentClassificationResult[]> {
  const results = await Promise.all(
    messages.map(msg => classifyContent(msg))
  );

  return results;
}