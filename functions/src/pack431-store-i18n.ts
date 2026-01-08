/**
 * PACK 431: Multi-Language Store Expansion
 * 
 * Supports 19 languages with automatic fallback and legal compliance
 */

import * as admin from "firebase-admin";
import { logger } from "firebase-functions";

// ============================================================================
// SUPPORTED LANGUAGES
// ============================================================================

export const SUPPORTED_LANGUAGES = [
  "EN", // English
  "PL", // Polish
  "DE", // German
  "ES", // Spanish
  "IT", // Italian
  "FR", // French
  "PT", // Portuguese
  "RO", // Romanian
  "BG", // Bulgarian
  "CZ", // Czech
  "SK", // Slovak
  "HR", // Croatian
  "SL", // Slovenian
  "LT", // Lithuanian
  "LV", // Latvian
  "ET", // Estonian
  "UA", // Ukrainian
  "SR", // Serbian
  "EL"  // Greek
] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

// ============================================================================
// TRANSLATION KEYS
// ============================================================================

export interface TranslationKeys {
  // App Store Metadata
  appName: string;
  shortDescription: string;
  longDescription: string;
  keywords: string;
  
  // Features
  feature_smartMatching: string;
  feature_events: string;
  feature_aiCompanions: string;
  feature_premiumChat: string;
  feature_calendar: string;
  feature_verified: string;
  
  // Legal (synced with PACK 430)
  legal_terms: string;
  legal_privacy: string;
  legal_ageGate: string;
  legal_consent: string;
  legal_dataProtection: string;
  
  // Premium Features
  premium_unlimited: string;
  premium_whoLikedYou: string;
  premium_advancedFilters: string;
  premium_boost: string;
  premium_support: string;
  
  // Safety
  safety_verified: string;
  safety_reporting: string;
  safety_blocking: string;
  safety_moderation: string;
}

// ============================================================================
// TRANSLATION DATABASE
// ============================================================================

