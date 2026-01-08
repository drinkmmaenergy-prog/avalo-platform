/**
 * PACK 356 - Ad Tracking
 * Tracks user events from mobile SDK and ad platforms
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

// Campaign Types
export type CampaignType = "META" | "TIKTOK" | "GOOGLE" | "UGC_CREATOR" | "APP_STORE";

export type CampaignObjective =
  | "INSTALL"
  | "REGISTRATION"
  | "VERIFICATION"
  | "FIRST_TOKEN_PURCHASE"
  | "FIRST_PAID_CHAT";

export type CampaignStatus = "ACTIVE" | "PAUSED" | "BLOCKED";

// Event Types
export type AdEventType =
  | "install"
  | "register"
  | "verification_passed"
  | "token_purchase"
  | "paid_chat_start";

// Interfaces
export interface AdCampaign {
  campaignId: string;
  platform: CampaignType;
  objective: CampaignObjective;
  dailyBudget: number;
  totalBudget: number;
  countryCode: string;
  status: CampaignStatus;
  createdAt: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
}

export interface AdEvent {
  userId: string;
  eventType: AdEventType;
  campaignId?: string;
  source?: string;
  timestamp: admin.firestore.Timestamp;
  metadata?: Record<string, any>;
}

export interface DeviceFraudCheck {
  isEmulator: boolean;
  isVPN: boolean;
  isProxy: boolean;
  riskScore: number;
  deviceFingerprint: string;
}

/**
 * Track ad event from mobile SDK
 */
