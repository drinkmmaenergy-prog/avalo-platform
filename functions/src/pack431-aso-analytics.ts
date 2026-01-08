/**
 * PACK 431: ASO Analytics Engine
 * 
 * Store conversion tracking and ASO performance metrics
 */

import * as admin from "firebase-admin";
import { logger } from "firebase-functions";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface ASOMetrics {
  country: string;
  date: Date;
  impressions: number;
  productPageViews: number;
  installs: number;
  conversionRate: number;
  redownloads?: number;
}

export interface KeywordRanking {
  keyword: string;
  country: string;
  platform: "ios" | "android";
  rank: number;
  previousRank?: number;
  searchVolume?: number;
  difficulty?: number;
  trackingDate: Date;
}

export interface ScreenshotPerformance {
  screenshotId: string;
  country: string;
  type: string;
  impressions: number;
  taps: number;
  tapRate: number;
  conversionImpact: number;
  date: Date;
}

export interface ConversionHeatmap {
  country: string;
  impressions: number;
  installs: number;
  conversionRate: number;
  averageRating: number;
  topKeywords: string[];
}

export interface ReviewImpact {
  averageRating: number;
  totalReviews: number;
  conversionBoost: number;
  recentTrend: "up" | "down" | "stable";
}

// ============================================================================
// ASO ANALYTICS ENGINE
// ============================================================================

export class ASOAnalyticsEngine {
  private db: FirebaseFirestore.Firestore;

  constructor(db: FirebaseFirestore.Firestore) {
    this.db = db;
  }

  /**
   * Track impression to install conversion
   */
  async trackConversion(
    country: string,
    source: "impression" | "pageView" | "install"
  ): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const docId = `${country}_${today.toISOString().split("T")[0]}`;
    const docRef = this.db.collection("aso_metrics_pack431").doc(docId);
    
    const incrementField = source === "impression" 
      ? "impressions"
      : source === "pageView"
      ? "productPageViews"
      : "installs";
    
