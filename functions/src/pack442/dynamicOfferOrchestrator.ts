import * as admin from 'firebase-admin';
import { pricingElasticityModel } from './pricingElasticityModel';
import { paywallGuardrailService } from './paywallGuardrailService';
import { getPack299Analytics } from '../pack299/analyticsEngine';

export enum OfferType {
  INTRO_OFFER = 'intro_offer',
  LIMITED_TIME_PROMO = 'limited_time_promo',
  WIN_BACK = 'win_back',
  LOYALTY_REWARD = 'loyalty_reward',
  SEASONAL = 'seasonal',
}

export interface DynamicOffer {
  id: string;
  type: OfferType;
  cohort: string;
  region: string;
  channel: string;
  originalPrice: number;
  discountedPrice: number;
  discountPercent: number;
  startTime: admin.firestore.Timestamp;
  endTime: admin.firestore.Timestamp;
  maxRedemptions?: number;
  currentRedemptions: number;
  active: boolean;
  ltvImpact: number; // Predicted LTV change
  createdAt: admin.firestore.Timestamp;
  metadata?: Record<string, any>;
}

export interface OfferEligibility {
  eligible: boolean;
  offer?: DynamicOffer;
  reason?: string;
  alternativeOffers?: DynamicOffer[];
}

export class DynamicOfferOrchestrator {
  private db: admin.firestore.Firestore;
  private analytics: any;

  constructor() {
    this.db = admin.firestore();
    this.analytics = getPack299Analytics();
  }

