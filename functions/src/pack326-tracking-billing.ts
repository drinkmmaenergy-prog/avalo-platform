/**
 * PACK 326 — Impression & Click Tracking + Billing
 * Real-time tracking with anti-fraud protection and automated billing
 */

import { https } from 'firebase-functions';
import { db, generateId, serverTimestamp } from './init';
import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { spendTokens } from './pack277-wallet-service';
import {
  TrackImpressionRequest,
  TrackImpressionResponse,
  TrackClickRequest,
  TrackClickResponse,
  ADS_DELIVERY_CONFIG,
  AdsImpression,
  AdsClick,
  AdsCampaign,
} from './types/pack326-ads.types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if campaign is active and has budget
 */
async function validateCampaign(campaignId: string): Promise<AdsCampaign> {
  const campaignDoc = await db.collection('adsCampaigns').doc(campaignId).get();
  
  if (!campaignDoc.exists) {
    throw new HttpsError('not-found', 'Campaign not found');
  }
  
  const campaign = campaignDoc.data() as AdsCampaign;
  
  if (campaign.status !== 'ACTIVE') {
    throw new HttpsError('failed-precondition', 'Campaign is not active');
  }
  
  const remainingBudget = campaign.budgetTokens - campaign.spentTokens;
  if (remainingBudget <= 0) {
    // Auto-pause campaign if budget exhausted
    await db.collection('adsCampaigns').doc(campaignId).update({
      status: 'ENDED',
      updatedAt: new Date().toISOString(),
    });
    
    throw new HttpsError('resource-exhausted', 'Campaign budget exhausted');
  }
  
  return campaign;
}

/**
 * Check if creative is approved
 */
async function validateCreative(creativeId: string): Promise<boolean> {
  const creativeDoc = await db.collection('adsCreatives').doc(creativeId).get();
  
  if (!creativeDoc.exists) {
    throw new HttpsError('not-found', 'Creative not found');
  }
  
  const creative = creativeDoc.data();
  return creative?.status === 'APPROVED';
}

/**
 * Get recent impressions count for fraud check
 */
async function getRecentImpressions(
  viewerUserId: string,
  creativeId: string,
  minutesAgo: number
): Promise<number> {
  const cutoffTime = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
  
  const snapshot = await db
    .collection('adsImpressions')
    .where('viewerUserId', '==', viewerUserId)
    .where('creativeId', '==', creativeId)
    .where('createdAt', '>=', cutoffTime)
    .get();
  
  return snapshot.size;
}

/**
 * Get recent clicks for fraud check
 */
async function getRecentClicks(
  viewerUserId: string,
  creativeId: string,
  ipAddress: string | null,
  hoursAgo: number
): Promise<number> {
  const cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  
  let query = db
    .collection('adsClicks')
    .where('creativeId', '==', creativeId)
    .where('createdAt', '>=', cutoffTime);
  
  // If IP provided, check clicks from same IP
  // Note: We'd need to store IP hash in the click record
  const snapshot = await query.get();
  
  // Filter by user or IP in memory if needed
  return snapshot.docs.filter(doc => {
    const data = doc.data();
    return data.viewerUserId === viewerUserId;
  }).length;
}

/**
 * Get campaign impressions count for CPM billing
 */
async function getCampaignImpressions(campaignId: string): Promise<number> {
  const snapshot = await db
    .collection('adsImpressions')
    .where('campaignId', '==', campaignId)
    .get();
  
  return snapshot.size;
}

/**
 * Create fraud alert
 */
async function createFraudAlert(
  campaignId: string,
  creativeId: string | null,
  alertType: string,
  severity: string,
  details: Record<string, any>
): Promise<void> {
  const alertId = generateId();
  
  await db.collection('fraudAlerts').doc(alertId).set({
    id: alertId,
    campaignId,
    creativeId,
    alertType,
    severity,
    details,
    createdAt: new Date().toISOString(),
  });
  
  console.warn(`[FRAUD ALERT] ${alertType} for campaign ${campaignId}:`, details);
}

/**
 * Bill CPM (every 1000 impressions)
 */
