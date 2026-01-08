/**
 * Insight & Personalization Engine - Phase 16
 *
 * User behavior analysis and personalized recommendations:
 * - Activity tracking (messages, visits, likes)
 * - Interest profiling
 * - Profile recommendations
 * - AI companion recommendations
 */

import * as functions from "firebase-functions/v2";
import { HttpsError } from 'firebase-functions/v2/https';
;
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
;

const db = getFirestore();

/**
 * User insight document
 */
export interface UserInsight {
  userId: string;

  // Activity patterns
  totalMessages: number;
  totalVisits: number;
  totalLikes: number;
  lastActiveAt: Timestamp | FieldValue;

  // Top interests (derived from bio, chats, etc.)
  topInterests: string[];

  // Activity patterns (hourly heat map)
  activityHours: number[]; // 0-23, count of activities per hour

  // Response rates
  messageResponseRate: number; // 0-1
  averageResponseTimeMinutes: number;

  // Preferences (derived)
  preferredAgeRange: { min: number; max: number };
  preferredDistance: number; // km
  preferredLanguages: string[];

  // AI chat preferences
  aiPreferences: {
    favoriteAIIds: string[];
    preferredAICategories: string[];
    totalAIMessages: number;
  };

  // Quality metrics
  profileViewsReceived: number;
  matchRate: number; // successful matches / swipes

  updatedAt: Timestamp | FieldValue;
  createdAt: Timestamp | FieldValue;
}

/**
 * Update user insight trigger - Messages
 */
export const updateUserInsightOnMessageTrigger = onDocumentCreated(
  {
    document: "chats/{chatId}/messages/{messageId}",
    region: "europe-west3",
  },
  async (event) => {
    const messageData = event.data?.data();
    if (!messageData) return;

    const senderId = messageData.senderId;

    try {
      await updateUserInsight(senderId, "message_sent");
      console.log(`Insight updated for user ${senderId} (message sent)`);
    } catch (error) {
      console.error(`Error updating insight for ${senderId}:`, error);
    }
  }
);

/**
 * Update user insight trigger - Profile visits
 */
export const updateUserInsightOnVisitTrigger = onDocumentCreated(
  {
    document: "users/{userId}/visitors/{visitorId}",
    region: "europe-west3",
  },
  async (event) => {
    const visitorId = event.params.visitorId;

    try {
      await updateUserInsight(visitorId, "profile_visit");
      console.log(`Insight updated for user ${visitorId} (profile visit)`);
    } catch (error) {
      console.error(`Error updating insight for ${visitorId}:`, error);
    }
  }
);

/**
 * Update user insight trigger - Swipes/Likes
 */
export const updateUserInsightOnSwipeTrigger = onDocumentCreated(
  {
    document: "users/{userId}/swipes/{swipeId}",
    region: "europe-west3",
  },
  async (event) => {
    const swipeData = event.data?.data();
    if (!swipeData) return;

    const userId = event.params.userId;
    const isLike = swipeData.type === "like";

    try {
      await updateUserInsight(userId, isLike ? "like" : "pass");
      console.log(`Insight updated for user ${userId} (swipe)`);
    } catch (error) {
      console.error(`Error updating insight for ${userId}:`, error);
    }
  }
);

/**
 * Update user insight
 */
