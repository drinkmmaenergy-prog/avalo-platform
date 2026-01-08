/**
 * PACK 145 - Ad Campaign Engine
 * Core business logic for ad campaigns, assets, and moderation
 */

import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  AdCampaign,
  AdAsset,
  AdPlacement,
  AdMetrics,
  AdStrike,
  MAX_ACTIVE_CAMPAIGNS_PER_ADVERTISER,
  MAX_ASSETS_PER_CAMPAIGN,
  MIN_CAMPAIGN_BUDGET,
  MAX_CAMPAIGN_BUDGET,
  MIN_BID_AMOUNT,
  MAX_BID_AMOUNT,
  STRIKE_THRESHOLD_BAN,
  AdCampaignStatus,
  AdAssetStatus,
  ModerationRecord,
} from './pack145-types';
import { AdSafetyValidator } from './pack145-safety-validator';
import { AdTargetingValidator } from './pack145-targeting-validator';

export class AdEngine {
  static async createCampaign(
    advertiserId: string,
    campaignData: Partial<AdCampaign>
  ): Promise<AdCampaign> {
    const activeCampaigns = await db
      .collection('ad_campaigns')
      .where('advertiserId', '==', advertiserId)
      .where('status', 'in', ['active', 'pending_review'])
      .get();

    if (activeCampaigns.size >= MAX_ACTIVE_CAMPAIGNS_PER_ADVERTISER) {
      throw new Error(
        `Maximum ${MAX_ACTIVE_CAMPAIGNS_PER_ADVERTISER} active campaigns reached`
      );
    }

    const advertiserDoc = await db.collection('users').doc(advertiserId).get();
    if (!advertiserDoc.exists) {
      throw new Error('Advertiser not found');
    }

    const strikes = await this.getAdvertiserStrikes(advertiserId);
    if (strikes.length >= STRIKE_THRESHOLD_BAN) {
      throw new Error('Advertiser is banned from creating ads');
    }

    if (!campaignData.name || !campaignData.description) {
      throw new Error('Campaign name and description are required');
    }

    if (!campaignData.targeting) {
      throw new Error('Targeting is required');
    }

    const targetingValidation = AdTargetingValidator.validate(campaignData.targeting);
    if (!targetingValidation.isValid) {
      throw new Error(
        `Targeting validation failed: ${targetingValidation.violations.join(', ')}`
      );
    }

    const safetyValidation = await AdSafetyValidator.validateCampaign(
      campaignData as AdCampaign
    );
    if (!safetyValidation.isValid) {
      throw new Error(
        `Safety validation failed: ${safetyValidation.violations.join(', ')}`
      );
    }

    if (
      !campaignData.budget ||
      campaignData.budget.totalBudget < MIN_CAMPAIGN_BUDGET ||
      campaignData.budget.totalBudget > MAX_CAMPAIGN_BUDGET
    ) {
      throw new Error(
        `Budget must be between ${MIN_CAMPAIGN_BUDGET} and ${MAX_CAMPAIGN_BUDGET}`
      );
    }

    if (
      !campaignData.billing ||
      campaignData.billing.bidAmount < MIN_BID_AMOUNT ||
      campaignData.billing.bidAmount > MAX_BID_AMOUNT
    ) {
      throw new Error(
        `Bid amount must be between ${MIN_BID_AMOUNT} and ${MAX_BID_AMOUNT}`
      );
    }

    const campaignRef = db.collection('ad_campaigns').doc();
    const now = Timestamp.now();

    const moderationRecord: ModerationRecord = {
      timestamp: now,
      action: safetyValidation.requiresHumanReview ? 'flagged' : 'approved',
      autoModerated: true,
      violations: safetyValidation.violations,
      severity: safetyValidation.severity === 'none' ? undefined : safetyValidation.severity,
    };

    const campaign: AdCampaign = {
      id: campaignRef.id,
      advertiserId,
      name: campaignData.name,
      description: campaignData.description,
      status: safetyValidation.requiresHumanReview ? 'pending_review' : 'draft',
      contentType: campaignData.contentType!,
      targetContentId: campaignData.targetContentId!,
      assetIds: [],
      targeting: AdTargetingValidator.sanitizeTargeting(campaignData.targeting),
      billing: campaignData.billing,
      budget: {
        ...campaignData.budget,
        spent: 0,
        remaining: campaignData.budget.totalBudget,
      },
      schedule: campaignData.schedule!,
      placements: campaignData.placements || ['feed'],
      callToAction: campaignData.callToAction!,
      analytics: {
        impressions: 0,
        clicks: 0,
        views: 0,
        conversions: 0,
        spent: 0,
        ctr: 0,
        conversionRate: 0,
        lastUpdated: now,
      },
      moderationHistory: [moderationRecord],
      createdAt: now,
      updatedAt: now,
    };

    await campaignRef.set(campaign);
    return campaign;
  }

