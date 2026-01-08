/**
 * PACK 431: ASO Metadata Automation Engine
 * 
 * Dynamic generation of app store metadata based on:
 * - Country/Region
 * - Language
 * - Legal mode (SAFE_MODE from PACK 430)
 * - User sentiment and feature usage
 */

import * as admin from "firebase-admin";
import { logger } from "firebase-functions";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface StoreMetadata {
  appTitle: string;
  shortDescription: string;
  longDescription: string;
  keywords: string[];
  whatsNew: string;
  country: string;
  language: string;
  safeMode: boolean;
  generatedAt: Date;
  version: string;
}

export interface MetadataGenerationContext {
  country: string;
  language: string;
  safeMode: boolean;
  userSentiment?: {
    averageRating: number;
    topKeywords: string[];
    commonPraise: string[];
    commonComplaints: string[];
  };
  featureActivation?: {
    chat: number;
    calendar: number;
    ai: number;
    events: number;
    dating: number;
  };
  retentionSignals?: {
    day1: number;
    day7: number;
    day30: number;
  };
}

export interface MetadataTemplate {
  title: {
    base: string;
    safeMode: string;
  };
  shortDesc: {
    base: string;
    safeMode: string;
  };
  longDesc: {
    base: string[];
    safeMode: string[];
  };
  keywords: {
    base: string[];
    safeMode: string[];
  };
}

// ============================================================================
// METADATA TEMPLATES BY LANGUAGE
// ============================================================================

