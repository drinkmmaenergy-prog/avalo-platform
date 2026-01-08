/**
 * PACK 187: Multilingual Utility Functions
 * Code-switching, localization, and language processing helpers
 */

import {
  LanguageCode,
  LanguageDetectionResult,
  CodeSwitchingTrigger,
  LocalizedFlirtStyle,
  LANGUAGE_METADATA
} from '../types/multilingual';
import { getFunctions, httpsCallable } from 'firebase/functions';

export class MultilingualEngine {
  private detectionCache: Map<string, LanguageDetectionResult> = new Map();
  private cacheExpiry: number = 300000; // 5 minutes

  async detectLanguage(text: string, userId: string): Promise<LanguageDetectionResult> {
    const cacheKey = `${text.substring(0, 50)}_${userId}`;
    const cached = this.detectionCache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const functions = getFunctions();
      const detectLanguage = httpsCallable<
        { text: string; userId: string },
        LanguageDetectionResult
      >(functions, 'detectUserLanguage');

      const result = await detectLanguage({ text, userId });
      this.detectionCache.set(cacheKey, result.data);

      setTimeout(() => {
        this.detectionCache.delete(cacheKey);
      }, this.cacheExpiry);

      return result.data;
    } catch (error) {
      console.error('Language detection error:', error);
      return {
        primaryLanguage: 'en',
        confidence: 0.5,
        alternativeLanguages: []
      };
    }
  }

  async shouldSwitchLanguage(
    currentLanguage: LanguageCode,
    detectedLanguages: LanguageCode[],
    aiSupportedLanguages: LanguageCode[],
    userPreference?: LanguageCode
  ): Promise<{ shouldSwitch: boolean; targetLanguage: LanguageCode; reason: string }> {
    if (userPreference && aiSupportedLanguages.includes(userPreference)) {
      return {
        shouldSwitch: currentLanguage !== userPreference,
        targetLanguage: userPreference,
        reason: 'User explicit preference'
      };
    }

    const supportedDetected = detectedLanguages.find(lang => 
      aiSupportedLanguages.includes(lang)
    );

    if (supportedDetected && supportedDetected !== currentLanguage) {
      return {
        shouldSwitch: true,
        targetLanguage: supportedDetected,
        reason: 'User language change detected'
      };
    }

    return {
      shouldSwitch: false,
      targetLanguage: currentLanguage,
      reason: 'No switch needed'
    };
  }

  async handleCodeSwitch(
    userId: string,
    aiId: string,
    trigger: CodeSwitchingTrigger['type'],
    detectedLanguages: LanguageCode[],
    aiPrimaryLanguage: LanguageCode,
    aiSupportedLanguages: LanguageCode[]
  ): Promise<LanguageCode> {
    try {
      const functions = getFunctions();
      const resolveConflict = httpsCallable(functions, 'resolveLanguageConflictCase');

      const result = await resolveConflict({
        userId,
        aiId,
        detectedLanguages,
        messageContext: trigger
      });

      return (result.data as any).chosenLanguage;
    } catch (error) {
      console.error('Code switch error:', error);
      return detectedLanguages.find(lang => 
        aiSupportedLanguages.includes(lang)
      ) || aiPrimaryLanguage;
    }
  }

  getDominantLanguage(text: string): LanguageCode {
    const words = text.toLowerCase().split(/\s+/);
    
    const languagePatterns: Record<LanguageCode, RegExp[]> = {
      en: [/\b(the|is|and|you|are)\b/g],
      pl: [/\b(jest|się|nie|że)\b/g],
      es: [/\b(el|la|de|que)\b/g],
      pt: [/\b(o|a|de|que)\b/g],
      de: [/\b(der|die|das|und)\b/g],
      fr: [/\b(le|la|de|et)\b/g],
      it: [/\b(il|la|di|che)\b/g],
      ro: [/\b(și|cu|ca|la)\b/g],
      tr: [/\b(ve|bir|bu|için)\b/g],
      ar: [/[\u0600-\u06FF]/g],
      hi: [/[\u0900-\u097F]/g],
      ja: [/[\u3040-\u309F\u30A0-\u30FF]/g],
      ko: [/[\uAC00-\uD7AF]/g],
      zh: [/[\u4E00-\u9FFF]/g],
      ru: [/[\u0400-\u04FF]/g]
    } as any;

    const scores: Partial<Record<LanguageCode, number>> = {};

    for (const [lang, patterns] of Object.entries(languagePatterns)) {
      let score = 0;
      for (const pattern of patterns) {
        const matches = text.match(pattern);
        score += matches ? matches.length : 0;
      }
      if (score > 0) {
        scores[lang as LanguageCode] = score;
      }
    }

    const sortedLanguages = Object.entries(scores)
      .sort(([, a], [, b]) => (b || 0) - (a || 0));

    return sortedLanguages.length > 0 
      ? sortedLanguages[0][0] as LanguageCode
      : 'en';
  }

  isRTLLanguage(language: LanguageCode): boolean {
    return LANGUAGE_METADATA[language]?.rtl === true;
  }

  hasVoiceSupport(language: LanguageCode): boolean {
    return LANGUAGE_METADATA[language]?.voiceSupported === true;
  }
}