    await docRef.set({
      country,
      date: today,
      [incrementField]: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    // Calculate conversion rate periodically
    if (source === "install") {
      await this.updateConversionRate(docRef);
    }
  }

  /**
   * Update conversion rate calculation
   */
  private async updateConversionRate(docRef: FirebaseFirestore.DocumentReference): Promise<void> {
    const doc = await docRef.get();
    const data = doc.data();
    
    if (!data) return;
    
    const conversionRate = data.impressions > 0
      ? (data.installs / data.impressions) * 100
      : 0;
    
    await docRef.update({
      conversionRate: Math.round(conversionRate * 100) / 100
    });
  }

  /**
   * Get ASO metrics for a country
   */
  async getMetrics(country: string, days: number = 30): Promise<ASOMetrics[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const snapshot = await this.db
      .collection("aso_metrics_pack431")
      .where("country", "==", country)
      .where("date", ">=", startDate)
      .orderBy("date", "desc")
      .get();
    
    return snapshot.docs.map(doc => doc.data() as ASOMetrics);
  }

  /**
   * Get conversion rate trend
   */
  async getConversionTrend(country: string, days: number = 30): Promise<any> {
    const metrics = await this.getMetrics(country, days);
    
    if (metrics.length === 0) {
      return {
        current: 0,
        average: 0,
        trend: "stable",
        change: 0
      };
    }
    
    const current = metrics[0].conversionRate;
    const average = metrics.reduce((sum, m) => sum + m.conversionRate, 0) / metrics.length;
    const previous = metrics[metrics.length - 1].conversionRate;
    
    const change = ((current - previous) / previous) * 100;
    const trend = change > 5 ? "up" : change < -5 ? "down" : "stable";
    
    return {
      current: Math.round(current * 100) / 100,
      average: Math.round(average * 100) / 100,
      trend,
      change: Math.round(change * 100) / 100
    };
  }

  /**
   * Generate country conversion heatmap
   */
  async generateConversionHeatmap(): Promise<ConversionHeatmap[]> {
    const countries = ["US", "PL", "DE", "ES", "IT", "FR", "GB", "PT", "RO"];
    const heatmap: ConversionHeatmap[] = [];
    
    for (const country of countries) {
      const metrics = await this.getMetrics(country, 7);
      
      if (metrics.length === 0) {
        continue;
      }
      
      const totalImpressions = metrics.reduce((sum, m) => sum + m.impressions, 0);
      const totalInstalls = metrics.reduce((sum, m) => sum + m.installs, 0);
      const avgConversionRate = totalImpressions > 0
        ? (totalInstalls / totalImpressions) * 100
        : 0;
      
      // Get review data
      const reviewStats = await this.getReviewStats(country);
      
      // Get top keywords
      const keywords = await this.getTopKeywords(country, 5);
      
      heatmap.push({
        country,
        impressions: totalImpressions,
        installs: totalInstalls,
        conversionRate: Math.round(avgConversionRate * 100) / 100,
        averageRating: reviewStats.averageRating,
        topKeywords: keywords.map(k => k.keyword)
      });
    }
    
    // Sort by conversion rate
    heatmap.sort((a, b) => b.conversionRate - a.conversionRate);
    
    logger.info("Generated conversion heatmap", {
      countries: heatmap.length,
      topCountry: heatmap[0]?.country
    });
    
    return heatmap;
  }

  /**
   * Track keyword rankings
   */
  async trackKeywordRanking(ranking: KeywordRanking): Promise<void> {
    const docId = `${ranking.country}_${ranking.platform}_${ranking.keyword}`;
    
    // Get previous ranking
    const previousDoc = await this.db
      .collection("keyword_rankings_pack431")
      .doc(docId)
      .get();
    
    const previousRank = previousDoc.exists ? previousDoc.data()?.rank : undefined;
    
    await this.db.collection("keyword_rankings_pack431").doc(docId).set({
      ...ranking,
      previousRank,
      rankChange: previousRank ? previousRank - ranking.rank : 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Store historical data
    await this.db.collection("keyword_rankings_pack431")
      .doc(docId)
      .collection("history")
      .add({
        rank: ranking.rank,
        date: ranking.trackingDate,
        searchVolume: ranking.searchVolume
      });
    
    logger.info("Tracked keyword ranking", {
      keyword: ranking.keyword,
      country: ranking.country,
      rank: ranking.rank,
      change: previousRank ? previousRank - ranking.rank : 0
    });
  }

  /**
   * Get top keywords for country
   */
  async getTopKeywords(country: string, limit: number = 10): Promise<KeywordRanking[]> {
    const snapshot = await this.db
      .collection("keyword_rankings_pack431")
      .where("country", "==", country)
      .orderBy("rank", "asc")
      .limit(limit)
      .get();
    
    return snapshot.docs.map(doc => doc.data() as KeywordRanking);
  }

  /**
   * Analyze keyword opportunities
   */
  async analyzeKeywordOpportunities(country: string): Promise<any[]> {
    const keywords = await this.db
      .collection("keyword_rankings_pack431")
      .where("country", "==", country)
      .get();
    
    const opportunities = [];
    
    for (const doc of keywords.docs) {
      const data = doc.data() as KeywordRanking;
      
      // Identify opportunities:
      // 1. High search volume but not in top 10
      // 2. Rank improved recently
      // 3. Low difficulty but not indexed
      
      if (data.searchVolume && data.searchVolume > 1000 && data.rank > 10) {
        opportunities.push({
          keyword: data.keyword,
          country: data.country,
          opportunity: "high_volume_low_rank",
          searchVolume: data.searchVolume,
          currentRank: data.rank,
          potentialImpact: "high"
        });
      }
      
      if (data.previousRank && data.rank < data.previousRank) {
        opportunities.push({
          keyword: data.keyword,
          country: data.country,
          opportunity: "improving_rank",
          rankImprovement: data.previousRank - data.rank,
          currentRank: data.rank,
          potentialImpact: "medium"
        });
      }
    }
    
    return opportunities;
  }

  /**
   * Track screenshot performance
   */
  async trackScreenshotPerformance(performance: ScreenshotPerformance): Promise<void> {
    const tapRate = performance.impressions > 0
      ? (performance.taps / performance.impressions) * 100
      : 0;
    
    await this.db.collection("screenshot_performance_pack431").add({
      ...performance,
      tapRate: Math.round(tapRate * 100) / 100,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  /**
   * Get screenshot A/B test results
   */
  async getScreenshotABResults(
    screenshotA: string,
    screenshotB: string,
    days: number = 7
  ): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const getStats = async (screenshotId: string) => {
      const snapshot = await this.db
        .collection("screenshot_performance_pack431")
        .where("screenshotId", "==", screenshotId)
        .where("date", ">=", startDate)
        .get();
      
      if (snapshot.empty) {
        return { impressions: 0, taps: 0, tapRate: 0, conversionImpact: 0 };
      }
      
      const data = snapshot.docs.map(doc => doc.data() as ScreenshotPerformance);
      const totalImpressions = data.reduce((sum, d) => sum + d.impressions, 0);
      const totalTaps = data.reduce((sum, d) => sum + d.taps, 0);
      const avgTapRate = totalImpressions > 0
        ? (totalTaps / totalImpressions) * 100
        : 0;
      const avgConversionImpact = data.reduce((sum, d) => sum + d.conversionImpact, 0) / data.length;
      
      return {
        impressions: totalImpressions,
        taps: totalTaps,
        tapRate: Math.round(avgTapRate * 100) / 100,
        conversionImpact: Math.round(avgConversionImpact * 100) / 100
      };
    };
    
    const statsA = await getStats(screenshotA);
    const statsB = await getStats(screenshotB);
    
    const winner = statsA.conversionImpact > statsB.conversionImpact ? "A" : "B";
    const improvement = Math.abs(statsA.conversionImpact - statsB.conversionImpact);
    
    return {
      screenshotA: {
        id: screenshotA,
        ...statsA
      },
      screenshotB: {
        id: screenshotB,
        ...statsB
      },
      winner,
      improvement: Math.round(improvement * 100) / 100,
      significant: improvement > 5
    };
  }

  /**
   * Calculate review impact on conversion
   */
  async calculateReviewImpact(country: string): Promise<ReviewImpact> {
    const reviewStats = await this.getReviewStats(country);
    const conversionTrend = await this.getConversionTrend(country, 30);
    
    // Estimate conversion boost based on rating
    let conversionBoost = 0;
    if (reviewStats.averageRating >= 4.5) conversionBoost = 20;
    else if (reviewStats.averageRating >= 4.0) conversionBoost = 10;
    else if (reviewStats.averageRating >= 3.5) conversionBoost = 0;
    else if (reviewStats.averageRating >= 3.0) conversionBoost = -10;
    else conversionBoost = -20;
    
    // Determine trend based on recent reviews
    const recentReviews = await this.getRecentReviews(country, 7);
    const recentAvg = recentReviews.length > 0
      ? recentReviews.reduce((sum, r) => sum + r.rating, 0) / recentReviews.length
      : reviewStats.averageRating;
    
    const trend = recentAvg > reviewStats.averageRating ? "up"
      : recentAvg < reviewStats.averageRating ? "down"
      : "stable";
    
    return {
      averageRating: reviewStats.averageRating,
      totalReviews: reviewStats.totalReviews,
      conversionBoost,
      recentTrend: trend
    };
  }

  /**
   * Get review statistics helper
   */
  private async getReviewStats(country: string): Promise<any> {
    const reviews = await this.db
      .collection("user_reviews_pack431")
      .where("country", "==", country)
      .get();
    
    if (reviews.empty) {
      return {
        averageRating: 0,
        totalReviews: 0
      };
    }
    
    const ratings = reviews.docs.map(doc => doc.data().rating);
    const averageRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
    
    return {
      averageRating: Math.round(averageRating * 10) / 10,
      totalReviews: reviews.size
    };
  }

  /**
   * Get recent reviews helper
   */
  private async getRecentReviews(country: string, days: number): Promise<any[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const reviews = await this.db
      .collection("user_reviews_pack431")
      .where("country", "==", country)
      .where("timestamp", ">=", startDate)
      .get();
    
    return reviews.docs.map(doc => doc.data());
  }

  /**
   * Generate ASO dashboard data
   */
  async generateDashboardData(country?: string): Promise<any> {
    const countries = country ? [country] : ["US", "PL", "DE", "ES", "IT", "FR", "GB"];
    const dashboardData: any = {
      overview: {},
      countries: [],
      topKeywords: [],
      recentTrends: {}
    };
    
    for (const ctry of countries) {
      const metrics = await this.getMetrics(ctry, 30);
      const conversionTrend = await this.getConversionTrend(ctry, 30);
      const reviewImpact = await this.calculateReviewImpact(ctry);
      const keywords = await this.getTopKeywords(ctry, 5);
      
      if (metrics.length > 0) {
        const totalImpressions = metrics.reduce((sum, m) => sum + m.impressions, 0);
        const totalInstalls = metrics.reduce((sum, m) => sum + m.installs, 0);
        
        dashboardData.countries.push({
          country: ctry,
          impressions: totalImpressions,
          installs: totalInstalls,
          conversionRate: conversionTrend.current,
          trend: conversionTrend.trend,
          reviewRating: reviewImpact.averageRating,
          topKeywords: keywords.map(k => k.keyword).slice(0, 3)
        });
      }
    }
    
    // Calculate overview totals
    dashboardData.overview = {
      totalImpressions: dashboardData.countries.reduce((sum: number, c: any) => sum + c.impressions, 0),
      totalInstalls: dashboardData.countries.reduce((sum: number, c: any) => sum + c.installs, 0),
      avgConversionRate: dashboardData.countries.length > 0
        ? dashboardData.countries.reduce((sum: number, c: any) => sum + c.conversionRate, 0) / dashboardData.countries.length
        : 0,
      countries: dashboardData.countries.length
    };
    
    logger.info("Generated ASO dashboard", {
      countries: dashboardData.countries.length,
      totalInstalls: dashboardData.overview.totalInstalls
    });
    
    return dashboardData;
  }

  /**
   * Export analytics data for reporting
   */
  async exportAnalytics(
    country: string,
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    const metrics = await this.db
      .collection("aso_metrics_pack431")
      .where("country", "==", country)
      .where("date", ">=", startDate)
      .where("date", "<=", endDate)
      .orderBy("date", "asc")
      .get();
    
    const data = metrics.docs.map(doc => doc.data());
    
    return {
      country,
      period: {
        start: startDate,
        end: endDate
      },
      metrics: data,
      summary: {
        totalImpressions: data.reduce((sum, m) => sum + m.impressions, 0),
        totalInstalls: data.reduce((sum, m) => sum + m.installs, 0),
        avgConversionRate: data.length > 0
          ? data.reduce((sum, m) => sum + m.conversionRate, 0) / data.length
          : 0
      }
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const createASOAnalyticsEngine = (db: FirebaseFirestore.Firestore) => {
  return new ASOAnalyticsEngine(db);
};
