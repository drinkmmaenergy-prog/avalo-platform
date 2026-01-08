/**
 * PACK 356 - Retargeting Engine
 * Manages retargeting audiences and campaigns
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

export type RetargetingAudienceType =
  | "REGISTERED_UNVERIFIED"
  | "VERIFIED_UNPAID"
  | "PAID_ONCE_INACTIVE"
  | "CHURN_RISK";

export interface RetargetingAudience {
  type: RetargetingAudienceType;
  userIds: string[];
  size: number;
  lastUpdated: admin.firestore.Timestamp;
  metadata?: Record<string, any>;
}

export interface RetargetingCampaign {
  audienceType: RetargetingAudienceType;
  platform: string;
  active: boolean;
  createdAt: admin.firestore.Timestamp;
}

/**
 * Scheduled: Build retargeting audiences daily
 * Runs at 5 AM UTC
 */
export const buildRetargetingAudiences = functions.pubsub
  .schedule("0 5 * * *")
  .timeZone("UTC")
  .onRun(async (context) => {
    console.log("Building retargeting audiences...");

    try {
      // Check if retargeting is enabled
      const config = await db.collection("config").doc("features").get();
      const retargetingEnabled = config.data()?.["ads.retarg.enabled"] ?? false;

      if (!retargetingEnabled) {
        console.log("Retargeting disabled");
        return { success: false, reason: "disabled" };
      }

      // Build all audience types
      await buildRegisteredUnverifiedAudience();
      await buildVerifiedUnpaidAudience();
      await buildPaidOnceInactiveAudience();
      await buildChurnRiskAudience();

      console.log("Retargeting audiences built successfully");
      return { success: true };
    } catch (error) {
      console.error("Error building retargeting audiences:", error);
      throw error;
    }
  });

/**
 * Build audience: Registered but unverified users
 */
async function buildRegisteredUnverifiedAudience(): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7); // Last 7 days

  const users = await db
    .collection("users")
    .where("verified", "==", false)
    .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(cutoffDate))
    .get();

  const userIds = users.docs.map(doc => doc.id);

  await db.collection("adRetargetingAudiences").doc("registered_unverified").set({
    type: "REGISTERED_UNVERIFIED",
    userIds,
    size: userIds.length,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    metadata: {
      daysSinceRegistration: 7,
    },
  });

  console.log(`Registered Unverified audience: ${userIds.length} users`);

  // Send push notifications
  await sendRetargetingPush(userIds, "REGISTERED_UNVERIFIED");
}

/**
 * Build audience: Verified but unpaid users
 */
async function buildVerifiedUnpaidAudience(): Promise<void> {
  // Get verified users
  const verifiedUsers = await db
    .collection("users")
    .where("verified", "==", true)
    .get();

  const unpaidUserIds: string[] = [];

  for (const userDoc of verifiedUsers.docs) {
    const userId = userDoc.id;

    // Check if user has any transactions
    const transactions = await db
      .collection("transactions")
      .where("userId", "==", userId)
      .limit(1)
      .get();

    if (transactions.empty) {
      unpaidUserIds.push(userId);
    }
  }

  await db.collection("adRetargetingAudiences").doc("verified_unpaid").set({
    type: "VERIFIED_UNPAID",
    userIds: unpaidUserIds,
    size: unpaidUserIds.length,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`Verified Unpaid audience: ${unpaidUserIds.length} users`);

  // Send push notifications
  await sendRetargetingPush(unpaidUserIds, "VERIFIED_UNPAID");
}

/**
 * Build audience: Paid once but inactive
 */
async function buildPaidOnceInactiveAudience(): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 14); // Inactive for 14 days

  // Get users with transactions
  const transactions = await db
    .collection("transactions")
    .where("createdAt", "<=", admin.firestore.Timestamp.fromDate(cutoffDate))
    .get();

  const paidUserIds = new Set<string>();
  transactions.forEach(doc => {
    paidUserIds.add(doc.data().userId);
  });

  const inactiveUserIds: string[] = [];

  for (const userId of Array.from(paidUserIds)) {
    // Check last activity
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    if (userData?.lastActiveAt) {
      const lastActive = userData.lastActiveAt.toDate();
      if (lastActive < cutoffDate) {
        inactiveUserIds.push(userId);
      }
    }
  }

  await db.collection("adRetargetingAudiences").doc("paid_once_inactive").set({
    type: "PAID_ONCE_INACTIVE",
    userIds: inactiveUserIds,
    size: inactiveUserIds.length,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    metadata: {
      inactiveDays: 14,
    },
  });

  console.log(`Paid Once Inactive audience: ${inactiveUserIds.length} users`);

  // Send push notifications
  await sendRetargetingPush(inactiveUserIds, "PAID_ONCE_INACTIVE");
}