  /**
   * Create a new dynamic offer
   */
  async createOffer(
    params: {
      type: OfferType;
      cohort: string;
      region: string;
      channel: string;
      originalPrice: number;
      discountPercent: number;
      durationHours: number;
      maxRedemptions?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<DynamicOffer> {
    // Check guardrails before creating offer
    const guardrailCheck = await paywallGuardrailService.validateOffer({
      cohort: params.cohort,
      region: params.region,
      price: params.originalPrice,
      discountPercent: params.discountPercent,
      offerType: params.type,
    });

    if (!guardrailCheck.approved) {
      throw new Error(`Offer rejected by guardrails: ${guardrailCheck.reason}`);
    }

    // Calculate LTV impact
    const ltvImpact = await this.predictLTVImpact(params);

    if (ltvImpact < -0.1) {
      throw new Error('Offer would erode LTV by more than 10%');
    }

    const discountedPrice = params.originalPrice * (1 - params.discountPercent / 100);
    const now = admin.firestore.Timestamp.now();
    const endTime = new admin.firestore.Timestamp(
      now.seconds + params.durationHours * 3600,
      now.nanoseconds
    );

    const offer: Omit<DynamicOffer, 'id'> = {
      type: params.type,
      cohort: params.cohort,
      region: params.region,
      channel: params.channel,
      originalPrice: params.originalPrice,
      discountedPrice,
      discountPercent: params.discountPercent,
      startTime: now,
      endTime,
      maxRedemptions: params.maxRedemptions,
      currentRedemptions: 0,
      active: true,
      ltvImpact,
      createdAt: now,
      metadata: params.metadata || {},
    };

    const docRef = await this.db.collection('dynamic_offers').add(offer);

    await this.analytics.trackEvent('offer_created', {
      offerId: docRef.id,
      type: params.type,
      cohort: params.cohort,
      region: params.region,
      discountPercent: params.discountPercent,
      ltvImpact,
    });

    return { id: docRef.id, ...offer };
  }

  /**
   * Check if user is eligible for any offers
   */
  async checkOfferEligibility(
    userId: string,
    context: {
      cohort: string;
      region: string;
      channel: string;
    }
  ): Promise<OfferEligibility> {
    // Get user's offer history
    const userHistory = await this.getUserOfferHistory(userId);

    // Check frequency caps
    if (!this.checkFrequencyCap(userHistory)) {
      return {
        eligible: false,
        reason: 'User has reached offer frequency cap',
      };
    }

    // Get active offers for user's cohort/region/channel
    const activeOffers = await this.getActiveOffers(context);

    if (activeOffers.length === 0) {
      return {
        eligible: false,
        reason: 'No active offers available',
      };
    }

    // Find best offer based on LTV impact
    const bestOffer = this.selectBestOffer(activeOffers);

    // Check if user has already redeemed this offer
    if (userHistory.some((h) => h.offerId === bestOffer.id)) {
      return {
        eligible: false,
        reason: 'User has already redeemed this offer',
        alternativeOffers: activeOffers.filter((o) => o.id !== bestOffer.id),
      };
    }

    // Check if offer has reached max redemptions
    if (bestOffer.maxRedemptions && bestOffer.currentRedemptions >= bestOffer.maxRedemptions) {
      return {
        eligible: false,
        reason: 'Offer has reached maximum redemptions',
        alternativeOffers: activeOffers.filter((o) => o.id !== bestOffer.id),
      };
    }

    return {
      eligible: true,
      offer: bestOffer,
      alternativeOffers: activeOffers.filter((o) => o.id !== bestOffer.id),
    };
  }

  /**
   * Redeem an offer for a user
   */
  async redeemOffer(
    userId: string,
    offerId: string
  ): Promise<{ success: boolean; price: number; error?: string }> {
    const offerDoc = await this.db.collection('dynamic_offers').doc(offerId).get();

    if (!offerDoc.exists) {
      return { success: false, price: 0, error: 'Offer not found' };
    }

    const offer = { id: offerDoc.id, ...offerDoc.data() } as DynamicOffer;

    // Validate offer is still active
    if (!offer.active) {
      return { success: false, price: 0, error: 'Offer is no longer active' };
    }

    const now = admin.firestore.Timestamp.now();
    if (now.seconds > offer.endTime.seconds) {
      // Auto-expire offer
      await this.expireOffer(offerId);
      return { success: false, price: 0, error: 'Offer has expired' };
    }

    // Check max redemptions
    if (offer.maxRedemptions && offer.currentRedemptions >= offer.maxRedemptions) {
      await this.expireOffer(offerId);
      return { success: false, price: 0, error: 'Offer has reached maximum redemptions' };
    }

    // Record redemption
    await this.db.collection('offer_redemptions').add({
      userId,
      offerId,
      offerType: offer.type,
      originalPrice: offer.originalPrice,
      discountedPrice: offer.discountedPrice,
      discountPercent: offer.discountPercent,
      cohort: offer.cohort,
      region: offer.region,
      channel: offer.channel,
      redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Increment redemption count
    await this.db
      .collection('dynamic_offers')
      .doc(offerId)
      .update({
        currentRedemptions: admin.firestore.FieldValue.increment(1),
      });

    await this.analytics.trackEvent('offer_redeemed', {
      userId,
      offerId,
      type: offer.type,
      originalPrice: offer.originalPrice,
      discountedPrice: offer.discountedPrice,
    });

    return {
      success: true,
      price: offer.discountedPrice,
    };
  }

  /**
   * Auto-expire offers based on time or LTV erosion
   */
  async autoExpireOffers(): Promise<void> {
    const now = admin.firestore.Timestamp.now();

    // Get active offers
    const snapshot = await this.db
      .collection('dynamic_offers')
      .where('active', '==', true)
      .get();

    for (const doc of snapshot.docs) {
      const offer = { id: doc.id, ...doc.data() } as DynamicOffer;

      let shouldExpire = false;
      let reason = '';

      // Check time expiration
      if (now.seconds > offer.endTime.seconds) {
        shouldExpire = true;
        reason = 'Time expired';
      }

      // Check LTV erosion
      const currentLTVImpact = await this.calculateCurrentLTVImpact(offer);
      if (currentLTVImpact < -0.1) {
        shouldExpire = true;
        reason = 'LTV erosion detected';
      }

      // Check refund rate spike
      const refundRate = await this.getOfferRefundRate(offer.id);
      if (refundRate > 0.05) {
        shouldExpire = true;
        reason = 'High refund rate';
      }

      if (shouldExpire) {
        await this.expireOffer(offer.id, reason);
      }
    }
  }

  /**
   * Expire an offer
   */
  private async expireOffer(offerId: string, reason?: string): Promise<void> {
    await this.db.collection('dynamic_offers').doc(offerId).update({
      active: false,
      expiredAt: admin.firestore.FieldValue.serverTimestamp(),
      expirationReason: reason || 'Manual expiration',
    });

    await this.analytics.trackEvent('offer_expired', {
      offerId,
      reason: reason || 'Manual expiration',
    });
  }

  /**
   * Get active offers for a context
   */
  private async getActiveOffers(context: {
    cohort: string;
    region: string;
    channel: string;
  }): Promise<DynamicOffer[]> {
    const now = admin.firestore.Timestamp.now();

    const snapshot = await this.db
      .collection('dynamic_offers')
      .where('active', '==', true)
      .where('cohort', '==', context.cohort)
      .where('region', '==', context.region)
      .where('channel', '==', context.channel)
      .where('endTime', '>', now)
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as DynamicOffer));
  }

  /**
   * Get user's offer history
   */
  private async getUserOfferHistory(
    userId: string
  ): Promise<Array<{ offerId: string; redeemedAt: admin.firestore.Timestamp }>> {
    const snapshot = await this.db
      .collection('offer_redemptions')
      .where('userId', '==', userId)
      .orderBy('redeemedAt', 'desc')
      .limit(50)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        offerId: data.offerId,
        redeemedAt: data.redeemedAt,
      };
    });
  }

  /**
   * Check frequency cap (max 1 offer per 30 days)
   */
  private checkFrequencyCap(
    history: Array<{ offerId: string; redeemedAt: admin.firestore.Timestamp }>
  ): boolean {
    if (history.length === 0) return true;

    const lastRedemption = history[0].redeemedAt;
    const now = admin.firestore.Timestamp.now();
    const daysSinceLastRedemption = (now.seconds - lastRedemption.seconds) / 86400;

    return daysSinceLastRedemption >= 30;
  }

  /**
   * Select best offer based on LTV impact
   */
  private selectBestOffer(offers: DynamicOffer[]): DynamicOffer {
    return offers.reduce((best, current) =>
      current.ltvImpact > best.ltvImpact ? current : best
    );
  }

  /**
   * Predict LTV impact of an offer
   */
  private async predictLTVImpact(params: {
    cohort: string;
    region: string;
    channel: string;
    originalPrice: number;
    discountPercent: number;
  }): Promise<number> {
    const prediction = await pricingElasticityModel.predictConversionAtPrice(
      {
        cohort: params.cohort,
        region: params.region,
        channel: params.channel,
      },
      params.originalPrice * (1 - params.discountPercent / 100)
    );

    // Simple LTV impact: (new revenue - old revenue) / old revenue
    const oldRevenue = params.originalPrice * prediction.predictedConversionRate;
    const newRevenue = prediction.predictedRevenue;
    
    return oldRevenue > 0 ? (newRevenue - oldRevenue) / oldRevenue : 0;
  }

  /**
   * Calculate current LTV impact based on actual redemptions
   */
  private async calculateCurrentLTVImpact(offer: DynamicOffer): Promise<number> {
    // Get actual metrics for this offer
    const snapshot = await this.db
      .collection('offer_redemptions')
      .where('offerId', '==', offer.id)
      .get();

    if (snapshot.empty) return 0;

    const totalRevenue = snapshot.docs.reduce(
      (sum, doc) => sum + doc.data().discountedPrice,
      0
    );
    const expectedRevenue = snapshot.size * offer.originalPrice;

    return expectedRevenue > 0 ? (totalRevenue - expectedRevenue) / expectedRevenue : 0;
  }

  /**
   * Get refund rate for an offer
   */
  private async getOfferRefundRate(offerId: string): Promise<number> {
    const redemptionsSnapshot = await this.db
      .collection('offer_redemptions')
      .where('offerId', '==', offerId)
      .get();

    if (redemptionsSnapshot.empty) return 0;

    // Check refunds from pack277 wallet system
    let refundCount = 0;
    for (const doc of redemptionsSnapshot.docs) {
      const refundSnapshot = await this.db
        .collection('transactions')
        .where('userId', '==', doc.data().userId)
        .where('type', '==', 'refund')
        .where('metadata.offerId', '==', offerId)
        .get();

      refundCount += refundSnapshot.size;
    }

    return refundCount / redemptionsSnapshot.size;
  }

  /**
   * Get offer performance metrics
   */
  async getOfferMetrics(offerId: string): Promise<{
    redemptions: number;
    revenue: number;
    refundRate: number;
    ltvImpact: number;
    avgDiscountedPrice: number;
  }> {
    const offerDoc = await this.db.collection('dynamic_offers').doc(offerId).get();
    if (!offerDoc.exists) {
      throw new Error('Offer not found');
    }

    const offer = { id: offerDoc.id, ...offerDoc.data() } as DynamicOffer;

    const redemptionsSnapshot = await this.db
      .collection('offer_redemptions')
      .where('offerId', '==', offerId)
      .get();

    const redemptions = redemptionsSnapshot.size;
    const revenue = redemptionsSnapshot.docs.reduce(
      (sum, doc) => sum + doc.data().discountedPrice,
      0
    );
    const refundRate = await this.getOfferRefundRate(offerId);
    const ltvImpact = await this.calculateCurrentLTVImpact(offer);

    return {
      redemptions,
      revenue,
      refundRate,
      ltvImpact,
      avgDiscountedPrice: redemptions > 0 ? revenue / redemptions : 0,
    };
  }
}

export const dynamicOfferOrchestrator = new DynamicOfferOrchestrator();
