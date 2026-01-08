/**
 * PACK 380 — Multi-Language Global Expansion Engine
 * 
 * Features:
 * - Localized press pack builder
 * - Creator localization support
 * - Region-specific content generation
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

const db = admin.firestore();

// ============================================================================
// SUPPORTED LANGUAGES (42+ languages)
// ============================================================================

export const SUPPORTED_LANGUAGES = [
  'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'ru', 'ja',
  'ko', 'zh', 'ar', 'hi', 'tr', 'vi', 'th', 'id', 'ms', 'fil',
  'sv', 'no', 'da', 'fi', 'cs', 'sk', 'hu', 'ro', 'bg', 'hr',
  'sr', 'sl', 'et', 'lv', 'lt', 'uk', 'he', 'fa', 'ur', 'bn',
  'ta', 'te'
];

export const LANGUAGE_NAMES: Record<string, string> = {
  'en': 'English',
  'es': 'Español',
  'fr': 'Français',
  'de': 'Deutsch',
  'it': 'Italiano',
  'pt': 'Português',
  'nl': 'Nederlands',
  'pl': 'Polski',
  'ru': 'Русский',
  'ja': '日本語',
  'ko': '한국어',
  'zh': '中文',
  'ar': 'العربية',
  'hi': 'हिन्दी',
  'tr': 'Türkçe',
  'vi': 'Tiếng Việt',
  'th': 'ไทย',
  'id': 'Bahasa Indonesia'
};

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface LocalizedPressPack {
  id: string;
  basePackId: string;
  language: string;
  region: string;
  title: string;
  subtitle: string;
  content: string;
  mediaAssets: {
    original: string;
    localized?: string;
  }[];
  translations: {
    automated: boolean;
    reviewedBy?: string;
    quality: 'machine' | 'human_reviewed' | 'native_speaker';
  };
  culturalAdaptations: string[];
  legalCompliance: {
    checked: boolean;
    approvedBy?: string;
    specificRequirements: string[];
  };
  status: 'draft' | 'review' | 'approved' | 'published';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface RegionConfig {
  region: string;
  languages: string[];
  primaryLanguage: string;
  culturalNotes: string[];
  legalRequirements: string[];
  preferredTone: string;
  tabooTopics: string[];
  localPartners: string[];
  launchStatus: 'not_available' | 'planned' | 'soft_launch' | 'launched';
}

interface TranslationGlossary {
  term: string;
  translations: Record<string, string>;
  context: string;
  category: 'brand' | 'legal' | 'technical' | 'marketing';
  doNotTranslate: boolean;
}

// ============================================================================
// LOCALIZED PRESS PACK BUILDER
// ============================================================================

/**
 * Create localized press pack from base press release
 */
