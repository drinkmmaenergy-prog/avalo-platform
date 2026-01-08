/**
 * PACK 198 — Real-Time Translation System
 * Multilingual support with integrity protection
 */

import * as admin from 'firebase-admin';
import { EventTranslation } from './types';
import { validateTranslationIntegrity } from './validation';

const db = admin.firestore();

export interface TranslationConfig {
  sourceLanguage: string;
  targetLanguages: string[];
  glossaryTerms?: Record<string, string>;
}

export interface TranslateTextInput {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  glossaryTerms?: Record<string, string>;
}

export interface TranslationResult {
  translatedText: string;
  accuracy: number;
  containsBlockedContent: boolean;
  blockedReasons: string[];
}

const SUPPORTED_LANGUAGES = [
  'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko',
  'ar', 'hi', 'tr', 'pl', 'nl', 'sv', 'no', 'da', 'fi', 'cs',
  'el', 'he', 'th', 'vi', 'id', 'ms', 'tl', 'sw', 'am', 'bn',
  'te', 'ta', 'mr', 'gu', 'kn', 'ml', 'pa', 'ur', 'fa', 'uk',
];

export function isSupportedLanguage(languageCode: string): boolean {
  return SUPPORTED_LANGUAGES.includes(languageCode);
}

export async function translateText(input: TranslateTextInput): Promise<TranslationResult> {
  if (!isSupportedLanguage(input.sourceLanguage)) {
    throw new Error(`Source language ${input.sourceLanguage} is not supported`);
  }

  if (!isSupportedLanguage(input.targetLanguage)) {
    throw new Error(`Target language ${input.targetLanguage} is not supported`);
  }

  if (input.sourceLanguage === input.targetLanguage) {
    return {
      translatedText: input.text,
      accuracy: 1.0,
      containsBlockedContent: false,
      blockedReasons: [],
    };
  }

  let translatedText = input.text;
  const glossaryTerms = input.glossaryTerms || {};

  for (const [sourceTerm, targetTerm] of Object.entries(glossaryTerms)) {
    const regex = new RegExp(`\\b${sourceTerm}\\b`, 'gi');
    translatedText = translatedText.replace(regex, targetTerm);
  }

  const validation = validateTranslationIntegrity(
    input.text,
    translatedText,
    input.targetLanguage
  );

  return {
    translatedText,
    accuracy: 0.85,
    containsBlockedContent: !validation.isValid,
    blockedReasons: validation.isValid ? [] : [validation.reason || 'Translation failed validation'],
  };
}

export async function createEventTranslation(
  eventId: string,
  sourceLanguage: string,
  targetLanguage: string,
  customTerms: Record<string, string>
): Promise<EventTranslation> {
  const translationRef = db.collection('event_translations').doc();

  const translation: EventTranslation = {
    id: translationRef.id,
    eventId,
    sourceLanguage,
    targetLanguage,
    subtitles: {},
    customTerms,
    accuracy: 0.85,
    reviewStatus: 'automated',
    containsBlockedContent: false,
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
  };

  await translationRef.set(translation);

  return translation;
}

export async function translateEventContent(
  eventId: string,
  content: {
    title?: string;
    description?: string;
    materials?: Array<{ id: string; text: string }>;
  },
  sourceLanguage: string,
  targetLanguages: string[]
): Promise<Record<string, any>> {
  const translations: Record<string, any> = {};

  const eventDoc = await db.collection('events').doc(eventId).get();
  if (!eventDoc.exists) {
    throw new Error('Event not found');
  }

  const glossaryDoc = await db
    .collection('event_materials')
    .where('eventId', '==', eventId)
    .where('type', '==', 'glossary')
    .limit(1)
    .get();

  let customTerms: Record<string, string> = {};
  if (!glossaryDoc.empty) {
    customTerms = glossaryDoc.docs[0].data().customTerms || {};
  }

  for (const targetLang of targetLanguages) {
    if (targetLang === sourceLanguage) continue;

    const langTranslations: any = {};

    if (content.title) {
      const titleTranslation = await translateText({
        text: content.title,
        sourceLanguage,
        targetLanguage: targetLang,
        glossaryTerms: customTerms,
      });

      if (!titleTranslation.containsBlockedContent) {
        langTranslations.title = titleTranslation.translatedText;
      }
    }

    if (content.description) {
      const descTranslation = await translateText({
        text: content.description,
        sourceLanguage,
        targetLanguage: targetLang,
        glossaryTerms: customTerms,
      });

      if (!descTranslation.containsBlockedContent) {
        langTranslations.description = descTranslation.translatedText;
      }
    }

    if (content.materials) {
      langTranslations.materials = {};
      for (const material of content.materials) {
        const materialTranslation = await translateText({
          text: material.text,
          sourceLanguage,
          targetLanguage: targetLang,
          glossaryTerms: customTerms,
        });

        if (!materialTranslation.containsBlockedContent) {
          langTranslations.materials[material.id] = materialTranslation.translatedText;
        }
      }
    }

    translations[targetLang] = langTranslations;
  }

  return translations;
}

