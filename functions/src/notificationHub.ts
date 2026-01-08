/**
 * PACK 53 - Notification Hub
 * Central notification creation and delivery system
 */

import { getFirestore, Timestamp } from "firebase-admin/firestore";
import {
  NotificationType,
  NotificationDocument,
  NotificationSettings,
  NewNotificationInput,
  PushToken,
} from "./types/notification.types";
import { sendPushNotification } from "./notificationPush";
import { sendEmailNotification } from "./notificationEmail";

const db = getFirestore();

/**
 * Get default notification settings
 */
function getDefaultSettings(): Omit<NotificationSettings, "userId" | "updatedAt"> {
  return {
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
}

/**
 * Check if current time is within quiet hours
 */
function isInQuietHours(settings: NotificationSettings): boolean {
  if (!settings.quietHoursEnabled || !settings.quietHoursStart || !settings.quietHoursEnd) {
    return false;
  }

  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  
  const start = settings.quietHoursStart;
  const end = settings.quietHoursEnd;

  // Handle case where quiet hours span midnight
  if (start <= end) {
    return currentTime >= start && currentTime <= end;
  } else {
    return currentTime >= start || currentTime <= end;
  }
}

/**
 * Get category enabled flag based on notification type
 */
function getCategoryEnabled(settings: NotificationSettings, type: NotificationType): boolean {
  switch (type) {
    case "NEW_MESSAGE":
      return settings.newMessages;
    case "AI_REPLY":
      return settings.aiCompanions;
    case "MEDIA_UNLOCK":
      return settings.mediaUnlocks;
    case "STREAK":
    case "ROYAL_UPDATE":
      return settings.streaksAndRoyal;
    case "EARNINGS":
      return settings.earningsAndPayouts;
    default:
      return true;
  }
}

/**
 * Check if user has blocked the counterparty
 */
async function isBlocked(userId: string, counterpartyId?: string): Promise<boolean> {
  if (!counterpartyId) {
    return false;
  }

  try {
    const blockDoc = await db
      .collection("blocklist")
      .doc(`${userId}_${counterpartyId}`)
      .get();
    
    return blockDoc.exists;
  } catch (error) {
    console.error("Error checking blocklist:", error);
    return false;
  }
}

/**
 * Create a notification
 */
export async function createNotification(input: NewNotificationInput): Promise<void> {
  try {
    // Check if counterparty is blocked
    if (input.context?.counterpartyId) {
      const blocked = await isBlocked(input.userId, input.context.counterpartyId);
      if (blocked) {
        console.log(`Notification blocked: user ${input.userId} has blocked ${input.context.counterpartyId}`);
        return;
      }
    }

    // Get user notification settings
    const settingsDoc = await db
      .collection("notification_settings")
      .doc(input.userId)
      .get();

    const settings: NotificationSettings = settingsDoc.exists
      ? (settingsDoc.data() as NotificationSettings)
      : {
          userId: input.userId,
          ...getDefaultSettings(),
          updatedAt: Timestamp.now(),
        };

    // Check if category is enabled
    const categoryEnabled = getCategoryEnabled(settings, input.type);
    if (!categoryEnabled) {
      console.log(`Notification skipped: category disabled for user ${input.userId}, type ${input.type}`);
      return;
    }

    // Determine channels
    const inQuietHours = isInQuietHours(settings);
    const channels = {
      inApp: settings.inAppEnabled,
      push: settings.pushEnabled && !inQuietHours,
      email: settings.emailEnabled && !inQuietHours,
    };

    // Create notification document
    const notificationId = db.collection("notifications").doc().id;
    const notification: NotificationDocument = {
      notificationId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      context: input.context,
      channels,
      status: "pending",
      read: false,
      createdAt: Timestamp.now(),
    };

    await db.collection("notifications").doc(notificationId).set(notification);

    console.log(`Notification created: ${notificationId} for user ${input.userId}`);
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
}

/**
 * Deliver pending notifications
 */
export async function deliverPendingNotifications(): Promise<void> {
  try {
    const pendingQuery = await db
      .collection("notifications")
      .where("status", "==", "pending")
      .limit(100)
      .get();

    const deliveryPromises = pendingQuery.docs.map(async (doc) => {
      const notification = doc.data() as NotificationDocument;
      
      try {
        // Send push notification if enabled
        if (notification.channels.push) {
          await sendPushNotification(notification);
        }

        // Send email notification if enabled
        if (notification.channels.email) {
          await sendEmailNotification(notification);
        }

        // Mark as sent
        await doc.ref.update({
          status: "sent",
          sentAt: Timestamp.now(),
        });

        console.log(`Notification delivered: ${notification.notificationId}`);
      } catch (error) {
        console.error(`Error delivering notification ${notification.notificationId}:`, error);
        
        // Mark as failed
        await doc.ref.update({
          status: "failed",
        });
      }
    });

    await Promise.all(deliveryPromises);
  } catch (error) {
    console.error("Error delivering pending notifications:", error);
    throw error;
  }
}

/**
 * Mark notification as read
 */
export async function markNotificationRead(notificationId: string): Promise<void> {
  try {
    await db.collection("notifications").doc(notificationId).update({
      read: true,
      readAt: Timestamp.now(),
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    throw error;
  }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  try {
    const unreadQuery = await db
      .collection("notifications")
      .where("userId", "==", userId)
      .where("read", "==", false)
      .get();

    const batch = db.batch();
    unreadQuery.docs.forEach((doc) => {
      batch.update(doc.ref, {
        read: true,
        readAt: Timestamp.now(),
      });
    });

    await batch.commit();
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    throw error;
  }
}