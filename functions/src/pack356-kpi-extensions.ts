/**
 * PACK 356 - KPI Extensions
 * Adds ad acquisition metrics to PACK 352 KPI Engine
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * Calculate and update all ad-related KPIs
 */
export const updateAdKPIs = functions.pubsub
  .schedule("0 6 * * *") // 6 AM UTC daily
  .timeZone("UTC")
  .onRun(async (context) => {
    console.log("Updating ad acquisition KPIs...");

    try {
      const kpis = await calculateAdKPIs();
      
      // Store in KPI collection (PACK 352 integration)
      await db.collection("kpiMetrics").doc("ads").set({
        ...kpis,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        category: "PAID_ACQUISITION",
      }, { merge: true });

      console.log("Ad KPIs updated successfully");
      return { success: true, kpis };
    } catch (error) {
      console.error("Error updating ad KPIs:", error);
      throw error;
    }
  });

/**
 * Calculate all ad-related KPIs
 */
async function calculateAdKPIs() {
  // Get all campaigns
  const campaigns = await db.collection("adCampaigns").get();
  const campaignIds = campaigns.docs.map(doc => doc.id);

  // Get all performance data
  const performancePromises = campaignIds.map(id =>
    db.collection("adPerformance").doc(id).get()
  );
  const performances = await Promise.all(performancePromises);

  // Aggregate metrics
  let totalSpend = 0;
  let totalRevenue = 0;
  let totalInstalls = 0;
  let totalVerified = 0;
  let totalPaying = 0;
  let totalImpressions = 0;
  let totalClicks = 0;

  performances.forEach(doc => {
    if (doc.exists) {
      const perf = doc.data()!;
      totalSpend += perf.spend || 0;
      totalRevenue += perf.revenue || 0;
      totalInstalls += perf.installs || 0;
      totalVerified += perf.verifiedUsers || 0;
      totalPaying += perf.payingUsers || 0;
      totalImpressions += perf.impressions || 0;
      totalClicks += perf.clicks || 0;
    }
  });

  // Calculate aggregate KPIs
  const cpa = totalInstalls > 0 ? totalSpend / totalInstalls : 0;
  const cpv = totalVerified > 0 ? totalSpend / totalVerified : 0;
  const cpp = totalPaying > 0 ? totalSpend / totalPaying : 0;
  const overallROAS = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const conversionRate = totalInstalls > 0 ? (totalPaying / totalInstalls) * 100 : 0;

  // Calculate LTV by campaign
  const ltvByCampaign = await calculateLTVByCampaign(campaignIds);

  // Calculate LTV by country
  const ltvByCountry = await calculateLTVByCountry();

  return {
    // Spend & Revenue
    totalSpend,
    totalRevenue,
    
    // Volume metrics
    totalImpressions,
    totalClicks,
    totalInstalls,
    totalVerified,
    totalPaying,
    
    // Cost metrics
    cpa, // Cost Per Acquisition (install)
    cpv, // Cost Per Verified user
    cpp, // Cost Per Paying user
    
    // Performance metrics
    overallROAS,
    ctr, // Click-Through Rate
    conversionRate, // Install to Paying %
    
    // LTV metrics
    ltvByCampaign,
    ltvByCountry,
    
    // Efficiency metrics
    verificationRate: totalInstalls > 0 ? (totalVerified / totalInstalls) * 100 : 0,
    payingConversionRate: totalVerified > 0 ? (totalPaying / totalVerified) * 100 : 0,
  };
}

/**
 * Calculate LTV by campaign
 */
async function calculateLTVByCampaign(campaignIds: string[]): Promise<Record<string, number>> {
  const ltvData: Record<string, number> = {};

  for (const campaignId of campaignIds) {
    // Get all attributions for this campaign
    const attributions = await db
      .collection("adAttribution")
      .where("campaignId", "==", campaignId)
      .get();

    let totalRevenue = 0;
    const userCount = attributions.size;

    attributions.forEach(doc => {
      const attr = doc.data();
      totalRevenue += attr.revenueGenerated || 0;
    });

    ltvData[campaignId] = userCount > 0 ? totalRevenue / userCount : 0;
  }

  return ltvData;
}

/**
 * Calculate LTV by country
 */
async function calculateLTVByCountry(): Promise<Record<string, number>> {
  const campaigns = await db.collection("adCampaigns").get();
  const countryLTV: Record<string, { revenue: number; users: number }> = {};

  for (const campaignDoc of campaigns.docs) {
    const campaign = campaignDoc.data();
    const countryCode = campaign.countryCode;

    // Get attributions for this campaign
    const attributions = await db
      .collection("adAttribution")
      .where("campaignId", "==", campaignDoc.id)
      .get();

    if (!countryLTV[countryCode]) {
      countryLTV[countryCode] = { revenue: 0, users: 0 };
    }

    attributions.forEach(doc => {
      const attr = doc.data();
      countryLTV[countryCode].revenue += attr.revenueGenerated || 0;
      countryLTV[countryCode].users++;
    });
  }

  // Calculate average LTV per country
  const result: Record<string, number> = {};
  for (const [country, data] of Object.entries(countryLTV)) {
    result[country] = data.users > 0 ? data.revenue / data.users : 0;
  }

  return result;
}

