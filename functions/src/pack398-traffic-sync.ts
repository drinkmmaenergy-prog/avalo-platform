/**
 * PACK 398 - INFLUENCER & PAID TRAFFIC SYNCHRONIZER
 * 
 * Controls campaign IDs, influencer cohorts, fraud detection,
 * LTV/CAC prediction, and auto-stops campaigns when metrics fail.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Campaign Status
export enum CampaignStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  STOPPED = 'STOPPED',
  COMPLETED = 'COMPLETED',
}

// Campaign Type
export enum CampaignType {
  INFLUENCER = 'INFLUENCER',
  PAID_SOCIAL = 'PAID_SOCIAL',
  PAID_SEARCH = 'PAID_SEARCH',
  DISPLAY = 'DISPLAY',
  AFFILIATE = 'AFFILIATE',
}

// Campaign
export interface Campaign {
  campaignId: string;
  campaignName: string;
  campaignType: CampaignType;
  status: CampaignStatus;
  countryCode: string;
  platform: 'ios' | 'android' | 'both';
  budgetDaily: number;
  budgetTotal: number;
  budgetSpent: number;
  startDate: admin.firestore.Timestamp;
  endDate?: admin.firestore.Timestamp;
  targetCAC: number;
  currentCAC: number;
  predictedLTV: number;
  currentLTV: number;
  targetInstalls: number;
  currentInstalls: number;
  targetCPI: number;
  currentCPI: number;
  refundRate: number;
  refundThreshold: number;
  fraudScore: number;
  reviewRisk: 'low' | 'medium' | 'high';
  autoStopEnabled: boolean;
  autoStopReason?: string;
  trackingUrls: {
    [platform: string]: string;
  };
  metadata?: any;
  createdAt: admin.firestore.Timestamp;
  createdBy: string;
}

// Influencer Cohort
export interface InfluencerCohort {
  cohortId: string;
  influencerId: string;
  influencerName: string;
  influencerHandle: string;
  platform: 'instagram' | 'tiktok' | 'youtube' | 'twitter';
  followerCount: number;
  campaignId: string;
  trackingCode: string;
  conversionRate: number;
  totalClicks: number;
  totalInstalls: number;
  totalRevenue: number;
  averageLTV: number;
  fraudScore: number;
  performance: 'excellent' | 'good' | 'average' | 'poor';
  status: 'active' | 'paused' | 'ended';
  startDate: admin.firestore.Timestamp;
  endDate?: admin.firestore.Timestamp;
}

// LTV Prediction
export interface LTVPrediction {
  userId: string;
  cohort?: string;
  campaignId?: string;
  predictedLTV: number;
  actualLTV: number;
  confidence: number;
  predictionDate: admin.firestore.Timestamp;
  factors: {
    daysSinceInstall: number;
    sessionCount: number;
    purchaseCount: number;
    totalSpent: number;
    engagementScore: number;
    retentionDay7: boolean;
    retentionDay30: boolean;
  };
}

// CAC Tracking
export interface CACTracking {
  campaignId: string;
  date: string;
  impressions: number;
  clicks: number;
  installs: number;
  totalSpend: number;
  cac: number;
  cpi: number;
  ctr: number;
  conversionRate: number;
  timestamp: admin.firestore.Timestamp;
}

// Campaign ROI
export interface CampaignROI {
  campaignId: string;
  period: string;
  totalSpend: number;
  totalRevenue: number;
  totalInstalls: number;
  avgLTV: number;
  avgCAC: number;
  roi: number;
  paybackPeriodDays: number;
  profitMargin: number;
  updatedAt: admin.firestore.Timestamp;
}

const db = admin.firestore();

/**
 * Create campaign
 */
