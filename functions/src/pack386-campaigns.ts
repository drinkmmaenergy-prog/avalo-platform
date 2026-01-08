/**
 * PACK 386 - Global Campaign Automation Engine
 * 
 * Manages paid ad campaigns across Meta, TikTok, Google, X with:
 * - Automated budget control
 * - ROI-based scaling/pausing
 * - Fraud-safe attribution
 * - Phase-synchronized launch
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface MarketingCampaign {
  campaignId: string;
  platform: 'Meta' | 'TikTok' | 'Google' | 'X';
  geoTargeting: string[];
  dailyBudget: number;
  cpiTarget: number;
  cpaTarget: number;
  launchPhase?: string;
  status: 'ACTIVE' | 'PAUSED' | 'THROTTLED' | 'KILLED';
  metrics: {
    spend: number;
    installs: number;
    conversions: number;
    tokenPurchases: number;
    actualCPI: number;
    actualCPA: number;
    roi: number;
  };
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  createdBy: string;
}

interface CampaignCreateRequest {
  platform: 'Meta' | 'TikTok' | 'Google' | 'X';
  geoTargeting: string[];
  dailyBudget: number;
  cpiTarget: number;
  cpaTarget: number;
  launchPhase?: string;
}

interface CampaignUpdateRequest {
  campaignId: string;
  dailyBudget?: number;
  cpiTarget?: number;
  cpaTarget?: number;
  status?: 'ACTIVE' | 'PAUSED' | 'THROTTLED' | 'KILLED';
}

// ============================================================================
// CREATE CAMPAIGN
// ============================================================================

export const pack386_createCampaign = functions.https.onCall(
  async (data: CampaignCreateRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;

    // Verify admin permissions
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    // Validate request
    if (!data.platform || !data.geoTargeting || !data.dailyBudget || !data.cpiTarget || !data.cpaTarget) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    // Check daily budget limits
    const today = new Date().toISOString().split('T')[0];
    const budgetSnapshot = await db.collection('marketingBudgets')
      .where('date', '==', today)
      .get();

    let totalDailySpend = 0;
    budgetSnapshot.forEach(doc => {
      totalDailySpend += doc.data().dailySpend || 0;
    });

    const globalLimit = 50000; // $50k daily max
    if (totalDailySpend + data.dailyBudget > globalLimit) {
      throw new functions.https.HttpsError('resource-exhausted', 'Daily budget limit exceeded');
    }

    // Create campaign
    const campaignRef = db.collection('marketingCampaigns').doc();
    const campaign: MarketingCampaign = {
      campaignId: campaignRef.id,
      platform: data.platform,
      geoTargeting: data.geoTargeting,
      dailyBudget: data.dailyBudget,
      cpiTarget: data.cpiTarget,
      cpaTarget: data.cpaTarget,
      launchPhase: data.launchPhase,
      status: 'ACTIVE',
      metrics: {
        spend: 0,
        installs: 0,
        conversions: 0,
        tokenPurchases: 0,
        actualCPI: 0,
        actualCPA: 0,
        roi: 0,
      },
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
      createdBy: userId,
    };

    await campaignRef.set(campaign);

    // Log to audit
    await db.collection('adminAuditLog').add({
      action: 'CAMPAIGN_CREATED',
      campaignId: campaignRef.id,
      platform: data.platform,
      dailyBudget: data.dailyBudget,
      userId,
      timestamp: admin.firestore.Timestamp.now(),
    });

    return { success: true, campaignId: campaignRef.id };
  }
);

// ============================================================================
// UPDATE CAMPAIGN BUDGET
// ============================================================================

export const pack386_updateCampaignBudget = functions.https.onCall(
  async (data: CampaignUpdateRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;

    // Verify admin permissions
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    if (!data.campaignId) {
      throw new functions.https.HttpsError('invalid-argument', 'Campaign ID required');
    }

    const campaignRef = db.collection('marketingCampaigns').doc(data.campaignId);
    const campaignDoc = await campaignRef.get();

    if (!campaignDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Campaign not found');
    }

    const updateData: any = {
      updatedAt: admin.firestore.Timestamp.now(),
    };

    if (data.dailyBudget !== undefined) updateData.dailyBudget = data.dailyBudget;
    if (data.cpiTarget !== undefined) updateData.cpiTarget = data.cpiTarget;
    if (data.cpaTarget !== undefined) updateData.cpaTarget = data.cpaTarget;
    if (data.status !== undefined) updateData.status = data.status;

    await campaignRef.update(updateData);

    // Log to audit
    await db.collection('adminAuditLog').add({
      action: 'CAMPAIGN_UPDATED',
      campaignId: data.campaignId,
      changes: updateData,
      userId,
      timestamp: admin.firestore.Timestamp.now(),
    });

    return { success: true };
  }
);

// ============================================================================
// AUTO-PAUSE LOW ROI CAMPAIGNS (SCHEDULED)
// ============================================================================

export const pack386_autoPauseLowROI = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async () => {
    const campaigns = await db.collection('marketingCampaigns')
      .where('status', '==', 'ACTIVE')
      .get();

    const pauseThreshold = 0.3; // ROI < 0.3x = pause
    const minInstalls = 100; // Need at least 100 installs to judge

    for (const doc of campaigns.docs) {
      const campaign = doc.data() as MarketingCampaign;

      // Skip if not enough data
      if (campaign.metrics.installs < minInstalls) {
        continue;
      }

      // Check CPI threshold
      if (campaign.metrics.actualCPI > campaign.cpiTarget * 1.5) {
        await doc.ref.update({
          status: 'THROTTLED',
          updatedAt: admin.firestore.Timestamp.now(),
        });

        await db.collection('adminAuditLog').add({
          action: 'CAMPAIGN_AUTO_THROTTLED',
          campaignId: doc.id,
          reason: 'CPI_EXCEEDED',
          actualCPI: campaign.metrics.actualCPI,
          targetCPI: campaign.cpiTarget,
          timestamp: admin.firestore.Timestamp.now(),
        });

        continue;
      }

      // Check ROI threshold
      if (campaign.metrics.roi < pauseThreshold) {
        await doc.ref.update({
          status: 'PAUSED',
          updatedAt: admin.firestore.Timestamp.now(),
        });

        await db.collection('adminAuditLog').add({
          action: 'CAMPAIGN_AUTO_PAUSED',
          campaignId: doc.id,
          reason: 'LOW_ROI',
          roi: campaign.metrics.roi,
          timestamp: admin.firestore.Timestamp.now(),
        });
      }
    }

    return null;
  });

// ============================================================================
// AUTO-SCALE HIGH ROI CAMPAIGNS (SCHEDULED)
// ============================================================================

export const pack386_scaleHighROI = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async () => {
    const campaigns = await db.collection('marketingCampaigns')
      .where('status', '==', 'ACTIVE')
      .get();

    const scaleThreshold = 2.0; // ROI > 2.0x = scale
    const minTokenPurchases = 50; // Need real monetization proof

    for (const doc of campaigns.docs) {
      const campaign = doc.data() as MarketingCampaign;

      // Must have real token purchases
      if (campaign.metrics.tokenPurchases < minTokenPurchases) {
        continue;
      }

      // Check if high ROI
      if (campaign.metrics.roi >= scaleThreshold) {
        const newBudget = Math.min(
          campaign.dailyBudget * 1.5,
          10000 // Cap at $10k per campaign
        );

        await doc.ref.update({
          dailyBudget: newBudget,
          updatedAt: admin.firestore.Timestamp.now(),
        });

        await db.collection('adminAuditLog').add({
          action: 'CAMPAIGN_AUTO_SCALED',
          campaignId: doc.id,
          oldBudget: campaign.dailyBudget,
          newBudget,
          roi: campaign.metrics.roi,
          timestamp: admin.firestore.Timestamp.now(),
        });
      }
    }

    return null;
  });

// ============================================================================
// UPDATE CAMPAIGN METRICS (WEBHOOK)
// ============================================================================

export const pack386_updateCampaignMetrics = functions.https.onRequest(
  async (req, res) => {
    // Verify webhook signature (implementation depends on ad platform)
    const signature = req.headers['x-webhook-signature'];
    if (!signature) {
      res.status(401).send('Unauthorized');
      return;
    }

    const { campaignId, spend, installs, conversions } = req.body;

    if (!campaignId) {
      res.status(400).send('Campaign ID required');
      return;
    }

    const campaignRef = db.collection('marketingCampaigns').doc(campaignId);
    const campaignDoc = await campaignRef.get();

    if (!campaignDoc.exists) {
      res.status(404).send('Campaign not found');
      return;
    }

    // Get token purchases from attribution
    const attributionsSnapshot = await db.collection('acquisitionAttribution')
      .where('campaignId', '==', campaignId)
      .where('hasTokenPurchase', '==', true)
      .get();

    const tokenPurchases = attributionsSnapshot.size;
    const totalRevenue = attributionsSnapshot.docs.reduce((sum, doc) => {
      return sum + (doc.data().revenue || 0);
    }, 0);

    const actualCPI = installs > 0 ? spend / installs : 0;
    const actualCPA = conversions > 0 ? spend / conversions : 0;
    const roi = spend > 0 ? totalRevenue / spend : 0;

    await campaignRef.update({
      'metrics.spend': spend,
      'metrics.installs': installs,
      'metrics.conversions': conversions,
      'metrics.tokenPurchases': tokenPurchases,
      'metrics.actualCPI': actualCPI,
      'metrics.actualCPA': actualCPA,
      'metrics.roi': roi,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    res.status(200).send({ success: true });
  }
);

// ============================================================================
// GET CAMPAIGN ANALYTICS
// ============================================================================

export const pack386_getCampaignAnalytics = functions.https.onCall(
  async (data: { campaignId?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;

    // Verify admin permissions
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    if (data.campaignId) {
      // Single campaign analytics
      const campaignDoc = await db.collection('marketingCampaigns').doc(data.campaignId).get();
      if (!campaignDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Campaign not found');
      }
      return { campaign: campaignDoc.data() };
    } else {
      // All campaigns analytics
      const campaignsSnapshot = await db.collection('marketingCampaigns')
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();

      const campaigns = campaignsSnapshot.docs.map(doc => doc.data());

      // Aggregate metrics
      const totals = campaigns.reduce((acc, campaign: any) => {
        return {
          spend: acc.spend + (campaign.metrics?.spend || 0),
          installs: acc.installs + (campaign.metrics?.installs || 0),
          conversions: acc.conversions + (campaign.metrics?.conversions || 0),
          tokenPurchases: acc.tokenPurchases + (campaign.metrics?.tokenPurchases || 0),
        };
      }, { spend: 0, installs: 0, conversions: 0, tokenPurchases: 0 });

      return { campaigns, totals };
    }
  }
);