/**
 * Admin: Get ad KPIs dashboard
 */
export const getAdKPIs = functions.https.onCall(
  async (data, context) => {
    // Verify admin
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    if (userDoc.data()?.role !== "admin") {
      throw new functions.https.HttpsError("permission-denied", "Admin access required");
    }

    try {
      // Get cached KPIs from last update
      const kpiDoc = await db.collection("kpiMetrics").doc("ads").get();
      
      if (!kpiDoc.exists) {
        // Calculate fresh if not exists
        const kpis = await calculateAdKPIs();
        return { kpis, cached: false };
      }

      return { kpis: kpiDoc.data(), cached: true };
    } catch (error) {
      console.error("Error getting ad KPIs:", error);
      throw new functions.https.HttpsError("internal", "Failed to get KPIs");
    }
  }
);

/**
 * Admin: Get cohort analysis for ad campaigns
 */
export const getAdCohortAnalysis = functions.https.onCall(
  async (data: { campaignId: string; cohortDays: number }, context) => {
    // Verify admin
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    if (userDoc.data()?.role !== "admin") {
      throw new functions.https.HttpsError("permission-denied", "Admin access required");
    }

    try {
      const cohortDays = data.cohortDays || 30;
      
      // Get attributions for campaign
      const attributions = await db
        .collection("adAttribution")
        .where("campaignId", "==", data.campaignId)
        .orderBy("installTime", "desc")
        .get();

      // Group by cohort (day of install)
      const cohorts: Record<string, {
        users: number;
        verified: number;
        paying: number;
        revenue: number;
      }> = {};

      attributions.forEach(doc => {
        const attr = doc.data();
        const installDate = attr.installTime.toDate();
        const cohortKey = installDate.toISOString().split('T')[0]; // YYYY-MM-DD

        if (!cohorts[cohortKey]) {
          cohorts[cohortKey] = {
            users: 0,
            verified: 0,
            paying: 0,
            revenue: 0,
          };
        }

        cohorts[cohortKey].users++;
        if (attr.verified) cohorts[cohortKey].verified++;
        if (attr.firstPurchaseTime) cohorts[cohortKey].paying++;
        cohorts[cohortKey].revenue += attr.revenueGenerated || 0;
      });

      // Calculate metrics per cohort
      const cohortAnalysis = Object.entries(cohorts).map(([date, data]) => ({
        date,
        users: data.users,
        verifiedRate: data.users > 0 ? (data.verified / data.users) * 100 : 0,
        payingRate: data.users > 0 ? (data.paying / data.users) * 100 : 0,
        averageLTV: data.users > 0 ? data.revenue / data.users : 0,
        totalRevenue: data.revenue,
      }));

      return { cohorts: cohortAnalysis };
    } catch (error) {
      console.error("Error getting cohort analysis:", error);
      throw new functions.https.HttpsError("internal", "Failed to get cohort analysis");
    }
  }
);

/**
 * Calculate channel comparison metrics
 */
export const compareChannels = functions.https.onCall(
  async (data, context) => {
    // Verify admin
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    if (userDoc.data()?.role !== "admin") {
      throw new functions.https.HttpsError("permission-denied", "Admin access required");
    }

    try {
      const campaigns = await db.collection("adCampaigns").get();
      const platforms = ["META", "TIKTOK", "GOOGLE", "UGC_CREATOR", "APP_STORE"];
      
      const channelMetrics: Record<string, {
        spend: number;
        revenue: number;
        installs: number;
        paying: number;
        roas: number;
        cpa: number;
      }> = {};

      // Initialize
      platforms.forEach(platform => {
        channelMetrics[platform] = {
          spend: 0,
          revenue: 0,
          installs: 0,
          paying: 0,
          roas: 0,
          cpa: 0,
        };
      });

      // Aggregate by platform
      for (const campaignDoc of campaigns.docs) {
        const campaign = campaignDoc.data();
        const platform = campaign.platform;

        const perfDoc = await db.collection("adPerformance").doc(campaignDoc.id).get();
        if (perfDoc.exists) {
          const perf = perfDoc.data()!;
          
          channelMetrics[platform].spend += perf.spend || 0;
          channelMetrics[platform].revenue += perf.revenue || 0;
          channelMetrics[platform].installs += perf.installs || 0;
          channelMetrics[platform].paying += perf.payingUsers || 0;
        }
      }

      // Calculate derived metrics
      for (const platform of platforms) {
        const metrics = channelMetrics[platform];
        metrics.roas = metrics.spend > 0 ? metrics.revenue / metrics.spend : 0;
        metrics.cpa = metrics.installs > 0 ? metrics.spend / metrics.installs : 0;
      }

      return { channels: channelMetrics };
    } catch (error) {
      console.error("Error comparing channels:", error);
      throw new functions.https.HttpsError("internal", "Failed to compare channels");
    }
  }
);
