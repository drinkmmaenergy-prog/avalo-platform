/**
 * PACK 360 - Language Engine (i18n)
 * Multi-language support with auto-detection, fallback, and dynamic switching
 * 
 * Dependencies: PACK 277, PACK 301, PACK 302, PACK 359, PACK 280, PACK 300A
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Types
export interface LanguageProfile {
  code: string; // "en", "pl", "de", "es", "fr", etc.
  name: string;
  nativeName: string;
  rtl: boolean;
  supported: boolean;
  fallback: string;
  enabled: boolean;
  priority: number; // For sorting in UI
}

export interface TranslationPhrase {
  phraseId: string;
  category: string; // "ui", "notification", "education", "ai", "support", "legal"
  context: string;
  translations: Record<string, string>; // languageCode -> translated text
  locked: boolean; // If true, can't be auto-translated (e.g., legal text)
  lastUpdated: number;
  adminOverride?: Record<string, string>; // Manual overrides by admin
}

export interface UserLanguagePreference {
  userId: string;
  languageCode: string;
  autoDetected: boolean;
  detectionSource: 'device' | 'country' | 'manual' | 'browser';
  lastUpdated: number;
}

// Supported languages configuration
const SUPPORTED_LANGUAGES: LanguageProfile[] = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    rtl: false,
    supported: true,
    fallback: 'en',
    enabled: true,
    priority: 1
  },
  {
    code: 'pl',
    name: 'Polish',
    nativeName: 'Polski',
    rtl: false,
    supported: true,
    fallback: 'en',
    enabled: true,
    priority: 2
  },
  {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    rtl: false,
    supported: true,
    fallback: 'en',
    enabled: true,
    priority: 3
  },
  {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    rtl: false,
    supported: true,
    fallback: 'en',
    enabled: true,
    priority: 4
  },
  {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    rtl: false,
    supported: true,
    fallback: 'en',
    enabled: true,
    priority: 5
  },
  {
    code: 'it',
    name: 'Italian',
    nativeName: 'Italiano',
    rtl: false,
    supported: true,
    fallback: 'en',
    enabled: true,
    priority: 6
  },
  {
    code: 'pt',
    name: 'Portuguese',
    nativeName: 'Português',
    rtl: false,
    supported: true,
    fallback: 'en',
    enabled: true,
    priority: 7
  },
  {
    code: 'nl',
    name: 'Dutch',
    nativeName: 'Nederlands',
    rtl: false,
    supported: true,
    fallback: 'en',
    enabled: true,
    priority: 8
  },
  {
    code: 'sv',
    name: 'Swedish',
    nativeName: 'Svenska',
    rtl: false,
    supported: true,
    fallback: 'en',
    enabled: true,
    priority: 9
  },
  {
    code: 'ja',
    name: 'Japanese',
    nativeName: '日本語',
    rtl: false,
    supported: true,
    fallback: 'en',
    enabled: true,
    priority: 10
  },
  {
    code: 'ko',
    name: 'Korean',
    nativeName: '한국어',
    rtl: false,
    supported: true,
    fallback: 'en',
    enabled: true,
    priority: 11
  },
  {
    code: 'zh',
    name: 'Chinese',
    nativeName: '中文',
    rtl: false,
    supported: true,
    fallback: 'en',
    enabled: true,
    priority: 12
  },
  {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    rtl: true,
    supported: true,
    fallback: 'en',
    enabled: true,
    priority: 13
  },
  {
    code: 'he',
    name: 'Hebrew',
    nativeName: 'עברית',
    rtl: true,
    supported: true,
    fallback: 'en',
    enabled: true,
    priority: 14
  }
];

// Get supported languages
export const getSupportedLanguages = functions.https.onCall(async (data, context) => {
  try {
    const db = admin.firestore();
    
    // Get enabled languages from config (admin can disable languages)
    const configDoc = await db.collection('system').doc('localization-config').get();
    const config = configDoc.data();
    
    let languages = SUPPORTED_LANGUAGES;
    
    if (config?.disabledLanguages) {
      languages = languages.map(lang => ({
        ...lang,
        enabled: !config.disabledLanguages.includes(lang.code)
      }));
    }
    
    return {
      success: true,
      languages: languages.filter(l => l.enabled).sort((a, b) => a.priority - b.priority)
    };
  } catch (error: any) {
    console.error('Error getting supported languages:', error);
    return { success: false, error: error.message };
  }
});

// Auto-detect user language
export const detectUserLanguage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const { deviceLanguage, countryCode, browserLanguage } = data;
    const userId = context.auth.uid;
    const db = admin.firestore();
    
    // Priority order: manual > device > country > browser
    let detectedLanguage = 'en';
    let detectionSource: 'device' | 'country' | 'manual' | 'browser' = 'device';
    
    // Check if user already has a manual preference
    const userPrefDoc = await db.collection('user-language-preferences').doc(userId).get();
    if (userPrefDoc.exists && !userPrefDoc.data()?.autoDetected) {
      return {
        success: true,
        languageCode: userPrefDoc.data()?.languageCode,
        source: 'manual'
      };
    }
    
    // Try device language first
    if (deviceLanguage) {
      const langCode = deviceLanguage.split('-')[0].toLowerCase();
      const supported = SUPPORTED_LANGUAGES.find(l => l.code === langCode && l.enabled);
      if (supported) {
        detectedLanguage = langCode;
        detectionSource = 'device';
      }
    }
    
    // Fallback to country-based language
    if (detectedLanguage === 'en' && countryCode) {
      const countryToLanguage: Record<string, string> = {
        PL: 'pl', DE: 'de', ES: 'es', FR: 'fr', IT: 'it',
        PT: 'pt', NL: 'nl', SE: 'sv', JP: 'ja', KR: 'ko',
        CN: 'zh', SA: 'ar', IL: 'he'
      };
      const langCode = countryToLanguage[countryCode.toUpperCase()];
      if (langCode) {
        const supported = SUPPORTED_LANGUAGES.find(l => l.code === langCode && l.enabled);
        if (supported) {
          detectedLanguage = langCode;
          detectionSource = 'country';
        }
      }
    }
    
    // Fallback to browser language
    if (detectedLanguage === 'en' && browserLanguage) {
      const langCode = browserLanguage.split('-')[0].toLowerCase();
      const supported = SUPPORTED_LANGUAGES.find(l => l.code === langCode && l.enabled);
      if (supported) {
        detectedLanguage = langCode;
        detectionSource = 'browser';
      }
    }
    
    // Save preference
    const preference: UserLanguagePreference = {
      userId,
      languageCode: detectedLanguage,
      autoDetected: true,
      detectionSource,
      lastUpdated: Date.now()
    };
    
    await db.collection('user-language-preferences').doc(userId).set(preference);
    
    return {
      success: true,
      languageCode: detectedLanguage,
      source: detectionSource
    };
  } catch (error: any) {
    console.error('Error detecting user language:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Set user language (manual)
export const setUserLanguage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const { languageCode } = data;
    const userId = context.auth.uid;
    const db = admin.firestore();
    
    // Validate language is supported
    const language = SUPPORTED_LANGUAGES.find(l => l.code === languageCode && l.enabled);
    if (!language) {
      throw new functions.https.HttpsError('invalid-argument', 'Unsupported language');
    }
    
    // Save preference
    const preference: UserLanguagePreference = {
      userId,
      languageCode,
      autoDetected: false,
      detectionSource: 'manual',
      lastUpdated: Date.now()
    };
    
    await db.collection('user-language-preferences').doc(userId).set(preference);
    
    // Update user profile
    await db.collection('users').doc(userId).update({
      'language': languageCode,
      'languageUpdated': Date.now()
    });
    
    return { success: true, languageCode };
  } catch (error: any) {
    console.error('Error setting user language:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Get translation phrases (with caching)
export const getTranslationPhrases = functions.https.onCall(async (data, context) => {
  try {
    const { languageCode, category, phraseIds } = data;
    const db = admin.firestore();
    
    // Validate language
    const language = SUPPORTED_LANGUAGES.find(l => l.code === languageCode);
    if (!language) {
      throw new functions.https.HttpsError('invalid-argument', 'Unsupported language');
    }
    
    let query: any = db.collection('translation-phrases');
    
    if (category) {
      query = query.where('category', '==', category);
    }
    
    if (phraseIds && phraseIds.length > 0) {
      // Firestore 'in' query limit is 10
      if (phraseIds.length <= 10) {
        query = query.where('phraseId', 'in', phraseIds);
      }
    }
    
    const snapshot = await query.get();
    const phrases: Record<string, string> = {};
    
    snapshot.forEach((doc: any) => {
      const data = doc.data() as TranslationPhrase;
      const phraseId = data.phraseId;
      
      // Check for admin override first
      if (data.adminOverride && data.adminOverride[languageCode]) {
        phrases[phraseId] = data.adminOverride[languageCode];
      }
      // Then check regular translation
      else if (data.translations[languageCode]) {
        phrases[phraseId] = data.translations[languageCode];
      }
      // Fallback to English
      else if (data.translations['en']) {
        phrases[phraseId] = data.translations['en'];
      }
      // Last resort: use phraseId as display text
      else {
        phrases[phraseId] = phraseId;
      }
    });
    
    return { success: true, phrases, languageCode };
  } catch (error: any) {
    console.error('Error getting translation phrases:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Admin: Add or update translation phrase
export const adminUpdateTranslationPhrase = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    
    const { phraseId, category, context: phraseContext, translations, locked, adminOverride } = data;
    
    const phrase: TranslationPhrase = {
      phraseId,
      category,
      context: phraseContext || '',
      translations: translations || {},
      locked: locked || false,
      lastUpdated: Date.now(),
      adminOverride: adminOverride || {}
    };
    
    await db.collection('translation-phrases').doc(phraseId).set(phrase, { merge: true });
    
    return { success: true, phraseId };
  } catch (error: any) {
    console.error('Error updating translation phrase:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Admin: Toggle language enabled status
export const adminToggleLanguage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    
    const { languageCode, enabled } = data;
    
    // Can't disable English
    if (languageCode === 'en') {
      throw new functions.https.HttpsError('invalid-argument', 'Cannot disable English');
    }
    
    const configRef = db.collection('system').doc('localization-config');
    const configDoc = await configRef.get();
    
    let disabledLanguages: string[] = configDoc.data()?.disabledLanguages || [];
    
    if (enabled) {
      disabledLanguages = disabledLanguages.filter(l => l !== languageCode);
    } else {
      if (!disabledLanguages.includes(languageCode)) {
        disabledLanguages.push(languageCode);
      }
    }
    
    await configRef.set({ disabledLanguages }, { merge: true });
    
    return { success: true, languageCode, enabled };
  } catch (error: any) {
    console.error('Error toggling language:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Trigger: Update user language on country change
export const onUserCountryChange = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    
    // Check if country changed
    if (before.country === after.country) {
      return;
    }
    
    const userId = context.params.userId;
    const newCountry = after.country;
    const db = admin.firestore();
    
    // Check if user has manual language preference
    const userPrefDoc = await db.collection('user-language-preferences').doc(userId).get();
    if (userPrefDoc.exists && !userPrefDoc.data()?.autoDetected) {
      // User has manual preference, don't auto-change
      return;
    }
    
    // Auto-detect language for new country
    const countryToLanguage: Record<string, string> = {
      PL: 'pl', DE: 'de', ES: 'es', FR: 'fr', IT: 'it',
      PT: 'pt', NL: 'nl', SE: 'sv', JP: 'ja', KR: 'ko',
      CN: 'zh', SA: 'ar', IL: 'he'
    };
    
    const suggestedLang = countryToLanguage[newCountry?.toUpperCase()] || 'en';
    
    // Update language preference
    const preference: UserLanguagePreference = {
      userId,
      languageCode: suggestedLang,
      autoDetected: true,
      detectionSource: 'country',
      lastUpdated: Date.now()
    };
    
    await db.collection('user-language-preferences').doc(userId).set(preference);
    await db.collection('users').doc(userId).update({
      language: suggestedLang,
      languageUpdated: Date.now()
    });
  });

// Initialize translation cache (scheduled job)
export const cacheTranslations = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const db = admin.firestore();
    
    try {
      // Get all translation phrases
      const snapshot = await db.collection('translation-phrases').get();
      
      const cache: Record<string, Record<string, string>> = {};
      
      snapshot.forEach((doc: any) => {
        const data = doc.data() as TranslationPhrase;
        
        SUPPORTED_LANGUAGES.forEach(lang => {
          if (!cache[lang.code]) {
            cache[lang.code] = {};
          }
          
          // Get translation with priority: adminOverride > translation > fallback > phraseId
          let translation = data.translations[lang.code];
          if (data.adminOverride && data.adminOverride[lang.code]) {
            translation = data.adminOverride[lang.code];
          }
          if (!translation && data.translations[lang.fallback]) {
            translation = data.translations[lang.fallback];
          }
          if (!translation) {
            translation = data.phraseId;
          }
          
          cache[lang.code][data.phraseId] = translation;
        });
      });
      
      // Store cache
      await db.collection('system').doc('translation-cache').set({
        cache,
        lastUpdated: Date.now()
      });
      
      console.log('Translation cache updated successfully');
    } catch (error) {
      console.error('Error caching translations:', error);
    }
  });
