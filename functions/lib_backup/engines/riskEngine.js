"use strict";
/**
 * Risk & Anti-Fraud Engine - Phase 13
 *
 * Implements risk assessment and fraud detection:
 * - User risk profiles
 * - Trust score calculation
 * - Automated ban system
 * - Fraud pattern detection
 *
 * Heuristics:
 * - 1000+ tokens in short period → high risk
 * - 2+ abuse reports in 24h → trust score drop
 * - New unverified + rapid activity → alert
 * - Verified + high quality → lower risk
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.banUserCallable = exports.calculateTrustScoreCallable = exports.updateRiskProfileOnReportTrigger = exports.updateRiskProfileTrigger = exports.RiskLevel = void 0;
exports.calculateTrustScore = calculateTrustScore;
exports.isUserRestricted = isUserRestricted;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const zod_1 = require("zod");
const db = (0, firestore_2.getFirestore)();
/**
 * Risk level enum
 */
var RiskLevel;
(function (RiskLevel) {
    RiskLevel["LOW"] = "low";
    RiskLevel["MEDIUM"] = "medium";
    RiskLevel["HIGH"] = "high";
    RiskLevel["CRITICAL"] = "critical";
})(RiskLevel || (exports.RiskLevel = RiskLevel = {}));
/**
 * Zod validation
 */
const BanUserSchema = zod_1.z.object({
    targetUserId: zod_1.z.string().min(1),
    reason: zod_1.z.string().min(10).max(500),
    durationDays: zod_1.z.number().min(1).max(365).optional(), // Permanent if not specified
});
/**
 * Update risk profile trigger
 * Triggered on transaction creation or report
 */
exports.updateRiskProfileTrigger = (0, firestore_1.onDocumentCreated)({
    document: "transactions/{txId}",
    region: "europe-west3",
}, async (event) => {
    const tx = event.data?.data();
    if (!tx)
        return;
    const userId = tx.uid;
    if (!userId)
        return;
    try {
        await updateUserRiskProfile(userId);
        console.log(`Risk profile updated for user ${userId}`);
    }
    catch (error) {
        console.error(`Error updating risk profile for ${userId}:`, error);
    }
});
/**
 * Update risk profile when user is reported
 */
exports.updateRiskProfileOnReportTrigger = (0, firestore_1.onDocumentCreated)({
    document: "moderationFlags/{flagId}",
    region: "europe-west3",
}, async (event) => {
    const flag = event.data?.data();
    if (!flag)
        return;
    const targetUserId = flag.targetUserId;
    if (!targetUserId)
        return;
    try {
        await updateUserRiskProfile(targetUserId);
        console.log(`Risk profile updated for reported user ${targetUserId}`);
    }
    catch (error) {
        console.error(`Error updating risk profile for ${targetUserId}:`, error);
    }
});
/**
 * Update user risk profile
 */
