/**
 * PACK 168 — Anti-Farming Schedulers
 * Periodic scanning and audit functions
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { db } from "./init";
import { Timestamp } from "firebase-admin/firestore";
import { detectMultiAccountFarming, requestIdentityReVerification, disableAffiliateLinks } from "./pack168-multi-account-detection";
import { calculateFarmingRiskScore } from "./pack168-anti-farming-engine";
import { scanConversationHistory } from "./pack168-emotional-grooming";
import { NetworkGraphScanResult, AffiliateLoopAudit } from "./pack168-types";

export const networkGraphScan = onSchedule(
  {
    schedule: "every 6 hours",
    timeZone: "UTC",
    memory: "1GiB",
    timeoutSeconds: 540
  },
  async (event) => {
    const scanId = `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    console.log(`Starting network graph scan: ${scanId}`);

    const usersSnapshot = await db.collection("users")
      .where("accountStatus", "==", "active")
      .limit(10000)
      .get();

    const userIds = usersSnapshot.docs.map(doc => doc.id);
    console.log(`Scanning ${userIds.length} users for multi-account patterns`);

    try {
      const result = await detectMultiAccountFarming(userIds);
      
      const casesCreated: number[] = [];
      for (const cluster of result.clusters) {
        if (cluster.investigationId) {
          casesCreated.push(parseInt(cluster.investigationId.split("_")[2] || "0"));
        }
      }

      const scanResult: NetworkGraphScanResult = {
        scanId,
        scanTimestamp: Timestamp.now(),
        nodesScanned: userIds.length,
        suspiciousNetworks: result.clusters.length,
        casesCreated,
        duration: Date.now() - startTime
      };

      await db.collection("network_graph_scans").doc(scanId).set(scanResult);

      console.log(`Network scan complete: ${result.clusters.length} suspicious networks found`);
    } catch (error) {
      console.error("Network graph scan failed:", error);
      throw error;
    }
  }
);

export const affiliateLoopAudit = onSchedule(
  {
    schedule: "every 12 hours",
    timeZone: "UTC",
    memory: "512MiB",
    timeoutSeconds: 300
  },
  async (event) => {
    const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`Starting affiliate loop audit: ${auditId}`);

    const affiliatesSnapshot = await db.collection("affiliates")
      .where("status", "==", "active")
      .limit(5000)
      .get();

    let suspiciousLoops = 0;
    let circularDetected = 0;
    let fakeAccountsFound = 0;

    for (const doc of affiliatesSnapshot.docs) {
      const userId = doc.id;
      const data = doc.data();
      
      const chain = await buildAffiliateChain(userId, []);
      
      if (hasCycle(chain)) {
        circularDetected++;
        suspiciousLoops++;
        
        console.log(`Circular referral detected for user ${userId}`);
        
        await disableAffiliateLinks(chain);
        
        await db.collection("affiliate_violations").add({
          auditId,
          userId,
          violationType: "circular_referral",
          chain,
          detectedAt: Timestamp.now()
        });
      }

      const fakeAccounts = await detectFakeReferrals(userId, data.referrals || []);
      if (fakeAccounts > 0) {
        fakeAccountsFound += fakeAccounts;
        suspiciousLoops++;
        
        await db.collection("affiliate_violations").add({
          auditId,
          userId,
          violationType: "fake_referrals",
          fakeAccountCount: fakeAccounts,
          detectedAt: Timestamp.now()
        });
      }
    }

    const audit: AffiliateLoopAudit = {
      auditId,
      timestamp: Timestamp.now(),
      affiliateChain: [],
      suspicious: suspiciousLoops > 0,
      circularReferrals: circularDetected > 0,
      fakeAccountsDetected: fakeAccountsFound,
      action: suspiciousLoops > 0 ? "violations_recorded" : "no_action"
    };

    await db.collection("affiliate_loop_audits").doc(auditId).set(audit);

    console.log(`Affiliate audit complete: ${suspiciousLoops} suspicious loops found`);
  }
);

export const spendingHealthNotifications = onSchedule(
  {
    schedule: "every day 09:00",
    timeZone: "UTC",
    memory: "512MiB",
    timeoutSeconds: 300
  },
  async (event) => {
    console.log("Starting daily spending health notifications");

    const profilesSnapshot = await db.collection("wealth_protection_profiles")
      .where("protectionSettings.spendingAlertsEnabled", "==", true)
      .get();

    let notificationsSent = 0;

    for (const doc of profilesSnapshot.docs) {
      const profile = doc.data();
      const userId = doc.id;

      if (profile.last30DaysSpent > (profile.protectionSettings.weeklyBudget || Infinity) * 4) {
        await db.collection("spending_health_notifications").add({
          notificationId: `shn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          userId,
          timestamp: Timestamp.now(),
          type: "spending_milestone",
          message: `You've spent $${profile.last30DaysSpent.toFixed(2)} in the last 30 days. Consider reviewing your budget.`,
          actionable: true,
          action: "review_budget",
          dismissed: false
        });

        await db.collection("notifications").add({
          userId,
          type: "spending_health",
          title: "Spending Health Check",
          body: `You've spent $${profile.last30DaysSpent.toFixed(2)} in the last 30 days.`,
          data: {
            amount: profile.last30DaysSpent,
            action: "open_budget_settings"
          },
          createdAt: Timestamp.now(),
          read: false
        });

        notificationsSent++;
      }
    }

    console.log(`Spending health notifications sent: ${notificationsSent}`);
  }
);

export const riskScoreRecalculation = onSchedule(
  {
    schedule: "every 24 hours",
    timeZone: "UTC",
    memory: "1GiB",
    timeoutSeconds: 540
  },
  async (event) => {
    console.log("Starting risk score recalculation");

    const scoresSnapshot = await db.collection("farming_risk_scores")
      .orderBy("lastCalculated", "asc")
      .limit(1000)
      .get();

    let recalculated = 0;
    const highRiskUsers: string[] = [];

    for (const doc of scoresSnapshot.docs) {
      const userId = doc.id;
      const oldScore = doc.data().score;

      const newScore = await calculateFarmingRiskScore(userId);

      if (newScore.score > 0.7 && newScore.score > oldScore) {
        highRiskUsers.push(userId);
        
        console.log(`High risk user detected: ${userId} (score: ${newScore.score})`);
      }

      recalculated++;
    }

    if (highRiskUsers.length > 0) {
      await db.collection("risk_score_alerts").add({
        timestamp: Timestamp.now(),
        highRiskUsers,
        count: highRiskUsers.length,
        alertType: "risk_escalation"
      });
    }

    console.log(`Risk scores recalculated: ${recalculated}, High risk users: ${highRiskUsers.length}`);
  }
);

export const conversationHealthScan = onSchedule(
  {
    schedule: "every 8 hours",
    timeZone: "UTC",
    memory: "1GiB",
    timeoutSeconds: 540
  },
  async (event) => {
    console.log("Starting conversation health scan");

    const highSpendersSnapshot = await db.collection("wealth_protection_profiles")
      .where("last30DaysSpent", ">", 1000)
      .limit(500)
      .get();

    let scanned = 0;
    let atRisk = 0;

    for (const doc of highSpendersSnapshot.docs) {
      const userId = doc.id;
      
      const result = await scanConversationHistory(userId, 14);
      
      if (result.totalRisk > 0.6) {
        atRisk++;
        
        await db.collection("conversation_health_alerts").add({
          userId,
          timestamp: Timestamp.now(),
          riskLevel: result.totalRisk,
          suspiciousConversations: result.suspiciousConversations,
          requiresReview: true
        });

        await db.collection("notifications").add({
          userId,
          type: "safety_alert",
          title: "Conversation Safety Check",
          body: "We've detected potentially concerning patterns in your conversations. Please review your recent interactions.",
          data: {
            riskLevel: result.totalRisk,
            conversationCount: result.suspiciousConversations.length
          },
          createdAt: Timestamp.now(),
          read: false
        });
      }

      scanned++;
    }

    console.log(`Conversation health scan complete: ${scanned} users scanned, ${atRisk} at risk`);
  }
);

export const weeklyBudgetReset = onSchedule(
  {
    schedule: "every monday 00:00",
    timeZone: "UTC",
    memory: "512MiB",
    timeoutSeconds: 300
  },
  async (event) => {
    console.log("Starting weekly budget reset");

    const profilesSnapshot = await db.collection("wealth_protection_profiles")
      .where("protectionSettings.weeklyBudget", ">", 0)
      .get();

    let reset = 0;

    const batch = db.batch();

    for (const doc of profilesSnapshot.docs) {
      batch.update(doc.ref, {
        weeklySpent: 0,
        weeklyBudgetResetAt: Timestamp.now()
      });

      reset++;

      if (reset % 500 === 0) {
        await batch.commit();
      }
    }

    await batch.commit();

    console.log(`Weekly budgets reset for ${reset} users`);
  }
);

export const escrowProtectionReview = onSchedule(
  {
    schedule: "every 24 hours",
    timeZone: "UTC",
    memory: "512MiB",
    timeoutSeconds: 300
  },
  async (event) => {
    console.log("Starting escrow protection review");

    const now = Date.now();
    const riskScoresSnapshot = await db.collection("farming_risk_scores")
      .where("escrowProtectionDays", ">", 0)
      .get();

    let reviewed = 0;
    let released = 0;

    for (const doc of riskScoresSnapshot.docs) {
      const userId = doc.id;
      const data = doc.data();
      
      const earningsSnapshot = await db.collection("creator_earnings")
        .where("userId", "==", userId)
        .where("inEscrow", "==", true)
        .get();

      for (const earningDoc of earningsSnapshot.docs) {
        const earning = earningDoc.data();
        const escrowStartDate = earning.escrowStartedAt?.toDate().getTime() || now;
        const daysInEscrow = (now - escrowStartDate) / (1000 * 60 * 60 * 24);

        if (daysInEscrow >= data.escrowProtectionDays) {
          await earningDoc.ref.update({
            inEscrow: false,
            escrowReleasedAt: Timestamp.now(),
            availableForPayout: true
          });

          released++;
        }
      }

      reviewed++;
    }

    console.log(`Escrow review complete: ${reviewed} users reviewed, ${released} earnings released`);
  }
);

async function buildAffiliateChain(userId: string, visited: string[]): Promise<string[]> {
  if (visited.includes(userId)) {
    return [...visited, userId];
  }

  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) {
    return visited;
  }

  const referredBy = userDoc.data()?.referredBy;
  if (!referredBy) {
    return visited;
  }

  return buildAffiliateChain(referredBy, [...visited, userId]);
}

function hasCycle(chain: string[]): boolean {
  const seen = new Set<string>();
  for (const id of chain) {
    if (seen.has(id)) {
      return true;
    }
    seen.add(id);
  }
  return false;
}

async function detectFakeReferrals(userId: string, referrals: string[]): Promise<number> {
  let fakeCount = 0;

  for (const referralId of referrals) {
    const userDoc = await db.collection("users").doc(referralId).get();
    
    if (!userDoc.exists) {
      fakeCount++;
      continue;
    }

    const data = userDoc.data();
    
    const hasActivity = data?.lastActiveAt && 
      (Date.now() - data.lastActiveAt.toDate().getTime()) < 30 * 24 * 60 * 60 * 1000;

    const hasTransactions = data?.totalSpent && data.totalSpent > 0;

    if (!hasActivity && !hasTransactions) {
      fakeCount++;
    }
  }

  return fakeCount;
}