  static async uploadAdAsset(
    advertiserId: string,
    assetData: Partial<AdAsset>
  ): Promise<AdAsset> {
    if (!assetData.url || !assetData.title || !assetData.description) {
      throw new Error('URL, title, and description are required');
    }

    const safetyValidation = await AdSafetyValidator.validateAsset(
      assetData as AdAsset
    );

    const assetRef = db.collection('ad_assets').doc();
    const now = Timestamp.now();

    const asset: AdAsset = {
      id: assetRef.id,
      advertiserId,
      type: assetData.type!,
      status: safetyValidation.isValid && !safetyValidation.requiresHumanReview
        ? 'approved'
        : 'pending',
      url: assetData.url,
      thumbnailUrl: assetData.thumbnailUrl,
      title: assetData.title,
      description: assetData.description,
      duration: assetData.duration,
      width: assetData.width,
      height: assetData.height,
      fileSize: assetData.fileSize!,
      moderationResult: {
        isApproved: safetyValidation.isValid,
        violations: safetyValidation.violations,
        severity: safetyValidation.severity,
        nsfwScore: safetyValidation.nsfwScore,
        romanceScore: safetyValidation.romanceScore,
        exploitativeScore: safetyValidation.exploitativeScore,
        moderatedAt: now,
        autoModerated: true,
        humanReviewRequired: safetyValidation.requiresHumanReview,
      },
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    if (!safetyValidation.isValid) {
      asset.status = 'rejected';
      asset.rejectedAt = now;
    }

    await assetRef.set(asset);
    return asset;
  }

  static async attachAssetToCampaign(
    campaignId: string,
    assetId: string,
    advertiserId: string
  ): Promise<void> {
    const campaignRef = db.collection('ad_campaigns').doc(campaignId);
    const campaign = await campaignRef.get();

    if (!campaign.exists || campaign.data()?.advertiserId !== advertiserId) {
      throw new Error('Campaign not found or access denied');
    }

    if (campaign.data()?.assetIds?.length >= MAX_ASSETS_PER_CAMPAIGN) {
      throw new Error(`Maximum ${MAX_ASSETS_PER_CAMPAIGN} assets per campaign`);
    }

    const assetRef = db.collection('ad_assets').doc(assetId);
    const asset = await assetRef.get();

    if (!asset.exists || asset.data()?.advertiserId !== advertiserId) {
      throw new Error('Asset not found or access denied');
    }

    if (asset.data()?.status !== 'approved') {
      throw new Error('Asset must be approved before attaching to campaign');
    }

    await campaignRef.update({
      assetIds: [...(campaign.data()?.assetIds || []), assetId],
      updatedAt: serverTimestamp(),
    });

    await assetRef.update({
      usageCount: (asset.data()?.usageCount || 0) + 1,
      updatedAt: serverTimestamp(),
    });
  }

  static async updateCampaignStatus(
    campaignId: string,
    status: AdCampaignStatus,
    advertiserId: string
  ): Promise<void> {
    const campaignRef = db.collection('ad_campaigns').doc(campaignId);
    const campaign = await campaignRef.get();

    if (!campaign.exists || campaign.data()?.advertiserId !== advertiserId) {
      throw new Error('Campaign not found or access denied');
    }

    const updates: any = {
      status,
      updatedAt: serverTimestamp(),
    };

    if (status === 'active') {
      updates.startedAt = serverTimestamp();
    } else if (status === 'paused') {
      updates.pausedAt = serverTimestamp();
    } else if (status === 'completed') {
      updates.completedAt = serverTimestamp();
    }

    await campaignRef.update(updates);
  }

  static async recordAdInteraction(
    placementId: string,
    interactionType: 'impression' | 'click' | 'view' | 'conversion',
    metadata?: {
      viewDuration?: number;
      conversionType?: string;
      conversionValue?: number;
      deviceType?: string;
      region?: string;
    }
  ): Promise<void> {
    const placementRef = db.collection('ad_placements').doc(placementId);
    const placement = await placementRef.get();

    if (!placement.exists) {
      throw new Error('Placement not found');
    }

    const campaignId = placement.data()?.campaignId;
    const campaignRef = db.collection('ad_campaigns').doc(campaignId);
    const campaign = await campaignRef.get();

    if (!campaign.exists) {
      throw new Error('Campaign not found');
    }

    const billing = campaign.data()?.billing;
    let cost = 0;

    if (interactionType === 'impression' && billing.model === 'cpm') {
      cost = billing.bidAmount / 1000;
    } else if (interactionType === 'click' && billing.model === 'cpc') {
      cost = billing.bidAmount;
    } else if (interactionType === 'view' && billing.model === 'cpv') {
      cost = billing.bidAmount;
    } else if (interactionType === 'conversion' && billing.model === 'cpa') {
      cost = billing.bidAmount;
    }

    const updates: any = {
      updatedAt: serverTimestamp(),
    };

    if (interactionType === 'impression') {
      updates.impressionRecorded = true;
      updates['interactionData.impressionAt'] = serverTimestamp();
    } else if (interactionType === 'click') {
      updates.clickRecorded = true;
      updates['interactionData.clickAt'] = serverTimestamp();
    }

    if (metadata) {
      if (metadata.viewDuration) {
        updates['interactionData.viewDuration'] = metadata.viewDuration;
      }
      if (metadata.conversionType) {
        updates['interactionData.conversionAt'] = serverTimestamp();
        updates['interactionData.conversionType'] = metadata.conversionType;
        updates['interactionData.conversionValue'] = metadata.conversionValue || 0;
      }
      if (metadata.deviceType) {
        updates['interactionData.deviceType'] = metadata.deviceType;
      }
      if (metadata.region) {
        updates['interactionData.region'] = metadata.region;
      }
    }

    await placementRef.update(updates);

    const analytics = campaign.data()?.analytics || {};
    const analyticsUpdates: any = {
      'analytics.lastUpdated': serverTimestamp(),
    };

    if (interactionType === 'impression') {
      analyticsUpdates['analytics.impressions'] = (analytics.impressions || 0) + 1;
    } else if (interactionType === 'click') {
      analyticsUpdates['analytics.clicks'] = (analytics.clicks || 0) + 1;
    } else if (interactionType === 'view') {
      analyticsUpdates['analytics.views'] = (analytics.views || 0) + 1;
    } else if (interactionType === 'conversion') {
      analyticsUpdates['analytics.conversions'] = (analytics.conversions || 0) + 1;
    }

    analyticsUpdates['analytics.spent'] = (analytics.spent || 0) + cost;
    analyticsUpdates['budget.spent'] = (campaign.data()?.budget?.spent || 0) + cost;
    analyticsUpdates['budget.remaining'] =
      (campaign.data()?.budget?.remaining || 0) - cost;

    const newClicks = analyticsUpdates['analytics.clicks'] || analytics.clicks || 0;
    const newImpressions =
      analyticsUpdates['analytics.impressions'] || analytics.impressions || 1;
    analyticsUpdates['analytics.ctr'] = (newClicks / newImpressions) * 100;

    const newConversions =
      analyticsUpdates['analytics.conversions'] || analytics.conversions || 0;
    if (newClicks > 0) {
      analyticsUpdates['analytics.conversionRate'] = (newConversions / newClicks) * 100;
    }

    await campaignRef.update(analyticsUpdates);

    await this.updateDailyMetrics(campaignId, interactionType, cost, metadata);
  }

  static async updateDailyMetrics(
    campaignId: string,
    interactionType: string,
    cost: number,
    metadata?: any
  ): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const metricId = `${campaignId}_${today}`;
    const metricRef = db.collection('ad_metrics').doc(metricId);
    const metric = await metricRef.get();

    if (!metric.exists) {
      const newMetric: AdMetrics = {
        id: metricId,
        campaignId,
        date: today,
        impressions: 0,
        clicks: 0,
        views: 0,
        conversions: 0,
        spent: 0,
        ctr: 0,
        conversionRate: 0,
        deviceBreakdown: {},
        regionBreakdown: {},
        hourlyBreakdown: {},
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      await metricRef.set(newMetric);
    }

    const updates: any = {
      updatedAt: serverTimestamp(),
    };

    if (interactionType === 'impression') {
      updates.impressions = (metric.data()?.impressions || 0) + 1;
    } else if (interactionType === 'click') {
      updates.clicks = (metric.data()?.clicks || 0) + 1;
    } else if (interactionType === 'view') {
      updates.views = (metric.data()?.views || 0) + 1;
    } else if (interactionType === 'conversion') {
      updates.conversions = (metric.data()?.conversions || 0) + 1;
    }

    updates.spent = (metric.data()?.spent || 0) + cost;

    if (metadata?.deviceType) {
      const deviceKey = `deviceBreakdown.${metadata.deviceType}`;
      updates[deviceKey] = ((metric.data()?.deviceBreakdown || {})[metadata.deviceType] || 0) + 1;
    }

    if (metadata?.region) {
      const regionKey = `regionBreakdown.${metadata.region}`;
      updates[regionKey] = ((metric.data()?.regionBreakdown || {})[metadata.region] || 0) + 1;
    }

    await metricRef.update(updates);
  }

  static async issueStrike(
    advertiserId: string,
    violation: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    campaignId?: string,
    assetId?: string,
    moderatorId?: string
  ): Promise<void> {
    const strikeRef = db.collection('ad_strikes').doc();
    const strike: AdStrike = {
      id: strikeRef.id,
      advertiserId,
      campaignId,
      assetId,
      violation,
      severity,
      timestamp: Timestamp.now(),
      moderatorId,
    };

    await strikeRef.set(strike);

    const strikes = await this.getAdvertiserStrikes(advertiserId);
    if (strikes.length >= STRIKE_THRESHOLD_BAN) {
      await this.banAdvertiser(advertiserId);
    }
  }

  static async getAdvertiserStrikes(advertiserId: string): Promise<AdStrike[]> {
    const snapshot = await db
      .collection('ad_strikes')
      .where('advertiserId', '==', advertiserId)
      .orderBy('timestamp', 'desc')
      .get();

    return snapshot.docs.map(doc => doc.data() as AdStrike);
  }

  static async banAdvertiser(advertiserId: string): Promise<void> {
    const campaigns = await db
      .collection('ad_campaigns')
      .where('advertiserId', '==', advertiserId)
      .where('status', 'in', ['active', 'pending_review', 'paused'])
      .get();

    const batch = db.batch();

    campaigns.docs.forEach(doc => {
      batch.update(doc.ref, {
        status: 'banned',
        updatedAt: serverTimestamp(),
      });
    });

    await batch.commit();
  }

  static async getCampaignAnalytics(
    campaignId: string,
    advertiserId: string,
    startDate?: string,
    endDate?: string
  ): Promise<any> {
    const campaignRef = db.collection('ad_campaigns').doc(campaignId);
    const campaign = await campaignRef.get();

    if (!campaign.exists || campaign.data()?.advertiserId !== advertiserId) {
      throw new Error('Campaign not found or access denied');
    }

    let query = db
      .collection('ad_metrics')
      .where('campaignId', '==', campaignId)
      .orderBy('date', 'desc');

    if (startDate) {
      query = query.where('date', '>=', startDate);
    }
    if (endDate) {
      query = query.where('date', '<=', endDate);
    }

    const metrics = await query.get();

    return {
      campaign: campaign.data(),
      dailyMetrics: metrics.docs.map(doc => doc.data()),
      summary: campaign.data()?.analytics,
    };
  }
}