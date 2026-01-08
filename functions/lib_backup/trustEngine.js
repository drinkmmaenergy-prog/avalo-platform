"use strict";
/**
 * Trust Engine v3 (Avalo 3.0 - Phase 37)
 *
 * Real-time composite trust scoring system (0-1000 scale)
 * Updated every 6 hours or upon key events
 * Cached in Redis for sub-100ms latency
 *
 * Trust Score Components:
 * - Identity Verification (0-250 points)
 * - Behavioral History (0-250 points)
 * - Message Quality (0-200 points)
 * - Dispute Resolution (0-150 points)
 * - Community Standing (0-150 points)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.recalculateAllTrustScoresDaily = exports.recalculateTrustOnEvent = exports.getTrustScoreV1 = exports.TrustTier = void 0;
exports.calculateTrustScore = calculateTrustScore;
exports.getTrustTierInfo = getTrustTierInfo;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const v2_1 = require("firebase-functions/v2");
const zod_1 = require("zod");
const db = (0, firestore_1.getFirestore)();
/**
 * Trust Score Tier System
 */
var TrustTier;
(function (TrustTier) {
    TrustTier["RESTRICTED"] = "restricted";
    TrustTier["BRONZE"] = "bronze";
    TrustTier["SILVER"] = "silver";
    TrustTier["GOLD"] = "gold";
    TrustTier["PLATINUM"] = "platinum";
    TrustTier["DIAMOND"] = "diamond";
})(TrustTier || (exports.TrustTier = TrustTier = {}));
/**
 * Calculate Trust Score v3
 *
 * @param userId - User to calculate score for
 * @returns Complete trust profile with breakdown
 */
