/**
 * PACK 53 - Notification Initialization
 * Initialize notifications on app startup
 */

import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  registerPushNotifications,
  configurePushNotifications,
  subscribeToNotificationReceived,
  subscribeToNotificationResponse,
} from "@/services/pushNotificationService";
import * as Notifications from "expo-notifications";

/**
 * Hook to initialize notifications on app startup
 */
export function useNotificationInit() {
  const { currentUser } = useAuth();

  useEffect(() => {
    // Configure notification behavior
    configurePushNotifications();

    // Register for push notifications when user is authenticated
    if (currentUser?.uid) {
      registerPushNotifications(currentUser.uid);
    }

    // Subscribe to notification events
    const receivedSubscription = subscribeToNotificationReceived((notification) => {
      console.log("Notification received:", notification);
    });

    const responseSubscription = subscribeToNotificationResponse((response) => {
      console.log("Notification response:", response);
      
      // Handle notification tap
      const data = response.notification.request.content.data;
      if (data?.deepLink) {
        // Navigation will be handled by the notification center screen
        console.log("Deep link from notification:", data.deepLink);
      }
    });

    // Cleanup subscriptions
    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [currentUser?.uid]);
}
