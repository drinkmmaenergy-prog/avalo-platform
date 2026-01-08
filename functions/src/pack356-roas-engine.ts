/**
 * PACK 356 - ROAS Engine
 * Automated budget scaling based on ROAS performance
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

export interface ROASAction {
  campaignId: string;
  action: "PAUSE" | "KEEP" | "SCALE_15" | "SCALE_25";
  roas: number;
  previousBudget: number;
  newBudget: number;
  timestamp: admin.firestore.Timestamp;
  reason: string;
}

/**
 * Scheduled: Daily ROAS analysis and budget automation
 * Runs at 3 AM UTC daily
 */
export const dailyROASOptimization = functions.pubsub
  .schedule("0 3 * * *")
  .timeZone("UTC")
  .onRun(async (context) => {
    console.log("Starting daily ROAS optimization...");

    try {
      // Get all active campaigns
      const campaignsSnapshot = await db
        .collection("adCampaigns")
        .where("status", "==", "ACTIVE")
        .get();

      const actions: ROASAction[] = [];

      for (const campaignDoc of campaignsSnapshot.docs) {
        const campaign = campaignDoc.data();
        const campaignId = campaignDoc.id;

        try {
          const action = await optimizeCampaignBudget(campaignId, campaign);
          if (action) {
            actions.push(action);
          }
        } catch (error) {
          console.error(`Error optimizing campaign ${campaignId}:`, error);
        }
      }

      // Log summary
      console.log(`ROAS optimization completed. Actions taken: ${actions.length}`);
      
      // Store summary
      await db.collection("roasAutomationLogs").add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        totalCampaigns: campaignsSnapshot.size,
        actionsCount: actions.length,
        actions: actions.map(a => ({
          campaignId: a.campaignId,
          action: a.action,
          roas: a.roas,
        })),
      });

      return { success: true, actionsCount: actions.length };
    } catch (error) {
      console.error("Error in ROAS optimization:", error);
      throw error;
    }
  });

/**
 * Optimize individual campaign budget based on ROAS
 */
