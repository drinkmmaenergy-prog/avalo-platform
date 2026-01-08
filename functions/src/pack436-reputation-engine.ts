/**
 * PACK 436 — Reputation Engine (Global)
 * 
 * Tracks Avalo's global reputation across all markets
 * - Global App Reputation Score (GARS)
 * - Country-specific scores
 * - Store visibility metrics
 * - Competitive positioning
 * - Anomaly detection
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface GlobalAppReputationScore {
  gars: number; // 0-100 Global App Reputation Score
  lastUpdated: number;
  trend: 'up' | 'down' | 'stable';
  components: {
    appStoreRating: number;
    reviewVolume: number;
    reviewQuality: number;
    responseRate: number;
    updateFrequency: number;
    crashRate: number;
    userRetention: number;
    marketShare: number;
  };
}

interface CountryReputationScore {
  country: string;
  score: number; // 0-100
  rating: number; // 1-5 stars
  reviewCount: number;
  downloads: number;
  rank: number; // App Store ranking
  competitorComparison: {
    ranking: number; // 1 = best in category
    ratingVsAverage: number;
  };
  lastUpdated: number;
}

interface StoreVisibilityScore {
  overall: number; // 0-100
  ios: {
    score: number;
    ranking: number;
    impressions: number;
    conversions: number;
  };
  android: {
    score: number;
    ranking: number;
    impressions: number;
    conversions: number;
  };
  lastUpdated: number;
}

interface ReputationAnomaly {
  type: 'rating_drop' | 'review_spike' | 'ranking_drop' | 'competitor_surge' | 'negative_campaign';
  severity: 'low' | 'medium' | 'high' | 'critical';
  country?: string;
  platform?: 'ios' | 'android';
  metrics: {
    before: number;
    after: number;
    change: number;
    changePercent: number;
  };
  detectedAt: number;
  resolved: boolean;
}

interface WeeklyReport {
  weekStarting: number;
  gars: GlobalAppReputationScore;
  countries: CountryReputationScore[];
  visibility: StoreVisibilityScore;
  anomalies: ReputationAnomaly[];
  recommendations: string[];
  generatedAt: number;
}

// ============================================================================
// GLOBAL APP REPUTATION SCORE (GARS)
// ============================================================================

/**
 * Calculate Global App Reputation Score
 * Updates every hour
 */
export const calculateGARS = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async () => {
    const db = admin.firestore();
    
    // Fetch current metrics
    const components = {
      appStoreRating: await calculateAppStoreRatingScore(),
      reviewVolume: await calculateReviewVolumeScore(),
      reviewQuality: await calculateReviewQualityScore(),
      responseRate: await calculateResponseRateScore(),
      updateFrequency: await calculateUpdateFrequencyScore(),
      crashRate: await calculateCrashRateScore(),
      userRetention: await calculateUserRetentionScore(),
      marketShare: await calculateMarketShareScore(),
    };
    
    // Calculate weighted GARS
    const gars = 
      components.appStoreRating * 0.25 +
      components.reviewVolume * 0.10 +
      components.reviewQuality * 0.15 +
      components.responseRate * 0.10 +
      components.updateFrequency * 0.10 +
      components.crashRate * 0.10 +
      components.userRetention * 0.15 +
      components.marketShare * 0.05;
    
    // Determine trend
    const previousDoc = await db.collection('globalReputation').doc('current').get();
    const previous = previousDoc.data() as GlobalAppReputationScore | undefined;
    
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (previous) {
      const change = gars - previous.gars;
      if (change > 2) trend = 'up';
      else if (change < -2) trend = 'down';
    }
    
    const score: GlobalAppReputationScore = {
      gars: Math.round(gars),
      lastUpdated: Date.now(),
      trend,
      components,
    };
    
    // Store score
    await db.collection('globalReputation').doc('current').set(score);
    await db.collection('globalReputationHistory').add({
      ...score,
      timestamp: Date.now(),
    });
    
    // Check for anomalies
    if (previous && Math.abs(gars - previous.gars) > 5) {
      await createReputationAnomaly({
        type: 'rating_drop',
        severity: Math.abs(gars - previous.gars) > 10 ? 'high' : 'medium',
        metrics: {
          before: previous.gars,
          after: gars,
          change: gars - previous.gars,
          changePercent: ((gars - previous.gars) / previous.gars) * 100,
        },
        detectedAt: Date.now(),
        resolved: false,
      });
    }
    
    return score;
  });

