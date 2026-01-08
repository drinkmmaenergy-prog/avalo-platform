/**
 * PACK 53 - Push Notification Delivery
 * Handles sending push notifications via Expo/FCM/APNS
 */

import { getFirestore } from "firebase-admin/firestore";
import { NotificationDocument, PushToken } from "./types/notification.types";
import fetch from "node-fetch";

const db = getFirestore();

/**
 * Send push notification to user's devices
 */
export async function sendPushNotification(notification: NotificationDocument): Promise<void> {
  try {
    // Get user's push tokens
    const tokensSnapshot = await db
      .collection(`user_push_tokens/${notification.userId}/tokens`)
      .get();

    if (tokensSnapshot.empty) {
      console.log(`No push tokens found for user ${notification.userId}`);
      return;
    }

    const tokens = tokensSnapshot.docs.map((doc) => doc.data() as PushToken);

    // Send to each token
    const sendPromises = tokens.map(async (tokenData) => {
      try {
        await sendExpoPushNotification(tokenData.token, notification);
      } catch (error: any) {
        console.error(`Error sending push to token ${tokenData.token}:`, error);
        
        // If token is invalid, remove it
        if (error.code === "DeviceNotRegistered" || error.code === "InvalidCredentials") {
          const tokenDoc = tokensSnapshot.docs.find(
            (doc) => (doc.data() as PushToken).token === tokenData.token
          );
          if (tokenDoc) {
            await tokenDoc.ref.delete();
            console.log(`Removed invalid push token: ${tokenData.token}`);
          }
        }
      }
    });

    await Promise.all(sendPromises);
  } catch (error) {
    console.error("Error in sendPushNotification:", error);
    throw error;
  }
}

/**
 * Send push notification via Expo Push API
 */
async function sendExpoPushNotification(
  token: string,
  notification: NotificationDocument
): Promise<void> {
  const message = {
    to: token,
    sound: "default",
    title: notification.title,
    body: notification.body,
    data: {
      notificationId: notification.notificationId,
      type: notification.type,
      context: notification.context,
    },
    priority: "high" as const,
    channelId: "default",
  };

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Expo Push API error: ${JSON.stringify(errorData)}`);
  }

  const result = await response.json();
  
  // Check for specific error codes
  if (result.data && result.data[0] && result.data[0].status === "error") {
    const error: any = new Error(result.data[0].message);
    error.code = result.data[0].details?.error;
    throw error;
  }
}