/**
 * PACK 358 — Burn Rate Calculation Engine
 * 
 * Tracks operational costs and calculates burn rate
 * Integrates infrastructure, marketing, support, and moderation costs
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type BurnRateSnapshot = {
  monthlyInfraCostPLN: number;
  marketingCostPLN: number;
  supportCostPLN: number;
  moderationCostPLN: number;
  paymentProcessingCostPLN: number;
  storeFeesCostPLN: number;
  totalBurnPLN: number;
  netProfitPLN: number;
  profitMargin: number; // Percentage
  monthYear: string; // YYYY-MM
  calculatedAt: string;
};

export type CostBreakdown = {
  firebase: number;
  cloudFunctions: number;
  storage: number;
  bandwidth: number;
  database: number;
  other: number;
};

export type MarketingCostBreakdown = {
  facebook: number;
  google: number;
  tiktok: number;
  influencer: number;
  other: number;
};

// ============================================================================
// BURN RATE ENGINE
// ============================================================================

class BurnRateEngine {
  private db: FirebaseFirestore.Firestore;

  constructor() {
    this.db = admin.firestore();
  }

  /**
   * Calculate monthly burn rate snapshot
   */
  async calculateMonthlyBurnRate(year: number, month: number): Promise<BurnRateSnapshot> {
    const monthYear = `${year}-${String(month).padStart(2, '0')}`;
    
    console.log(`[PACK 358] Calculating burn rate for ${monthYear}`);

    // Get all cost components
    const infraCost = await this.calculateInfraCost(year, month);
    const marketingCost = await this.calculateMarketingCost(year, month);
    const supportCost = await this.calculateSupportCost(year, month);
    const moderationCost = await this.calculateModerationCost(year, month);
    const paymentProcessingCost = await this.calculatePaymentProcessingCost(year, month);
    const storeFees = await this.calculateStoreFees(year, month);

    // Get revenue for the month
    const revenue = await this.getMonthlyRevenue(year, month);

    // Calculate totals
    const totalBurn = 
      infraCost + 
      marketingCost + 
      supportCost + 
      moderationCost + 
      paymentProcessingCost + 
      storeFees;

    const netProfit = revenue - totalBurn;
    const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    const snapshot: BurnRateSnapshot = {
      monthlyInfraCostPLN: Math.round(infraCost * 100) / 100,
      marketingCostPLN: Math.round(marketingCost * 100) / 100,
      supportCostPLN: Math.round(supportCost * 100) / 100,
      moderationCostPLN: Math.round(moderationCost * 100) / 100,
      paymentProcessingCostPLN: Math.round(paymentProcessingCost * 100) / 100,
      storeFeesCostPLN: Math.round(storeFees * 100) / 100,
      totalBurnPLN: Math.round(totalBurn * 100) / 100,
      netProfitPLN: Math.round(netProfit * 100) / 100,
      profitMargin: Math.round(profitMargin * 100) / 100,
      monthYear,
      calculatedAt: new Date().toISOString(),
    };

    // Save to Firestore
    await this.saveBurnRateSnapshot(snapshot);

    // Check for alerts
    await this.checkBurnRateAlerts(snapshot, revenue);

    return snapshot;
  }

  /**
   * Calculate infrastructure costs (Firebase, Cloud, Storage)
   */
  private async calculateInfraCost(year: number, month: number): Promise<number> {
    const monthYear = `${year}-${String(month).padStart(2, '0')}`;

    // Try to get from billing data
    const billingDoc = await this.db
      .collection('finance')
      .doc('infrastructure')
      .collection('billing')
      .doc(monthYear)
      .get();

    if (billingDoc.exists) {
      const data = billingDoc.data()!;
      return (
        (data.firebaseCost || 0) +
        (data.cloudFunctionsCost || 0) +
        (data.storageCost || 0) +
        (data.bandwidthCost || 0) +
        (data.databaseCost || 0) +
        (data.otherCost || 0)
      );
    }

    // Fallback: estimate based on user count
    const userCount = await this.getMonthlyActiveUsers(year, month);
    
    // Cost estimation model (PLN)
    const baseCost = 500; // Base Firebase plan
    const costPerUser = 0.05; // ~0.05 PLN per active user
    const estimatedCost = baseCost + userCount * costPerUser;

    return estimatedCost;
  }

  /**
   * Calculate marketing costs from PACK 356
   */
  private async calculateMarketingCost(year: number, month: number): Promise<number> {
    const monthYear = `${year}-${String(month).padStart(2, '0')}`;

    // Query marketing spend from PACK 356
    const campaignsSnapshot = await this.db
      .collection('marketing')
      .doc('campaigns')
      .collection('monthly')
      .doc(monthYear)
      .get();

    if (campaignsSnapshot.exists) {
      const data = campaignsSnapshot.data()!;
      return (
        (data.facebookSpendPLN || 0) +
        (data.googleSpendPLN || 0) +
        (data.tiktokSpendPLN || 0) +
        (data.influencerSpendPLN || 0) +
        (data.otherSpendPLN || 0)
      );
    }

    return 0;
  }

  /**
   * Calculate support costs from PACK 300A
   */
  private async calculateSupportCost(year: number, month: number): Promise<number> {
    const monthYear = `${year}-${String(month).padStart(2, '0')}`;

    // Query support metrics
    const supportDoc = await this.db
      .collection('support')
      .doc('metrics')
      .collection('monthly')
      .doc(monthYear)
      .get();

    if (supportDoc.exists) {
      const data = supportDoc.data()!;
      const ticketCount = data.resolvedTickets || 0;
      const avgTimeMinutes = data.avgResolutionTimeMinutes || 10;
      
      // Cost per minute of support (assuming PLN 2/minute)
      const costPerMinute = 2;
      return ticketCount * avgTimeMinutes * costPerMinute;
    }

    // Fallback estimate
    const userCount = await this.getMonthlyActiveUsers(year, month);
    const supportCostPerUser = 0.2; // ~0.2 PLN per active user per month
    return userCount * supportCostPerUser;
  }

  /**
   * Calculate moderation costs from PACK 280+
   */
  private async calculateModerationCost(year: number, month: number): Promise<number> {
    const monthYear = `${year}-${String(month).padStart(2, '0')}`;

    // Query moderation actions
    const moderationDoc = await this.db
      .collection('moderation')
      .doc('actions')
      .collection('monthly')
      .doc(monthYear)
      .get();

    if (moderationDoc.exists) {
      const data = moderationDoc.data()!;
      const manualReviews = data.manualReviews || 0;
      const aiReviews = data.aiReviews || 0;
      
      // Cost per review
      const manualCostPerReview = 5; // PLN
      const aiCostPerReview = 0.1; // PLN
      
      return manualReviews * manualCostPerReview + aiReviews * aiCostPerReview;
    }

    // Fallback estimate
    const userCount = await this.getMonthlyActiveUsers(year, month);
    const moderationCostPerUser = 0.15; // ~0.15 PLN per active user per month
    return userCount * moderationCostPerUser;
  }

  /**
   * Calculate payment processing costs (Stripe fees)
   */
  private async calculatePaymentProcessingCost(year: number, month: number): Promise<number> {
    const revenue = await this.getMonthlyRevenue(year, month);
    
    // Stripe fees: 2.9% + 0.30 PLN per transaction
    const stripePercentageFee = 0.029;
    const transactions = await this.getMonthlyTransactionCount(year, month);
    const stripeFixedFee = 0.30;

    return revenue * stripePercentageFee + transactions * stripeFixedFee;
  }

  /**
   * Calculate App Store / Play Store fees
   */
  private async calculateStoreFees(year: number, month: number): Promise<number> {
    // Query in-app purchases from wallet
    const monthYear = `${year}-${String(month).padStart(2, '0')}`;
    
    const iapDoc = await this.db
      .collection('analytics')
      .doc('revenue')
      .collection('monthly')
      .doc(monthYear)
      .get();

    if (iapDoc.exists) {
      const data = iapDoc.data()!;
      const iapRevenuePLN = data.iapRevenuePLN || 0;
      
      // Apple/Google take 15-30% (assume 20% average after small business program)
      const storeFeePercentage = 0.20;
      return iapRevenuePLN * storeFeePercentage;
    }

    return 0;
  }

  /**
   * Get monthly revenue from PACK 277
   */
  private async getMonthlyRevenue(year: number, month: number): Promise<number> {
    const monthYear = `${year}-${String(month).padStart(2, '0')}`;
    
    const revenueDoc = await this.db
      .collection('analytics')
      .doc('revenue')
      .collection('monthly')
      .doc(monthYear)
      .get();

    if (revenueDoc.exists) {
      return revenueDoc.data()!.totalRevenuePLN || 0;
    }

    return 0;
  }

  /**
   * Get monthly transaction count
   */
  private async getMonthlyTransactionCount(year: number, month: number): Promise<number> {
    const monthYear = `${year}-${String(month).padStart(2, '0')}`;
    
    const revenueDoc = await this.db
      .collection('analytics')
      .doc('revenue')
      .collection('monthly')
      .doc(monthYear)
      .get();

    if (revenueDoc.exists) {
      return revenueDoc.data()!.transactions || 0;
    }

    return 0;
  }

  /**
   * Get monthly active users
   */
  private async getMonthlyActiveUsers(year: number, month: number): Promise<number> {
    const monthYear = `${year}-${String(month).padStart(2, '0')}`;
    
    const usersDoc = await this.db
      .collection('analytics')
      .doc('users')
      .collection('monthly')
      .doc(monthYear)
      .get();

    if (usersDoc.exists) {
      return usersDoc.data()!.mau || 0;
    }

    return 0;
  }

  /**
   * Save burn rate snapshot
   */
  private async saveBurnRateSnapshot(snapshot: BurnRateSnapshot): Promise<void> {
    await this.db
      .collection('finance')
      .doc('burnrate')
      .collection('monthly')
      .doc(snapshot.monthYear)
      .set({
        ...snapshot,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    // Also update "latest" document
    await this.db
      .collection('finance')
      .doc('burnrate')
      .set({
        latest: snapshot,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
  }

  /**
   * Check for burn rate alerts
   */
  private async checkBurnRateAlerts(
    snapshot: BurnRateSnapshot,
    revenue: number
  ): Promise<void> {
    const alerts: string[] = [];

    // Alert: Profit margin < 15%
    if (snapshot.profitMargin < 15) {
      alerts.push('PROFIT_MARGIN_LOW');
      await this.createAlert({
        type: 'PROFIT_MARGIN_LOW',
        severity: 'high',
        message: `Profit margin is ${snapshot.profitMargin.toFixed(2)}% (below 15% threshold)`,
        data: { profitMargin: snapshot.profitMargin },
      });
    }

    // Alert: Burn > Revenue for extended period
    if (snapshot.netProfitPLN < 0) {
      const consecutiveLosses = await this.countConsecutiveNegativeMonths();
      if (consecutiveLosses >= 3) {
        alerts.push('CONSECUTIVE_LOSSES');
        await this.createAlert({
          type: 'CONSECUTIVE_LOSSES',
          severity: 'critical',
          message: `${consecutiveLosses} consecutive months of losses`,
          data: { consecutiveLosses, currentLoss: snapshot.netProfitPLN },
        });
      }
    }

    // Alert: Marketing cost > 50% of revenue
    if (revenue > 0 && (snapshot.marketingCostPLN / revenue) > 0.5) {
      alerts.push('MARKETING_COST_HIGH');
      await this.createAlert({
        type: 'MARKETING_COST_HIGH',
        severity: 'medium',
        message: 'Marketing costs exceed 50% of revenue',
        data: { 
          marketingCost: snapshot.marketingCostPLN,
          revenue,
          percentage: (snapshot.marketingCostPLN / revenue) * 100,
        },
      });
    }

    if (alerts.length > 0) {
      console.log('[PACK 358] Burn rate alerts triggered:', alerts);
    }
  }

  /**
   * Count consecutive months with negative profit
   */
  private async countConsecutiveNegativeMonths(): Promise<number> {
    const snapshot = await this.db
      .collection('finance')
      .doc('burnrate')
      .collection('monthly')
      .orderBy('monthYear', 'desc')
      .limit(12)
      .get();

    let count = 0;
    for (const doc of snapshot.docs) {
      const data = doc.data() as BurnRateSnapshot;
      if (data.netProfitPLN < 0) {
        count++;
      } else {
        break; // Stop at first positive month
      }
    }

    return count;
  }

  /**
   * Create financial alert
   */
  private async createAlert(alert: {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    data: any;
  }): Promise<void> {
    await this.db
      .collection('finance')
      .doc('alerts')
      .collection('active')
      .add({
        ...alert,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        resolved: false,
      });
  }

  /**
   * Calculate runway (days until cash zero)
   */
  async calculateRunway(currentCashPLN: number): Promise<number> {
    // Get average daily burn from last 3 months
    const now = new Date();
    const burns: number[] = [];

    for (let i = 0; i < 3; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const monthYear = `${year}-${String(month).padStart(2, '0')}`;

      const snapshot = await this.db
        .collection('finance')
        .doc('burnrate')
        .collection('monthly')
        .doc(monthYear)
        .get();

      if (snapshot.exists) {
        const data = snapshot.data() as BurnRateSnapshot;
        burns.push(data.totalBurnPLN);
      }
    }

    if (burns.length === 0) return Infinity;

    const avgMonthlyBurn = burns.reduce((sum, b) => sum + b, 0) / burns.length;
    const avgDailyBurn = avgMonthlyBurn / 30;

    if (avgDailyBurn <= 0) return Infinity;

    return Math.floor(currentCashPLN / avgDailyBurn);
  }
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

const engine = new BurnRateEngine();

/**
 * Scheduled function: Calculate burn rate on 1st of each month at 3 AM
 */
export const calculateMonthlyBurnRate = functions
  .region('europe-west1')
  .pubsub.schedule('0 3 1 * *')
  .timeZone('Europe/Warsaw')
  .onRun(async (context) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // Previous month (0-11)
    
    console.log('[PACK 358] Calculating burn rate for previous month');
    
    try {
      const snapshot = await engine.calculateMonthlyBurnRate(year, month);
      console.log('[PACK 358] Burn rate calculated:', {
        month: snapshot.monthYear,
        burn: snapshot.totalBurnPLN,
        profit: snapshot.netProfitPLN,
        margin: snapshot.profitMargin,
      });
      
      return { success: true };
    } catch (error) {
      console.error('[PACK 358] Error calculating burn rate:', error);
      throw error;
    }
  });

/**
 * HTTP function: Calculate burn rate on demand (admin only)
 */
export const calculateBurnRateOnDemand = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    // Verify admin authentication
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can calculate burn rate'
      );
    }

    const { year, month } = data;

    if (!year || !month || month < 1 || month > 12) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Valid year and month (1-12) required'
      );
    }

    try {
      const snapshot = await engine.calculateMonthlyBurnRate(year, month);
      return snapshot;
    } catch (error) {
      console.error('[PACK 358] Error calculating burn rate:', error);
      throw new functions.https.HttpsError('internal', 'Failed to calculate burn rate');
    }
  });

