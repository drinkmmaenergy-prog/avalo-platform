"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.recalculateReputationScoresDaily = exports.reportReviewV1 = exports.getUserReviewsV1 = exports.getReputationProfileV1 = exports.submitReviewV1 = exports.ReviewTag = exports.TrustLevel = void 0;
exports.getTrustLevelInfo = getTrustLevelInfo;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const v2_1 = require("firebase-functions/v2");
const zod_1 = require("zod");
const db = (0, firestore_1.getFirestore)();
/**
 * Trust level tiers
 */
var TrustLevel;
(function (TrustLevel) {
    TrustLevel["BRONZE"] = "bronze";
    TrustLevel["SILVER"] = "silver";
    TrustLevel["GOLD"] = "gold";
    TrustLevel["PLATINUM"] = "platinum";
})(TrustLevel || (exports.TrustLevel = TrustLevel = {}));
/**
 * Review tags for categorized feedback
 */
var ReviewTag;
(function (ReviewTag) {
    ReviewTag["FRIENDLY"] = "friendly";
    ReviewTag["PROFESSIONAL"] = "professional";
    ReviewTag["RESPONSIVE"] = "responsive";
    ReviewTag["INTERESTING"] = "interesting";
    ReviewTag["RESPECTFUL"] = "respectful";
    ReviewTag["CREATIVE"] = "creative";
    ReviewTag["RELIABLE"] = "reliable";
    ReviewTag["LATE"] = "late";
    ReviewTag["RUDE"] = "rude";
    ReviewTag["INAPPROPRIATE"] = "inappropriate";
    ReviewTag["SPAM"] = "spam";
})(ReviewTag || (exports.ReviewTag = ReviewTag = {}));
/**
 * Submit review after interaction
 */
