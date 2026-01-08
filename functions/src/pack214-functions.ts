/**
 * PACK 214 - Return Trigger Cloud Functions
 * Event-based triggers, schedulers, and API endpoints
 */

import * as functions from "firebase-functions";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import {
  createReturnTrigger,
  initializeReturnTriggerSettings,
  updateUserActivity,
  setPanicMode,
} from "./pack214-engine";
import {
  processColdStartSequence,
  trackUserBreaks,
  resetBreakTracking,
  batchProcessColdStartSequences,
  batchProcessBreakTracking,
} from "./pack214-schedulers";

const db = getFirestore();

// ============================================
// EVENT-BASED TRIGGERS
// ============================================

/**
 * Trigger when a new high-priority match is created
 */
export const onNewHighPriorityMatch = functions.firestore
  .document("matches/{matchId}")
  .onCreate(async (snap, context) => {
    try {
      const matchData = snap.data();

      if (!matchData.isHighPriority) return;

      // Send trigger to both users
      const users = [matchData.userId, matchData.matchedUserId];

      for (const userId of users) {
        await createReturnTrigger({
          userId,
          eventType: "NEW_HIGH_PRIORITY_MATCH",
          context: {
            matchId: snap.id,
            chemistryScore: matchData.chemistryScore,
            counterpartyId:
              userId === matchData.userId
                ? matchData.matchedUserId
                : matchData.userId,
            deepLink: `match/${snap.id}`,
          },
        });
      }
    } catch (error) {
      console.error("Error in onNewHighPriorityMatch:", error);
    }
  });

/**
 * Trigger when a user receives a new message
 */
export const onNewMessage = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onCreate(async (snap, context) => {
    try {
      const messageData = snap.data();
      const { chatId } = context.params;

      // Get chat document to find recipient
      const chatDoc = await db.collection("chats").doc(chatId).get();
      const chatData = chatDoc.data();

      if (!chatData) return;

      // Determine recipient (not the sender)
      const recipientId =
        chatData.userId1 === messageData.senderId
          ? chatData.userId2
          : chatData.userId1;

      await createReturnTrigger({
        userId: recipientId,
        eventType: "MESSAGE_FROM_MATCH",
        context: {
          counterpartyId: messageData.senderId,
          deepLink: `chat/${chatId}`,
        },
      });
    } catch (error) {
      console.error("Error in onNewMessage:", error);
    }
  });

/**
 * Trigger when a user receives likes
 */
export const onNewLike = functions.firestore
  .document("likes/{likeId}")
  .onCreate(async (snap, context) => {
    try {
      const likeData = snap.data();

      // Count recent likes (last 6 hours)
      const sixHoursAgo = Timestamp.fromMillis(
        Date.now() - 6 * 60 * 60 * 1000
      );

      const recentLikes = await db
        .collection("likes")
        .where("targetUserId", "==", likeData.targetUserId)
        .where("createdAt", ">=", sixHoursAgo)
        .count()
        .get();

      const likeCount = recentLikes.data().count;

      // Only trigger if user has accumulated multiple likes
      if (likeCount >= 3) {
        await createReturnTrigger({
          userId: likeData.targetUserId,
          eventType: "NEW_LIKES",
          context: {
            likeCount,
            deepLink: "likes",
          },
        });
      }
    } catch (error) {
      console.error("Error in onNewLike:", error);
    }
  });

/**
 * Trigger when a user is added to wishlist
 */
export const onWishlistAdd = functions.firestore
  .document("wishlists/{wishlistId}")
  .onCreate(async (snap, context) => {
    try {
      const wishlistData = snap.data();

      await createReturnTrigger({
        userId: wishlistData.targetUserId,
        eventType: "WISHLIST_ADD",
        context: {
          counterpartyId: wishlistData.userId,
          deepLink: "wishlist",
        },
      });
    } catch (error) {
      console.error("Error in onWishlistAdd:", error);
    }
  });

