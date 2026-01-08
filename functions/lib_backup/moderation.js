"use strict";
/**
 * Moderation Functions (Phase 8)
 *
 * Callable functions:
 * - queueMessageForScan: Auto-scan message content for violations
 * - resolveFlag: Moderator resolves a flagged item
 * - banUser: Admin permanently bans a user
 * - reportUser: User reports another user/content
 *
 * Firestore collections:
 * - moderationFlags/{flagId} - Queue of items to review
 * - users/{uid}/trust/{docId} - Trust score and strike history
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.banUserCallable = exports.resolveFlagCallable = exports.reportUserCallable = exports.queueMessageForScanCallable = exports.ModerationAction = exports.FlagStatus = exports.FlagType = void 0;
exports.getUserTrustScore = getUserTrustScore;
exports.isUserRestricted = isUserRestricted;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
// import { logAnalyticsEvent } from "./init";
const analytics_1 = require("./analytics");
// Helper wrapper for analytics logging
const logAnalyticsEvent = (eventName, properties) => {
    return (0, analytics_1.logServerEvent)(eventName, properties, properties.userId || "system");
};
const heuristics_1 = require("./heuristics");
const db = (0, firestore_1.getFirestore)();
/**
 * Moderation flag types
 */
var FlagType;
(function (FlagType) {
    FlagType["MESSAGE"] = "message";
    FlagType["PROFILE"] = "profile";
    FlagType["POST"] = "post";
    FlagType["MEETING"] = "meeting";
    FlagType["USER_REPORT"] = "user_report";
})(FlagType || (exports.FlagType = FlagType = {}));
/**
 * Flag status
 */
var FlagStatus;
(function (FlagStatus) {
    FlagStatus["PENDING"] = "pending";
    FlagStatus["REVIEWING"] = "reviewing";
    FlagStatus["RESOLVED"] = "resolved";
    FlagStatus["DISMISSED"] = "dismissed";
})(FlagStatus || (exports.FlagStatus = FlagStatus = {}));
/**
 * Resolution action
 */
var ModerationAction;
(function (ModerationAction) {
    ModerationAction["DISMISS"] = "dismiss";
    ModerationAction["WARN"] = "warn";
    ModerationAction["STRIKE"] = "strike";
    ModerationAction["SUSPEND"] = "suspend";
    ModerationAction["BAN"] = "ban";
    ModerationAction["DELETE_CONTENT"] = "delete_content";
})(ModerationAction || (exports.ModerationAction = ModerationAction = {}));
/**
 * Auto-scan message content and queue for moderation if risky
 */
exports.queueMessageForScanCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { messageId, chatId, content } = request.data;
    if (!messageId || !chatId || !content) {
        throw new https_1.HttpsError("invalid-argument", "Missing required fields");
    }
    try {
        // Scan content with heuristics
        const scanResult = (0, heuristics_1.scanContent)(content);
        // If flagged, create moderation flag
        if (scanResult.shouldFlag) {
            const flagRef = db.collection("moderationFlags").doc();
            const flag = {
                id: flagRef.id,
                type: FlagType.MESSAGE,
                status: FlagStatus.PENDING,
                targetUserId: uid,
                contentId: messageId,
                content,
                riskLevel: scanResult.overallRisk,
                reasons: scanResult.reasons,
                autoFlagged: true,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            };
            await flagRef.set(flag);
            // Log analytics
            logAnalyticsEvent("moderation_flag_created", {
                userId: uid,
                flagType: FlagType.MESSAGE,
                riskLevel: scanResult.overallRisk,
                autoFlagged: true,
            });
            // If CRITICAL, immediately warn user
            if (scanResult.overallRisk === heuristics_1.RiskLevel.CRITICAL) {
                await issueWarning(uid, scanResult.reasons.join("; "));
            }
            return {
                flagged: true,
                flagId: flagRef.id,
                riskLevel: scanResult.overallRisk,
                reasons: scanResult.reasons,
            };
        }
        return {
            flagged: false,
            riskLevel: scanResult.overallRisk,
        };
    }
    catch (error) {
        console.error("Error scanning message:", error);
        throw new https_1.HttpsError("internal", "Failed to scan message");
    }
});
/**
 * User reports another user/content
 */