const METADATA_TEMPLATES: Record<string, MetadataTemplate> = {
  EN: {
    title: {
      base: "Avalo - Dating, Events & AI",
      safeMode: "Avalo - Social Dating Network"
    },
    shortDesc: {
      base: "Meet people, create events, chat with AI companions. Modern dating reimagined.",
      safeMode: "Connect with people nearby through events and meaningful conversations."
    },
    longDesc: {
      base: [
        "Avalo is the next generation of dating apps, combining real connections with AI-powered features.",
        "",
        "🌟 FEATURES:",
        "• Smart Matching - Find compatible people nearby",
        "• Events & Meetups - Create and join real-world events",
        "• AI Companions - Chat with intelligent AI personalities",
        "• Premium Chat - Connect with premium members",
        "• Calendar Integration - Never miss a date",
        "• Verified Profiles - Trust through verification",
        "",
        "💎 PREMIUM FEATURES:",
        "• Unlimited matches and chats",
        "• See who liked you",
        "• Advanced filters",
        "• Boost your profile",
        "• Priority support"
      ],
      safeMode: [
        "Avalo is a modern dating platform focused on meaningful connections and real-world meetups.",
        "",
        "🌟 FEATURES:",
        "• Smart Matching - Find compatible people nearby",
        "• Events & Meetups - Create and join social events",
        "• Verified Profiles - Trust through verification",
        "• Calendar Integration - Organize your social life",
        "• Safe Messaging - Protected communication",
        "",
        "💎 PREMIUM FEATURES:",
        "• Unlimited matches",
        "• Advanced filters",
        "• Priority verification"
      ]
    },
    keywords: {
      base: [
        "dating", "chat", "events", "ai companion", "dating app",
        "meet people", "singles", "relationships", "social", "hookup",
        "flirt", "match", "swipe", "date", "romance", "love",
        "meetup", "party", "nightlife", "calendar", "schedule"
      ],
      safeMode: [
        "dating", "social", "events", "meet people", "dating app",
        "singles", "relationships", "friends", "meetup", "calendar",
        "verified", "safe dating", "local events", "community"
      ]
    }
  },
  PL: {
    title: {
      base: "Avalo - Randki, Wydarzenia i AI",
      safeMode: "Avalo - Społecznościowa Sieć Randkowa"
    },
    shortDesc: {
      base: "Poznawaj ludzi, twórz wydarzenia, rozmawiaj z AI. Nowoczesne randki.",
      safeMode: "Łącz się z ludźmi w pobliżu poprzez wydarzenia i rozmowy."
    },
    longDesc: {
      base: [
        "Avalo to nowa generacja aplikacji randkowych, łącząca prawdziwe relacje z funkcjami AI.",
        "",
        "🌟 FUNKCJE:",
        "• Inteligentne Dopasowanie - Znajdź kompatybilne osoby w pobliżu",
        "• Wydarzenia i Spotkania - Twórz i dołączaj do wydarzeń",
        "• Towarzyszki AI - Rozmawiaj z inteligentnymi AI",
        "• Premium Chat - Połącz się z premium członkami",
        "• Integracja z Kalendarzem - Nie przegap żadnej randki",
        "• Zweryfikowane Profile - Zaufanie przez weryfikację"
      ],
      safeMode: [
        "Avalo to nowoczesna platforma randkowa skupiona na znaczących połączeniach.",
        "",
        "🌟 FUNKCJE:",
        "• Inteligentne Dopasowanie - Znajdź kompatybilne osoby",
        "• Wydarzenia Społeczne - Twórz i dołączaj do wydarzeń",
        "• Zweryfikowane Profile - Bezpieczeństwo przez weryfikację",
        "• Bezpieczne Wiadomości - Chroniona komunikacja"
      ]
    },
    keywords: {
      base: [
        "randki", "czat", "wydarzenia", "ai", "aplikacja randkowa",
        "poznaj ludzi", "single", "związki", "flirt", "match"
      ],
      safeMode: [
        "randki", "społeczność", "wydarzenia", "znajomi", "bezpieczne randki"
      ]
    }
  },
  DE: {
    title: {
      base: "Avalo - Dating, Events & KI",
      safeMode: "Avalo - Soziales Dating-Netzwerk"
    },
    shortDesc: {
      base: "Leute treffen, Events erstellen, mit KI chatten. Modernes Dating.",
      safeMode: "Verbinde dich mit Menschen in deiner Nähe durch Events und Gespräche."
    },
    longDesc: {
      base: [
        "Avalo ist die nächste Generation von Dating-Apps mit echten Verbindungen und KI-Features.",
        "",
        "🌟 FUNKTIONEN:",
        "• Smart Matching - Finde kompatible Personen",
        "• Events & Treffen - Erstelle und besuche Events",
        "• KI-Begleiter - Chatte mit intelligenten KI-Persönlichkeiten",
        "• Premium Chat - Verbinde dich mit Premium-Mitgliedern",
        "• Kalender-Integration - Verpasse kein Date"
      ],
      safeMode: [
        "Avalo ist eine moderne Dating-Plattform für bedeutungsvolle Verbindungen.",
        "",
        "🌟 FUNKTIONEN:",
        "• Smart Matching - Finde kompatible Personen",
        "• Soziale Events - Erstelle und besuche Events",
        "• Verifizierte Profile - Sicherheit durch Verifizierung"
      ]
    },
    keywords: {
      base: [
        "dating", "chat", "events", "ki", "dating app",
        "leute treffen", "singles", "beziehung", "flirt", "match"
      ],
      safeMode: [
        "dating", "sozial", "events", "freunde", "sicheres dating"
      ]
    }
  },
  ES: {
    title: {
      base: "Avalo - Citas, Eventos e IA",
      safeMode: "Avalo - Red Social de Citas"
    },
    shortDesc: {
      base: "Conoce gente, crea eventos, chatea con IA. Citas modernas reinventadas.",
      safeMode: "Conéctate con personas cercanas a través de eventos y conversaciones."
    },
    longDesc: {
      base: [
        "Avalo es la nueva generación de apps de citas, combinando conexiones reales con IA.",
        "",
        "🌟 CARACTERÍSTICAS:",
        "• Emparejamiento Inteligente - Encuentra personas compatibles",
        "• Eventos y Quedadas - Crea y únete a eventos reales",
        "• Compañeros IA - Chatea con personalidades IA inteligentes",
        "• Chat Premium - Conéctate con miembros premium"
      ],
      safeMode: [
        "Avalo es una plataforma moderna de citas enfocada en conexiones significativas.",
        "",
        "🌟 CARACTERÍSTICAS:",
        "• Emparejamiento Inteligente - Encuentra personas compatibles",
        "• Eventos Sociales - Crea y únete a eventos",
        "• Perfiles Verificados - Confianza mediante verificación"
      ]
    },
    keywords: {
      base: [
        "citas", "chat", "eventos", "ia", "app de citas",
        "conocer gente", "solteros", "relaciones", "ligar", "match"
      ],
      safeMode: [
        "citas", "social", "eventos", "amigos", "citas seguras"
      ]
    }
  },
  IT: {
    title: {
      base: "Avalo - Incontri, Eventi e IA",
      safeMode: "Avalo - Rete Sociale di Incontri"
    },
    shortDesc: {
      base: "Incontra persone, crea eventi, chatta con IA. Incontri moderni.",
      safeMode: "Connettiti con persone vicine attraverso eventi e conversazioni."
    },
    longDesc: {
      base: [
        "Avalo è la nuova generazione di app di incontri con connessioni reali e funzionalità IA.",
        "",
        "🌟 CARATTERISTICHE:",
        "• Matching Intelligente - Trova persone compatibili",
        "• Eventi e Incontri - Crea e partecipa a eventi reali",
        "• Compagni IA - Chatta con personalità IA intelligenti"
      ],
      safeMode: [
        "Avalo è una piattaforma moderna di incontri focalizzata su connessioni significative.",
        "",
        "🌟 CARATTERISTICHE:",
        "• Matching Intelligente - Trova persone compatibili",
        "• Eventi Sociali - Crea e partecipa a eventi"
      ]
    },
    keywords: {
      base: [
        "incontri", "chat", "eventi", "ia", "app incontri",
        "conoscere persone", "single", "relazioni", "flirt", "match"
      ],
      safeMode: [
        "incontri", "social", "eventi", "amici", "incontri sicuri"
      ]
    }
  },
  FR: {
    title: {
      base: "Avalo - Rencontres, Évents & IA",
      safeMode: "Avalo - Réseau Social de Rencontres"
    },
    shortDesc: {
      base: "Rencontrez des gens, créez des événements, chattez avec l'IA. Rencontres modernes.",
      safeMode: "Connectez-vous avec des personnes à proximité via des événements."
    },
    longDesc: {
      base: [
        "Avalo est la nouvelle génération d'applications de rencontres avec des connexions réelles et l'IA.",
        "",
        "🌟 CARACTÉRISTIQUES:",
        "• Matching Intelligent - Trouvez des personnes compatibles",
        "• Événements et Rencontres - Créez et rejoignez des événements",
        "• Compagnons IA - Chattez avec des personnalités IA intelligentes"
      ],
      safeMode: [
        "Avalo est une plateforme moderne de rencontres axée sur les connexions significatives.",
        "",
        "🌟 CARACTÉRISTIQUES:",
        "• Matching Intelligent - Trouvez des personnes compatibles",
        "• Événements Sociaux - Créez et rejoignez des événements"
      ]
    },
    keywords: {
      base: [
        "rencontres", "chat", "événements", "ia", "app rencontres",
        "rencontrer personnes", "célibataires", "relations", "flirt", "match"
      ],
      safeMode: [
        "rencontres", "social", "événements", "amis", "rencontres sûres"
      ]
    }
  }
};

