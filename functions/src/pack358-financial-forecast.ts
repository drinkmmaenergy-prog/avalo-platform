/**
 * PACK 358 — Revenue Forecasting Engine
 * 
 * Provides real-time revenue forecasting with confidence bands
 * Read-only integration with wallet, retention, and acquisition data
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type RevenueForecast = {
  date: string;
  predictedRevenuePLN: number;
  predictedPayoutsPLN: number;
  predictedGrossProfitPLN: number;
  confidence: number; // 0–1
};

export type ForecastTimeframe = '30d' | '90d' | '12m';

export type ForecastResult = {
  timeframe: ForecastTimeframe;
  forecasts: RevenueForecast[];
  p50: number; // Median
  p75: number; // 75th percentile
  p90: number; // 90th percentile
  totalRevenuePLN: number;
  totalPayoutsPLN: number;
  totalGrossProfitPLN: number;
  avgDailyRevenuePLN: number;
  generatedAt: string;
};

type HistoricalDataPoint = {
  date: string;
  revenuePLN: number;
  payoutsPLN: number;
  activeUsers: number;
  newUsers: number;
  transactions: number;
};

type ForecastInputs = {
  historical: HistoricalDataPoint[];
  avgChurnRate: number;
  avgRetentionRate: number;
  avgConversionRate: number;
  avgRevenuePerUser: number;
  seasonalityFactor: number;
  trafficGrowthRate: number;
};

// ============================================================================
// FORECAST CALCULATION ENGINE
// ============================================================================

class RevenueForecastEngine {
  private db: FirebaseFirestore.Firestore;

  constructor() {
    this.db = admin.firestore();
  }

  /**
   * Main forecast generation function
   */
  async generateForecast(timeframe: ForecastTimeframe): Promise<ForecastResult> {
    const days = this.getDaysForTimeframe(timeframe);
    const inputs = await this.gatherForecastInputs(days);
    const forecasts = this.calculateForecasts(inputs, days);
    const stats = this.calculateStatistics(forecasts);

    const result: ForecastResult = {
      timeframe,
      forecasts,
      ...stats,
      generatedAt: new Date().toISOString(),
    };

    // Save to Firestore
    await this.saveForecast(result);

    return result;
  }

  /**
   * Gather all input data from dependent packs
   */
  private async gatherForecastInputs(days: number): Promise<ForecastInputs> {
    const now = Date.now();
    const lookbackDays = Math.min(days * 2, 90); // Look back 2x forecast period, max 90 days
    const lookbackStart = now - lookbackDays * 24 * 60 * 60 * 1000;

    // Gather historical transaction data from PACK 277 (Wallet)
    const historical = await this.getHistoricalData(lookbackStart, now);

    // Get retention metrics from PACK 301
    const retentionMetrics = await this.getRetentionMetrics();

    // Get conversion metrics from PACK 352 (KPI)
    const conversionMetrics = await this.getConversionMetrics();

    // Get traffic growth from PACK 356 (Paid Acquisition)
    const trafficMetrics = await this.getTrafficMetrics();

    return {
      historical,
      avgChurnRate: retentionMetrics.churnRate,
      avgRetentionRate: retentionMetrics.retentionRate,
      avgConversionRate: conversionMetrics.conversionRate,
      avgRevenuePerUser: conversionMetrics.avgRevenuePerUser,
      seasonalityFactor: this.calculateSeasonality(),
      trafficGrowthRate: trafficMetrics.growthRate,
    };
  }

  /**
   * Get historical transaction data
   */
  private async getHistoricalData(
    startTime: number,
    endTime: number
  ): Promise<HistoricalDataPoint[]> {
    const dataPoints: HistoricalDataPoint[] = [];
    const days = Math.ceil((endTime - startTime) / (24 * 60 * 60 * 1000));

    for (let i = 0; i < days; i++) {
      const date = new Date(startTime + i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];

      // Query daily aggregated data
      const snapshot = await this.db
        .collection('analytics')
        .doc('daily')
        .collection('revenue')
        .doc(dateStr)
        .get();

      if (snapshot.exists) {
        const data = snapshot.data()!;
        dataPoints.push({
          date: dateStr,
          revenuePLN: data.revenuePLN || 0,
          payoutsPLN: data.payoutsPLN || 0,
          activeUsers: data.activeUsers || 0,
          newUsers: data.newUsers || 0,
          transactions: data.transactions || 0,
        });
      } else {
        // Fill gaps with zeros
        dataPoints.push({
          date: dateStr,
          revenuePLN: 0,
          payoutsPLN: 0,
          activeUsers: 0,
          newUsers: 0,
          transactions: 0,
        });
      }
    }

    return dataPoints;
  }

  /**
   * Get retention metrics from PACK 301
   */
  private async getRetentionMetrics(): Promise<{
    churnRate: number;
    retentionRate: number;
  }> {
    const snapshot = await this.db
      .collection('analytics')
      .doc('current')
      .collection('retention')
      .doc('metrics')
      .get();

    if (!snapshot.exists) {
      return { churnRate: 0.05, retentionRate: 0.65 }; // Defaults
    }

    const data = snapshot.data()!;
    return {
      churnRate: data.monthlyChurnRate || 0.05,
      retentionRate: data.day30RetentionRate || 0.65,
    };
  }

  /**
   * Get conversion metrics from PACK 352
   */
  private async getConversionMetrics(): Promise<{
    conversionRate: number;
    avgRevenuePerUser: number;
  }> {
    const snapshot = await this.db
      .collection('analytics')
      .doc('current')
      .collection('kpi')
      .doc('conversion')
      .get();

    if (!snapshot.exists) {
      return { conversionRate: 0.03, avgRevenuePerUser: 25 }; // Defaults
    }

    const data = snapshot.data()!;
    return {
      conversionRate: data.installToPayRate || 0.03,
      avgRevenuePerUser: data.arppuPLN || 25,
    };
  }

  /**
   * Get traffic growth metrics from PACK 356
   */
  private async getTrafficMetrics(): Promise<{ growthRate: number }> {
    const snapshot = await this.db
      .collection('analytics')
      .doc('current')
      .collection('acquisition')
      .doc('metrics')
      .get();

    if (!snapshot.exists) {
      return { growthRate: 0.02 }; // Default 2% daily growth
    }

    const data = snapshot.data()!;
    return {
      growthRate: data.dailyGrowthRate || 0.02,
    };
  }

  /**
   * Calculate seasonality factor based on current date
   */
  private calculateSeasonality(): number {
    const now = new Date();
    const month = now.getMonth(); // 0-11

    // Seasonal multipliers (example)
    const seasonality: Record<number, number> = {
      0: 0.95, // January (post-holiday dip)
      1: 1.0, // February
      2: 1.05, // March
      3: 1.0, // April
      4: 1.0, // May
      5: 0.98, // June
      6: 0.95, // July (summer vacation)
      7: 0.95, // August
      8: 1.02, // September (back to school)
      9: 1.03, // October
      10: 1.08, // November (Black Friday)
      11: 1.12, // December (holidays)
    };

    return seasonality[month] || 1.0;
  }

  /**
   * Calculate future forecasts using historical data and trends
   */
  private calculateForecasts(
    inputs: ForecastInputs,
    days: number
  ): RevenueForecast[] {
    const forecasts: RevenueForecast[] = [];
    
    // Calculate baseline from recent historical data
    const recentData = inputs.historical.slice(-7); // Last 7 days
    const avgDailyRevenue = recentData.reduce((sum, d) => sum + d.revenuePLN, 0) / recentData.length;
    const avgDailyPayouts = recentData.reduce((sum, d) => sum + d.payoutsPLN, 0) / recentData.length;

    // Calculate trends
    const revenueTrend = this.calculateTrend(inputs.historical.map(d => d.revenuePLN));
    const payoutTrend = this.calculateTrend(inputs.historical.map(d => d.payoutsPLN));

    for (let i = 1; i <= days; i++) {
      const date = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];

      // Apply growth factors
      const growthFactor = Math.pow(1 + inputs.trafficGrowthRate, i);
      const retentionFactor = 1 - inputs.avgChurnRate * (i / 30); // Monthly churn applied daily
      const seasonalFactor = inputs.seasonalityFactor;

      // Calculate predicted revenue with trend
      const trendFactor = 1 + (revenueTrend * i / 100);
      let predictedRevenue = avgDailyRevenue * growthFactor * retentionFactor * seasonalFactor * trendFactor;

      // Calculate predicted payouts (typically 65-75% of revenue)
      const payoutRatio = avgDailyPayouts / (avgDailyRevenue || 1);
      const payoutTrendFactor = 1 + (payoutTrend * i / 100);
      let predictedPayouts = predictedRevenue * payoutRatio * payoutTrendFactor;

      // Calculate confidence (decreases with time)
      const confidence = Math.max(0.5, 1 - i / (days * 2));

      // Add some realistic variance for far-future predictions
      if (i > 30) {
        const variance = 1 + (Math.random() - 0.5) * 0.1 * (i / days);
        predictedRevenue *= variance;
        predictedPayouts *= variance;
      }

      forecasts.push({
        date: dateStr,
        predictedRevenuePLN: Math.round(predictedRevenue * 100) / 100,
        predictedPayoutsPLN: Math.round(predictedPayouts * 100) / 100,
        predictedGrossProfitPLN: Math.round((predictedRevenue - predictedPayouts) * 100) / 100,
        confidence: Math.round(confidence * 100) / 100,
      });
    }

    return forecasts;
  }

  /**
   * Calculate trend from historical data
   */
  private calculateTrend(data: number[]): number {
    if (data.length < 2) return 0;

    // Simple linear regression slope
    const n = data.length;
    const indices = Array.from({ length: n }, (_, i) => i);
    
    const sumX = indices.reduce((sum, x) => sum + x, 0);
    const sumY = data.reduce((sum, y) => sum + y, 0);
    const sumXY = indices.reduce((sum, x, i) => sum + x * data[i], 0);
    const sumX2 = indices.reduce((sum, x) => sum + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    // Convert to percentage
    const avgValue = sumY / n;
    return avgValue > 0 ? (slope / avgValue) * 100 : 0;
  }

  /**
   * Calculate statistics from forecasts
   */
  private calculateStatistics(forecasts: RevenueForecast[]): {
    p50: number;
    p75: number;
    p90: number;
    totalRevenuePLN: number;
    totalPayoutsPLN: number;
    totalGrossProfitPLN: number;
    avgDailyRevenuePLN: number;
  } {
    const revenues = forecasts.map(f => f.predictedRevenuePLN).sort((a, b) => a - b);
    const n = revenues.length;

    return {
      p50: revenues[Math.floor(n * 0.5)],
      p75: revenues[Math.floor(n * 0.75)],
      p90: revenues[Math.floor(n * 0.9)],
      totalRevenuePLN: forecasts.reduce((sum, f) => sum + f.predictedRevenuePLN, 0),
      totalPayoutsPLN: forecasts.reduce((sum, f) => sum + f.predictedPayoutsPLN, 0),
      totalGrossProfitPLN: forecasts.reduce((sum, f) => sum + f.predictedGrossProfitPLN, 0),
      avgDailyRevenuePLN: revenues.reduce((sum, r) => sum + r, 0) / n,
    };
  }

  /**
   * Save forecast to Firestore
   */
  private async saveForecast(result: ForecastResult): Promise<void> {
    await this.db
      .collection('finance')
      .doc('forecasts')
      .collection(result.timeframe)
      .doc(new Date().toISOString().split('T')[0])
      .set({
        ...result,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    // Also update "latest" document
    await this.db
      .collection('finance')
      .doc('forecasts')
      .collection('latest')
      .doc(result.timeframe)
      .set({
        ...result,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  /**
   * Get number of days for timeframe
   */
  private getDaysForTimeframe(timeframe: ForecastTimeframe): number {
    switch (timeframe) {
      case '30d':
        return 30;
      case '90d':
        return 90;
      case '12m':
        return 365;
      default:
        return 30;
    }
  }
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

const engine = new RevenueForecastEngine();

/**
 * Scheduled function: Generate 30-day forecast daily at 2 AM
 */
export const forecastRevenueNext30Days = functions
  .region('europe-west1')
  .pubsub.schedule('0 2 * * *')
  .timeZone('Europe/Warsaw')
  .onRun(async (context) => {
    console.log('[PACK 358] Generating 30-day revenue forecast');
    
    try {
      const result = await engine.generateForecast('30d');
      console.log('[PACK 358] 30-day forecast generated:', {
        totalRevenue: result.totalRevenuePLN,
        totalProfit: result.totalGrossProfitPLN,
      });
      
      return { success: true };
    } catch (error) {
      console.error('[PACK 358] Error generating 30-day forecast:', error);
      throw error;
    }
  });

/**
 * Scheduled function: Generate 90-day forecast weekly on Monday at 3 AM
 */
export const forecastRevenueNext90Days = functions
  .region('europe-west1')
  .pubsub.schedule('0 3 * * 1')
  .timeZone('Europe/Warsaw')
  .onRun(async (context) => {
    console.log('[PACK 358] Generating 90-day revenue forecast');
    
    try {
      const result = await engine.generateForecast('90d');
      console.log('[PACK 358] 90-day forecast generated:', {
        totalRevenue: result.totalRevenuePLN,
        totalProfit: result.totalGrossProfitPLN,
      });
      
      return { success: true };
    } catch (error) {
      console.error('[PACK 358] Error generating 90-day forecast:', error);
      throw error;
    }
  });

/**
 * Scheduled function: Generate 12-month forecast monthly on 1st at 4 AM
 */
export const forecastRevenueNext12Months = functions
  .region('europe-west1')
  .pubsub.schedule('0 4 1 * *')
  .timeZone('Europe/Warsaw')
  .onRun(async (context) => {
    console.log('[PACK 358] Generating 12-month revenue forecast');
    
    try {
      const result = await engine.generateForecast('12m');
      console.log('[PACK 358] 12-month forecast generated:', {
        totalRevenue: result.totalRevenuePLN,
        totalProfit: result.totalGrossProfitPLN,
      });
      
      return { success: true };
    } catch (error) {
      console.error('[PACK 358] Error generating 12-month forecast:', error);
      throw error;
    }
  });

/**
 * HTTP function: Generate forecast on demand (admin only)
 */
export const generateForecastOnDemand = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    // Verify admin authentication
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can generate forecasts on demand'
      );
    }

    const { timeframe } = data;

    if (!['30d', '90d', '12m'].includes(timeframe)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid timeframe. Must be 30d, 90d, or 12m'
      );
    }

    try {
      const result = await engine.generateForecast(timeframe as ForecastTimeframe);
      return result;
    } catch (error) {
      console.error('[PACK 358] Error generating on-demand forecast:', error);
      throw new functions.https.HttpsError('internal', 'Failed to generate forecast');
    }
  });

/**
 * HTTP function: Get latest forecast (admin only)
 */
export const getLatestForecast = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    // Verify admin authentication
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can view forecasts'
      );
    }

    const { timeframe } = data;

    if (!['30d', '90d', '12m'].includes(timeframe)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid timeframe. Must be 30d, 90d, or 12m'
      );
    }

    try {
      const db = admin.firestore();
      const snapshot = await db
        .collection('finance')
        .doc('forecasts')
        .collection('latest')
        .doc(timeframe)
        .get();

      if (!snapshot.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'No forecast available for this timeframe'
        );
      }

      return snapshot.data();
    } catch (error) {
      console.error('[PACK 358] Error fetching forecast:', error);
      throw new functions.https.HttpsError('internal', 'Failed to fetch forecast');
    }
  });