// Component calculation functions
async function calculateAppStoreRatingScore(): Promise<number> {
  const db = admin.firestore();
  
  // Fetch ratings from both platforms
  const iosRating = await db.collection('storeMetrics').doc('ios').get();
  const androidRating = await db.collection('storeMetrics').doc('android').get();
  
  const ios = iosRating.data()?.rating || 0;
  const android = androidRating.data()?.rating || 0;
  
  const avgRating = (ios + android) / 2;
  return (avgRating / 5) * 100;
}

async function calculateReviewVolumeScore(): Promise<number> {
  const db = admin.firestore();
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  
  const reviews = await db.collection('reviews')
    .where('timestamp', '>', thirtyDaysAgo)
    .get();
  
  // Target: 100+ reviews per month = 100 score
  return Math.min(100, reviews.size);
}

async function calculateReviewQualityScore(): Promise<number> {
  const db = admin.firestore();
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  
  const reviews = await db.collection('reviews')
    .where('timestamp', '>', thirtyDaysAgo)
    .get();
  
  if (reviews.empty) return 0;
  
  let totalRating = 0;
  reviews.docs.forEach(doc => {
    totalRating += doc.data().rating || 0;
  });
  
  const avgRating = totalRating / reviews.size;
  return (avgRating / 5) * 100;
}

async function calculateResponseRateScore(): Promise<number> {
  const db = admin.firestore();
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  
  const reviews = await db.collection('reviews')
    .where('timestamp', '>', thirtyDaysAgo)
    .get();
  
  if (reviews.empty) return 100;
  
  const responded = reviews.docs.filter(doc => doc.data().responded === true).length;
  return (responded / reviews.size) * 100;
}

async function calculateUpdateFrequencyScore(): Promise<number> {
  const db = admin.firestore();
  const updates = await db.collection('appUpdates')
    .orderBy('releaseDate', 'desc')
    .limit(3)
    .get();
  
  if (updates.empty) return 0;
  
  const latestUpdate = updates.docs[0].data();
  const daysSinceUpdate = (Date.now() - latestUpdate.releaseDate) / (1000 * 60 * 60 * 24);
  
  // Updated within 14 days = 100 score
  if (daysSinceUpdate <= 14) return 100;
  if (daysSinceUpdate <= 30) return 80;
  if (daysSinceUpdate <= 60) return 50;
  return 20;
}

async function calculateCrashRateScore(): Promise<number> {
  const db = admin.firestore();
  const crashMetrics = await db.collection('crashMetrics').doc('current').get();
  const data = crashMetrics.data();
  
  if (!data) return 100; // No crashes = perfect score
  
  const crashRate = data.crashRate || 0; // Percentage
  return Math.max(0, 100 - (crashRate * 10));
}

async function calculateUserRetentionScore(): Promise<number> {
  const db = admin.firestore();
  const retentionDoc = await db.collection('analytics').doc('retention').get();
  const data = retentionDoc.data();
  
  if (!data) return 50;
  
  // Day 30 retention rate
  return data.day30 || 50;
}

async function calculateMarketShareScore(): Promise<number> {
  const db = admin.firestore();
  const marketDoc = await db.collection('marketAnalytics').doc('current').get();
  const data = marketDoc.data();
  
  if (!data) return 50;
  
  // Relative to category leaders
  return data.marketShareScore || 50;
}

// ============================================================================
// COUNTRY REPUTATION SCORES
// ============================================================================

/**
 * Calculate reputation scores per country
 */
export const calculateCountryScores = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async () => {
    const db = admin.firestore();
    
    // Get list of active countries
    const countries = await db.collection('activeCountries').get();
    const scores: CountryReputationScore[] = [];
    
    for (const countryDoc of countries.docs) {
      const country = countryDoc.id;
      const score = await calculateCountryScore(country);
      scores.push(score);
      
      // Store score
      await db.collection('countryReputation').doc(country).set(score);
    }
    
    return { countries: scores.length };
  });

