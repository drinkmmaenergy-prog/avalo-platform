/**
 * PACK 432 — User Acquisition Orchestrator
 * 
 * Core campaign orchestration engine for managing paid acquisition across
 * Meta, TikTok, Google, and UGC campaigns with real-time optimization
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

const db = admin.firestore();

// ===========================
// TYPES & INTERFACES
// ===========================

export interface CampaignConfig {
  id: string;
  platform: 'meta' | 'tiktok' | 'google';
  name: string;
  country: string;
  gender?: 'male' | 'female' | 'all';
  ageRange: {
    min: number;
    max: number;
  };
  monetizationProfile: 'dating' | 'events' | 'ai' | 'calendar' | 'mixed';
  budget: {
    daily: number;
    total: number;
    testBudget: number; // 10-20%
    scaleBudget: number; // 80-90%
  };
  targeting: {
    interests?: string[];
    behaviors?: string[];
    lookalike?: boolean;
  };
  status: 'draft' | 'active' | 'paused' | 'completed';
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface CampaignPerformance {
  campaignId: string;
  date: string;
  impressions: number;
  clicks: number;
  installs: number;
  cpi: number;
  ctr: number;
  spend: number;
  revenue: number;
  roas: number;
  ltv7d: number;
  ltv30d: number;
  ltv90d: number;
  fakeInstallRate: number;
  chargebackRate: number;
}

export interface BudgetAllocation {
  total: number;
  test: number;
  scale: number;
  platform: {
    meta: number;
    tiktok: number;
    google: number;
  };
  country: Record<string, number>;
}

// ===========================
// CAMPAIGN CREATION
// ===========================

export const createCampaign = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin auth required');
  }

  const {
    platform,
    name,
    country,
    gender,
    ageRange,
    monetizationProfile,
    dailyBudget,
    totalBudget,
    targeting
  } = data;

  // Validate inputs
  if (!platform || !['meta', 'tiktok', 'google'].includes(platform)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid platform');
  }

  if (!country || country.length !== 2) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid country code');
  }

  if (!ageRange || ageRange.min < 18 || ageRange.max > 99) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid age range');
  }

  // Calculate budget allocation
  const testBudget = Math.round(dailyBudget * 0.15); // 15% test
  const scaleBudget = dailyBudget - testBudget; // 85% scale

  const campaignConfig: CampaignConfig = {
    id: db.collection('ua_campaigns').doc().id,
    platform,
    name,
    country,
    gender: gender || 'all',
    ageRange,
    monetizationProfile,
    budget: {
      daily: dailyBudget,
      total: totalBudget,
      testBudget,
      scaleBudget
    },
    targeting: targeting || {},
    status: 'draft',
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now()
  };

  // Save to Firestore
  await db.collection('ua_campaigns').doc(campaignConfig.id).set(campaignConfig);

  // Log campaign creation
  await db.collection('ua_audit_log').add({
    type: 'campaign_created',
    campaignId: campaignConfig.id,
    platform,
    country,
    adminUid: context.auth.uid,
    timestamp: admin.firestore.Timestamp.now()
  });

  return {
    success: true,
    campaignId: campaignConfig.id,
    config: campaignConfig
  };
});

// ===========================
// CAMPAIGN MANAGEMENT
// ===========================

export const updateCampaignStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin auth required');
  }

  const { campaignId, status, reason } = data;

  if (!['active', 'paused', 'completed'].includes(status)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid status');
  }

  await db.collection('ua_campaigns').doc(campaignId).update({
    status,
    updatedAt: admin.firestore.Timestamp.now()
  });

  // Log status change
  await db.collection('ua_audit_log').add({
    type: 'status_changed',
    campaignId,
    newStatus: status,
    reason: reason || 'manual',
    adminUid: context.auth.uid,
    timestamp: admin.firestore.Timestamp.now()
  });

  return { success: true };
});

export const updateCampaignBudget = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin auth required');
  }

  const { campaignId, dailyBudget, totalBudget } = data;

  if (dailyBudget < 0 || totalBudget < 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Budget must be positive');
  }

  const testBudget = Math.round(dailyBudget * 0.15);
  const scaleBudget = dailyBudget - testBudget;

  await db.collection('ua_campaigns').doc(campaignId).update({
    'budget.daily': dailyBudget,
    'budget.total': totalBudget,
    'budget.testBudget': testBudget,
    'budget.scaleBudget': scaleBudget,
    updatedAt: admin.firestore.Timestamp.now()
  });

  // Log budget change
  await db.collection('ua_audit_log').add({
    type: 'budget_updated',
    campaignId,
    dailyBudget,
    totalBudget,
    adminUid: context.auth.uid,
    timestamp: admin.firestore.Timestamp.now()
  });

  return { success: true };
});

// ===========================
// AUTOMATIC CAMPAIGN PAUSING
// ===========================

export const monitorCampaignHealth = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async (context) => {
    const campaigns = await db.collection('ua_campaigns')
      .where('status', '==', 'active')
      .get();

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    for (const campaignDoc of campaigns.docs) {
      const campaign = campaignDoc.data() as CampaignConfig;
      
      // Get recent performance
      const performanceSnap = await db.collection('ua_performance')
        .where('campaignId', '==', campaign.id)
        .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(oneDayAgo))
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get();

      if (performanceSnap.empty) continue;

      const performance = performanceSnap.docs[0].data() as CampaignPerformance;

      // Check for CPI spike
      const avgCpi = await getAverageCPI(campaign.platform, campaign.country);
      if (performance.cpi > avgCpi * 2.5) {
        await pauseCampaign(campaign.id, 'cpi_spike', {
          currentCpi: performance.cpi,
          avgCpi,
          threshold: avgCpi * 2.5
        });
        continue;
      }

      // Check for fake installs
      if (performance.fakeInstallRate > 0.25) { // 25% threshold
        await pauseCampaign(campaign.id, 'fake_installs', {
          fakeInstallRate: performance.fakeInstallRate
        });
        continue;
      }

      // Check for chargeback rate
      if (performance.chargebackRate > 0.05) { // 5% threshold
        await pauseCampaign(campaign.id, 'high_chargeback', {
          chargebackRate: performance.chargebackRate
        });
        continue;
      }

      // Check for negative ROAS
      if (performance.spend > 1000 && performance.roas < 0.5) {
        await pauseCampaign(campaign.id, 'low_roas', {
          roas: performance.roas,
          spend: performance.spend
        });
        continue;
      }
    }

    return null;
  });

async function pauseCampaign(campaignId: string, reason: string, details: any) {
  await db.collection('ua_campaigns').doc(campaignId).update({
    status: 'paused',
    pauseReason: reason,
    pauseDetails: details,
    pausedAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now()
  });

  // Create alert
  await db.collection('ua_alerts').add({
    type: 'campaign_auto_paused',
    campaignId,
    reason,
    details,
    severity: 'high',
    timestamp: admin.firestore.Timestamp.now(),
    resolved: false
  });

  // Log the pause
  await db.collection('ua_audit_log').add({
    type: 'campaign_auto_paused',
    campaignId,
    reason,
    details,
    timestamp: admin.firestore.Timestamp.now()
  });
}

async function getAverageCPI(platform: string, country: string): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const performanceSnap = await db.collection('ua_performance')
    .where('platform', '==', platform)
    .where('country', '==', country)
    .where('date', '>=', thirtyDaysAgo.toISOString().split('T')[0])
    .get();

  if (performanceSnap.empty) return 10; // Default CPI

  const totalCpi = performanceSnap.docs.reduce((sum, doc) => {
    const data = doc.data() as CampaignPerformance;
    return sum + data.cpi;
  }, 0);

  return totalCpi / performanceSnap.size;
}

// ===========================
// BUDGET ROUTING & OPTIMIZATION
// ===========================

export const calculateBudgetAllocation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin auth required');
  }

  const { totalBudget } = data;

  // Get all active campaigns
  const campaigns = await db.collection('ua_campaigns')
    .where('status', '==', 'active')
    .get();

  // Get performance metrics for each platform and country
  const platformPerformance: Record<string, { roas: number; ltv30d: number; count: number }> = {
    meta: { roas: 0, ltv30d: 0, count: 0 },
    tiktok: { roas: 0, ltv30d: 0, count: 0 },
    google: { roas: 0, ltv30d: 0, count: 0 }
  };

  const countryPerformance: Record<string, { roas: number; ltv30d: number; count: number }> = {};

  // Calculate average performance
  for (const campaignDoc of campaigns.docs) {
    const campaign = campaignDoc.data() as CampaignConfig;
    
    const performanceSnap = await db.collection('ua_performance')
      .where('campaignId', '==', campaign.id)
      .orderBy('timestamp', 'desc')
      .limit(7)
      .get();

    if (performanceSnap.empty) continue;

    const avgRoas = performanceSnap.docs.reduce((sum, doc) => sum + doc.data().roas, 0) / performanceSnap.size;
    const avgLtv = performanceSnap.docs.reduce((sum, doc) => sum + doc.data().ltv30d, 0) / performanceSnap.size;

    // Platform aggregation
    platformPerformance[campaign.platform].roas += avgRoas;
    platformPerformance[campaign.platform].ltv30d += avgLtv;
    platformPerformance[campaign.platform].count += 1;

    // Country aggregation
    if (!countryPerformance[campaign.country]) {
      countryPerformance[campaign.country] = { roas: 0, ltv30d: 0, count: 0 };
    }
    countryPerformance[campaign.country].roas += avgRoas;
    countryPerformance[campaign.country].ltv30d += avgLtv;
    countryPerformance[campaign.country].count += 1;
  }

  // Calculate normalized scores and allocate budget
  const testBudget = totalBudget * 0.15;
  const scaleBudget = totalBudget * 0.85;

  // Platform allocation based on ROAS and LTV
  const platformScores: Record<string, number> = {};
  let totalPlatformScore = 0;

  for (const [platform, perf] of Object.entries(platformPerformance)) {
    if (perf.count === 0) continue;
    const avgRoas = perf.roas / perf.count;
    const avgLtv = perf.ltv30d / perf.count;
    platformScores[platform] = (avgRoas * 0.6) + (avgLtv / 100 * 0.4);
    totalPlatformScore += platformScores[platform];
  }

  const platformAllocation: Record<string, number> = {};
  for (const [platform, score] of Object.entries(platformScores)) {
    platformAllocation[platform] = Math.round((score / totalPlatformScore) * scaleBudget);
  }

  // Country allocation
  const countryAllocation: Record<string, number> = {};
  let totalCountryScore = 0;

  for (const [country, perf] of Object.entries(countryPerformance)) {
    if (perf.count === 0) continue;
    const avgRoas = perf.roas / perf.count;
    const avgLtv = perf.ltv30d / perf.count;
    const score = (avgRoas * 0.6) + (avgLtv / 100 * 0.4);
    countryAllocation[country] = score;
    totalCountryScore += score;
  }

  for (const country in countryAllocation) {
    countryAllocation[country] = Math.round((countryAllocation[country] / totalCountryScore) * scaleBudget);
  }

  const allocation: BudgetAllocation = {
    total: totalBudget,
    test: testBudget,
    scale: scaleBudget,
    platform: {
      meta: platformAllocation['meta'] || 0,
      tiktok: platformAllocation['tiktok'] || 0,
      google: platformAllocation['google'] || 0
    },
    country: countryAllocation
  };

  // Save allocation
  await db.collection('ua_budget_allocations').add({
    allocation,
    timestamp: admin.firestore.Timestamp.now(),
    createdBy: context.auth.uid
  });

  return allocation;
});

// ===========================
// CAMPAIGN AUTO-EXPANSION
// ===========================

export const autoExpandTopCampaigns = functions.pubsub
  .schedule('every day 02:00')
  .timeZone('UTC')
  .onRun(async (context) => {
    // Find top performing campaigns from last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const performanceSnap = await db.collection('ua_performance')
      .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(sevenDaysAgo))
      .get();

    // Group by campaign and calculate average metrics
    const campaignMetrics: Record<string, { roas: number; ltv30d: number; spend: number; count: number }> = {};

    for (const doc of performanceSnap.docs) {
      const data = doc.data() as CampaignPerformance;
      if (!campaignMetrics[data.campaignId]) {
        campaignMetrics[data.campaignId] = { roas: 0, ltv30d: 0, spend: 0, count: 0 };
      }
      campaignMetrics[data.campaignId].roas += data.roas;
      campaignMetrics[data.campaignId].ltv30d += data.ltv30d;
      campaignMetrics[data.campaignId].spend += data.spend;
      campaignMetrics[data.campaignId].count += 1;
    }

    // Find campaigns with ROAS > 2.0 and spend > $500
    const expandableCampaigns = Object.entries(campaignMetrics)
      .filter(([_, metrics]) => {
        const avgRoas = metrics.roas / metrics.count;
        const totalSpend = metrics.spend;
        return avgRoas > 2.0 && totalSpend > 500;
      })
      .map(([campaignId]) => campaignId);

    // Increase budget for top performers by 25%
    for (const campaignId of expandableCampaigns) {
      const campaignDoc = await db.collection('ua_campaigns').doc(campaignId).get();
      if (!campaignDoc.exists) continue;

      const campaign = campaignDoc.data() as CampaignConfig;
      const newDailyBudget = Math.round(campaign.budget.daily * 1.25);

      await db.collection('ua_campaigns').doc(campaignId).update({
        'budget.daily': newDailyBudget,
        'budget.testBudget': Math.round(newDailyBudget * 0.15),
        'budget.scaleBudget': Math.round(newDailyBudget * 0.85),
        updatedAt: admin.firestore.Timestamp.now()
      });

      // Log auto-expansion
      await db.collection('ua_audit_log').add({
        type: 'campaign_auto_expanded',
        campaignId,
        oldBudget: campaign.budget.daily,
        newBudget: newDailyBudget,
        reason: 'high_performance',
        timestamp: admin.firestore.Timestamp.now()
      });
    }

    return { expandedCampaigns: expandableCampaigns.length };
  });

// ===========================
// EXPORTS
// ===========================

export const uaOrchestrator = {
  createCampaign,
  updateCampaignStatus,
  updateCampaignBudget,
  monitorCampaignHealth,
  calculateBudgetAllocation,
  autoExpandTopCampaigns
};