export const createCampaign = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { campaignName, campaignType, countryCode, platform, budget, targetCAC, targetCPI } = data;

  if (!campaignName || !campaignType || !countryCode || !platform) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid campaign data');
  }

  const campaignId = `camp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const campaign: Campaign = {
    campaignId,
    campaignName,
    campaignType,
    status: CampaignStatus.DRAFT,
    countryCode,
    platform,
    budgetDaily: budget?.daily || 0,
    budgetTotal: budget?.total || 0,
    budgetSpent: 0,
    startDate: data.startDate || admin.firestore.Timestamp.now(),
    targetCAC: targetCAC || 50,
    currentCAC: 0,
    predictedLTV: 0,
    currentLTV: 0,
    targetInstalls: data.targetInstalls || 1000,
    currentInstalls: 0,
    targetCPI: targetCPI || 3,
    currentCPI: 0,
    refundRate: 0,
    refundThreshold: 0.05, // 5%
    fraudScore: 0,
    reviewRisk: 'low',
    autoStopEnabled: data.autoStopEnabled !== false,
    trackingUrls: data.trackingUrls || {},
    metadata: data.metadata || {},
    createdAt: admin.firestore.Timestamp.now(),
    createdBy: context.auth.uid,
  };

  await db.collection('campaigns').doc(campaignId).set(campaign);

  return { success: true, campaignId };
});

/**
 * Update campaign status
 */
export const updateCampaignStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { campaignId, status, reason } = data;

  if (!campaignId || !status) {
    throw new functions.https.HttpsError('invalid-argument', 'Campaign ID and status required');
  }

  const updates: any = {
    status,
    updatedAt: admin.firestore.Timestamp.now(),
  };

  if (status === CampaignStatus.STOPPED && reason) {
    updates.autoStopReason = reason;
  }

  await db.collection('campaigns').doc(campaignId).update(updates);

  // Log event
  await db.collection('campaign_events').add({
    campaignId,
    eventType: 'STATUS_CHANGE',
    newStatus: status,
    reason: reason || 'Manual update',
    timestamp: admin.firestore.Timestamp.now(),
  });

  return { success: true };
});

/**
 * Track campaign performance
 */
export const trackCampaignPerformance = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { campaignId, metrics } = data;

  if (!campaignId || !metrics) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid tracking data');
  }

  const date = new Date().toISOString().split('T')[0];
  const trackingId = `${campaignId}_${date}`;

  const cac = metrics.installs > 0 ? metrics.totalSpend / metrics.installs : 0;
  const cpi = metrics.installs > 0 ? metrics.totalSpend / metrics.installs : 0;
  const ctr = metrics.impressions > 0 ? metrics.clicks / metrics.impressions : 0;
  const conversionRate = metrics.clicks > 0 ? metrics.installs / metrics.clicks : 0;

  const tracking: CACTracking = {
    campaignId,
    date,
    impressions: metrics.impressions || 0,
    clicks: metrics.clicks || 0,
    installs: metrics.installs || 0,
    totalSpend: metrics.totalSpend || 0,
    cac,
    cpi,
    ctr,
    conversionRate,
    timestamp: admin.firestore.Timestamp.now(),
  };

  await db.collection('cac_tracking').doc(trackingId).set(tracking, { merge: true });

  // Update campaign metrics
  await db.collection('campaigns').doc(campaignId).update({
    currentInstalls: admin.firestore.FieldValue.increment(metrics.installs || 0),
    budgetSpent: admin.firestore.FieldValue.increment(metrics.totalSpend || 0),
    currentCAC: cac,
    currentCPI: cpi,
  });

  return { success: true, cac, cpi };
});

/**
 * Create influencer cohort
 */
export const createInfluencerCohort = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { influencerName, influencerHandle, platform, followerCount, campaignId } = data;

  if (!influencerName || !influencerHandle || !platform || !campaignId) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid influencer data');
  }

  const cohortId = `cohort_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const trackingCode = `inf_${Math.random().toString(36).substr(2, 8).toUpperCase()}`;

  const cohort: InfluencerCohort = {
    cohortId,
    influencerId: data.influencerId || cohortId,
    influencerName,
    influencerHandle,
    platform,
    followerCount: followerCount || 0,
    campaignId,
    trackingCode,
    conversionRate: 0,
    totalClicks: 0,
    totalInstalls: 0,
    totalRevenue: 0,
    averageLTV: 0,
    fraudScore: 0,
    performance: 'average',
    status: 'active',
    startDate: admin.firestore.Timestamp.now(),
  };

  await db.collection('influencer_cohorts').doc(cohortId).set(cohort);

  return { success: true, cohortId, trackingCode };
});

/**
 * Predict LTV for user
 */
export const predictUserLTV = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = context.auth.uid;
  const userDoc = await db.collection('users').doc(userId).get();

  if (!userDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'User not found');
  }

  const userData = userDoc.data();

  // Get user activity metrics
  const sessionsQuery = await db.collection('sessions')
    .where('userId', '==', userId)
    .get();

  const purchasesQuery = await db.collection('purchases')
    .where('userId', '==', userId)
    .get();

  const daysSinceInstall = Math.floor(
    (Date.now() - userData?.createdAt?.toMillis()) / (1000 * 60 * 60 * 24)
  );

  const totalSpent = purchasesQuery.docs.reduce((sum, doc) => {
    return sum + (doc.data().amount || 0);
  }, 0);

  const factors = {
    daysSinceInstall,
    sessionCount: sessionsQuery.size,
    purchaseCount: purchasesQuery.size,
    totalSpent,
    engagementScore: userData?.engagementScore || 0,
    retentionDay7: daysSinceInstall >= 7,
    retentionDay30: daysSinceInstall >= 30,
  };

  // Simple LTV prediction model (should use ML in production)
  let predictedLTV = 0;
  
  if (factors.purchaseCount > 0) {
    predictedLTV = factors.totalSpent * 1.5; // Simple multiplier
  } else {
    predictedLTV = factors.sessionCount * 0.5; // Engagement-based prediction
  }

  const prediction: LTVPrediction = {
    userId,
    cohort: userData?.cohort,
    campaignId: userData?.acquisitionCampaign,
    predictedLTV,
    actualLTV: totalSpent,
    confidence: factors.purchaseCount > 0 ? 0.8 : 0.3,
    predictionDate: admin.firestore.Timestamp.now(),
    factors,
  };

  await db.collection('ltv_predictions').add(prediction);

  return { predictedLTV, confidence: prediction.confidence };
});

