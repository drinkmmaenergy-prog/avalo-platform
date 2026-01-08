import * as admin from 'firebase-admin';
import { OfferType } from './dynamicOfferOrchestrator';

export interface GuardrailConfig {
  minARPU: number; // Minimum Average Revenue Per User
  maxDiscountPercent: number; // Maximum allowed discount
  maxRefundRate: number; // Maximum tolerable refund rate
  maxChargebackRate: number; // Maximum tolerable chargeback rate
  frequencyCapDays: number; // Days between offers per user
  minPrice: number; // Absolute minimum price
}

export interface GuardrailCheck {
  approved: boolean;
  reason?: string;
  warnings?: string[];
  adjustedPrice?: number;
}

export class PaywallGuardrailService {
  private db: admin.firestore.Firestore;
  private defaultConfig: GuardrailConfig;

  constructor() {
    this.db = admin.firestore();
    this.defaultConfig = {
      minARPU: 5.0,
      maxDiscountPercent: 50,
      maxRefundRate: 0.05,
      maxChargebackRate: 0.01,
      frequencyCapDays: 30,
      minPrice: 2.99,
    };
  }

  /**
   * Validate an offer against guardrails
   */
  async validateOffer(params: {
    cohort: string;
    region: string;
    price: number;
    discountPercent: number;
    offerType: OfferType;
  }): Promise<GuardrailCheck> {
    const config = await this.getGuardrailConfig(params.region);
    const warnings: string[] = [];

    // Check minimum price
    const discountedPrice = params.price * (1 - params.discountPercent / 100);
    if (discountedPrice < config.minPrice) {
      return {
        approved: false,
        reason: `Discounted price ${discountedPrice} is below minimum ${config.minPrice}`,
      };
    }

    // Check maximum discount
    if (params.discountPercent > config.maxDiscountPercent) {
      return {
        approved: false,
        reason: `Discount ${params.discountPercent}% exceeds maximum ${config.maxDiscountPercent}%`,
      };
    }

    // Check ARPU impact
    const arpuImpact = await this.checkARPUImpact(params.cohort, params.region, discountedPrice);
    if (arpuImpact.currentARPU < config.minARPU) {
      return {
        approved: false,
        reason: `Current ARPU ${arpuImpact.currentARPU} is below minimum ${config.minARPU}`,
      };
    }

    if (arpuImpact.projectedARPU < config.minARPU) {
      warnings.push(
        `Projected ARPU ${arpuImpact.projectedARPU} may fall below minimum ${config.minARPU}`
      );
    }

    // Check refund rate
    const refundCheck = await this.checkRefundRate(params.cohort, params.region);
    if (refundCheck.rate > config.maxRefundRate) {
      return {
        approved: false,
        reason: `Cohort refund rate ${refundCheck.rate} exceeds maximum ${config.maxRefundRate}`,
      };
    }

    // Check chargeback rate
    const chargebackCheck = await this.checkChargebackRate(params.cohort, params.region);
    if (chargebackCheck.rate > config.maxChargebackRate) {
      return {
        approved: false,
        reason: `Cohort chargeback rate ${chargebackCheck.rate} exceeds maximum ${config.maxChargebackRate}`,
      };
    }

    // Check creator payout stability
    const payoutCheck = await this.checkCreatorPayoutStability(params.region, discountedPrice);
    if (!payoutCheck.stable) {
      warnings.push(`Creator payouts may be destabilized: ${payoutCheck.reason}`);
    }

    return {
      approved: true,
      warnings: warnings.length > 0 ? warnings : undefined,
      adjustedPrice: discountedPrice,
    };
  }

