/**
 * PACK 349 - Brand Campaign Engine
 * Manages multi-ad campaigns with scheduling and budget controls
 */

import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  BrandCampaign,
  AvaloAd,
  AD_CONSTANTS,
  AdViolation,
} from './pack349-types';
import { AdSafetyGate } from './pack349-safety';

export class BrandCampaignEngine {
  /**
   * Create a new brand campaign
   */
  static async createCampaign(
    advertiserId: string,
    campaignData: {
      brandName: string;
      startAt: Date;
      endAt: Date;
      maxSpendTokens: number;
      targetCountries: string[];
      targetAudience?: BrandCampaign['targetAudience'];
    }
  ): Promise<BrandCampaign> {
    // Validate advertiser exists and is in good standing
    const advertiser = await db.collection('advertisers').doc(advertiserId).get();

    if (!advertiser.exists) {
      throw new Error('Advertiser account not found');
    }

    if (advertiser.data()?.status === 'banned') {
      throw new Error('Advertiser is banned');
    }

    if (advertiser.data()?.status === 'suspended') {
      throw new Error('Advertiser is suspended');
    }

    // Create campaign
    const campaignRef = db.collection('brandCampaigns').doc();
    const now = Timestamp.now();

    const campaign: BrandCampaign = {
      id: campaignRef.id,
      brandName: campaignData.brandName,
      advertiserId,
      ads: [],
      startAt: Timestamp.fromDate(campaignData.startAt),
      endAt: Timestamp.fromDate(campaignData.endAt),
      maxSpendTokens: campaignData.maxSpendTokens,
      currentSpentTokens: 0,
      status: 'scheduled',
      targetCountries: campaignData.targetCountries,
      targetAudience: campaignData.targetAudience,
      createdAt: now,
      updatedAt: now,
      violationCount: 0,
      reportCount: 0,
    };

    // Safety validation
    const safetyCheck = await AdSafetyGate.validateCampaign(campaign);

    if (!safetyCheck.isValid) {
      throw new Error(`Campaign failed safety check: ${safetyCheck.violations.join(', ')}`);
    }

    if (safetyCheck.requiresManualReview) {
      campaign.status = 'scheduled'; // Will be reviewed before activation
      // Create moderation queue item
      await db.collection('adModerationQueue').add({
        adId: campaignRef.id,
        advertiserId,
        type: 'new_ad',
        priority: 'medium',
        status: 'pending',
        flagReason: 'High-budget campaign requires review',
        createdAt: now,
      });
    }

    await campaignRef.set(campaign);

    return campaign;
  }

