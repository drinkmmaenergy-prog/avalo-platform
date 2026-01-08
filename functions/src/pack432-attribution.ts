/**
 * PACK 432 — Attribution & LTV Engine
 * 
 * Tracks user journey from install through monetization events,
 * calculates LTV cohorts, and feeds data back into optimization
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

const db = admin.firestore();

// ===========================
// TYPES & INTERFACES
// ===========================

export interface Attribution {
  userId: string;
  installId: string;
  platform: 'meta' | 'tiktok' | 'google' | 'organic';
  campaignId?: string;
  adGroupId?: string;
  adId?: string;
  creativeId?: string;
  country: string;
  installDate: FirebaseFirestore.Timestamp;
  clickId?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  deviceInfo: {
    os: string;
    model: string;
    osVersion: string;
  };
}

export interface UserJourney {
  userId: string;
  installDate: FirebaseFirestore.Timestamp;
  events: JourneyEvent[];
  milestones: {
    firstSwipe?: FirebaseFirestore.Timestamp;
    firstMatch?: FirebaseFirestore.Timestamp;
    firstChat?: FirebaseFirestore.Timestamp;
    firstPayment?: FirebaseFirestore.Timestamp;
    firstEventCreated?: FirebaseFirestore.Timestamp;
    firstEventAttended?: FirebaseFirestore.Timestamp;
  };
  revenue: {
    day1: number;
    day3: number;
    day7: number;
    day30: number;
    day90: number;
    total: number;
  };
  ltv: {
    day7: number;
    day30: number;
    day90: number;
  };
}

export interface JourneyEvent {
  type: string;
  timestamp: FirebaseFirestore.Timestamp;
  revenue?: number;
  metadata?: any;
}

export interface CohortAnalysis {
  cohortDate: string; // YYYY-MM-DD
  platform: string;
  campaignId?: string;
  country: string;
  totalUsers: number;
  retainedDay1: number;
  retainedDay7: number;
  retainedDay30: number;
  paidUsers: number;
  avgRevenue: number;
  avgLTV7d: number;
  avgLTV30d: number;
  avgLTV90d: number;
  totalSpend: number;
  roas: number;
}

// ===========================
// INSTALL ATTRIBUTION
// ===========================

export const trackInstall = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }

  const { 
    platform, 
    campaignId, 
    clickId, 
    referrer, 
    utmSource, 
    utmMedium, 
    utmCampaign,
    deviceInfo 
  } = data;

  const userId = context.auth.uid;

  // Check if already tracked
  const existingAttribution = await db.collection('ua_attributions')
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (!existingAttribution.empty) {
    return { 
      success: true, 
      message: 'Attribution already exists',
      attribution: existingAttribution.docs[0].data()
    };
  }

  // Get user's country from profile
  const userDoc = await db.collection('users').doc(userId).get();
  const country = userDoc.data()?.country || 'US';

  // Create attribution
  const attribution: Attribution = {
    userId,
    installId: db.collection('ua_attributions').doc().id,
    platform: platform || 'organic',
    campaignId,
    clickId,
    referrer,
    utmSource,
    utmMedium,
    utmCampaign,
    country,
    installDate: admin.firestore.Timestamp.now(),
    deviceInfo: deviceInfo || {}
  };

  await db.collection('ua_attributions').doc(attribution.installId).set(attribution);

  // Create initial user journey
  const journey: UserJourney = {
    userId,
    installDate: admin.firestore.Timestamp.now(),
    events: [{
      type: 'install',
      timestamp: admin.firestore.Timestamp.now()
    }],
    milestones: {},
    revenue: {
      day1: 0,
      day3: 0,
      day7: 0,
      day30: 0,
      day90: 0,
      total: 0
    },
    ltv: {
      day7: 0,
      day30: 0,
      day90: 0
    }
  };

  await db.collection('ua_user_journeys').doc(userId).set(journey);

  // Update campaign install count
  if (campaignId) {
    await db.collection('ua_campaigns').doc(campaignId).update({
      'stats.installs': admin.firestore.FieldValue.increment(1)
    });
  }

  return { 
    success: true, 
    installId: attribution.installId 
  };
});

// ===========================
// JOURNEY EVENT TRACKING
// ===========================

export const trackJourneyEvent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }

  const { eventType, revenue, metadata } = data;
  const userId = context.auth.uid;

  // Get or create journey
  const journeyDoc = await db.collection('ua_user_journeys').doc(userId).get();
  if (!journeyDoc.exists) {
    // Create journey if doesn't exist (for old users)
    await db.collection('ua_user_journeys').doc(userId).set({
      userId,
      installDate: admin.firestore.Timestamp.now(),
      events: [],
      milestones: {},
      revenue: {
        day1: 0,
        day3: 0,
        day7: 0,
        day30: 0,
        day90: 0,
        total: 0
      },
      ltv: {
        day7: 0,
        day30: 0,
        day90: 0
      }
    });
  }

  const event: JourneyEvent = {
    type: eventType,
    timestamp: admin.firestore.Timestamp.now(),
    revenue: revenue || 0,
    metadata
  };

  // Update journey
  const updates: any = {
    events: admin.firestore.FieldValue.arrayUnion(event)
  };

  // Update milestones
  const milestoneMap: Record<string, string> = {
    'first_swipe': 'milestones.firstSwipe',
    'first_match': 'milestones.firstMatch',
    'first_chat': 'milestones.firstChat',
    'first_payment': 'milestones.firstPayment',
    'event_created': 'milestones.firstEventCreated',
    'event_attended': 'milestones.firstEventAttended'
  };

  if (milestoneMap[eventType]) {
    updates[milestoneMap[eventType]] = admin.firestore.FieldValue.serverTimestamp();
  }

  // Update revenue
  if (revenue && revenue > 0) {
    updates['revenue.total'] = admin.firestore.FieldValue.increment(revenue);
  }

  await db.collection('ua_user_journeys').doc(userId).update(updates);

  return { success: true };
});

// ===========================
// LTV CALCULATION
// ===========================

export const calculateUserLTV = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const now = new Date();
    const dates = {
      day7: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      day30: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      day90: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    };

    // Get all journeys that need LTV update
    const journeysSnap = await db.collection('ua_user_journeys')
      .where('installDate', '<=', admin.firestore.Timestamp.fromDate(dates.day7))
      .get();

    for (const journeyDoc of journeysSnap.docs) {
      const journey = journeyDoc.data() as UserJourney;
      const installDate = journey.installDate.toDate();

      // Get all payments for this user
      const paymentsSnap = await db.collection('payments')
        .where('userId', '==', journey.userId)
        .where('status', '==', 'completed')
        .get();

      let revenue7d = 0;
      let revenue30d = 0;
      let revenue90d = 0;

      for (const paymentDoc of paymentsSnap.docs) {
        const payment = paymentDoc.data();
        const paymentDate = payment.createdAt.toDate();
        const daysSinceInstall = Math.floor((paymentDate.getTime() - installDate.getTime()) / (24 * 60 * 60 * 1000));

        const amount = payment.amount || 0;

        if (daysSinceInstall <= 7) revenue7d += amount;
        if (daysSinceInstall <= 30) revenue30d += amount;
        if (daysSinceInstall <= 90) revenue90d += amount;
      }

      // Update LTV
      await db.collection('ua_user_journeys').doc(journeyDoc.id).update({
        'ltv.day7': revenue7d,
        'ltv.day30': revenue30d,
        'ltv.day90': revenue90d,
        'revenue.total': revenue90d
      });

      // Update attribution with LTV
      const attributionSnap = await db.collection('ua_attributions')
        .where('userId', '==', journey.userId)
        .limit(1)
        .get();

      if (!attributionSnap.empty) {
        await attributionSnap.docs[0].ref.update({
          ltv7d: revenue7d,
          ltv30d: revenue30d,
          ltv90d: revenue90d
        });
      }
    }

    return null;
  });

// ===========================
// COHORT ANALYSIS
// ===========================

export const generateCohortAnalysis = functions.pubsub
  .schedule('every day 03:00')
  .timeZone('UTC')
  .onRun(async (context) => {
    const dates = [
      new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    ];

    for (const cohortDate of dates) {
      const cohortDateStr = cohortDate.toISOString().split('T')[0];
      const nextDay = new Date(cohortDate.getTime() + 24 * 60 * 60 * 1000);

      // Get all attributions for this cohort
      const attributionsSnap = await db.collection('ua_attributions')
        .where('installDate', '>=', admin.firestore.Timestamp.fromDate(cohortDate))
        .where('installDate', '<', admin.firestore.Timestamp.fromDate(nextDay))
        .get();

      if (attributionsSnap.empty) continue;

      // Group by platform and campaign
      const cohorts: Record<string, Attribution[]> = {};

      for (const doc of attributionsSnap.docs) {
        const attribution = doc.data() as Attribution;
        const key = `${attribution.platform}-${attribution.campaignId || 'organic'}-${attribution.country}`;
        
        if (!cohorts[key]) cohorts[key] = [];
        cohorts[key].push(attribution);
      }

      // Calculate metrics for each cohort
      for (const [key, attributions] of Object.entries(cohorts)) {
        const [platform, campaignId, country] = key.split('-');

        const userIds = attributions.map(a => a.userId);

        // Get journeys for retention calculation
        const journeysSnap = await db.collection('ua_user_journeys')
          .where('userId', 'in', userIds.slice(0, 10)) // Firestore limit
          .get();

        let retainedDay1 = 0;
        let retainedDay7 = 0;
        let retainedDay30 = 0;
        let totalRevenue = 0;
        let totalLTV7d = 0;
        let totalLTV30d = 0;
        let totalLTV90d = 0;
        let paidUsers = 0;

        for (const journeyDoc of journeysSnap.docs) {
          const journey = journeyDoc.data() as UserJourney;
          
          // Check retention (has events after day X)
          const installDate = journey.installDate.toDate();
          const latestEvent = journey.events[journey.events.length - 1];
          if (latestEvent) {
            const daysSinceInstall = Math.floor(
              (latestEvent.timestamp.toDate().getTime() - installDate.getTime()) / (24 * 60 * 60 * 1000)
            );
            if (daysSinceInstall >= 1) retainedDay1++;
            if (daysSinceInstall >= 7) retainedDay7++;
            if (daysSinceInstall >= 30) retainedDay30++;
          }

          // Revenue metrics
          totalRevenue += journey.revenue.total;
          totalLTV7d += journey.ltv.day7;
          totalLTV30d += journey.ltv.day30;
          totalLTV90d += journey.ltv.day90;

          if (journey.revenue.total > 0) paidUsers++;
        }

        const totalUsers = attributions.length;

        // Get campaign spend
        let totalSpend = 0;
        if (campaignId !== 'organic') {
          const performanceSnap = await db.collection('ua_performance')
            .where('campaignId', '==', campaignId)
            .where('date', '==', cohortDateStr)
            .get();

          totalSpend = performanceSnap.docs.reduce((sum, doc) => sum + (doc.data().spend || 0), 0);
        }

        const avgRevenue = totalUsers > 0 ? totalRevenue / totalUsers : 0;
        const avgLTV7d = totalUsers > 0 ? totalLTV7d / totalUsers : 0;
        const avgLTV30d = totalUsers > 0 ? totalLTV30d / totalUsers : 0;
        const avgLTV90d = totalUsers > 0 ? totalLTV90d / totalUsers : 0;
        const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

        const cohortAnalysis: CohortAnalysis = {
          cohortDate: cohortDateStr,
          platform,
          campaignId: campaignId !== 'organic' ? campaignId : undefined,
          country,
          totalUsers,
          retainedDay1,
          retainedDay7,
          retainedDay30,
          paidUsers,
          avgRevenue,
          avgLTV7d,
          avgLTV30d,
          avgLTV90d,
          totalSpend,
          roas
        };

        // Save cohort analysis
        const cohortId = `${cohortDateStr}-${key}`;
        await db.collection('ua_cohort_analysis').doc(cohortId).set(cohortAnalysis);

        // Update campaign with LTV data
        if (campaignId !== 'organic') {
          await db.collection('ua_campaigns').doc(campaignId).update({
            'ltv.avg7d': avgLTV7d,
            'ltv.avg30d': avgLTV30d,
            'ltv.avg90d': avgLTV90d,
            'metrics.roas': roas
          });
        }
      }
    }

    return null;
  });

// ===========================
// FEED INTO OPTIMIZATION
// ===========================

export const updateCampaignLTVOptimization = functions.firestore
  .document('ua_cohort_analysis/{cohortId}')
  .onCreate(async (snap, context) => {
    const cohort = snap.data() as CohortAnalysis;

    if (!cohort.campaignId) return null; // Skip organic

    // Get campaign
    const campaignDoc = await db.collection('ua_campaigns').doc(cohort.campaignId).get();
    if (!campaignDoc.exists) return null;

    const campaign = campaignDoc.data()!;

    // If LTV is high and ROAS > 2.0, increase budget
    if (cohort.avgLTV30d > 50 && cohort.roas > 2.0) {
      const newBudget = Math.min(campaign.budget.daily * 1.25, campaign.budget.total / 30);

      await db.collection('ua_campaigns').doc(cohort.campaignId).update({
        'budget.daily': newBudget,
        'budget.scaleBudget': newBudget * 0.85,
        'budget.testBudget': newBudget * 0.15,
        optimizationNote: 'Auto-increased based on high LTV',
        updatedAt: admin.firestore.Timestamp.now()
      });

      // Log optimization
      await db.collection('ua_audit_log').add({
        type: 'ltv_optimization',
        campaignId: cohort.campaignId,
        action: 'budget_increase',
        oldBudget: campaign.budget.daily,
        newBudget,
        reason: `LTV30d: ${cohort.avgLTV30d}, ROAS: ${cohort.roas}`,
        timestamp: admin.firestore.Timestamp.now()
      });
    }

    // If LTV is low and ROAS < 1.0, decrease budget or pause
    if (cohort.avgLTV30d < 10 && cohort.roas < 1.0 && cohort.totalUsers > 100) {
      await db.collection('ua_campaigns').doc(cohort.campaignId).update({
        status: 'paused',
        pauseReason: 'low_ltv_roas',
        pauseDetails: {
          ltv30d: cohort.avgLTV30d,
          roas: cohort.roas,
          totalUsers: cohort.totalUsers
        },
        updatedAt: admin.firestore.Timestamp.now()
      });

      // Create alert
      await db.collection('ua_alerts').add({
        type: 'campaign_paused_low_ltv',
        campaignId: cohort.campaignId,
        severity: 'medium',
        details: cohort,
        timestamp: admin.firestore.Timestamp.now(),
        resolved: false
      });
    }

    return null;
  });

// ===========================
// ANALYTICS ENDPOINTS
// ===========================

export const getAttributionReport = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin auth required');
  }

  const { startDate, endDate, platform, country } = data;

  let query = db.collection('ua_attributions') as any;

  if (startDate) {
    query = query.where('installDate', '>=', admin.firestore.Timestamp.fromDate(new Date(startDate)));
  }
  if (endDate) {
    query = query.where('installDate', '<=', admin.firestore.Timestamp.fromDate(new Date(endDate)));
  }
  if (platform) {
    query = query.where('platform', '==', platform);
  }
  if (country) {
    query = query.where('country', '==', country);
  }

  const attributionsSnap = await query.get();

  const byPlatform: Record<string, number> = {};
  const byCountry: Record<string, number> = {};
  const byCampaign: Record<string, number> = {};

  for (const doc of attributionsSnap.docs) {
    const attr = doc.data() as Attribution;
    byPlatform[attr.platform] = (byPlatform[attr.platform] || 0) + 1;
    byCountry[attr.country] = (byCountry[attr.country] || 0) + 1;
    if (attr.campaignId) {
      byCampaign[attr.campaignId] = (byCampaign[attr.campaignId] || 0) + 1;
    }
  }

  return {
    totalInstalls: attributionsSnap.size,
    byPlatform,
    byCountry,
    byCampaign
  };
});

export const getLTVReport = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin auth required');
  }

  const { cohortDate, platform } = data;

  let query = db.collection('ua_cohort_analysis') as any;

  if (cohortDate) {
    query = query.where('cohortDate', '==', cohortDate);
  }
  if (platform) {
    query = query.where('platform', '==', platform);
  }

  const cohortsSnap = await query.orderBy('cohortDate', 'desc').limit(30).get();

  const cohorts = cohortsSnap.docs.map(doc => doc.data() as CohortAnalysis);

  return {
    cohorts,
    summary: {
      avgLTV7d: cohorts.reduce((sum, c) => sum + c.avgLTV7d, 0) / cohorts.length || 0,
      avgLTV30d: cohorts.reduce((sum, c) => sum + c.avgLTV30d, 0) / cohorts.length || 0,
      avgLTV90d: cohorts.reduce((sum, c) => sum + c.avgLTV90d, 0) / cohorts.length || 0,
      avgROAS: cohorts.reduce((sum, c) => sum + c.roas, 0) / cohorts.length || 0
    }
  };
});

// ===========================
// EXPORTS
// ===========================

export const attributionEngine = {
  trackInstall,
  trackJourneyEvent,
  calculateUserLTV,
  generateCohortAnalysis,
  updateCampaignLTVOptimization,
  getAttributionReport,
  getLTVReport
};
