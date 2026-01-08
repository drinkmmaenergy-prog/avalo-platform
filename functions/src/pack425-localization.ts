/**
 * PACK 425 — Localization Auto-Sync Module
 * Manages i18n bundles and translation completeness
 */

import * as admin from 'firebase-admin';

export interface LocalizationBundle {
  languageCode: string;      // en, pl, es, de, pt-BR, etc.
  countryCode?: string;      // Optional country-specific variant
  
  // Translation data
  translations: { [key: string]: string };
  
  // Metadata
  completeness: number;      // 0-1, how complete vs base language
  lastUpdated: FirebaseFirestore.Timestamp;
  translatedBy?: string;     // human | machine | hybrid
  reviewedBy?: string;
  
  // Quality metrics
  machineTranslatedKeys: string[];
  missingKeys: string[];
  outdatedKeys: string[];
}

export interface TranslationKey {
  key: string;
  baseText: string;          // English base text
  context?: string;          // Context for translators
  category: string;          // onboarding, profile, chat, etc.
  
  translations: {
    [languageCode: string]: {
      text: string;
      translatedBy: 'human' | 'machine' | 'hybrid';
      translatedAt: FirebaseFirestore.Timestamp;
      reviewedBy?: string;
      reviewedAt?: FirebaseFirestore.Timestamp;
    };
  };
  
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

// Base language
export const BASE_LANGUAGE = 'en';

// Supported languages
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'zh', name: 'Chinese (Simplified)', nativeName: '简体中文' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', nativeName: '繁體中文' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi' },
];

/**
 * Get localization bundle for a language
 */
export async function getLocalizationBundle(
  languageCode: string
): Promise<LocalizationBundle | null> {
  const db = admin.firestore();
  const doc = await db.collection('localizationBundles').doc(languageCode).get();
  
  if (!doc.exists) {
    return null;
  }
  
  return doc.data() as LocalizationBundle;
}

/**
 * Get all base translation keys
 */
export async function getBaseTranslationKeys(): Promise<TranslationKey[]> {
  const db = admin.firestore();
  const snapshot = await db.collection('translationKeys').get();
  return snapshot.docs.map(doc => doc.data() as TranslationKey);
}

/**
 * Add new translation key
 */
export async function addTranslationKey(
  key: string,
  baseText: string,
  category: string,
  context?: string
): Promise<TranslationKey> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  
  const translationKey: TranslationKey = {
    key,
    baseText,
    context,
    category,
    translations: {
      [BASE_LANGUAGE]: {
        text: baseText,
        translatedBy: 'human',
        translatedAt: now,
      },
    },
    createdAt: now,
    updatedAt: now,
  };
  
  await db.collection('translationKeys').doc(key).set(translationKey);
  
  // Trigger translation updates for all languages
  await triggerTranslationSync(key);
  
  return translationKey;
}

/**
 * Update translation for a specific language
 */
export async function updateTranslation(
  key: string,
  languageCode: string,
  text: string,
  translatedBy: 'human' | 'machine' | 'hybrid' = 'human',
  reviewedBy?: string
): Promise<void> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  
  const translation = {
    text,
    translatedBy,
    translatedAt: now,
    ...(reviewedBy && {
      reviewedBy,
      reviewedAt: now,
    }),
  };
  
  await db.collection('translationKeys').doc(key).set({
    [`translations.${languageCode}`]: translation,
    updatedAt: now,
  }, { merge: true });
  
  // Update bundle completeness
  await updateBundleCompleteness(languageCode);
}

/**
 * Calculate bundle completeness
 */
async function updateBundleCompleteness(languageCode: string): Promise<void> {
  const db = admin.firestore();
  
  // Get all keys
  const allKeys = await getBaseTranslationKeys();
  const totalKeys = allKeys.length;
  
  if (totalKeys === 0) return;
  
  // Count translated keys
  let translatedKeys = 0;
  const machineTranslatedKeys: string[] = [];
  const missingKeys: string[] = [];
  
  for (const keyDoc of allKeys) {
    const translation = keyDoc.translations[languageCode];
    if (translation) {
      translatedKeys++;
      if (translation.translatedBy === 'machine') {
        machineTranslatedKeys.push(keyDoc.key);
      }
    } else {
      missingKeys.push(keyDoc.key);
    }
  }
  
  const completeness = translatedKeys / totalKeys;
  
  // Build translations object
  const translations: { [key: string]: string } = {};
  for (const keyDoc of allKeys) {
    const translation = keyDoc.translations[languageCode];
    if (translation) {
      translations[keyDoc.key] = translation.text;
    } else {
      // Fallback to English
      translations[keyDoc.key] = keyDoc.baseText;
    }
  }
  
  const bundle: LocalizationBundle = {
    languageCode,
    translations,
    completeness,
    lastUpdated: admin.firestore.Timestamp.now(),
    machineTranslatedKeys,
    missingKeys,
    outdatedKeys: [],
  };
  
  await db.collection('localizationBundles').doc(languageCode).set(bundle);
}

/**
 * Trigger translation sync for a key (auto-translate to all languages)
 */
async function triggerTranslationSync(key: string): Promise<void> {
  // In production, this would integrate with translation services
  // For now, mark as needing translation
  const db = admin.firestore();
  
  await db.collection('translationQueue').add({
    key,
    priority: 'NORMAL',
    status: 'PENDING',
    createdAt: admin.firestore.Timestamp.now(),
  });
}

/**
 * Generate machine translation preview (placeholder)
 */
