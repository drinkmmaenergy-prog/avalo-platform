import * as admin from 'firebase-admin';
import { pricingElasticityModel } from './pricingElasticityModel';
import { dynamicOfferOrchestrator } from './dynamicOfferOrchestrator';
import { paywallGuardrailService } from './paywallGuardrailService';
import { regionalPriceComplianceAdapter } from './regionalPriceComplianceAdapter';

export interface ElasticityCurveData {
  cohort: string;
  region: string;
  dataPoints: Array<{
    price: number;
    demand: number;
    revenue: number;
    ltv: number;
  }>;
  optimalPrice: number;
  elasticity: number;
}

export interface PromoROI {
  offerId: string;
  offerType: string;
  totalRedemptions: number;
  grossRevenue: number;
  refundLoss: number;
  fraudLoss: number;
  netRevenue: number;
  roi: number;
  ltvImpact: number;
}

export interface PriceHeatmap {
  cohorts: string[];
  regions: string[];
  data: Array<{
    cohort: string;
    region: string;
    revenue: number;
    ltv: number;
    conversionRate: number;
    optimalPrice: number;
  }>;
}

export interface DashboardMetrics {
  overview: {
    totalRevenue: number;
    averageARPU: number;
    activeOffers: number;
    guardrailViolations: number;
  };
  elasticity: ElasticityCurveData[];
  promoPerformance: PromoROI[];
  heatmap: PriceHeatmap;
  alerts: Array<{
    severity: 'critical' | 'warning' | 'info';
    message: string;
    timestamp: admin.firestore.Timestamp;
  }>;
}

export class PricingIntelligenceDashboard {
  private db: admin.firestore.Firestore;

  constructor() {
    this.db = admin.firestore();
  }

  /**
   * Get comprehensive dashboard metrics (Admin-only, read-only)
   */
  async getDashboardMetrics(
    adminId: string,
    timeRange: { start: Date; end: Date } = {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      end: new Date(),
    }
  ): Promise<DashboardMetrics> {
    // Verify admin access
    await this.verifyAdminAccess(adminId);

    // Get all metrics in parallel
    const [overview, elasticity, promoPerformance, heatmap, alerts] = await Promise.all([
      this.getOverviewMetrics(timeRange),
      this.getElasticityCurves(timeRange),
      this.getPromoPerformance(timeRange),
      this.getPriceHeatmap(timeRange),
      this.getAlerts(timeRange),
    ]);

    return {
      overview,
      elasticity,
      promoPerformance,
      heatmap,
      alerts,
    };
  }

  /**
   * Get overview metrics
   */
  private async getOverviewMetrics(timeRange: {
    start: Date;
    end: Date;
  }): Promise<DashboardMetrics['overview']> {
    const startTimestamp = admin.firestore.Timestamp.fromDate(timeRange.start);
    const endTimestamp = admin.firestore.Timestamp.fromDate(timeRange.end);

    // Get total revenue
    const transactionsSnapshot = await this.db
      .collection('transactions')
      .where('timestamp', '>=', startTimestamp)
      .where('timestamp', '<=', endTimestamp)
      .where('type', '==', 'purchase')
      .get();

    const totalRevenue = transactionsSnapshot.docs.reduce(
      (sum, doc) => sum + (doc.data().amount || 0),
      0
    );

    // Get ARPU
    const arpuMetrics = await paywallGuardrailService.getGuardrailMetrics();

    // Get active offers
    const activeOffersSnapshot = await this.db
      .collection('dynamic_offers')
      .where('active', '==', true)
      .get();

    return {
      totalRevenue,
      averageARPU: arpuMetrics.currentARPU,
      activeOffers: activeOffersSnapshot.size,
      guardrailViolations: arpuMetrics.guardrailViolations,
    };
  }

