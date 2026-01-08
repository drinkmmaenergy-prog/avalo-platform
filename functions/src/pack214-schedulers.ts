/**
 * PACK 214 - Return Trigger Schedulers
 * Cold-start activation and break/return sequences
 */

import { getFirestore, Timestamp } from "firebase-admin/firestore";
import {
  ReturnTriggerEventType,
  ColdStartEntry,
  UserBreakTracking,
} from "./pack214-types";
import { createReturnTrigger } from "./pack214-engine";

const db = getFirestore();

/**
 * Cold-start activation timeline (Day 0-7)
 */
const COLD_START_TIMELINE: ColdStartEntry[] = [
  {
    day: 0,
    eventType: "COLD_START_DAY_1",
    enabled: true,
    delayHours: 24, // Day 1 after signup
    requiresTruthCheck: true,
  },
  {
    day: 1,
    eventType: "COLD_START_DAY_2",
    enabled: true,
    delayHours: 48,
    requiresTruthCheck: false, // Discovery boost is always available
  },
  {
    day: 2,
    eventType: "COLD_START_DAY_3",
    enabled: true,
    delayHours: 72,
    requiresTruthCheck: true,
  },
  {
    day: 3,
    eventType: "COLD_START_DAY_4",
    enabled: true,
    delayHours: 96,
    requiresTruthCheck: true,
  },
  {
    day: 4,
    eventType: "COLD_START_DAY_5",
    enabled: true,
    delayHours: 120,
    requiresTruthCheck: false, // Accelerator is automatic
  },
  {
    day: 5,
    eventType: "COLD_START_DAY_6",
    enabled: true,
    delayHours: 144,
    requiresTruthCheck: true, // Only if someone with their type is online
  },
  {
    day: 6,
    eventType: "COLD_START_DAY_7",
    enabled: true,
    delayHours: 168,
    requiresTruthCheck: false, // Challenge is always available
  },
];

/**
 * Process cold-start sequence for a user
 */
export async function processColdStartSequence(
  userId: string,
  accountCreatedAt: Timestamp
): Promise<void> {
  try {
    const now = Date.now();
    const createdTime = accountCreatedAt.toMillis();
    const hoursSinceCreation = (now - createdTime) / (1000 * 60 * 60);

    for (const entry of COLD_START_TIMELINE) {
      if (!entry.enabled) continue;

      // Check if it's time for this trigger
      const isTime =
        hoursSinceCreation >= entry.delayHours &&
        hoursSinceCreation < entry.delayHours + 24; // 24h window

      if (!isTime) continue;

      // Check if already sent
      const alreadySent = await checkColdStartSent(userId, entry.eventType);
      if (alreadySent) continue;

      // Perform truth check if required
      if (entry.requiresTruthCheck) {
        const truthCheckPassed = await performColdStartTruthCheck(
          userId,
          entry
        );
        if (!truthCheckPassed) {
          console.log(
            `Cold-start truth check failed for ${userId}: ${entry.eventType}`
          );
          continue;
        }
      }

      // Create the trigger
      const result = await createReturnTrigger({
        userId,
        eventType: entry.eventType,
        context: {
          deepLink: `onboarding/day-${entry.day}`,
        },
      });

      if (result.sent) {
        // Mark as sent
        await markColdStartSent(userId, entry.eventType);
        console.log(
          `Cold-start trigger sent to ${userId}: ${entry.eventType}`
        );
      }
    }
  } catch (error) {
    console.error("Error processing cold-start sequence:", error);
  }
}

/**
 * Check if cold-start trigger was already sent
 */
async function checkColdStartSent(
  userId: string,
  eventType: ReturnTriggerEventType
): Promise<boolean> {
  const doc = await db
    .collection("cold_start_tracking")
    .doc(`${userId}_${eventType}`)
    .get();

  return doc.exists;
}

/**
 * Mark cold-start trigger as sent
 */
async function markColdStartSent(
  userId: string,
  eventType: ReturnTriggerEventType
): Promise<void> {
  await db
    .collection("cold_start_tracking")
    .doc(`${userId}_${eventType}`)
    .set({
      userId,
      eventType,
      sentAt: Timestamp.now(),
    });
}