/**
 * Build audience: Churn risk users (from PACK 301)
 */
async function buildChurnRiskAudience(): Promise<void> {
  // Query users with high churn risk score
  const users = await db
    .collection("users")
    .where("churnRiskScore", ">=", 0.7)
    .get();

  const userIds = users.docs.map(doc => doc.id);

  await db.collection("adRetargetingAudiences").doc("churn_risk").set({
    type: "CHURN_RISK",
    userIds,
    size: userIds.length,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    metadata: {
      minChurnRisk: 0.7,
    },
  });

  console.log(`Churn Risk audience: ${userIds.length} users`);

  // Send push notifications
  await sendRetargetingPush(userIds, "CHURN_RISK");
}

/**
 * Send retargeting push notifications
 */
async function sendRetargetingPush(
  userIds: string[],
  audienceType: RetargetingAudienceType
): Promise<void> {
  if (userIds.length === 0) return;

  const messages = getRetargetingMessages(audienceType);

  for (const userId of userIds.slice(0, 1000)) { // Batch limit
    try {
      // Get user FCM token
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();

      if (!userData?.fcmToken) continue;

      await admin.messaging().send({
        token: userData.fcmToken,
        notification: {
          title: messages.title,
          body: messages.body,
        },
        data: {
          type: "retargeting",
          audienceType,
        },
      });
    } catch (error) {
      console.error(`Error sending push to user ${userId}:`, error);
    }
  }

  console.log(`Sent retargeting push to ${Math.min(userIds.length, 1000)} users`);
}

/**
 * Get retargeting messages by audience type
 */
function getRetargetingMessages(audienceType: RetargetingAudienceType): {
  title: string;
  body: string;
} {
  switch (audienceType) {
    case "REGISTERED_UNVERIFIED":
      return {
        title: "Complete Your Profile",
        body: "Verify your account to start connecting with amazing people!",
      };
    case "VERIFIED_UNPAID":
      return {
        title: "Unlock Premium Features",
        body: "Get tokens and unlock unlimited messaging and exclusive features!",
      };
    case "PAID_ONCE_INACTIVE":
      return {
        title: "We Miss You!",
        body: "Someone special might be waiting for you. Come back and connect!",
      };
    case "CHURN_RISK":
      return {
        title: "Special Offer Just for You",
        body: "Get 20% bonus tokens and reconnect with your matches!",
      };
    default:
      return {
        title: "Come Back to Avalo",
        body: "Discover new connections today!",
      };
  }
}

/**
 * Send retargeting emails
 */
async function sendRetargetingEmail(
  userIds: string[],
  audienceType: RetargetingAudienceType
): Promise<void> {
  if (userIds.length === 0) return;

  const messages = getRetargetingMessages(audienceType);

  for (const userId of userIds.slice(0, 500)) { // Email batch limit
    try {
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();

      if (!userData?.email) continue;

      // Queue email (would integrate with email service)
      await db.collection("emailQueue").add({
        to: userData.email,
        template: "retargeting",
        data: {
          userName: userData.displayName,
          title: messages.title,
          body: messages.body,
          audienceType,
        },
        scheduledFor: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error(`Error queueing email for user ${userId}:`, error);
    }
  }

  console.log(`Queued retargeting emails for ${Math.min(userIds.length, 500)} users`);
}

/**
 * Admin: Get retargeting audiences
 */
export const getRetargetingAudiences = functions.https.onCall(
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
      const audiences = await db.collection("adRetargetingAudiences").get();

      const audienceData = audiences.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        userIds: undefined, // Don't send full user list
        userCount: doc.data().size,
      }));

      return { audiences: audienceData };
    } catch (error) {
      console.error("Error getting retargeting audiences:", error);
      throw new functions.https.HttpsError("internal", "Failed to get audiences");
    }
  }
);