// Add fallback for other languages
const DEFAULT_LANGUAGES = ["PT", "RO", "BG", "CZ", "SK", "HR", "SL", "LT", "LV", "ET", "UA", "SR", "EL"];
DEFAULT_LANGUAGES.forEach(lang => {
  if (!METADATA_TEMPLATES[lang]) {
    METADATA_TEMPLATES[lang] = METADATA_TEMPLATES.EN; // Fallback to English
  }
});

// ============================================================================
// METADATA GENERATION ENGINE
// ============================================================================

export class ASOMetadataEngine {
  private db: FirebaseFirestore.Firestore;

  constructor(db: FirebaseFirestore.Firestore) {
    this.db = db;
  }

  /**
   * Generate store metadata for a specific country/language/mode
   */
  async generateMetadata(context: MetadataGenerationContext): Promise<StoreMetadata> {
    const template = this.getTemplate(context.language, context.safeMode);
    
    // Get dynamic signals
    const sentiment = context.userSentiment || await this.getUserSentiment(context.country);
    const features = context.featureActivation || await this.getFeatureActivation(context.country);
    const retention = context.retentionSignals || await this.getRetentionSignals(context.country);

    // Generate metadata
    const metadata: StoreMetadata = {
      appTitle: this.generateTitle(template, context, features),
      shortDescription: this.generateShortDescription(template, context, sentiment),
      longDescription: this.generateLongDescription(template, context, features, retention),
      keywords: this.generateKeywords(template, context, sentiment, features),
      whatsNew: await this.generateWhatsNew(context),
      country: context.country,
      language: context.language,
      safeMode: context.safeMode,
      generatedAt: new Date(),
      version: "1.0"
    };

    // Store in Firestore
    await this.saveMetadata(metadata);

    logger.info("Generated ASO metadata", {
      country: context.country,
      language: context.language,
      safeMode: context.safeMode
    });

    return metadata;
  }