/**
 * Perform truth check for cold-start triggers
 * Ensures we only send triggers backed by real data
 */
async function performColdStartTruthCheck(
  userId: string,
  entry: ColdStartEntry
): Promise<boolean> {
  try {
    switch (entry.eventType) {
      case "COLD_START_DAY_1": {
        // Check if user actually has wishlist adds
        const wishlistCount = await db
          .collection("wishlists")
          .where("targetUserId", "==", userId)
          .count()
          .get();
        return wishlistCount.data().count >= 7;
      }

      case "COLD_START_DAY_3": {
        // Check if there are high-compatibility profiles
        const compatibleProfiles = await db
          .collection("chemistry_scores")
          .where("userId", "==", userId)
          .where("score", ">=", 80)
          .limit(1)
          .get();
        return !compatibleProfiles.empty;
      }

      case "COLD_START_DAY_4": {
        // Check if user has any chemistry-based matches
        const matches = await db
          .collection("matches")
          .where("userId", "==", userId)
          .where("chemistryBased", "==", true)
          .limit(1)
          .get();
        return !matches.empty;
      }

      case "COLD_START_DAY_6": {
        // Check if someone with their type is online now
        const userDoc = await db.collection("users").doc(userId).get();
        const userData = userDoc.data();
        const userPreferences = userData?.preferences || {};

        const onlineMatches = await db
          .collection("users")
          .where("isOnline", "==", true)
          .where("gender", "==", userPreferences.lookingFor)
          .limit(1)
          .get();

        return !onlineMatches.empty;
      }

      default:
        return true; // No truth check needed
    }
  } catch (error) {
    console.error("Error in cold-start truth check:", error);
    return false;
  }
}

/**
 * Track user breaks and send return triggers
 */
export async function trackUserBreaks(userId: string): Promise<void> {
  try {
    // Get user's last active timestamp
    const settingsDoc = await db
      .collection("return_trigger_settings")
      .doc(userId)
      .get();

    if (!settingsDoc.exists) return;

    const settings = settingsDoc.data();
    const lastActiveAt = settings?.lastActiveAt as Timestamp;

    if (!lastActiveAt) return;

    const now = Date.now();
    const lastActiveTime = lastActiveAt.toMillis();
    const daysSinceActive = (now - lastActiveTime) / (1000 * 60 * 60 * 24);

    // Get or create break tracking
    let tracking = await getBreakTracking(userId);

    if (!tracking) {
      tracking = {
        userId,
        lastActiveAt,
        breakStartedAt: lastActiveAt,
        breakDays: Math.floor(daysSinceActive),
        breakNotificationsSent: {
          day7: false,
          day14: false,
          day30: false,
          day60Plus: false,
        },
        updatedAt: Timestamp.now(),
      };
    } else {
      tracking.breakDays = Math.floor(daysSinceActive);
      tracking.updatedAt = Timestamp.now();
    }

    // Send appropriate break return trigger
    let triggerSent = false;

    if (daysSinceActive >= 60 && !tracking.breakNotificationsSent.day60Plus) {
      const result = await createReturnTrigger({
        userId,
        eventType: "BREAK_RETURN_60DAY",
        context: {
          deepLink: "comeback-reward",
        },
      });

      if (result.sent) {
        tracking.breakNotificationsSent.day60Plus = true;
        triggerSent = true;
      }
    } else if (
      daysSinceActive >= 30 &&
      !tracking.breakNotificationsSent.day30
    ) {
      const result = await createReturnTrigger({
        userId,
        eventType: "BREAK_RETURN_30DAY",
        context: {
          deepLink: "profile-boost",
        },
      });

      if (result.sent) {
        tracking.breakNotificationsSent.day30 = true;
        triggerSent = true;
      }
    } else if (
      daysSinceActive >= 14 &&
      !tracking.breakNotificationsSent.day14
    ) {
      // For 14-day, check if there's actually a high-chemistry match
      const hasHighChemistryMatch = await checkForHighChemistryMatch(userId);

      if (hasHighChemistryMatch) {
        const result = await createReturnTrigger({
          userId,
          eventType: "BREAK_RETURN_14DAY",
          context: {
            deepLink: "high-chemistry-match",
          },
        });

        if (result.sent) {
          tracking.breakNotificationsSent.day14 = true;
          triggerSent = true;
        }
      }
    } else if (daysSinceActive >= 7 && !tracking.breakNotificationsSent.day7) {
      const result = await createReturnTrigger({
        userId,
        eventType: "BREAK_RETURN_7DAY",
        context: {
          deepLink: "recent-activity",
        },
      });

      if (result.sent) {
        tracking.breakNotificationsSent.day7 = true;
        triggerSent = true;
      }
    }

    // Save updated tracking
    if (triggerSent) {
      await saveBreakTracking(tracking);
    }
  } catch (error) {
    console.error("Error tracking user breaks:", error);
  }
}