export class LocalizationEngine {
  private flirtStyles: Partial<Record<LanguageCode, Partial<LocalizedFlirtStyle>>> = {
    en: {
      culturalNorms: {
        directness: 'moderate',
        humor: 'high',
        poetry: 'low',
        formality: 'casual'
      },
      allowedExpressions: ['you look great', 'I enjoy talking with you', 'you make me smile'],
      prohibitedExpressions: ['you owe me', 'prove your love', 'you belong to me']
    },
    pl: {
      culturalNorms: {
        directness: 'moderate',
        humor: 'moderate',
        poetry: 'moderate',
        formality: 'neutral'
      },
      allowedExpressions: ['świetnie wyglądasz', 'miło się z tobą rozmawia'],
      prohibitedExpressions: ['jesteś moją własnością', 'musisz mi udowodnić']
    },
    es: {
      culturalNorms: {
        directness: 'direct',
        humor: 'high',
        poetry: 'high',
        formality: 'casual'
      },
      allowedExpressions: ['te ves hermosa', 'me encanta hablar contigo'],
      prohibitedExpressions: ['eres mía', 'me debes', 'tienes que demostrar']
    },
    ja: {
      culturalNorms: {
        directness: 'subtle',
        humor: 'moderate',
        poetry: 'high',
        formality: 'formal'
      },
      allowedExpressions: ['素敵ですね', 'お話しできて嬉しいです'],
      prohibitedExpressions: ['僕のもの', '証明して', '従って']
    },
    fr: {
      culturalNorms: {
        directness: 'moderate',
        humor: 'moderate',
        poetry: 'high',
        formality: 'neutral'
      },
      allowedExpressions: ['tu es charmant', 'j\'aime parler avec toi'],
      prohibitedExpressions: ['tu es à moi', 'tu me dois', 'prouve-le']
    },
    de: {
      culturalNorms: {
        directness: 'direct',
        humor: 'moderate',
        poetry: 'moderate',
        formality: 'neutral'
      },
      allowedExpressions: ['du siehst gut aus', 'ich genieße unser Gespräch'],
      prohibitedExpressions: ['du gehörst mir', 'beweise es', 'du schuldest mir']
    },
    ar: {
      culturalNorms: {
        directness: 'subtle',
        humor: 'low',
        poetry: 'high',
        formality: 'formal'
      },
      allowedExpressions: ['أنت رائع', 'أستمتع بالحديث معك'],
      prohibitedExpressions: ['أنت ملكي', 'عليك أن تثبت', 'أنت مدين لي']
    }
  };

  getFlirtStyle(language: LanguageCode): Partial<LocalizedFlirtStyle> {
    return this.flirtStyles[language] || this.flirtStyles.en;
  }

  localizeCompliment(compliment: string, targetLanguage: LanguageCode): string {
    const basicTranslations: Record<string, Record<LanguageCode, string>> = {
      'you look great': {
        en: 'you look great',
        pl: 'świetnie wyglądasz',
        es: 'te ves genial',
        pt: 'você está ótimo',
        de: 'du siehst toll aus',
        fr: 'tu es magnifique',
        it: 'stai benissimo',
        ja: '素敵ですね',
        ko: '멋지네요',
        zh: '你看起来很棒',
        ar: 'تبدو رائعاً'
      } as any,
      'I enjoy talking with you': {
        en: 'I enjoy talking with you',
        pl: 'miło się z tobą rozmawia',
        es: 'disfruto hablar contigo',
        pt: 'gosto de conversar com você',
        de: 'ich genieße es, mit dir zu reden',
        fr: 'j\'aime parler avec toi',
        it: 'mi piace parlare con te',
        ja: 'お話しできて嬉しいです',
        ko: '당신과 이야기하는 것이 즐겁습니다',
        zh: '我喜欢和你聊天',
        ar: 'أستمتع بالحديث معك'
      } as any
    };

    const lowerCompliment = compliment.toLowerCase();
    for (const [key, translations] of Object.entries(basicTranslations)) {
      if (lowerCompliment.includes(key.toLowerCase())) {
        return translations[targetLanguage] || compliment;
      }
    }

    return compliment;
  }

