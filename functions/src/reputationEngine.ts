/**
 * Reputation Engine (Phase 37)
 *
 * Manages user reviews, ratings, and trust scoring with anti-bias mechanisms.
 * Integrated with discovery ranking for personalized experiences.
 *
 * Features:
 * - Star ratings (1-5)
 * - Tag-based feedback
 * - Anti-bias weighting
 * - Dynamic trust levels (Bronze → Platinum)
 * - Review verification
 * - Fraud detection
 */

import { HttpsError } from 'firebase-functions/v2/https';
;
import { Timestamp } from 'firebase-admin/firestore';
;
;

const db = getFirestore();

/**
 * Trust level tiers
 */
export enum TrustLevel {
  BRONZE = "bronze",
  SILVER = "silver",
  GOLD = "gold",
  PLATINUM = "platinum",
}

/**
 * Review tags for categorized feedback
 */
export enum ReviewTag {
  FRIENDLY = "friendly",
  PROFESSIONAL = "professional",
  RESPONSIVE = "responsive",
  INTERESTING = "interesting",
  RESPECTFUL = "respectful",
  CREATIVE = "creative",
  RELIABLE = "reliable",
  LATE = "late",
  RUDE = "rude",
  INAPPROPRIATE = "inappropriate",
  SPAM = "spam",
}

/**
 * Review data structure
 */
interface Review {
  reviewId: string;
  reviewerId: string;
  reviewedUserId: string;
  interactionId: string; // chatId or bookingId
  interactionType: "chat" | "meeting" | "call";
  rating: number; // 1-5
  tags: ReviewTag[];
  comment?: string;
  createdAt: Timestamp;
  verifiedInteraction: boolean; // Only allow reviews after verified interaction
  weight: number; // Anti-bias weight (0-1)
  moderationStatus: "pending" | "approved" | "rejected";
}

/**
 * User reputation profile
 */
interface ReputationProfile {
  userId: string;
  trustLevel: TrustLevel;
  averageRating: number;
  totalReviews: number;
  totalPositiveReviews: number;
  totalNegativeReviews: number;
  reviewBreakdown: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
  tagCounts: Record<string, number>;
  trustScore: number; // 0-100
  lastUpdatedAt: Timestamp;
}

/**
 * Submit review after interaction
 */