export const TRANSLATIONS: Record<SupportedLanguage, TranslationKeys> = {
  EN: {
    appName: "Avalo - Dating, Events & AI",
    shortDescription: "Meet people, create events, chat with AI companions. Modern dating reimagined.",
    longDescription: "Avalo is the next generation of dating apps, combining real connections with AI-powered features.\n\n🌟 FEATURES:\n• Smart Matching - Find compatible people nearby\n• Events & Meetups - Create and join real-world events\n• AI Companions - Chat with intelligent AI personalities\n• Premium Chat - Connect with premium members\n• Calendar Integration - Never miss a date\n• Verified Profiles - Trust through verification",
    keywords: "dating, chat, events, ai companion, meet people, singles, relationships",
    
    feature_smartMatching: "Smart Matching",
    feature_events: "Events & Meetups",
    feature_aiCompanions: "AI Companions",
    feature_premiumChat: "Premium Chat",
    feature_calendar: "Calendar Integration",
    feature_verified: "Verified Profiles",
    
    legal_terms: "Terms of Service",
    legal_privacy: "Privacy Policy",
    legal_ageGate: "You must be 18+ to use this app",
    legal_consent: "By continuing, you agree to our Terms and Privacy Policy",
    legal_dataProtection: "Your data is protected and encrypted",
    
    premium_unlimited: "Unlimited matches and chats",
    premium_whoLikedYou: "See who liked you",
    premium_advancedFilters: "Advanced filters",
    premium_boost: "Boost your profile",
    premium_support: "Priority support",
    
    safety_verified: "Verified and trusted",
    safety_reporting: "Report inappropriate behavior",
    safety_blocking: "Block unwanted users",
    safety_moderation: "24/7 moderation"
  },
  
  PL: {
    appName: "Avalo - Randki, Wydarzenia i AI",
    shortDescription: "Poznawaj ludzi, twórz wydarzenia, rozmawiaj z AI. Nowoczesne randki.",
    longDescription: "Avalo to nowa generacja aplikacji randkowych, łącząca prawdziwe relacje z funkcjami AI.\n\n🌟 FUNKCJE:\n• Inteligentne Dopasowanie - Znajdź kompatybilne osoby w pobliżu\n• Wydarzenia i Spotkania - Twórz i dołączaj do wydarzeń\n• Towarzyszki AI - Rozmawiaj z inteligentnymi AI\n• Premium Chat - Połącz się z premium członkami\n• Integracja z Kalendarzem - Nie przegap żadnej randki\n• Zweryfikowane Profile - Zaufanie przez weryfikację",
    keywords: "randki, czat, wydarzenia, ai, poznaj ludzi, single, związki",
    
    feature_smartMatching: "Inteligentne Dopasowanie",
    feature_events: "Wydarzenia i Spotkania",
    feature_aiCompanions: "Towarzyszki AI",
    feature_premiumChat: "Premium Chat",
    feature_calendar: "Integracja z Kalendarzem",
    feature_verified: "Zweryfikowane Profile",
    
    legal_terms: "Regulamin",
    legal_privacy: "Polityka Prywatności",
    legal_ageGate: "Musisz mieć ukończone 18 lat",
    legal_consent: "Kontynuując, akceptujesz nasz Regulamin i Politykę Prywatności",
    legal_dataProtection: "Twoje dane są chronione i zaszyfrowane",
    
    premium_unlimited: "Nieograniczone dopasowania i czaty",
    premium_whoLikedYou: "Zobacz, kto cię polubił",
    premium_advancedFilters: "Zaawansowane filtry",
    premium_boost: "Zwiększ widoczność",
    premium_support: "Priorytetowe wsparcie",
    
    safety_verified: "Zweryfikowane i zaufane",
    safety_reporting: "Zgłoś niewłaściwe zachowanie",
    safety_blocking: "Blokuj niechcianych użytkowników",
    safety_moderation: "Moderacja 24/7"
  },
  
  DE: {
    appName: "Avalo - Dating, Events & KI",
    shortDescription: "Leute treffen, Events erstellen, mit KI chatten. Modernes Dating.",
    longDescription: "Avalo ist die nächste Generation von Dating-Apps mit echten Verbindungen und KI-Features.\n\n🌟 FUNKTIONEN:\n• Smart Matching - Finde kompatible Personen\n• Events & Treffen - Erstelle und besuche Events\n• KI-Begleiter - Chatte mit intelligenten KI-Persönlichkeiten\n• Premium Chat - Verbinde dich mit Premium-Mitgliedern\n• Kalender-Integration - Verpasse kein Date",
    keywords: "dating, chat, events, ki, leute treffen, singles, beziehung",
    
    feature_smartMatching: "Smart Matching",
    feature_events: "Events & Treffen",
    feature_aiCompanions: "KI-Begleiter",
    feature_premiumChat: "Premium Chat",
    feature_calendar: "Kalender-Integration",
    feature_verified: "Verifizierte Profile",
    
    legal_terms: "Nutzungsbedingungen",
    legal_privacy: "Datenschutz",
    legal_ageGate: "Du musst 18+ sein",
    legal_consent: "Mit der Fortsetzung akzeptierst du unsere Bedingungen und Datenschutz",
    legal_dataProtection: "Deine Daten sind geschützt und verschlüsselt",
    
    premium_unlimited: "Unbegrenzte Matches und Chats",
    premium_whoLikedYou: "Sieh, wer dich geliked hat",
    premium_advancedFilters: "Erweiterte Filter",
    premium_boost: "Profil boosten",
    premium_support: "Prioritäts-Support",
    
    safety_verified: "Verifiziert und vertrauenswürdig",
    safety_reporting: "Unangemessenes Verhalten melden",
    safety_blocking: "Unerwünschte Nutzer blockieren",
    safety_moderation: "24/7 Moderation"
  },
  
  ES: {
    appName: "Avalo - Citas, Eventos e IA",
    shortDescription: "Conoce gente, crea eventos, chatea con IA. Citas modernas reinventadas.",
    longDescription: "Avalo es la nueva generación de apps de citas, combinando conexiones reales con IA.\n\n🌟 CARACTERÍSTICAS:\n• Emparejamiento Inteligente - Encuentra personas compatibles\n• Eventos y Quedadas - Crea y únete a eventos reales\n• Compañeros IA - Chatea con personalidades IA inteligentes\n• Chat Premium - Conéctate con miembros premium",
    keywords: "citas, chat, eventos, ia, conocer gente, solteros, relaciones",
    
    feature_smartMatching: "Emparejamiento Inteligente",
    feature_events: "Eventos y Quedadas",
    feature_aiCompanions: "Compañeros IA",
    feature_premiumChat: "Chat Premium",
    feature_calendar: "Integración de Calendario",
    feature_verified: "Perfiles Verificados",
    
    legal_terms: "Términos de Servicio",
    legal_privacy: "Política de Privacidad",
    legal_ageGate: "Debes tener 18+ años",
    legal_consent: "Al continuar, aceptas nuestros Términos y Política de Privacidad",
    legal_dataProtection: "Tus datos están protegidos y encriptados",
    
    premium_unlimited: "Matches y chats ilimitados",
    premium_whoLikedYou: "Ve quién te gustó",
    premium_advancedFilters: "Filtros avanzados",
    premium_boost: "Impulsa tu perfil",
    premium_support: "Soporte prioritario",
    
    safety_verified: "Verificado y confiable",
    safety_reporting: "Reportar comportamiento inapropiado",
    safety_blocking: "Bloquear usuarios no deseados",
    safety_moderation: "Moderación 24/7"
  },
  
  IT: {
    appName: "Avalo - Incontri, Eventi e IA",
    shortDescription: "Incontra persone, crea eventi, chatta con IA. Incontri moderni.",
    longDescription: "Avalo è la nuova generazione di app di incontri con connessioni reali e funzionalità IA.\n\n🌟 CARATTERISTICHE:\n• Matching Intelligente - Trova persone compatibili\n• Eventi e Incontri - Crea e partecipa a eventi reali\n• Compagni IA - Chatta con personalità IA intelligenti",
    keywords: "incontri, chat, eventi, ia, conoscere persone, single, relazioni",
    
    feature_smartMatching: "Matching Intelligente",
    feature_events: "Eventi e Incontri",
    feature_aiCompanions: "Compagni IA",
    feature_premiumChat: "Chat Premium",
    feature_calendar: "Integrazione Calendario",
    feature_verified: "Profili Verificati",
    
    legal_terms: "Termini di Servizio",
    legal_privacy: "Informativa sulla Privacy",
    legal_ageGate: "Devi avere 18+ anni",
    legal_consent: "Continuando, accetti i nostri Termini e l'Informativa sulla Privacy",
    legal_dataProtection: "I tuoi dati sono protetti e crittografati",
    
    premium_unlimited: "Match e chat illimitati",
    premium_whoLikedYou: "Vedi chi ti ha messo mi piace",
    premium_advancedFilters: "Filtri avanzati",
    premium_boost: "Aumenta il tuo profilo",
    premium_support: "Supporto prioritario",
    
    safety_verified: "Verificato e affidabile",
    safety_reporting: "Segnala comportamento inappropriato",
    safety_blocking: "Blocca utenti indesiderati",
    safety_moderation: "Moderazione 24/7"
  },
  
  FR: {
    appName: "Avalo - Rencontres, Évents & IA",
    shortDescription: "Rencontrez des gens, créez des événements, chattez avec l'IA. Rencontres modernes.",
    longDescription: "Avalo est la nouvelle génération d'applications de rencontres avec des connexions réelles et l'IA.\n\n🌟 CARACTÉRISTIQUES:\n• Matching Intelligent - Trouvez des personnes compatibles\n• Événements et Rencontres - Créez et rejoignez des événements\n• Compagnons IA - Chattez avec des personnalités IA intelligentes",
    keywords: "rencontres, chat, événements, ia, rencontrer personnes, célibataires, relations",
    
    feature_smartMatching: "Matching Intelligent",
    feature_events: "Événements et Rencontres",
    feature_aiCompanions: "Compagnons IA",
    feature_premiumChat: "Chat Premium",
    feature_calendar: "Intégration Calendrier",
    feature_verified: "Profils Vérifiés",
    
    legal_terms: "Conditions d'Utilisation",
    legal_privacy: "Politique de Confidentialité",
    legal_ageGate: "Vous devez avoir 18+ ans",
    legal_consent: "En continuant, vous acceptez nos Conditions et notre Politique de Confidentialité",
    legal_dataProtection: "Vos données sont protégées et cryptées",
    
    premium_unlimited: "Matchs et chats illimités",
    premium_whoLikedYou: "Voyez qui vous a aimé",
    premium_advancedFilters: "Filtres avancés",
    premium_boost: "Boostez votre profil",
    premium_support: "Support prioritaire",
    
    safety_verified: "Vérifié et fiable",
    safety_reporting: "Signaler un comportement inapproprié",
    safety_blocking: "Bloquer les utilisateurs indésirables",
    safety_moderation: "Modération 24/7"
  },
  
  // Fallback to English for remaining languages
  PT: {
    appName: "Avalo - Encontros, Eventos e IA",
    shortDescription: "Conheça pessoas, crie eventos, converse com IA. Encontros modernos.",
    longDescription: "Avalo é a nova geração de aplicativos de encontros com conexões reais e recursos de IA.",
    keywords: "encontros, chat, eventos, ia, conhecer pessoas, solteiros, relacionamentos",
    
    feature_smartMatching: "Correspondência Inteligente",
    feature_events: "Eventos e Encontros",
    feature_aiCompanions: "Companheiros IA",
    feature_premiumChat: "Chat Premium",
    feature_calendar: "Integração de Calendário",
    feature_verified: "Perfis Verificados",
    
    legal_terms: "Termos de Serviço",
    legal_privacy: "Política de Privacidade",
    legal_ageGate: "Você deve ter 18+ anos",
    legal_consent: "Ao continuar, você concorda com nossos Termos e Política de Privacidade",
    legal_dataProtection: "Seus dados estão protegidos e criptografados",
    
    premium_unlimited: "Matches e chats ilimitados",
    premium_whoLikedYou: "Veja quem te curtiu",
    premium_advancedFilters: "Filtros avançados",
    premium_boost: "Impulsione seu perfil",
    premium_support: "Suporte prioritário",
    
    safety_verified: "Verificado e confiável",
    safety_reporting: "Relatar comportamento inapropriado",
    safety_blocking: "Bloquear usuários indesejados",
    safety_moderation: "Moderação 24/7"
  },
  
  RO: {
    appName: "Avalo - Întâlniri, Evenimente și IA",
    shortDescription: "Cunoaște oameni, creează evenimente, conversează cu IA. Întâlniri moderne.",
    longDescription: "Avalo este noua generație de aplicații de întâlniri cu conexiuni reale și funcții IA.",
    keywords: "întâlniri, chat, evenimente, ia, cunoaște oameni, singuri, relații",
    
    feature_smartMatching: "Potrivire Inteligentă",
    feature_events: "Evenimente și Întâlniri",
    feature_aiCompanions: "Companii IA",
    feature_premiumChat: "Chat Premium",
    feature_calendar: "Integrare Calendar",
    feature_verified: "Profile Verificate",
    
    legal_terms: "Termeni și Condiții",
    legal_privacy: "Politica de Confidențialitate",
    legal_ageGate: "Trebuie să ai 18+ ani",
    legal_consent: "Continuând, accepți Termenii și Politica de Confidențialitate",
    legal_dataProtection: "Datele tale sunt protejate și criptate",
    
    premium_unlimited: "Potriviri și chat-uri nelimitate",
    premium_whoLikedYou: "Vezi cine te-a plăcut",
    premium_advancedFilters: "Filtre avansate",
    premium_boost: "Promovează profilul",
    premium_support: "Suport prioritar",
    
    safety_verified: "Verificat și de încredere",
    safety_reporting: "Raportează comportament inadecvat",
    safety_blocking: "Blochează utilizatori nedoriți",
    safety_moderation: "Moderare 24/7"
  },
  
  // Fallback languages will use English template
  BG: {} as TranslationKeys,
  CZ: {} as TranslationKeys,
  SK: {} as TranslationKeys,
  HR: {} as TranslationKeys,
  SL: {} as TranslationKeys,
  LT: {} as TranslationKeys,
  LV: {} as TranslationKeys,
  ET: {} as TranslationKeys,
  UA: {} as TranslationKeys,
  SR: {} as TranslationKeys,
  EL: {} as TranslationKeys
};

