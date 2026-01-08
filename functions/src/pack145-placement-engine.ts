/**
 * PACK 145 - Ad Placement Engine
 * Handles ad placement in various surfaces without affecting organic content ranking
 * 
 * Key principles:
 * - Ads are clearly labeled as "Sponsored"
 * - Ads do not affect feed ranking
 * - Ads do not give visibility advantage outside paid placements
 * - Ethical targeting only
 */

import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  AdPlacement,
  AdCampaign,
  AdAsset,
  AdPlacementSurface,
  ALLOWED_PLACEMENTS,
} from './pack145-types';
import { AdTargetingValidator } from './pack145-targeting-validator';

export class AdPlacementEngine {
  static async getEligibleAdsForUser(
    userId: string,
    surface: AdPlacementSurface,
    limit: number = 5
  ): Promise<AdPlacement[]> {
    if (!ALLOWED_PLACEMENTS.includes(surface)) {
      throw new Error(`Invalid placement surface: ${surface}`);
    }

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return [];
    }

    const userProfile = {
      interests: userDoc.data()?.interests || [],
      purchaseHistory: userDoc.data()?.purchaseHistory || [],
      engagementLevel: userDoc.data()?.engagementLevel || 'medium',
      region: userDoc.data()?.region,
      language: userDoc.data()?.language,
      age: userDoc.data()?.age,
    };

    const activeCampaigns = await db
      .collection('ad_campaigns')
      .where('status', '==', 'active')
      .where('placements', 'array-contains', surface)
      .get();

    const eligibleCampaigns: Array<{ campaign: AdCampaign; score: number }> = [];

    for (const doc of activeCampaigns.docs) {
      const campaign = doc.data() as AdCampaign;

      if (campaign.budget.remaining <= 0) {
        continue;
      }

      if (campaign.schedule.endDate && campaign.schedule.endDate.toDate() < new Date()) {
        continue;
      }

      const matches = AdTargetingValidator.matchesTargeting(
        campaign.targeting,
        userProfile
      );

      if (matches) {
        const score = AdTargetingValidator.calculateTargetingScore(
          campaign.targeting,
          userProfile
        );
        eligibleCampaigns.push({ campaign, score });
      }
    }

    eligibleCampaigns.sort((a, b) => {
      const bidDiff = b.campaign.billing.bidAmount - a.campaign.billing.bidAmount;
      if (Math.abs(bidDiff) > 0.01) {
        return bidDiff;
      }
      return b.score - a.score;
    });

    const placements: AdPlacement[] = [];
    const now = Timestamp.now();

    for (const { campaign } of eligibleCampaigns.slice(0, limit)) {
      if (campaign.assetIds.length === 0) {
        continue;
      }

      const assetId = campaign.assetIds[Math.floor(Math.random() * campaign.assetIds.length)];

      const placementRef = db.collection('ad_placements').doc();
      const placement: AdPlacement = {
        id: placementRef.id,
        campaignId: campaign.id,
        assetId,
        surface,
        targetUserId: userId,
        position: 0,
        timestamp: now,
        expiresAt: Timestamp.fromMillis(now.toMillis() + 3600000),
        impressionRecorded: false,
        clickRecorded: false,
      };

      await placementRef.set(placement);
      placements.push(placement);
    }