  /**
   * Get elasticity curves for visualization
   */
  private async getElasticityCurves(timeRange: {
    start: Date;
    end: Date;
  }): Promise<ElasticityCurveData[]> {
    // Get unique cohort/region combinations
    const combinations = await this.getUniqueCohortRegionCombinations();

    const elasticityCurves: ElasticityCurveData[] = [];

    for (const combo of combinations) {
      const curveData = await pricingElasticityModel.getElasticityCurve({
        cohort: combo.cohort,
        region: combo.region,
        channel: combo.channel,
      });

      const sensitivity = await pricingElasticityModel.calculatePriceSensitivity({
        cohort: combo.cohort,
        region: combo.region,
        channel: combo.channel,
      });

      elasticityCurves.push({
        cohort: combo.cohort,
        region: combo.region,
        dataPoints: curveData.map((point) => ({
          price: point.price,
          demand: point.demand,
          revenue: point.revenue,
          ltv: point.revenue / Math.max(point.demand, 1),
        })),
        optimalPrice: sensitivity.optimalPrice,
        elasticity: sensitivity.elasticity,
      });
    }

    return elasticityCurves;
  }

  /**
   * Get promo performance with fraud adjustment
   */
  private async getPromoPerformance(timeRange: {
    start: Date;
    end: Date;
  }): Promise<PromoROI[]> {
    const startTimestamp = admin.firestore.Timestamp.fromDate(timeRange.start);
    const endTimestamp = admin.firestore.Timestamp.fromDate(timeRange.end);

    // Get all offers in time range
    const offersSnapshot = await this.db
      .collection('dynamic_offers')
      .where('createdAt', '>=', startTimestamp)
      .where('createdAt', '<=', endTimestamp)
      .get();

    const promoROIs: PromoROI[] = [];

    for (const offerDoc of offersSnapshot.docs) {
      const offer = offerDoc.data();
      const offerId = offerDoc.id;

      // Get offer metrics
      const metrics = await dynamicOfferOrchestrator.getOfferMetrics(offerId);

      // Get fraud losses (from pack437/pack441)
      const fraudLoss = await this.calculateFraudLoss(offerId);

      // Calculate ROI
      const costOfDiscount =
        metrics.redemptions * (offer.originalPrice - offer.discountedPrice);
      const netRevenue = metrics.revenue - metrics.revenue * metrics.refundRate - fraudLoss;
      const roi = costOfDiscount > 0 ? (netRevenue - costOfDiscount) / costOfDiscount : 0;

      promoROIs.push({
        offerId,
        offerType: offer.type,
        totalRedemptions: metrics.redemptions,
        grossRevenue: metrics.revenue,
        refundLoss: metrics.revenue * metrics.refundRate,
        fraudLoss,
        netRevenue,
        roi,
        ltvImpact: metrics.ltvImpact,
      });
    }

    return promoROIs;
  }

  /**
   * Get price heatmap for LTV vs price visualization
   */
  private async getPriceHeatmap(timeRange: {
    start: Date;
    end: Date;
  }): Promise<PriceHeatmap> {
    const combinations = await this.getUniqueCohortRegionCombinations();

    const cohorts = [...new Set(combinations.map((c) => c.cohort))];
    const regions = [...new Set(combinations.map((c) => c.region))];

    const data: PriceHeatmap['data'] = [];

    for (const combo of combinations) {
      const metrics = await this.getCohortRegionMetrics(combo.cohort, combo.region, timeRange);
      const sensitivity = await pricingElasticityModel.calculatePriceSensitivity({
        cohort: combo.cohort,
        region: combo.region,
        channel: combo.channel,
      });

      data.push({
        cohort: combo.cohort,
        region: combo.region,
        revenue: metrics.revenue,
        ltv: metrics.ltv,
        conversionRate: metrics.conversionRate,
        optimalPrice: sensitivity.optimalPrice,
      });
    }

    return {
      cohorts,
      regions,
      data,
    };
  }