async function calculateCountryScore(country: string): Promise<CountryReputationScore> {
  const db = admin.firestore();
  
  // Fetch country-specific metrics
  const metricsDoc = await db.collection('countryMetrics').doc(country).get();
  const metrics = metricsDoc.data() || {};
  
  const score: CountryReputationScore = {
    country,
    score: 0,
    rating: metrics.rating || 0,
    reviewCount: metrics.reviewCount || 0,
    downloads: metrics.downloads || 0,
    rank: metrics.rank || 999,
    competitorComparison: {
      ranking: metrics.competitorRanking || 999,
      ratingVsAverage: metrics.ratingVsAverage || 0,
    },
    lastUpdated: Date.now(),
  };
  
  // Calculate overall country score
  score.score = 
    (score.rating / 5) * 30 +
    Math.min((score.reviewCount / 100) * 20, 20) +
    Math.max(0, 100 - score.rank) * 0.3 +
    (score.competitorComparison.ratingVsAverage > 0 ? 20 : 0);
  
  return score;
}

// ============================================================================
// STORE VISIBILITY METRICS
// ============================================================================

/**
 * Track store visibility scores
 */
export const calculateVisibilityScores = functions.pubsub
  .schedule('every 12 hours')
  .onRun(async () => {
    const db = admin.firestore();
    
    // Fetch iOS metrics
    const iosDoc = await db.collection('storeMetrics').doc('ios').get();
    const iosData = iosDoc.data() || {};
    
    // Fetch Android metrics
    const androidDoc = await db.collection('storeMetrics').doc('android').get();
    const androidData = androidDoc.data() || {};
    
    const visibility: StoreVisibilityScore = {
      overall: 0,
      ios: {
        score: calculatePlatformVisibility(iosData),
        ranking: iosData.ranking || 999,
        impressions: iosData.impressions || 0,
        conversions: iosData.conversions || 0,
      },
      android: {
        score: calculatePlatformVisibility(androidData),
        ranking: androidData.ranking || 999,
        impressions: androidData.impressions || 0,
        conversions: androidData.conversions || 0,
      },
      lastUpdated: Date.now(),
    };
    
    visibility.overall = (visibility.ios.score + visibility.android.score) / 2;
    
    // Store visibility score
    await db.collection('visibilityScores').doc('current').set(visibility);
    
    return visibility;
  });

function calculatePlatformVisibility(data: any): number {
  const rankingScore = Math.max(0, 100 - (data.ranking || 999));
  const impressionScore = Math.min(50, (data.impressions || 0) / 1000);
  const conversionScore = Math.min(30, (data.conversions || 0) * 100);
  
  return rankingScore * 0.5 + impressionScore + conversionScore;
}

// ============================================================================
// ANOMALY DETECTION
// ============================================================================

async function createReputationAnomaly(anomaly: ReputationAnomaly) {
  const db = admin.firestore();
  
  await db.collection('reputationAnomalies').add(anomaly);
  
  // Alert admins if high severity
  if (anomaly.severity === 'high' || anomaly.severity === 'critical') {
    await db.collection('adminAlerts').add({
      type: 'reputation_anomaly',
      severity: anomaly.severity,
      anomalyType: anomaly.type,
      timestamp: Date.now(),
      read: false,
    });
  }
}

/**
 * Monitor for reputation anomalies
 */