    return placements;
  }

  static async getFeedAdsForUser(userId: string, feedPosition: number): Promise<AdPlacement | null> {
    if (feedPosition % 5 !== 0 || feedPosition === 0) {
      return null;
    }

    const placements = await this.getEligibleAdsForUser(userId, 'feed', 1);
    if (placements.length === 0) {
      return null;
    }

    const placement = placements[0];
    await db.collection('ad_placements').doc(placement.id).update({
      position: feedPosition,
      updatedAt: serverTimestamp(),
    });

    return placement;
  }

  static async getClubAds(userId: string, clubId: string): Promise<AdPlacement[]> {
    const clubDoc = await db.collection('clubs').doc(clubId).get();
    if (!clubDoc.exists) {
      return [];
    }

    const clubAllowsAds = clubDoc.data()?.allowAds !== false;
    if (!clubAllowsAds) {
      return [];
    }

    const placements = await this.getEligibleAdsForUser(userId, 'club', 2);
    return placements;
  }

  static async getDiscoveryAds(userId: string, category: string): Promise<AdPlacement[]> {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return [];
    }

    const placements = await this.getEligibleAdsForUser(userId, 'discovery', 3);
    
    const categoryCampaigns = await db
      .collection('ad_campaigns')
      .where('status', '==', 'active')
      .where('placements', 'array-contains', 'discovery')
      .where('contentType', '==', category)
      .limit(3)
      .get();

    const additionalPlacements: AdPlacement[] = [];
    
    for (const doc of categoryCampaigns.docs) {
      const campaign = doc.data() as AdCampaign;
      if (campaign.assetIds.length === 0 || campaign.budget.remaining <= 0) {
        continue;
      }

      const assetId = campaign.assetIds[0];
      const placementRef = db.collection('ad_placements').doc();
      const now = Timestamp.now();

      const placement: AdPlacement = {
        id: placementRef.id,
        campaignId: campaign.id,
        assetId,
        surface: 'discovery',
        targetUserId: userId,
        position: 0,
        timestamp: now,
        expiresAt: Timestamp.fromMillis(now.toMillis() + 3600000),
        impressionRecorded: false,
        clickRecorded: false,
      };

      await placementRef.set(placement);
      additionalPlacements.push(placement);
    }

    return [...placements, ...additionalPlacements];
  }

  static async getEventRecommendationAds(
    userId: string,
    eventType?: string
  ): Promise<AdPlacement[]> {
    const placements = await this.getEligibleAdsForUser(userId, 'event_recommendations', 2);
    return placements.filter(p => !eventType || p.campaignId.includes(eventType));
  }

  static async getBusinessSuiteAds(
    userId: string,
    creatorId: string
  ): Promise<AdPlacement[]> {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return [];
    }

    const hasOptedIn = userDoc.data()?.businessSuiteAdsOptIn === true;
    if (!hasOptedIn) {
      return [];
    }

    const placements = await this.getEligibleAdsForUser(userId, 'business_suite', 1);
    return placements;
  }

  static async getAdWithAsset(placementId: string): Promise<{
    placement: AdPlacement;
    asset: AdAsset;
    campaign: AdCampaign;
  } | null> {
    const placementDoc = await db.collection('ad_placements').doc(placementId).get();
    if (!placementDoc.exists) {
      return null;
    }

    const placement = placementDoc.data() as AdPlacement;

    const [assetDoc, campaignDoc] = await Promise.all([
      db.collection('ad_assets').doc(placement.assetId).get(),
      db.collection('ad_campaigns').doc(placement.campaignId).get(),
    ]);

    if (!assetDoc.exists || !campaignDoc.exists) {
      return null;
    }

    return {
      placement,
      asset: assetDoc.data() as AdAsset,
      campaign: campaignDoc.data() as AdCampaign,
    };
  }

  static async cleanupExpiredPlacements(): Promise<void> {
    const now = Timestamp.now();
    const expired = await db
      .collection('ad_placements')
      .where('expiresAt', '<=', now)
      .limit(500)
      .get();

    const batch = db.batch();
    expired.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
  }

  static async getPlacementStats(campaignId: string): Promise<{
    totalPlacements: number;
    impressions: number;
    clicks: number;
    surfaceBreakdown: Record<string, number>;
  }> {
    const placements = await db
      .collection('ad_placements')
      .where('campaignId', '==', campaignId)
      .get();

    const stats = {
      totalPlacements: placements.size,
      impressions: 0,
      clicks: 0,
      surfaceBreakdown: {} as Record<string, number>,
    };

    placements.docs.forEach(doc => {
      const data = doc.data();
      if (data.impressionRecorded) {
        stats.impressions++;
      }
      if (data.clickRecorded) {
        stats.clicks++;
      }
      stats.surfaceBreakdown[data.surface] =
        (stats.surfaceBreakdown[data.surface] || 0) + 1;
    });

    return stats;
  }

  static async recordFeedView(userId: string, feedItemId: string): Promise<void> {
    const placement = await db
      .collection('ad_placements')
      .where('targetUserId', '==', userId)
      .where('surface', '==', 'feed')
      .where('impressionRecorded', '==', false)
      .limit(1)
      .get();

    if (placement.empty) {
      return;
    }

    const placementDoc = placement.docs[0];
    await placementDoc.ref.update({
      impressionRecorded: true,
      'interactionData.impressionAt': serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  static async ensureNoVisibilityAdvantage(
    userId: string,
    contentType: string
  ): Promise<boolean> {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return true;
    }

    const hasActiveAdCampaigns = await db
      .collection('ad_campaigns')
      .where('advertiserId', '==', userId)
      .where('status', '==', 'active')
      .where('contentType', '==', contentType)
      .limit(1)
      .get();

    return hasActiveAdCampaigns.empty;
  }
}