export const createLocalizedPressPack = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;

  // Admin check
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  if (!userData?.role || !['admin', 'pr_manager', 'localization_manager'].includes(userData.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
  }

  const {
    pressReleaseId,
    targetLanguage,
    targetRegion,
    autoTranslate,
    culturalAdaptations
  } = data;

  if (!pressReleaseId || !targetLanguage || !targetRegion) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    // Get original press release
    const prDoc = await db.collection('pressReleases').doc(pressReleaseId).get();
    if (!prDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Press release not found');
    }

    const pressRelease = prDoc.data();

    // Translate content
    let translatedContent = pressRelease?.content || '';
    let translatedTitle = pressRelease?.title || '';
    let translatedSubtitle = pressRelease?.subtitle || '';

    if (autoTranslate) {
      // Use translation service
      const translations = await translateContent(
        {
          title: translatedTitle,
          subtitle: translatedSubtitle,
          content: translatedContent
        },
        targetLanguage
      );

      translatedTitle = translations.title;
      translatedSubtitle = translations.subtitle;
      translatedContent = translations.content;
    }

    // Apply cultural adaptations
    if (culturalAdaptations && Array.isArray(culturalAdaptations)) {
      translatedContent = await applyCulturalAdaptations(
        translatedContent,
        targetRegion,
        culturalAdaptations
      );
    }

    // Get region-specific legal requirements
    const regionConfig = await getRegionConfig(targetRegion);

    // Create localized pack
    const packRef = db.collection('localizedPressPacks').doc();
    const pack: LocalizedPressPack = {
      id: packRef.id,
      basePackId: pressReleaseId,
      language: targetLanguage,
      region: targetRegion,
      title: translatedTitle,
      subtitle: translatedSubtitle,
      content: translatedContent,
      mediaAssets: (pressRelease?.mediaAssets || []).map((url: string) => ({
        original: url
      })),
      translations: {
        automated: autoTranslate,
        quality: autoTranslate ? 'machine' : 'human_reviewed'
      },
      culturalAdaptations: culturalAdaptations || [],
      legalCompliance: {
        checked: false,
        specificRequirements: regionConfig.legalRequirements
      },
      status: 'draft',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    await packRef.set(pack);

    // Log activity
    await db.collection('auditLogs').add({
      userId,
      action: 'localized_press_pack_created',
      resource: 'localizedPressPack',
      resourceId: packRef.id,
      metadata: { pressReleaseId, language: targetLanguage, region: targetRegion },
      timestamp: Timestamp.now()
    });

    return {
      success: true,
      packId: packRef.id,
      pack
    };
  } catch (error: any) {
    console.error('Error creating localized press pack:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Translate content
 */
async function translateContent(
  content: { title: string; subtitle: string; content: string },
  targetLanguage: string
): Promise<{ title: string; subtitle: string; content: string }> {
  // TODO: Integrate with translation service (Google Cloud Translation, DeepL, etc.)
  // For now, return placeholder indicating translation needed

  // Load translation glossary
  const glossary = await loadTranslationGlossary();

  // Simple placeholder implementation
  // In production, this would call external translation APIs
  return {
    title: `[${targetLanguage.toUpperCase()}] ${content.title}`,
    subtitle: `[${targetLanguage.toUpperCase()}] ${content.subtitle}`,
    content: `[${targetLanguage.toUpperCase()}] ${content.content}`
  };
}

/**
 * Load translation glossary
 */
async function loadTranslationGlossary(): Promise<TranslationGlossary[]> {
  const snapshot = await db.collection('translationGlossary').get();
  return snapshot.docs.map(doc => doc.data() as TranslationGlossary);
}

/**
 * Apply cultural adaptations
 */
async function applyCulturalAdaptations(
  content: string,
  region: string,
  adaptations: string[]
): Promise<string> {
  // Get region configuration
  const regionConfig = await getRegionConfig(region);

  let adaptedContent = content;

  // Apply region-specific adaptations
  // Examples:
  // - Date format changes
  // - Currency symbols
  // - Cultural references
  // - Tone adjustments

  return adaptedContent;
}

/**
 * Get region configuration
 */
async function getRegionConfig(region: string): Promise<RegionConfig> {
  const configDoc = await db.collection('regionConfigs').doc(region).get();
  
  if (configDoc.exists) {
    return configDoc.data() as RegionConfig;
  }

  // Return default config
  return {
    region,
    languages: ['en'],
    primaryLanguage: 'en',
    culturalNotes: [],
    legalRequirements: [],
    preferredTone: 'professional',
    tabooTopics: [],
    localPartners: [],
    launchStatus: 'not_available'
  };
}

// ============================================================================
// CREATOR LOCALIZATION SUPPORT
// ============================================================================

/**
 * Get localized creator materials
 */
export const getLocalizedCreatorMaterials = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { language, region, materialType } = data;

  if (!language || !region) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    // Get localized materials
    let query = db.collection('creatorMaterials')
      .where('language', '==', language)
      .where('region', 'in', [region, 'global'])
      .where('status', '==', 'published') as any;

    if (materialType) {
      query = query.where('type', '==', materialType);
    }

    const snapshot = await query.get();
    const materials = snapshot.docs.map(doc => doc.data());

    return {
      success: true,
      materials
    };
  } catch (error: any) {
    console.error('Error getting localized creator materials:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Create localized creator pitch deck
 */
export const createLocalizedPitchDeck = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;

  const { language, region, includeEarnings, includeTestimonials } = data;

  if (!language || !region) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    // Get base pitch deck template
    const templateDoc = await db.collection('pitchDeckTemplates')
      .doc('default')
      .get();

    if (!templateDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Template not found');
    }

    const template = templateDoc.data();

    // Translate template
    const translatedSlides = await translatePitchDeck(template, language);

    // Add region-specific data
    const regionData = await getRegionSpecificData(region);

    // Include earnings data if requested
    let earningsData = null;
    if (includeEarnings) {
      earningsData = await getRegionEarningsData(region);
    }

    // Include testimonials if requested
    let testimonials = [];
    if (includeTestimonials) {
      testimonials = await getLocalizedTestimonials(language, region);
    }

    // Create pitch deck document
    const pitchDeckRef = db.collection('localizedPitchDecks').doc();
    await pitchDeckRef.set({
      id: pitchDeckRef.id,
      userId,
      language,
      region,
      slides: translatedSlides,
      regionData,
      earningsData,
      testimonials,
      generatedAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
    });

    return {
      success: true,
      pitchDeckId: pitchDeckRef.id,
      downloadUrl: `https://avalo.app/pitch-decks/${pitchDeckRef.id}`
    };
  } catch (error: any) {
    console.error('Error creating localized pitch deck:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Translate pitch deck
 */
async function translatePitchDeck(template: any, language: string): Promise<any[]> {
  // TODO: Translate each slide
  // This would integrate with translation services
  return template?.slides || [];
}

/**
 * Get region-specific data
 */
async function getRegionSpecificData(region: string): Promise<any> {
  const statsDoc = await db.collection('regionStats').doc(region).get();
  return statsDoc.data() || {};
}

/**
 * Get region earnings data
 */
async function getRegionEarningsData(region: string): Promise<any> {
  // Aggregated, anonymized earnings data
  const earningsDoc = await db.collection('regionEarnings').doc(region).get();
  return earningsDoc.data() || { avgMonthlyEarnings: 0, topCreatorEarnings: 0 };
}

/**
 * Get localized testimonials
 */
async function getLocalizedTestimonials(language: string, region: string): Promise<any[]> {
  const snapshot = await db.collection('creatorTestimonials')
    .where('language', '==', language)
    .where('region', 'in', [region, 'global'])
    .where('approved', '==', true)
    .where('featured', '==', true)
    .limit(10)
    .get();

  return snapshot.docs.map(doc => doc.data());
}

// ============================================================================
// REGION EXPANSION MANAGEMENT
// ============================================================================

/**
 * Initialize region configuration
 */
export const initializeRegionConfig = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;

  // Admin check
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  if (!userData?.role || !['admin'].includes(userData.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
  }

  const {
    region,
    languages,
    primaryLanguage,
    culturalNotes,
    legalRequirements,
    launchStatus
  } = data;

  if (!region || !languages || !primaryLanguage) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    const configRef = db.collection('regionConfigs').doc(region);
    const config: RegionConfig = {
      region,
      languages,
      primaryLanguage,
      culturalNotes: culturalNotes || [],
      legalRequirements: legalRequirements || [],
      preferredTone: data.preferredTone || 'professional',
      tabooTopics: data.tabooTopics || [],
      localPartners: data.localPartners || [],
      launchStatus: launchStatus || 'planned'
    };

    await configRef.set(config);

    return {
      success: true,
      region,
      config
    };
  } catch (error: any) {
    console.error('Error initializing region config:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get available regions
 */
export const getAvailableRegions = functions.https.onCall(async (data, context) => {
  try {
    const snapshot = await db.collection('regionConfigs').get();
    const regions = snapshot.docs.map(doc => doc.data() as RegionConfig);

    // Filter by launch status if specified
    const { launchStatus } = data;
    let filteredRegions = regions;
    
    if (launchStatus) {
      filteredRegions = regions.filter(r => r.launchStatus === launchStatus);
    }

    return {
      success: true,
      regions: filteredRegions,
      total: filteredRegions.length
    };
  } catch (error: any) {
    console.error('Error getting available regions:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Add translation glossary term
 */
export const addTranslationGlossaryTerm = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;

  // Admin check
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  if (!userData?.role || !['admin', 'localization_manager'].includes(userData.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
  }

  const { term, translations, context: termContext, category, doNotTranslate } = data;

  if (!term || !translations) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    const glossaryRef = db.collection('translationGlossary').doc();
    const glossaryTerm: TranslationGlossary = {
      term,
      translations,
      context: termContext || '',
      category: category || 'marketing',
      doNotTranslate: doNotTranslate || false
    };

    await glossaryRef.set(glossaryTerm);

    return {
      success: true,
      termId: glossaryRef.id
    };
  } catch (error: any) {
    console.error('Error adding glossary term:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get market expansion analysis
 */
export const getMarketExpansionAnalysis = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;

  // Admin check
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  if (!userData?.role || !['admin', 'pr_manager'].includes(userData.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
  }

  try {
    // Get all region configs
    const regionsSnapshot = await db.collection('regionConfigs').get();
    const regions = regionsSnapshot.docs.map(doc => doc.data() as RegionConfig);

    // Calculate opportunity scores for each region
    const analysis = await Promise.all(
      regions.map(async region => {
        const stats = await getRegionSpecificData(region.region);
        const earnings = await getRegionEarningsData(region.region);

        // Calculate opportunity score based on various factors
        const opportunityScore = calculateOpportunityScore({
          launchStatus: region.launchStatus,
          userCount: stats.userCount || 0,
          creatorCount: stats.creatorCount || 0,
          avgEarnings: earnings.avgMonthlyEarnings || 0,
          marketSize: stats.marketSize || 0
        });

        return {
          region: region.region,
          primaryLanguage: region.primaryLanguage,
          launchStatus: region.launchStatus,
          opportunityScore,
          metrics: {
            userCount: stats.userCount || 0,
            creatorCount: stats.creatorCount || 0,
            avgEarnings: earnings.avgMonthlyEarnings || 0
          },
          readinessScore: calculateReadinessScore(region)
        };
      })
    );

    // Sort by opportunity score
    analysis.sort((a, b) => b.opportunityScore - a.opportunityScore);

    return {
      success: true,
      analysis,
      updatedAt: Timestamp.now()
    };
  } catch (error: any) {
    console.error('Error getting market expansion analysis:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Calculate opportunity score
 */
function calculateOpportunityScore(data: {
  launchStatus: string;
  userCount: number;
  creatorCount: number;
  avgEarnings: number;
  marketSize: number;
}): number {
  let score = 0;

  // Launch status weight
  const statusWeights: Record<string, number> = {
    'not_available': 100,
    'planned': 75,
    'soft_launch': 50,
    'launched': 25
  };
  score += statusWeights[data.launchStatus] || 0;

  // Market size weight
  score += Math.min(data.marketSize / 1000000, 50); // Cap at 50

  // Existing performance weight
  if (data.launchStatus !== 'not_available') {
    score += Math.min(data.userCount / 10000, 25); // Cap at 25
    score += Math.min(data.avgEarnings / 100, 25); // Cap at 25
  }

  return Math.round(score);
}

/**
 * Calculate readiness score
 */
function calculateReadinessScore(region: RegionConfig): number {
  let score = 0;

  // Check if basic requirements are met
  if (region.languages.length > 0) score += 20;
  if (region.primaryLanguage) score += 20;
  if (region.legalRequirements.length > 0) score += 20;
  if (region.culturalNotes.length > 0) score += 20;
  if (region.localPartners.length > 0) score += 20;

  return score;
}