export async function translateChatMessage(
  messageId: string,
  eventId: string,
  originalText: string,
  sourceLanguage: string,
  targetLanguages: string[]
): Promise<Record<string, string>> {
  const translations: Record<string, string> = {};

  const eventDoc = await db.collection('events').doc(eventId).get();
  if (!eventDoc.exists) {
    throw new Error('Event not found');
  }

  const glossaryDoc = await db
    .collection('event_materials')
    .where('eventId', '==', eventId)
    .where('type', '==', 'glossary')
    .limit(1)
    .get();

  let customTerms: Record<string, string> = {};
  if (!glossaryDoc.empty) {
    customTerms = glossaryDoc.docs[0].data().customTerms || {};
  }

  for (const targetLang of targetLanguages) {
    if (targetLang === sourceLanguage) {
      translations[targetLang] = originalText;
      continue;
    }

    try {
      const result = await translateText({
        text: originalText,
        sourceLanguage,
        targetLanguage: targetLang,
        glossaryTerms: customTerms,
      });

      if (!result.containsBlockedContent) {
        translations[targetLang] = result.translatedText;
      } else {
        translations[targetLang] = '[Translation blocked: prohibited content detected]';
      }
    } catch (error) {
      translations[targetLang] = '[Translation failed]';
    }
  }

  await db
    .collection('event_chat_logs')
    .doc(messageId)
    .update({
      translated: translations,
    });

  return translations;
}

export async function generateSubtitles(
  eventId: string,
  audioTimestamps: Array<{ timestamp: number; text: string }>,
  sourceLanguage: string,
  targetLanguage: string
): Promise<Record<string, string>> {
  const subtitles: Record<string, string> = {};

  const eventDoc = await db.collection('events').doc(eventId).get();
  if (!eventDoc.exists) {
    throw new Error('Event not found');
  }

  const glossaryDoc = await db
    .collection('event_materials')
    .where('eventId', '==', eventId)
    .where('type', '==', 'glossary')
    .limit(1)
    .get();

  let customTerms: Record<string, string> = {};
  if (!glossaryDoc.empty) {
    customTerms = glossaryDoc.docs[0].data().customTerms || {};
  }

  for (const segment of audioTimestamps) {
    const result = await translateText({
      text: segment.text,
      sourceLanguage,
      targetLanguage,
      glossaryTerms: customTerms,
    });

    if (!result.containsBlockedContent) {
      subtitles[segment.timestamp.toString()] = result.translatedText;
    }
  }

  const translationQuery = await db
    .collection('event_translations')
    .where('eventId', '==', eventId)
    .where('sourceLanguage', '==', sourceLanguage)
    .where('targetLanguage', '==', targetLanguage)
    .limit(1)
    .get();

  if (!translationQuery.empty) {
    await translationQuery.docs[0].ref.update({
      subtitles,
      updatedAt: admin.firestore.Timestamp.now(),
    });
  } else {
    await createEventTranslation(eventId, sourceLanguage, targetLanguage, customTerms);
  }

  return subtitles;
}

export function detectLanguage(text: string): string {
  const languagePatterns: Record<string, RegExp> = {
    en: /^[a-zA-Z\s.,!?'"()-]+$/,
    es: /[áéíóúñü]/i,
    fr: /[àâçéèêëîïôûùüÿœæ]/i,
    de: /[äöüß]/i,
    ru: /[а-яА-ЯёЁ]/,
    zh: /[\u4e00-\u9fff]/,
    ja: /[\u3040-\u309f\u30a0-\u30ff]/,
    ko: /[\uac00-\ud7af]/,
    ar: /[\u0600-\u06ff]/,
    he: /[\u0590-\u05ff]/,
    th: /[\u0e00-\u0e7f]/,
    hi: /[\u0900-\u097f]/,
  };

  for (const [lang, pattern] of Object.entries(languagePatterns)) {
    if (pattern.test(text)) {
      return lang;
    }
  }

  return 'en';
}

export async function validateGlossary(
  eventId: string,
  glossaryTerms: Record<string, string>
): Promise<{ isValid: boolean; invalidTerms: string[] }> {
  const invalidTerms: string[] = [];

  const blockedWords = [
    'seduce',
    'flirt',
    'hookup',
    'sexy',
    'erotic',
    'romantic advances',
    'pickup',
  ];

  for (const [sourceTerm, targetTerm] of Object.entries(glossaryTerms)) {
    const combined = `${sourceTerm} ${targetTerm}`.toLowerCase();

    for (const blocked of blockedWords) {
      if (combined.includes(blocked)) {
        invalidTerms.push(sourceTerm);
        break;
      }
    }
  }

  return {
    isValid: invalidTerms.length === 0,
    invalidTerms,
  };
}

export async function reviewTranslationQuality(
  translationId: string,
  reviewerId: string,
  approved: boolean,
  notes?: string
): Promise<void> {
  const translationRef = db.collection('event_translations').doc(translationId);
  const translationDoc = await translationRef.get();

  if (!translationDoc.exists) {
    throw new Error('Translation not found');
  }

  await translationRef.update({
    reviewStatus: approved ? 'human_reviewed' : 'automated',
    accuracy: approved ? 0.95 : 0.7,
    updatedAt: admin.firestore.Timestamp.now(),
  });
}