  /**
   * Get template for language/mode
   */
  private getTemplate(language: string, safeMode: boolean): MetadataTemplate {
    const lang = language.toUpperCase();
    return METADATA_TEMPLATES[lang] || METADATA_TEMPLATES.EN;
  }

  /**
   * Generate app title based on context
   */
  private generateTitle(
    template: MetadataTemplate,
    context: MetadataGenerationContext,
    features: any
  ): string {
    const baseTitle = context.safeMode ? template.title.safeMode : template.title.base;
    
    // Add dynamic suffix based on top feature
    if (features.events > 0.7) {
      return `${baseTitle}`;
    }
    
    return baseTitle;
  }

  /**
   * Generate short description
   */
  private generateShortDescription(
    template: MetadataTemplate,
    context: MetadataGenerationContext,
    sentiment: any
  ): string {
    const baseDesc = context.safeMode ? template.shortDesc.safeMode : template.shortDesc.base;
    
    // Incorporate top praise if available
    if (sentiment.commonPraise && sentiment.commonPraise.length > 0) {
      // Use base for now, can enhance with sentiment later
    }
    
    return baseDesc;
  }

  /**
   * Generate long description
   */
  private generateLongDescription(
    template: MetadataTemplate,
    context: MetadataGenerationContext,
    features: any,
    retention: any
  ): string {
    const baseDesc = context.safeMode ? template.longDesc.safeMode : template.longDesc.base;
    
    let description = baseDesc.join("\n");
    
    // Add social proof based on retention
    if (retention.day30 > 0.5) {
      description += "\n\n⭐ High user retention - People love Avalo!";
    }
    
    return description;
  }

  /**
   * Generate keywords
   */
  private generateKeywords(
    template: MetadataTemplate,
    context: MetadataGenerationContext,
    sentiment: any,
    features: any
  ): string[] {
    const baseKeywords = context.safeMode ? template.keywords.safeMode : template.keywords.base;
    
    // Add sentiment-based keywords
    const sentimentKeywords = sentiment.topKeywords || [];
    
    // Combine and deduplicate
    const allKeywords = [...baseKeywords, ...sentimentKeywords];
    const uniqueKeywords = Array.from(new Set(allKeywords));
    
    // Sanitize keywords (remove adult content if in safe mode)
    return this.sanitizeKeywords(uniqueKeywords, context.safeMode);
  }

  /**
   * Generate What's New section
   */
  private async generateWhatsNew(context: MetadataGenerationContext): Promise<string> {
    // Get latest features from releases
    const releasesRef = this.db.collection("releases").orderBy("createdAt", "desc").limit(1);
    const snapshot = await releasesRef.get();
    
    if (snapshot.empty) {
      return context.safeMode 
        ? "Bug fixes and performance improvements"
        : "New features and improvements for better dating experience";
    }
    
    const release = snapshot.docs[0].data();
    return release.whatsNew || "Bug fixes and performance improvements";
  }