/**
 * Monitor campaigns and auto-stop if needed
 */
export const monitorCampaigns = functions.pubsub.schedule('every 15 minutes').onRun(async (context) => {
  const campaignsQuery = await db.collection('campaigns')
    .where('status', '==', CampaignStatus.ACTIVE)
    .where('autoStopEnabled', '==', true)
    .get();

  for (const campaignDoc of campaignsQuery.docs) {
    const campaign = campaignDoc.data() as Campaign;

    // Check CAC vs LTV
    if (campaign.currentCAC > 0 && campaign.currentLTV > 0) {
      if (campaign.currentCAC > campaign.currentLTV) {
        await stopCampaign(campaign.campaignId, 'CAC exceeds LTV');
        continue;
      }
    }

    // Check target CAC
    if (campaign.currentCAC > campaign.targetCAC * 1.2) {
      await stopCampaign(campaign.campaignId, 'CAC exceeds target by 20%');
      continue;
    }

    // Check refund rate
    const refundRate = await calculateRefundRate(campaign.campaignId);
    if (refundRate > campaign.refundThreshold) {
      await stopCampaign(campaign.campaignId, `Refund rate ${(refundRate * 100).toFixed(1)}% exceeds threshold`);
      continue;
    }

    // Check review risk
    const reviewRisk = await checkCampaignReviewRisk(campaign.campaignId);
    if (reviewRisk === 'high') {
      await stopCampaign(campaign.campaignId, 'High review risk detected');
      continue;
    }

    // Check fraud score
    const fraudScore = await calculateCampaignFraudScore(campaign.campaignId);
    if (fraudScore > 0.7) {
      await stopCampaign(campaign.campaignId, `High fraud score: ${fraudScore.toFixed(2)}`);
      continue;
    }

    // Update campaign metrics
    await campaignDoc.ref.update({
      refundRate,
      reviewRisk,
      fraudScore,
    });
  }

  return null;
});

/**
 * Calculate campaign ROI
 */
export const calculateCampaignROI = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
  const campaignsQuery = await db.collection('campaigns')
    .where('status', 'in', [CampaignStatus.ACTIVE, CampaignStatus.COMPLETED])
    .get();

  for (const campaignDoc of campaignsQuery.docs) {
    const campaign = campaignDoc.data() as Campaign;

    // Get all users from this campaign
    const usersQuery = await db.collection('users')
      .where('acquisitionCampaign', '==', campaign.campaignId)
      .get();

    let totalRevenue = 0;
    let totalLTV = 0;

    for (const userDoc of usersQuery.docs) {
      const userId = userDoc.id;

      // Get user purchases
      const purchasesQuery = await db.collection('purchases')
        .where('userId', '==', userId)
        .get();

      const userRevenue = purchasesQuery.docs.reduce((sum, doc) => {
        return sum + (doc.data().amount || 0);
      }, 0);

      totalRevenue += userRevenue;

      // Get LTV prediction
      const ltvQuery = await db.collection('ltv_predictions')
        .where('userId', '==', userId)
        .orderBy('predictionDate', 'desc')
        .limit(1)
        .get();

      if (!ltvQuery.empty) {
        totalLTV += ltvQuery.docs[0].data().predictedLTV || 0;
      }
    }

    const totalInstalls = usersQuery.size;
    const avgLTV = totalInstalls > 0 ? totalLTV / totalInstalls : 0;
    const avgCAC = campaign.currentCAC || 0;
    const roi = campaign.budgetSpent > 0 ? (totalRevenue / campaign.budgetSpent - 1) * 100 : 0;
    const paybackPeriodDays = avgCAC > 0 ? Math.ceil((avgCAC / (avgLTV / 365)) * 365) : 0;
    const profitMargin = totalRevenue > 0 ? ((totalRevenue - campaign.budgetSpent) / totalRevenue) * 100 : 0;

    const period = new Date().toISOString().split('T')[0];

    const roiData: CampaignROI = {
      campaignId: campaign.campaignId,
      period,
      totalSpend: campaign.budgetSpent,
      totalRevenue,
      totalInstalls,
      avgLTV,
      avgCAC,
      roi,
      paybackPeriodDays,
      profitMargin,
      updatedAt: admin.firestore.Timestamp.now(),
    };

    await db.collection('campaign_roi').doc(`${campaign.campaignId}_${period}`).set(roiData);

    // Update campaign LTV
    await campaignDoc.ref.update({
      currentLTV: avgLTV,
    });
  }

  return null;
});