async function billCPM(campaign: AdsCampaign): Promise<void> {
  const impressionCount = await getCampaignImpressions(campaign.id);
  const completedThousands = Math.floor(impressionCount / 1000);
  
  // Check if we need to bill (e.g., at 1000, 2000, 3000 impressions)
  const lastBilledThousands = Math.floor((impressionCount - 1) / 1000);
  
  if (completedThousands > lastBilledThousands) {
    // Bill for the completed thousand
    const tokensToCharge = campaign.pricing.cpmTokens || 40;
    
    if (!campaign.advertiserUserId) {
      // Internal Avalo campaign - no billing needed
      return;
    }
    
    const spendResult = await spendTokens({
      userId: campaign.advertiserUserId,
      amountTokens: tokensToCharge,
      source: 'MEDIA', // Using MEDIA source for ads
      relatedId: campaign.id,
      creatorId: undefined, // No creator for ads (100% Avalo revenue)
      metadata: {
        campaignId: campaign.id,
        billingType: 'CPM',
        impressionCount: completedThousands * 1000,
      },
      contextType: 'AVALO_ONLY_REVENUE', // 100% Avalo revenue
      contextRef: `ads:campaign:${campaign.id}`,
    });
    
    if (spendResult.success) {
      // Update campaign spent tokens
      await db.collection('adsCampaigns').doc(campaign.id).update({
        spentTokens: FieldValue.increment(tokensToCharge),
        updatedAt: new Date().toISOString(),
      });
      
      // Record billing batch
      await db.collection('cpmBillingBatches').add({
        campaignId: campaign.id,
        impressionCount: completedThousands * 1000,
        tokensCharged: tokensToCharge,
        billedAt: new Date().toISOString(),
      });
    } else {
      // Insufficient funds - pause campaign
      await db.collection('adsCampaigns').doc(campaign.id).update({
        status: 'PAUSED',
        pauseReason: 'Insufficient balance for CPM billing',
        updatedAt: new Date().toISOString(),
      });
    }
  }
}

/**
 * Bill CPC (immediate per click)
 */
async function billCPC(campaign: AdsCampaign, clickId: string): Promise<boolean> {
  const tokensToCharge = campaign.pricing.cpcTokens || 8;
  
  if (!campaign.advertiserUserId) {
    // Internal Avalo campaign - no billing needed
    return true;
  }
  
  const spendResult = await spendTokens({
    userId: campaign.advertiserUserId,
    amountTokens: tokensToCharge,
    source: 'MEDIA',
    relatedId: campaign.id,
    creatorId: undefined, // No creator for ads (100% Avalo revenue)
    metadata: {
      campaignId: campaign.id,
      billingType: 'CPC',
      clickId,
    },
    contextType: 'AVALO_ONLY_REVENUE', // 100% Avalo revenue
    contextRef: `ads:campaign:${campaign.id}`,
  });
  
  if (spendResult.success) {
    // Update campaign spent tokens
    await db.collection('adsCampaigns').doc(campaign.id).update({
      spentTokens: FieldValue.increment(tokensToCharge),
      updatedAt: new Date().toISOString(),
    });
    
    // Record CPC billing
    await db.collection('cpcBillingRecords').add({
      campaignId: campaign.id,
      clickId,
      tokensCharged: tokensToCharge,
      billedAt: new Date().toISOString(),
    });
    
    return true;
  } else {
    // Insufficient funds - pause campaign
    await db.collection('adsCampaigns').doc(campaign.id).update({
      status: 'PAUSED',
      pauseReason: 'Insufficient balance for CPC billing',
      updatedAt: new Date().toISOString(),
    });
    
    return false;
  }
}

// ============================================================================
// IMPRESSION TRACKING
// ============================================================================

/**
 * Track ad impression with anti-fraud protection
 */
