/**
 * PACK 349 - Ad Placement Engine
 * Injects ads into various surfaces (Feed, Discovery, Events, Creator, AI)
 */

import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  AvaloAd,
  AdPlacement,
  AdType,
  AD_CONSTANTS,
  AD_EXCLUSION_SURFACES,
} from './pack349-types';
import { AdBillingEngine } from './pack349-billing';

export class AdPlacementEngine {
  /**
   * Get ad for Feed placement
   * Every 8-12 organic posts
   */
  static async getAdForFeed(
    userId: string,
    countryCode: string,
    postPosition: number
  ): Promise<AvaloAd | null> {
    // Check if we should show an ad at this position
    if (postPosition % AD_CONSTANTS.AD_FEED_FREQUENCY !== 0) {
      return null;
    }

    return this.getEligibleAd(userId, countryCode, 'feed');
  }

  /**
   * Get ads for Discovery page
   * Sponsored tile row
   */
  static async getAdsForDiscovery(
    userId: string,
    countryCode: string,
    count: number = 3
  ): Promise<AvaloAd[]> {
    const ads = await this.getEligibleAds(userId, countryCode, 'discovery', count);
    return ads;
  }

  /**
   * Get sponsored event
   */
  static async getAdForEvent(
    userId: string,
    countryCode: string
  ): Promise<AvaloAd | null> {
    return this.getEligibleAd(userId, countryCode, 'event');
  }

  /**
   * Get sponsored creator badge/ad
   */
  static async getAdForCreator(
    userId: string,
    countryCode: string,
    creatorId: string
  ): Promise<AvaloAd | null> {
    // Check if creator has sponsorship
    const creatorProfile = await db
      .collection('sponsoredCreators')
      .doc(creatorId)
      .get();

    if (creatorProfile.exists && creatorProfile.data()?.isActive) {
      // Return creator's sponsorship ad
      const campaignId = creatorProfile.data()?.campaignId;
      if (campaignId) {
        const campaign = await db.collection('brandCampaigns').doc(campaignId).get();
        if (campaign.exists) {
          const adIds = campaign.data()?.ads || [];
          if (adIds.length > 0) {
            // Get first active ad from campaign
            const adRef = db.collection('ads').doc(adIds[0]);
            const ad = await adRef.get();
            if (ad.exists && ad.data()?.status === 'active') {
              return ad.data() as AvaloAd;
            }
          }
        }
      }
    }

    // Otherwise, show regular creator-type ad
    return this.getEligibleAd(userId, countryCode, 'creator');
  }

  /**
   * Get sponsored AI companion
   */
  static async getAdForAI(
    userId: string,
    countryCode: string
  ): Promise<AvaloAd | null> {
    return this.getEligibleAd(userId, countryCode, 'ai');
  }

  /**
   * Get a single eligible ad
   */
  private static async getEligibleAd(
    userId: string,
    countryCode: string,
    type: AdType
  ): Promise<AvaloAd | null> {
    const ads = await this.getEligibleAds(userId, countryCode, type, 1);
    return ads.length > 0 ? ads[0] : null;
  }

  /**
   * Get multiple eligible ads
   */
  private static async getEligibleAds(
    userId: string,
    countryCode: string,
    type: AdType,
    count: number
  ): Promise<AvaloAd[]> {
    // Query active ads of the specified type
    let query = db
      .collection('ads')
      .where('status', '==', 'active')
      .where('type', '==', type)
      .where('countryScopes', 'array-contains', countryCode)
      .where('moderationStatus', '==', 'approved');

    const snapshot = await query.get();

    if (snapshot.empty) {
      return [];
    }

    const candidateAds = snapshot.docs
      .map(doc => doc.data() as AvaloAd)
      .filter(ad => {
        // Additional filters
        // Check daily budget not exceeded
        return ad.dailyBudgetTokens > 0;
      });

    if (candidateAds.length === 0) {
      return [];
    }

    // Get user's recently seen ads (frequency capping)
    const recentlySeenAds = await this.getRecentlySeenAds(userId, 24); // Last 24 hours
    const unseenAds = candidateAds.filter(
      ad => !recentlySeenAds.includes(ad.id)
    );

    // If all ads have been seen, allow them again (but prefer unseen)
    const adsToSelect = unseenAds.length > 0 ? unseenAds : candidateAds;

    // Randomly select ads (could implement bidding logic here)
    const shuffled = adsToSelect.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count);