async function updateUserInsight(userId: string, eventType: string): Promise<void> {
  const insightRef = db.collection("userInsights").doc(userId);

  await db.runTransaction(async (tx) => {
    const insightDoc = await tx.get(insightRef);
    const insight = insightDoc.data() as UserInsight | undefined;

    const currentHour = new Date().getHours();
    const activityHours = insight?.activityHours || new Array(24).fill(0);
    activityHours[currentHour]++;

    const updates: any = {
      userId,
      lastActiveAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      activityHours,
    };

    if (!insightDoc.exists) {
      updates.createdAt = FieldValue.serverTimestamp();
      updates.totalMessages = 0;
      updates.totalVisits = 0;
      updates.totalLikes = 0;
      updates.topInterests = [];
      updates.messageResponseRate = 0;
      updates.averageResponseTimeMinutes = 0;
      updates.preferredAgeRange = { min: 18, max: 99 };
      updates.preferredDistance = 50;
      updates.preferredLanguages = ["en"];
      updates.aiPreferences = {
        favoriteAIIds: [],
        preferredAICategories: [],
        totalAIMessages: 0,
      };
      updates.profileViewsReceived = 0;
      updates.matchRate = 0;
    }

    // Increment based on event type
    if (eventType === "message_sent") {
      updates.totalMessages = FieldValue.increment(1);
    } else if (eventType === "profile_visit") {
      updates.totalVisits = FieldValue.increment(1);
    } else if (eventType === "like") {
      updates.totalLikes = FieldValue.increment(1);
    }

    tx.set(insightRef, updates, { merge: true });
  });

  // Log to engine logs
  await logEngineEvent("insightEngine", "insight_updated", {
    userId,
    eventType,
  });
}

/**
 * Recommend profiles callable
 */
const RecommendProfilesSchema = z.object({
  maxDistance: z.number().min(1).max(1000).optional().default(50),
  ageRange: z.object({
    min: z.number().min(18).max(99),
    max: z.number().min(18).max(99),
  }).optional(),
  limit: z.number().min(1).max(50).optional().default(20),
});

export const recommendProfilesCallable = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    // Validate input
    const validationResult = RecommendProfilesSchema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", validationResult.error.message);
    }

    const { maxDistance, ageRange, limit } = validationResult.data;

    try {
      // Get user data
      const userDoc = await db.collection("users").doc(uid).get();
      if (!userDoc.exists) {
        throw new HttpsError("not-found", "User not found");
      }

      const userData = userDoc.data();
      const userLocation = userData?.location;
      const userGender = userData?.gender;
      const userSeeking = userData?.seeking || "any";

      // Get user insight for personalization
      const insightDoc = await db.collection("userInsights").doc(uid).get();
      const insight = insightDoc.data() as UserInsight | undefined;

      // Query potential matches
      let query = db.collection("users")
        .where("banned", "!=", true)
        .limit(limit * 2); // Query more to filter out

      // Filter by seeking preference
      if (userSeeking !== "any") {
        query = query.where("gender", "==", userSeeking);
      }

      // Filter by age range
      if (ageRange) {
        const currentYear = new Date().getFullYear();
        const maxBirthYear = currentYear - ageRange.min;
        const minBirthYear = currentYear - ageRange.max;

        // Note: This requires a birthYear field
        query = query
          .where("birthYear", "<=", maxBirthYear)
          .where("birthYear", ">=", minBirthYear);
      }

      const candidatesSnapshot = await query.get();

      // Score and rank candidates
      const scoredProfiles = candidatesSnapshot.docs
        .filter((doc) => doc.id !== uid) // Exclude self
        .map((doc) => {
          const profile = doc.data();
          let score = 0;

          // Distance scoring (if location available)
          if (userLocation && profile.location && maxDistance) {
            const distance = calculateDistance(
              userLocation.latitude,
              userLocation.longitude,
              profile.location.latitude,
              profile.location.longitude
            );

            if (distance <= maxDistance) {
              score += (1 - distance / maxDistance) * 30; // Max 30 points
            } else {
              return null; // Exclude if outside range
            }
          } else {
            score += 10; // Partial score if no location data
          }

          // Activity score
          if (profile.lastActiveAt) {
            const hoursSinceActive = (Date.now() - profile.lastActiveAt.toMillis()) / (60 * 60 * 1000);
            if (hoursSinceActive < 24) {
              score += 20;
            } else if (hoursSinceActive < 168) {
              score += 10;
            }
          }

          // Quality score
          const photoCount = profile.photos?.length || 0;
          score += Math.min(photoCount * 5, 20);

          if (profile.verification?.status === "approved") {
            score += 15;
          }

          if (profile.bio && profile.bio.length > 50) {
            score += 10;
          }

          // Interest matching (if available)
          if (insight?.topInterests && profile.interests) {
            const commonInterests = insight.topInterests.filter((interest: string) =>
              profile.interests.includes(interest)
            );
            score += commonInterests.length * 5;
          }

          return {
            userId: doc.id,
            profile: {
              name: profile.name,
              age: profile.age,
              photos: profile.photos,
              bio: profile.bio,
              location: profile.location,
              verification: profile.verification,
            },
            score,
          };
        })
        .filter((item) => item !== null)
        .sort((a, b) => b!.score - a!.score)
        .slice(0, limit);

      // Log to engine logs
      await logEngineEvent("insightEngine", "profiles_recommended", {
        userId: uid,
        count: scoredProfiles.length,
      });

      return {
        success: true,
        recommendations: scoredProfiles,
      };
    } catch (error: any) {
      console.error("Error recommending profiles:", error);
      throw new HttpsError("internal", `Failed to recommend profiles: ${error.message}`);
    }
  }
);