export const submitReviewV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    // Validate input
    const schema = z.object({
      reviewedUserId: z.string().min(1),
      interactionId: z.string().min(1),
      interactionType: z.enum(["chat", "meeting", "call"]),
      rating: z.number().int().min(1).max(5),
      tags: z.array(z.nativeEnum(ReviewTag)).max(5),
      comment: z.string().max(500).optional(),
    });

    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", validationResult.error.message);
    }

    const { reviewedUserId, interactionId, interactionType, rating, tags, comment } =
      validationResult.data;

    // Prevent self-review
    if (uid === reviewedUserId) {
      throw new HttpsError("invalid-argument", "Cannot review yourself");
    }

    // Check if review already exists for this interaction
    const existingReview = await db
      .collection("reviews")
      .where("reviewerId", "==", uid)
      .where("interactionId", "==", interactionId)
      .limit(1)
      .get();

    if (!existingReview.empty) {
      throw new HttpsError("already-exists", "Review already submitted for this interaction");
    }

    // Verify interaction occurred
    const verified = await verifyInteraction(uid, reviewedUserId, interactionId, interactionType);
    if (!verified) {
      throw new HttpsError("permission-denied", "Cannot review - no verified interaction found");
    }

    // Calculate review weight (anti-bias)
    const weight = await calculateReviewWeight(uid, reviewedUserId);

    // Create review
    const reviewId = `review_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const review: Review = {
      reviewId,
      reviewerId: uid,
      reviewedUserId,
      interactionId,
      interactionType,
      rating,
      tags,
      comment,
      createdAt: Timestamp.now(),
      verifiedInteraction: verified,
      weight,
      moderationStatus: comment ? "pending" : "approved", // Auto-approve if no comment
    };

    await db.collection("reviews").doc(reviewId).set(review);

    // Update reputation profile
    await updateReputationProfile(reviewedUserId);

    logger.info(`Review submitted: ${reviewId} by ${uid} for ${reviewedUserId} (${rating}⭐)`);

    return {
      success: true,
      reviewId,
      trustLevelChanged: false, // Will be calculated async
    };
  }
);

/**
 * Get user reputation profile
 */
export const getReputationProfileV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const schema = z.object({
      userId: z.string().min(1),
    });

    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", validationResult.error.message);
    }

    const { userId } = validationResult.data;

    const profileDoc = await db.collection("reputationProfiles").doc(userId).get();

    if (!profileDoc.exists) {
      // Return default profile
      return {
        userId,
        trustLevel: TrustLevel.BRONZE,
        averageRating: 0,
        totalReviews: 0,
        trustScore: 50, // Neutral
        reviewBreakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        tagCounts: {},
      };
    }

    return profileDoc.data();
  }
);

/**
 * Get user reviews (paginated)
 */
export const getUserReviewsV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const schema = z.object({
      userId: z.string().min(1),
      limit: z.number().int().min(1).max(50).default(20),
      startAfter: z.string().optional(),
    });

    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", validationResult.error.message);
    }

    const { userId, limit, startAfter } = validationResult.data;

    let query = db
      .collection("reviews")
      .where("reviewedUserId", "==", userId)
      .where("moderationStatus", "==", "approved")
      .orderBy("createdAt", "desc")
      .limit(limit);

    if (startAfter) {
      const lastDoc = await db.collection("reviews").doc(startAfter).get();
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();

    const reviews = snapshot.docs.map((doc) => ({
      ...doc.data(),
      reviewId: doc.id,
    }));

    return {
      reviews,
      hasMore: snapshot.size === limit,
    };
  }
);

/**
 * Report review for moderation
 */
export const reportReviewV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const schema = z.object({
      reviewId: z.string().min(1),
      reason: z.enum(["spam", "inappropriate", "fake", "harassment", "other"]),
      description: z.string().max(500).optional(),
    });

    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", validationResult.error.message);
    }

    const { reviewId, reason, description } = validationResult.data;

    // Create report
    await db.collection("reviewReports").add({
      reviewId,
      reporterId: uid,
      reason,
      description,
      createdAt: Timestamp.now(),
      status: "pending",
    });

    // Update review status to pending
    await db.collection("reviews").doc(reviewId).update({
      moderationStatus: "pending",
    });

    logger.info(`Review reported: ${reviewId} by ${uid} (${reason})`);

    return { success: true };
  }
);

/**
 * Verify interaction occurred between users
 */
async function verifyInteraction(
  reviewerId: string,
  reviewedUserId: string,
  interactionId: string,
  interactionType: string
): Promise<boolean> {
  try {
    if (interactionType === "chat") {
      const chatDoc = await db.collection("chats").doc(interactionId).get();
      if (!chatDoc.exists) return false;

      const chatData = chatDoc.data()!;
      const participants = chatData.participants || [];

      // Both users must be participants
      if (!participants.includes(reviewerId) || !participants.includes(reviewedUserId)) {
        return false;
      }

      // At least 3 messages exchanged
      const messageCount = chatData.messageCount || 0;
      return messageCount >= 3;
    }

    if (interactionType === "meeting" || interactionType === "call") {
      const bookingDoc = await db.collection("bookings").doc(interactionId).get();
      if (!bookingDoc.exists) return false;

      const bookingData = bookingDoc.data()!;

      // Booking must be verified/completed
      if (bookingData.status !== "verified") return false;

      // Check participants
      const isParticipant =
        (bookingData.bookerId === reviewerId && bookingData.creatorId === reviewedUserId) ||
        (bookingData.bookerId === reviewedUserId && bookingData.creatorId === reviewerId);

      return isParticipant;
    }

    return false;
  } catch (error) {
    logger.error("Error verifying interaction", { error, reviewerId, reviewedUserId, interactionId });
    return false;
  }
}

/**
 * Calculate review weight for anti-bias
 */
async function calculateReviewWeight(reviewerId: string, reviewedUserId: string): Promise<number> {
  let weight = 1.0;

  // Factor 1: Reviewer's reputation (trusted reviewers get higher weight)
  const reviewerProfile = await db.collection("reputationProfiles").doc(reviewerId).get();
  if (reviewerProfile.exists) {
    const data = reviewerProfile.data()!;
    const reviewerTrustScore = data.trustScore || 50;

    // Weight ranges from 0.5 (low trust) to 1.5 (high trust)
    weight *= 0.5 + (reviewerTrustScore / 100);
  }

  // Factor 2: Review velocity (prevent spam)
  const recentReviews = await db
    .collection("reviews")
    .where("reviewerId", "==", reviewerId)
    .where("createdAt", ">=", Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
    .get();

  if (recentReviews.size > 10) {
    weight *= 0.5; // Penalize spam reviewers
  }

  // Factor 3: Interaction quality (more interactions = higher weight)
  const interactionCount = await db
    .collection("reviews")
    .where("reviewerId", "==", reviewerId)
    .where("reviewedUserId", "==", reviewedUserId)
    .get();

  if (interactionCount.size === 0) {
    weight *= 1.2; // First review from this user carries more weight
  }

  // Clamp weight between 0.3 and 1.5
  return Math.max(0.3, Math.min(1.5, weight));
}

/**
 * Update reputation profile after new review
 */
async function updateReputationProfile(userId: string): Promise<void> {
  try {
    // Get all approved reviews
    const reviewsSnapshot = await db
      .collection("reviews")
      .where("reviewedUserId", "==", userId)
      .where("moderationStatus", "==", "approved")
      .get();

    if (reviewsSnapshot.empty) {
      return; // No reviews yet
    }

    // Calculate weighted average
    let totalWeightedRating = 0;
    let totalWeight = 0;
    const reviewBreakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    const tagCounts: Record<string, number> = {};
    let positiveCount = 0;
    let negativeCount = 0;

    reviewsSnapshot.docs.forEach((doc) => {
      const review = doc.data() as Review;
      const weight = review.weight || 1.0;

      totalWeightedRating += review.rating * weight;
      totalWeight += weight;

      reviewBreakdown[review.rating as keyof typeof reviewBreakdown]++;

      if (review.rating >= 4) positiveCount++;
      if (review.rating <= 2) negativeCount++;

      // Count tags
      review.tags.forEach((tag) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    const averageRating = totalWeight > 0 ? totalWeightedRating / totalWeight : 0;
    const totalReviews = reviewsSnapshot.size;

    // Calculate trust score (0-100)
    let trustScore = 50; // Base

    // Average rating contribution (max +30)
    trustScore += (averageRating - 3) * 10; // Scale from -20 to +20

    // Review volume contribution (max +10)
    trustScore += Math.min(10, totalReviews * 0.5);

    // Positive vs negative ratio (max +10)
    const positiveRatio = totalReviews > 0 ? positiveCount / totalReviews : 0.5;
    trustScore += (positiveRatio - 0.5) * 20;

    // Clamp between 0-100
    trustScore = Math.max(0, Math.min(100, trustScore));

    // Determine trust level
    let trustLevel: TrustLevel;
    if (trustScore >= 80 && totalReviews >= 50) trustLevel = TrustLevel.PLATINUM;
    else if (trustScore >= 70 && totalReviews >= 20) trustLevel = TrustLevel.GOLD;
    else if (trustScore >= 60 && totalReviews >= 10) trustLevel = TrustLevel.SILVER;
    else trustLevel = TrustLevel.BRONZE;

    // Update profile
    const profile: ReputationProfile = {
      userId,
      trustLevel,
      averageRating: Math.round(averageRating * 10) / 10,
      totalReviews,
      totalPositiveReviews: positiveCount,
      totalNegativeReviews: negativeCount,
      reviewBreakdown,
      tagCounts,
      trustScore: Math.round(trustScore),
      lastUpdatedAt: Timestamp.now(),
    };

    await db.collection("reputationProfiles").doc(userId).set(profile, { merge: true });

    logger.info(`Reputation updated: ${userId} → ${trustLevel} (${trustScore} score)`);
  } catch (error) {
    logger.error("Error updating reputation profile", { error, userId });
    throw error;
  }
}

/**
 * Scheduled: Recalculate all reputation scores daily
 */
export const recalculateReputationScoresDaily = onSchedule(
  {
    schedule: "0 2 * * *", // 2 AM daily
    region: "europe-west3",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    logger.info("Starting daily reputation recalculation");

    try {
      // Get all users with reviews
      const usersWithReviews = await db
        .collection("reviews")
        .where("moderationStatus", "==", "approved")
        .get();

      const uniqueUserIds = new Set<string>();
      usersWithReviews.docs.forEach((doc) => {
        uniqueUserIds.add(doc.data().reviewedUserId);
      });

      // Update each user's profile
      let updated = 0;
      for (const userId of uniqueUserIds) {
        await updateReputationProfile(userId);
        updated++;
      }

      logger.info(`Reputation recalculation complete: ${updated} users updated`);
    } catch (error) {
      logger.error("Error in reputation recalculation", { error });
      throw error;
    }
  }
);

/**
 * Get trust level badge info
 */
export function getTrustLevelInfo(level: TrustLevel): {
  color: string;
  icon: string;
  label: string;
  benefits: string[];
} {
  switch (level) {
    case TrustLevel.PLATINUM:
      return {
        color: "#E5E4E2",
        icon: "💎",
        label: "Platinum",
        benefits: [
          "Top discovery ranking",
          "Verified badge",
          "Priority support",
          "Exclusive features",
        ],
      };
    case TrustLevel.GOLD:
      return {
        color: "#FFD700",
        icon: "⭐",
        label: "Gold",
        benefits: ["Boosted discovery", "Verified badge", "Priority moderation"],
      };
    case TrustLevel.SILVER:
      return {
        color: "#C0C0C0",
        icon: "🥈",
        label: "Silver",
        benefits: ["Enhanced visibility", "Faster review approval"],
      };
    case TrustLevel.BRONZE:
      return {
        color: "#CD7F32",
        icon: "🥉",
        label: "Bronze",
        benefits: ["Standard discovery", "Community access"],
      };
  }
}


