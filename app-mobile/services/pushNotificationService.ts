/**
 * PACK 53 - Push Notification Registration Service
 * Handles push token registration with backend
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "https://us-central1-avalo-app.cloudfunctions.net";
const PUSH_TOKEN_KEY = "push_token_v1";

/**
 * Request push notification permissions and register token
 */
export async function registerPushNotifications(userId: string): Promise<void> {
  try {
    // Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("Push notification permission not granted");
      return;
    }

    // Get push token
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    // Check if token has changed
    const cachedToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (cachedToken === token) {
      console.log("Push token unchanged, skipping registration");
      return;
    }

    // Register token with backend
    const platform = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";

    const response = await fetch(`${API_BASE_URL}/registerPushToken`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId,
        token,
        platform,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to register push token: ${response.status}`);
    }

    // Cache token
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);

    console.log("Push token registered successfully:", token);
  } catch (error) {
    console.error("Error registering push notifications:", error);
    // Don't throw - push notification registration failure shouldn't break the app
  }
}

/**
 * Configure notification behavior
 */
export function configurePushNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/**
 * Handle notification received while app is in foreground
 */
export function subscribeToNotificationReceived(
  handler: (notification: Notifications.Notification) => void
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(handler);
}

/**
 * Handle notification tapped/opened
 */
export function subscribeToNotificationResponse(
  handler: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(handler);
}

/**
 * Clear all notifications
 */
export async function clearAllNotifications(): Promise<void> {
  try {
    await Notifications.dismissAllNotificationsAsync();
  } catch (error) {
    console.error("Error clearing notifications:", error);
  }
}

/**
 * Get notification badge count
 */
export async function getBadgeCount(): Promise<number> {
  try {
    return await Notifications.getBadgeCountAsync();
  } catch (error) {
    console.error("Error getting badge count:", error);
    return 0;
  }
}

/**
 * Set notification badge count
 */
export async function setBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch (error) {
    console.error("Error setting badge count:", error);
  }
}