/**
 * Admin: Export audience for ad platform
 */
export const exportRetargetingAudience = functions.https.onCall(
  async (data: { audienceType: RetargetingAudienceType; platform: string }, context) => {
    // Verify admin
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    if (userDoc.data()?.role !== "admin") {
      throw new functions.https.HttpsError("permission-denied", "Admin access required");
    }

    try {
      const audienceDoc = await db
        .collection("adRetargetingAudiences")
        .doc(data.audienceType.toLowerCase())
        .get();

      if (!audienceDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Audience not found");
      }

      const audience = audienceDoc.data();
      
      // Format for specific platform
      let exportData;
      switch (data.platform) {
        case "META":
          exportData = await formatForMeta(audience!.userIds);
          break;
        case "TIKTOK":
          exportData = await formatForTikTok(audience!.userIds);
          break;
        case "GOOGLE":
          exportData = await formatForGoogle(audience!.userIds);
          break;
        default:
          throw new functions.https.HttpsError("invalid-argument", "Unknown platform");
      }

      return { success: true, exportData };
    } catch (error) {
      console.error("Error exporting audience:", error);
      throw new functions.https.HttpsError("internal", "Failed to export audience");
    }
  }
);

async function formatForMeta(userIds: string[]): Promise<any> {
  // Get user emails/phone numbers for Meta Custom Audience
  const users = await Promise.all(
    userIds.slice(0, 10000).map(id => db.collection("users").doc(id).get())
  );

  return {
    schema: ["EMAIL", "PHONE"],
    data: users
      .filter(doc => doc.exists)
      .map(doc => {
        const data = doc.data()!;
        return {
          email: data.email,
          phone: data.phoneNumber,
        };
      })
      .filter(u => u.email || u.phone),
  };
}

async function formatForTikTok(userIds: string[]): Promise<any> {
  // Similar to Meta
  const users = await Promise.all(
    userIds.slice(0, 10000).map(id => db.collection("users").doc(id).get())
  );

  return {
    audience_type: "CUSTOM",
    users: users
      .filter(doc => doc.exists)
      .map(doc => {
        const data = doc.data()!;
        return {
          email: data.email,
          phone: data.phoneNumber,
        };
      })
      .filter(u => u.email || u.phone),
  };
}

async function formatForGoogle(userIds: string[]): Promise<any> {
  // Format for Google Customer Match
  const users = await Promise.all(
    userIds.slice(0, 10000).map(id => db.collection("users").doc(id).get())
  );

  return {
    members: users
      .filter(doc => doc.exists)
      .map(doc => {
        const data = doc.data()!;
        return {
          hashedEmail: data.email, // Should be hashed with SHA256
          hashedPhoneNumber: data.phoneNumber, // Should be hashed
        };
      })
      .filter(u => u.hashedEmail || u.hashedPhoneNumber),
  };
}

/**
 * Trigger: Add user to appropriate retargeting audience on status change
 */
export const onUserStatusChange = functions.firestore
  .document("users/{userId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const userId = context.params.userId;

    // If user just verified, remove from unverified audience
    if (!before.verified && after.verified) {
      await removeFromAudience(userId, "registered_unverified");
    }

    // Track activity for churn risk
    if (after.lastActiveAt) {
      const lastActive = after.lastActiveAt.toDate();
      const daysSinceActive = Math.floor(
        (Date.now() - lastActive.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceActive >= 14) {
        await addToAudience(userId, "paid_once_inactive");
      }
    }
  });

async function addToAudience(userId: string, audienceId: string): Promise<void> {
  await db.collection("adRetargetingAudiences").doc(audienceId).update({
    userIds: admin.firestore.FieldValue.arrayUnion(userId),
    size: admin.firestore.FieldValue.increment(1),
  });
}

async function removeFromAudience(userId: string, audienceId: string): Promise<void> {
  await db.collection("adRetargetingAudiences").doc(audienceId).update({
    userIds: admin.firestore.FieldValue.arrayRemove(userId),
    size: admin.firestore.FieldValue.increment(-1),
  });
}