  /**
   * Check ARPU impact
   */
  private async checkARPUImpact(
    cohort: string,
    region: string,
    projectedPrice: number
  ): Promise<{
    currentARPU: number;
    projectedARPU: number;
  }> {
    // Get current ARPU from analytics
    const snapshot = await this.db
      .collection('arpu_metrics')
      .where('cohort', '==', cohort)
      .where('region', '==', region)
      .orderBy('timestamp', 'desc')
      .limit(30)
      .get();

    if (snapshot.empty) {
      return {
        currentARPU: 10.0,
        projectedARPU: projectedPrice,
      };
    }

    const totalRevenue = snapshot.docs.reduce((sum, doc) => sum + doc.data().revenue, 0);
    const totalUsers = snapshot.docs.reduce((sum, doc) => sum + doc.data().users, 0);
    const currentARPU = totalUsers > 0 ? totalRevenue / totalUsers : 0;

    // Project new ARPU with discounted price
    const avgConversionRate = 0.05; // 5% baseline
    const projectedNewUsers = totalUsers * avgConversionRate;
    const projectedNewRevenue = projectedNewUsers * projectedPrice;
    const projectedARPU = (totalRevenue + projectedNewRevenue) / (totalUsers + projectedNewUsers);

    return {
      currentARPU,
      projectedARPU,
    };
  }

  /**
   * Check refund rate for cohort/region
   */
  private async checkRefundRate(
    cohort: string,
    region: string
  ): Promise<{ rate: number; count: number }> {
    const thirtyDaysAgo = admin.firestore.Timestamp.fromMillis(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    );

    // Get total transactions
    const transactionsSnapshot = await this.db
      .collection('transactions')
      .where('cohort', '==', cohort)
      .where('region', '==', region)
      .where('timestamp', '>', thirtyDaysAgo)
      .where('type', '==', 'purchase')
      .get();

    // Get refunds
    const refundsSnapshot = await this.db
      .collection('transactions')
      .where('cohort', '==', cohort)
      .where('region', '==', region)
      .where('timestamp', '>', thirtyDaysAgo)
      .where('type', '==', 'refund')
      .get();

    const totalTransactions = transactionsSnapshot.size;
    const refundCount = refundsSnapshot.size;
    const rate = totalTransactions > 0 ? refundCount / totalTransactions : 0;

    return { rate, count: refundCount };
  }

  /**
   * Check chargeback rate for cohort/region
   */
  private async checkChargebackRate(
    cohort: string,
    region: string
  ): Promise<{ rate: number; count: number }> {
    const thirtyDaysAgo = admin.firestore.Timestamp.fromMillis(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    );

    // Get total transactions
    const transactionsSnapshot = await this.db
      .collection('transactions')
      .where('cohort', '==', cohort)
      .where('region', '==', region)
      .where('timestamp', '>', thirtyDaysAgo)
      .where('type', '==', 'purchase')
      .get();

    // Get chargebacks
    const chargebacksSnapshot = await this.db
      .collection('transactions')
      .where('cohort', '==', cohort)
      .where('region', '==', region)
      .where('timestamp', '>', thirtyDaysAgo)
      .where('type', '==', 'chargeback')
      .get();

    const totalTransactions = transactionsSnapshot.size;
    const chargebackCount = chargebacksSnapshot.size;
    const rate = totalTransactions > 0 ? chargebackCount / totalTransactions : 0;

    return { rate, count: chargebackCount };
  }

  /**
   * Check if creator payouts remain stable
   */
  private async checkCreatorPayoutStability(
    region: string,
    projectedPrice: number
  ): Promise<{ stable: boolean; reason?: string }> {
    // Get creator payout configuration from pack325
    const payoutConfig = await this.db
      .collection('creator_payout_config')
      .where('region', '==', region)
      .limit(1)
      .get();

    if (payoutConfig.empty) {
      return { stable: true };
    }

    const config = payoutConfig.docs[0].data();
    const minCreatorShare = config.minCreatorShare || 0.7; // 70% minimum
    const platformFee = config.platformFee || 0.3; // 30% platform

    // Calculate creator share at projected price
    const creatorPayout = projectedPrice * minCreatorShare;
    const minAcceptableCreatorPayout = config.minCreatorPayout || 2.0;

    if (creatorPayout < minAcceptableCreatorPayout) {
      return {
        stable: false,
        reason: `Creator payout ${creatorPayout} below minimum ${minAcceptableCreatorPayout}`,
      };
    }

    return { stable: true };
  }

