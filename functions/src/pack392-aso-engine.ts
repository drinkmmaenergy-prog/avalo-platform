/**
 * PACK 392 - ASO (App Store Optimization) Engine
 * Continuous optimization of store presence, keywords, and conversion
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// TYPES
// ============================================================================

export interface ASOMetrics {
  storeId: string;
  country: string;
  keywords: KeywordMetrics[];
  screenshots: ScreenshotMetrics[];
  icon: IconMetrics;
  conversionRate: number;
  installToRegistration: number;
  titleSubtitleVariants: TitleVariantMetrics[];
  overallScore: number;
  recommendations: ASORecommendation[];
  lastOptimized: FirebaseFirestore.Timestamp;
}

export interface KeywordMetrics {
  keyword: string;
  rank: number;
  searchVolume: number;
  difficulty: number;
  conversion: number;
  impressions: number;
  installs: number;
  trending: boolean;
}

export interface ScreenshotMetrics {
  id: string;
  position: number;
  url: string;
  variant: string;
  impressions: number;
  conversions: number;
  conversionRate: number;
  clickThroughRate: number;
}

export interface IconMetrics {
  variant: string;
  url: string;
  impressions: number;
  conversions: number;
  conversionRate: number;
  abTestStatus: 'ACTIVE' | 'WINNER' | 'LOSER' | 'PENDING';
}

export interface TitleVariantMetrics {
  title: string;
  subtitle: string;
  impressions: number;
  conversions: number;
  conversionRate: number;
  isActive: boolean;
}

export interface ASORecommendation {
  type: 'KEYWORD' | 'SCREENSHOT' | 'ICON' | 'TITLE' | 'DESCRIPTION';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  action: string;
  expectedImpact: number; // 0-100
  implementationEffort: 'LOW' | 'MEDIUM' | 'HIGH';
  rationale: string;
}

export interface CountryASO {
  country: string;
  language: string;
  keywords: string[];
  title: string;
  subtitle: string;
  description: string;
  optimizationScore: number;
  marketSize: number;
  competition: number;
}

// ============================================================================
// CORE: ASO OPTIMIZATION ENGINE
// ============================================================================

export const pack392_asoOptimizationEngine = functions
  .runWith({ 
    timeoutSeconds: 540,
    memory: '2GB'
  })
  .pubsub
  .schedule('every 6 hours')
  .onRun(async (context) => {
    console.log('[PACK 392] Running ASO Optimization Engine');

    try {
      // Get all stores with ASO enabled
      const storesSnap = await db.collection('stores')
        .where('asoEnabled', '==', true)
        .get();
      
      for (const storeDoc of storesSnap.docs) {
        const storeId = storeDoc.id;
        const storeData = storeDoc.data();
        
        // Optimize for each target country
        for (const country of storeData.targetCountries || ['US']) {
          await optimizeStoreASO(storeId, country);
        }
      }

      console.log('[PACK 392] ASO Optimization Engine completed');
      return { success: true, optimized: storesSnap.size };
    } catch (error) {
      console.error('[PACK 392] ASO Optimization Engine error:', error);
      throw error;
    }
  });

async function optimizeStoreASO(storeId: string, country: string): Promise<void> {
  console.log(`[PACK 392] Optimizing ASO for store: ${storeId}, country: ${country}`);
  
  const now = admin.firestore.Timestamp.now();
  
  // Gather ASO metrics
  const keywords = await analyzeKeywords(storeId, country);
  const screenshots = await analyzeScreenshots(storeId, country);
  const icon = await analyzeIcon(storeId, country);
  const titleVariants = await analyzeTitleVariants(storeId, country);
  const conversionMetrics = await getConversionMetrics(storeId, country);
  
  // Calculate overall ASO score
  const overallScore = calculateASOScore({
    keywords,
    screenshots,
    icon,
    titleVariants,
    conversionMetrics
  });
  
  // Generate recommendations
  const recommendations = generateRecommendations({
    keywords,
    screenshots,
    icon,
    titleVariants,
    conversionMetrics,
    overallScore
  });
  
  // Store ASO metrics
  const asoMetrics: ASOMetrics = {
    storeId,
    country,
    keywords,
    screenshots,
    icon,
    conversionRate: conversionMetrics.conversionRate,
    installToRegistration: conversionMetrics.installToRegistration,
    titleSubtitleVariants: titleVariants,
    overallScore,
    recommendations,
    lastOptimized: now
  };
  
  await db.collection('asoMetrics').doc(`${storeId}_${country}`).set(asoMetrics);
  
  // Auto-implement high-priority, low-effort recommendations
  const autoImplementable = recommendations.filter(r => 
    r.priority === 'HIGH' && r.implementationEffort === 'LOW'
  );
  
  for (const rec of autoImplementable) {
    await autoImplementRecommendation(storeId, country, rec);
  }
  
  console.log(`[PACK 392] ASO optimization complete: score ${overallScore}, ${recommendations.length} recommendations`);
}

// ============================================================================
// KEYWORD ANALYSIS
// ============================================================================

async function analyzeKeywords(storeId: string, country: string): Promise<KeywordMetrics[]> {
  const keywordsSnap = await db.collection('asoKeywords')
    .where('storeId', '==', storeId)
    .where('country', '==', country)
    .get();
  
  const keywords: KeywordMetrics[] = [];
  
  for (const keywordDoc of keywordsSnap.docs) {
    const data = keywordDoc.data();
    const metrics = await getKeywordPerformance(storeId, country, data.keyword);
    
    keywords.push({
      keyword: data.keyword,
      rank: data.currentRank || 999,
      searchVolume: data.searchVolume || 0,
      difficulty: data.difficulty || 50,
      conversion: metrics.conversion,
      impressions: metrics.impressions,
      installs: metrics.installs,
      trending: metrics.trending
    });
  }
  
  // Sort by impact (search volume * conversion / difficulty)
  keywords.sort((a, b) => {
    const impactA = (a.searchVolume * a.conversion) / Math.max(a.difficulty, 1);
    const impactB = (b.searchVolume * b.conversion) / Math.max(b.difficulty, 1);
    return impactB - impactA;
  });
  
  return keywords;
}

async function getKeywordPerformance(storeId: string, country: string, keyword: string) {
  const thirtyDaysAgo = admin.firestore.Timestamp.fromMillis(
    Date.now() - (30 * 24 * 60 * 60 * 1000)
  );
  
  const performanceSnap = await db.collection('keywordPerformance')
    .where('storeId', '==', storeId)
    .where('country', '==', country)
    .where('keyword', '==', keyword)
    .where('timestamp', '>=', thirtyDaysAgo)
    .get();
  
  let totalImpressions = 0;
  let totalInstalls = 0;
  let recentImpressions = 0;
  let oldImpressions = 0;
  
  const midpoint = Date.now() - (15 * 24 * 60 * 60 * 1000);
  
  performanceSnap.docs.forEach(doc => {
    const data = doc.data();
    totalImpressions += data.impressions || 0;
    totalInstalls += data.installs || 0;
    
    if (data.timestamp.toMillis() > midpoint) {
      recentImpressions += data.impressions || 0;
    } else {
      oldImpressions += data.impressions || 0;
    }
  });
  
  const conversion = totalImpressions > 0 ? totalInstalls / totalImpressions : 0;
  const trending = recentImpressions > oldImpressions * 1.2; // 20% growth
  
  return {
    conversion,
    impressions: totalImpressions,
    installs: totalInstalls,
    trending
  };
}

// ============================================================================
// SCREENSHOT ANALYSIS
// ============================================================================

async function analyzeScreenshots(storeId: string, country: string): Promise<ScreenshotMetrics[]> {
  const screenshotsSnap = await db.collection('asoScreenshots')
    .where('storeId', '==', storeId)
    .where('country', '==', country)
    .orderBy('position')
    .get();
  
  const screenshots: ScreenshotMetrics[] = [];
  
  for (const screenshotDoc of screenshotsSnap.docs) {
    const data = screenshotDoc.data();
    const metrics = await getScreenshotPerformance(screenshotDoc.id);
    
    screenshots.push({
      id: screenshotDoc.id,
      position: data.position,
      url: data.url,
      variant: data.variant || 'default',
      impressions: metrics.impressions,
      conversions: metrics.conversions,
      conversionRate: metrics.conversionRate,
      clickThroughRate: metrics.clickThroughRate
    });
  }
  
  return screenshots;
}

async function getScreenshotPerformance(screenshotId: string) {
  const performanceSnap = await db.collection('screenshotPerformance')
    .where('screenshotId', '==', screenshotId)
    .where('timestamp', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - (30 * 24 * 60 * 60 * 1000)))
    .get();
  
  let impressions = 0;
  let conversions = 0;
  let clicks = 0;
  
  performanceSnap.docs.forEach(doc => {
    const data = doc.data();
    impressions += data.impressions || 0;
    conversions += data.conversions || 0;
    clicks += data.clicks || 0;
  });
  
  return {
    impressions,
    conversions,
    conversionRate: impressions > 0 ? conversions / impressions : 0,
    clickThroughRate: impressions > 0 ? clicks / impressions : 0
  };
}

// ============================================================================
// ICON ANALYSIS
// ============================================================================

async function analyzeIcon(storeId: string, country: string): Promise<IconMetrics> {
  const iconDoc = await db.collection('asoIcons')
    .doc(`${storeId}_${country}`)
    .get();
  
  if (!iconDoc.exists) {
    return {
      variant: 'default',
      url: '',
      impressions: 0,
      conversions: 0,
      conversionRate: 0,
      abTestStatus: 'PENDING'
    };
  }
  
  const data = iconDoc.data()!;
  const metrics = await getIconPerformance(iconDoc.id);
  
  return {
    variant: data.variant || 'default',
    url: data.url,
    impressions: metrics.impressions,
    conversions: metrics.conversions,
    conversionRate: metrics.conversionRate,
    abTestStatus: data.abTestStatus || 'PENDING'
  };
}

async function getIconPerformance(iconId: string) {
  const performanceSnap = await db.collection('iconPerformance')
    .where('iconId', '==', iconId)
    .where('timestamp', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - (30 * 24 * 60 * 60 * 1000)))
    .get();
  
  let impressions = 0;
  let conversions = 0;
  
  performanceSnap.docs.forEach(doc => {
    const data = doc.data();
    impressions += data.impressions || 0;
    conversions += data.conversions || 0;
  });
  
  return {
    impressions,
    conversions,
    conversionRate: impressions > 0 ? conversions / impressions : 0
  };
}

// ============================================================================
// TITLE/SUBTITLE ANALYSIS
// ============================================================================

async function analyzeTitleVariants(storeId: string, country: string): Promise<TitleVariantMetrics[]> {
  const variantsSnap = await db.collection('asoTitleVariants')
    .where('storeId', '==', storeId)
    .where('country', '==', country)
    .get();
  
  const variants: TitleVariantMetrics[] = [];
  
  for (const variantDoc of variantsSnap.docs) {
    const data = variantDoc.data();
    const metrics = await getTitleVariantPerformance(variantDoc.id);
    
    variants.push({
      title: data.title,
      subtitle: data.subtitle,
      impressions: metrics.impressions,
      conversions: metrics.conversions,
      conversionRate: metrics.conversionRate,
      isActive: data.isActive || false
    });
  }
  
  return variants;
}

async function getTitleVariantPerformance(variantId: string) {
  const performanceSnap = await db.collection('titleVariantPerformance')
    .where('variantId', '==', variantId)
    .where('timestamp', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - (30 * 24 * 60 * 60 * 1000)))
    .get();
  
  let impressions = 0;
  let conversions = 0;
  
  performanceSnap.docs.forEach(doc => {
    const data = doc.data();
    impressions += data.impressions || 0;
    conversions += data.conversions || 0;
  });
  
  return {
    impressions,
    conversions,
    conversionRate: impressions > 0 ? conversions / impressions : 0
  };
}

// ============================================================================
// CONVERSION METRICS
// ============================================================================

async function getConversionMetrics(storeId: string, country: string) {
  const thirtyDaysAgo = admin.firestore.Timestamp.fromMillis(
    Date.now() - (30 * 24 * 60 * 60 * 1000)
  );
  
  // Get store page views and installs
  const metricsSnap = await db.collection('storeMetrics')
    .where('storeId', '==', storeId)
    .where('country', '==', country)
    .where('timestamp', '>=', thirtyDaysAgo)
    .get();
  
  let totalViews = 0;
  let totalInstalls = 0;
  let totalRegistrations = 0;
  
  metricsSnap.docs.forEach(doc => {
    const data = doc.data();
    totalViews += data.pageViews || 0;
    totalInstalls += data.installs || 0;
    totalRegistrations += data.registrations || 0;
  });
  
  return {
    conversionRate: totalViews > 0 ? totalInstalls / totalViews : 0,
    installToRegistration: totalInstalls > 0 ? totalRegistrations / totalInstalls : 0
  };
}

// ============================================================================
// ASO SCORING
// ============================================================================

function calculateASOScore(data: {
  keywords: KeywordMetrics[];
  screenshots: ScreenshotMetrics[];
  icon: IconMetrics;
  titleVariants: TitleVariantMetrics[];
  conversionMetrics: any;
}): number {
  let score = 0;
  
  // Keyword score (30 points)
  const avgKeywordRank = data.keywords.length > 0
    ? data.keywords.reduce((sum, k) => sum + k.rank, 0) / data.keywords.length
    : 999;
  const keywordScore = Math.max(0, 30 - (avgKeywordRank / 33));
  score += keywordScore;
  
  // Screenshot score (20 points)
  const avgScreenshotCR = data.screenshots.length > 0
    ? data.screenshots.reduce((sum, s) => sum + s.conversionRate, 0) / data.screenshots.length
    : 0;
  score += avgScreenshotCR * 2000; // 10% CR = 20 points
  
  // Icon score (20 points)
  score += data.icon.conversionRate * 2000;
  
  // Conversion score (30 points)
  score += data.conversionMetrics.conversionRate * 1500; // 50% CR target = 15 points
  score += data.conversionMetrics.installToRegistration * 1500; // 50% reg rate = 15 points
  
  return Math.min(100, Math.round(score));
}

// ============================================================================
// RECOMMENDATIONS GENERATOR
// ============================================================================

function generateRecommendations(data: any): ASORecommendation[] {
  const recommendations: ASORecommendation[] = [];
  
  // Keyword recommendations
  const lowRankKeywords = data.keywords.filter((k: KeywordMetrics) => k.rank > 20 && k.searchVolume > 1000);
  if (lowRankKeywords.length > 0) {
    recommendations.push({
      type: 'KEYWORD',
      priority: 'HIGH',
      action: `Optimize for high-volume keywords: ${lowRankKeywords.slice(0, 3).map((k: KeywordMetrics) => k.keyword).join(', ')}`,
      expectedImpact: 75,
      implementationEffort: 'MEDIUM',
      rationale: 'These keywords have high search volume but low ranking'
    });
  }
  
  // Screenshot recommendations
  const poorScreenshots = data.screenshots.filter((s: ScreenshotMetrics) => s.conversionRate < 0.05);
  if (poorScreenshots.length > 0) {
    recommendations.push({
      type: 'SCREENSHOT',
      priority: 'HIGH',
      action: `Replace low-performing screenshots at positions: ${poorScreenshots.map((s: ScreenshotMetrics) => s.position).join(', ')}`,
      expectedImpact: 60,
      implementationEffort: 'MEDIUM',
      rationale: 'Screenshots with <5% conversion rate should be replaced'
    });
  }
  
  // Icon recommendation
  if (data.icon.conversionRate < 0.08) {
    recommendations.push({
      type: 'ICON',
      priority: 'MEDIUM',
      action: 'Run A/B test on app icon',
      expectedImpact: 50,
      implementationEffort: 'HIGH',
      rationale: 'Icon conversion rate below 8% benchmark'
    });
  }
  
  // Conversion rate recommendation
  if (data.conversionMetrics.conversionRate < 0.25) {
    recommendations.push({
      type: 'SCREENSHOT',
      priority: 'CRITICAL',
      action: 'Overhaul store page - conversion rate critically low',
      expectedImpact: 90,
      implementationEffort: 'HIGH',
      rationale: 'Store page conversion rate below 25% is critical'
    });
  }
  
  // Install to registration recommendation
  if (data.conversionMetrics.installToRegistration < 0.40) {
    recommendations.push({
      type: 'DESCRIPTION',
      priority: 'HIGH',
      action: 'Improve onboarding flow communication in store description',
      expectedImpact: 70,
      implementationEffort: 'LOW',
      rationale: 'Less than 40% of installs are registering'
    });
  }
  
  return recommendations;
}

// ============================================================================
// AUTO-IMPLEMENTATION
// ============================================================================

async function autoImplementRecommendation(
  storeId: string,
  country: string,
  recommendation: ASORecommendation
): Promise<void> {
  console.log(`[PACK 392] Auto-implementing: ${recommendation.action}`);
  
  // Log implementation
  await db.collection('asoAutoImplementations').add({
    storeId,
    country,
    recommendation,
    implementedAt: admin.firestore.Timestamp.now(),
    status: 'APPLIED'
  });
  
  // Actual implementation would happen here (e.g., update store listing via API)
}

// ============================================================================
// MANUAL ASO ANALYSIS
// ============================================================================

export const pack392_runASOAnalysis = functions
  .runWith({ timeoutSeconds: 60, memory: '1GB' })
  .https
  .onCall(async (data, context) => {
    // Admin only
    if (!context.auth?.token.admin) {
      throw new functions.https.HttpsError('permission-denied', 'Admin required');
    }

    const { storeId, country } = data;
    if (!storeId || !country) {
      throw new functions.https.HttpsError('invalid-argument', 'storeId and country required');
    }

    await optimizeStoreASO(storeId, country);

    const asoDoc = await db.collection('asoMetrics').doc(`${storeId}_${country}`).get();
    return asoDoc.data();
  });

// ============================================================================
// GET ASO DASHBOARD DATA
// ============================================================================

export const pack392_getASODashboard = functions
  .https
  .onCall(async (data, context) => {
    // Admin only
    if (!context.auth?.token.admin) {
      throw new functions.https.HttpsError('permission-denied', 'Admin required');
    }

    const { storeId } = data;
    if (!storeId) {
      throw new functions.https.HttpsError('invalid-argument', 'storeId required');
    }

    const asoSnap = await db.collection('asoMetrics')
      .where('storeId', '==', storeId)
      .get();

    return asoSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  });

// ============================================================================
// KEYWORD TRACKING
// ============================================================================

export const pack392_addKeyword = functions
  .https
  .onCall(async (data, context) => {
    // Admin only
    if (!context.auth?.token.admin) {
      throw new functions.https.HttpsError('permission-denied', 'Admin required');
    }

    const { storeId, country, keyword, searchVolume, difficulty } = data;
    if (!storeId || !country || !keyword) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    await db.collection('asoKeywords').add({
      storeId,
      country,
      keyword,
      searchVolume: searchVolume || 0,
      difficulty: difficulty || 50,
      addedAt: admin.firestore.Timestamp.now(),
      trackingEnabled: true
    });

    return { success: true };
  });

export const pack392_removeKeyword = functions
  .https
  .onCall(async (data, context) => {
    // Admin only
    if (!context.auth?.token.admin) {
      throw new functions.https.HttpsError('permission-denied', 'Admin required');
    }

    const { keywordId } = data;
    if (!keywordId) {
      throw new functions.https.HttpsError('invalid-argument', 'keywordId required');
    }

    await db.collection('asoKeywords').doc(keywordId).delete();

    return { success: true };
  });