export const trackAdEvent = functions.https.onCall(
  async (data: {
    eventType: AdEventType;
    campaignId?: string;
    source?: string;
    metadata?: Record<string, any>;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const userId = context.auth.uid;

    try {
      // Check feature flag
      const config = await db.collection("config").doc("features").get();
      const adsEnabled = config.data()?.["ads.enabled"] ?? false;
      
      if (!adsEnabled) {
        return { success: false, reason: "ads_disabled" };
      }

      // Perform fraud checks
      const fraudCheck = await performFraudCheck(userId, data.metadata);
      
      if (fraudCheck.shouldBlock) {
        // Log blocked install
        await db.collection("fraudBlockedInstalls").add({
          userId,
          reason: fraudCheck.reason,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          campaignId: data.campaignId,
          metadata: data.metadata,
        });

        return { success: false, reason: "fraud_blocked" };
      }

      // Create ad event
      const eventRef = await db
        .collection("users")
        .doc(userId)
        .collection("adEvents")
        .add({
          userId,
          eventType: data.eventType,
          campaignId: data.campaignId,
          source: data.source,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          metadata: data.metadata || {},
          fraudRiskScore: fraudCheck.riskScore,
        });

      // If this is an install event, create attribution
      if (data.eventType === "install" && data.campaignId) {
        await createAttribution(userId, data.campaignId, data.source || "unknown");
      }

      // Update performance metrics
      if (data.campaignId) {
        await updateCampaignPerformance(data.campaignId, data.eventType);
      }

      return { success: true, eventId: eventRef.id };
    } catch (error) {
      console.error("Error tracking ad event:", error);
      throw new functions.https.HttpsError("internal", "Failed to track ad event");
    }
  }
);

/**
 * Perform fraud detection checks
 */
async function performFraudCheck(
  userId: string,
  metadata?: Record<string, any>
): Promise<{ shouldBlock: boolean; reason?: string; riskScore: number }> {
  let riskScore = 0;
  let shouldBlock = false;
  let reason: string | undefined;

  // Check for emulator
  if (metadata?.isEmulator === true) {
    riskScore += 10;
    shouldBlock = true;
    reason = "emulator_detected";
  }

  // Check for VPN
  if (metadata?.isVPN === true) {
    riskScore += 1;
  }

  // Check for proxy
  if (metadata?.isProxy === true) {
    riskScore += 2;
  }

  // Check device fingerprint for duplicates
  if (metadata?.deviceFingerprint) {
    const duplicateDevices = await db
      .collection("users")
      .where("deviceFingerprint", "==", metadata.deviceFingerprint)
      .limit(10)
      .get();

    if (duplicateDevices.size >= 5) {
      riskScore += 5;
      shouldBlock = true;
      reason = "device_farm_detected";
    }
  }

  // Check for click spam patterns
  if (metadata?.clickToInstallTime && metadata.clickToInstallTime < 5) {
    riskScore += 3;
    shouldBlock = true;
    reason = "click_spam_detected";
  }

  // Check user's referral status (referral overrides ads)
  const userDoc = await db.collection("users").doc(userId).get();
  const userData = userDoc.data();
  
  if (userData?.referredBy) {
    // User was referred, so ad attribution should not apply
    return { shouldBlock: true, reason: "referred_user", riskScore: 0 };
  }

  return { shouldBlock, reason, riskScore };
}

/**
 * Create attribution record
 */
async function createAttribution(
  userId: string,
  campaignId: string,
  source: string
): Promise<void> {
  await db.collection("adAttribution").add({
    userId,
    campaignId,
    source,
    installTime: admin.firestore.FieldValue.serverTimestamp(),
    verified: false,
    revenueGenerated: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Update campaign performance metrics
 */
async function updateCampaignPerformance(
  campaignId: string,
  eventType: AdEventType
): Promise<void> {
  const performanceRef = db.collection("adPerformance").doc(campaignId);
  
  const updates: Record<string, any> = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  switch (eventType) {
    case "install":
      updates.installs = admin.firestore.FieldValue.increment(1);
      break;
    case "register":
      updates.registrations = admin.firestore.FieldValue.increment(1);
      break;
    case "verification_passed":
      updates.verifiedUsers = admin.firestore.FieldValue.increment(1);
      break;
    case "token_purchase":
      updates.payingUsers = admin.firestore.FieldValue.increment(1);
      break;
    case "paid_chat_start":
      updates.paidChats = admin.firestore.FieldValue.increment(1);
      break;
  }

  await performanceRef.set(updates, { merge: true });
}

/**
 * Admin: Create ad campaign
 */
export const createAdCampaign = functions.https.onCall(
  async (data: Omit<AdCampaign, "createdAt">, context) => {
    // Verify admin
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    if (userDoc.data()?.role !== "admin") {
      throw new functions.https.HttpsError("permission-denied", "Admin access required");
    }

    try {
      const campaignRef = await db.collection("adCampaigns").add({
        ...data,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Initialize performance doc
      await db.collection("adPerformance").doc(campaignRef.id).set({
        campaignId: campaignRef.id,
        impressions: 0,
        clicks: 0,
        installs: 0,
        registrations: 0,
        verifiedUsers: 0,
        payingUsers: 0,
        paidChats: 0,
        revenue: 0,
        spend: 0,
        roas: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, campaignId: campaignRef.id };
    } catch (error) {
      console.error("Error creating campaign:", error);
      throw new functions.https.HttpsError("internal", "Failed to create campaign");
    }
  }
);

/**
 * Admin: Update campaign status
 */
export const updateCampaignStatus = functions.https.onCall(
  async (data: { campaignId: string; status: CampaignStatus }, context) => {
    // Verify admin
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    if (userDoc.data()?.role !== "admin") {
      throw new functions.https.HttpsError("permission-denied", "Admin access required");
    }

    try {
      await db.collection("adCampaigns").doc(data.campaignId).update({
        status: data.status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error("Error updating campaign status:", error);
      throw new functions.https.HttpsError("internal", "Failed to update campaign status");
    }
  }
);

/**
 * Admin: Update campaign budget
 */
export const updateCampaignBudget = functions.https.onCall(
  async (data: { campaignId: string; dailyBudget: number; totalBudget: number }, context) => {
    // Verify admin
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    if (userDoc.data()?.role !== "admin") {
      throw new functions.https.HttpsError("permission-denied", "Admin access required");
    }

    try {
      await db.collection("adCampaigns").doc(data.campaignId).update({
        dailyBudget: data.dailyBudget,
        totalBudget: data.totalBudget,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error("Error updating campaign budget:", error);
      throw new functions.https.HttpsError("internal", "Failed to update campaign budget");
    }
  }
);

/**
 * Webhook: Receive external ad platform events
 */
export const adPlatformWebhook = functions.https.onRequest(async (req, res) => {
  // Verify webhook signature (implement per platform)
  const platform = req.body.platform as CampaignType;
  
  try {
    switch (platform) {
      case "META":
        await handleMetaWebhook(req.body);
        break;
      case "TIKTOK":
        await handleTikTokWebhook(req.body);
        break;
      case "GOOGLE":
        await handleGoogleWebhook(req.body);
        break;
      default:
        res.status(400).send("Unknown platform");
        return;
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).send("Error");
  }
});

async function handleMetaWebhook(data: any): Promise<void> {
  // Update impressions and clicks from Meta
  if (data.campaignId && data.metrics) {
    await db.collection("adPerformance").doc(data.campaignId).update({
      impressions: data.metrics.impressions || 0,
      clicks: data.metrics.clicks || 0,
      spend: data.metrics.spend || 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

async function handleTikTokWebhook(data: any): Promise<void> {
  // Similar to Meta
  if (data.campaignId && data.metrics) {
    await db.collection("adPerformance").doc(data.campaignId).update({
      impressions: data.metrics.impressions || 0,
      clicks: data.metrics.clicks || 0,
      spend: data.metrics.spend || 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

async function handleGoogleWebhook(data: any): Promise<void> {
  // Similar to Meta
  if (data.campaignId && data.metrics) {
    await db.collection("adPerformance").doc(data.campaignId).update({
      impressions: data.metrics.impressions || 0,
      clicks: data.metrics.clicks || 0,
      spend: data.metrics.spend || 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}
