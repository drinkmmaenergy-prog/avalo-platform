/**
 * PACK 349 - Real-Time Ad Billing Engine
 * Token-based spending system for ads
 */

import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  AvaloAd,
  BrandCampaign,
  AdPlacement,
  AdConversion,
  AdStats,
  AD_CONSTANTS,
} from './pack349-types';

export class AdBillingEngine {
  /**
   * Spend tokens for ad interaction
   * This is the main billing function called on every billable event
   */
  static async spendTokens(
    advertiserId: string,
    amount: number,
    reason: 'impression' | 'click' | 'view' | 'conversion',
    metadata: {
      adId: string;
      campaignId?: string;
      placementId: string;
      userId: string;
      countryCode: string;
    }
  ): Promise<boolean> {
    try {
      // Check advertiser account
      const advertiserRef = db.collection('advertisers').doc(advertiserId);
      const advertiser = await advertiserRef.get();

      if (!advertiser.exists) {
        throw new Error('Advertiser account not found');
      }

      const currentBalance = advertiser.data()?.tokenBalance || 0;

      if (currentBalance < amount) {
        console.warn(`Insufficient balance for advertiser ${advertiserId}`);
        // Pause campaign due to insufficient funds
        await this.pauseCampaignDueToFunds(metadata.campaignId, metadata.adId);
        return false;
      }

      // Deduct tokens
      await advertiserRef.update({
        tokenBalance: currentBalance - amount,
        totalSpent: (advertiser.data()?.totalSpent || 0) + amount,
        updatedAt: serverTimestamp(),
      });

      // Record transaction
      await db.collection('adTransactions').add({
        advertiserId,
        adId: metadata.adId,
        campaignId: metadata.campaignId,
        placementId: metadata.placementId,
        amount,
        type: reason,
        userId: metadata.userId,
        countryCode: metadata.countryCode,
        timestamp: serverTimestamp(),
      });

      // Update ad spend
      await this.updateAdSpend(metadata.adId, amount);

      // Update campaign spend if applicable
      if (metadata.campaignId) {
        await this.updateCampaignSpend(metadata.campaignId, amount);
      }

      return true;
    } catch (error) {
      console.error('Error spending tokens:', error);
      return false;
    }
  }

  /**
   * Charge for impression
   */
  static async chargeImpression(
    adId: string,
    advertiserId: string,
    placementId: string,
    userId: string,
    countryCode: string
  ): Promise<boolean> {
    const adRef = db.collection('ads').doc(adId);
    const ad = await adRef.get();

    if (!ad.exists) {
      throw new Error('Ad not found');
    }

    const adData = ad.data() as AvaloAd;
    const amount = adData.bidPerImpressionTokens || 0;

    if (amount === 0) {
      return true; // No charge for impressions
    }

    const campaignId = await this.getAdCampaignId(adId);

    return this.spendTokens(advertiserId, amount, 'impression', {
      adId,
      campaignId,
      placementId,
      userId,
      countryCode,
    });
  }

  /**
   * Charge for click
   */
  static async chargeClick(
    adId: string,
    advertiserId: string,
    placementId: string,
    userId: string,
    countryCode: string
  ): Promise<boolean> {
    const adRef = db.collection('ads').doc(adId);
    const ad = await adRef.get();

    if (!ad.exists) {
      throw new Error('Ad not found');
    }

    const adData = ad.data() as AvaloAd;
    const amount = adData.bidPerClickTokens;

    const campaignId = await this.getAdCampaignId(adId);

    return this.spendTokens(advertiserId, amount, 'click', {
      adId,
      campaignId,
      placementId,
      userId,
      countryCode,
    });
  }

  /**
   * Charge for view (video/engagement)
   */
  static async chargeView(
    adId: string,
    advertiserId: string,
    placementId: string,
    userId: string,
    countryCode: string,
    viewDuration: number
  ): Promise<boolean> {
    const adRef = db.collection('ads').doc(adId);
    const ad = await adRef.get();

    if (!ad.exists) {
      throw new Error('Ad not found');
    }

    const adData = ad.data() as AvaloAd;
    const amount = adData.bidPerViewTokens;

    // Only charge if viewed for at least 3 seconds
    if (viewDuration < 3) {
      return true;
    }

    const campaignId = await this.getAdCampaignId(adId);

    return this.spendTokens(advertiserId, amount, 'view', {
      adId,
      campaignId,
      placementId,
      userId,
      countryCode,
    });
  }

  /**
   * Charge for conversion (optional higher-tier billing)
   */
  static async chargeConversion(
    adId: string,
    advertiserId: string,
    placementId: string,
    userId: string,
    countryCode: string,
    conversionValue?: number
  ): Promise<boolean> {
    // Conversion billing is optional and set at campaign level
    const campaignId = await this.getAdCampaignId(adId);

    if (!campaignId) {
      return true; // No conversion billing
    }

    const campaignRef = db.collection('brandCampaigns').doc(campaignId);
    const campaign = await campaignRef.get();

    if (!campaign.exists) {
      return true;
    }

    // For now, conversions are tracked but not separately billed
    // This can be extended for CPA (Cost Per Action) campaigns
    return true;
  }