/**
 * HTTP function: Get runway calculation (admin only)
 */
export const getFinancialRunway = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    // Verify admin authentication
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can view runway'
      );
    }

    const { currentCashPLN } = data;

    if (!currentCashPLN || currentCashPLN < 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Valid current cash amount required'
      );
    }

    try {
      const runwayDays = await engine.calculateRunway(currentCashPLN);
      
      return {
        runwayDays,
        runwayMonths: Math.floor(runwayDays / 30),
        currentCashPLN,
        calculatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[PACK 358] Error calculating runway:', error);
      throw new functions.https.HttpsError('internal', 'Failed to calculate runway');
    }
  });

/**
 * HTTP function: Get burn rate history (admin only)
 */
export const getBurnRateHistory = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    // Verify admin authentication
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can view burn rate history'
      );
    }

    const { months = 12 } = data;

    try {
      const db = admin.firestore();
      const snapshot = await db
        .collection('finance')
        .doc('burnrate')
        .collection('monthly')
        .orderBy('monthYear', 'desc')
        .limit(months)
        .get();

      const history = snapshot.docs.map(doc => doc.data());

      return { history };
    } catch (error) {
      console.error('[PACK 358] Error fetching burn rate history:', error);
      throw new functions.https.HttpsError('internal', 'Failed to fetch history');
    }
  });
