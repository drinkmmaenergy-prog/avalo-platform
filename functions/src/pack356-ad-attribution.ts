/**
 * PACK 356 - Ad Attribution
 * Handles attribution logic and revenue tracking
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

export interface Attribution {
  userId: string;
  campaignId: string;
  source: string;
  installTime: admin.firestore.Timestamp;
  firstPurchaseTime?: admin.firestore.Timestamp;
  revenueGenerated: number;
  verified: boolean;
  createdAt: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
}

/**
 * Trigger: When user gets verified, update attribution
 */
export const onUserVerified = functions.firestore
  .document("users/{userId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const userId = context.params.userId;

    // Check if user just got verified
    if (!before.verified && after.verified) {
      try {
        // Find attribution record
        const attributionQuery = await db
          .collection("adAttribution")
          .where("userId", "==", userId)
          .limit(1)
          .get();

        if (!attributionQuery.empty) {
          const attributionDoc = attributionQuery.docs[0];
          
          // Update attribution as verified
          await attributionDoc.ref.update({
            verified: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Update campaign performance
          const campaignId = attributionDoc.data().campaignId;
          await db.collection("adPerformance").doc(campaignId).update({
            verifiedUsers: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log(`Attribution verified for user ${userId}, campaign ${campaignId}`);
        }
      } catch (error) {
        console.error("Error updating attribution on verification:", error);
      }
    }
  });

/**
 * Trigger: When user makes first purchase, update attribution revenue
 */
export const onTokenPurchase = functions.firestore
  .document("transactions/{transactionId}")
  .onCreate(async (snap, context) => {
    const transaction = snap.data();
    const userId = transaction.userId;
    const amount = transaction.amount || 0;

    if (!userId || amount <= 0) return;

    try {
      // Find attribution record
      const attributionQuery = await db
        .collection("adAttribution")
        .where("userId", "==", userId)
        .limit(1)
        .get();

      if (!attributionQuery.empty) {
        const attributionDoc = attributionQuery.docs[0];
        const attributionData = attributionDoc.data();
        
        // Check if this is first purchase
        const isFirstPurchase = !attributionData.firstPurchaseTime;

        const updates: Record<string, any> = {
          revenueGenerated: admin.firestore.FieldValue.increment(amount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (isFirstPurchase) {
          updates.firstPurchaseTime = admin.firestore.FieldValue.serverTimestamp();
        }

        await attributionDoc.ref.update(updates);

        // Update campaign performance revenue
        const campaignId = attributionData.campaignId;
        await updateCampaignRevenue(campaignId, amount, isFirstPurchase);

        console.log(`Attribution revenue updated: user ${userId}, campaign ${campaignId}, amount ${amount}`);
      }
    } catch (error) {
      console.error("Error updating attribution revenue:", error);
    }
  });

/**
 * Update campaign revenue and ROAS
 */
async function updateCampaignRevenue(
  campaignId: string,
  amount: number,
  isFirstPurchase: boolean
): Promise<void> {
  const performanceRef = db.collection("adPerformance").doc(campaignId);
  const performanceDoc = await performanceRef.get();
  
  if (!performanceDoc.exists) return;

  const performance = performanceDoc.data()!;
  const newRevenue = (performance.revenue || 0) + amount;
  const spend = performance.spend || 0;
  const newRoas = spend > 0 ? newRevenue / spend : 0;

  const updates: Record<string, any> = {
    revenue: newRevenue,
    roas: newRoas,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (isFirstPurchase) {
    updates.payingUsers = admin.firestore.FieldValue.increment(1);
  }

  await performanceRef.update(updates);
}

/**
 * Admin: Get attribution report
 */
export const getAttributionReport = functions.https.onCall(
  async (data: { campaignId?: string; startDate?: string; endDate?: string }, context) => {
    // Verify admin
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    if (userDoc.data()?.role !== "admin") {
      throw new functions.https.HttpsError("permission-denied", "Admin access required");
    }

    try {
      let query = db.collection("adAttribution") as admin.firestore.Query;

      if (data.campaignId) {
        query = query.where("campaignId", "==", data.campaignId);
      }

      const attributions = await query.get();
      
      const report = {
        totalInstalls: attributions.size,
        verifiedUsers: 0,
        payingUsers: 0,
        totalRevenue: 0,
        averageRevenuePerUser: 0,
        conversionRate: 0,
      };

      attributions.forEach((doc) => {
        const attr = doc.data();
        if (attr.verified) report.verifiedUsers++;
        if (attr.firstPurchaseTime) report.payingUsers++;
        report.totalRevenue += attr.revenueGenerated || 0;
      });

      report.averageRevenuePerUser = report.totalInstalls > 0 
        ? report.totalRevenue / report.totalInstalls 
        : 0;
      
      report.conversionRate = report.totalInstalls > 0
        ? (report.payingUsers / report.totalInstalls) * 100
        : 0;

      return report;
    } catch (error) {
      console.error("Error generating attribution report:", error);
      throw new functions.https.HttpsError("internal", "Failed to generate report");
    }
  }
);

/**
 * Admin: Get user attribution details
 */
export const getUserAttribution = functions.https.onCall(
  async (data: { userId: string }, context) => {
    // Verify admin
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    if (userDoc.data()?.role !== "admin") {
      throw new functions.https.HttpsError("permission-denied", "Admin access required");
    }

    try {
      const attributionQuery = await db
        .collection("adAttribution")
        .where("userId", "==", data.userId)
        .limit(1)
        .get();

      if (attributionQuery.empty) {
        return { hasAttribution: false };
      }

      const attribution = attributionQuery.docs[0].data();
      
      // Get campaign details
      const campaignDoc = await db.collection("adCampaigns").doc(attribution.campaignId).get();
      const campaign = campaignDoc.data();

      return {
        hasAttribution: true,
        attribution,
        campaign,
      };
    } catch (error) {
      console.error("Error getting user attribution:", error);
      throw new functions.https.HttpsError("internal", "Failed to get attribution");
    }
  }
);

/**
 * Calculate LTV by campaign
 */
export const calculateCampaignLTV = functions.https.onCall(
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
      const attributions = await db
        .collection("adAttribution")
        .where("campaignId", "==", data.campaignId)
        .get();

      let totalRevenue = 0;
      let totalUsers = attributions.size;

      attributions.forEach((doc) => {
        const attr = doc.data();
        totalRevenue += attr.revenueGenerated || 0;
      });

      const ltv = totalUsers > 0 ? totalRevenue / totalUsers : 0;

      // Get campaign performance
      const performanceDoc = await db.collection("adPerformance").doc(data.campaignId).get();
      const performance = performanceDoc.data();

      return {
        campaignId: data.campaignId,
        totalUsers,
        totalRevenue,
        ltv,
        cpa: performance?.cpa || 0,
        roas: performance?.roas || 0,
      };
    } catch (error) {
      console.error("Error calculating LTV:", error);
      throw new functions.https.HttpsError("internal", "Failed to calculate LTV");
    }
  }
);

/**
 * Scheduled: Calculate CPA for all campaigns daily
 */
export const calculateCPA = functions.pubsub
  .schedule("0 2 * * *") // 2 AM daily
  .timeZone("UTC")
  .onRun(async (context) => {
    try {
      const campaigns = await db.collection("adCampaigns").get();

      for (const campaignDoc of campaigns.docs) {
        const campaignId = campaignDoc.id;
        
        // Get performance data
        const performanceDoc = await db.collection("adPerformance").doc(campaignId).get();
        if (!performanceDoc.exists) continue;

        const performance = performanceDoc.data()!;
        const spend = performance.spend || 0;
        const installs = performance.installs || 0;
        const verifiedUsers = performance.verifiedUsers || 0;
        const payingUsers = performance.payingUsers || 0;

        // Calculate metrics
        const cpa = installs > 0 ? spend / installs : 0;
        const cpv = verifiedUsers > 0 ? spend / verifiedUsers : 0;
        const cpp = payingUsers > 0 ? spend / payingUsers : 0;

        // Update performance doc
        await performanceDoc.ref.update({
          cpa,
          cpv, // Cost Per Verified user
          cpp, // Cost Per Paying user
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`CPA calculated for campaign ${campaignId}: ${cpa}`);
      }

      console.log("Daily CPA calculation completed");
    } catch (error) {
      console.error("Error calculating CPA:", error);
    }
  });