/**
 * Trigger when high-chemistry profile visits user
 */
export const onProfileVisit = functions.firestore
  .document("profile_visits/{visitId}")
  .onCreate(async (snap, context) => {
    try {
      const visitData = snap.data();

      // Check chemistry score
      const chemistryDoc = await db
        .collection("chemistry_scores")
        .where("userId", "==", visitData.targetUserId)
        .where("otherUserId", "==", visitData.visitorId)
        .limit(1)
        .get();

      if (chemistryDoc.empty) return;

      const chemistryScore = chemistryDoc.docs[0].data().score;

      if (chemistryScore >= 80) {
        await createReturnTrigger({
          userId: visitData.targetUserId,
          eventType: "HIGH_CHEMISTRY_PROFILE_VISIT",
          context: {
            counterpartyId: visitData.visitorId,
            chemistryScore,
            deepLink: `profile/${visitData.visitorId}`,
          },
        });
      }
    } catch (error) {
      console.error("Error in onProfileVisit:", error);
    }
  });

/**
 * Trigger when user receives good vibe mark
 */
export const onGoodVibeReceived = functions.firestore
  .document("vibes/{vibeId}")
  .onCreate(async (snap, context) => {
    try {
      const vibeData = snap.data();

      if (vibeData.rating >= 4) {
        // Good vibe (4-5 stars)
        await createReturnTrigger({
          userId: vibeData.targetUserId,
          eventType: "GOOD_VIBE_BOOST",
          context: {
            deepLink: "profile",
          },
        });
      }
    } catch (error) {
      console.error("Error in onGoodVibeReceived:", error);
    }
  });

/**
 * Trigger when discovery boost becomes active
 */
export const onDiscoveryBoostActive = functions.firestore
  .document("discovery_boosts/{boostId}")
  .onCreate(async (snap, context) => {
    try {
      const boostData = snap.data();

      await createReturnTrigger({
        userId: boostData.userId,
        eventType: "DISCOVERY_BOOST_ACTIVE",
        context: {
          boostEndTime: boostData.endsAt,
          deepLink: "discover",
        },
      });
    } catch (error) {
      console.error("Error in onDiscoveryBoostActive:", error);
    }
  });

// ============================================
// USER LIFECYCLE TRIGGERS
// ============================================

/**
 * Initialize return trigger settings on user creation
 */
export const onUserCreated = functions.firestore
  .document("users/{userId}")
  .onCreate(async (snap, context) => {
    try {
      const { userId } = context.params;
      const userData = snap.data();

      await initializeReturnTriggerSettings(
        userId,
        userData.createdAt || Timestamp.now()
      );

      console.log(`Initialized return trigger settings for user ${userId}`);
    } catch (error) {
      console.error("Error in onUserCreated:", error);
    }
  });

/**
 * Update user activity when they open the app
 */
export const onUserActivity = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    try {
      await updateUserActivity(context.auth.uid);
      await resetBreakTracking(context.auth.uid);

      return { success: true };
    } catch (error) {
      console.error("Error in onUserActivity:", error);
      throw new functions.https.HttpsError("internal", "Failed to update activity");
    }
  }
);

// ============================================
// SCHEDULED FUNCTIONS
// ============================================

/**
 * Process cold-start sequences every hour
 */
export const scheduledColdStartProcessor = functions.pubsub
  .schedule("every 1 hours")
  .onRun(async (context) => {
    try {
      await batchProcessColdStartSequences();
      console.log("Cold-start batch processing completed");
    } catch (error) {
      console.error("Error in scheduledColdStartProcessor:", error);
    }
  });

/**
 * Process break tracking every 6 hours
 */
export const scheduledBreakTracker = functions.pubsub
  .schedule("every 6 hours")
  .onRun(async (context) => {
    try {
      await batchProcessBreakTracking();
      console.log("Break tracking batch processing completed");
    } catch (error) {
      console.error("Error in scheduledBreakTracker:", error);
    }
  });

