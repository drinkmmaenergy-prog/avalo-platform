/**
 * PACK 53 - Notification API Endpoints
 * HTTP endpoints for notification management
 */

import { onRequest } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { NotificationSettings, PushToken } from "./types/notification.types";
import { markNotificationRead, markAllNotificationsRead } from "./notificationHub";

const db = getFirestore();

/**
 * Register push token
 * POST /notifications/register-push-token
 */
export const registerPushToken = onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { userId, token, platform } = req.body;

    if (!userId || !token || !platform) {
      res.status(400).json({ error: "Missing required fields: userId, token, platform" });
      return;
    }

    if (!["ios", "android", "web"].includes(platform)) {
      res.status(400).json({ error: "Invalid platform. Must be ios, android, or web" });
      return;
    }

    // Create or update token document
    const tokensRef = db.collection(`user_push_tokens/${userId}/tokens`);
    const tokenQuery = await tokensRef.where("token", "==", token).limit(1).get();

    const now = Timestamp.now();
    const tokenData: PushToken = {
      token,
      platform: platform as "ios" | "android" | "web",
      createdAt: now,
      lastUsedAt: now,
    };

    if (tokenQuery.empty) {
      // Create new token
      await tokensRef.add(tokenData);
    } else {
      // Update existing token
      await tokenQuery.docs[0].ref.update({
        lastUsedAt: now,
      });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error registering push token:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Get notification settings
 * GET /notifications/settings?userId=xxx
 */
export const getNotificationSettings = onRequest(async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const userId = req.query.userId as string;

    if (!userId) {
      res.status(400).json({ error: "Missing userId parameter" });
      return;
    }

    const settingsDoc = await db.collection("notification_settings").doc(userId).get();

    if (!settingsDoc.exists) {
      // Return default settings
      const defaultSettings: Omit<NotificationSettings, "updatedAt"> = {
        userId,
        pushEnabled: true,
        emailEnabled: true,
        inAppEnabled: true,
        newMessages: true,
        aiCompanions: true,
        mediaUnlocks: true,
        streaksAndRoyal: true,
        earningsAndPayouts: true,
        quietHoursEnabled: false,
      };
      res.status(200).json(defaultSettings);
      return;
    }

    res.status(200).json(settingsDoc.data());
  } catch (error) {
    console.error("Error getting notification settings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Update notification settings
 * POST /notifications/settings
 */
export const updateNotificationSettings = onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const {
      userId,
      pushEnabled,
      emailEnabled,
      inAppEnabled,
      newMessages,
      aiCompanions,
      mediaUnlocks,
      streaksAndRoyal,
      earningsAndPayouts,
      quietHoursEnabled,
      quietHoursStart,
      quietHoursEnd,
    } = req.body;

    if (!userId) {
      res.status(400).json({ error: "Missing userId" });
      return;
    }

    const settings: NotificationSettings = {
      userId,
      pushEnabled: pushEnabled ?? true,
      emailEnabled: emailEnabled ?? true,
      inAppEnabled: inAppEnabled ?? true,
      newMessages: newMessages ?? true,
      aiCompanions: aiCompanions ?? true,
      mediaUnlocks: mediaUnlocks ?? true,
      streaksAndRoyal: streaksAndRoyal ?? true,
      earningsAndPayouts: earningsAndPayouts ?? true,
      quietHoursEnabled: quietHoursEnabled ?? false,
      quietHoursStart,
      quietHoursEnd,
      updatedAt: Timestamp.now(),
    };

    await db.collection("notification_settings").doc(userId).set(settings, { merge: true });

    res.status(200).json({ success: true, settings });
  } catch (error) {
    console.error("Error updating notification settings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Mark notification as read
 * POST /notifications/mark-read
 */
export const markRead = onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { notificationId } = req.body;

    if (!notificationId) {
      res.status(400).json({ error: "Missing notificationId" });
      return;
    }

    await markNotificationRead(notificationId);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Mark all notifications as read
 * POST /notifications/mark-all-read
 */
export const markAllRead = onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { userId } = req.body;

    if (!userId) {
      res.status(400).json({ error: "Missing userId" });
      return;
    }

    await markAllNotificationsRead(userId);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});