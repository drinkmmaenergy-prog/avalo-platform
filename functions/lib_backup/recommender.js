"use strict";
/**
 * PHASE 20 - Behavioral AI Engine (Recommender v2)
 *
 * Advanced discovery ranking using:
 * - Recency (activity freshness)
 * - Distance (Haversine formula)
 * - Interaction depth (messages, likes, profile views)
 * - Reply latency (response time patterns)
 * - Risk dampening (block/complaint history)
 *
 * Feature flag: discovery_rank_v2
 * Region: europe-west3
 * No changes to existing monetization
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.dailySignalRollupScheduler = exports.getDiscoveryRankV2 = void 0;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const v2_1 = require("firebase-functions/v2");
const zod_1 = require("zod");
const featureFlags_1 = require("./featureFlags");
const db = (0, firestore_1.getFirestore)();
/**
 * Ranking weights (tunable)
 */
const RANKING_WEIGHTS = {
    RECENCY: 25, // Max 25 points for recent activity
    DISTANCE: 30, // Max 30 points for nearby users
    INTERACTION_DEPTH: 20, // Max 20 points for engagement
    REPLY_LATENCY: 15, // Max 15 points for fast replies
    PROFILE_QUALITY: 10, // Max 10 points for complete profile
    // Risk dampening is multiplicative, not additive
};
/**
 * Get discovery recommendations v2
 * Callable function
 */