  /**
   * Get alerts for dashboard
   */
  private async getAlerts(timeRange: {
    start: Date;
    end: Date;
  }): Promise<DashboardMetrics['alerts']> {
    const alerts: DashboardMetrics['alerts'] = [];

    // Check guardrail violations
    const violationsSnapshot = await this.db
      .collection('guardrail_violations')
      .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(timeRange.start))
      .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(timeRange.end))
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();

    violationsSnapshot.forEach((doc) => {
      const data = doc.data();
      alerts.push({
        severity: 'critical',
        message: `Guardrail violation: ${data.type} - ${JSON.stringify(data.details)}`,
        timestamp: data.timestamp,
      });
    });

    // Check for high refund rates
    const guardrailMetrics = await paywallGuardrailService.getGuardrailMetrics();
    if (guardrailMetrics.refundRate > 0.05) {
      alerts.push({
        severity: 'warning',
        message: `High refund rate detected: ${(guardrailMetrics.refundRate * 100).toFixed(2)}%`,
        timestamp: admin.firestore.Timestamp.now(),
      });
    }

    // Check for low ARPU
    if (guardrailMetrics.currentARPU < 5.0) {
      alerts.push({
        severity: 'warning',
        message: `ARPU below minimum threshold: $${guardrailMetrics.currentARPU.toFixed(2)}`,
        timestamp: admin.firestore.Timestamp.now(),
      });
    }

    // Check for expired offers with poor performance
    const recentOffers = await this.db
      .collection('dynamic_offers')
      .where('active', '==', false)
      .where('expiredAt', '>=', admin.firestore.Timestamp.fromDate(timeRange.start))
      .get();

    for (const doc of recentOffers.docs) {
      const offer = doc.data();
      if (offer.expirationReason === 'LTV erosion detected') {
        alerts.push({
          severity: 'critical',
          message: `Offer ${doc.id} expired due to LTV erosion`,
          timestamp: offer.expiredAt,
        });
      }
    }

    return alerts.sort((a, b) => b.timestamp.seconds - a.timestamp.seconds);
  }

  /**
   * Export dashboard data to CSV/JSON
   */
  async exportDashboardData(
    adminId: string,
    format: 'csv' | 'json',
    timeRange?: { start: Date; end: Date }
  ): Promise<string> {
    await this.verifyAdminAccess(adminId);

    const metrics = await this.getDashboardMetrics(adminId, timeRange);

    if (format === 'json') {
      return JSON.stringify(metrics, null, 2);
    }

    // Convert to CSV
    let csv = 'Pricing Intelligence Dashboard Export\n\n';

    // Overview
    csv += 'Overview Metrics\n';
    csv += 'Metric,Value\n';
    csv += `Total Revenue,${metrics.overview.totalRevenue}\n`;
    csv += `Average ARPU,${metrics.overview.averageARPU}\n`;
    csv += `Active Offers,${metrics.overview.activeOffers}\n`;
    csv += `Guardrail Violations,${metrics.overview.guardrailViolations}\n\n`;

    // Promo Performance
    csv += 'Promo Performance\n';
    csv += 'Offer ID,Type,Redemptions,Gross Revenue,Net Revenue,ROI,LTV Impact\n';
    metrics.promoPerformance.forEach((promo) => {
      csv += `${promo.offerId},${promo.offerType},${promo.totalRedemptions},${promo.grossRevenue},${promo.netRevenue},${promo.roi},${promo.ltvImpact}\n`;
    });

    return csv;
  }

  /**
   * Get unique cohort/region combinations
   */
  private async getUniqueCohortRegionCombinations(): Promise<
    Array<{ cohort: string; region: string; channel: string }>
  > {
    const snapshot = await this.db
      .collection('pricing_history')
      .orderBy('timestamp', 'desc')
      .limit(1000)
      .get();

    const combinations = new Map<string, { cohort: string; region: string; channel: string }>();

    snapshot.forEach((doc) => {
      const data = doc.data();
      const key = `${data.cohort}_${data.region}_${data.channel}`;
      if (!combinations.has(key)) {
        combinations.set(key, {
          cohort: data.cohort,
          region: data.region,
          channel: data.channel,
        });
      }
    });

    return Array.from(combinations.values());
  }

  /**
   * Get metrics for cohort/region combination
   */
  private async getCohortRegionMetrics(
    cohort: string,
    region: string,
    timeRange: { start: Date; end: Date }
  ): Promise<{
    revenue: number;
    ltv: number;
    conversionRate: number;
  }> {
    const startTimestamp = admin.firestore.Timestamp.fromDate(timeRange.start);
    const endTimestamp = admin.firestore.Timestamp.fromDate(timeRange.end);

    const snapshot = await this.db
      .collection('transactions')
      .where('cohort', '==', cohort)
      .where('region', '==', region)
      .where('timestamp', '>=', startTimestamp)
      .where('timestamp', '<=', endTimestamp)
      .where('type', '==', 'purchase')
      .get();

    const revenue = snapshot.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
    const conversions = snapshot.size;
    const ltv = conversions > 0 ? revenue / conversions : 0;

    return {
      revenue,
      ltv,
      conversionRate: conversions / 1000, // Placeholder, would need total impressions
    };
  }

  /**
   * Calculate fraud loss for an offer
   */
  private async calculateFraudLoss(offerId: string): Promise<number> {
    // Check fraud detection from pack437/pack441
    const fraudSnapshot = await this.db
      .collection('fraud_detections')
      .where('metadata.offerId', '==', offerId)
      .get();

    return fraudSnapshot.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
  }

  /**
   * Verify admin access
   */
  private async verifyAdminAccess(adminId: string): Promise<void> {
    const adminDoc = await this.db.collection('admins').doc(adminId).get();

    if (!adminDoc.exists) {
      throw new Error('Unauthorized: Admin access required');
    }

    const adminData = adminDoc.data();
    if (!adminData?.permissions?.includes('pricing_intelligence')) {
      throw new Error('Unauthorized: Insufficient permissions');
    }
  }

  /**
   * Get real-time pricing recommendations
   */
  async getPricingRecommendations(adminId: string): Promise<
    Array<{
      cohort: string;
      region: string;
      currentPrice: number;
      recommendedPrice: number;
      expectedLTVIncrease: number;
      confidence: number;
      reason: string;
    }>
  > {
    await this.verifyAdminAccess(adminId);

    const combinations = await this.getUniqueCohortRegionCombinations();
    const recommendations: any[] = [];

    for (const combo of combinations) {
      const sensitivity = await pricingElasticityModel.calculatePriceSensitivity({
        cohort: combo.cohort,
        region: combo.region,
        channel: combo.channel,
      });

      // Get current price from recent history
      const recentPricing = await this.db
        .collection('pricing_history')
        .where('cohort', '==', combo.cohort)
        .where('region', '==', combo.region)
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get();

      if (recentPricing.empty) continue;

      const currentPrice = recentPricing.docs[0].data().price;
      const priceDiff = Math.abs(currentPrice - sensitivity.optimalPrice);

      // Only recommend if difference is significant and confidence is high
      if (priceDiff > 1.0 && sensitivity.confidence > 0.6) {
        const ltvIncrease = ((sensitivity.optimalPrice - currentPrice) / currentPrice) * 100;

        recommendations.push({
          cohort: combo.cohort,
          region: combo.region,
          currentPrice,
          recommendedPrice: sensitivity.optimalPrice,
          expectedLTVIncrease: ltvIncrease,
          confidence: sensitivity.confidence,
          reason:
            currentPrice < sensitivity.optimalPrice
              ? 'Price is below optimal, room to increase'
              : 'Price is above optimal, consider decreasing',
        });
      }
    }

    return recommendations;
  }
}

export const pricingIntelligenceDashboard = new PricingIntelligenceDashboard();