export const pack326_trackAdImpression = https.onCall(
  async (request): Promise<TrackImpressionResponse> => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
      const { campaignId, creativeId, viewerUserId } = data as TrackImpressionRequest;
      
      // Security: Ensure viewer is the authenticated user
      if (viewerUserId !== auth.uid) {
        throw new HttpsError('permission-denied', 'Cannot track impression for another user');
      }
      
      // Validate campaign and creative
      const campaign = await validateCampaign(campaignId);
      const creativeApproved = await validateCreative(creativeId);
      
      if (!creativeApproved) {
        throw new HttpsError('failed-precondition', 'Creative not approved');
      }
      
      // Anti-fraud: Check impression frequency
      const recentImpressions = await getRecentImpressions(
        viewerUserId,
        creativeId,
        10 // last 10 minutes
      );
      
      if (recentImpressions >= ADS_DELIVERY_CONFIG.ANTI_FRAUD.MAX_IMPRESSIONS_PER_USER_10M) {
        // Log suspicious activity but don't block
        await createFraudAlert(
          campaignId,
          creativeId,
          'IMPRESSION_PATTERN',
          'LOW',
          {
            viewerUserId,
            recentImpressions,
            message: 'User exceeded impression limit',
          }
        );
        
        return {
          success: true,
          impressionId: '', // Don't record duplicate
          shouldBill: false,
        };
      }
      
      // Record impression
      const impressionId = generateId();
      const impression: AdsImpression = {
        id: impressionId,
        campaignId,
        creativeId,
        viewerUserId,
        createdAt: new Date().toISOString(),
      };
      
      await db.collection('adsImpressions').doc(impressionId).set(impression);
      
      // Bill CPM if applicable
      let shouldBill = false;
      if (campaign.billingModel === 'CPM') {
        await billCPM(campaign);
        shouldBill = true;
      }
      
      return {
        success: true,
        impressionId,
        shouldBill,
      };
    } catch (error: any) {
      console.error('Track impression error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', error.message || 'Failed to track impression');
    }
  }
);

// ============================================================================
// CLICK TRACKING
// ============================================================================

/**
 * Track ad click with anti-fraud protection and immediate CPC billing
 */
export const pack326_trackAdClick = https.onCall(
  async (request): Promise<TrackClickResponse> => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
      const { campaignId, creativeId, viewerUserId, ipAddress } = data as TrackClickRequest;
      
      // Security: Ensure viewer is the authenticated user
      if (viewerUserId !== auth.uid) {
        throw new HttpsError('permission-denied', 'Cannot track click for another user');
      }
      
      // Validate campaign and creative
      const campaign = await validateCampaign(campaignId);
      const creativeApproved = await validateCreative(creativeId);
      
      if (!creativeApproved) {
        throw new HttpsError('failed-precondition', 'Creative not approved');
      }
      
      // Anti-fraud: Check click frequency
      const recentClicks = await getRecentClicks(
        viewerUserId,
        creativeId,
        ipAddress || null,
        24 // last 24 hours
      );
      
      if (recentClicks >= ADS_DELIVERY_CONFIG.ANTI_FRAUD.MAX_CLICKS_PER_IP_24H) {
        // Log suspicious activity and block
        await createFraudAlert(
          campaignId,
          creativeId,
          'SUSPICIOUS_IP',
          'HIGH',
          {
            viewerUserId,
            ipAddress,
            recentClicks,
            message: 'User exceeded click limit',
          }
        );
        
        return {
          success: false,
          error: 'Too many clicks detected',
        };
      }
      
      // Record click
      const clickId = generateId();
      const click: AdsClick = {
        id: clickId,
        campaignId,
        creativeId,
        viewerUserId,
        createdAt: new Date().toISOString(),
      };
      
      await db.collection('adsClicks').doc(clickId).set(click);
      
      // Bill CPC if applicable
      let billed = false;
      if (campaign.billingModel === 'CPC') {
        billed = await billCPC(campaign, clickId);
      }
      
      // Check for suspicious CTR
      const impressions = await getCampaignImpressions(campaignId);
      const clicks = (await db.collection('adsClicks').where('campaignId', '==', campaignId).get()).size;
      const ctr = impressions > 0 ? clicks / impressions : 0;
      
      if (ctr > ADS_DELIVERY_CONFIG.ANTI_FRAUD.HIGH_CTR_THRESHOLD) {
        await createFraudAlert(
          campaignId,
          null,
          'HIGH_CTR',
          'MEDIUM',
          {
            ctr: ctr.toFixed(4),
            impressions,
            clicks,
            message: 'Campaign CTR exceeds threshold',
          }
        );
      }
      
      return {
        success: true,
        clickId,
        billed,
      };
    } catch (error: any) {
      console.error('Track click error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', error.message || 'Failed to track click');
    }
  }
);

