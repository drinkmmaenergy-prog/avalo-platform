/**
 * PACK 187: Avalo AI Multilingual Consciousness Layer
 * 40+ Languages · Code-Switching · Cultural Safety · Accent Safety
 */

import * as functions from 'firebase-functions';
import { db, admin, serverTimestamp } from './init';

// Supported languages matrix
const SUPPORTED_LANGUAGES = [
  'en', 'pl', 'es', 'pt', 'de', 'fr', 'it', 'ro', 'tr', 'ar',
  'hi', 'ja', 'ko', 'zh', 'ru', 'nl', 'sv', 'da', 'no', 'fi',
  'cs', 'sk', 'hu', 'el', 'he', 'th', 'vi', 'id', 'ms', 'tl',
  'uk', 'bg', 'hr', 'sr', 'sl', 'et', 'lv', 'lt', 'is', 'ga',
  'cy', 'sq', 'mk', 'mt', 'eu'
];

// Cultural safety categories that should be blocked
const FORBIDDEN_PATTERNS = {
  stereotype: [
    'asian submissive',
    'latina fiery',
    'scandinavian ice queen',
    'african savage',
    'arab terrorist',
    'jewish money',
    'italian mafia',
    'russian spy',
    'french surrender',
    'german nazi'
  ],
  fetishization: [
    'exotic beauty',
    'oriental mystery',
    'spicy latina',
    'submissive asian',
    'dominant arab',
    'innocent schoolgirl'
  ],
  infantilization: [
    'baby voice',
    'kawaii desu',
    'uwu speak',
    'childish accent',
    'little girl voice'
  ],
  ownership: [
    'my property',
    'you belong to me',
    'i own you',
    'you are mine forever',
    'possession'
  ]
};

interface LanguageDetectionResult {
  primaryLanguage: string;
  confidence: number;
  alternativeLanguages: Array<{ language: string; confidence: number }>;
}

interface TranslationResult {
  translatedText: string;
  originalLanguage: string;
  targetLanguage: string;
  safetyCheckPassed: boolean;
  warnings: string[];
}

interface CulturalSafetyCheck {
  passed: boolean;
  violations: Array<{
    category: string;
    pattern: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
  suggestions: string[];
}

/**
 * Detect the language of user input
 */
export const detectUserLanguage = functions.https.onCall(
  async (data: { text: string; userId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { text, userId } = data;

    if (!text || text.length < 3) {
      return {
        primaryLanguage: 'en',
        confidence: 0.5,
        alternativeLanguages: []
      };
    }

    try {
      const detectionResult = await performLanguageDetection(text);
      
      await db.collection('language_detection_logs').add({
        userId,
        text: text.substring(0, 100),
        detectedLanguage: detectionResult.primaryLanguage,
        confidence: detectionResult.confidence,
        timestamp: serverTimestamp()
      });

      return detectionResult;
    } catch (error) {
      console.error('Language detection error:', error);
      return {
        primaryLanguage: 'en',
        confidence: 0.5,
        alternativeLanguages: []
      };
    }
  }
);

/**
 * Switch AI companion's active language
 */
export const switchAiLanguage = functions.https.onCall(
  async (data: { aiId: string; targetLanguage: string; userId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { aiId, targetLanguage, userId } = data;

    if (!SUPPORTED_LANGUAGES.includes(targetLanguage)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `Language ${targetLanguage} is not supported`
      );
    }

    try {
      const profileDoc = await db
        .collection('ai_language_profiles')
        .where('aiId', '==', aiId)
        .limit(1)
        .get();

      if (profileDoc.empty) {
        throw new functions.https.HttpsError('not-found', 'AI language profile not found');
      }

      const profile = profileDoc.docs[0].data();
      const supportedLanguages = [profile.primaryLanguage, ...(profile.secondaryLanguages || [])];

      if (!supportedLanguages.includes(targetLanguage)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          `AI does not support language ${targetLanguage}`
        );
      }

      await db.collection('ai_language_preferences').doc(userId).set(
        {
          [`ai_${aiId}_language`]: targetLanguage,
          lastSwitchTimestamp: serverTimestamp()
        },
        { merge: true }
      );

      return {
        success: true,
        newLanguage: targetLanguage,
        message: `Switched to ${targetLanguage}`
      };
    } catch (error) {
      console.error('Language switch error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to switch language');
    }
  }
);

/**
 * Translate AI message with cultural safety checks
 */
export const translateAiMessage = functions.https.onCall(
  async (
    data: {
      text: string;
      sourceLanguage: string;
      targetLanguage: string;
      aiId: string;
      userId: string;
      context?: string;
    },
    context
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { text, sourceLanguage, targetLanguage, aiId, userId } = data;

    if (!SUPPORTED_LANGUAGES.includes(sourceLanguage) || !SUPPORTED_LANGUAGES.includes(targetLanguage)) {
      throw new functions.https.HttpsError('invalid-argument', 'Unsupported language');
    }

    try {
      const safetyCheck = await checkCulturalSafety(text, sourceLanguage, targetLanguage);

      if (!safetyCheck.passed) {
        const criticalViolations = safetyCheck.violations.filter(v => v.severity === 'critical');
        if (criticalViolations.length > 0) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            'Message contains prohibited content'
          );
        }
      }

      const translatedText = await performTranslation(text, sourceLanguage, targetLanguage);

      const postTranslationCheck = await checkCulturalSafety(
        translatedText,
        targetLanguage,
        targetLanguage
      );

      const logEntry = {
        userId,
        aiId,
        originalLanguage: sourceLanguage,
        targetLanguage,
        originalText: text,
        translatedText,
        safetyCheckPassed: safetyCheck.passed && postTranslationCheck.passed,
        violations: [...safetyCheck.violations, ...postTranslationCheck.violations],
        timestamp: serverTimestamp()
      };

      await db.collection('ai_translation_logs').add(logEntry);

      return {
        translatedText,
        originalLanguage: sourceLanguage,
        targetLanguage,
        safetyCheckPassed: logEntry.safetyCheckPassed,
        warnings: safetyCheck.violations.map(v => v.category)
      };
    } catch (error) {
      console.error('Translation error:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', 'Translation failed');
    }
  }
);