async function updateUserRiskProfile(userId) {
    const profileRef = db.collection("userRiskProfiles").doc(userId);
    await db.runTransaction(async (tx) => {
        const profileDoc = await tx.get(profileRef);
        const userDoc = await tx.get(db.collection("users").doc(userId));
        if (!userDoc.exists) {
            console.warn(`User ${userId} not found`);
            return;
        }
        const userData = userDoc.data();
        // Gather metrics
        const now = Date.now();
        const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
        // Query recent transactions
        const recentTxSnapshot = await db
            .collection("transactions")
            .where("uid", "==", userId)
            .where("createdAt", ">", firestore_2.Timestamp.fromMillis(twentyFourHoursAgo))
            .get();
        const rapidTransactionCount24h = recentTxSnapshot.size;
        // Query total transactions
        const allTxSnapshot = await db
            .collection("transactions")
            .where("uid", "==", userId)
            .get();
        let totalTokensSpent = 0;
        let totalTokensEarned = 0;
        allTxSnapshot.docs.forEach((doc) => {
            const txData = doc.data();
            const amount = txData.amount || 0;
            if (amount < 0) {
                totalTokensSpent += Math.abs(amount);
            }
            else {
                totalTokensEarned += amount;
            }
        });
        // Query abuse reports
        const allReportsSnapshot = await db
            .collection("moderationFlags")
            .where("targetUserId", "==", userId)
            .get();
        const abuseReports = allReportsSnapshot.size;
        const recentReportsSnapshot = await db
            .collection("moderationFlags")
            .where("targetUserId", "==", userId)
            .where("createdAt", ">", firestore_2.Timestamp.fromMillis(twentyFourHoursAgo))
            .get();
        const abuseReports24h = recentReportsSnapshot.size;
        // Calculate account age
        const createdAt = userData?.createdAt;
        const accountAgeHours = createdAt
            ? Math.floor((now - createdAt.toMillis()) / (60 * 60 * 1000))
            : 0;
        // Verification status
        const isVerified = userData?.verification?.status === "approved";
        const verifiedAt = userData?.verification?.verifiedAt;
        // Calculate quality score
        const qualityScore = calculateQualityScore(userData);
        // Calculate trust score
        const trustScore = await calculateTrustScore(userId);
        // Determine risk factors
        const riskFactors = [];
        if (totalTokensSpent > 1000 && accountAgeHours < 72) {
            riskFactors.push("high_spend_new_account");
        }
        if (abuseReports24h >= 2) {
            riskFactors.push("multiple_reports_24h");
        }
        if (rapidTransactionCount24h > 50) {
            riskFactors.push("rapid_transactions");
        }
        if (!isVerified && totalTokensSpent > 500) {
            riskFactors.push("unverified_high_spend");
        }
        if (abuseReports >= 5) {
            riskFactors.push("high_abuse_reports");
        }
        // Determine risk level
        let riskLevel = RiskLevel.LOW;
        if (riskFactors.length >= 3 || trustScore < 30) {
            riskLevel = RiskLevel.CRITICAL;
        }
        else if (riskFactors.length >= 2 || trustScore < 50) {
            riskLevel = RiskLevel.HIGH;
        }
        else if (riskFactors.length >= 1 || trustScore < 70) {
            riskLevel = RiskLevel.MEDIUM;
        }
        // Get existing ban status
        const existingProfile = profileDoc.data();
        const isBanned = existingProfile?.isBanned || false;
        const bannedUntil = existingProfile?.bannedUntil;
        const banReason = existingProfile?.banReason;
        // Create/update profile
        const profile = {
            userId,
            riskLevel,
            trustScore,
            qualityScore,
            totalTokensSpent,
            totalTokensEarned,
            transactionCount: allTxSnapshot.size,
            rapidTransactionCount24h,
            abuseReports,
            abuseReports24h,
            moderationFlags: 0, // Could query from moderationFlags collection
            accountAgeHours,
            isVerified,
            verifiedAt,
            isBanned,
            bannedUntil,
            banReason,
            riskFactors,
            lastUpdated: firestore_2.FieldValue.serverTimestamp(),
            createdAt: profileDoc.exists ? existingProfile.createdAt : firestore_2.FieldValue.serverTimestamp(),
        };
        tx.set(profileRef, profile);
        // Log to engine logs
        await logEngineEvent("riskEngine", "risk_profile_updated", {
            userId,
            riskLevel,
            trustScore,
            riskFactors,
        });
    });
}
/**
 * Calculate quality score based on profile completeness
 */
function calculateQualityScore(userData) {
    let score = 0;
    // Base points for having profile
    score += 20;
    // Name
    if (userData?.name)
        score += 10;
    // Bio
    if (userData?.bio && userData.bio.length > 20)
        score += 10;
    // Photos
    const photoCount = userData?.photos?.length || 0;
    score += Math.min(photoCount * 10, 30); // Max 30 points for photos
    // Verified
    if (userData?.verification?.status === "approved")
        score += 20;
    // Location
    if (userData?.location)
        score += 10;
    return Math.min(score, 100);
}
/**
 * Calculate trust score
 * Callable function
 */
exports.calculateTrustScoreCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { userId } = request.data;
    const targetUserId = userId || uid;
    try {
        const trustScore = await calculateTrustScore(targetUserId);
        return { success: true, trustScore };
    }
    catch (error) {
        console.error("Error calculating trust score:", error);
        throw new https_1.HttpsError("internal", `Failed to calculate trust score: ${error.message}`);
    }
});
/**
 * Calculate trust score (0-100)
 */