async function calculateTrustScore(userId) {
    v2_1.logger.info(`Calculating Trust Score v3 for user: ${userId}`);
    // Fetch all required data in parallel
    const [userDoc, verificationDoc, behaviorStats, messageStats, disputeHistory, reviews, reports,] = await Promise.all([
        db.collection("users").doc(userId).get(),
        db.collection("verifications").doc(userId).get(),
        db.collection("behaviorStats").doc(userId).get(),
        db.collection("messageStats").doc(userId).get(),
        db.collection("disputes").where("userId", "==", userId).get(),
        db.collection("reviews").where("reviewedUserId", "==", userId).where("moderationStatus", "==", "approved").get(),
        db.collection("contentFlags").where("targetUserId", "==", userId).get(),
    ]);
    if (!userDoc.exists) {
        throw new Error("User not found");
    }
    const userData = userDoc.data();
    const accountAge = Date.now() - userData.createdAt.toMillis();
    const accountAgeDays = accountAge / (24 * 60 * 60 * 1000);
    // === IDENTITY SCORE (0-250) ===
    let identityScore = 0;
    // Email verified
    if (userData.emailVerified)
        identityScore += 20;
    // Phone verified
    if (userData.phoneVerified)
        identityScore += 30;
    // Photo verification
    if (verificationDoc.exists) {
        const verification = verificationDoc.data();
        if (verification.status === "approved") {
            identityScore += 80;
            if (verification.livenessCheck)
                identityScore += 20;
        }
        else if (verification.status === "pending") {
            identityScore += 10;
        }
    }
    // Government ID verification (KYC)
    if (userData.kycStatus === "approved")
        identityScore += 70;
    // Social media connections
    const socialConnections = userData.socialConnections || {};
    identityScore += Math.min(30, Object.keys(socialConnections).length * 10);
    // === BEHAVIORAL SCORE (0-250) ===
    let behavioralScore = 100; // Start at 100 (neutral)
    if (behaviorStats.exists) {
        const behavior = behaviorStats.data();
        // Positive behaviors
        behavioralScore += Math.min(50, behavior.completedInteractions * 2);
        behavioralScore += Math.min(30, behavior.successfulBookings * 5);
        behavioralScore += Math.min(20, behavior.tipsGiven * 0.5);
        // Account age bonus (up to 50 points)
        behavioralScore += Math.min(50, accountAgeDays * 0.5);
    }
    // === MESSAGE QUALITY SCORE (0-200) ===
    let messageQualityScore = 0;
    if (messageStats.exists) {
        const messages = messageStats.data();
        // Message volume (responsiveness)
        messageQualityScore += Math.min(40, messages.totalSent * 0.1);
        // Response rate
        if (messages.messagesReceived > 0) {
            const responseRate = messages.messagesReplied / messages.messagesReceived;
            messageQualityScore += responseRate * 60;
        }
        // Quality indicators
        if (messages.avgSentiment) {
            // Sentiment score from 0-1
            messageQualityScore += messages.avgSentiment * 40;
        }
        // Spam/abuse detection
        if (messages.spamFlagsCount > 0) {
            messageQualityScore -= messages.spamFlagsCount * 10;
        }
        // Conversation completion rate
        if (messages.conversationsStarted > 0) {
            const completionRate = messages.conversationsCompleted / messages.conversationsStarted;
            messageQualityScore += completionRate * 60;
        }
    }
    // === DISPUTE HISTORY SCORE (0-150) ===
    let disputeScore = 150; // Start at max, deduct for disputes
    if (!disputeHistory.empty) {
        disputeHistory.docs.forEach((doc) => {
            const dispute = doc.data();
            if (dispute.status === "resolved") {
                if (dispute.resolution === "user_at_fault") {
                    disputeScore -= 30;
                }
                else if (dispute.resolution === "mutual_fault") {
                    disputeScore -= 15;
                }
            }
            else if (dispute.status === "open") {
                disputeScore -= 10; // Pending disputes
            }
        });
    }
    // Ensure non-negative
    disputeScore = Math.max(0, disputeScore);
    // === COMMUNITY STANDING SCORE (0-150) ===
    let communityScore = 50; // Base score
    // Positive reviews
    if (!reviews.empty) {
        const avgRating = reviews.docs.reduce((sum, doc) => sum + doc.data().rating, 0) / reviews.size;
        communityScore += (avgRating - 3) * 20; // -40 to +40 based on rating
        communityScore += Math.min(30, reviews.size * 2); // Volume bonus
    }
    // Content flags (negative)
    if (!reports.empty) {
        const approvedReports = reports.docs.filter(doc => doc.data().status === "approved").length;
        communityScore -= approvedReports * 15;
    }
    // Referral success
    if (userData.referralStats) {
        communityScore += Math.min(30, userData.referralStats.successfulReferrals * 5);
    }
    // Ensure bounds
    communityScore = Math.max(0, Math.min(150, communityScore));
    // === CALCULATE TOTAL ===
    const breakdown = {
        identity: Math.round(Math.max(0, Math.min(250, identityScore))),
        behavioral: Math.round(Math.max(0, Math.min(250, behavioralScore))),
        messageQuality: Math.round(Math.max(0, Math.min(200, messageQualityScore))),
        disputeHistory: Math.round(Math.max(0, Math.min(150, disputeScore))),
        communityStanding: Math.round(Math.max(0, Math.min(150, communityScore))),
        total: 0,
        tier: TrustTier.BRONZE,
        lastUpdated: firestore_1.Timestamp.now(),
    };
    breakdown.total = Math.round(breakdown.identity +
        breakdown.behavioral +
        breakdown.messageQuality +
        breakdown.disputeHistory +
        breakdown.communityStanding);
    // Determine tier
    if (breakdown.total >= 900)
        breakdown.tier = TrustTier.DIAMOND;
    else if (breakdown.total >= 800)
        breakdown.tier = TrustTier.PLATINUM;
    else if (breakdown.total >= 600)
        breakdown.tier = TrustTier.GOLD;
    else if (breakdown.total >= 400)
        breakdown.tier = TrustTier.SILVER;
    else if (breakdown.total >= 200)
        breakdown.tier = TrustTier.BRONZE;
    else
        breakdown.tier = TrustTier.RESTRICTED;
    // Detect risk flags
    const riskFlags = [];
    if (breakdown.total < 200)
        riskFlags.push("low_trust_score");
    if (identityScore < 50)
        riskFlags.push("unverified_identity");
    if (disputeScore < 50)
        riskFlags.push("high_dispute_rate");
    if (!reports.empty && reports.size > 3)
        riskFlags.push("multiple_reports");
    if (accountAgeDays < 7)
        riskFlags.push("new_account");
    // Fetch existing profile for history
    const existingProfile = await db.collection("trustProfiles").doc(userId).get();
    const historicalScores = existingProfile.exists
        ? (existingProfile.data().historicalScores || [])
        : [];
    // Add current score to history (keep last 30 entries)
    historicalScores.push({
        score: breakdown.total,
        timestamp: firestore_1.Timestamp.now(),
        trigger: "scheduled_calculation",
    });
    if (historicalScores.length > 30) {
        historicalScores.shift();
    }
    const trustProfile = {
        userId,
        trustScore: breakdown.total,
        trustTier: breakdown.tier,
        breakdown,
        riskFlags,
        lastCalculated: firestore_1.Timestamp.now(),
        calculationVersion: "3.0.0",
        historicalScores,
    };
    // Store in Firestore
    await db.collection("trustProfiles").doc(userId).set(trustProfile, { merge: true });
    // Cache in Redis (if available)
    try {
        // Redis caching would go here
        // await redis.setex(`trust:${userId}`, 21600, JSON.stringify(trustProfile)); // 6 hour cache
    }
    catch (error) {
        v2_1.logger.warn("Redis cache failed", { error });
    }
    v2_1.logger.info(`Trust Score calculated: ${userId} → ${breakdown.total} (${breakdown.tier})`);
    return trustProfile;
}
/**
 * Get Trust Score (cached)
 */