/**
 * Check cultural safety of text
 */
export const applyCulturalSafetyRules = functions.https.onCall(
  async (data: { text: string; language: string; context?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { text, language } = data;

    try {
      const safetyCheck = await checkCulturalSafety(text, language, language);
      return safetyCheck;
    } catch (error) {
      console.error('Cultural safety check error:', error);
      throw new functions.https.HttpsError('internal', 'Safety check failed');
    }
  }
);

/**
 * Resolve language conflict in code-switching scenarios
 */
export const resolveLanguageConflictCase = functions.https.onCall(
  async (
    data: {
      userId: string;
      aiId: string;
      detectedLanguages: string[];
      userPreference?: string;
      messageContext: string;
    },
    context
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { userId, aiId, detectedLanguages, userPreference, messageContext } = data;

    try {
      const userPrefs = await db.collection('ai_language_preferences').doc(userId).get();
      const aiProfile = await db
        .collection('ai_language_profiles')
        .where('aiId', '==', aiId)
        .limit(1)
        .get();

      let chosenLanguage: string;

      if (userPreference && SUPPORTED_LANGUAGES.includes(userPreference)) {
        chosenLanguage = userPreference;
      } else if (userPrefs.exists && userPrefs.data()?.preferredLanguage) {
        chosenLanguage = userPrefs.data()!.preferredLanguage;
      } else if (!aiProfile.empty) {
        const profile = aiProfile.docs[0].data();
        const supportedLanguages = [profile.primaryLanguage, ...(profile.secondaryLanguages || [])];
        chosenLanguage =
          detectedLanguages.find(lang => supportedLanguages.includes(lang)) ||
          profile.primaryLanguage;
      } else {
        chosenLanguage = detectedLanguages[0] || 'en';
      }

      await db.collection('language_conflict_cases').add({
        userId,
        aiId,
        detectedLanguages,
        chosenLanguage,
        context: messageContext.substring(0, 200),
        timestamp: serverTimestamp()
      });

      return {
        chosenLanguage,
        reason: 'Based on user preference and AI capabilities'
      };
    } catch (error) {
      console.error('Language conflict resolution error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to resolve language conflict');
    }
  }
);

/**
 * Helper: Perform language detection (placeholder for actual ML service)
 */
async function performLanguageDetection(text: string): Promise<LanguageDetectionResult> {
  const lowerText = text.toLowerCase();
  
  const languageIndicators: Record<string, string[]> = {
    en: ['the', 'is', 'and', 'you', 'are', 'for', 'not', 'with'],
    pl: ['jest', 'się', 'nie', 'że', 'jak', 'ale', 'dla', 'czy'],
    es: ['el', 'la', 'de', 'que', 'es', 'por', 'para', 'con'],
    pt: ['o', 'a', 'de', 'que', 'não', 'para', 'com', 'em'],
    de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'für', 'mit'],
    fr: ['le', 'la', 'de', 'et', 'est', 'pour', 'que', 'dans'],
    it: ['il', 'la', 'di', 'che', 'è', 'per', 'non', 'con'],
    ja: ['です', 'ます', 'した', 'ある', 'いる', 'する', 'ない'],
    ko: ['입니다', '있습니다', '합니다', '있다', '하다', '없다'],
    zh: ['的', '是', '在', '了', '不', '我', '有', '这'],
    ar: ['في', 'من', 'على', 'إلى', 'هذا', 'أن', 'ما'],
    ru: ['не', 'на', 'что', 'и', 'с', 'в', 'это', 'как']
  };

  const scores: Record<string, number> = {};

  for (const [lang, indicators] of Object.entries(languageIndicators)) {
    scores[lang] = indicators.filter(word => lowerText.includes(word)).length;
  }

  const sortedScores = Object.entries(scores)
    .sort(([, a], [, b]) => b - a)
    .filter(([, score]) => score > 0);

  if (sortedScores.length === 0) {
    return {
      primaryLanguage: 'en',
      confidence: 0.5,
      alternativeLanguages: []
    };
  }

  const totalScore = sortedScores.reduce((sum, [, score]) => sum + score, 0);
  const primaryLanguage = sortedScores[0][0];
  const confidence = sortedScores[0][1] / totalScore;

  const alternativeLanguages = sortedScores
    .slice(1, 4)
    .map(([language, score]) => ({
      language,
      confidence: score / totalScore
    }));

  return {
    primaryLanguage,
    confidence,
    alternativeLanguages
  };
}

