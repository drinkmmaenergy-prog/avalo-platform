/**
 * PACK 53 - Notification Scheduled Functions
 * Scheduled tasks for notification delivery
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { deliverPendingNotifications } from "./notificationHub";

/**
 * Scheduled function to deliver pending notifications
 * Runs every minute to process pending notifications
 */
export const deliverNotifications = onSchedule(
  {
    schedule: "every 1 minutes",
    timeZone: "UTC",
  },
  async (event) => {
    try {
      console.log("Starting notification delivery job");
      await deliverPendingNotifications();
      console.log("Notification delivery job completed");
    } catch (error) {
      console.error("Error in notification delivery job:", error);
      throw error;
    }
  }
);