/**
 * Clean up old trigger stats weekly
 */
export const scheduledStatsCleanup = functions.pubsub
  .schedule("every sunday 00:00")
  .timeZone("UTC")
  .onRun(async (context) => {
    try {
      const thirtyDaysAgo = Timestamp.fromMillis(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      );

      // Reset 30-day counters
      const statsQuery = await db
        .collection("return_trigger_stats")
        .where("updatedAt", "<=", thirtyDaysAgo)
        .limit(500)
        .get();

      const batch = db.batch();
      statsQuery.docs.forEach((doc) => {
        batch.update(doc.ref, {
          triggersBy30Days: 0,
          triggersBy7Days: 0,
          updatedAt: Timestamp.now(),
        });
      });

      await batch.commit();

      console.log(`Cleaned up stats for ${statsQuery.size} users`);
    } catch (error) {
      console.error("Error in scheduledStatsCleanup:", error);
    }
  });

// ============================================
// API ENDPOINTS
// ============================================

/**
 * Manually trigger a return event (for testing/admin)
 */
export const triggerReturnEvent = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const { userId, eventType, context: eventContext, forceDelivery } = data;

    try {
      const result = await createReturnTrigger({
        userId: userId || context.auth.uid,
        eventType,
        context: eventContext,
        forceDelivery: forceDelivery || false,
      });

      return result;
    } catch (error) {
      console.error("Error in triggerReturnEvent:", error);
      throw new functions.https.HttpsError("internal", "Failed to create trigger");
    }
  }
);

/**
 * Set panic mode for user
 */
export const setUserPanicMode = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const { enabled, cooldownHours } = data;

    try {
      await setPanicMode(context.auth.uid, enabled, cooldownHours);

      return { success: true };
    } catch (error) {
      console.error("Error in setUserPanicMode:", error);
      throw new functions.https.HttpsError("internal", "Failed to set panic mode");
    }
  }
);

/**
 * Get user's return trigger stats
 */
export const getReturnTriggerStats = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    try {
      const statsDoc = await db
        .collection("return_trigger_stats")
        .doc(context.auth.uid)
        .get();

      if (!statsDoc.exists) {
        return {
          totalTriggersSent: 0,
          triggersBy7Days: 0,
          triggersBy30Days: 0,
        };
      }

      return statsDoc.data();
    } catch (error) {
      console.error("Error in getReturnTriggerStats:", error);
      throw new functions.https.HttpsError("internal", "Failed to get stats");
    }
  }
);

/**
 * Update user return trigger settings
 */
export const updateReturnTriggerSettings = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const { enabled, doNotDisturb } = data;

    try {
      const updates: any = {
        updatedAt: Timestamp.now(),
      };

      if (typeof enabled === "boolean") {
        updates.enabled = enabled;
      }

      if (typeof doNotDisturb === "boolean") {
        updates.doNotDisturb = doNotDisturb;
      }

      await db
        .collection("return_trigger_settings")
        .doc(context.auth.uid)
        .update(updates);

      return { success: true };
    } catch (error) {
      console.error("Error in updateReturnTriggerSettings:", error);
      throw new functions.https.HttpsError("internal", "Failed to update settings");
    }
  }
);

/**
 * Process single user cold-start (for testing)
 */
export const processSingleUserColdStart = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    try {
      const settingsDoc = await db
        .collection("return_trigger_settings")
        .doc(context.auth.uid)
        .get();

      if (!settingsDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Settings not found");
      }

      const settings = settingsDoc.data();

      await processColdStartSequence(
        context.auth.uid,
        settings?.accountCreatedAt || Timestamp.now()
      );

      return { success: true };
    } catch (error) {
      console.error("Error in processSingleUserColdStart:", error);
      throw new functions.https.HttpsError("internal", "Failed to process cold-start");
    }
  }
);