  /**
   * Update ad spend tracking
   */
  private static async updateAdSpend(adId: string, amount: number): Promise<void> {
    const adRef = db.collection('ads').doc(adId);
    const ad = await adRef.get();

    if (ad.exists) {
      await adRef.update({
        totalSpent: (ad.data()?.totalSpent || 0) + amount,
        updatedAt: serverTimestamp(),
      });
    }
  }

  /**
   * Update campaign spend and check budget limits
   */
  private static async updateCampaignSpend(
    campaignId: string,
    amount: number
  ): Promise<void> {
    const campaignRef = db.collection('brandCampaigns').doc(campaignId);
    const campaign = await campaignRef.get();

    if (!campaign.exists) {
      return;
    }

    const campaignData = campaign.data() as BrandCampaign;
    const newSpent = (campaignData.currentSpentTokens || 0) + amount;

    await campaignRef.update({
      currentSpentTokens: newSpent,
      updatedAt: serverTimestamp(),
    });

    // Auto-pause if budget exceeded
    if (newSpent >= campaignData.maxSpendTokens) {
      await campaignRef.update({
        status: 'ended',
        autoPausedAt: serverTimestamp(),
        autoPauseReason: 'Budget exhausted',
      });

      // Pause all ads in campaign
      await this.pauseAllCampaignAds(campaignId);
    }
  }

  /**
   * Pause campaign due to insufficient funds
   */
  private static async pauseCampaignDueToFunds(
    campaignId: string | undefined,
    adId: string
  ): Promise<void> {
    // Pause the specific ad
    await db.collection('ads').doc(adId).update({
      status: 'paused',
      updatedAt: serverTimestamp(),
    });

    if (campaignId) {
      await db.collection('brandCampaigns').doc(campaignId).update({
        status: 'paused',
        autoPausedAt: serverTimestamp(),
        autoPauseReason: 'Insufficient advertiser balance',
        updatedAt: serverTimestamp(),
      });
    }
  }

  /**
   * Pause all ads in a campaign
   */
  private static async pauseAllCampaignAds(campaignId: string): Promise<void> {
    const campaignRef = db.collection('brandCampaigns').doc(campaignId);
    const campaign = await campaignRef.get();

    if (!campaign.exists) {
      return;
    }

    const adIds = (campaign.data() as BrandCampaign).ads || [];
    const batch = db.batch();

    for (const adId of adIds) {
      const adRef = db.collection('ads').doc(adId);
      batch.update(adRef, {
        status: 'paused',
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  }

  /**
   * Get campaign ID for an ad
   */
  private static async getAdCampaignId(adId: string): Promise<string | undefined> {
    const campaigns = await db
      .collection('brandCampaigns')
      .where('ads', 'array-contains', adId)
      .limit(1)
      .get();

    if (campaigns.empty) {
      return undefined;
    }

    return campaigns.docs[0].id;
  }

  /**
   * Add tokens to advertiser account (admin function)
   */
  static async addTokens(
    advertiserId: string,
    amount: number,
    reason: string,
    adminId?: string
  ): Promise<void> {
    const advertiserRef = db.collection('advertisers').doc(advertiserId);
    const advertiser = await advertiserRef.get();

    if (!advertiser.exists) {
      throw new Error('Advertiser account not found');
    }

    const currentBalance = advertiser.data()?.tokenBalance || 0;

    await advertiserRef.update({
      tokenBalance: currentBalance + amount,
      updatedAt: serverTimestamp(),
      'billingHistory': [
        ...(advertiser.data()?.billingHistory || []),
        {
          amount,
          tokens: amount,
          reason,
          adminId,
          timestamp: Timestamp.now(),
        },
      ],
    });
  }

  /**
   * Get advertiser balance
   */
  static async getBalance(advertiserId: string): Promise<number> {
    const advertiser = await db.collection('advertisers').doc(advertiserId).get();

    if (!advertiser.exists) {
      throw new Error('Advertiser account not found');
    }

    return advertiser.data()?.tokenBalance || 0;
  }

  /**
   * Check if advertiser can afford an ad
   */
  static async canAfford(
    advertiserId: string,
    estimatedCost: number
  ): Promise<boolean> {
    const balance = await this.getBalance(advertiserId);
    return balance >= estimatedCost;
  }

  /**
   * Refund tokens (in case of error or violation)
   */
  static async refundTokens(
    advertiserId: string,
    amount: number,
    reason: string,
    originalTransactionId?: string
  ): Promise<void> {
    const advertiserRef = db.collection('advertisers').doc(advertiserId);
    const advertiser = await advertiserRef.get();

    if (!advertiser.exists) {
      throw new Error('Advertiser account not found');
    }

    const currentBalance = advertiser.data()?.tokenBalance || 0;

    await advertiserRef.update({
      tokenBalance: currentBalance + amount,
      updatedAt: serverTimestamp(),
    });

    // Record refund
    await db.collection('adRefunds').add({
      advertiserId,
      amount,
      reason,
      originalTransactionId,
      timestamp: serverTimestamp(),
    });
  }
}