export async function generateMachineTranslation(
  key: string,
  targetLanguage: string
): Promise<string> {
  const db = admin.firestore();
  const keyDoc = await db.collection('translationKeys').doc(key).get();
  
  if (!keyDoc.exists) {
    throw new Error(`Translation key not found: ${key}`);
  }
  
  const translationKey = keyDoc.data() as TranslationKey;
  const baseText = translationKey.baseText;
  
  // In production, integrate with Google Translate API, DeepL, etc.
  // For now, return placeholder
  return `[${targetLanguage}] ${baseText}`;
}

/**
 * Import translations from JSON
 */
export async function importTranslationsFromJSON(
  languageCode: string,
  translations: { [key: string]: string },
  translatedBy: 'human' | 'machine' | 'hybrid' = 'human'
): Promise<{ imported: number; failed: number }> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  
  let imported = 0;
  let failed = 0;
  
  for (const [key, text] of Object.entries(translations)) {
    try {
      await updateTranslation(key, languageCode, text, translatedBy);
      imported++;
    } catch (error) {
      console.error(`Failed to import translation for key ${key}:`, error);
      failed++;
    }
  }
  
  return { imported, failed };
}

/**
 * Export translations to JSON format
 */
export async function exportTranslationsToJSON(
  languageCode: string
): Promise<{ [key: string]: string }> {
  const bundle = await getLocalizationBundle(languageCode);
  
  if (!bundle) {
    return {};
  }
  
  return bundle.translations;
}

/**
 * Get translation completeness report for all languages
 */
export async function getCompletenessReport(): Promise<Array<{
  languageCode: string;
  languageName: string;
  completeness: number;
  missingKeys: number;
  machineTranslated: number;
  lastUpdated: Date | null;
}>> {
  const db = admin.firestore();
  const snapshot = await db.collection('localizationBundles').get();
  
  const report: Array<{
    languageCode: string;
    languageName: string;
    completeness: number;
    missingKeys: number;
    machineTranslated: number;
    lastUpdated: Date | null;
  }> = [];
  
  for (const doc of snapshot.docs) {
    const bundle = doc.data() as LocalizationBundle;
    const language = SUPPORTED_LANGUAGES.find(l => l.code === bundle.languageCode);
    
    report.push({
      languageCode: bundle.languageCode,
      languageName: language?.name ?? bundle.languageCode,
      completeness: Math.round(bundle.completeness * 100),
      missingKeys: bundle.missingKeys.length,
      machineTranslated: bundle.machineTranslatedKeys.length,
      lastUpdated: bundle.lastUpdated?.toDate() ?? null,
    });
  }
  
  // Sort by completeness descending
  report.sort((a, b) => b.completeness - a.completeness);
  
  return report;
}

/**
 * Get missing translations for a language
 */
export async function getMissingTranslations(
  languageCode: string
): Promise<Array<{ key: string; baseText: string; category: string }>> {
  const bundle = await getLocalizationBundle(languageCode);
  if (!bundle) return [];
  
  const db = admin.firestore();
  const missing: Array<{ key: string; baseText: string; category: string }> = [];
  
  for (const key of bundle.missingKeys) {
    const keyDoc = await db.collection('translationKeys').doc(key).get();
    if (keyDoc.exists) {
      const data = keyDoc.data() as TranslationKey;
      missing.push({
        key: data.key,
        baseText: data.baseText,
        category: data.category,
      });
    }
  }
  
  return missing;
}

/**
 * Validate translation completeness for a country launch
 */
export async function validateCountryLocalization(
  countryCode: string,
  requiredLanguages: string[]
): Promise<{
  ready: boolean;
  issues: string[];
  completeness: { [lang: string]: number };
}> {
  const issues: string[] = [];
  const completeness: { [lang: string]: number } = {};
  
  for (const lang of requiredLanguages) {
    const bundle = await getLocalizationBundle(lang);
    
    if (!bundle) {
      issues.push(`Missing localization bundle for ${lang}`);
      completeness[lang] = 0;
      continue;
    }
    
    completeness[lang] = bundle.completeness * 100;
    
    if (bundle.completeness < 0.95) {
      issues.push(`${lang} is only ${Math.round(bundle.completeness * 100)}% complete (${bundle.missingKeys.length} missing keys)`);
    }
    
    if (bundle.machineTranslatedKeys.length > 50) {
      issues.push(`${lang} has ${bundle.machineTranslatedKeys.length} machine-translated keys that should be reviewed`);
    }
  }
  
  const ready = issues.length === 0;
  
  return { ready, issues, completeness };
}

/**
 * Rebuild all localization bundles
 */
export async function rebuildAllBundles(): Promise<void> {
  for (const lang of SUPPORTED_LANGUAGES) {
    await updateBundleCompleteness(lang.code);
  }
}

/**
 * Get translation by key for specific language (with fallback)
 */
export async function getTranslation(
  key: string,
  languageCode: string,
  fallbackToEnglish: boolean = true
): Promise<string | null> {
  const db = admin.firestore();
  const doc = await db.collection('translationKeys').doc(key).get();
  
  if (!doc.exists) {
    return null;
  }
  
  const translationKey = doc.data() as TranslationKey;
  
  // Try requested language
  if (translationKey.translations[languageCode]) {
    return translationKey.translations[languageCode].text;
  }
  
  // Fallback to English
  if (fallbackToEnglish && languageCode !== BASE_LANGUAGE) {
    if (translationKey.translations[BASE_LANGUAGE]) {
      return translationKey.translations[BASE_LANGUAGE].text;
    }
  }
  
  return null;
}