exports.reportUserCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { targetUserId, reason, contentId, contentType } = request.data;
    if (!targetUserId || !reason) {
        throw new https_1.HttpsError("invalid-argument", "Missing required fields");
    }
    try {
        const flagRef = db.collection("moderationFlags").doc();
        const flag = {
            id: flagRef.id,
            type: FlagType.USER_REPORT,
            status: FlagStatus.PENDING,
            targetUserId,
            reporterId: uid,
            contentId,
            riskLevel: heuristics_1.RiskLevel.MEDIUM, // User reports default to medium
            reasons: [reason],
            autoFlagged: false,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        };
        await flagRef.set(flag);
        // Increment reported count on target user
        const trustRef = db.collection("users").doc(targetUserId).collection("trust").doc("score");
        await trustRef.set({
            userId: targetUserId,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        logAnalyticsEvent("user_reported", {
            reporterId: uid,
            targetUserId,
            reason,
        });
        return { success: true, flagId: flagRef.id };
    }
    catch (error) {
        console.error("Error reporting user:", error);
        throw new https_1.HttpsError("internal", "Failed to report user");
    }
});
/**
 * Moderator resolves a flag
 */
exports.resolveFlagCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Check if user is moderator or admin
    const userDoc = await db.collection("users").doc(uid).get();
    const roles = userDoc.data()?.roles || {};
    if (!roles.moderator && !roles.admin) {
        throw new https_1.HttpsError("permission-denied", "Only moderators can resolve flags");
    }
    const { flagId, action, notes } = request.data;
    if (!flagId || !action) {
        throw new https_1.HttpsError("invalid-argument", "Missing required fields");
    }
    try {
        const flagRef = db.collection("moderationFlags").doc(flagId);
        const flagDoc = await flagRef.get();
        if (!flagDoc.exists) {
            throw new https_1.HttpsError("not-found", "Flag not found");
        }
        const flag = flagDoc.data();
        // Update flag status
        await flagRef.update({
            status: FlagStatus.RESOLVED,
            reviewedAt: firestore_1.FieldValue.serverTimestamp(),
            reviewedBy: uid,
            resolution: action,
            resolutionNotes: notes || "",
        });
        // Take action on user
        const targetUserId = flag.targetUserId;
        switch (action) {
            case ModerationAction.WARN:
                await issueWarning(targetUserId, notes || "Content violation");
                break;
            case ModerationAction.STRIKE:
                await issueStrike(targetUserId, notes || "Content violation");
                break;
            case ModerationAction.SUSPEND:
                await suspendUser(targetUserId, 7, notes || "Suspended for violations");
                break;
            case ModerationAction.BAN:
                await banUser(targetUserId, notes || "Permanent ban for violations");
                break;
            case ModerationAction.DELETE_CONTENT:
                // Delete the content if applicable
                if (flag.contentId && flag.type === FlagType.MESSAGE) {
                    // Note: Would need chatId to delete message properly
                    // For now, just mark as deleted
                }
                break;
            case ModerationAction.DISMISS:
                // No action needed
                break;
        }
        logAnalyticsEvent("flag_resolved", {
            moderatorId: uid,
            flagId,
            action,
            targetUserId,
        });
        return { success: true };
    }
    catch (error) {
        console.error("Error resolving flag:", error);
        throw new https_1.HttpsError("internal", "Failed to resolve flag");
    }
});
/**
 * Admin permanently bans a user
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
    const { targetUserId, reason } = request.data;
    if (!targetUserId || !reason) {
        throw new https_1.HttpsError("invalid-argument", "Missing required fields");
    }
    try {
        await banUser(targetUserId, reason);
        logAnalyticsEvent("user_banned", {
            adminId: uid,
            targetUserId,
            reason,
        });
        return { success: true };
    }
    catch (error) {
        console.error("Error banning user:", error);
        throw new https_1.HttpsError("internal", "Failed to ban user");
    }
});
/**
 * Helper: Issue warning to user
 */