export const monitorReputationAnomalies = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async () => {
    const db = admin.firestore();
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    // Check for sudden rating drops
    const currentGARS = await db.collection('globalReputation').doc('current').get();
    const current = currentGARS.data() as GlobalAppReputationScore;
    
    const previousGARS = await db.collection('globalReputationHistory')
      .where('timestamp', '>', oneHourAgo)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();
    
    if (!previousGARS.empty) {
      const previous = previousGARS.docs[0].data() as GlobalAppReputationScore;
      const change = current.gars - previous.gars;
      
      if (Math.abs(change) > 5) {
        await createReputationAnomaly({
          type: change < 0 ? 'rating_drop' : 'review_spike',
          severity: Math.abs(change) > 10 ? 'critical' : 'high',
          metrics: {
            before: previous.gars,
            after: current.gars,
            change,
            changePercent: (change / previous.gars) * 100,
          },
          detectedAt: now,
          resolved: false,
        });
      }
    }
    
    // Check for ranking drops
    const visibility = await db.collection('visibilityScores').doc('current').get();
    const visData = visibility.data() as StoreVisibilityScore;
    
    if (visData) {
      if (visData.ios.ranking > 100 || visData.android.ranking > 100) {
        await createReputationAnomaly({
          type: 'ranking_drop',
          severity: 'medium',
          platform: visData.ios.ranking > visData.android.ranking ? 'ios' : 'android',
          metrics: {
            before: 0,
            after: Math.max(visData.ios.ranking, visData.android.ranking),
            change: 0,
            changePercent: 0,
          },
          detectedAt: now,
          resolved: false,
        });
      }
    }
    
    return { checked: true };
  });

// ============================================================================
// WEEKLY REPORT GENERATION
// ============================================================================

/**
 * Generate weekly reputation report
 */
export const generateWeeklyReport = functions.pubsub
  .schedule('every monday 09:00')
  .timeZone('UTC')
  .onRun(async () => {
    const db = admin.firestore();
    const now = Date.now();
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    // Fetch current GARS
    const garsDoc = await db.collection('globalReputation').doc('current').get();
    const gars = garsDoc.data() as GlobalAppReputationScore;
    
    // Fetch country scores
    const countryDocs = await db.collection('countryReputation').get();
    const countries = countryDocs.docs.map(doc => doc.data() as CountryReputationScore);
    
    // Fetch visibility
    const visDoc = await db.collection('visibilityScores').doc('current').get();
    const visibility = visDoc.data() as StoreVisibilityScore;
    
    // Fetch anomalies
    const anomalyDocs = await db.collection('reputationAnomalies')
      .where('detectedAt', '>', oneWeekAgo)
      .get();
    const anomalies = anomalyDocs.docs.map(doc => doc.data() as ReputationAnomaly);
    
    // Generate recommendations
    const recommendations = generateRecommendations(gars, countries, visibility, anomalies);
    
    const report: WeeklyReport = {
      weekStarting: oneWeekAgo,
      gars,
      countries,
      visibility,
      anomalies,
      recommendations,
      generatedAt: now,
    };
    
    // Store report
    await db.collection('weeklyReports').add(report);
    
    // Notify admins
    await db.collection('adminAlerts').add({
      type: 'weekly_report',
      severity: 'low',
      timestamp: now,
      read: false,
    });
    
    return report;
  });

function generateRecommendations(
  gars: GlobalAppReputationScore,
  countries: CountryReputationScore[],
  visibility: StoreVisibilityScore,
  anomalies: ReputationAnomaly[]
): string[] {
  const recommendations: string[] = [];
  
  // GARS-based recommendations
  if (gars.gars < 70) {
    recommendations.push('GARS below 70 - Focus on improving app store ratings');
  }
  if (gars.components.crashRate < 80) {
    recommendations.push('High crash rate detected - Prioritize stability fixes');
  }
  if (gars.components.responseRate < 60) {
    recommendations.push('Low review response rate - Increase community engagement');
  }
  
  // Country-based recommendations
  const lowPerformingCountries = countries.filter(c => c.score < 50);
  if (lowPerformingCountries.length > 0) {
    recommendations.push(`Low performance in ${lowPerformingCountries.length} countries - Review localization`);
  }
  
  // Visibility recommendations
  if (visibility.overall < 50) {
    recommendations.push('Low store visibility - Increase ASO efforts');
  }
  
  // Anomaly-based recommendations
  if (anomalies.length > 0) {
    const critical = anomalies.filter(a => a.severity === 'critical');
    if (critical.length > 0) {
      recommendations.push(`${critical.length} critical anomalies detected - Immediate action required`);
    }
  }
  
  return recommendations;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  GlobalAppReputationScore,
  CountryReputationScore,
  StoreVisibilityScore,
  ReputationAnomaly,
  WeeklyReport,
};