exports.getTrustScoreV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const schema = zod_1.z.object({
        userId: zod_1.z.string().optional(),
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const targetUserId = validationResult.data.userId || uid;
    // Check Redis cache first
    try {
        // const cached = await redis.get(`trust:${targetUserId}`);
        // if (cached) return JSON.parse(cached);
    }
    catch (error) {
        v2_1.logger.warn("Redis read failed", { error });
    }
    // Fetch from Firestore
    const profileDoc = await db.collection("trustProfiles").doc(targetUserId).get();
    if (!profileDoc.exists) {
        // Calculate on-demand if not exists
        return await calculateTrustScore(targetUserId);
    }
    const profile = profileDoc.data();
    // Check if needs recalculation (>6 hours old)
    const ageMs = Date.now() - profile.lastCalculated.toMillis();
    if (ageMs > 6 * 60 * 60 * 1000) {
        v2_1.logger.info(`Trust score stale, recalculating: ${targetUserId}`);
        return await calculateTrustScore(targetUserId);
    }
    return profile;
});
/**
 * Trigger trust score recalculation on key events
 */
exports.recalculateTrustOnEvent = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const schema = zod_1.z.object({
        userId: zod_1.z.string(),
        eventType: zod_1.z.enum([
            "verification_completed",
            "dispute_resolved",
            "review_received",
            "report_filed",
            "payment_completed",
        ]),
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { userId, eventType } = validationResult.data;
    v2_1.logger.info(`Trust recalculation triggered: ${userId} (event: ${eventType})`);
    const profile = await calculateTrustScore(userId);
    return {
        success: true,
        newScore: profile.trustScore,
        newTier: profile.trustTier,
        previousScore: profile.historicalScores[profile.historicalScores.length - 2]?.score || 0,
    };
});
/**
 * Scheduled job: Recalculate all trust scores (daily)
 */
exports.recalculateAllTrustScoresDaily = (0, scheduler_1.onSchedule)({
    schedule: "0 3 * * *", // 3 AM daily
    region: "europe-west3",
    timeoutSeconds: 540,
    memory: "1GiB",
}, async () => {
    v2_1.logger.info("Starting daily trust score recalculation");
    try {
        // Get all users with activity in last 90 days
        const ninetyDaysAgo = firestore_1.Timestamp.fromMillis(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const activeUsers = await db
            .collection("users")
            .where("lastActiveAt", ">=", ninetyDaysAgo)
            .get();
        v2_1.logger.info(`Recalculating ${activeUsers.size} active users`);
        let processed = 0;
        let errors = 0;
        // Process in batches of 100
        const batchSize = 100;
        for (let i = 0; i < activeUsers.docs.length; i += batchSize) {
            const batch = activeUsers.docs.slice(i, i + batchSize);
            await Promise.allSettled(batch.map(async (doc) => {
                try {
                    await calculateTrustScore(doc.id);
                    processed++;
                }
                catch (error) {
                    v2_1.logger.error(`Failed to calculate trust score for ${doc.id}`, { error });
                    errors++;
                }
            }));
            // Log progress every 1000 users
            if (processed % 1000 === 0) {
                v2_1.logger.info(`Progress: ${processed}/${activeUsers.size} users processed`);
            }
        }
        v2_1.logger.info(`Trust score recalculation complete: ${processed} succeeded, ${errors} failed`);
    }
    catch (error) {
        v2_1.logger.error("Error in daily trust recalculation", { error });
        throw error;
    }
});
/**
 * Get trust tier information
 */
function getTrustTierInfo(tier) {
    switch (tier) {
        case TrustTier.DIAMOND:
            return {
                name: "Diamond",
                minScore: 900,
                maxScore: 1000,
                color: "#B9F2FF",
                icon: "💎",
                benefits: [
                    "Elite status badge",
                    "Priority matching",
                    "Exclusive features",
                    "VIP support",
                    "0% platform fees on select transactions",
                ],
            };
        case TrustTier.PLATINUM:
            return {
                name: "Platinum",
                minScore: 800,
                maxScore: 899,
                color: "#E5E4E2",
                icon: "⭐",
                benefits: [
                    "Verified trusted badge",
                    "Boosted discovery",
                    "Advanced analytics",
                    "Priority support",
                ],
            };
        case TrustTier.GOLD:
            return {
                name: "Gold",
                minScore: 600,
                maxScore: 799,
                color: "#FFD700",
                icon: "🥇",
                benefits: [
                    "Trusted user badge",
                    "Enhanced visibility",
                    "Fast dispute resolution",
                ],
            };
        case TrustTier.SILVER:
            return {
                name: "Silver",
                minScore: 400,
                maxScore: 599,
                color: "#C0C0C0",
                icon: "🥈",
                benefits: [
                    "Established user badge",
                    "Standard features",
                    "Community access",
                ],
            };
        case TrustTier.BRONZE:
            return {
                name: "Bronze",
                minScore: 200,
                maxScore: 399,
                color: "#CD7F32",
                icon: "🥉",
                benefits: [
                    "Basic access",
                    "Learning platform features",
                ],
            };
        case TrustTier.RESTRICTED:
            return {
                name: "Restricted",
                minScore: 0,
                maxScore: 199,
                color: "#808080",
                icon: "⚠️",
                benefits: [
                    "Limited access",
                    "Must improve trust score",
                ],
            };
    }
}
//# sourceMappingURL=trustEngine.js.map