exports.submitReviewV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Validate input
    const schema = zod_1.z.object({
        reviewedUserId: zod_1.z.string().min(1),
        interactionId: zod_1.z.string().min(1),
        interactionType: zod_1.z.enum(["chat", "meeting", "call"]),
        rating: zod_1.z.number().int().min(1).max(5),
        tags: zod_1.z.array(zod_1.z.nativeEnum(ReviewTag)).max(5),
        comment: zod_1.z.string().max(500).optional(),
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { reviewedUserId, interactionId, interactionType, rating, tags, comment } = validationResult.data;
    // Prevent self-review
    if (uid === reviewedUserId) {
        throw new https_1.HttpsError("invalid-argument", "Cannot review yourself");
    }
    // Check if review already exists for this interaction
    const existingReview = await db
        .collection("reviews")
        .where("reviewerId", "==", uid)
        .where("interactionId", "==", interactionId)
        .limit(1)
        .get();
    if (!existingReview.empty) {
        throw new https_1.HttpsError("already-exists", "Review already submitted for this interaction");
    }
    // Verify interaction occurred
    const verified = await verifyInteraction(uid, reviewedUserId, interactionId, interactionType);
    if (!verified) {
        throw new https_1.HttpsError("permission-denied", "Cannot review - no verified interaction found");
    }
    // Calculate review weight (anti-bias)
    const weight = await calculateReviewWeight(uid, reviewedUserId);
    // Create review
    const reviewId = `review_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const review = {
        reviewId,
        reviewerId: uid,
        reviewedUserId,
        interactionId,
        interactionType,
        rating,
        tags,
        comment,
        createdAt: firestore_1.Timestamp.now(),
        verifiedInteraction: verified,
        weight,
        moderationStatus: comment ? "pending" : "approved", // Auto-approve if no comment
    };
    await db.collection("reviews").doc(reviewId).set(review);
    // Update reputation profile
    await updateReputationProfile(reviewedUserId);
    v2_1.logger.info(`Review submitted: ${reviewId} by ${uid} for ${reviewedUserId} (${rating}⭐)`);
    return {
        success: true,
        reviewId,
        trustLevelChanged: false, // Will be calculated async
    };
});
/**
 * Get user reputation profile
 */
exports.getReputationProfileV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const schema = zod_1.z.object({
        userId: zod_1.z.string().min(1),
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
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
});
/**
 * Get user reviews (paginated)
 */
exports.getUserReviewsV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const schema = zod_1.z.object({
        userId: zod_1.z.string().min(1),
        limit: zod_1.z.number().int().min(1).max(50).default(20),
        startAfter: zod_1.z.string().optional(),
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
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
});
/**
 * Report review for moderation
 */
exports.reportReviewV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const schema = zod_1.z.object({
        reviewId: zod_1.z.string().min(1),
        reason: zod_1.z.enum(["spam", "inappropriate", "fake", "harassment", "other"]),
        description: zod_1.z.string().max(500).optional(),
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { reviewId, reason, description } = validationResult.data;
    // Create report
    await db.collection("reviewReports").add({
        reviewId,
        reporterId: uid,
        reason,
        description,
        createdAt: firestore_1.Timestamp.now(),
        status: "pending",
    });
    // Update review status to pending
    await db.collection("reviews").doc(reviewId).update({
        moderationStatus: "pending",
    });
    v2_1.logger.info(`Review reported: ${reviewId} by ${uid} (${reason})`);
    return { success: true };
});
/**
 * Verify interaction occurred between users
 */
async function verifyInteraction(reviewerId, reviewedUserId, interactionId, interactionType) {
    try {
        if (interactionType === "chat") {
            const chatDoc = await db.collection("chats").doc(interactionId).get();
            if (!chatDoc.exists)
                return false;
            const chatData = chatDoc.data();
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
            if (!bookingDoc.exists)
                return false;
            const bookingData = bookingDoc.data();
            // Booking must be verified/completed
            if (bookingData.status !== "verified")
                return false;
            // Check participants
            const isParticipant = (bookingData.bookerId === reviewerId && bookingData.creatorId === reviewedUserId) ||
                (bookingData.bookerId === reviewedUserId && bookingData.creatorId === reviewerId);
            return isParticipant;
        }
        return false;
    }
    catch (error) {
        v2_1.logger.error("Error verifying interaction", { error, reviewerId, reviewedUserId, interactionId });
        return false;
    }
}
/**
 * Calculate review weight for anti-bias
 */
async function calculateReviewWeight(reviewerId, reviewedUserId) {
    let weight = 1.0;
    // Factor 1: Reviewer's reputation (trusted reviewers get higher weight)
    const reviewerProfile = await db.collection("reputationProfiles").doc(reviewerId).get();
    if (reviewerProfile.exists) {
        const data = reviewerProfile.data();
        const reviewerTrustScore = data.trustScore || 50;
        // Weight ranges from 0.5 (low trust) to 1.5 (high trust)
        weight *= 0.5 + (reviewerTrustScore / 100);
    }
    // Factor 2: Review velocity (prevent spam)
    const recentReviews = await db
        .collection("reviews")
        .where("reviewerId", "==", reviewerId)
        .where("createdAt", ">=", firestore_1.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
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
async function updateReputationProfile(userId) {
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
        const tagCounts = {};
        let positiveCount = 0;
        let negativeCount = 0;
        reviewsSnapshot.docs.forEach((doc) => {
            const review = doc.data();
            const weight = review.weight || 1.0;
            totalWeightedRating += review.rating * weight;
            totalWeight += weight;
            reviewBreakdown[review.rating]++;
            if (review.rating >= 4)
                positiveCount++;
            if (review.rating <= 2)
                negativeCount++;
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
        let trustLevel;
        if (trustScore >= 80 && totalReviews >= 50)
            trustLevel = TrustLevel.PLATINUM;
        else if (trustScore >= 70 && totalReviews >= 20)
            trustLevel = TrustLevel.GOLD;
        else if (trustScore >= 60 && totalReviews >= 10)
            trustLevel = TrustLevel.SILVER;
        else
            trustLevel = TrustLevel.BRONZE;
        // Update profile
        const profile = {
            userId,
            trustLevel,
            averageRating: Math.round(averageRating * 10) / 10,
            totalReviews,
            totalPositiveReviews: positiveCount,
            totalNegativeReviews: negativeCount,
            reviewBreakdown,
            tagCounts,
            trustScore: Math.round(trustScore),
            lastUpdatedAt: firestore_1.Timestamp.now(),
        };
        await db.collection("reputationProfiles").doc(userId).set(profile, { merge: true });
        v2_1.logger.info(`Reputation updated: ${userId} → ${trustLevel} (${trustScore} score)`);
    }
    catch (error) {
        v2_1.logger.error("Error updating reputation profile", { error, userId });
        throw error;
    }
}
/**
 * Scheduled: Recalculate all reputation scores daily
 */
exports.recalculateReputationScoresDaily = (0, scheduler_1.onSchedule)({
    schedule: "0 2 * * *", // 2 AM daily
    region: "europe-west3",
    timeoutSeconds: 540,
    memory: "512MiB",
}, async () => {
    v2_1.logger.info("Starting daily reputation recalculation");
    try {
        // Get all users with reviews
        const usersWithReviews = await db
            .collection("reviews")
            .where("moderationStatus", "==", "approved")
            .get();
        const uniqueUserIds = new Set();
        usersWithReviews.docs.forEach((doc) => {
            uniqueUserIds.add(doc.data().reviewedUserId);
        });
        // Update each user's profile
        let updated = 0;
        for (const userId of uniqueUserIds) {
            await updateReputationProfile(userId);
            updated++;
        }
        v2_1.logger.info(`Reputation recalculation complete: ${updated} users updated`);
    }
    catch (error) {
        v2_1.logger.error("Error in reputation recalculation", { error });
        throw error;
    }
});
/**
 * Get trust level badge info
 */
function getTrustLevelInfo(level) {
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
//# sourceMappingURL=reputationEngine.js.map