/**
 * Get break tracking for user
 */
async function getBreakTracking(
  userId: string
): Promise<UserBreakTracking | null> {
  const doc = await db.collection("user_break_tracking").doc(userId).get();

  if (!doc.exists) return null;

  return doc.data() as UserBreakTracking;
}

/**
 * Save break tracking
 */
async function saveBreakTracking(tracking: UserBreakTracking): Promise<void> {
  await db
    .collection("user_break_tracking")
    .doc(tracking.userId)
    .set(tracking);
}

/**
 * Check for high chemistry match (for 14-day return trigger)
 */
async function checkForHighChemistryMatch(userId: string): Promise<boolean> {
  try {
    // Get user's last active date
    const settingsDoc = await db
      .collection("return_trigger_settings")
      .doc(userId)
      .get();

    const lastActiveAt = settingsDoc.data()?.lastActiveAt as Timestamp;

    // Check for new high-chemistry profiles since last active
    const newProfiles = await db
      .collection("chemistry_scores")
      .where("userId", "==", userId)
      .where("score", ">=", 85)
      .where("createdAt", ">", lastActiveAt)
      .limit(1)
      .get();

    return !newProfiles.empty;
  } catch (error) {
    console.error("Error checking for high chemistry match:", error);
    return false;
  }
}

/**
 * Reset break tracking when user becomes active
 */
export async function resetBreakTracking(userId: string): Promise<void> {
  const tracking = await getBreakTracking(userId);

  if (tracking) {
    tracking.breakDays = 0;
    tracking.breakNotificationsSent = {
      day7: false,
      day14: false,
      day30: false,
      day60Plus: false,
    };
    tracking.lastActiveAt = Timestamp.now();
    tracking.breakStartedAt = undefined;
    tracking.updatedAt = Timestamp.now();

    await saveBreakTracking(tracking);
  }
}

/**
 * Batch process cold-start sequences for all new users
 */
export async function batchProcessColdStartSequences(): Promise<void> {
  try {
    // Get users created in last 7 days who haven't completed cold-start
    const sevenDaysAgo = Timestamp.fromMillis(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    );

    const newUsersQuery = await db
      .collection("return_trigger_settings")
      .where("accountCreatedAt", ">=", sevenDaysAgo)
      .limit(100)
      .get();

    const processPromises = newUsersQuery.docs.map((doc) => {
      const data = doc.data();
      return processColdStartSequence(data.userId, data.accountCreatedAt);
    });

    await Promise.all(processPromises);

    console.log(
      `Processed cold-start sequences for ${newUsersQuery.size} users`
    );
  } catch (error) {
    console.error("Error batch processing cold-start sequences:", error);
  }
}

/**
 * Batch process break tracking for all users
 */
export async function batchProcessBreakTracking(): Promise<void> {
  try {
    // Get users inactive for 7+ days
    const sevenDaysAgo = Timestamp.fromMillis(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    );

    const inactiveUsersQuery = await db
      .collection("return_trigger_settings")
      .where("lastActiveAt", "<=", sevenDaysAgo)
      .where("enabled", "==", true)
      .limit(100)
      .get();

    const processPromises = inactiveUsersQuery.docs.map((doc) => {
      return trackUserBreaks(doc.data().userId);
    });

    await Promise.all(processPromises);

    console.log(
      `Processed break tracking for ${inactiveUsersQuery.size} users`
    );
  } catch (error) {
    console.error("Error batch processing break tracking:", error);
  }
}