    return selected;
  }

  /**
   * Record ad placement (shown to user)
   */
  static async recordPlacement(
    adId: string,
    userId: string,
    surface: AdType,
    position: number,
    countryCode: string
  ): Promise<string> {
    const ad = await db.collection('ads').doc(adId).get();

    if (!ad.exists) {
      throw new Error('Ad not found');
    }

    const adData = ad.data() as AvaloAd;

    // Create placement record
    const placementRef = db.collection('adPlacements').doc();
    const placement: AdPlacement = {
      id: placementRef.id,
      adId,
      userId,
      surface,
      position,
      shown: true,
      clicked: false,
      converted: false,
      timestamp: Timestamp.now(),
      countryCode,
    };

    await placementRef.set(placement);

    // Update ad impression count
    await db.collection('ads').doc(adId).update({
      totalImpressions: (adData.totalImpressions || 0) + 1,
      updatedAt: serverTimestamp(),
    });

    // Record daily stats
    await this.updateDailyStats(adId, 'impressions', countryCode);

    // Charge for impression if applicable
    if (adData.bidPerImpressionTokens > 0) {
      await AdBillingEngine.chargeImpression(
        adId,
        adData.advertiserId,
        placementRef.id,
        userId,
        countryCode
      );
    }

    return placementRef.id;
  }

  /**
   * Record ad click
   */
  static async recordClick(
    placementId: string,
    userId: string
  ): Promise<void> {
    const placement = await db.collection('adPlacements').doc(placementId).get();

    if (!placement.exists) {
      throw new Error('Placement not found');
    }

    const placementData = placement.data() as AdPlacement;

    // Prevent duplicate clicks
    if (placementData.clicked) {
      return;
    }

    await db.collection('adPlacements').doc(placementId).update({
      clicked: true,
      updatedAt: serverTimestamp(),
    });

    const ad = await db.collection('ads').doc(placementData.adId).get();

    if (!ad.exists) {
      return;
    }

    const adData = ad.data() as AvaloAd;

    // Update ad click count
    await db.collection('ads').doc(placementData.adId).update({
      totalClicks: (adData.totalClicks || 0) + 1,
      updatedAt: serverTimestamp(),
    });

    // Record daily stats
    await this.updateDailyStats(placementData.adId, 'clicks', placementData.countryCode);

    // Charge for click
    await AdBillingEngine.chargeClick(
      placementData.adId,
      adData.advertiserId,
      placementId,
      userId,
      placementData.countryCode
    );
  }

  /**
   * Record ad view (video/engagement)
   */
  static async recordView(
    placementId: string,
    userId: string,
    viewDuration: number
  ): Promise<void> {
    const placement = await db.collection('adPlacements').doc(placementId).get();

    if (!placement.exists) {
      throw new Error('Placement not found');
    }

    const placementData = placement.data() as AdPlacement;

    await db.collection('adPlacements').doc(placementId).update({
      viewDuration,
      updatedAt: serverTimestamp(),
    });

    const ad = await db.collection('ads').doc(placementData.adId).get();

    if (!ad.exists) {
      return;
    }

    const adData = ad.data() as AvaloAd;

    // Only count views over 3 seconds
    if (viewDuration >= 3) {
      await db.collection('ads').doc(placementData.adId).update({
        totalViews: (adData.totalViews || 0) + 1,
        updatedAt: serverTimestamp(),
      });

      // Record daily stats
      await this.updateDailyStats(placementData.adId, 'views', placementData.countryCode);

      // Charge for view
      await AdBillingEngine.chargeView(
        placementData.adId,
        adData.advertiserId,
        placementId,
        userId,
        placementData.countryCode,
        viewDuration
      );
    }
  }

  /**
   * Record conversion (user took action)
   */
  static async recordConversion(
    placementId: string,
    userId: string,
    conversionType: string,
    value?: number
  ): Promise<void> {
    const placement = await db.collection('adPlacements').doc(placementId).get();

    if (!placement.exists) {
      throw new Error('Placement not found');
    }

    const placementData = placement.data() as AdPlacement;

    // Prevent duplicate conversions
    if (placementData.converted) {
      return;
    }

    await db.collection('adPlacements').doc(placementId).update({
      converted: true,
      updatedAt: serverTimestamp(),
    });

    // Create conversion record
    await db.collection('adConversions').add({
      id: db.collection('adConversions').doc().id,
      adId: placementData.adId,
      userId,
      placementId,
      conversionType,
      value,
      timestamp: serverTimestamp(),
    });

    // Record daily stats
    await this.updateDailyStats(placementData.adId, 'conversions', placementData.countryCode);
  }

  /**
   * Update daily statistics
   */
  private static async updateDailyStats(
    adId: string,
    metric: 'impressions' | 'clicks' | 'views' | 'conversions',
    countryCode: string
  ): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const statId = `${adId}_${today}`;
    const statRef = db.collection('adStats').doc(statId);

    const stat = await statRef.get();

    if (!stat.exists) {
      // Create new stat document
      await statRef.set({
        id: statId,
        adId,
        date: today,
        impressions: metric === 'impressions' ? 1 : 0,
        clicks: metric === 'clicks' ? 1 : 0,
        views: metric === 'views' ? 1 : 0,
        conversions: metric === 'conversions' ? 1 : 0,
        tokenSpent: 0,
        ctr: 0,
        cvr: 0,
        costPerClick: 0,
        costPerView: 0,
        costPerConversion: 0,
        geoDistribution: {
          [countryCode]: {
            impressions: metric === 'impressions' ? 1 : 0,
            clicks: metric === 'clicks' ? 1 : 0,
            spent: 0,
          },
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      // Update existing stat
      const updates: any = {
        updatedAt: serverTimestamp(),
      };

      if (metric === 'impressions') {
        updates.impressions = (stat.data()?.impressions || 0) + 1;
        updates[`geoDistribution.${countryCode}.impressions`] =
          (stat.data()?.geoDistribution?.[countryCode]?.impressions || 0) + 1;
      } else if (metric === 'clicks') {
        updates.clicks = (stat.data()?.clicks || 0) + 1;
        updates[`geoDistribution.${countryCode}.clicks`] =
          (stat.data()?.geoDistribution?.[countryCode]?.clicks || 0) + 1;
      } else if (metric === 'views') {
        updates.views = (stat.data()?.views || 0) + 1;
      } else if (metric === 'conversions') {
        updates.conversions = (stat.data()?.conversions || 0) + 1;
      }

      // Recalculate CTR and CVR
      const impressions = updates.impressions || stat.data()?.impressions || 1;
      const clicks = updates.clicks || stat.data()?.clicks || 0;
      const conversions = updates.conversions || stat.data()?.conversions || 0;

      updates.ctr = (clicks / impressions) * 100;
      if (clicks > 0) {
        updates.cvr = (conversions / clicks) * 100;
      }

      await statRef.update(updates);
    }
  }

  /**
   * Get recently seen ads by user (for frequency capping)
   */
  private static async getRecentlySeenAds(
    userId: string,
    hoursAgo: number
  ): Promise<string[]> {
    const cutoffTime = Timestamp.fromMillis(
      Date.now() - hoursAgo * 60 * 60 * 1000
    );

    const placements = await db
      .collection('adPlacements')
      .where('userId', '==', userId)
      .where('timestamp', '>=', cutoffTime)
      .get();

    return placements.docs.map(doc => doc.data().adId);
  }

  /**
   * Check if surface allows ads
   */
  static surfaceAllowsAds(surface: string): boolean {
    return !AD_EXCLUSION_SURFACES.includes(surface as any);
  }
}