/**
 * Helper: Perform translation (placeholder for actual translation service)
 */
async function performTranslation(
  text: string,
  sourceLanguage: string,
  targetLanguage: string
): Promise<string> {
  if (sourceLanguage === targetLanguage) {
    return text;
  }

  return `[Translated from ${sourceLanguage} to ${targetLanguage}]: ${text}`;
}

/**
 * Helper: Check cultural safety
 */
async function checkCulturalSafety(
  text: string,
  sourceLanguage: string,
  targetLanguage: string
): Promise<CulturalSafetyCheck> {
  const lowerText = text.toLowerCase();
  const violations: CulturalSafetyCheck['violations'] = [];

  for (const [category, patterns] of Object.entries(FORBIDDEN_PATTERNS)) {
    for (const pattern of patterns) {
      if (lowerText.includes(pattern.toLowerCase())) {
        violations.push({
          category,
          pattern,
          severity: category === 'ownership' || category === 'infantilization' ? 'critical' : 'high'
        });
      }
    }
  }

  const flagsSnapshot = await db
    .collection('cultural_safety_flags')
    .where('languages', 'array-contains', sourceLanguage)
    .get();

  for (const flagDoc of flagsSnapshot.docs) {
    const flag = flagDoc.data();
    const pattern = flag.pattern?.toLowerCase() || '';
    if (pattern && lowerText.includes(pattern)) {
      violations.push({
        category: flag.category,
        pattern: flag.pattern,
        severity: flag.severity
      });
    }
  }

  const passed = violations.filter(v => v.severity === 'critical').length === 0;

  const suggestions: string[] = [];
  if (!passed) {
    suggestions.push('Remove stereotypical or fetishizing language');
    suggestions.push('Use respectful, culture-neutral expressions');
    suggestions.push('Focus on personality rather than ethnicity');
  }

  return {
    passed,
    violations,
    suggestions
  };
}

/**
 * Scheduled function to clean up old translation logs (30 days)
 */
export const cleanupTranslationLogs = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const oldLogsSnapshot = await db
      .collection('ai_translation_logs')
      .where('timestamp', '<', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
      .limit(500)
      .get();

    const batch = db.batch();
    oldLogsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    console.log(`Cleaned up ${oldLogsSnapshot.size} old translation logs`);
    return null;
  });