// Initialize fallback languages with English
const fallbackLanguages: SupportedLanguage[] = ["BG", "CZ", "SK", "HR", "SL", "LT", "LV", "ET", "UA", "SR", "EL"];
fallbackLanguages.forEach(lang => {
  TRANSLATIONS[lang] = { ...TRANSLATIONS.EN };
});

// ============================================================================
// LANGUAGE DETECTION & FALLBACK
// ============================================================================

export class StoreI18nEngine {
  private db: FirebaseFirestore.Firestore;

  constructor(db: FirebaseFirestore.Firestore) {
    this.db = db;
  }

  /**
   * Get translation for a specific language with fallback
   */
  getTranslation(language: string): TranslationKeys {
    const lang = language.toUpperCase() as SupportedLanguage;
    
    if (SUPPORTED_LANGUAGES.includes(lang)) {
      return TRANSLATIONS[lang];
    }
    
    // Fallback to English
    logger.warn(`Language ${language} not supported, falling back to EN`);
    return TRANSLATIONS.EN;
  }

  /**
   * Get translation key with fallback
   */
  getTranslationKey(language: string, key: keyof TranslationKeys): string {
    const translation = this.getTranslation(language);
    return translation[key] || TRANSLATIONS.EN[key];
  }

  /**
   * Detect language from country code
   */
  detectLanguageFromCountry(country: string): SupportedLanguage {
    const countryToLanguage: Record<string, SupportedLanguage> = {
      US: "EN",
      GB: "EN",
      CA: "EN",
      AU: "EN",
      NZ: "EN",
      PL: "PL",
      DE: "DE",
      AT: "DE",
      CH: "DE",
      ES: "ES",
      MX: "ES",
      AR: "ES",
      IT: "IT",
      FR: "FR",
      BE: "FR",
      PT: "PT",
      BR: "PT",
      RO: "RO",
      BG: "BG",
      CZ: "CZ",
      SK: "SK",
      HR: "HR",
      SL: "SL",
      LT: "LT",
      LV: "LV",
      ET: "ET",
      UA: "UA",
      RS: "SR",
      GR: "EL"
    };
    
    return countryToLanguage[country.toUpperCase()] || "EN";
  }