// ============================================================================
// ANALYTICS ENDPOINTS
// ============================================================================

/**
 * Get campaign analytics
 */
export const pack326_getCampaignAnalytics = https.onCall(
  async (request) => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
      const { campaignId } = data;
      
      // Validate ownership
      const campaignDoc = await db.collection('adsCampaigns').doc(campaignId).get();
      
      if (!campaignDoc.exists) {
        throw new HttpsError('not-found', 'Campaign not found');
      }
      
      const campaign = campaignDoc.data() as AdsCampaign;
      
      if (campaign.advertiserUserId !== auth.uid) {
        throw new HttpsError('permission-denied', 'Not your campaign');
      }
      
      // Get impressions and clicks
      const impressionsSnapshot = await db
        .collection('adsImpressions')
        .where('campaignId', '==', campaignId)
        .get();
      
      const clicksSnapshot = await db
        .collection('adsClicks')
        .where('campaignId', '==', campaignId)
        .get();
      
      const impressions = impressionsSnapshot.size;
      const clicks = clicksSnapshot.size;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const remainingBudget = campaign.budgetTokens - campaign.spentTokens;
      
      // Calculate days remaining
      const endDate = new Date(campaign.endAt);
      const now = new Date();
      const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      
      // Calculate average costs
      let averageCPM;
      let averageCPC;
      
      if (campaign.billingModel === 'CPM' && impressions > 0) {
        averageCPM = (campaign.spentTokens / impressions) * 1000;
      }
      
      if (campaign.billingModel === 'CPC' && clicks > 0) {
        averageCPC = campaign.spentTokens / clicks;
      }
      
      return {
        success: true,
        analytics: {
          campaignId,
          impressions,
          clicks,
          ctr: ctr.toFixed(2),
          spentTokens: campaign.spentTokens,
          remainingBudget,
          averageCPM,
          averageCPC,
          daysRemaining,
        },
      };
    } catch (error: any) {
      console.error('Get campaign analytics error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', error.message || 'Failed to get analytics');
    }
  }
);

/**
 * Get creative-level analytics
 */
export const pack326_getCreativeAnalytics = https.onCall(
  async (request) => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    
    try {
      const { creativeId } = data;
      
      // Get creative
      const creativeDoc = await db.collection('adsCreatives').doc(creativeId).get();
      
      if (!creativeDoc.exists) {
        throw new HttpsError('not-found', 'Creative not found');
      }
      
      const creative = creativeDoc.data();
      
      // Validate ownership
      const campaignDoc = await db.collection('adsCampaigns').doc(creative.campaignId).get();
      const campaign = campaignDoc.data() as AdsCampaign;
      
      if (campaign.advertiserUserId !== auth.uid) {
        throw new HttpsError('permission-denied', 'Not your creative');
      }
      
      // Get impressions and clicks
      const impressionsSnapshot = await db
        .collection('adsImpressions')
        .where('creativeId', '==', creativeId)
        .get();
      
      const clicksSnapshot = await db
        .collection('adsClicks')
        .where('creativeId', '==', creativeId)
        .get();
      
      const impressions = impressionsSnapshot.size;
      const clicks = clicksSnapshot.size;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      
      // Estimate spent tokens for this creative
      let spentTokens = 0;
      if (campaign.billingModel === 'CPM') {
        spentTokens = Math.floor(impressions / 1000) * (campaign.pricing.cpmTokens || 40);
      } else if (campaign.billingModel === 'CPC') {
        spentTokens = clicks * (campaign.pricing.cpcTokens || 8);
      }
      
      return {
        success: true,
        analytics: {
          creativeId,
          impressions,
          clicks,
          ctr: ctr.toFixed(2),
          spentTokens,
        },
      };
    } catch (error: any) {
      console.error('Get creative analytics error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', error.message || 'Failed to get creative analytics');
    }
  }
);