  /**
   * Add ad to campaign
   */
  static async addAdToCampaign(
    campaignId: string,
    adId: string,
    advertiserId: string
  ): Promise<void> {
    const campaignRef = db.collection('brandCampaigns').doc(campaignId);
    const campaign = await campaignRef.get();

    if (!campaign.exists) {
      throw new Error('Campaign not found');
    }

    const campaignData = campaign.data() as BrandCampaign;

    if (campaignData.advertiserId !== advertiserId) {
      throw new Error('Unauthorized: Campaign belongs to different advertiser');
    }

    // Verify ad exists and belongs to advertiser
    const adRef = db.collection('ads').doc(adId);
    const ad = await adRef.get();

    if (!ad.exists) {
      throw new Error('Ad not found');
    }

    if (ad.data()?.advertiserId !== advertiserId) {
      throw new Error('Unauthorized: Ad belongs to different advertiser');
    }

    // Check if ad already in campaign
    if (campaignData.ads.includes(adId)) {
      throw new Error('Ad already in campaign');
    }

    // Add ad to campaign
    await campaignRef.update({
      ads: [...campaignData.ads, adId],
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Remove ad from campaign
   */
  static async removeAdFromCampaign(
    campaignId: string,
    adId: string,
    advertiserId: string
  ): Promise<void> {
    const campaignRef = db.collection('brandCampaigns').doc(campaignId);
    const campaign = await campaignRef.get();

    if (!campaign.exists) {
      throw new Error('Campaign not found');
    }

    const campaignData = campaign.data() as BrandCampaign;

    if (campaignData.advertiserId !== advertiserId) {
      throw new Error('Unauthorized');
    }

    // Remove ad from campaign
    const updatedAds = campaignData.ads.filter(id => id !== adId);

    await campaignRef.update({
      ads: updatedAds,
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Activate campaign (start serving ads)
   */
  static async activateCampaign(
    campaignId: string,
    advertiserId: string
  ): Promise<void> {
    const campaignRef = db.collection('brandCampaigns').doc(campaignId);
    const campaign = await campaignRef.get();

    if (!campaign.exists) {
      throw new Error('Campaign not found');
    }

    const campaignData = campaign.data() as BrandCampaign;

    if (campaignData.advertiserId !== advertiserId) {
      throw new Error('Unauthorized');
    }

    if (campaignData.ads.length === 0) {
      throw new Error('Campaign must have at least one ad');
    }

    // Check all ads are approved
    const adPromises = campaignData.ads.map(adId =>
      db.collection('ads').doc(adId).get()
    );
    const ads = await Promise.all(adPromises);

    const unapprovedAds = ads.filter(
      ad => ad.exists && ad.data()?.moderationStatus !== 'approved'
    );

    if (unapprovedAds.length > 0) {
      throw new Error('All ads must be approved before activating campaign');
    }

    // Activate campaign
    await campaignRef.update({
      status: 'active',
      updatedAt: serverTimestamp(),
    });

    // Activate all ads in campaign
    const batch = db.batch();
    for (const adId of campaignData.ads) {
      const adRef = db.collection('ads').doc(adId);
      batch.update(adRef, {
        status: 'active',
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  /**
   * Pause campaign
   */
  static async pauseCampaign(
    campaignId: string,
    advertiserId: string,
    reason?: string
  ): Promise<void> {
    const campaignRef = db.collection('brandCampaigns').doc(campaignId);
    const campaign = await campaignRef.get();

    if (!campaign.exists) {
      throw new Error('Campaign not found');
    }

    const campaignData = campaign.data() as BrandCampaign;

    if (campaignData.advertiserId !== advertiserId) {
      throw new Error('Unauthorized');
    }

    await campaignRef.update({
      status: 'paused',
      updatedAt: serverTimestamp(),
      autoPauseReason: reason,
    });

    // Pause all ads in campaign
    const batch = db.batch();
    for (const adId of campaignData.ads) {
      const adRef = db.collection('ads').doc(adId);
      batch.update(adRef, {
        status: 'paused',
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  /**
   * End campaign
   */
  static async endCampaign(
    campaignId: string,
    advertiserId: string
  ): Promise<void> {
    const campaignRef = db.collection('brandCampaigns').doc(campaignId);
    const campaign = await campaignRef.get();

    if (!campaign.exists) {
      throw new Error('Campaign not found');
    }

    const campaignData = campaign.data() as BrandCampaign;

    if (campaignData.advertiserId !== advertiserId) {
      throw new Error('Unauthorized');
    }

    await campaignRef.update({
      status: 'ended',
      updatedAt: serverTimestamp(),
    });

    // Stop all ads in campaign
    const batch = db.batch();
    for (const adId of campaignData.ads) {
      const adRef = db.collection('ads').doc(adId);
      batch.update(adRef, {
        status: 'expired',
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  /**
   * Auto-pause campaign due to violations
   */
  static async autoPauseDueToViolations(campaignId: string): Promise<void> {
    const campaignRef = db.collection('brandCampaigns').doc(campaignId);
    const campaign = await campaignRef.get();

    if (!campaign.exists) {
      return;
    }

    const campaignData = campaign.data() as BrandCampaign;

    await campaignRef.update({
      status: 'paused',
      autoPausedAt: serverTimestamp(),
      autoPauseReason: 'Safety violations detected',
      updatedAt: serverTimestamp(),
    });

    // Pause all ads
    const batch = db.batch();
    for (const adId of campaignData.ads) {
      const adRef = db.collection('ads').doc(adId);
      batch.update(adRef, {
        status: 'paused',
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  /**
   * Auto-pause campaign due to reports
   */
  static async autoPauseDueToReports(campaignId: string): Promise<void> {
    const campaignRef = db.collection('brandCampaigns').doc(campaignId);
    const campaign = await campaignRef.get();

    if (!campaign.exists) {
      return;
    }

    const campaignData = campaign.data() as BrandCampaign;

    if (campaignData.reportCount >= AD_CONSTANTS.REPORT_THRESHOLD_AUTO_PAUSE) {
      await campaignRef.update({
        status: 'paused',
        autoPausedAt: serverTimestamp(),
        autoPauseReason: 'Excessive user reports',
        updatedAt: serverTimestamp(),
      });

      // Create moderation queue item
      await db.collection('adModerationQueue').add({
        adId: campaignId,
        advertiserId: campaignData.advertiserId,
        type: 'reported_ad',
        priority: 'high',
        status: 'pending',
        reportCount: campaignData.reportCount,
        flagReason: `Campaign reached ${campaignData.reportCount} reports`,
        createdAt: serverTimestamp(),
      });
    }
  }

  /**
   * Get campaign analytics
   */
  static async getCampaignAnalytics(
    campaignId: string,
    advertiserId: string
  ): Promise<any> {
    const campaignRef = db.collection('brandCampaigns').doc(campaignId);
    const campaign = await campaignRef.get();

    if (!campaign.exists) {
      throw new Error('Campaign not found');
    }

    const campaignData = campaign.data() as BrandCampaign;

    if (campaignData.advertiserId !== advertiserId) {
      throw new Error('Unauthorized');
    }

    // Get all ad stats for campaign ads
    const adIds = campaignData.ads;
    const adStatsPromises = adIds.map(async adId => {
      const stats = await db
        .collection('adStats')
        .where('adId', '==', adId)
        .get();

      return stats.docs.map(doc => doc.data());
    });

    const allAdStats = await Promise.all(adStatsPromises);
    const flatStats = allAdStats.flat();

    // Aggregate stats
    const aggregated = {
      totalImpressions: 0,
      totalClicks: 0,
      totalViews: 0,
      totalConversions: 0,
      totalSpent: campaignData.currentSpentTokens,
      averageCTR: 0,
      averageCVR: 0,
      geoDistribution: {} as any,
    };

    flatStats.forEach(stat => {
      aggregated.totalImpressions += stat.impressions || 0;
      aggregated.totalClicks += stat.clicks || 0;
      aggregated.totalViews += stat.views || 0;
      aggregated.totalConversions += stat.conversions || 0;

      // Aggregate geo distribution
      if (stat.geoDistribution) {
        Object.keys(stat.geoDistribution).forEach(country => {
          if (!aggregated.geoDistribution[country]) {
            aggregated.geoDistribution[country] = {
              impressions: 0,
              clicks: 0,
              spent: 0,
            };
          }
          aggregated.geoDistribution[country].impressions +=
            stat.geoDistribution[country].impressions || 0;
          aggregated.geoDistribution[country].clicks +=
            stat.geoDistribution[country].clicks || 0;
          aggregated.geoDistribution[country].spent +=
            stat.geoDistribution[country].spent || 0;
        });
      }
    });

    if (aggregated.totalImpressions > 0) {
      aggregated.averageCTR = (aggregated.totalClicks / aggregated.totalImpressions) * 100;
    }

    if (aggregated.totalClicks > 0) {
      aggregated.averageCVR = (aggregated.totalConversions / aggregated.totalClicks) * 100;
    }

    return {
      campaign: campaignData,
      analytics: aggregated,
      dailyStats: flatStats,
    };
  }

  /**
   * Scheduled task: Check and auto-activate/end campaigns
   */
  static async processScheduledCampaigns(): Promise<void> {
    const now = Timestamp.now();

    // Activate scheduled campaigns
    const toActivate = await db
      .collection('brandCampaigns')
      .where('status', '==', 'scheduled')
      .where('startAt', '<=', now)
      .get();

    for (const doc of toActivate.docs) {
      const campaign = doc.data() as BrandCampaign;
      try {
        await this.activateCampaign(doc.id, campaign.advertiserId);
      } catch (error) {
        console.error(`Failed to activate campaign ${doc.id}:`, error);
      }
    }

    // End active campaigns past end date
    const toEnd = await db
      .collection('brandCampaigns')
      .where('status', '==', 'active')
      .where('endAt', '<=', now)
      .get();

    for (const doc of toEnd.docs) {
      const campaign = doc.data() as BrandCampaign;
      try {
        await this.endCampaign(doc.id, campaign.advertiserId);
      } catch (error) {
        console.error(`Failed to end campaign ${doc.id}:`, error);
      }
    }
  }
}