  getCulturalGreeting(language: LanguageCode, timeOfDay: 'morning' | 'afternoon' | 'evening'): string {
    const greetings: Record<LanguageCode, Record<string, string>> = {
      en: { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' },
      pl: { morning: 'Dzień dobry', afternoon: 'Dzień dobry', evening: 'Dobry wieczór' },
      es: { morning: 'Buenos días', afternoon: 'Buenas tardes', evening: 'Buenas noches' },
      pt: { morning: 'Bom dia', afternoon: 'Boa tarde', evening: 'Boa noite' },
      de: { morning: 'Guten Morgen', afternoon: 'Guten Tag', evening: 'Guten Abend' },
      fr: { morning: 'Bonjour', afternoon: 'Bonjour', evening: 'Bonsoir' },
      it: { morning: 'Buongiorno', afternoon: 'Buon pomeriggio', evening: 'Buonasera' },
      ja: { morning: 'おはようございます', afternoon: 'こんにちは', evening: 'こんばんは' },
      ko: { morning: '좋은 아침입니다', afternoon: '안녕하세요', evening: '좋은 저녁입니다' },
      zh: { morning: '早上好', afternoon: '下午好', evening: '晚上好' },
      ar: { morning: 'صباح الخير', afternoon: 'مساء الخير', evening: 'مساء الخير' }
    } as any;

    return greetings[language]?.[timeOfDay] || greetings.en[timeOfDay];
  }

  shouldUsePoetry(language: LanguageCode): boolean {
    const style = this.getFlirtStyle(language);
    return style.culturalNorms?.poetry === 'high';
  }

  getAppropriateFormality(language: LanguageCode): 'casual' | 'neutral' | 'formal' {
    const style = this.getFlirtStyle(language);
    return style.culturalNorms?.formality || 'neutral';
  }
}

export class CodeSwitchDetector {
  detectMixedLanguages(text: string): LanguageCode[] {
    const engine = new MultilingualEngine();
    const words = text.split(/\s+/);
    const detectedLanguages = new Set<LanguageCode>();

    const chunkSize = 5;
    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, i + chunkSize).join(' ');
      const language = engine.getDominantLanguage(chunk);
      detectedLanguages.add(language);
    }

    return Array.from(detectedLanguages);
  }

  shouldTriggerEmotionalDefault(
    text: string,
    emotionalState: 'overwhelmed' | 'stressed' | 'normal'
  ): boolean {
    return emotionalState === 'overwhelmed' || emotionalState === 'stressed';
  }

  getCodeSwitchTriggerType(
    context: {
      userLanguageChanged: boolean;
      explicitRequest: boolean;
      mixedLanguages: boolean;
      emotionalState: string;
    }
  ): CodeSwitchingTrigger['type'] {
    if (context.explicitRequest) return 'user_explicit_request';
    if (context.emotionalState === 'overwhelmed') return 'emotional_overwhelm';
    if (context.userLanguageChanged) return 'user_language_change';
    if (context.mixedLanguages) return 'mixed_language_detected';
    return 'context_based';
  }
}

export const multilingualEngine = new MultilingualEngine();
export const localizationEngine = new LocalizationEngine();
export const codeSwitchDetector = new CodeSwitchDetector();

export function getLanguageDisplayName(code: LanguageCode, inLanguage: LanguageCode = 'en'): string {
  const lang = LANGUAGE_METADATA[code];
  return inLanguage === code ? lang.nativeName : lang.name;
}

export function formatLanguageList(languages: LanguageCode[], inLanguage: LanguageCode = 'en'): string {
  if (languages.length === 0) return '';
  if (languages.length === 1) return getLanguageDisplayName(languages[0], inLanguage);
  
  const displayNames = languages.map(lang => getLanguageDisplayName(lang, inLanguage));
  const last = displayNames.pop();
  return `${displayNames.join(', ')} and ${last}`;
}

export function getSupportedLanguagesForRegion(region: string): LanguageCode[] {
  const regionLanguages: Record<string, LanguageCode[]> = {
    europe: ['en', 'pl', 'de', 'fr', 'es', 'it', 'pt', 'ro', 'nl', 'sv', 'no', 'fi'],
    asia: ['en', 'ja', 'ko', 'zh', 'hi', 'th', 'vi', 'id'],
    'middle-east': ['en', 'ar', 'tr', 'he'],
    americas: ['en', 'es', 'pt', 'fr']
  };

  return regionLanguages[region.toLowerCase()] || ['en'];
}