/**
 * Recommend AI companions callable
 */
const RecommendAISchema = z.object({
  limit: z.number().min(1).max(20).optional().default(10),
});

export const recommendAICompanionsCallable = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    // Validate input
    const validationResult = RecommendAISchema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", validationResult.error.message);
    }

    const { limit } = validationResult.data;

    try {
      // Get user data
      const userDoc = await db.collection("users").doc(uid).get();
      if (!userDoc.exists) {
        throw new HttpsError("not-found", "User not found");
      }

      const userData = userDoc.data();
      const userTier = userData?.aiSubscription?.tier || "free";

      // Get user insight
      const insightDoc = await db.collection("userInsights").doc(uid).get();
      const insight = insightDoc.data() as UserInsight | undefined;

      // Query AI companions
      const aiSnapshot = await db
        .collection("aiBots")
        .where("isActive", "==", true)
        .limit(50)
        .get();

      // Score and rank AIs
      const scoredAIs = aiSnapshot.docs
        .map((doc) => {
          const ai = doc.data();
          let score = 0;

          // Tier compatibility
          if (ai.tier === "free" || userTier !== "free") {
            score += 20;
          } else {
            return null; // Exclude if tier not accessible
          }

          // Previous chat history bonus
          if (insight?.aiPreferences.favoriteAIIds.includes(doc.id)) {
            score += 30;
          }

          // Category matching
          if (insight?.aiPreferences.preferredAICategories.includes(ai.category)) {
            score += 20;
          }

          // Popularity
          const popularity = ai.totalChats || 0;
          score += Math.min(popularity / 10, 15);

          // Rating
          const rating = ai.averageRating || 0;
          score += rating * 3;

          return {
            aiId: doc.id,
            ai: {
              name: ai.name,
              avatar: ai.avatar,
              description: ai.description,
              category: ai.category,
              tier: ai.tier,
              totalChats: ai.totalChats,
              averageRating: ai.averageRating,
            },
            score,
          };
        })
        .filter((item) => item !== null)
        .sort((a, b) => b!.score - a!.score)
        .slice(0, limit);

      // Log to engine logs
      await logEngineEvent("insightEngine", "ai_recommended", {
        userId: uid,
        count: scoredAIs.length,
      });

      return {
        success: true,
        recommendations: scoredAIs,
      };
    } catch (error: any) {
      console.error("Error recommending AI companions:", error);
      throw new HttpsError("internal", `Failed to recommend AI companions: ${error.message}`);
    }
  }
);

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Helper: Log engine event
 */
async function logEngineEvent(
  engine: string,
  action: string,
  metadata: Record<string, any>
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  const logRef = db
    .collection("engineLogs")
    .doc(engine)
    .collection(today)
    .doc();

  await logRef.set({
    action,
    metadata,
    timestamp: FieldValue.serverTimestamp(),
  });
}