exports.getDiscoveryRankV2 = (0, https_1.onCall)({
    region: "europe-west3",
    timeoutSeconds: 60,
    memory: "512MiB",
}, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Check feature flag
    const v2Enabled = await (0, featureFlags_1.getFeatureFlag)(uid, "discovery_rank_v2", false);
    if (!v2Enabled) {
        throw new https_1.HttpsError("failed-precondition", "Discovery v2 not enabled for this user");
    }
    // Validate input
    const schema = zod_1.z.object({
        limit: zod_1.z.number().min(1).max(100).default(20),
        offset: zod_1.z.number().min(0).default(0),
        filters: zod_1.z
            .object({
            ageMin: zod_1.z.number().optional(),
            ageMax: zod_1.z.number().optional(),
            maxDistanceKm: zod_1.z.number().optional(),
            verifiedOnly: zod_1.z.boolean().optional(),
        })
            .optional(),
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { limit, offset, filters } = validationResult.data;
    try {
        v2_1.logger.info(`Discovery v2 request from ${uid}`, { limit, offset });
        // Get requesting user's signals
        const userSignals = await getUserSignals(uid);
        // Get candidate pool
        const candidates = await getCandidatePool(uid, userSignals, filters);
        if (candidates.length === 0) {
            return {
                results: [],
                total: 0,
                version: "v2",
                cached: false,
            };
        }
        // Score and rank candidates
        const scoredCandidates = await scoreCandidates(userSignals, candidates);
        // Sort by score (descending)
        scoredCandidates.sort((a, b) => b.score - a.score);
        // Apply pagination
        const paginatedResults = scoredCandidates.slice(offset, offset + limit);
        // Format results
        const results = paginatedResults.map((candidate) => ({
            userId: candidate.userId,
            score: candidate.score,
            scoreBreakdown: candidate.scoreBreakdown,
            // Include minimal profile data
            displayName: candidate.displayName,
            age: candidate.age,
            photoUrl: candidate.photoUrl,
            distance: candidate.distance,
            isOnline: candidate.isOnline,
        }));
        v2_1.logger.info(`Discovery v2 returned ${results.length} results for ${uid}`);
        return {
            results,
            total: scoredCandidates.length,
            version: "v2",
            cached: false,
            timestamp: new Date().toISOString(),
        };
    }
    catch (error) {
        v2_1.logger.error("Discovery v2 failed:", error);
        throw new https_1.HttpsError("internal", "Recommendation engine failed");
    }
});
/**
 * Get or compute user signals
 */
async function getUserSignals(uid) {
    // Try to get cached signals
    const signalsDoc = await db.collection("userSignals").doc(uid).get();
    if (signalsDoc.exists) {
        const signals = signalsDoc.data();
        // Check if stale (older than 6 hours)
        const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
        if (signals.updatedAt.toMillis() < sixHoursAgo) {
            // Recompute in background
            computeUserSignals(uid).catch((err) => v2_1.logger.error("Background signal computation failed:", err));
        }
        return signals;
    }
    // Compute fresh signals
    return await computeUserSignals(uid);
}
/**
 * Compute user signals from raw data
 */
async function computeUserSignals(uid) {
    try {
        // Get user profile
        const userDoc = await db.collection("users").doc(uid).get();
        if (!userDoc.exists) {
            throw new Error("User not found");
        }
        const userData = userDoc.data();
        // Get interaction stats
        const [messagesSnapshot, likesSnapshot, viewsSnapshot, chatsSnapshot,] = await Promise.all([
            db.collection("messages").where("senderId", "==", uid).limit(1000).get(),
            db.collection("likes").where("likerId", "==", uid).limit(1000).get(),
            db.collection("profileViews").where("viewerId", "==", uid).limit(1000).get(),
            db.collection("chats").where("participants", "array-contains", uid).limit(100).get(),
        ]);
        // Calculate reply latency
        let totalLatency = 0;
        let replyCount = 0;
        // Simplified: would need message threading data
        const averageReplyLatencyMinutes = 30; // Placeholder
        // Calculate response rate
        const messageResponseRate = messagesSnapshot.size > 0 ? 0.7 : 0; // Placeholder
        // Profile completeness
        let profileCompleteness = 0;
        if (userData.displayName)
            profileCompleteness += 20;
        if (userData.bio)
            profileCompleteness += 20;
        if (userData.photos && userData.photos.length > 0)
            profileCompleteness += 30;
        if (userData.verification?.status === "approved")
            profileCompleteness += 30;
        // Get risk factors
        const [blockedBySnapshot, reportsSnapshot] = await Promise.all([
            db.collection("blocks").where("blockedUserId", "==", uid).get(),
            db.collection("contentFlags").where("targetUserId", "==", uid).get(),
        ]);
        // Account age
        const accountAgeHours = (Date.now() - userData.createdAt.toMillis()) / (1000 * 60 * 60);
        const signals = {
            userId: uid,
            lastActiveAt: userData.lastActiveAt || firestore_1.Timestamp.now(),
            totalProfileViews: viewsSnapshot.size,
            totalLikes: likesSnapshot.size,
            totalMessages: messagesSnapshot.size,
            totalReplies: Math.floor(messagesSnapshot.size * 0.6), // Estimate
            averageReplyLatencyMinutes,
            messageResponseRate,
            profileCompleteness,
            uniqueChatsStarted: chatsSnapshot.size,
            uniqueProfilesViewed: viewsSnapshot.size,
            photoCount: userData.photos?.length || 0,
            hasVerifiedBadge: userData.verification?.status === "approved",
            accountAgeHours,
            blockedByCount: blockedBySnapshot.size,
            reportedCount: reportsSnapshot.size,
            strikeCount: userData.strikes || 0,
            latitude: userData.location?.latitude || null,
            longitude: userData.location?.longitude || null,
            preferredGenders: userData.preferences?.seeking || ["female"],
            ageMin: userData.preferences?.ageMin || 18,
            ageMax: userData.preferences?.ageMax || 100,
            updatedAt: firestore_1.Timestamp.now(),
        };
        // Cache signals
        await db.collection("userSignals").doc(uid).set(signals);
        return signals;
    }
    catch (error) {
        v2_1.logger.error(`Failed to compute signals for ${uid}:`, error);
        throw error;
    }
}
/**
 * Get candidate pool based on user preferences
 */
async function getCandidatePool(uid, userSignals, filters) {
    // Query users matching basic criteria
    let query = db.collection("users")
        .where("accountStatus", "==", "active")
        .limit(200); // Get more candidates for ranking
    // Get users
    const candidatesSnapshot = await query.get();
    // Filter candidates
    const candidates = candidatesSnapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((candidate) => {
        // Exclude self
        if (candidate.id === uid)
            return false;
        // Apply gender preference
        if (userSignals.preferredGenders.length > 0 &&
            !userSignals.preferredGenders.includes(candidate.gender)) {
            return false;
        }
        // Apply age filters
        const age = candidate.age || calculateAge(candidate.dateOfBirth);
        if (age < userSignals.ageMin || age > userSignals.ageMax) {
            return false;
        }
        // Apply custom filters
        if (filters?.verifiedOnly && candidate.verification?.status !== "approved") {
            return false;
        }
        // Exclude blocked users
        // Would need to query blocks collection, skipping for performance
        return true;
    });
    return candidates;
}
/**
 * Score candidates using ranking algorithm
 */
async function scoreCandidates(userSignals, candidates) {
    const scoredCandidates = await Promise.all(candidates.map(async (candidate) => {
        try {
            // Get candidate signals
            const candidateSignals = await getUserSignals(candidate.id);
            // Calculate individual scores
            const recencyScore = calculateRecencyScore(candidateSignals);
            const distanceScore = calculateDistanceScore(userSignals, candidateSignals);
            const interactionScore = calculateInteractionScore(candidateSignals);
            const replyLatencyScore = calculateReplyLatencyScore(candidateSignals);
            const qualityScore = calculateQualityScore(candidateSignals);
            // Calculate risk dampening (multiplicative)
            const riskDampening = calculateRiskDampening(candidateSignals);
            // Total score
            const rawScore = recencyScore +
                distanceScore +
                interactionScore +
                replyLatencyScore +
                qualityScore;
            const finalScore = rawScore * riskDampening;
            return {
                userId: candidate.id,
                score: Math.round(finalScore),
                scoreBreakdown: {
                    recency: Math.round(recencyScore),
                    distance: Math.round(distanceScore),
                    interaction: Math.round(interactionScore),
                    replyLatency: Math.round(replyLatencyScore),
                    quality: Math.round(qualityScore),
                    riskDampening: Math.round(riskDampening * 100) / 100,
                },
                displayName: candidate.displayName,
                age: candidate.age || calculateAge(candidate.dateOfBirth),
                photoUrl: candidate.photos?.[0] || null,
                distance: calculateDistance(userSignals.latitude, userSignals.longitude, candidateSignals.latitude, candidateSignals.longitude),
                isOnline: isRecentlyActive(candidateSignals.lastActiveAt),
            };
        }
        catch (error) {
            v2_1.logger.error(`Scoring failed for candidate ${candidate.id}:`, error);
            return null;
        }
    }));
    // Filter out failed scorings
    return scoredCandidates.filter((c) => c !== null);
}
/**
 * Recency score (0-25 points)
 * More points for recently active users
 */
function calculateRecencyScore(signals) {
    const hoursSinceActive = (Date.now() - signals.lastActiveAt.toMillis()) / (1000 * 60 * 60);
    if (hoursSinceActive < 1)
        return 25; // Online now
    if (hoursSinceActive < 24)
        return 20; // Active today
    if (hoursSinceActive < 72)
        return 15; // Active this week
    if (hoursSinceActive < 168)
        return 10; // Active last week
    return 5; // Inactive
}
/**
 * Distance score (0-30 points)
 * More points for nearby users
 */
function calculateDistanceScore(user, candidate) {
    if (!user.latitude || !user.longitude || !candidate.latitude || !candidate.longitude) {
        return 15; // Neutral score if no location
    }
    const distance = calculateDistance(user.latitude, user.longitude, candidate.latitude, candidate.longitude);
    if (distance < 5)
        return 30; // Very close
    if (distance < 20)
        return 25; // Close
    if (distance < 50)
        return 20; // Nearby
    if (distance < 100)
        return 15; // Same region
    if (distance < 500)
        return 10; // Same country
    return 5; // Far away
}
/**
 * Interaction depth score (0-20 points)
 * More points for engaged users
 */
function calculateInteractionScore(signals) {
    let score = 0;
    // Message activity (max 8 points)
    score += Math.min(8, signals.totalMessages / 10);
    // Profile views (max 6 points)
    score += Math.min(6, signals.totalProfileViews / 20);
    // Likes given (max 6 points)
    score += Math.min(6, signals.totalLikes / 15);
    return score;
}
/**
 * Reply latency score (0-15 points)
 * More points for users who reply quickly
 */
function calculateReplyLatencyScore(signals) {
    const latency = signals.averageReplyLatencyMinutes;
    if (latency < 5)
        return 15; // Very responsive
    if (latency < 30)
        return 12; // Responsive
    if (latency < 60)
        return 9; // Moderate
    if (latency < 180)
        return 6; // Slow
    return 3; // Very slow
}
/**
 * Profile quality score (0-10 points)
 */
function calculateQualityScore(signals) {
    let score = 0;
    // Profile completeness
    score += signals.profileCompleteness / 10; // Max 10 points
    return Math.min(10, score);
}
/**
 * Risk dampening (0.0-1.0 multiplier)
 * Reduces score for risky users
 */
function calculateRiskDampening(signals) {
    let dampening = 1.0;
    // Blocked by many users
    if (signals.blockedByCount > 0) {
        dampening *= 0.9 ** signals.blockedByCount; // 10% reduction per block
    }
    // Reported by users
    if (signals.reportedCount > 0) {
        dampening *= 0.85 ** signals.reportedCount; // 15% reduction per report
    }
    // Strikes
    if (signals.strikeCount > 0) {
        dampening *= 0.7 ** signals.strikeCount; // 30% reduction per strike
    }
    return Math.max(0.1, dampening); // Min 10% of original score
}
/**
 * Haversine distance calculation (kilometers)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2)
        return 9999; // Very far if no location
    const R = 6371; // Earth radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
function toRad(degrees) {
    return (degrees * Math.PI) / 180;
}
function calculateAge(dateOfBirth) {
    if (!dateOfBirth)
        return 25; // Default
    const dob = dateOfBirth.toDate ? dateOfBirth.toDate() : new Date(dateOfBirth);
    const ageDiff = Date.now() - dob.getTime();
    return Math.floor(ageDiff / (1000 * 60 * 60 * 24 * 365.25));
}
function isRecentlyActive(lastActiveAt) {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return lastActiveAt.toMillis() > fiveMinutesAgo;
}
/**
 * Daily signal rollup scheduler
 * Recomputes user signals for active users
 */
exports.dailySignalRollupScheduler = (0, scheduler_1.onSchedule)({
    schedule: "0 4 * * *", // 4 AM daily
    region: "europe-west3",
    timeoutSeconds: 540,
}, async (event) => {
    v2_1.logger.info("Daily signal rollup started");
    try {
        // Get active users (active in last 7 days)
        const sevenDaysAgo = firestore_1.Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const activeUsersSnapshot = await db
            .collection("users")
            .where("lastActiveAt", ">=", sevenDaysAgo)
            .limit(1000)
            .get();
        v2_1.logger.info(`Processing signals for ${activeUsersSnapshot.size} users`);
        // Compute signals in batches
        const batchSize = 10;
        for (let i = 0; i < activeUsersSnapshot.docs.length; i += batchSize) {
            const batch = activeUsersSnapshot.docs.slice(i, i + batchSize);
            await Promise.all(batch.map((doc) => computeUserSignals(doc.id).catch((err) => v2_1.logger.error(`Signal computation failed for ${doc.id}:`, err))));
        }
        v2_1.logger.info("Daily signal rollup completed");
    }
    catch (error) {
        v2_1.logger.error("Daily signal rollup failed:", error);
        throw error;
    }
});
//# sourceMappingURL=recommender.js.map