  /**
   * Get safe mode translations (synced with PACK 430)
   */
  getSafeModeTranslations(language: string): Partial<TranslationKeys> {
    const translation = this.getTranslation(language);
    
    return {
      appName: translation.appName.replace(/AI|IA|KI/gi, "Social"),
      shortDescription: translation.shortDescription.replace(/AI|IA|KI/gi, "").trim(),
      longDescription: translation.longDescription
        .split("\n")
        .filter(line => !line.toLowerCase().includes("ai") && !line.toLowerCase().includes("ia"))
        .join("\n"),
      keywords: translation.keywords
        .split(",")
        .filter(kw => !kw.toLowerCase().includes("ai") && !kw.toLowerCase().includes("ia"))
        .join(",")
    };
  }

  /**
   * Get region-locked content
   */
  async getRegionLockedContent(country: string, language: string): Promise<any> {
    const docRef = this.db.collection("store_i18n_pack431")
      .doc(`${country}_${language}`);
    
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return null;
    }
    
    return doc.data();
  }

  /**
   * Save region-specific translation
   */
  async saveRegionTranslation(
    country: string,
    language: string,
    content: Partial<TranslationKeys>
  ): Promise<void> {
    const docRef = this.db.collection("store_i18n_pack431")
      .doc(`${country}_${language}`);
    
    await docRef.set({
      ...content,
      country,
      language,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    logger.info("Saved region translation", { country, language });
  }

  /**
   * Sync legal copy from PACK 430
   */
  async syncLegalCopy(language: string): Promise<void> {
    const legalRef = this.db.collection("legal_consent_pack430")
      .where("language", "==", language)
      .limit(1);
    
    const snapshot = await legalRef.get();
    
    if (snapshot.empty) {
      logger.warn(`No legal copy found for language ${language}`);
      return;
    }
    
    const legalData = snapshot.docs[0].data();
    
    // Update translations with legal copy
    const translation = this.getTranslation(language);
    translation.legal_terms = legalData.termsUrl || translation.legal_terms;
    translation.legal_privacy = legalData.privacyUrl || translation.legal_privacy;
    translation.legal_consent = legalData.consentText || translation.legal_consent;
    
    logger.info("Synced legal copy", { language });
  }

  /**
   * Generate all translations for all languages
   */
  async generateAllTranslations(): Promise<void> {
    for (const language of SUPPORTED_LANGUAGES) {
      const translation = this.getTranslation(language);
      
      await this.db.collection("store_i18n_pack431")
        .doc(language)
        .set({
          ...translation,
          language,
          generatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      
      logger.info(`Generated translation for ${language}`);
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const createStoreI18nEngine = (db: FirebaseFirestore.Firestore) => {
  return new StoreI18nEngine(db);
};