async function calculateTrustScore(userId) {
    let score = 50; // Start neutral
    try {
        const userDoc = await db.collection("users").doc(userId).get();
        if (!userDoc.exists)
            return 0;
        const userData = userDoc.data();
        // Account age bonus (max +15)
        const createdAt = userData?.createdAt;
        if (createdAt) {
            const accountAgeWeeks = Math.floor((Date.now() - createdAt.toMillis()) / (7 * 24 * 60 * 60 * 1000));
            score += Math.min(15, accountAgeWeeks);
        }
        // Verification bonus
        if (userData?.verification?.status === "approved") {
            score += 20;
        }
        // Transaction history
        const txSnapshot = await db
            .collection("transactions")
            .where("uid", "==", userId)
            .limit(100)
            .get();
        const txBonus = Math.min(10, txSnapshot.size);
        score += txBonus;
        // Abuse reports penalty
        const reportsSnapshot = await db
            .collection("moderationFlags")
            .where("targetUserId", "==", userId)
            .get();
        const reportPenalty = reportsSnapshot.size * 10;
        score -= reportPenalty;
        // Trust score from loyalty
        const trustDoc = await db
            .collection("users")
            .doc(userId)
            .collection("trust")
            .doc("score")
            .get();
        if (trustDoc.exists) {
            const trustData = trustDoc.data();
            const strikes = trustData?.strikes || 0;
            const warnings = trustData?.warnings || 0;
            score -= strikes * 15;
            score -= warnings * 5;
        }
        // Quality score influence
        const qualityScore = calculateQualityScore(userData);
        score += Math.floor((qualityScore - 50) / 5); // +/- based on quality
        // Clamp to 0-100
        return Math.max(0, Math.min(100, score));
    }
    catch (error) {
        console.error(`Error calculating trust score for ${userId}:`, error);
        return 50; // Return neutral on error
    }
}
/**
 * Ban user callable (admin only)
 */
exports.banUserCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Check if user is admin
    const userDoc = await db.collection("users").doc(uid).get();
    const roles = userDoc.data()?.roles || {};
    if (!roles.admin) {
        throw new https_1.HttpsError("permission-denied", "Only admins can ban users");
    }
    // Validate input
    const validationResult = BanUserSchema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { targetUserId, reason, durationDays } = validationResult.data;
    try {
        const bannedUntil = durationDays
            ? firestore_2.Timestamp.fromMillis(Date.now() + durationDays * 24 * 60 * 60 * 1000)
            : firestore_2.Timestamp.fromMillis(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000); // 100 years = permanent
        // Update risk profile
        const profileRef = db.collection("userRiskProfiles").doc(targetUserId);
        await profileRef.set({
            userId: targetUserId,
            isBanned: true,
            bannedUntil,
            banReason: reason,
            riskLevel: RiskLevel.CRITICAL,
            lastUpdated: firestore_2.FieldValue.serverTimestamp(),
        }, { merge: true });
        // Update user document
        await db.collection("users").doc(targetUserId).update({
            banned: true,
            bannedAt: firestore_2.FieldValue.serverTimestamp(),
            bannedUntil,
            bannedReason: reason,
            bannedBy: uid,
        });
        // Disable Firebase Auth account (shadowban behavior)
        try {
            await (0, auth_1.getAuth)().updateUser(targetUserId, { disabled: true });
        }
        catch (error) {
            console.error(`Failed to disable auth for ${targetUserId}:`, error);
        }
        // Log to engine logs
        await logEngineEvent("riskEngine", "user_banned", {
            adminId: uid,
            targetUserId,
            reason,
            durationDays,
        });
        return { success: true };
    }
    catch (error) {
        console.error("Error banning user:", error);
        throw new https_1.HttpsError("internal", `Failed to ban user: ${error.message}`);
    }
});
/**
 * Check if user is restricted
 */
async function isUserRestricted(userId) {
    const profileDoc = await db.collection("userRiskProfiles").doc(userId).get();
    if (!profileDoc.exists) {
        return { isBanned: false, isHighRisk: false };
    }
    const profile = profileDoc.data();
    // Check if ban has expired
    const isBanned = profile.isBanned && profile.bannedUntil && profile.bannedUntil.toMillis() > Date.now();
    const isHighRisk = profile.riskLevel === RiskLevel.HIGH || profile.riskLevel === RiskLevel.CRITICAL;
    return {
        isBanned,
        isHighRisk,
        bannedUntil: profile.bannedUntil,
        banReason: profile.banReason,
        riskLevel: profile.riskLevel,
    };
}
/**
 * Helper: Log engine event
 */
async function logEngineEvent(engine, action, metadata) {
    const today = new Date().toISOString().split("T")[0];
    const logRef = db
        .collection("engineLogs")
        .doc(engine)
        .collection(today)
        .doc();
    await logRef.set({
        action,
        metadata,
        timestamp: firestore_2.FieldValue.serverTimestamp(),
    });
}
//# sourceMappingURL=riskEngine.js.map