async function optimizeCampaignBudget(
  campaignId: string,
  campaign: any
): Promise<ROASAction | null> {
  // Get performance data
  const performanceDoc = await db.collection("adPerformance").doc(campaignId).get();
  
  if (!performanceDoc.exists) {
    console.log(`No performance data for campaign ${campaignId}`);
    return null;
  }

  const performance = performanceDoc.data()!;
  const roas = performance.roas || 0;
  const currentDailyBudget = campaign.dailyBudget || 0;

  // ROAS-based decision logic
  let action: ROASAction["action"];
  let newBudget = currentDailyBudget;
  let reason = "";

  if (roas < 0.9) {
    // ROAS too low - pause campaign
    action = "PAUSE";
    reason = `ROAS ${roas.toFixed(2)} below threshold 0.9`;
    
    await db.collection("adCampaigns").doc(campaignId).update({
      status: "PAUSED",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else if (roas >= 0.9 && roas < 1.2) {
    // ROAS neutral - keep budget static
    action = "KEEP";
    reason = `ROAS ${roas.toFixed(2)} in neutral range 0.9-1.2`;
  } else if (roas >= 1.2 && roas < 2.0) {
    // ROAS good - scale budget +15%
    action = "SCALE_15";
    newBudget = currentDailyBudget * 1.15;
    reason = `ROAS ${roas.toFixed(2)} performing well, scaling +15%`;
    
    await db.collection("adCampaigns").doc(campaignId).update({
      dailyBudget: newBudget,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    // ROAS excellent - scale budget +25%
    action = "SCALE_25";
    newBudget = currentDailyBudget * 1.25;
    reason = `ROAS ${roas.toFixed(2)} exceeds 2.0, scaling +25%`;
    
    await db.collection("adCampaigns").doc(campaignId).update({
      dailyBudget: newBudget,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // Log the action
  const actionRecord: ROASAction = {
    campaignId,
    action,
    roas,
    previousBudget: currentDailyBudget,
    newBudget,
    timestamp: admin.firestore.Timestamp.now(),
    reason,
  };

  await db.collection("roasAutomationLogs").add(actionRecord);

  // Send notification to KPI system (PACK 352 integration)
  await logToKPISystem(campaignId, action, roas);

  console.log(`Campaign ${campaignId}: ${action} - ${reason}`);

  return actionRecord;
}

/**
 * Log ROAS action to KPI system
 */
async function logToKPISystem(
  campaignId: string,
  action: string,
  roas: number
): Promise<void> {
  try {
    // This integrates with PACK 352 KPI Engine
    await db.collection("kpiEvents").add({
      type: "ROAS_ACTION",
      campaignId,
      action,
      roas,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("Error logging to KPI system:", error);
  }
}

/**
 * Admin: Get ROAS automation history
 */
export const getROASHistory = functions.https.onCall(
  async (data: { campaignId?: string; days?: number }, context) => {
    // Verify admin
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    if (userDoc.data()?.role !== "admin") {
      throw new functions.https.HttpsError("permission-denied", "Admin access required");
    }

    try {
      const days = data.days || 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      let query = db
        .collection("roasAutomationLogs")
        .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(cutoffDate))
        .orderBy("timestamp", "desc") as admin.firestore.Query;

      if (data.campaignId) {
        query = query.where("campaignId", "==", data.campaignId);
      }

      const logs = await query.limit(100).get();
      
      const history = logs.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      return { history };
    } catch (error) {
      console.error("Error getting ROAS history:", error);
      throw new functions.https.HttpsError("internal", "Failed to get ROAS history");
    }
  }
);

/**
 * Admin: Manual ROAS optimization (force run)
 */
export const runManualROASOptimization = functions.https.onCall(
  async (data: { campaignId: string }, context) => {
    // Verify admin
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    if (userDoc.data()?.role !== "admin") {
      throw new functions.https.HttpsError("permission-denied", "Admin access required");
    }

    try {
      const campaignDoc = await db.collection("adCampaigns").doc(data.campaignId).get();
      
      if (!campaignDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Campaign not found");
      }

      const campaign = campaignDoc.data()!;
      const action = await optimizeCampaignBudget(data.campaignId, campaign);

      return { success: true, action };
    } catch (error) {
      console.error("Error in manual ROAS optimization:", error);
      throw new functions.https.HttpsError("internal", "Failed to optimize campaign");
    }
  }
);

/**
 * Admin: Get ROAS dashboard summary
 */
export const getROASDashboard = functions.https.onCall(
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
      // Get all campaigns
      const campaigns = await db.collection("adCampaigns").get();
      const performancePromises = campaigns.docs.map(doc => 
        db.collection("adPerformance").doc(doc.id).get()
      );
      const performances = await Promise.all(performancePromises);

      let totalSpend = 0;
      let totalRevenue = 0;
      let activeCampaigns = 0;
      let pausedByRoas = 0;

      const campaignData = campaigns.docs.map((doc, index) => {
        const campaign = doc.data();
        const performance = performances[index].data();

        const spend = performance?.spend || 0;
        const revenue = performance?.revenue || 0;
        const roas = performance?.roas || 0;

        totalSpend += spend;
        totalRevenue += revenue;

        if (campaign.status === "ACTIVE") {
          activeCampaigns++;
        }

        return {
          campaignId: doc.id,
          platform: campaign.platform,
          status: campaign.status,
          dailyBudget: campaign.dailyBudget,
          roas,
          spend,
          revenue,
        };
      });

      // Get recent ROAS logs
      const recentLogs = await db
        .collection("roasAutomationLogs")
        .orderBy("timestamp", "desc")
        .limit(10)
        .get();

      recentLogs.forEach(log => {
        const data = log.data();
        if (data.action === "PAUSE") {
          pausedByRoas++;
        }
      });

      const overallRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

      return {
        overview: {
          totalSpend,
          totalRevenue,
          overallRoas,
          activeCampaigns,
          pausedByRoas,
        },
        campaigns: campaignData,
        recentActions: recentLogs.docs.map(doc => doc.data()),
      };
    } catch (error) {
      console.error("Error getting ROAS dashboard:", error);
      throw new functions.https.HttpsError("internal", "Failed to get dashboard");
    }
  }
);

/**
 * Calculate country-level ROAS
 */
export const calculateCountryROAS = functions.pubsub
  .schedule("0 4 * * *") // 4 AM UTC daily
  .timeZone("UTC")
  .onRun(async (context) => {
    console.log("Calculating country-level ROAS...");

    try {
      const campaigns = await db.collection("adCampaigns").get();
      const countryStats: Record<string, { spend: number; revenue: number; campaigns: number }> = {};

      for (const campaignDoc of campaigns.docs) {
        const campaign = campaignDoc.data();
        const countryCode = campaign.countryCode;

        // Get performance
        const performanceDoc = await db.collection("adPerformance").doc(campaignDoc.id).get();
        const performance = performanceDoc.data();

        if (!performance) continue;

        if (!countryStats[countryCode]) {
          countryStats[countryCode] = { spend: 0, revenue: 0, campaigns: 0 };
        }

        countryStats[countryCode].spend += performance.spend || 0;
        countryStats[countryCode].revenue += performance.revenue || 0;
        countryStats[countryCode].campaigns++;
      }

      // Store country performance
      for (const [countryCode, stats] of Object.entries(countryStats)) {
        const roas = stats.spend > 0 ? stats.revenue / stats.spend : 0;

        await db.collection("adCountryPerformance").doc(countryCode).set({
          countryCode,
          totalSpend: stats.spend,
          totalRevenue: stats.revenue,
          activeCampaigns: stats.campaigns,
          roas,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      console.log(`Country ROAS calculated for ${Object.keys(countryStats).length} countries`);
    } catch (error) {
      console.error("Error calculating country ROAS:", error);
    }
  });