async function issueWarning(userId, reason) {
    const trustRef = db.collection("users").doc(userId).collection("trust").doc("score");
    await db.runTransaction(async (tx) => {
        const trustDoc = await tx.get(trustRef);
        const trust = trustDoc.data() || { warnings: 0, strikes: 0, trustScore: 50 };
        const newWarnings = (trust.warnings || 0) + 1;
        tx.set(trustRef, {
            userId,
            warnings: newWarnings,
            lastWarningAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
    // Could send notification here
    console.log(`Warning issued to user ${userId}: ${reason}`);
}
/**
 * Helper: Issue strike to user
 */
async function issueStrike(userId, reason) {
    const trustRef = db.collection("users").doc(userId).collection("trust").doc("score");
    await db.runTransaction(async (tx) => {
        const trustDoc = await tx.get(trustRef);
        const trust = trustDoc.data() || { warnings: 0, strikes: 0, trustScore: 50 };
        const newStrikes = (trust.strikes || 0) + 1;
        const newTrustScore = Math.max(0, (trust.trustScore || 50) - 15); // -15 per strike
        // 3 strikes = auto-ban
        if (newStrikes >= 3) {
            tx.set(trustRef, {
                userId,
                strikes: newStrikes,
                lastStrikeAt: firestore_1.FieldValue.serverTimestamp(),
                trustScore: 0,
                isBanned: true,
                bannedAt: firestore_1.FieldValue.serverTimestamp(),
                bannedReason: "3 strikes - automatic ban",
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
        else {
            tx.set(trustRef, {
                userId,
                strikes: newStrikes,
                lastStrikeAt: firestore_1.FieldValue.serverTimestamp(),
                trustScore: newTrustScore,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
    });
    console.log(`Strike issued to user ${userId}: ${reason}`);
}
/**
 * Helper: Suspend user for X days
 */
async function suspendUser(userId, days, reason) {
    const trustRef = db.collection("users").doc(userId).collection("trust").doc("score");
    const userRef = db.collection("users").doc(userId);
    await db.runTransaction(async (tx) => {
        const suspendUntil = firestore_1.Timestamp.fromMillis(Date.now() + days * 24 * 60 * 60 * 1000);
        tx.update(userRef, {
            suspended: true,
            suspendedUntil: suspendUntil,
            suspendedReason: reason,
        });
        tx.set(trustRef, {
            userId,
            trustScore: firestore_1.FieldValue.increment(-10),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
    console.log(`User ${userId} suspended for ${days} days: ${reason}`);
}
/**
 * Helper: Permanently ban user
 */
async function banUser(userId, reason) {
    const trustRef = db.collection("users").doc(userId).collection("trust").doc("score");
    const userRef = db.collection("users").doc(userId);
    await db.runTransaction(async (tx) => {
        tx.update(userRef, {
            banned: true,
            bannedAt: firestore_1.FieldValue.serverTimestamp(),
            bannedReason: reason,
        });
        tx.set(trustRef, {
            userId,
            trustScore: 0,
            isBanned: true,
            bannedAt: firestore_1.FieldValue.serverTimestamp(),
            bannedReason: reason,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        // Disable Firebase Auth account
        try {
            await (0, auth_1.getAuth)().updateUser(userId, { disabled: true });
        }
        catch (error) {
            console.error(`Failed to disable auth for ${userId}:`, error);
        }
    });
    console.log(`User ${userId} permanently banned: ${reason}`);
}
/**
 * Get trust score for a user (helper for other functions)
 */
async function getUserTrustScore(userId) {
    const trustRef = db.collection("users").doc(userId).collection("trust").doc("score");
    const trustDoc = await trustRef.get();
    if (!trustDoc.exists) {
        // New user, default trust score
        return 50;
    }
    const trust = trustDoc.data();
    return trust.trustScore || 50;
}
/**
 * Check if user is banned or suspended
 */
async function isUserRestricted(userId) {
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();
    if (!userData) {
        return { banned: false, suspended: false };
    }
    const banned = userData.banned === true;
    const suspended = userData.suspended === true && userData.suspendedUntil?.toMillis() > Date.now();
    return {
        banned,
        suspended,
        reason: banned ? userData.bannedReason : (suspended ? userData.suspendedReason : undefined),
    };
}
//# sourceMappingURL=moderation.js.map