/**
 * Get campaign dashboard data
 */
export const getCampaignDashboard = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { campaignId } = data;

  let campaignsQuery = db.collection('campaigns');
  if (campaignId) {
    const campaignDoc = await db.collection('campaigns').doc(campaignId).get();
    const campaigns = campaignDoc.exists ? [{ id: campaignDoc.id, ...campaignDoc.data() }] : [];

    // Get specific campaign data
    const cacTracking = await db.collection('cac_tracking')
      .where('campaignId', '==', campaignId)
      .orderBy('timestamp', 'desc')
      .limit(30)
      .get();

    const roi = await db.collection('campaign_roi')
      .where('campaignId', '==', campaignId)
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get();

    const influencers = await db.collection('influencer_cohorts')
      .where('campaignId', '==', campaignId)
      .get();

    return {
      campaigns,
      cacTracking: cacTracking.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      roi: roi.empty ? null : { id: roi.docs[0].id, ...roi.docs[0].data() },
      influencers: influencers.docs.map(doc => ({ id: doc.id, ...doc.data() })),
    };
  }

  // Get all campaigns
  const campaignsSnapshot = await campaignsQuery.orderBy('createdAt', 'desc').limit(50).get();

  return {
    campaigns: campaignsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
  };
});

/**
 * Stop campaign
 */
async function stopCampaign(campaignId: string, reason: string) {
  await db.collection('campaigns').doc(campaignId).update({
    status: CampaignStatus.STOPPED,
    autoStopReason: reason,
    updatedAt: admin.firestore.Timestamp.now(),
  });

  await db.collection('campaign_events').add({
    campaignId,
    eventType: 'AUTO_STOP',
    reason,
    timestamp: admin.firestore.Timestamp.now(),
  });
}

/**
 * Calculate refund rate for campaign
 */
async function calculateRefundRate(campaignId: string): Promise<number> {
  const usersQuery = await db.collection('users')
    .where('acquisitionCampaign', '==', campaignId)
    .get();

  if (usersQuery.empty) {
    return 0;
  }

  const totalUsers = usersQuery.size;
  let refundedUsers = 0;

  for (const userDoc of usersQuery.docs) {
    const refundsQuery = await db.collection('refunds')
      .where('userId', '==', userDoc.id)
      .limit(1)
      .get();

    if (!refundsQuery.empty) {
      refundedUsers++;
    }
  }

  return refundedUsers / totalUsers;
}

/**
 * Check campaign review risk
 */
async function checkCampaignReviewRisk(campaignId: string): Promise<'low' | 'medium' | 'high'> {
  const usersQuery = await db.collection('users')
    .where('acquisitionCampaign', '==', campaignId)
    .get();

  if (usersQuery.empty) {
    return 'low';
  }

  let totalNegativeReviews = 0;
  let totalReviews = 0;

  for (const userDoc of usersQuery.docs) {
    const reviewsQuery = await db.collection('reviews')
      .where('userId', '==', userDoc.id)
      .get();

    totalReviews += reviewsQuery.size;

    reviewsQuery.forEach(reviewDoc => {
      const review = reviewDoc.data();
      if (review.rating < 3) {
        totalNegativeReviews++;
      }
    });
  }

  if (totalReviews === 0) {
    return 'low';
  }

  const negativeRatio = totalNegativeReviews / totalReviews;

  if (negativeRatio > 0.3) return 'high';
  if (negativeRatio > 0.15) return 'medium';
  return 'low';
}

/**
 * Calculate fraud score for campaign
 */
async function calculateCampaignFraudScore(campaignId: string): Promise<number> {
  const usersQuery = await db.collection('users')
    .where('acquisitionCampaign', '==', campaignId)
    .where('createdAt', '>', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    .get();

  if (usersQuery.empty) {
    return 0;
  }

  let totalFraudScore = 0;
  let count = 0;

  for (const userDoc of usersQuery.docs) {
    const fraudQuery = await db.collection('fraud_detection_stats')
      .where('userId', '==', userDoc.id)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (!fraudQuery.empty) {
      totalFraudScore += fraudQuery.docs[0].data().fraudScore || 0;
      count++;
    }
  }

  return count > 0 ? totalFraudScore / count : 0;
}