  /**
   * Get guardrail configuration for region
   */
  private async getGuardrailConfig(region: string): Promise<GuardrailConfig> {
    const doc = await this.db.collection('guardrail_config').doc(region).get();

    if (!doc.exists) {
      return this.defaultConfig;
    }

    return { ...this.defaultConfig, ...doc.data() } as GuardrailConfig;
  }

  /**
   * Update guardrail configuration
   */
  async updateGuardrailConfig(region: string, config: Partial<GuardrailConfig>): Promise<void> {
    await this.db
      .collection('guardrail_config')
      .doc(region)
      .set(config, { merge: true });
  }

  /**
   * Get guardrail metrics for dashboard
   */
  async getGuardrailMetrics(region?: string): Promise<{
    currentARPU: number;
    refundRate: number;
    chargebackRate: number;
    activeOffersCount: number;
    guardrailViolations: number;
  }> {
    const thirtyDaysAgo = admin.firestore.Timestamp.fromMillis(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    );

    // Get ARPU
    let arpuQuery = this.db.collection('arpu_metrics').where('timestamp', '>', thirtyDaysAgo);
    if (region) {
      arpuQuery = arpuQuery.where('region', '==', region);
    }
    const arpuSnapshot = await arpuQuery.limit(30).get();
    const totalRevenue = arpuSnapshot.docs.reduce((sum, doc) => sum + doc.data().revenue, 0);
    const totalUsers = arpuSnapshot.docs.reduce((sum, doc) => sum + doc.data().users, 0);
    const currentARPU = totalUsers > 0 ? totalRevenue / totalUsers : 0;

    // Get refund rate
    let transactionsQuery = this.db
      .collection('transactions')
      .where('timestamp', '>', thirtyDaysAgo)
      .where('type', '==', 'purchase');
    if (region) {
      transactionsQuery = transactionsQuery.where('region', '==', region);
    }
    const transactionsSnapshot = await transactionsQuery.get();

    let refundsQuery = this.db
      .collection('transactions')
      .where('timestamp', '>', thirtyDaysAgo)
      .where('type', '==', 'refund');
    if (region) {
      refundsQuery = refundsQuery.where('region', '==', region);
    }
    const refundsSnapshot = await refundsQuery.get();

    const refundRate =
      transactionsSnapshot.size > 0 ? refundsSnapshot.size / transactionsSnapshot.size : 0;

    // Get chargeback rate
    let chargebacksQuery = this.db
      .collection('transactions')
      .where('timestamp', '>', thirtyDaysAgo)
      .where('type', '==', 'chargeback');
    if (region) {
      chargebacksQuery = chargebacksQuery.where('region', '==', region);
    }
    const chargebacksSnapshot = await chargebacksQuery.get();

    const chargebackRate =
      transactionsSnapshot.size > 0 ? chargebacksSnapshot.size / transactionsSnapshot.size : 0;

    // Get active offers count
    let offersQuery = this.db.collection('dynamic_offers').where('active', '==', true);
    if (region) {
      offersQuery = offersQuery.where('region', '==', region);
    }
    const offersSnapshot = await offersQuery.get();

    // Get guardrail violations
    let violationsQuery = this.db
      .collection('guardrail_violations')
      .where('timestamp', '>', thirtyDaysAgo);
    if (region) {
      violationsQuery = violationsQuery.where('region', '==', region);
    }
    const violationsSnapshot = await violationsQuery.get();

    return {
      currentARPU,
      refundRate,
      chargebackRate,
      activeOffersCount: offersSnapshot.size,
      guardrailViolations: violationsSnapshot.size,
    };
  }

  /**
   * Log guardrail violation
   */
  async logViolation(
    type: string,
    details: Record<string, any>
  ): Promise<void> {
    await this.db.collection('guardrail_violations').add({
      type,
      details,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

export const paywallGuardrailService = new PaywallGuardrailService();