  /**
   * Get user sentiment from reviews
   */
  private async getUserSentiment(country: string): Promise<any> {
    const reviewsRef = this.db.collection("reviews")
      .where("country", "==", country)
      .orderBy("createdAt", "desc")
      .limit(100);
    
    const snapshot = await reviewsRef.get();
    
    if (snapshot.empty) {
      return {
        averageRating: 4.5,
        topKeywords: [],
        commonPraise: [],
        commonComplaints: []
      };
    }
    
    // Analyze reviews
    const reviews = snapshot.docs.map(doc => doc.data());
    const averageRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    
    return {
      averageRating,
      topKeywords: this.extractTopKeywords(reviews),
      commonPraise: this.extractCommonPraise(reviews),
      commonComplaints: this.extractCommonComplaints(reviews)
    };
  }

  /**
   * Get feature activation rates
   */
  private async getFeatureActivation(country: string): Promise<any> {
    const analyticsRef = this.db.collection("analytics_pack431")
      .doc(country)
      .collection("feature_activation")
      .orderBy("date", "desc")
      .limit(1);
    
    const snapshot = await analyticsRef.get();
    
    if (snapshot.empty) {
      return {
        chat: 0.8,
        calendar: 0.4,
        ai: 0.6,
        events: 0.5,
        dating: 0.9
      };
    }
    
    return snapshot.docs[0].data();
  }

  /**
   * Get retention signals
   */
  private async getRetentionSignals(country: string): Promise<any> {
    const retentionRef = this.db.collection("analytics_pack301")
      .doc(country)
      .collection("retention")
      .orderBy("date", "desc")
      .limit(1);
    
    const snapshot = await retentionRef.get();
    
    if (snapshot.empty) {
      return {
        day1: 0.7,
        day7: 0.4,
        day30: 0.2
      };
    }
    
    return snapshot.docs[0].data();
  }

  /**
   * Extract top keywords from reviews
   */
  private extractTopKeywords(reviews: any[]): string[] {
    // Simple keyword extraction - can be enhanced with NLP
    const keywords: Record<string, number> = {};
    
    reviews.forEach(review => {
      const words = review.text?.toLowerCase().split(/\s+/) || [];
      words.forEach(word => {
        if (word.length > 3) {
          keywords[word] = (keywords[word] || 0) + 1;
        }
      });
    });
    
    return Object.entries(keywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * Extract common praise from 5-star reviews
   */
  private extractCommonPraise(reviews: any[]): string[] {
    return reviews
      .filter(r => r.rating >= 4)
      .map(r => r.text)
      .slice(0, 5);
  }

  /**
   * Extract common complaints from 1-2 star reviews
   */
  private extractCommonComplaints(reviews: any[]): string[] {
    return reviews
      .filter(r => r.rating <= 2)
      .map(r => r.text)
      .slice(0, 5);
  }

  /**
   * Sanitize keywords based on safe mode
   */
  private sanitizeKeywords(keywords: string[], safeMode: boolean): string[] {
    if (!safeMode) return keywords;
    
    const blockedKeywords = ["hookup", "sex", "adult", "nsfw", "18+", "xxx"];
    return keywords.filter(k => !blockedKeywords.some(blocked => k.toLowerCase().includes(blocked)));
  }

  /**
   * Save metadata to Firestore
   */
  private async saveMetadata(metadata: StoreMetadata): Promise<void> {
    const docId = `${metadata.country}_${metadata.language}_${metadata.safeMode ? "safe" : "full"}`;
    
    await this.db.collection("store_metadata_pack431").doc(docId).set({
      ...metadata,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  /**
   * Regenerate all metadata for all countries/languages
   */
  async regenerateAllMetadata(safeMode: boolean): Promise<void> {
    const countries = ["US", "PL", "DE", "ES", "IT", "FR", "GB", "PT", "RO"];
    const languages = Object.keys(METADATA_TEMPLATES);
    
    for (const country of countries) {
      for (const language of languages) {
        await this.generateMetadata({
          country,
          language,
          safeMode
        });
      }
    }
    
    logger.info("Regenerated all ASO metadata", { safeMode });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const createASOMetadataEngine = (db: FirebaseFirestore.Firestore) => {
  return new ASOMetadataEngine(db);
};
